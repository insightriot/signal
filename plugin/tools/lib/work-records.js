// The v2 work-records library (M6.E13.S2) — one JSON record per item at a
// fixed path, status folded from its events.
//
//   .planning/work/
//     WORK.md                  frontmatter `key:` and `schema_version: 2`
//     items/NN/KEY-n.json      the record (NN = floor(n / 1000), two digits)
//     items/NN/KEY-n.md        its body, beside it (optional)
//
// Built BESIDE the v1 store (`work-store.js`, `work-ops.js`), not over it
// (PLAN, "How the branch stays green"). v1 modules are imported read-only and
// never changed here.
//
// On a v1 store (a `WORK.md` with no `schema_version`, or `1`) reads go through
// the migration's pure converter, `convertV1Item`, and writes refuse with a
// message naming `node tools/work-migrate-v2.mjs` (PLAN Decision 1, AC4.2).
//
// Read side: t2.1. ID allocation and the duplicate-ID check: t2.3. Writes:
// t2.2a (new, triage, queue, start) and t2.2b. The Epic close query: t2.5.
// Confirming fixed closes against the default branch: t2.6, and its read-only
// list of closing items, `listClosing`: t4.4; its read-only probe, `probeCloses`: t4.6.
// The store check: t2.7.
// Triage proposals read from records (v1 `work-ops.js`'s, ported): t7.3 prep.
// The views it regenerates after every write: `work-views.js` (t3.1).

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync, existsSync, lstatSync, mkdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { echoed, shownName } from './printable-text.js';
import { asWorkStoreError, WorkStoreError } from './work-errors.js';
import { ITEM_KIND, RECORD_SCHEMA, parseRecord, checkEvents, deriveStatus, epicOf } from './work-record.js';
import { bodyDirFor, convertV1Item } from './work-convert.js';
import { ITEM_ID_RE } from './work-item.js';
import { rewriteRelativeLinks } from './work-links.js';
import { proposeTriage } from './work-triage.js';
// A cycle, by design: work-views.js reads through listRecords. Neither module
// uses the other's bindings while it is being evaluated.
import { assertViewsWritable, regenerateToMemory, regenerateViews, viewsNotRegenerated } from './work-views.js';
import {
  isStoreOn,
  isGitRepo,
  walkFiles,
  STORE_OFF_MESSAGE,
  WORK_DIR,
  WORK_FILE,
} from './work-store.js';
import { EPIC_ID_STRICT_RE, parseFrontmatter } from './state.js';
// A cycle, by design, as with work-views.js: unit-records.js imports this
// module's store check. Neither uses the other's bindings while it is being
// evaluated. (The sync readers below — `listClosing`, `probeCloses` — need it
// without an `await`.)
import * as unitLib from './unit-records.js';
import { listUnits, unitRecordsOn, UNITS_REL } from './unit-records.js';
// The write helpers every record kind shares. `regenerateAfter` comes in under
// another name because this module keeps its own, which names the views.
import {
  ancestryFailure,
  commitsStartingWith,
  confine,
  defaultBranchRef,
  existsNoFollow,
  gitEnv,
  readRecordFile,
  recordWriter,
  regenerateAfter as regenerateWith,
  runGit,
  sensitivePending,
  shallowProbe,
  withEvent,
  withWorkLock,
  writePlanned,
} from './work-write.js';

const ITEMS_DIR = 'items';
const ITEMS_REL = `.planning/${WORK_DIR}/${ITEMS_DIR}`;
const WORK_FILE_REL = `.planning/${WORK_DIR}/${WORK_FILE}`;

// What a v2 write says on a v1 store (AC4.2).
export const V1_STORE_MESSAGE = `${WORK_FILE_REL} has no \`schema_version: 2\`: this is a v1 work store `
  + '(item files in status folders). The v2 library reads it, but does not write to it. Migrate it first: '
  + '`node tools/work-migrate-v2.mjs` (a dry run; `--apply` to write). If this project never had a store and '
  + `${WORK_FILE_REL} was made by hand, delete it and run \`/sig:docs-migrate --work-store\` instead.`;

const toPosix = (p) => p.split(sep).join('/');

function assertItemId(id) {
  if (typeof id !== 'string' || !ITEM_ID_RE.test(id)) {
    throw new WorkStoreError('SCHEMA', `${JSON.stringify(id)} is not an item ID (KEY-n)`);
  }
}

/**
 * Where an item's record lives, repo-root-relative:
 * `.planning/work/items/NN/KEY-n.json`, NN = floor(n / 1000) as two digits.
 * The ONE path resolver for records (AC1.1): a record never moves, so this is
 * a function of the ID alone. The key comes with the ID — never a literal SIG.
 *
 * @param {string} id — `KEY-n`
 * @returns {string}
 * @throws {WorkStoreError} SCHEMA when `id` is not an item ID
 */
export function recordPath(id) {
  assertItemId(id);
  return `.planning/${bodyDirFor(id)}/${id}.json`;
}

/**
 * Where an item's body lives: the `.md` beside its record.
 * @param {string} id
 * @returns {string}
 */
export function bodyPath(id) {
  assertItemId(id);
  return `.planning/${bodyDirFor(id)}/${id}.md`;
}

/**
 * Which store this project has: `null` (off — no `WORK.md`), `1` or `2`.
 * A `WORK.md` with no `schema_version` is v1 (every store written before
 * M6.E13). A broken `WORK.md` throws as `isStoreOn` does; a `schema_version`
 * other than the integers 1 or 2 throws too, so an unknown store is never read
 * as a known one.
 *
 * @param {string} baseDir
 * @returns {null|1|2}
 * @throws {WorkStoreError} CONFIG
 */
export function storeVersion(baseDir) {
  return readStore(baseDir).version;
}

// {version: null} | {version: 1|2, key}
function readStore(baseDir) {
  const store = isStoreOn(baseDir); // validates WORK.md and its key
  if (!store.on) return { version: null };
  // isStoreOn has already parsed this file successfully.
  const { data } = parseFrontmatter(readFileSync(join(baseDir, WORK_FILE_REL), 'utf-8'));
  const v = data.schema_version;
  if (v === undefined || v === 1) return { version: 1, key: store.key };
  if (v === 2) return { version: 2, key: store.key };
  throw new WorkStoreError(
    'CONFIG',
    `${WORK_FILE_REL}: schema_version ${JSON.stringify(v)} is not one this version of Signal knows (1 or 2).`,
  );
}

function requireOn(baseDir) {
  const store = readStore(baseDir);
  if (store.version === null) throw new WorkStoreError('CONFIG', STORE_OFF_MESSAGE);
  return store;
}

/**
 * Throws unless the store is v2 and may be written by this library.
 * On a v1 store the error is `CONFIG` with `version: 1` set on it, and its
 * message names `node tools/work-migrate-v2.mjs`.
 *
 * @param {string} baseDir
 * @returns {{key: string, version: 2}}
 * @throws {WorkStoreError} CONFIG
 */
export function assertWritable(baseDir) {
  const store = requireOn(baseDir);
  if (store.version !== 2) {
    const err = new WorkStoreError('CONFIG', V1_STORE_MESSAGE);
    err.version = store.version;
    throw err;
  }
  return { key: store.key, version: 2 };
}

// ── Reading a v2 store ──────────────────────────────────────────────────────
//
// Records and bodies are read only as REGULAR files inside the project (the
// M6.E12 rule, `path-confine.js` `readRegularFile`). At 10,000 records a
// per-file lstat + realpath is the cost, so the rule is applied once and by
// construction instead: `items/` must resolve inside the project, and the walk
// uses directory entries, where a symlink is neither a file nor a directory —
// so a link is reported as broken and never followed, and a linked bucket is
// never entered.

function confinedItemsDir(baseDir) {
  const abs = join(baseDir, ITEMS_REL);
  if (!existsSync(abs)) return null;
  let realRoot;
  let realItems;
  try {
    realRoot = realpathSync(resolve(baseDir));
    realItems = realpathSync(abs);
  } catch (err) {
    throw new WorkStoreError('IO', `${ITEMS_REL}: could not be resolved (${err.code ?? err.message})`);
  }
  if (!realItems.startsWith(realRoot + sep)) {
    throw new WorkStoreError(
      'CONFLICT',
      `${ITEMS_REL} resolves outside the project (${realItems}) — a linked folder; records are not read through it.`,
    );
  }
  return abs;
}

const LINK_REFUSED = 'is a symbolic link — refused; records and bodies are read only as regular files';

