// M6.E16 r6 (REVIEW: High, security) — a planted repository layout in a
// project folder is never used as the repository. Rewritten in r6.4.
//
// A project can live in a subfolder of a larger repository. Files named
// `HEAD`, `config`, `objects/` and `refs/` committed INTO that subfolder make
// git, run from there, take the subfolder for a repository of its own and read
// its `config` — and `core.fsmonitor` in a config is a command git runs at
// `git status`. So whoever can commit to the repository could run a command on
// the machine of whoever runs Signal in it.
//
// What stops it is git's own `safe.bareRepository=explicit`, which every git
// call Signal makes carries in its environment (`gitEnv`,
// `plugin/tools/lib/git-env.js`; `tests/git-env-inventory.test.js` holds every
// call site to it). Git older than 2.38 does not know the setting, and Signal
// runs NO git-backed check with such a git (`gitUnusableReason`).
//
// So this file asks two things, and only these:
//
//   1. on the git that is installed, for every planted layout below, through
//      every Signal entry point that runs git or `gh`: NOTHING PLANTED RUNS,
//      and nothing from the planted repository reaches an answer — and real
//      repositories, however laid out, still work;
//   2. with the version forced below 2.38: every entry point takes its safe
//      branch, says why where it says anything, and starts NO git or `gh`
//      process at all.
//
// It does not assert how git treats an odd entry (a `HEAD` that is a link, a
// `.git` that is a FIFO): versions differ, and it is not the claim. The
// repositories are built once with real git and copied for each test.

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { setImmediate } from 'node:timers';
import {
  appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import * as branchGuard from '../plugin/tools/lib/branch-guard.js';
import { isGitRepo as storeIsGitRepo } from '../plugin/tools/lib/work-store.js';
import { headProvesNothing } from '../plugin/tools/lib/work-records.js';
import { probeGitState } from '../plugin/tools/lib/migrate-memory.js';
import { dotenvRefusal } from '../plugin/tools/lib/jev.js';
import { buildEvidenceIndex } from '../plugin/tools/lib/work-migrate-lists.js';
import { readPrReviewFindings } from '../plugin/tools/lib/pr-review-findings.js';
import { gitEnv, gitUnusableReason, testSeam } from '../plugin/tools/lib/git-env.js';
import { runGit } from '../plugin/tools/lib/git-objects.js';

const PLANTED_REMOTE = 'https://example.invalid/planted.git';

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let template;
let root;
let outer;
let marker;
let plantedHead;
let savedPath;
let ghLog;
let gitLog;

// `outer/` is the real repository; `seed/` is another whose `.git` is the
// stuff a planted layout is made of: a commit, a branch called `planted`, a
// remote. Built ONCE with git and copied for each test — built per test, the
// file ran hundreds of git processes back to back and held the test worker.
beforeAll(() => {
  template = mkdtempSync(join(tmpdir(), 'sig-planted-template-'));
  g(template, 'init', '-q', '-b', 'main', 'outer');
  g(join(template, 'outer'), 'commit', '-q', '--allow-empty', '-m', 'the real repository');
  const seed = join(template, 'seed');
  mkdirSync(seed);
  g(seed, 'init', '-q', '-b', 'planted');
  writeFileSync(join(seed, 'a.txt'), 'a\n');
  g(seed, 'add', '-A');
  g(seed, 'commit', '-q', '-m', 'planted');
  g(seed, 'remote', 'add', 'origin', PLANTED_REMOTE);
  plantedHead = g(seed, 'rev-parse', 'HEAD');
});
afterAll(() => {
  rmSync(template, { recursive: true, force: true });
});

// Async, with a turn of the event loop given up first: every test here is
// synchronous, and a worker that never yields cannot hear from the test runner.
beforeEach(async () => {
  await new Promise((done) => { setImmediate(done); });
  root = realpathSync(mkdtempSync(join(tmpdir(), 'sig-planted-')));
  cpSync(template, root, { recursive: true });
  outer = join(root, 'outer');
  marker = join(root, 'marker');
  savedPath = process.env.PATH;
  ghLog = join(root, 'gh-asked');
  gitLog = join(root, 'git-was-started');
});
afterEach(() => {
  testSeam.gitVersion = undefined;
  process.env.PATH = savedPath;
  rmSync(root, { recursive: true, force: true });
});

// The planted layout, in `dir`: what an attacker committed. Its `config`
// names the planted remote and a `core.fsmonitor` that touches `marker` (the
// trailing `#` drops the arguments git appends); its `info/exclude` calls
// `.env` ignored, and a `.env` with a key sits beside it. `over` changes it.
function plant(dir, { config = '', head = true, objects = true } = {}) {
  mkdirSync(dir, { recursive: true });
  const from = join(root, 'seed', '.git');
  for (const part of ['config', 'refs', ...(head ? ['HEAD'] : []), ...(objects ? ['objects'] : [])]) cpSync(join(from, part), join(dir, part), { recursive: true });
  appendFileSync(join(dir, 'config'), `[core]\n\tbare = false\n\tworktree = .\n\tfsmonitor = "touch '${marker}' #"\n${config}`);
  mkdirSync(join(dir, 'info'), { recursive: true });
  writeFileSync(join(dir, 'info', 'exclude'), '.env\n');
  writeFileSync(join(dir, '.env'), 'TYPESAFE_API_KEY=planted\n');
  return dir;
}

// A `gh` on a PATH of the test's own. Like the real one it asks git where it
// is — with the environment it was given — and it writes down what git said.
function fakeGh() {
  const bin = join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\n{ echo "gh $1"; git remote get-url origin; git config --get remote.origin.url; git status --porcelain; } >> '${ghLog}' 2>&1\necho '{"data":{"repository":{"pullRequest":{"reviewThreads":{"nodes":[]}}}}}'\n`);
  chmodSync(join(bin, 'gh'), 0o755);
  process.env.PATH = `${bin}:${savedPath}`;
}

// Every Signal entry point that runs git or `gh`, in `dir`. Returns what each
// answered, for the assertions that are about Signal's answer.
function everyEntryPoint(dir) {
  const quiet = (fn) => { try { return fn(); } catch (err) { return err; } };
  return {
    status: quiet(() => spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8', env: gitEnv(dir) }).status),
    runGit: quiet(() => runGit(dir, ['status', '--porcelain', '--untracked-files=all', '--', '.'], execFileSync)),
    headProvesNothing: quiet(() => headProvesNothing(dir, plantedHead)),
    probeGitState: quiet(() => probeGitState(dir)),
    isGitRepo: [branchGuard.isGitRepo(dir), storeIsGitRepo(dir)],
    branch: branchGuard.readCurrentBranch(dir),
    remotes: branchGuard.remoteNames(dir),
    defaultBranch: branchGuard.resolveDefaultBranch(dir),
    posture: branchGuard.checkBranchPosture(dir, { tier: 'FULL' }),
    evidence: quiet(() => buildEvidenceIndex(dir)),
    dotenv: dotenvRefusal(dir, '.env'),
    prEvidence: branchGuard.readPullRequestEvidence(dir),
    prReview: readPrReviewFindings({ owner: 'insightriot', repo: 'signal', pr: 1, cwd: dir }),
  };
}

// The claim: nothing planted ran, and nothing of the planted repository —
// its branch, its commit, its remote — reached an answer or a `gh` call.
function nothingPlanted(dir) {
  fakeGh();
  const got = everyEntryPoint(dir);
  expect(existsSync(marker), 'the planted command ran').toBe(false);
  expect(got.branch).not.toBe('planted');
  expect(got.posture.currentBranch).not.toBe('planted');
  expect(got.evidence?.commits ?? []).not.toContain(plantedHead);
  expect(String(got.evidence?.origin ?? '')).not.toContain('planted');
  const asked = existsSync(ghLog) ? readFileSync(ghLog, 'utf-8') : '';
  expect(asked).not.toContain(PLANTED_REMOTE);
  expect(asked).not.toContain('planted.git');
  return got;
}

describe('on the installed git: nothing planted runs, whatever the layout', { timeout: 60_000 }, () => {
  it('the installed git is one Signal runs its checks on', () => {
    expect(gitUnusableReason()).toBeNull();
  });

  it('the attack is real: plain git, run from the planted folder, runs the planted command', () => {
    const proj = plant(join(outer, 'proj'));
    spawnSync('git', ['status', '--porcelain'], { cwd: proj, encoding: 'utf8' });
    expect(existsSync(marker)).toBe(true);
  });

  it('a planted folder: every entry point answers as for no repository, and the committed .env supplies no key', () => {
    const proj = plant(join(outer, 'proj'));
    const got = nothingPlanted(proj);
    expect(got.isGitRepo).toEqual([false, false]);
    expect(got.branch).toBeNull();
    expect(got.defaultBranch).toBeNull();
    expect(got.headProvesNothing).toBeNull();
    expect(got.probeGitState).toMatchObject({ mode: 'fs-backup' });
    expect(got.evidence).toMatchObject({ source: 'none', commits: [], origin: null });
    expect(got.dotenv).toEqual(expect.any(String));
    expect(got.prEvidence.status).not.toBe('found');
    // `gh` was run — with git's environment, so its own git found nothing there.
    expect(readFileSync(ghLog, 'utf-8')).toContain('gh ');
  });

  it.each([
    ['a link to a ref that is there', 'refs/heads/planted'],
    ['a link to a ref that is not there', 'refs/heads/nothing-here'],
    ['a link to itself', 'HEAD'],
    ['a link out of the repository', '/etc/hosts'],
  ])('`HEAD` as %s', (_label, target) => {
    const proj = plant(join(outer, 'proj'), { head: false });
    symlinkSync(target, join(proj, 'HEAD'));
    nothingPlanted(proj);
  });

  it('`HEAD` as a folder, and as a file that cannot be read', () => {
    mkdirSync(join(plant(join(outer, 'p1'), { head: false }), 'HEAD'));
    nothingPlanted(join(outer, 'p1'));
    const p2 = plant(join(outer, 'p2'));
    chmodSync(join(p2, 'HEAD'), 0o000);
    nothingPlanted(p2);
  });

  it('a `.git` inside the planted folder that is no repository: an empty folder, a dangling link, an empty file', () => {
    const proj = plant(join(outer, 'proj'));
    for (const [name, make] of [
      ['empty-folder', (p) => mkdirSync(p)],
      ['dangling-link', (p) => symlinkSync(join(root, 'nowhere'), p)],
      ['empty-file', (p) => writeFileSync(p, '')],
    ]) {
      const inner = join(proj, name);
      mkdirSync(inner);
      make(join(inner, '.git'));
      nothingPlanted(inner);
    }
  });

  // Git walks the real path: a committed link leads into the planted folder
  // without the written path ever passing it.
  it('a linked folder that leads into the planted one (packages/app -> ../proj/app)', () => {
    const proj = plant(join(outer, 'proj'));
    mkdirSync(join(proj, 'app'));
    mkdirSync(join(outer, 'packages'));
    symlinkSync('../proj/app', join(outer, 'packages', 'app'));
    const got = nothingPlanted(join(outer, 'packages', 'app'));
    expect(got.isGitRepo[1]).toBe(false);
  });

  // A folder whose name ends in a space, with `core.worktree` naming a
  // subfolder: what a path-trimming look of our own was got past with.
  it('a planted folder whose name ends in a space, run from it and from its `core.worktree` subfolder', () => {
    const q = plant(join(outer, 'Q1 '), { config: '[core]\n\tworktree = sub\n' });
    mkdirSync(join(q, 'sub'));
    // the control for this shape: plain git, from the subfolder, runs the planted command
    spawnSync('git', ['status', '--porcelain'], { cwd: join(q, 'sub'), encoding: 'utf8' });
    expect(existsSync(marker)).toBe(true);
    rmSync(marker);
    nothingPlanted(q);
    rmSync(ghLog, { force: true });
    nothingPlanted(join(q, 'sub'));
  });

  // `objects` planted as a link to a folder that is not there yet — and then
  // is, made by something else. Nothing remembered from before may matter.
  it('`objects` as a dangling link, and again once the folder it points at exists', () => {
    const proj = plant(join(outer, 'proj'), { objects: false });
    symlinkSync('../made-later', join(proj, 'objects'));
    nothingPlanted(proj);
    cpSync(join(root, 'seed', '.git', 'objects'), join(outer, 'made-later'), { recursive: true });
    rmSync(ghLog, { force: true });
    const got = nothingPlanted(proj);
    expect(got.isGitRepo).toEqual([false, false]);
  });

  it('a planted `commondir`, and a planted `worktrees/` structure', () => {
    const proj = plant(join(outer, 'proj'));
    writeFileSync(join(proj, 'commondir'), '../elsewhere\n');
    plant(join(outer, 'elsewhere'));
    mkdirSync(join(proj, 'worktrees', 'x'), { recursive: true });
    writeFileSync(join(proj, 'worktrees', 'x', 'gitdir'), `${join(outer, 'wt', '.git')}\n`);
    nothingPlanted(proj);
  });

  // r6.5: a planted layout BETWEEN a project and its real `.git`. Git stops
  // at it and refuses, so every call fails — which is not "no repository":
  // the branch gate says it could not tell, and why.
  it('a planted layout between a project and its real repository: the branch gate could not tell, and says a folder is laid out like a bare repository', () => {
    const mid = plant(join(outer, 'mid'));
    const proj = join(mid, 'proj');
    mkdirSync(proj);
    g(outer, 'remote', 'add', 'origin', 'https://example.invalid/real.git');
    const reason = 'a folder at or above this one is laid out like a bare git repository, and git will not use it — so git could not be asked about this project';
    for (const dir of [proj, mid]) {
      const got = nothingPlanted(dir);
      expect(got.posture, dir).toMatchObject({ status: branchGuard.BRANCH_GATE.CANNOT_DETERMINE, reason });
      rmSync(ghLog, { force: true });
    }
    // a folder that is in no repository at all is still simply not applicable
    expect(branchGuard.checkBranchPosture(root, { tier: 'FULL' })).toMatchObject({ status: branchGuard.BRANCH_GATE.NOT_APPLICABLE, reason: 'not a git repository' });
  });

  it('inherited GIT_DIR, GIT_COMMON_DIR and GIT_CONFIG_PARAMETERS pointing at the planted folder do not bring it back', () => {
    const proj = plant(join(outer, 'proj'));
    const set = { GIT_DIR: proj, GIT_COMMON_DIR: proj, GIT_CONFIG_PARAMETERS: `'core.fsmonitor=touch '\\''${marker}'\\'' #'` };
    const was = Object.fromEntries(Object.keys(set).map((k) => [k, process.env[k]]));
    Object.assign(process.env, set);
    try {
      for (const dir of [proj, outer]) {
        spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8', env: gitEnv(dir) });
        headProvesNothing(dir, plantedHead);
        probeGitState(dir);
      }
      expect(existsSync(marker)).toBe(false);
    } finally {
      for (const [k, v] of Object.entries(was)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  it('a successful call with the shared environment prints nothing on stderr (the grafts advice is off)', () => {
    for (const args of [['status', '--porcelain'], ['log', '--oneline', '-1'], ['merge-base', '--is-ancestor', 'HEAD', 'HEAD'], ['rev-list', '--count', 'HEAD']]) {
      const r = spawnSync('git', args, { cwd: outer, encoding: 'utf8', env: gitEnv(outer) });
      expect([r.status, r.stderr], args.join(' ')).toEqual([0, '']);
    }
  });
});

describe('on the installed git: real repositories still work, however they are laid out', { timeout: 60_000 }, () => {
  const works = (dir) => {
    expect(branchGuard.isGitRepo(dir), dir).toBe(true);
    expect(storeIsGitRepo(dir), dir).toBe(true);
    expect(spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8', env: gitEnv(dir) }).status, dir).toBe(0);
  };

  it('the repository\'s top, a subfolder, a folder holding a file named HEAD, and a planted folder\'s neighbour', () => {
    const sub = join(outer, 'packages', 'app');
    mkdirSync(sub, { recursive: true });
    const docs = join(outer, 'docs');
    mkdirSync(docs);
    writeFileSync(join(docs, 'HEAD'), 'a file a project may well have\n');
    plant(join(outer, 'proj'));
    for (const dir of [outer, sub, docs]) works(dir);
    expect(branchGuard.readCurrentBranch(outer)).toBe('main');
  });

  it('a linked worktree, and a submodule (a `.git` file into `.git/modules`)', () => {
    const linked = join(root, 'linked');
    g(outer, 'worktree', 'add', '-q', linked, '-b', 'side');
    const moduleDir = join(outer, '.git', 'modules', 'lib');
    const module = join(outer, 'lib');
    mkdirSync(module);
    cpSync(join(root, 'seed', '.git'), moduleDir, { recursive: true });
    writeFileSync(join(module, '.git'), `gitdir: ${moduleDir}\n`);
    for (const dir of [linked, module]) works(dir);
    expect(branchGuard.readCurrentBranch(linked)).toBe('side');
  });

  it('a git directory not named `.git`: a bare repository\'s worktree, --separate-git-dir, a linked `.git` — at the top and in a subfolder', () => {
    const bare = join(root, 'central.git');
    g(root, 'init', '-q', '--bare', '-b', 'main', bare);
    g(join(root, 'seed'), 'push', '-q', bare, 'planted:main');
    const bareWt = join(root, 'bare-wt');
    g(bare, 'worktree', 'add', '-q', bareWt, 'main');
    const separate = join(root, 'separate');
    mkdirSync(separate);
    g(separate, 'init', '-q', '-b', 'main', `--separate-git-dir=${join(root, 'separate-gitdir')}`);
    g(separate, 'commit', '-q', '--allow-empty', '-m', 'c0');
    const linkedDotGit = join(root, 'linked-dot-git');
    mkdirSync(linkedDotGit);
    cpSync(join(root, 'seed', '.git'), join(root, 'kept-gitdir'), { recursive: true });
    symlinkSync(join(root, 'kept-gitdir'), join(linkedDotGit, '.git'));
    for (const top of [bareWt, separate, linkedDotGit]) {
      const sub = join(top, 'src', 'deep');
      mkdirSync(sub, { recursive: true });
      writeFileSync(join(top, 'src', 'HEAD'), 'a file a project may well have\n');
      for (const dir of [top, sub]) works(dir);
    }
  });

  it('a folder that is no repository at all reads as none, and its git-ignored-ness is not asked of anyone', () => {
    expect(branchGuard.isGitRepo(root)).toBe(false);
    expect(storeIsGitRepo(root)).toBe(false);
    expect(dotenvRefusal(root, '.env')).toBeNull();
  });
});

// ── the gate: a git older than 2.38 ─────────────────────────────────────────

describe('with a git older than 2.38: no git-backed check is run, and no process is started', { timeout: 60_000 }, () => {
  const OLD = 'Signal needs git 2.38 or newer for its git-backed checks; this is git 2.34.1';

  // `git` and `gh` on a PATH of the test's own, each writing down that it was started.
  function spies() {
    const bin = join(root, 'spy-bin');
    mkdirSync(bin);
    for (const name of ['git', 'gh']) {
      writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $* (in $(pwd))" >> '${gitLog}'\nexit 1\n`);
      chmodSync(join(bin, name), 0o755);
    }
    process.env.PATH = `${bin}:${savedPath}`;
  }

  it.each([
    ['a planted folder', () => plant(join(outer, 'proj'))],
    ['a planted folder whose name ends in a space', () => plant(join(outer, 'Q1 '))],
    ['a real repository', () => outer],
    ['a subfolder of a real repository', () => { mkdirSync(join(outer, 'sub')); return join(outer, 'sub'); }],
  ])('%s: every entry point takes its safe branch and says why; nothing is started', (_label, make) => {
    const dir = make();
    spies();
    testSeam.gitVersion = 'git version 2.34.1';
    expect(gitUnusableReason()).toBe(OLD);
    expect(() => gitEnv(dir)).toThrow(OLD);
    const got = {
      runGit: (() => { try { return runGit(dir, ['status', '--porcelain'], execFileSync); } catch (err) { return err; } })(),
      headProvesNothing: headProvesNothing(dir, plantedHead),
      probeGitState: probeGitState(dir),
      isGitRepo: storeIsGitRepo(dir),
      branch: branchGuard.readCurrentBranch(dir),
      remotes: branchGuard.remoteNames(dir),
      defaultBranch: branchGuard.resolveDefaultBranch(dir),
      posture: branchGuard.checkBranchPosture(dir, { tier: 'FULL' }),
      evidence: buildEvidenceIndex(dir),
      dotenv: dotenvRefusal(dir, '.env'),
      prEvidence: branchGuard.readPullRequestEvidence(dir),
      prReview: readPrReviewFindings({ owner: 'insightriot', repo: 'signal', pr: 1, cwd: dir }),
    };
    // Nothing was started: not git, not gh, in the folder or anywhere.
    expect(existsSync(gitLog) ? readFileSync(gitLog, 'utf-8') : '').toBe('');
    expect(existsSync(marker)).toBe(false);
    // The safe branches.
    expect(got.runGit).toMatchObject({ name: 'GitUnusableError', status: 128, message: OLD });
    expect(got.headProvesNothing).toBeNull();
    expect(got.isGitRepo).toBe(false);
    expect([got.branch, got.remotes, got.defaultBranch]).toEqual([null, null, null]);
    expect(got.evidence).toMatchObject({ source: 'none', commits: [] });
    // And where a reason is given to a person, it is the version — not "no repository".
    expect(got.posture).toMatchObject({ status: branchGuard.BRANCH_GATE.CANNOT_DETERMINE, reason: OLD });
    expect(got.prEvidence).toMatchObject({ status: 'cannot-determine', reason: OLD });
    expect(got.prReview).toMatchObject({ status: 'cannot-check', reason: `${OLD} — nothing was asked` });
    expect(got.dotenv).toBe(`git could not confirm .env is ignored (${OLD})`);
    // r6.5: NOT a filesystem snapshot — that is the branch for "no repository",
    // and it goes on to write. "Could not ask" does not proceed.
    expect(got.probeGitState).toMatchObject({ proceed: false, reason: `${OLD}. Nothing was written.` });
    expect(got.probeGitState.mode).not.toBe('fs-backup');
  });
});
