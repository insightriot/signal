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

## PREPARE phase — splitting PLAN's tail from EXECUTE's head

**Status:** Logged 2026-04-25 during Tranche 2 Step 5 (orphan-skill audit conversation). Strong theoretical signal; awaiting lived signal before promotion.

**Context.** While auditing where to bind four orphan skills (`api-and-interface-design`, `frontend-ui-engineering`, `source-driven-development`, `deprecation-and-migration`), it surfaced that two of them — particularly `source-driven-development` (verify framework code against official docs) and the planning-side aspects of the other three — don't cleanly belong in either PLAN or EXECUTE as currently scoped. They live in the seam.

The conversation reframed against the **ODI (Outcome-Driven Innovation) Universal Job Map** — a JTBD-derived framework that decomposes any "job" into 8 generic steps:

1. Define — determine goals and plan the approach
2. Locate — gather required inputs and information
3. Prepare — set up the environment and organize inputs
4. Confirm — ensure everything is ready to start
5. Execute — perform the core task
6. Monitor — verify the job is going as planned
7. Modify — make adjustments or fix problems
8. Conclude — finalize the task and clean up

Mapping Signal v1's 6 phases against the ODI map:

| ODI step | Signal v1 | Notes |
|---|---|---|
| Define | CALIBRATE + DISCUSS | Calibrate sets *rigor*; discuss sets *intent* |
| **Locate** | (inside PLAN) | Bundled, not a phase. Research happens via parallel agents inside PLAN |
| **Prepare** | (gap) | **No phase.** Scaffolding, env setup, doc-fetching, framework-pattern verification live ambiguously between PLAN and EXECUTE |
| Confirm | phase gates | Same function, different shape — Signal makes this a *transition mechanism*, not a phase |
| Execute | EXECUTE | 1:1 |
| Monitor | context-rot reread + state | Concurrent (not sequential) — sensible |
| Modify | VERIFY + REVIEW + anti-rationalization | Spread across phases as feedback loops |
| Conclude | SHIP | 1:1 |

**The diagnostic insight.** Signal collapses ODI's *Locate* (research) and *Prepare* (set up scaffolding, fetch docs, verify framework patterns) into PLAN's tail. That's why source-driven-development feels homeless — it's a *prep/locate* skill being forced to bind to either PLAN or EXECUTE, fitting neither cleanly. Same for `api-and-interface-design` (designing contracts is a prep activity, between "decide what to build" and "build it") and parts of `deprecation-and-migration` (deprecation planning starts before code changes).

### Candidate v2 phase: PREPARE

Insert between PLAN and EXECUTE:

```
CALIBRATE → DISCUSS → PLAN → PREPARE → EXECUTE → VERIFY → REVIEW → SHIP
```