function entriesOf(abs) {
  try {
    return readdirSync(abs, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return [];
    throw new WorkStoreError('IO', `${toPosix(abs)}: could not be read (${err.code ?? err.message})`);
  }
}

// Every file under items/: {records: [{id, rel, abs}], bodies: Map id -> {rel, abs}, broken[]}.
// Each broken entry carries a `code` (`link`, `path`, `not-regular`) for
// `checkRecords`. `strict` (checkRecords only) also reports what the read
// side passes over: a record- or body-named entry that is neither a regular
// file nor a link (a folder, a FIFO), and a record file sitting in `items/`
// itself rather than in a bucket.
function walkItems(baseDir, opts = {}) {
  const out = { records: [], bodies: new Map(), broken: [] };
  const itemsAbs = confinedItemsDir(baseDir);
  if (itemsAbs === null) return out;

  const idFromName = (name, ext) => {
    if (!name.endsWith(ext)) return null;
    const id = name.slice(0, -ext.length);
    return ITEM_ID_RE.test(id) ? id : null;
  };

  for (const b of entriesOf(itemsAbs)) {
    const bucketRel = `${ITEMS_REL}/${b.name}`;
    if (b.isSymbolicLink()) {
      out.broken.push({ id: null, path: bucketRel, code: 'link', error: `${shownName(bucketRel)} ${LINK_REFUSED}` });
      continue;
    }
    if (!b.isDirectory()) {
      const id = idFromName(b.name, '.json');
      if (opts.strict && id !== null) {
        out.broken.push({ id, path: bucketRel, code: 'path', error: `${bucketRel}: ${id} belongs in ${recordPath(id).slice(0, recordPath(id).lastIndexOf('/'))}, not in ${ITEMS_REL} itself` });
      }
      continue;
    }
    for (const f of entriesOf(join(itemsAbs, b.name))) {
      const rel = `${bucketRel}/${f.name}`;
      const isJson = f.name.endsWith('.json');
      const id = idFromName(f.name, '.json') ?? idFromName(f.name, '.md');
      if (f.isSymbolicLink()) {
        if (isJson || id !== null) out.broken.push({ id, path: rel, code: 'link', error: `${shownName(rel)} ${LINK_REFUSED}` });
        continue;
      }
      if (!f.isFile()) {
        if (opts.strict && (isJson || id !== null)) {
          out.broken.push({ id, path: rel, code: 'not-regular', error: `${shownName(rel)} is not a regular file — a record or body is a plain file` });
        }
        continue;
      }
      if (isJson) {
        if (id === null) {
          out.broken.push({ id: null, path: rel, code: 'path', error: `${shownName(rel)}: file name is not a record name (KEY-n.json)` });
        } else {
          out.records.push({ id, rel, abs: join(itemsAbs, b.name, f.name) });
        }
      } else if (id !== null && f.name.endsWith('.md')) {
        out.bodies.set(id, { rel, abs: join(itemsAbs, b.name, f.name) });
      }
    }
  }
  return out;
}

const numberOf = (id) => Number(id.slice(id.lastIndexOf('-') + 1));
const keyOf = (id) => id.slice(0, id.lastIndexOf('-'));

// One record file → an entry, or {broken}. Never throws for content. A
// broken entry's `code` says what kind (`path`, `unreadable`, `invalid`,
// `events`), for `checkRecords`.
//
// `epicOnly` (M6.E16 v2.1, AC6.4): the project has no unit records — there is
// no `work/units/` folder — so an event may name an Epic ID only, as the schema
// itself said on `v0.1.50`; a record naming any other unit is `invalid`, as it
// was then. The callers take it from `unitRecordsOn`, which throws on a folder
// that is there and cannot be trusted (REVIEW pass 1, C-I4): that fault is the
// folder's, and no record is read, or blamed, under it.
function readOne(file, key, body, epicOnly) {
  const fail = (error, code) => ({ broken: { id: file.id, path: file.rel, code, error } });
  if (keyOf(file.id) !== key) return fail(`${file.rel}: key ${keyOf(file.id)} is not this store's key (${key})`, 'path');
  const expected = recordPath(file.id);
  if (file.rel !== expected) return fail(`${file.rel}: ${file.id} belongs in ${expected.slice(0, expected.lastIndexOf('/'))}`, 'path');

  let read;
  try {
    read = readRecordFile(file.abs);
  } catch (err) {
    return fail(`${file.rel}: could not be read (${err.code ?? err.message})`, 'unreadable');
  }
  if (read.tooLarge) return fail(`${file.rel} ${read.tooLarge}`, 'unreadable');
  const { record, errors } = parseRecord(read.text, { path: file.rel });
  if (errors.length > 0) return fail(errors.join('; '), 'invalid');
  if (epicOnly) {
    const notEpic = record.events
      .map((e, i) => (typeof e.epic === 'string' && !EPIC_ID_RE.test(e.epic)
        ? `${file.rel}: events[${i}].epic does not match ${EPIC_ID_RE.source} (got ${echoed(e.epic)})` : null))
      .filter((e) => e !== null);
    if (notEpic.length > 0) {
      return fail(`${notEpic.join('; ')} — not an Epic ID, and this project has no unit records `
        + `(there is no ${UNITS_REL}/ folder), so an item can name an Epic only`, 'invalid');
    }
  }
  if (record.id !== file.id) return fail(`${file.rel}: file name says ${file.id} but the record id is ${record.id}`, 'path');
  const eventErrors = checkEvents(record);
  if (eventErrors.length > 0) return fail(`${file.rel}: ${eventErrors.map((e) => e.message).join('; ')}`, 'events');

  const entry = { id: file.id, path: file.rel, record, status: deriveStatus(record), epic: epicOf(record) };
  if (body === undefined) return { entry };
  if (body === null) return { entry: { ...entry, body: null } };
  if (body.broken) return { broken: { id: file.id, path: body.broken.path, error: body.broken.error } };
  try {
    return { entry: { ...entry, body: readFileSync(body.abs, 'utf-8') } };
  } catch (err) {
    return fail(`${body.rel}: could not be read (${err.code ?? err.message})`, 'unreadable');
  }
}

function listV2(baseDir, key, opts) {
  // Asked before any record is read: a `units/` folder that cannot be trusted
  // refuses the listing, and no item record is blamed for it.
  const epicOnly = !unitRecordsOn(baseDir);
  const walked = walkItems(baseDir, { strict: opts.strict });
  const broken = [...walked.broken];
  const brokenBody = new Map(broken.filter((b) => b.id && b.path.endsWith('.md')).map((b) => [b.id, b]));
  const records = [];
  for (const file of walked.records) {
    let body;
    if (opts.bodies) {
      if (brokenBody.has(file.id)) body = { broken: brokenBody.get(file.id) };
      else body = walked.bodies.get(file.id) ?? null;
    }
    const r = readOne(file, key, body, epicOnly);
    if (r.entry) records.push(r.entry);
    // A refused body is already in `broken` from the walk.
    else if (!(body?.broken && r.broken.path === body.broken.path)) broken.push(r.broken);
  }
  return { records, broken };
}

// ── Reading a v1 store, through the converter (Decision 1) ──────────────────

// Where v1 items live, relative to `.planning/` (`work-store.js` placement).
const V1_DIRS = ['work/inbox', 'work/backlog', 'work/epics', 'work/done', 'archive/epics'];
const NO_DATE_RE = /no created date known/;

function v1Files(baseDir, key) {
  const planning = join(baseDir, '.planning');
  const out = [];
  const walk = (abs) => {
    for (const e of entriesOf(abs)) {
      const p = join(abs, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith('.md')) {
        const id = e.name.slice(0, -'.md'.length);
        if (ITEM_ID_RE.test(id) && keyOf(id) === key) out.push({ id, abs: p, relPath: toPosix(relative(planning, p)) });
      }
    }
  };
  for (const d of V1_DIRS) walk(join(planning, d));
  return out;
}

/**
 * The date (YYYY-MM-DD) of the first commit that added each `KEY-n.md` under
 * `.planning/`, keyed by file name: ONE `git log` for the whole store, the
 * approach of `tools/work-convert-dryrun.mjs` `firstAddedDates` (t1.5), so a
 * v1 read gives the same `created` date the t1.5 run validated. Empty outside
 * a git repo, or when git fails — the item is then reported as broken.
 */
function firstAddedDates(baseDir, key, execFn) {
  const dates = new Map();
  if (!isGitRepo(baseDir, execFn)) return dates;
  let out;
  try {
    out = String(execFn(
      'git',
      ['log', '--all', '--no-renames', '--diff-filter=A', '--date=short', '--format=%x00%ad', '--name-only', '--',
        `:(glob).planning/**/${key}-*.md`],
      { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024, env: gitEnv(baseDir) },
    ));
  } catch {
    return dates;
  }
  for (const chunk of out.split('\0').slice(1)) {
    const [date, ...files] = chunk.split('\n').filter(Boolean);
    for (const file of files) {
      const name = file.split('/').at(-1);
      const prev = dates.get(name);
      if (prev === undefined || date < prev) dates.set(name, date);
    }
  }
  return dates;
}

function convertFile(file, fallbackAt) {
  let text;
  try {
    text = readFileSync(file.abs, 'utf-8');
  } catch (err) {
    return { error: `.planning/${file.relPath}: could not be read (${err.code ?? err.message})` };
  }
  return convertV1Item({ relPath: file.relPath, text, ...(fallbackAt ? { fallbackAt } : {}) });
}

function readV1(files, opts) {
  const execFn = opts.execFn ?? execFileSync;
  const records = [];
  const broken = [];
  let dates = null; // read lazily: only when an item has no created date
  for (const file of files) {
    const path = `.planning/${file.relPath}`;
    let r = convertFile(file);
    if (r.error) {
      broken.push({ id: file.id, path, error: r.error });
      continue;
    }
    if (!r.record && r.manifest.errors.some((e) => NO_DATE_RE.test(e))) {
      dates ??= firstAddedDates(opts.baseDir, opts.key, execFn);
      const at = dates.get(`${file.id}.md`);
      if (at) r = convertFile(file, at);
    }
    if (!r.record) {
      broken.push({ id: file.id, path, error: r.manifest.errors.join('; ') });
      continue;
    }
    const entry = { id: file.id, path, record: r.record, status: deriveStatus(r.record), epic: epicOf(r.record) };
    if (opts.bodies) entry.body = r.body;
    records.push(entry);
  }
  return { records, broken };
}

const byNumber = (a, b) => numberOf(a.id) - numberOf(b.id) || (a.path < b.path ? -1 : 1);

/**
 * Every record in the store, each with its folded status and Epic.
 *
 * One broken record never stops the others (NFR integrity): it is reported in
 * `broken` by ID and path, with the reason. A record is broken when its JSON
 * does not parse or validate, its file name, ID, key or bucket disagree
 * (AC1.1), its event history does not fold (`checkEvents`), or it — or its
 * body, when bodies are read — is a symbolic link. On a project with no unit
 * records, a record whose event names a unit that is not an Epic ID is broken
 * too (`invalid`), as on `v0.1.50` (M6.E16 v2.1, AC6.4).
 *
 * On a v1 store every item file is read through `convertV1Item` (Decision 1),
 * and `path` is the v1 file. An item with no created date of its own takes the
 * date of the commit that first added its file (one `git log` for the store,
 * run only when needed); outside a repo it is broken, never given a date.
 *
 * @param {string} baseDir
 * @param {{bodies?: boolean, execFn?: Function}} [opts]
 *   `bodies`: also read each body (`body` is `null` when a v2 record has none)
 * @returns {{version: 1|2, records: Array<{id, path, record, status, epic, body?}>,
 *   broken: Array<{id: string|null, path: string, error: string}>}} sorted by number
 * @throws {WorkStoreError} CONFIG when the store is off or WORK.md is broken
 */
export function listRecords(baseDir, opts = {}) {
  const store = requireOn(baseDir);
  const { records, broken } = store.version === 2
    ? listV2(baseDir, store.key, opts)
    : readV1(v1Files(baseDir, store.key), { ...opts, baseDir, key: store.key });
  records.sort(byNumber);
  broken.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { version: store.version, records, broken };
}

/**
 * One record, with its body.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{execFn?: Function}} [opts]
 * @returns {{id, path, record, status, epic, body}}
 * @throws {WorkStoreError} CONFIG (store off), NOT_FOUND, SCHEMA (not an ID, or the record is broken)
 */
export function getRecord(baseDir, id, opts = {}) {
  const store = requireOn(baseDir);
  assertItemId(id);
  let found;
  if (store.version === 2) {
    found = readV2One(baseDir, store.key, id);
  } else {
    const files = v1Files(baseDir, store.key).filter((f) => f.id === id);
    if (files.length > 1) {
      throw new WorkStoreError('CONFLICT', `${id} is used by ${files.length} files: ${files.map((f) => f.relPath).join(', ')}`);
    }
    found = files.length === 0 ? null : readV1(files, { ...opts, bodies: true, baseDir, key: store.key });
  }
  if (found === null || (found.records.length === 0 && found.broken.length === 0)) {
    throw new WorkStoreError('NOT_FOUND', `${id}: no such item`);
  }
  if (found.broken.length > 0) throw new WorkStoreError('SCHEMA', found.broken.map((b) => b.error).join('; '));
  return found.records[0];
}

/**
 * The record that kept `oldId` as its `legacy_id` — how `/sig:item show` and
 * `list` take an old ID such as `#99` (M6.E15 FR5.3, `D-M6E15-12`). Whitespace
 * is normalised on both sides; anything else must match exactly. Reads the
 * records only (no bodies), never a list.
 *
 * @param {string} baseDir
 * @param {string} oldId
 * @returns {{id, path, record, status, epic}} the `listRecords` entry
 * @throws {WorkStoreError} CONFIG (store off), SCHEMA (blank), NOT_FOUND (no
 *   record holds it), CONFLICT (more than one does — the message names each)
 */
export function findByLegacyId(baseDir, oldId) {
  const norm = (s) => String(s).trim().replace(/\s+/g, ' ');
  const want = typeof oldId === 'string' ? norm(oldId) : '';
  if (want === '') throw new WorkStoreError('SCHEMA', `${JSON.stringify(oldId ?? null)} is not an old ID`);
  const { records, broken } = listRecords(baseDir);
  const hits = records.filter((r) => typeof r.record.legacy_id === 'string' && norm(r.record.legacy_id) === want);
  if (hits.length > 1) {
    throw new WorkStoreError('CONFLICT', `old ID ${want} is held by ${hits.length} items: ${hits.map((r) => r.id).join(', ')} — use one of those IDs`);
  }
  if (hits.length === 0) {
    const unread = broken.length > 0
      ? ` (${broken.length} record${broken.length === 1 ? '' : 's'} could not be read, so ${broken.length === 1 ? 'its' : 'their'} old IDs are unknown: ${broken.map((b) => b.id ?? shownName(b.path)).join(', ')})`
      : '';
    throw new WorkStoreError('NOT_FOUND', `no item has the old ID ${want}${unread}`);
  }
  return hits[0];
}

// A v2 read of one ID: its fixed path only (AC1.1), never a search.
function readV2One(baseDir, key, id) {
  if (confinedItemsDir(baseDir) === null) return null;
  const rel = recordPath(id);
  const bucketRel = rel.slice(0, rel.lastIndexOf('/'));
  const bucket = entriesOf(join(baseDir, ITEMS_REL)).find((e) => `${ITEMS_REL}/${e.name}` === bucketRel);
  if (!bucket) return null;
  if (bucket.isSymbolicLink()) return { records: [], broken: [{ id, path: bucketRel, error: `${bucketRel} ${LINK_REFUSED}` }] };
  const entries = entriesOf(join(baseDir, bucketRel));
  const rec = entries.find((e) => e.name === `${id}.json`);
  if (!rec) return null;
  if (!rec.isFile()) return { records: [], broken: [{ id, path: rel, error: `${rel} ${rec.isSymbolicLink() ? LINK_REFUSED : 'is not a regular file'}` }] };
  const bodyRel = bodyPath(id);
  const b = entries.find((e) => e.name === `${id}.md`);
  let body = null;
  if (b?.isSymbolicLink()) body = { broken: { path: bodyRel, error: `${bodyRel} ${LINK_REFUSED}` } };
  else if (b?.isFile()) body = { rel: bodyRel, abs: join(baseDir, bodyRel) };
  const r = readOne({ id, rel, abs: join(baseDir, rel) }, key, body, !unitRecordsOn(baseDir));
  return r.entry ? { records: [r.entry], broken: [] } : { records: [], broken: [r.broken] };
}

// ── ID allocation (t2.3, AC2.3) ─────────────────────────────────────────────
//
// v1 `nextId` (`work-store.js`) is the exemplar and its rules hold unchanged:
// one past the highest number this machine has ever seen for the key, in the
// working tree (uncommitted files count) and in git history across every ref;
// a shallow clone falls back to each ref's tree (`basis: 'ls-tree'`); outside
// a repo only the working tree is read (`basis: 'worktree-only'`); a git
// failure inside a repo throws rather than hand out a number another branch
// holds. No network.
//
// What changes for v2: a name may be `KEY-n.json` (a record) as well as
// `KEY-n.md` (a v1 item, or a body), and the working-tree read covers the
// whole of `.planning/archive/` — which includes `archive/pre-work-store-v2/`,
// where the cutover relocates the v1 item files.

const ID_GIT_PATHS = ['.planning/work/', '.planning/archive/'];
const ID_TREE_DIRS = [join('.planning', WORK_DIR), join('.planning', 'archive')];

// Where the cutover relocates the v1 item files (PLAN t7.3), repo-root-relative.
export const RELOCATED_V1_REL = '.planning/archive/pre-work-store-v2';

/**
 * Split a file name carrying an item ID into its key and number:
 * `KEY-n.json` or `KEY-n.md`, otherwise null.
 * @param {string} name
 * @returns {{id: string, key: string, n: number, ext: '.json'|'.md'}|null}
 */
export function parseIdFileName(name) {
  const ext = name.endsWith('.json') ? '.json' : name.endsWith('.md') ? '.md' : null;
  if (ext === null) return null;
  const id = name.slice(0, -ext.length);
  if (!ITEM_ID_RE.test(id)) return null;
  return { id, key: keyOf(id), n: numberOf(id), ext };
}

function maxFromNames(names, key) {
  let max = 0;
  for (const name of names) {
    const parsed = parseIdFileName(basename(name.trim()));
    if (parsed && parsed.key === key) max = Math.max(max, parsed.n);
  }
  return max;
}

/**
 * Allocate the next item ID on a v1 or v2 store. Reads only; writing the
 * record is the caller's job, under the `work` lock.
 *
 * @param {string} baseDir
 * @param {{execFn?: Function}} [opts]
 * @returns {{id: string, basis: 'git-log'|'ls-tree'|'worktree-only'}}
 * @throws {WorkStoreError} CONFIG when the store is off or misconfigured; IO when git fails inside a repo
 */
export function nextIdV2(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const { key } = requireOn(baseDir);
  let max = 0;
  for (const rel of ID_TREE_DIRS) max = Math.max(max, maxFromNames(walkFiles(join(baseDir, rel)), key));

  if (!isGitRepo(baseDir, execFn)) return { id: `${key}-${max + 1}`, basis: 'worktree-only' };

  try {
    let hasHead = true;
    try {
      runGit(baseDir, ['rev-parse', '--verify', '--quiet', 'HEAD'], execFn);
    } catch {
      hasHead = false;
    }
    const shallow = runGit(baseDir, ['rev-parse', '--is-shallow-repository'], execFn).trim() === 'true';

    if (!shallow) {
      const out = runGit(
        baseDir,
        ['log', '--all', ...(hasHead ? ['HEAD'] : []), '--format=', '--name-only', '--', ...ID_GIT_PATHS],
        execFn,
      );
      max = Math.max(max, maxFromNames(out.split('\n').filter(Boolean), key));
      return { id: `${key}-${max + 1}`, basis: 'git-log' };
    }

    const refs = runGit(baseDir, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'], execFn)
      .split('\n')
      .filter(Boolean);
    if (hasHead) refs.push('HEAD');
    for (const ref of refs) {
      const out = runGit(baseDir, ['ls-tree', '-r', '--name-only', ref, '--', ...ID_GIT_PATHS], execFn);
      max = Math.max(max, maxFromNames(out.split('\n').filter(Boolean), key));
    }
    return { id: `${key}-${max + 1}`, basis: 'ls-tree' };
  } catch (err) {
    throw new WorkStoreError('IO', `nextIdV2: could not read git history in ${baseDir}: ${err.message}`);
  }
}

/**
 * Every ID carried by more than one item file in the working tree (AC2.3).
 *
 * An item is carried by its record (`items/NN/KEY-n.json`) or, outside
 * `items/`, by a v1 item file (`KEY-n.md` under `.planning/work/` or
 * `.planning/archive/`). A body (`items/NN/KEY-n.md`) is part of its record,
 * not a second carrier. `archive/pre-work-store-v2/` is skipped: after the
 * cutover every migrated item is there AND in `items/`, by design.
 *
 * @param {string} baseDir
 * @returns {Array<{id: string, paths: string[]}>} sorted by number; paths sorted
 * @throws {WorkStoreError} CONFIG when the store is off or misconfigured
 */
export function findDuplicateIds(baseDir) {
  const { key } = requireOn(baseDir);
  const byId = new Map();
  for (const rel of ID_TREE_DIRS) {
    for (const abs of walkFiles(join(baseDir, rel))) {
      const path = toPosix(relative(baseDir, abs));
      if (path.startsWith(`${RELOCATED_V1_REL}/`)) continue;
      const parsed = parseIdFileName(basename(abs));
      if (!parsed || parsed.key !== key) continue;
      const inItems = path.startsWith(`${ITEMS_REL}/`);
      if (inItems !== (parsed.ext === '.json')) continue; // a body, or a stray .json outside items/
      if (!byId.has(parsed.id)) byId.set(parsed.id, []);
      byId.get(parsed.id).push(path);
    }
  }
  return [...byId]
    .filter(([, paths]) => paths.length > 1)
    .map(([id, paths]) => ({ id, paths: paths.sort() }))
    .sort((a, b) => numberOf(a.id) - numberOf(b.id));
}

// ── Writing a v2 store (t2.2, AC2.1, AC2.4) ─────────────────────────────────
//
// Every mutation is a public entry point that takes the `work` lock itself,
// through `withWorkLockV2`, and hands the lock's handle to internal functions;
// no internal function takes the lock and no lock-taking export calls another
// (Decision 9, `tests/work-records-inventory.test.js`). The lock file is v1's
// (`.planning/work/.lock`), so a v1 writer and a v2 writer exclude each other.
//
// Order inside each mutation, as in v1 `work-ops.js`: the store check (so a
// store-off or v1 project never grows a lock file), the sensitive-data gate,
// the lock; then build the changed record, validate it (`serializeRecord`) and
// check its history (`checkEvents`) BEFORE any write; one atomic write per
// record, exactly one event appended per changed record; then `regenerate`.
//
// `regenerate` is injected (`opts.regenerate`, called with `baseDir`). Its
// default is `work-views.js`'s `regenerateViews` (S3), which never takes the
// lock. As in v1, a failed regeneration does not undo the change: the change
// is correct, and the error says the views were not rebuilt.

const WORK_LOCK_LABEL = 'work store';

// The shared lock (`work-write.js`), over this store's check and its views.
// The views are named here, at call time: `work-write.js` imports neither this
// module nor `work-views.js`.
async function withWorkLockV2(baseDir, label, opts, fn) {
  return withWorkLock(baseDir, label, { assertWritable, beforeWrite: () => viewsWritableOrRefuse(baseDir, opts) }, fn);
}

// Before any record is written (SIG-280 (6), M6.E14): if the views would
// refuse to regenerate, refuse the write, so a record never lands that the
// views do not show. `_skipViewsCheck` is a seam for tests and
// `tools/measure-views-preflight.mjs`, never for a real caller (M6.E14 REVIEW):
// injecting `regenerate` no longer turns the check off.
function viewsWritableOrRefuse(baseDir, opts = {}) {
  if (opts._skipViewsCheck === true) return;
  assertViewsWritable(baseDir);
}

async function regenerateAfter(handle, done, opts) {
  return regenerateWith(handle, done, opts.regenerate ?? regenerateViews, viewsNotRegenerated);
}

const nowIso = () => new Date().toISOString();

function pruneUndefined(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

function entryOf(record) {
  return { id: record.id, path: recordPath(record.id), record, status: deriveStatus(record), epic: epicOf(record) };
}

// The shared write helpers (`work-write.js`), bound to the item kind.
const { recordText, readForWrite, writeRecord, writeRecords } = recordWriter({
  kind: ITEM_KIND,
  pathOf: recordPath,
  entryOf,
  assertId: assertItemId,
  readOne: readV2One,
  noun: 'item',
});

// One new item, built and checked, nothing written.
function planNew(handle, id, spec) {
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) {
    throw new WorkStoreError('SCHEMA', `new item ${id}: pass an object of fields — nothing was written.`);
  }
  const { type = 'NEW', title, body, source, source_ref, theme, priority, by, at = nowIso(), linksFrom = '', triage } = spec;
  const events = [{ type: 'created', at, by }];
  const record = { id, type, title, theme, priority, source, source_ref };
  if (triage !== undefined) {
    if (triage === null || typeof triage !== 'object') {
      throw new WorkStoreError('SCHEMA', `new item ${id}: triage must be an object of fields — nothing was written.`);
    }
    for (const k of ['type', 'priority', 'theme', 'title']) if (triage[k] !== undefined) record[k] = triage[k];
    if (record.type === 'NEW') {
      throw new WorkStoreError('SCHEMA', `new item ${id}: triage needs a type (BUG, FEAT, CHORE or Q) — nothing was written.`);
    }
    events.push({ type: 'triaged', at, by });
  }
  record.events = events;
  pruneUndefined(record);
  const text = recordText(record);
  const rel = recordPath(id);
  const abs = join(handle.baseDir, rel);
  confine(handle.baseDir, abs);
  if (existsNoFollow(abs)) throw new WorkStoreError('CONFLICT', `${rel} already exists — nothing was written.`);
  const out = { record, rel, abs, text };
  if (typeof body === 'string' && body !== '') {
    out.bodyAbs = join(handle.baseDir, bodyPath(id));
    if (existsNoFollow(out.bodyAbs)) throw new WorkStoreError('CONFLICT', `${bodyPath(id)} already exists — nothing was written.`);
    out.bodyText = rewriteRelativeLinks(body, linksFrom, bodyDirFor(id));
  }
  return out;
}

// Write planned new items, all or nothing: on a failure every file this call
// wrote is removed, and every folder it created, while empty.
async function writeNew(handle, planned, opts) {
  const written = [];
  const createdDirs = [];
  try {
    for (const p of planned) {
      const made = mkdirSync(dirname(p.abs), { recursive: true });
      if (made) createdDirs.push(made);
      if (p.bodyText !== undefined) {
        await atomicWrite(p.bodyAbs, p.bodyText, { renameFn: opts.renameFn });
        written.push(p.bodyAbs);
      }
      await atomicWrite(p.abs, p.text, { renameFn: opts.renameFn });
      written.push(p.abs);
    }
  } catch (err) {
    const left = [];
    for (const abs of [...written].reverse()) {
      try {
        unlinkSync(abs);
      } catch {
        left.push(toPosix(relative(handle.baseDir, abs)));
      }
    }
    for (const dir of createdDirs.reverse()) removeCreatedTree(dir);
    const wrapped = asWorkStoreError(err, 'IO', left.length
      ? `capture failed and these files could not be removed (${left.join(', ')}): `
      : '');
    wrapped.written = left;
    throw wrapped;
  }
}

// Remove a folder `mkdirSync` created in this call, and the folders inside it
// (all created in this call too: the lock is held), while empty.
function removeCreatedTree(top) {
  for (const e of entriesOf(top)) {
    if (e.isDirectory()) removeCreatedTree(join(top, e.name));
  }
  try {
    rmdirSync(top);
  } catch {
    // not empty, or already gone: leave it
  }
}

/**
 * Capture one new item (status N), optionally triaged in the same locked
 * write. `newItems` with one spec; see there.
 *
 * @param {string} baseDir
 * @param {object} fields — as one of `newItems`'s specs
 * @param {object} [opts] — as `newItems`'s
 * @returns {Promise<object>} the entry `{id, path, record, status, epic}`, or
 *   `{aborted: 'sensitive-data-pending', sensitiveHits}` when nothing was written
 */
export async function newItem(baseDir, fields = {}, opts = {}) {
  const r = await newItems(baseDir, [fields], opts);
  return Array.isArray(r) ? r[0] : r;
}

/**
 * Capture new items: ONE `work` lock, sequential IDs from one `nextIdV2`, every
 * record built, validated and checked before any is written, all or nothing
 * (a failure part-way removes what this call wrote; `err.written` lists any
 * file that could not be removed), then ONE `regenerate`.
 *
 * Each record is written with one `created` event — or, with `triage`, with
 * `created` and `triaged` in the same write (the single lock `promoteInStore`
 * lacked, B6). `triage` fields replace the capture's; the resulting type may
 * not be NEW.
 *
 * Sensitive data (v1 `newItems`' gate, plus `source` — REVIEW loop 1): title,
 * body, source, source_ref and theme — and a triage's title and theme — run
 * through `scrubSensitive`; with a hit and no `opts.acknowledgeSensitive`,
 * nothing is written and the result is
 * `{aborted: 'sensitive-data-pending', sensitiveHits}`. Detection only.
 *
 * @param {string} baseDir
 * @param {Array<{type?: string, title: string, body?: string, source?: string, source_ref?: string,
 *   theme?: string, priority?: string|number, by: string, at?: string, linksFrom?: string,
 *   triage?: {type: string, priority?: string|number, theme?: string, title?: string}}>} specs
 *   `body` is written beside the record, its relative links rewritten from
 *   `linksFrom` (relative to `.planning/`, default `''`) to the record's folder.
 *
 * `opts.dedupeBy: 'source_ref'` (SIG-277, M6.E14): a spec whose `source_ref`
 * an existing record already carries is not written; its entry is that
 * record's, with `deduped: true`. Checked under the same lock that allocates
 * IDs and writes, so two callers racing on one key make one record.
 *
 * @param {{execFn?: Function, renameFn?: Function, acknowledgeSensitive?: boolean,
 *   regenerate?: (baseDir: string) => Promise<void>, dedupeBy?: 'source_ref'}} [opts]
 * @returns {Promise<object[]|{aborted: 'sensitive-data-pending', sensitiveHits: object[]}>} entries in spec order
 * @throws {WorkStoreError} CONFIG (store off, or v1), SCHEMA, CONFLICT, LOCKED, IO
 */
export async function newItems(baseDir, specs, opts = {}) {
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new WorkStoreError('SCHEMA', 'newItems: pass at least one item — nothing was written.');
  }
  assertWritable(baseDir);
  const pending = sensitivePending(
    specs.flatMap((s) => [s?.title, s?.body, s?.source, s?.source_ref, s?.theme, s?.triage?.title, s?.triage?.theme]),
    opts,
  );
  if (pending) return pending;
  if (opts.dedupeBy !== undefined && opts.dedupeBy !== 'source_ref') {
    throw new WorkStoreError('SCHEMA', `newItems: dedupeBy must be 'source_ref', got ${JSON.stringify(opts.dedupeBy)} — nothing was written.`);
  }
  return withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
    const existing = new Map();
    if (opts.dedupeBy === 'source_ref') {
      for (const e of listRecords(handle.baseDir).records) {
        if (typeof e.record.source_ref === 'string' && !existing.has(e.record.source_ref)) existing.set(e.record.source_ref, e);
      }
    }
    // Within one call too: a second spec carrying a key an earlier one carries
    // returns that one's record (M6.E14 REVIEW).
    const seen = new Set();
    const fresh = specs.filter((spec) => {
      const key = opts.dedupeBy === 'source_ref' ? spec?.source_ref : undefined;
      if (typeof key !== 'string') return true;
      if (existing.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const planned = [];
    if (fresh.length > 0) {
      const { id: first } = nextIdV2(baseDir, { execFn: opts.execFn });
      const start = numberOf(first);
      planned.push(...fresh.map((spec, i) => planNew(handle, `${handle.key}-${start + i}`, spec)));
      await writeNew(handle, planned, opts);
      const ids = planned.map((p) => p.record.id);
      await regenerateAfter(handle, `${ids.join(', ')} ${ids.length === 1 ? 'was' : 'were'} written`, opts);
    }
    const made = planned.map((p) => entryOf(p.record));
    const byKey = new Map();
    return specs.map((spec) => {
      const key = opts.dedupeBy === 'source_ref' ? spec?.source_ref : undefined;
      if (typeof key === 'string' && existing.has(key)) return { ...existing.get(key), deduped: true };
      if (typeof key === 'string' && byKey.has(key)) return { ...byKey.get(key), deduped: true };
      const entry = made.shift();
      if (typeof key === 'string') byKey.set(key, entry);
      return entry;
    });
  });
}

/**
 * Triage an item: a `triaged` event (legal from N, Q, P — the transition
 * table), with `type`, `priority`, `theme` and `title` set when given. The
 * Epic is cleared. The resulting type may not be NEW.
 *
 * The fields this triage changes are recorded on the event as
 * `changes: {field: {from, to}}` (`from` is the previous value, or null), the
 * `edited` shape, so a re-triage after an edit keeps the record and its
 * history agreeing (`checkEvents`). A field given its current value is not a
 * change; with none, the event carries no `changes`.
 *
 * Sensitive data: `title` and `theme` (v1 `applyTriage`'s gate).
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{type?: string, priority?: string|number, theme?: string, title?: string, by: string, at?: string}} triage
 * @param {object} [opts] — as `newItems`'s
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function triageItem(baseDir, id, triage = {}, opts = {}) {
  assertWritable(baseDir);
  const pending = sensitivePending([triage.title, triage.theme], opts);
  if (pending) return pending;
  return withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
    const current = readForWrite(handle, id).entry;
    const fields = {};
    for (const k of ['type', 'priority', 'theme', 'title']) if (triage[k] !== undefined) fields[k] = triage[k];
    if ((fields.type ?? current.record.type) === 'NEW') {
      throw new WorkStoreError('SCHEMA', `${id}: triage needs a type (BUG, FEAT, CHORE or Q) — nothing was written.`);
    }
    const changes = {};
    for (const [field, to] of Object.entries(fields)) {
      const from = Object.hasOwn(current.record, field) ? current.record[field] : null;
      if (from !== to) changes[field] = { from, to };
    }
    const event = { type: 'triaged', at: triage.at ?? nowIso(), by: triage.by };
    if (Object.keys(changes).length > 0) event.changes = changes;
    const next = withEvent(current, event, fields);
    const out = await writeRecord(handle, next, opts);
    await regenerateAfter(handle, `${id} was triaged`, opts);
    return out;
  });
}

// queued / started share their shape: an event carrying the Epic.
function epicEvent(type, move) {
  return pruneUndefined({ type, at: move.at ?? nowIso(), by: move.by, epic: move.epic });
}

// The unit-record library, when this project has unit records (M6.E16 t3.3);
// null when it has none — the caller then does what it did before unit
// records. A `units/` folder that cannot be trusted throws (`unitRecordsOn`):
// every caller is a writer, and refuses.
async function unitRecords(baseDir) {
  return unitRecordsOn(baseDir) ? unitLib : null;
}

// An archived Epic is finished: nothing is queued or started in it, as
// `reopenItem` refuses to pull an item out of one (REVIEW pass 1). A malformed
// Epic is left to the schema check, which names it.
//
// With unit records (M6.E16 AC1.4) the unit named — an Epic ID or the
// project's own unit name — must have a record, and the record must not be
// closed (a held unit is closed). Read under the store's lock, which unit
// writers take too. The archive folder is not read.
//
// Without unit records the rule is the one from before them: an Epic ID
// only, and not an archived one. The schema's rule for the name is the unit
// ID's since t3.3, so the Epic-ID rule is applied here.
async function refuseUnavailableEpic(baseDir, id, epic, verb) {
  if (typeof epic !== 'string') return;
  const units = await unitRecords(baseDir);
  if (units === null) {
    if (!EPIC_ID_RE.test(epic)) {
      throw new WorkStoreError('SCHEMA', `invalid work record: ${id}: epic does not match ${EPIC_ID_RE.source} `
        + `(got ${JSON.stringify(epic)}) — nothing was ${verb}.`);
    }
    if (isEpicArchived(baseDir, epic)) {
      throw new WorkStoreError('CONFLICT', `${id}: Epic ${epic} is archived (${ARCHIVED_EPICS_REL}/${epic}/) — `
        + `nothing was ${verb}. An archived Epic is finished; pick a live one.`);
    }
    return;
  }
  if (!UNIT_NAME_RE.test(epic)) return;
  const closure = units.unitClosure(baseDir, epic);
  if (closure === 'no-record') {
    throw new WorkStoreError('NOT_FOUND', `${id}: there is no unit ${epic} (no record ${units.UNITS_REL}/${epic}.json) — `
      + `nothing was ${verb}. An Epic's record is created when it is opened (/sig:discuss --epic). For any other unit: `
      + '/sig:docs-migrate --work-store adds a record for each unit this project\'s files name that has none; or open one by hand '
      + 'with openUnit(baseDir, id, {title, by}) in tools/lib/unit-records.js (see /sig:docs-archive, "Holding a unit").');
  }
  if (closure !== 'open') {
    throw new WorkStoreError('CONFLICT', `${id}: ${epic} is closed (${units.UNITS_REL}/${epic}.json) — `
      + `nothing was ${verb}. A closed unit is finished; pick an open one.`);
  }
  // `unitClosure` reads a *closing* unit as open: its files stay. For items it
  // is not open — its close was requested over the items it had then (REVIEW
  // pass 1, C-I1, `D-M6E16-21`).
  if (units.getUnit(baseDir, epic).status === 'closing') {
    throw new WorkStoreError('CONFLICT', `${id}: ${closingUnitRefusal(units, epic)} — nothing was ${verb}. ${REOPEN_UNIT_FIRST}`);
  }
}

// A unit whose close is requested and not yet confirmed takes no item: said
// the same way by `queueItem`, `startItem` and `reopenItem`.
const closingUnitRefusal = (units, unit) => `${unit}'s close has been requested (${units.UNITS_REL}/${unit}.json reads closing), `
  + 'and a closing unit takes no new item';
const REOPEN_UNIT_FIRST = 'Pick an open unit — or, to take the close back, reopen the unit first: '
  + 'reopenUnit(baseDir, id, {reason, by}) in tools/lib/unit-records.js (see /sig:docs-archive, "Holding a unit"), then ask for the close again at SHIP.';

/**
 * Queue an item for an Epic: a `queued` event (legal from T, Q, P). Refused
 * (CONFLICT) when the Epic is archived (`isEpicArchived`).
 *
 * On a project with unit records (M6.E16 AC1.4) `epic` is any unit that has
 * a record — an Epic ID or the project's own unit name — and the refusals
 * are read from the record: NOT_FOUND when the unit has none, CONFLICT when
 * it is closed (held or not) or *closing* — its close was requested over the
 * items it had then. The archive folder is not read.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{epic: string, by: string, at?: string}} move — `epic` is an Epic ID (`M6.E13`); with unit records, a unit ID
 * @param {object} [opts] — as `newItems`'s
 * @returns {Promise<object>} the entry
 */
export async function queueItem(baseDir, id, move = {}, opts = {}) {
  return withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
    const current = readForWrite(handle, id).entry;
    await refuseUnavailableEpic(baseDir, id, move.epic, 'queued');
    const out = await writeRecord(handle, withEvent(current, epicEvent('queued', move)), opts);
    await regenerateAfter(handle, `${id} was queued for ${move.epic}`, opts);
    return out;
  });
}

