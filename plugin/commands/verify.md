---
name: sig:verify
description: "VERIFY phase — check the built work against its acceptance criteria and requirements, run the suite and build, and write a report that states its totals."
args: ""
---

# VERIFY

Check that what was built does what the plan and the requirements said, in a report a reader can check.

Every `tools/lib/`, `skills/`, `references/` and `commands/` path in this file is under `${CLAUDE_PLUGIN_ROOT}/`:
import from there, never from another copy of Signal. `baseDir` is the project root; `planningDir` is
`.planning/` in it; `currentEpic` is `current_epic` from `readState` (`tools/lib/state.js`).

## 1. Check VERIFY can run (writes nothing)

`readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`):

- It throws because no profile exists: stop with *"No PROFILE.md found at .planning/PROFILE.md. Run
  `/sig:calibrate` first to tier this project, then re-run `/sig:verify`."*
- `VERIFY` is in `phases_skipped`: the profile is malformed (no tier skips VERIFY). Stop and say so.
- `resolveArtifactPath(planningDir, 'PLAN', { currentEpic, phase: 'PLAN' })` (`tools/lib/resume.js`)
  finds no plan: stop and say to run `/sig:plan`.

`applyRigorOverrides({}, profile)` gives the `gates` used below, and these overrides:

| Override | Effect |
|---|---|
| `nyquist_enforcement` | `off` skips step 6. `basic`: every mapped test exists and covers its scenario. `strict`: also, each new test failed before its code. |
| `gate_strictness: strict` | Runs the Anti-Rationalization Check in step 9. |

| `attention` | How decisions are confirmed |
|---|---|
| `attended` | Ask each decision as you reach it (`gates.confirm_in_phase`), approve the results (`gates.confirm_verify`), and choose the path on a FAIL. |
| `checkpointed` | No approval at the end: say what the phase found and go on. On a FAIL under the loop ceiling, loop back and say so. |
| `unattended` | As `checkpointed`; a decision that is hard to undo is still asked. |

## 2. Record the phase

Only if step 1 let the command through. Call `await transitionPhase(baseDir, 'VERIFY')`
(`tools/lib/state.js`) first: it records the phase being left and sets `phase: VERIFY`. If it
refuses, show its message and stop. Show any `quarantined` entries it returns.
Call it on a re-run too: a re-run while VERIFY is current counts as a new pass, so the loop ceiling
can only come sooner. The one exception: skip it if `phase` is already `VERIFY` and the report step 7
writes does not exist yet. The earlier run stopped before writing it, so the call would refuse and
there is nothing to record.

## 3. Load skills and inputs

Read and apply `skills/verify/debugging-and-error-recovery/SKILL.md`, and
`skills/verify/browser-testing-with-devtools/SKILL.md` if the work changed a user interface.

Read the plan from step 1; the requirements,
`resolveArtifactPath(planningDir, 'REQUIREMENTS', { currentEpic, phase: 'DISCUSS' })`; the
validation file, `resolveArtifactPath(planningDir, 'VALIDATION', { currentEpic, phase: 'PLAN' })`
(none at `nyquist_enforcement: off`); and the progress file,
`artifactName('PROGRESS', { currentEpic, planningDir })`. Do each check yourself: this command
dispatches no verifier agent.

## 4. Check each acceptance criterion

For each task in the plan, check the code against each acceptance criterion and record pass or fail
with evidence: the test that covers it, a command and its output, or a file and line.

## 5. Run the suite and the build

Run the full test suite, the build and the linter, where the project has them. Every test passes,
the build is clean, and no new warnings appear.

## 6. Check the test map

Compare the validation file's map with the tests that exist: is every mapped test written, and does
it cover its scenario? Name each gap.

At `strict`, each new test also needs proof it failed before its code: the parent-run line the
progress file records for its task, or a line in the report naming the test and the commit it came
before. A progress entry with a stated gap has no proof: report it. Code built before `strict` was
on cannot get that proof afterwards (`references/tier-definitions.md`): say so as a limit.

## 7. Write the report

