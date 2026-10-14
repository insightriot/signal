// M6.E16 r1.1 (REVIEW pass 1, C-I1) — a closing unit takes no new items, and
// the confirm re-checks the ones it has (AC4.3, `D-M6E16-21`).
// See .planning/M6.E16-VALIDATION.md row "AC4.3 — closing".
//
// The close request checks the unit's items once. Between that request and
// the confirm, an item could be queued or started into the unit, or reopened
// inside it; and a record can arrive past the writers (a merge). So:
//   - `queueItem` / `startItem` into a unit that reads *closing* is refused;
//   - `reopenItem` of an item that belongs to a *closing* unit is refused, by
//     the rule for a closed unit;
//   - `confirmCloses` (and `probeCloses`) leave a unit *closing*, reason
//     `open-items`, while one of its items is not closed.
// Temp git repositories, real git. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import * as units from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-04T10:00:00.000Z';
const NOW = '2026-10-10T12:00:00.000Z';
const by = 'claude';
const UNITS = '.planning/work/units';
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by, changes: { type: { from: 'NEW', to: 'BUG' } } };
const queued = (epic) => ({ type: 'queued', at: AT, by, epic });
const itemRequest = (proof) => ({ type: 'close_requested', at: AT, by, reason: 'fixed', proof });
const fixed = (proof) => ({ type: 'closed', at: AT, by, reason: 'fixed', proof });
const item = (id, events) => ({ id, type: 'BUG', title: `t ${id}`, events });
const opened = { type: 'opened', at: AT, by };
const unitRequest = (proof) => ({ type: 'close_requested', at: AT, by, proof });

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
  root = await mkdtemp(join(tmpdir(), 'sig-unit-closing-items-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

async function store(dir, { items = [], unitRecords = [] } = {}) {
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  for (const r of items) await put(dir, records.recordPath(r.id), serializeRecord(r));
  await put(dir, `${UNITS}/.keep`, '');
  for (const [id, events] of unitRecords) await put(dir, `${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
}

// A bare remote with two commits on main, and a clone of it (origin/HEAD set).
async function plantClone() {
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const work = join(root, 'work');
  await mkdir(seed, { recursive: true });
  g(root, 'init', '-q', '--bare', '-b', 'main', remote);
  g(seed, 'init', '-q', '-b', 'main');
  const shas = [];
  for (let i = 0; i < 2; i += 1) {
    g(seed, 'commit', '-q', '--allow-empty', '-m', `c${i}`);
    shas.push(g(seed, 'rev-parse', 'HEAD'));
  }
  g(seed, 'remote', 'add', 'origin', remote);
  g(seed, 'push', '-q', '-u', 'origin', 'main');
  g(root, 'clone', '-q', remote, work);
  return { work, shas };
}

const SHA = '0123abc';

describe('a closing unit takes no new items (C-I1)', () => {
  it.each([
    ['queueItem', 'queued'],
    ['startItem', 'started'],
  ])('%s into a unit that reads closing is refused, CONFLICT, and nothing is written', async (fn, verb) => {
    await store(root, {
      items: [item('SIG-1', [created, triaged])],
      unitRecords: [['M7.E3', [opened, unitRequest(SHA)]], ['M7.E4', [opened]]],
    });
    const before = snapshotTree(root);
    const err = await records[fn](root, 'SIG-1', { epic: 'M7.E3', by }).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(err.message).toMatch(/M7\.E3's close has been requested/);
    expect(err.message).toContain(`nothing was ${verb}`);
    expect(err.message).toContain('reopenUnit');
    expect(snapshotTree(root)).toEqual(before);
    // The control: the same call into an open unit lands.
    expect((await records[fn](root, 'SIG-1', { epic: 'M7.E4', by })).epic).toBe('M7.E4');
  });

  it('a unit named by the project (not an Epic ID) refuses the same way while closing', async () => {
    await store(root, { items: [item('SIG-1', [created, triaged])], unitRecords: [['phase-11', [opened, unitRequest(SHA)]]] });
    await expect(records.queueItem(root, 'SIG-1', { epic: 'phase-11', by })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('reopenItem of an item in a closing unit is refused, as for a closed unit; in an open unit it is allowed', async () => {
    await store(root, {
      items: [item('SIG-1', [created, triaged, queued('M7.E3'), itemRequest(SHA), fixed(SHA)]), item('SIG-2', [created, triaged, queued('M7.E4'), itemRequest(SHA), fixed(SHA)])],
      unitRecords: [['M7.E3', [opened, unitRequest(SHA)]], ['M7.E4', [opened]]],
    });
    const before = snapshotTree(root);
    const err = await records.reopenItem(root, 'SIG-1', { by, reason: 'it came back' }).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(err.message).toMatch(/M7\.E3, whose close has been requested/);
    expect(err.message).toContain('nothing was reopened');
    expect(snapshotTree(root)).toEqual(before);
    expect((await records.reopenItem(root, 'SIG-2', { by, reason: 'it came back' })).status).toBe('T');
  });
});

describe('the confirm re-checks the unit\'s items (C-I1)', () => {
  it('a closing unit with an open item (a record written past the writer) stays closing: open-items', async () => {
    const { work, shas } = await plantClone();
    await store(work, {
      items: [item('SIG-1', [created, triaged, queued('M7.E3')])],
      unitRecords: [['M7.E3', [opened, unitRequest(shas[0])]], ['M7.E5', [opened, unitRequest(shas[0])]]],
    });
    expect(records.probeCloses(work, { now: NOW }).units).toEqual({
      confirmable: ['M7.E5'], stillClosing: [{ id: 'M7.E3', reason: 'open-items' }], stale: [],
    });
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units).toEqual({ confirmed: ['M7.E5'], stillClosing: [{ id: 'M7.E3', reason: 'open-items' }], stale: [] });
    expect(units.getUnit(work, 'M7.E3').status).toBe('closing');
    expect(units.getUnit(work, 'M7.E5').status).toBe('closed');
  });

  it('an item that is closing on a commit not on the default branch holds its unit too', async () => {
    const { work, shas } = await plantClone();
    g(work, 'checkout', '-q', '-b', 'side');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'unmerged');
    const side = g(work, 'rev-parse', 'HEAD');
    g(work, 'checkout', '-q', 'main');
    await store(work, {
      items: [item('SIG-1', [created, triaged, queued('M7.E3'), itemRequest(side)])],
      unitRecords: [['M7.E3', [opened, unitRequest(shas[0])]]],
    });
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: 'M7.E3', reason: 'open-items' }], stale: [] });
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'not-on-default-branch' }]);
    expect(units.getUnit(work, 'M7.E3').status).toBe('closing');
  });

  it('an item closing on the same merged commit is confirmed in the same run, and the unit with it', async () => {
    const { work, shas } = await plantClone();
    await store(work, {
      items: [
        item('SIG-1', [created, triaged, queued('M7.E3'), itemRequest(shas[1])]),
        item('SIG-2', [created, triaged, queued('M7.E3'), itemRequest(shas[0]), fixed(shas[0])]),
        item('SIG-3', [created, triaged, queued('M7.E4')]),
      ],
      unitRecords: [['M7.E3', [opened, unitRequest(shas[1])]], ['M7.E4', [opened]]],
    });
    expect(records.probeCloses(work, { now: NOW })).toMatchObject({ confirmable: ['SIG-1'], units: { confirmable: ['M7.E3'] } });
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual(['SIG-1']);
    expect(out.units).toEqual({ confirmed: ['M7.E3'], stillClosing: [], stale: [] });
    expect(units.getUnit(work, 'M7.E3').status).toBe('closed');
  });

  it('a unit that is not an Epic ID is re-checked the same way', async () => {
    const { work, shas } = await plantClone();
    await store(work, {
      items: [item('SIG-1', [created, triaged, queued('phase-11')]), item('SIG-2', [created, triaged, queued('phase-12'), itemRequest(shas[0]), fixed(shas[0])])],
      unitRecords: [['phase-11', [opened, unitRequest(shas[0])]], ['phase-12', [opened, unitRequest(shas[0])]]],
    });
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units).toEqual({ confirmed: ['phase-12'], stillClosing: [{ id: 'phase-11', reason: 'open-items' }], stale: [] });
  });

  it('planUnitConfirms itself leaves out a unit whose items are not closed, and names it', async () => {
    await store(root, { unitRecords: [['M7.E3', [opened, unitRequest(SHA)]], ['M7.E5', [opened, unitRequest(SHA)]]] });
    const plan = units.planUnitConfirms(
      { baseDir: root, key: 'SIG' },
      [{ id: 'M7.E3', proof: SHA }, { id: 'M7.E5', proof: SHA }],
      { at: NOW, by: 'confirmCloses', openItems: (id) => (id === 'M7.E3' ? ['SIG-1'] : []) },
    );
    expect(plan.planned.map((p) => p.next.id)).toEqual(['M7.E5']);
    expect(plan.openItems).toEqual([{ id: 'M7.E3', items: ['SIG-1'] }]);
    expect(plan.changed).toEqual([]);
  });
});
