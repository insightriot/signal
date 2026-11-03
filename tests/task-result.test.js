// task-result.js reads what an executor agent did from git, not from its report (Step 2).

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkTaskResult, formatTaskResult } from '../plugin/tools/lib/task-result.js';

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'task-result-'));
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
  git('init', '-q');
  mkdirSync(join(dir, '.planning'));
  writeFileSync(join(dir, '.planning', 'STATE.md'), 'state\n');
  writeFileSync(join(dir, 'a.js'), 'a\n');
  git('add', '-A');
  git('commit', '-qm', 'start');
  const write = (f, s) => { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), s); };
  const commit = (msg, ...f) => { git('add', ...f); git('commit', '-qm', msg); return git('rev-parse', 'HEAD'); };
  return { dir, git, write, commit, start: git('rev-parse', 'HEAD') };
}

const check = (r, start) => checkTaskResult(r.dir, { start, proof: false });

describe('checkTaskResult', () => {
  it('done: one commit, a clean tree, nothing under .planning/', async () => {
    const r = repo();
    r.write('b.js', 'b\n');
    r.write('test/b.test.js', 't\n');
    const sha = r.commit('task', 'b.js', 'test/b.test.js');
    const res = await check(r, r.start);
    expect(res).toMatchObject({ verdict: 'done', commit: sha, problems: [], tests: ['test/b.test.js'] });
    expect(formatTaskResult(res)).toMatch(/^Task result: done \(commit [0-9a-f]{7}\)/);
  });

  it('not-done: no new commit', async () => {
    const r = repo();
    expect(await check(r, r.start)).toMatchObject({ verdict: 'not-done', commit: null, problems: [] });
  });

  it('check: more than one commit', async () => {
    const r = repo();
    r.write('b.js', 'b\n'); r.commit('one', 'b.js');
    r.write('c.js', 'c\n'); r.commit('two', 'c.js');
    const res = await check(r, r.start);
    expect(res.verdict).toBe('check');
    expect(res.commit).toBeNull();
    expect(res.problems).toEqual(['2 commits since the start; a task is one commit.']);
  });

  it('check: uncommitted changes left behind, even with no commit', async () => {
    const r = repo();
    r.write('a.js', 'changed\n');
    const res = await check(r, r.start);
    expect(res.verdict).toBe('check');
    expect(res.problems[0]).toMatch(/uncommitted changes: a\.js/);
  });

  it('done: the session\'s own uncommitted records under .planning/ are not the task\'s', async () => {
    const r = repo();
    r.write('.planning/STATE.md', 'current task: S1\n');
    r.write('.planning/epics/M1.E1/M1.E1-PROGRESS.md', 'progress\n');
    r.write('b.js', 'b\n'); r.commit('task', 'b.js');
    expect(await check(r, r.start)).toMatchObject({ verdict: 'done', problems: [] });
  });

  it('check: the task changed .planning/', async () => {
    const r = repo();
    r.write('.planning/STATE.md', 'edited\n'); r.write('b.js', 'b\n');
    r.commit('task', '.planning/STATE.md', 'b.js');
    const res = await check(r, r.start);
    expect(res.verdict).toBe('check');
    expect(res.problems).toEqual(['The task changed files under .planning/: .planning/STATE.md.']);
  });

  it('check: history rewritten so HEAD no longer descends from the start', async () => {
    const r = repo();
    r.write('b.js', 'b\n');
    const old = r.commit('task', 'b.js');
    r.git('reset', '-q', '--hard', r.start);
    r.git('commit', '-q', '--amend', '-m', 'rewritten');
    const res = await check(r, old);
    expect(res.verdict).toBe('check');
    expect(res.problems[0]).toMatch(/does not descend from the start commit/);
  });

  it('check: a start that is not a commit', async () => {
    const r = repo();
    for (const bad of ['nope', '--all', '']) {
      expect((await check(r, bad)).verdict, bad).toBe('check');
    }
  });

  it('says plainly when a task changed no test file', async () => {
    const r = repo();
    r.write('b.js', 'b\n'); r.commit('task', 'b.js');
    expect((await check(r, r.start)).parentRun).toBe('no new or changed test file: a stated gap');
  });
});
