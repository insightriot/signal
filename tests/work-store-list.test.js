// Tests for listing the work store (M6.E11.S3.t3.1, AC-5.5, NFR performance).
// See .planning/M6.E11-VALIDATION.md rows AC-5.5 and AC-3.4 (the 250-item timing).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';

import { listItems, listThemes } from '../plugin/tools/lib/work-ops.js';
import { stringifyItem, WorkStoreError } from '../plugin/tools/lib/work-item.js';

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const CREATED = { at: '2026-09-01T00:00:00.000Z', by: 'b' };
const CLOSE = { reason: 'fixed', by: 'b', at: '2026-09-02T00:00:00.000Z' };
const plant = (dir, folder, item) =>
  put(dir, `.planning/work/${folder}/${item.id}.md`, stringifyItem({ created: CREATED, ...item }, 'body\n'));

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-work-list-'));
  await put(base, '.planning/work/WORK.md', '---\nkey: SIG\n---\n');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('listItems — AC-5.5', () => {
  beforeEach(async () => {
    await plant(base, 'inbox', { id: 'SIG-10', type: 'NEW', status: 'N' });
    await plant(base, 'backlog', { id: 'SIG-2', type: 'BUG', status: 'T', theme: 'loop', priority: 1 });
    await plant(base, 'backlog', { id: 'SIG-3', type: 'FEAT', status: 'T', theme: 'docs', priority: 'high' });
    await plant(base, 'epics/M6.E11', { id: 'SIG-4', type: 'FEAT', status: 'P', theme: 'loop' });
    await plant(base, 'done/2026-09', { id: 'SIG-5', type: 'BUG', status: 'C', close: CLOSE, theme: 'loop' });
    await put(base, '.planning/archive/epics/M6.E1/SIG-6.md', stringifyItem({ id: 'SIG-6', type: 'CHORE', status: 'C', created: CREATED, close: CLOSE }, 'x\n'));
    await put(base, '.planning/work/epics/M6.E11/M6.E11-PLAN.md', '# not an item\n');
  });

  it('with no filter returns every item, ordered by number, with labels and paths', () => {
    const all = listItems(base);
    expect(all.map((r) => r.item.id)).toEqual(['SIG-2', 'SIG-3', 'SIG-4', 'SIG-5', 'SIG-6', 'SIG-10']);
    const r4 = all.find((r) => r.item.id === 'SIG-4');
    expect(r4.label).toBe('SIG-4-FEAT-P');
    expect(r4.path).toBe('.planning/work/epics/M6.E11/SIG-4.md');
    expect(r4.epic).toBe('M6.E11');
    expect(all.find((r) => r.item.id === 'SIG-6').epic).toBe('M6.E1');
    expect(all.find((r) => r.item.id === 'SIG-2').epic).toBeUndefined();
  });

  it.each([
    [{ status: 'T' }, ['SIG-2', 'SIG-3']],
    [{ type: 'BUG' }, ['SIG-2', 'SIG-5']],
    [{ theme: 'loop' }, ['SIG-2', 'SIG-4', 'SIG-5']],
    [{ priority: 1 }, ['SIG-2']],
    [{ priority: '1' }, ['SIG-2']],
    [{ priority: 'high' }, ['SIG-3']],
    [{ epic: 'M6.E11' }, ['SIG-4']],
    [{ status: 'C', type: 'BUG' }, ['SIG-5']],
    [{ status: 'N' }, ['SIG-10']],
  ])('filter %j', (filter, ids) => {
    expect(listItems(base, filter).map((r) => r.item.id)).toEqual(ids);
  });

  it('refuses an unknown filter key rather than ignoring it', () => {
    expect(() => listItems(base, { stauts: 'T' })).toThrow(WorkStoreError);
  });

  it('a broken item file is named, not silently skipped', async () => {
    await put(base, '.planning/work/backlog/SIG-7.md', '---\nid: SIG-7\ntype: NOPE\nstatus: T\n---\n');
    expect(() => listItems(base)).toThrow(/SIG-7\.md[\s\S]*type/);
  });

  it('store off → CONFIG', async () => {
    await rm(join(base, '.planning/work/WORK.md'));
    expect(() => listItems(base)).toThrow(expect.objectContaining({ code: 'CONFIG' }));
  });
});

describe('listThemes', () => {
  it('lists distinct themes with counts, most-used first, then by name', async () => {
    await plant(base, 'backlog', { id: 'SIG-1', type: 'FEAT', status: 'T', theme: 'loop' });
    await plant(base, 'backlog', { id: 'SIG-2', type: 'FEAT', status: 'T', theme: 'docs' });
    await plant(base, 'backlog', { id: 'SIG-3', type: 'FEAT', status: 'T', theme: 'loop' });
    await plant(base, 'backlog', { id: 'SIG-4', type: 'FEAT', status: 'T', theme: 'api' });
    await plant(base, 'inbox', { id: 'SIG-5', type: 'NEW', status: 'N' });
    expect(listThemes(base)).toEqual([
      { theme: 'loop', count: 2 },
      { theme: 'api', count: 1 },
      { theme: 'docs', count: 1 },
    ]);
  });
});

describe('performance (NFR)', () => {
  it('lists 250 items in under a second', async () => {
    const folders = ['inbox', 'backlog', 'epics/M6.E11', 'done/2026-09'];
    const statuses = { inbox: 'N', backlog: 'T', 'epics/M6.E11': 'Q', 'done/2026-09': 'C' };
    const writes = [];
    for (let n = 1; n <= 250; n++) {
      const folder = folders[n % 4];
      const item = { id: `SIG-${n}`, type: n % 4 === 0 ? 'NEW' : 'FEAT', status: statuses[folder], theme: `t${n % 7}`, title: `Item number ${n}` };
      if (item.status === 'C') item.close = CLOSE;
      if (item.status === 'N') item.type = 'NEW';
      writes.push(plant(base, folder, item));
    }
    await Promise.all(writes);
    const t0 = performance.now();
    const all = listItems(base);
    const ms = performance.now() - t0;
    expect(all).toHaveLength(250);
    expect(ms).toBeLessThan(1000);
  });
});
