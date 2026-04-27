# Tier Definitions

Signal has four tiers. Every project is classified into exactly one by `/sig:calibrate`. The tier determines which phases run and with what rigor.

See `profile-schema.md` for the full PROFILE.md schema. This doc is the authoritative tier-to-defaults mapping.

---

## The Four Tiers

### SKETCH — throwaway / prototype

**When to use.** Static marketing page. One-shot script. Hackathon demo. Internal tool with no users. Proof-of-concept you'll delete. The artifact will not live in production; nothing breaks if it disappears.

**Phases.** CALIBRATE → DISCUSS (light) → PLAN (light) → EXECUTE → VERIFY (light) → SHIP
**Skipped:** REVIEW.

**Rigor profile.** Minimal across the board. No TDD required. No security audit. No performance pass. No simplification pass. No Nyquist enforcement. 0 research agents. Gates off. Context rot re-read off. Review depth: none.

**Philosophy.** SKETCH exists to stop Signal from over-engineering throwaway work. If it's wrong to spend 60 minutes planning a homepage, SKETCH is how we say so. Speed over polish — honestly.

**Floor.** SKETCH still produces a minimum 8-artifact `.planning/`: PROJECT.md, PROFILE.md, STATE.md, config.json, CONTEXT.md, 1-PLAN.md, 1-VERIFICATION.md, 1-SHIP.md. That's deliberate — `.planning/` is the project's memory, and even a one-shot benefits from a record of what was decided. **If you want zero overhead, you don't want Signal — you want a shell script.** SKETCH is for "I want a small but real artifact and a record of what I decided." Validated against the T3 Task 3 dogfood (CSV-to-JSON one-shot): the contrast vs FULL is already ~10–24x; pushing lower trades documentation value for marginal ceremony savings. No TRIVIAL tier in v1.

---

### FEATURE — typical feature work

**When to use.** New feature on an existing system. Incremental improvement. Known pattern applied to a new problem. **The default tier** — when in doubt, answer FEATURE.

**Phases.** All 7 enabled. No skips.

**Rigor profile.** Standard, not maximum. TDD required. Basic security (OWASP Top 10 checklist). Performance + simplification passes. Core plan validation (3 dimensions, not 8). 2 research agents. Light gate strictness (confirm once per phase). Context rot re-read on. Review depth: quality-only (code-review skill; skip deep security/perf/simplify unless escalated).

**Philosophy.** FEATURE is the "just do it right" tier. Tuned for what most small-to-medium product features actually need. Not a ceremony, not a gap.

---

### SPIKE — exploratory investigation

**When to use.** You don't know the answer yet. Research into a library choice, architecture alternative, performance question, design tradeoff. Output is *learning*, not production code.

**Phases.** CALIBRATE → DISCUSS → PLAN (as hypothesis list) → EXECUTE (exploratory) → VERIFY (did we answer the question?)
**Skipped:** REVIEW, SHIP.

**Rigor profile.** Optimized for speed over polish. TDD off. No security/perf/simplify. 2 research agents (research *is* the work). Light gates. Nyquist off. Plan validation: none. Context rot re-read off.

**Output.** A findings document summarizing the learning. Not a PR. If the spike's finding is "yes, build this," the follow-up work escalates to FEATURE or FULL and runs through a normal flow.

**Philosophy.** SPIKE exists so that "I need to figure something out" doesn't accidentally get the FULL-tier treatment and grind to a halt. Learning is the deliverable.

---

### FULL — production / critical

**When to use.** Auth. Payments. Data integrity. Public API. Anything where "it breaks" means user harm, financial loss, or irreversible data damage. Also any system with a multi-year horizon, or one-way architectural decisions (database choice, core framework, data model).

**Phases.** All 7 enabled. No skips.

**Rigor profile.** Maximum. TDD required. Full security audit (ASVS Level 2 or stricter). Performance + simplification. Nyquist: strict. All 8 plan validation dimensions. 4 research agents. Strict gate approval with anti-rationalization check at every transition. Context rot re-read on. Review depth: full (all four REVIEW skills).

