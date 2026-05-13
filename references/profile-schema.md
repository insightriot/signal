# PROFILE.md — Schema Reference

`PROFILE.md` is the project-complexity calibration output. It lives at `.planning/PROFILE.md` and is:

- **Written by** `/sig:calibrate` (Phase 0) after 5 diagnostic questions.
- **Read by** every downstream phase command as its first action.
- **Updated by** `/sig:escalate` when the tier is promoted mid-flight.

Every phase gate, every skill-loading decision, and every rigor toggle flows from this one file.

---

## Format

`PROFILE.md` is a Markdown file with a **YAML frontmatter block**. The frontmatter is machine-readable by phase commands; the body is human-readable narrative recording *why* the calibration came out the way it did.

### Example — FULL-tier profile

```markdown
---
tier: FULL
schema_version: 1

calibration:
  scope: subsystem
  stakes: catastrophic
  novelty: rare
  reversibility: painful
  horizon: years

phases_skipped: []

rigor_overrides:
  tdd_required: true
  security_audit: full
  performance_pass: true
  simplification_pass: true
  nyquist_enforcement: strict
  plan_validation_dims: all
  research_parallelism: 4
  gate_strictness: strict
  context_rot_reread: true
  review_depth: full

metadata:
  created_at: 2026-04-22T14:23:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary

Rebuild of the authentication subsystem. Catastrophic stakes (security + PII),
painful reversibility (session-token migration), multi-year horizon. High
rigor on all axes.

## Notes
- Security audit is non-negotiable; OWASP ASVS Level 2.
- Plan validation runs all 8 dimensions.
- REVIEW phase runs full multi-lens review.
```

### Example — SKETCH-tier profile

```markdown
---
tier: SKETCH
schema_version: 1

calibration:
  scope: throwaway
  stakes: none
  novelty: familiar
  reversibility: trivial
  horizon: hours

phases_skipped:
  - REVIEW

rigor_overrides:
  tdd_required: false
  security_audit: none
  performance_pass: false
  simplification_pass: false
  nyquist_enforcement: off
  plan_validation_dims: none
  research_parallelism: 0
  gate_strictness: off
  context_rot_reread: false
  review_depth: none

metadata:
  created_at: 2026-04-22T14:30:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary

One-shot static marketing page. Throwaway scope, no user data, ships to
a CDN. No review needed — full SKETCH tier.
```

---

## Frontmatter Schema

### Top-level fields

| Field | Type | Required | Description |
|---|---|---|---|
| `tier` | enum | yes | `SKETCH | FEATURE | SPIKE | FULL` |
| `schema_version` | integer | yes | Current: `1`. Bump on breaking schema changes. |
| `calibration` | object | yes | Answers to the 5 diagnostic questions. |
| `phases_skipped` | array&lt;string&gt; | yes | Phase names to skip. Empty array if none. |
| `rigor_overrides` | object | yes | Per-key rigor configuration for the active workflow. |
| `metadata` | object | yes | Timestamps + escalation history. |

### `calibration` — the 5 diagnostic questions

| Field | Enum values | Meaning |
|---|---|---|
| `scope` | `throwaway` / `feature` / `subsystem` / `product` | Size of the work being done. |
| `stakes` | `none` / `minor` / `major` / `catastrophic` | Consequences if it breaks in production. |
| `novelty` | `familiar` / `rare` / `first-for-org` / `first-in-industry` | Prior experience with this kind of work. |
| `reversibility` | `trivial` / `moderate` / `painful` / `irreversible` | Cost of undoing if the choice is wrong. |
| `horizon` | `hours` / `days` / `months` / `years` | How long the output is expected to live. |

### `phases_skipped`

Array of phase names the current tier skips. Valid values: `DISCUSS`, `PLAN`, `EXECUTE`, `VERIFY`, `REVIEW`, `SHIP`.

