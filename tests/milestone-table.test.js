// M6.E16.S5.t5.2 — the live milestone file's Epic table, written by code
// between markers (AC7.2, `D-M6E16-4`, `-12`).
// See .planning/M6.E16-VALIDATION.md row AC7.2.
//
// `renderEpicTable` and `upsertEpicTable` (`milestone-table.js`) are pure.
// `regenerateViews` calls them for the CURRENT milestone's file only, on a
// project with unit records, and only when that file carries the markers: a
// file without them is left alone and the regeneration says so without
// failing. Every byte outside the markers is the person's and never changes.
//
// Stores are temp folders; unit and milestone names are invented.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, symlink, stat, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { EPICS_BEGIN, EPICS_END, renderEpicTable, upsertEpicTable } from '../plugin/tools/lib/milestone-table.js';
import { regenerateViews, regenerateToMemory } from '../plugin/tools/lib/work-views.js';
import * as records from '../plugin/tools/lib/work-records.js';
import * as unitLib from '../plugin/tools/lib/unit-records.js';
import { UNIT_KIND, foldUnit } from '../plugin/tools/lib/unit-record.js';

const by = 'claude';
const AT = '2026-10-01T10:00:00.000Z';
const SHA = '0123abc456789def0123abc456789def01234567';
const UNITS = '.planning/work/units';
const MS = '.planning/MILESTONE-7.md';

const U = {
  opened: { type: 'opened', at: AT, by },
  closing: { type: 'close_requested', at: AT, by, proof: SHA },
  shipped: (extra = {}) => ({ type: 'closed', at: '2026-10-05T09:00:00.000Z', by, reason: 'shipped', proof: SHA, ...extra }),
  dropped: (words) => ({ type: 'closed', at: '2026-10-06', by, reason: 'dropped', words }),
  legacy: (extra = {}) => ({ type: 'closed', at: '2026-08-01', by: 'migration', reason: 'legacy', ...extra }),
  held: (reason) => ({ type: 'held', at: AT, by, reason }),
};
const unit = (id, events, extra = {}) => {
  const record = { id, ...extra, events };
  return { id, path: `${UNITS}/${id}.json`, record, ...foldUnit(record) };
};

const LEGACY_ROW = ['`M7.E1`', '**shipped** — `v9.0.1`, 2026-08-01 (parked, then reopened)', 'The first one: `a \\| b`, **bold**, a [link](x.md).'];
const SAMPLE = [
  unit('M7.E1', [U.legacy()], { legacy_row: LEGACY_ROW }),
  unit('M7.E2', [U.opened, U.closing, U.shipped({ pr: '#44', release: 'v9.9.1' })], { summary: 'The second one.' }),
  unit('M7.E3', [U.opened, U.closing], { title: 'A title, no summary' }),
  unit('M7.E4', [U.opened, U.dropped('became M7.E5')], { summary: 'Never ran.' }),
  unit('M7.E5', [U.opened], { summary: 'In flight.' }),
];

