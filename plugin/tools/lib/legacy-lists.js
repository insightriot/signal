// The Markdown list parsers, in one place (M6.E13 t4.1, Decision 12).
//
// Every function here reads one of the hand-kept (or v1-generated) Markdown
// lists — BUGS.md, BACKLOG.md, the issues inbox, OPEN-QUESTIONS.md — by
// matching its text. With a v2 work store on, nothing should: the records are
// the source, and a reader that parses the Markdown instead reads a view that
// can lag them. So the parsers live here, and only here.
//
// The modules they came from (`bugs-tally.js`, `backlog.js`, `drain.js`,
// `status.js`, `work-marker.js`) re-export them statically under the same names,
// so every existing import and every store-off path is unchanged.
//
// ⚠ A LEAF MODULE. It imports nothing from `lib/`. The modules that re-export
// it must never be imported back from here, or the re-export is a cycle.
//
// THE TEST-ONLY FLAG. With `SIGNAL_FORBID_LIST_PARSERS=1` in the environment,
// every exported function throws when CALLED, naming itself — never on import,
// because the mixed modules import these statically for their store-off paths.
// t4.7 runs every store-on reader with the flag set: a reader that still reaches
// a parser fails by name. Unset (always, outside that test), the wrapper only
// forwards the call. Internal calls between parsers go to the unwrapped
// functions, so one call reports the parser the caller reached, not a helper.

const FORBID_FLAG = 'SIGNAL_FORBID_LIST_PARSERS';

function guard(name, fn) {
  const wrapped = function (...args) {
    if (process.env[FORBID_FLAG] === '1') {
      throw new Error(
        `legacy-lists: ${name}() was called while ${FORBID_FLAG}=1 — a Markdown list parser was reached ` +
          'on a path that must read the work records instead (M6.E13 Decision 12)'
      );
    }
    return fn.apply(this, args);
  };
  Object.defineProperty(wrapped, 'name', { value: name });
  return wrapped;
}

// ── BUGS.md (from bugs-tally.js) ────────────────────────────────────────────

/** Status values a table row may carry. */
export const BUG_STATUSES = Object.freeze([
  'needs-triage',
  'confirmed',
  'dismissed',
  'fixed',
]);

// A catalog row: `| B12 | `confirmed` | P2 | …`. The status cell is captured
// loosely (everything up to the closing pipe) and normalised afterwards, so a
// parenthetical like `` `fixed` (v0.1.13) `` counts as `fixed` rather than
// silently missing. Anchored at line start so a row quoted inside prose or a
// fence is not counted.
const TABLE_ROW_RE = /^\|\s*B(\d+)\s*\|([^|]*)\|/;

// A heading-capture's status line: `**Status:** needs-triage`. This is the
// format `/sig:add --bug` writes and the format the 2026-08-03 tally could not
// see.
const CAPTURE_STATUS_RE = /^\*\*Status:\*\*\s*([a-z-]+)/;

// The published tally line. Deliberately loose about what follows the counts —
// the real footer carries a long narrative after `Last updated:` — but strict
// about the `N label` pairs themselves.
const TALLY_LINE_RE = /^\*\s*\d+\s+needs-triage\b/;

// `**2 captured-untriaged**` / `2 captured-untriaged` — bold is cosmetic.
function readCount(line, label) {
  const re = new RegExp(`(\\d+)\\s+\\*{0,2}${label}`);
  const m = line.match(re);
  return m ? Number(m[1]) : null;
}

/**
 * Normalise a raw status cell to one of BUG_STATUSES, or null.
 *
 * Strips markdown decoration, backticks and any trailing parenthetical, so
 * `` `fixed` (v0.1.13) `` and `` `fixed` `` are the same value. Returns null
 * for anything that is not a known status rather than guessing — an unreadable
 * cell is a finding, not a default.
 *
 * @param {string} raw
 * @returns {string|null}
 */
function _parseStatusCell(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[`*_]/g, '')
    .trim()
    .toLowerCase();
  return BUG_STATUSES.includes(cleaned) ? cleaned : null;
}

/**
 * Walk every catalog entry in a BUGS.md body, once, fence-aware.
 *
 * Extracted from `deriveBugCounts` when M5.E10's FR9 needed per-id statuses
 * rather than totals. Counting and looking up an id are two readings of the
 * same rows, and writing the walk twice is `B82`'s shape — a second
 * implementation of "which lines are entries" that agrees with the first only
 * by construction.
 *
 * `line` is 1-indexed and was added ADDITIVELY (`M6.E7` t2.2) so `/sig:advise`
 * can cite a bug row by `path:line`. Additive because `deriveBugCounts` and
 * `readClosureSources` read the same records and must not change; forking the
 * walk to get one field is `B82`'s shape, which this docblock already warns
 * about one paragraph up.
 *
 * @param {string} content
 * @returns {Array<{kind:'row'|'capture', id:string|null, status:string|null, cell:string, line:number}>}
 */
function _walkBugEntries(content) {
  const out = [];
  let inFence = false;
  let lineNo = 0;

  for (const line of String(content).split('\n')) {
    lineNo += 1;
    const t = line.trimStart();
    if (t.startsWith('```') || t.startsWith('~~~')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const row = line.match(TABLE_ROW_RE);
    if (row) {
      out.push({
        kind: 'row',
        id: `B${row[1]}`,
        status: _parseStatusCell(row[2]),
        cell: row[2].trim(),
        line: lineNo,
      });
      continue;
    }

    const cap = line.match(CAPTURE_STATUS_RE);
    if (cap) out.push({ kind: 'capture', id: null, status: cap[1], cell: cap[1], line: lineNo });
  }
  return out;
}

/**
 * Count every entry in a BUGS.md body, in both formats.
 *
 * Fence-aware: a table row or status line inside a ``` block is a literal
 * sample (this file's docblock contains several) and is not counted.
 *
 * @param {string} content
 * @returns {{needsTriage:number, confirmed:number, dismissed:number,
 *   fixed:number, capturedUntriaged:number, tableRows:number, total:number,
 *   unreadable:Array<{id:string, cell:string}>}}
 */
