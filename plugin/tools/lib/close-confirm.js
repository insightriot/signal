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
// On a project with unit records (M6.E16 t4.2) `confirmCloses` confirms unit
// closes in the same call, and the line names units and items separately. With
// no unit involved the line is what it was.
//
// A unit's narrative leaves `STATE.md` when its close is confirmed (M6.E16
// t10.1, `SIG-295`, `D-M6E16-19`): after the confirmation, `runConfirmCloses`
// calls `evict.js` `evictEpicNarrative` for each unit this run confirmed and
// returns what happened as `evictions` and `evictionLine`. `confirmCloses`
// itself still writes records and views only. The eviction is a second step
// with its own lock (`STATE.md`'s): if it refuses or throws, the confirmation
// stands and the reason is reported.
//
// FAIL-OPEN by construction: neither throws nor blocks. A broken `WORK.md` or
// a failed confirmation becomes the line, never an exception — a briefing, a
// sweep or a release must not stop because a close could not be checked.

import { capitalised, RECORD_DEFAULT_BRANCH_HINT } from './branch-guard.js';
import { gitUnusableReason } from './git-env.js';
import { confirmCloses, probeCloses, storeVersion } from './work-records.js';
import { evictEpicNarrative } from './evict.js';

const LIST_MAX = 5;

const list = (ids) => (ids.length <= LIST_MAX ? ids.join(', ') : `${ids.slice(0, LIST_MAX).join(', ')} and ${ids.length - LIST_MAX} more`);

// The parts of the line for one kind of record. `what` words what changed on a
// confirm, and the two places items and units differ: what to do about an
// ambiguous proof, and what a stale close means.
function closeParts({ confirmed = [], stillClosing = [], stale = [] }, what) {
  const parts = [];
  if (confirmed.length > 0) parts.push(`confirmed ${confirmed.length} (${list(confirmed)}) — ${what.changed(confirmed.length)}`);
  if (stillClosing.length > 0) {
    parts.push(`${stillClosing.length} still closing (${list(stillClosing.map((s) => `${s.id}: ${s.reason}`))})`);
    // SIG-276: the reason alone does not say what to do.
    if (stillClosing.some((s) => s.reason === 'ambiguous-proof')) parts.push(what.ambiguous);
  }
  if (stale.length > 0) parts.push(`${stale.length} closing over 14 days (${list(stale)})${what.stale(stale, stillClosing)}`);
  return parts;
}

const anyReason = (result, reason) =>
  [...(result.stillClosing ?? []), ...(result.units?.stillClosing ?? [])].some((s) => s.reason === reason);

// `no-default-branch` alone does not say what to do. One sentence for the
// whole line, items and units together, or null when no close has that reason.
export function noDefaultBranchPart(result) {
  if (!anyReason(result, 'no-default-branch')) return null;
  return `no-default-branch: the remote's default branch is not recorded in this clone — ${RECORD_DEFAULT_BRANCH_HINT}, and re-run`;
}

// The same for `no-remote` (REVIEW r6): a project with no remote has no
// default branch for a commit to be on, so nothing there can be confirmed.
// It names no command: `git remote set-head` fails without a remote.
export function noRemotePart(result) {
  if (!anyReason(result, 'no-remote')) return null;
  return `no-remote: ${NO_REMOTE}, so these closes stay closing until it has one`;
}
const AGAINST_A_REMOTE = 'Signal confirms a close only against a remote\'s default branch';
const NO_REMOTE = `this project has no remote. ${AGAINST_A_REMOTE}`;

// The same for `no-origin-remote` (r6): the project has remotes and none is
// named `origin`, the one whose default branch Signal reads. No command
// either: `git remote set-head origin -a` fails without a remote of that name.
export function noOriginRemotePart(result) {
  if (!anyReason(result, 'no-origin-remote')) return null;
  return `no-origin-remote: ${NO_ORIGIN_REMOTE}, so these closes stay closing until a remote named \`origin\` exists`;
}
const NO_ORIGIN_REMOTE = 'Signal reads the default branch of the remote named `origin`, and this project\'s remotes are named otherwise';

// And for `not-a-repo` (r6): no repository, so no commit and no branch for
// one to be on.
export function notARepoPart(result) {
  if (!anyReason(result, 'not-a-repo')) return null;
  return `not-a-repo: ${NOT_A_REPO}, so these closes stay closing`;
}
const NOT_A_REPO = `this project is not a git repository. ${AGAINST_A_REMOTE}`;

// And for `git-too-old` (r6.4): Signal runs no git-backed check with a git
// older than 2.38, so nothing was asked — said with the version, not as "no
// repository".
export function gitTooOldPart(result) {
  if (!anyReason(result, 'git-too-old')) return null;
  return `git-too-old: ${GIT_TOO_OLD()}, so these closes stay closing until git is updated`;
}
const GIT_TOO_OLD = () => gitUnusableReason() ?? 'the git installed here could not be used for the check';

