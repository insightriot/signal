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
// Read side: t2.1. ID allocation: t2.3.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { WorkStoreError } from './work-errors.js';
import { parseRecord, checkEvents, deriveStatus, epicOf } from './work-record.js';
import { bodyDirFor, convertV1Item } from './work-convert.js';
import { ITEM_ID_RE } from './work-item.js';
import { isStoreOn, isGitRepo, STORE_OFF_MESSAGE, WORK_DIR, WORK_FILE } from './work-store.js';
import { parseFrontmatter } from './state.js';

const ITEMS_DIR = 'items';
const ITEMS_REL = `.planning/${WORK_DIR}/${ITEMS_DIR}`;
const WORK_FILE_REL = `.planning/${WORK_DIR}/${WORK_FILE}`;

// What a v2 write says on a v1 store (AC4.2).
export const V1_STORE_MESSAGE = `${WORK_FILE_REL} has no \`schema_version: 2\`: this is a v1 work store `
  + '(item files in status folders). The v2 library reads it, but does not write to it. Migrate it first: '
  + '`node tools/work-migrate-v2.mjs` (a dry run; `--apply` to write).';

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

// Every file under items/: {records: [{id, rel, abs}], bodies: Map id -> {rel, abs}, broken[]}
function walkItems(baseDir) {
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
      out.broken.push({ id: null, path: bucketRel, error: `${bucketRel} ${LINK_REFUSED}` });
      continue;
    }
    if (!b.isDirectory()) continue;
    for (const f of entriesOf(join(itemsAbs, b.name))) {
      const rel = `${bucketRel}/${f.name}`;
      const isJson = f.name.endsWith('.json');
      const id = idFromName(f.name, '.json') ?? idFromName(f.name, '.md');
      if (f.isSymbolicLink()) {
        if (isJson || id !== null) out.broken.push({ id, path: rel, error: `${rel} ${LINK_REFUSED}` });
        continue;
      }
      if (!f.isFile()) continue;
      if (isJson) {
        if (id === null) {
          out.broken.push({ id: null, path: rel, error: `${rel}: file name is not a record name (KEY-n.json)` });
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

// One record file → an entry, or {broken}. Never throws for content.
function readOne(file, key, body) {
  const fail = (error) => ({ broken: { id: file.id, path: file.rel, error } });
  if (keyOf(file.id) !== key) return fail(`${file.rel}: key ${keyOf(file.id)} is not this store's key (${key})`);
  const expected = recordPath(file.id);
  if (file.rel !== expected) return fail(`${file.rel}: ${file.id} belongs in ${expected.slice(0, expected.lastIndexOf('/'))}`);

  let text;
  try {
    text = readFileSync(file.abs, 'utf-8');
  } catch (err) {
    return fail(`${file.rel}: could not be read (${err.code ?? err.message})`);
  }
  const { record, errors } = parseRecord(text, { path: file.rel });
  if (errors.length > 0) return fail(errors.join('; '));
  if (record.id !== file.id) return fail(`${file.rel}: file name says ${file.id} but the record id is ${record.id}`);
  const eventErrors = checkEvents(record);
  if (eventErrors.length > 0) return fail(`${file.rel}: ${eventErrors.map((e) => e.message).join('; ')}`);

  const entry = { id: file.id, path: file.rel, record, status: deriveStatus(record), epic: epicOf(record) };
  if (body === undefined) return { entry };
  if (body === null) return { entry: { ...entry, body: null } };
  if (body.broken) return { broken: { id: file.id, path: body.broken.path, error: body.broken.error } };
  try {
    return { entry: { ...entry, body: readFileSync(body.abs, 'utf-8') } };
  } catch (err) {
    return fail(`${body.rel}: could not be read (${err.code ?? err.message})`);
  }
}

function listV2(baseDir, key, opts) {
  const walked = walkItems(baseDir);
  const broken = [...walked.broken];
  const brokenBody = new Map(broken.filter((b) => b.id && b.path.endsWith('.md')).map((b) => [b.id, b]));
  const records = [];
  for (const file of walked.records) {
    let body;
    if (opts.bodies) {
      if (brokenBody.has(file.id)) body = { broken: brokenBody.get(file.id) };
      else body = walked.bodies.get(file.id) ?? null;
    }
    const r = readOne(file, key, body);
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
      { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
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
 * body, when bodies are read — is a symbolic link.
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
  const r = readOne({ id, rel, abs: join(baseDir, rel) }, key, body);
  return r.entry ? { records: [r.entry], broken: [] } : { records: [], broken: [r.broken] };
}
