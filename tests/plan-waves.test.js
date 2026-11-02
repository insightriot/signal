// Waves are computed from each task's "Depends on:" line (Step 2 of the course correction).

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planWaves, formatWaves } from '../plugin/tools/lib/plan-waves.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const plan = (tasks) => `# Plan\n\nGoal: a thing.\n\n## Tasks\n\n${tasks}\n\n## Risks\n\n### Not a task\n`;
const ids = (r) => r.waves.map((w) => w.tasks.map((t) => t.id));

describe('planWaves — waves', () => {
  it('layers tasks by their dependencies', () => {
    const r = planWaves(plan([
      '### S1 — first\n**Depends on:** none',
      '### S2 — second\n**Depends on:** S1',
      '### S3 — also after first\nDepends on: S1',
      '### S4 — last\n- **Depends on:** S2, S3',
    ].join('\n\n')));
    expect(r.ok).toBe(true);
    expect(ids(r)).toEqual([['S1'], ['S2', 'S3'], ['S4']]);
  });

  it('returns each task with its heading and body, ready to hand to an executor', () => {
    const r = planWaves(plan('### S1 — build it\n**Depends on:** none\nAcceptance: it works.'));
    expect(r.waves[0].tasks[0]).toMatchObject({ id: 'S1', heading: 'S1 — build it', dependsOn: [] });
    expect(r.waves[0].tasks[0].body).toContain('Acceptance: it works.');
  });

  it('treats a slice with tasks under it as a group: its line applies to its tasks, and a dependency on it means all of them', () => {
    const r = planWaves(plan([
      '### S1 — slice one',
      '#### S1.t1 — a\n**Depends on:** none',
      '#### S1.t2 — b\n**Depends on:** S1.t1',
      '### S2 — slice two\n**Depends on:** S1',
      '#### S2.t1 — c\n**Depends on:** none',
    ].join('\n\n')));
    expect(r.ok).toBe(true);
    expect(ids(r)).toEqual([['S1.t1'], ['S1.t2'], ['S2.t1']]);
    expect(r.waves[2].tasks[0].dependsOn.sort()).toEqual(['S1.t1', 'S1.t2']);
  });

  it('ignores headings outside the Tasks section and dependency lines inside code fences', () => {
    const r = planWaves(plan('### S1 — a\n**Depends on:** none\n```\nDepends on: S9\n```'));
    expect(r.ok).toBe(true);
    expect(ids(r)).toEqual([['S1']]);
  });

  it('accepts a "## Slices" section', () => {
    expect(planWaves('## Slices\n\n### S1 — a\nDepends on: none\n').ok).toBe(true);
  });
});

describe('planWaves — refuses rather than guesses', () => {
  const refuse = (content, pattern) => {
    const r = planWaves(content);
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(pattern);
  };

  it('a plan with no Tasks section', () => refuse('# Plan\n\n### S1 — a\nDepends on: none\n', /no "## Tasks" section/));
  it('a Tasks section with no tasks', () => refuse('## Tasks\n\nNothing yet.\n', /has no tasks/));
  it('a task with no Depends on line', () => refuse(plan('### S1 — a\nAcceptance: x'), /S1 has no "Depends on:" line/));
  it('a heading with no task ID', () => refuse(plan('### Build the thing\nDepends on: none'), /does not start with a task ID/));
  it('a duplicate ID', () => refuse(plan('### S1 — a\nDepends on: none\n\n### S1 — b\nDepends on: none'), /S1 is used by more than one task/));
  it('two Depends on lines in one task', () => refuse(plan('### S1 — a\nDepends on: none\nDepends on: none'), /more than one "Depends on:" line/));
  it('a dependency on an ID not in the plan', () => refuse(plan('### S1 — a\nDepends on: S7'), /S1 depends on S7, which is not a task/));
  it('a task that depends on itself', () => refuse(plan('### S1 — a\nDepends on: S1'), /S1 depends on itself/));
  it('a task that depends on its own group', () => refuse(plan('### S1 — g\n\n#### S1.t1 — a\nDepends on: S1'), /S1.t1 depends on itself \(S1\)/));
  it('a loop', () => refuse(plan([
    '### S1 — a\nDepends on: none',
    '### S2 — b\nDepends on: S3',
    '### S3 — c\nDepends on: S2',
  ].join('\n\n')), /wait on each other in a loop: S2, S3/));
  it('non-string input', () => expect(planWaves(undefined).ok).toBe(false));

  // Every plan written before this format states dependencies in free text. It must be refused,
  // naming each task, and never read as "no dependencies, everything in wave 1".
  it('an old-style plan with free-text dependencies', () => {
    const old = [
      '# Plan', '', '## What this Epic does for the first time', '', 'S1 runs first.', '',
      '## Slices', '',
      '### S1 — the engine · wave 1 · L', 'Build the engine. Dependencies: none.', '',
      '### S2 — replay · wave 2 · M', '*Deps:* S1 (needs the engine).', '',
      '### S3 — the panel · wave 3 · S', 'Order: S1 → S2 → S3.', '',
      '## Dependencies and waves', '', 'S1 → {S2 ∥ S3}', '',
    ].join('\n');
    const r = planWaves(old);
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([
      'S1 has no "Depends on:" line. Write "Depends on: none" if it waits for nothing.',
      'S2 has no "Depends on:" line. Write "Depends on: none" if it waits for nothing.',
      'S3 has no "Depends on:" line. Write "Depends on: none" if it waits for nothing.',
    ]);
  });
});

describe('plan-waves CLI', () => {
  const cli = join(ROOT, 'plugin/tools/lib/plan-waves.js');
  const write = (text) => {
    const f = join(mkdtempSync(join(tmpdir(), 'plan-waves-')), 'PLAN.md');
    writeFileSync(f, text);
    return f;
  };

  it('prints one line per wave and exits 0', () => {
    const out = execFileSync('node', [cli, write(plan('### S1 — a\nDepends on: none\n\n### S2 — b\nDepends on: S1'))], { encoding: 'utf-8' });
    expect(out.trim()).toBe('Wave 1: S1\nWave 2: S2');
  });

  it('prints the problems and exits 1 on a refused plan', () => {
    let err;
    try { execFileSync('node', [cli, write(plan('### S1 — a'))], { encoding: 'utf-8' }); } catch (e) { err = e; }
    expect(err.status).toBe(1);
    expect(err.stdout).toContain('S1 has no "Depends on:" line');
  });

  it('prints JSON with --json', () => {
    const out = execFileSync('node', [cli, write(plan('### S1 — a\nDepends on: none')), '--json'], { encoding: 'utf-8' });
    expect(JSON.parse(out).waves[0].tasks[0].id).toBe('S1');
  });

  it('formatWaves lists problems', () => {
    expect(formatWaves({ ok: false, problems: ['x'] })).toBe('The plan cannot be split into waves:\n- x');
  });
});
