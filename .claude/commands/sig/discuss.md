---
name: sig:discuss
description: "DISCUSS phase — gather implementation decisions through adaptive questioning before planning. Loads idea-refine and spec-driven-development skills."
args: "[--auto] [--assumptions]"
---

# DISCUSS Phase

You are running the DISCUSS phase of the Signal workflow. Your goal: extract every decision that downstream agents (researcher, planner, executor) need to act independently. When this phase ends, the output should be clear enough that no human clarification is needed during PLAN or EXECUTE.

## Skill Loading

Load these skills from `${CLAUDE_PLUGIN_ROOT}/skills/define/`:
- `idea-refine/SKILL.md` — for structuring and stress-testing the idea
- `spec-driven-development/SKILL.md` — for converting ideas into testable specs

Read each skill file and apply its guidance throughout this phase.

## Mode Selection

Check args or ask the user:
- **discuss** (default): Open-ended exploration of requirements, trade-offs, and gray areas
- **assumptions** (`--assumptions`): For existing codebases — analyze code first, then surface assumptions for validation
- **auto** (`--auto`): Claude picks recommended defaults for all gray areas, user reviews at the end

## Workflow

### 1. Load Prior Context

Read from `.planning/`:
- `PROJECT.md` — the project spec
- `PROFILE.md` — tier + rigor overrides from /sig:calibrate
- `STATE.md` — current state
- Any existing `CONTEXT.md` files from prior phases

### 2. Scout Codebase (if existing code)

If there's an existing codebase, scan it to understand:
- Tech stack and frameworks
- Existing patterns and conventions
- Reusable assets
- Integration points

### 3. Identify Gray Areas

Based on PROJECT.md and codebase analysis, identify decisions that aren't yet locked:
- Architecture choices (monolith vs services, framework selection)
- Data model design
- Authentication/authorization approach
- Third-party integrations
- Deployment strategy
- Testing strategy

### 4. Structured Discussion

For each gray area:
1. Present the options with trade-offs
2. Make a recommendation with reasoning
3. Ask for the user's decision
4. Lock the decision

In `--auto` mode: make all recommendations, present them as a batch, and ask for approval.

### 5. Capture Decisions

Write all locked decisions to `.planning/CONTEXT.md`:
```markdown
# Implementation Context

## Locked Decisions
{numbered list of decisions with rationale}

## Deferred Decisions
{decisions explicitly pushed to later phases}

## Assumptions
{assumptions that need validation during EXECUTE}

## Last Updated
{current_date}
```

### 6. Generate Requirements

If the discussion surface enough detail, generate `.planning/REQUIREMENTS.md` with:
- Functional requirements (what it must do)
- Non-functional requirements (performance, security, accessibility)
- Acceptance criteria for each requirement

## Phase Gate

Before transitioning to PLAN, verify:

### Anti-Rationalization Check
| Temptation | Check |
|---|---|
| "We can figure out the details during planning" | Are there unresolved gray areas that will block the planner? |
| "The requirements are obvious" | Has every requirement been explicitly stated with acceptance criteria? |
| "We don't need a spec for something this simple" | Even simple projects benefit from explicit scope boundaries |
| "The user seems impatient, let's move on" | Rushing DISCUSS creates compounding problems in every downstream phase |

### Exit Criteria
- [ ] PROJECT.md is complete and approved
- [ ] CONTEXT.md captures all locked decisions
- [ ] REQUIREMENTS.md exists with acceptance criteria
- [ ] No unresolved gray areas that would block PLAN
- [ ] User explicitly approves transition to PLAN

Update `STATE.md`:
```markdown
## Current Phase
PLAN

## Completed Phases
- CALIBRATE ({date})
- DISCUSS ({current_date})
```