PREPARE would own:
- **Locate** — fetch official docs, identify framework versions, gather library references (current behavior of source-driven-development as a skill, but as a phase it'd be pre-execution).
- **Prepare** — scaffold project structure, generate boilerplate, set up dev environment, verify tooling.
- **Interface design** — finalize public surfaces (api-and-interface-design) before code commits to a shape.
- **Deprecation planning** — for migrations, plan the lifecycle before touching the code.

PREPARE would NOT own:
- High-level design (still PLAN's job — designing approach, breaking into tasks).
- Building the actual feature (EXECUTE).

This naturally re-homes 3 of the 4 currently-orphan skills (`source-driven-development`, `api-and-interface-design`, `deprecation-and-migration`'s planning aspects). `frontend-ui-engineering` stays in EXECUTE.

### Why this is a v2 conversation, not a v1 one

v1 is locked at 6 phases (per `DECISIONS.md` and `PROJECT.md` "Scope & Roadmap"). Adding a phase in v1 means:
- Rewriting `/sig:calibrate`'s tier-to-phases mapping logic.
- Adding a 10th slash command (`/sig:prepare`).
- Updating every phase command's preamble routing.
- Changing the validator's REQUIRED_COMMANDS.
- Updating the state machine, the PHASES array, the gate logic.
- Revising `phases_skipped` schema in PROFILE.md and tier-definitions.md.
- Rewriting PROJECT.md's locked 6-phase contract.

That's a tranche of work, not a step. v1's whole pitch is *don't over-engineer before evidence*. We have strong theoretical signal (ODI parallel) but no lived signal yet that the seam between PLAN and EXECUTE actually causes pain in practice.

### Promotion triggers — what would flip this from "log it" to "build it"

Promote PREPARE to a tranche file when **any one of these fires:**

1. ~~**Token-budget signal.**~~ **(Provisionally cleared 2026-04-25 — see DECISIONS.md)** Tranche 2 Step 7 measurement shows PLAN at 6,537 tokens (3.3% of 200K context) with 3 skills bound; even doubling the count fits comfortably. The original framing assumed a much tighter budget than reality reflects. Reactivate this trigger if real-world usage shows PLAN approaching 40K (~20% of context window).

2. **User-language signal.** During real Signal usage (Tranche 3+ dogfood), users repeatedly say things like *"I'm in PLAN but I'm really setting things up"* or *"this isn't really planning, this is prep"*. Two or more independent observations = the seam is real.

3. **Skill-binding signal.** Two or more new skills get added to v1 and end up homeless (no clean phase fit). Pattern repeats = the phase decomposition is wrong, not the skills.

### Interim v1 answer (today, locked)

Bind orphan skills to existing phases with imprecision accepted:
- `api-and-interface-design` → `plan`
- `deprecation-and-migration` → `plan` + `ship`
- `frontend-ui-engineering` → `execute`
- `source-driven-development` → `execute`

Accept that source-driven-development is technically a "verify-as-you-build" skill bound to EXECUTE rather than its own prep activity. Token cost is bounded; the alternative (architectural rework now) is worse.

### What to log alongside this entry

- `OPEN-QUESTIONS.md` — keep watching for the three trigger conditions above.
- If conditional-loading lands first (also FUTURE-IDEAS material), it might *partially* mitigate by skipping irrelevant skills per project — but conditional loading is a *which* fix; PREPARE is a *when* fix. They solve different problems and could both be needed.

**Resolve by:** any one of the three trigger conditions firing during real Signal usage, OR by the time v2 phase decomposition is on the agenda. Whichever comes first.

---

## Pre-scoped DISCUSS agenda — surface gray areas as a checklist before drilling in

**Status:** Logged 2026-05-02 during Tranche 4 wrap-up conversation. UX gap surfaced by user comparing Signal to GSD's `/gsd:discuss-phase`.

**Context.** Today's `/sig:discuss` Step 3 has *Claude* identify gray areas internally, then Step 4 just starts asking 3+other on each one in sequence. The user never sees the *agenda* — they get questions one at a time without knowing the shape of the unknowns up front, can't pre-empt with "skip the deployment topology question, I've already decided that," and can't add an area Claude missed before Claude commits to its agenda. GSD's pattern (multi-select checkbox of pre-identified discussion areas, plus a free-text "type something" line) covers all three: visibility, prioritization, and recovery valve when Claude's gray-area detection underfits.

**Candidate direction (post-Tranche-4 polish, not v2).**

Insert a Step 3.5 between "identify gray areas" and "ask 3+other on each":

```
Six areas surfaced for DISCUSS:

1. [ ] {area name}
   {one-line sub-question summary}

...

6. [ ] Add an area I'm worried about that you missed
   (free text)

Reply with the numbers you want to discuss, or "all" / "skip N,M" /
"add: <description>" to add one.
```

Then Step 4 runs 3+other only on selected areas. Deselected → `CONTEXT.md` "Deferred Decisions" with note that user explicitly skipped at scoping time (vs. silently never raised). PLAN later distinguishes "we agreed not to discuss this" from "we forgot."

**Implementation notes:**
- No native multi-select widget in Claude Code chat — text-rendered list with "reply with numbers" convention. Same UX outcome, no UI dependency.
- Slots into `references/question-patterns.md` as a fourth shape (working name: **scoped multi-select**), or as a step modifier on top of 3+other. Lean toward fourth shape — distinct enough.
- The "add an area I'm worried about" line is the critical piece — it's the recovery valve when Claude's gray-area detection underfits. Without it, the pattern is just a fancier hidden-agenda.

**Why post-Tranche-4 polish, not v2.**
- Pure UX improvement to an existing command — no new phase, no new skill, no architectural shift.
- Cheap: ~one tasks worth of work in `/sig:discuss.md` + a question-patterns.md addendum.
- High user-value-per-effort ratio. Worth promoting before v2 integrations land.

**Resolve by:** real-project DISCUSS run where the user wishes they could see the agenda first, or by the time v2 phase work begins. Likely the next dogfood pass.

---

## Plugin slug rename — `signal` → `sig` to remove `/signal:sig:*` namespace stutter

**Status:** Logged 2026-05-02 during Tranche 4 wrap-up conversation. Daily papercut surfaced by user comparing autocomplete UX to GSD.

**Context.** Plugin commands today render in autocomplete as `/signal:sig:execute` — two namespaces stacked: outer from `plugin.json` `"name": "signal"`, inner from the `commands/sig/` subdirectory. The short form `/sig:execute` works because there's no collision, but autocomplete shows the canonical fully-qualified form. GSD avoids this by naming its plugin slug `gsd` and putting commands directly in `commands/` (no subdirectory), giving clean `/gsd:command-name`.

**Candidate direction.**

1. `plugin.json`: rename `"name": "signal"` → `"name": "sig"`. Display name "Signal" survives in description, homepage, README, marketplace listing — only the slug changes.
2. Move `.claude/commands/sig/*.md` → `.claude/commands/*.md` (drop the subdirectory).
3. Update `plugin.json` `commands` path if it points to a subdirectory.
4. Verify no internal references break — agents reference commands by `/sig:foo` strings, which keep working since the prefix is preserved.

**Tradeoff.** Plugin slug becomes `sig` not `signal`. Marketplace search/install would use `sig`. Brand "Signal" stays everywhere user-facing. Probably worth it — the namespace stutter is a daily papercut, the slug change is one-time mechanical work.

**Why log, not fix now.** Mechanical but touches the manifest + every command path, which is the kind of "small change with broad blast radius" that wants to land alongside other plugin-config work rather than as a one-off. Bundle with the next plugin-structure task.

**Resolve by:** next time the plugin manifest is touched for any reason, OR before first marketplace publish (whichever comes first — marketplace listings will be hard to rename after the fact).

---

*Last updated: 2026-05-02*
