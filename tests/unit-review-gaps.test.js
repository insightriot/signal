// M6.E16 REVIEW pass 1 — four things the code did right and no test held
// (T-S1, T-S3, N2, N3). See .planning/M6.E16-VALIDATION.md rows "T-S1", "T-S3",
// "N2", "N3". Temp folders; unit names are invented.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { EPICS_BEGIN, EPICS_END } from '../plugin/tools/lib/milestone-table.js';
import { checkMilestoneStatusVsState } from '../plugin/tools/lib/published-facts.js';
import { runDriftChecks, STATUS } from '../plugin/tools/lib/state-drift.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import * as units from '../plugin/tools/lib/unit-records.js';
import { planUnits } from '../plugin/tools/lib/work-migrate-units.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { tempProject, cleanupUnitProjects } from './helpers/unit-fixture.js';
import { MILESTONE, UNITS, cleanupUnitsStores, put, read, unitsStore } from './helpers/units-store-fixture.js';

const AT = '2026-10-12T10:00:00.000Z';
const opened = { type: 'opened', at: AT, by: 'claude' };

afterEach(() => {
  cleanupUnitsStores();
  cleanupUnitProjects();
});

// T-S1 — AC7.3's call-site test (tests/epic-row-parser-callers.test.js) reads
// the source for the switch; with the switch taken out of `readMilestoneRows`
// it still passed. This is the behaviour: the fixture has two units that only
// a milestone row names (M6.E1 and M7.E4).
describe('T-S1 — with unit records, planUnits proposes nothing from a milestone row (AC7.3)', () => {
  const ROW_ONLY = ['M6.E1', 'M7.E4'];

  it('without unit records the two units only a row names are proposed, each with its row', async () => {
    const base = await unitsStore();
    const plan = await planUnits(base, { storeKey: 'LEAF' });
    const byId = new Map(plan.units.map((u) => [u.id, u]));
    for (const id of ROW_ONLY) expect(byId.get(id)?.row, id).toMatchObject({ file: expect.stringMatching(/MILESTONE-\d\.md$/) });
    expect(plan.units.filter((u) => u.row !== null).length).toBeGreaterThan(ROW_ONLY.length);
  });

  it('with unit records neither is proposed, and no unit in the plan carries a row', async () => {
    const base = await unitsStore();
    await units.ensureUnitsDir(base);
    await regenerateViews(base);
    const plan = await planUnits(base, { storeKey: 'LEAF' });
    expect(plan.refusal).toBeUndefined();
    const ids = plan.units.map((u) => u.id);
    for (const id of ROW_ONLY) expect(ids).not.toContain(id);
    expect(plan.units.filter((u) => u.row !== null)).toEqual([]);
    expect(plan.units.some((u) => u.sources.some((s) => /milestone/i.test(s)))).toBe(false);
    // The units other sources name are still there: only the rows went unread.
    expect(ids).toEqual(expect.arrayContaining(['M7.E1', 'M7.E2', 'M7.E9', 'GATE-A']));
  });

  it('and a row that says "shipped" for a unit a file also names is not evidence either', async () => {
    const base = await unitsStore();
    await units.ensureUnitsDir(base);
    await regenerateViews(base);
    const plan = await planUnits(base, { storeKey: 'LEAF' });
    const e9 = plan.units.find((u) => u.id === 'M7.E9');
    expect(JSON.stringify([e9.evidence, e9.against])).not.toMatch(/row/i);
  });
});

// T-S3 — the on-disk case-twin test (tests/unit-records.test.js) is skipped on
// a disk that ignores case, which is every macOS checkout: the finding ran
// only in CI. `caseTwinFindings` is `checkUnits`' own code for it, from a list.
describe('T-S3 — the duplicate-id finding for IDs that differ only by case, from a list', () => {
  it('one finding per set, naming every path; the first ID in order is the finding\'s', () => {
    expect(units.caseTwinFindings(['M7.E1', 'phase-1', 'm7.e1', 'GATE-A', 'Gate-A', 'gate-a'])).toEqual([
      {
        code: 'duplicate-id',
        id: 'GATE-A',
        path: `${UNITS}/GATE-A.json`,
        paths: [`${UNITS}/GATE-A.json`, `${UNITS}/Gate-A.json`, `${UNITS}/gate-a.json`],
        message: `${UNITS}/GATE-A.json: GATE-A, Gate-A, gate-a differ only by case (${UNITS}/GATE-A.json, ${UNITS}/Gate-A.json, ${UNITS}/gate-a.json) — on a disk that ignores case they are one file`,
      },
      {
        code: 'duplicate-id',
        id: 'M7.E1',
        path: `${UNITS}/M7.E1.json`,
        paths: [`${UNITS}/M7.E1.json`, `${UNITS}/m7.e1.json`],
        message: `${UNITS}/M7.E1.json: M7.E1, m7.e1 differ only by case (${UNITS}/M7.E1.json, ${UNITS}/m7.e1.json) — on a disk that ignores case they are one file`,
      },
    ]);
  });

  it('no twins, no finding; the same ID twice is not a twin of itself', () => {
    expect(units.caseTwinFindings(['M7.E1', 'M7.E2', 'phase-1'])).toEqual([]);
    expect(units.caseTwinFindings(['M7.E1', 'M7.E1'])).toEqual([]);
    expect(units.caseTwinFindings([])).toEqual([]);
  });

  it('checkUnits reports exactly these for the records it lists (no twin on disk here: none reported)', async () => {
    const base = await unitsStore();
    await units.ensureUnitsDir(base);
    put(base, `${UNITS}/M7.E1.json`, UNIT_KIND.serializeRecord({ id: 'M7.E1', events: [opened] }));
    expect(units.checkUnits(base).filter((f) => f.code === 'duplicate-id')).toEqual(units.caseTwinFindings(['M7.E1']));
  });
});

