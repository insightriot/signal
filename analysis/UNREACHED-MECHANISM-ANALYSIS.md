# The unreached mechanism — a defect class, named

**Status: analysis (2026-08-08); the proposed count was run 2026-08-14 and its decision rule was
NOT satisfied — see § The count, run.** Four instances filed in one day, three of them found by a
user rather than by Signal. The class is old; naming it is new.

Related: [`.planning/BUGS.md`](../.planning/BUGS.md) (`B87`–`B90`), [`analysis/CLAIM-INTEGRITY-ANALYSIS.md`](CLAIM-INTEGRITY-ANALYSIS.md) (the sibling
class), [`analysis/LOOP-ENGINEERING-ANALYSIS.md`](LOOP-ENGINEERING-ANALYSIS.md) (the attention axis this bears on).

---

## The shape

> **A mechanism exists, is correct, and is never reached — because reaching it depends on a person
> remembering, and nothing observes whether they did.**

Not a missing feature. Not broken code. The capability is present and usually well-built; what is
absent is any path from the situation to the capability.

## The four instances, one day

| | The mechanism that exists | Why it is never reached |
|---|---|---|
| **`B87`** | `transitionPhase` records each phase | It lives *inside* the phase commands. A hand-driven Epic never invokes them, so EXECUTE ran and never entered the ledger. |
| **`B88`** | `ship.md` requires a branch + PR | Nothing in 20 commands or any module reads the current branch. The rule is stated in the file that supplies no enforcement. |
| **`B89`** | The inbox drain culls captures | `plan.md` grants permission to skip it 144 lines above forbidding the skip. 52 captures queued. |
| **`B90`** | Per-unit tier: Epic PROFILE, de-escalation, `phases_skipped` | The command is named **escalate**; every doc says *promotes* / *upgrades*. The down path is invisible. |

**The costs are not equal, and that matters.** `B87` corrupted a record. `B90` cost a real user a
week and produced the conclusion that Signal *"is a complete idiot when it comes to the importance of
types of work."* A class that ranges from bookkeeping to user-abandonment is not a tidiness problem.

## Why the usual remedy makes it worse

**Signal's standard fix for "the rule wasn't followed" has been to write the rule more carefully.**
`B39` was answered with a documented watchlist walk. `B41` was answered by putting a call inside each
command. `D-M5E17-5` was answered by deleting a contradictory paragraph.

Each of those is *another instruction*. And instructions are precisely the thing this class is about
not being reached.

`B75` already measured the ceiling: **`gate_strictness: light` and `strict` differ by one boolean in
code — every other difference is prose.** A dial with four documented positions has one real one.
More prose does not move that number.

## The three real remedies, in order of durability

1. **Make the rule executable, or delete it.** A rule nothing can check is a preference. `B48`'s fix
   is the model — `transitionPhase` *"now also refuses to record a phase that produced no artifact,
   so the text and the code agree rather than one relying on the other."* Refusal beats instruction.
2. **Put the check where the situation is, not where the topic is.** `B88`'s branch check belongs at
   EXECUTE entry and SHIP entry — not in a paragraph about branching. `B90`'s tier prompt belongs at
   Epic open, not in a section about tiers.
3. **Name the absent path, not the absent feature.** Every instance above was filed at first glance
   as "X is missing." Every one turned out to be "X exists and nothing routes to it." The
   distinction changes the fix from *build* to *wire*, which is an order of magnitude cheaper — and
   it is the same correction `M5.E19`'s research made about archiving.

## What this predicts

If the class is real, then **the next defect will also be a capability nobody could reach**, and it
will be found by a user rather than by Signal. Two of today's four already were.

A cheap falsification: take the 30 `confirmed` rows in `BUGS.md` and count how many are *"exists but
unreached"* versus *"absent"* versus *"wrong"*. If the first bucket dominates, this document is
describing the repo's dominant failure mode and the roadmap should be re-aimed at wiring rather than
building. ~~**That count has not been run**~~ — **the count was run 2026-08-14; see the next
section.** The prediction's decision rule is **not** satisfied as written.

## The count, run (2026-08-14)

**Result up front: the unreached bucket leads and does not dominate — 10 of 25, 40%. The decision
rule stated above is not satisfied.** The roadmap should not be re-aimed at wiring *on the strength
of this count*. A different reading of the same 25 rows does argue for re-aiming, and it is stated
below rather than substituted quietly for the one that failed.

**Denominator.** `BUGS.md` carried 27 rows whose **status column** reads `confirmed` on 2026-08-14
(65 `fixed`, 3 `dismissed`). Two are excluded from the 25 and both exclusions are named:

- **`B38` is excluded because it is not open.** It shipped in `v0.1.25` (`M5.E10`) — the backlog
  records it, the row does not. **A stale status in the file being measured, found by measuring it.**
  Filed as a byproduct finding below rather than silently corrected in the denominator.
- **`B99` is excluded because the scheme cannot express it.** It is a packaging decision (what
  `source: "."` copies into an install), not a mechanism defect. Recorded as *neither* — a value on
  the record, per `M5.E18`'s `cannotDetermine`, not a rounding-down.

### The classification rule, written before the count and stated because the count moves with it