describe('renderEpicTable (AC7.2)', () => {
  it('the header, then one row per unit of that milestone, in numeric order', () => {
    expect(renderEpicTable([...SAMPLE].reverse(), { milestone: '7' }).split('\n')).toEqual([
      '| Epic | Status | Summary |',
      '|---|---|---|',
      `| ${LEGACY_ROW.join(' | ')} |`,
      '| `M7.E2` | **shipped** — v9.9.1, 2026-10-05 (PR #44) | The second one. |',
      '| `M7.E3` | **closing** — proof 0123abc | A title, no summary |',
      '| `M7.E4` | **dropped** — became M7.E5 | Never ran. |',
      '| `M7.E5` | **in flight** | In flight. |',
    ]);
  });

  it('a legacy_row unit prints its cells verbatim, whatever its events say', () => {
    const row = renderEpicTable([unit('M7.E1', [U.legacy(), U.held('keep')], { legacy_row: LEGACY_ROW, summary: 'ignored' })], { milestone: '7' }).split('\n')[2];
    expect(row).toBe(`| ${LEGACY_ROW.join(' | ')} |`);
  });

  it('units of another milestone, and units that are not Epic IDs, are not printed', () => {
    const units = [
      unit('M7.E9', [U.opened]), unit('M7.E10', [U.opened]), unit('M70.E1', [U.opened]),
      unit('M7.5.E1', [U.opened]), unit('M6.E7', [U.opened]), unit('phase-7', [U.opened]), unit('v7.E1', [U.opened]),
    ];
    const ids = (ms) => renderEpicTable(units, { milestone: ms }).split('\n').slice(2).map((r) => r.split('|')[1].trim());
    expect(ids('7')).toEqual(['`M7.E9`', '`M7.E10`']);
    expect(ids('7.5')).toEqual(['`M7.5.E1`']);
    expect(ids('8')).toEqual([]);
  });

  it('a shipped close prints what is recorded and leaves out what is not', () => {
    const status = (extra) => renderEpicTable([unit('M7.E2', [U.opened, U.closing, U.shipped(extra)])], { milestone: '7' }).split('\n')[2].split(' | ')[1];
    expect(status({})).toBe('**shipped** — 2026-10-05');
    expect(status({ release: 'v9.9.1' })).toBe('**shipped** — v9.9.1, 2026-10-05');
    expect(status({ pr: '#44' })).toBe('**shipped** — 2026-10-05 (PR #44)');
  });

  it('a hold is appended to the status; a legacy close with no old row says legacy; no summary and no title is an empty cell', () => {
    const rows = renderEpicTable([
      unit('M7.E1', [U.opened, U.held('still read daily')]),
      unit('M7.E2', [U.opened, U.closing, U.shipped(), U.held('audit')]),
      unit('M7.E3', [U.legacy({ pr: '#3', release: 'v9.0.0' })]),
    ], { milestone: '7' }).split('\n').slice(2);
    expect(rows).toEqual([
      '| `M7.E1` | **in flight** · held: still read daily |  |',
      '| `M7.E2` | **shipped** — 2026-10-05 · held: audit |  |',
      '| `M7.E3` | **closed** — legacy, v9.0.0 (PR #3) |  |',
    ]);
  });

  it('a `|` or a line break in recorded text stays inside its cell: one unit, one row', () => {
    const rows = renderEpicTable([
      unit('M7.E1', [U.opened, U.held('a | b\nc')], { summary: 'x | y\n| `M7.E99` | **shipped** | injected |\r\nz' }),
      unit('M7.E2', [U.opened, U.dropped('gone | away\nfor good')], { title: 'has \\| already' }),
    ], { milestone: '7' }).split('\n');
    expect(rows).toHaveLength(4);
    expect(rows[2]).toBe('| `M7.E1` | **in flight** · held: a \\| b c | x \\| y \\| `M7.E99` \\| **shipped** \\| injected \\| z |');
    expect(rows[3]).toBe('| `M7.E2` | **dropped** — gone \\| away for good | has \\| already |');
  });

  it('recorded text cannot carry a marker into the table, in a summary or in a legacy cell', () => {
    const text = renderEpicTable([
      unit('M7.E1', [U.opened], { summary: `x ${EPICS_END} y` }),
      unit('M7.E2', [U.legacy()], { legacy_row: ['`M7.E2`', `done ${EPICS_BEGIN}`, 'two\nlines'] }),
    ], { milestone: '7' });
    expect(text).not.toContain(EPICS_END);
    expect(text).not.toContain(EPICS_BEGIN);
    expect(text.split('\n')).toHaveLength(4);
  });
});

// A milestone file with text before and after, and a SECOND table that is not the Epic table.
const BEFORE = '# Milestone 7\n\nWritten by a person.\n\n## Risks\n\n| Risk | Handling |\n|---|---|\n| `M7.E1` slips | wait |\n\n## Epic status\n\n';
const AFTER = '\n\n> A note under the table, with a | pipe.\n\n## Later\n\n| Epic | Status | Summary |\n|---|---|---|\n| `M7.E99` | hand-written | not the Epic table |\n';
const fileWith = (inside) => `${BEFORE}${EPICS_BEGIN}${inside}${EPICS_END}${AFTER}`;
const sha = (text) => createHash('sha256').update(text).digest('hex');

