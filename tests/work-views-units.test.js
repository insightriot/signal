// M6.E16.S5.t5.1 — `work/EPICS.md` from unit records (AC7.1).
// See .planning/M6.E16-VALIDATION.md row AC7.1.
//
// With unit records the Epic index lists EVERY unit record with its folded
// state — open (closing marked, with its proof), held, closed (newest first,
// with the date, PR and release when recorded) — and under each its items. A
// unit an item names that has no record is listed under a heading that says
// so. "no Epic folder" is never printed, and the Epic folders are not read.
// Without unit records the view is what it was.
//
// Stores are temp folders; unit names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { renderViews, regenerateViews, regenerateToMemory } from '../plugin/tools/lib/work-views.js';
import * as records from '../plugin/tools/lib/work-records.js';
import * as unitLib from '../plugin/tools/lib/unit-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { UNIT_KIND, foldUnit } from '../plugin/tools/lib/unit-record.js';
import { GENERATED_MARKER } from '../plugin/tools/lib/work-marker.js';

const by = 'claude';
const AT = '2026-10-01T10:00:00.000Z';
const SHA = '0123abc4567';
const EPICS = '.planning/work/EPICS.md';
const UNITS = '.planning/work/units';

const U = {
  opened: (at = AT) => ({ type: 'opened', at, by }),
  closing: (proof = SHA) => ({ type: 'close_requested', at: AT, by, proof }),
  shipped: (at, extra = {}) => ({ type: 'closed', at, by, reason: 'shipped', proof: SHA, ...extra }),
  dropped: (at, words) => ({ type: 'closed', at, by, reason: 'dropped', words }),
  legacy: (at, extra = {}) => ({ type: 'closed', at, by: 'migration', reason: 'legacy', ...extra }),
  held: (reason) => ({ type: 'held', at: AT, by, reason }),
};
const I = {
  created: { type: 'created', at: '2026-09-01', by },
  triaged: { type: 'triaged', at: '2026-09-02', by },
  queued: (epic) => ({ type: 'queued', at: '2026-09-03', by, epic }),
};
// A unit as `listUnits` returns it.
const unit = (id, events, extra = {}) => {
  const record = { id, ...extra, events };
  return { id, path: `${UNITS}/${id}.json`, record, ...foldUnit(record) };
};
const item = (id, events, type = 'FEAT') => ({ record: { id, type, title: `title of ${id}`, events }, body: null });

const ALL_UNITS = [
  unit('M7.E10', [U.opened()]),
  unit('M7.E2', [U.opened(), U.closing()]),
  unit('M7.E3', [U.opened(), U.closing(), U.shipped('2026-09-20T09:00:00.000Z', { pr: '#41', release: 'v9.9.1' })]),
  unit('M7.E4', [U.opened(), U.closing(), U.shipped('2026-09-25T09:00:00.000Z', { pr: '#44' }), U.held('still read daily')]),
  unit('M7.E5', [U.opened(), U.dropped('2026-09-28', 'became M7.E10')]),
  unit('M6.5.E1', [U.legacy('2026-08-01', { pr: '#12', release: 'v9.0.0' })], { legacy_row: ['`M6.5.E1`', 'shipped', 'old'] }),
  unit('M7.E6', [U.opened(), U.closing(), U.shipped('2026-09-30T09:00:00.000Z')]),
  unit('phase-11', [U.opened(), U.held('audit in progress')]),
  unit('GATE-A', [U.opened()]),
];
const ITEMS = [
  item('SIG-1', [I.created, I.triaged, I.queued('M7.E10')]),
  item('SIG-2', [I.created, I.triaged, I.queued('M7.E3')], 'BUG'),
  item('SIG-3', [I.created, I.triaged, I.queued('M9.E1')]),
  item('SIG-4', [I.created, I.triaged, I.queued('phase-11')]),
  item('SIG-5', [I.created, I.triaged]),
];

