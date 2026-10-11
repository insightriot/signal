// M6.E16 t6.3 — the readers that act on "this unit is closed", on a project
// with unit records: `evictEpicNarrative` (STATE.md narrative), the migration's
// closed set (`resolveMigrateClosedUnits`, and `senseVector3` through it), the
// migration's dry run and apply for a held unit (AC5.2), and
// `checkEpicWithoutRetro`'s list of units.

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { evictEpicNarrative } from '../plugin/tools/lib/evict.js';
import { resolveMigrateClosedUnits, senseVector3, runMigrate, renderDryRun } from '../plugin/tools/lib/migrate-memory.js';
import { runDriftChecks, checkEpicWithoutRetro, STATUS } from '../plugin/tools/lib/state-drift.js';
import { snapshotTree } from './helpers/write-inventory.js';
import {
  cleanupUnitProjects, contradiction, HOLD_REASON, NARRATIVE, plant, plantBroken, put, retroFor, state, unitsOn,
} from './helpers/unit-fixture.js';

afterEach(cleanupUnitProjects);

const stateText = (base) => readFileSync(join(base, '.planning/STATE.md'), 'utf-8');

describe('evictEpicNarrative with unit records (t6.3)', () => {
  it('follows the record where the retrospective says the opposite', async () => {
    const off = contradiction();
    expect(await evictEpicNarrative(off, 'M7.E1')).toMatchObject({ evicted: true });
    expect(await evictEpicNarrative(off, 'M7.E2')).toEqual({ evicted: false, reason: 'not-closed' });

    const on = contradiction({ units: true });
    const before = snapshotTree(on);
    expect(await evictEpicNarrative(on, 'M7.E1')).toEqual({ evicted: false, reason: 'not-closed' }); // record open, retro filled
    expect(snapshotTree(on)).toEqual(before);
    put(on, '.planning/M7.E2-RETROSPECTIVE.md', retroFor('M7.E2'));
    expect(await evictEpicNarrative(on, 'M7.E2')).toMatchObject({ evicted: true }); // record closed
  });

  it('a closed record with no retrospective is not called not-closed: there is no card to check against', async () => {
    const on = contradiction({ units: true });
    const before = snapshotTree(on);
    expect(await evictEpicNarrative(on, 'M7.E2')).toEqual({ evicted: false, reason: 'no-card' });
    expect(snapshotTree(on)).toEqual(before);
  });

  it('a held unit keeps its narrative, and the answer carries the hold reason', async () => {
    const on = contradiction({ units: true });
    put(on, '.planning/M7.E2-RETROSPECTIVE.md', retroFor('M7.E2'));
    plant(on, 'M7.E2', 'held');
    const before = snapshotTree(on);
    expect(await evictEpicNarrative(on, 'M7.E2')).toEqual({ evicted: false, reason: 'held', holdReason: HOLD_REASON });
    expect(snapshotTree(on)).toEqual(before);
  });

  it('a closing unit is not closed: nothing is evicted on a requested close', async () => {
    const on = contradiction({ units: true });
    put(on, '.planning/M7.E2-RETROSPECTIVE.md', retroFor('M7.E2'));
    plant(on, 'M7.E2', 'closing');
    expect(await evictEpicNarrative(on, 'M7.E2')).toEqual({ evicted: false, reason: 'not-closed' });
  });

  it('a unit with no record is read as before unit records', async () => {
    const base = contradiction();
    unitsOn(base);
    expect(await evictEpicNarrative(base, 'M7.E1')).toMatchObject({ evicted: true });
  });

  it('a record that does not read evicts nothing and says so', async () => {
    const base = contradiction();
    unitsOn(base);
    plantBroken(base, 'M7.E1');
    const before = snapshotTree(base);
    const out = await evictEpicNarrative(base, 'M7.E1');
    expect(out).toMatchObject({ evicted: false, reason: 'unit-record-unreadable' });
    expect(out.detail).toMatch(/M7\.E1/);
    expect(snapshotTree(base)).toEqual(before);
  });
});

describe('resolveMigrateClosedUnits and senseVector3 with unit records (t6.3)', () => {
  it('the closed set follows the record where the files say the opposite', async () => {
    expect((await resolveMigrateClosedUnits(contradiction())).closedUnits).toEqual(['M7.E1']);
    const on = await resolveMigrateClosedUnits(contradiction({ units: true }));
    expect(on.closedUnits).toEqual(['M7.E2', 'M7.E3']);
    expect(on.held).toEqual([]);
  });

  it('a held unit is not in the closed set and is returned with its reason; a closing one is not in it either', async () => {
    const base = contradiction({ units: true });
    plant(base, 'M7.E2', 'held');
    plant(base, 'M7.E3', 'closing');
    const out = await resolveMigrateClosedUnits(base);
    expect(out.closedUnits).toEqual([]);
    expect(out.held).toEqual([{ unit: 'M7.E2', reason: HOLD_REASON }]);
  });

  it('a stub retrospective does not veto a unit whose record is closed; it still vetoes one with no record', async () => {
    const base = contradiction();
    put(base, '.planning/M7.E1-RETROSPECTIVE.md', '# M7.E1 Retrospective\n\n[FILL IN]\n');
    put(base, '.planning/M7.E2-RETROSPECTIVE.md', '# M7.E2 Retrospective\n\n[FILL IN]\n');
    expect((await resolveMigrateClosedUnits(base)).closedUnits).toEqual([]); // M7.E1: PASS verdict, stub veto
    unitsOn(base);
    plant(base, 'M7.E2', 'closed');
    expect((await resolveMigrateClosedUnits(base)).closedUnits).toEqual(['M7.E2']);
  });

  it('without unit records the result has no held key', async () => {
    expect(Object.keys(await resolveMigrateClosedUnits(contradiction())).sort()).toEqual(['closedUnits', 'closures']);
  });

  it('senseVector3 evicts the narrative of the unit the record calls closed', async () => {
    const off = contradiction();
    put(off, '.planning/M7.E2-RETROSPECTIVE.md', retroFor('M7.E2'));
    expect((await senseVector3(off, stateText(off))).evicts.map((e) => e.epicId)).toEqual(['M7.E1']);

    const on = contradiction({ units: true });
    put(on, '.planning/M7.E2-RETROSPECTIVE.md', retroFor('M7.E2'));
    const plan = await senseVector3(on, stateText(on));
    expect(plan.evicts.map((e) => e.epicId)).toEqual(['M7.E2']);
    const flag = plan.flags.find((f) => f.epicId === 'M7.E1');
    expect(flag).toMatchObject({ kind: 'not-closed' });
    expect(flag.reason).toMatch(/unit record/);
    expect(flag.reason).not.toMatch(/PASS verdict/);
  });
});

