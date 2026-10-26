# Course correction — October 2026

**Status:** Step 0 done 2026-10-26 (this file, the rule, the command-file limits, the reminder at
session start). Step 1 next. Every other file points here; this is the one home for the course
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
- Commands: 24 down to about 10. Proposed list below, **awaiting Brett**.
- Rewrite the kept commands as plain steps with no history, aiming for about a quarter of today's size.
- Archive Signal's own notes from `.planning/`; keep PROJECT, STATE, ROADMAP, active decisions, and a
  backlog filtered by the rule. Rewrite CLAUDE.md to about 5 KB.
- **Open question: how should a project keep its docs, bugs, captured ideas and work items?** Brett
  is not convinced it is solved. Decide it by testing on the test project (a real app, mid-build; its
  `.planning/` has 146 entries, including 11 old copies of `CONTEXT.md`), not on Signal's own records.

**Step 2 — build the loop.** Each piece is code, not instructions:
1. EXECUTE starts a fresh executor agent per task.
2. A small command builds waves from the plan's dependencies.
3. A small command runs the project's tests and records the result; VERIFY refuses to pass without it.
4. A hook blocks a commit during EXECUTE without a passing test record.
5. A Stop hook keeps the agent working inside an Epic while tasks remain and tests pass; calibration
   sets how long it may run before checking in.

**Step 3 — prove it.** Build one real feature on the test project twice: through Signal and with plain
Claude Code. Record time, defects found afterwards, and how often a person had to step in. If Signal
doesn't clearly win by the date Brett sets, keep only what earned its place and stop.

## Proposed commands for Step 1 — awaiting Brett

| Keep | Retire or move to extras |
|---|---|
| calibrate, discuss, plan, execute, verify, review, ship | advise, docs-index, docs-sweep, docs-migrate, docs-archive |
| drive, resume, status | checkpoint, doctor, update, permissions |
| add, item (records; shape decided in Step 1) | escalate (fold into calibrate), init and new-project (merge into one) |

## Open questions for Brett

1. The test project is mid-Epic on its own branch. Work in a separate worktree there, or a scratch copy?
2. The command list above.
3. The date for Step 3's comparison.
