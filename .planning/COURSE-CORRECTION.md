# Course correction — October 2026

**Status:** Step 0 done 2026-10-26 in PR #312 (this file, the rule, the command-file limits, the
reminder at session start). Step 1 started 2026-10-26. Every other file points here; this is the one home for the course
correction. Keep it under its size limit (`tools/doc-budgets.json`).

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

1. **Right-sized rigor.** Calibration picks how much process a piece of work gets.
2. **Records for the user's project.** Docs, bugs, captured ideas, Epics and tasks, kept so an agent
   always knows where it is and what is next.
3. **Loops.** Near-autonomous work inside a scoped chunk (an Epic or slice), stopping only when a
   person is genuinely needed.

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

Whether the work store is the right way for a project to keep its records is an **open question for
Step 1**. It is not decided by this freeze.

## What actually enforces this

The project's own history shows written rules don't hold on their own (`B117` was written down three
times and fired three times; a GitHub setting fixed it). So:

- **Enforced:** `tests/command-corpus-budget.test.js`. The command files may not grow in number, total
  size, or old-ID references. They may shrink, and shrinking lowers the limit.
- **Enforced:** this file has a size limit in `tools/doc-budgets.json`.
- **Visibility only:** `.claude/settings.json` prints the rule above at the start of every session in
  this repository.
- **The real test is Step 3.** If Signal doesn't beat plain Claude Code on a real feature, stop.

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

**How the rewrite runs (decided 2026-10-27).** Small steps, each merged and measured before the next:
1. **Epic folder first, as code.** The resolver that finds an Epic's files already existed for the
   work store's `work/epics/<ID>/` (M6.E11, store on only, and nothing creates that folder since
   M6.E13). It now reads and names files in `.planning/epics/<ID>/` on any project, and finds a closed
   Epic's files in `archive/<M>/E<n>/`, where docs-archive files them. Retrospective and profile stay
   at the top for now; the ship rewrite decides. No command text changes in that PR. Measured on the
   test project: with the current Epic's eight files moved into the folder, the new code read the same
   files with the same contents; `main`'s code silently read old `PLAN.md`/`REQUIREMENTS.md` files
   from another era instead. The one-time cleanup must also fix links to moved files (the work
   store's Epic close already does this, `computeLinkEdits`).
   **Filing the folder next, also as code, before any command writes to it** (decided 2026-10-27):
   docs-archive saw only files at the top of `.planning/`, so a closed Epic whose files were all in
   its folder read "closed, nothing left to move". It now moves the folder whole into
   `archive/<M>/E<n>/` once the close is confirmed and the Epic is no longer current, the same rule
   as before; SHIP itself moves nothing (a close there is only requested). Measured on a copy of the
   test project: `main` said "nothing left to move" over eight files; the new code moved all eight.
2. **Then the phase commands in flow order:** discuss, plan, execute, verify, review, ship (ship last:
   the largest, and the most tests). One or two per PR. Tests that only pin removed wording move to
   `archive/tests/`; tests of behaviour stay. The size limit is lowered each time.
3. **Measured on the test project** by a fresh session running the branch's commands
   (`claude --plugin-dir`). It swaps in the branch's commands, but a command runs the branch's code
   only if its file names `${CLAUDE_PLUGIN_ROOT}`; otherwise the agent finds an installed copy. Check
   which file the session imported before trusting a measurement. Walking one real
   bug through the flow: the sidebar times that don't refresh (not the Step 3 feature). Per command:
   size; whether it names `${CLAUDE_PLUGIN_ROOT}` for every code path; each question asked and whether it says what it decides, what was checked, and a
   recommendation; files left loose at the top of `.planning/`; places status is written; whether the
   phase finishes without a person.
4. **Checkpoint goes.** Each phase command updates the state file itself, at every tier, in the same
   commit as the phase's work. No separate commits to mark it fresh (records problem 6).

**Step 2 — build the loop.** Each piece is code, not instructions:
1. EXECUTE starts a fresh executor agent per task.
2. A small command builds waves from the plan's dependencies.
3. A small command runs the project's tests and records the result; VERIFY refuses to pass without it.
4. A hook blocks a commit during EXECUTE without a passing test record.
5. A Stop hook keeps the agent working inside an Epic while tasks remain and tests pass; calibration
   sets how long it may run before checking in.

**Step 3 — prove it.** Build one real feature on the test project twice: through Signal and with plain
Claude Code. Record time, defects found afterwards, and how often a person had to step in. If Signal
doesn't clearly win by 2026-12-04, keep only what earned its place and stop.

## Decided 2026-10-26 (Brett's answers, and calls made for him)

- **Test project:** a local branch in the test project, in a separate worktree off its `main`, so its
  in-progress Epic is untouched. Real code, real tests, real records. Not pushed. No more testing on
  Signal's own records or on made-up fixtures.
- **Commands are archived, never deleted.** They move to `archive/commands/` at the repo root, outside
  `plugin/`, so Claude Code stops loading them and nothing is lost. Brett will revisit them once things
  are cleaner. First batch, done: doctor, update, permissions. Checkpoint and advise stay until the
  rewrite, because ten phase commands tell users to run checkpoint and drive follows advise's steps to
  pick work. The four docs commands and `item` wait for the rewrite, which decides what replaces them (see *Records*). Folding escalate into
  calibrate and merging init with new-project happen during the rewrite.
- **Step 3 deadline: 2026-12-04.** Step 3 means building one real feature on the test project twice,
  once with Signal and once with plain Claude Code, and comparing. The date allows about a week for
  Step 1 and three for Step 2. If Signal hasn't clearly won by then, keep only what earned its place.

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

**Decision:** keep the work store's core (an ID per item, status from recorded events, generated
lists): on a real project it fixed problems 1 and 3. The rest is **not** solved by any existing tool,
and the fix is simpler than more tooling: in the rewritten commands, each Epic's files go in
`.planning/epics/<ID>/` from DISCUSS onward so closing is one move; one `ROADMAP.md`; the state file
stays short; closing an Epic is one recorded step that updates nothing by hand. Plus a one-time cleanup
for projects that already have the pile-up. The two data bugs above get fixed first; the third with them (all three in PR #314, plus the same
milestone-name miss in `/sig:advise`, `SIG-258`).
