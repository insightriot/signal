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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
