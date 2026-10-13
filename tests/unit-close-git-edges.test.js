// M6.E16 REVIEW pass 1, T-S5 — the git answers a unit close meets that no test
// held: a shallow clone, a remote with no default-branch ref, a default branch
// that is not `main`, a detached HEAD when the close is requested and when it
// is confirmed, and a put-back that fails after a write fails.
// See .planning/M6.E16-VALIDATION.md row "T-S5".
//
// Temp repositories, real git; one write failure is injected and says so.
// Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { getUnit } from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { reportCloses, runConfirmCloses } from '../plugin/tools/lib/close-confirm.js';
import { checkClosedProofs } from '../plugin/tools/lib/sweep.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-11T10:00:00.000Z';
const NOW = '2026-10-12T10:00:00.000Z';
const by = 'claude';
const EPIC = 'M7.E3';
const UNITS = '.planning/work/units';
const RETRO = '# Retrospective\n\n## Timeline\n\nIt shipped.\n';
const opened = { type: 'opened', at: AT, by };
const request = (proof) => ({ type: 'close_requested', at: AT, by, proof });
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
// This file's own git calls run without the user's git configuration (REVIEW pass 1, N4).
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8', env: GIT_ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

// A newer git records the remote's default branch (origin/HEAD) at a fetch;
// an older one leaves it unset after `git remote add`. Removed here so the
// "unset" cases mean the same whichever git runs the suite.
function unsetOriginHead(cwd) {
  spawnSync('git', ['symbolic-ref', '-d', 'refs/remotes/origin/HEAD'], { cwd, env: GIT_ENV });
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-unit-git-edges-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// The store's files, with the unit's record as given.
async function store(dir, unitEvents, items = []) {
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(dir, `${UNITS}/.keep`, '');
  for (const r of items) await put(dir, records.recordPath(r.id), serializeRecord(r));
  if (unitEvents) await put(dir, `${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events: unitEvents }));
}
const unitText = (dir) => readFile(join(dir, `${UNITS}/${EPIC}.json`), 'utf-8');

// A bare remote whose default branch is `branch`, with `n` commits on it.
async function plantRemote(branch = 'main', n = 3) {
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  await mkdir(seed, { recursive: true });
  g(root, 'init', '-q', '--bare', '-b', branch, remote);
  g(seed, 'init', '-q', '-b', branch);
  const shas = [];
  for (let i = 0; i < n; i += 1) {
    g(seed, 'commit', '-q', '--allow-empty', '-m', `c${i}`);
    shas.push(g(seed, 'rev-parse', 'HEAD'));
  }
  g(seed, 'remote', 'add', 'origin', remote);
  g(seed, 'push', '-q', '-u', 'origin', branch);
  return { remote, seed, shas };
}

describe('a shallow clone: the commit is there and git cannot say whether it is on the default branch', () => {
  it('a local commit on top of the one commit a depth-1 clone holds stays closing as `shallow`, not `not-on-default-branch`', async () => {
    const { remote } = await plantRemote();
    const work = join(root, 'work');
    g(root, 'clone', '-q', '--depth', '1', pathToFileURL(remote).href, work);
    expect(g(work, 'rev-parse', '--is-shallow-repository')).toBe('true');
    g(work, 'checkout', '-q', '-b', 'feat/x');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'local work');
    const local = g(work, 'rev-parse', 'HEAD');
    await store(work, [opened, request(local)]);
    const before = await unitText(work);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: EPIC, reason: 'shallow' }], stale: [] });
    expect(await unitText(work)).toBe(before);
  });

  it('a commit cut off by the depth stays closing as `shallow` too, and the one the clone holds on origin/main confirms', async () => {
    const { remote, shas } = await plantRemote();
    const work = join(root, 'work');
    g(root, 'clone', '-q', '--depth', '1', pathToFileURL(remote).href, work);
    await store(work, [opened, request(shas[0])]);
    expect((await records.confirmCloses(work, { now: NOW })).units.stillClosing).toEqual([{ id: EPIC, reason: 'shallow' }]);
    await put(work, `${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events: [opened, request(shas[2])] }));
    expect((await records.confirmCloses(work, { now: NOW, regenerate: async () => {} })).units.confirmed).toEqual([EPIC]);
  });
});

