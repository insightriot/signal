// The four generated lists (M6.E11.S2 t2.3, FR-7, D-M6E11-20, D-M6E11-25).
//
// With the store on, `BUGS.md`, `BACKLOG.md`, `ISSUES-INBOX.md` and
// `OPEN-QUESTIONS.md` stop being hand-kept and become VIEWS of the item files,
// regenerated after every mutation. They exist so the shipped readers —
// `walkBugEntries`, `parseBacklogRows`, `parseEntries`, `countOpenQuestions` —
// keep working unchanged while they are converted in later steps (the
// strangler migration, RESEARCH §4). So every shape below is dictated by a
// reader, not by taste:
//
//   BUGS.md          every BUG item as `| B{n} | status | pri | summary |` —
//                    five readers see only `| B\d+ |` (D-M6E11-20) — plus a
//                    tally line derived from the rows themselves.
//   BACKLOG.md       open items that are neither BUG nor Q, one `###` each,
//                    `{title} · SIG-n`, nothing nested under a row (a deeper
//                    heading would turn the row into a container) and no
//                    done-word in a heading (the parser would read it closed).
//   ISSUES-INBOX.md  the standing watchlist verbatim (D-M6E11-18), then open
//                    N captures, each with a FRESH `**Status:**` line — the
//                    migrated captures' own lines say `→ Deferred … (drain)`,
//                    which the drain reads as dispositioned.
//   OPEN-QUESTIONS   open Q items; `countOpenQuestions` counts every `## `,
//                    fence-blind, so no body may carry one.
//
// Every open item lands in exactly one file; closed items appear only in
// BUGS.md (a bug's history is what that file is for). The rules are by type
// and status only — no provenance — so they are total for items created after
// the migration too.
//
// Deterministic: items are ordered by number, and nothing reads the clock, so
// the same store gives byte-identical files (AC-7.1).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { parseBacklogRows } from './backlog.js';
import { deriveBugCounts, formatTallySegment } from './bugs-tally.js';
import { EPIC_ID_STRICT_RE, parseFrontmatter, StateSchemaError } from './state.js';
import { parseItem, WorkStoreError } from './work-item.js';
import { rewriteRelativeLinks } from './work-links.js';
import { GENERATED_MARKER, isGeneratedFile } from './work-marker.js';
import { FOLDERS, isStoreOn, parseItemFileName, walkFiles, WORK_DIR } from './work-store.js';

// The marker lives in the leaf `work-marker.js` so `atomic-write.js` can check
// it without importing the store; re-exported here for existing importers.
export { GENERATED_MARKER };
export const GENERATED_FILES = Object.freeze(['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md']);
export const WATCHLIST_FILE = 'WATCHLIST.md';
// The Epic index (AC-8.2). Under `work/`, not `.planning/`, and so not in
// GENERATED_FILES: it is a view of the store for the store's readers, not one
// of the four lists the shipped readers parse.
export const EPICS_INDEX_REL = `${WORK_DIR}/EPICS.md`;
// An Epic's intent file inside its folder; holds the close record once
// archived (FR-8.4). Not an item file — its name is not an ID.
export const EPIC_README = 'README.md';

const OPEN_ACTIVE = new Set(['T', 'Q', 'P']);

