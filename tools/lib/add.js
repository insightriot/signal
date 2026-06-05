// /sig:add — capture-and-route helpers. Slice 1 (M4.5.E2.S1) implements the
// hardened hot path: write to .planning/FUTURE-IDEAS.md only.
//
// Design constraints (from .planning/archive/M4.5/E2/M4.5.E2-PLAN.md § Slice 1):
//   - Verbatim capture — no LLM rewrite, no smart-quoting, no normalization.
//   - Atomic write: read → build → write-to-temp → fs.rename. Never appendFile.
//   - Lock file with 30s TTL — defends against silent corruption on concurrent
//     runs (rare under solo-dev but the failure mode is invisible).
//   - Sensitive-data regex scrub — surface hits to the caller; never auto-redact.
//   - Footer rewrite: every successful write bumps `*Last updated: YYYY-MM-DD*`.
//   - Body length soft cap at 4000 chars — warn, never hard-fail.
//
// Later slices build on this substrate: --question / --milestone flag routing
// (S2), the naked-invocation interview (S3 — one open-ended question → FUTURE-
// IDEAS; NO destination heuristics, those were cut per Decision 5), first-run
// onboarding warning + gate_strictness honoring (S4), and the /sig:plan
// FUTURE-IDEAS review step (S5). Routing is explicit flags OR the default
// FUTURE-IDEAS — nothing in between; there is no `suggestDestination`-style
// guesser (FR5.4, guarded by the export-surface test in tests/add.test.js).

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve, sep, basename } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import {
  acquireLock as fileAcquireLock,
  releaseLock as fileReleaseLock,
} from './file-lock.js';
import { currentMilestone } from './milestones.js';

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
const OPEN_QUESTIONS = '.planning/OPEN-QUESTIONS.md';
// One-time first-run onboarding flag (FR6.1). Lives inside .planning/, so it is
// git-tracked by convention like everything else there — no special .gitignore
// rule needed. Its presence means "this repo has already seen the onboarding
// note"; the note never shows again.
const ONBOARDED_FLAG = '.planning/.add-onboarded';

// The h2 heading under which `--milestone` captures are appended. Captures
// land ONLY here — never in the structured plan body — so /sig:add can never
// mangle a hand-authored milestone plan (FR2 / R5).
const MILESTONE_HOLDING_SECTION = 'Captured via /sig:add';

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

// A token after `--milestone` is treated as the milestone id N ONLY if it is a
// bare integer or single-decimal number; otherwise `--milestone` is the
// boolean (current-milestone) form and the token belongs to the body.
const MILESTONE_N_RE = /^\d+(\.\d+)?$/;

/**
 * True when a value is null/undefined/non-string/empty/whitespace-only.
 *
 * Shared by the S3 naked-invocation flow (commands/add.md Step 2): a blank
 * `parseInput($ARGUMENTS).body` triggers the one-question "What's the idea?"
 * interview, and a blank ANSWER aborts the interview BEFORE any capture call —
 * so no file write and no lock (FR5.2). The lock is acquired only inside the
 * capture spine (`captureToDestination`), so a naked invocation the user
 * abandons never creates `.planning/.add.lock`. Pure predicate, no I/O, so the
 * command and the tests share exactly one definition of "blank".
 *
 * @param {unknown} s
 * @returns {boolean}
 */
export function isBlank(s) {
  return typeof s !== 'string' || s.trim() === '';
}

// --- S4.t1: first-run onboarding + brownfield/greenfield detection (FR6) ---

/**
 * Absolute path to the one-time onboarding flag file (FR6.1).
 *
 * @param {string} baseDir — project root (where .planning/ lives)
 * @returns {string}
 */
export function onboardedFlagPath(baseDir) {
  return join(baseDir, ONBOARDED_FLAG);
}

/**
 * True when this repo has already shown the first-run onboarding note (the flag
 * file exists). Sync, matching the existsSync style used elsewhere in this
 * module.
 *
 * @param {string} baseDir
 * @returns {boolean}
 */
