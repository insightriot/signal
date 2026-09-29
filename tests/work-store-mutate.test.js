// Tests for the work store's mutations (M6.E11.S3.t3.1, FR-5, AC-3.4, AC-5.2, AC-5.4, NFR path safety).
// See .planning/M6.E11-VALIDATION.md rows AC-3.4, AC-5.2, AC-5.4.
//
// Real temp git repos, as in work-id.test.js: "history follows the file" and
// "a failed write leaves the index where it was" are claims about what git
// reports, which a mocked execFn would satisfy by construction.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import {
  newItem,
  getItem,
  moveItem,
  closeItem,
  WORK_LOCK_REL,
} from '../plugin/tools/lib/work-ops.js';
import { parseItem, stringifyItem, WorkStoreError } from '../plugin/tools/lib/work-item.js';
import { parseItemFileName, walkFiles, checkStore } from '../plugin/tools/lib/work-store.js';
import { GENERATED_MARKER } from '../plugin/tools/lib/work-generate.js';
import { withStateLock } from '../plugin/tools/lib/state.js';

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
async function plantItem(dir, folder, item, body = 'The words.\n') {
  await put(dir, `.planning/work/${folder}/${item.id}.md`, stringifyItem(item, body));
}
const CREATED = { at: '2026-09-01T00:00:00.000Z', by: 'brett' };
const AT = '2026-09-29T12:00:00.000Z';

function countItemFiles(dir) {
  return [...walkFiles(join(dir, '.planning', 'work')), ...walkFiles(join(dir, '.planning', 'archive', 'epics'))]
    .filter((p) => parseItemFileName(basename(p))).length;
}

async function expectCode(promiseOrFn, code, pattern) {
  let err;
  try {
    await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
  } catch (e) {
    err = e;
  }
  expect(err, `expected a ${code} error`).toBeInstanceOf(WorkStoreError);
  expect(err.code).toBe(code);
  if (pattern) expect(err.message).toMatch(pattern);
  return err;
}

let root;
let repo;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-work-mut-'));
  repo = join(root, 'repo');
  await mkdir(repo);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('store off', () => {
  // The fix it names is the migration, not a hand-made WORK.md (REVIEW I1).
  it('every mutation refuses with CONFIG, says how to turn the store on, and creates nothing', async () => {
    await mkdir(join(repo, '.planning'), { recursive: true });
    await expectCode(newItem(repo, { title: 'x', by: 'b' }), 'CONFIG', /WORK\.md[\s\S]*work-migrate\.mjs/);
    await expectCode(moveItem(repo, 'SIG-1', { status: 'T' }), 'CONFIG', /work-migrate\.mjs/);
    await expectCode(closeItem(repo, 'SIG-1', { reason: 'stale', by: 'b' }), 'CONFIG', /work-migrate\.mjs/);
    expect(() => getItem(repo, 'SIG-1')).toThrow(WorkStoreError);
    expect(existsSync(join(repo, '.planning', 'work'))).toBe(false);
  });
});

