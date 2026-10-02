// tools/lib/path-confine.js — symlink-aware `.planning/` write-path confinement
// (M5.E4.T1.2, B14 / FR2 security).
//
// The lexical `resolve(dest).startsWith(planningRoot + sep)` guard normalizes
// `..` but does NOT follow symlinks, so a checked-in DIRECTORY symlink inside
// `.planning/` (git tracks symlinks, mode 120000) escapes the tree on a
// write/move. This module is the proven realpath re-assert extracted from
// `migrate-memory.js` (M5.E2 REVIEW, commit `ab2242d`) so every `.planning/`
// write gateway shares one copy. The two pre-existing in-line copies
// (`migrate-memory.js`, `archive-tree.js`) are left untouched.

import { resolve, sep, dirname } from 'node:path';
import { realpathSync, readFileSync, lstatSync } from 'node:fs';

import { PLANNING_DIR } from './state.js';

// realpath the deepest EXISTING component of `p` (the full path may not exist yet
// — we're about to create it). Walk up until realpathSync resolves; at the fs root
// it must resolve, else propagate. Cross-platform: realpathSync throws ENOENT on a
// missing path, so the walk is the portable "nearest existing ancestor" primitive.
export function realpathNearestExisting(p) {
  let cur = resolve(p);
  for (;;) {
    try {
      return realpathSync(cur);
    } catch (e) {
      const parent = dirname(cur);
      if (parent === cur) throw e; // reached fs root; nothing resolved — propagate
      cur = parent;
    }
  }
}

// Symlink-aware confinement (REVIEW security MEDIUM) — additive to the lexical
// startsWith guards. Two real-containment checks, realpath'ing BOTH sides so a
// legit symlink on the base path (e.g. macOS /var → /private/var) never
// false-refuses:
//   (1) .planning/ itself must not be a symlink escaping the repo;
//   (2) the dest DIRECTORY's nearest existing ancestor must resolve inside real
//       .planning/ — catches a directory symlink under .planning/ (e.g. archive).
// Anchored on dirname(destAbs), NEVER the leaf: the escape vector is always a
// directory component, and atomicWrite renames over the leaf (never follows a leaf
// symlink), so resolving the leaf would wrongly refuse the leaf-file-symlink case
// that is already safe.
export function assertRealInsidePlanning(baseDir, destAbs, label) {
  const planningRoot = resolve(baseDir, PLANNING_DIR);
  const realBase = realpathSync(baseDir);
  const realRoot = realpathSync(planningRoot); // .planning/ exists on a real apply
  if (realRoot !== realBase && !realRoot.startsWith(realBase + sep)) {
    throw new Error(
      `${label}: ${PLANNING_DIR}/ resolves outside the repo (real ${realRoot}) — refusing a symlinked planning root.`
    );
  }
  const realDir = realpathNearestExisting(dirname(destAbs));
  if (realDir !== realRoot && !realDir.startsWith(realRoot + sep)) {
    throw new Error(
      `${label}: dest ${destAbs} escapes ${PLANNING_DIR}/ via a directory symlink (real dir ${realDir}).`
    );
  }
}

/**
 * Read `rel` under `baseDir` only if its REAL path stays inside the project
 * (M6.E3 REVIEW). A cloned repository can ship `.planning/STATE.md` as a
 * symlink to `~/.aws/credentials`; a check that sends file text to a model must
 * not follow it out. Throws with a plain reason; callers report it as
 * could-not-evaluate. Missing files throw as `readFileSync` does.
 */
export function readFileConfined(baseDir, rel) {
  const root = realpathSync(resolve(baseDir));
  const real = realpathSync(resolve(baseDir, rel));
  if (real !== root && !real.startsWith(root + sep)) {
    throw new Error(`${rel} resolves outside the project (a symlink?) — not read`);
  }
  return readFileSync(real, 'utf8');
}

/**
 * Read a planning file only if it is a REGULAR file, not a link, inside the project.
 *
 * `readFileConfined` stops a symlink from reaching OUTSIDE the project — but the
 * project root holds files git never ships and a user creates after cloning:
 * `.env`, `.git/config`. A cloned repository's `.planning/MILESTONE-9.md -> ../.env`
 * stays inside the root and passed (`M6.E12` REVIEW pass 2, reproduced with a
 * real secret). Planning documents have no legitimate reason to be links, so a
 * link is refused outright; a FIFO, device or directory is refused before any
 * read can hang on it (the same rule `citations.js` states).
 *
 * @param {string} baseDir
 * @param {string} rel — repo-root-relative
 * @returns {string} the file's content; throws with a reason on refusal
 */
export function readRegularFile(baseDir, rel) {
  const st = lstatSync(resolve(baseDir, rel));
  if (st.isSymbolicLink()) {
    throw new Error(`${rel} is a symbolic link — refused; planning files are read only as regular files`);
  }
  if (!st.isFile()) throw new Error(`${rel} is not a regular file — not read`);
  return readFileConfined(baseDir, rel);
}

/** The refusal `readRegularFile` would give for `rel`, or null when it would read it. */
export function regularFileRefusal(baseDir, rel) {
  try {
    const st = lstatSync(resolve(baseDir, rel));
    if (st.isSymbolicLink()) return `${rel} is a symbolic link — refused; planning files are read only as regular files`;
    if (!st.isFile()) return `${rel} is not a regular file — not read`;
    return null;
  } catch (err) {
    return err.code === 'ENOENT' ? null : `${rel} could not be inspected — ${err.code ?? err.message}`;
  }
}
