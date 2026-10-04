// The PreToolUse guard against hand edits of a v2 work store (M6.E13/t5.1,
// AC5.1). Called from hooks/check-state-write.js, which loads this module only
// after a cheap string test finds `.planning` in the resolved path.
//
// On a v2 store the records, the views and the history files are written by
// code (`/sig:item` → work-records.js → work-views.js). A hand edit to one of
// them is either overwritten at the next regeneration or, for a record, an
// edit the event log never saw. Bodies (`items/**/*.md`) stay editable.
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

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

const VIEWS = new Set(['bugs.md', 'backlog.md', 'issues-inbox.md', 'open-questions.md']);

export const BLOCK_MESSAGE = (rel) =>
  `${rel} is part of this project's v2 work store `
  + '(.planning/work/WORK.md has `schema_version: 2`), so a hand edit would be lost or bypass the record. '
  + 'Records (.planning/work/items/**/*.json) are written only through /sig:item; the views and history '
  + 'files are generated from the records and regenerate after every change. '
  + 'For prose, edit the item\'s body file (.planning/work/items/NN/KEY-n.md), which is not blocked.';

export const WORK_MD_MESSAGE = (rel) =>
  `${rel} switches this project's v2 work store on (\`schema_version: 2\`) and names its \`key\`, which `
  + 'prefixes every item ID. This edit would change or remove one of those lines: a changed version switches '
  + 'off this guard and the generated views, and a changed key orphans every record. Other text in the file '
  + 'may be edited. Items are changed with /sig:item; the store\'s version is changed only by the migration '
  + 'tool, `node tools/work-migrate-v2.mjs`.';

const isWorkMd = (rel) => rel.toLowerCase() === '.planning/work/work.md';

// Is `segs` (lower-cased, after `.planning/`) a protected target?
function isTarget(segs) {
  if (segs.length === 1) return VIEWS.has(segs[0]);
  if (segs[0] !== 'work') return false;
  if (segs.length === 2) return segs[1] === 'epics.md' || segs[1] === 'work.md';
  if (segs[1] === 'history') return segs.length === 3 && segs[2].endsWith('.md');
  if (segs[1] === 'items') return segs[segs.length - 1].endsWith('.json');
  return false;
}

// The nearest `.planning` segment of an absolute path, as {baseDir, rel}.
function classify(abs) {
  const parts = abs.split(sep);
  const lower = parts.map((p) => p.toLowerCase());
  const i = lower.lastIndexOf('.planning');
  if (i < 0) return null;
  const segs = lower.slice(i + 1);
  if (segs.length === 0 || !isTarget(segs)) return null;
  return {
    baseDir: parts.slice(0, i).join(sep) || sep,
    rel: ['.planning', ...parts.slice(i + 1)].join('/'),
  };
}

// realpath of a path that may not exist yet: the nearest existing ancestor,
// realpathed, with the rest appended.
function realpathLoose(abs) {
  const rest = [];
  let cur = abs;
  for (;;) {
    try {
      return join(realpathSync.native(cur), ...rest);
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return abs;
      rest.unshift(basename(cur));
      cur = parent;
    }
  }
}

/**
 * Classify an absolute path by its shape alone (no store read): the
 * `{baseDir, rel}` candidates that name a protected target.
 *
 * @param {string} abs — absolute, normalised
 * @returns {{blocked: boolean, candidates: Array<{baseDir: string, rel: string}>}}
 */
export function protectedTarget(abs) {
  const candidates = [];
  const seen = new Set();
  for (const p of [abs, realpathLoose(abs)]) {
    const c = classify(p);
    if (c && !seen.has(c.baseDir)) {
      seen.add(c.baseDir);
      candidates.push(c);
    }
  }
  return { blocked: candidates.length > 0, candidates };
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
    const { candidates } = protectedTarget(abs);
    for (const { baseDir, rel } of candidates) {
      // A stat before the import: a project with `.planning` and no store —
      // every project but Signal's — never loads the store library.
      if (!existsSync(join(baseDir, '.planning', 'work', 'WORK.md'))) continue;
      try {
        const { storeVersion } = await import('./work-records.js');
        if (storeVersion(baseDir) !== 2) continue;
        if (!isWorkMd(rel)) return { block: true, reason: BLOCK_MESSAGE(rel) };
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
