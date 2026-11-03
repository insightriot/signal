// check-commit-test-run.js: during EXECUTE a `git commit` needs a passing test run of the files as
// they are now (loop piece 4). Driven as a process, with the event Claude Code sends on stdin.

import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runTests } from '../plugin/tools/lib/test-run.js';

const HOOK = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugin', 'hooks', 'check-commit-test-run.js');

function project({ phase = 'EXECUTE', pkg = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'commit-gate-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir });
  git('init', '-q');
  mkdirSync(join(dir, '.planning'));
  writeFileSync(join(dir, '.planning', 'STATE.md'), `---\nschema_version: 1\nphase: ${phase}\n---\n`);
  writeFileSync(join(dir, 'a.js'), 'a\n');
  if (pkg) writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node -e 0' } }));
  git('add', '-A');
  git('commit', '-qm', 'start');
  return { dir, git };
}

function hook(cwd, command = 'git add -A && git commit -m "task"', extra = {}) {
  const r = spawnSync('node', [HOOK], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd, ...extra }), encoding: 'utf8' });
  return { status: r.status, stderr: r.stderr };
}

describe('check-commit-test-run.js', () => {
  it('blocks a code commit with no test record, and says what to run', () => {
    const { dir } = project();
    writeFileSync(join(dir, 'a.js'), 'changed\n');
    const r = hook(dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Signal blocked this commit/);
    expect(r.stderr).toMatch(/No test record/);
    expect(r.stderr).toMatch(/test-run\.js'/);
  });

  it('blocks after a failed run, and after a change made since a passing one', async () => {
    const { dir } = project();
    writeFileSync(join(dir, 'a.js'), 'changed\n');
    await runTests(dir, { command: 'false' });
    expect(hook(dir).stderr).toMatch(/The last test run failed/);
    await runTests(dir, { command: 'true' });
    writeFileSync(join(dir, 'b.js'), 'after the run\n');
    const r = hook(dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/changed since the tests last ran/);
  });

  it('allows a commit once the tests passed on the files as they are', async () => {
    const { dir } = project();
    writeFileSync(join(dir, 'a.js'), 'changed\n');
    await runTests(dir, { command: 'true' });
    expect(hook(dir)).toEqual({ status: 0, stderr: '' });
  });

  it('allows a commit of .planning/ alone: the session recording progress', () => {
    const { dir } = project();
    writeFileSync(join(dir, '.planning', 'PROGRESS.md'), 'task 1 done\n');
    expect(hook(dir).status).toBe(0);
  });

  it('only acts at EXECUTE, and only on git commit', () => {
    const { dir } = project({ phase: 'VERIFY' });
    writeFileSync(join(dir, 'a.js'), 'changed\n');
    expect(hook(dir).status).toBe(0);
    const p = project();
    writeFileSync(join(p.dir, 'a.js'), 'changed\n');
    for (const cmd of ['git status', 'git log --grep commit', 'echo git commit-tree', 'npm test']) {
      expect(hook(p.dir, cmd).status, cmd).toBe(0);
    }
    for (const cmd of ['git commit -m x', 'cd . && git -c core.x=y commit --amend', 'git --no-pager commit']) {
      expect(hook(p.dir, cmd).status, cmd).toBe(2);
    }
  });

  it('a project with no test command and no record: warns, does not block', () => {
    const { dir } = project({ pkg: false });
    writeFileSync(join(dir, 'a.js'), 'changed\n');
    const r = hook(dir);
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/no test command was found/);
  });

  it('reads a STATE.md with Windows line endings', () => {
    const { dir } = project();
    writeFileSync(join(dir, '.planning', 'STATE.md'), '---\r\nschema_version: 1\r\nphase: EXECUTE\r\n---\r\n');
    writeFileSync(join(dir, 'a.js'), 'changed\n');
    expect(hook(dir).status).toBe(2);
  });

  it('finds a Signal project in a subfolder of the repository, from the project or below it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'commit-gate-mono-'));
    execFileSync('git', ['init', '-q'], { cwd: dir });
    const pkg = join(dir, 'packages', 'app');
    mkdirSync(join(pkg, '.planning'), { recursive: true });
    mkdirSync(join(pkg, 'src'));
    writeFileSync(join(pkg, '.planning', 'STATE.md'), '---\nphase: EXECUTE\n---\n');
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ scripts: { test: 'node -e 0' } }));
    writeFileSync(join(pkg, 'src', 'a.js'), 'a\n');
    expect(hook(pkg).stderr).toMatch(/No test record/);
    expect(hook(join(pkg, 'src')).status).toBe(2);
    // The command the message gives, run from below the project, writes the record the hook reads.
    const told = hook(join(pkg, 'src')).stderr.match(/Run (cd .+? && node .+?test-run\.js')/)[1];
    execFileSync('sh', ['-c', told], { cwd: join(pkg, 'src') });
    expect(hook(join(pkg, 'src')).status).toBe(0);
  });

  it('git -C <dir> commit checks the project in <dir>, not the shell\'s', () => {
    const { dir } = project();
    writeFileSync(join(dir, 'a.js'), 'changed\n');
    const elsewhere = mkdtempSync(join(tmpdir(), 'no-signal-'));
    expect(hook(elsewhere, `git -C "${dir}" commit -m x`).status).toBe(2);
    expect(hook(dir, `git -C "${elsewhere}" commit -m x`).status).toBe(0);
  });

  it('follows cd X && before the commit, and quoted folders with spaces', () => {
    const parent = mkdtempSync(join(tmpdir(), 'commit-gate-cd-'));
    const dir = join(parent, 'my project');
    mkdirSync(join(dir, '.planning'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: dir });
    writeFileSync(join(dir, '.planning', 'STATE.md'), '---\nphase: EXECUTE\n---\n');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'node -e 0' } }));
    const elsewhere = mkdtempSync(join(tmpdir(), 'no-signal-'));
    expect(hook(parent, 'cd "my project" && git add -A && git commit -m x').status).toBe(2);
    expect(hook(elsewhere, `git -C "${dir}" commit -m x`).status).toBe(2);
    expect(hook(dir, `cd "${elsewhere}" && git commit -m x`).status).toBe(0);
    expect(hook(parent, 'cd "$SOMEWHERE" && git commit -m x').status).toBe(0);
  });

  it('lets through what it cannot read: other tools, bad input, no Signal project', () => {
    const { dir } = project();
    writeFileSync(join(dir, 'a.js'), 'changed\n');
    expect(hook(dir, 'git commit', { tool_name: 'Write' }).status).toBe(0);
    expect(spawnSync('node', [HOOK], { input: 'not json', encoding: 'utf8' }).status).toBe(0);
    expect(hook(mkdtempSync(join(tmpdir(), 'no-signal-'))).status).toBe(0);
  });
});
