// M6.E16 r1.5 (REVIEW pass 1: C-I5, T-I2) — a unit with no record, on a
// project that already has unit records (`D-M6E16-23`). See
// .planning/M6.E16-VALIDATION.md rows "AC9.2 — adding", "AC6.2 — no record"
// and "AC1.4 — the refusal".
//
// Before this, a project whose units are not Epic IDs could not give a new
// unit a record once `work/units/` existed: `/sig:docs-migrate --work-store`
// refused ("unit records are already on"), no command opens a unit that is not
// an Epic ID, and the item writers' refusal named that command anyway. Now:
//   - the units-only run, on a store that has `work/units/`, proposes records
//     for the units the project names that have none, and adds only those;
//   - `/sig:docs-sweep` lists the units still judged from their files;
//   - the refusal names what a person can do, and where it is written down.
// The project is `tests/helpers/units-store-fixture.js`. Every name is invented.

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { getUnit, listUnits, openUnit } from '../plugin/tools/lib/unit-records.js';
import { checkRecords, queueItem } from '../plugin/tools/lib/work-records.js';
import { checkUnitsWithoutRecord, runSweep } from '../plugin/tools/lib/sweep.js';
import {
  bytesOf, cleanupUnitsStores, commitAll, EPICS, git, put, read, retro, UNITS, unitsStore,
} from './helpers/units-store-fixture.js';

afterEach(cleanupUnitsStores);

const AT = '2026-10-11';
const dryRun = (base, opts = {}) => runWorkStoreMigrate(base, { apply: false, ...opts });
const applyWith = (base, dry, opts = {}) => runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T2', at: AT, ...opts });
const staged = (base) => git(base, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean).sort();
const changed = (before, after) => [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k)).sort();
const recordIds = (base) => listUnits(base).units.map((u) => u.id).sort();
const FIRST = ['GATE-A', 'M5.E2', 'M5.E3', 'M6.E1', 'M7.E1', 'M7.E2', 'M7.E3', 'M7.E4', 'M7.E5', 'M7.E9', 'PHASE10-S4'];

// The fixture, moved onto unit records and committed: 11 units have a record.
async function withUnits() {
  const base = await unitsStore({ repo: true });
  const first = await runWorkStoreMigrate(base, { apply: true, expectedHash: (await dryRun(base)).inputHash, stamp: 'T1', at: AT, confirmUnitCloses: true });
  expect(first.applied).toBe(true);
  commitAll(base, 'unit records');
  expect(recordIds(base)).toEqual(FIRST);
  return base;
}

// Two units named after the migration: one by a plan, one with a complete retrospective.
function nameTwoMore(base) {
  put(base, '.planning/phase-12-PLAN.md', '# phase-12 plan\n');
  put(base, '.planning/GATE-B-PLAN.md', '# GATE-B plan\n');
  put(base, '.planning/GATE-B-RETROSPECTIVE.md', retro('GATE-B'));
  commitAll(base, 'two more units');
}

