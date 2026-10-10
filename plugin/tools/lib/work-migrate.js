// Migrating the four hand-kept lists into work items (M6.E11.S2, FR-9).
//
// Two halves:
//
//   1. SEGMENTERS (t2.1) — one per source file. Each returns the file cut into
//      regions that tile it exactly: `rows` (one per future item), `orphans`
//      (text that belongs to no row — preambles, section intros, the BUGS
//      footer — each with a name), and `gaps` (runs of blank lines and `---`
//      separators). Joining every region in line order gives the file back
//      byte-for-byte; that is what makes the lossless check (AC-9.4) a test
//      rather than a hope.
//
//   2. MAPPING (t2.2) — `planMigration` turns rows into items: id, type,
//      status, close record, `migration_note`, destination folder, and the
//      body with its relative links rewritten for that folder.
//
// Nothing here writes. `applyMigration`, which wrote the plan out as v1 item
// files and generated the lists from them, was this repository's one-time
// migration (M6.E11 S7, with `tools/work-migrate.mjs`); it was retired at
// M6.E13 t7.4 with the v1 store it produced — a v1 store is now refused by
// every writer. The segmenters and the plan stay: they are the only parsers
// that cut the hand-kept lists into entries, and the lossless and count checks
// (work-migrate / work-roundtrip tests) run on them. A plan's items are still
// v1-shaped (`validateItem`, a status folder); turning another project's lists
// into records is `/sig:docs-migrate --work-store`'s (`work-migrate-lists.js`,
// M6.E15), which reads them through these segmenters.
//
// ── Which lines are entries: the SHIPPED readers decide, not this module ────
//
// A second definition of "which lines are rows" that agrees with the reader
// only by construction is `B82`'s shape. So BUGS rows are found with
// `walkBugEntries`, BACKLOG rows with `parseBacklogRows({maxDepth: 4})`, inbox
// entries with `parseEntries`. This module adds only what the readers do not
// need to know: where each row ENDS, and what the text between rows is.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DONE_WORD_RE, parseBacklogRows } from './backlog.js';
import { walkBugEntries } from './bugs-tally.js';
import { parseEntries } from './drain.js';
import { validateItem, WorkStoreError } from './work-item.js';
import { rewriteRelativeLinks } from './work-links.js';
import { FOLDERS, WORK_DIR } from './work-store.js';

// ── Shared line machinery ────────────────────────────────────────────────────

const isFence = (line) => {
  const t = line.trimStart();
  return t.startsWith('```') || t.startsWith('~~~');
};

// A gap line is one that carries no content: blank, or a `---` separator.
const isGapLine = (line) => line.trim() === '' || line.trim() === '---';

function sliceLines(lines, from, to) {
  return lines.slice(from - 1, to).join('\n');
}

// Shrink a row's range so it never ends on blank lines or separators — those
// are between rows, not in them.
function trimRowEnd(lines, start, end, isTrailing = isGapLine) {
  while (end > start && isTrailing(lines[end - 1])) end--;
  return end;
}

/**
 * Tile a file given its row ranges. Every stretch between rows splits into a
 * leading gap, a named orphan core (first to last non-gap line, internal blank
 * lines included), and a trailing gap.
 *
 * @param {string[]} lines
 * @param {Array<{line:number, endLine:number}>} rows — sorted, non-overlapping
 * @param {(core: {line:number, endLine:number, text:string}, ctx: {first:boolean, last:boolean}) => string} nameOf
 * @param {Set<number>} [splitAt] — lines that always start a new stretch (a
 *   BACKLOG container heading, so a section intro is never merged with the
 *   text before it)
 */
function tile(lines, rows, nameOf, splitAt = new Set()) {
  const orphans = [];
  const gaps = [];
  const total = lines.length;
  const stretches = [];
  let cursor = 1;
  rows.forEach((r, i) => {
    if (r.line < cursor) {
      throw new WorkStoreError('SCHEMA', `row at line ${r.line} overlaps the region ending at line ${cursor - 1}`);
    }
    if (r.line > cursor) stretches.push({ from: cursor, to: r.line - 1, first: i === 0, last: false });
    cursor = r.endLine + 1;
  });
  if (cursor <= total) stretches.push({ from: cursor, to: total, first: rows.length === 0, last: true });

  // Break stretches at forced split lines.
  for (let k = 0; k < stretches.length; k++) {
    const s = stretches[k];
    const cut = [...splitAt].filter((l) => l > s.from && l <= s.to).sort((x, y) => x - y)[0];
    if (cut === undefined) continue;
    stretches.splice(k, 1, { ...s, to: cut - 1, last: false }, { from: cut, to: s.to, first: false, last: s.last });
  }

  for (const s of stretches) {
    let a = s.from;
    let b = s.to;
    while (a <= b && isGapLine(lines[a - 1])) a++;
    if (a > b) {
      gaps.push({ line: s.from, endLine: s.to, text: sliceLines(lines, s.from, s.to) });
      continue;
    }
    while (isGapLine(lines[b - 1])) b--;
    if (a > s.from) gaps.push({ line: s.from, endLine: a - 1, text: sliceLines(lines, s.from, a - 1) });
    const core = { line: a, endLine: b, text: sliceLines(lines, a, b) };
    orphans.push({ name: nameOf(core, s), ...core });
    if (b < s.to) gaps.push({ line: b + 1, endLine: s.to, text: sliceLines(lines, b + 1, s.to) });
  }
  return { orphans, gaps };
}

