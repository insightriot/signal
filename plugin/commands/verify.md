---
name: sig:verify
description: "VERIFY phase — check the built work against its acceptance criteria and requirements, run the suite and build, and write a report that states its totals."
args: ""
---

# VERIFY

Check that what was built does what the plan and requirements said, in a report a reader can check.

Every `tools/lib/`, `skills/`, `references/` and `commands/` path in this file is under `${CLAUDE_PLUGIN_ROOT}/`:
import from there, never from another copy of Signal. `baseDir` is the project root; `planningDir` is
`.planning/` in it; `currentEpic` is `current_epic` from `readState` (`tools/lib/state.js`).
`artifactName` returns a path inside `planningDir`.

## 1. Check VERIFY can run (writes nothing)

`readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`):

- It throws because no profile exists: stop with *"No PROFILE.md found at .planning/PROFILE.md. Run
  `/sig:calibrate` first to tier this project, then re-run `/sig:verify`."*
- `VERIFY` is in `phases_skipped`: the profile is malformed. Stop and say so.
- `resolveArtifactPath(planningDir, 'PLAN', { currentEpic, phase: 'PLAN' })` (`tools/lib/resume.js`)
  finds no plan: stop and say to run `/sig:plan`.

`applyRigorOverrides({}, profile)` gives the `gates` used below, and these overrides:

| Override | Effect |
|---|---|
| `nyquist_enforcement` | `off` skips step 6; `strict` adds its failed-first proof. |
| `gate_strictness: strict` | Runs the Anti-Rationalization Check in step 9. |

| `attention` | How decisions are confirmed |
|---|---|
| `attended` | Ask each decision as you reach it (`gates.confirm_in_phase`), and approve the results (`gates.confirm_verify`). |
| `checkpointed` | No approval at the end: say what the phase found and go on. A decision the plan leaves open is still asked. On a FAIL under the loop ceiling, take A and say so. |
| `unattended` | As `checkpointed`; a decision that is hard to undo is still asked. |

## 2. Record the phase

Only if step 1 let the command through. Call `await transitionPhase(baseDir, 'VERIFY')`
(`tools/lib/state.js`) first: it records the phase being left and sets `phase: VERIFY`. If it
refuses, show its message and stop. Show any `quarantined` entries it returns.
Call it on a re-run too (it counts as a pass, so the loop ceiling comes sooner), except: skip it
if `phase` is already `VERIFY` and no VERIFICATION file is on disk yet, as the call would refuse.

## 3. Load skills and inputs

Read and apply `skills/verify/debugging-and-error-recovery/SKILL.md`, and
`skills/verify/browser-testing-with-devtools/SKILL.md` for user-interface work.

Read the plan from step 1; the requirements,
`resolveArtifactPath(planningDir, 'REQUIREMENTS', { currentEpic, phase: 'DISCUSS' })`; the
validation file, `resolveArtifactPath(planningDir, 'VALIDATION', { currentEpic, phase: 'PLAN' })`
(none at `nyquist_enforcement: off`); and the progress file, `artifactName('PROGRESS', { currentEpic,
planningDir })`, where it exists. Do each check yourself: this command
dispatches no verifier agent.

## 4. Check each acceptance criterion

Check the code against each task's acceptance criteria and record pass or fail with evidence: a test, a command and its output, or a file and line.

## 5. Run the suite and the build

Run the full test suite, build and linter, where they exist. All tests pass, the build
is clean, and no new warnings appear.

## 6. Check the test map

Compare the validation file's map with the tests that exist: is every mapped test written, and does
it cover its scenario? Name each gap.

At `strict`, each new test also needs proof it failed before its code: the parent-run line the
progress file records for its task, or a line in the report naming the test and the commit it came
before. A progress entry with a stated gap has no proof: report it. Code built before `strict` was
on cannot get it afterwards: say so as a limit.

## 7. Write the report

