---
name: sig:migrate-memory
description: "Auto-sensing doc-runtime migrate — reorganizes THIS project's .planning/ docs to the FR1 model (de-prose frontmatter, relocate bloated bodies, evict closed-Epic narrative, build the archive tree). Relocate-never-delete, dry-run by default, git-reversible."
args: "[--apply] [--force]"
---

# `/sig:migrate-memory` — Auto-sensing doc-runtime migrate

You are running `/sig:migrate-memory`. Your goal: bring the **invoking** project's `.planning/` docs up to the current doc-runtime layout (`references/doc-runtime-model.md`) — safely, reversibly, and only after the user has eyeballed the plan.

This command is **meta** — same class as `/sig:status` and `/sig:resume`. It does **not** run a tier-gating preamble, does **not** load skills, and does **not** spawn agents. It operates on the **current working directory's** project (`process.cwd()`), never on Signal's own repo (except when Signal *is* the invoking project — the dogfood). There are **no hard-coded Signal paths**.

## The three non-negotiables (NFR safety-first)

1. **Dry-run by default (FR6.1).** With no args it prints the full plan — every move and rewrite, with before/after — and changes nothing. `--apply` is required to write.
2. **Relocate-never-delete (FR6.3).** No closed content is deleted. Every relocation lands the removed content in its new home **before** the source is shortened, and the faithfulness gate (`relocateFaithful`) hard-fails the apply if any content would be dropped. ⚠ The headline risk this command exists to prevent: the B8 hand-recipe *deleted* frontmatter prose ("body byte-identical" = ~80 lines dropped). Fine by hand; catastrophic unattended. The command **must relocate with the conservation gate**, never delete.
3. **Git-reversible (FR6.2).** `--apply` leaves changes **staged-but-uncommitted** (this runs in stranger repos — Signal never auto-commits someone else's work), prints the pre-apply tag `pre-migrate-memory-<ISO>` and the exact `git revert` / reset line, and refuses a dirty working tree without `--force`.

## The three bloat vectors (model §3), each RELOCATE-not-delete

- **Vector 1 — frontmatter-list prose** (the acute 529 KB `nextpass` case): de-prose = relocate the narrative out of the YAML list into the STATE body, leaving a short scalar.
- **Vector 2 — inlined legacy body**: relocate an already-migrated inlined body → `STATE-HISTORY.md` + a one-line pointer.
- **Vector 3 — closed-Epic narrative accretion**: apply evict-on-close retroactively to a project's backlog of already-closed Epics (card + pointer + archive tree).

## Faithfulness — proven by a human, not by green tests

Mechanical safety (move-never-delete, conservation) preserves the *bytes*. It does **not** prove the relocated card is a faithful *representation* (model §5 blind spot). So the confirm step shows the **actual before/after content** for every relocation, and the user approves each. **A passing test suite is NOT the faithfulness gate — the human dry-run diff is.**

## Workflow

Drive the command by calling into `tools/lib/migrate-memory.js` (import with `node --input-type=module`, or a short script). `baseDir = process.cwd()` — the **invoking** project.

1. **Parse args** — `parseMigrateArgs(process.argv.slice(2))` → `{apply, force}`. Dry-run is the default; `--apply` is required to write, `--force` to proceed on a dirty tree.
2. **Probe git state** — `probeGitState(baseDir, {force})`. If `proceed:false` (dirty tree, no `--force`), stop and print `reason`. Otherwise note `mode` (`git` | `fs-backup`) and surface every `warnings[]` entry to the user.
3. **Dry-run — sense + render + capture the TOCTOU token** — call `const dry = await runMigrate(baseDir, {apply:false})`. `dry.plan` is the per-project plan-data (mutates nothing); **`dry.inputHash` is the TOCTOU binding token — hold onto it for step 6.** Then print `await renderDryRun(baseDir)` — the three tiers (counts → mechanical moves → the faithfulness diff) plus the ambiguity flags, the "shouldn't touch" append-logs left alone, and the pre-existing dangling links (surfaced separately so pre-existing breakage isn't blamed on the migrate).
4. **Confirm** — the user reviews the **faithfulness diff** (Tier 3) and approves each relocation, or aborts. No approval → stop, having written nothing. **This human eyeball is the faithfulness gate — not the passing test suite.**
5. **Abort-if-drifted precondition** — if anything (the user, another process) may have touched `.planning/STATE.md` since step 3, that's fine: step 6 re-checks. Do **not** re-run the dry-run just to refresh the hash unless the user explicitly changed the file.
6. **Apply** (`--apply` only) — call `await runMigrate(baseDir, {apply:true, force, expectedHash: dry.inputHash})` (or `applyMigrate(baseDir, {force, expectedHash: dry.inputHash})` directly). **Passing `expectedHash` is what arms the TOCTOU guard** — apply re-reads STATE.md under the coarse lock and aborts *before any write* if it drifted from the dry-run. Apply then composes V1→V2→stamp under one coarse lock, hard-fails + surgically rolls back on any conservation failure or NEW dangling link, and leaves the result **staged (not committed)**. Report `result.tag`, `result.revertLine`, `result.moves`, and `result.historyName` to the user.
7. **Idempotent (FR6.4)** — a re-run on an already-migrated, conformant, stamped project is a no-op (`applied:false`).

## Lib symbols this command calls

From `${CLAUDE_PLUGIN_ROOT}/tools/lib/migrate-memory.js`:
- `parseMigrateArgs(argv)` → `{apply, force}` — flag parse; dry-run default.
- `probeGitState(baseDir, {force})` → `{mode, proceed, dirty, warnings, reason?}` — the git-state refuse/proceed/downgrade decision.
- `runMigrate(baseDir, {apply, force, expectedHash})` — the orchestration entry; dry-run returns `{plan, inputHash}`, apply delegates to `applyMigrate`.
- `renderDryRun(baseDir)` → string — the human-facing three-tier dry-run (the faithfulness diff the user approves).
- `applyMigrate(baseDir, {force, expectedHash, stamp, dateStr})` — the apply engine (compose V1→V2→stamp under one coarse lock, TOCTOU, surgical rollback, tag + staged).
- `relocateFaithful(...)` / `verifyFaithful(...)` / `conserves(...)` — the faithfulness gate (S1.t3): WORD conservation is the vector-1 gate; `verifyFaithful` is the ID/date/status-token backstop.

Supporting (pure cores + read-only sensing helpers the command uses; the mutating cores compose under the ONE coarse lock inside `runMigrate`/`applyMigrate`): `senseState`/`senseProject` (auto-sense), `deproseFrontmatter`/`locateFrontmatterProse` (vector-1), `planVector2` (vector-2), `stampOnConformance` (the stamp), `scanDanglingLinks`/`computeDanglingDelta` (dangling baseline). Vector-3 evict + archive-tree + link-rewrite + the full-corpus brain land in **S2**; the FR7.2 upgrade banner + SessionStart hook in **S3**.

> ⚠ **Do NOT call these from the command flow — they are self-locking, single-purpose wrappers that exist for STANDALONE / testing use only:** `relocateInlinedBody` (vector-2), `setDocsLayoutVersion` (the stamp), `applyDeproseVector1` (vector-1). Each takes the state lock on its own, so calling one directly bypasses the composed-under-one-lock safety harness — no V1→V2→stamp chain, no dangling-link gate, no surgical rollback, no TOCTOU bind — and would throw `another state write is running` if called under the coarse lock the harness already holds (§9). The command composes the pure cores listed above; drive it only through `runMigrate`/`applyMigrate`.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "The dry-run diff is long; just apply and let the user `git revert` if it's wrong." | No. The human faithfulness eyeball IS the safety gate (model §5). Skipping it defeats the command's entire reason to exist. |
| "The frontmatter prose has no IDs to preserve — dropping it is fine." | No. Word/token conservation is the vector-1 gate; free narrative with no IDs is exactly the B8 catastrophe. Relocate it; never delete. |
| "Tests pass, so the migration is faithful." | Tests prove no *byte/token* loss, never semantic faithfulness. The human dry-run diff is the faithfulness proof. |
| "The project looks non-standard; I'll assume the common old layout and move accordingly." | No. Conservative auto-sense: plan the smallest safe move, flag the ambiguity, never guess destructively. |
| "Apply, then log any dangling links so the user can fix them." | No. A post-apply dangling link is a hard abort + rollback, not a log-after-commit. |

## Gate: Migration Safe

- [ ] Dry-run rendered the full plan (counts + mechanical + faithfulness diff) and changed nothing
- [ ] User approved the faithfulness diff for every relocation
- [ ] Apply left the tree staged (not committed) with the pre-apply tag + revert line printed
- [ ] Post-apply verify: zero dangling links, zero residual flat paths, conservation held
- [ ] `docs_layout_version` stamped only on full conformance
