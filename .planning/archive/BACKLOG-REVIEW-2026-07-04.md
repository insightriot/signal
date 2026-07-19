# Backlog Review — Augment, Sharpen, Cluster (2026-07-04)

A full pass over Signal's future-work backlog: gaps filled, weak entries sharpened, everything clustered into sprints. **Planning artifact only — nothing here is implemented; every recommendation gets ratified (or overruled) at the next planning gate.** Sources read: `FUTURE-IDEAS.md` (all ~30 live entries), `MILESTONE-5.md`, `OPEN-QUESTIONS.md`, `MILESTONE-4.5.md` shelved items, `BUGS.md`, `CONTEXT.md`, `INDEX.md`, plus code-level verification of which "bug-flavored" entries are still open (`commands/resume.md`, `tools/lib/state.js`, `tools/lib/drain.js`, `state/config.json`).

## Context (grounded, not assumed)

- **Project:** Signal (market: SignalOS) — Claude Code plugin that calibrates engineering rigor per project tier (SKETCH / FEATURE / SPIKE / FULL) across a 6-phase workflow.
- **Users:** solo devs / small teams who want production-grade output from AI agents without over-engineering throwaways.
- **Stage:** v0.1.4 shipped; M4.5 build-complete. The one open M4.5 criterion is external: ≥3 non-Signal testers with feedback merged. Next build horizon is M5 (v2 ports + memory management).
- **Constraints:** solo maintainer; Node 22+; context budget (skills load on-demand); install < 5 min; macOS is the only verified platform; Claude Code is the primary runtime.
- **Backlog homes:** `FUTURE-IDEAS.md` (default landing zone), `MILESTONE-5.md` (v2 epics), `OPEN-QUESTIONS.md`, shelved slices in `MILESTONE-4.5.md`, `BUGS.md` (0 open).

---

## 1. Summary

**What was missing.** Five things, all traceable to the same root: the backlog is rich in *build ideas* but thin on the *machinery that decides when to build them*. Concretely: (a) ten-plus entries carry "promote when X happens" triggers that nothing tracks, so triggers can fire silently and ideas rot; (b) M5 is explicitly gated on usage signal, but the only planned source of usage signal is a stalled outward tester loop — there's no first-party fallback; (c) tester friction has launch assets but no defined path into `.planning/`; (d) `/sig:doctor` diagnoses installs but not upgrades, which is the likeliest breakage once testers are on a v0.1.x cadence; (e) the slash-command test harness deferred in OPEN-QUESTIONS ("resolve by Milestone 4") is now two milestones overdue, right before M5 multiplies the command surface.