describe('/sig:docs-migrate and a held unit (t6.3, AC5.2)', () => {
  const V3 = ['docs_layout_version: 3'];
  function project() {
    const base = contradiction({ units: true });
    put(base, '.planning/STATE.md', state({ front: V3, body: NARRATIVE }));
    put(base, '.planning/BACKLOG.md', '# Backlog\n');
    put(base, '.planning/M7.E2-RETROSPECTIVE.md', retroFor('M7.E2'));
    plant(base, 'M7.E2', 'held');
    return base;
  }

  it('the dry run moves nothing of it, keeps its narrative, and prints the hold reason', async () => {
    const base = project();
    const out = await renderDryRun(base);
    expect(out).not.toContain('.planning/M7.E2-PLAN.md →');
    expect(out).not.toContain('M7.E2 narrative →');
    expect(out).toContain('.planning/M7.E3-PLAN.md →');
    expect(out).toMatch(/M7\.E2 — .*held/);
    expect(out).toContain(HOLD_REASON);
  });

  it('apply moves nothing of it', async () => {
    const base = project();
    const r = await runMigrate(base, { apply: true, stamp: 'T1', dateStr: '2026-10-11' });
    expect(r.applied, r.reason).toBe(true);
    expect(existsSync(join(base, '.planning/M7.E2-PLAN.md'))).toBe(true);
    expect(existsSync(join(base, '.planning/archive/M7/E2'))).toBe(false);
    expect(stateText(base)).toContain('## M7.E2 — harbour sync');
    expect(existsSync(join(base, '.planning/M7.E3-PLAN.md'))).toBe(false); // the closed one beside it moved
  });

  it('with closed records and nothing left to move, the dry run does not call it a gap', async () => {
    const base = contradiction();
    put(base, '.planning/STATE.md', state({ front: V3 }));
    put(base, '.planning/BACKLOG.md', '# Backlog\n');
    unitsOn(base);
    plant(base, 'M7.E1', 'open');
    plant(base, 'M7.E5', 'legacy');
    const out = await renderDryRun(base);
    expect(out).not.toMatch(/This is a gap/);
    expect(out).toMatch(/1 closed by (its|their) unit record/);
  });
});

describe('checkEpicWithoutRetro with unit records (t6.3)', () => {
  const found = async (base) => {
    const { results } = await runDriftChecks(base, [checkEpicWithoutRetro]);
    return { status: results[0].status, units: (results[0].findings ?? []).map((f) => f.message.match(/^(\S+)/)[1]).sort() };
  };

  it('which units are checked follows the records', async () => {
    // Files: M7.E2 and M7.E3 have a PLAN and no retrospective.
    expect(await found(contradiction())).toEqual({ status: STATUS.FINDINGS, units: ['M7.E2', 'M7.E3'] });
    // Records: M7.E3 was dropped (it never ran); M7.E4 has a record, is not the
    // current unit, and has no file at all.
    expect(await found(contradiction({ units: true }))).toEqual({ status: STATUS.FINDINGS, units: ['M7.E2', 'M7.E4'] });
  });

  it('the retrospective check itself is kept: a stub is still a finding, a filled one clears it', async () => {
    const base = contradiction({ units: true });
    put(base, '.planning/M7.E2-RETROSPECTIVE.md', '# M7.E2 Retrospective\n\n[FILL IN]\n');
    put(base, '.planning/M7.E4-RETROSPECTIVE.md', retroFor('M7.E4'));
    const { results } = await runDriftChecks(base, [checkEpicWithoutRetro]);
    expect(results[0].findings).toHaveLength(1);
    expect(results[0].findings[0].message).toMatch(/^M7\.E2 .*stub/);
  });

  it('the current unit is skipped, and a unit with no record is checked from its files', async () => {
    const base = contradiction();
    unitsOn(base);
    plant(base, 'M7.E9', 'open');
    expect((await found(base)).units).toEqual(['M7.E2', 'M7.E3']);
  });

  it('a unit whose record does not read is passed over here (the sweep reports the record)', async () => {
    const base = contradiction({ units: true });
    plantBroken(base, 'M7.E2');
    expect((await found(base)).units).toEqual(['M7.E4']);
  });
});
