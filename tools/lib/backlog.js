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
import { insertAboveFooter, rewriteFooter, buildBugsEntry, insertAtEnd } from './add.js';

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
 */
export async function createBacklogIfMissing(baseDir, opts = {}) {
  const path = join(baseDir, BACKLOG_REL);
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
 * @returns {Promise<{written: boolean, deduped?: boolean, path: string, key: string}>}
 */
export async function promoteToBacklog(baseDir, { block, tag, title, today } = {}) {
  if (!VALID_TAGS.has(tag)) {
    throw new Error(
      `promoteToBacklog: tag must be "roadmap" or "hygiene", got ${JSON.stringify(tag)}.`
    );
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
 * The one un-evaluable reason `/sig:sweep` renders as silence rather than a
 * finding. EXPORTED and compared by equality, never by prefix: a reworded string
 * would silently turn the sweep noisy on the 8 of 12 corpus projects that keep no
 * backlog, and nothing would fail. `REASON_GREENFIELD` in `sweep.js` solved the
 * same problem the same way.
 */
export const REASON_NO_BACKLOG = 'no BACKLOG.md — this project keeps no queue here';

/** The `/sig:sweep` check's three outcomes (NFR4). */
export const BACKLOG_DISCHARGE = Object.freeze({
  CLEAN: 'clean',
  STALE: 'stale',
  CANNOT_EVALUATE: 'cannot-evaluate',
});

const STRUCK_RE = /~~[^~]+~~/;
// The done-word must sit inside a **bold status marker**, not merely somewhere in
// the heading. `/\bDONE\b/i` matches ordinary English: measured on the real file,
// 4 headings carry a done-word that is neither bold nor struck and ALL FOUR are
// prose — *"what shipped"*, *"after v0.1.19 shipped"*, *"shipped but never run"*,
// *"open/closed work"*. Two of them are live rows the check was therefore
// skipping in silence, which is a false negative rather than a false alarm and so
// the harder one to notice. Zero of the 26 genuinely-closed rows lose their
// marker under this rule: every one is struck, bolded, or both.
const DONE_WORD_RE = /\*\*[^*]{0,80}?\b(DONE|SHIPPED|ABANDONED|CLOSED|CUT|RESOLVED)\b/i;
// "PARTIALLY SHIPPED" / "largely DONE" assert OPEN work. The qualifier is
// stripped before the done-word test rather than special-cased after it, so a
// row carrying both a qualified and an unqualified marker still reads closed.
const QUALIFIED_DONE_RE =
  /\b(?:PARTIALLY|PARTLY|MOSTLY|LARGELY)\s+(?:DONE|SHIPPED|ABANDONED|CLOSED|CUT|RESOLVED)\b/gi;
// The one way a row overrides the check: it says, in the heading a reader sees,
// that it stays open on purpose. Added after running the check on Signal's own
// file — without it, a row legitimately outliving the unit that named it is
// flagged every run forever, which is precisely how a detector earns the mute
// that makes it useless. The reason belongs in the row; this only needs the
// declaration.
const HELD_OPEN_RE = /\b(?:STILL|KEPT|HELD)\s+OPEN\b/i;
const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
const VERSION_RE = /\bv\d+\.\d+(?:\.\d+)?\b/;
const UNIT_ID_RE = /\bM\d+(?:\.\d+)?\.E\d+\b/;
// The id a row LEADS with, past the decoration real headings carry: an ordinal
// (`1. `), a status glyph, backticks, bold, strikethrough.
const LEADING_ID_RE =
  /^[\s`*_~✅▶⚠✂]*(?:\d+\.\s*)?[\s`*_~]*((?:M\d+(?:\.\d+)?\.E\d+)|(?:B\d+))\b/;

/**
 * Whether a heading records its own closure, and what it records.
 *
 * Reads the vocabulary the maintainer already writes by hand — Signal's own
 * BACKLOG.md carries **zero** `backlog-key` markers and 29 hand-struck rows, so
 * a reader keyed to the machine marker would report every one of them as an
 * open row whose work had shipped. `dischargedBy` / `dischargedAt` are exact
 * for rows this module wrote and best-effort for hand-written ones.
 */
function readRowDischarge(text) {
  const unqualified = text.replace(QUALIFIED_DONE_RE, ' ');
  const doneMatch = unqualified.match(DONE_WORD_RE);
  const discharged = STRUCK_RE.test(text) || doneMatch !== null;
  if (!discharged) return { discharged: false, dischargedBy: null, dischargedAt: null };

  // Look for the attribution AFTER the marker: a row named `B52` in its title
  // and discharged by `v0.1.20` must not report `B52` as the discharger.
  const from = doneMatch ? doneMatch.index + doneMatch[0].length : 0;
  const tail = unqualified.slice(from);
  const by = tail.match(VERSION_RE) ?? tail.match(UNIT_ID_RE);
  const at = tail.match(ISO_DATE_RE) ?? text.match(ISO_DATE_RE);
  return { discharged: true, dischargedBy: by ? by[0] : null, dischargedAt: at ? at[1] : null };
}

/**
 * Every backlog row, with its discharge state normalized to `obligations.js`'s
 * field names (`discharged` / `dischargedBy` / `dischargedAt`).
 *
 * ONE definition of "which heading is a row", shared by the writer below and by
 * the `/sig:sweep` check (AC S7.1). Three rules, each measured against the real
 * file rather than assumed:
 *
 *   1. A heading whose next heading is DEEPER is a **container**, not a row.
 *      Signal's file nests `###` rows under `##` sprint headings; a backlog the
 *      drain wrote nests nothing and puts its rows at `##`. A depth-literal rule
 *      would see zero rows in one shape or every section header in the other.
 *   2. A heading inside `<details>` is preserved history — the original entry
 *      kept under a discharged row for the reasoning that set the order. Live
 *      rows only; rewriting one would edit the record.
 *   3. Discharge is read from the hand vocabulary (see `readRowDischarge`).
 *
 * @param {string} content — a BACKLOG.md body
 * @returns {Array<{text:string, line:number, depth:number, inDetails:boolean,
 *   leadingId:string|null, discharged:boolean, dischargedBy:string|null,
 *   dischargedAt:string|null}>}
 */
export function parseBacklogRows(content) {
  const lines = String(content).split('\n');
  const heads = [];
  let detailsDepth = 0;
  let inFence = false;

  lines.forEach((line, i) => {
    const t = line.trimStart();
    if (t.startsWith('```') || t.startsWith('~~~')) inFence = !inFence;
    const m = inFence ? null : line.match(/^(#{2,3})\s+(.*)$/);
    if (m) heads.push({ line: i + 1, depth: m[1].length, text: m[2].trim(), inDetails: detailsDepth > 0 });
    detailsDepth += (line.match(/<details/g) ?? []).length - (line.match(/<\/details>/g) ?? []).length;
    if (detailsDepth < 0) detailsDepth = 0;
  });

  return heads
    .filter((h, i) => !(i + 1 < heads.length && heads[i + 1].depth > h.depth))
    .map((h) => {
      const lead = h.text.match(LEADING_ID_RE);
      return { ...h, leadingId: lead ? lead[1] : null, ...readRowDischarge(h.text) };
    });
}

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
 *   results:Array<{row:string, status:string, reason:string|null, heading:string|null, line:number|null}>}>}
 */
export async function dischargeBacklogRows(baseDir, { rows = [], by, at, today } = {}) {
  const path = join(baseDir, BACKLOG_REL);
  const base = { written: false, path, reason: null, results: [] };

  if (!existsSync(path)) {
    return { ...base, reason: `${BACKLOG_REL} not present — nothing to discharge` };
  }
  let content;
  try {
    content = await readFile(path, 'utf-8');
  } catch (err) {
    return { ...base, reason: `could not read ${BACKLOG_REL}: ${err.message}` };
  }

  const lines = content.split('\n');
  const live = parseBacklogRows(content).filter((r) => !r.inDetails);
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
  await atomicWrite(path, bumped);
  return { written: true, path, reason: null, results };
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
 * @returns {Promise<{outcome:string, reason:string|null, rows:number,
 *   liveRows:number, resolvable:number, stale:Array<{heading:string, line:number, id:string, evidence:string}>}>}
 */
export async function backlogDischargeStatus(baseDir) {
  const path = join(baseDir, BACKLOG_REL);
  const cannot = (reason, extra = {}) => ({
    outcome: BACKLOG_DISCHARGE.CANNOT_EVALUATE,
    reason,
    rows: 0,
    liveRows: 0,
    resolvable: 0,
    stale: [],
    ...extra,
  });

  if (!existsSync(path)) return cannot(REASON_NO_BACKLOG);

  let content;
  try {
    content = await readFile(path, 'utf-8');
  } catch (err) {
    return cannot(`BACKLOG.md could not be read — ${err.message}`);
  }

  const all = parseBacklogRows(content);
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
  const { units, bugs, blind: blindSources } = await readClosureSources(baseDir);

  const stale = [];
  const blind = [];
  for (const row of candidates) {
    if (row.discharged) continue; // already records its own closure
    if (HELD_OPEN_RE.test(row.text)) continue; // declared open on purpose

    const isBug = /^B\d+$/.test(row.leadingId);
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
      { ...counts, blind }
    );
  }

  return {
    outcome: stale.length > 0 ? BACKLOG_DISCHARGE.STALE : BACKLOG_DISCHARGE.CLEAN,
    reason: null,
    ...counts,
    stale,
    blind,
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
async function readClosureSources(baseDir) {
  const blind = [];
  let units = null;
  let bugs = null;

  try {
    const { resolveClosures, CLOSURE } = await import('./closure.js');
    const res = await resolveClosures(baseDir);
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

  try {
    const { walkBugEntries } = await import('./bugs-tally.js');
    const content = await readFile(join(baseDir, BUGS_REL), 'utf-8');
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
 * @returns {Promise<{written: boolean, deduped?: boolean, path: string, key: string}>}
 */
export async function promoteToBugs(baseDir, { block, title } = {}) {
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
