// SIG-380 — a close confirms after a rebase merge. A rebase merge gives every
// commit a new ID and keeps its change, so the branch commit a close names is
// never an ancestor of the default branch; before this, such a close stayed
// *closing* until a person walked ship.md's recovery for every Epic. The
// confirm now also counts a commit whose change the default branch holds
// (`landedAs`, work-write.js: a patch-id match after the branch point), and the
// close records the commit it landed as, so any clone reads it as proven. Measured on a
// real project that merges by rebase: its last four PRs' branch commits each
// had the same patch-id as their copy on main.
//
// Real git: a bare remote and a clone with origin/HEAD set.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { landedAs, landedFailure, shallowProbe } from '../plugin/tools/lib/work-write.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { execFileSync } from 'node:child_process';

const AT = '2026-10-31T10:00:00.000Z';
const NOW = '2026-11-01T12:00:00.000Z';
const by = 'claude';
const created = { type: 'created', at: AT, by };
const request = (proof) => ({ type: 'close_requested', at: AT, by, reason: 'fixed', proof });
const rec = (id, proof) => ({ id, type: 'BUG', title: `t ${id}`, events: [created, request(proof)] });

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'sig-rebase-confirm-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

// A clone whose main moved on while `feat` was open: `feat` holds `fix` (one
// commit changing a.js) and, when `second` is set, a second commit too.
async function project({ second = false } = {}) {
  const remote = join(root, 'remote.git');
  const work = join(root, 'work');
  g(root, 'init', '-q', '--bare', '-b', 'main', remote);
  g(root, 'clone', '-q', remote, work);
  await put(work, 'base.txt', 'base\n');
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'base');
  g(work, 'push', '-q', 'origin', 'main');
  g(work, 'remote', 'set-head', 'origin', 'main');
  g(work, 'checkout', '-q', '-b', 'feat');
  await put(work, 'a.js', 'fixed\n');
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'fix');
  const fix = g(work, 'rev-parse', 'HEAD');
  if (second) {
    await put(work, 'c.js', 'more\n');
    g(work, 'add', '-A');
    g(work, 'commit', '-q', '-m', 'more');
  }
  // Someone else's change lands on main first, so a rebase must rewrite `fix`.
  g(work, 'checkout', '-q', 'main');
  await put(work, 'b.js', 'other\n');
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'other');
  g(work, 'push', '-q', 'origin', 'main');
  return { work, fix };
}

// The server's rebase merge: feat's commits replayed onto main, main moved to them.
function rebaseMerge(work) {
  g(work, 'checkout', '-q', 'feat');
  g(work, 'rebase', '-q', 'main');
  g(work, 'checkout', '-q', 'main');
  g(work, 'merge', '-q', '--ff-only', 'feat');
  g(work, 'push', '-q', 'origin', 'main');
  g(work, 'fetch', '-q', 'origin');
}

// The server's squash merge: one new commit on main with feat's whole change.
function squashMerge(work) {
  g(work, 'merge', '-q', '--squash', 'feat');
  g(work, 'commit', '-q', '-m', 'feat (#1)');
  g(work, 'push', '-q', 'origin', 'main');
  g(work, 'fetch', '-q', 'origin');
}

async function store(work, fixtures) {
  await put(work, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  for (const r of fixtures) await put(work, records.recordPath(r.id), serializeRecord(r));
}

const notAncestor = (work, sha) => spawnSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main'], { cwd: work }).status === 1;

describe('SIG-380 — a close confirms after a rebase merge', () => {
  it('the branch commit is not on main after the rebase, and its close confirms anyway', async () => {
    const { work, fix } = await project();
    rebaseMerge(work);
    expect(notAncestor(work, fix)).toBe(true);
    await store(work, [rec('SIG-1', fix)]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual(['SIG-1']);
    expect(records.getRecord(work, 'SIG-1').status).toBe('C');
    // The close records the commit the rebase made, which is on main.
    const landed = g(work, 'log', '--format=%H', '-1', '--grep=^fix$', 'origin/main');
    expect(landed).not.toBe(fix);
    const events = records.getRecord(work, 'SIG-1').record.events;
    expect(events.at(-1).proof).toBe(landed);
    // As the recovery writes it: the close asked again with the landed commit, then confirmed.
    expect(events.map((e) => e.type)).toEqual(['created', 'close_requested', 'reopened', 'close_requested', 'closed']);
    expect(events[2].reason).toContain(fix);
    expect(events[2].reason).toContain(landed);
  }, 60_000);

  it('the read-only probe says the same, and the closed-proof check does not flag it afterwards', async () => {
    const { work, fix } = await project();
    rebaseMerge(work);
    await store(work, [rec('SIG-1', fix)]);
    expect(records.probeCloses(work, { now: NOW })).toMatchObject({ confirmable: ['SIG-1'], stillClosing: [] });
    await records.confirmCloses(work, { now: NOW });
    expect(records.probeClosedProofs(work).notThere).toEqual([]);
    // A clone that never had the branch commit reads the close as proven too.
    g(work, 'add', '-A');
    g(work, 'commit', '-q', '-m', 'records');
    g(work, 'push', '-q', 'origin', 'main');
    const fresh = join(root, 'fresh');
    g(root, 'clone', '-q', join(root, 'remote.git'), fresh);
    expect(spawnSync('git', ['cat-file', '-e', fix], { cwd: fresh }).status).not.toBe(0);
    expect(records.probeClosedProofs(fresh).notThere).toEqual([]);
    expect(records.getRecord(fresh, 'SIG-1').status).toBe('C');
  }, 60_000);

  it('a branch nobody merged stays closing (not-on-default-branch)', async () => {
    const { work, fix } = await project();
    g(work, 'fetch', '-q', 'origin');
    await store(work, [rec('SIG-1', fix)]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.confirmed).toEqual([]);
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'not-on-default-branch' }]);
  }, 60_000);

  it('a squash of two commits is a different change: the close stays closing, as before', async () => {
    const { work, fix } = await project({ second: true });
    squashMerge(work);
    await store(work, [rec('SIG-1', fix)]);
    const out = await records.confirmCloses(work, { now: NOW });
    expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'not-on-default-branch' }]);
  }, 60_000);

  it('an empty commit never matches, though every empty commit has the same patch', async () => {
    const { work } = await project();
    g(work, 'commit', '-q', '--allow-empty', '-m', 'empty on main');
    g(work, 'push', '-q', 'origin', 'main');
    g(work, 'checkout', '-q', 'feat');
    g(work, 'commit', '-q', '--allow-empty', '-m', 'empty on feat');
    const empty = g(work, 'rev-parse', 'HEAD');
    g(work, 'fetch', '-q', 'origin');
    // git cherry would say "-" (every empty commit has the same patch): the guard is what keeps it closing.
    expect(g(work, 'cherry', 'origin/main', empty, `${empty}^`)).toBe(`- ${empty}`);
    expect(landedAs(work, empty, 'refs/remotes/origin/main', execFileSync)).toBe(null);
    expect(landedFailure(work, empty, 'refs/remotes/origin/main', execFileSync, shallowProbe(work, execFileSync))).toBe('not-on-default-branch');
  }, 60_000);
});
