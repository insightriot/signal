// task-brief.js builds the brief EXECUTE hands a fresh executor agent for one task (Step 2).

import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildTaskBrief } from '../plugin/tools/lib/task-brief.js';

const profile = (tdd) => `---
tier: FEATURE
schema_version: 1
calibration:
  scope: feature
  stakes: minor
  novelty: rare
  reversibility: trivial
  horizon: days
phases_skipped: []
rigor_overrides:
  tdd_required: ${tdd}
  security_audit: basic
  performance_pass: false
  simplification_pass: false
  nyquist_enforcement: basic
  plan_validation_dims: core
  research_parallelism: 1
  gate_strictness: light
  attention: checkpointed
  context_rot_reread: true
  review_depth: quality-only
metadata:
  created_at: 2026-11-02T00:00:00Z
  created_by: sig:calibrate
  escalation_history: []
---
`;

const PLAN = `# M1.E1 — plan

## Tasks

### S1 — the parser
Goal of the slice: parse things.

#### S1.t1 — tokens
**Depends on:** none
Acceptance: tokens split on spaces.

#### S1.t2 — tree
**Depends on:** S1.t1
Acceptance: a tree from tokens.

### S2 — printer
**Depends on:** S1
Acceptance: prints the tree.
`;

function project({ tdd = true, requirements = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'task-brief-'));
  const epic = join(dir, '.planning', 'epics', 'M1.E1');
  mkdirSync(epic, { recursive: true });
  writeFileSync(join(dir, '.planning', 'PROFILE.md'), profile(tdd));
  writeFileSync(join(dir, '.planning', 'STATE.md'), '---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: M1.E1\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\n---\n');
  writeFileSync(join(epic, 'M1.E1-PLAN.md'), PLAN);
  if (requirements) writeFileSync(join(epic, 'M1.E1-REQUIREMENTS.md'), '# reqs\n');
  return dir;
}

describe('buildTaskBrief', () => {
  it('copies the task and its slice from the plan, with what it depends on', async () => {
    const r = await buildTaskBrief(project(), { taskId: 'S1.t2', start: 'abc1234' });
    expect(r.ok).toBe(true);
    expect(r.task).toMatchObject({ id: 'S1.t2', wave: 2, dependsOn: ['S1.t1'] });
    expect(r.brief).toContain('It starts from commit abc1234. Tasks it depends on are already built: S1.t1.');
    expect(r.brief).toContain('### S1 — the parser\nGoal of the slice: parse things.');
    expect(r.brief).toContain('### S1.t2 — tree');
    expect(r.brief).toContain('Acceptance: a tree from tokens.');
    expect(r.brief).not.toContain('Acceptance: tokens split on spaces.');
  });

  it('names the Epic\'s files by path, not by content, and only those that exist', async () => {
    const r = await buildTaskBrief(project(), { taskId: 'S2', start: 'abc1234' });
    expect(r.files).toEqual({
      plan: '.planning/epics/M1.E1/M1.E1-PLAN.md',
      requirements: '.planning/epics/M1.E1/M1.E1-REQUIREMENTS.md',
      validation: null,
      research: null,
    });
    expect(r.brief).toContain('`.planning/epics/M1.E1/M1.E1-REQUIREMENTS.md`');
    expect(r.brief).not.toMatch(/test map|Research,/);
  });

  it('asks for tests first only when the project requires it', async () => {
    const strict = await buildTaskBrief(project({ tdd: true }), { taskId: 'S2', start: 'x' });
    const loose = await buildTaskBrief(project({ tdd: false }), { taskId: 'S2', start: 'x' });
    expect(strict.brief).toContain('Write the tests first');
    expect(loose.brief).toContain('tests first is not required');
  });

  it('tells the agent to make one commit and leave .planning/ alone', async () => {
    const r = await buildTaskBrief(project(), { taskId: 'S2', start: 'x' });
    expect(r.brief).toContain('Make exactly one commit');
    expect(r.brief).toContain('Do not write anything under `.planning/`');
  });

  it('points the agent at the build skills, by paths that exist', async () => {
    const r = await buildTaskBrief(project(), { taskId: 'S2', start: 'x' });
    const paths = [...r.brief.matchAll(/`([^`]+\/SKILL\.md)`/g)].map((m) => m[1]);
    expect(paths.length).toBe(5);
    for (const p of paths) expect(existsSync(p), p).toBe(true);
  });

  it('refuses an unknown task, a group, or a missing start commit', async () => {
    const dir = project();
    expect(await buildTaskBrief(dir, { taskId: 'S9', start: 'x' })).toEqual({ ok: false, problem: 'S9 is not a task in the plan.' });
    expect((await buildTaskBrief(dir, { taskId: 'S1', start: 'x' })).ok).toBe(false);
    expect((await buildTaskBrief(dir, { taskId: 'S2' })).problem).toMatch(/No start commit/);
  });
});
