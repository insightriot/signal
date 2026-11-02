// The one-time layout cleanup for a project that predates Epic folders (course correction Step 1).
//
// Measured on the test project's spare copy 2026-11-02, after the work-store move and docs-archive:
// the current Epic's 7 files loose at the top, closed Epics' profiles and checkpoints left behind,
// 45 old `*-archive` copies, and 11 roadmap or milestone files. Retrospectives stay at the top by
// design (SHIP writes them there and the retro index reads them there), as do the current Epic's
// profile (`readEffectiveProfile` reads it there) and the MILESTONE files (SHIP and milestone
// numbering read them there).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { planArchiveMoves, planLayoutCleanup, senseArchiveTree, applyArchiveTree } from '../plugin/tools/lib/archive-tree.js';
import { resolveArtifactPath } from '../plugin/tools/lib/resume.js';
import { readEffectiveProfile } from '../plugin/tools/lib/profile.js';
import { projectFolderName } from '../plugin/tools/lib/work-migrate-lists.js';

const P = '.planning';
const EPIC_PROFILE = `---
tier: SKETCH
schema_version: 1

calibration:
  scope: throwaway
  stakes: none
  novelty: familiar
  reversibility: trivial
  horizon: hours

phases_skipped:
  - REVIEW

rigor_overrides:
  tdd_required: false
  security_audit: none
  performance_pass: false
  simplification_pass: false
  nyquist_enforcement: off
  plan_validation_dims: none
  research_parallelism: 0
  gate_strictness: off
  context_rot_reread: false
  review_depth: none

metadata:
  created_at: 2026-07-15T01:00:00Z
  created_by: sig:calibrate
  escalation_history: []
---
`;


describe("planArchiveMoves — a closed Epic takes its profile too, and still leaves its other prefixed files", () => {
  it('moves the profile, keeps the retrospective and a checkpoint note', () => {
    const files = [`${P}/M3.0.E1-PLAN.md`, `${P}/M3.0.E1-PROFILE.md`, `${P}/M3.0.E1-CHECKPOINT-A.md`, `${P}/M3.0.E1-RETROSPECTIVE.md`];
    const { moves } = planArchiveMoves(['M3.0.E1'], files);
    expect(moves.map((m) => m.from)).toEqual([`${P}/M3.0.E1-PLAN.md`, `${P}/M3.0.E1-PROFILE.md`]);
    expect(moves.every((m) => m.to.startsWith(`${P}/archive/M3.0/E1/`))).toBe(true);
  });

  it('does not take another Epic whose ID starts the same way', () => {
    const { moves } = planArchiveMoves(['M3.0.E1'], [`${P}/M3.0.E1-PLAN.md`, `${P}/M3.0.E10-PROFILE.md`]);
    expect(moves.map((m) => m.from)).toEqual([`${P}/M3.0.E1-PLAN.md`]);
  });
});

