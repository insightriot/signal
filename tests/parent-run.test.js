// M6.E17 S1 — parent-run.js proves a new test fails on the base commit.
//
// Why (D-M6E17-3): M6.E16 pass 2 shipped four hollow tests that a "fails with
// the fix removed" run would have caught a day earlier, and M6.E14's AC7.2
// proved nothing on its own until someone ran it on the parent by hand. The
// tool makes that run a command: copy the named tests onto a worktree of the
// base commit, run them there, and say per file whether they FAILED there
// (proof), PASSED there (no proof — hollow), or COULD NOT RUN there (no proof
// either way, and never reported as proof).
//
// Fixtures are throwaway git repos. The repo's own node_modules is linked into
// each so the main checkout's vitest can run there; the test files import only
// `vitest` and the fixture's own modules.
//
// Proof-of-fail: every test here fails before S1 — the module does not exist.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, realpathSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { runOnBase, formatParentRun, PARENT_RUN_SUMMARY_RE } from '../plugin/tools/lib/parent-run.js';

const REPO_ROOT = resolve(import.meta.dirname, '..');
const TOOL = join(REPO_ROOT, 'plugin', 'tools', 'lib', 'parent-run.js');
const SLOW = 120_000;

const git = (cwd, args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' },
  }).trim();

const put = (dir, rel, text) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true });
  writeFileSync(join(dir, rel), text, 'utf-8');
};

// The child vitest must not think it is a worker of this one.
const childEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('VITEST')));

let dir;
let base;

beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), 'sig-parent-run-test-')));
  git(dir, ['init', '-q', '-b', 'main']);
  // Base commit: `add` has the bug; `fresh.js` does not exist yet.
  put(dir, 'src/add.js', 'export const add = (a, b) => a - b;\n');
  put(dir, 'package.json', '{ "type": "module" }\n');
  put(dir, '.gitignore', 'node_modules\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'base']);
  base = git(dir, ['rev-parse', 'HEAD']);
  // The fix, plus a new module, committed on top.
  put(dir, 'src/add.js', 'export const add = (a, b) => a + b;\n');
  put(dir, 'src/fresh.js', 'export const fresh = () => 1;\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'fix']);
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');

  // New tests, in the working tree only (absent on the base by definition).
  put(dir, 'tests/real.test.js',
    "import { it, expect } from 'vitest';\nimport { add } from '../src/add.js';\n" +
    "it('adds', () => { expect(add(2, 3)).toBe(5); });\n");
  put(dir, 'tests/hollow.test.js',
    "import { it, expect } from 'vitest';\nimport { add } from '../src/add.js';\n" +
    "it('is a function', () => { expect(typeof add).toBe('function'); });\n");
  put(dir, 'tests/imports-new.test.js',
    "import { it, expect } from 'vitest';\nimport { fresh } from '../src/fresh.js';\n" +
    "it('fresh', () => { expect(fresh()).toBe(1); });\n");
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const worktreeCount = () => git(dir, ['worktree', 'list', '--porcelain']).split('\n').filter((l) => l.startsWith('worktree ')).length;

describe('AC3.1 — a new test that fails on the base is proof', () => {
  it('reports failed, names the failing test, and leaves nothing behind', async () => {
    let seen;
    const r = await runOnBase(dir, { base, tests: ['tests/real.test.js'] }, { onWorktree: (wt) => { seen = wt; } });
    expect(r.base).toBe(base);
    expect(r.results).toHaveLength(1);
    expect(r.results[0]).toMatchObject({ file: 'tests/real.test.js', outcome: 'failed' });
    expect(r.results[0].failed.join(' ')).toMatch(/adds/);
    expect(seen).toBeTruthy();
    expect(existsSync(seen)).toBe(false);
    expect(worktreeCount()).toBe(1);
  }, SLOW);

  it('formats one summary line and one line per file', async () => {
    const r = await runOnBase(dir, { base, tests: ['tests/real.test.js'] });
    const lines = formatParentRun(r).split('\n');
    expect(lines[0]).toMatch(/^parent-run [0-9a-f]{7,}: 1 of 1 failed on the base/);
    expect(lines[0]).toMatch(PARENT_RUN_SUMMARY_RE);
    expect(lines[1]).toMatch(/failed\s+tests\/real\.test\.js/);
  }, SLOW);
});

describe('AC3.2 — "passed" and "could not run" are never proof', () => {
  it('a hollow test that passes on the base → passed', async () => {
    const r = await runOnBase(dir, { base, tests: ['tests/hollow.test.js'] });
    expect(r.results[0]).toMatchObject({ outcome: 'passed' });
  }, SLOW);

  it('a test importing a module absent on the base → could-not-run, with the reason', async () => {
    const r = await runOnBase(dir, { base, tests: ['tests/imports-new.test.js'] });
    expect(r.results[0].outcome).toBe('could-not-run');
    expect(r.results[0].reason).toMatch(/fresh/);
  }, SLOW);

  it('a base that does not resolve → could-not-run for every file, never failed', async () => {
    const r = await runOnBase(dir, { base: 'no-such-ref', tests: ['tests/real.test.js', 'tests/hollow.test.js'] });
    expect(r.results.map((x) => x.outcome)).toEqual(['could-not-run', 'could-not-run']);
    expect(r.results[0].reason).toMatch(/no-such-ref/);
    expect(worktreeCount()).toBe(1);
  });

  it('a base that looks like an option is refused', async () => {
    const r = await runOnBase(dir, { base: '--output=x', tests: ['tests/real.test.js'] });
    expect(r.results[0].outcome).toBe('could-not-run');
  });

  it('a test path outside the project, or missing from the working tree → could-not-run', async () => {
    const r = await runOnBase(dir, { base, tests: ['../elsewhere.test.js', 'tests/missing.test.js'] });
    expect(r.results.map((x) => x.outcome)).toEqual(['could-not-run', 'could-not-run']);
  });

  it('a mixed run reports each file on its own', async () => {
    const r = await runOnBase(dir, { base, tests: ['tests/real.test.js', 'tests/hollow.test.js'] });
    expect(r.results.map((x) => [x.file, x.outcome])).toEqual([
      ['tests/real.test.js', 'failed'],
      ['tests/hollow.test.js', 'passed'],
    ]);
    expect(formatParentRun(r).split('\n')[0]).toMatch(/1 of 2 failed on the base, 1 passed$/);
    expect(PARENT_RUN_SUMMARY_RE.exec(formatParentRun(r).split('\n')[0]).slice(2, 5)).toEqual(['1', '2', '1']);
  }, SLOW);

  it('cleans up after a thrown error, and the error still reaches the caller', async () => {
    let seen;
    await expect(
      runOnBase(dir, { base, tests: ['tests/real.test.js'] }, {
        onWorktree: (wt) => {
          // Fired after the node_modules link and the copied tests exist, so
          // this proves the cleanup of all three, not just the empty worktree.
          seen = wt;
          expect(existsSync(join(wt, 'node_modules'))).toBe(true);
          expect(existsSync(join(wt, 'tests', 'real.test.js'))).toBe(true);
          throw new Error('boom mid-run');
        },
      })
    ).rejects.toThrow(/boom mid-run/);
    expect(seen).toBeTruthy();
    expect(existsSync(seen)).toBe(false);
    expect(worktreeCount()).toBe(1);
  }, SLOW);
});

describe('AC3.1 — the command line', () => {
  const run = (args) => spawnSync(process.execPath, [TOOL, ...args], { cwd: dir, encoding: 'utf-8', env: childEnv() });

  it('--base with a failing test → exit 0 and the summary on stdout', () => {
    const r = run(['--base', base, 'tests/real.test.js']);
    expect(r.stdout).toMatch(/1 of 1 failed on the base/);
    expect(r.status).toBe(0);
  }, SLOW);

  it('--of <commit> means that commit\'s parent; a hollow test → exit 1', () => {
    const r = run(['--of', 'HEAD', 'tests/hollow.test.js']);
    expect(r.stdout).toMatch(/passed/);
    expect(r.status).toBe(1);
  }, SLOW);

  it('an unknown flag → usage and exit 2', () => {
    const r = run(['--bsae', base, 'tests/real.test.js']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/usage/i);
  });

  it('both --base and --of, or neither, or no test files → exit 2', () => {
    expect(run(['--base', base, '--of', 'HEAD', 'tests/real.test.js']).status).toBe(2);
    expect(run(['tests/real.test.js']).status).toBe(2);
    expect(run(['--base', base]).status).toBe(2);
  });
});
