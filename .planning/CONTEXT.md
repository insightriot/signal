# Signal — Fresh-Session Context

Load this at the start of every work session. Short on purpose.

---

## Project

**Signal** (market-facing: *SignalOS*) — a Claude Code plugin that integrates patterns from the Claude Code plugin ecosystem with a project-complexity calibration router. Command prefix: `/sig:`.

## Scope (locked)

- **v1** = 6-phase MVP (`calibrate → discuss → plan → execute → verify → review → ship` + `escalate`). Currently being built.
- **v2** = 10-phase expansion (adds ideate/validate/strategize upstream + compound downstream). Follow-on, after v1 ships and validates.

See `DECISIONS.md` for full rationale.

## Attribution (locked)

9 source repos in 4 tiers:
- **Ported (v1):** GSD, Agent Skills.
- **Planned (v2):** gstack, pm-skills, superpowers, compound-engineering.
- **Pattern source:** planning-with-files, oh-my-claudecode.
- **Reference:** GSD Skill Creator.

See `LICENSES.md` for details.

## Build approach (locked)

Hand-rolled `.planning/` (this directory) drives the build. **No GSD install.** Once `/sig:calibrate`, `/sig:discuss`, `/sig:plan` are functional (late Milestone 2 / early Milestone 3), switch to dogfooding Signal on itself.

**`.planning/` is always tracked in git** — here and in every user project Signal touches. Never add it to `.gitignore`. It's the project's memory, not scratch state. See `DECISIONS.md` for the full principle.

## Current state

**MILESTONE 4 complete (2026-05-12) — `/sig:init` brownfield onboarding shipped + vocabulary refactor (M4.t18) shipped.** 18 of 18 tasks shipped: skeleton + 5-state pre-flight, 4 parallel scanner agents, LANDSCAPE.md synthesizer + landscape.js helpers, baseline PROJECT.md generator, PROJECT.md walkthrough (M4.t8 — Step 5 assumption surfacing), STATE.md handoff, brownfield awareness in `/sig:status` / `/sig:resume` / `/sig:calibrate` Scenario A, validator updates, Signal-on-Signal dogfood (synthesis pipeline validated; F2 blocker logged with fallback path), README brownfield walkthrough + tier-definitions brownfield calibration patterns, fixture-based regression tests (M4.t13), AskUserQuestion wired into decision-gathering commands (M4.t17), and **Tranche → Milestone vocabulary refactor (M4.t18, 2026-05-12)**. Tests 96 → 169.

**MILESTONE 3 closed 2026-04-26 — v1 ship-ready** (separate effort that produced the original 11 commands + dogfood passes). v0.1.0 tag pending only on F2 marketplace-install validation.

**Path forward (2026-05-12):** v0.1.0 publish gated on a single external item: F2 (plugin-agent registration mechanism + namespacing post-marketplace-install). All internal blockers cleared.

