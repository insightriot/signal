// The work store's switch and shared constants (M6.E11, FR-1; M6.E13).
//
//   .planning/work/
//     WORK.md                  frontmatter `key:` — the opt-in switch (D-M6E11-3);
//                              `schema_version: 2` for a store of records
//     items/NN/SIG-n.json      the records (`work-records.js`, M6.E13)
//     epics/<EpicID>/          an Epic's documents
//
// Until M6.E13 this module also allocated v1 item IDs (`nextId`), mapped a
// status to its folder (`folderFor`) and checked that every item file sat in
// the folder its status allowed (`checkStore`). Items were files in status
// folders then; they are records now, and t7.4 retired those three with the
// v1 store (`work-records.js` `nextIdV2` and `checkRecords` replace them).
// What stays is what every store reader shares: the switch, the lock, and two
// filesystem helpers.
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
import { join } from 'node:path';

import { parseFrontmatter, StateSchemaError } from './state.js';
import { WorkStoreError } from './work-errors.js';

export const WORK_DIR = 'work';
export const WORK_FILE = 'WORK.md';
export const FOLDERS = Object.freeze({ inbox: 'inbox', backlog: 'backlog', epics: 'epics', done: 'done' });

// How long the store's `work` lock (`.planning/work/.lock`) stays live
// (M6.E11 REVIEW I4). A mutation reads all of git history and regenerates
// every list under it, which can outlast file-lock's 5 s default. Staleness is
// judged by whoever tries to TAKE the lock, so every taker of that path uses
// this one value — a taker with a shorter one would steal a live lock.
export const WORK_LOCK_TTL_MS = 120_000;

// The store's `work` lock, relative to the project root. Every taker builds the
// path from this one constant.
export const WORK_LOCK_REL = `.planning/${WORK_DIR}/.lock`;

// Same shape as the key half of ITEM_ID_RE (`work-item.js`) — they must not drift apart.
export const STORE_KEY_RE = /^[A-Z][A-Z0-9]{1,9}$/;

const WORK_FILE_REL = `.planning/${WORK_DIR}/${WORK_FILE}`;
const KEY_FIX = 'Put `key: SIG` (2–10 characters: an uppercase letter, then uppercase letters or digits) '
  + `in the frontmatter of ${WORK_FILE_REL}, or delete ${WORK_FILE_REL} to turn the store off.`;

// What to say when the store is off (REVIEW I1). Not "create WORK.md": on a
// project whose lists are hand-kept, a hand-made WORK.md switches on
// regeneration over them. The migration moves the lists into records and
// writes WORK.md itself (M6.E15).
export const STORE_OFF_MESSAGE = `The work store is off: ${WORK_FILE_REL} does not exist. `
  + 'Turning it on is done by a migration, which moves every entry of the hand-kept lists (BUGS.md, BACKLOG.md, '
  + `ISSUES-INBOX.md, OPEN-QUESTIONS.md) into the store and writes ${WORK_FILE} itself: `
  + '`/sig:docs-migrate --work-store` (a dry run; add `--apply` to write).';

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

// ── Shared helpers ──────────────────────────────────────────────────────────

// Generous, as the git reads elsewhere in the store are.
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

// Recursive walk that does not follow symlinks: a Dirent for a symlink is
// neither a file nor a directory here, so a link pointing outside the store
// cannot pull foreign files into a read.
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
