// M6.E16 r1.4 (REVIEW pass 1: C-I4, S-M6, T-I1) — a `work/units/` folder that
// cannot be trusted is an error, never "this project has no unit records"
// (`D-M6E16-22`). See .planning/M6.E16-VALIDATION.md row "AC1.6 — a faulty folder".
//
// Three faults: the folder is a symbolic link, it is a file, it cannot be
// listed (mode 000). Before this, every reader took each for "off": closure
// went back to the retrospective and the verdict (so a unit whose record is
// OPEN read closed), a hold was lost, and the item store blamed an item record
// for naming a unit "on a project with no unit records". Now a reader answers
// that it cannot tell, with the folder and the fault named, and a writer or a
// mover refuses.
//
// The project is `tests/helpers/unit-fixture.js`'s contradiction: M7.E1's FILES
// say closed and its RECORD says open; M7.E2's record is closed. Every name is
// invented.

import { describe, it, expect, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveClosures, readUnitRecords } from '../plugin/tools/lib/closure.js';
import { isEpicDone } from '../plugin/tools/lib/retrospective.js';
import { senseArchiveTree, applyArchiveTree } from '../plugin/tools/lib/archive-tree.js';
import { buildArchiveReport } from '../plugin/tools/lib/archive-command.js';
import { closeEpic, openEpic } from '../plugin/tools/lib/work-ops.js';
import * as records from '../plugin/tools/lib/work-records.js';
import * as units from '../plugin/tools/lib/unit-records.js';
import { evictEpicNarrative } from '../plugin/tools/lib/evict.js';
import { storeDischargeStatus } from '../plugin/tools/lib/backlog.js';
import { deriveNextEpicId } from '../plugin/tools/lib/milestones.js';
import { cleanupUnitProjects, contradiction, HOLD_REASON, plant, put, retroFor } from './helpers/unit-fixture.js';

const UNITS = '.planning/work/units';
const by = 'claude';
const isRoot = process.getuid?.() === 0;

const cleanup = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()();
  cleanupUnitProjects();
});

// Each fault, applied to a project that had a sound folder a moment before.
const FAULTS = {
  'a symbolic link': (base) => {
    const outside = mkdtempSync(join(tmpdir(), 'sig-units-elsewhere-'));
    cleanup.push(() => rmSync(outside, { recursive: true, force: true }));
    renameSync(join(base, UNITS), join(outside, 'units'));
    symlinkSync(join(outside, 'units'), join(base, UNITS));
  },
  'a file': (base) => {
    rmSync(join(base, UNITS), { recursive: true, force: true });
    writeFileSync(join(base, UNITS), 'not a folder\n');
  },
  'a folder that cannot be listed (mode 000)': (base) => {
    chmodSync(join(base, UNITS), 0o000);
    cleanup.push(() => {
      if (existsSync(join(base, UNITS))) chmodSync(join(base, UNITS), 0o755);
    });
  },
};
const WORDS = {
  'a symbolic link': /symbolic link/,
  'a file': /not a folder/,
  'a folder that cannot be listed (mode 000)': /could not be read|EACCES/,
};

// What a refused write must leave alone: STATE.md, every item file, the lock.
function fingerprint(base) {
  const out = { state: readFileSync(join(base, '.planning/STATE.md'), 'utf-8'), items: {} };
  const dir = join(base, '.planning/work/items');
  for (const bucket of readdirSync(dir)) {
    for (const name of readdirSync(join(dir, bucket))) out.items[`${bucket}/${name}`] = readFileSync(join(dir, bucket, name), 'utf-8');
  }
  out.lock = existsSync(join(base, '.planning/work/.work.lock'));
  return out;
}

function project() {
  const base = contradiction({ units: true, store: true });
  plant(base, 'M7.E2', 'held'); // closed and held: nothing of it may move
  put(base, '.planning/M7.E2-RETROSPECTIVE.md', retroFor('M7.E2'));
  return base;
}

const cases = Object.keys(FAULTS).filter((name) => !(isRoot && name.includes('mode 000')));
if (isRoot) it.skip('mode 000 is not a fault for root: that case is skipped', () => {});

