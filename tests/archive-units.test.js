// M6.E16 t6.2 — `/sig:docs-archive` on a project with unit records
// (`senseArchiveTree`, `buildArchiveReport`, `applyArchive`).
//
// With unit records, a unit that has a record archives when its record is
// closed and it is not held. A held unit is declined with its hold reason, in
// the dry run and on apply (AC5.2, SIG-255). A filled retrospective alone no
// longer archives a unit that has a record (SIG-288). A unit whose
// VERIFICATION already sits under archive/ is no longer read open: its record
// decides (SIG-289). The current unit never archives.

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { senseArchiveTree } from '../plugin/tools/lib/archive-tree.js';
import { buildArchiveReport, renderArchiveReport, applyArchive } from '../plugin/tools/lib/archive-command.js';
import { snapshotTree } from './helpers/write-inventory.js';
import {
  alone, ALONE, cleanupUnitProjects, contradiction, HOLD_REASON, PASS, plant, plantBroken, put, retroFor, state, tempProject, unitsOn,
} from './helpers/unit-fixture.js';

afterEach(cleanupUnitProjects);

const planned = (report) => report.plan.map((p) => p.unit).sort();
const refusal = (report, unit) => report.refusals.find((r) => r.unit === unit);
const here = (base, name) => existsSync(join(base, '.planning', name));

describe('senseArchiveTree with unit records (t6.2)', () => {
  it('follows the record where the files say the opposite', async () => {
    const off = await senseArchiveTree(contradiction());
    expect([...off.closedUnits].sort()).toEqual(['M7.E1']);
    const on = await senseArchiveTree(contradiction({ units: true }));
    expect([...on.closedUnits].sort()).toEqual(['M7.E2', 'M7.E3']);
    expect(on.moves.map((m) => m.from).sort()).toEqual(['.planning/M7.E2-PLAN.md', '.planning/M7.E3-PLAN.md']);
  });

  it('a filled retrospective alone does not archive a unit whose record is open (SIG-288)', async () => {
    const base = tempProject();
    put(base, '.planning/STATE.md', state());
    put(base, '.planning/M7.E1-PLAN.md', '# plan\n');
    put(base, '.planning/M7.E1-RETROSPECTIVE.md', retroFor('M7.E1'));
    expect((await senseArchiveTree(base)).closedUnits).toEqual(['M7.E1']); // before unit records
    unitsOn(base);
    plant(base, 'M7.E1', 'open');
    const sense = await senseArchiveTree(base);
    expect(sense.closedUnits).toEqual([]);
    expect(sense.moves).toEqual([]);
    expect(sense.closedEpicIds).toEqual(['M7.E1']); // still "which Epics have a filled retrospective"
  });

  it('a unit whose VERIFICATION is already under archive/ archives the rest when its record is closed (SIG-289)', async () => {
    const base = tempProject();
    put(base, '.planning/STATE.md', state());
    put(base, '.planning/M7.E1-PLAN.md', '# plan\n');
    put(base, '.planning/archive/M7/E1/M7.E1-VERIFICATION.md', PASS('M7.E1'));
    expect((await senseArchiveTree(base)).moves).toEqual([]); // before unit records: read open
    unitsOn(base);
    plant(base, 'M7.E1', 'closed');
    expect((await senseArchiveTree(base)).moves).toEqual([
      { from: '.planning/M7.E1-PLAN.md', to: '.planning/archive/M7/E1/M7.E1-PLAN.md' },
    ]);
  });

  it('a held unit is not in the closed set, and is returned with its reason', async () => {
    const base = contradiction({ units: true });
    plant(base, 'M7.E2', 'held');
    const sense = await senseArchiveTree(base);
    expect([...sense.closedUnits]).toEqual(['M7.E3']);
    expect(sense.held).toEqual([{ unit: 'M7.E2', reason: HOLD_REASON }]);
  });

  it('a held unit does not move even when the caller names it closed', async () => {
    const base = contradiction({ units: true });
    plant(base, 'M7.E2', 'held');
    const sense = await senseArchiveTree(base, { closedUnits: ['M7.E2', 'M7.E3'] });
    expect(sense.moves.map((m) => m.from)).toEqual(['.planning/M7.E3-PLAN.md']);
    expect(sense.held).toEqual([{ unit: 'M7.E2', reason: HOLD_REASON }]);
  });

  it('a closing unit, the current unit, and a unit whose record does not read are not archived', async () => {
    const base = contradiction({ units: true });
    put(base, '.planning/M7.E9-PLAN.md', '# plan\n'); // the current unit; its record is closed
    plant(base, 'M7.E2', 'closing');
    plantBroken(base, 'M7.E1'); // its files say closed
    const sense = await senseArchiveTree(base);
    expect([...sense.closedUnits]).toEqual(['M7.E3']);
  });

  it('without unit records nothing is held', async () => {
    expect((await senseArchiveTree(contradiction())).held).toEqual([]);
  });

  // REVIEW pass 2 (T2-I5): a closed record against a stub retrospective was not held by a test.
  it('a unit closed as dropped whose retrospective is still a stub archives: the record decides, and a stub does not veto it', async () => {
    const base = tempProject();
    put(base, '.planning/STATE.md', state());
    put(base, '.planning/M7.E3-PLAN.md', '# plan\n');
    put(base, '.planning/M7.E3-RETROSPECTIVE.md', '# M7.E3 Retrospective\n\n## What went well\n\n[FILL IN]\n');
    unitsOn(base);
    plant(base, 'M7.E3', 'dropped');
    const sense = await senseArchiveTree(base);
    expect(sense.closedUnits).toEqual(['M7.E3']);
    expect(sense.closedEpicIds).toEqual([]); // the stub is not a finished retrospective
    expect(sense.moves.map((m) => m.from)).toContain('.planning/M7.E3-PLAN.md');
    const report = await buildArchiveReport(base);
    expect(planned(report)).toEqual(['M7.E3']);
    // And with an open record the same files archive nothing.
    plant(base, 'M7.E3', 'open');
    expect((await senseArchiveTree(base)).closedUnits).toEqual([]);
  });
});

