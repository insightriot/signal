// `/sig:docs-migrate --work-store` — the units half (M6.E16 S7, FR9).
//
// A project that worked before unit records has units named in several
// places: milestone table rows, retrospectives, the files of `.planning/`,
// archive folders, item events, and `STATE.md`. `planUnits` gathers the union
// and proposes ONE thing for each:
//
//   open           the current unit, and any unit with no evidence it is over;
//   legacy-close   a unit with evidence it is over — PROPOSED. Nothing closes
//                  without the person's yes to the whole list (`D-M6E15-25`);
//                  on no, each is created open with a note saying it looked
//                  finished;
//   dropped        a unit no source names, declared by the person (`--also`);
//   refused        an ID that cannot be a unit, or one of two that differ only
//                  by letter case — no record is created.
//
// What counts as evidence a unit is over (any one):
//   - its milestone row's status cell BEGINS with "shipped" as a word (bold,
//     a check mark or other punctuation before it aside; or with "closed",
//     when it goes on to say shipped), and does not also say pending, in
//     flight or parked, or "not/never shipped" — and says nothing after it
//     but a version, a date, a pull request or issue number, a commit hash,
//     "released", "merged", and "in", "on", "as", "via", "and"
//     (`SHIP_FACT_RES`). A cell that says shipped
//     further on ("S1 shipped; S2 in progress"), or leads with it and goes on
//     in other words ("shipped — S2 remaining"), is not evidence, and is
//     flagged;
//   - its retrospective is complete (a stub is not evidence);
//   - today's closure check (`resolveClosures`) answers closed.
// The current unit is open whatever the evidence says; when there is
// evidence, that is flagged. So is a unit with an item that is not closed:
// a close with an open item in it is refused everywhere else, so none is
// proposed here, and the items are named beside the proposal.
//
// Reads only. Nothing here writes: `unitImportList` turns a plan into the list
// `importUnits` (`unit-records.js`) writes.
//
// Not read through: a milestone file, a retrospective or `STATE.md` that is a
// symbolic link.
//
// The milestone rows are read here ONLY for a project that has no unit
// records (AC7.3) — which is every project this plan is made for.

import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CLOSURE, resolveClosures } from './closure.js';
import { hashState } from './migrate-memory.js';
import {
  epicMarkers, EPICS_BEGIN, EPICS_END, legacyFirstCells, linesBetweenMarkers, renderEpicTable, rowsNotReprinted, tableBetweenMarkers, upsertEpicTable,
} from './milestone-table.js';
import { parseEpicStatusRows } from './milestones.js';
import { readRegularFile, regularFileRefusal } from './path-confine.js';
import { cut, printable } from './printable-text.js';
import { retroStatusFromContent, RETRO_STATUS } from './retro-index.js';
import { parseFrontmatter } from './state.js';
import { compareUnitIds, epicIdParts } from './unit-record.js';
import { assertUnitId, caseTwins, importUnitsTexts, listUnits, unitRecordsOn } from './unit-records.js';
import { WorkStoreError } from './work-errors.js';
import { epicOf } from './work-record.js';
import { listRecords, storeVersion } from './work-records.js';
import { isStoreOn } from './work-store.js';
import { currentUnit, deriveUnits } from './work-units.js';

const PLANNING = '.planning';
const ARCHIVE = `${PLANNING}/archive`;
const STATE_REL = `${PLANNING}/STATE.md`;

const MILESTONE_FILE_RE = /^MILESTONE-(\d+(?:\.\d+)?)\.md$/;
const RETRO_FILE_RE = /^(.+)-RETROSPECTIVE\.md$/;
const MILESTONE_DIR_RE = /^M\d+(?:\.\d+)?$/;
const EPIC_DIR_RE = /^E\d+$/;
const WALK_MAX = 50000;
const WALK_DEPTH = 8;

// The row rule. "shipped" as a word; a cell that also says one of these is
// not evidence, and neither is one that says the unit did not ship.
const SHIPPED_RE = /\bshipped\b/i;
const NOT_OVER_RE = /\b(pending|in[ -]flight|parked)\b/i;
// Asked of a cell that leads with "shipped": what else it may say and still
// be evidence. Only these, and characters that are neither letters nor digits
// — "shipped" and "closed" themselves; a version (`v0.1.7`); a date
// (`2026-07-15`); a pull request or issue number (`#123`, `PR 123`); a commit
// hash (seven or more hex characters, a digit among them); "released" and
// "merged", which say how it shipped (real rows read "shipped … (released in
// v0.1.3 on …)", "shipped — merged …"); and the five words that join those:
// "in", "on", "as", "via", "and". Each is a whole word: "unreleased" is not
// "released", and the "not" of "not merged" is a word of no list. Any other
// word is about something the cell does not let this rule judge ("S2
// remaining", "docs outstanding"), so the row is not counted. A list of the
// words for work left over would always be one word short.
const SHIP_FACT_RES = [
  /\b(?:shipped|closed|released|merged)\b/gi,
  /\bv\d+(?:\.\d+)*\b/gi,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\bPRs?\s*#?\d+\b|#\d+\b/gi,
  /\b(?=[0-9a-f]*\d)[0-9a-f]{7,40}\b/gi,
  /\b(?:in|on|as|via|and)\b/gi,
];
// The first words of a cell that are none of those, or null.
function leftOver(status) {
  const rest = SHIP_FACT_RES.reduce((text, re) => text.replace(re, '\n'), status);
  return rest.match(/[\p{L}\p{N}](?:[^\n]*[\p{L}\p{N}])?/u)?.[0] ?? null;
}
// Which of them to name in the sentence, when the cell has one: a word for
// work still to do, or for a ship that was taken back.
const LEFT_OVER_RE = /\b(in[ -]progress|to[ -]?do|blocked|reverted|follow[ -]?ups?|partial(?:ly)?|deferred|planned|not started)\b/i;
const NOT_SHIPPED_RE = /\b(?:not|never)\s+(?:yet\s+)?shipped\b/i;
// The word must lead the cell: only characters that are neither letters nor
// digits (bold, backticks, a check mark) may stand before it. Asked only of a
// cell that says "shipped", so "closed" alone is never evidence.
const LEADS_RE = /^[^\p{L}\p{N}]{0,20}(?:shipped|closed)\b/iu;

const SHOWN_MAX = 120; // a quoted cell in an evidence line
const OPEN_ITEMS_SHOWN = 10; // how many open items a proposal names; the rest are counted
const SUMMARY_MAX = 400;
const NOTE_MAX = 2000;
const ALSO_REASONS = ['dropped'];

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// Text quoted in a line a person reads: one line, no invisible characters, cut.
const shownText = (text, max = SHOWN_MAX) => cut(printable(text).replace(/\s+/g, ' ').trim(), max);
const quoted = (text) => `“${shownText(text)}”`;