/**
 * Start an item in an Epic: a `started` event (legal from T, Q). Refused
 * (CONFLICT) when the Epic is archived (`isEpicArchived`). On a project with
 * unit records, as `queueItem`: any unit with a record that is open.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{epic: string, by: string, at?: string}} move
 * @param {object} [opts] — as `newItems`'s
 * @returns {Promise<object>} the entry
 */
export async function startItem(baseDir, id, move = {}, opts = {}) {
  return withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
    const current = readForWrite(handle, id).entry;
    await refuseUnavailableEpic(baseDir, id, move.epic, 'started');
    const out = await writeRecord(handle, withEvent(current, epicEvent('started', move)), opts);
    await regenerateAfter(handle, `${id} was started in ${move.epic}`, opts);
    return out;
  });
}

// ── Closing, reopening, editing (t2.2b, AC1.4, AC7.1) ───────────────────────

const COMMIT_RE = /^[0-9a-f]{7,64}$/;
const DIRECT_CLOSE_REASONS = ['stale', 'wontdo', 'rejected', 'dup'];
const ARCHIVED_EPICS_REL = '.planning/archive/epics';

/**
 * Ask to close an item as fixed: a `close_requested` event (legal from N, T,
 * Q, P), deriving `closing`. It becomes C only when `confirmCloses` finds the
 * commit on the default branch (t2.6). The Epic is kept.
 *
 * `proof` is a bare commit hash, lowercase hex, 7 to 64 characters — nothing
 * else. It is not run through the sensitive-data gate: it can only be hex, and
 * `hex-blob-40` would flag every full SHA.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{proof: string, by: string, at?: string}} request
 * @param {object} [opts] — as `newItems`'s
 * @returns {Promise<object>} the entry
 */
