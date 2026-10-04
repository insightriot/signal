// confirmCloses (M6.E13.S2.t2.6, AC7.2, AC8.2). Temp git repos, real git.
// See .planning/M6.E13-VALIDATION.md rows AC7.2 and AC8.2.
//
// A fixed close is *closing* until its commit is an ancestor of the remote's
// default branch, read from local refs only (no fetch). Anything other than
// `git merge-base --is-ancestor` exiting 0 leaves it closing — fail-open,
// never guessed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord, checkEvents } from '../plugin/tools/lib/work-record.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-04T10:00:00.000Z';
const NOW = '2026-10-10T12:00:00.000Z';
const by = 'claude';
const created = { type: 'created', at: AT, by };
const request = (proof, at = AT) => ({ type: 'close_requested', at, by, reason: 'fixed', proof });
const rec = (id, events) => ({ id, type: 'BUG', title: `t ${id}`, events });

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-confirm-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

async function v2Store(dir, fixtures) {
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  for (const r of fixtures) await put(dir, records.recordPath(r.id), serializeRecord(r));
}

const read = async (dir, id) => JSON.parse(await readFile(join(dir, records.recordPath(id)), 'utf-8'));

// A bare remote with `commits` commits on main, and a clone of it (origin/HEAD set).
async function plantClone({ commits = 2, depth } = {}) {
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const work = join(root, 'work');
  await mkdir(seed, { recursive: true });
  g(root, 'init', '-q', '--bare', '-b', 'main', remote);
  g(seed, 'init', '-q', '-b', 'main');
  const shas = [];
  for (let i = 0; i < commits; i += 1) {
    g(seed, 'commit', '-q', '--allow-empty', '-m', `c${i}`);
    shas.push(g(seed, 'rev-parse', 'HEAD'));
  }
  g(seed, 'remote', 'add', 'origin', remote);
  g(seed, 'push', '-q', '-u', 'origin', 'main');
  g(root, 'clone', '-q', ...(depth ? ['--depth', String(depth), `file://${remote}`] : [remote]), work);
  return { work, shas };
}

describe('confirmCloses — the commit is checked against the default branch', () => {
  it('ancestor of origin/main → closed (reason fixed, proof copied, by confirmCloses), one event', async () => {
    const { work, shas } = await plantClone();
    await v2Store(work, [rec('SIG-1', [created, request(shas[0])]), rec('SIG-2', [created, request(shas[1].slice(0, 7))])]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out).toEqual({ confirmed: ['SIG-1', 'SIG-2'], stillClosing: [], stale: [] });
    const r = await read(work, 'SIG-1');
    expect(r.events).toEqual([
      created,
      request(shas[0]),
      { type: 'closed', at: NOW, by: 'confirmCloses', reason: 'fixed', proof: shas[0] },
    ]);
    expect(checkEvents(r)).toEqual([]);
    expect((await read(work, 'SIG-2')).events.at(-1).proof).toBe(shas[1].slice(0, 7));
  });

  it('a commit only on a local branch is not on the default branch → stays closing', async () => {
    const { work } = await plantClone();
    g(work, 'checkout', '-q', '-b', 'feature');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'unmerged');
    const sha = g(work, 'rev-parse', 'HEAD');
    await v2Store(work, [rec('SIG-1', [created, request(sha)])]);
    const before = snapshotTree(work);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out).toEqual({ confirmed: [], stillClosing: [{ id: 'SIG-1', reason: 'not-on-default-branch' }], stale: [] });
    expect(snapshotTree(work)).toEqual(before);
  });

  it('a local main ahead of origin/main does not count: the remote ref is the one compared', async () => {
    const { work } = await plantClone();
    g(work, 'commit', '-q', '--allow-empty', '-m', 'local only, on main');
    const sha = g(work, 'rev-parse', 'HEAD');
    await v2Store(work, [rec('SIG-1', [created, request(sha)])]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'not-on-default-branch' }]);
  });

  it('an unknown commit → stays closing', async () => {
    const { work } = await plantClone();
    await v2Store(work, [rec('SIG-1', [created, request('deadbeefcafe')])]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'unknown-commit' }]);
    expect((await read(work, 'SIG-1')).events).toHaveLength(2);
  });

  it('a repo with no remote → stays closing', async () => {
    const solo = join(root, 'solo');
    await mkdir(solo);
    g(solo, 'init', '-q', '-b', 'main');
    g(solo, 'commit', '-q', '--allow-empty', '-m', 'c');
    const sha = g(solo, 'rev-parse', 'HEAD');
    await v2Store(solo, [rec('SIG-1', [created, request(sha)])]);
    const out = await records.confirmCloses(solo, { now: NOW });
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'no-remote' }]);
  });

  it('a remote whose default branch cannot be resolved (origin/HEAD unset, no main/master) → stays closing', async () => {
    const { work, shas } = await plantClone();
    g(work, 'remote', 'set-head', 'origin', '--delete');
    g(work, 'branch', '-q', '-m', 'main', 'trunk');
    g(work, 'update-ref', '-d', 'refs/remotes/origin/main');
    await v2Store(work, [rec('SIG-1', [created, request(shas[0])])]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'no-default-branch' }]);
  });

  it('outside a git repo → stays closing', async () => {
    const plain = join(root, 'plain');
    await v2Store(plain, [rec('SIG-1', [created, request('0123abc')])]);
    const out = await records.confirmCloses(plain, { now: NOW });
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'not-a-repo' }]);
  });

  it('a shallow clone missing the commit → stays closing (history may be missing, never guessed)', async () => {
    const { work, shas } = await plantClone({ commits: 3, depth: 1 });
    expect(g(work, 'rev-parse', '--is-shallow-repository')).toBe('true');
    await v2Store(work, [rec('SIG-1', [created, request(shas[0])]), rec('SIG-2', [created, request(shas[2])])]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual(['SIG-2']); // the tip is present: it is its own ancestor
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'shallow' }]);
  });
});

