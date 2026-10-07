// M6.E13 t7.3 prep — closing an Epic on a v2 work store (t2.5 → S7).
//
// On v1, `closeEpic` gates on the item files in the Epic's folder and then
// moves the folder to `archive/epics/`. On v2 the items are records under
// `work/items/` and their Epic is derived from their events, so the folder
// holds documents only: the gate is `work-records.js` `closeEpicCheck` (every
// record whose Epic is this one is closed), and after the move the v2 views
// are regenerated, not the v1 lists. Same entry, `closeEpic`, branching on the
// store version, so `ship.md` §6.8 does not change at the cutover.
//
// A record of this Epic that is *closing* — its fix commit requested but not
// yet on the default branch — counts as done when that commit is in the
// current HEAD, the shipping branch (`D-M6E13-22`; the sequencing gap surfaced
// at t7.3 prep 2). When git cannot tell, it stays open (fail-closed).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-01T10:00:00.000Z';
const by = 'claude';
const EPIC = 'M6.E99';
const ev = {
  created: { type: 'created', at: AT, by },
  triaged: { type: 'triaged', at: AT, by },
  queued: { type: 'queued', at: AT, by, epic: EPIC },
  started: { type: 'started', at: AT, by, epic: EPIC },
  closing: { type: 'close_requested', at: AT, by, reason: 'fixed', proof: '0123abc' },
  confirmed: { type: 'closed', at: AT, by, reason: 'fixed', proof: '0123abc' },
  wontdo: { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'no' },
};
// No git in these fixtures: moves are renames.
const noGit = () => {
  throw new Error('not a git repository');
};

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-epic-close-v2-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(root, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

async function store(epicRecords) {
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(`.planning/work/epics/${EPIC}/README.md`, `---\nepic: ${EPIC}\n---\n# ${EPIC}\n\nSee [the plan](${EPIC}-PLAN.md).\n`);
  await put(`.planning/work/epics/${EPIC}/${EPIC}-PLAN.md`, '# Plan\n\nBack to [state](../../../STATE.md).\n');
  await put('.planning/STATE.md', `# State\n\nThe [plan](work/epics/${EPIC}/${EPIC}-PLAN.md).\n`);
  const recs = [
    { id: 'SIG-1', type: 'FEAT', title: 'done in the Epic', events: [ev.created, ev.triaged, ev.queued, ev.started, ev.closing, ev.confirmed] },
    { id: 'SIG-2', type: 'CHORE', title: 'not done, not in the Epic', events: [ev.created, ev.triaged] },
    ...epicRecords,
  ];
  for (const r of recs) await put(records.recordPath(r.id), serializeRecord(r));
  await regenerateViews(root);
}

describe('closeEpic on a v2 store', () => {
  it('every record in the Epic closed: the folder moves to the archive, the close is recorded, the v2 views regenerate', async () => {
    await store([{ id: 'SIG-3', type: 'BUG', title: 'dropped from the Epic', events: [ev.created, ev.triaged, ev.queued, ev.wontdo] }]);
    const out = await closeEpic(root, EPIC, { by, pr: '#300', at: AT }, { execFn: noGit });
    expect(out).toMatchObject({ status: 'closed', from: `.planning/work/epics/${EPIC}`, to: `.planning/archive/epics/${EPIC}` });
    expect(existsSync(join(root, `.planning/work/epics/${EPIC}`))).toBe(false);
    const readme = await readFile(join(root, `.planning/archive/epics/${EPIC}/README.md`), 'utf-8');
    expect(readme).toMatch(/close:\n {2}at: /);
    expect(readme).toContain('pr: "#300"');
    // An inbound link from a live file is retargeted at the archive.
    expect(await readFile(join(root, '.planning/STATE.md'), 'utf-8')).toContain(`archive/epics/${EPIC}/${EPIC}-PLAN.md`);
    // The v2 Epic index says the Epic is archived, and every view is fresh.
    expect(await readFile(join(root, '.planning/work/EPICS.md'), 'utf-8')).toMatch(new RegExp(`${EPIC.replace('.', '\\.')}.*closed`));
    expect(records.checkRecords(root)).toEqual([]);
    expect(records.isEpicArchived(root, EPIC)).toBe(true);
  });

  it('a record of the Epic still open: OPEN_ITEMS naming it, nothing moved', async () => {
    await store([{ id: 'SIG-3', type: 'FEAT', title: 'still queued', events: [ev.created, ev.triaged, ev.queued] }]);
    const before = snapshotTree(root);
    await expect(closeEpic(root, EPIC, { by, at: AT }, { execFn: noGit }))
      .rejects.toMatchObject({ code: 'OPEN_ITEMS', message: expect.stringMatching(/SIG-3 \(status Q\) — still queued/) });
    expect(snapshotTree(root)).toEqual(before);
  });

  it('a record of the Epic closing, and git cannot tell where its commit is: OPEN_ITEMS (fail-closed)', async () => {
    await store([{ id: 'SIG-3', type: 'BUG', title: 'fixed on the branch', events: [ev.created, ev.triaged, ev.started, ev.closing] }]);
    const before = snapshotTree(root);
    await expect(closeEpic(root, EPIC, { by, at: AT }, { execFn: noGit }))
      .rejects.toMatchObject({ code: 'OPEN_ITEMS', message: expect.stringMatching(/SIG-3 \(status closing\)/) });
    expect(snapshotTree(root)).toEqual(before);
  });

  it('a record of the Epic closing with its fix commit in HEAD (the shipping branch): the Epic closes (D-M6E13-22)', async () => {
    const git = (...args) => {
      const r = spawnSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.email=t@t.co', '-c', 'user.name=T', ...args], { cwd: root, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
      return r.stdout.trim();
    };
    git('init', '-q', '-b', 'feat');
    await put('fix.txt', 'fixed\n');
    git('add', 'fix.txt');
    git('commit', '-q', '-m', 'the fix');
    const sha = git('rev-parse', 'HEAD');
    await store([{ id: 'SIG-3', type: 'BUG', title: 'fixed on the branch', events: [ev.created, ev.triaged, ev.started, { ...ev.closing, proof: sha }] }]);
    const out = await closeEpic(root, EPIC, { by, at: AT });
    expect(out).toMatchObject({ status: 'closed', to: `.planning/archive/epics/${EPIC}` });
    // The record is untouched: still closing, confirmed after the merge.
    expect(records.getRecord(root, 'SIG-3').status).toBe('closing');
    expect(records.checkRecords(root)).toEqual([]);
  });

  it('no Epic folder: no-folder, nothing written', async () => {
    await store([]);
    await rm(join(root, `.planning/work/epics/${EPIC}`), { recursive: true });
    const before = snapshotTree(root);
    expect(await closeEpic(root, EPIC, { by, at: AT }, { execFn: noGit })).toEqual({ status: 'no-folder' });
    expect(snapshotTree(root)).toEqual(before);
  });

  // REVIEW I3: nothing creates Epic folders on a v2 store, so a gate that ran
  // only after finding the folder never ran at all.
  it('no Epic folder and a record of the Epic still in progress: OPEN_ITEMS, nothing written', async () => {
    await store([{ id: 'SIG-3', type: 'FEAT', title: 'still being built', events: [ev.created, ev.triaged, ev.started] }]);
    await rm(join(root, `.planning/work/epics/${EPIC}`), { recursive: true });
    const before = snapshotTree(root);
    await expect(closeEpic(root, EPIC, { by, at: AT }, { execFn: noGit }))
      .rejects.toMatchObject({ code: 'OPEN_ITEMS', message: expect.stringMatching(/SIG-3 \(status P\) — still being built/) });
    expect(snapshotTree(root)).toEqual(before);
  });
});

// M6.E14 VERIFY loop 1 (SIG-280 (6)): the close regenerates the views at its
// end, so a cause the views refuse must stop it before the folder moves.
describe('closeEpic refuses before moving anything when the views cannot be regenerated', () => {
  it('a linked WATCHLIST.md: refused, the Epic folder stays, nothing changes', async () => {
    await store([]);
    await put('elsewhere.md', 'x\n');
    const { symlink } = await import('node:fs/promises');
    await symlink(join('..', '..', 'elsewhere.md'), join(root, '.planning/work/WATCHLIST.md'));
    const before = snapshotTree(join(root, '.planning'));
    const err = await closeEpic(root, EPIC, { by, pr: '#300', at: AT }, { execFn: noGit }).catch((e) => e);
    expect(err?.message).toMatch(/WATCHLIST\.md/);
    expect(existsSync(join(root, `.planning/work/epics/${EPIC}`))).toBe(true);
    expect(snapshotTree(join(root, '.planning'))).toEqual(before);
  });
});
