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
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readdirSync } from 'node:fs';
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
let oldBase;

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
  // A test file that exists on a later base, then gains a real and a hollow test.
  put(dir, 'tests/old.test.js', "import { it, expect } from 'vitest';\nit('old stays', () => { expect(1).toBe(1); });\n");
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'an old test']);
  oldBase = git(dir, ['rev-parse', 'HEAD']);
  put(dir, 'src/add.js', 'export const add = (a, b) => a + b + 0;\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'touch add']);
  put(dir, 'tests/old.test.js',
    "import { it, expect } from 'vitest';\nimport { add } from '../src/add.js';\n" +
    "it('old stays', () => { expect(1).toBe(1); });\n" +
    "it('new real', () => { expect(String(add)).toContain('+ 0'); });\n" +
    "it('new hollow', () => { expect(typeof add).toBe('function'); });\n" +
    // REVIEW pass 2, P2-I2(b): a hollow title that is a substring of an old one.
    "it('stays', () => { expect(typeof add).toBe('function'); });\n");
  symlinkSync(join(REPO_ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');

  // New tests, in the working tree only (absent on the base by definition).
  put(dir, 'tests/real.test.js',
    "import { it, expect } from 'vitest';\nimport { add } from '../src/add.js';\n" +
    "it('adds', () => { expect(add(2, 3)).toBe(5); });\n");
  put(dir, 'tests/hollow.test.js',
    "import { it, expect } from 'vitest';\nimport { add } from '../src/add.js';\n" +
    "it('is a function', () => { expect(typeof add).toBe('function'); });\n");
  // REVIEW I2: a hollow test that reads a fixture new in this change, and a
  // file holding one real and one hollow test.
  put(dir, 'tests/fx.json', '{}\n');
  put(dir, 'tests/reads-new-fixture.test.js',
    "import { it, expect } from 'vitest';\nimport { readFileSync } from 'node:fs';\n" +
    "it('reads the fixture', () => { expect(typeof JSON.parse(readFileSync(new URL('./fx.json', import.meta.url), 'utf-8'))).toBe('object'); });\n");
  put(dir, 'tests/mixed.test.js',
    "import { it, expect } from 'vitest';\nimport { add } from '../src/add.js';\n" +
    "it('real', () => { expect(add(2, 3)).toBe(5); });\nit('hollow', () => { expect(typeof add).toBe('function'); });\n");
  // REVIEW pass 2, P2-I8: failures that name ENOENT but are the code's (or the
  // assertion's), not a fixture left out of the copy.
  put(dir, 'tests/enoent.test.js',
    "import { it, expect } from 'vitest';\nimport { readFileSync } from 'node:fs';\n" +
    "it('reads its config', () => { readFileSync('/sig-parent-run-no-such-dir/config.json'); });\n" +
    "it('names the code', () => { expect('EACCES').toBe('ENOENT'); });\n");
  put(dir, 'tests/slow.test.js',
    "import { it } from 'vitest';\nit('waits', async () => { await new Promise((r) => setTimeout(r, 30000)); }, 60000);\n");
  put(dir, 'tests/imports-new.test.js',
    "import { it, expect } from 'vitest';\nimport { fresh } from '../src/fresh.js';\n" +
    "it('fresh', () => { expect(fresh()).toBe(1); });\n");
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

// This user's private folder for runs (REVIEW pass 2, P2-I1).
const RUNS = () => join(realpathSync(tmpdir()), `sig-parent-runs-${process.getuid()}`);
const runEntries = () => (existsSync(RUNS()) ? readdirSync(RUNS()).filter((n) => n.startsWith('run-')) : []);
const startOf = (pid) => spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf-8' }).stdout.trim();

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
    // S11: the run's folder around the worktree is gone too, not just the worktree.
    expect(existsSync(join(seen, '..'))).toBe(false);
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
    // S11: the run's folder around the worktree is gone too, not just the worktree.
    expect(existsSync(join(seen, '..'))).toBe(false);
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

  // VERIFY pass 1, D3: the main-module check compared import.meta.url with a
  // raw `file://${argv[1]}`, so through a symlinked plugin folder, or a path
  // with a space, main() never ran and the tool exited 0 with no output —
  // and exit 0 is this tool's "proof" answer.
  it('runs through a symlinked folder whose name has a space, and still refuses a bad flag', () => {
    const linkDir = mkdtempSync(join(tmpdir(), 'sig-parent-run-link-'));
    try {
      const link = join(linkDir, 'plug in');
      symlinkSync(join(REPO_ROOT, 'plugin'), link);
      const r = spawnSync(process.execPath, [join(link, 'tools', 'lib', 'parent-run.js'), '--bsae', base, 'tests/real.test.js'],
        { cwd: dir, encoding: 'utf-8', env: childEnv() });
      expect(r.stderr).toMatch(/usage/i);
      expect(r.status).toBe(2);
    } finally {
      rmSync(linkDir, { recursive: true, force: true });
    }
  });

  it('both --base and --of, or neither, or no test files → exit 2', () => {
    expect(run(['--base', base, '--of', 'HEAD', 'tests/real.test.js']).status).toBe(2);
    expect(run(['tests/real.test.js']).status).toBe(2);
    expect(run(['--base', base]).status).toBe(2);
  });
});

// REVIEW pass 1 (M6.E17). Each case below failed on 2a0c56fe.
describe('REVIEW I2 — a failure is proof only when it is not a missing file', () => {
  it('a test that fails only because a new fixture is absent on the base → could-not-run, with the reason', async () => {
    const r = await runOnBase(dir, { base, tests: ['tests/reads-new-fixture.test.js'] });
    expect(r.results[0].outcome).toBe('could-not-run');
    expect(r.results[0].reason).toMatch(/missing file or module/);
    expect(r.results[0].reason).toMatch(/fx\.json|ENOENT/);
  }, SLOW);

  it('a file already on the base lists only its NEW tests that passed there', async () => {
    // tests/old.test.js is committed with the base's history below; its old test passes on the
    // base (expected), and only the new hollow one is named.
    const r = await runOnBase(dir, { base: oldBase, tests: ['tests/old.test.js'] });
    expect(r.results[0].outcome).toBe('failed');
    expect(r.results[0].passed).toEqual(['new hollow', 'stays']);
  }, SLOW);

  it('a file with one real and one hollow test → failed, and the line names the test that passed on the base', async () => {
    const r = await runOnBase(dir, { base, tests: ['tests/mixed.test.js'] });
    expect(r.results[0].outcome).toBe('failed');
    expect(r.results[0].passed).toEqual(['hollow']);
    const line = formatParentRun(r).split('\n')[1];
    expect(line).toMatch(/1 of 2 tests failed/);
    expect(line).toMatch(/new tests that passed on the base: hollow/);
    expect(line).toMatch(/expected -1 to be 5|AssertionError/);
  }, SLOW);
});

// REVIEW pass 2 (M6.E17). Each case below read the wrong answer on 7aadb79a.
describe('REVIEW P2-I2/I3/I8 — a hollow test is never proof, and a real ENOENT is', () => {
  const run = (args) => spawnSync(process.execPath, [TOOL, ...args], { cwd: dir, encoding: 'utf-8', env: childEnv() });

  it('P2-I2(a): a real and a hollow test in one file → the summary counts the hollow one, and exit 1', () => {
    const r = run(['--base', base, 'tests/mixed.test.js']);
    expect(r.stdout.split('\n')[0]).toBe(`parent-run ${base.slice(0, 7)}: 1 of 1 failed on the base, 1 new test passed on the base`);
    expect(PARENT_RUN_SUMMARY_RE.exec(r.stdout.split('\n')[0])?.[6]).toBe('1');
    expect(r.status).toBe(1);
  }, SLOW);

  it('P2-I3: one file that failed and one hollow file → exit 1', () => {
    const r = run(['--base', base, 'tests/real.test.js', 'tests/hollow.test.js']);
    expect(r.stdout).toMatch(/1 of 2 failed on the base, 1 passed/);
    expect(r.status).toBe(1);
  }, SLOW);

  it('P2-I2(b): base titles match exactly, with escapes and template placeholders', async () => {
    const { baseTitles } = await import('../plugin/tools/lib/parent-run.js');
    const known = baseTitles(
      "it('old stays', f);\nit('the tool\\'s summary', f);\nit(`${name} in ${mod}`, f);\ntest.each([1])('case %s', f);\nit(`${x}`, f);\n"
    );
    expect(known('old stays')).toBe(true);
    expect(known('stays')).toBe(false);
    expect(known("the tool's summary")).toBe(true);
    expect(known('recordPass in state.js')).toBe(true);
    expect(known('case 1')).toBe(true);
    // A template with no literal text would match anything: it matches nothing.
    expect(known('anything at all')).toBe(false);
  });

  it('P2-I8: an ENOENT the code raised, or an assertion naming ENOENT, is a real failure', async () => {
    const r = await runOnBase(dir, { base, tests: ['tests/enoent.test.js'] });
    expect(r.results[0].outcome).toBe('failed');
    expect(r.results[0].failed).toHaveLength(2);
  }, SLOW);
});

describe('REVIEW I1 — the copy never writes outside the worktree', () => {
  it('a symlinked directory on the base commit → could-not-run, and nothing is written where it points', async () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'sig-parent-run-link-repo-')));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'sig-parent-run-outside-')));
    try {
      git(repo, ['init', '-q', '-b', 'main']);
      put(repo, 'package.json', '{ "type": "module" }\n');
      put(repo, '.gitignore', 'node_modules\n');
      symlinkSync(outside, join(repo, 'tests'), 'dir');
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-q', '-m', 'base: tests is a link']);
      const linkBase = git(repo, ['rev-parse', 'HEAD']);
      git(repo, ['rm', '-q', 'tests']);
      put(repo, 'tests/x.test.js', "import { it } from 'vitest';\nit('x', () => { throw new Error('x'); });\n");
      git(repo, ['add', '-A']);
      git(repo, ['commit', '-q', '-m', 'tests is a folder']);
      symlinkSync(join(REPO_ROOT, 'node_modules'), join(repo, 'node_modules'), 'dir');

      const r = await runOnBase(repo, { base: linkBase, tests: ['tests/x.test.js'] });
      expect(r.results[0].outcome).toBe('could-not-run');
      expect(r.results[0].reason).toMatch(/outside the worktree/);
      expect(readdirSync(outside)).toEqual([]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  }, SLOW);
});

