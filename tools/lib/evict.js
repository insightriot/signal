// Evict-on-close mechanics (M5.E1 FR2b).
//
// When an Epic closes, its narrative should LEAVE the live STATE.md body and
// live in `.planning/archive/<milestone>/<epic>/`, with a one-line pointer left
// behind (growth-policy: working-set → evicts on close — see
// references/doc-runtime-model.md).
//
// The move is loss-proof by construction: the original narrative is relocated
// byte-identical and the original survives in archive (move-never-delete). So
// the residual risk is NOT information loss — it is *legibility degradation* if
// the card (the RETROSPECTIVE) misrepresents the source. This module implements
// the ORDERED gate that guards against that:
//
//   distill  →  verify-against-source  →  evict
//
// S3a (this first half) is the pure, testable heart: section extraction, the
// ID/date/status-token extractors, the coverage gate, and carry-over lifting.
// S3b wires these into an orchestration (evictEpicNarrative) + ship/checkpoint.
//
// IMPORTANT — the gate's blind spot (carry to VERIFY/REVIEW). The coverage gate
// proves NO discrete-token LOSS (every ID / ISO date / status-token type in the
// source survives into the card or an explicit dropped-list). It does NOT prove
// semantic faithfulness — a card that keeps every ID but paraphrases what
// happened incorrectly passes this gate. Paraphrase distortion is verified only
// on live content (the S5 dogfood) and in REVIEW. A green gate means "nothing
// was silently dropped," not "the card is faithful."

import { EPIC_ID_STRICT_RE } from './state.js';

// --- ID / date / status-token extractors (the deterministic backstop) --------

// Epic-and-deeper IDs: must contain `.E` (a bare `M5` is too noisy — it matches
// prose like "M5 milestone" everywhere). Captures M4.5.E10, M5.E1.S3, M5.E1.S3.t2.
const EPIC_DEEP_ID_RE = /\bM\d+(?:\.\d+)*\.E\d+(?:\.S\d+)?(?:\.t\d+)?\b/g;
// Decision IDs: D-M5E1-3, D-E11-4, D-v016-1, BR-9 is NOT a D- id so excluded.
const DECISION_ID_RE = /\bD-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g;
// Functional-requirement IDs: FR1, FR2a, FR2b.
const FR_ID_RE = /\bFR\d+[a-z]?\b/g;
// Acceptance-criterion IDs: AC1, AC6.4, AC-seed is excluded (needs a digit).
const AC_ID_RE = /\bAC\d+(?:\.\d+)?\b/g;
// ISO dates: 2026-07-16.
const ISO_DATE_RE = /\b\d{4}-\d{2}-\d{2}\b/g;
// Status tokens whose *disappearance* would silently drop a still-open item.
const STATUS_TOKENS = ['open', 'deferred', 'shelved', 'carry-over', 'carryover', 'blocker', 'blocked'];

function uniqueMatches(text, re) {
  if (!text) return [];
  const out = new Set();
  for (const m of text.matchAll(re)) out.add(m[0]);
  return [...out];
}

/**
 * All distinct discrete IDs in `text` (Epic/deeper, decision, FR, AC).
 * @param {string} text
 * @returns {string[]}
 */
export function extractIds(text) {
  return [
    ...uniqueMatches(text, EPIC_DEEP_ID_RE),
    ...uniqueMatches(text, DECISION_ID_RE),
    ...uniqueMatches(text, FR_ID_RE),
    ...uniqueMatches(text, AC_ID_RE),
  ];
}

/**
 * All distinct ISO dates (YYYY-MM-DD) in `text`.
 * @param {string} text
 * @returns {string[]}
 */
export function extractDates(text) {
  return uniqueMatches(text, ISO_DATE_RE);
}

/**
 * The distinct status-token TYPES present in `text` (lowercased). Type-level,
 * not per-instance: the failure mode is a *kind* of open item vanishing from
 * the card (source flags something "deferred", card mentions no deferral), not
 * an exact count mismatch.
 * @param {string} text
 * @returns {string[]}
 */
export function extractStatusTokens(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  return STATUS_TOKENS.filter((tok) => {
    // whole-word-ish: bounded by non-word chars (hyphen is part of carry-over).
    const re = new RegExp(`(?:^|[^a-z-])${tok}(?:[^a-z-]|$)`, 'i');
    return re.test(lower);
  });
}

// --- the coverage gate -------------------------------------------------------

/**
 * Verify that a distilled card does not silently DROP any discrete token from
 * its source narrative. For every unique ID and ISO date, and every status-token
 * type in `source`, the item must appear in `card` OR in the explicit `dropped`
 * list (an author's "intentionally dropped" acknowledgement). A card missing an
 * unacknowledged item FAILS the gate.
 *
 * This is the deterministic backstop of the distill→verify→evict gate. See the
 * module header: it proves no-loss, NOT semantic faithfulness (the blind spot).
 *
 * @param {string} source  the narrative being evicted
 * @param {string} card    the RETROSPECTIVE / summary that will represent it
 * @param {{dropped?: string[]}} [opts]  explicitly-acknowledged dropped items
 * @returns {{pass: boolean, missing: {ids: string[], dates: string[], tokens: string[]}}}
 */
