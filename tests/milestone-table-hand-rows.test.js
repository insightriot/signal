// A row a person typed between the Epic-table markers is never deleted
// without a word.
//
// The table between `<!-- signal:epics:begin -->` and `<!-- signal:epics:end -->`
// is generated from the unit records, and a regeneration replaces everything
// there. Before this, a row typed by hand for an Epic with no record — or for
// nothing the records hold — was gone after the next store write of any kind.
// Now such a row refuses the regeneration (and the write that would cause
// it), naming the file, the row and the two ways out; `checkRecords` reports
// it; and a row for a unit that HAS a record is still regenerated, whatever
// its cells say.
//
// Stores are temp folders; unit names are invented.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

// A seam for one test: something to run just before the next view is written.
const seam = vi.hoisted(() => ({ beforeWrite: null }));
vi.mock('../plugin/tools/lib/atomic-write.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    atomicWrite: async (...args) => {
      const run = seam.beforeWrite;
      seam.beforeWrite = null;
      if (run) run();
      return actual.atomicWrite(...args);
    },
  };
});

import { renderEpicTable, rowsNotReprinted } from '../plugin/tools/lib/milestone-table.js';
import { UNIT_KIND } from '../plugin/tools/lib/unit-record.js';
import * as units from '../plugin/tools/lib/unit-records.js';
import * as records from '../plugin/tools/lib/work-records.js';
import { regenerateToMemory, regenerateViews } from '../plugin/tools/lib/work-views.js';

const AT = '2026-10-12T10:00:00.000Z';
const by = 'claude';
const UNITS = '.planning/work/units';
const FILE = '.planning/MILESTONE-7.md';
const BEGIN = '<!-- signal:epics:begin -->';
const END = '<!-- signal:epics:end -->';
const opened = { type: 'opened', at: AT, by };
const legacy = { type: 'closed', at: AT, by, reason: 'legacy' };
// A first cell as a refusal quotes it.
const cut = (cell) => cell.slice(0, 80);

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const read = (rel) => readFile(join(base, rel), 'utf-8');
const plant = (id, events, extra = {}) => put(`${UNITS}/${id}.json`, UNIT_KIND.serializeRecord({ id, ...extra, events }));
const milestone = (between) => `# Milestone 7\n\nIntro.\n\n${BEGIN}\n${between}${END}\n\nAfter.\n`;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-hand-rows-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put('.planning/STATE.md', '---\nschema_version: 1\ncurrent_epic: M7.E1\n---\n');
  await plant('M7.E1', [opened]);
  await plant('M7.E2', [legacy], { legacy_row: ['**E2 — the old way of naming it**', '**shipped** 2026-01-01', 'what it did'] });
  await put(FILE, milestone(''));
  await regenerateViews(base);
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

// The file with one more row typed into the generated table.
async function typeRow(row) {
  const text = await read(FILE);
  await put(FILE, text.replace(END, `${row}\n${END}`));
  return read(FILE);
}

