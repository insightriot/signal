// tools/lib/archive-report.js — M5.E18 S7 (FR4 / `B63`, FR6).
//
// The last slice: it renders what the others resolve. M5.E16's model, ported one
// command over — **`0` must stop meaning both "could not look" and "checked and
// clean."**
//
// `B63` is that defect in `/sig:migrate-memory`: its dry-run prints `0` for the
// two Epic-only vectors on a linear project, so *could not apply* reads exactly
// like *already clean*. Filed the day after `C1` was fixed in `/sig:sweep` —
// which is why STATE's own sequencing note says Signal has been "finding classes
// and fixing instances", and why this Epic was told to fix by class.
//
// FOUR facts, four renderings. They are genuinely four, not one with adjectives:
//
//   1. units resolved, some closed        -> moves proposed, listed
//   2. units resolved, none closed        -> nothing to archive, and that is real
//   3. units resolved, none EVALUABLE     -> zero moves, and that is NOT the same
//   4. no units derived at all            -> nothing was checked; nothing to check
//   (+) STATE.md unreadable               -> a fifth: we could not even look
//
// (3), (4) and (+) all produce "0 files to archive". Wave 3 proved they collapse
// if you only render counts: `affiliate-mojo` (STATE unreadable, 0 units) and
// `prompt-library` (readable, 0 units) return byte-identical `{0,0,0}` from
// `resolveClosures`. That was found in S4's own code by first use, pinned by a
// closure test, and carried forward as this slice's obligation. Here it is paid.

import { PLANNING_DIR } from './state.js';

const CLOSED = 'closed';
const OPEN = 'open';
const CANNOT = 'cannotDetermine';

/**
 * Why an archive pass proposed what it proposed — the discriminating sentences,
 * with no header, as indented lines.
 *
 * THE definition of the distinction. It was briefly split out of a standalone
 * report renderer that then kept its own copy of the same branches — one rule,
 * two implementations, already drifting (only the report said "needs a person").
 * REVIEW caught that; the report was deleted rather than kept in sync, because
 * nothing rendered it and an unused second copy is a drift source with no
 * upside. `/sig:migrate-memory`'s dry-run is the one consumer.
 *
 * @returns {string[]} lines, already indented, possibly empty
 */
export function explainArchiveOutcome(args = {}) {
  const closures = args.closures ?? [];
  const dropped = args.dropped ?? [];
  const moveCount = args.moveCount ?? 0;
  const stateReadable = args.stateReadable ?? true;
  const stateReason = args.stateReason ?? null;
  const indent = args.indent ?? '  ';
  const L = [];

  if (!stateReadable) {
    L.push(
      `${indent}↳ ${stateReason || 'STATE.md could not be read.'}`,
      `${indent}  Nothing is proposed because nothing could be evaluated — a refusal, not a`,
      `${indent}  clean result. Without STATE.md there is no way to tell which unit is current,`,
      `${indent}  and a current unit must never be archived.`
    );
  } else if (closures.length === 0) {
    L.push(
      `${indent}↳ No work units were derived from this project's filenames, so nothing was`,
      `${indent}  checked. That is not the same as checked-and-clean. Units come from scaffold`,
      `${indent}  suffixes (PLAN, VERIFICATION, SHIP, …); another naming convention derives`,
      `${indent}  zero units by convention, not by fault.`
    );
  } else {
    const cannot = closures.filter((c) => c.status === CANNOT);
    const open = closures.filter((c) => c.status === OPEN);
    if (moveCount === 0 && cannot.length > 0) {
      L.push(
        `${indent}↳ 0 does NOT mean "nothing to archive": ${cannot.length} of ${closures.length} unit(s) could not be`,
        `${indent}  evaluated at all. Each needs a person:`
      );
      for (const c of cannot) L.push(`${indent}    ${c.unit} — ${c.reason}`);
    } else if (moveCount === 0 && closures.filter((c) => c.status === CLOSED).length > 0) {
      // The two sources genuinely disagree here, and saying "nothing to do"
      // would assert the weaker one. `senseArchiveTree`'s default closed-set is
      // RETRO-derived; `resolveClosures` reads terminal artifact + verdict. A
      // unit closed by verdict with no retrospective is invisible to the mover.
      //
      // Caught by running it: `nextpass` printed "none closed … genuinely
      // nothing to do" while the resolver had found 1 closed unit. That gap IS
      // this Epic's subject, so the report names it instead of papering it.
      const n = closures.filter((c) => c.status === CLOSED).length;
      L.push(
        `${indent}↳ ${n} unit(s) resolve as CLOSED, but this pass proposes no move for them.`,
        `${indent}  Its closed-set comes from retrospectives; a unit closed by a passing verdict`,
        `${indent}  with no retrospective is not reachable here. This is a gap, not a clean bill.`
      );
    } else if (moveCount === 0) {
      L.push(
        `${indent}↳ Checked ${closures.length} unit(s): ${open.length} in flight, ${cannot.length} unreadable,`,
        `${indent}  none closed. Nothing to do — and this pass could see the project.`
      );
    } else if (cannot.length > 0) {
      L.push(
        `${indent}↳ ${cannot.length} further unit(s) could not be evaluated and are NOT included`,
        `${indent}  above. Each needs a person:`
      );
      for (const c of cannot) L.push(`${indent}    ${c.unit} — ${c.reason}`);
    }
  }

  if (dropped.length > 0) {
    L.push(`${indent}↳ ${dropped.length} unit(s) were skipped and not considered:`);
    for (const d of dropped) L.push(`${indent}    ${d.unit} — ${d.reason}`);
  }
  return L;
}

