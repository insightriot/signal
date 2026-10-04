// closeEpicCheck and isEpicArchived (M6.E13.S2.t2.5, AC1.5).
// See .planning/M6.E13-VALIDATION.md row AC1.5.
//
// An Epic's membership is folded from the events (`epicOf`, Decision 4), so
// "can this Epic close" is a query over every record, not a walk of a folder.
// Moving the Epic folder stays in v1 `closeEpic` until S7.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-04T10:00:00.000Z';
const by = 'claude';
const E = {
  created: { type: 'created', at: AT, by },
  triaged: { type: 'triaged', at: AT, by },
  queued: (epic = 'M6.E13') => ({ type: 'queued', at: AT, by, epic }),
  started: (epic = 'M6.E13') => ({ type: 'started', at: AT, by, epic }),
  closing: { type: 'close_requested', at: AT, by, reason: 'fixed', proof: '0123abc' },
  confirmed: { type: 'closed', at: AT, by: 'confirmCloses', reason: 'fixed', proof: '0123abc' },
  wontdo: { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'no' },
  reopened: { type: 'reopened', at: AT, by, reason: 'back' },
};
const rec = (id, events) => ({ id, type: 'BUG', title: `t ${id}`, events });

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
async function store(fixtures) {
  for (const r of fixtures) await put(records.recordPath(r.id), serializeRecord(r));
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-records-epic-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('closeEpicCheck', () => {
  it('refuses with OPEN_ITEMS naming every open record in the Epic (Q, P, closing), nothing else', async () => {
    await store([
      rec('SIG-1', [E.created, E.triaged, E.queued()]),
      rec('SIG-2', [E.created, E.triaged, E.started()]),
      rec('SIG-3', [E.created, E.triaged, E.started(), E.closing]),
      rec('SIG-4', [E.created, E.triaged, E.started(), E.wontdo]),
      rec('SIG-5', [E.created, E.triaged, E.queued('M6.E14')]),
      rec('SIG-6', [E.created, E.triaged]),
    ]);
    const before = snapshotTree(base);
    let err;
    try {
      records.closeEpicCheck(base, 'M6.E13');
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ code: 'OPEN_ITEMS' });
    expect(err.message).toMatch(/^M6\.E13 has 3 open items/);
    expect(err.message).toMatch(/SIG-1 \(status Q\) — t SIG-1/);
    expect(err.message).toMatch(/SIG-2 \(status P\)/);
    expect(err.message).toMatch(/SIG-3 \(status closing\)/);
    expect(err.message).not.toMatch(/SIG-4|SIG-5|SIG-6/);
    expect(snapshotTree(base)).toEqual(before);
  });

  it('one open item reads in the singular', async () => {
    await store([rec('SIG-1', [E.created, E.triaged, E.queued()])]);
    expect(() => records.closeEpicCheck(base, 'M6.E13')).toThrow(/has 1 open item in/);
  });

  it('passes when every record in the Epic is closed, naming them', async () => {
    await store([
      rec('SIG-1', [E.created, E.triaged, E.started(), E.closing, E.confirmed]),
      rec('SIG-2', [E.created, E.triaged, E.queued(), E.wontdo]),
      rec('SIG-3', [E.created, E.triaged, E.queued('M6.E14')]),
    ]);
    expect(records.closeEpicCheck(base, 'M6.E13')).toEqual({ epic: 'M6.E13', items: ['SIG-1', 'SIG-2'], archived: false });
  });

  it('a record reopened out of the Epic no longer belongs to it', async () => {
    await store([rec('SIG-1', [E.created, E.triaged, E.started(), E.wontdo, E.reopened])]);
    expect(records.closeEpicCheck(base, 'M6.E13')).toEqual({ epic: 'M6.E13', items: [], archived: false });
  });

  it('says whether the Epic is already archived', async () => {
    await put('.planning/archive/epics/M6.E13/README.md', 'x\n');
    expect(records.closeEpicCheck(base, 'M6.E13')).toMatchObject({ archived: true });
  });

  it('a broken record anywhere refuses (its Epic cannot be known), naming it', async () => {
    await store([rec('SIG-1', [E.created, E.triaged, E.queued(), E.wontdo])]);
    await put(records.recordPath('SIG-2'), '{ not json\n');
    expect(() => records.closeEpicCheck(base, 'M6.E13')).toThrow(expect.objectContaining({
      code: 'SCHEMA',
      message: expect.stringMatching(/SIG-2\.json/),
    }));
  });

  it('a malformed Epic ID is refused before any path is built', () => {
    for (const bad of ['../x', 'M6.E13/..', 'm6.e13', '', undefined]) {
      expect(() => records.closeEpicCheck(base, bad)).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
    }
  });

  it('a store that is off is CONFIG', async () => {
    await rm(join(base, '.planning/work/WORK.md'));
    expect(() => records.closeEpicCheck(base, 'M6.E13')).toThrow(expect.objectContaining({ code: 'CONFIG' }));
  });
});

describe('isEpicArchived', () => {
  it('true when .planning/archive/epics/<Epic>/ exists, false otherwise', async () => {
    expect(records.isEpicArchived(base, 'M6.E12')).toBe(false);
    await put('.planning/archive/epics/M6.E12/README.md', 'x\n');
    expect(records.isEpicArchived(base, 'M6.E12')).toBe(true);
  });

  it('refuses a malformed Epic ID (no path traversal)', () => {
    expect(() => records.isEpicArchived(base, '../../etc')).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
  });

  it('reopenItem uses it: refused in an archived Epic', async () => {
    await store([rec('SIG-1', [E.created, E.triaged, E.started('M6.E12'), E.wontdo])]);
    await put('.planning/archive/epics/M6.E12/README.md', 'x\n');
    await expect(records.reopenItem(base, 'SIG-1', { reason: 'r', by }, { execFn: () => { throw new Error('no'); } }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
