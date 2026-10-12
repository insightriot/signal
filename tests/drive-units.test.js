// M6.E16 t6.4 — what `/sig:drive` offers to resume, on a project with unit
// records: `proposeEpicCandidates`' open-Epic test, and
// `findWorkOnOtherBranches`' check that an Epic open on another branch is
// already finished here. Real git, temp repositories.

import { describe, it, expect, afterEach } from 'vitest';
import { proposeEpicCandidates } from '../plugin/tools/lib/drive.js';
import { findWorkOnOtherBranches } from '../plugin/tools/lib/branch-work.js';
import {
  branchRepo, cleanupUnitProjects, plant, plantBroken, put, SHA, SHIPPED, state, tempProject, unitsOn,
} from './helpers/unit-fixture.js';

afterEach(cleanupUnitProjects);

const open = (r) => r.candidates.filter((c) => c.source === 'STATE.md (open Epic)').map((c) => c.id);

function project({ completed = [] } = {}) {
  const base = tempProject('sig-drive-units-');
  put(base, '.planning/STATE.md', state({ epic: 'M7.E9', completed }));
  put(base, '.planning/BACKLOG.md', '# Backlog\n');
  return base;
}

describe('proposeEpicCandidates with unit records (t6.4)', () => {
  it('follows the record where STATE.md says the opposite: no SHIP recorded, record closed', async () => {
    const off = project();
    expect(open(await proposeEpicCandidates(off))).toEqual(['M7.E9']);
    const on = project();
    unitsOn(on);
    plant(on, 'M7.E9', 'closed');
    expect(open(await proposeEpicCandidates(on))).toEqual([]);
  });

  it('follows the record where STATE.md says the opposite: SHIP recorded, record open', async () => {
    const off = project({ completed: SHIPPED });
    expect(open(await proposeEpicCandidates(off))).toEqual([]);
    const on = project({ completed: SHIPPED });
    unitsOn(on);
    plant(on, 'M7.E9', 'open');
    const r = await proposeEpicCandidates(on);
    expect(open(r)).toEqual(['M7.E9']);
    expect(r.candidates[0].why).toMatch(/already open at EXECUTE/);
    expect(r.awaitingMerge).toBeUndefined();
  });

  it('a closing Epic is not a candidate to start; it is named as awaiting its merge', async () => {
    const on = project();
    unitsOn(on);
    plant(on, 'M7.E9', 'closing');
    const r = await proposeEpicCandidates(on);
    expect(open(r)).toEqual([]);
    expect(r.awaitingMerge).toEqual([{ id: 'M7.E9', proof: SHA, why: expect.stringMatching(/default branch/) }]);
  });

  it('a held Epic is closed: not a candidate', async () => {
    const on = project();
    unitsOn(on);
    plant(on, 'M7.E9', 'held');
    expect(open(await proposeEpicCandidates(on))).toEqual([]);
  });

  it('no record for the current Epic: STATE.md decides, as before', async () => {
    const on = project();
    unitsOn(on);
    plant(on, 'M7.E1', 'closed');
    expect(open(await proposeEpicCandidates(on))).toEqual(['M7.E9']);
  });

  it('a record that does not read is reported, and STATE.md decides', async () => {
    const on = project();
    unitsOn(on);
    plantBroken(on, 'M7.E9');
    const r = await proposeEpicCandidates(on);
    expect(open(r)).toEqual(['M7.E9']);
    expect(r.cannotCheck.some((c) => c.source === 'unit records' && /M7\.E9/.test(c.reason))).toBe(true);
  });

  it('without unit records the result has the three keys it had', async () => {
    expect(Object.keys(await proposeEpicCandidates(project())).sort()).toEqual(['candidates', 'cannotCheck', 'unclassifiedBranches']);
  });
});

// ── findWorkOnOtherBranches ─────────────────────────────────────────────────

// `main` holds a shipped M7.E9; `feat/lantern` has M7.E1 open (`branchRepo`).
const repo = branchRepo;
const openElsewhere = async (base) => (await findWorkOnOtherBranches(base, { localEpic: 'M7.E9' })).open.map((o) => o.epic);

describe('findWorkOnOtherBranches with unit records (t6.4)', () => {
  it('finished here follows the record: a retrospective on HEAD, record open → still offered', async () => {
    expect(await openElsewhere(repo({ retro: true }))).toEqual([]);
    const on = repo({ retro: true });
    unitsOn(on);
    plant(on, 'M7.E1', 'open');
    expect(await openElsewhere(on)).toEqual(['M7.E1']);
  }, 60_000);

  it('finished here follows the record: nothing on HEAD, record closed → not offered', async () => {
    expect(await openElsewhere(repo({ retro: false }))).toEqual(['M7.E1']);
    const on = repo({ retro: false });
    unitsOn(on);
    plant(on, 'M7.E1', 'closed');
    expect(await openElsewhere(on)).toEqual([]);
  }, 60_000);

  it('held is finished here; closing is not', async () => {
    const held = repo({ retro: false });
    unitsOn(held);
    plant(held, 'M7.E1', 'held');
    expect(await openElsewhere(held)).toEqual([]);
    const closing = repo({ retro: true });
    unitsOn(closing);
    plant(closing, 'M7.E1', 'closing');
    expect(await openElsewhere(closing)).toEqual(['M7.E1']);
  }, 60_000);

  it('no record for that Epic: the files on HEAD decide, as before', async () => {
    const on = repo({ retro: true });
    unitsOn(on);
    plant(on, 'M7.E9', 'closed');
    expect(await openElsewhere(on)).toEqual([]);
  });

  it('a record that does not read: the Epic is still offered, and the problem is reported', async () => {
    const on = repo({ retro: true });
    unitsOn(on);
    plantBroken(on, 'M7.E1');
    const r = await findWorkOnOtherBranches(on, { localEpic: 'M7.E9' });
    expect(r.open.map((o) => o.epic)).toEqual(['M7.E1']);
    expect(r.failed).toBe(false);
    expect(r.cannotCheck.some((c) => c.source === 'unit records' && /M7\.E1/.test(c.reason))).toBe(true);
  });
});