describe('a row typed by hand between the markers', () => {
  it('for an Epic with no unit record: the regeneration refuses, names the file, the row and both remedies, and the file is unchanged', async () => {
    const before = await typeRow('| `M7.E5` | planned | the one I am thinking about |');
    const err = await regenerateViews(base).catch((e) => e);
    expect(err.code).toBe('CONFIG');
    expect(err.message).toContain(FILE);
    expect(err.message).toContain('M7.E5');
    expect(err.message).toMatch(/line \d+/);
    expect(err.message).toMatch(/unit record/);
    expect(err.message).toMatch(/outside the two marker lines/);
    expect(err.handRows).toEqual([{ line: expect.any(Number), id: 'M7.E5' }]);
    expect(await read(FILE)).toBe(before);
  });

  it('that names no Epic at all: refused the same way, quoting its first cell', async () => {
    const before = await typeRow('| a note to myself | | remember the demo |');
    const err = await regenerateViews(base).catch((e) => e);
    expect(err.code).toBe('CONFIG');
    expect(err.message).toContain('a note to myself');
    expect(err.message).toMatch(/not an Epic's ID and nothing else/);
    expect(await read(FILE)).toBe(before);
  });

  it('a line that is not a table row (a note): refused too, quoting the line, and the file is unchanged', async () => {
    const before = await typeRow('Note to self: E5 waits on the vendor.');
    const err = await regenerateViews(base).catch((e) => e);
    expect(err.code).toBe('CONFIG');
    expect(err.message).toContain(FILE);
    expect(err.message).toContain('Note to self');
    expect(err.message).toMatch(/outside the two marker lines/);
    expect(err.handRows).toEqual([{ line: expect.any(Number), id: null }]);
    expect(await read(FILE)).toBe(before);
    await expect(records.newItem(base, { title: 'x', body: 'y', source: 'test', by })).rejects.toMatchObject({ code: 'CONFIG' });
    expect(await read(FILE)).toBe(before);
  });

  it('refuses every store write before it lands: an item write, a unit write, an item edit', async () => {
    await typeRow('| `M7.E5` | planned | typed |');
    const before = await read(FILE);
    await expect(records.newItem(base, { title: 'a thing', type: 'BUG', by, at: AT })).rejects.toThrow(/M7\.E5/);
    await expect(units.holdUnit(base, 'M7.E1', { reason: 'keep', by, at: AT })).rejects.toThrow(/typed by hand/);
    expect(units.getUnit(base, 'M7.E1').held).toBe(false);
    expect(records.listRecords(base).records).toEqual([]);
    expect(await read(FILE)).toBe(before);
  });

  it('checkRecords reports it, by file and row', async () => {
    await typeRow('| `M7.E5` | planned | typed |');
    const findings = records.checkRecords(base);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.map((f) => f.message).join('\n')).toMatch(/MILESTONE-7\.md.*M7\.E5/s);
  });

  it('the first remedy works through the library: opening a record for the row\'s Epic is not refused by the row, and the row is then generated', async () => {
    await typeRow('| `M7.E5` | planned | typed |');
    await units.openUnit(base, 'M7.E5', { by, at: AT, summary: 'now a record' });
    const text = await read(FILE);
    expect(text).toContain('| `M7.E5` | **in flight** | now a record |');
    expect(text).not.toContain('typed');
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('the second remedy works: the row moved outside the markers stays, byte for byte', async () => {
    await typeRow('| `M7.E5` | planned | typed |');
    const text = await read(FILE);
    await put(FILE, text.replace('| `M7.E5` | planned | typed |\n', '').replace('After.', '| `M7.E5` | planned | typed |\n\nAfter.'));
    await units.holdUnit(base, 'M7.E1', { reason: 'keep', by, at: AT });
    expect(await read(FILE)).toContain('| `M7.E5` | planned | typed |\n\nAfter.');
  });

  // The header and the separator are lines of the table too, but no unit
  // record stands behind them: a typed row that only shares their first cell
  // (`Epic`, `---`) is not the table's own.
  for (const row of ['| Epic | a row a person typed | keep me |', '| --- | a note in a dashed row | x |']) {
    it(`whose first cell is the header's or the separator's (“${row}”): refused, and the file is unchanged`, async () => {
      const before = await typeRow(row);
      const table = renderEpicTable(units.listUnits(base).units, { milestone: '7' });
      const found = rowsNotReprinted(before, table, { milestone: '7', ids: ['M7.E1', 'M7.E2'] });
      expect(found.map((r) => [r.text, r.id, r.repeated])).toEqual([[row, null, undefined]]);
      const err = await regenerateViews(base).catch((e) => e);
      expect(err.code).toBe('CONFIG');
      expect(err.message).toMatch(/typed by hand/);
      expect(err.handRows).toEqual([{ line: expect.any(Number), id: null }]);
      expect(await read(FILE)).toBe(before);
    });
  }

  it('the controls: “Epic 5” and a bold “Epic” are refused too, and the header and separator themselves never are', async () => {
    for (const row of ['| Epic 5 | planned | typed |', '| **Epic** | bold | x |']) {
      const before = await typeRow(row);
      await expect(regenerateViews(base), row).rejects.toMatchObject({ code: 'CONFIG', handRows: [{ line: expect.any(Number), id: null }] });
      expect(await read(FILE)).toBe(before);
      await put(FILE, before.replace(`${row}\n`, ''));
    }
    await expect(regenerateViews(base)).resolves.toEqual({ written: expect.any(Array) });
  });

  // A first row that a separator follows is read as a header a person wrote,
  // which a regeneration replaces. Above the generated table's own header it
  // is not one: the table has its header, so this is a row a person typed.
  it('a row and a separator typed above the generated header: both refused, and the file is unchanged', async () => {
    const text = await read(FILE);
    const before = text.replace(`${BEGIN}\n`, `${BEGIN}\n| a note I typed | keep me |\n|---|---|\n`);
    await put(FILE, before);
    const table = renderEpicTable(units.listUnits(base).units, { milestone: '7' });
    const found = rowsNotReprinted(before, table, { milestone: '7', ids: ['M7.E1', 'M7.E2'] });
    expect(found.map((r) => [r.line, r.text, r.id])).toEqual([[6, '| a note I typed | keep me |', null], [7, '|---|---|', null]]);
    const err = await regenerateViews(base).catch((e) => e);
    expect(err.code).toBe('CONFIG');
    expect(err.message).toContain('a note I typed');
    expect(err.handRows).toEqual([{ line: 6, id: null }, { line: 7, id: null }]);
    expect(await read(FILE)).toBe(before);
    // A hand-kept table with a header of its own and no generated header under it is still the table's to replace.
    const own = milestone('| Epic | State | Owner |\n|:--|---|--:|\n| **E1** | going | me |\n| **E2** | shipped | me |\n');
    expect(rowsNotReprinted(own, table, { milestone: '7', ids: ['M7.E1', 'M7.E2'] })).toEqual([]);
  });

  // r6.1: the generated header is known by its cells, in both places that ask.
  // Written without its spaces (`|Epic|Status|Summary|`) it was not seen under
  // the typed row, so the refusal named the header and let the typed row go.
  it('the same with the generated header written without spaces: the typed row and its separator are the ones named, not the header', async () => {
    const text = await read(FILE);
    const before = text
      .replace(`${BEGIN}\n`, `${BEGIN}\n| Note | a | b |\n|---|---|---|\n`)
      .replace('| Epic | Status | Summary |', '|Epic|Status|Summary|');
    expect(before).toContain('| Note | a | b |\n|---|---|---|\n|Epic|Status|Summary|\n|---|---|---|\n');
    const table = renderEpicTable(units.listUnits(base).units, { milestone: '7' });
    const found = rowsNotReprinted(before, table, { milestone: '7', ids: ['M7.E1', 'M7.E2'] });
    expect(found.map((r) => [r.line, r.text, r.id])).toEqual([[6, '| Note | a | b |', null], [7, '|---|---|---|', null]]);
    // A second header typed further down is still a row a person typed.
    const twice = before.replace(END, `|Epic|Status|Summary|\n${END}`);
    expect(rowsNotReprinted(twice, table, { milestone: '7', ids: ['M7.E1', 'M7.E2'] }).map((r) => r.text))
      .toEqual(['| Note | a | b |', '|---|---|---|', '|Epic|Status|Summary|']);
  });

  it('a heading typed between the markers is a line that is not a table row: refused, and the file is unchanged', async () => {
    const before = await typeRow('# Notes on this table');
    const err = await regenerateViews(base).catch((e) => e);
    expect(err.code).toBe('CONFIG');
    expect(err.message).toContain('# Notes on this table');
    expect(err.handRows).toEqual([{ line: expect.any(Number), id: null }]);
    expect(await read(FILE)).toBe(before);
  });

  it('an exact copy of a row the table prints, typed under it: the table prints one, so the copy is refused', async () => {
    const printed = '| `M7.E1` | **in flight** |  |';
    expect(await read(FILE)).toContain(`${printed}\n`);
    const before = await typeRow(printed);
    const table = renderEpicTable(units.listUnits(base).units, { milestone: '7' });
    const found = rowsNotReprinted(before, table, { milestone: '7', ids: ['M7.E1', 'M7.E2'] });
    expect(found.map((r) => [r.text, r.id, r.repeated])).toEqual([[printed, 'M7.E1', true]]);
    await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'CONFIG', handRows: [{ line: found[0].line, id: 'M7.E1' }] });
    expect(await read(FILE)).toBe(before);
  });

  it('text changed outside the markers after the check and before the write is kept: the table is set into the file as it is then', async () => {
    const text = await read(FILE);
    await plant('M7.E3', [opened]); // makes the table differ, so the milestone file is written
    const { writeFileSync } = await import('node:fs');
    seam.beforeWrite = () => writeFileSync(join(base, FILE), text.replace('Intro.', 'Intro, rewritten meanwhile.').replace('After.', 'After, too.'));
    await regenerateViews(base);
    expect(seam.beforeWrite).toBe(null); // the seam fired
    const after = await read(FILE);
    expect(after).toContain('| `M7.E3` | **in flight** |'); // the milestone file was written after the change
    expect(after).toContain('Intro, rewritten meanwhile.');
    expect(after).toContain('After, too.');
    expect(after).not.toContain('Intro.\n');
  });

  it('a row typed after the check and before the write is not deleted either', async () => {
    // The check passes on the file as it is; the row arrives while the first view is being written.
    const text = await read(FILE);
    await plant('M7.E3', [opened]); // makes the table differ, so the milestone file would be written
    const { writeFileSync } = await import('node:fs');
    seam.beforeWrite = () => writeFileSync(join(base, FILE), text.replace(END, `| \`M7.E5\` | planned | typed late |\n${END}`));
    const err = await regenerateViews(base).catch((e) => e);
    expect(seam.beforeWrite).toBe(null); // the seam fired
    expect(err?.handRows).toEqual([{ line: expect.any(Number), id: 'M7.E5' }]);
    expect(await read(FILE)).toContain('typed late');
  });
});

