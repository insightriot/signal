// The v1 → v2 work-store migration (M6.E13.S7.t7.1a, AC8.1–AC8.3).
//
// PLAN Decision 10: a maintainer script, not a command. The entry point is
// `node tools/work-migrate-v2.mjs [--apply] [--out DIR]` (repo-root, not
// shipped), which the v1 refusal message (`work-records.js` V1_STORE_MESSAGE)
// names. This module is its logic.
//
// What one run does, in order:
//
//   1. Senses the store: off and v2 are refused (CONFIG). Only v1 migrates.
//   2. Converts the store AS IT IS NOW — every `KEY-n.md` under
//      `work/{inbox,backlog,epics,done}/` and `archive/epics/` — through the
//      pure `convertV1Item`, with the date of each file's first commit as its
//      `fallbackAt` (the t1.5 run, `tools/work-convert-dryrun.mjs`).
//   3. Verifies the conversion (`verifyConversion`): every v1 file is exactly
//      one record; every v1 field is mapped or dropped; every close has a form;
//      every removed cell and status line is gone from the body; every
//      rewritten link reaches the same target. Any error stops the run before
//      anything is written.
//   4. Builds a v2 project ASIDE, in `outDir` (default: a fresh directory under
//      `os.tmpdir()`, never inside the project): a copy of `.planning/` with the
//      store swapped in — records and bodies under `work/items/NN/`, the v1
//      item files relocated to `archive/pre-work-store-v2/` (relative paths
//      kept; item files only, never an Epic folder or its documents), `WORK.md`
//      at `schema_version: 2`, the views regenerated. Then `listRecords` and
//      `checkRecords` must be clean over it.
//   5. Probes, read-only, which close requests `confirmCloses` would confirm
//      against the SOURCE repo's `refs/remotes/origin/<default>` (local refs,
//      no fetch), and records the ref and its sha.
//   6. Writes `outDir/manifest.json`.
//
// `apply: true` does all of that first, then the same build (step 4) on the
// project itself under the work lock, then `confirmCloses` (which writes the
// `closed` events), then `checkRecords`. It refuses outside a git repository
// and on a dirty working tree, so the cutover is one reviewable diff.
//
// Nothing here imports a Markdown list parser (`legacy-lists.js`).

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve, sep, isAbsolute } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { acquireLock } from './file-lock.js';
import { resolveDefaultBranch } from './branch-guard.js';
import { bodyDirFor, convertV1Item } from './work-convert.js';
import { WorkStoreError, lockFailure } from './work-errors.js';
import { ITEM_ID_RE, parseItem } from './work-item.js';
import { serializeRecord } from './work-record.js';
import {
  RELOCATED_V1_REL,
  bodyPath,
  checkRecords,
  confirmCloses,
  listRecords,
  probeCloses,
  recordPath,
  storeVersion,
} from './work-records.js';
import { isGitRepo, isStoreOn, WORK_LOCK_REL, WORK_LOCK_TTL_MS } from './work-store.js';
import { regenerateViews } from './work-views.js';

const toPosix = (p) => p.split(sep).join('/');
const numberOf = (id) => Number(id.slice(id.lastIndexOf('-') + 1));

// Where v1 items live, relative to `.planning/` (`work-store.js` placement).
const V1_DIRS = ['work/inbox', 'work/backlog', 'work/epics', 'work/done', 'archive/epics'];
// v1 frontmatter keys the converter drops because they become events.
const EVENT_FIELDS = new Set(['status', 'created', 'close', 'history']);
const LINK_TARGET_RE = /\]\(([^)]+)\)/g;

function walk(dir, out, accept) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) walk(abs, out, accept);
    else if (e.isFile() && accept(e.name)) out.push(abs);
  }
}

/**
 * Every v1 item file of the store, as paths relative to `.planning/`, sorted.
 * An item file is `KEY-n.md` (this store's key) in a v1 item folder.
 *
 * @param {string} baseDir
 * @param {string} key
 * @returns {string[]}
 */
export function listV1Items(baseDir, key) {
  const planning = join(baseDir, '.planning');
  const accept = (name) => {
    if (!name.endsWith('.md')) return false;
    const id = name.slice(0, -'.md'.length);
    return ITEM_ID_RE.test(id) && id.slice(0, id.lastIndexOf('-')) === key;
  };
  const found = [];
  for (const sub of V1_DIRS) walk(join(planning, sub), found, accept);
  return found.map((abs) => toPosix(relative(planning, abs))).sort();
}

