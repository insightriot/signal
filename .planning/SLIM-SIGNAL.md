# Slim Signal: the proposal (2026-11-07)

Agreed in direction by Brett on 2026-11-07. This is the plan for what Signal becomes after Step 3.
The evidence is in [`archive/COURSE-CORRECTION-MEASUREMENTS.md`](archive/COURSE-CORRECTION-MEASUREMENTS.md)
(Step 3, runs 1 to 3). The plan, the freeze and the rule still live in
[`COURSE-CORRECTION.md`](COURSE-CORRECTION.md); this file is the shape Signal is being cut down to.

## Why

Three tests against plain Claude Code on a real project:

- **Building:** plain Claude Code builds as well as Signal's six-phase flow. It is about 4x faster,
  costs under a third as much, and needs no one to step in. Signal's review rounds and parked
  decisions added time and money but no better code.
- **Records:** two popular records tools (Beads, Backlog.md) did no better than plain `.md` files, and
  on the measure that matters did worse.
- **The real failure, in every version tested, Signal included:** the agent does not look at the known
  open problems before it builds on top of them, and it names limits in its final message without
  filing them anywhere the next build will find them. Better storage did not change that.

So Signal stops building its own build process and records store. Its job is the part no tool we
looked at does: shaping the work up front, making the records actually get read and written, and
keeping the roadmap ranked by what matters.

## The pieces

1. **Shape the work with the person before any build.** What is being built, the stack, the
   requirements, the screens. Written into the backlog item as a short spec plus the checks the
   finished work must pass. The checks are written before the task, not after. Once per feature.
   - **The files it is expected to touch** are listed in the item too. At the end, code checks the
     change against the list. Going outside it is allowed but must be explained; it is not blocked,
     because sensible builds in the Step 3 runs often touched a file nobody predicted.
   - **A check for a never/always rule covers every route out.** When a check written here says
     something is never or always done ("typed answers never reach the agent"), it tests everything
     that leaves (every message, every route), not one field. In run 5, F1's two tests for its rule
     checked the system prompt only and still passed after F3 sent the answers through tool results.
     Telling the builder this at build time had no visible effect in run 6, and the builds that got
     that sentence acted on fewer items (runs 6 and 7), so it was taken out and is written into the
     checks here, before the build. Agreed by Brett 2026-11-10.
   - **Up to three sizes, one recommended.** This replaces calibration's tiers: the process is the
     same every time; what is sized is the job. The agent drafts each with its spec, checks, expected
     files and rough cost, and the person picks:
     - *as asked*: the feature described;
     - *deeper*: the same feature as a top professional would do it. The agent answers: what would
       they do that is not being asked for; what raw material would they start from; which methods
       and tools; what, other than the agent or the person, would show it is right;
     - *higher*: the goal behind the goal ("keep it crash-free" rather than "fix this crash"), tied to
       what the roadmap says the feature is for.
   - **Can the agent check this itself?** Before a size is agreed: are there tests, test data, a way to
     run it? If not, the first job is to make the work checkable. (Named earlier as the missing piece in
     `analysis/AGENT-EFFECTIVENESS-ALIGNMENT.md`, environment readiness, and never built.)
   - **Ambition is agreed here, never during the build.** Once a size is picked, the build stays inside
     it and the expected-files list holds it there. A new idea during the build is filed, not built. In
     Step 3 run 2, Signal built things nobody asked for; plain Claude Code did not.
2. **Before a build: show the open problems.** Code, not an instruction to go and look: before the
   agent starts, it is handed the open items (bugs, follow-ups, limits) that touch the files listed
   in the item, and must fix each one or say why it is leaving it.
   **Built 2026-11-08** as a hook (`show-open-items.js`). Until expected-files lists exist it shows
   the rest of the item's backlog section. First test (run 4): every relevant item seen, more acted on
   than without it, but not most; see piece 5's next step. Shortened the same day: each open item's
   opening and each bullet's lead with its code names and line number, done items as their limit lines
   only. Run 4's text was 16 KB and Claude Code saved it to a file; on the same records it is now about
   7 KB and shown inline.