const isFence = (line) => {
  const t = line.trimStart();
  return t.startsWith('```') || t.startsWith('~~~');
};
const HEADING_RE = /^(#{1,6})\s+(.*)$/;

const num = (id) => Number(id.slice(id.lastIndexOf('-') + 1));

// A body's first line is its old heading when it came from a list; the
// generated file prints its own heading, so that line is dropped.
function withoutLeadingHeading(body) {
  const lines = body.split('\n');
  if (lines.length && HEADING_RE.test(lines[0])) {
    lines.shift();
    while (lines.length && lines[0].trim() === '') lines.shift();
  }
  return lines.join('\n').trimEnd();
}

// Headings inside a body become bold text, so nothing nests under a
// generated row. With `fencedToo`, a heading-shaped line inside a fence is
// indented one space — only for OPEN-QUESTIONS, whose counter is fence-blind.
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

// The body as it reads from `.planning/` — links back at list depth.
const atPlanning = (entry) => rewriteRelativeLinks(entry.body, entry.dir, '');

// ── BUGS.md ──────────────────────────────────────────────────────────────────

const BUG_ROW_RE = /^\|\s*B(\d+)\s*\|([^|]*)\|([^|]*)\|/;

function bugStatusWord(item) {
  if (item.status === 'N') return 'needs-triage';
  if (item.status === 'C') return item.close?.reason === 'fixed' ? 'fixed' : 'dismissed';
  return 'confirmed';
}

// A body that IS a table row (a migrated one) keeps its verbatim summary,
// continuation lines included. Anything else is summarised by its title —
// never by its body, whose `**Status:**` line would count as a second entry.
function bugSummary(entry) {
  const body = atPlanning(entry);
  const m = body.match(BUG_ROW_RE);
  if (m && body.trimEnd().endsWith('|')) return body.slice(m[0].length, body.lastIndexOf('|')).trim();
  return `**${String(entry.item.title ?? entry.item.id).replace(/\|/g, '\\|')}**`;
}

function generateBugs(items) {
  const rows = items
    .filter((e) => e.item.type === 'BUG')
    .map((e) => `| B${num(e.item.id)} | \`${bugStatusWord(e.item)}\` | ${e.item.priority ?? '—'} | ${bugSummary(e)} |`);
  const table = ['| ID | Status | Pri | Summary |', '|---|---|---|---|', ...rows].join('\n');
  const tally = `*${formatTallySegment(deriveBugCounts(table))}*`;
  return [GENERATED_MARKER, '# Bugs', '', table, '', tally, ''].join('\n');
}

// ── BACKLOG.md ───────────────────────────────────────────────────────────────

// A title that today's parser would read as discharged cannot head an open
// row. `~~` goes; if a bold done-word is still read, the bold goes too. The
// check asks the parser itself rather than copying its vocabulary.
function backlogHeading(item) {
  let title = String(item.title ?? item.id).replace(/~~/g, '');
  const read = (t) => parseBacklogRows(`### ${t} · ${item.id}`, { maxDepth: 3 })[0];
  if (read(title)?.discharged) title = title.replace(/\*\*/g, '');
  return `### ${title} · ${item.id}`;
}

function generateBacklog(items) {
  const blocks = items
    .filter((e) => OPEN_ACTIVE.has(e.item.status) && e.item.type !== 'BUG' && e.item.type !== 'Q')
    .map((e) => {
      const body = demoteHeadings(withoutLeadingHeading(atPlanning(e)));
      return body ? `${backlogHeading(e.item)}\n\n${body}` : backlogHeading(e.item);
    });
  return [GENERATED_MARKER, '# Backlog', '', ...blocks.map((b) => `${b}\n`)].join('\n');
}

// ── ISSUES-INBOX.md ─────────────────────────────────────────────────────────

function generateInbox(items, watchlist) {
  const parts = [GENERATED_MARKER, '# Issues Inbox', ''];
  if (watchlist) parts.push(rewriteRelativeLinks(watchlist.text, watchlist.dir, '').trimEnd(), '', '---', '');
  for (const e of items.filter((x) => x.item.status === 'N' && x.item.type !== 'BUG' && x.item.type !== 'Q')) {
    const body = demoteHeadings(withoutLeadingHeading(atPlanning(e)));
    parts.push(`## ${e.item.title ?? e.item.id}`, '', `**Status:** untriaged (N) · ${e.item.id}`, '');
    if (body) parts.push(body, '');
    parts.push('---', '');
  }
  return parts.join('\n');
}

// ── OPEN-QUESTIONS.md ───────────────────────────────────────────────────────

function generateQuestions(items) {
  const parts = [GENERATED_MARKER, '# Open Questions', ''];
  for (const e of items.filter((x) => x.item.type === 'Q' && x.item.status !== 'C')) {
    const body = demoteHeadings(withoutLeadingHeading(atPlanning(e)), { fencedToo: true });
    // The id on its own line, so a reader can find the item file; the
    // heading stays the bare title because `extractTopOpenQuestions` shows it.
    parts.push(`## ${e.item.title ?? e.item.id}`, '', `**Item:** ${e.item.id}`, '');
    if (body) parts.push(body, '');
    parts.push('---', '');
  }
  return parts.join('\n');
}

// ── work/EPICS.md ───────────────────────────────────────────────────────────

// Natural order of Epic IDs: M6.E2 before M6.E11.
function compareEpicIds(a, b) {
  const pa = (a.match(/\d+/g) ?? []).map(Number);
  const pb = (b.match(/\d+/g) ?? []).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (d !== 0) return d;
  }
  return a.localeCompare(b);
}

function closeLine(close) {
  if (!close || typeof close !== 'object') return 'closed (no close record in its README.md)';
  const parts = [`closed ${String(close.at ?? 'at an unrecorded time').slice(0, 10)}`];
  if (close.pr !== undefined && close.pr !== null) parts.push(`PR ${close.pr}`);
  if (close.release !== undefined && close.release !== null) parts.push(String(close.release));
  if (close.by !== undefined && close.by !== null) parts.push(`by ${close.by}`);
  return parts.join(' · ');
}

