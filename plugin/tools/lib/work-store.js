// The work store — folders of item files under `.planning/work/` (M6.E11, FR-1, FR-3, FR-4).
//
//   .planning/work/
//     WORK.md                  frontmatter `key:` — the opt-in switch (D-M6E11-3)
//     inbox/     SIG-n.md      status N
//     backlog/   SIG-n.md      status T
//     epics/<EpicID>/SIG-n.md  status Q | P, beside the Epic's own artifacts
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
import { basename, join } from 'node:path';

import { parseFrontmatter, StateSchemaError } from './state.js';
import { WorkStoreError } from './work-item.js';

export const WORK_DIR = 'work';
export const WORK_FILE = 'WORK.md';
export const FOLDERS = Object.freeze({ inbox: 'inbox', backlog: 'backlog', epics: 'epics', done: 'done' });

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

// The key charset is [A-Z0-9] (STORE_KEY_RE), so it needs no regex escaping.
function itemFileRe(key) {
  return new RegExp(`^${key}-([1-9]\\d*)\\.md$`);
}

function maxFromNames(names, re) {
  let max = 0;
  for (const name of names) {
    const m = re.exec(basename(name.trim()));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

// Recursive walk that does not follow symlinks: a Dirent for a symlink is
// neither a file nor a directory here, so a link pointing outside the store
// cannot pull foreign files into the count (or into checkStore).
function walkFiles(dir, out = []) {
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

function isGitRepo(baseDir, execFn) {
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
    throw new WorkStoreError('CONFIG', `The work store is off: ${WORK_FILE_REL} does not exist. ${KEY_FIX}`);
  }
  const re = itemFileRe(store.key);

  let max = 0;
  for (const rel of ID_TREE_DIRS) max = Math.max(max, maxFromNames(walkFiles(join(baseDir, rel)), re));

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
      max = Math.max(max, maxFromNames(out.split('\n').filter(Boolean), re));
      return { id: `${store.key}-${max + 1}`, basis: 'git-log' };
    }

    const refs = runGit(baseDir, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes'], execFn)
      .split('\n')
      .filter(Boolean);
    if (hasHead) refs.push('HEAD');
    for (const ref of refs) {
      const out = runGit(baseDir, ['ls-tree', '-r', '--name-only', ref, '--', ...ID_GIT_PATHS], execFn);
      max = Math.max(max, maxFromNames(out.split('\n').filter(Boolean), re));
    }
    return { id: `${store.key}-${max + 1}`, basis: 'ls-tree' };
  } catch (err) {
    throw new Error(`nextId: could not read git history in ${baseDir}: ${err.message}`);
  }
}
