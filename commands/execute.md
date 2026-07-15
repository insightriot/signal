---
name: sig:execute
description: "EXECUTE phase — wave-based parallel execution with fresh context per task, atomic commits, and context rot prevention."
args: "<phase-number>"
---

# EXECUTE Phase

You are running the EXECUTE phase of the Signal workflow. Your goal: implement every task in the plan with atomic commits and passing tests.

## 0. Tier-gating preamble (run before anything else)

Read the **effective profile** before any other workflow step: `readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`), where `currentEpic` is `current_epic` from STATE.md (via `readState`). In **Epic mode** (a strict `current_epic`) an Epic-scoped `.planning/{EpicID}-PROFILE.md` shadows the project PROFILE for this Epic's phases; in **linear mode** (null / absent / non-strict `current_epic`) it reads `.planning/PROFILE.md` unchanged — byte-identical to pre-E11. Fail-open on the STATE value: a hand-edited or garbage `current_epic` degrades to the project PROFILE, never throws.

- **If neither PROFILE.md is present:** `readEffectiveProfile` throws the same not-found error — halt with *"No PROFILE.md found at .planning/PROFILE.md. Run `/sig:calibrate` first to tier this project, then re-run `/sig:execute`."* Do not proceed.
- **EXECUTE is never in `phases_skipped`.** No tier is zero-work; even SKETCH and SPIKE run EXECUTE. This guard is therefore a sanity check — if you somehow see EXECUTE in `phases_skipped`, treat the PROFILE.md as malformed and halt.
- **Apply `rigor_overrides`** from PROFILE.md:

| Override | Effect on this phase |
|---|---|
| `tdd_required: false` | TDD-first is optional. Test-after or no-tests is permitted (e.g., SKETCH). Step 2 sub-step 2 ("write tests first") becomes optional. |
| `tdd_required: true` | TDD-first is required. Step 2 sub-step 2 enforced — write a failing test before any implementation code. |
| `context_rot_reread: false` | Skip Step 3 (45-min CONTEXT.md re-read). |
| `context_rot_reread: true` | Run Step 3 every ~45 minutes (default). |
| `gate_strictness: off` | Auto-advance through wave transitions; no per-wave confirmation. |
| `gate_strictness: light` | Confirm at end of phase only. |
| `gate_strictness: strict` | Confirm at every wave boundary + run anti-rationalization at exit. |

Tooling: `tools/lib/profile.js` exposes `readProfile`, `readEffectiveProfile`, `isPhaseEnabled`, `applyRigorOverrides`. Schema reference: `references/profile-schema.md`.

**Auto-state-protocol (M4.5.E6 onward).** Each dispatched task is wrapped by `dispatchTaskWithState` in `tools/lib/execute.js`, which calls `setCurrentTask` before the agent runs and `clearCurrentTask({status})` after — so `/sig:resume` can recover from a context-clear mid-EXECUTE. **SKETCH tier disables the auto-protocol entirely; STATE.md updates only via manual `/sig:checkpoint`.** FEATURE/SPIKE tiers run it under `gate_strictness: light` (state-write failures warn + continue). FULL tier runs it under `strict` (state-write failures halt the dispatch). See `tools/lib/execute.js` + `tools/lib/state.js`.

## Skill Loading

Load from `${CLAUDE_PLUGIN_ROOT}/skills/build/`:
- `incremental-implementation/SKILL.md`
- `test-driven-development/SKILL.md` (skill loaded for reference even when `tdd_required: false`; rigor toggles enforcement, not knowledge)
- `context-engineering/SKILL.md`
- `source-driven-development/SKILL.md`
- `frontend-ui-engineering/SKILL.md` (load only if the project has a frontend; conditional loading is a v1.5 candidate — see `.planning/FUTURE-IDEAS.md`)

## Workflow