// Only a row whose first cell is an Epic's ID and nothing else is that Epic's
// row. A cell that begins with a recorded Epic's ID and goes on — a slice, a
// follow-up, two Epics — is a row a person typed for something else, and a
// second row for an Epic is one too: the table prints one row for each.
describe('a row whose first cell begins with a recorded Epic\'s ID and is not that ID alone', () => {
  const CELLS = ['M7.E1.S3', 'E1-bis', 'M7.E1/E3 shared', '**E1 follow-ups (not an epic)**'];
  for (const cell of CELLS) {
    it(`“${cell}”: a unit write and an item write are refused, and the file is unchanged`, async () => {
      const before = await typeRow(`| ${cell} | planned | typed by hand |`);
      const err = await units.editUnit(base, 'M7.E1', { changes: { summary: 'a summary' }, by, at: AT }).catch((e) => e);
      expect(err).toMatchObject({ name: 'WorkStoreError', code: 'CONFIG' });
      expect(err.message).toContain(cut(cell));
      expect(err.message).toMatch(/not an Epic's ID and nothing else/);
      expect(units.getUnit(base, 'M7.E1').record.summary).toBeUndefined();
      await expect(records.newItem(base, { title: 'a thing', type: 'BUG', by, at: AT })).rejects.toMatchObject({ code: 'CONFIG' });
      expect(records.listRecords(base).records).toEqual([]);
      await expect(regenerateViews(base)).rejects.toMatchObject({ handRows: [{ line: expect.any(Number), id: null }] });
      expect(await read(FILE)).toBe(before);
    });
  }

  it('a second row for an Epic that has a record: refused as a row typed by hand, naming the Epic, and the file is unchanged', async () => {
    const before = await typeRow('| `M7.E1` | **in flight** | the same Epic again |');
    const err = await units.editUnit(base, 'M7.E1', { changes: { summary: 'a summary' }, by, at: AT }).catch((e) => e);
    expect(err).toMatchObject({ name: 'WorkStoreError', code: 'CONFIG' });
    expect(err.message).toMatch(/another row for M7\.E1/);
    await expect(records.newItem(base, { title: 'a thing', type: 'BUG', by, at: AT })).rejects.toMatchObject({ code: 'CONFIG' });
    await expect(regenerateViews(base)).rejects.toMatchObject({ handRows: [{ line: expect.any(Number), id: 'M7.E1' }] });
    expect(await read(FILE)).toBe(before);
  });

  it('a second row for a legacy Epic, named another way (bare “E2”): refused too', async () => {
    const before = await typeRow('| **E2** | shipped | again |');
    await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'CONFIG', handRows: [{ line: expect.any(Number), id: 'M7.E2' }] });
    expect(await read(FILE)).toBe(before);
  });

  it('the generated table round-trips: regenerated twice, nothing is refused and nothing changes', async () => {
    const text = await read(FILE);
    await regenerateViews(base);
    await regenerateViews(base);
    expect(await read(FILE)).toBe(text);
    expect(records.checkRecords(base)).toEqual([]);
  });

  it('a legacy Epic\'s old row, its first cell carrying a title, is still that Epic\'s row when the Epic is reopened', async () => {
    expect(await read(FILE)).toContain('| **E2 — the old way of naming it** |');
    await units.reopenUnit(base, 'M7.E2', { reason: 'it came back', by, at: AT });
    const after = await read(FILE);
    expect(after).toContain('| `M7.E2` | **in flight** |');
    expect(after).not.toContain('the old way of naming it');
    expect(records.checkRecords(base)).toEqual([]);
  });
});

