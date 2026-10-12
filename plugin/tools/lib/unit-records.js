// The unit-record library (M6.E16.S2) — one JSON record per Epic or unit, at
// a path fixed by its ID, its status and hold folded from its events.
//
//   .planning/work/units/<ID>.json     the record (`unit-record.js`, `UNIT_KIND`)
//
// A unit is an Epic (`M6.E16`) or a project's own unit name (`phase-11`,
// `GATE-A`, `v0.1.6`). The folder is flat: a unit ID has no number to bucket
// by, and a project has tens of units where it has thousands of items.
//
// Every change to a unit record goes through a writer here and appends
// exactly one event (AC2.1; `tests/unit-records-inventory.test.js` runs each
// one) — except `rerequestUnitClose`, which appends two real events in one
// write. `importUnit` and `importUnits` (t7.1) create records, each with its
// one first event: a unit recorded as already over, or as open, by the
// migration. Writers take the store's ONE lock through the shared helpers in
// `work-write.js` — the same lock item writers take, so a unit write and an
// item write exclude each other.
//
// Views: every writer here regenerates the store's views after its record
// lands, as an item writer does (M6.E16 t5.0b) — `EPICS.md` and the live
// milestone's Epic table are rendered from these records (`work-views.js`).
// And as for items, what the views would refuse is checked under the lock
// BEFORE the write (`assertViewsWritable`, after the writer's own refusals),
// so no record lands that the views cannot show; a regeneration that fails after the write leaves the change
// standing and throws an error that says so (`err.changeStands`).
// `ensureUnitsDir` writes no record and regenerates nothing.
//
// Reading: records are read only as regular files. `units/` must be a real
// folder (not a link) inside a `work/` that resolves inside the project, and a
// record is found by listing the folder and matching its file name exactly —
// never by opening a path built from the ID, which on a disk that ignores case
// would open `M6.E16.json` for `m6.e16`.
//
// No function here calls git with a unit name. The one git call is the
// request-time check that a short commit hash names one commit, and its only
// argument from the caller is that hash, already matched as lowercase hex.

