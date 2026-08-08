# The unreached mechanism — a defect class, named

**Status: analysis (2026-08-08).** Four instances filed in one day, three of them found by a user
rather than by Signal. The class is old; naming it is new.

Related: `.planning/BUGS.md` (`B87`–`B90`), `analysis/CLAIM-INTEGRITY-ANALYSIS.md` (the sibling
class), `analysis/LOOP-ENGINEERING-ANALYSIS.md` (the attention axis this bears on).

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
building. **That count has not been run** — stating it as an open measurement rather than assuming
the answer.

## The uncomfortable part

**Signal's self-use cannot find this class reliably**, because Signal-on-Signal is driven by an
operator who already knows where every mechanism is. `B82` made the structural version of this
concrete a day earlier: the bug could not reproduce in Signal's own tree *by construction*, and it
lived in 8 of 12 real projects. `M5.E16` measured the same thing from another angle — Signal's own
`.planning/` shape is the **minority** shape.

Three of today's four came from outside. That is the loudest signal in the file.
