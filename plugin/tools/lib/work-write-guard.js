// The PreToolUse guard against hand edits of a v2 work store (M6.E13/t5.1,
// AC5.1). Called from hooks/check-state-write.js, which loads this module only
// after a cheap string test finds `.planning` in the resolved path.
//
// On a v2 store the records, the views and the history files are written by
// code (`/sig:item` → work-records.js → work-views.js). A hand edit to one of
// them is either overwritten at the next regeneration or, for a record, an
// edit the event log never saw. Bodies (`items/**/*.md`) stay editable.
// Unit records (`work/units/*.json`, M6.E16/t2.5, AC2.2) are guarded as item
// records are; they are written by unit-records.js, not by `/sig:item`. Every
// other path under `work/units/` is guarded too, whatever its name and whether
// or not the folder exists (REVIEW pass 1, C-S4 / S-L4; AC6.4 kind a): nothing
// but the library writes in that folder, its `.keep` included (`ensureUnitsDir`,
// which no hook sees), and a `Write` of `units/notes.md` on a project without
// the folder would create it — the folder existing is what turns unit records on.
// `work/WORK.md` is guarded too, with its own message (REVIEW I7), but only
// against the two edits that matter: one that would change or remove
// `schema_version: 2`, which would switch this guard off, and one that would
// change or remove the frontmatter `key:`, which prefixes every item ID and so
// would orphan every record. The proposed content is computed (Write:
// `content`; Edit: `old_string` → `new_string`, literally; MultiEdit: each of
// `edits` in order) and blocked unless it still reads `schema_version: 2` and
// the current `key` — a proposal whose frontmatter no longer parses counts as
// removing both. Any other WORK.md text edit is allowed (loop 1 part B).
//
// What no PreToolUse hook can see: an edit made through Bash (`sed -i`, `>`,
// a script). See references/hooks-api.md § "What the work-store guard cannot
// see" for the backstop and its limit.
//
// This hook runs on every Edit/Write in every repository of every user, and in
// every project except Signal the views are typed by hand (RESEARCH, Risk 1).
// So it blocks ONLY when `.planning/work/WORK.md` reads `schema_version: 2`,
// and every failure — an unreadable WORK.md, an unknown schema_version, a
// throw anywhere — allows the write.
//
// Paths are compared case-insensitively (the M6.E3 `.ENV` lesson: on macOS
// `.Planning/BUGS.MD` IS `.planning/BUGS.md`), and both the lexical path and
// its realpath are classified: the lexical one catches a symlinked `.planning`
// directory (its realpath has no `.planning` segment), the realpath catches an
// alias pointing into `.planning` (`notes -> .planning/work/items`). The hook's
// prefilter tests both too, so such an alias reaches this module (REVIEW loop
// 1); before that, the realpath here was never consulted for one.
//
// Each segment is also compared without the dots and spaces at its end, and
// the last one without anything from a `:` on (REVIEW pass 1, S-L4): on
// Windows `M6.E16.json.`, `M6.E16.json ` and `M6.E16.json::$DATA` all open
// `M6.E16.json`, so each of those spellings is that file here.
//
// Look-alike letters are read as the plain ones (`foldName`, REVIEW r6). And
// two names for a guarded file that hold no `.planning` at all are found from
// the project — the event's cwd and the target's folder, upward: the real path
// of a `.planning`, or of a folder inside it, that is a symlink
// (`underRealFolder`), and a hard link to a guarded file (`hardLinkTo`). The
// hook's prefilter lets every edit in a project with a store through for them.
// Not seen: a hard link (or such a real path) outside the project, edited
// with a cwd that is outside it too — nothing then names the project.
//
// A third such name (r6.1): macOS opens a file by its numbers,
// `/.vol/<device>/<inode>`. Those are compared with the numbers of the
// project's guarded files and folders (`volTarget`), found from the cwd — a
// `/.vol` path has no folder of its own to look above.

import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

import { shownName } from './printable-text.js';
import { pathCannotExist } from './store-above.js';

const VIEWS = new Set(['bugs.md', 'backlog.md', 'issues-inbox.md', 'open-questions.md']);

