# Agent reachability

**26 agents. 7 are dispatched by a command. 19 are not.**

**Every one of the 26 carries a determination** — `wired`, `dormant`, or `cut` — as of `M6.E9`
(2026-09-08). A `dormant` agent is a deliberate decision with a stated trigger, not an oversight.
`tests/agent-reachability.test.js` fails if an agent has no determination, so the next agent added
cannot land undecided.

## What "reachable" means here

**Dispatched** means a command file invokes the agent through the Task tool with a
`subagent_type` — a real, followable instruction. A command naming an agent in prose is **not**
dispatch: it reads like capability and invokes nothing. That distinction is the whole point of
this page.

⚠ **Only `commands/init.md` and `commands/review.md` contain `subagent_type` at all.** Every other
command file — including `plan.md`, `execute.md`, `verify.md` and `ship.md` — has no dispatch
machinery. So "wire it up" is a **build** for most dormant agents, not an edit, and that cost is why
they are dormant rather than promised.

## Why so many are dormant

`D-M5E10-1` scoped `M5.E10` to *"checkable parts + writing rules"* and put dispatch machinery out of
scope: wiring agents into commands is a build, not a note. That reasoning held; nothing came back for
the build. `M6.E9` did not do the build either — it made the **determinations**, so the state is a
decision with a reason rather than an unexplained roster.

**An agent no command can invoke, left undocumented, is the never-called-guard class** (`B39`,
`B54`, `M5.E13`). Documented, it is a known gap. Silent, it reads as capability Signal does not have.

**`M5.E10` found this while checking a claim about two agents.** `AC6.2` named
`agents/verifiers/verifier.md` and `agents/verifiers/nyquist-auditor.md` as *"the two unreachable
agents"*. Measured: **22**. The requirement was written from the shape of the work rather than from
the tree — that Epic's own defect class, in its own requirements.

## Dispatched by a command — `wired` (7)

| Agent | Dispatched by | When | How |
|---|---|---|---|
| `agents/scanners/activity-scanner.md` | `commands/init.md` § 2 | brownfield onboarding | parallel with the other 3 scanners; writes `.planning/scan/activity.md` |
| `agents/scanners/quality-scanner.md` | `commands/init.md` § 2 | brownfield onboarding | parallel; writes `.planning/scan/quality.md` |
| `agents/scanners/stack-scanner.md` | `commands/init.md` § 2 | brownfield onboarding | parallel; writes `.planning/scan/stack.md` |
| `agents/scanners/structure-scanner.md` | `commands/init.md` § 2 | brownfield onboarding | parallel; writes `.planning/scan/structure.md` |
| `agents/specialists/code-reviewer.md` | `commands/review.md` § 4.5 | REVIEW, before the verdict | **deliberately no session context** — that is the property that makes it useful |
| `agents/specialists/security-auditor.md` | `commands/review.md` § 4.5 | REVIEW, before the verdict | same dispatch block, same fresh-context rule (`M6.E9`) |
| `agents/specialists/test-engineer.md` | `commands/review.md` § 4.5 | REVIEW, before the verdict | same block; also reads the suite result (`M6.E9`) |

## Not dispatched — `dormant` (19)

Each carries the trigger that would make wiring it worth the build.

### `agents/executors/` (1)

- `executor.md` — **dormant.** Natural home is EXECUTE, one per task in a wave with fresh context.
  **Trigger:** `execute.md` grows a `subagent_type` dispatch step. Named in `discuss.md`,
  `execute.md` and `plan.md` **prose** (*"the executor agent handles 2-5"*), which reads as a wiring
  claim and is not one.

### `agents/planners/` (2)

- `planner.md` — **dormant.** Home is PLAN § 3. **Trigger:** `plan.md` grows a dispatch step. Named
  in `discuss.md` prose.
- `roadmapper.md` — **dormant.** Home is `init.md` § 4 / `new-project.md`. **Trigger:** a decision to
  let an agent write the baseline `PROJECT.md`. ⚠ **Considered for wiring in `M6.E9` and declined on
  inspection:** `init.md` § 4 already writes `PROJECT.md` inline, so dispatching this agent is a
  behaviour change to a shipped command rather than a dispatch add — a `wired` verdict the Epic could
  not have delivered.

