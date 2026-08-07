// M5.E18 S6 — where a non-Epic unit archives to, safely (NFR4, NFR2, NFR1).
// See .planning/M5.E18-PLAN.md § S6.
//
// `deriveEpicArchiveDir` yields `.planning/archive/{M}/E{n}` from a strict ID
// and THROWS otherwise, and `planArchiveMoves` filtered every non-strict id out
// before it could get there. `PHASE10-S4` and `GATE-A` have no milestone to key
// on — which is why 8 of 12 real projects cannot archive at all.
//
// Layout: `.planning/archive/{unit}/` — flat, one directory per unit, no derived
// hierarchy. Strict Epic IDs keep `{M}/E{n}` so nothing that works today moves.
//
// WRITTEN BEFORE THE IMPLEMENTATION. S4's tests were not, and that is recorded
// in M5.E18-PROGRESS.md rather than smoothed over; this slice does not repeat it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  planArchiveMoves,
  deriveUnitArchiveDir,
  isSafeUnitName,
  senseArchiveTree,
  applyArchiveTree,
} from '../tools/lib/archive-tree.js';
import { deriveUnits } from '../tools/lib/work-units.js';

const P = '.planning';

// A unit's scaffold files as they sit at the top level before archiving.
const scaffold = (unit) => [
  `${P}/${unit}-REQUIREMENTS.md`,
  `${P}/${unit}-PLAN.md`,
  `${P}/${unit}-VERIFICATION.md`,
];

// ---------------------------------------------------------------------------
// AC6.1 — the destination
// ---------------------------------------------------------------------------

