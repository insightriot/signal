---
name: sig:plan
description: "PLAN phase — multi-agent research, plan creation with vertical slicing, 8-dimension validation, and Nyquist test-coverage mapping."
args: "<phase-number>"
---

# PLAN Phase

You are running the PLAN phase of the Signal workflow. Your goal: produce an executable plan that any agent can follow without further clarification.

## 0. Tier-gating preamble (run before anything else)

Read `.planning/PROFILE.md` before any other workflow step.

- **If `PROFILE.md` is missing:** halt with *"No PROFILE.md found at .planning/PROFILE.md. Run `/sig:calibrate` first to tier this project, then re-run `/sig:plan`."* Do not proceed.
- **If `PLAN` is in `phases_skipped`:** exit with *"This tier ({tier}) skips PLAN. Run `/sig:execute` next, or `/sig:escalate` if scope has grown and PLAN should run."* Do not proceed. (No v1 tier currently skips PLAN; this guard is defensive.)
- **Apply `rigor_overrides`** from PROFILE.md:

| Override | Effect on this phase |
|---|---|
| `research_parallelism: 0` | Skip Step 2 (Research) entirely. |
| `research_parallelism: 2` | Spawn 2 research agents instead of 4 (pick the most relevant — usually domain + codebase). |
| `research_parallelism: 4` | Full 4-agent research (domain, codebase, risk, prior art). |
| `plan_validation_dims: none` | Skip Step 4 (Plan Validation) entirely. |
| `plan_validation_dims: core` | Run only 3 dimensions: goal alignment, completeness, testability. |
| `plan_validation_dims: all` | Run all 8 dimensions. |
| `nyquist_enforcement: off` | Skip Step 5 (Nyquist mapping). |
| `nyquist_enforcement: basic` or `strict` | Run Step 5. (Strictness — proof-of-fail-before-pass — is enforced in VERIFY, not here.) |
| `gate_strictness: off` | Auto-advance through plan approval; no user confirmation required. |
| `gate_strictness: light` | Confirm at end of phase (default). |
| `gate_strictness: strict` | Confirm at every step + run anti-rationalization check at the gate. |

Tooling: `tools/lib/profile.js` exposes `readProfile`, `isPhaseEnabled`, `applyRigorOverrides`. Schema reference: `references/profile-schema.md`. Question convention: `references/question-patterns.md`.

## Skill Loading

Load these skills (paths shown — bound to PLAN regardless of which directory the SKILL.md file lives in):
- `${CLAUDE_PLUGIN_ROOT}/skills/plan/planning-and-task-breakdown/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/build/api-and-interface-design/SKILL.md` (cross-bound: lives in `build/`, used in PLAN for designing contracts before code is written)
- `${CLAUDE_PLUGIN_ROOT}/skills/ship/deprecation-and-migration/SKILL.md` (cross-bound: lives in `ship/`, used in PLAN for deprecation planning at design time; also loaded in SHIP for cleanup)

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

### 6. Environment check (final gate before EXECUTE)

PLAN's research happens against assumed runtimes (e.g., "Node 22 + better-sqlite3 v11 prebuilts"). EXECUTE happens against the actual dev machine. Drift between the two — different Node major, missing prebuilt binary, OS-specific compiler toolchain — is a common, expected friction that's cheaper to surface here than at first `npm install`.

For each runtime / native dep / external service identified during research:

- [ ] Note the assumed runtime version in `{phase}-PLAN.md` (e.g., "Node 22+ assumed; tested on Node 22.x").
- [ ] If the project has a package manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, etc.), do a dry-run of the install (`npm install --dry-run`, `cargo check`, etc.) to confirm dependency resolution works on the dev runtime.
- [ ] If a native module is involved, confirm a prebuilt binary exists for the dev runtime — or budget time for source-build dependencies (Xcode CLT, build-essential, etc.) in EXECUTE Slice 1.
- [ ] If research named specific package versions, confirm they are still on the registry and not yanked.

Document any drift discovered (e.g., "research assumed `better-sqlite3@11`; dev machine on Node 25 needs `@12+`") in `{phase}-RESEARCH.md` as an addendum, then either update the plan or budget Slice 1 to handle the version bump.

This step is intentionally lightweight at FEATURE/SKETCH (`research_parallelism: 0–2`); it's primarily a guard against silent assumption drift at FULL where 4-agent research can produce confident-but-stale environment claims.

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
