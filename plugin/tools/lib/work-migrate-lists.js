// `/sig:docs-migrate --work-store` — turn the work store on for a project
// (M6.E15, FR1, FR2, FR6, AC7.3; SIG-274).
//
// A project's hand-kept lists (`BUGS.md`, `BACKLOG.md`, `ISSUES-INBOX.md`,
// `OPEN-QUESTIONS.md`) become records, and the lists become generated views.
// One path for a project with lists and a project without (D-M6E15-6): with no
// lists, the apply just writes `WORK.md` and the empty views.
//
// The lists are planned as records by `planListsToRecords` below (pure). The
// exact `BACKLOG.md` skeleton a layout migration leaves is one named non-item
// region, never an item. Every list present is moved, byte for byte, to
// `.planning/archive/pre-work-store/` with a `MANIFEST.json` (counts, per-item
// source line ranges, the verification result, where the dates came from).
//
// The command's contract is kept (D-M6E15-5): dry run by default; `--apply`
// refuses a dirty tree without `--force`, tags the pre-apply HEAD, leaves the
// changes staged and not committed, and prints the undo line. Refusals come
// first and write nothing, in a dry run or an apply:
//
//   - `WORK.md` exists, whatever it holds → "already on the store"
//     (D-M6E11-21; `isStoreOn` throws on a broken one, so this checks the file
//     exists rather than asking it);
//   - a path the run reads or writes runs through a symbolic link, or
//     `.planning/` resolves outside the repository (M6.E14's linked-`.planning`
//     class); a list that is a link or not a regular file is never read;
//   - layout below v3, or no STATE.md → names the plain command (D-M6E15-8);
//   - a `--key` that `STORE_KEY_RE` rejects, or no key to propose → the rule;
//   - a store file or archive copy already at a path the run would write;
//   - the plan fails its checks (a source byte unaccounted for, an invalid
//     record) — the whole apply is refused (D-M6E15-9).
// A sensitive-data hit in a planned record (scrub.js; Signal's own dedupe-key
// comments excepted, D-M6E15-23) is listed by the dry run and stops the apply
// (`aborted: 'sensitive-data-pending'`) until the caller passes
// `acknowledgeSensitive` after a person has read the hits.
//
// The key: `--key` if given, else proposed from the folder name (D-M6E15-7).
// The dry run prints it; `--apply` without `--key` uses the same proposal.
//
// The input hash covers STATE.md and the four lists (AC6.4): a change to any of
// them between the dry run and the apply aborts the apply before any write.
//
// Dates (D-M6E15-19): each list's first and last commit dates from git,
// following renames; outside git, or for a file git has no history for, the
// file's modification date — the manifest says which.
//
// A project with a `.planning/INDEX.md` gets it regenerated after the swap
// (t4.8), as `/sig:docs-index` would, so the first `/sig:docs-sweep` does not
// report it stale and every new item file as an orphan. A hand-written
// (foreign) INDEX.md is left as it is and the report says so; a project
// without one does not get one. It is staged with the rest, and put back on
// a failure.
//
// The apply builds aside, then swaps (D-M6E15-20): the records, WORK.md and the
// views are written and verified in a sibling folder under `.planning/` (same
// filesystem, so every move is a rename), then the lists move to the archive
// and the built store moves in. On any failure after the first move the
// project is put back: each generated view is deleted, then its archive copy
// is renamed back — never written over a view (`atomicWrite` refuses a
// generated file). The snapshotter is not used.
//
// No v2 store module may import this one (`tests/legacy-lists.test.js`
// V2_MODULES): it reaches the list parsers.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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
import { isForeignIndexFormat, regeneratePlanningIndexCore } from './planning-index.js';
import { readRegularFile, regularFileRefusal } from './path-confine.js';
import { bodyDirFor } from './work-convert.js';
import { lockFailure, WorkStoreError } from './work-errors.js';
import { GENERATED_FILES } from './work-generate.js';
import { rewriteRelativeLinks } from './work-links.js';
import {
  backlogTag,
  bugTitle,
  clip,
  finishedLead,
  legacyIdOf,
  markerDates,
  segmentBacklog,
  segmentBugs,
  segmentInbox,
  segmentQuestions,
  SOURCES,
  TAG_TYPES,
} from './work-migrate.js';
import { checkEvents, serializeRecord, validateRecord } from './work-record.js';
import { bodyPath, checkRecords, listRecords, recordPath } from './work-records.js';
import { scrubSensitive } from './scrub.js';
import { isGeneratedFile } from './work-marker.js';
import { STORE_KEY_RE, WORK_DIR, WORK_FILE, WORK_LOCK_REL, WORK_LOCK_TTL_MS } from './work-store.js';
import { confineView, regenerateViews, VIEW_PATHS } from './work-views.js';

const WORK_MD_REL = `.planning/${WORK_DIR}/${WORK_FILE}`;
const ITEMS_REL = `.planning/${WORK_DIR}/items`;
const HISTORY_REL = `.planning/${WORK_DIR}/history`;
const STATE_REL = '.planning/STATE.md';
const INDEX_REL = '.planning/INDEX.md';
// Where a list goes when the store takes its path (the same folder Signal's own
// lists went to at M6.E11).
export const PRE_STORE_ARCHIVE_REL = '.planning/archive/pre-work-store';
export const MANIFEST_REL = `${PRE_STORE_ARCHIVE_REL}/MANIFEST.json`;

const KEY_RULE = 'a project key is an uppercase letter, then 1–9 uppercase letters or digits (2–10 characters in all)';

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
    ? `The lists kept by hand before then are kept, byte for byte, in \`${PRE_STORE_ARCHIVE_REL}/\`: ${archived.map((a) => `\`${basename(a.from)}\``).join(', ')}, with \`MANIFEST.json\` saying where each entry went.`
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

// A list's first and last dates (D-M6E15-19): its first and last commit from
// git, else — outside git, or a file git has no history for — the file's
// modification date. `source` says which. `--follow`, so a list the layout
// migration renamed (`FUTURE-IDEAS.md` → `ISSUES-INBOX.md`) dates from its
// original first commit, not from the rename (t4.8).
function listDates(baseDir, rel, execFn) {
  let out = '';
  try {
    out = String(execFn('git', ['log', '--follow', '--format=%ad', '--date=short', '--', rel], {
      cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024,
    })).trim();
  } catch {
    out = '';
  }
  if (out !== '') {
    const days = out.split('\n');
    return { first: days.at(-1), last: days[0], source: 'git' };
  }
  const day = statSync(join(baseDir, rel)).mtime.toISOString().slice(0, 10);
  return { first: day, last: day, source: 'mtime' };
}

