/**
 * Are ADHERENCE-LOG.md's commit anchors still reachable from this history?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHY IT CHECKS THE PROPERTY RATHER THAN THE MECHANISM.
 *
 * `.planning/ADHERENCE-LOG.md` pins a commit SHA beside every run record — that
 * pin IS the reproducibility claim, and `adherence-run.js` states the failure
 * mode in its own words: AC4.3 breaks when *"the record would name a state
 * nobody can return to."*
 *
 * The Epic lane therefore merges with `--merge`. Squash never lands the Epic's
 * commits on `main`; rebase rewrites them. Either orphans whatever the log pins.
 *
 * That rule has now failed TWICE, on consecutive Epic merges:
 *
 *   - `M6.E5` / PR #211, 2026-08-28. `gh pr merge 211 --merge --delete-branch`
 *     produced a single-parent commit and none of the Epic's 24 commits reached
 *     `main`. `ADHERENCE-LOG.md` was immediately left pinning `0e88e03`, a commit
 *     unreachable from `main`. Repaired by hand against `d0ac0c5`.
 *   - `M6.E6` / PR #236, 2026-09-04. Single-parent again; all six commits absent.
 *     No damage only because this Epic added no adherence record.
 *
 * Nothing forced either one: the repository allows all three methods
 * (`allow_merge_commit: true`) and the ruleset permits all three. Both times the
 * merge reported success and NO layer raised an error.
 *
 * So this check does not assert that a merge commit has two parents, and does not
 * try to police how the merge was performed. `BUGS.md` argued that the weaker
 * target is the better one to abandon, and it was right: **it checks the property
 * that actually matters — can you still get to the state the verdict names — and
 * it holds regardless of how the SHA came to be orphaned.** A future rebase, a
 * force-push, or a fourth mechanism nobody has thought of trips it the same way.
 *
 * FAIL CLOSED ON THE PROPERTY, FAIL OPEN ON BLINDNESS (`B39`). A SHA that git
 * cannot resolve at all — a shallow clone, a not-yet-fetched object — is reported
 * as `unresolvable`, NOT as a failure: a detector that cannot look must say so
 * rather than accuse. A SHA that resolves and is NOT an ancestor is a failure,
 * because that is the detector looking and seeing the thing it exists to catch.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Commit anchors in an ADHERENCE-LOG.md body.
 *
 * Two shapes are pinned in practice and both are matched: the ceiling's inline
 * `**Commit:** \`sha\`` and each run record's `| Commit | \`sha\` |` table row.
 * Anchored on the `Commit` label rather than on "any hex-looking word", so a
 * SHA quoted in prose — an explanatory sentence naming an orphaned commit, of
 * which this log now contains several — is not mistaken for a live claim.
 *
 * @param {string} content
 * @returns {Array<{sha: string, line: number}>}
 */
export function parseAnchors(content) {
  if (typeof content !== 'string') return [];
  const out = [];
  const seen = new Set();
  const lines = content.split('\n');
  const patterns = [
    /\*\*Commit:\*\*\s*`([0-9a-f]{7,40})`/i,
    /^\|\s*Commit\s*\|\s*`([0-9a-f]{7,40})`\s*\|/i,
  ];
  lines.forEach((text, i) => {
    for (const re of patterns) {
      const m = text.match(re);
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        out.push({ sha: m[1], line: i + 1 });
      }
    }
  });
  return out;
}

/**
 * Classify every anchor as reachable, orphaned, or unresolvable.
 *
 * Pure and injectable — `resolve` and `isAncestor` are supplied by the caller —
 * so the policy is provable without a git repository, and the live check is the
 * same code with real git behind it.
 *
 * ⚠ Ancestry is tested against **HEAD, not `main`**, and that is deliberate. On a
 * feature branch the Epic's own commits are not on `main` yet, so a `main`-based
 * check would fail on every pull request that adds a run record — a false
 * positive on the normal path, which is how a check earns its way into being
 * ignored. HEAD contains `main`'s history plus the branch, so it is green on the
 * branch and red on `main` after a squash orphans the commits. Red where the
 * damage is, quiet where it is not.
 *
 * @param {Array<{sha: string, line: number}>} anchors
 * @param {{resolve: (sha: string) => boolean, isAncestor: (sha: string) => boolean}} git
 * @returns {{reachable: Array, orphaned: Array, unresolvable: Array, checked: number}}
 */
export function checkAnchorReachability(anchors, { resolve, isAncestor } = {}) {
  const reachable = [];
  const orphaned = [];
  const unresolvable = [];
  for (const a of anchors ?? []) {
    if (!resolve(a.sha)) unresolvable.push(a);
    else if (isAncestor(a.sha)) reachable.push(a);
    else orphaned.push(a);
  }
  return { reachable, orphaned, unresolvable, checked: (anchors ?? []).length };
}

/**
 * The failure message, written where the rule is rather than at the call site,
 * so the test and any future caller cannot describe the same breakage two ways.
 *
 * @param {{orphaned: Array<{sha: string, line: number}>}} result
 * @returns {string}
 */
export function formatOrphanedAnchors({ orphaned }) {
  const rows = orphaned.map((a) => `  · \`${a.sha}\` — ADHERENCE-LOG.md:${a.line}`).join('\n');
  return (
    `${orphaned.length} adherence anchor(s) name a commit that is NOT reachable from HEAD:\n` +
    `${rows}\n\n` +
    `A published verdict now points at a state nobody can return to (AC4.3).\n` +
    `The usual cause is an Epic-lane merge that squashed or rebased instead of\n` +
    `merging — it has happened twice (PR #211, PR #236) and reported success both\n` +
    `times. Repair by re-pinning each record to the commit that actually carries\n` +
    `the measured state on this branch, exactly as M6.E5's was re-pinned to d0ac0c5.`
  );
}
