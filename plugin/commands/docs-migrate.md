---
name: sig:docs-migrate
description: "Auto-sensing doc-runtime migrate — reorganizes THIS project's .planning/ docs to the current layout (de-prose frontmatter, relocate bloated bodies, evict closed-Epic narrative, build the archive tree; and on a v2→v3 layout bump: rename FUTURE-IDEAS→ISSUES-INBOX, create BACKLOG, evict closed-milestone DECISIONS sections). Relocate-never-delete, dry-run by default, git-reversible."
args: "[--apply] [--force] [--work-store [--key KEY]]"
---

# `/sig:docs-migrate` — Auto-sensing doc-runtime migrate

You are running `/sig:docs-migrate`. Your goal: bring the **invoking** project's `.planning/` docs up to the current doc-runtime layout (`references/doc-runtime-model.md`) — safely, reversibly, and only after the user has eyeballed the plan.

This command is **meta** — same class as `/sig:status` and `/sig:resume`. It does **not** run a tier-gating preamble, does **not** load skills, and does **not** spawn agents. It operates on the **current working directory's** project (`process.cwd()`), never on Signal's own repo (except when Signal *is* the invoking project — the dogfood). There are **no hard-coded Signal paths**.

## The three non-negotiables (NFR safety-first)

1. **Dry-run by default (FR6.1).** With no args it prints the full plan — every move and rewrite, with before/after — and changes nothing. `--apply` is required to write.
2. **Relocate-never-delete (FR6.3).** No closed content is deleted. Every relocation lands the removed content in its new home **before** the source is shortened, and the faithfulness gate (`relocateFaithful`) hard-fails the apply if any content would be dropped. ⚠ The headline risk this command exists to prevent: the B8 hand-recipe *deleted* frontmatter prose ("body byte-identical" = ~80 lines dropped). Fine by hand; catastrophic unattended. The command **must relocate with the conservation gate**, never delete.
3. **Git-reversible (FR6.2).** `--apply` leaves changes **staged-but-uncommitted** (this runs in stranger repos — Signal never auto-commits someone else's work), prints the pre-apply tag `pre-migrate-memory-<ISO>` and the exact `git revert` / reset line, and refuses a dirty working tree without `--force`.

## The three bloat vectors (model §3), each RELOCATE-not-delete

- **Vector 1 — frontmatter-list prose** (the acute 529 KB `eval-project-A` case): de-prose = relocate the narrative out of the YAML list into the STATE body, leaving a short scalar.
- **Vector 2 — inlined legacy body**: relocate an already-migrated inlined body → `STATE-HISTORY.md` + a one-line pointer.
- **Vector 3 — closed-Epic narrative accretion**: apply evict-on-close retroactively to a project's backlog of already-closed Epics (card + pointer + archive tree).

## `--work-store` — move this project onto the work-item store (`M6.E15`)

The **work-item store** (`/sig:item`) keeps one record per bug, backlog row, inbox capture and open
question under `.planning/work/`; `BUGS.md`, `BACKLOG.md`, `ISSUES-INBOX.md` and `OPEN-QUESTIONS.md`
become generated views. `--work-store` is how a project gets there. It is **opt-in**: a plain
`/sig:docs-migrate` never reads or writes a list or a `.planning/work/` file. It is its **own** apply,
never chained with the layout steps above, and keeps this command's contract: dry run by default,
`--apply` to write, a dirty tree refused without `--force`, a pre-apply tag, changes staged and not
committed, an undo line printed.

- **Refused, nothing written** (dry run or apply): the project already has `.planning/work/WORK.md`
  (any content — *"already on the store"*); the layout is below v3 or there is no `STATE.md` (run the
  plain `/sig:docs-migrate`, then `/sig:docs-migrate --apply`, first); `--key` is not a valid key.
- **The key** is the prefix of every item ID (`KEY-1`). The dry run proposes one from the folder name
  and prints it; `--apply` without `--key` uses that proposal, `--key KEY` overrides it. A key is an
  uppercase letter, then 1–9 uppercase letters or digits.
- **A project with no lists** (or only the empty `BACKLOG.md` skeleton a layout migration leaves):
  apply writes `WORK.md` and the empty views; the skeleton is moved, byte for byte, to
  `.planning/archive/pre-work-store/`. Afterwards `/sig:item new` works.
- **A project whose lists have entries** — each `##`/`###` entry and bug-table row becomes one record,
  numbered `KEY-1` upward in the order BUGS, BACKLOG, ISSUES-INBOX, OPEN-QUESTIONS. An old ID (`B1`,
  `#99`, `R3`) is kept in `legacy_id` and on the body's first line. **The migration never closes an
  entry on its own** (`D-M6E15-25`): an entry is *proposed* for closing only when its wording says so plainly — struck through, or DONE / RESOLVED / ANSWERED / FIXED /
  CLOSED / SHIPPED, not-a-bug, won't-fix, superseded, followed by nothing but dates, `in <ref>`,
  references or a slice tag like `(S5)` — no note of words (`Fixed — needs QA` is unclear) — **and** a commit, PR (`#N` in a commit subject) or Epic (with a retrospective)
  it cites is found in this repository; the dry run lists each proposal with its wording and evidence,
  and you confirm the list with one yes (each then closes as a legacy close whose proof names both) or
  say no (each stays open, flagged `looks-finished`). Anything else stays open and **flagged**,
  with a note saying what was found and not found. Text outside any entry becomes one flagged item per file.
  Dates come from each list's git history (first commit → created; last commit → an undated close),
  or the file's modification date outside git.
- **The dry run** prints, per list, its counts (open / closed / flagged / non-item regions) and its
  dates, then every item's new ID, old ID, status and title, with the flag reason beside each flagged
  one. Review it — the flagged items especially — before `--apply`.
- **The apply** is all-or-nothing. The records and views are built and checked in a folder beside the
  store first; then each list moves, byte for byte, to `.planning/archive/pre-work-store/` beside a
  `MANIFEST.json` (counts, every item's source line range, the verification result, where the dates
  came from), and the records, `WORK.md` and the generated views move in. If the plan cannot account
  for every byte of a list, nothing is written; if anything fails part-way, the project is put back.
  A list or store path that is a symbolic link, or a `.planning/` outside the repository, is refused.
  Closes more than 30 days older than the newest event land in `.planning/work/history/` (a view), and
  `.planning/INDEX.md`, when the project has a generated one, is regenerated and staged with the rest so
  the first `/sig:docs-sweep` afterwards lists the new files.
- **Undo** with the printed line (`git reset --hard <tag>` on a clean tree). **Afterwards**, triage the
  flagged items with `/sig:item` — each carries a `migration_note` saying why it was left open.

## The v2→v3 layout transition (FR6)

When the project's `docs_layout_version` stamp is **below** `CURRENT_LAYOUT_VERSION` (3), the same one-apply, one-lock, one-rollback chain also performs the v2→v3 file transition — each step **relocate-never-delete**, previewed in the dry-run, and gated on the dangling-link + anchor-resolvability checks:

- **Inbox/ledger rename**: `FUTURE-IDEAS.md` → `ISSUES-INBOX.md` (and `FUTURE-IDEAS-LEDGER.md` → `ISSUES-INBOX-LEDGER.md`), with every referrer link/prose rewritten. Existence-gated → idempotent (an already-renamed repo plans nothing).
- **BACKLOG create-if-missing**: seeds `BACKLOG.md` (from a `BACKLOG-REVIEW` snapshot when present, else a skeleton). A born-v3 / already-migrated project already has it → no-op.
- **Append-log evict (FR5)**: closed-milestone `DECISIONS.md` date-sections relocate **verbatim** to `archive/M{n}/DECISIONS.md` behind a dated pointer, with **every `D-…` anchor preserved** (resolvable via `/sig:docs-index`). A section that can't be routed to a milestone (its date predates the open-date map) is **detect-only** — nothing evicted (fail-safe). The live `DECISIONS.md` keeps the current milestone's decisions; new decisions still append there (`/sig:checkpoint`).

The `docs_layout_version` stamp is written **only** at the tail, gated on full v3-conformance (inbox renamed, BACKLOG present, evict done) — a partial run stays unstamped so the banner keeps nagging and a re-run continues safely.

## Faithfulness — proven by a human, not by green tests

Mechanical safety (move-never-delete, conservation) preserves the *bytes*. It does **not** prove the relocated card is a faithful *representation* (model §5 blind spot). So the confirm step shows the **actual before/after content** for every relocation, and the user approves each. **A passing test suite is NOT the faithfulness gate — the human dry-run diff is.**

## Workflow

Drive the command by calling into `tools/lib/migrate-memory.js` (import with `node --input-type=module`, or a short script). `baseDir = process.cwd()` — the **invoking** project.

1. **Parse args** — `parseMigrateArgs(process.argv.slice(2))` → `{apply, force}`, plus `workStore: true` and `key` when given. Dry-run is the default; `--apply` is required to write, `--force` to proceed on a dirty tree. **With `workStore`, take the `--work-store` flow below instead of steps 2–7.**
2. **Probe git state** — `probeGitState(baseDir, {force})`. If `proceed:false` (dirty tree, no `--force`), stop and print `reason`. Otherwise note `mode` (`git` | `fs-backup`) and surface every `warnings[]` entry to the user.
3. **Dry-run — sense + render + capture the TOCTOU token** — call `const dry = await runMigrate(baseDir, {apply:false})`. `dry.plan` is the per-project plan-data (mutates nothing); **`dry.inputHash` is the TOCTOU binding token — hold onto it for step 6.** Then print `await renderDryRun(baseDir)` — the three tiers (counts → mechanical moves → the faithfulness diff) plus the ambiguity flags, the "shouldn't touch" append-logs left alone, and the pre-existing dangling links (surfaced separately so pre-existing breakage isn't blamed on the migrate).
4. **Confirm** — the user reviews the **faithfulness diff** (Tier 3) and approves each relocation, or aborts. No approval → stop, having written nothing. **This human eyeball is the faithfulness gate — not the passing test suite.**
5. **Abort-if-drifted precondition** — if anything (the user, another process) may have touched `.planning/STATE.md` since step 3, that's fine: step 6 re-checks. Do **not** re-run the dry-run just to refresh the hash unless the user explicitly changed the file.
6. **Apply** (`--apply` only) — call `await runMigrate(baseDir, {apply:true, force, expectedHash: dry.inputHash})` (or `applyMigrate(baseDir, {force, expectedHash: dry.inputHash})` directly). **Passing `expectedHash` is what arms the TOCTOU guard** — apply re-reads STATE.md under the coarse lock and aborts *before any write* if it drifted from the dry-run. Apply then composes V1→V2→stamp under one coarse lock, hard-fails + surgically rolls back on any conservation failure or NEW dangling link, and leaves the result **staged (not committed)**. Report `result.tag`, `result.revertLine`, `result.moves`, and `result.historyName` to the user.
7. **Idempotent (FR6.4)** — a re-run on an already-migrated, conformant, stamped project is a no-op (`applied:false`).

### The `--work-store` flow

From `${CLAUDE_PLUGIN_ROOT}/tools/lib/work-migrate-lists.js`. It never calls `senseProject`, `renderDryRun` or `applyMigrate`.

1. **Dry run** — `const dry = await runWorkStoreMigrate(baseDir, {apply: false, key})`. If `dry.refused`, print `dry.reason` and stop. Otherwise print `dry.report` — the key, each list's counts and dates, every planned item and its flag, the **proposed closes** (each with its new ID, old ID, title, wording and evidence), any sensitive-data hits — and hold `dry.inputHash`.
2. **Confirm** — the user confirms the key (or re-runs with `--key KEY`) and has seen the counts and the flagged items. If `dry.proposedCloses` is not empty, show that section again and ask **one yes/no**: *close these N entries?* Yes → `confirmCloses = true`; no → `false` (they stay open, flagged `looks-finished`). Never answer it for the user, and never ask per entry. If `dry.sensitiveHits` is not empty, ask: **keep** the text as it is, or **abort** and edit the list first. No confirmation → stop, having written nothing.
3. **Apply** (`--apply` only) — `await runWorkStoreMigrate(baseDir, {apply: true, force, key: dry.key, expectedHash: dry.inputHash, confirmCloses, acknowledgeSensitive})`, with `confirmCloses: true` only when the user said yes in step 2 and `acknowledgeSensitive: true` only when the user chose keep. A `refused` result (dirty tree, `STATE.md` or a list changed since the dry run or while the apply ran, what the dry run showed — an item's status or flag, a proposed close or its evidence — no longer what the apply would do, an earlier run of this tool stopped part-way) or `aborted: 'sensitive-data-pending'` → print `reason` and stop. Otherwise print `result.report`, which ends with the pre-apply tag and `result.revertLine`.

## Lib symbols this command calls

From `${CLAUDE_PLUGIN_ROOT}/tools/lib/migrate-memory.js`:
- `parseMigrateArgs(argv)` → `{apply, force, workStore?, key?}` — flag parse; dry-run default.
- `probeGitState(baseDir, {force})` → `{mode, proceed, dirty, warnings, reason?}` — the git-state refuse/proceed/downgrade decision.
- `runMigrate(baseDir, {apply, force, expectedHash})` — the orchestration entry; dry-run returns `{plan, inputHash}`, apply delegates to `applyMigrate`.
- `renderDryRun(baseDir, {boundaryDate, milestoneOf, dateStr})` → string — the human-facing three-tier dry-run (the faithfulness diff the user approves). On a v2→v3-pending project it also enumerates the inbox/ledger rename, the BACKLOG create, and the append-log evict (a **summary**, not a diff — a verbatim move has no semantic change), i.e. the SAME steps apply performs. The evict inputs default to the real-run derivation (`deriveBoundaryDate` / `defaultMilestoneOf`); the CLI calls with `baseDir` only.
- `applyMigrate(baseDir, {force, expectedHash, stamp, dateStr})` — the apply engine (compose V1→V3→V2→append-log-evict→BACKLOG→rename→index-regen→stamp under one coarse lock, TOCTOU, surgical rollback, tag + staged; the v2→v3 steps fire only when the stamp is below `CURRENT_LAYOUT_VERSION`).
- `relocateFaithful(...)` / `verifyFaithful(...)` / `conserves(...)` — the faithfulness gate (S1.t3): WORD conservation is the vector-1 gate; `verifyFaithful` is the ID/date/status-token backstop.

From `${CLAUDE_PLUGIN_ROOT}/tools/lib/work-migrate-lists.js` (`--work-store` only):
- `runWorkStoreMigrate(baseDir, {apply, force, key, expectedHash, confirmCloses, acknowledgeSensitive})` — `expectedHash` (the dry run's `inputHash`) is required with `apply`: without it the apply is refused. `confirmCloses` is the user's yes to the proposed closes. Returns refusals, a sensitive-data stop (`{aborted, hits}`), dry run (`{key, files, items, dates, proposedCloses, sensitiveHits, inputHash, report}`) or apply (`{tag, revertLine, written, archived, records, flagged, closesConfirmed, report}`).
- `proposeKey(folderName)` → a valid key or `null` — what the dry run proposes.

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
