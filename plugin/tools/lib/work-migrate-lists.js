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
import { bodyDirFor } from './work-convert.js';
import { lockFailure, WorkStoreError } from './work-errors.js';
import { GENERATED_FILES } from './work-generate.js';
import { rewriteRelativeLinks } from './work-links.js';
import {
  backlogTag,
  bugTitle,
  clip,
  segmentBacklog,
  segmentBugs,
  segmentInbox,
  segmentQuestions,
  SOURCES,
  TAG_TYPES,
} from './work-migrate.js';
import { checkEvents, validateRecord } from './work-record.js';
import { bodyPath, recordPath } from './work-records.js';
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
// back to its path. `fs-backup` is outside git, an unborn HEAD, or an ignored
// `.planning/` (`probeGitState`); none can be reset to a commit.
function revertLineFor(probe, force, tag, created, archived) {
  const fileUndo = [`rm -f -- ${created.join(' ')}`, ...archived.map((a) => `mv -- ${a.to} ${a.from}`)].join(' && ');
  if (probe.mode !== 'git') return `# nothing staged (.planning/ is not under git): undo with ${fileUndo}`;
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
//     search finds it. An entry with no old ID gets none — not a `FILE:line`
//     stand-in, which an old-ID lookup would then match;
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

const typeOf = (file, row) => {
  if (file === 'BUGS.md') return 'BUG';
  if (file === 'OPEN-QUESTIONS.md') return 'Q';
  if (file === 'ISSUES-INBOX.md') return 'NEW';
  return TAG_TYPES[backlogTag(row)] ?? 'FEAT';
};

const legacyOf = (file, row) => {
  if (file === 'BUGS.md') return row.kind === 'table' ? row.id : null;
  if (file === 'BACKLOG.md' || file === 'OPEN-QUESTIONS.md') return row.legacyId ?? null;
  return null;
};

function titleOf(file, row) {
  let t;
  if (file === 'BUGS.md') t = row.kind === 'table' ? bugTitle(row.summary) : clip(row.heading.replace(/~~/g, ''));
  else if (file === 'BACKLOG.md') t = clip(row.title);
  else t = clip(String(row.heading).replace(/~~/g, ''));
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
//   - a `**Status:** …` line in the entry: only its lead phrase (before the
//     first ` — `, `.`, `;` or `,`, parentheticals removed) is read, because
//     the rest is prose (`not-a-bug (closed …) — …` is not-a-bug, not closed);
//   - a bug table's status cell;
//   - in BACKLOG.md, a body line that opens with a bold marker (`**Done** in
//     …`, `**Closed — superseded**`) — the shape corpus project 1 writes;
//   - in OPEN-QUESTIONS.md, the section heading an entry sits under, when it
//     says Resolved / Done / Closed (the segmenter's `groupWord`).
//
// Words, any case: done / resolved / answered / fixed / closed → `fixed`;
// not-a-bug → `rejected`; won't-fix → `wontdo`; superseded → `stale`. Within
// ONE marker a specific word wins over a generic one (`Closed — superseded`
// is a close because superseded: `stale`). ACROSS markers, two reasons — or a
// marker beside a status that is not one — is a conflict: open, flagged. A
// qualified word (`partially resolved`, `not fixed`) is unclear: open,
// flagged. A finished word the backlog reader knows but this list does not
// map (SHIPPED, ABANDONED, CUT) is flagged, never guessed. Nothing throws.

const FINISH_RE = /\b(?:done|resolved|answered|fixed|closed)\b/i;
const QUALIFIED_FINISH_RE = /\b(?:partially|partly|mostly|largely|not)\s+(?:done|resolved|answered|fixed|closed)\b/i;
const SPECIFIC_FINISH = [
  [/\bnot[- ]a[- ]bug\b/i, 'rejected'],
  [/\bwon['’]?t[- ]?fix\b/i, 'wontdo'],
  [/\bsuperseded\b/i, 'stale'],
];
const UNMAPPED_FINISH_RE = /\b(?:SHIPPED|ABANDONED|CUT)\b/;
const STRUCK_RE = /~~[^~]+~~/;
const BOLD_RE = /\*\*([^*]+)\*\*/g;
const STATUS_LINE_RE = /^\*\*Status:\*\*\s*(.*)$/;
const BOLD_LEAD_RE = /^\*\*([^*]+)\*\*/;

// The words a status line's lead phrase carries.
function leadPhrase(text) {
  return text.replace(/\([^)]*\)/g, ' ').split(/\s[—–-]\s|[.;,](?:\s|$)/)[0];
}

// `{reasons: Set, unclear: boolean}` for one marker's text.
function classify(text) {
  const unclear = QUALIFIED_FINISH_RE.test(text);
  const specific = new Set(SPECIFIC_FINISH.filter(([re]) => re.test(text)).map(([, r]) => r));
  const reasons = specific.size > 0 ? specific : FINISH_RE.test(text) ? new Set(['fixed']) : new Set();
  return { reasons, unclear };
}

// Everything an entry says about being finished.
function readMarkers(file, row) {
  const markers = []; // {reason, text}
  const unclear = [];
  const statuses = []; // status text that is not a finished marker
  const unmappedFinish = [];
  const take = (text, words = text) => {
    const c = classify(words);
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
      if (!take(m[1]) && UNMAPPED_FINISH_RE.test(m[1])) unmappedFinish.push(m[1]);
    }
    const lastStrike = heading.lastIndexOf('~~');
    if (STRUCK_RE.test(heading) && lastStrike + 2 < heading.length) {
      const tail = heading.slice(lastStrike + 2).replace(BOLD_RE, ' ').replace(/^[\s·—–:-]+|\s+$/g, '');
      if (tail) take(tail);
    }
  }
  if (file === 'BUGS.md' && row.kind === 'table') {
    const cell = row.statusRaw ?? '';
    if (!take(cell, leadPhrase(cell.replace(/[`*_]/g, ''))) && cell.trim()) statuses.push(cell.trim());
  }
  if (file === 'OPEN-QUESTIONS.md' && row.groupWord) markers.push({ reason: 'fixed', text: row.groupHeading });

  let statusLine = false;
  let fence = false;
  for (const line of row.text.split('\n').slice(1)) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const st = line.match(STATUS_LINE_RE);
    if (st) {
      statusLine = true;
      const text = st[1].trim();
      if (!take(text, leadPhrase(text)) && text) statuses.push(text);
      continue;
    }
    const bold = file === 'BACKLOG.md' ? line.match(BOLD_LEAD_RE) : null;
    if (bold) take(line.trim(), bold[1]);
  }
  return { markers, unclear, statuses, unmappedFinish, statusLine };
}

const quote = (s) => `“${s}”`;

// The entry's outcome: `{close: {reason, proof}}`, or `{flag, note}` (open).
function decide(file, row) {
  const m = readMarkers(file, row);
  const reasons = new Set(m.markers.map((x) => x.reason));
  if (m.unclear.length > 0) {
    return { flag: 'unclear', note: `Its marker ${m.unclear.map(quote).join(', ')} is qualified, so it was left open rather than closed by inference.` };
  }
  if (reasons.size > 1 || (reasons.size === 1 && m.statuses.length > 0)) {
    const said = [...m.markers.map((x) => `${quote(x.text)} → ${x.reason}`), ...m.statuses.map((s) => `${quote(s)} → open`)];
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
 * @returns {{key: string, records: Array<{record: object, body: string, recordPath: string,
 *   bodyPath: string, flagged: string|null, sourceRef: {file: string, ranges: Array<{line: number, endLine: number}>}}>,
 *   regions: Array<{file: string, name: string, line: number, endLine: number, text: string}>,
 *   manifest: {key: string, files: object, items: object[]}, errors: string[]}}
 *   `records` is empty whenever `errors` is not.
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
      regions.push({ file, name: 'backlog skeleton', line: 1, endLine: lineCount, text });
      files[file].regions.push('backlog skeleton');
      continue;
    }
    let seg;
    try {
      seg = SEGMENTERS[file](text);
    } catch (err) {
      errors.push(`${file}: ${err.message}`);
      continue;
    }
    for (const row of seg.rows) planned.push({ file, row, pieces: [row] });
    const prose = [];
    for (const o of seg.orphans) {
      if (structureOnly(o.text)) regions.push({ file, name: o.name, line: o.line, endLine: o.endLine, text: o.text });
      else prose.push(o);
    }
    for (const g of seg.gaps) regions.push({ file, name: g.text.split('\n').some((l) => l.trim() === '---') ? 'separator' : 'blank', line: g.line, endLine: g.endLine, text: g.text });
    if (seg.watchlist) {
      const w = seg.watchlist;
      regions.push({ file, name: 'standing watchlist', line: w.line, endLine: w.endLine, text: w.text });
    }
    if (prose.length > 0) planned.push({ file, row: null, pieces: prose, flagged: 'non-item' });
    for (const r of regions.filter((x) => x.file === file)) files[file].regions.push(r.name);
  }

  const records = [];
  planned.forEach((p, i) => {
    const id = `${key}-${i + 1}`;
    const { file, row } = p;
    const d = dates[file];
    const created = d?.first;
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
        events.push({ type: 'closed', at: d?.last, by: PLAN_BY, reason: outcome.close.reason, proof: outcome.close.proof, legacy: true });
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
  return { key, records, regions, manifest, errors };
}
