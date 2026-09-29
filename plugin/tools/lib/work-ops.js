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
import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

// `scrubSensitive` is the one detector `/sig:add` and `/sig:checkpoint` use.
// No new cycle: add.js reaches this module only through a lazy import, and
// this module already reaches add.js statically (work-generate → backlog).
import { scrubSensitive } from './add.js';
import { applyKeyedReplacements, computeLinkEdits } from './archive-tree.js';
import { atomicWrite } from './atomic-write.js';
import { acquireLock } from './file-lock.js';
import { assertRealInsidePlanning } from './path-confine.js';
import { EPIC_ID_STRICT_RE, parseFrontmatter, StateSchemaError, stringifyFrontmatter } from './state.js';
import { asWorkStoreError, lockFailure } from './work-errors.js';
import { assertNoHandKeptLists, EPIC_README, generateAll } from './work-generate.js';
import {
  ITEM_ID_RE,
  ITEM_STATUSES,
  CLOSE_REASONS,
  itemNumber,
  parseItem,
  renderLabel,
  stringifyItem,
  validateItem,
  WorkStoreError,
} from './work-item.js';
import { rewriteRelativeLinks } from './work-links.js';
import { isGeneratedText } from './work-marker.js';
import {
  folderFor,
  FOLDERS,
  isGitRepo,
  isStoreOn,
  nextId,
  parseItemFileName,
  STORE_OFF_MESSAGE,
  walkFiles,
  WORK_DIR,
  WORK_LOCK_REL,
  WORK_LOCK_TTL_MS,
} from './work-store.js';

export { WORK_LOCK_REL };

// ── Shared plumbing ──────────────────────────────────────────────────────────

function requireStore(baseDir) {
  const store = isStoreOn(baseDir);
  if (!store.on) {
    throw new WorkStoreError('CONFIG', STORE_OFF_MESSAGE);
  }
  return store;
}

// The store check comes BEFORE the lock: `acquireLock` creates the lock's
// parent folder, and a store-off project must not grow `.planning/work/`.
// The hand-kept check comes right AFTER it (REVIEW I1): every mutation ends
// by regenerating the lists, so a list that is still hand-kept must stop the
// mutation before the item is written, not after.
async function withWorkLock(baseDir, fn) {
  requireStore(baseDir);
  let lock;
  try {
    lock = await acquireLock(join(baseDir, WORK_LOCK_REL), { label: 'work store', ttlMs: WORK_LOCK_TTL_MS });
  } catch (err) {
    throw lockFailure(err);
  }
  try {
    assertNoHandKeptLists(baseDir);
    return await fn();
  } finally {
    await lock.released(); // only while this call still holds it (REVIEW I4)
  }
}

const toPosix = (p) => p.split(sep).join('/');

// `assertRealInsidePlanning`, as a WorkStoreError: a folder on the way that is
// a symlink out of `.planning/` is a state of the disk to fix by hand
// (CONFLICT); a filesystem failure while checking is IO.
function confine(baseDir, abs, label) {
  try {
    assertRealInsidePlanning(baseDir, abs, label);
  } catch (err) {
    throw asWorkStoreError(err, typeof err?.code === 'string' ? 'IO' : 'CONFLICT');
  }
}

// An ID, or a label whose front is an ID. Only the front identifies an item
// (AC-2.3): `SIG-412-FEAT-C` finds SIG-412 whatever SIG-412 now is. The ID
// half is ITEM_ID_RE itself (its anchors dropped), so the ID shape has one
// definition.
const FRONT_RE = new RegExp(`^(${ITEM_ID_RE.source.replace(/^\^|\$$/g, '')})(?:-[A-Z]+-[A-Z])?$`);

function frontOf(idOrLabel) {
  const m = typeof idOrLabel === 'string' ? idOrLabel.match(FRONT_RE) : null;
  if (!m) {
    throw new WorkStoreError('SCHEMA', `${JSON.stringify(idOrLabel)} is not an item ID or label `
      + '(expected SIG-412 or SIG-412-BUG-T)');
  }
  return m[1];
}

// Every item file the store holds: the live tree and archived Epics — or,
// with `epic`, only that Epic's folder, live and archived (AC-8.1: "what is in
// this Epic?" reads the folder and nothing else). `walkFiles` does not follow
// symlinks, so nothing outside is ever read.
function itemFiles(baseDir, epic) {
  const planning = join(baseDir, '.planning');
  const roots = epic === undefined
    ? [join(planning, WORK_DIR), join(planning, 'archive', 'epics')]
    : [join(planning, WORK_DIR, FOLDERS.epics, epic), join(planning, 'archive', 'epics', epic)];
  return roots.flatMap((root) => walkFiles(root)).filter((abs) => parseItemFileName(basename(abs)));
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
  if (filter.epic !== undefined) assertEpicId(filter.epic);
  requireStore(baseDir);
  const rows = [];
  const errors = [];
  for (const abs of itemFiles(baseDir, filter.epic)) {
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
    .sort((a, b) => itemNumber(a.item.id) - itemNumber(b.item.id) || a.item.id.localeCompare(b.item.id))
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
    throw asWorkStoreError(err, 'IO');
  }
}

