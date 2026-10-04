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

import { execFileSync } from 'node:child_process';
import { chmod } from 'node:fs/promises';

import { closeItems, newItems, listItems, WORK_LOCK_REL } from '../plugin/tools/lib/work-ops.js';
import { WorkStoreError } from '../plugin/tools/lib/work-item.js';
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

// REVIEW pass 2, P2-I3: when an undo step itself fails, the batch is not all
// or nothing any more — and the caller must be told exactly which items are
// left changed, with the original error, as a WorkStoreError it can dispatch on.
const asRoot = process.getuid?.() === 0;

describe('newItems — the undo can fail too (REVIEW pass 2)', () => {
  it('a failed write removes the inbox/ folder it created', async () => {
    const err = await newItems(root, [spec('a?'), spec('b?')], { renameFn: failOnRename(1) }).catch((e) => e);
    expect(err.code).toBe('IO');
    expect(existsSync(join(root, '.planning/work/inbox'))).toBe(false);
    expect(existsSync(join(root, '.planning/work/WORK.md'))).toBe(true);
  });

  it.skipIf(asRoot)('item 1 cannot be removed after item 2 fails: IO naming both, and written lists what is still on disk', async () => {
    const inbox = join(root, '.planning/work/inbox');
    let i = 0;
    const renameFn = async (from, to) => {
      i += 1;
      if (i === 2) {
        await chmod(inbox, 0o500); // item 1 can no longer be unlinked
        throw new Error('disk full');
      }
      return rename(from, to);
    };
    let err;
    try {
      err = await newItems(root, [spec('a?'), spec('b?')], { renameFn }).catch((e) => e);
    } finally {
      await chmod(inbox, 0o700);
    }
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('IO');
    expect(err.message).toMatch(/disk full/);
    expect(err.message).toMatch(/SIG-1/);
    expect(err.message).toMatch(/\.planning\/work\/inbox\/SIG-1\.md/);
    expect(err.cause?.message).toBe('disk full');
    expect(err.written).toEqual(['.planning/work/inbox/SIG-1.md']);
    expect(existsSync(join(inbox, 'SIG-1.md'))).toBe(true);
  });
});

