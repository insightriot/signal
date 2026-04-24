# Tranche 2 — MVP Functional

**Goal:** Make all 9 slash commands real and make tier routing actually route.

**Estimated effort:** 3–5 days focused.

**Done when:** PROJECT.md Gate 2 (Core Workflow Functional) is achievable — all commands execute, PROFILE.md gates downstream phases, anti-rationalization fires.

**Blocked by:** Tranche 1 complete.

**Note:** Task list may evolve as Tranche 1 surfaces new constraints (especially around PROFILE.md schema and plugin manifest discovery behavior).

---

## Status (as of 2026-04-24)

| Step | State | Notes |
|---|---|---|
| 1. `/sig:calibrate` | **DONE** | Committed `f0f3e0b`. All 5 self-test scenarios pass. |
| 2. `/sig:escalate` | **DONE** | Pre-flight, re-ask, derivation, 3-case comparison, backfill table (5 rows incl. Nyquist permanent-gap), history append. |
| 3. "Read PROFILE.md first" preamble on 6 phase commands | **BLOCKED** | Gated on Socratic question-pattern OPEN-QUESTION (see top entry of `OPEN-QUESTIONS.md`). Resolve that first, then this becomes mechanical. |
| 4. `state.js` + `readProfile` / `isPhaseEnabled` / `applyRigorOverrides` helpers | **NEXT** | Pure tooling; no dependencies. Add tests alongside `state.test.js`. |
| 5. Naming drift + `validate-plugin.js` REQUIRED_COMMANDS / REQUIRED_FILES update | Pending | Includes orphan-skill audit and `testing-patterns.md` vs. `testing-checklist.md` reconciliation. |
| 5a. `.planning/`-always-tracked enforcement in user-facing commands | Pending | `/sig:new-project` and `/sig:calibrate` already do this; mirror the pattern in any other command that writes to `.planning/`. README/quickstart one-liner. |
| 6. Agent count reconciliation (17 on disk vs. 24 in spec) | Pending | Audit, decide which to write vs. revise spec. |
| 7. REVIEW phase token-cost measurement | Pending | Run `estimatePhaseSkillCost('review')`; record in `DECISIONS.md`; chunk loader if over budget. |
| 8. End-to-end self-test on a sample throwaway project | Pending | Validates the whole flow from `/sig:new-project` through `/sig:ship`. |

**Order to execute:** 4 → (resolve Socratic OPEN-QUESTION) → 3 → 5 → 5a → 6 → 7 → 8.

---

## Tasks

### 1. Write `/sig:calibrate` (Phase 0) — **READY TO START**

Smallest command in the entire plugin. No skills loaded, no agents spawned. Just 5 questions → tier → YAML write. Phase 0 is what makes Signal distinct from "GSD + Agent Skills stapled together," so getting this right is load-bearing.

**Inputs (already locked from Tranche 1):**
- `references/profile-schema.md` — authoritative PROFILE.md format + validation rules
- `references/tier-definitions.md` — 4 tiers, diagnostic question → tier mapping logic, full defaults table
- Existing `.claude/commands/sig/` commands — use the same frontmatter + structure conventions

**Deliverable:** `.claude/commands/sig/calibrate.md`

**Structure to produce:**

```yaml
---
name: sig:calibrate
description: "Phase 0 — classify project into SKETCH / FEATURE / SPIKE / FULL and write .planning/PROFILE.md to drive downstream rigor."
args: "[--re-calibrate]"
---
```

Body sections, in order:

1. **Pre-flight check.** Verify `.planning/` exists (create if missing). If `PROFILE.md` already exists and `--re-calibrate` was not passed, refuse and suggest `/sig:escalate` or `--re-calibrate`. **Also check that the user's `.gitignore` does not ignore `.planning/`** — if it does, warn and offer to remove that line. (Per DECISIONS.md: `.planning/` must always be tracked.)
2. **Ask the 5 diagnostic questions,** one at a time, using the exact enum values from `profile-schema.md`:
   - **Scope:** `throwaway` / `feature` / `subsystem` / `product`
   - **Stakes:** `none` / `minor` / `major` / `catastrophic`
   - **Novelty:** `familiar` / `rare` / `first-for-org` / `first-in-industry`
   - **Reversibility:** `trivial` / `moderate` / `painful` / `irreversible`
   - **Horizon:** `hours` / `days` / `months` / `years`
