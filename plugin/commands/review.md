---
name: sig:review
description: "REVIEW phase — review the built change for quality, security, performance and simplicity, have fresh-context agents read it, fix what they find, and record a verdict."
args: ""
---

# REVIEW

Check that what VERIFY passed is good: correct, secure, fast enough and simple, read by someone other
than its author before the verdict.

Every `tools/lib/`, `skills/`, `references/` and `agents/` path in this file is under
`${CLAUDE_PLUGIN_ROOT}/`: import from there, never from another copy of Signal. `baseDir` is the
project root; `planningDir` is `.planning/` in it; `currentEpic` is `current_epic` from `readState`
(`tools/lib/state.js`). `artifactName` returns a path inside `planningDir`.

## 1. Check REVIEW can run (writes nothing)

`readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`):

- It throws because no profile exists: stop with *"No PROFILE.md found at .planning/PROFILE.md. Run
  `/sig:calibrate` first to tier this project, then re-run `/sig:review`."*
- `REVIEW` is in `phases_skipped`: stop with *"This tier ({tier}) skips REVIEW. Run `/sig:ship`
  next, or `/sig:escalate` if REVIEW should run."*

`applyRigorOverrides({}, profile)` gives the `gates` used below, and these overrides.
`review_depth` decides first: at `quality-only` only step 4.1 of 4.1–4.4 runs, whatever the other three say.

| Override | Effect |
|---|---|
| `review_depth` | `quality-only`: step 4.1 only. `full`: 4.1–4.4. (`none` skips the phase, above.) |
| `security_audit` | `none` skips 4.2; `basic` is the OWASP Top 10 checklist; `full` adds ASVS Level 2. |
| `performance_pass: false` | Skips 4.3. |
| `simplification_pass: false` | Skips 4.4. |

| `attention` | How decisions are confirmed |
|---|---|
| `attended` | Ask each decision as you reach it (`gates.confirm_in_phase`), and approve the results (`gates.confirm_review`). |
| `checkpointed` | No approval at the end: say what the phase found and go on. A decision the plan leaves open is still asked. On a FAIL under the loop ceiling, take A and say so. |
| `unattended` | As `checkpointed`; a decision that is hard to undo is still asked. |

Steps 4.5 and 4.6 run at every depth.

## 2. Record the phase

Only if step 1 let the command through. Call `await transitionPhase(baseDir, 'REVIEW')`
(`tools/lib/state.js`) first: it records the phase being left and sets `phase: REVIEW`. If it
refuses, show its message and stop. Show any `quarantined` entries it returns.
Call it on a re-run too (it counts as a pass, so the loop ceiling comes sooner), except: skip it
if `phase` is already `REVIEW` and no REVIEW file is on disk yet, as the call would refuse.

## 3. Load skills and inputs

From `skills/review/`, read and apply `code-review-and-quality/SKILL.md`, and at `review_depth: full`
also `security-and-hardening/SKILL.md`, `performance-optimization/SKILL.md` and
`code-simplification/SKILL.md`.

**The change under review** is `git diff <base>..HEAD`. The base is
`git merge-base HEAD origin/<branch>`, where `<branch>` is `resolveDefaultBranch(baseDir)`
(`tools/lib/branch-guard.js`). When that returns `null`, or the merge-base is HEAD itself (the work
is on the default branch), the base is the commit that first added the plan:
`git log --diff-filter=A --format=%H -- <plan>`, its last line, with the plan from
`resolveArtifactPath(planningDir, 'PLAN', { currentEpic, phase: 'PLAN' })` (`tools/lib/resume.js`).
Write the base you used in the report.

Read the requirements, `resolveArtifactPath(planningDir, 'REQUIREMENTS', { currentEpic, phase: 'DISCUSS' })`,
and the VERIFY report, `resolveArtifactPath(planningDir, 'VERIFICATION', { currentEpic, phase: 'VERIFY' })`,
for the suite result.

## 4. Review the change

**Open this pass's section first.** The report is `artifactName('REVIEW', { currentEpic, planningDir })`.
Append `## Pass N — {date}, at {sha}` to it (the first pass creates the file), with HEAD as `{sha}`.
If the report already ends with a pass heading that has no verdict recorded (the session that wrote
it ended before `recordPass`), that heading is this pass: continue under it rather than appending
another. Never rewrite an earlier pass.

Categorise every finding in 4.1–4.5 as Critical, Important, Suggestion or Nit.

### 4.1 Quality

Correctness, readability, architecture, security and performance of the change.

### 4.2 Security