describe('a remote with no default-branch ref', () => {
  it('a remote that was added and never fetched: the unit stays closing as `no-default-branch`, nothing written', async () => {
    const { remote } = await plantRemote();
    const work = join(root, 'work');
    await mkdir(work, { recursive: true });
    g(work, 'init', '-q', '-b', 'main');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'local');
    g(work, 'remote', 'add', 'origin', remote);
    await store(work, [opened, request(g(work, 'rev-parse', 'HEAD'))]);
    const before = await unitText(work);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: EPIC, reason: 'no-default-branch' }], stale: [] });
    expect(await unitText(work)).toBe(before);
  });

  it('a clone whose origin/<default> ref was deleted: `no-default-branch`', async () => {
    const { remote, shas } = await plantRemote();
    const work = join(root, 'work');
    g(root, 'clone', '-q', remote, work);
    g(work, 'update-ref', '-d', 'refs/remotes/origin/main');
    await store(work, [opened, request(shas[0])]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units.confirmed).toEqual([]);
    expect(out.units.stillClosing).toEqual([{ id: EPIC, reason: 'no-default-branch' }]);
  });
});

// The default branch is the one `origin/HEAD` names, and nothing else: with it
// unset, the one of `origin/main` / `origin/master` that exists is not taken
// as the default when a close is confirmed. On a project whose default has
// another name, a pushed branch called `main` would otherwise confirm a close
// nobody merged.
describe('origin/HEAD unset: the default branch is not guessed for a proof', () => {
  const SET_HEAD = 'git remote set-head origin -a';
  const item = (proof) => ({ id: 'SIG-1', type: 'BUG', title: 't', events: [{ type: 'created', at: AT, by }, { type: 'close_requested', at: AT, by, reason: 'fixed', proof }] });

  // `git remote add` + fetch: origin/main is here, origin/HEAD is not.
  async function addedNotCloned(branch = 'main') {
    const { remote, seed, shas } = await plantRemote(branch);
    const work = join(root, 'work');
    await mkdir(work, { recursive: true });
    g(work, 'init', '-q', '-b', branch);
    g(work, 'remote', 'add', 'origin', remote);
    g(work, 'fetch', '-q', 'origin');
    g(work, 'reset', '-q', '--hard', `origin/${branch}`);
    unsetOriginHead(work);
    expect(spawnSync('git', ['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'], { cwd: work, env: GIT_ENV }).status).not.toBe(0);
    return { remote, seed, work, shas };
  }

  it('only origin/main present: an item and a unit closing on a commit that is on it stay closing, and the line says which command to run — once', async () => {
    const { work, shas } = await addedNotCloned();
    await store(work, [opened, request(shas[1])], [item(shas[1])]);
    const reported = reportCloses(work, { now: NOW });
    expect(reported.ready).toEqual([]);
    expect(reported.line.split(SET_HEAD)).toHaveLength(2);
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual([]);
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'no-default-branch' }]);
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: EPIC, reason: 'no-default-branch' }], stale: [] });
    expect(out.line).toMatch(/the remote's default branch is not recorded in this clone/);
    expect(out.line.split(SET_HEAD)).toHaveLength(2);

    // With origin/HEAD set, by the command the line names: confirmed as before.
    g(work, 'remote', 'set-head', 'origin', '-a');
    const after = await runConfirmCloses(work, { now: NOW });
    expect(after.confirmed).toEqual(['SIG-1']);
    expect(after.units.confirmed).toEqual([EPIC]);
    expect(after.line).not.toContain(SET_HEAD);
  });

  it('the default is `trunk`, and someone pushed a branch called `main` holding the proof: not confirmed, with origin/HEAD set or not', async () => {
    const { seed, work } = await addedNotCloned('trunk');
    g(seed, 'checkout', '-q', '-b', 'main');
    g(seed, 'commit', '-q', '--allow-empty', '-m', 'on a stray branch called main, never merged');
    const stray = g(seed, 'rev-parse', 'HEAD');
    g(seed, 'push', '-q', 'origin', 'main');
    g(work, 'fetch', '-q', 'origin');
    unsetOriginHead(work);
    await store(work, [opened, request(stray)], [item(stray)]);
    const unset = await records.confirmCloses(work, { now: NOW });
    expect(unset.confirmed).toEqual([]);
    expect(unset.stillClosing).toEqual([{ id: 'SIG-1', reason: 'no-default-branch' }]);
    expect(unset.units.stillClosing).toEqual([{ id: EPIC, reason: 'no-default-branch' }]);

    g(work, 'remote', 'set-head', 'origin', '-a');
    expect(g(work, 'symbolic-ref', 'refs/remotes/origin/HEAD')).toBe('refs/remotes/origin/trunk');
    const set = await records.confirmCloses(work, { now: NOW });
    expect(set.confirmed).toEqual([]);
    expect(set.stillClosing).toEqual([{ id: 'SIG-1', reason: 'not-on-default-branch' }]);
    expect(set.units.stillClosing).toEqual([{ id: EPIC, reason: 'not-on-default-branch' }]);
  });

  // HEAD is taken as the proof when no `commit` is passed. With origin/HEAD
  // unset nothing can say whether HEAD is already on the default branch, so
  // with the project's work uncommitted the close is refused: requested on the
  // commit from before that work, it would be confirmed as soon as origin/HEAD
  // is set.
  async function openOnMain() {
    const { work } = await addedNotCloned();
    await store(work, [opened]);
    await put(work, `.planning/${EPIC}-RETROSPECTIVE.md`, RETRO);
    await regenerateViews(work);
    g(work, 'add', '-A');
    g(work, 'commit', '-q', '-m', 'before the Epic\'s work');
    g(work, 'push', '-q', 'origin', 'main');
    expect(spawnSync('git', ['symbolic-ref', '-q', 'refs/remotes/origin/HEAD'], { cwd: work, env: GIT_ENV }).status).not.toBe(0);
    return { work, head: g(work, 'rev-parse', 'HEAD') };
  }

  async function refusedUnrecorded(work, run) {
    const before = snapshotTree(work);
    const err = await run().catch((e) => e);
    expect(err, 'the call was not refused').toBeInstanceOf(Error);
    expect(err).toMatchObject({ name: 'WorkStoreError', code: 'CONFLICT' });
    expect(err.message).toMatch(/cannot tell whether .* is already on the default branch/);
    expect(err.message).toContain(SET_HEAD);
    expect(err.message).toMatch(/Nothing was written/);
    expect(err.message).toMatch(/[Cc]ommit the Epic's work first.*or pass `commit`/s);
    expect(snapshotTree(work)).toEqual(before);
    return err;
  }

  it('closeEpic with an untracked file under the project: refused, nothing written — and nothing to confirm once origin/HEAD is set', async () => {
    const { work, head } = await openOnMain();
    await put(work, 'src/the-epic.js', '// the Epic\'s work, not committed\n');
    const err = await refusedUnrecorded(work, () => closeEpic(work, EPIC, { by, at: AT }));
    expect(err.message).toContain(head.slice(0, 12));
    expect(getUnit(work, EPIC).status).toBe('open');
    g(work, 'remote', 'set-head', 'origin', '-a');
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out.units).toEqual({ confirmed: [], stillClosing: [], stale: [] });
    expect(getUnit(work, EPIC).status).toBe('open');
  }, 60_000);

  it('closeEpic with a tracked file changed and not committed: refused', async () => {
    const { work } = await openOnMain();
    await put(work, `.planning/${EPIC}-RETROSPECTIVE.md`, `${RETRO}\nOne more line.\n`);
    await refusedUnrecorded(work, () => closeEpic(work, EPIC, { by, at: AT }));
  }, 60_000);

  it('the same for an Epic with no record yet, and for one already closing: no record is created, the earlier request stands', async () => {
    const { work } = await openOnMain();
    g(work, 'rm', '-q', `${UNITS}/${EPIC}.json`);
    await regenerateViews(work);
    g(work, 'add', '-A');
    g(work, 'commit', '-q', '-m', 'the Epic has no record');
    await put(work, 'notes.txt', 'uncommitted\n');
    await refusedUnrecorded(work, () => closeEpic(work, EPIC, { by, at: AT }));
    expect(() => getUnit(work, EPIC)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));

    await rm(join(work, 'notes.txt'));
    await put(work, `${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events: [opened, request('0123abc')] }));
    await regenerateViews(work);
    g(work, 'add', '-A');
    g(work, 'commit', '-q', '-m', 'closing on an earlier commit');
    await put(work, 'notes.txt', 'uncommitted\n');
    await refusedUnrecorded(work, () => closeEpic(work, EPIC, { by, at: AT }));
    expect(getUnit(work, EPIC).closing_proof).toBe('0123abc');
  }, 60_000);

  it('a clean tree: the close is requested with HEAD, as before', async () => {
    const { work, head } = await openOnMain();
    expect(await closeEpic(work, EPIC, { by, at: AT })).toMatchObject({ status: 'close-requested', commit: head });
  }, 60_000);

  it('an explicit commit is trusted, dirty tree or not', async () => {
    const { work, head } = await openOnMain();
    await put(work, 'notes.txt', 'uncommitted\n');
    expect(await closeEpic(work, EPIC, { by, at: AT, commit: head })).toMatchObject({ status: 'close-requested', commit: head });
  }, 60_000);
});

describe('a default branch that is not called main', () => {
  it('the remote\'s default is `trunk`: a commit on origin/trunk confirms; one only on a local branch named main does not', async () => {
    const { remote, shas } = await plantRemote('trunk');
    const work = join(root, 'work');
    g(root, 'clone', '-q', remote, work);
    g(work, 'checkout', '-q', '-b', 'main');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'on a local main, never pushed');
    const localMain = g(work, 'rev-parse', 'HEAD');
    await store(work, [opened, request(localMain)]);
    expect((await records.confirmCloses(work, { now: NOW })).units.stillClosing).toEqual([{ id: EPIC, reason: 'not-on-default-branch' }]);
    await put(work, `${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events: [opened, request(shas[1])] }));
    expect((await records.confirmCloses(work, { now: NOW, regenerate: async () => {} })).units.confirmed).toEqual([EPIC]);
    expect(getUnit(work, EPIC).close).toMatchObject({ reason: 'shipped', proof: shas[1] });
  });

  it('renamed on the remote after the clone (main → trunk): the clone still compares with the ref it has, origin/main', async () => {
    const { remote, seed, shas } = await plantRemote('main');
    const work = join(root, 'work');
    g(root, 'clone', '-q', remote, work);
    // The remote renames its default branch and gains a commit the clone never fetches.
    g(seed, 'branch', '-m', 'main', 'trunk');
    g(seed, 'commit', '-q', '--allow-empty', '-m', 'after the rename');
    g(seed, 'push', '-q', 'origin', 'trunk');
    g(remote, 'symbolic-ref', 'HEAD', 'refs/heads/trunk');
    const afterRename = g(seed, 'rev-parse', 'HEAD');
    // A commit that was on main before the rename still confirms: origin/main is what this clone knows.
    await store(work, [opened, request(shas[2])]);
    expect((await records.confirmCloses(work, { now: NOW, regenerate: async () => {} })).units.confirmed).toEqual([EPIC]);
    // One that exists only on the renamed branch is unknown here until a fetch: it stays closing, with a reason.
    await put(work, `${UNITS}/${EPIC}.json`, UNIT_KIND.serializeRecord({ id: EPIC, events: [opened, request(afterRename)] }));
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units.confirmed).toEqual([]);
    expect(out.units.stillClosing).toEqual([{ id: EPIC, reason: 'unknown-commit' }]);
  });
});

