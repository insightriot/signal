# Phase C — build vs. adopt, decided against the current API

**Status:** the loop backlog item's *done-when* for this note, discharged.
**Checked:** 2026-08-21. **Method:** the published reference docs, read against this machine's
observed behaviour — both readings recorded below, including where they disagree.

> **What this note is for.** `BACKLOG.md`'s loop-engineering item says Phase C is *"a build-vs-adopt
> question, not a build question"*, because the runtime beneath Signal now ships part of what
> [`LANES-IMPLEMENTATION-GUIDE.md`](LANES-IMPLEMENTATION-GUIDE.md) proposes hand-building. Its first
> constraint is **verify before designing** — *"nothing should be designed against it until that
> check is run."* This is that check. It deliberately designs nothing.

---

## The answer, first: the capability lives in the layer Signal does not trust

**There is no capability-detection mechanism.** A plugin cannot declare a tool dependency, cannot
query which tools a session has, and there is no minimum-version field. The manifest's `dependencies`
field is **plugin-to-plugin only**. The documented options are *assume and fail gracefully*, or
*handle the failure when the call fails*.

That splits cleanly by layer, and the split is the finding:

| | Can it tell whether fan-out / worktree isolation is available? |
| --- | --- |
| **The prompt layer** — a `commands/*.md` file being executed by the model | **Yes, trivially.** The model can see its own tool list. |
| **The deterministic layer** — a `tools/lib/*.js` function | **No.** Nothing exposes the roster to a spawned process. |

**Signal puts load-bearing checks in the deterministic layer precisely because the prompt layer is
measured-unreliable.** `M5.E8` put a number on it: **77.6% of Signal's own directive lines are not
trace-measurable**, and `B48` recorded a shipped instruction an agent correctly *declined*. The
`ADHERENCE-LOG.md` ceiling is the standing statement of that distrust.

So adopting the runtime would put **the decision to fan out** in the one layer Signal has measured
and found untrustworthy — while the thing that makes lanes *safe* (the fence, the overlap refusal,
the land-time diff gate) has to stay in the layer that cannot see whether fan-out happened at all.

**That is the build-vs-adopt answer, and it is a constraint on the design rather than a veto:**

> **Adoption may make lanes faster. It must never be what makes them correct.**
> Every safety property stays deterministic and runs identically whether the work was fanned out by
> the runtime, dispatched by hand, or done serially by one session.

---

## What was checked, and what it says

### Adoptable — documented, generally available

- **Git worktree isolation for subagents** — `isolation: worktree` frontmatter. The worktree is
  auto-cleaned when the subagent makes no changes, and commands that would escape it are blocked
  (working directory *and* Bash command content are checked).
- **Parallel subagents** — concurrent by design, default cap **20**
  (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`), nesting depth **3**
  (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`); at the depth limit the `Agent` tool is withheld.

### ⚠ One documented detail contradicts the lanes design

The subagent worktree is **branched from the default branch, not from the parent session's `HEAD`.**

`/sig:dispatch` (§9 of the guide) writes `BRIEF.md` and the registry row on `main`, **commits**, and
branches the lane *from that commit* so the brief travels with the branch. A worktree that branches
from the default branch **cannot** carry an uncommitted or just-committed brief by construction.

**So the runtime's worktree is not a drop-in for the lane worktree.** It is the right substrate for
*ephemeral, read-mostly fan-out* — parallel research, parallel review, parallel scanning — and the
wrong one for a durable lane whose whole purpose is to accumulate commits behind a human merge gate.

### Not safely adoptable — present here, but gated and undocumented as a subagent feature

This session's tool surface carries an orchestration tool with **schema-validated agent returns**, a
**token budget with a hard ceiling**, **resume-by-run-id**, and its own concurrency cap
(`min(16, CPUs - 2)`, distinct from the subagent cap of 20). None of it appears in the subagent
reference, and **it requires explicit user opt-in** — its own contract says to invoke it only when
the user has asked for multi-agent orchestration.

**A `/sig:` command therefore cannot silently invoke it.** The backlog already recorded this
constraint; it survives the check unchanged, and it is arguably a feature given the sequencing note
(§5.4: parallelism multiplies unaudited output).

---

## ⚠ The environment surface is not a contract — and the check proved it twice over

The docs state that Claude Code exports **`CLAUDECODE`** and **`CLAUDE_CODE_CHILD_SESSION`** to
spawned processes, and say plainly that available tools, current model, plugin root, and feature
flags are **not** exposed.

