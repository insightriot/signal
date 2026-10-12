// M6.E16 VERIFY loop 2, v2.3 — hostile text in a unit's free-text fields is
// cleaned at BOTH ends (NFR input safety). See .planning/M6.E16-VALIDATION.md
// row "NFR input".
//
// Loop 2 found `close.pr` and `close.release` reaching `work/EPICS.md` with
// NUL, ESC, a right-to-left override and tag characters in them, a comment
// opener printed as written in a heading, and a record that did not come
// through a writer printed as it was. So, three blocks:
//
//   1. every writer in `unit-records.js`, every free-text field it takes:
//      what is stored is printable and bounded;
//   2. the two renderers (`work/EPICS.md` and the milestone's Epic table),
//      given records that came through NO writer: what is printed is one
//      line per unit, printable, bounded, with no comment opener;
//   3. the schema: a record written past the writers, with a control
//      character or an over-long value in such a field, does not validate —
//      so `checkUnits` reports it — and every record of this repository does.
//
// The hostile characters are built from their code points, so this file holds
// none of them.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import * as units from '../plugin/tools/lib/unit-records.js';
import {
  CLOSE_WORDS_MAX, LEGACY_CELL_MAX, UNIT_KIND, UNIT_NOTE_MAX, UNIT_REASON_MAX, UNIT_REF_MAX, UNIT_SUMMARY_MAX, UNIT_TITLE_MAX,
  foldUnit,
} from '../plugin/tools/lib/unit-record.js';
import { renderViews } from '../plugin/tools/lib/work-views.js';
import { EPICS_BEGIN, EPICS_END, renderEpicTable } from '../plugin/tools/lib/milestone-table.js';
import { printable } from '../plugin/tools/lib/printable-text.js';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const AT = '2026-10-11T10:00:00.000Z';
const by = 'claude';
const UNITS = '.planning/work/units';
const EPICS = '.planning/work/EPICS.md';
const SHA = 'a'.repeat(40);
const SHA2 = 'b'.repeat(40);

const NUL = String.fromCodePoint(0);
const ESC = `${String.fromCodePoint(0x1b)}[31m`;
const RLO = String.fromCodePoint(0x202e); // right-to-left override
const TAG = String.fromCodePoint(0xe0041); // an invisible tag character
// One value carrying each attack that is not about length: NUL, ESC, the
// override, a tag character, a line break, a `|`, and the Epic table's end marker.
const HOSTILE = `ok${NUL}a${ESC}b${RLO}c${TAG}d\ne | f ${EPICS_END} g`;
const BIG = 'x'.repeat(20_000); // 20 kB

// What a stored or printed value must be, whatever was passed in.
function expectClean(value, max) {
  expect(typeof value).toBe('string');
  expect(printable(value)).toBe(value); // no control, format or invisible character — so no line break either
  expect(value.length).toBeLessThanOrEqual(max);
}

const made = [];
let base;

function put(dir, rel, text) {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
}
const stored = (id) => JSON.parse(readFileSync(join(base, `${UNITS}/${id}.json`), 'utf-8'));
const lastEvent = (id) => stored(id).events.at(-1);

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'sig-unit-text-'));
  made.push(base);
  put(base, '.planning/work/WORK.md', '---\nkey: LEAF\nschema_version: 2\n---\n');
  put(base, `${UNITS}/.keep`, '');
});
afterEach(() => {
  while (made.length) rmSync(made.pop(), { recursive: true, force: true });
});

// Nothing here is a secret; the gate is not what these cases are about.
const opts = { acknowledgeSensitive: true };

// ── 1. The writers ──────────────────────────────────────────────────────────

