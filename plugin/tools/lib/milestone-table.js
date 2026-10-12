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
// out of order. A marker is a LINE: the marker alone on it, outside a code
// fence (REVIEW pass 1). One mentioned in a sentence is not a marker. The shape is `upsertCeiling`'s (`adherence-log.js`), the one
// other writer of a marked region, without its insert-when-absent branch.
//
// Nothing reads the generated rows back (`D-M6E16-4`). This module is pure:
// no file is read or written here. `work-views.js` finds the current
// milestone's file and writes it.

import { cut, oneLine, printable } from './printable-text.js';
import {
  CLOSE_WORDS_MAX, LEGACY_CELL_MAX, LEGACY_CELLS_MAX, UNIT_REASON_MAX, UNIT_REF_MAX, UNIT_SUMMARY_MAX, compareUnitIds, epicIdParts,
} from './unit-record.js';
import { WorkStoreError } from './work-errors.js';

export const EPICS_BEGIN = '<!-- signal:epics:begin -->';
export const EPICS_END = '<!-- signal:epics:end -->';

const HEADER = ['| Epic | Status | Summary |', '|---|---|---|'];

// Text as it may stand between the markers: an HTML comment opener is taken
// apart, so no recorded text can put a marker inside the table (a second
// marker would make the next regeneration refuse).
export const noComment = (text) => text.replaceAll('<!--', '<\\!--');

// Recorded text as one line a person can read (M6.E16 v2.3): line breaks
// become a space, then control and invisible characters go
// (`printable-text.js`), then it is cut at `max`. A writer has done this
// already; a record that came by a merge or a shell command has not, so the
// text is not trusted here either.
const line = (v, max) => cut(printable(oneLine(String(v))), max);

// One table cell of recorded text: one line (`line`), and an unescaped `|` is
// escaped (an already-escaped one is kept), so one unit is always one row.
const cell = (v, max) => noComment(line(v, max).replace(/(?<!\\)\|/g, '\\|').trim());

// A cell of a legacy unit's old row: printed as it was recorded. Only what
// could not have been in a one-line table row is changed — a line break, a
// control or invisible character, a comment opener — and it is cut at the
// limit its writer cuts at. A `|` is left as recorded: a real old row can
// carry one (it had one more cell than the table's three).
const legacyCell = (v) => noComment(line(v, LEGACY_CELL_MAX));

function statusText(unit) {
  let text;
  if (unit.status === 'open') {
    text = '**in flight**';
  } else if (unit.status === 'closing') {
    text = `**closing** — proof ${cell(String(unit.closing_proof).slice(0, 7), 7)}`;
  } else {
    const close = unit.close;
    const pr = close.pr ? ` (PR ${cell(close.pr, UNIT_REF_MAX)})` : '';
    if (close.reason === 'dropped') {
      text = `**dropped** — ${cell(close.words ?? '', CLOSE_WORDS_MAX)}`.trimEnd();
    } else if (close.reason === 'legacy') {
      // A legacy close with no old row to print: the date it carries is when
      // it was recorded, not when the Epic shipped, so it is not printed.
      text = `**closed** — ${['legacy', close.release ? cell(close.release, UNIT_REF_MAX) : null].filter(Boolean).join(', ')}${pr}`;
    } else {
      const what = [close.release ? cell(close.release, UNIT_REF_MAX) : null, String(close.at).slice(0, 10)].filter(Boolean).join(', ');
      text = `**shipped** — ${what}${pr}`;
    }
  }
  return unit.held ? `${text} · held: ${cell(unit.hold_reason ?? '', UNIT_REASON_MAX)}` : text;
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
      // At most `LEGACY_CELLS_MAX` cells are printed: a record that came by a merge may hold more than a writer keeps.
      if (Array.isArray(legacy) && legacy.length > 0) return `| ${legacy.slice(0, LEGACY_CELLS_MAX).map(legacyCell).join(' | ')} |`;
      return `| \`${u.id}\` | ${statusText(u)} | ${cell(u.record.summary ?? u.record.title ?? '', UNIT_SUMMARY_MAX)} |`;
    });
  return [...HEADER, ...rows].join('\n');
}

// A line without the spaces and tabs around it. A loop, not a pattern: a long
// run of spaces before other text must cost its length, once.
function trimmed(line) {
  let from = 0;
  let to = line.length;
  while (from < to && (line[from] === ' ' || line[from] === '\t')) from += 1;
  while (to > from && (line[to - 1] === ' ' || line[to - 1] === '\t')) to -= 1;
  return from === 0 && to === line.length ? line : line.slice(from, to);
}

// A line that opens or closes a fenced code block: at most three spaces, then
// three or more of one of "`" and "~". → {ch, len, rest} or null.
function fenceOf(line) {
  let i = 0;
  while (i < 3 && line[i] === ' ') i += 1;
  const ch = line[i];
  if (ch !== '`' && ch !== '~') return null;
  let j = i;
  while (line[j] === ch) j += 1;
  return j - i >= 3 ? { ch, len: j - i, rest: line.slice(j) } : null;
}

// Every line of `content`: {start, end, next, text} — `start` and `end` bound
// the line without its line break, `next` is where the following line starts,
// `text` is the line without a trailing `\r`.
function* linesOf(content) {
  let start = 0;
  while (start <= content.length) {
    const nl = content.indexOf('\n', start);
    const end = nl === -1 ? content.length : nl;
    const raw = content.slice(start, end);
    yield { start, end, next: nl === -1 ? content.length : nl + 1, text: raw.endsWith('\r') ? raw.slice(0, -1) : raw };
    if (nl === -1) return;
    start = nl + 1;
  }
}

