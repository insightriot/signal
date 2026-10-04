// checkRecords, the v2 store check (M6.E13.S2.t2.7, AC1.3, AC5.2, NFR integrity).
// See .planning/M6.E13-VALIDATION.md rows AC1.3, AC5.2 and NFR integrity.
//
// Findings are v1 `checkStore`'s shape, `{code, id, path, message}`, so the
// sweep can switch to it by store version (t4.4). Every finding names its
// record; one broken record never stops the others from being checked.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';

const AT = '2026-10-04T10:00:00.000Z';
const by = 'claude';
const E = {
  created: { type: 'created', at: AT, by },
  triaged: { type: 'triaged', at: AT, by },
  dup: (of) => ({ type: 'closed', at: AT, by, reason: 'dup', dup_of: of }),
  wontdo: { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'no' },
  reopened: { type: 'reopened', at: AT, by, reason: 'back' },
};
const rec = (id, events, extra = {}) => ({ id, type: 'BUG', title: `t ${id}`, ...extra, events });

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const putRecord = (r, rel = records.recordPath(r.id)) => put(rel, serializeRecord(r));
const raw = (r) => `${JSON.stringify(r, null, 2)}\n`;
const codes = (findings) => findings.map((f) => [f.code, f.id]);

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-records-check-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await putRecord(rec('SIG-1', [E.created]));
  await putRecord(rec('SIG-2', [E.created, E.triaged]));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('checkRecords — a sound store', () => {
  it('has no findings', () => {
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('a store that is off has no findings (as v1 checkStore)', async () => {
    await rm(join(base, '.planning/work/WORK.md'));
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('a v1 store is ONE finding saying so, and nothing else is checked', async () => {
    await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n');
    await put('.planning/work/backlog/SIG-9.md', 'not even frontmatter\n');
    expect(records.checkRecords(base)).toEqual([{
      code: 'v1-store',
      id: null,
      path: '.planning/work/WORK.md',
      message: expect.stringMatching(/v1 work store.*work-migrate-v2/),
    }]);
  });
});

describe('checkRecords — every record validates and folds (AC1.3)', () => {
  it('invalid JSON, and a schema violation, are `invalid`, by ID', async () => {
    await put(records.recordPath('SIG-3'), '{ nope\n');
    await put(records.recordPath('SIG-4'), raw({ ...rec('SIG-4', [E.created]), status: 'C' }));
    const f = records.checkRecords(base);
    expect(codes(f)).toEqual([['invalid', 'SIG-3'], ['invalid', 'SIG-4']]);
    expect(f[1]).toMatchObject({ path: '.planning/work/items/00/SIG-4.json', message: expect.stringMatching(/status is not a known field/) });
  });

  it('events that do not fold, and an edit the record disagrees with, are `events`', async () => {
    await putRecord(rec('SIG-3', [E.created, E.triaged, E.triaged]));
    await put(records.recordPath('SIG-4'), raw(rec('SIG-4', [
      E.created, { type: 'edited', at: AT, by, changes: { title: { from: 't SIG-4', to: 'b' } } },
    ])));
    const f = records.checkRecords(base);
    expect(codes(f)).toEqual([['events', 'SIG-3'], ['events', 'SIG-4']]);
    expect(f[0].message).toMatch(/triaged is not legal from T/);
    expect(f[1].message).toMatch(/title was last edited to "b"/);
  });
});

describe('checkRecords — files and paths (AC1.1)', () => {
  it('a record outside its bucket, a name/ID mismatch and another key are `path`', async () => {
    await putRecord(rec('SIG-7', [E.created]), '.planning/work/items/03/SIG-7.json');
    await putRecord(rec('SIG-9', [E.created]), records.recordPath('SIG-8'));
    await putRecord(rec('ABC-5', [E.created]), '.planning/work/items/00/ABC-5.json');
    await putRecord(rec('SIG-11', [E.created]), '.planning/work/items/SIG-11.json');
    const f = records.checkRecords(base);
    expect(f.filter((x) => x.code === 'path').map((x) => x.path).sort()).toEqual([
      '.planning/work/items/00/ABC-5.json',
      '.planning/work/items/00/SIG-8.json',
      '.planning/work/items/03/SIG-7.json',
      '.planning/work/items/SIG-11.json',
    ]);
    expect(f.every((x) => x.code === 'path')).toBe(true);
  });

  it('a symlinked record, body or bucket is `link`; a folder named like a record is `not-regular`', async () => {
    await put('elsewhere/SIG-3.json', serializeRecord(rec('SIG-3', [E.created])));
    await symlink(join(base, 'elsewhere/SIG-3.json'), join(base, records.recordPath('SIG-3')));
    await put('elsewhere/body.md', 'x\n');
    await symlink(join(base, 'elsewhere/body.md'), join(base, records.bodyPath('SIG-2')));
    await mkdir(join(base, '.planning/work/items/00/SIG-4.json'));
    await mkdir(join(base, 'elsewhere/bucket'), { recursive: true });
    await symlink(join(base, 'elsewhere/bucket'), join(base, '.planning/work/items/05'));
    const f = records.checkRecords(base);
    expect(f.map((x) => [x.code, x.path]).sort()).toEqual([
      ['link', '.planning/work/items/00/SIG-2.md'],
      ['link', '.planning/work/items/00/SIG-3.json'],
      ['link', '.planning/work/items/05'],
      ['not-regular', '.planning/work/items/00/SIG-4.json'],
    ]);
    expect(f.find((x) => x.path.endsWith('SIG-2.md')).id).toBe('SIG-2');
  });

  it('an items/ folder that resolves outside the project is one `link` finding, and the rest still runs', async () => {
    await rm(join(base, '.planning/work/items'), { recursive: true });
    const outside = await mkdtemp(join(tmpdir(), 'sig-records-outside-'));
    try {
      await symlink(outside, join(base, '.planning/work/items'));
      await put('.planning/work/backlog/SIG-1.md', 'x\n');
      await put('.planning/work/inbox/SIG-1.md', 'x\n');
      const f = records.checkRecords(base);
      expect(codes(f)).toEqual([['duplicate-id', 'SIG-1'], ['link', null]]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('checkRecords — dup_of (store-level, Decision 3)', () => {
  it('missing, itself, and pointing at a duplicate are each reported', async () => {
    await putRecord(rec('SIG-3', [E.created, E.dup('SIG-99')]));
    await putRecord(rec('SIG-4', [E.created, E.dup('SIG-4')]));
    await putRecord(rec('SIG-5', [E.created, E.dup('SIG-1')]));
    await putRecord(rec('SIG-6', [E.created, E.dup('SIG-5')]));
    const f = records.checkRecords(base);
    expect(codes(f)).toEqual([['dup-of-missing', 'SIG-3'], ['dup-of-self', 'SIG-4'], ['dup-of-dup', 'SIG-6']]);
    expect(f[2].message).toMatch(/SIG-5 is itself a duplicate/);
  });

  it('a reopened dup is not a dup; its old dup_of is not checked, and it is a valid target', async () => {
    await putRecord(rec('SIG-3', [E.created, E.dup('SIG-99'), E.reopened]));
    await putRecord(rec('SIG-4', [E.created, E.dup('SIG-3')]));
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('a dup_of pointing at a broken record is not called missing (the broken one is reported)', async () => {
    await put(records.recordPath('SIG-3'), '{ nope\n');
    await putRecord(rec('SIG-4', [E.created, E.dup('SIG-3')]));
    expect(codes(records.checkRecords(base))).toEqual([['invalid', 'SIG-3']]);
  });
});

describe('checkRecords — duplicate IDs (AC2.3)', () => {
  it('a record and a v1 item file with one ID; the relocated v1 folder is skipped', async () => {
    await put('.planning/work/backlog/SIG-1.md', 'x\n');
    await put('.planning/archive/pre-work-store-v2/backlog/SIG-2.md', 'x\n');
    const f = records.checkRecords(base);
    expect(f).toEqual([{
      code: 'duplicate-id',
      id: 'SIG-1',
      path: '.planning/work/backlog/SIG-1.md',
      paths: ['.planning/work/backlog/SIG-1.md', '.planning/work/items/00/SIG-1.json'],
      message: expect.stringMatching(/SIG-1 is used by 2 files/),
    }]);
  });
});

describe('checkRecords — one broken record never stops the others (NFR integrity)', () => {
  it('every problem is reported, in ID order, alongside sound records', async () => {
    await put(records.recordPath('SIG-30'), '{ nope\n');
    await putRecord(rec('SIG-4', [E.created, E.triaged, E.triaged]));
    await putRecord(rec('SIG-12', [E.created, E.dup('SIG-12')]));
    await putRecord(rec('SIG-5', [E.created, E.wontdo]));
    expect(codes(records.checkRecords(base))).toEqual([['events', 'SIG-4'], ['dup-of-self', 'SIG-12'], ['invalid', 'SIG-30']]);
  });
});

describe('checkRecords — views equal a regeneration (AC5.2), through the injected seam', () => {
  const VIEW = '.planning/work/BUGS.md';

  it('with no regenerateToMemory, views are not compared', async () => {
    await put(VIEW, 'anything\n');
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('a view equal to its regeneration passes; one that differs, or is missing, is `view-stale`', async () => {
    await put(VIEW, 'fresh\n');
    const regenerateToMemory = () => ({ [VIEW]: 'fresh\n', '.planning/work/BACKLOG.md': 'b\n' });
    expect(records.checkRecords(base, { regenerateToMemory })).toEqual([
      { code: 'view-stale', id: null, path: '.planning/work/BACKLOG.md', message: expect.stringMatching(/missing/) },
    ]);
    await put(VIEW, 'edited by hand\n');
    await put('.planning/work/BACKLOG.md', 'b\n');
    expect(records.checkRecords(base, { regenerateToMemory })).toEqual([
      { code: 'view-stale', id: null, path: VIEW, message: expect.stringMatching(/differs from a regeneration/) },
    ]);
  });

  it('the generator is given the project, and a Map works as well as an object', async () => {
    await put(VIEW, 'x\n');
    let seen;
    const regenerateToMemory = (dir) => {
      seen = dir;
      return new Map([[VIEW, 'y\n']]);
    };
    expect(codes(records.checkRecords(base, { regenerateToMemory }))).toEqual([['view-stale', null]]);
    expect(seen).toBe(base);
  });

  it('a generator that throws is one finding, and the record checks still run', async () => {
    await put(records.recordPath('SIG-3'), '{ nope\n');
    const regenerateToMemory = () => {
      throw new Error('boom');
    };
    expect(records.checkRecords(base, { regenerateToMemory })).toEqual([
      expect.objectContaining({ code: 'invalid', id: 'SIG-3' }),
      { code: 'view-stale', id: null, path: '.planning/work', message: expect.stringMatching(/could not be regenerated.*boom/) },
    ]);
  });
});
