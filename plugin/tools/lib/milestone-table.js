// A milestone file's Epic table, written from the unit records
// (M6.E16 t5.2, AC7.2, `D-M6E16-4`, `-12`, `-30`).
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
// no file is read or written here. `work-views.js` finds the milestone files
// — the current milestone's, and any other marked one whose table no longer
// matches the records — and writes them.

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
      // A close a person confirmed by hand says so (M6.E16 r7.1); no other row changes.
      text = `**shipped** — ${what}${pr}${close.confirmed_by === 'person' ? ' (confirmed by hand)' : ''}`;
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
 * A unit closed as `legacy` that has a `legacy_row` (an Epic that shipped
 * before unit records) prints those cells as they were recorded. Any other
 * unit — one with a `legacy_row` that is open, closing, or closed another way
 * included — prints its ID, a status
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
      // The old row is printed only while the unit reads closed as legacy. A
      // unit that is open, closing, or closed another way has a status of its
      // own to print, and its old row's words would contradict it: the cells
      // stay in the record, where nothing a person wrote is lost.
      const legacy = u.status === 'closed' && u.close?.reason === 'legacy' ? u.record.legacy_row : null;
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

// A table row's first cell: what stands between its opening `|` and the next
// `|` that is not escaped, without the spaces around it.
function firstCell(row) {
  const text = trimmed(row).slice(1);
  let i = 0;
  for (; i < text.length; i += 1) {
    if (text[i] === '\\') i += 1;
    else if (text[i] === '|') break;
  }
  return trimmed(text.slice(0, i));
}

// A row's cells, each without the spaces around it (split on every `|`; an
// escaped one is not told apart — this is for reading a header, not a cell).
const cellsOf = (row) => trimmed(row).replace(/^\|/, '').replace(/\|$/, '').split('|').map(trimmed);

// A table's separator row (`|---|:--:|`): every cell is dashes, with an
// optional colon at either end.
function isSeparatorRow(row) {
  const cells = cellsOf(row);
  return cells.length > 0 && cells.every((c) => /^:?-{1,200}:?$/.test(c));
}

// The Epic a first cell is the ID of, as a full ID, or null: inside the
// decoration a row carries (backticks, bold), `M6.E16`, or a bare `E16` read
// as an Epic of `milestone` — and nothing else. A cell that goes on after the
// ID (`M6.E16.S3`, `E16-bis`, `E16 follow-ups`) is not that Epic's row. The
// decoration runs are bounded, so a long run of stars costs its length once.
const NAMED_EPIC_RE = /^[\s`*_]{0,10}(?:(M\d+(?:\.\d+)*)\.)?E(\d+)[\s`*_]{0,10}$/;
function namedEpic(cellText, milestone) {
  const m = cellText.match(NAMED_EPIC_RE);
  return m ? `${m[1] ?? `M${milestone}`}.E${m[2]}` : null;
}

/**
 * The first cell of each old row the unit records of one milestone hold
 * (`legacy_row`, what the migration stored of a hand-kept row), as the table
 * prints it, with the Epic it belongs to. An old row's first cell may carry
 * more than the ID (`**E2 — a title**`): the migration took that row as the
 * Epic's, so `rowsNotReprinted` must too, also once the unit no longer reads
 * closed as legacy and the table prints its ID instead. An empty cell is left
 * out.
 *
 * @param {Array<{id: string, record: object}>} units — `listUnits(...).units`
 * @param {{milestone: string}} opts
 * @returns {Map<string, string>} first cell → unit ID
 */
export function legacyFirstCells(units, { milestone }) {
  const out = new Map();
  for (const u of units) {
    const row = u.record?.legacy_row;
    if (!Array.isArray(row) || row.length === 0 || epicIdParts(u.id)?.milestone !== String(milestone)) continue;
    const first = firstCell(`| ${legacyCell(row[0])} |`);
    if (first !== '') out.set(first, u.id);
  }
  return out;
}

// Is this row the generated table's header? By its cells — `Epic`, `Status`,
// `Summary` — however it is spaced. The one comparison, for every caller
// (r6.1: one place compared cells and another the exact text, and a header
// written `|Epic|Status|Summary|` was the header to one and a typed row to the other).
const isGeneratedHeader = (text) => cellsOf(text).join('|') === cellsOf(HEADER[0]).join('|');

/**
 * The table between the two marker lines, as a person wrote it: its header (a
 * first row that a separator row follows), and every other row that is not a
 * separator. For a caller that must say what a regeneration replaces — the
 * migration's dry run. Lines that are not table rows are
 * `linesBetweenMarkers`'. Nothing unless the markers are `ok`.
 *
 * @param {string} content — the milestone file's text
 * @returns {{header: {line: number, text: string, generated: boolean}|null, separator: {line: number, text: string}|null,
 *   rows: Array<{line: number, text: string}>}}
 *   `line` is 1-based; `text` is the row as written; `header.generated`: its cells are the generated
 *   table's own (`Epic`, `Status`, `Summary`); `separator`: the separator row that makes the first row a header
 */