// A project with unit records, the Epic open and its retrospective written,
// committed and pushed to a bare origin whose default branch is main; then
// one more commit on a branch (the Epic's work), and HEAD detached on it.
async function detachedProject() {
  const repo = join(root, 'work');
  await mkdir(repo, { recursive: true });
  g(repo, 'init', '-q', '-b', 'main');
  await store(repo, [opened]);
  await put(repo, `.planning/${EPIC}-RETROSPECTIVE.md`, RETRO);
  await regenerateViews(repo);
  g(repo, 'add', '-A');
  g(repo, 'commit', '-q', '-m', 'before the Epic\'s work');
  const bare = join(root, 'remote.git');
  g(root, 'init', '-q', '--bare', '-b', 'main', bare);
  g(repo, 'remote', 'add', 'origin', bare);
  g(repo, 'push', '-q', '-u', 'origin', 'main');
  g(repo, 'remote', 'set-head', 'origin', 'main');
  g(repo, 'checkout', '-q', '-b', 'feat/epic');
  await put(repo, 'src/work.txt', 'the Epic\'s work\n');
  g(repo, 'add', '-A');
  g(repo, 'commit', '-q', '-m', 'the Epic\'s work');
  const head = g(repo, 'rev-parse', 'HEAD');
  g(repo, 'checkout', '-q', '--detach', head);
  expect(spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: repo, env: GIT_ENV }).status).not.toBe(0); // detached
  return { repo, bare, head };
}