3. **Derive tier** using the logic in `tier-definitions.md`:
   - **FULL** if any of: `stakes: catastrophic`, `reversibility: irreversible`, `horizon: years`
   - Else **SPIKE** if all of: stakes in `{none, minor}` AND novelty in `{first-for-org, first-in-industry}` AND horizon in `{hours, days}` AND scope in `{throwaway, feature}`
   - Else **SKETCH** if all of: `scope: throwaway`, `stakes: none`, `reversibility: trivial`, `horizon in {hours, days}`
   - Else **FEATURE** (default)
4. **Show user the derived tier + defaults,** ask for confirmation. Allow manual override (with warning) — they can force SKETCH on what calibrates as FULL, but Signal notes the risk.
5. **Write `.planning/PROFILE.md`** — YAML frontmatter with all 10 rigor_overrides fields written literally (from the tier-to-defaults table in `tier-definitions.md`), plus a markdown body summarizing the calibration decision.
6. **Print next-step message:** "Profile written. Run `/sig:discuss` to continue, or `/sig:escalate` to adjust tier later."

**Anti-rationalization check** (include in command markdown):
| Temptation | Check |
|---|---|
| "I know this is a FULL project, skip the questions" | Answer the questions anyway — the 5 dimensions reveal details you may have missed |
| "This feels like SKETCH but I should just say FEATURE to be safe" | Over-tiering IS the failure mode Signal exists to prevent. Trust SKETCH when it applies |
| "I'll just skip the .gitignore check" | Without it, the project's memory gets lost on clone. Non-negotiable |

**Self-test checklist** (run after drafting):
- [ ] Run on a hypothetical FULL project (answers: subsystem / catastrophic / rare / painful / years). Verify output matches the FULL example in `profile-schema.md`.
- [ ] Run on a hypothetical SKETCH project (answers: throwaway / none / familiar / trivial / hours). Verify output matches the SKETCH example.
- [ ] Run on an edge-case FULL (answers: feature / minor / familiar / irreversible / days — FULL should still fire due to irreversibility).
- [ ] Run on a SPIKE (feature / minor / first-for-org / moderate / days).
- [ ] Open the generated PROFILE.md. Confirm YAML parses and all 10 rigor_overrides are present.

**Dependencies:** None. This is the base-case command — no skills, no agents, no prior phase state required.

**Session-pickup checklist for whoever starts next:**
1. Read this file (TRANCHE-2.md) — confirm Step 1 is still the active task.
2. Read `references/profile-schema.md` — understand what you're writing to.
3. Read `references/tier-definitions.md` — understand the mapping logic.
4. Read an existing command like `.claude/commands/sig/discuss.md` for structural convention.
5. Draft `.claude/commands/sig/calibrate.md`.
6. Run the self-test checklist.
7. Commit + update STATE.md.

### 2. Write `/sig:escalate` (escape hatch)

- [ ] Draft `.claude/commands/sig/escalate.md`
- [ ] Re-runs calibration questions carrying current context
- [ ] Updates PROFILE.md with new tier
- [ ] Appends to `escalation_history` in PROFILE.md metadata
- [ ] Warns about retroactive back-fill if rigor increased (e.g., SKETCH → FULL needs security audit on already-shipped code)

### 3. Add "read PROFILE.md first" preamble to the 6 existing phase commands

Copy-paste the same preamble into each, customized for that phase.
- [ ] `discuss.md`
- [ ] `plan.md`
- [ ] `execute.md`
- [ ] `verify.md`
- [ ] `review.md`
- [ ] `ship.md`