// The old ID a heading LEADS with, in another project's schemes (M6.E15
// t2.3, t2.4; `D-M6E15-2`): `#99`, `Issue #45`, `R3`, `NFR-04`. A letter ID
// counts only when a separator (`—`, `–`, `:`, ` - `) follows it, so a title
// that merely starts with a word and a number is not read as one. A unit ID
// (`M9.E1 …`) is not an old ID — `M9` is followed by `.` — and neither is a
// `B{n}`: in a list other than BUGS.md it names the bug, not this entry
// (`leadingId` still carries both). The decoration run is bounded, as in
// `leading-id.js`, so a non-matching heading cannot backtrack.
//
// In BUGS.md a `##` heading's leading `B{n}` DOES name the entry itself, so
// there (`{bugs: true}`, REVIEW S2) a `B{n}` counts like any other letter ID.
const LEGACY_ID_RE = /^[\s`*_~]{0,10}(?:(Issue #\d+|#\d+)\b|((?!B\d)[A-Z]{1,5}-?\d+)(?=\s{0,3}(?:—|–|:|-\s)))/;
const BUGS_LEGACY_ID_RE = /^[\s`*_~]{0,10}(?:(Issue #\d+|#\d+)\b|([A-Z]{1,5}-?\d+)(?=\s{0,3}(?:—|–|:|-\s)))/;

export function legacyIdOf(heading, { bugs = false } = {}) {
  const m = String(heading).match(bugs ? BUGS_LEGACY_ID_RE : LEGACY_ID_RE);
  return m ? (m[1] ?? m[2]) : null;
}

// A readable name for an orphan from its first line: markdown decoration
// stripped, cut at a word boundary. Names are for people and for the tests
// that list the regions; nothing keys on them.
function nameFromFirstLine(text, max = 60) {
  const first = text.split('\n')[0].replace(/[*_`#>]/g, '').trim();
  if (first.length <= max) return first;
  const cut = first.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 20 ? cut.lastIndexOf(' ') : max)}…`;
}

// ── BUGS.md ──────────────────────────────────────────────────────────────────
//
// Two shapes (bugs-tally.js's docblock names both):
//
//   * TABLE ROWS — `| B{n} | status | pri | summary |`. The summary is the REST
//     OF THE LINE after the third cell, never `split('|')`: B63/B72/B88/B96
//     carry unescaped `|` inside code spans, and a split truncates them.
//     A row whose line does not end in `|` continues onto following lines —
//     blank ones included — until a line that does (B52: one blank line and
//     one indented paragraph; B99: fourteen lines of numbered paragraphs).
//     Reaching another row, a `## ` heading or the end of the file first is an
//     error, not a longer row: a silent swallow is data loss by another name.
//
//   * UN-NUMBERED ENTRIES — `## title`, a `**Status:**` line, a body, ending at
//     the next top-level `---`. Found through walkBugEntries' capture status
//     lines; the heading is the nearest `## ` above.

const BUG_ROW_RE = /^\|\s*B(\d+)\s*\|([^|]*)\|([^|]*)\|/;
const H2_RE = /^## /;
const TALLY_RE = /^\*\s*\d+\s+needs-triage\b/;
const ENTRY_STATUS_RE = /^\*\*Status:\*\*\s*(.*)$/;
// A markdown table separator row (`|---|---|`), and any row's first three cells.
const TABLE_SEP_RE = /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;
const ANY_ROW_RE = /^\|([^|]*)\|([^|]*)\|([^|]*)\|/;
// What a bug table's ID cell may hold (REVIEW S3, legacy_id hygiene): one
// short token with a digit — `B1`, `BUG-7`, `NFR-04`, `#99`, `Issue #45`, a
// bare `1` (REVIEW pass 2 I-B) — at most 40 characters, no spaces (but
// `Issue #`), no control characters.
const ID_CELL_RE = /^(?=[^\d]{0,39}\d)(?:Issue #\d{1,9}|#\d{1,9}|\d{1,9}|[A-Za-z][A-Za-z0-9._-]{0,39})$/;

// The ID inside a decorated cell (REVIEW pass 2 I-C): strike-through and
// code/bold markup off, a markdown link unwrapped to its text
// (`[B1](notes/b1.md)` → `B1`), a trailing tick or emoji dropped (`B1 ✅`). A
// cell longer than any ID is returned as it is (and then reads as no ID), so
// no pattern runs over a long one.
const ID_CELL_MAX = 200;
const ID_LINK_RE = /^\[([^\][]{1,60})\]\([^()\s]{0,500}\)$/;
const ID_TAIL_RE = /(?:\s|\p{Extended_Pictographic}|[\u2713\u2714]|\uFE0F|\u200D){1,20}$/u;
function idCellText(raw) {
  if (raw.length > ID_CELL_MAX) return raw;
  let t = raw.replace(/~~/g, '').replace(/[`*]/g, '').trim().replace(ID_TAIL_RE, '');
  const link = t.match(ID_LINK_RE);
  if (link) t = link[1].trim().replace(ID_TAIL_RE, '');
  return t.replace(/_/g, '');
}

// Where does a summary cell's text begin? Right after the fourth `|` of the
// first line — i.e. after the id, status and priority cells.
function afterThirdCell(firstLine) {
  const m = firstLine.match(BUG_ROW_RE);
  return m[0].length;
}

/**
 * @param {string} text — BUGS.md content
 * @returns {{rows: Array<object>, orphans: Array<object>, gaps: Array<object>}}
 */
export function segmentBugs(text) {
  const lines = String(text).split('\n');
  const entries = walkBugEntries(text);

  // Fence state per line, so heading lookups and `---` ends ignore samples.
  const inFence = [];
  {
    let f = false;
    for (const l of lines) {
      if (isFence(l)) {
        inFence.push(true);
        f = !f;
        continue;
      }
      inFence.push(f);
    }
  }
  const tableStarts = new Set(entries.filter((e) => e.kind === 'row').map((e) => e.line));
  const isBoundary = (i) => tableStarts.has(i) || (!inFence[i - 1] && (H2_RE.test(lines[i - 1]) || TALLY_RE.test(lines[i - 1])));

  const rows = [];
  // The line of each `## ` entry taken so far: a lookup, not a scan of `rows`
  // per heading (headings × rows on a hostile file).
  const entryAt = new Set();
  for (const e of entries) {
    if (e.kind === 'row') {
      let end = e.line;
      while (!lines[end - 1].trimEnd().endsWith('|')) {
        end++;
        if (end > lines.length || isBoundary(end)) {
          throw new WorkStoreError(
            'SCHEMA',
            `BUGS.md:${e.line}: ${e.id}'s table row never closes — no line ending in \`|\` before `
              + `${end > lines.length ? 'the end of the file' : `line ${end}`}. Close the row or fix the line breaks.`
          );
        }
      }
      const rowText = sliceLines(lines, e.line, end);
      const m = lines[e.line - 1].match(BUG_ROW_RE);
      const start = afterThirdCell(lines[e.line - 1]);
      const summary = rowText.slice(start, rowText.lastIndexOf('|')).trim();
      rows.push({
        source: 'BUGS.md',
        kind: 'table',
        id: e.id,
        n: Number(m[1]),
        line: e.line,
        endLine: end,
        text: rowText,
        statusRaw: m[2].trim(),
        priority: m[3].trim(),
        summary,
      });
      continue;
    }

    // A capture: its heading is the nearest top-level `## ` above.
    let h = e.line - 1;
    while (h >= 1 && (inFence[h - 1] || !H2_RE.test(lines[h - 1]))) h--;
    if (h < 1) {
      throw new WorkStoreError('SCHEMA', `BUGS.md:${e.line}: a **Status:** line with no \`## \` heading above it`);
    }
    if (entryAt.has(h)) {
      throw new WorkStoreError('SCHEMA', `BUGS.md:${h}: an entry carries two **Status:** lines (second at line ${e.line})`);
    }
    let end = h + 1;
    while (end <= lines.length && !isBoundary(end) && !(lines[end - 1].trim() === '---' && !inFence[end - 1])) end++;
    end = trimRowEnd(lines, h, end - 1);
    entryAt.add(h);
    rows.push({
      source: 'BUGS.md',
      kind: 'entry',
      id: null,
      n: null,
      line: h,
      endLine: end,
      text: sliceLines(lines, h, end),
      heading: lines[h - 1].replace(H2_RE, '').trim(),
      statusRaw: lines[e.line - 1].match(ENTRY_STATUS_RE)[1].trim(),
      priority: null,
      summary: null,
    });
  }

  // Every `## ` heading is an entry. One with no **Status:** line (another
  // project's shape, M6.E15 t2.2) is an open entry with `statusRaw: null`,
  // ending where a status-line entry would; what that means is the planner's.
  lines.forEach((l, i) => {
    const h = i + 1;
    if (inFence[i] || !H2_RE.test(l) || entryAt.has(h)) return;
    let end = h + 1;
    while (end <= lines.length && !isBoundary(end) && !(lines[end - 1].trim() === '---' && !inFence[end - 1])) end++;
    end = trimRowEnd(lines, h, end - 1);
    rows.push({
      source: 'BUGS.md',
      kind: 'entry',
      id: null,
      n: null,
      line: h,
      endLine: end,
      text: sliceLines(lines, h, end),
      heading: l.replace(H2_RE, '').trim(),
      statusRaw: null,
      priority: null,
      summary: null,
    });
  });

  // Table rows whose ID is not `B{n}`, or that have none (M6.E15 t2.2, AC7.1).
  // Only in a table BODY (after a `|---|` separator, so a header is never an
  // item) and only outside every row and entry above — a table quoted inside
  // an entry's body is that entry's text. `walkBugEntries` is not changed: the
  // tally, sweep and advise read B-rows through it.
  //
  // Only a BUG table's rows are bugs (REVIEW S3): a table at least one of
  // whose body rows opens with an ID (`ID_CELL_RE`, a `B{n}` row included) or
  // a dash. Any other table (a legend, a glossary) is text between rows. The
  // ID is read from the first line of the first cell only; a cell that is not
  // ID-shaped gives no `id` and sets `idUnreadable` (legacy_id hygiene).
  //
  // Linear time (REVIEW I4): claimed lines are a lookup array, and each line's
  // next closing line (one ending in `|`) and next stop (a boundary or a
  // claimed line) are found once, back to front — not by a scan per row.
  const n = lines.length;
  const claimedAt = new Uint8Array(n + 2);
  for (const r of rows) for (let k = r.line; k <= r.endLine; k++) claimedAt[k] = 1;
  const nextClose = new Int32Array(n + 2).fill(n + 1);
  const nextStop = new Int32Array(n + 2).fill(n + 1);
  for (let k = n; k >= 1; k--) {
    nextClose[k] = lines[k - 1].trimEnd().endsWith('|') ? k : nextClose[k + 1];
    nextStop[k] = claimedAt[k] || isBoundary(k) ? k : nextStop[k + 1];
  }
  const bRowStarts = new Set(rows.filter((r) => r.kind === 'table').map((r) => r.line));
  const tableHasId = [];
  const candidates = [];
  let table = -1;
  let inTable = false;
  for (let ln = 1; ln <= n; ln++) {
    const l = lines[ln - 1];
    if (inFence[ln - 1]) {
      inTable = false;
      continue;
    }
    if (TABLE_SEP_RE.test(l)) {
      inTable = true;
      tableHasId[++table] = false;
      continue;
    }
    if (claimedAt[ln]) {
      if (inTable && bRowStarts.has(ln)) tableHasId[table] = true;
      continue;
    }
    if (!l.startsWith('|')) {
      inTable = false;
      continue;
    }
    if (!inTable) continue;
    // A row that does not close on its first line continues to the first line
    // that does, when one comes before a boundary; otherwise it is one line.
    const close = nextClose[ln];
    const end = close <= n && close < nextStop[ln + 1] ? close : ln;
    const rowText = sliceLines(lines, ln, end);
    const m = l.match(ANY_ROW_RE);
    const rawId = (l.split('|')[1] ?? '').trim();
    const idCell = idCellText(rawId);
    const none = /^[-—–]*$/.test(idCell);
    const idShaped = !none && ID_CELL_RE.test(idCell);
    if (none || idShaped) tableHasId[table] = true;
    const start = m ? m[0].length : 1;
    const last = rowText.lastIndexOf('|');
    candidates.push({
      table,
      row: {
        source: 'BUGS.md',
        kind: 'table',
        id: idShaped ? idCell : null,
        ...(none || idShaped ? {} : { idUnreadable: true }),
        // A struck ID cell (`~~B1~~`) is a strike marker, read like a struck
        // heading (the planner's `readMarkers`).
        ...(idShaped && rawId.includes('~~') ? { struckId: rawId } : {}),
        n: null,
        line: ln,
        endLine: end,
        text: rowText,
        statusRaw: m ? m[2].trim() : null,
        priority: m ? m[3].trim() : null,
        summary: (last >= start ? rowText.slice(start, last) : rowText.slice(start)).trim(),
      },
    });
    ln = end;
  }
  for (const c of candidates) if (tableHasId[c.table]) rows.push(c.row);

  rows.sort((a, b) => a.line - b.line);
  const { orphans, gaps } = tile(lines, rows, (core, ctx) => {
    if (ctx.first) return 'preamble';
    if (core.text.split('\n').some((l) => TALLY_RE.test(l))) return 'footer (tally)';
    return `between rows: ${nameFromFirstLine(core.text)}`;
  });
  return { rows, orphans, gaps };
}

// ── BACKLOG.md ───────────────────────────────────────────────────────────────
//
// Rows are exactly what `parseBacklogRows({maxDepth: 4})` returns outside
// `<details>`, with its discharge verdict carried unchanged (`D-M6E11-17`).
// A row runs to the line before the next live heading — row or container —
// which folds each `<details>` block (and the heading preserved inside it)
// into the row above, as the file intends. A container's own text (a section
// intro) belongs to no row.

const BACKLOG_FOOTER_RE = /^\*Last updated:.*\*\s*$/;

// The live headings parseBacklogRows sees, containers included. It filters
// containers out of its result, so their lines are recovered here with the
// SAME scan rules (depth 2..4, fence-aware, `<details>` counted per line) —
// and cross-checked against its output below, so the two cannot drift apart
// silently.
function liveBacklogHeadings(lines, maxDepth) {
  const re = new RegExp(`^(#{2,${maxDepth}})\\s+(.*)$`);
  const out = [];
  let details = 0;
  let fence = false;
  lines.forEach((line, i) => {
    if (isFence(line)) fence = !fence;
    const m = fence ? null : line.match(re);
    if (m && details === 0) out.push({ line: i + 1, depth: m[1].length, text: m[2].trim() });
    details += (line.match(/<details/g) ?? []).length - (line.match(/<\/details>/g) ?? []).length;
    if (details < 0) details = 0;
  });
  return out;
}

// A row's heading as a title (M6.E15 t2.4): strike-through removed, and the
// trailing ` · **tag** · size` and ` · **DONE — …**` segments dropped, last
// first. Nothing else is touched — a leading `#99 — ` stays (the old ID is
// `legacyId` too). The raw heading stays on the row and as its text's first line.
//
// Linear on any heading (REVIEW pass 2 I-D): the tails are cut from the end by
// moving an index, each one matched in a bounded window ending there — never
// a pattern over the whole heading once per tail.
const TITLE_TAIL_RE = /·\s{0,40}(?:\*\*[^*]{1,200}\*\*|small|medium|large)$/i;
const TITLE_TAIL_WINDOW = 260;

function backlogTitle(heading) {
  const t = heading.replace(/~~/g, '');
  let end = t.length;
  for (;;) {
    while (end > 0 && /\s/.test(t[end - 1])) end--;
    const m = t.slice(Math.max(0, end - TITLE_TAIL_WINDOW), end).match(TITLE_TAIL_RE);
    if (!m) break;
    end -= m[0].length;
  }
  return t.slice(0, end).trim();
}

/**
 * @param {string} text — BACKLOG.md content
 */
export function segmentBacklog(text) {
  const lines = String(text).split('\n');
  const parsed = parseBacklogRows(text, { maxDepth: 4 }).filter((r) => !r.inDetails);
  const heads = liveBacklogHeadings(lines, 4);
  const headLines = new Set(heads.map((h) => h.line));
  for (const r of parsed) {
    if (!headLines.has(r.line)) {
      throw new WorkStoreError('SCHEMA', `BACKLOG.md:${r.line}: parseBacklogRows reports a row this segmenter's heading scan did not see`);
    }
  }
  const rowLines = new Set(parsed.map((r) => r.line));
  const containers = new Map(heads.filter((h) => !rowLines.has(h.line)).map((h) => [h.line, h]));

  const boundaries = heads.map((h) => h.line);
  const nextBoundary = (line) => boundaries.find((b) => b > line) ?? lines.length + 1;

  const rows = parsed.map((r) => {
    const end = trimRowEnd(lines, r.line, nextBoundary(r.line) - 1, (l) => isGapLine(l) || BACKLOG_FOOTER_RE.test(l));
    return {
      source: 'BACKLOG.md',
      kind: 'row',
      line: r.line,
      endLine: end,
      text: sliceLines(lines, r.line, end),
      heading: r.text,
      depth: r.depth,
      leadingId: r.leadingId,
      legacyId: legacyIdOf(r.text),
      title: backlogTitle(r.text),
      discharged: r.discharged,
      dischargedBy: r.dischargedBy,
      dischargedAt: r.dischargedAt,
    };
  });

  const { orphans, gaps } = tile(lines, rows, (core, ctx) => {
    const container = containers.get(core.line);
    if (container) return `section intro: ${container.text}`;
    if (ctx.first) return 'preamble';
    if (core.text.split('\n').some((l) => BACKLOG_FOOTER_RE.test(l))) return ctx.last ? 'footer' : 'stale footer';
    return `between rows: ${nameFromFirstLine(core.text)}`;
  }, new Set(containers.keys()));
  return { rows, orphans, gaps };
}

// ── ISSUES-INBOX.md ──────────────────────────────────────────────────────────
//
// `parseEntries` finds the entries and the standing marker. The standing
// entry (the trigger watchlist) is not a work item (`D-M6E11-18`); it is
// returned on its own so the generator can re-emit it verbatim.

// The 1-based line of a character offset, from the line starts computed once
// per file (REVIEW pass 2 I-D: a scan from the top per entry was quadratic).
function lineStarts(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

function lineOfOffset(starts, offset) {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/**
 * @param {string} text — ISSUES-INBOX.md content
 */
export function segmentInbox(text) {
  const src = String(text);
  const lines = src.split('\n');
  const starts = lineStarts(src);
  const rows = [];
  let watchlist = null;
  for (const e of parseEntries(src)) {
    const start = lineOfOffset(starts, e.range.start);
    // `range.end` is the first byte of the next heading line (or EOF).
    const endExclusive = e.range.end >= src.length ? lines.length + 1 : lineOfOffset(starts, e.range.end);
    const end = trimRowEnd(lines, start, endExclusive - 1);
    const region = { line: start, endLine: end, text: sliceLines(lines, start, end) };
    if (e.standing) {
      if (watchlist) throw new WorkStoreError('SCHEMA', `ISSUES-INBOX.md:${start}: a second standing entry — only one watchlist is expected`);
      watchlist = { source: 'ISSUES-INBOX.md', heading: e.heading, ...region };
      continue;
    }
    rows.push({
      source: 'ISSUES-INBOX.md',
      kind: 'capture',
      heading: e.heading,
      statusLine: e.statusLine,
      dispositionKind: e.dispositionKind,
      ...region,
    });
  }
  const regions = [...rows, ...(watchlist ? [watchlist] : [])].sort((a, b) => a.line - b.line);
  const { orphans, gaps } = tile(lines, regions, (core, ctx) => (ctx.first ? 'preamble' : `between entries: ${nameFromFirstLine(core.text)}`));
  return { rows, orphans, gaps, watchlist };
}

// ── OPEN-QUESTIONS.md ────────────────────────────────────────────────────────
//
// `## ` entries. An entry ends at the next heading or at a top-level `---`,
// whichever comes first; text after a `---` and before the next heading (the
// italic re-entry note) belongs to no entry. Answered = struck heading that
// says ANSWERED — both, because either alone is ordinary prose.
//
// TWO LEVELS (M6.E15 t2.3). Another project groups its questions: `##`
// headings (`Currently blocking`, `Resolved during …`, `Last Updated`) over
// `###` entries. A file with any `### ` heading is read that way — the `###`
// are the entries and EVERY `##` is a named non-item region (`section: …`),
// its text kept, whether or not it has entries under it. Each entry records
// the `##` it sits under and that heading's finished word, for the planner.
// A file with no `### ` heading splits exactly as before.

// Answered = a struck span, then ANSWERED somewhere after it. Two linear
// steps (REVIEW pass 2 I-D): `~~[^~]+~~.*\bANSWERED\b` backtracked from every
// struck span to the end of the line.
const STRUCK_SPAN_RE = /~~[^~]+~~/;
const ANSWERED_WORD_RE = /\bANSWERED\b/;
function isAnswered(heading) {
  const m = heading.match(STRUCK_SPAN_RE);
  return m !== null && ANSWERED_WORD_RE.test(heading.slice(m.index + m[0].length));
}
const H3_RE = /^### /;
const GROUP_WORDS = new Set(['resolved', 'done', 'closed']);

// ── The finished wording (M6.E15 REVIEW C1, C1 residue; D-M6E15-24) ────────
//
// ONE rule for "does this text say the entry is finished", used for every
// marker the planner reads (a heading's bold annotation, the text after a
// struck span, a `**Status:**` line, a bug table cell, a backlog body line
// that opens bold) and for a question's grouping heading here. It is an
// ALLOW-list (D-M6E15-24): a deny-list of words leaks by construction, which
// is what REVIEW pass 2 measured. Read in order, on the text with markup
// (`*_~` and backticks) and leading punctuation off:
//
//   1. Never a marker: "done when …", "… of done" (`**Done when:**`,
//      `**Definition of done:**` — a criterion, not a verdict).
//   2. No finish word anywhere → not a marker.
//   3. Unclear: a `?`, `-ish`, or a word that undoes or qualifies a finish
//      (not, no, yet, until, but, still, reverted, reopened / re-opened,
//      rolled-back, regressed, cannot, any `n't`, TBD, wrong, in theory, …)
//      ANYWHERE in the text. The three specific markers are masked first, so
//      `not-a-bug` is not a negation.
//   4. The finish word must LEAD, after at most one affirming word (`Fully
//      resolved.`): done / resolved / answered / fixed / closed / shipped →
//      `fixed`; not-a-bug → `rejected`; won't-fix → `wontdo`; superseded →
//      `stale`. A finish word later in the text ("Half are fixed") is not a
//      marker.
//   5. After the finish word, only: a date (`2026-03-02`, `on 2026-03-02`,
//      `, 2026-03-02`) or `in <ref>` (a token with a digit: `in M9.E2`,
//      `in PR #12`, `in v2`), any number of times; then the end of the text,
//      a sentence end (`.` before a space or the end), an em/en dash or
//      ` - `, or `(`. Anything else — `:`, `,` then words, `by …`, `at …`,
//      `during …`, a bare version — is unclear: open and flagged.
//   6. After that start, NO free text (REVIEW pass 3 C1, D-M6E15-25):
//      only dates, references (a token with a digit: `#157`, `PR #12`,
//      `M9.E1`, a slice tag `(S5)`, `v2`, a commit), `[<reference>](url)`
//      links, bare URLs, finish words, and `in`/`on`. "Fixed — regressed in
//      v3", "Done — needs QA", "Closed. Nothing to do." are unclear. An
//      allow-list: three review passes each found a new phrasing a deny-list
//      let through.
//
// A generic lead refined by a specific word that opens a later ` — ` part
// (`Closed — superseded`) is that specific reason.
//
// Returns `{reasons: Set<string>, unclear: boolean, word: string|null}`;
// `word` is the leading generic finish word, lower case.
const FINISH_WORDS = 'done|resolved|answered|fixed|closed|shipped';
const SPECIFIC_FINISH = [
  [/not[- ]a[- ]bug\b/iy, /\bnot[- ]a[- ]bug\b/gi, 'rejected'],
  [/won['’]?t[- ]?fix\b/iy, /\bwon['’]?t[- ]?fix\b/gi, 'wontdo'],
  [/superseded\b/iy, /\bsuperseded\b/gi, 'stale'],
];
const AFFIRM_RE = /^(?:fully|completely|already|now)\s+/i;
const GENERIC_LEAD_RE = new RegExp(`^(${FINISH_WORDS})\\b`, 'i');
const FINISH_ANY_RE = new RegExp(`\\b(?:${FINISH_WORDS})\\b`, 'i');
const NEVER_MARKER_RE = /\bdone\s+when\b|\bof\s+done\b/i;
const UNDOING_RE = new RegExp('\\?|-ish\\b|\\b(?:'
  + 'not|no|never|yet|until|when|once|pending|blocked|waiting|will|to\\s+be|'
  + 'partially|partly|mostly|largely|but|though|although|except|still|broken|wrong|'
  + 'tbd|todo|theory|maybe|probably|unclear|unknown|unverified|cannot|'
  + 're-?open(?:ed|s|ing)?|revert(?:ed|s|ing)?|rolled[\\s-]+back|un-?done|un-?fixed|un-?resolved|regress(?:ed|es|ing|ion)?'
  + ')\\b|n[\'’]t\\b', 'i');
// A question's own plain heading, read when the entry carries a finish marker
// (REVIEW pass 3 I-1): words that say the state was undone or is still open.
// Narrower than UNDOING_RE on purpose — a question heading ends with `?` and
// uses "when", "will", "no" as ordinary words, so those are not here.
const STATE_UNDOING_RE = new RegExp('\\b(?:'
  + 're-?open(?:ed|s|ing)?|revert(?:ed|s|ing)?|rolled[\\s-]+back|un-?done|un-?fixed|un-?resolved|unanswered|'
  + 'regress(?:ed|es|ing|ion)?|still|blocked|blocking|pending|open\\s+again|'
  + 'not\\s+(?:yet\\s+)?(?:resolved|answered|done|fixed|closed|settled|decided)'
  + ')\\b|n[\'’]t\\b', 'i');

export function headingUndoes(text) {
  const plain = String(text).replace(/[*_~`]/g, ' ');
  return STATE_UNDOING_RE.test(plain) || finishedLead(plain).unclear;
}

// The steps rule 5 allows right after the finish word, and how what is left
// may start.
const DATE_STEP_RE = /^\s{0,3},?\s{0,3}(?:on\s{1,3})?\d{4}-\d{2}-\d{2}\b/i;
const IN_REF_STEP_RE = /^\s{1,3}in\s{1,3}(?:(?:PR|pull\s{1,3}request)\s{1,3})?#?(?=[\w.#/-]{0,60}\d)[\w#][\w.#/-]{0,60}/i;
const NOTE_START_RE = /^(?:\s*$|\.(?:\s|$)|\s{0,3}[(—–]|\s{1,3}-\s)/;
// What may follow a note start (REVIEW pass 3 C1, D-M6E15-25): no free text.
// The tail is split on separators — whitespace, dashes, `,`, `;`, `(`, `)`,
// a `.` that ends a sentence — after markdown links lose their URL (the link
// text is read) and bare URLs go (a URL is a reference). Every token left
// must be a date, a reference (a token with a digit: `#157`, `M9.E1`, `S5`,
// `v2`, a commit hash), a finish word, or `in`/`on`/`PR`/`pull request`.
const TAIL_LINK_G = /\[([^\][]{0,200})\]\([^()\s]{0,500}\)/g;
const TAIL_URL_G = /\bhttps?:\/\/[^\s()<>\]]{1,500}/gi;
const TAIL_SPECIFIC_G = /\bnot[- ]a[- ]bug\b|\bwon['’]?t[- ]?fix\b/gi;
const TAIL_SPLIT_RE = /[\s—–,;()]+|\.(?=\s|$)|(?<=\s)-(?=\s)/;
const TAIL_REF_RE = /^#?[A-Za-z]{0,12}[\w.#/-]{0,60}\d[\w.#/-]{0,60}$/;
const TAIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TAIL_WORD_RE = new RegExp(`^(?:${FINISH_WORDS}|superseded|in|on|pr|pull|request|\u0001)$`, 'i');
function tailIsPlain(rest) {
  const t = rest.replace(TAIL_LINK_G, ' $1 ').replace(TAIL_URL_G, ' ').replace(TAIL_SPECIFIC_G, ' \u0001 ');
  return t.split(TAIL_SPLIT_RE).every((tok) => tok === '' || tok === '-' || TAIL_DATE_RE.test(tok) || TAIL_REF_RE.test(tok) || TAIL_WORD_RE.test(tok));
}

export function finishedLead(text) {
  const none = { reasons: new Set(), unclear: false, word: null };
  const unclear = { ...none, unclear: true };
  const plain = String(text).replace(/[*_~`]/g, '').replace(/^[\s\p{P}\p{S}]+/u, '').trim();
  if (plain === '' || NEVER_MARKER_RE.test(plain)) return none;

  let masked = plain;
  for (const [, g] of SPECIFIC_FINISH) masked = masked.replace(g, ' ');
  if (!FINISH_ANY_RE.test(plain) && masked === plain) return none;
  if (UNDOING_RE.test(masked)) return unclear;

  const lead = plain.replace(AFFIRM_RE, '');
  const specificAt = (s) => {
    for (const [y, , reason] of SPECIFIC_FINISH) {
      y.lastIndex = 0;
      const m = y.exec(s);
      if (m) return { reason, length: m[0].length };
    }
    return null;
  };
  const sp = specificAt(lead);
  const g = sp ? null : lead.match(GENERIC_LEAD_RE);
  if (!sp && !g) return none;

  let rest = lead.slice(sp ? sp.length : g[0].length);
  for (let m = rest.match(DATE_STEP_RE) ?? rest.match(IN_REF_STEP_RE); m; m = rest.match(DATE_STEP_RE) ?? rest.match(IN_REF_STEP_RE)) {
    rest = rest.slice(m[0].length);
  }
  if (!NOTE_START_RE.test(rest)) return unclear;
  if (!tailIsPlain(rest)) return unclear;

  if (sp) return { ...none, reasons: new Set([sp.reason]) };
  const refined = new Set(lead.split(/\s[—–-]\s/).slice(1).map((part) => specificAt(part.replace(/^[\s(]+/, ''))?.reason).filter(Boolean));
  return { reasons: refined.size > 0 ? refined : new Set(['fixed']), unclear: false, word: g[1].toLowerCase() };
}

// The dates a marker writes BESIDE a finish word (REVIEW S1; D-M6E15-19):
// `fixed 2026-10-04`, `DONE — M9.E1, 2026-10-08`, `closed on 2026-03-02`. Only
// punctuation, an optional `on`/`in`, and at most one ID-like token (letters,
// digits and dots, with a digit: `M9.E1`, `v2.6`; or a PR reference: `#23`,
// `PR #23`) may come between the word and the date. Any other date in the text ("a regression from the 2025-11-01
// release") is not the close date. Returns the distinct dates, in order.
const MARKER_DATE_G = new RegExp(
  `\\b(?:${FINISH_WORDS}|not[- ]a[- ]bug|won['’]?t[- ]?fix|superseded)\\b[\\s*_~\`—–:,(-]{0,12}(?:(?:on|in)\\s{1,3})?`
    + `(?:(?:(?:PR\\s{0,3})?#\\d{1,7}|[A-Za-z][\\w.]{0,20}\\d[\\w.]{0,20})[\\s*_~\`,;)—–:-]{1,12})?(\\d{4}-\\d{2}-\\d{2})\\b`,
  'gi'
);

export function markerDates(text) {
  return [...new Set([...String(text).matchAll(MARKER_DATE_G)].map((m) => m[1]))];
}

/**
 * @param {string} text — OPEN-QUESTIONS.md content
 */
export function segmentQuestions(text) {
  const lines = String(text).split('\n');
  const h2 = [];
  const h3 = [];
  let fence = false;
  const topSep = new Set();
  lines.forEach((l, i) => {
    if (isFence(l)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    if (H2_RE.test(l)) h2.push(i + 1);
    if (H3_RE.test(l)) h3.push(i + 1);
    if (l.trim() === '---') topSep.add(i + 1);
  });
  const grouped = h3.length > 0;
  const heads = grouped ? h3 : h2;
  const allHeads = [...h2, ...h3].sort((a, b) => a - b);
  const groupOf = (h) => {
    const g = grouped ? h2.filter((x) => x < h).pop() : undefined;
    if (g === undefined) return { groupHeading: null, groupWord: null };
    const groupHeading = lines[g - 1].replace(H2_RE, '').trim();
    const { word } = finishedLead(groupHeading);
    return { groupHeading, groupWord: GROUP_WORDS.has(word) ? word : null };
  };

  const rows = heads.map((h) => {
    const nextHead = allHeads.find((x) => x > h);
    const limit = nextHead !== undefined ? nextHead - 1 : lines.length;
    let end = h;
    while (end < limit && !topSep.has(end + 1)) end++;
    end = trimRowEnd(lines, h, end);
    const heading = lines[h - 1].replace(grouped ? H3_RE : H2_RE, '').trim();
    return {
      source: 'OPEN-QUESTIONS.md',
      kind: 'question',
      line: h,
      endLine: end,
      text: sliceLines(lines, h, end),
      heading,
      answered: isAnswered(heading),
      legacyId: legacyIdOf(heading),
      ...groupOf(h),
    };
  });
  const sections = new Map(grouped ? h2.map((g) => [g, lines[g - 1].replace(H2_RE, '').trim()]) : []);
  const { orphans, gaps } = tile(
    lines,
    rows,
    (core, ctx) => {
      if (sections.has(core.line)) return `section: ${sections.get(core.line)}`;
      return ctx.first ? 'preamble' : `note: ${nameFromFirstLine(core.text, 40)}`;
    },
    new Set(sections.keys())
  );
  return { rows, orphans, gaps };
}

// ═════════════════════════════════════════════════════════════════════════════
// MAPPING (t2.2) — rows → items. Statuses are CARRIED, never re-judged
// (`D-M6E11-14`): every closed row keeps today's verdict and says so in its
// proof. Where the source is ambiguous, today's parser verdict is adopted and
// the item carries a `migration_note` so `/sig:item triage` surfaces it
// (`D-M6E11-17`).
// ═════════════════════════════════════════════════════════════════════════════

export const MIGRATION_PROOF = 'legacy — not re-verified';
export const MIGRATION_BY = 'migration';
export const SOURCES = Object.freeze(['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md']);

const TITLE_MAX = 120;

// ── Titles ───────────────────────────────────────────────────────────────────

const stripMd = (s) => s.replace(/\*\*/g, '').replace(/~~/g, '').trim();

export function clip(s, max = TITLE_MAX) {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max / 2 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

// A bold lead that is a status annotation rather than the bug's headline:
// `⟨STALENESS RE-CHECK …⟩`, `FIXED 2026-08-21.`, `WITHDRAWN …`. Measured on
// the live file: 20 of 127 rows lead with one. Taking it as the title would
// name B73 "FIXED 2026-08-21." — so it is skipped, and the next bold lead (or
// the next sentence) is the title. The full text stays in the body.
const ANNOTATION_RE = /^(?:⟨|FIXED\b|WITHDRAWN\b|RE-TRIAGED\b|STATUS CORRECTED\b|STALENESS\b)/;

function firstSentence(s) {
  const m = s.match(/^([\s\S]*?[.!?])(?:\s|$)/);
  return m ? m[1] : s;
}

export function bugTitle(summary) {
  let rest = summary.trim();
  for (;;) {
    const m = rest.match(/^\*\*([\s\S]+?)\*\*/);
    if (!m) break;
    if (!ANNOTATION_RE.test(m[1].trim())) return clip(m[1]);
    // `**FIXED — flipped 2026-08-04**, verified in …` — the sentence carries on
    // after the annotation; drop the joining punctuation.
    rest = rest.slice(m[0].length).replace(/^[\s,;:—–-]+/, '');
  }
  return clip(stripMd(firstSentence(rest || summary)));
}

// ── Statuses ─────────────────────────────────────────────────────────────────

function closeRecord(reason, today, extra = {}) {
  return { reason, by: MIGRATION_BY, at: today, proof: MIGRATION_PROOF, ...extra };
}

const TABLE_STATUS = {
  'needs-triage': { status: 'N' },
  confirmed: { status: 'T' },
  fixed: { status: 'C', reason: 'fixed' },
  dismissed: { status: 'C', reason: 'rejected' },
};

// The first word of an un-numbered entry's `**Status:**` value. `D-M6E11-16`
// adds the two the table never uses.
const ENTRY_STATUS = {
  ...TABLE_STATUS,
  'resolved-not-a-defect': { status: 'C', reason: 'rejected' },
  withdrawn: { status: 'C', reason: 'dup' },
};

// ── Backlog close reasons and types ─────────────────────────────────────────

const QUALIFIED_RE = /\b(?:PARTIALLY|PARTLY|MOSTLY|LARGELY)\s+(?:DONE|SHIPPED|ABANDONED|CLOSED|CUT|RESOLVED)\b/gi;
const SUPERSEDED_RE = /\bSUPERSEDED\b/;
const FOLD_RE = /\b(?:FOLDED INTO|absorbed into)\b/;
const KEPT_RE = /\bKEPT\b/i;
const TARGET_TOKEN_RE = /\b(M\d+(?:\.\d+)?\.E\d+|B\d+)\b|`([^`]+)`/;

export const TAG_TYPES = {
  roadmap: 'FEAT',
  hygiene: 'CHORE',
  verification: 'CHORE',
  'product call': 'Q',
  'fix lane': 'BUG',
};
const HEADING_TAG_RE = /\*\*(roadmap|hygiene|verification|product call|fix lane)\*\*/i;
const BODY_TAG_RE = /^\*\*Tag:\*\*\s*([a-z][a-z ]*?)(?=\s*(?:·|\(|$))/im;

export function backlogTag(row) {
  const h = row.heading.match(HEADING_TAG_RE);
  if (h) return h[1].toLowerCase();
  const b = row.text.match(BODY_TAG_RE);
  return b ? b[1].trim().toLowerCase() : null;
}

// ── Ambiguity notes (D-M6E11-17) ────────────────────────────────────────────
//
// By RULE first, because line numbers drift: a note keyed to `BACKLOG.md:916`
// would land on the wrong row after one edit above it. The explicit list is
// keyed by heading text and holds only what no rule can see; a key that
// matches nothing is reported (`unmatchedExplicitNotes`) so drift is loud.

const EXPLICIT_NOTES = [
  {
    source: 'BACKLOG.md',
    match: 'The entry price for *any* Phase A autonomy work',
    note: 'Names B73–B76 as its entry price; at migration B73, B74 and B76 read fixed and B75 confirmed — partly discharged, kept open by the parser.',
  },
  {
    source: 'BACKLOG.md',
    match: 'closure-gated archive',
    note: 'One of two rows describing the closure-gated archive command (both closed) — a duplicate pair.',
  },
  {
    source: 'BUGS.md',
    match: '`detectProjectKind` calls every non-git directory',
    note: 'Possibly the same defect as B112 (a table row with the same headline); not re-judged by the migration.',
  },
  {
    source: 'BUGS.md',
    match: 'An Epic-lane `--merge` produced a SQUASH',
    note: 'Possibly the same defect as B117 (the Epic lane kept getting squashed); not re-judged by the migration.',
  },
];

const baseTitle = (h) => h.replace(/~~/g, '').split(/ · | — /)[0].trim().toLowerCase();

function backlogRuleNotes(row, siblings) {
  const notes = [];
  const h = row.heading;
  if (/\breconciliation\b/i.test(h)) notes.push('A dated reconciliation record rather than a unit of work (the heading says reconciliation).');
  if (/trigger watchlist/i.test(h)) notes.push('Duplicates the standing trigger watchlist, which migrates to WATCHLIST.md (D-M6E11-18).');
  if (QUALIFIED_RE.test(h)) notes.push('The heading records a partial close (a qualified done-word); the parser verdict was adopted.');
  QUALIFIED_RE.lastIndex = 0;
  if (/\bSCOPED\b/.test(h)) notes.push('SCOPED — the heading records a scoping outcome, not the work itself.');
  if (/\bSPLIT\b/.test(h)) notes.push('SPLIT — the heading records a split outcome (part abandoned, part parked).');
  else if (row.discharged && /\babandoned\b/i.test(h) && /\bparked\b/i.test(h)) {
    notes.push('Part abandoned, part parked — the parked part may still be live.');
  }
  if (row.discharged && /\bIN FLIGHT\b/.test(h)) notes.push('The heading is struck AND says IN FLIGHT — closed by the parser, possibly still open.');
  if (KEPT_RE.test(h)) notes.push('KEPT — the work moved elsewhere but the row was kept open on purpose.');
  if (row.leadingId && siblings.byId.get(row.leadingId) > 1) {
    notes.push(`One of ${siblings.byId.get(row.leadingId)} rows led by ${row.leadingId} — possible duplicates.`);
  }
  if (siblings.byBase.get(baseTitle(h)) > 1) notes.push('Another row carries the same title — a struck/live duplicate pair.');
  return notes;
}

// ── The run ─────────────────────────────────────────────────────────────────

// The v1 folder, relative to `.planning/`, a planned item with this status
// would sit in (the status→folder rule, D-M6E11-8). Moved here from
// `work-store.js` at M6.E13 t7.4: the plan is its last reader. A plan has no
// Epics, so Q and P never occur.
function folderFor(item) {
  switch (item.status) {
    case 'N':
      return `${WORK_DIR}/${FOLDERS.inbox}`;
    case 'T':
      return `${WORK_DIR}/${FOLDERS.backlog}`;
    case 'C':
      return `${WORK_DIR}/${FOLDERS.done}/${String(item.close.at).slice(0, 7)}`;
    default:
      throw new WorkStoreError('SCHEMA', `no folder for status ${JSON.stringify(item.status)}`);
  }
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Map the four sources to items. Pure: texts in, plan out. A missing source is
 * an empty one.
 *
 * @param {Partial<Record<'BUGS.md'|'BACKLOG.md'|'ISSUES-INBOX.md'|'OPEN-QUESTIONS.md', string>>} texts
 * @param {{key?: string, today?: string}} [opts]
 * @returns {{items: Array<{item: object, body: string, dir: string, sourceRef: {file: string, line: number, endLine: number, text: string}}>,
 *   orphans: Array<object>, gaps: Array<object>, watchlist: object|null, counts: object, notes: Array<object>,
 *   unmatchedExplicitNotes: Array<object>}}
 *   `orphans` and `gaps` carry `source`, so rows + orphans + gaps (+ the
 *   watchlist) tile every source file — the lossless check (AC-9.4).
 */
export function planMigrationFromTexts(texts, opts = {}) {
  const key = opts.key ?? 'SIG';
  const today = opts.today ?? isoToday();
  const segs = {
    'BUGS.md': segmentBugs(texts['BUGS.md'] ?? ''),
    'BACKLOG.md': segmentBacklog(texts['BACKLOG.md'] ?? ''),
    'ISSUES-INBOX.md': segmentInbox(texts['ISSUES-INBOX.md'] ?? ''),
    'OPEN-QUESTIONS.md': segmentQuestions(texts['OPEN-QUESTIONS.md'] ?? ''),
  };
  // An empty source is a one-line empty file; it has no orphans worth naming.
  const orphans = SOURCES.flatMap((s) => (texts[s] ? segs[s].orphans.map((o) => ({ source: s, ...o })) : []));
  const gaps = SOURCES.flatMap((s) => (texts[s] ? segs[s].gaps.map((g) => ({ source: s, ...g })) : []));
  const explicitUsed = new Set();
  const explicitFor = (source, title) => {
    const hits = EXPLICIT_NOTES.filter((e) => e.source === source && title.includes(e.match));
    hits.forEach((e) => explicitUsed.add(e));
    return hits.map((e) => e.note);
  };

  const planned = []; // {n, item, row}
  const idOf = (n) => `${key}-${n}`;

  // 1. Bugs. Numbered rows keep n; un-numbered take max+1… in file order.
  const bugRows = segs['BUGS.md'].rows;
  const seen = new Map();
  for (const r of bugRows.filter((r) => r.kind === 'table')) {
    if (seen.has(r.n)) throw new WorkStoreError('CONFLICT', `BUGS.md:${r.line}: ${r.id} also at line ${seen.get(r.n)}`);
    seen.set(r.n, r.line);
  }
  let next = Math.max(0, ...seen.keys()) + 1;
  const bugNumbers = new Set(seen.keys());
  for (const r of bugRows) {
    const n = r.kind === 'table' ? r.n : next++;
    const id = idOf(n);
    const notes = [];
    let map;
    let title;
    if (r.kind === 'table') {
      const st = r.statusRaw.replace(/\([^)]*\)/g, ' ').replace(/[`*_]/g, '').trim().toLowerCase();
      map = TABLE_STATUS[st];
      if (!map) throw new WorkStoreError('SCHEMA', `BUGS.md:${r.line}: ${r.id} has status cell ${JSON.stringify(r.statusRaw)} — not one of ${Object.keys(TABLE_STATUS).join(', ')}`);
      title = bugTitle(r.summary);
    } else {
      const word = (r.statusRaw.match(/^[a-z-]+/) ?? [''])[0];
      map = ENTRY_STATUS[word];
      if (!map) throw new WorkStoreError('SCHEMA', `BUGS.md:${r.line}: entry "${r.heading}" has status ${JSON.stringify(r.statusRaw)} — no mapping for it`);
      title = clip(r.heading);
    }
    const item = { id, type: 'BUG', status: map.status, title };
    const pri = r.priority ? stripMd(r.priority) : '';
    if (pri && pri !== '—' && pri !== '-') item.priority = pri;
    item.source = 'migration:BUGS.md';
    item.source_ref = `BUGS.md:${r.line}`;
    if (map.status === 'C') {
      let extra = {};
      let reason = map.reason;
      if (reason === 'dup') {
        const target = (r.heading.match(/\bB(\d+)\b/) ?? [])[1];
        if (target && bugNumbers.has(Number(target))) extra = { dup_of: idOf(Number(target)) };
        else {
          reason = 'rejected';
          notes.push(`Withdrawn as a duplicate, but its target (${target ? `B${target}` : 'unnamed'}) is not a bug in this file — closed as rejected.`);
        }
      }
      item.close = closeRecord(reason, today, extra);
    }
    item.legacy_id = r.kind === 'table' ? r.id : `BUGS.md:${r.line}`;
    // Explicit notes key on an entry's heading only: a table row's summary can
    // quote the very headline the note is about (B112's does).
    if (r.kind === 'entry') notes.push(...explicitFor('BUGS.md', r.heading));
    if (notes.length) item.migration_note = notes.join(' ');
    planned.push({ n, item, row: r });
  }

  // 2. Backlog rows, in file order. Resolution of a named destination needs
  //    every row's id first, so ids are assigned before statuses.
  const blRows = segs['BACKLOG.md'].rows;
  const blIds = blRows.map(() => idOf(next++));
  const byLeading = new Map();
  blRows.forEach((r, k) => {
    if (!r.leadingId) return;
    byLeading.set(r.leadingId, byLeading.has(r.leadingId) ? null : blIds[k]); // null = ambiguous
  });
  const siblings = {
    byId: new Map(),
    byBase: new Map(),
  };
  for (const r of blRows) {
    if (r.leadingId) siblings.byId.set(r.leadingId, (siblings.byId.get(r.leadingId) ?? 0) + 1);
    const b = baseTitle(r.heading);
    siblings.byBase.set(b, (siblings.byBase.get(b) ?? 0) + 1);
  }
  const resolveTarget = (token) => {
    if (!token) return null;
    if (/^B\d+$/.test(token) && bugNumbers.has(Number(token.slice(1)))) return idOf(Number(token.slice(1)));
    return byLeading.get(token) ?? null;
  };
  const targetAfter = (text, re) => {
    const m = text.match(re);
    if (!m) return null;
    const t = text.slice(m.index + m[0].length).match(TARGET_TOKEN_RE);
    return t ? (t[1] ?? t[2]) : null;
  };

  blRows.forEach((r, k) => {
    const id = blIds[k];
    const tag = backlogTag(r);
    const item = { id, type: TAG_TYPES[tag] ?? 'FEAT', status: 'T', title: r.heading };
    item.source = 'migration:BACKLOG.md';
    item.source_ref = `BACKLOG.md:${r.line}`;
    const notes = backlogRuleNotes(r, siblings);
    const h = r.heading;
    const kept = KEPT_RE.test(h);
    const unqualified = h.replace(QUALIFIED_RE, ' ');
    let close = null;
    if (!kept && FOLD_RE.test(h)) {
      // D-M6E11-16: the work lives elsewhere → dup of the destination, when
      // the destination is an item; otherwise closed with the place named.
      const token = targetAfter(h, FOLD_RE);
      const dup = resolveTarget(token);
      if (dup && dup !== id) close = closeRecord('dup', today, { dup_of: dup });
      else {
        close = closeRecord('fixed', today);
        notes.push(`The heading says the work was folded/absorbed into ${token ?? 'somewhere unnamed'}, which is not an item — closed as fixed.`);
      }
    } else if (r.discharged) {
      if (SUPERSEDED_RE.test(h)) {
        const token = targetAfter(h, SUPERSEDED_RE);
        const dup = resolveTarget(token);
        if (dup && dup !== id) close = closeRecord('dup', today, { dup_of: dup });
        else {
          close = closeRecord('fixed', today);
          notes.push(`SUPERSEDED by ${token ? `\`${token}\`` : 'something unnamed'}, which is not an item — closed as fixed.`);
        }
      } else {
        // Only WHICH word closed the row; the verdict itself came from parseBacklogRows.
        const word = (unqualified.match(DONE_WORD_RE) ?? [])[1]?.toUpperCase();
        close = closeRecord(word === 'ABANDONED' || word === 'CUT' ? 'wontdo' : 'fixed', today);
      }
    }
    if (close) {
      item.status = 'C';
      item.close = close;
    }
    item.legacy_id = `BACKLOG.md:${r.line}`;
    notes.push(...explicitFor('BACKLOG.md', h));
    if (notes.length) item.migration_note = notes.join(' ');
    planned.push({ n: Number(id.slice(key.length + 1)), item, row: r });
  });

  // 3. Inbox captures. `→ Deferred` means not yet triaged (D-M6E11-16).
  for (const r of segs['ISSUES-INBOX.md'].rows) {
    const n = next++;
    const item = {
      id: idOf(n),
      type: 'NEW',
      status: 'N',
      title: r.heading,
      source: 'migration:ISSUES-INBOX.md',
      source_ref: `ISSUES-INBOX.md:${r.line}`,
      legacy_id: `ISSUES-INBOX.md:${r.line}`,
    };
    planned.push({ n, item, row: r });
  }

  // 4. Questions. Open → T (they were accepted into the list); answered → C.
  for (const r of segs['OPEN-QUESTIONS.md'].rows) {
    const n = next++;
    const item = { id: idOf(n), type: 'Q', status: r.answered ? 'C' : 'T', title: r.heading };
    item.source = 'migration:OPEN-QUESTIONS.md';
    item.source_ref = `OPEN-QUESTIONS.md:${r.line}`;
    if (r.answered) item.close = closeRecord('fixed', today);
    item.legacy_id = `OPEN-QUESTIONS.md:${r.line}`;
    planned.push({ n, item, row: r });
  }

  planned.sort((a, b) => a.n - b.n);
  const items = planned.map(({ item, row }) => {
    const errors = validateItem(item);
    if (errors.length) throw new WorkStoreError('SCHEMA', `${item.id} (${row.source}:${row.line}): ${errors.join('; ')}`);
    const dir = folderFor(item);
    return {
      item,
      body: rewriteRelativeLinks(row.text, '', dir),
      dir,
      sourceRef: { file: row.source, line: row.line, endLine: row.endLine, text: row.text },
    };
  });

  const wl = segs['ISSUES-INBOX.md'].watchlist;
  const watchlist = wl
    ? { text: rewriteRelativeLinks(wl.text, '', 'work'), dir: 'work', sourceRef: { file: 'ISSUES-INBOX.md', line: wl.line, endLine: wl.endLine, text: wl.text } }
    : null;

  const counts = { bySource: {}, byStatus: {}, byOutcome: {}, total: items.length };
  for (const s of SOURCES) counts.bySource[s] = segs[s].rows.length;
  for (const { item } of items) {
    counts.byStatus[item.status] = (counts.byStatus[item.status] ?? 0) + 1;
    const outcome = item.status === 'C' ? `C ${item.close.reason}` : item.status;
    counts.byOutcome[outcome] = (counts.byOutcome[outcome] ?? 0) + 1;
  }

  const notes = items
    .filter((i) => i.item.migration_note)
    .map((i) => ({ id: i.item.id, legacy_id: i.item.legacy_id, note: i.item.migration_note }));
  const unmatchedExplicitNotes = EXPLICIT_NOTES.filter((e) => texts[e.source] && !explicitUsed.has(e)).map((e) => ({
    source: e.source,
    match: e.match,
  }));

  return { items, orphans, gaps, watchlist, counts, notes, unmatchedExplicitNotes };
}

/**
 * The dry run over a project's four files. Reads only.
 *
 * @param {string} baseDir — project root
 * @param {{key?: string, today?: string}} [opts]
 */
export function planMigration(baseDir, opts = {}) {
  const texts = {};
  for (const s of SOURCES) {
    const p = join(baseDir, '.planning', s);
    if (existsSync(p)) texts[s] = readFileSync(p, 'utf-8');
  }
  return planMigrationFromTexts(texts, opts);
}