export function isOnboarded(baseDir) {
  return existsSync(onboardedFlagPath(baseDir));
}

/**
 * Persist the onboarding flag so the note never shows again. Idempotent — a
 * second call just rewrites the timestamp line. Content is a single dated line;
 * the file's mere existence is the signal, the line is for a curious reader.
 *
 * @param {string} baseDir
 * @returns {Promise<void>}
 */
export async function markOnboarded(baseDir) {
  const stamp = `Onboarded to /sig:add on ${new Date().toISOString()}\n`;
  await writeFile(onboardedFlagPath(baseDir), stamp, 'utf-8');
}

/**
 * Resolve the SHAPE of the first-run onboarding note from `gate_strictness`
 * (Q1). This is the ONLY thing gate_strictness modulates for /sig:add — it adds
 * NO destination-confirmation prompt at any level (Q1 locked + user-
 * reconfirmed). Quoted/flagged capture stays instant regardless (Decision 4).
 *
 *   - `strict` → `'strict'`  — a BLOCKING note shown once (continue/abort).
 *   - `light`  → `'fyi'`     — a one-line, non-blocking FYI shown once.
 *   - `off`    → `'silent'`  — no note at all.
 *   - anything else (null/absent profile, missing rigor_overrides, unknown
 *     value) → `'fyi'`       — the light default (PROFILE.md absent ⇒ light).
 *
 * Pure: takes the already-read profile object (or null) so it's unit-testable
 * without touching the filesystem.
 *
 * @param {{rigor_overrides?: {gate_strictness?: string}}|null|undefined} profileOrNull
 * @returns {'strict'|'fyi'|'silent'}
 */
export function resolveOnboardingMode(profileOrNull) {
  const strictness = profileOrNull?.rigor_overrides?.gate_strictness;
  if (strictness === 'strict') return 'strict';
  if (strictness === 'off') return 'silent';
  // 'light', null/absent profile, missing rigor_overrides, or any unknown
  // value all collapse to the light FYI default.
  return 'fyi';
}

// Names that are NOT evidence of a real source tree on their own — dotfiles
// (.git, .gitignore, …) and Signal's own scaffolding. Used by detectProjectKind
// to decide "is there actual code/content here, or is this a bare dir?".
const NON_SOURCE_ENTRIES = new Set(['.planning', 'node_modules']);

/**
 * Classify a directory as `'brownfield'` or `'greenfield'` for the
 * missing-`.planning/` error (FR6.2). The heuristic is deliberately simple — it
 * only drives WHICH command the error suggests, so a wrong guess costs the user
 * one wrong command name, not data:
 *
 *   brownfield = `.git/` exists AND at least one non-dotfile, non-scaffolding
 *                entry is present (i.e. there's real source to scan).
 *   greenfield = everything else (no `.git/`, or an empty/just-initialized dir).
 *
 * Dotfiles (anything starting with `.`) and `node_modules`/`.planning` don't
 * count as "source" — a freshly `git init`-ed empty dir is greenfield.
 *
 * @param {string} baseDir — project root
 * @returns {'brownfield'|'greenfield'}
 */
export function detectProjectKind(baseDir) {
  if (!existsSync(join(baseDir, '.git'))) return 'greenfield';
  let entries;
  try {
    entries = readdirSync(baseDir);
  } catch {
    return 'greenfield';
  }
  const hasSource = entries.some(
    (name) => !name.startsWith('.') && !NON_SOURCE_ENTRIES.has(name)
  );
  return hasSource ? 'brownfield' : 'greenfield';
}

/**
 * Compose the missing-`.planning/` error message, branching on
 * `detectProjectKind` (FR6.2). Brownfield repos are told to run `/sig:init`
 * (scan the existing code); greenfield dirs are told to run `/sig:new-project`
 * (start fresh). Kept as its own helper so the command layer (commands/add.md)
 * can surface a sharp message without duplicating the detection logic, while
 * the capture functions keep their own generic throw unchanged.
 *
 * @param {string} baseDir — project root
 * @returns {string}
 */