export function verifyCardCoverage(source, card, opts = {}) {
  const dropped = (opts.dropped ?? []).map((d) => String(d).toLowerCase());
  const cardText = String(card ?? '');
  const cardLower = cardText.toLowerCase();

  const isCovered = (needle) => {
    const n = String(needle);
    return cardText.includes(n) || dropped.includes(n.toLowerCase());
  };
  const isTokenCovered = (tok) => {
    const re = new RegExp(`(?:^|[^a-z-])${tok}(?:[^a-z-]|$)`, 'i');
    return re.test(cardLower) || dropped.includes(tok.toLowerCase());
  };

  const missing = {
    ids: extractIds(source).filter((id) => !isCovered(id)),
    dates: extractDates(source).filter((d) => !isCovered(d)),
    tokens: extractStatusTokens(source).filter((t) => !isTokenCovered(t)),
  };
  const pass =
    missing.ids.length === 0 &&
    missing.dates.length === 0 &&
    missing.tokens.length === 0;
  return { pass, missing };
}

// --- Epic-section extraction (scope to the closing unit, never heuristic GC) --

/**
 * Extract the markdown section for a specific Epic from a STATE.md body. The
 * section is the block whose heading LINE contains the Epic ID (any heading
 * level), running from that heading until the next heading at the same-or-
 * shallower level (or end-of-input). Scoping keys on the explicit Epic ID — it
 * NEVER heuristically GCs arbitrary prose (R3).
 *
 * Regex is Node-22-safe: no `(?m:)` inline modifier (V8 12.7+/Node 23+ only) —
 * headings are line-anchored manually with `(?:^|\n)` (mirrors landscape.js).
 *
 * @param {string} body    the STATE.md body (below the frontmatter)
 * @param {string} epicId  e.g. "M5.E1"
 * @returns {{found: boolean, heading?: string, section?: string, before?: string, after?: string}}
 */
export function extractEpicSection(body, epicId) {
  if (!body || typeof epicId !== 'string' || !EPIC_ID_STRICT_RE.test(epicId)) {
    return { found: false };
  }
  const escId = epicId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Find a heading line (#..######) that contains the Epic ID.
  const headingRe = new RegExp(`(?:^|\\n)(#{1,6})[ \\t]+([^\\n]*\\b${escId}\\b[^\\n]*)`, '');
  const hm = body.match(headingRe);
  if (!hm) return { found: false };

  const level = hm[1].length;
  // Start index of the heading itself (skip the leading newline the match may include).
  const headingStart = hm.index + (body[hm.index] === '\n' ? 1 : 0);

  // Find where this section ends: the next heading at level <= this one.
  const rest = body.slice(headingStart);
  // Skip the heading's own line before scanning for the next boundary heading.
  const afterHeadingLine = rest.indexOf('\n');
  const scanFrom = afterHeadingLine === -1 ? rest.length : afterHeadingLine + 1;
  const boundaryRe = new RegExp(`\\n(#{1,${level}})[ \\t]+`, '');
  const bm = rest.slice(scanFrom).match(boundaryRe);
  const sectionEnd =
    bm === null ? body.length : headingStart + scanFrom + bm.index; // bm.index is offset of the leading \n

  const section = body.slice(headingStart, sectionEnd);
  const before = body.slice(0, headingStart);
  const after = body.slice(sectionEnd);
  return {
    found: true,
    heading: hm[2].trim(),
    section,
    before,
    after,
  };
}

// --- carry-over lifting ------------------------------------------------------

/**
 * Pull the lines from an Epic section that carry an open/deferred/blocker
 * status token — the items that must be LIFTED UP into the live in-flight /
 * blockers section rather than buried in an archive card (R3). Returns trimmed
 * source lines (list-bullet markers preserved).
 *
 * @param {string} section
 * @returns {string[]}
 */
export function extractCarryOvers(section) {
  if (!section) return [];
  const out = [];
  for (const rawLine of section.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue; // skip blanks + headings
    if (extractStatusTokens(line).length > 0) out.push(line);
  }
  return out;
}

// --- archive path derivation -------------------------------------------------

/**
 * Derive the unit-homed archive directory for an Epic's evicted narrative:
 *   M5.E1     → .planning/archive/M5/E1
 *   M4.5.E10  → .planning/archive/M4.5/E10
 * (milestone dir + bare `E<n>` subdir — matches the existing archive layout.)
 *
 * @param {string} epicId
 * @returns {string} relative path under the project root
 */
export function deriveEpicArchiveDir(epicId) {
  const m = String(epicId).match(/^(M\d+(?:\.\d+)*)\.E(\d+)$/);
  if (!m) {
    throw new Error(`deriveEpicArchiveDir: malformed epicId "${epicId}" (expected M{N}[.{N}]*.E{N})`);
  }
  return `.planning/archive/${m[1]}/E${m[2]}`;
}