export async function requestClose(baseDir, id, request = {}, opts = {}) {
  assertProof(id, request.proof);
  assertUnambiguousProof(baseDir, id, request.proof, opts);
  return withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
    const { next } = planRequest(handle, id, request);
    const out = await writeRecord(handle, next, opts);
    await regenerateAfter(handle, `${id} is closing (fixed by ${request.proof})`, opts);
    return out;
  });
}

function assertProof(id, proof) {
  if (typeof proof !== 'string' || !COMMIT_RE.test(proof)) {
    throw new WorkStoreError('SCHEMA', `${id}: a close request's proof is a commit hash — lowercase hex, `
      + `7 to 64 characters, nothing else (got ${JSON.stringify(proof)}). Nothing was written.`);
  }
}

// A short proof that more than one commit starts with names neither (SIG-276).
// Best effort at request time: git answers for the repository `baseDir` is in —
// an enclosing one included, the same one the confirm-time checks ask. With no
// repository it cannot say, and the request is accepted; `ancestryFailure`
// checks again at confirm time.
function assertUnambiguousProof(baseDir, id, proof, opts = {}) {
  if (proof.length >= 40) return;
  const n = commitsStartingWith(baseDir, proof, opts.execFn ?? execFileSync);
  if (n > 1) {
    throw new WorkStoreError('SCHEMA', `${id}: the proof ${proof} is the start of ${n} commits or tags, so it names none of them — `
      + 'use a longer hash (git rev-parse <commit>). Nothing was written.');
  }
}

// One close request, built and checked under the lock, nothing written.
function planRequest(handle, id, { proof, by, at = nowIso() }) {
  const { entry, text } = readForWrite(handle, id);
  const next = withEvent(entry, { type: 'close_requested', at, by, reason: 'fixed', proof });
  return { next, text: recordText(next), oldText: text, abs: join(handle.baseDir, entry.path) };
}

/**
 * Ask to close several items as fixed: `requestClose` for each, under ONE
 * `work` lock, every request built and checked before any is written, all or
 * nothing (a failure part-way puts back every record already changed), then
 * ONE `regenerate`. SHIP's backlog discharge on a v2 store uses it
 * (`backlog.js` `dischargeBacklogRows`, `D-M6E13-15`): the rows an Epic
 * finished become *closing* with the Epic's commit, and `confirmCloses`
 * closes them once that commit is on the default branch.
 *
 * Each `proof` is a bare commit hash, as `requestClose`'s. The same item twice
 * is refused.
 *
 * @param {string} baseDir
 * @param {Array<{id: string, proof: string, by: string, at?: string}>} requests
 * @param {object} [opts] — as `newItems`'s
 * @returns {Promise<object[]>} the entries, in order
 */
export async function requestCloses(baseDir, requests, opts = {}) {
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new WorkStoreError('SCHEMA', 'requestCloses: pass at least one request — nothing was written.');
  }
  const ids = requests.map((r) => r?.id);
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (twice.length) {
    throw new WorkStoreError('SCHEMA', `requestCloses: ${[...new Set(twice)].join(', ')} named more than once — nothing was written.`);
  }
  for (const r of requests) assertProof(r?.id, r?.proof);
  const checked = new Set(); // one git check per distinct proof (M6.E14 REVIEW)
  for (const r of requests) {
    if (checked.has(r.proof)) continue;
    checked.add(r.proof);
    assertUnambiguousProof(baseDir, r.id, r.proof, opts);
  }
  return withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
    const planned = requests.map((r) => planRequest(handle, r.id, r));
    const out = await writeRecords(handle, planned, opts);
    await regenerateAfter(handle, `${ids.join(', ')} ${ids.length === 1 ? 'is' : 'are'} closing`, opts);
    return out;
  });
}

/**
 * Close one item directly. `closeItems` with one close; see there.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{reason: string, by: string, proof?: string, dup_of?: string, at?: string}} close
 * @param {object} [opts] — as `newItems`'s
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function closeItem(baseDir, id, close = {}, opts = {}) {
  const r = await closeItems(baseDir, [{ ...close, id }], opts);
  return Array.isArray(r) ? r[0] : r;
}

// Closed as a duplicate, and not reopened since.
function isDup(record) {
  if (deriveStatus(record) !== 'C') return false;
  return record.events.findLast((e) => e.type === 'closed')?.reason === 'dup';
}

// One direct close, built and checked against the store, nothing written.
function planClose(handle, close, batch) {
  const { id, reason, by, proof, dup_of: dupOf, at = nowIso() } = close;
  assertItemId(id);
  if (reason === 'fixed') {
    throw new WorkStoreError('SCHEMA', `${id}: a fixed close goes through requestClose (with the commit) and is `
      + 'confirmed by confirmCloses — it cannot be closed fixed directly. Nothing was closed.');
  }
  if (!DIRECT_CLOSE_REASONS.includes(reason)) {
    throw new WorkStoreError('SCHEMA', `${id}: close reason must be one of ${DIRECT_CLOSE_REASONS.join(', ')} `
      + `(got ${JSON.stringify(reason)}) — nothing was closed.`);
  }
  if (reason !== 'dup' && (typeof proof !== 'string' || proof.trim() === '')) {
    throw new WorkStoreError('SCHEMA', `${id}: a ${reason} close needs proof — what was checked, in words. `
      + 'Nothing was closed.');
  }
  if (reason === 'dup') {
    if (typeof dupOf !== 'string' || !ITEM_ID_RE.test(dupOf)) {
      throw new WorkStoreError('SCHEMA', `${id}: a dup close needs dup_of, the ID of the item it duplicates `
        + `(got ${JSON.stringify(dupOf)}) — nothing was closed.`);
    }
    if (dupOf === id) throw new WorkStoreError('SCHEMA', `${id} cannot be a duplicate of itself — nothing was closed.`);
    const target = readForWrite(handle, dupOf).entry; // NOT_FOUND unless it exists
    if (isDup(target.record) || batch.some((c) => c.id === dupOf && c.reason === 'dup')) {
      throw new WorkStoreError('CONFLICT', `${id}: ${dupOf} is itself a duplicate — point dup_of at the item it `
        + 'duplicates. Nothing was closed.');
    }
  }
  const { entry, text } = readForWrite(handle, id);
  const next = withEvent(entry, pruneUndefined({ type: 'closed', at, by, reason, proof, dup_of: dupOf }));
  return { next, text: recordText(next), oldText: text, abs: join(handle.baseDir, entry.path) };
}

/**
 * Close items directly: ONE `work` lock, every close built and checked before
 * any is written, all or nothing (a failure part-way puts back every record
 * already closed), then ONE `regenerate`. `backlog.js`'s discharge uses it.
 *
 * Direct closes only (the transition table): `stale`, `wontdo` and `rejected`
 * need `proof` text; `dup` needs `dup_of`, which must exist, not be the item,
 * and not itself be a duplicate (also not one being dup-closed in this
 * batch). `fixed` is refused: it goes through `requestClose`. Legal from N, T,
 * Q, P and closing; the Epic is kept. The same item twice is refused.
 *
 * Sensitive data: every close's `proof` (v1 `closeItems`' gate).
 *
 * @param {string} baseDir
 * @param {Array<{id: string, reason: string, by: string, proof?: string, dup_of?: string, at?: string}>} closes
 * @param {object} [opts] — as `newItems`'s
 * @returns {Promise<object[]|{aborted: 'sensitive-data-pending', sensitiveHits: object[]}>} entries in order
 */
export async function closeItems(baseDir, closes, opts = {}) {
  if (!Array.isArray(closes) || closes.length === 0) {
    throw new WorkStoreError('SCHEMA', 'closeItems: pass at least one close — nothing was closed.');
  }
  const ids = closes.map((c) => c?.id);
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (twice.length) {
    throw new WorkStoreError('SCHEMA', `closeItems: ${[...new Set(twice)].join(', ')} named more than once — nothing was closed.`);
  }
  assertWritable(baseDir);
  const pending = sensitivePending(closes.map((c) => c?.proof), opts);
  if (pending) return pending;
  return withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
    const planned = closes.map((c) => planClose(handle, c ?? {}, closes));
    const out = await writeRecords(handle, planned, opts);
    await regenerateAfter(handle, `${ids.join(', ')} ${ids.length === 1 ? 'was' : 'were'} closed`, opts);
    return out;
  });
}