// The token the dry run hands the apply: STATE.md and every list, each named,
// an absent list distinct from an empty one (AC6.4).
function inputHashOf(stateText, texts) {
  const parts = [['STATE.md', stateText], ...GENERATED_FILES.map((n) => [n, texts[n] ?? null])];
  return hashState(parts.map(([n, t]) => `${n}\0${t === null ? '\u0001absent' : t}\0`).join(''));
}

// Everything both modes decide before writing: the refusals, the key, the
// lists' texts and dates, and the plan. Reads only.
function assess(baseDir, opts) {
  const refuse = (reason) => ({ refusal: reason });

  if (existsSync(join(baseDir, WORK_MD_REL))) {
    return refuse(`This project is already on the store: ${WORK_MD_REL} exists, so nothing was written. `
      + `If that file was made by hand in a project that was never migrated, delete it and re-run.`);
  }

  // Before any read: no store path through a link, `.planning/` inside the
  // repository, and every list a regular file (t4.6).
  for (const rel of [WORK_MD_REL, `${ITEMS_REL}/x`, `${HISTORY_REL}/x`, MANIFEST_REL]) {
    try {
      confineView(baseDir, rel);
    } catch (err) {
      return refuse(String(err.message));
    }
  }
  for (const name of GENERATED_FILES) {
    const why = regularFileRefusal(baseDir, `.planning/${name}`);
    if (why !== null) {
      return refuse(`${why}. Nothing was read or written: a list is migrated only from a regular file inside the project. `
        + 'Replace the link with the file it points at (or remove it), commit, then re-run.');
    }
  }
  for (const rel of Object.values(VIEW_PATHS)) {
    try {
      confineView(baseDir, rel);
    } catch (err) {
      return refuse(String(err.message));
    }
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

  const texts = {};
  const dates = {};
  const present = [];
  for (const name of GENERATED_FILES) {
    const rel = `.planning/${name}`;
    if (!existsSync(join(baseDir, rel))) continue;
    texts[name] = readRegularFile(baseDir, rel);
    dates[name] = listDates(baseDir, rel, opts.execFn);
    present.push(name);
  }
  const archived = present.map((name) => ({ from: `.planning/${name}`, to: archiveRel(name) }));

  // Never overwrite: a store file or an archive copy already where this run
  // would put one.
  const taken = [ITEMS_REL, HISTORY_REL, VIEW_PATHS.epics, MANIFEST_REL, ...archived.map((x) => x.to)]
    .filter((rel) => existsSync(join(baseDir, rel)));
  if (taken.length > 0) {
    return refuse(`${taken.join(', ')} already exist${taken.length === 1 ? 's' : ''}; this run never overwrites one, so nothing was written. `
      + 'Move it aside (or remove it), commit, then re-run.');
  }

  const planOpts = { key, dates, ...(opts.segmenters ? { segmenters: opts.segmenters } : {}) };
  let plan = planListsToRecords(texts, planOpts);
  let sensitiveHits = [];
  if (plan.aborted === 'sensitive-data-pending') {
    sensitiveHits = plan.hits;
    plan = planListsToRecords(texts, { ...planOpts, acknowledgeSensitive: true });
  }
  if (plan.errors.length > 0) {
    return refuse(`The lists could not be planned as records, so nothing was written:\n  ${plan.errors.join('\n  ')}`);
  }

  const files = present.map((name) => {
    const f = plan.manifest.files[name] ?? { items: 0, open: 0, closed: 0, flagged: 0, regions: [] };
    return { file: `.planning/${name}`, items: f.items, open: f.open, closed: f.closed, flagged: f.flagged, regions: f.regions.map((r) => r.name) };
  });
  return { key, keySource, folder, files, archived, dates, plan, sensitiveHits, inputHash: inputHashOf(stateText, texts) };
}

function archiveRel(file) {
  return `${PRE_STORE_ARCHIVE_REL}/${basename(file)}`;
}

// "blank ×12, separator ×3" — a file's region names, counted.
function regionSummary(names) {
  const counts = new Map();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c === 1 ? n : `${n} ×${c}`)).join(', ');
}

const DATE_SOURCE = { git: 'git history', mtime: 'file modification date — no git history' };

// A hit's match, shown only by its start: enough to find it in the file.
const masked = (m) => (m.length > 8 ? `${m.slice(0, 6)}…` : m);

// List text shown to a person before they confirm (titles, old IDs, region
// names) carries no control characters, C0 and DEL: a terminal would act on
// them. Applied per line, so the report's own line breaks stay.
// eslint-disable-next-line no-control-regex
const printable = (s) => String(s).replace(/[\u0000-\u001f\u007f]/g, '');

function dryRunReport(a) {
  const lines = ['/sig:docs-migrate --work-store — dry run (nothing written)', ''];
  lines.push(a.keySource === '--key'
    ? `Project key: ${a.key} (from --key)`
    : `Project key: ${a.key} (proposed from the folder name "${a.folder}"; pass --key KEY to choose another)`);
  if (a.files.length === 0) {
    lines.push('Lists: none — the store starts empty.');
  } else {
    for (const f of a.files) {
      const n = f.regions.length;
      lines.push(`${f.file}: ${f.items} items (${f.open} open, ${f.closed} closed, ${f.flagged} flagged), `
        + `${n} non-item region${n === 1 ? '' : 's'}${n > 0 ? ` (${regionSummary(f.regions)})` : ''} — moved to ${archiveRel(f.file)}`);
      const d = a.dates[basename(f.file)];
      if (f.items > 0 && d) lines.push(`  dates: first ${d.first}, last ${d.last} (${DATE_SOURCE[d.source]})`);
    }
  }
  const items = a.plan.manifest.items;
  if (items.length > 0) {
    lines.push('', 'Items — new ID, old ID, status (N new, T open, C closed), title:');
    for (const it of items) {
      lines.push(`  ${it.id}  ${it.legacy_id ?? '—'}  ${it.status}  ${it.title}${it.flag ? `  [flagged: ${it.flag}]` : ''}`);
    }
    const flagged = items.filter((it) => it.flag).length;
    if (flagged > 0) {
      lines.push('', `${flagged} item${flagged === 1 ? ' is' : 's are'} flagged: left open for a person's look, each with a migration_note saying why. `
        + 'Triage them with /sig:item after the apply.');
    }
  }
  if (a.sensitiveHits.length > 0) {
    lines.push('', `Sensitive data found — the apply stops here until you decide (keep the text as it is, or abort and edit the list first):`);
    for (const h of a.sensitiveHits) lines.push(`  ${h.id} (${h.file}): ${h.type} "${masked(h.match)}"`);
  }
  lines.push('', `--apply moves ${a.files.length > 0 ? 'each list' : 'nothing'}${a.files.length > 0 ? ` to ${PRE_STORE_ARCHIVE_REL}/ (with MANIFEST.json)` : ''}, `
    + `writes ${items.length} record${items.length === 1 ? '' : 's'}, ${WORK_MD_REL} and the generated views `
    + `(${Object.values(VIEW_PATHS).join(', ')}, plus .planning/work/history/ for closes more than 30 days old), `
    + `regenerates .planning/INDEX.md if the project has one, and leaves them staged, not committed.`);
  return lines.map(printable).join('\n');
}

