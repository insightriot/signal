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
//   - `WORK.md` exists, whatever it holds → "already on the store", checked
//     first (AC1.5; D-M6E11-21; `isStoreOn` throws on a broken one, so this
//     checks the file exists rather than asking it);
//   - list copies in the archive with no MANIFEST.json AND evidence this
//     tool left them (a list gone from .planning/, or a `pre-work-store-*`
//     tag) → the shape of an apply stopped part-way; the reset to the tag is
//     offered only after "check it is this tool's, and the tree is clean";
//   - a path the run reads or writes runs through a symbolic link, or
//     `.planning/` resolves outside the repository (M6.E14's linked-`.planning`
//     class); a list, STATE.md or a lock file (`.planning/work/.lock`,
//     `.planning/.add.lock`) that is a link is never read; a
//     `.planning/work/.lock` with no store is refused as left over;
//   - layout below v3, or no STATE.md → names the plain command (D-M6E15-8);
//   - a `--key` that `STORE_KEY_RE` rejects, or no key to propose → the rule;
//   - a store file or archive copy already at a path the run would write;
//   - the plan fails its checks (a source byte unaccounted for, an invalid
//     record) — the whole apply is refused (D-M6E15-9);
//   - an apply without the dry run's `inputHash` as `expectedHash`.
// A sensitive-data hit in a planned record (scrub.js; Signal's own dedupe-key
// comments excepted, D-M6E15-23) is listed by the dry run and stops the apply
// (`aborted: 'sensitive-data-pending'`) until the caller passes
// `acknowledgeSensitive` after a person has read the hits.
//
// The key: `--key` if given, else proposed from the folder name (D-M6E15-7).
// The dry run prints it; `--apply` without `--key` uses the same proposal.
//
// The input hash covers STATE.md and the four lists (AC6.4) and what the dry
// run showed — every item's status and flag, the proposed closes and their
// evidence (AC4.3): a change to any of them between the dry run and the apply
// aborts the apply before any write.
// The apply holds the store's `work` lock and `/sig:add`'s `.add.lock` (with no
// WORK.md, `/sig:add` writes to the lists under that lock only), and re-reads
// each list just before the archive step and the archived copies after it: a
// list changed while the apply ran undoes the swap and refuses (REVIEW I1).
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
// generated file). WORK.md and the views are never moved in over a file that
// appeared at their path (`moveInNew`). The snapshotter is not used.
//
// No v2 store module may import this one (`tests/legacy-lists.test.js`
// V2_MODULES): it reaches the list parsers.

import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, renameSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

import { acquireLock as acquireAddLock, LOCK_FILE as ADD_LOCK_REL } from './add.js';
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
  headingUndoes,
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

// The token the dry run hands the apply, in two halves joined by `:` so a
// refusal can say which moved:
//   - the inputs: STATE.md and every list, each named, an absent list distinct
//     from an empty one (AC6.4), and each list's first and last dates;
//   - what the person saw (AC4.3, D-M6E15-25): every item's ID, status and
//     flag, and each proposed close with its wording and evidence. The lists
//     can stay byte-identical while this moves — a commit, a fetch into the
//     default branch, a checkout, a retrospective added — and a yes given to one
//     list of closes must never close another.
function inputHashOf(stateText, texts, shown, dates) {
  const parts = [['STATE.md', stateText], ...GENERATED_FILES.map((n) => [n, texts[n] ?? null])];
  const inputs = hashState(parts.map(([n, t]) => `${n}\0${t === null ? '\u0001absent' : t}\0`).join('') + JSON.stringify(GENERATED_FILES.map((n) => [dates[n]?.first, dates[n]?.last])));
  const outcome = hashState(JSON.stringify({
    items: shown.manifest.items.map((it) => [it.id, it.status, it.flag]),
    proposed: shown.proposedCloses.map((c) => [c.id, c.legacyId, c.reason, c.wording, c.evidence, c.proof]),
  }));
  return `${inputs}:${outcome}`;
}

// Why an apply's token is not the dry run's, in the person's terms.
function hashDriftReason(expected, actual) {
  const [inputs] = String(expected).split(':');
  if (inputs !== actual.split(':')[0]) {
    return `${STATE_REL} or a list (${GENERATED_FILES.join(', ')}) changed since the dry run, so nothing was written. Re-run the dry run.`;
  }
  return 'What the dry run showed changed since the dry run, though the lists and STATE.md did not: this repository\'s history '
    + 'or retrospectives now give a different outcome — an item\'s status or flag, or the proposed closes or their evidence '
    + '(a commit, a fetch, a checkout or a retrospective since then). Nothing was written. Re-run the dry run and confirm what it shows now.';
}

