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

  // ---- The fifth fact, first: if STATE could not be read, nothing below it is
  // trustworthy, so it leads. Same reasoning as /sig:resume's schema-drift
  // banner sitting above every other banner.
  if (!stateReadable) {
    // The reason from `resolveClosures` already names STATE.md and is already
    // a sentence — prefixing it produced "STATE.md could not be read — STATE.md
    // could not be read — …" with a doubled full stop, which first use against
    // `affiliate-mojo` showed on the very first render. Pass it through; only
    // supply a sentence when there is none.
    out.push(
      `  ⚠ ${stateReason || 'STATE.md could not be read.'}`,
      '    Without it there is no way to tell which unit is current, and a unit that is',
      '    current must never be archived. Nothing is proposed, and that is a refusal,',
      '    not a clean result. Fix STATE.md and re-run.',
      ''
    );
    out.push(renderDropped(dropped));
    return out.join('\n') + '\n';
  }

  // ---- Fact 4: nothing derived. Distinct from "derived, but unreadable".
  if (closures.length === 0) {
    out.push(
      '  No work units were derived from this project’s filenames, so there was',
      '  nothing to evaluate. This is not "checked and clean" — nothing was checked.',
      '',
      '  Units come from scaffold suffixes (PLAN, VERIFICATION, SHIP, …). A project',
      '  that names its documents another way derives zero units by convention, not',
      '  by fault.',
      ''
    );
    out.push(renderDropped(dropped));
    return out.join('\n') + '\n';
  }

  // ---- Facts 1–3.
  if (moves.length > 0) {
    const dirs = new Map();
    for (const m of moves) {
      const dir = m.to.slice(0, m.to.lastIndexOf('/'));
      dirs.set(dir, (dirs.get(dir) ?? 0) + 1);
    }
    out.push(`  ${moves.length} file(s) to archive across ${closed.length} closed unit(s):`);
    for (const c of closed) {
      const n = moves.filter((m) => m.from.includes(`/${c.unit}-`)).length;
      if (n > 0) out.push(`    ${c.unit}  →  ${n} file(s)`);
    }
    out.push('');
  } else {
    out.push('  0 file(s) to archive.', '');
  }

  out.push(`  Closed (ready to archive):  ${closed.length} unit(s)`);
  out.push(`  Open (still in flight):     ${open.length} unit(s)`);
  out.push(`  Could not determine:        ${cannot.length} unit(s)`);

  if (cannot.length > 0) {
    out.push(
      '',
      '  The units below need a person. Each has something that claims to be terminal,',
      '  but nothing this tool will read as a verdict — and guessing at prose is how a',
      '  confident wrong answer gets made:'
    );
    for (const c of cannot) out.push(`    ${c.unit}  — ${c.reason}`);

    // Fact 3, said out loud. This is the sentence the whole slice exists for.
    if (closed.length === 0) {
      out.push(
        '',
        '  ⚠ Nothing is proposed, but that is NOT the same as nothing to archive:',
        `    every one of the ${cannot.length} unit(s) above could not be evaluated. A zero here`,
        '    means this tool could not look, not that it looked and found nothing.'
      );
    }
  }

  out.push('');
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
