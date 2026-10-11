// The generated lists' names, and the hand-kept guard (M6.E11.S2 t2.3, FR-7,
// D-M6E11-25; narrowed at M6.E13 t7.4).
//
// With the store on, `BUGS.md`, `BACKLOG.md`, `ISSUES-INBOX.md` and
// `OPEN-QUESTIONS.md` stop being hand-kept and become VIEWS of the store. This
// module generated them from v1 item files (`generateAll`); since the M6.E13
// cutover they are rendered from records by `work-views.js`
// (`regenerateViews`), and t7.4 retired the v1 generator. What stays:
//
//   - the names every generated target goes by, and
//   - `assertNoHandKeptLists`, the preflight `closeEpic` and the archive-tree
//     apply run BEFORE anything moves, so a list still kept by hand stops the
//     change instead of being overwritten by the regeneration after it
//     (REVIEW I1). `regenerateViews` repeats the check over its own targets.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { WorkStoreError } from './work-errors.js';
import { GENERATED_MARKER, isGeneratedFile } from './work-marker.js';
import { WORK_DIR } from './work-store.js';

// The marker lives in the leaf `work-marker.js` so `atomic-write.js` can check
// it without importing the store; re-exported here for existing importers.
export { GENERATED_MARKER };
export const GENERATED_FILES = Object.freeze(['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md']);
// The Epic index (AC-8.2). Under `work/`, not `.planning/`, and so not in
// GENERATED_FILES: it is a view of the store for the store's readers, not one
// of the four lists the shipped readers parse.
export const EPICS_INDEX_REL = `${WORK_DIR}/EPICS.md`;
// An Epic's intent file inside its folder; holds the close record once
// archived (FR-8.4). Not an item — its name is not an ID.
export const EPIC_README = 'README.md';

const TARGETS = [...GENERATED_FILES, EPICS_INDEX_REL];

/**
 * Throw unless every file the generator would write is missing or already
 * generated. Reads only.
 *
 * @param {string} baseDir
 * @throws {WorkStoreError} CONFIG naming each hand-kept list
 */
export function assertNoHandKeptLists(baseDir) {
  const planning = join(baseDir, '.planning');
  const handKept = TARGETS.filter((rel) => {
    const abs = join(planning, ...rel.split('/'));
    return existsSync(abs) && !isGeneratedFile(abs);
  });
  if (handKept.length === 0) return;
  throw new WorkStoreError('CONFIG', `The work store is on (.planning/${WORK_DIR}/WORK.md exists), but `
    + `${handKept.map((r) => `.planning/${r}`).join(', ')} ${handKept.length === 1 ? 'is' : 'are'} hand-kept, not `
    + 'generated. Regenerating would overwrite '
    + `${handKept.length === 1 ? 'it' : 'them'} with entries the store does not hold, so nothing was written. `
    + 'Turning the store on for a project with existing lists is done by a migration, which moves every entry '
    + 'into the store first: `/sig:docs-migrate --work-store`. '
    + `If .planning/${WORK_DIR}/WORK.md was created by hand, delete it to turn the store back off. `
    + 'If this project was already migrated, the list was edited by hand: restore it from git '
    + '(`git checkout -- <file>`) — a generated list\'s first line is the marker.');
}
