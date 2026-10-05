// M6.E11 t7.2 — this repository's four lists as they stood BEFORE the work-item
// store was switched on (`D-M6E11-24`).
//
// From the migration on, `.planning/BUGS.md`, `BACKLOG.md`, `ISSUES-INBOX.md`
// and `OPEN-QUESTIONS.md` are GENERATED from the item files under
// `.planning/work/`. Tests that measured the hand-written text — its rows, its
// struck headings, its vocabulary counts — read the byte-for-byte originals the
// migration copied to `.planning/archive/pre-work-store/` instead. That folder
// and the four names are fixed facts of this repository's history, so they are
// stated here (M6.E13 t7.4): they used to come from `work-migrate.js`
// (`PRE_STORE_ARCHIVE`, `SOURCES`), whose writer that named the folder was
// retired with the v1 store.
//
// Two shapes, because the readers take two shapes:
//
//   archived(name)          the text of one original — for readers that take text.
//   preStoreBase({ full })  a temp project root whose `.planning/` holds the four
//                           originals under their live names — for readers that
//                           take a baseDir. With `full: true` the rest of
//                           `.planning/` is copied in first (STATE.md, milestone
//                           files, Epic artifacts), because `readCorpus` and
//                           `backlogDischargeStatus` resolve closure from them and
//                           the pins assert every source was readable. `work/` is
//                           NEVER copied: several readers branch on `isStoreOn`,
//                           and the pre-store tree had no store.
//
// Read-only on the repository: everything is written under os.tmpdir().

import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';

import { REPO_ROOT } from './roots.js';

// Where M6.E11's migration kept the originals, relative to `.planning/`.
const PRE_STORE_ARCHIVE = 'archive/pre-work-store';
// The four hand-kept lists it took in — the four views' names today.
const SOURCES = Object.freeze(['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md']);

const PLANNING = join(REPO_ROOT, '.planning');
export const PRE_STORE_DIR = join(PLANNING, ...PRE_STORE_ARCHIVE.split('/'));

/** One original, verbatim. */
export function archived(name) {
  return readFileSync(join(PRE_STORE_DIR, name), 'utf-8');
}

/**
 * A temp project root holding the pre-store originals under their live names.
 * The caller removes it with `removePreStoreBase`.
 *
 * @param {{full?: boolean, extra?: string[]}} [opts] — `extra`: repo-root files
 *   to copy in beside `.planning/` (e.g. `CHANGELOG.md`).
 */
export function preStoreBase({ full = false, extra = [] } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'pre-store-'));
  const planning = join(base, '.planning');
  mkdirSync(planning, { recursive: true });
  if (full) {
    const skip = [join(PLANNING, 'work'), PRE_STORE_DIR];
    cpSync(PLANNING, planning, {
      recursive: true,
      filter: (src) => !skip.some((s) => src === s || src.startsWith(s + sep)),
    });
  }
  for (const s of SOURCES) writeFileSync(join(planning, s), archived(s));
  for (const f of extra) cpSync(join(REPO_ROOT, f), join(base, f));
  return base;
}

export function removePreStoreBase(base) {
  if (base && relative(tmpdir(), base).startsWith('pre-store-')) rmSync(base, { recursive: true, force: true });
}