function entries(abs) {
  try {
    return readdirSync(abs, { withFileTypes: true }).sort((a, b) => byText(a.name, b.name));
  } catch {
    return [];
  }
}

// A row's first three cells, split on a `|` that is not escaped: the first
// cell, the status cell, and everything after as the third (so a pipe in the
// notes survives). Each is kept as written apart from surrounding spaces.
function rowCells(raw) {
  const line = raw.trim().replace(/^\|/, '');
  const cuts = [];
  for (let i = 0; i < line.length && cuts.length < 2; i += 1) {
    if (line[i] === '\\') i += 1;
    else if (line[i] === '|') cuts.push(i);
  }
  if (cuts.length < 2) return [line.trim(), '', ''];
  return [
    line.slice(0, cuts[0]).trim(),
    line.slice(cuts[0] + 1, cuts[1]).trim(),
    line.slice(cuts[1] + 1).replace(/\|\s*$/, '').trim(),
  ];
}

// Every Epic row of every top-level `MILESTONE-*.md`, in file then line order.
// `marked` gains each of those files that carries the Epic-table markers.
function readMilestoneRows(baseDir, notes, marked) {
  // AC7.3: the rows are read only where there are no unit records. A
  // `units/` folder that cannot be trusted throws (`unitRecordsOn`);
  // `planUnits` asks first and refuses, so that is not reached from it.
  if (unitRecordsOn(baseDir)) return [];
  const rows = [];
  const files = entries(join(baseDir, PLANNING))
    .map((e) => ({ name: e.name, m: e.name.match(MILESTONE_FILE_RE) }))
    .filter((f) => f.m)
    .sort((a, b) => parseFloat(a.m[1]) - parseFloat(b.m[1]) || byText(a.name, b.name));
  for (const { name, m } of files) {
    const rel = `${PLANNING}/${name}`;
    const refusal = regularFileRefusal(baseDir, rel);
    if (refusal !== null) {
      notes.push(`${refusal}; its rows name no unit here.`);
      continue;
    }
    let content;
    try {
      content = readRegularFile(baseDir, rel);
    } catch (err) {
      notes.push(`${rel} could not be read (${err.code ?? err.message}); its rows name no unit here.`);
      continue;
    }
    if (epicMarkers(content).state === 'ok') marked.push(rel);
    for (const row of parseEpicStatusRows(content, { milestone: m[1] })) {
      if (row.id !== null) rows.push({ id: row.id, file: rel, line: row.line, cells: rowCells(row.raw) });
    }
  }
  return rows;
}

// Is this a real folder — there, and not a symbolic link? Asked of the archive
// root and of every folder walked under it, just before it is listed: a
// listing follows a link, and a cloned repository can ship `archive/` (or a
// folder inside it) as a link to somewhere else on the disk.
function realFolder(baseDir, rel) {
  try {
    return lstatSync(join(baseDir, rel)).isDirectory();
  } catch {
    return false;
  }
}

// The archive root, when it is there and is not a real folder: said once.
function archiveLinkNote(baseDir, notes) {
  try {
    if (lstatSync(join(baseDir, ARCHIVE)).isSymbolicLink()) notes.push(`${ARCHIVE} is a symbolic link — nothing under it was read.`);
  } catch {
    // not there: nothing to say
  }
}

// Every `<unit>-RETROSPECTIVE.md` in the planning root and under the archive.
// A linked one names its unit and is not read; a linked folder under the
// archive, or a linked archive, is not walked.
function readRetros(baseDir, notes) {
  const found = [];
  let seen = 0;
  archiveLinkNote(baseDir, notes);
  const stack = [[PLANNING, 0, false], [ARCHIVE, 0, true]];
  while (stack.length > 0 && seen < WALK_MAX) {
    const [rel, depth, recurse] = stack.pop();
    if (recurse && !realFolder(baseDir, rel)) continue;
    for (const e of entries(join(baseDir, rel))) {
      seen += 1;
      if (seen > WALK_MAX) break;
      if (e.isDirectory()) {
        if (recurse && depth < WALK_DEPTH) stack.push([`${rel}/${e.name}`, depth + 1, true]);
        continue;
      }
      const m = e.name.match(RETRO_FILE_RE);
      if (!m) continue;
      const path = `${rel}/${e.name}`;
      if (e.isSymbolicLink()) {
        found.push({ id: m[1], path, status: 'link' });
        notes.push(`${path} is a symbolic link — not read.`);
        continue;
      }
      if (!e.isFile()) continue;
      let status = 'unreadable';
      try {
        const s = retroStatusFromContent(readFileSync(join(baseDir, path), 'utf-8'));
        status = s === RETRO_STATUS.ABSENT ? 'empty' : s;
      } catch {
        notes.push(`${path} could not be read.`);
      }
      found.push({ id: m[1], path, status });
    }
  }
  if (seen > WALK_MAX) notes.push(`More than ${WALK_MAX} files under ${PLANNING}/: the search for retrospectives stopped there.`);
  // The planning root's copy wins over an archived one; then path order.
  return found.sort((a, b) => a.path.split('/').length - b.path.split('/').length || byText(a.path, b.path));
}

// Both archive layouts: `archive/<M>/E<n>/` and `archive/epics/<ID>/`.
function readArchiveDirs(baseDir) {
  const found = [];
  if (!realFolder(baseDir, ARCHIVE)) return found;
  for (const m of entries(join(baseDir, ARCHIVE))) {
    if (!m.isDirectory() || !realFolder(baseDir, `${ARCHIVE}/${m.name}`)) continue;
    const kids = entries(join(baseDir, ARCHIVE, m.name)).filter((e) => e.isDirectory());
    if (m.name === 'epics') {
      for (const e of kids) found.push({ id: e.name, path: `${ARCHIVE}/epics/${e.name}` });
    } else if (MILESTONE_DIR_RE.test(m.name)) {
      for (const e of kids) if (EPIC_DIR_RE.test(e.name)) found.push({ id: `${m.name}.${e.name}`, path: `${ARCHIVE}/${m.name}/${e.name}` });
    }
  }
  return found;
}

