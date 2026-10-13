// M6.E16 r6 — `dischargeBacklogRows` on a v2 store checks a `commit` it is
// passed, and no longer offers `commit` as the way past a refusal.
//
// The discharge asks each named row to close with the Epic's commit as proof,
// and the row reads *closing* until `confirmCloses` finds that commit on the
// default branch. A `commit` that names nothing here can never be found, so
// the row would read closing for ever — the same class `closeEpic` was fixed
// for (`explicitCommit`, `work-ops.js`), and the same check is used.
//
// Its one refusal for "no commit" is the situation where there is none to
// record — not a git repository, or no commit yet. It said "Pass `commit`",
// and a commit passed there cannot name a commit in the repository either.
//
// Temp folders, real git; every name is invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { dischargeBacklogRows, ROW_DISCHARGE } from '../plugin/tools/lib/backlog.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-01T10:00:00.000Z';
const TODAY = '2026-10-13';
const by = 'claude';

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-discharge-commit-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(root, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// A v2 store with one backlog row; in a repository with two commits unless `git: false`.
async function store({ git = true } = {}) {
  await put('.planning/work/WORK.md', '---\nkey: LEAF\nschema_version: 2\n---\n');
  const row = { id: 'LEAF-1', type: 'CHORE', title: 'Tidy the index', events: [{ type: 'created', at: AT, by }, { type: 'triaged', at: AT, by }] };
  await put(records.recordPath(row.id), serializeRecord(row));
  await regenerateViews(root);
  if (!git) return null;
  g(root, 'init', '-q', '-b', 'feature');
  g(root, 'add', '-A');
  g(root, 'commit', '-q', '-m', 'the Epic');
  const epic = g(root, 'rev-parse', 'HEAD');
  g(root, 'commit', '-q', '--allow-empty', '-m', 'later');
  return epic;
}
const discharge = (commit) => dischargeBacklogRows(root, { rows: ['tidy the index'], by: 'M7.E1', at: TODAY, ...(commit === undefined ? {} : { commit }) });
const proofOf = () => records.getRecord(root, 'LEAF-1').record.events.at(-1).proof;

describe('dischargeBacklogRows on a v2 store — a commit that is passed must name a commit', () => {
  it('a hash that names no commit in this repository is refused (CONFIG), and nothing is written', async () => {
    await store();
    const before = snapshotTree(root);
    const err = await discharge('0123abcd').catch((e) => e);
    expect(err).toMatchObject({ name: 'WorkStoreError', code: 'CONFIG' });
    expect(err.message).toContain('`commit` 0123abcd does not name a commit in this repository');
    expect(err.message).toContain('Nothing was written.');
    expect(snapshotTree(root)).toEqual(before);
    expect(records.getRecord(root, 'LEAF-1').status).toBe('T');
  });

  it('a short hash of a real commit is recorded as that commit\'s full hash', async () => {
    const epic = await store();
    const res = await discharge(epic.slice(0, 9));
    expect(res).toMatchObject({ written: true, commit: epic });
    expect(res.results.map((r) => r.status)).toEqual([ROW_DISCHARGE.DISCHARGED]);
    expect(proofOf()).toBe(epic);
    expect(records.getRecord(root, 'LEAF-1').status).toBe('closing');
  });

  it('a branch or tag named like a hash is not taken for the commit', async () => {
    await store();
    g(root, 'tag', 'abcdef1');
    const before = snapshotTree(root);
    await expect(discharge('abcdef1')).rejects.toMatchObject({ code: 'CONFIG', message: expect.stringContaining('does not name a commit') });
    expect(snapshotTree(root)).toEqual(before);
  });

  it('a commit that is not a bare hash is still refused as one (SCHEMA)', async () => {
    await store();
    await expect(discharge('fixed in abc1234')).rejects.toMatchObject({ code: 'SCHEMA' });
  });

  it('a commit passed for rows that match nothing is not asked about: there is nothing to record it on', async () => {
    await store();
    const res = await dischargeBacklogRows(root, { rows: ['no such row'], by: 'M7.E1', at: TODAY, commit: '0123abcd' });
    expect(res.written).toBe(false);
  });
});

describe('dischargeBacklogRows on a v2 store — outside a repository there is no commit to record', () => {
  it('with no commit passed: refused (CONFIG), and the refusal does not offer `commit` as the way out', async () => {
    await store({ git: false });
    const before = snapshotTree(root);
    const err = await discharge().catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFIG' });
    expect(err.message).toContain('this is not a git repository with a commit');
    expect(err.message).not.toMatch(/pass `commit`/i);
    expect(err.message).toContain('Nothing was written.');
    expect(snapshotTree(root)).toEqual(before);
  });

  it('with a commit passed: refused the same way a commit that names nothing is — it cannot name one here', async () => {
    await store({ git: false });
    const before = snapshotTree(root);
    await expect(discharge('0123abcd')).rejects.toMatchObject({ code: 'CONFIG', message: expect.stringContaining('does not name a commit') });
    expect(snapshotTree(root)).toEqual(before);
  });
});
