// M6.E16 r6 (REVIEW: High, security) — a planted bare-repository layout in a
// project folder is never used as the repository.
//
// A project can live in a subfolder of a larger repository. Files named
// `HEAD`, `config`, `objects/` and `refs/` committed INTO that subfolder make
// git, run from there, take the subfolder for a repository of its own and read
// its `config` — and `core.fsmonitor` in a config is a command git runs at
// `git status`. So whoever can commit to the repository could run a command on
// the machine of whoever runs Signal in it.
//
// Every git call Signal makes carries `safe.bareRepository=explicit` through
// its environment (`gitEnv`, `plugin/tools/lib/git-env.js`): git then refuses a
// repository it finds without a `.git`, and the planted `config` is never read.
// `tests/git-env-inventory.test.js` checks that every call site carries it;
// this file runs the entry points against the planted layout. Real git, in
// temp repositories.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { setImmediate } from 'node:timers';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import * as branchGuard from '../plugin/tools/lib/branch-guard.js';
import { isGitRepo as storeIsGitRepo } from '../plugin/tools/lib/work-store.js';
import { headProvesNothing } from '../plugin/tools/lib/work-records.js';
import { probeGitState } from '../plugin/tools/lib/migrate-memory.js';
import { dotenvRefusal } from '../plugin/tools/lib/jev.js';
import { buildEvidenceIndex } from '../plugin/tools/lib/work-migrate-lists.js';
import { gitEnv, repositoryWithoutDotGit, testSeam } from '../plugin/tools/lib/git-env.js';

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let template;
let root;
let proj;
let marker;
let plantedHead;

// `outer/` is the real repository; `outer/proj/` is the project, holding what
// an attacker committed: the inside of another repository's `.git` (so it has
// a commit, a branch called `planted` and a remote), a `config` whose
// `core.fsmonitor` touches `marker`, and an `info/exclude` that calls `.env`
// ignored.
//
// The repositories are built ONCE, with git, and copied for each test (r6.1):
// built for each of the thirty-odd tests here, the file ran a few hundred git
// processes back to back and held the test worker for over a minute.
beforeAll(() => {
  template = mkdtempSync(join(tmpdir(), 'sig-planted-bare-template-'));
  const outer = join(template, 'outer');
  const planted = join(outer, 'proj');
  mkdirSync(planted, { recursive: true });
  g(outer, 'init', '-q', '-b', 'main');

  const seed = join(template, 'seed');
  mkdirSync(seed);
  g(seed, 'init', '-q', '-b', 'planted');
  writeFileSync(join(seed, 'a.txt'), 'a\n');
  g(seed, 'add', '-A');
  g(seed, 'commit', '-q', '-m', 'planted');
  g(seed, 'remote', 'add', 'origin', 'https://example.invalid/planted.git');
  plantedHead = g(seed, 'rev-parse', 'HEAD');
  for (const part of ['HEAD', 'config', 'objects', 'refs']) cpSync(join(seed, '.git', part), join(planted, part), { recursive: true });
  mkdirSync(join(planted, 'info'));
  writeFileSync(join(planted, 'info', 'exclude'), '.env\n');
  writeFileSync(join(planted, '.env'), 'TYPESAFE_API_KEY=planted\n');

  g(outer, 'add', '-A');
  g(outer, 'commit', '-q', '-m', 'a project with a planted repository layout');
});
afterAll(() => {
  rmSync(template, { recursive: true, force: true });
});