/**
 * The sentences that say why nothing could be checked, for the end of a line:
 * one for each of the five reasons above that some close has.
 *
 * @param {{stillClosing?: Array<{reason: string}>, units?: {stillClosing?: Array<{reason: string}>}}} result
 * @returns {string[]}
 */
export const uncheckedParts = (result) =>
  [noDefaultBranchPart(result), noRemotePart(result), noOriginRemotePart(result), notARepoPart(result), gitTooOldPart(result)].filter((p) => p !== null);

// Why a unit has stayed closing over 14 days, by the reason it is still
// closing for (REVIEW r6): the commit is not on the default branch for two of
// them only, and for `open-items` it is on it.
const NOT_ON_BRANCH = 'the commit each was requested with is not on the default branch';
const UNIT_STALE_WHY = {
  'not-on-default-branch': NOT_ON_BRANCH,
  'unknown-commit': NOT_ON_BRANCH,
  'open-items': 'the commit each was requested with is on the default branch, and each has an item that is not closed',
  'no-default-branch': 'the remote\'s default branch is not recorded in this clone',
  'no-remote': 'this project has no remote',
  'no-origin-remote': 'this project has no remote named `origin`',
  'not-a-repo': 'this project is not a git repository',
  'git-too-old': 'the git installed here is older than Signal checks a close with',
};

/**
 * What the sweep's `closing-too-long` advisory says about one unit, after
 * "<id> has been closing for N days — " (r6): why it is still closing, and
 * what to do about that. "Merge it" is the advice only when the commit is not
 * on the default branch — and when no reason is known (`reason` undefined),
 * which is what the advisory said before it was given one.
 *
 * @param {string|undefined} reason — the unit's `stillClosing` reason
 * @param {string} proof — the commit its close was requested with
 * @returns {string}
 */
export function unitClosingTooLongWords(reason, proof) {
  if (reason === 'open-items') {
    return `the commit its close was requested with, ${proof}, is on the default branch, and the unit has an item that is not closed. `
      + 'Close that item, or move it out of the Epic (`/sig:item`); the close is confirmed once none is open.';
  }
  return closingTooLongWords(reason, proof, {
    commit: `the commit its close was requested with, ${proof},`,
    merge: 'Merge it; or, if the work moved on to other commits, re-run /sig:ship, which requests the close again with the new one.',
    other: (why) => ` (${why}).`,
  });
}

/**
 * The same for one item (r6). Its advice where a merge would help is the one
 * it always had — merge, or reopen the item — and that is also what it says
 * for a reason with no sentence of its own (an ambiguous proof, a shallow
 * clone), as before.
 *
 * @param {string|undefined} reason — the item's `stillClosing` reason
 * @param {string} proof — its fix commit
 * @param {string} id — the item's ID, for the reopen command
 * @returns {string}
 */
export function itemClosingTooLongWords(reason, proof, id) {
  const merge = `Merge it, or reopen the item (\`/sig:item reopen ${id} "<reason>"\`) if the fix did not land.`;
  return closingTooLongWords(reason, proof, { commit: `its fix commit ${proof}`, merge, other: () => `. ${merge}` });
}

// The sentences the two share. `words.commit` names the commit, `words.merge`
// is the advice where a merge would help, and `words.other(reason)` ends the
// sentence for a reason that has none of its own.
function closingTooLongWords(reason, proof, words) {
  const { commit } = words;
  const requested = `its close was requested with the commit ${proof}; `;
  switch (reason) {
    case undefined:
    case 'not-on-default-branch':
    case 'unknown-commit':
      return `${commit} is not confirmed on the default branch. ${words.merge}`;
    case 'no-default-branch':
      return `${commit} could not be checked: the remote's default branch is not recorded in this clone. `
        + `${capitalised(RECORD_DEFAULT_BRANCH_HINT)}, then sweep again.`;
    case 'no-remote':
      return `${requested}${NO_REMOTE}, so it stays closing until the project has one.`;
    case 'no-origin-remote':
      return `${requested}${NO_ORIGIN_REMOTE}. It stays closing until a remote named \`origin\` exists.`;
    case 'not-a-repo':
      return `${requested}${NOT_A_REPO}, so it stays closing.`;
    case 'git-too-old':
      return `${requested}${GIT_TOO_OLD()}, so it stays closing until git is updated.`;
    default:
      return `${commit} is not confirmed on the default branch${words.other(reason)}`;
  }
}