describe('the units-only run on a project that already has unit records (C-I5)', () => {
  it('the dry run proposes records only for the units with none, by name, and writes nothing', async () => {
    const base = await withUnits();
    nameTwoMore(base);
    const before = bytesOf(base);
    const dry = await dryRun(base);
    expect(dry.refused).toBeUndefined();
    expect(dry).toMatchObject({ applied: false, dryRun: true, unitsOnly: true, key: 'LEAF' });
    // The new ones, and the three names that can never be units (refused, as on the first run).
    expect(dry.units.map((u) => [u.id, u.proposal])).toEqual([
      ['GATE-B', 'legacy-close'], ['LEAF-7', 'refused'], ['Phase-11', 'refused'], ['phase-11', 'refused'], ['phase-12', 'open'],
    ]);
    expect(dry.proposedUnitCloses.map((u) => u.id)).toEqual(['GATE-B']);
    expect(dry.inputHash).toMatch(/^units:[0-9a-f]{64}$/);
    expect(dry.report).toMatch(/already on the store \(key LEAF\) and has unit records/);
    expect(dry.report).toMatch(/11 units already have a record and are not touched/);
    expect(dry.report).toMatch(/\n {2}phase-12 {2}open/);
    expect(dry.report).toMatch(/\n {2}GATE-B {2}proposed: closed \(legacy\)/);
    expect(dry.report).toMatch(/--apply adds 2 unit records/);
    for (const id of FIRST) expect(dry.report).not.toMatch(new RegExp(`\\n {2}${id.replace('.', '\\.')} {2}`));
    expect(bytesOf(base)).toEqual(before);
    expect(git(base, ['status', '--porcelain'])).toBe('');
  });

  it('the apply adds exactly those records; every existing record keeps its bytes; staged, tagged', async () => {
    const base = await withUnits();
    nameTwoMore(base);
    const before = bytesOf(base);
    const dry = await dryRun(base);
    const r = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(r).toMatchObject({ applied: true, unitsOnly: true, units: 2, unitClosesConfirmed: 1 });
    const after = bytesOf(base);
    expect(changed(before, after)).toEqual([`${UNITS}/GATE-B.json`, `${UNITS}/phase-12.json`, EPICS].sort());
    expect(recordIds(base)).toEqual([...FIRST, 'GATE-B', 'phase-12'].sort());
    expect(getUnit(base, 'phase-12')).toMatchObject({ status: 'open' });
    expect(getUnit(base, 'GATE-B')).toMatchObject({ status: 'closed', close: { reason: 'legacy' } });
    expect(staged(base)).toEqual([`${UNITS}/GATE-B.json`, `${UNITS}/phase-12.json`, EPICS].sort());
    expect(r.tag).toBe('pre-work-store-units-T2');
    expect(r.report).toMatch(/Added 2 unit records under \.planning\/work\/units\//);
    expect(checkRecords(base)).toEqual([]);
    // And the unit can take an item now.
    expect((await queueItem(base, 'LEAF-1', { epic: 'phase-12', by: 'claude' }).catch((e) => e)).message ?? '').not.toMatch(/there is no unit/);
  });

  it('a proposed legacy close that is not confirmed is created open, with a note — as on the first run', async () => {
    const base = await withUnits();
    nameTwoMore(base);
    const r = await applyWith(base, await dryRun(base));
    expect(r).toMatchObject({ applied: true, units: 2, unitClosesConfirmed: 0 });
    expect(getUnit(base, 'GATE-B')).toMatchObject({ status: 'open' });
    expect(getUnit(base, 'GATE-B').record.migration_note).toMatch(/looked finished/);
  });

  it('nothing new: the dry run says so and writes nothing; an apply is refused and writes nothing', async () => {
    const base = await withUnits();
    const before = bytesOf(base);
    const dry = await dryRun(base);
    expect(dry.refused).toBeUndefined();
    expect(dry).toMatchObject({ applied: false, dryRun: true, unitsOnly: true, nothingToAdd: true });
    expect(dry.units.filter((u) => u.proposal !== 'refused')).toEqual([]);
    expect(dry.report).toMatch(/every unit this project names that can have a record has one — there is nothing to add/);
    const r = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/nothing to add.*Nothing was written/s);
    expect(bytesOf(base)).toEqual(before);
    expect(git(base, ['tag', '-l']).split('\n').filter(Boolean)).toEqual(['pre-work-store-units-T1']);
  });

  it('an apply needs the hash; a unit named, or a record written, after the dry run refuses it', async () => {
    const base = await withUnits();
    nameTwoMore(base);
    const dry = await dryRun(base);
    expect((await runWorkStoreMigrate(base, { apply: true })).reason).toMatch(/needs the dry run's inputHash/);
    // A record written by hand for one of the two, after the dry run.
    await openUnit(base, 'phase-12', { by: 'claude' });
    commitAll(base, 'opened by hand');
    const before = bytesOf(base);
    const r = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/changed since the dry run/);
    expect(bytesOf(base)).toEqual(before);
    // The next dry run proposes only the one that is left.
    expect((await dryRun(base)).units.filter((u) => u.proposal !== 'refused').map((u) => u.id)).toEqual(['GATE-B']);
  });

  it('--also may not name a unit that already has a record', async () => {
    const base = await withUnits();
    const r = await dryRun(base, { also: [{ id: 'M7.E3', reason: 'dropped', words: 'x' }] });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/--also M7\.E3/);
  });

  it('a broken unit record refuses the run: which units have a record is not known', async () => {
    const base = await withUnits();
    nameTwoMore(base);
    put(base, `${UNITS}/M7.E3.json`, '{ not json');
    commitAll(base, 'broken');
    const r = await dryRun(base);
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/M7\.E3/);
    expect(existsSync(join(base, `${UNITS}/phase-12.json`))).toBe(false);
  });

  it('the undo line on a dirty tree with --force removes only the records this run added, never the folder', async () => {
    const base = await withUnits();
    nameTwoMore(base);
    const dry = await dryRun(base);
    put(base, 'notes.txt', 'uncommitted\n');
    const r = await applyWith(base, dry, { force: true });
    expect(r.applied).toBe(true);
    expect(r.revertLine).toContain(`${UNITS}/GATE-B.json`);
    expect(r.revertLine).toContain(`${UNITS}/phase-12.json`);
    expect(r.revertLine).not.toMatch(/rm -rf -- \.planning\/work\/units(\s|$)/);
    expect(r.revertLine).toMatch(/^# --force on a dirty tree/);
  });
});

