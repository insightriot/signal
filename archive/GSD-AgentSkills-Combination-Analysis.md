# Should GSD + Agent Skills Be Combined?

## A Strategic Analysis for AI-Assisted Development

---

> **Historical document.** This is the original two-framework analysis (GSD + Agent Skills) that seeded Signal. It predates the broader landscape analysis in `analysis/REPO-ANALYSIS.md`, which expanded the source set to 9 repos across 4 attribution tiers. For current architecture, read `analysis/REPO-ANALYSIS.md` and `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` instead. This document is preserved for the strategic reasoning that shaped Signal's earliest design.

---

## The Mental Model: Two Halves of the Same Brain

Think of building software with AI agents like driving a car on a long road trip.

**Agent Skills** is the **rules of the road** — speed limits, lane discipline, turn signals, pre-flight checklists. It answers: *"What does good driving look like at every moment?"* It prevents you from running red lights (skipping specs), driving without mirrors (skipping tests), or merging blind (skipping security reviews). It's 21 skills across 6 lifecycle phases (Define → Plan → Build → Verify → Review → Ship), each with explicit anti-rationalization tables that counter the agent's natural instinct to take shortcuts.

**GSD (Get Shit Done)** is the **GPS navigation system + engine management** — route planning, fuel monitoring, parallel lane coordination, and knowing when to pull over and recalibrate. It answers: *"How do we actually get from A to B without the car breaking down?"* It solves the mechanical problem of AI context degradation over long sessions through wave-based parallel execution, fresh context windows, file-based state management, and 21 specialized agents.

**Neither alone is sufficient.** A car with perfect rules but no navigation gets lost. A car with perfect navigation but no driving discipline crashes.

---

## The Verdict: Yes, Combine — But Not as a Single Skill

They should absolutely be combined. Here's why:

### Why They're Complementary (Not Competing)

| Dimension | Agent Skills | GSD | Gap if Used Alone |
|-----------|-------------|-----|-------------------|
| **Core problem solved** | Quality enforcement | Context & execution management | Skills alone can't prevent context rot; GSD alone can't prevent quality shortcuts |
| **Architecture** | Static skill files (Markdown) | Orchestration system (CLI + agents + state) | Skills have no execution engine; GSD has no quality gates |
| **Anti-rationalization** | Explicit tables per phase | Implicit via structure | Skills name the excuses; GSD prevents the conditions that create them |
| **Parallel execution** | Not addressed | Wave-based with fresh contexts | Skills assume a single linear agent; GSD assumes agents know what "good" looks like |
| **State persistence** | None (stateless prompts) | `.planning/` directory (Markdown + JSON) | Skills forget across sessions; GSD remembers but doesn't enforce standards |
| **Research depth** | Mentioned but not orchestrated | 4-6 parallel research agents | Skills say "do research"; GSD actually spawns the researchers |
| **Verification** | Checklists and exit criteria | Specialized verifier agents | Skills define what to check; GSD provides the agents to check it |
| **Shipping** | Detailed checklist (feature flags, canary rollouts) | PR creation from verified work | Skills have richer shipping practices; GSD has the automation |

The pattern is clear: **Agent Skills defines the "what" and "why" of quality. GSD provides the "how" of execution.** They operate at different layers of the stack.

---

## Review of the Existing Hybrid Skill (Your Attached File)

The `gsd-agent-hybrid` skill in your folder is a reasonable first pass — it correctly identifies the complementary nature and merges the phase structures. Here's what it gets right and wrong:

### What It Gets Right
- Merges the phase gates (Discuss → Plan → Execute → Verify → Ship)
- Pulls anti-rationalization tables from Agent Skills into every phase
- Integrates GSD's multi-agent research into the Plan phase
- Keeps GSD's context rot prevention during execution
- Includes the vertical slicing rule from Agent Skills
- Preserves the Nyquist test-coverage validation from GSD

### What It's Missing

**Architecturally, it's too flat.** It tries to be one skill file that does everything. This creates three problems:

1. **Token bloat**: Loading this entire skill into context for every task wastes tokens on phases you're not in yet. GSD solved this problem — the whole point of its wave-based architecture is loading only what's needed.

2. **No execution engine**: The skill describes what should happen but has no agents, no state management, no CLI tools. It's a blueprint with no construction crew. GSD's 21 specialized agents and `gsd-tools.cjs` CLI are the execution layer this needs.

3. **Missing Agent Skills depth**: The hybrid drops Agent Skills' richest contributions — security hardening checklists, performance optimization workflows, deprecation/migration patterns, CI/CD automation, and ADR documentation. These aren't luxuries; they're the "Review" phase that prevents technical debt.

4. **No learning loop**: The `gsd-skill-creator` project showed that the real power is in a system that gets smarter over time — observing patterns, generating new skills, composing agents. The flat skill can't do this.

---

## How I'd Actually Combine Them

The right answer isn't a single skill. It's a **layered system** — think of it like a three-layer cake where each layer has a distinct job.

### Layer 1: Orchestration Engine (GSD's Architecture)

GSD's orchestration is the foundation. Keep:
- Wave-based parallel execution with fresh context windows
- File-based state management (`.planning/` directory)
- Context monitoring with degradation warnings
- The CLI tools layer (`gsd-tools.cjs`) for state management
- The agent spawning infrastructure

This is the "operating system" that everything else runs on.

### Layer 2: Quality Gates (Agent Skills' Standards)

