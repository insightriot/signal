// The migration loses nothing a milestone row said (REVIEW pass 2, C2-I3).
//
// Adding unit records to a project whose milestone table carries the markers
// replaces the table. Before this:
//   - an open unit kept only its row's third cell (as `summary`): the status
//     words — "in flight — PLAN done" — were stored nowhere;
//   - a row between the markers that got no record (a second row for one
//     unit, a row that is not an Epic row) was removed without a line in the
//     dry run;
//   - a table with another header became three columns, unannounced.
// Now every unit that has a row carries its cells (`legacy_row`), open or
// closed; the dry run lists each row that is kept nowhere, inside its hash;
// and it says when the header changes. The table prints a legacy row only for
// a unit closed as legacy, so an open unit still prints a status of its own.
//
// Temp folders, real git; every name is invented.

import { describe, it, expect, afterEach } from 'vitest';

import { renderEpicTable } from '../plugin/tools/lib/milestone-table.js';
import { runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { planUnits } from '../plugin/tools/lib/work-migrate-units.js';
import { UNIT_KIND, foldUnit } from '../plugin/tools/lib/unit-record.js';
import { editUnit, getUnit, reopenUnit } from '../plugin/tools/lib/unit-records.js';
import { checkRecords } from '../plugin/tools/lib/work-records.js';
import { MILESTONE, ROWS, bytesOf, cleanupUnitsStores, commitAll, put, read, unitsStore } from './helpers/units-store-fixture.js';

afterEach(cleanupUnitsStores);

const BEGIN = '<!-- signal:epics:begin -->';
const END = '<!-- signal:epics:end -->';
const doc = (lines) => lines.join('\n');
const marked = (between, header = ['| Epic | Status | Summary |', '|---|---|---|']) => doc([
  '# Milestone 7', '', 'Written by hand.', '', BEGIN, ...header, ...between, END, '', 'After the table.', '',
]);
const dryRun = (base) => runWorkStoreMigrate(base, { apply: false });
const applyWith = (base, dry, opts = {}) => runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T1', at: '2026-10-12', ...opts });

describe('(a) an open unit keeps every cell of its milestone row', () => {
  for (const confirmUnitCloses of [true, false]) {
    it(`apply with the proposed closes ${confirmUnitCloses ? 'confirmed' : 'not confirmed'}: the current unit's status words are in its record`, async () => {
      const base = await unitsStore({ repo: true, markers: true });
      const dry = await dryRun(base);
      const out = await applyWith(base, dry, { confirmUnitCloses });
      expect(out.applied).toBe(true);
      const e9 = getUnit(base, 'M7.E9');
      expect(e9.status).toBe('open');
      expect(e9.record.legacy_row).toEqual(['`M7.E9`', '**in flight** — PLAN done', 'The current one']);
      expect(e9.record.summary).toBe('The current one');
      // The flagged unit, open on either answer, keeps "parked" and its dates too.
      expect(getUnit(base, 'M7.E4').record.legacy_row[1]).toBe('**shipped** — 2026-09-05 (parked 2026-08-01, reopened)');
      // A proposed close that was not confirmed is open, and loses nothing either.
      const e1 = getUnit(base, 'M7.E1');
      expect(e1.status).toBe(confirmUnitCloses ? 'closed' : 'open');
      expect(e1.record.legacy_row).toEqual(['`M7.E1`', '**shipped** — `v1.2`, 2026-09-01 (PR #12)', 'Lantern index']);
      // The table: an open unit prints its own status, a legacy close prints its old row.
      const text = read(base, MILESTONE);
      expect(text).toContain('| `M7.E9` | **in flight** | The current one |');
      expect(text).toContain(confirmUnitCloses ? ROWS['M7.E1'] : '| `M7.E1` | **in flight** | Lantern index |');
      expect(checkRecords(base)).toEqual([]);
    }, 60_000);
  }

  it('renderEpicTable prints a legacy row only for a unit that reads closed as legacy', () => {
    const AT = '2026-10-12T10:00:00.000Z';
    const by = 'claude';
    const row = ['`M7.E1`', '**shipped** long ago', 'old summary'];
    const unit = (events, extra = {}) => {
      const record = { id: 'M7.E1', legacy_row: row, ...extra, events };
      expect(UNIT_KIND.validateRecord(record)).toEqual([]);
      return { id: 'M7.E1', record, ...foldUnit(record) };
    };
    const line = (u) => renderEpicTable([u], { milestone: '7' }).split('\n')[2];
    const opened = { type: 'opened', at: AT, by };
    const legacy = { type: 'closed', at: AT, by, reason: 'legacy' };
    expect(line(unit([legacy]))).toBe('| `M7.E1` | **shipped** long ago | old summary |');
    expect(line(unit([opened], { summary: 'now' }))).toBe('| `M7.E1` | **in flight** | now |');
    expect(line(unit([legacy, { type: 'reopened', at: AT, by, reason: 'it came back' }]))).toBe('| `M7.E1` | **in flight** |  |');
    expect(line(unit([opened, { type: 'closed', at: AT, by, reason: 'dropped', words: 'went away' }]))).toBe('| `M7.E1` | **dropped** — went away |  |');
    expect(line(unit([opened, { type: 'close_requested', at: AT, by, proof: 'a'.repeat(40) }]))).toMatch(/\*\*closing\*\* — proof aaaaaaa/);
  });

  it('a unit closed as legacy and then reopened no longer prints "shipped" in the live table', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    await applyWith(base, await dryRun(base), { confirmUnitCloses: true });
    await reopenUnit(base, 'M7.E1', { reason: 'it came back', by: 'claude' });
    const text = read(base, MILESTONE);
    expect(text).toMatch(/\| `M7\.E1` \| \*\*in flight\*\* \|/);
    expect(text).not.toContain(ROWS['M7.E1']);
    expect(getUnit(base, 'M7.E1').record.legacy_row[1]).toMatch(/shipped/);
  }, 60_000);

  // The table refuses a row whose first cell is more than an Epic's ID — but
  // not one the migration took as an Epic's row and stored: that stays the
  // Epic's row for every later write.
  it('rows whose first cell carries a title import, and no later write is refused over them — a reopen included', async () => {
    const TITLED = '| **E1 — Lantern index** | **shipped** — 2026-09-01 | the old way of naming it |';
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, marked([TITLED, '| **E9 — the current one** | **in flight** — PLAN done | going |']));
    commitAll(base);
    const out = await applyWith(base, await dryRun(base), { confirmUnitCloses: true });
    expect(out.applied).toBe(true);
    expect(getUnit(base, 'M7.E1').record.legacy_row[0]).toBe('**E1 — Lantern index**');
    expect(read(base, MILESTONE)).toContain(TITLED);
    await editUnit(base, 'M7.E9', { changes: { summary: 'still going' }, by: 'claude' });
    expect(read(base, MILESTONE)).toContain(TITLED);
    await reopenUnit(base, 'M7.E1', { reason: 'it came back', by: 'claude' });
    expect(read(base, MILESTONE)).toMatch(/\| `M7\.E1` \| \*\*in flight\*\* \|/);
    expect(checkRecords(base)).toEqual([]);
  }, 60_000);
});