export function buildMissingPlanningError(baseDir) {
  if (detectProjectKind(baseDir) === 'brownfield') {
    return (
      'No .planning/ found, but this looks like an existing codebase. ' +
      'Run `/sig:init` to scan it, then `/sig:add` will work.'
    );
  }
  return (
    'No .planning/ found and no project detected. ' +
    'Run `/sig:new-project` to start fresh.'
  );
}

/**
 * Parse the raw `$ARGUMENTS` string a slash command receives into a normalized
 * shape `{ body, flags }`.
 *
 * Bare-body form (`/sig:add "idea text"`) returns `{ body: <trimmed>, flags: {} }`
 * — the original Slice 1 behavior, preserved byte-for-byte (including internal
 * whitespace) when no recognized flag is present.
 *
 * S2 (this task) adds destination flags:
 *   - `--question` — boolean. Presence → `flags.question = true`.
 *   - `--milestone [N]` — `--milestone` alone → `flags.milestone = true`
 *     (current milestone); `--milestone 5` / `--milestone 4.5` → the N string
 *     (the N token is consumed). A non-numeric token after `--milestone` is the
 *     boolean form and stays in the body.
 *   - `--file <path>` — value flag. The token immediately after `--file` is the
 *     path and is consumed; everything else is body.
 *
 * The slash-command host strips surrounding quotes before we see `$ARGUMENTS`,
 * so this treats the input as a plain whitespace-separated token stream for
 * flag-scanning. The body is "the leftover tokens after flags + their consumed
 * values are removed", rejoined with single spaces. The verbatim-capture rule
 * still applies to the words themselves — we never smart-quote or normalize
 * them; we only split on whitespace to separate flags from body.
 *
 * @param {string} argsString
 * @returns {{body: string, flags: Record<string, string|boolean>}}
 */
export function parseInput(argsString) {
  if (typeof argsString !== 'string') return { body: '', flags: {} };

  // No recognized flag present → preserve the exact Slice 1 behavior (trim
  // only). This guarantees the internal-double-space case is untouched, since
  // token-split-and-rejoin would collapse runs of whitespace.
  if (!/(^|\s)--(question|milestone|file)(\s|$)/.test(argsString)) {
    return { body: argsString.trim(), flags: {} };
  }

  const tokens = argsString.trim().split(/\s+/);
  const flags = {};
  const bodyTokens = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '--question') {
      flags.question = true;
    } else if (token === '--milestone') {
      const next = tokens[i + 1];
      if (next !== undefined && MILESTONE_N_RE.test(next)) {
        flags.milestone = next;
        i++; // consume N
      } else {
        flags.milestone = true;
      }
    } else if (token === '--file') {
      const next = tokens[i + 1];
      // The token immediately after --file is always the path (consumed).
      flags.file = next;
      i++;
    } else {
      bodyTokens.push(token);
    }
  }

  return { body: bodyTokens.join(' '), flags };
}

/**
 * Classify which destination a parsed `flags` object selects, and enforce the
 * multi-destination guard (FR4 / risk R4). This is a PURE function with no I/O
 * so the command can call it BEFORE acquiring the lock or touching any file —
 * a conflicting-flags invocation must fail before any side effect.
 *
 * Returns a destination descriptor that S2.t4/t5/t6 consume:
 *   - `{ destination: 'future-ideas' }` — default (no destination flag).
 *   - `{ destination: 'open-questions' }` — `--question`.
 *   - `{ destination: 'milestone', milestoneArg }` — `--milestone`;
 *     `milestoneArg` is `null` for the current milestone (boolean form) or the
 *     N string for `--milestone N`.
 *   - `{ destination: 'file', path }` — `--file <path>`.
 *
 * @param {Record<string, string|boolean>} flags
 * @returns {{destination: string, milestoneArg?: string|null, path?: string}}
 * @throws {Error} when more than one destination flag is supplied.
 */