At `security_audit: basic`, the OWASP Top 10 checklist; at `full`, ASVS Level 2 as well. Check input
validation at every boundary, secrets handling, security headers and CORS, and dependencies.

### 4.3 Performance

N+1 queries, unpaginated list endpoints, bundle size, caching, needless re-renders.

### 4.4 Simplification

Needless complexity, dead code and unused imports, redundant abstractions, unclear names, and
departures from the project's conventions.

### 4.5 Fresh-context reviewers (required, before the verdict)

Dispatch all three through the Task tool, **in one message so they run in parallel**:

| Agent | `subagent_type` | Reads |
|---|---|---|
| Fresh-context reviewer | `code-reviewer` | the change (step 3) and the requirements |
| Security auditor | `security-auditor` | the change and the requirements |
| Test engineer | `test-engineer` | the change, the requirements and the suite result. Tell it in the prompt that it reports only and must not write: an edit would change the diff the others read. |

Give each nothing else: no `CONTEXT.md`, no `DECISIONS.md`, no plan reasoning, no summary of intent.
Context is what would talk a reviewer out of the problem it is there to find; if it misreads the code
without it, that is a finding about the code. Their findings go into the same categories: a Critical
from them is a Critical.

If a `subagent_type` does not resolve (a development checkout does not register plugin agents),
dispatch a general-purpose agent for each instead, give it that agent's file under `agents/specialists/`
as its instructions with the same inputs, and put "you are read-only: do not modify any file" in its
prompt. Say in the report that this is a request to an agent that has every tool, not a limit on it.
If an agent cannot be dispatched at all, write `cannot-dispatch`, with what was tried, in the report:
it makes the verdict FAIL.

### 4.6 Fix rounds

A fix round is the commits that close the findings of one read: fixes made in this phase, or the fixes
`/sig:execute` made after a FAIL. Every round gets its own fresh read, because fixes to fixes are where
new defects come from. For each round:

1. **Fix it under the fixer brief** ([`references/fixer-brief.md`](../references/fixer-brief.md)),
   whether this session or a sub-agent writes it (a sub-agent gets the brief in its prompt). Write the
   test first, commit, then run `node "${CLAUDE_PLUGIN_ROOT}/tools/lib/parent-run.js"` with `--base`
   set to **the round's base**: for the first round of the run, the HEAD at the pass that found the
   issues; for every later round, the previous round's head, where its fresh read ended. Rounds chain
   in the order they are written, across `## Pass N` sections, so a loop-back round in pass N+1 starts
   at the head of the last round recorded before it.
2. **Dispatch one fresh-context reviewer** (`code-reviewer`, with the fallback in 4.5). Give it only
   that round's diff, `git diff <base>..<head>` with the round's base, and the requirements, under the
   same omissions as 4.5.
3. **Record the round** under this pass's heading, with exactly these two lines:

   ```markdown
   ### Fix round N
   **Fresh read:** <base>..<head> — Critical N, Important N — stop: yes|no
   **Parent run:** <the summary line parent-run.js printed, unchanged>
   ```

   If the parent run could not be done, the line reads `**Parent run:** gap — <why>`: stated, never
   blank, never counted as proof.

**Stop** when a round's fresh read finds 0 Critical and 0 Important (`stop: yes`), or at three rounds
in this pass, whichever comes first. A read that finds issues starts the next round. A chain that
ends at three rounds with findings open is a FAIL.

## 5. Write the report and check it

Fill in this pass's section:

```markdown
## Pass {n} — {date}, at {sha}

**Reviewed:** <base>..<head>

## Critical Issues (must fix before SHIP)
{each with file:line}

## Important Issues (should fix)

## Suggestions (optional improvements)

## Security Findings

## Performance Findings

## Simplification Opportunities

## Fix rounds
{one `### Fix round N` per round (4.6), or "None in this pass"}

