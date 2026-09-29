// Reopening a closed item (M6.E11 VERIFY loop 1, L1, D-M6E11-31).
//
// A closed item that comes back is reopened, not re-captured: it returns to
// backlog/ as T and its previous close is kept in the file's `history`. Real
// temp git repos, as in work-store-mutate.test.js — "history follows the
// file" and "a failed write rewinds the index" are claims about what git
// reports.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import { closeItem, getItem, reopenItem } from '../plugin/tools/lib/work-ops.js';
import { parseItem, stringifyItem, validateItem, WorkStoreError } from '../plugin/tools/lib/work-item.js';
import { checkStore, parseItemFileName, walkFiles } from '../plugin/tools/lib/work-store.js';

const git = (cwd, args) =>
  String(execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }));
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
async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const storeOn = (dir) => put(dir, '.planning/work/WORK.md', '---\nkey: SIG\n---\n# Work store\n');
const CREATED = { at: '2026-09-01T00:00:00.000Z', by: 'brett' };
const CLOSED_AT = '2026-09-10T12:00:00.000Z';
const AT = '2026-09-29T12:00:00.000Z';
const CLOSE = { reason: 'fixed', by: 'brett', at: CLOSED_AT, proof: 'abc1234' };
const closed = (id, extra = {}) => ({ id, type: 'BUG', status: 'C', title: 'A bug', created: CREATED, close: CLOSE, ...extra });

async function plant(dir, rel, item, body = 'The words.\n') {
  await put(dir, rel, stringifyItem(item, body));
}
function countItemFiles(dir) {
  return [...walkFiles(join(dir, '.planning', 'work')), ...walkFiles(join(dir, '.planning', 'archive', 'epics'))]
    .filter((p) => parseItemFileName(basename(p))).length;
}
async function expectCode(promise, code, pattern) {
  let err;
  try {
    await promise;
  } catch (e) {
    err = e;
  }
  expect(err, `expected a ${code} error`).toBeInstanceOf(WorkStoreError);
  expect(err.code).toBe(code);
  if (pattern) expect(err.message).toMatch(pattern);
}

let root;
let repo;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-work-reopen-'));
  repo = join(root, 'repo');
  await mkdir(repo);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('the `history` field (work-item.js)', () => {
  const entry = { ...CLOSE, reopened_at: AT, reopened_by: 'brett', reopen_reason: 'came back' };
  const base = { id: 'SIG-1', type: 'BUG', status: 'T', created: CREATED };

  it('accepts a list of prior closes on any status', () => {
    expect(validateItem({ ...base, history: [entry] })).toEqual([]);
    expect(validateItem({ ...base, status: 'C', close: CLOSE, history: [entry, entry] })).toEqual([]);
  });

  it('accepts an entry without proof (migrated closes have none)', () => {
    const { proof, ...noProof } = entry;
    expect(proof).toBeDefined();
    expect(validateItem({ ...base, history: [{ ...noProof, reason: 'stale' }] })).toEqual([]);
  });

  it('refuses a non-list, an empty list, and a non-mapping entry', () => {
    expect(validateItem({ ...base, history: entry })).toContain('history must be a non-empty list of prior close records');
    expect(validateItem({ ...base, history: [] })).toContain('history must be a non-empty list of prior close records');
    expect(validateItem({ ...base, history: ['x'] })).toContain('history[0] must be a mapping');
  });

  it('reports every missing field of an entry, named by its index', () => {
    const errors = validateItem({ ...base, history: [entry, { reason: 'stale' }] });
    for (const k of ['by', 'at', 'reopened_at', 'reopened_by', 'reopen_reason']) {
      expect(errors).toContain(`history[1].${k} is required`);
    }
  });

  it('holds an entry to the close rules: reason, dup_of, unknown keys', () => {
    expect(validateItem({ ...base, history: [{ ...entry, reason: 'done' }] }))
      .toContain('history[0].reason must be one of fixed/stale/wontdo/dup/rejected (got "done")');
    expect(validateItem({ ...base, history: [{ ...entry, reason: 'dup' }] }))
      .toContain('history[0].dup_of is required when history[0].reason is dup');
    expect(validateItem({ ...base, history: [{ ...entry, dup_of: 'SIG-2' }] }))
      .toContain('history[0].dup_of is only allowed when history[0].reason is dup');
    expect(validateItem({ ...base, history: [{ ...entry, reopenReason: 'x' }] }))
      .toContain('history[0].reopenReason is not a known field');
  });

  it('is written last, each entry in a fixed key order, and round-trips', () => {
    const scrambled = { reopen_reason: 'came back', reopened_by: 'brett', proof: 'abc1234', at: CLOSED_AT, reopened_at: AT, by: 'brett', reason: 'fixed' };
    const text = stringifyItem({ history: [scrambled], ...base, migration_note: 'n' }, 'body\n');
    const fm = text.split('---')[1];
    expect(fm.trimEnd().split('\n').filter((l) => /^\w/.test(l)).at(-1)).toBe('history:');
    const keys = [...fm.slice(fm.indexOf('history:')).matchAll(/^\s+-?\s*(\w+):/gm)].map((m) => m[1]);
    expect(keys).toEqual(['reason', 'by', 'at', 'proof', 'reopened_at', 'reopened_by', 'reopen_reason']);
    const parsed = parseItem(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.item.history).toEqual([entry]);
  });
});