import { execFileSync } from 'node:child_process';
import {
  accessSync, constants, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { cut, printable as printableText } from './printable-text.js';
import { PHASES } from './state.js';
import { isSafeUnitName } from './unit-name.js';
import {
  CLOSE_WORDS_MAX, LEGACY_CELL_MAX, UNIT_KIND, UNIT_NOTE_MAX, UNIT_REASON_MAX, UNIT_REF_MAX, UNIT_SCHEMA, UNIT_SUMMARY_MAX,
  UNIT_TITLE_MAX, foldUnit,
} from './unit-record.js';
import { asWorkStoreError, WorkStoreError } from './work-errors.js';
import { assertWritable } from './work-records.js';
// A cycle, by design: work-views.js renders these records (`listUnits`).
// Neither module uses the other's bindings while it is being evaluated.
import { assertViewsWritable, regenerateToMemory, regenerateViews, viewsNotRegenerated } from './work-views.js';
import { isStoreOn, WORK_DIR } from './work-store.js';
import {
  commitsStartingWith,
  confine,
  existsNoFollow,
  recordWriter,
  regenerateAfter,
  sensitivePending,
  withEvent,
  withWorkLock,
} from './work-write.js';

const UNITS_DIR = 'units';
const WORK_REL = `.planning/${WORK_DIR}`;

/** Where unit records live, repo-root-relative. */
export const UNITS_REL = `${WORK_REL}/${UNITS_DIR}`;

const relOf = (id) => `${UNITS_REL}/${id}.json`;

// ── The ID rule (t2.4, AC1.3) ───────────────────────────────────────────────

// A value as it may appear in a message: at most 40 characters of it, anything
// outside printable ASCII written as an escape. A hostile name (10 kB, a
// newline, an invisible character) never reaches a message whole or raw.
function shown(value) {
  if (typeof value !== 'string') return value === null ? 'null' : `a ${Array.isArray(value) ? 'list' : typeof value}`;
  const head = value.slice(0, 40).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
  return value.length > 40 ? `"${head}..." (${value.length} characters)` : `"${head}"`;
}

// The charset and length rule, which is what makes an ID safe as a file name:
// `isSafeUnitName` (`unit-name.js`), reused so the archive and the store
// cannot disagree about what a unit name is.
function assertShape(id) {
  if (!isSafeUnitName(id)) {
    throw new WorkStoreError('SCHEMA', `${shown(id)} is not a unit ID: 1 to 100 characters, letters, digits, `
      + '".", "_" and "-", starting with a letter or digit, with no "..".');
  }
}

// Why a well-shaped ID may still not name a unit, or null: it is a phase
// name, or it is shaped like one of this project's item IDs. Compared without
// case, as the case-twin rule is.
function idCollision(id, storeKey) {
  const lower = id.toLowerCase();
  if (PHASES.some((p) => p.toLowerCase() === lower)) {
    return `${id} is a phase name, so it cannot be a unit ID`;
  }
  const dash = id.lastIndexOf('-');
  if (typeof storeKey === 'string' && dash > 0
    && id.slice(0, dash).toLowerCase() === storeKey.toLowerCase() && /^[0-9]+$/.test(id.slice(dash + 1))) {
    return `${id} is shaped like one of this project's item IDs (${storeKey}-n), so it cannot be a unit ID`;
  }
  return null;
}

const storeKeyOf = (baseDir) => {
  const store = isStoreOn(baseDir);
  return store.on ? store.key : null;
};

/**
 * Throws unless `id` may name a unit in this project (AC1.3). The rule:
 *
 * - `isSafeUnitName`'s charset and length (1 to 100 of letters, digits, `.`,
 *   `_`, `-`; a letter or digit first; no `..`) — so it is safe as a file name;
 * - not a phase name (`PHASES`, `state.js`), in any case;
 * - not shaped like one of this project's item IDs (`<store key>-<digits>`),
 *   in any case;
 * - not different only by letter case from a unit that has a record. The exact
 *   ID of an existing unit passes: this is the rule for what an ID may be, not
 *   a check that it is unused.
 *
 * @param {string} baseDir
 * @param {unknown} id
 * @param {{storeKey?: string}} [opts] — the store's key; read from the project when not passed (none when the store is off)
 * @throws {WorkStoreError} SCHEMA (the first three), CONFLICT (a case twin, or `units/` is a link)
 */
export function assertUnitId(baseDir, id, opts = {}) {
  assertShape(id);
  const collision = idCollision(id, opts.storeKey ?? storeKeyOf(baseDir));
  if (collision) throw new WorkStoreError('SCHEMA', `${collision}.`);
  const lower = id.toLowerCase();
  const twin = unitFileIds(baseDir).find((other) => other !== id && other.toLowerCase() === lower);
  if (twin !== undefined) {
    throw new WorkStoreError('CONFLICT', `${id} differs only by letter case from the unit ${twin} (${relOf(twin)}) — `
      + 'two IDs that differ only by case cannot both be units. Use the ID as it is recorded.');
  }
}

/**
 * Where a unit's record lives, repo-root-relative:
 * `.planning/work/units/<ID>.json`. A record never moves, so this is a
 * function of the ID. The path is built only after the ID passes
 * `assertUnitId`.
 *
 * @param {string} baseDir
 * @param {string} id
 * @returns {string}
 * @throws {WorkStoreError} as `assertUnitId`
 */
export function unitPath(baseDir, id) {
  assertUnitId(baseDir, id);
  return relOf(id);
}

/**
 * Sets of IDs that differ only by letter case. On a disk that tells case
 * apart both files can exist, and on one that does not they are one file — so
 * the two would be different projects on different machines.
 *
 * @param {string[]} ids
 * @returns {string[][]} each set sorted, the sets sorted by their first ID
 */
export function caseTwins(ids) {
  const byLower = new Map();
  for (const id of new Set(ids)) {
    const lower = id.toLowerCase();
    if (!byLower.has(lower)) byLower.set(lower, []);
    byLower.get(lower).push(id);
  }
  return [...byLower.values()]
    .filter((group) => group.length > 1)
    .map((group) => group.sort())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

// ── Reading ─────────────────────────────────────────────────────────────────

const LINK_REFUSED = 'is a symbolic link — refused; a unit record is read only as a regular file';

// The units folder, or null when there is none. Confined once, here: the
// folder itself may not be a link, and the `work/` it sits in must resolve
// inside the project. Every read and every write goes through this.
function confinedUnitsDir(baseDir) {
  const abs = join(baseDir, UNITS_REL);
  let st;
  try {
    st = lstatSync(abs);
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw new WorkStoreError('IO', `${UNITS_REL}: could not be inspected (${err.code ?? err.message})`);
  }
  if (st.isSymbolicLink()) {
    throw new WorkStoreError('CONFLICT', `${UNITS_REL} is a symbolic link — refused; unit records are read and written `
      + `only in a real folder inside ${WORK_REL}.`);
  }
  if (!st.isDirectory()) throw new WorkStoreError('CONFLICT', `${UNITS_REL} is not a folder — unit records cannot be read from it.`);
  let realRoot;
  let realWork;
  try {
    realRoot = realpathSync(resolve(baseDir));
    realWork = realpathSync(join(baseDir, WORK_REL));
  } catch (err) {
    throw new WorkStoreError('IO', `${WORK_REL}: could not be resolved (${err.code ?? err.message})`);
  }
  if (!realWork.startsWith(realRoot + sep)) {
    throw new WorkStoreError('CONFLICT', `${WORK_REL} resolves outside the project (${realWork}) — a linked folder; `
      + 'unit records are not read through it.');
  }
  // A folder that is there and cannot be listed is not "a folder with no
  // records" (REVIEW pass 1, C-I4): say so here, where every caller asks.
  try {
    accessSync(abs, constants.R_OK | constants.X_OK);
  } catch (err) {
    throw new WorkStoreError('IO', `${UNITS_REL}: could not be read (${err.code ?? err.message}) — the folder is there, and its unit records cannot be listed.`);
  }
  return abs;
}

// The folder's entries, by directory entry type: a link is neither a file nor
// a folder there, so it is never followed.
function unitEntries(baseDir) {
  const abs = confinedUnitsDir(baseDir);
  if (abs === null) return [];
  try {
    return readdirSync(abs, { withFileTypes: true });
  } catch (err) {
    throw new WorkStoreError('IO', `${UNITS_REL}: could not be read (${err.code ?? err.message})`);
  }
}

// `<ID>.json` → the ID, when the stem has a unit ID's shape; otherwise null.
function idFromName(name) {
  if (!name.endsWith('.json')) return null;
  const stem = name.slice(0, -'.json'.length);
  return isSafeUnitName(stem) ? stem : null;
}

// The ID of every record-named file in the folder, whatever is in it.
function unitFileIds(baseDir) {
  return unitEntries(baseDir).map((e) => idFromName(e.name)).filter((id) => id !== null);
}

// A file name as it may appear in a message (the `path` beside it is exact).
const printable = (text) => text.replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

// Every entry of units/: {files: [{id, rel, abs}], broken[]}. Each broken
// entry carries a `code` (`link`, `path`, `not-regular`). `strict`
// (`checkUnits` only) also reports what a read passes over: a folder, and any
// other record-named entry that is not a regular file.
function walkUnits(baseDir, opts = {}) {
  const out = { files: [], broken: [] };
  for (const e of unitEntries(baseDir)) {
    const rel = `${UNITS_REL}/${e.name}`;
    const isJson = e.name.endsWith('.json');
    const id = idFromName(e.name);
    const broken = (code, error) => out.broken.push({ id, path: rel, code, error: `${printable(rel)}${error}` });
    if (e.isSymbolicLink()) {
      if (isJson) broken('link', ` ${LINK_REFUSED}`);
    } else if (e.isDirectory()) {
      if (!opts.strict) continue;
      if (isJson) broken('not-regular', ' is not a regular file — a unit record is a plain file');
      else broken('path', ` is a folder — unit records sit in ${UNITS_REL} itself, and nothing inside a folder there is read`);
    } else if (!e.isFile()) {
      if (opts.strict && isJson) broken('not-regular', ' is not a regular file — a unit record is a plain file');
    } else if (isJson) {
      if (id === null) broken('path', ': file name is not a unit record name (<unit ID>.json)');
      else out.files.push({ id, rel, abs: join(baseDir, rel) });
    }
  }
  return out;
}

function entryOf(record) {
  return { id: record.id, path: relOf(record.id), record, ...foldUnit(record) };
}

// One record file → an entry, or {broken}. Never throws for content. A broken
// entry's `code` says what kind (`unreadable`, `invalid`, `path`, `events`).
function readFileEntry(file) {
  const fail = (error, code) => ({ broken: { id: file.id, path: file.rel, code, error } });
  let text;
  try {
    text = readFileSync(file.abs, 'utf-8');
  } catch (err) {
    return fail(`${file.rel}: could not be read (${err.code ?? err.message})`, 'unreadable');
  }
  const { record, errors } = UNIT_KIND.parseRecord(text, { path: file.rel });
  if (errors.length > 0) return fail(errors.join('; '), 'invalid');
  if (record.id !== file.id) return fail(`${file.rel}: file name says ${file.id} but the record id is ${record.id}`, 'path');
  const eventErrors = UNIT_KIND.checkEvents(record);
  if (eventErrors.length > 0) return fail(`${file.rel}: ${eventErrors.map((e) => e.message).join('; ')}`, 'events');
  return { entry: entryOf(record) };
}

// One unit by ID: its fixed path only, found by its exact file name in the
// folder's listing. null when there is no such file.
function readUnitOne(baseDir, id) {
  const name = `${id}.json`;
  const e = unitEntries(baseDir).find((entry) => entry.name === name);
  if (!e) return null;
  const rel = relOf(id);
  if (!e.isFile()) {
    const error = `${rel} ${e.isSymbolicLink() ? LINK_REFUSED : 'is not a regular file — a unit record is a plain file'}`;
    return { records: [], broken: [{ id, path: rel, code: e.isSymbolicLink() ? 'link' : 'not-regular', error }] };
  }
  const r = readFileEntry({ id, rel, abs: join(baseDir, rel) });
  return r.entry ? { records: [r.entry], broken: [] } : { records: [], broken: [r.broken] };
}

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/**
 * Does this project have unit records: does the `units/` folder exist
 * (`D-M6E16-16`, AC1.6) — a real folder inside the project's `work/`, with or
 * without a record in it. The switch a reader uses to decide between the
 * records and what it did before them. The folder is the switch, as `WORK.md`
 * is for items: with "at least one record" a new project could never get its
 * first one. `ensureUnitsDir` (and the migration) creates it; no other writer
 * does.
 *
 * Needs no store: false when there is no folder, and it creates nothing.
 *
 * @param {string} baseDir
 * @returns {boolean}
 * @throws {WorkStoreError} CONFLICT when `units/` is a link or not a folder, or `work/` resolves outside the project;
 *   IO when the folder is there and cannot be listed
 */
export function hasUnits(baseDir) {
  return confinedUnitsDir(baseDir) !== null;
}

/**
 * `hasUnits` in a form that never throws: `{has, problem}`. On a layout
 * `hasUnits` refuses — `units/` a link or not a folder, `work/` resolving
 * outside the project, a folder that cannot be listed — the answer is
 * `has: false` with the refusal's message in `problem`; `checkUnits` reports
 * the same layout to `/sig:docs-sweep`.
 *
 * ⚠ `has: false` with a `problem` does NOT mean "this project has no unit
 * records": it means nobody can tell (REVIEW pass 1, C-I4, `D-M6E16-22`). A
 * caller deciding between the records and what it did before them asks
 * `unitRecordsOn`, which cannot be read for `.has` alone.
 *
 * @param {string} baseDir
 * @returns {{has: boolean, problem: string|null}} `problem` is null whenever `hasUnits` answered
 */
export function hasUnitsSafe(baseDir) {
  try {
    return { has: hasUnits(baseDir), problem: null };
  } catch (err) {
    return { has: false, problem: err?.message ?? String(err) };
  }
}

/**
 * Does this project have unit records — the ONE question every reader and
 * writer asks before it chooses between the records and what it did before
 * them (`D-M6E16-16`, `D-M6E16-22`).
 *
 * - `true`: `.planning/work/units/` is a real folder that can be listed.
 * - `false`: there is no such folder. The caller behaves as before unit records.
 * - **throws** when the folder is there and cannot be trusted — a symbolic
 *   link, a file, a `work/` that resolves outside the project, a folder that
 *   cannot be listed. That is neither answer, and it must not read as `false`:
 *   a closure reader would go back to the unit's files and could call an open
 *   unit closed; an archive would lose a hold. So a writer or a mover lets the
 *   error through and refuses, and a reader that never throws catches it and
 *   answers its own "cannot tell" with `err.message`.
 *
 * @param {string} baseDir
 * @returns {boolean}
 * @throws {WorkStoreError} `CONFLICT` (a link, a file, a `work/` outside the project) or `IO` (cannot be
 *   inspected or listed), with `unitsFolder: true`; the message names `.planning/work/units/` and the fault
 */
export function unitRecordsOn(baseDir) {
  try {
    return hasUnits(baseDir);
  } catch (cause) {
    const problem = String(cause?.message ?? cause).replace(/[.\s]*$/, '');
    const err = new WorkStoreError(cause instanceof WorkStoreError ? cause.code : 'IO', `${UNITS_REL}/ cannot be trusted, so whether this `
      + `project has unit records is not known: ${problem}. Make ${UNITS_REL}/ a real folder inside the project that can be read (or `
      + 'remove it, if this project has no unit records), then re-run. /sig:docs-sweep reports the same fault.');
    err.unitsFolder = true;
    err.cause = cause;
    throw err;
  }
}

/**
 * Every unit record, each with its folded state.
 *
 * One broken record never stops the others: it is reported in `broken` by ID
 * and path, with the reason and a `code`. A record is broken when its JSON
 * does not parse or validate (`invalid`), its file name is not a unit ID or
 * disagrees with its `id` (`path`), its history does not fold or a field
 * disagrees with its last edit (`events`), it cannot be read (`unreadable`),
 * or it is a symbolic link (`link`).
 *
 * Needs no store: empty when there is no `units/` folder.
 *
 * @param {string} baseDir
 * @returns {{units: Array<{id: string, path: string, record: object, status: 'open'|'closing'|'closed',
 *   held: boolean, hold_reason: string|null, close: object|null, closing_proof: string|null}>,
 *   broken: Array<{id: string|null, path: string, code: string, error: string}>}}
 *   units by ID, broken by path
 * @throws {WorkStoreError} CONFLICT when `units/` is a link, or `work/` resolves outside the project
 */
export function listUnits(baseDir) {
  const walked = walkUnits(baseDir);
  const units = [];
  const broken = [...walked.broken];
  for (const file of walked.files) {
    const r = readFileEntry(file);
    if (r.entry) units.push(r.entry);
    else broken.push(r.broken);
  }
  return { units: units.sort(byId), broken: broken.sort(byPath) };
}

/**
 * One unit, with its folded state.
 *
 * @param {string} baseDir
 * @param {string} id — matched exactly; another case is another ID
 * @returns {{id, path, record, status, held, hold_reason, close, closing_proof}}
 * @throws {WorkStoreError} SCHEMA (not a unit ID's shape, or the record is broken), NOT_FOUND, CONFLICT (a linked folder)
 */
export function getUnit(baseDir, id) {
  assertShape(id);
  const found = readUnitOne(baseDir, id);
  if (found === null) throw new WorkStoreError('NOT_FOUND', `${id}: no such unit`);
  if (found.broken.length > 0) throw new WorkStoreError('SCHEMA', found.broken.map((b) => b.error).join('; '));
  return found.records[0];
}

/**
 * What the records say about whether a unit is over, for a caller deciding
 * what to do with its files:
 *
 * - `'no-record'` — no record under exactly this name (a name that cannot be
 *   a unit ID has none, and never reaches a path);
 * - `'open'` — open, or *closing*: a close that is requested but not confirmed
 *   is not a close;
 * - `'closed'`;
 * - `'held'` — closed, and held: closed, but its files stay live. A hold on a
 *   unit that is not closed changes nothing here; it reads `'open'`.
 *
 * @param {string} baseDir
 * @param {unknown} id
 * @returns {'closed'|'open'|'held'|'no-record'}
 * @throws {WorkStoreError} SCHEMA when the record is broken (a broken record has no honest answer), CONFLICT (a linked folder)
 */
export function unitClosure(baseDir, id) {
  if (!isSafeUnitName(id)) return 'no-record';
  const found = readUnitOne(baseDir, id);
  if (found === null) return 'no-record';
  if (found.broken.length > 0) throw new WorkStoreError('SCHEMA', found.broken.map((b) => b.error).join('; '));
  const unit = found.records[0];
  if (unit.status !== 'closed') return 'open';
  return unit.held ? 'held' : 'closed';
}

/**
 * Check the unit records and report every problem by ID and path, in the
 * shape `checkRecords` (`work-records.js`) reports items in. Read-only. One
 * broken record never stops the others.
 *
 * Codes:
 * - `invalid` — not JSON, or fails the schema; or the record is sound but its
 *   ID is one `assertUnitId` refuses (a phase name, an item-ID shape);
 * - `events` — the history does not fold, or a field disagrees with the last
 *   `edited` that changed it (a change made by hand);
 * - `path` — the file name is not a unit ID, or disagrees with the record's
 *   `id`; or a folder inside `units/`;
 * - `link` — a symlinked record, or `units/` itself linked, or `work/`
 *   resolving outside the project; `not-regular` — a folder or other non-file
 *   named like a record; `unreadable` — could not be read;
 * - `duplicate-id` — records whose IDs differ only by letter case, with
 *   `paths` naming each.
 *
 * A project with no `units/` folder has no findings.
 *
 * @param {string} baseDir
 * @returns {Array<{code: string, id: string|null, path: string, message: string, paths?: string[]}>}
 *   by ID, then path; findings with no ID last
 * @throws {WorkStoreError} CONFIG when there are unit records and WORK.md is broken
 */
export function checkUnits(baseDir) {
  let walked;
  try {
    walked = walkUnits(baseDir, { strict: true });
  } catch (err) {
    if (!(err instanceof WorkStoreError)) throw err;
    return [{ code: err.code === 'CONFLICT' ? 'link' : 'unreadable', id: null, path: UNITS_REL, message: err.message }];
  }
  const findings = walked.broken.map((b) => ({ code: b.code, id: b.id, path: b.path, message: b.error }));

  const storeKey = walked.files.length > 0 ? storeKeyOf(baseDir) : null;
  for (const file of walked.files) {
    const r = readFileEntry(file);
    if (r.broken) {
      findings.push({ code: r.broken.code, id: r.broken.id, path: r.broken.path, message: r.broken.error });
      continue;
    }
    const collision = idCollision(file.id, storeKey);
    if (collision) findings.push({ code: 'invalid', id: file.id, path: file.rel, message: `${file.rel}: ${collision}` });
  }

  for (const group of caseTwins(walked.files.map((f) => f.id))) {
    const paths = group.map(relOf);
    findings.push({
      code: 'duplicate-id',
      id: group[0],
      path: paths[0],
      paths,
      message: `${paths[0]}: ${group.join(', ')} differ only by case (${paths.join(', ')}) — on a disk that ignores case they are one file`,
    });
  }

  return findings.sort((a, b) => {
    if ((a.id === null) !== (b.id === null)) return a.id === null ? 1 : -1;
    return (a.id === null ? 0 : byId(a, b)) || byPath(a, b);
  });
}

// ── Writing (t2.3, AC2.1) ───────────────────────────────────────────────────
//
// Every mutation is a public entry point that takes the `work` lock itself,
// through `withUnitLock`, and hands the lock's handle to internal functions;
// no internal function takes the lock and no lock-taking export calls another
// (`tests/unit-records-inventory.test.js`).
//
// Order inside each mutation, as for items: the ID's shape and the call's own
// arguments; the store check (so a store that is off, or v1, never grows a
// lock file); the sensitive-data gate; the lock; then read the record, build
// the changed one, validate it and check its history BEFORE any write; one
// atomic write, exactly one event appended. Anything refused leaves the record
// byte-identical.
//
// Free text (M6.E16 v2.3): every text field a writer takes — `title`,
// `summary`, `migration_note`, each `legacy_row` cell, a close's or a close
// request's `pr` and `release`, a close's `words`, a hold's or a reopen's
// `reason`, an edit's new values — is stored without control or invisible
// characters and cut at its limit (`clean`; the limits are `unit-record.js`'s),
// before the blank check, the sensitive-data gate and the schema see it. A
// line break becomes a space, so none reaches a record (a two-line title is
// stored as one line; before v2.3 the schema refused it). The renderers clean again whatever they
// read (`work-views.js`, `milestone-table.js`): a record can arrive by a merge.

const WORK_LOCK_LABEL = 'work store';
const COMMIT_RE = new RegExp(UNIT_SCHEMA.$defs.commit.pattern, 'u');
const DIRECT_CLOSE_REASONS = ['dropped', 'legacy'];
// The record fields an `edited` event may change (the schema's `changes`).
// `legacy_row` is not one: it is a list, and a change is a string, a number or null.
const EDITABLE = ['title', 'summary', 'migration_note'];

const nowIso = () => new Date().toISOString();
const isBlank = (text) => typeof text !== 'string' || text.trim() === '';

// Text copied from a hand-written source: no control or invisible characters
// (`printable-text.js`), and cut at `max`. Whitespace is not folded: a cell
// under the limit is kept as it was written.
const kept = (text, max) => cut(printableText(text), max);

// A free-text field as every writer here stores it (M6.E16 v2.3): `kept`, with
// a line break made a space first, so the words on either side stay apart.
// Anything that is not text is passed on as it is, for the schema to refuse.
const clean = (value, max) => (typeof value === 'string' ? kept(value.replace(/\s*[\r\n]+\s*/g, ' '), max) : value);
// A `legacy_row`, as `importUnits` keeps one: each cell `kept`.
const cleanCells = (cells) => (Array.isArray(cells) ? cells.map((c) => (typeof c === 'string' ? kept(c, LEGACY_CELL_MAX) : c)) : cells);
/**
 * A close's `pr` or `release` as a writer here stores it (`clean`, at
 * `UNIT_REF_MAX`) — for a caller that runs the sensitive-data gate before it
 * calls the writer (`closeEpic`, `work-ops.js`), so both scan the same text
 * (REVIEW pass 1, C-S1). Anything that is not text comes back as it is.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export const storedRef = (value) => clean(value, UNIT_REF_MAX);
// The limit of each field an `edited` event may change, and that a record may open with.
const FIELD_MAX = { title: UNIT_TITLE_MAX, summary: UNIT_SUMMARY_MAX, migration_note: UNIT_NOTE_MAX };

function pruneUndefined(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

// The store's one lock (`work-write.js`), over the item library's store check:
// one check of what may be written, not a second.
async function withUnitLock(baseDir, fn) {
  return withWorkLock(baseDir, WORK_LOCK_LABEL, { assertWritable, beforeWrite: () => {} }, fn);
}

// Before a record is written, under the lock: whatever the views would refuse
// refuses the write, so no record lands that the views cannot show (as
// `work-records.js` `viewsWritableOrRefuse`; `_skipViewsCheck` is the same
// seam, for tests only). Called by each writer AFTER its own refusals — the
// record's state, the ID, a file already there — so those are still what a
// caller is told first; an item writer runs the same check first.
function viewsWritableOrRefuse(handle, opts) {
  if (opts._skipViewsCheck === true) return;
  assertViewsWritable(handle.baseDir);
}

// The error for a unit write that landed and whose views then failed to
// regenerate. `changeStands` lets a caller that wraps a failed write in "X was
// not done" (`openEpic`, `closeEpic`) tell this apart: here X was done.
function unitViewsNotRegenerated(done, err) {
  return Object.assign(viewsNotRegenerated(done, err), { changeStands: true });
}

// After a record has landed, under the lock: regenerate the views
// (`opts.regenerate`, default `regenerateViews`, as for items), and return the
// entry. A failure does not undo the write.
async function landed(handle, entry, done, opts) {
  await regenerateAfter(handle, done, opts.regenerate ?? regenerateViews, unitViewsNotRegenerated);
  return entry;
}

// The shared write helpers (`work-write.js`), bound to the unit kind.
const { recordText, readForWrite, writeRecord } = recordWriter({
  kind: UNIT_KIND,
  pathOf: relOf,
  entryOf,
  assertId: assertShape,
  readOne: (baseDir, key, id) => readUnitOne(baseDir, id),
  noun: 'unit',
});

// Append one event to an existing record, under the lock.
async function appendEvent(handle, id, event, done, opts) {
  const current = readForWrite(handle, id).entry;
  return commit(handle, withEvent(current, pruneUndefined(event)), done, opts);
}

// One changed record, written: its history checked (`recordText`), then the
// views check, then the write, then the regeneration. Returns the entry.
async function commit(handle, next, done, opts) {
  recordText(next); // an illegal history refuses before the views are looked at
  viewsWritableOrRefuse(handle, opts);
  return landed(handle, await writeRecord(handle, next, opts), done, opts);
}

// The outstanding close request of a record that reads closing.
const latestRequest = (record) => record.events.findLast((e) => e.type === 'close_requested');

function assertProof(id, proof, what) {
  if (typeof proof !== 'string' || !COMMIT_RE.test(proof)) {
    throw new WorkStoreError('SCHEMA', `${id}: ${what}'s proof is a commit hash — lowercase hex, `
      + `7 to 64 characters, nothing else (got ${shown(proof)}). Nothing was written.`);
  }
}

// A short hash that more than one commit starts with names none of them
// (best effort: with no repository the request is accepted).
function assertOneCommit(baseDir, id, proof, opts) {
  if (proof.length >= 40) return;
  const n = commitsStartingWith(baseDir, proof, opts.execFn ?? execFileSync);
  if (n > 1) {
    throw new WorkStoreError('SCHEMA', `${id}: the proof ${proof} is the start of ${n} commits or tags, so it names none of them — `
      + 'use a longer hash (git rev-parse <commit>). Nothing was written.');
  }
}

const KEEP_FILE = '.keep';

const NO_UNITS_DIR = (id) => `${id}: this project has no unit records (${UNITS_REL}/ does not exist) — nothing was written. `
  + 'The folder is what turns unit records on; /sig:docs-migrate --work-store creates it (ensureUnitsDir).';

/**
 * Turn unit records on: create `.planning/work/units/` when it is missing,
 * with a `.keep` file inside so git carries the folder while it is empty
 * (`D-M6E16-16`, AC1.6). After this `hasUnits` answers true.
 *
 * Writes no record and no event. Idempotent: a folder that is already there
 * is left as it is, and gains a `.keep` only when it has none. Under the
 * store's lock, as every write here.
 *
 * @param {string} baseDir
 * @param {{renameFn?: Function}} [opts]
 * @returns {Promise<{path: string, created: boolean, keep: boolean}>} `created`: the folder was made by
 *   this call; `keep`: `.keep` was written by this call
 * @throws {WorkStoreError} CONFIG (store off, or v1), CONFLICT (`units/` is a link or not a folder, `.keep`
 *   is not a regular file, or `work/` resolves outside the project), LOCKED, IO
 */
export async function ensureUnitsDir(baseDir, opts = {}) {
  assertWritable(baseDir);
  return withUnitLock(baseDir, async (handle) => makeUnitsDir(handle, opts));
}

// `ensureUnitsDir`'s body, under a lock the caller already holds (`importUnits`
// turns unit records on and writes the first records in one take).
async function makeUnitsDir(handle, opts) {
  const abs = join(handle.baseDir, UNITS_REL);
  const keepRel = `${UNITS_REL}/${KEEP_FILE}`;
  const keepAbs = join(abs, KEEP_FILE);
  let created = false;
  if (confinedUnitsDir(handle.baseDir) === null) {
    confine(handle.baseDir, abs);
    try {
      mkdirSync(abs);
    } catch (err) {
      throw asWorkStoreError(err, 'IO');
    }
    created = true;
    confinedUnitsDir(handle.baseDir); // refuses a `work/` that resolves outside the project
  }
  let st = null;
  try {
    st = lstatSync(keepAbs);
  } catch (err) {
    if (err.code !== 'ENOENT') throw asWorkStoreError(err, 'IO');
  }
  if (st !== null) {
    if (!st.isFile()) throw new WorkStoreError('CONFLICT', `${keepRel} is not a regular file — nothing was written.`);
    return { path: UNITS_REL, created, keep: false };
  }
  try {
    await atomicWrite(keepAbs, '', { renameFn: opts.renameFn });
  } catch (err) {
    // The folder, when this call made it: removed again, so a failed call leaves the switch off.
    if (created) {
      try {
        rmdirSync(abs);
      } catch {
        // not empty, or already gone: leave it
      }
    }
    throw asWorkStoreError(err, 'IO');
  }
  return { path: UNITS_REL, created, keep: true };
}

/**
 * Open a unit: create its record, with one `opened` event.
 *
 * Refused when the ID fails `assertUnitId`, and when a record for it already
 * exists, open or closed — a closed unit is reopened with `reopenUnit`.
 *
 * Refused (CONFIG) when the project has no `units/` folder: this never creates
 * it, so no ordinary command turns unit records on by accident
 * (`D-M6E16-16`). `ensureUnitsDir` and the migration do.
 *
 * Sensitive data: `title`, `summary`, `migration_note` and each `legacy_row`
 * cell run through the gate items use (`sensitivePending`, `work-write.js`);
 * with a hit and no `opts.acknowledgeSensitive`, nothing is written and the
 * result is `{aborted: 'sensitive-data-pending', sensitiveHits}`.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{title?: string, summary?: string, legacy_row?: string[], migration_note?: string, by: string, at?: string}} fields
 * @param {{renameFn?: Function, acknowledgeSensitive?: boolean}} [opts]
 * @returns {Promise<object>} the entry `{id, path, record, status, held, hold_reason, close, closing_proof}`, or `{aborted, sensitiveHits}`
 * @throws {WorkStoreError} CONFIG (store off, or v1), SCHEMA, CONFLICT, LOCKED, IO
 */
export async function openUnit(baseDir, id, fields = {}, opts = {}) {
  const { by, at = nowIso() } = fields;
  const title = clean(fields.title, UNIT_TITLE_MAX);
  const summary = clean(fields.summary, UNIT_SUMMARY_MAX);
  const migrationNote = clean(fields.migration_note, UNIT_NOTE_MAX);
  const legacyRow = cleanCells(fields.legacy_row);
  assertShape(id);
  assertWritable(baseDir);
  const cells = Array.isArray(legacyRow) ? legacyRow : [];
  const pending = sensitivePending([title, summary, migrationNote, ...cells], opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => {
    if (confinedUnitsDir(handle.baseDir) === null) throw new WorkStoreError('CONFIG', NO_UNITS_DIR(id));
    assertUnitId(handle.baseDir, id, { storeKey: handle.key });
    const record = pruneUndefined({
      id, title, summary, legacy_row: legacyRow, migration_note: migrationNote, events: [{ type: 'opened', at, by }],
    });
    const text = recordText(record);
    const rel = relOf(id);
    const abs = join(handle.baseDir, rel);
    confine(handle.baseDir, abs);
    if (existsNoFollow(abs)) throw new WorkStoreError('CONFLICT', `${rel} already exists — nothing was written.`);
    viewsWritableOrRefuse(handle, opts);
    try {
      await atomicWrite(abs, text, { renameFn: opts.renameFn });
    } catch (err) {
      throw asWorkStoreError(err, 'IO');
    }
    return landed(handle, entryOf(record), `${id} was opened`, opts);
  });
}

// ── Importing units that predate their records (t7.1) ───────────────────────

export { CLOSE_WORDS_MAX, LEGACY_CELL_MAX };

const SHIPPED_NOT_DIRECT = (id) => `${id}: a shipped close goes through requestUnitClose (with the commit) and is `
  + 'confirmed by confirmCloses (work-records.js) once that commit is on the default branch — it cannot be recorded directly';

// One entry of an import list → its record (not yet validated). Throws for
// what can be refused before the store is read: the ID's shape, the close.
function importedRecord(entry) {
  const raw = entry !== null && typeof entry === 'object' ? entry : {};
  const { id, legacy_row: legacyRow, close, opened } = raw;
  const title = clean(raw.title, UNIT_TITLE_MAX);
  const summary = clean(raw.summary, UNIT_SUMMARY_MAX);
  const migrationNote = clean(raw.migration_note, UNIT_NOTE_MAX);
  assertShape(id);
  if ((close === undefined) === (opened === undefined)) {
    throw new WorkStoreError('SCHEMA', `${id}: an imported unit is either closed (close: {reason, at, by}) or open `
      + '(opened: {at, by}) — exactly one. Nothing was written.');
  }
  if (legacyRow !== undefined && (!Array.isArray(legacyRow) || legacyRow.some((c) => typeof c !== 'string'))) {
    throw new WorkStoreError('SCHEMA', `${id}: legacy_row is a list of strings — the cells of the unit's old row. Nothing was written.`);
  }
  const cells = legacyRow?.map((c) => kept(c, LEGACY_CELL_MAX));
  let event;
  if (opened !== undefined) {
    event = { type: 'opened', at: opened?.at ?? nowIso(), by: opened?.by };
  } else {
    const { reason, by, at = nowIso() } = close ?? {};
    const pr = clean(close?.pr, UNIT_REF_MAX);
    const release = clean(close?.release, UNIT_REF_MAX);
    if (reason === 'shipped') throw new WorkStoreError('SCHEMA', `${SHIPPED_NOT_DIRECT(id)}, and it cannot be imported. Nothing was written.`);
    if (!DIRECT_CLOSE_REASONS.includes(reason)) {
      throw new WorkStoreError('SCHEMA', `${id}: an imported close's reason must be one of ${DIRECT_CLOSE_REASONS.join(', ')} `
        + `(got ${shown(reason)}) — nothing was written.`);
    }
    const said = clean(close.words, CLOSE_WORDS_MAX);
    const words = typeof said === 'string' && isBlank(said) ? undefined : said;
    if (reason === 'dropped' && words === undefined) {
      throw new WorkStoreError('SCHEMA', `${id}: a dropped close needs words — where the work went, or why it stopped. `
        + 'Nothing was written.');
    }
    event = { type: 'closed', at, by, reason, pr, release, words };
  }
  return pruneUndefined({
    id, title, summary, legacy_row: cells, migration_note: migrationNote, events: [pruneUndefined(event)],
  });
}

// Every free-text field of the records an import would write.
const importedTexts = (records) => records.flatMap((r) => [
  r.title, r.summary, r.migration_note, ...(r.legacy_row ?? []), r.events[0].words, r.events[0].pr, r.events[0].release,
]);

// A file's bytes, or null when nothing is there. Read for the put-back only.
function bytesOrNull(abs) {
  try {
    return readFileSync(abs);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw asWorkStoreError(err, 'IO');
  }
}

/**
 * Create a unit's record already closed (t7.1): its first and only event is
 * the `closed`. For a unit that was over before unit records existed
 * (`legacy`), or that never ran (`dropped`, with `words`). `importUnits` with
 * one entry; see it for the rules.
 *
 * An open unit is not created here: `openUnit` does that (or `importUnits`,
 * beside the closed ones).
 *
 * @param {string} baseDir
 * @param {{id: string, title?: string, summary?: string, legacy_row?: string[], migration_note?: string,
 *   close: {reason: 'legacy'|'dropped', words?: string, pr?: string, release?: string, at?: string, by: string}}} unit
 * @param {object} [opts] — `importUnits`'s
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function importUnit(baseDir, unit, opts = {}) {
  if (unit === null || typeof unit !== 'object' || unit.close === undefined) {
    assertShape(unit?.id);
    throw new WorkStoreError('SCHEMA', `${unit.id}: importUnit records a unit that starts out closed (close: {reason, at, by}). `
      + 'An open unit is created with openUnit. Nothing was written.');
  }
  const out = await importUnits(baseDir, [unit], opts);
  return Array.isArray(out) ? out[0] : out;
}

/**
 * Create many unit records in one write (t7.1) — the migration's writer. Each
 * entry becomes a NEW record with exactly one event: `closed` (`close`, reason
 * `legacy` or `dropped`) or `opened` (`opened`). One take of the store's lock,
 * all or nothing, and ONE regeneration of the views.
 *
 * Refused, with nothing written: a list that is not a list; an entry with
 * both or neither of `close` and `opened`; a `shipped` close (it comes only
 * through `requestUnitClose` and its confirmation); a `dropped` close with no
 * words; an ID `assertUnitId` refuses; an ID listed twice, or two that differ
 * only by case (in the list, or against a record that exists); a record that
 * already exists; no `units/` folder, unless `opts.ensureDir`.
 *
 * Kept text: each `legacy_row` cell and a close's `words` lose control and
 * invisible characters (`printable-text.js`) and are cut at `LEGACY_CELL_MAX`
 * and `CLOSE_WORDS_MAX`. Nothing else about a cell changes. Every other text
 * field is kept the same way, as by every writer here (see *Writing*).
 *
 * Sensitive data: every text field of every entry runs through the gate; with
 * a hit and no `opts.acknowledgeSensitive` nothing is written.
 *
 * All or nothing: when a record cannot be written, the views cannot be
 * regenerated, or `opts.verify` throws, every record this call wrote is
 * removed, the folder and `.keep` it made are removed, and every view is put
 * back to the bytes it had. The error says nothing was imported; `leftChanged`
 * lists any path that could not be put back.
 *
 * @param {string} baseDir
 * @param {Array<{id: string, title?: string, summary?: string, legacy_row?: string[], migration_note?: string,
 *   close?: {reason: 'legacy'|'dropped', words?: string, pr?: string, release?: string, at?: string, by: string},
 *   opened?: {at?: string, by: string}}>} list
 * @param {{ensureDir?: boolean, renameFn?: Function, acknowledgeSensitive?: boolean, regenerate?: Function,
 *   gate?: (handle: {baseDir: string, key: string}) => void|Promise<void>,
 *   verify?: (handle: {baseDir: string, key: string}) => void|Promise<void>}} [opts]
 *   `ensureDir`: create `units/` and its `.keep` when missing, in the same take of the lock (the migration
 *   turns unit records on and writes the first records together); `gate`: the caller's own condition, run
 *   under the lock before anything is read or written — a throw is the refusal; `verify`: run under the
 *   lock after the records and the views are written — a throw undoes the import
 * @returns {Promise<object[]>} the entries, in list order — or `{aborted, sensitiveHits}`
 * @throws {WorkStoreError} CONFIG (store off, v1, or no `units/` folder), SCHEMA, CONFLICT, LOCKED, IO
 */
export async function importUnits(baseDir, list, opts = {}) {
  if (!Array.isArray(list)) {
    throw new WorkStoreError('SCHEMA', `importUnits takes a list of units (got ${shown(list)}) — nothing was written.`);
  }
  const records = list.map(importedRecord);
  const ids = records.map((r) => r.id);
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (twice !== undefined) throw new WorkStoreError('CONFLICT', `${twice} is listed twice — nothing was written.`);
  assertWritable(baseDir);
  const pending = sensitivePending(importedTexts(records), opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => {
    if (typeof opts.gate === 'function') await opts.gate(handle);
    const hadDir = confinedUnitsDir(handle.baseDir) !== null;
    if (!hadDir && opts.ensureDir !== true) throw new WorkStoreError('CONFIG', NO_UNITS_DIR(ids[0] ?? 'importUnits'));
    if (!hadDir) confine(handle.baseDir, join(handle.baseDir, UNITS_REL));

    // The ID rule (`assertUnitId`), with the folder listed once for the list.
    const existing = unitFileIds(handle.baseDir);
    const taken = new Set(existing);
    for (const id of ids) {
      const collision = idCollision(id, handle.key);
      if (collision) throw new WorkStoreError('SCHEMA', `${collision}. Nothing was written.`);
      if (taken.has(id)) throw new WorkStoreError('CONFLICT', `${relOf(id)} already exists — nothing was written.`);
    }
    const twins = caseTwins([...existing, ...ids])[0];
    if (twins !== undefined) {
      throw new WorkStoreError('CONFLICT', `${twins.join(' and ')} differ only by letter case — two IDs that differ only by `
        + 'case cannot both be units. Nothing was written.');
    }
    const planned = records.map((record) => ({ record, text: recordText(record), abs: join(handle.baseDir, relOf(record.id)) }));
    viewsWritableOrRefuse(handle, opts);

    const written = [];
    let dir = { created: false, keep: false };
    let views = [];
    try {
      if (opts.ensureDir === true) dir = await makeUnitsDir(handle, opts);
      for (const p of planned) {
        confine(handle.baseDir, p.abs);
        if (existsNoFollow(p.abs)) throw new WorkStoreError('CONFLICT', `${relOf(p.record.id)} already exists`);
        written.push(p);
        await atomicWrite(p.abs, p.text, { renameFn: opts.renameFn });
      }
      if (planned.length > 0 || dir.created) {
        // What the views hold now, for the put-back: every path the regeneration may write.
        views = Object.keys(regenerateToMemory(handle.baseDir) ?? {}).map((rel) => ({ rel, was: bytesOrNull(join(handle.baseDir, rel)) }));
        await (opts.regenerate ?? regenerateViews)(handle.baseDir);
      }
      if (typeof opts.verify === 'function') await opts.verify(handle);
    } catch (err) {
      const left = [];
      const undo = (rel, fn) => {
        try {
          fn();
        } catch (e) {
          if (e.code !== 'ENOENT') left.push(rel);
        }
      };
      for (const v of views) {
        const abs = join(handle.baseDir, v.rel);
        undo(v.rel, () => {
          if (v.was === null) unlinkSync(abs);
          else if (!v.was.equals(bytesOrNull(abs) ?? Buffer.alloc(0))) writeFileSync(abs, v.was);
        });
      }
      for (const p of written.reverse()) undo(relOf(p.record.id), () => unlinkSync(p.abs));
      if (dir.keep) undo(`${UNITS_REL}/${KEEP_FILE}`, () => unlinkSync(join(handle.baseDir, UNITS_REL, KEEP_FILE)));
      if (dir.created) undo(UNITS_REL, () => rmdirSync(join(handle.baseDir, UNITS_REL)));
      const code = err instanceof WorkStoreError ? err.code : 'IO';
      const wrapped = new WorkStoreError(code, `nothing was imported — ${err?.message ?? String(err)}`
        + (left.length > 0 ? ` — and these could not be put back: ${left.join(', ')}` : ''));
      wrapped.cause = err;
      wrapped.leftChanged = left;
      throw wrapped;
    }
    return planned.map((p) => entryOf(p.record));
  });
}

/**
 * Ask to close a unit as shipped: a `close_requested` event (legal from
 * open), deriving *closing*. It becomes closed only through
 * `confirmCloses` (`work-records.js`).
 *
 * `proof` is a bare commit hash, lowercase hex, 7 to 64 characters. A short
 * hash that more than one commit starts with is refused when git can say so
 * (best effort, as for an item's close request; with no repository the request
 * is accepted). It is not run through the sensitive-data gate: it can only be
 * hex.
 *
 * `pr` and `release` (t4.0, optional) are what the caller knows when it asks —
 * `/sig:ship` knows the pull request, and the step that confirms the close,
 * after the merge, does not. `confirmCloses` copies them into the `closed`
 * event. Sensitive data: both run through the gate.
 *
 * `opts.gate` (t4.1) is a caller's own condition for the close — `closeEpic`
 * passes the Epic's (its items, its retrospective). It runs under the store's
 * lock, before the record is read or written; when it throws, nothing is
 * written and its error is the refusal.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{proof: string, pr?: string, release?: string, by: string, at?: string}} request
 * @param {{renameFn?: Function, execFn?: Function, acknowledgeSensitive?: boolean,
 *   gate?: (handle: {baseDir: string, key: string}) => void|Promise<void>}} [opts]
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function requestUnitClose(baseDir, id, request = {}, opts = {}) {
  const { proof, by, at = nowIso() } = request;
  const pr = clean(request.pr, UNIT_REF_MAX);
  const release = clean(request.release, UNIT_REF_MAX);
  assertShape(id);
  assertProof(id, proof, 'a close request');
  assertWritable(baseDir);
  assertOneCommit(baseDir, id, proof, opts);
  const pending = sensitivePending([pr, release], opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => {
    if (typeof opts.gate === 'function') await opts.gate(handle);
    return appendEvent(handle, id, { type: 'close_requested', at, by, proof, pr, release }, `${id} is closing (its close was requested with ${proof})`, opts);
  });
}

/**
 * Ask again for a close that is already requested, with another commit
 * (M6.E16 t5.0a): `/sig:ship` re-run after review fixes were pushed. The unit
 * is *closing* on the earlier commit; this appends TWO events in one write —
 * `reopened`, its reason naming the earlier proof and that the close was
 * requested again, then a new `close_requested` — and the unit reads
 * *closing* on the new commit. Both events are real and both stay in the
 * history: no event replaces a proof. The one writer here that appends more
 * than one event.
 *
 * Refused (CONFLICT) unless the unit is *closing*, and when `proof` is the
 * commit it is already closing on (nothing to ask again).
 *
 * `proof`, `pr`, `release` and `opts.gate` are `requestUnitClose`'s. `pr` and
 * `release` are this request's own: nothing is copied from the earlier one.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{proof: string, pr?: string, release?: string, by: string, at?: string}} request
 * @param {{renameFn?: Function, execFn?: Function, acknowledgeSensitive?: boolean,
 *   gate?: (handle: {baseDir: string, key: string}) => void|Promise<void>}} [opts]
 * @returns {Promise<object>} the entry, with `previous_proof` (the commit the earlier request named), or `{aborted, sensitiveHits}`
 */
export async function rerequestUnitClose(baseDir, id, request = {}, opts = {}) {
  const { proof, by, at = nowIso() } = request;
  const pr = clean(request.pr, UNIT_REF_MAX);
  const release = clean(request.release, UNIT_REF_MAX);
  assertShape(id);
  assertProof(id, proof, 'a close request');
  assertWritable(baseDir);
  assertOneCommit(baseDir, id, proof, opts);
  const pending = sensitivePending([pr, release], opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => {
    if (typeof opts.gate === 'function') await opts.gate(handle);
    const current = readForWrite(handle, id).entry;
    if (current.status !== 'closing') {
      throw new WorkStoreError('CONFLICT', `${id}: no close is outstanding (the unit is ${current.status}) — nothing was written. `
        + 'A close is requested again only while an earlier request is waiting.');
    }
    const previous = current.closing_proof;
    if (previous === proof) {
      throw new WorkStoreError('CONFLICT', `${id}: the close was already requested with ${proof} — nothing was written.`);
    }
    const reason = `the close was requested again with the commit ${proof}; the earlier request named ${previous}`;
    const reopened = withEvent(current, { type: 'reopened', at, by, reason });
    const next = withEvent({ record: reopened }, pruneUndefined({ type: 'close_requested', at, by, proof, pr, release }));
    const entry = await commit(handle, next, `${id} is closing (its close was requested again, with ${proof})`, opts);
    return { ...entry, previous_proof: previous };
  });
}

/**
 * The shipped closes `confirmCloses` (`work-records.js`) is about to write,
 * built and checked and NOT written (M6.E16 t4.2). It confirms item closes and
 * unit closes in one call, under one take of the store's lock, and writes both
 * all or nothing — so the unit side is planned here and written there. Each
 * record is re-read under the caller's lock (`handle`), and planned only if it
 * is still closing on the same proof. The event: `closed`, reason `shipped`,
 * the request's proof, and its `pr` and `release`.
 *
 * This is the ONLY place a shipped close is built (REVIEW pass 1, C-S3: the
 * exported `confirmUnitClose`, which wrote one with no ancestry check and had
 * no caller, was removed). Reads only. It does not check that the commit is
 * on the default branch: its one caller, `confirmCloses`, has.
 *
 * The unit's items are checked again here (REVIEW pass 1, C-I1, AC4.3):
 * `openItems(id)` — the caller's, read under the same lock — names the unit's
 * items that are not closed, and a unit with any is not planned. The item
 * store is the caller's to read; this library reads unit records only.
 *
 * @param {{baseDir: string, key: string}} handle — the caller's lock
 * @param {Array<{id: string, proof: string}>} candidates
 * @param {{at: string, by: string, openItems: (id: string) => string[]}} confirm
 * @returns {{planned: Array<{next: object, text: string, oldText: string, abs: string}>, changed: string[],
 *   openItems: Array<{id: string, items: string[]}>}}
 *   `planned`: one per unit to write (`text` its new bytes, `oldText` its bytes now);
 *   `changed`: units now closing on another proof; `openItems`: units left closing because these
 *   items of theirs are not closed. One that is no longer closing is in none.
 * @throws {WorkStoreError} SCHEMA (a broken record, or no `openItems`), NOT_FOUND
 */
export function planUnitConfirms(handle, candidates, { at, by, openItems }) {
  if (typeof openItems !== 'function') {
    throw new WorkStoreError('SCHEMA', 'planUnitConfirms needs openItems — a unit is confirmed closed only when its items are. Nothing was written.');
  }
  const planned = [];
  const changed = [];
  const held = [];
  for (const c of candidates) {
    const { entry, text } = readForWrite(handle, c.id);
    if (entry.status !== 'closing') continue; // closed or reopened meanwhile: nothing to confirm
    if (entry.closing_proof !== c.proof) {
      changed.push(c.id);
      continue;
    }
    const items = openItems(c.id);
    if (items.length > 0) {
      held.push({ id: c.id, items });
      continue;
    }
    const request = latestRequest(entry.record);
    const event = pruneUndefined({
      type: 'closed', at, by, reason: 'shipped', proof: c.proof, pr: request?.pr, release: request?.release,
    });
    const next = withEvent(entry, event);
    planned.push({ next, text: recordText(next), oldText: text, abs: join(handle.baseDir, entry.path) });
  }
  return { planned, changed, openItems: held };
}

/**
 * Close a unit directly, as `dropped` (it stopped, or its work went elsewhere;
 * `words` required) or as `legacy` (it was over before unit records existed;
 * `words`, `pr` and `release` carry what was written down at the time). Legal
 * from open and from closing. `shipped` is refused: it goes through
 * `requestUnitClose` and `confirmCloses` (`work-records.js`).
 *
 * Appends to an existing record only. A record that begins with a close (a
 * unit recorded as already over, never opened) is not created here.
 *
 * Sensitive data: `words`, `pr` and `release`.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{reason: 'dropped'|'legacy', words?: string, pr?: string, release?: string, proof?: string, by: string, at?: string}} close
 * @param {{renameFn?: Function, acknowledgeSensitive?: boolean}} [opts]
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function closeUnit(baseDir, id, close = {}, opts = {}) {
  const { reason, proof, by, at = nowIso() } = close;
  const words = clean(close.words, CLOSE_WORDS_MAX);
  const pr = clean(close.pr, UNIT_REF_MAX);
  const release = clean(close.release, UNIT_REF_MAX);
  assertShape(id);
  if (reason === 'shipped') {
    throw new WorkStoreError('SCHEMA', `${SHIPPED_NOT_DIRECT(id)}. Nothing was closed.`);
  }
  if (!DIRECT_CLOSE_REASONS.includes(reason)) {
    throw new WorkStoreError('SCHEMA', `${id}: close reason must be one of ${DIRECT_CLOSE_REASONS.join(', ')} `
      + `(got ${shown(reason)}) — nothing was closed.`);
  }
  if (reason === 'dropped' && isBlank(words)) {
    throw new WorkStoreError('SCHEMA', `${id}: a dropped close needs words — where the work went, or why it stopped. `
      + 'Nothing was closed.');
  }
  assertWritable(baseDir);
  const pending = sensitivePending([words, pr, release], opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => (
    appendEvent(handle, id, { type: 'closed', at, by, reason, proof, pr, release, words }, `${id} was closed (${reason})`, opts)
  ));
}

/**
 * Reopen a closed or closing unit: a `reopened` event, back to open. A hold,
 * if there is one, stays.
 *
 * Sensitive data: `reason`.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{reason: string, by: string, at?: string}} reopen — `reason` is required
 * @param {{renameFn?: Function, acknowledgeSensitive?: boolean}} [opts]
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function reopenUnit(baseDir, id, reopen = {}, opts = {}) {
  const { by, at = nowIso() } = reopen;
  const reason = clean(reopen.reason, UNIT_REASON_MAX);
  assertShape(id);
  if (isBlank(reason)) {
    throw new WorkStoreError('SCHEMA', `${id}: a reopen needs a reason — what came back, and how you know. `
      + 'Nothing was reopened.');
  }
  assertWritable(baseDir);
  const pending = sensitivePending([reason], opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => appendEvent(handle, id, { type: 'reopened', at, by, reason }, `${id} was reopened`, opts));
}

/**
 * Hold a unit: a `held` event with a reason (AC5.1). A hold says "keep this
 * unit's files live" and is a flag beside the status — legal whatever the
 * status, refused on a unit that is already held.
 *
 * Sensitive data: `reason`.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{reason: string, by: string, at?: string}} hold — `reason` is required
 * @param {{renameFn?: Function, acknowledgeSensitive?: boolean}} [opts]
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function holdUnit(baseDir, id, hold = {}, opts = {}) {
  const { by, at = nowIso() } = hold;
  const reason = clean(hold.reason, UNIT_REASON_MAX);
  assertShape(id);
  if (isBlank(reason)) {
    throw new WorkStoreError('SCHEMA', `${id}: a hold needs a reason — why its files must stay live. Nothing was written.`);
  }
  assertWritable(baseDir);
  const pending = sensitivePending([reason], opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => appendEvent(handle, id, { type: 'held', at, by, reason }, `${id} was held`, opts));
}

/**
 * Release a hold: a `released` event. Refused on a unit that is not held.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{by: string, at?: string}} release
 * @param {{renameFn?: Function}} [opts]
 * @returns {Promise<object>} the entry
 */
export async function releaseUnit(baseDir, id, release = {}, opts = {}) {
  const { by, at = nowIso() } = release;
  assertShape(id);
  return withUnitLock(baseDir, async (handle) => appendEvent(handle, id, { type: 'released', at, by }, `${id} was released from its hold`, opts));
}

/**
 * Edit record fields: one `edited` event carrying `{field: {from, to}}`;
 * status and hold unchanged. `to: null` removes the field. A field already
 * holding the new value is left out; if none changes, nothing is written.
 * Editable: `title`, `summary`, `migration_note`.
 *
 * Sensitive data: every string value being written.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{changes: Object<string, string|null>, by: string, at?: string}} edit
 * @param {{renameFn?: Function, acknowledgeSensitive?: boolean}} [opts]
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function editUnit(baseDir, id, edit = {}, opts = {}) {
  const { changes, by, at = nowIso() } = edit;
  assertShape(id);
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).length === 0) {
    throw new WorkStoreError('SCHEMA', `${id}: an edit needs changes — {field: new value}. Nothing was written.`);
  }
  const unknown = Object.keys(changes).filter((k) => !EDITABLE.includes(k));
  if (unknown.length) {
    throw new WorkStoreError('SCHEMA', `${id}: ${unknown.map(shown).join(', ')} cannot be edited — editable fields are `
      + `${EDITABLE.join(', ')}. Nothing was written.`);
  }
  // Cleaned before the diff: the event's `to` and the record's field must be the same text.
  const cleaned = Object.fromEntries(Object.entries(changes).map(([field, to]) => [field, clean(to, FIELD_MAX[field])]));
  assertWritable(baseDir);
  const pending = sensitivePending(Object.values(cleaned), opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => {
    const current = readForWrite(handle, id).entry;
    const diff = {};
    for (const [field, to] of Object.entries(cleaned)) {
      const from = Object.hasOwn(current.record, field) ? current.record[field] : null;
      if (from !== to) diff[field] = { from, to };
    }
    if (Object.keys(diff).length === 0) {
      throw new WorkStoreError('SCHEMA', `${id}: every field already holds its new value — nothing was written.`);
    }
    const fields = Object.fromEntries(Object.entries(diff).map(([f, c]) => [f, c.to]));
    return commit(handle, withEvent(current, { type: 'edited', at, by, changes: diff }, fields), `${id} was edited (${Object.keys(diff).join(', ')})`, opts);
  });
}
