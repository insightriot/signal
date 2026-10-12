// The v2 views (M6.E13.S3.t3.1, AC6.1, AC6.2) — generated from records.
//
// With a v2 store, `BUGS.md`, `BACKLOG.md`, `ISSUES-INBOX.md`,
// `OPEN-QUESTIONS.md`, `work/EPICS.md` and `work/history/YYYY.md` are views
// of the records under `.planning/work/items/`, regenerated after every write
// (`work-records.js` calls `regenerateViews` by default). They are for people:
// the v2 readers read records (S4), so nothing here is shaped for a parser,
// and nothing here ever reads a view back.
//
// Where an item is listed — a partition, so each item is in exactly one list:
//
//   BUGS.md          type BUG
//   OPEN-QUESTIONS   type Q
//   ISSUES-INBOX.md  neither, status N (after the standing watchlist, verbatim)
//   BACKLOG.md       neither, any other status: T, Q, P, closing, closed —
//                    so a closing or closed item is here even when it was
//                    closed straight from N
//
// Each list shows open items, *closing* items, and items whose last `closed`
// event is within 30 days before the NEWEST event `at` in the whole store
// (inclusive; PLAN Decision 5). Older closes are in `work/history/YYYY.md`, by
// the year of that `closed` event (Decision 6). The window is counted from the
// store, never from the clock, so the same records always give the same bytes.
//
// IDs are SIG-n only (AC6.1): a record's `legacy_id` is never printed.
//
// With unit records (`.planning/work/units/` exists; M6.E16 S5) two views are
// of the UNIT records: `work/EPICS.md` lists every unit with its folded state,
// and the current milestone file's Epic table is written between its
// `signal:epics` markers (`milestone-table.js`) — the one view that is a
// region of a person's file, not a whole generated file. Without unit records
// `EPICS.md` is the Epic-folder view it was and no milestone file is touched.
//
// Import graph (PLAN Decision 12): nothing here may reach a Markdown list
// parser, so `work-generate.js`, `backlog.js` and `bugs-tally.js` are not
// imported; the small text helpers below are this module's own.

import { existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { epicMarkers, renderEpicTable, upsertEpicTable } from './milestone-table.js';
import { assertRealInsidePlanning, linkedComponent, readRegularFile, regularFileRefusal } from './path-confine.js';
import { cut, printable } from './printable-text.js';
import { compareEpicIds, EPIC_ID_STRICT_RE, parseFrontmatter, PLANNING_DIR, StateSchemaError } from './state.js';
import { compareUnitIds, epicIdParts } from './unit-record.js';
// A cycle, by design: unit-records.js regenerates the views after a write.
// Neither module uses the other's bindings while it is being evaluated.
import { hasUnitsSafe, listUnits, UNITS_REL } from './unit-records.js';
import { asWorkStoreError, WorkStoreError } from './work-errors.js';
import { bodyDirFor } from './work-convert.js';
import { rewriteRelativeLinks } from './work-links.js';
import { formatInboxStatusLine, GENERATED_MARKER, isGeneratedFile } from './work-marker.js';
import { deriveStatus, epicOf } from './work-record.js';
import { listRecords, storeVersion, V1_STORE_MESSAGE } from './work-records.js';

/** The four lists and the Epic index, repo-root-relative. History files are added per year. */
export const VIEW_PATHS = Object.freeze({
  bugs: '.planning/BUGS.md',
  backlog: '.planning/BACKLOG.md',
  inbox: '.planning/ISSUES-INBOX.md',
  questions: '.planning/OPEN-QUESTIONS.md',
  epics: '.planning/work/EPICS.md',
});
const HISTORY_DIR = '.planning/work/history';
const WATCHLIST_REL = '.planning/work/WATCHLIST.md';

/** How far back from the newest event a close stays in its list. */
export const RECENT_CLOSE_DAYS = 30;
const DAY_MS = 86_400_000;

// Folder (relative to `.planning/`) each view sits in, for link rewriting.
const PLANNING_DEPTH = '';
const HISTORY_DEPTH = 'work/history';

const numberOf = (id) => Number(id.slice(id.lastIndexOf('-') + 1));
const byNumber = (a, b) => numberOf(a.id) - numberOf(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

// ── Text helpers ─────────────────────────────────────────────────────────────

const isFence = (line) => /^\s*(```|~~~)/.test(line);
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

// A body's first line is often its old heading; the view prints its own.
function withoutLeadingHeading(body) {
  const lines = body.split('\n');
  if (lines.length && HEADING_RE.test(lines[0])) {
    lines.shift();
    while (lines.length && lines[0].trim() === '') lines.shift();
  }
  return lines.join('\n').trimEnd();
}

// Headings inside a body become bold, so nothing nests under a generated
// heading. With `fencedToo`, a heading-shaped line in a fence is indented one
// space as well (OPEN-QUESTIONS, read by a fence-blind `## ` counter).
function demoteHeadings(text, { fencedToo = false } = {}) {
  let fence = false;
  return text
    .split('\n')
    .map((line) => {
      if (isFence(line)) {
        fence = !fence;
        return line;
      }
      const m = line.match(HEADING_RE);
      if (!m) return line;
      if (fence) return fencedToo ? ` ${line}` : line;
      return `**${m[2].trim()}**`;
    })
    .join('\n');
}

// One table cell: line breaks become a space, an unescaped `|` is escaped
// (an already-escaped one is kept — migrated summaries came from a table).
const cell = (v) => String(v).replace(/\s*[\r\n]+\s*/g, ' ').replace(/(?<!\\)\|/g, '\\|');
const oneLine = (v) => String(v).replace(/\s+/g, ' ').trim();

// ── Each record, as the views see it ────────────────────────────────────────

function lastClose(record) {
  return record.events.findLast((e) => e.type === 'closed');
}

// {id, record, body, status, epic, closedAt?, reason?}. Status and Epic are
// folded here from the events, so a broken history throws (never guessed).
function view(entry) {
  const record = entry.record;
  const out = { id: record.id, record, body: entry.body ?? null, status: deriveStatus(record), epic: epicOf(record) };
  if (out.status === 'C') {
    const c = lastClose(record);
    out.closedAt = c.at;
    out.reason = c.reason;
  }
  return out;
}

const time = (at) => Date.parse(at);

function newestAt(items) {
  let newest = -Infinity;
  for (const it of items) for (const e of it.record.events) newest = Math.max(newest, time(e.at));
  return newest;
}

function home(it) {
  if (it.record.type === 'BUG') return 'bugs';
  if (it.record.type === 'Q') return 'questions';
  return it.status === 'N' ? 'inbox' : 'backlog';
}

// The body as it reads from a `.planning/`-level view.
const bodyAt = (it, toDir) => (it.body ? rewriteRelativeLinks(it.body, bodyDirFor(it.id), toDir) : '');

const STATUS_WORD = { N: 'needs-triage', T: 'confirmed', Q: 'confirmed', P: 'confirmed', closing: 'closing' };
const statusWord = (it) => (it.status === 'C' ? it.reason : STATUS_WORD[it.status]);
const titleOf = (it) => oneLine(it.record.title ?? it.id);

// ── BUGS.md ─────────────────────────────────────────────────────────────────

// A body that opens with a bold headline (a migrated BUGS.md row's text) gives
// its first paragraph — the row, without the notes added under it (SIG-52,
// SIG-99) — as the summary. Anything else is summarised by its title: a bug
// filed in the store has a prose body with no headline, and its first
// paragraph would drop the title the v1 view showed (M6.E13 t7.1b R1).
function bugSummary(it) {
  const first = bodyAt(it, PLANNING_DEPTH).trim().split(/\n\s*\n/)[0].trim();
  if (first.startsWith('**') && !first.split('\n').some((l) => HEADING_RE.test(l) || isFence(l))) {
    return cell(first);
  }
  return `**${cell(titleOf(it))}**`;
}

/**
 * The tally line `BUGS.md` publishes, over every BUG record (closes outside the
 * window included). Exported for `published-facts.js` (M6.E13 t4.5a), which
 * checks the view carries the line its records derive.
 *
 * @param {Array<{status: string}>} allBugs — BUG records with their folded status
 * @returns {string}
 */
export function renderBugTally(allBugs) {
  const n = (pred) => allBugs.filter(pred).length;
  return `*${n((b) => b.status === 'N')} needs-triage · ${n((b) => ['T', 'Q', 'P'].includes(b.status))} confirmed · `
    + `${n((b) => b.status === 'closing')} closing · ${n((b) => b.status === 'C')} closed (${allBugs.length} total) · `
    + `closes more than ${RECENT_CLOSE_DAYS} days before the newest event are in \`work/history/\`*`;
}

function renderBugs(listed, allBugs) {
  const rows = listed.map((it) => `| ${it.id} | \`${statusWord(it)}\` | ${cell(it.record.priority ?? '—')} | ${bugSummary(it)} |`);
  const tally = renderBugTally(allBugs);
  return [GENERATED_MARKER, '# Bugs', '', '| ID | Status | Pri | Summary |', '|---|---|---|---|', ...rows, '', tally, ''].join('\n');
}

// ── BACKLOG.md ──────────────────────────────────────────────────────────────

function backlogStatusLine(it) {
  if (it.status === 'T') return '**Status:** triaged (T)';
  if (it.status === 'Q') return `**Status:** queued for ${it.epic} (Q)`;
  if (it.status === 'P') return `**Status:** in progress in ${it.epic} (P)`;
  if (it.status === 'closing') return '**Status:** closing — a fixed close waiting for its commit on the default branch';
  return `**Status:** closed ${String(it.closedAt).slice(0, 10)} (${it.reason})`;
}

function renderBacklog(listed) {
  const blocks = listed.map((it) => {
    let heading = `### ${titleOf(it)} · ${it.id}`;
    if (it.status === 'closing') heading += ' · closing';
    if (it.status === 'C') heading += ` · closed (${it.reason})`;
    const body = demoteHeadings(withoutLeadingHeading(bodyAt(it, PLANNING_DEPTH)));
    return [heading, '', backlogStatusLine(it), ...(body ? ['', body] : [])].join('\n');
  });
  return [GENERATED_MARKER, '# Backlog', '', ...blocks.map((b) => `${b}\n`)].join('\n');
}

// ── ISSUES-INBOX.md ─────────────────────────────────────────────────────────

function renderInbox(listed, watchlistText) {
  const parts = [GENERATED_MARKER, '# Issues Inbox', ''];
  if (typeof watchlistText === 'string' && watchlistText.trim() !== '') {
    parts.push(rewriteRelativeLinks(watchlistText, 'work', PLANNING_DEPTH).trimEnd(), '', '---', '');
  }
  for (const it of listed) {
    const body = demoteHeadings(withoutLeadingHeading(bodyAt(it, PLANNING_DEPTH)));
    parts.push(`## ${titleOf(it)}`, '', formatInboxStatusLine(it.record), '');
    if (body) parts.push(body, '');
    parts.push('---', '');
  }
  return parts.join('\n');
}

// ── OPEN-QUESTIONS.md ───────────────────────────────────────────────────────

function renderQuestions(listed) {
  const parts = [GENERATED_MARKER, '# Open Questions', ''];
  for (const it of listed) {
    let heading = `## ${titleOf(it)}`;
    if (it.status === 'closing') heading += ' · closing';
    if (it.status === 'C') heading += ` · closed (${it.reason})`;
    const body = demoteHeadings(withoutLeadingHeading(bodyAt(it, PLANNING_DEPTH)), { fencedToo: true });
    parts.push(heading, '', `**Item:** ${it.id}`, '');
    if (body) parts.push(body, '');
    parts.push('---', '');
  }
  return parts.join('\n');
}

// ── work/history/YYYY.md ────────────────────────────────────────────────────

function renderHistory(year, closes) {
  const rows = closes.map((it) => {
    const id = it.body ? `[${it.id}](${posix.relative(HISTORY_DEPTH, `${bodyDirFor(it.id)}/${it.id}.md`)})` : it.id;
    return `| ${id} | ${it.record.type} | ${String(it.closedAt).slice(0, 10)} | ${cell(it.reason)} | ${cell(titleOf(it))} |`;
  });
  return [
    GENERATED_MARKER,
    `# Closed in ${year}`,
    '',
    `Items closed in ${year}, more than ${RECENT_CLOSE_DAYS} days before the newest event in the store.`,
    '',
    '| ID | Type | Closed | Reason | Title |',
    '|---|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
}

// ── work/EPICS.md ───────────────────────────────────────────────────────────

function closeLine(close) {
  if (!close || typeof close !== 'object') return 'closed (no close record in its README.md)';
  const parts = [`closed ${String(close.at ?? 'at an unrecorded time').slice(0, 10)}`];
  if (close.pr !== undefined && close.pr !== null) parts.push(`PR ${close.pr}`);
  if (close.release !== undefined && close.release !== null) parts.push(String(close.release));
  if (close.by !== undefined && close.by !== null) parts.push(`by ${close.by}`);
  return parts.join(' · ');
}

// Every Epic with a folder, plus every Epic an item's events name. Open
// (or folder-less) first, then archived; natural ID order in each.
function renderEpics(items, epics) {
  const known = new Map(epics.map((e) => [e.id, e]));
  for (const it of items) if (it.epic && !known.has(it.epic)) known.set(it.epic, { id: it.epic, archived: false, noFolder: true });
  const sorted = [...known.values()].sort((a, b) => Number(a.archived) - Number(b.archived) || compareEpicIds(a.id, b.id));
  const parts = [GENERATED_MARKER, '# Epics', ''];
  if (sorted.length === 0) parts.push('_no Epics_', '');
  for (const epic of sorted) {
    const state = epic.noFolder ? 'no Epic folder' : epic.archived ? closeLine(epic.close) : 'open';
    parts.push(`## ${epic.id} — ${state}`, '');
    const mine = items.filter((it) => it.epic === epic.id);
    if (mine.length === 0) parts.push('_no items_');
    for (const it of mine) parts.push(`- ${it.id} · ${it.record.type} · ${it.status} — ${titleOf(it)}`);
    parts.push('');
  }
  return parts.join('\n');
}

// ── work/EPICS.md, from unit records (M6.E16 t5.1, AC7.1) ───────────────────

// The most of an old row's status cell a heading prints. The longest real one
// in this repository is 130 characters.
const LEGACY_STATUS_MAX = 200;

// What a legacy unit's old milestone row said in its status cell (the second
// cell: Epic, Status, Summary), as one printable line cut at
// `LEGACY_STATUS_MAX` — or null when there is no such text. The cell is text a
// person wrote in another file, kept as recorded; it is not trusted here.
function legacyStatus(record) {
  const said = Array.isArray(record?.legacy_row) ? record.legacy_row[1] : null;
  if (typeof said !== 'string') return null;
  // Line breaks become a space before the control characters go, so no two words run together.
  return cut(oneLine(printable(oneLine(said))), LEGACY_STATUS_MAX) || null;
}

// A unit's close as its heading says it: the date and the reason, then the PR
// and the release when recorded, then the words (a dropped close has them).
//
// A legacy close prints no date: the one it carries is the day the record was
// written, not the day the unit shipped (as `milestone-table.js` `statusText`).
// It prints the old row's status words instead, which carry the real date and
// release, and the close's own words only when there is no old row.
function unitCloseLine(close, record) {
  const legacy = close.reason === 'legacy';
  const parts = [legacy ? 'closed (legacy)' : `closed ${String(close.at).slice(0, 10)} (${close.reason})`];
  if (close.pr) parts.push(`PR ${oneLine(close.pr)}`);
  if (close.release) parts.push(oneLine(close.release));
  const said = legacy ? legacyStatus(record) : null;
  if (said !== null) return `${parts.join(' · ')} — old row: ${said}`;
  return parts.join(' · ') + (close.words ? ` — ${oneLine(close.words)}` : '');
}

function unitStateLine(unit) {
  let state = 'open';
  if (unit.status === 'closing') state = `closing · proof ${unit.closing_proof}`;
  if (unit.status === 'closed') state = unitCloseLine(unit.close, unit.record);
  return unit.held ? `${state} · held: ${oneLine(unit.hold_reason)}` : state;
}

// With unit records: EVERY unit record, with its folded state. Three sections
// — open (a requested close reads closing, with its proof), held (closed, and
// held), closed (newest first) — then any unit an item's events name that has
// no record, said as that. Under each, its items. A section with nothing in
// it is not printed. The Epic folders are not read on this path.
function renderEpicsFromUnits(items, units) {
  const byUnitId = (a, b) => compareUnitIds(a.id, b.id);
  const open = units.filter((u) => u.status !== 'closed').sort(byUnitId);
  const held = units.filter((u) => u.status === 'closed' && u.held).sort(byUnitId);
  const closed = units
    .filter((u) => u.status === 'closed' && !u.held)
    .sort((a, b) => time(b.close.at) - time(a.close.at) || byUnitId(a, b));
  const recorded = new Set(units.map((u) => u.id));
  const unrecorded = [...new Set(items.map((it) => it.epic).filter((id) => id && !recorded.has(id)))].sort(compareUnitIds);

  const parts = [GENERATED_MARKER, '# Epics', ''];
  const itemsOf = (id) => {
    const mine = items.filter((it) => it.epic === id);
    if (mine.length === 0) parts.push('_no items_');
    for (const it of mine) parts.push(`- ${it.id} · ${it.record.type} · ${it.status} — ${titleOf(it)}`);
    parts.push('');
  };
  const section = (title, list) => {
    if (list.length === 0) return;
    parts.push(`## ${title}`, '');
    for (const unit of list) {
      parts.push(`### ${unit.id} — ${unitStateLine(unit)}`, '');
      itemsOf(unit.id);
    }
  };
  if (units.length === 0 && unrecorded.length === 0) parts.push('_no Epics_', '');
  section('Open', open);
  section('Held', held);
  section('Closed', closed);
  if (unrecorded.length > 0) {
    parts.push('## No unit record', '', `Named by an item, with no record under \`${UNITS_REL}/\`.`, '');
    for (const id of unrecorded) {
      parts.push(`### ${id}`, '');
      itemsOf(id);
    }
  }
  return parts.join('\n');
}

// ── renderViews ─────────────────────────────────────────────────────────────

/**
 * Render every view from records. Pure and synchronous: no file is read, the
 * clock is not read, and the same records in any order give the same bytes.
 *
 * @param {Array<{record: object, body?: string|null}>} records — `listRecords`
 *   entries (with `{bodies: true}` for bodies); status and Epic are folded here
 * @param {{watchlistText?: string|null, epics?: Array<{id: string, archived: boolean, close?: object|null}>,
 *   units?: Array<{id: string, status: string, held: boolean, hold_reason: string|null, close: object|null, closing_proof: string|null}>}} [opts]
 *   `watchlistText`: `work/WATCHLIST.md`, printed first in the inbox;
 *   `epics`: the Epic folders, live and archived (`readEpicFolders`);
 *   `units`: the unit records (`listUnits(...).units`) — when passed, even
 *   empty, `EPICS.md` is rendered from them and `epics` is not used (M6.E16 t5.1)
 * @returns {Record<string, string>} repo-root-relative path → text: the five
 *   views, and `work/history/YYYY.md` for each year with a close outside the window
 * @throws {WorkStoreError} SCHEMA when a record's events do not fold
 */
export function renderViews(records, opts = {}) {
  const items = records.map(view).sort(byNumber);
  const cutoff = newestAt(items) - RECENT_CLOSE_DAYS * DAY_MS;
  const lists = { bugs: [], backlog: [], inbox: [], questions: [] };
  const history = new Map();
  for (const it of items) {
    if (it.status === 'C' && time(it.closedAt) < cutoff) {
      const year = String(it.closedAt).slice(0, 4);
      if (!history.has(year)) history.set(year, []);
      history.get(year).push(it);
    } else {
      lists[home(it)].push(it);
    }
  }
  const out = {
    [VIEW_PATHS.bugs]: renderBugs(lists.bugs, items.filter((it) => it.record.type === 'BUG')),
    [VIEW_PATHS.backlog]: renderBacklog(lists.backlog),
    [VIEW_PATHS.inbox]: renderInbox(lists.inbox, opts.watchlistText ?? null),
    [VIEW_PATHS.questions]: renderQuestions(lists.questions),
    [VIEW_PATHS.epics]: Array.isArray(opts.units) ? renderEpicsFromUnits(items, opts.units) : renderEpics(items, opts.epics ?? []),
  };
  for (const year of [...history.keys()].sort()) out[`${HISTORY_DIR}/${year}.md`] = renderHistory(year, history.get(year));
  return out;
}

// ── Reading the store, and writing the views ────────────────────────────────

// Every Epic folder, live (`work/epics/`) and archived (`archive/epics/`), as
// v1 reads them: directories only, strict Epic IDs only; an archived Epic's
// close record is its README.md frontmatter `close`.
function readEpicFolders(baseDir) {
  const out = [];
  for (const [rel, archived] of [['.planning/work/epics', false], ['.planning/archive/epics', true]]) {
    let entries;
    try {
      entries = readdirSync(join(baseDir, rel), { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') continue;
      throw err;
    }
    for (const e of entries) {
      if (!e.isDirectory() || !EPIC_ID_STRICT_RE.test(e.name)) continue;
      const epic = { id: e.name, archived };
      const readmeRel = `${rel}/${e.name}/README.md`;
      // Read only as a regular, unlinked file inside the project (M6.E14 REVIEW
      // security I1): a cloned repository can ship it as a link to /dev/zero or
      // to a private file, and this read now runs before every store write.
      const refusal = archived ? regularFileRefusal(baseDir, readmeRel) : null;
      if (refusal !== null) throw new WorkStoreError('CONFLICT', `${refusal}. The views were not generated.`);
      if (archived && existsSync(join(baseDir, readmeRel))) {
        try {
          epic.close = parseFrontmatter(readRegularFile(baseDir, readmeRel)).data?.close ?? null;
        } catch (err) {
          if (!(err instanceof StateSchemaError)) throw err;
          throw new WorkStoreError('SCHEMA', `${rel}/${e.name}/README.md: its frontmatter is not valid YAML — `
            + `fix it, then re-run. (${err.message})`);
        }
      }
      out.push(epic);
    }
  }
  return out;
}

// Everything a regeneration renders: `views` (path → text), and on a project
// with unit records `milestone` (the current milestone file's Epic table,
// when that file carries the markers — its whole text is then one of the
// `views`) and `notes` (why a table was not written; never a failure).
function renderStore(baseDir) {
  const { records, broken } = listRecords(baseDir, { bodies: true });
  if (broken.length > 0) {
    const err = new WorkStoreError('SCHEMA', 'cannot generate the views — a view of part of the store would silently '
      + `drop the broken records. Fix these first:\n${broken.map((b) => `  ${b.error}`).join('\n')}`);
    err.broken = broken.map((b) => b.id ?? b.path); // as `refuseBroken`'s, so a caller can name the remedy
    throw err;
  }
  const watchlistText = readWatchlist(baseDir);
  // With unit records (`D-M6E16-16`: the folder exists) the Epic index is
  // rendered from them, and the Epic folders are not read (M6.E16 t5.1).
  if (!hasUnitsSafe(baseDir).has) {
    return { views: renderViews(records, { watchlistText, epics: readEpicFolders(baseDir) }), milestone: null, notes: [] };
  }
  const units = readUnits(baseDir);
  const views = renderViews(records, { watchlistText, units });
  const table = milestoneTable(baseDir, units);
  if (table.milestone) views[table.milestone.rel] = table.milestone.text;
  return { views, milestone: table.milestone, notes: table.notes };
}

// Every unit record, or a refusal naming each broken one — as for a broken
// item record, a view of part of the store would silently drop them.
function readUnits(baseDir) {
  const { units, broken } = listUnits(baseDir);
  if (broken.length > 0) {
    const err = new WorkStoreError('SCHEMA', 'cannot generate the views — a view of part of the store would silently '
      + `drop the broken unit records. Fix these first:\n${broken.map((b) => `  ${b.error}`).join('\n')}`);
    err.broken = broken.map((b) => b.id ?? b.path);
    throw err;
  }
  return units;
}

// ── The live milestone file's Epic table (M6.E16 t5.2, AC7.2) ───────────────

const STATE_REL = `${PLANNING_DIR}/STATE.md`;

// The milestone file of the Epic `STATE.md` names as current, or null: no
// STATE.md, no `current_epic`, or one that is not an Epic of a milestone file
// (`MILESTONE-6.md`, `MILESTONE-4.5.md`). `milestones.js` `currentMilestone`'s
// rule, read without `readState`: this runs inside every store write and in
// the synchronous store check, and must neither wait nor migrate a STATE.md.
// STATE.md is read only as a regular file; one that cannot be read or parsed
// names no milestone.
function currentMilestoneOf(baseDir) {
  let state;
  try {
    if (regularFileRefusal(baseDir, STATE_REL) !== null) return null;
    state = parseFrontmatter(readRegularFile(baseDir, STATE_REL)).data;
  } catch {
    return null;
  }
  const parts = epicIdParts(state?.current_epic);
  if (parts === null || parts.parts.length > 2) return null;
  return { milestone: parts.milestone, rel: `${PLANNING_DIR}/MILESTONE-${parts.milestone}.md` };
}

// The current milestone file with its Epic table rendered from `units`:
// `{milestone: {rel, table, text}, notes}`. Only the CURRENT milestone's file
// (`D-M6E16-12`), and only when it carries the markers. Everything else is a
// note and no write — a project that has not marked its table is unaffected:
// no file, a file that is a link or not a regular file (never read through),
// no markers. Markers that are there but broken (one missing, one repeated,
// out of order) are a refusal: the person asked for a generated table and it
// cannot be written.
function milestoneTable(baseDir, units) {
  const none = (note) => ({ milestone: null, notes: note ? [note] : [] });
  const current = currentMilestoneOf(baseDir);
  if (current === null) return none(null);
  const { rel, milestone } = current;
  const NOT_WRITTEN = 'its Epic table was not written';
  try {
    lstatSync(join(baseDir, rel));
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return none(`${rel} does not exist — ${NOT_WRITTEN}.`);
    return none(`${rel} could not be inspected (${err.code ?? err.message}) — ${NOT_WRITTEN}.`);
  }
  const refusal = regularFileRefusal(baseDir, rel);
  if (refusal !== null) return none(`${refusal}; ${NOT_WRITTEN}.`);
  let content;
  try {
    content = readRegularFile(baseDir, rel);
  } catch (err) {
    return none(`${rel} could not be read (${err.code ?? err.message}) — ${NOT_WRITTEN}.`);
  }
  const at = epicMarkers(content);
  if (at.state === 'none') {
    return none(`${rel} has no \`<!-- signal:epics:begin -->\` … \`<!-- signal:epics:end -->\` markers — ${NOT_WRITTEN}. `
      + 'Put the two markers around its Epic table, once, and the rows are generated from the unit records.');
  }
  const table = renderEpicTable(units, { milestone });
  try {
    return { milestone: { rel, table, text: upsertEpicTable(content, table) }, notes: [] };
  } catch (err) {
    if (!(err instanceof WorkStoreError)) throw err;
    throw new WorkStoreError(err.code, `${rel}: ${err.message}`);
  }
}

// `work/WATCHLIST.md`, read only as a regular, unlinked file inside the
// project (REVIEW pass 1): a link would copy whatever it points at into the
// generated inbox. Absent → null; a link or a non-file → CONFLICT, naming it.
function readWatchlist(baseDir) {
  const refusal = regularFileRefusal(baseDir, WATCHLIST_REL);
  if (refusal !== null) throw new WorkStoreError('CONFLICT', `${refusal}. The views were not generated.`);
  try {
    return readRegularFile(baseDir, WATCHLIST_REL);
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw asWorkStoreError(err, 'IO');
  }
}

/**
 * The views as `regenerateViews` would write them, rendered in memory and not
 * written. Synchronous: `checkRecords` calls it to compare the views on disk
 * (its default `regenerateToMemory`).
 *
 * @param {string} baseDir
 * @returns {Record<string, string>|null} null when the store is off. With unit records and a current
 *   milestone file that carries the `signal:epics` markers, that file is one more entry: its whole
 *   text with the Epic table set between the markers (so a stale table is a stale view, AC7.4)
 * @throws {WorkStoreError} SCHEMA when any record is broken; CONFIG when WORK.md is, or the markers are broken
 */
export function regenerateToMemory(baseDir) {
  if (storeVersion(baseDir) === null) return null;
  return renderStore(baseDir).views;
}

// A view is written only to a real file in real folders inside `.planning/`
// (REVIEW I1): a committed link — `work/history/` pointing out of the project,
// a view file pointing at another file — refuses. Checked before the hand-kept
// test, which opens the file and would read through a linked one.
export function confineView(baseDir, rel) {
  let linked;
  try {
    // `.planning` itself may be a link to a folder inside the repository
    // (SIG-279); `assertRealInsidePlanning` refuses one that leaves it.
    linked = linkedComponent(baseDir, rel, { from: PLANNING_DIR });
    if (linked === null) assertRealInsidePlanning(baseDir, join(baseDir, rel), `${rel} (view regeneration)`);
  } catch (err) {
    throw asWorkStoreError(err, typeof err?.code === 'string' ? 'IO' : 'CONFLICT', 'nothing was written — ');
  }
  if (linked !== null) {
    throw new WorkStoreError('CONFLICT', `${linked} is a symbolic link — the views are never written through a link, `
      + `so nothing was written (${rel} would have been). Replace the link with a real `
      + `${linked === rel ? 'file' : 'folder'} (or remove it), then re-run.`);
  }
}

function handKept(baseDir, rels) {
  return rels.filter((rel) => {
    const abs = join(baseDir, rel);
    return existsSync(abs) && !isGeneratedFile(abs);
  });
}

// Everything `regenerateViews` checks before its first write: the store's
// version, every record reading (`renderStore`), WATCHLIST.md and the archived
// Epic READMEs (or, with unit records, every unit record and the current
// milestone file's markers), no link on any view's path, no hand-kept view.
// Returns `renderStore`'s result, or null with the store off. Writes nothing.
function prepareViews(baseDir) {
  const version = storeVersion(baseDir);
  if (version === null) return null;
  if (version !== 2) {
    const err = new WorkStoreError('CONFIG', V1_STORE_MESSAGE);
    err.version = version;
    throw err;
  }
  const rendered = renderStore(baseDir);
  const { views } = rendered;
  const rels = Object.keys(views);
  for (const rel of rels) confineView(baseDir, rel);
  // The milestone file is a person's document with one generated region: it
  // carries no generated marker, and is not a hand-kept view.
  const kept = handKept(baseDir, rels.filter((rel) => rel !== rendered.milestone?.rel));
  if (kept.length > 0) {
    throw new WorkStoreError('CONFIG', `${kept.join(', ')} ${kept.length === 1 ? 'is' : 'are'} hand-kept, not generated `
      + '(the first line is not the generated marker). Regenerating would overwrite '
      + `${kept.length === 1 ? 'it' : 'them'} with a view of the records, so nothing was written. If this list `
      + 'was never migrated (the store was switched on by hand), remove `.planning/work/WORK.md` and run '
      + '`/sig:docs-migrate --work-store`, which moves the lists into records. If it was edited by hand, restore '
      + 'it from git (`git checkout -- <file>`) and make the change with /sig:item.');
  }
  return rendered;
}

/**
 * Throw whatever `regenerateViews` would refuse with, writing nothing
 * (SIG-280 (6), M6.E14). Every `work-records.js` writer calls it under the
 * `work` lock BEFORE writing a record, so a cause the views refuse — a
 * hand-kept view, a linked WATCHLIST.md, an archived Epic README that is not
 * valid YAML, a broken record — refuses the write instead of leaving a record
 * the views do not show. It renders the whole store in memory (measured
 * 2026-10-07: ~20 ms at 282 records). What it cannot see is a view path the
 * write itself creates (a new history year); `regenerateAfter` reports that.
 *
 * @param {string} baseDir
 * @throws {WorkStoreError}
 */
export function checkViewsWritable(baseDir) {
  prepareViews(baseDir);
}

// A message ends in a full stop before the next sentence is appended to it.
const endSentence = (text) => (/[.!?)]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

// The git remedy for a broken record, shared by every refusal that names one.
const BROKEN_REMEDY = ' A broken record is restored with git: `git checkout -- <path>` when HEAD holds a good copy, or '
  + '`git checkout --ours <path>` / `--theirs <path>` for a merge conflict.';

/**
 * `checkViewsWritable`, as a refusal a writer can throw as it is: "nothing was
 * {verb}", the cause, and — for a broken record — how to restore it. One
 * wording for every writer (`work-records.js`, `closeEpic`, the archive moves;
 * M6.E14 REVIEW).
 *
 * @param {string} baseDir
 * @param {{verb?: string}} [opts] — what the caller did not do: 'written' (default), 'moved'
 * @throws {WorkStoreError} the cause's code
 */
export function assertViewsWritable(baseDir, { verb = 'written' } = {}) {
  try {
    checkViewsWritable(baseDir);
  } catch (err) {
    const code = err instanceof WorkStoreError ? err.code : 'IO';
    const inner = endSentence(String(err?.message ?? err)
      .replace(/^nothing was written — /, '')
      .replace(/,? so nothing was written\b/g, ''));
    const remedy = Array.isArray(err?.broken) && err.broken.length > 0 ? BROKEN_REMEDY : '';
    const wrapped = new WorkStoreError(code, `nothing was ${verb} — the views cannot be regenerated as things stand: ${inner}${remedy}`);
    wrapped.cause = err;
    throw wrapped;
  }
}

/**
 * The error for a change that landed and whose views then failed to
 * regenerate. The inner refusal was written for a caller that wrote nothing —
 * "so nothing was written", "then re-run" — which is false here: the change
 * stands, and re-running the command that made it would make it twice (M6.E14
 * REVIEW). Those phrases are rewritten to be about the views.
 *
 * @param {string} done — what landed, as a clause ("SIG-3 was written")
 * @param {unknown} err — the regeneration's error
 * @returns {WorkStoreError}
 */
export function viewsNotRegenerated(done, err) {
  const code = err instanceof WorkStoreError ? err.code : 'IO';
  // Only this module's own phrasings are rewritten — never a bare word, which
  // could sit inside a path or a quoted value (REVIEW pass 2).
  const inner = endSentence(String(err?.message ?? err)
    .replace(/^nothing was written — /, '')
    .replace(/\bso nothing was written\b/g, 'so no view was written')
    .replace(/,? then re-run\.?/g, '.')
    .replace(/ and make the change with \/sig:item\./g, '.'));
  const remedy = Array.isArray(err?.broken) && err.broken.length > 0 ? BROKEN_REMEDY : '';
  const wrapped = new WorkStoreError(code, `${done}, and that change stands — but the views were not regenerated: ${inner}${remedy} `
    + 'Fix what this names, then make any item change and the views are regenerated with it. '
    + 'Do not repeat the command that made this change: it already landed.');
  wrapped.cause = err;
  return wrapped;
}

/**
 * Regenerate and write every view of a v2 store. The default `regenerate` of
 * every `work-records.js` mutation, which calls it under the `work` lock — so
 * it never takes the lock itself.
 *
 * - Store off: writes nothing (`{written: []}`).
 * - v1 store: refuses (CONFIG, naming the migration) — v1's views are v1's.
 * - Any broken record: writes nothing (SCHEMA, naming each).
 * - Any target reached through a symbolic link (a linked `.planning/work/`,
 *   `work/history/`, or view file), or whose folder resolves outside
 *   `.planning/`: writes nothing (CONFLICT, naming the link). Checked for
 *   every target before any write, and again before each one.
 * - Any target that exists without the generated marker is hand-kept: writes
 *   nothing (CONFIG, naming each). Checked for every target before any write.
 * - A history file whose year no longer has a close outside the window is
 *   left as it is, never deleted.
 *
 * **With unit records** (M6.E16 t5.2) the current milestone's file —
 * `MILESTONE-<n>.md` for the Epic `STATE.md` names — gets its Epic table
 * written between its `signal:epics` markers (`milestone-table.js`); no other
 * byte of it changes, and it is not rewritten when nothing would change. A
 * file without the markers (or absent, or a link) is left alone: that is a
 * line in `notes`, not a failure. Markers that are there but broken refuse
 * the whole regeneration (CONFIG, naming the file), before anything is written.
 *
 * @param {string} baseDir
 * @returns {Promise<{written: string[], notes?: string[]}>} `written`: repo-root-relative paths;
 *   `notes`: present only when there is something to say — why a milestone's Epic table was not written
 * @throws {WorkStoreError}
 */
export async function regenerateViews(baseDir) {
  const rendered = prepareViews(baseDir);
  if (rendered === null) return { written: [] };
  const { views, milestone, notes } = rendered;
  const written = [];
  for (const rel of Object.keys(views)) {
    const abs = join(baseDir, rel);
    confineView(baseDir, rel); // again before the mkdir: a link made after the check is still refused
    if (rel === milestone?.rel) {
      if (await writeMilestoneTable(baseDir, milestone)) written.push(rel);
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    // Re-checked per file: a list hand-written after the check is still not overwritten.
    if (handKept(baseDir, [rel]).length > 0) {
      throw new WorkStoreError('CONFIG', `${rel} is hand-kept, not generated — it was not overwritten.`);
    }
    await atomicWrite(abs, views[rel], { generated: true });
    written.push(rel);
  }
  return notes.length > 0 ? { written, notes } : { written };
}

// Write the milestone file's Epic table. The file is read AGAIN here and the
// table set into what it holds now, so text a person changed outside the
// markers since the check is kept, not written over with what was read then.
// Nothing is written when the bytes would be the same. Returns whether it wrote.
async function writeMilestoneTable(baseDir, { rel, table }) {
  let now;
  let next;
  try {
    now = readRegularFile(baseDir, rel);
    next = upsertEpicTable(now, table);
  } catch (err) {
    const why = err instanceof WorkStoreError ? err.message : `it could not be read (${err.code ?? err.message})`;
    throw new WorkStoreError('CONFIG', `${rel}: ${why} It changed while the views were being regenerated; its Epic table was not written.`);
  }
  if (next === now) return false;
  await atomicWrite(join(baseDir, rel), next);
  return true;
}
