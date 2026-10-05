// Tests for the v2 work-records library, read side (M6.E13.S2.t2.1).
// See .planning/M6.E13-PLAN.md (t2.1, Decision 1) and .planning/M6.E13-VALIDATION.md rows
// AC1.1, AC4.2, NFR performance / integrity / security.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';

import {
  recordPath,
  bodyPath,
  storeVersion,
  listRecords,
  getRecord,
  assertWritable,
} from '../plugin/tools/lib/work-records.js';
import { serializeRecord, deriveStatus } from '../plugin/tools/lib/work-record.js';
import { convertV1Item } from '../plugin/tools/lib/work-convert.js';
import { stringifyItem } from '../plugin/tools/lib/work-item.js';
import { WorkStoreError } from '../plugin/tools/lib/work-errors.js';

const AT = '2026-10-04T10:00:00.000Z';
const by = 'claude';
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };
const queued = { type: 'queued', at: AT, by, epic: 'M6.E13' };

const rec = (id, events = [created], extra = {}) => ({ id, type: 'BUG', title: `t ${id}`, ...extra, events });

async function put(dir, rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const workMd = (dir, fm) => put(dir, '.planning/work/WORK.md', `---\n${fm}\n---\n`);
const v2 = (dir, key = 'SIG') => workMd(dir, `key: ${key}\nschema_version: 2`);
const plantRecord = (dir, record, body) =>
  Promise.all([
    put(dir, recordPath(record.id), serializeRecord(record)),
    body === undefined ? null : put(dir, bodyPath(record.id), body),
  ]);

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-work-records-'));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('recordPath / bodyPath — AC1.1, one path resolver', () => {
  it('buckets by floor(n / 1000), two digits', () => {
    expect(recordPath('SIG-5')).toBe('.planning/work/items/00/SIG-5.json');
    expect(recordPath('SIG-999')).toBe('.planning/work/items/00/SIG-999.json');
    expect(recordPath('SIG-1000')).toBe('.planning/work/items/01/SIG-1000.json');
    expect(recordPath('SIG-99999')).toBe('.planning/work/items/99/SIG-99999.json');
  });
  it('carries the store key in the ID, never a hard-coded SIG', () => {
    expect(recordPath('ACME-12')).toBe('.planning/work/items/00/ACME-12.json');
    expect(bodyPath('ACME-12')).toBe('.planning/work/items/00/ACME-12.md');
  });
  it('the body sits beside the record', () => {
    expect(bodyPath('SIG-1234')).toBe('.planning/work/items/01/SIG-1234.md');
  });
  it('refuses something that is not an item ID', () => {
    for (const bad of ['SIG-0', 'sig-5', 'SIG-5.json', '../SIG-5', 'SIG-', 5]) {
      expect(() => recordPath(bad), String(bad)).toThrow(WorkStoreError);
    }
  });
});

describe('storeVersion', () => {
  it('null when the store is off (no WORK.md)', () => {
    expect(storeVersion(base)).toBeNull();
  });
  it('a WORK.md with no schema_version is v1 — every existing fixture', async () => {
    await workMd(base, 'key: SIG');
    expect(storeVersion(base)).toBe(1);
  });
  it('reads 1 and 2', async () => {
    await workMd(base, 'key: SIG\nschema_version: 1');
    expect(storeVersion(base)).toBe(1);
    await workMd(base, 'key: SIG\nschema_version: 2');
    expect(storeVersion(base)).toBe(2);
  });
  it('a schema_version it does not know throws CONFIG, never reads as v1', async () => {
    for (const v of ['3', '"2"', '1.5', '0', 'two', 'null']) {
      await workMd(base, `key: SIG\nschema_version: ${v}`);
      expect(() => storeVersion(base), v).toThrow(expect.objectContaining({ code: 'CONFIG' }));
    }
  });
  it('a malformed WORK.md throws as isStoreOn does', async () => {
    await put(base, '.planning/work/WORK.md', 'no frontmatter\n');
    expect(() => storeVersion(base)).toThrow(expect.objectContaining({ code: 'CONFIG' }));
    await workMd(base, 'schema_version: 2');
    expect(() => storeVersion(base)).toThrow(/no `key`/);
  });
});