describe('a detached HEAD', () => {
  it('at the close request: closeEpic takes the detached commit as the proof, and the unit reads closing', async () => {
    const { repo, head } = await detachedProject();
    const out = await closeEpic(repo, EPIC, { by, at: AT });
    expect(out).toMatchObject({ status: 'close-requested', epic: EPIC, commit: head });
    expect(getUnit(repo, EPIC)).toMatchObject({ status: 'closing', closing_proof: head });
  }, 60_000);

  it('at the confirm: the remote ref is what is compared — not on it, closing; once it is there, confirmed, HEAD still detached', async () => {
    const { repo, head } = await detachedProject();
    await closeEpic(repo, EPIC, { by, at: AT });
    expect((await records.confirmCloses(repo, { now: NOW })).units.stillClosing).toEqual([{ id: EPIC, reason: 'not-on-default-branch' }]);
    g(repo, 'push', '-q', 'origin', `${head}:refs/heads/main`);
    g(repo, 'fetch', '-q', 'origin');
    expect(spawnSync('git', ['symbolic-ref', '-q', 'HEAD'], { cwd: repo, env: GIT_ENV }).status).not.toBe(0); // still detached
    const out = await records.confirmCloses(repo, { now: NOW });
    expect(out.units.confirmed).toEqual([EPIC]);
    expect(getUnit(repo, EPIC).close).toMatchObject({ reason: 'shipped', proof: head });
  }, 60_000);
});

