// Tests for work-item ID allocation (M6.E11.S1.t1.3, FR-4, D-M6E11-10, D-M6E11-26).
// See .planning/M6.E11-VALIDATION.md rows AC-4.1, AC-4.2, AC-4.4.
//
// Real temp git repos, not a mocked execFn, for everything that is a claim
// about what git reports: branches, deleted files and shallow clones are
// exactly the cases a mock would get right by construction.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { nextId } from '../plugin/tools/lib/work-store.js';
import { WorkStoreError } from '../plugin/tools/lib/work-item.js';

// Copied from tests/is-state-stale.test.js — identity + gpgsign matter on a
// machine whose global git config signs commits.
const git = (cwd, args) =>
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
function initRepo(dir) {
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
}
function commitAll(dir, msg) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', msg]);
}

async function put(dir, rel, content = 'x\n') {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const item = (dir, rel) => put(dir, join('.planning', 'work', rel));
const storeOn = (dir, key = 'SIG') => put(dir, '.planning/work/WORK.md', `---\nkey: ${key}\n---\n`);

let root;
let repo;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-work-id-'));
  repo = join(root, 'repo');
  await mkdir(repo);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('nextId — working tree', () => {
  it('an empty store starts at 1', async () => {
    initRepo(repo);
    await storeOn(repo);
    expect(nextId(repo)).toEqual({ id: 'SIG-1', basis: 'git-log' });
  });

  it('counts every folder, uncommitted files included, and only this key', async () => {
    initRepo(repo);
    await storeOn(repo);
    await item(repo, 'inbox/SIG-3.md');
    await item(repo, 'backlog/SIG-5.md');
    commitAll(repo, 'seed');
    await item(repo, 'epics/M6.E11/SIG-7.md'); // uncommitted
    await item(repo, 'epics/M6.E11/M6.E11-PLAN.md'); // an Epic artifact, not an item
    await item(repo, 'done/2026-09/OTHER-50.md'); // another key
    await item(repo, 'backlog/SIG-99.txt'); // not .md
    expect(nextId(repo)).toEqual({ id: 'SIG-8', basis: 'git-log' });
  });

  it('counts closed Epics under .planning/archive/epics/', async () => {
    initRepo(repo);
    await storeOn(repo);
    await item(repo, 'inbox/SIG-2.md');
    await put(repo, '.planning/archive/epics/M6.E9/SIG-40.md');
    expect(nextId(repo).id).toBe('SIG-41');
  });
});

describe('nextId — AC-4.1: highest across branches and HEAD', () => {
  it('sees an ID committed only on another branch', async () => {
    initRepo(repo);
    await storeOn(repo);
    await item(repo, 'inbox/SIG-5.md');
    commitAll(repo, 'main');
    git(repo, ['checkout', '-q', '-b', 'feat/other']);
    await item(repo, 'backlog/SIG-9.md');
    commitAll(repo, 'other branch allocates 9');
    git(repo, ['checkout', '-q', 'main']);
    expect(nextId(repo)).toEqual({ id: 'SIG-10', basis: 'git-log' });
  });

  it('sees a commit only a detached HEAD can reach', async () => {
    initRepo(repo);
    await storeOn(repo);
    commitAll(repo, 'init');
    git(repo, ['checkout', '-q', '--detach']);
    await item(repo, 'inbox/SIG-21.md');
    commitAll(repo, 'detached');
    await rm(join(repo, '.planning/work/inbox/SIG-21.md'));
    commitAll(repo, 'gone from worktree, still in HEAD history');
    expect(nextId(repo).id).toBe('SIG-22');
  });
});

describe('nextId — AC-4.2: never reuse an ID', () => {
  it('a deleted item keeps its number', async () => {
    initRepo(repo);
    await storeOn(repo);
    await item(repo, 'inbox/SIG-12.md');
    commitAll(repo, 'add 12');
    git(repo, ['rm', '-q', '.planning/work/inbox/SIG-12.md']);
    commitAll(repo, 'delete 12');
    expect(nextId(repo).id).toBe('SIG-13');
  });

  it('a moved item is still counted, and so is its old path', async () => {
    initRepo(repo);
    await storeOn(repo);
    await item(repo, 'inbox/SIG-30.md');
    commitAll(repo, 'add 30');
    await mkdir(join(repo, '.planning/work/backlog'), { recursive: true });
    git(repo, ['mv', '.planning/work/inbox/SIG-30.md', '.planning/work/backlog/SIG-30.md']);
    commitAll(repo, 'triage 30');
    expect(nextId(repo).id).toBe('SIG-31');
  });

  it('an item archived then removed from the tree keeps its number', async () => {
    initRepo(repo);
    await storeOn(repo);
    await put(repo, '.planning/archive/epics/M6.E1/SIG-60.md');
    commitAll(repo, 'archive');
    git(repo, ['rm', '-q', '-r', '.planning/archive']);
    commitAll(repo, 'drop archive');
    expect(nextId(repo).id).toBe('SIG-61');
  });

  it('an empty repository (no commits) still reads git, not worktree-only', async () => {
    initRepo(repo);
    await storeOn(repo);
    await item(repo, 'inbox/SIG-4.md');
    expect(nextId(repo)).toEqual({ id: 'SIG-5', basis: 'git-log' });
  });
});

describe('nextId — AC-4.4: fallbacks say so', () => {
  it('outside a git repository → worktree only, and basis says so', async () => {
    await storeOn(repo);
    await item(repo, 'backlog/SIG-17.md');
    expect(nextId(repo)).toEqual({ id: 'SIG-18', basis: 'worktree-only' });
  });

  it('a shallow clone → per-ref ls-tree, and basis says so', async () => {
    initRepo(repo);
    await storeOn(repo);
    await item(repo, 'inbox/SIG-5.md');
    commitAll(repo, 'one');
    await item(repo, 'inbox/SIG-6.md');
    commitAll(repo, 'two'); // ≥2 commits, or --depth 1 is not shallow
    git(repo, ['checkout', '-q', '-b', 'feat/other']);
    await item(repo, 'backlog/SIG-9.md');
    commitAll(repo, 'other branch');
    git(repo, ['checkout', '-q', 'main']);

    const clone = join(root, 'clone');
    git(root, ['clone', '-q', '--depth', '1', '--no-single-branch', `file://${repo}`, clone]);
    expect(String(git(clone, ['rev-parse', '--is-shallow-repository'])).trim()).toBe('true');
    // SIG-9 exists only on refs/remotes/origin/feat/other in the clone.
    expect(nextId(clone)).toEqual({ id: 'SIG-10', basis: 'ls-tree' });
  });
});

describe('nextId — contract', () => {
  it('store off → CONFIG error, not an ID', async () => {
    expect(() => nextId(repo)).toThrow(WorkStoreError);
  });

  it('a git failure inside a repo throws rather than falling back', async () => {
    await storeOn(repo);
    const calls = [];
    const execFn = (cmd, args) => {
      calls.push([cmd, args]);
      if (args[0] === 'rev-parse' && args[1] === '--is-inside-work-tree') return 'true\n';
      if (args[0] === 'rev-parse' && args[1] === '--is-shallow-repository') return 'false\n';
      if (args[0] === 'rev-parse' && args[1] === '--verify') return 'abc\n';
      throw new Error('git log exploded');
    };
    expect(() => nextId(repo, { execFn })).toThrow(/git log exploded|could not read/);
    // Arguments are passed as an array to git — never a shell string.
    for (const [cmd, args] of calls) {
      expect(cmd).toBe('git');
      expect(Array.isArray(args)).toBe(true);
    }
  });
});