// The undo line, worded for this migration. Clean git: reset to the tag. With
// --force on a dirty tree, or outside git, only this migration's files are
// undone: the files and folders it created are removed, then each archived
// list is moved back. `fs-backup` is outside git, an unborn HEAD, or an ignored
// `.planning/` (`probeGitState`); none can be reset to a commit.
function revertLineFor(probe, force, tag, created, archived, indexRegenerated) {
  const fileUndo = [`rm -rf -- ${created.join(' ')}`, ...archived.map((a) => `mv -- ${a.to} ${a.from}`)].join(' && ')
    + (indexRegenerated ? `, then run /sig:docs-index to regenerate ${INDEX_REL}` : '');
  if (probe.mode !== 'git') return `# nothing staged (.planning/ is not under git): undo with ${fileUndo}`;
  if (probe.dirty && force) {
    const staged = [...created, ...archived.map((a) => a.to), ...(indexRegenerated ? [INDEX_REL] : [])];
    return '# --force on a dirty tree: do NOT \'git reset --hard\' (it would discard your other uncommitted work). '
      + `Undo only this migration: git reset -q -- ${staged.join(' ')} && ${fileUndo}`;
  }
  return `git reset --hard ${tag ?? '<pre-apply-commit>'}   # discards the staged work-store changes`;
}

// Why a store at `root` is not the `count` records the plan made, or [].
function builtErrors(root, count) {
  const errors = [];
  const listed = listRecords(root);
  if (listed.version !== 2) errors.push(`the store reads as v${listed.version}, not v2`);
  if (listed.records.length !== count) errors.push(`the store holds ${listed.records.length} records, not ${count}`);
  for (const b of listed.broken) errors.push(`record ${b.id ?? b.path} is broken: ${b.error}`);
  for (const f of checkRecords(root)) errors.push(`checkRecords ${f.code}${f.id ? ` ${f.id}` : ''}: ${f.message}`);
  return errors;
}

// Write WORK.md and every planned record and body under `aside` — a folder
// that mirrors the project root and holds nothing else. The project itself is
// not touched here.
async function buildAside(aside, records, workMdText) {
  const workMdAbs = join(aside, WORK_MD_REL);
  mkdirSync(dirname(workMdAbs), { recursive: true });
  await atomicWrite(workMdAbs, workMdText);
  for (const r of records) {
    const rec = join(aside, r.recordPath);
    mkdirSync(dirname(rec), { recursive: true });
    await atomicWrite(rec, serializeRecord(r.record));
    await atomicWrite(join(aside, r.bodyPath), r.body);
  }
}

// `mkdir -p`, remembering each folder it created (deepest last) so a restore
// can remove exactly those.
function mkdirTracked(dir, made) {
  const missing = [];
  for (let d = dir; !existsSync(d); d = dirname(d)) missing.unshift(d);
  mkdirSync(dir, { recursive: true });
  made.push(...missing);
}

// Put the project back after a failure part-way through the swap. Each view
// the swap moved in is deleted (a generated file at a view path is ours —
// anything hand-kept there was moved to the archive first), then each list's
// archive copy is renamed back; a view is never written over. Folders the swap
// created are removed only when empty, so an archive copy that could not be
// moved back is never lost. Best-effort, so the original error is the one
// reported.
function restore(baseDir, done) {
  const quietly = (fn) => {
    try {
      fn();
    } catch {
      /* best-effort */
    }
  };
  for (const rel of done.views) quietly(() => { if (isGeneratedFile(join(baseDir, rel))) unlinkSync(join(baseDir, rel)); });
  if (done.items) quietly(() => rmSync(join(baseDir, ITEMS_REL), { recursive: true, force: true }));
  if (done.workMd) quietly(() => unlinkSync(join(baseDir, WORK_MD_REL)));
  if (done.manifest) quietly(() => unlinkSync(join(baseDir, MANIFEST_REL)));
  if (done.index !== null) quietly(() => writeFileSync(join(baseDir, INDEX_REL), done.index));
  for (const x of [...done.archived].reverse()) {
    quietly(() => {
      if (!existsSync(join(baseDir, x.from))) renameSync(join(baseDir, x.to), join(baseDir, x.from));
    });
  }
  for (const d of [...done.made].reverse()) quietly(() => rmdirSync(d));
}

// Build the store aside, verify it, then swap it in and verify again. Throws
// (after `restore`) on any failure; the project is unchanged until the swap.
async function buildAndSwap(baseDir, a, ctx) {
  const aside = join(baseDir, ctx.asideRel);
  const records = a.plan.records;
  await buildAside(aside, records, workMd(a.key, a.archived));
  const { written } = await regenerateViews(aside);
  const built = builtErrors(aside, records.length);
  if (built.length > 0) {
    throw new WorkStoreError('SCHEMA', `the store built aside did not verify, so the project was not changed:\n  ${built.join('\n  ')}`);
  }

  const step = (name) => ctx.onSwapStep?.(name);
  // `index`: INDEX.md's bytes before it was regenerated, or null.
  const done = { archived: [], views: [], made: [], items: false, workMd: false, manifest: false, index: null };
  let index = null; // 'regenerated' | 'foreign' | 'not-a-file' | null
  try {
    step('archive');
    if (a.archived.length > 0) mkdirTracked(join(baseDir, PRE_STORE_ARCHIVE_REL), done.made);
    for (const x of a.archived) {
      renameSync(join(baseDir, x.from), join(baseDir, x.to)); // the same bytes, by construction
      done.archived.push(x);
    }
    step('work');
    mkdirTracked(join(baseDir, '.planning', WORK_DIR), done.made);
    renameSync(join(aside, WORK_MD_REL), join(baseDir, WORK_MD_REL));
    done.workMd = true;
    if (existsSync(join(aside, ITEMS_REL))) {
      renameSync(join(aside, ITEMS_REL), join(baseDir, ITEMS_REL));
      done.items = true;
    }
    step('views');
    for (const rel of written) {
      confineView(baseDir, rel);
      mkdirTracked(dirname(join(baseDir, rel)), done.made);
      renameSync(join(aside, rel), join(baseDir, rel));
      done.views.push(rel);
    }
    step('verify');
    const after = builtErrors(baseDir, records.length);
    if (after.length > 0) throw new WorkStoreError('SCHEMA', `the migrated store did not verify:\n  ${after.join('\n  ')}`);
    if (a.archived.length > 0) {
      const manifest = {
        migration: '/sig:docs-migrate --work-store',
        key: a.key,
        archived: a.archived,
        dates: a.dates,
        datesNote: 'created.at is each list’s first date; a close is at the date its marker writes, else the list’s last date. '
          + '`source: git` — first and last commit; `source: mtime` — the file’s modification date (no git history).',
        files: a.plan.manifest.files,
        items: a.plan.manifest.items,
        verification: {
          ok: true,
          conservation: 'every byte of each list is in exactly one record body or one named non-item region (files.*.verified)',
          records: records.length,
          checkRecords: [],
        },
        ...(a.sensitiveHits.length > 0
          ? { sensitive: { acknowledged: true, hits: a.sensitiveHits.map((h) => ({ id: h.id, file: h.file, type: h.type })) } }
          : {}),
      };
      done.manifest = true;
      await atomicWrite(join(baseDir, MANIFEST_REL), `${JSON.stringify(manifest, null, 2)}\n`);
    }
    // INDEX.md lists every .md under .planning/, the aside's included: the
    // aside goes first, so the index is not stale the moment it is removed.
    if (existsSync(join(baseDir, INDEX_REL))) {
      rmSync(aside, { recursive: true, force: true });
      const before = regularFileRefusal(baseDir, INDEX_REL) === null ? readRegularFile(baseDir, INDEX_REL) : null;
      if (before === null) {
        index = 'not-a-file';
      } else if (isForeignIndexFormat(before)) {
        index = 'foreign';
      } else {
        done.index = before;
        if ((await regeneratePlanningIndexCore(baseDir)).written) index = 'regenerated';
      }
    }
    step('index');
  } catch (err) {
    restore(baseDir, done);
    throw err;
  }
  return { written, items: records.length > 0, manifest: a.archived.length > 0, index };
}