export function resolveDestination(flags = {}) {
  const present = [];
  if (flags.question) present.push('--question');
  if (flags.milestone) present.push('--milestone');
  if (flags.file) present.push('--file');

  if (present.length > 1) {
    throw new Error(
      `/sig:add accepts only one destination flag, but got: ${present.join(', ')}. Pick one.`
    );
  }

  if (flags.question) return { destination: 'open-questions' };
  if (flags.milestone) {
    return {
      destination: 'milestone',
      milestoneArg: flags.milestone === true ? null : flags.milestone,
    };
  }
  if (flags.file) return { destination: 'file', path: flags.file };
  return { destination: 'future-ideas' };
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

/**
 * Render an OPEN-QUESTIONS.md entry block. The OPEN-QUESTIONS shape differs from
 * FUTURE-IDEAS: heading, a `**Status:**` line, body verbatim, a `**Resolve by:**`
 * line, then a trailing `---` separator (matching the file's existing
 * Status/Watch-for/Resolve-by convention). The heading-derivation rule is shared
 * with FUTURE-IDEAS for consistency. Body is verbatim — no rewrite.
 *
 * @param {{body: string, date: string, triggerContext?: string}} opts
 * @returns {string}
 */
export function buildOpenQuestionsEntry({ body, date, triggerContext }) {
  const heading = deriveHeading(body);
  const trigger = triggerContext ? ` ${triggerContext.trim()}` : '';
  const statusLine = `**Status:** Open — logged ${date} via \`/sig:add\`.${trigger}`;
  return [
    `## ${heading}`,
    '',
    statusLine,
    '',
    body,
    '',
    '**Resolve by:** (unset — triage at next planning pass)',
    '',
    '---',
  ].join('\n');
}

/**
 * Append a new entry block at end-of-file. Unlike `insertAboveFooter`, this
 * makes no assumption about a footer — OPEN-QUESTIONS.md has none; its entries
 * just end with `---` separators. Pre-existing content up to its last non-
 * whitespace character is byte-identical: strip trailing whitespace, then add
 * one blank line + the entry + a single trailing newline. If the file already
 * ends with a `---` separator, the appended entry sits cleanly below it with one
 * blank line between.
 *
 * @param {string} content
 * @param {string} entry — full entry block (already includes its trailing ---)
 * @returns {string}
 */
export function insertAtEnd(content, entry) {
  const trimmed = content.replace(/\s+$/, '');
  return `${trimmed}\n\n${entry}\n`;
}

/**
 * Render a milestone holding-section entry block. Unlike FUTURE-IDEAS /
 * OPEN-QUESTIONS (whose entries are h2 sections), a milestone capture lives
 * UNDER the `## Captured via /sig:add` holding section, so it uses an `###`
 * (h3) heading. No `---` separator — entries stack under the one h2 section.
 * Body is verbatim — no rewrite.
 *
 * @param {{body: string, date: string, triggerContext?: string}} opts
 * @returns {string}
 */
export function buildMilestoneEntry({ body, date, triggerContext }) {
  const heading = deriveHeading(body);
  const trigger = triggerContext ? ` ${triggerContext.trim()}` : '';
  const capturedLine = `**Captured:** ${date} via \`/sig:add\`.${trigger}`;
  return [
    `### ${heading}`,
    '',
    capturedLine,
    '',
    body,
  ].join('\n');
}

// A trailing-footer line is a `*Created …*` or `*Last updated …*` italic line —
// the convention some milestone files end with. Used to decide whether the
// holding section (or a new entry within it) inserts ABOVE the footer or at EOF.
const MILESTONE_FOOTER_RE = /^\*(?:Created|Last updated)\b.*\*\s*$/;

/**
 * Insert `entry` into a `## {sectionTitle}` holding section near the end of a
 * milestone file, creating the section if it is absent. NEVER touches the
 * structured plan body — only the holding section. Pre-existing content outside
 * the inserted region stays BYTE-IDENTICAL (proved by prefix/suffix equality in
 * tests), so a hand-authored milestone plan can never be mangled (FR2 / R5).
 *
 * Four cases (all tested):
 *   (a) no section + no footer  → append the section (+entry) at EOF.
 *   (b) no section + footer     → insert the section (+entry) ABOVE the footer.
 *   (c) section exists          → append the entry to the END of that section
 *       (before the next `## ` heading, before a trailing footer, or at EOF) —
 *       2nd-and-later captures reuse the one section (FR2 AC).
 *   (d) section exists, then other `## ` headings → append at the end of the
 *       section's own content, i.e. just before the next `## ` heading.
 *
 * @param {string} content
 * @param {string} entry — h3 entry block (no trailing separator)
 * @param {{sectionTitle?: string}} [opts]
 * @returns {string}
 */
export function insertIntoHoldingSection(
  content,
  entry,
  { sectionTitle = MILESTONE_HOLDING_SECTION } = {}
) {
  const lines = content.split('\n');
  const sectionHeading = `## ${sectionTitle}`;
  const sectionIdx = lines.findIndex((l) => l.trim() === sectionHeading);

  if (sectionIdx === -1) {
    // --- Section absent → create it. ---
    // Find a trailing footer line (last non-empty line is a *Created…*/
    // *Last updated…* italic). If present, insert the section above it (b);
    // otherwise append at EOF (a).
    const footerIdx = findTrailingFooterIdx(lines);
    const block = `## ${sectionTitle}\n\n${entry}`;
    if (footerIdx === -1) {
      // (a) No footer — append at end, ensuring one blank line above and a
      // single trailing newline.
      const trimmed = content.replace(/\s+$/, '');
      return `${trimmed}\n\n${block}\n`;
    }
    // (b) Footer present — slot the section above it. Step back over the blank
    // line(s) directly above the footer to find the insertion anchor.
    let insertIdx = footerIdx;
    while (insertIdx > 0 && lines[insertIdx - 1].trim() === '') {
      insertIdx--;
    }
    const insertion = ['', ...block.split('\n'), ''];
    return [
      ...lines.slice(0, insertIdx),
      ...insertion,
      ...lines.slice(insertIdx),
    ].join('\n');
  }

  // --- Section exists → append the entry to the END of the section (c/d). ---
  // The section runs from just after its heading to the next `## ` heading, the
  // trailing footer line, or EOF — whichever comes first.
  let endIdx = lines.length; // exclusive end of the section's region
  for (let i = sectionIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]) || MILESTONE_FOOTER_RE.test(lines[i])) {
      endIdx = i;
      break;
    }
  }
  // Step back over trailing blank lines inside the section so the new entry
  // sits directly below the section's last non-blank content line.
  let insertIdx = endIdx;
  while (insertIdx > sectionIdx + 1 && lines[insertIdx - 1].trim() === '') {
    insertIdx--;
  }
  const insertion = ['', ...entry.split('\n'), ''];
  const merged = [
    ...lines.slice(0, insertIdx),
    ...insertion,
    ...lines.slice(insertIdx),
  ].join('\n');
  // Normalize to a single trailing newline (only collapses trailing
  // whitespace at EOF — pre-existing interior content is untouched).
  return merged.replace(/\s+$/, '') + '\n';
}

