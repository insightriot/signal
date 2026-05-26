# Retrospective Templates

> Per-tier templates for Epic-close retrospectives, enforced by Signal's SHIP phase (M4.5.E9). One `RETROSPECTIVE.md` is required per Epic — written when SHIP closes the last unshipped slice — and SHIP will hard-block until it exists and passes `validateRetroContent`. The block lives at `commands/ship.md` FR1 pre-check (M4.5.E9.S1.t6) and is mirrored by hooks (`hooks/check-state-write.sh`, `hooks/warn-dirty-execute.sh`).

## How to use this file

1. **Find your tier.** Read `.planning/PROFILE.md`; the `tier:` field is your tier (SKETCH, FEATURE, SPIKE, or FULL).
2. **Find the matching section below.** Each tier has an explainer + a copy-paste-able template block.
3. **Copy the template block** (the literal text between `<!-- TEMPLATE: {TIER} -->` and `<!-- /TEMPLATE: {TIER} -->`) into a new file at `.planning/M{milestone}.E{N}-RETROSPECTIVE.md` (for partial-Epic shapes like M4.5.E9, use the exact Epic ID).
4. **Fill in every section.** A heading with an empty body fails `validateRetroContent` just as hard as a missing heading. `[FILL IN]` markers are allowed for stub backfills (the FR4 backfill mechanism in M4.5.E9.S1.t9 generates these), but a real Epic-close retro must replace every `[FILL IN]` with substantive content.
5. **Section headings are exact-string locked.** Do not rename, abbreviate, or reorder them — `validateRetroContent` does exact-string matching against the headings listed in this file (per `tools/lib/retrospective.js` `getRequiredSections(tier)`). If you need to add extra sections beyond the locked set, add them after the locked ones with any heading you like; the validator ignores unknown headings.
6. **Tier-specific minimum byte thresholds apply.** The validator additionally checks total content size. The threshold is `template_floor + ~150B × required_section_count` (final values measured + wired in M4.5.E9.S1.t11). A retro that's just headings + one-word bodies will fail; aim for at least a couple of sentences per section.

If your Epic produced no substantive learning in a given category, write that. *"Nothing surprised us — the plan held."* is a valid section body. What's not valid: skipping the section, or writing `[FILL IN]` in a non-stub retro.

---

## SKETCH tier — 3-question stub

Use this template when your project's `PROFILE.md` `tier:` is `SKETCH`. SKETCH is the smallest-ceremony tier — throwaways, scripts, one-shots — so the retro is correspondingly small. Three questions; aim for one short paragraph each.

**Section headings (locked, exact-string match required):**

1. `## What worked`
2. `## What didn't`
3. `## Feed back into Signal`

**Examples of well-filled sections:**

- **What worked:** *"Single-task plan was right; the 30-LOC script didn't need waves. SKETCH's auto-skip of REVIEW saved ~10 minutes vs running it for no signal."*
- **What didn't:** *"Spent 15 minutes hand-rolling argument parsing before remembering `process.argv` exists. Harmless but embarrassing."*
- **Feed back into Signal:** *"Could SKETCH's CONTEXT.md include a short 'stdlib reminders' section per language? Or a skill that nudges 'don't reinvent process.argv'."*

**Copy-paste starter** (the literal text between the markers below):

<!-- TEMPLATE: SKETCH -->
## What worked

[FILL IN — one short paragraph on what went smoothly or unexpectedly well]

## What didn't

[FILL IN — one short paragraph on friction points, dead ends, or wasted effort]

## Feed back into Signal

[FILL IN — one short paragraph on what Signal itself could change to make the next SKETCH Epic smoother]
<!-- /TEMPLATE: SKETCH -->

---

## FEATURE tier — medium template

Use this template when your project's `PROFILE.md` `tier:` is `FEATURE`. FEATURE is the most common landing zone for production-shaped work that doesn't justify FULL-tier ceremony. Five sections; aim for a substantive paragraph each (a few sentences minimum).

**Section headings (locked, exact-string match required):**

1. `## Timeline`
2. `## What surprised us`
3. `## What we'd do differently`
4. `## What to feed back into Signal`
5. `## Links`

**Examples of well-filled sections:**

