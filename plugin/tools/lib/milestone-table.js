// The live milestone file's Epic table, written from the unit records
// (M6.E16 t5.2, AC7.2, `D-M6E16-4`, `-12`).
//
// A milestone file (`.planning/MILESTONE-6.md`) is a person's document with
// one table that used to be kept by hand: the Epic status rows. With unit
// records that table is generated, between two markers a person (or the
// migration) puts around it once:
//
//   <!-- signal:epics:begin -->
//   | Epic | Status | Summary |
//   |---|---|---|
//   | `M6.E16` | **in flight** | … |
//   <!-- signal:epics:end -->
//
// Everything outside the markers stays the person's: `upsertEpicTable` changes
// only the bytes strictly between them, and refuses — it never guesses a
// place, and never inserts the markers — when they are missing, repeated or
// out of order. The shape is `upsertCeiling`'s (`adherence-log.js`), the one
// other writer of a marked region, without its insert-when-absent branch.
//
// Nothing reads the generated rows back (`D-M6E16-4`). This module is pure:
// no file is read or written here. `work-views.js` finds the current
// milestone's file and writes it.

import { compareUnitIds, epicIdParts } from './unit-record.js';
import { WorkStoreError } from './work-errors.js';

export const EPICS_BEGIN = '<!-- signal:epics:begin -->';
export const EPICS_END = '<!-- signal:epics:end -->';

const HEADER = ['| Epic | Status | Summary |', '|---|---|---|'];

// Text as it may stand between the markers: an HTML comment opener is taken
// apart, so no recorded text can put a marker inside the table (a second
// marker would make the next regeneration refuse).
const noComment = (text) => text.replaceAll('<!--', '<\\!--');

// One table cell of recorded text: line breaks become a space and an
// unescaped `|` is escaped (an already-escaped one is kept), so one unit is
// always one row.
const cell = (v) => noComment(String(v).replace(/\s*[\r\n]+\s*/g, ' ').replace(/(?<!\\)\|/g, '\\|').trim());

// A cell of a legacy unit's old row: printed as it was recorded. Only what
// could not have been in a one-line table row is changed — a line break, and
// a comment opener.
const legacyCell = (v) => noComment(String(v).replace(/\s*[\r\n]+\s*/g, ' '));

function statusText(unit) {
  let text;
  if (unit.status === 'open') {
    text = '**in flight**';
  } else if (unit.status === 'closing') {
    text = `**closing** — proof ${String(unit.closing_proof).slice(0, 7)}`;
  } else {
    const close = unit.close;
    const pr = close.pr ? ` (PR ${cell(close.pr)})` : '';
    if (close.reason === 'dropped') {
      text = `**dropped** — ${cell(close.words ?? '')}`.trimEnd();
    } else if (close.reason === 'legacy') {
      // A legacy close with no old row to print: the date it carries is when
      // it was recorded, not when the Epic shipped, so it is not printed.
      text = `**closed** — ${['legacy', close.release ? cell(close.release) : null].filter(Boolean).join(', ')}${pr}`;
    } else {
      const what = [close.release ? cell(close.release) : null, String(close.at).slice(0, 10)].filter(Boolean).join(', ');
      text = `**shipped** — ${what}${pr}`;
    }
  }
  return unit.held ? `${text} · held: ${cell(unit.hold_reason ?? '')}` : text;
}

/**
 * The Epic table of one milestone, from unit records: the header, then one
 * row per unit whose ID is an Epic of that milestone (`M6.E16` for `'6'`), by
 * Epic number. Units of other milestones, and units that are not Epic IDs,
 * are not printed.
 *
 * A unit with `legacy_row` (an Epic that shipped before unit records) prints
 * those cells as they were recorded. Any other unit prints its ID, a status
 * built from its folded state — `**in flight**`; `**closing** — proof
 * <7 characters>`; `**shipped** — <release>, <date> (PR <pr>)` with what is
 * recorded; `**dropped** — <words>`; and ` · held: <reason>` when held — and
 * its `summary`, else its `title`, else nothing.
 *
 * @param {Array<{id: string, record: object, status: string, held: boolean, hold_reason: string|null,
 *   close: object|null, closing_proof: string|null}>} units — `listUnits(...).units`
 * @param {{milestone: string}} opts — the milestone's number as its file name has it (`'6'`, `'4.5'`)
 * @returns {string} the table, lines joined by `\n`, with no line break at either end
 */