// Which unit each item is in, from its events, and the item's status — on a
// v2 store only: `[item ID, unit, status]`. A project not yet on the store has
// no item in a unit (the lists it migrates name none), so there is nothing to
// read there.
function readMembership(baseDir, notes) {
  let listed;
  try {
    if (storeVersion(baseDir) !== 2) return [];
    listed = listRecords(baseDir);
  } catch (err) {
    notes.push(`The work items could not be read (${err.message}); no unit is named by an item here.`);
    return [];
  }
  const pairs = [];
  for (const { record, status } of listed.records) {
    let unit = null;
    try {
      unit = epicOf(record);
    } catch {
      unit = null;
    }
    if (typeof unit === 'string') pairs.push([record.id, unit, status]);
  }
  if (listed.broken.length > 0) notes.push(`${listed.broken.length} work item record(s) could not be read; a unit only they name is not listed.`);
  return pairs.sort((a, b) => byText(a[0], b[0]));
}

// `STATE.md`'s current unit, read only as a regular file; null when there is none.
function readCurrent(baseDir, notes) {
  const refusal = regularFileRefusal(baseDir, STATE_REL);
  if (refusal !== null) {
    notes.push(`${refusal}; no unit is read as current.`);
    return null;
  }
  let text;
  try {
    text = readRegularFile(baseDir, STATE_REL);
  } catch {
    return null; // no STATE.md
  }
  try {
    return currentUnit(parseFrontmatter(text).data);
  } catch {
    notes.push(`${STATE_REL} could not be parsed; no unit is read as current.`);
    return null;
  }
}

// How many of the lines an apply removes the dry run prints; the rest are counted.
const REMOVED_SHOWN = 20;

// What the apply removes between the markers. Kept nowhere: each line there
// that is neither blank nor a table row, and — when `keptRows` is given — each
// table row that is not one of them. `keptRows` maps the line number of each
// row whose cells go into a unit record (`legacy_row`) to that unit's ID; a
// row for an ID that gets no record, a second row for the same unit, and a row
// the reader could not take as an Epic row are none of those, and would be
// gone. Removed too, with its cells kept in its record: a row for an Epic of
// another milestone than `milestone`, which the generated table does not print
// (`renderEpicTable`).
// `keptRows` is null on a project that already has unit records: its rows are
// generated, and none is read. `{}` when nothing is removed and the header is
// the generated one, so such a file plans — and hashes — as it did.
//
// `removes`: `count`; `lines`, the first `REMOVED_SHOWN` cleaned and cut for
// printing, a row whose cells stay in a record with that `unit`; `kept`, how
// many of the `count` are such rows, when any is; and `digest`, a hash of
// every such line as written — it is part of `milestone`, so of the plan's
// `inputHash`, and a line added or changed after the dry run refuses the apply
// even where the printed form would not show the difference. `header`: the
// old table's header row, when it is not the three columns the generated
// table has.
function removedBetween(content, keptRows, milestone) {
  const table = keptRows === null ? { header: null, rows: [] } : tableBetweenMarkers(content);
  const elsewhere = table.rows
    .filter((r) => keptRows.has(r.line) && epicIdParts(keptRows.get(r.line))?.milestone !== milestone)
    .map((r) => ({ ...r, unit: keptRows.get(r.line) }));
  const found = [...linesBetweenMarkers(content), ...table.rows.filter((r) => !keptRows.has(r.line)), ...elsewhere]
    .sort((a, b) => a.line - b.line);
  const header = table.header !== null && !table.header.generated
    ? { header: { line: table.header.line, text: shownText(table.header.text, 200) } }
    : {};
  if (found.length === 0) return header;
  return {
    removes: {
      count: found.length,
      ...(elsewhere.length > 0 ? { kept: elsewhere.length } : {}),
      lines: found.slice(0, REMOVED_SHOWN).map((l) => ({ line: l.line, text: shownText(l.text, 200), ...(l.unit === undefined ? {} : { unit: l.unit }) })),
      digest: hashState(JSON.stringify(found.map((l) => [l.line, l.text]))),
    },
    ...header,
  };
}

// The current milestone's file and whether it carries the Epic-table markers.
// The migration never adds them: it says what is there, and what to add.
// `keptRows(rel)`: as `removedBetween`'s, for that file.
function milestoneMarkers(baseDir, current, keptRows) {
  const parts = epicIdParts(current);
  if (parts === null || parts.parts.length > 2) return null;
  const rel = `${PLANNING}/MILESTONE-${parts.milestone}.md`;
  if (regularFileRefusal(baseDir, rel) !== null) return { rel, markers: 'absent' };
  try {
    const content = readRegularFile(baseDir, rel);
    const at = epicMarkers(content);
    return { rel, markers: at.state, ...(at.state === 'broken' ? { problem: at.problem } : {}), ...removedBetween(content, keptRows(rel), parts.milestone) };
  } catch {
    return { rel, markers: 'absent' };
  }
}

// Why an ID cannot be a unit here, or null.
function idRefusal(baseDir, id, storeKey) {
  try {
    assertUnitId(baseDir, id, storeKey ? { storeKey } : {});
    return null;
  } catch (err) {
    return String(err.message);
  }
}

// The `--also` list, checked: {declared} or {refusal}.
function readAlso(baseDir, also, named, storeKey) {
  if (also === undefined || also === null) return { declared: [] };
  if (!Array.isArray(also)) return { refusal: '--also could not be read: it takes <ID>:dropped:<words>, once per unit.' };
  const declared = [];
  const seen = new Set();
  const namedLower = new Map([...named].map((id) => [id.toLowerCase(), id]));
  for (const raw of also) {
    const { id, reason, words } = raw ?? {};
    const label = typeof id === 'string' ? shownText(id, 40) : '(no ID)';
    if (typeof id !== 'string' || id === '') return { refusal: '--also needs an ID: <ID>:dropped:<words>. Nothing was written.' };
    const why = idRefusal(baseDir, id, storeKey);
    if (why !== null) return { refusal: `--also ${label}: ${why} Nothing was written.` };
    if (!ALSO_REASONS.includes(reason)) {
      return { refusal: `--also ${label}: only "dropped" can be declared (got ${JSON.stringify(shownText(String(reason ?? ''), 40))}) — `
        + 'a unit that shipped is proposed from its own evidence, never declared. Nothing was written.' };
    }
    if (typeof words !== 'string' || shownText(words, NOTE_MAX) === '') {
      return { refusal: `--also ${label}: a dropped unit needs words — where the work went, or why it stopped (<ID>:dropped:<words>). Nothing was written.` };
    }
    const twin = namedLower.get(id.toLowerCase());
    if (twin !== undefined) {
      return { refusal: twin === id
        ? `--also ${label}: this project already names ${id} (it is in the list below), so it cannot be declared. Nothing was written.`
        : `--also ${label}: it differs only by letter case from ${twin}, which this project names. Nothing was written.` };
    }
    if (seen.has(id.toLowerCase())) return { refusal: `--also ${label} is given twice (or twice differing only by case). Nothing was written.` };
    seen.add(id.toLowerCase());
    declared.push({ id, reason, words: shownText(words, NOTE_MAX), uncut: words });
  }
  return { declared: declared.sort((a, b) => compareUnitIds(a.id, b.id)) };
}