describe('newItem', () => {
  it('writes inbox/{id}.md with status N, created, the body verbatim, and regenerates the lists', async () => {
    initRepo(repo);
    await storeOn(repo);
    const item = await newItem(repo, { title: 'A thing', body: 'Exact words.\n', source: '/sig:add', by: 'brett', at: AT });
    expect(item).toMatchObject({ id: 'SIG-1', type: 'NEW', status: 'N', title: 'A thing', created: { at: AT, by: 'brett' } });
    const text = await readFile(join(repo, '.planning/work/inbox/SIG-1.md'), 'utf-8');
    const parsed = parseItem(text);
    expect(parsed.errors).toEqual([]);
    expect(parsed.body).toBe('Exact words.\n');
    const inbox = await readFile(join(repo, '.planning/ISSUES-INBOX.md'), 'utf-8');
    expect(inbox.split('\n')[0]).toBe(GENERATED_MARKER);
    expect(inbox).toContain('SIG-1');
  });

  it('allocates past every existing ID', async () => {
    initRepo(repo);
    await storeOn(repo);
    await plantItem(repo, 'backlog', { id: 'SIG-7', type: 'FEAT', status: 'T', created: CREATED });
    const item = await newItem(repo, { title: 'next', by: 'b', at: AT });
    expect(item.id).toBe('SIG-8');
  });

  it('refuses an invalid item before writing (no created.by)', async () => {
    initRepo(repo);
    await storeOn(repo);
    await expectCode(newItem(repo, { title: 'x', at: AT }), 'SCHEMA', /created\.by/);
    expect(countItemFiles(repo)).toBe(0);
  });

  it('rewrites a body link written from .planning/ to the inbox depth', async () => {
    initRepo(repo);
    await storeOn(repo);
    await newItem(repo, { title: 'l', body: 'See [a](../analysis/A.md).\n', by: 'b', at: AT });
    const { body } = getItem(repo, 'SIG-1');
    expect(body).toBe('See [a](../../../analysis/A.md).\n');
  });

  it('is callable while withStateLock is held (separate `work` lock, D-M6E11-27)', async () => {
    initRepo(repo);
    await storeOn(repo);
    const item = await withStateLock(repo, () => newItem(repo, { title: 'inside', by: 'b', at: AT }));
    expect(item.id).toBe('SIG-1');
    expect(existsSync(join(repo, WORK_LOCK_REL))).toBe(false); // released
  });

  it('refuses while another work-store mutation holds the lock', async () => {
    initRepo(repo);
    await storeOn(repo);
    await put(repo, WORK_LOCK_REL, `999\n${Date.now()}\n`);
    await expect(newItem(repo, { title: 'x', by: 'b', at: AT })).rejects.toThrow(/work store/);
    expect(countItemFiles(repo)).toBe(0);
  });

  // REVIEW I4: a mutation runs for longer than the old 5 s default (git log
  // --all plus a full regeneration), so a lock 10 s old is still live.
  it('treats a 10-second-old work lock as held, not stale (TTL WORK_LOCK_TTL_MS)', async () => {
    initRepo(repo);
    await storeOn(repo);
    await put(repo, WORK_LOCK_REL, `999\n${Date.now() - 10_000}\n`);
    await expect(newItem(repo, { title: 'x', by: 'b', at: AT })).rejects.toThrow(/work store/);
    expect(countItemFiles(repo)).toBe(0);
  });

  it('does not delete a lock another holder took while it ran (REVIEW I4)', async () => {
    initRepo(repo);
    await storeOn(repo);
    const thief = `4242\n${Date.now()}\nsomeone-else\n`;
    // The seam runs inside the lock: simulate expiry + a second holder taking it.
    const { rename } = await import('node:fs/promises');
    const renameFn = async (from, to) => {
      await writeFile(join(repo, WORK_LOCK_REL), thief, 'utf-8');
      return rename(from, to);
    };
    await newItem(repo, { title: 'x', by: 'b', at: AT }, { renameFn });
    expect(await readFile(join(repo, WORK_LOCK_REL), 'utf-8')).toBe(thief);
  });
});