async function regenerate(baseDir, done) {
  try {
    await generateAll(baseDir);
  } catch (err) {
    // The item change stands — it is correct and `checkStore` names whatever
    // broke generation; undoing a good change to protect a stale view would
    // be the wrong way round.
    // A raw error here is git or the filesystem: IO, with the same sentence.
    const code = err instanceof WorkStoreError ? err.code : 'IO';
    const wrapped = new WorkStoreError(code, `${done}, but the lists were not regenerated: ${err?.message ?? err}`);
    wrapped.cause = err;
    throw wrapped;
  }
}

// Put `next` (with `body`) at `destDirRel/{id}.md`, moving it from `found`.
// Validated and confined by the caller's checks plus the ones here; rewinds on
// a failed write. Runs inside the `work` lock.
//
// `undoLog`, when given, receives a function that puts the item back exactly
// as it was — path and bytes — for a batch that must be all or nothing.
async function relocate(baseDir, found, next, body, destDirRel, opts, undoLog) {
  const execFn = opts.execFn ?? execFileSync;
  const planning = join(baseDir, '.planning');
  const destRel = `.planning/${destDirRel}/${next.id}.md`;
  const destAbs = join(baseDir, destRel);
  confine(baseDir, destAbs, '/sig:item');

  const fromDirRel = toPosix(relative(planning, dirname(join(baseDir, found.path))));
  const text = stringifyItem(next, rewriteRelativeLinks(body, fromDirRel, destDirRel));

  const original = undoLog ? readFileSync(join(baseDir, found.path), 'utf-8') : null;
  if (destRel === found.path) {
    await atomicWrite(destAbs, text, { renameFn: opts.renameFn });
    undoLog?.push(() => atomicWrite(destAbs, original));
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
    throw asWorkStoreError(err, 'IO');
  }
  try {
    await atomicWrite(destAbs, text, { renameFn: opts.renameFn });
  } catch (err) {
    // Undo the move. The file at destAbs is still the original bytes
    // (atomicWrite never half-writes), so moving it back restores the item.
    moveFile(baseDir, destRel, found.path, git, execFn);
    if (firstCreated) removeCreatedDirs(dirname(destAbs), firstCreated);
    throw asWorkStoreError(err, 'IO');
  }
  undoLog?.push(async () => {
    moveFile(baseDir, destRel, found.path, git, execFn);
    await atomicWrite(join(baseDir, found.path), original);
    if (firstCreated) removeCreatedDirs(dirname(destAbs), firstCreated);
  });
  return { from: found.path, to: destRel };
}

// ── Mutations ────────────────────────────────────────────────────────────────

// Every sensitive-data hit in the specs' titles and bodies. Each field is
// scanned on its own, so a hit's `index` is an offset into that field.
function scrubFields(specs) {
  const hits = [];
  for (const { title, body } of specs) {
    for (const text of [title, body]) {
      if (typeof text === 'string' && text !== '') hits.push(...scrubSensitive(text).hits);
    }
  }
  return hits;
}

/**
 * Capture a new item into `inbox/` with status N (D-M6E11-6: the file is
 * created at capture and is the same file for life).
 *
 * Sensitive data (REVIEW I3): `newItem` is the gate. Title and body run
 * through `add.js#scrubSensitive` before anything is written; with a hit and
 * no `opts.acknowledgeSensitive`, it writes nothing and returns
 * `{aborted: 'sensitive-data-pending', sensitiveHits}` so the caller can ask
 * the user and call again. A caller that has ALREADY asked about the same
 * text passes `acknowledgeSensitive: true` — `/sig:add`'s store path and
 * `/sig:checkpoint` do, so nobody is asked twice. Detection only; never
 * redacts.
 *
 * @param {string} baseDir
 * @param {{type?: string, title?: string, body?: string, source?: string, source_ref?: string,
 *   theme?: string, priority?: string|number, by: string, at?: string, linksFrom?: string}} fields
 *   `body` is written verbatim apart from relative link targets, which are
 *   rewritten from `linksFrom` (default `''`, i.e. written from `.planning/`)
 *   to the inbox's depth (D-M6E11-22). `at` defaults to now.
 * @param {{execFn?: Function, renameFn?: Function, acknowledgeSensitive?: boolean}} [opts]
 * @returns {Promise<object>} the item's frontmatter, or
 *   `{aborted: 'sensitive-data-pending', sensitiveHits}` when nothing was written
 */
export async function newItem(baseDir, fields = {}, opts = {}) {
  const r = await newItems(baseDir, [fields], opts);
  return Array.isArray(r) ? r[0] : r;
}

/**
 * Capture several new items at once (REVIEW I7): ONE `work` lock, sequential
 * IDs from one `nextId`, every item validated before any is written, and ONE
 * regeneration at the end. `/sig:checkpoint` uses it for its questions, so a
 * busy lock or a failed write cannot leave some of them written and some not.
 *
 * All or nothing for the item files: if writing item k fails, the items this
 * call wrote before it are removed (and any folder it created, while empty),
 * so the store is as it was. Nothing it did not create is touched.
 *
 * Regeneration is NOT part of that undo, as for every other mutation here
 * (`regenerate`): once the items are written they are correct, and a failed
 * regeneration leaves them standing with an error that says so. Whatever is
 * thrown after the items landed carries `err.written` — their paths,
 * relative to `baseDir` — and one thrown before carries `err.written = []`.
 *
 * @param {string} baseDir
 * @param {Array<object>} specs — each as `newItem`'s `fields`
 * @param {{execFn?: Function, renameFn?: Function, acknowledgeSensitive?: boolean}} [opts]
 *   the sensitive-data rule is `newItem`'s, over every spec's title and body
 * @returns {Promise<object[]|{aborted: 'sensitive-data-pending', sensitiveHits: object[]}>}
 *   the items' frontmatter in spec order
 */