describe('planLayoutCleanup — pure', () => {
  const top = (names) => names.map((n) => (typeof n === 'string' ? { name: n, isDir: false } : n));
  const none = () => false;

  it("moves the current Epic's loose files into its folder, but not its profile or retrospective", () => {
    const r = planLayoutCleanup({
      currentEpic: 'M3.0.E3',
      topLevel: top(['M3.0.E3-PLAN.md', 'M3.0.E3-PROGRESS.md', 'M3.0.E3-CHECKPOINT-A.md', 'M3.0.E3-PROFILE.md', 'M3.0.E3-RETROSPECTIVE.md', 'M3.0.E30-PLAN.md']),
      exists: none,
    });
    expect(r.moves).toEqual([
      { from: `${P}/M3.0.E3-CHECKPOINT-A.md`, to: `${P}/epics/M3.0.E3/M3.0.E3-CHECKPOINT-A.md`, why: 'current Epic' },
      { from: `${P}/M3.0.E3-PLAN.md`, to: `${P}/epics/M3.0.E3/M3.0.E3-PLAN.md`, why: 'current Epic' },
      { from: `${P}/M3.0.E3-PROGRESS.md`, to: `${P}/epics/M3.0.E3/M3.0.E3-PROGRESS.md`, why: 'current Epic' },
    ]);
  });

  it('moves old *-archive copies into archive/legacy/', () => {
    const r = planLayoutCleanup({ currentEpic: null, topLevel: top(['CONTEXT.md.v2.7-archive', 'STATE.md.gsd-archive', 'STATE.md']), exists: none });
    expect(r.moves.map((m) => m.to)).toEqual([`${P}/archive/legacy/CONTEXT.md.v2.7-archive`, `${P}/archive/legacy/STATE.md.gsd-archive`]);
  });

  it("lists roadmap files Signal does not read, and leaves the ones it does", () => {
    const r = planLayoutCleanup({
      currentEpic: null,
      topLevel: top(['ROADMAP.md', 'MILESTONE-M3.0.md', 'MILESTONE-4.md', 'MILESTONES.md', 'big-picture-roadmap.md', { name: 'milestones', isDir: true }]),
      exists: none,
    });
    expect(r.roadmapExtras).toEqual(['MILESTONES.md', 'big-picture-roadmap.md', 'milestones']);
    expect(r.moves).toEqual([]);
  });

  it('retires a listed roadmap file, and a folder file by file, when asked', () => {
    const r = planLayoutCleanup({
      currentEpic: null,
      topLevel: top(['MILESTONES.md', { name: 'milestones', isDir: true }]),
      filesUnder: (dir) => [`${dir}/v2.0-ROADMAP.md`, `${dir}/sub/audit.md`],
      retire: ['MILESTONES.md', 'milestones', 'ROADMAP.md'],
      exists: none,
    });
    expect(r.moves.map((m) => m.to)).toEqual([
      `${P}/archive/legacy/MILESTONES.md`,
      `${P}/archive/legacy/milestones/v2.0-ROADMAP.md`,
      `${P}/archive/legacy/milestones/sub/audit.md`,
    ]);
    expect(r.skipped).toEqual([{ path: 'ROADMAP.md', reason: 'not a roadmap file this cleanup retires (Signal reads it, or it is not at the top of .planning/)' }]);
  });

  it('skips a move whose destination already exists, naming it', () => {
    const r = planLayoutCleanup({ currentEpic: 'M3.0.E3', topLevel: top(['M3.0.E3-PLAN.md']), exists: (p) => p.endsWith('epics/M3.0.E3/M3.0.E3-PLAN.md') });
    expect(r.moves).toEqual([]);
    expect(r.skipped[0].path).toBe(`${P}/M3.0.E3-PLAN.md`);
    expect(r.skipped[0].reason).toMatch(/already exists/);
  });
});

