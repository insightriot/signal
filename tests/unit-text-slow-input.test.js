// M6.E16 REVIEW pass 1, S-M1 — no input makes a store write slow.
//
// Two things made one schema-valid unit record cost seconds on every write to
// the store: the pattern that turned a line break into a space tried every
// start of a long run of spaces (its length squared), and `legacy_row` had no
// limit on its number of cells. See .planning/M6.E16-VALIDATION.md row "S-M1".
//
// Timing follows tests/unit-records-perf.test.js: a warm-up call first, a
// bound far from both the old and the new cost (32 cells took the old code
// over 3 s and take this one about 10 ms; the bound is 1 s), and a raised test timeout so a slow run fails on the
// assertion and not on the runner's clock.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { renderEpicTable } from '../plugin/tools/lib/milestone-table.js';
import { oneLine } from '../plugin/tools/lib/printable-text.js';
import { LEGACY_CELL_MAX, LEGACY_CELLS_MAX, UNIT_KIND, UNIT_SCHEMA } from '../plugin/tools/lib/unit-record.js';
import * as units from '../plugin/tools/lib/unit-records.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { MILESTONE, UNITS, cleanupUnitsStores, put, read, unitsStore } from './helpers/units-store-fixture.js';

const AT = '2026-10-12T10:00:00.000Z';
const LEGACY = { type: 'closed', at: '2026-08-01', by: 'migration', reason: 'legacy' };
const SPACES = ' '.repeat(8000);
const MEGABYTE = ' '.repeat(1024 * 1024);

afterEach(cleanupUnitsStores);

const elapsed = async (fn) => {
  const t0 = performance.now();
  await fn();
  return performance.now() - t0;
};

// A record written past the library, as one that came by a merge would be.
const plantRow = (base, id, cells) => put(base, `${UNITS}/${id}.json`, `${JSON.stringify({ id, legacy_row: cells, events: [LEGACY] }, null, 2)}\n`);

describe('S-M1 — a record of long runs of spaces does not slow a store write', () => {
  it('32 cells of 8,000 spaces each: the views regenerate in under 1 s', async () => {
    const base = await unitsStore({ markers: true });
    put(base, `${UNITS}/.keep`, '');
    // Warm-up, and the views as they stand with unit records on. The fixture's table was kept by
    // hand and no unit has a record yet, so the rows are replaced on purpose, as the migration does.
    await regenerateViews(base, { replaceHandRows: true });
    const cells = ['`M7.E1`', ...Array.from({ length: 31 }, () => SPACES)];
    plantRow(base, 'M7.E1', cells);
    expect(UNIT_KIND.validateRecord({ id: 'M7.E1', legacy_row: cells, events: [LEGACY] })).toEqual([]);
    const ms = await elapsed(() => regenerateViews(base));
    console.log(`[S-M1] regenerateViews with 32 cells of 8,000 spaces: ${ms.toFixed(1)} ms`);
    expect(read(base, MILESTONE)).toContain('| `M7.E1` | ');
    expect(ms).toBeLessThan(1000);
  }, 60_000);

  it('60 cells is past the limit: the record is reported broken by name, at once, and no view is written from it', async () => {
    const base = await unitsStore({ markers: true });
    put(base, `${UNITS}/.keep`, '');
    await regenerateViews(base, { replaceHandRows: true });
    const before = read(base, MILESTONE);
    plantRow(base, 'M7.E1', Array.from({ length: 60 }, () => SPACES));
    let listed;
    const ms = await elapsed(() => { listed = units.listUnits(base); });
    expect(listed.broken.map((b) => [b.id, b.code])).toEqual([['M7.E1', 'invalid']]);
    expect(listed.broken[0].error).toContain(`legacy_row must have at most ${LEGACY_CELLS_MAX} entries (got 60)`);
    let thrown = null;
    const regenMs = await elapsed(async () => {
      try {
        await regenerateViews(base);
      } catch (err) {
        thrown = err;
      }
    });
    expect(thrown?.message).toContain('M7.E1');
    expect(read(base, MILESTONE)).toBe(before);
    expect(ms + regenMs).toBeLessThan(2000);
  }, 60_000);

  it('the limit is the schema\'s, and a renderer given more cells prints only that many', () => {
    expect(UNIT_SCHEMA.properties.legacy_row.maxItems).toBe(LEGACY_CELLS_MAX);
    const many = Array.from({ length: LEGACY_CELLS_MAX + 20 }, (_, i) => `c${i}`);
    const table = renderEpicTable([{ id: 'M7.E1', record: { id: 'M7.E1', legacy_row: many }, status: 'closed', close: { reason: 'legacy' } }], { milestone: '7' });
    const row = table.split('\n')[2];
    expect(row).toBe(`| ${many.slice(0, LEGACY_CELLS_MAX).join(' | ')} |`);
  });
});

describe('S-M1 — the writers cut a row that is too long, as they cut a cell that is too long', () => {
  const opts = { regenerate: async () => {} };
  const wide = Array.from({ length: LEGACY_CELLS_MAX + 5 }, (_, i) => `cell ${i}`);
  const stored = (base, id) => JSON.parse(readFileSync(join(base, UNITS, `${id}.json`), 'utf-8')).legacy_row;

  it('importUnits keeps the first cells and ends the row with "…"', async () => {
    const base = await unitsStore();
    await units.importUnits(base, [{ id: 'M7.E1', legacy_row: wide, close: { reason: 'legacy', at: AT, by: 'migration' } }], { ...opts, ensureDir: true });
    expect(stored(base, 'M7.E1')).toEqual([...wide.slice(0, LEGACY_CELLS_MAX - 1), '…']);
  });

  it('openUnit does the same', async () => {
    const base = await unitsStore();
    await units.ensureUnitsDir(base);
    await units.openUnit(base, 'M7.E2', { legacy_row: wide, by: 'claude', at: AT }, opts);
    expect(stored(base, 'M7.E2')).toEqual([...wide.slice(0, LEGACY_CELLS_MAX - 1), '…']);
  });

  it('a row at the limit is kept whole', async () => {
    const base = await unitsStore();
    const full = wide.slice(0, LEGACY_CELLS_MAX);
    await units.importUnits(base, [{ id: 'M7.E1', legacy_row: full, close: { reason: 'legacy', at: AT, by: 'migration' } }], { ...opts, ensureDir: true });
    expect(stored(base, 'M7.E1')).toEqual(full);
  });
});

