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

// The parsers this module published — `BUG_STATUSES`, `parseStatusCell`,
// `walkBugEntries`, `deriveBugCounts`, `readPublishedTally`, `compareBugTally` —
// live in `legacy-lists.js` since M6.E13 t4.1 (Decision 12), the one home of
// every Markdown list parser. Re-exported here under the same names, so every
// import of them from this module is unchanged.
export {
  BUG_STATUSES,
  parseStatusCell,
  walkBugEntries,
  deriveBugCounts,
  readPublishedTally,
  compareBugTally,
} from './legacy-lists.js';

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
