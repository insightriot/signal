// Published-fact checks — a document states something about the project and
// nothing derives it from the artifact it summarises (`M6.E2`).
//
// SEPARATE HOME, DELIBERATELY (`D-M6E2-3`). These do not go in
// `state-drift.js`: that module is named for STATE and its eight checks are
// about STATE. They reuse its `defineCheck` harness — which is general, taking
// `applicability(ctx)` and `run(ctx)` over a ctx carrying `baseDir` — but they
// export their own registry, and the call sites compose the two.
//
// This module is also the first caller of `bugs-tally.js` that is not a test.
// That module has derived-then-compared correctly since `B77` and has **never
// run outside vitest**, so it fired only in this repository and only after a
// write had already gone in. That is the defect, not a detail.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineCheck, HEAL, APPLICABILITY, STATE_DRIFT_CHECKS } from './state-drift.js';
import { compareBugTally, readPublishedTally, formatTallySegment } from './bugs-tally.js';

/**
 * Measured reach per check — `evaluable` of `total` projects, from
 * `tools/measure-published-facts.js` (see `M6.E2-CORPUS-MEASUREMENT.md`).
 *
 * ⚠ **What is derived and what is not.** Every *rendering* of a reach figure
 * comes from here through `describeReach`, so the number cannot disagree with
 * itself across the codebase. The figure itself is **recorded from a
 * measurement run and is not re-measured in CI** — measuring requires the
 * corpus, which CI does not have. Stated rather than implied: this makes the
 * number single-homed, not self-verifying.
 */
export const REACH = Object.freeze({
  'published-bug-tally': Object.freeze({ evaluable: 1, total: 12, measured: '2026-08-18' }),
});

/**
 * The one place a reach figure becomes prose. Anything that wants to say how
 * far a check reaches calls this; nothing types the numbers.
 *
 * @param {{evaluable:number, total:number}} reach
 * @returns {string}
 */
export function describeReach({ evaluable, total }) {
  return `evaluates ${evaluable} of ${total} measured projects`;
}

function bugsPath(baseDir) {
  return join(baseDir, '.planning', 'BUGS.md');
}

/**
 * `BUGS.md` publishes a tally of its own contents. Nothing re-derives it, so a
 * capture or a status edit silently falsifies the file's own summary.
 *
 * THREE OUTCOMES, AND THE MIDDLE ONE IS THE POINT. A `BUGS.md` that publishes
 * no tally is **not** "not applicable" — it is a file that could carry a claim
 * and does not, which is an unknown. `compareBugTally` already refuses to pass
 * it (`reason: 'no-tally'`) on the stated grounds that silence must not read as
 * clean; mapping that to `NOT_APPLICABLE` would undo a correct refusal. It is
 * also the only non-Signal case this check can see: all three non-Signal corpus
 * projects with a `BUGS.md` publish no tally.
 *
 * Heal category 3. The derived value is authoritative and the check prints it,
 * but nothing here writes — sweep runs nothing itself (`D-M5E16-1`), and
 * declaring a heal nobody performs is the failure that requirement exists to
 * stop.
 */
export const checkPublishedBugTally = defineCheck({
  id: 'published-bug-tally',
  healCategory: HEAL.NEEDS_A_PERSON,
  describe:
    'BUGS.md publishes a tally of its own entries; this compares the two. ' +
    `Reach: ${describeReach(REACH['published-bug-tally'])} — Signal's own tree is the ` +
    'only one of them, so a clean result here says nothing about anyone else.',

  applicability: (ctx) => {
    const p = bugsPath(ctx.baseDir);
    if (!existsSync(p)) {
      return { status: APPLICABILITY.NA, reason: 'this project has no .planning/BUGS.md' };
    }
    let content;
    try {
      content = readFileSync(p, 'utf8');
    } catch (err) {
      return { status: APPLICABILITY.BLIND, reason: `could not read BUGS.md — ${err.message}` };
    }
    if (!readPublishedTally(content)) {
      return {
        status: APPLICABILITY.BLIND,
        reason:
          'BUGS.md publishes no tally, so there is nothing to compare against its contents. ' +
          'This is an unknown, not an exemption.',
      };
    }
    return APPLICABILITY.EVAL;
  },

  run: (ctx) => {
    const p = bugsPath(ctx.baseDir);
    const result = compareBugTally(readFileSync(p, 'utf8'));
    if (result.ok) return [];

    const cells = result.mismatches
      .map((m) => `${m.cell}: published ${m.published ?? '—'}, file holds ${m.derived}`)
      .join('; ');

    return [
      {
        file: p,
        message:
          `BUGS.md's tally disagrees with its own contents — ${cells}. ` +
          `Re-derive it, do not increment. Correct segment: ${formatTallySegment(result.derived)}`,
      },
    ];
  },
});

/** The registry. Composed with `STATE_DRIFT_CHECKS` at the call sites. */
export const PUBLISHED_FACT_CHECKS = Object.freeze([checkPublishedBugTally]);

/**
 * Everything `runDriftChecks` should run, composed.
 *
 * It lives HERE rather than in `state-drift.js` because the dependency runs one
 * way: this module already imports that one, and the reverse would be a cycle.
 * The call sites (`/sig:sweep`, `/sig:resume`) import this instead of either
 * registry, so adding a published-fact check reaches both commands without
 * touching a call site again.
 */
export const ALL_DRIFT_CHECKS = Object.freeze([...STATE_DRIFT_CHECKS, ...PUBLISHED_FACT_CHECKS]);
