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

## `/sig:report` — narrative project report (separate from `/sig:status`)

**Status:** Logged 2026-05-03 during Tranche 4 wrap-up conversation. Gap surfaced when user wanted a "zoom out and tell me what we've done and what remains" view on a real Signal project.

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
- **Outstanding marker counts** — `[INFERRED]` / `[FILL IN]` across all artifacts (uses `tools/lib/walkthrough.js#countMarkers` already shipped in T4.8).
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

**Why log, not fix now.** New command means: new file in `.claude/commands/sig/`, new entry in validator's `REQUIRED_COMMANDS`, README mentions, MCP/skill descriptions registered, decision-tree viewer (`docs/map/index.html`) updated. Not huge, but not a one-line fix either. Bundle it as a Tranche 5 (or post-T4-polish) task with `/sig:status`'s tooling reused (`readProfile`, `readState`, `readOpenQuestions`, `nextActionForPhase`).

**Anti-rationalization to lock in early:**
- "Just add `--detailed` to `/sig:status`." — No. The one-screen rule is load-bearing for `/sig:status`. Adding flags that change its shape destroys the contract.
- "Read `cat .planning/*.md` does this already." — Reading 6+ files manually every time you context-switch back is exactly what `.planning/` exists to *prevent*. The synthesis is the value; the raw files are the substrate.
- "Make it write to a file so it can be shared." — Read-only, same as status. If sharing is needed, pipe stdout to a file. Mutating breaks the check-without-disturbing property.

**Resolve by:** next time the user runs a Signal project past EXECUTE and wants a zoom-out view, OR when promoting future-ideas to a tranche file. Likely Tranche 5 (alongside the multi-select pre-scoping work — both are conversational/UX upgrades to existing commands and could ship together).

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

Five dimensions map cleanly onto existing `/sig:init` scanner outputs — `/sig:audit` would consume the four `.planning/scan/*.md` files plus `LANDSCAPE.md` rather than re-running scanners. **One (security-model explicitness) doesn't have a clean scanner source today.** Two viable approaches: (a) light interview supplement using the T4.8 walkthrough pattern (3–4 targeted questions surfaced as 3+other), or (b) extend `quality-scanner` to detect security-relevant files (CSP headers, threat-model docs, security.md, dependabot config). Lean toward (a) for v1 of audit since the dimension is judgment-heavy by nature; (b) becomes worth it when a second new dimension also wants scanner-level signal.

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

- T4.13 (fixture tests, v0.1.1) is the only remaining Tranche 4 task; close that and ship v0.1.0 before opening new command surface.
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

**Resolve by:** v0.1.0 ships → first FEATURE-or-FULL tier brownfield adoption beyond Signal-on-Signal where the user post-`/sig:init` wishes they had a *"is this ready?"* answer → promote to a Tranche 5 sub-tranche slot. Likely co-ships with `/sig:report` since both are read-only synthesis commands and could share helper code in `tools/lib/`.

---

## `/sig:docs-update` — doc-vs-codebase drift verification (port from GSD)

**Status:** Logged 2026-05-12. Trigger: user hit project-doc drift in a real-world build — README/ARCHITECTURE claims no longer matched the codebase, a recurring failure mode across the user's projects. GSD has a mature subsystem for exactly this gap (`/gsd:docs-update` + 4 agents); Signal has nothing equivalent. v1 ships with a `documentation-and-adrs` skill that teaches *how to write docs*, but no command to *audit existing docs against code*.

**Context.** Project documentation drifts. A README written at project bootstrap describes a 3-endpoint API; six months later there are 12 endpoints, two have been renamed, one was deleted, and the README still claims the original three. ARCHITECTURE.md references a service layout that was refactored two refactors ago. This is a different failure than the drift `/sig:status` is designed to catch — `/sig:status` answers "where am I in the workflow"; this is "do my external-facing docs lie about the code." Signal's existing verifier agents (`verifier`, `integration-checker`, `nyquist-auditor`, `plan-checker`) verify code and plans against acceptance criteria, none verify docs against code.

GSD's `/gsd:docs-update` subsystem (4 agents, ~1200 lines of agent code + 1161-line workflow) is the most mature non-execution piece in GSD and the cleanest port candidate in the v2 queue. Worth pulling forward because doc-drift is a *cross-cutting* concern — it's not a phase, it's a periodic hygiene check that any tier above SKETCH benefits from.

**Scope of "docs" (locked).**

| In scope (the GSD nine) | Out of scope |
|---|---|
| README, ARCHITECTURE, getting-started, development, testing, API, configuration, deployment, contributing | `.planning/STATE.md`, `STATUS.md`, `TRANCHE-*.md`, `CONTEXT.md` — Signal-internal planning state has its own lifecycle (STATE.md is *meant* to drift; STATUS.md is regenerated by the Phase 2 deducer). Verifier must not touch these. |

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

**Resolve by:** promote to a Tranche 5 sub-tranche (suggest **5f. Tactical GSD ports — `/sig:docs-update`**) when (a) Tranche 4 closes with T4.13 shipped, AND (b) the user wants to address doc drift on a real Signal-managed project. Independent of the 10-phase v2 architecture work — this is a tactical port, not an architectural one, and can ship as a single sub-tranche before/alongside any of 5a-5e.

---

*Last updated: 2026-05-12*