/**
 * Plan a unit record for every unit a project names. Reads only.
 *
 * @param {string} baseDir — project root
 * @param {{also?: Array<{id: string, reason: 'dropped', words: string}>, storeKey?: string}} [opts]
 *   `also`: units no source names, declared by the person (`--also <ID>:dropped:<words>`);
 *   `storeKey`: the store's key, for the item-ID-shape rule (read from the project when not passed)
 * @returns {Promise<{refusal: string} | {units: object[], proposedCloses: object[], flagged: object[],
 *   refused: object[], declared: object[], notes: string[], current: string|null,
 *   milestone: {rel: string, markers: 'ok'|'none'|'broken'|'absent', removes?: {count: number, kept?: number,
 *   lines: Array<{line: number, text: string, unit?: string}>, digest: string}, header?: {line: number, text: string}}|null,
 *   otherMarked: string[], inputHash: string}>}
 *   `otherMarked`: each milestone file that carries the Epic-table markers and is not the current milestone's
 *   (read only on a project with no unit records, as the rows are).
 *   `milestone.removes` (only with `markers: 'ok'` and at least one such line): what the apply removes
 *   between the markers. Kept nowhere — the lines that are not table rows, and the table rows whose
 *   cells go into no unit record (a row for an ID that gets none, a second row for one unit, a row that
 *   could not be read as an Epic row). Kept in a record (`kept` of them, each line with its `unit`) — a
 *   row for an Epic of another milestone, which the generated table does not print.
 *   `milestone.header`: the old table's header row, when it is not the generated table's three columns.
 *   Each unit: `{id, proposal: 'open'|'legacy-close'|'dropped'|'refused', flag: string|null, evidence: string[],
 *   against: string[], open_items?: string[], reason?: string, sources: string[], row: {file, line, cells}|null, retro: string,
 *   retro_path: string|null}` — `evidence` and `against` are sentences; `reason` is why a refused ID is refused.
 *   Deterministic: the same files give the same plan and the same `inputHash`, which covers every
 *   input read and every proposal made.
 */
