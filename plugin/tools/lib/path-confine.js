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
import { realpathSync } from 'node:fs';

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