// `rel` comes from the tool call, so it is printed through `shownName`: a line
// break or an invisible character in a file name never reaches the message raw.
export const BLOCK_MESSAGE = (rel) =>
  `${shownName(rel)} is part of this project's v2 work store `
  + '(.planning/work/WORK.md has `schema_version: 2`), so a hand edit would be lost or bypass the record. '
  + 'Records (.planning/work/items/**/*.json) are written only through /sig:item; the views and history '
  + 'files are generated from the records and regenerate after every change. '
  + 'For prose, edit the item\'s body file (.planning/work/items/NN/KEY-n.md), which is not blocked.'
  + (isUnitRecord(rel)
    ? ' This path is under .planning/work/units/, where the unit records are (.planning/work/units/*.json) and '
      + 'where nothing else is written: the folder existing is what turns unit records on. /sig:item does not change a unit record: unit '
      + 'records change only through Signal\'s own commands — /sig:discuss --epic and /sig:new-project --epic open '
      + 'one (and record a reopen when a closed one is opened again on your say-so), /sig:ship requests its close, /sig:ship and '
      + '/sig:docs-sweep confirm the close once its commit is on the default branch, and '
      + '/sig:docs-migrate --work-store creates them for a project that had none. A hold is placed and released '
      + 'with holdUnit and releaseUnit (tools/lib/unit-records.js; see /sig:docs-archive) — only when the user asks, never on your own initiative. '
      + 'A unit record has no body file.'
    : '');

// Said before `BLOCK_MESSAGE` when the edit named the file by a hard link.
const LINK_NOTE = (abs, rel) => `${shownName(abs)} is another name (a hard link) for ${shownName(rel)}. `;
// And when it named the file, or the folder it is in, by number (r6.1).
const NUMBERS_NOTE = (abs, rel) => `${shownName(abs)} names ${shownName(rel)} by its file numbers (a /.vol path). `;

const IN_A_V2_STORE = 'this project has a v2 work store (.planning/work/WORK.md has `schema_version: 2`), whose records and views are written by code';
// A `/.vol` path nothing could be read from: it cannot be shown not to be a record.
const UNRESOLVED_MESSAGE = (abs) =>
  `${shownName(abs)} is a /.vol path — a file named by its numbers, not by where it is — and it could not be resolved, so it `
  + `cannot be shown not to be one of the store's files: ${IN_A_V2_STORE}. Nothing was changed. Address the file by its path.`;
// A file with another name, or one named by number, in a store too large to compare it with.
const UNDECIDED_MESSAGE = (abs) =>
  `${shownName(abs)} ${isVolPath(abs) ? 'is a /.vol path (a file named by its numbers)' : 'has more than one name (a hard link)'}, and `
  + `this project's store holds too many files to check that it is not another name for one of them: ${IN_A_V2_STORE}. `
  + 'Nothing was changed. '
  + (isVolPath(abs) ? 'Address the file by its path.' : 'If it is not a record, give it a single name (copy it, remove the link), then edit it.');

export const WORK_MD_MESSAGE = (rel) =>
  `${shownName(rel)} switches this project's v2 work store on (\`schema_version: 2\`) and names its \`key\`, which `
  + 'prefixes every item ID. This edit would change or remove one of those lines: a changed version switches '
  + 'off this guard and the generated views, and a changed key orphans every record. Other text in the file '
  + 'may be edited. Items are changed with /sig:item; the store\'s version is changed only by the migration '
  + 'tool, `node tools/work-migrate-v2.mjs`.';

// A name as it is compared (REVIEW r6): look-alike letters read as the plain
// ones, then case set aside. macOS opens `unitſ` (U+017F) as `units`, `worK`
// (U+212A) as `work` and `ißues-inbox.md` as `issues-inbox.md`, and a later
// normalisation turns fullwidth `ｕｎｉｔｓ` into `units`. NFKC reads the long
// s, the Kelvin sign, fullwidth letters and ligatures as plain letters; upper
// then lower case reads `ß` as `ss`, which lower case alone leaves as it is.
// A letter with a mark on it (`ś`) stays a different letter.
const foldName = (s) => s.normalize('NFKC').toLowerCase().toUpperCase().toLowerCase();

