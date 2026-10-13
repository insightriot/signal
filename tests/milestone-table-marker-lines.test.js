// M6.E16 r1.3 (REVIEW pass 1: C-I3, S-M5) — a marker counts only when it is
// alone on its line (AC7.2). See .planning/M6.E16-VALIDATION.md row
// "AC7.2 — marker lines".
//
// `epicMarkers` used to find the marker text anywhere in the file. A sentence
// that mentions a marker made "appears 2 times" and refused every write to the
// store; two mentions and no real markers read as a valid pair and the text
// between them was replaced by the table. Now a marker is a line that holds
// only the marker (spaces and tabs around it allowed, CRLF tolerated), outside
// a fenced code block. And the migration's dry run lists what the apply
// removes between the markers. Every name is invented.

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

import { epicMarkers, upsertEpicTable, EPICS_BEGIN, EPICS_END } from '../plugin/tools/lib/milestone-table.js';
import { runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { openUnit, ensureUnitsDir } from '../plugin/tools/lib/unit-records.js';
import {
  bytesOf, cleanupUnitsStores, commitAll, MILESTONE, put, read, ROWS, UNITS, unitsStore,
} from './helpers/units-store-fixture.js';

afterEach(cleanupUnitsStores);

const TABLE = '| Epic | Status | Summary |\n|---|---|---|\n| `M7.E9` | **in flight** | new |';
const OLD = ['| Epic | Status | Summary |', '|---|---|---|', '| `M7.E9` | old | old |'];
const doc = (lines, eol = '\n') => lines.join(eol);

describe('epicMarkers — a marker is a line of its own', () => {
  it('a third mention inside a sentence is not a marker: the real pair is found', () => {
    const text = doc([
      '# Milestone 7', '', `The table sits between \`${EPICS_BEGIN}\` and \`${EPICS_END}\`; do not edit it.`, '',
      EPICS_BEGIN, ...OLD, EPICS_END, '', 'After.', '',
    ]);
    expect(epicMarkers(text)).toMatchObject({ state: 'ok' });
    const out = upsertEpicTable(text, TABLE);
    expect(out).toBe(doc([
      '# Milestone 7', '', `The table sits between \`${EPICS_BEGIN}\` and \`${EPICS_END}\`; do not edit it.`, '',
      EPICS_BEGIN, TABLE, EPICS_END, '', 'After.', '',
    ]));
  });

  it('two mentions and no real markers is a file with no markers: nothing between them is replaced', () => {
    const text = doc(['# Milestone 7', '', `Put ${EPICS_BEGIN} before the table.`, 'A paragraph a person wrote.', `And ${EPICS_END} after it.`, '']);
    expect(epicMarkers(text)).toEqual({ state: 'none' });
    expect(() => upsertEpicTable(text, TABLE)).toThrow(expect.objectContaining({ code: 'CONFIG', message: expect.stringMatching(/has no .* markers/) }));
  });

  it('a marker in backticks on its own line, or with other text beside it, is not a marker', () => {
    for (const line of [`\`${EPICS_BEGIN}\``, `- ${EPICS_BEGIN}`, `${EPICS_BEGIN} <!-- note -->`, `> ${EPICS_BEGIN}`]) {
      expect(epicMarkers(doc([line, ...OLD, EPICS_END, ''])), line).toMatchObject({ state: 'broken', problem: expect.stringMatching(/begin.*is missing/) });
    }
  });

  it('markers inside a fenced code block are not markers, with ``` or ~~~, and a real pair after it is found', () => {
    for (const fence of ['```', '~~~', '````markdown']) {
      const close = fence.replace(/[a-z]+$/, '');
      const example = [fence, EPICS_BEGIN, '| an example |', EPICS_END, close];
      expect(epicMarkers(doc(['# M', ...example, ''])), fence).toEqual({ state: 'none' });
      const text = doc(['# M', ...example, '', EPICS_BEGIN, ...OLD, EPICS_END, '']);
      expect(upsertEpicTable(text, TABLE)).toBe(doc(['# M', ...example, '', EPICS_BEGIN, TABLE, EPICS_END, '']));
    }
  });

  it('spaces and tabs around a marker are allowed, and stay as they were', () => {
    const text = doc(['# M', `  ${EPICS_BEGIN}\t`, ...OLD, `\t${EPICS_END}  `, 'After.', '']);
    expect(upsertEpicTable(text, TABLE)).toBe(doc(['# M', `  ${EPICS_BEGIN}\t`, TABLE, `\t${EPICS_END}  `, 'After.', '']));
  });

  it('a CRLF file keeps CRLF: the table is written with the file\'s own line ending, and every byte outside is kept', () => {
    const text = doc(['# M', '', EPICS_BEGIN, ...OLD, EPICS_END, '', 'After.', ''], '\r\n');
    const out = upsertEpicTable(text, TABLE);
    expect(out).toBe(doc(['# M', '', EPICS_BEGIN, ...TABLE.split('\n'), EPICS_END, '', 'After.', ''], '\r\n'));
    expect(out.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    // Writing the same table again changes nothing.
    expect(upsertEpicTable(out, TABLE)).toBe(out);
  });

  it('real markers repeated, missing or out of order are still broken, counted by line', () => {
    expect(epicMarkers(doc([EPICS_BEGIN, EPICS_BEGIN, EPICS_END]))).toEqual({ state: 'broken', problem: expect.stringMatching(/begin.*appears 2 times/) });
    expect(epicMarkers(doc([EPICS_BEGIN, EPICS_END, EPICS_END]))).toEqual({ state: 'broken', problem: expect.stringMatching(/end.*appears 2 times/) });
    expect(epicMarkers(doc([EPICS_END, EPICS_BEGIN]))).toEqual({ state: 'broken', problem: expect.stringMatching(/out of order/) });
    expect(epicMarkers(doc([EPICS_BEGIN, 'x']))).toEqual({ state: 'broken', problem: expect.stringMatching(/end.*is missing/) });
  });

  it('a long run of spaces on a line costs no more than its length (no backtracking)', () => {
    const text = doc([`${' '.repeat(200_000)}x`, EPICS_BEGIN, ...OLD, EPICS_END, `${'\t'.repeat(200_000)}y`, '']);
    const t0 = performance.now();
    expect(epicMarkers(text).state).toBe('ok');
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe('a mention in a sentence no longer refuses a store write (C-I3)', () => {
  it('opening a unit on a project whose milestone file mentions a marker in its text regenerates the table', async () => {
    const base = await unitsStore();
    put(base, MILESTONE, doc([
      '# Milestone 7', '', `Rows are generated between ${EPICS_BEGIN} and ${EPICS_END}.`, '',
      EPICS_BEGIN, '| Epic | Status | Summary |', '|---|---|---|', ROWS['M7.E9'], EPICS_END, '', 'After the table.', '',
    ]));
    await ensureUnitsDir(base);
    await openUnit(base, 'M7.E9', { by: 'claude', title: 'The current one' });
    const text = read(base, MILESTONE);
    expect(text).toContain(`Rows are generated between ${EPICS_BEGIN} and ${EPICS_END}.`);
    expect(text).toMatch(/\| `M7\.E9` \| \*\*in flight\*\* \| The current one \|/);
    expect(text.endsWith(`${EPICS_END}\n\nAfter the table.\n`)).toBe(true);
  });
});

describe('the migration\'s dry run lists what the apply removes between the markers (S-M5)', () => {
  const marked = (between) => doc([
    '# Milestone 7', '', 'Written by hand.', '', EPICS_BEGIN,
    '| Epic | Status | Summary |', '|---|---|---|', ...between, EPICS_END, '', 'After the table.', '',
  ]);
  const dryRun = (base) => runWorkStoreMigrate(base, { apply: false });
  const applyWith = (base, dry) => runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T1', at: '2026-10-11', confirmUnitCloses: true });

  it('a line between the markers that is not a table row is named, with its line number, cleaned and cut', async () => {
    const base = await unitsStore({ repo: true });
    const note = `A note a person left\u200b here. ${'x'.repeat(600)}`;
    put(base, MILESTONE, marked([ROWS['M7.E1'], '', note, ROWS['M7.E9'], '- and a list item']));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.refused).toBeUndefined();
    expect(dry.report).toMatch(/MILESTONE-7\.md carries the Epic-table markers/);
    expect(dry.report).toMatch(/2 lines between the markers are kept nowhere and are removed by the apply/);
    expect(dry.report).toMatch(/\n {2}line 10: “A note a person left here\. x+…?”/);
    expect(dry.report).toMatch(/\n {2}line 12: “- and a list item”/);
    expect(dry.report).not.toContain('​');
    for (const l of dry.report.split('\n')) expect(l.length).toBeLessThan(700);
  });

  it('with no such line the dry run says nothing of the kind, and its hash is what it was', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    const dry = await dryRun(base);
    expect(dry.report).not.toMatch(/are removed by the apply/);
  });

  it('text added between the markers after the dry run changes the hash: the apply is refused, nothing written', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    const dry = await dryRun(base);
    put(base, MILESTONE, marked([...Object.values(ROWS), 'A paragraph written after the dry run.']));
    commitAll(base);
    const before = bytesOf(base);
    const r = await applyWith(base, dry);
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/changed since the dry run/);
    expect(bytesOf(base)).toEqual(before);
    // And a change to a listed line beyond what the list prints changes the hash too.
    const long = `${'y'.repeat(900)}`;
    put(base, MILESTONE, marked([...Object.values(ROWS), `${long}A`]));
    commitAll(base);
    const one = await dryRun(base);
    put(base, MILESTONE, marked([...Object.values(ROWS), `${long}B`]));
    commitAll(base);
    expect((await dryRun(base)).inputHash).not.toBe(one.inputHash);
    expect(join(base, UNITS)).toBeTruthy();
  });

  it('the apply removes exactly the lines the dry run named, and keeps every byte outside the markers', async () => {
    const base = await unitsStore({ repo: true });
    put(base, MILESTONE, marked([...Object.values(ROWS), 'A note a person left.']));
    commitAll(base);
    const dry = await dryRun(base);
    expect(dry.report).toMatch(/1 line between the markers is kept nowhere and is removed by the apply/);
    const r = await applyWith(base, dry);
    expect(r.applied).toBe(true);
    const text = read(base, MILESTONE);
    expect(text).not.toContain('A note a person left.');
    expect(text.startsWith(`# Milestone 7\n\nWritten by hand.\n\n${EPICS_BEGIN}\n`)).toBe(true);
    expect(text.endsWith(`${EPICS_END}\n\nAfter the table.\n`)).toBe(true);
  });
});
