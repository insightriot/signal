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

**MILESTONE 4 closed 2026-05-12 + v0.1.0 tagged.** 19 of 19 tasks shipped. Plugin marketplace-installable from `InsightRiot/signal`. M4.t18 vocabulary refactor (Tranche → Milestone + Epic mid-layer) and M4.t19 (`signal → sig` plugin slug + marketplace install layout fix) both shipped 2026-05-12.

**v0.1.1 shipped 2026-05-15** via M4.5.E1.S1 — marketplace.json source-block fix + `CLAUDE_CODE_PLUGIN_PREFER_HTTPS` doc + semver validator + 16 new tests (209 → 225). R1 verified on Brett's biz machine.

**v0.1.x in flight** via M4.5.E6 (resume reliability) — entering EXECUTE 2026-05-17.

- **13 slash commands shipped**: `/sig:new-project`, `/sig:init`, `/sig:calibrate`, `/sig:discuss`, `/sig:plan`, `/sig:execute`, `/sig:verify`, `/sig:review`, `/sig:ship`, `/sig:escalate`, `/sig:status`, `/sig:resume`, `/sig:add`. **+1 planned in E6.S2**: `/sig:checkpoint`.
- **26 agent files**: 22 from M1-M3 + 4 brownfield scanners (stack / structure / activity / quality) under `agents/scanners/`.
- **21 skill files** (unchanged since M3).
- **8 tool libs**: state.js (will be rewritten in E6.S1), context-monitor.js, profile.js, status.js, landscape.js, walkthrough.js, skill-loader.js, add.js. **+3 planned in E6**: atomic-write.js + file-lock.js (extracted from add.js) + checkpoint.js + execute.js + resume.js.
- **Conventions locked**: question-patterns (strict enum / 3+other / open-ended); PROFILE.md schema + tier-to-defaults + escalation_history; ID-is-identity vocabulary rule (Milestone / Epic / Phase / Wave / Task with M4.5.E6.S1.t1 style addressing); `.planning/` always tracked in git.
- **Validator** requires `calibrate.md` + `escalate.md` + `init.md` + `add.md` + `profile-schema.md` + `tier-definitions.md` + the 4 scanner agents. **+1 planned in E6.S5**: `checkpoint.md`.
- **225 tests passing** as of v0.1.1; validator green. **E6 will add ~88 new tests** → ~313 total at S5 close.
- **F2 (post-marketplace-install agent registration)** — still open. Documented fallback path in `/sig:init` Step 2; not blocking. M4.5.E1.S2 will verify post-marketplace-install.
- **Known gap (literally what E6 fixes):** `/sig:resume` cannot fully re-orient after context-clear because STATE.md is freeform narrative + artifact resolver doesn't know Epic-prefix naming. **Manual workaround until E6 ships:** read `.planning/STATE.md` § "POST-CONTEXT-CLEAR RE-ENTRY PROTOCOL" at the top.

## Active work

**MILESTONE 4 closed 2026-05-12 + v0.1.0 tagged.** 19 of 19 tasks shipped. Plugin marketplace-installable from `InsightRiot/signal`.

**MILESTONE 4.5 underway** — Release Hardening / Stranger-Adoption Readiness; 6 Epics.

**ACTIVE EPIC: M4.5.E6 — Resume reliability** (entering EXECUTE 2026-05-17). Plan in `.planning/M4.5.E6-PLAN.md`. 16 design decisions locked in `.planning/DECISIONS.md` (2026-05-16 + 2026-05-17 addendum). 5 slices: S1 (schema + helpers + migration + D15 dry-run gate) → S2 (`/sig:checkpoint`) → S3 (auto-protocol in executor/orchestrator) → S4 (resume staleness + orphan UI + briefing extraction) → S5 (tier-aware + validator + docs + dogfood). Linear strict-gate execution. ~88 new tests planned; no new runtime deps (D1 amended — use existing `yaml@^2.8.3`).

**→ See `.planning/STATE.md` § "POST-CONTEXT-CLEAR RE-ENTRY PROTOCOL"** at the top for canonical re-entry instructions after any context clear during E6.

**Already shipped in M4.5:** E1.S1 (marketplace install path fix → v0.1.1, 2026-05-15), E2.S1 (`/sig:add` hardened hot path → 2026-05-14, 40 tests).

**Pending after E6 closes:** E1 Slices 2–5 (F2 verification, install matrix, versioning policy, validator hardening); E2 Slices 2–5 (force-route flags, cold-path interview, hardening, /sig:plan close-the-loop); E3 (public-facing docs rewrite); E4 (worked example + comparison page); E5 (external validation + launch).

## Key files

- `.planning/PROJECT.md` — the full v1 spec
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` — the v2 vision
- `CLAUDE.md` — project instructions
- `.planning/MILESTONE-{1,2,3,4,4.5,5}.md` — scoped work plans (MILESTONE-4 = `/sig:init` brownfield onboarding, ✓ closed 2026-05-12 + v0.1.0 tagged; **MILESTONE-4.5 = release-hardening / stranger-adoption readiness, scaffolded 2026-05-13** — 5 Epics including `/sig:add` capture-and-route command and F2 install-path resolution; MILESTONE-5 = v2 ports, gated on usage data)
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
