# PROJECT.md — Signal

> **Working name:** **Signal** (market-facing: *SignalOS*). Command prefix: `/sig:`. Phase 0: `/sig:calibrate`.
> The organizing metaphor is *signal vs. noise* at every phase — vision, validation, spec, plan, code, test, review, ship, learn. Calibrate tunes the receiver; the rest of the flow amplifies signal and suppresses noise.

## Vision

Signal is a Claude Code plugin (with multi-runtime compatibility) that integrates the strongest patterns from across the Claude Code plugin ecosystem — GSD's execution orchestration, Agent Skills' quality enforcement, and patterns drawn from gstack, pm-skills, superpowers, compound-engineering, planning-with-files, and oh-my-claudecode — then adds a project-complexity calibration step so rigor is right-sized per project.

The v1 MVP ports GSD and Agent Skills directly. The v2 architecture (see `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`) incorporates the remaining source repos: upstream ideation/validation/strategy phases from pm-skills, a post-ship Compound memory phase from compound-engineering, a 15-phase security audit from gstack, stronger TDD enforcement from superpowers, and context-discipline hook patterns from planning-with-files.

The result: AI coding agents that are disciplined (don't skip specs, tests, security), durable (don't degrade over long sessions), *and* calibrated (don't over-engineer throwaways or under-engineer production systems).

Signal targets solo developers and small teams who want production-grade engineering output from AI agents without enterprise ceremony — and without spending 60 minutes planning a homepage.

## Vocabulary

Signal uses the following work-unit terms. Locked 2026-05-12 in M4.t18 (see `DECISIONS.md`).

| Term | Meaning | ID shape |
|---|---|---|
| **Milestone** | A scoped slice of project work, weeks-to-months. The top-level work unit. | `M1`, `M2`, …, `M5` |
| **Epic** | Optional mid-layer that groups related tasks within a milestone. Used when a milestone has obvious sub-themes (e.g., M5 has 6 epics for v2 ports); skipped when it's a flat task list (M1–M4). | `M5.E1`, `M5.E2`, … |
| **Slice** | Optional sub-Epic subdivision — a coherent group of tasks that ships as one atomic event (one commit chain, one CHANGELOG entry, one user-visible "thing happened"). Used when an Epic is large enough that monolithic execution would mean a single oversized PR; skipped when an Epic is small enough to execute as a flat task list. | `M4.5.E2.S1`, `M4.5.E7.S2` |
| **Task** | A unit of work small enough to ship in a focused session. Lowercase `t` so M / E / S / t are visually distinct. | `M4.t17`, `M5.E3.t2`, `M4.5.E8.S2.t3` |
| **Phase** | A workflow stage in Signal's 6-phase flow (`calibrate → discuss → plan → execute → verify → review → ship`). Workflow-only — never a numbered work unit. | `CALIBRATE`, `DISCUSS`, … |
| **Wave** | A parallel-execution batch within a single phase's plan (used by `/sig:execute`). | `Wave 1`, `Wave 2` |
| **Tier** | Project-wide rigor classification set by `/sig:calibrate` (changeable via `/sig:escalate`); written to `.planning/PROFILE.md`. Gates which phases run for the project and how strictly — skipped phases, gate strictness, TDD requirement, security audit depth, plan-validation dimensions, etc. Project-scoped, not per-task. Full schema in `references/profile-schema.md`; per-tier defaults in `references/tier-definitions.md`. | `SKETCH`, `FEATURE`, `SPIKE`, `FULL` |

**ID is persistent identity, never changes.** Once assigned, a task's ID is its address forever — across renames, re-orderings, escalations, and milestone reshuffles. Phase and Wave are *metadata* on the work unit (describing transient status: planned / in-flight / shipped), not part of its address. If a task moves between waves or restarts in a different phase, its ID stays the same; only its metadata updates.

This rule exists because plans drift. IDs that mutate when work moves break every cross-reference (commit messages, PR descriptions, decisions logs, learnings entries, retros). The cost of immutable IDs is a slightly awkward sequence (e.g., M4.t13 might ship after M4.t17); the cost of mutable IDs is constant low-grade reference rot.

**Why these terms (not Tranche / Phase-as-numbered-unit / Sprint):**
- *Milestone* is what GSD (Signal's primary upstream) uses; aligning vocabulary with downstream-of-upstream avoids needless divergence.
- *Tranche* (the term Signal originally shipped with) is a finance import — fancy-sounding but opaque to anyone outside finance, fails the "could a new contributor guess what this means" test. None of the 9 upstream inspiration repos use it.
- *Phase* is reserved for the workflow stages so the word stays unambiguous. (GSD overloads Phase to mean both a workflow stage AND a numbered work unit; Signal keeps the cleaner separation.)
- *Sprint* implies a fixed time-box (Scrum heritage) Signal doesn't enforce.

## Scope & Roadmap

Signal ships in two versions. This PROJECT.md specifies v1. v2 is tracked separately and does not start until v1 is validated in real use.

### v1 — 6-phase MVP (current scope)

Phase 0 + six-phase workflow:

`/sig:calibrate` → `/sig:discuss` → `/sig:plan` → `/sig:execute` → `/sig:verify` → `/sig:review` → `/sig:ship`

Escape hatch: `/sig:escalate` (upgrades tier mid-flight).

**What's inside:** direct ports from GSD (execution orchestration — wave-based parallel execution, 21+ specialized agents, file-based state, context monitoring) and Agent Skills (quality enforcement — 21 skills, anti-rationalization tables, phase gates). The new-to-Signal contributions are Phase 0 calibration (`PROFILE.md` tier routing) and the REVIEW phase as a first-class step.

### v2 — 10-phase architecture (follow-on)

Expands to the 10-phase flow specified in `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`:

`/sig:calibrate` → `/sig:ideate` → `/sig:validate` → `/sig:strategize` → `/sig:discuss` (possibly renamed `/sig:spec`) → `/sig:plan` → `/sig:execute` → `/sig:verify` → `/sig:review` → `/sig:ship` → `/sig:compound`

**What's added:** upstream PM phases (ideate / validate / strategize) from pm-skills + gstack + oh-my-claudecode; a post-ship Compound memory phase from compound-engineering + gstack; security audit upgrade from gstack; stronger TDD enforcement from superpowers; context-discipline hooks from planning-with-files.

### Gating between v1 and v2

v2 work does not start until both conditions are met:

1. **v1 ships end-to-end.** All 9 commands working. Both FULL and SKETCH tier passes validated on real sample projects.
2. **v1 has real users.** At least a few weeks of real usage, long enough for feedback to shape v2 priorities.

v2 Epics should be re-ordered based on observed v1 pain points, not the order listed in the rundown. See `.planning/MILESTONE-4.md` for the Epic roadmap (directional, not prescriptive).

## Problem Statement

AI coding agents have two failure modes that current frameworks solve independently:

1. **Quality shortcuts** — Agents take the fastest path, skipping specs, tests, security reviews, and documentation. Agent Skills solves this with phase gates, anti-rationalization tables, and exit criteria across 21 skills.

2. **Context degradation** — Over long sessions, agents lose coherence as the context window fills with stale conversation. GSD solves this with wave-based parallel execution, fresh context windows per task, file-based state persistence, and 21 specialized agents.

Neither framework alone is sufficient. Agent Skills has no execution engine — it's a set of standards with no mechanism to enforce them at scale. GSD has no quality opinion — it orchestrates powerfully but doesn't define what "good" looks like beyond "does it work."

The gap: there is no integrated system that enforces engineering quality standards through a context-resilient execution engine.

## Success Looks Like

- A developer installs one plugin and gets a complete workflow from requirements through shipping
- Quality gates (specs, tests, security, performance) are structurally enforced, not optional
- Long development sessions maintain coherence through context management
- The system works across Claude Code and at least 2 other runtimes (Cursor, Codex, etc.)
- The REVIEW phase (Agent Skills' unique depth) is a first-class phase, not an afterthought
- Anti-rationalization is built into the system, not bolted on as advice

## In Scope

- Plugin packaging with commands, agents, skills, references, state management, and CLI tools
- **Phase 0 + six-phase workflow:** `/sig:calibrate` → `/sig:discuss` → `/sig:plan` → `/sig:execute` → `/sig:verify` → `/sig:review` → `/sig:ship`
- `/sig:calibrate` Phase 0 router that writes `.planning/PROFILE.md` (tier: SKETCH / FEATURE / SPIKE / FULL) that every downstream command reads
- Integration of GSD's 19 agents with Agent Skills' 3 specialist agents (code-reviewer, test-engineer, security-auditor) — 22 agents total. (Originally speced as 24, reduced after doc-writer / doc-verifier responsibilities folded into the `documentation-and-adrs` SHIP-phase skill.)
- On-demand skill loading per phase (not all-at-once) to preserve context budget
- File-based state management (`.planning/` directory pattern from GSD, plus `PROFILE.md`)
- Anti-rationalization tables at every phase gate
- `/sig:escalate` escape hatch to upgrade tier mid-flight when scope grows
- Multi-runtime support (Claude Code primary, with adapter layer for others)
- Documentation and setup guides

## Out of Scope

- Building a SaaS product or hosted service
- Enterprise features (RBAC, audit logs, SSO)
- IDE-native UI (this is CLI/agent-native)
- Rewriting either framework from scratch — this is integration, not reinvention
- Supporting runtimes that neither source framework supports
- A learning/auto-improvement loop (gsd-skill-creator territory — future phase)

## Constraints

- Must respect both projects' licenses and attribution requirements
- Must not bloat the context window — the whole point of GSD's architecture is loading only what's needed
- Must work with Claude Code's plugin/skill/agent file conventions
- Node.js 22+ (GSD's runtime requirement)
- The plugin should be installable in under 5 minutes

## Done When

- A developer can run `/sig:new-project` (or `/sig:calibrate` on its own) and be routed into the appropriate rigor tier
- A developer can run `/sig:discuss` through `/sig:ship` and produce a shipped PR
- Every phase transition has a gate with explicit go/no-go criteria
- Agent Skills' 21 skills are loadable on-demand within GSD's execution framework
- Context monitoring warns at 35% and 25% remaining (GSD pattern)
- All 22 agents (19 GSD + 3 Agent Skills specialists) are functional
- `PROFILE.md` correctly gates downstream phases based on calibration output
- The plugin passes its own quality gates (dogfooding)

---

## Reference Repositories

| Repo | URL | Status | Role in Signal |
|------|-----|--------|----------------|
| **GSD (Get Shit Done)** | https://github.com/gsd-build/get-shit-done | Ported (v1) | Execution orchestration — wave-based parallel execution, 21 specialized agents, CLI tools, file-based state, context monitoring |
| **Agent Skills** (Addy Osmani) | https://github.com/addyosmani/agent-skills | Ported (v1) | Quality enforcement — 21 skills, 3 specialist agents, anti-rationalization tables, phase gates, exit criteria |
| **gstack** (Garry Tan) | https://github.com/garrytan/gstack | Planned (v2) | 15-phase CSO security audit, office-hours reframing, retro + learn memory loop, freeze/careful hard gates |
| **pm-skills** (phuryn) | https://github.com/phuryn/pm-skills | Planned (v2) | Upstream PM layer — Torres/Cagan/Olsen frameworks for ideate → validate → strategize phases, PRD templates, GTM suite |
| **superpowers** (Jesse Vincent / obra) | https://github.com/obra/superpowers | Planned (v2) | Harder TDD enforcement, systematic-debugging skill, `<HARD-GATE>` mechanism, anti-rationalization table format |
| **compound-engineering** (Every Inc) | https://github.com/EveryInc/compound-engineering-plugin | Planned (v2) | Compound memory phase, learnings-researcher and session-historian agents, multi-lens review panel |
| **planning-with-files** (OthmanAdi) | https://github.com/OthmanAdi/planning-with-files | Pattern source | Disk-as-cognitive-scaffold discipline, hook-driven context re-reads, 2-Action Rule (benchmarked 6.7% → 96.7% lift) |
| **oh-my-claudecode** (Yeachan-Heo) | https://github.com/Yeachan-Heo/oh-my-claudecode | Pattern source | `deep-interview` with 20% ambiguity gate, consensus planning, visual-verdict, lifecycle hook architecture |
| **GSD Skill Creator** (Tibsfox) | https://github.com/Tibsfox/gsd-skill-creator | Reference | Format bridge between GSD and Agent Skills; DACP protocol precedent |
| **Prior Analysis** | `GSD-AgentSkills-Combination-Analysis.md` (in this folder) | Historical | Original two-framework strategic memo; superseded by `analysis/` docs |

**Status legend:** *Ported (v1)* = code and structure imported directly. *Planned (v2)* = analyzed, roadmapped for v2 integration per `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`. *Pattern source* = architectural ideas informed Signal's design; no full port planned.

See also: `analysis/REPO-ANALYSIS.md` (deep analysis of all seven landscape repos) and `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` (integration plan).

---

## Architecture Overview

Three-layer design. Each layer has a distinct responsibility.

```
┌──────────────────────────────────────────────────────┐
│  LAYER 3: Anti-Rationalization & Verification        │
│  (Immune system — shared contribution from both)     │
│                                                      │
│  • Anti-rationalization tables at every gate          │
│  • Nyquist test-coverage validation (GSD)            │
│  • 8-dimension plan validation (GSD)                 │
│  • Exit criteria checklists (Agent Skills)            │
│  • Specialist verifier agents (both)                 │
└──────────────────────┬───────────────────────────────┘
                       │ enforces standards on
┌──────────────────────▼───────────────────────────────┐
│  LAYER 2: Quality Gates (Agent Skills' standards)    │
│  (Loaded on-demand per phase, not all at once)       │
│                                                      │
│  DISCUSS: idea-refine, spec-driven-development       │
│  PLAN:    planning-and-task-breakdown                │
│  EXECUTE: incremental-impl, TDD, context-engineering │
│  VERIFY:  browser-testing, debugging-and-recovery    │
│  REVIEW:  code-review, security, perf, simplify      │
│  SHIP:    git-workflow, ci-cd, docs, shipping        │
└──────────────────────┬───────────────────────────────┘
                       │ injected into
┌──────────────────────▼───────────────────────────────┐
│  LAYER 1: Orchestration Engine (GSD's architecture)  │
│  (Foundation — runs everything)                      │
│                                                      │
│  • Wave-based parallel execution                     │
│  • Fresh context windows per task                    │
│  • File-based state (.planning/ directory)           │
│  • Context monitoring (35% warn, 25% critical)       │
│  • CLI tools layer (gsd-tools.cjs)                   │
│  • Agent spawning infrastructure                     │
└──────────────────────────────────────────────────────┘
```

## Workflow — Phase 0 + Six Phases

```
[Phase 0]
/sig:calibrate ── writes .planning/PROFILE.md ── routes ↓

/sig:discuss → /sig:plan → /sig:execute → /sig:verify → /sig:review → /sig:ship
     │            │            │              │             │              │
     ▼            ▼            ▼              ▼             ▼              ▼
   Human        Human        Human          Human         Human          Human
   gate         gate         gate           gate          gate           gate

Escape hatch: /sig:escalate (upgrade SKETCH → FEATURE → FULL mid-flight)
```

The REVIEW phase (between VERIFY and SHIP) is the key architectural addition from Agent Skills. GSD's existing flow goes straight from "does it work?" to "ship it." Agent Skills inserts "is it good?" — covering code quality, security hardening, performance optimization, and code simplification. This is the difference between shipping code that functions and shipping code that lasts.

**Phase 0 (`/sig:calibrate`)** is the router that prevents over- and under-engineering. It asks 5 diagnostic questions (scope, stakes, novelty, reversibility, horizon) and writes `PROFILE.md`. Downstream commands read the profile and dial rigor up or down — SKETCH mode for throwaways skips verify/review entirely; FULL mode for production apps runs every phase.

> **v1 vs v2 scope:** see the "Scope & Roadmap" section above.

---

## Work Breakdown Structure

### 1.0 Foundation & Scaffolding

**Goal:** Establish the plugin structure, build system, and core infrastructure.

```
1.1 Plugin scaffold
    1.1.1 Initialize plugin directory structure (commands/, agents/, skills/, references/, state/, tools/)
    1.1.2 Configure package.json, build tooling (esbuild), test framework (Vitest)
    1.1.3 Create installer script (< 5 minute setup)
    Done: Plugin installs cleanly, all directories exist, build passes

1.2 State management foundation
    1.2.1 Port GSD's .planning/ state management pattern
    1.2.2 Implement STATE.md, config.json, CONTEXT.md, ROADMAP.md handlers
    1.2.3 Create state read/write API for agents to consume
    Done: State persists across sessions, agents can read/write state files

1.3 Context monitoring
    1.3.1 Port GSD's two-component context bridge
    1.3.2 Implement 35% WARNING and 25% CRITICAL thresholds
    1.3.3 Wire monitoring into agent execution loop
    Done: Context warnings fire at correct thresholds during execution
```

**Source references:**
- GSD state management: https://github.com/gsd-build/get-shit-done → `.planning/` directory pattern
- GSD CLI tools: https://github.com/gsd-build/get-shit-done → `gsd-tools.cjs`

---

### 2.0 Phase Commands (Slash Commands)

**Goal:** Build the 8 primary slash commands that drive the workflow (Phase 0 + 6 phases + new-project convenience).

```
2.1 /sig:new-project — Initialize new project (GSD's /gsd-new-project adapted)
    2.1.1 Creates .planning/ directory structure
    2.1.2 Auto-invokes /sig:calibrate to produce PROFILE.md
    2.1.3 Hands off to /sig:discuss once tier is set
    Done: Creates .planning/ directory, PROJECT.md, PROFILE.md, kicks off DISCUSS phase

2.2 /sig:calibrate — PHASE 0 (NEW — router)
    2.2.1 Asks 5 diagnostic questions (scope, stakes, novelty, reversibility, horizon)
    2.2.2 Classifies tier: SKETCH | FEATURE | SPIKE | FULL
    2.2.3 Writes .planning/PROFILE.md with phases_enabled/skipped + rigor_overrides
    2.2.4 Every downstream command's first action: read PROFILE.md; if phase
          is skipped in current tier, exit; if rigor_overrides apply, respect them
    2.2.5 Escape hatch: /sig:escalate promotes tier mid-flight
    Done: PROFILE.md is written, downstream routing respects it

2.3 /sig:discuss — DISCUSS phase
    2.3.1 Assumptions mode (for existing codebases — GSD pattern)
    2.3.2 Open-ended mode (for new projects)
    2.3.3 Load Agent Skills: idea-refine, spec-driven-development
    2.3.4 Phase gate with anti-rationalization check
    Done: Outputs PROJECT.md, REQUIREMENTS.md, CONTEXT.md; gate approval required

2.4 /sig:plan — PLAN phase
    2.4.1 Multi-agent research step (4 parallel subagents — GSD pattern)
    2.4.2 Planning step with vertical slicing enforcement (Agent Skills)
    2.4.3 Plan Checker (8-dimension validation — GSD)
    2.4.4 Nyquist test-coverage mapping
    2.4.5 Load Agent Skills: planning-and-task-breakdown
    2.4.6 Phase gate with anti-rationalization check
    Done: Outputs {phase}-PLAN.md, RESEARCH.md, {phase}-VALIDATION.md; gate approval required

2.5 /sig:execute — EXECUTE phase
    2.5.1 Wave-based parallel execution (GSD's core pattern)
    2.5.2 Fresh context per task, atomic git commits
    2.5.3 Context rot prevention (re-read CONTEXT.md every ~45 min)
    2.5.4 Load Agent Skills: incremental-implementation, TDD, context-engineering
    2.5.5 Phase gate
    Done: All plan tasks executed, tests pass, atomic commits created

2.6 /sig:verify — VERIFY phase
    2.6.1 Acceptance criteria verification against PLAN.md
    2.6.2 Full test suite execution
    2.6.3 Nyquist compliance check (all 8 dimensions)
    2.6.4 Load Agent Skills: browser-testing, debugging-and-error-recovery
    2.6.5 Phase gate (max 3 loops back to execute)
    Done: All acceptance criteria met, all tests pass, build succeeds

2.7 /sig:review — REVIEW phase (NEW — Agent Skills' key contribution)
    2.7.1 Code review and quality assessment
    2.7.2 Security hardening (OWASP ASVS-informed)
    2.7.3 Performance optimization analysis
    2.7.4 Code simplification pass
    2.7.5 Load Agent Skills: code-review-and-quality, security-and-hardening,
          performance-optimization, code-simplification
    2.7.6 Phase gate with anti-rationalization check
    Done: Code quality, security, performance all assessed; issues addressed or documented

2.8 /sig:ship — SHIP phase
    2.8.1 Pre-ship checklist (no secrets, env vars documented, README, CHANGELOG)
    2.8.2 Clean git history (meaningful atomic commits)
    2.8.3 PR creation with description linked to plan
    2.8.4 Load Agent Skills: git-workflow-and-versioning, ci-cd-and-automation,
          documentation-and-adrs, shipping-and-launch
    2.8.5 Final anti-rationalization check
    Done: PR created, description complete, all checklist items verified

2.9 /sig:escalate — ESCAPE HATCH (promotes tier mid-flight)
    2.9.1 Re-run calibration questions with current context
    2.9.2 Update PROFILE.md with new tier
    2.9.3 Re-enable previously-skipped phases (back-fill if needed)
    Done: PROFILE.md updated, downstream phases re-gated

2.10 /sig:status — META (read-only project inspection)
    2.10.1 Detect project state — three branches:
           A. not calibrated; B. calibrated but unbegun; C. in-flight
    2.10.2 Render compact one-screen report (project + tier + phase +
           blockers + open-questions count + last calibration + next action)
    2.10.3 Tier-aware next-action recommendation honors phases_skipped
    No skills loaded, no agents spawned, no tier-gating preamble (meta).
    Done: snapshot rendered without mutating any .planning/* file

2.11 /sig:resume — META (re-orientation briefing)
    2.11.1 Same 3-branch detection as /sig:status
    2.11.2 Load PROJECT.md (Vision/Problem) + CONTEXT.md (locked
           decisions) + the current phase's artifact (PLAN/PROGRESS/
           VERIFICATION/REVIEW per state.phase)
    2.11.3 Print compact briefing (~30-50 lines) + "Ready to continue
           with /sig:{phase}?" prompt — explicit user confirmation
           gate (does not auto-invoke the next phase command)
    No skills loaded, no agents spawned, no tier-gating preamble (meta).
    Done: briefing rendered; user knows what to type next
```

**Source references:**
- GSD commands: https://github.com/gsd-build/get-shit-done → `/commands/gsd/`
- Agent Skills slash commands: https://github.com/addyosmani/agent-skills → `/.claude/commands/`
- Agent Skills skill files: https://github.com/addyosmani/agent-skills → `/skills/`

---

### 3.0 Agent Definitions

**Goal:** Define all 22 specialized agents with scoped tool access.

```
3.1 Research agents (from GSD — 6 agents)
    - Project Researcher, Phase Researcher, UI Researcher
    - Assumptions Analyzer, Advisor Researcher, Research Synthesizer
    Done: Each agent has .md definition with scoped tool permissions

3.2 Planning & Execution agents (from GSD — 3 agents)
    - Planner, Roadmapper, Executor
    Done: Each agent functional within wave-based execution

3.3 Verification & Quality agents (from GSD — 6 agents)
    - Plan Checker, Integration Checker, UI Checker, Verifier
    - Nyquist Auditor, UI Auditor
    (Security Auditor lives in 3.4 — it's an Agent Skills specialist, not a GSD verifier.
    Earlier draft double-counted it under both categories; corrected here.)
    Done: Each agent validates its domain correctly

3.4 Specialist agents (from Agent Skills — 3 agents)
    - Code Reviewer (loaded during REVIEW phase)
    - Test Engineer (loaded during VERIFY and REVIEW phases)
    - Security Auditor (loaded during REVIEW phase)
    Done: Specialists integrate with GSD's agent spawning, produce actionable findings

3.5 Supporting agents (from GSD — 3 agents + 1 Signal-original)
    - Codebase Mapper, Debugger (from GSD)
    - Phase Gate Enforcer (Signal-original — runs anti-rationalization checks)
    Done: All supporting agents functional

    (Earlier draft also listed Doc Writer + Doc Verifier here. Decision 2026-04-25:
    folded into the `documentation-and-adrs` SHIP-phase skill rather than as separate
    agents. Compound-engineering uses the same skill-not-agent pattern for docs.)
```

**Source references:**
- GSD agents: https://github.com/gsd-build/get-shit-done → `/agents/`
- Agent Skills agents: https://github.com/addyosmani/agent-skills → `/agents/`

---

### 4.0 Quality Skills (On-Demand Loading)

**Goal:** Adapt Agent Skills' 21 skills for on-demand loading within GSD's execution model.

```
4.1 Adapt skill format for on-demand loading
    4.1.1 Each skill stays as standalone .md file with YAML frontmatter
    4.1.2 Add phase-binding metadata (which phase triggers loading)
    4.1.3 Implement loader that injects relevant skills into agent context per phase
    Done: Skills load only when their phase is active, not all at once

4.2 Organize skills by phase
    skills/define/   → idea-refine.md, spec-driven-development.md
    skills/plan/     → planning-and-task-breakdown.md
    skills/build/    → incremental-implementation.md, context-engineering.md,
                       source-driven-development.md, frontend-ui-engineering.md,
                       test-driven-development.md, api-and-interface-design.md
    skills/verify/   → browser-testing-with-devtools.md, debugging-and-error-recovery.md
    skills/review/   → code-review-and-quality.md, code-simplification.md,
                       security-and-hardening.md, performance-optimization.md
    skills/ship/     → git-workflow-and-versioning.md, ci-cd-and-automation.md,
                       deprecation-and-migration.md, documentation-and-adrs.md,
                       shipping-and-launch.md
    skills/meta/     → using-agent-skills.md
    Done: All 21 skills organized, metadata added, loader tested

4.3 Merge reference checklists
    references/anti-rationalization.md (merged from both frameworks)
    references/phase-gates.md (merged gate criteria)
    references/security-checklist.md (from Agent Skills)
    references/performance-checklist.md (from Agent Skills)
    references/testing-checklist.md (from Agent Skills)
    references/accessibility-checklist.md (from Agent Skills)
    references/task-sizing.md (merged from both)
    Done: All reference docs present and cross-referenced from phase commands
```

**Source references:**
- Agent Skills skill files: https://github.com/addyosmani/agent-skills → `/skills/` (all 21)
- Agent Skills reference checklists: https://github.com/addyosmani/agent-skills → `/references/`
- GSD-Skill-Creator format bridge: https://github.com/Tibsfox/gsd-skill-creator

---

### 5.0 Integration Testing & Dogfooding

**Goal:** Validate the plugin works end-to-end by using it to build something real.

```
5.1 Unit tests for state management and context monitoring
    Done: All state operations tested, context thresholds verified

5.2 Integration test: run full 6-phase cycle on a sample project
    Done: Sample project goes from /sig:new-project through /sig:ship

5.3 Dogfood: use the plugin to build a feature OF the plugin
    Done: At least one feature built using the Signal workflow itself

5.4 Multi-runtime smoke test (Claude Code + one other)
    Done: Core workflow functional in at least 2 runtimes
```

---

### 6.0 Documentation & Packaging

```
6.1 README with quickstart guide (install in <5 min)
6.2 Command reference (all 7+ commands with examples)
6.3 Architecture decision records (why key choices were made)
6.4 Contributing guide
6.5 Final plugin packaging and release
    Done: Plugin installable from GitHub, README is sufficient to get started
```

---

## Dependency Map & Critical Path

```
1.0 Foundation ──────────────────────────┐
  │                                      │
  ├──→ 2.0 Phase Commands ──────────┐    │
  │      (needs state mgmt,         │    │
  │       context monitoring)        │    │
  │                                  │    │
  ├──→ 3.0 Agent Definitions ───────┤    │
  │      (needs state mgmt)         │    │
  │                                  │    │
  └──→ 4.0 Quality Skills ─────────┤    │
         (needs loader from 4.1)    │    │
                                    │    │
                                    ▼    │
                              5.0 Integration Testing
                                (needs 2.0 + 3.0 + 4.0)
                                    │
                                    ▼
                              6.0 Documentation & Packaging
                                (needs everything)
```

**Critical path:** 1.0 → 2.0 → 5.0 → 6.0

Work items 2.0, 3.0, and 4.0 can run in parallel once 1.0 is complete. This is a natural fit for GSD's wave-based execution pattern.

---

## Phase Gates

### Gate 1: Foundation Complete
**Timing:** After WBS 1.0
**Go criteria:**
- [ ] Plugin scaffold installs cleanly
- [ ] State management reads/writes .planning/ files correctly
- [ ] Context monitoring fires at correct thresholds
**No-go:** State management is unreliable → fix before proceeding

### Gate 2: Core Workflow Functional
**Timing:** After WBS 2.0 + 3.0 + 4.0
**Go criteria:**
- [ ] All 9 slash commands (`/sig:new-project`, `/sig:calibrate`, `/sig:discuss`, `/sig:plan`, `/sig:execute`, `/sig:verify`, `/sig:review`, `/sig:ship`, `/sig:escalate`) execute without errors
- [ ] `/sig:calibrate` writes a valid `PROFILE.md` and downstream commands respect tier gating
- [ ] `/sig:escalate` correctly upgrades tier and re-enables skipped phases
- [ ] All 24 agents spawn and produce output
- [ ] Skills load on-demand (not all at once) — verify with token measurement
- [ ] Phase gates enforce anti-rationalization checks
- [ ] REVIEW phase (the new addition) runs code quality, security, perf, and simplification
**No-go:** Any phase command fails to execute → fix before integration testing

### Gate 3: Integration Validated
**Timing:** After WBS 5.0
**Go criteria:**
- [ ] Full Phase-0 + six-phase cycle completes on a sample project (at minimum one run through FULL tier)
- [ ] At least one SKETCH-tier run validates that rigor truly drops (no TDD/security/review triggered)
- [ ] At least one plugin feature was built using the plugin itself (dogfooding)
- [ ] Multi-runtime smoke test passes (Claude Code + 1 other)
**No-go:** End-to-end cycle fails → diagnose and fix; don't ship a broken workflow

### Gate 4: Ship
**Timing:** After WBS 6.0
**Go criteria:**
- [ ] README enables installation in <5 minutes
- [ ] Command reference is complete and accurate
- [ ] Plugin passes its own shipping checklist (from `/sig:ship`)
**No-go:** Documentation gaps that would block a new user → fill gaps first

---

## Risk Register

| Risk | Likelihood | Impact | Score | Mitigation | Sequence |
|------|-----------|--------|-------|------------|----------|
| Token budget: loading skills bloats context | High (4) | High (4) | 16 | On-demand loading per phase; measure token cost early | **Phase 1 — test immediately** |
| Agent coordination: 24 agents create execution chaos | Medium (3) | High (4) | 12 | GSD's wave-based pattern already solves this; reuse, don't reinvent | Phase 2-3 |
| Scope creep: trying to port ALL features from both repos | High (4) | Medium (3) | 12 | Strict scope — integration only, not reinvention; out-of-scope list enforced | Ongoing |
| Multi-runtime compatibility breaks | Medium (3) | Medium (3) | 9 | Claude Code first, adapters second; defer other runtimes to v1.1 | Phase 5 |
| License/attribution conflicts | Low (2) | High (4) | 8 | Review both licenses upfront before writing code | **Phase 1 — check first** |

**Sequencing implication:** Token budget risk and license check happen in Phase 1, before significant development investment.

---

## Resource Model

This project assumes a solo developer (or developer + AI agent pair) building iteratively.

| Phase | Estimated Effort | Skills Required |
|-------|-----------------|-----------------|
| 1.0 Foundation | 3-5 days | Node.js, plugin packaging, file I/O |
| 2.0 Phase Commands | 5-8 days | Markdown authoring, workflow design, prompt engineering |
| 3.0 Agent Definitions | 3-5 days | Agent prompt design, tool permission scoping |
| 4.0 Quality Skills | 3-5 days | Skill adaptation, loader implementation |
| 5.0 Integration Testing | 3-5 days | Testing, debugging, end-to-end validation |
| 6.0 Documentation | 2-3 days | Technical writing |
| **Total** | **~19-31 days** | |

With AI-assisted development (using GSD or similar), the lower end is realistic. With manual development, expect the upper end.

---

## Known Unknowns

- [ ] What is the actual token cost of loading Agent Skills' richest skills (security-and-hardening, shipping-and-launch)? Need to measure before committing to the full 21.
- [ ] Does GSD's wave-based execution work cleanly with Agent Skills' exit criteria gates, or do gates need to be adapted for async execution?
- [ ] How much of GSD's `gsd-tools.cjs` CLI can be reused directly vs. needs adaptation for the Signal workflow?
- [ ] What's the right granularity for the REVIEW phase — one command with 4 sub-steps, or 4 separate commands?
- [ ] How do the two frameworks' agent naming conventions reconcile? (GSD uses role-based names; Agent Skills uses function-based names)

---

## How to Start

Open this project in Claude Code and:

1. **Read this PROJECT.md** — it's the spec. Also read `analysis/REPO-ANALYSIS.md` for the landscape context and `analysis/JOURNEY-MAP.html` for the visual.
2. **Check licenses** on both source repos before writing code
3. **Scaffold the plugin** (WBS 1.1)
4. **Measure token cost** of loading 3-4 Agent Skills skill files simultaneously (risk mitigation)
5. **Build `/sig:calibrate` first** — it's the smallest, most self-contained command and establishes the `PROFILE.md` contract that every downstream command will depend on. No skills loaded, no agents spawned — just 5 questions and a YAML write. Ship this and validate it routes correctly before building anything heavier.
6. **Then build `/sig:discuss`** — it's the first phase that exercises the full pattern (command → loads skills → spawns agents → gates approval → respects PROFILE.md tier)
7. **Iterate through phases** using the WBS above

Signal is designed to be built using the very workflow it implements. Once `/sig:calibrate`, `/sig:discuss`, and `/sig:plan` are functional, use them to plan and execute the remaining phases.
