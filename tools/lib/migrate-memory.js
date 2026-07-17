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
