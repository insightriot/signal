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

**Tranche 2 underway. Steps 1, 2, 3, 4, 5, 5a complete. PROFILE.md → phase behavior is fully wired; the calibration layer has teeth.**

- 9 of 9 slash commands scaffolded. **All 6 phase commands now read PROFILE.md as their first action**, exit early if the phase is in `phases_skipped`, and apply per-phase `rigor_overrides`. `calibrate`, `escalate`, and `new-project` enforce `.gitignore` doesn't ignore `.planning/`.
- 21 skill files (all bound now or correctly meta-only), 17 agent files, **11 reference docs** (added `question-patterns.md`), **4 tool libs**.
- **Question-pattern convention locked (Step 3).** `references/question-patterns.md` defines three shapes — strict enum (calibrate's questions), 3-options-plus-other (the default for tradeoffs), open-ended (rare). Strongly-recommended-with-justification convention. DISCUSS Step 4 retrofitted to explicit 3+other; VERIFY's Loop Back retrofitted to 3+other (loop-back / escalate / accept-failure).
- **Skill bindings (Step 5).** Plan: 3 skills (was 1). Execute: 5 (was 3). Ship: 5 (was 4). Bindings written in `state/config.json`; phase commands updated to load them.
- PROFILE.md schema locked. Tier-to-defaults mapping locked. Override handling locked. Escalation history preservation locked.
- **PREPARE phase is a v2 candidate in `FUTURE-IDEAS.md`** with three explicit promotion triggers (token-budget signal in PLAN, repeated user-language friction at the seam, two+ new homeless skills). v1 stays at 6 phases.
- **`.planning/`-always-tracked enforcement (Step 5a).** Entry-point commands refuse to write if `.gitignore` would ignore `.planning/`. README one-liner deferred to TRANCHE-3 Task 4.
- **Validator** requires `calibrate.md` + `escalate.md` + `profile-schema.md` + `tier-definitions.md`.
- **Profile helpers (Step 4).** `readProfile` strictly validates. `isPhaseEnabled` treats CALIBRATE as never-skipped. `applyRigorOverrides` is non-mutating + maps to legacy keys.
- Architectural insights logged: (a) **strict Nyquist is a one-way ratchet**; (b) **ODI map reveals a missing PREPARE phase** in v1's decomposition (logged for v2).
- **47 tests passing**; validator green.

## Active work

**Tranche 2 has two items left, both unblocked:**
- **Step 7** — REVIEW + PLAN phase token-cost measurement (`estimatePhaseSkillCost`). Now load-bearing: Step 5's bindings increased PLAN to 3 skills; this is the first chance to see if the PREPARE-phase token-budget trigger is already firing. Recommended next pickup.
- **Step 6** — agent count reconciliation (17 on disk vs. 24 in spec). Audit which agents are missing, decide write-vs-revise.

Step 8 (end-to-end self-test) is gated on Step 6/7 complete.

All previous blockers resolved. PROFILE.md → phase behavior is wired; only Step 6/7 remain before Tranche 2 exits.

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