// Each row: a writer, the field, its limit, and how to write `value` into that
// field and read back what was stored. `M7.E1` is a fresh ID in every case.
const WRITES = [
  ['openUnit', 'title', UNIT_TITLE_MAX, async (v) => { await units.openUnit(base, 'M7.E1', { title: v, by, at: AT }, opts); return stored('M7.E1').title; }],
  ['openUnit', 'summary', UNIT_SUMMARY_MAX, async (v) => { await units.openUnit(base, 'M7.E1', { summary: v, by, at: AT }, opts); return stored('M7.E1').summary; }],
  ['openUnit', 'migration_note', UNIT_NOTE_MAX, async (v) => { await units.openUnit(base, 'M7.E1', { migration_note: v, by, at: AT }, opts); return stored('M7.E1').migration_note; }],
  ['openUnit', 'legacy_row cell', LEGACY_CELL_MAX, async (v) => { await units.openUnit(base, 'M7.E1', { legacy_row: ['`M7.E1`', v], by, at: AT }, opts); return stored('M7.E1').legacy_row[1]; }],
  ['importUnits', 'title', UNIT_TITLE_MAX, async (v) => { await units.importUnits(base, [{ id: 'M7.E1', title: v, opened: { at: AT, by } }], opts); return stored('M7.E1').title; }],
  ['importUnits', 'summary', UNIT_SUMMARY_MAX, async (v) => { await units.importUnits(base, [{ id: 'M7.E1', summary: v, opened: { at: AT, by } }], opts); return stored('M7.E1').summary; }],
  ['importUnits', 'migration_note', UNIT_NOTE_MAX, async (v) => { await units.importUnits(base, [{ id: 'M7.E1', migration_note: v, opened: { at: AT, by } }], opts); return stored('M7.E1').migration_note; }],
  ['importUnits', 'legacy_row cell', LEGACY_CELL_MAX, async (v) => { await units.importUnits(base, [{ id: 'M7.E1', legacy_row: ['`M7.E1`', v], close: { reason: 'legacy', at: AT, by } }], opts); return stored('M7.E1').legacy_row[1]; }],
  ['importUnits', 'close.pr', UNIT_REF_MAX, async (v) => { await units.importUnits(base, [{ id: 'M7.E1', close: { reason: 'legacy', pr: v, at: AT, by } }], opts); return lastEvent('M7.E1').pr; }],
  ['importUnits', 'close.release', UNIT_REF_MAX, async (v) => { await units.importUnits(base, [{ id: 'M7.E1', close: { reason: 'legacy', release: v, at: AT, by } }], opts); return lastEvent('M7.E1').release; }],
  ['importUnits', 'close.words', CLOSE_WORDS_MAX, async (v) => { await units.importUnits(base, [{ id: 'M7.E1', close: { reason: 'dropped', words: v, at: AT, by } }], opts); return lastEvent('M7.E1').words; }],
  ['importUnit', 'close.pr', UNIT_REF_MAX, async (v) => { await units.importUnit(base, { id: 'M7.E1', close: { reason: 'legacy', pr: v, at: AT, by } }, opts); return lastEvent('M7.E1').pr; }],
  ['requestUnitClose', 'pr', UNIT_REF_MAX, async (v) => { await open(); await units.requestUnitClose(base, 'M7.E1', { proof: SHA, pr: v, by, at: AT }, opts); return lastEvent('M7.E1').pr; }],
  ['requestUnitClose', 'release', UNIT_REF_MAX, async (v) => { await open(); await units.requestUnitClose(base, 'M7.E1', { proof: SHA, release: v, by, at: AT }, opts); return lastEvent('M7.E1').release; }],
  ['rerequestUnitClose', 'pr', UNIT_REF_MAX, async (v) => { await closing(); await units.rerequestUnitClose(base, 'M7.E1', { proof: SHA2, pr: v, by, at: AT }, opts); return lastEvent('M7.E1').pr; }],
  ['rerequestUnitClose', 'release', UNIT_REF_MAX, async (v) => { await closing(); await units.rerequestUnitClose(base, 'M7.E1', { proof: SHA2, release: v, by, at: AT }, opts); return lastEvent('M7.E1').release; }],
  ['confirmUnitClose', 'pr', UNIT_REF_MAX, async (v) => { await closing(); await units.confirmUnitClose(base, 'M7.E1', { proof: SHA, pr: v, by, at: AT }, opts); return lastEvent('M7.E1').pr; }],
  ['confirmUnitClose', 'release', UNIT_REF_MAX, async (v) => { await closing(); await units.confirmUnitClose(base, 'M7.E1', { proof: SHA, release: v, by, at: AT }, opts); return lastEvent('M7.E1').release; }],
  ['confirmUnitClose', 'words', CLOSE_WORDS_MAX, async (v) => { await closing(); await units.confirmUnitClose(base, 'M7.E1', { proof: SHA, words: v, by, at: AT }, opts); return lastEvent('M7.E1').words; }],
  ['closeUnit', 'pr', UNIT_REF_MAX, async (v) => { await open(); await units.closeUnit(base, 'M7.E1', { reason: 'legacy', pr: v, by, at: AT }, opts); return lastEvent('M7.E1').pr; }],
  ['closeUnit', 'release', UNIT_REF_MAX, async (v) => { await open(); await units.closeUnit(base, 'M7.E1', { reason: 'legacy', release: v, by, at: AT }, opts); return lastEvent('M7.E1').release; }],
  ['closeUnit', 'words', CLOSE_WORDS_MAX, async (v) => { await open(); await units.closeUnit(base, 'M7.E1', { reason: 'dropped', words: v, by, at: AT }, opts); return lastEvent('M7.E1').words; }],
  ['reopenUnit', 'reason', UNIT_REASON_MAX, async (v) => { await closing(); await units.reopenUnit(base, 'M7.E1', { reason: v, by, at: AT }, opts); return lastEvent('M7.E1').reason; }],
  ['holdUnit', 'reason', UNIT_REASON_MAX, async (v) => { await open(); await units.holdUnit(base, 'M7.E1', { reason: v, by, at: AT }, opts); return lastEvent('M7.E1').reason; }],
  ['editUnit', 'title', UNIT_TITLE_MAX, async (v) => { await open(); await units.editUnit(base, 'M7.E1', { changes: { title: v }, by, at: AT }, opts); return stored('M7.E1').title; }],
  ['editUnit', 'summary', UNIT_SUMMARY_MAX, async (v) => { await open(); await units.editUnit(base, 'M7.E1', { changes: { summary: v }, by, at: AT }, opts); return stored('M7.E1').summary; }],
  ['editUnit', 'migration_note', UNIT_NOTE_MAX, async (v) => { await open(); await units.editUnit(base, 'M7.E1', { changes: { migration_note: v }, by, at: AT }, opts); return stored('M7.E1').migration_note; }],
];
const open = () => units.openUnit(base, 'M7.E1', { by, at: AT });
const closing = async () => {
  await open();
  await units.requestUnitClose(base, 'M7.E1', { proof: SHA, by, at: AT });
};