describe('a row whose status says shipped, but not first, is never closed by the yes to the list', () => {
  it('apply with the proposed closes confirmed: the three stay open, and a row that begins with shipped is closed', async () => {
    const cells = {
      'M7.E60': 'S1 shipped; S2 in progress', 'M7.E61': 'partially shipped, rest deferred', 'M7.E62': 'planned — not started; ships after E4 is shipped',
      'M7.E63': '**shipped** v0.1.12',
    };
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, marked([...Object.entries(cells).map(([id, cell]) => `| \`${id}\` | ${cell} | x |`), ROWS['M7.E9']]));
    commitAll(base);
    const dry = await dryRun(base);
    for (const id of ['M7.E60', 'M7.E61', 'M7.E62']) expect(dry.report).toContain(`  ${id}  open  [flagged: row-unclear]  — its milestone row says shipped, but not as the first word of its status`);
    const out = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(out.applied).toBe(true);
    for (const id of ['M7.E60', 'M7.E61', 'M7.E62']) {
      expect(getUnit(base, id).status, id).toBe('open');
      expect(getUnit(base, id).record.legacy_row[1]).toBe(cells[id]);
    }
    expect(getUnit(base, 'M7.E63')).toMatchObject({ status: 'closed', close: { reason: 'legacy' } });
  }, 60_000);
});

