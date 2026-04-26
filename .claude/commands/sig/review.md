---
name: sig:review
description: "REVIEW phase — code quality, security hardening, performance optimization, and code simplification. Agent Skills' key contribution."
args: "<phase-number>"
---

# REVIEW Phase

You are running the REVIEW phase — the bridge between "does it work?" (VERIFY) and "is it good?" (SHIP). This is Agent Skills' primary contribution to the Signal workflow.

## 0. Tier-gating preamble (run before anything else)

Read `.planning/PROFILE.md` before any other workflow step.

- **If `PROFILE.md` is missing:** halt with *"No PROFILE.md found at .planning/PROFILE.md. Run `/sig:calibrate` first to tier this project, then re-run `/sig:review`."* Do not proceed.
- **If `REVIEW` is in `phases_skipped`:** exit with *"This tier ({tier}) skips REVIEW. Run `/sig:ship` next, or `/sig:escalate` if scope has grown and REVIEW should run."* Do not proceed. (SKETCH and SPIKE tiers skip REVIEW by default.)
- **Apply `rigor_overrides`** from PROFILE.md — REVIEW has the most overrides of any phase:

| Override | Effect on this phase |
|---|---|
| `review_depth: none` | Phase is in `phases_skipped` — exit triggered above. |
| `review_depth: quality-only` | Load only `code-review-and-quality`. Skip Steps 2 (security), 3 (performance), 4 (simplification). Lighter token load. |
| `review_depth: full` | Load all four review skills (default). |
| `security_audit: none` | Skip Step 2 (Security Hardening) entirely. |
| `security_audit: basic` | Step 2 = OWASP Top 10 checklist only. |
| `security_audit: full` | Step 2 = OWASP + ASVS Level 2 audit. |
| `performance_pass: false` | Skip Step 3 (Performance Analysis). |
| `simplification_pass: false` | Skip Step 4 (Simplification Pass). |
| `gate_strictness: off` | Auto-advance through review; no per-step confirmation. |
| `gate_strictness: light` | Confirm at end of phase. |
| `gate_strictness: strict` | Confirm at every step + run anti-rationalization at exit. |

Skill loading below assumes `review_depth: full`. If `review_depth: quality-only`, only load the first skill in the list.

Tooling: `tools/lib/profile.js` exposes `readProfile`, `isPhaseEnabled`, `applyRigorOverrides`. Schema reference: `references/profile-schema.md`. Question convention: `references/question-patterns.md`.

## Skill Loading

Load review skills from `${CLAUDE_PLUGIN_ROOT}/skills/review/` per `review_depth` (see preamble):
- `code-review-and-quality/SKILL.md` (always loaded if REVIEW runs)
- `security-and-hardening/SKILL.md` (loaded if `review_depth: full`)
- `performance-optimization/SKILL.md` (loaded if `review_depth: full`)
- `code-simplification/SKILL.md` (loaded if `review_depth: full`)

Full load (~12,700 tokens) is the heaviest in the workflow but token-budget analysis confirmed it fits comfortably. `quality-only` cuts the load substantially for FEATURE-tier work.

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
