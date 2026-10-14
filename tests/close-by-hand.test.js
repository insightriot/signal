// M6.E16 r7 — a close git can never confirm is confirmed by a person, one ID
// at a time (`confirmCloseByHand`, `work-records.js`).
//
// The automatic confirm (`confirmCloses`) closes a *closing* item or unit
// only once its commit is on the remote's default branch. A project with no
// remote, with no remote named `origin`, or that is not a git repository has
// no such branch, so its closes stay *closing* for ever. A person may confirm
// one of those by hand: the record gets the ordinary `closed` event the
// automatic confirm writes, plus `confirmed_by: 'person'` and the reason git
// could not (`git_reason`). Every other reason refuses, naming what to do.
//
// Temp repositories, real git. Names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { ITEM_KIND, serializeRecord } from '../plugin/tools/lib/work-record.js';
import { getUnit } from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { testSeam } from '../plugin/tools/lib/git-env.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { checkClosedProofs } from '../plugin/tools/lib/sweep.js';
import { formatConfirmClosesLine, itemClosingTooLongWords, unitClosingTooLongWords } from '../plugin/tools/lib/close-confirm.js';
import { BY_HAND_REASONS } from '../plugin/tools/lib/work-records.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-14T10:00:00.000Z';
const by = 'claude';
const person = 'a person';
const UNIT = 'phase-3';
const UNITS = '.planning/work/units';
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8', env: GIT_ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-close-by-hand-'));
});
afterEach(async () => {
  testSeam.gitVersion = undefined;
  await rm(root, { recursive: true, force: true });
});

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

const closingItem = (id, proof, extra = []) => ({
  id, type: 'BUG', title: `bug ${id}`,
  events: [{ type: 'created', at: AT, by }, ...extra, { type: 'close_requested', at: AT, by, reason: 'fixed', proof }],
});
const openItemIn = (id, unit) => ({
  id, type: 'BUG', title: `bug ${id}`,
  events: [{ type: 'created', at: AT, by }, { type: 'triaged', at: AT, by }, { type: 'queued', at: AT, by, epic: unit }],
});

// A store in `dir`: the items given, and — with `unitProof` — the unit
// `phase-3` closing on that commit.
async function store(dir, { items = [], unitProof = null } = {}) {
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(dir, '.planning/work/items/.keep', '');
  await put(dir, `${UNITS}/.keep`, '');
  if (unitProof !== null) {
    await put(dir, `${UNITS}/${UNIT}.json`, UNIT_KIND.serializeRecord({
      id: UNIT, events: [{ type: 'opened', at: AT, by }, { type: 'close_requested', at: AT, by, proof: unitProof, pr: '7' }],
    }));
  }
  for (const r of items) await put(dir, records.recordPath(r.id), serializeRecord(r));
  await regenerateViews(dir);
}

// A repository with one commit, and the remotes named.
async function repo(remotes = []) {
  const work = join(root, 'work');
  await mkdir(work, { recursive: true });
  g(work, 'init', '-q', '-b', 'main');
  g(work, 'commit', '-q', '--allow-empty', '-m', 'the fix');
  for (const name of remotes) g(work, 'remote', 'add', name, join(root, `${name}.git`));
  return { work, head: g(work, 'rev-parse', 'HEAD') };
}

const lastEvent = (record) => record.events[record.events.length - 1];

