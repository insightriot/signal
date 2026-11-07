# Course correction — October 2026

**Status:** Steps 0 to 3 done (Step 3: three runs against plain Claude Code, 2026-11-04 to -06).
**Next: [`SLIM-SIGNAL.md`](SLIM-SIGNAL.md)**, agreed 2026-11-07: what Signal is cut down to and the
order it is built in. Where the two disagree, SLIM-SIGNAL.md wins. This file stays the home for the
rule and the freeze. Keep it under its size limit (`tools/doc-budgets.json`).

## Why this exists

A review on 2026-10-26 measured where six months of work went (2,367 commits since 2026-04-13):

- **The autonomous loop was mostly not built.** `/sig:execute` never starts the executor agent (its
  file says "NOT DISPATCHED BY ANY COMMAND"). Wave planning exists only as text. `dispatchTaskWithState`
  has no real caller. Nothing runs the user's test suite.
- **Most of the code is Signal keeping its own records.** About 73% of the ~53,000 lines in
  `plugin/tools/lib/` is record-keeping; about 8% touches the user's code loop.
- **Most of the bugs are too.** About 92% of 217 bug records are in Signal managing itself.
- **The command files became a changelog.** 24 commands, ~470 KB, with 222 references to old bug and
  decision IDs. 78% of their instructions cannot be checked by anything (`ADHERENCE-LOG.md`).
- **It drifted back after being caught once.** `CHANGELOG.md` `[0.1.31]` said "Loop functionality
  shipped: zero" and turned toward the loop; within weeks the work was back on Signal's own records.

**Why it happened:** Signal was tested mainly on its own `.planning/`, so every bug it found was in its
own records, and the backlog filled with them. Standing instructions said to take the next backlog
item without asking whether it mattered. Nothing asked that question.

**What this is not:** a verdict against documentation or rigor. Signal's rigor helped get a real
product into production. The problem was which documents got the work.

## The rule

<!-- rule:begin -->
**Before starting any work on Signal, ask: would someone running Signal on their own project notice
the difference?** That means it changes what the agent builds, how well, or how long it can run on
its own, or how that project keeps its records (docs, bugs, captured ideas, Epics, tasks, decisions).
Work whose only effect is on Signal's own notes about building Signal does not qualify. If nothing
in the backlog passes, say so and stop. Do not invent work. Full context: `.planning/COURSE-CORRECTION.md`.
<!-- rule:end -->

## What Signal is for

1. **Shaping the work** with the person before a build: spec, checks, expected files.
2. **Records for the user's project.** Docs, bugs, captured ideas, Epics and tasks, kept so an agent
   always knows where it is and what is next.
3. **Checks a program can fail, around a build that runs on its own:** open problems shown before,
   named limits filed after, no commit without passing tests. Details: SLIM-SIGNAL.md.

## Three kinds of documents

| Kind | Examples | How to treat it |
|---|---|---|
| Records for a user's project | PROJECT, STATE, Epics, tasks, bugs, decisions | Core product. Invest here. |
| Instructions to the model | `plugin/commands/*.md`, agents, skills | Short, present tense, no history, no old bug IDs. History goes to `CHANGELOG.md` and git. |
| Notes about building Signal | retrospectives, adherence logs, backlog reviews, per-Epic plans | History. Archive it; don't keep it current. |

## Reading the archive

`.planning/archive/` is history. Read something there only when:

- Brett asks you to, or
- you are tracing why a specific line of code or a doc exists, or
- a live document links to a specific archived file and says why.

Never treat it as current state, never cite it as how things are now, and never start work from it.

## Frozen

**Frozen means no new features. It does not mean removed or judged.** A bug in one of these that breaks
a user's project still gets fixed.

- the work store and its migrations (`/sig:item`, `/sig:docs-migrate --work-store`)
- `/sig:advise`
- `/sig:docs-migrate`, `/sig:docs-archive`, `/sig:docs-sweep` and `/sig:docs-index`
- published facts, the adherence harness, Jev claim checks, citation checks
- retrospective and STATE-drift machinery

**Settled 2026-11-07:** a project keeps its records in plain `.md` files, not the work store
(Step 3 run 3; SLIM-SIGNAL.md).

## What actually enforces this

The project's own history shows written rules don't hold on their own (`B117` was written down three
times and fired three times; a GitHub setting fixed it). So:

- **Enforced:** `tests/command-corpus-budget.test.js`. The command files may not grow in number, total
  size, or old-ID references. They may shrink, and shrinking lowers the limit.
- **Enforced:** this file has a size limit in `tools/doc-budgets.json`.
- **Visibility only:** `.claude/settings.json` prints the rule above at the start of every session in
  this repository.
- **Step 3 answered it** (2026-11-06): plain Claude Code builds as well, faster and cheaper. Signal
  keeps only what it adds (SLIM-SIGNAL.md).

## The plan

**Step 0 — stop the spiral.** Done 2026-10-26: this file, the rule, the freeze, the command-file
limits, the session-start reminder, the corrected CLAUDE.md claims, and updated saved preferences.

**Step 1 — prune, and settle how a project keeps its records.**
- Tag the current state before removing anything.
- Commands: 24 down to about 10, archived not deleted (see *Decided* below).
- Rewrite the kept commands as plain steps with no history, aiming for about a quarter of today's size.
- Archive Signal's own notes from `.planning/`; keep PROJECT, STATE, ROADMAP, active decisions, and a
  backlog filtered by the rule. Rewrite CLAUDE.md to about 5 KB.
- **How should a project keep its docs, bugs, captured ideas and work items?** Brett is not convinced
  it is solved. Decided by testing on the test project, not on Signal's own records (see *Records*
  below).

**How the rewrite ran (2026-10-27 to -31).** Small steps, each merged and measured on the test project
before the next: Epic files moved into `.planning/epics/<ID>/` (as code, then filed whole into the
archive on close); then discuss, plan, execute, verify, review and ship rewritten, each about halved or
better; then checkpoint archived, with each phase command updating STATE.md in its own commit.
Measure a branch with `claude --plugin-dir`, and check the session ran the branch's code
(`${CLAUDE_PLUGIN_ROOT}`). Detail: `archive/COURSE-CORRECTION-MEASUREMENTS.md`.

**Step 2 — build the loop.** Each piece is code, not instructions:
1. EXECUTE starts a fresh executor agent per task.
2. A small command builds waves from the plan's dependencies. **Done 2026-11-03 (#335).**
3. A small command runs the project's tests and records the result; VERIFY refuses to pass without it. **Built 2026-11-03**
   (`test-run.js`; with it, the failing-first proof runs without vitest, by exit code: SIG-384).
