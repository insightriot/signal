---
name: sig:plan
description: "PLAN phase — multi-agent research, plan creation with vertical slicing, 8-dimension validation, and Nyquist test-coverage mapping."
args: "<phase-number>"
---

# PLAN Phase

You are running the PLAN phase of the Signal workflow. Your goal: produce an executable plan that any agent can follow without further clarification.

## Skill Loading

Load from `${CLAUDE_PLUGIN_ROOT}/skills/plan/`:
- `planning-and-task-breakdown/SKILL.md`

## Workflow

### 1. Load Context

Read from `.planning/`:
- `PROJECT.md`, `PROFILE.md`, `CONTEXT.md`, `REQUIREMENTS.md`
- `STATE.md` — verify current phase is PLAN

### 2. Research (Parallel Agents)

Spawn up to 4 research agents in parallel:
- **Domain researcher** — external docs, libraries, APIs relevant to this phase
- **Codebase researcher** — existing patterns, reusable code, integration points
- **Risk researcher** — what could go wrong, edge cases, known pitfalls
- **Prior art researcher** — how similar problems have been solved

Synthesize research into `.planning/{phase}-RESEARCH.md`.

### 3. Create Plan

Generate `.planning/{phase}-PLAN.md` with:
- Phase goal (one sentence)
- Tasks broken into vertical slices (each slice is independently shippable)
- Dependencies between tasks
- Acceptance criteria per task
- Test strategy per task (TDD where applicable)
- Estimated complexity (S/M/L — not time)

### 4. Plan Validation (8 Dimensions)

Validate the plan against:
1. **Goal alignment** — does every task serve the phase goal?
2. **Completeness** — are all requirements covered?
3. **Dependency correctness** — are dependencies accurate and minimal?
4. **Testability** — can every task be verified?
5. **Scope discipline** — no gold-plating or scope creep?
6. **Context feasibility** — can each task fit in a single agent context?
7. **Risk coverage** — are identified risks mitigated?
8. **Vertical slicing** — is each task a full slice, not a horizontal layer?

### 5. Nyquist Test-Coverage Mapping

For each task, map the acceptance criteria to specific test types:
- Unit tests for logic
- Integration tests for boundaries
- E2E tests for user flows

Write to `.planning/{phase}-VALIDATION.md`.

## Phase Gate

### Anti-Rationalization Check
| Temptation | Check |
|---|---|
| "The plan is in my head, I don't need to write it down" | File-based plans are what make agents durable across sessions |
| "This task is too small to need acceptance criteria" | If it doesn't have criteria, how will you know it's done? |
| "We can figure out the test strategy during execution" | TDD requires knowing what to test before writing code |
| "Vertical slicing is overkill for this" | Horizontal slicing creates integration debt |

### Exit Criteria
- [ ] `{phase}-PLAN.md` exists with vertical slices and acceptance criteria
- [ ] `{phase}-RESEARCH.md` captures relevant findings
- [ ] `{phase}-VALIDATION.md` maps tests to requirements
- [ ] Plan passes 8-dimension validation
- [ ] User explicitly approves the plan