describe('allowed: the three reasons no git answer can change', () => {
  it('no remote: an item gets the ordinary fixed close, with confirmed_by and git_reason; the views show it closed', async () => {
    const { work, head } = await repo();
    await store(work, { items: [closingItem('SIG-1', head)] });
    const out = await records.confirmCloseByHand(work, 'SIG-1', { by: person, at: AT, why: 'this project keeps no remote' });
    expect(out).toMatchObject({ kind: 'item', id: 'SIG-1', confirmed_by: 'person', git_reason: 'no-remote', proof: head });
    const rec = records.getRecord(work, 'SIG-1');
    expect(rec.status).toBe('C');
    expect(lastEvent(rec.record)).toEqual({
      type: 'closed', at: AT, by: person, reason: 'fixed', proof: head, confirmed_by: 'person', git_reason: 'no-remote', why: 'this project keeps no remote',
    });
    expect(await readFile(join(work, '.planning/BUGS.md'), 'utf-8')).toMatch(/0 closing · 1 closed \(1 total\)/);
    // A later automatic confirm has nothing left to say about it.
    expect((await records.confirmCloses(work)).stillClosing).toEqual([]);
  });

  it('no remote named origin: a unit gets the ordinary shipped close (proof and pr copied), with confirmed_by and git_reason; EPICS.md shows it closed', async () => {
    const { work, head } = await repo(['upstream']);
    await store(work, { unitProof: head });
    const out = await records.confirmCloseByHand(work, UNIT, { by: person, at: AT });
    expect(out).toMatchObject({ kind: 'unit', id: UNIT, confirmed_by: 'person', git_reason: 'no-origin-remote', proof: head });
    const unit = getUnit(work, UNIT);
    expect(unit.status).toBe('closed');
    expect(unit.close).toEqual({ reason: 'shipped', at: AT, by: person, proof: head, pr: '7', confirmed_by: 'person', git_reason: 'no-origin-remote' });
    expect(await readFile(join(work, '.planning/work/EPICS.md'), 'utf-8')).toMatch(/phase-3.*closed 2026-10-14 \(shipped\)/);
  });

  it('not a git repository: an item closing on a commit it names', async () => {
    const work = join(root, 'plain');
    await mkdir(work, { recursive: true });
    await store(work, { items: [closingItem('SIG-2', 'abc1234')] });
    const out = await records.confirmCloseByHand(work, 'SIG-2', { by: person, at: AT });
    expect(out).toMatchObject({ kind: 'item', git_reason: 'not-a-repo' });
    expect(records.getRecord(work, 'SIG-2').status).toBe('C');
  });

  it('a hand-confirmed close is not reported later as a close whose commit is not on the default branch', async () => {
    const { work, head } = await repo();
    await store(work, { items: [closingItem('SIG-1', head)] });
    await records.confirmCloseByHand(work, 'SIG-1', { by: person, at: AT });
    // A remote is added later, and its default branch does not hold the commit.
    const remote = join(root, 'origin.git');
    const seed = join(root, 'seed');
    await mkdir(seed, { recursive: true });
    g(root, 'init', '-q', '--bare', '-b', 'main', remote);
    g(seed, 'init', '-q', '-b', 'main');
    g(seed, 'commit', '-q', '--allow-empty', '-m', 'other');
    g(seed, 'remote', 'add', 'origin', remote);
    g(seed, 'push', '-q', '-u', 'origin', 'main');
    g(work, 'remote', 'add', 'origin', remote);
    g(work, 'fetch', '-q', 'origin');
    g(work, 'remote', 'set-head', 'origin', 'main');
    expect(checkClosedProofs(work).filter((f) => /SIG-1/.test(f.message))).toEqual([]);
  });
});

describe('the confirm line and the sweep name the hand-confirm for the three reasons, and only for them', () => {
  const HAND = /yes.*\/sig:item confirm <ID>/;
  it('the line ends of the three reasons name the command; no-default-branch does not', () => {
    for (const reason of BY_HAND_REASONS) {
      expect(formatConfirmClosesLine({ confirmed: [], stillClosing: [{ id: 'SIG-1', reason }], stale: [] })).toMatch(HAND);
    }
    expect(formatConfirmClosesLine({ confirmed: [], stillClosing: [{ id: 'SIG-1', reason: 'no-default-branch' }], stale: [] })).not.toMatch(/sig:item confirm/);
  });
  it('closing too long: an item and a unit are each named in the command, for the three reasons only', () => {
    for (const reason of BY_HAND_REASONS) {
      expect(itemClosingTooLongWords(reason, 'abc1234', 'SIG-1')).toMatch(/\/sig:item confirm SIG-1/);
      expect(unitClosingTooLongWords(reason, 'abc1234', UNIT)).toMatch(/\/sig:item confirm phase-3/);
    }
    expect(itemClosingTooLongWords('not-on-default-branch', 'abc1234', 'SIG-1')).not.toMatch(/sig:item confirm/);
    expect(unitClosingTooLongWords('open-items', 'abc1234', UNIT)).not.toMatch(/sig:item confirm/);
  });
});

describe('the record shape: confirmed_by and git_reason together, on the close that confirms a request', () => {
  const head = [{ type: 'created', at: AT, by }, { type: 'close_requested', at: AT, by, reason: 'fixed', proof: 'abc1234' }];
  const item = (closed) => ({ id: 'SIG-1', type: 'BUG', title: 't', events: [...head, { type: 'closed', at: AT, by, ...closed }] });
  it('item: valid with both; refused with one, on another reason, or `why` without them', () => {
    expect(ITEM_KIND.validateRecord(item({ reason: 'fixed', proof: 'abc1234', confirmed_by: 'person', git_reason: 'no-remote' }))).toEqual([]);
    expect(ITEM_KIND.validateRecord(item({ reason: 'fixed', proof: 'abc1234', confirmed_by: 'person' }))).toEqual([expect.stringMatching(/together/)]);
    expect(ITEM_KIND.validateRecord(item({ reason: 'wontdo', proof: 'no', confirmed_by: 'person', git_reason: 'no-remote' })))
      .toEqual([expect.stringMatching(/only allowed when reason is fixed/)]);
    expect(ITEM_KIND.validateRecord(item({ reason: 'fixed', proof: 'abc1234', why: 'x' }))).toEqual([expect.stringMatching(/why is only allowed/)]);
    expect(ITEM_KIND.validateRecord(item({ reason: 'fixed', proof: 'abc1234', confirmed_by: 'person', git_reason: 'not-on-default-branch' })))
      .not.toEqual([]);
  });
  it('unit: the same rule, on a shipped close', () => {
    const unit = (closed) => ({ id: UNIT, events: [{ type: 'opened', at: AT, by }, { type: 'close_requested', at: AT, by, proof: 'abc1234' }, { type: 'closed', at: AT, by, ...closed }] });
    expect(UNIT_KIND.validateRecord(unit({ reason: 'shipped', proof: 'abc1234', confirmed_by: 'person', git_reason: 'not-a-repo' }))).toEqual([]);
    expect(UNIT_KIND.validateRecord(unit({ reason: 'shipped', proof: 'abc1234', git_reason: 'not-a-repo' }))).toEqual([expect.stringMatching(/together/)]);
  });
});

