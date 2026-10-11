// M6.E15 S5 — look an item up by its old ID; no B-number assumption outside
// Signal (FR5.3, FR7; D-M6E15-2, -12). See .planning/M6.E15-PLAN.md § S5 and
// .planning/M6.E15-VALIDATION.md rows AC5.3 and FR7 (B-number).
//
// Keys and titles are invented (`tests/private-name-guard.test.js`).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { bodyPath, findByLegacyId, getRecord, recordPath } from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { checkDanglingReferences } from '../plugin/tools/lib/doc-hygiene.js';

const AT = '2026-02-20T12:00:00.000Z';
const created = { type: 'created', at: AT, by: 'migration' };
const rec = (id, extra = {}) => ({ id, type: 'FEAT', title: `an item ${id}`, ...extra, events: [created] });

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const storeOn = (key) => put('.planning/work/WORK.md', `---\nkey: ${key}\nschema_version: 2\n---\n`);
const plant = (record) => Promise.all([put(recordPath(record.id), serializeRecord(record)), put(bodyPath(record.id), 'Body.\n')]);

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-legacy-lookup-'));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('t5.1 — findByLegacyId (AC5.3, D-M6E15-12)', () => {
  it('an old ID held by one record → that record', async () => {
    await storeOn('LF');
    await plant(rec('LF-9', { legacy_id: '#99' }));
    await plant(rec('LF-10', { legacy_id: 'R3' }));
    await plant(rec('LF-11'));
    const hit = findByLegacyId(base, '#99');
    expect(hit.id).toBe('LF-9');
    expect(hit.record.legacy_id).toBe('#99');
    expect(findByLegacyId(base, 'R3').id).toBe('LF-10');
  });

  it('an old ID shaped like an item ID (`NFR-04`, `BUG-7`) is found; getRecord does not (REVIEW I3)', async () => {
    await storeOn('LF');
    await plant(rec('LF-3', { legacy_id: 'NFR-04' }));
    await plant(rec('LF-4', { legacy_id: 'BUG-7' }));
    expect(findByLegacyId(base, 'NFR-04').id).toBe('LF-3');
    expect(findByLegacyId(base, 'BUG-7').id).toBe('LF-4');
    // Why /sig:item routes by the store's key: `BUG-7` is ID-shaped, and as an ID it names nothing here.
    expect(() => getRecord(base, 'BUG-7')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('whitespace is normalised; anything else must match exactly', async () => {
    await storeOn('LF');
    await plant(rec('LF-1', { legacy_id: 'Issue #45' }));
    expect(findByLegacyId(base, '  Issue   #45 ').id).toBe('LF-1');
    expect(() => findByLegacyId(base, 'issue #45')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
    expect(() => findByLegacyId(base, '#4')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  });

  it('no record holds it → NOT_FOUND, naming the old ID', async () => {
    await storeOn('LF');
    await plant(rec('LF-1', { legacy_id: '#1' }));
    expect(() => findByLegacyId(base, '#404')).toThrow(expect.objectContaining({ code: 'NOT_FOUND', message: expect.stringContaining('#404') }));
  });

  it('two records hold it → CONFLICT, naming every match', async () => {
    await storeOn('LF');
    await plant(rec('LF-2', { legacy_id: '#99' }));
    await plant(rec('LF-5', { legacy_id: '#99' }));
    await plant(rec('LF-7', { legacy_id: '#99' }));
    let err;
    try {
      findByLegacyId(base, '#99');
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe('CONFLICT');
    for (const id of ['LF-2', 'LF-5', 'LF-7']) expect(err.message).toContain(id);
  });
});

describe('t5.3 — a B{n} citation outside Signal answers only to a record whose legacy_id is B{n} (FR7, D-M6E15-2)', () => {
  const dangling = async () => (await checkDanglingReferences(base)).filter((f) => f.check === 'dangling-reference');

  it('key LF: bug LF-7 does not answer to B7 by its number', async () => {
    await storeOn('LF');
    await plant(rec('LF-7', { type: 'BUG' }));
    await put('.planning/NOTES.md', 'see B7 for the detail\n');
    const f = await dangling();
    expect(f.map((x) => x.message).join('\n')).toMatch(/B7 is cited/);
  });

  it('key LF: B7 is answered by the record whose legacy_id is B7, whatever its new number', async () => {
    await storeOn('LF');
    await plant(rec('LF-3', { type: 'BUG', legacy_id: 'B7' }));
    await put('.planning/NOTES.md', 'see B7 for the detail; B3 is something else\n');
    const msgs = (await dangling()).map((x) => x.message).join('\n');
    expect(msgs).not.toMatch(/B7 is cited/);
    expect(msgs).toMatch(/B3 is cited/);
  });

  it('key SIG (Signal) is unchanged: bug SIG-7 answers to B7 by its number (D-M6E11-20)', async () => {
    await storeOn('SIG');
    await plant(rec('SIG-7', { type: 'BUG' }));
    await put('.planning/NOTES.md', 'see B7 for the detail\n');
    expect(await dangling()).toEqual([]);
  });
});