- **12 slash commands shipped** (`/sig:new-project`, `/sig:init` (new in M4), `/sig:calibrate`, `/sig:discuss`, `/sig:plan`, `/sig:execute`, `/sig:verify`, `/sig:review`, `/sig:ship`, `/sig:escalate`, `/sig:status`, `/sig:resume`).
- **26 agent files** = 22 from prior milestones + 4 new scanner agents (stack / structure / activity / quality) under `agents/scanners/`.
- 21 skill files (unchanged from M3).
- **7 tool libs** = 5 prior + `tools/lib/landscape.js` (M4 Wave 3) + `tools/lib/walkthrough.js` (M4.t8 — `countMarkers`, `appendNote`).
- **Question-pattern convention locked** (M2 Step 3) — strict enum / 3+other / open-ended. M4.t8 uses 3+other for `[INFERRED]` markers and open-ended-or-defer for `[FILL IN]` markers.
- PROFILE.md schema + tier-to-defaults + override handling + escalation history all locked from prior milestones.
- **`/sig:init` adds the LANDSCAPE.md + baseline PROJECT.md + scan/*.md artifacts** to the `.planning/` shape. Greenfield projects (`/sig:new-project`) don't have these; only brownfield-init'd projects do.
- **Validator** requires `calibrate.md` + `escalate.md` + `init.md` + `profile-schema.md` + `tier-definitions.md` + the 4 scanner agents (`agents/scanners/*-scanner.md`).
- **F2 unknown:** plugin agent registration mechanism + namespacing convention post-marketplace-install — gates v0.1.0 ship; has a documented fallback path in init.md Step 2 so the command works regardless. See DECISIONS.md (2026-04-26 — "scanner-spawn fallback path locked").
- **169 tests passing** (state + context-monitor + profile + status + landscape + walkthrough + init-fixtures — 21 new in M4.t13); validator green. M4.t18 was a docs-only refactor — no helper code touched, all tests still pass.
- **Vocabulary locked (M4.t18, 2026-05-12):** Milestone (M1, M2, …) → Epic (M5.E1, …; optional mid-layer) → Task (M4.t17, M5.E3.t2; lowercase `t`). Phase, Wave unchanged. ID is persistent identity, never changes. Full table in `PROJECT.md` § Vocabulary; rationale in `DECISIONS.md` 2026-05-12 entry; downstream-project migration prompt at `docs/migration-vocab-v0.1.0.md`.

## Active work

**MILESTONE 4 nearly done.** 15 of 16 tasks shipped (see `MILESTONE-4.md`):
1. ✓ M4.t1 — `/sig:init` skeleton + 5-state pre-flight.
2. ✓ M4.t2–M4.t5 — 4 scanner agents (stack / structure / activity / quality).
3. ✓ M4.t6 — LANDSCAPE.md synthesizer + landscape.js helpers.
4. ✓ M4.t7 — Baseline PROJECT.md generator with `[INFERRED]` / `[FILL IN]` markers.
5. ✓ M4.t8 — Assumption-surfacing walkthrough in `/sig:init` Step 5 (zero-marker skip, locked field order, 3+other for INFERRED, open-ended-or-defer for FILL-IN, capture rules with Notes-history append). Bundled a Node-22 regex portability fix in landscape.js (`(?m:...)` inline modifier needed V8 12.7+).
6. ✓ M4.t9 — STATE.md init + brownfield-aware handoff.
7. ✓ M4.t10–M4.t12 — `/sig:status`, `/sig:resume`, `/sig:calibrate` Scenario A all surface LANDSCAPE.md awareness.
8. **○ M4.t13 — Fixture tests** (deferred → v0.1.1 candidate; only remaining MILESTONE-4 task).
9. ✓ M4.t14 — Validator updates (REQUIRED_COMMANDS + REQUIRED_AGENTS + REQUIRED_DIRS).
10. ✓ M4.t15 — Signal-on-Signal dogfood. Synthesis pipeline validated; 4 fix-nows applied; F2 blocker logged with fallback path. Full runlog at `.dogfood/M4-INIT-DOGFOOD/RUNLOG.md` (gitignored — won't survive context clear; key findings preserved in DECISIONS.md and STATE.md).
11. ✓ M4.t16 — README brownfield section + tier-definitions brownfield calibration patterns.

Two soft follow-ups, neither blocking ship:
- **M4.t13 fixture tests** — Node / Python / dormant-project synthesizer fixtures. v0.1.1 candidate.
- **M4.t8 conversational dogfood** — exercise the new walkthrough against a real brownfield run; surface fatigue/phrasing issues. Can ride the next /sig:init dogfood pass.

**Single external blocker for v0.1.0 publish:** F2 marketplace-install validation (plugin-agent registration mechanism + namespacing). Not a MILESTONE-4 task; needs publish-then-test cycle.

## Key files

- `.planning/PROJECT.md` — the full v1 spec
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` — the v2 vision
- `CLAUDE.md` — project instructions
- `.planning/MILESTONE-{1,2,3,4,5}.md` — scoped work plans (MILESTONE-4 = `/sig:init` brownfield onboarding, mostly done; MILESTONE-5 = v2 ports, gated)
- `.planning/DECISIONS.md` — append-only architecture decisions
- `.planning/OPEN-QUESTIONS.md` — unresolved design questions (v1-scoped)
- `.planning/FUTURE-IDEAS.md` — post-v1 architectural evolutions of Signal's own mechanisms (distinct from MILESTONE-5's rundown-v2 integrations)
- `.planning/STATE.md` — what milestone we're in, active, blocked

**Authoritative references (in `references/`):**
- `profile-schema.md` — PROFILE.md format + validation rules
- `tier-definitions.md` — 4-tier definitions + tier-to-defaults table + escalation paths + brownfield calibration patterns (added in M4.t16)
- `question-patterns.md` — three question shapes (strict enum / 3+other / open-ended) — **especially relevant for M4.t8**
- `anti-rationalization.md` — anti-rationalization patterns

**Tooling (in `tools/`):**
- `lib/state.js` — `initState`, `readState`, `transitionPhase`, `checkGateArtifacts`, `PHASES`
- `lib/profile.js` — `readProfile`, `isPhaseEnabled`, `applyRigorOverrides`, `ProfileSchemaError`
- `lib/landscape.js` — `readScan`, `readAllScans`, `extractSection`, `extractField` (consumed by `/sig:init` Step 3 synthesis)
- `lib/walkthrough.js` — `countMarkers`, `appendNote` (consumed by `/sig:init` Step 5 walkthrough)
- `lib/status.js` — `nextActionForPhase`, `readOpenQuestions`, `formatEscalationSummary`, `reachedDoneViaSkip`, `readLandscapeMeta`
- `lib/context-monitor.js` — `estimateTokens`, `checkContextBudget`, `findSkillPath`, `estimatePhaseSkillCost`
- `lib/skill-loader.js` — skill resolution
- `validate-plugin.js` — `npm run validate`
- `measure-phase-costs.js` — token-cost measurement (`node tools/measure-phase-costs.js`)

## How to start a session

1. Re-read this file (CONTEXT.md) + STATE.md.
2. Read the current milestone file (MILESTONE-{n}.md) for the task list.
3. Glance at OPEN-QUESTIONS.md to see what needs deciding soon.
4. Pick up the first un-checked task.

**Specifically for the next session:** MILESTONE-4 is one task away from done — only **M4.t13 (fixture tests)** remains, and it's a v0.1.1 candidate that doesn't block ship. Higher-leverage next moves are either (a) marketplace-install validation (gates v0.1.0 ship), or (b) start MILESTONE-5 v2 ports (gated on real-user signal — see PROJECT.md Scope & Roadmap).

If continuing M4 polish: re-run `/sig:init` end-to-end on a fresh brownfield target to dogfood the new M4.t8 walkthrough conversationally (Wave 4 success-criterion #8). Surface any phrasing fatigue or missed-edge cases.

---

*Last updated: 2026-04-27 (M4.t8 shipped: assumption-surfacing walkthrough live; tools/lib/walkthrough.js + 22 tests added; landscape.js Node-22 regex fix bundled; only M4.t13 fixtures remain in MILESTONE-4)*
