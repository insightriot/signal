# Signal — Project State

Meta-state of the Signal build. Not to be confused with the `.planning/` that Signal's own commands will write in *user* projects once it's functional — this one is for building Signal itself.

## Current Tranche

**Tranche 2 — MVP Functional — COMPLETE** (all 8 steps done as of 2026-04-25). Tranche 3 is next.

See `TRANCHE-2.md` for the final state; `TRANCHE-3.md` for what's next.

## Completed

- **Pre-Tranche — Attribution cleanup** (2026-04-22): rewrote `PROJECT.md`, `CLAUDE.md`, `LICENSES.md`, `plugin.json`, `marketplace.json`, `package.json` to acknowledge all 9 source repos with Ported / Planned / Pattern-source / Reference tiers. Committed.
- **Pre-Tranche — `.planning/` scaffold** (2026-04-22): created this directory; un-ignored `.planning/` in `.gitignore`. Committed.
- **Tranche 1, Step 1 — Manifest rebrand** (2026-04-22): `name` fields changed to `signal` in 4 places. Repo URLs deferred (initially), then resolved in end-of-session work: GitHub repo renamed `dev-skills-gsd` → `signal`, local remote + all manifest URLs updated. Committed.
- **Tranche 1, Step 2 — Plugin manifest parts** (2026-04-22): resolved as no-op. Claude Code auto-discovers agents/, skills/, hooks/. References/ is ad-hoc. Committed.
- **Tranche 1, Step 3 — npm install + tests + validator** (2026-04-22): 135 packages, 19 tests passing, validator green. Committed (via `tools/validate-plugin.js`).
- **Tranche 1, Step 4 — Scope formalization** (2026-04-22): added "Scope & Roadmap" section to PROJECT.md; CLAUDE.md forward-looking note updated. Committed.
- **Tranche 1, Step 5 — PROFILE.md schema + tier definitions** (2026-04-22): wrote `references/profile-schema.md` and `references/tier-definitions.md`. Schema locked in DECISIONS.md. Committed (`0c5ead6`).
- **Tranche 2, Step 1 — `/sig:calibrate` complete** (2026-04-22 → 2026-04-24): wrote `.claude/commands/sig/calibrate.md` — pre-flight detects 3 scenarios (new project / first calibration / existing PROFILE.md with 4 sub-paths), 5 diagnostic questions with strict enum parsing, tier derivation (FULL / SPIKE / SKETCH / FEATURE), PROFILE.md writer with all 10 rigor_overrides inlined per tier, up/down override handling (downward = warn, upward = brief-confirm with cost implications), `escalation_history` preserved on `--re-calibrate`, anti-rationalization table, gate checklist. Auto-discovered by Claude Code. 19/19 tests pass; validator green. Self-test traced against all 5 scenarios in TRANCHE-2 Step 1.

  Surrounding design decisions logged: `FUTURE-IDEAS.md` (new — calibration granularity options A/B/C with C as the lean; multi-feature project lifecycle), `TRANCHE-3.md` (promoted `/sig:status` + `/sig:resume` to committed Task 1), `OPEN-QUESTIONS.md` (logged Socratic question-pattern codification, resolve before T2 Step 3).

- **Tranche 2, Step 2 — `/sig:escalate` complete** (2026-04-24): wrote `.claude/commands/sig/escalate.md` — pre-flight requires existing PROFILE.md, re-asks 5 questions with prior answers as defaults, derives new tier with same rules, three-case comparison (same/escalation-up/de-escalation), backfill warnings table (5 rows including Nyquist permanent-gap row), appends to `escalation_history` (preserves `created_at` and `created_by`), markdown body section per escalation. **All 9 sig commands now exist on disk.** Tests 19/19, validator green, auto-discovered.

  Architectural insight surfaced: **strict Nyquist is a one-way ratchet — only forward work can achieve it; pre-escalation commits hold permanent quality gaps that no command can recover.** Documented in `references/tier-definitions.md` (new "Recoverable vs. permanent backfills" subsection) and surfaced in `escalate.md`'s Nyquist backfill warning. Reinforces why `/sig:calibrate`'s 5 questions matter — under-tiering creates irrecoverable cost, not just deferrable work.