**Philosophy.** FULL is the "don't screw this up" tier. Worth slowing down for because the cost of shortcuts is measured in real harm. Signal's ceremony is designed for this tier specifically; the others are concessions to reality.

---

## Stakes × Novelty 2×2 (simplified trigger)

The quick intuition:

|                | LOW Novelty (familiar) | HIGH Novelty (new to org/industry) |
|----------------|------------------------|-------------------------------------|
| **LOW Stakes** | **SKETCH**             | **SPIKE**                           |
| **HIGH Stakes**| **FEATURE**            | **FULL**                            |

This is the rough mapping, useful for explanation. It's not the whole story — `/sig:calibrate` also weighs Scope, Reversibility, and Horizon.

### FULL escalators (any single one triggers FULL regardless of 2×2)

- `stakes: catastrophic`
- `reversibility: irreversible`
- `horizon: years`

### SKETCH gates (all four must hold to land in SKETCH)

- `scope: throwaway`
- `stakes: none`
- `reversibility: trivial`
- `horizon: hours` *or* `horizon: days`

### SPIKE gates (exploratory work specifically)

- `stakes: none` *or* `stakes: minor`
- `novelty: first-for-org` *or* `novelty: first-in-industry`
- `horizon: hours` *or* `horizon: days`
- `scope: throwaway` *or* `scope: feature`

### FEATURE is the default

If the diagnostic answers don't clearly match SKETCH, SPIKE, or FULL, the answer is FEATURE. Most work lands here.

---

## Tier-to-Defaults Table

This is the authoritative mapping `/sig:calibrate` uses to write PROFILE.md's `rigor_overrides` and `phases_skipped` fields.

| Override | SKETCH | FEATURE | SPIKE | FULL |
|---|---|---|---|---|
| `tdd_required` | `false` | `true` | `false` | `true` |
| `security_audit` | `none` | `basic` | `none` | `full` |
| `performance_pass` | `false` | `true` | `false` | `true` |
| `simplification_pass` | `false` | `true` | `false` | `true` |
| `nyquist_enforcement` | `off` | `basic` | `off` | `strict` |
| `plan_validation_dims` | `none` | `core` | `none` | `all` |
| `research_parallelism` | `0` | `2` | `2` | `4` |
| `gate_strictness` | `off` | `light` | `light` | `strict` |
| `context_rot_reread` | `false` | `true` | `false` | `true` |
| `review_depth` | `none` | `quality-only` | `none` | `full` |
| `phases_skipped` | `[REVIEW]` | `[]` | `[REVIEW, SHIP]` | `[]` |

---

## Escalation

`/sig:escalate` shifts a profile up or down. Common paths:

- **SKETCH → FEATURE** when throwaway-scope work turns out to have real users.
- **FEATURE → FULL** when the feature is handling unexpected sensitivity (e.g., added auth, added PII).
- **SPIKE → FEATURE** when the research succeeds and becomes "this is actually the thing we want to build."
- **FEATURE → SPIKE** when FEATURE work stalls on an unanswered architectural question.

Every escalation appends an entry to `metadata.escalation_history` (see `profile-schema.md`).

### Back-fill warnings on escalation up

If escalating *up* in rigor (SKETCH → FEATURE, FEATURE → FULL, etc.), previously-skipped work may need to be back-filled retroactively:

- **REVIEW → FULL:** security audit + simplification pass on already-shipped code.
- **SKETCH → any:** add tests for already-shipped behavior.
- **SPIKE → FEATURE:** restructure exploratory code into production shape.

`/sig:escalate` surfaces these warnings when it writes the new profile.

### Recoverable vs. permanent backfills

Not every backfill is fully recoverable. Two categories that matter for understanding the real cost of under-tiering:

**Recoverable backfills** — the gap closes by running additional work after escalation:
- **REVIEW → FULL:** re-run REVIEW with the deeper `security-and-hardening` skill, simplification pass, perf pass. Real cleanup; the gap closes.
- **SKETCH → any:** add tests for already-shipped behavior. Tests now exist; behavior is verified going forward.
- **SPIKE → FEATURE/FULL:** refactor exploratory code into production shape. Code becomes production-grade.

