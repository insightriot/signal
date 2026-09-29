// `/sig:item`'s library — every change to an item file goes through here
// (M6.E11.S3, FR-5, D-M6E11-5).
//
// `work-store.js` answers questions about the store (is it on, what is the
// next ID, does it agree with itself); this module changes it. They are two
// files only because `work-generate.js` imports from `work-store.js`, and a
// mutation must regenerate — putting the mutations there would be a cycle.
//
// ── The shape of every mutation ─────────────────────────────────────────────
//
//   store on? → take the `work` lock → validate the item as it WILL be →
//   confine the destination → move (git mv / rename) → atomic write at the new
//   path, links rewritten for the new depth → regenerate the four lists.
//
// Validation runs before anything touches disk, so a refused change leaves no
// trace. If the write after a move fails, the move is undone: the item ends
// where it started, byte-for-byte (AC-5.2). Nothing here deletes an item file
// (AC-3.4, D-M6E11-12) — closing is a move to `done/YYYY-MM/`.
//
// ── The `work` lock (D-M6E11-27) ────────────────────────────────────────────
//
// `.planning/work/.lock`, not `withStateLock`: that one is not reentrant and
// `checkpoint`/`drain` already hold it when they will call `newItem` (S4), so
// taking it here would deadlock them. Regeneration runs inside this lock too.
//
// Async, not synchronous like `work-store.js`'s reads: the lock, `atomicWrite`
// and `generateAll` are all Promise-based, and duplicating them as sync
// copies would be two implementations of the same guarantee. The reads here
// (`getItem`, `listItems`, `listThemes`) take no lock and stay synchronous.

import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, renameSync, rmdirSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { acquireLock, releaseLock } from './file-lock.js';
import { assertRealInsidePlanning } from './path-confine.js';
import { EPIC_ID_STRICT_RE } from './state.js';
import { generateAll } from './work-generate.js';
import {
  ITEM_ID_RE,
  ITEM_STATUSES,
  CLOSE_REASONS,
  parseItem,
  renderLabel,
  stringifyItem,
  validateItem,
  WorkStoreError,
} from './work-item.js';
import { rewriteRelativeLinks } from './work-links.js';
import { FOLDERS, isGitRepo, isStoreOn, nextId, parseItemFileName, walkFiles, WORK_DIR, WORK_FILE } from './work-store.js';

export const WORK_LOCK_REL = `.planning/${WORK_DIR}/.lock`;

const WORK_FILE_REL = `.planning/${WORK_DIR}/${WORK_FILE}`;

// ── Shared plumbing ──────────────────────────────────────────────────────────

function requireStore(baseDir) {
  const store = isStoreOn(baseDir);
  if (!store.on) {
    throw new WorkStoreError('CONFIG', `The work store is off: ${WORK_FILE_REL} does not exist. `
      + 'Create it with `key: SIG` in its frontmatter to turn the store on.');
  }
  return store;
}

// The store check comes BEFORE the lock: `acquireLock` creates the lock's
// parent folder, and a store-off project must not grow `.planning/work/`.
async function withWorkLock(baseDir, fn) {
  requireStore(baseDir);
  const lockPath = join(baseDir, WORK_LOCK_REL);
  await acquireLock(lockPath, { label: 'work store' });
  try {
    return await fn();
  } finally {
    await releaseLock(lockPath);
  }
}

const toPosix = (p) => p.split(sep).join('/');
const num = (id) => Number(id.slice(id.lastIndexOf('-') + 1));

// An ID, or a label whose front is an ID. Only the front identifies an item
// (AC-2.3): `SIG-412-FEAT-C` finds SIG-412 whatever SIG-412 now is.
const FRONT_RE = /^([A-Z][A-Z0-9]{1,9}-[1-9]\d*)(?:-[A-Z]+-[A-Z])?$/;

function frontOf(idOrLabel) {
  const m = typeof idOrLabel === 'string' ? idOrLabel.match(FRONT_RE) : null;
  if (!m || !ITEM_ID_RE.test(m[1])) {
    throw new WorkStoreError('SCHEMA', `${JSON.stringify(idOrLabel)} is not an item ID or label `
      + '(expected SIG-412 or SIG-412-BUG-T)');
  }
  return m[1];
}