/**
 * Render the Epic index. Pure. Open Epics first, then archived ones, each in
 * natural ID order; an Epic's items in number order.
 *
 * @param {Array<{id: string, archived: boolean, close?: object|null}>} epics
 * @param {Array<{item: object, dir: string}>} items
 * @returns {string}
 */
export function generateEpicsIndex(epics, items) {
  const parts = [GENERATED_MARKER, '# Epics', ''];
  const sorted = [...epics].sort((a, b) => Number(a.archived) - Number(b.archived) || compareEpicIds(a.id, b.id));
  if (sorted.length === 0) parts.push('_no Epic folders_', '');
  for (const epic of sorted) {
    const dir = `${epic.archived ? 'archive/epics' : `${WORK_DIR}/${FOLDERS.epics}`}/${epic.id}`;
    const mine = items
      .filter((e) => e.dir === dir)
      .sort((a, b) => num(a.item.id) - num(b.item.id) || a.item.id.localeCompare(b.item.id));
    parts.push(`## ${epic.id} — ${epic.archived ? closeLine(epic.close) : 'open'}`, '');
    if (mine.length === 0) parts.push('_no items_');
    for (const e of mine) {
      const title = e.item.title === undefined ? '' : ` — ${String(e.item.title).replace(/\s+/g, ' ')}`;
      parts.push(`- ${e.item.id}-${e.item.type}-${e.item.status}${title}`);
    }
    parts.push('');
  }
  return parts.join('\n');
}

// Every Epic folder, live and archived. Directories only (a symlink is
// neither), strict Epic IDs only — the same folder rule `checkStore` applies.
function readEpicFolders(planning) {
  const out = [];
  for (const [rel, archived] of [[join(WORK_DIR, FOLDERS.epics), false], [join('archive', 'epics'), true]]) {
    let entries;
    try {
      entries = readdirSync(join(planning, rel), { withFileTypes: true });
    } catch (err) {
      if (err.code === 'ENOENT' || err.code === 'ENOTDIR') continue;
      throw err;
    }
    for (const e of entries) {
      if (!e.isDirectory() || !EPIC_ID_STRICT_RE.test(e.name)) continue;
      const epic = { id: e.name, archived };
      const readme = join(planning, rel, e.name, EPIC_README);
      if (archived && existsSync(readme)) {
        try {
          epic.close = parseFrontmatter(readFileSync(readme, 'utf-8')).data?.close ?? null;
        } catch (err) {
          if (!(err instanceof StateSchemaError)) throw err;
          throw new WorkStoreError('SCHEMA', `.planning/${rel.split(sep).join('/')}/${e.name}/${EPIC_README}: `
            + `its frontmatter is not valid YAML — fix it, then re-run. (${err.message})`);
        }
      }
      out.push(epic);
    }
  }
  return out;
}

/**
 * Render the four files from items. Pure.
 *
 * @param {{items: Array<{item: object, body: string, dir: string}>, watchlist?: {text: string, dir: string}|null}} store
 *   `dir` is the item file's folder relative to `.planning/` (e.g. `work/backlog`)
 * @returns {Record<'BUGS.md'|'BACKLOG.md'|'ISSUES-INBOX.md'|'OPEN-QUESTIONS.md', string>}
 */
export function generateFiles({ items, watchlist = null }) {
  const sorted = [...items].sort((a, b) => num(a.item.id) - num(b.item.id) || a.item.id.localeCompare(b.item.id));
  return {
    'BUGS.md': generateBugs(sorted),
    'BACKLOG.md': generateBacklog(sorted),
    'ISSUES-INBOX.md': generateInbox(sorted, watchlist),
    'OPEN-QUESTIONS.md': generateQuestions(sorted),
  };
}

// ── Never over a hand-kept list (REVIEW I1) ─────────────────────────────────
//
// A target the generator would write that exists WITHOUT the marker is a
// hand-kept list: the store was switched on (WORK.md) without the migration
// having moved the list's entries into item files. Regenerating would replace
// it with a view of an item store that does not hold those entries. So it is
// refused — checked for EVERY target before ANY is written, so a refusal
// leaves every list as it was. The migration alone may name lists to replace
// (the ones it has just archived and turned into items).

const TARGETS = [...GENERATED_FILES, EPICS_INDEX_REL];

/**
 * Throw unless every file the generator would write is missing or already
 * generated. Reads only.
 *
 * @param {string} baseDir
 * @param {{replace?: string[]}} [opts] — `.planning/`-relative names the
 *   caller may replace although hand-kept; only `applyMigration` passes any
 * @throws {WorkStoreError} CONFIG naming each hand-kept list
 */
