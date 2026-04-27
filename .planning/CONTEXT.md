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

Hand-rolled `.planning/` (this directory) drives the build. **No GSD install.** Once `/sig:calibrate`, `/sig:discuss`, `/sig:plan` are functional (late Tranche 2 / early Tranche 3), switch to dogfooding Signal on itself.

**`.planning/` is always tracked in git** — here and in every user project Signal touches. Never add it to `.gitignore`. It's the project's memory, not scratch state. See `DECISIONS.md` for the full principle.

## Current state

**TRANCHE 4 nearly complete (2026-04-27) — `/sig:init` brownfield onboarding feature-complete on the markdown + code layer.** 14 of 16 tasks shipped: skeleton + 5-state pre-flight, 4 parallel scanner agents, LANDSCAPE.md synthesizer + landscape.js helpers, baseline PROJECT.md generator, STATE.md handoff, brownfield awareness in `/sig:status` / `/sig:resume` / `/sig:calibrate` Scenario A, validator updates, Signal-on-Signal dogfood (validated synthesis pipeline; surfaced F2 blocker — agent-spawn registration in dev mode — with documented fallback path), README brownfield walkthrough + tier-definitions brownfield calibration patterns. Tests 96 → 126.

**TRANCHE 3 closed 2026-04-26 — v1 ship-ready** (separate effort that produced the original 11 commands + dogfood passes). v0.1.0 tag pending until F2 marketplace-install validation.

**Path forward (2026-04-27):** the two remaining TRANCHE-4 tasks are **T4.8 (assumption surfacing UX)** and **T4.13 (fixture tests)** — both v0.1.1 candidates, neither blocking ship. T4.8 has the most user-facing value; T4.13 is internal hardening. **T4.8 has a detailed design entry in TRANCHE-4.md (Wave 4 section); start there for the next session.**