**Observed on this machine, 2026-08-21: thirteen `CLAUDE*` variables reach a Bash child**, including
`CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_EFFORT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_CODE_SESSION_ID`, and a
literal feature flag — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`.

**The disagreement is kept rather than resolved in favour of the observation**, because the
conclusion runs the same way from either reading:

1. **Neither reading enumerates the tool roster.** One feature flag is not a capability list, and no
   variable answers *"can this session fan out?"*
2. **A documented surface that undercounts reality is not a surface to build a contract on.** The
   precedent is `B52`: `plugin-binding.js` deliberately refuses `CLAUDE_PLUGIN_ROOT` and derives the
   path from the module's own location, on the stated grounds that *the env var says where the plugin
   is supposed to be, and the bug is exactly the case where those disagree.* Same shape.

**So: do not build capability detection on these variables.** If a future need is real, the honest
mechanism is a documented one or none.

---

## Verdict — the split

| Half | Call | Why |
| --- | --- | --- |
| **Ephemeral dispatch / fan-out** — parallel research, parallel review, isolated scratch work | **ADOPT** | Documented, generally available, and genuinely better than hand-rolling. Read-mostly, so a failure costs time, not correctness. |
| **`lane-guard --check-overlap`** (two lanes may not share a glob) | **BUILD** | Deterministic, file-shaped, must run whether or not fan-out happened. |
| **`lane-guard --check-diff`** (Ring 3, the land-time backstop) | **BUILD** | The hard gate. Cannot live in a layer that may not exist. |
| **`LANES.md` / `BRIEF.md` / `SERIALIZED.md` / `GUARDED-SURFACES.md`** | **BUILD** | Durable artifacts with single-writer discipline. A workflow run is ephemeral and returns a value; these outlive it. |
| **The lane worktree lifecycle** | **BUILD** | The runtime branches from the default branch; lanes branch from the brief commit. Not the same object. |
| **`.landing.lock` + serial merge queue + post-merge reconcile** | **BUILD** | `D-M5E17-4`: merging **is** delivery, and the human gate is the point. |

**Nothing here shrinks the Epic's hard half.** The guide's own honest sizing — *"the minimum honest
v0 is S2 + S5's Ring 3 + hand-written briefs — mechanical safety first, convenience commands
second"* — is **unchanged by this check**, because adoption touches the convenience half only. That is
the most useful thing this note establishes: the runtime's arrival was a reason to re-check, and it
turns out **not** to be a reason to re-scope.

---

## Two corrections to the note that sent me here

- **`/sig:permissions` does not exist.** The backlog cites *"the same verify-against-the-current-API
  precondition already attached to `/sig:permissions`"*. There are **21 commands** and it is not one
  of them — the citation points at an unbuilt command, so the precedent it invokes is a plan, not a
  practice. `/sig:doctor` is the real precedent and it is a good one: it detects documented states
  from files on disk, and renders `[UNVERIFIED]` rather than a clean-looking answer when it cannot
  look (`B39`).
- **"Zero inspiration-repo ports" is not an open gap.** Adjacent, and worth stating here because this
  note sits in the same arc: `BACKLOG.md` Sprint 7 reads **"RESOLVED by `M5.E7`: 0 straight ports
  survive"** — evaluated and cut on fit, ratified 2026-07-26. The count is right; reading it as
  neglect is not.

## What this note does NOT establish

- **It does not check a user's runtime.** It checks the published docs and one machine. The
  no-detection finding makes that gap *permanent rather than fixable*: with no roster to query,
  nobody — Signal included — can know what a given session can do until a call succeeds or fails.
- **It does not measure anything.** No fan-out was run, no lane was dispatched, no throughput was
  compared against the serial baseline. The guide's §13 metrics remain unmeasured.
- **It does not settle the sequencing.** Parallelism still comes last (§5.4), and `B76`'s loop
  ceiling — the stated entry price — was only paid on 2026-08-21, one release after `/sig:drive`
  shipped.
- **It checked the runtime's fan-out half and never its loop half** *(added 2026-08-22)*. The
  runtime also ships loop primitives — a goal command whose stop condition is judged each turn by a
  separate evaluator model, an interval re-runner, and a cloud-scheduled routine. None is named
  anywhere in this repository, and none was considered here. **The verdict transfers unchanged,
  which is why this is a completeness note and not a re-scope:** all three are user-invoked
  prompt-layer commands, a `/sig:` command cannot invoke them, there is still no capability
  detection to gate on, and *"adoption may make lanes faster; it must never be what makes them
  correct"* applies verbatim. One documented detail belongs against `LOOP-ENGINEERING-ANALYSIS.md`
  §5.3's brakes rather than against adoption: that evaluator **reads the transcript and runs nothing
  itself**, so any condition handed to it must be demonstrable from visible output — the same
  constraint `M5.E10` hit when it shipped token-comparing checks and left the semantic half unbuilt
  (`AC0.1`).
