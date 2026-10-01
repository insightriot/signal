// REVIEW pass 2, Suggestions — every piece of free text that lands in an item
// runs through the one sensitive-data detector (`add.js#scrubSensitive`), not
// only a capture's title and body. Pass 1 (I3) gated newItem's title and body;
// these were still written unasked:
//   - `source_ref` (/sig:add's trigger context lands there),
//   - a triage retitle (`applyTriage` accept `title`) and a reject's reason,
//   - a close's `proof`,
//   - a backlog promote of a raw block with no inbox item (it made a new item
//     with the scrub acknowledged in advance).
// Each returns `{aborted: 'sensitive-data-pending', sensitiveHits}` and writes
// nothing unless the caller passes `acknowledgeSensitive: true` — newItem's
// contract. Detection only; never redacts.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { applyTriage, closeEpic, closeItem, closeItems, getItem, listItems, moveItem, newItem, newItems, reopenItem } from '../plugin/tools/lib/work-ops.js';
import { existsSync } from 'node:fs';
import { promoteToBacklog, promoteToBugs } from '../plugin/tools/lib/backlog.js';
import { captureToFutureIdeas } from '../plugin/tools/lib/add.js';

const SECRET = 'AKIAABCDEFGHIJKLMNOP';
const PENDING = { aborted: 'sensitive-data-pending' };
let root;

async function put(rel, text) {
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, 'utf-8');
}
const item = (id) => join(root, '.planning/work/inbox', `${id}.md`);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-scrub-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n# Work store\n');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('newItem scrubs source_ref too', () => {
  it('a secret only in source_ref → pending, nothing written; acknowledged → written', async () => {
    const r = await newItem(root, { title: 'clean', body: 'clean', source_ref: `ref ${SECRET}`, by: 't' });
    expect(r).toMatchObject(PENDING);
    expect(r.sensitiveHits.length).toBeGreaterThan(0);
    expect(listItems(root)).toEqual([]);
    const ok = await newItem(root, { title: 'clean', body: 'clean', source_ref: `ref ${SECRET}`, by: 't' }, { acknowledgeSensitive: true });
    expect(ok.id).toBe('SIG-1');
  });
});

describe('closeItem / closeItems scrub the proof', () => {
  it('a secret in proof → pending, the item unchanged; acknowledged → closed', async () => {
    const a = await newItem(root, { title: 'x', by: 't' });
    const before = await readFile(item(a.id), 'utf-8');
    const r = await closeItem(root, a.id, { reason: 'fixed', by: 't', proof: `token ${SECRET}` });
    expect(r).toMatchObject(PENDING);
    expect(await readFile(item(a.id), 'utf-8')).toBe(before);
    const batch = await closeItems(root, [{ id: a.id, reason: 'fixed', by: 't', proof: SECRET }]);
    expect(batch).toMatchObject(PENDING);
    const ok = await closeItem(root, a.id, { reason: 'fixed', by: 't', proof: `token ${SECRET}` }, { acknowledgeSensitive: true });
    expect(ok.item.status).toBe('C');
  });
});

describe('applyTriage scrubs a retitle and a reject reason', () => {
  it('accept with a secret in the new title → pending, still N in the inbox', async () => {
    const a = await newItem(root, { title: 'x', by: 't' });
    const r = await applyTriage(root, a.id, { accept: { type: 'FEAT', title: `use ${SECRET}` } });
    expect(r).toMatchObject(PENDING);
    expect(getItem(root, a.id).item.status).toBe('N');
    const ok = await applyTriage(root, a.id, { accept: { type: 'FEAT', title: `use ${SECRET}` } }, { acknowledgeSensitive: true });
    expect(ok.item.status).toBe('T');
  });

  it('reject with a secret in the reason → pending, still N', async () => {
    const a = await newItem(root, { title: 'x', by: 't' });
    const r = await applyTriage(root, a.id, { reject: `checked ${SECRET}` }, { by: 't' });
    expect(r).toMatchObject(PENDING);
    expect(getItem(root, a.id).item.status).toBe('N');
  });
});