describe('every unit writer stores free text printable and bounded', () => {
  for (const [writer, field, max, write] of WRITES) {
    it(`${writer} — ${field}: NUL, ESC, a right-to-left override, a tag character and a line break are taken out`, async () => {
      const value = await write(HOSTILE);
      expectClean(value, max);
      // The words are still there, and nothing printable was dropped.
      // A legacy cell is kept as `importUnits` keeps one: the line break goes; elsewhere it becomes a space.
      expect(value).toBe(`oka[31mbcd${field === 'legacy_row cell' ? '' : ' '}e | f ${EPICS_END} g`);
      expect(units.checkUnits(base)).toEqual([]);
    });

    it(`${writer} — ${field}: a 20 kB value is cut at ${max}`, async () => {
      const value = await write(BIG);
      expectClean(value, max);
      expect(value.length).toBe(max);
      expect(value.endsWith('…')).toBe(true);
      expect(units.checkUnits(base)).toEqual([]);
    });
  }

  it('an edit to hostile text records the cleaned value in its event too, so the history still folds', async () => {
    await open();
    await units.editUnit(base, 'M7.E1', { changes: { summary: HOSTILE }, by, at: AT }, opts);
    const record = stored('M7.E1');
    expect(record.events.at(-1).changes.summary.to).toBe(record.summary);
    expect(UNIT_KIND.checkEvents(record)).toEqual([]);
  });

  it('a reason that is only invisible characters is no reason: refused, nothing written', async () => {
    await open();
    const before = readFileSync(join(base, `${UNITS}/M7.E1.json`), 'utf-8');
    await expect(units.holdUnit(base, 'M7.E1', { reason: `${NUL}${RLO}${TAG}`, by, at: AT }, opts)).rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/needs a reason/) });
    await expect(units.reopenUnit(base, 'M7.E1', { reason: `${NUL}${RLO}`, by, at: AT }, opts)).rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/needs a reason/) });
    await expect(units.closeUnit(base, 'M7.E1', { reason: 'dropped', words: `${RLO}${TAG}`, by, at: AT }, opts)).rejects.toMatchObject({ code: 'SCHEMA', message: expect.stringMatching(/needs words/) });
    expect(readFileSync(join(base, `${UNITS}/M7.E1.json`), 'utf-8')).toBe(before);
  });
});

// ── 2. The renderers, on records no writer cleaned ──────────────────────────