describe('(b) the dry run lists every table row between the markers that is kept nowhere', () => {
  const SECOND = '| `M7.E1` | a second row for the same Epic | with its own words |';
  const NOTE_ROW = '| a reminder | not an Epic row | call the harbour master |';
  const BARE = '| Epic 5 | planned | not read as an Epic row |';
  const between = [ROWS['M7.E1'], SECOND, ROWS['M7.E9'], NOTE_ROW, BARE, 'and a line that is not a row'];

  it('a second row for one unit, a row that is not an Epic row, and a plain line: each named with its line number; the rows that go into records are not', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, marked(between));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.refused).toBeUndefined();
    expect(dry.report).toMatch(/4 lines between the markers are kept nowhere and are removed by the apply/);
    expect(dry.report).toMatch(/\n {2}line 9: “\| `M7\.E1` \| a second row for the same Epic \| with its own words \|”/);
    expect(dry.report).toMatch(/\n {2}line 11: “\| a reminder \| not an Epic row \| call the harbour master \|”/);
    expect(dry.report).toMatch(/\n {2}line 12: “\| Epic 5 \| planned \| not read as an Epic row \|”/);
    expect(dry.report).toMatch(/\n {2}line 13: “and a line that is not a row”/);
    expect(dry.report).not.toMatch(/\n {2}line 8: /); // M7.E1's first row goes into its record
    expect(dry.report).not.toMatch(/\n {2}line 10: /); // and M7.E9's
    const plan = await planUnits(base);
    expect(plan.milestone.removes.count).toBe(4);
    expect(plan.milestone.removes.lines.map((l) => l.line)).toEqual([9, 11, 12, 13]);
    expect(plan.milestone.header).toBeUndefined();
  });

  it('a table whose every row goes into a record lists nothing, and plans as it did', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    const plan = await planUnits(base);
    expect(plan.milestone).toEqual({ rel: MILESTONE, markers: 'ok' });
    expect((await dryRun(base)).report).not.toMatch(/removed by the apply/);
  });

  it('a row that is kept nowhere is inside the hash: changed after the dry run, the apply refuses and writes nothing', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, marked(between));
    commitAll(base);
    const dry = await dryRun(base);
    put(base, MILESTONE, marked(between.map((l) => (l === NOTE_ROW ? NOTE_ROW.replace('harbour master', 'lighthouse keeper') : l))));
    commitAll(base);
    const before = bytesOf(base);
    const r = await applyWith(base, dry);
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/changed since the dry run/);
    expect(bytesOf(base)).toEqual(before);
  }, 60_000);

  it('the apply removes exactly what the dry run named: those rows are gone, every other row\'s cells are in a record', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, marked(between));
    commitAll(base);
    const r = await applyWith(base, await dryRun(base), { confirmUnitCloses: true });
    expect(r.applied).toBe(true);
    const text = read(base, MILESTONE);
    for (const gone of [SECOND, NOTE_ROW, BARE, 'and a line that is not a row']) expect(text).not.toContain(gone);
    expect(text).toContain(ROWS['M7.E1']);
    expect(getUnit(base, 'M7.E9').record.legacy_row[1]).toBe('**in flight** — PLAN done');
    expect(checkRecords(base)).toEqual([]);
  }, 60_000);

  // A row whose cells DO go into a record can still leave the table: the
  // generated table prints the Epics of its own milestone only.
  it('a row for another milestone\'s Epic: listed as removed, with the record its cells stay in; after the apply it is gone from the table and in that record', async () => {
    const OTHER = '| `M6.E3` | **shipped** — 2026-07-01 | Filed under the wrong milestone |';
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, marked([ROWS['M7.E1'], OTHER, ROWS['M7.E9']]));
    commitAll(base);
    const plan = await planUnits(base);
    expect(plan.milestone.removes.count).toBe(1);
    expect(plan.milestone.removes.lines).toEqual([{ line: 9, text: OTHER, unit: 'M6.E3' }]);
    const dry = await dryRun(base);
    expect(dry.refused).toBeUndefined();
    expect(dry.report).toMatch(/1 row between the markers is removed by the apply/);
    expect(dry.report).not.toMatch(/kept nowhere/);
    expect(dry.report).toContain(`\n  line 9: “${OTHER}” — its cells stay in the unit record of M6.E3 (legacy_row)`);
    const r = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(r.applied).toBe(true);
    expect(read(base, MILESTONE)).not.toContain('M6.E3');
    expect(getUnit(base, 'M6.E3').record.legacy_row).toEqual(['`M6.E3`', '**shipped** — 2026-07-01', 'Filed under the wrong milestone']);
  }, 60_000);

  it('such a row beside lines that are kept nowhere: the count of each is said, and only the row is marked as kept', async () => {
    const OTHER = '| `M6.E3` | **shipped** — 2026-07-01 | Filed under the wrong milestone |';
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, marked([ROWS['M7.E1'], OTHER, NOTE_ROW, ROWS['M7.E9']]));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.report).toMatch(/2 lines between the markers are removed by the apply\. 1 of them is kept nowhere/);
    expect(dry.report).toMatch(/\n {2}line 9: “[^”]*M6\.E3[^”]*” — its cells stay in the unit record of M6\.E3/);
    expect(dry.report).toMatch(/\n {2}line 10: “\| a reminder \| not an Epic row \| call the harbour master \|”\n/);
  });

  // A unit that is refused a record: its row goes into no record and is listed.
  it('a row whose ID is refused a record (a case twin): the dry run lists the row', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    put(base, '.planning/m7.e1-PLAN.md', '# the same name in another case\n');
    commitAll(base, 'a case twin');
    const plan = await planUnits(base);
    expect(plan.refused.map((u) => u.id)).toContain('M7.E1');
    expect(plan.milestone.removes.lines).toEqual([{ line: 8, text: ROWS['M7.E1'] }]);
    const dry = await dryRun(base);
    expect(dry.report).toMatch(/1 line between the markers is kept nowhere and is removed by the apply/);
    expect(dry.report).toContain(`\n  line 8: “${ROWS['M7.E1']}”`);
  });

  it('on a project that already has unit records the rows are generated and none is listed', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    await applyWith(base, await dryRun(base), { confirmUnitCloses: true });
    commitAll(base, 'unit records');
    put(base, '.planning/M7.E12-PLAN.md', '# a unit named after the records\n');
    commitAll(base, 'a new unit');
    const again = await dryRun(base);
    expect(again.refused).toBeUndefined();
    expect(again.report).not.toMatch(/removed by the apply/);
  }, 60_000);
});