describe('/sig:docs-sweep lists the units still judged from their files (AC6.2, amended)', () => {
  it('one advisory per unit the project names that has no record, naming the fix; none once it has one', async () => {
    const base = await withUnits();
    expect(await checkUnitsWithoutRecord(base)).toEqual([]);
    nameTwoMore(base);
    const found = await checkUnitsWithoutRecord(base);
    expect(found.map((f) => f.message.match(/^(\S+) /)[1])).toEqual(['GATE-B', 'phase-12']);
    for (const f of found) {
      expect(f).toMatchObject({ check: 'unit-without-record', severity: 'advisory', file: UNITS });
      expect(f.message).toMatch(/has no unit record.*judged from its files.*\/sig:docs-migrate --work-store/);
    }
    const report = await runSweep(base);
    expect((report.findings ?? report).filter((f) => f.check === 'unit-without-record')).toHaveLength(2);
    await applyWith(base, await dryRun(base));
    expect(await checkUnitsWithoutRecord(base)).toEqual([]);
  });

  it('a project with no unit records, and one with no store, get no such advisory', async () => {
    expect(await checkUnitsWithoutRecord(await unitsStore())).toEqual([]);
    expect(await checkUnitsWithoutRecord(await unitsStore({ store: false }))).toEqual([]);
  });
});

describe('the refusal for a unit with no record names what a person can do (C-I5)', () => {
  it('queueItem: the message names the migration for a unit the project\'s files name, openUnit, and where that is written down', async () => {
    const base = await withUnits();
    const err = await queueItem(base, 'LEAF-1', { epic: 'phase-12', by: 'claude' }).catch((e) => e);
    expect(err).toMatchObject({ code: 'NOT_FOUND' });
    expect(err.message).toContain('there is no unit phase-12');
    expect(err.message).toMatch(/\/sig:discuss --epic/);
    expect(err.message).toMatch(/\/sig:docs-migrate --work-store adds a record for each unit this project's files name that has none/);
    expect(err.message).toMatch(/openUnit.*\/sig:docs-archive.*Holding a unit/s);
    expect(read(base, '.planning/work/items/00/LEAF-1.json')).not.toContain('phase-12');
  });
});