/**
 * Run `/sig:docs-migrate --work-store`. Dry run unless `apply`.
 *
 * @param {string} baseDir — project root
 * @param {{apply?: boolean, force?: boolean, key?: string, expectedHash?: string,
 *          acknowledgeSensitive?: boolean, stamp?: string, execFn?: typeof execFileSync,
 *          onSwapStep?: (step: 'archive'|'work'|'views'|'verify'|'index') => void,
 *          segmenters?: Record<string, (text: string) => object>}} [opts]
 *   `acknowledgeSensitive`: go ahead past the sensitive-data hits the dry run
 *   listed, after a person has read them (the text is kept as it is).
 *   `onSwapStep`: TEST SEAM ONLY — called before each step of the swap, so a
 *   test can fail one and prove the project is put back. `segmenters`: TEST
 *   SEAM ONLY — passed to `planListsToRecords`, to prove a segmentation that
 *   loses a byte refuses the whole run (AC6.2). Production callers pass neither.
 * @returns {Promise<object>} a refusal `{applied: false, refused: true, reason}`; a
 *   sensitive-data stop `{applied: false, aborted: 'sensitive-data-pending', hits, reason}`;
 *   a dry run `{applied: false, dryRun: true, key, files, items, dates, sensitiveHits,
 *   inputHash, report}`; or an apply `{applied: true, key, mode, tag, revertLine, written,
 *   archived, records, flagged, warnings, report}`
 * @throws {WorkStoreError} LOCKED / IO when the `work` lock cannot be taken; whatever
 *   the build or the swap threw, after the project is put back and the tag removed
 */
