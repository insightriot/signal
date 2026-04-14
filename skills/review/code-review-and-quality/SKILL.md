---
name: code-review-and-quality
description: Multi-dimensional code review with quality gates. Use before merging any PR or change, after completing a feature implementation, when another agent or model produced code you need to evaluate, when refactoring existing code, or after any bug fix.
---

# Code Review and Quality

## Overview

Multi-dimensional code review with quality gates. Every change gets reviewed before merge — no exceptions. Review covers five axes: correctness, readability, architecture, security, and performance.

**The approval standard:** "Approve a change when it definitely improves overall code health, even if it isn't perfect."

## When to Use

- Before merging any PR or change
- After completing a feature implementation
- When another agent or model produced code you need to evaluate
- When refactoring existing code
- After any bug fix (review both the fix and the regression test)

## The Five-Axis Review

### 1. Correctness

Does the code do what it claims to do?

- Does it match the spec or task requirements?
- Are edge cases handled (null, empty, boundary values)?
- Are error paths handled (not just the happy path)?
- Does it pass all tests? Are the tests actually testing the right things?
- Are there off-by-one errors, race conditions, or state inconsistencies?

### 2. Readability & Simplicity

Can another engineer understand this code without the author explaining it?

- Are names descriptive and consistent with project conventions?
- Is the control flow straightforward (avoid nested ternaries, deep callbacks)?
- Is the code organized logically?
- Are there any "clever" tricks that should be simplified?
- Could this be done in fewer lines?
- Are abstractions earning their complexity?
- Would comments help clarify non-obvious intent?
- Are there dead code artifacts?

### 3. Architecture

Does the change fit the system's design?

- Does it follow existing patterns or introduce a new one? If new, is it justified?
- Does it maintain clean module boundaries?
- Is there code duplication that should be shared?
- Are dependencies flowing in the right direction (no circular dependencies)?
- Is the abstraction level appropriate?

### 4. Security

Does the change introduce vulnerabilities?

- Is user input validated and sanitized?
- Are secrets kept out of code, logs, and version control?
- Is authentication/authorization checked where needed?
- Are SQL queries parameterized (no string concatenation)?
- Are outputs encoded to prevent XSS?
- Are dependencies from trusted sources?
- Is data from external sources treated as untrusted?
- Are external data flows validated at system boundaries?

### 5. Performance

Does the change introduce performance problems?

- Any N+1 query patterns?
- Any unbounded loops or unconstrained data fetching?
- Any synchronous operations that should be async?
- Any unnecessary re-renders in UI components?
- Any missing pagination on list endpoints?
- Any large objects created in hot paths?

## Change Sizing

"Small, focused changes are easier to review, faster to merge, and safer to deploy."

```
~100 lines changed   → Good. Reviewable in one sitting.
~300 lines changed   → Acceptable if it's a single logical change.
~1000 lines changed  → Too large. Split it.
```

**Splitting strategies when a change is too large:**

| Strategy | When |
|----------|------|
| Stack | Sequential dependencies |
| By file group | Cross-cutting concerns |
| Horizontal | Layered architecture |
| Vertical | Feature work |

## Change Descriptions

Every change needs a description that stands alone in version control history.

**First line:** "Short, imperative, standalone. 'Delete the FizzBuzz RPC' not 'Deleting the FizzBuzz RPC.'"

**Body:** What is changing and why. Include context, decisions, and reasoning. Link to bug numbers, benchmark results, or design docs.

## Review Process

### Step 1: Understand the Context

Before looking at code:

- What is this change trying to accomplish?
- What spec or task does it implement?
- What is the expected behavior change?

### Step 2: Review the Tests First

Tests reveal intent and coverage:

- Do tests exist for the change?
- Do they test behavior (not implementation details)?
- Are edge cases covered?
- Do tests have descriptive names?

### Step 3: Review the Implementation

Walk through the code with the five axes in mind.

### Step 4: Categorize Findings

Label every comment with its severity:

| Prefix | Meaning |
|--------|---------|
| *(no prefix)* | Required change |
| **Critical:** | Blocks merge |
| **Nit:** | Minor, optional |
| **Optional:** / **Consider:** | Suggestion |
| **FYI** | Informational only |

### Step 5: Verify the Verification

Check the author's verification story:

- What tests were run?
- Did the build pass?
- Was the change tested manually?
- Are there screenshots for UI changes?
- Is there a before/after comparison?

## Multi-Model Review Pattern

Use different models for different review perspectives to catch issues that a single model might miss.

## Dead Code Hygiene

After any refactoring or implementation change, check for orphaned code:

1. Identify code that is now unreachable or unused
2. List it explicitly
3. Ask before deleting: "Should I remove these now-unused elements?"

## Review Speed

Slow reviews block entire teams.

- "Respond within one business day" — this is the maximum
- Ideal cadence: Respond shortly after a review request arrives
- Prioritize fast individual responses over quick final approval
- Ask authors to split large changes rather than reviewing massive changesets

## Handling Disagreements

When resolving review disputes, apply this hierarchy:

1. Technical facts and data override opinions
2. Style guides are the absolute authority on style
3. Software design must be evaluated on engineering principles
4. Codebase consistency is acceptable if it doesn't degrade overall health

"Don't accept 'I'll clean it up later.' Experience shows deferred cleanup rarely happens."

## Honesty in Review

When reviewing code:

- Don't rubber-stamp without evidence of review
- Don't soften real issues
- Quantify problems when possible
- Push back on approaches with clear problems
- Accept override gracefully

## Dependency Discipline

Before adding any dependency:

1. Does the existing stack solve this?
2. How large is the dependency?
3. Is it actively maintained?
4. Does it have known vulnerabilities?
5. What's the license?

"Prefer standard library and existing utilities over new dependencies. Every dependency is a liability."

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "It works, that's good enough" | Working code that's unreadable creates compounding debt |
| "I wrote it, so I know it's correct" | Authors are blind to their own assumptions |
| "We'll clean it up later" | Later never comes |
| "AI-generated code is probably fine" | AI code needs more scrutiny, not less |
| "The tests pass, so it's good" | Tests don't catch architecture, security, or readability issues |

## Red Flags

- PRs merged without any review
- Review that only checks if tests pass
- "LGTM" without evidence of actual review
- Security-sensitive changes without security-focused review
- Large PRs that are "too big to review properly"
- No regression tests with bug fix PRs
- Review comments without severity labels
- Accepting "I'll fix it later"

## Verification

After review is complete:

- [ ] All Critical issues are resolved
- [ ] All Important issues are resolved or explicitly deferred with justification
- [ ] Tests pass
- [ ] Build succeeds
- [ ] The verification story is documented