export async function planUnits(baseDir, opts = {}) {
  // A `work/units/` folder that cannot be trusted refuses the whole plan
  // (REVIEW pass 1, C-I4): it is not "no unit records", and a plan made as if
  // it were would read the milestone rows the records may have replaced.
  let unitsOn;
  try {
    unitsOn = unitRecordsOn(baseDir);
  } catch (err) {
    return { refusal: `Unit records could not be planned, so nothing was written: ${err.message}` };
  }
  const notes = [];
  const units = new Map();
  const unit = (id) => {
    if (!units.has(id)) units.set(id, { id, named: new Set(), row: null, retro: null, archive: [], items: 0, openItems: [], files: [] });
    return units.get(id);
  };

  const markedFiles = [];
  const rows = readMilestoneRows(baseDir, notes, markedFiles);
  const extraRows = [];
  for (const row of rows) {
    const u = unit(row.id);
    u.named.add('milestone row');
    if (u.row === null) u.row = { file: row.file, line: row.line, cells: row.cells };
    else extraRows.push(row);
  }
  if (extraRows.length > 0) {
    notes.push(`A unit with more than one milestone row keeps its first. Not used: ${extraRows.map((r) => `${r.id} at ${r.file}:${r.line}`).join(', ')}.`);
  }

  const retros = readRetros(baseDir, notes);
  for (const retro of retros) {
    const u = unit(retro.id);
    u.named.add('retrospective');
    if (u.retro === null) u.retro = retro;
  }

  const archiveDirs = readArchiveDirs(baseDir);
  for (const dir of archiveDirs) {
    const u = unit(dir.id);
    u.named.add('archive folder');
    u.archive.push(dir.path);
  }

  const membership = readMembership(baseDir, notes);
  for (const [itemId, id, status] of membership) {
    const u = unit(id);
    u.named.add('work items');
    u.items += 1;
    if (status !== 'C') u.openItems.push(itemId);
  }

  const rootFiles = entries(join(baseDir, PLANNING)).filter((e) => e.isFile()).map((e) => e.name);
  const derived = [...deriveUnits(rootFiles).units].sort(([a], [b]) => byText(a, b));
  for (const [id, files] of derived) {
    const u = unit(id);
    u.named.add('files in .planning/');
    u.files = files;
  }

  const current = readCurrent(baseDir, notes);
  if (current !== null) unit(current).named.add('STATE.md (current)');

  // A marked table in another milestone's file is written from the records
  // too, and nothing a person typed there is replaced unseen. Each such file
  // is noted here; what changes between its markers is listed by the dry run
  // once the list to import is known (`milestoneTableWrites`), and a run that
  // builds the store beside the project refuses on one (`otherMarked`).
  const currentParts = epicIdParts(current);
  const otherMarked = [];
  for (const rel of markedFiles) {
    if (currentParts !== null && rel === `${PLANNING}/MILESTONE-${currentParts.milestone}.md`) continue;
    otherMarked.push(rel);
    notes.push(`${rel} carries the Epic-table markers too, and it is not the current milestone's file: its Epic rows are written from the unit `
      + 'records as well. A row there that is not one Epic\'s own, or a line that is not a table row, refuses the apply and is never deleted. '
      + 'To leave that file exactly as it is, take the two marker lines out of it first.');
  }

  const closures = await resolveClosures(baseDir);
  const resolver = new Map(closures.units.map((c) => [c.unit, { status: c.status, reason: c.reason ?? null }]));

  let storeKey = opts.storeKey;
  if (storeKey === undefined) {
    try {
      const store = isStoreOn(baseDir);
      storeKey = store.on ? store.key : undefined;
    } catch {
      storeKey = undefined;
    }
  }

  // Which IDs cannot be units: an illegal one, then any that differ only by case.
  const refusedWhy = new Map();
  for (const id of units.keys()) {
    const why = idRefusal(baseDir, id, storeKey);
    if (why !== null) refusedWhy.set(id, why);
  }
  for (const group of caseTwins([...units.keys()].filter((id) => !refusedWhy.has(id)))) {
    for (const id of group) {
      const others = group.filter((o) => o !== id);
      refusedWhy.set(id, `${id} differs only by letter case from ${others.join(', ')} — two units cannot differ only by case. `
        + 'No record is created for either; rename one where it is named, then run this again.');
    }
  }

  const also = readAlso(baseDir, opts.also, new Set(units.keys()), storeKey);
  if (also.refusal) return { refusal: also.refusal };

  const planned = [];
  for (const u of [...units.values()].sort((a, b) => compareUnitIds(a.id, b.id))) {
    const base = {
      id: u.id,
      sources: [...u.named],
      row: u.row,
      retro: u.retro ? u.retro.status : 'none',
      retro_path: u.retro ? u.retro.path : null,
    };
    if (refusedWhy.has(u.id)) {
      planned.push({ ...base, id: shownText(u.id, 100), proposal: 'refused', flag: null, evidence: [], against: [], reason: refusedWhy.get(u.id) });
      continue;
    }
    const evidence = [];
    const against = [];
    let rowUnclear = false;
    if (u.row !== null) {
      // The rule reads the cell as a person is shown it: an invisible
      // character cannot hide "parked" from the rule and leave it on screen.
      const status = printable(u.row.cells[1]);
      const where = `${u.row.file.replace(`${PLANNING}/`, '')}:${u.row.line}`;
      if (SHIPPED_RE.test(status)) {
        const also2 = status.match(NOT_OVER_RE);
        if (also2) {
          rowUnclear = true;
          against.push(`its milestone row says shipped and also "${also2[1].toLowerCase()}", so the row is not counted (${where}: ${quoted(status)})`);
        } else if (NOT_SHIPPED_RE.test(status)) {
          against.push(`its milestone row says it did not ship (${where}: ${quoted(status)})`);
        } else if (!LEADS_RE.test(status)) {
          rowUnclear = true;
          against.push(`its milestone row says shipped, but not as the first word of its status, so the row is not counted (${where}: ${quoted(status)})`);
        } else if (leftOver(status) !== null) {
          rowUnclear = true;
          const word = status.match(LEFT_OVER_RE)?.[1] ?? shownText(leftOver(status), 40);
          against.push(`its milestone row says shipped and also "${word.toLowerCase()}", so the row is not counted (${where}: ${quoted(status)})`);
        } else {
          evidence.push(`its milestone row says shipped (${where}: ${quoted(status)})`);
        }
      } else {
        against.push(`its milestone row does not say shipped (${where}: ${quoted(status)})`);
      }
    }
    if (u.retro !== null) {
      if (u.retro.status === RETRO_STATUS.COMPLETE) evidence.push(`its retrospective is complete (${u.retro.path})`);
      else if (u.retro.status === RETRO_STATUS.STUB) against.push(`its retrospective is a stub (${u.retro.path})`);
      else if (u.retro.status === 'link') against.push(`its retrospective is a symbolic link and was not read (${u.retro.path})`);
      else against.push(`its retrospective is empty or could not be read (${u.retro.path})`);
    }
    const r = resolver.get(u.id);
    if (r && u.id !== current) {
      if (r.status === CLOSURE.CLOSED) evidence.push(`today's closure check reads it closed (${shownText(r.reason ?? '', 200)})`);
      else against.push(`today's closure check reads it ${r.status === CLOSURE.OPEN ? 'open' : 'as one it cannot determine'} (${shownText(r.reason ?? '', 200)})`);
    }

    // A unit with an item that is not closed is open, whatever else says it
    // is over: every item is named, so the person can see why.
    if (u.openItems.length > 0) {
      const n = u.openItems.length;
      const named = u.openItems.slice(0, OPEN_ITEMS_SHOWN).join(', ');
      against.push(`${n} of its items ${n === 1 ? 'is' : 'are'} not closed: ${named}${n > OPEN_ITEMS_SHOWN ? `, and ${n - OPEN_ITEMS_SHOWN} more` : ''}`);
    }

    let proposal = 'open';
    let flag = null;
    if (u.id === current) {
      if (evidence.length > 0) flag = 'current-but-looks-finished';
    } else if (u.openItems.length > 0) {
      if (evidence.length > 0) flag = 'looks-finished-with-open-items';
    } else if (evidence.length > 0) {
      proposal = 'legacy-close';
    } else if (rowUnclear) {
      flag = 'row-unclear';
    }
    planned.push({
      ...base, proposal, flag, evidence, against, current: u.id === current,
      ...(u.openItems.length > 0 ? { open_items: u.openItems } : {}),
    });
  }
  for (const d of also.declared) {
    planned.push({
      id: d.id, sources: ['--also'], row: null, retro: 'none', retro_path: null,
      proposal: 'dropped', flag: null, evidence: [`declared with --also: ${quoted(d.words)}`], against: [], words: d.words, current: false,
      // The words as given, for the sensitive-data scan only (`uncutSources`): they are stored cut.
      ...(d.uncut !== d.words ? { words_uncut: d.uncut } : {}),
    });
  }
  planned.sort((a, b) => compareUnitIds(a.id, b.id));

  // The rows whose cells an import of this plan stores, each with its unit:
  // the first row of each unit that gets a record. Every other row between the
  // markers is removed and kept nowhere, and the dry run must say so.
  const keptRows = (rel) => (unitsOn ? null
    : new Map(planned.filter((p) => p.proposal !== 'refused' && p.row?.file === rel).map((p) => [p.row.line, p.id])));
  const milestone = milestoneMarkers(baseDir, current, keptRows);
  const inputHash = hashState(JSON.stringify({
    v: 1,
    files: derived,
    rows: rows.map((r) => [r.file, r.line, r.id, r.cells]),
    retros: retros.map((r) => [r.id, r.path, r.status]),
    archive: archiveDirs.map((d) => [d.id, d.path]),
    current,
    items: membership.map(([itemId, id]) => [itemId, id]),
    also: also.declared.map((d) => [d.id, d.reason, d.words]),
    proposals: planned.map((p) => [p.id, p.proposal, p.flag, p.evidence, p.against, p.reason ?? null]),
    notes,
    milestone,
    storeKey: storeKey ?? null,
  }));

  return {
    units: planned,
    proposedCloses: planned.filter((p) => p.proposal === 'legacy-close'),
    flagged: planned.filter((p) => p.flag !== null),
    refused: planned.filter((p) => p.proposal === 'refused'),
    declared: planned.filter((p) => p.proposal === 'dropped'),
    notes,
    current,
    milestone,
    otherMarked,
    inputHash,
  };
}