export async function newItems(baseDir, specs, opts = {}) {
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new WorkStoreError('SCHEMA', 'newItems: pass at least one item — nothing was written.');
  }
  requireStore(baseDir);
  const sensitiveHits = scrubFields(specs.map(({ title, body }) => ({ title, body })));
  if (sensitiveHits.length > 0 && !opts.acknowledgeSensitive) {
    return { aborted: 'sensitive-data-pending', sensitiveHits };
  }
  const written = [];
  try {
    return await withWorkLock(baseDir, async () => {
      const { id: first } = nextId(baseDir, { execFn: opts.execFn });
      const key = first.slice(0, first.lastIndexOf('-'));
      const start = itemNumber(first);
      const dirRel = `${WORK_DIR}/${FOLDERS.inbox}`;

      // Every item as it will be, validated and confined, before any write.
      const planned = specs.map((fields, i) => {
        const { type = 'NEW', title, body = '', source, source_ref, theme, priority, by, at, linksFrom = '' } = fields;
        const id = `${key}-${start + i}`;
        const item = { id, type, status: 'N', title, theme, priority, source, source_ref,
          created: { at: at ?? new Date().toISOString(), by } };
        for (const k of Object.keys(item)) if (item[k] === undefined) delete item[k];
        assertValid(item, `new item ${id}`);
        const rel = `.planning/${dirRel}/${id}.md`;
        const abs = join(baseDir, rel);
        confine(baseDir, abs, '/sig:item new');
        if (exists(abs)) throw new WorkStoreError('CONFLICT', `${rel} already exists — nothing was written.`);
        return { item, rel, abs, text: stringifyItem(item, rewriteRelativeLinks(body, linksFrom, dirRel)) };
      });

      const inboxAbs = join(baseDir, '.planning', dirRel);
      const firstCreated = mkdirSync(inboxAbs, { recursive: true });
      try {
        for (const p of planned) {
          await atomicWrite(p.abs, p.text, { renameFn: opts.renameFn });
          written.push(p.rel);
        }
      } catch (err) {
        // Undo only this batch's own files: each was created here (the
        // CONFLICT check above), so removing it cannot touch anything else.
        for (const rel of [...written].reverse()) unlinkSync(join(baseDir, rel));
        written.length = 0;
        if (firstCreated) removeCreatedDirs(inboxAbs, firstCreated);
        throw asWorkStoreError(err, 'IO');
      }
      const where = planned.length === 1
        ? `${planned[0].item.id} was written to ${planned[0].rel}`
        : `${planned.map((p) => p.item.id).join(', ')} were written to .planning/${dirRel}/`;
      await regenerate(baseDir, where);
      return planned.map((p) => p.item);
    });
  } catch (err) {
    if (err && typeof err === 'object') err.written = [...written];
    throw err;
  }
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
    // The Epic's README goes in first, so a failed README write has moved
    // nothing; a failed move then removes the README and folders it created.
    const readme = targetEpic === undefined ? null : await ensureEpicReadme(baseDir, targetEpic, id, opts);
    let r;
    try {
      r = await relocate(baseDir, found, next, found.body, folderFor(next, targetEpic), opts);
    } catch (err) {
      if (readme?.created) {
        unlinkSync(readme.abs);
        if (readme.firstCreated) removeCreatedDirs(dirname(readme.abs), readme.firstCreated);
      }
      throw err;
    }
    await regenerate(baseDir, `${id} moved ${r.from} → ${r.to}`);
    return { item: next, label: renderLabel(next), ...r };
  });
}

/**
 * Close an item: record why, who, when (and proof), and move it to
 * `done/YYYY-MM/` — or, for an item in an Epic folder, keep it there
 * (D-M6E11-29: it is archived with its Epic). Nothing is deleted (D-M6E11-12).
 *
 * @param {string} baseDir
 * @param {string} idOrLabel
 * @param {{reason: string, by: string, proof?: string, dup_of?: string, at?: string}} close
 *   `fixed` without proof records `proof: 'none given'` (AC-5.4).
 * @param {{execFn?: Function, renameFn?: Function}} [opts]
 * @returns {Promise<{item: object, label: string, from: string, to: string}>}
 */
export async function closeItem(baseDir, idOrLabel, close = {}, opts = {}) {
  const [r] = await closeItems(baseDir, [{ ...close, id: idOrLabel }], opts);
  return r;
}