- **Timeline:** *"DISCUSS 2026-03-10 (1 hour) → PLAN 2026-03-11 (45 min, 2 researchers) → EXECUTE 2026-03-12 to 2026-03-14 (3 sessions, ~6 hours total) → VERIFY 2026-03-14 (30 min) → SHIP 2026-03-14. Wall clock 5 days; focused time ~9 hours."*
- **What surprised us:** *"The login form's email-validation regex shipped from 2019 was rejecting valid `+suffix` addresses. Caught in VERIFY by AC4 but it would have surfaced in production within hours."*
- **What we'd do differently:** *"Spawn a research agent on 'existing regex usage' before EXECUTE — would have caught the legacy pattern earlier and saved ~45 min of debugging."*
- **What to feed back into Signal:** *"PLAN's research-parallelism: 2 default at FEATURE may be one too few for any Epic touching existing user-facing flows. Consider a 'touches-user-flow' heuristic that bumps to 3."*
- **Links:** *"PLAN: `.planning/M3.E2-PLAN.md` · PR #47 · Commits `a1b2c3d..e4f5g6h` · VERIFICATION: `.planning/M3.E2-VERIFICATION.md`"*

**Copy-paste starter:**

<!-- TEMPLATE: FEATURE -->
## Timeline

[FILL IN — DISCUSS / PLAN / EXECUTE / VERIFY / REVIEW / SHIP dates + rough wall-clock and focused-time totals]

## What surprised us

