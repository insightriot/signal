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
// one). Writers take the store's ONE lock through the shared helpers in
// `work-write.js` — the same lock item writers take, so a unit write and an
// item write exclude each other.
//
// Views: no writer here regenerates the store's views, and none checks them
// before writing. No view renders a unit yet (a later slice of this Epic adds
// that), so regenerating would rewrite the item views for a change they do not
// show, and would refuse a unit write because an ITEM record is broken.
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
import { lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmdirSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

import { isSafeUnitName } from './archive-tree.js';
import { atomicWrite } from './atomic-write.js';
import { PHASES } from './state.js';
import { UNIT_KIND, UNIT_SCHEMA, foldUnit } from './unit-record.js';
import { asWorkStoreError, WorkStoreError } from './work-errors.js';
import { assertWritable } from './work-records.js';
import { isStoreOn, WORK_DIR } from './work-store.js';
import {
  commitsStartingWith,
  confine,
  existsNoFollow,
  recordWriter,
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
// `isSafeUnitName` (`archive-tree.js`), reused so the archive and the store
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
 * @throws {WorkStoreError} CONFLICT when `units/` is a link or not a folder, or `work/` resolves outside the project
 */
export function hasUnits(baseDir) {
  return confinedUnitsDir(baseDir) !== null;
}

/**
 * `hasUnits` for a reader that must never throw (a closure check, a view, a
 * status line). On a layout `hasUnits` refuses — `units/` a link or not a
 * folder, `work/` resolving outside the project, a folder that cannot be read
 * — the answer is `has: false` with the refusal's message in `problem`, so the
 * caller reads as it did before unit records; `checkUnits` reports the same
 * layout to `/sig:docs-sweep`.
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

const WORK_LOCK_LABEL = 'work store';
const COMMIT_RE = new RegExp(UNIT_SCHEMA.$defs.commit.pattern, 'u');
const DIRECT_CLOSE_REASONS = ['dropped', 'legacy'];
// The record fields an `edited` event may change (the schema's `changes`).
// `legacy_row` is not one: it is a list, and a change is a string, a number or null.
const EDITABLE = ['title', 'summary', 'migration_note'];

const nowIso = () => new Date().toISOString();
const isBlank = (text) => typeof text !== 'string' || text.trim() === '';

function pruneUndefined(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

// The store's one lock (`work-write.js`), over the item library's store check:
// one check of what may be written, not a second. Nothing runs before the
// write beyond that — see "Views" at the top of this file.
async function withUnitLock(baseDir, fn) {
  return withWorkLock(baseDir, WORK_LOCK_LABEL, { assertWritable, beforeWrite: () => {} }, fn);
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
async function appendEvent(handle, id, event, opts) {
  const current = readForWrite(handle, id).entry;
  return writeRecord(handle, withEvent(current, pruneUndefined(event)), opts);
}

// The outstanding close request of a record that reads closing.
const latestRequest = (record) => record.events.findLast((e) => e.type === 'close_requested');

function assertProof(id, proof, what) {
  if (typeof proof !== 'string' || !COMMIT_RE.test(proof)) {
    throw new WorkStoreError('SCHEMA', `${id}: ${what}'s proof is a commit hash — lowercase hex, `
      + `7 to 64 characters, nothing else (got ${shown(proof)}). Nothing was written.`);
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
  return withUnitLock(baseDir, async (handle) => {
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
  });
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
  const { title, summary, legacy_row: legacyRow, migration_note: migrationNote, by, at = nowIso() } = fields;
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
    try {
      await atomicWrite(abs, text, { renameFn: opts.renameFn });
    } catch (err) {
      throw asWorkStoreError(err, 'IO');
    }
    return entryOf(record);
  });
}

/**
 * Ask to close a unit as shipped: a `close_requested` event (legal from
 * open), deriving *closing*. It becomes closed only through
 * `confirmUnitClose`.
 *
 * `proof` is a bare commit hash, lowercase hex, 7 to 64 characters. A short
 * hash that more than one commit starts with is refused when git can say so
 * (best effort, as for an item's close request; with no repository the request
 * is accepted). It is not run through the sensitive-data gate: it can only be
 * hex.
 *
 * `pr` and `release` (t4.0, optional) are what the caller knows when it asks —
 * `/sig:ship` knows the pull request, and the step that confirms the close,
 * after the merge, does not. `confirmUnitClose` copies them into the `closed`
 * event. Sensitive data: both run through the gate.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{proof: string, pr?: string, release?: string, by: string, at?: string}} request
 * @param {{renameFn?: Function, execFn?: Function, acknowledgeSensitive?: boolean}} [opts]
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function requestUnitClose(baseDir, id, request = {}, opts = {}) {
  const { proof, pr, release, by, at = nowIso() } = request;
  assertShape(id);
  assertProof(id, proof, 'a close request');
  assertWritable(baseDir);
  if (proof.length < 40) {
    const n = commitsStartingWith(baseDir, proof, opts.execFn ?? execFileSync);
    if (n > 1) {
      throw new WorkStoreError('SCHEMA', `${id}: the proof ${proof} is the start of ${n} commits or tags, so it names none of them — `
        + 'use a longer hash (git rev-parse <commit>). Nothing was written.');
    }
  }
  const pending = sensitivePending([pr, release], opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => (
    appendEvent(handle, id, { type: 'close_requested', at, by, proof, pr, release }, opts)
  ));
}

/**
 * Confirm a requested close: a `closed` event with reason `shipped`, carrying
 * the request's proof (legal from *closing* only).
 *
 * This function does NOT check that the commit is on the default branch. That
 * decision is the caller's, and is taken as given; what is checked here is
 * that `proof` is exactly the commit the close was requested with.
 *
 * `pr` and `release`, when not passed, are copied from the close request
 * (t4.0): the request is made at SHIP, which knows them.
 *
 * Sensitive data: `pr`, `release` and `words`.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{proof: string, pr?: string, release?: string, words?: string, by: string, at?: string}} confirm
 * @param {{renameFn?: Function, acknowledgeSensitive?: boolean}} [opts]
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function confirmUnitClose(baseDir, id, confirm = {}, opts = {}) {
  const { proof, pr, release, words, by, at = nowIso() } = confirm;
  assertShape(id);
  assertProof(id, proof, 'a confirmed close');
  assertWritable(baseDir);
  const pending = sensitivePending([pr, release, words], opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => {
    const current = readForWrite(handle, id).entry;
    if (current.status !== 'closing') {
      throw new WorkStoreError('CONFLICT', `${id}: no close was requested (the unit is ${current.status}) — nothing was written. `
        + 'A shipped close confirms a request.');
    }
    if (proof !== current.closing_proof) {
      throw new WorkStoreError('CONFLICT', `${id}: the proof ${proof} is not the commit the close was requested with `
        + `(${current.closing_proof}) — nothing was written.`);
    }
    const request = latestRequest(current.record);
    const event = pruneUndefined({
      type: 'closed', at, by, reason: 'shipped', proof, pr: pr ?? request?.pr, release: release ?? request?.release, words,
    });
    return writeRecord(handle, withEvent(current, event), opts);
  });
}

/**
 * Close a unit directly, as `dropped` (it stopped, or its work went elsewhere;
 * `words` required) or as `legacy` (it was over before unit records existed;
 * `words`, `pr` and `release` carry what was written down at the time). Legal
 * from open and from closing. `shipped` is refused: it goes through
 * `requestUnitClose` and `confirmUnitClose`.
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
  const { reason, words, pr, release, proof, by, at = nowIso() } = close;
  assertShape(id);
  if (reason === 'shipped') {
    throw new WorkStoreError('SCHEMA', `${id}: a shipped close goes through requestUnitClose (with the commit) and is `
      + 'confirmed by confirmUnitClose — it cannot be recorded directly. Nothing was closed.');
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
    appendEvent(handle, id, { type: 'closed', at, by, reason, proof, pr, release, words }, opts)
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
  const { reason, by, at = nowIso() } = reopen;
  assertShape(id);
  if (isBlank(reason)) {
    throw new WorkStoreError('SCHEMA', `${id}: a reopen needs a reason — what came back, and how you know. `
      + 'Nothing was reopened.');
  }
  assertWritable(baseDir);
  const pending = sensitivePending([reason], opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => appendEvent(handle, id, { type: 'reopened', at, by, reason }, opts));
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
  const { reason, by, at = nowIso() } = hold;
  assertShape(id);
  if (isBlank(reason)) {
    throw new WorkStoreError('SCHEMA', `${id}: a hold needs a reason — why its files must stay live. Nothing was written.`);
  }
  assertWritable(baseDir);
  const pending = sensitivePending([reason], opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => appendEvent(handle, id, { type: 'held', at, by, reason }, opts));
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
  return withUnitLock(baseDir, async (handle) => appendEvent(handle, id, { type: 'released', at, by }, opts));
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
  assertWritable(baseDir);
  const pending = sensitivePending(Object.values(changes), opts);
  if (pending) return pending;
  return withUnitLock(baseDir, async (handle) => {
    const current = readForWrite(handle, id).entry;
    const diff = {};
    for (const [field, to] of Object.entries(changes)) {
      const from = Object.hasOwn(current.record, field) ? current.record[field] : null;
      if (from !== to) diff[field] = { from, to };
    }
    if (Object.keys(diff).length === 0) {
      throw new WorkStoreError('SCHEMA', `${id}: every field already holds its new value — nothing was written.`);
    }
    const fields = Object.fromEntries(Object.entries(diff).map(([f, c]) => [f, c.to]));
    return writeRecord(handle, withEvent(current, { type: 'edited', at, by, changes: diff }, fields), opts);
  });
}