// N2 — `checkMilestoneStatusVsState.run` has a switch of its own that
// `applicability` makes unreachable through `runDriftChecks`. It is kept (the
// row parser below it must sit behind the switch on its own — the call-site
// test reads for that), so it is tested by calling `run` directly.
describe('N2 — checkMilestoneStatusVsState.run reads no row with unit records, called on its own', () => {
  const STATE_MD = '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: M9.E2\ncompleted_phases: []\n---\n# State\n';
  const ROWS = '# Milestone 9\n\n| Epic | Status | Summary |\n|---|---|---|\n| `M9.E1` | **in flight** | a thing |\n| `M9.E2` | **shipped** — v9.9.9 | the live one |\n';
  function project() {
    const dir = tempProject('sig-facts-run-');
    mkdirSync(join(dir, '.planning'), { recursive: true });
    writeFileSync(join(dir, '.planning', 'STATE.md'), STATE_MD);
    writeFileSync(join(dir, '.planning', 'MILESTONE-9.md'), ROWS);
    writeFileSync(join(dir, '.planning', 'M9.E1-RETROSPECTIVE.md'), '# M9.E1 retro\n\n## What happened\n\nIt shipped.\n');
    return dir;
  }
  const ctxOf = (dir) => ({
    baseDir: dir,
    planningDir: join(dir, '.planning'),
    files: ['STATE.md', 'MILESTONE-9.md', 'M9.E1-RETROSPECTIVE.md'],
    state: { current_epic: 'M9.E2', phase: 'EXECUTE', completed_phases: [] },
  });

  it('the control: without unit records the same call finds both contradictions, so the context is a real one', async () => {
    const dir = project();
    const viaRunner = (await runDriftChecks(dir, [checkMilestoneStatusVsState])).results[0];
    expect(viaRunner.status).toBe(STATUS.FINDINGS);
    const found = await checkMilestoneStatusVsState.run(ctxOf(dir));
    expect(found.map((f) => f.message.match(/^M9\.E\d/)[0])).toEqual(['M9.E1', 'M9.E2']);
  });

  it('with a units folder: nothing', async () => {
    const dir = project();
    mkdirSync(join(dir, '.planning/work/units'), { recursive: true });
    expect(await checkMilestoneStatusVsState.run(ctxOf(dir))).toEqual([]);
  });

  it('with a units path that cannot be trusted (a file): nothing, and no throw', async () => {
    const dir = project();
    mkdirSync(join(dir, '.planning/work'), { recursive: true });
    writeFileSync(join(dir, '.planning/work/units'), 'a file, not a folder\n');
    expect(await checkMilestoneStatusVsState.run(ctxOf(dir))).toEqual([]);
  });
});

// N3 — an Epic ID whose milestone has three parts (`M4.5.2.E1`) names no
// milestone file: `currentMilestoneOf` (`work-views.js`) and
// `milestoneMarkers` (`work-migrate-units.js`) both stop at two.
describe('N3 — a current Epic with a three-part milestone ID names no milestone file', () => {
  const marked = (id) => ['# Milestone', '', EPICS_BEGIN, '| Epic | Status | Summary |', '|---|---|---|', `| \`${id}\` | by hand | kept |`, EPICS_END, ''].join('\n');
  const stateWith = (epic) => `---\nschema_version: 1\ndocs_layout_version: 3\nphase: EXECUTE\ncurrent_epic: ${epic}\ncompleted_phases: []\n---\n# State\n`;

  async function project(epic, file) {
    const base = await unitsStore();
    rmSync(join(base, MILESTONE));
    put(base, '.planning/STATE.md', stateWith(epic));
    put(base, file, marked(epic));
    await units.ensureUnitsDir(base);
    put(base, `${UNITS}/${epic}.json`, UNIT_KIND.serializeRecord({ id: epic, events: [opened] }));
    return base;
  }

  it('the control — two parts (M4.5.E1): MILESTONE-4.5.md is the current file, and its table is written', async () => {
    const file = '.planning/MILESTONE-4.5.md';
    const base = await project('M4.5.E1', file);
    await regenerateViews(base);
    expect(read(base, file)).toContain('| `M4.5.E1` | **in flight** |');
    expect(read(base, file)).not.toContain('by hand');
    expect((await planUnits(base, { storeKey: 'LEAF' })).milestone).toMatchObject({ rel: file, markers: 'ok' });
  });

  it('three parts (M4.5.2.E1): no file is the current milestone\'s — a marked MILESTONE-4.5.2.md is left byte-identical', async () => {
    const file = '.planning/MILESTONE-4.5.2.md';
    const base = await project('M4.5.2.E1', file);
    const before = read(base, file);
    await regenerateViews(base);
    expect(read(base, file)).toBe(before);
    expect((await planUnits(base, { storeKey: 'LEAF' })).milestone).toBeNull();
  });
});