describe('REVIEW I3 — a killed run leaves nothing behind', () => {
  const temps = runEntries;
  const waitFor = async (cond, ms = 30_000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (cond()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };
  // Running = the worktree is registered AND vitest has started (child.pid written). Waiting for
  // the worktree alone races `git worktree add`: killed mid-add, git removes it itself.
  // Its own folder: the one whose owner.pid is the CLI just started, so other
  // runs' folders in tmpdir cannot affect the check.
  const ownFolder = (pid) =>
    temps().find((n) => {
      try {
        return readFileSync(join(RUNS(), n, 'owner.pid'), 'utf-8').trim().split(' ')[0] === String(pid);
      } catch {
        return false;
      }
    });
  const running = (pid) => () => {
    const n = ownFolder(pid);
    return worktreeCount() === 2 && Boolean(n) && existsSync(join(RUNS(), n, 'child.pid'));
  };
  const start = () => {
    const child = spawn(process.execPath, [TOOL, '--base', base, 'tests/slow.test.js'], { cwd: dir, env: childEnv(), stdio: 'ignore' });
    const exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal })));
    return { child, exited };
  };

  it('SIGTERM mid-run: the worktree and the temp folder are removed before it exits', async () => {
    const { child, exited } = start();
    expect(await waitFor(running(child.pid))).toBe(true);
    const mine = ownFolder(child.pid);
    child.kill('SIGTERM');
    await exited;
    expect(worktreeCount()).toBe(1);
    expect(temps()).not.toContain(mine);
  }, SLOW);

  it('SIGKILL cannot be caught; the next run sweeps what it left', async () => {
    const { child, exited } = start();
    expect(await waitFor(running(child.pid))).toBe(true);
    const mine = ownFolder(child.pid);
    const vitestPid = Number(readFileSync(join(RUNS(), mine, 'child.pid'), 'utf-8').split(' ')[0]);
    child.kill('SIGKILL');
    await exited;
    expect(worktreeCount()).toBe(2);
    expect(() => process.kill(vitestPid, 0), 'the orphaned vitest outlives the SIGKILL').not.toThrow();
    await runOnBase(dir, { base, tests: ['tests/real.test.js'] });
    expect(worktreeCount()).toBe(1);
    // The sweep ended the orphan too; left running, it writes the folder back.
    expect(await waitFor(() => { try { process.kill(vitestPid, 0); return false; } catch { return true; } }, 5000)).toBe(true);
    await new Promise((r) => setTimeout(r, 500));
    expect(temps()).not.toContain(mine);
  }, SLOW);
});

