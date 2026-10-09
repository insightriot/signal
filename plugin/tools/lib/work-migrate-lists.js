// `/sig:docs-migrate --work-store` — turn the work store on for a project
// (M6.E15, FR1, FR2, AC7.3; SIG-274).
//
// A project's hand-kept lists (`BUGS.md`, `BACKLOG.md`, `ISSUES-INBOX.md`,
// `OPEN-QUESTIONS.md`) become records, and the lists become generated views.
// One path for a project with lists and a project without (D-M6E15-6): with no
// lists, the apply just writes `WORK.md` and the empty views.
//
// What S1 handles: no lists at all (the `/sig:init` / `/sig:new-project`
// shape — stamped layout v3 at birth, lists created lazily), and a `BACKLOG.md`
// that is exactly the skeleton a layout migration leaves (`backlog.js`
// `backlogSkeleton`). The skeleton is a named non-item region, never an item:
// it is moved to `.planning/archive/pre-work-store/` before the views are
// written, because `regenerateViews` refuses a list without the generated
// marker. Any other list content is refused for now — lists with items are
// split into records by a later slice (S3/S4).
//
// The command's contract is kept (D-M6E15-5): dry run by default; `--apply`
// refuses a dirty tree without `--force`, tags the pre-apply HEAD, leaves the
// changes staged and not committed, and prints the undo line. Refusals come
// first and write nothing, in a dry run or an apply:
//
//   - `WORK.md` exists, whatever it holds → "already on the store"
//     (D-M6E11-21; `isStoreOn` throws on a broken one, so this checks the file
//     exists rather than asking it);
//   - layout below v3, or no STATE.md → names the plain command (D-M6E15-8);
//   - a `--key` that `STORE_KEY_RE` rejects, or no key to propose → the rule;
//   - a list with anything but the skeleton → the later-slice refusal.
//
// The key: `--key` if given, else proposed from the folder name (D-M6E15-7).
// The dry run prints it; `--apply` without `--key` uses the same proposal.
//
// The input-hash guard covers STATE.md only, as `runMigrate`'s does; covering
// the lists is S4's (AC6.4).
//
// No v2 store module may import this one (`tests/legacy-lists.test.js`
// V2_MODULES): it will reach the list parsers.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { acquireLock } from './file-lock.js';
import {
  CURRENT_LAYOUT_VERSION,
  hashState,
  probeGitState,
  senseState,
  stagePaths,
  tagPreApply,
} from './migrate-memory.js';
import { lockFailure } from './work-errors.js';
import { GENERATED_FILES } from './work-generate.js';
import { isGeneratedFile } from './work-marker.js';
import { STORE_KEY_RE, WORK_DIR, WORK_FILE, WORK_LOCK_REL, WORK_LOCK_TTL_MS } from './work-store.js';
import { confineView, regenerateViews, VIEW_PATHS } from './work-views.js';

const WORK_MD_REL = `.planning/${WORK_DIR}/${WORK_FILE}`;
const STATE_REL = '.planning/STATE.md';
// Where a list goes when the store takes its path (the same folder Signal's own
// lists went to at M6.E11).
export const PRE_STORE_ARCHIVE_REL = '.planning/archive/pre-work-store';

const KEY_RULE = 'a project key is an uppercase letter, then 1–9 uppercase letters or digits (2–10 characters in all)';
export const LATER_SLICE_REFUSAL = 'lists with items are migrated by a later slice';

// `backlog.js` `backlogSkeleton` (:57), line for line: title, purpose line, an
// optional pointer to a backlog-review snapshot, the `*Last updated:*` footer.
// Kept in step with it by tests/work-store-enable.test.js, which builds its
// fixture with `createBacklogIfMissing`.
const BACKLOG_SKELETON_RE = new RegExp('^# Backlog\\n\\n'
  + 'Groomed, sequenced roadmap — promoted from the issues inbox\\. Roadmap-vs-hygiene is a \\*\\*Tag\\*\\* on each entry, not a separate file\\.\\n\\n'
  + '(?:> Seeded from \\[`[^`\\n]+`\\]\\([^)\\n]+\\) — its content restructure into this roadmap is pending \\(M5\\.E3\\.S6b\\)\\.\\n\\n)?'
  + '\\*Last updated: \\d{4}-\\d{2}-\\d{2}\\*\\n$');