// The dry run shows what is replaced in the current milestone's file. Another
// milestone's file that carries the markers has its table written from the
// records as well: the dry run says so, and nothing typed there is replaced unseen.
describe('another milestone\'s file carries the markers too', () => {
  const M6 = '.planning/MILESTONE-6.md';
  const OLD_ROW = '| **E1 — Old format** | ✅ shipped 2026-01-01 | Notes with a \\| pipe, and `code` |';
  const marked6 = (extra = []) => doc(['# Milestone 6', '', BEGIN, '| Epic | Status | Notes |', '|---|---|---|', OLD_ROW, ...extra, END, '', 'After.', '']);

  it('the dry run names the file; the apply writes its table from the records, the old row printed as it was', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    put(base, M6, marked6());
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.report).toMatch(/Note: \.planning\/MILESTONE-6\.md carries the Epic-table markers too, and it is not the current milestone's file/);
    const out = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(out.applied).toBe(true);
    const text = read(base, M6);
    expect(text).toContain(`${BEGIN}\n| Epic | Status | Summary |\n|---|---|---|\n${OLD_ROW}\n${END}`);
    expect(text.endsWith('\nAfter.\n')).toBe(true);
    expect(checkRecords(base)).toEqual([]);
  }, 60_000);

  it('a row typed there for nothing the records hold: the apply is refused, and no file changes', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    put(base, M6, marked6(['| a reminder | not an Epic row | call the harbour master |']));
    commitAll(base);
    const dry = await dryRun(base);
    const before = bytesOf(base);
    const out = await applyWith(base, dry, { confirmUnitCloses: true }).catch((e) => e);
    expect(out.applied).not.toBe(true);
    expect(JSON.stringify([out.reason, out.message])).toMatch(/MILESTONE-6\.md.*typed by hand/);
    expect(bytesOf(base)).toEqual(before);
  }, 60_000);
});

