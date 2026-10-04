// M6.E13 t7.3 prep — SHIP's backlog discharge on a v2 work store (`D-M6E13-15`).
//
// On v1 a discharged row is closed `fixed` with the discharge stamp as proof.
// v2 refuses that: a `fixed` close needs a commit, and becomes C only when
// `confirmCloses` finds the commit on the default branch. So on v2,
// `dischargeBacklogRows` asks to close each row (`requestCloses`, one batch)
// with the Epic's commit — the branch HEAD at ship, or the `commit` passed —
// and the row reads *closing* until the sweep or the next SHIP confirms it.
//
// `createBacklogIfMissing` writes nothing on v2: `BACKLOG.md` is a view.
//
// Temp git repos, real git.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { createBacklogIfMissing, dischargeBacklogRows, ROW_DISCHARGE } from '../plugin/tools/lib/backlog.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-01T10:00:00.000Z';
const TODAY = '2026-10-04';
const SHA = '0123abcd';
const by = 'claude';
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };

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
  root = await mkdtemp(join(tmpdir(), 'sig-discharge-v2-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(root, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// One record per shape the discharge must tell apart.
async function v2Store({ git = true } = {}) {
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  const recs = [
    { id: 'SIG-1', type: 'FEAT', title: 'Search archived Epics', events: [created, triaged] },
    { id: 'SIG-2', type: 'CHORE', title: 'Tidy the index', events: [created, triaged] },
    { id: 'SIG-3', type: 'BUG', title: 'Tidy bug, not a backlog row', events: [created, triaged] },
    { id: 'SIG-4', type: 'FEAT', title: 'Tidy capture, still in the inbox', events: [created] },
    { id: 'SIG-5', type: 'FEAT', title: 'Closing row', events: [created, triaged, { type: 'close_requested', at: AT, by, reason: 'fixed', proof: 'fedcba9' }] },
    { id: 'SIG-6', type: 'FEAT', title: 'Closed row', events: [created, triaged, { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'no' }] },
    { id: 'SIG-7', type: 'FEAT', title: 'Index speed', events: [created, triaged] },
  ];
  for (const r of recs) await put(records.recordPath(r.id), serializeRecord(r));
  await regenerateViews(root);
  if (git) {
    g(root, 'init', '-q', '-b', 'feature');
    g(root, 'add', '-A');
    g(root, 'commit', '-q', '-m', 'seed');
  }
}

const read = async (id) => JSON.parse(await readFile(join(root, records.recordPath(id)), 'utf-8'));
const statusOf = (id) => records.getRecord(root, id).status;

describe('dischargeBacklogRows on a v2 store — a close request with the Epic commit', () => {
  it('requests the close of the named row with the commit passed; the row reads closing, in BACKLOG.md too', async () => {
    await v2Store();
    const res = await dischargeBacklogRows(root, { rows: ['tidy the index', 'no such row'], by: 'M6.E13', at: TODAY, commit: SHA });
    expect(res.written).toBe(true);
    expect(res.commit).toBe(SHA);
    expect(res.results).toEqual([
      { row: 'tidy the index', status: ROW_DISCHARGE.DISCHARGED, reason: null, heading: 'Tidy the index', line: null, id: 'SIG-2' },
      { row: 'no such row', status: ROW_DISCHARGE.NOT_FOUND, reason: 'no live backlog row matches "no such row"', heading: null, line: null },
    ]);
    expect((await read('SIG-2')).events.at(-1)).toEqual({ type: 'close_requested', at: TODAY, by: 'M6.E13', reason: 'fixed', proof: SHA });
    expect(statusOf('SIG-2')).toBe('closing');
    // The view shows a closing item, marked, until it is confirmed (work-views.js).
    expect(await readFile(join(root, '.planning/BACKLOG.md'), 'utf-8')).toMatch(/Tidy the index.* · closing/);
    expect(records.checkRecords(root)).toEqual([]);
  });

  it('with no commit passed, the commit is the branch HEAD', async () => {
    await v2Store();
    const head = g(root, 'rev-parse', 'HEAD');
    const res = await dischargeBacklogRows(root, { rows: ['search archived'], by: 'M6.E13', at: TODAY });
    expect(res.commit).toBe(head);
    expect((await read('SIG-1')).events.at(-1).proof).toBe(head);
  });

  it('bugs and inbox captures are not rows; closing and closed rows read as already discharged; nothing written', async () => {
    await v2Store();
    const before = snapshotTree(root);
    const res = await dischargeBacklogRows(root, { rows: ['tidy bug', 'tidy capture', 'closing row', 'closed row'], by: 'M6.E13', at: TODAY, commit: SHA });
    expect(res.written).toBe(false);
    expect(res.results.map((r) => [r.status, r.id ?? null])).toEqual([
      [ROW_DISCHARGE.NOT_FOUND, null],
      [ROW_DISCHARGE.NOT_FOUND, null],
      [ROW_DISCHARGE.ALREADY_DISCHARGED, 'SIG-5'],
      [ROW_DISCHARGE.ALREADY_DISCHARGED, 'SIG-6'],
    ]);
    expect(res.results[2].reason).toBe('already closing (fixed by fedcba9) at .planning/work/items/00/SIG-5.json');
    expect(res.results[3].reason).toBe('already closed (wontdo) at .planning/work/items/00/SIG-6.json');
    expect(snapshotTree(root)).toEqual(before);
  });

  it('an ambiguous row refuses and writes nothing for it', async () => {
    await v2Store();
    const before = snapshotTree(root);
    const res = await dischargeBacklogRows(root, { rows: ['index'], by: 'M6.E13', at: TODAY, commit: SHA });
    expect(res.written).toBe(false);
    expect(res.results[0]).toMatchObject({ status: ROW_DISCHARGE.AMBIGUOUS, reason: '"index" matches 2 items (SIG-2, SIG-7) — name one of them exactly' });
    expect(snapshotTree(root)).toEqual(before);
  });

  it('two queries naming one item request it once', async () => {
    await v2Store();
    const res = await dischargeBacklogRows(root, { rows: ['search archived', 'archived epics', 'tidy the'], by: 'M6.E13', at: TODAY, commit: SHA });
    expect(res.results.map((r) => [r.status, r.id])).toEqual([
      [ROW_DISCHARGE.DISCHARGED, 'SIG-1'], [ROW_DISCHARGE.DISCHARGED, 'SIG-1'], [ROW_DISCHARGE.DISCHARGED, 'SIG-2'],
    ]);
    expect((await read('SIG-1')).events.filter((e) => e.type === 'close_requested')).toHaveLength(1);
  });

  it('all or nothing: a failure writing the second record leaves the first open, bytes unchanged', async () => {
    await v2Store();
    const before = snapshotTree(root);
    let n = 0;
    const { renameSync } = await import('node:fs');
    const _renameFn = (a, b) => {
      n += 1;
      if (n === 2) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      return renameSync(a, b);
    };
    await expect(dischargeBacklogRows(root, { rows: ['search archived', 'tidy the'], by: 'M6.E13', at: TODAY, commit: SHA, _renameFn }))
      .rejects.toMatchObject({ code: 'IO' });
    expect(snapshotTree(root)).toEqual(before);
    expect(statusOf('SIG-1')).toBe('T');
  });

  it('outside a git repository with no commit passed: refuses (CONFIG), nothing written', async () => {
    await v2Store({ git: false });
    const before = snapshotTree(root);
    await expect(dischargeBacklogRows(root, { rows: ['tidy the'], by: 'M6.E13', at: TODAY }))
      .rejects.toMatchObject({ code: 'CONFIG', message: expect.stringMatching(/commit/) });
    expect(snapshotTree(root)).toEqual(before);
  });

  it('a commit that is not a bare hash is refused (SCHEMA), nothing written', async () => {
    await v2Store();
    const before = snapshotTree(root);
    await expect(dischargeBacklogRows(root, { rows: ['tidy the'], by: 'M6.E13', at: TODAY, commit: 'fixed in abc1234' }))
      .rejects.toMatchObject({ code: 'SCHEMA' });
    expect(snapshotTree(root)).toEqual(before);
  });
});

describe('createBacklogIfMissing on a v2 store', () => {
  it('writes nothing — BACKLOG.md is a view', async () => {
    await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    const res = await createBacklogIfMissing(root, { today: TODAY });
    expect(res.created).toBe(false);
    expect(existsSync(join(root, '.planning/BACKLOG.md'))).toBe(false);
  });
});