| Bucket | Test |
|---|---|
| **unreached** | The mechanism that would prevent it **exists, is correct, and is invoked somewhere else in this tree**. The fix is to call, port, or apply it. |
| **absent** | The fix requires designing something that exists nowhere. |
| **wrong** | The mechanism exists, **is** reached, and reports or does the wrong thing. |

**This rule is load-bearing and the count is sensitive to it.** Writing it down moved two rows
(`B34`, `B35`) from *absent* to *unreached* — in both, the fix is explicitly *"mirror the guard one
file over."* Without the rule the split was 8/10/7; with it, 10/8/7. **A count that swings 20% on its
own definition must ship the definition**, which is the `M5.E10` lesson applied to this measurement.

### The 25

| Bucket | Rows | n |
|---|---|---|
| **unreached** — wire what exists | `B34` `B35` `B37` `B56` `B60` `B62` `B68` `B73` `B74` `B76` | **10** |
| **absent** — build what doesn't | `B40` `B47` `B50` `B61` `B65` `B67` `B71` `B75` | **8** |
| **wrong** — reached, and incorrect | `B33` `B66` `B69` `B79` `B81` `B92` `B93` | **7** |

Four rows carry the class in their own words, which is the strongest evidence in the table because it
is not this pass's judgement: `B56` — *"a mechanism that works, reachable only through a path nobody
is obliged to take"*; `B68` — `detectMode` *"is called by no renderer"*; `B73` — the pinning pattern
*"already exists"* and was not applied; `B62` — the repo has been doing the post-merge stamp by hand
*"without any instruction saying to."*

**Compound rows are counted once, at their dominant bucket, and the remainder is not discarded.**
`B50` is *absent* (the semantic claim-check exists nowhere) but contains a textbook *unreached*
sub-item — the verifier agents carrying the enumerate-with-a-denominator shape are dispatched by no
command. `B71` is *absent* (no world-check) while its own detection half already exists and fires.
`B40` is *absent* while its stated interim remedy — *"grep the cited section before writing any
marker"* — is honour-system with nothing observing it.

### The reading that does argue for re-aiming, stated separately because it is not the test that was set

Collapse *unreached* and *wrong* and the question becomes **does the thing exist?**

> **17 of 25 (68%) are a mechanism that exists and does not do its job. 8 of 25 (32%) are a mechanism
> that does not exist.**

That is the roadmap-relevant number, and it survives the boundary problem above — `B34` and `B35`
sit on the *exists* side under either rule. **But it is a different claim from the one this document
predicted**, and adopting it means saying so: the prediction named *wiring*; the evidence names
*wiring **and** mis-scoping* — a bucket the prediction did not anticipate carrying 7 rows.

**The `wrong` bucket has a theme of its own, and it is the sibling class, not this one.** Five of the
seven are a mechanism that runs and is silent about its own limits: `B66` (one advisory for 1 entry
and for 110), `B69` (*could not evaluate* swallowed by a bare catch), `B79` (*could not look*
rendered as *nothing to do*), `B81` (a population of 1 passing an assertion written to prove the
population is not empty). That is `B39`'s *checked-and-clean vs. could-not-check* and `M5.E16`'s
whole subject — **not** the unreached class. A roadmap aimed only at wiring would leave all five.

**Live corroboration, from the day of the count.** `B79` fired again during a routine
`/sig:checkpoint`: `evictEpicNarrative` returned `{evicted:false, reason:'no-section'}` against
Signal's own `STATE.md` — a second measured instance of the mechanism reporting *could not look* as
*clean*, ten days after it was filed.

### What this count cannot establish

- **It is one reader's classification, unreviewed.** No second pass, no blind re-rate. The rule above
  makes it reproducible, not correct.
- **The sample is survivorship-biased against the hypothesis it tests.** `B87`–`B90` — the four
  instances that named this class, all *unreached* — **shipped in `v0.1.24`**, so they are `fixed` and
  outside the denominator. Counting only `confirmed` rows measures **what is left unfixed**, not what
  the repo produces. A count over all 95 triaged rows would answer the intended question and was not
  run.
- **It reads the rows, not the code.** Each classification rests on what the row says about its own
  fix. Rows are re-verified against the tree at reconciliation sweeps, not by this pass.
- **`confirmed` is not `open`.** `B38` proves the status column drifts; there may be others, and
  nothing here checked the remaining 26 against their shipped state.

### Byproduct finding — file it, don't fix it here

`B38` reads `confirmed` in `BUGS.md` and shipped in `v0.1.25`. This is exactly the gap `M5.E14`'s
slice was carved out to close — *"status lives in a hand-maintained table that nothing reconciles"* —
and `dischargeObligation` still has no caller (`v0.1.24`, stated). One stale row is not a trend; it
is one more data point on a mechanism that already exists and is reached by nothing, which makes it a
**26th unreached instance sitting outside the table it would have joined.**

## The uncomfortable part

**Signal's self-use cannot find this class reliably**, because Signal-on-Signal is driven by an
operator who already knows where every mechanism is. `B82` made the structural version of this
concrete a day earlier: the bug could not reproduce in Signal's own tree *by construction*, and it
lived in 8 of 12 real projects. `M5.E16` measured the same thing from another angle — Signal's own
`.planning/` shape is the **minority** shape.

Three of today's four came from outside. That is the loudest signal in the file.
