// M6.E16 t7.1 — the writers for a unit that starts out closed: `importUnit`
// and `importUnits` (`unit-records.js`). See .planning/M6.E16-PLAN.md § S7 and
// VALIDATION rows AC8.1 (`legacy_row` kept as written), NFR input, NFR failure.
//
// Every store is built in a temp folder. Unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import * as units from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { EPICS_BEGIN, EPICS_END } from '../plugin/tools/lib/milestone-table.js';
import { cut, printable } from '../plugin/tools/lib/printable-text.js';
import { snapshotTree } from './helpers/write-inventory.js';

const AT = '2026-10-11';
const by = 'migration';
const UNITS = '.planning/work/units';
const EPICS = '.planning/work/EPICS.md';
const MILESTONE = '.planning/MILESTONE-9.md';

const put = (dir, rel, text) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};
const read = (dir, rel) => readFileSync(join(dir, rel), 'utf-8');
const record = (dir, id) => JSON.parse(read(dir, `${UNITS}/${id}.json`));

const legacy = (id, over = {}) => ({ id, close: { reason: 'legacy', at: AT, by }, ...over });
const dropped = (id, words = 'the work moved to another unit') => ({ id, close: { reason: 'dropped', words, at: AT, by } });
const opened = (id, over = {}) => ({ id, opened: { at: AT, by }, ...over });

const STATE = '---\nschema_version: 1\ndocs_layout_version: 3\nphase: EXECUTE\ncurrent_epic: M9.E3\ncurrent_tasks: []\n'
  + 'completed_phases: []\nblockers: []\n---\n# Project State\n';
const MILESTONE_TEXT = `# Milestone 9\n\nWritten by hand.\n\n${EPICS_BEGIN}\n| Epic | Status | Summary |\n|---|---|---|\n| \`M9.E1\` | by hand | x |\n${EPICS_END}\n\nAfter the table.\n`;

// A v2 store (key LEAF) with one item, no `units/`, and fresh views.
async function makeStore({ unitsDir = false, milestone = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'sig-unit-import-'));
  put(dir, '.planning/work/WORK.md', '---\nkey: LEAF\nschema_version: 2\n---\n');
  put(dir, '.planning/STATE.md', STATE);
  put(dir, '.planning/work/items/00/LEAF-1.json', serializeRecord({
    id: 'LEAF-1', type: 'BUG', title: 'A leaf falls', events: [{ type: 'created', at: AT, by }],
  }));
  put(dir, '.planning/work/items/00/LEAF-1.md', 'Body.\n');
  if (milestone) put(dir, MILESTONE, MILESTONE_TEXT);
  if (unitsDir) put(dir, `${UNITS}/.keep`, '');
  await regenerateViews(dir);
  return dir;
}

let base;
const made = [];
const store = async (opts) => {
  const dir = await makeStore(opts);
  made.push(dir);
  return dir;
};
beforeEach(async () => {
  base = await store({ unitsDir: true });
});
afterEach(() => {
  while (made.length) rmSync(made.pop(), { recursive: true, force: true });
});

const refusal = async (fn) => {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  return null;
};