/**
 * NFR5 / AC4.5 — a bound the planner applied is reported by count AND reason,
 * and when it bounded nothing that is STATED. A silent absence is exactly how a
 * bound becomes invisible: the reader cannot tell "nothing was dropped" from
 * "dropping is not reported."
 */
export function renderDropped(dropped, indent = '  ') {
  if (!dropped || dropped.length === 0) {
    return `${indent}Nothing was dropped: every derived unit was considered.`;
  }
  const lines = [`${indent}${dropped.length} unit(s) were skipped and NOT considered:`];
  for (const d of dropped) lines.push(`${indent}  ${d.unit}  — ${d.reason}`);
  return lines.join('\n');
}

/**
 * The move breakdown — where files actually go, as indented lines.
 *
 * Grouped by DESTINATION DIRECTORY, not by a unit name guessed from the
 * filename. The first version stripped a trailing `-SUFFIX.md` to recover the
 * unit and mislabelled the v3 rename moves that share this move set:
 * `FUTURE-IDEAS.md` became a unit called `FUTURE`, and `FUTURE-IDEAS-LEDGER.md`
 * one called `FUTURE-IDEAS`. The destination already encodes the unit exactly,
 * so nothing needs to be inferred.
 *
 * Non-archive moves (the renames) are counted separately rather than dressed up
 * as unit archives — they are folded into the same count line by pre-existing
 * design, and silently presenting them as archives would be a small lie in the
 * one place a user checks before saying go.
 *
 * @param {Array} moves
 * @param {{indent?: string, renameFroms?: Set<string>}} [opts]
 * @returns {string[]}
 */
export function renderMoveBreakdown(moves = [], opts = {}) {
  if (!moves || moves.length === 0) return [];
  const indent = opts.indent ?? '  ';
  // PRECISE, not heuristic: `senseArchiveTree` already knows which moves are the
  // v3 renames. A first version guessed from the destination path and still
  // mislabelled the archive-ledger rename, which lands under `.planning/archive/`
  // and so looked like a unit archive. Ask the producer instead of inferring.
  const renameFroms = opts.renameFroms ?? new Set();
  const ARCHIVE = `${PLANNING_DIR}/archive/`;
  const byDest = new Map();
  let renames = 0;
  for (const m of moves) {
    if (renameFroms.has(m.from) || !String(m.to).startsWith(ARCHIVE)) {
      renames += 1;
      continue;
    }
    const dir = m.to.slice(0, m.to.lastIndexOf('/') + 1);
    byDest.set(dir, (byDest.get(dir) ?? 0) + 1);
  }
  const lines = [];
  for (const [dir, n] of [...byDest].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`${indent}  ${dir}  (${n} file${n === 1 ? '' : 's'})`);
  }
  if (renames > 0) {
    lines.push(`${indent}  ${renames} rename(s), not a unit archive`);
  }
  return lines;
}