describe('a put-back that fails (injected): the error names what was left changed', () => {
  it.skipIf(isRoot)('the unit write fails and the item written before it cannot be put back → `leftChanged` names the item', async () => {
    const { remote, shas } = await plantRemote();
    const work = join(root, 'work');
    g(root, 'clone', '-q', remote, work);
    const item = { id: 'SIG-1', type: 'BUG', title: 't', events: [{ type: 'created', at: AT, by }, { type: 'close_requested', at: AT, by, reason: 'fixed', proof: shas[0] }] };
    await store(work, [opened, request(shas[0])], [item]);
    const itemAbs = join(work, records.recordPath('SIG-1'));
    const itemDir = dirname(itemAbs);
    const unitBefore = await unitText(work);
    let renames = 0;
    // Injected: the first rename (the item's record) goes through; the second
    // (the unit's) fails — and by then the item's folder cannot be written, so
    // the put-back of the item, which uses the real rename, fails too.
    const renameFn = async (from, to) => {
      renames += 1;
      if (renames === 1) {
        const { rename } = await import('node:fs/promises');
        return rename(from, to);
      }
      chmodSync(itemDir, 0o555);
      throw Object.assign(new Error('injected: the disk is full'), { code: 'ENOSPC' });
    };
    let err = null;
    try {
      await records.confirmCloses(work, { now: NOW, renameFn });
    } catch (e) {
      err = e;
    } finally {
      chmodSync(itemDir, 0o755);
    }
    expect(renames).toBe(2);
    expect(err).toMatchObject({ name: 'WorkStoreError' });
    expect(err.leftChanged).toEqual(['SIG-1']);
    expect(err.message).toMatch(/the write failed and SIG-1 could not be put back/);
    // What stands is what the error says: the item's close landed, the unit's did not.
    expect(JSON.parse(await readFile(itemAbs, 'utf-8')).events.at(-1)).toMatchObject({ type: 'closed', proof: shas[0] });
    expect(await unitText(work)).toBe(unitBefore);
  });

  it('the control: the same failure with a put-back that works leaves nothing changed, and says so', async () => {
    const { remote, shas } = await plantRemote();
    const work = join(root, 'work');
    g(root, 'clone', '-q', remote, work);
    const item = { id: 'SIG-1', type: 'BUG', title: 't', events: [{ type: 'created', at: AT, by }, { type: 'close_requested', at: AT, by, reason: 'fixed', proof: shas[0] }] };
    await store(work, [opened, request(shas[0])], [item]);
    const itemBefore = await readFile(join(work, records.recordPath('SIG-1')), 'utf-8');
    let renames = 0;
    const renameFn = async (from, to) => {
      renames += 1;
      if (renames === 1) {
        const { rename } = await import('node:fs/promises');
        return rename(from, to);
      }
      throw Object.assign(new Error('injected: the disk is full'), { code: 'ENOSPC' });
    };
    const err = await records.confirmCloses(work, { now: NOW, renameFn }).catch((e) => e);
    expect(err).toMatchObject({ name: 'WorkStoreError' });
    expect(err.leftChanged).toEqual([]);
    expect(await readFile(join(work, records.recordPath('SIG-1')), 'utf-8')).toBe(itemBefore);
  });
});