/**
 * The milestone files whose Epic table a regeneration writes once `units` are
 * the project's unit records — what `regenerateViews` does (`work-views.js`
 * `milestoneTables`), asked before any record is written, so that the dry run
 * names every file the apply writes (r6, SIG-310). Looked at: the current
 * milestone's file, then the file of each other milestone that has an Epic
 * among `units`. Listed: each that is a regular file, carries the markers,
 * and whose table would change. Reads only.
 *
 * @param {string} baseDir
 * @param {string|null} currentRel — the current milestone's file (`plan.milestone.rel`), or null
 * @param {object[]} units — every unit there would be: `listUnits(...).units`, and `importUnitsEntries(...)` of the list
 * @param {{replaceTyped?: boolean}} [opts] — `replaceTyped`: the apply writes the current file's table over what a
 *   person typed between its markers (`importUnits`' `replaceTableRows`). Never another file's
 * @returns {Array<{rel: string, current: boolean, replaced: Array<{line: number, text: string}>, added: string[],
 *   typed: Array<{line: number, text: string}>}>} `replaced`: each row of the table there now that the new table
 *   does not hold; `added`: each row of the new table that is not there now; `typed`: the rows and lines a person
 *   typed between the markers that the new table would not print again — with any, the regeneration refuses,
 *   and this file is not written (nor is anything else)
 */
export function milestoneTableWrites(baseDir, currentRel, units, opts = {}) {
  const others = new Set();
  for (const u of units) {
    const parts = epicIdParts(u.id);
    if (parts !== null && parts.parts.length <= 2) others.add(`${PLANNING}/MILESTONE-${parts.milestone}.md`);
  }
  others.delete(currentRel);
  const numberOf = (rel) => rel.slice(PLANNING.length + 1).match(MILESTONE_FILE_RE)?.[1] ?? null;
  const files = [
    ...(currentRel === null ? [] : [currentRel]),
    ...[...others].sort((a, b) => parseFloat(numberOf(a)) - parseFloat(numberOf(b)) || byText(a, b)),
  ];
  const out = [];
  for (const rel of files) {
    const milestone = numberOf(rel);
    if (milestone === null || regularFileRefusal(baseDir, rel) !== null) continue;
    let content;
    let table;
    let text;
    try {
      content = readRegularFile(baseDir, rel);
      if (epicMarkers(content).state !== 'ok') continue;
      table = renderEpicTable(units, { milestone });
      text = upsertEpicTable(content, table);
    } catch {
      continue;
    }
    if (text === content) continue;
    const current = rel === currentRel;
    const typed = current && opts.replaceTyped === true ? [] : [
      ...rowsNotReprinted(content, table, { milestone, ids: units.map((u) => u.id), legacy: legacyFirstCells(units, { milestone }) }),
      ...linesBetweenMarkers(content),
    ].sort((a, b) => a.line - b.line).map((l) => ({ line: l.line, text: l.text }));
    // The separator row is the same in both tables, and is not listed.
    const was = tableBetweenMarkers(content);
    const now = table.split('\n').filter((_, i) => i !== 1);
    const old = [...(was.header === null ? [] : [was.header]), ...was.rows];
    const [inNow, inOld] = [new Set(now), new Set(old.map((l) => l.text.trim()))];
    out.push({
      rel,
      current,
      replaced: old.filter((l) => !inNow.has(l.text.trim())).map((l) => ({ line: l.line, text: l.text })),
      added: now.filter((l) => !inOld.has(l)),
      typed,
    });
  }
  return out;
}

// How many replaced or added rows of one table the dry run prints; the rest are counted.
const TABLE_ROWS_SHOWN = 20;

// What changes between one file's markers, as indented lines.
function tableChangeLines(t) {
  if (t === undefined) return [];
  if (t.typed.length > 0) {
    const named = t.typed.slice(0, REMOVED_SHOWN).map((l) => `line ${l.line} (${quoted(l.text)})`).join('; ');
    const more = t.typed.length > REMOVED_SHOWN ? `, and ${t.typed.length - REMOVED_SHOWN} more` : '';
    return [`  As the file stands the apply is refused and nothing is written: ${named}${more} between its markers was typed by hand, and the table `
      + 'would not print it again. Move it outside the two marker lines — or take the two marker lines out of the file — then run the dry run again.'];
  }
  const rows = [
    ...t.replaced.map((l) => `  line ${l.line} is replaced: ${quoted(l.text)}`),
    ...t.added.map((l) => `  added: ${quoted(l)}`),
  ];
  return rows.length > TABLE_ROWS_SHOWN ? [...rows.slice(0, TABLE_ROWS_SHOWN), `  … and ${rows.length - TABLE_ROWS_SHOWN} more.`] : rows;
}

/**
 * The dry run's lines for each milestone file OTHER than the current one that
 * the apply writes (`milestoneTableWrites`): the file, and what changes
 * between its markers — once when the answer to the proposed closes makes no
 * difference, else under each answer. Empty when there is no such file.
 *
 * @param {{confirmed: object[], unconfirmed: object[]}} tables — `milestoneTableWrites`' for each answer
 * @returns {string[]} lines
 */
export function otherTablesReportLines(tables) {
  const lines = [];
  const of = (list, rel) => list.find((t) => t.rel === rel && !t.current);
  const rels = [...new Set([...tables.confirmed, ...tables.unconfirmed].filter((t) => !t.current).map((t) => t.rel))];
  for (const rel of rels) {
    const [yes, no] = [of(tables.confirmed, rel), of(tables.unconfirmed, rel)];
    lines.push('', `${rel} carries the Epic-table markers and is another milestone's file: --apply writes its Epic table from the unit records too, `
      + 'and leaves it staged with the rest. Nothing outside its two marker lines changes. Between them:');
    if (JSON.stringify(yes) === JSON.stringify(no)) {
      lines.push(...tableChangeLines(yes));
    } else {
      for (const [words, t] of [['confirmed', yes], ['not confirmed', no]]) {
        lines.push(`  If the proposed closes are ${words}:${t === undefined ? ' nothing in it changes.' : ''}`, ...tableChangeLines(t));
      }
    }
  }
  return lines.map(printable);
}

/**
 * A plan narrowed to the units that have no record yet (REVIEW pass 1, C-I5,
 * `D-M6E16-23`) — for a project that already has unit records. `existing` is
 * every ID that has a record; a unit among them is taken out of every list,
 * and the plan gains `existing` (sorted). Nothing else changes: the proposals
 * are the full plan's, made by the same rule.
 *
 * @param {object} plan — `planUnits`'s
 * @param {string[]} existing
 * @returns {object}
 */