export function assertNoHandKeptLists(baseDir, opts = {}) {
  const replace = new Set(opts.replace ?? []);
  const planning = join(baseDir, '.planning');
  const handKept = TARGETS.filter((rel) => {
    const abs = join(planning, ...rel.split('/'));
    return !replace.has(rel) && existsSync(abs) && !isGeneratedFile(abs);
  });
  if (handKept.length === 0) return;
  throw new WorkStoreError('CONFIG', `The work store is on (.planning/${WORK_DIR}/WORK.md exists), but `
    + `${handKept.map((r) => `.planning/${r}`).join(', ')} ${handKept.length === 1 ? 'is' : 'are'} hand-kept, not `
    + 'generated. Regenerating would overwrite '
    + `${handKept.length === 1 ? 'it' : 'them'} with entries the store does not hold, so nothing was written. `
    + 'Turning the store on for a project with existing lists is done by the migration, which moves every entry '
    + 'into an item file first: `node tools/work-migrate.mjs` in Signal (`/sig:docs-migrate` for other projects, '
    + `in a later release). If .planning/${WORK_DIR}/WORK.md was created by hand, delete it to turn the store back off.`);
}

/**
 * Read the store — `work/` and archived Epics — and (re)write the four files
 * plus the Epic index `work/EPICS.md`. With the store off, writes
 * nothing — a project without `.planning/work/WORK.md` sees no change.
 * A store holding any broken item file writes nothing and throws: a view
 * generated from part of the store would silently drop the broken items.
 * A target that exists and is hand-kept writes nothing and throws (REVIEW I1).
 *
 * @param {string} baseDir — project root
 * @param {{replace?: string[]}} [opts] — see `assertNoHandKeptLists`; only
 *   `applyMigration` passes it
 * @returns {Promise<{written: string[]}>}
 * @throws {WorkStoreError} CONFIG (broken WORK.md, or a hand-kept list) or SCHEMA (broken item)
 */
export async function generateAll(baseDir, opts = {}) {
  if (!isStoreOn(baseDir).on) return { written: [] };
  assertNoHandKeptLists(baseDir, opts);
  const replace = new Set(opts.replace ?? []);
  const planning = join(baseDir, '.planning');
  const workDir = join(planning, WORK_DIR);

  const items = [];
  const errors = [];
  // Archived Epics too: a closed bug archived with its Epic is still a bug,
  // and BUGS.md is where a bug's history is read.
  const files = [...walkFiles(workDir), ...walkFiles(join(planning, 'archive', 'epics'))].sort();
  for (const abs of files) {
    const name = abs.slice(abs.lastIndexOf(sep) + 1);
    if (!parseItemFileName(name)) continue; // WORK.md, WATCHLIST.md, an Epic's own artifacts
    const rel = relative(planning, abs).split(sep).join('/');
    const { item, body, errors: errs } = parseItem(readFileSync(abs, 'utf-8'), { path: `.planning/${rel}` });
    if (errs.length) {
      errors.push(...errs);
      continue;
    }
    items.push({ item, body, dir: relative(planning, dirname(abs)).split(sep).join('/') });
  }
  if (errors.length) {
    throw new WorkStoreError('SCHEMA', `cannot generate the lists — fix these item files first:\n${errors.join('\n')}`);
  }

  const wlPath = join(workDir, WATCHLIST_FILE);
  const watchlist = existsSync(wlPath) ? { text: readFileSync(wlPath, 'utf-8'), dir: WORK_DIR } : null;

  const lists = generateFiles({ items, watchlist });
  const epicsIndex = generateEpicsIndex(readEpicFolders(planning), items);
  for (const name of GENERATED_FILES) await writeGenerated(join(planning, name), lists[name], replace.has(name));
  await writeGenerated(join(planning, EPICS_INDEX_REL), epicsIndex, replace.has(EPICS_INDEX_REL));
  return { written: [...GENERATED_FILES, EPICS_INDEX_REL] };
}

// The one place a generated file is written, and the only caller passing
// `{generated: true}` for new content (D-M6E11-28): `atomicWrite` refuses a
// marked file to everyone else. It re-checks the hand-kept rule per file, so
// a list hand-written after the preflight is still not overwritten.
function writeGenerated(path, text, mayReplaceHandKept) {
  if (!mayReplaceHandKept && existsSync(path) && !isGeneratedFile(path)) {
    throw new WorkStoreError('CONFIG', `${path} is hand-kept, not generated — it was not overwritten. `
      + 'Bring hand-kept lists into the store with the migration (`node tools/work-migrate.mjs`).');
  }
  return atomicWrite(path, text, { generated: true });
}
