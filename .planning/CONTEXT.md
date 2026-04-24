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

**Tranche 2 underway. Steps 1 + 2 complete; all 9 slash commands now exist on disk.**

- 9 of 9 slash commands scaffolded. `calibrate` and `escalate` are functionally complete (auto-discovered, tested, validator green). The other 6 (discuss / plan / execute / verify / review / ship) exist but lack the "read PROFILE.md first" preamble — that's Step 3, blocked on the Socratic-pattern OPEN-QUESTION.
- 21 skill files, 17 agent files, 10 reference docs (added "Recoverable vs. permanent backfills" subsection to `tier-definitions.md`), 3 tool libs.
- PROFILE.md schema locked. Tier-to-defaults mapping locked. Override handling locked (up = brief confirm with cost implications; down = warn with the specific escalator that fired). Escalation history preservation locked (`--re-calibrate` carries history forward; `/sig:escalate` appends).
- Architectural insight: **strict Nyquist is a one-way ratchet** — only forward work can comply; pre-escalation commits carry permanent gaps. Surfaced in `tier-definitions.md` § "Recoverable vs. permanent backfills" and in `escalate.md`'s backfill warning table.
- 19 tests passing. `validate-plugin.js` green.

## Active work

**Tranche 2, Step 4 — `state.js` + helpers (`readProfile`, `isPhaseEnabled`, `applyRigorOverrides`).** Pure tooling work; full deliverable list in `TRANCHE-2.md` Step 4 and `STATE.md` Active section. No blockers.

Steps 1 and 2 (`/sig:calibrate` and `/sig:escalate`) are complete. Step 3 (preamble pass on 6 phase commands) is **deferred until the Socratic question-pattern OPEN-QUESTION resolves** — see top entry of `OPEN-QUESTIONS.md`.

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

*Last updated: 2026-04-22*
