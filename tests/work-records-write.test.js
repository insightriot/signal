// The v2 write side, part 1 (M6.E13.S2.t2.2a): newItem(s), triageItem,
// queueItem, startItem. See .planning/M6.E13-VALIDATION.md rows AC2.1, AC2.4.
//
// Each mutation: one `work` lock, validated with checkEvents before anything
// is written, the record written atomically, exactly one event per changed
// record (a triaged capture: created + triaged, in one locked write), then the
// injected `regenerate` hook. On a v1 store every mutation refuses, naming
// `node tools/work-migrate-v2.mjs`, and writes nothing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
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
const E = {
  created: { type: 'created', at: AT, by },
  triaged: { type: 'triaged', at: AT, by },
  queued: { type: 'queued', at: AT, by, epic: 'M6.E13' },
  started: { type: 'started', at: AT, by, epic: 'M6.E13' },
  closing: { type: 'close_requested', at: AT, by, reason: 'fixed', proof: '0123abc' },
  wontdo: { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'no' },
};
const rec = (id, events, extra = {}) => ({ id, type: 'BUG', title: `t ${id}`, ...extra, events });
const SECRET = 'AKIAABCDEFGHIJKLMNOP';
const noGit = () => {
  throw new Error('not a repo');
};

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const read = async (id) => JSON.parse(await readFile(join(base, records.recordPath(id)), 'utf-8'));
const opts = (o = {}) => ({ execFn: noGit, ...o });

