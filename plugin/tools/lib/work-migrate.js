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
// Nothing here writes. `planMigration` is the dry run; the apply step is S7.
//
// ── Which lines are entries: the SHIPPED readers decide, not this module ────
//
// A second definition of "which lines are rows" that agrees with the reader
// only by construction is `B82`'s shape. So BUGS rows are found with
// `walkBugEntries`, BACKLOG rows with `parseBacklogRows({maxDepth: 4})`, inbox
// entries with `parseEntries`. This module adds only what the readers do not
// need to know: where each row ENDS, and what the text between rows is.

import { parseBacklogRows } from './backlog.js';
import { walkBugEntries } from './bugs-tally.js';
import { parseEntries } from './drain.js';
import { WorkStoreError } from './work-item.js';

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
    if (rows.some((r) => r.kind === 'entry' && r.line === h)) {
      throw new WorkStoreError('SCHEMA', `BUGS.md:${h}: an entry carries two **Status:** lines (second at line ${e.line})`);
    }
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
      heading: lines[h - 1].replace(H2_RE, '').trim(),
      statusRaw: lines[e.line - 1].match(ENTRY_STATUS_RE)[1].trim(),
      priority: null,
      summary: null,
    });
  }

  // Every `## ` heading must be an entry: a heading with no status line is a
  // shape this segmenter does not know, and it must not become orphan text
  // without anyone noticing.
  lines.forEach((l, i) => {
    if (!inFence[i] && H2_RE.test(l) && !rows.some((r) => r.kind === 'entry' && r.line === i + 1)) {
      throw new WorkStoreError('SCHEMA', `BUGS.md:${i + 1}: \`## \` heading with no **Status:** line — not a bug entry this migration can read`);
    }
  });

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

function lineOfOffset(text, offset) {
  let n = 1;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * @param {string} text — ISSUES-INBOX.md content
 */
export function segmentInbox(text) {
  const src = String(text);
  const lines = src.split('\n');
  const rows = [];
  let watchlist = null;
  for (const e of parseEntries(src)) {
    const start = lineOfOffset(src, e.range.start);
    // `range.end` is the first byte of the next heading line (or EOF).
    const endExclusive = e.range.end >= src.length ? lines.length + 1 : lineOfOffset(src, e.range.end);
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

const ANSWERED_RE = /~~[^~]+~~.*\bANSWERED\b/;

/**
 * @param {string} text — OPEN-QUESTIONS.md content
 */
export function segmentQuestions(text) {
  const lines = String(text).split('\n');
  const heads = [];
  let fence = false;
  const topSep = new Set();
  lines.forEach((l, i) => {
    if (isFence(l)) {
      fence = !fence;
      return;
    }
    if (fence) return;
    if (H2_RE.test(l)) heads.push(i + 1);
    if (l.trim() === '---') topSep.add(i + 1);
  });

  const rows = heads.map((h, k) => {
    const limit = k + 1 < heads.length ? heads[k + 1] - 1 : lines.length;
    let end = h;
    while (end < limit && !topSep.has(end + 1)) end++;
    end = trimRowEnd(lines, h, end);
    const heading = lines[h - 1].replace(H2_RE, '').trim();
    return {
      source: 'OPEN-QUESTIONS.md',
      kind: 'question',
      line: h,
      endLine: end,
      text: sliceLines(lines, h, end),
      heading,
      answered: ANSWERED_RE.test(heading),
    };
  });
  const { orphans, gaps } = tile(lines, rows, (core, ctx) => (ctx.first ? 'preamble' : `note: ${nameFromFirstLine(core.text, 40)}`));
  return { rows, orphans, gaps };
}
