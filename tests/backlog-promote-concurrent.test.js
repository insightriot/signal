// SIG-277 (M6.E14 S3): two promotes of the same inbox block must make ONE
// record. The duplicate check used to run outside the `work` lock and the
// write inside it, so a second promote that finished in between was not seen
// and the first one wrote a twin.
//
// Deterministic, one process (plan-checker I1): `acquireLock` never waits, so
// two truly overlapping writers give one record and one LOCKED, which proves
// nothing. Instead, A's `_beforeWrite` seam runs B to completion between A's
// checks and A's write — the exact window the twin needed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { promoteToBacklog, promoteToBugs } from '../plugin/tools/lib/backlog.js';
import * as records from '../plugin/tools/lib/work-records.js';

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-promote-twin-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const BLOCK = '## Make the thing faster\n\nIt is slow when the list is long.\n';

for (const [name, promote, extra] of [
  ['promoteToBacklog', promoteToBacklog, { tag: 'roadmap' }],
  ['promoteToBugs', promoteToBugs, {}],
]) {
  describe(`${name} with the store on`, () => {
    it('a second promote of the same block between the check and the write makes no twin (AC1.3)', async () => {
      let b;
      let seamRan = false;
      const a = await promote(base, {
        block: BLOCK,
        by: 'a',
        ...extra,
        _beforeWrite: async () => {
          seamRan = true;
          b = await promote(base, { block: BLOCK, by: 'b', ...extra });
        },
      });
      expect(seamRan).toBe(true);
      expect(b).toMatchObject({ written: true });
      expect(a).toMatchObject({ written: false, deduped: true, id: b.id });
      const twins = records.listRecords(base).records.filter((r) => r.record.source_ref?.endsWith(a.key));
      expect(twins.map((r) => r.id)).toEqual([b.id]);
    });

    it('a re-run after the first promote finished is still a no-op', async () => {
      const first = await promote(base, { block: BLOCK, by: 'a', ...extra });
      const again = await promote(base, { block: BLOCK, by: 'a', ...extra });
      expect(first.written).toBe(true);
      expect(again).toMatchObject({ written: false, deduped: true, id: first.id });
    });
  });
}

describe("newItems({dedupeBy: 'source_ref'}) (AC1.1)", () => {
  it('returns the existing record for a matching source_ref and writes only the new spec', async () => {
    const [first] = await records.newItems(base, [{ title: 'one', source_ref: 'k:1', by: 'a' }]);
    const out = await records.newItems(base, [
      { title: 'one again', source_ref: 'k:1', by: 'b' },
      { title: 'two', source_ref: 'k:2', by: 'b' },
    ], { dedupeBy: 'source_ref' });
    expect(out[0]).toMatchObject({ id: first.id, deduped: true });
    expect(out[1].deduped).toBeUndefined();
    expect(out[1].id).not.toBe(first.id);
    expect(records.listRecords(base).records.map((r) => r.record.title).sort()).toEqual(['one', 'two']);
  });

  it('without dedupeBy, a matching source_ref is written as before', async () => {
    await records.newItems(base, [{ title: 'one', source_ref: 'k:1', by: 'a' }]);
    await records.newItems(base, [{ title: 'one again', source_ref: 'k:1', by: 'b' }]);
    expect(records.listRecords(base).records).toHaveLength(2);
  });

  it('refuses an unknown dedupeBy, writing nothing', async () => {
    await expect(records.newItems(base, [{ title: 'x', by: 'a' }], { dedupeBy: 'title' })).rejects.toMatchObject({ code: 'SCHEMA' });
    expect(records.listRecords(base).records).toHaveLength(0);
  });
});