describe('senseArchiveTree / applyArchiveTree with layout: true — on disk', () => {
  let dir;
  const write = async (rel, text) => {
    await mkdir(join(dir, rel, '..'), { recursive: true });
    await writeFile(join(dir, rel), text);
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'layout-cleanup-'));
    await write(`${P}/STATE.md`, '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: M3.0.E3\n---\n\nSee [the plan](M3.0.E3-PLAN.md) and [old](CONTEXT.md.v2.7-archive).\n');
        await write(`${P}/M3.0.E3-PROFILE.md`, EPIC_PROFILE);
    await write(`${P}/M3.0.E3-PLAN.md`, '# Plan for E3\n');
    await write(`${P}/M3.0.E3-REQUIREMENTS.md`, '# Requirements for E3\n');
    await write(`${P}/M3.0.E4-PLAN.md`, '# Planned, not current, not closed\n');
    await write(`${P}/CONTEXT.md.v2.7-archive`, 'old context\n');
    await write(`${P}/ROADMAP.md`, '# Roadmap\n');
    await write(`${P}/MILESTONES.md`, '# Milestones\n');
  });
  afterEach(async () => rm(dir, { recursive: true, force: true }));

  it('the dry run plans the moves and the roadmap list, and writes nothing', async () => {
    const before = (await readdir(join(dir, P))).sort();
    const sense = await senseArchiveTree(dir, { layout: true, closedUnits: [] });
    expect(sense.moves.map((m) => m.from).sort()).toEqual([`${P}/CONTEXT.md.v2.7-archive`, `${P}/M3.0.E3-PLAN.md`, `${P}/M3.0.E3-REQUIREMENTS.md`]);
    expect(sense.layout.roadmapExtras).toEqual(['MILESTONES.md']);
    expect((await readdir(join(dir, P))).sort()).toEqual(before);
  });

  it('without layout: true nothing of this is planned (docs-archive is unchanged)', async () => {
    const sense = await senseArchiveTree(dir, { closedUnits: [] });
    expect(sense.moves).toEqual([]);
    expect(sense.layout).toBeUndefined();
  });

  it('apply moves them, rewrites links, keeps the profile and the same artifacts resolving, and a second run plans nothing', async () => {
    const planBefore = await readFile(resolveArtifactPath(join(dir, P), 'PLAN', { currentEpic: 'M3.0.E3' }), 'utf-8');
    await applyArchiveTree(dir, { apply: true, layout: true, closedUnits: [] });

    expect(existsSync(join(dir, P, 'epics/M3.0.E3/M3.0.E3-PLAN.md'))).toBe(true);
    expect(existsSync(join(dir, P, 'M3.0.E3-PLAN.md'))).toBe(false);
    expect(existsSync(join(dir, P, 'archive/legacy/CONTEXT.md.v2.7-archive'))).toBe(true);
    expect(existsSync(join(dir, P, 'M3.0.E4-PLAN.md'))).toBe(true);
    expect(existsSync(join(dir, P, 'MILESTONES.md'))).toBe(true);

    const state = await readFile(join(dir, P, 'STATE.md'), 'utf-8');
    expect(state).toContain('](./epics/M3.0.E3/M3.0.E3-PLAN.md)');
    expect(state).toContain('](./archive/legacy/CONTEXT.md.v2.7-archive)');

    const planAfter = await readFile(resolveArtifactPath(join(dir, P), 'PLAN', { currentEpic: 'M3.0.E3' }), 'utf-8');
    expect(planAfter).toBe(planBefore);
    expect((await readEffectiveProfile(dir, { currentEpic: 'M3.0.E3' })).tier).toBe('SKETCH');

    const again = await senseArchiveTree(dir, { layout: true, closedUnits: [] });
    expect(again.moves).toEqual([]);
  });

  it('retire moves a listed roadmap file to archive/legacy/', async () => {
    await applyArchiveTree(dir, { apply: true, layout: true, retire: ['MILESTONES.md'], closedUnits: [] });
    expect(existsSync(join(dir, P, 'archive/legacy/MILESTONES.md'))).toBe(true);
    expect(existsSync(join(dir, P, 'ROADMAP.md'))).toBe(true);
  });
});

describe('projectFolderName — the key comes from the project, not from a second checkout', () => {
  let root;
  const sh = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });
  beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'key-name-')); });
  afterEach(async () => rm(root, { recursive: true, force: true }));

  it("uses origin's repository name", async () => {
    const repo = join(root, 'app-bughunt');
    await mkdir(repo);
    sh(repo, 'init', '-q');
    sh(repo, 'remote', 'add', 'origin', 'git@github.com:someone/orchard.git');
    expect(projectFolderName(repo)).toBe('orchard');
  });

  it("uses the main checkout's folder for a worktree with no origin", async () => {
    const main = join(root, 'orchard');
    await mkdir(main);
    sh(main, 'init', '-q');
    sh(main, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'x');
    sh(main, 'worktree', 'add', '-q', join(root, 'orchard-signal-test'));
    expect(projectFolderName(join(root, 'orchard-signal-test'))).toBe('orchard');
  });

  it('falls back to the folder name outside git', async () => {
    const plain = join(root, 'orchard');
    await mkdir(plain);
    expect(projectFolderName(plain)).toBe('orchard');
  });
});