const render = (units = ALL_UNITS, items = ITEMS) => renderViews(items, { units })[EPICS];
const headings = (text) => text.split('\n').filter((l) => /^#{2,3} /.test(l));

describe('renderViews with unit records — work/EPICS.md (AC7.1)', () => {
  it('starts with the generated marker and the same title', () => {
    const text = render();
    expect(text.split('\n')[0]).toBe(GENERATED_MARKER);
    expect(text.split('\n')[1]).toBe('# Epics');
  });

  it('every unit record is listed once, in its section, in order', () => {
    expect(headings(render())).toEqual([
      '## Open',
      '### M7.E2 — closing · proof 0123abc4567',
      '### M7.E10 — open',
      '### GATE-A — open',
      '### phase-11 — open · held: audit in progress',
      '## Held',
      '### M7.E4 — closed 2026-09-25 (shipped) · PR #44 · held: still read daily',
      '## Closed',
      '### M7.E6 — closed 2026-09-30 (shipped)',
      '### M7.E5 — closed 2026-09-28 (dropped) — became M7.E10',
      '### M7.E3 — closed 2026-09-20 (shipped) · PR #41 · v9.9.1',
      '### M6.5.E1 — closed (legacy) · PR #12 · v9.0.0 — old row: shipped',
      '## No unit record',
      '### M9.E1',
    ]);
  });

  it('Epic IDs sort by milestone then number; other names after them, alphabetically', () => {
    const units = ['zeta', 'M7.E10', 'M10.E1', 'M7.E9', 'M6.5.E2', 'alpha', 'M6.E30'].map((id) => unit(id, [U.opened()]));
    expect(headings(render(units, [])).slice(1).map((h) => h.match(/^### (\S+)/)[1]))
      .toEqual(['M6.E30', 'M6.5.E2', 'M7.E9', 'M7.E10', 'M10.E1', 'alpha', 'zeta']);
  });

  it('closed units are newest first; the same instant falls back to ID order', () => {
    const at = '2026-09-20T09:00:00.000Z';
    const units = [
      unit('M7.E9', [U.opened(), U.dropped(at, 'x')]),
      unit('M7.E1', [U.opened(), U.dropped('2026-09-21', 'x')]),
      unit('M7.E2', [U.opened(), U.dropped(at, 'x')]),
    ];
    expect(headings(render(units, [])).slice(1).map((h) => h.match(/^### (\S+)/)[1])).toEqual(['M7.E1', 'M7.E2', 'M7.E9']);
  });

  it('each unit lists the items whose events name it, as before; a unit with none says so', () => {
    const text = render();
    const section = (id) => text.slice(text.indexOf(`### ${id}`)).split('\n### ')[0].split('\n## ')[0];
    expect(section('M7.E10 ')).toContain('- SIG-1 · FEAT · Q — title of SIG-1');
    expect(section('M7.E3 ')).toContain('- SIG-2 · BUG · Q — title of SIG-2');
    expect(section('phase-11 ')).toContain('- SIG-4 · FEAT · Q — title of SIG-4');
    expect(section('M7.E2 ')).toContain('_no items_');
    expect(text).not.toContain('SIG-5'); // in no unit
  });

  it('a unit an item names that has no record is still listed, under a heading that says so', () => {
    const text = render();
    const tail = text.slice(text.indexOf('## No unit record'));
    expect(tail).toMatch(/no record under `\.planning\/work\/units\/`/);
    expect(tail).toContain('### M9.E1');
    expect(tail).toContain('- SIG-3 · FEAT · Q — title of SIG-3');
  });

  it('"no Epic folder" never appears, and a section with nothing in it is not printed', () => {
    expect(render()).not.toMatch(/no Epic folder/);
    const onlyOpen = render([unit('M7.E1', [U.opened()])], []);
    expect(headings(onlyOpen)).toEqual(['## Open', '### M7.E1 — open']);
    expect(onlyOpen).not.toMatch(/no Epic folder/);
  });

  it('unit records on, with none yet: says so', () => {
    // The same bytes as the folder view of an empty store: turning unit records on changes nothing until there is a unit.
    expect(render([], [])).toBe(renderViews([], { epics: [] })[EPICS]);
    expect(render([], [])).toContain('_no Epics_');
  });

  it('recorded text stays on one line: a line break in a hold reason or in a close\'s words cannot start a heading', () => {
    const text = render([
      unit('M7.E1', [U.opened(), U.held('one\n## Injected')]),
      unit('M7.E2', [U.opened(), U.dropped('2026-09-28', 'gone\n\n### M7.E99 — open')]),
    ], []);
    expect(headings(text)).toEqual([
      '## Open',
      '### M7.E1 — open · held: one ## Injected',
      '## Closed',
      '### M7.E2 — closed 2026-09-28 (dropped) — gone ### M7.E99 — open',
    ]);
  });

  // VERIFY loop 1 (AC7.1's limit): a legacy close's `at` is the day the record was written, not the day
  // the unit shipped — `milestone-table.js` withholds it for that reason, and this view printed it.
  describe('a legacy close is not dated at the day it was recorded', () => {
    const WORDS = 'over before unit records existed; recorded when they were added';
    const legacyUnit = (id, row, extra = {}) =>
      unit(id, [U.legacy('2026-10-12', { words: WORDS, ...extra })], row === undefined ? {} : { legacy_row: row });
    const heading = (u) => headings(render([u], []))[1];

    it('with an old row: says legacy and prints the row\'s own status words, which carry the real date', () => {
      const h = heading(legacyUnit('M7.E1', ['`M7.E1`', '**shipped** — `v9.9.0`, 2026-08-03 (PR #31)', 'a summary']));
      expect(h).toBe('### M7.E1 — closed (legacy) — old row: **shipped** — `v9.9.0`, 2026-08-03 (PR #31)');
      expect(h).not.toContain('2026-10-12');
    });

    it('with no old row: says legacy and the close\'s words, and no date', () => {
      const h = heading(legacyUnit('v9.8.7'));
      expect(h).toBe(`### v9.8.7 — closed (legacy) — ${WORDS}`);
      expect(h).not.toContain('2026-10-12');
    });

    it('a row with no status cell, or one that is not text, prints as no old row', () => {
      for (const row of [['`M7.E1`'], ['`M7.E1`', '   '], ['`M7.E1`', 7], []]) {
        expect(heading(legacyUnit('M7.E1', row))).toBe(`### M7.E1 — closed (legacy) — ${WORDS}`);
      }
    });

    it('a shipped and a dropped close keep their own date', () => {
      expect(heading(unit('M7.E1', [U.opened(), U.closing(), U.shipped('2026-09-20T09:00:00.000Z')]))).toBe('### M7.E1 — closed 2026-09-20 (shipped)');
      expect(heading(unit('M7.E1', [U.opened(), U.dropped('2026-09-28', 'never ran')]))).toBe('### M7.E1 — closed 2026-09-28 (dropped) — never ran');
    });

    it('a held legacy unit says both', () => {
      const u = unit('M7.E1', [U.legacy('2026-10-12'), U.held('still read')], { legacy_row: ['`M7.E1`', 'shipped 2026-08-03', ''] });
      expect(heading(u)).toBe('### M7.E1 — closed (legacy) — old row: shipped 2026-08-03 · held: still read');
    });

    it('a hostile old row stays one bounded, printable line', () => {
      const hostile = `shipped\n\n## Injected\r\n### M7.E99 — open \u202eevil\u200b\u0007\u001b[31m ${'x'.repeat(10000)}`;
      const text = render([legacyUnit('M7.E1', ['`M7.E1`', hostile, 'a summary'])], []);
      expect(headings(text)).toHaveLength(2); // '## Closed' and the unit: nothing injected
      const h = headings(text)[1];
      expect(h.startsWith('### M7.E1 — closed (legacy) — old row: shipped ## Injected ### M7.E99 — open evil[31m xxx')).toBe(true);
      expect(h).not.toMatch(/[\p{Cc}\p{Cf}\u2028\u2029]/u);
      expect(h.endsWith('…')).toBe(true);
      expect(h.length).toBeLessThanOrEqual('### M7.E1 — closed (legacy) — old row: '.length + 200);
    });
  });

  it('the same units in any order give the same bytes', () => {
    expect(render([...ALL_UNITS].reverse(), [...ITEMS].reverse())).toBe(render());
  });

  it('without `units` the view is the folder view it was (AC6.4)', () => {
    const text = renderViews(ITEMS, { epics: [{ id: 'M7.E10', archived: false }] })[EPICS];
    expect(text).toContain('## M7.E10 — open');
    expect(text).toContain('## M9.E1 — no Epic folder');
    expect(text).not.toContain('## Open');
  });
});

// ── On disk ─────────────────────────────────────────────────────────────────

describe('regenerateViews on a project with unit records', () => {
  let base;
  async function put(rel, content) {
    const p = join(base, rel);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, content, 'utf-8');
  }
  const read = (rel) => readFile(join(base, rel), 'utf-8');
  const plant = (u) => put(u.path, UNIT_KIND.serializeRecord(u.record));

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'sig-views-units-'));
    await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    for (const it of ITEMS) await put(records.recordPath(it.record.id), serializeRecord(it.record));
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('EPICS.md is rendered from the records on disk, and equals the pure render', async () => {
    for (const u of ALL_UNITS) await plant(u);
    await regenerateViews(base);
    expect(await read(EPICS)).toBe(render());
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('the Epic folders are not read: a live folder and an archived one change nothing, and a broken archived README does not refuse', async () => {
    for (const u of ALL_UNITS) await plant(u);
    await mkdir(join(base, '.planning/work/epics/M8.E1'), { recursive: true });
    await put('.planning/archive/epics/M8.E2/README.md', '---\nclose: [unclosed\n---\n');
    await regenerateViews(base);
    const text = await read(EPICS);
    expect(text).toBe(render());
    expect(text).not.toContain('M8.E1');
    expect(text).not.toContain('M8.E2');
  });

  it('an empty units folder is unit records on: no folder lookup, and an item\'s Epic reads "no unit record"', async () => {
    await put(`${UNITS}/.keep`, '');
    await mkdir(join(base, '.planning/work/epics/M7.E10'), { recursive: true });
    await regenerateViews(base);
    const text = await read(EPICS);
    expect(text).not.toMatch(/no Epic folder/);
    expect(headings(text)).toEqual(['## No unit record', '### M7.E3', '### M7.E10', '### M9.E1', '### phase-11']);
  });

  it('a broken unit record refuses the regeneration by ID, and nothing is written', async () => {
    for (const u of ALL_UNITS) await plant(u);
    await regenerateViews(base);
    const before = await read(EPICS);
    await put(`${UNITS}/M7.E77.json`, UNIT_KIND.serializeRecord({ id: 'M7.E77', events: [U.opened()] }).replace('"opened"', '"opened_twice"'));
    await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/M7\.E77/) });
    expect(() => regenerateToMemory(base)).toThrow(/M7\.E77/);
    expect(await read(EPICS)).toBe(before);
    // …and so an item write is refused before it lands, as over a broken item record.
    await expect(records.triageItem(base, 'SIG-5', { type: 'CHORE', by })).rejects.toMatchObject({ code: 'SCHEMA' });
  });

  it('a unit write shows in EPICS.md at once (t5.0b joined to t5.1)', async () => {
    await plant(unit('M7.E1', [U.opened()]));
    await regenerateViews(base);
    expect(await read(EPICS)).toContain('### M7.E1 — open');
    await unitLib.holdUnit(base, 'M7.E1', { reason: 'keep it live', by });
    expect(await read(EPICS)).toContain('### M7.E1 — open · held: keep it live');
    await unitLib.openUnit(base, 'M7.E2', { by });
    expect(await read(EPICS)).toContain('### M7.E2 — open');
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('without a units folder the folder view is written, as before (AC6.4)', async () => {
    await mkdir(join(base, '.planning/work/epics/M7.E10'), { recursive: true });
    // SIG-4 is queued for `phase-11`. Without unit records that record is broken,
    // as on `v0.1.50` (v2.1), and the views refuse over a broken record.
    await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/SIG-4.*phase-11/s) });
    await rm(join(base, records.recordPath('SIG-4')));
    await regenerateViews(base);
    const text = await read(EPICS);
    expect(text).toContain('## M7.E10 — open');
    expect(text).toContain('## M9.E1 — no Epic folder');
  });
});
