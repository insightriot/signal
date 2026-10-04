// M6.E13 t7.3 prep — triage proposals read from records (v1 `work-ops.js`
// `triageNext`, `proposeTriage`, `listNeedsReview`, `listThemes`, ported to
// `work-records.js`), so `/sig:item triage` keeps its proposals at cutover.
//
// The arithmetic is not re-implemented: `proposeTriage` (keyword rules and
// title overlap) lives in `work-triage.js` and both libraries use it. What the
// port changes is where the items come from — `listRecords` — and so:
//   - a *closing* record counts as closed, as its v1 file did (a fixed close
//     with a commit was C on v1; the converter reads it as closing);
//   - the order (migration note, oldest `created`, number) reads the
//     `created` event.
//
// Parity is checked where it can be: on a v1 store both libraries read the
// same files (work-records.js through the converter), so every answer must be
// the same. Then the same items as v2 records.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as ops from '../plugin/tools/lib/work-ops.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { proposeTriage } from '../plugin/tools/lib/work-triage.js';
import { stringifyItem } from '../plugin/tools/lib/work-item.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { snapshotTree } from './helpers/write-inventory.js';

const day = (d) => `2026-09-${d}T00:00:00.000Z`;
const by = 'b';

// One item list, written either way. `close`: C on v1; on v2 closing (a commit) or closed.
const ITEMS = [
  { id: 'SIG-1', type: 'NEW', status: 'N', created: '20', title: 'Status page crashes on load', body: 'It crashes.\n' },
  { id: 'SIG-2', type: 'NEW', status: 'N', created: '05', body: 'The drive loop stops at PLAN every run\n\nmore\n' },
  { id: 'SIG-3', type: 'NEW', status: 'N', created: '25', title: 'Should the index be cached?', migration_note: 'ambiguous' },
  { id: 'SIG-4', type: 'FEAT', status: 'T', created: '01', title: 'Status page loads slowly', theme: 'status' },
  { id: 'SIG-5', type: 'CHORE', status: 'T', created: '02', title: 'Docs refresh', theme: 'docs', migration_note: 'check' },
  { id: 'SIG-6', type: 'FEAT', status: 'T', created: '03', title: 'Drive loop stops at PLAN', theme: 'loop' },
  { id: 'SIG-7', type: 'BUG', status: 'C', created: '04', title: 'Status page crashes on load at night', theme: 'status', close: 'fixed' },
  { id: 'SIG-8', type: 'FEAT', status: 'C', created: '04', title: 'Status page crashes widget', theme: 'old', close: 'wontdo' },
];

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

async function v1Store(dir) {
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\n---\n');
  for (const it of ITEMS) {
    const fields = { id: it.id, type: it.type, status: it.status, created: { at: day(it.created), by } };
    for (const k of ['title', 'theme', 'migration_note']) if (it[k] !== undefined) fields[k] = it[k];
    if (it.close === 'fixed') fields.close = { reason: 'fixed', by, at: '2026-09-10', proof: 'fixed in commit 0123abc' };
    if (it.close === 'wontdo') fields.close = { reason: 'wontdo', by, at: '2026-09-10', proof: 'no' };
    const folder = it.status === 'N' ? 'inbox' : it.status === 'T' ? 'backlog' : 'done/2026-09';
    await put(dir, `.planning/work/${folder}/${it.id}.md`, stringifyItem(fields, it.body ?? 'words\n'));
  }
}

async function v2Store(dir) {
  await put(dir, '.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  for (const it of ITEMS) {
    const events = [{ type: 'created', at: day(it.created), by }];
    if (it.status !== 'N') events.push({ type: 'triaged', at: day(it.created), by });
    if (it.close === 'fixed') events.push({ type: 'close_requested', at: day('10'), by, reason: 'fixed', proof: '0123abc' });
    if (it.close === 'wontdo') events.push({ type: 'closed', at: day('10'), by, reason: 'wontdo', proof: 'no' });
    const record = { id: it.id, type: it.type, events };
    for (const k of ['title', 'theme', 'migration_note']) if (it[k] !== undefined) record[k] = it[k];
    await put(dir, records.recordPath(it.id), serializeRecord(record));
    await put(dir, records.bodyPath(it.id), it.body ?? 'words\n');
  }
}