describe.each(cases)('units/ is %s', (fault) => {
  const broken = () => {
    const base = project();
    FAULTS[fault](base);
    return base;
  };
  const named = (text) => {
    expect(text).toContain('.planning/work/units/');
    expect(text).toMatch(WORDS[fault]);
    expect(text).not.toMatch(/does not exist/);
  };

  it('the control: with a sound folder M7.E1 reads open and M7.E2 closed and held', async () => {
    const base = project();
    const byUnit = new Map((await resolveClosures(base)).units.map((u) => [u.unit, u]));
    expect(byUnit.get('M7.E1')).toMatchObject({ status: 'open', source: 'record' });
    expect(byUnit.get('M7.E2')).toMatchObject({ status: 'closed', held: true });
    expect((await senseArchiveTree(base)).held).toEqual([{ unit: 'M7.E2', reason: HOLD_REASON }]);
  });

  it('hasUnitsSafe states the problem, and unitRecordsOn throws it naming the folder', () => {
    const base = broken();
    expect(units.hasUnitsSafe(base)).toEqual({ has: false, problem: expect.stringMatching(WORDS[fault]) });
    let err;
    try {
      units.unitRecordsOn(base);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ name: 'WorkStoreError' });
    named(err.message);
  });

  it('readUnitRecords does not answer "no unit records": it carries the problem', () => {
    const read = readUnitRecords(broken());
    expect(read).not.toBeNull();
    named(read.problem);
  });

  it('resolveClosures: no unit is closed and none is read from its files — each cannot be determined, with the reason', async () => {
    const out = await resolveClosures(broken());
    expect(out.counts.closed).toBe(0);
    const byUnit = new Map(out.units.map((u) => [u.unit, u]));
    // M7.E1's files alone say closed (a PASS verdict, a filled retrospective); its record says open.
    expect(byUnit.get('M7.E1').status).toBe('cannotDetermine');
    named(byUnit.get('M7.E1').reason);
    expect(byUnit.get('M7.E2').status).toBe('cannotDetermine');
    // The current unit is open whatever else is true.
    expect(byUnit.get('M7.E9')?.status ?? 'open').toBe('open');
  });

  it('isEpicDone: cannot-evaluate, never done from the retrospective', () => {
    const base = broken();
    for (const id of ['M7.E1', 'M7.E2']) {
      const out = isEpicDone(base, id);
      expect(out.status).toBe('cannot-evaluate');
      named(out.reason);
    }
  });

  it('senseArchiveTree: nothing moves — not the held unit, not the unit its files call closed, not a caller\'s own list', async () => {
    const base = broken();
    const sense = await senseArchiveTree(base);
    expect(sense.closedUnits).toEqual([]);
    expect(sense.moves).toEqual([]);
    named(sense.unitsProblem);
    const forced = await senseArchiveTree(base, { closedUnits: ['M7.E1', 'M7.E2'] });
    expect(forced.closedUnits).toEqual([]);
    expect(forced.moves).toEqual([]);
    const report = await buildArchiveReport(base);
    expect(report.plan).toEqual([]);
    expect(report.refusals.map((r) => r.unit)).toEqual(expect.arrayContaining(['M7.E1', 'M7.E2']));
    named(report.refusals.find((r) => r.unit === 'M7.E2').reason);
  });

  it('applyArchiveTree with apply: refused, and no file moves', async () => {
    const base = broken();
    const before = readdirSync(join(base, '.planning')).sort();
    const err = await applyArchiveTree(base, { apply: true, closedUnits: ['M7.E1', 'M7.E2'] }).catch((e) => e);
    expect(err).toMatchObject({ name: 'WorkStoreError' });
    named(err.message);
    expect(readdirSync(join(base, '.planning')).sort()).toEqual(before);
  });

  it('evictEpicNarrative: nothing is evicted, and the reason is the folder', async () => {
    const base = broken();
    const out = await evictEpicNarrative(base, 'M7.E1');
    expect(out).toMatchObject({ evicted: false, reason: 'unit-record-unreadable' });
    named(out.detail);
  });

  it('closeEpic and openEpic refuse with the folder named, and write nothing', async () => {
    const base = broken();
    const before = fingerprint(base);
    for (const run of [
      () => closeEpic(base, 'M7.E1', { by }),
      () => openEpic(base, 'M7.E5', { by }),
      () => openEpic(base, 'M7.E5'),
    ]) {
      const err = await run().catch((e) => e);
      expect(err).toMatchObject({ name: 'WorkStoreError' });
      named(err.message);
    }
    expect(fingerprint(base)).toEqual(before);
  });

  it('newItem, queueItem, startItem and reopenItem refuse with the folder named, and write nothing', async () => {
    const base = broken();
    const before = fingerprint(base);
    for (const run of [
      () => records.newItem(base, { title: 'a new one', by }),
      () => records.queueItem(base, 'SIG-1', { epic: 'M7.E4', by }),
      () => records.startItem(base, 'SIG-1', { epic: 'M7.E4', by }),
      () => records.reopenItem(base, 'SIG-1', { reason: 'it came back', by }),
      () => records.confirmCloses(base),
    ]) {
      const err = await run().catch((e) => e);
      expect(err, 'the call was not refused').toMatchObject({ name: 'WorkStoreError' });
      named(err.message);
    }
    expect(fingerprint(base)).toEqual(before);
  });

  it('listRecords, getRecord and probeCloses throw the folder\'s fault; no item record is blamed', () => {
    const base = broken();
    // A unit that is not an Epic ID, named by an item: the rule for a project
    // with NO unit records ("an item can name an Epic only") must not fire here.
    for (const run of [() => records.listRecords(base), () => records.getRecord(base, 'SIG-1'), () => records.probeCloses(base)]) {
      let err;
      try {
        run();
      } catch (e) {
        err = e;
      }
      expect(err).toMatchObject({ name: 'WorkStoreError' });
      named(err.message);
      expect(err.message).not.toMatch(/SIG-1|not an Epic ID/);
    }
  });

  it('checkRecords reports the folder as a finding and blames no item', () => {
    const findings = records.checkRecords(broken());
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => /\.planning\/work\/units/.test(`${f.path} ${f.message}`))).toBe(true);
    expect(findings.filter((f) => f.id === 'SIG-1' || f.id === 'SIG-2')).toEqual([]);
  });

  it('storeDischargeStatus cannot answer, and says why', async () => {
    const out = await storeDischargeStatus(broken());
    named(JSON.stringify(out));
  });

  it('deriveNextEpicId refuses to hand out an ID it cannot check against the records', async () => {
    const err = await deriveNextEpicId(broken(), '7').catch((e) => e);
    expect(err).toMatchObject({ name: 'WorkStoreError' });
    named(err.message);
  });
});

describe('a project with no units/ folder is still "off", with no problem (AC1.6)', () => {
  it('hasUnitsSafe, unitRecordsOn and readUnitRecords', () => {
    const base = contradiction({ store: true });
    expect(units.hasUnitsSafe(base)).toEqual({ has: false, problem: null });
    expect(units.unitRecordsOn(base)).toBe(false);
    expect(readUnitRecords(base)).toBeNull();
    expect(units.unitRecordsOn(project())).toBe(true);
  });
});
