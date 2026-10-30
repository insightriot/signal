---
name: sig:plan
description: "PLAN phase — research, a plan in vertical slices with acceptance criteria, plan validation, and a test for every criterion."
args: ""
---

# PLAN

Write a plan any agent can follow without asking: tasks in vertical slices, each with acceptance
criteria and a test, ordered so the riskiest thing runs first.

Every `tools/lib/`, `skills/`, `references/` and `commands/` path in this file is under `${CLAUDE_PLUGIN_ROOT}/`:
import from there, never from another copy of Signal. `baseDir` is the project root; `planningDir` is
`.planning/` in it; `currentEpic` is `current_epic` from `readState` (`tools/lib/state.js`).

## 1. Check PLAN can run (writes nothing)

`readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`): the Epic's own
`{EpicID}-PROFILE.md` if it has one, else the project's.

- It throws because no profile exists: stop with *"No PROFILE.md found at .planning/PROFILE.md. Run
  `/sig:calibrate` first to tier this project, then re-run `/sig:plan`."*
- `PLAN` is in `phases_skipped`: stop with *"This tier ({tier}) skips PLAN. Run `/sig:execute` next,
  or `/sig:escalate` if scope has grown and PLAN should run."*

`applyRigorOverrides({}, profile)` gives the `gates` used below, and these overrides:

| Override | Effect |
|---|---|
| `research_parallelism` | `0` skips step 5's research, not its environment check; `2` covers the two most relevant angles; `4` covers all four. |
| `plan_validation_dims` | `none` skips step 7; `core` checks three dimensions; `all` checks eight. |
| `nyquist_enforcement` | `off` skips step 8; `basic` or `strict` runs it (VERIFY enforces strictness). |
| `gate_strictness: strict` | Runs the Anti-Rationalization Check in step 9. |

| `attention` | How decisions are confirmed |
|---|---|
| `attended` | One question per decision, as you reach it (`gates.confirm_in_phase`), and plan approval at the end (`gates.confirm_plan`). |
| `checkpointed` | Decide each with its recommendation; ask once, together, only for decisions the requirements leave open. No approval at the end: say what the phase produced and continue. |
| `unattended` | Take each recommendation and record it. A decision that is hard to undo is still asked. |

## 2. Record the phase

Only if step 1 let the command through. Call `await transitionPhase(baseDir, 'PLAN')`
(`tools/lib/state.js`) before any other step: it records the phase being left and sets
`phase: PLAN`, so the position is true while PLAN runs. It refuses if the phase being left produced
no artifact (DISCUSS without its requirements): show its message and stop. If it returns a
non-empty `quarantined` list, show it; those ledger entries were moved, not dropped.

## 3. Load skills and context

Read and apply `skills/plan/planning-and-task-breakdown/SKILL.md`,
`skills/build/api-and-interface-design/SKILL.md` and
`skills/ship/deprecation-and-migration/SKILL.md`.

Read `PROJECT.md`, `ROADMAP.md`, and the requirements:
`resolveArtifactPath(planningDir, 'REQUIREMENTS', { currentEpic, phase: 'DISCUSS' })`
(`tools/lib/resume.js`). DISCUSS records its decisions there (`## Decisions`, `## Deferred`,
`## Assumptions`). An Epic planned before that kept decisions in `CONTEXT.md`: read it if present.
Then the code the requirements touch.

## 4. Sort the inbox (required)

Captures get a disposition nowhere else, so this step always runs. You need not triage:
always offer "defer all remaining", one batch that stamps every entry.

**Work store on** (`isStoreOn(baseDir)`, `tools/lib/work-store.js`): run `/sig:item triage`. It
follows the attention setting. On a v1 store it refuses and names
`node tools/work-migrate-v2.mjs`: migrate first. Then go to step 5.

**Work store off:** the inbox is `resolveInboxPath(baseDir)` (`ISSUES-INBOX.md`, or the older
`FUTURE-IDEAS.md`). Everything below is in `tools/lib/drain.js`.

1. `listDrainCandidatesWithRecovery(content)` returns `{candidates, danglingFence, recoveredCount}`:
   every top-level `## ` entry not yet dispositioned. If `danglingFence`, say so first: an unclosed
   code fence hid `{recoveredCount}` entries. Those carry `recovered: true`: list them, offer no
   disposition and leave them out of any batch. Before each write, read the file again and take
   `entryIndex` (its position in `parseEntries(content)`, not in this list) and `block` from that read.
2. `listStandingEntries(content)`: state the count beside the candidates, e.g. *"(1 standing
   entry not counted)"*. A standing entry is permanent: no disposition verb applies to it, so offer none.
   No candidates: say *(no inbox candidates to drain)* and go to step 5.
