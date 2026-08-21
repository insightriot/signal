---
name: sig:ship
description: "SHIP phase — pre-ship checklist, clean git history, PR creation with quality documentation."
args: "<phase-number>"
---

# SHIP Phase

You are running the SHIP phase. Your goal: get reviewed, verified code into a merge-ready PR with complete documentation.

## 0. Tier-gating preamble (run before anything else)

Read the **effective profile** before any other workflow step: `readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`), where `currentEpic` is `current_epic` from STATE.md (via `readState`). In **Epic mode** (a strict `current_epic`) an Epic-scoped `.planning/{EpicID}-PROFILE.md` shadows the project PROFILE for this Epic's phases; in **linear mode** (null / absent / non-strict `current_epic`) it reads `.planning/PROFILE.md` unchanged — byte-identical to pre-E11. Fail-open on the STATE value: a hand-edited or garbage `current_epic` degrades to the project PROFILE, never throws.

- **If neither PROFILE.md is present:** `readEffectiveProfile` throws the same not-found error — halt with *"No PROFILE.md found at .planning/PROFILE.md. Run `/sig:calibrate` first to tier this project, then re-run `/sig:ship`."* Do not proceed.
- **If `SHIP` is in `phases_skipped`:** exit with *"This tier ({tier}) skips SHIP. The project's output is internal (e.g., a SPIKE finding doc, not a shipping artifact). If output should ship, run `/sig:escalate` to upgrade tier."* Do not proceed. (SPIKE tier skips SHIP by default.)
- **Apply `rigor_overrides`** from PROFILE.md:

| Override | Effect on this phase |
|---|---|
| `attention: unattended` | Auto-advance through the pre-ship checklist. **The PR and its approval still happen** — they are floors (`ship-pr`, `ship-retro`), not asks the dial can clear. |
| `attention: checkpointed` | Confirm at PR creation (the default). |
| `attention: attended` | Confirm at every checklist step (`gates.confirm_in_phase`). |
| `gate_strictness: strict` | Runs the anti-rationalization check at the gate. **That is all `gate_strictness` does to gates** (`v0.1.31`) — it no longer sets confirm cadence. | Step 5's final anti-rationalization is what it switches on here.

Tooling: `tools/lib/profile.js` exposes `readProfile`, `readEffectiveProfile`, `isPhaseEnabled`, `applyRigorOverrides`. Schema reference: `references/profile-schema.md`. Question convention: `references/question-patterns.md`.

## 0.5 FR1 retrospective pre-check (M4.5.E9, command-internal layer)

Run **before any other Workflow step**, regardless of `gate_strictness`. This is the command-internal layer of the layered enforcement locked in D-E9-8 (`PreToolUse` hook + `SessionStart-resume` hook are the other two layers; this layer is the only one that fires across all runtimes including Cursor/Codex).

**Steps:**

1. Load STATE.md via `readState(baseDir)` — gives the `state` object.
2. **Epic mode only** — `detectMode(state) === 'epic'` (`tools/lib/state.js`). Determine the current milestone file: parse `state.current_epic` (e.g., `M4.5.E9`), drop the trailing `.E{N}`, prefix with `MILESTONE-`, append `.md`. Load `.planning/MILESTONE-{n}.md` content; if file missing, halt with *"current_epic `{epicId}` points to a milestone whose MILESTONE-{n}.md does not exist. Set current_epic to a real Epic or create the milestone file."* **In linear mode, skip this step** and pass `milestoneContent: null` to step 3 — there is no Epic to derive a milestone file from, and halting on a file the mode cannot name is `B42`'s second gate (D-M5E9-1). *This halt remains correct for its real case: a **strict-shaped** `current_epic` whose milestone file genuinely does not exist.*
3. Call `shipFR1Check({state, profile, milestoneContent, baseDir})` from `tools/lib/retrospective.js`.
4. Interpret the result:
   - `{halt: false, skipped: true, reason}` — **either** a per-Slice SHIP (not an Epic-close) **or** a linear-mode project, for which the FR1 retrospective gate is Epic-only (D-M5E9-1). Continue with normal Workflow. No retro enforcement. The `reason` string distinguishes the two.
   - `{halt: false, skipped: true, unevaluated: true, cause: 'stale-milestone-row', rowStatus, reason}` — **the gate did not run, and that is worth saying out loud.** STATE.md shows this Epic at close, but its milestone row is stale, and a maintained row wins (D-E9-5) so the gate deferred to it. **Emit `reason` verbatim to the user before continuing** — do not fold it into a generic "skipped" line. This is `B36`, which shipped three Epics (M5.E6, M5.E9, M5.E8) with the gate silently inert; at M5.E8's own ship the retrospective existed only because someone wrote it before the gate ran. Continue with the Workflow — this reports, it does not block — but the user must see it, because the alternative is an Epic shipping with no retrospective and nothing saying so.
   - `{halt: false, retroPath, isEpicClose: true}` — retro exists + passes validation. Continue with Workflow. The eventual STATE.md commit will include the Epic-close.
   - `{halt: true, code, message, retroPath?}` — emit `message` verbatim to the user and **halt**. Do not proceed to Workflow. The user creates / fixes the retro file, then re-invokes `/sig:ship`.

