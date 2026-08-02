# Adherence Log

Signal's measurement record: what its own instructions actually cause an agent to do.

**Two halves, two rules.** The ceiling below is *regenerated* whenever the command
corpus changes. The run records beneath the runs marker are **append-only** — a later
run never rewrites an earlier one.

## ⚠ Read this before comparing the coverage number across releases

**The share can fall without anything getting worse, and it keeps happening.** At v0.1.13 the
ceiling read **91/407 = 22.4%**. At M5.E13 it read **87/411 = 21.2%**. At M5.E16 it reads
**87/419 = 20.8%**. Nothing became less obedient. What moved was never quality:

1. **M5.E13 reworded the phase-entry instruction in four commands** (FR1.1, fixing `B48`
   — the instruction was unconditional, and an agent correctly refused it). The rewording
   added *conditional prose*: "call this only if every precondition passed." That prose is
   **directive** — it tells the agent what to do — but it names no library call and writes
   no artifact, so the classifier counts it in the denominator and not the numerator.
2. **`plan.md` gained the trigger-watchlist walk** (FR2.1, `B39`), which is more directive
   prose for the same reason.
3. The corpus grew 407 → 411 lines while trace-measurable fell 91 → 87.
4. **M5.E16 documented the STATE-vs-world group in `sweep.md` and the drift line in
   `resume.md`** — explaining what a check does, which bucket a finding lands in, and why
   "cannot evaluate" is not "clean". Eight more directive lines, **zero** more library
   calls named. Trace-measurable held at 87 while the denominator went 411 → 419.

**The pattern across all four:** every time this project fixes a documented instruction by
making it *clearer*, the published number goes *down*. That is the metric behaving as
designed — it measures what can be traced, not what is right — and it is the reason this
section exists above the table rather than below it. The 332 untraceable directives remain
**unmeasured, not passing.**

**The perverse incentive, stated so nobody has to rediscover it.** Under this metric,
*clarifying an instruction lowers the score*. The clearest possible instruction — a
precondition, a caveat, an explanation of when **not** to act — is usually the least
mechanically checkable. Anyone optimising this number would be pushed toward terser, more
absolute instructions, which is exactly the defect (`B48`) that caused the drop.

**So: do not treat this share as a quality metric, and do not tune it.** It is a *bound on
what the harness can see* — nothing more. A falling share may simply mean the corpus got
more honest. The line below still holds: the untraceable remainder is **unmeasured, not
passing**.

*(This section sits outside the regenerated block deliberately — `tools/adherence-ceiling.js`
rewrites only between the `adherence:ceiling` markers, so this survives every regen.)*

<!-- adherence:ceiling:begin -->
## The coverage ceiling

**Computed:** 2026-08-02 · **Commit:** `6a32f34` · **Corpus:** 18 `commands/*.md` files

This is the bound on everything the adherence harness can ever report. It is computed
directly from the command corpus by `tools/lib/directive-classifier.js`, whose split
rule is written out in full in that file's header so a reader can disagree with it line
by line.

| | count | share |
|---|---:|---:|
| Directive lines | **419** | 100% |
| …naming a real `tools/lib` export | 71 | 16.9% |
| …writing a named artifact | 16 | 3.8% |
| **Trace-measurable (either)** | **87** | **20.8%** |
| **No observable trace** | **332** | **79.2%** |

### What the remainder is, stated plainly

The 332 directives with no observable trace are **unmeasured, not passing.**

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
| `plan.md` | 47 | 8 | 39 |
| `init.md` | 41 | 7 | 34 |
| `ship.md` | 31 | 7 | 24 |
| `checkpoint.md` | 21 | 5 | 16 |
| `doctor.md` | 23 | 5 | 18 |
| `new-project.md` | 9 | 5 | 4 |
| `resume.md` | 16 | 5 | 11 |
| `migrate-memory.md` | 15 | 4 | 11 |
| `execute.md` | 20 | 3 | 17 |
| `sweep.md` | 12 | 3 | 9 |
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


> ### ⚠ DIAGNOSED — the `INDETERMINATE` record above is a fact about the INSTRUMENT
>
> **The control arm was never isolated across files, so `deleteSection` removed the
> instruction from one file and left it standing in three others.** Filed as **`B55`**
> ([`BUGS.md`](BUGS.md)).
>
> `adherence-run.js` copies the **whole plugin** (`createPluginCopy(ROOT)`) and mutates
> **exactly one** command file. But `transitionPhase` is named **4× in `plan.md`**, **4× in
> `verify.md`**, **4× in `review.md`**, plus `calibrate.md`, `discuss.md`, `ship.md` and
> `references/state-schema.md`. A control-arm agent that opens any sibling command finds
> the instruction it was supposed to be deprived of. **The one control run that produced a
> trace is that leak, not a fact about the wording.**
>
> **M5.E13 amplified it, by design and unavoidably.** FR1.1 required a **single shared
> wording** across the four middle commands *precisely so they cannot drift apart* — which
> puts a **byte-identical** copy of the deleted instruction into `plan.md`. The requirement
> and the measurement are in direct tension, and nothing in the Epic said so until the
> harness was pointed at itself.
>
> **What this says about the `OBEYED` record at `f3ca9b2`:** it is **not falsified** — 0/3
> means no leak was observed in those three runs — but it was **unisolated**. It could never
> have distinguished *"the instruction works"* from *"the agent found it elsewhere."* Signal's
> flagship adherence verdict was clean by luck rather than by construction.
>
> **Not re-run for a better number, deliberately.** A second run is a coin-flip, and taking
> the better of two is exactly the tuning the four-verdict impostor table in
> `M5.E8-REVIEW.md` exists to forbid. The fix is a corpus-level deletion, which needs a
> decision about what a verdict means when an instruction legitimately appears in four
> commands — design work, homed in its own Epic rather than bolted onto this one.
>
> *Left byte-identical rather than removed. This log is append-only: a wrong answer that is
> deleted cannot be audited.*