describe('a row for a unit that has a record is regenerated, whatever its cells say', () => {
  it('edited text in a generated row is put back, with no refusal', async () => {
    const text = await read(FILE);
    await put(FILE, text.replace('**in flight**', 'nearly done, honest'));
    await units.editUnit(base, 'M7.E1', { changes: { summary: 'a summary' }, by, at: AT });
    const after = await read(FILE);
    expect(after).toContain('| `M7.E1` | **in flight** | a summary |');
    expect(after).not.toContain('nearly done');
  });

  it('a hand-kept table put between the markers for the first time — its own header, bare "E1" names — is replaced, since every row has a record', async () => {
    await put(FILE, milestone('| Epic | State | Owner | Notes |\n|:--|---|---|--:|\n| **E1** | going | me | x |\n| **E2** | shipped | me | y |\n'));
    await regenerateViews(base);
    const after = await read(FILE);
    expect(after).toContain('| Epic | Status | Summary |');
    expect(after).toContain('| `M7.E1` | **in flight** |');
    expect(after).not.toContain('Owner');
  });

  it('the same table with a title after the name ("E1 — first"), for an Epic with no recorded old row: refused, since the cell is not the ID alone', async () => {
    const hand = milestone('| Epic | State | Owner | Notes |\n|:--|---|---|--:|\n| **E1 — first** | going | me | x |\n| **E2** | shipped | me | y |\n');
    await put(FILE, hand);
    await expect(regenerateViews(base)).rejects.toMatchObject({ code: 'CONFIG', handRows: [{ line: expect.any(Number), id: null }] });
    expect(await read(FILE)).toBe(hand);
  });

  it('the table the generator wrote never refuses the next regeneration — a legacy row whose first cell is not an ID included', async () => {
    const text = await read(FILE);
    expect(text).toContain('| **E2 — the old way of naming it** | **shipped** 2026-01-01 | what it did |');
    await expect(regenerateViews(base)).resolves.toEqual({ written: expect.any(Array) });
    expect(regenerateToMemory(base)[FILE]).toBe(text);
  });

  it('rowsNotReprinted: every row of a table it is given is safe against that table, for odd legacy first cells too', () => {
    const odd = ['plain words', '`weird` \\| cell', '**E9**', 'M7.E9 and more', '   ', '---'];
    const list = odd.map((cell, i) => ({
      id: `M7.E${i + 10}`, status: 'closed', held: false, hold_reason: null, closing_proof: null,
      close: { reason: 'legacy', at: AT }, record: { id: `M7.E${i + 10}`, legacy_row: [cell, 's', 't'], events: [legacy] },
    }));
    const table = renderEpicTable(list, { milestone: '7' });
    expect(rowsNotReprinted(milestone(`${table}\n`), table, { milestone: '7', ids: list.map((u) => u.id) })).toEqual([]);
  });

  // A recorded old row can be nothing but dashes, and then prints as a line
  // that reads as a separator. Such a line is never read back as a row, so it
  // lends its first cell to no typed row either.
  it('rowsNotReprinted: a unit row that prints as dashes only does not make a typed “---” row safe', () => {
    const list = [{
      id: 'M7.E10', status: 'closed', held: false, hold_reason: null, closing_proof: null,
      close: { reason: 'legacy', at: AT }, record: { id: 'M7.E10', legacy_row: ['---', '---', '---'], events: [legacy] },
    }];
    const table = renderEpicTable(list, { milestone: '7' });
    expect(table.split('\n')[2]).toBe('| --- | --- | --- |');
    expect(rowsNotReprinted(milestone(`${table}\n`), table, { milestone: '7', ids: ['M7.E10'] })).toEqual([]);
    const typed = '| --- | a note in a dashed row | x |';
    const found = rowsNotReprinted(milestone(`${table}\n${typed}\n`), table, { milestone: '7', ids: ['M7.E10'] });
    expect(found.map((r) => r.text)).toEqual([typed]);
  });

  // Two recorded old rows can share a first cell (both empty, say). The table
  // prints a row for each, and must read its own output back as safe.
  it('rowsNotReprinted: two rows the table itself prints with the same first cell are both safe; a third is not', () => {
    const table = ['| Epic | Status | Summary |', '|---|---|---|', '|  | shipped | one |', '|  | shipped | two |'].join('\n');
    const opts = { milestone: '7', ids: ['M7.E2', 'M7.E3'] };
    expect(rowsNotReprinted(milestone(`${table}\n`), table, opts)).toEqual([]);
    const found = rowsNotReprinted(milestone(`${table}\n|  | shipped | typed by hand |\n`), table, opts);
    expect(found.map((r) => [r.text, r.repeated])).toEqual([['|  | shipped | typed by hand |', true]]);
  });

  // The table's own rows are known by their whole text. A typed row that only
  // shares their first cell is not one of them, wherever it stands.
  it('rowsNotReprinted: a typed row sharing a first cell with the table\'s rows is not safe, before or after them, with one or both there', () => {
    const one = '|  | shipped | one |';
    const two = '|  | shipped | two |';
    const typed = '|  | a note I typed | keep me |';
    const table = ['| Epic | Status | Summary |', '|---|---|---|', one, two].join('\n');
    const head = '| Epic | Status | Summary |\n|---|---|---|\n';
    const opts = { milestone: '7', ids: ['M7.E2', 'M7.E3'] };
    for (const between of [[one, typed], [typed, one], [typed, one, two], [one, two, typed]]) {
      const found = rowsNotReprinted(milestone(`${head}${between.join('\n')}\n`), table, opts);
      expect(found.map((r) => r.text), between.join(' / ')).toEqual([typed]);
    }
    // None of the table's rows there: one typed row stands in for the Epic's row, as it always did; a second does not.
    const both = rowsNotReprinted(milestone(`${head}${typed}\n|  | another | typed |\n`), table, opts);
    expect(both.map((r) => r.text)).toEqual(['|  | another | typed |']);
  });

  it('rowsNotReprinted: a row for an Epic of another milestone is not safe just because that Epic has a record', () => {
    const table = renderEpicTable([], { milestone: '7' });
    const found = rowsNotReprinted(milestone(`${table}\n| \`M6.E1\` | shipped | from another file |\n`), table, { milestone: '7', ids: ['M6.E1'] });
    expect(found.map((r) => r.id)).toEqual(['M6.E1']);
  });
});

describe('what does not change', () => {
  it('a milestone file with no markers is still left exactly as it is', async () => {
    const plain = '# Milestone 7\n\n| Epic | Status |\n|---|---|\n| `M7.E5` | typed |\n';
    await put(FILE, plain);
    await units.holdUnit(base, 'M7.E1', { reason: 'keep', by, at: AT });
    expect(await read(FILE)).toBe(plain);
  });

  it('a project with no unit records never reads the rows', async () => {
    await rm(join(base, UNITS), { recursive: true, force: true });
    await rm(join(base, '.planning/work/EPICS.md'), { force: true });
    await put(FILE, milestone('| `M7.E5` | planned | typed |\n'));
    const before = await read(FILE);
    await records.newItem(base, { title: 'a thing', type: 'BUG', by, at: AT });
    expect(await read(FILE)).toBe(before);
    expect(existsSync(join(base, UNITS))).toBe(false);
  });
});