let root;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-triage-v2-'));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

// The fields both shapes carry, for comparing a v1 item with a v2 one.
const core = (t) => (t === null ? null : { id: t.item.id, type: t.item.type, status: t.item.status, body: t.body, proposal: t.proposal });

describe('parity on a v1 store: work-records.js reads the same answers as work-ops.js', () => {
  it('triageNext walks the inbox in the same order with the same proposals', async () => {
    await v1Store(root);
    const seen = [];
    for (;;) {
      const a = ops.triageNext(root, { exclude: seen });
      const b = records.triageNext(root, { exclude: seen });
      expect(core(b)).toEqual(core(a));
      if (a === null) break;
      seen.push(a.item.id);
    }
    expect(seen).toEqual(['SIG-3', 'SIG-2', 'SIG-1']);
  });

  it('listNeedsReview and listThemes agree', async () => {
    await v1Store(root);
    expect(records.listNeedsReview(root).map((r) => r.item.id)).toEqual(ops.listNeedsReview(root).map((r) => r.item.id));
    expect(records.listThemes(root)).toEqual(ops.listThemes(root));
    expect(records.listThemes(root, { status: 'T' })).toEqual(ops.listThemes(root, { status: 'T' }));
  });
});

describe('on a v2 store', () => {
  it('triageNext: migration note first, then oldest, then number; item, body, path, label and proposal', async () => {
    await v2Store(root);
    const t = records.triageNext(root);
    expect(t.item.id).toBe('SIG-3');
    expect(records.triageNext(root, { exclude: ['SIG-3'] }).item.id).toBe('SIG-2');
    expect(records.triageNext(root, { exclude: ['SIG-3', 'SIG-2', 'SIG-1'] })).toBeNull();

    const two = records.triageNext(root, { exclude: ['SIG-3'] });
    expect(two.path).toBe('.planning/work/items/00/SIG-2.json');
    expect(two.label).toBe('SIG-2-NEW-N');
    expect(two.body).toContain('drive loop');
    expect(two.proposal).toMatchObject({ type: 'FEAT', title: 'The drive loop stops at PLAN every run' });
    // SIG-6 is an open look-alike; it is named as a possible duplicate and lends its theme.
    expect(two.proposal.duplicates.map((d) => d.id)).toEqual(['SIG-6']);
    expect(two.proposal.theme).toBe('loop');
  });

  it('a closing record counts as closed: never a duplicate, never a theme source', async () => {
    await v2Store(root);
    const one = records.triageNext(root, { exclude: ['SIG-3', 'SIG-2'] });
    expect(one.item.id).toBe('SIG-1');
    expect(records.getRecord(root, 'SIG-7').status).toBe('closing');
    expect(one.proposal.duplicates.map((d) => d.id)).not.toContain('SIG-7');
    expect(one.proposal).toEqual(proposeTriage(one.item, one.body, [
      { item: { id: 'SIG-4', status: 'T', title: 'Status page loads slowly', theme: 'status' } },
    ]));
  });

  it('listNeedsReview: T records with a migration note; listThemes: counts over every record', async () => {
    await v2Store(root);
    expect(records.listNeedsReview(root).map((r) => [r.item.id, r.label])).toEqual([['SIG-5', 'SIG-5-CHORE-T']]);
    expect(records.listThemes(root)).toEqual([
      { theme: 'status', count: 2 }, { theme: 'docs', count: 1 }, { theme: 'loop', count: 1 }, { theme: 'old', count: 1 },
    ]);
  });

  it('reads only: nothing under the project changes', async () => {
    await v2Store(root);
    const before = snapshotTree(root);
    records.triageNext(root);
    records.listNeedsReview(root);
    records.listThemes(root);
    expect(snapshotTree(root)).toEqual(before);
  });

  it('a broken record fails the read (SCHEMA, naming it) rather than being passed over', async () => {
    await v2Store(root);
    await put(root, records.recordPath('SIG-9'), '{ not json');
    expect(() => records.triageNext(root)).toThrow(expect.objectContaining({ code: 'SCHEMA', message: expect.stringMatching(/SIG-9/) }));
    expect(() => records.listThemes(root)).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
  });
});
