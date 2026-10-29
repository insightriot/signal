// execute.md as numbered steps (course correction Step 1, 2026-10-29).
//
// The command is followed by an agent reading it, so a call it names that no
// module exports, or a step order that records a task after it is closed, is a
// defect in the product. These checks read the command file against the code.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
