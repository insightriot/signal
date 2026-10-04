// /sig:docs-sweep reports the work store's own findings (M6.E11 t6.2, AC-3.3).
// See .planning/M6.E11-VALIDATION.md row AC-3.3.
//
// With the store on, every `checkRecords` finding becomes one ADVISORY sweep
// finding (path + message) — never structural: the sweep is read-only and a
// store disagreement is fixed with /sig:item, not by the sweep. With the store
// off the sweep adds nothing at all. A broken WORK.md is one advisory, never a
// crash: the sweep fails open.
//
// M6.E13 t7.4: the v1 `checkStore` was retired with the v1 store, so the
// store-on cases run on a v2 store (records under `work/items/`); a v1 store is
// one finding naming the migration (pinned in sweep-store-on.test.js).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { checkWorkStore, runSweep, renderSweepReport } from '../plugin/tools/lib/sweep.js';
import { checkRecords, recordPath } from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';

let base;
const put = async (rel, text) => {
  await mkdir(dirname(join(base, rel)), { recursive: true });
  await writeFile(join(base, rel), text, 'utf-8');
};
const WORK_MD = '---\nkey: SIG\nschema_version: 2\n---\n# Work store\n';
const AT = '2026-10-04T10:00:00.000Z';
const rec = (id) => serializeRecord({ id, type: 'BUG', title: `t ${id}`, events: [{ type: 'created', at: AT, by: 't' }] });

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'signal-work-sweep-'));
  await put('.planning/STATE.md', '---\nschema_version: 1\n---\n\n# State\n');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('checkWorkStore', () => {
  it('store off (no WORK.md) → no findings, even with a work/ folder holding a bad item', async () => {
    await put('.planning/work/backlog/SIG-1.md', '---\nid: SIG-2\n---\nnot a valid item\n');
    expect(checkWorkStore(base)).toEqual([]);
  });

  it('store on with mismatches → one advisory per checkRecords finding, with its path and message', async () => {
    await put('.planning/work/WORK.md', WORK_MD);
    await put(recordPath('SIG-1'), '{ not json\n');
    await put(recordPath('SIG-2'), rec('SIG-3')); // file name and id disagree
    const store = checkRecords(base);
    expect(store.length).toBeGreaterThan(1); // non-vacuous: several findings to carry

    const got = checkWorkStore(base);
    expect(got).toHaveLength(store.length);
    expect(got.every((f) => f.check === 'work-store' && f.severity === 'advisory')).toBe(true);
    expect(got.map((f) => [f.file, f.message])).toEqual(store.map((f) => [f.path ?? f.paths[0], f.message]));
  });

  it('a duplicate ID (finding with `paths`) is reported against its first file', async () => {
    await put('.planning/work/WORK.md', WORK_MD);
    await put(recordPath('SIG-1'), rec('SIG-1'));
    await put('.planning/work/backlog/SIG-1.md', 'x\n'); // a stray v1 item file
    const dup = checkWorkStore(base).filter((f) => /is used by 2 files/.test(f.message));
    expect(dup).toHaveLength(1);
    expect(dup[0].file).toBe(checkRecords(base).find((f) => f.code === 'duplicate-id').paths[0]);
  });

  it('store on and clean → no findings', async () => {
    await put('.planning/work/WORK.md', WORK_MD);
    await put(recordPath('SIG-1'), rec('SIG-1'));
    await regenerateViews(base);
    expect(checkWorkStore(base)).toEqual([]);
  });

  it('a malformed WORK.md → exactly one advisory saying so; it does not throw', async () => {
    await put('.planning/work/WORK.md', '---\nkey: lower\n---\n');
    let got;
    expect(() => { got = checkWorkStore(base); }).not.toThrow();
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ check: 'work-store', severity: 'advisory', file: '.planning/work/WORK.md' });
    expect(got[0].message).toMatch(/could not be checked/);
    expect(got[0].message).toMatch(/key/);
  });
});

describe('runSweep carries the work-store findings', () => {
  it('store on: they appear in the report under Advisory, and nothing becomes structural', async () => {
    await put('.planning/work/WORK.md', WORK_MD);
    await put(recordPath('SIG-1'), '{ not json\n');
    const res = await runSweep(base);
    const ours = res.findings.filter((f) => f.check === 'work-store');
    expect(ours.length).toBe(checkRecords(base).length);
    expect(ours.every((f) => f.severity === 'advisory')).toBe(true);
    expect(renderSweepReport(res)).toContain(`- [work-store] ${recordPath('SIG-1')} — `);
  });

  it('store off: no work-store finding, and the report never mentions it', async () => {
    await put('.planning/work/backlog/SIG-1.md', '---\nid: SIG-2\n---\n');
    const res = await runSweep(base);
    expect(res.findings.filter((f) => f.check === 'work-store')).toEqual([]);
    expect(renderSweepReport(res)).not.toContain('work-store');
  });

  it('malformed WORK.md: the sweep still completes and reports it once', async () => {
    await put('.planning/work/WORK.md', 'no frontmatter at all\n');
    const res = await runSweep(base);
    expect(res.findings.filter((f) => f.check === 'work-store')).toHaveLength(1);
  });
});