Each preamble does three things: (a) read `PROFILE.md`, (b) exit early if phase is in `phases_skipped`, (c) apply `rigor_overrides` to skill loading and gate strictness.

### 4. Update `state.js` and tool helpers

- [ ] Add `CALIBRATE` to the `PHASES` array in `tools/lib/state.js`
- [ ] Add `readProfile(baseDir)` helper in `tools/lib/` that parses PROFILE.md into a typed object
- [ ] Add `isPhaseEnabled(profile, phaseName)` helper
- [ ] Add `applyRigorOverrides(config, profile)` helper that merges profile overrides into the active config
- [ ] Add tests for each helper

### 5. Fix naming / bindings drift

- [ ] Audit `state/config.json` phase_bindings vs. on-disk skill files — either add orphans to bindings or remove from disk (see `OPEN-QUESTIONS.md`)
- [ ] Align `references/testing-patterns.md` with the `testing-checklist.md` name referenced in PROJECT.md 4.3 (pick one, update the other)
- [ ] Update `validate-plugin.js` REQUIRED_COMMANDS to include `calibrate` and `escalate`
- [ ] Update `validate-plugin.js` REQUIRED_FILES to include `references/profile-schema.md` and `references/tier-definitions.md`

### 5a. Enforce `.planning/` always-tracked in user projects

Per DECISIONS.md, `.planning/` must never be gitignored. Signal's `/sig:new-project` (and any command that writes to `.planning/`) must guard against this.
- [ ] Update `.claude/commands/sig/new-project.md` to check the user's `.gitignore` for a `.planning/` entry before writing anything. If found: warn, offer to remove it, and block progress until resolved.
- [ ] Same check in `/sig:calibrate` when it writes the initial `PROFILE.md`.
- [ ] Add a one-liner to any user-facing setup docs (README, quickstart): "`.planning/` should be committed — it's your project's memory, not scratch state."

### 6. Reconcile agent count

PROJECT.md claims 24 agents; 17 exist on disk. Decide direction.
- [ ] Audit: list the 7 missing agents (likely includes doc-writer, doc-verifier, and a few others). Cross-reference against GSD's full agent list.
- [ ] Decide: which are actually load-bearing vs. redundant with existing agents or with compound-engineering's lens pattern (per the rundown)?
- [ ] Either (a) write the missing agent definitions, or (b) revise PROJECT.md claims to match the reduced count.
- [ ] Update PROJECT.md Gate 2 criteria to match the final number.

### 7. Measure REVIEW phase token cost

Kill the #1 risk from PROJECT.md with data.
- [ ] Write a small Node script that calls `estimatePhaseSkillCost()` from `context-monitor.js` for the `review` phase.
- [ ] Record the number in `DECISIONS.md`.
- [ ] If > 20% of a 200K context, re-plan the loader (chunking or summarizing).
- [ ] Also measure for the other 5 phases for completeness.

### 8. End-to-end self-test

- [ ] On a throwaway sample project, run `/sig:new-project` → `/sig:calibrate` (choose FULL) → `/sig:discuss` → ... → `/sig:ship`
- [ ] Document every place the flow gets stuck in session notes
- [ ] Fix inline where possible; log to OPEN-QUESTIONS.md for later where not

---

## Exit Criteria

- [ ] All 9 slash commands exist and execute without errors
- [ ] `/sig:calibrate` writes a valid PROFILE.md that conforms to the schema
- [ ] Downstream commands respect `phases_skipped` and `rigor_overrides`
- [ ] `/sig:escalate` correctly upgrades tier and updates `escalation_history`
- [ ] Token cost for REVIEW phase is measured and within budget (documented in DECISIONS.md)
- [ ] Validator passes, tests pass

## What this unlocks

Tranche 3 can dogfood Signal on itself — switching from lightweight `.planning/` management to using Signal's own commands on Signal's own codebase.
