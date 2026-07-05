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

**v1 is feature-complete and shipped.** Latest release **v0.1.4** (2026-06-06) bundled E4+E5; **v0.1.3** (2026-05-31) bundled E7+E3+E9+E8+E2. Plugin marketplace-installable from `InsightRiot/signal`. Milestones 1–4 closed (M4 + v0.1.0 tagged 2026-05-12).

**MILESTONE 4.5 (Release Hardening / Stranger-Adoption Readiness): E1–E9 shipped (v0.1.1–v0.1.4); E10 added 2026-07-04 and now IN FLIGHT (phase EXECUTE, targeting v0.1.5).** The milestone's external-validation criterion (≥3 non-Signal testers, feedback merged) remains open, pending the outward tester loop. Shipped Epics: **E1** (install-path fix → v0.1.1; Slices 3–5 shelved), **E6** (STATE schema + `/sig:checkpoint` → v0.1.2), **E7 / E3 / E9 / E8 / E2** (→ v0.1.3), **E4 + E5** (worked example + comparison page + launch assets → v0.1.4, 2026-06-06). **E10** (resume trust & capture integrity) is the active build — see Active work below.

- **15 slash commands**, **26 agents**, **21 skills**, **773 tests passing**, validator green.
- **Conventions locked**: question-patterns (strict enum / 3+other / open-ended); PROFILE.md schema + tier-to-defaults + escalation_history; ID-is-identity vocabulary (M4.5.E6.S1.t1 addressing); `.planning/` always tracked in git; STATE.md YAML frontmatter (`schema_version: 1`) with auto-migration.
- **`.planning/` restructured 2026-06-05** (out-of-band hygiene, *not* an E5 task): 72 → 24 root files; closed-cycle scaffolding archived under `.planning/archive/M4.5/E{n}/` (M1–M4 under `archive/milestones/`). **`.planning/INDEX.md` is the documentation map — read it first.** Retros stay in root as the traceability spine. `tools/archive-migrate.mjs` = `/sig:migrate-memory` prototype. Commits `be9d87d`, `79c030f`.

## Active work

**M4.5.E10 — Resume trust & capture integrity → v0.1.5 — IN FLIGHT (phase EXECUTE, wave S1).** Promoted from the 2026-07-04 backlog review (BR-7); trust-hardening batch to ship before external testers onboard. DISCUSS + PLAN complete (2026-07-04 / 07-05). 6 items → **5 slices, high-risk-first**: **S1** origin-drift (`isStaleVsOrigin`, hardened+bounded fetch on resume/status/checkpoint) + STATE freshness in discuss/plan · **S2** resume Epic-prefix resolver (+ traversal guard) · **S3** capture-pipe guards (drain dangling-fence + `/sig:add` footer repair + lint) · **S4** schema-drift banner in `/sig:status`+`/sig:resume` (moved out of `/sig:doctor`, AD2) · **S5** hook smoke test + `references/hooks-api.md` + privacy-doc fix. **Next: `/sig:execute` — S1.t1 (export `SCHEMA_VERSION`) → S1.t2 (`isStaleVsOrigin`, RED-first, the high-risk one).** Plan: `M4.5.E10-{REQUIREMENTS,RESEARCH,PLAN,VALIDATION}.md`; decisions D-E10-1…11 + the 3 PLAN scope gates (AD1 FR1-kept / AD2 schema-drift host / AD3 privacy docs) in DECISIONS 2026-07-04 & 07-05. 8/8 dims PASS, 31/31 ACs mapped, no new deps, 777-test baseline.

> **Resume caveat (expected, not a bug — it's the thing E10 fixes):** `/sig:resume`'s artifact resolver can't yet find `M4.5.E10-PLAN.md` — the Epic-prefix resolver *is* S2/FR1, not built. Post-clear resume reports the correct STATE (EXECUTE / S1 / next-action) but its current-phase-artifact section will say "not found." Read `M4.5.E10-PLAN.md` directly for the task list until S2 lands.

**Epic-native flow = the committed NEXT Epic after E10** — make Epic mode first-class (commands create/track Epics, write Epic-scoped artifacts, populate `current_epic`, per-Epic calibration). Root cause + full context in DECISIONS 2026-07-05; FR1 is its forward-compatible read-half.

**M4.5.E5 — external validation + launch — SHIPPED as v0.1.4 (2026-06-06)** (the last M4.5 Epic before E10 was added). v0.1.4 tagged (`6328fed`), first GitHub Release; the outward tester loop (recruit ≥3, record demo) remains open, tracked in `M4.5.E5-LAUNCH-KIT.md` §3.

**Build horizon after E10 + Epic-native: M5** (v2 framework ports + memory-management milestone). The 2026-06-05 corpus restructure already dogfooded part of M5's memory work (see the `/sig:migrate-memory` FUTURE-IDEAS entry).

**Shelved (not deleted), pending tester volunteers (per D-E3-12):**

- **M4.5.E1 Slices 3–5** — Linux + WSL install matrix + versioning-policy doc + validator hardening. Scoped in `MILESTONE-4.5.md` § E1; paused until a tester on the platform commits to running `/sig:init` → verifying agent registration.

**Multi-machine norm:** Signal-the-codebase work happens on **this Mac Studio**. Biz machine + personal laptop are `/plugin install` test environments only. Don't run parallel `/sig:*` workflow commands across machines — git races create duplicate work.

## Key files

- `.planning/PROJECT.md` — the full v1 spec
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` — the v2 vision
- `CLAUDE.md` — project instructions
- `.planning/MILESTONE-4.5.md` (active — release-hardening / stranger-adoption; E5 is the only Epic still open) + `MILESTONE-5.md` (v2 ports + memory mgmt, gated on usage data). **M1–M4 archived** at `.planning/archive/milestones/` (M4 = `/sig:init` brownfield onboarding, closed 2026-05-12 + v0.1.0).
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

**Specifically for the next session:** active Epic is **M4.5.E5** (external validation + launch), phase EXECUTE. Slice 1 done; **next is S2.t5** (tester-brief guard, RED). `/sig:resume` re-orients; `/sig:execute` continues. See § Active work above.

---

*Last updated: 2026-07-05 (M4.5.E10 DISCUSS+PLAN complete → phase EXECUTE S1, trust-hardening batch → v0.1.5; Epic-native flow committed as the next Epic. Prior: 2026-06-06 E5 → v0.1.4.)*
