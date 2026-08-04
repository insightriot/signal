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

const CLOSED = 'closed';
const OPEN = 'open';
const CANNOT = 'cannotDetermine';

/**
 * Why an archive pass proposed what it proposed — the discriminating sentences,
 * with no header, as indented lines.
 *
 * Split out from `renderArchivePlan` so `/sig:migrate-memory`'s dry-run can say
 * the same thing inside its own tiered display without a SECOND definition of
 * the distinction drifting away from this one. That is the defect class this
 * Epic keeps finding (`isStubRetro` had five readers and one consumer); one
 * rule, two presentations.
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
 * Render the archive dry-run report.
 *
 * @param {object} args
 * @param {Array<{unit:string,status:string,reason:string}>} args.closures  from resolveClosures
 * @param {Array<{from:string,to:string}>} [args.moves]
 * @param {Array<{unit:string,reason:string}>} [args.dropped]  units the planner refused (NFR5)
 * @param {boolean} [args.stateReadable]
 * @param {string|null} [args.stateReason]
 * @returns {string}
 */
export function renderArchivePlan(args = {}) {
  const closures = args.closures ?? [];
  const moves = args.moves ?? [];
  const dropped = args.dropped ?? [];
  const stateReadable = args.stateReadable ?? true;
  const stateReason = args.stateReason ?? null;

  const byStatus = (s) => closures.filter((c) => c.status === s);
  const closed = byStatus(CLOSED);
  const open = byStatus(OPEN);
  const cannot = byStatus(CANNOT);

  const out = ['Archive plan — dry run (nothing has been written)', ''];

  // Counts first — but only when there is something to count. A project whose
  // STATE is unreadable, or which derives no units, has no meaningful counts and
  // printing `0/0/0` for it is exactly the collapse this module exists to stop.
  if (stateReadable && closures.length > 0) {
    if (moves.length > 0) {
      out.push(`  ${moves.length} file(s) to archive across ${closed.length} closed unit(s):`);
      for (const c of closed) {
        const n = moves.filter((m) => m.from.includes(`/${c.unit}-`)).length;
        if (n > 0) out.push(`    ${c.unit}  →  ${n} file(s)`);
      }
    } else {
      out.push('  0 file(s) to archive.');
    }
    out.push(
      '',
      `  Closed (ready to archive):  ${closed.length} unit(s)`,
      `  Open (still in flight):     ${open.length} unit(s)`,
      `  Could not determine:        ${cannot.length} unit(s)`,
      ''
    );
  }

  // The four-fact distinction itself is NOT restated here — it is
  // `explainArchiveOutcome`'s, and this function delegates to it.
  //
  // REVIEW caught the first version carrying its own `!stateReadable` /
  // `closures.length === 0` / `cannot.length > 0` branches while
  // `explainArchiveOutcome`'s docblock claimed it existed so no second
  // definition could drift. The comment asserted a property the code did not
  // have — one rule, two implementations, which is this Epic's own defect class
  // (`isStubRetro`: one definition, five discarding consumers) in the module
  // written to fix it. Delegating also means the golden tests for AC4.2/AC4.4
  // now pin the SAME code the migrate dry-run runs.
  //
  // `dropped` is passed empty on purpose: `renderDropped` owns that section here
  // (it must also state the EMPTY case, which the inline explainer does not).
  const explained = explainArchiveOutcome({
    closures,
    dropped: [],
    moveCount: moves.length,
    stateReadable,
    stateReason,
    indent: '  ',
  });
  if (explained.length > 0) out.push(...explained, '');

  out.push(renderDropped(dropped));
  return out.join('\n') + '\n';
}

/**
 * NFR5 / AC4.5 — a bound the planner applied is reported by count AND reason,
 * and when it bounded nothing that is STATED. A silent absence is exactly how a
 * bound becomes invisible: the reader cannot tell "nothing was dropped" from
 * "dropping is not reported."
 */
function renderDropped(dropped) {
  if (!dropped || dropped.length === 0) {
    return '  Nothing was dropped: every derived unit was considered.';
  }
  const lines = [`  ${dropped.length} unit(s) were skipped and NOT considered:`];
  for (const d of dropped) lines.push(`    ${d.unit}  — ${d.reason}`);
  return lines.join('\n');
}
