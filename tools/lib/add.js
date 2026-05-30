// /sig:add — capture-and-route helpers. Slice 1 (M4.5.E2.S1) implements the
// hardened hot path: write to .planning/FUTURE-IDEAS.md only.
//
// Design constraints (from .planning/M4.5.E2-PLAN.md § Slice 1):
//   - Verbatim capture — no LLM rewrite, no smart-quoting, no normalization.
//   - Atomic write: read → build → write-to-temp → fs.rename. Never appendFile.
//   - Lock file with 30s TTL — defends against silent corruption on concurrent
//     runs (rare under solo-dev but the failure mode is invisible).
//   - Sensitive-data regex scrub — surface hits to the caller; never auto-redact.
//   - Footer rewrite: every successful write bumps `*Last updated: YYYY-MM-DD*`.
//   - Body length soft cap at 4000 chars — warn, never hard-fail.
//
// Slices 2-5 will add: --question / --milestone flag routing (S2), naked-
// invocation interview + heuristic single-key overrides (S3), first-run
// onboarding warning + gate_strictness honoring (S4), /sig:plan FUTURE-IDEAS
// review step (S5). This module is the substrate for all of them.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import {
  acquireLock as fileAcquireLock,
  releaseLock as fileReleaseLock,
} from './file-lock.js';

// Re-export atomicWrite so existing consumers (tests/add.test.js, future
// callers) keep working while atomic-write.js is the canonical implementation
// site.
export { atomicWrite };

// --- Constants ---

export const BODY_LENGTH_SOFT_CAP = 4000;
// /sig:add holds the lock across a sensitive-data prompt that can sit open
// waiting for user input, so 30s is the right TTL here. state.js writes use
// the file-lock default (5s).
const LOCK_TTL_MS = 30_000;
const LOCK_FILE = '.planning/.add.lock';
const FUTURE_IDEAS = '.planning/FUTURE-IDEAS.md';

// Sensitive-data detectors. The intent is detection, not prevention — the
// caller decides whether to keep, abort, or scrub manually. Patterns are
// deliberately conservative (low false-positive rate); they don't try to be
// exhaustive. The first-run onboarding warning (S4) covers the residual.
const SENSITIVE_PATTERNS = [
  { type: 'aws-key', re: /AKIA[0-9A-Z]{16}/g },
  { type: 'github-token', re: /ghp_[a-zA-Z0-9]{36,}/g },
  { type: 'bearer-token', re: /Bearer\s+[a-zA-Z0-9._-]{8,}/g },
  // 40-char hex blob — likely SHA-1, private key fragment, or similar. Use a
  // boundary on both sides to avoid hitting inside longer alphanumeric runs.
  { type: 'hex-blob-40', re: /\b[a-f0-9]{40}\b/gi },
];

// --- Pure helpers ---

/**
 * Parse the raw `$ARGUMENTS` string a slash command receives into a normalized
 * shape. Slice 1 supports only the bare-body form (`/sig:add "idea text"`);
 * S2 will extend this to handle `--question`, `--milestone`, `--file`.
 *
 * @param {string} argsString
 * @returns {{body: string, flags: Record<string, string|boolean>}}
 */
export function parseInput(argsString) {
  if (typeof argsString !== 'string') return { body: '', flags: {} };
  return { body: argsString.trim(), flags: {} };
}

/**
 * Scan a string for known sensitive-data patterns. Returns the list of hits
 * and the original body verbatim. The caller decides what to do — auto-
 * redacting silently is explicitly forbidden (see plan anti-rationalization
 * table; loss of fidelity is worse than the false-positive prompt cost).
 *
 * @param {string} body
 * @returns {{hits: Array<{type: string, match: string, index: number}>, body: string}}
 */
export function scrubSensitive(body) {
  const hits = [];
  for (const { type, re } of SENSITIVE_PATTERNS) {
    // Reset stateful regex (g flag) for each call.
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(body)) !== null) {
      hits.push({ type, match: m[0], index: m.index });
    }
  }
  return { hits, body };
}

/**
 * Soft-cap body length. Returns the cap-state and length; the caller may
 * prompt-and-continue or prompt-and-abort. No hard cap — long bodies are
 * ugly, not dangerous.
 *
 * @param {string} body
 * @returns {{tooLong: boolean, length: number}}
 */
export function checkBodyLength(body) {
  const length = (body ?? '').length;
  return { tooLong: length > BODY_LENGTH_SOFT_CAP, length };
}

/**
 * Build the sentence-cased heading text from the first ~6 words of the body.
 * Cap at 60 chars to avoid wall-of-title in the rendered markdown.
 */
function deriveHeading(body) {
  const first = (body ?? '').trim().split(/\s+/).slice(0, 6).join(' ');
  const truncated = first.length > 60 ? first.slice(0, 57).trimEnd() + '...' : first;
  // Sentence case: capitalize the first character, preserve the rest verbatim.
  // Title case would degrade acronyms ("FOO" → "Foo") — keep it readable.
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
}