// The default branch is read from the stored symbolic ref, by its full name.
// A name lookup (`rev-parse --abbrev-ref origin/HEAD`) prints something else
// once a tag shares the name, and a contributor who can push a tag and a
// branch — and cannot push the default branch — could choose what it printed.
describe('a pushed tag does not change which branch a close is confirmed against', () => {
  const item = (proof) => ({ id: 'SIG-1', type: 'BUG', title: 't', events: [{ type: 'created', at: AT, by }, { type: 'close_requested', at: AT, by, reason: 'fixed', proof }] });

  it('a tag `origin/main` and a branch `remotes/origin/main` holding unmerged work: nothing on that branch is confirmed', async () => {
    const { remote, seed, shas } = await plantRemote();
    const work = join(root, 'work');
    g(root, 'clone', '-q', remote, work);
    g(seed, 'push', '-q', 'origin', `${shas[2]}:refs/tags/origin/main`);
    g(seed, 'checkout', '-q', '-b', 'side');
    g(seed, 'commit', '-q', '--allow-empty', '-m', 'never merged');
    const unmerged = g(seed, 'rev-parse', 'HEAD');
    g(seed, 'push', '-q', 'origin', `${unmerged}:refs/heads/remotes/origin/main`);
    g(work, 'fetch', '-q', '--tags', 'origin');
    expect(g(work, 'rev-parse', 'refs/remotes/origin/remotes/origin/main')).toBe(unmerged);
    expect(g(work, 'rev-parse', 'refs/tags/origin/main')).toBe(shas[2]);

    await store(work, [opened, request(unmerged)], [item(unmerged)]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual([]);
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'not-on-default-branch' }]);
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: EPIC, reason: 'not-on-default-branch' }], stale: [] });
  });

  it('a tag `origin/HEAD`: the default branch is still known, and a commit on it confirms', async () => {
    const { remote, seed, shas } = await plantRemote();
    const work = join(root, 'work');
    g(root, 'clone', '-q', remote, work);
    g(seed, 'push', '-q', 'origin', `${shas[0]}:refs/tags/origin/HEAD`);
    g(work, 'fetch', '-q', '--tags', 'origin');
    expect(g(work, 'rev-parse', 'refs/tags/origin/HEAD')).toBe(shas[0]);
    await store(work, [opened, request(shas[1])]);
    const out = await records.confirmCloses(work, { now: NOW, regenerate: async () => {} });
    expect(out.units).toEqual({ confirmed: [EPIC], stillClosing: [], stale: [] });
  });
});

