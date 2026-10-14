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
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';

import * as branchGuard from '../plugin/tools/lib/branch-guard.js';
import { isGitRepo as storeIsGitRepo } from '../plugin/tools/lib/work-store.js';
import { headProvesNothing } from '../plugin/tools/lib/work-records.js';
import { probeGitState } from '../plugin/tools/lib/migrate-memory.js';
import { dotenvRefusal } from '../plugin/tools/lib/jev.js';
import { buildEvidenceIndex } from '../plugin/tools/lib/work-migrate-lists.js';
import { gitEnv, repositoryWithoutDotGit, testSeam } from '../plugin/tools/lib/git-env.js';
import { runGit } from '../plugin/tools/lib/git-objects.js';

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

  // This one stops BEFORE its `git status`: the folder reads as no repository
  // (`defaultBranchRef`), so the answer is null and status is never run.
  it('headProvesNothing takes the folder for no repository, and does not get as far as `git status`', () => {
    const out = headProvesNothing(proj, plantedHead);
    expect(existsSync(marker)).toBe(false);
    expect(out).toBeNull();
  });

  // r6.2: so `git status` itself, through the function every store read runs
  // git with (`runGit`, `git-objects.js`) and through the store's own copy.
  // Without the environment in either, the planted command runs.
  it('`git status` through runGit, and through the migration\'s own status call, does not run the planted command', () => {
    expect(() => runGit(proj, ['status', '--porcelain', '--untracked-files=all', '--', '.'], execFileSync)).toThrow();
    expect(existsSync(marker)).toBe(false);
    expect(() => runGit(proj, ['rev-parse', '--is-inside-work-tree'], execFileSync)).toThrow();
    // work-store.js keeps a `runGit` of its own, reached through `isGitRepo`.
    expect(storeIsGitRepo(proj)).toBe(false);
    expect(existsSync(marker)).toBe(false);
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
    // From inside a real `.git` — the folder itself, its `hooks`, a linked
    // worktree's own directory — the answer is no, on every git: nothing under
    // a `.git` can be committed, so none of it is a planted layout. (Some gits
    // that know `safe.bareRepository=explicit` refuse to work from in there
    // and newer ones do not; the answer here does not come from that.)
    const inside = [join(outer, '.git'), join(outer, '.git', 'hooks'), join(outer, '.git', 'worktrees', 'linked'), moduleDir];
    mkdirSync(join(outer, '.git', 'hooks'), { recursive: true });
    for (const dir of inside) {
      expect(repositoryWithoutDotGit(dir), dir).toBe(false);
      expect(gitEnv(dir), dir).not.toHaveProperty('GIT_DIR');
    }
    // and a folder that is no repository at all is not turned into a refusal of its own
    expect(repositoryWithoutDotGit(root)).toBe(false);
    expect(branchGuard.isGitRepo(root)).toBe(false);
  });

  // ── r6.3: the look asks git, and reads the answer by where it is ─────────

  // Signal's `git status` in `dir`, as `runGit` makes it: does it run the planted command?
  const statusRuns = (dir) => {
    spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8', env: gitEnv(dir) });
    return existsSync(marker);
  };
  // What plain git finds from `dir`, as a full path — the thing the look must agree with.
  const gitFinds = (dir) => {
    const r = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) return null;
    const out = r.stdout.trim();
    return realpathSync(isAbsolute(out) ? out : join(dir, out));
  };
  const outerOf = () => realpathSync(join(proj, '..'));

  // The hole: `HEAD` as a link. Git does not follow it (it reads where the
  // link points and accepts `refs/…`); a test that follows it sees no HEAD.
  it('HEAD as a link to refs/…, dangling or not, is still a planted repository', () => {
    for (const target of ['refs/heads/planted', 'refs/heads/nothing-here']) {
      rmSync(join(proj, 'HEAD'));
      symlinkSync(target, join(proj, 'HEAD'));
      expect(gitFinds(proj), target).toBe(realpathSync(proj)); // git takes the folder
      expect(repositoryWithoutDotGit(proj), target).toBe(true);
      expect(gitEnv(proj).GIT_DIR, target).toBe('/dev/null/not-a-repository');
      expect(statusRuns(proj), target).toBe(false);
      const calls = [];
      expect(branchGuard.readPullRequestEvidence(proj, { execFn: (cmd, args) => { calls.push([cmd, ...args]); return '{}'; } }).status).toBe('cannot-determine');
      expect(calls).toEqual([]);
    }
  });

  // What git does NOT take for a HEAD. The look agrees with git here too:
  // the folder is then part of the real repository above, and works as one.
  it.each([
    ['a link to itself', (p) => symlinkSync('HEAD', p)],
    ['a folder', (p) => mkdirSync(p)],
    ['a link to somewhere that is no ref', (p) => symlinkSync('/etc/hosts', p)],
    ['a file that cannot be read', (p) => { writeFileSync(p, 'ref: refs/heads/planted\n'); chmodSync(p, 0o000); }],
  ])('HEAD as %s: git does not take the folder, and neither does the look', (label, make) => {
    rmSync(join(proj, 'HEAD'));
    make(join(proj, 'HEAD'));
    // (root reads a file whatever its mode: there git does take the folder, and the look says so)
    const planted = gitFinds(proj) === realpathSync(proj);
    expect(repositoryWithoutDotGit(proj)).toBe(planted);
    if (label !== 'a file that cannot be read') expect(planted).toBe(false);
    if (!planted) {
      expect(gitFinds(proj)).toBe(join(outerOf(), '.git'));
      expect(branchGuard.isGitRepo(proj)).toBe(true);
    }
    expect(statusRuns(proj)).toBe(false);
  });

  // A `.git` that is no repository does not stop git's search: it goes on up,
  // into the planted folder above. So does the look.
  it.each([
    ['an empty folder', (p) => mkdirSync(p)],
    ['a dangling link', (p) => symlinkSync(join(p, '..', 'nowhere'), p)],
    ['a FIFO', (p) => { if (spawnSync('mkfifo', [p]).status !== 0) mkdirSync(p); }],
    ['a file naming the planted folder as its git directory', (p) => writeFileSync(p, `gitdir: ${realpathSync(join(p, '..', '..'))}\n`)],
  ])('a folder inside the planted one whose `.git` is %s: git finds the planted folder, and the look says so', (_label, make) => {
    const inner = join(proj, 'inner');
    mkdirSync(inner);
    make(join(inner, '.git'));
    expect(gitFinds(inner)).toBe(realpathSync(proj));
    expect(repositoryWithoutDotGit(inner)).toBe(true);
    expect(statusRuns(inner)).toBe(false);
  });

  it('a `.git` that is an empty file: git refuses it outright, the look says no, and nothing planted runs', () => {
    const inner = join(proj, 'inner');
    mkdirSync(inner);
    writeFileSync(join(inner, '.git'), '');
    expect(gitFinds(inner)).toBeNull();
    expect(repositoryWithoutDotGit(inner)).toBe(false);
    expect(storeIsGitRepo(inner)).toBe(false); // git's own refusal
    expect(statusRuns(inner)).toBe(false);
  });

  // Git walks the REAL path. A committed link leads into the planted folder
  // without the written path ever passing it.
  it('a linked folder that leads into the planted one (packages/app -> ../proj/app)', () => {
    const outer = join(proj, '..');
    mkdirSync(join(proj, 'app'));
    mkdirSync(join(outer, 'packages'));
    symlinkSync('../proj/app', join(outer, 'packages', 'app'));
    const through = join(outer, 'packages', 'app');
    expect(gitFinds(through)).toBe(realpathSync(proj));
    expect(repositoryWithoutDotGit(through)).toBe(true);
    expect(branchGuard.isGitRepo(through)).toBe(false);
    expect(statusRuns(through)).toBe(false);
    // the folder beside the link is the real repository's
    expect(repositoryWithoutDotGit(join(outer, 'packages'))).toBe(false);
    expect(branchGuard.isGitRepo(join(outer, 'packages'))).toBe(true);
  });

  // Other things a repository could carry in the planted folder: none moves
  // the git directory git reports away from the folder itself.
  it('a planted `commondir`, `core.worktree`, or `worktrees/` structure does not hide the planted folder', () => {
    writeFileSync(join(proj, 'commondir'), '../elsewhere\n');
    mkdirSync(join(proj, '..', 'elsewhere'));
    for (const part of ['config', 'objects', 'refs']) cpSync(join(proj, part), join(proj, '..', 'elsewhere', part), { recursive: true });
    mkdirSync(join(proj, 'worktrees', 'x'), { recursive: true });
    writeFileSync(join(proj, 'worktrees', 'x', 'gitdir'), `${join(proj, '..', 'wt', '.git')}\n`);
    appendFileSync(join(proj, 'config'), '[core]\n\tworktree = ../..\n');
    expect(repositoryWithoutDotGit(proj)).toBe(true);
    expect(statusRuns(proj)).toBe(false);
  });

  // The other half: a real repository whose git directory is not called
  // `.git`. It lies somewhere else, reached through a `.git` entry — which no
  // repository can carry — and must keep working, with a HEAD entry on the
  // way or without one.
  it('real repositories whose git directory is not named `.git` keep working: a bare repository\'s worktree, --separate-git-dir, a linked `.git`', () => {
    const bare = join(root, 'central.git');
    g(root, 'init', '-q', '--bare', '-b', 'main', bare);
    g(join(root, 'seed'), 'push', '-q', bare, 'planted:main');
    const bareWt = join(root, 'bare-wt');
    g(bare, 'worktree', 'add', '-q', bareWt, 'main');
    // the `.bare` layout: the bare repository in a hidden folder, named by a `.git` file
    const dotBare = join(root, 'dot-bare');
    mkdirSync(dotBare);
    cpSync(bare, join(dotBare, '.bare'), { recursive: true });
    writeFileSync(join(dotBare, '.git'), 'gitdir: ./.bare\n');
    const dotBareWt = join(dotBare, 'main');
    g(dotBare, 'worktree', 'add', '-q', dotBareWt, '-b', 'wt');
    const separate = join(root, 'separate');
    mkdirSync(separate);
    g(separate, 'init', '-q', '-b', 'main', `--separate-git-dir=${join(root, 'separate-gitdir')}`);
    g(separate, 'commit', '-q', '--allow-empty', '-m', 'c0');
    const linkedDotGit = join(root, 'linked-dot-git');
    mkdirSync(linkedDotGit);
    cpSync(join(root, 'seed', '.git'), join(root, 'kept-gitdir'), { recursive: true });
    symlinkSync(join(root, 'kept-gitdir'), join(linkedDotGit, '.git'));
    for (const top of [bareWt, dotBareWt, separate, linkedDotGit]) {
      const sub = join(top, 'src', 'deep');
      mkdirSync(sub, { recursive: true });
      const withHead = join(top, 'docs');
      mkdirSync(withHead, { recursive: true });
      writeFileSync(join(withHead, 'HEAD'), 'a file a project may well have\n');
      for (const dir of [top, sub, withHead]) {
        expect(repositoryWithoutDotGit(dir), dir).toBe(false);
        expect(gitEnv(dir), dir).not.toHaveProperty('GIT_DIR');
        expect(branchGuard.isGitRepo(dir), dir).toBe(true);
        expect(storeIsGitRepo(dir), dir).toBe(true);
      }
    }
    // Inside the bare repository itself Signal has no business: turned away.
    expect(repositoryWithoutDotGit(bare)).toBe(true);
  });

  // The answer is remembered — and asked for again whenever the folder
  // becomes a repository or stops being one.
  it('git is asked once for a folder, and again when what is there changes', () => {
    const dir = join(root, 'later');
    mkdirSync(dir);
    const asked = () => testSeam.asked;
    let n = asked();
    expect(branchGuard.isGitRepo(dir)).toBe(false);
    expect(asked()).toBe(n + 1);
    for (let i = 0; i < 5; i += 1) gitEnv(dir);
    expect(asked()).toBe(n + 1); // remembered
    g(dir, 'init', '-q', '-b', 'main');
    n = asked();
    expect(branchGuard.isGitRepo(dir)).toBe(true);
    expect(repositoryWithoutDotGit(dir)).toBe(false);
    expect(asked()).toBe(n + 1);
    // a planted layout appears in a subfolder that was looked at before
    const sub = join(dir, 'sub');
    mkdirSync(sub);
    expect(repositoryWithoutDotGit(sub)).toBe(false);
    writeFileSync(join(sub, 'HEAD'), 'ref: refs/heads/planted\n'); // a HEAD alone is not yet a repository
    expect(repositoryWithoutDotGit(sub)).toBe(false);
    for (const part of ['config', 'objects', 'refs']) cpSync(join(proj, part), join(sub, part), { recursive: true });
    expect(repositoryWithoutDotGit(sub)).toBe(true);
    expect(branchGuard.isGitRepo(sub)).toBe(false);
    // and goes
    rmSync(join(sub, 'refs'), { recursive: true });
    expect(repositoryWithoutDotGit(sub)).toBe(false);
    expect(branchGuard.isGitRepo(sub)).toBe(true);
    // the repository itself goes
    rmSync(join(dir, '.git'), { recursive: true });
    expect(branchGuard.isGitRepo(dir)).toBe(false);
  });

  it('a successful call with the shared environment prints nothing on stderr (the grafts advice is off)', () => {
    const outer = join(proj, '..');
    for (const args of [['status', '--porcelain'], ['log', '--oneline', '-1'], ['merge-base', '--is-ancestor', 'HEAD', 'HEAD'], ['rev-list', '--count', 'HEAD']]) {
      const r = spawnSync('git', args, { cwd: outer, encoding: 'utf8', env: gitEnv(outer) });
      expect([r.status, r.stderr], args.join(' ')).toEqual([0, '']);
    }
  });
});