/**
 * Close several items at once: ONE `work` lock, every close validated before
 * any is written, and ONE regeneration. All or nothing for the item files: if
 * closing item k fails, the items closed before it are put back — path and
 * bytes — and nothing else is touched. The same item twice is refused
 * (SCHEMA), before anything is written. `backlog.js`'s store-on discharge
 * uses it, so a SHIP cannot record half its discharges.
 *
 * @param {string} baseDir
 * @param {Array<{id: string, reason: string, by: string, proof?: string, dup_of?: string, at?: string}>} closes
 *   each as `closeItem`'s `close`, plus the item's `id` (or label)
 * @param {{execFn?: Function, renameFn?: Function}} [opts]
 * @returns {Promise<Array<{item: object, label: string, from: string, to: string}>>} in `closes` order
 */
export async function closeItems(baseDir, closes, opts = {}) {
  if (!Array.isArray(closes) || closes.length === 0) {
    throw new WorkStoreError('SCHEMA', 'closeItems: pass at least one close — nothing was closed.');
  }
  const ids = closes.map((c) => frontOf(c?.id));
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (twice.length) {
    throw new WorkStoreError('SCHEMA', `closeItems: ${[...new Set(twice)].join(', ')} named more than once — nothing was closed.`);
  }
  return withWorkLock(baseDir, async () => {
    const planned = closes.map((c, i) => planClose(baseDir, ids[i], c));
    const undo = [];
    const results = [];
    try {
      for (const p of planned) {
        const r = await relocate(baseDir, p.found, p.next, p.found.body, folderFor(p.next, p.found.epic), opts, undo);
        results.push({ item: p.next, label: renderLabel(p.next), ...r });
      }
    } catch (err) {
      for (const u of undo.reverse()) await u();
      throw asWorkStoreError(err, 'IO');
    }
    const done = results.length === 1
      ? `${planned[0].id} closed (${planned[0].next.close.reason}) and moved ${results[0].from} → ${results[0].to}`
      : `${results.map((r) => r.item.id).join(', ')} were closed`;
    await regenerate(baseDir, done);
    return results;
  });
}

// One close, validated and built, nothing written. Runs inside the lock.
function planClose(baseDir, id, close) {
  const { reason, by, dup_of: dupOf, at = new Date().toISOString() } = close;
  let { proof } = close;
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
  return { id, found, next };
}

/**
 * Reopen a closed item (D-M6E11-31): it goes back to `backlog/` as T, and its
 * close record — reason, who, when, proof — moves onto `history` with who
 * reopened it, when and why. Nothing is erased and nothing is deleted.
 *
 * Works for an item in `done/YYYY-MM/` and for a closed item still inside a
 * live Epic folder. Refused for an item archived with its Epic: that Epic is
 * finished, and pulling an item out of it would change what the archive says
 * the Epic contained — capture a new item and link it instead.
 *
 * @param {string} baseDir
 * @param {string} idOrLabel
 * @param {{by: string, reason: string, at?: string}} reopen — `reason` is
 *   required: a reopen with no why is a close record nobody can interpret
 *   later. `at` defaults to now.
 * @param {{execFn?: Function, renameFn?: Function}} [opts]
 * @returns {Promise<{item: object, label: string, from: string, to: string}>}
 */
export async function reopenItem(baseDir, idOrLabel, reopen = {}, opts = {}) {
  const id = frontOf(idOrLabel);
  const { by, reason, at = new Date().toISOString() } = reopen;
  return withWorkLock(baseDir, async () => {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new WorkStoreError('SCHEMA', `${id}: a reopen needs a reason — what came back, and how you know. `
        + 'Nothing was reopened.');
    }
    const found = getItem(baseDir, id);
    if (found.item.status !== 'C') {
      throw new WorkStoreError('CONFLICT', `${id} is not closed (status ${found.item.status}, ${found.path}) — `
        + 'only a closed item can be reopened.');
    }
    if (found.path.startsWith('.planning/archive/')) {
      throw new WorkStoreError('CONFLICT', `${id} is archived with Epic ${found.epic} (${found.path}), and that `
        + 'Epic is closed — nothing was reopened. Capture a new item (`/sig:item new`) and link it to '
        + `${id} instead.`);
    }
    const entry = { ...found.item.close, reopened_at: at, reopened_by: by, reopen_reason: reason };
    const next = { ...found.item, status: 'T', history: [...(found.item.history ?? []), entry] };
    delete next.close;
    assertValid(next, id);
    const r = await relocate(baseDir, found, next, found.body, folderFor(next), opts);
    await regenerate(baseDir, `${id} reopened and moved ${r.from} → ${r.to}`);
    return { item: next, label: renderLabel(next), ...r };
  });
}

// ── Epics (t5.3, FR-8, D-M6E11-13) ──────────────────────────────────────────
//
// `work/epics/<id>/README.md` is the Epic's intent file. It is not an item —
// its name is not an ID, so every walker that keys on `parseItemFileName`
// (checkStore, listItems, generateAll, nextId) passes over it. It is created
// with the folder when the first item moves in, and carries the close record
// once the Epic is archived.

const epicDirRel = (epic) => `${WORK_DIR}/${FOLDERS.epics}/${epic}`;
const archivedEpicDirRel = (epic) => `archive/epics/${epic}`;