// A path's segments as they are compared: folded (`foldName`), each without
// the dots and spaces at its end, the last without anything from a `:` on.
// Loops, not patterns: a segment is text from a tool call.
function comparable(parts) {
  return parts.map((part, i) => {
    let s = foldName(part);
    if (i === parts.length - 1 && s.includes(':')) s = s.slice(0, s.indexOf(':'));
    let to = s.length;
    while (to > 0 && (s[to - 1] === '.' || s[to - 1] === ' ')) to -= 1;
    return s.slice(0, to);
  });
}

const relSegs = (rel) => comparable(rel.split('/'));
const isUnitRecord = (rel) => {
  const segs = relSegs(rel);
  return segs[0] === '.planning' && segs[1] === 'work' && segs[2] === 'units';
};
const isWorkMd = (rel) => relSegs(rel).join('/') === '.planning/work/work.md';
// Is `segs` (lower-cased, after `.planning/`) a protected target?
function isTarget(segs) {
  if (segs.length === 1) return VIEWS.has(segs[0]);
  if (segs[0] !== 'work') return false;
  // `work/units` itself and everything under it, whatever its name
  // (`checkWorkWrite` then asks whether the folder is there, for a path that is not a record's).
  if (segs[1] === 'units') return true;
  if (segs.length === 2) return segs[1] === 'epics.md' || segs[1] === 'work.md';
  if (segs[1] === 'history') return segs.length === 3 && segs[2].endsWith('.md');
  if (segs[1] === 'items') return segs[segs.length - 1].endsWith('.json');
  return false;
}

// Every reading of an absolute path as a protected target, as {baseDir, rel},
// outermost first. A path can hold more than one `.planning` segment, and each
// is tried as the project's: `<project>/.planning/work/units/.planning/x.md`
// is a file under the project's `work/units/` whatever the folder inside it is
// called, and reading only the innermost segment let it through — and writing
// it turned unit records on. A nested project of its own
// (`<project>/sub/.planning/notes.md`) is still its own: no reading of it is a
// target unless the path under that segment is one.
//
// A path is a target when it is one as written (folded) OR as Windows
// would open it (`comparable`): the second reading only ever adds a target, so
// a name with a `:` in it that was guarded before still is.
function classify(abs) {
  const parts = abs.split(sep);
  const out = [];
  const seen = new Set();
  for (const lower of [parts.map(foldName), comparable(parts)]) {
    for (let i = lower.indexOf('.planning'); i >= 0; i = lower.indexOf('.planning', i + 1)) {
      const segs = lower.slice(i + 1);
      if (segs.length === 0 || !isTarget(segs)) continue;
      const baseDir = parts.slice(0, i).join(sep) || sep;
      if (seen.has(baseDir)) continue;
      seen.add(baseDir);
      out.push({ baseDir, rel: ['.planning', ...parts.slice(i + 1)].join('/') });
    }
  }
  return out;
}

// realpath of a path that may not exist yet: the nearest existing ancestor,
// realpathed, with the rest appended.
//
// A link whose target is not there is followed by hand (r6.5): `realpath`
// cannot resolve it, and a Write goes through it and CREATES the target —
// `dangle.json -> .planning/work/items/00/NEW-1.json` made a record. A few
// hops at most, so a link that loops ends.
const LINK_HOPS_MAX = 8;
function realpathLoose(abs) {
  const rest = [];
  let cur = abs;
  let hops = 0;
  for (;;) {
    try {
      return join(realpathSync.native(cur), ...rest);
    } catch {
      let target = null;
      try {
        if (lstatSync(cur).isSymbolicLink()) target = readlinkSync(cur);
      } catch {
        target = null;
      }
      if (target !== null) {
        hops += 1;
        if (hops > LINK_HOPS_MAX) return abs;
        cur = resolve(dirname(cur), target);
        continue;
      }
      const parent = dirname(cur);
      if (parent === cur) return abs;
      rest.unshift(basename(cur));
      cur = parent;
    }
  }
}

