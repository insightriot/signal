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
 *
 * ⚠ AND EXITS ALONE UNDER-COUNT (M6.E17, `D-M6E17-1`). A pass whose fixes stay
 * inside the phase never leaves it, so `completed_phases` never hears of it:
 * M6.E16's REVIEW ran four full passes and read **0** throughout. So a pass is
 * also recorded when it ENDS (`recordPass` in `state.js` → `phase_passes`), and
 * the count is the LARGER of the two sources — a pass that ends and then leaves
 * appears in both, and a sum would count it twice. `setCurrentEpic` clears
 * `phase_passes` beside `completed_phases`, so it is per Epic too.
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
 * than re-tuning it. It holds a RETRY: while a phase is the current phase and
 * the last entry of `phase_passes` is its own PASS or PASS-WITH-FIXES, written
 * in this visit, the phase is moving on and `loopStatusFor` does not hold it,
 * whatever the count.
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
 * The verdicts a recorded pass may carry: the three `review.md` returns. VERIFY's
 * report says PASS / FAIL / PASS with documented limits; the last is recorded as
 * PASS, because the limits live in the report and the ceiling needs only
 * "passed or not" (`verify.md` § 5a, M6.E18 AC3.4).
 */
export const PASS_VERDICTS = Object.freeze(['PASS', 'PASS-WITH-FIXES', 'FAIL']);

/** One `phase_passes` entry: `"<PHASE> <VERDICT> (<YYYY-MM-DD>)"`. */
export const PASS_ENTRY_RE = /^(VERIFY|REVIEW) (PASS|PASS-WITH-FIXES|FAIL) \((\d{4}-\d{2}-\d{2})\)$/;

/** Today as `YYYY-MM-DD`, in the same form `recordPass` and `completed_phases` write. */
export const todayStamp = () => new Date().toISOString().split('T')[0];

/**
 * Whether `date` (`YYYY-MM-DD`) could be the day a pass ended: a real calendar
 * day, and not after `today` (M6.E18 AC3.2, `SIG-344`). A string compare is
 * enough — the form sorts as it reads.
 *
 * @param {string} date
 * @param {string} today
 * @returns {boolean}
 */
export function isPassDate(date, today) {
  const d = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date && date <= today;
}

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
 * How many passes of `phase` were recorded as they ended, per `phase_passes`.
 *
 * `0` when the key is absent — a project that has never recorded a pass reads
 * exactly as it did before the key existed. `null` when the key is there and
 * cannot be read: not a list, or ANY entry (for any phase) that is not
 * `"<PHASE> <VERDICT> (<date>)"`, or whose date is not a calendar day or is
 * after `today` (M6.E18 AC3.2: a pass cannot end tomorrow). Unlike `completed_phases`, a bad entry is not
 * discarded: this list is written only by `recordPass`, so a bad entry means
 * the record was damaged, and a damaged record cannot say how many passes ran.
 * The driver must stop on it, never read it as zero (`D-M6E17-6`).
 *
 * @param {{phase_passes?: unknown}|null|undefined} state
 * @param {string} phase
 * @param {{today?: string}} [opts] — `YYYY-MM-DD`; defaults to today
 * @returns {number|null}
 */
export function countPhasePasses(state, phase, { today = todayStamp() } = {}) {
  if (!state || typeof state !== 'object') return null;
  if (!('phase_passes' in state) || state.phase_passes === undefined) return 0;
  const raw = state.phase_passes;
  if (!Array.isArray(raw)) return null;
  let count = 0;
  for (const entry of raw) {
    if (typeof entry !== 'string') return null;
    const m = PASS_ENTRY_RE.exec(entry);
    if (!m || !isPassDate(m[3], today)) return null;
    if (m[1] === phase) count += 1;
  }
  return count;
}

/**
 * Where this phase stands against its ceiling.
 *
 * `atCeiling` is false, whatever the count, while `phase` is the current phase
 * and the last entry of `phase_passes` is its own PASS or PASS-WITH-FIXES
 * written in this visit: the phase passed and is being left, not retried.
 * "This visit" is `phase_pass_mark`, the length of `phase_passes` when the
 * visit began, written on entry to VERIFY or REVIEW (M6.E18, `SIG-349`): only an
 * entry at an index at or after the mark lifts the ceiling, so a PASS from an
 * earlier visit no longer does. With no mark (STATE written before M6.E18) the
 * newest entry lifts it whichever visit wrote it, exactly as before.
 *
 * Returns `null` for a phase that does not loop, and for a state it cannot
 * read — including a mark that is not a non-negative integer, or is larger
 * than the list it marks (`D-M6E18-3`). Both mean "no opinion" and both must be treated as a stop by an actor —
 * see `canProceedUnattended`, which distinguishes them in its reason so the
 * halt message says which one happened.
 *
 * @param {object|null|undefined} state
 * @param {string} phase
 * @param {{ceiling?: number, today?: string}} [opts]
 * @returns {{phase: string, count: number, ceiling: number, nextAttempt: number,
 *            atCeiling: boolean}|null}
 */
export function loopStatusFor(state, phase, { ceiling = DEFAULT_LOOP_CEILING, today } = {}) {
  if (!LOOP_BOUNDED_PHASES.includes(phase)) return null;

  // The larger of exits and recorded passes, never the sum (`D-M6E17-1`).
  // Either source unreadable → no opinion → the driver stops (`D-M6E17-6`).
  const exits = countPhaseCompletions(state, phase);
  const passes = countPhasePasses(state, phase, today === undefined ? {} : { today });
  if (exits === null || passes === null) return null;
  const count = Math.max(exits, passes);

  // The visit marker. Absent → no marker, today's rule. Present and not a
  // whole number from 0 to the list's length → unreadable → the driver stops.
  const list = Array.isArray(state.phase_passes) ? state.phase_passes : [];
  const mark = state.phase_pass_mark;
  const marked = 'phase_pass_mark' in state && mark !== undefined;
  if (marked && !(Number.isInteger(mark) && mark >= 0 && mark <= list.length)) return null;

  const nextAttempt = count + 1;
  // The ceiling stops a retry, not a step forward. The records count the pass
  // just ended, so while this is the current phase and the last record of all
  // is its own PASS or PASS-WITH-FIXES, the phase is being left and is not
  // held. A later record (a REVIEW FAIL after a VERIFY pass) means a new visit,
  // held by the count as before. With a mark, the record must also be this
  // visit's — at or after the mark — so an earlier visit's PASS does not lift
  // it (SIG-349). With no mark, which visit wrote it cannot be told.
  const current = !marked || list.length - 1 >= mark;
  const newest = state?.phase === phase && passes > 0 && current ? PASS_ENTRY_RE.exec(list.at(-1)) : null;
  const passed = newest !== null && newest[1] === phase && newest[2] !== 'FAIL';
  return { phase, count, ceiling, nextAttempt, atCeiling: !passed && nextAttempt >= ceiling };
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