export function renderEpicTable(units, { milestone }) {
  const rows = units
    .filter((u) => epicIdParts(u.id)?.milestone === String(milestone))
    .sort((a, b) => compareUnitIds(a.id, b.id))
    .map((u) => {
      const legacy = u.record.legacy_row;
      if (Array.isArray(legacy) && legacy.length > 0) return `| ${legacy.map(legacyCell).join(' | ')} |`;
      return `| \`${u.id}\` | ${statusText(u)} | ${cell(u.record.summary ?? u.record.title ?? '')} |`;
    });
  return [...HEADER, ...rows].join('\n');
}

const count = (content, marker) => content.split(marker).length - 1;

/**
 * Where the markers stand in a file's text.
 *
 * @param {string} content
 * @returns {{state: 'none'} | {state: 'ok', begin: number, end: number} | {state: 'broken', problem: string}}
 *   `none`: neither marker is there (a file nobody has marked);
 *   `ok`: one of each, in order — `begin` and `end` are their offsets;
 *   `broken`: one is missing, one is repeated, or the end comes first
 */
export function epicMarkers(content) {
  const begins = count(content, EPICS_BEGIN);
  const ends = count(content, EPICS_END);
  if (begins === 0 && ends === 0) return { state: 'none' };
  const broken = (problem) => ({ state: 'broken', problem });
  if (begins === 0) return broken(`\`${EPICS_BEGIN}\` is missing (only \`${EPICS_END}\` is there)`);
  if (ends === 0) return broken(`\`${EPICS_END}\` is missing (only \`${EPICS_BEGIN}\` is there)`);
  if (begins > 1) return broken(`\`${EPICS_BEGIN}\` appears ${begins} times`);
  if (ends > 1) return broken(`\`${EPICS_END}\` appears ${ends} times`);
  const begin = content.indexOf(EPICS_BEGIN);
  const end = content.indexOf(EPICS_END);
  if (end < begin) return broken('the markers are out of order (the end marker comes first)');
  return { state: 'ok', begin, end };
}

/**
 * A milestone file's text with its Epic table replaced: only the bytes
 * strictly between the two markers change (they become a line break, the
 * table, a line break). Every other byte, the markers included, is returned
 * as it was.
 *
 * @param {string} content — the file's text
 * @param {string} tableText — `renderEpicTable`'s
 * @returns {string}
 * @throws {WorkStoreError} CONFIG when the markers are missing, appear more than once or are out of
 *   order — nothing is guessed and no marker is inserted; or when `tableText` itself carries a marker
 */
export function upsertEpicTable(content, tableText) {
  if (tableText.includes(EPICS_BEGIN) || tableText.includes(EPICS_END)) {
    throw new WorkStoreError('CONFIG', 'the Epic table to write carries a signal:epics marker of its own — nothing was written.');
  }
  const at = epicMarkers(content);
  if (at.state === 'none') {
    throw new WorkStoreError('CONFIG', `the file has no \`${EPICS_BEGIN}\` … \`${EPICS_END}\` markers — the Epic table is written only `
      + 'between them, and they are never added by code. Put the two markers around the Epic table, once.');
  }
  if (at.state === 'broken') {
    throw new WorkStoreError('CONFIG', `${at.problem} — the Epic table is written only between one \`${EPICS_BEGIN}\` and one `
      + `\`${EPICS_END}\` after it. Fix the markers; nothing was written.`);
  }
  return `${content.slice(0, at.begin + EPICS_BEGIN.length)}\n${tableText}\n${content.slice(at.end)}`;
}