/**
 * Classify an absolute path by its shape alone (no store read): the
 * `{baseDir, rel}` candidates that name a protected target — one for each
 * `.planning` segment of the path, as written and as resolved, under which the
 * rest of the path is a target.
 *
 * @param {string} abs — absolute, normalised
 * @returns {{blocked: boolean, candidates: Array<{baseDir: string, rel: string}>}}
 */
export function protectedTarget(abs) {
  const candidates = [];
  const seen = new Set();
  for (const p of [abs, realpathLoose(abs)]) {
    for (const c of classify(p)) {
      if (seen.has(c.baseDir)) continue;
      seen.add(c.baseDir);
      candidates.push(c);
    }
  }
  return { blocked: candidates.length > 0, candidates };
}

// ── Two routes with no `.planning` in the path (REVIEW r6) ──────────────────
//
// Neither can be read off the path, so both start from the project: every
// folder, from the event's cwd and from the target's own folder upward, that
// holds a work store. Each helper returns `{baseDir, rel}` candidates as
// `classify` does, and `[]` on anything it cannot read.

function storeRoots(...dirs) {
  const roots = new Set();
  for (const dir of dirs) {
    for (let cur = dir; ; cur = dirname(cur)) {
      if (existsSync(join(cur, '.planning', 'work', 'WORK.md'))) roots.add(cur);
      if (dirname(cur) === cur) break;
    }
  }
  return [...roots];
}

// Is this project-relative path (`.planning/…`) a protected target, as
// written or as Windows would open it — the two readings `classify` makes?
const isTargetRel = (rel) => {
  const parts = rel.split('/');
  return isTarget(parts.map(foldName).slice(1)) || isTarget(comparable(parts).slice(1));
};

// The folders a guarded file can be in. Any of them may be a symlink.
const GUARDED_DIRS = ['.planning', '.planning/work', '.planning/work/items', '.planning/work/units', '.planning/work/history'];

// A target named by the REAL path of a guarded folder: `.planning`, or a
// folder inside it, is a symlink, and the edit is addressed to where it points.
// The real path of the target is compared with the real path of each folder.
function underRealFolder(real, root) {
  const out = [];
  const seen = new Set();
  for (const dir of GUARDED_DIRS) {
    let realDir;
    try {
      realDir = realpathSync.native(join(root, ...dir.split('/')));
    } catch {
      continue; // the folder is not there
    }
    if (testSeam.realDirSpelling !== null) realDir = testSeam.realDirSpelling(realDir);
    if (!real.startsWith(realDir + sep)) continue;
    const rel = [dir, ...real.slice(realDir.length + 1).split(sep)].join('/');
    if (seen.has(rel) || !isTargetRel(rel)) continue;
    seen.add(rel);
    out.push({ baseDir: root, rel });
  }
  return out;
}

// How many folder entries a search by file numbers reads before it stops:
// Signal's own store holds a few hundred files. A search that stops short has
// not shown the target to be unguarded, and its caller refuses (r6.1).
const LINK_SCAN_MAX = 20000;

/**
 * For tests only; nothing in Signal sets either. `linkScanMax`: a lower limit
 * than `LINK_SCAN_MAX`, so no test writes 20,001 files. `realDirSpelling`: a
 * function given a guarded folder's real path, returning the text
 * `underRealFolder` compares with — so a test on any system can stand in for
 * one where the same folder has two spellings (`/System/Volumes/Data/…` on a
 * Mac, a bind mount) and the comparison by text does not decide.
 */
export const testSeam = { linkScanMax: null, realDirSpelling: null };

// The guarded files every store has, asked about by name before any folder is
// read — a folder with too many entries cannot hide them.
const KNOWN_FILES = [
  '.planning/work/WORK.md', '.planning/work/EPICS.md',
  '.planning/BUGS.md', '.planning/BACKLOG.md', '.planning/ISSUES-INBOX.md', '.planning/OPEN-QUESTIONS.md',
];