describe('confirmCloses — the proof never reaches git as an option', () => {
  it('only a bare hex hash is passed, as <sha>^{commit} to rev-parse, then the resolved SHA to merge-base', async () => {
    const calls = [];
    const execFn = (cmd, args, o) => {
      calls.push(args);
      if (args[0] === 'rev-parse' && args.includes('--is-inside-work-tree')) return 'true\n';
      if (args[0] === 'remote') return 'origin\n';
      if (args[0] === 'rev-parse' && args.includes('origin/HEAD')) return 'origin/main\n';
      if (args[0] === 'rev-parse' && args.at(-1).endsWith('^{commit}')) return `${args.at(-1).slice(0, -9)}\n`;
      if (args[0] === 'rev-parse') return 'abc\n';
      if (args[0] === 'merge-base') return '';
      throw new Error(`unexpected git ${args.join(' ')} ${o?.cwd}`);
    };
    const { work, shas } = await plantClone();
    await v2Store(work, [rec('SIG-1', [created, request(shas[0])])]);
    await records.confirmCloses(work, { now: NOW, execFn });
    const resolve = calls.filter((a) => a.at(-1) === `${shas[0]}^{commit}`);
    expect(resolve).toEqual([['rev-parse', '--verify', '--quiet', '--end-of-options', `${shas[0]}^{commit}`]]);
    const mb = calls.filter((a) => a[0] === 'merge-base');
    expect(mb).toEqual([['merge-base', '--is-ancestor', shas[0], 'refs/remotes/origin/main']]);
  });

  it('a hand-written record with proof `--all` is broken (schema) and is never a candidate', async () => {
    const { work } = await plantClone();
    await v2Store(work, []);
    const bad = rec('SIG-1', [created, request('--all')]);
    await put(work, records.recordPath('SIG-1'), `${JSON.stringify(bad, null, 2)}\n`);
    const calls = [];
    const execFn = (cmd, args) => {
      calls.push(args);
      throw new Error('git must not run');
    };
    const out = await records.confirmCloses(work, { now: NOW, execFn });
    expect(out).toEqual({ confirmed: [], stillClosing: [], stale: [] });
    expect(calls.flat().some((a) => String(a).includes('--all'))).toBe(false);
  });
});

