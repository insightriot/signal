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

5. **`/sig:update` shipped** (M5.E16 FR6) — a nineteenth command, whose steps name three real
   `tools/lib/update.js` exports. Trace-measurable rose 87 → **90** and the denominator rose
   419 → **429**, so the share went **20.8% → 21.0%**. **Up**, for once.

**The pattern across all five, and it cuts both ways.** Every time this project makes an existing
instruction *clearer*, the published share goes **down**; every time it adds a step that names a
real library call, the share goes **up**. Neither movement is a quality signal. The metric measures
what can be *traced*, not what is *right* — which is why this section sits above the table rather
than below it, and why the number is never quoted release-to-release without it. The 339
untraceable directives remain **unmeasured, not passing.**

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

**Computed:** 2026-09-01 · **Commit:** `8f3ffa0` · **Corpus:** 22 `commands/*.md` files

This is the bound on everything the adherence harness can ever report. It is computed
directly from the command corpus by `tools/lib/directive-classifier.js`, whose split
rule is written out in full in that file's header so a reader can disagree with it line
by line.

| | count | share |
|---|---:|---:|
| Directive lines | **541** | 100% |
| …naming a real `tools/lib` export | 100 | 18.5% |
| …writing a named artifact | 18 | 3.3% |
| **Trace-measurable (either)** | **118** | **21.8%** |
| **No observable trace** | **423** | **78.2%** |

### What the remainder is, stated plainly

The 423 directives with no observable trace are **unmeasured, not passing.**

They are not "probably fine", not "covered by the test suite", and not "verified by the
fact that Signal works". Nothing in this repository establishes whether an agent follows
them. That includes the guidance carrying most of Signal's value — *surface ambiguity*,
*don't rationalize*, *gate at product altitude* — none of which leaves a trace this
method can see. A future reader looking for the sentence that lets them treat a green
harness run as evidence about the whole corpus will not find it here.

### Per-file

| File | directives | measurable | unmeasured |
|---|---:|---:|---:|
| `ship.md` | 45 | 15 | 30 |
| `add.md` | 42 | 11 | 31 |
| `status.md` | 20 | 11 | 9 |
| `discuss.md` | 27 | 10 | 17 |
| `plan.md` | 54 | 9 | 45 |
| `init.md` | 43 | 7 | 36 |
| `resume.md` | 23 | 7 | 16 |
| `doctor.md` | 33 | 6 | 27 |
| `checkpoint.md` | 21 | 5 | 16 |
| `new-project.md` | 9 | 5 | 4 |
| `calibrate.md` | 28 | 4 | 24 |
| `execute.md` | 22 | 4 | 18 |
| `migrate-memory.md` | 15 | 4 | 11 |
| `review.md` | 42 | 4 | 38 |
| `verify.md` | 40 | 4 | 36 |
| `sweep.md` | 12 | 3 | 9 |
| `update.md` | 11 | 3 | 8 |
| `drive.md` | 9 | 2 | 7 |
| `index.md` | 7 | 2 | 5 |
| `permissions.md` | 11 | 2 | 9 |
| `archive.md` | 11 | 0 | 11 |
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
> ### ⚠ DIAGNOSED — the `OBEYED` record at commit `f3ca9b2` above
>
> **This verdict was measured with an unisolated control arm.** It is **not retracted** and
> not falsified: control 0/3 means no leak was *observed* in those three runs, and that
> observation stands exactly as recorded.
> 
> What changed is what the run could ever have shown. The control arm deleted the instruction
> from ONE command file while four others — `plan.md`, `verify.md`, `review.md` and `ship.md`
> — still ordered the same call. The arm labelled "instruction deleted" therefore contained
> the instruction four more times, so the design could not distinguish "the instruction works"
> from "the agent found it elsewhere." A 0/3 control is consistent with both.
> 
> Filed as `B55`. M5.E15 fixes the scope: the canary now declares all five directive sites and
> the control arm deletes every one of them.
> 
> Why this block exists when the `INDETERMINATE` record below already diagnoses the same
> defect: that annotation is addressed to a different record. A reader auditing `f3ca9b2`
> itself would have found only the `QUALIFIED` note about `B48` and no indication that the
> headline verdict was unisolated. The finding now sits on the record it is about.
> 
> First annotation in this log written BY CODE rather than by hand (`B80`, AC7.1).
>
> *Appended, never edited into the record above. This log is append-only: a wrong
> or incomplete answer that is silently rewritten cannot be audited.*

