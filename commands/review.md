---
name: sig:review
description: "REVIEW phase — code quality, security hardening, performance optimization, and code simplification. Agent Skills' key contribution."
args: "<phase-number>"
---

# REVIEW Phase

You are running the REVIEW phase — the bridge between "does it work?" (VERIFY) and "is it good?" (SHIP). This is Agent Skills' primary contribution to the Signal workflow.

## 0. Tier-gating preamble (run before anything else)

Read the **effective profile** before any other workflow step: `readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`), where `currentEpic` is `current_epic` from STATE.md (via `readState`). In **Epic mode** (a strict `current_epic`) an Epic-scoped `.planning/{EpicID}-PROFILE.md` shadows the project PROFILE for this Epic's phases; in **linear mode** (null / absent / non-strict `current_epic`) it reads `.planning/PROFILE.md` unchanged — byte-identical to pre-E11. Fail-open on the STATE value: a hand-edited or garbage `current_epic` degrades to the project PROFILE, never throws.

- **If neither PROFILE.md is present:** `readEffectiveProfile` throws the same not-found error — halt with *"No PROFILE.md found at .planning/PROFILE.md. Run `/sig:calibrate` first to tier this project, then re-run `/sig:review`."* Do not proceed.
- **If `REVIEW` is in `phases_skipped`:** exit with *"This tier ({tier}) skips REVIEW. Run `/sig:ship` next, or `/sig:escalate` if scope has grown and REVIEW should run."* Do not proceed. (SKETCH and SPIKE tiers skip REVIEW by default.)
- **Apply `rigor_overrides`** from PROFILE.md — REVIEW has the most overrides of any phase. **Precedence rule: `review_depth` is the master switch.** When `review_depth: none`, REVIEW is in `phases_skipped` and the preamble exits above. When `review_depth: quality-only`, only Step 1 runs — Steps 2/3/4 are skipped regardless of what `security_audit` / `performance_pass` / `simplification_pass` say. Those three flags **only matter when `review_depth: full`**. (FEATURE tier sets `review_depth: quality-only` AND `security_audit: basic` etc.; the `quality-only` master switch wins, the others are inert at that tier.)

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

Tooling: `tools/lib/profile.js` exposes `readProfile`, `readEffectiveProfile`, `isPhaseEnabled`, `applyRigorOverrides`. Schema reference: `references/profile-schema.md`. Question convention: `references/question-patterns.md`.

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
- [ ] PASS-WITH-FIXES — Important issues fixed in-phase; ready for SHIP
- [ ] FAIL — issues must be addressed (return to EXECUTE)
```

**PASS-WITH-FIXES guidance.** Use this verdict when REVIEW found Important issues but the fix is small enough to land in REVIEW itself rather than ceremonially looping back to EXECUTE. Rule of thumb: total change ≤ 50 LOC, all tests still pass, no design impact. Document each fix in the report (path, summary, why fix-in-phase was chosen). Fixes that touch architecture, ripple beyond a single file, or require new tests should FAIL and loop back to EXECUTE — that's what the loop is for.

| Verdict | When |
|---|---|
| PASS | 0 Critical, 0 Important. Suggestions optional. |
| PASS-WITH-FIXES | Important issues found AND total fix < 50 LOC AND tests still green AND no architectural impact. |
| FAIL | Any Critical, OR Important fix > 50 LOC, OR tests can't stay green without re-planning. |

### 5b. Mark STATE.md fresh (M4.5.E6.S4)

**SKETCH tier:** skip — REVIEW is in `phases_skipped` for SKETCH anyway, but if a re-calibration brought REVIEW back, STATE.md updates only via manual `/sig:checkpoint`.

**FEATURE/SPIKE/FULL:** call `markFresh(baseDir, {commit: <git HEAD>})` from `tools/lib/state.js`. Advances `last_updated` / `last_updated_commit` so `/sig:resume` reads fresh after REVIEW closes.

If `markFresh` fails (lock contention, git unavailable):
- Under `gate_strictness: strict`, surface but **do not halt phase exit** — the review is already written; the state-write blip is a recovery item, not a review failure.
- Under `light` / `off`, log to stderr and continue.

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