describe('(c) a table with another header: the dry run says it becomes three columns, and the cells are kept', () => {
  const FIVE = ['| Epic | State | Owner | Due | Notes |', '|---|---|---|---|---|'];
  const rows = [
    '| `M7.E1` | **shipped** 2026-09-01 | Ada | Q3 | the lantern index |',
    '| `M7.E9` | in flight | Grace | Q4 | the current one |',
  ];

  it('the dry run names the old header and says where the cells go; the three-column header says nothing', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, marked(rows, FIVE));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.report).toMatch(/The table is rewritten as three columns \(\| Epic \| Status \| Summary \|\): its header now is “\| Epic \| State \| Owner \| Due \| Notes \|” \(line 6\)/);
    expect(dry.report).toMatch(/kept in its unit record \(legacy_row\)/);
    expect(dry.report).not.toMatch(/removed by the apply/);
    expect((await planUnits(base)).milestone.header).toEqual({ line: 6, text: '| Epic | State | Owner | Due | Notes |' });
    const three = await unitsStore({ repo: true, markers: true });
    expect((await dryRun(three)).report).not.toMatch(/rewritten as three columns/);
  });

  it('the header is inside the hash', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, marked(rows, FIVE));
    commitAll(base);
    const dry = await dryRun(base);
    put(base, MILESTONE, marked(rows, ['| Epic | State | Owner | Due | Remarks |', '|---|---|---|---|---|']));
    commitAll(base);
    expect((await dryRun(base)).inputHash).not.toBe(dry.inputHash);
  });

  it('after the apply the table has three columns and every old cell is in a record, the extra ones in the third', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, marked(rows, FIVE));
    commitAll(base);
    const r = await applyWith(base, await dryRun(base), { confirmUnitCloses: true });
    expect(r.applied).toBe(true);
    const text = read(base, MILESTONE);
    expect(text).toContain('| Epic | Status | Summary |\n|---|---|---|\n');
    expect(text).not.toContain('Owner');
    expect(getUnit(base, 'M7.E1').record.legacy_row).toEqual(['`M7.E1`', '**shipped** 2026-09-01', 'Ada | Q3 | the lantern index']);
    expect(getUnit(base, 'M7.E9').record.legacy_row).toEqual(['`M7.E9`', 'in flight', 'Grace | Q4 | the current one']);
  }, 60_000);
});