describe('importUnit — a record whose first event is its close', () => {
  it('legacy: one closed event, the unit reads closed, the record is at its fixed path', async () => {
    const entry = await units.importUnit(base, legacy('M8.E1', { legacy_row: ['**E1**', 'shipped 2026-07-01', 'What it did'], migration_note: 'the row says shipped' }));
    expect(entry).toMatchObject({ id: 'M8.E1', status: 'closed', path: `${UNITS}/M8.E1.json` });
    expect(record(base, 'M8.E1')).toEqual({
      id: 'M8.E1',
      legacy_row: ['**E1**', 'shipped 2026-07-01', 'What it did'],
      migration_note: 'the row says shipped',
      events: [{ type: 'closed', at: AT, by, reason: 'legacy' }],
    });
    expect(units.getUnit(base, 'M8.E1').close).toEqual({ reason: 'legacy', at: AT, by });
    expect(units.unitClosure(base, 'M8.E1')).toBe('closed');
  });

  it('dropped: the words are recorded; without words it is refused', async () => {
    await units.importUnit(base, dropped('M8.E2', 'became M9.E7'));
    expect(record(base, 'M8.E2').events).toEqual([{ type: 'closed', at: AT, by, reason: 'dropped', words: 'became M9.E7' }]);
    const before = snapshotTree(base);
    const err = await refusal(() => units.importUnit(base, { id: 'M8.E3', close: { reason: 'dropped', at: AT, by } }));
    expect(err).toMatchObject({ code: 'SCHEMA' });
    expect(err.message).toMatch(/dropped close needs words/);
    expect(snapshotTree(base)).toEqual(before);
  });

  it('a shipped close is never importable: it comes through a close request and its confirmation', async () => {
    const before = snapshotTree(base);
    for (const close of [{ reason: 'shipped', proof: '0123abc', at: AT, by }, { reason: 'shipped', at: AT, by }]) {
      const err = await refusal(() => units.importUnit(base, { id: 'M8.E4', close }));
      expect(err).toMatchObject({ code: 'SCHEMA' });
      expect(err.message).toMatch(/requestUnitClose/);
    }
    const batch = await refusal(() => units.importUnits(base, [legacy('M8.E5'), { id: 'M8.E4', close: { reason: 'shipped', proof: '0123abc', at: AT, by } }]));
    expect(batch).toMatchObject({ code: 'SCHEMA' });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('any other reason, or no close at all, is refused', async () => {
    const before = snapshotTree(base);
    expect(await refusal(() => units.importUnit(base, { id: 'M8.E4', close: { reason: 'done', at: AT, by } }))).toMatchObject({ code: 'SCHEMA' });
    const open = await refusal(() => units.importUnit(base, opened('M8.E4')));
    expect(open).toMatchObject({ code: 'SCHEMA' });
    expect(open.message).toMatch(/openUnit/);
    expect(snapshotTree(base)).toEqual(before);
  });

  it('an existing record is refused, open or closed, and left as it is', async () => {
    await units.importUnit(base, legacy('M8.E1'));
    const before = snapshotTree(base);
    const err = await refusal(() => units.importUnit(base, dropped('M8.E1')));
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(err.message).toMatch(/M8\.E1\.json already exists/);
    expect(snapshotTree(base)).toEqual(before);
  });

  it.each([
    ['a path', '../escape', 'SCHEMA'],
    ['a separator', 'a/b', 'SCHEMA'],
    ['101 characters', 'x'.repeat(101), 'SCHEMA'],
    ['a phase name', 'Execute', 'SCHEMA'],
    ['the shape of this store\'s item IDs', 'leaf-12', 'SCHEMA'],
  ])('an illegal ID is refused — %s', async (_, id, code) => {
    const before = snapshotTree(base);
    expect(await refusal(() => units.importUnit(base, legacy(id)))).toMatchObject({ code });
    expect(await refusal(() => units.importUnits(base, [legacy('M8.E1'), legacy(id)]))).toMatchObject({ code });
    expect(snapshotTree(base)).toEqual(before);
  });

  it('a case twin is refused: of a record that exists, and of another unit in the same list', async () => {
    await units.importUnit(base, legacy('phase-11'));
    const before = snapshotTree(base);
    const twin = await refusal(() => units.importUnit(base, legacy('Phase-11')));
    expect(twin).toMatchObject({ code: 'CONFLICT' });
    expect(twin.message).toMatch(/phase-11/);
    const inList = await refusal(() => units.importUnits(base, [legacy('GATE-A'), legacy('gate-a')]));
    expect(inList).toMatchObject({ code: 'CONFLICT' });
    expect(inList.message).toMatch(/GATE-A.*gate-a|gate-a.*GATE-A/);
    const twice = await refusal(() => units.importUnits(base, [legacy('GATE-B'), dropped('GATE-B')]));
    expect(twice).toMatchObject({ code: 'CONFLICT' });
    expect(twice.message).toMatch(/GATE-B is listed twice/);
    expect(snapshotTree(base)).toEqual(before);
  });

  it('sensitive text stops the import until it is acknowledged', async () => {
    const secret = 'token ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    const before = snapshotTree(base);
    const stopped = await units.importUnits(base, [legacy('M8.E1', { legacy_row: ['E1', secret] }), dropped('M8.E2', secret)]);
    expect(stopped.aborted).toBe('sensitive-data-pending');
    expect(stopped.sensitiveHits.length).toBeGreaterThanOrEqual(2);
    expect(snapshotTree(base)).toEqual(before);
    const went = await units.importUnits(base, [legacy('M8.E1', { legacy_row: ['E1', secret] })], { acknowledgeSensitive: true });
    expect(went.map((u) => u.id)).toEqual(['M8.E1']);
  });

  it('a store that is off, and a list that is not a list, are refused', async () => {
    const bare = mkdtempSync(join(tmpdir(), 'sig-unit-import-off-'));
    made.push(bare);
    expect(await refusal(() => units.importUnit(bare, legacy('M8.E1')))).toMatchObject({ code: 'CONFIG' });
    expect(existsSync(join(bare, '.planning'))).toBe(false);
    expect(await refusal(() => units.importUnits(base, 'M8.E1'))).toMatchObject({ code: 'SCHEMA' });
  });
});

describe('importUnits — many records, one write', () => {
  it('writes closed and open units together and regenerates the views once', async () => {
    let regenerated = 0;
    const out = await units.importUnits(base, [
      legacy('M8.E1', { legacy_row: ['E1', 'shipped'] }),
      dropped('M8.E2'),
      opened('M9.E3', { summary: 'The one in flight' }),
    ], { regenerate: async (dir) => { regenerated += 1; return regenerateViews(dir); } });
    expect(regenerated).toBe(1);
    expect(out.map((u) => [u.id, u.status])).toEqual([['M8.E1', 'closed'], ['M8.E2', 'closed'], ['M9.E3', 'open']]);
    expect(record(base, 'M9.E3')).toEqual({ id: 'M9.E3', summary: 'The one in flight', events: [{ type: 'opened', at: AT, by }] });
    const epics = read(base, EPICS);
    expect(epics).toMatch(/### M9\.E3 — open/);
    expect(epics).toMatch(/### M8\.E1 — closed \(legacy\) — old row: shipped$/m);
    expect(epics).toMatch(/### M8\.E2 — closed 2026-10-11 \(dropped\) — the work moved to another unit/);
    expect(units.checkUnits(base)).toEqual([]);
  });

  it('an empty list writes nothing', async () => {
    const before = snapshotTree(base);
    expect(await units.importUnits(base, [])).toEqual([]);
    expect(snapshotTree(base)).toEqual(before);
  });

  it('without a units folder it is refused; with ensureDir it creates the folder and its .keep', async () => {
    const dir = await store();
    const before = snapshotTree(dir);
    const err = await refusal(() => units.importUnits(dir, [legacy('M8.E1')]));
    expect(err).toMatchObject({ code: 'CONFIG' });
    expect(err.message).toMatch(/no unit records/);
    expect(snapshotTree(dir)).toEqual(before);

    await units.importUnits(dir, [legacy('M8.E1')], { ensureDir: true });
    expect(read(dir, `${UNITS}/.keep`)).toBe('');
    expect(units.hasUnits(dir)).toBe(true);
    expect(units.getUnit(dir, 'M8.E1').status).toBe('closed');
  });

  it('with ensureDir and an empty list it turns unit records on and writes no record', async () => {
    const dir = await store();
    expect(await units.importUnits(dir, [], { ensureDir: true })).toEqual([]);
    expect(units.hasUnits(dir)).toBe(true);
    expect(units.listUnits(dir).units).toEqual([]);
    expect(read(dir, EPICS)).toMatch(/_no Epics_/);
  });

  it('a units folder that is a symbolic link is refused, and nothing is written through it', async () => {
    const dir = await store();
    const outside = mkdtempSync(join(tmpdir(), 'sig-unit-import-out-'));
    made.push(outside);
    symlinkSync(outside, join(dir, UNITS));
    const err = await refusal(() => units.importUnits(dir, [legacy('M8.E1')], { ensureDir: true }));
    expect(err).toMatchObject({ code: 'CONFLICT' });
    expect(err.message).toMatch(/symbolic link/);
    expect(snapshotTree(outside)).toEqual(new Map());
  });
});

describe('importUnits — all or nothing (NFR failure)', () => {
  const batch = [legacy('M8.E1'), legacy('M8.E2'), dropped('M8.E3'), opened('M9.E3')];

  it('a write that fails part-way removes the records already written, and the folder it made', async () => {
    const dir = await store({ milestone: true });
    const before = snapshotTree(dir);
    let n = 0;
    const { rename } = await import('node:fs/promises');
    const renameFn = async (from, to) => {
      if (to.endsWith('.json')) n += 1;
      if (n === 3) throw Object.assign(new Error('disk full'), { code: 'ENOSPC' });
      return rename(from, to);
    };
    const err = await refusal(() => units.importUnits(dir, batch, { ensureDir: true, renameFn }));
    expect(err.message).toMatch(/nothing was imported/);
    expect(err.message).toMatch(/disk full/);
    expect(n).toBe(3);
    expect(snapshotTree(dir)).toEqual(before);
    expect(existsSync(join(dir, UNITS))).toBe(false);
  });

  it('a regeneration that fails puts the records and every view back', async () => {
    const dir = await store({ milestone: true });
    const before = snapshotTree(dir);
    const regenerate = async (d) => {
      await regenerateViews(d); // the views are written, then the step fails
      throw new Error('views broke');
    };
    const err = await refusal(() => units.importUnits(dir, batch, { ensureDir: true, regenerate }));
    expect(err.message).toMatch(/nothing was imported.*views broke/s);
    expect(snapshotTree(dir)).toEqual(before);
  });

  it('a verify step that throws puts the records, the Epic index and the milestone table back', async () => {
    const dir = await store({ milestone: true });
    const before = snapshotTree(dir);
    let seen = null;
    const verify = async (handle) => {
      seen = { epics: read(handle.baseDir, EPICS), milestone: read(handle.baseDir, MILESTONE), units: units.listUnits(handle.baseDir).units.length };
      throw new Error('not what was planned');
    };
    const err = await refusal(() => units.importUnits(dir, batch, { ensureDir: true, verify }));
    expect(err.message).toMatch(/nothing was imported.*not what was planned/s);
    // The step ran on the finished write: the records, and both views rendered from them.
    expect(seen.units).toBe(4);
    expect(seen.epics).toMatch(/### M9\.E3 — open/);
    expect(seen.milestone).toMatch(/\| `M9\.E3` \| \*\*in flight\*\* \|/);
    expect(seen.milestone).not.toMatch(/by hand \| x/);
    expect(snapshotTree(dir)).toEqual(before);
    expect(read(dir, MILESTONE)).toBe(MILESTONE_TEXT);
  });

  it('a gate that throws refuses before the folder or any record exists', async () => {
    const dir = await store();
    const before = snapshotTree(dir);
    const gate = async () => {
      expect(existsSync(join(dir, UNITS))).toBe(false);
      throw new Error('the plan changed');
    };
    const err = await refusal(() => units.importUnits(dir, batch, { ensureDir: true, gate }));
    expect(err.message).toBe('the plan changed');
    expect(snapshotTree(dir)).toEqual(before);
  });

  it('a folder that was already there is kept when the write fails', async () => {
    const before = snapshotTree(base);
    const err = await refusal(() => units.importUnits(base, batch, { verify: async () => { throw new Error('no'); } }));
    expect(err.message).toMatch(/nothing was imported/);
    expect(snapshotTree(base)).toEqual(before);
    expect(existsSync(join(base, UNITS, '.keep'))).toBe(true);
  });
});

describe('free text kept from a hand-written source (NFR input, AC8.1)', () => {
  it('a row cell is kept as written — no whitespace folded — up to the limit', async () => {
    const cells = ['**E2 — `/x:add`  capture**', '✅ shipped as **v0.1.9** (2026-07-21) — ran  ahead', `${'word  '.repeat(600)}end`];
    await units.importUnit(base, legacy('M8.E1', { legacy_row: cells }));
    expect(record(base, 'M8.E1').legacy_row).toEqual(cells);
  });

  it('a 10 kB cell is cut, and invisible characters are taken out of cells and words', async () => {
    const hidden = 'ship\u200bped\u202e now\u0007\u{e0041}';
    await units.importUnits(base, [
      legacy('M8.E1', { legacy_row: ['E1', 'x'.repeat(10_000), hidden], close: { reason: 'legacy', words: hidden, at: AT, by } }),
      dropped('M8.E2', `${'w'.repeat(10_000)}`),
    ]);
    const one = record(base, 'M8.E1');
    expect(one.legacy_row[1].length).toBe(units.LEGACY_CELL_MAX);
    expect(one.legacy_row[1].endsWith('…')).toBe(true);
    expect(one.legacy_row[2]).toBe('shipped now');
    expect(one.events[0].words).toBe('shipped now');
    const words = record(base, 'M8.E2').events[0].words;
    expect(words.length).toBe(units.CLOSE_WORDS_MAX);
    expect(JSON.stringify(units.listUnits(base).units)).not.toMatch(/[\u200b\u202e\u0007]/);
  });

  it('dropped words that are only invisible characters are no words', async () => {
    const before = snapshotTree(base);
    expect(await refusal(() => units.importUnit(base, dropped('M8.E2', '\u200b\u200b')))).toMatchObject({ code: 'SCHEMA' });
    expect(snapshotTree(base)).toEqual(before);
  });

  // Read-only: the snapshot S0 took of this repository's milestone rows. The
  // cutover test (AC8.1, `unit-records-live-cutover.test.js`) compares each legacy record's cells with these, so
  // what the import does to a cell must leave every real one as it is.
  it('every milestone-row cell in the S0 baseline survives the import unchanged', () => {
    const baseline = JSON.parse(readFileSync(new URL('../.planning/M6.E16-BASELINE.json', import.meta.url), 'utf-8'));
    const cells = baseline.units.filter((u) => u.milestone_row).flatMap((u) => u.milestone_row.cells);
    expect(cells.length).toBeGreaterThan(100);
    for (const cell of cells) expect(cut(printable(cell), units.LEGACY_CELL_MAX)).toBe(cell);
  });
});

describe('printable-text.js', () => {
  it('cut leaves short text alone and never ends on half a character', () => {
    expect(cut('a  b', 10)).toBe('a  b');
    expect(cut('abcdef', 4)).toBe('abc…');
    expect(cut('ab😀cd', 4)).toBe('ab…');
  });

  it('the record of an imported unit validates against the shipped schema', async () => {
    await units.importUnit(base, legacy('v0.9.1', { title: 'A release', summary: 'Recorded as over' }));
    expect(UNIT_KIND.validateRecord(record(base, 'v0.9.1'))).toEqual([]);
  });
});