// One reason among the stale units → its sentence; more than one → each
// sentence after the units it is about.
function unitStaleWords(stale, stillClosing) {
  const reasonOf = new Map(stillClosing.map((s) => [s.id, s.reason]));
  const byReason = new Map();
  for (const id of stale) {
    const reason = reasonOf.get(id);
    if (!byReason.has(reason)) byReason.set(reason, []);
    byReason.get(reason).push(id);
  }
  const why = (reason) => UNIT_STALE_WHY[reason] ?? `not confirmed (${reason})`;
  if (byReason.size === 1) return ` — ${why([...byReason.keys()][0])}`;
  return ` — ${[...byReason].map(([reason, ids]) => `${list(ids)}: ${why(reason)}`).join('; ')}`;
}

const ITEM_WORDS = {
  changed: (n) => `${n === 1 ? 'its record' : 'their records'} and the views changed; commit them`,
  ambiguous: 'ambiguous-proof: the proof is the start of more than one commit — reopen the item and close it again with a longer hash',
  stale: () => ' — see /sig:docs-sweep',
};
const UNIT_WORDS = {
  // A unit confirm regenerates the views too (`work/EPICS.md`, the milestone
  // file's Epic table), so the words are the items' (M6.E16 t9.0).
  changed: ITEM_WORDS.changed,
  ambiguous: 'ambiguous-proof: the proof is the start of more than one commit — reopen the unit and request its close again with a longer hash',
  stale: unitStaleWords,
};

/**
 * The one line for a `confirmCloses` result, or `null` when there is nothing
 * to say (nothing confirmed, nothing closing). A confirmation names the files
 * it changed so a person seeing a modified view knows why.
 *
 * When a unit close is involved (`result.units` has anything in it, M6.E16
 * t4.2) the line names the two kinds separately: `Closes: items — … · units —
 * …`, or `Closes: units — …` when no item is. With no unit involved it is
 * the line it was before unit records.
 *
 * @param {{confirmed: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[],
 *   units?: {confirmed: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[]}}|null} result
 * @returns {string|null}
 */
export function formatConfirmClosesLine(result) {
  if (!result) return null;
  const parts = closeParts(result, ITEM_WORDS);
  const unitParts = result.units ? closeParts(result.units, UNIT_WORDS) : [];
  const tail = uncheckedParts(result);
  if (unitParts.length === 0) return parts.length === 0 ? null : `Closes: ${[...parts, ...tail].join(' · ')}`;
  const groups = [];
  if (parts.length > 0) groups.push(`items — ${parts.join(' · ')}`);
  groups.push(`units — ${unitParts.join(' · ')}`);
  return `Closes: ${[...groups, ...tail].join(' · ')}`;
}

// Evict the narrative of each unit this run confirmed closed (`SIG-295`). One
// result per unit, in the order given. Never throws: a throw from the eviction
// is that unit's result (`reason: 'error'`, the message in `detail`).
async function evictConfirmed(baseDir, ids, evict) {
  const out = [];
  for (const id of ids) {
    try {
      const r = await evict(baseDir, id);
      if (r.evicted) {
        out.push({ id, evicted: true, archivePath: r.archivePath });
        continue;
      }
      const one = { id, evicted: false, reason: r.reason };
      if (r.reason === 'held') one.holdReason = r.holdReason ?? null;
      if (r.reason === 'lossy-card') one.missing = r.missing;
      if (r.detail !== undefined) one.detail = r.detail;
      out.push(one);
    } catch (err) {
      out.push({ id, evicted: false, reason: 'error', detail: String(err?.message ?? err) });
    }
  }
  return out;
}

// Every value a coverage gate's `missing` names, flat: it is an object of
// lists by kind.
const missingList = (missing) => Object.values(missing ?? {}).flat().join(', ');

/**
 * What happened to one confirmed unit's narrative, in words — one of
 * `evictions`' entries. Shared by `evictionLine` and the sweep's advisory.
 *
 * @param {{id: string, evicted: boolean, reason?: string, archivePath?: string, holdReason?: string|null,
 *   missing?: object, detail?: string}} e
 * @returns {string}
 */
export function evictionWords(e) {
  if (e.evicted) return `moved out of STATE.md to ${e.archivePath}; commit both`;
  switch (e.reason) {
    case 'no-section':
    case 'no-state-file':
      return 'nothing in STATE.md to move';
    case 'held':
      return `kept in STATE.md: the unit is held (${e.holdReason})`;
    case 'lossy-card':
      return `kept in STATE.md: its retrospective does not cover it (missing: ${missingList(e.missing)}) — `
        + 'complete the retrospective, then call evictEpicNarrative (tools/lib/evict.js)';
    case 'no-card':
      return 'kept in STATE.md: it has no retrospective to be checked against';
    case 'unit-record-unreadable':
      return `kept in STATE.md: its unit record does not read (${e.detail})`;
    case 'error':
      return `not moved: ${e.detail}`;
    default:
      return `kept in STATE.md: ${e.reason}`;
  }
}