### 2026-08-05 · `B41-phase-entry` · **OBEYED**

| | |
|---|---|
| Commit | `7669644` |
| Command | `/sig:execute` |
| Trace | `phaseChanged` |
| Surface | claude 2.1.222 (Claude Code) · claude-opus-5 |
| Runs per arm | 3 |
| Seam precondition | PASS — the mutated tree is the one the agent read |
| as-written (treatment) | **3/3** unanimous |
| instruction deleted (control) | **0/3** unanimous |
| Failed runs | 0 |

**OBEYED** — the trace appears only with the instruction present — the instruction changed what the agent did.

**Scope of this verdict:**
- **One canary is not a survey.** This is a fact about `B41-phase-entry` in `commands/execute.md`, not evidence about Signal's instructions generally.
- **Tool access is part of the claim.** The agent ran with `--allowedTools Write Edit Read Bash`. An instruction that needs a tool the user denies cannot be obeyed regardless of wording.
- **The unmeasured remainder is unmeasured, not passing** — see the coverage ceiling above.
- **N=3 is a weak split.** A perfect separation of 6 runs is roughly p=0.05 by permutation. Clean, not deep.
- **Isolation scope: `directive`.** The control arm deleted the instruction from 5 declared site(s): `commands/execute.md`, `commands/plan.md`, `commands/verify.md`, `commands/review.md`, `commands/ship.md`. Sites that teach or document the rule without ordering it were deliberately left in place — a control stripped of the reference docs is a different agent, not the same agent minus one instruction.
- **The control removed whole sections** (`commands/execute.md` § `## Phase entry — record the phase (M5.E9 FR6, `B41`)`; `commands/plan.md` § `## Phase entry — record the phase (M5.E9 FR6, `B41`)`; `commands/verify.md` § `## Phase entry — record the phase (M5.E9 FR6, `B41`)`; `commands/review.md` § `## Phase entry — record the phase (M5.E9 FR6, `B41`)`), so anything else stated in them was removed too. Read those sections before attributing the difference to this instruction alone.

> ### ℹ QUALIFIED — the `OBEYED` record at commit `7669644` above
>
> **The scope statement above is incomplete: the descriptive-residue list is missing, and it
> should have been there.** The verdict stands. This adds what the record failed to print.
> 
> AC3.3 requires every record to name what the control agent could still read about the
> instruction after the deletions. The runner read `descriptiveResidue` off the arm SUMMARY
> object rather than the arm RESULT — two variables one character apart in the same scope —
> so it resolved to `undefined`, fell back to an empty list, and the caveat silently did not
> render. Every unit test was green, because the tests handed the residue to the caveat
> builder directly and never exercised the wiring. Fixed, with the wiring now pinned by a
> test that reads the runner source.
> 
> **What the control arm could still read** — 14 mentions across 6 files, recomputed offline
> by rebuilding the copied tree and re-applying the same five deletions:
> 
> | File | Mentions | Why it survives |
> |---|---|---|
> | `references/state-schema.md` | 6 | Documents the semantics of the file the function writes |
> | `tools/lib/state.js` | 3 | The capability itself — deleting it makes "was not told" into "could not" |
> | `commands/discuss.md` | 2 | Teaches the rule by prohibiting it here, without ordering the call |
> | `commands/calibrate.md` | 1 | Names it while explaining phase interaction; does not order it |
> | `commands/index.md` | 1 | Names it while describing what regenerates the doc map |
> | `tools/lib/directive-classifier.js` | 1 | Apparatus; names the token as data |
> 
> **This does not weaken the verdict, and the same recomputation is what shows why:** the walk
> returned **zero directive hits**. Every site that ORDERS the call was gone from the tree the
> control agent read. The residue above states or implements the rule without instructing
> anyone to follow it, which is the distinction `D-M5E15-1` draws and the reason these files
> are deliberately left in place — a control arm stripped of the schema reference is a
> different agent, not the same agent minus one instruction.
> 
> Recorded here rather than edited into the record above, per this log's append-only rule.
>
> *Appended, never edited into the record above. This log is append-only: a wrong
> or incomplete answer that is silently rewritten cannot be audited.*

