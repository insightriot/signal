// Tests for triage (M6.E11.S3.t3.2, AC-5.3).
// See .planning/M6.E11-VALIDATION.md row AC-5.3. Decisions are injected —
// no model runs in tests; the proposal is deterministic lib code.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';

import {
  triageNext,
  applyTriage,
  proposeTriage,
  listNeedsReview,
  getItem,
} from '../plugin/tools/lib/work-ops.js';
import { stringifyItem, WorkStoreError } from '../plugin/tools/lib/work-item.js';
import { checkStore, parseItemFileName, walkFiles } from '../plugin/tools/lib/work-store.js';

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const at = (d) => ({ at: `2026-09-${d}T00:00:00.000Z`, by: 'b' });
const plant = (dir, folder, item, body = 'words\n') =>
  put(dir, `.planning/work/${folder}/${item.id}.md`, stringifyItem({ created: at('01'), ...item }, body));
const AT = '2026-09-29T12:00:00.000Z';
const count = (dir) => walkFiles(join(dir, '.planning/work')).filter((p) => parseItemFileName(basename(p))).length;

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-work-triage-'));
  await put(base, '.planning/work/WORK.md', '---\nkey: SIG\n---\n');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('triageNext — one item at a time, migration notes first, then oldest', () => {
  it('returns null when the inbox is empty', () => {
    expect(triageNext(base)).toBeNull();
  });

  it('orders: migration_note first, then oldest created, then number', async () => {
    await plant(base, 'inbox', { id: 'SIG-1', type: 'NEW', status: 'N', created: at('20') });
    await plant(base, 'inbox', { id: 'SIG-2', type: 'NEW', status: 'N', created: at('05') });
    await plant(base, 'inbox', { id: 'SIG-3', type: 'NEW', status: 'N', created: at('25'), migration_note: 'ambiguous' });
    await plant(base, 'backlog', { id: 'SIG-4', type: 'FEAT', status: 'T', created: at('01') });
    expect(triageNext(base).item.id).toBe('SIG-3');
    expect(triageNext(base, { exclude: ['SIG-3'] }).item.id).toBe('SIG-2');
    expect(triageNext(base, { exclude: ['SIG-3', 'SIG-2'] }).item.id).toBe('SIG-1');
    expect(triageNext(base, { exclude: ['SIG-3', 'SIG-2', 'SIG-1'] })).toBeNull();
  });

  it('carries the item, its body, path, label and a proposal', async () => {
    await plant(base, 'inbox', { id: 'SIG-1', type: 'NEW', status: 'N' }, 'The drive loop fails at PLAN\n\nmore\n');
    const t = triageNext(base);
    expect(t.path).toBe('.planning/work/inbox/SIG-1.md');
    expect(t.label).toBe('SIG-1-NEW-N');
    expect(t.body).toContain('drive loop');
    expect(t.proposal).toMatchObject({ type: 'BUG', title: 'The drive loop fails at PLAN' });
  });
});

describe('listNeedsReview — migrated rows already in backlog/ that carry a note', () => {
  it('lists T items with migration_note, by number', async () => {
    await plant(base, 'backlog', { id: 'SIG-9', type: 'FEAT', status: 'T', migration_note: 'x' });
    await plant(base, 'backlog', { id: 'SIG-3', type: 'CHORE', status: 'T', migration_note: 'y' });
    await plant(base, 'backlog', { id: 'SIG-4', type: 'FEAT', status: 'T' });
    await plant(base, 'inbox', { id: 'SIG-5', type: 'NEW', status: 'N', migration_note: 'z' });
    expect(listNeedsReview(base).map((r) => r.item.id)).toEqual(['SIG-3', 'SIG-9']);
  });
});

describe('proposeTriage — deterministic, no model', () => {
  const open = [
    { item: { id: 'SIG-10', type: 'FEAT', status: 'T', title: 'Drive loop stops at PLAN every run', theme: 'loop' } },
    { item: { id: 'SIG-11', type: 'FEAT', status: 'T', title: 'Status page redesign', theme: 'status' } },
    { item: { id: 'SIG-12', type: 'BUG', status: 'C', title: 'Drive loop stops at PLAN every run' } },
  ];

  it.each([
    [{ title: 'Checkpoint crashes on empty STATE' }, 'BUG'],
    [{ title: 'Should advise read every branch?' }, 'Q'],
    [{ title: 'Rename the sweep command' }, 'CHORE'],
    [{ title: 'Add a --json flag to status' }, 'FEAT'],
    [{ title: 'anything', source: '/sig:add --bug' }, 'BUG'],
    [{ title: 'anything', source: '/sig:add --question' }, 'Q'],
  ])('type guess for %j is %s', (fields, type) => {
    const p = proposeTriage({ id: 'SIG-1', type: 'NEW', status: 'N', ...fields }, '', []);
    expect(p.type).toBe(type);
    expect(typeof p.why.type).toBe('string');
  });

  it('keeps a type that is already set (a migrated row)', () => {
    expect(proposeTriage({ id: 'SIG-1', type: 'CHORE', status: 'T', title: 'crash' }, '', []).type).toBe('CHORE');
  });

  it('titles from the first body line when there is no title, trimmed to 80 characters', () => {
    const p = proposeTriage({ id: 'SIG-1', type: 'NEW', status: 'N' }, `## ${'word '.repeat(40)}\nrest\n`, []);
    expect(p.title.length).toBeLessThanOrEqual(80);
    expect(p.title.startsWith('word word')).toBe(true);
  });

  it('names open items with a similar title as possible duplicates, never closed ones or itself', () => {
    const p = proposeTriage({ id: 'SIG-1', type: 'NEW', status: 'N', title: 'drive loop stops at PLAN' }, '', open);
    expect(p.duplicates.map((d) => d.id)).toEqual(['SIG-10']);
    expect(p.duplicates[0].score).toBeGreaterThan(0.5);
    expect(p.theme).toBe('loop'); // borrowed from the closest match
  });

  it('is deterministic', () => {
    const item = { id: 'SIG-1', type: 'NEW', status: 'N', title: 'drive loop stops' };
    expect(proposeTriage(item, 'b', open)).toEqual(proposeTriage(item, 'b', open));
  });
});