**Artifact naming (M4.5.E11).** Name each artifact this phase writes with `artifactName(ARTIFACT, { currentEpic })` (`tools/lib/resume.js`), and resolve ones it reads with `resolveArtifactPath(planningDir, ARTIFACT, { currentEpic, phase })` — `currentEpic` is `current_epic` from STATE. **Epic mode** → `{EpicID}-{ARTIFACT}.md` (e.g. `M4.5.E11-PROGRESS.md`); **linear mode** → the `{phase}-{ARTIFACT}.md` forms below, byte-identical to pre-E11. Substitute the `artifactName` result wherever this file writes a literal `.planning/{phase}-*.md` path.

### 1. Load Plan

Read the PLAN and VALIDATION artifacts — resolve each with `resolveArtifactPath(planningDir, ARTIFACT, { currentEpic, phase })` (`{phase}-*.md` linear / `{EpicID}-*.md` Epic).
Verify all tasks have acceptance criteria and test mappings.

### 2. Wave-Based Execution

Group tasks into waves based on dependencies:
- **Wave 1**: Tasks with no dependencies (can run in parallel)
- **Wave 2**: Tasks depending only on Wave 1 outputs
- **Wave N**: Continue until all tasks are scheduled

For each task in a wave, the orchestrator drives the work through `dispatchTaskWithState(baseDir, task, profile)` (from `tools/lib/execute.js`). The wrapper handles steps 1 + 6 automatically; the executor agent handles 2–5:

1. **(orchestrator)** `clearOrphansBeforeDispatch` + `setCurrentTask({id, epic, wave})` — records the task as `in_progress` in `STATE.md` before the agent runs. SKETCH skips this entirely; FULL/strict halts on state-write failure; FEATURE/light warns + continues.
2. **(agent)** Read the task's acceptance criteria and test mapping.
3. **(agent)** Write tests first (TDD) where applicable.
4. **(agent)** Implement the minimum code to pass tests.
5. **(agent)** Run the test suite, then create an atomic git commit with a descriptive message. Return the commit sha to the orchestrator.
6. **(orchestrator)** `clearCurrentTask({id, status: 'done', commit})` on success; `clearCurrentTask({id, status: 'aborted'})` on agent throw (re-thrown to the caller). Then update `.planning/{phase}-PROGRESS.md` if applicable.

### 3. Context Rot Prevention

Every ~45 minutes of execution:
- Re-read `.planning/CONTEXT.md` to refresh locked decisions
- Re-read the current task's acceptance criteria
- Check context budget (warn at 35% remaining, critical at 25%)

### 4. Progress Tracking

After each task, update the PROGRESS artifact (`artifactName('PROGRESS', { currentEpic })` — `{phase}-PROGRESS.md` linear / `{EpicID}-PROGRESS.md` Epic):
```markdown
## Wave {n}
- [x] Task 1 — commit {hash}
- [ ] Task 2 — in progress
- [ ] Task 3 — pending
```

**Optional for single-task plans.** When the plan has only one task (typical at SKETCH tier), `{phase}-PROGRESS.md` is informational and the commit log substitutes for it. Skip without ceremony — the SKETCH dogfood (T3 Task 3) confirmed this works cleanly. At gate_strictness:off, progress tracking is informational only; at strict, write the file even for a single task so the artifact exists for downstream phases to reference.

## Phase Gate

### Anti-Rationalization Check
| Temptation | Check |
|---|---|
| "The tests are too slow, I'll skip them for now" | Skipped tests compound — write them now |
| "This works but I'll refactor it later" | Later never comes. Write it clean the first time |
| "I'll commit everything together at the end" | Atomic commits enable safe rollback. Commit per task |
| "The plan says X but I think Y is better" | Update the plan first. Don't silently diverge |

### Exit Criteria
- [ ] All plan tasks completed with atomic commits
- [ ] All tests pass
- [ ] Build succeeds
- [ ] No silently skipped tasks
- [ ] Progress file reflects completion