**No bypass.** Per D-E9-3 there is no `--no-retro` flag, no environment variable escape hatch, and no extra-args trick. `shipFR1Check` ignores any extra properties passed to it. **This is unchanged for Epics.** What D-E9-3 never decided is what a project with *no* Epics owes; until M5.E9 the code silently answered *"it is broken"* and refused to run. **The gate is Epic-only (D-M5E9-1) — that is a scope, not a bypass:** a linear project cannot opt out of a rule that never applied to it, and no flag was added.

**Layered enforcement context:** even if a user manually edits STATE.md to skip `/sig:ship`, the `PreToolUse(Edit|Write)` hook in `hooks/hooks.json` (added in M4.5.E9.S1.t7) blocks that write. Even if the user clears context mid-EXECUTE without invoking SHIP, the `SessionStart(resume)` hook surfaces the missing retro on the next session resume.

## 0.6 Branch precondition (`B88`) — run before any Workflow step

Call `checkBranchPosture(baseDir, { tier: profile.tier, override })` from `tools/lib/branch-guard.js`, where `override` is true only if the user passed `--allow-default-branch`. Read-only, offline, never throws.

Act on `status`:

- **`ok`** — continue silently.
- **`on-default`** — **HALT.** Emit `formatBranchHalt(result, { command: '/sig:ship' })` verbatim. Do not run §2 (git history) and do not run §9 (the SHIP commit). §5's state-update rule for a halted command governs the ledger; it is not restated here, for the reason `B55` records — an instruction restated outside its declared site survives the control arm that was supposed to delete it.
- **`overridden`** — continue, but emit `formatBranchLine(result)` so the deviation is on the record rather than invisible.
- **`not-applicable`** — continue silently. Either the tier does not end at a PR (SKETCH / SPIKE) or there is no remote, so there is no pull request for this gate to protect.
- **`cannot-determine`** — **do not halt.** Emit `formatBranchUnknown(result)` and continue. A gate that cannot look must say so; a gate that halts on its own blindness is unusable.

**Why this is a precondition and not advice.** §3 below says *"Create a pull request"* — but once every commit has landed on the default branch there is nothing to open one from, and the step fails with nothing to report. That is `B88`, found on a `eval-project-A` slice where five commits of real code reached `main` with no branch and CI ran *after* each push instead of gating it. **The paragraph at §3's foot is the one that removed the direct-to-main exemption** (`D-M5E17-5`) and states in copy that a change *"does need a branch, a PR, and a green suite"* — while this file provided no mechanism to make that true and no check that it happened. The file that stated the rule supplied no enforcement, which is the precise shape `D-M5E17-5` was filed to end.

## Skill Loading

Load from `${CLAUDE_PLUGIN_ROOT}/skills/ship/`:
- `git-workflow-and-versioning/SKILL.md`
- `ci-cd-and-automation/SKILL.md`
- `documentation-and-adrs/SKILL.md`
- `shipping-and-launch/SKILL.md`
- `deprecation-and-migration/SKILL.md`

## Workflow

**Artifact naming (M4.5.E11).** Resolve prior-phase artifacts this phase reads with `resolveArtifactPath(planningDir, ARTIFACT, { currentEpic, phase })` (`tools/lib/resume.js`) — Epic mode finds `{EpicID}-*.md`, linear finds `{phase}-*.md`. The Epic **retrospective** is named by `deriveRetroPath(currentEpic)` (`tools/lib/retrospective.js`) → `{EpicID}-RETROSPECTIVE.md`, **not** `artifactName` — retro naming has one owner (see §0.5).