/**
 * Reopen a closed or closing item: a `reopened` event, back to T, the Epic
 * cleared. Refused when the item's Epic is archived
 * (`.planning/archive/epics/<Epic>/` exists): that Epic is finished, and
 * pulling an item out would change what the archive says it contained. On a
 * project with unit records the refusal is read from the unit's record
 * instead — closed, held or not, or *closing* (its close is requested) — and
 * a unit with no record refuses nothing.
 *
 * Sensitive data: `reason` (v1 `reopenItem`'s gate).
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{reason: string, by: string, at?: string}} reopen — `reason` is required
 * @param {object} [opts] — as `newItems`'s
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function reopenItem(baseDir, id, reopen = {}, opts = {}) {
  const { reason, by, at = nowIso() } = reopen;
  if (typeof reason !== 'string' || reason.trim() === '') {
    throw new WorkStoreError('SCHEMA', `${id}: a reopen needs a reason — what came back, and how you know. `
      + 'Nothing was reopened.');
  }
  assertWritable(baseDir);
  const pending = sensitivePending([reason], opts);
  if (pending) return pending;
  return withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
    const current = readForWrite(handle, id).entry;
    const units = current.epic === null ? null : await unitRecords(baseDir);
    if (units !== null) {
      // With unit records (M6.E16 t3.3) the unit's record says whether it is
      // closed; the archive folder is not read. No record: nothing says so.
      const closure = units.unitClosure(baseDir, current.epic);
      if (closure === 'closed' || closure === 'held') {
        throw new WorkStoreError('CONFLICT', `${id} belongs to ${current.epic}, which is closed `
          + `(${units.UNITS_REL}/${current.epic}.json) — nothing was reopened. Capture a new item and link it to ${id} instead.`);
      }
      // A *closing* unit, by the same rule (REVIEW pass 1, C-I1): its close
      // was requested with this item closed, so the item is not pulled out.
      if (closure === 'open' && units.getUnit(baseDir, current.epic).status === 'closing') {
        throw new WorkStoreError('CONFLICT', `${id} belongs to ${current.epic}, whose close has been requested `
          + `(${units.UNITS_REL}/${current.epic}.json reads closing) — nothing was reopened. Capture a new item and link it to ${id} `
          + 'instead, or reopen the unit first: reopenUnit(baseDir, id, {reason, by}) in tools/lib/unit-records.js.');
      }
    } else if (current.epic !== null && isEpicArchived(baseDir, current.epic)) {
      throw new WorkStoreError('CONFLICT', `${id} belongs to Epic ${current.epic}, which is archived `
        + `(${ARCHIVED_EPICS_REL}/${current.epic}/) — nothing was reopened. Capture a new item and link it to ${id} instead.`);
    }
    const out = await writeRecord(handle, withEvent(current, { type: 'reopened', at, by, reason }), opts);
    await regenerateAfter(handle, `${id} was reopened`, opts);
    return out;
  });
}

// ── Epics (t2.5, AC1.5) ─────────────────────────────────────────────────────
//
// An item's Epic is folded from its events (`epicOf`, Decision 4), so whether
// an Epic may close is a query over every record, not a walk of its folder.
// Moving the Epic folder stays in v1 `closeEpic` (`work-ops.js`) until S7.

// An Epic ID (`M6.E13`): what `isEpicArchived` and `closeEpicCheck` take, and
// the only name an item may be queued to on a project with no unit records.
// `state.js`'s rule, not the schema's: since M6.E16 t3.3 the schema's
// `epic_id` is the wider unit-ID rule (`D-M6E16-5`).
const EPIC_ID_RE = EPIC_ID_STRICT_RE;
// What an item's event may name on a project with unit records: a unit ID.
const UNIT_NAME_RE = new RegExp(RECORD_SCHEMA.$defs.epic_id.pattern, 'u');

function assertEpicId(epicId) {
  if (typeof epicId !== 'string' || !EPIC_ID_RE.test(epicId)) {
    throw new WorkStoreError('SCHEMA', `${JSON.stringify(epicId)} is not an Epic ID (M6.E13)`);
  }
}

/**
 * Whether an Epic is archived: `.planning/archive/epics/<Epic>/` exists (not
 * followed if it is a link). `reopenItem`, `queueItem` and `startItem` refuse
 * on it (on a project with no unit records); `closeEpicCheck` reports it. The ID is checked against
 * the Epic-ID pattern (`EPIC_ID_STRICT_RE`, `state.js`) before it becomes part of a path.
 *
 * @param {string} baseDir
 * @param {string} epicId
 * @returns {boolean}
 * @throws {WorkStoreError} SCHEMA when `epicId` is not an Epic ID
 */
export function isEpicArchived(baseDir, epicId) {
  assertEpicId(epicId);
  return existsNoFollow(join(baseDir, ARCHIVED_EPICS_REL, epicId));
}

/**
 * May this Epic close? Every record whose Epic (`epicOf`) is `epicId` must be
 * closed (C), or *closing* with its fix on the shipping branch (`D-M6E13-22`):
 * a *closing* record counts as done here iff its latest `close_requested`
 * proof is a commit hash that `git merge-base --is-ancestor` finds in the
 * current HEAD. At an Epic-close SHIP the Epic's fix commits are on the
 * branch, not yet on the default branch, so `confirmCloses` cannot close them
 * until after the merge; this gate does not wait for it. Fail-closed: no git,
 * a shallow clone, an unknown commit or an invalid proof leave the record
 * open. Never fetches. Read-only.
 *
 * Refuses with `OPEN_ITEMS`, the code and message shape of v1 `closeEpic`'s
 * gate, naming each open record. Refuses with `SCHEMA` when any record in the
 * store is broken: a broken record's Epic cannot be known, and passing over it
 * could close an Epic with an open item in it.
 *
 * Two options, for the caller on a project with unit records (`closeEpic`'s
 * unit path); neither is passed anywhere else, and without them nothing here
 * differs from before:
 * - `unitRecords: true` words the refusal for a close that moves nothing
 *   ("Nothing was written"), and says how an item left *closing* by a squash
 *   or rebase merge gets listed;
 * - `rerequest` is about an item that is *closing* on a commit that is
 *   certainly not in HEAD's history (`notInHead`) — a candidate to have its
 *   close asked again (`rerequestEpicClose`). An item git cannot answer for is
 *   never one: it is open.
 *   `rerequest: true` lists the candidates and counts none of them as open.
 *   `rerequest: [{id, proof}]` is the ones a person named, each with the
 *   commit it was shown closing on: a candidate that is not named is open
 *   (OPEN_ITEMS); a named item that is not a candidate, or that is closing on
 *   another commit now, refuses (CONFLICT).
 *
 * @param {string} baseDir
 * @param {string} epicId
 * @param {{execFn?: Function, unitRecords?: boolean, rerequest?: true|Array<{id: string, proof: string}>}} [opts] — `execFn` as
 *   `listRecords`'s; also runs the ancestry check
 * @returns {{epic: string, items: string[], closingOnBranch: string[], archived: boolean,
 *   rerequest?: Array<{id: string, title: string|null, proof: string, why: 'not-in-history'|'unknown-commit'}>}}
 *   `items`: the Epic's records, by number, every one closed or closing on the
 *   branch; `closingOnBranch`: those still *closing* (confirmed after the
 *   merge); `archived`: as `isEpicArchived`; `rerequest` (only with
 *   `opts.rerequest`): the candidates — all of them, or the named ones — each
 *   with the commit it is closing on and `why` it is not in HEAD's history
 *   (`not-in-history`: git has the commit and HEAD does not descend from it;
 *   `unknown-commit`: no commit of that name is in this clone)
 * @throws {WorkStoreError} SCHEMA (not an Epic ID, or a broken record), OPEN_ITEMS, CONFLICT (a named item), CONFIG
 */
export function closeEpicCheck(baseDir, epicId, opts = {}) {
  assertEpicId(epicId);
  const { records, broken } = listRecords(baseDir, opts);
  if (broken.length) {
    throw new WorkStoreError('SCHEMA', `${epicId} cannot be checked — a broken record's Epic is unknown. `
      + `Fix these first:\n${broken.map((b) => `  ${b.error}`).join('\n')}`);
  }
  const mine = records.filter((r) => r.epic === epicId);
  const execFn = opts.execFn ?? execFileSync;
  const closingOnBranch = [];
  const named = Array.isArray(opts.rerequest) ? opts.rerequest : null;
  const candidates = [];
  let onHead;
  let offHead;
  const open = mine.filter((r) => {
    if (r.status === 'C') return false;
    if (r.status !== 'closing') return true;
    onHead ??= headAncestry(baseDir, execFn);
    const proof = latestRequest(r.record)?.proof;
    if (!onHead(proof)) {
      if (opts.rerequest !== true && named === null) return true;
      offHead ??= notInHead(baseDir, execFn);
      const why = offHead(proof);
      if (why === null) return true;
      candidates.push({ id: r.id, title: r.record.title ?? null, proof, why });
      // Listed, or named by a person: not open. A candidate nobody named is.
      return named !== null && !named.some((n) => n?.id === r.id);
    }
    closingOnBranch.push(r.id);
    return false;
  });
  // What was named must be what is there now: the caller runs this again under
  // the store's lock, so an item that moved since it was shown refuses here.
  for (const n of named ?? []) {
    const now = candidates.find((c) => c.id === n?.id);
    if (now === undefined) {
      throw new WorkStoreError('CONFLICT', `${epicId}: ${echoed(n?.id)} was named to have its close asked again, and it is not an item of this Epic `
        + 'that is closing on a commit outside this branch\'s history. Nothing was written. Re-run without the list to see the items as they are now.');
    }
    if (now.proof !== n.proof) {
      throw new WorkStoreError('CONFLICT', `${epicId}: ${now.id} was named as closing on ${echoed(n.proof)}, and it is closing on ${now.proof} now. `
        + 'Nothing was written. Re-run without the list to see the items as they are now.');
    }
  }
  if (open.length) {
    const lines = open.map((r) => `  ${r.id} (status ${r.status})${r.record.title ? ` — ${r.record.title}` : ''}`);
    // With unit records nothing moves at a close, and an item left closing by
    // a squash or rebase merge has a way out that the folder close never had.
    const closing = opts.unitRecords === true && open.some((r) => r.status === 'closing');
    const squashed = !closing ? ''
      : named !== null
        ? ' An item closing on a commit that is not in this branch\'s history has its close asked again only when a person names it as part of '
          + 'the merged pull request; one that was not named is open.'
        : ' For an item still closing on a commit that never reached this branch (the pull request was merged by squash or rebase): re-running '
          + 'this on the default branch after the merge, with a clean tree, lists each such item, so a person can say which were in the merge.';
    throw new WorkStoreError('OPEN_ITEMS', `${epicId} has ${open.length} open item${open.length === 1 ? '' : 's'} `
      + `in it — close each (\`/sig:item close\`; a closing item closes when confirmCloses finds its commit) `
      + `or triage it out of the Epic, then re-run.${squashed} Nothing was ${opts.unitRecords === true ? 'written' : 'moved'}:\n${lines.join('\n')}`);
  }
  return {
    epic: epicId, items: mine.map((r) => r.id), closingOnBranch, archived: isEpicArchived(baseDir, epicId),
    ...(opts.rerequest === true ? { rerequest: candidates } : {}),
    ...(named !== null ? { rerequest: candidates.filter((c) => named.some((n) => n.id === c.id)) } : {}),
  };
}

/**
 * Would HEAD, taken as the proof of an Epic's close, say nothing about the
 * Epic (REVIEW pass 1, C-I2, `D-M6E16-21`)? Yes when BOTH hold: `head` is
 * already an ancestor of the remote's default branch
 * (`refs/remotes/origin/<default>`, `confirmCloses`' ref), and the project
 * has uncommitted or untracked changes. HEAD is then a commit from before
 * that work, and the next confirm step would find it on the default branch
 * and call the Epic closed with its work in nobody's history.
 *
 * No: a clean tree (on the default branch after a merge, HEAD is the merge —
 * the recovery when a branch commit never landed); a HEAD that is not on the
 * default branch (the normal SHIP, on a branch); and whenever git cannot
 * answer — not a repository, no remote, an ancestry
 * question git cannot settle, a status that fails. `git status` is asked about the project's
 * folder only (`-- .`, from `baseDir`), so another package's changes in the
 * same repository do not count. Reads only; never fetches.
 *
 * One more yes: there is a remote and its default branch is not recorded in
 * this clone (`defaultBranchRef` answers `no-default-branch`), and the
 * project has uncommitted or untracked changes. Whether `head` is already on
 * the default branch cannot be told then, and a close requested on it would be
 * confirmed as soon as `git remote set-head origin -a` records the branch.
 * A clean tree is still a no.
 *
 * Call it BEFORE taking the store's lock: the lock is a file under the
 * project and would itself read as an untracked change.
 *
 * @param {string} baseDir
 * @param {string} head — a commit hash (HEAD's)
 * @param {{execFn?: Function}} [opts]
 * @returns {{ref: string}|{ref: null}|null} the default-branch ref `head` is already on; `ref: null` when
 *   the default branch is not recorded and so nothing can say; or null
 */
export function headProvesNothing(baseDir, head, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const target = defaultBranchRef(baseDir, execFn);
  if (target.ref === undefined && target.reason !== 'no-default-branch') return null;
  if (target.ref !== undefined && ancestryFailure(baseDir, head, target.ref, execFn, shallowProbe(baseDir, execFn)) !== null) return null;
  let status;
  try {
    status = runGit(baseDir, ['status', '--porcelain', '--untracked-files=all', '--', '.'], execFn);
  } catch {
    return null;
  }
  return status.trim() === '' ? null : { ref: target.ref ?? null };
}

// `proof => boolean`: is this proof a commit in the current HEAD? Fail-closed —
// anything but `merge-base --is-ancestor` exiting 0 (no repo, an invalid
// proof, a shallow clone, an unknown commit) answers false. `HEAD` is a fixed
// ref, and a proof reaches git only after matching COMMIT_RE.
function headAncestry(baseDir, execFn) {
  if (!isGitRepo(baseDir, execFn)) return () => false;
  const isShallow = shallowProbe(baseDir, execFn);
  return (proof) => typeof proof === 'string' && COMMIT_RE.test(proof)
    && ancestryFailure(baseDir, proof, 'HEAD', execFn, isShallow) === null;
}

// `proof => string|null`: is this proof CERTAINLY not a commit in the current
// HEAD's history, and why? A reason only when git says so: `not-in-history` —
// the commit is in this repository and `merge-base --is-ancestor` answers no;
// `unknown-commit` — in a clone that is not shallow, no commit of that name is
// here at all (every ancestor of HEAD is). Null whenever git cannot answer: no
// repository, a shallow clone, an invalid or ambiguous proof, a failure. The
// opposite of `headAncestry` is not this: "not shown to be in HEAD" includes
// "cannot tell".
function notInHead(baseDir, execFn) {
  if (!isGitRepo(baseDir, execFn)) return () => null;
  const isShallow = shallowProbe(baseDir, execFn);
  return (proof) => {
    if (typeof proof !== 'string' || !COMMIT_RE.test(proof)) return null;
    const why = ancestryFailure(baseDir, proof, 'HEAD', execFn, isShallow);
    if (why === 'not-on-default-branch') return 'not-in-history';
    return why === 'unknown-commit' ? why : null;
  };
}

