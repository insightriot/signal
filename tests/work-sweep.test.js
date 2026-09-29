// /sig:docs-sweep reports the work store's own findings (M6.E11 t6.2, AC-3.3).
// See .planning/M6.E11-VALIDATION.md row AC-3.3.
//
// With the store on, every `checkStore` finding becomes one ADVISORY sweep
// finding (path + message) — never structural: the sweep is read-only and a
// store disagreement is fixed with /sig:item, not by the sweep. With the store
// off the sweep adds nothing at all. A broken WORK.md is one advisory, never a
// crash: the sweep fails open.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { checkWorkStore, runSweep, renderSweepReport } from '../plugin/tools/lib/sweep.js';
import { checkStore } from '../plugin/tools/lib/work-store.js';

let base;
const put = async (rel, text) => {
  await mkdir(dirname(join(base, rel)), { recursive: true });
  await writeFile(join(base, rel), text, 'utf-8');
};
const WORK_MD = '---\nkey: SIG\n---\n# Work store\n';

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

  it('store on with mismatches → one advisory per checkStore finding, with its path and message', async () => {
    await put('.planning/work/WORK.md', WORK_MD);
    await put('.planning/work/backlog/SIG-1.md', '---\nid: SIG-2\n---\nnot a valid item\n');
    await put('.planning/work/stray/SIG-3.md', '---\nid: SIG-3\n---\n');
    const store = checkStore(base);
    expect(store.length).toBeGreaterThan(1); // non-vacuous: several findings to carry

    const got = checkWorkStore(base);
    expect(got).toHaveLength(store.length);
    expect(got.every((f) => f.check === 'work-store' && f.severity === 'advisory')).toBe(true);
    expect(got.map((f) => [f.file, f.message])).toEqual(store.map((f) => [f.path ?? f.paths[0], f.message]));
  });

  it('a duplicate ID (finding with `paths`, no `path`) is reported against its first file', async () => {
    await put('.planning/work/WORK.md', WORK_MD);
    await put('.planning/work/backlog/SIG-1.md', '---\nid: SIG-1\n---\n');
    await put('.planning/work/inbox/SIG-1.md', '---\nid: SIG-1\n---\n');
    const dup = checkWorkStore(base).filter((f) => /is used by 2 files/.test(f.message));
    expect(dup).toHaveLength(1);
    expect(dup[0].file).toMatch(/^\.planning\/work\/(backlog|inbox)\/SIG-1\.md$/);
  });

  it('store on and clean → no findings', async () => {
    await put('.planning/work/WORK.md', WORK_MD);
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
    await put('.planning/work/backlog/SIG-1.md', '---\nid: SIG-2\n---\n');
    const res = await runSweep(base);
    const ours = res.findings.filter((f) => f.check === 'work-store');
    expect(ours.length).toBe(checkStore(base).length);
    expect(ours.every((f) => f.severity === 'advisory')).toBe(true);
    expect(renderSweepReport(res)).toContain('- [work-store] .planning/work/backlog/SIG-1.md — ');
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
