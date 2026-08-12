# Anti-Rationalization Reference

This document is loaded at every phase gate. Its purpose: counter the specific excuses AI agents (and humans) use to skip quality steps.

## The Core Problem

AI agents optimize for completion speed. When quality steps slow them down, they rationalize skipping them. This isn't malice — it's the shortest-path optimization that makes agents useful in the first place. But unchecked, it degrades output quality over time.

## Universal Rationalizations (Apply at Every Gate)

| Rationalization | Reality |
|---|---|
| "This is simple enough that we don't need [spec/tests/review]" | Complexity is not the only reason for quality steps. Consistency and documentation matter even for simple changes. |
| "We're running low on context, skip the non-essential steps" | Quality steps are never non-essential. If context is tight, create a fresh context window — don't cut corners. |
| "The user seems to want speed over thoroughness" | Fast and wrong is slower than right the first time. Ask the user explicitly rather than assuming. |
| "I'll come back and add [tests/docs/security] later" | Later never comes. Every "later" is debt that compounds. Do it now. |
| "This is just a prototype / MVP / internal tool" | Prototypes become production. Internal tools get compromised. Build quality in from the start. |

## Phase-Specific Rationalizations

### DISCUSS
- "The requirements are obvious" → Write them down anyway. Implicit requirements cause implicit bugs.
- "We can figure this out during planning" → Unresolved questions in DISCUSS become blockers in PLAN.

### PLAN
- "I have a good mental model, I don't need to write the plan" → File-based plans survive context resets. Mental models don't.
- "Acceptance criteria are overkill for this task" → Without criteria, "done" is undefined.

### EXECUTE
- "This test is trivial, no need to write it" → Trivial tests catch non-trivial regressions.
- "I'll refactor after it works" → Refactoring after shipping is 10x harder than writing it clean.

### VERIFY
- "Tests pass, verification is redundant" → Tests verify code paths. Verification checks user-facing behavior.
- "That edge case won't happen in practice" → If it's in the spec, verify it. Users find edge cases you won't.

### REVIEW
- "Code review is just rubber-stamping" → Review catches architecture, security, and performance issues that tests can't.
- "Security is overkill for this" → Automated scanners don't care about your scope assessment.

### SHIP
- "The PR description doesn't matter" → PR descriptions are documentation for your future self.
- "I'll update the docs after merge" → Post-merge docs have a near-zero completion rate.

## Output contract (shaping failures — stated as recipes, `B38`)

Everything above is a **prohibition**, and that is the right form for a *discipline* failure: knowing
the rule and skipping it under pressure. It is the **wrong** form when the output merely comes out
the wrong shape — measured, not asserted: in head-to-head wording tests the prohibition arm produced
*more* of the unwanted content than a positive recipe, and did worse than no guidance at all.

So the entries below state what the output **is**. Classification of every entry in the corpus:
[`anti-rationalization-forms.md`](anti-rationalization-forms.md).

- **Provenance: an upstream claim about a third artifact is repeated only after opening that
  artifact.** If you have not read the thing being described, the sentence says who claimed it and
  that you did not check — *"`BACKLOG.md` says M5.E18 wired none of it (unverified)"* — never the
  claim in your own voice. **And never at higher confidence than the source gave it**: a source's
  *"appears to"* stays *"appears to"*. Escalating a hedge into a fact is the same defect as inventing
  one, and harder to catch because the hedge is gone.

  *Why this is a recipe and not a prohibition:* the failure is not "restated a claim it knew to be
  unchecked". It is a **shape** failure — the sentence came out asserting, because asserting is the
  shape sentences take. Measured in this Epic: `M5.E10`'s own charter quoted `BACKLOG.md` saying
  `M5.E18` *"built the engine and wired none of it"*, which was a quote of that Epic's **mid-build**
  finding that its own wave 6 had already fixed. The claim was false, load-bearing, and nobody had
  opened `M5.E18` to check. Two more instances landed inside this Epic: `AC1.5` described an artifact
  pair that does not exist, and `FR7` specified a check that shipped three releases ago. **In all
  three the plan characterised a file from memory, and in all three opening the file was what found
  it.**

## How to Use This Document

At every phase gate:
1. Read the universal rationalizations
2. Read the phase-specific rationalizations
3. For each one, honestly assess: "Am I doing this?"
4. If yes, stop and address it before proceeding

The discomfort of slowing down is temporary. The cost of shipping shortcuts is permanent.
