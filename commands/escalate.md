---
name: sig:escalate
description: "Escape hatch — re-run calibration carrying current context, update PROFILE.md tier, and append to escalation_history. Use when scope, stakes, or risk profile shifts mid-flight."
args: ""
---

# ESCALATE — Mid-Flight Tier Adjustment

Mid-flight tier adjustment for an already-calibrated project. Use this when scope, stakes, or risk profile has changed since the last calibration and the current tier no longer fits. Common paths:

- **SKETCH → FEATURE/FULL** when throwaway-scope work turns out to have real users.
- **FEATURE → FULL** when the feature ends up handling unexpected sensitivity (auth added, PII discovered).
- **SPIKE → FEATURE/FULL** when research succeeded and is becoming the actual product.
- **FEATURE → SPIKE** when work stalls on an unanswered architectural question.
- **FULL → FEATURE** (rare) when re-scoping from production to internal-only.

Distinct from `/sig:calibrate --re-calibrate`: re-calibrate restarts the profile from scratch (preserving escalation history); escalate carries existing answers forward, appends to history, and surfaces back-fill consequences.

Authoritative references:
- `${CLAUDE_PLUGIN_ROOT}/references/profile-schema.md` — PROFILE.md format
- `${CLAUDE_PLUGIN_ROOT}/references/tier-definitions.md` — tier derivation + escalation paths + back-fill expectations

## Workflow

### 1. Pre-flight — load current state

1. **Verify `.planning/PROFILE.md` exists.** If missing, refuse: *"No PROFILE.md found. Escalate is for adjusting an existing tier — run `/sig:calibrate` first to set the initial tier."* Exit.
2. **Load current state:**
   - PROFILE.md: current tier, current `calibration` answers, current `rigor_overrides`, full `escalation_history`, original `created_at`.
   - STATE.md (if present): which phases have completed. This matters for back-fill warnings — a SKETCH project that already shipped REVIEW-skipped commits has different debt than one that hasn't started EXECUTE yet.
3. **Show the user where they stand:**
   ```
   Current tier: {TIER}, last calibrated {DATE}.
   Calibration answers: scope={scope}, stakes={stakes}, novelty={novelty},
                        reversibility={reversibility}, horizon={horizon}.
   Prior escalations: {N entries — list from→to summary if any}.
   Phases completed: {list from STATE.md, or "none yet"}.
   ```
4. **Ask the user what's changed.** Free-form prompt: *"What's changed since calibration that brought you here?"* Capture the response — it becomes the `reason` field in the new `escalation_history` entry. Don't accept "I just want more rigor" — push for the actual change ("scope grew because we added auth," "stakes shifted because we're now handling PII," etc.). The reason is the most valuable artifact in escalation_history; future reviewers read it to understand the decision trail.

### 2. Re-ask the 5 diagnostic questions

Same 5 enum-strict questions as `/sig:calibrate`, but show prior answers as the **default** the user can confirm or override.

For each question:
- Show the prior answer: *"Scope (was: `feature`) — has this changed?"*
- If user says "same" / "no change," carry the prior answer.
- If user supplies a new answer, validate against the same strict enum (no synonyms; re-ask if mismatched).

The 5 questions and enum values are identical to `/sig:calibrate` — see `references/profile-schema.md` for the full list. Brief recap:

1. **Scope:** `throwaway / feature / subsystem / product`
2. **Stakes:** `none / minor / major / catastrophic`
3. **Novelty:** `familiar / rare / first-for-org / first-in-industry`
4. **Reversibility:** `trivial / moderate / painful / irreversible`
5. **Horizon:** `hours / days / months / years`

### 3. Derive new tier

Apply the same derivation rules as `/sig:calibrate`, in order. First match wins.

1. **FULL** if any of: `stakes: catastrophic`, `reversibility: irreversible`, `horizon: years`.
2. Else **SPIKE** if all of: stakes ∈ {none, minor} AND novelty ∈ {first-for-org, first-in-industry} AND horizon ∈ {hours, days} AND scope ∈ {throwaway, feature}.
3. Else **SKETCH** if all of: `scope: throwaway`, `stakes: none`, `reversibility: trivial`, horizon ∈ {hours, days}.
4. Else **FEATURE**.

### 4. Compare to current tier — three cases

**Case A — same tier as before.**
Re-derivation produced the same tier the project already has. Surface this to the user: *"Re-deriving with the new answers still produces {TIER} — no tier change needed. Want to override anyway, or exit?"*
- If user wants to override (they think the project should be a different tier despite the derivation): proceed to step 5 with explicit override, applying the same up/down override semantics from `/sig:calibrate` step 4 (downward = warn loudly, upward = brief-confirm with cost implications).
- If user says exit: do not modify PROFILE.md. Print: *"No change. PROFILE.md untouched."* and stop.

**Case B — escalation upward (more rigor: SKETCH→FEATURE, FEATURE→FULL, SPIKE→FEATURE/FULL, etc.).**
Show the user the rigor delta — which dials are getting stricter, which previously-skipped phases now run. Then surface **back-fill warnings** based on prior tier × phases already completed:

| Prior tier | Phases completed | Back-fill warning |
|---|---|---|
| Any | EXECUTE done with `tdd_required: false` | *"Prior commits have no tests. Recommend `/sig:add-tests` (Milestone 3 work) or manual retroactive test pass."* |
| SKETCH | SHIP done | *"REVIEW was skipped on already-shipped code. Recommend running `/sig:review` against prior commits."* |
| FEATURE → FULL | REVIEW done with `security_audit: basic` | *"Prior REVIEW used OWASP Top 10 only. Recommend re-running REVIEW with the deeper `security-and-hardening` skill."* |
| FEATURE → FULL | VERIFY done with `nyquist_enforcement: basic` | *"**Permanent gap, not a fixable debt.** FULL expects strict Nyquist — every test was seen to fail before passing, proving it catches the bug. Once code has shipped, the bug is fixed and the original fail event is gone. Approximations: mutation testing (break code, confirm test catches it) gives partial confidence; developer attestation is honesty-based. Neither equals strict Nyquist on prior commits. **Forward work can fully comply; pre-escalation commits never will.** Document this in PROFILE.md body as a known limit. See `tier-definitions.md` § 'Recoverable vs. permanent backfills' for the broader principle."* |
| SPIKE → FEATURE/FULL | EXECUTE done | *"Exploratory code may not be production-shaped. Recommend a refactor pass before further EXECUTE."* |

These warnings populate the new `escalation_history` entry's `backfill_warnings` array.

**Case C — de-escalation downward (less rigor).**
Rare but valid. Surface to the user: *"De-escalation from {OLD} to {NEW}. This is unusual — confirm this is intentional? Reason from step 1: '{user reason}'."*
- De-escalation does NOT remove already-completed rigor (tests stay; security audits stay). It only relaxes future phases.
- `backfill_warnings: []` — there's nothing to back-fill when going down.

### 5. Write updated PROFILE.md

Modify in place — preserve fields that should not change:
- **Update** `tier` to the new value.
- **Update** `calibration` block with the new answers.
- **Update** `phases_skipped` and `rigor_overrides` to match the new tier's defaults (literally per the tier-to-defaults table in `tier-definitions.md`; same values as `/sig:calibrate` writes).
- **APPEND** to `metadata.escalation_history` — never replace the array, always push:
  ```yaml
  - from_tier: {OLD_TIER}
    to_tier: {NEW_TIER}
    timestamp: {ISO-8601 UTC now, with trailing Z}
    reason: "{user-supplied reason from step 1.4}"
    backfill_warnings:
      - "{warning 1}"
      - "{warning 2}"
  ```
  If de-escalation, `backfill_warnings: []`.
- **Preserve** `metadata.created_at` — that's the original calibration timestamp; never touch it.
- **Preserve** `metadata.created_by` — still `sig:calibrate` (the original creator). Don't overwrite to `sig:escalate`.
- **Update** the markdown body — append a new section like:
  ```markdown
  ## Escalation {YYYY-MM-DD}: {OLD_TIER} → {NEW_TIER}

  Reason: {user-supplied reason}.

  Rigor changes: {1–2 sentence summary of what's now stricter or looser}.

  Back-fill recommendations: {bullet list of warnings, or "none — de-escalation"}.
  ```
  Never delete prior body sections — escalation history accumulates as narrative.

### 6. Print next-step message

For escalations upward (Case B):
```
Tier escalated: {OLD_TIER} → {NEW_TIER}.
Reason logged: "{reason}".

Back-fill recommendations:
- {warning 1}
- {warning 2}
- ...

You can address back-fill now, or continue with the next phase
(/sig:{current_phase} per STATE.md) and address back-fill before SHIP.
```

For Case A (no change, override declined): no message beyond the exit notice in step 4.

For Case C (de-escalation): simpler message — no back-fill list, just the new tier and a note that future phases will run with reduced rigor.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "The user wants more rigor — skip the questions, just bump the tier." | Re-ask the 5 questions. Sometimes the user thinks scope grew when only stakes changed; sometimes they think stakes are higher than they are. The dimensions catch real shifts vs. perceived ones. |
| "The 5 questions feel repetitive — they were just answered." | That's the point. Calibration drift is real and accumulates over weeks. Re-asking is the cheapest possible re-grounding. |
| "Back-fill warnings feel preachy — skip them." | Don't. Without explicit warnings, escalation up creates silent debt: tests that don't exist, security passes that didn't happen, REVIEW phases that were skipped on production code. The user needs to see the consequences explicitly to decide what to actually back-fill. |
| "Tier didn't change — exit silently without saying anything." | No. Print the comparison anyway. The user came to escalate; a "no change needed" result is information, not a non-event. |

## Gate: Escalation Complete

- [ ] PROFILE.md updated (new tier, new `rigor_overrides`, new `phases_skipped`)
- [ ] `escalation_history` has a new entry with from/to/timestamp/reason/backfill_warnings
- [ ] `metadata.created_at` unchanged from original calibration
- [ ] `metadata.created_by` unchanged
- [ ] PROFILE.md body has a new `## Escalation {date}: {old} → {new}` section
- [ ] Back-fill warnings surfaced (or absent for Case A and C)
- [ ] User has clear next-step direction