/**
 * Propose a store key from a folder name: uppercase, keep letters and digits,
 * drop leading digits, at most 10 characters. Null when what is left is not a
 * valid key (fewer than 2 characters) — the caller then asks for `--key`.
 *
 * @param {string} folderName
 * @returns {string|null}
 */
export function proposeKey(folderName) {
  const key = String(folderName ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^[0-9]+/, '').slice(0, 10);
  return STORE_KEY_RE.test(key) ? key : null;
}

// WORK.md for a project the store was turned on in by this command. Names no
// maintainer script and no other project's history (AC7.3).
function workMd(key, archived) {
  const before = archived.length > 0
    ? `The lists kept by hand before then are kept, byte for byte, in \`${PRE_STORE_ARCHIVE_REL}/\`: ${archived.map((a) => `\`${basename(a.from)}\``).join(', ')}.`
    : 'This project had no lists when the store was turned on.';
  return `---
key: ${key}
schema_version: 2
---

# Work store

This file switches the work-item store on for this project. Every bug, backlog row, inbox capture and open question is one **record**, \`items/NN/${key}-n.json\` in this folder (NN is the item number divided by 1000, two digits), with its body beside it as \`${key}-n.md\`. **A record never moves.** Its status is not stored: it is derived from the record's own events — \`created\` → N, \`triaged\` → T, \`queued\` → Q, \`started\` → P, \`close_requested\` → *closing*, \`closed\` → C, \`reopened\` → T.

- \`items/\` — every record and its body, by number
- \`epics/<EpicID>/\` — an Epic's documents; its items are the records whose events name the Epic
- \`history/YYYY.md\` — closes from more than 30 days before the newest event (a view)

\`key\` is the prefix of every item ID (\`${key}-1\`, \`${key}-2\`, …).

\`BUGS.md\`, \`BACKLOG.md\`, \`ISSUES-INBOX.md\`, \`OPEN-QUESTIONS.md\`, \`work/EPICS.md\` and \`work/history/\` are views generated from the records — do not edit them. Change an item with \`/sig:item\` (\`new\`, \`triage\`, \`move\`, \`close\`, \`reopen\`, \`edit\`, \`show\`, \`list\`); a hook blocks hand edits to records.

The store was turned on by \`/sig:docs-migrate --work-store\`. ${before}
`;
}

// Everything both modes decide before writing: the refusals, the key, and what
// each list present is. Reads only.
function assess(baseDir, opts) {
  const refuse = (reason) => ({ refusal: reason });

  if (existsSync(join(baseDir, WORK_MD_REL))) {
    return refuse(`This project is already on the store: ${WORK_MD_REL} exists, so nothing was written. `
      + `If that file was made by hand in a project that was never migrated, delete it and re-run.`);
  }

  const statePath = join(baseDir, STATE_REL);
  const stateText = existsSync(statePath) ? readFileSync(statePath, 'utf-8') : null;
  const stamp = stateText === null ? null : senseState(stateText).stamp;
  if (stamp === null || stamp < CURRENT_LAYOUT_VERSION) {
    const at = stateText === null ? `there is no ${STATE_REL}` : `${STATE_REL} reads docs layout ${stamp ?? '(none)'}`;
    return refuse(`The work store needs docs layout ${CURRENT_LAYOUT_VERSION}, and ${at}. Nothing was written. `
      + 'Bring the layout up first: `/sig:docs-migrate` (a dry run), then `/sig:docs-migrate --apply`, commit, '
      + 'then re-run with --work-store.');
  }

  const folder = basename(resolve(baseDir));
  let key;
  let keySource;
  if (opts.key !== undefined && opts.key !== null) {
    if (typeof opts.key !== 'string' || !STORE_KEY_RE.test(opts.key)) {
      return refuse(`--key ${JSON.stringify(opts.key)} is not a valid key: ${KEY_RULE}. Nothing was written.`);
    }
    key = opts.key;
    keySource = '--key';
  } else {
    key = proposeKey(folder);
    if (key === null) {
      return refuse(`No key can be proposed from the folder name ${JSON.stringify(folder)}: ${KEY_RULE}. `
        + 'Pass one with --key KEY. Nothing was written.');
    }
    keySource = 'folder';
  }

  const files = [];
  for (const name of GENERATED_FILES) {
    const rel = `.planning/${name}`;
    const abs = join(baseDir, rel);
    if (!existsSync(abs)) continue;
    const text = readFileSync(abs, 'utf-8');
    if (name === 'BACKLOG.md' && BACKLOG_SKELETON_RE.test(text)) {
      files.push({ file: rel, items: 0, open: 0, closed: 0, flagged: 0, regions: ['backlog skeleton'] });
      continue;
    }
    return refuse(`${rel} holds entries (it is not the empty BACKLOG.md skeleton): ${LATER_SLICE_REFUSAL}. `
      + 'Nothing was written.');
  }

  return { key, keySource, folder, files, inputHash: hashState(stateText) };
}