// Return the index of a trailing footer line (`*Created…*` / `*Last updated…*`)
// when it is the LAST non-empty line of the file, else -1.
function findTrailingFooterIdx(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '') continue;
    return MILESTONE_FOOTER_RE.test(lines[i]) ? i : -1;
  }
  return -1;
}

/**
 * THE R2 HARD GATE for the undocumented `--file` escape valve (FR3). Pure path
 * math + a basename check — NO async, NO I/O — so the command can refuse a bad
 * path BEFORE acquiring the lock or writing anything (the "refuse before lock"
 * requirement). Two guards, both airtight:
 *
 *   1. Inside-`.planning/` guard (FR3.1). `resolve(baseDir, relOrPath)` collapses
 *      `..` segments and returns absolute paths as-is, so it defeats `../`
 *      escapes, absolute paths, and mid-path traversal alike. The resolved
 *      target must start with `resolve(baseDir, '.planning') + sep`. Appending
 *      the separator is what defeats the classic `startsWith` sibling-prefix bug:
 *      `.planning-evil/` does NOT start with `.planning/` (the trailing sep
 *      forces a directory-boundary match). `.planning` itself is a directory, so
 *      a target can never equal `planningRoot`.
 *   2. Basename denylist (FR3.2). DECISIONS.md and STATE.md are machine-managed;
 *      they are never capture destinations, regardless of where in `.planning/`
 *      they sit. Checked by `basename` so `.planning/sub/STATE.md` is refused too.
 *
 * Out of scope: symlinks. `resolve` does NOT follow symlinks (it is lexical),
 * so a symlink inside `.planning/` pointing outside would pass this lexical
 * gate. `--file` is an undocumented power-user escape valve in a local repo the
 * user already controls; defending against a symlink they planted in their own
 * `.planning/` is not a threat this gate addresses.
 *
 * @param {string} baseDir — project root (where .planning/ lives)
 * @param {string} relOrPath — the user-supplied `--file` path
 * @returns {string} the original `relOrPath` (unchanged) when safe — the caller
 *   passes it to the spine as `relPath`, so `join(baseDir, relOrPath)` recomputes
 *   the same target this gate validated.
 * @throws {Error} when the path escapes `.planning/` or hits the denylist.
 */
