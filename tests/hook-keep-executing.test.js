// keep-executing.js: during EXECUTE, an agent that stops with plan tasks still to build is sent back
// to them (loop piece 5). Driven as a process, with the Stop event Claude Code sends on stdin.

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTests } from '../plugin/tools/lib/test-run.js';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks', 'keep-executing.js');

const PLAN = '# Plan\n\n## Tasks\n\n### S1 — first\n**Depends on:** none\n\n### S2 — second\n**Depends on:** S1\n';

function profile(tier, attention) {
  return `---\ntier: ${tier}\nschema_version: 1\n\ncalibration:\n  scope: subsystem\n  stakes: major\n  novelty: rare\n  reversibility: painful\n  horizon: years\n\nphases_skipped: []\n\nrigor_overrides:\n  tdd_required: true\n  security_audit: full\n  performance_pass: true\n  simplification_pass: true\n  nyquist_enforcement: strict\n  plan_validation_dims: all\n  research_parallelism: 4\n  gate_strictness: light\n  context_rot_reread: true\n  review_depth: full\n${attention ? `  attention: ${attention}\n` : ''}\nmetadata:\n  created_at: 2026-11-03T00:00:00Z\n  created_by: sig:calibrate\n  escalation_history: []\n---\n\n# Calibration Summary\n`;
}

function project({ phase = 'EXECUTE', tier = 'FEATURE', attention = 'checkpointed', last = null, plan = PLAN } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'keep-executing-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir });
  git('init', '-q');
  mkdirSync(join(dir, '.planning'));
  const lastTask = last ? `last_completed_task:\n  id: ${last.id}\n  status: ${last.status}\n  commit: null\n  completedAt: 2026-11-03T00:00:00Z\n` : 'last_completed_task: null\n';
  writeFileSync(
    join(dir, '.planning', 'STATE.md'),
    `---\nschema_version: 1\nphase: ${phase}\ncurrent_epic: null\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\n${lastTask}---\n`,
  );
  writeFileSync(join(dir, '.planning', 'PROFILE.md'), profile(tier, attention));
  writeFileSync(join(dir, '.planning', 'PLAN.md'), plan);
  writeFileSync(join(dir, 'a.js'), 'a\n');
  git('add', '-A');
  git('commit', '-qm', 'start');
  return { dir, git };
}

function stop(cwd, { session = randomUUID(), prompt = 'p1', event = 'Stop' } = {}) {
  const r = spawnSync('node', [HOOK], {
    input: JSON.stringify({ hook_event_name: event, session_id: session, prompt_id: prompt, cwd, stop_hook_active: false }),
    encoding: 'utf8',
  });
  return { status: r.status, stderr: r.stderr, message: r.stdout ? JSON.parse(r.stdout).systemMessage : '' };
}

// With no Epic, the progress file is `1-PROGRESS.md` (`artifactName`).
const progress = (dir, text) => writeFileSync(join(dir, '.planning', '1-PROGRESS.md'), text);

describe('keep-executing.js', () => {
  it('sends the agent back when plan tasks are still to build, naming the next one', () => {
    const { dir } = project();
    const r = stop(dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/2 of 2 plan tasks are still to build \(next: S1\)/);
    expect(r.stderr).toMatch(/commands\/execute\.md says/);
    expect(r.stderr).toMatch(/No test run is recorded yet/);
  });

  it('reads done tasks from the progress file and from last_completed_task', () => {
    const a = project();
    progress(a.dir, '## Wave 1\n- [x] S1 — commit abc\n');
    expect(stop(a.dir).stderr).toMatch(/1 of 2 .*\(next: S2\)/);
    progress(a.dir, '- [x] S1 — commit abc\n- [x] `S2` — commit def\n');
    expect(stop(a.dir)).toEqual({ status: 0, stderr: '', message: '' });
    const b = project({ last: { id: 'S1', status: 'done' } });
    expect(stop(b.dir).stderr).toMatch(/next: S2/);
  });

  it('does not read S1.t1 or an unticked line as S1 done', () => {
    const { dir } = project();
    progress(dir, '- [x] S1.t1 — commit abc\n- [ ] S1 — in progress\n');
    expect(stop(dir).stderr).toMatch(/next: S1\)/);
  });

  it('lets the stop happen outside EXECUTE, at attended, and at SKETCH', () => {
    for (const opts of [{ phase: 'VERIFY' }, { attention: 'attended' }, { tier: 'SKETCH' }]) {
      expect(stop(project(opts).dir).status, JSON.stringify(opts)).toBe(0);
    }
    // With no attention key, light gates read as checkpointed (`attentionFor`).
    for (const attention of ['unattended', null]) expect(stop(project({ attention }).dir).status, attention).toBe(2);
  });

  it('lets the stop happen when the last test run failed, or the last task was closed aborted', async () => {
    const a = project();
    await runTests(a.dir, { command: 'false' });
    expect(stop(a.dir).status).toBe(0);
    await runTests(a.dir, { command: 'true' });
    const r = stop(a.dir);
    expect(r.status).toBe(2);
    expect(r.stderr).not.toMatch(/No test run/);
    expect(stop(project({ last: { id: 'S1', status: 'aborted' } }).dir).status).toBe(0);
  });

  it('a second stop with nothing built is let go and says why; a new commit earns another push', () => {
    const { dir, git } = project();
    const session = randomUUID();
    expect(stop(dir, { session }).status).toBe(2);
    const again = stop(dir, { session });
    expect(again.status).toBe(0);
    expect(again.message).toMatch(/Nothing was built since Signal last sent the agent back/);
    writeFileSync(join(dir, 'a.js'), 'S1 built\n');
    git('commit', '-qam', 'S1');
    expect(stop(dir, { session }).status).toBe(2);
  });

  it('stops pushing at the limit for its attention, and starts counting again when the user writes', () => {
    const { dir, git } = project();
    const session = randomUUID();
    for (let i = 1; i <= 5; i++) {
      expect(stop(dir, { session }).status, `push ${i}`).toBe(2);
      writeFileSync(join(dir, 'a.js'), `change ${i}\n`);
      git('commit', '-qam', `c${i}`);
    }
    const out = stop(dir, { session });
    expect(out.status).toBe(0);
    expect(out.message).toMatch(/sent back 5 times, the limit at `checkpointed`/);
    expect(stop(dir, { session, prompt: 'p2' }).status).toBe(2);
  });

  it('lets the stop happen on anything it cannot read, and ignores other events', () => {
    const { dir } = project({ plan: '# Plan\n\nno tasks section\n' });
    expect(stop(dir).status).toBe(0);
    const p = project();
    expect(stop(p.dir, { event: 'SubagentStop' }).status).toBe(0);
    expect(spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' }).status).toBe(0);
    expect(spawnSync('node', [HOOK], { input: JSON.stringify({ hook_event_name: 'Stop', cwd: p.dir }), encoding: 'utf8' }).status).toBe(0);
    writeFileSync(join(p.dir, '.planning', 'PROFILE.md'), 'broken');
    expect(stop(p.dir).status).toBe(0);
  });
});
