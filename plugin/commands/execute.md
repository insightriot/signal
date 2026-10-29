---
name: sig:execute
description: "EXECUTE phase — build the plan's tasks wave by wave, tests first where the tier requires it, one commit per task."
args: ""
---

# EXECUTE

Build every task in the plan: tests first where the tier requires it, one commit per task, and the
suite passing after each.

Every `tools/lib/`, `skills/`, `references/` and `commands/` path in this file is under `${CLAUDE_PLUGIN_ROOT}/`:
import from there, never from another copy of Signal. `baseDir` is the project root; `planningDir` is
`.planning/` in it; `currentEpic` is `current_epic` from `readState` (`tools/lib/state.js`).

## 1. Check EXECUTE can run (writes nothing)

`readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`): the Epic's own
`{EpicID}-PROFILE.md` if it has one, else the project's.

- It throws because no profile exists: stop with *"No PROFILE.md found at .planning/PROFILE.md. Run
  `/sig:calibrate` first to tier this project, then re-run `/sig:execute`."*
- `EXECUTE` is in `phases_skipped`: no tier skips EXECUTE, so the profile is malformed. Stop and say so.

Then check the branch: `checkBranchPosture(baseDir, { tier: profile.tier, override })`
(`tools/lib/branch-guard.js`), where `override` is true only if the user passed
`--allow-default-branch`. It only reads, and never throws.

| Result | Do |
|---|---|
| `ok`, `not-applicable` | Continue (`not-applicable`: SKETCH or SPIKE, no git, or no remote). |
| `on-default` | Stop, showing `formatBranchHalt(result, { command: '/sig:execute' })` as it is. |
| `overridden` | Continue, and show `formatBranchLine(result)` so the choice is on record. |
| `cannot-determine` | Show `formatBranchUnknown(result)` and continue. |

`applyRigorOverrides` gives the `gates` used below, and these overrides:

| Override | Effect |
|---|---|
| `tdd_required` | `true`: each task's failing test is written before its code. `false`: test after, or no test. |
| `context_rot_reread` | `false` skips the re-read in step 5. |
| `gate_strictness: strict` | Runs the Anti-Rationalization Check in step 7. |

| `attention` | How decisions are confirmed |
|---|---|
| `attended` | Confirm at every wave boundary (`gates.confirm_in_phase`). |
| `checkpointed` | Waves run without stopping; a decision the plan leaves open is still asked. No confirm at the end: say what the phase produced and continue. |
| `unattended` | Waves run without stopping. Take each recommendation and record it. A decision that is hard to undo is still asked. |

## 2. Record the phase

Only if step 1 let the command through. Call `await transitionPhase(baseDir, 'EXECUTE')`
(`tools/lib/state.js`) before any other step: it records the phase being left and sets
`phase: EXECUTE`, so the position is true while EXECUTE runs. It refuses if the phase being left
produced no artifact (PLAN without its plan): show its message and stop. If it returns a non-empty
`quarantined` list, show it; those ledger entries were moved, not dropped.

## 3. Load skills and the plan

Read and apply `skills/build/incremental-implementation/SKILL.md`,
`skills/build/test-driven-development/SKILL.md` (even when `tdd_required: false`: the setting
changes what is enforced, not what you know), `skills/build/context-engineering/SKILL.md`,
`skills/build/source-driven-development/SKILL.md`, and, only if the project has a frontend,
`skills/build/frontend-ui-engineering/SKILL.md`.

Read the plan and the validation file: `resolveArtifactPath(planningDir, 'PLAN', { currentEpic, phase: 'PLAN' })`
and the same for `'VALIDATION'` (`tools/lib/resume.js`); there is no validation file at
`nyquist_enforcement: off`. Every task needs acceptance criteria and a mapped test. Name any task that
lacks them and fix the plan before building it.

## 4. Group the tasks into waves

Wave 1 is the tasks with no dependencies; each later wave holds the tasks whose dependencies are all
in earlier waves. Keep in wave 1 what the plan says the Epic runs for the first time. Do each task
yourself, one at a time: this command dispatches no executor agent (`references/agent-reachability.md`).

## 5. Build each task

For each task, in wave order:

1. **Record it** (not at SKETCH): `clearOrphansBeforeDispatch(baseDir, id)` (`tools/lib/execute.js`),
   then `setCurrentTask(baseDir, { id, epic: currentEpic, wave })` (`tools/lib/state.js`), so
   `/sig:resume` can pick up after a context clear. If either write fails, stop at
   `gate_strictness: strict`; otherwise warn and continue.
2. Note the commit the task starts from (`git rev-parse HEAD`).
3. Re-read the task's acceptance criteria and mapped tests, and the `## Decisions` in the
   requirements (`resolveArtifactPath(planningDir, 'REQUIREMENTS', { currentEpic, phase: 'DISCUSS' })`;
   `CONTEXT.md` for an Epic planned before that), unless `context_rot_reread: false`.
4. Write the tests first (required when `tdd_required: true`), then the least code that passes them.
5. Run the test suite. Commit the task on its own, with a message that says what it does.
6. Run the task's new tests against its starting commit, as `references/fixer-brief.md` says:
   `node "${CLAUDE_PLUGIN_ROOT}/tools/lib/parent-run.js" --base <start commit> <each new or changed test file>`.
   It runs vitest only: on another test runner, or with no new test, the result is a stated gap with
   its reason.
7. **Close it** (not at SKETCH): `clearCurrentTask(baseDir, { id, status: 'done', commit })`, or
   `status: 'aborted'` for a task you stop. A failed write here only warns.
8. Add the task to the progress file (step 6). Its entry carries the parent-run summary line; a
   missing or `could-not-run` result is written as a stated gap with its reason, never left blank or
   read as a pass.

## 6. Track progress

After each task, update `artifactName('PROGRESS', { currentEpic, planningDir })`:

```markdown
## Wave {n}
- [x] Task 1 — commit {hash} — parent run: {summary line}
- [ ] Task 2 — in progress
```

With one task the progress file is optional (the commit log stands in for it), except at
`gate_strictness: strict`, where it is always written so later phases can cite it.

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

## 8. Finish

Commit the progress file and `STATE.md`, which the task records changed. Do not set `phase: VERIFY`:
`/sig:verify` sets it when it starts.
