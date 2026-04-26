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

**Tranche 2 underway. Steps 1, 2, 4, 5, 5a complete. Skill bindings filled in; PREPARE phase logged as v2 candidate.**

- 9 of 9 slash commands scaffolded. `calibrate`, `escalate`, and `new-project` enforce `.gitignore` doesn't ignore `.planning/`. The other 6 (discuss / plan / execute / verify / review / ship) exist but lack the "read PROFILE.md first" preamble — that's Step 3, blocked on the Socratic-pattern OPEN-QUESTION.
- 21 skill files (all bound now or correctly meta-only), 17 agent files, 10 reference docs (renamed `testing-patterns.md` → `testing-checklist.md`), **4 tool libs**.
- PROFILE.md schema locked. Tier-to-defaults mapping locked. Override handling locked. Escalation history preservation locked.
- **Skill bindings filled (Step 5).** Plan: 3 skills (was 1). Execute: 5 (was 3). Ship: 5 (was 4). Bindings written in `state/config.json`. The orphan-skill audit surfaced an ODI Universal Job Map parallel — Signal's PLAN bundles ODI's *Locate* + *Prepare* steps. **PREPARE phase is now a v2 candidate in `FUTURE-IDEAS.md`** with three explicit promotion triggers; for v1 we accept the imprecision and bind orphans to existing phases.
- **`.planning/`-always-tracked enforcement (Step 5a).** `/sig:new-project` and `/sig:calibrate` both refuse to write if `.gitignore` would ignore `.planning/`. README one-liner deferred to TRANCHE-3 Task 4 (where the README will be written; checkbox added there).
- **Validator updates.** `validate-plugin.js` now requires `calibrate.md` + `escalate.md` and `profile-schema.md` + `tier-definitions.md`.
- **Profile helpers shipped (Step 4).** `readProfile` strictly validates and throws `ProfileSchemaError`. `isPhaseEnabled` treats CALIBRATE as never-skipped. `applyRigorOverrides` is non-mutating + maps to legacy keys.
- Architectural insights logged: (a) **strict Nyquist is a one-way ratchet** (forward-only, irrecoverable for pre-escalation commits); (b) **ODI map reveals a missing PREPARE phase** in v1's decomposition (logged for v2).
- **47 tests passing**. `validate-plugin.js` green.

## Active work

**Tranche 2 has two unblocked items left:**
- **Step 6** — agent count reconciliation (17 on disk vs. 24 in spec). Audit which agents are missing, decide write-vs-revise.
- **Step 7** — REVIEW phase token-cost measurement (`estimatePhaseSkillCost('review')`). Should also measure PLAN now that it loads 3 skills, in case the PREPARE-phase token-budget trigger is firing already.

Step 3 (preamble pass on 6 phase commands) is **deferred until the Socratic question-pattern OPEN-QUESTION resolves** — see top entry of `OPEN-QUESTIONS.md`. Step 4's helpers + Step 5's bindings give Step 3 the tooling and skill map it needs once unblocked.

Step 8 (end-to-end self-test) is gated on Step 3 unblock + Step 6/7 complete.

## Key files

- `PROJECT.md` — the full v1 spec
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` — the v2 vision
- `CLAUDE.md` — project instructions
- `.planning/TRANCHE-{1,2,3,4}.md` — scoped work plans
- `.planning/DECISIONS.md` — append-only architecture decisions
- `.planning/OPEN-QUESTIONS.md` — unresolved design questions (v1-scoped)
- `.planning/FUTURE-IDEAS.md` — post-v1 architectural evolutions of Signal's own mechanisms (distinct from TRANCHE-4's rundown-v2 integrations)
- `.planning/STATE.md` — what tranche we're in, active, blocked

## How to start a session

1. Re-read this file (CONTEXT.md) + STATE.md.
2. Read the current tranche file (TRANCHE-{n}.md) for the task list.
3. Glance at OPEN-QUESTIONS.md to see what needs deciding soon.
4. Pick up the first un-checked task.

---

*Last updated: 2026-04-25*