Agent Skills becomes the **quality enforcement layer** that gets injected at the right moments:
- **During DISCUSS**: Load `idea-refine` + `spec-driven-development` skills
- **During PLAN**: Load `planning-and-task-breakdown` + inject vertical slicing rules
- **During EXECUTE**: Load `incremental-implementation` + `test-driven-development` + `context-engineering`
- **During VERIFY**: Load `browser-testing` + `debugging-and-error-recovery`
- **During REVIEW** (new phase — GSD skips this): Load `code-review-and-quality` + `security-and-hardening` + `performance-optimization` + `code-simplification`
- **During SHIP**: Load `git-workflow-and-versioning` + `ci-cd-and-automation` + `documentation-and-adrs` + `shipping-and-launch`

The key insight: **skills load on-demand per phase, not all at once.** This respects GSD's context management while getting Agent Skills' depth.

### Layer 3: Anti-Rationalization & Verification (Shared)

Both frameworks contribute here, and this layer acts as the **immune system**:
- Anti-rationalization tables (from Agent Skills) get checked at every phase gate
- Nyquist test-coverage validation (from GSD) runs before and after execution
- 8-dimension plan validation (from GSD) gates the planning phase
- Exit criteria checklists (from Agent Skills) gate every phase transition
- The 3 specialist agents from Agent Skills (code-reviewer, test-engineer, security-auditor) become available as on-demand verifiers alongside GSD's existing verification agents

### The Missing Phase: REVIEW

This is the biggest architectural improvement. GSD goes Discuss → Plan → Execute → Verify → Ship. Agent Skills has a rich "Review" phase between Verify and Ship that includes code quality, simplification, security hardening, and performance optimization. Adding this phase means:

```
DISCUSS → PLAN → EXECUTE → VERIFY → REVIEW → SHIP
                                       ↑
                              Agent Skills' biggest
                              unique contribution
```

This is where Agent Skills earns its keep. GSD's Verify phase asks "does it work?" Agent Skills' Review phase asks "is it good?" — which is the difference between shipping code that functions and shipping code that lasts.

---

## Implementation Approach: Not a Skill — A Plugin

Given both repos' architectures, the right form factor is a **Claude Code plugin** (or equivalent for other runtimes), structured as:

```
gsd-agent-skills-hybrid/
├── commands/            # Slash commands (GSD-style, 7-10 total)
│   ├── discuss.md
│   ├── plan.md
│   ├── execute.md
│   ├── verify.md
│   ├── review.md        # NEW - Agent Skills contribution
│   └── ship.md
├── agents/              # Specialized agents (GSD's 21 + Agent Skills' 3)
│   ├── researchers/     # GSD's research agents
│   ├── executors/       # GSD's execution agents
│   ├── verifiers/       # GSD's verification agents
│   ├── code-reviewer/   # Agent Skills specialist
│   ├── security-auditor/# Agent Skills specialist
│   └── test-engineer/   # Agent Skills specialist
├── skills/              # On-demand quality skills (Agent Skills' 21, loaded per-phase)
│   ├── define/
│   ├── plan/
│   ├── build/
│   ├── verify/
│   ├── review/
│   └── ship/
├── references/          # Checklists and gates (merged from both)
│   ├── anti-rationalization.md
│   ├── phase-gates.md
│   ├── security-checklist.md
│   └── performance-checklist.md
├── state/               # GSD's .planning/ state management
└── tools/               # GSD's CLI tools layer
```

### Why a Plugin, Not a Skill

- **Skills are single files.** This system needs commands, agents, state management, and reference docs working together.
- **Plugins bundle multiple component types.** Commands route to phases, agents do the work, skills provide quality standards, references provide checklists.
- **GSD is already structured as something bigger than a skill.** It has 72 commands, 21 agents, and a CLI tool layer. Forcing that into a single skill file is what makes the existing hybrid feel thin.
- **Agent Skills' author designed it as a multi-file system too** — 21 skills + 3 agents + 7 slash commands + reference checklists. Both authors already knew this wasn't "one file" territory.

---

## The Strategic Insight

Here's the framework for thinking about this, Brett:

```
┌─────────────────────────────────────────────┐
│           WHAT TO BUILD (Quality)            │
│         ┌───────────────────────┐            │
│         │    Agent Skills       │            │
│         │  "Rules of the Road"  │            │
│         │                       │            │
│         │  • Phase gates        │            │
│         │  • Anti-rationalization│            │
│         │  • Exit criteria      │            │
│         │  • Security/perf/docs │            │
│         └───────────┬───────────┘            │
│                     │                        │
│              INJECTED INTO                   │
│                     │                        │
│         ┌───────────▼───────────┐            │
│         │         GSD           │            │
│         │  "The Engine Room"    │            │
│         │                       │            │
│         │  • Context management │            │
│         │  • Wave execution     │            │
│         │  • Agent orchestration│            │
│         │  • State persistence  │            │
│         └───────────────────────┘            │
│          HOW TO BUILD (Execution)            │
└─────────────────────────────────────────────┘
```

Agent Skills without GSD is a set of standards with no engine to enforce them. GSD without Agent Skills is a powerful engine with no opinion on what "good" looks like beyond "does it work."

Together, they're the closest thing to encoding a senior engineering team's judgment into an AI development workflow.

---

## Recommendation for Your Consultancy

This combined framework is directly relevant to your AI implementation practice. The pitch to mid-market orgs:

> "Your AI coding agents are fast but undisciplined. They skip specs, write brittle tests, and accumulate technical debt. This framework gives them the judgment of a senior engineering team — quality gates that prevent shortcuts (Agent Skills) running on an execution engine that doesn't degrade over long sessions (GSD)."

The existing hybrid skill in your folder is a good conversation starter, but the real product is the plugin-level integration described above. That's what would be "nearly bulletproof."
