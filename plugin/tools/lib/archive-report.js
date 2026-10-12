// tools/lib/archive-report.js — M5.E18 S7 (FR4 / `B63`, FR6).
//
// The last slice: it renders what the others resolve. M5.E16's model, ported one
// command over — **`0` must stop meaning both "could not look" and "checked and
// clean."**
//
// `B63` is that defect in `/sig:docs-migrate`: its dry-run prints `0` for the
// two Epic-only vectors on a linear project, so *could not apply* reads exactly
// like *already clean*. Filed the day after `C1` was fixed in `/sig:docs-sweep` —
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
// if you only render counts: `eval-project-B` (STATE unreadable, 0 units) and
// `eval-project-H` (readable, 0 units) return byte-identical `{0,0,0}` from
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
 * upside. `/sig:docs-migrate`'s dry-run is the one consumer.
 *
 * `args.unitRecords`: true when the project has unit records (the caller's
 * `readUnitRecords` answer — this function reads no files). It selects the
 * wording of the closed-but-not-moved sentence only.
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
    // With unit records (M6.E16 t6.3) a unit closed by its RECORD that has no
    // move is not the retro-versus-verdict gap below: nothing of it is left in
    // `.planning/` to move, or it is held. Only a unit closed from its files
    // can be in that gap.
    const closedFromFiles = closures.filter((c) => c.status === CLOSED && c.source !== 'record');
    const closedByRecord = closures.filter((c) => c.status === CLOSED && c.source === 'record');
    if (moveCount === 0 && cannot.length > 0) {
      L.push(
        `${indent}↳ 0 does NOT mean "nothing to archive": ${cannot.length} of ${closures.length} unit(s) could not be`,
        `${indent}  evaluated at all. Each needs a person:`
      );
      for (const c of cannot) L.push(`${indent}    ${c.unit} — ${c.reason}`);
    } else if (moveCount === 0 && closedFromFiles.length > 0) {
      // A unit the resolver calls closed that this pass does not move, and
      // saying "nothing to do" would hide it.
      //
      // Caught by running it: `eval-project-A` printed "none closed … genuinely
      // nothing to do" while the resolver had found 1 closed unit. That gap IS
      // this Epic's subject, so the report names it instead of papering it.
      //
      // What the sentence says was corrected in M6.E16 t10.3 (`SIG-289`). It
      // used to say the closed-set "comes from retrospectives" and that a unit
      // closed by a verdict with no retrospective cannot be reached. Since
      // `SIG-286` the one consumer (`/sig:docs-migrate`'s dry run) passes the
      // resolver's own closed-set (`resolveMigrateClosedUnits`): a unit read
      // from its files is closed by a passing verdict and moves, unless its
      // retrospective still holds placeholders (`B64`) — the one case measured
      // to reach this branch, with and without unit records. With unit records
      // the units here are the ones that have no record (`args.unitRecords`).
      const n = closedFromFiles.length;
      L.push(
        `${indent}↳ ${n} unit(s) resolve as CLOSED, but this pass proposes no move for them.`,
        ...(args.unitRecords === true
          ? [
            `${indent}  They have no unit record, so each is read from its files:`,
            `${indent}  closed by a passing verdict, and held back when its retrospective`,
            `${indent}  still holds placeholders.`,
          ]
          : [
            `${indent}  A unit is closed by a passing verdict here, and held back when its retrospective`,
            `${indent}  still holds placeholders.`,
          ]),
        `${indent}  Check each one's retrospective. This is a gap, not a clean bill.`
      );
    } else if (moveCount === 0 && closedByRecord.length > 0) {
      L.push(
        `${indent}↳ Checked ${closures.length} unit(s): ${open.length} in flight, ${cannot.length} unreadable,`,
        `${indent}  ${closedByRecord.length} closed by ${closedByRecord.length === 1 ? 'its' : 'their'} unit record with nothing to move. Nothing to do.`
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

  // NFR5 / AC4.5 — the bound is reported by count AND reason, and when it bound
  // NOTHING that is stated rather than left silent. A reader cannot tell
  // "nothing was dropped" from "dropping is not reported", and the second is how
  // a bound becomes invisible.
  //
  // VERIFY (2nd pass) found this half unreachable: it lived in a `renderDropped`
  // helper that only the deleted standalone report ever called, so no command
  // said it. Folded in here, on the wired path, and `renderDropped` deleted.
  // AC5.2 (M6.E16) — a held unit is closed and nothing of it moves; say which, and why.
  const held = args.held ?? [];
  if (stateReadable && held.length > 0) {
    L.push(`${indent}↳ ${held.length} closed unit(s) are held, so nothing of them moves:`);
    for (const h of held) L.push(`${indent}    ${h.unit} — held: ${h.reason}`);
  }

  if (dropped.length > 0) {
    L.push(`${indent}↳ ${dropped.length} unit(s) were skipped and not considered:`);
    for (const d of dropped) L.push(`${indent}    ${d.unit} — ${d.reason}`);
  } else if (closures.length > 0) {
    L.push(`${indent}↳ Nothing was dropped: every derived unit was considered.`);
  }
  return L;
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