// Everything both modes decide before writing: the refusals, the key, the
// lists' texts and dates, and the plan. Reads only.
function assess(baseDir, opts) {
  const refuse = (reason) => ({ refusal: reason });

  // "Already on the store" wins whenever WORK.md exists (AC1.5): a project on
  // the store may well keep its old lists in the archive (REVIEW pass 2 I-A).
  if (existsSync(join(baseDir, WORK_MD_REL))) {
    const items = onDisk(baseDir, ITEMS_REL);
    return refuse(`This project is already on the store: ${WORK_MD_REL} exists, so nothing was written.`
      + (items ? '' : ` It has no ${ITEMS_REL}/ — if ${WORK_MD_REL} was made by hand in a project that was never migrated, `
        + 'move that one file aside and re-run.'));
  }

  // A run stopped after it moved a list but before it wrote MANIFEST.json left
  // the lists half-moved: re-running would plan what is left — an empty store
  // over archived lists (REVIEW S4). Said only on evidence THIS tool leaves
  // (REVIEW pass 2 I-A): a list missing beside its manifest-less archive copy,
  // or a `pre-work-store-*` tag. Copies with every list present and no tag are
  // left to the never-overwrite refusal below, which offers no reset.
  const copies = GENERATED_FILES.filter((n) => onDisk(baseDir, archiveRel(n)));
  if (copies.length > 0 && !onDisk(baseDir, MANIFEST_REL)) {
    const gone = copies.filter((n) => !onDisk(baseDir, `.planning/${n}`));
    const tags = preStoreTags(baseDir, opts.execFn);
    if (gone.length > 0 || tags.length > 0) {
      const found = [
        ...(gone.length > 0 ? [`${gone.join(', ')} ${gone.length === 1 ? 'is' : 'are'} no longer in .planning/`] : []),
        ...(tags.length > 0 ? [`this repository has ${tags.length === 1 ? 'the tag' : 'the tags'} ${tags.join(', ')}`] : []),
      ].join(', and ');
      return refuse(`${copies.map(archiveRel).join(', ')} ${copies.length === 1 ? 'is' : 'are'} in the archive with no ${MANIFEST_REL}, and ${found} — `
        + 'the shape this tool leaves when an apply stops part-way. Nothing was written. To put the project back in git: find the '
        + "pre-apply tag with `git tag -l 'pre-work-store-*'`, check it is one this tool made (`git show <tag>`) and that "
        + '`git status` is clean — a reset discards uncommitted work — then run `git reset --hard <tag>`. Outside git, move each '
        + 'archived list back to .planning/. Then re-run.');
    }
  }

  // Before any read: no store path through a link, `.planning/` inside the
  // repository, and every list a regular file (t4.6).
  // The lock files too (REVIEW I5): `file-lock.js` reads a lock it finds, and
  // a held lock's first line is printed as its pid.
  for (const rel of [WORK_MD_REL, `${ITEMS_REL}/x`, `${HISTORY_REL}/x`, MANIFEST_REL, WORK_LOCK_REL, ADD_LOCK_REL]) {
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

  // With no store, nothing holds the `work` lock but this run, which takes it
  // only after this first look (`opts.underLock` is the look under it).
  if (!opts.underLock && onDisk(baseDir, WORK_LOCK_REL)) {
    return refuse(`${WORK_LOCK_REL} is there with no store, so it is left over (or another migration is running); nothing was read or written. `
      + `If no Signal command is running, delete ${WORK_LOCK_REL}, then re-run.`);
  }

  const stateWhy = regularFileRefusal(baseDir, STATE_REL);
  if (stateWhy !== null) return refuse(`${stateWhy}. Nothing was written.`);
  const stateText = onDisk(baseDir, STATE_REL) ? readRegularFile(baseDir, STATE_REL) : null;
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

  // Closes are checked against this repository's history (D-M6E15-24). The
  // look under the lock reads it again (AC4.3): a commit landing while the
  // apply waited for its locks must not slip past the hash.
  const evidence = buildEvidenceIndex(baseDir, { execFn: opts.execFn });
  const planOpts = { key, dates, evidence, ...(opts.segmenters ? { segmenters: opts.segmenters } : {}) };
  let plan = planListsToRecords(texts, planOpts);
  let sensitiveHits = [];
  if (plan.aborted === 'sensitive-data-pending') {
    sensitiveHits = plan.hits;
    plan = planListsToRecords(texts, { ...planOpts, acknowledgeSensitive: true });
  }
  if (plan.errors.length > 0) {
    return refuse(`The lists could not be planned as records, so nothing was written:\n  ${plan.errors.join('\n  ')}`);
  }
  // What the person saw is always the unconfirmed plan (the proposals, open);
  // the apply builds the confirmed one when they said yes (D-M6E15-25). A
  // dry run never does: its per-file counts must match its own item list.
  const shown = plan;
  if (opts.confirmCloses === true && opts.apply === true) {
    plan = planListsToRecords(texts, { ...planOpts, acknowledgeSensitive: sensitiveHits.length > 0, confirmCloses: true });
    if (plan.errors.length > 0) {
      return refuse(`The lists could not be planned as records, so nothing was written:\n  ${plan.errors.join('\n  ')}`);
    }
  }

  const files = present.map((name) => {
    const f = plan.manifest.files[name] ?? { items: 0, open: 0, closed: 0, flagged: 0, regions: [] };
    return { file: `.planning/${name}`, items: f.items, open: f.open, closed: f.closed, flagged: f.flagged, regions: f.regions.map((r) => r.name) };
  });
  return { key, keySource, folder, files, archived, dates, texts, plan, shown, sensitiveHits, evidence, inputHash: inputHashOf(stateText, texts, shown, dates) };
}

// The `pre-work-store-*` tags this tool's apply makes, from a fixed-argument
// `git tag -l`; none outside git.
function preStoreTags(baseDir, execFn = execFileSync) {
  try {
    return String(execFn('git', ['tag', '-l', 'pre-work-store-*'], { cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
      .split('\n').map((t) => t.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

// Anything at `rel`, a link (even a dangling one) included.
const onDisk = (baseDir, rel) => lstatSync(join(baseDir, rel), { throwIfNoEntry: false }) !== undefined;

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
// names, proofs) carries no control characters — C0, DEL, C1 — and no bidi
// overrides or isolates: a terminal would act on them, or show the text in
// another order than it is stored. Applied per line, so the report's own line
// breaks stay. Also the marks that move or hide text without showing (REVIEW
// pass 3 suggestion): LRM, RLM, ALM, the line and paragraph separators, and
// the zero-width characters: every Cc and Cf character (tag characters too), and the variation selectors (REVIEW pass 4).
const printable = (s) => String(s).replace(/[\p{Cc}\p{Cf}\u2028\u2029\p{Variation_Selector}]/gu, '');

function dryRunReport(a) {
  const lines = ['/sig:docs-migrate --work-store — dry run (nothing written)', ''];
  lines.push(a.keySource === '--key'
    ? `Project key: ${a.key} (from --key)`
    : `Project key: ${a.key} (proposed from the folder name "${a.folder}"; pass --key KEY to choose another)`);
  lines.push(a.evidence.source === 'git'
    ? `Closes are checked against this repository's history — the default branch, ${a.evidence.ref} (${a.evidence.commits.length} commits, ${a.evidence.epics.size} retrospectives): `
      + 'an entry is proposed for closing only when its wording says it is finished AND a commit, pull request or Epic it cites is found there. '
      + 'Nothing closes unless you confirm the proposals. Anything else stays open, flagged, with a note saying what was found and not found.'
    : 'The migration could not read this repository\'s history, so nothing can be proposed for closing (not a git checkout, no commits, or git failed): '
      + 'every entry stays open, flagged, whatever its wording says.');
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
  const items = a.shown.manifest.items;
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
  const proposed = a.shown.proposedCloses;
  if (proposed.length > 0) {
    lines.push('', `Proposed closes (${proposed.length}) — confirm to close them; anything not confirmed stays open, flagged looks-finished. `
      + 'New ID, old ID, title, the wording, the evidence:');
    for (const c of proposed) {
      lines.push(`  ${c.id}  ${c.legacyId ?? '—'}  ${c.title}  — wording ${quote(clip(c.wording))}; evidence ${c.evidence.join('; ')}`);
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

// The store at `root`, checked: `errors` says why it is not the `count`
// records the plan made ([] when it is); `records` and `checks` are what was
// measured (the record count read, `checkRecords`' findings).
function verifyBuilt(root, count) {
  const errors = [];
  const listed = listRecords(root);
  const checks = checkRecords(root);
  if (listed.version !== 2) errors.push(`the store reads as v${listed.version}, not v2`);
  if (listed.records.length !== count) errors.push(`the store holds ${listed.records.length} records, not ${count}`);
  for (const b of listed.broken) errors.push(`record ${b.id ?? b.path} is broken: ${b.error}`);
  for (const f of checks) errors.push(`checkRecords ${f.code}${f.id ? ` ${f.id}` : ''}: ${f.message}`);
  return { errors, records: listed.records.length, checks };
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

// Each list whose bytes on disk (at `at(name)`, or absent) are not the text
// the plan was made from.
function changedLists(baseDir, texts, at) {
  return GENERATED_FILES.filter((n) => (onDisk(baseDir, at(n)) ? readRegularFile(baseDir, at(n)) : null) !== (texts[n] ?? null));
}

// A list changed by another writer while the swap ran (REVIEW I1): the swap is
// undone and the run refused, so the change is kept where it was written.
function listsChangedError(names) {
  const err = new WorkStoreError('CONFLICT', `${names.map((n) => `.planning/${n}`).join(', ')} changed while the migration ran, so it was undone and nothing was written; `
    + 'the change is kept. Re-run the dry run.');
  err.listsChanged = true;
  return err;
}

// Move a built file to its place in the project — never over a file already
// there: a list written back at a view's path after the archive step (by a
// writer that does not take `.add.lock`) is left as it is (REVIEW I1).
function moveInNew(from, baseDir, rel) {
  if (onDisk(baseDir, rel)) {
    throw new WorkStoreError('CONFLICT', `${rel} appeared while the migration ran (another writer?), so the migration was undone and that file left as it is — `
      + `nothing was written over it. Any list already moved is in ${PRE_STORE_ARCHIVE_REL}/. Fold the new text back in by hand, then re-run the dry run.`);
  }
  renameSync(from, join(baseDir, rel));
}

// Build the store aside, verify it, then swap it in and verify again. Throws
// (after `restore`) on any failure; the project is unchanged until the swap.
async function buildAndSwap(baseDir, a, ctx) {
  const aside = join(baseDir, ctx.asideRel);
  const records = a.plan.records;
  await buildAside(aside, records, workMd(a.key, a.archived));
  const { written } = await regenerateViews(aside);
  const built = verifyBuilt(aside, records.length).errors;
  if (built.length > 0) {
    throw new WorkStoreError('SCHEMA', `the store built aside did not verify, so the project was not changed:\n  ${built.join('\n  ')}`);
  }

  const step = (name) => ctx.onSwapStep?.(name);
  // `index`: INDEX.md's bytes before it was regenerated, or null.
  const done = { archived: [], views: [], made: [], items: false, workMd: false, manifest: false, index: null };
  let index = null; // 'regenerated' | 'foreign' | 'not-a-file' | null
  try {
    step('archive');
    // The lists are re-read just before they move, and the archived copies
    // after: bytes another writer added since the plan are never archived as
    // "placed" (REVIEW I1). `/sig:add` cannot write — this run holds its lock.
    const before = changedLists(baseDir, a.texts, (n) => `.planning/${n}`);
    if (before.length > 0) throw listsChangedError(before);
    if (a.archived.length > 0) mkdirTracked(join(baseDir, PRE_STORE_ARCHIVE_REL), done.made);
    for (const x of a.archived) {
      step(`archive:${basename(x.from)}`);
      renameSync(join(baseDir, x.from), join(baseDir, x.to));
      done.archived.push(x);
    }
    const moved = changedLists(baseDir, a.texts, (n) => (a.texts[n] === undefined ? `.planning/${n}` : archiveRel(n)));
    if (moved.length > 0) throw listsChangedError(moved);
    step('work');
    mkdirTracked(join(baseDir, '.planning', WORK_DIR), done.made);
    moveInNew(join(aside, WORK_MD_REL), baseDir, WORK_MD_REL);
    done.workMd = true;
    if (existsSync(join(aside, ITEMS_REL))) {
      renameSync(join(aside, ITEMS_REL), join(baseDir, ITEMS_REL));
      done.items = true;
    }
    step('views');
    for (const rel of written) {
      confineView(baseDir, rel);
      mkdirTracked(dirname(join(baseDir, rel)), done.made);
      moveInNew(join(aside, rel), baseDir, rel);
      done.views.push(rel);
    }
    step('verify');
    const after = verifyBuilt(baseDir, records.length);
    if (after.errors.length > 0) throw new WorkStoreError('SCHEMA', `the migrated store did not verify:\n  ${after.errors.join('\n  ')}`);
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
        // What the checks measured (REVIEW I2): the moved-in store, and the
        // plan's conservation check — each list's lines all in one record or
        // region, and the faults it found.
        verification: {
          ok: after.errors.length === 0 && a.plan.errors.length === 0,
          records: after.records,
          checkRecords: after.checks,
          conservation: Object.fromEntries(Object.entries(a.plan.manifest.files)
            .map(([f, v]) => [f, { lines: v.lines, verified: v.verified === true }])),
          unaccounted: a.plan.errors,
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
 *          confirmCloses?: boolean, acknowledgeSensitive?: boolean, stamp?: string, execFn?: typeof execFileSync,
 *          onSwapStep?: (step: string) => void,
 *          segmenters?: Record<string, (text: string) => object>}} [opts]
 *   `expectedHash`: the dry run's `inputHash` — required with `apply` (refused
 *   without it). `confirmCloses`: the person's yes to the dry run's proposed
 *   closes — the apply closes exactly that list; without it they stay open,
 *   flagged `looks-finished` (D-M6E15-25). Ignored by a dry run. `acknowledgeSensitive`: go ahead past the sensitive-data hits the dry run
 *   listed, after a person has read them (the text is kept as it is).
 *   `onSwapStep`: TEST SEAM ONLY — called with `archive`, `work`, `views` and
 *   `verify` before those steps of the swap, with `archive:<list>` before each
 *   list's move, and with `index` AFTER INDEX.md is regenerated (the last
 *   step), so a test can fail any one — or change a file and return — and
 *   prove the project is put back. `segmenters`: TEST
 *   SEAM ONLY — passed to `planListsToRecords`, to prove a segmentation that
 *   loses a byte refuses the whole run (AC6.2). Production callers pass neither.
 * @returns {Promise<object>} a refusal `{applied: false, refused: true, reason}`; a
 *   sensitive-data stop `{applied: false, aborted: 'sensitive-data-pending', hits, reason}`;
 *   a dry run `{applied: false, dryRun: true, key, files, items, dates, proposedCloses,
 *   sensitiveHits, inputHash, report}`; or an apply `{applied: true, key, mode, tag, revertLine,
 *   written, archived, records, flagged, closesConfirmed, warnings, report}`
 * @throws {WorkStoreError} LOCKED / IO when the `work` lock cannot be taken; whatever
 *   the build or the swap threw, after the project is put back and the tag removed
 */
export async function runWorkStoreMigrate(baseDir, opts = {}) {
  const apply = opts.apply === true;
  const force = opts.force ?? false;
  const execFn = opts.execFn ?? execFileSync;
  const stamp = opts.stamp ?? new Date().toISOString().replace(/[:.]/g, '-');
  const refused = (reason, extra = {}) => ({ applied: false, refused: true, reason, ...extra });
  // A hit leaves this function masked, like the report shows it.
  const maskHits = (hits) => hits.map((h) => ({ ...h, match: masked(h.match) }));
  const sensitiveStop = (hits) => ({
    applied: false,
    aborted: 'sensitive-data-pending',
    hits: maskHits(hits),
    reason: `${hits.length} sensitive-data hit${hits.length === 1 ? '' : 's'} in the lists (see the dry run); nothing was written. `
      + 'Keep the text as it is (re-run the apply with acknowledgeSensitive), or abort and edit the list first.',
  });

  const a = assess(baseDir, { ...opts, execFn });
  if (a.refusal) return refused(a.refusal);
  if (!apply) {
    return {
      applied: false, dryRun: true, key: a.key, files: a.files, items: a.shown.manifest.items, dates: a.dates,
      proposedCloses: a.shown.proposedCloses, sensitiveHits: maskHits(a.sensitiveHits), inputHash: a.inputHash, report: dryRunReport(a),
    };
  }
  // The apply is bound to what a person read in the dry run (AC6.4): without
  // its token there is nothing to bind to.
  if (typeof opts.expectedHash !== 'string' || opts.expectedHash === '') {
    return refused('An apply needs the dry run\'s inputHash as expectedHash, so nothing was written. Run the dry run, read it, '
      + 'then apply with {expectedHash: dry.inputHash}.');
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
  // `/sig:add`'s lock as well as the store's (REVIEW I1): with no WORK.md,
  // `/sig:add` writes to the hand-kept lists, under `.add.lock` only.
  let addLock;
  try {
    addLock = await acquireAddLock(baseDir);
  } catch (err) {
    throw lockFailure(err);
  }
  let lock;
  try {
    lock = await acquireLock(join(baseDir, WORK_LOCK_REL), { label: 'work store migration', ttlMs: WORK_LOCK_TTL_MS });
  } catch (err) {
    await addLock.released();
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
    b = assess(baseDir, { ...opts, execFn, underLock: true });
    if (b.refusal) stop = refused(b.refusal);
    else if (opts.expectedHash !== b.inputHash) stop = refused(hashDriftReason(opts.expectedHash, b.inputHash)); else if (b.sensitiveHits.length > 0 && !opts.acknowledgeSensitive) stop = sensitiveStop(b.sensitiveHits);
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
        if (!err.listsChanged) throw err;
        stop = refused(err.message);
      }
    }
  } finally {
    try {
      rmSync(join(baseDir, asideRel), { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
    await lock.released();
    await addLock.released();
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
  const proposedN = b.plan.proposedCloses.length;
  const closedIds = new Set(items.filter((it) => it.status === 'C').map((it) => it.id));
  const confirmedN = b.plan.proposedCloses.filter((c) => closedIds.has(c.id)).length;
  const proposedLine = proposedN === 0 ? []
    : confirmedN > 0
      ? [`Closed ${confirmedN} proposed close${confirmedN === 1 ? '' : 's'}, as confirmed (each a legacy close; its proof is the wording and the evidence).`]
      : [`${proposedN} proposed close${proposedN === 1 ? ' was' : 's were'} not confirmed: left open, flagged looks-finished.`];
  const report = [
    `/sig:docs-migrate --work-store — the work store is on (key ${b.key})`,
    '',
    `Wrote ${items.length} record${items.length === 1 ? '' : 's'} under ${ITEMS_REL}/, ${WORK_MD_REL} and the generated views: ${written.join(', ')}.`,
    ...b.files.map((f) => `Moved ${f.file} to ${archiveRel(f.file)}, byte for byte (${f.items} items, ${f.regions.length} non-item region${f.regions.length === 1 ? '' : 's'}).`),
    ...(swapped.manifest ? [`Manifest: ${MANIFEST_REL} — where every entry went, the verification result, and where the dates came from.`] : []),
    ...(indexRegenerated ? [`Regenerated ${INDEX_REL} so it lists the new files.`] : []),
    ...(swapped.index === 'not-a-file' ? [`${INDEX_REL} is a symbolic link or not a regular file, so it was not regenerated: run /sig:docs-index.`] : []),
    ...(swapped.index === 'foreign' ? [`${INDEX_REL} is hand-written, so it was left as it is: reconcile it with /sig:docs-index.`] : []),
    ...proposedLine,
    ...(flagged > 0 ? [`${flagged} item${flagged === 1 ? ' is' : 's are'} flagged for a person's look (each carries a migration_note saying why): triage with /sig:item.`] : []),
    probe.mode === 'git' ? 'Staged, not committed — review with `git diff --cached`, then commit.' : 'Not a git checkout: nothing staged.',
    ...(tag ? [`Pre-apply tag: ${tag}`] : []),
    `Undo: ${revertLine}`,
  ].join('\n');
  return {
    applied: true, key: b.key, mode: probe.mode, tag, revertLine, written, archived: b.archived,
    records: items.length, flagged, closesConfirmed: confirmedN, warnings: probe.warnings, report,
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
const isCalendarDay = (s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
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
  // No control or bidi characters in a title (REVIEW pass 2 suggestion): the
  // dry run prints it for a person to read before they confirm.
  t = printable(t).replace(/ {2,}/g, ' ').trim();
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
// `finishedLead` in work-migrate.js (REVIEW C1, D-M6E15-24) — an allowed-
// continuation grammar: the finish word leads, and only a date, `in <ref>`, a
// reference or a slice tag may follow it (after a dash, `(` or a sentence end
// too — no free text); anything else, or an undoing word anywhere, is
// `unclear`; "done when" / "… of done" are never
// markers. Wording that passes still closes only on evidence (below). Within ONE marker a specific
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
    // A bold run with nothing but `~` and spaces before it is the title, not
    // an annotation. Where the text starts is found once (REVIEW pass 2 I-D:
    // a slice per bold run was quadratic).
    const textStart = heading.search(/[^~\s]/);
    for (const m of heading.matchAll(BOLD_RE)) {
      if (textStart === -1 || m.index <= textStart) continue; // the title, not an annotation
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
    if (row.struckId) markers.push({ reason: 'fixed', text: row.struckId });
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
    // A bold lead that speaks of finishing is read with the rest of its line,
    // so a note after it (`**Done** — reverted`) is held to the same rule.
    const bold = file === 'BACKLOG.md' ? line.match(BOLD_LEAD_RE) : null;
    if (bold) {
      const lead = finishedLead(bold[1]);
      if (lead.reasons.size > 0 || lead.unclear) take(line.trim());
    }
  }
  // A question's own plain heading is read too (REVIEW pass 3 I-1): under a
  // "Resolved" section, "R2 — Reopened: still blocking" undoes the section.
  if (file === 'OPEN-QUESTIONS.md' && markers.length > 0 && heading) {
    const own = withoutLegacyId(heading.replace(BOLD_RE, ' '), row.legacyId ?? null);
    if (headingUndoes(own)) unclear.push(heading);
  }
  return { markers, unclear, statuses, unmappedFinish, statusLine };
}

const quote = (s) => `“${s}”`;

// The `<!-- backlog-key: … -->` / `<!-- bugs-key: … -->` comments Signal's own
// promote writes (`backlog.js`, a sha1 of the block), exactly: lowercase hex,
// 40 digits, single spaces. Any other spelling is scanned as usual.
// The limit of this exemption (REVIEW, accepted): ANY 40-hex value written
// inside that exact comment is skipped, a real secret too — the scanner cannot
// tell a sha1 from a 40-hex token. It hides only a value already committed in
// the list, inside a comment shaped like Signal's own.
const DEDUPE_KEY_COMMENT_G = /<!-- (?:backlog|bugs)-key: [0-9a-f]{40} -->/g;

// `scrubSensitive`'s hits for `text`, minus any lying wholly inside one of
// those comments — by position, so the same hex written anywhere else is still
// a hit (D-M6E15-23). The shared scrubber is unchanged.
function sensitiveHits(text) {
  const spans = [...String(text).matchAll(DEDUPE_KEY_COMMENT_G)].map((m) => [m.index, m.index + m[0].length]);
  return scrubSensitive(text).hits.filter((h) => !spans.some(([a, b]) => h.index >= a && h.index + h.match.length <= b));
}

// ── Evidence (D-M6E15-24; AC4.1, AC4.2) ─────────────────────────────────────
//
// Wording alone never closes an entry: at least one reference ANYWHERE in the
// entry's text (a bug table's bare `fixed` cell often has its PR link in the
// summary) must resolve in the repository being migrated —
//
//   - a commit: 7–40 lowercase hex (with a letter and a digit) that is a
//     prefix of a commit on the default branch (`buildEvidenceIndex`);
//   - a pull request: `PR #N`, `pull request #N`, a bare `#N` (not in a list
//     whose own IDs are `#N`), or a `https://host/owner/repo/pull/N` link
//     whose host and owner/repo are this repository's `origin`, where N
//     appears in a commit subject as `(#N)` or `Merge pull request #N`. Issue
//     references are issues, and the entry's own old ID is never its evidence;
//   - an Epic: an ID shaped `M2.10.E2` with a `<ID>-RETROSPECTIVE.md` under
//     `.planning/` (archive included).
//
// The index is built ONCE per run (`buildEvidenceIndex`) from one
// fixed-argument `git log` and a directory walk; no list text reaches git's
// argument list, and lookups are in memory. With no index (`evidence`
// absent), nothing resolves — fail closed. The gate can only make an entry
// more open: a defect in it over-flags rather than wrongly closing.
//
// This is git and retrospective evidence, not running the code or checking a
// screen; list text cannot give more.

const PROOF_MAX = 400;
const EVIDENCE_MAX = 120;
const HEX_REF_G = /\b(?=[0-9a-f]{0,39}[a-f])(?=[0-9a-f]{0,39}\d)[0-9a-f]{7,40}\b/g;
// `PR #N` / `pull request #N` always; a bare `#N` only in a list whose own IDs
// are not `#N` (there it is a cross-reference to another entry, REVIEW pass 3
// I-2). Issue references are masked first (`issue #N`, `issue: #N`,
// `Issues #12, #13`, `issues #12 and #13`).
const PR_NAMED_GS = [/\bPR\s{0,3}#?(\d{1,7})\b/gi, /\bpull\s{1,3}request\s{0,3}#?(\d{1,7})\b/gi];
const PR_BARE_G = /(?<![\w&#/])#(\d{1,7})\b/g;
const ISSUE_REFS_G = /\bissues?\s{0,3}:?\s{0,3}#\d{1,7}(?:\s{0,3}(?:,|&|and)\s{0,3}#\d{1,7}){0,50}/gi;
// A full pull-request URL; it counts only when host and owner/repo are this
// repository's `origin` (case and a trailing `.git` ignored).
const PR_URL_G = /\bhttps?:\/\/(?:[^@\s/()<>\]]{1,100}@)?([^/\s()<>\]]{1,200})\/([^/\s()<>\]]{1,100})\/([^/\s()<>\]]{1,100})\/pull\/(\d{1,7})\b/gi;
const EPIC_REF_G = /\bM\d{1,4}(?:\.\d{1,4}){0,4}\.E\d{1,4}\b/g;
const SUBJECT_PR_RES = [/\(#(\d{1,7})\)/g, /^Merge pull request #(\d{1,7})\b/g];
const RETRO_RE = /^(.+)-RETROSPECTIVE\.md$/;
const RETRO_WALK_MAX = 50000;

/**
 * The run's evidence index: every commit (sorted full hashes), the PR numbers
 * commit subjects carry (→ that commit), and the Epic IDs with a
 * retrospective under `.planning/` (→ its path). Reads only.
 *
 * @param {string} baseDir
 * @param {{execFn?: Function}} [opts]
 * @returns {{source: 'git'|'none', commits: string[], prs: Map<number, string>, epics: Map<string, string>,
 *   origin: {host: string, repo: string}|null}}
 */
export function buildEvidenceIndex(baseDir, { execFn = execFileSync } = {}) {
  let out = '';
  let source = 'git';
  const ref = ['refs/remotes/origin/HEAD', 'refs/heads/main', 'refs/heads/master'].find((r) => { try { execFn('git', ['rev-parse', '--verify', '--quiet', r], { cwd: baseDir, stdio: 'ignore' }); return true; } catch { return false; } }) ?? 'HEAD';
  try {
    // The default branch (origin/HEAD, else main, else master, else HEAD), not --all (D-M6E15-25, AC4.1): unmerged branches, stashes and fetched
    // remote work are not what this project shipped; native closes, too, are
    // confirmed only once their commit is on the default branch.
    out = String(execFn('git', ['log', '--format=%H%x09%s', ref, '--'], {
      cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024,
    }));
  } catch {
    out = '';
    source = 'none';
  }
  const commits = [];
  const prs = new Map();
  for (const line of out.split('\n')) {
    const tab = line.indexOf('\t');
    const hash = (tab === -1 ? line : line.slice(0, tab)).trim();
    if (!/^[0-9a-f]{40}$/.test(hash)) continue;
    commits.push(hash);
    const subject = tab === -1 ? '' : line.slice(tab + 1);
    for (const re of SUBJECT_PR_RES) {
      for (const m of subject.matchAll(re)) if (!prs.has(Number(m[1]))) prs.set(Number(m[1]), hash);
    }
  }
  commits.sort();
  // No readable history (not a repository, no commits, git failing): no
  // evidence at all — the retrospective walk is skipped too, so nothing can be
  // proposed for closing (REVIEW pass 3 I-3).
  if (source === 'none') return { source, commits: [], prs: new Map(), epics: new Map(), origin: null };

  // The repository a `/pull/N` link must point at (REVIEW pass 3 I-2): one
  // fixed-argument read; none outside git or with no `origin`.
  let origin = null;
  try {
    origin = parseOrigin(String(execFn('git', ['remote', 'get-url', 'origin'], {
      cwd: baseDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    })).trim());
  } catch {
    origin = null;
  }

  const epics = new Map();
  const stack = [['.planning', 0]];
  let seen = 0;
  while (stack.length > 0 && seen < RETRO_WALK_MAX) {
    const [rel, depth] = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(join(baseDir, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (++seen > RETRO_WALK_MAX) break;
      if (e.isDirectory() && depth < 8) stack.push([`${rel}/${e.name}`, depth + 1]);
      else if (e.isFile()) {
        const m = e.name.match(RETRO_RE);
        if (m && !epics.has(m[1])) epics.set(m[1], `${rel}/${e.name}`);
      }
    }
  }
  return { source, ref: ref.replace(/^refs\/(?:heads|remotes)\//, ''), commits, prs, epics, origin };
}

const repoKey = (owner, repo) => `${owner}/${repo}`.toLowerCase().replace(/\.git$/, '');

// `git@host:owner/repo.git`, `ssh://git@host:22/owner/repo`,
// `https://host/owner/repo.git` → `{host, repo: 'owner/repo'}`, lower case;
// null for anything else.
export function parseOrigin(url) {
  const m = String(url).match(/^(?:[a-z+]+:\/\/)?(?:[^@/\s]+@)?([^:/\s]+)(?::\d+)?[:/]([^/\s]+)\/([^/\s]+?)\/?$/i);
  return m ? { host: m[1].toLowerCase(), repo: repoKey(m[2], m[3]) } : null;
}

// The commit `prefix` names, from the sorted list: binary search, no scan.
function commitFor(commits, prefix) {
  let lo = 0;
  let hi = commits.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (commits[mid] < prefix) lo = mid + 1;
    else hi = mid;
  }
  return lo < commits.length && commits[lo].startsWith(prefix) ? commits[lo] : null;
}

// What `text` cites, in order, and which of it resolves. `found` and
// `missing` are the phrases the proof and the note print.
function checkEvidence(text, legacy, evidence, { bareHash = true } = {}) {
  const own = legacy && /^#\d+$/.test(legacy) ? Number(legacy.slice(1)) : null;
  // Issue references masked, same length, so positions stay.
  const scan = text.replace(ISSUE_REFS_G, (m) => ' '.repeat(m.length));
  const refs = []; // {at, kind, key}
  const seen = new Set();
  const add = (at, kind, key) => {
    if (seen.has(`${kind}:${key}`)) return;
    seen.add(`${kind}:${key}`);
    refs.push({ at, kind, key });
  };
  for (const m of scan.matchAll(HEX_REF_G)) add(m.index, 'commit', m[0]);
  for (const re of [...PR_NAMED_GS, ...(bareHash ? [PR_BARE_G] : [])]) {
    for (const m of scan.matchAll(re)) if (Number(m[1]) !== own) add(m.index, 'pr', Number(m[1]));
  }
  const origin = evidence?.origin ?? null;
  for (const m of scan.matchAll(PR_URL_G)) {
    const n = Number(m[4]);
    if (n === own) continue;
    if (origin && m[1].toLowerCase().replace(/:\d+$/, '') === origin.host && repoKey(m[2], m[3]) === origin.repo) add(m.index, 'pr', n);
    else add(m.index, 'pr-elsewhere', `${m[2]}/${m[3]}#${n}`);
  }
  for (const m of scan.matchAll(EPIC_REF_G)) add(m.index, 'epic', m[0]);
  refs.sort((a, b) => a.at - b.at);

  const found = [];
  const missing = [];
  const cited = [];
  for (const r of refs) {
    if (r.kind === 'commit') {
      cited.push(`commit ${r.key}`);
      const hash = evidence ? commitFor(evidence.commits, r.key) : null;
      if (hash) found.push(`commit ${hash.slice(0, 7)}`);
      else missing.push(`commit ${r.key} not found in this repository's history`);
    } else if (r.kind === 'pr-elsewhere') {
      cited.push(`a pull request link (${r.key})`);
      missing.push(`a pull request link (${r.key}) not to this repository's origin${evidence?.origin ? '' : ' (no origin remote could be read)'}`);
    } else if (r.kind === 'pr') {
      cited.push(`PR #${r.key}`);
      const hash = evidence?.prs.get(r.key);
      if (hash) found.push(`PR #${r.key} → ${hash.slice(0, 7)}`);
      else missing.push(`cited PR #${r.key} not found in this repository's history`);
    } else {
      cited.push(`Epic ${r.key}`);
      const path = evidence?.epics.get(r.key);
      if (path) found.push(`${r.key} → ${path}`);
      else missing.push(`Epic ${r.key} has no retrospective under .planning/`);
    }
  }
  // Each piece of evidence printable and bounded, so three always fit in a
  // proof (REVIEW pass 3 suggestion: a retrospective path is file-system text).
  return { found: [...new Set(found.map((f) => clip(printable(f), EVIDENCE_MAX)))], missing, cited };
}

// At most a few of a long list in a note, then how many more (REVIEW pass 3
// suggestion: a 400 KB row made a 2.8 MB note).
const NOTE_LIST_MAX = 5;
function capped(list, sep = '; ') {
  const shown = list.slice(0, NOTE_LIST_MAX).map((x) => clip(printable(x), EVIDENCE_MAX));
  return list.length > NOTE_LIST_MAX ? `${shown.join(sep)}${sep}… and ${list.length - NOTE_LIST_MAX} more` : shown.join(sep);
}

// `text` without its folded `<details>` blocks. `segmentBacklog` folds a
// `<details>` block into the row above it; its words and references belong to
// the folded entry, so they neither close the live row nor give it evidence.
// Counted per line like the segmenter; an unclosed block runs to the end.
// Removing text can only leave an entry more open.
function withoutFolds(text) {
  if (!text.includes('<details')) return text;
  const kept = [];
  let depth = 0;
  for (const line of text.split('\n')) {
    const was = depth;
    depth += (line.match(/<details/g) ?? []).length - (line.match(/<\/details>/g) ?? []).length;
    if (depth < 0) depth = 0;
    if (was === 0 && depth === 0 && !line.includes('</details>')) kept.push(line);
  }
  return kept.join('\n');
}

// The entry's outcome: `{close: {reason, proof, wording}}`, or `{flag, note}`
// (open).
function decide(file, folded, evidence, { bareHash = true } = {}) {
  const row = typeof folded.text === 'string' ? { ...folded, text: withoutFolds(folded.text) } : folded;
  if (file === 'BUGS.md' && row.idUnreadable) {
    return { flag: 'id-unreadable', note: 'Its ID cell does not read as an ID (one short token with a digit, on the first line), so no old ID was kept and the row was not read for a finished marker; left open.' };
  }
  const m = readMarkers(file, row);
  const reasons = new Set(m.markers.map((x) => x.reason));
  if (m.unclear.length > 0) {
    return { flag: 'unclear', note: `Its wording ${m.unclear.map((x) => quote(clip(printable(x)))).join(', ')} does not read as plainly finished — a qualifier, or words after the finish word other than a date, \`in <ref>\`, a reference or a slice tag — so it was left open rather than closed by inference.` };
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
    const wording = [...new Set(m.markers.map((x) => x.text))].join('; ');
    // The entry's own text only (REVIEW pass 3 I-1): a grouping heading's
    // reference is not evidence for every entry under it.
    const checked = checkEvidence(row.text, legacyOf(file, row), evidence, { bareHash });
    const said = `Its wording says ${m.markers.map((x) => quote(clip(printable(x.text)))).join(', ')}`;
    if (checked.found.length === 0) {
      let why;
      if (!evidence) why = `, but no repository history was given to check it against${checked.missing.length ? ` (it cites ${capped(checked.cited, ', ')})` : ''}`;
      else if (evidence.source === 'none') why = `, but the migration could not read this repository's history, so nothing it cites could be checked${checked.cited.length ? ` (it cites ${capped(checked.cited, ', ')})` : ''}`;
      else if (checked.missing.length === 0) why = ', but it cites no commit, pull request or Epic that could be checked';
      else why = `; ${capped(checked.missing)}`;
      return { flag: 'no-evidence', note: `${said}${why} — left open rather than closed on its wording alone.` };
    }
    const shown = checked.found.slice(0, 3).join('; ');
    const room = PROOF_MAX - shown.length - 2;
    const proof = clip(`${clip(printable(wording), Math.max(room, 20))}; ${shown}`, PROOF_MAX);
    return { close: { reason: [...reasons][0], proof, wording, evidence: checked.found } };
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
 * @param {{commits: string[], prs: Map<number, string>, epics: Map<string, string>}} [opts.evidence] —
 *   the repository's evidence index (`buildEvidenceIndex`). A finished entry
 *   closes only when a reference in it resolves here (D-M6E15-24); without an
 *   index nothing resolves, so every finished entry stays open (fail closed).
 * @param {boolean} [opts.confirmCloses] — the person's yes to the proposed
 *   closes (D-M6E15-25). Without it no entry is closed: one whose wording and
 *   evidence pass is open, flagged `looks-finished`, and listed in
 *   `proposedCloses`; with it exactly those entries get a legacy `closed`
 *   event (proof = wording + evidence). `proposedCloses` is the same list
 *   either way.
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
 *   errors: string[], proposedCloses: Array<{id: string, legacyId: string|null, title: string,
 *     reason: string, wording: string, evidence: string[], proof: string}>}}
 *   `records` is empty whenever `errors` is not. `flagged` (and a manifest
 *   item's `flag`) is null for a closed entry and an unmarked inbox entry;
 *   otherwise why it needs a person's look: `no-marker`, `status-unmapped`,
 *   `no-status-line`, `unclear`, `conflict`, `finished-word-unmapped`,
 *   `no-evidence` (the wording says finished; no reference in it resolves),
 *   `looks-finished` (a proposed close the person did not confirm),
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
  const evidence = opts.evidence ?? null;
  const confirmCloses = opts.confirmCloses === true;
  const proposedCloses = [];
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
    // A list whose own IDs are `#N`: there a bare `#N` names another entry.
    const bareHash = !seg.rows.some((row) => /^#\d+$/.test(legacyOf(file, row) ?? ''));
    for (const row of seg.rows) planned.push({ file, row, pieces: [row], bareHash });
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
  if (errors.length) return { key, records: [], regions, manifest: { key, files, items: [] }, errors, proposedCloses };

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
      let outcome = decide(file, row, evidence, { bareHash: p.bareHash });
      // A close is only ever PROPOSED (D-M6E15-25, AC4.1): the person confirms
      // the list as one yes; without it the entry stays open, flagged.
      if (outcome.close) {
        const c = outcome.close;
        proposedCloses.push({
          id, legacyId: legacy ?? null, title: record.title, reason: c.reason,
          wording: printable(c.wording), evidence: c.evidence.map(printable), proof: c.proof,
        });
        if (!confirmCloses) {
          outcome = {
            flag: 'looks-finished',
            note: `Its wording says ${quote(clip(printable(c.wording)))} and ${c.evidence.slice(0, 3).map(printable).join('; ')} resolves in this repository's history, so it looks finished (${c.reason}). `
              + 'The migration closes nothing on its own and this close was not confirmed, so it is open; if it is finished, close it with /sig:item close.',
          };
        }
      }
      if (outcome.close) {
        // A date the marker writes beside its finish word wins, when there is
        // exactly one (`markerDates`, REVIEW S1); any other date in the proof is
        // not the close date, and two do not say which is.
        // An impossible calendar date (2026-02-30) is not a date (REVIEW pass 2
        // suggestion): it never becomes closed.at.
        const written = markerDates(outcome.close.wording).filter(isCalendarDay);
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
  if (errors.length) return { key, records: [], regions, manifest, errors, proposedCloses };

  // The sensitive-data gate `newItems` applies (scrub.js): list text from
  // another repository is data, and a hit stops the plan for a person's
  // decision. Detection only — with `acknowledgeSensitive` the text is kept
  // verbatim, never redacted in silence. Signal's own dedupe-key comments are
  // not secrets (D-M6E15-23): a hit lying wholly inside one is skipped.
  const hits = records.flatMap((r) => [r.record.title, r.body].flatMap(sensitiveHits)
    .map((h) => ({ id: r.record.id, file: r.sourceRef.file, type: h.type, match: h.match })));
  if (hits.length > 0 && !opts.acknowledgeSensitive) {
    return { key, records: [], regions, manifest, errors, aborted: 'sensitive-data-pending', hits, proposedCloses };
  }
  return { key, records, regions, manifest, errors, proposedCloses };
}