- **Tranche 2, Step 4 — state.js + profile helpers** (2026-04-24): added `CALIBRATE` to `PHASES` in `tools/lib/state.js`. New `tools/lib/profile.js` exports `readProfile(baseDir)` (parses + strict-validates `.planning/PROFILE.md` frontmatter against the schema in `references/profile-schema.md`; throws `ProfileSchemaError` on any violation), `isPhaseEnabled(profile, phaseName)` (CALIBRATE always true, otherwise checks `phases_skipped`), and `applyRigorOverrides(config, profile)` (returns a new merged config with `rigor_overrides` attached + obvious legacy-key correspondences for `workflow.*`, `gates.*`, `parallelization.max_concurrent_agents`; non-mutating). Added `yaml@^2.8.3` as a runtime dependency (real parser since `escalation_history` carries nested arrays of objects with quoted strings). 28 new tests in `tests/profile.test.js`. Total 47/47 passing, validator green.

- **Tranche 2, Steps 5 + 5a — naming drift, validator updates, .planning/-always-tracked enforcement** (2026-04-25):
  - **Orphan-skill audit & bindings.** 4 orphan skills bound to phases (interim, pending v2 PREPARE-phase decision): `api-and-interface-design` → `plan`; `deprecation-and-migration` → `plan` + `ship`; `frontend-ui-engineering` → `execute`; `source-driven-development` → `execute`. PLAN goes 1 → 3 skills, EXECUTE 3 → 5, SHIP 4 → 5. The 5th unbound skill `using-agent-skills` is meta — correctly not phase-bound.
  - **PREPARE phase candidate logged.** During the audit, an ODI (Outcome-Driven Innovation) Universal Job Map parallel surfaced — Signal collapses ODI's *Locate* (research) and *Prepare* (set up scaffolding, fetch docs, verify framework patterns) into PLAN's tail. Two of the four orphans (especially `source-driven-development`, partially `api-and-interface-design`) are *prep* skills with no clean home in v1's phase decomposition. Added a long-form entry to `FUTURE-IDEAS.md` proposing a v2 PREPARE phase between PLAN and EXECUTE, with three concrete promotion triggers (token-budget signal in PLAN, repeated user-language friction at the seam, two+ new skills landing homeless). v1 stays at 6 phases.
  - **Naming reconciliation.** `references/testing-patterns.md` → `references/testing-checklist.md` (matches family naming: security-checklist, performance-checklist, accessibility-checklist). Updated all references (LICENSES.md, test-driven-development SKILL.md). Used `git mv` to preserve history.
  - **Validator updates.** `validate-plugin.js` now requires `calibrate.md` + `escalate.md` (REQUIRED_COMMANDS) and `profile-schema.md` + `tier-definitions.md` (REQUIRED_FILES).
  - **.planning/-always-tracked.** Added `Step 0 — .gitignore check` to `/sig:new-project.md` (mirrors the existing pattern in `/sig:calibrate.md` Step 1b). README one-liner deferred to TRANCHE-3 Task 4 (where the README itself will be written) — explicit checkbox added there.
  - **OPEN-QUESTIONS cleanup.** Removed the resolved orphan-skill question. Decision logged in `DECISIONS.md` (2026-04-25 entry).
  - 47/47 tests still passing, validator green.

