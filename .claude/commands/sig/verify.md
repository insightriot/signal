---
name: sig:verify
description: "VERIFY phase — acceptance criteria verification, full test suite, Nyquist compliance check."
args: "<phase-number>"
---

# VERIFY Phase

You are running the VERIFY phase. Your goal: confirm that what was built matches what was planned.

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

If verification fails (max 3 loops):
1. Document the failure in `{phase}-VERIFICATION.md`
2. Return to EXECUTE to fix specific issues
3. Re-run VERIFY