**What got stronger.** Eight entries sharpened. The two half-baked `/sig:add` captures (status-line breadcrumb, technical-language dial) became concrete designs grounded in the existing STATE schema and calibration layer. A three-way name collision (`/sig:audit` twice + `/sig:doc-review`) got resolved into two commands with distinct jobs. The Memory & Doc-Runtime mega-entry was re-scoped against shipped reality (its workstreams #1+#2 shipped as E9; the entry still claims they don't exist). Three overlapping traversal-artifact entries collapsed into one decision spike with a recommended default. Two option-surveys (STATE auto-update, multi-feature lifecycle) became commitments.

**Shape of the plan.** Eight clusters. Sprint 0 (outward loop + usage-signal generation) and Sprint 1 (trust hardening → v0.1.5) run in parallel now. Sprint 2 (landscape re-audit) re-aims the stale v2 vision and gates everything after it. Then the M5 arc: Sprint 3 (memory & doc-runtime), Sprint 4 (compounding replay), Sprint 5 (cockpit/visibility commands), Sprint 6 (calibration depth), Sprint 7 (framework ports). Trigger-parked items move to a watchlist instead of occupying sprint slots.

---

## 2. Added items

Every addition traces to something already in the repo — no generic best-practice filler.

| # | Item | Why it's missing (grounded) | Value it unlocks |
|---|------|------------------------------|------------------|
| A1 | **Trigger watchlist** — a short `WATCHLIST` section (in FUTURE-IDEAS.md or its own small file) listing every parked entry's promote-back condition, checked as a step in the existing `/sig:plan` drain | 10+ entries define concrete promote-back triggers that nothing evaluates: synthesizer check ("2+ regressions by 2026-08-23" — a *dated* trigger that will expire unobserved), map-refresh Stage 2 ("3+ forgotten Epic ships"), doctor helper split, E3 contribution scaffolding (triggers a/b/c), GitHub Issues ("live users"), PREPARE phase (3 conditions), Option C concerns (3 signals), graphify promote-back. The E2.S5 drain surfaces entries as candidates but doesn't check conditions — the exact "quiet decay" failure the drain-process entry names | The parked half of the backlog becomes self-monitoring. Cheap: one section + one drain step; no new command |
| A2 | **Second dogfood project** — deliberately run Signal end-to-end on a real non-Signal codebase (greenfield, FEATURE-tier) | `MILESTONE-5.md` is gated on "v1 shipping to actual users … without usage signal, v2 additions are speculative." The only planned signal source is the outward tester loop, which is stalled in Brett's hands. Meanwhile ~15 entries have "resolve by: real usage" conditions, and the `/sig:audit` entry admits its rubrics are "calibrated against a sample of one" | First-party usage signal not blocked on strangers. Directly tests the multi-feature-lifecycle scope, the tier-count open question, and every "resolve by real usage" trigger |
| A3 | **Tester-friction intake protocol** — one page: friction-log/email/Issue → triage → `BUGS.md` or `FUTURE-IDEAS.md` via `/sig:add`; flip on the GitHub Issues checklist (already written in the deferred entry) when the first live tester lands | `M4.5.E5-LAUNCH-KIT.md` §3 says "capture friction → v0.1.(N+1) backlog" but nothing defines how external input becomes `.planning/` entries. `BUGS.md` discipline and `/sig:add` are maintainer-only; the Issues entry has the adoption checklist but no connection to the launch-kit loop | The M4.5 exit criterion ("feedback merged") gets a mechanism, not just an intention. Prevents tester feedback dying in an inbox |
| A4 | **Upgrade-path diagnostics in `/sig:doctor`** — detect version drift: installed plugin version vs marketplace pin vs the `.planning/` schema of an in-flight project | E8's `/sig:doctor` covers 5 *install* failure modes; E6 shipped STATE `schema_version` auto-migration. Nothing checks the upgrade seam, and the Memory entry itself flags "`/sig:upgrade` vs `/sig:migrate-memory`" as an open question. Testers arriving on a v0.1.x release cadence will upgrade mid-project — the likeliest first-contact breakage `/sig:doctor` can't currently see | Upgrades stop being a blind spot right when external users start hitting them |
| A5 | **Slash-command testing harness** (promoted from OPEN-QUESTIONS into the sprint plan) | The OPEN-QUESTIONS entry says "Resolve by: MILESTONE-4" — two milestones overdue. Its own rationale: "couples to the v2 architecture additions (more commands → more surface to verify mechanically)." 777 tests cover tooling; zero cover command markdowns. Sprints 5 and 7 below add 6+ commands | The M5 command explosion lands on a harness instead of on manual dogfood-only coverage |

---

## 3. Sharpened items

| Before | After | Lens | Why it's better |
|--------|-------|------|-----------------|
| **"I wonder aloud at having a"** — truncated two-sentence capture wishing for a "you are here" breadcrumb in the status line | **Status-line breadcrumb, concretely:** a small script wired into Claude Code's statusline setting that reads `STATE.md` frontmatter and renders `M4.5 › E5 › S2.t5 (EXECUTE)`. Everything needed already exists: `schema_version: 1` carries `current_epic`, `current_wave`, `last_completed_task`; verified no statusline integration exists today. Tier-gate display depth (SKETCH: phase only). One verify step first: confirm the statusline-config API surface against current Claude Code docs | Structural | A wish becomes a scoped ~half-day feature grounded in the shipped STATE schema, with the one real unknown (the statusline API) named as a verify step instead of an assumption |
| **"Signal should acclimate it's language to how technical the person is"** — raw spectrum idea, no home | **Audience-technicality as a calibration setting — but user-scoped, not project-scoped.** How technical Brett is doesn't change per repo; store the dial at user level (e.g. a `communication` block in `state/config.json`) with an optional per-project `PROFILE.md` override, read by every command's output-shaping preamble. Reuses the phase→plain-English and tier→plain-English mapping tables the `/sig:orient` entry already specs — build those tables once, share them | Architectural | Puts the knob at the right altitude (person, not project) and prevents 15 commands each inventing their own tone logic. Also converges two entries that were headed for duplicate reference tables |
| **Three overlapping command proposals:** `/sig:audit` readiness scorecard (2026-05-09), `/sig:audit --docs/--code` hygiene sweep (2026-06-04), and workstream #4's `/sig:doc-review` — two of them claiming the same name | **Two commands, distinct jobs.** `/sig:audit` stays the engineering-readiness scorecard (older, more developed spec: 6 dimensions, tier-weighted). The periodic hygiene sweep becomes **`/sig:sweep --docs/--code`**, absorbing `/sig:doc-review` (whose scope — stale indexes, drifted CLAUDE.md, `[FILL IN]` stubs, stale FUTURE-IDEAS — is a strict subset of `--docs`). Evaluate-readiness vs clean-drift is the honest boundary | Strategic | Kills a name collision before either ships, and merges three specs into two so the drift-cleaning logic isn't built twice |
| **Memory & Documentation Management mega-entry** — 4 workstreams, still claiming "SHIP has no retro step" and "no formal retro exists" | **Re-scope against shipped reality.** Workstreams #1+#2 shipped as E9 (SHIP retro gate + `RETROSPECTIVES.md` index, v0.1.3); the archive half of #3 was dogfooded 2026-06-05 (72→24 root files, `tools/archive-migrate.mjs`). Remaining scope = #3-active (wiki restructure of live docs) + #4 (doc-runtime), with the six ⚠ lessons from the archive dogfood folded in as design inputs — especially lesson 4 (link edits must key original→new path) and lesson 6 (assume the tree moves under you; dry-run + atomic apply) | Structural | The entry is the M5 flagship spec; letting it claim shipped work as open scope inflates M5 planning and violates the docs-accuracy norm. The corrected entry is roughly half the size and all of it is real |
| **Three entries circling the same question:** codebase knowledge-graph (graphify, graph-only) · Intent-Layers reframe in the "5 CC tools" review · graph integration inside workstream #4 | **One decision spike with a recommended default: hierarchical markdown intent layer wins; graph is a later opt-in.** Rationale from the entries' own constraints: "plain markdown in git is load-bearing" is a locked anti-rationalization; graphify means a Python dep that dents the <5-min-install target; the graph's unique value (relational queries) hasn't yet been felt on a real Epic. Spike = run the installed `intent-layer` skill on one large repo, decide, close all three entries | Strategic | Recommends instead of surveying. Three parked entries with a circular "which one?" become one time-boxed spike with a default that only flips on evidence |
| **STATE.md auto-update beyond EXECUTE** — three options (A: per-command refresh step / B: git hook / C: compute-on-read) surveyed, recommendation soft | **Commit to Option A now, and bundle it with origin-drift detection as one "resume trust" slice.** The two entries share a single failure mode — STATE points at a stale commit, `/sig:resume` briefs against the wrong reality (the documented 90-minute duplicate-planning incident) — and share test fixtures (`tools/lib/state.js` + fixture repos). Verified both are still open: no origin/fetch logic in `state.js`, no refresh step in the 5 non-EXECUTE commands. B/C stay parked behind a watchlist trigger ("Option A discipline demonstrably fails") | Structural | Bundling by failure mode instead of by file yields one coherent, testable slice; committing to A unblocks it from option-paralysis |
| **Multi-feature project lifecycle** — written 2026-04-23, several of its design questions since answered | **Prune to what's still open.** E6 answered the single-project tracking half (`current_epic` / `current_wave` / `current_task` shipped in schema_version 1). Remaining scope: per-feature `PROFILE.md` override, a `features[]` block, feature-aware `/sig:status`/`/sig:resume`. Gate design on evidence from the second dogfood project (A2) — its own "resolve by" line already says "first real attempt to add feature #2" | Structural | Halves the entry's apparent scope and gives it a concrete evidence source instead of a speculative design session |
| **PREPARE phase** (standalone entry) vs **M5.E1 upstream phases** (milestone epic) — two separate homes for the same conversation: what does the v2 phase skeleton look like? | **Fold PREPARE's ODI job-map analysis into M5.E1's design scope.** M5.E1 already re-cuts the upstream boundary (IDEATE/VALIDATE/STRATEGIZE); deciding the PLAN→EXECUTE seam (PREPARE) in the same design pass avoids re-opening the phase skeleton twice. PREPARE's three promotion triggers move to the watchlist so it can also fire earlier if lived signal arrives first | Strategic | One phase-decomposition conversation instead of two, without losing PREPARE's independent promotion path |

---

## 4. Sprint clusters

Clusters follow what the items themselves suggest: two immediate parallel tracks (outward loop, trust fixes), a research gate, then the M5 arc. "Sprint" = a coherent chunk Brett can take on its own; internal sequence listed where it matters.

### Sprint 0 — Close the loop outward *(mostly human work; runs now, in parallel with Sprint 1)*

**Items:** voice pass on the 3 launch drafts → recruit ≥3 testers (`docs/tester-brief.md`) → record the demo (`docs/demo-script.md`) (all from `M4.5.E5-LAUNCH-KIT.md` §3) · tester-friction intake protocol (**A3**) · GitHub Issues adoption checklist fires at first live tester (existing deferred entry) · kick off the second dogfood project (**A2**).

**Why together:** this is M4.5's only open criterion plus M5's gating condition. Every data-gated item downstream (calibration depth, tier count, audit rubrics, `/goal` wrapper) sharpens against what this sprint produces. A2 is the hedge: if tester recruiting drags, first-party dogfood still generates the usage signal M5 needs.

**Sequence:** voice pass → send briefs; A3 before the first tester replies; A2 anytime.
**Cross-cluster:** produces the evidence Sprints 2, 5, and 6 consume. Sprint 1 should ship before testers actually onboard (they'll run `/sig:resume` on day one).

### Sprint 1 — Trust hardening → v0.1.5 *(all small, all verified still open, shippable now)*

**Items:** `/sig:resume` Epic-prefix artifact resolution (P2 — verified: `commands/resume.md` still lists only the 3 legacy patterns, so every mid-Epic resume drops the plan briefing) · origin-drift detection (`isStaleVsOrigin` — verified absent from `state.js`; also a standing feedback norm) · STATE auto-update Option A across the 5 non-EXECUTE phase commands (sharpened bundle above) · drain dangling-fence guard (`drain.js` parses fences but doesn't warn on an unclosed fence at EOF) · FUTURE-IDEAS footer-drift guard in `add.js` · SessionStart-resume hook smoke test · `references/hooks-api.md` (pairs naturally with the smoke test) · upgrade-path diagnostics in `/sig:doctor` (**A4**) · establish the trigger watchlist (**A1** — one section + one drain step).

**Why together:** one theme — *the briefing and the capture pipe must be trustworthy before strangers arrive.* All are ≤half-day items with no M5 dependencies; together they're a credible v0.1.5.

**Sequence:** resume resolver → origin drift → STATE Option A (they share `state.js` and fixtures), then the two capture guards, then doctor/hooks items, watchlist last (it closes the sprint by parking everything that didn't make the cut).
**Cross-cluster:** ships before Sprint 0's testers onboard.

### Sprint 2 — Re-aim the map *(research only; gates the whole M5 arc)*

**Items:** feature-parity audit across all inspiration repos (the "M5 opening move" entry — its own recommendation is to open M5 with exactly this) · roadmap refresh → `SIGNAL-INTEGRATION-RUNDOWN-v2.md` with a *sequenced* Epic queue · compound-engineering implementation audit (explicitly gates `/sig:compound` design) · vocabulary attribution sweep (~45 min, bundled per its own note) · traversal-artifact decision spike (sharpened above; default = markdown intent layer) · verify the path-scoped-skills frontmatter claim against real Claude Code docs · re-source the "5 CC tools" claims (flagged ⚠ in the entry itself).

**Why together:** every one is "look before designing M5," and the backlog says outright that the v2 vision predates M4.5 and is stale. The audits close out the four ⚠-flagged entries that currently can't be trusted at face value.

**Sequence:** parity audit first (everything else feeds off it) → compound audit + traversal spike in parallel → roadmap refresh last (it synthesizes the rest into the M5 Epic order).
**Cross-cluster:** output re-sequences Sprints 3–7; better with early Sprint 0 signal but not blocked on it.

### Sprint 3 — Memory & doc-runtime *(M5 flagship build)*

**Items:** workstream #3-active — wiki restructure of live `.planning/` docs, applying the six archive-dogfood lessons · `/sig:migrate-memory` + `/sig:wiki-check` (dry-run, rollback, dangling-link verify per lessons 4/6) · workstream #4 — index freshness + link health wired into the validator and `/sig:doctor` · passive Stop-hook `OBSERVATIONS.md` capture (composes with E9's retro loop; drained by `/sig:checkpoint` and SHIP) · `/sig:sweep --docs/--code` (renamed per sharpening; absorbs `/sig:doc-review` and the Dreaming-style FUTURE-IDEAS curation pass) · CLAUDE.md de-bloat test + command-frontmatter freshness (they're `--docs` sweep instances) · `docs/map` refresh protocol Stage 1 (one checklist line in `commands/ship.md`).

**Why together:** the memory entry calls this "potentially Signal's biggest unlock," and everything here shares one thesis — persistent, structured memory beats grep + context bloat. The sweep/de-bloat/map items are the *maintenance* half of the same discipline the wiki is the *structure* half of.

**Sequence:** restructure → migration tooling → link health → observation capture → sweep command.
**Cross-cluster:** needs Sprint 2's traversal decision (indexes and graph/intent-layer must not be designed twice) and M4.5 formally closed (the entry's own constraint: interleaving restructure with active epics = merge hell).

### Sprint 4 — Compounding replay *(closes the "ship and forget" gap)*

**Items:** `/sig:compound` design + build (shape set by Sprint 2's compound-engineering audit) · retro *replay* — captured learnings surfaced into the next Epic's DISCUSS/PLAN context (E9 built capture only; the gap is named in the very first FUTURE-IDEAS entry) · cross-Epic pattern detection over `RETROSPECTIVES.md` · evaluate gstack's `/retro` + `/learn` port (M5.E2 line item).

**Why together:** this is M5.E2, and it's the other half of a mechanism Signal already half-built. Coherent on its own: input (retros) and output (context injection) are both already-shipped surfaces.

**Sequence:** audit findings → replay mechanism → pattern detection.
**Cross-cluster:** hard-depends on Sprint 2 (the audit); strongly prefers Sprint 3 first (the backlog's own sequencing note: v2 ports benefit from the wiki structure being in place — replay needs a queryable substrate).

### Sprint 5 — Cockpit & interaction surface *(the "new command surface" epic the backlog keeps predicting)*

**Items:** slash-command testing harness (**A5** — first task, since this sprint mass-adds commands) · `/sig:report` · `/sig:orient` (co-ship; shared helpers + shared plain-English mapping tables) · `/sig:audit` readiness scorecard · status-line breadcrumb (sharpened above) · pre-scoped DISCUSS agenda (multi-select checklist) · `/sig:goal` wrapper (last — its own entry wants 5–10 real `/goal` runs first).

**Why together:** the entries themselves say it four times over — report/orient/audit/goal "share validator/README/manifest overhead" and should co-ship. Thematically they're all *how the human sees and steers Signal*.

**Sequence:** harness → report+orient (shared code) → audit → breadcrumb → DISCUSS agenda → goal.
**Cross-cluster:** Sprint 0's usage data should prioritize which land first; `/sig:audit`'s rubric wants A2's second-project data to escape the sample-of-one problem. No hard dependency on Sprints 3–4 — this sprint can interleave if the M5 arc stalls.

### Sprint 6 — Calibration depth *(data-gated; do not start before Sprint 0 produces evidence)*

**Items:** Option C concern weighting (primary/secondary/tertiary concerns modulating the 10 dials — the entry's own lean, confirmed) · audience-technicality dial (sharpened above; shares the plain-English tables built in Sprint 5) · multi-feature lifecycle remainder (per-feature PROFILE override + `features[]`) · tier-count validation (OPEN-QUESTIONS watch-item, checked against real calibration runs).

**Why together:** all four extend the calibration layer's expressiveness, and all four are explicitly gated on real-usage evidence in their own entries. Bundling them keeps PROFILE.md schema churn to one release.

**Sequence:** whatever the evidence says first; Option C is the likely lead (its watch-signals are the most specific).
**Cross-cluster:** consumes Sprint 0/A2 evidence; the language dial reuses Sprint 5's mapping tables.

### Sprint 7 — Framework ports *(M5's remaining epics, re-sequenced by Sprint 2)*

**Items:** `/sig:docs-update` GSD port (tactical, fully spec'd, can lead the sprint or even pull forward — its entry says it's independent of the 10-phase work) · upstream phases IDEATE/VALIDATE/STRATEGIZE + the PREPARE-seam decision (M5.E1, per sharpening) · security upgrade to gstack's 15-phase audit (M5.E3) · superpowers TDD + HARD-GATE + systematic-debugging (M5.E4) · context-discipline hooks (M5.E5) · multi-runtime adapters (M5.E6 — last; least evidence of demand).

**Why together:** these are the ports `MILESTONE-5.md` already enumerates; what's new is the ordering discipline — Sprint 2's parity audit decides the actual sequence, and `MILESTONE-5.md`'s own note ("order should follow real user pain points") finally gets its input from Sprints 0–2.

**Cross-cluster:** after Sprint 2 (audit sets order) and preferably after Sprint 3 (ports land into the wiki structure). The command harness (A5) must exist before this sprint if it somehow runs before Sprint 5.

### Parked — the watchlist (not sprint material)

These stay trigger-gated; Sprint 1's watchlist (A1) is where their conditions get checked at every planning gate: E1 Slices 3–5 (Linux/WSL matrix — trigger: platform tester volunteers) · E3 contribution scaffolding (triggers a/b/c) · synthesizer validator-side check (trigger: 2+ regressions by 2026-08-23 — **dated; expires unobserved without A1**) · `/sig:doctor` helper-script split · `docs/map` Stage 2/3 · GitHub Issues full setup (fires in Sprint 0) · PREPARE early-promotion triggers · STATE auto-update Options B/C.

---

## 5. Ratification list (decisions this document recommends, for the next planning gate)

1. Rename the hygiene sweep to `/sig:sweep`; `/sig:audit` keeps the readiness scorecard. (Name collision must be resolved before either ships.)
2. Default traversal artifact = markdown intent layer; graph becomes opt-in later. (Closes three entries pending the Sprint 2 spike.)
3. STATE auto-update: commit to Option A, bundled with origin-drift as one slice.
4. Audience-technicality dial lives at user level with per-project override.
5. Correct the Memory & Doc-Runtime entry to reflect E9 having shipped workstreams #1+#2.
6. Adopt the trigger watchlist as a drain step (A1).
7. Start the second dogfood project as M5's usage-signal hedge (A2).

*Prepared 2026-07-04. Grounding verified same day: resume resolver, origin-drift, statusline, drain fence guard all confirmed open in source; BUGS.md at 0 open.*
