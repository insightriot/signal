# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository is **Signal** (market-facing: *SignalOS*) — a Claude Code plugin that integrates patterns from across the Claude Code plugin ecosystem and adds a project-complexity calibration layer so rigor is right-sized per project.

**v1 MVP — direct ports (currently being built):**
- **GSD (Get Shit Done)** — execution orchestration: wave-based parallel execution, 21 specialized agents, context monitoring, file-based state management
- **Agent Skills** (Addy Osmani) — quality enforcement: 21 skills, 3 specialist agents, anti-rationalization tables, phase gates

**v2 planned integrations (see `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`):**
- **gstack** (Garry Tan) — 15-phase security audit, retro + learn memory loop, office-hours reframing
- **pm-skills** (phuryn) — upstream ideation / validation / strategy phases
- **superpowers** (Jesse Vincent / obra) — harder TDD, systematic-debugging, `<HARD-GATE>` mechanism
- **compound-engineering** (Every Inc) — post-ship Compound memory phase, multi-lens review panel

**Pattern sources (ideas borrowed, not full ports):**
- **planning-with-files** (OthmanAdi) — hook-driven context discipline
- **oh-my-claudecode** (Yeachan-Heo) — deep-interview spec-rigor gate, consensus planning

**Signal's own contribution:**
- `/sig:calibrate` (Phase 0) + `/sig:escalate` — a routing layer that writes `.planning/PROFILE.md` so every downstream command dials rigor up or down based on project tier (SKETCH / FEATURE / SPIKE / FULL). No source repo in the landscape solves this problem; it's Signal's unique contribution.