// Create the Epic's README if it has none. Never overwrites. A failed write
// removes the folders it created and throws a WorkStoreError.
async function ensureEpicReadme(baseDir, epic, id, opts) {
  const abs = join(baseDir, '.planning', epicDirRel(epic), EPIC_README);
  if (exists(abs)) return { abs, created: false };
  confine(baseDir, abs, '/sig:item');
  const firstCreated = mkdirSync(dirname(abs), { recursive: true });
  try {
    await atomicWrite(abs, stringifyFrontmatter({ epic }, `# ${epic}\n`), { renameFn: opts.renameFn });
  } catch (err) {
    if (firstCreated) removeCreatedDirs(dirname(abs), firstCreated);
    const rel = toPosix(relative(baseDir, abs));
    throw new WorkStoreError('CONFLICT', `${id}: could not write ${rel} (${err.message}) — nothing was moved. `
      + 'Fix what stopped the write, then re-run.');
  }
  return { abs, created: true, firstCreated };
}

// Every entry under `dir`, files and folders, without following symlinks.
// Anything that is neither (a symlink, a socket) is returned as `other` —
// moving the folder would leave it behind, so the caller refuses.
function listTree(dir) {
  const files = [];
  const dirs = [];
  const other = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) {
        dirs.push(p);
        walk(p);
      } else if (e.isFile()) files.push(p);
      else other.push(p);
    }
  };
  walk(dir);
  return { files: files.sort(), dirs, other };
}

// Remove `dir` and every folder under it, deepest first, only while empty.
// `rmdirSync` refuses a non-empty folder, so this can never remove a file.
function removeEmptyTree(dir) {
  let dirs;
  try {
    dirs = listTree(dir).dirs;
  } catch {
    return;
  }
  for (const d of [...dirs.sort((a, b) => b.length - a.length), dir]) {
    try {
      rmdirSync(d);
    } catch {
      /* not empty, or gone — leave it */
    }
  }
}

/**
 * Close an Epic: refuse while any item in its folder is open; otherwise record
 * the close in its README.md and move the whole folder to
 * `.planning/archive/epics/<id>/` (AC-8.3, AC-8.4).
 *
 * An Epic with no folder — every Epic from before the store — is not an error:
 * `{status: 'no-folder'}`, nothing read or written, so `/sig:ship` behaves as
 * it always has. Moving existing Epics into folders is migration (step 5).
 *
 * Each file moves with `git mv` when git tracks it, a rename otherwise; links
 * in the moved files are rewritten for the new location, except links between
 * files of the folder, which move together. A failure before the regeneration
 * puts every file back where it was, byte-for-byte.
 *
 * @param {string} baseDir
 * @param {string} epicId
 * @param {{by: string, pr?: string|number, release?: string, at?: string}} close — `at` defaults to now
 * @param {{execFn?: Function, renameFn?: Function}} [opts]
 * @returns {Promise<{status: 'no-folder'} | {status: 'already-archived', path: string}
 *   | {status: 'closed', from: string, to: string, moved: string[], rewritten: string[], close: object}>}
 *   `rewritten` — live files outside the folder whose links into it were
 *   retargeted at the archive, relative to `baseDir`
 * @throws {WorkStoreError} SCHEMA (bad ID, no `by`, broken item or README),
 *   OPEN_ITEMS (each open item named), CONFLICT (archive folder exists, or
 *   the folder holds something that is not a file or folder)
 */