/**
 * Is this commit already on the remote's default branch — the ref
 * `confirmCloses` checks against (`refs/remotes/origin/<default>`)? False when
 * it is not, and whenever git cannot answer. Reads only; never fetches.
 *
 * @param {string} baseDir
 * @param {string} sha — a commit hash
 * @param {{execFn?: Function}} [opts]
 * @returns {boolean}
 */
export function onDefaultBranch(baseDir, sha, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  if (typeof sha !== 'string' || !COMMIT_RE.test(sha)) return false;
  const target = defaultBranchRef(baseDir, execFn);
  if (target.ref === undefined) return false;
  return ancestryFailure(baseDir, sha, target.ref, execFn, shallowProbe(baseDir, execFn)) === null;
}

// ── Asking again for a close whose commit never landed (REVIEW pass 2) ──────
//
// A pull request merged by squash or rebase leaves every close that was
// requested on the branch pointing at a commit the default branch will never
// hold: the item stays *closing* for ever. The way out is to ask again with a
// commit that did land. An item's close is asked again ONLY when the commit
// it is closing on is certainly not in HEAD's history — a proof that HEAD can
// reach is never replaced — and only with a full hash that names a commit
// here.
//
// It is three events, all real and all kept, as a unit's re-request is two:
// `reopened` (its reason names both commits), then the `queued` or `started`
// that puts the item back in the unit it was in (a reopen takes an item out of
// its unit), then the new `close_requested`. No event replaces a proof.

const FULL_COMMIT_RE = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

// The new proof of a re-request: a full hash, naming a commit in this repository.
function assertFullCommit(baseDir, what, proof, execFn) {
  if (typeof proof !== 'string' || !FULL_COMMIT_RE.test(proof)) {
    throw new WorkStoreError('SCHEMA', `${what}: a close is asked again only with a full commit hash — 40 or 64 lowercase hex characters `
      + `(got ${echoed(typeof proof === 'string' ? proof.slice(0, 80) : proof)}). Use \`git rev-parse <commit>\`. Nothing was written.`);
  }
  let full = null;
  try {
    full = runGit(baseDir, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${proof}^{commit}`], execFn).trim().toLowerCase();
  } catch {
    full = null;
  }
  if (full !== proof) {
    throw new WorkStoreError('SCHEMA', `${what}: ${proof} is not a commit in this repository (or git could not be asked), so a close cannot be `
      + 'asked again with it. Nothing was written.');
  }
}

// One item's re-request, built and checked under the lock, nothing written.
// `offHead`: `notInHead`'s.
function planRerequest(handle, id, { proof, by, at = nowIso() }, offHead) {
  const { entry, text } = readForWrite(handle, id);
  if (entry.status !== 'closing') {
    throw new WorkStoreError('CONFLICT', `${id}: no close is outstanding (the item is ${entry.status === 'C' ? 'closed' : `at ${entry.status}`}) — `
      + 'nothing was written. A close is asked again only while an earlier request is waiting.');
  }
  const events = entry.record.events;
  const at0 = events.findLastIndex((e) => e.type === 'close_requested');
  const previous = events[at0].proof;
  if (previous === proof) throw new WorkStoreError('CONFLICT', `${id}: its close was already requested with ${proof} — nothing was written.`);
  if (!offHead(previous)) {
    throw new WorkStoreError('CONFLICT', `${id}: it is closing on ${echoed(previous)}, and that commit is in this branch's history (or git cannot say `
      + 'that it is not) — a close is asked again only when its commit never reached the branch, as after a squash or rebase merge. Nothing was written.');
  }
  // Where the item stood when the earlier request was made: a reopen takes it
  // out of its unit, so it is put back the way it was in.
  const before = { ...entry.record, events: events.slice(0, at0) };
  const was = deriveStatus(before);
  const reason = `the close was requested again with the commit ${proof}; the earlier request named ${previous}, which never reached this branch`;
  let next = withEvent(entry, { type: 'reopened', at, by, reason });
  if (entry.epic !== null && entry.epic !== undefined) {
    next = withEvent({ record: next }, epicEvent(was === 'P' ? 'started' : 'queued', { at, by, epic: entry.epic }));
  }
  next = withEvent({ record: next }, { type: 'close_requested', at, by, reason: 'fixed', proof });
  return { next, text: recordText(next), oldText: text, abs: join(handle.baseDir, entry.path), previous };
}

/**
 * Ask again for the close of items that are *closing* on a commit that never
 * reached this branch (a squash or rebase merge), with a commit that did:
 * ONE `work` lock, every request built and checked before any is written, all
 * or nothing, then ONE `regenerate`.
 *
 * Refused, with nothing written: a `proof` that is not a full hash (40 or 64
 * hex) or does not name a commit in this repository; an item that is not
 * *closing*; one already closing on `proof`; and one whose outstanding commit
 * is in HEAD's history, or that git cannot answer for (no repository, a
 * shallow clone) — a proof that can be reached is never replaced. The same
 * item twice is refused.
 *
 * Each item gets three events: `reopened`, the `queued` or `started` that
 * keeps it in its unit, and the new `close_requested`. It reads *closing* on
 * `proof`, in the unit it was in; `confirmCloses` closes it once `proof` is on
 * the default branch.
 *
 * @param {string} baseDir
 * @param {Array<{id: string, proof: string, by: string, at?: string}>} requests
 * @param {object} [opts] — as `newItems`'s
 * @returns {Promise<Array<object>>} the entries, in order, each with `previous_proof`
 * @throws {WorkStoreError} SCHEMA, CONFLICT, NOT_FOUND, CONFIG, LOCKED, IO
 */
export async function rerequestCloses(baseDir, requests, opts = {}) {
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new WorkStoreError('SCHEMA', 'rerequestCloses: pass at least one request — nothing was written.');
  }
  const ids = requests.map((r) => r?.id);
  const twice = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (twice.length) {
    throw new WorkStoreError('SCHEMA', `rerequestCloses: ${[...new Set(twice)].join(', ')} named more than once — nothing was written.`);
  }
  const execFn = opts.execFn ?? execFileSync;
  assertWritable(baseDir);
  const checked = new Set();
  for (const r of requests) {
    if (checked.has(r?.proof)) continue;
    checked.add(r?.proof);
    assertFullCommit(baseDir, r?.id, r?.proof, execFn);
  }
  return withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
    const offHead = notInHead(handle.baseDir, execFn);
    const planned = requests.map((r) => planRerequest(handle, r.id, r, offHead));
    const out = await writeRecords(handle, planned, opts);
    await regenerateAfter(handle, `the close of ${ids.join(', ')} was requested again`, opts);
    return out.map((entry, i) => ({ ...entry, previous_proof: planned[i].previous }));
  });
}

/**
 * Ask for an Epic's close — again, or for the first time — together with the
 * re-request of the items of it that are *closing* on a commit that never
 * reached this branch and that a person named: the recovery after a pull
 * request merged by squash or rebase, run on the default branch (`closeEpic`,
 * `work-ops.js`, is the one caller). ONE take of the store's lock and ONE write, all or nothing: the
 * items' re-requests (`rerequestCloses`' rule and events) and the unit's
 * close request (`planUnitCloseRequest`, `unit-records.js` — two events when
 * it was already closing, one when it was open), then ONE `regenerate`.
 *
 * `opts.gate` runs under the lock before anything is read here and returns
 * the items to ask again (`closeEpicCheck`'s `rerequest`, for a list of named
 * items); what it throws is the refusal.
 *
 * @param {string} baseDir
 * @param {string} epicId
 * @param {{proof: string, by: string, at?: string, pr?: string, release?: string}} request — `proof`: a full commit hash
 * @param {{gate: (handle: object) => Array<{id: string}>, execFn?: Function, renameFn?: Function, regenerate?: Function}} opts
 * @returns {Promise<{unit: object, previous: string|null, items: string[]}>} `unit`: the unit's entry, now
 *   *closing* on `proof`; `previous`: the commit it was closing on before, or null when it was open;
 *   `items`: the items whose close was asked again
 * @throws {WorkStoreError} as `rerequestCloses`, the gate's own, and CONFIG when the project has no unit records
 */
export async function rerequestEpicClose(baseDir, epicId, request = {}, opts = {}) {
  assertEpicId(epicId);
  const execFn = opts.execFn ?? execFileSync;
  const { proof, by, at = nowIso() } = request;
  assertFullCommit(baseDir, epicId, proof, execFn);
  const units = await unitRecords(baseDir);
  if (units === null) {
    throw new WorkStoreError('CONFIG', `${epicId}: this project has no unit records (${UNITS_REL}/ does not exist) — nothing was written.`);
  }
  return withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
    const again = await opts.gate(handle);
    const offHead = notInHead(handle.baseDir, execFn);
    const planned = again.map((r) => planRerequest(handle, r.id, { proof, by, at }, offHead));
    const unit = units.planUnitCloseRequest(handle, epicId, { proof, by, at, pr: request.pr, release: request.release });
    await writePlanned(handle, [...planned, unit], opts);
    const ids = planned.map((p) => p.next.id);
    await regenerateAfter(handle, `${epicId} is closing (its close was requested with ${proof})`
      + (ids.length > 0 ? `, and the close of ${ids.join(', ')} was requested again` : ''), opts);
    return { unit: units.getUnit(handle.baseDir, epicId), previous: unit.previous, items: ids };
  });
}

// Reasons `ancestryFailure` gives when git has answered: the commit is not on
// the default branch, or no commit of that name is in this clone.
const PROOF_NOT_THERE = new Set(['not-on-default-branch', 'unknown-commit']);

/**
 * Ask git again about closes already recorded: every item closed as `fixed`,
 * and every unit closed as `shipped`, whose proof is a commit hash. A proof
 * that is words (a close recorded by a migration) is not a claim about a
 * commit and is not asked about.
 *
 * Reads local refs only; nothing is written. `notThere` is empty whenever
 * git cannot answer: no repository, no remote, a default branch this clone
 * does not record, a shallow clone, an ambiguous proof.
 *
 * @param {string} baseDir
 * @param {{execFn?: Function}} [opts]
 * @returns {{branch: string|null, notThere: Array<{id: string, path: string, proof: string}>}}
 *   `branch`: the ref asked about, as `origin/<default>`, or null when there is none
 * @throws {WorkStoreError} as `listRecords`, and for a `units/` folder that cannot be trusted
 */
export function probeClosedProofs(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const closes = [];
  for (const r of listRecords(baseDir, opts).records) {
    if (r.status !== 'C') continue;
    const e = r.record.events.findLast((x) => x.type === 'closed');
    if (e?.reason === 'fixed') closes.push({ id: r.id, path: recordPath(r.id), proof: e.proof });
  }
  for (const u of unitRecordsOn(baseDir) ? listUnits(baseDir).units : []) {
    if (u.status === 'closed' && u.close?.reason === 'shipped') closes.push({ id: u.id, path: u.path, proof: u.close.proof });
  }
  const asked = closes.filter((c) => typeof c.proof === 'string' && COMMIT_RE.test(c.proof));
  if (asked.length === 0) return { branch: null, notThere: [] };
  const target = defaultBranchRef(baseDir, execFn);
  if (target.ref === undefined) return { branch: null, notThere: [] };
  const isShallow = shallowProbe(baseDir, execFn);
  return {
    branch: target.ref.slice('refs/remotes/'.length),
    notThere: asked.filter((c) => PROOF_NOT_THERE.has(ancestryFailure(baseDir, c.proof, target.ref, execFn, isShallow))),
  };
}

// ── Confirming fixed closes (t2.6, AC7.2) ──────────────────────────────────
//
// A fixed close is requested with a commit and stays *closing* until that
// commit is on the remote's default branch. The check reads local refs only
// (`/sig:resume` fetches first; this never does) and is fail-open: anything
// other than `git merge-base --is-ancestor` exiting 0 leaves the item
// closing, with the reason. Nothing is guessed.

const STALE_CLOSING_MS = 14 * 24 * 60 * 60 * 1000;
const CONFIRM_BY = 'confirmCloses';

const latestRequest = (record) => record.events.findLast((e) => e.type === 'close_requested');

/**
 * Confirm fixed closes: for each record deriving *closing*, its latest
 * `close_requested` proof is checked as a bare commit hash (lowercase hex, 7
 * to 64 characters — re-checked here, not trusted to the schema), resolved
 * with `git rev-parse --verify <sha>^{commit}` to a full SHA that must start
 * with the proof (a ref named like a hash is not a commit), then checked with
 * `git merge-base --is-ancestor <full sha> refs/remotes/origin/<default>`.
 * The default branch is the one `origin/HEAD` names (`defaultBranchRef`); with
 * `origin/HEAD` unset it is not guessed, and every close stays *closing* with
 * the reason `no-default-branch`. Local refs only, never a fetch.
 *
 * Exit 0 → a `closed` event (reason fixed, the request's proof copied, by
 * `confirmCloses`), written through the library under ONE `work` lock, each
 * record re-read under the lock and confirmed only if it is still closing on
 * the same proof; then ONE `regenerate`. Anything else leaves the item
 * closing, with a reason: `invalid-proof`, `not-a-repo`, `no-remote`,
 * `no-origin-remote` (remotes, none of them named `origin`), `no-default-branch`, `not-on-default-branch`, `unknown-commit`, `proof-names-a-ref`,
 * `ambiguous-proof` (a short id more than one commit starts with), `shallow`, `git-failed`,
 * or `changed` (it moved while git was asked). A unit has one more: `open-items`
 * (below).
 *
 * Git is not asked anything unless some proof is valid, and nothing is locked
 * unless some commit is confirmed. A broken record anywhere in the store
 * refuses the run (SCHEMA), before git and again under the lock: all or nothing.
 *
 * **Unit closes too, on a project with unit records** (M6.E16 t4.2, AC4.2):
 * every unit record reading *closing* is classified by the same rule, against
 * the same ref, and confirmed in the same call — under the same one take of
 * the lock, in the same all-or-nothing write as the items. A unit's event is
 * `closed` with reason `shipped`, the request's proof, and the `pr` and
 * `release` the request carried. The result then has a `units` field; the
 * item fields mean what they did. A unit with an item that is not closed —
 * and not confirmed by this same call — stays *closing*, reason `open-items`
 * (REVIEW pass 1, C-I1): checked once its commit is on the default branch,
 * and again under the lock. A broken unit record refuses the run as a
 * broken item record does. Without unit records nothing here changes, and
 * the result has no `units` field.
 *
 * @param {string} baseDir
 * @param {{now?: Date|string, execFn?: Function, renameFn?: Function,
 *   regenerate?: (baseDir: string) => Promise<void>}} [opts]
 *   `now`: the clock, for the closing `at` and for `stale` (default: now)
 * @returns {Promise<{confirmed: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[],
 *   units?: {confirmed: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[]}}>}
 *   `stale`: items still closing whose request is more than 14 days before `now`;
 *   `units`: the same three for unit records, by unit ID — present only on a project with unit records
 * @throws {WorkStoreError} CONFIG (store off, or v1), SCHEMA (a broken record), NOT_FOUND (a record removed between the check and the write), LOCKED, IO
 */
