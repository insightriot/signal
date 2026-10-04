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
