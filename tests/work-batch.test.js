// REVIEW pass 1, I7 — `/sig:checkpoint` with the store on could half-write.
//
// It called `newItem` once per question (a lock and a full regeneration
// each) with no catch, AFTER writing DECISIONS.md: a busy lock on question 2
// of 3 lost questions 2 and 3 with the decisions already on disk. Now the
// questions go through `newItems` — one lock, sequential IDs, one
// regeneration — which removes the items it wrote if a later one fails, and
// runs BEFORE the decisions, so a failed batch leaves nothing written at all.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { captureCheckpointContext } from '../plugin/tools/lib/checkpoint.js';
import { WORK_LOCK_REL } from '../plugin/tools/lib/work-store.js';

let root;
async function put(rel, text) {
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, 'utf-8');
}
// A renameFn that fails the nth rename (1-based) — atomicWrite's last step,
// so the nth file never lands.
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

// M6.E13 t7.4: the v1 `newItems` / `closeItems` batch cases (their undo
// paths included) were retired with the v1 writers; the v2 library's
// all-or-nothing batches are pinned in work-records-write/-close.

// M6.E13 t4.5b: /sig:checkpoint writes v2 records (`work-records.js`
// `newItems`: per question its body, then its record), so this runs on a v2 store.
describe('/sig:checkpoint with the store on — all or nothing (v2)', () => {
  beforeEach(() => put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n'));
  const noItems = () => expect(existsSync(join(root, '.planning/work/items'))).toBe(false);

  it('a failure on question 2 of 3: no question records, and DECISIONS.md / CONTEXT.md NOT written; the result says so', async () => {
    const r = await captureCheckpointContext(root, {
      decisions: ['Use the batch.'],
      questions: ['First?', 'Second?', 'Third?'],
      _renameFn: failOnRename(4), // question 1's body and record, question 2's body, then its record
    });
    expect(r.aborted).toBe('work-store-failed');
    expect(r.wrote).toEqual([]);
    expect(r.error.message).toMatch(/injected failure on write 4/);
    noItems();
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

  it('success: decisions, then every question as a Q record, one regeneration', async () => {
    const r = await captureCheckpointContext(root, { decisions: ['D.'], questions: ['A?', 'B?'] });
    expect(r.aborted).toBeUndefined();
    expect(r.wrote.map((p) => p.slice(root.length + 1))).toEqual([
      '.planning/CONTEXT.md',
      '.planning/DECISIONS.md',
      '.planning/work/items/00/SIG-1.json',
      '.planning/work/items/00/SIG-2.json',
    ]);
  });
});