Command prefix: `/sig:`. The organizing metaphor is *signal vs. noise* at every phase — calibrate tunes the receiver, and the flow amplifies signal (real problem, real coverage, real user value) and suppresses noise (shiny objects, test theater, ship-for-shipping's-sake).

The plugin targets solo developers and small teams who want production-grade engineering output from AI agents — without over-engineering throwaways or under-engineering production systems.

## Current State

Milestones 1–4 closed; v1 + brownfield onboarding (`/sig:init`) feature-complete and shipped. **M4.5 (release hardening / stranger-adoption readiness): CLOSED 2026-07-15** — all Epics E1–E11 shipped across v0.1.1–v0.1.7; the "≥3 non-Signal testers" criterion is **met** (4 non-Signal users onboarded). Highlights: install-path fix (v0.1.1), STATE schema_version 1 + `/sig:checkpoint` (v0.1.2), synthesizer/docs/retro-foundations/`/sig:doctor`/`/sig:add` (v0.1.3), worked example + comparison (v0.1.4), resume-trust + capture integrity (v0.1.5), doc-integrity write-guard (v0.1.6), **Epic-native flow — `--epic` first-class (v0.1.7, 2026-07-15)**.

**Latest: v0.1.9 (2026-07-21) — M5.E4 bug & doc-runtime hygiene close-out:** the 12 confirmed `BUGS.md` bugs cleared (or dismissed) + the FR5 doc-runtime concurrency-lock; REVIEW PASS-WITH-FIXES (a 3-specialist adversarial panel caught + closed a false-green path-confinement bypass — the B19 lesson recurring); 1492 → 1529 tests. Two v0.1.10 carry-overs: **B24** (pre-existing dangle in a closed DECISIONS section blocks migrate) + the **B6 local-stale scope refinement**; the Sprint-3 hygiene *commands* (`/sig:sweep`, CLAUDE.md de-bloat) also → v0.1.10.

**The doc-runtime shipped as v0.1.8 (2026-07-20, combined M5.E1 + M5.E2 + M5.E3).** Signal's memory is now self-maintaining: the `ISSUES-INBOX` → `BACKLOG`/`BUGS` capture lifecycle, an auto-generated `/sig:index` (INDEX.md), a deterministic+offline all-docs hygiene guard, verbatim closed-milestone `DECISIONS.md` **append-log eviction** (anchors preserved), and the `/sig:migrate-memory` command that reorganizes a bloated/old-layout `.planning/` relocate-never-delete + git-reversible. New projects are **born on layout v3**; existing projects converge via the migrate. Dogfooded on Signal's own `.planning/` (DECISIONS.md 178 KB → 33 KB, 0 dropped). **17 slash commands, 26 agents, 21 skills, 1529 tests passing, validator green.** Full detail: `CHANGELOG.md` + the per-Epic retros (`RETROSPECTIVES.md`). Shelved (pending volunteer testers, D-E3-12): E1 Slices 3–5 (Linux/WSL install matrix + versioning-policy doc). Next horizon: the M5 **v2-port re-audit (BR-8)** gates the speculative feature ports (gstack / pm-skills / superpowers / compound-engineering per `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`).

For current state and active work, read in order: `.planning/CONTEXT.md` → `.planning/STATE.md` (YAML frontmatter is authoritative) → `.planning/MILESTONE-5.md`. The full v1 spec is `.planning/PROJECT.md`. See `## Vocabulary` in PROJECT.md for the locked Milestone / Epic / Slice / Task / Phase / Wave / Tier terms and the ID-is-identity rule.

Key supporting docs:
- `analysis/REPO-ANALYSIS.md` — landscape analysis of 7 AI-dev plugins; the seed of Signal.
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` — v2 vision (10-phase architecture).
- `analysis/JOURNEY-MAP.html` — visual companion.
- `GSD-AgentSkills-Combination-Analysis.md` — historical (pre-landscape) two-framework analysis.

## Architecture

Three-layer design, plus a Phase 0 router above it:

0. **Calibration Router (Phase 0, Signal's own)** — `/sig:calibrate` asks 5 diagnostic questions, writes `.planning/PROFILE.md` that gates every downstream phase by tier (SKETCH / FEATURE / SPIKE / FULL). `/sig:escalate` upgrades tier mid-flight.
1. **Orchestration Engine (Layer 1, from GSD)** — wave-based parallel execution, `.planning/` state management, context monitoring (35% warn / 25% critical), agent spawning, CLI tools
2. **Quality Gates (Layer 2, from Agent Skills)** — on-demand skill loading per phase (not all at once), exit criteria checklists, anti-rationalization tables
3. **Anti-Rationalization & Verification (Layer 3, shared)** — Nyquist test-coverage validation, 8-dimension plan validation, specialist verifier agents

## Workflow — Phase 0 + Six Phases

```
/sig:calibrate → /sig:discuss → /sig:plan → /sig:execute → /sig:verify → /sig:review → /sig:ship
   (Phase 0,
    routes by tier)
```

Escape hatch: `/sig:escalate` promotes tier mid-flight if scope grows.

The REVIEW phase (between VERIFY and SHIP) is the key addition over GSD's original flow. It covers code quality, security hardening, performance optimization, and code simplification via Agent Skills' specialist agents.

**Tier-gating:** Every phase command's first action is to read `PROFILE.md`. If the current tier skips that phase, the command exits early. If `rigor_overrides` apply (e.g., `tdd_required: false` in SKETCH), the command respects them.

**v1 vs v2 scope:** v1 is the 6-phase MVP speced in `.planning/PROJECT.md`. v2 expands to 10 phases per `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` (adds IDEATE / VALIDATE / STRATEGIZE upstream and COMPOUND downstream), and is gated on v1 shipping + having real users. See `.planning/PROJECT.md` → "Scope & Roadmap" for the full v1/v2 split and gating criteria.

## Planned Plugin Structure

```
commands/       # 17 slash commands — /sig:new-project, /sig:init, /sig:calibrate,
                # /sig:discuss, /sig:plan, /sig:execute, /sig:verify,
                # /sig:review, /sig:ship, /sig:escalate, /sig:status,
                # /sig:resume, /sig:add, /sig:checkpoint, /sig:doctor,
                # /sig:index, /sig:migrate-memory
agents/         # 26 agents (19 GSD + 3 Agent Skills specialists + 4 brownfield scanners)
skills/         # 21 quality skills organized by phase (define/, plan/, build/, verify/, review/, ship/)
references/     # Merged checklists and gates from both frameworks,
                # plus PROFILE.md schema + tier definitions
state/          # GSD's .planning/ state management (now including PROFILE.md)
tools/          # GSD's CLI tools layer
```

## Key Constraints

- Node.js 22+
- Skills must load on-demand per phase to preserve context budget — never load all 21 at once
- Plugin must be installable in under 5 minutes
- Claude Code is the primary runtime; adapter layer for Cursor/Codex is secondary
- Integration of existing frameworks, not reinvention — respect both projects' licenses
- `STATE.md` uses YAML frontmatter (`schema_version: 1`) as of v0.1.x (M4.5.E6). Schema migrations are auto-applied on first write to a legacy STATE.md; original content is preserved verbatim under an HTML comment marker. See `references/state-schema.md` and `docs/migration-state-schema-v0.1.x.md`.

## Working in this repository

Behavioral rules that apply to every conversation and every agent, in addition to anything Signal's phase commands add on top.

### Naming & plain language
- **Use real names.** Refer to features, functions, files, tables, and flows by the name that exists in the code, plan, or spec. If you don't know the real name, grep for it before using it. Never invent a label that sounds plausible.
- **Mark dev-only terms.** If you reference an internal identifier (a function, a flag, a table), say it's the code-level name — don't present it as user-facing language.
- **No filler jargon.** Don't reach for a fancier word to sound precise. If a term doesn't carry concrete meaning, cut it and say the plain thing.
- **State guesses as guesses.** If you're inferring something, flag it as an assumption. Don't assert it.
- **Don't dress up mistakes.** If you got something wrong, say so plainly and fix it. Never reframe an error as if it were intentional.

### Surface ambiguity, don't resolve silently
- If a request admits multiple interpretations, present them. Don't pick one and proceed.
- If you find a simpler approach than what was asked, surface it. Don't silently substitute.
- If you discover context that conflicts with what you were told, stop and flag it.

### Surgical edits
- Every changed line should trace directly to the requested change. If you can't justify a line against the task, don't write it.
- Don't refactor, reformat, or "improve" code outside the scope of the change — even in files you're already editing.
- Match the existing style of the file you're editing, even if you'd do it differently.
- Pre-existing dead code or issues you notice but weren't asked to fix: mention them. Don't delete or "improve" them unsolicited.
- Orphans your changes created (now-unused imports, variables, helpers): remove them.

## Reference Repositories

- **Agent Skills**: https://github.com/addyosmani/agent-skills
- **GSD**: https://github.com/gsd-build/get-shit-done
- **GSD Skill Creator** (bridge reference): https://github.com/Tibsfox/gsd-skill-creator

## Development Strategy

**Build `/sig:calibrate` first**: It's the smallest, most self-contained command — no skills loaded, no agents spawned. Just 5 questions → YAML write to `PROFILE.md`. Ship this first because every downstream command depends on the `PROFILE.md` contract. Validating the contract early de-risks the entire flow.

**Then `/sig:discuss`**: Once calibration works, build DISCUSS as the first phase that exercises the full pattern — command → reads PROFILE.md → loads skills → spawns agents → gates approval.

**Self-bootstrapping**: Once `/sig:calibrate`, `/sig:discuss`, and `/sig:plan` work, use Signal itself to plan and execute remaining phases. This is the fastest way to validate whether the architecture holds.

**Token budget is the highest risk**: Before investing days in building phase commands, measure the token cost of loading Agent Skills' larger skill files (especially `security-and-hardening`). If they blow the context budget, you'll need to summarize or chunk them — which changes the loader design. Test this in Phase 1.

**Critical path runs through Phase Commands (WBS 2.0)**: The commands are where the two frameworks' philosophies collide — that's where the integration design gets proven or broken. Agents (3.0) and skills (4.0) can be developed in parallel once `/sig:calibrate` + `/sig:discuss` validate the command pattern.

## Critical Path

Foundation (1.0) → `/sig:calibrate` → `/sig:discuss` → rest of Phase Commands (2.0) → Integration Testing (5.0) → Documentation (6.0)

## MPS (automated, by design)

This repo is tracked by **MPS**, Brett's portfolio system of record. A daily `mps-compiler[bot]` job regenerates `STATUS.md` — its frontmatter, the `owner=agent` sections, and "Recent reality"; commits are `[skip ci]` (no CI/deploy). Harmless background activity — rebase past it on push, don't flag it as drift.

- **Don't delete `STATUS.md`** — recreated, and its absence reads as drift in MPS.
- **Don't hand-edit** the frontmatter, `owner=agent` blocks, or "Recent reality" — regenerated daily, edits lost. The `owner=human` sections (`Decision rules`, `Deferred`) are the safe-to-edit zone.
