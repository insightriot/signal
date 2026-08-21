/**
 * The loop ceiling — how many times a phase may be re-entered before a person
 * has to decide (`B76`).
 *
 * THE GAP THIS CLOSES. `verify.md`'s FAIL path asks the user via the
 * 3-options-plus-other pattern and stops at the third loop. `review.md`'s FAIL
 * path was a bare *"return to EXECUTE"* — no ask, no ceiling. Attended, that
 * asymmetry is tolerable and `M5.E16` lived through one loop-back in the field.
 * Unattended it is a loop that does not stop, and `B76` (filed 2026-08-03,
 * agreed by the maintainer 2026-08-08) predicted that any driver built on top
 * would inherit it *"on day one"*. `/sig:drive` shipped in `v0.1.31` and did.
 *
 * WHY THIS IS CODE AND NOT A SENTENCE. `verify.md`'s ceiling is prose, enforced
 * by nothing — a person reads *"you've looped <3 times"* and counts by memory.
 * Mirroring that prose into `review.md` would close `B76` on paper and leave the
 * unattended loop exactly as unbounded, which is
 * `UNREACHED-MECHANISM-ANALYSIS.md`'s named class: a rule written more carefully
 * instead of a check that fires where the situation is. So the count is derived
 * from state, and `canProceedUnattended` refuses on it.
 *
 * WHERE THE COUNT COMES FROM — an existing mechanism, not a new one.
 * `completed_phases` is **append-only** and records **the phase being left**
 * (`B44` / `D-M5E9-5`: "a phase re-entered during recovery is recorded again";
 * the old dedupe that collapsed it destroyed 53 entries of one project's
 * history). So the number of entries naming a phase IS the number of times that
 * phase has been completed. Nothing new is written to track this, and
 * `partitionCompletedPhases` does the parsing rather than a second
 * implementation of it (`B82`: a parallel reimplementation of "which entries
 * belong to X" is how half a unit got archived invisibly).
 *
 * The count is **per Epic** for free: `setCurrentEpic` resets
 * `completed_phases` on an Epic roll (`B9`), so loops do not leak across Epics.
 */

import { partitionCompletedPhases } from './state.js';

/**
 * The pass at which a person decides.
 *
 * THE ARITHMETIC IS THE BEHAVIOUR, so it is spelled out rather than left to the
 * reader. `verify.md` says *"A for the first 2 loops; reassess at loop 3"*.
 * A phase that has been completed `count` times is about to run pass
 * `count + 1`. The ceiling bites when that next attempt reaches it:
 *
 *   count 0 → next attempt 1 → runs      count 2 → next attempt 3 → A PERSON DECIDES
 *   count 1 → next attempt 2 → runs      count 3 → next attempt 4 → a person decides
 *
 * So two unattended re-entries are allowed and the third stops. That is
 * `verify.md`'s existing rule, unchanged — this makes it enforceable rather
 * than re-tuning it.
 */
export const DEFAULT_LOOP_CEILING = 3;

/**
 * Phases whose FAIL path loops backwards, so a count of them is meaningful.
 *
 * Deliberately NOT every phase. EXECUTE re-runs per task and SHIP is terminal;
 * counting those would stop loops that are supposed to run.
 */
export const LOOP_BOUNDED_PHASES = Object.freeze(['VERIFY', 'REVIEW']);

/**
 * How many times `phase` has been completed, per `completed_phases`.
 *
 * Returns `null` when it cannot tell — an unreadable or absent log is NOT zero.
 * Zero means "checked, never completed"; `null` means "could not look", and the
 * caller must fail closed on it. Collapsing the two is `B39`'s shape, and here
 * it would read as "no loops yet" on exactly the state that lost its history.
 *
 * @param {{completed_phases?: unknown}|null|undefined} state
 * @param {string} phase
 * @returns {number|null}
 */
export function countPhaseCompletions(state, phase) {
  if (!state || typeof state !== 'object') return null;
  const raw = state.completed_phases ?? state.completedPhases;
  if (!Array.isArray(raw)) return null;

  // Malformed entries are discarded by the shared parser, never keyed on (B45).
  const { valid } = partitionCompletedPhases(raw);
  return valid.filter((entry) => entry.split(' ')[0] === phase).length;
}

/**
 * Where this phase stands against its ceiling.
 *
 * Returns `null` for a phase that does not loop, and for a state it cannot
 * read. Both mean "no opinion" and both must be treated as a stop by an actor —
 * see `canProceedUnattended`, which distinguishes them in its reason so the
 * halt message says which one happened.
 *
 * @param {object|null|undefined} state
 * @param {string} phase
 * @param {{ceiling?: number}} [opts]
 * @returns {{phase: string, count: number, ceiling: number, nextAttempt: number,
 *            atCeiling: boolean}|null}
 */
export function loopStatusFor(state, phase, { ceiling = DEFAULT_LOOP_CEILING } = {}) {
  if (!LOOP_BOUNDED_PHASES.includes(phase)) return null;

  const count = countPhaseCompletions(state, phase);
  if (count === null) return null;

  const nextAttempt = count + 1;
  return { phase, count, ceiling, nextAttempt, atCeiling: nextAttempt >= ceiling };
}

/**
 * The sentence a command prints when the ceiling bites.
 *
 * One place turns a ceiling into prose, so the command file and the driver
 * cannot drift into describing the same halt two ways.
 *
 * @param {{phase: string, count: number, ceiling: number, nextAttempt: number}} status
 * @returns {string}
 */
export function formatLoopCeilingHalt(status) {
  return (
    `${status.phase} has already been completed ${status.count} time(s) for this unit of work; ` +
    `this would be pass ${status.nextAttempt}, at or past the ceiling of ${status.ceiling}. ` +
    `A person decides now — loop back again, escalate the tier via /sig:escalate, or accept ` +
    `the failure as a documented limit. The loop does not choose between those.`
  );
}
