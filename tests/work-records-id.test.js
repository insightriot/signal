// Tests for v2 ID allocation and the duplicate-ID check (M6.E13.S2.t2.3, AC2.3).
// See .planning/M6.E13-PLAN.md t2.3 and .planning/M6.E13-VALIDATION.md row AC2.3.
//
// Exemplar: the v1 nextId tests (work-id.test.js, retired at t7.4). Real temp git repos, not a mocked
// execFn, for every claim about what git reports.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { nextIdV2, findDuplicateIds, recordPath } from '../plugin/tools/lib/work-records.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
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
const v2 = (dir, key = 'SIG') => put(dir, '.planning/work/WORK.md', `---\nkey: ${key}\nschema_version: 2\n---\n`);

let root;
let repo;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-records-id-'));
  repo = join(root, 'repo');
  await mkdir(repo);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('nextIdV2 — working tree', () => {
  it('an empty store starts at 1', async () => {
    initRepo(repo);
    await v2(repo);
    expect(nextIdV2(repo)).toEqual({ id: 'SIG-1', basis: 'git-log' });
  });

  it('counts v2 records, v1 item paths, the relocated v1 folder and archived Epics — this key only', async () => {
    initRepo(repo);
    await v2(repo);
    await put(repo, recordPath('SIG-1200'));
    expect(nextIdV2(repo).id).toBe('SIG-1201');
    for (const [rel, next] of [
      ['.planning/work/backlog/SIG-1300.md', 'SIG-1301'],
      ['.planning/work/epics/M6.E13/SIG-1400.md', 'SIG-1401'],
      ['.planning/work/done/2026-09/SIG-1500.md', 'SIG-1501'],
      ['.planning/archive/epics/M6.E1/SIG-1600.md', 'SIG-1601'],
      ['.planning/archive/pre-work-store-v2/work/backlog/SIG-1700.md', 'SIG-1701'],
    ]) {
      await put(repo, rel);
      expect(nextIdV2(repo).id, rel).toBe(next);
    }
    await put(repo, '.planning/work/items/09/OTHER-9999.json');
    await put(repo, '.planning/work/items/09/SIG-9999.txt');
    expect(nextIdV2(repo).id).toBe('SIG-1701');
  });

  it('uses the key from WORK.md, never a hard-coded SIG', async () => {
    initRepo(repo);
    await v2(repo, 'ACME');
    await put(repo, recordPath('ACME-7'));
    await put(repo, recordPath('SIG-50'));
    expect(nextIdV2(repo).id).toBe('ACME-8');
  });

  it('reads a v1 store too (allocation reads only)', async () => {
    initRepo(repo);
    await put(repo, '.planning/work/WORK.md', '---\nkey: SIG\n---\n');
    await put(repo, '.planning/work/inbox/SIG-4.md');
    expect(nextIdV2(repo).id).toBe('SIG-5');
  });

  it('outside a git repo reads the working tree only, and says so', async () => {
    await v2(repo);
    await put(repo, recordPath('SIG-3'));
    expect(nextIdV2(repo)).toEqual({ id: 'SIG-4', basis: 'worktree-only' });
  });

  it('store off → CONFIG', () => {
    expect(() => nextIdV2(repo)).toThrow(expect.objectContaining({ code: 'CONFIG' }));
  });
});