function _deriveBugCounts(content) {
  const counts = { 'needs-triage': 0, confirmed: 0, dismissed: 0, fixed: 0 };
  const unreadable = [];
  let capturedUntriaged = 0;
  let tableRows = 0;

  for (const entry of _walkBugEntries(content)) {
    if (entry.kind === 'capture') {
      capturedUntriaged++;
      continue;
    }
    tableRows++;
    if (entry.status) counts[entry.status]++;
    else unreadable.push({ id: entry.id, cell: entry.cell });
  }

  return {
    needsTriage: counts['needs-triage'],
    confirmed: counts.confirmed,
    dismissed: counts.dismissed,
    fixed: counts.fixed,
    capturedUntriaged,
    tableRows,
    total: tableRows + capturedUntriaged,
    unreadable,
  };
}

/**
 * Read the tally the file publishes, without judging it.
 *
 * @param {string} content
 * @returns {{needsTriage:number|null, capturedUntriaged:number|null,
 *   confirmed:number|null, dismissed:number|null, fixed:number|null,
 *   total:number|null, line:string, lineNumber:number}|null}
 *   null when no tally line is present — distinct from a tally that is wrong.
 */
function _readPublishedTally(content) {
  const lines = String(content).split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trimStart();
    if (t.startsWith('```') || t.startsWith('~~~')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!TALLY_LINE_RE.test(lines[i])) continue;

    const line = lines[i];
    return {
      needsTriage: readCount(line, 'needs-triage'),
      capturedUntriaged: readCount(line, 'captured-untriaged'),
      confirmed: readCount(line, 'confirmed'),
      dismissed: readCount(line, 'dismissed'),
      fixed: readCount(line, 'fixed'),
      total: readCount(line, 'total'),
      line,
      lineNumber: i + 1,
    };
  }
  return null;
}

/**
 * Compare what the file publishes against what it contains.
 *
 * Returns `ok: false` with a named mismatch per wrong cell. A missing tally
 * returns `ok: false` with `reason: 'no-tally'` rather than passing — silence
 * must not read as clean (`B39`; the M5.E16 checked-and-clean vs. could-not-
 * check distinction).
 *
 * @param {string} content
 * @returns {{ok:boolean, reason?:string, derived:object, published:object|null,
 *   mismatches:Array<{cell:string, published:number|null, derived:number}>}}
 */
function _compareBugTally(content) {
  const derived = _deriveBugCounts(content);
  const published = _readPublishedTally(content);

  if (!published) {
    return { ok: false, reason: 'no-tally', derived, published: null, mismatches: [] };
  }

  const cells = [
    ['needs-triage', published.needsTriage, derived.needsTriage],
    ['captured-untriaged', published.capturedUntriaged, derived.capturedUntriaged],
    ['confirmed', published.confirmed, derived.confirmed],
    ['dismissed', published.dismissed, derived.dismissed],
    ['fixed', published.fixed, derived.fixed],
    ['total', published.total, derived.total],
  ];

  const mismatches = cells
    .filter(([, pub, der]) => pub !== der)
    .map(([cell, pub, der]) => ({ cell, published: pub, derived: der }));

  return {
    ok: mismatches.length === 0 && derived.unreadable.length === 0,
    derived,
    published,
    mismatches,
  };
}

export const parseStatusCell = guard('parseStatusCell', _parseStatusCell);
export const walkBugEntries = guard('walkBugEntries', _walkBugEntries);
export const deriveBugCounts = guard('deriveBugCounts', _deriveBugCounts);
export const readPublishedTally = guard('readPublishedTally', _readPublishedTally);
export const compareBugTally = guard('compareBugTally', _compareBugTally);

// ── BACKLOG.md (from backlog.js) ────────────────────────────────────────────

const STRUCK_RE = /~~[^~]+~~/;
// The done-word must sit inside a **bold status marker**, not merely somewhere in
// the heading. `/\bDONE\b/i` matches ordinary English: measured on the real file,
// 4 headings carry a done-word that is neither bold nor struck and ALL FOUR are
// prose — *"what shipped"*, *"after v0.1.19 shipped"*, *"shipped but never run"*,
// *"open/closed work"*. Two of them are live rows the check was therefore
// skipping in silence, which is a false negative rather than a false alarm and so
// the harder one to notice. Zero of the 26 genuinely-closed rows lose their
// marker under this rule: every one is struck, bolded, or both.
//
// UPPER CASE ONLY (`B127`). Case-insensitive, the in-flight marker
// `**IN FLIGHT — EXECUTE done 2026-09-27, VERIFY next**` read as discharged and
// `/sig:advise` stopped seeing the Epic in flight. Measured 2026-10-03 before
// dropping `/i`: zero discharged rows rely on a lower-case done-word, across six
// projects' live BACKLOG.md and five snapshots of Signal's own pre-store file.
export const DONE_WORD_RE = /\*\*[^*]{0,80}?\b(DONE|SHIPPED|ABANDONED|CLOSED|CUT|RESOLVED)\b/;
// "PARTIALLY SHIPPED" / "largely DONE" assert OPEN work. The qualifier is
// stripped before the done-word test rather than special-cased after it, so a
// row carrying both a qualified and an unqualified marker still reads closed.
const QUALIFIED_DONE_RE =
  /\b(?:PARTIALLY|PARTLY|MOSTLY|LARGELY)\s+(?:DONE|SHIPPED|ABANDONED|CLOSED|CUT|RESOLVED)\b/gi;