describe('REVIEW I3 — the sweep kills only the vitest it started', () => {
  it('a stale folder whose recorded child pid is now some other process → that process is left alone', async () => {
    mkdirSync(RUNS(), { recursive: true, mode: 0o700 });
    const stale = mkdtempSync(join(RUNS(), 'run-'));
    const bystander = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    const dead = spawnSync(process.execPath, ['-e', 'process.pid'], { encoding: 'utf-8' }).pid;
    try {
      writeFileSync(join(stale, 'owner.pid'), `${dead} gone`);
      // A pid with a start time that is not the bystander's: the pid was reused.
      writeFileSync(join(stale, 'child.pid'), `${bystander.pid} Thu Jan  1 00:00:00 1970`);
      await runOnBase(dir, { base, tests: ['tests/real.test.js'] });
      expect(() => process.kill(bystander.pid, 0)).not.toThrow();
      expect(existsSync(stale)).toBe(false);
    } finally {
      try { process.kill(-bystander.pid, 'SIGKILL'); } catch { /* gone */ }
      rmSync(stale, { recursive: true, force: true });
    }
  }, SLOW);
});

// REVIEW pass 2 (M6.E17), P2-I1: the sweep trusted any folder with its prefix in
// the shared temp folder. A planted one killed an unrelated process group and
// force-removed another worktree through a `wt` link, uncommitted work and all.
describe('REVIEW P2-I1 — the sweep trusts only what this tool made', () => {
  // A planted run: a dead owner, a child record naming a bystander's real pid
  // and start time, and `wt` linking to another worktree with uncommitted work.
  const plant = (folder) => {
    const other = realpathSync(mkdtempSync(join(tmpdir(), 'sig-parent-run-test-other-')));
    rmSync(other, { recursive: true });
    git(dir, ['worktree', 'add', '--detach', other, 'HEAD']);
    writeFileSync(join(other, 'WORK.txt'), 'uncommitted\n');
    const bystander = spawn('sleep', ['60'], { detached: true, stdio: 'ignore' });
    const dead = spawnSync(process.execPath, ['-e', 'process.pid'], { encoding: 'utf-8' }).pid;
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'owner.pid'), `${dead}`);
    writeFileSync(join(folder, 'child.pid'), `${bystander.pid} ${startOf(bystander.pid)}`);
    symlinkSync(other, join(folder, 'wt'), 'dir');
    const undo = () => {
      try { process.kill(-bystander.pid, 'SIGKILL'); } catch { /* gone */ }
      rmSync(folder, { recursive: true, force: true });
      try { git(dir, ['worktree', 'remove', '--force', other]); } catch { /* gone */ }
      rmSync(other, { recursive: true, force: true });
    };
    return { other, bystander, undo };
  };
  const intact = ({ other, bystander }) => {
    expect(() => process.kill(bystander.pid, 0), 'the bystander is alive').not.toThrow();
    expect(existsSync(join(other, 'WORK.txt')), 'the other worktree keeps its work').toBe(true);
  };

  it('a folder planted loose in the temp folder is not swept: nothing is killed or removed', async () => {
    const p = plant(mkdtempSync(join(realpathSync(tmpdir()), 'sig-parent-run-')));
    try {
      await runOnBase(dir, { base, tests: ['tests/real.test.js'] });
      intact(p);
    } finally {
      p.undo();
    }
  }, SLOW);

  it('a planted run inside the runs folder: its wt link and a non-node child are left alone', async () => {
    mkdirSync(RUNS(), { recursive: true, mode: 0o700 });
    const p = plant(join(RUNS(), 'run-planted'));
    try {
      await runOnBase(dir, { base, tests: ['tests/real.test.js'] });
      intact(p);
      expect(existsSync(join(RUNS(), 'run-planted')), 'the planted folder itself is cleared').toBe(false);
    } finally {
      p.undo();
    }
  }, SLOW);

  it('a run whose owner pid is alive but was reused (a later start) is swept', async () => {
    mkdirSync(RUNS(), { recursive: true, mode: 0o700 });
    const stale = join(RUNS(), 'run-reused');
    mkdirSync(stale, { recursive: true });
    writeFileSync(join(stale, 'owner.pid'), `${process.pid} Thu Jan  1 00:00:00 1970`);
    try {
      await runOnBase(dir, { base, tests: ['tests/real.test.js'] });
      expect(existsSync(stale)).toBe(false);
    } finally {
      rmSync(stale, { recursive: true, force: true });
    }
  }, SLOW);

  it('a runs folder that is a link is not used, and nothing is written where it points', async () => {
    const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'sig-parent-run-test-tmp-')));
    const elsewhere = realpathSync(mkdtempSync(join(tmpdir(), 'sig-parent-run-test-elsewhere-')));
    const saved = process.env.TMPDIR;
    try {
      symlinkSync(elsewhere, join(scratch, `sig-parent-runs-${process.getuid()}`), 'dir');
      process.env.TMPDIR = scratch;
      const r = await runOnBase(dir, { base, tests: ['tests/real.test.js'] });
      expect(r.results[0].outcome).toBe('could-not-run');
      expect(r.results[0].reason).toMatch(/run folder/);
      expect(readdirSync(elsewhere)).toEqual([]);
    } finally {
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
      rmSync(scratch, { recursive: true, force: true });
      rmSync(elsewhere, { recursive: true, force: true });
    }
  }, SLOW);
});
