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
import { resolveInboxPath } from './inbox-path.js';

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
// The inbox path is NOT a hardcoded const — it routes through
// `resolveInboxPath(baseDir)` so a legacy (`FUTURE-IDEAS.md`) and a v3
// (`ISSUES-INBOX.md`) repo both work without branching (FR1 / R1).
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

const HEADING_MAX = 60;
// Don't cut to a stub like "Ok" from "OK, so …"; a clause boundary must leave
// at least this many chars, else fall through to the next boundary / word slice.
const HEADING_MIN_CLAUSE = 20;
// Only cut at a boundary this near the start; a boundary further out means the
// first clause is too long to be a good heading — use the word/length fallback.
const HEADING_CLAUSE_WINDOW = 80;

/**
 * Build the sentence-cased heading text from the body.
 *
 * FR4 (v0.1.6): prefer the first clause boundary (em-dash / `.` / `:` / `,`
 * FOLLOWED BY whitespace-or-EOL) within the search window that yields at least
 * a MIN-length clause — so "…live file — PLAN …" heads as "…live file", not a
 * mid-clause 6-word slice. The "followed by whitespace" guard keeps `https://`
 * and `example.com` from triggering; only the em-dash (—) counts, never a
 * hyphen-minus. Falls back to the original first-~6-words slice when no such
 * boundary exists. The 60-char cap and sentence-casing are retained.
 */
function deriveHeading(body) {
  const text = (body ?? '').trim();
  if (text === '') return '';

  let heading = null;
  const limit = Math.min(text.length, HEADING_CLAUSE_WINDOW);
  for (let i = 0; i < limit; i++) {
    const ch = text[i];
    if (ch === '—' || ch === '.' || ch === ':' || ch === ',') {
      const next = text[i + 1];
      if (next === undefined || /\s/.test(next)) {
        const clause = text.slice(0, i).trim();
        if (clause.length >= HEADING_MIN_CLAUSE) {
          heading = clause;
          break;
        }
      }
    }
  }

  if (heading === null) heading = text.split(/\s+/).slice(0, 6).join(' ');

  const truncated =
    heading.length > HEADING_MAX ? heading.slice(0, HEADING_MAX - 3).trimEnd() + '...' : heading;
  // Sentence case: capitalize the first character, preserve the rest verbatim.
  // Title case would degrade acronyms ("FOO" → "Foo") — keep it readable.
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
}

/**
 * Render a FUTURE-IDEAS.md entry block from the inputs. Heading, dated status
 * line, body verbatim, trailing --- separator. No frontmatter, no IDs (those
 * are anti-patterns per FUTURE-IDEAS spec line 528 and prior-art research §5).
 *
 * @param {{body: string, date: string, triggerContext?: string, title?: string}} opts
 *   — `title` is the optional agent-authored one-line heading; when absent or
 *   blank the deterministic `deriveHeading(body)` clause-slice is used (AC1.3).
 * @returns {string}
 */
export function buildFutureIdeasEntry({ body, date, triggerContext, title }) {
  const heading = title?.trim() || deriveHeading(body);
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

// A `*Last updated: …*` footer line — anchored to the FULL italic shape
// (`[^*]*\*` requires the closing asterisk), matching rewriteFooter's original
// regex. Anchoring to the whole shape (not the loose `/^\*Last updated:/`)
// stops a genuine idea line that merely *begins* `*Last updated:` from being
// mis-classified as the footer and stripped by the repair path (M4.5.E10
// REVIEW Sec-3). FUTURE-IDEAS files end with one of these.
const FUTURE_IDEAS_FOOTER_RE = /^\*Last updated:[^*]*\*\s*$/;

// True when the trimmed line opens/closes a fenced code block.
function isFenceLine(line) {
  const t = line.trimStart();
  return t.startsWith('```') || t.startsWith('~~~');
}

// Index of the last non-empty line, or -1.
function lastNonEmptyLineIdx(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() !== '') return i;
  }
  return -1;
}

// Indices of every top-level (non-fenced) footer line, in order. A footer line
// inside a ``` / ~~~ code fence is a literal sample, not the document footer.
function footerLineIdxs(lines) {
  const idxs = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (isFenceLine(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && FUTURE_IDEAS_FOOTER_RE.test(lines[i])) idxs.push(i);
  }
  return idxs;
}

// The footer index ONLY when the footer is the LAST non-empty line of the file
// (trailing-anchored + fence-aware). A fenced `*Last updated:*` sample earlier
// in the file, or a footer with content stranded below it, returns -1 — the
// old first-match `findIndex` corrupted both cases. `insertFutureIdeasEntry`
// handles the stranded case; here we just refuse to misidentify the footer.
function trailingFooterLineIdx(lines) {
  const last = lastNonEmptyLineIdx(lines);
  if (last === -1 || !FUTURE_IDEAS_FOOTER_RE.test(lines[last])) return -1;
  return footerLineIdxs(lines).includes(last) ? last : -1;
}