// REVIEW pass 2 (C2-I5, `D-M6E16-25`): a unit whose record is closed and which is still
// `current_epic` read open here and closed to every other reader. Now it reads closed
// everywhere, and its files stay while it is current.
describe('a closed unit that is still the current unit: closed, and its files stay', () => {
  const currentClosed = () => {
    const base = contradiction({ units: true }); // M7.E9 is current, and its record is closed
    put(base, '.planning/M7.E9-PLAN.md', '# plan\n');
    return base;
  };

  it('senseArchiveTree names it in `current`, keeps it out of the closed set, and plans no move of it', async () => {
    const sense = await senseArchiveTree(currentClosed());
    expect(sense.current).toEqual(['M7.E9']);
    expect([...sense.closedUnits].sort()).toEqual(['M7.E2', 'M7.E3']);
    expect(sense.moves.map((m) => m.from).filter((f) => f.includes('M7.E9'))).toEqual([]);
  });

  it('it does not move even when the caller names it closed', async () => {
    const sense = await senseArchiveTree(currentClosed(), { closedUnits: ['M7.E9', 'M7.E3'] });
    expect([...sense.closedUnits]).toEqual(['M7.E3']);
    expect(sense.current).toEqual(['M7.E9']);
    expect(sense.moves.map((m) => m.from).filter((f) => f.includes('M7.E9'))).toEqual([]);
  });

  it('the report declines it as [current], in these words, and --apply leaves its files', async () => {
    const base = currentClosed();
    const report = await buildArchiveReport(base);
    expect(planned(report)).not.toContain('M7.E9');
    expect(refusal(report, 'M7.E9')).toEqual({
      unit: 'M7.E9', status: 'current', reason: 'M7.E9 is closed; still the current unit, so its files stay until the next Epic opens',
    });
    expect(renderArchiveReport(report).join('\n')).toMatch(/M7\.E9 {2}\[current\] {2}M7\.E9 is closed; still the current unit, so its files stay until the next Epic opens/);
    await applyArchive(base);
    expect(here(base, 'M7.E9-PLAN.md')).toBe(true);
  });

  it('once another Epic is current, the same unit archives', async () => {
    const base = currentClosed();
    put(base, '.planning/STATE.md', state({ epic: 'M7.E4' }));
    const sense = await senseArchiveTree(base);
    expect(sense.current).toEqual([]);
    expect(sense.closedUnits).toContain('M7.E9');
    expect(sense.moves.map((m) => m.from)).toContain('.planning/M7.E9-PLAN.md');
  });

  it('a current unit that is closed AND held is said as held, once', async () => {
    const base = currentClosed();
    plant(base, 'M7.E9', 'held');
    const sense = await senseArchiveTree(base);
    expect(sense.current).toEqual([]);
    expect(sense.held).toEqual([{ unit: 'M7.E9', reason: HOLD_REASON }]);
    expect(refusal(await buildArchiveReport(base), 'M7.E9').status).toBe('held');
  });

  it('a current unit whose record is open is declined as the current unit, as before, and is not in `current`', async () => {
    const base = currentClosed();
    plant(base, 'M7.E9', 'open');
    expect((await senseArchiveTree(base)).current).toEqual([]);
    expect(refusal(await buildArchiveReport(base), 'M7.E9')).toMatchObject({ status: 'open' });
    expect(refusal(await buildArchiveReport(base), 'M7.E9').reason).toMatch(/current unit/);
  });

  it('without unit records the current unit is declined as before, and `current` is empty', async () => {
    const base = contradiction();
    put(base, '.planning/M7.E9-PLAN.md', '# plan\n');
    expect((await senseArchiveTree(base)).current).toEqual([]);
    expect(refusal(await buildArchiveReport(base), 'M7.E9')).toMatchObject({ status: 'open' });
  });

  it('/sig:docs-migrate treats it the same: not in its closed set, so neither its files nor its narrative move', async () => {
    const { resolveMigrateClosedUnits } = await import('../plugin/tools/lib/migrate-memory.js');
    const got = await resolveMigrateClosedUnits(currentClosed());
    expect(got.closedUnits).not.toContain('M7.E9');
    expect(got.closures.units.find((u) => u.unit === 'M7.E9')).toMatchObject({ status: 'closed', current: true });
  });
});

