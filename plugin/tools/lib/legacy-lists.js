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