describe('S6 AC6.1 — a non-Epic unit archives to .planning/archive/{unit}/', () => {
  it('a strict Epic ID keeps its existing {M}/E{n} path', () => {
    expect(deriveUnitArchiveDir('M4.5.E1')).toBe('.planning/archive/M4.5/E1');
    expect(deriveUnitArchiveDir('M5.E13')).toBe('.planning/archive/M5/E13');
  });

  it('a non-Epic unit gets a flat per-unit directory', () => {
    expect(deriveUnitArchiveDir('PHASE10-S4')).toBe('.planning/archive/PHASE10-S4');
    expect(deriveUnitArchiveDir('GATE-A')).toBe('.planning/archive/GATE-A');
    expect(deriveUnitArchiveDir('v0.1.6')).toBe('.planning/archive/v0.1.6');
  });

  it('planArchiveMoves plans moves for a non-Epic unit — it used to drop them silently', () => {
    const files = scaffold('PHASE10-S4');
    const { moves } = planArchiveMoves(['PHASE10-S4'], files);
    expect(moves.length).toBe(3);
    for (const m of moves) {
      expect(m.to.startsWith('.planning/archive/PHASE10-S4/')).toBe(true);
    }
  });

  it('NO EXISTING EPIC MOVE CHANGES — a strict-only plan is byte-identical to before', () => {
    // The regression guard for the whole slice. Epic behaviour is the thing
    // that must not move while the gate is widened.
    const files = scaffold('M5.E13');
    const { moves } = planArchiveMoves(['M5.E13'], files);
    expect(moves).toEqual([
      { from: `${P}/M5.E13-REQUIREMENTS.md`, to: `${P}/archive/M5/E13/M5.E13-REQUIREMENTS.md` },
      { from: `${P}/M5.E13-PLAN.md`, to: `${P}/archive/M5/E13/M5.E13-PLAN.md` },
      { from: `${P}/M5.E13-VERIFICATION.md`, to: `${P}/archive/M5/E13/M5.E13-VERIFICATION.md` },
    ]);
  });

  it('a mixed set plans both kinds in one pass', () => {
    const files = [...scaffold('M5.E13'), ...scaffold('GATE-A')];
    const { moves } = planArchiveMoves(['M5.E13', 'GATE-A'], files);
    expect(moves.filter((m) => m.to.includes('/archive/M5/E13/')).length).toBe(3);
    expect(moves.filter((m) => m.to.includes('/archive/GATE-A/')).length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// AC6.2 (NFR4) — confinement. Adversarial, because the corpus has no such
// names today and that is luck of inventory, not safety.
// ---------------------------------------------------------------------------

describe('S6 AC6.2 — a unit name cannot escape .planning/archive/', () => {
  const HOSTILE = [
    '..',
    '../..',
    '../escape',
    'a/../../etc',
    'a/b',
    'a\\b',
    '.hidden',
    '.',
    '/abs',
    '',
    'unit\0null',
    'a..b',
  ];

  it.each(HOSTILE)('rejects %j as a unit name', (bad) => {
    expect(isSafeUnitName(bad)).toBe(false);
  });

  it.each(['M4.5.E1', 'PHASE10-S4', 'GATE-A', 'v0.1.6', 'SLICE-SSO', 'T25'])(
    'accepts the real corpus name %j',
    (good) => {
      expect(isSafeUnitName(good)).toBe(true);
    }
  );

  it('deriveUnitArchiveDir THROWS on a hostile name rather than returning a path', () => {
    for (const bad of ['..', 'a/b', '../escape', '.hidden']) {
      expect(() => deriveUnitArchiveDir(bad), bad).toThrow();
    }
  });

  it('planArchiveMoves plans NOTHING for a hostile unit name', () => {
    // Defence in depth: even if a hostile name reaches the planner, no move is
    // emitted. A thrown error here would be a denial-of-service on the whole
    // plan; dropping the one unit keeps every other unit archivable.
    const files = [`${P}/../etc-PLAN.md`, `${P}/M5.E13-PLAN.md`];
    const { moves } = planArchiveMoves(['../etc', 'M5.E13'], files);
    expect(moves.every((m) => m.to.startsWith('.planning/archive/'))).toBe(true);
    expect(moves.some((m) => m.to.includes('..'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC6.3 (NFR2) — idempotency, and the exclusion it rests on
// ---------------------------------------------------------------------------

describe('S6 AC6.3 — a second pass proposes zero moves', () => {
  it('already-archived files are NOT re-planned (archive/ excluded from move planning)', () => {
    // The plan says stability comes free "provided archive/ is excluded from
    // the scan. That exclusion is an AC, not an assumption." So: assert it.
    const archived = [
      `${P}/archive/PHASE10-S4/PHASE10-S4-PLAN.md`,
      `${P}/archive/M5/E13/M5.E13-PLAN.md`,
    ];
    const { moves } = planArchiveMoves(['PHASE10-S4', 'M5.E13'], archived);
    expect(moves).toEqual([]);
  });

  it('a unit half-archived still moves only what is still at the top level', () => {
    const files = [
      `${P}/GATE-A-PLAN.md`, // still to move
      `${P}/archive/GATE-A/GATE-A-REQUIREMENTS.md`, // already there
    ];
    const { moves } = planArchiveMoves(['GATE-A'], files);
    expect(moves).toEqual([
      { from: `${P}/GATE-A-PLAN.md`, to: `${P}/archive/GATE-A/GATE-A-PLAN.md` },
    ]);
  });
});

// ---------------------------------------------------------------------------
// AC6.4 (NFR1) + AC6.3 end-to-end — dry-run writes nothing; apply then re-sense
// ---------------------------------------------------------------------------

describe('S6 AC6.4 — dry-run is default and writes nothing', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e18-s6-'));
    await mkdir(join(baseDir, P), { recursive: true });
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  async function seed() {
    await writeFile(
      join(baseDir, P, 'STATE.md'),
      '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: null\ncurrent_wave: null\n' +
        'current_tasks: []\ncompleted_phases: []\nblockers: []\nlast_completed_task: null\n---\n#\n',
      'utf-8'
    );
    await writeFile(join(baseDir, P, 'GATE-A-PLAN.md'), '# gate a plan\n', 'utf-8');
    await writeFile(join(baseDir, P, 'GATE-A-VERIFICATION.md'), '**Verdict:** PASS\n', 'utf-8');
  }

  it('.planning/ is byte-identical after a dry-run', async () => {
    await seed();
    const before = (await readdir(join(baseDir, P))).sort();
    await applyArchiveTree(baseDir, { closedUnits: ['GATE-A'], apply: false });
    const after = (await readdir(join(baseDir, P))).sort();
    expect(after).toEqual(before);
    expect(after).not.toContain('archive');
  });

  it('apply moves the unit, and a second sense proposes ZERO moves', async () => {
    await seed();
    await applyArchiveTree(baseDir, { closedUnits: ['GATE-A'], apply: true });
    const top = (await readdir(join(baseDir, P))).sort();
    expect(top).toContain('archive');
    expect(top).not.toContain('GATE-A-PLAN.md');

    const again = await senseArchiveTree(baseDir, { closedUnits: ['GATE-A'] });
    expect(again.moves).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// M5.E18 wave 6 — the mover uses BOTH definitions of "done"
//
// Measured across 12 real projects: with the retro-only rule the mover archives
// 67 files, ALL of them in Signal's own tree — every other project archives
// nothing, because 8 of 12 keep no retrospectives at all. The Epic built the
// capability and the command still could not reach it.
//
// Swapping to the verdict rule is NOT the fix: M5.E17 has a retrospective but
// never wrote a VERIFICATION, so the verdict rule reads it as still running and
// 4 files would STOP archiving. Neither definition dominates. Either counts:
// 67 -> 114 files, 1 -> 6 projects, nothing lost.
// ---------------------------------------------------------------------------

describe('S6 wave 6 — closed by a retro OR by a passing verdict, and a stub vetoes both', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e18-union-'));
    await mkdir(join(baseDir, P), { recursive: true });
    await writeFile(
      join(baseDir, P, 'STATE.md'),
      '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: null\ncurrent_wave: null\n' +
        'current_tasks: []\ncompleted_phases: []\nblockers: []\nlast_completed_task: null\n---\n# S\n',
      'utf-8'
    );
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  const w = (n, c) => writeFile(join(baseDir, P, n), c, 'utf-8');

  it('a unit closed by RETRO with no verdict still archives (the M5.E17 shape)', async () => {
    await w('M9.E1-RETROSPECTIVE.md', '# retro\n\nReal content.\n');
    await w('M9.E1-PLAN.md', '# plan\n');
    const { moves } = await senseArchiveTree(baseDir);
    expect(moves.map((m) => m.from)).toContain(`${P}/M9.E1-PLAN.md`);
  });

  it('a unit closed by VERDICT with no retro now archives too (the v0.1.6 shape)', async () => {
    await w('GATE-B-VERIFICATION.md', '**Verdict:** PASS\n');
    await w('GATE-B-PLAN.md', '# plan\n');
    const { moves } = await senseArchiveTree(baseDir);
    expect(moves.map((m) => m.from)).toContain(`${P}/GATE-B-PLAN.md`);
  });

  it('a STUB retro VETOES closure even with a passing verdict — B64 must not come back', async () => {
    // The union's one real hazard. On the real corpus no stub-retro unit also
    // carries a passing verdict, so this would pass by inventory luck — which is
    // exactly the reasoning this Epic keeps rejecting.
    await w('M9.E3-RETROSPECTIVE.md', '# retro\n\n## What went well\n\n[FILL IN]\n');
    await w('M9.E3-VERIFICATION.md', '**Verdict:** PASS\n');
    await w('M9.E3-PLAN.md', '# plan\n');
    const { moves } = await senseArchiveTree(baseDir);
    expect(
      moves.map((m) => m.from),
      'a stub-retro unit archived via the verdict path'
    ).not.toContain(`${P}/M9.E3-PLAN.md`);
  });

  it('an explicit opts.closedUnits still overrides the default entirely', async () => {
    await w('M9.E1-RETROSPECTIVE.md', '# retro\n\nReal.\n');
    await w('M9.E1-PLAN.md', '# plan\n');
    const { moves } = await senseArchiveTree(baseDir, { closedUnits: [] });
    expect(moves).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// B82 — the mover must agree with the derivation about which files are a unit.
//
// `planArchiveMoves` used to rebuild candidates as `{unit}-{suffix}.md`, a
// SECOND implementation of unit membership that cannot express `deriveUnits`'
// conservative fold. Measured live before the fix, through `senseArchiveTree`
// (the path `/sig:migrate-memory` calls): `SLICE-SSO` resolved to 5 files in
// BOTH `nextpass` and `cm-mentor-coach` while the mover planned 3 — an apply
// moved three files and left two, splitting the unit across `.planning/` and
// `.planning/archive/`.
//
// The fixture is `NEXTPASS_SPLIT_PAIRS`, real filenames transcribed from the
// measured corpus. It runs anywhere; a test keyed to a developer's local
// checkout would fail or silently skip in CI, and a silent skip is the
// blindness this repo keeps shipping Epics to remove.
//
// `cm-mentor-coach` needs no separate case: its `SLICE-SSO` carries the
// byte-identical filenames, verified in the same run. A second copy would
// assert the same thing twice and read as broader coverage than it is.
// ---------------------------------------------------------------------------

const NEXTPASS_SPLIT_PAIRS = [
  'PLAN-GATE-A-RESEARCH.md',
  'PLAN-GATE-A-VALIDATION.md',
  'GATE-A-PROGRESS.md',
  'PLAN-SC1-RESEARCH.md',
  'PLAN-SC1-VALIDATION.md',
  'SC1-PROGRESS.md',
  'SC1-VERIFICATION.md',
  'PLAN-SLICE-SSO-RESEARCH.md',
  'PLAN-SLICE-SSO-VALIDATION.md',
  'SLICE-SSO-PROGRESS.md',
  'SLICE-SSO-REVIEW.md',
  'SLICE-SSO-VERIFICATION.md',
  'PLAN-SLICE-VOICE1-RESEARCH.md',
  'PLAN-SLICE-VOICE1-VALIDATION.md',
  'VOICE1-PROGRESS.md',
];

describe('B82 — a closed unit archives whole, never half', () => {
  const rel = NEXTPASS_SPLIT_PAIRS.map((f) => `${P}/${f}`);
  const { units } = deriveUnits(NEXTPASS_SPLIT_PAIRS);

  it('every derived unit is a unit the mover fully agrees with', () => {
    // Guard the guard: if the fold ever stops folding, this suite must not
    // quietly start asserting over an empty set.
    expect(units.size).toBeGreaterThanOrEqual(4);

    for (const [unit, derived] of units) {
      const { moves } = planArchiveMoves([unit], rel);
      const planned = moves.map((m) => m.from.replace(`${P}/`, '')).sort();
      expect(planned, `unit ${unit} must archive whole`).toEqual([...derived].sort());
    }
  });

  it('SLICE-SSO plans all 5 files — it planned 3 before the fix', () => {
    const { moves } = planArchiveMoves(['SLICE-SSO'], rel);
    expect(moves.length).toBe(5);
    expect(moves.map((m) => m.from.replace(`${P}/`, '')).sort()).toEqual([
      'PLAN-SLICE-SSO-RESEARCH.md',
      'PLAN-SLICE-SSO-VALIDATION.md',
      'SLICE-SSO-PROGRESS.md',
      'SLICE-SSO-REVIEW.md',
      'SLICE-SSO-VERIFICATION.md',
    ]);
    // Every file lands in ONE directory — the split is the defect.
    for (const m of moves) {
      expect(m.to.startsWith(`${P}/archive/SLICE-SSO/`)).toBe(true);
    }
  });

  it('a folded file keeps its own name inside the unit directory', () => {
    const { moveMap } = planArchiveMoves(['SLICE-SSO'], rel);
    expect(moveMap.get(`${P}/PLAN-SLICE-SSO-RESEARCH.md`)).toBe(
      `${P}/archive/SLICE-SSO/PLAN-SLICE-SSO-RESEARCH.md`
    );
  });

  it('moves stay in lifecycle order, not alphabetical (AC6.1 ordering)', () => {
    const { moves } = planArchiveMoves(['SC1'], rel);
    // RESEARCH(1) -> PROGRESS(3) -> VERIFICATION(4) -> VALIDATION(5).
    expect(moves.map((m) => m.from.replace(`${P}/`, ''))).toEqual([
      'PLAN-SC1-RESEARCH.md',
      'SC1-PROGRESS.md',
      'SC1-VERIFICATION.md',
      'PLAN-SC1-VALIDATION.md',
    ]);
  });
});