describe('backlog promote runs the scrub when it has to create the item', () => {
  const block = `## A raw block\n\nkey ${SECRET}\n`;

  it.each([
    ['promoteToBacklog', (opts) => promoteToBacklog(root, { block, tag: 'roadmap', ...opts })],
    ['promoteToBugs', (opts) => promoteToBugs(root, { block, ...opts })],
  ])('%s: a raw block with a secret → pending, no item; acknowledged → promoted', async (_name, promote) => {
    const r = await promote({});
    expect(r).toMatchObject({ written: false, ...PENDING });
    expect(listItems(root)).toEqual([]);
    const ok = await promote({ acknowledgeSensitive: true });
    expect(ok.written).toBe(true);
    expect(getItem(root, ok.id).item.status).toBe('T');
  });

  it('a retitle with a secret on an existing inbox item → pending, still N', async () => {
    const a = await newItem(root, { title: 'x', body: 'clean', by: 't' });
    const inbox = await readFile(join(root, '.planning/ISSUES-INBOX.md'), 'utf-8');
    const start = inbox.indexOf('## ');
    const blockFor = inbox.slice(start, inbox.indexOf('\n---', start));
    const r = await promoteToBacklog(root, { block: blockFor, tag: 'roadmap', title: `t ${SECRET}` });
    expect(r).toMatchObject({ written: false, ...PENDING });
    expect(getItem(root, a.id).item.status).toBe('N');
  });
});

describe('/sig:add with the store on asks about the trigger context too', () => {
  it('a secret only in triggerContext reaches the sensitive prompt; abort writes nothing', async () => {
    const seen = [];
    const r = await captureToFutureIdeas(root, {
      body: 'clean body',
      today: '2026-09-30',
      triggerContext: `mid-EXECUTE ${SECRET}`,
      sensitivePrompt: async (hits) => {
        seen.push(...hits);
        return 'abort';
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(r.written).toBe(false);
    expect(listItems(root)).toEqual([]);
  });
});

// REVIEW pass 3 — the free text pass 2 still wrote unasked: a reopen's
// reason, a theme (at capture and at triage), and an Epic close's pr/release.
describe('the remaining free-text fields are scrubbed (REVIEW pass 3)', () => {
  it('reopenItem: a secret in the reason → pending, still closed; acknowledged → reopened', async () => {
    const a = await newItem(root, { title: 'x', by: 't' });
    await closeItem(root, a.id, { reason: 'fixed', by: 't', proof: 'p' });
    const r = await reopenItem(root, a.id, { by: 't', reason: `came back ${SECRET}` });
    expect(r).toMatchObject(PENDING);
    expect(getItem(root, a.id).item.status).toBe('C');
    const ok = await reopenItem(root, a.id, { by: 't', reason: `came back ${SECRET}` }, { acknowledgeSensitive: true });
    expect(ok.item.status).toBe('T');
  });

  it('newItems: a secret only in theme → pending, nothing written', async () => {
    const r = await newItems(root, [{ title: 'clean', theme: `t ${SECRET}`, by: 't' }]);
    expect(r).toMatchObject(PENDING);
    expect(listItems(root)).toEqual([]);
  });

  it('applyTriage accept: a secret only in theme → pending, still N', async () => {
    const a = await newItem(root, { title: 'x', by: 't' });
    const r = await applyTriage(root, a.id, { accept: { type: 'FEAT', theme: `t ${SECRET}` } });
    expect(r).toMatchObject(PENDING);
    expect(getItem(root, a.id).item.status).toBe('N');
  });

  it.each([['pr', { pr: `#1 ${SECRET}` }], ['release', { release: `v1 ${SECRET}` }]])(
    'closeEpic: a secret in %s → pending, the folder not archived',
    async (_name, extra) => {
      const a = await newItem(root, { title: 'x', by: 't' });
      await moveItem(root, a.id, { status: 'Q', epic: 'M6.E98' });
      await closeItem(root, a.id, { reason: 'fixed', by: 't', proof: 'p' });
      const r = await closeEpic(root, 'M6.E98', { by: 't', ...extra });
      expect(r).toMatchObject(PENDING);
      expect(existsSync(join(root, '.planning/work/epics/M6.E98'))).toBe(true);
      const ok = await closeEpic(root, 'M6.E98', { by: 't', ...extra }, { acknowledgeSensitive: true });
      expect(ok.status).toBe('closed');
    },
  );
});

// N1: with the store off, closeItems says so — it does not first answer
// "sensitive data pending" for a store that cannot be written at all.
describe('closeItems checks the store before the scrub (REVIEW pass 3, N1)', () => {
  it('store off + a secret in proof → CONFIG, not pending', async () => {
    await rm(join(root, '.planning/work'), { recursive: true, force: true });
    await expect(closeItems(root, [{ id: 'SIG-1', reason: 'fixed', by: 't', proof: SECRET }]))
      .rejects.toMatchObject({ code: 'CONFIG' });
  });
});
