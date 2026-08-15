# Agent reachability

> **Generated from the tree, not maintained by hand.** `tests/agent-reachability.test.js`
> re-derives this table and fails when it and the tree disagree.

**26 agents. 4 are dispatched by a command. 22 are not.**

## What "reachable" means here

An agent is reachable when a command **names it for dispatch** — inside a `subagent_type`
instruction the Task tool can act on. Prose naming an agent is not dispatch, and the
distinction is the whole measurement: `commands/execute.md` says *"the executor agent handles
2–5"*, which reads like a dispatch and is not one.

**Exactly one command file dispatches agents by name: `commands/init.md`**, which spawns the
four brownfield scanners. Every other agent in the roster is documentation.

## Why they are documented rather than wired

`D-M5E10-1` scoped `M5.E10` to *"checkable parts + writing rules"* and put dispatch machinery
out of scope. Wiring 22 agents into commands is a build, not a note — and `AC6.2` asks for
exactly this alternative: **an agent that no command can invoke, left undocumented, is the
never-called-guard class** (`B39`, `B54`, `M5.E13`). Documented, it is a known gap. Silent, it
reads as capability Signal does not have.

**`M5.E10` found this while checking a claim about two agents.** `AC6.2` named
`agents/verifiers/verifier.md` and `agents/verifiers/nyquist-auditor.md` as *"the two
unreachable agents"*. Measured: **22**. The requirement was written from the shape of the
work rather than from the tree — this Epic’s own defect class, in its own requirements.

## Dispatched by a command

| Agent | Dispatched by |
|---|---|
| `agents/scanners/activity-scanner.md` | `commands/init.md` |
| `agents/scanners/quality-scanner.md` | `commands/init.md` |
| `agents/scanners/stack-scanner.md` | `commands/init.md` |
| `agents/scanners/structure-scanner.md` | `commands/init.md` |

## Not dispatched by any command

These load only when a person invokes them directly, or when a command’s prose persuades an
agent to go looking. Neither is a dispatch.

### `agents/executors/` (1)

- `executor.md`

### `agents/planners/` (2)

- `planner.md`
- `roadmapper.md`

### `agents/researchers/` (7)

- `advisor-researcher.md`
- `assumptions-analyzer.md`
- `codebase-researcher.md`
- `phase-researcher.md`
- `project-researcher.md`
- `research-synthesizer.md`
- `ui-researcher.md`

### `agents/specialists/` (3)

- `code-reviewer.md`
- `security-auditor.md`
- `test-engineer.md`

### `agents/support/` (3)

- `codebase-mapper.md`
- `debugger.md`
- `phase-gate-enforcer.md`

### `agents/verifiers/` (6)

- `integration-checker.md`
- `nyquist-auditor.md`
- `plan-checker.md`
- `ui-auditor.md`
- `ui-checker.md`
- `verifier.md`

## The one that is worse than unreachable

`commands/plan.md` § 2 instructs a run to *"spawn up to 4 research agents in parallel"* and
names them: **Domain researcher, Codebase researcher, Risk researcher, Prior art researcher.**
Only one of those four corresponds to an agent that exists — `codebase-researcher.md`. There is
no risk researcher and no prior-art researcher in the roster, and the roster’s
`phase-researcher`, `project-researcher`, `advisor-researcher`, `assumptions-analyzer`,
`research-synthesizer` and `ui-researcher` are named by no command at all.

So the instruction cannot be followed as written — not because the agents are unreachable, but
because **three of the four it names do not exist**. Recorded here; fixing it is a build.
