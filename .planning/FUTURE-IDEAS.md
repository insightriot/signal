# Future Ideas

Post-v1 architectural ideas for Signal itself — **distinct from `TRANCHE-4.md`**, which is specifically the "rundown v2" integrations (porting patterns from other repos).

This file is for evolutions of Signal's *own* mechanisms that surface during v1 build/use. Entries here are candidates for later tranches (v1.5 or v2), not committed work.

Append new ideas; promote to a tranche file when ready to build.

---

## Calibration granularity — making PROFILE.md more expressive

**Status:** Leaning Option C for v2. Logged 2026-04-22 during Tranche 2 Step 1 (drafting `/sig:calibrate`).

**Context.** Today's PROFILE.md has `tier` (SKETCH / FEATURE / SPIKE / FULL) + 10 typed `rigor_overrides`. The tier sets a uniform baseline — e.g., FULL cranks every dial to max. Real projects don't actually need uniform rigor: an auth subsystem and a billing pipeline both calibrate as FULL, but their emphasis should differ (auth = security + data integrity; billing = data integrity + observability). The 10-dial design catches this coarsely (you can hand-edit `security_audit` to `full` regardless of tier), but there's no *principled* mechanism to express per-concern emphasis.

Three candidate directions:

### Option A — More granular dials, same shape

Grow the 10 dials into 30+ so skills and agents each read their own knob.

- Calibration stays 5 questions; derivation maps each answer to a richer set of dials.
- E.g., FULL's `security_audit: full` decomposes into `security_audit_scope: asvs-l2`, `security_audit_threat_model: required`, `security_audit_depscan: full`, etc.
- **Pro:** Precise, mechanical, keeps the file-as-contract pattern.
- **Con:** Derivation logic balloons — more decisions per answer. Harder to reason about. Every new skill or phase requires adding dials.
- **Good fit if:** v1 usage reveals the 10 dials are too coarse but the overall shape is right.

### Option B — Per-artifact rigor scores

Each phase, skill, and agent gets its own 0–10 score stored in PROFILE.md (or a sibling file).

- Calibration derives baseline scores from 5 questions; user can hand-edit ("bump `security-and-hardening` to 10, drop `performance-optimization` to 3").
- **Pro:** Closest to the "model picks primary/secondary engines and dials each" analogue. Maximum flexibility.
- **Con:** PROFILE.md grows to 50+ fields. Score-to-behavior mapping still has to live somewhere — so you're effectively recreating the 10 dials inside each artifact's score definition. Risks being a prettier rationalization layer over the same problem.
- **Good fit if:** artifacts end up needing wildly different rigor that doesn't factor cleanly into shared dials.

### Option C — Primary/secondary/tertiary concern weighting (LEANING)

Keep the 10 dials. Add a separate `concerns` block that modulates them per-dial.

**Mental model:**
- **Tier** = structural: which phases exist, which skills load, which agents can fire.
- **Concerns** = dynamic: how hard each enabled dial gets pushed.
- Concerns CAN push an individual dial above or below its tier default (e.g., FEATURE + security-primary can reach `security_audit: full`, a FULL-tier value).
- Concerns CAN'T add or remove phases. Tier controls the skeleton; concerns size the bones. Structural changes = `/sig:escalate`.

**Shape:**
```yaml
concerns:
  primary: [security, data-integrity]
  secondary: [code-quality]
  tertiary: [performance, dx]
```

**Modulation rule (proposed, not locked):** primary bumps an enum dial up one level from tier default; tertiary bumps it down one level; secondary = tier default. For boolean dials, primary forces `true`, tertiary forces `false`, secondary = tier default.

**Worked example (single dial):**

Two FEATURE-tier projects, one dial (`security_audit`).

| Project | Concern tag | Baseline (FEATURE) | Effective |
|---|---|---|---|
| Auth subsystem rebuild | primary | `basic` | `full` (bumped up) |
| Internal dashboard, no PII | tertiary | `basic` | `none` (bumped down) |

Same command (`/sig:review`), same tier, same dial — wildly different runtime behavior. Project A loads `security-and-hardening` at full ASVS-L2 mode (~15–20 min of work). Project B skips the security skill entirely.