describe('upsertEpicTable (AC7.2)', () => {
  const table = renderEpicTable(SAMPLE, { milestone: '7' });

  it('changes only the bytes strictly between the markers', () => {
    const out = upsertEpicTable(fileWith('\nold rows\n'), table);
    expect(out).toBe(fileWith(`\n${table}\n`));
    const begin = out.indexOf(EPICS_BEGIN) + EPICS_BEGIN.length;
    const end = out.indexOf(EPICS_END);
    expect(sha(out.slice(0, begin))).toBe(sha(`${BEFORE}${EPICS_BEGIN}`));
    expect(sha(out.slice(end))).toBe(sha(`${EPICS_END}${AFTER}`));
  });

  // Changed at REVIEW pass 1 (r1.3): the empty region used to be the two
  // markers side by side on one line. A marker is now a line of its own, so
  // the empty region is the end marker's line right after the begin marker's.
  it('an empty region is filled; a second run is identical', () => {
    const once = upsertEpicTable(fileWith('\n'), table);
    expect(once).toBe(fileWith(`\n${table}\n`));
    expect(upsertEpicTable(once, table)).toBe(once);
  });

  it('the two markers side by side on one line are not markers: nothing is written', () => {
    expect(() => upsertEpicTable(fileWith(''), table)).toThrow(/has no .*signal:epics:begin/);
  });

  it('CRLF text outside the markers is left as it is', () => {
    const crlf = `# M\r\n\r\n${EPICS_BEGIN}\r\nold\r\n${EPICS_END}\r\ntail\r\n`;
    const out = upsertEpicTable(crlf, table);
    expect(out.startsWith(`# M\r\n\r\n${EPICS_BEGIN}`)).toBe(true);
    expect(out.endsWith(`${EPICS_END}\r\ntail\r\n`)).toBe(true);
  });

  it.each([
    ['no markers', `${BEFORE}${AFTER}`, /has no .*signal:epics:begin/],
    ['only the begin marker', `${BEFORE}${EPICS_BEGIN}\nrows${AFTER}`, /signal:epics:end.* is missing/],
    ['only the end marker', `${BEFORE}rows\n${EPICS_END}${AFTER}`, /signal:epics:begin.* is missing/],
    ['the begin marker twice', `${EPICS_BEGIN}\n${EPICS_BEGIN}\n${EPICS_END}\n`, /signal:epics:begin.* appears 2 times/],
    ['the end marker twice', `${EPICS_BEGIN}\n${EPICS_END}\n${EPICS_END}\n`, /signal:epics:end.* appears 2 times/],
    ['the markers reversed', `${EPICS_END}\nrows\n${EPICS_BEGIN}\n`, /out of order/],
  ])('%s: throws, saying which, and never guesses a place', (_, content, message) => {
    expect(() => upsertEpicTable(content, table)).toThrow(message);
  });

  it('refuses a table that itself carries a marker', () => {
    expect(() => upsertEpicTable(fileWith(''), `| a |\n${EPICS_END}`)).toThrow(/marker/);
  });
});

// ── regenerateViews ─────────────────────────────────────────────────────────

