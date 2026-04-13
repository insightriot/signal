---
name: hybrid-review
description: "REVIEW phase — code quality, security hardening, performance optimization, and code simplification. Agent Skills' key contribution."
args: "<phase-number>"
---

# REVIEW Phase

You are running the REVIEW phase — the bridge between "does it work?" (VERIFY) and "is it good?" (SHIP). This is Agent Skills' primary contribution to the hybrid workflow.

## Skill Loading

Load ALL four review skills from `${CLAUDE_PLUGIN_ROOT}/skills/review/`:
- `code-review-and-quality/SKILL.md`
- `security-and-hardening/SKILL.md`
- `performance-optimization/SKILL.md`
- `code-simplification/SKILL.md`

This is the heaviest skill load in the workflow (~12,700 tokens). Load all four — token budget analysis confirmed this fits comfortably.

## Workflow

### 1. Code Quality Review

Using the code-review skill, evaluate all changes across five axes:
- Correctness, Readability, Architecture, Security, Performance
- Categorize findings: Critical / Important / Suggestion / Nit

### 2. Security Hardening

Using the security skill:
- Run through the OWASP Top 10 prevention checklist
- Check input validation at all system boundaries
- Verify secrets management
- Check security headers and CORS configuration
- Audit dependencies

### 3. Performance Analysis

Using the performance skill:
- Check for N+1 queries
- Verify pagination on list endpoints
- Check bundle size impact (frontend)
- Verify caching strategy
- Check for unnecessary re-renders (React)

### 4. Simplification Pass

Using the code-simplification skill:
- Identify unnecessarily complex code
- Check for dead code, unused imports, redundant abstractions
- Verify naming clarity
- Ensure project conventions are followed

### 5. Write Review Report

Generate `.planning/{phase}-REVIEW.md`:
```markdown
# Review Report — Phase {n}

## Critical Issues (must fix before SHIP)
{list with file:line references}

## Important Issues (should fix)
{list}

## Suggestions (optional improvements)
{list}

## Security Findings
{OWASP checklist results}

## Performance Findings
{bottleneck analysis}

## Simplification Opportunities
{list}

## Verdict
- [ ] PASS — ready for SHIP
- [ ] FAIL — issues must be addressed (return to EXECUTE)
```

## Phase Gate

### Anti-Rationalization Check
| Temptation | Check |
|---|---|
| "The code works and tests pass, review is redundant" | Working code can be insecure, slow, and unmaintainable. Review catches what tests can't |
| "Security hardening is overkill for this project" | Every project that handles user data needs security basics |
| "Performance optimization is premature" | Checking for anti-patterns (N+1, unbounded fetches) is not premature optimization |
| "Simplification is just bikeshedding" | Code clarity directly impacts long-term maintenance cost |

### Exit Criteria
- [ ] All Critical issues resolved
- [ ] All Important issues resolved or explicitly deferred with justification
- [ ] Security checklist completed
- [ ] Performance anti-patterns addressed
- [ ] Simplification pass completed
- [ ] Review report written
- [ ] User approves review results
