---
name: sig:execute
description: "EXECUTE phase — build the plan's tasks wave by wave, tests first where the tier requires it, one commit per task."
args: ""
---

# EXECUTE

Build the plan's tasks, one commit each, the suite green after each.

Every `tools/lib/`, `skills/`, `references/` and `commands/` path in this file is under `${CLAUDE_PLUGIN_ROOT}/`:
import from there, never from another copy of Signal. `baseDir` is the project root; `planningDir` is
`.planning/` in it; `currentEpic` is `current_epic` from `readState` (`tools/lib/state.js`).

## 1. Check EXECUTE can run (writes nothing)

`readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`):

- It throws because no profile exists: stop with *"No PROFILE.md found at .planning/PROFILE.md. Run
  `/sig:calibrate` first to tier this project, then re-run `/sig:execute`."*
- `EXECUTE` is in `phases_skipped`: the profile is malformed. Stop and say so.
- `resolveArtifactPath(planningDir, 'PLAN', { currentEpic, phase: 'PLAN' })` (`tools/lib/resume.js`)
  finds no plan: stop and say to run `/sig:plan`.

Then the branch: `checkBranchPosture(baseDir, { tier: profile.tier, override })`
(`tools/lib/branch-guard.js`), where `override` is true only if the user passed
`--allow-default-branch`.

| Result | Do |
|---|---|
| `ok`, `not-applicable` | Continue. |
| `on-default` | Stop, showing `formatBranchHalt(result, { command: '/sig:execute' })`. |
| `overridden` | Continue, and show `formatBranchLine(result)`. |
| `cannot-determine` | Show `formatBranchUnknown(result)` and continue. |

`applyRigorOverrides({}, profile)` gives the `gates` used below, and these overrides:

| Override | Effect |
|---|---|
| `tdd_required` | `true`: a failing test before the code. `false`: test after, or none. |
| `context_rot_reread` | `false` skips the re-read in step 5. |
| `gate_strictness: strict` | Runs the Anti-Rationalization Check in step 7. |

| `attention` | How decisions are confirmed |
|---|---|
| `attended` | Confirm before each wave after the first (`gates.confirm_in_phase`), and the finished phase (`gates.confirm_execute`). |
| `checkpointed` | Waves run without stopping; a decision the plan leaves open is still asked. At the end, say what was done and continue. |
| `unattended` | As `checkpointed`, but take each recommendation and record it; ask only if it is hard to undo. |

## 2. Record the phase

Skip this step if `phase` is already `EXECUTE` (a resumed run).
Only if step 1 let the command through. Call `await transitionPhase(baseDir, 'EXECUTE')`
(`tools/lib/state.js`) first: it records the phase being left and sets `phase: EXECUTE`. If it
refuses, show its message and stop.
Show any `quarantined` entries it returns.

## 3. Load skills and the plan

Read and apply each `skills/build/<name>/SKILL.md`: `incremental-implementation`,
`test-driven-development`, `context-engineering`, `source-driven-development`, and, only if the
project has a frontend, `frontend-ui-engineering`.

Read the plan from step 1, and
`resolveArtifactPath(planningDir, 'VALIDATION', { currentEpic, phase: 'PLAN' })` (none at
`nyquist_enforcement: off`). Every task needs acceptance criteria, and a mapped test where there is a
validation file. Fix the plan for any task that lacks them.

## 4. Group the tasks into waves

Wave 1: tasks with no dependencies; wave N: those whose dependencies are in earlier waves. Keep in
wave 1 what the plan says the Epic runs for the first time. Do each task yourself, one at a time: this
command dispatches no executor agent.

## 5. Build each task

For each task, in wave order. On a resumed run (step 2 skipped), skip tasks the progress file or
`last_completed_task` marks done, and resume the one still in `current_tasks`. On a loop back (`phase`
was VERIFY or REVIEW), the tasks are the fixes that phase named, not the plan's:

1. **Record it** (not at SKETCH): `clearOrphansBeforeDispatch(baseDir, id)` (`tools/lib/execute.js`),
   then `setCurrentTask(baseDir, { id, epic: currentEpic, wave })` (`tools/lib/state.js`).
   If either write fails: stop at `gate_strictness: strict`, else warn.
2. Note the commit the task starts from: `git rev-parse HEAD`, or for a resumed task
   `last_completed_task.commit` (HEAD if it has none).
3. Re-read the task's acceptance criteria and mapped tests, and the `## Decisions` in the
   requirements (`resolveArtifactPath(planningDir, 'REQUIREMENTS', { currentEpic, phase: 'DISCUSS' })`;
   `CONTEXT.md` for an Epic planned before that), unless `context_rot_reread: false`.
4. Write the tests first (required when `tdd_required: true`), then the least code that passes them.
5. Run the test suite. Commit the task on its own, staging only its files.
6. Run the task's new tests against its starting commit, as `references/fixer-brief.md` says:
   `node "${CLAUDE_PLUGIN_ROOT}/tools/lib/parent-run.js" --base <start commit> <each new or changed test file>`.
   It runs vitest only; on another runner, or with no new test, write a stated gap with why.
7. **Close it** (not at SKETCH): `clearCurrentTask(baseDir, { id, status: 'done', commit })`, or
   `status: 'aborted'` for a task you cannot finish; then say why in the progress file, skip Finish
   (step 8), and stop: the user fixes the cause and runs `/sig:execute` again. A failed write here only warns.
8. Add the task to the progress file (step 6), with the parent-run summary line, or a stated gap
   with its reason for a missing or `could-not-run` result: never blank, never read as a pass.

## 6. Track progress

After each task, update `artifactName('PROGRESS', { currentEpic, planningDir })`:

```markdown
## Wave {n}
- [x] Task 1 — commit {hash} — parent run: {summary line}
- [ ] Task 2 — in progress
```

With one task the progress file is optional, except at
`gate_strictness: strict`, where it is always written.

## 7. Phase Gate

### Anti-Rationalization Check

At `gate_strictness: strict`, answer each:

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
- [ ] Progress file reflects completion (where step 6 writes one)
- [ ] User accepts the phase — only when `gates.confirm_execute` is set (`attended`)

## 8. Finish

Commit every `.planning/` file the phase changed (progress, `STATE.md`, `INDEX.md`). `/sig:verify`,
not this command, sets `phase: VERIFY`.

Except at SKETCH, after the commit call `markFresh(baseDir, { commit: <HEAD> })`
(`tools/lib/state.js`). Wrap it in a catch-all: on any error, warn and continue.
