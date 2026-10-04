// The PreToolUse guard against hand edits of a v2 work store (M6.E13/t5.1,
// AC5.1). Called from hooks/check-state-write.js, which loads this module only
// after a cheap string test finds `.planning` in the resolved path.
//
// On a v2 store the records, the views and the history files are written by
// code (`/sig:item` → work-records.js → work-views.js). A hand edit to one of
// them is either overwritten at the next regeneration or, for a record, an
// edit the event log never saw. Bodies (`items/**/*.md`) stay editable.
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
// alias pointing at `.planning`.

import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

const VIEWS = new Set(['bugs.md', 'backlog.md', 'issues-inbox.md', 'open-questions.md']);

export const BLOCK_MESSAGE = (rel) =>
  `${rel} is part of this project's v2 work store `
  + '(.planning/work/WORK.md has `schema_version: 2`), so a hand edit would be lost or bypass the record. '
  + 'Records (.planning/work/items/**/*.json) are written only through /sig:item; the views and history '
  + 'files are generated from the records and regenerate after every change. '
  + 'For prose, edit the item\'s body file (.planning/work/items/NN/KEY-n.md), which is not blocked.';

// Is `segs` (lower-cased, after `.planning/`) a protected target?
function isTarget(segs) {
  if (segs.length === 1) return VIEWS.has(segs[0]);
  if (segs[0] !== 'work') return false;
  if (segs.length === 2) return segs[1] === 'epics.md';
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

/**
 * Should the hook block this write? Fail-open: any throw → allow.
 *
 * @param {{filePath: unknown, cwd: unknown}} args
 * @returns {Promise<{block: boolean, reason?: string}>}
 */
export async function checkWorkWrite({ filePath, cwd }) {
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
        if (storeVersion(baseDir) === 2) return { block: true, reason: BLOCK_MESSAGE(rel) };
      } catch {
        // A broken or unknown WORK.md — allow.
      }
    }
    return { block: false };
  } catch {
    return { block: false };
  }
}