**Permanent gaps** — the gap is structurally non-recoverable; only approximations exist:
- **Nyquist=strict on already-shipped code (FEATURE → FULL escalation after VERIFY done).** Strict Nyquist requires that every test was seen to fail *before* passing — proof that the test catches the bug. Once code has shipped, the bug is fixed and the original fail event is gone. Approximations (mutation testing, developer attestation) give partial confidence but never equal strict Nyquist on those commits. **Forward work can fully comply; pre-escalation commits never will.**

Permanent gaps should be documented in PROFILE.md body as known limits. They're also the strongest argument for **calibrating accurately up front**: under-tiering creates real, irrecoverable cost, not just deferrable work — which is precisely what `/sig:calibrate`'s 5 diagnostic questions exist to prevent.

### Escalation down

Escalating *down* (FULL → FEATURE) is rare but valid — e.g., a project that was originally scoped as production but turned out to be an internal tool with no PII. Downward escalation doesn't back-fill anything; it just relaxes rigor for future phases.

---

## Brownfield calibration patterns

When `/sig:calibrate` runs after `/sig:init` (rather than after `/sig:new-project`), the project is **brownfield** — an existing codebase that already had a life before Signal touched it. Brownfield calibration tends to land at higher tiers than greenfield work for two reasons:

1. **Reversibility is rarely trivial.** A throwaway script is a throwaway script. An existing codebase with users, deployments, or downstream dependencies has reversibility cost even when the *new work* you're tiering is small. Even a "small fix" to an established system is harder to undo than the same fix on a fresh project.
2. **Horizon is rarely "hours" or "days".** If a codebase has 6+ months of git history, the new work you're calibrating is usually being added with the expectation that it'll persist for a similar horizon. SKETCH-tier work in a brownfield context is unusual — and worth a second look when it surfaces (often the brownfield-flavored answer to "scope" should be FEATURE rather than throwaway).

**Practical patterns:**

- **A 5-year-old codebase calibrating to SKETCH** — almost never the right answer. Reversibility ≠ trivial in established systems. If the diagnostic answers genuinely produce SKETCH, double-check the reversibility and horizon answers.
- **Brownfield FEATURE is the most common landing zone.** Adding capability to an existing system, fixing real bugs, refactoring within the system's bounds — all FEATURE. The calibration tier mirrors the work being added, not the codebase's overall maturity.
- **Brownfield FULL applies when the new work touches a critical surface** (auth, payments, data integrity, public APIs) — exactly the same FULL escalators as greenfield, with the addition that touching established critical surfaces in a brownfield system tends to be irreversible (one of the FULL escalators).
- **Brownfield SPIKE is valid for adding novel capability to an existing system** — e.g., "investigate which auth library to migrate to." The investigation is exploratory; the result will inform a FEATURE or FULL implementation later.

**Codebase-novelty signal feeding calibration.** `/sig:init`'s scanner outputs (especially the activity scanner's "Health" classification — `archived` / `dormant` / `maintenance-mode` / `active` / `brand-new` / "young + active") and the structure scanner's monorepo + framework signals are useful inputs to `/sig:calibrate`'s questions. Future work may pre-fill calibration defaults from scan signals; for now, the user reads `LANDSCAPE.md` and answers the 5 questions informed by it.

---

## Design notes

- **Why four tiers, not three or five?** Three (simple/medium/complex) misses SPIKE's exploratory shape, which needs different rigor than "just less rigor." Five would make `/sig:calibrate` harder to reason about without clear gains. Four is the smallest number that respects the distinct shapes of throwaway, default, exploratory, and critical work.
- **Why is REVIEW skipped in SKETCH and SPIKE but not FEATURE?** SKETCH has no production users; REVIEW would be ceremony. SPIKE's output is learning; REVIEW is about code quality for things that ship. FEATURE ships, so REVIEW runs.
- **Why is EXECUTE never skipped?** No tier is zero-work. Even SPIKE's exploratory coding is EXECUTE. Calibration tunes rigor, not whether work happens.
- **Why does FULL use 4 research agents but SKETCH uses 0?** Research has real token cost. For throwaway work, research overhead is bigger than the work itself. For critical work, a missed library choice or architectural pitfall is a catastrophe. The cost/benefit flips hard between tiers.
