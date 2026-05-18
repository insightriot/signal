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

**MILESTONE 4 closed 2026-05-12 + v0.1.0 tagged.** 19 of 19 tasks shipped. Plugin marketplace-installable from `InsightRiot/signal`.

**MILESTONE 4.5 in flight.** Three Epics shipped, three pending:
- **E2.S1 (`/sig:add` hot path)** shipped 2026-05-14 — verbatim capture to `FUTURE-IDEAS.md` with scrub + lock + atomic write.
- **E1.S1 (marketplace install path)** shipped 2026-05-15 as **v0.1.1** — `marketplace.json` source-block fix + `CLAUDE_CODE_PLUGIN_PREFER_HTTPS` doc + semver validator.
- **E6 (resume reliability)** shipped 2026-05-18 as **v0.1.2** — YAML-frontmatter STATE.md (`schema_version: 1`) + auto-update protocol during EXECUTE + new `/sig:checkpoint` command + staleness banner + orphan UI in `/sig:resume`. 5 slices + S6 REVIEW loop-back (5 IMPORTANT findings resolved pre-publish).

- **14 slash commands shipped**: `/sig:new-project`, `/sig:init`, `/sig:calibrate`, `/sig:discuss`, `/sig:plan`, `/sig:execute`, `/sig:verify`, `/sig:review`, `/sig:ship`, `/sig:escalate`, `/sig:status`, `/sig:resume`, `/sig:add`, `/sig:checkpoint`.
- **26 agent files**: 22 from M1-M3 + 4 brownfield scanners (stack / structure / activity / quality) under `agents/scanners/`.
- **21 skill files** (unchanged since M3).
- **13 tool libs**: `state.js` (rewritten in E6.S1 for YAML frontmatter), `context-monitor.js`, `profile.js`, `status.js`, `landscape.js`, `walkthrough.js`, `skill-loader.js`, `add.js`, plus E6 additions: `atomic-write.js` + `file-lock.js` (extracted from `add.js`), `checkpoint.js`, `execute.js`, `resume.js`.
- **Conventions locked**: question-patterns (strict enum / 3+other / open-ended); PROFILE.md schema + tier-to-defaults + escalation_history; ID-is-identity vocabulary rule (Milestone / Epic / Phase / Wave / Task with M4.5.E6.S1.t1 style addressing); `.planning/` always tracked in git; STATE.md uses YAML frontmatter (`schema_version: 1`) with auto-migration on first write.
- **Validator** requires `calibrate.md` + `escalate.md` + `init.md` + `add.md` + `checkpoint.md` + `profile-schema.md` + `tier-definitions.md` + the 4 scanner agents.
- **366 tests passing** as of v0.1.2; validator green. (Test count history: 209 v0.1.0 → 225 v0.1.1 → 366 v0.1.2.)
- **F2 (post-marketplace-install agent registration)** — still open. Documented fallback path in `/sig:init` Step 2; not blocking. M4.5.E1.S2 will verify post-marketplace-install.
- **Resume reliability — solved as of v0.1.2.** `/sig:resume` reads the YAML frontmatter, surfaces in-flight tasks + staleness + orphans + open questions + next action. The 280-line manual POST-CONTEXT-CLEAR RE-ENTRY PROTOCOL previously hand-maintained at the top of Signal's own `STATE.md` body is now obsolete; the body is preserved-verbatim history (per the auto-migration design), but the frontmatter drives the protocol.

## Active work

**MILESTONE 4.5 underway** — Release Hardening / Stranger-Adoption Readiness; 6 Epics total, 3 shipped (E1.S1, E2.S1, E6 full), 3+ pending.

**No active Epic right now.** Phase is `SHIP` (M4.5.E6 closed). The next Epic is Brett's choice; recommended order:

1. **M4.5.E1 Slices 2–5** — F2 verification on biz machine (highest-leverage; unblocks confident marketplace promotion), install matrix R2/R3/R5, versioning policy doc, validator hardening.
2. **M4.5.E2 Slices 2–5** — `/sig:add` force-route flags (`--question`, `--milestone N`, `--file`), cold-path interview for naked invocation, stranger-safety hardening, `/sig:plan` close-the-loop.
3. **M4.5.E3** — public-facing docs rewrite. Gates external launch.
4. **M4.5.E4** — worked example + comparison page.
5. **M4.5.E5** — external validation + launch.

Status-line breadcrumb (`[sig] M4.5.E6 · EXECUTE · S6.t2`) captured to `FUTURE-IDEAS.md` 2026-05-18 — promote to its own Epic (e.g., M4.5.E7) if prioritized before launch.

**To start the next Epic:** run `/sig:resume` first (auto-orientation briefing — reads PROFILE.md + STATE.md frontmatter + open questions + next-action), then `/sig:discuss` once you've picked a scope.

## Key files

- `.planning/PROJECT.md` — the full v1 spec
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` — the v2 vision
- `CLAUDE.md` — project instructions
- `.planning/MILESTONE-{1,2,3,4,4.5,5}.md` — scoped work plans (MILESTONE-4 = `/sig:init` brownfield onboarding, ✓ closed 2026-05-12 + v0.1.0 tagged; **MILESTONE-4.5 = release-hardening / stranger-adoption readiness, scaffolded 2026-05-13** — 6 Epics, 3 shipped (E1.S1, E2.S1, E6 full → v0.1.1 + v0.1.2); MILESTONE-5 = v2 ports, gated on usage data)
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

1. Run `/sig:resume`. It reads PROFILE.md + STATE.md frontmatter and prints a single-screen re-orientation briefing (vision, tier, phase, in-flight tasks, last completed task, blockers, open questions, next action). This replaces the manual "read CONTEXT.md + STATE.md + MILESTONE-*.md" ritual.
2. If `/sig:resume` reports `Next: done` (current Epic shipped), pick the next Epic from `MILESTONE-4.5.md` § "Epics" and run `/sig:discuss` to enter DISCUSS on the new scope.
3. If staleness is reported (STATE.md behind work history), run `/sig:checkpoint` first. Run `/sig:checkpoint --context` before any planned context clear so the next session's resume is genuinely useful.
4. For deeper context (full vision, design decisions, milestone breakdown), open the files in this order: `CONTEXT.md` (this file) → `MILESTONE-4.5.md` → `DECISIONS.md`.

**Specifically for the next session:** M4.5.E6 shipped 2026-05-18 (v0.1.2). Phase is `SHIP` / done. The recommended next Epic is **M4.5.E1.S2** (F2 verification on biz machine) — smallest unit of forward motion, unblocks confident marketplace promotion. Alternatives are listed in § Active work above.

---

*Last updated: 2026-05-18 (M4.5.E6 shipped as v0.1.2: YAML-frontmatter STATE.md + auto-update protocol + `/sig:checkpoint` + staleness-aware `/sig:resume`; tests 225 → 366; 14 commands; the 280-line manual POST-CONTEXT-CLEAR protocol previously at the top of STATE.md is now obsolete — `/sig:resume` drives re-entry.)*