/**
 * The marker LINES of a file's text (REVIEW pass 1, C-I3 / S-M5). A marker is
 * one only when it is the whole line — spaces and tabs around it allowed, a
 * `\r` before the line break tolerated — and the line is not inside a fenced
 * code block. A marker mentioned in a sentence, in backticks, in a list item
 * or in a code example is text: it is not counted and pairs with nothing.
 *
 * @param {string} content
 * @returns {Array<{kind: 'begin'|'end', line: number, start: number, end: number, next: number, crlf: boolean}>}
 *   in file order; `line` is 1-based; `start`/`end` bound the line without its line break and `next` is
 *   where the following line starts; `crlf`: the line ends `\r\n`
 */
export function markerLines(content) {
  const found = [];
  let fence = null;
  let n = 0;
  for (const l of linesOf(content)) {
    n += 1;
    const f = fenceOf(l.text);
    if (fence !== null) {
      if (f !== null && f.ch === fence.ch && f.len >= fence.len && trimmed(f.rest) === '') fence = null;
      continue;
    }
    if (f !== null) {
      fence = f;
      continue;
    }
    const text = trimmed(l.text);
    const kind = text === EPICS_BEGIN ? 'begin' : text === EPICS_END ? 'end' : null;
    if (kind !== null) found.push({ kind, line: n, start: l.start, end: l.end, next: l.next, crlf: content[l.end - 1] === '\r' && l.end > l.start });
  }
  return found;
}

/**
 * Where the markers stand in a file's text. Only marker LINES count
 * (`markerLines`): a marker inside a sentence or a code block is not one.
 *
 * @param {string} content
 * @returns {{state: 'none'} | {state: 'ok', begin: number, end: number, from: number, to: number, eol: string,
 *   beginLine: number, endLine: number} | {state: 'broken', problem: string}}
 *   `none`: no marker line is there (a file nobody has marked);
 *   `ok`: one of each, in order — `begin` and `end` are the offsets of the two marker lines, `from` and
 *   `to` bound what lies strictly between those lines (from the start of the line after the begin marker
 *   to the start of the end marker's line), `eol` is the file's line ending as the begin marker's line
 *   has it, and `beginLine` / `endLine` are their 1-based line numbers;
 *   `broken`: one is missing, one is repeated, or the end comes first
 */
export function epicMarkers(content) {
  const lines = markerLines(content);
  const beginLines = lines.filter((l) => l.kind === 'begin');
  const endLines = lines.filter((l) => l.kind === 'end');
  const begins = beginLines.length;
  const ends = endLines.length;
  if (begins === 0 && ends === 0) return { state: 'none' };
  const broken = (problem) => ({ state: 'broken', problem });
  if (begins === 0) return broken(`\`${EPICS_BEGIN}\` is missing (only \`${EPICS_END}\` is there)`);
  if (ends === 0) return broken(`\`${EPICS_END}\` is missing (only \`${EPICS_BEGIN}\` is there)`);
  if (begins > 1) return broken(`\`${EPICS_BEGIN}\` appears ${begins} times`);
  if (ends > 1) return broken(`\`${EPICS_END}\` appears ${ends} times`);
  const [b] = beginLines;
  const [e] = endLines;
  if (e.start < b.start) return broken('the markers are out of order (the end marker comes first)');
  return { state: 'ok', begin: b.start, end: e.start, from: b.next, to: e.start, eol: b.crlf ? '\r\n' : '\n', beginLine: b.line, endLine: e.line };
}

/**
 * The lines strictly between the two marker lines that are neither blank nor
 * table rows (a row starts with `|`): what `upsertEpicTable` removes besides
 * the old table. For a caller that must say so before it writes — the
 * migration's dry run. Empty unless the markers are `ok`.
 *
 * @param {string} content
 * @returns {Array<{line: number, text: string}>} `line` is 1-based; `text` is the line as written, without its line break
 */
export function linesBetweenMarkers(content) {
  const at = epicMarkers(content);
  if (at.state !== 'ok') return [];
  const out = [];
  let n = at.beginLine;
  for (const l of linesOf(content.slice(at.from, at.to))) {
    n += 1;
    const text = trimmed(l.text);
    if (text !== '' && !text.startsWith('|')) out.push({ line: n, text: l.text });
  }
  return out;
}

/**
 * A milestone file's text with its Epic table replaced: only what lies
 * strictly between the two marker lines changes (it becomes the table, each
 * line ended as the file ends its lines). Every other byte, the marker lines
 * included — their indentation, their line breaks — is returned as it was.
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
      + 'between them, and they are never added by code. Put the two markers around the Epic table, each on a line of its own, once.');
  }
  if (at.state === 'broken') {
    throw new WorkStoreError('CONFIG', `${at.problem} — the Epic table is written only between one \`${EPICS_BEGIN}\` and one `
      + `\`${EPICS_END}\` after it, each on a line of its own. Fix the markers; nothing was written.`);
  }
  const table = at.eol === '\n' ? tableText : tableText.replaceAll('\n', at.eol);
  return `${content.slice(0, at.from)}${table}${at.eol}${content.slice(at.to)}`;
}
