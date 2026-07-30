# Adherence Log

Signal's measurement record: what its own instructions actually cause an agent to do.

**Two halves, two rules.** The ceiling below is *regenerated* whenever the command
corpus changes. The run records beneath the runs marker are **append-only** — a later
run never rewrites an earlier one.

<!-- adherence:ceiling:begin -->
## The coverage ceiling

**Computed:** 2026-07-30 · **Commit:** `2ee601d` · **Corpus:** 18 `commands/*.md` files

This is the bound on everything the adherence harness can ever report. It is computed
directly from the command corpus by `tools/lib/directive-classifier.js`, whose split
rule is written out in full in that file's header so a reader can disagree with it line
by line.

| | count | share |
|---|---:|---:|
| Directive lines | **411** | 100% |
| …naming a real `tools/lib` export | 71 | 17.3% |
| …writing a named artifact | 16 | 3.9% |
| **Trace-measurable (either)** | **87** | **21.2%** |
| **No observable trace** | **324** | **78.8%** |

### What the remainder is, stated plainly

The 324 directives with no observable trace are **unmeasured, not passing.**

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
| `status.md` | 14 | 9 | 5 |
| `discuss.md` | 25 | 8 | 17 |
| `plan.md` | 44 | 8 | 36 |
| `init.md` | 41 | 7 | 34 |
| `ship.md` | 30 | 7 | 23 |
| `checkpoint.md` | 21 | 5 | 16 |
| `doctor.md` | 23 | 5 | 18 |
| `new-project.md` | 9 | 5 | 4 |
| `resume.md` | 15 | 5 | 10 |
| `migrate-memory.md` | 15 | 4 | 11 |
| `execute.md` | 20 | 3 | 17 |
| `sweep.md` | 9 | 3 | 6 |
| `calibrate.md` | 20 | 2 | 18 |
| `index.md` | 7 | 2 | 5 |
| `review.md` | 34 | 2 | 32 |
| `verify.md` | 26 | 2 | 24 |
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

> ### ℹ QUALIFIED — the `OBEYED` record at commit `f3ca9b2` above
>
> **`OBEYED` means "obeyed when the phase can actually run" — not unconditionally.**
> 
> The same instruction is **deliberately refused** when the command halts on its
> preconditions, and refused *correctly*: see **`B48`** in [`BUGS.md`](BUGS.md). An agent
> reading `execute.md` against a project with no PLAN artifact declined the phase-entry
> write, because calling `transitionPhase` on a halted phase writes a false record into the
> ledger M5.E9 had just made honest. `execute.md` states the instruction unconditionally, so
> the instruction and the phase-log integrity rules are in direct conflict.
> 
> Recorded here because the headline verdict alone would read as "the instruction is followed,
> full stop", which this Epic's own evidence contradicts.
> 
> **Other scope boundaries on this verdict:**
> - **One canary is not a survey.** This is a fact about `B41`'s phase-entry rule in
>   `execute.md`, at commit `f3ca9b2`, on `claude 2.1.220` / `claude-opus-5`. It is not
>   evidence that Signal's instructions are followed generally.
> - **N=3 is the weakest possible unanimous split.** A perfect 3/3 vs 0/3 separation of six
>   runs is about p=0.05 by permutation. The result is clean; it is not deep.
> - **Conditional on tool access.** The runs granted `Write Edit Read Bash`. The agent needs
>   Bash to call `transitionPhase`; a setup that denies it cannot obey the instruction at all.
> - **77.6% of Signal's directives remain unmeasured** — unmeasured, not passing.
>
> *Appended, never edited into the record above. This log is append-only: a wrong
> or incomplete answer that is silently rewritten cannot be audited.*

### 2026-07-30 · `B41-phase-entry` · **INDETERMINATE**

| | |
|---|---|
| Commit | `230e569` |
| Command | `/sig:execute` |
| Trace | `phaseChanged` |
| Surface | claude 2.1.220 (Claude Code) · claude-opus-5 |
| Runs per arm | 3 |
| Seam precondition | PASS — the mutated tree is the one the agent read |
| as-written (treatment) | **3/3** unanimous |
| instruction deleted (control) | **1/3** **SPLIT** |
| Failed runs | 0 |

**INDETERMINATE** — not a clean split, or a run failed — an honest "we do not know", recorded rather than rounded into a finding.

**Scope of this verdict:**
- **One canary is not a survey.** This is a fact about `B41-phase-entry` in `commands/execute.md`, not evidence about Signal's instructions generally.
- **Tool access is part of the claim.** The agent ran with `--allowedTools Write Edit Read Bash`. An instruction that needs a tool the user denies cannot be obeyed regardless of wording.
- **The unmeasured remainder is unmeasured, not passing** — see the coverage ceiling above.
- **N=3 is a weak split.** A perfect separation of 6 runs is roughly p=0.05 by permutation. Clean, not deep.
- **The control removed a whole section** (`## Phase entry — record the phase (M5.E9 FR6, `B41`)`), so anything else stated in it was removed too. Read that section before attributing the difference to this instruction alone.

