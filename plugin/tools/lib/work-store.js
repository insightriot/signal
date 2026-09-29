// The work store — folders of item files under `.planning/work/` (M6.E11, FR-1, FR-3, FR-4).
//
//   .planning/work/
//     WORK.md                  frontmatter `key:` — the opt-in switch (D-M6E11-3)
//     inbox/     SIG-n.md      status N
//     backlog/   SIG-n.md      status T
//     epics/<EpicID>/SIG-n.md  status Q | P | C, beside the Epic's own artifacts
//     done/YYYY-MM/SIG-n.md    status C
//
// ── Opt-in by presence, and no silent fallback ──────────────────────────────
//
// A project without `WORK.md` gets byte-identical behaviour to before this
// Epic (the `M4.5.E11` linear-mode pattern). A project WITH `WORK.md` but a
// broken key is the dangerous case: falling back to the legacy files would
// write captures into `BUGS.md`/`BACKLOG.md` — files that are generated when
// the store is on, so the next regeneration would erase them. So a broken
// `WORK.md` throws; it never reads as "off".
//
// The key lives here and not in `PROFILE.md` (D-M6E11-3): an Epic-scoped
// `{EpicID}-PROFILE.md` shadows the project profile and `--re-calibrate`
// rewrites it, and neither should be able to drop the key.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

import { parseFrontmatter, StateSchemaError, EPIC_ID_STRICT_RE } from './state.js';
import { ITEM_ID_RE, parseItem, WorkStoreError } from './work-item.js';

export const WORK_DIR = 'work';
export const WORK_FILE = 'WORK.md';
export const FOLDERS = Object.freeze({ inbox: 'inbox', backlog: 'backlog', epics: 'epics', done: 'done' });

// How long the store's `work` lock (`.planning/work/.lock`) stays live
// (M6.E11 REVIEW I4). A mutation reads all of git history and regenerates
// every list under it, which can outlast file-lock's 5 s default. Staleness is
// judged by whoever tries to TAKE the lock, so every taker of that path uses
// this one value — a taker with a shorter one would steal a live lock.
export const WORK_LOCK_TTL_MS = 120_000;

// Same shape as the key half of ITEM_ID_RE — they must not drift apart.
export const STORE_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

const WORK_FILE_REL = `.planning/${WORK_DIR}/${WORK_FILE}`;
const KEY_FIX = 'Put `key: SIG` (2–10 characters: an uppercase letter, then uppercase letters or digits) '
  + `in the frontmatter of ${WORK_FILE_REL}, or delete ${WORK_FILE_REL} to turn the store off.`;

function configError(problem) {
  return new WorkStoreError('CONFIG', `${WORK_FILE_REL}: ${problem}. ${KEY_FIX}`);
}

/**
 * Is the work store on for this project?
 *
 * @param {string} baseDir — project root (the directory holding `.planning/`)
 * @returns {{on: false} | {on: true, key: string}}
 * @throws {WorkStoreError} code CONFIG when WORK.md exists but has no valid key
 */
export function isStoreOn(baseDir) {
  const path = join(baseDir, '.planning', WORK_DIR, WORK_FILE);
  if (!existsSync(path)) return { on: false };

  let data;
  try {
    ({ data } = parseFrontmatter(readFileSync(path, 'utf-8')));
  } catch (err) {
    if (!(err instanceof StateSchemaError)) throw err;
    throw configError(`frontmatter is not valid (${err.message.replace(/^STATE\.md frontmatter\s*/, '')})`);
  }
  if (data === null) throw configError('has no YAML frontmatter');
  if (data.key === undefined || data.key === null) throw configError('has no `key` in its frontmatter');
  // Under the YAML core schema `key: 123` is a number, so check the type
  // before the pattern — String(123) would pass a looser test.
  if (typeof data.key !== 'string' || !STORE_KEY_RE.test(data.key)) {
    throw configError(`key ${JSON.stringify(data.key)} is not a valid store key`);
  }
  return { on: true, key: data.key };
}

// ── ID allocation (FR-4, D-M6E11-10, D-M6E11-26) ────────────────────────────
//
// Next number = one past the highest number this machine has ever seen for
// the project's key: in the working tree (uncommitted captures count), and in
// git history across every ref. Reading history rather than only each branch
// tip is what makes "never reused" hold for deleted and renamed files too —
// an ID whose file was removed is still in `git log`. 0.04 s on this repo.
//
// A shallow clone's history is truncated, so `git log` would under-count; it
// falls back to listing each ref's tree (`git ls-tree`, 0.66 s over 61 refs)
// and reports `basis: 'ls-tree'`. Outside a git repo only the working tree can
// be read, reported as `basis: 'worktree-only'`. The basis is on the result so
// a caller can say how far the answer reaches instead of implying it is global.
//
// No network, ever: fetched remote-tracking refs are read, nothing is fetched.