const ISO_DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
const VERSION_RE = /\bv\d+\.\d+(?:\.\d+)?\b/;
const UNIT_ID_RE = /\bM\d+(?:\.\d+)?\.E\d+\b/;
// The id a row LEADS with, past the decoration real headings carry: an ordinal
// (`1. `), a status glyph, backticks, bold, strikethrough.
//
// **Both decoration runs are BOUNDED, and that is a fix rather than a style.**
// Written first as `[…]*(?:\d+\.\s*)?[…]*`, two adjacent overlapping star-runs
// backtrack quadratically on a non-matching heading: measured at REVIEW, a line
// of 50,000 backticks took **3.9 seconds** inside `parseBacklogRows`, and
// `/sig:docs-sweep` runs this over every heading in the file. Real heading decoration
// is a handful of characters, so a bound costs nothing and removes the class.
const LEADING_ID_RE =
  /^[\s`*_~✅▶⚠✂]{0,40}(?:\d+\.\s{0,4})?[\s`*_~]{0,10}((?:M\d+(?:\.\d+)?\.E\d+)|(?:B\d+))\b/;

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

// ── `M6.E8` FR1 — a heading that says it DISCHARGES a bug.
//
// The row that proposed this input asked for the opposite: "a row naming an
// open confirmed bug should rank above one that does not." Measured, that is
// backwards (`D-M6E8-2`): zero live headings name a confirmed bug, nine BODIES
// do, and five of the nine cite `B75` as a MEASUREMENT ("B75 measured that
// ceiling") — they are not discharging it and are not stuck behind it either.
// Promoting them is the wrong direction, and reading bodies is the heuristic
// that matched another item's trigger in `M6.E7`. So: heading only, and the
// verb must sit NEXT TO the id — `fixes B75`, `B75 — fixed` — because a bare
// done-word anywhere in a heading is ordinary English (the real heading
// "single home for open/closed work" carries "closed"; the `DONE_WORD_RE`
// lesson, a second time).
//
// Ships firing on ZERO rows, declared rather than implied — the basis on which
// `shelved` ships in `NOT_LIVE_VOCABULARY`. Correct the moment a maintainer
// writes "Fixes B75" in a heading, and built now rather than in a hurry against
// one example when it first matters.
//
// ⚠ BOTH TENSES, AND THE PAST TENSE WAS MISSING UNTIL REVIEW. The verb group was
// `fix(?:es)?|close(?:s)?|…` — present tense only — so `Fixes B75` matched and
// `Fixed B75` did not, and the id-first branch demanded a separator so
// `B75 fixed` missed too. The predicate claimed to recognise "a heading that says
// it discharges a bug" and recognised about half the forms a maintainer actually
// writes, while `BUG_DISCHARGE_MEASURED` would have gone on reporting **0** with
// such a row sitting on the file. Found in REVIEW by probing the predicate rather
// than reading it. The widened form adds **zero** matches on this repository's
// live `BACKLOG.md` and none on the three real trap headings (`B87`–`B90`,
// `B73`–`B76`, "open/closed work"), so the measured zero (`BUG_DISCHARGE_MEASURED`, in backlog.js) is unchanged.
//
// ⚠ THE SEPARATOR GROUP CARRIES ITS OWN WHITESPACE, AND THAT IS A ReDoS FIX, NOT
// A TIDY-UP. Written first as `\s*(?:—|–|-|:)?\s*`, an optional separator
// between two unbounded whitespace runs is quadratic: every split point between
// the two runs is retried on failure. Measured on a `B1` + N spaces + `x`
// heading — 1.9 ms at 1k, 161 ms at 10k, 1.5 s at 30k, **5.9 s at 60k**, and the
// same for tabs. Nesting the separator inside the optional group leaves ONE
// unbounded run before the verb and is flat at 0.2 ms across all four sizes,
// while accepting the identical language (`ws* sep? ws*` and `ws* (sep ws*)?`
// both describe `ws*` ∪ `ws* sep ws*`; verified against all 22 fixtures).
//
// It was introduced by the REVIEW fix that widened the tense and caught by the
// NEXT review round — the author's own ReDoS probe had missed it, having tried
// backtick runs, digit runs and repeated verbs but never a long whitespace run
// after an id. `LEADING_ID_RE` above bounds its decoration runs for this exact
// class and records the 3.9 s measurement that justified it; this is the same
// lesson, relearned one function down. The timing is pinned by a test.
//
// ⚠ NO `for` BRANCH. It was there — `(?:for\s+)?` — and it promoted a row
// headed "The fix for `B75` broke `B76`" as though it discharged `B75`, which is
// the opposite of what that row says. Its only justification was an invented
// fixture ("A fix for B9 that discharges it"), never a real heading, so it is
// removed rather than documented.
//
// ⚠ INFLECTED FORMS ONLY, AND A REQUIRED SEPARATOR ON THE ID-FIRST BRANCH. Both
// narrowings are fixes for false positives a fresh-context review found by
// probing, and both say the same thing: this predicate reads a CLAIM THAT THE
// WORK IS DONE, not a row that is merely about a bug.
//
//   - **No bare verb.** `fix` / `close` / `resolve` / `discharge` are also nouns
//     and imperatives. `The B75 fix broke B76` and `the discharge B75 handler`
//     matched through the noun; `Fix B75` and `Close B12` matched through the
//     imperative, which states an INTENTION to do the work — the opposite of
//     discharging it. Only `fixes|fixed|closes|closed|resolves|resolved|
//     discharges|discharged` survive.
//   - **Separator required after the id.** Making it optional (the previous
//     round's widening) let `B75 fixes the ceiling` and `B75 fixed-width column`
//     read as discharges, because a bug-as-subject heading is indistinguishable
//     from a record without one. `B75 — fixed` is explicit; `B75 fixed` is not,
//     and losing it is the price of not promoting the other two.
//
// It is also what makes the pattern linear again: an optional separator BETWEEN
// two unbounded whitespace runs is quadratic (1.9 ms at 1k, 5.9 s at 60k). With
// the separator required the literal anchors the two runs — measured flat at
// 1.1 ms on a 300,000-character heading. `LEADING_ID_RE` above bounds its runs
// for the same class and records the 3.9 s measurement behind it. Pinned by a test.
//
// ⚠ `(?!-)` AFTER EACH VERB, because `\b` is satisfied by a hyphen. Without it
// `B9: discharged-batch queue`, `B1 — fixed-width column`, `B7 - resolved-name
// cache` and `B12: closed-loop controller` all read as discharges — a row about a
// batch queue promoted as though it closed a bug. Found by the pass-3 security
// audit after the two earlier narrowings, and it is the same lesson a third time:
// the vocabulary is a claim that the work is DONE, and an adjectival compound is
// not that claim.
const BUG_DISCHARGE_RE =
  /\b(?:fix(?:es|ed)|close[sd]|resolve[sd]|discharge[sd])(?!-)\s+`?(B\d+)`?\b|`?\b(B\d+)\b`?\s*(?:—|–|-|:)\s*(?:fix(?:es|ed)|close[sd]|resolve[sd]|discharge[sd])(?!-)\b/i;

