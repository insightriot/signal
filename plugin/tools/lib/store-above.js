// Two cheap questions the edit hook asks of every path before it decides to
// load the guard (`plugin/hooks/check-state-write.js`, M6.E16 r6.1). A leaf:
// `node:fs` and `node:path` only, so the hook pays nothing to import it.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

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