3. **Build: the agent works alone.** Tests first for each check. Builds until the suite, typecheck and
   lint pass. Makes routine calls itself and logs them. Stops only for a change of scope or something
   hard to undo (the shape of stored data, deletions, anything touching production or money).
4. **One independent review, one fix round.** A fresh reviewer that sees the change, not the builder's
   reasoning. Every bug it reports comes with a test that fails; a claim without one is dropped. One
   round of fixes, then what is left is filed as items.
   - **Borrowed rule: fix the broken piece only.** A fix goes back with the failing test and a scope
     line ("this file only"). Work that passed is not sent back with it. Without the scope line the
     agent fixes the bug plus things it noticed nearby, and a one-line fix becomes a four-file change.
5. **After a build: check the named limits were filed.** Code: every limit or follow-up the agent
   named in its final message must exist as an item in the backlog or bugs file. If one is missing,
   the build is not done.
   **Built 2026-11-08** as a hook (`check-limits-filed.js`). Run 4: all three features filed their
   limits as open items (none did without the checks). Added the same day: each shown item whose code
   names (a file, or a name in backticks) appear in what the build changed must be fixed or named in
   the final message, or the agent is sent back once. Replayed on run 4, it flags the items the grader
   found ignored (F2's "replay setup" and long-file items, F3's "cost of failed calls" item), plus a
   few that share only a name; a blanket "the rest are untouched" line no longer passes. Run 5 (F2 and
   F3 again): acted-on 9 of 10 and 15 of 17, against 2 of 9 and 6 of 10; 3 of those after a push, the
   rest from the shorter text and instruction. Found a new gap for piece 7: F3 reversed F1's recorded
   rule without saying so.
6. **A whole-codebase sweep now and then.** The review only reads the change, so code that no build
   touches is never checked. At the end of a build, if the last full sweep is older than a set limit,
   offer one (`/prose:audit`, a separate plugin on purpose). Its findings are filed like any others.
   - **Borrowed rule: a sweep stops on its own.** Track the new findings each round, compared against
     everything already seen, including findings that were rejected. Stop after two rounds that find
     nothing new. Remembering the rejected ones is what stops it paying to rediscover dead ends.
7. **Standing rules become tests.** When a decision is made that later work must not break ("this view
   never shows that kind of event"), it is written as a test that fails if it is broken, not only as a
   line in a document. After a fix, its cause is written the same way. Only rules about behaviour; the
   rest stay as notes.
   **A test alone did not hold the rule (2026-11-09).** In runs 3 and 5, F3 reversed F1's recorded
   rule (typed answers are never sent to the agent) the same way both times. In run 5 F1 had written
   that rule as two tests, and they still passed after F3: they checked the agent's system prompt,
   and F3 sent the answers through a new route (tool results). So a rule test must check everything
   that leaves, not one field. And the agent must be shown the rule when its change touches the area.
   Matching rules to the change by code name failed on replay: the rule was written in plain words,
   and the code used other names.
   **Built 2026-11-09** in `check-limits-filed.js`: at the end of a build, the "never / always / only
   when" sentences of the `AGENTS.md` and `CLAUDE.md` files in the folders the change touched (not the
   top-level one, which every session reads), as they stood when the build started. The agent is asked
   to say which its change breaks or narrows and update those lines, or to say in one line that it
   keeps them all. A sentence the agent rewrote is not shown. On replay that is 13 sentences for each of
   F2 and F3 in run 5, and both lines F3 left stale are among them; in run 3's F3, the rule it broke is
   too. The before-build text also said a test for a never/always rule must check every route out (taken out after run 7, below).
   Run 6 (F2, F3): the list caught one real stale rule (F2's "the make-up call is unchanged", which F3
   made false and then fixed), with no false claims and no extra push. F3 did not reverse F1's rule
   this time, but it settled that before the check ran, so that is not the check's doing. The "every
   route" sentence produced no such test. A stale line with no never/always word was missed. The run
   failed its bar on F2's acted-on (7 of 10 against 9).
   Run 7 (F2 again, 2026-11-10), all runs regraded on one fixed sheet by one grader: F2 acted on 8, 6
   and 6 of 14 in runs 5, 6 and 7, so the drop held, and the "every route" sentence (the only change)
   was taken out of the before-build text. Its check moves to shaping (piece 1). The same regrade put
   run 5's F3 at 4 of 23, not 15 of 17, and run 6's at 6: acting on items one by one is still weak.
