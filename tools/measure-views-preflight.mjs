#!/usr/bin/env node
// M6.E14 (SIG-280 (6)) — what the pre-write view check costs at scale.
//
// Every work-store write now renders the whole store in memory before it
// writes (`checkViewsWritable`, under the `work` lock), and the write still
// regenerates the views afterwards. The requirement is that the check adds
// under 1 s per write at 10,000 records (M6.E14-REQUIREMENTS.md, NFR). This
// builds a throwaway 10,000-record store in the OS temp folder, times the
// check alone and a full `newItem` with and without it, prints the numbers and
// deletes the store. It never touches this repository's `.planning/`.
//
// Usage: node tools/measure-views-preflight.mjs [records=10000]

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';

import { newItem, recordPath } from '../plugin/tools/lib/work-records.js';
import { checkViewsWritable, regenerateViews } from '../plugin/tools/lib/work-views.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';

const N = Number(process.argv[2] ?? 10_000);
const AT = '2026-10-07T10:00:00.000Z';
const by = 'measure';
const noGit = () => {
  throw new Error('not a repository');
};

const base = mkdtempSync(join(tmpdir(), 'sig-views-preflight-'));
try {
  const put = (rel, text) => {
    const p = join(base, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  };
  put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  for (let i = 1; i <= N; i++) {
    const events = [{ type: 'created', at: AT, by }, { type: 'triaged', at: AT, by }];
    if (i % 3 === 0) events.push({ type: 'closed', at: AT, by, reason: 'wontdo', proof: 'no' });
    put(recordPath(`SIG-${i}`), serializeRecord({ id: `SIG-${i}`, type: i % 2 ? 'BUG' : 'FEAT', title: `item ${i}`, events }));
  }
  await regenerateViews(base);

  const ms = (t0) => Math.round(performance.now() - t0);
  const check = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    checkViewsWritable(base);
    check.push(ms(t0));
  }
  let t0 = performance.now();
  await newItem(base, { title: 'with the check', by, at: AT }, { execFn: noGit });
  const withCheck = ms(t0);
  // `_skipViewsCheck` (a test-only seam) skips the pre-write check, so this is
  // the same write without it.
  t0 = performance.now();
  await newItem(base, { title: 'without the check', by, at: AT }, { execFn: noGit, _skipViewsCheck: true });
  const without = ms(t0);

  console.log(`${N} records: checkViewsWritable ${check.join(' / ')} ms; `
    + `newItem ${withCheck} ms with the check, ${without} ms without (added ${withCheck - without} ms; limit 1000 ms)`);
} finally {
  rmSync(base, { recursive: true, force: true });
}
