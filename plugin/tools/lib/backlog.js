// Living BACKLOG.md + drain promote helpers (M5.E3.S4 / FR2).
//
// `.planning/BACKLOG.md` is the single groomed, sequenced roadmap — the /sig:plan
// drain classifies each promoted inbox entry (work→BACKLOG / bug→BUGS) and folds
// it in here with a retitle + a roadmap|hygiene tag (roadmap-vs-hygiene is a Tag
// on each entry, NOT a separate file — AC2.1). The raw inbox block simultaneously
// double-homes in the archive ledger via the existing evictTerminalToLedger, so
// the BACKLOG entry can be groomed (old `## ` heading dropped for the retitle)
// with zero risk to the "0 content dropped" faithfulness AC — the ledger is the
// verbatim backstop.
//
// Design constraints (from .planning/M5.E3-PLAN.md § S4):
//   - Idempotent create-if-missing (skeleton = intro + `*Last updated:*` footer).
//   - A promote appends `## {title}` + `**Tag:** {tag}` + the block body, inserted
//     ABOVE the footer via `insertAboveFooter` (reused from add.js).
//   - sha1-dedupe: the entry carries `<!-- backlog-key: {sha1(block)} -->`; a
//     second promote of the SAME source block is a no-op. Keying on the raw,
//     byte-stable inbox block (not an LLM-rendered title/body) is what makes a
//     crash-then-re-run converge (t4): the block is byte-identical on re-run, so
//     its key still matches the already-present marker.
//
// No new runtime deps — pure string work over the shared add.js substrate.

import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';

import { atomicWrite } from './atomic-write.js';
import { insertAboveFooter, rewriteFooter, buildBugsEntry, insertAtEnd, scrubSensitive } from './add.js';
import { DONE_WORD_RE, declaresBugDischarge, isBugId, parseBacklogRows } from './legacy-lists.js';
import { isStoreOn } from './work-store.js';
import { assertWritable, isEpicArchived, listRecords, newItem } from './work-records.js';

const BACKLOG_REL = '.planning/BACKLOG.md';
const BUGS_REL = '.planning/BUGS.md';

// Roadmap-vs-hygiene is a strict enum tag on each BACKLOG entry (AC2.1).
const VALID_TAGS = new Set(['roadmap', 'hygiene']);

/** Today as an ISO date (YYYY-MM-DD); overridable by callers for determinism. */
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The BACKLOG.md skeleton: title, one-line purpose, `*Last updated:*` footer.
 * When a dated backlog-review snapshot (`BACKLOG-REVIEW-*.md`) is present, add a
 * one-line pointer to it — the CONTENT restructure of that snapshot into this
 * roadmap is a later dogfood judgment pass (S6b), NOT done here (create-if-missing
 * only). `snapshotRel` is the snapshot's filename (a sibling of BACKLOG.md in
 * `.planning/`), or `null`.
 */
function backlogSkeleton(date, snapshotRel) {
  const lines = [
    '# Backlog',
    '',
    'Groomed, sequenced roadmap — promoted from the issues inbox. Roadmap-vs-hygiene is a **Tag** on each entry, not a separate file.',
    '',
  ];
  if (snapshotRel) {
    lines.push(
      `> Seeded from [\`${snapshotRel}\`](${snapshotRel}) — its content restructure into this roadmap is pending (M5.E3.S6b).`,
      ''
    );
  }
  lines.push(`*Last updated: ${date}*`, '');
  return lines.join('\n');
}

// The dated backlog-review snapshot filename in `.planning/`, if one exists, else
// null. Globs `BACKLOG-REVIEW-*.md` so any dated snapshot seeds the pointer; a
// born-on-v3 project (no snapshot) gets the plain skeleton.
function findSnapshot(baseDir) {
  let entries;
  try {
    entries = readdirSync(join(baseDir, '.planning'));
  } catch {
    return null;
  }
  return entries.find((n) => /^BACKLOG-REVIEW-.*\.md$/.test(n)) ?? null;
}

/**
 * Idempotent create-if-missing for `.planning/BACKLOG.md`. Writes the skeleton
 * (intro + `*Last updated:*` footer) only when the file is absent; an existing
 * BACKLOG.md is left byte-for-byte untouched. When a `BACKLOG-REVIEW-*.md`
 * snapshot is present, the skeleton carries a pointer to it (the snapshot's
 * content is restructured into the roadmap later, in S6b — not here).
 *
 * @param {string} baseDir — project root (where `.planning/` lives)
 * @param {{today?: string}} [opts] — `today` seeds the initial footer date.
 * @returns {Promise<{created: boolean, path: string, seededFrom?: string|null}>}
 *   Always `created: false` with the work store on.
 */
export async function createBacklogIfMissing(baseDir, opts = {}) {
  const path = join(baseDir, BACKLOG_REL);
  // M6.E11 (t4.5): with the work store on, BACKLOG.md is the generator's file;
  // a hand skeleton written here would be refused (or erased) at the next
  // regeneration. Nothing to create.
  if (isStoreOn(baseDir).on) return { created: false, path };
  if (existsSync(path)) {
    return { created: false, path };
  }
  const date = opts.today ?? isoToday();
  const snapshot = findSnapshot(baseDir);
  await mkdir(dirname(path), { recursive: true });
  await atomicWrite(path, backlogSkeleton(date, snapshot));
  return { created: true, path, seededFrom: snapshot };
}

