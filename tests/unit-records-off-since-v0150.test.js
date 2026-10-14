// M6.E16 r6.1 — what a project WITHOUT unit records gets from this Epic that
// it did not get from v0.1.50, pinned on purpose.
//
// `tests/unit-records-off-parity.test.js` holds a v2 store with no
// `.planning/work/units/` to v0.1.50's answers, call for call — but it never
// calls the backlog discharge, and its fixture cannot say anything about an
// answer v0.1.50 did not give. The five below are DELIBERATE DIFFERENCES from
// v0.1.50, all with unit records off. Each is a fix made in r6 that applies
// whether or not a project has unit records; none is an accident of the
// parity fixture, and that fixture is not touched by this file.
//
//   (a) the discharge records the FULL hash of HEAD            (v0.1.50: the same — pinned here because the parity test does not ask)
//   (b) HEAD already on the default branch, work uncommitted   → CONFLICT, nothing written   (v0.1.50: recorded HEAD)
//   (c) the same with origin/HEAD unset                        → CONFLICT, naming the way out (v0.1.50: recorded HEAD)
//   (d) a `commit` that names no commit here                   → CONFIG, nothing written      (v0.1.50: recorded it)
//   (e) a closing item, remotes but none named `origin`        → reason `no-origin-remote`    (v0.1.50: `no-default-branch`)
//
// Real git, in temp folders; every name is invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { dischargeBacklogRows } from '../plugin/tools/lib/backlog.js';
import { runConfirmCloses } from '../plugin/tools/lib/close-confirm.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { unitRecordsOn } from '../plugin/tools/lib/unit-records.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-01T10:00:00.000Z';
const TODAY = '2026-10-13';
const NOW = '2026-10-13T12:00:00.000Z';
const by = 'claude';

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
let work;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-records-off-'));
  work = join(root, 'work');
  await mkdir(work, { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});
async function put(rel, content) {
  const p = join(work, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// A v2 store with one backlog row and NO units folder, committed on `main`
// and pushed to a bare remote called `remote`. `setHead`: the clone records
// the remote's default branch (only possible for `origin`).
async function store({ remote = 'origin', setHead = true, events = [] } = {}) {
  g(work, 'init', '-q', '-b', 'main');
  await put('.planning/work/WORK.md', '---\nkey: LEAF\nschema_version: 2\n---\n');
  const row = { id: 'LEAF-1', type: 'CHORE', title: 'Tidy the index', events: [{ type: 'created', at: AT, by }, { type: 'triaged', at: AT, by }, ...events] };
  await put(records.recordPath(row.id), serializeRecord(row));
  await regenerateViews(work);
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'before the work');
  g(root, 'init', '-q', '--bare', '-b', 'main', join(root, 'remote.git'));
  g(work, 'remote', 'add', remote, join(root, 'remote.git'));
  g(work, 'push', '-q', '-u', remote, 'main');
  if (remote === 'origin' && setHead) g(work, 'remote', 'set-head', 'origin', 'main');
  // The premise of every case here.
  expect(existsSync(join(work, '.planning/work/units'))).toBe(false);
  expect(unitRecordsOn(work)).toBe(false);
  return g(work, 'rev-parse', 'HEAD');
}
const discharge = (commit) => dischargeBacklogRows(work, { rows: ['tidy the index'], by: 'M7.E1', at: TODAY, ...(commit === undefined ? {} : { commit }) });
async function refused(run, code) {
  const before = snapshotTree(work);
  const err = await run().catch((e) => e);
  expect(err, 'the call was not refused').toBeInstanceOf(Error);
  expect(err).toMatchObject({ name: 'WorkStoreError', code });
  expect(err.message).toMatch(/Nothing was written/);
  expect(snapshotTree(work)).toEqual(before);
  expect(records.getRecord(work, 'LEAF-1').status).toBe('T');
  return err;
}

describe('unit records off: deliberate differences from v0.1.50 (the parity test does not cover these)', { timeout: 60_000 }, () => {
  it('(a) discharge, a clean tree on a feature branch: written, and the proof is the full hash of HEAD', async () => {
    await store();
    g(work, 'checkout', '-q', '-b', 'feature');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'the work');
    const head = g(work, 'rev-parse', 'HEAD');
    expect(await discharge()).toMatchObject({ written: true, commit: head });
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    expect(records.getRecord(work, 'LEAF-1')).toMatchObject({ status: 'closing' });
    expect(records.getRecord(work, 'LEAF-1').record.events.at(-1)).toMatchObject({ type: 'close_requested', proof: head });
  });

  it('(b) discharge, the work uncommitted and HEAD already on the default branch: CONFLICT, nothing written — v0.1.50 recorded HEAD', async () => {
    await store();
    await put('src/the-work.js', '// not committed\n');
    const err = await refused(() => discharge(), 'CONFLICT');
    expect(err.message).toMatch(/already on the default branch \(origin\/main\)/);
    expect(err.message).toMatch(/Commit the work, then discharge\.$/);
  });

  it('(c) discharge, the work uncommitted and origin/HEAD unset: CONFLICT, naming the way out — v0.1.50 recorded HEAD', async () => {
    await store({ setHead: false });
    await put('src/the-work.js', '// not committed\n');
    const err = await refused(() => discharge(), 'CONFLICT');
    expect(err.message).toMatch(/cannot tell whether that commit is already on the default branch/);
    expect(err.message).toContain('`git remote set-head origin -a` records its default branch');
    expect(err.message).toMatch(/or commit the work, then discharge\.$/);
  });

  it('(d) discharge with a `commit` that names no commit here: CONFIG, nothing written — v0.1.50 recorded it', async () => {
    await store();
    const err = await refused(() => discharge('0123abcd'), 'CONFIG');
    expect(err.message).toContain('`commit` 0123abcd does not name a commit in this repository');
  });

  it('(e) a closing item, remotes but none named origin: it stays closing as `no-origin-remote` — v0.1.50 said `no-default-branch`', async () => {
    const proof = 'c'.repeat(40);
    await store({ remote: 'upstream', events: [{ type: 'close_requested', at: AT, by, reason: 'fixed', proof }] });
    const out = await runConfirmCloses(work, { now: NOW });
    expect(out.stillClosing).toEqual([{ id: 'LEAF-1', reason: 'no-origin-remote' }]);
    expect(out).not.toHaveProperty('units'); // records off: the result has no unit half
    expect(out.line).toMatch(/no-origin-remote: Signal reads the default branch of the remote named `origin`/);
    expect(out.line).not.toContain('set-head');
  });
});
