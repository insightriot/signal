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

**TRANCHE 2 COMPLETE (all 8 steps).** PROFILE.md → phase behavior fully wired; phase commands respect tier; orphan skills bound; agent count reconciled; token costs measured (all phases comfortably within budget); paper-walkthrough audit clean. **Next is Tranche 3 — real-project testing.**

- 9 of 9 slash commands scaffolded. **All 6 phase commands now read PROFILE.md as their first action**, exit early if the phase is in `phases_skipped`, and apply per-phase `rigor_overrides`. `calibrate`, `escalate`, and `new-project` enforce `.gitignore` doesn't ignore `.planning/`.
- 21 skill files (all bound now or correctly meta-only), **22 agent files** (PROJECT.md updated from claimed 24 → 22; 19 GSD + 3 Agent Skills specialists), **11 reference docs** (added `question-patterns.md`), **4 tool libs**.
- **Question-pattern convention locked (Step 3).** `references/question-patterns.md` defines three shapes — strict enum (calibrate's questions), 3-options-plus-other (the default for tradeoffs), open-ended (rare). Strongly-recommended-with-justification convention. DISCUSS Step 4 retrofitted to explicit 3+other; VERIFY's Loop Back retrofitted to 3+other (loop-back / escalate / accept-failure).
- **Skill bindings (Step 5).** Plan: 3 skills (was 1). Execute: 5 (was 3). Ship: 5 (was 4). Bindings written in `state/config.json`; phase commands updated to load them.
- PROFILE.md schema locked. Tier-to-defaults mapping locked. Override handling locked. Escalation history preservation locked.
- **PREPARE phase is a v2 candidate in `FUTURE-IDEAS.md`** with three explicit promotion triggers (token-budget signal in PLAN, repeated user-language friction at the seam, two+ new homeless skills). v1 stays at 6 phases.
- **`.planning/`-always-tracked enforcement (Step 5a).** Entry-point commands refuse to write if `.gitignore` would ignore `.planning/`. README one-liner deferred to TRANCHE-3 Task 4.
- **Validator** requires `calibrate.md` + `escalate.md` + `profile-schema.md` + `tier-definitions.md`.
- **Profile helpers (Step 4).** `readProfile` strictly validates. `isPhaseEnabled` treats CALIBRATE as never-skipped. `applyRigorOverrides` is non-mutating + maps to legacy keys.
- Architectural insights logged: (a) **strict Nyquist is a one-way ratchet**; (b) **ODI map reveals a missing PREPARE phase** in v1's decomposition (logged for v2).
- **53 tests passing** (state.test.js + context-monitor.test.js + profile.test.js); validator green.

## Active work

**Tranche 3 next.** Five tasks (see `TRANCHE-3.md`):
1. Build `/sig:status` and `/sig:resume` (project resumption UX — load-bearing).
2. FULL-tier pass on a throwaway sample project (the real E2E test).
3. SKETCH-tier pass — the critical validation that calibration actually drops rigor.
4. README quickstart (with `.planning/`-always-committed one-liner from T2 Step 5a).
5. Triage T2 outstanding issues from OPEN-QUESTIONS.md.

Tranche 3 dogfoods Signal on itself: build one of `/sig:status` or `/sig:resume` via Signal's own commands. The "real" end-to-end self-test (deferred from T2 Step 8) lives in T3 Tasks 2 and 3.

OPEN-QUESTIONS.md carries 3 friction points from T2 Step 8's paper walkthrough:
- `{phase}-` artifact naming (multi-phase semantics in single-phase v1)
- REVIEW/SHIP not explicitly reading prior-phase artifacts
- state.js initState phase-name mismatch with /sig:new-project

These are tractable in T3 once dogfood usage reveals which actually bite.

## Key files

- `PROJECT.md` — the full v1 spec
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` — the v2 vision
- `CLAUDE.md` — project instructions
- `.planning/TRANCHE-{1,2,3,4}.md` — scoped work plans
- `.planning/DECISIONS.md` — append-only architecture decisions
- `.planning/OPEN-QUESTIONS.md` — unresolved design questions (v1-scoped)
- `.planning/FUTURE-IDEAS.md` — post-v1 architectural evolutions of Signal's own mechanisms (distinct from TRANCHE-4's rundown-v2 integrations)
- `.planning/STATE.md` — what tranche we're in, active, blocked

**Authoritative references (in `references/`):**
- `profile-schema.md` — PROFILE.md format + validation rules
- `tier-definitions.md` — 4-tier definitions + tier-to-defaults table + escalation paths
- `question-patterns.md` — three question shapes (strict enum / 3+other / open-ended)
- `anti-rationalization.md` — anti-rationalization patterns

**Tooling (in `tools/`):**
- `lib/state.js` — `initState`, `readState`, `transitionPhase`, `checkGateArtifacts`, `PHASES`
- `lib/profile.js` — `readProfile`, `isPhaseEnabled`, `applyRigorOverrides`, `ProfileSchemaError`
- `lib/context-monitor.js` — `estimateTokens`, `checkContextBudget`, `findSkillPath`, `estimatePhaseSkillCost`
- `lib/skill-loader.js` — skill resolution
- `validate-plugin.js` — `npm run validate`
- `measure-phase-costs.js` — token-cost measurement (`node tools/measure-phase-costs.js`)

## How to start a session

1. Re-read this file (CONTEXT.md) + STATE.md.
2. Read the current tranche file (TRANCHE-{n}.md) for the task list.
3. Glance at OPEN-QUESTIONS.md to see what needs deciding soon.
4. Pick up the first un-checked task.

---

*Last updated: 2026-04-25*