describe('refused, with what to do, and nothing written', () => {
  async function refuses(work, id, code, message) {
    const before = snapshotTree(work);
    await expect(records.confirmCloseByHand(work, id, { by: person, at: AT })).rejects.toMatchObject({ code, message: expect.stringMatching(message) });
    expect(snapshotTree(work)).toEqual(before);
  }

  it('a unit with an item that is not closed: close the items first (OPEN_ITEMS)', async () => {
    const { work, head } = await repo();
    await store(work, { unitProof: head });
    // The item is queued while the unit is still open, then the unit's close is requested.
    await put(work, records.recordPath('SIG-4'), serializeRecord(openItemIn('SIG-4', UNIT)));
    await refuses(work, UNIT, 'OPEN_ITEMS', /SIG-4.*Close each/s);
  });

  it('the commit is not on the default branch: merge it', async () => {
    const remote = join(root, 'origin.git');
    g(root, 'init', '-q', '--bare', '-b', 'main', remote);
    const work = join(root, 'work');
    await mkdir(work, { recursive: true });
    g(work, 'init', '-q', '-b', 'main');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'c0');
    g(work, 'remote', 'add', 'origin', remote);
    g(work, 'push', '-q', '-u', 'origin', 'main');
    g(work, 'remote', 'set-head', 'origin', 'main');
    g(work, 'checkout', '-q', '-b', 'feat/x');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'the fix, not merged');
    await store(work, { items: [closingItem('SIG-1', g(work, 'rev-parse', 'HEAD'))] });
    await refuses(work, 'SIG-1', 'CONFLICT', /not-on-default-branch.*[Mm]erge it/s);
    // On the default branch now: git confirms it, so a person does not.
    g(work, 'push', '-q', 'origin', 'HEAD:main');
    g(work, 'fetch', '-q', 'origin');
    await refuses(work, 'SIG-1', 'CONFLICT', /\/sig:docs-sweep/);
  });

  it('the remote\'s default branch is not recorded: run git fetch origin, then git remote set-head origin -a', async () => {
    const { work, head } = await repo(['origin']);
    await store(work, { items: [closingItem('SIG-1', head)] });
    await refuses(work, 'SIG-1', 'CONFLICT', /no-default-branch.*git fetch origin.*git remote set-head origin -a/s);
  });

  it('a git older than 2.38: update git', async () => {
    const { work, head } = await repo();
    await store(work, { items: [closingItem('SIG-1', head)] });
    testSeam.gitVersion = 'git version 2.34.1';
    await refuses(work, 'SIG-1', 'CONFLICT', /git-too-old.*[Uu]pdate git/s);
  });

  it('a record that is not closing', async () => {
    const { work } = await repo();
    const triaged = { id: 'SIG-1', type: 'BUG', title: 'bug', events: [{ type: 'created', at: AT, by }, { type: 'triaged', at: AT, by }] };
    await store(work, { items: [triaged] });
    await refuses(work, 'SIG-1', 'CONFLICT', /not closing/);
  });

  it('no such item or unit (NOT_FOUND); no `by`, or anything but one ID (SCHEMA)', async () => {
    const { work, head } = await repo();
    await store(work, { items: [closingItem('SIG-1', head)] });
    await refuses(work, 'SIG-9', 'NOT_FOUND', /SIG-9/);
    await refuses(work, 'phase-9', 'NOT_FOUND', /phase-9/);
    const before = snapshotTree(work);
    await expect(records.confirmCloseByHand(work, 'SIG-1', { at: AT })).rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/by/) });
    await expect(records.confirmCloseByHand(work, ['SIG-1'], { by: person })).rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/one ID/) });
    expect(snapshotTree(work)).toEqual(before);
  });
});