[FILL IN — one or more concrete moments where reality didn't match the plan, positive or negative]

## What we'd do differently

[FILL IN — concrete process changes for the next FEATURE-tier Epic in this area]

## What to feed back into Signal

[FILL IN — what Signal itself (commands, skills, agents, defaults) could change to make the next Epic smoother]

## Links

[FILL IN — PR URLs, commit ranges, relevant artifact paths]
<!-- /TEMPLATE: FEATURE -->

---

## SPIKE tier — exploratory template

Use this template when your project's `PROFILE.md` `tier:` is `SPIKE`. SPIKE is the question-answering tier: the Epic exists to resolve uncertainty, not to ship production code. The retro is correspondingly focused on *what did we learn* and *what do we do with that*. Three sections; the middle one is binary-ish (yes/no/partially); the third must commit to a next action.

**Section headings (locked, exact-string match required):**

1. `## What we learned`
2. `## Did the spike resolve its question`
3. `## Next: build, abandon, or continue`

**Examples of well-filled sections:**

- **What we learned:** *"WebRTC works inside the corporate VPN only when both peers tunnel through the same egress. STUN-only fails for ~60% of the test peer matrix. TURN is required for general-population coverage."*
- **Did the spike resolve its question:** *"Partially. The original question was 'can we ship browser-to-browser without dedicated infra?' Answer: no for our population, yes for IT-managed devices. Surfaces a new question (build TURN ourselves or use Twilio?) the spike was not scoped to answer."*
- **Next: build, abandon, or continue:** *"Continue with a follow-on SPIKE Epic scoped to TURN-provider tradeoff (Twilio vs Cloudflare TURN vs self-host). Not 'build' yet — the cost question dominates the next decision."*

**Copy-paste starter:**

<!-- TEMPLATE: SPIKE -->
## What we learned

[FILL IN — the substantive findings; the new knowledge the team didn't have before the spike]

## Did the spike resolve its question

[FILL IN — yes / no / partially, with a one-paragraph explanation of why]

## Next: build, abandon, or continue

[FILL IN — one of those three verbs, plus a one-paragraph rationale. If "continue," scope the next spike. If "build," reference the next planning Epic. If "abandon," document the reason so it isn't re-litigated later.]
<!-- /TEMPLATE: SPIKE -->

---

## FULL tier — full template

Use this template when your project's `PROFILE.md` `tier:` is `FULL`. FULL is the highest-ceremony tier: long-lived, high-stakes, novel work where lessons compound across years. The retro is correspondingly thorough; aim for one or more substantive paragraphs per section. Eight sections; the anti-rationalization moment is structurally required (one is the floor; more are welcome).

**Section headings (locked, exact-string match required):**

1. `## Timeline`
2. `## What changed mid-flight`
3. `## What assumptions broke`
4. `## What surprised us`
5. `## What we'd do differently`
6. `## What to feed back into Signal`
7. `## Anti-rationalization moment`
8. `## Links`

**Examples of well-filled sections:**

- **Timeline:** *"DISCUSS 2026-05-25 (7 questions, 2 hours, 7 decisions locked) → PLAN 2026-05-25 (4 research agents, 19 tasks, 8-dim + Nyquist PASS) → EXECUTE 2026-05-26 to 2026-05-XX (Waves 1-5, ~XX hours) → VERIFY ... → REVIEW ... → SHIP. Wall clock: X days; focused time: ~XX hours."*
- **What changed mid-flight:** *"D-E9-8 (layered enforcement) emerged from PLAN-phase research, not DISCUSS. Hook research surfaced that SHIP-phase enforcement is structurally orthogonal to the motivating failure mode (context cleared before `/sig:ship` was invoked). We had to amend DISCUSS retroactively and add three mechanisms instead of one."*
- **What assumptions broke:** *"A1: assumed `PreSessionEnd` hook existed in Claude Code's public API based on prior reading of the Anthropic 2026-05-14 blog post. Hook-API verification (RESEARCH § 5) found it doesn't. The whole D-E9-8 layered-enforcement decision exists because of that broken assumption."*
- **What surprised us:** *"The dry-run gate (S1.t10) caught two real issues we hadn't anticipated — the partial-Epic handling for E1 and E2, and the commit-message vs path-filter signal asymmetry. Without that gate we would have shipped enforcement that immediately blocked every SHIP."*
- **What we'd do differently:** *"Run a hook-API verification research pass during DISCUSS, not PLAN. The ESCALATE-level finding in PLAN-research was load-bearing enough that surfacing it earlier would have saved a re-litigation of D-E9-3."*
- **What to feed back into Signal:** *"DISCUSS should add a 'motivating-failure-mode vs enforcement-locus alignment' question for any Epic introducing a new gate. The structural orthogonality finding generalizes — every enforcement decision should explicitly check 'does this fire in the scenario that motivated it'."*
- **Anti-rationalization moment:** *"At the PLAN gate we almost merged the dry-run gate (S1.t10) into S1.t9's acceptance criteria 'because it's the same task really'. We didn't, because M4.5.E6's D15 precedent specifically separated the dry-run-with-user-review from the actual write. The separation made the E9 dry-run catch the partial-Epic issue cleanly; folding them would have hidden it."*
- **Links:** *"PLAN: `.planning/M4.5.E9-PLAN.md` · VALIDATION: `.planning/M4.5.E9-VALIDATION.md` · Commits `b6c478a..XXXXXXX` · CHANGELOG entry [v0.1.X] (TBD)"*

**Copy-paste starter:**

<!-- TEMPLATE: FULL -->
## Timeline

[FILL IN — DISCUSS / PLAN / EXECUTE / VERIFY / REVIEW / SHIP dates + wall clock + focused-time totals + slice/wave summary]

## What changed mid-flight

[FILL IN — decisions, scope adjustments, or AMEND-level corrections that surfaced after DISCUSS lock. If nothing changed, say so explicitly.]

## What assumptions broke

[FILL IN — assumptions held at DISCUSS or PLAN that turned out to be wrong during EXECUTE. Use the assumption ID (A1, A2, ...) where applicable.]

## What surprised us

[FILL IN — concrete moments, positive or negative, where reality diverged from the plan]

## What we'd do differently

[FILL IN — concrete process changes for the next FULL-tier Epic in this area]

## What to feed back into Signal

[FILL IN — what Signal itself (commands, skills, agents, defaults, references) could change to make the next FULL-tier Epic smoother]

## Anti-rationalization moment

[FILL IN — at least one specific moment where the team almost rationalized away something important but didn't. Required for FULL tier. "We considered cutting X to save time but kept it because Y" shape.]

## Links

[FILL IN — PLAN / VALIDATION / VERIFICATION / REVIEW artifact paths, PR URLs, commit ranges, CHANGELOG entry]
<!-- /TEMPLATE: FULL -->

---

## Notes for `loadTemplate` implementers

The `loadTemplate(tier, baseDir)` helper in `tools/lib/retrospective.js` extracts the raw template block by reading this file and matching the markers `<!-- TEMPLATE: {TIER} -->` and `<!-- /TEMPLATE: {TIER} -->` (case-sensitive tier name in ALL CAPS). The text between those markers is returned verbatim, suitable for writing into a fresh `M{milestone}.E{N}-RETROSPECTIVE.md`. The marker lines themselves are stripped.

If `loadTemplate` cannot find both markers for the requested tier, it throws — do not silently fall back to a different tier.