// Paths whose filenames carry item IDs. `archive/` rather than only
// `archive/epics/` in the git read: it costs nothing and covers any later
// archive layout. The working-tree read is the two places items live.
const ID_GIT_PATHS = ['.planning/work/', '.planning/archive/'];
const ID_TREE_DIRS = [join('.planning', WORK_DIR), join('.planning', 'archive', 'epics')];

// Generous: `git log --name-only` over a long history is large, and a
// truncated read would under-count silently.
const GIT_MAX_BUFFER = 256 * 1024 * 1024;

function runGit(baseDir, args, execFn) {
  return String(
    execFn('git', args, {
      cwd: baseDir,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: GIT_MAX_BUFFER,
    })
  );
}

// Split an item file name into its key and number, or null when the name is
// not `{ID}.md`. Derived from ITEM_ID_RE rather than a second regex, so the
// ID shape has exactly one definition.
export function parseItemFileName(name) {
  if (!name.endsWith('.md')) return null;
  const id = name.slice(0, -'.md'.length);
  if (!ITEM_ID_RE.test(id)) return null;
  const dash = id.indexOf('-');
  return { id, key: id.slice(0, dash), n: Number(id.slice(dash + 1)) };
}

function maxFromNames(names, key) {
  let max = 0;
  for (const name of names) {
    const parsed = parseItemFileName(basename(name.trim()));
    if (parsed && parsed.key === key) max = Math.max(max, parsed.n);
  }
  return max;
}