**Candidate concerns vocabulary (not locked):** `security`, `data-integrity`, `performance`, `code-quality`, `developer-experience`, `testing-rigor`, `accessibility`, `observability`, `compatibility`.

**How concerns are derived:** open. Two sub-options — (i) add a 6th calibration question ("which 1–3 concerns dominate this project?"), or (ii) derive from the 5 existing answers (e.g., `stakes: catastrophic` + `reversibility: irreversible` → auto-flag `data-integrity` as primary). Probably (i) for simplicity; (ii) as an auto-default the user can override.

- **Pro:** Maps to how engineers actually weight tradeoffs. Cheap schema addition (one new frontmatter block). Keeps 10 dials; no explosion. Leaves room for auto-derivation from answers so it's not a full 6th question if we don't want one.
- **Con:** Adds a new axis — one more thing to reason about. Blurs what "tier" strictly means (though the skeleton-vs-bones framing resolves that).
- **Good fit if:** v1 usage shows projects keep wanting "FEATURE but extra-strict on X" or "FULL but relaxed on Y" — the exact gap concerns is designed to fill.

---

### Decision direction

**Lean: Option C for v2.** Cheapest schema addition, maps cleanly to how engineers think, doesn't blow up the dial count. Add Option A only if (c) surfaces that individual dials are still too coarse. Defer Option B indefinitely unless real use forces it.

**Resolve by:** post-v1 real-project calibration runs. Watch for:
- Projects where users hand-edit specific dials against the tier default (signal: need concerns).
- Projects where users want one dial at a rigor level unavailable at their tier (signal: need tier-crossing modulation, confirms C over A).
- Projects where two concerns-primary projects still feel "wrong" at the dial level (signal: also need A).

---

## Multi-feature project lifecycle

**Status:** Logged 2026-04-23 during Tranche 2 Step 1 discussion. Surfaced by the question *"how does Signal handle adding a new feature to an existing already-calibrated project?"*

**Context.** v1's 6-phase flow assumes a project goes through CALIBRATE → DISCUSS → ... → SHIP linearly, once. Real projects aren't one-shot — they ship v1, add feature #2, refactor subsystem #3, deprecate component #4. Signal has no first-class concept of "feature #N of an ongoing project." Today, every command reads project-level `.planning/` artifacts as if the project is a single linear flow.

**Specific design questions this raises:**

- **Does `.planning/` accumulate per-feature subdirectories** (e.g., `.planning/features/{slug}/CONTEXT.md`), or does each new feature overwrite the project-level artifacts?
- **Does each feature re-calibrate?** A mature product might be FULL overall but a specific admin-dashboard feature might honestly be SKETCH. An internal tooling refactor inside a production system might warrant its own SPIKE tier, separate from the parent project's FULL.
- **Does `STATE.md` track "features shipped"** alongside "current phase"? Today it only has current phase + completed phases, no ongoing feature log.
- **What does `/sig:calibrate --re-calibrate` mean in a feature context?** Re-score the whole project, or start a fresh feature-local profile?
- **How does `/sig:resume` know which feature (if any) is in-flight?** Needs answering before Tranche 3 ships the resume command.

**Candidate direction** (for post-v1 consideration, not locked):
- `.planning/features/{feature-slug}/` subdirectory per feature, holding feature-local CONTEXT.md, PLAN.md, PROFILE.md override, etc.
- Project-level `.planning/PROFILE.md` = default tier for the project.
- Feature-level `.planning/features/{slug}/PROFILE.md` = per-feature override (created by `/sig:calibrate --feature {slug}`).
- `.planning/STATE.md` gains a `features` block: `[{slug, tier, current_phase, status}, ...]`.
- `/sig:status` and `/sig:resume` become feature-aware.
- Project-level phases run once at project start; feature-level phases repeat per feature.

**Interim v1 answer (today):** one project = one linear flow. To add a feature, either stay in the existing tier (if the feature fits it) or run `/sig:calibrate --re-calibrate` if the new work is materially different in risk profile.

**Resolve by:** first real attempt to add feature #2 to a Signal-built project. Likely Tranche 3 dogfood or shortly after.

---

*Last updated: 2026-04-23*
