// M6.E16.S4.t4.2 — `confirmCloses` confirms unit closes too (FR4, AC4.2).
// See .planning/M6.E16-VALIDATION.md rows AC4.2, AC6.4 and "NFR failure".
//
// A unit's close is requested with a commit and the unit reads *closing* until
// that commit is an ancestor of the remote's default branch
// (`refs/remotes/origin/<default>` — never `HEAD`, never the local branch).
// The same call that confirms item closes confirms unit closes, under the same
// one take of the lock. Temp git repositories, real git; nothing is stubbed
// except where a test says so. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import * as units from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { runConfirmCloses, formatConfirmClosesLine } from '../plugin/tools/lib/close-confirm.js';
import { confirmClosesInSweep } from '../plugin/tools/lib/sweep.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-04T10:00:00.000Z';
const NOW = '2026-10-10T12:00:00.000Z';
const by = 'claude';
const UNITS = '.planning/work/units';
const created = { type: 'created', at: AT, by };
const itemRequest = (proof, at = AT) => ({ type: 'close_requested', at, by, reason: 'fixed', proof });
const item = (id, events) => ({ id, type: 'BUG', title: `t ${id}`, events });
const opened = { type: 'opened', at: AT, by };
const unitRequest = (proof, extra = {}, at = AT) => ({ type: 'close_requested', at, by, proof, ...extra });

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
  root = await mkdtemp(join(tmpdir(), 'sig-unit-confirm-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// A v2 store with the units folder on, the given items and units.
async function store(dir, { items = [], unitRecords = [], unitsOn = true } = {}) {
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  for (const r of items) await put(dir, records.recordPath(r.id), serializeRecord(r));
  if (unitsOn) await put(dir, `${UNITS}/.keep`, '');
  for (const [id, events] of unitRecords) await put(dir, `${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, events }));
}
const unitOnDisk = async (dir, id) => JSON.parse(await readFile(join(dir, `${UNITS}/${id}.json`), 'utf-8'));
const itemOnDisk = async (dir, id) => JSON.parse(await readFile(join(dir, records.recordPath(id)), 'utf-8'));

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
  return { work, shas, remote };
}

describe('confirmCloses — a unit close is confirmed against the default branch (AC4.2)', () => {
  it('proof an ancestor of origin/main → closed shipped, the request\'s proof, pr and release copied; one event', async () => {
    const { work, shas } = await plantClone();
    await store(work, { unitRecords: [['M7.E3', [opened, unitRequest(shas[0], { pr: '#412', release: 'v9.9.9' })]]] });
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out).toEqual({
      confirmed: [], stillClosing: [], stale: [],
      units: { confirmed: ['M7.E3'], stillClosing: [], stale: [] },
    });
    expect((await unitOnDisk(work, 'M7.E3')).events).toEqual([
      opened,
      unitRequest(shas[0], { pr: '#412', release: 'v9.9.9' }),
      { type: 'closed', at: NOW, by: 'confirmCloses', reason: 'shipped', proof: shas[0], pr: '#412', release: 'v9.9.9' },
    ]);
    expect(units.getUnit(work, 'M7.E3')).toMatchObject({ status: 'closed', close: { reason: 'shipped', proof: shas[0] } });
    expect(units.unitClosure(work, 'M7.E3')).toBe('closed');
    expect(units.checkUnits(work)).toEqual([]);
  });

  it('a proof on HEAD only (a branch not merged) stays closing; nothing is written', async () => {
    const { work } = await plantClone();
    g(work, 'checkout', '-q', '-b', 'feature');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'unmerged');
    const sha = g(work, 'rev-parse', 'HEAD');
    await store(work, { unitRecords: [['M7.E3', [opened, unitRequest(sha)]]] });
    const before = snapshotTree(work);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: 'M7.E3', reason: 'not-on-default-branch' }], stale: [] });
    expect(snapshotTree(work)).toEqual(before);
    expect(units.getUnit(work, 'M7.E3').status).toBe('closing');
  });

  it('a local main ahead of origin/main does not count: the remote ref is the one compared, never HEAD', async () => {
    const { work } = await plantClone();
    g(work, 'commit', '-q', '--allow-empty', '-m', 'local only, on main');
    const sha = g(work, 'rev-parse', 'HEAD');
    expect(g(work, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
    await store(work, { unitRecords: [['M7.E3', [opened, unitRequest(sha)]]] });
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units.stillClosing).toEqual([{ id: 'M7.E3', reason: 'not-on-default-branch' }]);
    expect(units.getUnit(work, 'M7.E3').status).toBe('closing');
  });

  it('once the commit reaches origin/main (pushed, then fetched) the same call confirms it', async () => {
    const { work } = await plantClone();
    g(work, 'commit', '-q', '--allow-empty', '-m', 'the Epic');
    const sha = g(work, 'rev-parse', 'HEAD');
    await store(work, { unitRecords: [['M7.E3', [opened, unitRequest(sha)]]] });
    expect((await records.confirmCloses(work, { now: NOW })).units.confirmed).toEqual([]);
    g(work, 'push', '-q', 'origin', 'main');
    g(work, 'fetch', '-q', 'origin');
    expect((await records.confirmCloses(work, { now: NOW })).units.confirmed).toEqual(['M7.E3']);
    expect(units.getUnit(work, 'M7.E3').status).toBe('closed');
  });

  // The rule is `ancestryFailure`'s, inherited: git resolves a name as a ref
  // before it tries an abbreviated object id.
  it.each([['branch', 'deadbee'], ['tag', 'cafebab']])('a %s named like a hash, on origin/main\'s commit, does not confirm a unit', async (kind, name) => {
    const { work, shas } = await plantClone();
    expect(shas[1].startsWith(name)).toBe(false);
    g(work, kind, name, 'origin/main');
    await store(work, { unitRecords: [['M7.E3', [opened, unitRequest(name)]]] });
    const before = snapshotTree(work);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: 'M7.E3', reason: 'proof-names-a-ref' }], stale: [] });
    expect(snapshotTree(work)).toEqual(before);
  });

  it('an unknown commit, no remote, and no repository: each stays closing with its reason', async () => {
    const { work } = await plantClone();
    await store(work, { unitRecords: [['M7.E3', [opened, unitRequest('deadbeefcafe')]]] });
    expect((await records.confirmCloses(work, { now: NOW })).units.stillClosing).toEqual([{ id: 'M7.E3', reason: 'unknown-commit' }]);
    g(work, 'remote', 'remove', 'origin');
    expect((await records.confirmCloses(work, { now: NOW })).units.stillClosing).toEqual([{ id: 'M7.E3', reason: 'no-remote' }]);
    const bare = join(root, 'not-a-repo');
    await store(bare, { unitRecords: [['M7.E3', [opened, unitRequest('deadbeefcafe')]]] });
    expect((await records.confirmCloses(bare, { now: NOW })).units.stillClosing).toEqual([{ id: 'M7.E3', reason: 'not-a-repo' }]);
  });

  it('a unit closing for more than 14 days is stale; one confirmed is not', async () => {
    const { work, shas } = await plantClone();
    const old = '2026-09-01T10:00:00.000Z';
    await store(work, {
      unitRecords: [
        ['M7.E3', [opened, unitRequest('deadbeefcafe', {}, old)]],
        ['M7.E4', [opened, unitRequest(shas[0], {}, old)]],
        ['phase-11', [opened, unitRequest('deadbeefcaf0')]],
      ],
    });
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.units).toEqual({
      confirmed: ['M7.E4'],
      stillClosing: [{ id: 'M7.E3', reason: 'unknown-commit' }, { id: 'phase-11', reason: 'unknown-commit' }],
      stale: ['M7.E3'],
    });
  });

  it('open, closed and held units are left alone', async () => {
    const { work, shas } = await plantClone();
    const dropped = { type: 'closed', at: AT, by, reason: 'dropped', words: 'moved' };
    await store(work, { unitRecords: [['M7.E1', [opened]], ['M7.E2', [opened, dropped]], ['M7.E3', [opened, unitRequest(shas[0])]]] });
    const before = snapshotTree(work);
    await records.confirmCloses(work, { now: NOW });
    const after = snapshotTree(work);
    expect([...before.keys()].filter((k) => before.get(k) !== after.get(k))).toEqual([`${UNITS}/M7.E3.json`]);
  });
});

describe('confirmCloses — items and units in the same call, one write (AC4.2)', () => {
  it('both are confirmed; the item fields mean what they did; regenerate runs once', async () => {
    const { work, shas } = await plantClone();
    await store(work, {
      items: [item('SIG-1', [created, itemRequest(shas[0])]), item('SIG-2', [created, itemRequest('deadbeefcafe')])],
      unitRecords: [['M7.E3', [opened, unitRequest(shas[1])]]],
    });
    let calls = 0;
    const out = await records.confirmCloses(work, { now: NOW, regenerate: async () => { calls += 1; } });
    expect(out).toEqual({
      confirmed: ['SIG-1'],
      stillClosing: [{ id: 'SIG-2', reason: 'unknown-commit' }],
      stale: [],
      units: { confirmed: ['M7.E3'], stillClosing: [], stale: [] },
    });
    expect(calls).toBe(1);
    expect((await itemOnDisk(work, 'SIG-1')).events.at(-1)).toEqual({ type: 'closed', at: NOW, by: 'confirmCloses', reason: 'fixed', proof: shas[0] });
  });

  it('all or nothing across the two kinds: the unit write fails → the item written before it is put back', async () => {
    const { work, shas } = await plantClone();
    await store(work, {
      items: [item('SIG-1', [created, itemRequest(shas[0])])],
      unitRecords: [['M7.E3', [opened, unitRequest(shas[1])]]],
    });
    const before = snapshotTree(work);
    const { rename } = await import('node:fs/promises');
    const renameFn = async (from, to) => {
      if (to.endsWith('M7.E3.json')) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      return rename(from, to);
    };
    await expect(records.confirmCloses(work, { now: NOW, renameFn })).rejects.toMatchObject({ code: 'IO', message: expect.stringMatching(/disk full/) });
    expect(snapshotTree(work)).toEqual(before);
  });

  it('the lock is taken once for both: a second take inside the write would be refused', async () => {
    const { work, shas } = await plantClone();
    await store(work, {
      items: [item('SIG-1', [created, itemRequest(shas[0])])],
      unitRecords: [['M7.E3', [opened, unitRequest(shas[1])]]],
    });
    // The lock file exists exactly while the one write runs: seen once, when the regeneration starts.
    const { existsSync } = await import('node:fs');
    const seen = [];
    await records.confirmCloses(work, { now: NOW, regenerate: async () => { seen.push(existsSync(join(work, '.planning/work/.lock'))); } });
    expect(seen).toEqual([true]);
    expect(existsSync(join(work, '.planning/work/.lock'))).toBe(false);
    expect((await unitOnDisk(work, 'M7.E3')).events).toHaveLength(3);
    expect((await itemOnDisk(work, 'SIG-1')).events).toHaveLength(3);
  });

  it('a unit whose request changed while git was asked is not confirmed on the old proof: `changed`', async () => {
    const { work, shas } = await plantClone();
    await store(work, { unitRecords: [['M7.E3', [opened, unitRequest(shas[0])]]] });
    const reopened = { type: 'reopened', at: AT, by, reason: 'one more fix' };
    const moved = UNIT_KIND.serializeRecord({ id: 'M7.E3', events: [opened, unitRequest(shas[0]), reopened, unitRequest('deadbeefcafe')] });
    // After the ancestry check (the last git call before the lock), the record
    // is closing again on another commit — as a concurrent SHIP would leave it.
    const execFn = (cmd, args, o) => {
      const out = execFileSync(cmd, args, o);
      if (args[0] === 'merge-base') writeFileSync(join(work, `${UNITS}/M7.E3.json`), moved);
      return out;
    };
    const out = await records.confirmCloses(work, { now: NOW, execFn });
    expect(out.units).toEqual({ confirmed: [], stillClosing: [{ id: 'M7.E3', reason: 'changed' }], stale: [] });
    expect(await readFile(join(work, `${UNITS}/M7.E3.json`), 'utf-8')).toBe(moved);
  });

  it('a unit reopened while git was asked is in neither list, and is not written', async () => {
    const { work, shas } = await plantClone();
    await store(work, { unitRecords: [['M7.E3', [opened, unitRequest(shas[0])]]] });
    const moved = UNIT_KIND.serializeRecord({ id: 'M7.E3', events: [opened, unitRequest(shas[0]), { type: 'reopened', at: AT, by, reason: 'back' }] });
    const execFn = (cmd, args, o) => {
      const out = execFileSync(cmd, args, o);
      if (args[0] === 'merge-base') writeFileSync(join(work, `${UNITS}/M7.E3.json`), moved);
      return out;
    };
    const out = await records.confirmCloses(work, { now: NOW, execFn });
    expect(out.units).toEqual({ confirmed: [], stillClosing: [], stale: [] });
    expect(await readFile(join(work, `${UNITS}/M7.E3.json`), 'utf-8')).toBe(moved);
  });
});

describe('confirmCloses — a broken unit record refuses the run (NFR failure)', () => {
  it('before git is asked or anything is written, naming it', async () => {
    const { work, shas } = await plantClone();
    await store(work, {
      items: [item('SIG-1', [created, itemRequest(shas[0])])],
      unitRecords: [['M7.E3', [opened, unitRequest(shas[1])]]],
    });
    await put(work, `${UNITS}/M7.E9.json`, '{ broken\n');
    const before = snapshotTree(work);
    const execFn = () => {
      throw new Error('git must not run');
    };
    await expect(records.confirmCloses(work, { now: NOW, execFn }))
      .rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/M7\.E9/) });
    expect(snapshotTree(work)).toEqual(before);
  });

  it('broken under the lock: SCHEMA, and the item is not written either', async () => {
    const { work, shas } = await plantClone();
    await store(work, {
      items: [item('SIG-1', [created, itemRequest(shas[0])])],
      unitRecords: [['M7.E3', [opened, unitRequest(shas[1])]]],
    });
    const execFn = (cmd, args, o) => {
      const out = execFileSync(cmd, args, o);
      if (args[0] === 'merge-base' && args.includes(shas[1])) writeFileSync(join(work, `${UNITS}/M7.E3.json`), '{ broken\n');
      return out;
    };
    await expect(records.confirmCloses(work, { now: NOW, execFn }))
      .rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/M7\.E3/) });
    expect((await itemOnDisk(work, 'SIG-1')).events.at(-1).type).toBe('close_requested');
  });
});

describe('confirmCloses — without unit records, as before (AC6.4)', () => {
  it('no units folder: the result has no `units` field', async () => {
    const { work, shas } = await plantClone();
    await store(work, { unitsOn: false, items: [item('SIG-1', [created, itemRequest(shas[0])])] });
    expect(await records.confirmCloses(work, { now: NOW })).toEqual({ confirmed: ['SIG-1'], stillClosing: [], stale: [] });
  });

  // Changed at REVIEW pass 1 (r1.4, C-I4, `D-M6E16-22`): this case pinned the
  // opposite — a `units/` the library refuses read as "no unit records".
  it('a linked units folder refuses the run, naming the folder; nothing is written through the link', async () => {
    const { work, shas } = await plantClone();
    await store(work, { unitsOn: false });
    const outside = join(root, 'outside');
    const bytes = UNIT_KIND.serializeRecord({ id: 'M7.E3', events: [opened, unitRequest(shas[0])] });
    await put(outside, 'M7.E3.json', bytes);
    await symlink(outside, join(work, UNITS));
    await expect(records.confirmCloses(work, { now: NOW })).rejects.toMatchObject({ name: 'WorkStoreError', code: 'CONFLICT', message: expect.stringMatching(/\.planning\/work\/units\/ cannot be trusted.*symbolic link/) });
    expect(() => records.probeCloses(work, { now: NOW })).toThrow(/\.planning\/work\/units\/ cannot be trusted.*symbolic link/);
    expect(await readFile(join(outside, 'M7.E3.json'), 'utf-8')).toBe(bytes);
  });

  it('an empty units folder: `units` is there and empty; nothing closing asks git nothing and takes no lock', async () => {
    const { work } = await plantClone();
    await store(work, {});
    const before = snapshotTree(work);
    const execFn = () => {
      throw new Error('git must not run');
    };
    expect(await records.confirmCloses(work, { now: NOW, execFn })).toEqual({
      confirmed: [], stillClosing: [], stale: [], units: { confirmed: [], stillClosing: [], stale: [] },
    });
    expect(snapshotTree(work)).toEqual(before);
  });
});

describe('runConfirmCloses — the `Closes:` line names units and items separately (t4.2)', () => {
  it('a unit confirmed and nothing else', async () => {
    const { work, shas } = await plantClone();
    await store(work, { unitRecords: [['M7.E3', [opened, unitRequest(shas[0])]]] });
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out).toEqual({
      ran: true, confirmed: [], stillClosing: [], stale: [], error: null,
      line: 'Closes: units — confirmed 1 (M7.E3) — its record and the views changed; commit them',
      units: { confirmed: ['M7.E3'], stillClosing: [], stale: [] },
      // t10.1 (SIG-295): the confirmed unit's narrative is evicted; this fixture has no STATE.md.
      evictions: [{ id: 'M7.E3', evicted: false, reason: 'no-state-file' }],
      evictionLine: 'Narratives: M7.E3 — nothing in STATE.md to move',
    });
  });

  it('a unit still closing (the SHIP that requested it): the line says why', async () => {
    const { work } = await plantClone();
    g(work, 'commit', '-q', '--allow-empty', '-m', 'the Epic');
    await store(work, { unitRecords: [['M7.E3', [opened, unitRequest(g(work, 'rev-parse', 'HEAD'))]]] });
    expect((await runConfirmCloses(work, { now: NOW })).line).toBe('Closes: units — 1 still closing (M7.E3: not-on-default-branch)');
  });

  it('items and units together: items first, then units', async () => {
    const { work, shas } = await plantClone();
    await store(work, {
      items: [item('SIG-1', [created, itemRequest(shas[0])]), item('SIG-4', [created, itemRequest('deadbeefcafe', '2026-09-01T10:00:00.000Z')])],
      unitRecords: [['M7.E3', [opened, unitRequest(shas[1])]], ['M7.E4', [opened, unitRequest('deadbeefcafe', {}, '2026-09-01T10:00:00.000Z')]]],
    });
    expect((await runConfirmCloses(work, { now: NOW })).line).toBe(
      'Closes: items — confirmed 1 (SIG-1) — its record and the views changed; commit them · '
      + '1 still closing (SIG-4: unknown-commit) · 1 closing over 14 days (SIG-4) — see /sig:docs-sweep · '
      + 'units — confirmed 1 (M7.E3) — its record and the views changed; commit them · 1 still closing (M7.E4: unknown-commit) · '
      + '1 closing over 14 days (M7.E4) — the commit each was requested with is not on the default branch',
    );
  });

  it('unit records on and no unit involved: the line is the one from before unit records, byte for byte', async () => {
    const { work, shas } = await plantClone();
    await store(work, { items: [item('SIG-1', [created, itemRequest(shas[0])])], unitRecords: [['M7.E1', [opened]]] });
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out.line).toBe('Closes: confirmed 1 (SIG-1) — its record and the views changed; commit them');
    expect(out.units).toEqual({ confirmed: [], stillClosing: [], stale: [] });
    const { work: quiet } = { work: join(root, 'quiet') };
    await store(quiet, { unitRecords: [['M7.E1', [opened]]] });
    expect((await runConfirmCloses(quiet, { now: NOW })).line).toBeNull();
  });

  it('formatConfirmClosesLine: several units, and the ambiguous-proof hint is the unit\'s', () => {
    expect(formatConfirmClosesLine({
      confirmed: [], stillClosing: [], stale: [],
      units: { confirmed: ['M7.E3', 'phase-11'], stillClosing: [{ id: 'GATE-A', reason: 'ambiguous-proof' }], stale: [] },
    })).toBe(
      'Closes: units — confirmed 2 (M7.E3, phase-11) — their records and the views changed; commit them · 1 still closing (GATE-A: ambiguous-proof) · '
      + 'ambiguous-proof: the proof is the start of more than one commit — reopen the unit and request its close again with a longer hash',
    );
    // A result with no `units` field, or an empty one, formats as it always has.
    const itemsOnly = { confirmed: ['SIG-1'], stillClosing: [], stale: [] };
    const same = formatConfirmClosesLine(itemsOnly);
    expect(same).toBe('Closes: confirmed 1 (SIG-1) — its record and the views changed; commit them');
    expect(formatConfirmClosesLine({ ...itemsOnly, units: { confirmed: [], stillClosing: [], stale: [] } })).toBe(same);
  });
});

describe('the sweep names a unit record it confirmed (t4.2)', () => {
  it('confirmClosesInSweep: one advisory per confirmed unit, at its record\'s path', async () => {
    const { work, shas } = await plantClone();
    await store(work, {
      items: [item('SIG-1', [created, itemRequest(shas[0])])],
      unitRecords: [['M7.E3', [opened, unitRequest(shas[1])]]],
    });
    const got = await confirmClosesInSweep(work, { now: NOW });
    expect(got.map((f) => [f.check, f.severity, f.file])).toEqual([
      ['closes-confirmed', 'advisory', records.recordPath('SIG-1')],
      ['closes-confirmed', 'advisory', `${UNITS}/M7.E3.json`],
    ]);
    expect(got[1].message).toMatch(/^M7\.E3 confirmed closed/);
    // The views are regenerated with the record, so both are to commit (t9.0).
    expect(got[1].message).toMatch(/wrote its closed event and regenerated the views; commit them\.$/);
    expect(units.getUnit(work, 'M7.E3').status).toBe('closed');
  });
});
