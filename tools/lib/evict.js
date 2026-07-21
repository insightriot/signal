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

import { existsSync } from 'node:fs';
import { readFile, mkdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

import {
  EPIC_ID_STRICT_RE,
  PLANNING_DIR,
  parseFrontmatter,
  stringifyFrontmatter,
  withStateLock,
} from './state.js';
import { deriveRetroPath } from './retrospective.js';
import { atomicWrite } from './atomic-write.js';
import { assertRealInsidePlanning } from './path-confine.js';

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
    if (dropped.includes(n.toLowerCase())) return true;
    // Bounded match — NOT substring. A plain `includes` would count a source
    // `M5.E1` as covered by a card mention of `M5.E10` (or `FR2` by `FR2b`,
    // `AC1` by `AC10`), silently PASSING a lossy card — the wrong direction for
    // a gate whose job is to FAIL loss. Alphanumeric neighbours mean "part of a
    // longer ID"; `.`/`-` are treated as boundaries so a trailing sentence
    // period or the id's own internal separators don't block a legit match.
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|[^A-Za-z0-9])${esc}(?:[^A-Za-z0-9]|$)`).test(cardText);
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

// --- S3b: the evict-on-close orchestration -----------------------------------

/**
 * Insert lifted carry-over lines into a LIVE section of the body so open items
 * are surfaced, not buried (R3). Prefers `## {heading}` (e.g. "In-flight");
 * when that heading is absent (a real migrated body with no skeleton), inserts
 * at the top, right after the first `# ` title line. Each line is tagged with
 * its origin Epic and de-duplicated against lines already present.
 *
 * @param {string} body
 * @param {string} heading  section heading text to lift under, e.g. "In-flight"
 * @param {string} epicId
 * @param {string[]} carry  lines from extractCarryOvers
 * @returns {string}
 */
export function insertCarryOvers(body, heading, epicId, carry) {
  if (!carry || carry.length === 0) return body;
  const tagged = carry.map((line) => {
    const stripped = line.replace(/^[-*]\s+/, '');
    return `- [carried from ${epicId}] ${stripped}`;
  });
  const block = tagged.filter((l) => !body.includes(l)).join('\n');
  if (!block) return body;

  const escHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headingRe = new RegExp(`(?:^|\\n)##\\s+${escHeading}[ \\t]*\\n`, '');
  const hm = body.match(headingRe);
  if (hm) {
    const insertAt = hm.index + hm[0].length;
    return `${body.slice(0, insertAt)}${block}\n${body.slice(insertAt)}`;
  }
  // Fallback: insert after the first `# ` title, else at the very top.
  const titleRe = /(?:^|\n)#\s+[^\n]*\n/;
  const tm = body.match(titleRe);
  if (tm) {
    const insertAt = tm.index + tm[0].length;
    return `${body.slice(0, insertAt)}${block}\n${body.slice(insertAt)}`;
  }
  return `${block}\n${body}`;
}

/**
 * Evict a closed Epic's narrative from the live STATE.md body (FR2b). The
 * ordered gate runs distill→verify→evict; this function is the verify+evict
 * mechanics. It NEVER deletes: the original section is relocated byte-identical
 * to `.planning/archive/<milestone>/<epic>/STATE-NARRATIVE.md` and the live body
 * gets a one-line pointer in its place, with open carry-overs lifted UP into a
 * live section.
 *
 * Refuses (no mutation) and returns a reason when:
 *   - STATE.md has no frontmatter (`no-frontmatter`)
 *   - the Epic has no narrative block in the body (`no-section`)
 *   - the Epic isn't closed — no `{EpicID}-RETROSPECTIVE.md` (`not-closed`;
 *     the Auditor-style closed-vs-live confirm)
 *   - the card fails the coverage gate (`lossy-card`, with `missing`)
 *
 * @param {string} baseDir
 * @param {string} epicId
 * @param {{dropped?: string[], carryOverHeading?: string}} [opts]
 * @returns {Promise<{evicted: boolean, reason?: string, missing?: object,
 *   archivePath?: string, pointer?: string, carriedOver?: string[]}>}
 */
