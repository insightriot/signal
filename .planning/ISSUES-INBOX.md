# Future Ideas

Post-v1 architectural ideas for Signal itself — **distinct from `MILESTONE-4.md`**, which is specifically the "rundown v2" integrations (porting patterns from other repos).

This file is for evolutions of Signal's *own* mechanisms that surface during v1 build/use. Entries here are candidates for later milestones (v1.5 or v2), not committed work.

Append new ideas; promote to a milestone file when ready to build.

---

## Compound-engineering audit before `/sig:compound` design

**Status:** Logged 2026-05-27 after M4.5.E9 SHIP retrospective conversation surfaced the relationship between E9's mechanism and compound-engineering's Compound phase.

**Trigger.** M4.5.E9 built the **capture** half of what compound-engineering does: each Epic now produces a tier-aware retrospective, validated at SHIP, indexed in `RETROSPECTIVES.md`. M4.5.E9 did **not** build the **replay** half: lessons captured in retro files don't yet surface anywhere — no automation reads them during the next Epic's DISCUSS or PLAN, no research agent uses them as context, no pattern detection flags repeat mistakes.

This is exactly the gap `analysis/REPO-ANALYSIS.md` line 257 named:

> *"No compounding loop. You ship and forget. compound-engineering's Compound phase is the biggest architectural miss."*

E9 closed the "ship and forget" half. The "compound" half is still empty. compound-engineering (Every Inc) had already named "retros as memory + replay" as a complete pattern via its `learnings-researcher` + `session-historian` agents in a dedicated Compound phase. Signal built half of that pattern without consulting the source that already designed both halves.

**Proposal.** Before scoping the v2 `/sig:compound` Epic (planned per `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` line 310), do a deliberate 30-minute read of compound-engineering's actual implementation:

1. What does `learnings-researcher` actually do? Read the agent definition, not just the analysis-doc summary.
2. What shape are lessons stored in? Free-form markdown? JSONL? Structured records?
3. How does `session-historian` work — what does it persist, and when is it re-injected?
4. Does compound-engineering's Compound phase auto-trigger (on PR merge?) or is it manual?
5. How does it handle the "lesson surfaces relevance" question — keyword match? Embedding similarity? Agent-mediated retrieval?

Then audit E9's retro format against the answers:

- Do our reflection sections (Timeline / What changed / What broke / What surprised / What we'd do differently / What to feed back into Signal / Anti-rationalization / Links) feed naturally into a compound-engineering-style replay layer?
- Or did we pick a shape (markdown + `[FILL IN]` markers) that's awkward to mine? If so, is that fixable post-hoc via a parser, or does it imply changing the template?
- Does the `## What to feed back into Signal` section already do half of compound-engineering's replay work in slow-motion (humans reading retros + manually feeding insights into next Epics)? That'd make it the natural integration point.

**Why this matters.** Building `/sig:compound` from first principles without consulting the source plugin that owns this pattern risks repeating the EXECUTE-phase PLAN-deviation pattern at a larger scale — solving the right problem in a slightly wrong way that we then have to retrofit. A 30-minute spike upstream of design work is cheap insurance.

**Resolve by.** Before v2 / `/sig:compound` Epic scoping. If v2 starts with a different Epic (e.g., M5.E1's wiki restructure), this can wait. If `/sig:compound` is in the first batch, this gates it.

**Cross-references:**
- `analysis/REPO-ANALYSIS.md` § 6 (compound-engineering description) + § "Stage 12 Compounding/learning" comparison table
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` § 8 (compound-engineering deep dive) + § "10-phase architecture"
- `.planning/M4.5.E9-RETROSPECTIVE.md` § "What to feed back into Signal" (where E9's lessons live for now)
- `.planning/RETROSPECTIVES.md` (the capture surface that needs a replay companion)

---

## Roadmap refresh — post-M4.5 reality check on v2 vision

**Status:** Logged 2026-05-27 after M4.5.E9 SHIP retrospective conversation surfaced that `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` was written before M4.5 existed as a milestone.

**Trigger.** The two canonical comparison documents (`analysis/REPO-ANALYSIS.md` and `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`) lay out a 10-phase v2 vision drawn from the original 7-plugin landscape. Both docs predate v1's shipping (M4 closed 2026-05-12) and predate M4.5's entire scope. Active Epic-by-Epic comparison against those source plugins has drifted: M4.5.E6 / E7 / E9 were built from internal-emergence rather than against "what does {gstack, superpowers, compound-engineering, pm-skills} do here that we should match?"

That's not necessarily wrong — first-principles work has its own value — but the original v2 vision is now stale-relative-to-shipped-reality in several ways:

- **New inspiration sources have entered the landscape** since the original analysis: Anthropic's Memory + Dreaming launch transcripts, the 2026-05-14 "Claude Code in large codebases" blog post, `obra/superpowers#390` (Stop hook learnings), `disler/claude-code-hooks-mastery`. None of these are tracked in the source-repo list.
- **Some of the original 7 plugins may have moved**. compound-engineering, gstack, pm-skills, superpowers all continue evolving. The 2025-era analysis snapshot may be missing newer patterns those upstreams have shipped.
- **Some original assumptions are now testable**. The analysis predicted compound-engineering's Compound phase was the biggest architectural miss; M4.5.E9 confirms it (the gap is real, the half-done capture mechanism makes it visible). Other predictions (pm-skills upstream phases, gstack 15-phase security audit) haven't been tested yet because v1 didn't include them.
- **The 10-phase target sequence isn't sequenced**. Once M4.5 closes, v2 begins — but in what order? The rundown lists 10 phases but doesn't say which v2 Epic ships first.

**Proposal.** Once M4.5 closes (E4, E5, E8 remaining), produce one of:

- **`analysis/SIGNAL-INTEGRATION-RUNDOWN-v2.md`** — successor doc that supersedes the original, written from post-M4.5 reality. Updates: which of the 7 source plugins still feel like the right inspiration after dogfooding, which look less applicable, what new sources (Anthropic Memory + Dreaming, etc.) belong on the list, and a *sequenced* v2 Epic plan.
- **Or an in-place revision** of the existing rundown with explicit "as of 2026-MM-DD" stamps on each section so the staleness boundary is visible.
- **Or a `MILESTONE-5-PLANNING.md` doc** that focuses on Epic sequencing rather than vision (defers vision-refresh to a v3 conversation).

The choice between these depends on whether the original vision still holds — if it does, in-place revision is enough; if it doesn't, a successor doc captures the pivot more honestly.

**What to include in the refresh:**

1. Re-validate the 5-layer model against what v1 actually ships
2. Track each of the 7 original source plugins — still relevant, evolved, deprecated, or pivoted?
3. Add new inspiration sources with attribution
4. Sequence the v2 Epic queue (which one ships first, why)
5. Update the gating criteria — what counts as "v1 has real users" given M4.5.E5 hasn't shipped yet

**Resolve by.** When M4.5 closes + before v2 / M5 planning begins. If E5's launch surfaces additional friction, fold those findings in.

**Cross-references:**
- `analysis/REPO-ANALYSIS.md` (pre-v1 landscape)
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` (pre-M4.5 v2 vision)
- `analysis/JOURNEY-MAP.html` (visual companion; may also need refresh)
- `.planning/MILESTONE-4.5.md` (current milestone scope — informs what's actually been validated)
- `.planning/PROJECT.md` § "Scope & Roadmap" (current v1/v2 split + gating criteria)

---

## Vocabulary attribution sweep on E9 retro mechanism

**Status:** Logged 2026-05-27 after M4.5.E9 SHIP retrospective conversation surfaced unattributed compound-engineering vocabulary in the milestone meta-retro template.

**Trigger.** M4.5.E9.S2.t6 created `composeMilestoneMetaRetro` in `tools/lib/retro-index.js`. The output template includes a section heading `## Compound learnings`. *"Compound"* is compound-engineering's term, lifted into Signal's template without attribution. It captures the right concept — milestone-scale insights that compound across Epics — but credit is owed, or the term should be replaced with Signal-native vocabulary.

Per the working-norms baseline (`CLAUDE.md` § "Naming & plain language" — *"Use real names. Mark dev-only terms"*) and the source-attribution conventions in `LICENSES.md` (4-tier inspiration model), vocabulary borrowed from a named source repo should either be credited or replaced.

**Proposal.** ~10-minute audit pass over E9's new surface:

1. **Grep for compound-engineering vocabulary** across the new files:
   - `references/retrospective-template.md`
   - `tools/lib/retrospective.js`
   - `tools/lib/retro-index.js`
   - `tools/backfill-retros.js`
   - `commands/ship.md` (§0.5, §5, §6, §7)
   - `commands/resume.md` (Step 3c)
   - Terms to look for: *compound*, *compounding*, *learnings* (vs. *lessons* — both repos use it, but worth noting), *lens* (compound-eng's review-panel term)
2. **For each hit, decide:**
   - (a) Add an inline `LICENSES.md`-style attribution comment (e.g., *"`Compound learnings` — vocabulary borrowed from compound-engineering's Compound phase"*).
   - (b) Replace with Signal-native term (e.g., `## Compound learnings` → `## Milestone-scale lessons` or `## What compounds`).
   - (c) Promote to LICENSES.md's tiered attribution list as a Pattern-source reference (the same tier `planning-with-files` + `oh-my-claudecode` sit in today).
3. **Default for ambiguous cases:** (a) the inline attribution — it's the lightest touch + preserves the right concept name when there's no obvious replacement.

**Why this matters beyond pedantry.** Two reasons:

- **Stranger-adoption story.** A reader of Signal's source who knows compound-engineering would notice the borrowed term + wonder why it's not credited. That's a small papercut that erodes the credibility of LICENSES.md's claim that Signal is honest about attribution.
- **Forward-compat for `/sig:compound`.** If/when the v2 Compound phase ports compound-engineering's mechanism explicitly, the vocabulary attribution should already be consistent. Better to set it now than to retrofit after a port.

**Resolve by.** Anytime before v2 / `/sig:compound` design begins. Could bundle into the compound-engineering audit FUTURE-IDEAS entry above as a single ~45-minute prep session.

**Cross-references:**
- `tools/lib/retro-index.js` line 288 — the literal `## Compound learnings` heading
- `LICENSES.md` — current attribution tiers (Ported / Planned / Pattern source / Reference)
- `analysis/REPO-ANALYSIS.md` § 6 (compound-engineering's vocabulary)
- The companion entry above ("Compound-engineering audit before /sig:compound design") — likely bundled together

---

## "Spec-internal consistency" as a PLAN-validation axis

**Status:** Logged 2026-05-26 at M4.5.E9 REVIEW close.

**Trigger.** M4.5.E9.S1.t11 surfaced an incompatibility internal to the PLAN itself: the threshold formula stated in the task spec (`template_floor + 150B × section_count`) was inconsistent with the AC stated in the same task (`minimally-filled template — one sentence per section — passes`). One sentence is ~50-70B of body; 150B per section pushes the threshold beyond what one sentence can clear. The 8-dimension VALIDATION pass did not catch this because it audits goal alignment / completeness / dependency / testability / scope / context / risk / vertical-slicing — none of which check whether the formula stated in the PLAN actually satisfies the AC stated in the PLAN.

The fix landed inline in EXECUTE (60B coefficient, AC as binding constraint, deviation surfaced in commit message). But the class of issue — *the PLAN can contradict itself in subtle ways VALIDATION's existing axes miss* — generalizes.

**Proposal.** Add a 9th dimension to `M4.5.E{N}-VALIDATION.md` called **Spec-internal consistency**. The check: for each PLAN-stated formula / threshold / heuristic, walk the matching AC and verify the formula's output satisfies the AC's input. Should be lightweight (one paragraph per axis, per task with a quantitative spec). Catches the class of "the PLAN says X and also says Y, but X⇒¬Y" before it reaches EXECUTE.

**Why not just careful PLAN review.** Same reason we have 8 dimensions instead of "just read the PLAN carefully." Naming the axis makes the check explicit + auditable; absent a named axis, the check is invisible to PLAN-checker agents and VALIDATION reviewers.

**Resolve by.** Next M4.5 planning round that touches a PLAN with quantitative thresholds. Possibly bundled with a v1.5 / v2 refresh of the VALIDATION conventions.

**Cross-references:** `.planning/M4.5.E9-RETROSPECTIVE.md` § "What to feed back into Signal"; `.planning/archive/M4.5/E9/M4.5.E9-REVIEW.md` § 8.

---

## Dry-run gate as a standard PLAN pattern

**Status:** Logged 2026-05-26 at M4.5.E9 REVIEW close.

**Trigger.** Two of two recent M4.5 Epics that included a dry-run-with-user-approval gate caught real issues that would have shipped otherwise:

- **M4.5.E6 D15** — dry-run against Signal-on-Signal's own STATE.md before the migration shipped. Caught a load-bearing edge case.
- **M4.5.E9 S1.t10** — dry-run of the backfill stub generation before live writes. Caught two bugs: (a) `git log --grep` matched commit bodies, not just subjects, leading to wrong commits being attributed to E2; (b) markdown link URLs used `../.planning/X.md` when the retro file lives in `.planning/` already (sibling resolution wants bare `X.md`). Both would have shipped + propagated to five committed stub files.

The pattern: when an Epic writes to existing user state (STATE.md, MILESTONE.md, planning artifacts), generate the proposed writes first, capture them in a RESEARCH addendum, await explicit user approval, then live-write only on go-ahead.

**Proposal.** Codify the dry-run gate as a recommended PLAN pattern for any Epic touching existing user state. Not a hard rule (some Epics are pure-additive and don't warrant the ceremony), but a default to consider. Concrete shape:

1. PLAN identifies tasks that write to existing state.
2. A "DRY-RUN GATE" task gets inserted before the live-write task.
3. Gate task: run `--dry-run`, capture proposed output in `M4.5.E{N}-RESEARCH.md` addendum (or similar), pause for user approval.
4. On approval: live run with `--no-dry-run` or equivalent.

**Resolve by.** Next Epic that touches existing user state — apply the pattern, see if it's worth codifying in a `references/plan-patterns.md` doc.

**Cross-references:** `.planning/M4.5.E6-DECISIONS.md` D15; `.planning/archive/M4.5/E9/M4.5.E9-RESEARCH.md` § 8.1.

---

## Synthesizer-output validator-side sanity-check (deferred from M4.5.E7)

**Status:** Deferred from M4.5.E7 to FUTURE-IDEAS. Logged 2026-05-23 at E7 close.

**Original intent.** During E7 DISCUSS / PLAN, an optional fourth scope item was floated: a validator pass over generated `.planning/LANDSCAPE.md` + baseline `PROJECT.md` that detects character-drop smells before the user sees them. Concretely:

- Heading-shorter-than-N-chars detector (catches patterns 1 + 2 in R1 — `## Ierred` / `## ints`).
- Single-char or mid-truncated table-cell detector (catches pattern 3 — `is | Top-level entry`).
- Backtick parity per line (catches pattern 5 — `).git fetch --unshallow\`` is unbalanced).
- Sentence-fragment / mid-word detector (catches pattern 6 — `contributoiteria.`).

The check would live in `tools/validate-plugin.js` or a new `tools/lint-synthesizer-output.js`; runs against the most recently generated `.planning/LANDSCAPE.md` or as a post-`/sig:init` step.

**Why deferred** (per D-E7-3, 2026-05-21 DISCUSS):

1. The two-layer fix landed in E7 (helper-based embed for Layer B + template lint for Layer C) makes most cases unnecessary. The deterministic surface is now structurally protected: `embedSection` eliminates LLM verbatim-copy as a failure mode; Layer C lint catches the prose anti-patterns at template-author time.
2. Validator-side sanity-check is reactive — it catches drops after they happen. The E7 fix is preventive — it stops them from being generated. Preventive is strictly better when achievable.
3. False-positive risk is real: heading-shorter-than-N-chars whitelists exist (Vision / Scope / Notes); table cells legitimately can be 1-2 chars in some scanner outputs; backtick parity within fenced code blocks is hard to reason about. The cost of dialing the lint thresholds may outweigh the benefit while E7's preventive layers are doing their job.

**Promote-back trigger.** Revisit if **2+ new synthesizer quality regressions** ship to `FUTURE-IDEAS.md` within the next 3 months (i.e., by 2026-08-23). Two regressions would signal that E7's preventive layers have blind spots and validator-side detection is the right complement. One regression is noise; three patterns over time is a sign.

**Cross-references:**
- `.planning/archive/M4.5/E7/M4.5.E7-RESEARCH.md` § 5 (research synthesis explicitly amended to defer this).
- `.planning/DECISIONS.md` 2026-05-21 entry D-E7-3.
- `.planning/archive/M4.5/E7/M4.5.E7-PLAN.md` § Slice 2 t8 (folds this entry into the Epic ship event per VALIDATION § Plan Refinements #1).

---

## Calibration granularity — making PROFILE.md more expressive

**Status:** Leaning Option C for v2. Logged 2026-04-22 during Milestone 2 Step 1 (drafting `/sig:calibrate`).

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

> **Update 2026-07-04 (backlog review):** E6 shipped the single-project half (`current_epic` / `current_wave` / `current_task` in schema_version 1). Remaining scope = per-feature PROFILE override + `features[]` block + feature-aware status/resume — design gated on evidence from the second dogfood project (BR-9), per this entry's own "resolve by."

**Status:** Logged 2026-04-23 during Milestone 2 Step 1 discussion. Surfaced by the question *"how does Signal handle adding a new feature to an existing already-calibrated project?"*

**Context.** v1's 6-phase flow assumes a project goes through CALIBRATE → DISCUSS → ... → SHIP linearly, once. Real projects aren't one-shot — they ship v1, add feature #2, refactor subsystem #3, deprecate component #4. Signal has no first-class concept of "feature #N of an ongoing project." Today, every command reads project-level `.planning/` artifacts as if the project is a single linear flow.

**Specific design questions this raises:**

- **Does `.planning/` accumulate per-feature subdirectories** (e.g., `.planning/features/{slug}/CONTEXT.md`), or does each new feature overwrite the project-level artifacts?
- **Does each feature re-calibrate?** A mature product might be FULL overall but a specific admin-dashboard feature might honestly be SKETCH. An internal tooling refactor inside a production system might warrant its own SPIKE tier, separate from the parent project's FULL.
- **Does `STATE.md` track "features shipped"** alongside "current phase"? Today it only has current phase + completed phases, no ongoing feature log. *(Partial resolution in flight: M4.5.E6 extends `STATE.md` schema with `current_wave` / `current_task` / structured `blockers` for single-project in-flight tracking — the multi-feature `features[]` block envisioned here remains in this entry's scope.)*
- **What does `/sig:calibrate --re-calibrate` mean in a feature context?** Re-score the whole project, or start a fresh feature-local profile?
- **How does `/sig:resume` know which feature (if any) is in-flight?** Needs answering before Milestone 3 ships the resume command. *(Single-project version of this question is being answered in M4.5.E6 — `STATE.md` schema gains `current_epic` / `current_wave` / `current_task`. Multi-feature variant remains open under this entry.)*

**Candidate direction** (for post-v1 consideration, not locked):
- `.planning/features/{feature-slug}/` subdirectory per feature, holding feature-local CONTEXT.md, PLAN.md, PROFILE.md override, etc.
- Project-level `.planning/PROFILE.md` = default tier for the project.
- Feature-level `.planning/features/{slug}/PROFILE.md` = per-feature override (created by `/sig:calibrate --feature {slug}`).
- `.planning/STATE.md` gains a `features` block: `[{slug, tier, current_phase, status}, ...]`.
- `/sig:status` and `/sig:resume` become feature-aware.
- Project-level phases run once at project start; feature-level phases repeat per feature.

**Interim v1 answer (today):** one project = one linear flow. To add a feature, either stay in the existing tier (if the feature fits it) or run `/sig:calibrate --re-calibrate` if the new work is materially different in risk profile.

**Resolve by:** first real attempt to add feature #2 to a Signal-built project. Likely Milestone 3 dogfood or shortly after.

---

## PREPARE phase — splitting PLAN's tail from EXECUTE's head

> **Update 2026-07-04 (backlog review, ratified):** the ODI analysis folds into M5.E1's phase-decomposition design scope — one phase-skeleton conversation, not two. The three promotion triggers below also move to the Trigger watchlist entry so PREPARE can still fire early on lived signal. See DECISIONS 2026-07-04.

**Status:** Logged 2026-04-25 during Milestone 2 Step 5 (orphan-skill audit conversation). Strong theoretical signal; awaiting lived signal before promotion.

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

That's a milestone of work, not a step. v1's whole pitch is *don't over-engineer before evidence*. We have strong theoretical signal (ODI parallel) but no lived signal yet that the seam between PLAN and EXECUTE actually causes pain in practice.

### Promotion triggers — what would flip this from "log it" to "build it"

Promote PREPARE to a milestone file when **any one of these fires:**

1. ~~**Token-budget signal.**~~ **(Provisionally cleared 2026-04-25 — see DECISIONS.md)** Milestone 2 Step 7 measurement shows PLAN at 6,537 tokens (3.3% of 200K context) with 3 skills bound; even doubling the count fits comfortably. The original framing assumed a much tighter budget than reality reflects. Reactivate this trigger if real-world usage shows PLAN approaching 40K (~20% of context window).

2. **User-language signal.** During real Signal usage (Milestone 3+ dogfood), users repeatedly say things like *"I'm in PLAN but I'm really setting things up"* or *"this isn't really planning, this is prep"*. Two or more independent observations = the seam is real.

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

**Status:** Logged 2026-05-02 during Milestone 4 wrap-up conversation. UX gap surfaced by user comparing Signal to GSD's `/gsd:discuss-phase`.

**Context.** Today's `/sig:discuss` Step 3 has *Claude* identify gray areas internally, then Step 4 just starts asking 3+other on each one in sequence. The user never sees the *agenda* — they get questions one at a time without knowing the shape of the unknowns up front, can't pre-empt with "skip the deployment topology question, I've already decided that," and can't add an area Claude missed before Claude commits to its agenda. GSD's pattern (multi-select checkbox of pre-identified discussion areas, plus a free-text "type something" line) covers all three: visibility, prioritization, and recovery valve when Claude's gray-area detection underfits.

**Candidate direction (post-Milestone-4 polish, not v2).**

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

**Why post-Milestone-4 polish, not v2.**
- Pure UX improvement to an existing command — no new phase, no new skill, no architectural shift.
- Cheap: ~one tasks worth of work in `/sig:discuss.md` + a question-patterns.md addendum.
- High user-value-per-effort ratio. Worth promoting before v2 integrations land.

**Resolve by:** real-project DISCUSS run where the user wishes they could see the agenda first, or by the time v2 phase work begins. Likely the next dogfood pass.

---

## `/sig:report` — narrative project report (separate from `/sig:status`)

**Status:** Logged 2026-05-03 during Milestone 4 wrap-up conversation. Gap surfaced when user wanted a "zoom out and tell me what we've done and what remains" view on a real Signal project.

**Context.** `/sig:status` already exists, but it's intentionally a one-screen tactical snapshot — its anti-rationalization table explicitly rejects "make it longer with more sections" (see `.claude/commands/sig/status.md` line 176). It answers *"where am I, what's next."* It does **not** tell the *story* of the project: what was decided in DISCUSS and why, how PLAN broke the work down, which plan tasks shipped vs. remain, what verification surfaced, what the open decisions are.

That's a genuinely different artifact, not a longer status. Mashing them together via a `--report` flag would dilute `/sig:status`'s locked one-screen contract — the one-screen rule is what makes it useful as a check-without-disturbing tool. Two commands, two purposes:

- **`/sig:status`** — operational glance: *where am I, what's next.* ≤30 lines.
- **`/sig:report`** — narrative read: *what's the whole story, why we got here, what remains.* 60–100 lines.

**Candidate direction.**

New command `/sig:report`. Read-only (same design as `/sig:status` — re-running produces the same output, no `.planning/*` mtimes change, no skills loaded, no agents spawned).

Synthesizes a phase-by-phase narrative covering things `/sig:status` deliberately omits:

- **Phase narrative** — "CALIBRATE on {date} → tier {T} because {triggering answer}. DISCUSS locked {N} decisions, deferred {M}. PLAN broke work into {N} tasks across {M} waves. EXECUTE: {done}/{total} tasks shipped..." Each completed phase gets 2–4 lines that explain *why*, not just *what*.
- **Plan-task granularity** — from `PLAN.md` if present, list done vs. pending tasks (with wave grouping if applicable).
- **Decision history** — locked + deferred decisions from `CONTEXT.md`, with rationale.
- **Outstanding marker counts** — `[INFERRED]` / `[FILL IN]` across all artifacts (uses `tools/lib/walkthrough.js#countMarkers` already shipped in M4.t8).
- **Open questions full list** — not the top-3 truncation `/sig:status` does.
- **Verification + review status** — if those phases ran, summary of what passed / what's logged.
- **Recent commit activity** — commits since last phase transition (one-line cap each).
- **Next action** — same logic as `/sig:status` (`nextActionForPhase` from `tools/lib/status.js`).

**Tier-aware behavior.**

| Tier | Output |
|---|---|
| SKETCH | Stub — there's not much story to tell on a throwaway. Maybe 10–15 lines. |
| FEATURE | Standard depth. ~60 lines. |
| SPIKE | Findings-oriented narrative — what we explored, what we learned, what the answer is. ~40 lines. |
| FULL | Full depth. ~80–100 lines. Every phase gets its narrative paragraph. |

**Why log, not fix now.** New command means: new file in `.claude/commands/sig/`, new entry in validator's `REQUIRED_COMMANDS`, README mentions, MCP/skill descriptions registered, decision-tree viewer (`docs/map/index.html`) updated. Not huge, but not a one-line fix either. Bundle it as a Milestone 5 (or post-M4-polish) task with `/sig:status`'s tooling reused (`readProfile`, `readState`, `readOpenQuestions`, `nextActionForPhase`).

**Anti-rationalization to lock in early:**
- "Just add `--detailed` to `/sig:status`." — No. The one-screen rule is load-bearing for `/sig:status`. Adding flags that change its shape destroys the contract.
- "Read `cat .planning/*.md` does this already." — Reading 6+ files manually every time you context-switch back is exactly what `.planning/` exists to *prevent*. The synthesis is the value; the raw files are the substrate.
- "Make it write to a file so it can be shared." — Read-only, same as status. If sharing is needed, pipe stdout to a file. Mutating breaks the check-without-disturbing property.

**Resolve by:** next time the user runs a Signal project past EXECUTE and wants a zoom-out view, OR when promoting future-ideas to a milestone file. Likely Milestone 5 (alongside the multi-select pre-scoping work — both are conversational/UX upgrades to existing commands and could ship together).

---

## `/sig:orient` — plain-language project overview (no Signal jargon)

**Status:** Logged 2026-05-24 during conversation about reporting gaps. Trigger: user reviewing existing reporting seeds (`/sig:report`) realized the proposed report is still *written for a Signal-fluent reader* — phase narrative, plan-task counts, decision history. Real gap surfaced: *"where are we on this overall, in plain language"* — an orientation artifact that someone (including the user, returning to a project after weeks away, or a stakeholder, or a future collaborator) can read **without knowing Signal exists**.

**Context.** Signal's reporting surface today and as-proposed assumes vocabulary fluency: Milestone, Epic, Wave, Task, Phase, Tier, SKETCH/FEATURE/SPIKE/FULL. That's load-bearing inside the workflow but stranger-hostile outside it. Three distinct read-only artifacts now make sense:

- **`/sig:status`** — operational glance: *where am I, what's next.* ≤30 lines. Signal-fluent reader.
- **`/sig:report`** — phase narrative: *what's the whole story, why we got here.* 60–100 lines. Signal-fluent reader.
- **`/sig:orient`** — plain-English overview: *what is this thing, where is it, what's next.* 15–40 lines. **No Signal vocabulary.** Anyone can read it.

The flag form (`/sig:report --bigpicture` or `--orient`) was considered and rejected for the same reason `/sig:status` rejects shape-changing flags: it dilutes the parent command's locked contract. `/sig:report`'s phase-by-phase narrative and `/sig:orient`'s plain-prose overview are different artifacts with different audiences — they earn separate commands.

**Candidate direction.**

New command `/sig:orient`. Read-only (same design discipline as `/sig:status` and `/sig:report` — re-running produces the same output, no `.planning/*` mtimes change, no skills loaded, no agents spawned).

The output is **prose, not a state dump.** A first paragraph that describes the project to someone who has never heard of it. A second paragraph that says where it currently stands. A third that names the next concrete step and any open questions worth knowing about.

Example shape (illustrative, not a template):

> "Signal is a Claude Code plugin you've been building since April 2026. It calibrates how much engineering rigor to apply to a coding task before doing it — so throwaway scripts get throwaway treatment and production systems get production treatment.
>
> The core workflow ships and works: 14 commands, 26 agents, 366 tests passing. You're currently hardening it for outside users — fixing install gaps, rewriting public docs, lining up a first stranger to try it.
>
> The next concrete step is finishing the install-troubleshooting docs (most of that landed this week). Three things remain unfinished: a versioning policy, a worked end-to-end example, and the public README rewrite. One open question: which external user gets the first invite."

That's what "plain language" means here — **prose written for a human, not a glossary substitution of Signal jargon.** No Milestone/Wave/Epic/Task vocabulary anywhere in the output. Phase names get translated to plain English ("we're currently hardening it for outside users" not "we're in M4.5.E1"). Tier names get translated or omitted ("a production-quality project" rather than "FULL tier").

**Source data.**

Reads the same `.planning/` substrate as `/sig:report`, but the *output transformation* is the work:

- `PROFILE.md` → tier, but rendered as a sentence ("treated as production-quality work" not "FULL tier")
- `STATE.md` → current phase, but rendered as plain status ("currently testing it" not "VERIFY phase")
- `PROJECT.md` → one-paragraph description (the *what* and *why*, not the scope/roadmap section)
- `MILESTONE-*.md` → progress count rendered as plain English ("most of the work is done" not "4 of 6 epics shipped")
- `OPEN-QUESTIONS.md` → top 1–3, phrased in plain terms
- Recent git activity → "the last week of work has been..." style

**Tier-aware behavior.**

| Tier | Output |
|---|---|
| SKETCH | 1 short paragraph. "This is a throwaway exploration of X. You're partway through. Next step: Y." |
| FEATURE | 2–3 paragraphs. Standard depth. ~20 lines. |
| SPIKE | Findings-oriented prose. "You wanted to know whether X. Here's what you found." ~20 lines. |
| FULL | 3–4 paragraphs. ~30–40 lines. Includes a "remaining work" paragraph. |

**Use cases.**

1. **Solo dev returning after weeks away** — read a paragraph instead of decoding STATE.md.
2. **Showing the project to a non-Signal user** — collaborator, friend, prospective contributor.
3. **Stakeholder-style updates** — pipe stdout into a Slack message or email draft.
4. **Pre-`/sig:resume` orientation** — read this first to remember *why* the project exists, then run `/sig:resume` for the tactical re-orientation.

**Why log, not fix now.** New command surface area — same overhead as `/sig:report`, `/sig:audit`, `/sig:add`, `/sig:docs-update`, `/sig:goal`: validator's `REQUIRED_COMMANDS`, README mentions, decision-tree viewer (`docs/map/index.html`), MCP/skill descriptions, plugin manifest. Plus the prose-generation prompt is non-trivial — translating Signal vocabulary into plain language without losing fidelity is a small design study, not a one-liner. Bundle with `/sig:report` and the other read-only synthesis commands when they ship together.

**Anti-rationalization to lock in early:**
- *"Just add `--plain` to `/sig:report`."* — No. Same reason `/sig:status` rejected flags that change output shape: the parent command's contract is load-bearing. Different audience, different vocabulary, different shape = different command.
- *"`/sig:status` is short enough, just read that."* — `/sig:status` is **deliberately jargon-heavy and tactical.** It's optimized for the user mid-flight, not for orientation. Forcing it to double as plain-English overview destroys both contracts.
- *"Use `/sig:report` and skim."* — `/sig:report` is 60–100 lines of phase narrative with Signal vocabulary throughout. Not the same artifact.
- *"Just write a README paragraph and call it done."* — README is static; `/sig:orient` describes the project *as it currently stands*, derived from live state. The synthesis is the value, same as `/sig:status` and `/sig:report`.
- *"Make it a fancy LLM-paraphrased version of `/sig:report`."* — Tempting, but non-deterministic LLM paraphrase breaks the "re-running produces the same output" property all three read-only commands share. Output must be deterministic — templated prose with state-derived substitutions, not free-form generation.
- *"Add audience flags (`--for-stakeholder`, `--for-collaborator`)."* — Premature. Ship the single plain-English mode first; add audience variants only if the single mode proves insufficient in real use.

**Open design questions:**
- **Deterministic prose templating** — concretely, how does state map to paragraph structure? Probably needs a small template DSL or a prompt-with-fixed-structure. Worth a small spike before committing to implementation.
- **Phase-to-plain-English mapping** — CALIBRATE → "deciding how much rigor to apply," DISCUSS → "working out the design," PLAN → "breaking down the work," EXECUTE → "building it," VERIFY → "testing it," REVIEW → "quality-checking it," SHIP → "shipping it." Needs a reference table in `references/`.
- **Tier-to-plain-English mapping** — SKETCH → "a throwaway exploration," FEATURE → "a focused feature build," SPIKE → "an investigation into a specific question," FULL → "a production-quality project." Also reference-worthy.
- **How does it handle multi-milestone projects?** Signal itself is at M4.5 with M5 on the horizon. Plain-English version of that is harder than single-milestone projects.

**Relationship to `/sig:report`:** Sibling, not subset. They share `.planning/` source data and helper code (`readProfile`, `readState`, `readOpenQuestions`, `nextActionForPhase` from `tools/lib/status.js`) but have different output shapes, audiences, and vocabulary discipline. Likely co-ship.

**Resolve by:** real Signal usage produces a moment where the user (or someone they're showing the project to) wishes there were a non-jargon overview, OR `/sig:report` ships and immediately gets a "but I want this in plain English" request. Likely Milestone 5, co-shipped with `/sig:report` and possibly `/sig:audit` as a "read-only synthesis commands" cluster — all three share validator/README/manifest overhead.

---

## `/sig:audit` — engineering-readiness audit (codebase scorecard + refactor plan)

> **Update 2026-07-04 (ratified BR-1):** keeps the `/sig:audit` name. The 2026-06-04 hygiene-sweep proposal below (which also claimed `/sig:audit`) is renamed `/sig:sweep` — evaluate-readiness vs clean-drift is the boundary. See DECISIONS 2026-07-04.

**Status:** Logged 2026-05-09. Source: review of *Code Evaluation Audit* (Nate Bjones, `promptkit.natebjones.com/20260504_qbn_promptkit_1`) — adapted, not ported. Two interview-style prompts in the source; the 6-dimension scorecard is the keeper insight, translated to Signal's artifact-driven substrate. Drop the source's "Mythos-class adversarial review readiness" framing — newsletter-bait tied to a 2026 news cycle; the underlying dimensions are evergreen without it.

**Context.** `/sig:init` produces `LANDSCAPE.md` — a *descriptive* snapshot of an existing codebase (stack, structure, tests, activity). It deliberately stops short of *evaluating* what it found. There's a real adjacent capability gap: a user finishing `/sig:init` (or returning months later) often wants the next question answered — *"how ready is this codebase for the engineering rigor I'm about to apply to it?"* That's an audit, not a landscape.

### Candidate direction

New read-only command, sibling to `/sig:init` and `/sig:status`. Same design discipline as `/sig:status` and the proposed `/sig:report`: re-running produces the same output, no `.planning/*` mtimes change, no skills loaded (light agent use is fine — see below). Writes its own artifact (`.planning/AUDIT.md` + optional `.planning/WHAT-GOOD-LOOKS-LIKE.md`) so it doesn't churn LANDSCAPE.md.

**Six dimensions to score (1–10 each, with composite weighted by tier):**

| Dimension | Primary input | Notes |
|---|---|---|
| Modularity & boundary clarity | `agents/scanners/structure-scanner` | Top-level layout, monorepo shape, module boundaries |
| Test coverage & test quality | `agents/scanners/quality-scanner` + new ratio check | Folds the source kit's functional-vs-quality ratio diagnostic into the *quality* half of this score |
| Documentation & explicitness | `quality-scanner` (README/CHANGELOG) + `structure-scanner` (docs/) | Includes ADR/decision-log presence |
| Dependency health | `agents/scanners/stack-scanner` (lockfiles/manifests) | Age, count, vendoring posture |
| Tribal-knowledge risk | `agents/scanners/activity-scanner` (contributor concentration, hot files) + LANDSCAPE.md | Inverse: high score = low tribal-knowledge dependency |
| Security-model explicitness | new (interview supplement OR scanner extension) | Auth/trust boundaries, threat-model presence, secrets-handling discipline |

Five dimensions map cleanly onto existing `/sig:init` scanner outputs — `/sig:audit` would consume the four `.planning/scan/*.md` files plus `LANDSCAPE.md` rather than re-running scanners. **One (security-model explicitness) doesn't have a clean scanner source today.** Two viable approaches: (a) light interview supplement using the M4.t8 walkthrough pattern (3–4 targeted questions surfaced as 3+other), or (b) extend `quality-scanner` to detect security-relevant files (CSP headers, threat-model docs, security.md, dependabot config). Lean toward (a) for v1 of audit since the dimension is judgment-heavy by nature; (b) becomes worth it when a second new dimension also wants scanner-level signal.

**Output sections (composite ~80–120 lines for FULL):**
- Six-dimension scorecard, with one-line evidence per dimension and one-line "what a 10 looks like for *this* codebase."
- Composite weighted score (security-sensitive systems weight modularity + security higher; weighting derived from PROFILE.md tier + concerns block if the Option C concerns work has shipped).
- Ranked structural blockers — concretely *what would impede AI-assisted engineering work*, not generic "bad practice." Severity tagged Critical / High / Medium / Low.
- Prioritized refactor plan — 3–7 items, rough effort estimate in days/sprints (not hours; precision is dishonest at this scope).
- Honest risk summary written *for the user*, not "for leadership" — the source kit's CTO/VP framing is enterprise-coded and doesn't fit Signal's solo-dev / small-team audience.
- Optional `WHAT-GOOD-LOOKS-LIKE.md` companion artifact — north-star description of the target state, not just a to-do list.

**Tier-aware behavior:**

| Tier | Output |
|---|---|
| SKETCH | Skip entirely. Throwaways don't need an audit; noise-to-signal inverts. |
| FEATURE | Light pass — scorecard + top 3 blockers + 3-item refactor plan. ~40 lines. |
| SPIKE | Findings-shaped — what we explored, what's risky if we keep any of this code. ~30 lines. |
| FULL | Full pass — six dimensions scored fully, 5–7 blockers, refactor plan with effort estimates. ~80–120 lines. |

**Where it slots in the flow** — three plausible entry points; not locking before v1 ships:
1. **After `/sig:init`, before `/sig:calibrate`** — "your codebase is at readiness X; here's what calibrate is about to apply." Useful prologue for FULL-tier brownfield adoption.
2. **Standalone on demand** — run anytime mid-project to score current state.
3. **Periodic checkpoint** — re-run quarterly to track readiness drift over time.

Default first delivery: standalone-on-demand (#2). The brownfield-prologue placement (#1) is a follow-on once #2 proves out.

### Companion change — eval-balance check in `test-engineer`

The source kit's second prompt — functional-vs-quality test ratio diagnostic — has a second home outside `/sig:audit`: as a small standing question inside the existing `agents/specialists/test-engineer.md` agent. During every REVIEW phase, test-engineer estimates the functional/quality ratio of tests touching the changed surface and flags if skewed beyond a tier-appropriate target (e.g., FULL ≈ 50/50; FEATURE ≈ 70/30; SKETCH N/A).

Small change (1–2 hours). Ship **after** `/sig:audit` proves the ratio framing — don't propagate the insight into ongoing review work until the audit's scorecard validates it across multiple projects.

### Why log, not fix now

- M4.t13 (fixture tests, v0.1.1) is the only remaining Milestone 4 task; close that and ship v0.1.0 before opening new command surface.
- New command surface area = validator's `REQUIRED_COMMANDS`, README mentions, decision-tree viewer (`docs/map/index.html`), MCP/skill descriptions. Not huge, but bundle with planning work, not a one-off.
- Security-model dimension has a real "where does input come from" design question (interview supplement vs. scanner extension) that wants a tiny investigation before locking the dimension in.
- The audit's value depends on having more than one real brownfield Signal user — until then, scoring rubrics are calibrated against a sample of one (Signal-on-Signal).

### Anti-rationalization to lock in early

- *"Just put scoring inside `/sig:init`."* — No. `/sig:init` is *descriptive* (what's there); audit is *evaluative* (vs. a target). Folding evaluation into description forces every brownfield run through audit machinery, including SKETCH, where the audit explicitly shouldn't run.
- *"Use the source kit's interview-style prompts directly."* — No. Signal works from artifacts (LANDSCAPE.md, scanners, code), not interviews. Adapt the *dimensions and judgments*; don't port the prompts.
- *"Add eval-balance check to `test-engineer` first, audit later."* — Reverse it. Audit is the substantive new capability; the test-engineer fold-in is a derivative insight. If the audit's framing turns out wrong, you've only paid for one mistake instead of two.
- *"Make `/sig:audit` overwrite `LANDSCAPE.md`."* — No. LANDSCAPE.md is a stable `/sig:init` artifact. Audit produces its own (`AUDIT.md`) so re-running doesn't churn upstream.
- *"Skip the security-model dimension since it doesn't have a scanner."* — No. It's load-bearing — codebase audits without security explicitness produce false comfort. Solve the input-source question instead.
- *"Run audit before every phase."* — No. Audit is strategic, not transactional. Default cadence: on demand + once per brownfield onboarding. Per-phase running is exactly the rigor-noise the calibration layer exists to suppress.
- *"Keep the 'Mythos readiness' framing, it'll attract attention."* — No. Tying surface area to a news cycle dates the command. Underlying dimensions stand on their own.

**Resolve by:** v0.1.0 ships → first FEATURE-or-FULL tier brownfield adoption beyond Signal-on-Signal where the user post-`/sig:init` wishes they had a *"is this ready?"* answer → promote to a Milestone 5 Epic slot. Likely co-ships with `/sig:report` since both are read-only synthesis commands and could share helper code in `tools/lib/`.

---

## `/sig:docs-update` — doc-vs-codebase drift verification (port from GSD)

**Status:** Logged 2026-05-12. Trigger: user hit project-doc drift in a real-world build — README/ARCHITECTURE claims no longer matched the codebase, a recurring failure mode across the user's projects. GSD has a mature subsystem for exactly this gap (`/gsd:docs-update` + 4 agents); Signal has nothing equivalent. v1 ships with a `documentation-and-adrs` skill that teaches *how to write docs*, but no command to *audit existing docs against code*.

**Context.** Project documentation drifts. A README written at project bootstrap describes a 3-endpoint API; six months later there are 12 endpoints, two have been renamed, one was deleted, and the README still claims the original three. ARCHITECTURE.md references a service layout that was refactored two refactors ago. This is a different failure than the drift `/sig:status` is designed to catch — `/sig:status` answers "where am I in the workflow"; this is "do my external-facing docs lie about the code." Signal's existing verifier agents (`verifier`, `integration-checker`, `nyquist-auditor`, `plan-checker`) verify code and plans against acceptance criteria, none verify docs against code.

GSD's `/gsd:docs-update` subsystem (4 agents, ~1200 lines of agent code + 1161-line workflow) is the most mature non-execution piece in GSD and the cleanest port candidate in the v2 queue. Worth pulling forward because doc-drift is a *cross-cutting* concern — it's not a phase, it's a periodic hygiene check that any tier above SKETCH benefits from.

**Scope of "docs" (locked).**

| In scope (the GSD nine) | Out of scope |
|---|---|
| README, ARCHITECTURE, getting-started, development, testing, API, configuration, deployment, contributing | `.planning/STATE.md`, `STATUS.md`, `MILESTONE-*.md`, `CONTEXT.md` — Signal-internal planning state has its own lifecycle (STATE.md is *meant* to drift; STATUS.md is regenerated by the Phase 2 deducer). Verifier must not touch these. |

**Candidate direction.**

New command `/sig:docs-update` plus 4 agents. Tier-aware: always *callable*, auto-runs only on FEATURE/FULL when invoked from `/sig:ship`.

**Tier-aware behavior.**

| Tier | Auto-run via `/sig:ship` | Standalone `/sig:docs-update` |
|---|---|---|
| SKETCH | No | Available (manual only — throwaways don't justify a gate, but the command is callable on demand) |
| FEATURE | Yes, `--verify-only` (warn, don't block) | Full modes available |
| SPIKE | No (SPIKE skips SHIP anyway) | Available |
| FULL | Yes, `--verify-only` (block on FAIL findings) | Full modes available |

**Modes (matches GSD's contract):**
- **default** — generate missing docs + update stale auto-managed docs + verify all claims; offer to fix FAIL findings
- **`--verify-only`** — read-only drift audit, returns PASS/FAIL/UNVERIFIABLE per claim, no file writes (this is the mode `/sig:ship` invokes automatically)
- **`--force`** — regenerate all 9 doc types from scratch; overwrites hand-written content (so confirmation required)

**Files to add (~1150 lines, ~50% lighter than GSD's full system):**

| Path | Purpose | Source | Est. lines |
|---|---|---|---|
| `.claude/commands/sig/docs-update.md` | Command orchestrator (tier check → mode dispatch → spawn agents → report) | Adapted from `commands/gsd/docs-update.md` + workflow inlined | ~250 |
| `agents/specialists/docs-classifier.md` | Detects doc types this project needs | Port `gsd-doc-classifier.md` (168 lines) | ~150 |
| `agents/specialists/docs-writer.md` | Writes/updates one doc; modes create/update/supplement/fix | Port `gsd-doc-writer.md` (615 lines) — trim monorepo per-package mode + per-tooling templates we don't need | ~400 |
| `agents/verifiers/docs-verifier.md` | Adversarial verifier — every claim guilty until filesystem proves innocent | Port `gsd-doc-verifier.md` (217 lines) | ~200 |
| `agents/specialists/docs-synthesizer.md` | Aggregates verifier results across docs into a single report | Port `gsd-doc-synthesizer.md` (204 lines) | ~150 |

Total: ~1150 lines added; verifier goes to `verifiers/`, the rest to `specialists/`. No new agent directories needed.

**`/sig:ship` integration:** add a "pre-ship docs drift check" step that, for FEATURE/FULL tiers, spawns the verifier in `--verify-only` mode and either warns (FEATURE) or blocks on FAIL findings (FULL). Override always available — same pattern as Signal's other quality gates.

**Marker name + GSD-migration helper.**

Signal-only marker: `<!-- generated-by: sig-docs-writer -->`. Clean break, no dual-recognition path in the writer/verifier — keeps the spec simple.

But: the user has existing projects under GSD's marker (`<!-- generated-by: gsd-doc-writer -->`). Migrating those projects to Signal needs a one-time helper. **Document — but don't auto-run — a `/sig:docs-update --migrate-from-gsd` mode** that:
1. Scans all .md files for the GSD marker
2. Replaces with the Signal marker (no other content changes)
3. Reports the file list so the user can confirm before commit
4. Exits — the user then runs `/sig:docs-update --verify-only` to validate post-migration

This is a real-world use case the user flagged explicitly — it deserves spec inclusion at port time, not deferral.

**Things to intentionally NOT port from GSD:**
- **Monorepo per-package dispatch.** Adds complexity for ~5% of Signal's target users (solo devs / small teams).
- **5-wave parallel execution model.** Sequential is fine for 9 docs; the user-visible latency difference is small and the orchestration code shrinks dramatically.
- **`/gsd:cleanup`.** That's just phase-dir archival; not what the user was asking for and Signal's STATE.md model is different.

**Anti-rationalization to lock in early:**
- "Just extend `documentation-and-adrs` skill to handle verification." — No. Skills don't have the agent-spawning + filesystem-grep + structured-output capability the verifier needs. The skill teaches *writing*; verification needs an agent.
- "Verify the planning docs too while we're at it." — No. Planning state intentionally drifts ahead of and behind code (STATE.md is the project's working memory). Conflating those produces noise. Scope is locked: project docs only.
- "Just use `--force` every time and skip the verifier." — No. `--force` overwrites hand-written content. The verifier exists so the writer only touches what's actually drifted, preserving human-authored detail.
- "Make it part of `/sig:review` instead of a standalone command." — No. `/sig:review` runs once per shipped feature; doc drift accumulates across multiple ships and is worth checking *periodically* outside the phase flow. Standalone preserves that property; `/sig:ship` integration covers the per-ship case.

**Resolve by:** promote to a Milestone 5 Epic (suggest a new **M5.E7 — Tactical GSD ports / `/sig:docs-update`**) when (a) Milestone 4 closes with M4.t13 shipped, AND (b) the user wants to address doc drift on a real Signal-managed project. Independent of the 10-phase v2 architecture work — this is a tactical port, not an architectural one, and can ship as a single Epic before/alongside any of M5.E1–M5.E6.

---

## `/sig:add` — capture-and-route new work to the right altitude in `.planning/`

**Status:** Logged 2026-05-13 during M4.t19 follow-up conversation about release-hardening and stranger-adoption readiness. Surfaced when user wanted to add a release-hardening idea ("F2 resolution, README rewrite, etc.") and had to decide themselves whether it was a Task, Epic, Milestone, FUTURE-IDEAS entry, or OPEN-QUESTIONS entry — a routing decision that requires already-internalized fluency with Signal's locked vocabulary (Milestone / Epic / Phase / Wave / Task per M4.t18). That fluency burden is stranger-hostile and a daily papercut even for experienced users.

**Context.** Signal today has commands for moving work *through* the system (`/sig:calibrate → /sig:discuss → /sig:plan → /sig:execute → /sig:verify → /sig:review → /sig:ship`) and one read-only inspection command (`/sig:status`). It has **no command for capturing new work and routing it to the right altitude** in `.planning/`. The user must decide manually:

- Is this a concrete task that fits the current milestone? → append to active `MILESTONE-*.md`.
- A new Epic within the current milestone? → new Epic stanza.
- An unresolved design question? → `OPEN-QUESTIONS.md`.
- A "someday" architectural evolution? → `FUTURE-IDEAS.md`.
- A new milestone-scale chunk? → hand-author `MILESTONE-N.md`.

That's five altitudes, each with a different file and conventions. Newcomers can't make this call without reading existing entries to learn the shape; experienced users still pay a small tax every time. The result is capture loss — ideas land in a notes file, Slack DM, or memory and never make it into `.planning/` at all.

### Candidate direction

New command. Probably not phase-gated (capture should always work). Light agent use only — this is not a synthesis command, it's a capture-and-route command.

**Capture flow:**
1. User runs `/sig:add` with (optionally) a paste or one-liner: `/sig:add "F2 — verify agents auto-register after marketplace install"`.
2. Brief interview — 1–3 questions, adaptive based on what the input already reveals:
   - *Is this actionable now, or future-state?*
   - *Is there an unresolved design question, or do you know the shape?*
   - *Does this fit the current milestone's scope, or is it bigger?*
3. Confirm proposed routing destination before writing. User can override.
4. Append a stamped entry (date, trigger context, body) to the chosen file.
5. Print one-line confirmation: `Added to FUTURE-IDEAS.md at line 471. Run /sig:status to see updated counts.`

**Routing logic (user's design insight, locked here):**

> **FUTURE-IDEAS.md is the default landing zone.** Subsequent planning phases (`/sig:plan`, hand-curated milestone creation) review the list and promote items to specific milestones when scope and timing align. This makes `/sig:add` low-stakes: capture first, sort later. The promotion step is where altitude gets decided with full context.

| Destination | Heuristic | Frequency |
|---|---|---|
| **`FUTURE-IDEAS.md` (default)** | Architectural evolution, "someday" idea, anything not clearly committed work | ~70% |
| `OPEN-QUESTIONS.md` | User says "I don't know how to decide X" — explicit unresolved design question | ~15% |
| Current `MILESTONE-*.md` | User confirms it's a concrete task fitting current milestone's scope | ~10% |
| Other `MILESTONE-*.md` | User identifies a specific future milestone (e.g., "this is M5-territory") | ~3% |
| New `MILESTONE-N.md` scaffold | High-altitude — requires confirmation; rare | ~2% |

**Never writes to `DECISIONS.md` or `STATE.md`** — DECISIONS is write-only after deliberation, STATE is regenerated from phase output. Capture is upstream of both.

**Entry shape (whichever destination):** Date stamp + one-line trigger context + body. The "why" line is load-bearing — it's what makes Signal's planning archaeology work months later. Format matches existing FUTURE-IDEAS / OPEN-QUESTIONS conventions so promoted items don't need re-formatting.

### Why log, not fix now

- **Chicken-and-egg:** Can't use `/sig:add` to add `/sig:add`. Pragmatically the design must stabilize through manual entries (this one) before the command exists.
- **New command surface area** — validator's `REQUIRED_COMMANDS`, `plugin.json` commands list, README, decision-tree viewer (`docs/map/index.html`), MCP/skill descriptions. Same overhead as `/sig:report` and `/sig:audit` — bundle, don't one-off.
- **Strong candidate for Milestone 4.5 (release-hardening / stranger-adoption) as a named Epic.** Release-hardening isn't only "polish docs"; it's also "make Signal usable by people who haven't memorized its vocabulary." `/sig:add` directly addresses that. Sibling Epics: F2 (post-install agent registration), README-as-pitch, CHANGELOG discipline, fresh-machine install verification.
- Routing heuristics want at least 5–10 real capture events worth of data before locking — pre-locking will produce a brittle command.

### Anti-rationalization to lock in early

- *"Just have Claude figure out where it goes — no interview."* — No. Altitude is judgment-heavy. A 1–3 question interview is cheap; misrouting an idea into the wrong file forces the user to re-find and re-author it later. Confirmation is load-bearing.
- *"Default to current milestone, not FUTURE-IDEAS."* — No. That biases toward over-committing scope. FUTURE-IDEAS default + planning-phase promotion is the safer asymmetry: easier to promote than to retract.
- *"Make it write to multiple files at once."* — No. One destination per `/sig:add` call. If something needs to land in both OPEN-QUESTIONS and FUTURE-IDEAS, that's two captures. Multi-destination logic balloons fast.
- *"Add `--quick` mode that skips the interview."* — Defer. Power-user flag, but the interview is *the* feature for newcomers. Add only when 5+ users have explicitly asked.
- *"Let it edit DECISIONS.md too."* — No. DECISIONS is the resolved-architecture log. Capture is upstream of decisions, never sideways into them.
- *"Make it auto-trigger from `/sig:discuss` when new scope surfaces."* — Defer. Tempting, but it conflates capture (lightweight, always available) with discussion (phase-gated, heavy). Keep them separate; cross-reference if useful.
- *"Just point users at the right file in docs and skip the command."* — No. That's exactly what's broken today — the file-routing burden lives in the user's head. The command exists to absorb that burden.

**Resolve by:** Milestone 4.5 (release-hardening) when that milestone is scaffolded — `/sig:add` is a strong candidate first Epic alongside F2. If M4.5 doesn't materialize, promote to M5 as a standalone Epic. Likely co-ships with `/sig:report` and `/sig:audit` (all three are command-surface additions that share validator/README/manifest overhead).

---

## `/sig:goal` — phase-aware wrapper around Claude Code's `/goal` for intra-phase autonomous loops

**Status:** Logged 2026-05-14. Trigger: user surfaced Claude Code's new `/goal` feature ([code.claude.com/docs/en/goal](https://code.claude.com/docs/en/goal)) and asked whether it could be told to "complete Milestones X through Y with accompanying verification and review processes" — i.e., let it autonomously run through Signal-planned work across multiple milestones.

### What `/goal` is (Claude Code feature, not Signal)

A session-scoped supervisor. User sets a condition (`/goal <description>`); after every turn, a small fast model (Haiku) reads the **conversation transcript** and decides yes/no on whether the condition holds. "No" auto-fires the next turn with the evaluator's reason as guidance; "yes" clears the goal. Key constraints:

- One goal at a time, session-scoped.
- Evaluator **does not call tools and does not read files** — it judges only what Claude has surfaced in the transcript.
- It's a wrapper around a prompt-based Stop hook (composes with existing Stop hooks at session scope).
- Works in non-interactive mode (`claude -p "/goal ..."`).
- Resumes across `--continue` (turn count + timer reset, condition preserved).

### Context — the tension with Signal

Signal's whole design is **phase-gated**: CALIBRATE → DISCUSS → PLAN → EXECUTE → VERIFY → REVIEW → SHIP each end at an inspection point that's *meant* to involve the human. PROFILE.md tier-gating exists precisely to dial *how much* human friction a project warrants. `/goal` is engineered to remove per-turn prompts — which is the friction FULL-tier work is specifically supposed to retain. The naive use case ("complete Milestones X–Y autonomously") is exactly the noise calibration is supposed to suppress.

Two further mechanical problems with naive use:

1. **Evaluator can't read `.planning/` state.** For Haiku to judge "milestone N tasks complete and verified," Claude would have to keep re-pasting STATE.md / MILESTONE-N.md content into the transcript every turn. Unreliable, expensive, and drift-prone.
2. **It bypasses Signal's own anti-rationalization gates.** `phase-gate-enforcer`, `plan-checker`, `nyquist-auditor`, `verifier`, `ui-checker` — these are designed as deliberate inspection points. `/goal` will keep firing turns past them unless the condition explicitly encodes each one (and even then, only via transcript signal, not artifact reading).

### Where `/goal` legitimately fits — intra-phase, not cross-phase

| Phase | Good `/goal` condition shape |
|---|---|
| `/sig:execute` wave | "Every task in wave N is committed, `npm test` exits 0, phase-gate-enforcer agent surfaces no blockers, or stop after 30 turns" |
| `/sig:verify` | "All Nyquist gaps filled, full suite green, verifier agent confirms phase goal met" |
| `/sig:init` scans | "All 4 scanners (stack/structure/activity/quality) emitted their markdown and LANDSCAPE.md is drafted" |
| Mechanical sweeps (M4.t18-style refactors) | "`grep -r '<old-vocab>' .` returns 0 matches, tests pass" |

All have one measurable end-state that lands naturally in the transcript without re-pasting `.planning/` state.

### Where it doesn't fit

- **Cross-milestone autonomy** — "complete Milestones X–Y" spans phase gates designed for human input. Pays for Signal's planning rigor and skips the human-in-the-loop part that makes the rigor pay off.
- **CALIBRATE / DISCUSS** — the user *is* the signal source. Autonomous = self-talk.
- **REVIEW** — multi-agent review exists to surface judgment calls. Auto-clearing on "review done" defeats the point.

### Candidate direction — `/sig:goal` wrapper

A thin Signal-aware wrapper over Claude Code's `/goal`. Reads `PROFILE.md` + `STATE.md`, identifies the current phase, and emits an exit-criteria condition appropriate to that phase. Keeps the **calibration layer in charge of whether to run unattended**, lets `/goal` handle the loop mechanics.

**Shape (sketch, not locked):**

```
/sig:goal                # use current phase's default exit criteria
/sig:goal <subphase>     # e.g., "/sig:goal wave-2" inside execute
/sig:goal --condition <override>  # pass a custom condition through
```

**Phase → default condition mapping (sketch):**

| Phase | Default condition emitted to `/goal` |
|---|---|
| EXECUTE | "All wave-N tasks committed, suite exits 0, no phase-gate blockers, or stop after T turns" (T derived from tier) |
| VERIFY | "Nyquist coverage gaps filled, full suite green, verifier agent reports phase goal met" |
| `/sig:init` | "All 4 scanners emitted markdown, LANDSCAPE.md drafted, baseline PROJECT.md present" |
| Mechanical sweep mode | User provides the grep target; condition is "`grep <target>` returns 0 matches AND tests pass" |
| CALIBRATE / DISCUSS / REVIEW / SHIP | **Refuses to set a goal.** These phases need human input by design. Prints a one-line explanation pointing at the right phase command. |

**Tier-aware behavior:**

| Tier | Behavior |
|---|---|
| SKETCH | Default-on; long turn budgets fine — throwaways don't need supervision. |
| FEATURE | Default-on with shorter turn caps; warns before exceeding budget. |
| SPIKE | Default-on; phase-specific conditions favor "answer found" over "code shipped." |
| FULL | **Off by default**; opt-in per invocation (`/sig:goal --confirm`). The whole point of FULL is the inspection points; auto-supervising past them undermines the tier. |

### Why log, not fix now

- **`/goal` itself is new** — Claude Code feature, not yet stress-tested in real Signal sessions. Want at least 5–10 real `/goal`-driven runs before locking the wrapper's shape.
- **Condition-authoring is the actual hard part.** The mapping from "Signal phase + current STATE" → "condition Haiku can evaluate from transcript alone" is non-trivial. Evaluator can't read files; conditions must be phrased so Claude's *output* contains the proof. That's a small design study, not a one-liner.
- **Stop-hook interaction needs verification.** User's `~/.claude/settings.json` already has a Stop hook (afplay sound). Docs say `/goal` is a session-scoped Stop hook layered on top — should compose, but worth real-session validation before promising it works.
- **Bundle with command-surface peers.** Same overhead as `/sig:report`, `/sig:audit`, `/sig:add`, `/sig:docs-update` — validator's `REQUIRED_COMMANDS`, README, decision-tree viewer, plugin manifest. Co-ship with one of those, not standalone.

### Anti-rationalization to lock in early

- *"Just tell users to use `/goal` directly — Signal doesn't need a wrapper."* — Partly true for power users, but the value of `/sig:goal` is **encoding the phase-aware refusal** (won't run during DISCUSS / REVIEW / CALIBRATE / SHIP) and the tier-aware defaults. Users who don't know which phases are safe to autonomize will reach for `/goal` in CALIBRATE and get bad outcomes.
- *"Have `/sig:goal` span phases — run EXECUTE then VERIFY then REVIEW back-to-back."* — No. That's the cross-milestone failure mode again at a smaller scale. Each phase transition is a checkpoint. If the user wants chained phases, that's `/sig:execute && /sig:verify` at the shell, not a single goal condition.
- *"Make the condition read `.planning/STATE.md`."* — Can't. Haiku evaluator doesn't run tools. The condition must be phrased so Claude *surfaces* the relevant state in the transcript (e.g., "cat STATE.md and confirm `current_phase: verify`"). Wrapper's job is to author conditions that respect this constraint.
- *"Auto-set a goal at the start of every `/sig:execute`."* — No. Opt-in. The whole reason Signal has phase commands is to make rigor a deliberate user action. Auto-supervising defeats that.
- *"Add Notion / Slack integration so the goal fires when work completes."* — Defer. Out of scope. `/goal` already supports headless mode; users who want notification can wire that themselves.
- *"Run `/sig:goal` during REVIEW with a 'review complete' condition."* — No. REVIEW is judgment-heavy; auto-clearing on "review complete" optimizes for transcript-surface signal over substantive multi-lens evaluation. Same logic as why REVIEW is human-gated at all.
- *"Drop the FULL-tier opt-in requirement — it makes the command feel timid."* — No. FULL is the tier where the human checkpoints matter most. Making the user explicitly confirm autonomous mode at FULL is the calibration layer doing its job.

**Resolve by:** real Signal usage of plain `/goal` reveals which phase-conditions actually work in practice (5–10 sessions minimum), AND one of these fires — (a) the user catches themselves re-typing similar `/goal` conditions across runs, (b) a stranger using Signal misuses `/goal` in a phase where it shouldn't run, (c) condition-authoring becomes a friction point worth absorbing into a command. Likely Milestone 5 or later. Co-ship candidate with `/sig:report` / `/sig:audit` / `/sig:add` if they cluster into a "new command surface" Epic.

---

## I wonder aloud at having a

> **Update 2026-07-04 (backlog review):** sharpened into a concrete design — a statusline script reading STATE.md frontmatter (`current_epic` / `current_wave` / `last_completed_task`, all shipped in schema_version 1) rendering e.g. `M4.5 › E5 › S2.t5 (EXECUTE)`; tier-gated display depth; one verify step first (confirm Claude Code's statusline-config API surface). Verified 2026-07-04: no statusline integration exists in the repo today. Cockpit cluster (`BACKLOG-REVIEW-2026-07-04.md` §3 + §4 Sprint 5).

**Status:** Logged 2026-05-18 via `/sig:add`.

I wonder aloud at having a feature of Signal be a 'you are here' breadcrumb in status line - so somewhere in status line would be "M1>Wave2>T1..." etc. wise? feasible? I just find myself wondering where I am in the process alot of the time, and feels like status line would be a good place for that? thoughts?

---


## `docs/map/index.html` — refresh protocol (auto-generated vs. manual sync)

**Status:** Logged 2026-05-24. Trigger: added the "Work-unit vocabulary" section to `docs/map/index.html` (commit `629b629`); the new section includes "currently active" lines (Milestone / Epic / Slice / Task) populated from STATE.md as of 2026-05-24. Without an explicit refresh protocol these lines go stale within days during active development — Task lines change daily during EXECUTE, Slice lines every few days, Epic lines every few weeks. **Updated 2026-06-03:** the map gained a Command library (Section 1, `COMMANDS` array, commit `2f66bd1`); Stage 1's checklist below now also covers command/flag changes. This same protocol gap was confirmed live — the map sat at `generated 2026-05-24` through the entire v0.1.3 release until manually refreshed.

**Context.** The map (`docs/map/index.html`) is intentionally a side note — single-file static HTML, no build step, data lives in JS objects at the bottom of `<script>`. It was a one-time visualization of *static* concepts: the 4 tiers, the 7 phases, the rigor matrix, the 5 calibration questions. None of those go stale unless Signal's architecture changes. The new vocabulary section breaks that pattern: it embeds "currently active" project state (`M4.5`, `M4.5.E3`, `M4.5.E7.S2`, `M4.5.E7.S2.t8`) directly into the visualization. That data has its own staleness cadence.

**Staleness inventory** (which lines decay how fast):

| Line | Source-of-truth | Typical refresh cadence |
|---|---|---|
| `Currently: M4.5 (...)` (Milestone) | STATE.md frontmatter + MILESTONE-{N}.md | 1–2× per year (new Milestone start) |
| `Active: M4.5.E3 (...)` (Epic) | STATE.md `current_epic` | Every few weeks (Epic shifts) |
| `Last shipped slice: M4.5.E7.S2 (...)` (Slice) | git log + CHANGELOG | Every few days during active dev |
| `Last shipped task: M4.5.E7.S2.t8 (...)` (Task) | STATE.md `last_completed_task` | Daily during EXECUTE |
| Header meta date | Manual | Every map edit |

**Candidate direction.**

A staged approach — start with the lightest possible manual protocol, promote to automation only if the manual approach reliably fails.

### Stage 1 — Manual sync at Epic-SHIP events (lowest cost; recommended starting point)

Add one line to `commands/ship.md`'s pre-ship checklist:

> Before opening the PR: if this Epic touched the work-unit vocabulary OR shipped a slice that should appear in `docs/map/index.html`, update the `VOCABULARY.hierarchy[].example` lines and the `<p class="meta">generated {date}</p>` header in `docs/map/index.html`. If this Epic added/removed/renamed a command or changed a command's flags, also update the `COMMANDS` array (Section 1 — Command library) in the same file. ~2 minutes; same edit pattern as updating CHANGELOG.

Rationale: Epic-SHIP is the natural cadence for "stuff worth surfacing publicly happened." Task-level changes are too noisy (Task line would update daily); Milestone-level is too rare (Slice + Epic lines would lag). Epic-SHIP is the goldilocks gate.

Cost: zero infrastructure, ~2 min per Epic ship. Already part of an existing checklist, so no new ceremony.

Failure mode: human forgets. Mitigated by `commands/ship.md` being the per-Epic checklist that already gates other "did you remember…" items (CHANGELOG, validator, tests).

### Stage 2 — Auto-generate map data on commit (if Stage 1 reliably fails)

Promote to a `tools/build-map.js` script that:
- Reads `.planning/STATE.md` frontmatter (current_epic, last_completed_task)
- Reads `.planning/CHANGELOG.md` or `git log --oneline -1 -- MILESTONE-*.md` for last shipped slice
- Rewrites the `VOCABULARY.hierarchy[].example` lines in `docs/map/index.html` in place
- Bumps the header `generated {date}` line
- Runs as either: (a) a `lefthook` / `husky` pre-commit hook scoped to `.planning/STATE.md` writes, (b) a `npm run build:map` invoked from `commands/ship.md`, or (c) a tiny Node script in `tools/` called manually.

Cost: ~150 LOC of Node, no new runtime dep (uses existing `fs` + `yaml` for STATE.md parsing). Adds a build step to a previously build-step-free file — minor architectural drift.

Failure mode: regex-based string replacement can be fragile; mistakes corrupt the map. Mitigate with: (a) tests for the script, (b) keeping the data object structure verbatim-parseable.

### Stage 3 — Make the map a live page (deferred indefinitely)

Convert `docs/map/index.html` to fetch state at page load via a GitHub raw URL pointing at `.planning/STATE.md`. Pros: never stale. Cons: introduces network dependency on a side-note page, breaks the "static, no build step" property, raises questions about cross-origin and rate limits. Not pursued unless Stages 1 and 2 both fail and live freshness becomes a real ask.

**Why log, not fix now.** Stage 1 is genuinely a one-line addition to `commands/ship.md` plus this FUTURE-IDEAS entry. Could be landed right now without a full Epic. But the user has scoped today's work as: capture-and-ship the vocabulary visualization. Adding to `commands/ship.md` touches the workflow surface, which deserves its own micro-Epic or a slot in the next plan-cycle so the change is intentional. Land as: a one-task addition to M4.5.E3's S3 governance slice (since governance is the natural home for "checklist updates that contributors follow"), OR as a standalone follow-on after E8.

**Anti-rationalization to lock in early:**
- *"Just update the map whenever you remember."* — That's the failure mode this entry exists to prevent. The map already had a stale `generated 2026-05-22` date when this entry was written; ad-hoc updates lose to entropy.
- *"Skip Stage 1, jump to Stage 2."* — No. Stage 1 is free and proves whether the refresh cadence is worth automating. Building the script before knowing whether the manual version reliably gets done is over-engineering.
- *"Make the data live."* — Stage 3 territory. Not now. Side-note pages don't justify network dependencies; the cost-benefit doesn't pencil out.
- *"Add map updates to every task SHIP, not Epic SHIP."* — Wrong cadence. Most tasks don't shift the vocabulary visualization's content; Epic boundaries do. Task-level cadence creates churn without signal.

**Open design questions:**
- **Where does Stage 1's checklist line live?** `commands/ship.md` is the obvious home (per-Epic SHIP), but `commands/ship.md` is currently a generic command template, not Epic-specific. May need a small refactor or a separate "release-cycle ship checklist" doc.
- **Does the map deserve its own SHIP gate at all?** Alternative framing: treat it as `examples/` material (deferrable, casual) rather than `docs/` material (formal, current). If so, refresh cadence relaxes to "whenever convenient."
- **Should the `docs/map/index.html` footer's "refresh cadence" pointer link to this entry's permalink?** Currently links to `.planning/ISSUES-INBOX.md § map-refresh-protocol`. Once promoted to milestone work, the pointer should update.

**Resolve by:**
- Stage 1 lands as part of M4.5.E3.S3 (governance slice) OR as a one-off micro-task after E3 ships. Either way, before E5 launch — strangers will see the map and they'll see "generated {old date}" as a quality signal.
- Stage 2 promotion-trigger: 3+ consecutive Epic ships where Stage 1's checklist was forgotten or skipped. Until then, manual is fine.
- Stage 3: never, unless Stages 1 + 2 both fail AND live freshness becomes a real user ask.

**Slot:** likely M4.5.E3.S3 (one-line checklist addition to `commands/ship.md`) or a standalone micro-task after E3/E8 close. Defer-or-promote decision when the next planning cycle runs.

---

## M5 opening move — feature-parity audit

> **Update 2026-07-04 (ratified BR-8):** confirmed — this is M5's opening Epic. Scope + sequencing in `BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 2; MILESTONE-5.md carries the opening-move note.

**Status:** Logged 2026-06-01 via `/sig:add`.

M5 opening move — feature-parity audit across ALL inspirational repos. Before/at the start of v2 (Milestone 5), do a deliberate re-read of every inspirational repo against current Signal, then refresh analysis/SIGNAL-INTEGRATION-RUNDOWN.md (it predates M4.5 and is now stale). Repos: GSD, Agent Skills, gstack, pm-skills, superpowers, compound-engineering, planning-with-files, oh-my-claudecode, + Pi / oh-my-pi (see analysis/PI-OMP-PATTERNS.md).

Focus areas the user flagged as high-potential: (1) documentation indexing / organization, (2) memory management, (3) "compounding" learning — retro REPLAY, not just capture (M4.5.E9 built capture only), (4) gstack office-hours reframing.

Recommendation: make this the OPENING Epic of M5 (after M4.5 closes — E4 worked-example + E5 launch), so v2 is planned against a current landscape rather than the pre-M4.5 vision. When M5 planning runs, the new /sig:plan drain will surface this and the related entries below as candidates — the capture/drain loop closes here.

Related existing FUTURE-IDEAS entries to fold in: "Roadmap refresh — post-M4.5 reality check on v2 vision"; "Compound-engineering audit before /sig:compound design"; "Memory & Documentation Management as Signal-managed Runtime (wiki/index + retro enforcement)"; "Codebase knowledge-graph (graphify)". Logged 2026-06-01 at the v0.1.3 close, before a context clear.

---

## Signal should acclimate it's language to

> **Update 2026-07-04 (ratified BR-4):** sharpened — the dial is a property of the person, not the project. Lives at user level (a communication block in user-scoped config) with an optional per-project PROFILE.md override; every command reads it via a shared output-shaping preamble plus the plain-English mapping tables spec'd in the `/sig:orient` entry (build those tables once, share them). Calibration-depth cluster (`BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 6). See DECISIONS 2026-07-04.

**Status:** Logged 2026-06-03 via `/sig:add`. during PLAN on M4.5.E5

signal should acclimate it's language to how technical the person is. I keep finding myself asking for plain language explanations so I actually understand what things mean and what decision I'm really making. So in the spirit of 'calibrate', one has the option to dial in a spectrum of technical language, one end being "zero-technical knowledge who wants very plain, straight forward explanations anyone can understand <---|---|--->expert/senior developer who wants explicit and detailed technical language"

---

## FUTURE-IDEAS drain process — disposition protocol folds into M4.5.E2.S5

**Status:** Logged 2026-05-24 during conversation about the asymmetry between FUTURE-IDEAS' input pipe and its (nonexistent) output pipe. Trigger: user reviewing 16 live entries asked aloud *"at some point they all need to get into Epics — any process for that?"* The honest answer was no, there isn't one.

**Decision (2026-05-24): Option A locked in.** The drain process is a four-verb disposition protocol — **promote / defer / merge / delete** — applied at the M4.5.E2.S5 planning-gate sweep. No new command. No new ceremony. S5's spec is sharpened to include the protocol; this entry becomes its own first triage candidate when S5 ships. See `DECISIONS.md` 2026-05-24 for full rationale. Options B (milestone-boundary sweep) and C (`/sig:groom` command) are not killed — they're deferred until 2–3 Epics of lived experience with S5 reveal whether option A is sufficient.

**Context.** FUTURE-IDEAS.md has a hardened **input** path: `/sig:add` (M4.5.E2.S1, shipped 2026-05-14) does verbatim capture, sensitive-data scrub, atomic write, lock-protected. New ideas land cleanly. There is no defined **output** path. Entries accumulate. As of today: 16 live entries, oldest from early M4.5 work (~April 2026), most recent five logged within the last 36 hours. Average accumulation during active dogfooding is ~3–5 entries/week. No expiry, no triage cadence, no owner.

Things that touch the gap today, in order of how much they actually drain:

1. **M4.5.E2 Slice 5 (pending)** — `commands/plan.md` gets a step that surfaces FUTURE-IDEAS at planning-gate. This is the closest thing to a drain, and it's already on the roadmap — but it only fires when a new Epic starts PLAN, so entries can sit weeks between sweeps. It also doesn't define what *should happen* to an entry once surfaced (promote? defer? delete? merge?).
2. **Ad-hoc relevance** — when an entry becomes urgent ("oh, we need that now"), the user manually promotes it into an Epic or fold it into in-flight work. Lossy: relevant-but-not-urgent entries decay into the void.
3. **Nothing else.** No periodic review. No staleness flag. No archival of shipped items beyond the lone `## ✓ SHIPPED — …` heading from the plugin rename.

**Impact.** Three failure modes, ordered by current pain:

- **Quiet decay.** Entries logged during real friction moments lose context as the project evolves — six weeks later, the "why" line still reads but the surrounding state has changed enough that it takes 10 minutes of re-investigation to know whether the entry is still valid.
- **Duplicate logging.** With 16+ entries and no triage cadence, `/sig:add` calls risk re-capturing variants of existing entries because nobody is reading FUTURE-IDEAS top-to-bottom. (Already mitigated weakly by the user's habit of skimming before logging, but that's a personal-discipline gate, not a process.)
- **Stranger-hostile.** A new contributor reading FUTURE-IDEAS today cannot tell which entries are *next up*, which are *parked indefinitely*, and which are *probably stale.* Same problem as the `/sig:orient` entry surfaces for project status — Signal's surface lacks plain-English curation outside of in-flight Epics.

**Candidate directions.** Three options, in increasing order of effort and explicit ownership:

1. **Trust M4.5.E2.S5 alone.** Planning-gate review is the most natural drain point — the user is already in "what should we build next" mode. Define what S5 *does* with each surfaced entry (promote / defer / delete / merge) and call it done. Low effort, but only fires per-Epic-planning, so cadence is irregular.
2. **Milestone-boundary sweep.** Add a FUTURE-IDEAS triage step to whatever closes a Milestone (today there's no explicit command — happens implicitly via the final `/sig:ship`). Lower frequency than S5, but higher rigor — every entry gets a decision at least once per Milestone.
3. **`/sig:groom` (or `/sig:triage`) command.** Dedicated read-mostly command that walks FUTURE-IDEAS and prompts per entry: *still relevant? promote? defer? delete? merge?* Same design discipline as `/sig:status` and `/sig:report` — re-runnable, decisions captured separately, no `.planning/*` mtimes mutated by the walk itself. Most effort, but the only option that gives the drain process an explicit owner, a cadence the user controls, and a verb in Signal's vocabulary.

Options aren't mutually exclusive. Plausible final shape: S5 covers *new-Epic planning gate*, a Milestone-close step covers *full sweep*, and `/sig:groom` exists as an *on-demand* triage tool. Don't design the full shape until S5 ships and the gap it leaves behind is concrete.

**Anti-rationalization to lock in early:**
- *"Just delete entries we don't act on."* — No. The value of FUTURE-IDEAS is the why-and-context capture at the moment of friction; deletion without triage discards data we paid to record.
- *"Set a hard expiry — auto-archive after N weeks."* — Tempting but lossy. Entries can be dormant-but-correct for months (e.g., `/sig:audit` logged 2026-05-09 is still relevant). Time-based decay punishes the wrong thing.
- *"Just rely on the user skimming the file before each `/sig:add`."* — Personal-discipline gate, not a process. Fails the moment the user is tired, rushed, or onboarding a collaborator. Won't survive stranger adoption.
- *"Track everything in a real issue tracker (GitHub Issues / Linear)."* — Considered and rejected. FUTURE-IDEAS' value is being *inside the workspace*, captured by `/sig:add` in the same flow as actual work. Exporting to an external tracker breaks the capture loop and adds context-switch overhead. Worth revisiting only if Signal grows multi-contributor.
- *"Add a `status:` field to each entry's frontmatter (active / parked / stale)."* — Adds bookkeeping load to every entry without solving the underlying triage cadence problem. Status fields go stale faster than the entries they describe. Don't.
- *"Roll this into `/sig:plan`'s already-planned S5."* — That's option #1 above, and it might be the right answer. But conflating "review at next planning gate" with "drain the full file" is how S5's scope quietly grows beyond what was planned. Keep them as distinct decisions.

**Open design questions:**
- **What's the canonical disposition vocabulary?** *Promote → Epic*, *defer → keep dormant*, *merge → fold into another entry*, *delete → outdated*, *shipped → archive with marker*. Need a small reference table if any option lands.
- **Where do disposition decisions get recorded?** Inline edit of the entry? Archive section at bottom? Separate `FUTURE-IDEAS-LOG.md`? Probably inline — the entry already carries its own context, so the disposition belongs next to it.
- **What's the right cadence for option #2 (Milestone sweep)?** Tied to *whatever closes a Milestone* — and Signal doesn't have a `/sig:milestone-close` command today. Adding one is a separate small design problem.
- **Does `/sig:groom` (option #3) need tier-aware behavior?** Probably not — it's a META command like `/sig:status`/`/sig:report`/`/sig:resume`, which are tier-agnostic. But worth a one-line decision.
- **What about FUTURE-IDEAS entries that are themselves about FUTURE-IDEAS process** (like this one)? Probably the right answer is *they get triaged by the process they describe, once it exists.* But that's circular until the first drain happens.

**Triage hint.** Resolved 2026-05-24 — Option A locked in (see Decision stamp above). What remains live in this entry: *the question of whether option A is sufficient, or whether options B/C eventually need to follow.* That question stays parked until S5 ships and 2–3 Epics' worth of triage cycles have run.

**Resolve by (follow-on B/C decision):** S5 ships AND (a) the user notices entries decaying between planning-gate sweeps, OR (b) a stranger reads FUTURE-IDEAS and asks "which of these are real?", OR (c) FUTURE-IDEAS crosses ~30 live entries (current 16 + projected 14 more during M4.5 close = roughly the threshold where top-to-bottom scan stops being free). Likely M5-era if (a)/(b)/(c) don't accelerate it.

**Relationship to other entries:**
- `/sig:add` (shipped) — input pipe. This entry is the missing output pipe.
- M4.5.E2.S5 (pending) — partial drain at planning-gate. This entry asks "is partial enough?"
- `/sig:report`, `/sig:audit`, `/sig:orient` — all read-only synthesis commands that share the same design discipline `/sig:groom` would inherit (re-runnable, no mtime mutation, no skills loaded, no agents spawned).

**Source data.** `.planning/ISSUES-INBOX.md` (this file, 16 live entries as of 2026-05-24); `.planning/MILESTONE-4.5.md` lines 60–71 (`/sig:add` Epic spec + S5 description); `commands/add.md` + `tools/lib/add.js` (input pipe implementation); conversation 2026-05-24 surfacing the gap.

---

## Codebase knowledge-graph as a Signal-managed artifact (graphify, graph-only)

> **Update 2026-07-04 (ratified BR-2):** this entry is now the single home of the traversal-artifact question (consolidates the Intent-Layers finding from the "5 CC tools" entry). Ratified default = hierarchical markdown intent layer — aligns with the locked "plain markdown in git is load-bearing" rule and avoids a Python dep against the <5-min install target. The graph becomes opt-in later, only if relational queries prove needed on a real Epic. Decision spike (run `intent-layer` on a real repo) scheduled in the M5-opening audit. See DECISIONS 2026-07-04.

**Status:** Logged 2026-05-24 after reviewing `safishamsi/graphify` (https://github.com/safishamsi/graphify). Scope deliberately narrowed by user: **adopt the graph artifact only — not graphify's skill, AGENTS.md nudge, install hooks, or auto-rebuild post-commit hooks.** Runtime/language choice (graphify is Python; Signal is JS/Node + markdown) is an open question and may rule out graphify-the-tool while keeping graphify-the-idea.

**Core idea.** A persistent, queryable knowledge graph of the user's codebase — produced once at brownfield onboarding, refreshed at controlled checkpoints, and consumed by Signal's research/planner/reviewer agents instead of grep+glob exploration on every session. The graph is **both a Signal-generated artifact** (Signal owns when it's built and where it lives) **and an ongoing reference surface** that downstream phases read.

**Why this is interesting (carry-over from initial review).**

Where it would actually help:

- **`/sig:init` brownfield scan.** Today the four scanners (activity / quality / stack / structure) grep their way around. A pre-built graph with god-node and community-structure data would feed `sig:planners:codebase-researcher` and `sig:support:codebase-mapper` something far richer than what they produce now. This is the clean win.
- **DISCUSS / PLAN on existing code.** `graphify query "what connects auth to database?"` and `graphify path A B` are exactly the questions `sig:researchers:codebase-researcher` is trying to answer.
- **REVIEW phase signal.** Impact-analysis + centrality metrics give `code-reviewer` and `security-auditor` something concrete to point at — *"this PR touches a god node."*

**Lifecycle the user sketched (with open questions).**

1. **Build on `/sig:init`** — first-run cost paid once during brownfield onboarding; output lives alongside `.planning/LANDSCAPE.md` (or replaces parts of it). Tier-gated: probably skip for SKETCH, opt-in for FEATURE, default for SPIKE/FULL.
2. **Refresh after each `/sig:ship`?** — user flagged this with a `?`. Plausible because shipping is the natural "code state changed materially" beat, and it's user-initiated (not a silent hook fight with auto-update protocol). Open: is per-`/sig:ship` the right cadence, or per-Epic-close, or both? AST-only rebuild is fast and free; LLM-augmented passes (docs/PDFs) are not.
3. **Ongoing reference** — research/planner/reviewer agents read the graph artifact instead of greping. The graph becomes part of the briefing surface alongside CONTEXT.md / STATE.md / current Epic plan.

**Adoption shape that fits Signal's constraints (graphify-the-tool variant).** If graphify is the implementation:

- Do **not** install graphify's skill file (~58KB autoload would torch the context budget — Signal's hardest constraint).
- Do **not** install graphify's git hooks; they would race Signal's STATE.md auto-update protocol on the same commit lifecycle.
- Wrap it as a thin `/sig:graph` (or fold into `/sig:init`) that shells out, tier-gated by PROFILE.md, AST-only by default (skip LLM-cost extraction of docs/PDFs/images unless user opts in).
- Treat graphify's `EXTRACTED` / `INFERRED` / `AMBIGUOUS` confidence labels as first-class — planner agents must not promote `INFERRED` to ground truth (aligns with the working-norms baseline rule: *surface ambiguity, don't resolve silently*).

**Language / stack concern (open).** Graphify is Python (3.10+, `uv`/`pipx`, tree-sitter grammars). Signal today is Node + markdown + YAML — no Python runtime prerequisite. Adopting graphify-the-tool would make Python a transitive install requirement and dent the "installable in under 5 minutes" target. Three live alternatives:

1. **Accept the Python dep** — fastest to value, biggest install-footprint regret.
2. **Find a Node/JS equivalent** — tree-sitter has Node bindings; graph storage (NetworkX) has JS analogues. More work, native to the stack.
3. **Build the minimum graph Signal actually needs in JS** — Signal probably doesn't need 31-language coverage or video transcription. A narrower JS implementation tuned to Signal's research-agent questions may be the right scope.

**Trustworthiness flag on graphify-the-tool.** 53,075 stars on a 3MB repo whose default branch is `v8`, with a marketing site (graphifylabs.ai) and ~30 translated READMEs, is unusual for a tool of this scope and recency. Not disqualifying, but warrants a contributor-graph + issue-activity look before adopting it as a Signal dependency. The *idea* of a codebase knowledge graph is sound regardless of whether this particular implementation is.

**Triage hint.** P3 — not blocking M4.5, but a high-leverage M5-era candidate. The clean-win surface (`/sig:init` enrichment) is well-defined and would compound across every Epic that touches existing code. Resolve language/stack question before any prototype work; that decision gates everything else.

**Promote-back trigger.** Revisit when (a) M4.5 closes and M5 scope is being shaped, OR (b) a `sig:researchers:codebase-researcher` or `sig:planners:codebase-researcher` invocation produces visibly weaker briefings than a graph-backed equivalent would have (i.e., the felt cost of grep+glob exploration becomes concrete on a real Epic).

**Cross-references:**
- `.planning/MILESTONE-4.5.md` E1 (brownfield onboarding — `/sig:init` is the integration point).
- `agents/sig:planners:codebase-researcher`, `agents/sig:support:codebase-mapper`, `agents/sig:researchers:codebase-researcher` — the consumers.
- `commands/init.md` — would gain the graph-build step.
- Working-norms baseline: *surface ambiguity, don't resolve silently* — applies to `INFERRED`/`AMBIGUOUS` edge handling.
- This entry's *language/stack* open question may share resolution with any future "what runtime does Signal depend on" decision.

**Source data.** `safishamsi/graphify` (v8, ~3MB Python, 53k stars, AST extraction via tree-sitter + LLM augmentation for non-code; output in `graphify-out/` — `GRAPH_REPORT.md` + `graph.json` + `graph.html`); review conversation 2026-05-24.

---

## E3 contribution scaffolding — deferred (CONTRIBUTING.md + issue templates + docs/compatibility.md sub-doc)

**Status:** Logged 2026-05-24 at M4.5.E3 close. Original M4.5.E3 scope included CONTRIBUTING.md + GitHub issue templates + a standalone `docs/compatibility.md` sub-doc. All three deferred via the audience reframe (M4.5.E3-REQUIREMENTS.md § D-E3-11) — E3 ships for self + peers, not external contributors, so formal contribution flow doesn't earn its keep yet.

**Context.** Peer-scale collaboration (the author + a handful of trusted reviewers) doesn't need formal contribution paperwork. A CONTRIBUTING.md that says "open a PR" without any other contributors isn't a contract, it's furniture. Same for issue templates without an issue stream. Same for a compatibility sub-doc when the only verified OS is macOS and the matrix has one row. The Compat table in README.md is the honest current shape; a sub-doc earns scope when there are multiple verified rows.

**Re-promotion triggers** (verbatim from M4.5.E3-REQUIREMENTS.md § D-E3-11):

- **(a) External contributor opens a real PR** → promotes `CONTRIBUTING.md`. The PR itself is evidence the file is now load-bearing; write it then, with knowledge of the actual contribution shape that arrived.
- **(b) Issue volume exceeds informal email channel** (~5+ open issues from non-author contributors) → promotes issue templates. Templates make sense once the volume justifies routing; before that, they're friction.
- **(c) Linux or WSL tester volunteers** → promotes `docs/compatibility.md` AND unshelves M4.5.E1.S3–S5 (the install matrix rows). Same trigger as M4.5.E1's S3–S5 unshelf — a tester for the relevant platform raising a hand. The compat sub-doc and the install-matrix work are paired: one without the other is half-finished.

**What ships today instead:**

- `SECURITY.md` (M4.5.E3.S2.t5) — security reports can come from anyone, including peers. Industry-standard shape; not the same as CONTRIBUTING.md.
- README `### Requirements & compatibility` table (M4.5.E3.S2.t3) — 4-row honest current state. No sub-doc; just the table.
- `references/facts.md` (M4.5.E3.S2.t1) — single-source-of-truth for fact strings cross-cited in README + SECURITY. When `docs/compatibility.md` lands later, it sources facts from here too.

**Anti-rationalization to lock in early:**
- *"Just write a one-line CONTRIBUTING.md now."* — No. A stub file says "we don't take this seriously yet" louder than its absence. Wait for the trigger.
- *"GitHub Issues template files cost almost nothing to add."* — They cost coordination overhead (which template? when? mandatory fields?) and trigger an expectation that issues will be triaged. Don't promise what isn't there.
- *"A `docs/compatibility.md` sub-doc is forward-looking — write it now even with one row."* — Same problem as CONTRIBUTING.md. A sub-doc with one row reads as scope inflation. The table in README is the honest current shape.

**Resolve by:** any of triggers (a), (b), or (c) firing. Whichever fires first scopes the corresponding artifact in isolation; the other two stay parked.

**Source data.** M4.5.E3-REQUIREMENTS.md § D-E3-11 (audience reframe decision); M4.5.E3-PLAN.md (post-reframe 2-slice plan); MILESTONE-4.5.md § Status snapshot (E1 row notes the paired E1.S3–S5 shelving via D-E3-12).

---

## Memory & Documentation Management as Signal-managed Runtime (wiki/index pattern + retro enforcement + migration tooling)

> **Update 2026-07-04 (ratified BR-5):** workstreams #1 + #2 SHIPPED as M4.5.E9 (v0.1.3) — SHIP retro gate + `RETROSPECTIVES.md` index. The "SHIP has no retro step" premise below is historical. Remaining scope = #3-active (live-doc wiki restructure; the archive half was dogfooded 2026-06-05) + #4 (doc-runtime), with the six ⚠ lessons from the archive-migration entry as design inputs. Workstream #4's `/sig:doc-review` is absorbed into `/sig:sweep --docs` (BR-1). See DECISIONS 2026-07-04 + `BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 3.

**Status:** Logged 2026-05-25. Originator: user, in response to two concrete pain points: (1) a retrospective got skipped because conversation context cleared first — the learning evaporated; (2) ad-hoc retros routinely have more depth than whatever "summary RETROSPECTIVE" is supposed to be — even though discovery during scoping confirmed **no formal retro step exists in `commands/ship.md` today**. Companion observation: `.planning/` is already at 40 files in the flat root (trending toward 56+ this milestone) — the doc-sprawl problem the user described isn't a future risk, it's already here. Reference: Andrej Karpathy's personal wiki pattern (https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — markdown files as queryable knowledge base, with index/hub files and explicit cross-links. Signal's own auto-memory (the user's `MEMORY.md` + topical files + `[[name]]` links) already implements exactly this pattern — adopting it for `.planning/` would be internally consistent.

**Companion entry:** `## Codebase knowledge-graph as a Signal-managed artifact (graphify, graph-only)` — logged 2026-05-24, narrowly scoped to the artifact (not graphify-the-tool). The doc-wiki and code-graph share a thesis: **persistent, queryable structure beats grep + context-bloat**. They should ship as siblings inside this milestone, not as separate efforts that drift apart.

### Core thesis

A project's success depends on its documentation — big-picture goals, planning decisions, execution effort logs, retrospective learnings, security audit findings, architectural ADRs. Today Signal stores all of these monolithically in a flat `.planning/` root with filename-prefix namespacing (`M4.5.E3-*.md`). That breaks down fast — both for the human trying to find anything and for the LLM trying to traverse without blowing context. **Memory management is not a docs-cleanup task; it's a runtime concern** that touches every phase, every agent, every command, every brownfield onboarding. The fix is structural: wiki-style organization, per-cycle artifacts, machine-readable indexes, enforced cadences, link-health checks, and tier-aware activation.

This is potentially Signal's biggest unlock on its core value prop: *the receiver that tunes itself stays tuned because its memory of past tuning is structured, not buried.*

### The four workstreams (separate, related, sequenceable)

#### Workstream 1 — Retro enforcement + template (smallest, urgent)

- **Problem.** SHIP has no retro step. Ad-hoc retros happen sometimes; quality is highly variable; if context clears before someone writes one (as happened to the user immediately preceding this entry), the learning is lost forever. There is no formal artifact to retroactively populate, no template to follow, no phase gate to enforce it.
- **Fix.** SHIP refuses to mark the phase complete without `RETROSPECTIVE.md` (or per-epic equivalent) on disk. Phase-gate check at the start of SHIP warns "retro will be required to close this phase"; hard block at the end refuses to write `phase: SHIP → completed_phases` until the artifact exists and passes a minimum-content sanity check (not empty, contains the template's required sections).
- **Template — captures what made the rich ad-hoc retros rich.** Sections to include:
  - Timeline of the work (key dates, key decisions, key reversals)
  - What changed mid-flight and why
  - What assumptions broke
  - What surprised the team (positive or negative)
  - What would be done differently
  - What to feed back into Signal's own design (process improvements, command gaps, validator rules to add)
  - Links to specific commits, PRs, decision IDs, artifact files
  - Anti-rationalization: at least one "thing we almost rationalized away but didn't"
- **Distinct from existing artifacts.** PROGRESS.md is process state (commits, test counts). REVIEW.md is code-quality findings. RETROSPECTIVE.md is *meta-learning* — what we learned about how we work, not just what we built.
- **Granularity.** Per-epic, not per-milestone. One milestone = N epics = N retros. (Per-milestone meta-retro is a separate, smaller artifact at milestone close.)

#### Workstream 2 — Retrospective index (small, follows #1)

- `.planning/RETROSPECTIVES.md` as index — one-line entries per epic with hook, pointing to detailed files.
- Per-epic files live in a subfolder (`.planning/retrospectives/M4.5.E3.md` or, under workstream #3, `.planning/epics/M4.5.E3/RETROSPECTIVE.md`).
- Same shape as the user's `MEMORY.md` — proves the pattern is already validated in production (Signal-the-plugin uses it on the user's machine).
- Lets `/sig:resume` load only the index + the most recently relevant retro, instead of dumping all of them into context every session.
- Index entries should include a `tags:` field for fast filtering (e.g., `process`, `tooling`, `external-dependency`, `agent-design`).

#### Workstream 3 — `.planning/` wiki restructure (big, breaking)

- **New convention: subfolder per scope unit, consistent artifact filenames inside.** Working proposal:
  ```
  .planning/
    INDEX.md                              # top-level navigation
    PROJECT.md                            # stays at root (load-bearing for many commands)
    STATE.md                              # stays at root (load-bearing)
    PROFILE.md                            # stays at root (load-bearing)
    CONTEXT.md                            # stays at root
    OPEN-QUESTIONS.md                     # stays at root
    DECISIONS.md                          # stays at root
    FUTURE-IDEAS.md                       # stays at root
    milestones/
      M4.5/
        INDEX.md                          # milestone-level nav
        MILESTONE.md                      # the planning doc (was MILESTONE-4.5.md)
        retrospective.md                  # milestone-close meta-retro
        epics/
          E3/
            INDEX.md                      # epic-level nav (auto-generated)
            REQUIREMENTS.md
            RESEARCH.md
            PLAN.md
            PROGRESS.md
            VERIFICATION.md
            REVIEW.md
            RETROSPECTIVE.md
            VALIDATION.md
  ```
- **Cross-link convention.** `[[M4.5.E3#retro]]` (wikilink shorthand) or relative paths (`../epics/E3/RETROSPECTIVE.md`); must pick one and enforce it via the validator + link-check tool.
- **Touches every command and every agent that hardcodes `.planning/*` paths.** Quick audit needed before scoping — likely all 14 commands and many of the 26 agents reference these paths. Largest internal refactor since v0.1.0.
- **External validation:** Anthropic's "How Claude Code works in large codebases" post (2026-05-14, https://anthropic.com/engineering/claude-code-best-practices) independently arrives at the same architecture for CLAUDE.md files: *"a lightweight markdown file at the repo root listing each top-level folder with a one-line description ... layered approach: root file describes only the highest-level structure, and subdirectory CLAUDE.md files provide the next level of detail, loading on demand as Claude moves through the tree."* This is exactly workstream #3's design pattern, validated by production deployments across million-line monorepos. The post also reinforces the "root file = pointers and critical gotchas only; everything else drifts into noise" rule — informs how `.planning/INDEX.md` should be authored (terse pointers, not summaries).
- **Open: directory shape.** `milestones/M4.5/epics/E3/` (proposed) vs `epics/M4.5.E3/` (flatter but loses milestone grouping) vs `by-epic/M4.5.E3/` (older convention). Each has different traversal ergonomics, different breakage on rename, and different implications for the validator's path glob rules.
- **Open: how indexes get maintained.** Auto-regenerated on each write (cheap, never stale, but opaque)? Hand-curated (rich, but decays)? Hybrid with auto-generated structural section + manual "what matters here" narrative section?
- **Open: link health.** When files move or get renamed, do we have a link-check tool that catches dangling `[[refs]]`? Probably needs to be part of the validator suite, run by `/sig:doctor` and pre-commit.
- **Open: stable IDs vs filename-based links.** If a retro is `M4.5.E3.RETRO`, does that ID survive a rename of E3's title? Karpathy's wiki uses path-as-ID; Notion-style systems use UUIDs. Signal probably wants path-as-ID for git-friendliness, with the validator enforcing stability.

#### Workstream 4 — Doc-runtime / "militant memory management" (biggest swing)

- **Scheduled re-indexing.** Periodic regeneration of all index files from source artifacts. Run as a pre-commit hook? `/sig:index` command? Both?
- **Cross-doc link health.** Fail CI (or `/sig:doctor`) on broken `[[refs]]`. Same shape as the existing `validate-references.js` work.
- **Codebase knowledge-graph integration.** Graphify or equivalent (runtime/language choice TBD — graphify is Python; Signal is JS/Node + markdown). Surfaced to research/planner/reviewer agents instead of grep + glob exploration on every session. See companion entry from 2026-05-24 for narrowed scope (graph artifact only, not the surrounding tool conventions).
- **Tier-aware activation.** SKETCH likely doesn't need wiki structure or graph; FEATURE/FULL do. Where exactly is the line? — SKETCH may need only a single `NOTES.md`; SPIKE may need PROGRESS + RETROSPECTIVE but no INDEX; FEATURE/FULL get the full structure.
- **Possible new commands.** `/sig:index` (rebuild indexes), `/sig:wiki-check` (link health), `/sig:graph-rebuild` (refresh knowledge graph), `/sig:migrate-memory` (upgrade an existing project's flat `.planning/` to wiki shape), `/sig:retro` (interactive retro-writing helper that pre-populates the template from git log + PROGRESS.md + decision history), `/sig:doc-review` (periodic configuration-and-doc review — see below).
- **`/sig:index` supersedes external Curator (directive, 2026-07-13 — user preference).** Signal currently ships an *optional* Curator hook in `commands/ship.md` §8 — a clean no-op for any repo without a `.curator.yml` (including Signal's own, which keeps a hand-curated `INDEX.md`). Committed direction: **native-only.** `/sig:index` is the one doc-reconcile mechanism; once it ships, deprecate/remove the `ship.md` §8 Curator step so Signal carries **no dependency on an external doc-reconcile CLI**. For Signal's own `.planning/`, `/sig:index` replaces the hand-curation (Curator is already dormant here — see DECISIONS 2026-07-13). Fold this into the workstream-4 scope when M5 plans `/sig:index`.
- **Cadence enforcement.** Retro-on-SHIP is workstream #1; doc-runtime adds *index-on-write* (every PLAN/PROGRESS update triggers index regeneration) and *graph-on-checkpoint* (every `/sig:checkpoint` triggers a graph delta refresh).
- **Periodic doc review (`/sig:doc-review`).** Anthropic's 2026-05-14 large-codebase post observes: *"Teams should expect to do a meaningful configuration review every three to six months, but it's also worth doing one whenever performance feels like it's plateaued after major model releases."* This translates to a Signal-internal command that flags: stale indexes (modified files newer than index regeneration date), drifted CLAUDE.md (rules referencing code patterns that no longer exist via grep validation), outdated retro stubs (still `[FILL IN]` after N months), deprecated skill bindings (skills bound to phases that no longer load them), and stale FUTURE-IDEAS entries (logged but no decision after N months — promote to DECISIONS.md, demote to backlog, or actively delete). Should fire as a manual command (not a hook) at user-controlled cadence, with a CHANGELOG entry capturing what was reviewed and what changed. Tier-gated: SKETCH/SPIKE skip; FEATURE/FULL surface the prompt.
- **Hook-based enforcement is structurally stronger than command-internal logic.** Same Anthropic post: *"hooks enforce the rules deterministically and produce more consistent results than relying on Claude to remember an instruction."* This is the architectural argument behind workstream #1's FR1 deferred-to-PLAN item #8 (already added to M4.5.E9-REQUIREMENTS) — and it generalizes: the doc-runtime layer's enforcement (link health, index freshness, retro completion) should default to hooks where Claude Code's hook API supports it, with command-internal fallback for the cross-runtime adapter layer.
- **Dreaming-style automated curation (additional workstream #4 capability).** Anthropic's "Memory + Dreaming" launch transcript (Mahes, platform PM, 2026-05-DD research preview) describes a batch asynchronous process that analyzes recent agent-session transcripts, finds cross-session patterns / mistakes / strategies, and produces updated memory state as a *reviewable diff* the user accepts before it's applied. For Signal, the analogs are concrete: (a) **automated cross-Epic retro synthesis** — extends FR6 (optional milestone-close meta-retro) from manual to draft-then-review; analyzes the milestone's per-Epic retros + commit history + session transcripts and surfaces cross-cutting patterns. (b) **Verification notes on stub retros** — when a stub retro gets revisited (filled in, edited, or just reviewed during a future session), the system adds a note like *"verified accurate as of 2026-MM-DD based on session XYZ; no drift detected"*; over time these notes form an audit trail of memory freshness. (c) **Deduplication + staleness curation across FUTURE-IDEAS.md** — Dreaming explicitly does this for memory stores: consolidates duplicate entries, removes stale entries, adds verification notes. Signal's FUTURE-IDEAS.md is already nearly 1300 lines with growing duplication risk — a Dreaming-style pass could be `/sig:future-ideas-curate` or fold into `/sig:doc-review`. (d) **Pattern detection across multiple Epic retros** — find shared anti-patterns or recurring surprises that no single Epic retro surfaces alone; surface them as candidate updates to anti-rationalization tables or process refinements. All four are out-of-band batch processes (run on cron / on user invocation / post-task), produce diffs not overwrites, require explicit user review before applying. Scope-wise, this is a new sub-workstream within #4 — should be its own DISCUSS round during M5.E1 planning.
- **External validation of filesystem-as-memory thesis.** Same transcript: Anthropic deliberately chose to model memory as files in a filesystem (managed via bash + grep) rather than as a specialized memory API, because they're betting on Claude's ability to manage filesystem state directly. Signal's entire `.planning/` premise is the same bet. This is independent production validation of the core architectural choice underlying all four workstreams. No specific action — but worth noting that the direction is corroborated by Anthropic's own platform decisions, not just our internal convictions.

### Migration story — how an existing Signal-using project upgrades

**This is the part that decides whether the feature is usable in the wild or only for greenfield.** Without an explicit migration command, the only beneficiaries are projects started after the feature ships — and the maintainer's own project (Signal-the-codebase) becomes stranded on the old structure. Open questions to answer before designing:

- **Discovery.** How does the migrator identify epics and milestones in a flat `.planning/`? Filename prefix (`M4.5.E3-*`) is the obvious signal — but is it always reliable? Older projects might use different shapes (`M5-S2-PLAN.md`, `Phase3-research.md`, etc.). Probably needs a configurable regex or interactive disambiguation pass.
- **Backup.** Is the old flat structure preserved during migration? Strong default: move originals to `.planning/.archive/pre-wiki-{ISO-date}/` so users can diff and verify before deleting. Never delete in the same operation as the move.
- **Idempotency.** Can `/sig:migrate-memory` be re-run after partial completion? After new flat files were added post-migration? Must be — networks fail, users interrupt, hybrid states are real. Migration tool needs to detect "already migrated" state and degrade gracefully to "scan for stragglers" mode.
- **Backward compat during the transition.** Do existing 14 commands keep working pointing at old paths until cutover? Or is migration a single atomic operation that rewrites command references too? Probably: commands ship in both-paths-work mode for one minor version, then deprecate flat paths in the next.
- **Past retros.** For already-shipped epics with no RETROSPECTIVE.md, do we (a) leave them blank, (b) generate placeholders prompting the user to backfill, or (c) auto-synthesize a thin retro from git log + PROGRESS.md + commits? Recommended default: (b) — placeholders surface the gap honestly without inventing false memories. Optional (c) as `--synthesize` flag for users who want a starting point.
- **Index bootstrap.** Generated automatically on first run (mechanical, low-effort, may need narrative editing)? Or interactive — `/sig:migrate-memory` walks the user through index entries the way `/sig:init` walks brownfield onboarding? Recommended: auto-generate the mechanical structure, prompt for one-line narratives per major section.
- **Knowledge graph bootstrap.** When does graphify (or equivalent) get bootstrapped — on `/sig:migrate-memory`? On `/sig:upgrade`? On-demand only via `/sig:graph-rebuild`? Probably on-demand — graph generation can be expensive and isn't every user's priority.
- **Per-project opt-in / opt-out.** Tier-gated? SKETCH skips wiki structure entirely? Or always-on but with shallow structure for small projects? Probably: tier-gated, with the migration tool detecting the project's current PROFILE.md tier and proposing the matching depth.
- **Cursor/Codex impact.** Signal's primary runtime is Claude Code, but commands are theoretically portable. Does wiki structure assume CC-specific things (e.g., how skills resolve relative paths)? Probably no, but worth checking before scoping the multi-runtime adapter layer.
- **`/sig:upgrade` vs `/sig:migrate-memory`.** Is upgrade-the-plugin (new commands appear, new validator rules) separate from migrate-the-project-structure (existing artifacts get reorganized)? Strong yes — upgrades should be seamless, migrations are explicit and reviewable (user must approve the proposed move list before any file is touched).
- **Dry-run mode.** `/sig:migrate-memory --dry-run` prints the full move/rename/index-create plan without touching disk. Mandatory before any migration runs for real.
- **Rollback.** If migration goes sideways, is there a one-command rollback? `/sig:migrate-memory --rollback` restores from `.planning/.archive/pre-wiki-{date}/`. Same shape as a database migration's `down`.

The migration command (working name `/sig:migrate-memory`, possibly `/sig:wiki-init` for greenfield-feeling) is itself the unlock: without it, the feature only benefits new projects and existing Signal users (including the maintainer's own work, this very repo) are stranded on the old flat structure.

### Dogfooding plan — Signal-on-Signal as the validation harness

The user's framing on 2026-05-25: *"use signal as the manual version of what we hope to solidify in the signal plugin."* This is the design strategy in one sentence. The sequence:

1. **Manually restructure Signal's own `.planning/`** into the proposed wiki shape. Pick the directory convention by doing it for real. Write the index files by hand. Move every file. Update every command/agent that references those paths. **Discover the rough edges by hitting them, not by speculating.**
2. **Use Signal in its new shape for one full Epic** — probably whatever comes after this design Epic, possibly the Epic that builds the formal migration tooling itself. Operate on the new structure long enough to find the friction.
3. **Capture what worked and what didn't** as a retrospective (which we'll be doing anyway, per workstream #1 — this is the first dogfooded retro).
4. **Codify the working version into the plugin.** `/sig:migrate-memory` is informed by what we did manually. Templates are informed by the retro that the dogfood epic produced. Validator rules are informed by the link-rot we hit during step 1.

This sequence means **workstreams #1 + #2 ship first** (small, low-risk, no breaking changes — adds a new artifact + index, doesn't move anything); **workstream #3 is the dogfooding move** (manual restructure of Signal); **workstream #4 is informed by the dogfood** (the migration tooling, the indexes' auto-generation logic, the link-health validator, the graph integration).

### Why this is potentially a Milestone, not an Epic

- Touches every command (14) and every agent (26) — they all hardcode `.planning/*` paths in skill loaders and reference checks.
- Introduces at least 2–3 new commands (`/sig:migrate-memory`, `/sig:index`, possibly `/sig:wiki-check`, possibly `/sig:retro`).
- Companion graphify work is its own design study (open language/runtime choice, MCP integration questions).
- Sequencing constraint: must close M4.5 first — interleaving with active Epics E1/E2/E4/E5/E8 would create merge-conflict hell on `.planning/` paths.
- Strong candidate: **M5** explicitly, with v2 framework ports (compound-engineering, gstack, etc.) sequenced *after* memory management ships — because v2 ports will themselves benefit from the wiki structure as they're added.
- **Alternative scoping:** split — workstreams #1+#2 land as a closing M4.5 micro-Epic (low-risk additive change, ships value immediately, validates the retro template before we build everything else around it); workstreams #3+#4 become M5 in full.

### Anti-rationalizations to lock in early

- *"Just add a 'remember to write a retro' note to ship.md."* — No. Notes get ignored. The whole point is that retros got skipped when context cleared. Soft reminders fail under the exact pressure they're meant to handle. Phase gate or nothing.
- *"Subfolders are fancy; flat files have been working."* — They haven't. 40 files today, projection of 56+ this milestone, and the user noticed before the assistant did. "Working" means "we haven't admitted it's broken."
- *"Auto-generated indexes are too clever; just keep hand-written ones."* — Possibly true for top-level INDEX.md, but per-epic indexes that decay because nobody updates them are worse than no indexes. Hybrid (auto-structural + manual-narrative) is the answer; figure out which sections are auto vs manual at design time.
- *"Wait until after launch (E5)."* — Launch is the moment with maximum first-time strangers encountering `.planning/`. If 40 flat files look chaotic to the maintainer, they will look catastrophic to a new user trying to understand the project's shape. This is exactly the wrong time to defer.
- *"Build graphify integration first, it's flashier."* — No. The wiki structure makes graphify integration possible to surface coherently. Without indexes, the graph has nothing to nest into or link out to.
- *"Skip the migration tool — just write new projects in the new shape."* — That strands every existing Signal user including the maintainer. The migration tool is what makes the feature shippable, not optional polish.
- *"Make `RETROSPECTIVE.md` optional in SKETCH tier."* — Probably correct, but be careful: SKETCH is also where bad habits start. Maybe make it a one-paragraph `NOTES.md` instead — same enforcement, lower ceremony.
- *"Use Notion / Obsidian / something fancier than markdown."* — No. Plain markdown in git is load-bearing for Signal's portability claim and for AI agent consumption. The wiki pattern works *because* it's just files.

### Resolve by

- **Scoping decision (M4.5 micro-Epic for #1+#2 vs full M5 for all four):** in the next `/sig:discuss` session for this feature. Recommended split: ship #1+#2 inside M4.5 close-out; full M5 for #3+#4.
- **Directory convention (which subfolder shape wins):** first PLAN-phase decision for workstream #3.
- **Migration open-questions list (above):** DISCUSS phase deliverable for the M5 (or M5-prep) work.
- **Land workstream #1 (retro enforcement) before any other workstream** — it's the cheapest insurance against losing more learning during the build itself. The Epic that builds the wiki restructure will produce the most valuable retro of the entire project; losing it because we sequenced #3 before #1 would be embarrassing.

**Source data.** This conversation 2026-05-25 (user pain points: retro-skipped-by-context-clear, ad-hoc retro quality variance, doc sprawl observation, Karpathy wiki reference). Companion entry `## Codebase knowledge-graph as a Signal-managed artifact` (logged 2026-05-24). User's own `MEMORY.md` structure as the validated precedent. Current `.planning/` state (40 files, flat) as the problem statement.

### Conversation emergence log (what surfaced during 2026-05-25 scoping)

Captured here rather than lost-to-context, because the scoping conversation produced design signal that future-DISCUSS will want. Each item paired with the action it implies — observations without actions are noise.

- **No formal retro exists today.** Initial framing assumed "the normal summary RETROSPECTIVE is thinner than ad-hoc ones." Discovery: there is no formal retro at all. *Action:* workstream #1 is greenfield design, not redesign — adjust DISCUSS scope accordingly (no legacy to be backward-compatible with).
- **`/sig:add` slice 1 cannot capture its own design spec.** This very entry was written via direct Edit because slice 1 is hot-path verbatim capture of short user snippets; substantial composed entries need the cold-path interview from slices 2–4 (not yet built). *Action:* this is a concrete use case for the M4.5.E2 cold-path slices. Cite this entry as the validating example when those slices reach DISCUSS.
- **The four-way split was emergent, not pre-decided.** User came in with one bundled concern; the split into (1) retro enforcement, (2) retro index, (3) wiki restructure, (4) doc-runtime emerged from grounding the request against the actual repo state. *Action:* DISCUSS should explicitly validate the split with the user rather than treating it as given. The split may consolidate or fragment further once decisions are surfaced.
- **Dogfooding insight came as a user afterthought.** *"Use signal as the manual version of what we hope to solidify in the signal plugin"* was added at the end, not the top. It reshaped the entire sequencing strategy. *Action:* dogfooding plan is now load-bearing for the milestone shape — make it an explicit DISCUSS dimension, not an implementation detail.
- **The migration question list was generated mid-conversation.** 11 open questions surfaced once "migration" was named as a workstream. They were generated by the assistant, not asked of the user. *Action:* DISCUSS must walk the user through these explicitly — assistant-generated question lists are starting points, not answers. Several may collapse or split once the user weighs in.
- **Initial framing as "feature" was wrong altitude.** User opened with "new feature, new functionality, maybe ongoing runtime." The scoping conversation revealed this is milestone-altitude work touching all 14 commands + 26 agents. *Action:* resist the urge to scope as a single Epic during DISCUSS. If user pressure is to scope smaller, the right move is workstream #1+#2 as M4.5 close-out, workstreams #3+#4 as M5 — not "shrink the whole thing to fit."
- **Observation-without-action pattern surfaced.** Assistant closed the prior response with a hanging observation about losing this conversation's learnings; user corrected. *Action:* working norm saved to memory. Future responses pair every observation with an action, recommendation, or explicit awareness-only flag. This log section is the action paired with that observation.
- **Capture-in-the-moment proved itself.** The fact that this log exists at all — written before context clears, while the threads are still fresh — is the workstream #1 thesis demonstrated in miniature. *Action:* cite this log as the dogfood-zero artifact when workstream #1's retro template is drafted. The template should produce content shaped like this section.

---

## `/sig:doctor` helper-script split (M4.5.E8 S2 deviation; logged 2026-05-29)

**Context.** PLAN-phase RESEARCH § 10 + PLAN.md S2.t4/t5 locked an 80-char threshold for generated-script `node -e` payloads — anything longer was to be promoted to a companion `~/.claude/sig-doctor-helper.js`. S2.t2/t3/t6 (buildFixScript / buildReinstallScript / writeDoctorScript) implemented inline `node -e` for JSON edits; those payloads run ~200 characters. PLAN-rule violated.

**Why kept inline anyway.** Two emitted files (`sig-doctor.sh` + `sig-doctor-helper.js`) doubles the user's audit surface — they have to review both before approving any `[y/N]` step. One self-contained bash script reads as a flat sequence of independently-auditable actions. The 80-char threshold was an aesthetic readability proxy; the actual correctness gate is "is the embedded JS well-formed?" That's now enforced by `tests/doctor-script-gen.test.js` § "inline node -e commands are well-formed JavaScript" — every payload is parsed by `new Function()` to catch syntax errors at script-gen time, not at user-run time.

**When to revisit.**
- A user reports the inline payloads are hard to audit before running.
- A future P-state requires JSON mutations more complex than "delete a key" (e.g., merging nested objects). At that complexity, the helper-script approach becomes net-positive.
- M4.5.E2 cold-path captures a real friction event from running a generated script.

**Implementation note for future-Self.** `buildFixScript` and `buildReinstallScript` are pure functions returning strings today. The helper-script split would change the return shape to `{ script: string, helper: string }` and `writeDoctorScript` would need to know to write both. Public API change; tests would update. Plan ahead of any deeper P-state additions if the threshold revisits.

**Reference.** `M4.5.E8-PLAN.md` § S2.t4/t5; `M4.5.E8-RESEARCH.md` § 10; commits `4f0105a` (inline GREEN) + `1445a39` (well-formedness gate + deviation acknowledgment).

---

## Passive Stop-hook → continuous in-the-moment observation

**Status:** Logged 2026-06-04 via `/sig:add`. mid-EXECUTE on M4.5.E5

Passive Stop-hook → continuous in-the-moment observation capture. Add a passive Stop hook that fires when Claude finishes a turn and, while context is fresh, appends candidate observations (decisions made, gaps noticed, upstream bugs, drift from plan) to a scratch file — e.g. .planning/OBSERVATIONS.md. /sig:checkpoint and the SHIP retro then drain it into RETROSPECTIVES.md. Constraints: keep the hook PASSIVE (write-only, never triggers another Claude response), respect the stop_hook_active field to avoid infinite loops, and tier-gate it so SKETCH projects skip the overhead. Why it fits: Signal's learn loop today runs at SHIP/Epic-close granularity (E9 retro foundations); nothing captures a decision/gap at the moment it surfaces, which is exactly the standing "document in the moment" working norm. Signal already owns the hook plumbing (SessionStart, PreToolUse guards) and a retro index to land it, so this composes with E9 rather than replacing it. Source: Anthropic "How Claude Code works in large codebases" — self-improving Stop hook pattern. Likely an M5 (or small M4.5) slice.

---

## New command /sig:audit --docs / --code

> **Update 2026-07-04 (ratified BR-1):** renamed **`/sig:sweep --docs / --code`** (the `/sig:audit` name stays with the readiness scorecard above). Absorbs workstream #4's `/sig:doc-review` — its scope (stale indexes, drifted CLAUDE.md, `[FILL IN]` stubs, stale FUTURE-IDEAS) is a subset of `--docs`. Slotted in the memory/doc-runtime cluster (`BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 3).

**Status:** Logged 2026-06-04 via `/sig:add`. mid-EXECUTE on M4.5.E5

New command /sig:audit --docs / --code — a periodic deep-dive audit + cleaning sweep for alignment, accuracy, organization, and simplicity, run on demand (not phase-gated). --docs audits documentation: accuracy + alignment (stale prose, drift between STATE narrative / README / CHANGELOG / retrospectives / CLAUDE.md, internal contradictions, dead pointers and links, duplication) and organization (structure, findability, dedup). --code audits the codebase: organization (sprawl, inconsistent structure, misplaced files, dead code / orphans) and simplicity (over-engineering, redundant abstractions, needless indirection). No flag could default to a combined pass or prompt for scope. Inspired by — but deliberately broader than — Anthropic's "delete-the-line" staleness test (if removing a rule/line doesn't change behavior, cut it) plus their every-3-6-months re-audit cadence, generalized from CLAUDE.md hygiene into a whole-project sweep. Relates to the "docs always accurate" value and the learn/memory loop, but is a PROACTIVE periodic deep-clean rather than a reactive in-the-moment fix (contrast the Stop-hook capture idea, which is reactive/continuous). Likely implemented as read-only scanner-agent fan-out — reuse the brownfield scanner pattern, write findings to a report — feeding a remediation pass the user approves before anything changes; could extend /sig:doctor or stand alone; tier-aware depth. Motivation (user, observed across several long-running projects): a recurring feeling that projects accrete cruft and drift over time and periodically need a real organization + cleaning sweep, not just incremental edits.

---

## Archive-migration dogfood → `/sig:migrate-memory` lessons

**Status:** Logged 2026-06-05 after a manual `.planning/` archive-restructure (the "do it by hand first" dogfood plan from the *Memory & Documentation Management* entry). **⚠ REQUIRES ANOTHER ROUND OF REVIEW — these are lessons from a single pass on the archive subset; do NOT harden them into `/sig:migrate-memory`'s design without re-validating at full-wiki scale.** Captured in the moment per the "document in the moment" norm; face-value risk is real because the dogfood only exercised *closed* docs, not the active-doc move workstream #3 actually needs.

**What happened.** Archived 48 closed-cycle files (8 Epics' scaffolding + M1–M4) into `.planning/archive/M4.5/E{n}/` (nested, Epic-ID-prefixed) and added `.planning/INDEX.md` as a tiered map. Built `tools/archive-migrate.mjs` — a path-aware migration script (dry-run + self-verify) kept as a throwaway-but-committed prototype. Shipped as commit `be9d87d`. Working set dropped 72 → 24 root files; 0 dangling links; 773 tests green.

**Candidate lessons (each needs validation, not adoption):**

1. **The cascade is the LINKS, not the file moves.** 48 `git mv` were trivial; the work was 68 clickable links + 92 prose paths rewritten. ⚠ **TBD:** confirm this holds when workstream #3 moves *active* docs (STATE/PROFILE/CONTEXT and every command/agent that hardcodes their paths) — far more inbound refs, and load-bearing.
2. **Three reference classes need distinct handling:** (a) clickable `](path)` links → context-relative rewrite; (b) location-asserting prose paths (`.planning/X`) → archive path; (c) bare identifiers (`` `M4.5.E6-PLAN.md` ``) → leave valid *only if* prefixed filenames are kept. ⚠ **TBD:** is this taxonomy complete? Reference-style markdown links (`[a]: path`) and HTML anchors were never exercised; the tool's regex only catches inline `](...)`.
3. **ID-prefixed filenames in nested folders** traded path aesthetics for ~99 avoided rewrites. ⚠ **TBD:** workstream #3 proposed *bare* names (`epics/E3/PLAN.md`) for the active wiki. The archive's prefixed choice may conflict with that — decide whether the active wiki also keeps prefixes, or whether archive and active wiki diverge intentionally.
4. **The keying bug (load-bearing warning).** Link edits are computed against pre-move paths; they MUST be applied by mapping original→new location. The first apply keyed by post-move path and silently skipped every moved-file internal link — caught *only* by the post-move dangling-link verify. ⚠ `/sig:migrate-memory` must ship a dangling-link + residual-path check that runs automatically; the verify gate is not optional.
5. **Retros stayed in root** because `retro-index.js` parses `epicId` from the flat prefixed filename and the SHIP-time regenerator + tests assume that. ⚠ **TBD:** does the eventual wiki move retros into Epic folders (requires updating the parser + renderer + tests), or keep them flat forever? Deferred, not decided.
6. **Bot-race is real.** `mps-compiler` pushed `STATUS.md` mid-session → push rejected → rebase (harmless here, disjoint file). ⚠ `/sig:migrate-memory` must assume the tree can move under it: fetch + dry-run + reviewable plan + atomic apply, never a blind in-place rewrite.

**Where it lives.** `tools/archive-migrate.mjs` (committed). The dry-run + self-verify pattern is the seed of both `/sig:migrate-memory` (the move) and `/sig:wiki-check` (link health).

**Resolve by.** M5 memory-management DISCUSS — fold these in as design inputs, after re-validating each ⚠ against the active-doc move.

**Cross-references:** *Memory & Documentation Management as Signal-managed Runtime* (workstreams #3/#4 — the parent plan); *Codebase knowledge-graph as a Signal-managed artifact* (sibling traversal artifact); `tools/archive-migrate.mjs`; `.planning/INDEX.md`.

---

## Codebase-traversal + memory borrows from the "5 open-source CC tools" review

> **Update 2026-07-04 (ratified BR-2):** delta 1 (traversal) is resolved-by-default — consolidated into the graphify entry above, with markdown intent layer as the ratified default. Deltas 2–3 and the competition findings are unchanged and still ⚠ pending the M5-opening audit re-validation.

**Status:** Logged 2026-06-05 after reviewing a video walkthrough of 5 Claude Code tools (Intent Layers, DeepSec, Vercel best-practices skill, Agent Memory, Chrome verification). **⚠ REQUIRES ANOTHER ROUND OF REVIEW — conclusions drawn from one conversation against a transcript summary, NOT against the tools' actual source. Do not take at face value; the graphify-vs-Intent-Layers reframe in particular would change a previously-captured decision and must be validated by a real dogfood spike first.**

**The genuine deltas (each TBD until validated):**

1. **Intent-Layers-markdown as a contender to graphify for code-tree traversal.** Signal's captured answer to the traversal gap is a *knowledge graph* (graphify — Python, opaque, queryable). Intent Layers is *hierarchical markdown* `AGENTS.md` (readable, no runtime dep, git-tracked) — more aligned with the *"plain markdown in git is load-bearing"* anti-rationalization in the wiki-restructure entry. ⚠ **TBD:** NOT either/or — the graph answers *relational* queries ("what connects auth to the DB?") markdown can't; markdown answers *navigation/convention* queries the graph can't. Which is the **default** traversal artifact is unresolved. ⚠ Validate by actually running the `intent-layer` skill (crafter-station/skills, now installed) on a real large repo — the dogfood spike that has NOT been done.
2. **"Global invariants + anti-patterns" as a named INDEX content type.** Per-directory gotchas ("your training data is wrong about this repo") + anti-patterns ("don't put X here"). Absent from workstream #3's "terse pointers" INDEX and from the graphify entry. Plausibly the highest-leverage *accuracy* mechanism (suppresses the agent confidently following stale/wrong assumptions). ⚠ **TBD:** validate it earns its keep — does this content type drift faster than it helps, and who/what refreshes it (the lifecycle gate)?
3. **The ~20k-token-per-directory threshold** as the "when does a directory earn its own index doc" heuristic — answers an open question in workstream #3. ⚠ **TBD:** arbitrary number lifted from one tool; calibrate against Signal's actual context budget before adopting.

**Competition findings (awareness, not action — also TBD):**

- **Agent Memory** (4-tier working/episodic/semantic/procedural + decay): do NOT run alongside Signal — two uncurated memory systems muddy the signal-vs-noise model and Agent Memory's opaque/decaying DB contradicts Signal's readable-`.planning/` promise. *Borrow* its tiers + decay concept for `/sig:compound` design only. ⚠ **TBD:** validate against compound-engineering's actual mechanism (see the compound-engineering audit entry) before designing.
- **DeepSec** (Vercel security harness): don't reimplement; either orchestrate from REVIEW or fold its threat-model→matcher→batch→report methodology into the gstack v2 security port. ⚠ **TBD.**
- **Chrome verification** + **Vercel React/Next best-practices skill**: largely already covered (`browser-testing-with-devtools` skill + `ui-checker`; ported Agent Skills) and/or should stay framework-agnostic. Low priority. ⚠ Confirm `ui-checker` actually drives a *live* browser loop vs. static read — unverified.

**Resolve by.** M5 memory-milestone scoping / before `/sig:compound` design. Each ⚠ must clear a validation pass first.

**Cross-references:** *Codebase knowledge-graph as a Signal-managed artifact* (the graphify entry this reframes); *Memory & Documentation Management as Signal-managed Runtime* (workstream #3 + the markdown anti-rationalization); *Compound-engineering audit before `/sig:compound` design*; source = video walkthrough of 5 CC tools (no durable URL captured — ⚠ re-source before citing).

---

## GitHub Issues for work-item tracking — deferred until live users

**Status:** Logged 2026-06-06. **Decision: defer.** Evaluated adopting GitHub Issues as canonical work-item tracking (bugs / followups / ops / enhancements) against a detailed adoption prompt. **Outcome: stick with `.planning/` markdown for now; revisit when Signal has live users.**

**Why defer.** Signal *is* a planning-in-markdown system — its thesis (and `CONTEXT.md`'s locked rule) is that `.planning/` is the canonical, git-tracked, portable, AI-readable memory. Routing work-tracking to GitHub Issues would (a) split the project's memory across two systems — the same *"two uncurated memory systems muddy the signal"* risk flagged about Agent Memory in the *Codebase-traversal + memory borrows* entry — and (b) undercut the dogfooding story (if Signal can't track its own work in `.planning/`, that quietly concedes the thesis). For a solo maintainer with ~1 code TODO and few lifetime bugs, the overhead isn't earned yet.

**Trigger to adopt: live users (≈ E5 launch).** External testers won't edit `.planning/` markdown — they'll open Issues. E5.S2's tester-brief + friction-log is the natural first external intake, and public bug/friction intake is exactly what Issues are for — *complementary* to `.planning/`, not a replacement.

**The line to draw when adopted:**
- **GitHub Issues** = operational + external: bugs, ops, follow-ups, tester friction, the `needs-triage` inbox.
- **`.planning/`** = deliberate design memory: decisions, phase artifacts, architectural future-ideas, retros.
- Neither swallows the other. Do **not** migrate `FUTURE-IDEAS`/`DECISIONS` to Issues.

**Detection snapshot (2026-06-06):** repo `insightriot/signal`, Issues enabled, 0 open, default labels only, no `.github/ISSUE_TEMPLATE/`; inline tracking = `.planning/` (`FUTURE-IDEAS` + `OPEN-QUESTIONS` + `DECISIONS` + new `BUGS.md`); 1 code-level TODO. (`gh` active account = `insightriot` ✓.)

**Deferred setup to run at adoption:** namespaced labels (`bug`, `enhancement`, `followup`, `ops`; `priority:high/med/low` — or reuse Signal's `P1/P2/P3`; optional `triage:M{n}`, `audit:*`); short templates (`bug_report.yml`, `followup.yml`) + `config.yml` `blank_issues_enabled: false`; saved-search dashboard URLs in `CLAUDE.md`; a **human-in-the-loop rule** (never create / comment / close / label an Issue without explicit per-action approval — "yes file it" is not standing authorization; use `gh issue` via Bash); migrate `BUGS.md` + scattered follow-ups, leaving pointers. Code TODO/FIXME stay in code (one sweep Issue, not per-comment).

**Implemented now (the "valuable regardless" slice):** `.planning/BUGS.md` — a minimal markdown bug/findings catalog (the Signal-native "bug taxonomy") with a triage discipline. Gives the "always catalog bugs" norm a home in the existing system without the Issues overhead. Listed in `INDEX.md`.

**Resolve by:** E5 launch / first live users. If launch is a "quiet peer-only release," scale to just labels + a bug template and skip the formal migration (per the prompt's small-project guidance).

**Cross-references:** `.planning/BUGS.md`; *Codebase-traversal + memory borrows from the "5 open-source CC tools" review* (the Agent Memory two-systems finding); `CONTEXT.md` § locked ".planning/ is the memory"; E5 tester-brief / friction-log (`M4.5.E5-PLAN.md`).

---

## Path-scoped skills — a second scoping axis (phase × path)

**Status:** Logged 2026-06-07 (from the "execution harness / 7 extension points" doc review, post-v0.1.4). **Triage hint.** P3 (low).

Signal scopes skill loading by **workflow phase** only (`state/config.json` keys define/plan/build/verify/review/ship, via `skill-loader.js` + `context-monitor.js`). The large-codebase-harness pattern adds an orthogonal axis: scope a skill to a **filesystem glob** so it loads only when Claude is working under a matching path (e.g. a deploy workflow that fires only in `services/payments/**`). A two-axis loader — **phase × path** — would let Signal-managed projects keep phase skills lean while adding directory-local workflows without ballooning CLAUDE.md. ⚠ **Verify the mechanism first:** the source claims a `path:`/glob field in skill frontmatter is a real Claude Code feature, but it's a second-hand interpretation — confirm against actual Anthropic docs before designing (it may not be shipped, or may live elsewhere). Composes with, doesn't replace, the phase-keyed loader. Source: Anthropic "How Claude Code works in large codebases" (same doc as the Passive Stop-hook entry above). Likely M5-era.

---

## CLAUDE.md "de-bloat" test + command-frontmatter freshness discipline

**Status:** Logged 2026-06-07 (from the same "execution harness" doc review; subsumes the command-frontmatter freshness sweep deferred at the v0.1.4 close). **Triage hint.** P3 (low).

Adopt an explicit maintenance discipline for Signal's own instruction surface, two parts. (1) **The De-Bloat Test** — for any line in CLAUDE.md or a command's frontmatter, ask *"if I delete this, does Claude break in a way it wouldn't have?"*; if no, it's dead weight, cut it. The cost of bloat isn't tokens, it's that signal drowns and the one critical gotcha gets ignored. (2) **A recurring freshness review** (quarterly, or at each release) — old rules actively brake newer models (the classic "edit one file at a time" example), and descriptions drift: the stale `/sig:add` "naked-invocation lands in a subsequent slice" blurb caught + fixed at the v0.1.4 close was the visible tip; sibling command descriptions likely carry similar drift. **Signal-specific caveat (the load-bearing nuance):** de-bloat *reference/pointer* content only — **never** the behavioral gates (anti-rationalization tables, phase gates, exit criteria). Those are *deliberately* "redundant" because models rationalize them away; minimal-context optimization and behavioral-reliability optimization pull opposite directions, and the gates win. Could ship as a `/sig:` maintenance command or a `references/` checklist. Source: Anthropic "How Claude Code works in large codebases" (De-Bloat Test + quarterly review).

---

## Trigger watchlist — standing entry (check conditions at every drain)

**Status:** Added 2026-07-04 (backlog review, ratified BR-6). **Standing entry — never promote, merge, or delete.** At each `/sig:plan` drain, walk the conditions below and act on any that have fired; update rows as triggers fire or as new trigger-parked items land. Rationale: 10+ parked entries carry promote-back conditions that nothing evaluated — including one *dated* trigger that would otherwise expire unobserved. See `BACKLOG-REVIEW-2026-07-04.md` §2 A1 + DECISIONS 2026-07-04.

| Parked item (entry / doc) | Trigger condition | Fired? |
|---|---|---|
| E1 Slices 3–5 — Linux/WSL install matrix + versioning policy + validator hardening (`MILESTONE-4.5.md` § E1) | A Linux or WSL tester volunteers (D-E3-12) | — |
| E3 contribution scaffolding — CONTRIBUTING.md / issue templates / `docs/compatibility.md` | (a) external PR opens; (b) ~5+ non-author issues; (c) Linux/WSL tester (pairs with the row above) | — |
| Synthesizer-output validator-side sanity check | 2+ new synthesizer quality regressions by **2026-08-23** — dated; if the date passes with <2, mark expired-clean | — |
| `/sig:doctor` helper-script split | Inline `node -e` payloads reported hard to audit, OR a P-state needs JSON mutations beyond delete-a-key | — |
| `docs/map` refresh Stage 2 (auto-generate) | Stage 1 checklist forgotten on 3+ consecutive Epic ships | — |
| GitHub Issues adoption (setup checklist in its entry) | First live external tester (expected to fire in Sprint 0 — `BACKLOG-REVIEW-2026-07-04.md` §4) | — |
| PREPARE phase early promotion | Any of: PLAN skill-load approaches ~40K tokens; 2+ independent "this is prep, not planning" observations; 2+ new skills land homeless | — |
| STATE auto-update Options B/C | Option A discipline demonstrably fails (frontmatter stale despite the refresh steps) | — |
| Second dogfood project (BR-9) | Committed in Sprint 0; if not started by the time M5 PLAN runs, escalate — M5's usage-signal gate has no other source | — |
| Multi-feature lifecycle design | First real "feature #2" added to a Signal-built project (likely the second dogfood project) | — |
| Option C concerns block (calibration granularity) | Users hand-edit dials against tier defaults, or want a rigor level their tier doesn't offer | — |

---

## STATE.md append-without-evict — closed-work narrative must leave the live file

> **HIGH PRIORITY** (flagged 2026-07-04, Brett). Independent code-read confirmed the entry and sharpened the fix — the enforcement seam is the write hook, not the CLI writer. See the **Correction** note at the end of this entry.

**Status:** Logged 2026-07-04 via `/sig:add`.

STATE.md append-without-evict — closed-work narrative must leave the live file (evidence: CMMC dogfood). Second-dogfood STATE.md (examples/Example-cmmc-STATE.md) hit 60,551 words / 455KB, ~90% closed-work history; frontmatter completed_phases polluted with a ~550-word stale narrative blob that contradicts both the body and the archive — an accuracy failure, not just bloat. Four root causes in Signal's own contract: (1) writer doesn't validate completed_phases entry shape; (2) no machine home for per-slice lifecycle so agents invent prose slots (ties to the Multi-feature project lifecycle entry — this file is the BR-9 evidence it was waiting for); (3) body contract is append-only, "preserved across writes", with no eviction step at SHIP; (4) no size tripwire, so drift compounds silently. Signal's own STATE.md (7,624 words) is on the same curve. Candidate direction — four changes: writer-side shape enforcement in tools/lib/state.js; normative live-above-the-fold body skeleton in references/state-schema.md (resume pointer → in-flight → blockers → pending ops → one-line pointers to closed work); evict-on-close step in /sig:ship + /sig:checkpoint (closed-slice narrative moves to archive SUMMARY, one-line pointer stays); size warning in /sig:status + /sig:checkpoint over ~2K words live / 8K total. Companion to M4.5.E10's auto-update-protocol extension. Resolve by: next STATE.md-touching Epic (E10 is the natural host) or when a third project shows the same curve.

**Correction (2026-07-04, independent code-read).** Candidate change #1 above ("writer-side shape enforcement in `tools/lib/state.js`") aims at the wrong seam. STATE.md has *two* writers: (A) the CLI helpers in `tools/lib/state.js`, which are clean by construction — `transitionPhase` only ever appends a `PHASE (date)` string to `completed_phases` (state.js:324); and (B) **agents editing STATE.md directly via Edit/Write**, which bypass state.js entirely. The cmmc pollution — a ~550-word prose blob living inside the `completed_phases` YAML list (frontmatter lines 11–65 of the specimen) — is a shape state.js cannot produce, so it arrived through writer (B). Enforcing shape in state.js therefore cannot catch it; the writer that needs policing never calls state.js. The one control that *does* see writer (B) is the existing `hooks/check-state-write.js` PreToolUse(Edit|Write) hook, which already intercepts **every** write to STATE.md (check-state-write.js:45–52) and today enforces a single narrow rule (retro-on-SHIP). That hook — not state.js — is the highest-leverage fix, and it makes the size tripwire (root cause #4) *preventive at write time* rather than only detective at `/sig:status` read time:

- **Hard-block (exit 2)** any `completed_phases[]` / `blockers[]` entry containing a newline or over a hard char cap — these fields have a machine shape, and multi-paragraph prose in them is never legitimate. This is what would have stopped the frontmatter pollution at write time. Reuse `parseFrontmatter` so the hook and the writer agree on shape.
- **Warn-but-allow (stderr + exit 0)** when the body crosses a word budget — a block on a soft heuristic risks wedging legitimate large writes, so warn at the moment prose enters and let it through.

The other three candidate changes (body skeleton in `references/state-schema.md`, evict-on-close in `/sig:ship` + `/sig:checkpoint`, size warning in `/sig:status`) all still stand — but they are read-time/convention controls that writer (B) can ignore; the hook is the only write-time enforcement point. Sequence the hook first; the rest is cleanup behind it. (Drafting the hook patch requires reading `tools/lib/retrospective.js`, where `checkProposedStateWrite` lives, to match its `{block, reason}` return shape.)

**Two refinements (2026-07-04).**

- **Migration-side fix (the acute-case root cause).** The 455KB downstream monster was seeded by the legacy migration, not by slow accretion: `upgradeStateFile` (state.js:177) inlines the entire old file as the new body — `` body = `${notice}\n\n${raw}` `` — and `writeStateFrontmatter` (state.js:411–416) then preserves it verbatim on every subsequent write, so nothing prunes it. Fix: on migration, **relocate the legacy body to a sibling `.planning/STATE-HISTORY.md`** and leave a one-line pointer in STATE.md's body, instead of inlining. This is distinct from the evict-on-close step above (that handles *new* closed slices; this handles the *one-time* legacy seed). Note it's downstream-specific — Signal's own STATE.md never migrated a legacy body, which is why it's ~59KB (7,624 words), not 455KB. Signal's own file still bloats via writer (B) accretion, just an eighth as fast and without the migration accelerant — the same curve, earlier on it.
- **Tier-aware budget.** The ~2K-live / 8K-total figure above should scale by PROFILE tier rather than being flat: a SKETCH project's STATE.md warrants a tighter ceiling than a FULL project mid-milestone. The hook can read `PROFILE.md` (as the phase commands already do) to pick the threshold; fall back to the flat default when no profile exists.

---

## Map drift-guard (v0.1.6 doc-integrity candidate)

**Status:** Logged 2026-07-13 via `/sig:add`.

Map drift-guard (v0.1.6 doc-integrity candidate). docs/map/index.html silently fell two releases behind — showed v0.1.3 while prod was v0.1.5, omitted all 26 agents + 21 skills (incl. ui-auditor), and carried stale "currently active" work-unit examples — because its refresh protocol is manual. Fix = a drift-GUARD, not a full regenerator and not a literal hook. Recommended: a small tools/ check that compares the map's listed commands/agents/skills + version stamp against the actual repo files (commands/*.md, agents/**/*.md, skills/**/SKILL.md, package.json version) and FAILS when the roster or version is stale/missing. Wire it two places: (1) the existing validator/test suite that must stay green — so a PR that adds an agent but forgets the map turns red; (2) a /sig:ship checklist line (the slot the old Curator step occupied). The guard checks roster membership + counts + version only — the one-line summaries, flag curation, vocab examples, tiers, rigor matrix, and calibrate simulator stay HAND-CURATED; it never auto-writes prose. Explicitly NOT a Claude Code hook (those fire on session/tool events; there is no "on version bump" event) and NOT a git post-commit hook (per-commit not per-version, unversioned, the Curator footgun — see DECISIONS 2026-07-13). Down-payment on M5 future /sig:index doc-runtime (the map footer already says structural rows will move to a future /sig:index). Fits the queued v0.1.6 doc-integrity guardrail batch, alongside the STATE.md write-hook guardrail. Deferred from building now to avoid colliding with the concurrent agent editing v0.1.6-REQUIREMENTS.md.

---

## **Dedicated test-sandbox project for Signal QA.** A commi...

**Status:** Logged 2026-07-17 via `/sig:add`. Surfaced 2026-07-17 during M5.E2 S4.t1 dogfood — verifying a live 28-move migration on the real repo took ~6 introspection passes; a curated sandbox would make it a glance.

**Dedicated test-sandbox project for Signal QA.** A committed, browsable fixture project — one `.planning/` corpus deliberately seeded with every situation Signal's commands must handle plus edge cases (closed Epics with and without retros; un-sectioned body bloat; append-logs like `DECISIONS.md`; milestone bloat; dangling / anchor / reference-style / HTML links; CRLF; non-standard and linear layouts; unstamped-but-conformant; pre- and post-reorg) — that any `/sig:` command (especially `/sig:migrate-memory`) can be run against and diffed.

Purpose: fast human QA + faithfulness eyeballs, demos, onboarding, and regression — instead of "go read 10k lines of markdown and tell me if it's good." Complements the inline per-shape test fixtures (which prove the code) with something a human can open and reason about. Sibling to `examples/url-shortener/`, deliberately isolated from Signal's real `.planning/`. Candidate framing: its own small M5 Epic.

---






*Last updated: 2026-07-17*