/**
 * Whether a heading declares, in its own words, that it discharges a bug —
 * and which one. Whether that bug is still `confirmed` is the caller's
 * question (`rankRows` answers it from `BUGS.md`); this only reads the heading.
 *
 * @param {string} headingText — a row's heading, not its body
 * @returns {{id: string|null, declaration: string|null}}
 */
function _declaresBugDischarge(headingText) {
  const m = String(headingText ?? '').match(BUG_DISCHARGE_RE);
  if (!m) return { id: null, declaration: null };
  return { id: (m[1] ?? m[2]).toUpperCase(), declaration: m[0] };
}

/**
 * Every backlog row, with its discharge state normalized to `obligations.js`'s
 * field names (`discharged` / `dischargedBy` / `dischargedAt`).
 *
 * ONE definition of "which heading is a row", shared by the writer in backlog.js and by
 * the `/sig:docs-sweep` check (AC S7.1). Three rules, each measured against the real
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
function _parseBacklogRows(content, { maxDepth = 3 } = {}) {
  const lines = String(content).split('\n');
  const heads = [];
  let detailsDepth = 0;
  let inFence = false;
  // Depth 3 is the DEFAULT, not the truth, and the difference is a live bug.
  // Signal's own promoted rows sit at `####` — correct nesting under their `###`
  // section — so a depth-3 read reports zero of them (`B94`'s discharge half,
  // filed twice). Every caller that reads a real BACKLOG.md passes `maxDepth: 4`
  // — the discharge writer and the sweep check too since `B135`, measured: at 4
  // the `###` section headers above `####` rows become containers and nothing
  // else moves, on Signal's history and on every corpus backlog.
  const headingRe = new RegExp(`^(#{2,${Math.max(2, maxDepth)}})\\s+(.*)$`);

  lines.forEach((raw, i) => {
    // `B121`: a CRLF file leaves `\r` on every line, `$` cannot match before it,
    // and the whole file parsed as ZERO rows. Stripped per line so `i` stays
    // aligned with the `split('\n')` the writers use.
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    const t = line.trimStart();
    const isFenceLine = t.startsWith('```') || t.startsWith('~~~');
    if (isFenceLine) inFence = !inFence;
    const m = inFence ? null : line.match(headingRe);
    if (m) heads.push({ line: i + 1, depth: m[1].length, text: m[2].trim(), inDetails: detailsDepth > 0 });
    // `B122`: a MENTION of `<details>` — in a fence or a code span — is not a
    // block, and counting it marked every row after it as preserved history.
    if (inFence || isFenceLine) return;
    const bare = line.replace(/`[^`]*`/g, '');
    detailsDepth += (bare.match(/<details/g) ?? []).length - (bare.match(/<\/details>/g) ?? []).length;
    if (detailsDepth < 0) detailsDepth = 0;
  });

  // The container fold runs over LIVE headings only, and the ordering is the fix.
  //
  // Folded over every heading, a live `## row` whose next heading is a `###`
  // inside a following `<details>` block is classified as a container and
  // DROPPED — and the `<details>` heading it was folded against is then removed
  // by each call site's `inDetails` filter, so the row vanishes entirely:
  // `dischargeBacklogRows` answers `not-found` for a row that exists, and
  // `backlogDischargeStatus` never evaluates it. That is exactly rule 2's shape
  // above (a discharged row keeping its original entry underneath) crossed with
  // the drain-written shape (rows at `##`) — so it cannot occur in Signal's own
  // file, where rows and their `<details>` headings sit at the same depth, and
  // it hits every command-driven project. `B82`'s dogfood blindness again.
  //
  // Preserved-history headings are never containers: they are a record, not a
  // structure, and nothing nests under them that a reader is meant to act on.
  const live = heads.filter((h) => !h.inDetails);
  const containers = new Set();
  live.forEach((h, i) => {
    if (i + 1 < live.length && live[i + 1].depth > h.depth) containers.add(h);
  });

  return heads
    .filter((h) => !containers.has(h))
    .map((h) => {
      const lead = h.text.match(LEADING_ID_RE);
      return { ...h, leadingId: lead ? lead[1] : null, ...readRowDischarge(h.text) };
    });
}

/**
 * Whether a string is a bare bug id (`B12`). One definition for the
 * `/^B\d+$/` test that `backlogDischargeStatus`, `/sig:advise`'s drop reason
 * and its priorities contract each wrote inline.
 *
 * @param {unknown} id
 * @returns {boolean}
 */
function _isBugId(id) {
  return /^B\d+$/.test(id);
}

export const declaresBugDischarge = guard('declaresBugDischarge', _declaresBugDischarge);
export const parseBacklogRows = guard('parseBacklogRows', _parseBacklogRows);
export const isBugId = guard('isBugId', _isBugId);

// ── The issues inbox / FUTURE-IDEAS (from drain.js) ─────────────────────────

// Top-level entry boundary: a line that begins with exactly `## ` (two hashes +
// space). `### …` has a non-space at index 2, so it never matches — nested
// headings stay inside their parent entry.
const HEADING_RE = /^## /;