function gitRepo() {
  const g = (...a) => execFileSync('git', a, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
  g('init', '-q', '-b', 'main');
  g('add', '-A');
  g('-c', 'user.name=t', '-c', 'user.email=t@t.co', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'seed');
}
const itemText = (id, status, extra = '') =>
  `---\nid: ${id}\ntype: FEAT\nstatus: ${status}\ntitle: t ${id}\n${extra}created:\n  at: 2026-09-01T00:00:00.000Z\n  by: b\n---\nbody\n`;

describe('closeItems — all or nothing, including a failed undo (REVIEW pass 2)', () => {
  // The reviewer's two-fault repro: the write of SIG-2 fails, and putting
  // SIG-1 back (git mv done/… → backlog/SIG-1.md) fails too.
  it('write fails on item 2 AND the undo git mv of item 1 fails: IO naming the first error and SIG-1, cause kept', async () => {
    await put('.planning/work/backlog/SIG-1.md', itemText('SIG-1', 'T'));
    await put('.planning/work/backlog/SIG-2.md', itemText('SIG-2', 'T'));
    gitRepo();
    const execFn = (cmd, args, o) => {
      if (args.includes('mv') && String(args.at(-1)).endsWith('backlog/SIG-1.md')) throw new Error('undo git mv failed');
      return execFileSync(cmd, args, o);
    };
    const renameFn = async (f, t) => {
      if (t.endsWith('SIG-2.md')) throw new Error('disk full');
      return rename(f, t);
    };
    const closes = ['SIG-1', 'SIG-2'].map((id) => ({ id, reason: 'fixed', by: 'x', proof: 'p', at: AT }));
    const err = await closeItems(root, closes, { execFn, renameFn }).catch((e) => e);
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('IO');
    expect(err.message).toMatch(/disk full/);
    expect(err.message).toMatch(/SIG-1/);
    expect(err.message).toMatch(/undo git mv failed/);
    expect(err.message).not.toMatch(/SIG-2 \(/); // SIG-2 was put back
    expect(err.cause?.message).toBe('disk full');
    expect(err.leftChanged.map((c) => c.id)).toEqual(['SIG-1']);
    // SIG-2 is back where it was, as it was.
    expect(await readFile(join(root, '.planning/work/backlog/SIG-2.md'), 'utf-8')).toBe(itemText('SIG-2', 'T'));
  });

  // P2-I5: an item already in an Epic folder closes IN PLACE (D-M6E11-29), so
  // its undo is a rewrite of the original bytes, not a move. Untested before:
  // deleting that undo survived the whole suite.
  it('a P item in its Epic folder (closes in place) + a T item: write 2 fails → the P item is byte-identical, status P', async () => {
    const pText = itemText('SIG-1', 'P');
    await put('.planning/work/epics/M6.E98/README.md', '---\nepic: M6.E98\n---\n# M6.E98\n');
    await put('.planning/work/epics/M6.E98/SIG-1.md', pText);
    await put('.planning/work/backlog/SIG-2.md', itemText('SIG-2', 'T'));
    gitRepo();
    const closes = ['SIG-1', 'SIG-2'].map((id) => ({ id, reason: 'fixed', by: 'x', proof: 'p', at: AT }));
    const err = await closeItems(root, closes, { renameFn: failOnRename(2) }).catch((e) => e);
    expect(err.code).toBe('IO');
    expect(await readFile(join(root, '.planning/work/epics/M6.E98/SIG-1.md'), 'utf-8')).toBe(pText);
    expect(listItems(root).find((r) => r.item.id === 'SIG-1').item.status).toBe('P');
    expect(await readFile(join(root, '.planning/work/backlog/SIG-2.md'), 'utf-8')).toBe(itemText('SIG-2', 'T'));
  });
});

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

// REVIEW pass 3, test gaps in the undo.
describe('closeItems — undo keeps going, and relocate names what it left (REVIEW pass 3)', () => {
  // Three items; item 3's write fails; putting item 2 back fails. runUndo runs
  // newest first, so item 2's failure comes BEFORE item 1's step — an undo
  // that stopped at its first failure would leave item 1 closed too.
  it('three items, one undo step fails: the others are still restored', async () => {
    for (const id of ['SIG-1', 'SIG-2', 'SIG-3']) await put(`.planning/work/backlog/${id}.md`, itemText(id, 'T'));
    gitRepo();
    const execFn = (cmd, args, o) => {
      if (args.includes('mv') && String(args.at(-1)).endsWith('backlog/SIG-2.md')) throw new Error('undo of SIG-2 failed');
      return execFileSync(cmd, args, o);
    };
    const renameFn = async (f, t) => {
      if (t.endsWith('SIG-3.md')) throw new Error('disk full');
      return rename(f, t);
    };
    const closes = ['SIG-1', 'SIG-2', 'SIG-3'].map((id) => ({ id, reason: 'fixed', by: 'x', proof: 'p', at: AT }));
    const err = await closeItems(root, closes, { execFn, renameFn }).catch((e) => e);
    expect(err.code).toBe('IO');
    expect(err.leftChanged.map((c) => c.id)).toEqual(['SIG-2']);
    expect(await readFile(join(root, '.planning/work/backlog/SIG-1.md'), 'utf-8')).toBe(itemText('SIG-1', 'T'));
    expect(await readFile(join(root, '.planning/work/backlog/SIG-3.md'), 'utf-8')).toBe(itemText('SIG-3', 'T'));
  });

  // One item: its own write fails AND relocate's move back fails. The item is
  // named through undoFailedError, with where it was left.
  it('relocate\'s own move-back failure: IO via undoFailedError, the item on leftChanged at its new path', async () => {
    await put('.planning/work/backlog/SIG-1.md', itemText('SIG-1', 'T'));
    gitRepo();
    const execFn = (cmd, args, o) => {
      if (args.includes('mv') && String(args.at(-1)).endsWith('backlog/SIG-1.md')) throw new Error('move back failed');
      return execFileSync(cmd, args, o);
    };
    const renameFn = async (f, t) => {
      if (t.endsWith('SIG-1.md')) throw new Error('disk full');
      return rename(f, t);
    };
    const err = await closeItems(root, [{ id: 'SIG-1', reason: 'fixed', by: 'x', proof: 'p', at: AT }], { execFn, renameFn })
      .catch((e) => e);
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('IO');
    expect(err.message).toMatch(/putting everything back failed too/);
    expect(err.cause?.message).toBe('disk full');
    expect(err.leftChanged).toHaveLength(1);
    expect(err.leftChanged[0].id).toBe('SIG-1');
    expect(err.leftChanged[0].path).toMatch(/^\.planning\/work\/done\/\d{4}-\d{2}\/SIG-1\.md$/);
    expect(err.leftChanged[0].error.message).toBe('move back failed');
  });
});