describe('regenerateViews writes the current milestone\'s Epic table (AC7.2)', () => {
  let base;
  async function put(rel, content) {
    const p = join(base, rel);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, content, 'utf-8');
  }
  const read = (rel) => readFile(join(base, rel), 'utf-8');
  const plant = (u) => put(u.path, UNIT_KIND.serializeRecord(u.record));
  const state = (epic) => put('.planning/STATE.md', `---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: ${epic}\ncompleted_phases: []\n---\n# State\n`);
  const table = renderEpicTable(SAMPLE, { milestone: '7' });

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'sig-ms-table-'));
    await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    for (const u of SAMPLE) await plant(u);
    await plant(unit('M6.E1', [U.opened], { summary: 'Another milestone.' }));
    await state('M7.E5');
    await put(MS, fileWith('\n| stale |\n'));
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('the region is written from the records, and every byte outside the markers is identical', async () => {
    const out = await regenerateViews(base);
    const text = await read(MS);
    expect(text).toBe(fileWith(`\n${table}\n`));
    expect(sha(text.slice(0, text.indexOf(EPICS_BEGIN)))).toBe(sha(BEFORE));
    expect(sha(text.slice(text.indexOf(EPICS_END) + EPICS_END.length))).toBe(sha(AFTER));
    expect(text).toContain('| `M7.E99` | hand-written | not the Epic table |'); // the second table
    expect(text).toContain('| `M7.E1` slips | wait |'); // and the one above
    expect(text).not.toContain('M6.E1'); // another milestone's unit
    expect(out.written).toContain(MS);
    expect(out.notes).toBeUndefined();
  });

  it('a second regeneration writes identical bytes and does not rewrite the file', async () => {
    await regenerateViews(base);
    const first = await read(MS);
    const old = new Date('2026-01-01T00:00:00.000Z');
    await utimes(join(base, MS), old, old);
    const out = await regenerateViews(base);
    expect(await read(MS)).toBe(first);
    expect((await stat(join(base, MS))).mtime.getTime()).toBe(old.getTime());
    expect(out.written).not.toContain(MS);
  });

  it('the milestone file is not a hand-kept view: it has no generated marker and is still written', async () => {
    await regenerateViews(base);
    expect((await read(MS)).startsWith('# Milestone 7')).toBe(true);
  });

  it('only the CURRENT milestone\'s file: another milestone file with markers is not touched', async () => {
    const other = `# Milestone 6\n\n${EPICS_BEGIN}\n| hand-kept |\n${EPICS_END}\n`;
    await put('.planning/MILESTONE-6.md', other);
    await regenerateViews(base);
    expect(await read('.planning/MILESTONE-6.md')).toBe(other);
    expect(Object.keys(regenerateToMemory(base))).not.toContain('.planning/MILESTONE-6.md');
  });

  it('a file with no markers: the regeneration does not fail, does not write it, and says so', async () => {
    const plain = `${BEFORE}| \`M7.E1\` | hand-written | x |${AFTER}`;
    await put(MS, plain);
    const out = await regenerateViews(base);
    expect(await read(MS)).toBe(plain);
    expect(out.written).not.toContain(MS);
    expect(out.notes).toEqual([expect.stringMatching(/MILESTONE-7\.md has no .*signal:epics:begin.*Epic table was not written/s)]);
    expect(Object.keys(regenerateToMemory(base))).not.toContain(MS);
    expect(records.checkRecords(base)).toEqual([]); // a project that has not added markers is unaffected
    expect(existsSync(join(base, '.planning/work/EPICS.md'))).toBe(true); // the other views were written
  });

  it('no milestone file, no STATE.md, no current Epic, a current unit that is not an Epic: nothing written, no failure', async () => {
    await rm(join(base, MS));
    expect((await regenerateViews(base)).notes).toEqual([expect.stringMatching(/MILESTONE-7\.md does not exist/)]);
    await put(MS, fileWith(''));
    await rm(join(base, '.planning/STATE.md'));
    expect((await regenerateViews(base)).notes).toBeUndefined();
    expect(await read(MS)).toBe(fileWith(''));
    await put('.planning/STATE.md', '---\nschema_version: 1\nphase: EXECUTE\ncompleted_phases: []\n---\n# State\n');
    await regenerateViews(base);
    expect(await read(MS)).toBe(fileWith(''));
  });

  it.each([
    ['doubled', `${EPICS_BEGIN}\n${EPICS_END}\n\n${EPICS_BEGIN}\n${EPICS_END}\n`, /appears 2 times/],
    ['reversed', `${EPICS_END}\nrows\n${EPICS_BEGIN}\n`, /out of order/],
    ['half there', `# M\n${EPICS_BEGIN}\nrows\n`, /is missing/],
  ])('markers %s: the regeneration refuses, naming the file, and writes nothing at all', async (_, content, message) => {
    await regenerateViews(base); // views on disk, fresh
    await plant(unit('M7.E6', [U.opened]));
    await put(MS, content);
    const epics = await read('.planning/work/EPICS.md');
    const err = await regenerateViews(base).catch((e) => e);
    expect(err).toMatchObject({ code: 'CONFIG' });
    expect(err.message).toMatch(/MILESTONE-7\.md/);
    expect(err.message).toMatch(message);
    expect(await read(MS)).toBe(content);
    expect(await read('.planning/work/EPICS.md')).toBe(epics); // not half-regenerated
  });

  it('a milestone file that is a symbolic link is neither read nor written, and the regeneration says so', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'sig-ms-outside-'));
    try {
      const target = join(outside, 'target.md');
      await writeFile(target, fileWith('\n| outside |\n'));
      await rm(join(base, MS));
      await symlink(target, join(base, MS));
      const out = await regenerateViews(base);
      expect(await readFile(target, 'utf-8')).toBe(fileWith('\n| outside |\n'));
      expect(out.written).not.toContain(MS);
      expect(out.notes).toEqual([expect.stringMatching(/MILESTONE-7\.md is a symbolic link/)]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('without a units folder the milestone file is never read or written (AC6.4)', async () => {
    await rm(join(base, UNITS), { recursive: true });
    const out = await regenerateViews(base);
    expect(await read(MS)).toBe(fileWith('\n| stale |\n'));
    expect(out).toEqual({ written: expect.any(Array) });
    expect(Object.keys(regenerateToMemory(base))).not.toContain(MS);
  });

  it('a unit write updates the row at once: opened reads in flight, a close request reads closing', async () => {
    await regenerateViews(base);
    await unitLib.openUnit(base, 'M7.E6', { summary: 'Opened by a command.', by });
    expect(await read(MS)).toContain('| `M7.E6` | **in flight** | Opened by a command. |');
    await unitLib.requestUnitClose(base, 'M7.E6', { proof: SHA, by });
    expect(await read(MS)).toContain('| `M7.E6` | **closing** — proof 0123abc | Opened by a command. |');
    expect(await read(MS)).toContain('| `M7.E99` | hand-written | not the Epic table |');
  });
});