8. **Rank the backlog by real impact.** When the backlog is ordered, a problem that hurts real users
   goes ahead of new features, with the reason written down.

## Records

Plain `.md` files with a few rules: one place to capture, one ranked backlog that is the roadmap, a
"where we are" page, and a done log of what was done, why and how. Finished items leave the live list.
Pieces 2 and 5 are what make the files get used.

**The project's instructions file.** Signal writes the real instructions into `AGENTS.md`, kept short
(an index pointing at the other docs, about 150 lines at most), so every coding tool reads the same
file. `CLAUDE.md` holds one line, `@AGENTS.md`, which pulls the file in. An import, not "see
AGENTS.md": Claude Code reads an `AGENTS.md` on its own only when no `CLAUDE.md` exists (v2.1.277 and
later), and adding a personal `CLAUDE.local.md` silently turns that off. The import works on every
version.

## What is kept from today's Signal

- **No passing tests, no commit.** The hook that refuses a commit without a passing test run (built
  2026-11-03). It is cheap and it is a check a program can fail.

## What gets archived

The six-phase flow as the default, the decision queue, review loops beyond one round, the attention
setting, the tiers, most of the 26 agents, the JSON work store, and Signal's notes about itself.
Archived, not deleted.

## Where the borrowed ideas come from

Both are from an article on agent loops and graphs (x.com/HoodieFade_, 2026-11-04), which also backs
up pieces 1, 3 and 4: a check a program can fail is strong evidence, a reviewer agent's approval is
weak, and the agent should stop only where a mistake is hard to undo. Its other main topic, running
many agents in parallel, is now built into Claude Code itself, so Signal does not build it.

The expected-files list (piece 1) is from an article on agent harnesses (x.com/marfinxx, 2026-11-05),
changed from a hard block to a flag. The three sizes, the four "deeper" questions, the "can it check
this itself" step and the "higher" goal are from Felix Rieseberg, *How to be more ambitious: a
tutorial for humans with models* (felixrieseberg.com, 2026-10). The harness article's other ideas (a model per role, a working copy per
task, a decision log file) are already in Claude Code or were tested here without helping.

## How it is proven, and when it is 2.0

- After each piece is built, rerun the three-feature test against plain Claude Code on fresh copies
  of the test project, with the rule for winning written down before the run.
- **One grading sheet per feature, fixed before grading.** The items, and what counts as acted on,
  are written down once, and one grader scores every run of that feature in one pass, without knowing
  which run is which. Runs 5 and 6 were scored by different graders who counted differently, so their
  F3 numbers could not be compared (2026-11-10).
- The slim Signal must beat plain on the measure it was built for (open problems seen and acted on
  before building; limits filed after), with no more serious defects, no more step-ins, and time and
  cost close to plain's.
- **2.0 only when it is fully buttoned up:** plenty of test runs, on more than one kind of feature,
  showing it works. Not on one good run. Until then changes ship in the 0.1.x line.

## Open

- How an open item is matched to the expected files for piece 2 (items name files today only
  sometimes).
- How old is too old for the sweep (piece 6).
- How a decision gets marked as one that needs a test (piece 7). For now, any never/always/only-when
  sentence in a folder's instruction file counts. Run 6: 13 and 14 sentences listed, none wrongly
  claimed broken, so not too broad. It is too narrow once: a stale line with no never/always word was
  missed. Kept as is (agreed 2026-11-10); widened only if that happens again. Whether F3 keeps F1's
  typed-answers rule is tracked in each run, since one clean run proves little.
- Order of work: pieces 2 and 5 first, since they target the failure every test found.
