#!/usr/bin/env node
// SessionStart layout-drift nudge (M5.E2.S3.t1, FR7.2). A Node hook — NOT bash,
// so it runs identically on Windows. Modeled on warn-dirty-execute.js (SessionStart
// additionalContext contract) + check-state-write.js (fail-open discipline).
//
// It nudges a project whose `.planning/` predates the current docs layout to run
// `/sig:migrate-memory`. It reads ONLY a CAPPED PREFIX of STATE.md (the frontmatter
// region) to sniff the `docs_layout_version` stamp — never the whole file. On a
// 529 KB STATE.md that returns well under any time budget (FM8), because the stamp
// lives at the top of the frontmatter (migrate-memory inserts it right after
// `schema_version:`), so a small prefix always carries it.
//
//   - pre-reorg  (stamp absent OR < CURRENT) → one-line banner in additionalContext;
//   - post-reorg (stamp == CURRENT)          → silent, exit 0;
//   - absent / malformed / oversized / non-.planning cwd / unreadable / parse error
//     → exit 0, no banner, no crash. FAIL-OPEN IS THE CARDINAL RULE: a SessionStart
//     hook that throws would break every session in every installed repo.
//
// "Malformed" is fence-based (matching check-state-write's definition): no valid
// `---\n…\n` opening fence → not a recognizable Signal STATE.md → silent. A file
// WITH an opening fence but no stamp is a real pre-reorg STATE.md → banner. The
// stamp read is regex-only (never parses YAML), so a syntactically-broken value
// can never throw here — the guard is structural, not a try/catch afterthought.

import { existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAYOUT_VERSION,
  STAMP_SCAN_BYTES,
  readCappedPrefix,
  readLayoutStampFromPrefix,
} from '../tools/lib/layout-stamp.js';

// The cheap stamp primitives (readCappedPrefix / readLayoutStampFromPrefix /
// STAMP_SCAN_BYTES / the LAYOUT_VERSION constant) now live in the dependency-light
// tools/lib/layout-stamp.js, SHARED with the /sig:status // /sig:resume command path
// (M5.E2 REVIEW). layout-stamp.js imports ONLY node:fs, so importing it here keeps
// this hook's fail-open-at-import safety intact — no heavy migrate-memory graph is
// pulled at session start. Re-exported below so the hook's public surface (and its
// existing unit test) is unchanged.
//
// HOOK_LAYOUT_VERSION mirrors the engine's CURRENT_LAYOUT_VERSION. The constant is
// deliberately NOT imported from migrate-memory.js: a top-level import of that module
// would evaluate its whole graph (child_process/crypto + 6 Signal modules) on every
// session start, and an import-time throw escapes the fail-open guard (it fires before
// main() can exit 0) — the exact "crash every session" hazard this hook must avoid.
// Non-disagreement is enforced by a test instead: tests/migrate-layout-hook.test.js
// asserts HOOK_LAYOUT_VERSION === CURRENT_LAYOUT_VERSION.
export const HOOK_LAYOUT_VERSION = LAYOUT_VERSION;
export { STAMP_SCAN_BYTES, readCappedPrefix, readLayoutStampFromPrefix };

export const LAYOUT_DRIFT_BANNER =
  "Signal: this project's `.planning/` predates the current docs layout — run " +
  '`/sig:migrate-memory` (dry-run first, then `--apply`) to reorganize it to the ' +
  'current model. This is advisory; nothing is blocked.';

/**
 * Decide layout drift from a capped prefix. A recognizable Signal STATE.md opens
 * with a `---\n` fence; without one we stay silent (malformed/legacy — the safe,
 * fail-open direction). With a fence, absent-or-old stamp ⇒ pre-reorg.
 *
 * @param {string} prefix
 * @returns {{preReorg: boolean, hasFrontmatter: boolean, stamp: number|null}}
 */
export function decideLayoutDrift(prefix) {
  const s = String(prefix ?? '');
  const hasFrontmatter = /^---\r?\n/.test(s);
  if (!hasFrontmatter) return { preReorg: false, hasFrontmatter: false, stamp: null };
  const stamp = readLayoutStampFromPrefix(s);
  const preReorg = stamp === null || stamp < HOOK_LAYOUT_VERSION;
  return { preReorg, hasFrontmatter: true, stamp };
}

/**
 * Disk-aware sense: read the capped STATE.md prefix under `baseDir/.planning/` and
 * decide drift. Fail-open — absent file, unreadable file, oversized read, ANY error
 * degrades to `{ preReorg: false }` (silent).
 *
 * @param {string} baseDir
 * @returns {{preReorg: boolean, hasFrontmatter: boolean, stamp: number|null}}
 */
export function senseLayoutDrift(baseDir) {
  try {
    const statePath = resolve(baseDir, '.planning', 'STATE.md');
    if (!existsSync(statePath)) return { preReorg: false, hasFrontmatter: false, stamp: null };
    const prefix = readCappedPrefix(statePath);
    return decideLayoutDrift(prefix);
  } catch {
    return { preReorg: false, hasFrontmatter: false, stamp: null };
  }
}

function main() {
  try {
    const { preReorg } = senseLayoutDrift(process.cwd());
    if (preReorg) {
      // SessionStart output: JSON with additionalContext so Claude Code surfaces
      // the nudge in the next message context (same channel as warn-dirty-execute).
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: LAYOUT_DRIFT_BANNER,
          },
        }) + '\n'
      );
    }
  } catch {
    // Cardinal rule: never crash a session start. Any escape → silent exit 0.
  }
  process.exit(0);
}

// Run only when invoked directly (`node hooks/warn-layout-drift.js`), never when
// imported by the test suite. realpath-compare so a `..`-laden argv or a symlink
// still matches (or, on any error, degrades to "not main" — the safe direction).
let isDirect = false;
try {
  isDirect =
    Array.isArray(process.argv) &&
    !!process.argv[1] &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  isDirect = false;
}
if (isDirect) main();