describe('nextIdV2 — git history', () => {
  it('a deleted record or v1 file is never reused (.json and .md both read from history)', async () => {
    initRepo(repo);
    await v2(repo);
    await put(repo, recordPath('SIG-30'));
    await put(repo, '.planning/work/backlog/SIG-20.md');
    commitAll(repo, 'add');
    await rm(join(repo, recordPath('SIG-30')));
    await rm(join(repo, '.planning/work/backlog/SIG-20.md'));
    commitAll(repo, 'delete');
    expect(nextIdV2(repo)).toEqual({ id: 'SIG-31', basis: 'git-log' });
  });

  it('a number held only on another branch counts', async () => {
    initRepo(repo);
    await v2(repo);
    commitAll(repo, 'base');
    git(repo, ['checkout', '-q', '-b', 'other']);
    await put(repo, recordPath('SIG-2001'));
    commitAll(repo, 'other');
    git(repo, ['checkout', '-q', 'main']);
    expect(nextIdV2(repo).id).toBe('SIG-2002');
  });

  // Carried from the v1 work-id.test.js when nextId was retired (M6.E13 t7.4).
  it('a number only a detached HEAD can reach counts', async () => {
    initRepo(repo);
    await v2(repo);
    commitAll(repo, 'init');
    git(repo, ['checkout', '-q', '--detach']);
    await put(repo, recordPath('SIG-21'));
    commitAll(repo, 'detached');
    await rm(join(repo, recordPath('SIG-21')));
    commitAll(repo, 'gone from worktree, still in HEAD history');
    expect(nextIdV2(repo).id).toBe('SIG-22');
  });

  it('an empty repository (no commits) still reads git, not worktree-only', async () => {
    initRepo(repo);
    await v2(repo);
    await put(repo, recordPath('SIG-4'));
    expect(nextIdV2(repo)).toEqual({ id: 'SIG-5', basis: 'git-log' });
  });

  it('a shallow clone falls back to every ref\'s tree and reports ls-tree', async () => {
    initRepo(repo);
    await v2(repo);
    await put(repo, recordPath('SIG-40'));
    commitAll(repo, 'one');
    await put(repo, '.planning/archive/pre-work-store-v2/work/done/2026-09/SIG-41.md');
    commitAll(repo, 'two');
    const clone = join(root, 'clone');
    git(root, ['clone', '-q', '--depth', '1', `file://${repo}`, clone]);
    expect(nextIdV2(clone)).toEqual({ id: 'SIG-42', basis: 'ls-tree' });
  });

  it('a git failure inside a repo throws IO, never a silent worktree answer', async () => {
    initRepo(repo);
    await v2(repo);
    const execFn = (cmd, args, opts) => {
      if (args[0] === 'log') throw new Error('boom');
      return execFileSync(cmd, args, opts);
    };
    expect(() => nextIdV2(repo, { execFn })).toThrow(expect.objectContaining({ code: 'IO' }));
  });
});

describe('findDuplicateIds — AC2.3, a reused number fails', () => {
  it('none in a clean store; a record and its body are one item', async () => {
    await v2(repo);
    await put(repo, recordPath('SIG-1'));
    await put(repo, recordPath('SIG-1').replace(/\.json$/, '.md'));
    await put(repo, recordPath('SIG-2'));
    expect(findDuplicateIds(repo)).toEqual([]);
  });

  it('a record whose number a v1 item or an archived Epic item also carries is a duplicate', async () => {
    await v2(repo);
    await put(repo, recordPath('SIG-5'));
    await put(repo, '.planning/work/backlog/SIG-5.md');
    await put(repo, recordPath('SIG-6'));
    await put(repo, '.planning/archive/epics/M6.E1/SIG-6.md');
    await put(repo, '.planning/work/items/01/SIG-6.json');
    expect(findDuplicateIds(repo)).toEqual([
      { id: 'SIG-5', paths: ['.planning/work/backlog/SIG-5.md', '.planning/work/items/00/SIG-5.json'] },
      {
        id: 'SIG-6',
        paths: ['.planning/archive/epics/M6.E1/SIG-6.md', '.planning/work/items/00/SIG-6.json', '.planning/work/items/01/SIG-6.json'],
      },
    ]);
  });

  it('skips the relocated v1 folder: every migrated item is there AND in items/ by design', async () => {
    await v2(repo);
    await put(repo, recordPath('SIG-7'));
    await put(repo, '.planning/archive/pre-work-store-v2/work/backlog/SIG-7.md');
    await put(repo, '.planning/archive/pre-work-store-v2/archive/epics/M6.E11/SIG-7.md');
    expect(findDuplicateIds(repo)).toEqual([]);
  });

  it('only this store\'s key', async () => {
    await v2(repo);
    await put(repo, '.planning/work/items/00/OTHER-1.json');
    await put(repo, '.planning/work/backlog/OTHER-1.md');
    expect(findDuplicateIds(repo)).toEqual([]);
  });
});
