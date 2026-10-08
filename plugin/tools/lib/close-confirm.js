// Confirming fixed closes, and reporting what is ready to confirm (M6.E13
// t4.6, AC7.2; where each runs: `D-M6E13-21`, refining `D-M6E13-15`).
//
// Two entries:
//
// - `runConfirmCloses` CONFIRMS. SHIP calls it, and so does the sweep
//   (`sweep.js` `confirmClosesInSweep` — the one sweep step that writes). On a
//   v2 work store it runs `work-records.js` `confirmCloses` — which writes a
//   `closed` event for each *closing* item whose fix commit is on
//   `refs/remotes/origin/<default>`, and regenerates the views — and returns
//   one line to show.
// - `reportCloses` only REPORTS. `/sig:resume` calls it, and keeps its
//   read-only contract: it asks `probeCloses` (the same question, nothing
//   written) and returns "N ready to close — run the sweep or ship".
//
// Anything but a v2 store does nothing in either: a store that is off, a v1
// store (whose fixed closes all read as *closing* through the converter, and
// which v2 code may not write).
//
// FAIL-OPEN by construction: neither throws nor blocks. A broken `WORK.md` or
// a failed confirmation becomes the line, never an exception — a briefing, a
// sweep or a release must not stop because a close could not be checked.

import { confirmCloses, probeCloses, storeVersion } from './work-records.js';

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
    // SIG-276: the reason alone does not say what to do.
    if (stillClosing.some((s) => s.reason === 'ambiguous-proof')) {
      parts.push('ambiguous-proof: the proof is the start of more than one commit — reopen the item and close it again with a longer hash');
    }
  }
  if (stale.length > 0) parts.push(`${stale.length} closing over 14 days (${list(stale)}) — see /sig:docs-sweep`);
  return parts.length === 0 ? null : `Closes: ${parts.join(' · ')}`;
}

const nothing = () => ({ ran: false, confirmed: [], stillClosing: [], stale: [], error: null, line: null });

/**
 * Confirm fixed closes on a v2 store and say what happened, in one line.
 * At SHIP, before the SHIP commit, so the changed records and views are
 * staged into it; in the sweep, through `confirmClosesInSweep`. It compares
 * against the local `origin/<default>` ref and never fetches.
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
 *   stale: string[], error: string|null, broken?: string[], line: string|null}>}
 *   `broken`: on a refusal over broken records, their IDs (else empty).
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
      broken: Array.isArray(err?.broken) ? err.broken : [],
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

const nothingReported = () => ({ ran: false, ready: [], stillClosing: [], stale: [], error: null, line: null });

/**
 * The one line for a `probeCloses` result, or `null` when there is nothing to
 * say. It names what is ready and where it gets confirmed, and never claims
 * anything was written.
 *
 * @param {{ready: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[]}|null} result
 * @returns {string|null}
 */
export function formatCloseReportLine(result) {
  if (!result) return null;
  const { ready = [], stale = [] } = result;
  const parts = [];
  if (ready.length > 0) parts.push(`${ready.length} ready to close (${list(ready)}) — run /sig:docs-sweep or /sig:ship to confirm`);
  if (stale.length > 0) parts.push(`${stale.length} closing over 14 days (${list(stale)}) — see /sig:docs-sweep`);
  return parts.length === 0 ? null : `Closes: ${parts.join(' · ')}`;
}

/**
 * What is ready to close on a v2 store, in one line — and nothing written
 * (`D-M6E13-21`: `/sig:resume` reports, the sweep and SHIP confirm). Call it
 * AFTER `/sig:resume`'s origin check (`isStaleVsOrigin`), so the remote ref it
 * reads is as fresh as the briefing's.
 *
 * - store off, or v1 → `{ran: false, line: null}`; git is not asked.
 * - `WORK.md` unreadable, or the probe throws → `{ran: false, error, line: 'Closes not checked — …'}`.
 * - otherwise → `ready` (whose fix commit is on the default branch),
 *   `stillClosing`, `stale`, and `line` from `formatCloseReportLine`.
 *
 * @param {string} baseDir
 * @param {{now?: Date|string, execFn?: Function}} [opts]
 * @returns {{ran: boolean, ready: string[], stillClosing: Array<{id: string, reason: string}>,
 *   stale: string[], error: string|null, line: string|null}}
 */
export function reportCloses(baseDir, opts = {}) {
  let probe;
  try {
    if (storeVersion(baseDir) !== 2) return nothingReported();
    const probeOpts = {};
    if (opts.now !== undefined) probeOpts.now = opts.now;
    if (opts.execFn) probeOpts.execFn = opts.execFn;
    probe = probeCloses(baseDir, probeOpts);
  } catch (err) {
    return { ...nothingReported(), error: err.message, line: `Closes not checked — ${err.message}` };
  }
  const result = { ready: probe.confirmable, stillClosing: probe.stillClosing, stale: probe.stale };
  return { ran: true, ...result, error: null, line: formatCloseReportLine(result) };
}
