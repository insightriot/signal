---
name: sig:verify
description: "VERIFY phase — acceptance criteria verification, full test suite, Nyquist compliance check."
args: "<phase-number>"
---

# VERIFY Phase

You are running the VERIFY phase. Your goal: confirm that what was built matches what was planned.

## 0. Tier-gating preamble (run before anything else)

Read the **effective profile** before any other workflow step: `readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`), where `currentEpic` is `current_epic` from STATE.md (via `readState`). In **Epic mode** (a strict `current_epic`) an Epic-scoped `.planning/{EpicID}-PROFILE.md` shadows the project PROFILE for this Epic's phases; in **linear mode** (null / absent / non-strict `current_epic`) it reads `.planning/PROFILE.md` unchanged — byte-identical to pre-E11. Fail-open on the STATE value: a hand-edited or garbage `current_epic` degrades to the project PROFILE, never throws.

- **If neither PROFILE.md is present:** `readEffectiveProfile` throws the same not-found error — halt with *"No PROFILE.md found at .planning/PROFILE.md. Run `/sig:calibrate` first to tier this project, then re-run `/sig:verify`."* Do not proceed.
- **If `VERIFY` is in `phases_skipped`:** exit with *"This tier ({tier}) skips VERIFY. Run `/sig:review` next (or `/sig:ship` if REVIEW is also skipped), or `/sig:escalate` if scope has grown and VERIFY should run."* Do not proceed. (No v1 tier currently skips VERIFY.)
- **Apply `rigor_overrides`** from PROFILE.md:

| Override | Effect on this phase |
|---|---|
| `nyquist_enforcement: off` | Skip Step 3 (Nyquist Compliance) entirely. |
| `nyquist_enforcement: basic` | Run Step 3 — check that planned tests exist and cover specified scenarios; do not require evidence each test failed before passing. |
| `nyquist_enforcement: strict` | Run Step 3 with full strictness — every test must have a documented "failed before fixed" record. **Two valid evidence forms (either is sufficient):** (a) per-test red→green git evidence — a commit where only the test was added and CI showed red, followed by the implementation commit that turned it green; or (b) explicit attestation in `{phase}-VERIFICATION.md` that the test was written *before* the implementation, naming the file and the implementation commit it predates. (b) is the lighter-weight default that EXECUTE's atomic-commit-per-slice workflow naturally supports; (a) is required only if a stricter audit trail is being kept. **Permanent gap warning:** code that shipped before strict mode was active is structurally non-recoverable for strict Nyquist (see `references/tier-definitions.md` § "Recoverable vs. permanent backfills"). Surface this as a known limit if escalation enabled strict mode mid-flight. |
| `gate_strictness: off` | Auto-advance through verification; no per-step confirmation. |
| `gate_strictness: light` | Confirm at end of phase. |
| `gate_strictness: strict` | Confirm at every step + run anti-rationalization at exit. |

Tooling: `tools/lib/profile.js` exposes `readProfile`, `readEffectiveProfile`, `isPhaseEnabled`, `applyRigorOverrides`. Schema reference: `references/profile-schema.md`. Question convention: `references/question-patterns.md`.

## Skill Loading

Load from `${CLAUDE_PLUGIN_ROOT}/skills/verify/`:
- `browser-testing-with-devtools/SKILL.md`
- `debugging-and-error-recovery/SKILL.md`

## Workflow

### 1. Acceptance Criteria Verification

For each task in `{phase}-PLAN.md`:
1. Read the acceptance criteria
2. Verify the implementation satisfies each criterion
3. Record pass/fail with evidence

### 2. Full Test Suite

Run the complete test suite. All tests must pass.

### 3. Nyquist Compliance

Compare `{phase}-VALIDATION.md` test mapping against actual tests:
- Are all mapped tests implemented?
- Do tests cover the specified scenarios?
- Any gaps between planned and actual coverage?

### 4. Build Verification

- Clean build succeeds
- No new warnings introduced
- Linter passes

### 5. Write Verification Report

Generate `.planning/{phase}-VERIFICATION.md` with results.

### 5b. Mark STATE.md fresh (M4.5.E6.S4)

**SKETCH tier:** skip this step. STATE.md updates only via manual `/sig:checkpoint`.

**FEATURE/SPIKE/FULL:** call `markFresh(baseDir, {commit: <git HEAD>})` from `tools/lib/state.js`. This advances `last_updated` to now and `last_updated_commit` to HEAD so the staleness banner in `/sig:resume` reads as fresh after VERIFY closes.

If `markFresh` fails (lock contention, git unavailable, etc.):
- Under `gate_strictness: strict`, surface the failure to the user but **do not halt phase exit** — the work is already done; the state-write blip is a recovery item, not a verification failure.
- Under `light` / `off`, log to stderr and continue.

## Phase Gate

### Anti-Rationalization Check
| Temptation | Check |
|---|---|
| "The tests pass, so it must work" | Tests verify code, not user experience. Check the actual behavior |
| "That edge case probably won't happen" | If it's in the acceptance criteria, verify it |
| "It's close enough" | Close enough is not done. Either it meets criteria or it doesn't |

### Exit Criteria
- [ ] All acceptance criteria verified with evidence
- [ ] Full test suite passes
- [ ] Nyquist compliance check passes
- [ ] Build succeeds cleanly
- [ ] User approves verification results

### Loop Back

If verification fails, ask the user using the **3-options-plus-other** pattern (see `references/question-patterns.md`). **Render via `AskUserQuestion(multiSelect: false)` per § Rendering — the option content (name / "Pick this if" / recommendation) flows into the per-option `description`, not as literal markdown output.**

A. **Loop back to EXECUTE.** Fix the specific failures and re-run VERIFY.
   Pick this if: the gap is small, fixes are well-scoped, and you've looped <3 times for this phase. Default for first/second loops.

B. **Escalate the loop ceiling via `/sig:escalate`.** If the third loop is approaching and the project's stakes have shifted (e.g., the gap reveals a missing dimension of the work), escalate the tier and re-plan.
   Pick this if: the third loop is imminent and the failure pattern suggests the original calibration was too low.

C. **Accept the failure and document it.** Mark the failed criteria as known limits in `{phase}-VERIFICATION.md`; ship with explicit caveats.
   Pick this if: the failure is real but the cost of fixing exceeds the cost of shipping with a documented limit (rare; defaults to A or B).

If none of these fit, describe what you'd prefer and capture the reasoning in `{phase}-VERIFICATION.md` for downstream phases.

**Recommendation:** A for the first 2 loops; reassess at loop 3 — typically B if calibration looks too low, C if the failure is genuinely de-scope-able.

After choosing:
1. Document the failure (and the chosen path) in `{phase}-VERIFICATION.md`.
2. Execute the chosen path.