/**
 * The one line for `evictions`, or `null` when no unit was confirmed in this
 * run (so a second run says nothing).
 *
 * @param {Array<object>} evictions
 * @returns {string|null}
 */
export function formatEvictionLine(evictions) {
  if (!evictions || evictions.length === 0) return null;
  return `Narratives: ${evictions.map((e) => `${e.id} — ${evictionWords(e)}`).join(' · ')}`;
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
 * **On a project with unit records it then writes a second time** (M6.E16
 * t10.1, `SIG-295`): for each unit this run confirmed (`units.confirmed`) it
 * calls `evictEpicNarrative`, which moves that unit's narrative out of
 * `STATE.md` into `.planning/archive/<milestone>/<epic>/STATE-NARRATIVE.md`
 * when its own gate passes. The result is `evictions`, one entry per confirmed
 * unit, and `evictionLine`. A refusal (held, no retrospective, a retrospective
 * that does not cover the narrative, an unreadable record) or a throw leaves
 * the confirmation as it is and is that unit's entry. A run that confirms no
 * unit evicts nothing: `evictions` is `[]` and `evictionLine` is `null`.
 * Without unit records neither field is there and `STATE.md` is not read.
 *
 * @param {string} baseDir
 * @param {{now?: Date|string, execFn?: Function, confirm?: Function, evict?: Function}} [opts]
 *   `confirm`: the confirmation, injected in tests (default `confirmCloses`);
 *   `evict`: the eviction, injected in tests (default `evictEpicNarrative`)
 * @returns {Promise<{ran: boolean, confirmed: string[], stillClosing: Array<{id: string, reason: string}>,
 *   stale: string[], error: string|null, broken?: string[], line: string|null,
 *   units?: {confirmed: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[]}}>}
 *   `broken`: on a refusal over broken records, their IDs (else empty).
 *   `units`: `confirmCloses`' own, present only on a project with unit records.
 *   `evictions` (`Array<{id, evicted, archivePath?, reason?, holdReason?, missing?, detail?}>`) and
 *   `evictionLine` (`string|null`): present only on a project with unit records.
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
  const out = {
    ran: true,
    confirmed: result.confirmed,
    stillClosing: result.stillClosing,
    stale: result.stale,
    error: null,
    line: formatConfirmClosesLine(result),
  };
  if (!result.units) return out;
  const evictions = await evictConfirmed(baseDir, result.units.confirmed, opts.evict ?? evictEpicNarrative);
  return { ...out, units: result.units, evictions, evictionLine: formatEvictionLine(evictions) };
}

const nothingReported = () => ({ ran: false, ready: [], stillClosing: [], stale: [], error: null, line: null });

/**
 * The one line for a `probeCloses` result, or `null` when there is nothing to
 * say. It names what is ready and where it gets confirmed, and never claims
 * anything was written.
 *
 * When a unit has something to say (`result.units`, M6.E16 t5.0c) the line
 * names the two kinds separately: `Closes: items — … · units — …`, or
 * `Closes: units — …` when no item is. With no unit involved it is what it was.
 *
 * @param {{ready: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[],
 *   units?: {ready: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[]}}|null} result
 * @returns {string|null}
 */
export function formatCloseReportLine(result) {
  if (!result) return null;
  const partsOf = ({ ready = [], stale = [] }) => {
    const parts = [];
    if (ready.length > 0) parts.push(`${ready.length} ready to close (${list(ready)}) — run /sig:docs-sweep or /sig:ship to confirm`);
    if (stale.length > 0) parts.push(`${stale.length} closing over 14 days (${list(stale)}) — see /sig:docs-sweep`);
    return parts;
  };
  const parts = partsOf(result);
  // Units (M6.E16 t5.0c), named separately, as `formatConfirmClosesLine` does.
  const unitParts = result.units ? partsOf(result.units) : [];
  // This line names no other reason a close is waiting; these two it does,
  // because nothing can be confirmed until the person acts on them.
  const tail = uncheckedParts(result);
  if (unitParts.length === 0) return parts.length + tail.length === 0 ? null : `Closes: ${[...parts, ...tail].join(' · ')}`;
  const groups = [];
  if (parts.length > 0) groups.push(`items — ${parts.join(' · ')}`);
  groups.push(`units — ${unitParts.join(' · ')}`);
  return `Closes: ${[...groups, ...tail].join(' · ')}`;
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
 *   stale: string[], error: string|null, line: string|null,
 *   units?: {ready: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[]}}}
 *   `units`: the same three for unit records — present only on a project with unit records
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
  if (probe.units) result.units = { ready: probe.units.confirmable, stillClosing: probe.units.stillClosing, stale: probe.units.stale };
  return { ran: true, ...result, error: null, line: formatCloseReportLine(result) };
}
