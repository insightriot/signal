---
name: sig:discuss
description: "DISCUSS phase — gather implementation decisions through adaptive questioning before planning. Loads idea-refine and spec-driven-development skills."
args: "[--auto] [--assumptions]"
---

# DISCUSS Phase

You are running the DISCUSS phase of the Signal workflow. Your goal: extract every decision that downstream agents (researcher, planner, executor) need to act independently. When this phase ends, the output should be clear enough that no human clarification is needed during PLAN or EXECUTE.

## 0. Tier-gating preamble (run before anything else)

Read `.planning/PROFILE.md` before any other workflow step. PROFILE.md drives every phase's behavior; bypassing it defeats the calibration layer.

- **If `PROFILE.md` is missing:** halt with *"No PROFILE.md found at .planning/PROFILE.md. Run `/sig:calibrate` first to tier this project, then re-run `/sig:discuss`."* Do not proceed.
- **If `DISCUSS` is in `phases_skipped`:** exit with *"This tier ({tier}) skips DISCUSS. Run `/sig:plan` next, or `/sig:escalate` if scope has grown and DISCUSS should run."* Do not proceed.
- **Apply `rigor_overrides`** from PROFILE.md:

| Override | Effect on this phase |
|---|---|
| `gate_strictness: off` | Auto-advance — present recommendations as a batch, accept all without confirmation. |
| `gate_strictness: light` | Confirm once at the end of Step 4 (batch approval). |
| `gate_strictness: strict` | Confirm each gray-area decision individually; run anti-rationalization check at the gate. |

Tooling: `tools/lib/profile.js` exposes `readProfile`, `isPhaseEnabled`, and `applyRigorOverrides`. Schema reference: `references/profile-schema.md`. Question-asking convention: `references/question-patterns.md`.

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

For each gray area, ask the user using the **3-options-plus-other** pattern (see `references/question-patterns.md`):

1. **Present exactly three named options.** Each with a one-line description and a "Pick this if:" trade-off that names a real cost or benefit. Force a third if you only have two natural options (e.g., "do nothing for now" or "defer to PLAN") so the user sees the do-nothing trade-off explicitly.
2. **Make an explicit recommendation.** Pick A, B, or C with one-line reasoning. Hiding the recommendation abdicates the synthesis the user invoked Signal for.
3. **Accept "other" as free-text.** If none of the three fit, capture the user's stated reasoning verbatim — it goes into `CONTEXT.md` "Locked Decisions" so future phases see *why* the user went off-pattern.
4. **Lock the decision.**

In `--auto` mode: make all recommendations, present them as a batch, and ask for approval.

`gate_strictness` from PROFILE.md modulates: `off` → batch-approve at end (`--auto` shape); `light` → confirm once at the end; `strict` → confirm each decision individually.

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

**Tier-aware NFR prompt.** Before finalizing REQUIREMENTS.md, check what the tier expects users to think about — production-shaped projects often need NFRs that less-experienced users would miss:

| Tier | NFR prompt — surface and confirm or explicitly defer |
|---|---|
| FULL | Ask: "Have we covered — health/liveness probe, graceful shutdown signal handling, structured request logging, security headers (CSP/HSTS/X-Content-Type-Options), and rate limiting if exposed publicly?" Each item: in-scope, deferred-with-rationale, or N/A. |
| FEATURE | Ask: "Have we covered — error handling at boundaries, log lines for failures, basic input validation?" |
| SPIKE | Skip — exploratory work doesn't need ops hygiene. |
| SKETCH | Skip — one-shot work. |

For FULL specifically, REQUIREMENTS.md is effectively mandatory (strict Nyquist in PLAN needs acceptance criteria to map tests against). For SKETCH, REQUIREMENTS.md is usually unnecessary — PROJECT.md "Done when" carries the same weight.

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