describe('S-M1 — the two functions, timed on a megabyte of spaces', () => {
  it('oneLine: a megabyte of spaces, with and without a line break in it, in under 500 ms', () => {
    oneLine(' \n '); // warm-up
    let out;
    const t0 = performance.now();
    out = [oneLine(MEGABYTE), oneLine(`${MEGABYTE}\n${MEGABYTE}`), oneLine(`a${MEGABYTE}b`)];
    const ms = performance.now() - t0;
    console.log(`[S-M1] oneLine on 1 MB of spaces, three shapes: ${ms.toFixed(1)} ms`);
    expect(out[0]).toBe(MEGABYTE);
    expect(out[1]).toBe(' ');
    expect(out[2].length).toBe(MEGABYTE.length + 2);
    expect(ms).toBeLessThan(500);
  }, 60_000);

  it('oneLine changes exactly what the old pattern changed: a run with a line break becomes one space, any other run is kept', () => {
    const old = (text) => text.replace(/\s*[\r\n]+\s*/g, ' ');
    for (const text of ['a  b', 'a \n b', 'a\r\n\r\nb', '\n', '  a\t\tb  ', 'a  \n  b', 'a b', '', 'one\ntwo\rthree', ' \n a \n ']) {
      expect(oneLine(text)).toBe(old(text));
    }
  });

  it('a milestone-table cell of a megabyte of spaces renders in under 500 ms', () => {
    const unit = { id: 'M7.E1', record: { id: 'M7.E1', legacy_row: ['`M7.E1`', MEGABYTE, `x${MEGABYTE}\n${MEGABYTE}y`] }, status: 'closed', close: { reason: 'legacy' } };
    renderEpicTable([unit], { milestone: '7' }); // warm-up
    const t0 = performance.now();
    const table = renderEpicTable([unit], { milestone: '7' });
    const ms = performance.now() - t0;
    console.log(`[S-M1] renderEpicTable, legacy cells of 1 MB of spaces: ${ms.toFixed(1)} ms`);
    expect(table.split('\n')[2].length).toBeLessThanOrEqual(3 * LEGACY_CELL_MAX + 200);
    expect(ms).toBeLessThan(500);
  }, 60_000);

  it('a writer given a megabyte of spaces as a title refuses it as blank in under 500 ms', async () => {
    const base = await unitsStore();
    await units.ensureUnitsDir(base);
    let thrown = null;
    const ms = await elapsed(async () => {
      try {
        await units.openUnit(base, 'M7.E3', { title: `${MEGABYTE}\n`, by: 'claude', at: AT }, { regenerate: async () => {} });
      } catch (err) {
        thrown = err;
      }
    });
    console.log(`[S-M1] openUnit, a title of 1 MB of spaces: ${ms.toFixed(1)} ms`);
    expect(thrown).not.toBeNull();
    expect(ms).toBeLessThan(500);
  }, 60_000);
});

// REVIEW pass 2, T2-I2. The case above ends its megabyte of spaces with a line
// break, which the old pattern matched at once: it passed with `clean` back on
// that pattern. What was slow is a long run of spaces with NO line break after
// it — every start in the run is tried and abandoned. 64 KB is enough to show
// it (about two thousand million steps on the old pattern) and still finishes,
// so a wrong `clean` fails this as too slow rather than hanging the suite.
describe('S-M1 — a long run of spaces with no line break does not slow a writer (T2-I2)', () => {
  const RUN = ' '.repeat(64 * 1024);
  const INPUTS = { 'spaces only': RUN, 'a, spaces, b': `a${RUN}b` };
  const opts = { regenerate: async () => {} };
  const WRITERS = {
    openUnit: (base, text) => units.openUnit(base, 'M7.E3', { title: text, by: 'claude', at: AT }, opts),
    holdUnit: (base, text) => units.holdUnit(base, 'M7.E9', { reason: text, by: 'claude', at: AT }, opts),
    closeUnit: (base, text) => units.closeUnit(base, 'M7.E9', { reason: 'dropped', words: text, by: 'claude', at: AT }, opts),
  };

  for (const [writer, run] of Object.entries(WRITERS)) {
    for (const [shape, text] of Object.entries(INPUTS)) {
      it(`${writer}, ${shape}: under 500 ms`, async () => {
        const base = await unitsStore();
        await units.ensureUnitsDir(base);
        await units.openUnit(base, 'M7.E9', { by: 'claude', at: AT }, opts);
        let out = null;
        let thrown = null;
        const ms = await elapsed(async () => {
          try {
            out = await run(base, text);
          } catch (err) {
            thrown = err;
          }
        });
        console.log(`[T2-I2] ${writer}, ${shape} (64 KB): ${ms.toFixed(1)} ms`);
        expect(ms).toBeLessThan(500);
        // Spaces alone are blank and refused; text around the run is stored, cut at its limit.
        if (shape === 'spaces only') expect(thrown ?? out?.record?.title, 'refused as blank, or stored without a title').not.toBe(RUN);
        else expect(thrown).toBeNull();
      }, 300_000);
    }
  }
});