export async function closeEpic(baseDir, epicId, close = {}, opts = {}) {
  assertEpicId(epicId);
  const { by, pr, release, at = new Date().toISOString() } = close;
  if (typeof by !== 'string' || by.trim() === '') {
    throw new WorkStoreError('SCHEMA', `${epicId}: closing an Epic records who closed it — pass \`by\`.`);
  }
  if (typeof at !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])/.test(at)) {
    throw new WorkStoreError('SCHEMA', `${epicId}: close time must be an ISO date (got ${JSON.stringify(at)})`);
  }
  const execFn = opts.execFn ?? execFileSync;
  return withWorkLock(baseDir, async () => {
    const planning = join(baseDir, '.planning');
    const fromDirRel = epicDirRel(epicId);
    const toDirRel = archivedEpicDirRel(epicId);
    const fromRel = `.planning/${fromDirRel}`;
    const toRel = `.planning/${toDirRel}`;
    const fromAbs = join(planning, fromDirRel);
    const toAbs = join(planning, toDirRel);

    let st = null;
    try {
      st = lstatSync(fromAbs);
    } catch (err) {
      if (err.code !== 'ENOENT') throw asWorkStoreError(err, 'IO');
    }
    if (st === null) {
      return exists(toAbs) ? { status: 'already-archived', path: toRel } : { status: 'no-folder' };
    }
    if (!st.isDirectory()) {
      throw new WorkStoreError('CONFLICT', `${fromRel} is not a folder (a symlink or a file) — nothing was moved.`);
    }
    confine(baseDir, fromAbs, '/sig:item');
    confine(baseDir, toAbs, '/sig:item');

    // The gate. Every item file in the folder, open ones named.
    const tree = listTree(fromAbs);
    if (tree.other.length) {
      const names = tree.other.map((p) => toPosix(relative(baseDir, p))).join(', ');
      throw new WorkStoreError('CONFLICT', `${fromRel} holds entries that are not files or folders (${names}); `
        + 'moving the folder would leave them behind. Remove or replace them, then re-run.');
    }
    const open = [];
    const broken = [];
    for (const abs of tree.files) {
      if (!parseItemFileName(basename(abs))) continue;
      const r = readItemFile(baseDir, abs);
      if (r.errors.length) broken.push(...r.errors);
      else if (r.item.status !== 'C') open.push(r.item);
    }
    if (broken.length) {
      throw new WorkStoreError('SCHEMA', `${epicId} cannot be closed — fix these item files first:\n${broken.join('\n')}`);
    }
    if (open.length) {
      const lines = open
        .sort((a, b) => itemNumber(a.id) - itemNumber(b.id))
        .map((it) => `  ${renderLabel(it)} (status ${it.status})${it.title ? ` — ${it.title}` : ''}`);
      throw new WorkStoreError('OPEN_ITEMS', `${epicId} has ${open.length} open item${open.length === 1 ? '' : 's'} `
        + `in ${fromRel}/ — close each (\`/sig:item close\`) or move it back to backlog `
        + `(\`/sig:item move <id> T\`), then re-run. Nothing was moved:\n${lines.join('\n')}`);
    }
    if (exists(toAbs)) {
      throw new WorkStoreError('CONFLICT', `${toRel} already exists — nothing was moved. `
        + 'Find out what it is before archiving onto it.');
    }

    // The README with the close recorded, built before anything moves so a
    // broken one refuses cleanly.
    const readmeAbs = join(fromAbs, EPIC_README);
    let data = { epic: epicId };
    let body = `# ${epicId}\n`;
    const readmeExisted = exists(readmeAbs);
    if (readmeExisted) {
      try {
        const parsed = parseFrontmatter(readFileSync(readmeAbs, 'utf-8'));
        data = parsed.data ?? { epic: epicId };
        ({ body } = parsed);
      } catch (err) {
        if (!(err instanceof StateSchemaError)) throw err;
        throw new WorkStoreError('SCHEMA', `${fromRel}/${EPIC_README}: its frontmatter is not valid YAML — `
          + `fix it, then re-run. Nothing was moved. (${err.message})`);
      }
    }
    const record = { at, by, pr, release };
    for (const k of Object.keys(record)) if (record[k] === undefined) delete record[k];
    data = { ...data, close: record };

    // Move each file (git mv when tracked), then rewrite links and write the
    // README at the new location. Any failure in here is undone in reverse:
    // rewritten files get their old text back, a README this call created is
    // removed, every file moves back, and the folders this created go.
    const git = isGitRepo(baseDir, execFn);
    const moved = [];
    const written = []; // {abs, text} — text null when this call created the file
    const rewritten = []; // live files outside the folder whose links were retargeted
    const firstCreated = mkdirSync(toAbs, { recursive: true });
    try {
      for (const abs of tree.files) {
        const rel = toPosix(relative(baseDir, abs));
        const dest = `${toRel}${rel.slice(fromRel.length)}`;
        mkdirSync(dirname(join(baseDir, dest)), { recursive: true });
        const tracked = git && isTracked(baseDir, rel, execFn);
        moveFile(baseDir, rel, dest, tracked, execFn);
        moved.push({ from: rel, to: dest, git: tracked });
      }
      const together = { movedTogether: { from: fromDirRel, to: toDirRel } };
      for (const m of moved) {
        if (!m.to.endsWith('.md') || m.to === `${toRel}/${EPIC_README}`) continue;
        const abs = join(baseDir, m.to);
        const text = readFileSync(abs, 'utf-8');
        const dirFrom = toPosix(relative(planning, dirname(join(baseDir, m.from))));
        const dirTo = toPosix(relative(planning, dirname(abs)));
        const next = rewriteRelativeLinks(text, dirFrom, dirTo, together);
        if (next === text) continue;
        written.push({ abs, text });
        await atomicWrite(abs, next, { renameFn: opts.renameFn });
      }
      // Inbound links: every live `.planning/**/*.md` that links into the
      // folder is retargeted at the archive — archive-tree's link machinery,
      // keyed to this move. `archive/` is history and is left as written;
      // generated files are rebuilt from the items by the regeneration below.
      // No text pre-filter: a link is relative to its own file, so an item in
      // `backlog/` reaches the folder as `../epics/<id>/…`, which never
      // contains `work/epics/<id>` (REVIEW I5). `computeLinkEdits` decides.
      const moveMap = new Map(moved.map((m) => [m.from, m.to]));
      const archiveRoot = join(planning, 'archive') + sep;
      for (const abs of walkFiles(planning).sort()) {
        if (!abs.endsWith('.md') || abs.startsWith(archiveRoot)) continue;
        const text = readFileSync(abs, 'utf-8');
        if (isGeneratedText(text)) continue;
        const rel = toPosix(relative(baseDir, abs));
        const next = applyKeyedReplacements(text, computeLinkEdits(rel, text, moveMap));
        if (next === text) continue;
        written.push({ abs, text });
        await atomicWrite(abs, next, { renameFn: opts.renameFn });
        rewritten.push(rel);
      }
      const readmeDest = join(toAbs, EPIC_README);
      written.push({ abs: readmeDest, text: readmeExisted ? readFileSync(readmeDest, 'utf-8') : null });
      const readmeBody = readmeExisted ? rewriteRelativeLinks(body, fromDirRel, toDirRel, together) : body;
      await atomicWrite(readmeDest, stringifyFrontmatter(data, readmeBody), { renameFn: opts.renameFn });
    } catch (err) {
      for (const w of written.reverse()) {
        if (w.text === null) {
          if (exists(w.abs)) unlinkSync(w.abs);
        } else {
          // atomicWrite never half-writes, so the file holds either the old
          // text or the new; writing the old back is correct in both cases.
          await atomicWrite(w.abs, w.text);
        }
      }
      for (const m of moved.reverse()) moveFile(baseDir, m.to, m.from, m.git, execFn);
      removeEmptyTree(toAbs);
      if (firstCreated) removeCreatedDirs(dirname(toAbs), firstCreated);
      throw asWorkStoreError(err, 'IO');
    }

    removeEmptyTree(fromAbs);

    await regenerate(baseDir, `${epicId} closed and moved ${fromRel}/ → ${toRel}/`);
    return { status: 'closed', from: fromRel, to: toRel, moved: moved.map((m) => m.to), rewritten, close: record };
  });
}