export function assertSafeFilePath(baseDir, relOrPath) {
  const planningRoot = resolve(baseDir, '.planning');
  const target = resolve(baseDir, relOrPath);

  if (!target.startsWith(planningRoot + sep)) {
    throw new Error(
      `--file destination must be inside .planning/ — refused: ${relOrPath}`
    );
  }

  const base = basename(target);
  if (base === 'DECISIONS.md' || base === 'STATE.md') {
    throw new Error(
      `--file cannot target ${base} (DECISIONS.md and STATE.md are managed, not capture destinations).`
    );
  }

  return relOrPath;
}

/**
 * Insert a RAW body (verbatim — NO heading, NO `**Status:**` line, no template)
 * above the LAST `---` separator line in the file, or append at EOF if there is
 * no `---`. The body is wrapped with one blank line above and below so it reads
 * as clean markdown, but its text is otherwise untouched. Content above the
 * insertion region stays byte-identical; the result has a single trailing
 * newline. This is the `--file` escape valve's insert strategy (Decision 6:
 * "raw body above last `---`").
 *
 * @param {string} content
 * @param {string} body — raw user text, inserted verbatim
 * @returns {string}
 */
export function insertRawAboveLastSeparator(content, body) {
  const lines = content.split('\n');
  // Find the LAST standalone `---` separator line.
  let lastSepIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '---') {
      lastSepIdx = i;
      break;
    }
  }

  if (lastSepIdx === -1) {
    // No separator — append the raw body at EOF, one blank line above, single
    // trailing newline.
    const trimmed = content.replace(/\s+$/, '');
    return `${trimmed}\n\n${body}\n`;
  }

  // Step back over blank line(s) directly above the separator to find the
  // insertion anchor, so the body slots in just below the prior content with a
  // single blank line on each side.
  let insertIdx = lastSepIdx;
  while (insertIdx > 0 && lines[insertIdx - 1].trim() === '') {
    insertIdx--;
  }

  const insertion = ['', body, ''];
  const merged = [
    ...lines.slice(0, insertIdx),
    ...insertion,
    ...lines.slice(insertIdx),
  ].join('\n');
  // Normalize to a single trailing newline.
  return merged.replace(/\s+$/, '') + '\n';
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

