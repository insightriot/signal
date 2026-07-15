---
name: sig:discuss
description: "DISCUSS phase — gather implementation decisions through adaptive questioning before planning. Loads idea-refine and spec-driven-development skills."
args: "[--auto] [--assumptions] [--epic <name>]"
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

## Epic mode (`--epic <name>`) — run before Step 1

Epic mode is **opt-in and additive** (M4.5.E11). Without `--epic`, this phase runs in whatever mode STATE already reflects — linear (`current_epic` null) is byte-identical to pre-E11. With `--epic <name>`, this DISCUSS opens (or rolls to) an Epic **before** loading context, so `current_epic` is written automatically (no hand-editing STATE) and every artifact this phase writes is Epic-scoped (`{EpicID}-*.md`, per the artifact-naming rule).

Resolve the Epic ID from `<name>`:
- If `<name>` is already a strict Epic ID (matches `EPIC_ID_STRICT_RE` from `tools/lib/state.js`, e.g. `M5.E1` — typically the first Epic of a new milestone), use it verbatim.
- Otherwise treat `<name>` as a human label and derive the next ID under the current milestone with `deriveNextEpicId(baseDir)` (`tools/lib/milestones.js`). If it returns `null` (no milestone context — e.g. a project with no prior Epic), ask the user for the milestone and retry as `deriveNextEpicId(baseDir, { milestone })`, or accept a literal `--epic M{N}.E{K}` ID.

Then call `setCurrentEpic(baseDir, resolvedId)` (`tools/lib/state.js`) — it validates the shape, writes `current_epic`, and on a roll resets the coupled `current_wave`/`current_tasks` atomically. Record the human label alongside the resolved ID in `CONTEXT.md` so later phases can show it.

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

For each gray area, render the question via `AskUserQuestion` per `references/question-patterns.md` § Rendering. **One `AskUserQuestion` call per gray area — never bundle multiple gray areas into a single markdown response.** Wall-of-text bundling forces the user to scroll, track state mentally, and answer in unstructured prose; it defeats the point of a structured ask.

For each call:

1. **`header`** — the one-line ask for this gray area.
2. **`options`** — exactly three named options. Each option's `description` carries: a one-line summary, a "Pick this if:" trade-off naming a real cost or benefit, and (on the recommended option) a "(recommended — {one-line rationale})" note. Force a third option if only two are natural (e.g., "do nothing for now" / "defer to PLAN") so the user sees the do-nothing trade-off explicitly.
3. **`multiSelect: false`.** The tool auto-adds "Other."
4. **On "Other"** — accept the user's free-text reply at the next plain-prompt turn (don't issue another `AskUserQuestion`). Write the verbatim reasoning to `CONTEXT.md` "Locked Decisions" so future phases see *why* the user went off-pattern.
5. **Lock the decision** before moving to the next gray area.

In `--auto` mode: select the recommended option for every gray area without invoking `AskUserQuestion`. Log each auto-pick to STDOUT and write to `CONTEXT.md`. Then ask once at the end for batch approval (plain prompt, not `AskUserQuestion`).

`gate_strictness` from PROFILE.md modulates: `off` → batch-approve at end (`--auto` shape); `light` → confirm once at the end; `strict` → confirm each decision individually as it's made (one `AskUserQuestion` per gray area, as above — `strict` is the default for FULL tier).

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

### Mark STATE.md fresh (M4.5.E10.S1.t5, FR3)

**SKETCH tier:** skip this step. STATE.md updates only via manual `/sig:checkpoint`.

**FEATURE/SPIKE/FULL:** after the DISCUSS artifacts (PROJECT.md / CONTEXT.md / REQUIREMENTS.md) are committed, call `markFresh(baseDir, {commit: <git HEAD>})` from `tools/lib/state.js`. This advances `last_updated` + `last_updated_commit` to the phase-close commit so the staleness banner in `/sig:resume` reads fresh after DISCUSS. Run it **after** the commit — passing a pre-commit HEAD records a stale sha and silently defeats the freshness check (AC3.4).

Wrap the call in a **catch-all**: if `markFresh` throws for *any* reason — `StateSchemaError` on a schema-mismatched STATE.md, `StateWriteError` on lock contention, git unavailable — warn and continue. The phase work is done; a state-write blip is a recovery item, not a DISCUSS failure. (Mirrors verify/review/ship; a bare git/lock guard is not enough — `markFresh` can throw `StateSchemaError` too.)
