# Fixer brief: prove the new test fails without the change

The standard brief for any sub-agent that writes a fix or a plan task: the REVIEW fix round
(`commands/review.md` § 4.6), the executor (`agents/executors/executor.md`), and the per-task close in
`commands/execute.md`. Put this file's instructions in the dispatch prompt. Pointing at the file alone
is not enough when the agent cannot read it.

## What you must do

1. **Write the test first**, as the task or finding asks.
2. **Make the change.** Commit it.
3. **Run the new tests against the base**, the commit before your work began:

   ```
   node "${CLAUDE_PLUGIN_ROOT}/tools/lib/parent-run.js" --base <base commit> <each new or changed test file>
   ```

   For a REVIEW fix round, the base is the round's base: for the first round of the run, the HEAD
   at the pass that found the issues; for every later round, the previous round's head, in the order
   the rounds are written and across `## Pass N` sections (`review.md` § 4.6). `checkFixRounds`
   refuses a parent run on any other commit. Name it by its sha. For a plan task,
   it is the commit the task started from. `--of <commit>` means that commit's parent. Use it only
   when your work is exactly one commit.

4. **Paste its output verbatim** into your report: the summary line and every per-file line. Do not
   summarise it and do not re-word it. The summary line is what the round's `**Parent run:**` line or
   the PROGRESS entry carries, and `checkFixRounds` reads that exact shape.

## Reading the result

| Per file | Means | What you report |
|---|---|---|
| `failed` | At least one test in the file failed on the base, for a reason other than a missing module or an uncopied file. | Proof for the tests that failed. **Read the line:** it names the first failure, and every new test in the file that **passed on the base**. Those are hollow: the summary line counts them ("k new tests passed on the base"), the run exits 1, and the round lists them as a gap. Fix them or say why. A test in the file that failed **only on a missing file or module** is not proof either: the line names it, the summary counts it ("k tests failed only on a missing file"), and the run exits 1. |
| `passed` | The test passes on the base: it does not need your change. | **No proof.** The test is hollow, or it tests something else. Fix the test, or say why it cannot fail on the base. |
| `could-not-run` | No result on the base: git failed, the test file is missing, it did not load (often an import of a module that is new in your change), every failure was a missing module, or a missing file that is in the project but new in your change (a fixture or helper: only the named tests are copied), a symlink on the base led outside the worktree, or the tool's run folder in the temp directory is a link or not yours. | **No proof, never reported as proof.** State the gap with the reason the tool gave. |

The command exits 0 only when every file failed on the base, no new test passed there, and no test failed there only on a missing file. Run it from the project root. If it is
stopped (Ctrl-C, a timeout), it removes its worktree first; a run that was killed outright is cleared
by the next run.

## When you cannot run it

Say so as a **stated gap**, never as a pass: `gap — <why>`. Examples: the change touched only a
command file and has no test, or the tests import a module that is new in this change, so the tool
reports `could-not-run`. In that case, also say how the test's red run was seen instead (for example,
"run by hand before the module existed: vitest collected no tests").

A missing result left blank reads as "it was fine". That is the failure this brief exists to stop.

## Why

M6.E16's pass 2 shipped four tests that passed with the guard they tested removed, and they were found
a day later. M6.E14's AC7.2 proved nothing on its own until someone ran it on the parent by hand. Both
times the check was a habit that sometimes happened (`D-M6E17-3`).
