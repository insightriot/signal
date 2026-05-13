---
# ============================================================================
# MACHINE ZONE — agents write, humans don't edit by hand.
# Maintained by the deducer (Phase 2) on bootstrap and the compiler
# (Phase 3+) on subsequent reconciliations.
#
# Schema reference: CONVENTIONS.md → "STATUS.md schema" section.
#
# Placeholder syntax:
#   - "{{name}}" tokens in quoted scalar fields are filled by the renderer
#     using the project's portfolio.yaml entry, recent git activity, and
#     linked goal candidates.
#   - List fields (depends_on, related_to, used_by, blocks, contributes_to)
#     are seeded as [] and the renderer rewrites the full line from
#     portfolio.yaml + goal-candidate cross-references.
#   - last_human_update is intentionally absent at bootstrap. It is set by
#     the human reviewer when accepting/refining a deducer draft and is
#     never written by the deducer. The deducer's human-edit detection
#     rule treats its presence as one signal that the prose middle has
#     been touched (see CONVENTIONS.md → human-edit detection).
# ============================================================================

version: 1                          # STATUS.md schema version

project: "signal"           # matches portfolio.yaml id
parent: "brett"            # venture id
kind: "infrastructure"                    # product | infrastructure | utility | archive
state: "active"                  # active | maintenance | paused | shipped | killed
lifecycle: "build"          # exploration | validation | build | ship | maintain | continuous

# Cross-project edges — copied verbatim from portfolio.yaml at render time.
depends_on: []
related_to: []
used_by: []
blocks: []

# Goal linkage — confident matches use the {venture, target} object form;
# ambiguous candidates surface as {status: tbd, question: "..."} entries
# for the review pass to resolve rather than hide.
contributes_to:
  - venture: brett
    target: income_replacement
  - venture: brett
    target: exit_path
  - status: tbd
    question: Does Signal's role as personal infrastructure (methodology + tooling for
      all AI dev work) meaningfully accelerate `crowe_optionality_q3` (IR+TV revenue
      1.5x by Oct 1), or is the link too indirect to count?
  - status: tbd
    question: "Signal is tagged `personal-infra` and `methodology` \u2014 does it contribute\
      \ to `exit_path` ($100M exit) as a force-multiplier on other ventures, or only\
      \ incidentally?"

# Activity-related fields (last_agent_update, activity_signal,
# days_since_last_commit, metrics, delta) are intentionally absent at
# bootstrap — Phase 3's compiler is the sole writer.
---

# STATUS — signal

<!-- mps:section=focus owner=agent hash=867731b0 generated=2026-05-10T12:05:00Z -->
## Focus

Signal is a Claude Code plugin implementing a six-phase AI development workflow (`calibrate → discuss → plan → execute → verify → review → ship`) with a project-complexity calibration layer. It supersedes `dev-skills-gsd` (v0.7) and integrates patterns from GSD's execution orchestration and Agent Skills' quality enforcement. The core value proposition: a single `/sig:calibrate` command classifies work into one of four tiers (SKETCH / FEATURE / SPIKE / FULL) and every downstream phase self-tunes accordingly — so a 30-line throwaway script gets ~5 minutes of ceremony while a production service gets TDD, 4 research agents, an 8-dimension plan validation, and a full security audit.
<!-- mps:end -->

<!-- mps:section=current_sprint owner=agent hash=dac942ad generated=2026-05-10T12:05:00Z -->
## Current sprint

**Milestone 4 — `/sig:init` brownfield onboarding** is the active milestone (v2 ports pushed to Milestone 5). Milestone 4 is largely complete: all waves shipped (skeleton + pre-flight, 4 scanner agents, Steps 2–6 of `/sig:init`, brownfield path first-class across status/resume/calibrate/validator, README brownfield walkthrough, and tier-definitions brownfield patterns). The most recent commits wire `AskUserQuestion` into decision-gathering commands (M4.t17, 2026-05-05), add an interactive decision-tree viewer at `docs/map/` for Vercel (2026-05-02), and log a `/sig:report` future idea (narrative project report). A `BRAND.md` identity proposal was also added. 41 commits in the last 30 days; last commit 4 days ago.
<!-- mps:end -->

<!-- mps:section=next_actions owner=agent hash=1564d4da generated=2026-05-10T12:05:00Z -->
## Next 3 actions

- Complete any remaining M4 tasks (M4.t8 assumption-surfacing walkthrough in `/sig:init` Step 5 was queued; M4.t17 AskUserQuestion wiring landed 2026-05-05 — confirm M4 is fully closed)
- Decide whether to open Milestone 5 (v2 ports: pm-skills upstream phases, compound-engineering memory phase, gstack security audit, superpowers TDD, planning-with-files hooks) or address logged fix-nows first
- Evaluate the multi-select DISCUSS pre-scoping and plugin slug rename logged 2026-05-02
- Assess `/sig:report` (narrative project report) as a backlog item vs. near-term addition
- Verify `npm test` still reports 93+ passing after recent brownfield additions
<!-- mps:end -->

<!-- mps:section=decision_rules owner=human hash=015f6c39 generated=2026-05-10T12:05:00Z -->
## Decision rules (project-specific)

- Milestone 4 (brownfield `/sig:init`) takes priority over Milestone 5 (v2 ports) until M4 is fully closed.
- Calibration tier (SKETCH / FEATURE / SPIKE / FULL) is the single source of truth for per-phase rigor; no phase may override it without `/sig:escalate`.
- (low signal — needs human input; reviewer should expand)
<!-- mps:end -->

<!-- mps:section=blockers owner=agent hash=90086895 generated=2026-05-10T12:05:00Z -->
## Blockers / decisions needed

No hard blockers identified in source material. One deferred fix-now was noted during the M3 dogfood pass (2026-04-26: "14 fix-nows applied, 4 resolved, 1 deferred, 1 confirmed"). The deferred item's nature is not described in available material — needs human review. (low signal — needs human input)
<!-- mps:end -->

<!-- mps:section=deferred owner=human hash=4aa2f8f4 generated=2026-05-10T12:05:00Z -->
## Deferred (revisit after current phase)

- v2 ports (Milestone 5): pm-skills upstream phases, compound-engineering Compound memory phase, gstack 15-phase security audit, superpowers TDD enforcement, planning-with-files context-discipline hooks — all deferred until Milestone 4 closes.
- `/sig:report` narrative project report — logged as a future idea 2026-05-03, not yet scheduled.
- Multi-runtime adapter layer (Claude Code primary; other runtimes deferred).
- (low signal — reviewer should confirm deferred fix-now item from M3 dogfood)
<!-- mps:end -->

<!-- mps:section=links owner=agent hash=391e83c6 generated=2026-05-10T12:05:00Z -->
## Links

- Repo: `insightriot/signal` (GitHub)
- Integration analysis: `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`
- Interactive decision-tree viewer: `docs/map/` (Vercel)
- Brand identity proposal: `references/BRAND.md`
- Planning state: `.planning/` directory (in-repo)
<!-- mps:end -->

---

<!-- ========================================================================
     MACHINE ZONE — recent reality (auto-rewritten by the compiler).
     Empty at bootstrap; populated on first daily compiler run in Phase 3+.
     Do not edit by hand.
     ======================================================================== -->

## Recent reality

_Populated by the compiler on first daily run._