// ── Triage (t3.2, AC-5.3) ────────────────────────────────────────────────────
//
// One item at a time: `triageNext` hands over the next inbox item with a
// proposal, the command asks (or not — attention decides), `applyTriage`
// carries out the answer. The proposal is deterministic lib code — keyword
// rules and title overlap, no model — so it is testable and the same store
// always proposes the same thing. The command tells the agent to refine it;
// the lib never pretends to have judged.

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are', 'was', 'not', 'but', 'its',
  'has', 'have', 'when', 'what', 'why', 'how', 'should', 'does', 'can', 'all', 'any', 'one', 'our',
]);
const BUG_RE = /\b(bug|broken|breaks?|fails?|failing|failure|errors?|crash(?:es|ed)?|regression|wrong|incorrect|doesn['’]?t work)\b/i;
const QUESTION_START_RE = /^(should|how|what|why|which|when|where|do|does|can|is|are)\b/i;
const CHORE_RE = /\b(refactor|clean ?up|rename|typo|docs?|documentation|hygiene|chore|bump|upgrade|lint)\b/i;
const DUP_MIN = 0.5;
const THEME_MIN = 0.3;
const TITLE_MAX = 80;

function tokens(text) {
  return new Set(
    String(text ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  );
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let both = 0;
  for (const w of a) if (b.has(w)) both++;
  return both / (a.size + b.size - both);
}

function titleFromBody(body) {
  const line = String(body ?? '')
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').replace(/^[-*]\s+/, '').replace(/\*\*/g, '').trim())
    .find((l) => l !== '');
  if (!line) return undefined;
  if (line.length <= TITLE_MAX) return line;
  const cut = line.slice(0, TITLE_MAX - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > 20 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function guessType(item, title, body) {
  if (item.type && item.type !== 'NEW') return { type: item.type, why: `already ${item.type}` };
  const source = String(item.source ?? '');
  if (/bug/i.test(source)) return { type: 'BUG', why: `source ${source}` };
  if (/question/i.test(source)) return { type: 'Q', why: `source ${source}` };
  const text = `${title ?? ''}\n${String(body ?? '').slice(0, 500)}`;
  const bug = text.match(BUG_RE);
  if (bug) return { type: 'BUG', why: `the word "${bug[1]}"` };
  const t = String(title ?? '').trim();
  if (t.endsWith('?') || QUESTION_START_RE.test(t)) return { type: 'Q', why: 'the title is a question' };
  const chore = text.match(CHORE_RE);
  if (chore) return { type: 'CHORE', why: `the word "${chore[1]}"` };
  return { type: 'FEAT', why: 'no bug, question or chore wording — the default' };
}

/**
 * The lib's proposal for one item. Pure and deterministic: a starting point
 * for the agent to refine, never a decision.
 *
 * @param {object} item
 * @param {string} body
 * @param {Array<{item: object}>} others — the store's items (closed ones and the item itself are ignored)
 * @returns {{type: string, title?: string, theme?: string, priority?: string|number,
 *   duplicates: Array<{id: string, title?: string, score: number}>, why: {type: string, theme?: string}}}
 */
export function proposeTriage(item, body, others = []) {
  const title = item.title ?? titleFromBody(body);
  const { type, why } = guessType(item, title, body);
  const mine = tokens(title);
  const scored = others
    .filter((o) => o.item.id !== item.id && o.item.status !== 'C')
    .map((o) => ({ id: o.item.id, title: o.item.title, theme: o.item.theme, score: jaccard(mine, tokens(o.item.title)) }))
    .filter((o) => o.score >= THEME_MIN)
    .sort((a, b) => b.score - a.score || itemNumber(a.id) - itemNumber(b.id));
  const duplicates = scored
    .filter((o) => o.score >= DUP_MIN)
    .slice(0, 5)
    .map(({ id, title: t, score }) => ({ id, title: t, score: Math.round(score * 100) / 100 }));
  const proposal = { type, duplicates, why: { type: why } };
  if (title !== undefined) proposal.title = title;
  if (item.theme !== undefined) {
    proposal.theme = item.theme;
  } else {
    const near = scored.find((o) => typeof o.theme === 'string');
    if (near) {
      proposal.theme = near.theme;
      proposal.why.theme = `the theme of ${near.id}, the closest open title`;
    }
  }
  if (item.priority !== undefined) proposal.priority = item.priority;
  return proposal;
}

const createdAt = (item) => (typeof item.created?.at === 'string' ? item.created.at : '');

/**
 * The next inbox item to triage, with a proposal — or null when there is none.
 * Items carrying a `migration_note` come first (the migration flagged them),
 * then the oldest capture, then the lowest number.
 *
 * @param {string} baseDir
 * @param {{exclude?: string[]}} [opts] — IDs already skipped in this run
 * @returns {null | {item: object, body: string, path: string, label: string, proposal: object}}
 */
export function triageNext(baseDir, opts = {}) {
  const exclude = new Set(opts.exclude ?? []);
  const all = listItems(baseDir);
  const queue = all
    .filter((r) => r.item.status === 'N' && !exclude.has(r.item.id))
    .sort((a, b) =>
      Number(!a.item.migration_note) - Number(!b.item.migration_note)
      || createdAt(a.item).localeCompare(createdAt(b.item))
      || itemNumber(a.item.id) - itemNumber(b.item.id));
  if (queue.length === 0) return null;
  const found = getItem(baseDir, queue[0].item.id);
  return { item: found.item, body: found.body, path: found.path, label: found.label,
    proposal: proposeTriage(found.item, found.body, all) };
}

/**
 * Items already in `backlog/` that the migration flagged for a human look
 * (`migration_note`, D-M6E11-17). Triage surfaces them after the inbox;
 * accepting one clears the note.
 *
 * @param {string} baseDir
 * @returns {Array<{item: object, label: string, path: string}>}
 */
export function listNeedsReview(baseDir) {
  return listItems(baseDir, { status: 'T' }).filter((r) => r.item.migration_note);
}

const DECISIONS = ['accept', 'dup', 'reject', 'skip'];

function awaitingTriage(item) {
  return item.status === 'N' || (item.status === 'T' && Boolean(item.migration_note));
}

/**
 * Carry out one triage answer.
 *
 * @param {string} baseDir
 * @param {string} idOrLabel
 * @param {{accept: {type: string, priority?, theme?, title?}} | {dup: string} | {reject: string} | {skip: true}} decision
 *   `accept` → status T in `backlog/` (a flagged T item is updated in place
 *   and its note cleared); `dup` → closed `dup` of that item; `reject` →
 *   closed `rejected`, the text recorded as proof; `skip` → nothing.
 * @param {{by?: string, at?: string, execFn?: Function, renameFn?: Function}} [opts]
 *   `by` is required for `dup` and `reject` (a close records who).
 * @returns {Promise<{action: string, item: object, label?: string, from?: string, to?: string}>}
 */
export async function applyTriage(baseDir, idOrLabel, decision = {}, opts = {}) {
  const id = frontOf(idOrLabel);
  const actions = DECISIONS.filter((k) => decision[k] !== undefined);
  if (actions.length !== 1) {
    throw new WorkStoreError('SCHEMA', `${id}: a triage decision is exactly one of ${DECISIONS.join(', ')} `
      + `(got ${actions.length ? actions.join(' + ') : 'none'})`);
  }
  const [action] = actions;
  const found = getItem(baseDir, id);
  if (!awaitingTriage(found.item)) {
    throw new WorkStoreError('CONFLICT', `${id} is not awaiting triage (status ${found.item.status} at ${found.path}) — `
      + 'use `/sig:item move` or `close`.');
  }

  if (action === 'skip') return { action, item: found.item, label: found.label };
  if (action === 'dup') {
    const r = await closeItem(baseDir, id, { reason: 'dup', dup_of: decision.dup, by: opts.by, at: opts.at }, opts);
    return { action, ...r };
  }
  if (action === 'reject') {
    if (typeof decision.reject !== 'string' || decision.reject.trim() === '') {
      throw new WorkStoreError('SCHEMA', `${id}: a reject needs its reason — what was checked and found false.`);
    }
    const r = await closeItem(baseDir, id, { reason: 'rejected', proof: decision.reject, by: opts.by, at: opts.at }, opts);
    return { action, ...r };
  }

  const fields = decision.accept ?? {};
  return withWorkLock(baseDir, async () => {
    const current = getItem(baseDir, id);
    if (!awaitingTriage(current.item)) {
      throw new WorkStoreError('CONFLICT', `${id} is no longer awaiting triage (status ${current.item.status}).`);
    }
    const next = { ...current.item, status: 'T' };
    for (const k of ['type', 'priority', 'theme', 'title']) if (fields[k] !== undefined) next[k] = fields[k];
    delete next.migration_note;
    if (next.type === 'NEW') {
      throw new WorkStoreError('SCHEMA', `${id}: accept needs a type (BUG, FEAT, CHORE or Q) — triage is where it is decided.`);
    }
    assertValid(next, id);
    const r = await relocate(baseDir, current, next, current.body, `${WORK_DIR}/${FOLDERS.backlog}`, opts);
    await regenerate(baseDir, `${id} triaged and moved ${r.from} → ${r.to}`);
    return { action, item: next, label: renderLabel(next), ...r };
  });
}