// A unit as `listUnits` returns it, built by hand: nothing here was cleaned.
const unit = (id, events, extra = {}) => {
  const record = { id, ...extra, events };
  return { id, path: `${UNITS}/${id}.json`, record, ...foldUnit(record) };
};
const opened = { type: 'opened', at: AT, by };

// One unit per field a renderer prints, each holding `v`.
const hostileUnits = (v) => [
  unit('M7.E1', [opened, { type: 'close_requested', at: AT, by, proof: SHA }, { type: 'closed', at: AT, by, reason: 'shipped', proof: SHA, pr: v }]),
  unit('M7.E2', [opened, { type: 'close_requested', at: AT, by, proof: SHA }, { type: 'closed', at: AT, by, reason: 'shipped', proof: SHA, release: v }]),
  unit('M7.E3', [opened, { type: 'closed', at: AT, by, reason: 'dropped', words: v }]),
  unit('M7.E4', [{ type: 'closed', at: AT, by, reason: 'legacy', pr: v, release: v, words: v }]),
  unit('M7.E5', [{ type: 'closed', at: AT, by, reason: 'legacy' }], { legacy_row: [v, v, v] }),
  unit('M7.E6', [opened, { type: 'held', at: AT, by, reason: v }]),
  unit('M7.E7', [opened, { type: 'closed', at: AT, by, reason: 'dropped', words: 'gone' }, { type: 'held', at: AT, by, reason: v }]),
  unit('M7.E8', [opened], { summary: v }),
  unit('M7.E9', [opened], { title: v }),
  unit('M7.E10', [opened, { type: 'close_requested', at: AT, by, proof: v }]),
];
const COUNT = hostileUnits('x').length;

// The longest one printed line may be: every field of one unit at its limit.
const LINE_MAX = 3 * LEGACY_CELL_MAX + 200;

