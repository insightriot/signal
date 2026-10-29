// execute.md as numbered steps (course correction Step 1, 2026-10-29).
//
// The command is followed by an agent reading it, so a call it names that no
// module exports, or a step order that records a task after it is closed, is a
// defect in the product. These checks read the command file against the code.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { initState, readState, transitionPhase } from '../plugin/tools/lib/state.js';
import { applyRigorOverrides } from '../plugin/tools/lib/profile.js';

const ROOT = join(import.meta.dirname, '..');
const LIB = join(ROOT, 'plugin', 'tools', 'lib');
const execute = readFileSync(join(ROOT, 'plugin', 'commands', 'execute.md'), 'utf-8');

describe('execute.md names only calls that exist', () => {
  // Every `name(` in a code span, paired with the module the same line names.
  const CALLS = {
    readEffectiveProfile: 'profile.js',
    applyRigorOverrides: 'profile.js',
    checkBranchPosture: 'branch-guard.js',
    formatBranchHalt: 'branch-guard.js',
    formatBranchLine: 'branch-guard.js',
    formatBranchUnknown: 'branch-guard.js',
    transitionPhase: 'state.js',
    readState: 'state.js',
    setCurrentTask: 'state.js',
    clearCurrentTask: 'state.js',
    markFresh: 'state.js',
    clearOrphansBeforeDispatch: 'execute.js',
    resolveArtifactPath: 'resume.js',
    artifactName: 'resume.js',
  };

  it.each(Object.entries(CALLS))('%s is exported by tools/lib/%s', async (name, file) => {
    expect(execute, `execute.md no longer names ${name}`).toContain(name);
    const mod = await import(join(LIB, file));
    expect(typeof mod[name], `${file} does not export ${name}`).toBe('function');
  });

  it('every call written with parentheses is in the list above', () => {
    const named = [...execute.matchAll(/`(?:await )?([a-zA-Z]+)\(/g)].map((m) => m[1]);
    const unknown = [...new Set(named)].filter((n) => !(n in CALLS));
    expect(unknown).toEqual([]);
  });

  it('the parent-run line uses the flag the tool accepts', async () => {
    expect(execute).toMatch(/tools\/lib\/parent-run\.js" --base <start commit> /);
    const src = readFileSync(join(LIB, 'parent-run.js'), 'utf-8');
    expect(src).toMatch(/usage: node parent-run\.js \(--base <commit>/);
  });
});

describe('execute.md step order', () => {
  const at = (s) => {
    const i = execute.indexOf(s);
    expect(i, `missing: ${s}`).toBeGreaterThan(-1);
    return i;
  };

  it('a task is recorded before its work, closed after its commit, and its parent run follows the commit', () => {
    const record = at('`setCurrentTask(baseDir');
    const start = at('git rev-parse HEAD');
    const commit = at('Commit the task on its own');
    const parent = at('parent-run.js" --base');
    const close = at('`clearCurrentTask(baseDir, { id, status: \'done\', commit })`');
    expect(record).toBeLessThan(start);
    expect(start).toBeLessThan(commit);
    expect(commit).toBeLessThan(parent);
    expect(parent).toBeLessThan(close);
  });

  it('says plainly that it dispatches no executor agent, so no reader expects one', () => {
    expect(execute).toMatch(/this command dispatches no executor agent/);
    expect(execute).not.toMatch(/subagent_type/);
  });

  it('the task records are skipped at SKETCH, and only there', () => {
    expect(execute).toMatch(/\*\*Record it\*\* \(not at SKETCH\)/);
    expect(execute).toMatch(/\*\*Close it\*\* \(not at SKETCH\)/);
  });
});

describe('execute.md fixes from the review of its rewrite', () => {
  it('applyRigorOverrides is named with its config first; given the profile alone it throws', () => {
    // The measured session called applyRigorOverrides(profile), got an error, and
    // had to read the code. plan.md had the same slip.
    const plan = readFileSync(join(ROOT, 'plugin', 'commands', 'plan.md'), 'utf-8');
    for (const text of [execute, plan]) expect(text).toContain('`applyRigorOverrides({}, profile)`');
    const profile = { tier: 'FEATURE', rigor_overrides: { attention: 'attended' } };
    expect(() => applyRigorOverrides(profile)).toThrow();
    expect(applyRigorOverrides({}, profile).gates.confirm_execute).toBe(true);
  });

  it('a resumed run skips the phase-entry call, which would record a false EXECUTE entry', async () => {
    expect(execute).toMatch(/Skip this step if `phase` is already `EXECUTE` \(a resumed run\)\./);
    const base = await mkdtemp(join(tmpdir(), 'sig-execute-resume-'));
    try {
      await initState(base, 'DISCUSS');
      await writeFile(join(base, '.planning', 'REQUIREMENTS.md'), '# r\n');
      await transitionPhase(base, 'PLAN');
      await writeFile(join(base, '.planning', 'PLAN.md'), '# p\n');
      const executes = async () =>
        (await readState(base)).completed_phases.filter((e) => e.startsWith('EXECUTE ')).length;
      await transitionPhase(base, 'EXECUTE');
      expect(await executes()).toBe(0); // EXECUTE is running, not finished
      // What the skip avoids: entering again records EXECUTE as finished.
      await transitionPhase(base, 'EXECUTE');
      expect(await executes()).toBe(1);
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });

  it('a resumed run skips finished tasks and resumes the one in flight', () => {
    expect(execute).toMatch(/skipping any the progress file or `last_completed_task` marks done/);
    expect(execute).toMatch(/still in `current_tasks` was in flight: resume it/);
  });

  it('a task that cannot be finished stops the phase', () => {
    expect(execute).toMatch(/`status: 'aborted'` for a task you cannot finish; then say why in the progress file and stop the\s+phase/);
  });

  it('a task commit holds only its files; the phase commit holds every .planning/ file it changed', () => {
    expect(execute).toMatch(/Commit the task on its own, staging only its files\./);
    expect(execute).toMatch(/Commit every `\.planning\/` file the phase changed \(progress, `STATE\.md`, `INDEX\.md`\)/);
  });

  it('at attended, the finished phase is accepted by the user', () => {
    expect(execute).toMatch(/^- \[ \] User accepts the phase — only when `gates\.confirm_execute` is set \(`attended`\)$/m);
  });

  it('a light tier with no validation file does not send the agent back to the plan for tests', () => {
    expect(execute).toMatch(/a mapped test where there is a validation file/);
  });
});