// Recursive walk that does not follow symlinks: a Dirent for a symlink is
// neither a file nor a directory here, so a link pointing outside the store
// cannot pull foreign files into the count (or into checkStore).
export function walkFiles(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return out;
    throw err;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

export function isGitRepo(baseDir, execFn = execFileSync) {
  try {
    return runGit(baseDir, ['rev-parse', '--is-inside-work-tree'], execFn).trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * Allocate the next item ID. Reads only; creating the file is the caller's job.
 *
 * Paths from git are repo-root-relative while the pathspecs are relative to
 * `baseDir`; only basenames are used, so the two agree whenever `baseDir` is
 * the repo root — which it is for every Signal project.
 *
 * @param {string} baseDir
 * @param {{execFn?: Function}} [opts]
 * @returns {{id: string, basis: 'git-log'|'ls-tree'|'worktree-only'}}
 * @throws {WorkStoreError} CONFIG when the store is off or misconfigured
 */
export function nextId(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const store = isStoreOn(baseDir);
  if (!store.on) {
    throw new WorkStoreError('CONFIG', `The work store is off: ${WORK_FILE_REL} does not exist. `
      + `Create it with \`key: SIG\` in its frontmatter to turn the store on.`);
  }
  let max = 0;
  for (const rel of ID_TREE_DIRS) max = Math.max(max, maxFromNames(walkFiles(join(baseDir, rel)), store.key));

  // Only "this is not a git repo" may produce the worktree-only answer. A git
  // failure inside a repo throws: a silent fallback would hand out an ID that
  // another branch already holds, which is the failure this function exists
  // to prevent.
  if (!isGitRepo(baseDir, execFn)) return { id: `${store.key}-${max + 1}`, basis: 'worktree-only' };

  try {
    // An empty repo has no HEAD; asking git log for it would fail. Skip it
    // rather than degrade the basis — the repo is still read.
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
        execFn
      );
      max = Math.max(max, maxFromNames(out.split('\n').filter(Boolean), store.key));
      return { id: `${store.key}-${max + 1}`, basis: 'git-log' };
    }

    const refs = runGit(baseDir, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'], execFn)
      .split('\n')
      .filter(Boolean);
    if (hasHead) refs.push('HEAD');
    for (const ref of refs) {
      const out = runGit(baseDir, ['ls-tree', '-r', '--name-only', ref, '--', ...ID_GIT_PATHS], execFn);
      max = Math.max(max, maxFromNames(out.split('\n').filter(Boolean), store.key));
    }
    return { id: `${store.key}-${max + 1}`, basis: 'ls-tree' };
  } catch (err) {
    throw new Error(`nextId: could not read git history in ${baseDir}: ${err.message}`);
  }
}

// ── Consistency check (FR-3, D-M6E11-8) ─────────────────────────────────────
//
// Status lives in the frontmatter AND in the folder, which is two places — the
// shape this Epic exists to remove — so this check is what keeps them one fact.
// It is the DeepSeek header-vs-folder gate (RESEARCH §4): the path is the fast
// read, the header is the truth, and any disagreement is a finding rather than
// something a reader silently resolves.
//
// Scope: `.planning/work/` and `.planning/archive/epics/`. The archive is read
// because a duplicate ID between a live item and an archived one is still a
// duplicate — `nextId` reads the archive for the same reason.

const DONE_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

const ALLOWED = {
  inbox: ['N'],
  backlog: ['T'],
  epics: ['Q', 'P', 'C'], // an Epic's items close in its folder (D-M6E11-29)
  done: ['C'],
  archive: ['C'],
};

// Where an item file sits, as far as the folder rules are concerned.
// Returns {folder, allowed} or {problem} when no folder rule can apply.
function placement(parts) {
  // parts: path segments below .planning/, ending in the file name.
  if (parts[0] === 'archive') {
    // archive/epics/<EpicID>/<file>
    if (parts.length !== 4 || !EPIC_ID_STRICT_RE.test(parts[2])) {
      return { problem: 'is not in an archived Epic folder (archive/epics/<EpicID>/)' };
    }
    return { folder: `archive/epics/${parts[2]}`, allowed: ALLOWED.archive };
  }
  const [, top, ...rest] = parts; // parts[0] === WORK_DIR
  if (rest.length === 0) return { problem: 'is not in a status folder (inbox/, backlog/, epics/<EpicID>/, done/YYYY-MM/)' };
  if (top === FOLDERS.inbox || top === FOLDERS.backlog) {
    if (rest.length !== 1) return { problem: `is nested below ${top}/; items sit directly in their folder` };
    return { folder: top, allowed: ALLOWED[top] };
  }
  if (top === FOLDERS.epics) {
    if (rest.length !== 2) return { problem: 'must sit directly in an Epic folder (epics/<EpicID>/)' };
    if (!EPIC_ID_STRICT_RE.test(rest[0])) return { problem: `is in epics/${rest[0]}/, which is not an Epic ID folder` };
    return { folder: `epics/${rest[0]}`, allowed: ALLOWED.epics };
  }
  if (top === FOLDERS.done) {
    if (rest.length !== 2 || !DONE_MONTH_RE.test(rest[0])) {
      return { problem: 'must sit in a done/YYYY-MM/ folder' };
    }
    return { folder: `done/${rest[0]}`, allowed: ALLOWED.done };
  }
  return { problem: `is in ${top}/, which is not a status folder (inbox/, backlog/, epics/<EpicID>/, done/YYYY-MM/)` };
}

/**
 * Report every way the store disagrees with itself. Reads only.
 *
 * Finding codes:
 *   status-folder  the item's status is not allowed in its folder, or the file
 *                  sits where no folder rule applies
 *   duplicate-id   two or more files carry the same ID (`paths` names all)
 *   schema         a frontmatter violation, one finding per violation
 *   filename-id    the file name and the frontmatter `id` disagree
 *
 * @param {string} baseDir
 * @returns {Array<{code: string, id: string, path?: string, paths?: string[], message: string}>}
 *   `[]` when the store is off
 * @throws {WorkStoreError} CONFIG when WORK.md exists but is broken
 */
export function checkStore(baseDir) {
  const store = isStoreOn(baseDir);
  if (!store.on) return [];

  const planning = join(baseDir, '.planning');
  const files = [
    ...walkFiles(join(planning, WORK_DIR)),
    ...walkFiles(join(planning, 'archive', 'epics')),
  ].sort();

  const findings = [];
  const byId = new Map();

  for (const abs of files) {
    // Any key is an item file here, so one carrying another project's key is
    // reported instead of being invisible; the project's key is checked below.
    const parsedName = parseItemFileName(basename(abs));
    if (!parsedName) continue; // WORK.md, WATCHLIST.md, an Epic's own artifacts
    const { id } = parsedName;
    const path = relative(baseDir, abs).split(sep).join('/');

    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(path);

    if (parsedName.key !== store.key) {
      findings.push({
        code: 'schema',
        id,
        path,
        message: `${path}: key ${parsedName.key} is not this store's key (${store.key})`,
      });
      continue;
    }

    const { item, errors } = parseItem(readFileSync(abs, 'utf-8'), { path });
    for (const message of errors) findings.push({ code: 'schema', id, path, message });
    if (item === null) continue;

    if (typeof item.id === 'string' && item.id !== id) {
      findings.push({
        code: 'filename-id',
        id,
        path,
        message: `${path}: file name says ${id} but the frontmatter id is ${item.id}`,
      });
    }

    const where = placement(relative(planning, abs).split(sep));
    if (where.problem) {
      findings.push({ code: 'status-folder', id, path, message: `${path} ${where.problem}` });
    } else if (!where.allowed.includes(item.status)) {
      findings.push({
        code: 'status-folder',
        id,
        path,
        message: `${path}: status ${JSON.stringify(item.status)} does not belong in ${where.folder}/ `
          + `(allowed: ${where.allowed.join(', ')})`,
      });
    }
  }

  for (const [id, paths] of byId) {
    if (paths.length > 1) {
      findings.push({
        code: 'duplicate-id',
        id,
        paths,
        message: `${id} is used by ${paths.length} files: ${paths.join(', ')}`,
      });
    }
  }

  return findings;
}
