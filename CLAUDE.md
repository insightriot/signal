# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository is building a **Claude Code plugin** that combines two open-source frameworks:
- **GSD (Get Shit Done)** — execution orchestration: wave-based parallel execution, 21 specialized agents, context monitoring, file-based state management
- **Agent Skills** (Addy Osmani) — quality enforcement: 21 skills, 3 specialist agents, anti-rationalization tables, phase gates

The plugin targets solo developers and small teams who want production-grade engineering output from AI agents.

## Current State

Pre-code planning phase. The repository contains:
- `PROJECT.md` — the full spec (read this first for any implementation work)
- `GSD-AgentSkills-Combination-Analysis.md` — strategic analysis of why/how to combine the frameworks

No source code, build system, or tests exist yet. Implementation starts with WBS 1.0 (Foundation & Scaffolding) in PROJECT.md.

## Architecture

Three-layer design:

1. **Orchestration Engine (Layer 1, from GSD)** — wave-based parallel execution, `.planning/` state management, context monitoring (35% warn / 25% critical), agent spawning, CLI tools
2. **Quality Gates (Layer 2, from Agent Skills)** — on-demand skill loading per phase (not all at once), exit criteria checklists, anti-rationalization tables
3. **Anti-Rationalization & Verification (Layer 3, shared)** — Nyquist test-coverage validation, 8-dimension plan validation, specialist verifier agents

## Six-Phase Workflow

```
DISCUSS → PLAN → EXECUTE → VERIFY → REVIEW → SHIP
```

The REVIEW phase (between VERIFY and SHIP) is the key addition over GSD's original flow. It covers code quality, security hardening, performance optimization, and code simplification via Agent Skills' specialist agents.

## Planned Plugin Structure

```
commands/       # 7 slash commands (one per phase + new-project)
agents/         # 24 agents (21 GSD + 3 Agent Skills specialists)
skills/         # 21 quality skills organized by phase (define/, plan/, build/, verify/, review/, ship/)
references/     # Merged checklists and gates from both frameworks
state/          # GSD's .planning/ state management
tools/          # GSD's CLI tools layer
```

## Key Constraints

- Node.js 22+
- Skills must load on-demand per phase to preserve context budget — never load all 21 at once
- Plugin must be installable in under 5 minutes
- Claude Code is the primary runtime; adapter layer for Cursor/Codex is secondary
- Integration of existing frameworks, not reinvention — respect both projects' licenses

## Reference Repositories

- **Agent Skills**: https://github.com/addyosmani/agent-skills
- **GSD**: https://github.com/gsd-build/get-shit-done
- **GSD Skill Creator** (bridge reference): https://github.com/Tibsfox/gsd-skill-creator

## Development Strategy

**Self-bootstrapping**: Once the DISCUSS and PLAN commands work, use the plugin itself to plan and execute remaining phases. This is the fastest way to validate whether the architecture holds.

**Token budget is the highest risk**: Before investing days in building commands, measure the token cost of loading Agent Skills' larger skill files (especially `security-and-hardening`). If they blow the context budget, you'll need to summarize or chunk them — which changes the loader design. Test this in Phase 1.

**Critical path runs through Phase Commands (WBS 2.0)**: The commands are where the two frameworks' philosophies collide — that's where the integration design gets proven or broken. Build the DISCUSS command first to validate the full pattern (command → loads skills → spawns agents → gates approval). Agents (3.0) and skills (4.0) can be developed in parallel once the command pattern is validated.

## Critical Path

Foundation (1.0) → Phase Commands (2.0) → Integration Testing (5.0) → Documentation (6.0)
