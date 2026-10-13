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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import { gitEnv } from '../plugin/tools/lib/git-env.js';

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
let proj;
let marker;
let plantedHead;

// `outer/` is the real repository; `outer/proj/` is the project, holding what
// an attacker committed: the inside of another repository's `.git` (so it has
// a commit, a branch called `planted` and a remote), a `config` whose
// `core.fsmonitor` touches `marker`, and an `info/exclude` that calls `.env`
// ignored.
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sig-planted-bare-'));
  marker = join(root, 'marker');
  const outer = join(root, 'outer');
  proj = join(outer, 'proj');
  mkdirSync(proj, { recursive: true });
  g(outer, 'init', '-q', '-b', 'main');

  const seed = join(root, 'seed');
  mkdirSync(seed);
  g(seed, 'init', '-q', '-b', 'planted');
  writeFileSync(join(seed, 'a.txt'), 'a\n');
  g(seed, 'add', '-A');
  g(seed, 'commit', '-q', '-m', 'planted');
  g(seed, 'remote', 'add', 'origin', 'https://example.invalid/planted.git');
  plantedHead = g(seed, 'rev-parse', 'HEAD');
  for (const part of ['HEAD', 'config', 'objects', 'refs']) cpSync(join(seed, '.git', part), join(proj, part), { recursive: true });
  // The trailing `#` drops the arguments git appends to the command.
  appendFileSync(join(proj, 'config'), `[core]\n\tbare = false\n\tworktree = .\n\tfsmonitor = "touch '${marker}' #"\n`);
  mkdirSync(join(proj, 'info'));
  writeFileSync(join(proj, 'info', 'exclude'), '.env\n');
  writeFileSync(join(proj, '.env'), 'TYPESAFE_API_KEY=planted\n');

  g(outer, 'add', '-A');
  g(outer, 'commit', '-q', '-m', 'a project with a planted repository layout');
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// Each test builds three repositories with real git; generous under load.
describe('a planted bare-repository layout in the project folder', { timeout: 60_000 }, () => {
  it('is a real attack: plain git, run from the folder, runs the planted command', () => {
    spawnSync('git', ['status', '--porcelain'], { cwd: proj, encoding: 'utf8' });
    expect(existsSync(marker)).toBe(true);
  });

  it('and the same call with the shared environment does not', () => {
    const r = spawnSync('git', ['status', '--porcelain'], { cwd: proj, encoding: 'utf8', env: gitEnv() });
    expect(r.status).not.toBe(0);
    expect(existsSync(marker)).toBe(false);
  });

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
});
