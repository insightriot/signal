// M6.E16 t6.0 — the backlog discharge check on a project with unit records.
//
// `storeDischargeStatus` asked `isEpicArchived` about every live item's Epic,
// and `isEpicArchived` throws on a name that is not an Epic ID. With unit
// records an item may sit in `phase-11`, so the sweep and SHIP's discharge
// check crashed on the first such item. With unit records the unit's record
// says whether it is over: closed or held is finished, open or closing is not.
// A unit with no record is read as before unit records, for that unit only.

import { describe, it, expect, afterEach } from 'vitest';

import { storeDischargeStatus, BACKLOG_DISCHARGE } from '../plugin/tools/lib/backlog.js';
import { checkBacklogDischarge } from '../plugin/tools/lib/sweep.js';
import { recordPath } from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { AT, by, cleanupUnitProjects, contradiction, plant, plantBroken, put, state, tempProject, unitsOn } from './helpers/unit-fixture.js';

afterEach(cleanupUnitProjects);

const queued = (id, epic) => ({
  id,
  type: 'FEAT',
  title: `Leftover in ${epic}`,
  events: [{ type: 'created', at: AT, by }, { type: 'triaged', at: AT, by }, { type: 'queued', at: AT, by, epic }],
});

// A v2 store with one live item queued in each unit named.
function store(epics) {
  const base = tempProject('sig-discharge-units-');
  put(base, '.planning/STATE.md', state({ epic: null }));
  put(base, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  epics.forEach((epic, i) => put(base, recordPath(`SIG-${i + 1}`), serializeRecord(queued(`SIG-${i + 1}`, epic))));
  unitsOn(base);
  return base;
}

const staleIds = (res) => res.stale.map((s) => s.id).sort();

describe('storeDischargeStatus with unit records (t6.0)', () => {
  it('an item queued in a unit that is not an Epic ID does not crash the check', async () => {
    const base = store(['phase-11']);
    plant(base, 'phase-11', 'open');
    const res = await storeDischargeStatus(base);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.CLEAN);
    expect(res.resolvable).toBe(1);
  });

  it('the sweep reports such an item instead of throwing', async () => {
    const base = store(['phase-11']);
    plant(base, 'phase-11', 'closed');
    const findings = await checkBacklogDischarge(base);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toMatch(/SIG-1 .*phase-11/);
  });

  it('a live item in a closed unit is stale, and the evidence is the record', async () => {
    const base = store(['phase-11', 'M7.E2']);
    plant(base, 'phase-11', 'closed');
    plant(base, 'M7.E2', 'open');
    const res = await storeDischargeStatus(base);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.STALE);
    expect(staleIds(res)).toEqual(['SIG-1']);
    expect(res.stale[0].evidence).toMatch(/phase-11.*unit record.*closed/);
  });

  it('a held unit is finished for discharge: its live item is stale', async () => {
    const base = store(['GATE-A']);
    plant(base, 'GATE-A', 'held');
    expect(staleIds(await storeDischargeStatus(base))).toEqual(['SIG-1']);
  });

  it('a closing unit is not finished: nothing is discharged on a requested close', async () => {
    const base = contradiction({ store: true }); // M7.E1's files say closed
    unitsOn(base);
    plant(base, 'M7.E1', 'closing');
    plant(base, 'M7.E2', 'open');
    const res = await storeDischargeStatus(base);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.CLEAN);
    expect(res.stale).toEqual([]);
  });

  it('the record decides, not the files: both ways', async () => {
    const off = await storeDischargeStatus(contradiction({ store: true }));
    expect(staleIds(off)).toEqual(['SIG-1']); // files: M7.E1 closed, M7.E2 open
    const on = await storeDischargeStatus(contradiction({ store: true, units: true }));
    expect(staleIds(on)).toEqual(['SIG-2']); // records: M7.E1 open, M7.E2 closed
  });

  it('a unit with no record is read as before unit records, for that unit only', async () => {
    const base = contradiction({ store: true });
    unitsOn(base);
    plant(base, 'M7.E2', 'closed');
    // M7.E1 has no record: its files (a PASS verdict) still say closed.
    expect(staleIds(await storeDischargeStatus(base))).toEqual(['SIG-1', 'SIG-2']);
  });

  it('an item in a unit with no record and a name that is not an Epic ID is not a crash', async () => {
    const base = store(['phase-11']);
    const res = await storeDischargeStatus(base);
    expect(res.stale).toEqual([]);
  });

  it('a unit record that does not read is reported as could-not-evaluate, not passed over', async () => {
    const base = store(['M7.E2']);
    plantBroken(base, 'M7.E2');
    const res = await storeDischargeStatus(base);
    expect(res.outcome).toBe(BACKLOG_DISCHARGE.CANNOT_EVALUATE);
    expect(res.blind.map((b) => b.id)).toEqual(['SIG-1']);
    expect(res.blind[0].source).toBe('unit record');
    expect(res.reason).toMatch(/M7\.E2/);
  });
});