// Every item file the store holds: the live tree and archived Epics.
// `walkFiles` does not follow symlinks, so nothing outside is ever read.
function itemFiles(baseDir) {
  const planning = join(baseDir, '.planning');
  return [...walkFiles(join(planning, WORK_DIR)), ...walkFiles(join(planning, 'archive', 'epics'))]
    .filter((abs) => parseItemFileName(basename(abs)));
}

function readItemFile(baseDir, abs) {
  const path = toPosix(relative(baseDir, abs));
  const text = readFileSync(abs, 'utf-8');
  const { item, body, errors } = parseItem(text, { path });
  return { item, body, errors, path, abs, text };
}

// The Epic an item belongs to, from its folder — never stored (D-M6E11-7).
function epicOf(path) {
  const m = path.match(/^\.planning\/(?:work|archive)\/epics\/([^/]+)\//);
  return m ? m[1] : undefined;
}

// ── Reads ────────────────────────────────────────────────────────────────────

/**
 * Find one item by ID or label (the front only, AC-2.3), in `work/` or an
 * archived Epic.
 *
 * @param {string} baseDir
 * @param {string} idOrLabel — `SIG-412` or `SIG-412-BUG-T`
 * @returns {{item: object, body: string, path: string, label: string, epic?: string}}
 *   `path` is relative to `baseDir`
 * @throws {WorkStoreError} CONFIG (store off), SCHEMA (not an ID, or a broken
 *   file), NOT_FOUND, CONFLICT (two files carry the ID)
 */
export function getItem(baseDir, idOrLabel) {
  const id = frontOf(idOrLabel);
  requireStore(baseDir);
  const hits = itemFiles(baseDir).filter((abs) => basename(abs) === `${id}.md`);
  if (hits.length === 0) {
    throw new WorkStoreError('NOT_FOUND', `${id}: no item file in .planning/work/ or .planning/archive/epics/ `
      + '(`/sig:item list` shows what exists)');
  }
  if (hits.length > 1) {
    const paths = hits.map((abs) => toPosix(relative(baseDir, abs))).sort();
    throw new WorkStoreError('CONFLICT', `${id} is used by ${hits.length} files: ${paths.join(', ')}. `
      + 'Renumber one of them before changing either.');
  }
  const r = readItemFile(baseDir, hits[0]);
  if (r.errors.length) {
    throw new WorkStoreError('SCHEMA', `${r.path} is not a valid item — fix it first:\n${r.errors.join('\n')}`);
  }
  const out = { item: r.item, body: r.body, path: r.path, label: renderLabel(r.item) };
  const epic = epicOf(r.path);
  if (epic) out.epic = epic;
  return out;
}

const FILTER_KEYS = ['status', 'type', 'theme', 'priority', 'epic'];

/**
 * List items, filtered. Each filter is an exact match; `priority` compares as
 * text so `1` and `'1'` agree. A broken item file fails the whole list (with
 * every broken file named) rather than being skipped — a list that silently
 * drops an item is the false-clean shape this Epic exists to remove.
 *
 * @param {string} baseDir
 * @param {{status?: string, type?: string, theme?: string, priority?: string|number, epic?: string}} [filter]
 * @returns {Array<{item: object, label: string, path: string, epic?: string}>} ordered by number
 */
export function listItems(baseDir, filter = {}) {
  for (const key of Object.keys(filter)) {
    if (!FILTER_KEYS.includes(key)) {
      throw new WorkStoreError('SCHEMA', `listItems: unknown filter ${JSON.stringify(key)} `
        + `(filters: ${FILTER_KEYS.join(', ')})`);
    }
  }
  requireStore(baseDir);
  const rows = [];
  const errors = [];
  for (const abs of itemFiles(baseDir)) {
    const r = readItemFile(baseDir, abs);
    if (r.errors.length) {
      errors.push(...r.errors);
      continue;
    }
    rows.push({ item: r.item, label: renderLabel(r.item), path: r.path, epic: epicOf(r.path) });
  }
  if (errors.length) {
    throw new WorkStoreError('SCHEMA', `cannot list the store — fix these item files first:\n${errors.join('\n')}`);
  }
  const matches = (row) => {
    if (filter.status !== undefined && row.item.status !== filter.status) return false;
    if (filter.type !== undefined && row.item.type !== filter.type) return false;
    if (filter.theme !== undefined && row.item.theme !== filter.theme) return false;
    if (filter.priority !== undefined && String(row.item.priority) !== String(filter.priority)) return false;
    if (filter.epic !== undefined && row.epic !== filter.epic) return false;
    return true;
  };
  return rows
    .filter(matches)
    .sort((a, b) => num(a.item.id) - num(b.item.id) || a.item.id.localeCompare(b.item.id))
    .map((row) => {
      if (row.epic === undefined) delete row.epic;
      return row;
    });
}

/**
 * The distinct theme values in use, with counts — so a new theme can join an
 * existing one instead of becoming a near-duplicate (PLAN § Open questions).
 *
 * @param {string} baseDir
 * @param {object} [filter] — as `listItems`
 * @returns {Array<{theme: string, count: number}>} most-used first, then by name
 */
export function listThemes(baseDir, filter = {}) {
  const counts = new Map();
  for (const { item } of listItems(baseDir, filter)) {
    if (typeof item.theme === 'string' && item.theme.trim() !== '') {
      counts.set(item.theme, (counts.get(item.theme) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
}

// ── Where an item belongs ────────────────────────────────────────────────────

// The folder (relative to `.planning/`) an item with this status belongs in.
// The status→folder rule is D-M6E11-8, mirrored from `checkStore`'s ALLOWED.
function folderFor(item, epic) {
  switch (item.status) {
    case 'N':
      return `${WORK_DIR}/${FOLDERS.inbox}`;
    case 'T':
      return `${WORK_DIR}/${FOLDERS.backlog}`;
    case 'Q':
    case 'P':
      return `${WORK_DIR}/${FOLDERS.epics}/${epic}`;
    case 'C':
      return `${WORK_DIR}/${FOLDERS.done}/${item.close.at.slice(0, 7)}`;
    default:
      throw new WorkStoreError('SCHEMA', `no folder for status ${JSON.stringify(item.status)}`);
  }
}

function assertValid(item, where) {
  const errors = validateItem(item);
  if (errors.length) {
    throw new WorkStoreError('SCHEMA', `${where}: the change would make an invalid item — nothing was written:\n`
      + errors.join('\n'));
  }
}

function assertEpicId(epic) {
  if (typeof epic !== 'string' || !EPIC_ID_STRICT_RE.test(epic)) {
    throw new WorkStoreError('SCHEMA', `Epic ID ${JSON.stringify(epic)} is not valid (expected e.g. M6.E11)`);
  }
}

// ── The move ─────────────────────────────────────────────────────────────────

function isTracked(baseDir, rel, execFn) {
  try {
    execFn('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

// Move one file. `git mv` when git tracks it, so history follows the file;
// a plain rename otherwise (untracked, or no repo). Never `-k`: that flag
// turns a failed move into a silent no-op.
function moveFile(baseDir, fromRel, toRel, git, execFn) {
  if (git) {
    execFn('git', ['mv', '--', fromRel, toRel], { cwd: baseDir, stdio: ['ignore', 'pipe', 'pipe'] });
  } else {
    renameSync(join(baseDir, fromRel), join(baseDir, toRel));
  }
}

// Remove the folders this move created, innermost first, only while empty.
// `rmdirSync` refuses a non-empty folder, so this can never remove a file.
function removeCreatedDirs(fromDir, stopAbove) {
  let dir = fromDir;
  while (dir.length >= stopAbove.length && dir.startsWith(stopAbove)) {
    try {
      rmdirSync(dir);
    } catch {
      return;
    }
    if (dir === stopAbove) return;
    dir = dirname(dir);
  }
}

function exists(abs) {
  try {
    lstatSync(abs);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
}

async function regenerate(baseDir, done) {
  try {
    await generateAll(baseDir);
  } catch (err) {
    // The item change stands — it is correct and `checkStore` names whatever
    // broke generation; undoing a good change to protect a stale view would
    // be the wrong way round.
    if (err instanceof WorkStoreError) {
      throw new WorkStoreError(err.code, `${done}, but the lists were not regenerated: ${err.message}`);
    }
    throw err;
  }
}

// Put `next` (with `body`) at `destDirRel/{id}.md`, moving it from `found`.
// Validated and confined by the caller's checks plus the ones here; rewinds on
// a failed write. Runs inside the `work` lock.
async function relocate(baseDir, found, next, body, destDirRel, opts) {
  const execFn = opts.execFn ?? execFileSync;
  const planning = join(baseDir, '.planning');
  const destRel = `.planning/${destDirRel}/${next.id}.md`;
  const destAbs = join(baseDir, destRel);
  assertRealInsidePlanning(baseDir, destAbs, '/sig:item');

  const fromDirRel = toPosix(relative(planning, dirname(join(baseDir, found.path))));
  const text = stringifyItem(next, rewriteRelativeLinks(body, fromDirRel, destDirRel));

  if (destRel === found.path) {
    await atomicWrite(destAbs, text, { renameFn: opts.renameFn });
    return { from: found.path, to: destRel };
  }
  if (exists(destAbs)) {
    throw new WorkStoreError('CONFLICT', `${destRel} already exists — nothing was moved. `
      + 'Find out what it is before moving anything onto it.');
  }

  const firstCreated = mkdirSync(dirname(destAbs), { recursive: true });
  const git = isGitRepo(baseDir, execFn) && isTracked(baseDir, found.path, execFn);
  try {
    moveFile(baseDir, found.path, destRel, git, execFn);
  } catch (err) {
    if (firstCreated) removeCreatedDirs(dirname(destAbs), firstCreated);
    throw err;
  }
  try {
    await atomicWrite(destAbs, text, { renameFn: opts.renameFn });
  } catch (err) {
    // Undo the move. The file at destAbs is still the original bytes
    // (atomicWrite never half-writes), so moving it back restores the item.
    moveFile(baseDir, destRel, found.path, git, execFn);
    if (firstCreated) removeCreatedDirs(dirname(destAbs), firstCreated);
    throw err;
  }
  return { from: found.path, to: destRel };
}

// ── Mutations ────────────────────────────────────────────────────────────────

/**
 * Capture a new item into `inbox/` with status N (D-M6E11-6: the file is
 * created at capture and is the same file for life).
 *
 * @param {string} baseDir
 * @param {{type?: string, title?: string, body?: string, source?: string, source_ref?: string,
 *   theme?: string, priority?: string|number, by: string, at?: string, linksFrom?: string}} fields
 *   `body` is written verbatim apart from relative link targets, which are
 *   rewritten from `linksFrom` (default `''`, i.e. written from `.planning/`)
 *   to the inbox's depth (D-M6E11-22). `at` defaults to now.
 * @param {{execFn?: Function, renameFn?: Function}} [opts]
 * @returns {Promise<object>} the item's frontmatter
 */
export async function newItem(baseDir, fields = {}, opts = {}) {
  const { type = 'NEW', title, body = '', source, source_ref, theme, priority, by, at, linksFrom = '' } = fields;
  return withWorkLock(baseDir, async () => {
    const { id } = nextId(baseDir, { execFn: opts.execFn });
    const item = { id, type, status: 'N', title, theme, priority, source, source_ref,
      created: { at: at ?? new Date().toISOString(), by } };
    for (const k of Object.keys(item)) if (item[k] === undefined) delete item[k];
    assertValid(item, `new item ${id}`);

    const dirRel = `${WORK_DIR}/${FOLDERS.inbox}`;
    const rel = `.planning/${dirRel}/${id}.md`;
    const abs = join(baseDir, rel);
    assertRealInsidePlanning(baseDir, abs, '/sig:item new');
    if (exists(abs)) throw new WorkStoreError('CONFLICT', `${rel} already exists — nothing was written.`);
    mkdirSync(dirname(abs), { recursive: true });
    await atomicWrite(abs, stringifyItem(item, rewriteRelativeLinks(body, linksFrom, dirRel)), { renameFn: opts.renameFn });
    await regenerate(baseDir, `${id} was written to ${rel}`);
    return item;
  });
}

/**
 * Move an item to a new status (and, for Q/P, an Epic). The folder follows
 * from the status (D-M6E11-8); closing is `closeItem`'s job.
 *
 * @param {string} baseDir
 * @param {string} idOrLabel
 * @param {{status: string, epic?: string, sprint?: string}} to
 *   `epic` is required for Q/P when the item is not already in an Epic folder,
 *   and refused otherwise. `sprint` is refused: sprints are step 3.
 * @param {{execFn?: Function, renameFn?: Function}} [opts]
 * @returns {Promise<{item: object, label: string, from: string, to: string}>}
 */
export async function moveItem(baseDir, idOrLabel, to = {}, opts = {}) {
  const id = frontOf(idOrLabel);
  const { status, epic, sprint } = to;
  return withWorkLock(baseDir, async () => {
    if (sprint !== undefined) {
      throw new WorkStoreError('SCHEMA', `${id}: sprints are not part of the store yet (step 3) — nothing was moved.`);
    }
    if (!ITEM_STATUSES.includes(status)) {
      throw new WorkStoreError('SCHEMA', `${id}: status must be one of ${ITEM_STATUSES.join('/')} `
        + `(got ${JSON.stringify(status)})`);
    }
    if (status === 'C') {
      throw new WorkStoreError('SCHEMA', `${id}: use closeItem (\`/sig:item close\`) to close an item — `
        + 'a close needs a reason, who, and when.');
    }
    const found = getItem(baseDir, id);
    let targetEpic;
    if (status === 'Q' || status === 'P') {
      targetEpic = epic ?? found.epic;
      if (targetEpic === undefined) {
        throw new WorkStoreError('SCHEMA', `${id}: status ${status} lives in an Epic folder — name the Epic.`);
      }
      assertEpicId(targetEpic);
    } else if (epic !== undefined) {
      throw new WorkStoreError('SCHEMA', `${id}: an epic only goes with status Q or P (got ${status}).`);
    }
    const next = { ...found.item, status };
    assertValid(next, id);
    const r = await relocate(baseDir, found, next, found.body, folderFor(next, targetEpic), opts);
    await regenerate(baseDir, `${id} moved ${r.from} → ${r.to}`);
    return { item: next, label: renderLabel(next), ...r };
  });
}

/**
 * Close an item: record why, who, when (and proof), and move it to
 * `done/YYYY-MM/`. Nothing is deleted (D-M6E11-12).
 *
 * @param {string} baseDir
 * @param {string} idOrLabel
 * @param {{reason: string, by: string, proof?: string, dup_of?: string, at?: string}} close
 *   `fixed` without proof records `proof: 'none given'` (AC-5.4).
 * @param {{execFn?: Function, renameFn?: Function}} [opts]
 * @returns {Promise<{item: object, label: string, from: string, to: string}>}
 */
export async function closeItem(baseDir, idOrLabel, close = {}, opts = {}) {
  const id = frontOf(idOrLabel);
  const { reason, by, dup_of: dupOf, at = new Date().toISOString() } = close;
  let { proof } = close;
  return withWorkLock(baseDir, async () => {
    if (reason === undefined || reason === null || reason === '') {
      throw new WorkStoreError('SCHEMA', `${id}: a close needs a reason (${CLOSE_REASONS.join(', ')}) — nothing was closed.`);
    }
    if (!CLOSE_REASONS.includes(reason)) {
      throw new WorkStoreError('SCHEMA', `${id}: close reason must be one of ${CLOSE_REASONS.join(', ')} `
        + `(got ${JSON.stringify(reason)})`);
    }
    if (typeof at !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])/.test(at)) {
      throw new WorkStoreError('SCHEMA', `${id}: close time must be an ISO date (got ${JSON.stringify(at)})`);
    }
    const found = getItem(baseDir, id);
    if (found.item.status === 'C') {
      throw new WorkStoreError('CONFLICT', `${id} is already closed (${found.item.close?.reason}) at ${found.path}.`);
    }
    if (reason === 'dup') {
      if (dupOf === undefined) throw new WorkStoreError('SCHEMA', `${id}: a dup close needs dup_of — the item it duplicates.`);
      if (frontOf(dupOf) === id) throw new WorkStoreError('SCHEMA', `${id} cannot be a duplicate of itself.`);
      getItem(baseDir, dupOf); // NOT_FOUND unless it exists
    }
    if (reason === 'fixed' && (proof === undefined || proof === null || String(proof).trim() === '')) {
      proof = 'none given';
    }
    const record = { reason, by, at, proof, dup_of: reason === 'dup' ? frontOf(dupOf) : dupOf };
    for (const k of Object.keys(record)) if (record[k] === undefined) delete record[k];
    const next = { ...found.item, status: 'C', close: record };
    assertValid(next, id);
    const r = await relocate(baseDir, found, next, found.body, folderFor(next), opts);
    await regenerate(baseDir, `${id} closed (${reason}) and moved ${r.from} → ${r.to}`);
    return { item: next, label: renderLabel(next), ...r };
  });
}