export function planForUnitsWithoutRecord(plan, existing) {
  const has = new Set(existing);
  const units = plan.units.filter((u) => !has.has(u.id));
  return {
    ...plan,
    units,
    proposedCloses: units.filter((p) => p.proposal === 'legacy-close'),
    flagged: units.filter((p) => p.flag !== null),
    refused: units.filter((p) => p.proposal === 'refused'),
    declared: units.filter((p) => p.proposal === 'dropped'),
    existing: [...has].sort((a, b) => compareUnitIds(a, b)),
  };
}

/**
 * The units this project names — by the sources `planUnits` reads: a
 * retrospective, an archive folder, an item's event, files in `.planning/`,
 * `STATE.md`'s current unit — that have NO unit record, on a project that has
 * unit records. Each is still judged from its files (AC6.2, amended at REVIEW
 * pass 1), and `/sig:docs-migrate --work-store` proposes a record for it. A
 * name that cannot be a unit ID is not listed: it can get no record. A record
 * that does not read counts as a record (the sweep reports it on its own).
 *
 * @param {string} baseDir
 * @returns {Promise<string[]>} by unit ID; empty on a project with no unit records
 * @throws {WorkStoreError} when `units/` cannot be trusted or listed, or the plan is refused
 */
export async function unitsWithoutRecord(baseDir) {
  if (!unitRecordsOn(baseDir)) return [];
  const listed = listUnits(baseDir);
  const has = new Set([...listed.units, ...listed.broken].map((u) => u.id).filter((id) => id !== null));
  const plan = await planUnits(baseDir);
  if (plan.refusal) throw new WorkStoreError('CONFIG', plan.refusal);
  return plan.units.filter((u) => u.proposal !== 'refused' && !has.has(u.id)).map((u) => u.id);
}

const FLAG_WORDS = {
  'current-but-looks-finished': 'it is the current unit (STATE.md) and there is evidence it is over — a unit being worked is open',
  'row-unclear': 'its milestone row says shipped and something else, and nothing else says it is over',
  'looks-finished-with-open-items': 'there is evidence it is over, and it has items that are not closed — a unit with an open item is open',
};

const sentence = (parts) => parts.join('; ');

/**
 * The list `importUnits` writes for a plan (t7.1). A refused unit is not in
 * it. A proposed legacy close is written closed only with `confirmCloses`;
 * otherwise open, with a note saying it looked finished. Every unit that has a
 * milestone row carries the row's cells (`legacy_row`), open or closed, so
 * nothing the row said is lost: the generated table prints them for a unit
 * closed as legacy, and for any other prints a status of its own beside the
 * row's third cell, which an open unit also carries as its `summary`.
 *
 * @param {{units: object[]}} plan — `planUnits`'s
 * @param {{confirmCloses?: boolean, at: string, by?: string}} opts — `at`: the day the records are written
 * @returns {object[]}
 */
export function unitImportList(plan, { confirmCloses = false, at, by = 'migration' }) {
  const out = [];
  for (const u of plan.units) {
    if (u.proposal === 'refused') continue;
    if (u.proposal === 'dropped') {
      out.push({ id: u.id, close: { reason: 'dropped', words: u.words, at, by } });
      continue;
    }
    const found = u.evidence.length > 0 ? ` Found: ${sentence(u.evidence)}.` : '';
    const but = u.against.length > 0 ? ` Also found: ${sentence(u.against)}.` : '';
    const summary = u.row && /\S/.test(u.row.cells[2]) ? shownText(u.row.cells[2], SUMMARY_MAX) : undefined;
    if (u.proposal === 'legacy-close' && confirmCloses === true) {
      out.push({
        id: u.id,
        ...(u.row ? { legacy_row: u.row.cells } : {}),
        migration_note: cut(`Recorded as closed (legacy) when unit records were added: a person confirmed the list it was in.${found}${but}`, NOTE_MAX),
        close: { reason: 'legacy', words: 'over before unit records existed; recorded when they were added', at, by },
      });
      continue;
    }
    let note;
    if (u.proposal === 'legacy-close') note = `It looked finished when unit records were added, and the close was not confirmed, so it was left open.${found}${but}`;
    else if (u.flag !== null) note = `Left open when unit records were added: ${FLAG_WORDS[u.flag]}.${found}${but}`;
    out.push({
      id: u.id,
      ...(summary ? { summary } : {}),
      ...(u.row ? { legacy_row: u.row.cells } : {}),
      ...(note ? { migration_note: cut(note, NOTE_MAX) } : {}),
      opened: { at, by },
    });
  }
  return out;
}

