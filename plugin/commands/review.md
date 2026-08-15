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

## Phase entry — record the phase (M5.E9 FR6, `B41`)

**Call this only if every precondition above passed.** The tier gate must have let this command through, and any halt condition in it must not have fired. If this command is halting — wrong tier, a missing prerequisite artifact, a failed gate — **do not call `transitionPhase`**: return the halt instead.

**Then, before any Workflow step**, call `await transitionPhase(baseDir, 'REVIEW')` (`tools/lib/state.js`). It appends the phase being **left** to `completed_phases` and sets `phase: REVIEW`.

**Why the condition (M5.E13, `B48`).** This instruction used to be unconditional, and an agent running `/sig:execute` against a project with no PLAN artifact **correctly refused it** — obeying would have recorded `phase: EXECUTE` for a project with nothing to execute, writing a false entry into the ledger M5.E9 had just made honest. Obeying corrupted the record; disobeying reproduced `B41`. The instruction was the thing that was wrong. `transitionPhase` now also refuses to record a phase that produced no artifact, so the text and the code agree rather than one relying on the other.

**Why this exists.** Until M5.E9 only `calibrate` / `discuss` / `ship` ever called `transitionPhase`. `plan`, `execute`, `verify` and `review` advanced nothing — so a command-driven project finished a full build with `completed_phases: [DISCUSS]`, `phase: SHIP`, and **PLAN / EXECUTE / VERIFY / REVIEW never recorded at all**, while `/sig:status` and `/sig:resume` reported `DISCUSS` for the entire run. `markFresh` then stamped a fresh timestamp over that stale position, turning *stale-and-flagged* into *stale-and-silent*. It survived eleven releases because Signal's own repo maintained these fields **by hand**.

**At entry, not exit** — the position must be true *while* the phase runs, which is what any "current phase is REVIEW" precondition depends on. Surface the returned `{quarantined}` list if non-empty: malformed ledger entries are relocated, never silently dropped.

## Workflow

**Artifact naming (M4.5.E11).** Name each artifact this phase writes with `artifactName(ARTIFACT, { currentEpic })` (`tools/lib/resume.js`), and resolve ones it reads with `resolveArtifactPath(planningDir, ARTIFACT, { currentEpic, phase })` — `currentEpic` is `current_epic` from STATE. **Epic mode** → `{EpicID}-{ARTIFACT}.md` (e.g. `M4.5.E11-REVIEW.md`); **linear mode** → the `{phase}-{ARTIFACT}.md` forms below, byte-identical to pre-E11. Substitute the `artifactName` result wherever this file writes a literal `.planning/{phase}-*.md` path.

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

Generate the REVIEW artifact (`artifactName('REVIEW', { currentEpic })` — `{phase}-REVIEW.md` linear / `{EpicID}-REVIEW.md` Epic):
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
- [ ] PASS-WITH-FIXES — Important issues, or a Critical, fixed in-phase; ready for SHIP
- [ ] FAIL — issues must be addressed (return to EXECUTE)
```

**PASS-WITH-FIXES guidance.** Use this verdict when REVIEW found Important issues — **or a Critical** — but the fix is small enough to land in REVIEW itself rather than ceremonially looping back to EXECUTE. The conditions are **conjunctive, and every one is load-bearing**: the issue was *discovered and closed inside REVIEW*, **and** the change totals **≤ 50 LOC of non-test source** (insertions plus deletions), **and** all tests still pass, **and** the fix carries **new coverage** for the defect where none existed — written in-phase and green — **and** there is no design impact. Failing any one of them is FAIL. **The required coverage does not count against the cap:** the 50 is non-test source precisely so that writing the regression test cannot push a qualifying fix into FAIL. A rule that penalises the reviewer who tests is a rule that trains reviewers not to test. Document each fix in the report (path, summary, why fix-in-phase was chosen). A fix that touches architecture or ripples beyond a single file is *showing you design impact* — that is the last condition failing, not a separate one — and it means FAIL and a loop back to EXECUTE; that's what the loop is for.

**Why a Critical can qualify (D-M5E17-1).** A Critical *discovered and closed inside REVIEW*, with a small diff and green tests, is not the same event as a Critical discovered at ship or one needing re-planning. This table used to read *"FAIL | Any Critical"* while practice went the other way twice — M5.E9 and M5.E13 both shipped PASS-WITH-FIXES with an in-phase Critical — so the rule and the work disagreed for two releases and only a live REVIEW surfaced it. The rule was miscalibrated, not the practice. **The counter-argument is recorded because it is real:** "Critical" exists to force a harder stop, and *"the diff was small"* is exactly how a Critical gets under-fixed — which is why the conditions above are conjunctive rather than a rule of thumb.

| Verdict | When |
|---|---|
| PASS | 0 Critical, 0 Important. Suggestions optional. |
| PASS-WITH-FIXES | Important issues **or a Critical** found AND closed in-phase AND total fix ≤ 50 LOC of non-test source AND tests still green AND new coverage written for the defect AND no design impact. |
| FAIL | A Critical **not** fixed in-phase, OR any fix > 50 LOC of non-test source, OR a fix that needs new coverage and does not get it, OR tests can't stay green without re-planning. |

### 5b. Mark STATE.md fresh (M4.5.E6.S4)

**SKETCH tier:** skip — REVIEW is in `phases_skipped` for SKETCH anyway, but if a re-calibration brought REVIEW back, STATE.md updates only via manual `/sig:checkpoint`.

**FEATURE/SPIKE/FULL:** after the REVIEW artifacts (`{phase}-REVIEW.md`) are committed, call `markFresh(baseDir, {commit: <git HEAD>})` from `tools/lib/state.js`. This advances `last_updated` + `last_updated_commit` to the phase-close commit so `/sig:resume` reads fresh after REVIEW. Run it **after** the commit — passing a pre-commit HEAD records a stale sha and silently defeats the freshness check (AC3.4).

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