// Remove a leading top-level `## ` heading line (and one following blank line)
// from an inbox block — the retitle replaces it. Blocks handed in by the drain
// start exactly at their `## ` heading (parseEntries range), so this is a
// targeted one-block op, never a re-parse. A block with no leading heading (a
// bare body, e.g. from a test or a headingless capture) is returned unchanged.
function stripLeadingHeading(block) {
  if (!/^##\s/.test(block)) return block;
  const nl = block.indexOf('\n');
  const rest = nl === -1 ? '' : block.slice(nl + 1);
  return rest.replace(/^\n/, '');
}

// The idea content carried into a groomed BACKLOG/BUGS entry: the block minus
// its leading `## ` heading and its trailing `---` separator, trimmed. The ledger
// keeps the raw block verbatim, so this grooming loses nothing.
function groomBlockBody(block) {
  const stripped = stripLeadingHeading(block);
  return stripped.replace(/\n*-{3,}\s*$/, '').trim();
}

// The heading for a promoted entry: the caller's retitle if supplied, else the
// source block's own `## ` heading, else the first few words of the body.
function resolveTitle(title, block) {
  const t = (title ?? '').trim();
  if (t) return t;
  const m = block.match(/^##\s+(.+)$/m);
  if (m) return m[1].trim();
  return block.trim().split(/\s+/).slice(0, 6).join(' ') || 'Untitled';
}

/** sha1 of the raw source block — the stable dedupe key (see module header). */
export function blockKey(block) {
  return createHash('sha1').update(block).digest('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// With the work store on (M6.E11 t4.3, AC-6.2; M6.E13 t4.5b)
//
// BACKLOG.md and BUGS.md are generated from the work records, so a promote is
// a new record and a discharge is an item CLOSE — never an edit to the list.
//
// A promote files ONE record, created and triaged in the same locked write
// (`work-records.js` `newItem` with `triage` — the single lock the v1
// `promoteInStore` lacked, B6, which captured and then triaged under two). The
// type is this module's call — `roadmap` → FEAT, `hygiene` → CHORE, a bug →
// BUG — because the store has no tag and these are the nearest types it has.
//
// It never reads a view. The v1 version read an item ID back out of a block
// cut from the GENERATED inbox (`inboxItemId`) and moved that item instead;
// that is gone (PLAN t4.5b). Only the drain hands this a block, and the drain
// refuses outright with the store on (`drain.js` `refuseWhenStoreOn`), so no
// caller depended on it — a block, whatever it quotes, becomes a new record.
// Dedupe survives: the block's sha1 key is the record's `source_ref`, so a
// re-run finds it instead of making a twin.
//
// A v1 store refuses (`assertWritable`: CONFIG, naming
// `node tools/work-migrate-v2.mjs`) before anything is read or written.

const STORE_SOURCE = '/sig:plan drain';

async function promoteInStore(baseDir, { block, type, title, keyName, by, acknowledgeSensitive }) {
  assertWritable(baseDir);
  const key = blockKey(block);
  const dedupeKey = `${keyName}: ${key}`;
  const twin = listRecords(baseDir).records.find((r) => r.record.source_ref === dedupeKey);
  if (twin) return { written: false, deduped: true, path: join(baseDir, twin.path), key, id: twin.id };

  const heading = resolveTitle(title, block);
  const body = groomBlockBody(block);
  // The block and the retitle are new text entering a record, so they run the
  // scrub like any capture (REVIEW pass 2). Scrubbed HERE rather than by
  // `newItem`: the record's `source_ref` is the dedupe key, a sha1 — 40 hex
  // characters, which the detector flags by design — so `newItem` is told the
  // check was made.
  const sensitiveHits = [heading, body].flatMap((t) => (t ? scrubSensitive(t).hits : []));
  if (sensitiveHits.length > 0 && !acknowledgeSensitive) {
    return { written: false, key, aborted: 'sensitive-data-pending', sensitiveHits };
  }
  const entry = await newItem(baseDir, {
    title: heading,
    body,
    source: STORE_SOURCE,
    source_ref: dedupeKey,
    by: by ?? STORE_SOURCE,
    triage: { type },
  }, { acknowledgeSensitive: true });
  return { written: true, path: join(baseDir, entry.path), key, id: entry.id, label: `${entry.id}-${entry.record.type}-${entry.status}` };
}

/**
 * Promote a classified WORK entry into `.planning/BACKLOG.md`: append a
 * `## {title}` entry carrying `**Tag:** {tag}` (roadmap|hygiene) + the groomed
 * block body, inserted ABOVE the footer, with a sha1-dedupe marker (AC2.1). A
 * second promote of the SAME source block (same key) is a no-op — regardless of
 * a different tag or title — so a crash-then-re-run never duplicates.
 *
 * Creates BACKLOG.md first if missing (idempotent).
 *
 * @param {string} baseDir — project root
 * @param {object} opts
 * @param {string} opts.block — the raw source inbox block (dedupe key = sha1(block))
 * @param {'roadmap'|'hygiene'} opts.tag
 * @param {string} [opts.title] — retitle; falls back to the block's heading
 * @param {string} [opts.today] — ISO date for the footer bump
 * @param {string} [opts.by] — store on: the `created` event's `by`
 * @param {boolean} [opts.acknowledgeSensitive] — store on: the user has
 *   already been asked about sensitive data in `block` and `title`
 * @returns {Promise<{written: boolean, deduped?: boolean, path: string, key: string, id?: string, label?: string,
 *   aborted?: 'sensitive-data-pending', sensitiveHits?: object[]}>}
 *   With the store on, a new triaged record is written instead (see "With the
 *   work store on" above) and `path`/`id` name the record file; a v1 store
 *   refuses (CONFIG). A block or retitle with sensitive data, unacknowledged,
 *   writes nothing and returns `{written: false, aborted: 'sensitive-data-pending', sensitiveHits}`.
 */
export async function promoteToBacklog(baseDir, { block, tag, title, today, by, acknowledgeSensitive } = {}) {
  if (!VALID_TAGS.has(tag)) {
    throw new Error(
      `promoteToBacklog: tag must be "roadmap" or "hygiene", got ${JSON.stringify(tag)}.`
    );
  }
  if (isStoreOn(baseDir).on) {
    return promoteInStore(baseDir, { block, type: tag === 'roadmap' ? 'FEAT' : 'CHORE', title, keyName: 'backlog-key', by, acknowledgeSensitive });
  }
  const date = today ?? isoToday();
  await createBacklogIfMissing(baseDir, { today: date });

  const path = join(baseDir, BACKLOG_REL);
  const key = blockKey(block);
  const marker = `<!-- backlog-key: ${key} -->`;
  const content = await readFile(path, 'utf-8');
  if (content.includes(marker)) {
    return { written: false, deduped: true, path, key };
  }

  const heading = resolveTitle(title, block);
  const body = groomBlockBody(block);
  const entry = [`## ${heading}`, '', `**Tag:** ${tag}`, marker, '', body, '', '---'].join('\n');

  const inserted = insertAboveFooter(content, entry);
  const bumped = rewriteFooter(inserted, date);
  await atomicWrite(path, bumped);
  return { written: true, path, key };
}

// ─────────────────────────────────────────────────────────────────────────────
// Discharge — recording that a row's work shipped (M5.E10 FR9 / `B94`)
//
// THE BUG. Everything above this line writes. Nothing above it CLOSES. The two
// write paths are create-if-missing and promote-append, and `commands/ship.md`
// reconciles five document surfaces at Epic close while touching this file in
// none of them. So the one document users treat as the queue is the one with no
// closing mechanism, and it asserts `pending` about shipped work indefinitely —
// measured 2026-08-13 in Signal's own tree (four rows describing work finished
// that same day) and in the field (a backlog two weeks stale, ~15 shipped
// slices reading as pending).
//
// That is not a convenience gap. It is a document actively asserting false
// completeness, which is the class `CLAIM-INTEGRITY-ANALYSIS.md` names.
//
// WHY THE HEADING IS REWRITTEN AND NOT JUST MARKED. The obvious implementation
// is an HTML comment beside the row, matching the `backlog-key` convention
// above. It would be wrong: a comment does not render, so the document a reader
// opens still says the same false thing. The record has to be the part a person
// sees. The heading carries `by` and `at` in readable form and there is NO
// parallel machine marker, deliberately — two homes for one fact is the shape
// `B82` shipped, where a template-built candidate list and a derived one agreed
// in this repo by construction and disagreed in 8 of 12 real projects.
// ─────────────────────────────────────────────────────────────────────────────

/** Outcomes of discharging one named row. Four, and all four are distinct. */
export const ROW_DISCHARGE = Object.freeze({
  DISCHARGED: 'discharged',
  ALREADY_DISCHARGED: 'already-discharged',
  NOT_FOUND: 'not-found',
  AMBIGUOUS: 'ambiguous',
});

/**
 * The one un-evaluable reason `/sig:docs-sweep` renders as silence rather than a
 * finding. EXPORTED and compared by equality, never by prefix: a reworded string
 * would silently turn the sweep noisy on the 8 of 12 corpus projects that keep no
 * backlog, and nothing would fail. `REASON_GREENFIELD` in `sweep.js` solved the
 * same problem the same way.
 */
export const REASON_NO_BACKLOG = 'no BACKLOG.md — this project keeps no queue here';

/** The `/sig:docs-sweep` check's three outcomes (NFR4). */
export const BACKLOG_DISCHARGE = Object.freeze({
  CLEAN: 'clean',
  STALE: 'stale',
  CANNOT_EVALUATE: 'cannot-evaluate',
});

// `STRUCK_RE`, `DONE_WORD_RE`, `LEADING_ID_RE` and the other row-reading
// regexes, `readRowDischarge`, `declaresBugDischarge` and `parseBacklogRows`
// live in `legacy-lists.js` since M6.E13 t4.1 (Decision 12), re-exported here.
// `HELD_OPEN_RE` stays here: no parser reads it, and its readers are the
// heading classifiers and `backlogDischargeStatus` in this module.
export { DONE_WORD_RE, declaresBugDischarge, parseBacklogRows };

// The one way a row overrides the check: it says, in the heading a reader sees,
// that it stays open on purpose. Added after running the check on Signal's own
// file — without it, a row legitimately outliving the unit that named it is
// flagged every run forever, which is precisely how a detector earns the mute
// that makes it useless. The reason belongs in the row; this only needs the
// declaration.
const HELD_OPEN_RE = /\b(?:STILL|KEPT|HELD)\s+OPEN\b/i;

// Ordered: the most specific declaration wins the `kind` label, so a row saying
// both "parked" and "not sprint material" reports one reason rather than racing.
const NOT_LIVE_VOCABULARY = [
  ['parked', /\bparked\b|\bnot sprint material\b/i],
  ['reconciliation', /\breconciliation\b/i],
  ['shelved', /\bshelved\b/i],
  ['held-open', HELD_OPEN_RE],
];

/**
 * What `NOT_LIVE_VOCABULARY` drops on THIS repository's own `BACKLOG.md` today,
 * measured through `readCorpus` + `rankRows` and pinned by
 * `tests/advise-live-measurement.test.js` (`M6.E8` NFR6). There is no `rows`
 * field — see `BLOCKED_MEASURED`'s docblock for why a population pin was removed.
 * A red pin is a re-measurement step — read the new or vanished hit, decide whether
 * the vocabulary is still precise, update this constant.
 */
export const NOT_LIVE_MEASURED = Object.freeze({ on: '2026-09-14', hits: 4 });

/**
 * Whether a heading declares, in its own words, that it is not actionable work.
 *
 * `M6.E7` t3.1 input 5. Two categories share one shape — a row that is PARKED
 * (real work, deliberately not now) and a row that is a RECORD (a dated
 * reconciliation note, never work) — and both announce themselves in the heading.
 *
 * ⚠ IT READS THE HEADING, NOT THE BODY, AND THAT IS THE POINT. The bug this
 * exists to fix came from a heuristic that read a row's whole body and therefore
 * matched a trigger belonging to a DIFFERENT item, inside a watchlist row that
 * maintains other items' triggers. A self-declaration belongs where a reader sees
 * it — the same rule `readRowDischarge` follows, and the same reason
 * `HELD_OPEN_RE` tests the heading.
 *
 * **Vocabulary measured before it was chosen** (2026-09-06, on the 50 live rows
 * this repository's own BACKLOG.md had then): `parked` ×2, `not sprint material`
 * ×1, `reconciliation` ×2, `(STILL|KEPT|HELD) OPEN` ×0. All four matching rows
 * were read individually — zero false positives. `shelved` is included by
 * analogy with **zero** live instances, declared rather than implied.
 *
 * ⚠ The LIVE count is not repeated here. It is `NOT_LIVE_MEASURED` below,
 * asserted on every run by `tests/advise-live-measurement.test.js` — a number
 * in a docblock is a claim written from memory the moment the file moves, and
 * this one was: the file moved while this text still said 50. (The populations
 * the shipped code computes today are **52** rows received and **45** live after
 * every drop; an intermediate "48" in older comments was the live count before
 * the fold input existed.)
 *
 * ⚠ `deferred` is deliberately EXCLUDED: it occurs in live-work prose ("deferred
 * from E2"), so including it trades two known false positives for an unknown
 * number of false negatives.
 *
 * ⚠ THIS DOES NOT WIDEN `HELD_OPEN_RE`. That regex is read by
 * `backlogDischargeStatus` to mean "declared open on purpose, do not flag as
 * stale"; widening it would change a shipped check's behaviour as a side effect.
 * This subsumes its MEANING for a new caller without touching its use.
 *
 * @param {string} headingText — a row's heading, not its body
 * @returns {{notLive: boolean, kind: string|null, declaration: string|null}}
 */
export function declaresNotLiveWork(headingText) {
  const text = String(headingText ?? '');
  for (const [kind, re] of NOT_LIVE_VOCABULARY) {
    const m = text.match(re);
    if (m) return { notLive: true, kind, declaration: m[0] };
  }
  return { notLive: false, kind: null, declaration: null };
}

// ── `M6.E8` FR4 — a heading that says the work moved elsewhere, and `KEPT`.
//
// Two vocabularies with OPPOSITE effects sit in the same heading position on
// the real file: five live rows announce that their work lives somewhere else
// (`FOLDED INTO M5.E10`, `absorbed into M5.E12` ×2, `KEPT, re-homed`, `KEPT,
// absorbed into M5.E11`), and two of the five say **KEPT** first. That is the
// maintainer saying "do not drop this", arriving in wording `HELD_OPEN_RE` does
// not match. So `KEPT` is an OVERRIDE evaluated before the fold vocabulary is
// consulted, never one more phrase inside it: lumping them drops two rows the
// maintainer explicitly kept, which `rankRows` names as the worst thing it can
// do. Approved by Brett 2026-09-07 (`D-M6E8-4`) — it is a question about what
// the author MEANT, not what the file says, so DISCUSS refused to decide it alone.
//
// ⚠ HEADING ONLY, the same rule as `declaresNotLiveWork` above and for the same
// reason. One live row mentions a fold phrase in its BODY alone (the obligation
// tracker row, which discusses folding); reading bodies would drop it.
//
// ⚠ THE TWO SIDES HAVE DIFFERENT CASE RULES, and that asymmetry is the whole
// point. A `kept` false positive PRESERVES a row — the safe direction — so the
// override is case-INSENSITIVE. A fold false positive DROPS one — the unsafe
// direction — so the fold vocabulary is case-SENSITIVE and matches only the
// literal forms that were measured. Without that, `folded into M5.E10` written
// as ordinary lowercase prose in a heading drops a live row.
//
// It costs nothing: all five real headings match exactly under the case-sensitive
// forms (verified — `**FOLDED INTO`, `absorbed into` ×3, `re-homed`), so the
// exact-case count is 5, identical to any-case. An earlier version of this
// comment claimed both sides were case-insensitive AND that this bought "the safe
// failure", which is incoherent for the fold half; a fresh-context reviewer
// caught the comment asserting the safer behaviour while the code implemented
// the less safe one.
//
// ⚠ THIS DOES NOT WIDEN `HELD_OPEN_RE` (NFR3). `backlogDischargeStatus` reads
// that regex to mean "declared open on purpose, do not flag as stale"; a `KEPT`
// without `OPEN` is read here, by a new caller, and nowhere else.
//
// ⚠ AND THE TWO DO NOT AGREE, WHICH IS STATED RATHER THAN IMPLIED. An earlier
// draft of this comment claimed the override "carries the meaning `HELD_OPEN_RE`
// already carries". It does not, and a fresh-context audit caught the claim:
// inside the ADVISOR that regex sits in `NOT_LIVE_VOCABULARY`, so `KEPT OPEN` is
// a DROP signal (input 5, "declared open on purpose, therefore not actionable
// now") while a bare `KEPT` here is a PRESERVE signal. Verified: a heading
// reading `**KEPT OPEN**, absorbed into M5.E11` returns `notLive: true` AND
// `kept: true`, and input 5 wins. Zero live rows hit it. Reconciling them means
// deciding what a maintainer's `KEPT OPEN` should mean to a ranking — a design
// call, not this Epic's; recorded in `M6.E8-REVIEW.md`.
const KEPT_OVERRIDE_RE = /\bKEPT\b/i;
const FOLD_VOCABULARY = [
  ['folded-into', /\bFOLDED INTO\b/],
  ['absorbed-into', /\babsorbed into\b/],
  // Without `re-homed` the override preserves ONE row, not two — the second
  // real KEPT heading says `KEPT, re-homed`. AC4.3's "exactly 2 preserved" is
  // what put this phrase in the vocabulary; it is not an analogy.
  ['re-homed', /\bre-homed\b/],
];

/**
 * What the fold vocabulary DROPS and what `KEPT` PRESERVES on THIS repository's
 * own `BACKLOG.md`, measured through `readCorpus` + `rankRows` and pinned by
 * `tests/advise-live-measurement.test.js` (`M6.E8` NFR6). Five live headings
 * carry a fold phrase; `FOLD_MEASURED.hits` is the three that drop,
 * `KEPT_MEASURED.hits` the two the override preserves. A red pin is a
 * re-measurement step — read the new or vanished hit, decide whether the
 * vocabulary is still precise, update the constant.
 */
export const FOLD_MEASURED = Object.freeze({ on: '2026-09-14', hits: 3 });
export const KEPT_MEASURED = Object.freeze({ on: '2026-09-14', hits: 2 });

/**
 * Whether a heading declares, in its own words, that its work moved elsewhere —
 * unless it also says `KEPT`, which wins.
 *
 * @param {string} headingText — a row's heading, not its body
 * @returns {{moved: boolean, kind: string|null, declaration: string|null, kept: boolean}}
 */
export function declaresWorkMovedElsewhere(headingText) {
  const text = String(headingText ?? '');
  const kept = text.match(KEPT_OVERRIDE_RE);
  if (kept) return { moved: false, kind: null, declaration: kept[0], kept: true };
  for (const [kind, re] of FOLD_VOCABULARY) {
    const m = text.match(re);
    if (m) return { moved: true, kind, declaration: m[0], kept: false };
  }
  return { moved: false, kind: null, declaration: null, kept: false };
}

// ── `M6.E8` FR1 — a heading that says it DISCHARGES a bug. The pattern and
// `declaresBugDischarge` live in `legacy-lists.js` (M6.E13 t4.1), with the
// reasoning behind every narrowing.

/**
 * What `BUG_DISCHARGE_RE` hits on THIS repository's own `BACKLOG.md`, measured
 * through `readCorpus` + `rankRows` against the `confirmed` set and pinned by
 * `tests/advise-live-measurement.test.js` (`M6.E8` NFR6). Zero: two live
 * headings name a bug id at all (`B87`, `B90`; `B73`, `B76`) and all four read
 * `fixed`. A red pin means a heading now claims a discharge — read it.
 */
export const BUG_DISCHARGE_MEASURED = Object.freeze({ on: '2026-09-14', hits: 0 });

/** The heading line a discharged row renders as. */
function renderDischargedHeading(depth, text, by, at) {
  const stamp = at ? `${by}, ${at}` : String(by);
  return `${'#'.repeat(depth)} ~~${text}~~ · **DONE — ${stamp}**`;
}

/**
 * Record that named backlog rows are done.
 *
 * The caller NAMES the rows — nothing here infers which work shipped. That
 * split is deliberate: inference belongs in the read-only sweep check, where
 * being wrong costs a line of report, not an edit to the queue.
 *
 * Hand-groomed rows have no stable id, so a heading substring is the only
 * handle there is. A query matching more than one live row therefore **refuses**
 * rather than taking the first: "first wins" on an ambiguous handle silently
 * strikes the wrong row, and the wrong row is one a reader then trusts.
 *
 * @param {string} baseDir — project root
 * @param {object} opts
 * @param {string[]} opts.rows — heading substrings naming the rows to discharge
 * @param {string} opts.by — what discharged them (an Epic id, a version)
 * @param {string} [opts.at] — ISO date
 * @param {string} [opts.today] — ISO date for the footer bump
 * @returns {Promise<{written:boolean, path:string, reason:string|null,
 *   results:Array<{row:string, status:string, reason:string|null, heading:string|null, line:number|null, id?:string}>}>}
 *   With the store on, a named row is an item and is CLOSED (`fixed`, the
 *   discharge stamp as proof) — see `dischargeInStore`. `line` is null there.
 */
export async function dischargeBacklogRows(baseDir, opts = {}) {
  const { rows = [], by, at, today } = opts;
  const path = join(baseDir, BACKLOG_REL);
  const base = { written: false, path, reason: null, results: [] };

  if (isStoreOn(baseDir).on) {
    // Test seam, like checkpoint.js's `_renameFn`: own-property + typeof guard.
    const renameFn = Object.hasOwn(opts, '_renameFn') && typeof opts._renameFn === 'function' ? opts._renameFn : undefined;
    return dischargeInStore(baseDir, { rows, by, at, today, base, renameFn });
  }

  if (!existsSync(path)) {
    return { ...base, reason: `${BACKLOG_REL} not present — nothing to discharge` };
  }
  let content;
  try {
    content = await readFile(path, 'utf-8');
  } catch (err) {
    return { ...base, reason: `could not read ${BACKLOG_REL}: ${err.message}` };
  }

  // `B121`: a CRLF file is edited as LF and written back as CRLF, so the
  // struck heading and the footer bump do not leave LF lines in a CRLF file.
  const crlf = content.includes('\r\n') && !/(^|[^\r])\n/.test(content);
  if (crlf) content = content.replace(/\r\n/g, '\n');
  const lines = content.split('\n');
  const live = parseBacklogRows(content, { maxDepth: 4 }).filter((r) => !r.inDetails);
  const results = [];
  const edits = [];

  for (const query of rows) {
    const needle = String(query).toLowerCase();
    const hits = live.filter((r) => r.text.toLowerCase().includes(needle));

    if (hits.length === 0) {
      results.push({ row: query, status: ROW_DISCHARGE.NOT_FOUND, reason: `no live backlog row matches ${JSON.stringify(query)}`, heading: null, line: null });
      continue;
    }
    if (hits.length > 1) {
      results.push({
        row: query,
        status: ROW_DISCHARGE.AMBIGUOUS,
        reason: `${JSON.stringify(query)} matches ${hits.length} rows (lines ${hits.map((h) => h.line).join(', ')}) — name one of them exactly`,
        heading: null,
        line: null,
      });
      continue;
    }
    const [hit] = hits;
    if (hit.discharged) {
      results.push({ row: query, status: ROW_DISCHARGE.ALREADY_DISCHARGED, reason: `already recorded done at line ${hit.line}`, heading: hit.text, line: hit.line });
      continue;
    }
    edits.push(hit);
    results.push({ row: query, status: ROW_DISCHARGE.DISCHARGED, reason: null, heading: hit.text, line: hit.line });
  }

  if (edits.length === 0) return { ...base, results };

  for (const row of edits) {
    lines[row.line - 1] = renderDischargedHeading(row.depth, row.text, by ?? 'unspecified', at);
  }
  const bumped = rewriteFooter(lines.join('\n'), today ?? at ?? isoToday());
  await atomicWrite(path, crlf ? bumped.replace(/\n/g, '\r\n') : bumped);
  return { written: true, path, reason: null, results };
}

// The store-on discharge (M6.E11 t4.3). The rows a discharge can name are the
// rows the generated BACKLOG.md shows: items that are neither BUG nor Q and
// are past the inbox. Same refusals as the list version — no match, or more
// than one open match, writes nothing for that query — and an item already
// closed reads as already discharged. Each hit is closed `fixed`, with the
// stamp the list heading would have carried as its proof.
//
// All the closes are ONE `closeItems` batch: one lock, one regeneration, and
// all or nothing — a failure on one row leaves every row open. Two queries
// naming the same item close it once.
async function dischargeInStore(baseDir, { rows, by, at, today, base, renameFn }) {
  const { closeItems, listItems } = await import('./work-ops.js');
  const who = by ?? 'unspecified';
  const when = at ?? today ?? isoToday();
  const proof = `DONE — ${at ? `${who}, ${at}` : String(who)}`;
  const rowsOf = listItems(baseDir).filter((r) => r.item.type !== 'BUG' && r.item.type !== 'Q' && r.item.status !== 'N');
  const results = [];
  const toClose = [];

  for (const query of rows) {
    const needle = String(query).toLowerCase();
    const hits = rowsOf.filter((r) => String(r.item.title ?? r.item.id).toLowerCase().includes(needle));
    const open = hits.filter((r) => r.item.status !== 'C');
    if (open.length > 1) {
      results.push({
        row: query,
        status: ROW_DISCHARGE.AMBIGUOUS,
        reason: `${JSON.stringify(query)} matches ${open.length} items (${open.map((h) => h.item.id).join(', ')}) — name one of them exactly`,
        heading: null,
        line: null,
      });
    } else if (open.length === 1) {
      const [hit] = open;
      if (!toClose.includes(hit.item.id)) toClose.push(hit.item.id);
      results.push({ row: query, status: ROW_DISCHARGE.DISCHARGED, reason: null, heading: hit.item.title ?? hit.item.id, line: null, id: hit.item.id });
    } else if (hits.length > 0) {
      const [hit] = hits;
      results.push({ row: query, status: ROW_DISCHARGE.ALREADY_DISCHARGED, reason: `already closed (${hit.item.close?.reason}) at ${hit.path}`,
        heading: hit.item.title ?? hit.item.id, line: null, id: hit.item.id });
    } else {
      results.push({ row: query, status: ROW_DISCHARGE.NOT_FOUND, reason: `no live backlog row matches ${JSON.stringify(query)}`, heading: null, line: null });
    }
  }

  if (toClose.length > 0) {
    // The proof is the stamp built above from `by` and `at`, not free text,
    // so there is nothing new for the scrub to ask about.
    const closed = await closeItems(baseDir, toClose.map((id) => ({ id, reason: 'fixed', by: String(who), at: when, proof })),
      { renameFn, acknowledgeSensitive: true });
    if (closed?.aborted) return { ...base, ...closed, results };
  }
  return { ...base, written: toClose.length > 0, results };
}

/**
 * Which backlog rows name work that is provably finished (AC9.4).
 *
 * THE NARROWING, AND WHY IT IS NOT THE OBVIOUS RULE (AC9.5). The literal
 * reading — flag a live row that mentions any closed unit id — was run against
 * Signal's own 1441-line BACKLOG.md and reported **4 rows, of which 3 were
 * not defects**: two `##` section headers, and a row reading *"absorbed into
 * `M5.E12`"*, which names its destination rather than claiming to be that work.
 * The shipped rule reads the id a row **leads with** and reports **1**, which
 * is the real one. `FR8` made this exact move earlier in the same Epic, where a
 * literal reading found 62 episodes and the narrowed one found 5.
 *
 * Closure is not re-derived here. It comes from `resolveClosures`, which is
 * already Signal's definition — including the current-unit exclusion (an
 * in-flight Epic is not closed) and `B64`'s stub-retrospective veto — and from
 * `BUGS.md`'s catalog. A second definition of "closed" is the thing this Epic
 * spent S1 removing.
 *
 * @param {string} baseDir — project root
 * `sources` (`M6.E8` t1.4, `D-M6E8-9`) says, per closure source, whether this
 * run could READ it — additive, and carried on every return path. The OUTCOME
 * cannot say that: `clean` is reachable with BUGS.md unreadable, provided no
 * open row leads with a bug id, so a caller keying "was BUGS.md consulted" off
 * the outcome over-claims. `/sig:advise` derives its *Consulted by the ranking*
 * line from this field for exactly that reason.
 *
 * @returns {Promise<{outcome:string, reason:string|null, rows:number,
 *   liveRows:number, resolvable:number, stale:Array<{heading:string, line:number, id:string, evidence:string}>,
 *   sources:{units:boolean, bugs:boolean}}>}
 */
export async function backlogDischargeStatus(baseDir, { readText = null } = {}) {
  // Store on (M6.E13 t4.5a): the records, never BACKLOG.md — a view. See
  // `storeDischargeStatus`. A WORK.md that cannot be read is cannot-evaluate,
  // never a fall-back to the view.
  let storeOn;
  try {
    storeOn = isStoreOn(baseDir).on;
  } catch (err) {
    return storeCannot(`the work store could not be read — ${err.message}`);
  }
  if (storeOn) return storeDischargeStatus(baseDir);

  const path = join(baseDir, BACKLOG_REL);
  const cannot = (reason, extra = {}) => ({
    outcome: BACKLOG_DISCHARGE.CANNOT_EVALUATE,
    reason,
    rows: 0,
    liveRows: 0,
    resolvable: 0,
    stale: [],
    sources: { units: false, bugs: false },
    ...extra,
  });

  if (!existsSync(path)) return cannot(REASON_NO_BACKLOG);

  // `readText(rel)` lets a caller impose its own read rule — `/sig:advise` reads
  // planning files only as regular, non-linked files (`M6.E12` REVIEW pass 3).
  let content;
  try {
    content = readText ? await readText(BACKLOG_REL) : await readFile(path, 'utf-8');
  } catch (err) {
    return cannot(`BACKLOG.md could not be read — ${err.message}`);
  }

  const all = parseBacklogRows(content, { maxDepth: 4 });
  const live = all.filter((r) => !r.inDetails);
  const open = live.filter((r) => !r.discharged);
  // The resolvable population is every live row that leads with an id, DISCHARGED
  // ONES INCLUDED. Counting only open rows made the check go blind at the moment
  // it succeeded: discharge the last stale row and the population hits zero, so a
  // just-reconciled backlog reported `cannot-evaluate` instead of `clean` — the
  // check's own success erasing its ability to say so. Found by its own test.
  const candidates = live.filter((r) => r.leadingId !== null);
  const counts = { rows: all.length, liveRows: open.length, resolvable: candidates.length };

  if (candidates.length === 0) {
    // The field shape `B94` came from: a real backlog with rows a person reads
    // fine and a machine cannot link to anything. Reporting "clean" here would
    // be the exact claim this Epic exists to stop.
    return cannot(
      `no backlog row leads with a unit or bug id — this check cannot link ${open.length} open row(s) to any closure record`,
      counts
    );
  }

  // Closure comes from TWO sources answering two different id families, and the
  // blindness of one is not the silence of the other. Asking a single merged
  // map "is this id closed?" made a MISSING answer indistinguishable from a NO:
  // with no readable STATE.md every unit resolves `cannotDetermine`, so Epic
  // closure was unknowable while a readable BUGS.md kept the map non-empty and
  // the check reported **clean** on Epic-named rows. That is `M5.E19`'s defect
  // verbatim — a report taking its answer from the half that cannot see an
  // unreadable STATE.md — reproduced inside the release whose NFR4 forbids it.
  const { units, bugs, blind: blindSources } = await readClosureSources(baseDir, readText);
  // Which of the two this run could open — `null` is the reader's own "could not".
  const sources = { units: units !== null, bugs: bugs !== null };

  const stale = [];
  const blind = [];
  for (const row of candidates) {
    if (row.discharged) continue; // already records its own closure
    if (HELD_OPEN_RE.test(row.text)) continue; // declared open on purpose

    const isBug = isBugId(row.leadingId);
    const source = isBug ? bugs : units;
    if (source === null) {
      blind.push({ heading: row.text, line: row.line, id: row.leadingId, source: isBug ? 'BUGS.md' : 'unit closure' });
      continue;
    }
    const verdict = source.get(row.leadingId);
    if (verdict === undefined) {
      // The id names nothing this source records. For a UNIT that is a real
      // answer — `resolveUnitClosure` calls a unit with no terminal artifact
      // open. For a BUG it is not: the catalog is the whole population, so an
      // id missing from it is one the check could not look up.
      if (isBug) blind.push({ heading: row.text, line: row.line, id: row.leadingId, source: 'BUGS.md' });
      continue;
    }
    if (verdict.closed) stale.push({ heading: row.text, line: row.line, id: row.leadingId, evidence: verdict.reason });
  }

  if (stale.length === 0 && blind.length > 0) {
    const why = [...new Set(blind.map((b) => b.source))].join(' and ');
    return cannot(
      `${blind.length} row(s) name work whose closure could not be read (${why}${blindSources.length ? ` — ${blindSources.join('; ')}` : ''})`,
      { ...counts, blind, sources }
    );
  }

  return {
    outcome: stale.length > 0 ? BACKLOG_DISCHARGE.STALE : BACKLOG_DISCHARGE.CLEAN,
    reason: null,
    ...counts,
    stale,
    blind,
    sources,
  };
}

const storeCannot = (reason) => ({
  outcome: BACKLOG_DISCHARGE.CANNOT_EVALUATE,
  reason,
  rows: 0,
  liveRows: 0,
  resolvable: 0,
  stale: [],
  blind: [],
  broken: [],
  sources: { units: false, bugs: false, records: false },
});

/**
 * `backlogDischargeStatus` with the work store on (M6.E13 t4.5a) — and the ONE
 * definition `/sig:docs-sweep`'s `checkBacklogDischarge` renders (t4.4 wrote it
 * there first; it lives here so the two cannot disagree).
 *
 * A record cannot say "pending" about itself while closed — its status is
 * folded from its events — so the old question (a row naming finished work)
 * becomes the one a record CAN still get wrong: an item still open (T, Q or P)
 * in an Epic that is recorded closed. The Epic is the record's own (`epicOf`),
 * never an id read out of a title. Closed means archived (`isEpicArchived`), or
 * closed by `resolveClosures` — the unit half of `readClosureSources`, the same
 * definition the file check uses. The bug half is not needed: a bug is a record
 * whose own status says whether it is closed. A *closing* item is done (AC7.3)
 * and never reported.
 *
 * Shape: the store-off result's, with `line: null`, plus `epic` and `status`
 * on each stale and blind entry and `broken` (records that do not read, by ID).
 * `rows` and `liveRows` count the live items (T, Q, P); `resolvable` those in an
 * Epic. With none in an Epic the outcome is `clean`: every record's Epic is
 * known, so "in no Epic" is an answer, unlike a row with no leading id.
 * `sources.units` is whether unit closure was READ (false when no item needed
 * it, or it could not be); `sources.bugs` is false (not consulted);
 * `sources.records` is true. `readText` does not apply: nothing is read as text.
 *
 * @param {string} baseDir
 * @returns {Promise<object>}
 */
export async function storeDischargeStatus(baseDir) {
  let store;
  try {
    store = listRecords(baseDir);
  } catch (err) {
    return storeCannot(`the work store could not be read — ${err.message}`);
  }
  const live = store.records.filter((r) => ['T', 'Q', 'P'].includes(r.status));
  const inEpic = live.filter((r) => r.epic);
  const archived = new Map(inEpic.map((r) => [r.epic, isEpicArchived(baseDir, r.epic)]));

  let units = null;
  let unitsBlind = null;
  if (inEpic.some((r) => !archived.get(r.epic))) {
    const closure = await readUnitClosure(baseDir);
    units = closure.units;
    unitsBlind = closure.blind[0] ?? null;
  }

  const stale = [];
  const blind = [];
  for (const r of inEpic) {
    const at = { heading: String(r.record.title ?? r.id), line: null, id: r.id, epic: r.epic, status: r.status };
    if (archived.get(r.epic)) stale.push({ ...at, evidence: `${r.epic} is archived` });
    else if (units === null) blind.push({ heading: at.heading, line: null, id: r.id, epic: r.epic, source: 'unit closure' });
    else if (units.get(r.epic)?.closed) stale.push({ ...at, evidence: units.get(r.epic).reason });
  }

  const blindAll = blind.length > 0 || store.broken.length > 0;
  return {
    outcome: stale.length > 0 ? BACKLOG_DISCHARGE.STALE : blindAll ? BACKLOG_DISCHARGE.CANNOT_EVALUATE : BACKLOG_DISCHARGE.CLEAN,
    reason: stale.length === 0 && blindAll
      ? [blind.length ? `${blind.length} item(s) sit in an Epic whose closure could not be read — ${unitsBlind}` : null,
        store.broken.length ? `${store.broken.length} work item(s) could not be read` : null].filter(Boolean).join('; ')
      : null,
    rows: live.length,
    liveRows: live.length,
    resolvable: inEpic.length,
    stale,
    blind,
    unitsBlind,
    broken: store.broken,
    sources: { units: units !== null, bugs: false, records: true },
  };
}

/**
 * The two closure sources, kept apart.
 *
 * `resolveClosures` owns unit closure — including the current-unit exclusion and
 * `B64`'s stub-retrospective veto — and `walkBugEntries` owns the bug catalog.
 * A source that could not answer returns **null**, never an empty map: an empty
 * map says "nothing is closed", which is a result, and a null says "I could not
 * look", which is not. Collapsing the two is the whole defect class.
 *
 * **A stated limit:** `resolveClosures` derives units from the LIVE `.planning/`
 * tree, so a row naming an already-archived unit finds no entry and is read as
 * open. That is a miss rather than a false clean, and widening it means teaching
 * the closure resolver to read the archive — that module's decision, not this one's.
 *
 * @returns {Promise<{units: Map|null, bugs: Map|null, blind: string[]}>}
 */
async function readClosureSources(baseDir, readText = null) {
  const { units, blind } = await readUnitClosure(baseDir, readText);
  let bugs = null;

  try {
    const { walkBugEntries } = await import('./bugs-tally.js');
    const content = readText ? await readText(BUGS_REL) : await readFile(join(baseDir, BUGS_REL), 'utf-8');
    bugs = new Map();
    for (const e of walkBugEntries(content)) {
      if (e.kind !== 'row' || !e.id) continue;
      if (e.status === null) continue; // unreadable status cell — no answer
      bugs.set(e.id, {
        closed: e.status === 'fixed' || e.status === 'dismissed',
        reason: `BUGS.md records ${e.id} ${e.status}`,
      });
    }
  } catch (err) {
    blind.push(`the bug catalog could not be read — ${err.message}`);
  }

  return { units, bugs, blind };
}

// The unit half of `readClosureSources`: `resolveClosures`, as a map of unit →
// `{closed, reason}`, or null when it could not answer. Shared with the
// store-on `storeDischargeStatus`, which needs no bug source.
async function readUnitClosure(baseDir, readText = null) {
  const blind = [];
  let units = null;
  try {
    const { resolveClosures, CLOSURE } = await import('./closure.js');
    const { relative } = await import('node:path');
    const res = await resolveClosures(
      baseDir,
      readText ? { readFileFn: async (abs) => readText(relative(baseDir, abs)) } : {}
    );
    if (!res.stateReadable) {
      // Every unit came back `cannotDetermine` for one project-wide reason.
      blind.push(res.reason ?? 'unit closure is unknowable');
    } else {
      units = new Map();
      for (const u of res.units) {
        if (u.status === CLOSURE.CANNOT_DETERMINE) continue; // no answer for this unit
        units.set(u.unit, { closed: u.status === CLOSURE.CLOSED, reason: u.reason });
      }
    }
  } catch (err) {
    blind.push(`unit closure could not be resolved — ${err.message}`);
  }
  return { units, blind };
}

/** The minimal BUGS.md skeleton used only when a promote must create it. */
function bugsSkeleton() {
  return ['# Bugs', '', 'Confirmed defects and verified findings.', ''].join('\n');
}

/**
 * Promote a classified BUG entry into `.planning/BUGS.md`: a SIMPLE entry
 * (heading + `**Status:** needs-triage` + verbatim body + `---`) built by S1's
 * `buildBugsEntry` and appended at EOF the same way `captureToBugs` does — no
 * B-ID, no table row (triage is a later human step). Carries a `<!-- bugs-key -->`
 * sha1(block) dedupe marker so a re-promote of the same source block is a no-op.
 *
 * Deviation from `captureToBugs` (which throws on a missing BUGS.md): the drain
 * creates BUGS.md if absent, so a bug-classified promote never fails on a project
 * whose BUGS.md has not been scaffolded yet. (Documented S4 deviation.)
 *
 * @param {string} baseDir — project root
 * @param {object} opts
 * @param {string} opts.block — the raw source inbox block (dedupe key = sha1(block))
 * @param {string} [opts.title] — retitle; falls back to the block's heading
 * @param {string} [opts.by] — store on: the `created` event's `by`
 * @param {boolean} [opts.acknowledgeSensitive] — store on: as `promoteToBacklog`
 * @returns {Promise<{written: boolean, deduped?: boolean, path: string, key: string, id?: string, label?: string,
 *   aborted?: 'sensitive-data-pending', sensitiveHits?: object[]}>}
 *   With the store on, a new BUG record, triaged (status T), instead, with
 *   `promoteToBacklog`'s sensitive-data and v1 rules.
 */
export async function promoteToBugs(baseDir, { block, title, by, acknowledgeSensitive } = {}) {
  if (isStoreOn(baseDir).on) {
    return promoteInStore(baseDir, { block, type: 'BUG', title, keyName: 'bugs-key', by, acknowledgeSensitive });
  }
  const path = join(baseDir, BUGS_REL);
  const key = blockKey(block);
  const marker = `<!-- bugs-key: ${key} -->`;

  let content;
  if (existsSync(path)) {
    content = await readFile(path, 'utf-8');
  } else {
    await mkdir(dirname(path), { recursive: true });
    content = bugsSkeleton();
  }
  if (content.includes(marker)) {
    return { written: false, deduped: true, path, key };
  }

  const heading = resolveTitle(title, block);
  const body = groomBlockBody(block);
  const built = buildBugsEntry({ body, title: heading });
  // Inject the dedupe marker under the needs-triage Status line so it travels
  // with the entry and a re-promote sees it (crash-safe convergence for t4).
  // B23 nit-2: fail LOUD if buildBugsEntry's template ever drops that exact anchor — a
  // silent no-op replace would strip the marker and break dedupe (re-promotes duplicate).
  const STATUS_ANCHOR = '**Status:** needs-triage';
  if (!built.includes(STATUS_ANCHOR)) {
    throw new Error(
      `promoteToBugs: buildBugsEntry output is missing the "${STATUS_ANCHOR}" anchor — ` +
        'cannot inject the dedupe marker (buildBugsEntry template drift?).'
    );
  }
  const entry = built.replace(STATUS_ANCHOR, `${STATUS_ANCHOR}\n${marker}`);
  const next = insertAtEnd(content, entry);
  await atomicWrite(path, next);
  return { written: true, path, key };
}