const archiveRel = (file) => `${PRE_STORE_ARCHIVE_REL}/${basename(file)}`;

function dryRunReport(a) {
  const lines = ['/sig:docs-migrate --work-store — dry run (nothing written)', ''];
  lines.push(a.keySource === '--key'
    ? `Project key: ${a.key} (from --key)`
    : `Project key: ${a.key} (proposed from the folder name "${a.folder}"; pass --key KEY to choose another)`);
  if (a.files.length === 0) {
    lines.push('Lists: none — the store starts empty.');
  } else {
    for (const f of a.files) {
      lines.push(`${f.file}: ${f.items} items (${f.open} open, ${f.closed} closed, ${f.flagged} flagged), `
        + `${f.regions.length} non-item region (${f.regions.join(', ')}) — moved to ${archiveRel(f.file)}`);
    }
  }
  lines.push('', `--apply writes ${WORK_MD_REL} and the generated views (${Object.values(VIEW_PATHS).join(', ')}), `
    + 'and leaves them staged, not committed.');
  return lines.join('\n');
}

// The undo line, worded for this migration. Clean git: reset to the tag. With
// --force on a dirty tree, or outside git, only this migration's files are
// undone: the files it created are removed, then each archived list is moved
// back to its path.
function revertLineFor(probe, force, tag, created, archived) {
  const fileUndo = [`rm -f -- ${created.join(' ')}`, ...archived.map((a) => `mv -- ${a.to} ${a.from}`)].join(' && ');
  if (probe.mode !== 'git') return `# no git: undo with ${fileUndo}`;
  if (probe.dirty && force) {
    const staged = [...created, ...archived.map((a) => a.to)];
    return '# --force on a dirty tree: do NOT \'git reset --hard\' (it would discard your other uncommitted work). '
      + `Undo only this migration: git reset -q -- ${staged.join(' ')} && ${fileUndo}`;
  }
  return `git reset --hard ${tag ?? '<pre-apply-commit>'}   # discards the staged work-store changes`;
}

/**
 * Run `/sig:docs-migrate --work-store`. Dry run unless `apply`.
 *
 * @param {string} baseDir — project root
 * @param {{apply?: boolean, force?: boolean, key?: string, expectedHash?: string,
 *          stamp?: string, execFn?: typeof execFileSync}} [opts]
 * @returns {Promise<object>} a refusal `{applied: false, refused: true, reason}`; a dry run
 *   `{applied: false, dryRun: true, key, files, inputHash, report}`; or an apply
 *   `{applied: true, key, mode, tag, revertLine, written, archived, warnings, report}`
 * @throws {WorkStoreError} LOCKED / IO when the `work` lock cannot be taken; whatever
 *   the write threw, after this migration's files are undone
 */