### `agents/researchers/` (7)

All seven are **dormant**, for one shared reason: `plan.md` has no dispatch step. Each states it
again on its own line, so the verdict is checkable per agent rather than inherited from this sentence.

- `codebase-researcher.md` — **dormant.** **Trigger:** `plan.md` grows a dispatch step. The only one of the four
  names `plan.md` § 2 used to give that corresponded to a real file.
- `phase-researcher.md` — **dormant.** **Trigger:** same.
- `project-researcher.md` — **dormant.** **Trigger:** same.
- `ui-researcher.md` — **dormant.** **Trigger:** a frontend project runs Signal. Signal has no UI, so the wiring
  could not be exercised.
- `advisor-researcher.md` — **dormant.** **Trigger:** `DECISION-QUEUE.md` shows repeat gray areas needing option
  tables. `M6.E6`'s `routeDecision` now covers the routing half of what this was for.
- `assumptions-analyzer.md` — **dormant.** **Trigger:** a retrospective traces a failure to an assumption left
  unstated at DISCUSS. Overlaps `discuss.md`'s own questioning.
- `research-synthesizer.md` — **dormant.** **Trigger:** two or more researchers actually run in parallel. It has
  nothing to synthesize until then, so it is wired *with* them or not at all.

### `agents/support/` (3)

- `codebase-mapper.md` — **dormant.** The one closest to `cut`. Its job (*"explores codebase and
  writes structured analysis documents"*) substantially duplicates `codebase-researcher.md`. Kept
  because deleting a file on a reading of overlap is not reversible from the plugin, and nothing has
  ever needed the second one — so nothing is lost by leaving it decided-but-unbuilt. **Trigger:** a
  dispatch site wants a map rather than a research digest. **`cut` remains the live alternative.**
- `debugger.md` — **dormant.** No phase owns it; it is on-demand by nature. **Trigger:** the
  `systematic-debugging` skill lands (v2, from superpowers).
- `phase-gate-enforcer.md` — **dormant.** **Trigger:** a gate is bypassed in practice and the
  anti-rationalization tables already in command prose fail to stop it. An agent duplicating those
  tables is unproven.

### `agents/verifiers/` (6)

- `verifier.md` — **dormant.** Home is VERIFY. **Trigger:** `verify.md` grows a dispatch step.
- `nyquist-auditor.md` — **dormant.** Home is VERIFY; `verify.md` already *describes* Nyquist
  coverage without dispatching this. **Trigger:** same.
- `plan-checker.md` — **dormant.** Home is the PLAN→EXECUTE gate, 8-dimension validation.
  **Trigger:** same.
- `integration-checker.md` — **dormant.** **Trigger:** an Epic ships a defect that only appeared
  across phase boundaries. `verifier.md` covers goal achievement first; wire this only if that proves
  insufficient.
- `ui-checker.md` — **dormant.** **Trigger:** a frontend project runs Signal.
- `ui-auditor.md` — **dormant.** **Trigger:** same.

## `cut` (0)

None. Recorded as a heading rather than omitted, so a reader can tell the verdict was available and
not taken.

## The one that is worse than unreachable — FIXED 2026-09-08

`commands/plan.md` § 2 used to instruct a run to *"spawn up to 4 research agents in parallel"* and
name them: **Domain researcher, Codebase researcher, Risk researcher, Prior art researcher.** Only
`codebase-researcher.md` existed. **Three of the four named nothing anywhere in the tree**, so the
instruction could not be followed by anyone — in the phase every Epic runs.

Stated plainly for the record: **three of the four it names do not exist** — that was true of
`plan.md` from the day the section was written until 2026-09-08, and it is the sentence this page
exists to have said out loud.

**Fixed in `M6.E9` (FR5):** the four are now stated as research **angles**, explicitly not agents,
with a note saying the real research agents are dormant and why. The section is kept here because the
failure mode is worth remembering: an un-wired mention advertises a capability the code lacks; a
mention of something that does not exist at all is worse again.

⚠ **Both times this row was prioritised, the worst item was left out of the ranking.** An earlier
backlog draft said *"three of them"* and omitted this section entirely — the case its own cited
source ranks first — caught by the PR reviewer on `#244`.