describe('work/EPICS.md treats what it reads as hostile, whatever wrote it', () => {
  const render = (v) => renderViews([], { units: hostileUnits(v) })[EPICS];

  it('NUL, ESC, an override, a tag character, a line break and a marker in any field: one clean heading per unit', () => {
    const text = render(HOSTILE);
    const lines = text.split('\n');
    for (const line of lines) expect(printable(line)).toBe(line);
    expect(lines.filter((l) => l.startsWith('### '))).toHaveLength(COUNT);
    expect(lines.filter((l) => /^#{1,2} /.test(l))).toEqual(['# Epics', '## Open', '## Held', '## Closed']);
    expect(text).not.toContain(EPICS_END);
    // The generated marker on line 1 is the file's only comment opener.
    expect(text.split('<!--')).toHaveLength(2);
    expect(lines[0].startsWith('<!--')).toBe(true);
  });

  it('a comment opener in any field is taken apart, as the milestone table does', () => {
    const text = render(`before <!-- hidden`);
    expect(text.split('<!--')).toHaveLength(2);
    expect(text).toContain('before <\\!-- hidden');
  });

  it('a 20 kB value in any field: no heading longer than its fields\' limits', () => {
    const lines = render(BIG).split('\n');
    expect(lines.filter((l) => l.startsWith('### '))).toHaveLength(COUNT);
    for (const line of lines) expect(line.length).toBeLessThan(LINE_MAX);
    // The PR and release of a close are cut at their own limit, not the words'.
    const shipped = lines.find((l) => l.startsWith('### M7.E1 '));
    expect(shipped.length).toBeLessThan(UNIT_REF_MAX + 100);
  });

  it('text a writer would store is printed as it was before: nothing real changes', () => {
    const text = renderViews([], { units: [
      unit('M7.E1', [opened, { type: 'close_requested', at: AT, by, proof: SHA }, { type: 'closed', at: AT, by, reason: 'shipped', proof: SHA, pr: '#41', release: 'v9.9.1' }]),
      unit('M7.E2', [opened, { type: 'held', at: AT, by, reason: 'still read daily' }]),
    ] })[EPICS];
    expect(text).toContain('### M7.E1 — closed 2026-10-11 (shipped) · PR #41 · v9.9.1');
    expect(text).toContain('### M7.E2 — open · held: still read daily');
  });
});

describe('the milestone Epic table treats what it reads as hostile, whatever wrote it', () => {
  const render = (v) => renderEpicTable(hostileUnits(v), { milestone: '7' });

  it('NUL, ESC, an override, a tag character, a line break and a marker in any field: one clean row per unit', () => {
    const text = render(HOSTILE);
    const rows = text.split('\n');
    expect(rows).toHaveLength(COUNT + 2);
    for (const row of rows) expect(printable(row)).toBe(row);
    expect(text).not.toContain(EPICS_END);
    expect(text).not.toContain(EPICS_BEGIN);
    expect(text).not.toContain('<!--');
  });

  it('a 20 kB value in any field, a legacy cell included: no row longer than its fields\' limits', () => {
    const rows = render(BIG).split('\n');
    expect(rows).toHaveLength(COUNT + 2);
    for (const row of rows) expect(row.length).toBeLessThan(LINE_MAX);
    const legacy = rows.find((r) => r.startsWith(`| ${'x'.repeat(10)}`));
    expect(legacy.length).toBeGreaterThan(LEGACY_CELL_MAX); // a legacy cell keeps up to its own limit
  });

  it('a `|` outside a legacy cell stays inside its cell', () => {
    const rows = render('a | b').split('\n');
    const cells = (row) => row.split(/(?<!\\)\|/).length - 2;
    for (const row of rows.filter((r) => !r.startsWith('| a | b |'))) expect(cells(row)).toBe(3);
  });
});

// ── 3. The schema ───────────────────────────────────────────────────────────

describe('the unit schema refuses a control character or an over-long value in a free-text field', () => {
  const closed = (extra) => ({ id: 'M7.E1', events: [{ type: 'closed', at: AT, by, reason: 'legacy', ...extra }] });
  // Each row: the field, its limit, and a record holding `v` there.
  const FIELDS = [
    ['title', UNIT_TITLE_MAX, (v) => ({ id: 'M7.E1', title: v, events: [opened] })],
    ['summary', UNIT_SUMMARY_MAX, (v) => ({ id: 'M7.E1', summary: v, events: [opened] })],
    ['migration_note', UNIT_NOTE_MAX, (v) => ({ id: 'M7.E1', migration_note: v, events: [opened] })],
    ['legacy_row cell', LEGACY_CELL_MAX, (v) => ({ id: 'M7.E1', legacy_row: ['a', v], events: [opened] })],
    ['closed.pr', UNIT_REF_MAX, (v) => closed({ pr: v })],
    ['closed.release', UNIT_REF_MAX, (v) => closed({ release: v })],
    ['closed.words', CLOSE_WORDS_MAX, (v) => closed({ words: v })],
    ['close_requested.pr', UNIT_REF_MAX, (v) => ({ id: 'M7.E1', events: [opened, { type: 'close_requested', at: AT, by, proof: SHA, pr: v }] })],
    ['close_requested.release', UNIT_REF_MAX, (v) => ({ id: 'M7.E1', events: [opened, { type: 'close_requested', at: AT, by, proof: SHA, release: v }] })],
    ['held.reason', UNIT_REASON_MAX, (v) => ({ id: 'M7.E1', events: [opened, { type: 'held', at: AT, by, reason: v }] })],
    ['reopened.reason', UNIT_REASON_MAX, (v) => ({ id: 'M7.E1', events: [opened, { type: 'closed', at: AT, by, reason: 'legacy' }, { type: 'reopened', at: AT, by, reason: v }] })],
  ];
  const valid = (record) => UNIT_KIND.validateRecord(record).length === 0;

  for (const [field, max, record] of FIELDS) {
    it(`${field}: plain text up to ${max} characters is valid; one more, or a control or invisible character, is not`, () => {
      expect(valid(record('plain words, with a | and a <!-- too'))).toBe(true);
      expect(valid(record('y'.repeat(max)))).toBe(true);
      expect(valid(record('y'.repeat(max + 1)))).toBe(false);
      for (const bad of [NUL, ESC, RLO, TAG, '\n', '\r', '\t']) expect(valid(record(`a${bad}b`)), JSON.stringify(bad)).toBe(false);
    });
  }

  it('checkUnits reports a record placed on disk with an override in its PR text', () => {
    put(base, `${UNITS}/M7.E1.json`, `${JSON.stringify(closed({ pr: `#4${RLO}1` }), null, 2)}\n`);
    expect(units.checkUnits(base).map((f) => [f.code, f.id])).toEqual([['invalid', 'M7.E1']]);
  });

  it('every unit record of this repository still validates', () => {
    const { units: all, broken } = units.listUnits(REPO);
    expect(broken).toEqual([]);
    expect(all.length).toBeGreaterThanOrEqual(48);
    expect(units.checkUnits(REPO)).toEqual([]);
  });
});
