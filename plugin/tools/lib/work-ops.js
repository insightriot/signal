// Opening and closing an Epic — the two `work-ops.js` entries (`closeEpic`:
// M6.E11 t5.3, narrowed at M6.E13 t7.4; `openEpic` and the unit-records path
// of `closeEpic`: M6.E16).
//
// Until M6.E13 this was `/sig:item`'s v1 library: every change to an item
// FILE (capture, move, close, reopen, triage) went through here, and each
// moved the file between status folders. The cutover made items JSON records
// that never move, written by `work-records.js`, and t7.4 retired the v1
// mutations and readers. What stays is the Epic's two ends, and each has two
// paths, chosen by whether the project has unit records (`unitRecordsOn` —
// `.planning/work/units/` exists):
//
// - `openEpic` — what `/sig:discuss --epic` and `/sig:new-project --epic`
//   call. Without unit records it only calls `setCurrentEpic`. With them it
//   refuses a closed Epic (unless forced, which records a reopen), calls
//   `setCurrentEpic`, then creates the Epic's unit record if it has none.
// - `closeEpic` — SHIP §6.8, after `work-records.js` `closeEpicCheck` says
//   every record of the Epic is done. Without unit records it archives the
//   Epic's folder (documents only on a v2 store). With them it does no folder
//   work: it records a close request on the Epic's unit record with a commit
//   as proof, and `confirmCloses` closes the unit once that commit is on the
//   default branch.
//
// `closeEpic`, and `openEpic` with unit records, run only on a v2 store; a v1
// store refuses (CONFIG, naming `node tools/work-migrate-v2.mjs`).
//
// ── The `work` lock (D-M6E11-27) ────────────────────────────────────────────
//
// `.planning/work/.lock`, not `withStateLock`: that one is not reentrant. The
// folder move and the regeneration run inside it — the same lock
// `work-records.js` takes, so an Epic close and a record write exclude each
// other.

import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, unlinkSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

// `scrubSensitive` is the one detector `/sig:add` and `/sig:checkpoint` use.
import { scrubSensitive } from './add.js';
import { applyKeyedReplacements, computeLinkEdits } from './archive-tree.js';
import { atomicWrite } from './atomic-write.js';
import { capitalised, RECORD_DEFAULT_BRANCH_HINT } from './branch-guard.js';
import { acquireLock } from './file-lock.js';
import { gitCannotAsk, gitEnv, gitUnusableReason } from './git-env.js';
import { commitsStartingWith } from './git-objects.js';
import { assertRealInsidePlanning } from './path-confine.js';
import { shownRef } from './printable-text.js';
import { EPIC_ID_STRICT_RE, parseFrontmatter, setCurrentEpic, StateSchemaError, stringifyFrontmatter } from './state.js';
import { deriveRetroPath } from './retrospective.js';
import { RETRO_STATUS, retroStatusFromContent } from './retro-index.js';
import {
  assertUnitId, getUnit, openUnit, reopenUnit, requestUnitClose, rerequestUnitClose, storedRef, unitClosure, unitRecordsOn,
} from './unit-records.js';
import { asWorkStoreError, lockFailure, WorkStoreError } from './work-errors.js';
import { assertNoHandKeptLists, EPIC_README } from './work-generate.js';
import { rewriteRelativeLinks } from './work-links.js';
import { assertWritable, closeEpicCheck, headProvesNothing, onDefaultBranch, rerequestEpicClose } from './work-records.js';
import { assertViewsWritable, regenerateViews, viewsNotRegenerated } from './work-views.js';
import { isGeneratedText } from './work-marker.js';
import { FOLDERS, isGitRepo, walkFiles, WORK_DIR, WORK_LOCK_REL, WORK_LOCK_TTL_MS } from './work-store.js';

// ── Shared plumbing ──────────────────────────────────────────────────────────

