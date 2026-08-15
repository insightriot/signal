/**
 * Deriving `BUGS.md`'s tally, instead of trusting it (`B77`, `B56`).
 *
 * THE DEFECT THIS CLOSES. `BUGS.md` ends with a published tally —
 * `*0 needs-triage · 2 captured-untriaged · 26 confirmed · … (93 total). Last
 * updated: …*` — and **nothing derives it.** It is hand-maintained, and the
 * file's own footer paragraph instructs, a dozen times over, *"Counts
 * re-derived by grepping the status column … not incremented."* An instruction
 * repeated a dozen times is an instruction that keeps not being followed.
 *
 * Measured on 2026-08-09: the published tally read `28 confirmed · 60 fixed`
 * against a file holding `26` and `62`. `B87` and `B90` had flipped to `fixed`
 * the previous day, **and that same footer paragraph announces both flips by
 * name** while the cells above it were left alone. The total (`92`) was
 * correct, because the two errors offset — which is exactly why spot-checking
 * one cell is not a re-derivation, and why this module returns every cell
 * rather than a boolean.
 *
 * WHY A MODULE AND NOT A CAREFULLY-WORDED RULE. `analysis/UNREACHED-MECHANISM-
 * ANALYSIS.md` ranks the remedies: *"Make the rule executable, or delete it. A
 * rule nothing can check is a preference."* `B75` measured the ceiling on the
 * alternative — `gate_strictness` `light` and `strict` differ by one boolean in
 * code and every other difference is prose. More prose does not move that
 * number. So the count is derived here and pinned by a test, and the
 * convention in the footer becomes a description of what the code does rather
 * than a request to a human.
 *
 * TWO FORMATS, BOTH COUNTED — THIS IS `B77`'S ACTUAL POINT. `BUGS.md` holds
 * entries in two shapes, and a counter that sees one of them is not a counter:
 *
 *   1. **Table rows** — `| B{n} | \`status\` | …`, the triaged catalog.
 *   2. **Heading captures** — `## Some title` + `**Status:** needs-triage`,
 *      which is what `/sig:add --bug` writes, deliberately (`captureToBugs`'s
 *      docblock states the design: no B-ID, no table row, because triage is a
 *      later human step).
 *
 * On 2026-08-03 the published tally read `0 needs-triage` while four
 * `**Status:** needs-triage` captures sat below it. The count was *derived* —
 * and still wrong, because the derivation could only see format 1.
 *
 * THE STATUS CELL IS NORMALISED, NOT MATCHED EXACTLY. One row reads
 * `` `fixed` (v0.1.13) `` — a status cell with a parenthetical. An exact-cell
 * grep read 47 where the truth was 48. The footer names the right fix in its
 * own words: *"`B77`'s open code fix should normalise the status cell before
 * counting, not add a second pattern."* That is what `parseStatusCell` does.
 *
 * WHAT THIS DOES NOT FIX, STATED. `captureToBugs` inserts with `insertAtEnd`,
 * so a captured bug still lands *below* the tally rather than above it — the
 * separate defect described by the capture at `BUGS.md`'s own tail. This module
 * does not move it. What the paired test does is make that insertion **loud**:
 * a capture that lands below the tally without the tally being re-derived turns
 * CI red. A guard that cannot prevent a mistake can still refuse to let it pass
 * silently, which is the difference between `B39`'s shape and a working gate.
 */

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
export function parseStatusCell(raw) {
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
 * @param {string} content
 * @returns {Array<{kind:'row'|'capture', id:string|null, status:string|null, cell:string}>}
 */
export function walkBugEntries(content) {
  const out = [];
  let inFence = false;

  for (const line of String(content).split('\n')) {
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
        status: parseStatusCell(row[2]),
        cell: row[2].trim(),
      });
      continue;
    }

    const cap = line.match(CAPTURE_STATUS_RE);
    if (cap) out.push({ kind: 'capture', id: null, status: cap[1], cell: cap[1] });
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
export function deriveBugCounts(content) {
  const counts = { 'needs-triage': 0, confirmed: 0, dismissed: 0, fixed: 0 };
  const unreadable = [];
  let capturedUntriaged = 0;
  let tableRows = 0;

  for (const entry of walkBugEntries(content)) {
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
export function readPublishedTally(content) {
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
export function compareBugTally(content) {
  const derived = deriveBugCounts(content);
  const published = readPublishedTally(content);

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

/**
 * Render the counts as the tally line's leading segment, for a human to paste
 * or a future writer to use. Deliberately does NOT rewrite the file: the
 * footer's narrative half is hand-written history and this module has no
 * business editing it.
 *
 * @param {object} derived — output of deriveBugCounts
 * @returns {string}
 */
export function formatTallySegment(derived) {
  return (
    `${derived.needsTriage} needs-triage · ` +
    `**${derived.capturedUntriaged} captured-untriaged** · ` +
    `${derived.confirmed} confirmed · ` +
    `${derived.dismissed} dismissed · ` +
    `${derived.fixed} fixed (**${derived.total} total**)`
  );
}