// REVIEW pass 1 suggestion: a record that breaks between the classification
// (outside the lock) and the write (under it) is skipped and reported, not a
// reason to abort every other confirmation.
describe('confirmCloses — a record broken under the lock', () => {
  it('is skipped and listed in stillClosing as unreadable; the others are confirmed', async () => {
    const { work, shas } = await plantClone();
    await v2Store(work, [rec('SIG-1', [created, request(shas[0])]), rec('SIG-2', [created, request(shas[1])])]);
    // The last git call before the lock is SIG-2's ancestry check: break its
    // record right after it, as a concurrent hand edit would.
    const execFn = (cmd, args, o) => {
      const out = execFileSync(cmd, args, o);
      if (args[0] === 'merge-base' && args.includes(shas[1])) writeFileSync(join(work, records.recordPath('SIG-2')), '{ broken\n');
      return out;
    };
    // The views refuse to regenerate while a record is broken (checkRecords
    // reports it); that is not what this test is about, so regeneration is a no-op.
    const out = await records.confirmCloses(work, { now: NOW, execFn, regenerate: async () => {} });
    expect(out.confirmed).toEqual(['SIG-1']);
    expect(out.stillClosing).toEqual([{ id: 'SIG-2', reason: 'unreadable' }]);
    expect((await read(work, 'SIG-1')).events.at(-1).type).toBe('closed');
  });
});

describe('confirmCloses — stale requests, and what it leaves alone', () => {
  it('returns items closing for more than 14 days (by the request\'s at, given now)', async () => {
    const { work } = await plantClone();
    await v2Store(work, [
      rec('SIG-1', [created, request('deadbeef01', '2026-09-20T00:00:00.000Z')]), // 20 days
      rec('SIG-2', [created, request('deadbeef02', '2026-09-27')]), // 13.5 days
      rec('SIG-3', [created, request('deadbeef03', '2026-09-01')]),
    ]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.stale).toEqual(['SIG-1', 'SIG-3']);
    expect(out.stillClosing.map((s) => s.id)).toEqual(['SIG-1', 'SIG-2', 'SIG-3']);
  });

  it('`now` defaults to the clock: a request from long ago is stale', async () => {
    const { work } = await plantClone();
    await v2Store(work, [rec('SIG-1', [created, request('deadbeef01', '2020-01-01')])]);
    expect((await records.confirmCloses(work)).stale).toEqual(['SIG-1']);
  });

  it('a confirmed close is not stale, and open or closed items are untouched', async () => {
    const { work, shas } = await plantClone();
    await v2Store(work, [
      rec('SIG-1', [created, request(shas[0], '2020-01-01')]),
      rec('SIG-2', [created]),
      rec('SIG-3', [created, request(shas[0]), { type: 'closed', at: AT, by: 'confirmCloses', reason: 'fixed', proof: shas[0] }]),
    ]);
    const before2 = await read(work, 'SIG-2');
    const before3 = await read(work, 'SIG-3');
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out).toEqual({ confirmed: ['SIG-1'], stillClosing: [], stale: [] });
    expect(await read(work, 'SIG-2')).toEqual(before2);
    expect(await read(work, 'SIG-3')).toEqual(before3);
  });

  it('the latest request is the one checked (closing → reopened → closing again)', async () => {
    const { work, shas } = await plantClone();
    await v2Store(work, [rec('SIG-1', [
      created,
      request(shas[0]),
      { type: 'reopened', at: AT, by, reason: 'came back' },
      request('deadbeefcafe'),
    ])]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'unknown-commit' }]);
  });

  it('nothing closing: no git, no lock, nothing written', async () => {
    const plain = join(root, 'plain');
    await v2Store(plain, [rec('SIG-1', [created])]);
    const before = snapshotTree(plain);
    const execFn = () => {
      throw new Error('git must not run');
    };
    expect(await records.confirmCloses(plain, { execFn })).toEqual({ confirmed: [], stillClosing: [], stale: [] });
    expect(snapshotTree(plain)).toEqual(before);
  });

  it('calls the injected regenerate once after confirming', async () => {
    const { work, shas } = await plantClone();
    await v2Store(work, [rec('SIG-1', [created, request(shas[0])]), rec('SIG-2', [created, request(shas[1])])]);
    let n = 0;
    await records.confirmCloses(work, { now: NOW, regenerate: async () => { n += 1; } });
    expect(n).toBe(1);
  });

  it('a v1 store refuses (CONFIG, naming the migration), a store-off project is CONFIG', async () => {
    const v1 = join(root, 'v1');
    await put(v1, '.planning/work/WORK.md', '---\nkey: SIG\n---\n');
    await expect(records.confirmCloses(v1)).rejects.toMatchObject({ code: 'CONFIG', message: expect.stringMatching(/work-migrate-v2/) });
    const off = join(root, 'off');
    await mkdir(off);
    await expect(records.confirmCloses(off)).rejects.toMatchObject({ code: 'CONFIG' });
  });
});