3. For each candidate, one of (every stamp's `reason` is `'{Epic} drain'`; the code ignores others):

| Verb | Effect |
|---|---|
| **promote** | A candidate task for the plan (step 6), routed to a home (below). Stamped `→ Promoted {date} ({Epic} drain).` |
| **defer** | Left for a later pass. Stamped `→ Deferred {date} ({Epic} drain).` |
| **shipped** | Already done. Stamped `→ Shipped {date} ({Epic} drain).`; the block stays (it holds the reasoning). |
| **merge** | Folded into another entry; the block is removed. |
| **delete** | Dropped; the block is removed. |
| **skip** | No change; it comes back at the next drain. |

   Finished work is **shipped**, never deferred or deleted.

   A promote is classified `work` (to `BACKLOG.md`, tagged `roadmap` or `hygiene`) or `bug` (to
   `BUGS.md`), with an offered cleaned-up title (a blank keeps the source heading). Route it with
   `promoteDrainEntry(baseDir, { classification, block, tag, title, entryIndex, reason, date })`,
   where `block` is `content.slice(range.start, range.end)`. It writes the destination
   (`promoteToBacklog` or `promoteToBugs`) before it stamps the entry.

4. **Every write is previewed, at every attention setting.** Compute the result with
   `applyDisposition` (or `applyDispositions` for a batch), show the diff, and write with
   `applyDispositionToFile` only after it is accepted, one call per entry. A **promote** is always written by
   `promoteDrainEntry`, never by those two, which only stamp the inbox: keep it out of the batch
   and show its destination write in the preview. **delete** and **merge** also need a per-entry
   *confirm* or *keep*; *keep* leaves the file unchanged.

| `attention` | How the drain asks |
|---|---|
| `attended` | One entry at a time, with the proposed verb. |
| `checkpointed`, `unattended` | Propose a verb for every entry and show one diff of them all; apply on one acceptance. Never propose delete or merge here: leave those entries for a person and list them. |

5. **The trigger watchlist.** `parseTriggerWatchlist(content)` returns `null` when the project has
   none (skip), else `{rows, unevaluated, decided, dated}`. Report `dated` first: a passed date
   whose condition was not met is marked *expired-clean*. Decide each `unevaluated` row: promote it,
   or re-park it with a new written condition and a date. Give `decided` as a count.
6. **Evict finished entries.** `evictTerminalToLedger(baseDir, { dryRun: true })` shows which
   finished entries would move to the ledger (a deferred entry stays); on acceptance call it without `dryRun`. If it reports `danglingFence: true` it changed nothing: say so.

## 5. Research

Cover the angles `research_parallelism` allows: **domain** (external docs, libraries, APIs),
**codebase** (patterns, reusable code, integration points), **risk** (edge cases, pitfalls), **prior
art**. Do the research yourself: this command dispatches no research agents
(`references/agent-reachability.md`). Write the findings to
`artifactName('RESEARCH', { currentEpic, planningDir })` (`tools/lib/resume.js`).

**At every tier, even when research is skipped**, check the environment the plan assumes: runtime
versions, an install dry run where the project has a manifest (`npm install --dry-run`,
`cargo check`), a prebuilt binary for any native module, and that named package versions still
exist. Note drift in the research file (or the plan, without one) and plan for it.

## 6. Write the plan

Write `artifactName('PLAN', { currentEpic, planningDir })`:

- the goal, in one sentence;
- tasks as vertical slices, each shippable on its own, with dependencies, acceptance criteria, a test
  strategy (test first where the tier requires it) and a size (S/M/L, not time);
- the runtime versions assumed;
- per task, where they apply: **Files likely touched**, **Out of scope** (what the task does not
  do), and an exemplar reference (a pointer to the section of RESEARCH that found one). A plan
  without these three is reported, never failed.

**What this Epic does for the first time.** Name what the Epic will *run* for the first time, not what
it builds: a tool used for its real purpose rather than to prove itself, an instruction actually
followed rather than read, or a code path taken by a project shape not tried before. **Put it in the
first wave**, ahead of work that looks more important. If nothing qualifies, say so. Defects hide in
what was built and never run for its purpose.

Decisions the requirements leave open that change what gets built are asked as DISCUSS asks them
(`commands/discuss.md` step 5). Plumbing (file layout, test mechanics, tooling) is decided and stated.

## 7. Check the plan

At `core`: goal alignment, completeness, testability. At `all`, also: dependency correctness, scope
discipline (no gold-plating), context feasibility (each task fits one agent's context), risk coverage,
vertical slicing (each task a full slice, not a layer). Fix what fails and check again.

## 8. Map tests to acceptance criteria

Map every task's acceptance criteria to tests: unit for logic, integration for boundaries,
end-to-end for user flows. Write `artifactName('VALIDATION', { currentEpic, planningDir })`.

## 9. Phase Gate

### Anti-Rationalization Check

At `gate_strictness: strict`, answer each:

| Temptation | Check |
|---|---|
| "The plan is in my head, I don't need to write it down" | Would a fresh agent know what to do from the file alone? |
| "This task is too small to need acceptance criteria" | Without criteria, how will you know it's done? |
| "We can figure out the test strategy during execution" | Test first requires knowing what to test before the code. |
| "Vertical slicing is overkill for this" | Does any task leave a layer that nothing uses yet? |
| "The plan's decided — skip the inbox drain" | No: step 4 is the only place captures get a disposition, and skipped ones rot. "defer all remaining" is the quick way through. |

### Exit Criteria
- [ ] The plan exists, with vertical slices and acceptance criteria
- [ ] The environment check ran and any drift is noted
- [ ] The research file holds the findings (unless `research_parallelism: 0`)
- [ ] The validation file maps a test to every acceptance criterion (unless `nyquist_enforcement: off`)
- [ ] The plan passes the dimensions `plan_validation_dims` sets
- [ ] The inbox advanced: entries triaged, or "defer all remaining" taken
- [ ] User approves the plan — only when `gates.confirm_plan` is set (`attended`); otherwise the move is recorded, not approved

## 10. Finish

Commit the phase's files, `STATE.md` with them. Do not set `phase: EXECUTE`: `/sig:execute` sets it when it starts.