## Verdict
- [ ] PASS — ready for SHIP
- [ ] PASS-WITH-FIXES — Important issues, or a Critical, fixed in-phase; ready for SHIP
- [ ] FAIL — issues must be addressed (return to EXECUTE)
```

Decide the verdict:

| Verdict | When |
|---|---|
| PASS | 0 Critical, 0 Important. Suggestions optional. |
| PASS-WITH-FIXES | Important issues **or a Critical** found AND closed in-phase AND total fix ≤ 50 LOC of non-test source AND tests still green AND new coverage written for the defect AND no design impact. |
| FAIL | A Critical **not** fixed in-phase, OR any fix > 50 LOC of non-test source, OR a fix that needs new coverage and does not get it, OR tests can't stay green without re-planning. |

**PASS-WITH-FIXES guidance.** Every condition must hold: the issue was found and closed inside
REVIEW, the fix is ≤ 50 LOC of non-test source, all tests still pass, it carries new coverage for the
defect, and it has no design impact. A Critical can qualify, but only under all of them, because "the
diff was small" is how a Critical gets under-fixed. The new coverage does not count toward the 50 LOC.
A fix that changes the architecture or reaches beyond one file has design impact: FAIL, back to
EXECUTE. List each in-phase fix in the report: path, what it changed, and why it was fixed here.

**Then check the report** as it is on disk: `checkFixRounds(reportContent, verdict, { phasePasses, cwd: baseDir })`
(`tools/lib/review-rounds.js`), with the verdict you are about to record and `phasePasses` set to
`phase_passes` from `readState` (`[]` when STATE has none). `cwd` lets it ask git about each round's
commits. If it refuses, its reasons say what is wrong with the report or the verdict: fix that, and
never write around the check. Put its `gaps` in the report (rounds with no proof, and commits git
could not check), and its `uncovered` commits (after this pass's heading, in no round's range): name
each and say what it is, or record it as a round.

The report holds every pass: append, never rewrite. A `### Fix round` inside a code fence, or inside an HTML comment whose `<!--` opens a line, is not counted. A linear project keeps one report for every
run: its SHIP appends `## Run ended — {date}`, and the check reads only what follows the last
`## Run ended` line. Never write that line by hand; call `markRunEnded(baseDir)` (`tools/lib/state.js`)
when SHIP said it could not write it (`runEnded?.ok === false`), once the cause is fixed. If this run's
passes already follow, call `markRunEnded(baseDir, { keep })`, `keep` being their number (the check's
refusal gives it), so the line goes above them.

## 6. Record the pass

Call `recordPass(baseDir, 'REVIEW', verdict, { fixRounds })` (`tools/lib/state.js`) once, before
the Loop Back, with `fixRounds` the result `checkFixRounds` returned for this verdict. A PASS or
PASS-WITH-FIXES is refused with no `fixRounds`, with one computed for another verdict, or with one
the check did not accept. A FAIL needs none. If it refuses, show why, do step 8, and stop.

## 7. Phase Gate

### Anti-Rationalization Check

At `gate_strictness: strict`, answer each:

| Temptation | Check |
|---|---|
| "The code works and tests pass, review is redundant" | Working code can be insecure, slow, and unmaintainable. Review catches what tests can't |
| "Security hardening is overkill for this project" | Every project that handles user data needs security basics |
| "Performance optimization is premature" | Checking for anti-patterns (N+1, unbounded fetches) is not premature optimization |
| "Simplification is just bikeshedding" | Code clarity directly impacts long-term maintenance cost |

### Exit Criteria
- [ ] Each review step the profile runs (4.1–4.4) is done
- [ ] The fresh-context reviewers (4.5) were dispatched and their findings categorised, or `cannot-dispatch` is in the report
- [ ] Every fix round has its own fresh read and parent run (4.6), and `checkFixRounds` accepted the report for the verdict
- [ ] All Critical issues resolved; Important ones resolved or deferred with a reason
- [ ] The verdict is recorded with `recordPass` (step 6)
- [ ] User approves the results — only when `gates.confirm_review` is set (`attended`)

### Loop Back

On a FAIL, call `loopStatusFor(await readState(baseDir), 'REVIEW')` (`tools/lib/loop-ceiling.js`).

- It returns `null`: a list or mark in `STATE.md` it counts from is damaged. Say so, do step 8, and
  stop for the user to fix it.
- `atCeiling`: show `formatLoopCeilingHalt(status)`. At `attended`, ask the options below with it; at
  `checkpointed` and `unattended`, do step 8 and stop: a person decides.
- Otherwise: at `attended`, ask with the 3-options-plus-other pattern (`references/question-patterns.md`,
  via `AskUserQuestion`); at `checkpointed` and `unattended`, take A and say so.

A. **Loop back to EXECUTE** (recommended under the ceiling). List each Critical and Important issue as
   a fix to make: `/sig:execute` builds those. This command ends after step 8.
B. **Change the tier with `/sig:escalate`**, when the findings show the tier was too low.
C. **Accept it as a known limit**: list the open issues as limits in the report; then go on as on a pass.

Write the path chosen in the report.

## 8. Finish

Commit the report and every `.planning/` file the phase changed, `STATE.md` with them, in one commit.
Do not run `checkFixRounds` again after it: that commit is not in any round, so the check lists it as
uncovered, and editing the report for it leaves `STATE.md` behind. This command sets no next phase; the next command records leaving REVIEW: `/sig:execute` after a loop back, else
`/sig:ship`.