export async function evictEpicNarrative(baseDir, epicId, opts = {}) {
  const { dropped = [], carryOverHeading = 'In-flight' } = opts;
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  if (!existsSync(statePath)) return { evicted: false, reason: 'no-state-file' };

  // STATE.md is lock-protected: every other mutator serializes on
  // withStateLock (5s TTL). Hold it across the whole read-modify-write so a
  // concurrent state write (hook, second session) can't lose an update between
  // our read and our write. atomicWrite prevents a torn file, not a lost update.
  return withStateLock(baseDir, async () => {
    const raw = await readFile(statePath, 'utf-8');
    const { data, body } = parseFrontmatter(raw);
    if (data === null) return { evicted: false, reason: 'no-frontmatter' };

    const sec = extractEpicSection(body, epicId);
    if (!sec.found) return { evicted: false, reason: 'no-section' };

    // Closed-vs-live confirm (Auditor-style): only evict a genuinely CLOSED
    // Epic. An Epic is closed iff its retrospective (the card) exists.
    const retroRel = deriveRetroPath(epicId);
    const retroPath = join(baseDir, retroRel);
    if (!existsSync(retroPath)) return { evicted: false, reason: 'not-closed' };
    const card = await readFile(retroPath, 'utf-8');

    // The gate. A lossy card FAILS — no eviction, so the live narrative is never
    // replaced by a pointer to a card that dropped material.
    const coverage = verifyCardCoverage(sec.section, card, { dropped });
    if (!coverage.pass) {
      return { evicted: false, reason: 'lossy-card', missing: coverage.missing };
    }

    // Move: relocate the original narrative byte-identical (move-never-delete).
    const archiveDir = deriveEpicArchiveDir(epicId);
    // Defense-in-depth path confinement (mirrors resume.js/add.js): the regex in
    // deriveEpicArchiveDir already makes traversal structurally impossible, but
    // assert the resolved path stays inside .planning/ so a future regex edit
    // can't silently widen it (the trailing sep defeats the sibling-prefix bug).
    const planningRoot = resolve(baseDir, PLANNING_DIR);
    if (!resolve(baseDir, archiveDir).startsWith(planningRoot + sep)) {
      throw new Error(`evictEpicNarrative: archive path for ${epicId} escapes ${PLANNING_DIR}/`);
    }
    const narrativeRel = `${archiveDir}/STATE-NARRATIVE.md`;
    const narrativeAbs = join(baseDir, narrativeRel);
    // Symlink-aware re-assert (B14 / FR2): pass the FILE path (not archiveDir) so the guard
    // realpaths dirname(narrativeAbs) = the archive dir ITSELF — a checked-in DIRECTORY
    // symlink AT the Epic leaf is caught. (REVIEW: passing archiveDir resolved only its
    // PARENT, leaving a leaf-symlink escape open; archive-tree.js passes the file for this
    // reason — the mkdir/atomicWrite would otherwise follow the link OUT of the repo.)
    assertRealInsidePlanning(baseDir, narrativeAbs, 'evictEpicNarrative');
    await mkdir(join(baseDir, archiveDir), { recursive: true });
    await atomicWrite(narrativeAbs, sec.section);
    // Zero-loss accounting: what we archived is byte-identical to the extracted
    // section (the original survives in full in archive).
    const archived = await readFile(narrativeAbs, 'utf-8');
    if (archived !== sec.section) {
      throw new Error(
        `evictEpicNarrative: archived narrative for ${epicId} is not byte-identical to the source section`
      );
    }

    // One-line pointer (unit-homed single-home: archived narrative + card).
    const cardName = retroRel.replace(`${PLANNING_DIR}/`, '');
    const pointer = `- ${epicId} — evicted to ${narrativeRel} · card: ${cardName}`;

    // Route the pointer under "## Closed work" (the skeleton's advertised home
    // for evicted-narrative pointers, per state-schema.md). Splicing it in-situ
    // would orphan it under the *previous* Epic's heading. Fall back to in-situ
    // only when the body has no skeleton "Closed work" section (a real migrated
    // body). Removing the section collapses the seam to a single blank line.
    const closedRe = /(?:^|\n)##\s+Closed work[ \t]*\n/;
    let newBody;
    if (closedRe.test(sec.before) || closedRe.test(sec.after)) {
      const withoutSection = (sec.before + sec.after).replace(/\n{3,}/g, '\n\n');
      const cm = withoutSection.match(closedRe);
      const at = cm.index + cm[0].length;
      newBody = `${withoutSection.slice(0, at)}${pointer}\n${withoutSection.slice(at)}`;
    } else {
      newBody = `${sec.before}${pointer}\n${sec.after}`;
    }

    // Lift open carry-overs UP into a live section (never bury them in archive).
    const carriedOver = extractCarryOvers(sec.section);
    newBody = insertCarryOvers(newBody, carryOverHeading, epicId, carriedOver);

    await atomicWrite(statePath, stringifyFrontmatter(data, newBody));
    return { evicted: true, archivePath: narrativeRel, pointer, carriedOver };
  });
}
