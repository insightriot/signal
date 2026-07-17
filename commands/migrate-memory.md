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

1. **Parse args** — `parseMigrateArgs(process.argv.slice(2))` → `{apply, force}` (`tools/lib/migrate-memory.js`).
2. **Sense** — `runMigrate(baseDir, {apply:false})` auto-senses the project (stamp-first → structural sniff) and returns a per-project plan (`{vectors, flags, moves, ...}`), mutating nothing. When unsure it plans the *smallest safe move* and flags the ambiguity — it never guesses destructively (FR6.5, conservative auto-sense).
3. **Render the dry-run (three tiers)** — counts → mechanical moves → the faithfulness diff (the before/after content the human must approve). Surface every ambiguity flag, every "shouldn't touch" append-log left alone, and any pre-existing dangling links (the pre-apply baseline, so pre-existing breakage isn't blamed on the migrate).
4. **Confirm** — the user reviews the faithfulness diff and approves (or aborts). No approval → stop, having written nothing.
5. **Apply** (`--apply`) — re-read + hash-bind (TOCTOU), refuse a dirty tree without `--force`, hold the coarse state lock once, relocate each move through `relocateFaithful` (hard-fail + rollback on any conservation failure or dangling link), stamp `docs_layout_version`, then leave the result **staged** with the pre-apply tag + revert line printed.
6. **Idempotent (FR6.4)** — a re-run on an already-migrated, conformant, stamped project is a no-op.

## Lib symbols this command calls

From `${CLAUDE_PLUGIN_ROOT}/tools/lib/migrate-memory.js`:
- `parseMigrateArgs(argv)` — flag parse; dry-run default.
- `runMigrate(baseDir, {apply, force, sense})` — the orchestration entry.
- `senseProject(baseDir)` — auto-sense → plan-data (S1.t6 / S2.t5).
- `relocateFaithful(...)` / `verifyFaithful(...)` — the faithfulness gate (S1.t3).

Supporting: `setDocsLayoutVersion` (`tools/lib/migrate-memory.js`, S1.t2 — the stamp), `state.js` (`withStateLock`, `parseFrontmatter`, `atomicWrite` via `atomic-write.js`), `evict.js` (the relocate spine, extracted into `relocateFaithful`).

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