// A heading whose title leads with a disposition marker is already disposed
// (Q2). Anchored at `^##\s*` per RESEARCH § Q2; matched against the raw heading
// line. The optional `✓ ` covers the `## ✓ SHIPPED — …` shape used in the live
// file.
const HEADING_DISPOSED_RE = /^##\s*(✓\s*)?(SHIPPED|PROMOTED|DEFERRED|MERGED|DELETED)\b/i;

// A Status line carrying the drain's OWN stamp is already disposed. The stamp
// written by applyDisposition (S5.t2) has a fixed shape — a verb, an ISO date,
// then a parenthetical containing "drain" — in both forms it emits:
//   append (entry already had a Status):  `… → Deferred 2026-05-30 (M4.5.E2 drain).`
//   insert (entry had no Status line):    `**Status:** Deferred 2026-05-30 (M4.5.E2 drain).`
// Matching that exact signature (verb + date + `(… drain)`) is what stops a
// dispositioned entry from resurfacing on the next drain.
//
// Q2 refinement (2026-05-31, user-approved in M4.5.E2 REVIEW): the original
// locked rule matched a *bare* verb anywhere in the Status (`/\b(Promoted|…)\b/`),
// which over-matched prose — e.g. `**Status:** Deferred from M4.5.E7 …` wrongly
// hid a genuine live entry (1 of 29 in the real file). Scoping to the stamp
// signature fixes that false-negative: only an actual drain disposition counts,
// not the word appearing in a sentence. (Heading markers like `## ✓ SHIPPED`
// are still caught by HEADING_DISPOSED_RE.)
// `Shipped` added 2026-08-09 alongside the `shipped` verb (see VERB_PAST). It
// MUST be here, not just in VERB_PAST: a stamp this regex cannot see is a stamp
// that does not stop the entry resurfacing at the next drain, which is the
// whole job of this pattern. Adding the verb without adding it here would have
// produced a marker that looks disposed to a human and reads live to the code.
const STATUS_DISPOSED_RE =
  /\b(Promoted|Deferred|Merged|Shipped|Deleted)\s+\d{4}-\d{2}-\d{2}\s+\([^)\n]*\bdrain\b\)/;

// FR3 (v0.1.6): the 2026-07-04 backlog review stamped promotions as a LEADING
// blockquote (`> **Promoted 2026-07-04 → M4.5.E10** …`), which neither of the
// two REs above recognized — so those entries resurfaced on every drain. This
// matches such a stamp, ^-anchored at line start so a stamp merely QUOTED
// mid-prose (or a `> **Update …**` annotation on a still-open entry) is never
// mistaken for a real disposition. Verb set matches HEADING_DISPOSED_RE.
const BLOCKQUOTE_DISPOSED_RE =
  /^\s*>\s*\*\*(Promoted|Deferred|Merged|Shipped|Deleted)\b/i;

// FR3 (M5.E1): TERMINAL disposition markers — a strict subset of the three
// disposed REs above, with DEFERRED removed. SHIPPED/PROMOTED/MERGED/DELETED are
// disposed-for-good, so the entry is eligible to physically LEAVE the inbox for
// the archive ledger; DEFERRED is parked-but-live, so it stays. Each mirrors its
// disposed counterpart exactly (verb list minus DEFERRED) so classification can
// never drift from detection.
//
// **`Shipped` added to the status variant 2026-08-09.** The parenthetical here
// used to read *"no `Shipped`; the drain never stamps 'Shipped' onto a Status
// line"* — true, and a description of the gap rather than of a design. The
// heading and blockquote variants have always recognised `SHIPPED`, because the
// live file carries a hand-written `## ✓ SHIPPED` from the plugin rename; only
// the *writer* lacked the verb. So Signal could read a marker it could not
// produce, and a completed capture had no honest disposition available: `defer`
// postpones something already finished, and `delete` destroys the record of why
// it exists. Both were offered; neither was true. Now `shipped` stamps, and
// every reader that already understood the word understands the stamp.
const HEADING_TERMINAL_RE = /^##\s*(✓\s*)?(SHIPPED|PROMOTED|MERGED|DELETED)\b/i;
const STATUS_TERMINAL_RE =
  /\b(Promoted|Merged|Shipped|Deleted)\s+\d{4}-\d{2}-\d{2}\s+\([^)\n]*\bdrain\b\)/;
const BLOCKQUOTE_TERMINAL_RE =
  /^\s*>\s*\*\*(Promoted|Merged|Shipped|Deleted)\b/i;

// First `**Status:**` line of an entry (leading whitespace tolerated).
const STATUS_LINE_RE = /^\s*\*\*Status:\*\*/;

// An ISO date anywhere in a line: YYYY-MM-DD.
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;

// True when the (trimmed) line opens or closes a fenced code block.
function _isFenceMarker(line) {
  const t = line.trimStart();
  return t.startsWith('```') || t.startsWith('~~~');
}

// Byte offset where each line begins. offsets[i] is the start of line i; the
// last entry's range ends at content.length. `\n` is restored as the +1 the
// split removed.
function lineOffsets(lines) {
  const offsets = [];
  let off = 0;
  for (const line of lines) {
    offsets.push(off);
    off += line.length + 1;
  }
  return offsets;
}

// M6.E4 FR2.1. HTML-comment marker, matching the shape already used in this
// corpus for `backlog-key`, `bugs-key`, `evicted-key` and `phase-log:archived`
// — deliberately not a new mechanism (D-M6E4-4).
const STANDING_MARKER_RE = /^\s*<!--\s*standing\s*-->\s*$/;

