// M6.E16 r6 (SIG-310) — the units run names every file it writes.
//
// A marked milestone file is one that carries the Epic-table marker lines; a
// regeneration writes the table between them from the unit records — in the
// current milestone's file, and in any OTHER milestone's file whose table no
// longer matches. Before this, `/sig:docs-migrate --work-store`:
//   - adding a record on a project that has unit records, rewrote another
//     milestone's table that its dry run never named, left that file
//     unstaged, and reported "no other view was changed";
//   - turning unit records on, named such a file in a note without saying
//     what is replaced in it, left it unstaged, and reported the same;
//   - on a project not yet on the store, printed that note in the dry run and
//     then failed its own check in the apply.
// Now the dry run lists each such file and what changes between its markers
// (`writes`: every file an apply writes, for each answer to the proposed
// closes), the apply stages it and reports it, and the "no other view" words
// are printed only when they are true.
//
// The project is `tests/helpers/units-store-fixture.js`. Temp folders, real
// git; every name is invented.

import { describe, it, expect, afterEach } from 'vitest';

import { runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { getUnit } from '../plugin/tools/lib/unit-records.js';
import { checkRecords } from '../plugin/tools/lib/work-records.js';
import {
  bytesOf, cleanupUnitsStores, commitAll, EPICS, git, MILESTONE, milestone7, put, read, ROWS, UNITS, unitsStore,
} from './helpers/units-store-fixture.js';

afterEach(cleanupUnitsStores);

const AT = '2026-10-13';
const M6 = '.planning/MILESTONE-6.md';
const BEGIN = '<!-- signal:epics:begin -->';
const END = '<!-- signal:epics:end -->';
const OLD_HEADER = '| Epic | Status | Notes |';
const OLD_ROW = '| **E1 — Old format** | ✅ shipped 2026-01-01 | Notes with a \\| pipe, and `code` |';
const marked6 = ({ header = OLD_HEADER, rows = [OLD_ROW], extra = [] } = {}) => [
  '# Milestone 6', '', 'Typed by hand, above.', '', BEGIN, header, '|---|---|---|', ...rows, ...extra, END, '', 'After.', '',
].join('\n');

const dryRun = (base, opts = {}) => runWorkStoreMigrate(base, { apply: false, ...opts });
const applyWith = (base, dry, opts = {}) => runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T2', at: AT, ...opts });
const lines = (text) => text.split('\n').filter(Boolean).sort();
const staged = (base) => lines(git(base, ['diff', '--cached', '--name-only']));
const notStaged = (base) => lines(git(base, ['status', '--porcelain'])).filter((l) => l[1] !== ' ');
const changed = (before, after) => [...new Set([...before.keys(), ...after.keys()])].filter((k) => before.get(k) !== after.get(k)).sort();
const sorted = (list) => [...list].sort();

// The fixture with MILESTONE-7.md (the current milestone's) and MILESTONE-6.md
// both marked, moved onto unit records, and committed.
async function withUnits() {
  const base = await unitsStore({ repo: true, markers: true });
  put(base, M6, marked6());
  commitAll(base, 'milestone 6 is marked');
  const first = await runWorkStoreMigrate(base, { apply: true, expectedHash: (await dryRun(base)).inputHash, stamp: 'T1', at: AT, confirmUnitCloses: true });
  expect(first.applied).toBe(true);
  commitAll(base, 'unit records');
  return base;
}

// An Epic of milestone 6 named after the migration: MILESTONE-6.md gains its row.
function nameAnEpicOfMilestone6(base) {
  put(base, '.planning/M6.E2-PLAN.md', '# M6.E2 plan\n');
  commitAll(base, 'one more Epic of milestone 6');
}

describe('adding a record: another milestone\'s marked file is named, written, staged and reported', () => {
  it('the dry run names the file and the row it gains, and lists it among the files the apply writes', async () => {
    const base = await withUnits();
    nameAnEpicOfMilestone6(base);
    const before = bytesOf(base);
    const dry = await dryRun(base);
    expect(bytesOf(base)).toEqual(before);
    const want = sorted([`${UNITS}/M6.E2.json`, EPICS, M6]);
    expect(dry.writes).toEqual({ confirmed: want, unconfirmed: want });
    expect(dry.report).toContain(`${M6} carries the Epic-table markers and is another milestone's file: --apply writes its Epic table from the unit records too`);
    expect(dry.report).toContain('  added: “| `M6.E2` | **in flight** | |”');
    expect(dry.report).toMatch(/--apply adds 1 unit record under \.planning\/work\/units\/, regenerates \.planning\/work\/EPICS\.md and the Epic table in \.planning\/MILESTONE-6\.md \(another milestone's file\), and leaves them staged/);
    expect(dry.report).toContain('No existing record, no item and no other view is changed.');
  });

  it('the apply writes exactly the files the dry run listed, stages every one, and says which', async () => {
    const base = await withUnits();
    nameAnEpicOfMilestone6(base);
    const dry = await dryRun(base);
    const before = bytesOf(base);
    const r = await applyWith(base, dry);
    expect(r.applied).toBe(true);
    const diff = changed(before, bytesOf(base));
    expect(diff).toEqual(dry.writes.unconfirmed);
    expect(diff).toContain(M6);
    expect(sorted(r.written)).toEqual(diff);
    expect(staged(base)).toEqual(diff);
    expect(notStaged(base)).toEqual([]);
    expect(read(base, M6)).toContain(`${OLD_ROW}\n| \`M6.E2\` | **in flight** |  |\n${END}`);
    expect(r.report).toContain(`regenerated ${EPICS} and the Epic table in ${M6} (another milestone's file). No existing record, no item and no other view was changed.`);
    expect(r.revertLine).toBe('git reset --hard pre-work-store-units-T2   # discards the staged unit records');
    expect(checkRecords(base)).toEqual([]);
  });

  it('with no other milestone\'s table to write, the files are the records and the Epic index, and the report says nothing else changed', async () => {
    const base = await withUnits();
    put(base, '.planning/phase-12-PLAN.md', '# phase-12 plan\n');
    commitAll(base, 'a unit that is no Epic');
    const dry = await dryRun(base);
    expect(dry.report).not.toContain('another milestone\'s file');
    // r6.1: MILESTONE-6.md is marked and this run does not write it, so the
    // report does not describe it — it used to print a note saying a typed
    // row there refuses the apply, of an apply that leaves the file alone.
    expect(dry.report).not.toContain(M6);
    const before = bytesOf(base);
    const r = await applyWith(base, dry);
    const diff = changed(before, bytesOf(base));
    expect(diff).toEqual(sorted([`${UNITS}/phase-12.json`, EPICS]));
    expect(dry.writes.unconfirmed).toEqual(diff);
    expect(r.report).toContain(`regenerated ${EPICS}. No existing record, no item and no other view was changed.`);
  });

  it('a row typed between the other file\'s markers: the run is refused in the dry run, naming the file', async () => {
    const base = await withUnits();
    put(base, M6, read(base, M6).replace(END, `| a reminder | not an Epic row | call the harbour master |\n${END}`));
    nameAnEpicOfMilestone6(base);
    // The store checks clean only when every marked table matches the records, so this row stops the run at once.
    const dry = await dryRun(base);
    expect(dry.refused).toBe(true);
    expect(dry.reason).toMatch(/MILESTONE-6\.md/);
  });
});

describe('turning unit records on: another milestone\'s marked file', () => {
  const firstTime = async (six = marked6()) => {
    const base = await unitsStore({ repo: true, markers: true });
    put(base, M6, six);
    commitAll(base, 'milestone 6 is marked');
    return base;
  };

  it('the dry run says what is replaced between its markers, for each answer to the proposed closes', async () => {
    const dry = await dryRun(await firstTime());
    expect(dry.report).toContain(`${M6} carries the Epic-table markers and is another milestone's file: --apply writes its Epic table from the unit records too`);
    // Confirmed, M6.E1 is closed as legacy and its old row is printed as it was: only the header changes.
    // Not confirmed, it is open, and its row is one the table writes itself.
    const under = dry.report.slice(dry.report.indexOf(`${M6} carries the Epic-table markers and is another`)).split('\n').slice(1, 10);
    expect(under).toEqual([
      '  If the proposed closes are confirmed:',
      `  line 6 is replaced: “${OLD_HEADER}”`,
      '  added: “| Epic | Status | Summary |”',
      '  If the proposed closes are not confirmed:',
      `  line 6 is replaced: “${OLD_HEADER}”`,
      `  line 8 is replaced: “${OLD_ROW}”`,
      '  added: “| Epic | Status | Summary |”',
      '  added: “| `M6.E1` | **in flight** | Notes with a \\| pipe, and `code` |”',
      '',
    ]);
    expect(dry.writes.confirmed).toContain(M6);
    expect(dry.writes.unconfirmed).toContain(M6);
    expect(dry.report).toMatch(/regenerates \.planning\/work\/EPICS\.md and the Epic table in \.planning\/MILESTONE-7\.md and the Epic table in \.planning\/MILESTONE-6\.md \(another milestone's file\), and leaves them staged/);
    expect(dry.report).toContain('No item is changed, and no other view.');
    expect(dry.report).not.toContain('that is out of date');
    // r6.1: the file is described once — by this block, which also says how to leave it alone — and not by a note as well.
    expect(dry.report.split(`${M6} carries the Epic-table markers`)).toHaveLength(2);
    expect(dry.report).not.toMatch(/Note: [^\n]*carries the Epic-table markers too/);
    expect(dry.report).toContain('Nothing outside its two marker lines changes. To leave the file exactly as it is, take the two marker lines out of it first. Between them:');
  });

  for (const confirmUnitCloses of [true, false]) {
    it(`the apply, closes ${confirmUnitCloses ? 'confirmed' : 'not confirmed'}: the files written are the ones the dry run listed for that answer, all staged, all reported`, async () => {
      const base = await firstTime();
      const dry = await dryRun(base);
      const before = bytesOf(base);
      const r = await applyWith(base, dry, { confirmUnitCloses });
      expect(r.applied).toBe(true);
      const diff = changed(before, bytesOf(base));
      expect(diff).toEqual(dry.writes[confirmUnitCloses ? 'confirmed' : 'unconfirmed']);
      expect(diff).toContain(M6);
      expect(diff).toContain(MILESTONE);
      expect(staged(base)).toEqual(diff);
      expect(notStaged(base)).toEqual([]);
      expect(r.written.filter((rel) => !rel.startsWith(UNITS))).toEqual([EPICS, MILESTONE, M6]);
      expect(r.report).toContain(`regenerated ${EPICS} and the Epic table in ${MILESTONE} and the Epic table in ${M6} (another milestone's file). No item and no other view was changed.`);
      expect(getUnit(base, 'M6.E1').status).toBe(confirmUnitCloses ? 'closed' : 'open');
      expect(checkRecords(base)).toEqual([]);
    }, 60_000);
  }

  it('a table that is already what a confirmed close prints is written only when the closes are not confirmed — and the dry run says so', async () => {
    const row = '| `M6.E1` | ✅ shipped 2026-01-01 | Old notes |';
    const six = marked6({ header: '| Epic | Status | Summary |', rows: [row] });
    const base = await firstTime(six);
    const dry = await dryRun(base);
    expect(dry.writes.confirmed).not.toContain(M6);
    expect(dry.writes.unconfirmed).toContain(M6);
    expect(dry.report).toContain(`${M6} carries the Epic-table markers and is another milestone's file: --apply writes its Epic table from the unit records too`);
    expect(dry.report).toContain('  If the proposed closes are confirmed: nothing in it changes.');
    expect(dry.report).toMatch(/and the Epic table in \.planning\/MILESTONE-6\.md \(another milestone's file; only on one of the two answers, as said above\)/);
    const before = bytesOf(base);
    const r = await applyWith(base, dry, { confirmUnitCloses: true });
    const diff = changed(before, bytesOf(base));
    expect(diff).toEqual(dry.writes.confirmed);
    expect(read(base, M6)).toBe(six);
    expect(r.written).not.toContain(M6);
    expect(r.report).not.toContain(M6);
    expect(r.report).toContain('No item and no other view was changed.');
  }, 60_000);

  it('what the dry run showed of the other file is inside the hash: its header typed over afterwards refuses the apply, and nothing is written', async () => {
    const base = await firstTime();
    const dry = await dryRun(base);
    put(base, M6, marked6({ header: '| Epic | Status | Remarks |' }));
    commitAll(base, 'a header typed over');
    const before = bytesOf(base);
    const r = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(r.applied).not.toBe(true);
    expect(r.reason).toMatch(/changed since the dry run/);
    expect(bytesOf(base)).toEqual(before);
  });

  // r6.1: a marked file of a milestone none of the units belongs to is not
  // written by the apply. The dry run printed a note for it all the same,
  // saying a row typed there refuses the apply — of an apply that succeeds.
  it('a marked file of a milestone with no unit, a row typed in it: the dry run says nothing of it, the apply succeeds and leaves it as it is', async () => {
    const M5 = '.planning/MILESTONE-2.md'; // no unit of the fixture is an Epic of milestone 2
    const five = ['# Milestone 2', '', BEGIN, '| Epic | Status | Summary |', '|---|---|---|', '| a reminder | not an Epic row | call the harbour master |', END, ''].join('\n');
    const base = await firstTime();
    put(base, M5, five);
    commitAll(base, 'milestone 2 is marked, and holds no Epic');
    const dry = await dryRun(base);
    expect(dry.refused).toBeUndefined();
    expect(dry.report).not.toContain(M5);
    expect(dry.writes.confirmed).not.toContain(M5);
    const out = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(out.applied).toBe(true);
    expect(read(base, M5)).toBe(five);
  }, 60_000);

  it('a row typed between its markers for nothing the records hold: the dry run says the apply will be refused, naming the line', async () => {
    const base = await firstTime(marked6({ extra: ['| a reminder | not an Epic row | call the harbour master |'] }));
    const dry = await dryRun(base);
    expect(dry.report).toContain(`  As the file stands the apply is refused and nothing is written: line 9 (“| a reminder | not an Epic row | call the harbour master |”)`);
    expect(dry.writes.confirmed).not.toContain(M6);
    // r6.1: and the report does not then end by saying what the apply creates and stages.
    expect(dry.writes).toEqual({ confirmed: [], unconfirmed: [] });
    expect(dry.report).not.toMatch(/--apply (creates|adds) /);
    expect(dry.report).not.toMatch(/leaves them staged/);
    expect(dry.report).toContain(`--apply is refused as the files stand, and writes nothing: ${M6} holds lines typed by hand between its `
      + 'Epic-table markers, named above. Move them outside the two marker lines — or take the two marker lines out of the file — then run the dry run again.');
    // Nor does it say, of the file that refuses, that the apply "writes" its table.
    expect(dry.report).toContain(`${M6} carries the Epic-table markers and is another milestone's file: --apply would write its Epic table from the unit records too.`);
    expect(dry.report).not.toContain(`${M6} carries the Epic-table markers and is another milestone's file: --apply writes`);
    const before = bytesOf(base);
    const out = await applyWith(base, dry, { confirmUnitCloses: true }).catch((e) => e);
    expect(out.applied).not.toBe(true);
    expect(bytesOf(base)).toEqual(before);
  }, 60_000);
});

describe('a project not yet on the store: another milestone\'s marked file refuses the run in the dry run', () => {
  it('the dry run is refused, naming the file and what to do — it is not left for the apply to fail on', async () => {
    const base = await unitsStore({ repo: true, store: false });
    put(base, M6, marked6());
    commitAll(base, 'milestone 6 is marked');
    const before = bytesOf(base);
    const dry = await dryRun(base, { key: 'LEAF' });
    expect(dry.refused).toBe(true);
    expect(dry.reason).toMatch(/^\.planning\/MILESTONE-6\.md already carries the Epic-table markers/);
    expect(dry.reason).toContain('Take the two marker lines out');
    expect(dry.reason).not.toContain('MILESTONE-7.md');
    expect(bytesOf(base)).toEqual(before);
    // The control: without the markers there the same project plans.
    put(base, M6, marked6().replace(`${BEGIN}\n`, '').replace(`${END}\n`, ''));
    commitAll(base, 'markers out');
    expect((await dryRun(base, { key: 'LEAF' })).refused).toBeUndefined();
  });
});

// M6.E16 r6.2 — three things the dry run's `writes` got right with nothing
// holding them: each would have gone wrong silently.
describe('the dry run\'s `writes` are what the apply writes — three cases nothing held', () => {
  // Turning unit records on REPLACES the current milestone's table, lines a
  // person typed there included (the dry run lists them as removed). They do
  // not refuse the apply, so the file is among the writes.
  it('the current milestone\'s marked table holding a line the apply removes: listed, and written', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    put(base, MILESTONE, milestone7([...Object.values(ROWS), '| a reminder | not an Epic row | call the harbour master |'], { markers: true }));
    commitAll(base, 'a row typed in the current milestone\'s table');
    const dry = await dryRun(base);
    expect(dry.report).toMatch(/1 line between the markers is kept nowhere and is removed by the apply/);
    expect(dry.writes.confirmed).toContain(MILESTONE);
    expect(dry.writes.unconfirmed).toContain(MILESTONE);
    const before = bytesOf(base);
    const r = await applyWith(base, dry, { confirmUnitCloses: true });
    expect(r.applied).toBe(true);
    expect(changed(before, bytesOf(base))).toEqual(dry.writes.confirmed);
    expect(read(base, MILESTONE)).not.toContain('a reminder');
  }, 60_000);

  it('nothing to add: `writes` is empty for both answers, and the apply writes nothing', async () => {
    const base = await withUnits();
    const dry = await dryRun(base);
    expect(dry.nothingToAdd).toBe(true);
    expect(dry.writes).toEqual({ confirmed: [], unconfirmed: [] });
    expect(dry.report).toContain('--apply would write nothing: there is no record to add.');
    const before = bytesOf(base);
    await applyWith(base, dry).catch((e) => e);
    expect(changed(before, bytesOf(base))).toEqual([]);
  }, 60_000);

  // A milestone numbered 4.5 has a file `MILESTONE-4.5.md` like any other.
  it('a decimal milestone\'s marked file: listed, written, staged and reported', async () => {
    const M45 = '.planning/MILESTONE-4.5.md';
    const base = await withUnits();
    put(base, M45, ['# Milestone 4.5', '', BEGIN, '| Epic | Status | Summary |', '|---|---|---|', END, '', 'After.', ''].join('\n'));
    put(base, '.planning/M4.5.E2-PLAN.md', '# M4.5.E2 plan\n');
    commitAll(base, 'a marked file for milestone 4.5, and an Epic of it');
    const dry = await dryRun(base);
    const want = sorted([`${UNITS}/M4.5.E2.json`, EPICS, M45]);
    expect(dry.writes).toEqual({ confirmed: want, unconfirmed: want });
    expect(dry.report).toContain(`${M45} carries the Epic-table markers and is another milestone's file: --apply writes its Epic table from the unit records too`);
    const before = bytesOf(base);
    const r = await applyWith(base, dry);
    expect(r.applied).toBe(true);
    expect(changed(before, bytesOf(base))).toEqual(want);
    expect(staged(base)).toEqual(want);
    expect(notStaged(base)).toEqual([]);
    expect(read(base, M45)).toContain('| `M4.5.E2` | **in flight** |');
    expect(r.report).toContain(`regenerated ${EPICS} and the Epic table in ${M45} (another milestone's file).`);
  }, 60_000);

  // S1: the paragraph about "another milestone's file" is about another
  // milestone's file. The current one's table changes too and gets none.
  it('the current milestone\'s file is never introduced as another milestone\'s', async () => {
    const base = await withUnits();
    put(base, '.planning/M7.E12-PLAN.md', '# M7.E12 plan\n');
    commitAll(base, 'one more Epic of the current milestone');
    const dry = await dryRun(base);
    expect(dry.writes.unconfirmed).toContain(MILESTONE);
    expect(dry.report).not.toContain('is another milestone\'s file');
    expect(dry.report).not.toContain('(another milestone\'s file');
    expect(dry.report).toMatch(/regenerates \.planning\/work\/EPICS\.md and the Epic table in \.planning\/MILESTONE-7\.md, and leaves them staged/);
  }, 60_000);

  // Nit: when both answers to the proposed closes change the same thing, the
  // block lists it once, with no "If the proposed closes are …" lines.
  it('another milestone\'s file that changes the same way on either answer is listed once, not per answer', async () => {
    const base = await withUnits();
    nameAnEpicOfMilestone6(base);
    const dry = await dryRun(base);
    const block = dry.report.slice(dry.report.indexOf(`${M6} carries the Epic-table markers`));
    expect(block.split('\n').slice(1, 3)).toEqual(['  added: “| `M6.E2` | **in flight** | |”', '']);
    expect(dry.report).not.toContain('If the proposed closes are');
  }, 60_000);
});
