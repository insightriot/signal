// The cheap questions the edit hook asks of every path before it decides to
// load the guard (`plugin/hooks/check-state-write.js`, M6.E16 r6.1), and the
// resolver the guard and the hook share (r6.7). A leaf: `node:fs` and
// `node:path` only, so the hook pays nothing to import it.

import { existsSync, lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

/**
 * How many links a path is followed through by hand: at least as far as the
 * system follows (32 on macOS, 40 on Linux). A chain the system would
 * follow is then always followed to its end, and one longer is a write the
 * system refuses anyway (`ELOOP`).
 */
export const LINK_HOPS_MAX = 40;

/**
 * The two readings of the path a tool is given (r6.9), from the same cwd for
 * the hook and the guard:
 *
 *   - `abs` — normalised as TEXT (`resolve(cwd, target)`). This is the file
 *     Claude Code writes: it normalises `file_path` before writing (checked
 *     against Claude Code 2.1.299), so `src/y/../lnk/M.json` is written to
 *     `src/lnk/M.json` whatever `src/y` is.
 *   - `written` — joined as text with no `..` collapsed: what a raw write of
 *     the same string would hit, the system following `src/y` before the
 *     `..`. r6.8 judged only this one, on the premise that it is where
 *     Claude Code writes; it is not, and `y/../lnk` was allowed.
 *
 * Both are judged, and a write is refused when either is guarded: the first
 * is the write that happens, the second is the safe direction.
 *
 * @param {string} cwd
 * @param {string} target
 * @returns {{abs: string, written: string}}
 */
export function pathReadings(cwd, target) {
  const base = resolve(cwd);
  const written = isAbsolute(target) ? target : `${base.endsWith(sep) ? base : `${base}${sep}`}${target}`;
  return { abs: resolve(base, target), written };
}

/**
 * Where a write to `abs` would land (M6.E16 r6.7: the one resolver the edit
 * hook and the guard share). The real path of `abs`, or of its nearest
 * existing folder with the rest appended — the file may not exist yet — and
 * a link whose target is not there is read and followed, since a write goes
 * through it and creates the target (r6.5). Null when the links run past
 * `LINK_HOPS_MAX`, or round in a loop: where it would land is not known.
 *
 * @param {string} abs — absolute
 * @returns {string|null}
 */
export function realpathLoose(abs) {
  const rest = [];
  let cur = abs;
  let hops = 0;
  const seen = new Set(); // a loop ends at its second visit, not after 40 hops
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
        if (hops > LINK_HOPS_MAX || seen.has(cur)) return null;
        seen.add(cur);
        // Joined as text, NOT normalised (r6.8): a `..` in the target comes
        // after whatever folder link is before it, and the system follows
        // that link first. `resolve` collapsed `x/../..` by text and judged
        // a different folder than the one the write landed in.
        cur = isAbsolute(target) ? target : `${dirname(cur)}${sep}${target}`;
        continue;
      }
      // Up one folder, and keep the name. `dirname` and `basename` cut text
      // and do not collapse `..`; `join` below does collapse a `..` in the
      // part kept, which is under a folder that is not there. That is the
      // reading Claude Code writes by (it normalises `file_path` as text,
      // r6.9); a raw write through a missing folder fails (ENOENT).
      const parent = dirname(cur);
      if (parent === cur) return abs;
      rest.unshift(basename(cur));
      cur = parent;
    }
  }
}

/**
 * Is `abs` itself a symbolic link? False when it is not there.
 *
 * @param {string} abs
 * @returns {boolean}
 */
export function isLink(abs) {
  try {
    return lstatSync(abs).isSymbolicLink();
  } catch {
    return false;
  }
}

/** The longest path a file can be opened by, in bytes (Linux; macOS allows 1024). */
export const PATH_BYTES_MAX = 4096;

/**
 * Is `abs` longer than any path a file can be opened by? The system refuses
 * to open one (`ENAMETOOLONG`), so the edit it names cannot happen and there
 * is nothing to guard — and nothing is gained by walking its folders, which
 * for 16,000 of them took three seconds.
 *
 * @param {string} abs
 * @returns {boolean}
 */
export const pathCannotExist = (abs) => Buffer.byteLength(abs) > PATH_BYTES_MAX;

/**
 * Is `dir`, or a folder above it, a project with a work store? One
 * `existsSync` for each folder up to the top.
 *
 * @param {string} dir — absolute
 * @returns {boolean}
 */
export function storeAbove(dir) {
  for (let cur = dir; ; cur = dirname(cur)) {
    if (existsSync(join(cur, '.planning', 'work', 'WORK.md'))) return true;
    if (dirname(cur) === cur) return false;
  }
}