describe('reopenItem', () => {
  it('done/YYYY-MM/ → backlog/ as T: close moved onto history with who, when, why; git mv; lists regenerated', async () => {
    initRepo(repo);
    await storeOn(repo);
    await plant(repo, '.planning/work/done/2026-09/SIG-1.md', closed('SIG-1'));
    commitAll(repo, 'seed');

    const r = await reopenItem(repo, 'SIG-1-BUG-C', { by: 'brett', reason: 'seen again on main', at: AT });
    expect(r).toMatchObject({ from: '.planning/work/done/2026-09/SIG-1.md', to: '.planning/work/backlog/SIG-1.md', label: 'SIG-1-BUG-T' });
    expect(existsSync(join(repo, '.planning/work/done/2026-09/SIG-1.md'))).toBe(false);

    const parsed = parseItem(await readFile(join(repo, r.to), 'utf-8'));
    expect(parsed.errors).toEqual([]);
    expect(parsed.item.status).toBe('T');
    expect(parsed.item.close).toBeUndefined();
    expect(parsed.item.history).toEqual([{ ...CLOSE, reopened_at: AT, reopened_by: 'brett', reopen_reason: 'seen again on main' }]);
    expect(Object.keys(parsed.item).at(-1)).toBe('history');
    expect(parsed.body).toBe('The words.\n');

    expect(git(repo, ['status', '--porcelain'])).toMatch(/^R[ M] \.planning\/work\/done\/2026-09\/SIG-1\.md -> \.planning\/work\/backlog\/SIG-1\.md/m);
    const bugs = await readFile(join(repo, '.planning/BUGS.md'), 'utf-8');
    expect(bugs).toMatch(/\| B1 \| `confirmed` \|/); // was `fixed` before the reopen
    expect(checkStore(repo)).toEqual([]);
  });

  it('a closed item inside a LIVE Epic folder moves to backlog/; the Epic README stays', async () => {
    initRepo(repo);
    await storeOn(repo);
    await put(repo, '.planning/work/epics/M6.E11/README.md', '---\nepic: M6.E11\n---\n# M6.E11\n');
    await plant(repo, '.planning/work/epics/M6.E11/SIG-2.md', closed('SIG-2'));
    commitAll(repo, 'seed');

    const r = await reopenItem(repo, 'SIG-2', { by: 'b', reason: 'regressed', at: AT });
    expect(r.to).toBe('.planning/work/backlog/SIG-2.md');
    expect(getItem(repo, 'SIG-2').epic).toBeUndefined();
    expect(existsSync(join(repo, '.planning/work/epics/M6.E11/README.md'))).toBe(true);
    expect(checkStore(repo)).toEqual([]);
  });

  it('refuses an item archived with its Epic: CONFLICT naming the Epic and the way forward; nothing moves', async () => {
    initRepo(repo);
    await storeOn(repo);
    const rel = '.planning/archive/epics/M6.E1/SIG-3.md';
    await plant(repo, rel, closed('SIG-3'));
    commitAll(repo, 'seed');
    const before = await readFile(join(repo, rel), 'utf-8');

    await expectCode(reopenItem(repo, 'SIG-3', { by: 'b', reason: 'r', at: AT }), 'CONFLICT',
      /archived with Epic M6\.E1[\s\S]*closed[\s\S]*new item[\s\S]*link/);
    expect(await readFile(join(repo, rel), 'utf-8')).toBe(before);
    expect(existsSync(join(repo, '.planning/work/backlog/SIG-3.md'))).toBe(false);
  });

  it('refuses an item that is not closed (CONFLICT), and a reopen without a reason or without by (SCHEMA)', async () => {
    initRepo(repo);
    await storeOn(repo);
    await plant(repo, '.planning/work/backlog/SIG-4.md', { id: 'SIG-4', type: 'BUG', status: 'T', created: CREATED });
    await plant(repo, '.planning/work/done/2026-09/SIG-5.md', closed('SIG-5'));
    commitAll(repo, 'seed');

    await expectCode(reopenItem(repo, 'SIG-4', { by: 'b', reason: 'r', at: AT }), 'CONFLICT', /not closed/);
    await expectCode(reopenItem(repo, 'SIG-5', { by: 'b', at: AT }), 'SCHEMA', /needs a reason/);
    await expectCode(reopenItem(repo, 'SIG-5', { by: 'b', reason: '  ', at: AT }), 'SCHEMA', /needs a reason/);
    await expectCode(reopenItem(repo, 'SIG-5', { reason: 'r', at: AT }), 'SCHEMA', /history\[0\]\.reopened_by is required/);
    expect(getItem(repo, 'SIG-5').path).toBe('.planning/work/done/2026-09/SIG-5.md');
  });

  it('close → reopen → close → reopen keeps both closes, oldest first', async () => {
    initRepo(repo);
    await storeOn(repo);
    await plant(repo, '.planning/work/done/2026-09/SIG-6.md', closed('SIG-6'));
    commitAll(repo, 'seed');

    await reopenItem(repo, 'SIG-6', { by: 'a', reason: 'first', at: AT });
    await closeItem(repo, 'SIG-6', { reason: 'stale', by: 'c', at: '2026-10-02T00:00:00.000Z' });
    const r = await reopenItem(repo, 'SIG-6', { by: 'd', reason: 'second', at: '2026-10-05T00:00:00.000Z' });

    expect(r.item.history.map((h) => [h.reason, h.reopen_reason])).toEqual([['fixed', 'first'], ['stale', 'second']]);
    expect(r.item.history[1]).toEqual({ reason: 'stale', by: 'c', at: '2026-10-02T00:00:00.000Z',
      reopened_at: '2026-10-05T00:00:00.000Z', reopened_by: 'd', reopen_reason: 'second' });
    expect(parseItem(await readFile(join(repo, r.to), 'utf-8')).errors).toEqual([]);
  });

  it('rewrites relative links from done/YYYY-MM/ depth to backlog/ depth', async () => {
    initRepo(repo);
    await storeOn(repo);
    await plant(repo, '.planning/work/done/2026-09/SIG-7.md', closed('SIG-7'), 'See [a](../../../../analysis/A.md).\n');
    commitAll(repo, 'seed');

    const r = await reopenItem(repo, 'SIG-7', { by: 'b', reason: 'r', at: AT });
    expect(parseItem(await readFile(join(repo, r.to), 'utf-8')).body).toBe('See [a](../../../analysis/A.md).\n');
  });

  it('a failed write rewinds: tracked file back where it started, bytes and index unchanged', async () => {
    initRepo(repo);
    await storeOn(repo);
    const rel = '.planning/work/done/2026-09/SIG-8.md';
    await plant(repo, rel, closed('SIG-8'));
    commitAll(repo, 'seed');
    const before = await readFile(join(repo, rel), 'utf-8');
    const statusBefore = git(repo, ['status', '--porcelain']);

    const renameFn = async () => {
      throw new Error('disk full');
    };
    await expect(reopenItem(repo, 'SIG-8', { by: 'b', reason: 'r', at: AT }, { renameFn })).rejects.toThrow(/disk full/);
    expect(await readFile(join(repo, rel), 'utf-8')).toBe(before);
    expect(existsSync(join(repo, '.planning/work/backlog/SIG-8.md'))).toBe(false);
    expect(git(repo, ['status', '--porcelain'])).toBe(statusBefore);
  });

  it('never lowers the count of item files — successes and refusals alike (AC-3.4)', async () => {
    initRepo(repo);
    await storeOn(repo);
    await plant(repo, '.planning/work/done/2026-09/SIG-1.md', closed('SIG-1'));
    await plant(repo, '.planning/work/backlog/SIG-2.md', { id: 'SIG-2', type: 'BUG', status: 'T', created: CREATED });
    await plant(repo, '.planning/archive/epics/M6.E1/SIG-3.md', closed('SIG-3'));
    commitAll(repo, 'seed');
    const attempt = async (p) => {
      try {
        await p;
      } catch {
        // refusals are part of the run
      }
      expect(countItemFiles(repo)).toBe(3);
    };
    await attempt(reopenItem(repo, 'SIG-1', { by: 'b', at: AT }));
    await attempt(reopenItem(repo, 'SIG-2', { by: 'b', reason: 'r', at: AT }));
    await attempt(reopenItem(repo, 'SIG-3', { by: 'b', reason: 'r', at: AT }));
    await attempt(reopenItem(repo, 'SIG-404', { by: 'b', reason: 'r', at: AT }));
    await attempt(reopenItem(repo, 'SIG-1', { by: 'b', reason: 'r', at: AT }, { renameFn: async () => { throw new Error('x'); } }));
    await attempt(reopenItem(repo, 'SIG-1', { by: 'b', reason: 'r', at: AT }));
    expect(getItem(repo, 'SIG-1').item.status).toBe('T');
  });
});
