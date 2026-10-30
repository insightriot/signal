---
name: sig:discuss
description: "DISCUSS phase — gather implementation decisions through adaptive questioning before planning. Loads idea-refine and spec-driven-development skills."
args: "[--auto] [--assumptions] [--epic <name>]"
---

# DISCUSS

Settle every decision PLAN and EXECUTE need, so neither has to stop and ask. Look up everything you
can; ask only what the code, docs and records cannot answer.

Every `tools/lib/`, `skills/` and `references/` path in this file is under `${CLAUDE_PLUGIN_ROOT}/`:
import from there, never from another copy of Signal. `baseDir` is the project root.

## 1. Check DISCUSS can run (writes nothing)

- No `.planning/PROFILE.md`: stop with *"No PROFILE.md found at .planning/PROFILE.md. Run
  `/sig:calibrate` first to tier this project, then re-run `/sig:discuss`."*
- `DISCUSS` is in that profile's `phases_skipped`: stop with *"This tier ({tier}) skips DISCUSS. Run
  `/sig:plan` next, or `/sig:escalate` if scope has grown and DISCUSS should run."*

Both come before step 2 because `current_epic` cannot be cleared once set.

## 2. Open the Epic (only with `--epic <name>`)

1. The ID: `<name>` itself if it matches `EPIC_ID_STRICT_RE` (`tools/lib/state.js`), e.g. `M5.E1`.
   Otherwise `deriveNextEpicId(baseDir)` (`tools/lib/milestones.js`). If that returns `null`, read
   `ROADMAP.md` for the milestone, and ask only if it does not say; then
   `deriveNextEpicId(baseDir, { milestone })`. Opening cannot be undone: if the milestone file
   already plans that number for other work, ask which ID to use before opening.
2. `openEpic(baseDir, id, { by })` (`tools/lib/work-ops.js`, `by` is git's `user.name`). It sets
   `current_epic`, starts the Epic's phase history fresh, makes `.planning/epics/<ID>/`, and creates
   the Epic's unit record if the project keeps them. It refuses an Epic that is closed: show the
   reason, and call again with `force: true` only if the user says they mean to reopen it.
3. `transitionPhase(baseDir, 'DISCUSS')` (`tools/lib/state.js`).

Run this step once. Never come back to it later in the phase: deriving again opens a second Epic.

**Done-Epic guard.** Without `--epic`, call
`isEpicDone(baseDir, current_epic)` (`tools/lib/retrospective.js`). Continue only if its `status` is
`not-done`. On `done` or `cannot-evaluate`, stop, print its `reason`, and tell the user to run
`/sig:discuss --epic <name>` for new work: `cannot-evaluate` is not permission to proceed. A stub
retrospective still holding `[FILL IN]` reads `not-done`. On a project with unit records the answer
comes from the Epic's unit record: closed, or *closing* (its close requested at SHIP), is `done`;
open is `not-done`; the retrospective is not read.

## 3. Read the profile

`readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`): the Epic's own
`{EpicID}-PROFILE.md` if it has one, else the project's. If `DISCUSS` is in its `phases_skipped`,
stop with the message in step 1. `applyRigorOverrides` gives the `gates` used below.

If this Epic is clearly smaller or larger than the project's tier, ask now, even at `checkpointed`
(the tier sets what step 6 writes): run `/sig:calibrate` for it?
On yes, run it, then read the profile again. At `unattended`, keep the project's tier and note the
recommendation in `## Deferred`. Otherwise it inherits the project's tier.

| `attention` | How decisions are confirmed |
|---|---|
| `attended` | One question per decision, as you reach it (`gates.confirm_in_phase` is true). |
| `checkpointed` | Decide each with its recommendation, then ask once at the end to approve them all. |
| `unattended` | Take each recommendation and record it. A decision that is hard to undo is still asked. |


## 4. Load skills

Read and apply `skills/define/idea-refine/SKILL.md` and
`skills/define/spec-driven-development/SKILL.md`.

Mode comes from the flags, never a question: `--assumptions` reads the code first and lists the
assumptions to confirm; `--auto` takes every recommendation and asks once at the end; neither means
discuss as below.

## 5. Find the open decisions

Read `PROJECT.md`, `STATE.md`, `ROADMAP.md` and `CONTEXT.md` if present, the bug or work item this
work is for, and the code it touches. List the decisions that change what gets built and that none of
these already answers. Plumbing (file names, test mechanics, tooling) is decided and stated, never
asked. No open decisions is a valid result: say so and go to step 6.

Each question, through `AskUserQuestion` (`references/question-patterns.md`), one per decision:

- says what it decides and what you already checked (files, records, code);
- has three options, the recommended one first with *"(Recommended)"* and a one-line reason; if only
  two are natural, add *"defer to PLAN"* or *"do nothing for now"*;
- `multiSelect: false`. On *Other*, take the user's words at the next turn and record them verbatim.

**Hard to undo** means stored data or its shape, a public interface, or anything published or
deleted. At `unattended` and with `--auto`, ask these anyway; take the recommendation for the rest.

## 6. Write the requirements

Write one file at `artifactName('REQUIREMENTS', { currentEpic, planningDir })`
(`tools/lib/resume.js`): `.planning/epics/<ID>/<ID>-REQUIREMENTS.md` for an Epic,
`.planning/REQUIREMENTS.md` without one. Decisions go here, not in `CONTEXT.md`.

- `# <ID> — <label>`
- `## Decisions` (each with its reason), `## Deferred`, `## Assumptions` (to check during EXECUTE)
- `## Requirements`: what it must do, each with acceptance criteria.

At FULL and FEATURE, also these, answered from the code first:

- **Non-functional.** FULL: health probe, graceful shutdown, structured request logging, security
  headers, rate limiting if public. FEATURE: error handling at boundaries, a log line for failures,
  input validation. Each is in scope, deferred with a reason, or N/A.
- `## Blast radius`: what this touches that it does not change (callers, stored data, anything
  downstream).
- `## Outcome`: how we will know it worked in use (not the acceptance criteria).
  *"No outcome measure, because …"* with a real reason is a valid answer. Check it with
  `checkOutcomeOracle(content, tier)` (`tools/lib/outcome-oracle.js`); it fails a bare "N/A".

At SKETCH the file is optional (`PROJECT.md`'s "Done when" is enough). At SPIKE skip the three above.

## 7. Phase Gate

### Anti-Rationalization Check

At `gate_strictness: strict`, answer each:

| Temptation | Check |
|---|---|
| "We can figure out the details during planning" | Is any open decision going to block the planner? |
| "The requirements are obvious" | Does every requirement have acceptance criteria? |
| "We don't need a spec for something this simple" | Are the scope boundaries written down? |
| "The user seems impatient, let's move on" | Will a skipped decision cost more later? |

### Exit Criteria
- [ ] The requirements file exists, with acceptance criteria
- [ ] At FULL and FEATURE: `checkOutcomeOracle(content, tier)` returns `ok`
- [ ] No open decision would block PLAN
- [ ] User approves moving to PLAN — only when `gates.confirm_discuss` is set (`attended`)

## 8. Finish

Commit the phase's files. Do not set `phase: PLAN`: `/sig:plan` sets it when it starts.

Except at SKETCH, after the commit call `markFresh(baseDir, { commit: <HEAD> })`
(`tools/lib/state.js`). In a catch-all: on any error, warn and continue.