- **12 slash commands shipped** (`/sig:new-project`, `/sig:init` (new in T4), `/sig:calibrate`, `/sig:discuss`, `/sig:plan`, `/sig:execute`, `/sig:verify`, `/sig:review`, `/sig:ship`, `/sig:escalate`, `/sig:status`, `/sig:resume`).
- **26 agent files** = 22 from prior tranches + 4 new scanner agents (stack / structure / activity / quality) under `agents/scanners/`.
- 21 skill files (unchanged from T3).
- **6 tool libs** = 5 prior + `tools/lib/landscape.js` (new in T4 Wave 3).
- **Question-pattern convention locked** (T2 Step 3) — strict enum / 3+other / open-ended. T4.8 will use the same convention for marker walkthroughs.
- PROFILE.md schema + tier-to-defaults + override handling + escalation history all locked from prior tranches.
- **`/sig:init` adds the LANDSCAPE.md + baseline PROJECT.md + scan/*.md artifacts** to the `.planning/` shape. Greenfield projects (`/sig:new-project`) don't have these; only brownfield-init'd projects do.
- **Validator** requires `calibrate.md` + `escalate.md` + `init.md` + `profile-schema.md` + `tier-definitions.md` + the 4 scanner agents (`agents/scanners/*-scanner.md`).
- **F2 unknown:** plugin agent registration mechanism + namespacing convention post-marketplace-install — gates v0.1.0 ship; has a documented fallback path in init.md Step 2 so the command works regardless. See DECISIONS.md (2026-04-26 — "scanner-spawn fallback path locked").
- **126 tests passing** (state + context-monitor + profile + status + landscape — 25 new in T4 Wave 3, 5 new readLandscapeMeta tests, 1 read-only-contract update); validator green.

## Active work

**TRANCHE 4 mostly done.** 14 of 16 tasks shipped (see `TRANCHE-4.md`):
1. ✓ T4.1 — `/sig:init` skeleton + 5-state pre-flight.
2. ✓ T4.2–T4.5 — 4 scanner agents (stack / structure / activity / quality).
3. ✓ T4.6 — LANDSCAPE.md synthesizer + landscape.js helpers.
4. ✓ T4.7 — Baseline PROJECT.md generator with `[INFERRED]` / `[FILL IN]` markers.
5. **○ T4.8 — Assumption surfacing UX** (deferred → designed in TRANCHE-4.md ready for next session).
6. ✓ T4.9 — STATE.md init + brownfield-aware handoff.
7. ✓ T4.10–T4.12 — `/sig:status`, `/sig:resume`, `/sig:calibrate` Scenario A all surface LANDSCAPE.md awareness.
8. **○ T4.13 — Fixture tests** (deferred → v0.1.1 candidate).
9. ✓ T4.14 — Validator updates (REQUIRED_COMMANDS + REQUIRED_AGENTS + REQUIRED_DIRS).
10. ✓ T4.15 — Signal-on-Signal dogfood. Synthesis pipeline validated; 4 fix-nows applied; F2 blocker logged with fallback path. Full runlog at `.dogfood/T4-INIT-DOGFOOD/RUNLOG.md` (gitignored — won't survive context clear; key findings preserved in DECISIONS.md and STATE.md).
11. ✓ T4.16 — README brownfield section + tier-definitions brownfield calibration patterns.

Two open architectural items, both logged for next session:
- **T4.8 next priority** — designed in TRANCHE-4.md Wave 4. The fresh session should: read CONTEXT → STATE → TRANCHE-4 (T4.8 entry has the walkthrough order, per-marker question shape, capture rules), then implement init.md Step 5.
- **F2 marketplace validation** — external blocker for v0.1.0 publish (not a TRANCHE-4 task; needs publish-then-test cycle).

## Key files

- `.planning/PROJECT.md` — the full v1 spec
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` — the v2 vision
- `CLAUDE.md` — project instructions
- `.planning/TRANCHE-{1,2,3,4,5}.md` — scoped work plans (TRANCHE-4 = `/sig:init` brownfield onboarding, mostly done; TRANCHE-5 = v2 ports, gated)
- `.planning/DECISIONS.md` — append-only architecture decisions
- `.planning/OPEN-QUESTIONS.md` — unresolved design questions (v1-scoped)
- `.planning/FUTURE-IDEAS.md` — post-v1 architectural evolutions of Signal's own mechanisms (distinct from TRANCHE-5's rundown-v2 integrations)
- `.planning/STATE.md` — what tranche we're in, active, blocked

**Authoritative references (in `references/`):**
- `profile-schema.md` — PROFILE.md format + validation rules
- `tier-definitions.md` — 4-tier definitions + tier-to-defaults table + escalation paths + brownfield calibration patterns (added in T4.16)
- `question-patterns.md` — three question shapes (strict enum / 3+other / open-ended) — **especially relevant for T4.8**
- `anti-rationalization.md` — anti-rationalization patterns

**Tooling (in `tools/`):**
- `lib/state.js` — `initState`, `readState`, `transitionPhase`, `checkGateArtifacts`, `PHASES`
- `lib/profile.js` — `readProfile`, `isPhaseEnabled`, `applyRigorOverrides`, `ProfileSchemaError`
- `lib/landscape.js` — `readScan`, `readAllScans`, `extractSection`, `extractField` (consumed by `/sig:init` Step 3 synthesis)
- `lib/status.js` — `nextActionForPhase`, `readOpenQuestions`, `formatEscalationSummary`, `reachedDoneViaSkip`, `readLandscapeMeta`
- `lib/context-monitor.js` — `estimateTokens`, `checkContextBudget`, `findSkillPath`, `estimatePhaseSkillCost`
- `lib/skill-loader.js` — skill resolution
- `validate-plugin.js` — `npm run validate`
- `measure-phase-costs.js` — token-cost measurement (`node tools/measure-phase-costs.js`)

## How to start a session

1. Re-read this file (CONTEXT.md) + STATE.md.
2. Read the current tranche file (TRANCHE-{n}.md) for the task list.
3. Glance at OPEN-QUESTIONS.md to see what needs deciding soon.
4. Pick up the first un-checked task.

**Specifically for the next session:** TRANCHE-4 task **T4.8 (assumption surfacing UX)** is the queued-up next task. Its design lives in `TRANCHE-4.md` Wave 4 (T4.8 entry has the full spec — walkthrough order, per-marker question shape, capture rules). The implementation work is to replace the `/sig:init` Step 5 placeholder with the designed walkthrough, add tests, and dogfood-validate.

Pre-reads for the T4.8 session:
1. `CONTEXT.md` (this file) + `STATE.md` (status)
2. `TRANCHE-4.md` Wave 4 — T4.8 design spec (the actionable plan)
3. `.claude/commands/sig/init.md` — the command being modified (Step 5 is the target)
4. `references/question-patterns.md` — the convention for the walkthrough's prompts
5. `tools/lib/landscape.js` — helpers `extractSection`/`extractField` may be useful for parsing PROJECT.md markers

---

*Last updated: 2026-04-27 (TRANCHE 4 mostly complete — T4.8 + T4.13 deferred for next session; T4.8 design ready in TRANCHE-4.md)*