export function tableBetweenMarkers(content) {
  const at = epicMarkers(content);
  if (at.state !== 'ok') return { header: null, separator: null, rows: [] };
  const all = [];
  let n = at.beginLine;
  for (const l of linesOf(content.slice(at.from, at.to))) {
    n += 1;
    if (trimmed(l.text).startsWith('|')) all.push({ line: n, text: l.text });
  }
  const hasHeader = all.length > 1 && !isSeparatorRow(all[0].text) && isSeparatorRow(all[1].text);
  const header = hasHeader
    ? { ...all[0], generated: isGeneratedHeader(all[0].text) }
    : null;
  return { header, separator: hasHeader ? all[1] : null, rows: all.filter((row, i) => !(hasHeader && i === 0) && !isSeparatorRow(row.text)) };
}

/**
 * The table rows between the two marker lines that writing `tableText` there
 * would delete and not print again: a row a person typed for something the
 * unit records do not hold. `upsertEpicTable` replaces everything between the
 * markers, so a caller that must not lose such a row asks this first.
 *
 * A row is safe — it is regenerated, whatever its other cells say — when its
 * first cell is the first cell of a unit's row of `tableText` (not of its
 * header or separator, which are known by their whole text); or is, and is only,
 * the ID of an Epic (`M6.E16`, or `E16` read as an Epic of `milestone`) that
 * is in `ids` and is an Epic of this milestone — so one the table prints a
 * row for; or is the first cell of that Epic's recorded old row (`legacy`).
 * Only the first such row for an Epic is safe: the table prints one, so a
 * second is a row a person typed (`repeated`). A separator row, and a first
 * row that a separator row follows (a header a person wrote), are the table's
 * structure and are safe too — unless that first row is not the generated
 * header and the generated header stands among the rows under it: then it is
 * a row typed above the table, read as any other row, and its separator is
 * returned with it. Every other row is returned. Lines that are not
 * table rows are `linesBetweenMarkers`'. Empty unless the markers are `ok`.
 *
 * @param {string} content — the milestone file's text
 * @param {string} tableText — `renderEpicTable`'s, about to be written
 * @param {{milestone: string, ids: Iterable<string>, legacy?: Map<string, string>}} opts — `ids`: every unit ID
 *   that has a record (or is being given one by the write this check is made for); `legacy`: `legacyFirstCells`'
 * @returns {Array<{line: number, text: string, cell: string, id: string|null, repeated?: true}>} `line` is 1-based;
 *   `text` is the row as written; `cell` its first cell; `id` the Epic it is the row of, when it is one;
 *   `repeated`: an earlier row is that Epic's already
 */
export function rowsNotReprinted(content, tableText, { milestone, ids, legacy = new Map() }) {
  const at = epicMarkers(content);
  if (at.state !== 'ok') return [];
  const has = new Set([...ids].filter((id) => epicIdParts(id)?.milestone === String(milestone)));
  const printedLines = tableText.split('\n');
  // Only a unit's row lends its first cell. The header and the separator are
  // the table's own by their whole text alone (`left`, below): no record
  // stands behind `Epic` or `---`, so a typed row with that first cell is not
  // taken for one of them. Nor does a unit's row that is dashes only: it reads
  // as a separator, so it is never among `rows` to answer for itself.
  const printed = new Set(printedLines.slice(HEADER.length).filter((line) => !isSeparatorRow(line)).map(firstCell));
  const between = tableBetweenMarkers(content);
  // A header a person wrote is the table's structure only while it is the
  // table's one header. With the generated header standing among the rows
  // under it, it is a row typed above the table (and a separator typed after
  // it), and is read as any other row.
  const above = between.header !== null && !between.header.generated && between.rows.some((row) => isGeneratedHeader(row.text))
    ? { line: between.header.line, text: between.header.text } : null;
  const rows = above === null ? between.rows : [above, ...between.rows];
  const keyOf = (cell) => legacy.get(cell) ?? namedEpic(cell, milestone) ?? cell;
  // A row that is, character for character, a row the table prints is the
  // table's own, however many it prints with that first cell (two recorded old
  // rows can share one). Each printed row answers for one such row.
  const left = new Map();
  for (const line of printedLines) left.set(line.trim(), (left.get(line.trim()) ?? 0) + 1);
  const exact = new Set();
  const seen = new Set();
  for (const row of rows) {
    // The generated header answers for a header row however that is spaced.
    const text = isGeneratedHeader(row.text) ? HEADER[0] : row.text.trim();
    if ((left.get(text) ?? 0) === 0) continue;
    left.set(text, left.get(text) - 1);
    exact.add(row);
    seen.add(keyOf(firstCell(row.text)));
  }
  const out = [];
  for (const row of rows) {
    if (exact.has(row)) continue;
    const cell = firstCell(row.text);
    const id = legacy.get(cell) ?? namedEpic(cell, milestone);
    const own = printed.has(cell) || (id !== null && has.has(id));
    // Otherwise one row for each Epic — by its ID, or by the cell when it
    // names none — and only when none of the table's own rows is there for it.
    const key = id ?? cell;
    if (own && !seen.has(key)) {
      seen.add(key);
      continue;
    }
    out.push({ ...row, cell, id, ...(own ? { repeated: true } : {}) });
  }
  // The separator typed after such a row goes with it: it would be deleted too.
  if (above !== null && out[0]?.line === above.line) out.splice(1, 0, { ...between.separator, cell: firstCell(between.separator.text), id: null });
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
