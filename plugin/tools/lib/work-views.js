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
// Import graph (PLAN Decision 12): nothing here may reach a Markdown list
// parser, so `work-generate.js`, `backlog.js` and `bugs-tally.js` are not
// imported; the small text helpers below are this module's own.

import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { compareEpicIds, EPIC_ID_STRICT_RE, parseFrontmatter, StateSchemaError } from './state.js';
import { WorkStoreError } from './work-errors.js';
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

// A one-paragraph body (a migrated row's text) is the summary; anything
// longer is summarised by its title, never by its body.
function bugSummary(it) {
  const body = bodyAt(it, PLANNING_DEPTH).trim();
  if (body !== '' && !/\n\s*\n/.test(body) && !body.split('\n').some((l) => HEADING_RE.test(l) || isFence(l))) {
    return cell(body);
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

// ── renderViews ─────────────────────────────────────────────────────────────

/**
 * Render every view from records. Pure and synchronous: no file is read, the
 * clock is not read, and the same records in any order give the same bytes.
 *
 * @param {Array<{record: object, body?: string|null}>} records — `listRecords`
 *   entries (with `{bodies: true}` for bodies); status and Epic are folded here
 * @param {{watchlistText?: string|null, epics?: Array<{id: string, archived: boolean, close?: object|null}>}} [opts]
 *   `watchlistText`: `work/WATCHLIST.md`, printed first in the inbox;
 *   `epics`: the Epic folders, live and archived (`readEpicFolders`)
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
    [VIEW_PATHS.epics]: renderEpics(items, opts.epics ?? []),
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
      const readme = join(baseDir, rel, e.name, 'README.md');
      if (archived && existsSync(readme)) {
        try {
          epic.close = parseFrontmatter(readFileSync(readme, 'utf-8')).data?.close ?? null;
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

function renderStore(baseDir) {
  const { records, broken } = listRecords(baseDir, { bodies: true });
  if (broken.length > 0) {
    throw new WorkStoreError('SCHEMA', 'cannot generate the views — a view of part of the store would silently '
      + `drop the broken records. Fix these first:\n${broken.map((b) => `  ${b.error}`).join('\n')}`);
  }
  const wl = join(baseDir, WATCHLIST_REL);
  const watchlistText = existsSync(wl) ? readFileSync(wl, 'utf-8') : null;
  return renderViews(records, { watchlistText, epics: readEpicFolders(baseDir) });
}

/**
 * The views as `regenerateViews` would write them, rendered in memory and not
 * written. Synchronous: `checkRecords` calls it to compare the views on disk
 * (its default `regenerateToMemory`).
 *
 * @param {string} baseDir
 * @returns {Record<string, string>|null} null when the store is off
 * @throws {WorkStoreError} SCHEMA when any record is broken; CONFIG when WORK.md is
 */
export function regenerateToMemory(baseDir) {
  if (storeVersion(baseDir) === null) return null;
  return renderStore(baseDir);
}

function handKept(baseDir, rels) {
  return rels.filter((rel) => {
    const abs = join(baseDir, rel);
    return existsSync(abs) && !isGeneratedFile(abs);
  });
}

/**
 * Regenerate and write every view of a v2 store. The default `regenerate` of
 * every `work-records.js` mutation, which calls it under the `work` lock — so
 * it never takes the lock itself.
 *
 * - Store off: writes nothing (`{written: []}`).
 * - v1 store: refuses (CONFIG, naming the migration) — v1's views are v1's.
 * - Any broken record: writes nothing (SCHEMA, naming each).
 * - Any target that exists without the generated marker is hand-kept: writes
 *   nothing (CONFIG, naming each). Checked for every target before any write.
 * - A history file whose year no longer has a close outside the window is
 *   left as it is, never deleted.
 *
 * @param {string} baseDir
 * @returns {Promise<{written: string[]}>} repo-root-relative paths
 * @throws {WorkStoreError}
 */
export async function regenerateViews(baseDir) {
  const version = storeVersion(baseDir);
  if (version === null) return { written: [] };
  if (version !== 2) {
    const err = new WorkStoreError('CONFIG', V1_STORE_MESSAGE);
    err.version = version;
    throw err;
  }
  const views = renderStore(baseDir);
  const rels = Object.keys(views);
  const kept = handKept(baseDir, rels);
  if (kept.length > 0) {
    throw new WorkStoreError('CONFIG', `${kept.join(', ')} ${kept.length === 1 ? 'is' : 'are'} hand-kept, not generated `
      + '(the first line is not the generated marker). Regenerating would overwrite '
      + `${kept.length === 1 ? 'it' : 'them'} with a view of the records, so nothing was written. If this list `
      + 'was never migrated, migrate it: `node tools/work-migrate-v2.mjs`. If it was edited by hand, restore '
      + 'it from git (`git checkout -- <file>`) and make the change with /sig:item.');
  }
  for (const rel of rels) {
    const abs = join(baseDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    // Re-checked per file: a list hand-written after the check is still not overwritten.
    if (handKept(baseDir, [rel]).length > 0) {
      throw new WorkStoreError('CONFIG', `${rel} is hand-kept, not generated — it was not overwritten.`);
    }
    await atomicWrite(abs, views[rel], { generated: true });
  }
  return { written: rels };
}
