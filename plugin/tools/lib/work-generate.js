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

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { parseBacklogRows } from './backlog.js';
import { deriveBugCounts, formatTallySegment } from './bugs-tally.js';
import { parseItem, WorkStoreError } from './work-item.js';
import { rewriteRelativeLinks } from './work-links.js';
import { GENERATED_MARKER } from './work-marker.js';
import { isStoreOn, parseItemFileName, walkFiles, WORK_DIR } from './work-store.js';

// The marker lives in the leaf `work-marker.js` so `atomic-write.js` can check
// it without importing the store; re-exported here for existing importers.
export { GENERATED_MARKER };
export const GENERATED_FILES = Object.freeze(['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md']);
export const WATCHLIST_FILE = 'WATCHLIST.md';

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

/**
 * Read the store and (re)write the four files. With the store off, writes
 * nothing — a project without `.planning/work/WORK.md` sees no change.
 * A store holding any broken item file writes nothing and throws: a view
 * generated from part of the store would silently drop the broken items.
 *
 * @param {string} baseDir — project root
 * @returns {Promise<{written: string[]}>}
 * @throws {WorkStoreError} CONFIG (broken WORK.md) or SCHEMA (broken item)
 */
export async function generateAll(baseDir) {
  if (!isStoreOn(baseDir).on) return { written: [] };
  const planning = join(baseDir, '.planning');
  const workDir = join(planning, WORK_DIR);

  const items = [];
  const errors = [];
  for (const abs of walkFiles(workDir).sort()) {
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

  const files = generateFiles({ items, watchlist });
  for (const name of GENERATED_FILES) await writeGenerated(join(planning, name), files[name]);
  return { written: [...GENERATED_FILES] };
}

// The one place a generated file is written, and the only caller passing
// `{generated: true}` for new content (D-M6E11-28): `atomicWrite` refuses a
// marked file to everyone else.
function writeGenerated(path, text) {
  return atomicWrite(path, text, { generated: true });
}