describe('assertWritable — AC4.2, writes refuse on a v1 store', () => {
  it('passes on a v2 store and returns its key', async () => {
    await v2(base, 'ACME');
    expect(assertWritable(base)).toEqual({ key: 'ACME', version: 2 });
  });
  it('refuses a v1 store, naming the migration script', async () => {
    await workMd(base, 'key: SIG');
    let err;
    try {
      assertWritable(base);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('CONFIG');
    expect(err.version).toBe(1);
    expect(err.message).toContain('node tools/work-migrate-v2.mjs');
  });
  it('refuses when the store is off', () => {
    expect(() => assertWritable(base)).toThrow(expect.objectContaining({ code: 'CONFIG' }));
  });
});

describe('listRecords / getRecord — v2 store', () => {
  beforeEach(async () => {
    await v2(base);
  });

  it('lists every record with its folded status and Epic, sorted by number', async () => {
    await plantRecord(base, rec('SIG-10'), 'ten\n');
    await plantRecord(base, rec('SIG-2', [created, triaged]));
    await plantRecord(base, rec('SIG-1001', [created, triaged, queued]));
    const { records, broken } = listRecords(base);
    expect(broken).toEqual([]);
    expect(records.map((r) => [r.id, r.status, r.epic, r.path])).toEqual([
      ['SIG-2', 'T', null, '.planning/work/items/00/SIG-2.json'],
      ['SIG-10', 'N', null, '.planning/work/items/00/SIG-10.json'],
      ['SIG-1001', 'Q', 'M6.E13', '.planning/work/items/01/SIG-1001.json'],
    ]);
    expect(records[0].record.title).toBe('t SIG-2');
    expect(records[0]).not.toHaveProperty('body');
  });

  it('reads bodies when asked; a record with no body file has body null', async () => {
    await plantRecord(base, rec('SIG-1'), 'one\n');
    await plantRecord(base, rec('SIG-2'));
    const { records } = listRecords(base, { bodies: true });
    expect(records.map((r) => r.body)).toEqual(['one\n', null]);
  });

  it('an empty store lists nothing', () => {
    expect(listRecords(base)).toEqual({ version: 2, records: [], broken: [] });
  });

  it('NFR integrity: one broken record is reported by ID and every other record still reads', async () => {
    await plantRecord(base, rec('SIG-1'));
    await put(base, recordPath('SIG-2'), '{ not json');
    await put(base, recordPath('SIG-3'), `${JSON.stringify({ id: 'SIG-3', type: 'BUG', status: 'N', events: [created] })}\n`);
    await put(base, recordPath('SIG-4'), serializeRecord(rec('SIG-4', [created, { ...queued, type: 'started' }, triaged, triaged])));
    await plantRecord(base, rec('SIG-5'));
    const { records, broken } = listRecords(base);
    expect(records.map((r) => r.id)).toEqual(['SIG-1', 'SIG-5']);
    expect(broken.map((b) => b.id)).toEqual(['SIG-2', 'SIG-3', 'SIG-4']);
    expect(broken[0].path).toBe('.planning/work/items/00/SIG-2.json');
    expect(broken[0].error).toMatch(/not valid JSON/);
    expect(broken[1].error).toMatch(/status/);
  });

  it('AC1.1 on the read side: a record whose file name, ID or bucket disagree is broken', async () => {
    await put(base, recordPath('SIG-7'), serializeRecord(rec('SIG-8')));
    await put(base, '.planning/work/items/01/SIG-9.json', serializeRecord(rec('SIG-9')));
    await put(base, '.planning/work/items/00/OTHER-3.json', serializeRecord(rec('OTHER-3')));
    await put(base, '.planning/work/items/00/notes.json', '{}\n');
    const { records, broken } = listRecords(base);
    expect(records).toEqual([]);
    expect(broken.map((b) => b.path).sort()).toEqual([
      '.planning/work/items/00/OTHER-3.json',
      '.planning/work/items/00/SIG-7.json',
      '.planning/work/items/00/notes.json',
      '.planning/work/items/01/SIG-9.json',
    ]);
    expect(broken.find((b) => b.id === 'SIG-7').error).toMatch(/SIG-8/);
    expect(broken.find((b) => b.id === 'SIG-9').error).toMatch(/items\/00/);
    expect(broken.find((b) => b.id === 'OTHER-3').error).toMatch(/key/);
  });

  it('NFR security: a symlinked record, body or bucket is refused, never followed', async () => {
    await put(base, 'outside/secret.json', serializeRecord(rec('SIG-1')));
    await put(base, 'outside/SIG-50.json', serializeRecord(rec('SIG-50')));
    await mkdir(join(base, '.planning/work/items/00'), { recursive: true });
    await symlink(join(base, 'outside/secret.json'), join(base, recordPath('SIG-1')));
    await plantRecord(base, rec('SIG-2'));
    await put(base, '.env', 'TOKEN=x\n');
    await symlink(join(base, '.env'), join(base, bodyPath('SIG-2')));
    await symlink(join(base, 'outside'), join(base, '.planning/work/items/02'));
    const { records, broken } = listRecords(base, { bodies: true });
    expect(records.map((r) => r.id)).toEqual([]);
    expect(broken.map((b) => b.path).sort()).toEqual([
      '.planning/work/items/00/SIG-1.json',
      '.planning/work/items/00/SIG-2.md',
      '.planning/work/items/02',
    ]);
    for (const b of broken) expect(b.error).toMatch(/symbolic link/);
  });

  it('NFR security: an items/ folder that resolves outside the project is refused whole', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'sig-outside-'));
    try {
      await put(outside, '00/SIG-1.json', serializeRecord(rec('SIG-1')));
      await mkdir(join(base, '.planning/work'), { recursive: true });
      await symlink(outside, join(base, '.planning/work/items'));
      expect(() => listRecords(base)).toThrow(expect.objectContaining({ code: 'CONFLICT' }));
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('getRecord returns one record with its body; unknown → NOT_FOUND; broken → SCHEMA', async () => {
    await plantRecord(base, rec('SIG-3', [created, triaged]), 'three\n');
    await put(base, recordPath('SIG-4'), '{');
    expect(getRecord(base, 'SIG-3')).toMatchObject({ id: 'SIG-3', status: 'T', epic: null, body: 'three\n' });
    expect(() => getRecord(base, 'SIG-99')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(() => getRecord(base, 'SIG-4')).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
    expect(() => getRecord(base, 'nope')).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
  });

  it('NFR performance: 10,000 records list and fold well inside the budget', () => {
    const t0 = performance.now();
    for (let n = 1; n <= 10_000; n += 1) {
      const id = `SIG-${n}`;
      const abs = join(base, recordPath(id));
      if (n % 1000 === 0 || n === 1) mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, serializeRecord(rec(id, n % 3 ? [created, triaged] : [created])));
    }
    const t1 = performance.now();
    const { records, broken } = listRecords(base);
    const t2 = performance.now();
    console.log(`[NFR] 10,000 v2 records: generate ${Math.round(t1 - t0)} ms, list+fold ${Math.round(t2 - t1)} ms`);
    expect(broken).toEqual([]);
    expect(records).toHaveLength(10_000);
    // The requirement is < 1 s; the assertion leaves CI headroom and the log carries the number.
    expect(t2 - t1).toBeLessThan(2000);
  }, 60_000);
});

describe('listRecords / getRecord — v1 store, read through the converter (Decision 1, AC4.2)', () => {
  const v1Item = (fields, body = 'body\n') => stringifyItem(fields, body);
  const CREATED = { at: '2026-09-01T00:00:00.000Z', by: 'b' };

  beforeEach(async () => {
    await workMd(base, 'key: SIG');
    await put(base, '.planning/work/backlog/SIG-2.md', v1Item({ id: 'SIG-2', type: 'BUG', status: 'T', created: CREATED, title: 'two' }, '| B9 | `confirmed` | P2 | text |\n'));
    await put(base, '.planning/work/inbox/SIG-1.md', v1Item({ id: 'SIG-1', type: 'NEW', status: 'N', created: CREATED }));
    await put(base, '.planning/work/epics/M6.E13/SIG-3.md', v1Item({ id: 'SIG-3', type: 'FEAT', status: 'P', created: CREATED }));
    await put(base, '.planning/work/epics/M6.E13/M6.E13-PLAN.md', '# not an item\n');
    await put(base, '.planning/archive/epics/M6.E1/SIG-4.md', v1Item({
      id: 'SIG-4', type: 'BUG', status: 'C', created: CREATED,
      close: { reason: 'wontdo', by: 'b', at: '2026-09-02', proof: 'no' },
    }));
  });

  it('reads equal the converter output, record for record', async () => {
    const { version, records, broken } = listRecords(base, { bodies: true });
    expect(version).toBe(1);
    expect(broken).toEqual([]);
    expect(records.map((r) => [r.id, r.status, r.epic])).toEqual([
      ['SIG-1', 'N', null], ['SIG-2', 'T', null], ['SIG-3', 'P', 'M6.E13'], ['SIG-4', 'C', 'M6.E1'],
    ]);
    const { readFileSync } = await import('node:fs');
    for (const r of records) {
      const relPath = r.path.replace(/^\.planning\//, '');
      const expected = convertV1Item({ relPath, text: readFileSync(join(base, r.path), 'utf-8') });
      expect(r.record).toEqual(expected.record);
      expect(r.body).toBe(expected.body);
      expect(deriveStatus(r.record)).toBe(r.status);
    }
  });

  it('a v1 file the converter cannot map is broken; the rest still read', async () => {
    await put(base, '.planning/work/backlog/SIG-5.md', v1Item({ id: 'SIG-5', type: 'BUG', status: 'N', created: CREATED }));
    const { records, broken } = listRecords(base);
    expect(records).toHaveLength(4);
    expect(broken).toEqual([expect.objectContaining({ id: 'SIG-5', path: '.planning/work/backlog/SIG-5.md' })]);
    expect(broken[0].error).toMatch(/does not belong/);
  });

  it('getRecord reads one v1 item', () => {
    expect(getRecord(base, 'SIG-3')).toMatchObject({ id: 'SIG-3', status: 'P', epic: 'M6.E13', path: '.planning/work/epics/M6.E13/SIG-3.md' });
    expect(() => getRecord(base, 'SIG-50')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  describe('an item with no created date', () => {
    const noDate = () => put(base, '.planning/work/backlog/SIG-6.md', v1Item({ id: 'SIG-6', type: 'BUG', status: 'T' }));

    it('outside a git repo it is broken, with the reason, never given an invented date', async () => {
      await noDate();
      const { broken } = listRecords(base);
      expect(broken).toEqual([expect.objectContaining({ id: 'SIG-6' })]);
      expect(broken[0].error).toMatch(/no created date/);
    });

    it('inside a repo it takes the date of the commit that first added the file (one git read)', async () => {
      const git = (args, env = {}) =>
        execFileSync('git', args, { cwd: base, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env } });
      git(['init', '-q', '-b', 'main']);
      git(['config', 'user.email', 't@t.co']);
      git(['config', 'user.name', 'T']);
      git(['config', 'commit.gpgsign', 'false']);
      await noDate();
      git(['add', '-A']);
      git(['commit', '-q', '-m', 'add'], { GIT_AUTHOR_DATE: '2026-09-29T12:00:00Z', GIT_COMMITTER_DATE: '2026-09-29T12:00:00Z' });
      const { records, broken } = listRecords(base);
      expect(broken).toEqual([]);
      const six = records.find((r) => r.id === 'SIG-6');
      expect(six.record.events[0]).toMatchObject({ type: 'created', at: '2026-09-29' });
      expect(six.status).toBe('T');
    });
  });
});

describe('listRecords — store off', () => {
  it('throws CONFIG, as v1 listItems does', () => {
    expect(() => listRecords(base)).toThrow(expect.objectContaining({ code: 'CONFIG' }));
    expect(() => getRecord(base, 'SIG-1')).toThrow(expect.objectContaining({ code: 'CONFIG' }));
  });
});