1. Draft `artifactName('VERIFICATION', { currentEpic, planningDir })` from
   `references/verification-template.md`, with the tier's headings. In the coverage section, cite
   each requirement by its id (`AC1.2`, `FR3`): the coverage check finds only the ids the report
   cites, so a report that cites none cannot be checked.
2. Run `diffRequirementCoverage({ requirementsText, verificationText })`
   (`tools/lib/requirement-coverage.js`) on the requirements and the draft, and
   `checkValidationConsistency(validationText)` (`tools/lib/validation-consistency.js`) on the
   validation file. Both are read-only and never throw.
3. Put their results in the report, including at zero:
   - `missing`: requirements declared and not verified. **Name them.** Any `missing` makes the
     verdict FAIL.
   - `deferred`: requirements the requirements file struck out.
   - what the check could not look at: a `cannot-evaluate` outcome with its `reason`, and
     `unattributableGroups`. Never report these as clean.
   - each coverage claim as `{n} of {total}`, with where the total came from (the diff's `basis`).
     A claim with no denominator cannot be checked.
4. Write the file, then run `validateVerificationContent(content, profile.tier)`
   (`tools/lib/verification-template.js`). Fix the report until it passes. It checks that the
   report answers each heading, not that the answers are right: steps 4 to 6 and the coverage
   check do that.

## 8. Record the pass

Decide the verdict and write it in the report:

- **PASS**: every check passed. PASS with documented limits is recorded as
  `recordPass(baseDir, 'VERIFY', 'PASS')`: the limits live in the report.
- **PASS-WITH-FIXES**: a check failed, you fixed it in this phase with a commit per fix, and every
  check passed when run again.
- **FAIL**: anything still fails, including any `missing` requirement. List each failure as a fix to
  make: on a loop back, `/sig:execute` builds those.

Then call `recordPass(baseDir, 'VERIFY', verdict)` (`tools/lib/state.js`), before the Loop Back.

## 9. Phase Gate

### Anti-Rationalization Check

At `gate_strictness: strict`, answer each:

| Temptation | Check |
|---|---|
| "The tests pass, so it must work" | Tests verify code, not user experience. Check the actual behavior |
| "That edge case probably won't happen" | If it's in the acceptance criteria, verify it |
| "It's close enough" | Close enough is not done. Either it meets criteria or it doesn't |

### Exit Criteria
- [ ] Every acceptance criterion checked, with evidence
- [ ] The full test suite passes and the build is clean
- [ ] The test map is checked (unless `nyquist_enforcement: off`)
- [ ] Requirement coverage run (step 7): `missing` is empty, `deferred` and what could not be
      checked are in the report, and every coverage claim has its denominator
- [ ] `validateVerificationContent` passes on the report
- [ ] The verdict is recorded with `recordPass` (step 8)
- [ ] User approves the results — only when `gates.confirm_verify` is set (`attended`)

### Loop Back

On a FAIL, call `loopStatusFor(await readState(baseDir), 'VERIFY')` (`tools/lib/loop-ceiling.js`).
It returns `null` when the count cannot be read: say so and stop. When `atCeiling`, show
`formatLoopCeilingHalt(status)` and stop: a person decides. Otherwise, at `attended`, ask with the
3-options-plus-other pattern (`references/question-patterns.md`, via `AskUserQuestion`); at
`checkpointed` and `unattended`, take A and say so.

A. **Loop back to EXECUTE** (recommended). `/sig:execute` builds the fixes the report lists.
B. **Change the tier with `/sig:escalate`**, when the failure shows the work was calibrated too low.
C. **Accept it as a known limit**: record the failed criteria as limits in the report, to ship with
   that caveat.

Write the path chosen in the report.

## 10. Finish

Commit the report and every `.planning/` file the phase changed (`STATE.md`, `INDEX.md`). This
command sets no next phase: `/sig:execute` records leaving VERIFY on a loop back, and on a pass the
next command does (`/sig:review`, or `/sig:ship` where the tier skips REVIEW; SPIKE skips both).

Except at SKETCH, after the commit call `markFresh(baseDir, { commit: <HEAD> })`
(`tools/lib/state.js`). Wrap it in a catch-all: on any error, warn and continue.