export async function runWorkStoreMigrate(baseDir, opts = {}) {
  const apply = opts.apply ?? false;
  const force = opts.force ?? false;
  const execFn = opts.execFn ?? execFileSync;
  const stamp = opts.stamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  const refused = (reason, extra = {}) => ({ applied: false, refused: true, reason, ...extra });

  const a = assess(baseDir, opts);
  if (a.refusal) return refused(a.refusal);
  if (!apply) {
    return { applied: false, dryRun: true, key: a.key, files: a.files, inputHash: a.inputHash, report: dryRunReport(a) };
  }

  const probe = probeGitState(baseDir, { execFn, force });
  if (!probe.proceed) return refused(probe.reason, { warnings: probe.warnings });

  const archived = a.files.map((f) => ({ from: f.file, to: archiveRel(f.file) }));
  // Nothing is ever written through a link, and an archive copy is never overwritten.
  for (const rel of [WORK_MD_REL, ...Object.values(VIEW_PATHS), ...archived.map((x) => x.to)]) confineView(baseDir, rel);
  const taken = archived.filter((x) => existsSync(join(baseDir, x.to)));
  if (taken.length > 0) {
    return refused(`${taken.map((x) => x.to).join(', ')} already exists; it is never overwritten. Nothing was written.`);
  }

  const workDir = join(baseDir, '.planning', WORK_DIR);
  const workDirExisted = existsSync(workDir);
  let lock;
  try {
    lock = await acquireLock(join(baseDir, WORK_LOCK_REL), { label: 'work store migration', ttlMs: WORK_LOCK_TTL_MS });
  } catch (err) {
    throw lockFailure(err);
  }
  let tag = null;
  let written = [];
  let refusal = null;
  try {
    // Again under the lock: another writer may have turned the store on, or
    // STATE.md may have changed since the dry run.
    const again = assess(baseDir, opts);
    if (again.refusal) refusal = again.refusal;
    else if (opts.expectedHash && opts.expectedHash !== again.inputHash) {
      refusal = `${STATE_REL} changed since the dry run, so nothing was written. Re-run the dry run.`;
    }
    if (refusal === null) {
      if (probe.mode === 'git') tag = tagPreApply(baseDir, `pre-work-store-${stamp}`, execFn);
      try {
        for (const x of archived) {
          mkdirSync(dirname(join(baseDir, x.to)), { recursive: true });
          renameSync(join(baseDir, x.from), join(baseDir, x.to)); // the same bytes, by construction
        }
        await atomicWrite(join(baseDir, WORK_MD_REL), workMd(a.key, archived));
        ({ written } = await regenerateViews(baseDir));
      } catch (err) {
        undo(baseDir, archived);
        if (tag) {
          try {
            execFn('git', ['tag', '-d', tag], { cwd: baseDir, stdio: ['ignore', 'ignore', 'ignore'] });
          } catch {
            /* best-effort — keep the original throw */
          }
        }
        throw err;
      }
    }
  } finally {
    await lock.released();
    // A refusal under the lock leaves no empty folder behind the lock.
    if (refusal !== null && !workDirExisted) {
      try {
        rmdirSync(workDir);
      } catch {
        /* not empty, or gone — leave it */
      }
    }
  }
  if (refusal !== null) return refused(refusal);

  const created = [WORK_MD_REL, ...written];
  if (probe.mode === 'git') stagePaths(baseDir, [...created, ...archived.map((x) => x.to)], execFn);
  const revertLine = revertLineFor(probe, force, tag, created, archived);
  const report = [
    `/sig:docs-migrate --work-store — the work store is on (key ${a.key})`,
    '',
    `Wrote ${WORK_MD_REL} and the generated views: ${written.join(', ')}.`,
    ...archived.map((x) => `Moved ${x.from} (the empty skeleton, no items) to ${x.to}, byte for byte.`),
    probe.mode === 'git' ? 'Staged, not committed — review with `git diff --cached`, then commit.' : 'Not a git checkout: nothing staged.',
    ...(tag ? [`Pre-apply tag: ${tag}`] : []),
    `Undo: ${revertLine}`,
  ].join('\n');
  return { applied: true, key: a.key, mode: probe.mode, tag, revertLine, written, archived, warnings: probe.warnings, report };
}

// Put the project back after a failed write: remove WORK.md and every view this
// run wrote (a generated file at a view path is ours — anything hand-kept was
// refused before a write), then move each archived list back. Best-effort, so
// the original error is the one reported.
function undo(baseDir, archived) {
  for (const rel of Object.values(VIEW_PATHS)) {
    const abs = join(baseDir, rel);
    try {
      if (isGeneratedFile(abs)) unlinkSync(abs);
    } catch {
      /* best-effort */
    }
  }
  try {
    unlinkSync(join(baseDir, WORK_MD_REL));
  } catch {
    /* best-effort */
  }
  for (const x of archived) {
    try {
      if (!existsSync(join(baseDir, x.from))) renameSync(join(baseDir, x.to), join(baseDir, x.from));
    } catch {
      /* best-effort */
    }
  }
}