`CALIBRATE` is never skipped (it's how we got here). `EXECUTE` is never skipped (no tier is zero-work).

Downstream phase commands read this array as their **first action**. If the current phase appears here, the command exits with a "this tier skips {phase}" message.

### `rigor_overrides`

All ten keys are required. A tier sets their defaults; `/sig:calibrate` writes them literally (not by reference to the tier) so that escalations and manual edits remain explicit.

| Key | Type | Description |
|---|---|---|
| `tdd_required` | boolean | If `true`, EXECUTE enforces tests-first. If `false`, test-after or no-tests is permitted. |
| `security_audit` | enum `none | basic | full` | Depth of REVIEW's security pass. `none` = skip. `basic` = OWASP Top 10 checklist. `full` = full `security-and-hardening` skill + ASVS-level audit. |
| `performance_pass` | boolean | Whether REVIEW runs the `performance-optimization` skill. |
| `simplification_pass` | boolean | Whether REVIEW runs the `code-simplification` skill. |
| `nyquist_enforcement` | enum `off | basic | strict` | Nyquist test-coverage enforcement in PLAN + VERIFY. `off` = skip mapping. `basic` = map but don't enforce. `strict` = tests must actually run and must fail before fix (no test theater). |
| `plan_validation_dims` | enum `none | core | all` | Plan-checker dimensions. `none` = skip plan check. `core` = 3 dimensions (goal alignment, completeness, testability). `all` = 8 dimensions. |
| `research_parallelism` | integer | Number of parallel research agents PLAN spawns. `0` disables the research step. Typical: `0` / `2` / `4`. |
| `gate_strictness` | enum `off | light | strict` | Human approval at phase gates. `off` = auto-advance. `light` = confirm once per phase. `strict` = explicit approval at every gate + anti-rationalization check. |
| `context_rot_reread` | boolean | Whether EXECUTE re-reads `CONTEXT.md` every ~45 minutes to prevent drift. |
| `review_depth` | enum `none | quality-only | full` | REVIEW phase depth. `none` = skip phase entirely (also implied if REVIEW is in `phases_skipped`). `quality-only` = code-review skill only. `full` = all four review skills (code-review, security, perf, simplification). |

### `metadata`

| Field | Type | Description |
|---|---|---|
| `created_at` | ISO-8601 string | Timestamp `/sig:calibrate` wrote the profile. |
| `created_by` | string | Which command wrote the profile. Typically `sig:calibrate`. |
| `escalation_history` | array&lt;object&gt; | Empty at creation. Appended to by `/sig:escalate`. |

#### Escalation history entry shape

```yaml
escalation_history:
  - from_tier: SKETCH
    to_tier: FEATURE
    timestamp: 2026-04-23T10:15:00Z
    reason: "scope grew — added auth integration"
    backfill_warnings:
      - "REVIEW phase was previously skipped — run /sig:review on prior commits"
```

---

## How commands consume PROFILE.md

Every phase command's first action:

1. **Read** `.planning/PROFILE.md`. If missing, halt and prompt the user to run `/sig:calibrate` first.
2. **Check `phases_skipped`** — if the current phase is listed, exit with an explanatory message ("This tier skips DISCUSS. Run `/sig:plan` next, or `/sig:escalate` to upgrade.").
3. **Apply `rigor_overrides`** to the workflow config:
   - Disable skill loading for anything turned off (e.g., `security_audit: none` skips loading `security-and-hardening`).
   - Bypass gates where `gate_strictness: off`.
   - Reduce plan validation to the configured dimension count.
   - Set TDD enforcement flag in EXECUTE.
4. **Proceed** with the phase.

---

## Validation rules

A valid `PROFILE.md`:

- Has `tier` matching one of the four enum values.
- Has `schema_version: 1`.
- Has all five `calibration` fields with valid enum values.
- Has `phases_skipped` as an array (possibly empty), drawn from the six valid phase names.
- Has all ten `rigor_overrides` keys present with correct types.
- Has valid ISO-8601 `created_at`.

A `readProfile(baseDir)` helper in `tools/lib/` (see MILESTONE-2) should return a typed object and throw on any schema violation.

---

## Tier defaults

The tier sets the default values of every field. Those defaults are authored in `references/tier-definitions.md` — the authoritative tier-to-defaults mapping.

`/sig:calibrate` reads the diagnostic answers → derives the tier → looks up the defaults → writes them literally into `PROFILE.md`. Escalation and manual edits remain explicit because they modify values, not references.

---

## Design notes

- **Why YAML frontmatter + markdown body?** Frontmatter is machine-readable (every language has a YAML parser); body is for humans to record reasoning. The same pattern that GSD and Agent Skills already use elsewhere.
- **Why all ten overrides required?** Forces `/sig:calibrate` to write complete profiles. Downstream commands don't need defensive "did this field exist?" logic. Keeps consumers simple.
- **Why a separate `escalation_history` in metadata?** So the decision trail survives. If a SKETCH project escalated to FULL mid-build, future reviewers need to see that history to understand why some artifacts (like tests) only exist from a certain commit onward.
- **Why enums instead of booleans for some fields?** `security_audit: basic` vs. full is a real distinction for FEATURE-tier work. Booleans would force a false binary.