// Async, with a turn of the event loop given up first: every test here is
// synchronous, and a worker that never yields cannot hear from the test runner.
beforeEach(async () => {
  await new Promise((done) => { setImmediate(done); });
  root = mkdtempSync(join(tmpdir(), 'sig-planted-bare-'));
  cpSync(template, root, { recursive: true });
  marker = join(root, 'marker');
  proj = join(root, 'outer', 'proj');
  // The planted command names this test's marker. The trailing `#` drops the
  // arguments git appends to it.
  appendFileSync(join(proj, 'config'), `[core]\n\tbare = false\n\tworktree = .\n\tfsmonitor = "touch '${marker}' #"\n`);
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// Twice (r6.1): with git as installed, and with `safe.bareRepository` left out
// of the environment — which is all a git older than 2.38 makes of it (none
// is installed here; `testSeam`, `git-env.js`). There, what turns git away is
// `gitEnv(baseDir)` looking at the folder itself.
// Each test builds three repositories with real git; generous under load.
describe.each([
  ['git as installed', false],
  ['as git older than 2.38 reads it: no safe.bareRepository', true],
])('a planted bare-repository layout in the project folder — %s', { timeout: 60_000 }, (_name, oldGit) => {
  beforeEach(() => {
    testSeam.withoutBareRepositorySetting = oldGit;
  });
  afterEach(() => {
    testSeam.withoutBareRepositorySetting = false;
  });

  it('is a real attack: plain git, run from the folder, runs the planted command', () => {
    spawnSync('git', ['status', '--porcelain'], { cwd: proj, encoding: 'utf8' });
    expect(existsSync(marker)).toBe(true);
  });

  it('and the same call with the shared environment does not', () => {
    const r = spawnSync('git', ['status', '--porcelain'], { cwd: proj, encoding: 'utf8', env: gitEnv(proj) });
    expect(r.status).not.toBe(0);
    expect(existsSync(marker)).toBe(false);
  });

  it('the look itself runs nothing the planted config names: not fsmonitor, not a hook, not an alias', () => {
    const hooks = join(proj, 'planted-hooks');
    mkdirSync(hooks);
    for (const hook of ['pre-commit', 'post-checkout', 'reference-transaction', 'post-index-change']) {
      writeFileSync(join(hooks, hook), `#!/bin/sh\ntouch '${marker}'\n`, { mode: 0o755 });
    }
    appendFileSync(join(proj, 'config'), `[core]\n\thooksPath = ${hooks}\n\tpager = "touch '${marker}' #"\n[alias]\n\trev-parse = "!touch '${marker}' #"\n`);
    expect(repositoryWithoutDotGit(proj)).toBe(true);
    expect(existsSync(marker)).toBe(false);
    expect(gitEnv(proj).GIT_DIR).toBe('/dev/null/not-a-repository');
  });

  // r6.1: a `gh` call runs git to learn which repository it is in.
  it('readPullRequestEvidence does not run gh there: the planted config names another repository', () => {
    const calls = [];
    const execFn = (cmd, args) => {
      calls.push([cmd, ...args]);
      return '{"url":"https://example.invalid/planted/pull/1","state":"OPEN"}';
    };
    expect(branchGuard.readPullRequestEvidence(proj, { execFn })).toMatchObject({ status: 'cannot-determine', url: null, reason: 'not a git repository' });
    expect(calls).toEqual([]);
  });

  // r6.1: variables inherited from whatever started Signal that would point
  // git at the planted folder from anywhere.
  for (const [name, value] of [
    ['GIT_DIR', () => proj],
    ['GIT_WORK_TREE', () => proj],
    ['GIT_INDEX_FILE', () => join(proj, 'index')],
    ['GIT_CONFIG_PARAMETERS', () => `'core.fsmonitor=touch '\\''${marker}'\\'' #'`],
    ['GIT_COMMON_DIR', () => proj],
    ['GIT_OBJECT_DIRECTORY', () => join(proj, 'objects')],
  ]) {
    it(`an inherited ${name} does not bring the planted command back, in the planted folder or in the real repository above it`, () => {
      const was = process.env[name];
      process.env[name] = value();
      try {
        for (const dir of [proj, join(proj, '..')]) {
          headProvesNothing(dir, plantedHead);
          probeGitState(dir);
          spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8', env: gitEnv(dir) });
        }
        expect(existsSync(marker)).toBe(false);
      } finally {
        if (was === undefined) delete process.env[name];
        else process.env[name] = was;
      }
    });
  }

  it('headProvesNothing (`git status`) does not run the planted command', () => {
    const out = headProvesNothing(proj, plantedHead);
    expect(existsSync(marker)).toBe(false);
    expect(out).toBeNull();
  });

  it('probeGitState (`git status`) does not run the planted command, and takes the folder for no repository', () => {
    const out = probeGitState(proj);
    expect(existsSync(marker)).toBe(false);
    expect(out).toMatchObject({ mode: 'fs-backup' });
  });

  it('isGitRepo (both) does not take the planted layout for a repository', () => {
    expect(branchGuard.isGitRepo(proj)).toBe(false);
    expect(storeIsGitRepo(proj)).toBe(false);
  });

  it('the branch guard reads no branch, remote or default branch from the planted config', () => {
    expect(branchGuard.readCurrentBranch(proj)).toBeNull();
    expect(branchGuard.hasRemote(proj)).toBeNull();
    expect(branchGuard.resolveDefaultBranch(proj)).toBeNull();
  });

  it('the migration\'s evidence index (`git log`) reads no history from the planted repository: no commit of it can support a proposed close', () => {
    const idx = buildEvidenceIndex(proj);
    expect(idx.commits).not.toContain(plantedHead);
    expect(idx).toMatchObject({ source: 'none', commits: [], origin: null });
    expect(existsSync(marker)).toBe(false);
  });

  it('a committed .env is not called ignored on the planted exclude file\'s word', () => {
    expect(dotenvRefusal(proj, '.env')).toEqual(expect.any(String));
  });

  // What must keep working: every real repository, however it is laid out.
  it('real repositories are still repositories: a subfolder, a linked worktree, a `.git` inside `.git/modules`, a file named HEAD', () => {
    const outer = join(proj, '..');
    const sub = join(outer, 'packages', 'app');
    mkdirSync(sub, { recursive: true });
    const linked = join(root, 'linked');
    g(outer, 'worktree', 'add', '-q', linked, '-b', 'side');
    // a submodule's layout: its git directory under the parent's `.git/modules`, named by a `.git` file
    const moduleDir = join(outer, '.git', 'modules', 'lib');
    const module = join(outer, 'lib');
    mkdirSync(module);
    cpSync(join(root, 'seed', '.git'), moduleDir, { recursive: true });
    writeFileSync(join(module, '.git'), `gitdir: ${moduleDir}\n`);
    // a project that keeps a file called HEAD, in a folder of a real repository
    const named = join(outer, 'docs');
    mkdirSync(named);
    writeFileSync(join(named, 'HEAD'), 'not a ref\n');
    for (const dir of [outer, sub, linked, module, named]) {
      expect(repositoryWithoutDotGit(dir), dir).toBe(false);
      expect(gitEnv(dir), dir).not.toHaveProperty('GIT_DIR');
      expect(branchGuard.isGitRepo(dir), dir).toBe(true);
      expect(storeIsGitRepo(dir), dir).toBe(true);
    }
    // From inside a `.git` itself the directory git finds is a `.git`, so the
    // look says no. A git that knows `safe.bareRepository=explicit` refuses to
    // work from in there at all, and that refusal is reported as it is.
    expect(repositoryWithoutDotGit(join(outer, '.git'))).toBe(!oldGit);
    // and a folder that is no repository at all is not turned into a refusal of its own
    expect(repositoryWithoutDotGit(root)).toBe(false);
    expect(branchGuard.isGitRepo(root)).toBe(false);
  });
});