// Every text an import of this plan would write, for the sensitive-data scan
// — as the writer stores it (`importUnitsTexts`, which cleans each text with
// the function `importUnits` uses), not as the project's files hold it
// (REVIEW pass 1, S-M3): the raw cell and the stored cell differ by every
// invisible character, and a key split by one passed a scan of the raw cell.
// Both lists are scanned, the confirmed one and the unconfirmed one: which is
// written depends on an answer given after the scan, and they hold different
// fields of the same row (the whole old row, or its third cell as a summary).
//
// And each source text WHOLE, with only its invisible characters taken out
// (`uncutSources`): a stored text is cut at its limit, so a key that straddles
// the cut is stored in part and matched nowhere — the part that is kept is
// still a leak. The whole text is what a person would be asked about.
export function unitImportTexts(plan) {
  const seen = new Set();
  return [
    ...[true, false].flatMap((confirmCloses) => importUnitsTexts(unitImportList(plan, { confirmCloses, at: '2000-01-01' }))),
    ...uncutSources(plan),
  ]
    .filter((t) => {
      const key = `${t.id}\u0000${t.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// The texts an import is built from, uncut: each cell of a unit's milestone
// row, and the words of a unit declared with `--also`.
function uncutSources(plan) {
  const out = [];
  for (const u of plan.units) {
    if (u.proposal === 'refused') continue;
    for (const cell of u.row?.cells ?? []) if (typeof cell === 'string' && cell !== '') out.push({ id: u.id, text: printable(cell) });
    if (typeof u.words_uncut === 'string') out.push({ id: u.id, text: printable(u.words_uncut) });
  }
  return out;
}

// How many units, and how many lines of each list under them, a report
// prints; the rest are counted. No project has near this many units: the cap
// is for a repository built to make the report huge.
const REPORT_UNITS_MAX = 500;
const capped = (list, lines, what) => {
  const shown = list.slice(0, REPORT_UNITS_MAX);
  const more = list.length - shown.length;
  return more > 0 ? [...shown.map(lines), `  … and ${more} more ${what}, not listed here (the list is cut at ${REPORT_UNITS_MAX}).`] : shown.map(lines);
};

const PROPOSAL_WORDS = {
  open: 'open',
  'legacy-close': 'proposed: closed (legacy)',
  dropped: 'closed (dropped) — declared',
  refused: 'refused — no record',
};

/**
 * The plan as a person reads it before they confirm: every unit with its
 * proposal and why, then the proposed legacy closes as one list, the flagged
 * units, the refused IDs, the declared ones, and what the current milestone
 * file's markers say. Every line is printable and cut.
 *
 * @param {object} plan — `planUnits`'s
 * @returns {string[]} lines
 */
export function unitsReportLines(plan) {
  const lines = [];
  const n = plan.units.length;
  if (Array.isArray(plan.existing)) {
    // A project that already has unit records: only the units with none.
    const had = plan.existing.length;
    lines.push(`Unit records to add — the units this project names that have no record yet (${n} listed; `
      + `${had} unit${had === 1 ? '' : 's'} already ${had === 1 ? 'has' : 'have'} a record and ${had === 1 ? 'is' : 'are'} not touched):`);
    if (plan.units.every((u) => u.proposal === 'refused')) {
      lines.push('  every unit this project names that can have a record has one — there is nothing to add.');
    }
    // What this list cannot see, said every time (AC7.3: with unit records no milestone row is read).
    lines.push('  A unit named only by a row of a milestone table is not listed: with unit records the rows are generated, and not read. '
      + 'Give such a unit a record by hand (openUnit; see /sig:docs-archive, "Holding a unit"), or declare it dropped with --also.');
  } else {
    lines.push(`Unit records — one record per Epic or unit this project names (${n} named):`);
    if (n === 0) lines.push('  none — the folder for unit records is created empty.');
  }
  lines.push(...capped(plan.units, (u) => {
    const why = u.proposal === 'refused' ? u.reason
      : sentence([...(u.current ? ['the current unit'] : []), ...u.evidence, ...(u.proposal === 'open' ? u.against : [])]) || `named by ${u.sources.join(', ')}; nothing says it is over`;
    return `  ${u.id}  ${PROPOSAL_WORDS[u.proposal]}${u.flag ? `  [flagged: ${u.flag}]` : ''}  — ${shownText(why, 400)}`;
  }, 'units'));
  if (plan.proposedCloses.length > 0) {
    lines.push('', `Proposed legacy closes (${plan.proposedCloses.length}) — confirm to record these units as closed; if you say no, each is created open, `
      + 'with a note saying it looked finished. Unit, the evidence:');
    lines.push(...capped(plan.proposedCloses, (u) => (
      `  ${u.id}  — ${shownText(sentence(u.evidence), 400)}${u.against.length > 0 ? `  (also: ${shownText(sentence(u.against), 300)})` : ''}`
    ), 'proposed closes — a yes confirms these too'));
  }
  if (plan.flagged.length > 0) {
    lines.push('', `Flagged (${plan.flagged.length}) — created open, each with a note; look at them after the apply:`);
    lines.push(...capped(plan.flagged, (u) => `  ${u.id}  — ${FLAG_WORDS[u.flag]}`, 'flagged units'));
  }
  if (plan.refused.length > 0) {
    lines.push('', `Refused (${plan.refused.length}) — no record is created:`);
    lines.push(...capped(plan.refused, (u) => `  ${u.id}  — ${shownText(u.reason, 400)}`, 'refused IDs'));
  }
  if (plan.declared.length > 0) {
    lines.push('', `Declared with --also (${plan.declared.length}) — created closed as dropped:`);
    lines.push(...capped(plan.declared, (u) => `  ${u.id}  — ${quoted(u.words)}`, 'declared units'));
  }
  if (plan.milestone !== null) {
    const { rel, markers, removes, header } = plan.milestone;
    lines.push('', markers === 'ok'
      ? `${rel} carries the Epic-table markers: its Epic rows are written from the unit records by the apply.`
      : markers === 'none'
        ? `${rel} has no Epic-table markers, so it is left exactly as it is. To have its Epic rows generated, put \`${EPICS_BEGIN}\` on the line before `
          + `the table and \`${EPICS_END}\` on the line after it, by hand, after the apply. This command never adds them.`
        : markers === 'broken'
          ? `${rel}: its Epic-table markers are broken (${plan.milestone.problem}).`
          : `${rel} is not there (or is not a regular file): no Epic table is written.`);
    if (markers === 'ok' && header) {
      lines.push(`  The table is rewritten as three columns (| Epic | Status | Summary |): its header now is ${quoted(header.text)} (line ${header.line}). `
        + 'The cells of each old row are kept in its unit record (legacy_row), whatever the table prints.');
    }
    if (markers === 'ok' && removes) {
      const kept = removes.kept ?? 0;
      const nowhere = removes.count - kept;
      const one = nowhere === 1;
      const why = 'a line that is not a table row, or a row whose cells go into no unit record (its ID gets none, or it is a second row for one '
        + 'unit, or it could not be read as an Epic row)';
      const otherMilestone = 'a row for an Epic of another milestone, which this table does not print: its cells stay in that unit\'s record';
      if (kept === 0) {
        lines.push(`  Everything between the two marker lines is replaced. ${removes.count} line${one ? '' : 's'} between the markers `
          + `${one ? 'is' : 'are'} kept nowhere and ${one ? 'is' : 'are'} removed by the apply — ${why}. Move ${one ? 'it' : 'them'} `
          + `outside the markers first to keep ${one ? 'it' : 'them'}:`);
      } else if (nowhere === 0) {
        lines.push(`  Everything between the two marker lines is replaced. ${kept} row${kept === 1 ? '' : 's'} between the markers `
          + `${kept === 1 ? 'is' : 'are'} removed by the apply — ${otherMilestone}. Move ${kept === 1 ? 'it' : 'them'} outside the markers first to keep `
          + `${kept === 1 ? 'it' : 'them'} in this file:`);
      } else {
        lines.push(`  Everything between the two marker lines is replaced. ${removes.count} lines between the markers are removed by the apply. `
          + `${nowhere} of them ${one ? 'is' : 'are'} kept nowhere — ${why}. The other${kept === 1 ? '' : `s (${kept})`} ${kept === 1 ? 'is' : 'are'} `
          + `${otherMilestone}. Move a line outside the markers first to keep it in this file:`);
      }
      for (const l of removes.lines) {
        lines.push(`  line ${l.line}: ${quoted(l.text)}${l.unit === undefined ? '' : ` — its cells stay in the unit record of ${l.unit} (legacy_row)`}`);
      }
      if (removes.count > removes.lines.length) lines.push(`  … and ${removes.count - removes.lines.length} more.`);
    }
  }
  for (const note of plan.notes) lines.push('', `Note: ${shownText(note, 400)}`);
  return lines.map(printable);
}