/**
 * Parse a FUTURE-IDEAS-shaped markdown string into its top-level `## ` entries.
 * Fence-aware and tolerant of an orphaned mid-file footer. Content before the
 * first `## ` heading (title, intro, the first `---`) is preamble and is not an
 * entry.
 *
 * Each returned entry:
 *   - `heading`      — the title text after `## ` (trimmed); for display.
 *   - `statusLine`   — the first non-fenced `**Status:**` line in the block
 *                      (raw, trimmed), or `null` if the entry has none.
 *   - `dateISO`      — first ISO date found in the Status line, else in the
 *                      heading, else `null` (informational; Q2 uses no window).
 *   - `dispositioned`— true iff the heading marker OR the Status verb says so.
 *   - `dispositionKind` — the finer FR3 (M5.E1) signal: `'terminal'` for a
 *                      SHIPPED/PROMOTED/MERGED/DELETED disposition (eligible to
 *                      leave the inbox), `'deferred'` for a DEFERRED disposition
 *                      (parked-but-live, stays), `null` for un-dispositioned.
 *                      Invariant: `dispositioned === (dispositionKind !== null)`.
 *   - `range`        — `{ start, end }` byte offsets `[start, end)` of the whole
 *                      block (heading line through the byte before the next
 *                      top-level heading, or EOF). Ranges tile gap-free, so
 *                      editing one block leaves every other byte identical (R1).
 *
 * @param {string} content
 * @returns {Array<{heading: string, statusLine: string|null, dateISO: string|null, dispositioned: boolean, dispositionKind: 'terminal'|'deferred'|null, standing: boolean, range: {start: number, end: number}}>}
 */
function _parseEntries(content) {
  if (typeof content !== 'string' || content === '') return [];

  const lines = content.split('\n');
  const offsets = lineOffsets(lines);

  // First pass — find top-level heading line indices, fence-aware.
  const headingIdxs = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (_isFenceMarker(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && HEADING_RE.test(lines[i])) headingIdxs.push(i);
  }

  // Second pass — build one entry per heading, scanning its own line span for
  // the Status line (fence-aware again, since the span can contain a fence).
  return headingIdxs.map((startLine, k) => {
    const endLine = k + 1 < headingIdxs.length ? headingIdxs[k + 1] : lines.length;
    const headingLineRaw = lines[startLine];
    const heading = headingLineRaw.replace(HEADING_RE, '').trim();

    let statusLine = null;
    let statusLineIdx = -1;
    let innerFence = false;
    for (let i = startLine + 1; i < endLine; i++) {
      if (_isFenceMarker(lines[i])) {
        innerFence = !innerFence;
        continue;
      }
      if (!innerFence && STATUS_LINE_RE.test(lines[i])) {
        statusLine = lines[i].trim();
        statusLineIdx = i;
        break;
      }
    }

    const dateFrom = (s) => {
      const m = (s ?? '').match(DATE_RE);
      return m ? m[1] : null;
    };
    const dateISO = dateFrom(statusLine) ?? dateFrom(headingLineRaw);

    // FR3: a leading blockquote disposition stamp in the entry's header region
    // (first non-blank content line after the heading, fence-aware) marks the
    // entry dispositioned. Scanning only the first non-blank line keeps a stamp
    // quoted deeper in the body from being mistaken for a real disposition.
    let blockquoteDisposed = false;
    let blockquoteTerminal = false;
    {
      let hdrFence = false;
      for (let i = startLine + 1; i < endLine; i++) {
        if (_isFenceMarker(lines[i])) {
          hdrFence = !hdrFence;
          continue;
        }
        if (hdrFence) continue;
        if (lines[i].trim() === '') continue;
        blockquoteDisposed = BLOCKQUOTE_DISPOSED_RE.test(lines[i]);
        blockquoteTerminal = BLOCKQUOTE_TERMINAL_RE.test(lines[i]);
        break; // first non-blank, non-fenced line decides
      }
    }

    const dispositioned =
      HEADING_DISPOSED_RE.test(headingLineRaw) ||
      STATUS_DISPOSED_RE.test(statusLine ?? '') ||
      blockquoteDisposed;

    // FR3 (M5.E1): refine to terminal-vs-deferred, gated on `dispositioned` so
    // the `dispositioned === (dispositionKind !== null)` invariant holds by
    // construction. A disposed entry is either terminal or (by elimination, since
    // the disposed verbs are exactly SHIPPED/PROMOTED/DEFERRED/MERGED/DELETED and
    // terminal covers all but DEFERRED) deferred.
    const terminalSignal =
      HEADING_TERMINAL_RE.test(headingLineRaw) ||
      STATUS_TERMINAL_RE.test(statusLine ?? '') ||
      blockquoteTerminal;
    const dispositionKind = dispositioned
      ? terminalSignal
        ? 'terminal'
        : 'deferred'
      : null;

    // M6.E4 FR2.1 — a STANDING entry is one deliberately meant to stay open
    // forever (the trigger watchlist: "never promote, merge, or delete"). Without
    // this it is indistinguishable from an unanswered entry and is counted a live
    // candidate at every drain — the same can't-tell-checked-from-unchecked shape
    // as B39 and B90. On this repo it was the ONLY live candidate, so the live
    // count was pinned at >= 1 and plan.md Step 1b's "no candidates" branch could
    // never run.
    //
    // HEADER REGION = heading → Status line, INCLUSIVE, fence-aware. Bounding it
    // at the Status line rather than "first N non-blank lines" is what keeps a
    // marker quoted deeper in a body from marking the entry: an entry discussing
    // the marker in its prose (this very file's own backlog row does) must not
    // become standing by talking about it. With no Status line the window closes
    // at the first non-blank line — conservative by construction.
    let standing = false;
    {
      const limit = statusLineIdx >= 0 ? statusLineIdx : endLine;
      let mkFence = false;
      for (let i = startLine + 1; i <= limit && i < endLine; i++) {
        const line = lines[i];
        const fence = _isFenceMarker(line);

        if (!fence && !mkFence && STANDING_MARKER_RE.test(line)) {
          standing = true;
          break;
        }
        // No Status line: the window closes at the first non-blank line — and a
        // FENCE MARKER IS A NON-BLANK LINE. The first draft `continue`d on fences
        // before reaching this check, so an entry with no Status line whose body
        // opened with a fence was scanned straight through it and past it, and a
        // marker beyond still set `standing` — silently dropping the entry from
        // the live count, the exact opposite of the "conservative by
        // construction" this comment claims. (PR #200 review.)
        if (statusLineIdx < 0 && line.trim() !== '') break;

        if (fence) mkFence = !mkFence;
      }
    }

    const start = offsets[startLine];
    const end = endLine < lines.length ? offsets[endLine] : content.length;

    return {
      heading,
      statusLine,
      dateISO,
      dispositioned,
      dispositionKind,
      standing,
      range: { start, end },
    };
  });
}

