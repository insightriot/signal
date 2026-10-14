// M6.E16 r7.1 — the branch gate does not switch itself off when git fails.
//
// `checkBranchPosture` read every failure of the work-tree question as "not a
// git repository" (NOT_APPLICABLE), so a repository git refused — one it does
// not trust, a `.git` pointing nowhere — turned the gate off. Now only git's
// own "not a git repository", with no `.git` entry at or above the folder, is
// NOT_APPLICABLE; any other failure is CANNOT_DETERMINE, worded GIT_FAILED.
// The rule is `repoState`'s (`work-write.js`).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { BRANCH_GATE, checkBranchPosture } from '../plugin/tools/lib/branch-guard.js';
import { GIT_FAILED } from '../plugin/tools/lib/git-env.js';

const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const g = (cwd, ...args) => spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8', env: GIT_ENV });

// Does this git refuse a repository when told the folder has another owner?
const DUBIOUS_HONOURED = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'sig-gate-probe-'));
  try {
    g(dir, 'init', '-q');
    const r = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd: dir, encoding: 'utf8', env: { ...GIT_ENV, GIT_TEST_ASSUME_DIFFERENT_OWNER: '1', LC_ALL: 'C' },
    });
    return r.status !== 0 && /dubious ownership/.test(r.stderr);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();

let root;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sig-gate-git-failed-'));
});
afterEach(() => {
  delete process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER;
  rmSync(root, { recursive: true, force: true });
});

const gate = (dir, opts = {}) => checkBranchPosture(dir, { tier: 'FULL', ...opts });

describe('checkBranchPosture when git fails', () => {
  it('control: a folder with no repository is NOT_APPLICABLE, "not a git repository"', () => {
    const r = gate(root);
    expect(r.status).toBe(BRANCH_GATE.NOT_APPLICABLE);
    expect(r.reason).toBe('not a git repository');
  });

  it('a git that refuses the folder (injected, any git): CANNOT_DETERMINE, worded GIT_FAILED', () => {
    const execFn = () => {
      throw Object.assign(new Error('git failed'), { status: 128, stderr: "fatal: detected dubious ownership in repository at '/x'\n" });
    };
    const r = gate(root, { execFn });
    expect(r.status).toBe(BRANCH_GATE.CANNOT_DETERMINE);
    expect(r.reason).toBe(GIT_FAILED);
  });

  it('a .git file above the folder pointing nowhere (real git): git says "not a git repository", and it is still CANNOT_DETERMINE', () => {
    writeFileSync(join(root, '.git'), `gitdir: ${join(root, 'nowhere')}\n`);
    const sub = join(root, 'sub');
    mkdirSync(sub);
    const r = gate(sub);
    expect(r.status).toBe(BRANCH_GATE.CANNOT_DETERMINE);
    expect(r.reason).toBe(GIT_FAILED);
  });

  // r7.1: an empty remote list is "no git remote" only when git read this
  // repository's own config — a git that finds a repository it does not
  // trust can list no remotes and exit 0.
  it('control: a real repository with no remote is NOT_APPLICABLE, "no git remote"', () => {
    g(root, 'init', '-q', '-b', 'main');
    g(root, 'commit', '-q', '--allow-empty', '-m', 'c0');
    const r = gate(root);
    expect(r.status).toBe(BRANCH_GATE.NOT_APPLICABLE);
    expect(r.reason).toMatch(/^no git remote/);
  });

  it('an empty remote list from a git that did not read the repository\'s config (injected, any git): CANNOT_DETERMINE, worded GIT_FAILED', () => {
    g(root, 'init', '-q', '-b', 'main');
    const execFn = (cmd, args) => {
      if (args[0] === 'remote') return '';
      if (args[0] === 'config' && args.includes('--local')) {
        throw Object.assign(new Error('git failed'), { status: 128, stderr: 'fatal: --local can only be used inside a git repository\n' });
      }
      return 'true\n';
    };
    const r = gate(root, { execFn });
    expect(r.status).toBe(BRANCH_GATE.CANNOT_DETERMINE);
    expect(r.reason).toBe(GIT_FAILED);
  });

  it.skipIf(!DUBIOUS_HONOURED)('a repository git does not trust, asked at its own top (real git): not NOT_APPLICABLE [skipped where this git does not honour GIT_TEST_ASSUME_DIFFERENT_OWNER]', () => {
    g(root, 'init', '-q', '-b', 'main');
    process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER = '1';
    expect(gate(root).status).toBe(BRANCH_GATE.CANNOT_DETERMINE);
  });

  it.skipIf(!DUBIOUS_HONOURED)('a repository git does not trust, asked from a folder inside it (real git): CANNOT_DETERMINE [skipped where this git does not honour GIT_TEST_ASSUME_DIFFERENT_OWNER]', () => {
    g(root, 'init', '-q', '-b', 'main');
    const sub = join(root, 'sub');
    mkdirSync(sub);
    process.env.GIT_TEST_ASSUME_DIFFERENT_OWNER = '1';
    const r = gate(sub);
    expect(r.status).toBe(BRANCH_GATE.CANNOT_DETERMINE);
    expect(r.reason).toBe(GIT_FAILED);
  });
});
