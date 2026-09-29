// Epic folders in the work store (M6.E11.S5 t5.2–t5.3, FR-8, D-M6E11-13).
// See .planning/M6.E11-VALIDATION.md rows AC-8.1 … AC-8.4.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { listItems, moveItem, newItem } from '../plugin/tools/lib/work-ops.js';
import { stringifyItem, WorkStoreError } from '../plugin/tools/lib/work-item.js';
import { GENERATED_MARKER, generateAll } from '../plugin/tools/lib/work-generate.js';

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-work-epic-'));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const storeOn = () => put('.planning/work/WORK.md', '---\nkey: SIG\n---\n# Work store\n');
const CREATED = { at: '2026-09-01T00:00:00.000Z', by: 'brett' };
const CLOSE = { reason: 'fixed', by: 'brett', at: '2026-09-20T00:00:00.000Z', proof: 'v0.1.40' };
const item = (id, type, status, extra = {}) => ({ id, type, status, title: `${id} title`, created: CREATED, ...extra });
const plant = (folder, it, body = 'The words.\n') => put(`.planning/${folder}/${it.id}.md`, stringifyItem(it, body));
const read = (rel) => readFile(join(base, rel), 'utf-8');

describe('t5.2 — list --epic reads only that Epic\'s folder (AC-8.1)', () => {
  beforeEach(async () => {
    await storeOn();
    await plant('work/epics/M6.E11', item('SIG-1', 'FEAT', 'P'));
    await plant('work/epics/M6.E11', item('SIG-2', 'BUG', 'Q'));
    await plant('work/epics/M6.E7', item('SIG-3', 'FEAT', 'Q'));
    await plant('work/backlog', item('SIG-4', 'FEAT', 'T'));
    await put('.planning/work/epics/M6.E11/M6.E11-PLAN.md', '# not an item\n');
  });

  it('returns the folder\'s items and nothing from other folders', () => {
    expect(listItems(base, { epic: 'M6.E11' }).map((r) => r.item.id)).toEqual(['SIG-1', 'SIG-2']);
  });

  it('a broken item elsewhere breaks the whole list but not the Epic\'s — it never reads outside the folder', async () => {
    await put('.planning/work/inbox/SIG-9.md', '---\nid: SIG-9\n---\nno status\n');
    expect(() => listItems(base)).toThrow(WorkStoreError);
    expect(listItems(base, { epic: 'M6.E11' }).map((r) => r.item.id)).toEqual(['SIG-1', 'SIG-2']);
  });

  it('an archived Epic\'s items are still its items', async () => {
    await plant('archive/epics/M6.E1', item('SIG-5', 'CHORE', 'C', { close: CLOSE }));
    expect(listItems(base, { epic: 'M6.E1' }).map((r) => r.item.id)).toEqual(['SIG-5']);
  });

  it('refuses an Epic ID that could leave the store', () => {
    for (const bad of ['..', '../x', 'M6.E1/..', 'nope']) {
      expect(() => listItems(base, { epic: bad })).toThrow(WorkStoreError);
    }
  });
});

describe('t5.2 — generateAll reads archived Epics too (carried finding)', () => {
  it('a closed bug archived with its Epic stays in BUGS.md', async () => {
    await storeOn();
    await plant('archive/epics/M6.E1', item('SIG-7', 'BUG', 'C', { close: CLOSE, title: 'Archived bug' }));
    await plant('work/backlog', item('SIG-8', 'BUG', 'T', { title: 'Live bug' }));
    await generateAll(base);
    const bugs = await read('.planning/BUGS.md');
    expect(bugs).toMatch(/^\| B7 \| `fixed` \|/m);
    expect(bugs).toMatch(/^\| B8 \| `confirmed` \|/m);
  });
});

describe('t5.2 — the generated Epic index, .planning/work/EPICS.md (AC-8.2)', () => {
  beforeEach(async () => {
    await storeOn();
    await plant('work/epics/M6.E11', item('SIG-1', 'FEAT', 'P'));
    await plant('work/epics/M6.E11', item('SIG-2', 'BUG', 'Q'));
    await put('.planning/archive/epics/M6.E1/README.md',
      '---\nepic: M6.E1\nclose:\n  at: 2026-09-20T00:00:00.000Z\n  by: brett\n  pr: 240\n  release: v0.1.40\n---\n# M6.E1\n');
    await plant('archive/epics/M6.E1', item('SIG-5', 'CHORE', 'C', { close: CLOSE }));
  });

  it('is generated with the marker first, one section per Epic folder, live and archived, with status and items', async () => {
    await generateAll(base);
    const text = await read('.planning/work/EPICS.md');
    expect(text.split('\n')[0]).toBe(GENERATED_MARKER);
    expect(text).toMatch(/^## M6\.E11 — open$/m);
    expect(text).toMatch(/^## M6\.E1 — closed 2026-09-20 · PR 240 · v0\.1\.40 · by brett$/m);
    expect(text).toContain('SIG-1-FEAT-P');
    expect(text).toContain('SIG-2-BUG-Q');
    expect(text).toContain('SIG-5-CHORE-C');
    // Deterministic: the same store gives the same bytes.
    await generateAll(base);
    expect(await read('.planning/work/EPICS.md')).toBe(text);
  });

  it('an Epic folder with no items is listed with "no items"', async () => {
    await mkdir(join(base, '.planning/work/epics/M6.E12'), { recursive: true });
    await generateAll(base);
    expect(await read('.planning/work/EPICS.md')).toMatch(/## M6\.E12 — open\n\n_no items_/);
  });

  it('regenerates on a mutation: an item moved into an Epic appears under it', async () => {
    await generateAll(base);
    const it3 = await newItem(base, { type: 'FEAT', title: 'Moved in', by: 'brett' });
    await moveItem(base, it3.id, { status: 'Q', epic: 'M6.E11' });
    expect(await read('.planning/work/EPICS.md')).toContain(`${it3.id}-FEAT-Q`);
  });

  it('is never written when the store is off', async () => {
    await rm(join(base, '.planning/work/WORK.md'));
    await generateAll(base);
    expect(existsSync(join(base, '.planning/work/EPICS.md'))).toBe(false);
  });
});
