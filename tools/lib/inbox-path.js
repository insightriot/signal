// Back-compat inbox/ledger path resolver (M5.E3.S1.t1 / FR1).
//
// The capture inbox is being renamed `FUTURE-IDEAS.md` → `ISSUES-INBOX.md` (and
// its archive ledger `FUTURE-IDEAS-LEDGER.md` → `ISSUES-INBOX-LEDGER.md`). The
// rename is NON-BREAKING and migrate-timing-independent: `/sig:add`, the drain,
// and the eviction all route their path through this resolver, so a not-yet-
// migrated repo (still on the legacy names) and a born-on-v3 repo (new names)
// both work with no branching at the call sites. The physical file move is the
// FR6 migrate's job (a later slice), NOT anything here.
//
// Cross-cutting decision R1: when BOTH names exist, ISSUES-INBOX wins — the new
// name is authoritative once present. When neither exists, resolve to the new
// name so a fresh capture lazy-creates the v3 file.

import { existsSync } from 'node:fs';
import { join } from 'node:path';

// The four canonical inbox/ledger names (repo-root-relative POSIX). Exported so
// the FR6 migrate's fixed rename moveMap (`senseV3Rename`, archive-tree.js) shares
// ONE source of truth for the names rather than re-hardcoding them.
export const INBOX_NEW = '.planning/ISSUES-INBOX.md';
export const INBOX_LEGACY = '.planning/FUTURE-IDEAS.md';
export const LEDGER_NEW = '.planning/archive/ISSUES-INBOX-LEDGER.md';
export const LEDGER_LEGACY = '.planning/archive/FUTURE-IDEAS-LEDGER.md';

/**
 * Resolve the capture-inbox path (relative to `baseDir`), preferring the new
 * name. Precedence (R1): `ISSUES-INBOX.md` if present, else `FUTURE-IDEAS.md`
 * if present, else the new `ISSUES-INBOX.md` (the lazy-create default).
 *
 * @param {string} baseDir — project root (where `.planning/` lives)
 * @returns {string} the resolved inbox path, relative to `baseDir`
 */
export function resolveInboxPath(baseDir) {
  if (existsSync(join(baseDir, INBOX_NEW))) return INBOX_NEW;
  if (existsSync(join(baseDir, INBOX_LEGACY))) return INBOX_LEGACY;
  return INBOX_NEW;
}

/**
 * Resolve the archive-ledger path (relative to `baseDir`). Existence-first, same
 * precedence as the inbox: `ISSUES-INBOX-LEDGER.md` if present, else
 * `FUTURE-IDEAS-LEDGER.md` if present. When NEITHER ledger exists yet, pair with
 * the inbox we'd resolve — a legacy-inbox repo that has never evicted gets the
 * legacy ledger name (keeping the pair consistent until the FR6 migrate renames
 * both), everything else gets the new name.
 *
 * @param {string} baseDir — project root (where `.planning/` lives)
 * @returns {string} the resolved ledger path, relative to `baseDir`
 */
export function resolveLedgerPath(baseDir) {
  if (existsSync(join(baseDir, LEDGER_NEW))) return LEDGER_NEW;
  if (existsSync(join(baseDir, LEDGER_LEGACY))) return LEDGER_LEGACY;
  // Neither ledger exists: pair with the inbox so the names stay consistent.
  return resolveInboxPath(baseDir) === INBOX_LEGACY ? LEDGER_LEGACY : LEDGER_NEW;
}
