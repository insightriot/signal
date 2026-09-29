// REVIEW pass 1, I7 — `/sig:checkpoint` with the store on could half-write.
//
// It called `newItem` once per question (a lock and a full regeneration
// each) with no catch, AFTER writing DECISIONS.md: a busy lock on question 2
// of 3 lost questions 2 and 3 with the decisions already on disk. Now the
// questions go through `newItems` — one lock, sequential IDs, one
// regeneration — which removes the items it wrote if a later one fails, and
// runs BEFORE the decisions, so a failed batch leaves nothing written at all.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';

import { newItems, listItems, WORK_LOCK_REL } from '../plugin/tools/lib/work-ops.js';
import { captureCheckpointContext } from '../plugin/tools/lib/checkpoint.js';
import { parseItemFileName, walkFiles } from '../plugin/tools/lib/work-store.js';

const AT = '2026-09-29T00:00:00.000Z';
let root;
async function put(rel, text) {
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, 'utf-8');
}
const itemCount = () =>
  walkFiles(join(root, '.planning', 'work')).filter((p) => parseItemFileName(basename(p))).length;

// A renameFn that fails the nth rename (1-based) — atomicWrite's last step,
// so the nth item file never lands.
function failOnRename(n) {
  let i = 0;
  return async (from, to) => {
    i += 1;
    if (i === n) throw new Error(`injected failure on write ${n}`);
    return rename(from, to);
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-batch-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const spec = (title) => ({ type: 'Q', title, body: `${title}\n`, source: 't', by: 't', at: AT });

describe('newItems', () => {
  it('writes every item under one lock with sequential IDs, then the lists', async () => {
    await put('.planning/work/backlog/SIG-4.md', '---\nid: SIG-4\ntype: FEAT\nstatus: T\ntitle: x\ncreated:\n  at: 2026-09-01T00:00:00.000Z\n  by: b\n---\n');
    const items = await newItems(root, [spec('one?'), spec('two?'), spec('three?')]);
    expect(items.map((i) => i.id)).toEqual(['SIG-5', 'SIG-6', 'SIG-7']);
    expect(listItems(root, { type: 'Q' }).map((r) => r.item.id)).toEqual(['SIG-5', 'SIG-6', 'SIG-7']);
    const oq = await readFile(join(root, '.planning/OPEN-QUESTIONS.md'), 'utf-8');
    for (const id of ['SIG-5', 'SIG-6', 'SIG-7']) expect(oq).toContain(id);
    expect(existsSync(join(root, WORK_LOCK_REL))).toBe(false);
  });

  it('a failure on item 2 of 3 removes item 1 and writes nothing else — only what it created', async () => {
    await put('.planning/work/inbox/SIG-1.md', '---\nid: SIG-1\ntype: NEW\nstatus: N\ntitle: kept\ncreated:\n  at: 2026-09-01T00:00:00.000Z\n  by: b\n---\n');
    const err = await newItems(root, [spec('a?'), spec('b?'), spec('c?')], { renameFn: failOnRename(2) }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/injected failure on write 2/);
    expect(err.written).toEqual([]);
    expect(itemCount()).toBe(1); // the pre-existing item is untouched
    expect(existsSync(join(root, '.planning/work/inbox/SIG-1.md'))).toBe(true);
    expect(existsSync(join(root, '.planning/OPEN-QUESTIONS.md'))).toBe(false); // never regenerated
    expect(existsSync(join(root, WORK_LOCK_REL))).toBe(false);
  });

  it('refuses the whole batch before writing if one spec is invalid', async () => {
    await expect(newItems(root, [spec('fine?'), { ...spec('no by'), by: undefined }])).rejects.toMatchObject({ code: 'SCHEMA' });
    expect(itemCount()).toBe(0);
  });

  it('a secret in any spec aborts the batch unless acknowledged', async () => {
    const r = await newItems(root, [spec('fine?'), spec('AKIAABCDEFGHIJKLMNOP?')]);
    expect(r).toMatchObject({ aborted: 'sensitive-data-pending' });
    expect(itemCount()).toBe(0);
  });
});

describe('/sig:checkpoint with the store on — all or nothing', () => {
  it('a failure on question 2 of 3: no question items, and DECISIONS.md / CONTEXT.md NOT written; the result says so', async () => {
    const r = await captureCheckpointContext(root, {
      decisions: ['Use the batch.'],
      questions: ['First?', 'Second?', 'Third?'],
      _renameFn: failOnRename(2),
    });
    expect(r.aborted).toBe('work-store-failed');
    expect(r.wrote).toEqual([]);
    expect(r.error.message).toMatch(/injected failure on write 2/);
    expect(itemCount()).toBe(0);
    expect(existsSync(join(root, '.planning/DECISIONS.md'))).toBe(false);
    expect(existsSync(join(root, '.planning/CONTEXT.md'))).toBe(false);
  });

  it('a busy work lock: the same — nothing written, the lock error reported', async () => {
    await put(WORK_LOCK_REL, `999\n${Date.now()}\n`);
    const r = await captureCheckpointContext(root, { decisions: ['D.'], questions: ['A?', 'B?'] });
    expect(r.aborted).toBe('work-store-failed');
    expect(r.wrote).toEqual([]);
    expect(r.error.message).toMatch(/work store/);
    expect(existsSync(join(root, '.planning/DECISIONS.md'))).toBe(false);
  });

  it('success: decisions, then every question as a Q item, one regeneration', async () => {
    const r = await captureCheckpointContext(root, { decisions: ['D.'], questions: ['A?', 'B?'] });
    expect(r.aborted).toBeUndefined();
    expect(r.wrote.map((p) => p.slice(root.length + 1))).toEqual([
      '.planning/CONTEXT.md',
      '.planning/DECISIONS.md',
      '.planning/work/inbox/SIG-1.md',
      '.planning/work/inbox/SIG-2.md',
    ]);
  });
});