1. Draft the report from `references/verification-template.md`, with the tier's headings, fresh on
   every pass (not edited from an earlier one). Cite by id (`AC1.2`, `FR3`) only the requirements
   you verified: the check counts every id the text names as covered.
2. Run `diffRequirementCoverage({ requirementsText, verificationText })`
   (`tools/lib/requirement-coverage.js`) on the requirements and that draft, before it names any id you did not verify, and
   `checkValidationConsistency(validationText)` (`tools/lib/validation-consistency.js`) on the
   validation file.
3. Put their results in the report, including at zero:
   - `missing`: requirements declared and not verified. **Name them.** Any `missing` makes the
     verdict FAIL.
   - `deferred`: requirements the requirements file struck out.
   - what the check could not look at: a `cannot-evaluate` outcome with its `reason`, and each of
     `unattributableGroups`, saying if it is this unit's: then it is missing too. Never report these as clean.
   - each coverage claim as `{n} of {total}`, with where the total came from (the diff's `basis`).
   - the validation file's `assignedNotMapped` and `mappedNotAssigned`, as test-map gaps.

## 8. Record the pass

Decide the verdict:

- **PASS**: every check passed. PASS with documented limits is a PASS (the value
  `recordPass(baseDir, 'VERIFY', 'PASS')` below records): the limits live in the report.
- **PASS-WITH-FIXES**: a check failed, was fixed in this phase (a commit per fix) and then passed.
- **FAIL**: anything still fails, including any `missing` requirement. List each failure as a fix to
  make: on a loop back, `/sig:execute` builds those.

Write the verdict in the report, write it to `artifactName('VERIFICATION', { currentEpic, planningDir })`, then run
`validateVerificationContent(content, profile.tier)` (`tools/lib/verification-template.js`) on it.
Fix the report until it passes. It checks that the report answers each heading, not that the
answers are right. Then call `recordPass(baseDir, 'VERIFY', verdict)` (`tools/lib/state.js`) once,
before the Loop Back; if it refuses, show why, do step 10, and stop.

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
- [ ] Requirement coverage run (step 7): `missing` empty; deferred, unchecked and denominators reported
- [ ] `validateVerificationContent` passes on the report
- [ ] The verdict is recorded with `recordPass` (step 8)
- [ ] User approves the results — only when `gates.confirm_verify` is set (`attended`)

### Loop Back

On a FAIL, call `loopStatusFor(await readState(baseDir), 'VERIFY')` (`tools/lib/loop-ceiling.js`).

- It returns `null`: a list or mark in `STATE.md` it counts from is damaged. Say so, do step 10, and
  stop for the user to fix it.
- `atCeiling`: show `formatLoopCeilingHalt(status)`. At `attended`, ask the options below with it; at
  `checkpointed` and `unattended`, do step 10 and stop: a person decides.
- Otherwise: at `attended`, ask with the 3-options-plus-other pattern (`references/question-patterns.md`,
  via `AskUserQuestion`); at `checkpointed` and `unattended`, take A and say so.

A. **Loop back to EXECUTE** (recommended under the ceiling). This command ends after step 10, and the next command is
   `/sig:execute`, not `/sig:review`.
B. **Change the tier with `/sig:escalate`**, when the tier proves too low.
C. **Accept it as a known limit**: list the failed criteria as limits in the report; then go on as on a pass.

Write the path chosen in the report, keeping every heading filled.

## 10. Finish

Commit the report and every `.planning/` file the phase changed (`STATE.md`, `INDEX.md`). This
command sets no next phase; the next command records leaving VERIFY: `/sig:execute` after a loop
back, else `/sig:review` (`/sig:ship` where the tier skips REVIEW; SPIKE skips both).

Except at SKETCH, after the commit call `markFresh(baseDir, { commit: <HEAD> })`
(`tools/lib/state.js`). Wrap it in a catch-all: on any error, warn and continue.