export async function confirmCloses(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const now = opts.now === undefined ? new Date() : new Date(opts.now);
  if (Number.isNaN(now.getTime())) throw new WorkStoreError('SCHEMA', `confirmCloses: now ${JSON.stringify(opts.now)} is not a date`);
  assertWritable(baseDir);

  const units = await unitRecords(baseDir);
  const onDefaultBranch = ancestrySplit(baseDir, execFn);
  const { still, ok, records: itemRecords } = classifyClosing(baseDir, execFn, { onDefaultBranch });
  const unitSide = units === null ? null : classifyClosingUnits(units, baseDir, onDefaultBranch, { items: itemsNotClosed(itemRecords, ok) });

  const confirmed = [];
  const unitsConfirmed = [];
  if (ok.length > 0 || (unitSide !== null && unitSide.ok.length > 0)) {
    await withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
      const at = now.toISOString();
      const planned = [];
      const listedNow = listRecords(handle.baseDir);
      refuseBroken(listedNow);
      for (const c of ok) {
        const { entry, text } = readForWrite(handle, c.id);
        if (entry.status !== 'closing') continue; // closed or reopened meanwhile: nothing to confirm
        const req = latestRequest(entry.record);
        if (req.proof !== c.req.proof) {
          still.set(c.id, { reason: 'changed', req });
          continue;
        }
        const next = withEvent(entry, { type: 'closed', at, by: CONFIRM_BY, reason: 'fixed', proof: req.proof });
        planned.push({ next, text: recordText(next), oldText: text, abs: join(handle.baseDir, entry.path) });
      }
      // The unit closes, built and checked by the unit library and written with
      // the items' — one write, all or nothing.
      let unitPlanned = [];
      if (unitSide !== null && unitSide.ok.length > 0) {
        refuseBroken(units.listUnits(handle.baseDir));
        // The unit's items, read again under the lock: closed, or confirmed in this same write.
        const openItems = itemsNotClosed(listedNow.records, planned.map((p) => ({ id: p.next.id })));
        const plan = units.planUnitConfirms(handle, unitSide.ok.map((c) => ({ id: c.id, proof: c.req.proof })), { at, by: CONFIRM_BY, openItems });
        const reqOf = (id) => unitSide.ok.find((c) => c.id === id).req;
        for (const id of plan.changed) unitSide.still.set(id, { reason: 'changed', req: reqOf(id) });
        for (const { id } of plan.openItems) unitSide.still.set(id, { reason: OPEN_ITEMS_REASON, req: reqOf(id) });
        unitPlanned = plan.planned;
      }
      if (planned.length + unitPlanned.length === 0) return;
      await writePlanned(handle, [...planned, ...unitPlanned], opts);
      confirmed.push(...planned.map((p) => p.next.id));
      unitsConfirmed.push(...unitPlanned.map((p) => p.next.id));
      const all = [...confirmed, ...unitsConfirmed];
      await regenerateAfter(handle, `${all.join(', ')} ${all.length === 1 ? 'was' : 'were'} confirmed closed`, opts);
    });
  }

  const out = { confirmed, ...stillAndStale(still, now) };
  if (unitSide !== null) out.units = { confirmed: unitsConfirmed.sort(), ...stillAndStale(unitSide.still, now, byText) };
  return out;
}

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// `(candidates, still) => ok`: which candidates' proof commits are on the
// default branch now; the others go to `still` with the reason. The ref is
// resolved once, on the first call with a candidate, and shared by every call
// — items and units are checked against the same ref.
function ancestrySplit(baseDir, execFn) {
  let target;
  let isShallow;
  return (candidates, still) => {
    const ok = [];
    if (candidates.length === 0) return ok;
    target ??= defaultBranchRef(baseDir, execFn);
    isShallow ??= shallowProbe(baseDir, execFn);
    for (const c of candidates) {
      const reason = target.reason ?? ancestryFailure(baseDir, c.req.proof, target.ref, execFn, isShallow);
      if (reason === null) ok.push(c);
      else still.set(c.id, { reason, req: c.req });
    }
    return ok;
  };
}

// Every *closing* record, split by whether its proof commit is on the default
// branch now: `ok` (it is) and `still` (id → {reason, req}, why not). Reads the
// records and asks git; writes nothing. Shared by `confirmCloses` and
// `probeCloses`, so the two can never disagree on what is confirmable.
function classifyClosing(baseDir, execFn, { writing = true, onDefaultBranch = ancestrySplit(baseDir, execFn) } = {}) {
  const listed = listRecords(baseDir);
  refuseBroken(listed, { writing });
  const closing = listed.records.filter((r) => r.status === 'closing');
  const still = new Map(); // id -> {reason, request}
  const candidates = [];
  for (const r of closing) {
    const req = latestRequest(r.record);
    if (typeof req?.proof !== 'string' || !COMMIT_RE.test(req.proof)) still.set(r.id, { reason: 'invalid-proof', req });
    else candidates.push({ id: r.id, req });
  }
  return { still, ok: onDefaultBranch(candidates, still), records: listed.records };
}

// Why a unit stays *closing* although its commit may be on the default branch:
// one of its items is not closed (REVIEW pass 1, C-I1, AC4.3).
const OPEN_ITEMS_REASON = 'open-items';

// `(unitId) => string[]`: the IDs of the unit's items that are not closed. An
// item counts as closed when it reads C, or when `confirming` — the item
// closes this same run confirms — names it. `closeEpicCheck`'s rule at the
// close request, without the branch: at the confirm an item still *closing*
// on a commit that is not on the default branch is not closed.
function itemsNotClosed(records, confirming) {
  const done = new Set(confirming.map((c) => c.id));
  const byUnit = new Map();
  for (const r of records) {
    if (r.epic === null || r.epic === undefined || r.status === 'C' || done.has(r.id)) continue;
    if (!byUnit.has(r.epic)) byUnit.set(r.epic, []);
    byUnit.get(r.epic).push(r.id);
  }
  return (unitId) => byUnit.get(unitId) ?? [];
}

// `classifyClosing` for unit records (M6.E16 t4.2): every unit reading
// *closing*, split the same way, by the same rule and against the same ref.
// A broken unit record refuses the run, as a broken item record does.
//
// A unit whose commit is on the default branch and that has an item not
// closed stays closing, reason `open-items` (`items`: `itemsNotClosed`). The
// commit is asked about first, so a unit whose commit has not landed says
// that, as it did.
function classifyClosingUnits(units, baseDir, onDefaultBranch, { writing = true, items } = {}) {
  const listed = units.listUnits(baseDir);
  refuseBroken(listed, { writing });
  const still = new Map();
  const candidates = [];
  for (const u of listed.units.filter((x) => x.status === 'closing')) {
    const req = latestRequest(u.record);
    if (typeof req?.proof !== 'string' || !COMMIT_RE.test(req.proof)) still.set(u.id, { reason: 'invalid-proof', req });
    else candidates.push({ id: u.id, req });
  }
  const ok = onDefaultBranch(candidates, still).filter((c) => {
    if (items(c.id).length === 0) return true;
    still.set(c.id, { reason: OPEN_ITEMS_REASON, req: c.req });
    return false;
  });
  return { still, ok };
}

// The views refuse to regenerate over a broken record, so writing the others
// first would leave a partial write (REVIEW pass 2): refuse before anything.
// `writing` (SIG-280 (2)): false on the read-only path (`probeCloses`, from
// `/sig:resume`), where saying "nothing was written" answers a question nobody
// asked. The error carries the broken IDs (`err.broken`) so a caller that
// already reports each one — the sweep's `checkWorkStore` — need not repeat it.
function refuseBroken({ broken }, { writing = true } = {}) {
  if (broken.length === 0) return;
  const err = new WorkStoreError('SCHEMA', `broken record(s)${writing ? ', so nothing was written' : ''}: `
    + `${broken.map((b) => `${b.id ?? shownName(b.path)} (${b.error})`).join('; ')} — restore each with git: \`git checkout -- <path>\` `
    + 'when HEAD holds a good copy; for a merge conflict in the record, take one side with '
    + '`git checkout --ours <path>` or `git checkout --theirs <path>` (Edit is blocked on records; git is not). Then re-run.');
  err.broken = broken.map((b) => b.id ?? b.path);
  throw err;
}

function stillAndStale(still, now, order = (a, b) => numberOf(a) - numberOf(b)) {
  const ids = [...still.keys()].sort(order);
  const stale = ids.filter((id) => {
    const t = Date.parse(still.get(id).req?.at);
    return Number.isFinite(t) && now.getTime() - t > STALE_CLOSING_MS;
  });
  return { stillClosing: ids.map((id) => ({ id, reason: still.get(id).reason })), stale };
}

/**
 * What `confirmCloses` would do now, without doing it (M6.E13 t4.6): the same
 * classification — the same proof check and the same `git merge-base
 * --is-ancestor` against `refs/remotes/origin/<default>` — with no lock, no
 * event and no regeneration. For `/sig:resume`, which stays read-only
 * (`D-M6E13-21`, through `close-confirm.js` `reportCloses`): it reports what
 * the next sweep or SHIP will confirm. Local refs only, never a fetch.
 *
 * v2 only, as `confirmCloses`: on a v1 store every fixed close reads as
 * *closing* through the converter, and none of them can be confirmed there.
 *
 * @param {string} baseDir
 * @param {{now?: Date|string, execFn?: Function}} [opts]
 * @returns {{confirmable: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[],
 *   units?: {confirmable: string[], stillClosing: Array<{id: string, reason: string}>, stale: string[]}}}
 *   `confirmable` by ID number; the other two as `confirmCloses` returns them;
 *   `units`: the same three for unit records, by unit ID — present only on a project with unit records
 * @throws {WorkStoreError} CONFIG (store off, or v1), SCHEMA (`now` is not a date, or a broken record)
 */
