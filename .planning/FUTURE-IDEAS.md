# Future Ideas

Post-v1 architectural ideas for Signal itself — **distinct from `MILESTONE-4.md`**, which is specifically the "rundown v2" integrations (porting patterns from other repos).

This file is for evolutions of Signal's *own* mechanisms that surface during v1 build/use. Entries here are candidates for later milestones (v1.5 or v2), not committed work.

Append new ideas; promote to a milestone file when ready to build.

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
- `.planning/M4.5.E7-RESEARCH.md` § 5 (research synthesis explicitly amended to defer this).
- `.planning/DECISIONS.md` 2026-05-21 entry D-E7-3.
- `.planning/M4.5.E7-PLAN.md` § Slice 2 t8 (folds this entry into the Epic ship event per VALIDATION § Plan Refinements #1).

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

## ✓ SHIPPED — Plugin slug rename — `signal` → `sig` to remove `/signal:sig:*` namespace stutter

> **Shipped 2026-05-12 as M4.t19** (bundled with the marketplace install layout fix). Plugin slug is now `sig`; commands moved to plugin-root `commands/` (flat); brand "Signal" preserved everywhere user-facing. Original entry below for historical context.



**Status:** Logged 2026-05-02 during Milestone 4 wrap-up conversation. Daily papercut surfaced by user comparing autocomplete UX to GSD.

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

**Status:** Logged 2026-05-18 via `/sig:add`.

I wonder aloud at having a feature of Signal be a 'you are here' breadcrumb in status line - so somewhere in status line would be "M1>Wave2>T1..." etc. wise? feasible? I just find myself wondering where I am in the process alot of the time, and feels like status line would be a good place for that? thoughts?

---


## `/sig:resume` origin-drift detection (2026-05-19)

**Problem:** `/sig:resume` reads local `STATE.md` as the source of truth. If another machine shipped work to origin but the commit didn't touch `STATE.md`, `/sig:resume` orients against stale local state and the user re-plans work that's already done. Happened 2026-05-19: biz-machine Claude session shipped M4.5.E1.S2 Phase A as `f38187a` (no STATE.md touch); dev-machine `/sig:resume` next session re-planned the same Epic from scratch. ~90 min duplicate planning work.

**Enhancement:** at the start of every `/sig:resume` (and likely `/sig:status` + `/sig:checkpoint`):
1. `git fetch origin` (read-only, ~1 sec).
2. Compare `origin/<default-branch>` HEAD vs `STATE.md.last_updated_commit` (the field added in E6.S1).
3. If origin has commits the local STATE doesn't acknowledge:
   - Surface a banner: "⚠ origin has N commits since last STATE update. Recent commits: ... Consider `git pull` before continuing."
   - Highlight if any of the new commits touched `.planning/` files — that's strong signal another Signal session shipped work.
4. Do not block; surface drift, let user decide.

**Why E6 didn't catch this:** E6's staleness check compares `STATE.md.last_updated` against the most recent `.planning/` commit *on local main* (not origin). Catches the case where Signal commands didn't update STATE; doesn't catch the case where another machine's commits aren't yet pulled. Different failure modes.

**Scope:** small. Add helper `isStaleVsOrigin(baseDir)` to `tools/lib/state.js`; wire into `/sig:resume` + `/sig:status` + `/sig:checkpoint`. Tests: fixture where local STATE.md points at one commit but origin has 2 newer commits in `.planning/`.

**Slot:** likely a slice in M4.5.E1 S5 (validator hardening + tooling polish) or its own micro-Epic. Defer-or-promote decision at next planning session.

---

## `docs/map/index.html` — refresh protocol (auto-generated vs. manual sync)

**Status:** Logged 2026-05-24. Trigger: added the "Work-unit vocabulary" section to `docs/map/index.html` (commit `629b629`); the new section includes "currently active" lines (Milestone / Epic / Slice / Task) populated from STATE.md as of 2026-05-24. Without an explicit refresh protocol these lines go stale within days during active development — Task lines change daily during EXECUTE, Slice lines every few days, Epic lines every few weeks.

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

> Before opening the PR: if this Epic touched the work-unit vocabulary OR shipped a slice that should appear in `docs/map/index.html`, update the `VOCABULARY.hierarchy[].example` lines and the `<p class="meta">generated {date}</p>` header in `docs/map/index.html`. ~2 minutes; same edit pattern as updating CHANGELOG.

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
- **Should the `docs/map/index.html` footer's "refresh cadence" pointer link to this entry's permalink?** Currently links to `.planning/FUTURE-IDEAS.md § map-refresh-protocol`. Once promoted to milestone work, the pointer should update.

**Resolve by:**
- Stage 1 lands as part of M4.5.E3.S3 (governance slice) OR as a one-off micro-task after E3 ships. Either way, before E5 launch — strangers will see the map and they'll see "generated {old date}" as a quality signal.
- Stage 2 promotion-trigger: 3+ consecutive Epic ships where Stage 1's checklist was forgotten or skipped. Until then, manual is fine.
- Stage 3: never, unless Stages 1 + 2 both fail AND live freshness becomes a real user ask.

**Slot:** likely M4.5.E3.S3 (one-line checklist addition to `commands/ship.md`) or a standalone micro-task after E3/E8 close. Defer-or-promote decision when the next planning cycle runs.

---

*Last updated: 2026-05-24*
## STATE.md auto-update protocol — extend beyond EXECUTE waves

**Status:** Logged 2026-05-24. Trigger: hit during M4.5.E3 DISCUSS work. After E7 SHIP closed (commit `8723967`, 2026-05-23), `last_updated_commit` in STATE.md frontmatter stayed pinned at `8723967` across 5+ subsequent commits spanning E8 scaffolding, E3 DISCUSS lock, vocabulary updates, docs/map work, and E3 DISCUSS revision. The frontmatter was only refreshed by manual intervention after the user called it out as "a bug."

**Context.** E6 (v0.1.2, 2026-05-18) shipped the STATE.md auto-update protocol as part of resume reliability. The protocol fires during EXECUTE waves — `commands/execute.md` and the executor agent both write STATE.md frontmatter after each task commit. **DISCUSS, PLAN, REVIEW, and SHIP phases don't have the equivalent.** Phase-entry transitions update `phase:` and `completed_phases:`, but `last_updated_commit` and `last_updated` only refresh when an EXECUTE-phase task ships. Result: any work done during DISCUSS or PLAN — including the DISCUSS phase artifact commits themselves, vocabulary refinements, milestone-doc updates, scoping decisions — leaves the frontmatter pointing at the previous EXECUTE commit.

`/sig:checkpoint` exists as the manual escape hatch, but it requires conscious invocation. The protocol is only as good as the human remembering to run it; in practice, between-EXECUTE work accumulates silently.

**Symptom inventory** (cases the gap manifests):

| Case | Example | What goes stale |
|---|---|---|
| DISCUSS phase commits | Today: bc8b10b (DISCUSS lock), b4aa79b (DISCUSS revision) | `last_updated_commit`, `last_updated`, `last_decision_at` |
| PLAN phase commits | Plan artifact writes, validation refinements | Same fields |
| Out-of-flow doc edits | Vocabulary additions (`939ecf4` Tier, `7339b5d` Slice) | Same fields |
| Parallel-machine work | A peer commits from another machine without running EXECUTE | Same fields + origin drift |
| Manual SHIP polish | `[BREAKING]` flag tweaks, README cross-link audits | Same fields |

**Why it matters.** `/sig:resume` reads frontmatter as the authoritative re-orientation source. A frontmatter pointing 5 commits back means:

- Staleness banner correctly fires (good — the gap doesn't *hide*).
- But the recommended next action is computed against stale context.
- The contributor (human or AI) opening a fresh session sees "last commit: <some ancient hash>" and has to manually run `git log` to bridge — defeating the entire briefing contract `/sig:resume` is meant to provide.

The 2026-05-19 origin-drift incident already proved this class of problem produces ~90 min of duplicate work. Today's case is gentler (single machine, just intra-conversation freshness) but the failure mode is identical.

**Candidate direction.**

Three options, ascending cost:

### Option A — Extend the protocol to every phase command (lowest cost)

Each `commands/{discuss,plan,verify,review,ship}.md` ends its workflow with a "refresh STATE.md frontmatter" step, same shape as the executor agent's step 6 (write `last_updated_commit: <HEAD>`, `last_updated: <ISO now>`). One step appended to 5 command markdowns.

**Pros:** Localized change. Doesn't require a new tool. Each command knows when its work "ends" so the refresh happens at the natural transaction boundary.
**Cons:** 5 commands updated; risk of drift if one of them forgets. Doesn't cover out-of-flow doc edits (vocabulary commits, MILESTONE-x.md edits made outside any `/sig:*` command).

### Option B — Add a post-commit hook approach (mid cost)

A documented opt-in git hook (`.githooks/post-commit`) that runs `node tools/refresh-state.js` after every commit, regardless of which `/sig:*` command (if any) drove it. The script reads HEAD + current time and patches STATE.md frontmatter.

**Pros:** Catches every commit, including out-of-flow edits and parallel-machine sessions. No discipline burden on the user.
**Cons:** Git hooks are opt-in (each clone has to enable them via `git config core.hooksPath .githooks`). Not portable across IDEs (some don't trigger hooks the same way). Risk: hook running during a rebase or amend creates weird intermediate frontmatter writes.

### Option C — Compute on-read instead of writing on-commit (highest cost)

`/sig:resume` and `/sig:status` recompute "last commit" by calling `git log -1` at read time, never trusting a stored field. STATE.md frontmatter drops `last_updated_commit` entirely; staleness becomes definitionally impossible because there's no stored value to go stale.

**Pros:** Eliminates the gap class entirely. The frontmatter only stores fields that *can't* be re-derived (phase, current_epic, blockers).
**Cons:** Bigger schema change (`schema_version: 1` → `schema_version: 2`); breaks any external tooling that reads the field. Auto-migration logic needed. Decision-trail fields (`last_decision_at`) still need writing; only the derivable ones move to read-time.

**Recommended starting point.**

Option A as the minimum viable fix — append "refresh STATE.md frontmatter" to the 5 non-EXECUTE phase commands. Probably 1–2 hours of work + tests. Defers Option B / C until evidence shows discipline-based refresh keeps failing.

**Triage hint.** This sits between "Signal enhancement" and "resume-reliability bug." If it's a bug, it belongs in a release-hardening Epic; if it's an enhancement, it belongs after M4.5 closes. **Recommended:** treat as a P2 bug — slot into M4.5 as a fast follow on E6 (call it E6.S7 or a new mini-Epic) **only if a second instance happens** during M4.5's remaining work. Otherwise, ship as part of v0.1.3-or-later release-hardening pass once E5 launch posture is clearer.

**Source data.** STATE.md frontmatter, `commands/execute.md` step-6 protocol, `agents/executors/executor.md` task-completion step, `tools/lib/state.js` (writers + readers), `references/state-schema.md` (the contract definition). See M4.5.E6 SHIP artifacts in `.planning/` + commit `8723967` (E7 SHIP) for the most recent canonical example of the EXECUTE-only refresh in action.

## `/sig:resume` artifact-resolution doesn't recognize Epic-prefixed naming (`M4.5.E3-PLAN.md`)

**Status:** Logged 2026-05-24. Trigger: M4.5.E3 PLAN phase complete; in preparing for a context clear, observed that `/sig:resume`'s artifact-resolution table won't find `M4.5.E3-PLAN.md` and will degrade to a "Note: expected artifact for PLAN not found" line.

**Context.** `commands/resume.md` Step 3's resolution rules try three filename patterns for the current phase's artifact:

1. `{N}-{ARTIFACT}.md` for any `N` in `[1..9]` — numeric/GSD-style prefix (e.g., `1-PLAN.md`).
2. `{ARTIFACT}.md` — no-prefix simplified form (e.g., `PLAN.md`).
3. `{PHASE_NAME}-{ARTIFACT}.md` — literal-substitution (e.g., `PLAN-PLAN.md`).

Signal's actual convention since the Milestone/Epic vocabulary lock (`939ecf4`, `7339b5d`) is **Epic-prefixed**: `{epic-id}-{ARTIFACT}.md`. Examples shipped:

- `.planning/M4.5.E3-REQUIREMENTS.md`
- `.planning/M4.5.E3-RESEARCH.md`
- `.planning/M4.5.E3-PLAN.md`
- `.planning/M4.5.E3-VALIDATION.md`
- `.planning/M4.5.E7-PROGRESS.md`
- ... and every other M4.5.E* artifact

None of these match patterns 1, 2, or 3.

**Impact.** Every `/sig:resume` against a project mid-Epic hits the "expected artifact not found" path and skips the most useful briefing content — the task breakdown, slice status, or current-phase notes. The user has to manually `cat` the file to see what's planned. Briefing still works (tier + Epic + Vision + decisions + next-action all come from STATE.md + PROJECT.md + CONTEXT.md), but the artifact-content section that's supposed to make resume "rich" is empty.

This Epic (M4.5.E3) just shipped a 9-task PLAN.md, and `/sig:resume` won't surface a single task in the briefing without this fix.

**Staleness inventory** (cases the gap manifests):

| Artifact | File on disk | Resolver finds? |
|---|---|---|
| Epic PLAN | `M4.5.E3-PLAN.md` | ❌ no |
| Epic PROGRESS | `M4.5.E7-PROGRESS.md` | ❌ no |
| Epic VERIFICATION | `M4.5.E6-VERIFICATION.md` | ❌ no |
| Epic REVIEW | `M4.5.E6-REVIEW.md` | ❌ no |
| Epic SHIP | (would be `M4.5.E3-SHIP.md`) | ❌ no |
| Epic RESEARCH | `M4.5.E3-RESEARCH.md` | ❌ no (and resume doesn't yet load this) |
| Project-level | `PROFILE.md`, `STATE.md`, `CONTEXT.md`, `PROJECT.md` | ✅ yes (named directly) |

**Candidate direction.**

Extend the resolver to recognize a 4th pattern as the FIRST attempt (since it's the actual Signal convention now):

```
0. {state.current_epic}-{ARTIFACT}.md — Epic-prefixed (e.g., M4.5.E3-PLAN.md)
1. {N}-{ARTIFACT}.md for N in [1..9]
2. {ARTIFACT}.md
3. {PHASE_NAME}-{ARTIFACT}.md
```

Read `state.current_epic` from STATE.md frontmatter (already loaded for the briefing); if non-null, try the Epic-prefixed form first. Falls through to existing patterns for projects that don't use Epic-prefixed naming (legacy `.planning/` directories from M1-M4 used numeric prefixes).

**Scope of fix.**

- `commands/resume.md` Step 3 table — add the new pattern as bullet 0.
- `tools/lib/resume.js` (if the resolver lives there as helper code) — add the Epic-prefix branch.
- `tools/lib/status.js` `nextActionForPhase` — verify it doesn't share the same resolver bug. (Probably not — it computes the *next-phase recommendation*, not the artifact path.)
- Tests: one new vitest case asserting Epic-prefixed resolution works on a fixture project with `current_epic: M4.5.E99` and `.planning/M4.5.E99-PLAN.md` on disk.

**Cost estimate.** ~30 LOC change + ~25 LOC test = 1-2 hours including verification on M4.5.E3 (this Epic, mid-flight).

**Triage hint.** P2 — a real briefing-quality regression that hits every Epic-mid-flight resume call. Worth slotting into M4.5 as a fast-follow tooling fix if `/sig:resume` is run more than ~2-3 times before another release; otherwise, batch with a release-hardening tooling sweep. Either way, ship before any external launch where strangers might run `/sig:resume` on their own Signal-managed project. Related to `/sig:resume` origin-drift gap (also logged) — both are resume-reliability papercuts that compound to "the briefing doesn't actually brief."

**Source data.** `commands/resume.md` (resolution rules in Step 3); `tools/lib/resume.js` (if helper exists); existing `.planning/M4.5.E*` artifacts as proof of the convention; STATE.md `current_epic` field availability since schema_version 1 (M4.5.E6 ship).

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

**Source data.** `.planning/FUTURE-IDEAS.md` (this file, 16 live entries as of 2026-05-24); `.planning/MILESTONE-4.5.md` lines 60–71 (`/sig:add` Epic spec + S5 description); `commands/add.md` + `tools/lib/add.js` (input pipe implementation); conversation 2026-05-24 surfacing the gap.

---

## Codebase knowledge-graph as a Signal-managed artifact (graphify, graph-only)

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
