// A project whose FILES and whose UNIT RECORDS disagree about which units are
// over (M6.E16 S6) — the fixture behind every "this reader follows the record"
// test. Built in a temp folder; every name is invented.
//
// What the files say, and what the records say when they are planted:
//
//   unit    files                                             files say   record
//   M7.E1   PLAN, VERIFICATION (PASS), a filled retrospective closed      open
//   M7.E2   PLAN only                                         open        closed (shipped)
//   M7.E3   PLAN only                                         open        closed (dropped)
//   M7.E4   nothing                                           (not seen)  open
//   M7.E9   the current Epic (STATE.md), no SHIP recorded     open        closed (shipped)
//
// `STATE.md` carries a narrative section for M7.E1 and one for M7.E2, so the
// eviction readers have something to move.
//
// Not imported from a test file: importing one registers its tests twice.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { UNIT_KIND } from '../../plugin/tools/lib/unit-record.js';
import { recordPath } from '../../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../../plugin/tools/lib/work-record.js';

export const AT = '2026-10-11T10:00:00.000Z';
export const SHA = '0123abc';
export const by = 'claude';
export const UNITS = '.planning/work/units';
export const HOLD_REASON = 'the rollout notes are still read every morning';

/** One event of each kind a unit record's history is built from. */
export const E = Object.freeze({
  opened: { type: 'opened', at: AT, by },
  closing: { type: 'close_requested', at: AT, by, proof: SHA },
  shipped: { type: 'closed', at: AT, by, reason: 'shipped', proof: SHA },
  dropped: { type: 'closed', at: AT, by, reason: 'dropped', words: 'the work moved elsewhere' },
  legacy: { type: 'closed', at: '2026-08-01', by: 'migration', reason: 'legacy' },
  held: { type: 'held', at: AT, by, reason: HOLD_REASON },
});

/** The event lists the tests name: `HISTORY.closed` is a unit that shipped. */
export const HISTORY = Object.freeze({
  open: [E.opened],
  closing: [E.opened, E.closing],
  closed: [E.opened, E.closing, E.shipped],
  held: [E.opened, E.closing, E.shipped, E.held],
  dropped: [E.opened, E.dropped],
  legacy: [E.legacy],
});

export function put(base, rel, content) {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

/** Turn unit records on: the folder, with its `.keep`. */
export function unitsOn(base) {
  put(base, `${UNITS}/.keep`, '');
}

/** Write one unit record. `history` is a key of `HISTORY` or an event list. */
export function plant(base, id, history, over = {}) {
  const events = typeof history === 'string' ? HISTORY[history] : history;
  put(base, `${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events, ...over }));
}

/** A unit record that does not read. */
export function plantBroken(base, id) {
  put(base, `${UNITS}/${id}.json`, '{ not json');
}

export const state = ({ epic = 'M7.E9', phase = 'EXECUTE', completed = [], body = '' } = {}) =>
  [
    '---',
    'schema_version: 1',
    `phase: ${phase}`,
    `current_epic: ${epic ?? 'null'}`,
    'current_wave: null',
    'current_tasks: []',
    completed.length ? `completed_phases:\n${completed.map((c) => `  - ${c}`).join('\n')}` : 'completed_phases: []',
    'blockers: []',
    '---',
    '',
    '# Project State',
    '',
    body,
  ].join('\n');

const NARRATIVE =
  '## M7.E1 — lantern index\n\nShipped 2026-09-01. Decision D-M7E1-1 locked. FR1 delivered; AC1 verified.\n\n' +
  '## M7.E2 — harbour sync\n\nShipped 2026-09-02. Decision D-M7E2-1 locked. FR1 delivered; AC1 verified.\n\n' +
  '## Closed work\n\n- existing pointer\n';

export const retroFor = (id) =>
  `# ${id} Retrospective\n\nOutcome: shipped 2026-09-0${id.at(-1)} (${id}).\n` +
  `Decision D-${id.replace('.', '')}-1 locked. FR1 done. AC1 verified.\n`;

export const PASS = (id) => `# ${id} verification\n\n**Verdict:** PASS\n`;

const made = [];

/** Remove every project made here. Call from `afterEach`. */
export function cleanupUnitProjects() {
  while (made.length) rmSync(made.pop(), { recursive: true, force: true });
}

/** An empty temp project folder, removed by `cleanupUnitProjects`. */
export function tempProject(prefix = 'sig-unit-fixture-') {
  const base = mkdtempSync(join(tmpdir(), prefix));
  made.push(base);
  return base;
}

const item = (id, epic) => ({
  id,
  type: 'FEAT',
  title: `Leftover in ${epic}`,
  events: [
    { type: 'created', at: AT, by },
    { type: 'triaged', at: AT, by },
    { type: 'queued', at: AT, by, epic },
  ],
});

/**
 * The project in the table above.
 *
 * @param {{units?: boolean, store?: boolean}} [opts] — `units`: plant the
 *   contradicting records (and the folder); `store`: a v2 work store with one
 *   live item queued in M7.E1 (`SIG-1`) and one in M7.E2 (`SIG-2`)
 * @returns {string} the project folder
 */
export function contradiction({ units = false, store = false } = {}) {
  const base = tempProject('sig-unit-contradiction-');
  put(base, '.planning/STATE.md', state({ body: NARRATIVE }));
  put(base, '.planning/M7.E1-PLAN.md', '# M7.E1 plan\n');
  put(base, '.planning/M7.E1-VERIFICATION.md', PASS('M7.E1'));
  put(base, '.planning/M7.E1-RETROSPECTIVE.md', retroFor('M7.E1'));
  put(base, '.planning/M7.E2-PLAN.md', '# M7.E2 plan\n');
  put(base, '.planning/M7.E3-PLAN.md', '# M7.E3 plan\n');
  if (store) {
    put(base, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    put(base, recordPath('SIG-1'), serializeRecord(item('SIG-1', 'M7.E1')));
    put(base, recordPath('SIG-2'), serializeRecord(item('SIG-2', 'M7.E2')));
  }
  if (units) {
    unitsOn(base);
    plant(base, 'M7.E1', 'open');
    plant(base, 'M7.E2', 'closed');
    plant(base, 'M7.E3', 'dropped');
    plant(base, 'M7.E4', 'open');
    plant(base, 'M7.E9', 'closed');
  }
  return base;
}
