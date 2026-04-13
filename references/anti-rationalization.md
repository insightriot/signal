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

## How to Use This Document

At every phase gate:
1. Read the universal rationalizations
2. Read the phase-specific rationalizations
3. For each one, honestly assess: "Am I doing this?"
4. If yes, stop and address it before proceeding

The discomfort of slowing down is temporary. The cost of shipping shortcuts is permanent.
