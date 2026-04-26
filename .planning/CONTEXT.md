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

**TRANCHE 3 IN PROGRESS — Tasks 1 + 2 complete (2026-04-26).** Task 1: /sig:status shipped via Signal-on-Signal dogfood + /sig:resume hand-rolled. **Task 2: full FULL-tier dogfood pass on a throwaway URL shortener — Signal's first end-to-end run on a non-Signal target. All 6 phases ran cleanly; throwaway shipped with 39 passing tests.** Tranche 2 complete; phase commands respect tier; orphan skills bound; agent count reconciled; token costs measured.

- **11 of 11 slash commands shipped** (added `/sig:status` and `/sig:resume` in T3 Task 1).
  - `/sig:status` — read-only project inspection, dogfooded (worktree branch `worktree-dogfood-status`).
  - `/sig:resume` — re-orientation briefing, hand-rolled per the locked plan (chicken-and-egg avoidance).
  - The 6 phase commands all read PROFILE.md as their first action; meta commands (calibrate / escalate / new-project / status / resume) skip the tier-gating preamble.
- 21 skill files (all bound or correctly meta-only), **22 agent files**, **11 reference docs**, **5 tool libs** (added `tools/lib/status.js`).
- **Question-pattern convention locked (Step 3).** `references/question-patterns.md` defines three shapes — strict enum (calibrate's questions), 3-options-plus-other (the default for tradeoffs), open-ended (rare). Strongly-recommended-with-justification convention. DISCUSS Step 4 retrofitted to explicit 3+other; VERIFY's Loop Back retrofitted to 3+other (loop-back / escalate / accept-failure).
- **Skill bindings (Step 5).** Plan: 3 skills (was 1). Execute: 5 (was 3). Ship: 5 (was 4). Bindings written in `state/config.json`; phase commands updated to load them.
- PROFILE.md schema locked. Tier-to-defaults mapping locked. Override handling locked. Escalation history preservation locked.
- **PREPARE phase is a v2 candidate in `FUTURE-IDEAS.md`** with three explicit promotion triggers (token-budget signal in PLAN, repeated user-language friction at the seam, two+ new homeless skills). v1 stays at 6 phases.
- **`.planning/`-always-tracked enforcement (Step 5a).** Entry-point commands refuse to write if `.gitignore` would ignore `.planning/`. README one-liner deferred to TRANCHE-3 Task 4.
- **Validator** requires `calibrate.md` + `escalate.md` + `profile-schema.md` + `tier-definitions.md`.
- **Profile helpers (Step 4).** `readProfile` strictly validates. `isPhaseEnabled` treats CALIBRATE as never-skipped. `applyRigorOverrides` is non-mutating + maps to legacy keys.
- Architectural insights logged: (a) **strict Nyquist is a one-way ratchet**; (b) **ODI map reveals a missing PREPARE phase** in v1's decomposition (logged for v2).
- **93 tests passing** (state.test.js + context-monitor.test.js + profile.test.js + status.test.js — 53 → 93, +40 new in T3 Task 1); validator green.

## Active work

**Tranche 3 in progress.** Tasks 1 + 2 complete; 3 tasks remain (see `TRANCHE-3.md`):
1. ✓ Build `/sig:status` and `/sig:resume` (T3 Task 1 — 2026-04-26).
2. ✓ FULL-tier pass on a throwaway sample project (T3 Task 2 — 2026-04-26). URL shortener in Node.js shipped via Signal's full 6-phase flow — throwaway repo at `.dogfood/url-shortener-fulltier/` with 13 commits, 39 tests, all 24 acceptance criteria satisfied. Run log + 6 new findings appended to OPEN-QUESTIONS.md.
3. SKETCH-tier pass — the critical validation that calibration actually drops rigor — next.
4. README quickstart (with `.planning/`-always-committed one-liner from T2 Step 5a). Natural seam to also move Signal's PROJECT.md from repo root to `.planning/PROJECT.md` (resolves T1-dogfood Friction #1/#3).
5. Triage outstanding OPEN-QUESTIONS items.

OPEN-QUESTIONS.md now carries 18 active items: 3 from T2 Step 8 + 5 from T1 dogfood + 6 from T2 Task 2 dogfood + 4 older. Friction triage is Task 5; resolutions are mostly small (one-line fixes in command markdown, doc updates).

Dogfood approach for any future Signal-on-Signal work is now locked in DECISIONS.md (worktree + cherry-pick protocol).

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

*Last updated: 2026-04-26 (T3 Task 2 complete)*
