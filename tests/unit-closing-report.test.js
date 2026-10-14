// M6.E16.S5.t5.0c — a unit left *closing* is listed and reported, as an item is.
//
// `listClosing` and `probeCloses` (`work-records.js`) were items-only, so the
// sweep had no "closing too long" advisory for a unit and `/sig:resume` did not
// say a unit was ready to close. With unit records each gains a `units` field;
// without them the result is exactly what it was (no `units` key).
//
// Git here is real git in a temp repository. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { reportCloses, formatCloseReportLine } from '../plugin/tools/lib/close-confirm.js';
import { checkClosingTooLong } from '../plugin/tools/lib/sweep.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-04T10:00:00.000Z';
const OLD = '2026-09-01T10:00:00.000Z';
const NOW = '2026-10-10T12:00:00.000Z';
const by = 'claude';
const UNITS = '.planning/work/units';
const created = { type: 'created', at: AT, by };
const opened = { type: 'opened', at: AT, by };
const itemRequest = (proof, at = AT) => ({ type: 'close_requested', at, by, reason: 'fixed', proof });
const unitRequest = (proof, at = AT) => ({ type: 'close_requested', at, by, proof });
const item = (id, events) => ({ id, type: 'BUG', title: `t ${id}`, events });
const NOWHERE = 'c'.repeat(40);

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-unit-closing-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
async function store(dir, { items = [], unitRecords = [], unitsOn = true } = {}) {
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  for (const r of items) await put(dir, records.recordPath(r.id), serializeRecord(r));
  if (unitsOn) await put(dir, `${UNITS}/.keep`, '');
  for (const [id, events] of unitRecords) await put(dir, `${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
}
// A bare remote with one commit on main, and a clone of it (origin/HEAD set).
async function plantClone() {
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  const work = join(root, 'work');
  await mkdir(seed, { recursive: true });
  g(root, 'init', '-q', '--bare', '-b', 'main', remote);
  g(seed, 'init', '-q', '-b', 'main');
  g(seed, 'commit', '-q', '--allow-empty', '-m', 'c0');
  const sha = g(seed, 'rev-parse', 'HEAD');
  g(seed, 'remote', 'add', 'origin', remote);
  g(seed, 'push', '-q', '-u', 'origin', 'main');
  g(root, 'clone', '-q', remote, work);
  return { work, sha };
}

describe('listClosing — units, beside the items', () => {
  it('each closing unit with its proof, when it was requested, and whether that is over 14 days', async () => {
    await store(root, {
      items: [item('SIG-1', [created, itemRequest(NOWHERE)])],
      unitRecords: [
        ['M7.E1', [opened]],
        ['M7.E2', [opened, unitRequest(NOWHERE)]],
        ['M7.E3', [opened, unitRequest(NOWHERE, OLD)]],
        ['M7.E4', [opened, unitRequest(NOWHERE), { type: 'closed', at: AT, by, reason: 'shipped', proof: NOWHERE }]],
      ],
    });
    const out = records.listClosing(root, { now: NOW });
    expect(out.closing.map((c) => c.id)).toEqual(['SIG-1']); // the item list is what it was
    expect(out.units).toEqual([
      { id: 'M7.E2', path: `${UNITS}/M7.E2.json`, proof: NOWHERE, requestedAt: AT, days: 6, stale: false },
      { id: 'M7.E3', path: `${UNITS}/M7.E3.json`, proof: NOWHERE, requestedAt: OLD, days: 39, stale: true },
    ]);
  });

  it('a unit re-requested is dated from its latest request', async () => {
    await store(root, {
      unitRecords: [['M7.E2', [opened, unitRequest(NOWHERE, OLD), { type: 'reopened', at: AT, by, reason: 'again' }, unitRequest('d'.repeat(40))]]],
    });
    expect(records.listClosing(root, { now: NOW }).units).toEqual([
      { id: 'M7.E2', path: `${UNITS}/M7.E2.json`, proof: 'd'.repeat(40), requestedAt: AT, days: 6, stale: false },
    ]);
  });

  it('without a units folder the result has no `units` key (AC6.4)', async () => {
    await store(root, { items: [item('SIG-1', [created, itemRequest(NOWHERE)])], unitsOn: false });
    const out = records.listClosing(root, { now: NOW });
    expect(Object.keys(out).sort()).toEqual(['broken', 'closing', 'version']);
  });

  it('reads only: nothing is written', async () => {
    await store(root, { unitRecords: [['M7.E3', [opened, unitRequest(NOWHERE, OLD)]]] });
    const before = snapshotTree(root);
    records.listClosing(root, { now: NOW });
    expect(snapshotTree(root)).toEqual(before);
  });
});

describe('the sweep — a unit closing too long is one advisory', () => {
  it('names the unit, the days and the commit; a unit inside 14 days is not named', async () => {
    await store(root, {
      unitRecords: [['M7.E2', [opened, unitRequest(NOWHERE)]], ['M7.E3', [opened, unitRequest(NOWHERE, OLD)]]],
    });
    const found = checkClosingTooLong(root, { now: NOW });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ check: 'closing-too-long', severity: 'advisory', file: `${UNITS}/M7.E3.json` });
    expect(found[0].message).toMatch(/M7\.E3 has been closing for 39 days/);
    expect(found[0].message).toContain(NOWHERE);
    // This folder is not a git repository, so the advisory says that (M6.E16
    // r6) and no longer says to merge or to re-run /sig:ship; the advice for
    // each reason is in `tests/close-reasons-unconfirmable.test.js`.
    expect(found[0].message).toMatch(/this project is not a git repository/);
    expect(found[0].message).not.toMatch(/Merge it|\/sig:ship/);
  });

  it('items first, then units', async () => {
    await store(root, {
      items: [item('SIG-1', [created, itemRequest(NOWHERE, OLD)])],
      unitRecords: [['M7.E3', [opened, unitRequest(NOWHERE, OLD)]]],
    });
    expect(checkClosingTooLong(root, { now: NOW }).map((f) => f.file)).toEqual([records.recordPath('SIG-1'), `${UNITS}/M7.E3.json`]);
  });
});

describe('probeCloses and /sig:resume\'s line — a unit ready to close is said', () => {
  it('a closing unit whose commit is on origin\'s default branch is confirmable; one that is not, is still closing', async () => {
    const { work, sha } = await plantClone();
    await store(work, {
      unitRecords: [['M7.E2', [opened, unitRequest(sha)]], ['M7.E3', [opened, unitRequest(NOWHERE, OLD)]]],
    });
    const before = snapshotTree(work);
    const probe = records.probeCloses(work, { now: NOW });
    expect(probe).toEqual({
      confirmable: [], stillClosing: [], stale: [],
      units: { confirmable: ['M7.E2'], stillClosing: [{ id: 'M7.E3', reason: 'unknown-commit' }], stale: ['M7.E3'] },
    });
    const out = reportCloses(work, { now: NOW });
    expect(out.units).toEqual({ ready: ['M7.E2'], stillClosing: [{ id: 'M7.E3', reason: 'unknown-commit' }], stale: ['M7.E3'] });
    expect(out.line).toBe(
      'Closes: units — 1 ready to close (M7.E2) — run /sig:docs-sweep or /sig:ship to confirm · 1 closing over 14 days (M7.E3) — see /sig:docs-sweep',
    );
    expect(snapshotTree(work)).toEqual(before); // resume writes nothing
  });

  it('items and units are named separately when both have something', async () => {
    const { work, sha } = await plantClone();
    await store(work, { items: [item('SIG-1', [created, itemRequest(sha)])], unitRecords: [['M7.E2', [opened, unitRequest(sha)]]] });
    expect(reportCloses(work, { now: NOW }).line).toBe(
      'Closes: items — 1 ready to close (SIG-1) — run /sig:docs-sweep or /sig:ship to confirm · '
      + 'units — 1 ready to close (M7.E2) — run /sig:docs-sweep or /sig:ship to confirm',
    );
  });

  it('with no unit involved the line and the result are what they were', async () => {
    const { work, sha } = await plantClone();
    await store(work, { items: [item('SIG-1', [created, itemRequest(sha)])], unitRecords: [['M7.E1', [opened]]] });
    const out = reportCloses(work, { now: NOW });
    expect(out.line).toBe('Closes: 1 ready to close (SIG-1) — run /sig:docs-sweep or /sig:ship to confirm');
    expect(out.units).toEqual({ ready: [], stillClosing: [], stale: [] });
  });

  it('without a units folder: no `units` key anywhere (AC6.4)', async () => {
    const { work, sha } = await plantClone();
    await store(work, { items: [item('SIG-1', [created, itemRequest(sha)])], unitsOn: false });
    expect(Object.keys(records.probeCloses(work, { now: NOW })).sort()).toEqual(['confirmable', 'stale', 'stillClosing']);
    expect(Object.keys(reportCloses(work, { now: NOW })).sort()).toEqual(['error', 'line', 'ran', 'ready', 'stale', 'stillClosing']);
  });

  it('formatCloseReportLine with units only, and with nothing to say', () => {
    expect(formatCloseReportLine({ ready: [], stillClosing: [], stale: [], units: { ready: ['M7.E2'], stillClosing: [], stale: [] } }))
      .toBe('Closes: units — 1 ready to close (M7.E2) — run /sig:docs-sweep or /sig:ship to confirm');
    expect(formatCloseReportLine({ ready: [], stillClosing: [], stale: [], units: { ready: [], stillClosing: [], stale: [] } })).toBeNull();
  });
});