const numbersOf = (path) => {
  try {
    const s = statSync(path, { bigint: true });
    return { dev: s.dev, ino: s.ino, nlink: s.nlink, file: s.isFile(), dir: s.isDirectory() };
  } catch {
    return null;
  }
};
const sameNumbers = (a, b) => a !== null && b !== null && a.dev !== null && a.dev === b.dev && a.ino === b.ino;

// The guarded files and folders of a project, each with its device and file
// numbers: `{rel, dir, dev, ino}`. The known files first, then the folders
// records are in (`units`, `items`, `history`), and only then the two folders
// that also hold other things (`.planning/work`, `.planning`) — so that
// whatever fills those does not use up the limit before a record is reached.
// Ends with `{incomplete: true}` when the limit stops it.
function* guardedEntries(root) {
  const at = (rel) => join(root, ...rel.split('/'));
  const entry = (rel, dir) => {
    const n = numbersOf(at(rel));
    return n === null ? null : { rel, dir, dev: n.dev, ino: n.ino };
  };
  for (const rel of KNOWN_FILES) {
    const e = entry(rel, false);
    if (e !== null) yield e;
  }
  for (const rel of GUARDED_DIRS) {
    const e = entry(rel, true);
    if (e !== null) yield e;
  }
  const max = testSeam.linkScanMax ?? LINK_SCAN_MAX;
  let read = 0;
  // Taken from the end: units, items, history, then `.planning/work`, then `.planning`.
  const pending = [['.planning', false], ['.planning/work', false], ['.planning/work/history', false], ['.planning/work/items', true], ['.planning/work/units', true]];
  while (pending.length > 0) {
    const [dir, deep] = pending.pop();
    let listed;
    try {
      listed = readdirSync(at(dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of listed) {
      read += 1;
      if (read > max) {
        yield { incomplete: true };
        return;
      }
      const rel = `${dir}/${e.name}`;
      // A folder of records that is a LINK is not read (the store does not
      // read one either): `items/zz -> /` would have this walk the disk.
      if (e.isDirectory() && !deep) continue;
      if (e.isDirectory()) pending.push([rel, true]);
      else if (!isTargetRel(rel)) continue;
      const found = entry(rel, e.isDirectory());
      if (found !== null) yield found;
    }
  }
}

// A target that is a second name (a hard link) for a guarded file. Asked only
// of a file that has more than one name; then the device and file numbers of
// each guarded file of the project are compared with the target's. One that
// is not found before the limit is `undecided`, and refused.
function hardLinkTo(abs, root) {
  try {
    const target = numbersOf(abs);
    if (target === null || !target.file || target.nlink < 2n) return [];
    for (const e of guardedEntries(root)) {
      if (e.incomplete) return [{ baseDir: root, undecided: abs }];
      if (!e.dir && sameNumbers(e, target)) return [{ baseDir: root, rel: e.rel, linkedFrom: abs }];
    }
    return [];
  } catch {
    return [];
  }
}

// ── A file named by its numbers: `/.vol/<device>/<inode>` (macOS, r6.1) ──────
//
// macOS opens any file as `/.vol/<device>/<inode>`, and a file in a folder as
// `/.vol/<device>/<the folder's inode>/<name>`. Such a path has no `.planning`
// in it, `realpath` does not resolve it, and the file has one name — so none
// of the checks above sees it. The numbers are what there is to compare.

/**
 * Is `abs` under `/.vol`? By its first folder, read as the guard reads every
 * name (`foldName`). macOS itself opens only the lower-case spelling
 * (`/.VOL/…` is "no such file"), so reading the others as `/.vol` too can
 * only refuse a path that opens nothing.
 *
 * @param {string} abs — absolute
 * @returns {boolean}
 */
export function isVolPath(abs) {
  const parts = abs.split(sep);
  return parts[0] === '' && parts.length > 1 && foldName(parts[1]) === '.vol';
}

/**
 * The decision for a `/.vol` path, from numbers alone (no disk read).
 *
 * @param {{dev: bigint, ino: bigint}|null} target — the target's numbers; null when it is not there
 * @param {Array<{dev: bigint|null, ino: bigint|null, rest: string[]}>} above — each folder above the
 *   target, nearest first: its numbers (null when it does not resolve) and the path from it to the target
 * @param {Iterable<{rel?: string, dir?: boolean, dev?: bigint, ino?: bigint, incomplete?: boolean}>} entries —
 *   the project's guarded files and folders (`guardedEntries`)
 * @returns {{rel: string}|{unresolved: true}|{undecided: true}|null} the guarded path the target is;
 *   `unresolved` when neither it nor a folder above it resolves; `undecided` when the entries stopped
 *   short; null when it is not a guarded path
 */
export function volCandidate(target, above, entries) {
  if (target === null && above.every((a) => a.dev === null)) return { unresolved: true };
  for (const e of entries) {
    if (e.incomplete) return { undecided: true };
    if (!e.dir) {
      if (sameNumbers(e, target)) return { rel: e.rel };
      continue;
    }
    for (const a of above) {
      if (!sameNumbers(e, a)) continue;
      const rel = [e.rel, ...a.rest].join('/');
      if (isTargetRel(rel)) return { rel };
    }
  }
  return null;
}

/**
 * The decision by a FOLDER's numbers, from numbers alone (no disk read): the
 * guarded path a target has when a folder above it IS one of the project's
 * guarded folders, whatever the two paths look like as text (r6.3).
 *
 * @param {Array<{dev: bigint|null, ino: bigint|null, rest: string[]}>} above — each folder above the
 *   target, nearest first: its numbers (null when it does not resolve) and the path from it to the target
 * @param {Array<{rel: string, dev: bigint, ino: bigint}>} dirs — the project's guarded folders
 * @returns {{rel: string}|null}
 */
export function folderCandidate(above, dirs) {
  for (const a of above) {
    for (const d of dirs) {
      if (!sameNumbers(d, a)) continue;
      const rel = [d.rel, ...a.rest].join('/');
      if (isTargetRel(rel)) return { rel };
    }
  }
  return null;
}

// A target under one of the project's guarded folders, found by comparing the
// numbers of each folder above it with theirs. A symlinked `.planning` was
// compared by the text of its real path (`underRealFolder`), which a second
// spelling of the same path gets past: `/System/Volumes/Data/…` on a Mac, a
// bind mount anywhere. Asked of every target; a few `stat`s.
function underGuardedFolder(abs, root) {
  const dirs = [];
  for (const rel of GUARDED_DIRS) {
    const n = numbersOf(join(root, ...rel.split('/')));
    if (n !== null) dirs.push({ rel, dev: n.dev, ino: n.ino });
  }
  if (dirs.length === 0) return [];
  const above = [];
  const rest = [basename(abs)];
  for (let cur = dirname(abs); ; cur = dirname(cur)) {
    const n = numbersOf(cur);
    above.push({ dev: n?.dev ?? null, ino: n?.ino ?? null, rest: [...rest] });
    if (dirname(cur) === cur) break;
    rest.unshift(basename(cur));
  }
  const found = folderCandidate(above, dirs);
  return found === null ? [] : [{ baseDir: root, rel: found.rel }];
}

function volTarget(abs, root) {
  if (!isVolPath(abs)) return [];
  const above = [];
  const rest = [basename(abs)];
  // Up to `/.vol/<device>/<inode>`: above that there is no file to name.
  for (let cur = dirname(abs); cur.split(sep).length > 3; cur = dirname(cur)) {
    const n = numbersOf(cur);
    above.push({ dev: n?.dev ?? null, ino: n?.ino ?? null, rest: [...rest] });
    rest.unshift(basename(cur));
  }
  const found = volCandidate(numbersOf(abs), above, guardedEntries(root));
  if (found === null) return [];
  if (found.rel !== undefined) return [{ baseDir: root, rel: found.rel, numberedFrom: abs }];
  return [{ baseDir: root, ...(found.unresolved ? { unresolved: abs } : { undecided: abs }) }];
}

// The content a tool call would leave in `abs`, or null when it cannot be
// computed (an unreadable file, a malformed input) — the edit then fails in
// Claude Code anyway, and the guard allows. A `$` in a replacement is inserted
// literally, as Claude Code does (a function replacer; split/join for all).
function proposedContent(abs, tool, input) {
  if (tool === 'Write') return typeof input?.content === 'string' ? input.content : null;
  const edits = tool === 'Edit' ? [input] : tool === 'MultiEdit' ? input?.edits : null;
  if (!Array.isArray(edits)) return null;
  let text;
  try {
    text = readFileSync(abs, 'utf-8');
  } catch {
    return null;
  }
  for (const e of edits) {
    if (typeof e?.old_string !== 'string' || e.old_string === '' || typeof e.new_string !== 'string') return null;
    text = e.replace_all ? text.split(e.old_string).join(e.new_string) : text.replace(e.old_string, () => e.new_string);
  }
  return text;
}

// Would this WORK.md write change or remove `schema_version: 2` or the
// current `key`? Unknown → false.
async function changesVersionOrKey(abs, tool, input) {
  const next = proposedContent(abs, tool, input);
  if (next === null) return false;
  const { parseFrontmatter } = await import('./state.js');
  let key;
  try {
    key = parseFrontmatter(readFileSync(abs, 'utf-8')).data?.key;
  } catch {
    return false; // the current key cannot be read — allow
  }
  try {
    const data = parseFrontmatter(next).data;
    return data?.schema_version !== 2 || data?.key !== key;
  } catch {
    return true; // a frontmatter that no longer parses has lost its version and key
  }
}

/**
 * Should the hook block this write? Fail-open: any throw → allow.
 *
 * @param {{filePath: unknown, cwd: unknown, tool?: string, input?: object}} args — `tool` and
 *   `input` (the event's `tool_name` and `tool_input`) decide a WORK.md edit; without them a
 *   WORK.md edit is allowed
 * @returns {Promise<{block: boolean, reason?: string}>}
 */
export async function checkWorkWrite({ filePath, cwd, tool, input }) {
  try {
    if (typeof filePath !== 'string' || filePath === '') return { block: false };
    const base = typeof cwd === 'string' && isAbsolute(cwd) ? cwd : process.cwd();
    const abs = resolve(base, filePath);
    // No file can be opened by a path this long, so there is no edit to judge.
    if (pathCannotExist(abs)) return { block: false };
    const { candidates } = protectedTarget(abs);
    // And the routes the path does not show: the real path of a symlinked
    // folder, a second name for a guarded file, and a file named by number.
    const real = realpathLoose(abs);
    for (const root of storeRoots(base, dirname(abs))) {
      candidates.push(
        ...underRealFolder(real, root), ...underGuardedFolder(abs, root), ...hardLinkTo(abs, root),
        // The resolved path too: behind a link into a folder BELOW a guarded
        // one, the written path has no guarded folder above it.
        ...(real === abs ? [] : underGuardedFolder(real, root)),
        ...volTarget(abs, root), ...(real === abs ? [] : volTarget(real, root)),
      );
    }
    for (const { baseDir, rel, linkedFrom, numberedFrom, unresolved, undecided } of candidates) {
      // A stat before the import: a project with `.planning` and no store —
      // every project but Signal's — never loads the store library.
      if (!existsSync(join(baseDir, '.planning', 'work', 'WORK.md'))) continue;
      try {
        const { storeVersion } = await import('./work-records.js');
        if (storeVersion(baseDir) !== 2) continue;
        if (unresolved) return { block: true, reason: UNRESOLVED_MESSAGE(unresolved) };
        if (undecided) return { block: true, reason: UNDECIDED_MESSAGE(undecided) };
        const note = linkedFrom ? LINK_NOTE(linkedFrom, rel) : numberedFrom ? NUMBERS_NOTE(numberedFrom, rel) : '';
        if (!isWorkMd(rel)) return { block: true, reason: note + BLOCK_MESSAGE(rel) };
        if (await changesVersionOrKey(abs, tool, input)) return { block: true, reason: WORK_MD_MESSAGE(rel) };
      } catch {
        // A broken or unknown WORK.md — allow.
      }
    }
    return { block: false };
  } catch {
    return { block: false };
  }
}
