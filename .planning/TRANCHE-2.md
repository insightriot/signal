# Tranche 2 — MVP Functional

**Goal:** Make all 9 slash commands real and make tier routing actually route.

**Estimated effort:** 3–5 days focused.

**Done when:** PROJECT.md Gate 2 (Core Workflow Functional) is achievable — all commands execute, PROFILE.md gates downstream phases, anti-rationalization fires.

**Blocked by:** Tranche 1 complete.

**Note:** Task list may evolve as Tranche 1 surfaces new constraints (especially around PROFILE.md schema and plugin manifest discovery behavior).

---

## Tasks

### 1. Write `/sig:calibrate` (Phase 0)

Smallest command. No skills, no agents. Just 5 questions → tier → YAML write.
- [ ] Draft `.claude/commands/sig/calibrate.md`
- [ ] 5 diagnostic questions: Scope, Stakes, Novelty, Reversibility, Horizon
- [ ] Stakes × Novelty 2×2 → tier mapping
- [ ] Write to `.planning/PROFILE.md` following the Tranche 1 schema
- [ ] Self-test: run against a hypothetical project, verify PROFILE.md is valid per the schema

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
