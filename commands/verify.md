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

## Phase entry — record the phase (M5.E9 FR6, `B41`)

**Call this only if every precondition above passed.** The tier gate must have let this command through, and any halt condition in it must not have fired. If this command is halting — wrong tier, a missing prerequisite artifact, a failed gate — **do not call `transitionPhase`**: return the halt instead.

**Then, before any Workflow step**, call `await transitionPhase(baseDir, 'VERIFY')` (`tools/lib/state.js`). It appends the phase being **left** to `completed_phases` and sets `phase: VERIFY`.

**Why the condition (M5.E13, `B48`).** This instruction used to be unconditional, and an agent running `/sig:execute` against a project with no PLAN artifact **correctly refused it** — obeying would have recorded `phase: EXECUTE` for a project with nothing to execute, writing a false entry into the ledger M5.E9 had just made honest. Obeying corrupted the record; disobeying reproduced `B41`. The instruction was the thing that was wrong. `transitionPhase` now also refuses to record a phase that produced no artifact, so the text and the code agree rather than one relying on the other.

**Why this exists.** Until M5.E9 only `calibrate` / `discuss` / `ship` ever called `transitionPhase`. `plan`, `execute`, `verify` and `review` advanced nothing — so a command-driven project finished a full build with `completed_phases: [DISCUSS]`, `phase: SHIP`, and **PLAN / EXECUTE / VERIFY / REVIEW never recorded at all**, while `/sig:status` and `/sig:resume` reported `DISCUSS` for the entire run. `markFresh` then stamped a fresh timestamp over that stale position, turning *stale-and-flagged* into *stale-and-silent*. It survived eleven releases because Signal's own repo maintained these fields **by hand**.

**At entry, not exit** — the position must be true *while* the phase runs, which is what any "current phase is VERIFY" precondition depends on. Surface the returned `{quarantined}` list if non-empty: malformed ledger entries are relocated, never silently dropped.

## Workflow

**Artifact naming (M4.5.E11).** Name each artifact this phase writes with `artifactName(ARTIFACT, { currentEpic })` (`tools/lib/resume.js`), and resolve ones it reads with `resolveArtifactPath(planningDir, ARTIFACT, { currentEpic, phase })` — `currentEpic` is `current_epic` from STATE. **Epic mode** → `{EpicID}-{ARTIFACT}.md` (e.g. `M4.5.E11-VERIFICATION.md`); **linear mode** → the `{phase}-{ARTIFACT}.md` forms below, byte-identical to pre-E11. Substitute the `artifactName` result wherever this file writes a literal `.planning/{phase}-*.md` path.

### 1. Acceptance Criteria Verification

For each task in `{phase}-PLAN.md`:
1. Read the acceptance criteria
2. Verify the implementation satisfies each criterion
3. Record pass/fail with evidence

### 1b. Requirement coverage — derived, never recalled (M5.E10 FR1 / FR6)

**Step 1 above enumerates `{phase}-PLAN.md` tasks. That is structurally incomplete**, and it is the
gap this step closes: a requirement that never became a task acceptance criterion is invisible to a
loop over tasks. `REQUIREMENTS.md` is the declaration; the PLAN is one reading of it.

Call `diffRequirementCoverage({requirementsText, verificationText})` from
`tools/lib/requirement-coverage.js`, resolving `{Unit}-REQUIREMENTS.md` with `resolveArtifactPath`.
Then call `checkValidationConsistency(validationText)` from `tools/lib/validation-consistency.js` on
`{Unit}-VALIDATION.md`. Both are read-only, offline, deterministic, and never throw.

Record all three fields in the report, **including at zero**:

- `missing` — requirements declared and not verified. **Name them.** A count is a completeness claim
  wearing a number.
- `deferred` — requirements the REQUIREMENTS artifact itself struck out of the unit. Reported, never
  silently dropped.
- `unattributableGroups` / `cannot-evaluate` reasons — **what the check could not look at.** This is
  not optional detail: *"could not evaluate"* rendered as *"checked and clean"* is `B39`'s shape, and
  the reason a detector earns the mute that makes it useless.

**Write the denominator, not just the numerator (FR6 / AC6.1).** Every coverage statement in the
report reads `{n} of {total}` and says where `{total}` came from — the diff returns `basis`, which
names the requirement groups it scoped to and whether it scoped at all. *"All criteria verified"* with
no denominator is the exact sentence this Epic exists to stop, and it is unfalsifiable by
construction: a reader cannot check a total that was never stated.

**A `missing` result is a FAIL, not a note.** Loop back rather than recording it as a known limit.

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

Generate the VERIFICATION artifact (`artifactName('VERIFICATION', { currentEpic })` — `{phase}-VERIFICATION.md` linear / `{EpicID}-VERIFICATION.md` Epic) with results.

### 5b. Mark STATE.md fresh (M4.5.E6.S4)

**SKETCH tier:** skip this step. STATE.md updates only via manual `/sig:checkpoint`.

**FEATURE/SPIKE/FULL:** after the VERIFY artifacts (`{phase}-VERIFICATION.md`) are committed, call `markFresh(baseDir, {commit: <git HEAD>})` from `tools/lib/state.js`. This advances `last_updated` + `last_updated_commit` to the phase-close commit so the staleness banner in `/sig:resume` reads fresh after VERIFY. Run it **after** the commit — passing a pre-commit HEAD records a stale sha and silently defeats the freshness check (AC3.4).

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
- [ ] Requirement coverage run (Step 1b): `missing` is empty, `deferred` and the un-evaluable set are
      stated in the report, and every coverage claim carries its denominator
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