describe('applyTriage — AC-5.3', () => {
  beforeEach(async () => {
    await plant(base, 'inbox', { id: 'SIG-1', type: 'NEW', status: 'N', title: 'raw' }, 'the words\n');
    await plant(base, 'backlog', { id: 'SIG-2', type: 'FEAT', status: 'T', title: 'existing' });
  });

  it('accept → status T in backlog/, with the chosen type, priority, theme and title', async () => {
    const r = await applyTriage(base, 'SIG-1', { accept: { type: 'BUG', priority: 2, theme: 'loop', title: 'Clear title' } }, { by: 'b' });
    expect(r.action).toBe('accept');
    expect(r.to).toBe('.planning/work/backlog/SIG-1.md');
    const g = getItem(base, 'SIG-1');
    expect(g.item).toMatchObject({ type: 'BUG', status: 'T', priority: 2, theme: 'loop', title: 'Clear title' });
    expect(g.body).toBe('the words\n'); // same file, words untouched (D-M6E11-6)
    expect(checkStore(base)).toEqual([]);
  });

  it('accept refuses to leave the type as NEW — triage is where the type is decided', async () => {
    await expect(applyTriage(base, 'SIG-1', { accept: { title: 'x' } }, { by: 'b' })).rejects.toThrow(/type/);
    expect(getItem(base, 'SIG-1').item.status).toBe('N');
  });

  it('dup → closed dup of an existing item, in done/', async () => {
    const r = await applyTriage(base, 'SIG-1', { dup: 'SIG-2' }, { by: 'b', at: AT });
    expect(r.to).toBe('.planning/work/done/2026-09/SIG-1.md');
    expect(getItem(base, 'SIG-1').item.close).toEqual({ reason: 'dup', by: 'b', at: AT, dup_of: 'SIG-2' });
  });

  it('reject → closed rejected, the reason recorded as proof', async () => {
    await applyTriage(base, 'SIG-1', { reject: 'Checked: already works on main' }, { by: 'b', at: AT });
    expect(getItem(base, 'SIG-1').item.close).toMatchObject({ reason: 'rejected', proof: 'Checked: already works on main' });
  });

  it('reject needs its reason text', async () => {
    await expect(applyTriage(base, 'SIG-1', { reject: '' }, { by: 'b', at: AT })).rejects.toThrow(WorkStoreError);
    expect(getItem(base, 'SIG-1').item.status).toBe('N');
  });

  it('skip changes nothing', async () => {
    const r = await applyTriage(base, 'SIG-1', { skip: true }, { by: 'b' });
    expect(r.action).toBe('skip');
    expect(getItem(base, 'SIG-1').path).toBe('.planning/work/inbox/SIG-1.md');
  });

  it('refuses a decision with no action or two actions', async () => {
    await expect(applyTriage(base, 'SIG-1', {}, { by: 'b' })).rejects.toThrow(/one of/);
    await expect(applyTriage(base, 'SIG-1', { skip: true, dup: 'SIG-2' }, { by: 'b' })).rejects.toThrow(/one of/);
  });

  it('refuses an item that is not awaiting triage', async () => {
    await expect(applyTriage(base, 'SIG-2', { accept: { type: 'FEAT' } }, { by: 'b' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('accept on a migrated T item with a note reviews it in place and clears the note', async () => {
    await plant(base, 'backlog', { id: 'SIG-3', type: 'FEAT', status: 'T', migration_note: 'type unclear' });
    const r = await applyTriage(base, 'SIG-3', { accept: { type: 'CHORE' } }, { by: 'b' });
    expect(r.to).toBe('.planning/work/backlog/SIG-3.md');
    const g = getItem(base, 'SIG-3').item;
    expect(g.type).toBe('CHORE');
    expect(g.migration_note).toBeUndefined();
    expect(listNeedsReview(base)).toEqual([]);
  });

  it('a whole triage run with injected answers never lowers the item count', async () => {
    await plant(base, 'inbox', { id: 'SIG-4', type: 'NEW', status: 'N', title: 'another' });
    const before = count(base);
    const answers = { 'SIG-1': { accept: { type: 'FEAT' } }, 'SIG-4': { dup: 'SIG-2' } };
    const skipped = [];
    for (let t = triageNext(base); t; t = triageNext(base, { exclude: skipped })) {
      const d = answers[t.item.id] ?? { skip: true };
      await applyTriage(base, t.item.id, d, { by: 'b', at: AT });
      if (d.skip) skipped.push(t.item.id);
    }
    expect(count(base)).toBe(before);
    expect(existsSync(join(base, '.planning/work/inbox/SIG-1.md'))).toBe(false);
    expect(getItem(base, 'SIG-4').item.close.dup_of).toBe('SIG-2');
  });
});
