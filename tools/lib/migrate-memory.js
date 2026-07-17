// tools/lib/migrate-memory.js — the /sig:migrate-memory command engine (M5.E2, FR6/FR7).
//
// Auto-sensing doc-runtime migrate: reorganizes the INVOKING project's
// `.planning/` docs to the FR1 model (de-prose frontmatter, relocate bloated
// bodies, evict closed-Epic narrative, build the archive tree). The three
// non-negotiables (NFR safety-first):
//   - dry-run by DEFAULT (FR6.1) — --apply is required to write;
//   - relocate-never-delete (FR6.3) — the removed content lands in its new home
//     BEFORE the source is shortened, verified by the faithfulness gate;
//   - git-reversible (FR6.2) — apply leaves changes staged-not-committed in the
//     invoking repo, with a pre-migrate tag + the exact revert line printed.
//
// This is the S1.t1 SHELL: arg parse + the orchestration entry + a no-op sense
// stub. The engine grows across the slice — the faithfulness gate (S1.t3), the
// vector de-prose/relocate mechanics (S1.t4/t5), the auto-sense brain (S1.t6),
// the safety harness (S1.t7), and the stamp+idempotency (S1.t8). Until then both
// modes are write-free (the dry-run write-nothing invariant is the load-bearing
// AC and must hold from the first commit).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PLANNING_DIR, withStateLock } from './state.js';
import { atomicWrite } from './atomic-write.js';

/**
 * Parse the command flags. Dry-run is the default (FR6.1) — writing requires an
 * explicit `--apply`; `--force` lets apply proceed on a dirty working tree
 * (consumed by the S1.t7 safety harness). Fail-open: non-array / unknown input
 * degrades to a dry-run (the safe default), never throws.
 *
 * @param {string[]} argv
 * @returns {{apply: boolean, force: boolean}}
 */
export function parseMigrateArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : [];
  return {
    apply: args.includes('--apply'),
    force: args.includes('--force'),
  };
}

// --- docs_layout_version stamp (FR7.1) — raw-line splice, never a serializer ---
//
// The stamp is its OWN axis (distinct from schema_version and the plugin's
// release SemVer). It is written by a RAW-LINE splice, never a stringifyYaml
// round-trip (cross-cutting §1): a full re-serialize reformats/reorders the whole
// block (drops comments, normalizes spacing, re-quotes) — a churny, potentially
// lossy rewrite of a stranger's STATE.md for a one-line change.
//
// LOCK BOUNDARY (advisor / §9): `spliceDocsLayoutVersion` is a PURE, lock-free,
// no-I/O core; the self-locking `setDocsLayoutVersion` wrapper is for STANDALONE
// use only. The migrate harness (S1.t7/t8) holds the coarse `.state.lock` ONCE
// and calls the pure core directly — a nested `withStateLock` under the coarse
// lock would throw ("another state write is running", <5s) or stale-unlink the
// coarse lock after its 5s TTL (the exact §9 hazard `evictEpicNarrative` has).

// Capture the frontmatter fences so the block can be reconstructed byte-for-byte.
const FRONTMATTER_SPLICE_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)([\s\S]*)$/;
const DOCS_LAYOUT_KEY = 'docs_layout_version';

/**
 * Return `text` with `docs_layout_version: n` set in the STATE.md frontmatter —
 * REPLACING the value in place if the key is present, else INSERTING a line
 * right after `schema_version:` (or at the top of the block if that's absent).
 * Pure + lock-free + CRLF-tolerant. Every OTHER frontmatter line and the whole
 * body stay byte-identical. Returns `text` unchanged when there is no
 * frontmatter (no fabrication — the harness gates conformance separately).
 *
 * @param {string} text  full STATE.md content (frontmatter + body)
 * @param {number} n      the layout version (integer axis, FR7.1)
 * @returns {string}
 */
export function spliceDocsLayoutVersion(text, n) {
  if (!Number.isInteger(n)) {
    throw new Error(
      `spliceDocsLayoutVersion: n must be an integer, got ${JSON.stringify(n)}.`
    );
  }
  const m = String(text).match(FRONTMATTER_SPLICE_RE);
  if (!m) return text; // no frontmatter — nothing to stamp
  const [, open, block, close, body] = m;
  const nl = open.includes('\r\n') ? '\r\n' : '\n';
  const lines = block.split(/\r?\n/);
  const newLine = `${DOCS_LAYOUT_KEY}: ${n}`;

  const existingIdx = lines.findIndex((l) => new RegExp(`^${DOCS_LAYOUT_KEY}:`).test(l));
  if (existingIdx !== -1) {
    lines[existingIdx] = newLine; // replace in place — position preserved
  } else {
    // Insert right after schema_version: (group the two version axes); fall back
    // to the top of the block when there's no schema_version line.
    const schemaIdx = lines.findIndex((l) => /^schema_version:/.test(l));
    const at = schemaIdx === -1 ? 0 : schemaIdx + 1;
    lines.splice(at, 0, newLine);
  }
  return `${open}${lines.join(nl)}${close}${body}`;
}

/**
 * Self-locking convenience wrapper for STANDALONE stamping: acquire the coarse
 * STATE lock, splice, compare-before-write. NEVER call this from inside the
 * migrate harness's coarse-locked apply (it would re-enter the non-reentrant
 * lock — use the pure `spliceDocsLayoutVersion` core there).
 *
 * @param {string} baseDir
 * @param {number} n
 */
export async function setDocsLayoutVersion(baseDir, n) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  return withStateLock(baseDir, async () => {
    const raw = await readFile(statePath, 'utf-8');
    const next = spliceDocsLayoutVersion(raw, n);
    if (next !== raw) {
      await atomicWrite(statePath, next); // compare-before-write → idempotent no-op
    }
  });
}

/**
 * Sense a project's `.planning/` layout → a migration plan (data, mutates
 * nothing). Skeleton stub (S1.t1): returns an empty no-op plan. The real
 * stamp-first → structural-sniff → per-vector plan-data auto-sense lands in
 * S1.t6 (single-STATE) and S2.t5 (full-corpus).
 *
 * @param {string} baseDir
 * @returns {Promise<{vectors: string[], flags: string[], moves: object[]}>}
 */
export async function senseProject(baseDir) {
  return { vectors: [], flags: [], moves: [] };
}

/**
 * Orchestrate a migrate run. Dry-run (default) senses the project and returns a
 * plan WITHOUT touching disk; `--apply` performs the (staged, reversible) moves.
 * `sense` is injectable so the auto-sense brain can be swapped/tested
 * independently of the orchestration.
 *
 * Skeleton (S1.t1): with the no-op sense there are no moves, so BOTH modes are
 * write-free — the apply path grows in S1.t7. `runMigrate(baseDir)` with no opts
 * is a dry-run that touches nothing.
 *
 * @param {string} baseDir
 * @param {{apply?: boolean, force?: boolean, sense?: (baseDir: string) => Promise<object>}} [opts]
 * @returns {Promise<{applied: boolean, dryRun: boolean, plan: object, changed?: string[]}>}
 */
export async function runMigrate(baseDir, opts = {}) {
  const apply = opts.apply ?? false;
  const sense = opts.sense ?? senseProject;
  const plan = await sense(baseDir);

  if (!apply) {
    return { applied: false, dryRun: true, plan };
  }
  // Apply path — the staged, reversible, gate-guarded move engine lands in
  // S1.t7. The skeleton has no moves, so this writes nothing yet.
  return { applied: true, dryRun: false, plan, changed: [] };
}
