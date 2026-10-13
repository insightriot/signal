// M6.E16 r6 — `dischargeBacklogRows` on a v2 store does not record a HEAD
// that proves nothing.
//
// With no `commit` passed, the discharge records the branch HEAD as each row's
// proof. On a checkout whose HEAD is already on the default branch, with the
// work still uncommitted, HEAD is a commit from before that work: the next
// confirm step finds it on the default branch and calls each row closed.
// `closeEpic` refuses that state (`refuseHeadThatProvesNothing`, `work-ops.js`,
// see `tests/unit-close-head-proof.test.js`); the discharge asks the same
// question through the same function and refuses the same way, writing
// nothing. Everything `closeEpic` allows stays allowed here: a clean tree, a
// branch ahead of the default branch, an explicit `commit`, no remote.
//
// Temp folders, real git; every name is invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { dischargeBacklogRows } from '../plugin/tools/lib/backlog.js';
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
let work;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-discharge-head-'));
  work = join(root, 'work');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(work, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// A v2 store with one backlog row, committed on `main`. `remote`: pushed to a
// bare `origin`. `setHead`: the clone records the remote's default branch.
async function store({ remote = true, setHead = true } = {}) {
  await mkdir(work, { recursive: true });
  g(work, 'init', '-q', '-b', 'main');
  await put('.planning/work/WORK.md', '---\nkey: LEAF\nschema_version: 2\n---\n');
  const row = { id: 'LEAF-1', type: 'CHORE', title: 'Tidy the index', events: [{ type: 'created', at: AT, by }, { type: 'triaged', at: AT, by }] };
  await put(records.recordPath(row.id), serializeRecord(row));
  await regenerateViews(work);
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'before the work');
  if (remote) {
    const bare = join(root, 'remote.git');
    g(root, 'init', '-q', '--bare', '-b', 'main', bare);
    g(work, 'remote', 'add', 'origin', bare);
    g(work, 'push', '-q', '-u', 'origin', 'main');
    if (setHead) g(work, 'remote', 'set-head', 'origin', 'main');
  }
  return g(work, 'rev-parse', 'HEAD');
}
const discharge = (commit) => dischargeBacklogRows(work, { rows: ['tidy the index'], by: 'M7.E1', at: TODAY, ...(commit === undefined ? {} : { commit }) });
const statusOf = () => records.getRecord(work, 'LEAF-1').status;
const proofOf = () => records.getRecord(work, 'LEAF-1').record.events.at(-1).proof;

async function refused() {
  const before = snapshotTree(work);
  const err = await discharge().catch((e) => e);
  expect(err, 'the discharge was not refused').toBeInstanceOf(Error);
  expect(err).toMatchObject({ name: 'WorkStoreError', code: 'CONFLICT' });
  expect(err.message).toMatch(/^the discharge would record HEAD \([0-9a-f]{12}\) as its proof/);
  expect(err.message).toMatch(/uncommitted or untracked/);
  expect(err.message).toMatch(/Nothing was written/);
  // `commit` is not offered as the way around the refusal.
  expect(err.message).not.toMatch(/pass `commit`/i);
  expect(snapshotTree(work)).toEqual(before);
  expect(statusOf()).toBe('T');
  return err;
}

describe('dischargeBacklogRows on a v2 store — HEAD already on the default branch, the work uncommitted', { timeout: 60_000 }, () => {
  it('an untracked file under the project: refused (CONFLICT), nothing written', async () => {
    const head = await store();
    await put('src/the-work.js', '// not committed\n');
    const err = await refused();
    expect(err.message).toContain(head.slice(0, 12));
    expect(err.message).toMatch(/already on the default branch \(origin\/main\)/);
    expect(err.message).toMatch(/says nothing about these rows, and the next confirm step would call them closed/);
    expect(err.message).toMatch(/Commit the work, then discharge\.$/);
  });

  it('a tracked file changed and not committed: refused', async () => {
    await store();
    await put('.planning/work/WORK.md', '---\nkey: LEAF\nschema_version: 2\n---\n\nedited\n');
    await refused();
  });

  it('the remote\'s default branch not recorded in this clone, the work uncommitted: refused, and the way to record it is named', async () => {
    await store({ setHead: false });
    await put('src/the-work.js', '// not committed\n');
    const err = await refused();
    expect(err.message).toMatch(/cannot tell whether that commit is already on the default branch/);
    expect(err.message).toContain('git remote set-head origin -a');
    expect(err.message).toMatch(/or commit the work, then discharge\.$/);
  });
});

describe('dischargeBacklogRows on a v2 store — what closeEpic allows, the discharge allows', { timeout: 60_000 }, () => {
  it('a clean tree on the default branch: HEAD is recorded', async () => {
    const head = await store();
    expect(await discharge()).toMatchObject({ written: true, commit: head });
    expect(proofOf()).toBe(head);
  });

  it('a branch ahead of the default branch, with more work uncommitted: HEAD is recorded', async () => {
    await store();
    g(work, 'checkout', '-q', '-b', 'feature');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'the work');
    const head = g(work, 'rev-parse', 'HEAD');
    await put('src/more.js', '// not committed\n');
    expect(await discharge()).toMatchObject({ written: true, commit: head });
  });

  it('an explicit `commit`, with the work uncommitted: that commit is recorded', async () => {
    const head = await store();
    await put('src/the-work.js', '// not committed\n');
    expect(await discharge(head)).toMatchObject({ written: true, commit: head });
  });

  it('no remote, with the work uncommitted: HEAD is recorded (nothing can confirm it wrongly)', async () => {
    const head = await store({ remote: false });
    await put('src/the-work.js', '// not committed\n');
    expect(await discharge()).toMatchObject({ written: true, commit: head });
  });

  it('rows that match nothing are not refused: there is nothing to record HEAD on', async () => {
    await store();
    await put('src/the-work.js', '// not committed\n');
    const res = await dischargeBacklogRows(work, { rows: ['no such row'], by: 'M7.E1', at: TODAY });
    expect(res.written).toBe(false);
  });
});
