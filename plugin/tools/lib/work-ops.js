// The Epic close — the one `work-ops.js` entry left (M6.E11 t5.3, narrowed
// at M6.E13 t7.4).
//
// Until M6.E13 this was `/sig:item`'s v1 library: every change to an item
// FILE (capture, move, close, reopen, triage) went through here, and each
// moved the file between status folders. The cutover made items JSON records
// that never move, written by `work-records.js`, and t7.4 retired the v1
// mutations and readers. What stays is `closeEpic`: SHIP §6.8 archives the
// Epic's folder — documents only on a v2 store — after `work-records.js`
// `closeEpicCheck` says every record of the Epic is done. It runs only on a v2
// store; a v1 store refuses (CONFIG, naming `node tools/work-migrate-v2.mjs`).
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
import { acquireLock } from './file-lock.js';
import { assertRealInsidePlanning } from './path-confine.js';
import { EPIC_ID_STRICT_RE, parseFrontmatter, StateSchemaError, stringifyFrontmatter } from './state.js';
import { asWorkStoreError, lockFailure, WorkStoreError } from './work-errors.js';
import { assertNoHandKeptLists, EPIC_README } from './work-generate.js';
import { rewriteRelativeLinks } from './work-links.js';
import { assertWritable, closeEpicCheck } from './work-records.js';
import { regenerateViews } from './work-views.js';
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
    execFn('git', ['--literal-pathspecs', 'ls-files', '--error-unmatch', '--', rel], { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'] });
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
    execFn('git', ['--literal-pathspecs', 'mv', '--', fromRel, toRel], { cwd: baseDir, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const code = err instanceof WorkStoreError ? err.code : 'IO';
    const wrapped = new WorkStoreError(code, `${done}, but the views were not regenerated: ${err?.message ?? err}`);
    wrapped.cause = err;
    throw wrapped;
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
 * @param {string} baseDir
 * @param {string} epicId
 * @param {{by: string, pr?: string|number, release?: string, at?: string}} close — `at` defaults to now
 * @param {{execFn?: Function, renameFn?: Function}} [opts]
 * @returns {Promise<{status: 'no-folder'} | {status: 'already-archived', path: string}
 *   | {status: 'closed', from: string, to: string, moved: string[], rewritten: string[], close: object}>}
 *   `rewritten` — live files outside the folder whose links into it were
 *   retargeted at the archive, relative to `baseDir` — or `{aborted, sensitiveHits}` (the sensitive-data rule, over pr/release)
 * @throws {WorkStoreError} CONFIG (store off, or v1), SCHEMA (bad ID, no `by`,
 *   a broken record or README),
 *   OPEN_ITEMS (each open item named), CONFLICT (archive folder exists, the
 *   folder holds something that is not a file or folder, or the Epic has
 *   `{EpicID}-*.md` artifacts at the `.planning/` root — each named; the
 *   retrospective and profile are expected there and do not count)
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