/**
 * S2.t4 entry point: capture `body` to .planning/OPEN-QUESTIONS.md (the
 * `--question` destination). Delegates to the shared `captureToDestination`
 * spine so scrub + body-length + lock + atomic-write all apply, exactly as for
 * FUTURE-IDEAS.
 *
 * OPEN-QUESTIONS.md has a DIFFERENT shape from FUTURE-IDEAS: no
 * `*Last updated:*` footer; entries are separated by `---`. So the entry is
 * appended at end-of-file (`insertAtEnd`) rather than inserted above a footer,
 * and there is no footer date to rewrite. Pre-existing content above the
 * insertion point stays byte-identical.
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
export async function captureToOpenQuestions(baseDir, opts) {
  const { body, today, triggerContext, sensitivePrompt, bodyLengthPrompt } = opts;

  return captureToDestination(baseDir, {
    relPath: OPEN_QUESTIONS,
    buildEntry: ({ body, date, triggerContext }) =>
      buildOpenQuestionsEntry({ body, date, triggerContext }),
    // No footer in OPEN-QUESTIONS — append at end-of-file, no date rewrite.
    insert: (content, entry) => insertAtEnd(content, entry),
    missingFileError:
      `Cannot capture: .planning/OPEN-QUESTIONS.md not found at ${join(baseDir, OPEN_QUESTIONS)}. ` +
      `Run \`/sig:init\` first if this is an existing codebase, or \`/sig:new-project\` for a fresh project.`,
    body,
    today,
    triggerContext,
    sensitivePrompt,
    bodyLengthPrompt,
  });
}

/**
 * S2.t5 entry point: capture `body` into a milestone file's
 * `## Captured via /sig:add` holding section (the `--milestone` destination).
 * Delegates to the shared `captureToDestination` spine so scrub + body-length +
 * lock + atomic-write all apply, exactly as for the other destinations
 * (R5/R7).
 *
 * Target resolution (Decision 7 / FR2):
 *   - `milestoneArg == null` → the current milestone, derived from STATE.md's
 *     `current_epic` via `currentMilestone`. No current milestone → throw a
 *     clear error, NO write (FR2.2).
 *   - `milestoneArg` is a string N (e.g. "5", "4.5") → `MILESTONE-{N}.md`.
 *
 * The target milestone file MUST already exist — scaffolding a new milestone is
 * out of scope (FR2.4). A missing file throws a tailored error and writes
 * nothing. We check existence here (before delegating) so the error names the
 * file and explains the scaffold-is-out-of-scope rule; the same message is also
 * passed to the spine as `missingFileError` backstop.
 *
 * NEVER edits the structured plan body — only the holding section
 * (`insertIntoHoldingSection`), find-or-create. Pre-existing content outside
 * the inserted region stays byte-identical.
 *
 * @param {string} baseDir — project root (where .planning/ lives)
 * @param {object} opts
 * @param {string|null} opts.milestoneArg — null = current milestone; "5"/"4.5" = explicit N
 * @param {string} opts.body — raw user input (verbatim, do not modify)
 * @param {string} opts.today — ISO date YYYY-MM-DD (injected for testability)
 * @param {string} [opts.triggerContext] — phase/milestone context if mid-flow
 * @param {(hits: Array) => Promise<'keep'|'abort'>} opts.sensitivePrompt
 * @param {(length: number) => Promise<'keep'|'abort'>} [opts.bodyLengthPrompt]
 *
 * @returns {Promise<{written: boolean, path?: string, line?: number, aborted?: string}>}
 */