async function v2Store() {
  base = await mkdtemp(join(tmpdir(), 'sig-records-write-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  const fixtures = [
    rec('SIG-1', [E.created], { type: 'NEW' }),
    rec('SIG-2', [E.created, E.triaged]),
    rec('SIG-3', [E.created, E.triaged, E.queued]),
    rec('SIG-4', [E.created, E.triaged, E.started]),
    rec('SIG-5', [E.created, E.closing]),
    rec('SIG-6', [E.created, E.wontdo]),
  ];
  for (const r of fixtures) await put(records.recordPath(r.id), serializeRecord(r));
}

beforeEach(v2Store);
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('newItem / newItems', () => {
  it('writes a record at recordPath with one created event, status N, and its body', async () => {
    const r = await records.newItem(base, { title: 'a thing', body: 'why\n', by, at: AT, source: 'add' }, opts());
    expect(r.id).toBe('SIG-7');
    expect(r.status).toBe('N');
    const onDisk = await read('SIG-7');
    expect(onDisk).toEqual({ id: 'SIG-7', type: 'NEW', title: 'a thing', source: 'add', events: [E.created] });
    expect(await readFile(join(base, records.bodyPath('SIG-7')), 'utf-8')).toBe('why\n');
  });

  it('writes no body file when no body is given', async () => {
    await records.newItem(base, { title: 'x', by }, opts());
    expect(existsSync(join(base, records.bodyPath('SIG-7')))).toBe(false);
  });

  it('rewrites relative links in the body from linksFrom to the body folder', async () => {
    await records.newItem(base, { title: 'x', by, body: 'see [p](PLAN.md)\n', linksFrom: '' }, opts());
    expect(await readFile(join(base, records.bodyPath('SIG-7')), 'utf-8')).toBe('see [p](../../../PLAN.md)\n');
  });

  it('with triage: created + triaged in one write, fields applied, status T', async () => {
    const r = await records.newItem(base, {
      title: 'raw', by, at: AT, triage: { type: 'FEAT', priority: 'P2', theme: 'flow', title: 'clean' },
    }, opts());
    expect(r.status).toBe('T');
    expect(await read('SIG-7')).toEqual({
      id: 'SIG-7', type: 'FEAT', title: 'clean', theme: 'flow', priority: 'P2', events: [E.created, E.triaged],
    });
  });

  it('with triage: a type still NEW is refused, nothing written', async () => {
    await expect(records.newItem(base, { title: 'x', by, triage: { priority: 1 } }, opts()))
      .rejects.toMatchObject({ code: 'SCHEMA' });
    expect(existsSync(join(base, records.recordPath('SIG-7')))).toBe(false);
  });

  it('newItems: sequential IDs from one allocation, across a bucket boundary', async () => {
    await put(records.recordPath('SIG-998'), serializeRecord(rec('SIG-998', [E.created])));
    const r = await records.newItems(base, [{ title: 'a', by }, { title: 'b', by }, { title: 'c', by }], opts());
    expect(r.map((x) => x.id)).toEqual(['SIG-999', 'SIG-1000', 'SIG-1001']);
    expect((await read('SIG-1000')).title).toBe('b');
    expect(records.recordPath('SIG-1000')).toMatch(/items\/01\//);
  });

  it('newItems: an invalid spec is refused before anything is written', async () => {
    const before = snapshotTree(base);
    await expect(records.newItems(base, [{ title: 'ok', by }, { title: 'no by' }], opts())).rejects.toMatchObject({ code: 'SCHEMA' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('newItems: a failed write part-way removes what this call wrote', async () => {
    const before = snapshotTree(base);
    let n = 0;
    const { rename } = await import('node:fs/promises');
    const renameFn = async (a, b) => {
      n += 1;
      if (n === 3) throw new Error('disk full');
      return rename(a, b);
    };
    await expect(records.newItems(base, [{ title: 'a', by, body: 'b\n' }, { title: 'b', by }], opts({ renameFn })))
      .rejects.toMatchObject({ code: 'IO' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('newItems: a failed write removes a bucket folder this call created', async () => {
    await put(records.recordPath('SIG-999'), serializeRecord(rec('SIG-999', [E.created])));
    const { rename } = await import('node:fs/promises');
    let n = 0;
    const renameFn = async (a, b) => {
      n += 1;
      if (n === 2) throw new Error('disk full');
      return rename(a, b);
    };
    await expect(records.newItems(base, [{ title: 'a', by }, { title: 'b', by }], opts({ renameFn }))).rejects.toThrow();
    expect(existsSync(join(base, '.planning/work/items/01'))).toBe(false);
    expect(existsSync(join(base, '.planning/work/items/00'))).toBe(true);
  });

  it('newItems: an empty list is refused', async () => {
    await expect(records.newItems(base, [], opts())).rejects.toMatchObject({ code: 'SCHEMA' });
  });
});

describe('triageItem', () => {
  it('N → T, fields applied, one triaged event', async () => {
    const r = await records.triageItem(base, 'SIG-1', { type: 'CHORE', priority: 3, theme: 'docs', by, at: AT }, opts());
    expect(r.status).toBe('T');
    expect(await read('SIG-1')).toEqual({
      id: 'SIG-1', type: 'CHORE', title: 't SIG-1', theme: 'docs', priority: 3,
      events: [E.created, {
        ...E.triaged,
        changes: { type: { from: 'NEW', to: 'CHORE' }, theme: { from: null, to: 'docs' }, priority: { from: null, to: 3 } },
      }],
    });
  });

  it('Q → T clears the Epic', async () => {
    const r = await records.triageItem(base, 'SIG-3', { by, at: AT }, opts());
    expect(r).toMatchObject({ status: 'T', epic: null });
  });

  it('T → T is refused (not legal from T), nothing written', async () => {
    const before = snapshotTree(base);
    await expect(records.triageItem(base, 'SIG-2', { by }, opts())).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('a type left NEW is refused', async () => {
    await expect(records.triageItem(base, 'SIG-1', { by }, opts())).rejects.toMatchObject({ code: 'SCHEMA' });
  });

  it('an unknown ID is NOT_FOUND', async () => {
    await expect(records.triageItem(base, 'SIG-77', { type: 'BUG', by }, opts())).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('a re-triage after an edit succeeds: triaged carries the fields it changed (t1.3 fix)', async () => {
    await put(records.recordPath('SIG-8'), serializeRecord(rec('SIG-8', [
      E.created,
      { type: 'edited', at: AT, by, changes: { title: { from: 't SIG-8', to: 'b' } } },
      E.closing,
      { type: 'reopened', at: AT, by, reason: 'back' },
      E.queued,
    ], { title: 'b' })));
    const r = await records.triageItem(base, 'SIG-8', { type: 'BUG', title: 'c', priority: 2, by, at: AT }, opts());
    expect(r).toMatchObject({ status: 'T', epic: null });
    const saved = await read('SIG-8');
    expect(saved.title).toBe('c');
    // `type` already BUG: not a change, so not recorded.
    expect(saved.events.at(-1)).toEqual({
      type: 'triaged', at: AT, by, changes: { title: { from: 'b', to: 'c' }, priority: { from: null, to: 2 } },
    });
  });

  it('a triage that sets nothing new carries no changes', async () => {
    await records.triageItem(base, 'SIG-3', { type: 'BUG', by, at: AT }, opts());
    expect((await read('SIG-3')).events.at(-1)).toEqual(E.triaged);
  });

  it('N → T records the type change from NEW', async () => {
    await records.triageItem(base, 'SIG-1', { type: 'FEAT', by, at: AT }, opts());
    expect((await read('SIG-1')).events.at(-1).changes).toEqual({ type: { from: 'NEW', to: 'FEAT' } });
  });
});

describe('queueItem / startItem', () => {
  it('T → Q with the Epic; Q → P', async () => {
    expect(await records.queueItem(base, 'SIG-2', { epic: 'M6.E13', by, at: AT }, opts())).toMatchObject({ status: 'Q', epic: 'M6.E13' });
    expect(await records.startItem(base, 'SIG-2', { epic: 'M6.E14', by, at: AT }, opts())).toMatchObject({ status: 'P', epic: 'M6.E14' });
    expect((await read('SIG-2')).events).toEqual([E.created, E.triaged, E.queued, { ...E.started, epic: 'M6.E14' }]);
  });

  it('P → Q is legal (queued from P)', async () => {
    expect(await records.queueItem(base, 'SIG-4', { epic: 'M6.E13', by }, opts())).toMatchObject({ status: 'Q' });
  });

  it('N → Q, P → P and closed → P are refused, nothing written', async () => {
    const before = snapshotTree(base);
    await expect(records.queueItem(base, 'SIG-1', { epic: 'M6.E13', by }, opts())).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(records.startItem(base, 'SIG-4', { epic: 'M6.E13', by }, opts())).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(records.startItem(base, 'SIG-6', { epic: 'M6.E13', by }, opts())).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(records.startItem(base, 'SIG-5', { epic: 'M6.E13', by }, opts())).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('a malformed Epic ID is refused', async () => {
    await expect(records.queueItem(base, 'SIG-2', { epic: 'epic-1', by }, opts())).rejects.toMatchObject({ code: 'SCHEMA' });
  });
});

describe('every mutation: lock, atomicity, regenerate, v1 refusal (AC2.1)', () => {
  const MUTATIONS = {
    newItem: (b, o) => records.newItem(b, { title: 'x', by }, o),
    newItems: (b, o) => records.newItems(b, [{ title: 'x', by }], o),
    triageItem: (b, o) => records.triageItem(b, 'SIG-1', { type: 'BUG', by }, o),
    queueItem: (b, o) => records.queueItem(b, 'SIG-2', { epic: 'M6.E13', by }, o),
    startItem: (b, o) => records.startItem(b, 'SIG-2', { epic: 'M6.E13', by }, o),
  };

  for (const [name, run] of Object.entries(MUTATIONS)) {
    it(`${name}: calls the injected regenerate once, with baseDir, after the write`, async () => {
      const calls = [];
      await run(base, opts({ regenerate: async (b) => calls.push([b, snapshotTree(base).size]) }));
      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toBe(base);
    });

    it(`${name}: a second writer holding the lock gets LOCKED, nothing written`, async () => {
      const lock = await acquireLock(join(base, WORK_LOCK_REL), { label: 'work store' });
      try {
        const before = snapshotTree(base);
        await expect(run(base, opts())).rejects.toMatchObject({ code: 'LOCKED' });
        expect(snapshotTree(base)).toEqual(before);
      } finally {
        await lock.released();
      }
    });

    it(`${name}: a failure injected at the rename leaves every file unchanged`, async () => {
      const before = snapshotTree(base);
      const renameFn = async () => {
        throw new Error('injected');
      };
      await expect(run(base, opts({ renameFn }))).rejects.toThrow();
      expect(snapshotTree(base)).toEqual(before);
    });

    it(`${name}: refused on a v1 store, naming the migration script, nothing written`, async () => {
      await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n');
      const before = snapshotTree(base);
      await expect(run(base, opts())).rejects.toMatchObject({ code: 'CONFIG', message: expect.stringContaining('node tools/work-migrate-v2.mjs') });
      expect(snapshotTree(base)).toEqual(before);
      expect(existsSync(join(base, WORK_LOCK_REL))).toBe(false);
    });

    it(`${name}: refused on a store-off project, and no .planning/work is created`, async () => {
      const off = await mkdtemp(join(tmpdir(), 'sig-records-off-'));
      try {
        await expect(run(off, opts())).rejects.toMatchObject({ code: 'CONFIG' });
        expect(existsSync(join(off, '.planning/work'))).toBe(false);
      } finally {
        await rm(off, { recursive: true, force: true });
      }
    });
  }

  it('a failed regenerate leaves the change standing and says so', async () => {
    const regenerate = async () => {
      throw new Error('view broke');
    };
    await expect(records.queueItem(base, 'SIG-2', { epic: 'M6.E13', by }, opts({ regenerate })))
      .rejects.toMatchObject({ message: expect.stringMatching(/SIG-2.*not regenerated.*view broke/) });
    expect((await read('SIG-2')).events).toHaveLength(3);
    expect(existsSync(join(base, WORK_LOCK_REL))).toBe(false);
  });
});

describe('secret scrubbing (AC2.4): new and triage', () => {
  const PENDING = { aborted: 'sensitive-data-pending' };
  const cases = {
    'new title': (o) => records.newItem(base, { title: `t ${SECRET}`, by }, o),
    'new body': (o) => records.newItem(base, { title: 't', body: SECRET, by }, o),
    'new source_ref': (o) => records.newItem(base, { title: 't', source_ref: SECRET, by }, o),
    'new source': (o) => records.newItem(base, { title: 't', source: SECRET, by }, o), // REVIEW loop 1
    'new theme': (o) => records.newItem(base, { title: 't', theme: SECRET, by }, o),
    'new triage title': (o) => records.newItem(base, { title: 't', by, triage: { type: 'BUG', title: SECRET } }, o),
    'newItems, second spec': (o) => records.newItems(base, [{ title: 't', by }, { title: SECRET, by }], o),
    'triage title': (o) => records.triageItem(base, 'SIG-1', { type: 'BUG', title: SECRET, by }, o),
    'triage theme': (o) => records.triageItem(base, 'SIG-1', { type: 'BUG', theme: SECRET, by }, o),
  };
  for (const [name, run] of Object.entries(cases)) {
    it(`${name}: returns sensitive-data-pending and writes nothing; acknowledged, it writes`, async () => {
      const before = snapshotTree(base);
      const r = await run(opts());
      expect(r).toMatchObject(PENDING);
      expect(r.sensitiveHits[0]).toMatchObject({ type: 'aws-key', match: SECRET });
      expect(snapshotTree(base)).toEqual(before);
      expect(existsSync(join(base, WORK_LOCK_REL))).toBe(false);
      const ok = await run(opts({ acknowledgeSensitive: true }));
      expect(ok).not.toHaveProperty('aborted');
      expect(snapshotTree(base)).not.toEqual(before);
    });
  }
});