describe('/sig:docs-archive report with unit records (t6.2, AC5.2)', () => {
  it('the dry run declines a held unit and prints the reason', async () => {
    const base = contradiction({ units: true });
    plant(base, 'M7.E2', 'held');
    const before = snapshotTree(base);
    const report = await buildArchiveReport(base);
    expect(planned(report)).toEqual(['M7.E3']);
    expect(refusal(report, 'M7.E2')).toMatchObject({ status: 'held' });
    expect(refusal(report, 'M7.E2').reason).toContain(HOLD_REASON);
    const text = renderArchiveReport(report).join('\n');
    expect(text).toMatch(/M7\.E2 {2}\[held\]/);
    expect(text).toContain(HOLD_REASON);
    expect(snapshotTree(base)).toEqual(before);
  });

  it('apply moves nothing of a held unit, and moves the closed one beside it', async () => {
    const base = contradiction({ units: true });
    plant(base, 'M7.E2', 'held');
    const res = await applyArchive(base);
    expect(res.applied).toBe(true);
    expect(here(base, 'M7.E2-PLAN.md')).toBe(true);
    expect(here(base, 'archive/M7/E2/M7.E2-PLAN.md')).toBe(false);
    expect(here(base, 'M7.E3-PLAN.md')).toBe(false);
    expect(here(base, 'archive/M7/E3/M7.E3-PLAN.md')).toBe(true);
  });

  it('releasing the hold lets the unit archive', async () => {
    const base = contradiction({ units: true });
    plant(base, 'M7.E2', [
      { type: 'opened', at: '2026-10-11T10:00:00.000Z', by: 'claude' },
      { type: 'closed', at: '2026-10-11T10:00:00.000Z', by: 'claude', reason: 'dropped', words: 'stopped' },
      { type: 'held', at: '2026-10-11T10:00:00.000Z', by: 'claude', reason: HOLD_REASON },
      { type: 'released', at: '2026-10-11T10:00:00.000Z', by: 'claude' },
    ]);
    expect(planned(await buildArchiveReport(base))).toEqual(['M7.E2', 'M7.E3']);
  });

  it('follows the record where the files say the opposite, in the plan and on apply', async () => {
    expect(planned(await buildArchiveReport(contradiction()))).toEqual(['M7.E1']);
    const on = contradiction({ units: true });
    const report = await buildArchiveReport(on);
    expect(planned(report)).toEqual(['M7.E2', 'M7.E3']);
    expect(refusal(report, 'M7.E1')).toMatchObject({ status: 'open' });
    expect(refusal(report, 'M7.E1').reason).toMatch(/unit record/);
    await applyArchive(on);
    expect(here(on, 'M7.E1-PLAN.md')).toBe(true);
    expect(here(on, 'M7.E1-VERIFICATION.md')).toBe(true);
    expect(here(on, 'M7.E2-PLAN.md')).toBe(false);

    const off = contradiction();
    await applyArchive(off);
    expect(here(off, 'M7.E1-PLAN.md')).toBe(false);
    expect(here(off, 'M7.E2-PLAN.md')).toBe(true);
  });

  it('a closed unit with nothing left to move is neither planned nor declined, and never called a stub', async () => {
    const base = contradiction({ units: true });
    plant(base, 'M7.E5', 'legacy'); // no file in .planning/
    const report = await buildArchiveReport(base);
    expect(report.settled).toEqual(['M7.E5']);
    expect(refusal(report, 'M7.E5')).toBeUndefined();
    expect(report.counts.settled).toBe(1);
    expect(report.counts.units).toBe(report.plan.length + report.refusals.length + report.settled.length);
    const text = renderArchiveReport(report).join('\n');
    expect(text).toMatch(/nothing left to move \(1\).*M7\.E5/s);
    expect(text).not.toMatch(/stub/);
  });

  it('a project whose only unit is closed with nothing to move is not told "no units found"', async () => {
    const base = tempProject();
    put(base, '.planning/STATE.md', state());
    unitsOn(base);
    plant(base, 'M7.E5', 'legacy');
    const report = await buildArchiveReport(base);
    expect(report.counts).toEqual({ units: 1, archiving: 0, refused: 0, settled: 1, files: 0 });
    const text = renderArchiveReport(report).join('\n');
    expect(text).not.toMatch(/No units found/);
    expect(text).not.toMatch(/none is finished/);
    expect(text).toMatch(/all 1 unit\(s\) were checked, and each is closed with nothing left to move/);
  });

  it('nothing to archive, some settled and some declined: the line says both', async () => {
    const base = contradiction({ units: true });
    plant(base, 'M7.E2', 'open');
    plant(base, 'M7.E3', 'open');
    plant(base, 'M7.E5', 'legacy');
    const text = renderArchiveReport(await buildArchiveReport(base)).join('\n');
    expect(text).toMatch(/1 closed with nothing left to move, the rest declined/);
    expect(text).not.toMatch(/none is finished/);
  });

  it('the current unit is declined as the current unit, whatever its record says', async () => {
    const base = contradiction({ units: true });
    put(base, '.planning/M7.E9-PLAN.md', '# plan\n');
    const report = await buildArchiveReport(base);
    expect(planned(report)).not.toContain('M7.E9');
    expect(refusal(report, 'M7.E9').reason).toMatch(/current unit/);
  });

  it('a unit whose record does not read is declined with that reason', async () => {
    const base = contradiction({ units: true });
    plantBroken(base, 'M7.E1');
    const report = await buildArchiveReport(base);
    expect(planned(report)).not.toContain('M7.E1');
    expect(refusal(report, 'M7.E1')).toMatchObject({ status: 'cannotDetermine' });
  });

  it('without unit records the report has nothing settled and prints no such line', async () => {
    const report = await buildArchiveReport(contradiction());
    expect(report.settled).toEqual([]);
    expect(renderArchiveReport(report).join('\n')).not.toMatch(/nothing left to move/);
  });
});

describe('AC6.2 — with an open record, nothing on disk archives the unit', () => {
  for (const what of Object.keys(ALONE)) {
    it(`${what} alone`, async () => {
      const base = alone(what);
      expect((await senseArchiveTree(base)).closedUnits).toEqual([]);
      expect(planned(await buildArchiveReport(base))).toEqual([]);
      const before = snapshotTree(base);
      await applyArchive(base);
      expect(snapshotTree(base)).toEqual(before);
    });
  }
});