export async function captureToMilestone(baseDir, opts) {
  const {
    milestoneArg,
    body,
    today,
    triggerContext,
    sensitivePrompt,
    bodyLengthPrompt,
  } = opts;

  // Resolve the target milestone filename.
  let fname;
  if (milestoneArg == null) {
    fname = await currentMilestone(baseDir);
    if (!fname) {
      throw new Error(
        'Cannot capture to the current milestone: no current milestone is set ' +
          "in STATE.md (`current_epic` is absent or doesn't parse). Pass an " +
          'explicit `--milestone N` (e.g. `--milestone 5`), or check ' +
          '`/sig:status` for the current epic.'
      );
    }
  } else {
    fname = `MILESTONE-${milestoneArg}.md`;
  }

  const relPath = `.planning/${fname}`;
  const targetPath = join(baseDir, relPath);

  // Existence check BEFORE delegating — scaffolding a new milestone is out of
  // scope (FR2.4). Tailored message names the file and the rule.
  const missingFileError =
    `Cannot capture to ${relPath}: that milestone file does not exist at ${targetPath}. ` +
    `Scaffolding a new milestone is out of scope for /sig:add — hand-author the ` +
    `milestone file first, then re-run.`;
  if (!existsSync(targetPath)) {
    throw new Error(missingFileError);
  }

  return captureToDestination(baseDir, {
    relPath,
    buildEntry: ({ body, date, triggerContext }) =>
      buildMilestoneEntry({ body, date, triggerContext }),
    // Holding-section find-or-create; never touches the plan body.
    insert: (content, entry) => insertIntoHoldingSection(content, entry),
    missingFileError,
    body,
    today,
    triggerContext,
    sensitivePrompt,
    bodyLengthPrompt,
  });
}

/**
 * S2.t6 entry point: capture `body` to an arbitrary file inside `.planning/`
 * (the UNDOCUMENTED `--file <path>` escape valve, FR3 / Decision 6). Unlike the
 * other destinations there is NO template — the raw body is written verbatim
 * above the last `---`/EOF.
 *
 * THE R2 HARD GATE fires FIRST, before anything else: `assertSafeFilePath`
 * throws on a path that escapes `.planning/` (FR3.1) or whose basename is
 * DECISIONS.md / STATE.md (FR3.2). Because it runs before delegating to the
 * spine, the refusal happens BEFORE lock acquisition and before any write — a
 * bad path leaves zero lock and zero file mutation (the R2 "refuse before lock"
 * requirement, proven by the integration tests).
 *
 * After the gate, delegates to the shared `captureToDestination` spine so
 * scrub + body-length + lock + atomic-write all apply (R7), exactly as for the
 * other destinations. The `buildEntry` closure returns the raw body unchanged
 * (the entry IS the body — no heading, no status line), and `insert` splices it
 * above the last separator via `insertRawAboveLastSeparator`.
 *
 * Per FR3.3 this destination is intentionally NOT surfaced in any `--help` /
 * usage text — S2.t7 documents `--question` / `--milestone` only.
 *
 * @param {string} baseDir — project root (where .planning/ lives)
 * @param {object} opts
 * @param {string} opts.filePath — the `--file` path (validated by the hard gate)
 * @param {string} opts.body — raw user input (verbatim, do not modify)
 * @param {string} opts.today — ISO date YYYY-MM-DD (injected for testability)
 * @param {string} [opts.triggerContext] — phase/milestone context if mid-flow
 * @param {(hits: Array) => Promise<'keep'|'abort'>} opts.sensitivePrompt
 * @param {(length: number) => Promise<'keep'|'abort'>} [opts.bodyLengthPrompt]
 *
 * @returns {Promise<{written: boolean, path?: string, line?: number, aborted?: string}>}
 */
export async function captureToFile(baseDir, opts) {
  const {
    filePath,
    body,
    today,
    triggerContext,
    sensitivePrompt,
    bodyLengthPrompt,
  } = opts;

  // R2 HARD GATE — refuse a path-escape or denylisted target BEFORE the spine
  // runs (so before lock acquisition and before any write). Returns the
  // validated relative path unchanged.
  const relPath = assertSafeFilePath(baseDir, filePath);

  return captureToDestination(baseDir, {
    relPath,
    // No template — the entry IS the raw body, verbatim.
    buildEntry: ({ body }) => body,
    // Raw body above the last --- / EOF; no footer, no heading.
    insert: (content, entry) => insertRawAboveLastSeparator(content, entry),
    missingFileError:
      `Cannot capture: ${relPath} not found at ${join(baseDir, relPath)}. ` +
      `--file requires the target file to already exist inside .planning/.`,
    body,
    today,
    triggerContext,
    sensitivePrompt,
    bodyLengthPrompt,
  });
}
