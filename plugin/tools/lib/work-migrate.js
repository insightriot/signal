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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseBacklogRows } from './backlog.js';
import { walkBugEntries } from './bugs-tally.js';
import { parseEntries } from './drain.js';
import { validateItem, WorkStoreError } from './work-item.js';
import { rewriteRelativeLinks } from './work-links.js';

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

// Folder for a status, relative to `.planning/`. `C` lands in the month of its
// close date (`D-M6E11-12`).
export function folderFor(item) {
  if (item.status === 'N') return 'work/inbox';
  if (item.status === 'T') return 'work/backlog';
  if (item.status === 'C') return `work/done/${String(item.close.at).slice(0, 7)}`;
  throw new WorkStoreError('SCHEMA', `${item.id}: status ${item.status} has no migration folder (Q and P live in an Epic folder)`);
}

// ── Titles ───────────────────────────────────────────────────────────────────

const stripMd = (s) => s.replace(/\*\*/g, '').replace(/~~/g, '').trim();

function clip(s, max = TITLE_MAX) {
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

function bugTitle(summary) {
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
// Same shape as backlog.js's DONE_WORD_RE, used only to read WHICH word closed
// the row (the verdict itself comes from parseBacklogRows).
const BOLD_DONE_WORD_RE = /\*\*[^*]{0,80}?\b(DONE|SHIPPED|ABANDONED|CLOSED|CUT|RESOLVED)\b/i;
const SUPERSEDED_RE = /\bSUPERSEDED\b/;
const FOLD_RE = /\b(?:FOLDED INTO|absorbed into)\b/;
const KEPT_RE = /\bKEPT\b/i;
const TARGET_TOKEN_RE = /\b(M\d+(?:\.\d+)?\.E\d+|B\d+)\b|`([^`]+)`/;

const TAG_TYPES = {
  roadmap: 'FEAT',
  hygiene: 'CHORE',
  verification: 'CHORE',
  'product call': 'Q',
  'fix lane': 'BUG',
};
const HEADING_TAG_RE = /\*\*(roadmap|hygiene|verification|product call|fix lane)\*\*/i;
const BODY_TAG_RE = /^\*\*Tag:\*\*\s*([a-z][a-z ]*?)(?=\s*(?:·|\(|$))/im;

function backlogTag(row) {
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
 *   orphans: Array<object>, watchlist: object|null, counts: object, notes: Array<object>, unmatchedExplicitNotes: Array<object>}}
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
        const word = (unqualified.match(BOLD_DONE_WORD_RE) ?? [])[1]?.toUpperCase();
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

  return { items, orphans, watchlist, counts, notes, unmatchedExplicitNotes };
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