/**
 * Render a FUTURE-IDEAS.md entry block from the inputs. Heading, dated status
 * line, body verbatim, trailing --- separator. No frontmatter, no IDs (those
 * are anti-patterns per FUTURE-IDEAS spec line 528 and prior-art research §5).
 *
 * @param {{body: string, date: string, triggerContext?: string}} opts
 * @returns {string}
 */
export function buildFutureIdeasEntry({ body, date, triggerContext }) {
  const heading = deriveHeading(body);
  const trigger = triggerContext ? ` ${triggerContext.trim()}` : '';
  const statusLine = `**Status:** Logged ${date} via \`/sig:add\`.${trigger}`;
  return [
    `## ${heading}`,
    '',
    statusLine,
    '',
    body,
    '',
    '---',
  ].join('\n');
}

/**
 * Rewrite the trailing `*Last updated: YYYY-MM-DD*` footer to today's date.
 * If no such line is present, append one. Preserves all content above the
 * footer verbatim.
 *
 * @param {string} content
 * @param {string} date
 * @returns {string}
 */
export function rewriteFooter(content, date) {
  const re = /^\*Last updated:[^*]*\*\s*$/m;
  if (re.test(content)) {
    return content.replace(re, `*Last updated: ${date}*`);
  }
  // No footer — append one. Ensure exactly one trailing newline.
  const trimmed = content.endsWith('\n') ? content : content + '\n';
  return `${trimmed}\n*Last updated: ${date}*\n`;
}

/**
 * Insert a new entry block above the `*Last updated:*` footer. If no footer
 * is present, append to the end of the file. Surrounds the entry with single
 * blank lines so the rendered markdown reads naturally.
 *
 * @param {string} content
 * @param {string} entry — full entry block (already includes its trailing ---)
 * @returns {string}
 */
export function insertAboveFooter(content, entry) {
  const lines = content.split('\n');
  const footerIdx = lines.findIndex((l) => /^\*Last updated:/.test(l));

  if (footerIdx === -1) {
    // No footer — append entry at end, ensuring one blank line above.
    const trimmed = content.replace(/\s+$/, '');
    return `${trimmed}\n\n${entry}\n`;
  }

  // Walk backward from the footer over blank lines to find the insertion
  // anchor. The new entry slots in just below the last non-blank content line
  // (which should be the prior `---` separator), with one blank line above
  // and below.
  let insertIdx = footerIdx;
  // Step back over the blank line(s) directly above the footer
  while (insertIdx > 0 && lines[insertIdx - 1].trim() === '') {
    insertIdx--;
  }

  // Build the inserted block: blank line, entry lines, blank line.
  const insertion = ['', ...entry.split('\n'), ''];
  const newLines = [
    ...lines.slice(0, insertIdx),
    ...insertion,
    ...lines.slice(insertIdx),
  ];
  return newLines.join('\n');
}

// --- I/O primitives ---

/**
 * Acquire the `.planning/.add.lock` file. Thin wrapper around
 * `tools/lib/file-lock.js` that pins the path, TTL, and user-facing label
 * for /sig:add specifically.
 *
 * @param {string} baseDir
 * @returns {Promise<{path: string, released: () => Promise<void>}>}
 */
export async function acquireLock(baseDir) {
  return fileAcquireLock(join(baseDir, LOCK_FILE), {
    ttlMs: LOCK_TTL_MS,
    label: '/sig:add',
  });
}

/**
 * Release the `.planning/.add.lock` file. Idempotent.
 *
 * @param {string} baseDir
 */
export async function releaseLock(baseDir) {
  return fileReleaseLock(join(baseDir, LOCK_FILE));
}

// --- Orchestrator ---

/**
 * Generalized, destination-agnostic capture spine. All `/sig:add` destinations
 * (FUTURE-IDEAS, OPEN-QUESTIONS, milestone holding section, `--file`) route
 * through this one function so the safety substrate — scrub, body-length,
 * lock, atomic write — fires for EVERY destination, not just FUTURE-IDEAS
 * (closes R7). The destination-specific bits are supplied by the caller as
 * `buildEntry` and `insert` closures.
 *
 * Ordering is identical to the original `captureToFutureIdeas`: scrub and
 * body-length run BEFORE the lock so a declined capture never touches the lock
 * file; the lock is held only across read → build → insert → atomicWrite and
 * is always released in a finally.
 *
 * @param {string} baseDir — project root (where .planning/ lives)
 * @param {object} opts
 * @param {string} opts.relPath — destination path relative to baseDir
 * @param {(args: {body: string, date: string, triggerContext?: string}) => string} opts.buildEntry
 *   — renders the entry block for this destination.
 * @param {(content: string, entry: string, date: string) => string} opts.insert
 *   — splices `entry` into the existing file `content`, returning the new content.
 * @param {string} opts.body — raw user input (verbatim, do not modify)
 * @param {string} opts.today — ISO date YYYY-MM-DD (injected for testability)
 * @param {string} [opts.triggerContext] — phase/milestone context if mid-flow
 * @param {(hits: Array) => Promise<'keep'|'abort'>} opts.sensitivePrompt
 * @param {(length: number) => Promise<'keep'|'abort'>} [opts.bodyLengthPrompt]
 * @param {string} [opts.missingFileError] — error message thrown when relPath
 *   doesn't exist; defaults to a sensible message naming relPath.
 *
 * @returns {Promise<{written: boolean, path?: string, line?: number, aborted?: string}>}
 */
