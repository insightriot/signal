// The v2 write side, part 2 (M6.E13.S2.t2.2b): requestClose, closeItem(s),
// reopenItem, editItem. See .planning/M6.E13-VALIDATION.md rows AC1.4
// (store-level dup_of checks), AC2.1, AC2.4, AC7.1.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { acquireLock } from '../plugin/tools/lib/file-lock.js';
import { WORK_LOCK_REL } from '../plugin/tools/lib/work-store.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-04T10:00:00.000Z';
const by = 'claude';
const SHA = '0123abc';
const E = {
  created: { type: 'created', at: AT, by },
  triaged: { type: 'triaged', at: AT, by },
  queued: { type: 'queued', at: AT, by, epic: 'M6.E13' },
  started: { type: 'started', at: AT, by, epic: 'M6.E12' },
  closing: { type: 'close_requested', at: AT, by, reason: 'fixed', proof: SHA },
  wontdo: { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'no' },
  dupOf1: { type: 'closed', at: AT, by, reason: 'dup', dup_of: 'SIG-1' },
};
const rec = (id, events, extra = {}) => ({ id, type: 'BUG', title: `t ${id}`, ...extra, events });
const SECRET = 'AKIAABCDEFGHIJKLMNOP';
const PENDING = { aborted: 'sensitive-data-pending' };

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const read = async (id) => JSON.parse(await readFile(join(base, records.recordPath(id)), 'utf-8'));
const failingRename = async () => {
  throw new Error('injected');
};

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-records-close-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  const fixtures = [
    rec('SIG-1', [E.created]),
    rec('SIG-2', [E.created, E.triaged]),
    rec('SIG-3', [E.created, E.triaged, E.queued]),
    rec('SIG-4', [E.created, E.triaged, E.started, E.wontdo]), // closed in M6.E12
    rec('SIG-5', [E.created, E.closing]),
    rec('SIG-6', [E.created, E.wontdo]),
    rec('SIG-7', [E.created, E.dupOf1]),
  ];
  for (const r of fixtures) await put(records.recordPath(r.id), serializeRecord(r));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('requestClose (AC7.1)', () => {
  it('a commit token derives closing, the Epic kept', async () => {
    const r = await records.requestClose(base, 'SIG-3', { proof: SHA, by, at: AT });
    expect(r).toMatchObject({ status: 'closing', epic: 'M6.E13' });
    expect((await read('SIG-3')).events.at(-1)).toEqual({ ...E.closing });
  });

  it.each([['not a hash'], ['0123ABC'], ['abc'], [`${SHA} fixes it`], [undefined]])(
    'proof %j is refused: it must be a bare hex commit hash',
    async (proof) => {
      const before = snapshotTree(base);
      await expect(records.requestClose(base, 'SIG-2', { proof, by })).rejects.toMatchObject({ code: 'SCHEMA' });
      expect(snapshotTree(base)).toEqual(before);
    },
  );

  it('from closing or closed it is refused, nothing written', async () => {
    const before = snapshotTree(base);
    await expect(records.requestClose(base, 'SIG-5', { proof: SHA, by })).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(records.requestClose(base, 'SIG-6', { proof: SHA, by })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('a full 40-character hash is accepted (its proof is not scrubbed: it can only be hex)', async () => {
    const full = 'a'.repeat(40);
    expect(await records.requestClose(base, 'SIG-2', { proof: full, by })).toMatchObject({ status: 'closing' });
  });
});

describe('closeItem — direct closes', () => {
  it.each([['stale'], ['wontdo'], ['rejected']])('%s with proof text closes (C), the Epic kept', async (reason) => {
    const r = await records.closeItem(base, 'SIG-3', { reason, proof: 'checked: gone', by, at: AT });
    expect(r).toMatchObject({ status: 'C', epic: 'M6.E13' });
    expect((await read('SIG-3')).events.at(-1)).toEqual({ type: 'closed', at: AT, by, reason, proof: 'checked: gone' });
  });

  it.each([['stale'], ['wontdo'], ['rejected']])('%s without proof text is refused', async (reason) => {
    const before = snapshotTree(base);
    await expect(records.closeItem(base, 'SIG-2', { reason, by })).rejects.toMatchObject({ code: 'SCHEMA' });
    await expect(records.closeItem(base, 'SIG-2', { reason, proof: '  ', by })).rejects.toMatchObject({ code: 'SCHEMA' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('fixed is refused, pointing at requestClose', async () => {
    await expect(records.closeItem(base, 'SIG-2', { reason: 'fixed', proof: SHA, by }))
      .rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringContaining('requestClose') });
  });

  it('an unknown reason is refused', async () => {
    await expect(records.closeItem(base, 'SIG-2', { reason: 'done', proof: 'x', by })).rejects.toMatchObject({ code: 'SCHEMA' });
  });

  it('a closing item may still close as wontdo', async () => {
    expect(await records.closeItem(base, 'SIG-5', { reason: 'wontdo', proof: 'not needed', by })).toMatchObject({ status: 'C' });
  });

  it('an already closed item is refused', async () => {
    await expect(records.closeItem(base, 'SIG-6', { reason: 'stale', proof: 'x', by })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  describe('dup (store-level checks, AC1.4)', () => {
    it('dup of an existing item closes, with dup_of and no proof', async () => {
      const r = await records.closeItem(base, 'SIG-2', { reason: 'dup', dup_of: 'SIG-1', by, at: AT });
      expect(r.status).toBe('C');
      expect((await read('SIG-2')).events.at(-1)).toEqual({ ...E.dupOf1 });
    });

    it.each([
      ['no dup_of', undefined, 'SCHEMA'],
      ['itself', 'SIG-2', 'SCHEMA'],
      ['a missing item', 'SIG-99', 'NOT_FOUND'],
      ['an item that is itself a dup', 'SIG-7', 'CONFLICT'],
      ['not an ID', 'B12', 'SCHEMA'],
    ])('dup of %s is refused', async (_, dupOf, code) => {
      const before = snapshotTree(base);
      await expect(records.closeItem(base, 'SIG-2', { reason: 'dup', dup_of: dupOf, by })).rejects.toMatchObject({ code });
      expect(snapshotTree(base)).toEqual(before);
    });

    it('a dup that was reopened is no longer a dup, and may be a target', async () => {
      await records.reopenItem(base, 'SIG-7', { reason: 'not a dup after all', by });
      expect(await records.closeItem(base, 'SIG-2', { reason: 'dup', dup_of: 'SIG-7', by })).toMatchObject({ status: 'C' });
    });

    it('dup_of with a non-dup reason is refused', async () => {
      await expect(records.closeItem(base, 'SIG-2', { reason: 'wontdo', proof: 'x', dup_of: 'SIG-1', by }))
        .rejects.toMatchObject({ code: 'SCHEMA' });
    });
  });
});

describe('closeItems — a batch', () => {
  it('closes all under one lock', async () => {
    const r = await records.closeItems(base, [
      { id: 'SIG-1', reason: 'stale', proof: 'old', by },
      { id: 'SIG-2', reason: 'dup', dup_of: 'SIG-3', by },
    ]);
    expect(r.map((x) => x.status)).toEqual(['C', 'C']);
  });

  it('a failure part-way puts back what it closed', async () => {
    const before = snapshotTree(base);
    let n = 0;
    const renameFn = async (a, b) => {
      n += 1;
      if (n === 2) throw new Error('disk full');
      return rename(a, b);
    };
    await expect(records.closeItems(base, [
      { id: 'SIG-1', reason: 'stale', proof: 'old', by },
      { id: 'SIG-2', reason: 'stale', proof: 'old', by },
    ], { renameFn })).rejects.toMatchObject({ code: 'IO' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('one bad close refuses the whole batch before anything is written', async () => {
    const before = snapshotTree(base);
    await expect(records.closeItems(base, [
      { id: 'SIG-1', reason: 'stale', proof: 'old', by },
      { id: 'SIG-6', reason: 'stale', proof: 'old', by },
    ])).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('the same item twice, or a dup of an item dup-closed in the same batch, is refused', async () => {
    await expect(records.closeItems(base, [
      { id: 'SIG-1', reason: 'stale', proof: 'a', by },
      { id: 'SIG-1', reason: 'stale', proof: 'b', by },
    ])).rejects.toMatchObject({ code: 'SCHEMA' });
    await expect(records.closeItems(base, [
      { id: 'SIG-1', reason: 'dup', dup_of: 'SIG-3', by },
      { id: 'SIG-2', reason: 'dup', dup_of: 'SIG-1', by },
    ])).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('an empty batch is refused', async () => {
    await expect(records.closeItems(base, [])).rejects.toMatchObject({ code: 'SCHEMA' });
  });
});

describe('reopenItem', () => {
  it('C → T, the Epic cleared, the reason recorded', async () => {
    await records.closeItem(base, 'SIG-3', { reason: 'wontdo', proof: 'x', by });
    const r = await records.reopenItem(base, 'SIG-3', { reason: 'it came back', by, at: AT });
    expect(r).toMatchObject({ status: 'T', epic: null });
    expect((await read('SIG-3')).events.at(-1)).toEqual({ type: 'reopened', at: AT, by, reason: 'it came back' });
  });

  it('closing → T', async () => {
    expect(await records.reopenItem(base, 'SIG-5', { reason: 'commit reverted', by })).toMatchObject({ status: 'T' });
  });

  it('an open item is refused', async () => {
    await expect(records.reopenItem(base, 'SIG-2', { reason: 'x', by })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('a blank reason is refused', async () => {
    await expect(records.reopenItem(base, 'SIG-6', { reason: ' ', by })).rejects.toMatchObject({ code: 'SCHEMA' });
    await expect(records.reopenItem(base, 'SIG-6', { by })).rejects.toMatchObject({ code: 'SCHEMA' });
  });

  it('refused when the item\'s Epic is archived, nothing written', async () => {
    await put('.planning/archive/epics/M6.E12/README.md', 'archived\n');
    const before = snapshotTree(base);
    await expect(records.reopenItem(base, 'SIG-4', { reason: 'x', by }))
      .rejects.toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('M6.E12') });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('allowed when the item\'s Epic is not archived', async () => {
    expect(await records.reopenItem(base, 'SIG-4', { reason: 'x', by })).toMatchObject({ status: 'T' });
  });
});

describe('editItem', () => {
  it('records one edited event with from/to, status unchanged', async () => {
    const r = await records.editItem(base, 'SIG-3', { changes: { title: 'new', priority: 2 }, by, at: AT });
    expect(r).toMatchObject({ status: 'Q', epic: 'M6.E13' });
    const now = await read('SIG-3');
    expect(now).toMatchObject({ title: 'new', priority: 2 });
    expect(now.events.at(-1)).toEqual({
      type: 'edited', at: AT, by, changes: { title: { from: 't SIG-3', to: 'new' }, priority: { from: null, to: 2 } },
    });
  });

  it('to: null removes the field', async () => {
    await records.editItem(base, 'SIG-2', { changes: { theme: 'x' }, by });
    await records.editItem(base, 'SIG-2', { changes: { theme: null }, by });
    const now = await read('SIG-2');
    expect(now).not.toHaveProperty('theme');
    expect(now.events.at(-1).changes).toEqual({ theme: { from: 'x', to: null } });
  });

  it('a no-op change is dropped; all no-ops is refused', async () => {
    const r = await records.editItem(base, 'SIG-2', { changes: { title: 't SIG-2', theme: 'a' }, by });
    expect(r.record.events.at(-1).changes).toEqual({ theme: { from: null, to: 'a' } });
    await expect(records.editItem(base, 'SIG-2', { changes: { theme: 'a' }, by })).rejects.toMatchObject({ code: 'SCHEMA' });
  });

  it.each([['id'], ['events'], ['status'], ['epic']])('a change to %s is refused', async (field) => {
    const before = snapshotTree(base);
    await expect(records.editItem(base, 'SIG-2', { changes: { [field]: 'x' }, by })).rejects.toMatchObject({ code: 'SCHEMA' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('an invalid value is refused by the schema', async () => {
    await expect(records.editItem(base, 'SIG-2', { changes: { title: 'two\nlines' }, by })).rejects.toMatchObject({ code: 'SCHEMA' });
    await expect(records.editItem(base, 'SIG-2', { changes: { type: 'EPIC' }, by })).rejects.toMatchObject({ code: 'SCHEMA' });
  });

  it('an empty or missing changes is refused', async () => {
    await expect(records.editItem(base, 'SIG-2', { changes: {}, by })).rejects.toMatchObject({ code: 'SCHEMA' });
    await expect(records.editItem(base, 'SIG-2', { by })).rejects.toMatchObject({ code: 'SCHEMA' });
  });
});

describe('every t2.2b mutation: lock, atomicity, regenerate, v1 refusal (AC2.1)', () => {
  const MUTATIONS = {
    requestClose: (b, o) => records.requestClose(b, 'SIG-2', { proof: SHA, by }, o),
    closeItem: (b, o) => records.closeItem(b, 'SIG-2', { reason: 'stale', proof: 'x', by }, o),
    closeItems: (b, o) => records.closeItems(b, [{ id: 'SIG-2', reason: 'stale', proof: 'x', by }], o),
    reopenItem: (b, o) => records.reopenItem(b, 'SIG-6', { reason: 'back', by }, o),
    editItem: (b, o) => records.editItem(b, 'SIG-2', { changes: { title: 'e' }, by }, o),
  };
  for (const [name, run] of Object.entries(MUTATIONS)) {
    it(`${name}: regenerate is called once, after the write`, async () => {
      const calls = [];
      await run(base, { regenerate: async (b) => calls.push(b) });
      expect(calls).toEqual([base]);
    });

    it(`${name}: a second writer holding the lock gets LOCKED, nothing written`, async () => {
      const lock = await acquireLock(join(base, WORK_LOCK_REL), { label: 'work store' });
      try {
        const before = snapshotTree(base);
        await expect(run(base, {})).rejects.toMatchObject({ code: 'LOCKED' });
        expect(snapshotTree(base)).toEqual(before);
      } finally {
        await lock.released();
      }
    });

    it(`${name}: a failure injected at the rename leaves the record unchanged`, async () => {
      const before = snapshotTree(base);
      await expect(run(base, { renameFn: failingRename })).rejects.toMatchObject({ code: 'IO' });
      expect(snapshotTree(base)).toEqual(before);
    });

    it(`${name}: refused on a v1 store, naming the migration script`, async () => {
      await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n');
      const before = snapshotTree(base);
      await expect(run(base, {})).rejects.toMatchObject({ code: 'CONFIG', message: expect.stringContaining('node tools/work-migrate-v2.mjs') });
      expect(snapshotTree(base)).toEqual(before);
      expect(existsSync(join(base, WORK_LOCK_REL))).toBe(false);
    });
  }
});

describe('secret scrubbing (AC2.4): close proof, reopen reason, edited values', () => {
  const cases = {
    'close proof': (o) => records.closeItem(base, 'SIG-2', { reason: 'rejected', proof: `see ${SECRET}`, by }, o),
    'closeItems proof': (o) => records.closeItems(base, [{ id: 'SIG-2', reason: 'stale', proof: SECRET, by }], o),
    'reopen reason': (o) => records.reopenItem(base, 'SIG-6', { reason: SECRET, by }, o),
    'edited value': (o) => records.editItem(base, 'SIG-2', { changes: { source_ref: SECRET }, by }, o),
  };
  for (const [name, run] of Object.entries(cases)) {
    it(`${name}: sensitive-data-pending, nothing written; acknowledged, it writes`, async () => {
      const before = snapshotTree(base);
      const r = await run({});
      expect(r).toMatchObject(PENDING);
      expect(r.sensitiveHits[0]).toMatchObject({ type: 'aws-key', match: SECRET });
      expect(snapshotTree(base)).toEqual(before);
      expect(await run({ acknowledgeSensitive: true })).not.toHaveProperty('aborted');
      expect(snapshotTree(base)).not.toEqual(before);
    });
  }
});
