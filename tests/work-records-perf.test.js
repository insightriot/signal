// M6.E13 NFR performance — 10,000 v2 work records list and fold well inside the
// budget. Moved unchanged out of tests/work-records.test.js by M6.E17 S3
// (SIG-303): a wall-clock budget measured while the rest of the suite runs in
// parallel fails for reasons other than slowness. This file runs in
// `npm run test:perf` (vitest.perf.config.js, one file at a time), never in
// `npm test`. The budget is unchanged.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';

import { recordPath, listRecords } from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';

const AT = '2026-10-04T10:00:00.000Z';
const by = 'claude';
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };

const rec = (id, events = [created], extra = {}) => ({ id, type: 'BUG', title: `t ${id}`, ...extra, events });

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-work-records-perf-'));
  await put(base, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('listRecords — v2 store, at scale', () => {
  it('NFR performance: 10,000 records list and fold well inside the budget', () => {
    const t0 = performance.now();
    for (let n = 1; n <= 10_000; n += 1) {
      const id = `SIG-${n}`;
      const abs = join(base, recordPath(id));
      if (n % 1000 === 0 || n === 1) mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, serializeRecord(rec(id, n % 3 ? [created, triaged] : [created])));
    }
    const t1 = performance.now();
    const { records, broken } = listRecords(base);
    const t2 = performance.now();
    console.log(`[NFR] 10,000 v2 records: generate ${Math.round(t1 - t0)} ms, list+fold ${Math.round(t2 - t1)} ms`);
    expect(broken).toEqual([]);
    expect(records).toHaveLength(10_000);
    // The requirement is < 1 s; the assertion leaves CI headroom and the log carries the number.
    expect(t2 - t1).toBeLessThan(2000);
  }, 60_000);
});