### 1. Pre-Ship Checklist

Verify before creating the PR:
- [ ] No secrets in code or git history
- [ ] Environment variables documented (`.env.example` updated)
- [ ] README updated if public API or setup changed
- [ ] CHANGELOG updated
- [ ] docs/map (`docs/map/index.html`) refreshed if the command/agent/skill roster or structure changed — check both tabs ("Signal, explained" + "Functionality map"); "no change needed" is a valid outcome
- [ ] **Signal-repository step, not a user step (`M6.E1`, `AC2.2`):** adherence re-measured (`node tools/adherence-run.js --canary <id>`, run from a clone of the Signal repo) if the **wording** of a measured instruction in `commands/*.md` changed — a reworded instruction invalidates the verdict recorded against it; "no run needed" is a valid outcome. **Marked because the script does not ship.** `tools/adherence-run.js` is maintainer tooling and is deliberately outside the plugin payload (`D-M6E1-2`), so in your install this path does not exist — an unmarked line here would be an instruction pointing at nothing, which is the defect class this Epic was careful not to create while fixing another.
- [ ] **Rollback stated** — how this change is undone if it goes wrong after merge. *"Revert the commit"* is a valid and, for most changes, the correct answer. What this line exists to catch is the change where it is **not** true: a data migration, a published or cached artifact, a breaking rename, anything already consumed downstream. Those say what undoing actually costs. **An honest "revert is sufficient" satisfies this line** — a checklist item that cannot be answered plainly becomes one that gets answered from memory.
- [ ] All tests pass
- [ ] Build succeeds
- [ ] Linter passes
- [ ] Review report issues resolved
- **Open obligations — queried, not recalled (`M5.E14` first slice).** Call `readOpenObligations(baseDir)` (`tools/lib/obligations.js`) and emit `formatObligationReport(result)`. **This reports; it never halts.** Unlike the branch gate at §0.6, "yes, something is open, and I am shipping anyway" is frequently the correct call — a gate that blocks on a judgement trains people to route around it.

  Three outcomes stay separate, and the third is the point: items still **open**, items **discharged** (recorded as done, so not owed), and sources that **could not be read** — which render as `UNKNOWN, not none`. A source that failed to load has not reported zero.

  *Why this is a query. `PROFILE.md`'s `backfill_warnings` was append-only with no way to record completion, so a discharged obligation read as open forever. In eval-project-C's Phase 11 a security backfill discharged by Phase 10 — and ticked in four places — was reported "still owed" by VERIFY, escalated to a bolded warning by REVIEW, then copied into STATE.md. The claim gained confidence at every hop and never gained evidence (`CLAIM-INTEGRITY-ANALYSIS.md` specimen #4). Mark one done with `dischargeObligation(baseDir, {text, by, at})`.*

  *The answer comes from a **named source**, so the tracker decision stays open (`D-M5E14-1`). Adding GitHub Issues later means registering a second resolver, not rewriting this step.*

### 2. Git History

Ensure commit history tells a coherent story:
- Each commit is atomic and has a descriptive message
- No "fix typo" or "WIP" commits in the final history
- Interactive rebase to clean up if needed (with user approval)

**Merge with `--merge`, not `--squash`, on the Epic lane.** This section asks you to curate a
history; squashing an Epic then discards it, and curate-then-destroy is wasted work. The harder
reason is `.planning/ADHERENCE-LOG.md`: it **pins commit SHAs as its reproducibility anchor**, and
this file's own harness states the failure mode — AC4.3 breaks when *"the record would name a state
nobody can return to."* Squash never lands those commits on `main`; rebase rewrites them. Either
leaves a published verdict pointing at a commit absent from `main`'s history.

`--squash` remains correct for the **fix lane**, where there is nothing underneath worth keeping.
See `CLAUDE.md` → *How changes reach `main`* for the two-lane table. *(Added v0.1.19: the rule was
inferred from the fix-lane example for several releases and stated nowhere, which is how `#88` came
within one command of squashing away the SHA its own verdict names.)*

### 3. PR Creation

**Precondition, already established at §0.6.** If the branch gate returned `on-default` this command halted before reaching here. If it returned `cannot-determine`, verify by hand that a PR is possible before continuing — §0.6 said out loud that it could not check.

Create a pull request with:
- **Title**: Short, imperative, under 70 characters
- **Description**: Summary of changes, link to plan, review findings addressed
- **Test plan**: What was tested and how
- **Screenshots**: For UI changes

### 4. Architecture Decision Records

If this phase introduced significant architectural decisions, document them:
- Create ADR files in the project's docs directory
- Link from the PR description

### 5. Update State (programmatic, not prose)

The PR is open and the Epic has shipped end-to-end. Bring STATE.md frontmatter into parity with the rest of the phase commands (RESEARCH § 1.1 surfaced that SHIP previously relied on prose "Update STATE.md" rather than programmatic state-writes — that gap is now closed):

1. `await transitionPhase(baseDir, 'SHIP')` from `tools/lib/state.js` — appends the phase being **left** (e.g. `REVIEW (YYYY-MM-DD)`) to `completed_phases` and sets `phase: SHIP`. *(Corrected M5.E9/`B43`: this line previously claimed it appends `SHIP`. It never did, and could not — `transitionPhase` records the phase you leave, and **SHIP is terminal**, so nothing ever leaves it. `retrospective.js:493` had the truth in a code comment — "Signal never writes one" — while this line asserted the opposite for nine releases.)*
2. `await completePhase(baseDir, 'SHIP')` — **this is what finally records `SHIP (YYYY-MM-DD)`.** Records a phase complete without transitioning away from it; idempotent for the same phase on the same day, so a re-invoked `/sig:ship` cannot double-record. **In linear mode this call also fires FR5's trim** (D-M5E9-6): the finished run — its own `SHIP` entry included, which is why this runs *after* step 1 — relocates verbatim to `.planning/STATE-HISTORY.md` and the live list restarts. Surface the returned `{trimmed}` count; a state write that silently drops entries is the defect M5.E9 exists to fix.
**`markFresh` does NOT belong here.** It used to be step 3 of this section, and that was wrong — see §9. Steps §5.5, §6, §6.5 and §8 all still have files to write, and stamping `last_updated_commit` before they are committed records a sha that predates them.

This step runs regardless of how the change reaches `main`, so STATE.md never lags behind the Epic-close.

**No direct-to-main exemption (M5.E17, `D-M5E17-5`).** This paragraph used to read *"required even if no PR was created (e.g., direct-to-main shipping for the Signal-on-Signal flow)"* — **a carve-out contradicting this file's own Exit Criteria**, which require *"PR created with description, test plan"* and *"User approves PR for merge"*. Written 2026-05-26; **thirteen releases shipped under it (v0.1.3 → v0.1.15) and exactly one pull request existed in that span**, so both exit boxes were checked from the fact of having shipped rather than from an artifact — the `CLAIM-INTEGRITY-ANALYSIS.md` class. It is removed: **§3's PR is not optional, and Signal-on-Signal is not exempt from it.** A one-line fix does not need the six phases; it does need a branch, a PR, and a green suite. *(Found 2026-08-01 by the maintainer asking whether Signal was relaxing the discipline it exists to enforce — the file that defined the rule was the same file that granted the exception, so nothing was ever going to catch it.)*

### 5.5 Evict-on-close (M5.E1 FR2b) — Epic-close SHIP only

When this is an **Epic-close** SHIP (`shipFR1Check` returned `{isEpicClose: true}` in §0.5), the closing Epic's narrative should LEAVE the live STATE.md body. Call `evictEpicNarrative(baseDir, state.current_epic)` from `tools/lib/evict.js` — it moves that Epic's body narrative to `.planning/archive/<milestone>/<epic>/STATE-NARRATIVE.md` (byte-identical, move-never-delete), leaves a one-line pointer in its place, and lifts any open carry-overs UP into a live section so they aren't buried.

It runs the ordered **distill → verify-against-source → evict** gate and **refuses** (returns `{evicted:false, reason}`, changing nothing) when:
- the Epic has no body narrative block (`no-section`) — a safe no-op;
- the Epic isn't closed — no `{EpicID}-RETROSPECTIVE.md` (`not-closed`); the Auditor-style closed-vs-live confirm;
- the retrospective (the card) **fails the coverage gate** (`lossy-card`, with `missing` ids/dates/tokens). **Do not force.** Surface the missing items, fix the retrospective so it faithfully covers the narrative, then re-run. This is the R1 safety — never replace live narrative with a pointer to a card that dropped material.

On `{evicted:true}`, stage the modified `.planning/STATE.md` **and** the new `.planning/archive/.../STATE-NARRATIVE.md` into the SHIP commit (alongside the retro + state-write + index from §6). Per-slice (non-Epic-close) SHIPs skip this step entirely.

> The gate proves **no-loss of discrete tokens, not semantic faithfulness** (`references/doc-runtime-model.md` §5). A green gate never excuses an unfaithful card — REVIEW is the faithfulness backstop.

### 6. Regenerate RETROSPECTIVES.md index (M4.5.E9.S2)

After the FR1 retro file and the state-write have both landed, call `regenerateIndex(baseDir)` from `tools/lib/retro-index.js` to refresh the index. The helper:

1. Walks `.planning/` recursively for `*-RETROSPECTIVE.md` files.
2. Parses any existing `RETROSPECTIVES.md` to preserve hand-written hook lines per Epic ID.
3. Renders the new index (reverse-chronological by lastModified) with hooks merged.
4. Atomic-writes IF content differs from existing (idempotent — no spurious diffs on re-runs that don't change retro state).

The index regen runs only on Epic-close SHIP (when `shipFR1Check` returned `{halt: false, isEpicClose: true}` in §0.5). Per-slice SHIPs skip both FR1 and the regen — the index doesn't change because no new retro lands.

Stage the modified `.planning/RETROSPECTIVES.md` (when `result.written === true`) into the SHIP commit alongside the retro file + state-write. One atomic commit captures all three.

### 6.5 Light inbox sweep (M5.E3 FR2) — Epic-close SHIP only

On an **Epic-close** SHIP (when `shipFR1Check` returned `{isEpicClose: true}` in §0.5), run a light sweep of the capture inbox so terminally-dispositioned entries (promoted / merged / shipped / deleted) that the `/sig:plan` drain stamped but did not yet evict physically leave the inbox — the same convergence step the drain performs, applied once more at Epic close so nothing lingers.

1. `evictTerminalToLedger(baseDir, { dryRun: true })` from `tools/lib/drain.js` — **preview** which terminal entries would move to the archive ledger (`ISSUES-INBOX-LEDGER.md`, back-compat `FUTURE-IDEAS-LEDGER.md`, resolved by `resolveLedgerPath`). A dry run leaves the inbox byte-identical.
2. Confirm (honoring `gate_strictness` — `strict` confirms explicitly, `off` auto-advances), then call `evictTerminalToLedger(baseDir)` for real. It appends to the ledger **first**, then removes the blocks from the inbox — crash-safe and keyed, so a re-run never dupes or loses. If it reports `danglingFence: true` it performed a scoped no-op (never cutting across an unclosed fence); report that and leave the fence to be fixed.

**DEFERRED entries stay** (parked-but-live). When entries were evicted, stage the modified inbox **and** the ledger into the SHIP commit alongside §5/§6. Per-slice (non-Epic-close) SHIPs skip this step. This sweep is anchored at `/sig:plan` (primary) and `/sig:ship` (this step) only — **`/sig:execute` never runs it** (AC2.6).

### 6.6 Discharge the backlog rows this Epic closed (`B94`) — Epic-close SHIP only

On an **Epic-close** SHIP (when `shipFR1Check` returned `{isEpicClose: true}` in §0.5), record in
`.planning/BACKLOG.md` that the rows this Epic finished are done.

Call `dischargeBacklogRows(baseDir, {rows, by: state.current_epic, at: <today>})` from `tools/lib/backlog.js`, where `rows` are heading substrings **you name** from the Epic's own scope.

*(That call sits on one line deliberately. `directive-classifier.js` reads at line granularity, so a
call name wrapped across a break is invisible to it and the instruction ships **unmeasurable** —
the same wrap limit `S5.t1` pinned for `checkCorrectionProtocol`, hit here while writing the step.)*

1. **The Epic names the rows. Nothing here infers them.** Read the Epic's REQUIREMENTS / PLAN and
   list the backlog rows its work closed. If it closed none, say so — *"no backlog rows discharged;
   this Epic closed no queued item"* — and continue. A step that skips silently when it has nothing
   to do is indistinguishable from a step that did not run.
2. Report every result. Four outcomes come back and they mean different things: `discharged`,
   `already-discharged` (someone struck it by hand — fine, and not an error), `not-found` (your
   heading substring matched no live row — check the wording), and **`ambiguous`**, which **wrote
   nothing** because the substring matched more than one row. Name the row exactly and re-run.
3. When `{written: true}`, stage the modified `.planning/BACKLOG.md` into the SHIP commit alongside
   §5/§6/§6.5.

Per-slice (non-Epic-close) SHIPs skip this step.

**Why this step exists.** `BACKLOG.md` was append-only: `backlog.js` had exactly two write paths
(create-if-missing, promote-append) and **no discharge function was ever written**, while this file
reconciled five other document surfaces at Epic close and touched the backlog in none of them. The
backlog and §6.5's inbox sweep were built by the **same Epic** (`M5.E3` FR2), which gave the inbox
both ends of the pipeline and the backlog only the intake end. So the one document users treat as
*the queue* asserted `pending` about shipped work indefinitely — measured 2026-08-13 in this repo
(four rows describing work finished that same day) and in the field (a backlog two weeks stale, ~15
shipped slices reading as pending). That is not a convenience gap; it is a document actively
asserting false completeness, which is the `CLAIM-INTEGRITY-ANALYSIS.md` class.

### 7. Manual milestone meta-retro (`--milestone-meta` flag, optional)

If the user invokes `/sig:ship --milestone-meta` (or otherwise explicitly requests a milestone-level meta-retrospective), call `generateMilestoneMetaRetro(baseDir, milestoneId, opts)` from `tools/lib/retro-index.js` where `milestoneId` is derived from `state.current_epic` (drop the trailing `.E{N}` segment, e.g., `M4.5.E9` → `M4.5`).

The helper writes `.planning/{milestoneId}-RETROSPECTIVE.md` as a stub with:
- Auto-generated list of per-Epic retros under the milestone (sorted naturally, each with stub/complete status flag)
- `[FILL IN]` markers in three reflection sections (Synthesis, Compound learnings, Forward-looking)
- A Links footer pointing back at the index

The helper **refuses to overwrite** an existing meta-retro unless `{force: true}` is passed — confirms user intent before destroying prior content. If the file already exists, surface the refusal message; the user can re-invoke with `--force` after deciding to regenerate, or hand-edit the existing file.

The meta-retro is **opt-in / manual only** per A6 (the auto-detection of milestone close was downgraded because MILESTONE-{N}.md has no fully-parseable close-detection schema). FR1 enforcement does NOT extend to milestone meta-retros — they're additive, not gating.

Stage the new file into the SHIP commit (or its own commit if SHIP isn't running). The index regen in §6 will pick up the milestone meta-retro automatically on the next regen if you want it indexed alongside per-Epic retros — though typically it's tracked separately because it spans Epics.

### 8. Reconcile `.planning/INDEX.md` (native FR3 index-regen)

Regenerate the planning index so `.planning/` ships reconciled. This is Signal's own, in-repo reconcile — it replaces the former external doc-index step (retired per D-M5E1-3 / AC6.4). No external CLI, no per-zone config file, no model calls: the FR3 generator is deterministic and runs from the repo's own `tools/lib`.

Call `regeneratePlanningIndex(baseDir)` from `tools/lib/planning-index.js`. It enumerates every tracked `.planning/` (and `archive/`) doc, re-renders `INDEX.md` preserving hand-curated annotations by ID (the survive-by-ID pattern), and **compare-before-write** — idempotent, so a SHIP that didn't change the doc set produces no diff (`{written: false}`). Run it unconditionally (like the old §8 ran every SHIP); the compare-before-write makes a no-op SHIP a clean pass.

When it reports `{written: true}`, stage the modified `.planning/INDEX.md` into the SHIP commit alongside the state-write (§5) and retro index (§6). The rest of what that step did is now covered natively and needs no step here: the FR4 all-docs hygiene guard (`tools/lib/doc-hygiene.js`, in the test suite) turns structural doc drift red, and the FR2 light inbox sweep (§6.5) reconciles the capture inbox at Epic-close.

### 9. Create the SHIP commit, then mark STATE.md fresh (M5.E17 FR3)

Five steps above — §5.5 (evicted narrative), §6 (retro index), §6.5 (inbox + ledger), §6.6 (discharged backlog rows), §8 (INDEX.md) — each instruct staging into **"the SHIP commit."** This is the step that makes it. Commit everything those steps staged, as one atomic commit.

**Then, and only then:** `await markFresh(baseDir, {commit: <git HEAD short>})` from `tools/lib/state.js` — advances `last_updated` + `last_updated_commit` to the SHIP commit so `/sig:resume`'s staleness banner reads fresh. Run it **after** the commit — passing a pre-commit HEAD records a stale sha and silently defeats the freshness check (AC3.4).

Wrap the call in a **catch-all**: if `markFresh` throws for *any* reason — `StateSchemaError` on a schema-mismatched STATE.md, `StateWriteError` on lock contention, git unavailable — warn and continue. Under `gate_strictness: strict`, surface the failure but **do not roll back the SHIP**: the work and the PR are done, and a state-write blip is a recovery item, not a SHIP failure. (Mirrors plan/verify/review/discuss.)

**Why this step exists (M5.E17 `FR3`).** Until v0.1.15, `markFresh` was step **5.3** — ahead of all four staging steps — and **no step in this file ever instructed making the commit they staged into.** Four steps referenced a commit that nothing created. Following `ship.md` as written therefore stamped a HEAD that predated every file those steps produced, **by construction rather than by accident**, and `isStateStale` immediately reported the release commit as unreflected work. Observed live during M5.E13's own ship, 2026-07-30. `plan.md:173` had stated the correct rule since v0.1.5; this file contradicted it, and only a live run surfaced the disagreement.

## Phase Gate

### Anti-Rationalization Check
| Temptation | Check |
|---|---|
| "Nobody reads CHANGELOGs" | Changelogs are for users and for yourself in 6 months |
| "I'll clean up the git history later" | Later never comes. Clean it now |
| "Docs can wait until after merge" | If docs aren't in the PR, they won't get written |

### Output contract (shaping failures — stated as recipes, `B38`)

These are not prohibitions. A prohibition is the right form when the failure is *discipline* —
knowing the rule and skipping it under pressure. It is the **wrong** form when the output merely
comes out the wrong shape, where head-to-head wording tests measured the prohibition arm producing
**more** of the unwanted content than a positive recipe, and worse than no guidance at all.
So these say what the output IS. See `references/anti-rationalization-forms.md`.

- **The PR body states what changed, why, and how it was verified.** Those three, in that order; the diff shows the rest.


### Exit Criteria
- [ ] Pre-ship checklist complete
- **PR — filled from evidence, never ticked from memory (`B88`).** Call `readPullRequestEvidence(baseDir)` (`tools/lib/branch-guard.js`) and render `formatPrEvidenceLine(evidence)` in place of a checkbox. It ticks only on a real PR URL; `none` and `cannot-determine` render as distinct unticked lines carrying their reason. *This line used to read `- [ ] PR created with description, test plan` — a box satisfied from the felt sense of having shipped. **Thirteen releases were ticked against it while exactly one pull request existed in that span** (`D-M5E17-5`). That is the `CLAIM-INTEGRITY-ANALYSIS.md` class, and a checkbox is not fixable by wording: it had to start reading an artifact.*
- [ ] Git history is clean and meaningful
- [ ] CHANGELOG updated
- [ ] README updated (if applicable)
- [ ] All CI checks pass
- [ ] User approves PR for merge — **unconditional at every `attention` level.** This box is a **floor** (`ship-pr` in `FLOORS`, `tools/lib/drive.js`), not a tier-gated ask: merge is delivery (`D-M5E17-5`). The other four phase-approval boxes became conditional in `B74`; **this one did not, deliberately** — do not "fix" the inconsistency. An autonomy layer that quietly cleared this would re-litigate `D-M5E17-5` by omission, which is how `ship.md` came to carry a self-exemption that survived thirteen releases.

### Final Anti-Rationalization

Before marking SHIP complete, read the anti-rationalization reference:
`${CLAUDE_PLUGIN_ROOT}/references/anti-rationalization.md`

Ask yourself: "Am I shipping this because it's ready, or because I'm tired of working on it?"