/**
 * Rewrite the trailing `*Last updated: YYYY-MM-DD*` footer to today's date.
 * Trailing-anchored + fence-aware: only the real footer (last non-empty line,
 * not a fenced sample) is rewritten. If no such line is present, append one.
 * Preserves all content above the footer verbatim.
 *
 * @param {string} content
 * @param {string} date
 * @returns {string}
 */
export function rewriteFooter(content, date) {
  const lines = content.split('\n');
  const idx = trailingFooterLineIdx(lines);
  if (idx !== -1) {
    lines[idx] = `*Last updated: ${date}*`;
    return lines.join('\n');
  }
  // No trailing footer — append one. Ensure exactly one trailing newline.
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
  const footerIdx = trailingFooterLineIdx(lines);

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
 * Insert a FUTURE-IDEAS entry with footer normalization (FR4b). Wraps the
 * well-formed insert (`rewriteFooter(insertAboveFooter(...))`) with a repair
 * branch for a drifted file — one where a `*Last updated:*` footer sits
 * mid-file with content stranded below it (or where there are multiple footers)
 * so the naive first-match insert would wedge the entry in the wrong place.
 *
 * Well-formed (zero footers, or one footer as the last non-empty line) → the
 * historical behavior byte-for-byte, `repaired: false`. Drifted → strip every
 * NON-fenced footer line (fenced samples are kept), absorb the remaining
 * content in order, then land the entry + a single fresh footer at true EOF,
 * `repaired: true` so the command layer can announce the normalization (AD5:
 * detect+recover returns the signal; the announce lives in the caller).
 *
 * @param {string} content
 * @param {string} entry — full entry block (already includes its trailing ---)
 * @param {string} date — ISO date YYYY-MM-DD
 * @returns {{content: string, repaired: boolean}}
 */
export function insertFutureIdeasEntry(content, entry, date) {
  const lines = content.split('\n');
  const footers = footerLineIdxs(lines);
  const last = lastNonEmptyLineIdx(lines);

  const wellFormed =
    footers.length === 0 || (footers.length === 1 && footers[0] === last);

  if (wellFormed) {
    return {
      content: rewriteFooter(insertAboveFooter(content, entry), date),
      repaired: false,
    };
  }

  // Drifted — a footer with content stranded below it, or multiple footers.
  // Keep every non-footer line (fenced samples included), absorbing stranded
  // content above; land the entry + one fresh footer at true EOF.
  const footerSet = new Set(footers);
  const kept = lines
    .filter((_, i) => !footerSet.has(i))
    .join('\n')
    .replace(/\s+$/, '');
  return {
    content: `${kept}\n\n${entry}\n\n*Last updated: ${date}*\n`,
    repaired: true,
  };
}

/**
 * Lint a FUTURE-IDEAS.md string: it must have exactly one `*Last updated:*`
 * footer and nothing non-whitespace below it (fence-aware — a footer inside a
 * code fence is a sample, not the footer). The complement of
 * `insertFutureIdeasEntry`'s repair: repair fixes drift on the next capture,
 * this detects it so it can't silently accumulate. A footerless file is out of
 * scope (`ok: true`). Pure — no I/O; the caller reads the file.
 *
 * @param {string} content
 * @returns {{ok: boolean, message?: string}}
 */
export function lintFutureIdeasFooter(content) {
  const lines = String(content).split('\n');
  const footers = footerLineIdxs(lines);
  if (footers.length === 0) return { ok: true }; // no footer — out of scope
  if (footers.length > 1) {
    return {
      ok: false,
      message:
        `FUTURE-IDEAS.md has ${footers.length} *Last updated:* footers ` +
        `(lines ${footers.map((i) => i + 1).join(', ')}); it should have exactly ` +
        `one, at EOF. Run /sig:add to normalize.`,
    };
  }
  const lastFooter = footers[0];
  for (let i = lastFooter + 1; i < lines.length; i++) {
    if (lines[i].trim() !== '') {
      return {
        ok: false,
        message:
          `FUTURE-IDEAS.md has content after its footer (line ${i + 1}: ` +
          `"${lines[i].trim().slice(0, 60)}"). The *Last updated:* footer must be ` +
          `the last non-whitespace line. Run /sig:add to normalize.`,
      };
    }
  }
  return { ok: true };
}

/**
 * Render an OPEN-QUESTIONS.md entry block. The OPEN-QUESTIONS shape differs from
 * FUTURE-IDEAS: heading, a `**Status:**` line, body verbatim, a `**Resolve by:**`
 * line, then a trailing `---` separator (matching the file's existing
 * Status/Watch-for/Resolve-by convention). The heading-derivation rule is shared
 * with FUTURE-IDEAS for consistency. Body is verbatim — no rewrite.
 *
 * @param {{body: string, date: string, triggerContext?: string, title?: string}} opts
 *   — optional agent-authored `title`; blank/absent → `deriveHeading` (AC1.3).
 * @returns {string}
 */
export function buildOpenQuestionsEntry({ body, date, triggerContext, title }) {
  const heading = title?.trim() || deriveHeading(body);
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
 * @param {{body: string, date: string, triggerContext?: string, title?: string}} opts
 *   — optional agent-authored `title`; blank/absent → `deriveHeading` (AC1.3).
 * @returns {string}
 */
export function buildMilestoneEntry({ body, date, triggerContext, title }) {
  const heading = title?.trim() || deriveHeading(body);
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
 * @param {string} [opts.title] — optional agent-authored heading (FR1); the
 *   `buildEntry` closure falls back to `deriveHeading(body)` when it is blank.
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
    title,
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
    const entry = buildEntry({ body, date: today, triggerContext, title });
    // An `insert` closure may return a bare string (most destinations) or a
    // `{content, repaired}` object (FUTURE-IDEAS footer-repair, S3.t2). Normalize
    // both so the repair signal threads up to the command layer to announce.
    const insertResult = insert(existing, entry, today);
    const newContent =
      typeof insertResult === 'string' ? insertResult : insertResult.content;
    const repaired =
      typeof insertResult === 'string' ? false : Boolean(insertResult.repaired);
    await atomicWrite(targetPath, newContent);

    // Compute the 1-indexed line number of the new entry generically: find the
    // entry's first line in the written content. -1 when not found (e.g. the
    // insert closure transformed the heading), which the caller may surface.
    const firstEntryLine = entry.split('\n')[0];
    const lineIdx = newContent.split('\n').findIndex((l) => l === firstEntryLine);
    const line = lineIdx >= 0 ? lineIdx + 1 : -1;

    return { written: true, path: targetPath, line, repaired };
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
 * @param {string} [opts.title] — optional agent-authored heading (FR1); the
 *   `buildEntry` closure falls back to `deriveHeading(body)` when it is blank.
 * @param {(hits: Array) => Promise<'keep'|'abort'>} opts.sensitivePrompt
 * @param {(length: number) => Promise<'keep'|'abort'>} [opts.bodyLengthPrompt]
 *
 * @returns {Promise<{written: boolean, path?: string, line?: number, aborted?: string, repaired?: boolean}>}
 *   `repaired: true` when a drifted mid-file footer was normalized (S3.t2).
 */
export async function captureToFutureIdeas(baseDir, opts) {
  const { body, today, triggerContext, title, sensitivePrompt, bodyLengthPrompt } = opts;

  // Route through the resolver: a legacy repo picks `.planning/FUTURE-IDEAS.md`,
  // a v3 repo picks `.planning/ISSUES-INBOX.md`, a fresh repo picks the new name
  // for lazy-create (FR1 / R1).
  const relPath = resolveInboxPath(baseDir);

  return captureToDestination(baseDir, {
    relPath,
    buildEntry: ({ body, date, triggerContext, title }) =>
      buildFutureIdeasEntry({ body, date, triggerContext, title }),
    // Footer handling stays inbox-specific — encapsulated here so the shared
    // spine never assumes a footer exists. Returns {content, repaired} so a
    // drifted (stranded-footer) file gets normalized + announced (S3.t2).
    insert: (content, entry, date) => insertFutureIdeasEntry(content, entry, date),
    // Error names the resolved inbox path; still mentions /sig:init (the
    // existing test asserts /sig:init/ appears).
    missingFileError:
      `Cannot capture: ${relPath} not found at ${join(baseDir, relPath)}. ` +
      `Run \`/sig:init\` first if this is an existing codebase, or \`/sig:new-project\` for a fresh project.`,
    body,
    today,
    triggerContext,
    title,
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
 * @param {string} [opts.title] — optional agent-authored heading (FR1); the
 *   `buildEntry` closure falls back to `deriveHeading(body)` when it is blank.
 * @param {(hits: Array) => Promise<'keep'|'abort'>} opts.sensitivePrompt
 * @param {(length: number) => Promise<'keep'|'abort'>} [opts.bodyLengthPrompt]
 *
 * @returns {Promise<{written: boolean, path?: string, line?: number, aborted?: string}>}
 */
export async function captureToOpenQuestions(baseDir, opts) {
  const { body, today, triggerContext, title, sensitivePrompt, bodyLengthPrompt } = opts;

  return captureToDestination(baseDir, {
    relPath: OPEN_QUESTIONS,
    buildEntry: ({ body, date, triggerContext, title }) =>
      buildOpenQuestionsEntry({ body, date, triggerContext, title }),
    // No footer in OPEN-QUESTIONS — append at end-of-file, no date rewrite.
    insert: (content, entry) => insertAtEnd(content, entry),
    missingFileError:
      `Cannot capture: .planning/OPEN-QUESTIONS.md not found at ${join(baseDir, OPEN_QUESTIONS)}. ` +
      `Run \`/sig:init\` first if this is an existing codebase, or \`/sig:new-project\` for a fresh project.`,
    body,
    today,
    triggerContext,
    title,
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
 * @param {string} [opts.title] — optional agent-authored heading (FR1); the
 *   `buildEntry` closure falls back to `deriveHeading(body)` when it is blank.
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
    title,
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
    buildEntry: ({ body, date, triggerContext, title }) =>
      buildMilestoneEntry({ body, date, triggerContext, title }),
    // Holding-section find-or-create; never touches the plan body.
    insert: (content, entry) => insertIntoHoldingSection(content, entry),
    missingFileError,
    body,
    today,
    triggerContext,
    title,
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
