// Every view equals a regeneration of the records (M6.E13.S3.t3.2, AC5.2).
// See .planning/M6.E13-VALIDATION.md row AC5.2.
//
// Two halves:
//  - a v2 fixture: regenerate, then diff every view against a fresh
//    regeneration through `checkRecords`; a hand edit, a missed regeneration
//    and a record that does not fold are each reported, and the views refuse
//    to regenerate over the broken record (as v1 refuses over a broken item);
//  - this repository: the store is v2 and `checkRecords` has zero
//    findings. (Before the cutover, t7.3, it skipped on the v1 store; the gate
//    was removed at t7.4.)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import * as records from '../plugin/tools/lib/work-records.js';
import { regenerateViews, regenerateToMemory } from '../plugin/tools/lib/work-views.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';

const by = 'claude';
const ev = {
  created: (at) => ({ type: 'created', at, by }),
  triaged: (at) => ({ type: 'triaged', at, by }),
  queued: (at, epic) => ({ type: 'queued', at, by, epic }),
  started: (at, epic) => ({ type: 'started', at, by, epic }),
  closing: (at) => ({ type: 'close_requested', at, by, reason: 'fixed', proof: '0123abc' }),
  confirmed: (at) => ({ type: 'closed', at, by, reason: 'fixed', proof: '0123abc' }),
  legacy: (at) => ({ type: 'closed', at, by, reason: 'fixed', proof: 'Fixed in v0.1.5', legacy: true }),
  dup: (at, of) => ({ type: 'closed', at, by, reason: 'dup', dup_of: of }),
};

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const putRecord = (r) => put(records.recordPath(r.id), serializeRecord(r));
const read = (rel) => readFile(join(base, rel), 'utf-8');

// A store in every shape the views route: each type, each status, a recent
// and an old close in two years, bodies with links, live and archived Epics.
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-views-fresh-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put('.planning/work/WATCHLIST.md', '## Trigger watchlist\n<!-- standing -->\n\n- see [D](../DECISIONS.md)\n');
  await mkdir(join(base, '.planning/work/epics/M6.E13'), { recursive: true });
  await put('.planning/archive/epics/M6.E11/README.md', '---\nclose:\n  at: 2026-09-30\n  pr: "#263"\n  by: claude\n---\n# M6.E11\n');
  const recs = [
    { id: 'SIG-1', type: 'BUG', title: 'a legacy bug', legacy_id: 'B1', priority: 'P2', events: [ev.created('2024-05-01'), ev.legacy('2024-06-01')] },
    { id: 'SIG-2', type: 'BUG', title: 'an open bug', events: [ev.created('2026-09-01'), ev.triaged('2026-09-02')] },
    { id: 'SIG-3', type: 'BUG', title: 'a closing bug', events: [ev.created('2026-09-01'), ev.closing('2026-09-03')] },
    { id: 'SIG-4', type: 'FEAT', title: 'queued work', events: [ev.created('2026-09-01'), ev.triaged('2026-09-02'), ev.queued('2026-09-03', 'M6.E13')] },
    { id: 'SIG-5', type: 'CHORE', title: 'archived Epic work', events: [ev.created('2026-08-01'), ev.triaged('2026-08-01'), ev.started('2026-08-02', 'M6.E11'), ev.closing('2026-08-03'), ev.confirmed('2026-09-29')] },
    { id: 'SIG-6', type: 'NEW', title: 'a capture', events: [ev.created('2026-10-01')] },
    { id: 'SIG-7', type: 'Q', title: 'an open question', events: [ev.created('2026-09-15')] },
    { id: 'SIG-8', type: 'FEAT', title: 'a duplicate', events: [ev.created('2026-01-01'), ev.dup('2026-01-02', 'SIG-4')] },
  ];
  for (const r of recs) await putRecord(r);
  await put('.planning/work/items/00/SIG-4.md', '## queued work\n\nSee [the plan](../../../M6.E13-PLAN.md).\n');
  await put('.planning/work/items/00/SIG-7.md', 'Why?\n\n```\n## not a heading\n```\n');
  await regenerateViews(base);
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('regenerate-and-diff on a v2 fixture (AC5.2)', () => {
  it('after a regeneration every view equals a fresh one, and checkRecords has no findings', async () => {
    const views = regenerateToMemory(base);
    expect(Object.keys(views).sort()).toEqual([
      '.planning/BACKLOG.md',
      '.planning/BUGS.md',
      '.planning/ISSUES-INBOX.md',
      '.planning/OPEN-QUESTIONS.md',
      '.planning/work/EPICS.md',
      '.planning/work/history/2024.md',
      '.planning/work/history/2026.md',
    ]);
    for (const [rel, text] of Object.entries(views)) expect(await read(rel), rel).toBe(text);
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('a view edited by hand is reported by path', async () => {
    const bugs = await read('.planning/BUGS.md');
    await put('.planning/BUGS.md', bugs.replace('an open bug', 'an open bug, edited'));
    expect(records.checkRecords(base)).toEqual([
      { code: 'view-stale', id: null, path: '.planning/BUGS.md', message: expect.stringMatching(/differs from a regeneration/) },
    ]);
  });

  it('a history file deleted by hand is reported missing', async () => {
    await rm(join(base, '.planning/work/history/2024.md'));
    expect(records.checkRecords(base)).toEqual([
      { code: 'view-stale', id: null, path: '.planning/work/history/2024.md', message: expect.stringMatching(/missing/) },
    ]);
  });

  it('a write whose regeneration was skipped leaves the views stale until they are regenerated', async () => {
    await records.triageItem(base, 'SIG-6', { type: 'FEAT', by }, { regenerate: async () => {} });
    const stale = records.checkRecords(base).map((f) => f.path).sort();
    expect(stale).toEqual(['.planning/BACKLOG.md', '.planning/ISSUES-INBOX.md']);
    await regenerateViews(base);
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('a record that does not fold is reported by ID, and the views refuse to regenerate over it', async () => {
    const paths = Object.keys(regenerateToMemory(base));
    const before = await Promise.all(paths.map(read));
    // triaged from closing is not a legal step (PLAN Decision 3).
    await putRecord({ id: 'SIG-9', type: 'BUG', title: 'broken', events: [ev.created('2026-09-01'), ev.closing('2026-09-02'), ev.triaged('2026-09-03')] });
    const f = records.checkRecords(base);
    expect(f).toEqual([
      expect.objectContaining({ code: 'events', id: 'SIG-9' }),
      { code: 'view-stale', id: null, path: '.planning/work', message: expect.stringMatching(/could not be regenerated.*SIG-9/s) },
    ]);
    await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/SIG-9/) });
    expect(() => regenerateToMemory(base)).toThrow(/SIG-9/);
    // Nothing was written: the views are as they were.
    expect(await Promise.all(paths.map(read))).toEqual(before);
  });
});

// ── This repository (AC5.2 from the cutover) ────────────────────────────────

const REPO = fileURLToPath(new URL('..', import.meta.url));

// The cutover gate (a skip while the live store was v1) was removed at M6.E13
// t7.4: the store is v2, and a guard that can skip itself could read clean
// over nothing. If the store were ever not v2, the first test fails instead.
describe('this repository (AC5.2, live)', () => {
  it('the live store is v2', () => {
    expect(records.storeVersion(REPO)).toBe(2);
  });

  it('every record valid, every record folds, every view equals a regeneration: checkRecords has zero findings', () => {
    expect(records.checkRecords(REPO)).toEqual([]);
  });
});