// The date (YYYY-MM-DD) of the first commit that added each `KEY-n.md` under
// `.planning/`, keyed by file name — one `git log`, earliest date wins (the
// t1.5 approach). Empty outside a repo or when git fails.
function firstAddedDates(baseDir, key, execFn) {
  const dates = new Map();
  if (!isGitRepo(baseDir, execFn)) return dates;
  let out;
  try {
    out = String(execFn(
      'git',
      ['log', '--all', '--no-renames', '--diff-filter=A', '--date=short', '--format=%x00%ad', '--name-only', '--',
        `:(glob).planning/**/${key}-*.md`],
      { cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
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

/**
 * Convert every v1 item of the store, in memory. Each result is
 * `{relPath, text, record, body, manifest, fallbackAt}` (`relPath` relative to
 * `.planning/`). Nothing is written.
 *
 * @param {string} baseDir
 * @param {{execFn?: Function}} [opts]
 * @returns {Array<object>}
 * @throws {WorkStoreError} CONFIG when the store is off or WORK.md is broken
 */
export function convertStore(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const store = isStoreOn(baseDir);
  if (!store.on) throw new WorkStoreError('CONFIG', 'this project has no work store (.planning/work/WORK.md): nothing to migrate.');
  const dates = firstAddedDates(baseDir, store.key, execFn);
  return listV1Items(baseDir, store.key).map((relPath) => {
    const text = readFileSync(join(baseDir, '.planning', relPath), 'utf-8');
    const fallbackAt = dates.get(relPath.split('/').at(-1));
    const { record, body, manifest } = convertV1Item({ relPath, text, ...(fallbackAt ? { fallbackAt } : {}) });
    return { relPath, text, record, body, manifest, fallbackAt: fallbackAt ?? null };
  });
}

const dirOf = (relPath) => relPath.split('/').slice(0, -1).join('/');
const pathPart = (target) => {
  const t = target.trim().split(/\s+/)[0];
  const cut = t.search(/[#?]/);
  return cut === -1 ? t : t.slice(0, cut);
};
const SKIP_TARGET_RE = /^(?:[a-z][a-z0-9+.-]*:|#|\/|<|~)/i;
// Every relative link target of `body`, as a `.planning/`-relative path seen from `dir`.
function relativeTargets(body, dir) {
  return [...body.matchAll(LINK_TARGET_RE)]
    .map((m) => pathPart(m[1]))
    .filter((p) => p && !SKIP_TARGET_RE.test(p))
    .map((p) => posix.normalize(posix.join(dir || '.', p)));
}

/**
 * Check a conversion before anything is written (AC8.1, AC8.3). Re-derives
 * each claim from the v1 text and the produced body, rather than trusting the
 * converter's own manifest:
 *
 * - every v1 file converted, with no error, to a record whose ID is its file
 *   name, and no ID is used by two files;
 * - every v1 frontmatter field is listed as mapped or dropped, and every
 *   carried field kept its value;
 * - a v1 item in status C has a close form, and no other item has one;
 * - every removed table row and `**Status:**` line is absent from the body;
 * - every rewritten link is in the body and reaches the same target from the
 *   body's new folder as it did from the v1 folder.
 *
 * - with `opts.exists`, every relative link of the v1 body that reached an
 *   existing file reaches the same `.planning/`-relative path from the new body.
 *
 * @param {Array<object>} results — `convertStore`'s
 * @param {{exists?: (planningRel: string) => boolean}} [opts]
 * @returns {{errors: string[]}}
 */
export function verifyConversion(results, opts = {}) {
  const errors = [];
  const byId = new Map();
  for (const r of results) {
    const fileId = r.relPath.split('/').at(-1).slice(0, -'.md'.length);
    if (!byId.has(fileId)) byId.set(fileId, []);
    byId.get(fileId).push(r.relPath);
    const at = (msg) => errors.push(`${fileId} (${r.relPath}): ${msg}`);
    if (r.manifest.errors.length > 0 || !r.record) {
      at(`did not convert — ${r.manifest.errors.join('; ') || 'no record'}`);
      continue;
    }
    if (r.record.id !== fileId) at(`record ID ${r.record.id} is not the file name`);

    const { item, body: v1Body } = parseItem(r.text, { path: r.relPath });
    const mapped = new Set(r.manifest.fieldsMapped.map((f) => f.from));
    const dropped = new Set(r.manifest.fieldsDropped);
    for (const key of Object.keys(item)) {
      if (!mapped.has(key) && !dropped.has(key)) at(`v1 field ${key} is neither mapped nor dropped`);
      if (EVENT_FIELDS.has(key)) continue;
      if (key === 'migration_note') {
        if (!String(r.record.migration_note ?? '').startsWith(item.migration_note)) at('migration_note lost its v1 text');
      } else if (JSON.stringify(r.record[key]) !== JSON.stringify(item[key])) {
        at(`field ${key} changed value`);
      }
    }

    const closed = item.status === 'C';
    if (closed && !r.manifest.closeForm) at('closed in v1, but no close form was recorded');
    if (!closed && r.manifest.closeForm) at(`not closed in v1, but has close form ${r.manifest.closeForm}`);

    const v1Lines = v1Body.split('\n');
    const bodyLines = new Set(r.body.split('\n'));
    for (const line of new Set(r.manifest.cellsRemoved.map((c) => c.line))) {
      if (bodyLines.has(v1Lines[line - 1])) at(`table row at v1 body line ${line} is still in the body`);
    }
    for (const s of r.manifest.statusLinesRemoved) {
      if ([...bodyLines].some((l) => l.startsWith(s.text))) at(`status line "${s.text}" is still in the body`);
    }
    const from = dirOf(r.relPath);
    const to = bodyDirFor(r.record.id);
    const targets = new Set([...r.body.matchAll(LINK_TARGET_RE)].map((m) => m[1]));
    for (const l of r.manifest.linksRewritten) {
      const before = posix.normalize(posix.join(from || '.', pathPart(l.from)));
      const after = posix.normalize(posix.join(to, pathPart(l.to)));
      if (before !== after) at(`link ${l.from} → ${l.to} no longer reaches ${before}`);
      if (![...targets].some((t) => t === l.to || t.startsWith(`${l.to} `))) at(`rewritten link ${l.to} is not in the body`);
    }
    // The strong form: every relative link that reached a file from the v1
    // folder reaches the same path from the body's new folder.
    if (opts.exists) {
      const reached = new Set(relativeTargets(r.body, to));
      for (const p of relativeTargets(v1Body, from)) {
        if (opts.exists(p) && !reached.has(p)) at(`link to ${p} resolved from the v1 file and does not from the new body`);
      }
    }
  }
  for (const [id, paths] of byId) {
    if (paths.length > 1) errors.push(`${id} is used by ${paths.length} files: ${paths.join(', ')}`);
  }
  return { errors };
}

// ── The manifest ────────────────────────────────────────────────────────────

const lastClose = (record) => record.events.findLast((e) => e.type === 'closed' || e.type === 'close_requested');

function nonLegacyEntry(r) {
  const form = r.manifest.closeForm;
  const e = lastClose(r.record);
  if (form === 'close_requested') return { id: r.record.id, form, proof: e.proof };
  if (form === 'dup') return { id: r.record.id, form, dup_of: e.dup_of };
  return { id: r.record.id, form, reason: e.reason };
}

function summarize(results) {
  const closeForms = {};
  let cellsRemoved = 0;
  let statusLinesRemoved = 0;
  let linksRewritten = 0;
  let createdFromFallback = 0;
  for (const r of results) {
    const m = r.manifest;
    if (m.closeForm) closeForms[m.closeForm] = (closeForms[m.closeForm] ?? 0) + 1;
    cellsRemoved += m.cellsRemoved.length;
    statusLinesRemoved += m.statusLinesRemoved.length;
    linksRewritten += m.linksRewritten.length;
    if (m.fieldsMapped.some((f) => f.from === 'fallbackAt')) createdFromFallback += 1;
  }
  return {
    v1Files: results.length,
    records: results.filter((r) => r.record).length,
    errors: results.filter((r) => r.manifest.errors.length > 0 || !r.record).length,
    closeForms,
    legacyCloses: (closeForms.legacy ?? 0) + (closeForms['legacy-no-commit'] ?? 0),
    cellsRemoved,
    statusLinesRemoved,
    linksRewritten,
    createdFromFallback,
  };
}

// ── Building the v2 store into a project (the aside copy, or the project) ───

function setSchemaVersion2(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new WorkStoreError('CONFIG', '.planning/work/WORK.md has no frontmatter block to set schema_version in.');
  const lines = m[1].split('\n').filter((l) => !/^schema_version\s*:/.test(l));
  const keyAt = lines.findIndex((l) => /^key\s*:/.test(l));
  lines.splice(keyAt + 1, 0, 'schema_version: 2');
  return `---\n${lines.join('\n')}\n---\n${text.slice(m[0].length)}`;
}

// Relocate each v1 item file (never a folder), write each record and body, and
// set WORK.md to v2. Views are the caller's: they need the store to read v2.
async function buildInto(target, results) {
  const planning = join(target, '.planning');
  for (const r of results) {
    const dest = join(target, RELOCATED_V1_REL, r.relPath);
    mkdirSync(dirname(dest), { recursive: true });
    renameSync(join(planning, r.relPath), dest);
  }
  for (const r of results) {
    const rec = join(target, recordPath(r.record.id));
    mkdirSync(dirname(rec), { recursive: true });
    await atomicWrite(rec, serializeRecord(r.record));
    await atomicWrite(join(target, bodyPath(r.record.id)), r.body);
  }
  const workMd = join(planning, 'work', 'WORK.md');
  await atomicWrite(workMd, setSchemaVersion2(readFileSync(workMd, 'utf-8')));
}

// A run of git against the SOURCE repo, whatever cwd the caller passed — so
// the aside copy (no `.git`) is probed against the real `origin/<default>`.
const inRepo = (repo, execFn) => (cmd, args, o = {}) => execFn(cmd, args, { ...o, cwd: repo });

function originRef(baseDir, execFn) {
  if (!isGitRepo(baseDir, execFn)) return { ref: null, sha: null };
  const branch = resolveDefaultBranch(baseDir, { execFn });
  if (branch === null) return { ref: null, sha: null };
  const ref = `refs/remotes/origin/${branch}`;
  try {
    const sha = String(execFn('git', ['rev-parse', '--verify', '--quiet', ref], {
      cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })).trim();
    return { ref, sha };
  } catch {
    return { ref, sha: null };
  }
}

function headSha(baseDir, execFn) {
  try {
    return String(execFn('git', ['rev-parse', 'HEAD'], { cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
  } catch {
    return null;
  }
}

function insideOf(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

// The real path of `p`, or of its nearest existing ancestor joined with the rest.
function realish(p) {
  const abs = resolve(p);
  let head = abs;
  const tail = [];
  while (!existsSync(head)) {
    tail.unshift(head.slice(dirname(head).length + 1));
    const up = dirname(head);
    if (up === head) break;
    head = up;
  }
  return join(realpathSync(head), ...tail);
}

function postBuildErrors(target, count) {
  const errors = [];
  const listed = listRecords(target);
  if (listed.version !== 2) errors.push(`the built store reads as v${listed.version}, not v2`);
  if (listed.records.length !== count) errors.push(`the built store holds ${listed.records.length} records, not ${count}`);
  for (const b of listed.broken) errors.push(`built record ${b.id ?? b.path} is broken: ${b.error}`);
  for (const f of checkRecords(target)) errors.push(`checkRecords ${f.code}${f.id ? ` ${f.id}` : ''}: ${f.message}`);
  return errors;
}

/**
 * Migrate a v1 work store to v2 records. Dry run by default (nothing in the
 * project changes); see the module comment for every step.
 *
 * @param {string} baseDir — the project root
 * @param {{apply?: boolean, outDir?: string, now?: Date|string, execFn?: Function}} [opts]
 *   `outDir`: where the v2 project is built aside and `manifest.json` written
 *   (default: a new directory under `os.tmpdir()`); refused inside the project
 *   or when it already holds a `.planning/`. `now`: the clock for the probe and
 *   for the `closed` events `confirmCloses` writes at apply.
 * @returns {Promise<{mode: 'dry-run'|'apply', outDir: string, manifest: object}>}
 * @throws {WorkStoreError} CONFIG (no store, already v2, outDir, not a repo or
 *   dirty at apply), SCHEMA (the conversion or the built store failed
 *   verification — nothing is written to the project), LOCKED
 */
export async function migrateWorkStoreV2(baseDir, opts = {}) {
  const apply = opts.apply === true;
  const execFn = opts.execFn ?? execFileSync;
  const now = opts.now === undefined ? new Date() : new Date(opts.now);

  const version = storeVersion(baseDir);
  if (version === null) throw new WorkStoreError('CONFIG', 'this project has no work store (.planning/work/WORK.md): nothing to migrate.');
  if (version === 2) throw new WorkStoreError('CONFIG', '.planning/work/WORK.md already reads schema_version: 2 — this store is already v2.');

  if (apply) {
    if (!isGitRepo(baseDir, execFn)) throw new WorkStoreError('CONFIG', '--apply needs a git repository (the cutover is one reviewable commit, and confirmCloses asks git).');
    const dirty = String(execFn('git', ['status', '--porcelain'], { cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
    if (dirty !== '') {
      throw new WorkStoreError('CONFIG', `--apply refuses a dirty working tree (uncommitted changes): commit or move them first.\n${dirty}`);
    }
  }

  const outDir = resolve(opts.outDir ?? mkdtempSync(join(tmpdir(), 'signal-work-v2-')));
  if (insideOf(realpathSync(baseDir), realish(outDir))) {
    throw new WorkStoreError('CONFIG', `outDir ${outDir} is inside the project — the v2 store is built aside, outside it.`);
  }
  if (existsSync(join(outDir, '.planning'))) {
    throw new WorkStoreError('CONFIG', `outDir ${outDir} already holds a .planning/ — choose an empty directory.`);
  }

  const results = convertStore(baseDir, { execFn });
  const verification = verifyConversion(results, { exists: (p) => existsSync(join(baseDir, '.planning', p)) });
  if (verification.errors.length > 0) {
    throw new WorkStoreError('SCHEMA', `the conversion did not verify; nothing was written:\n  ${verification.errors.join('\n  ')}`);
  }

  // Build aside: a copy of .planning/ with the store swapped in.
  mkdirSync(outDir, { recursive: true });
  cpSync(join(baseDir, '.planning'), join(outDir, '.planning'), {
    recursive: true,
    filter: (src) => !src.endsWith(`${sep}.lock`),
  });
  await buildInto(outDir, results);
  await regenerateViews(outDir);
  verification.errors.push(...postBuildErrors(outDir, results.length));

  const requested = results
    .filter((r) => r.manifest.closeForm === 'close_requested')
    .map((r) => r.record.id)
    .sort((a, b) => numberOf(a) - numberOf(b));
  const sourceGit = inRepo(baseDir, execFn);
  const probe = { ...originRef(baseDir, execFn), ...probeCloses(outDir, { now, execFn: sourceGit }) };

  const manifest = {
    migration: 'work store v1 → v2 (M6.E13 t7.1a)',
    mode: apply ? 'apply' : 'dry-run',
    source: { head: headSha(baseDir, execFn) },
    summary: summarize(results),
    nonLegacyCloses: results
      .filter((r) => r.manifest.closeForm && r.manifest.closeForm !== 'legacy')
      .sort((a, b) => numberOf(a.record.id) - numberOf(b.record.id))
      .map(nonLegacyEntry),
    closes: { requested, probe, confirmed: null, stillClosing: null },
    verification,
    items: results.map((r) => ({
      ...r.manifest,
      record: recordPath(r.record.id),
      relocatedTo: `${RELOCATED_V1_REL}/${r.relPath}`,
      fallbackAt: r.fallbackAt,
    })),
  };

  const writeManifest = () => writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  if (verification.errors.length > 0) {
    writeManifest();
    throw new WorkStoreError('SCHEMA', `the built store did not verify (${outDir}); the project was not changed:\n  ${verification.errors.join('\n  ')}`);
  }

  if (apply) {
    let lock;
    try {
      lock = await acquireLock(join(baseDir, WORK_LOCK_REL), { label: 'work store migration', ttlMs: WORK_LOCK_TTL_MS });
    } catch (err) {
      throw lockFailure(err);
    }
    try {
      await buildInto(baseDir, results);
      await regenerateViews(baseDir);
    } finally {
      await lock.released();
    }
    const done = await confirmCloses(baseDir, { now, execFn });
    manifest.closes.confirmed = done.confirmed;
    manifest.closes.stillClosing = done.stillClosing;
    const after = postBuildErrors(baseDir, results.length);
    if (after.length > 0) {
      manifest.verification.errors.push(...after);
      writeManifest();
      throw new WorkStoreError('SCHEMA', `the migrated store did not verify — review with git diff:\n  ${after.join('\n  ')}`);
    }
  }

  writeManifest();
  return { mode: manifest.mode, outDir, manifest };
}