// The store check comes BEFORE the lock: `acquireLock` creates the lock's
// parent folder, and a store-off project must not grow `.planning/work/`.
// `assertWritable` refuses a store that is off and a v1 store (CONFIG). The
// hand-kept check comes right AFTER the lock (REVIEW I1): the close ends by
// regenerating the views, so a list that is still hand-kept must stop it
// before anything moves.
async function withWorkLock(baseDir, fn) {
  assertWritable(baseDir);
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

// An Epic close time: a string starting YYYY-MM. A prefix check, not an
// anchored one — full ISO timestamps pass.
const ISO_MONTH_PREFIX_RE = /^\d{4}-(0[1-9]|1[0-2])/;
const isIsoDate = (at) => typeof at === 'string' && ISO_MONTH_PREFIX_RE.test(at);

function assertEpicId(epic) {
  if (typeof epic !== 'string' || !EPIC_ID_STRICT_RE.test(epic)) {
    throw new WorkStoreError('SCHEMA', `Epic ID ${JSON.stringify(epic)} is not valid (expected e.g. M6.E11)`);
  }
}

// ── The move ─────────────────────────────────────────────────────────────────

// Every git call here names a path read from disk, so each carries
// `--literal-pathspecs` (a global option, before the subcommand): the path is
// matched as written, never as a glob pattern.

function isTracked(baseDir, rel, execFn) {
  try {
    execFn('git', ['--literal-pathspecs', 'ls-files', '--error-unmatch', '--', rel], { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'], env: gitEnv(baseDir) });
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
    execFn('git', ['--literal-pathspecs', 'mv', '--', fromRel, toRel], { cwd: baseDir, stdio: ['ignore', 'pipe', 'pipe'], env: gitEnv(baseDir) });
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
    await regenerateViews(baseDir);
  } catch (err) {
    // The close stands — it is correct, and `checkRecords` names whatever
    // broke the regeneration; undoing a good change to protect a stale view
    // would be the wrong way round.
    // A raw error here is git or the filesystem: IO, with the same sentence.
    throw viewsNotRegenerated(done, err);
  }
}

// Every sensitive-data hit in `texts` — each free-text field that will land
// in the Epic's README (`pr`, `release`). Each is scanned on its own, so a hit's `index` is an
// offset into that field. Non-strings and empty strings are skipped.
function scrubTexts(texts) {
  const hits = [];
  for (const text of texts) {
    if (typeof text === 'string' && text !== '') hits.push(...scrubSensitive(text).hits);
  }
  return hits;
}

// The sensitive-data gate every writer of free text shares (REVIEW I3, pass
// 2): with a hit and no `acknowledgeSensitive`, the answer that nothing was
// written and the caller must ask. Null when the write may go ahead.
function sensitivePending(texts, opts) {
  const sensitiveHits = scrubTexts(texts);
  if (sensitiveHits.length > 0 && !opts.acknowledgeSensitive) {
    return { aborted: 'sensitive-data-pending', sensitiveHits };
  }
  return null;
}

// ── Epics (t5.3, FR-8, D-M6E11-13) ──────────────────────────────────────────
//
// `work/epics/<id>/README.md` is the Epic's intent file. It is not an item —
// its name is not an ID. It carries the close record once the Epic is
// archived.

const epicDirRel = (epic) => `${WORK_DIR}/${FOLDERS.epics}/${epic}`;
const archivedEpicDirRel = (epic) => `archive/epics/${epic}`;

// The Epic's artifacts that stay at the `.planning/` root even when it has a
// folder: each is read there by a reader that never looks in the folder —
// the retrospective by SHIP's gate (`deriveRetroPath`, run before
// `closeEpic`), the profile by `readEffectiveProfile`.
export const ROOT_ONLY_ARTIFACTS = ['RETROSPECTIVE', 'PROFILE'];

const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The Epic's own artifacts at the `.planning/` root that belong in its folder:
// regular files named `{EpicID}-*.md`, minus ROOT_ONLY_ARTIFACTS. Names, not
// paths. `M1.E1-` never matches `M1.E10-…`: the ID is followed by `-`.
function rootEpicArtifacts(baseDir, epic) {
  const re = new RegExp(`^${escapeRe(epic)}-(.+)\\.md$`);
  let entries;
  try {
    entries = readdirSync(join(baseDir, '.planning'), { withFileTypes: true });
  } catch (err) {
    throw asWorkStoreError(err, 'IO');
  }
  return entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .filter((name) => {
      const m = name.match(re);
      return m && !ROOT_ONLY_ARTIFACTS.includes(m[1]);
    })
    .sort();
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
 * Close an Epic: refuse while any of its items is open; otherwise record the
 * close in its README.md and move the whole folder to
 * `.planning/archive/epics/<id>/` (AC-8.3, AC-8.4).
 *
 * The items are records under `work/items/` and the folder holds documents
 * only, so the gate is `work-records.js` `closeEpicCheck` — every record whose
 * Epic is this one is closed, or *closing* with its fix commit in the current
 * HEAD (`D-M6E13-22`). After the move the v2 views regenerate. A v1 store
 * refuses (CONFIG, naming `node tools/work-migrate-v2.mjs`): its item-file
 * gate was retired with it (M6.E13 t7.4).
 *
 * The gate runs before the folder is looked for (REVIEW I3): an Epic with an
 * open record refuses with OPEN_ITEMS whether or not it has a folder. An Epic
 * with no folder and nothing open — every Epic from before the store — is not
 * an error: `{status: 'no-folder'}`, nothing written, so `/sig:ship` behaves as
 * it always has. Moving existing Epics into folders is migration (step 5).
 *
 * Each file moves with `git mv` when git tracks it, a rename otherwise; links
 * in the moved files are rewritten for the new location, except links between
 * files of the folder, which move together. A failure before the regeneration
 * puts every file back where it was, byte-for-byte.
 *
 * **On a project with unit records** (`unitRecordsOn(baseDir)`; M6.E16
 * t4.1, `D-M6E16-2`, `-14`) none of the folder work above happens. The close
 * is a `close_requested` event on the Epic's unit record, with a commit as
 * proof — `close.commit`, or the branch HEAD — and `pr` and `release` beside
 * it. HEAD is refused as the proof (CONFLICT, nothing written) when it is
 * already on the default branch and the project has uncommitted or untracked
 * changes: it would then say nothing about the Epic (REVIEW pass 1, C-I2). A
 * clean tree there is allowed, and so is an explicit `commit`. The unit then reads *closing*; `confirmCloses` (`work-records.js`)
 * closes it once that commit is on the default branch. Order: the arguments,
 * the store, the sensitive-data gate, the proof; then, under the store's lock
 * (`requestUnitClose`'s `gate`), `closeEpicCheck` and the retrospective —
 * `.planning/<EpicID>-RETROSPECTIVE.md` must be a regular file that
 * `retroStatusFromContent` reads complete (missing, empty or holding a
 * `[FILL IN]` placeholder refuses, CONFLICT, with `err.retro = {path,
 * status}`) — then the one event. Every refusal writes nothing. A unit with no
 * record (unit records turned on while the Epic was open) gets one first,
 * after the same checks have passed once (`created: true`).
 *
 * **After a squash or rebase merge** the branch commit recorded as proof never
 * reaches the default branch, for the unit or for the Epic's items. Run on the
 * default branch after the merge — the checkout's HEAD and the proof (HEAD, or
 * `commit`) are then both on it — this call LISTS each item still *closing* on
 * a commit that is not in HEAD's history and writes nothing
 * (`rerequest-proposed`): whether such a commit was part of the merged pull
 * request is not something git can say, so a person does. Called again with
 * `close.rerequest` — the listed items the person said yes to, each with the
 * commit it was shown closing on — it asks again, in ONE write, for the unit's
 * close and for theirs (`rerequestEpicClose`, `work-records.js`);
 * `rerequestedItems` names them, and each stays in the Epic. A listed item
 * that was not named is open and refuses the close (OPEN_ITEMS); a named item
 * that is not on the list, or is closing on another commit by then, refuses
 * (CONFLICT). On any other checkout such an item is open, as it always was,
 * and so is one git cannot answer for (a shallow clone, no remote, no
 * default-branch ref).
 *
 * @param {string} baseDir
 * @param {string} epicId
 * @param {{by: string, pr?: string|number, release?: string, at?: string, commit?: string,
 *   rerequest?: Array<{id: string, proof: string}>}} close — `at` defaults to now;
 *   `commit` (unit records only) is the proof, default the branch HEAD;
 *   `rerequest` (unit records only): see above
 * @param {{execFn?: Function, renameFn?: Function, acknowledgeSensitive?: boolean}} [opts]
 * @returns {Promise<{status: 'no-folder'} | {status: 'already-archived', path: string}
 *   | {status: 'closed', from: string, to: string, moved: string[], rewritten: string[], close: object}
 *   | {status: 'close-requested', epic: string, commit: string, created: boolean, retro: string, items: string[],
 *       closingOnBranch: string[], unit: {id, path, status: 'closing', held, closing_proof, close: null}}
 *   | {status: 'already-requested', epic: string, commit: string, unit: object}
 *   | {status: 're-requested', epic: string, commit: string, previous: string, created: false, retro: string,
 *       items: string[], closingOnBranch: string[], rerequestedItems?: string[], unit: object}
 *   | {status: 'rerequest-proposed', epic: string, commit: string,
 *       candidates: Array<{id: string, title: string|null, proof: string, why: 'not-in-history'|'unknown-commit'}>}
 *   | {status: 'already-closed', epic: string, unit: object}>}
 *   `rewritten` — live files outside the folder whose links into it were
 *   retargeted at the archive, relative to `baseDir` — or `{aborted, sensitiveHits}` (the sensitive-data rule, over pr/release).
 *   The last five are the unit-records answers: the close was requested;
 *   it had already been requested with this commit (nothing written); it had
 *   been requested with another commit, `previous` — the normal case when SHIP
 *   is re-run after review fixes were pushed — so the earlier request was
 *   reopened and the close requested again with `commit`, two events in one
 *   write, behind the same gate (`rerequestUnitClose`, t5.0a); the list of
 *   items to ask a person about after a squash or rebase merge (nothing
 *   written); the unit is already closed (nothing written)
 * @throws {WorkStoreError} CONFIG (store off, or v1), SCHEMA (bad ID, no `by`,
 *   a broken record or README),
 *   OPEN_ITEMS (each open item named), CONFLICT (archive folder exists, the
 *   folder holds something that is not a file or folder, or the Epic has
 *   `{EpicID}-*.md` artifacts at the `.planning/` root — each named; the
 *   retrospective and profile are expected there and do not count; with unit
 *   records: the retrospective is missing or a stub), LOCKED, IO
 */
export async function closeEpic(baseDir, epicId, close = {}, opts = {}) {
  assertEpicId(epicId);
  const { by, pr, release, at = new Date().toISOString() } = close;
  if (typeof by !== 'string' || by.trim() === '') {
    throw new WorkStoreError('SCHEMA', `${epicId}: closing an Epic records who closed it — pass \`by\`.`);
  }
  if (!isIsoDate(at)) {
    throw new WorkStoreError('SCHEMA', `${epicId}: close time must be an ISO date (got ${JSON.stringify(at)})`);
  }
  const execFn = opts.execFn ?? execFileSync;
  assertWritable(baseDir);
  // With unit records the close is an event on the unit's record (M6.E16 t4.1).
  // A `units/` folder that cannot be trusted refuses here (`unitRecordsOn`
  // throws): it is not "no unit records", and the folder move below is not
  // the fallback for it.
  if (unitRecordsOn(baseDir)) {
    return closeEpicUnit(baseDir, epicId, { by, pr, release, at, commit: close.commit, rerequest: close.rerequest }, opts, execFn);
  }
  // The list of items to ask again is the unit-records recovery; here the
  // close is a folder move and would never look at it.
  if (close.rerequest !== undefined) {
    throw new WorkStoreError('CONFIG', `${epicId}: \`rerequest\` names items whose close is asked again, and this project has no unit `
      + 'records — nothing was written. Ask again for an item\'s close with `rerequestCloses`.');
  }
  const pending = sensitivePending([pr, release], opts);
  if (pending) return pending;
  return withWorkLock(baseDir, async () => {
    const planning = join(baseDir, '.planning');
    const fromDirRel = epicDirRel(epicId);
    const toDirRel = archivedEpicDirRel(epicId);
    const fromRel = `.planning/${fromDirRel}`;
    const toRel = `.planning/${toDirRel}`;
    const fromAbs = join(planning, fromDirRel);
    const toAbs = join(planning, toDirRel);

    // The gate runs first, before the folder is looked for: nothing creates
    // Epic folders on a v2 store, so a gate behind the folder lookup never ran
    // (REVIEW I3). Every record whose Epic is this one (`closeEpicCheck` throws
    // OPEN_ITEMS or SCHEMA itself).
    closeEpicCheck(baseDir, epicId, { execFn });

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
    // Everything else regenerateViews would refuse, before anything moves (SIG-280 (6),
    // M6.E14) — after the gate and the folder lookup, so OPEN_ITEMS and the
    // already-archived / no-folder answers come first, as ship.md §6.8 lists them.
    assertViewsWritable(baseDir, { verb: 'moved' });
    confine(baseDir, fromAbs, '/sig:item');
    confine(baseDir, toAbs, '/sig:item');

    const tree = listTree(fromAbs);
    if (tree.other.length) {
      const names = tree.other.map((p) => toPosix(relative(baseDir, p))).join(', ');
      throw new WorkStoreError('CONFLICT', `${fromRel} holds entries that are not files or folders (${names}); `
        + 'moving the folder would leave them behind. Remove or replace them, then re-run.');
    }
    if (exists(toAbs)) {
      throw new WorkStoreError('CONFLICT', `${toRel} already exists — nothing was moved. `
        + 'Find out what it is before archiving onto it.');
    }
    // D-M6E11-33: the folder holds the whole Epic. An artifact at the root —
    // written there by a command that ran with the store off — would be left
    // behind by the archive, so it is refused, not silently split.
    const stray = rootEpicArtifacts(baseDir, epicId).map((name) => `.planning/${name}`);
    if (stray.length) {
      throw new WorkStoreError('CONFLICT', `${epicId} has artifacts at the .planning/ root, outside ${fromRel}/ — `
        + `archiving the folder would leave them behind. Nothing was moved. Move each into the folder `
        + `(\`git mv\`), then re-run:\n${stray.map((p) => `  ${p}`).join('\n')}`);
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
    // "Git could not be asked" is not "no repository" (r6.5): read as one,
    // tracked files were moved as plain renames.
    const cannotAsk = gitCannotAsk(baseDir);
    if (cannotAsk !== null) {
      throw new WorkStoreError('CONFIG', `${epicId}: git could not be asked which of the Epic's files it tracks, so they were not moved: `
        + `${cannotAsk}. Nothing was moved.`);
    }
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
      // No text pre-filter: a link is relative to its own file, so an item
      // body in `items/00/` reaches the folder as `../../epics/<id>/…`, which
      // never contains `work/epics/<id>` (REVIEW I5). `computeLinkEdits` decides.
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

// ── Closing an Epic on a project with unit records (M6.E16 t4.1, FR4) ───────
//
// The close is a `close_requested` event on the unit's record, with the Epic's
// commit as proof (`D-M6E16-2`). No folder is looked for and nothing moves
// (`D-M6E16-14`). The unit reads *closing* until `confirmCloses`
// (`work-records.js`) finds that commit on the default branch.

export const COMMIT_SHAPE_RE = /^[0-9a-f]{7,64}$/;

// The branch HEAD's full hash, or null (not a repository, or no commit yet) —
// what `dischargeBacklogRows` (`backlog.js`) records for the same SHIP.
function headCommit(baseDir, execFn) {
  try {
    return String(execFn('git', ['rev-parse', '--verify', '--quiet', 'HEAD'], {
      cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: gitEnv(baseDir),
    })).trim() || null;
  } catch {
    return null;
  }
}

// The full hash of the commit an explicit `commit` names (M6.E16 r6). It is
// checked, not trusted: one that names no commit in this repository could
// never be confirmed, and the unit would read *closing* for ever. Refused too
// when what resolves does not start with what was passed — git resolves a
// branch or tag called `abcdef1` before it tries a short hash.
// `commit` has the shape of a hash (`COMMIT_SHAPE_RE`): the caller checks.
// `epicId` begins the refusal — the Epic, or what else the commit is for
// (`dischargeBacklogRows`, `backlog.js`, records one the same way).
export function explicitCommit(baseDir, epicId, commit, execFn = execFileSync) {
  // A short hash that more than one commit starts with names neither
  // (SIG-276), and is asked about FIRST: with a branch or tag named those
  // digits, the resolution below takes the ref and would pass.
  // Git could not be asked (r6.5): said as that, not as "names no commit".
  const cannotAsk = gitCannotAsk(baseDir);
  if (cannotAsk !== null) {
    throw new WorkStoreError('CONFIG', `${epicId}: \`commit\` ${commit} could not be checked: ${cannotAsk}. Nothing was written.`);
  }
  const sharing = commit.length < 40 ? commitsStartingWith(baseDir, commit, execFn) : 0;
  if (sharing > 1) {
    throw new WorkStoreError('SCHEMA', `${epicId}: \`commit\` ${commit} is the start of ${sharing} commits or tags, so it names none of them — `
      + 'use a longer hash (git rev-parse <commit>). Nothing was written.');
  }
  let full = null;
  try {
    full = String(execFn('git', ['rev-parse', '--verify', '--quiet', '--end-of-options', `${commit}^{commit}`], {
      cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: gitEnv(baseDir),
    })).trim().toLowerCase();
  } catch {
    full = null;
  }
  if (full === null || !COMMIT_SHAPE_RE.test(full) || !full.startsWith(commit)) {
    throw new WorkStoreError('CONFIG', `${epicId}: \`commit\` ${commit} does not name a commit in this repository (or git could not be `
      + 'asked). Use `git rev-parse <commit>` for its hash. Nothing was written.');
  }
  return full;
}

// The Epic's retrospective must exist and be filled in (AC4.3): a file that is
// missing, or still holds a `[FILL IN]` placeholder, refuses the close. Read
// only as a regular file. The refusal names the file and carries
// `err.retro = {path, status}`.
function assertRetroComplete(baseDir, epicId) {
  const rel = deriveRetroPath(epicId);
  const abs = join(baseDir, rel);
  const refuse = (status, why) => {
    const err = new WorkStoreError('CONFLICT', `${epicId} cannot be closed: ${why}. Nothing was written. `
      + 'Write the retrospective (references/retrospective-template.md), then re-run.');
    err.retro = { path: rel, status };
    return err;
  };
  let st = null;
  try {
    st = lstatSync(abs);
  } catch (err) {
    if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') throw asWorkStoreError(err, 'IO');
  }
  if (st === null) throw refuse(RETRO_STATUS.ABSENT, `its retrospective ${rel} does not exist`);
  if (!st.isFile()) throw refuse(RETRO_STATUS.ABSENT, `its retrospective ${rel} is not a regular file (a link or a folder)`);
  let content;
  try {
    content = readFileSync(abs, 'utf-8');
  } catch (err) {
    throw asWorkStoreError(err, 'IO');
  }
  const status = retroStatusFromContent(content);
  if (status === RETRO_STATUS.ABSENT) throw refuse(status, `its retrospective ${rel} is empty`);
  if (status !== RETRO_STATUS.COMPLETE) {
    throw refuse(status, `its retrospective ${rel} is still a stub — it holds \`[FILL IN]\` placeholders`);
  }
  return rel;
}

// HEAD as proof must be able to say something about the Epic (REVIEW pass 1,
// C-I2, `D-M6E16-21`): refused when `headProvesNothing` (`work-records.js`)
// finds it already on the default branch with the project's work uncommitted
// — or cannot tell whether it is, because the remote's default branch is not
// recorded in this clone, with that work uncommitted.
// An explicit `commit` never comes here: `explicitCommit` has checked that it
// names a commit, and the caller chose it.
//
// `dischargeBacklogRows` (`backlog.js`) records HEAD the same way and asks
// here too, with its own words: `what` begins the refusal, `about` is what
// HEAD says nothing about, `wrongly` what the next confirm step would do, and
// `advice` the way out, after "Commit" or "or commit".
const EPIC_CLOSE_WORDS = (epicId) => ({
  what: `${epicId}: the close`, about: 'this Epic', wrongly: 'call the Epic closed', advice: 'the Epic\'s work, then close.',
});
export function refuseHeadThatProvesNothing(baseDir, epicId, head, execFn, words = EPIC_CLOSE_WORDS(epicId)) {
  // Git could not be asked (r6.5): this check then cannot pass, and says so
  // itself rather than lean on its callers having refused first.
  const cannotAsk = gitCannotAsk(baseDir);
  if (cannotAsk !== null) {
    throw new WorkStoreError('CONFIG', `${words.what} would record HEAD as its proof, and whether that commit says anything about `
      + `${words.about} could not be checked: ${cannotAsk}. Nothing was written.`);
  }
  const stale = headProvesNothing(baseDir, head, { execFn });
  if (stale === null) return;
  if (stale.ref === null) {
    throw new WorkStoreError('CONFLICT', `${words.what} would record HEAD (${head.slice(0, 12)}) as its proof, and Signal cannot tell whether `
      + 'that commit is already on the default branch: the remote\'s default branch is not recorded in this clone, and this project has '
      + `uncommitted or untracked changes. Nothing was written. ${capitalised(RECORD_DEFAULT_BRANCH_HINT)}, then re-run; `
      + `or commit ${words.advice}`);
  }
  throw new WorkStoreError('CONFLICT', `${words.what} would record HEAD (${head.slice(0, 12)}) as its proof, and that commit is `
    + `already on the default branch (${shownRef(stale.ref.replace(/^refs\/remotes\//, ''))}) while this project has uncommitted or untracked changes — `
    + `so it says nothing about ${words.about}, and the next confirm step would ${words.wrongly}. Nothing was written. `
    + `Commit ${words.advice}`);
}

const unitView = (unit) => ({
  id: unit.id, path: unit.path, status: unit.status, held: unit.held, closing_proof: unit.closing_proof, close: unit.close,
});

// The error for a close that was not requested after this call had created
// the unit's record: "Nothing was written" would be false.
function createdButNotRequested(epicId, err) {
  // `changeStands`: the request landed and only the views failed — the
  // error already says so, and "was not requested" would be false.
  if (err?.changeStands === true) return err;
  const wrapped = new WorkStoreError(
    err instanceof WorkStoreError ? err.code : 'IO',
    `${epicId}: its unit record was created (opened), but the close was not requested — ${err?.message ?? String(err)}`,
  );
  wrapped.cause = err;
  if (err?.retro) wrapped.retro = err.retro;
  return wrapped;
}

async function closeEpicUnit(baseDir, epicId, { by, pr, release, at, commit, rerequest }, opts, execFn) {
  // A record's `pr` and `release` are text; a PR number is written as its digits.
  const text = (v) => (v === undefined || v === null ? undefined : String(v));
  const prText = text(pr);
  const releaseText = text(release);
  // Scanned as the unit writers store them (`storedRef`): a hit that shows
  // only once invisible characters are gone stops the close here, before a
  // record is created for it (REVIEW pass 1, C-S1).
  const pending = sensitivePending([storedRef(prText), storedRef(releaseText)], opts);
  if (pending) return pending;

  let proof = commit ?? headCommit(baseDir, execFn);
  if (proof === null) {
    const unusable = gitUnusableReason();
    throw new WorkStoreError('CONFIG', `${epicId}: the close records the Epic's commit as its proof, and `
      + `${unusable === null ? 'this is not a git repository with a commit' : `no commit could be read: ${unusable}`}. Nothing was written.`);
  }
  if (typeof proof !== 'string' || !COMMIT_SHAPE_RE.test(proof)) {
    throw new WorkStoreError('SCHEMA', `${epicId}: the close's proof is a commit hash — lowercase hex, 7 to 64 characters `
      + `(got ${JSON.stringify(String(proof).slice(0, 80))}). Nothing was written.`);
  }
  // Recorded as the full hash, as HEAD's is.
  if (commit !== undefined && commit !== null) proof = explicitCommit(baseDir, epicId, proof, execFn);

  // The items a person said yes to, after this call listed them (below).
  const named = rerequest === undefined || rerequest === null ? null : rerequest;
  if (named !== null && !(Array.isArray(named) && named.every((n) => typeof n?.id === 'string' && typeof n?.proof === 'string'))) {
    throw new WorkStoreError('SCHEMA', `${epicId}: \`rerequest\` is a list of {id, proof} — each item this call listed that a person said yes to, `
      + 'with the commit it was shown closing on. Nothing was written.');
  }

  // What the Epic owes before it may close: every item closed, or closing with
  // its fix in HEAD (`closeEpicCheck` throws OPEN_ITEMS or SCHEMA itself), and
  // a complete retrospective. Run again under the lock by `requestUnitClose`.
  let checked;
  let retro;
  const gate = () => {
    checked = closeEpicCheck(baseDir, epicId, { execFn, unitRecords: true });
    retro = assertRetroComplete(baseDir, epicId);
    if (named !== null && named.length > 0) {
      throw new WorkStoreError('CONFLICT', `${epicId}: an item's close is asked again only on the default branch after the merge, and no item is `
        + 'waiting to be here. Nothing was written.');
    }
  };
  // The recovery after a squash or rebase merge: only when this checkout's
  // HEAD and the proof are both already on the default branch. There, an item
  // still closing on a commit that never reached this branch is listed for a
  // person, and its close is asked again — with the proof, in
  // the same write as the unit's — only when it comes back named. Anywhere else
  // (a normal SHIP, on the Epic's branch; `commit` naming an older commit of
  // the default branch from there) such an item is open, as it always was:
  // there the proof is not known to hold anyone's fix.
  const head = commit === undefined || commit === null ? proof : headCommit(baseDir, execFn);
  const recovering = onDefaultBranch(baseDir, proof, { execFn })
    && (head === proof || (head !== null && onDefaultBranch(baseDir, head, { execFn })));
  const recoveryGate = (list) => {
    checked = closeEpicCheck(baseDir, epicId, { execFn, unitRecords: true, rerequest: list });
    retro = assertRetroComplete(baseDir, epicId);
    return checked.rerequest;
  };
  // Before the lock: with no list from the caller, every candidate is shown
  // and nothing is written. Null when there is nothing to ask a person.
  const proposal = () => {
    const candidates = recoveryGate(named ?? true);
    if (named !== null || candidates.length === 0) return null;
    return { status: 'rerequest-proposed', epic: epicId, commit: proof, candidates };
  };

  // HEAD taken as the proof (no `commit` passed) is checked before each write
  // below — and before the store's lock is taken: the lock is a file under the
  // project, and would itself read as an untracked change.
  const headProof = () => {
    if (commit === undefined || commit === null) refuseHeadThatProvesNothing(baseDir, epicId, proof, execFn);
  };

  let created = false;
  if (unitClosure(baseDir, epicId) === 'no-record') {
    // Unit records were turned on while this Epic was open: its record is
    // created here, after everything that can refuse has been checked once.
    headProof();
    if (recovering) {
      const proposed = proposal();
      if (proposed !== null) return proposed;
    } else gate();
    assertUnitId(baseDir, epicId);
    try {
      const opened = await openUnit(baseDir, epicId, { by, at });
      if (opened?.aborted) return opened;
    } catch (err) {
      // The record landed and only the views failed (t5.0b): go on to the
      // request, which regenerates them again and reports it if they still fail.
      if (err?.changeStands !== true) throw err;
    }
    created = true;
  } else {
    const unit = getUnit(baseDir, epicId);
    if (unit.status === 'closed') return { status: 'already-closed', epic: epicId, unit: unitView(unit) };
    if (unit.status === 'closing' && unit.closing_proof === proof) {
      return { status: 'already-requested', epic: epicId, commit: proof, unit: unitView(unit) };
    }
  }

  // Looked at once before the lock, and decided again under it (the gate).
  if (recovering) {
    if (!created) {
      headProof();
      const proposed = proposal();
      if (proposed !== null) return proposed;
    }
    if (checked.rerequest.length > 0) {
      let out;
      try {
        out = await rerequestEpicClose(baseDir, epicId, { proof, pr: prText, release: releaseText, by, at }, {
          execFn, renameFn: opts.renameFn, gate: () => recoveryGate(named),
        });
      } catch (err) {
        throw created ? createdButNotRequested(epicId, err) : err;
      }
      return {
        status: out.previous === null ? 'close-requested' : 're-requested',
        epic: epicId,
        commit: proof,
        ...(out.previous === null ? {} : { previous: out.previous }),
        created,
        retro,
        items: checked.items,
        closingOnBranch: checked.closingOnBranch,
        rerequestedItems: out.items,
        unit: unitView(out.unit),
      };
    }
  }

  if (!created) {
    const unit = getUnit(baseDir, epicId);
    if (unit.status === 'closing') {
      // SHIP re-run after new commits (t5.0a): the earlier request is
      // reopened and the close requested again, in one write, behind the
      // same gate.
      headProof();
      const again = await rerequestUnitClose(baseDir, epicId, { proof, pr: prText, release: releaseText, by, at }, {
        execFn, renameFn: opts.renameFn, acknowledgeSensitive: opts.acknowledgeSensitive, gate,
      });
      if (again?.aborted) return again;
      return {
        status: 're-requested',
        epic: epicId,
        commit: proof,
        previous: again.previous_proof,
        created: false,
        retro,
        items: checked.items,
        closingOnBranch: checked.closingOnBranch,
        unit: unitView(again),
      };
    }
  }

  if (!created) headProof();
  let out;
  try {
    out = await requestUnitClose(baseDir, epicId, { proof, pr: prText, release: releaseText, by, at }, {
      execFn, renameFn: opts.renameFn, acknowledgeSensitive: opts.acknowledgeSensitive, gate,
    });
  } catch (err) {
    throw created ? createdButNotRequested(epicId, err) : err;
  }
  if (out?.aborted) return out;
  return {
    status: 'close-requested',
    epic: epicId,
    commit: proof,
    created,
    retro,
    items: checked.items,
    closingOnBranch: checked.closingOnBranch,
    unit: unitView(out),
  };
}

// ── Opening an Epic (M6.E16 t3.1, AC3.1, AC3.3) ─────────────────────────────

// A unit's close as one line: the reason and date, then the PR and the
// release, each when recorded. Never the close's words: they are free text,
// and both callers print or store this beside something a reader acts on.
// `refs: false` leaves the PR and the release out as well: they are text from
// the record too, and the refusal that tells a reader how to override a close
// prints nothing from the record beside that instruction but its reason and date.
function closeLine(close, { refs = true } = {}) {
  const parts = [`${close.reason}, ${String(close.at).slice(0, 10)}`];
  if (refs && close.pr) parts.push(`PR ${close.pr}`);
  if (refs && close.release) parts.push(`release ${close.release}`);
  return parts.join('; ');
}

/**
 * Open an Epic: create its unit record and set `current_epic`
 * (`setCurrentEpic`, `state.js`). What `/sig:discuss --epic` and
 * `/sig:new-project --epic` call.
 *
 * **On a project with no unit records** (`unitRecordsOn(baseDir)` is false:
 * there is no `units/` folder) this calls `setCurrentEpic` and nothing else:
 * no record is created, nothing is checked first, and its errors are
 * `setCurrentEpic`'s own. A `units/` folder that is there and cannot be
 * trusted — a link, a file, one that cannot be listed — is refused before
 * anything is written (REVIEW pass 1, C-I4): it is not "no unit records".
 *
 * **On a project with unit records**, Epic IDs only (`M6.E16`; another unit
 * name is created by the migration, `D-M6E16-13`):
 *
 * - no record for the Epic → `openUnit` creates one (`unit: 'created'`);
 * - its record is open, or closing → the record is left as it is
 *   (`'existing'`); coming back to an open Epic is normal;
 * - its record is closed (held or not) → refused (CONFLICT) with the close
 *   line, unless `force` is true: then `reopenUnit` records a `reopened`
 *   event whose reason names the override (`'reopened'`).
 *
 * Order. Everything that can refuse is checked first, and a refusal writes
 * nothing: the ID, `by`, the store, the unit's record (a broken one is
 * refused, SCHEMA), the closed check. Then `setCurrentEpic`, then the record.
 * `setCurrentEpic` goes first because it has refusals of its own (no
 * `STATE.md` at schema 1; a phase log with nowhere safe to be archived), and
 * a record is never deleted — written first, a refused roll would leave a
 * record for an Epic that was never opened. If the record write then fails
 * (the lock is held, or the disk), `current_epic` already names the Epic: the
 * error says so, and calling `openEpic` again finishes the open, because
 * `setCurrentEpic` on the Epic already set changes nothing.
 *
 * @param {string} baseDir
 * @param {string} epicId
 * @param {{by: string, force?: boolean}} [open] — `by` is required when the project has unit records
 * @returns {Promise<{epic: string, unit: 'created'|'existing'|'reopened'|'no-records'}>}
 * @throws {WorkStoreError} SCHEMA (not an Epic ID, no `by`, a broken record), CONFIG (unit records, and
 *   the store is off or v1), CONFLICT (the unit is closed and `force` is not true; or `units/` is a link
 *   or a file), IO (`units/` cannot be listed); after `current_epic`
 *   was set, the record write's own code (LOCKED, IO, …) with a message saying what stands
 * @throws {StateWriteError} as `setCurrentEpic`
 */
export async function openEpic(baseDir, epicId, open = {}) {
  if (!unitRecordsOn(baseDir)) {
    await setCurrentEpic(baseDir, epicId);
    return { epic: epicId, unit: 'no-records' };
  }
  const { by, force = false } = open;
  assertEpicId(epicId);
  if (typeof by !== 'string' || by.trim() === '') {
    throw new WorkStoreError('SCHEMA', `${epicId}: opening an Epic records who opened it — pass \`by\`. Nothing was written.`);
  }
  assertWritable(baseDir);

  let step;
  if (unitClosure(baseDir, epicId) === 'no-record') {
    assertUnitId(baseDir, epicId);
    step = { unit: 'created', did: 'no unit record was created', write: () => openUnit(baseDir, epicId, { by }) };
  } else {
    const unit = getUnit(baseDir, epicId);
    if (unit.status !== 'closed') {
      step = { unit: 'existing', write: null };
    } else {
      if (force !== true) {
        // Without the close's words, its PR or its release: free text from a
        // record is not printed beside the instruction to override it.
        throw new WorkStoreError('CONFLICT', `${epicId} is closed (${closeLine(unit.close, { refs: false })})${unit.held ? ', and held' : ''} — nothing was opened. `
          + 'To open it again, call openEpic with `force: true` (the `--epic` override): that records a reopen on its unit record.');
      }
      // Without the close's words: they stay in the close event, and free
      // text copied here would be put through the sensitive-data gate again,
      // after `current_epic` was set.
      const reason = `opened again with the --epic override (openEpic, force) — it was closed: ${closeLine(unit.close)}`;
      step = { unit: 'reopened', did: 'its unit record is still closed', write: () => reopenUnit(baseDir, epicId, { by, reason }) };
    }
  }

  await setCurrentEpic(baseDir, epicId);
  if (step.write) {
    let failure = null;
    try {
      const out = await step.write();
      if (out?.aborted) failure = new WorkStoreError('IO', `the write was stopped (${out.aborted})`);
    } catch (err) {
      // The record landed and only the views failed (t5.0b): that error says
      // what stands, and "{step.did}" below would be false.
      if (err?.changeStands === true) throw err;
      failure = err;
    }
    if (failure) {
      const wrapped = new WorkStoreError(
        failure instanceof WorkStoreError ? failure.code : 'IO',
        `${epicId}: current_epic is now ${epicId} in STATE.md, but ${step.did} — ${failure?.message ?? String(failure)} `
        + `Call openEpic(baseDir, '${epicId}', …) again with the same arguments to finish: current_epic is already set, so only the record is written.`,
      );
      wrapped.cause = failure;
      throw wrapped;
    }
  }
  return { epic: epicId, unit: step.unit };
}