// Nothing asks git again once a record says closed, so the sweep does: a
// close written by hand, or brought in by a merge, with a commit that is not
// on the default branch is reported.
describe('the sweep asks git again about recorded closes (checkClosedProofs)', () => {
  const closedItem = (id, proof) => ({ id, type: 'BUG', title: 't', events: [
    { type: 'created', at: AT, by },
    { type: 'close_requested', at: AT, by, reason: 'fixed', proof },
    { type: 'closed', at: AT, by: 'confirmCloses', reason: 'fixed', proof },
  ] });
  const closedUnit = (proof) => [opened, request(proof), { type: 'closed', at: AT, by: 'confirmCloses', reason: 'shipped', proof }];

  async function cloneWithStray() {
    const { remote, seed, shas } = await plantRemote();
    g(seed, 'checkout', '-q', '-b', 'side');
    g(seed, 'commit', '-q', '--allow-empty', '-m', 'never merged');
    const unmerged = g(seed, 'rev-parse', 'HEAD');
    g(seed, 'push', '-q', 'origin', 'side');
    const work = join(root, 'work');
    g(root, 'clone', '-q', remote, work);
    return { work, shas, unmerged };
  }

  it('a unit and an item closed on a commit that is not on the default branch are each reported; ones on it are not', async () => {
    const { work, shas, unmerged } = await cloneWithStray();
    await store(work, closedUnit(unmerged), [closedItem('SIG-1', unmerged), closedItem('SIG-2', shas[1])]);
    const before = await unitText(work);
    const findings = checkClosedProofs(work);
    expect(findings.map((f) => [f.check, f.severity, f.file])).toEqual([
      ['close-not-on-default-branch', 'advisory', records.recordPath('SIG-1')],
      ['close-not-on-default-branch', 'advisory', `${UNITS}/${EPIC}.json`],
    ]);
    expect(findings[1].message).toContain(`${EPIC} is recorded closed with the commit ${unmerged}`);
    expect(findings[1].message).toContain('origin/main');
    expect(await unitText(work)).toBe(before);
  });

  it('a commit that names nothing in this clone is reported too; a close whose proof is words is not', async () => {
    const { work, shas } = await cloneWithStray();
    const words = { id: 'SIG-3', type: 'BUG', title: 't', events: [{ type: 'created', at: AT, by }, { type: 'closed', at: AT, by: 'migration', reason: 'fixed', proof: 'shipped in v0.1.2' }] };
    await store(work, closedUnit(shas[1]), [closedItem('SIG-1', 'deadbeef'.repeat(5)), words]);
    expect(checkClosedProofs(work).map((f) => f.file)).toEqual([records.recordPath('SIG-1')]);
  });

  it('says nothing when git cannot answer: origin/HEAD unset, or a shallow clone', async () => {
    const { work, unmerged } = await cloneWithStray();
    await store(work, closedUnit(unmerged), [closedItem('SIG-1', unmerged)]);
    g(work, 'remote', 'set-head', 'origin', '--delete');
    expect(checkClosedProofs(work)).toEqual([]);

    const { remote } = { remote: join(root, 'remote.git') };
    const thin = join(root, 'thin');
    g(root, 'clone', '-q', '--depth', '1', pathToFileURL(remote).href, thin);
    await store(thin, closedUnit(unmerged), [closedItem('SIG-1', unmerged)]);
    expect(checkClosedProofs(thin)).toEqual([]);
  });
});
