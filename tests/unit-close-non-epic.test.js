// M6.E16 r7 — a unit whose ID is not an Epic ID is closed at SHIP.
//
// On a project whose units are named another way (`phase-11`), the
// migration creates the current unit open, and until r7 nothing could record
// it finished: `closeEpic` refused any ID that is not an Epic ID. With unit
// records it now closes any unit that has a record, under the Epic's rules
// — open items refuse, HEAD that proves nothing refuses, the git-version gate
// refuses, and the close is a REQUEST that `confirmCloses` confirms once its
// commit is on the default branch. The one rule that differs is the
// retrospective: Signal names one for an Epic only (`deriveRetroPath`), so
// none is required, and the result says so.
//
// Temp repositories, real git. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { getUnit } from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { testSeam } from '../plugin/tools/lib/git-env.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-14T10:00:00.000Z';
const by = 'claude';
const UNIT = 'phase-11';
const UNITS = '.planning/work/units';
const opened = { type: 'opened', at: AT, by };
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

function g(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd, encoding: 'utf8', env: GIT_ENV });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-unit-non-epic-'));
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

// A clone of a remote whose default branch `main` holds two commits; the
// store's files are committed on a branch, so the tree is clean and HEAD is
// a commit the default branch does not hold.
async function project({ units = true, unitRecord = true, items = [] } = {}) {
  const remote = join(root, 'remote.git');
  const seed = join(root, 'seed');
  await mkdir(seed, { recursive: true });
  g(root, 'init', '-q', '--bare', '-b', 'main', remote);
  g(seed, 'init', '-q', '-b', 'main');
  g(seed, 'commit', '-q', '--allow-empty', '-m', 'c0');
  g(seed, 'commit', '-q', '--allow-empty', '-m', 'c1');
  g(seed, 'remote', 'add', 'origin', remote);
  g(seed, 'push', '-q', '-u', 'origin', 'main');
  const work = join(root, 'work');
  g(root, 'clone', '-q', remote, work);
  g(work, 'checkout', '-q', '-b', 'feat/phase-11');
  await put(work, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(work, '.planning/work/items/.keep', '');
  if (units) await put(work, `${UNITS}/.keep`, '');
  if (units && unitRecord) await put(work, `${UNITS}/${UNIT}.json`, UNIT_KIND.serializeRecord({ id: UNIT, events: [opened] }));
  for (const r of items) await put(work, records.recordPath(r.id), serializeRecord(r));
  // The views as they would be, so the commit below leaves a clean tree.
  if (units) await (await import('../plugin/tools/lib/work-views.js')).regenerateViews(work);
  g(work, 'add', '-A');
  g(work, 'commit', '-q', '-m', 'the unit\'s work');
  return { work, head: g(work, 'rev-parse', 'HEAD') };
}

describe('closeEpic closes a unit whose ID is not an Epic ID (unit records on)', () => {
  it('records a close request with HEAD as proof, requires no retrospective and says so; confirmCloses confirms it once the commit is on the default branch', async () => {
    const { work, head } = await project();
    const out = await closeEpic(work, UNIT, { by, pr: '12' });
    expect(out.status).toBe('close-requested');
    expect(out.commit).toBe(head);
    expect(out.created).toBe(false);
    expect(out.retro).toBe(null);
    expect(out.retroNote).toMatch(/phase-11 is not an Epic ID.*no retrospective was required/);
    expect(getUnit(work, UNIT)).toMatchObject({ status: 'closing', closing_proof: head });

    // Not yet on the default branch: still closing, for that reason.
    g(work, 'add', '-A');
    g(work, 'commit', '-q', '-m', 'the close request');
    const first = await records.confirmCloses(work, { regenerate: async () => {} });
    expect(first.units.stillClosing).toEqual([{ id: UNIT, reason: 'not-on-default-branch' }]);

    // Merged: the default branch now holds it, and the close is confirmed.
    g(work, 'push', '-q', 'origin', 'HEAD:main');
    g(work, 'fetch', '-q', 'origin');
    const second = await records.confirmCloses(work, { regenerate: async () => {} });
    expect(second.units.confirmed).toEqual([UNIT]);
    expect(getUnit(work, UNIT)).toMatchObject({ status: 'closed', close: { reason: 'shipped', proof: head, pr: '12' } });
  });

  it('refuses while an item of the unit is open (OPEN_ITEMS), and writes nothing', async () => {
    const item = {
      id: 'SIG-1', type: 'BUG', title: 't',
      events: [{ type: 'created', at: AT, by }, { type: 'triaged', at: AT, by }, { type: 'queued', at: AT, by, epic: UNIT }],
    };
    const { work } = await project({ items: [item] });
    const before = await snapshotTree(work);
    await expect(closeEpic(work, UNIT, { by })).rejects.toMatchObject({ code: 'OPEN_ITEMS', message: expect.stringMatching(/SIG-1/) });
    expect(await snapshotTree(work)).toEqual(before);
  });

  it('refuses a unit with no record (NOT_FOUND, naming the migration) and creates none', async () => {
    const { work } = await project({ unitRecord: false });
    const before = await snapshotTree(work);
    await expect(closeEpic(work, UNIT, { by })).rejects.toMatchObject({
      code: 'NOT_FOUND', message: expect.stringMatching(/\/sig:docs-migrate --work-store/),
    });
    expect(await snapshotTree(work)).toEqual(before);
  });

  it('refuses HEAD as proof when HEAD is on the default branch and the tree has uncommitted work (CONFLICT)', async () => {
    const { work } = await project();
    g(work, 'push', '-q', 'origin', 'HEAD:main');
    g(work, 'fetch', '-q', 'origin');
    await writeFile(join(work, 'uncommitted.txt'), 'work in progress\n');
    const before = await readFile(join(work, `${UNITS}/${UNIT}.json`), 'utf-8');
    await expect(closeEpic(work, UNIT, { by })).rejects.toMatchObject({
      code: 'CONFLICT', message: expect.stringMatching(/says nothing about this unit/),
    });
    expect(await readFile(join(work, `${UNITS}/${UNIT}.json`), 'utf-8')).toBe(before);
  });

  it('refuses with a git older than 2.38 (CONFIG), and writes nothing', async () => {
    const { work } = await project();
    const before = await snapshotTree(work);
    testSeam.gitVersion = 'git version 2.34.1';
    await expect(closeEpic(work, UNIT, { by })).rejects.toMatchObject({ code: 'CONFIG', message: expect.stringMatching(/2\.38/) });
    testSeam.gitVersion = undefined;
    expect(await snapshotTree(work)).toEqual(before);
  });
});

describe('without unit records a unit ID that is not an Epic ID is refused as before', () => {
  it('SCHEMA, the same words as before r7, nothing written', async () => {
    const { work } = await project({ units: false });
    const before = await snapshotTree(work);
    await expect(closeEpic(work, UNIT, { by })).rejects.toMatchObject({
      code: 'SCHEMA', message: 'Epic ID "phase-11" is not valid (expected e.g. M6.E11)',
    });
    expect(await snapshotTree(work)).toEqual(before);
  });
});
