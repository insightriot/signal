// REVIEW pass 1, I3 — `newItem` runs the sensitive-data scrub.
//
// `/sig:add` and `/sig:checkpoint` scrub before writing; `/sig:item new`
// called `newItem` directly and did not, so a pasted key landed in an item
// file and the generated inbox, both committed. The scrub now lives in
// `newItem` (over title AND body). A caller that has already asked the user
// passes `acknowledgeSensitive: true`, so nobody is asked twice.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { newItem, listItems, WORK_LOCK_REL } from '../plugin/tools/lib/work-ops.js';
import { captureToFutureIdeas } from '../plugin/tools/lib/add.js';
import { captureCheckpointContext } from '../plugin/tools/lib/checkpoint.js';
import { promoteToBacklog } from '../plugin/tools/lib/backlog.js';

const AWS = 'AKIAABCDEFGHIJKLMNOP';
const AT = '2026-09-29T00:00:00.000Z';
const TODAY = '2026-09-29';

let root;
async function put(rel, text) {
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, 'utf-8');
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-sensitive-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const nothingWritten = () => {
  expect(existsSync(join(root, '.planning/work/inbox'))).toBe(false);
  expect(existsSync(join(root, '.planning/ISSUES-INBOX.md'))).toBe(false);
  expect(existsSync(join(root, WORK_LOCK_REL))).toBe(false);
};

describe('newItem scrubs before writing', () => {
  it('a key in the body → aborted with the hits, nothing written', async () => {
    const r = await newItem(root, { title: 'a note', body: `key is ${AWS}`, by: 'b', at: AT });
    expect(r.aborted).toBe('sensitive-data-pending');
    expect(r.sensitiveHits.map((h) => h.type)).toEqual(['aws-key']);
    nothingWritten();
  });

  it('a key in the title → aborted too', async () => {
    const r = await newItem(root, { title: `rotate ${AWS}`, body: 'plain', by: 'b', at: AT });
    expect(r.aborted).toBe('sensitive-data-pending');
    expect(r.sensitiveHits).toHaveLength(1);
    nothingWritten();
  });

  it('acknowledgeSensitive: true writes it', async () => {
    const r = await newItem(root, { title: 'a note', body: `key is ${AWS}`, by: 'b', at: AT }, { acknowledgeSensitive: true });
    expect(r.id).toBe('SIG-1');
    expect(await readFile(join(root, '.planning/work/inbox/SIG-1.md'), 'utf-8')).toContain(AWS);
  });

  it('clean input is written as before, with no aborted field', async () => {
    const r = await newItem(root, { title: 'clean', body: 'nothing secret', by: 'b', at: AT });
    expect(r.id).toBe('SIG-1');
    expect(r.aborted).toBeUndefined();
  });
});

describe('callers that already asked do not ask twice', () => {
  it('/sig:add (store on): a key only in the TITLE is prompted once; abort writes nothing', async () => {
    const calls = [];
    const abort = async (hits) => {
      calls.push(hits);
      return 'abort';
    };
    const r = await captureToFutureIdeas(root, { body: 'plain words', title: `rotate ${AWS}`, today: TODAY, sensitivePrompt: abort });
    expect(r).toMatchObject({ written: false, aborted: 'sensitive-data' });
    expect(calls).toHaveLength(1);
    nothingWritten();
  });

  it('/sig:add (store on): keep → prompted exactly once, and the item is written', async () => {
    let n = 0;
    const keep = async () => {
      n += 1;
      return 'keep';
    };
    const r = await captureToFutureIdeas(root, { body: `key ${AWS}`, today: TODAY, sensitivePrompt: keep });
    expect(r).toMatchObject({ written: true, id: 'SIG-1' });
    expect(n).toBe(1);
  });

  it('/sig:checkpoint (store on): an acknowledged question becomes an item', async () => {
    const first = await captureCheckpointContext(root, { questions: [`is ${AWS} live?`] });
    expect(first.aborted).toBe('sensitive-data-pending');
    const r = await captureCheckpointContext(root, { questions: [`is ${AWS} live?`], acknowledgeSensitive: true });
    expect(r.aborted).toBeUndefined();
    expect(listItems(root).map((x) => x.item.type)).toEqual(['Q']);
  });

  // Changed deliberately at REVIEW pass 2 (Suggestions). This pinned "a
  // promote re-files text already in .planning/ without refusing"; but a raw
  // block (no inbox item behind it) is new text entering an item, and with
  // the store on the drain refuses outright, so nothing had asked about it.
  // It now runs the scrub; a caller that already asked passes
  // acknowledgeSensitive.
  it('a promote of a raw block runs the scrub; acknowledged, it is filed', async () => {
    const block = `## Rotate the key\n\nThe old one was ${AWS}.\n`;
    const r = await promoteToBacklog(root, { block, tag: 'hygiene', today: TODAY });
    expect(r).toMatchObject({ written: false, aborted: 'sensitive-data-pending' });
    expect(listItems(root)).toEqual([]);
    const ok = await promoteToBacklog(root, { block, tag: 'hygiene', today: TODAY, acknowledgeSensitive: true });
    expect(ok).toMatchObject({ written: true });
    expect(listItems(root).map((x) => [x.item.type, x.item.status])).toEqual([['CHORE', 'T']]);
  });
});
