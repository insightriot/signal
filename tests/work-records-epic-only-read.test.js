// M6.E16 VERIFY loop 2, v2.1 — AC6.4: a record that names a unit which is not
// an Epic ID, on a project with NO unit records, is read as `v0.1.50` read it.
// See .planning/M6.E16-VALIDATION.md row AC6.4.
//
// On `v0.1.50` the item schema refused such a record, so every reader said it
// was broken: `listRecords` put it in `broken` with code `invalid` and left it
// out of `records`; `checkRecords` reported it `invalid`; `getRecord` threw
// `SCHEMA`; the views refused to regenerate. The schema is wider now (a
// project WITH unit records needs `phase-11`), so the readers apply the
// Epic-ID rule themselves when the project has no unit records. With unit
// records nothing changes.
//
// The record is written straight to disk, as a merge or a shell command
// would: no writer here stores such a name without unit records.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { checkRecords, getRecord, listRecords, recordPath, startItem } from '../plugin/tools/lib/work-records.js';
import { regenerateToMemory } from '../plugin/tools/lib/work-views.js';

const AT = '2026-10-11T10:00:00.000Z';
const by = 'claude';
const made = [];

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function put(base, rel, content) {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

const item = (id, events) => `${JSON.stringify({ id, type: 'FEAT', title: `title of ${id}`, events }, null, 2)}\n`;
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };
const queued = (epic) => ({ type: 'queued', at: AT, by, epic });
const started = (epic) => ({ type: 'started', at: AT, by, epic });

// A store keyed LEAF: LEAF-1 queued for an Epic, LEAF-2 queued for `phase-11`,
// LEAF-3 started in `GATE-A` and then triaged again (so its folded Epic is
// none: the rule is about every event, as the schema's was).
function project({ units }) {
  const base = mkdtempSync(join(tmpdir(), 'sig-epic-only-'));
  made.push(base);
  put(base, '.planning/work/WORK.md', '---\nkey: LEAF\nschema_version: 2\n---\n');
  put(base, recordPath('LEAF-1'), item('LEAF-1', [created, triaged, queued('M9.E2')]));
  put(base, recordPath('LEAF-2'), item('LEAF-2', [created, triaged, queued('phase-11')]));
  put(base, recordPath('LEAF-3'), item('LEAF-3', [created, triaged, started('GATE-A'), triaged]));
  if (units) put(base, '.planning/work/units/.keep', '');
  return base;
}

const thrown = async (fn) => {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
};

describe('no unit records: an item record naming a unit that is not an Epic ID is broken, as on v0.1.50', () => {
  it('listRecords leaves it out of records and reports it in broken, code invalid, by ID and path', () => {
    const base = project({ units: false });
    const listed = listRecords(base);
    expect(listed.records.map((r) => r.id)).toEqual(['LEAF-1']);
    expect(listed.broken.map((b) => [b.id, b.path, b.code])).toEqual([
      ['LEAF-2', recordPath('LEAF-2'), 'invalid'],
      ['LEAF-3', recordPath('LEAF-3'), 'invalid'],
    ]);
  });

  it('the message begins with v0.1.50\'s words and then says why', () => {
    const base = project({ units: false });
    const [two, three] = listRecords(base).broken;
    const rule = '^M\\d+(\\.\\d+)*\\.E\\d+$';
    expect(two.error.startsWith(`${recordPath('LEAF-2')}: events[2].epic does not match ${rule} (got "phase-11")`)).toBe(true);
    expect(three.error.startsWith(`${recordPath('LEAF-3')}: events[2].epic does not match ${rule} (got "GATE-A")`)).toBe(true);
    expect(two.error).toMatch(/not an Epic ID/);
    expect(two.error).toMatch(/no unit records/);
    expect(two.error).toContain('.planning/work/units/');
  });

  it('checkRecords reports each as invalid, and the views as not regenerable', () => {
    const base = project({ units: false });
    const findings = checkRecords(base);
    expect(findings.map((f) => [f.code, f.id])).toEqual([['invalid', 'LEAF-2'], ['invalid', 'LEAF-3'], ['view-stale', null]]);
    expect(findings[0].path).toBe(recordPath('LEAF-2'));
    expect(findings[0].message).toMatch(/no unit records/);
  });

  it('getRecord throws SCHEMA, the views refuse to regenerate, and a writer refuses', async () => {
    const base = project({ units: false });
    expect((await thrown(() => getRecord(base, 'LEAF-2')))?.code).toBe('SCHEMA');
    expect(getRecord(base, 'LEAF-1').status).toBe('Q');
    expect((await thrown(() => regenerateToMemory(base)))?.code).toBe('SCHEMA');
    expect((await thrown(() => startItem(base, 'LEAF-2', { epic: 'M9.E2', by, at: AT })))?.code).toBe('SCHEMA');
  });

  // Changed at REVIEW pass 1 (r1.4, C-I4, `D-M6E16-22`): this case pinned the
  // opposite — a `units/` the library refuses read as "no unit records".
  it('a units/ that is a file is the folder\'s fault: the listing is refused, and no item record is blamed for it', () => {
    const base = project({ units: false });
    put(base, '.planning/work/units', 'a file, not a folder');
    let err;
    try {
      listRecords(base);
    } catch (e) {
      err = e;
    }
    expect(err).toMatchObject({ name: 'WorkStoreError', code: 'CONFLICT', unitsFolder: true });
    expect(err.message).toMatch(/\.planning\/work\/units\/ cannot be trusted.*not a folder/);
    expect(err.message).not.toMatch(/LEAF-|does not exist|an Epic only/);
    const findings = checkRecords(base);
    expect(findings).toEqual([expect.objectContaining({ id: null, path: '.planning/work/units' })]);
  });

  it('the rule\'s own message says there is no folder, in words that are true only then', () => {
    const base = project({ units: false });
    expect(listRecords(base).broken[0].error).toMatch(/this project has no unit records \(there is no \.planning\/work\/units\/ folder\)/);
  });
});

describe('with unit records: the same store reads as before v2.1', () => {
  it('listRecords lists all three, each with its folded status and unit; nothing is broken', () => {
    const base = project({ units: true });
    const listed = listRecords(base);
    expect(listed.records.map((r) => [r.id, r.status, r.epic])).toEqual([
      ['LEAF-1', 'Q', 'M9.E2'], ['LEAF-2', 'Q', 'phase-11'], ['LEAF-3', 'T', null],
    ]);
    expect(listed.broken).toEqual([]);
  });

  it('checkRecords has no finding about a record, and getRecord answers', () => {
    const base = project({ units: true });
    expect(checkRecords(base).filter((f) => f.id !== null)).toEqual([]);
    expect(getRecord(base, 'LEAF-2').epic).toBe('phase-11');
  });
});