- **Tranche 2, Step 3 — preamble pass + question-pattern convention** (2026-04-25):
  - **Question-pattern convention locked.** Wrote `references/question-patterns.md` codifying three shapes: strict enum (calibrate's 5 questions; correctness constraint), 3-options-plus-other (default for tradeoff questions), open-ended (rare; for genuine clarification at workflow openings). Strictness convention: **strongly recommended with explicit justification for exceptions**. Strict enums mandatory where schema requires; 3+other default for tradeoffs; open-ended is the rare case. Decision logged in DECISIONS.md (2026-04-25 entry); Socratic OPEN-QUESTION resolved and removed.
  - **Preamble + rigor table added to all 6 phase commands.** Each command now opens with "0. Tier-gating preamble" that (a) reads PROFILE.md (halts if missing), (b) exits if phase is in `phases_skipped` (with next-step message), (c) applies phase-specific `rigor_overrides`. Each command has a customized rigor table mapping the relevant overrides — DISCUSS (gate_strictness), PLAN (research_parallelism, plan_validation_dims, nyquist_enforcement, gate_strictness), EXECUTE (tdd_required, context_rot_reread, gate_strictness), VERIFY (nyquist_enforcement with permanent-gap warning, gate_strictness), REVIEW (review_depth, security_audit, performance_pass, simplification_pass, gate_strictness — most overrides), SHIP (gate_strictness).
  - **Question-pattern retrofits.** DISCUSS Step 4 made explicit: exactly 3 named options + recommendation + "other" with verbatim capture into CONTEXT.md. VERIFY's "Loop Back" retrofitted from prescriptive ("return to EXECUTE") to 3+other (loop-back / escalate-tier / accept-failure-with-documented-limit) with recommendation per loop-count.
  - **Skill loading updated.** PLAN now loads api-and-interface-design + deprecation-and-migration. EXECUTE adds source-driven-development + frontend-ui-engineering (with conditional-loading note pointing to FUTURE-IDEAS.md). SHIP adds deprecation-and-migration. Reflects the Step 5 binding decisions.
  - 47/47 tests still passing; validator green.

- **Tranche 2, Step 7 — phase token-cost measurement** (2026-04-25): wrote `tools/measure-phase-costs.js`. All 6 phases within budget; largest is EXECUTE at 12,761 tokens (6.4% of 200K). REVIEW at 5.2% — original "highest risk" framing was overcautious. PLAN at 3.3% with 3 skills — PREPARE-phase token-budget trigger NOT firing (FUTURE-IDEAS updated). Loader bug surfaced and fixed: `findSkillPath` searches all skill phase directories so cross-bound skills load correctly. 6 new tests; 53/53 passing.

- **Tranche 2, Step 6 — agent count reconciliation** (2026-04-25): audit found 22 agents on disk (the OPEN-QUESTIONS "17" count was stale). PROJECT.md claimed 24 but contained two errors — Security Auditor double-counted (in both 3.3 GSD verification and 3.4 Agent Skills specialists), plus Doc Writer + Doc Verifier never written. Decision: revise spec to 22 (drop the docs agents — already covered by `documentation-and-adrs` SHIP-phase skill; same skill-not-agent pattern compound-engineering uses). PROJECT.md sections 3.0/3.3/3.5/Gate 2 updated; CLAUDE.md updated.

- **Tranche 2, Step 8 — paper walkthrough** (2026-04-25): structural smoke test (real execution deferred to TRANCHE-3 Tasks 2+3 where fresh-project setup, real time/token measurement, and full execution time naturally live). Findings: PLAN's skill-loading paths were wrong for cross-bound skills (fixed inline); references all resolve; skill-binding consistency holds; 3 friction points logged to OPEN-QUESTIONS for TRANCHE-3: `{phase}-` artifact naming convention, REVIEW/SHIP not explicitly reading prior-phase artifacts, state.js initState phase-name mismatch.

## Active

**TRANCHE 2 COMPLETE.** All 8 steps done; PROFILE.md → phase behavior is fully wired; calibration layer has teeth.

**Next: TRANCHE 3 — Ready for Real-Project Testing.** See `TRANCHE-3.md`. Tasks:
1. Build `/sig:status` and `/sig:resume` (one via Signal itself, one hand-rolled — chicken-and-egg loop avoidance).
2. FULL-tier pass on a throwaway sample project (real E2E test).
3. SKETCH-tier pass — the critical validation that calibration actually drops rigor.
4. Write README quickstart (carries the `.planning/`-always-committed one-liner from T2 Step 5a).
5. Triage T2 outstanding issues from OPEN-QUESTIONS.md.

## Blockers

None.

## Last Updated

2026-04-25