/**
 * The drain candidate set (Q2): every top-level entry that is NOT already
 * dispositioned, in document order. No date window — disposition-state is the
 * only gate, so the first post-S5 drain surfaces the whole standing backlog
 * (the intended one-time triage; the command layer mitigates the wall with
 * compact rendering + a "defer all remaining" batch, not by hiding entries).
 *
 * @param {string} content
 * @returns {ReturnType<typeof parseEntries>}
 */
function _listDrainCandidates(content) {
  return _parseEntries(content).filter((e) => !e.dispositioned && !e.standing);
}

/**
 * The STANDING entries — deliberately-permanent notes, reported as their own
 * category rather than silently dropped (M6.E4 FR2.2).
 *
 * A value on the record, not a rendering choice: the drain must be able to say
 * "0 live, 1 standing" instead of "1 live", which is the difference between an
 * inbox that can report itself clear and one that structurally cannot.
 *
 * @param {string} content
 * @returns {ReturnType<typeof parseEntries>}
 */
function _listStandingEntries(content) {
  return _parseEntries(content).filter((e) => e.standing);
}

/**
 * `listDrainCandidates` + dangling-fence recovery (FR4a, AD5). An UNCLOSED
 * fence (odd fence-marker count) leaves `parseEntries`' fence tracker stuck
 * "inside a fence" for the rest of the file, so every `## ` entry below the
 * dangling marker silently vanishes from the candidate set — an idea captured
 * after a malformed fenced sample would never surface for triage. This detects
 * that case and resurfaces the swallowed entries, plus a `danglingFence` signal
 * the command layer announces.
 *
 * `parseEntries` / `listDrainCandidates` keep their bare-return contracts (the
 * snapshot tests pin them); this is the sibling detect+recover per AD5. The
 * recovery is targeted, NOT a fence-oblivious re-parse: because the tail after
 * the *last* fence marker contains no fence markers by construction, re-parsing
 * only that tail resurfaces exactly the swallowed headings without ever
 * surfacing a heading that sits inside a legitimately-balanced fence.
 *
 * Out of scope (unchanged from parseEntries): fence-type (``` vs ~~~) matching.
 *
 * @param {string} content
 * @returns {{ candidates: ReturnType<typeof parseEntries>, danglingFence: boolean, recoveredCount: number }}
 */
function _listDrainCandidatesWithRecovery(content) {
  const candidates = _listDrainCandidates(content);
  if (typeof content !== 'string' || content === '') {
    return { candidates, danglingFence: false, recoveredCount: 0 };
  }

  const lines = content.split('\n');
  let fenceCount = 0;
  let lastFenceLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (_isFenceMarker(lines[i])) {
      fenceCount++;
      lastFenceLine = i;
    }
  }
  // Balanced fences → nothing swallowed → identical candidates, no warning.
  if (fenceCount % 2 === 0) {
    return { candidates, danglingFence: false, recoveredCount: 0 };
  }

  // Odd count: a dangling fence swallowed every heading after the last marker.
  // The tail past that marker has zero fence markers, so a plain re-parse of it
  // recovers exactly those headings; offset their ranges back into `content`.
  const offsets = lineOffsets(lines);
  const tailStart =
    lastFenceLine + 1 < lines.length ? offsets[lastFenceLine + 1] : content.length;
  const tail = content.slice(tailStart);
  const seenStarts = new Set(candidates.map((e) => e.range.start));
  const recovered = _parseEntries(tail)
    .map((e) => ({
      ...e,
      // `recovered` entries are visible for triage-awareness but are NOT in
      // parseEntries(fullContent) — the dangling fence swallowed them — so they
      // have a valid `range` but no stable `entryIndex` for applyDisposition.
      // The tag lets /sig:plan render them yet exclude them from disposition /
      // "defer all remaining" until the fence is fixed (M4.5.E10 REVIEW F2).
      recovered: true,
      range: { start: e.range.start + tailStart, end: e.range.end + tailStart },
    }))
    .filter(
      (e) =>
        // `!e.standing` mirrors listDrainCandidates deliberately. Found at REVIEW:
        // this filter was left as `!dispositioned` while its sibling gained the
        // standing exclusion, so a standing entry sitting BELOW a dangling fence
        // would be recovered straight back into the live candidate set — the bug
        // S2 removed, reintroduced by the one path that exists for malformed
        // inboxes. Two filters that must agree; only one had been updated.
        !e.dispositioned && !e.standing && !seenStarts.has(e.range.start)
    );

  return {
    candidates: [...candidates, ...recovered],
    danglingFence: true,
    recoveredCount: recovered.length,
  };
}

