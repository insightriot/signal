# Adherence Log

Signal's measurement record: what its own instructions actually cause an agent to do.

**Two halves, two rules.** The ceiling below is *regenerated* whenever the command
corpus changes. The run records beneath the runs marker are **append-only** — a later
run never rewrites an earlier one.

<!-- adherence:ceiling:begin -->
## The coverage ceiling

**Computed:** 2026-07-28 · **Commit:** `6108c8a` · **Corpus:** 18 `commands/*.md` files

This is the bound on everything the adherence harness can ever report. It is computed
directly from the command corpus by `tools/lib/directive-classifier.js`, whose split
rule is written out in full in that file's header so a reader can disagree with it line
by line.

| | count | share |
|---|---:|---:|
| Directive lines | **407** | 100% |
| …naming a real `tools/lib` export | 74 | 18.2% |
| …writing a named artifact | 17 | 4.2% |
| **Trace-measurable (either)** | **91** | **22.4%** |
| **No observable trace** | **316** | **77.6%** |

### What the remainder is, stated plainly

The 316 directives with no observable trace are **unmeasured, not passing.**

They are not "probably fine", not "covered by the test suite", and not "verified by the
fact that Signal works". Nothing in this repository establishes whether an agent follows
them. That includes the guidance carrying most of Signal's value — *surface ambiguity*,
*don't rationalize*, *gate at product altitude* — none of which leaves a trace this
method can see. A future reader looking for the sentence that lets them treat a green
harness run as evidence about the whole corpus will not find it here.

### Per-file

| File | directives | measurable | unmeasured |
|---|---:|---:|---:|
| `add.md` | 42 | 10 | 32 |
| `discuss.md` | 25 | 9 | 16 |
| `status.md` | 14 | 9 | 5 |
| `plan.md` | 41 | 8 | 33 |
| `init.md` | 41 | 7 | 34 |
| `ship.md` | 29 | 7 | 22 |
| `checkpoint.md` | 21 | 5 | 16 |
| `doctor.md` | 23 | 5 | 18 |
| `new-project.md` | 9 | 5 | 4 |
| `resume.md` | 15 | 5 | 10 |
| `execute.md` | 20 | 4 | 16 |
| `migrate-memory.md` | 15 | 4 | 11 |
| `review.md` | 34 | 3 | 31 |
| `sweep.md` | 9 | 3 | 6 |
| `verify.md` | 26 | 3 | 23 |
| `calibrate.md` | 20 | 2 | 18 |
| `index.md` | 7 | 2 | 5 |
| `escalate.md` | 16 | 0 | 16 |
<!-- adherence:ceiling:end -->

<!-- adherence:runs -->
### 2026-07-28 · `B41-phase-entry` · **ABSENT**

| | |
|---|---|
| Commit | `22aeb23` |
| Command | `/sig:execute` |
| Trace | `phaseChanged` |
| Surface | claude 2.1.220 (Claude Code) · claude-opus-5 |
| Runs per arm | 3 |
| Seam precondition | PASS — the mutated tree is the one the agent read |
| as-written (treatment) | **0/3** unanimous |
| instruction deleted (control) | **0/3** unanimous |
| Failed runs | 0 |

**ABSENT** — the trace appeared in neither arm — nothing happened; check whether the fixture reached the instruction at all.

### 2026-07-28 · `B41-phase-entry` · **OBEYED**

| | |
|---|---|
| Commit | `f3ca9b2` |
| Command | `/sig:execute` |
| Trace | `phaseChanged` |
| Surface | claude 2.1.220 (Claude Code) · claude-opus-5 |
| Runs per arm | 3 |
| Seam precondition | PASS — the mutated tree is the one the agent read |
| as-written (treatment) | **3/3** unanimous |
| instruction deleted (control) | **0/3** unanimous |
| Failed runs | 0 |

**OBEYED** — the trace appears only with the instruction present — the instruction changed what the agent did.

> ### ⚠ INVALIDATED — the `ABSENT` record at commit `22aeb23` above
>
> **The fixture could not reach the instruction, so this measured the scaffolding, not the rule.**
> 
> The fixture project shipped a PROFILE and a STATE and nothing else. `/sig:execute` halted on two genuine preconditions — no PLAN artifact, and not a git repository — long before the phase-entry rule could apply. Both arms scored no-trace for a reason with nothing to do with the instruction.
> 
> **This run is also the most valuable one in the Epic.** Its transcript is where `B48` was found: the agent did not overlook the instruction, it read it and *explicitly refused* it, because calling `transitionPhase` on a halted phase would write a false record into the very ledger M5.E9 had just made honest. The verdict was uninformative; the artifact captured beside it was not.
> 
> **Superseded by the `OBEYED` record at commit `f3ca9b2`**, run against a fixture carrying a PLAN + VALIDATION artifact and an initialised git repo.
>
> *Left in place byte-identical rather than removed. This log is append-only: a
> wrong answer that is deleted cannot be audited, and the run that produced this
> one was the most informative of the Epic.*