describe('getItem — lookup by the front only (AC-2.3)', () => {
  beforeEach(async () => {
    await mkdir(repo, { recursive: true });
    await storeOn(repo);
    await plantItem(repo, 'backlog', { id: 'SIG-412', type: 'BUG', status: 'T', created: CREATED });
  });

  it('finds by ID', () => {
    const r = getItem(repo, 'SIG-412');
    expect(r.item.id).toBe('SIG-412');
    expect(r.path).toBe('.planning/work/backlog/SIG-412.md');
    expect(r.label).toBe('SIG-412-BUG-T');
  });

  it('finds by label, reading the front and ignoring the suffix — even a stale one', () => {
    expect(getItem(repo, 'SIG-412-BUG-T').item.id).toBe('SIG-412');
    expect(getItem(repo, 'SIG-412-FEAT-C').item.id).toBe('SIG-412');
  });

  it('finds an item archived with its Epic', async () => {
    await put(repo, '.planning/archive/epics/M6.E1/SIG-9.md', stringifyItem({
      id: 'SIG-9', type: 'FEAT', status: 'C', created: CREATED, close: { reason: 'fixed', by: 'b', at: AT },
    }, 'x\n'));
    expect(getItem(repo, 'SIG-9').path).toBe('.planning/archive/epics/M6.E1/SIG-9.md');
  });

  it('NOT_FOUND for an absent ID; SCHEMA for something that is not an ID', () => {
    expect(() => getItem(repo, 'SIG-413')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(() => getItem(repo, '../SIG-412')).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
    expect(() => getItem(repo, 'SIG-412/x')).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
  });
});

describe('moveItem — AC-5.2', () => {
  it('tracked file: git mv (history follows), frontmatter updated, lists regenerated', async () => {
    initRepo(repo);
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
    commitAll(repo, 'seed');

    const calls = [];
    const execFn = (cmd, args, o) => {
      calls.push(args);
      return execFileSync(cmd, args, o);
    };
    const r = await moveItem(repo, 'SIG-1', { status: 'T' }, { execFn });
    expect(r.from).toBe('.planning/work/inbox/SIG-1.md');
    expect(r.to).toBe('.planning/work/backlog/SIG-1.md');
    expect(calls.some((a) => a.includes('mv'))).toBe(true);
    expect(calls.flat()).not.toContain('-k');

    expect(existsSync(join(repo, '.planning/work/inbox/SIG-1.md'))).toBe(false);
    expect(getItem(repo, 'SIG-1').item.status).toBe('T');
    // The index knows about the rename (git mv), not a delete + an untracked file.
    const status = git(repo, ['status', '--porcelain']);
    expect(status).toMatch(/^R. .*inbox\/SIG-1\.md -> .*backlog\/SIG-1\.md/m);
    commitAll(repo, 'move');
    const log = git(repo, ['log', '--follow', '--format=%s', '--', '.planning/work/backlog/SIG-1.md']);
    expect(log).toContain('seed');
    expect(checkStore(repo)).toEqual([]);
  });

  // A path read from disk must reach git as a literal path, never a pattern:
  // `--literal-pathspecs` goes before the subcommand, on every call that
  // names an item file.
  it('git ls-files and git mv get the item path as a literal pathspec', async () => {
    initRepo(repo);
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
    commitAll(repo, 'seed');
    const calls = [];
    const execFn = (cmd, args, o) => {
      calls.push(args);
      return execFileSync(cmd, args, o);
    };
    await moveItem(repo, 'SIG-1', { status: 'T' }, { execFn });
    const pathCalls = calls.filter((a) => a.includes('ls-files') || a.includes('mv'));
    expect(pathCalls.map((a) => a.find((x) => !x.startsWith('-')))).toEqual(['ls-files', 'mv']);
    for (const a of pathCalls) expect(a[0], a.join(' ')).toBe('--literal-pathspecs');
  });

  it('untracked file in a repo: plain rename', async () => {
    initRepo(repo);
    await storeOn(repo);
    commitAll(repo, 'seed');
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
    await moveItem(repo, 'SIG-1', { status: 'T' });
    expect(getItem(repo, 'SIG-1').path).toBe('.planning/work/backlog/SIG-1.md');
    expect(git(repo, ['ls-files', '.planning/work'])).not.toMatch(/SIG-1/);
  });

  it('no git repo at all: plain rename', async () => {
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
    await moveItem(repo, 'SIG-1', { status: 'T' });
    expect(getItem(repo, 'SIG-1').item.status).toBe('T');
  });

  it('dirty tracked file: moved with its uncommitted edits intact', async () => {
    initRepo(repo);
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED }, 'old\n');
    commitAll(repo, 'seed');
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED }, 'edited, not committed\n');
    await moveItem(repo, 'SIG-1', { status: 'T' });
    expect(getItem(repo, 'SIG-1').body).toBe('edited, not committed\n');
  });

  it('into an Epic folder, and Q → P inside it without moving', async () => {
    await storeOn(repo);
    await plantItem(repo, 'backlog', { id: 'SIG-1', type: 'FEAT', status: 'T', created: CREATED });
    const a = await moveItem(repo, 'SIG-1', { status: 'Q', epic: 'M6.E11' });
    expect(a.to).toBe('.planning/work/epics/M6.E11/SIG-1.md');
    const b = await moveItem(repo, 'SIG-1', { status: 'P' });
    expect(b.to).toBe('.planning/work/epics/M6.E11/SIG-1.md');
    expect(getItem(repo, 'SIG-1').item.status).toBe('P');
  });

  it('validates before touching disk: Q without an Epic, epic on T, sprint, status C', async () => {
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
    const before = await readFile(join(repo, '.planning/work/inbox/SIG-1.md'), 'utf-8');
    await expectCode(moveItem(repo, 'SIG-1', { status: 'Q' }), 'SCHEMA', /Epic/);
    await expectCode(moveItem(repo, 'SIG-1', { status: 'T', epic: 'M6.E11' }), 'SCHEMA', /epic/i);
    await expectCode(moveItem(repo, 'SIG-1', { status: 'T', sprint: 'S1' }), 'SCHEMA', /sprint/i);
    await expectCode(moveItem(repo, 'SIG-1', { status: 'C' }), 'SCHEMA', /closeItem|close/);
    await expectCode(moveItem(repo, 'SIG-1', { status: 'X' }), 'SCHEMA', /status/);
    expect(await readFile(join(repo, '.planning/work/inbox/SIG-1.md'), 'utf-8')).toBe(before);
  });

  it('destination exists → CONFLICT, nothing moved (a link the walk does not count as an item)', async () => {
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
    await put(repo, '.planning/other.md', 'someone else\n');
    await mkdir(join(repo, '.planning/work/backlog'), { recursive: true });
    await symlink(join(repo, '.planning/other.md'), join(repo, '.planning/work/backlog/SIG-1.md'));
    await expectCode(moveItem(repo, 'SIG-1', { status: 'T' }), 'CONFLICT', /backlog\/SIG-1\.md/);
    expect(existsSync(join(repo, '.planning/work/inbox/SIG-1.md'))).toBe(true);
    expect(await readFile(join(repo, '.planning/other.md'), 'utf-8')).toBe('someone else\n');
  });

  it('two files with one ID → CONFLICT naming both; the store refuses to pick one', async () => {
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
    await plantItem(repo, 'backlog', { id: 'SIG-1', type: 'FEAT', status: 'T', created: CREATED });
    await expectCode(moveItem(repo, 'SIG-1', { status: 'T' }), 'CONFLICT', /inbox\/SIG-1\.md[\s\S]*backlog\/SIG-1\.md|backlog\/SIG-1\.md[\s\S]*inbox\/SIG-1\.md/);
    expect(countItemFiles(repo)).toBe(2);
  });

  it('a failed write rewinds: tracked file back where it started, bytes and index unchanged', async () => {
    initRepo(repo);
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
    commitAll(repo, 'seed');
    const src = join(repo, '.planning/work/inbox/SIG-1.md');
    const bytes = await readFile(src, 'utf-8');
    const statusBefore = git(repo, ['status', '--porcelain']);

    const renameFn = async () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    };
    await expect(moveItem(repo, 'SIG-1', { status: 'T' }, { renameFn })).rejects.toThrow(/disk full/);

    expect(await readFile(src, 'utf-8')).toBe(bytes);
    expect(existsSync(join(repo, '.planning/work/backlog'))).toBe(false); // the folder it made is gone
    expect(git(repo, ['status', '--porcelain'])).toBe(statusBefore);
  });

  it('a failed write rewinds an untracked file too', async () => {
    await storeOn(repo);
    await plantItem(repo, 'backlog', { id: 'SIG-1', type: 'FEAT', status: 'T', created: CREATED });
    const src = join(repo, '.planning/work/backlog/SIG-1.md');
    const bytes = await readFile(src, 'utf-8');
    const renameFn = async () => {
      throw new Error('boom');
    };
    await expect(moveItem(repo, 'SIG-1', { status: 'Q', epic: 'M6.E11' }, { renameFn })).rejects.toThrow(/boom/);
    expect(await readFile(src, 'utf-8')).toBe(bytes);
    expect(existsSync(join(repo, '.planning/work/epics'))).toBe(false);
  });

  it('links resolve after a move two levels deep (D-M6E11-22)', async () => {
    await storeOn(repo);
    await put(repo, '.planning/analysis-note.md', 'target\n');
    await put(repo, 'analysis/A.md', 'target\n');
    // Written in inbox/: two levels below .planning/.
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED },
      'See [n](../../analysis-note.md) and [a](../../../analysis/A.md) and `[code](../../x.md)`.\n');
    await moveItem(repo, 'SIG-1', { status: 'T' });
    await moveItem(repo, 'SIG-1', { status: 'Q', epic: 'M6.E11' });
    const r = getItem(repo, 'SIG-1');
    expect(r.path).toBe('.planning/work/epics/M6.E11/SIG-1.md');
    const dir = dirname(join(repo, r.path));
    const targets = [...r.body.matchAll(/(?<!`)\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
    expect(targets).toEqual(['../../../analysis-note.md', '../../../../analysis/A.md']);
    for (const t of targets) expect(existsSync(join(dir, t))).toBe(true);
    expect(r.body).toContain('`[code](../../x.md)`'); // code is not prose
  });
});

describe('closeItem — AC-5.4', () => {
  beforeEach(async () => {
    await storeOn(repo);
    await plantItem(repo, 'backlog', { id: 'SIG-1', type: 'BUG', status: 'T', created: CREATED });
    await plantItem(repo, 'backlog', { id: 'SIG-2', type: 'BUG', status: 'T', created: CREATED });
  });

  it('refuses without a reason, and with an unknown one', async () => {
    await expectCode(closeItem(repo, 'SIG-1', { by: 'b' }), 'SCHEMA', /reason/);
    await expectCode(closeItem(repo, 'SIG-1', { reason: 'done', by: 'b' }), 'SCHEMA', /reason/);
    expect(getItem(repo, 'SIG-1').item.status).toBe('T');
  });

  it('fixed without proof records `none given`, not an empty field; lands in done/YYYY-MM/', async () => {
    const r = await closeItem(repo, 'SIG-1', { reason: 'fixed', by: 'brett', at: AT });
    expect(r.to).toBe('.planning/work/done/2026-09/SIG-1.md');
    expect(getItem(repo, 'SIG-1').item.close).toEqual({ reason: 'fixed', by: 'brett', at: AT, proof: 'none given' });
    expect(getItem(repo, 'SIG-1').item.status).toBe('C');
  });

  it('fixed with proof records it', async () => {
    await closeItem(repo, 'SIG-1', { reason: 'fixed', by: 'b', at: AT, proof: 'commit abc123' });
    expect(getItem(repo, 'SIG-1').item.close.proof).toBe('commit abc123');
  });

  it('dup requires dup_of, and dup_of must resolve to another existing item', async () => {
    await expectCode(closeItem(repo, 'SIG-1', { reason: 'dup', by: 'b', at: AT }), 'SCHEMA', /dup_of/);
    await expectCode(closeItem(repo, 'SIG-1', { reason: 'dup', by: 'b', at: AT, dup_of: 'SIG-99' }), 'NOT_FOUND');
    await expectCode(closeItem(repo, 'SIG-1', { reason: 'dup', by: 'b', at: AT, dup_of: 'SIG-1' }), 'SCHEMA');
    await closeItem(repo, 'SIG-1', { reason: 'dup', by: 'b', at: AT, dup_of: 'SIG-2' });
    expect(getItem(repo, 'SIG-1').item.close.dup_of).toBe('SIG-2');
  });

  it('refuses without by, and refuses to close twice', async () => {
    await expectCode(closeItem(repo, 'SIG-1', { reason: 'stale', at: AT }), 'SCHEMA', /by/);
    await closeItem(repo, 'SIG-1', { reason: 'stale', by: 'b', at: AT });
    await expectCode(closeItem(repo, 'SIG-1', { reason: 'stale', by: 'b', at: AT }), 'CONFLICT', /closed/);
  });

  it('closeItems refuses the same item twice before writing anything', async () => {
    const { closeItems } = await import('../plugin/tools/lib/work-ops.js');
    const before = await readFile(join(repo, '.planning/work/backlog/SIG-1.md'), 'utf-8');
    await expectCode(closeItems(repo, [{ id: 'SIG-1', reason: 'stale', by: 'b', at: AT }, { id: 'SIG-1-BUG-T', reason: 'stale', by: 'b', at: AT }]),
      'SCHEMA', /more than once/);
    expect(getItem(repo, 'SIG-1').item.status).not.toBe('C');
    expect(await readFile(join(repo, '.planning/work/backlog/SIG-1.md'), 'utf-8')).toBe(before);
  });

  // The byte-exact undo was only tested on untracked files (plain renames).
  // With TRACKED files the moves are `git mv`, so undo must also put the
  // index back: no rename may be left staged.
  it('closeItems on TRACKED files: the second git mv fails → every file back where it was, byte-identical, no rename staged', async () => {
    const { closeItems } = await import('../plugin/tools/lib/work-ops.js');
    const tracked = join(root, 'tracked');
    await mkdir(tracked);
    initRepo(tracked);
    await storeOn(tracked);
    await plantItem(tracked, 'backlog', { id: 'SIG-1', type: 'BUG', status: 'T', created: CREATED }, 'One. See [x](../../A.md).\n');
    await plantItem(tracked, 'backlog', { id: 'SIG-2', type: 'FEAT', status: 'T', created: CREATED }, 'Two.\n');
    commitAll(tracked, 'seed');
    const rels = ['.planning/work/backlog/SIG-1.md', '.planning/work/backlog/SIG-2.md'];
    const before = await Promise.all(rels.map((r) => readFile(join(tracked, r))));
    expect(git(tracked, ['status', '--porcelain'])).toBe('');

    let mvs = 0;
    const execFn = (cmd, args, o) => {
      if (args.includes('mv') && ++mvs === 2) throw new Error('fatal: second move refused');
      return execFileSync(cmd, args, o);
    };
    await expectCode(closeItems(tracked, [
      { id: 'SIG-1', reason: 'fixed', by: 'b', at: AT, proof: 'abc1234' },
      { id: 'SIG-2', reason: 'stale', by: 'b', at: AT },
    ], { execFn }), 'IO', /second move refused/);

    for (let i = 0; i < rels.length; i++) {
      expect(await readFile(join(tracked, rels[i])), rels[i]).toEqual(before[i]);
    }
    expect(existsSync(join(tracked, '.planning/work/done'))).toBe(false);
    expect(git(tracked, ['status', '--porcelain'])).toBe('');
    expect(git(tracked, ['diff', '--cached', '--name-status'])).toBe('');
    expect(checkStore(tracked)).toEqual([]);
    // And the first close really ran before the second failed: forward SIG-1,
    // forward SIG-2 (refused), SIG-1 put back with git mv.
    expect(mvs).toBe(3);
  });

  it('the generated BUGS.md shows the closed bug', async () => {
    await closeItem(repo, 'SIG-1', { reason: 'fixed', by: 'b', at: AT, proof: 'PR #1' });
    const bugs = await readFile(join(repo, '.planning/BUGS.md'), 'utf-8');
    expect(bugs).toMatch(/\| B1 \| `fixed` \|/);
  });
});

describe('path safety (NFR)', () => {
  beforeEach(async () => {
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
  });

  it.each(['..', '../x', 'M6/E1', 'M6.E1/../../x', 'm6.e1'])('Epic id %s is refused', async (epic) => {
    await expectCode(moveItem(repo, 'SIG-1', { status: 'Q', epic }), 'SCHEMA', /Epic/);
  });

  it.each(['../SIG-1', 'SIG-1/..', 'SIG-01', '/etc/passwd'])('item id %s is refused', async (id) => {
    await expectCode(moveItem(repo, id, { status: 'T' }), 'SCHEMA');
    await expectCode(closeItem(repo, id, { reason: 'stale', by: 'b' }), 'SCHEMA');
  });

  it('a symlinked status folder that escapes .planning/ is refused, and nothing moves', async () => {
    const outside = join(root, 'outside');
    await mkdir(outside);
    await symlink(outside, join(repo, '.planning/work/backlog'));
    await expect(moveItem(repo, 'SIG-1', { status: 'T' })).rejects.toThrow(/escapes/);
    expect(existsSync(join(repo, '.planning/work/inbox/SIG-1.md'))).toBe(true);
    expect(readdirSync(outside)).toEqual([]);
  });

  it('a symlinked Epic folder that escapes is refused', async () => {
    const outside = join(root, 'outside-epic');
    await mkdir(outside);
    await mkdir(join(repo, '.planning/work/epics'), { recursive: true });
    await symlink(outside, join(repo, '.planning/work/epics/M6.E11'));
    await expect(moveItem(repo, 'SIG-1', { status: 'Q', epic: 'M6.E11' })).rejects.toThrow(/escapes/);
    expect(readdirSync(outside)).toEqual([]);
  });

  it('newItem refuses a symlinked inbox that escapes', async () => {
    const outside = join(root, 'outside-inbox');
    await mkdir(outside);
    await rm(join(repo, '.planning/work/inbox'), { recursive: true });
    await symlink(outside, join(repo, '.planning/work/inbox'));
    await expect(newItem(repo, { title: 'x', by: 'b', at: AT })).rejects.toThrow(/escapes/);
    expect(readdirSync(outside)).toEqual([]);
  });
});

// Callers dispatch on `code`, never on message text — so nothing a store
// operation throws may be a bare Error (REVIEW pass 1, Suggestions). The
// message text is kept; only the class and code are added.
describe('every failure is a WorkStoreError with a code', () => {
  it('lock contention → LOCKED, and nothing is written', async () => {
    await storeOn(repo);
    const { acquireLock: take } = await import('../plugin/tools/lib/file-lock.js');
    const lock = await take(join(repo, WORK_LOCK_REL), { ttlMs: 120_000 });
    try {
      await expectCode(newItem(repo, { title: 'x', by: 'b', at: AT }), 'LOCKED', /running/);
      expect(existsSync(join(repo, '.planning/work/inbox'))).toBe(false);
    } finally {
      await lock.released();
    }
  });

  it('a git failure reading history for the next ID → IO', async () => {
    initRepo(repo);
    await storeOn(repo);
    commitAll(repo, 'seed');
    const execFn = (cmd, args, o) => {
      if (args[0] === 'log' || args[0] === 'ls-tree') throw new Error('fatal: bad object');
      return execFileSync(cmd, args, o);
    };
    await expectCode(newItem(repo, { title: 'x', by: 'b', at: AT }, { execFn }), 'IO', /could not read git history/);
  });

  it('a failed git mv → IO, and the item is where it was', async () => {
    initRepo(repo);
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
    commitAll(repo, 'seed');
    const execFn = (cmd, args, o) => {
      if (args.includes('mv')) throw new Error('fatal: not under version control');
      return execFileSync(cmd, args, o);
    };
    await expectCode(moveItem(repo, 'SIG-1', { status: 'T' }, { execFn }), 'IO', /not under version control/);
    expect(existsSync(join(repo, '.planning/work/inbox/SIG-1.md'))).toBe(true);
  });

  it('a failed write → IO, with the underlying message', async () => {
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
    const renameFn = async () => {
      throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
    };
    await expectCode(moveItem(repo, 'SIG-1', { status: 'T' }, { renameFn }), 'IO', /disk full/);
    await expectCode(newItem(repo, { title: 'x', by: 'b', at: AT }, { renameFn }), 'IO', /disk full/);
  });

  it('a symlinked folder escaping .planning/ → CONFLICT, message kept', async () => {
    await storeOn(repo);
    await plantItem(repo, 'inbox', { id: 'SIG-1', type: 'FEAT', status: 'N', created: CREATED });
    const outside = join(root, 'outside');
    await mkdir(outside);
    await symlink(outside, join(repo, '.planning/work/backlog'));
    await expectCode(moveItem(repo, 'SIG-1', { status: 'T' }), 'CONFLICT', /escapes/);
  });

  it('regeneration failing on I/O after a good mutation → IO, saying the change stood', async () => {
    await storeOn(repo);
    await mkdir(join(repo, '.planning/work/WATCHLIST.md'), { recursive: true }); // a folder: reading it fails
    const err = await expectCode(newItem(repo, { title: 'x', by: 'b', at: AT }), 'IO', /SIG-1 was written[\s\S]*lists were not regenerated/);
    expect(err.written).toEqual(['.planning/work/inbox/SIG-1.md']);
    expect(existsSync(join(repo, '.planning/work/inbox/SIG-1.md'))).toBe(true);
  });
});

describe('AC-3.4 — no operation ever lowers the count of item files', () => {
  // Every store mutation, successes and failures, each with the outcome it is
  // EXPECTED to have: 'ok', or the WorkStoreError code it must throw. An
  // attempt that fails for another reason fails the test — it does not count
  // as a "failure that is part of the run" (REVIEW pass 1).
  it('holds across every operation, failures included', async () => {
    const { newItems, applyTriage, reopenItem, closeEpic } = await import('../plugin/tools/lib/work-ops.js');
    initRepo(repo);
    await storeOn(repo);
    await plantItem(repo, 'backlog', { id: 'SIG-1', type: 'FEAT', status: 'T', created: CREATED });
    commitAll(repo, 'seed');

    let last = countItemFiles(repo);
    const outcomes = [];
    const attempt = async (expected, label, fn) => {
      let got = 'ok';
      try {
        await fn();
      } catch (err) {
        got = err instanceof WorkStoreError ? err.code : `raw ${err?.message}`;
      }
      outcomes.push([label, got]);
      expect(got, label).toBe(expected);
      const now = countItemFiles(repo);
      expect(now, label).toBeGreaterThanOrEqual(last);
      last = now;
    };
    const failRename = async () => {
      throw new Error('boom');
    };
    const { rename } = await import('node:fs/promises');
    const failOn = (name) => async (from, to) => {
      if (to.endsWith(name)) throw new Error('boom');
      return rename(from, to);
    };

    await attempt('ok', 'newItem', () => newItem(repo, { title: 'a', by: 'b', at: AT })); // SIG-2
    await attempt('SCHEMA', 'newItem without by', () => newItem(repo, { title: 'no by', at: AT }));
    await attempt('ok', 'getItem', () => getItem(repo, 'SIG-2'));
    await attempt('NOT_FOUND', 'getItem missing', () => getItem(repo, 'SIG-404'));
    await attempt('IO', 'moveItem, write fails', () => moveItem(repo, 'SIG-2', { status: 'T' }, { renameFn: failRename }));
    await attempt('ok', 'moveItem → T', () => moveItem(repo, 'SIG-2', { status: 'T' }));
    await attempt('SCHEMA', 'moveItem bad epic', () => moveItem(repo, 'SIG-2', { status: 'Q', epic: '../x' }));
    await attempt('ok', 'moveItem → Q M6.E11', () => moveItem(repo, 'SIG-2', { status: 'Q', epic: 'M6.E11' }));
    await attempt('ok', 'moveItem → P', () => moveItem(repo, 'SIG-2', { status: 'P' }));
    await attempt('SCHEMA', 'closeItem no reason', () => closeItem(repo, 'SIG-1', { by: 'b' }));
    await attempt('IO', 'closeItem, write fails', () => closeItem(repo, 'SIG-1', { reason: 'fixed', by: 'b', at: AT }, { renameFn: failRename }));
    await attempt('ok', 'closeItem dup', () => closeItem(repo, 'SIG-1', { reason: 'dup', by: 'b', at: AT, dup_of: 'SIG-2' }));
    await attempt('ok', 'closeItem in Epic', () => closeItem(repo, 'SIG-2', { reason: 'fixed', by: 'b', at: AT }));
    await attempt('CONFLICT', 'closeItem twice', () => closeItem(repo, 'SIG-2', { reason: 'fixed', by: 'b', at: AT }));

    await attempt('ok', 'newItems', () => newItems(repo, [{ title: 'c', by: 'b', at: AT }, { title: 'd', by: 'b', at: AT }])); // SIG-3, SIG-4
    await attempt('IO', 'newItems, second write fails', () => newItems(repo, [{ title: 'e', by: 'b', at: AT }, { title: 'f', by: 'b', at: AT }],
      { renameFn: failOn('SIG-6.md') }));
    await attempt('ok', 'applyTriage accept', () => applyTriage(repo, 'SIG-3', { accept: { type: 'FEAT' } }));
    await attempt('CONFLICT', 'applyTriage again', () => applyTriage(repo, 'SIG-3', { accept: { type: 'FEAT' } }));
    await attempt('ok', 'applyTriage reject', () => applyTriage(repo, 'SIG-4', { reject: 'checked: not true' }, { by: 'b', at: AT }));
    await attempt('NOT_FOUND', 'applyTriage missing', () => applyTriage(repo, 'SIG-404', { skip: true }));
    await attempt('SCHEMA', 'reopenItem no reason', () => reopenItem(repo, 'SIG-4', { by: 'b' }));
    await attempt('ok', 'reopenItem', () => reopenItem(repo, 'SIG-4', { by: 'b', reason: 'came back', at: AT }));
    await attempt('CONFLICT', 'reopenItem open item', () => reopenItem(repo, 'SIG-4', { by: 'b', reason: 'again', at: AT }));

    // closeEpic: tracked files (git mv), the second move forced to fail.
    commitAll(repo, 'before the Epic close');
    let mvs = 0;
    const failSecondMv = (cmd, args, o) => {
      if (args.includes('mv') && ++mvs === 2) throw new Error('fatal: boom');
      return execFileSync(cmd, args, o);
    };
    await attempt('IO', 'closeEpic, second move fails', () => closeEpic(repo, 'M6.E11', { by: 'b', at: AT }, { execFn: failSecondMv }));
    expect(mvs).toBeGreaterThanOrEqual(2);
    expect(existsSync(join(repo, '.planning/work/epics/M6.E11/SIG-2.md'))).toBe(true);
    await attempt('ok', 'closeEpic', () => closeEpic(repo, 'M6.E11', { by: 'b', at: AT }));
    await attempt('ok', 'closeEpic again (already archived)', () => closeEpic(repo, 'M6.E11', { by: 'b', at: AT }));
    await attempt('CONFLICT', 'reopenItem archived', () => reopenItem(repo, 'SIG-2', { by: 'b', reason: 'x', at: AT }));

    expect(outcomes).toHaveLength(27);
    expect(last).toBe(4);
    expect(checkStore(repo)).toEqual([]);
  });
});