// Index of the first non-fenced `**Status:**` line within a block's line array,
// or -1. Mirrors parseEntries' inner scan so surface and write agree on which
// line is "the Status line".
function _statusLineIdxInBlock(lines) {
  let inFence = false;
  for (let i = 1; i < lines.length; i++) {
    if (_isFenceMarker(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && STATUS_LINE_RE.test(lines[i])) return i;
  }
  return -1;
}

// --- M5.E13 S3.t1 (FR2.1, `B39`): the trigger-watchlist walk -----------------
//
// `ISSUES-INBOX.md` carries a standing entry — "Trigger watchlist … (check
// conditions at every drain)", marked *never promote, merge, or delete* —
// instructing `/sig:plan`'s drain to walk its conditions and act on any that
// have fired. **Nothing implemented that walk.** Measured at M5.E13 PLAN: 11
// rows, `Fired?` reading `—` on every one, with at least two demonstrably
// fired and one DATED trigger still pending.
//
// The entry's own stated rationale was *"one dated trigger that would otherwise
// expire unobserved"* — which is precisely what happened, to the whole table.

const WATCHLIST_HEADING_RE = /^##\s+.*trigger watchlist.*$/im;

// A row is DECIDED when its verdict cell says something other than a dash /
// blank — a tick, a date, a word. `—` (em dash), `-`, and empty all mean
// "nobody looked", which is the state B39 is about.
const UNDECIDED_CELL_RE = /^[\s—–-]*$/;

/**
 * Parse the standing trigger watchlist out of an inbox document.
 *
 * Returns `null` when the project has no such entry — portable, so a stranger
 * repo never sees a false alarm.
 *
 * @param {string} content — the inbox file's text
 * @returns {{rows: Array<{item:string, condition:string, verdict:string, evaluated:boolean}>,
 *            unevaluated: Array<object>, decided: Array<object>,
 *            dated: Array<{item:string, date:string}>} | null}
 */
function _parseTriggerWatchlist(content) {
  const src = String(content ?? '');
  const m = src.match(WATCHLIST_HEADING_RE);
  if (!m) return null;

  // Scope to this entry: from its heading to the next top-level `## `.
  const start = src.indexOf(m[0]);
  const rest = src.slice(start + m[0].length);
  const nextIdx = rest.search(/^##\s+/m);
  const block = nextIdx === -1 ? rest : rest.slice(0, nextIdx);

  const rows = [];
  for (const line of block.split('\n')) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    // Skip the header and its separator.
    if (/^-{2,}$|^:?-+:?$/.test(cells[0])) continue;
    if (/^parked item/i.test(cells[0])) continue;
    const [item, condition, verdict] = cells;
    rows.push({
      item,
      condition,
      verdict,
      evaluated: !UNDECIDED_CELL_RE.test(verdict),
    });
  }
  if (rows.length === 0) return null;

  // A DATED condition is the one shape that expires whether or not anyone
  // looks, so it is surfaced separately rather than left to be spotted.
  const dated = [];
  for (const r of rows) {
    // Strip inline code spans BEFORE looking for a date. Caught dogfooding this
    // very function at M5.E13: the GitHub-Issues row's condition cites
    // `BACKLOG-REVIEW-2026-07-04.md`, and a naive match reported that FILENAME
    // as an expiry — a dated-trigger report that cries wolf is worse than none,
    // since the whole point is that these are the rows you can trust to matter.
    const prose = r.condition.replace(/`[^`]*`/g, ' ');
    const d = prose.match(/(\d{4}-\d{2}-\d{2})/);
    if (d) dated.push({ item: r.item, date: d[1], condition: r.condition, evaluated: r.evaluated });
  }

  return {
    rows,
    unevaluated: rows.filter((r) => !r.evaluated),
    decided: rows.filter((r) => r.evaluated),
    dated,
  };
}

export const isFenceMarker = guard('isFenceMarker', _isFenceMarker);
export const parseEntries = guard('parseEntries', _parseEntries);
export const listDrainCandidates = guard('listDrainCandidates', _listDrainCandidates);
export const listStandingEntries = guard('listStandingEntries', _listStandingEntries);
export const listDrainCandidatesWithRecovery = guard('listDrainCandidatesWithRecovery', _listDrainCandidatesWithRecovery);
export const statusLineIdxInBlock = guard('statusLineIdxInBlock', _statusLineIdxInBlock);
export const parseTriggerWatchlist = guard('parseTriggerWatchlist', _parseTriggerWatchlist);

// ── OPEN-QUESTIONS.md (from status.js) ──────────────────────────────────────

/**
 * Extract top-N level-2 (## ) headings from an OPEN-QUESTIONS.md file content.
 * Truncates each to maxLen characters (with ellipsis appended on truncation).
 *
 * @param {string} content - Raw file content.
 * @param {number} limit - Max number of headings to return (default 3).
 * @param {number} maxLen - Max characters per heading (default 80).
 * @returns {string[]} Truncated headings.
 */
function _extractTopOpenQuestions(content, limit = 3, maxLen = 80) {
  if (typeof content !== 'string') return [];
  const headings = [];
  const re = /^## (.+)$/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    let heading = match[1].trim();
    if (heading.length > maxLen) {
      heading = heading.slice(0, maxLen - 1).trimEnd() + '…';
    }
    headings.push(heading);
    if (headings.length >= limit) break;
  }
  return headings;
}

/**
 * Count total level-2 headings in an OPEN-QUESTIONS.md content.
 *
 * @param {string} content
 * @returns {number}
 */
function _countOpenQuestions(content) {
  if (typeof content !== 'string') return 0;
  const matches = content.match(/^## /gm);
  return matches ? matches.length : 0;
}

export const extractTopOpenQuestions = guard('extractTopOpenQuestions', _extractTopOpenQuestions);
export const countOpenQuestions = guard('countOpenQuestions', _countOpenQuestions);

// ── The generated inbox's status line (from work-marker.js) ─────────────────
//
// The prefix and the parser stay together: `formatInboxStatusLine` (still in
// work-marker.js) writes with this prefix, and the parser reads it back. If the
// two disagree, the promote finds nothing and captures the block twice.

export const INBOX_STATUS_PREFIX = '**Status:** untriaged (N) · ';
const INBOX_STATUS_RE = /^\*\*Status:\*\* untriaged \(N\) · ([A-Z][A-Z0-9]{1,9}-[1-9]\d*)$/;

/**
 * The item ID on an inbox status line, or null when the line is not one.
 * Trailing whitespace (a `\r` included) is ignored.
 * @param {string} line
 * @param {string} [key] — the store's key; an ID under another key is null
 * @returns {string|null}
 */
function _parseInboxStatusLine(line, key) {
  if (typeof line !== 'string') return null;
  const m = line.replace(/\s+$/, '').match(INBOX_STATUS_RE);
  if (!m) return null;
  if (key !== undefined && m[1].slice(0, m[1].lastIndexOf('-')) !== key) return null;
  return m[1];
}

export const parseInboxStatusLine = guard('parseInboxStatusLine', _parseInboxStatusLine);