4. A hook blocks a commit during EXECUTE without a passing test record. **Built 2026-11-03**
   (`hooks/check-commit-test-run.js`; it sees the executor agent's commits too).
5. A Stop hook keeps the agent working inside an Epic while tasks remain and tests pass; calibration
   sets how long it may run before checking in. **Built 2026-11-03** (`hooks/keep-executing.js`).

**Step 3 — prove it. Done 2026-11-04 to -06,** three runs on the test project: Signal vs plain Claude
Code on one feature; the same on three linked features (mixed); plain with Beads, Backlog.md or no
records tool (neither tool helped). Detail: `archive/COURSE-CORRECTION-MEASUREMENTS.md`. The stop
rule was answered by cutting Signal down to what it adds: SLIM-SIGNAL.md.

## Decided 2026-10-26 (Brett's answers, and calls made for him)

- **Test project:** a local branch in the test project, in a separate worktree off its `main`, so its
  in-progress Epic is untouched. Real code, real tests, real records. Not pushed. No more testing on
  Signal's own records or on made-up fixtures.
- **Commands are archived, never deleted.** They move to `archive/commands/` at the repo root, outside
  `plugin/`, so Claude Code stops loading them and nothing is lost. Brett will revisit them once things
  are cleaner. First batch, done: doctor, update, permissions; checkpoint followed on 2026-10-30 (step 4).
  Advise stays until the rewrite, because drive follows advise's steps to pick work. The four docs commands and `item` wait for the rewrite, which decides what replaces them (see *Records*). Folding escalate into
  calibrate and merging init with new-project happen during the rewrite.
- **Order to the deadline (decided 2026-11-03):** loop pieces 1, 3, 4, 5, then one whole unattended
  Epic on a practice project (**done 2026-11-04**, no person until SHIP), then decide whether the
  records-command merge goes before or after Step 3.
- **Step 3 deadline was 2026-12-04;** it ran early. The slim Signal is proven by the reruns in
  SLIM-SIGNAL.md, and becomes 2.0 only after ample test runs.

## How Signal asks questions (a Step 1 rewrite constraint)

Brett, 2026-10-26, on being asked things he had no context for: *"WHICH one, of the options that I did
NOT give you do you like best?"* Signal's commands ask users a lot (calibrate, discuss, drive). Every
question a rewritten command asks must say what it decides and what the agent already checked, and
must carry a recommended answer. Anything the agent can look up is never asked. Plumbing is decided
and stated, not asked. This passes the rule: it changes how long the agent runs on its own.

## Records: what actually goes wrong (measured on the test project)

Measured read-only on 2026-10-26. This is the baseline Step 1 has to fix and Step 3 compares against.

1. **Most things have no ID.** 1 of 10 bugs has one; the rest are headings. Backlog rows mix GitHub
   numbers with no number at all. (The busiest project in the eval corpus had zero stable bug IDs.)
2. **Status is written in prose, in several places.** One bug carries "fixed ... Earlier: reopened ...
   Earlier status: not-a-bug". Closing one Epic touched 8 files to record that it shipped. Its state
   file once said an Epic was open after it shipped.
3. **Finished work stays in the live list.** 9 of 32 backlog entries are struck-through done items.
4. **The roadmap lives in at least five files** (two roadmaps, a milestones file, a milestones folder,
   per-milestone files). An automated read missed the one holding the real priorities.
5. **Old files pile up where the agent looks.** 146 entries in `.planning/`: each Epic leaves 8-10
   files loose at the top, plus 40+ `*-archive` copies of old phase files.
6. **Bookkeeping costs commits.** 15 of 205 recent commits exist only to mark the state file fresh.

**What a fix has to do:** an ID at capture, status in exactly one place, lists generated rather than
hand-edited, one roadmap, each Epic's files in one folder that moves to the archive when it closes, and
closing an Epic as one recorded step.

**Tested 2026-10-26** on a local branch of the test project. Fresh Claude sessions ran the existing
commands as a user would: the work-store migration, then docs archiving.

| Problem | Result |
|---|---|
| 1. No IDs | **Solved.** 48 of 48 entries got an ID; old IDs kept. |
| 2. Status in prose, many places | **Partly, and one regression.** Items now keep status in one place. But 8 bugs fixed months ago now show as open (`confirmed`) in the generated list, because their status line has words after "fixed". "Shipped" is still written in the agent guide, milestone files and retros. |
| 3. Done work in the live list | **Solved** for the 8 entries it could close. |
| 4. Roadmap in 5+ files | **Not addressed.** 9 roadmap or milestone files remain. |
| 5. Old files pile up | **Partly.** 139 to 118 entries at the top of `.planning/`; 21 Epic files moved. 44 `*-archive` copies and 18 loose Epic files remain. |
| 6. Bookkeeping commits | **Not addressed.** |

**Bugs it found that would hit any user's project** (filed as `SIG-361`, `SIG-362`, `SIG-363`):
- Docs archiving moves the **current** Epic's files when the project has no work-store records.
- Fixed bugs written as "fixed in X, PR #N: explanation" are not recognised as fixed.
- The migration looks for `MILESTONE-3.0.md` and misses `MILESTONE-M3.0.md`, so no Epic table is written.

**Superseded 2026-11-07** (run 3: the store is not the problem; plain `.md` files, SLIM-SIGNAL.md).
**Was:** keep the work store's core (an ID per item, status from recorded events, generated
lists): on a real project it fixed problems 1 and 3. The rest is **not** solved by any existing tool,
and the fix is simpler than more tooling: in the rewritten commands, each Epic's files go in
`.planning/epics/<ID>/` from DISCUSS onward so closing is one move; one `ROADMAP.md`; the state file
stays short; closing an Epic is one recorded step that updates nothing by hand. Plus a one-time cleanup
for projects that already have the pile-up. The two data bugs above get fixed first; the third with them (all three in PR #314, plus the same
milestone-name miss in `/sig:advise`, `SIG-258`).

**Re-measured 2026-11-02** on the spare copy, 0.1.54 plus the one-time cleanup in `/sig:docs-migrate`
(frozen, extended because this plan names it): `.planning/` top 146 → 65 entries; `*-archive` copies
45 → 0; loose Epic files 46 → 11 (9 are retrospectives, kept by design); roadmap files 11 → 6
(`ROADMAP.md` plus the MILESTONE files Signal reads); "shipped" in 52 → 32 live files.