export async function captureToDestination(baseDir, opts) {
  const {
    relPath,
    buildEntry,
    insert,
    body,
    today,
    triggerContext,
    sensitivePrompt,
    bodyLengthPrompt,
    missingFileError,
  } = opts;
  const targetPath = join(baseDir, relPath);

  // Pre-flight — fail loud if the destination doesn't exist. The caller may
  // supply a destination-specific message; otherwise default to one naming the
  // relative path.
  if (!existsSync(targetPath)) {
    throw new Error(
      missingFileError ?? `Cannot capture: ${relPath} not found at ${targetPath}.`
    );
  }

  // Sensitive-data check. Prompt the user if hits are found; abort silently
  // if they decline. This runs BEFORE lock acquisition so a declined capture
  // never even touches the lock file.
  const scrub = scrubSensitive(body);
  if (scrub.hits.length > 0) {
    const decision = await sensitivePrompt(scrub.hits);
    if (decision !== 'keep') {
      return { written: false, aborted: 'sensitive-data' };
    }
  }

  // Body-length check. Same prompt-or-abort pattern.
  const lengthCheck = checkBodyLength(body);
  if (lengthCheck.tooLong) {
    if (!bodyLengthPrompt) {
      // No prompt provided — accept by default (caller didn't wire the prompt,
      // probably running headless). Long-but-OK is the dominant case.
    } else {
      const decision = await bodyLengthPrompt(lengthCheck.length);
      if (decision !== 'keep') {
        return { written: false, aborted: 'body-length' };
      }
    }
  }

  // Acquire lock. Released in finally.
  const lock = await acquireLock(baseDir);
  try {
    const existing = await readFile(targetPath, 'utf-8');
    const entry = buildEntry({ body, date: today, triggerContext });
    const newContent = insert(existing, entry, today);
    await atomicWrite(targetPath, newContent);

    // Compute the 1-indexed line number of the new entry generically: find the
    // entry's first line in the written content. -1 when not found (e.g. the
    // insert closure transformed the heading), which the caller may surface.
    const firstEntryLine = entry.split('\n')[0];
    const lineIdx = newContent.split('\n').findIndex((l) => l === firstEntryLine);
    const line = lineIdx >= 0 ? lineIdx + 1 : -1;

    return { written: true, path: targetPath, line };
  } finally {
    await lock.released();
  }
}

/**
 * Slice 1 entry point: capture `body` to .planning/FUTURE-IDEAS.md with all
 * safety primitives applied. Returns a status object the caller surfaces to
 * the user via the slash command's success message.
 *
 * Delegates to `captureToDestination` (S2.t1): the FUTURE-IDEAS-specific entry
 * template and footer-rewrite-on-insert behavior are encapsulated in the
 * closures passed below; the scrub + body-length + lock + atomic-write spine
 * is shared with every other destination.
 *
 * @param {string} baseDir — project root (where .planning/ lives)
 * @param {object} opts
 * @param {string} opts.body — raw user input (verbatim, do not modify)
 * @param {string} opts.today — ISO date YYYY-MM-DD (injected for testability)
 * @param {string} [opts.triggerContext] — phase/milestone context if mid-flow
 * @param {(hits: Array) => Promise<'keep'|'abort'>} opts.sensitivePrompt
 * @param {(length: number) => Promise<'keep'|'abort'>} [opts.bodyLengthPrompt]
 *
 * @returns {Promise<{written: boolean, path?: string, line?: number, aborted?: string}>}
 */
export async function captureToFutureIdeas(baseDir, opts) {
  const { body, today, triggerContext, sensitivePrompt, bodyLengthPrompt } = opts;

  return captureToDestination(baseDir, {
    relPath: FUTURE_IDEAS,
    buildEntry: ({ body, date, triggerContext }) =>
      buildFutureIdeasEntry({ body, date, triggerContext }),
    // Footer rewrite stays FUTURE-IDEAS-specific — encapsulated here so the
    // shared spine never assumes a footer exists.
    insert: (content, entry, date) =>
      rewriteFooter(insertAboveFooter(content, entry), date),
    // Preserve the exact error text Slice 1 threw (existing test asserts
    // /sig:init/ appears).
    missingFileError:
      `Cannot capture: .planning/FUTURE-IDEAS.md not found at ${join(baseDir, FUTURE_IDEAS)}. ` +
      `Run \`/sig:init\` first if this is an existing codebase, or \`/sig:new-project\` for a fresh project.`,
    body,
    today,
    triggerContext,
    sensitivePrompt,
    bodyLengthPrompt,
  });
}