export function probeCloses(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const now = opts.now === undefined ? new Date() : new Date(opts.now);
  if (Number.isNaN(now.getTime())) throw new WorkStoreError('SCHEMA', `probeCloses: now ${JSON.stringify(opts.now)} is not a date`);
  assertWritable(baseDir);
  const onDefaultBranch = ancestrySplit(baseDir, execFn);
  const { still, ok, records: itemRecords } = classifyClosing(baseDir, execFn, { writing: false, onDefaultBranch });
  const out = { confirmable: ok.map((c) => c.id).sort((a, b) => numberOf(a) - numberOf(b)), ...stillAndStale(still, now) };
  // Unit closes, by the same rule and against the same ref (M6.E16 t5.0c).
  if (unitRecordsOn(baseDir)) {
    const unitSide = classifyClosingUnits(unitLib, baseDir, onDefaultBranch, { writing: false, items: itemsNotClosed(itemRecords, ok) });
    out.units = { confirmable: unitSide.ok.map((c) => c.id).sort(byText), ...stillAndStale(unitSide.still, now, byText) };
  }
  return out;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// One *closing* record — an item or a unit — as `listClosing` lists it.
function closingRow(r, now) {
  const req = latestRequest(r.record);
  const t = Date.parse(req?.at);
  const known = Number.isFinite(t);
  return {
    id: r.id,
    path: r.path,
    proof: typeof req?.proof === 'string' ? req.proof : null,
    requestedAt: known ? req.at : null,
    days: known ? Math.floor((now.getTime() - t) / DAY_MS) : null,
    stale: known && now.getTime() - t > STALE_CLOSING_MS,
  };
}

/**
 * Every item deriving *closing*, with when its fix was requested and whether
 * that is more than 14 days before `now` — `confirmCloses`' `stale` test, in
 * read-only form (t4.4, the sweep's closing-too-long advisory). It writes
 * nothing, takes no lock and asks git nothing, so it works on any store,
 * v1 included (read through the converter).
 *
 * `requestedAt` is the latest `close_requested` event's `at`; an item whose
 * request carries no readable date is listed with `days: null` and is never
 * `stale` (nothing is guessed). Broken records are `listRecords`' `broken`.
 *
 * @param {string} baseDir
 * @param {{now?: Date|string, execFn?: Function}} [opts]
 * @returns {{version: 1|2, closing: Array<{id: string, path: string, proof: string|null,
 *   requestedAt: string|null, days: number|null, stale: boolean}>, broken: Array,
 *   units?: Array<{id: string, path: string, proof: string|null, requestedAt: string|null, days: number|null, stale: boolean}>}}
 *   `units`: every unit record reading *closing*, in the same form — present only on a project with unit records
 * @throws {WorkStoreError} CONFIG (store off, or a broken WORK.md), SCHEMA (`now` is not a date)
 */
export function listClosing(baseDir, opts = {}) {
  const now = opts.now === undefined ? new Date() : new Date(opts.now);
  if (Number.isNaN(now.getTime())) throw new WorkStoreError('SCHEMA', `listClosing: now ${JSON.stringify(opts.now)} is not a date`);
  const { version, records, broken } = listRecords(baseDir, opts.execFn ? { execFn: opts.execFn } : {});
  const closing = records.filter((r) => r.status === 'closing').map((r) => closingRow(r, now));
  const out = { version, closing, broken };
  // Units too, on a project with unit records (M6.E16 t5.0c): the same
  // fields, from the unit's latest close request. Without unit records the
  // result has no `units` key. A broken unit record is not listed here;
  // `checkUnits` reports it.
  if (unitRecordsOn(baseDir)) {
    out.units = listUnits(baseDir).units.filter((u) => u.status === 'closing').map((u) => closingRow(u, now));
  }
  return out;
}

// ── Triage proposals, read from records (M6.E13 t7.3 prep) ─────────────────
//
// v1 `work-ops.js` `triageNext`, `listNeedsReview` and `listThemes`, reading
// `listRecords` instead of item files, with the same proposal (`work-triage.js`
// `proposeTriage`, shared, so the arithmetic is one implementation) and the
// same output shape. Readers: no lock, nothing written. They work on a v1
// store too (through the converter), which is how parity is tested.
//
// The v1 shape the proposal and the callers expect: the record's fields, and
// `status` a letter. A *closing* record is passed as `C` — on v1 a fixed close
// with a commit was C, and only the converter reads it as closing — so a
// proposal names the same duplicates and themes on both stores.

const TRIAGE_FILTER_KEYS = ['status', 'type', 'theme', 'priority', 'epic'];

function asV1Item(entry) {
  const { events, ...fields } = entry.record;
  const item = { ...fields, status: entry.status === 'closing' ? 'C' : entry.status };
  const created = events.find((e) => e.type === 'created');
  if (created) item.created = { at: created.at, by: created.by };
  return item;
}

const labelOf = (item) => `${item.id}-${item.type}-${item.status}`;

// Every record, or SCHEMA naming each broken one: a list that silently drops
// an item is the false-clean shape (v1 `listItems` refuses the same way).
function triageRows(baseDir, opts = {}) {
  const { records, broken } = listRecords(baseDir, opts);
  if (broken.length) {
    throw new WorkStoreError('SCHEMA', `cannot list the store — fix these records first:\n${broken.map((b) => `  ${b.error}`).join('\n')}`);
  }
  return records.map((r) => ({ item: asV1Item(r), label: labelOf(asV1Item(r)), path: r.path, epic: r.epic ?? undefined, body: r.body }));
}

function filterRows(rows, filter) {
  for (const key of Object.keys(filter)) {
    if (!TRIAGE_FILTER_KEYS.includes(key)) {
      throw new WorkStoreError('SCHEMA', `listThemes: unknown filter ${JSON.stringify(key)} (filters: ${TRIAGE_FILTER_KEYS.join(', ')})`);
    }
  }
  return rows.filter((row) => {
    if (filter.status !== undefined && row.item.status !== filter.status) return false;
    if (filter.type !== undefined && row.item.type !== filter.type) return false;
    if (filter.theme !== undefined && row.item.theme !== filter.theme) return false;
    if (filter.priority !== undefined && String(row.item.priority) !== String(filter.priority)) return false;
    if (filter.epic !== undefined && row.epic !== filter.epic) return false;
    return true;
  });
}

const createdAtOf = (item) => (typeof item.created?.at === 'string' ? item.created.at : '');

/**
 * The next inbox record to triage, with a proposal — or null when there is
 * none (v1 `work-ops.js` `triageNext`, read from records). Records carrying a
 * `migration_note` come first, then the oldest `created` event, then the
 * lowest number. Read-only.
 *
 * @param {string} baseDir
 * @param {{exclude?: string[], execFn?: Function}} [opts] — `exclude`: IDs already skipped in this run
 * @returns {null | {item: object, body: string, path: string, label: string, proposal: object}}
 *   `item`: the record's fields with `status` (a letter; closing reads `C`) and
 *   `created`; `path`: the record; `body`: its body, `''` when it has none
 * @throws {WorkStoreError} CONFIG (store off), SCHEMA (a broken record, each named)
 */
export function triageNext(baseDir, opts = {}) {
  const exclude = new Set(opts.exclude ?? []);
  const rows = triageRows(baseDir, { bodies: true, ...(opts.execFn ? { execFn: opts.execFn } : {}) });
  const queue = rows
    .filter((r) => r.item.status === 'N' && !exclude.has(r.item.id))
    .sort((a, b) =>
      Number(!a.item.migration_note) - Number(!b.item.migration_note)
      || createdAtOf(a.item).localeCompare(createdAtOf(b.item))
      || numberOf(a.item.id) - numberOf(b.item.id));
  if (queue.length === 0) return null;
  const [next] = queue;
  const body = next.body ?? '';
  return { item: next.item, body, path: next.path, label: next.label, proposal: proposeTriage(next.item, body, rows) };
}

/**
 * Records at T that the migration flagged for a human look (`migration_note`)
 * — v1 `work-ops.js` `listNeedsReview`, read from records. Triage offers them
 * after the inbox; accepting one clears the note (`editItem`). Read-only.
 *
 * @param {string} baseDir
 * @returns {Array<{item: object, label: string, path: string}>} by number
 * @throws {WorkStoreError} CONFIG, SCHEMA
 */
export function listNeedsReview(baseDir) {
  return triageRows(baseDir)
    .filter((r) => r.item.status === 'T' && r.item.migration_note)
    .map(({ item, label, path }) => ({ item, label, path }));
}

/**
 * The distinct theme values in use, with counts — v1 `work-ops.js`
 * `listThemes`, read from records — so a new theme can join an existing one.
 * Read-only.
 *
 * @param {string} baseDir
 * @param {{status?: string, type?: string, theme?: string, priority?: string|number, epic?: string}} [filter]
 *   exact matches; `status` is a letter (a closing record is `C`)
 * @returns {Array<{theme: string, count: number}>} most-used first, then by name
 * @throws {WorkStoreError} CONFIG, SCHEMA (a broken record, or an unknown filter)
 */
export function listThemes(baseDir, filter = {}) {
  const rows = filterRows(triageRows(baseDir), filter);
  const counts = new Map();
  for (const { item } of rows) {
    if (typeof item.theme === 'string' && item.theme.trim() !== '') counts.set(item.theme, (counts.get(item.theme) ?? 0) + 1);
  }
  return [...counts]
    .map(([theme, count]) => ({ theme, count }))
    .sort((a, b) => b.count - a.count || a.theme.localeCompare(b.theme));
}

// ── The v2 store check (t2.7, AC1.3, AC5.2, NFR integrity) ─────────────────
//
// `checkRecords` is v1 `checkStore`'s counterpart for a v2 store, with the
// same finding shape (`{code, id, path, message}`) and the same sync call, so
// the sweep switches between them by store version (t4.4).

/**
 * Check a v2 work store and report every problem by ID. Read-only. One
 * broken record never stops the others (NFR integrity).
 *
 * Codes:
 * - `invalid` — not JSON, or fails the schema (`validateRecord`);
 * - `events` — the history does not fold, or a field disagrees with the last
 *   event that changed it (`checkEvents`);
 * - `path` — outside its bucket (`recordPath`), file name and ID disagree,
 *   another store's key, or not a record name;
 * - `link` — a symlinked record, body, bucket, or `items/` resolving outside
 *   the project; `not-regular` — a folder or other non-file named like a
 *   record or body; `unreadable` — could not be read;
 * - `dup-of-missing`, `dup-of-self`, `dup-of-dup` — a duplicate close's
 *   `dup_of` names no record, itself, or another duplicate (a target that
 *   exists but is broken is reported as broken, not missing);
 * - `duplicate-id` — `findDuplicateIds` (the relocated v1 folder is skipped);
 * - `view-stale` — a view differs from, or is missing against, its in-memory
 *   regeneration, or the regeneration failed; with unit records the views
 *   include `work/EPICS.md` as rendered from them, the current milestone
 *   file's Epic table (M6.E16 t5.4, AC7.4), and the marked Epic table of any
 *   other milestone file that does not match them; or a `work/history/*.md` file
 *   is on disk that no regeneration produces (a reopen, or one made by hand).
 *
 * `opts.regenerateToMemory(baseDir)` is the view generator, injected; by
 * default `work-views.js`'s `regenerateToMemory` (synchronous, as this check
 * is: the sweep calls it synchronously). When a record is broken the views
 * refuse to regenerate, and that is one more `view-stale` finding.
 *
 * A store that is off has no findings (as v1 `checkStore`). A v1 store is one
 * `v1-store` finding and nothing else: this check is for v2 records, and v1
 * `checkStore` is not run.
 *
 * @param {string} baseDir
 * @param {{regenerateToMemory?: (baseDir: string) => (null|Map<string, string>|Object<string, string>)}} [opts]
 * @returns {Array<{code: string, id: string|null, path: string, message: string, paths?: string[]}>}
 *   by ID number, then path; findings with no ID last
 * @throws {WorkStoreError} CONFIG when WORK.md is broken
 */
export function checkRecords(baseDir, opts = {}) {
  const store = readStore(baseDir);
  if (store.version === null) return [];
  if (store.version !== 2) return [{ code: 'v1-store', id: null, path: WORK_FILE_REL, message: V1_STORE_MESSAGE }];

  const findings = [];
  let listed = { records: [], broken: [] };
  try {
    listed = listV2(baseDir, store.key, { strict: true });
  } catch (err) {
    if (!(err instanceof WorkStoreError)) throw err;
    // A `units/` folder that cannot be trusted (`unitRecordsOn`): the one
    // finding, at the folder. No item record was read under it, and the views
    // cannot be rendered to compare — saying that too would be the same fault twice.
    if (err.unitsFolder === true) return [{ code: err.code === 'CONFLICT' ? 'link' : 'unreadable', id: null, path: UNITS_REL, message: err.message }];
    findings.push({ code: err.code === 'CONFLICT' ? 'link' : 'unreadable', id: null, path: ITEMS_REL, message: err.message });
  }
  for (const b of listed.broken) findings.push({ code: b.code ?? 'invalid', id: b.id, path: b.path, message: b.error });

  const byId = new Map(listed.records.map((r) => [r.id, r]));
  const brokenIds = new Set(listed.broken.map((b) => b.id).filter(Boolean));
  for (const r of listed.records) {
    if (!isDup(r.record)) continue;
    const to = r.record.events.findLast((e) => e.type === 'closed').dup_of;
    const at = (code, message) => findings.push({ code, id: r.id, path: r.path, message: `${r.path}: ${message}` });
    if (to === r.id) at('dup-of-self', `${r.id} is closed as a duplicate of itself`);
    else if (byId.has(to)) {
      if (isDup(byId.get(to).record)) at('dup-of-dup', `${r.id} is a duplicate of ${to}, but ${to} is itself a duplicate`);
    } else if (!brokenIds.has(to)) at('dup-of-missing', `${r.id} is a duplicate of ${to}, which has no record`);
  }

  for (const d of findDuplicateIds(baseDir)) {
    findings.push({
      code: 'duplicate-id',
      id: d.id,
      path: d.paths[0],
      paths: d.paths,
      message: `${d.id} is used by ${d.paths.length} files: ${d.paths.join(', ')}`,
    });
  }

  findings.push(...staleViews(baseDir, opts.regenerateToMemory ?? regenerateToMemory));

  return findings.sort((a, b) => {
    if ((a.id === null) !== (b.id === null)) return a.id === null ? 1 : -1;
    const byNum = a.id === null ? 0 : numberOf(a.id) - numberOf(b.id);
    return byNum || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  });
}

const MILESTONE_VIEW_RE = /^\.planning\/MILESTONE-[^/]+\.md$/;

// Every view that differs from its in-memory regeneration, as findings.
function staleViews(baseDir, regenerate) {
  const stale = (path, message) => ({ code: 'view-stale', id: null, path, message: `${path}: ${message}` });
  let views;
  try {
    views = regenerate(baseDir);
  } catch (err) {
    return [stale(`.planning/${WORK_DIR}`, `the views could not be regenerated to compare: ${err?.message ?? err}`)];
  }
  if (views === null || views === undefined) return [];
  const out = [];
  for (const [rel, text] of views instanceof Map ? views : Object.entries(views)) {
    let disk;
    try {
      disk = readFileSync(join(baseDir, rel), 'utf-8');
    } catch (err) {
      out.push(stale(rel, err.code === 'ENOENT' ? 'missing — regenerate the views' : `could not be read (${err.code ?? err.message})`));
      continue;
    }
    if (disk === text) continue;
    // The milestone file is a person's document with one generated region
    // (M6.E16 t5.4, AC7.4): the regeneration is built from the file as it is
    // now, so only the Epic table between its markers can differ.
    if (MILESTONE_VIEW_RE.test(rel)) {
      out.push(stale(rel, 'its Epic table (between the signal:epics markers) differs from a regeneration of the unit records — '
        + 'edited by hand, or not regenerated'));
    } else {
      out.push(stale(rel, 'differs from a regeneration of the records — edited by hand, or not regenerated'));
    }
  }
  // A history file on disk that no regeneration produces (REVIEW pass 1):
  // regeneration never deletes one, so reopening the only item closed in an old
  // year leaves that year's file listing it closed. Only `history/*.md` files,
  // and only in a real folder (a linked one is not listed).
  const produced = new Set(views instanceof Map ? views.keys() : Object.keys(views));
  const histRel = `.planning/${WORK_DIR}/history`;
  const histAbs = join(baseDir, histRel);
  let entries = [];
  try {
    if (lstatSync(histAbs).isDirectory()) entries = readdirSync(histAbs, { withFileTypes: true });
  } catch {
    entries = []; // no history folder: nothing to compare
  }
  for (const e of entries) {
    const rel = `${histRel}/${e.name}`;
    if (!e.isFile() || !e.name.endsWith('.md') || produced.has(rel)) continue;
    out.push(stale(rel, 'no regeneration produces it — no close outside the recent window falls in its year now '
      + '(an item was reopened, or the file was made by hand). Remove it (`git rm`).'));
  }
  return out;
}

// The record fields an `edited` event may change (the schema's `changes`).
const EDITABLE = ['type', 'title', 'theme', 'priority', 'source', 'source_ref', 'legacy_id', 'keep_because', 'migration_note'];

/**
 * Edit record fields: one `edited` event carrying `{field: {from, to}}`;
 * status and Epic unchanged. `to: null` removes the field. A field already
 * holding the new value is left out; if none changes, nothing is written.
 *
 * Record fields only. A body is a plain file beside its record, and editing it
 * is not a library write: no event, no function here (t2.2).
 *
 * Sensitive data: every string value being written.
 *
 * @param {string} baseDir
 * @param {string} id
 * @param {{changes: Object<string, string|number|null>, by: string, at?: string}} edit
 * @param {object} [opts] — as `newItems`'s
 * @returns {Promise<object>} the entry, or `{aborted, sensitiveHits}`
 */
export async function editItem(baseDir, id, edit = {}, opts = {}) {
  const { changes, by, at = nowIso() } = edit;
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes) || Object.keys(changes).length === 0) {
    throw new WorkStoreError('SCHEMA', `${id}: an edit needs changes — {field: new value}. Nothing was written.`);
  }
  const unknown = Object.keys(changes).filter((k) => !EDITABLE.includes(k));
  if (unknown.length) {
    throw new WorkStoreError('SCHEMA', `${id}: ${unknown.join(', ')} cannot be edited — editable fields are `
      + `${EDITABLE.join(', ')}. Nothing was written.`);
  }
  assertWritable(baseDir);
  const pending = sensitivePending(Object.values(changes), opts);
  if (pending) return pending;
  return withWorkLockV2(baseDir, WORK_LOCK_LABEL, opts, async (handle) => {
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
    const out = await writeRecord(handle, withEvent(current, { type: 'edited', at, by, changes: diff }, fields), opts);
    await regenerateAfter(handle, `${id} was edited (${Object.keys(diff).join(', ')})`, opts);
    return out;
  });
}
