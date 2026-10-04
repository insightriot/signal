// Confirming fixed closes at `/sig:resume` and at SHIP (M6.E13 t4.6, AC7.2,
// `D-M6E13-15`).
//
// One entry, `runConfirmCloses`, that both commands call: on a v2 work store
// it runs `work-records.js` `confirmCloses` — which writes a `closed` event for
// each *closing* item whose fix commit is on `refs/remotes/origin/<default>`,
// and regenerates the views — and returns one line to show. Anything else does
// nothing: a store that is off, a v1 store (whose fixed closes all read as
// *closing* through the converter, and which v2 code may not write).
//
// FAIL-OPEN by construction: it never throws and never blocks. A broken
// `WORK.md` or a failed confirmation becomes the line, never an exception —
// a briefing or a release must not stop because a close could not be checked.
//
// The sweep does NOT call this: it is read-only (`/sig:docs-sweep` AC1.5), so it
// reports confirmable closes through `probeCloses` instead (`sweep.js`
// `checkClosesConfirmable`).

import { confirmCloses, storeVersion } from './work-records.js';

const LIST_MAX = 5;

const list = (ids) => (ids.length <= LIST_MAX ? ids.join(', ') : `${ids.slice(0, LIST_MAX).join(', ')} and ${ids.length - LIST_MAX} more`);

/**
 * The one line for a `confirmCloses` result, or `null` when there is nothing
 * to say (nothing confirmed, nothing closing). A confirmation names the files
 * it changed so a person seeing a modified view knows why.
 *
 * @param {{confirmed: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[]}|null} result
 * @returns {string|null}
 */
export function formatConfirmClosesLine(result) {
  if (!result) return null;
  const { confirmed = [], stillClosing = [], stale = [] } = result;
  const parts = [];
  if (confirmed.length > 0) {
    const whose = confirmed.length === 1 ? 'its record' : 'their records';
    parts.push(`confirmed ${confirmed.length} (${list(confirmed)}) — ${whose} and the views changed; commit them`);
  }
  if (stillClosing.length > 0) {
    parts.push(`${stillClosing.length} still closing (${list(stillClosing.map((s) => `${s.id}: ${s.reason}`))})`);
  }
  if (stale.length > 0) parts.push(`${stale.length} closing over 14 days (${list(stale)}) — see /sig:docs-sweep`);
  return parts.length === 0 ? null : `Closes: ${parts.join(' · ')}`;
}

const nothing = () => ({ ran: false, confirmed: [], stillClosing: [], stale: [], error: null, line: null });

/**
 * Confirm fixed closes on a v2 store and say what happened, in one line.
 * Call it AFTER `/sig:resume`'s origin check (`isStaleVsOrigin`), so the
 * remote ref it compares against is as fresh as the briefing's; at SHIP,
 * before the SHIP commit, so the changed records and views are staged into it.
 *
 * - store off, or v1 → `{ran: false, line: null}`; git is not asked, nothing
 *   is written.
 * - `WORK.md` unreadable → `{ran: false, error, line: 'Closes not checked — …'}`.
 * - `confirmCloses` throws (LOCKED, IO, …) → `{ran: true, error, line: 'Closes
 *   not confirmed — …'}`.
 * - otherwise → its result, and `line` from `formatConfirmClosesLine`.
 *
 * @param {string} baseDir
 * @param {{now?: Date|string, execFn?: Function, confirm?: Function}} [opts]
 *   `confirm`: the confirmation, injected in tests (default `confirmCloses`)
 * @returns {Promise<{ran: boolean, confirmed: string[], stillClosing: Array<{id: string, reason: string}>,
 *   stale: string[], error: string|null, line: string|null}>}
 */
export async function runConfirmCloses(baseDir, opts = {}) {
  let version;
  try {
    version = storeVersion(baseDir);
  } catch (err) {
    return { ...nothing(), error: err.message, line: `Closes not checked — ${err.message}` };
  }
  if (version !== 2) return nothing();

  const confirm = opts.confirm ?? confirmCloses;
  const confirmOpts = {};
  if (opts.now !== undefined) confirmOpts.now = opts.now;
  if (opts.execFn) confirmOpts.execFn = opts.execFn;
  let result;
  try {
    result = await confirm(baseDir, confirmOpts);
  } catch (err) {
    return {
      ...nothing(),
      ran: true,
      error: err.message,
      line: `Closes not confirmed — ${err.message}`,
    };
  }
  return {
    ran: true,
    confirmed: result.confirmed,
    stillClosing: result.stillClosing,
    stale: result.stale,
    error: null,
    line: formatConfirmClosesLine(result),
  };
}