export async function runWorkStoreMigrate(baseDir, opts = {}) {
  const apply = opts.apply ?? false;
  const force = opts.force ?? false;
  const execFn = opts.execFn ?? execFileSync;
  const stamp = opts.stamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  const refused = (reason, extra = {}) => ({ applied: false, refused: true, reason, ...extra });
  const sensitiveStop = (hits) => ({
    applied: false,
    aborted: 'sensitive-data-pending',
    hits,
    reason: `${hits.length} sensitive-data hit${hits.length === 1 ? '' : 's'} in the lists (see the dry run); nothing was written. `
      + 'Keep the text as it is (re-run the apply with acknowledgeSensitive), or abort and edit the list first.',
  });

  const a = assess(baseDir, { ...opts, execFn });
  if (a.refusal) return refused(a.refusal);
  if (!apply) {
    return {
      applied: false, dryRun: true, key: a.key, files: a.files, items: a.plan.manifest.items, dates: a.dates,
      sensitiveHits: a.sensitiveHits, inputHash: a.inputHash, report: dryRunReport(a),
    };
  }
  if (a.sensitiveHits.length > 0 && !opts.acknowledgeSensitive) return sensitiveStop(a.sensitiveHits);

  const probe = probeGitState(baseDir, { execFn, force });
  if (!probe.proceed) return refused(probe.reason, { warnings: probe.warnings });

  const asideRel = `.planning/.work-store-build-${stamp}`;
  try {
    confineView(baseDir, `${asideRel}/x`);
  } catch (err) {
    return refused(String(err.message));
  }
  if (existsSync(join(baseDir, asideRel))) {
    return refused(`${asideRel} already exists (left by an interrupted run?); nothing was written. Remove it, then re-run.`);
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
  let swapped = null;
  let stop = null; // a refusal or a sensitive-data stop found under the lock
  let failed = false;
  let b = null;
  try {
    // Again under the lock: another writer may have turned the store on, or
    // STATE.md or a list may have changed since the dry run.
    b = assess(baseDir, { ...opts, execFn });
    if (b.refusal) stop = refused(b.refusal);
    else if (opts.expectedHash && opts.expectedHash !== b.inputHash) {
      stop = refused(`${STATE_REL} or a list (${GENERATED_FILES.join(', ')}) changed since the dry run, so nothing was written. `
        + 'Re-run the dry run.');
    } else if (b.sensitiveHits.length > 0 && !opts.acknowledgeSensitive) stop = sensitiveStop(b.sensitiveHits);
    if (stop === null) {
      if (probe.mode === 'git') tag = tagPreApply(baseDir, `pre-work-store-${stamp}`, execFn);
      try {
        swapped = await buildAndSwap(baseDir, b, { asideRel, onSwapStep: opts.onSwapStep });
      } catch (err) {
        failed = true;
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
    try {
      rmSync(join(baseDir, asideRel), { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
    await lock.released();
    // A refusal or a failure leaves no empty folder behind the lock.
    if ((stop !== null || failed) && !workDirExisted) {
      try {
        rmdirSync(workDir);
      } catch {
        /* not empty, or gone — leave it */
      }
    }
  }
  if (stop !== null) return stop;

  const { written } = swapped;
  const created = [WORK_MD_REL, ...(swapped.items ? [ITEMS_REL] : []), ...written, ...(swapped.manifest ? [MANIFEST_REL] : [])];
  // INDEX.md is staged but never in `created`: the undo line removes those.
  const indexRegenerated = swapped.index === 'regenerated';
  if (probe.mode === 'git') stagePaths(baseDir, [...created, ...b.archived.map((x) => x.to), ...(indexRegenerated ? [INDEX_REL] : [])], execFn);
  const revertLine = revertLineFor(probe, force, tag, created, b.archived, indexRegenerated);
  const items = b.plan.manifest.items;
  const flagged = items.filter((it) => it.flag).length;
  const report = [
    `/sig:docs-migrate --work-store — the work store is on (key ${b.key})`,
    '',
    `Wrote ${items.length} record${items.length === 1 ? '' : 's'} under ${ITEMS_REL}/, ${WORK_MD_REL} and the generated views: ${written.join(', ')}.`,
    ...b.files.map((f) => `Moved ${f.file} to ${archiveRel(f.file)}, byte for byte (${f.items} items, ${f.regions.length} non-item region${f.regions.length === 1 ? '' : 's'}).`),
    ...(swapped.manifest ? [`Manifest: ${MANIFEST_REL} — where every entry went, the verification result, and where the dates came from.`] : []),
    ...(indexRegenerated ? [`Regenerated ${INDEX_REL} so it lists the new files.`] : []),
    ...(swapped.index === 'not-a-file' ? [`${INDEX_REL} is a symbolic link or not a regular file, so it was not regenerated: run /sig:docs-index.`] : []),
    ...(swapped.index === 'foreign' ? [`${INDEX_REL} is hand-written, so it was left as it is: reconcile it with /sig:docs-index.`] : []),
    ...(flagged > 0 ? [`${flagged} item${flagged === 1 ? ' is' : 's are'} flagged for a person's look (each carries a migration_note saying why): triage with /sig:item.`] : []),
    probe.mode === 'git' ? 'Staged, not committed — review with `git diff --cached`, then commit.' : 'Not a git checkout: nothing staged.',
    ...(tag ? [`Pre-apply tag: ${tag}`] : []),
    `Undo: ${revertLine}`,
  ].join('\n');
  return {
    applied: true, key: b.key, mode: probe.mode, tag, revertLine, written, archived: b.archived,
    records: items.length, flagged, warnings: probe.warnings, report,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// THE PLAN (S3) — the four lists' texts → planned records. Pure: nothing here
// reads or writes a file; `runWorkStoreMigrate` (S4) does both.
// ═════════════════════════════════════════════════════════════════════════════
//
// Rows come from the segmenters in `work-migrate.js` (the shipped readers, so
// "which lines are an entry" has one definition). This section adds what a
// record needs and the segmenters do not decide:
//
//   - the ID: `KEY-1` upward in file order — BUGS, BACKLOG, ISSUES-INBOX,
//     OPEN-QUESTIONS (D-M6E15-2). A file's non-item text, when it has any, is
//     numbered last in that file's block;
//   - the type: BUGS → BUG, OPEN-QUESTIONS → Q, ISSUES-INBOX → NEW, BACKLOG by
//     its tag through `TAG_TYPES` (untagged → FEAT) (D-M6E15-11, -22);
//   - the status: ISSUES-INBOX at N, everything else open at T with a
//     `migration_note` (D-M6E15-11);
//   - `legacy_id`: the entry's own old ID (`B1`, `BUG-7`, `#99`, `R3`,
//     `NFR-04`), printed again as the body's first line (`Old ID: …`) so a text
//     search finds it, and dropped from the front of the title (t4.8). An
//     entry with no old ID gets none — not a `FILE:line` stand-in, which an
//     old-ID lookup would then match;
//   - the body: the entry's source text, relative links rewritten for the
//     body's folder (`bodyDirFor`).
//
// Non-item text (D-M6E15-9, AC6.3): the text between entries. Lines that are
// only structure — a heading, a blank, `---`, a table header and its `|---|`
// row, the `*Last updated: …*` footer — stay named regions. When a file has
// any other text outside its entries (a preamble paragraph, a section's prose),
// every region holding such text goes, whole, into ONE flagged item for that
// file (NEW at N), so it shows in the views and not only in the archive. The
// exact BACKLOG.md skeleton a layout migration leaves is one named region,
// never an item.

const PLAN_BY = 'migration';
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const OLD_ID_PREFIX = 'Old ID: ';

const SEGMENTERS = Object.freeze({
  'BUGS.md': segmentBugs,
  'BACKLOG.md': segmentBacklog,
  'ISSUES-INBOX.md': segmentInbox,
  'OPEN-QUESTIONS.md': segmentQuestions,
});

const PLAN_TABLE_SEP_RE = /^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;
const PLAN_HEADING_RE = /^#{1,6}\s/;
const PLAN_FOOTER_RE = /^\*Last updated:.*\*\s*$/;

// Is every line of this region structure (no prose)? A table header counts as
// structure only when the next line is its `|---|` row.
function structureOnly(text) {
  const ls = text.split('\n');
  return ls.every((l, i) => {
    const t = l.trim();
    if (t === '' || t === '---' || PLAN_HEADING_RE.test(t) || PLAN_FOOTER_RE.test(t) || PLAN_TABLE_SEP_RE.test(t)) return true;
    return t.startsWith('|') && PLAN_TABLE_SEP_RE.test((ls[i + 1] ?? '').trim());
  });
}

// The conservation check (D-M6E15-9, AC6.2): the segmentation's pieces —
// rows, orphans, gaps and a standing watchlist — must cover the file's lines
// once each, in order, and each piece's text must be the source's text for its
// lines; so their join is the file, byte for byte. Every piece then goes to
// exactly one place: a row to its record, an orphan to a named region or the
// file's one non-item record, a gap or the watchlist to a named region. The
// segmenters tile by construction (`tile()` in work-migrate.js); this checks
// the result rather than trusting it. Returns one message per fault.
function unaccounted(file, text, seg) {
  const lines = text.split('\n');
  const pieces = [...seg.rows, ...seg.orphans, ...seg.gaps, ...(seg.watchlist ? [seg.watchlist] : [])].sort((a, b) => a.line - b.line);
  const faults = [];
  let next = 1;
  for (const x of pieces) {
    if (x.line > next) faults.push(`${file}: line ${next}${x.line - 1 > next ? `–${x.line - 1}` : ''} is in no record or region`);
    if (x.line < next) faults.push(`${file}: line ${x.line} is claimed twice`);
    if (x.text !== lines.slice(x.line - 1, x.endLine).join('\n')) faults.push(`${file}: the piece at lines ${x.line}–${x.endLine} is not the source text for those lines`);
    next = Math.max(next, x.endLine + 1);
  }
  if (next <= lines.length) faults.push(`${file}: line ${next}${lines.length > next ? `–${lines.length}` : ''} is in no record or region`);
  if (faults.length === 0 && pieces.map((x) => x.text).join('\n') !== text) faults.push(`${file}: the pieces do not join back to the file`);
  return faults;
}

const typeOf = (file, row) => {
  if (file === 'BUGS.md') return 'BUG';
  if (file === 'OPEN-QUESTIONS.md') return 'Q';
  if (file === 'ISSUES-INBOX.md') return 'NEW';
  return TAG_TYPES[backlogTag(row)] ?? 'FEAT';
};

const legacyOf = (file, row) => {
  if (file === 'BUGS.md') return row.kind === 'table' ? row.id : legacyIdOf(row.heading, { bugs: true });
  if (file === 'BACKLOG.md' || file === 'OPEN-QUESTIONS.md') return row.legacyId ?? null;
  return null;
};

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A title does not repeat its old ID (t4.8): when the entry's `legacy_id`
// leads the title, it and the dash or colon after it are dropped
// (`#99 — Strategic: …` → `Strategic: …`). The raw heading stays in the body,
// and the old ID is the body's first line. A title that is nothing but the ID
// keeps it.
function withoutLegacyId(title, legacy) {
  if (!legacy) return title;
  const re = new RegExp(`^[\\s\`*_]{0,10}${escapeRe(legacy)}[\`*_]{0,4}\\s{0,3}(?:—|–|:|-)\\s*`);
  const rest = title.replace(re, '');
  return /\S/.test(rest) ? rest : title;
}

function titleOf(file, row) {
  let t;
  const legacy = legacyOf(file, row);
  if (file === 'BUGS.md') t = row.kind === 'table' ? bugTitle(row.summary) : clip(withoutLegacyId(row.heading.replace(/~~/g, ''), legacy));
  else if (file === 'BACKLOG.md') t = clip(withoutLegacyId(row.title, legacy));
  else t = clip(withoutLegacyId(String(row.heading).replace(/~~/g, ''), legacy));
  return /\S/.test(t) ? t : `Untitled entry at ${file}:${row.line}`;
}

// ── Finished markers (D-M6E15-10, -18; AC4.1, AC4.2) ────────────────────────
//
// An entry closes only when it says so plainly, and only when everything it
// says agrees. Where a marker is read:
//
//   - a heading that is struck through (`~~…~~`), anywhere → `fixed`;
//   - a heading's bold annotations (`· **DONE — M9.E1, 2026-03-08**`), and the
//     plain text after a struck span (`~~Q4~~ — ANSWERED`). A bold run that
//     OPENS the heading is its title, not an annotation;
//   - a `**Status:** …` line in the entry;
//   - a bug table's status cell;
//   - in BACKLOG.md, a body line that opens with a bold marker (`**Done** in
//     …`, `**Closed — superseded**`) — the shape corpus project 1 writes. Only
//     the bold run is read;
//   - in OPEN-QUESTIONS.md, the section heading an entry sits under, when it
//     leads with Resolved / Done / Closed (the segmenter's `groupWord`); a
//     section heading that is unclear makes its entries unclear.
//
// Whether one of those texts is a marker, and which reason, is ONE rule:
// `finishedLead` in work-migrate.js (REVIEW C1). The finish word must lead the
// text; any negation or futurity word beside a finish word is `unclear`;
// "done when" / "… of done" are never markers. Within ONE marker a specific
// word wins over a generic one (`Closed — superseded` is `stale`). ACROSS
// markers, two reasons — or a marker beside a status that is not one — is a
// conflict: open, flagged. A finished word the backlog reader knows but this
// list does not map (ABANDONED, CUT — `wontdo` or partial work, D-M6E15-23) is
// flagged, never guessed — alone, or beside a marker that does map (`~~…~~ ·
// **ABANDONED**` is not a fixed close).
// Nothing throws.

const UNMAPPED_FINISH_RE = /\b(?:ABANDONED|CUT)\b/;
const STRUCK_RE = /~~[^~]+~~/;
const BOLD_RE = /\*\*([^*]+)\*\*/g;
const STATUS_LINE_RE = /^\*\*Status:\*\*\s*(.*)$/;
const BOLD_LEAD_RE = /^\*\*([^*]+)\*\*/;

// Everything an entry says about being finished.
function readMarkers(file, row) {
  const markers = []; // {reason, text}
  const unclear = [];
  const statuses = []; // status text that is not a finished marker
  const unmappedFinish = [];
  const take = (text, words = text) => {
    const c = finishedLead(words);
    if (c.unclear) unclear.push(text);
    else if (c.reasons.size > 1) [...c.reasons].forEach((reason) => markers.push({ reason, text }));
    else if (c.reasons.size === 1) markers.push({ reason: [...c.reasons][0], text });
    return c.reasons.size > 0 || c.unclear;
  };

  const heading = file === 'BUGS.md' && row.kind === 'table' ? null : row.heading;
  if (heading) {
    if (STRUCK_RE.test(heading)) markers.push({ reason: 'fixed', text: heading });
    for (const m of heading.matchAll(BOLD_RE)) {
      if (heading.slice(0, m.index).replace(/[~\s]/g, '') === '') continue; // the title, not an annotation
      take(m[1]);
      if (UNMAPPED_FINISH_RE.test(m[1])) unmappedFinish.push(m[1]);
    }
    const lastStrike = heading.lastIndexOf('~~');
    if (STRUCK_RE.test(heading) && lastStrike + 2 < heading.length) {
      const tail = heading.slice(lastStrike + 2).replace(BOLD_RE, ' ').replace(/^[\s·—–:-]+|\s+$/g, '');
      if (tail) take(tail);
      if (tail && UNMAPPED_FINISH_RE.test(tail)) unmappedFinish.push(tail);
    }
  }
  if (file === 'BUGS.md' && row.kind === 'table') {
    const cell = row.statusRaw ?? '';
    if (!take(cell) && cell.trim()) statuses.push(cell.trim());
  }
  if (file === 'OPEN-QUESTIONS.md' && row.groupWord) markers.push({ reason: 'fixed', text: row.groupHeading });
  else if (file === 'OPEN-QUESTIONS.md' && row.groupHeading && finishedLead(row.groupHeading).unclear) unclear.push(row.groupHeading);

  let statusLine = false;
  let fence = false;
  for (const line of row.text.split('\n').slice(1)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const st = line.match(STATUS_LINE_RE);
    if (st) {
      statusLine = true;
      const text = st[1].trim();
      if (!take(text) && text) statuses.push(text);
      continue;
    }
    const bold = file === 'BACKLOG.md' ? line.match(BOLD_LEAD_RE) : null;
    if (bold) take(line.trim(), bold[1]);
  }
  return { markers, unclear, statuses, unmappedFinish, statusLine };
}

const quote = (s) => `“${s}”`;

// The `<!-- backlog-key: … -->` / `<!-- bugs-key: … -->` comments Signal's own
// promote writes (`backlog.js`, a sha1 of the block), exactly: lowercase hex,
// 40 digits, single spaces. Any other spelling is scanned as usual.
const DEDUPE_KEY_COMMENT_G = /<!-- (?:backlog|bugs)-key: [0-9a-f]{40} -->/g;

// `scrubSensitive`'s hits for `text`, minus any lying wholly inside one of
// those comments — by position, so the same hex written anywhere else is still
// a hit (D-M6E15-23). The shared scrubber is unchanged.
function sensitiveHits(text) {
  const spans = [...String(text).matchAll(DEDUPE_KEY_COMMENT_G)].map((m) => [m.index, m.index + m[0].length]);
  return scrubSensitive(text).hits.filter((h) => !spans.some(([a, b]) => h.index >= a && h.index + h.match.length <= b));
}

// The entry's outcome: `{close: {reason, proof}}`, or `{flag, note}` (open).
function decide(file, row) {
  if (file === 'BUGS.md' && row.idUnreadable) {
    return { flag: 'id-unreadable', note: 'Its ID cell does not read as an ID (one short token with a digit, on the first line), so no old ID was kept and the row was not read for a finished marker; left open.' };
  }
  const m = readMarkers(file, row);
  const reasons = new Set(m.markers.map((x) => x.reason));
  if (m.unclear.length > 0) {
    return { flag: 'unclear', note: `Its marker ${m.unclear.map(quote).join(', ')} is qualified, so it was left open rather than closed by inference.` };
  }
  if (reasons.size > 1 || (reasons.size === 1 && (m.statuses.length > 0 || m.unmappedFinish.length > 0))) {
    const said = [
      ...m.markers.map((x) => `${quote(x.text)} → ${x.reason}`),
      ...m.statuses.map((x) => `${quote(x)} → open`),
      ...m.unmappedFinish.map((x) => `${quote(x)} → not mapped`),
    ];
    return { flag: 'conflict', note: `Its finished markers disagree (${said.join('; ')}), so it was left open rather than closed by inference.` };
  }
  if (reasons.size === 1) {
    return { close: { reason: [...reasons][0], proof: [...new Set(m.markers.map((x) => x.text))].join('; ') } };
  }
  if (m.statuses.length > 0) {
    return { flag: 'status-unmapped', note: `Its status reads ${m.statuses.map(quote).join(', ')}, which is not a finished marker this migration maps; left open.` };
  }
  if (file === 'BUGS.md' && row.kind === 'entry' && !m.statusLine) {
    return { flag: 'no-status-line', note: 'It has no **Status:** line; left open.' };
  }
  if (m.unmappedFinish.length > 0 || (file === 'BACKLOG.md' && row.discharged)) {
    const what = m.unmappedFinish.length > 0 ? ` (${m.unmappedFinish.map(quote).join(', ')})` : '';
    return { flag: 'finished-word-unmapped', note: `The list marks it finished${what}, but not with a marker this migration closes on; left open.` };
  }
  return { flag: file === 'ISSUES-INBOX.md' ? null : 'no-marker', note: null };
}

/**
 * Plan the four lists as records. Pure: texts in, plan out; writes nothing.
 *
 * @param {Partial<Record<'BUGS.md'|'BACKLOG.md'|'ISSUES-INBOX.md'|'OPEN-QUESTIONS.md', string>>} texts
 *   a missing or empty source is skipped
 * @param {object} opts
 * @param {string} opts.key — the store key (`STORE_KEY_RE`). Required: there is
 *   no default on this path (AC2.3).
 * @param {Record<string, {first: string, last: string}>} opts.dates — per source
 *   file, its first- and last-commit dates (`YYYY-MM-DD`). `created.at` is
 *   `first`; a close is at the date its marker writes, else `last`
 *   (D-M6E15-19). Never the run's own date.
 * @param {boolean} [opts.acknowledgeSensitive] — go ahead past sensitive-data
 *   hits a person has read (as `newItems`). Without it, any hit in a planned
 *   title or body returns `{aborted: 'sensitive-data-pending', hits: [{id, file,
 *   type, match}]}` with no records.
 * @param {Record<string, (text: string) => object>} [opts.segmenters] — TEST SEAM
 *   ONLY: replace a file's segmenter, to prove the conservation check refuses a
 *   segmentation that loses or alters a byte. Production callers never pass it.
 * @returns {{key: string, records: Array<{record: object, body: string, recordPath: string,
 *   bodyPath: string, flagged: string|null, sourceRef: {file: string, ranges: Array<{line: number, endLine: number}>}}>,
 *   regions: Array<{file: string, kind: 'orphan'|'gap'|'watchlist'|'skeleton', name: string, line: number,
 *     endLine: number, text: string}>,
 *   manifest: {key: string,
 *     files: Record<string, {lines: number, items: number, open: number, closed: number, flagged: number,
 *       regions: Array<{kind: string, name: string, line: number, endLine: number}>, verified?: true}>,
 *     items: Array<{id: string, legacy_id: string|null, title: string, status: 'N'|'T'|'C', flag: string|null,
 *       dateNote?: string, file: string, ranges: Array<{line: number, endLine: number}>}>},
 *   errors: string[]}}
 *   `records` is empty whenever `errors` is not. `flagged` (and a manifest
 *   item's `flag`) is null for a closed entry and an unmarked inbox entry;
 *   otherwise why it needs a person's look: `no-marker`, `status-unmapped`,
 *   `no-status-line`, `unclear`, `conflict`, `finished-word-unmapped`,
 *   `id-unreadable` (a bug table row whose ID cell is not an ID), or
 *   `non-item` (the file's text outside its entries). `verified` is set on a
 *   file whose bytes all landed in one record or region.
 * @throws {WorkStoreError} SCHEMA when `key` is missing or not a valid key
 */
export function planListsToRecords(texts, opts = {}) {
  const { key } = opts;
  if (typeof key !== 'string' || !STORE_KEY_RE.test(key)) {
    throw new WorkStoreError('SCHEMA', `planListsToRecords: ${JSON.stringify(key ?? null)} is not a store key — ${KEY_RULE}. There is no default key on this path.`);
  }
  const dates = opts.dates ?? {};
  const errors = [];
  const regions = [];
  const planned = []; // {file, row|null, pieces, flagged}
  const files = {};

  for (const file of SOURCES) {
    const text = texts[file];
    if (typeof text !== 'string' || text === '') continue;
    const lineCount = text.split('\n').length;
    files[file] = { lines: lineCount, items: 0, open: 0, closed: 0, flagged: 0, regions: [] };
    if (file === 'BACKLOG.md' && BACKLOG_SKELETON_RE.test(text)) {
      regions.push({ file, kind: 'skeleton', name: 'backlog skeleton', line: 1, endLine: lineCount, text });
      files[file].regions.push({ kind: 'skeleton', name: 'backlog skeleton', line: 1, endLine: lineCount });
      files[file].verified = true;
      continue;
    }
    let seg;
    try {
      seg = (opts.segmenters?.[file] ?? SEGMENTERS[file])(text);
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
      continue;
    }
    const lost = unaccounted(file, text, seg);
    if (lost.length > 0) {
      errors.push(...lost);
      continue;
    }
    files[file].verified = true;
    for (const row of seg.rows) planned.push({ file, row, pieces: [row] });
    const prose = [];
    for (const o of seg.orphans) {
      if (structureOnly(o.text)) regions.push({ file, kind: 'orphan', name: o.name, line: o.line, endLine: o.endLine, text: o.text });
      else prose.push(o);
    }
    for (const g of seg.gaps) regions.push({ file, kind: 'gap', name: g.text.split('\n').some((l) => l.trim() === '---') ? 'separator' : 'blank', line: g.line, endLine: g.endLine, text: g.text });
    if (seg.watchlist) {
      const w = seg.watchlist;
      regions.push({ file, kind: 'watchlist', name: 'standing watchlist', line: w.line, endLine: w.endLine, text: w.text });
    }
    if (prose.length > 0) planned.push({ file, row: null, pieces: prose, flagged: 'non-item' });
    for (const r of regions.filter((x) => x.file === file)) files[file].regions.push({ kind: r.kind, name: r.name, line: r.line, endLine: r.endLine });
  }

  // Every file that yields a record needs both dates (D-M6E15-19): there is no
  // fallback to the run's own date, which would flood the views with closes.
  for (const file of new Set(planned.map((p) => p.file))) {
    const d = dates[file];
    if (!d || typeof d !== 'object') {
      errors.push(`${file}: no dates given — pass its first- and last-commit dates (YYYY-MM-DD); the run's own date is never used.`);
      continue;
    }
    for (const k of ['first', 'last']) {
      if (typeof d[k] !== 'string' || !ISO_DAY_RE.test(d[k])) errors.push(`${file}: dates.${k} ${JSON.stringify(d[k] ?? null)} is not a YYYY-MM-DD date.`);
    }
  }
  if (errors.length) return { key, records: [], regions, manifest: { key, files, items: [] }, errors };

  const records = [];
  const dateNotes = new Map();
  planned.forEach((p, i) => {
    const id = `${key}-${i + 1}`;
    const { file, row } = p;
    const d = dates[file];
    const created = d.first;
    const record = { id };
    const events = [{ type: 'created', at: created, by: PLAN_BY }];
    let flagged = p.flagged ?? null;
    const ranges = p.pieces.map((x) => ({ line: x.line, endLine: x.endLine }));
    let text;
    if (row === null) {
      record.type = 'NEW';
      record.title = `Text in ${file} outside any entry`;
      record.source = `migration:${file}`;
      record.source_ref = `${file}:${ranges[0].line}`;
      record.migration_note = `Text from ${file} that belongs to no entry (lines ${ranges.map((r) => (r.line === r.endLine ? `${r.line}` : `${r.line}–${r.endLine}`)).join(', ')}), kept so it shows in the views. Triage: make it an item, fold it into one, or close it.`;
      text = p.pieces.map((x) => x.text).join('\n\n');
    } else {
      record.type = typeOf(file, row);
      record.title = titleOf(file, row);
      record.source = `migration:${file}`;
      record.source_ref = `${file}:${row.line}`;
      const legacy = legacyOf(file, row);
      if (legacy) record.legacy_id = legacy;
      text = row.text;
      const outcome = decide(file, row);
      if (outcome.close) {
        // A date the marker writes beside its finish word wins, when there is
        // exactly one (`markerDates`, REVIEW S1); any other date in the proof is
        // not the close date, and two do not say which is.
        const written = markerDates(outcome.close.proof);
        const at = written.length === 1 ? written[0] : d.last;
        if (at < created) {
          events[0].at = at;
          dateNotes.set(id, `closed at ${at} (its marker's date), before ${file}'s first date ${created}; created moved back to ${at}`);
        }
        events.push({ type: 'closed', at, by: PLAN_BY, reason: outcome.close.reason, proof: outcome.close.proof, legacy: true });
      } else {
        flagged = outcome.flag;
        if (record.type !== 'NEW') {
          const generic = `Open in ${file} when it moved to the store; its type and status were not re-checked.`;
          record.migration_note = outcome.note ? `${generic} ${outcome.note}` : generic;
          events.push({ type: 'triaged', at: created, by: PLAN_BY });
        } else if (outcome.note) {
          record.migration_note = outcome.note;
        }
      }
    }
    record.events = events;
    const dir = bodyDirFor(id);
    const moved = rewriteRelativeLinks(text, '', dir);
    const body = record.legacy_id ? `${OLD_ID_PREFIX}${record.legacy_id}\n\n${moved}` : moved;
    records.push({ record, body, recordPath: recordPath(id), bodyPath: bodyPath(id), flagged, sourceRef: { file, ranges } });
  });

  for (const r of records) {
    const invalid = [...validateRecord(r.record), ...checkEvents(r.record).map((e) => e.message)];
    if (invalid.length) errors.push(`${r.record.id} (${r.sourceRef.file}:${r.sourceRef.ranges[0].line}): ${invalid.join('; ')}`);
  }

  const items = records.map((r) => ({
    id: r.record.id,
    legacy_id: r.record.legacy_id ?? null,
    title: r.record.title,
    status: r.record.events.at(-1).type === 'closed' ? 'C' : r.record.events.at(-1).type === 'triaged' ? 'T' : 'N',
    flag: r.flagged,
    ...(dateNotes.has(r.record.id) ? { dateNote: dateNotes.get(r.record.id) } : {}),
    file: r.sourceRef.file,
    ranges: r.sourceRef.ranges,
  }));
  for (const it of items) {
    const f = files[it.file];
    f.items++;
    if (it.status === 'C') f.closed++;
    else f.open++;
    if (it.flag) f.flagged++;
  }
  const manifest = { key, files, items };
  if (errors.length) return { key, records: [], regions, manifest, errors };

  // The sensitive-data gate `newItems` applies (scrub.js): list text from
  // another repository is data, and a hit stops the plan for a person's
  // decision. Detection only — with `acknowledgeSensitive` the text is kept
  // verbatim, never redacted in silence. Signal's own dedupe-key comments are
  // not secrets (D-M6E15-23): a hit lying wholly inside one is skipped.
  const hits = records.flatMap((r) => [r.record.title, r.body].flatMap(sensitiveHits)
    .map((h) => ({ id: r.record.id, file: r.sourceRef.file, type: h.type, match: h.match })));
  if (hits.length > 0 && !opts.acknowledgeSensitive) {
    return { key, records: [], regions, manifest, errors, aborted: 'sensitive-data-pending', hits };
  }
  return { key, records, regions, manifest, errors };
}
