// tools/lib/layout-stamp.js — the cheap `docs_layout_version` stamp primitives
// (M5.E2 REVIEW). Promoted OUT of hooks/warn-layout-drift.js so BOTH the SessionStart
// hook AND the /sig:status // /sig:resume command path can read the stamp cheaply
// without either one reaching into hooks/ (a smell) or pulling the heavy migrate
// engine graph.
//
// DEPENDENCY-LIGHT BY CONTRACT: this module imports ONLY node:fs. It MUST NOT import
// migrate-memory.js (or anything that transitively does) — the SessionStart hook
// imports these primitives at session start, and an import-time throw from the heavy
// graph would escape the hook's fail-open guard (it fires before main() can exit 0),
// the exact "crash every session" hazard the hook exists to avoid. The engine's
// CURRENT_LAYOUT_VERSION is deliberately NOT imported; a test
// (tests/migrate-layout-hook.test.js + tests/migrate-layout-banner.test.js) asserts
// LAYOUT_VERSION === CURRENT_LAYOUT_VERSION so the two can never silently disagree.

import { openSync, readSync, closeSync } from 'node:fs';

// The current doc-runtime layout version, mirrored from the engine's
// CURRENT_LAYOUT_VERSION (tools/lib/migrate-memory.js). Kept in sync by an assertion
// test, NOT an import (see the module header). Re-exported by the hook as
// HOOK_LAYOUT_VERSION for backward-compatibility. Bumped 2→3 with the engine
// constant by M5.E3.S6a.t4 (the arming step).
export const LAYOUT_VERSION = 3;

// Capped-prefix read budget (FM8). The stamp sits right after `schema_version:` at
// the very top of the frontmatter, so 64 KB is orders of magnitude past where the
// stamp can be, yet a tiny fraction of a bloated STATE.md (nextpass's is 529 KB).
// NOTE: this is NOT FRONTMATTER_SCAN_CEILING (retrospective.js, 1 MB) — that is a
// post-read length bail, not a read cap; reusing 1 MB here would read the whole
// 529 KB body and violate FM8's "never the whole body".
export const STAMP_SCAN_BYTES = 64 * 1024;

/**
 * Read at most `cap` bytes from the START of `path`, decoded UTF-8. Uses a fixed
 * buffer + positional readSync — it NEVER reads the whole file (FM8). A truncated
 * multibyte char at the cap boundary is harmless: the stamp lives at the top.
 *
 * @param {string} path
 * @param {number} [cap=STAMP_SCAN_BYTES]
 * @returns {string}
 */
export function readCappedPrefix(path, cap = STAMP_SCAN_BYTES) {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(cap);
    const bytesRead = readSync(fd, buf, 0, cap, 0);
    return buf.subarray(0, bytesRead).toString('utf-8');
  } finally {
    closeSync(fd);
  }
}

/**
 * Regex-scan a capped STATE.md prefix for the `docs_layout_version` stamp. Bounds
 * the scan to the frontmatter (up to the closing `---` fence when present in the
 * prefix; the whole prefix otherwise, for a frontmatter larger than the cap).
 * NEVER parses YAML → never throws, whatever garbage the frontmatter holds.
 * Returns the integer stamp, or null when absent / non-numeric. CRLF-tolerant.
 *
 * @param {string} prefix
 * @returns {number|null}
 */
export function readLayoutStampFromPrefix(prefix) {
  const s = String(prefix ?? '');
  const open = s.match(/^---\r?\n/);
  const afterOpen = open ? s.slice(open[0].length) : s;
  const close = afterOpen.match(/\r?\n---\r?\n?/);
  const region = close ? afterOpen.slice(0, close.index) : afterOpen;
  const line = region.split(/\r?\n/).find((l) => /^docs_layout_version:/.test(l));
  const m = line && line.match(/^docs_layout_version:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}
