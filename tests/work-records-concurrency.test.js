// M6.E13 REVIEW pass 1 suggestion — one real two-writer test of the `work` lock.
//
// The lock tests elsewhere park takers at seams; this one only starts several
// captures at once, through the public entry point, and checks what the store
// ends with. The lock fails fast (no waiting), so each capture either ran
// alone under the lock or was refused with LOCKED. Whatever the interleaving:
// every success has its own ID, every refusal is the lock's, and the store
// holds exactly the successes, each valid, with fresh views.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-records-concurrent-'));
  const p = join(base, '.planning/work/WORK.md');
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, '---\nkey: SIG\nschema_version: 2\n---\n', 'utf-8');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('newItem × N at once (the work lock, for real)', () => {
  it('no duplicate IDs: each capture succeeds alone or is refused LOCKED; the store holds exactly the successes', async () => {
    const N = 6;
    const settled = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => records.newItem(base, { type: 'FEAT', title: `capture ${i}`, by: 'claude' })),
    );
    const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
    const refused = settled.filter((s) => s.status === 'rejected').map((s) => s.reason);

    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((e) => e.id)).size).toBe(ok.length);
    for (const err of refused) expect(err, String(err?.message)).toMatchObject({ code: 'LOCKED' });

    const { records: onDisk, broken } = records.listRecords(base);
    expect(broken).toEqual([]);
    expect(onDisk.map((r) => r.id).sort()).toEqual(ok.map((e) => e.id).sort());
    expect(onDisk.map((r) => r.record.title).sort()).toEqual(ok.map((e) => e.record.title).sort());
    expect(records.findDuplicateIds(base)).toEqual([]);
    expect(records.checkRecords(base)).toEqual([]);
  });
});
