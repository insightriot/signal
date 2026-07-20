# Backlog

Groomed, sequenced roadmap — promoted from the issues inbox (`ISSUES-INBOX.md`). Roadmap-vs-hygiene is a **Tag** on each entry, not a separate file (**roadmap** = new capability / direction; **hygiene** = maintenance, trust-hardening, doc/tooling cleanup). Sprint clusters are the sequencing spine; within a sprint, order is listed where it matters.

> **Source.** Restructured from the point-in-time backlog pass `BACKLOG-REVIEW-2026-07-04.md`, now archived at [`archive/BACKLOG-REVIEW-2026-07-04.md`](archive/BACKLOG-REVIEW-2026-07-04.md) (move-never-delete — the snapshot is frozen; this file is its living successor). The snapshot's added items (A1–A5), sharpened items, and sprint clusters are folded in below.

## Since the snapshot — what shipped (reconciliation, 2026-07-19)

The snapshot was captured 2026-07-04; four of its clusters have since closed or opened as real Epics. Condensed here so the living list below carries only still-open work (the full snapshot is archived, nothing lost).

- **Sprint 0 — Close the loop outward:** the M5 usage-signal gate was **lifted 2026-07-15** (4 non-Signal users onboarded, positive reception); M4.5 formally closed. Ongoing tester feedback folds in as it arrives. The deliberate second-dogfood hedge (**A2**) is no longer blocking — it can run opportunistically for extra signal.
- **Sprint 1 — Trust hardening: shipped.** `/sig:resume` Epic-prefix resolver + origin-drift detection + capture-pipe guards + SessionStart-resume hook smoke test (**v0.1.5 / M4.5.E10**); STATE-frontmatter write-guard + drain-convergence + `/sig:add` footer/title guards (**v0.1.6**). Also landed: STATE per-command refresh across the non-EXECUTE commands, `references/hooks-api.md`, `/sig:doctor` upgrade diagnostics (**A4**), and the standing trigger **WATCHLIST** (**A1**, now living in `ISSUES-INBOX.md`).
- **Sprint 3 — Memory & doc-runtime: in progress.** Canonical doc-model + STATE/inbox eviction (**M5.E1**), auto-sensing `/sig:migrate-memory` (**M5.E2**), and the living `BACKLOG.md` + auto `/sig:index` + all-docs hygiene + append-log eviction (**M5.E3**, in flight). Residual items are carried below.
- **Epic-native flow** (committed 2026-07-05, not a 2026-07-04 cluster) shipped as **v0.1.7 / M4.5.E11** — `--epic` first-class + per-Epic calibration.

Still-open roadmap follows, in sprint sequence.

---

## Sprint 2 — Re-aim the map *(research; gates the v2-port arc)*

The v2 vision predates M4.5 and is stale; every item here is "look before designing." Output re-sequences Sprints 3–7. Sequence: parity audit first → compound audit + traversal spike in parallel → roadmap refresh last.

### Feature-parity + landscape re-audit → `SIGNAL-INTEGRATION-RUNDOWN-v2.md`
**Tag:** roadmap
Feature-parity audit across all inspiration repos → a *sequenced* Epic queue in a fresh `SIGNAL-INTEGRATION-RUNDOWN-v2.md` (only the `-SEED.md` exists today; the re-audit should verify it fresh and supersede it). This is M5's locked opening move (BR-8) and gates the speculative v2 feature ports.

### Compound-engineering implementation audit
**Tag:** roadmap
Study compound-engineering's post-ship memory loop before designing `/sig:compound` (Sprint 4). Explicitly gates that design.

### Traversal-artifact decision spike
**Tag:** roadmap
One spike with a recommended default — **hierarchical markdown intent layer wins; graph is a later opt-in** (plain markdown in git is load-bearing; graphify adds a Python dep that dents the <5-min-install target). Run the installed `intent-layer` skill on one large repo, decide, and close the three circling entries (graphify / graph-only / Intent-Layers reframe).

### Vocabulary attribution sweep
**Tag:** hygiene
~45-min accuracy pass reconciling attribution across the analysis docs; bundled per its own note.

### Re-source the stale external claims
**Tag:** hygiene
Verify the path-scoped-skills frontmatter claim and re-source the "5 CC tools" claims against current Claude Code docs (both flagged ⚠ in their entries — can't be trusted at face value).

---

## Sprint 3 (residual) — Memory & doc-runtime *(the rest of the flagship)*

The structure half (doc-model, eviction, migrate, index, hygiene) is shipping as M5.E1–E3. What remains is the maintenance-command half.

### `/sig:sweep --docs / --code` — periodic hygiene sweep
**Tag:** roadmap
New command (name resolved from the `/sig:audit` collision, BR-1); absorbs the old `/sig:doc-review` (stale indexes, drifted CLAUDE.md, `[FILL IN]` stubs, stale inbox) plus a Dreaming-style inbox-curation pass. `/sig:audit` keeps the readiness scorecard (Sprint 5). Confirmed not yet built.

### Passive `OBSERVATIONS.md` capture
**Tag:** roadmap
A passive Stop-hook that captures observations to `OBSERVATIONS.md`, composing with E9's retro loop; drained by `/sig:checkpoint` and SHIP.

### CLAUDE.md de-bloat + command-frontmatter freshness
**Tag:** hygiene
De-bloat test for CLAUDE.md + a command-frontmatter freshness check — both are `--docs` sweep instances (build once the sweep command exists). (Index-freshness + link-health from workstream #4 are largely absorbed into M5.E3 FR3/FR4.)

### `docs/map` refresh protocol — Stage 1
**Tag:** hygiene
One checklist line in `commands/ship.md` to keep the public `docs/map` fresh at Epic close. (Stages 2/3 are parked below.)

### Concurrency-lock the doc-runtime RMW paths *(deferred from the 2026-07-19 memory-layer review)*
**Tag:** hygiene
The unlocked read-modify-write paths — `checkpoint.js` (`captureCheckpointContext`), `drain.js` (`promoteDrainEntry`, `evictTerminalToLedger`), `retro-index.js` (`regenerateIndex`, `generateMilestoneMetaRetro`), `planning-index.js` (`regeneratePlanningIndex`) — are torn-write-safe (`atomicWrite`) but have no compare-and-swap/lock, so two *concurrent* writers could lost-update. **Low priority:** these are orchestrator-only (wave-executors never call them) so single-session writes are sequential, and the one file parallel executors contend on — `STATE.md` — is already locked (`.state.lock`). It only defends concurrent **cross-session** writes on one repo, a mode Signal discourages. **The naive "just reuse `file-lock.js`" fix is unsafe:** `migrate-memory.js:2375` calls `regeneratePlanningIndex` *inside* `applyMigrate`'s coarse `.state.lock`, so making that function self-lock re-enters the non-reentrant lock and deadlocks migrate (the documented §9 hazard). Safe version = the established migrate pattern: split each locked entry into a lock-free core + a self-locking wrapper, lock only true command entries, keep inner helpers (`backlog.js`, `applyDispositionToFile`) lock-free. ~4-module refactor + tests; reuse `tools/lib/file-lock.js`.

---

## Sprint 4 — Compounding replay *(closes the "ship and forget" gap)*

Input (retros) and output (context injection) are both already-shipped surfaces; this is the mechanism that connects them. Substrate is **per-repository** (locked 2026-07-15 — org-wide learning is an opt-in analysis on top, not a Signal primitive). Prefers Sprint 3's queryable substrate first.

### `/sig:compound` phase — design + build
**Tag:** roadmap
Shape set by Sprint 2's compound-engineering audit. The post-ship memory phase.

### Retro *replay* into the next Epic's DISCUSS/PLAN
**Tag:** roadmap
E9 built retro *capture* only; the gap (named in the very first inbox entry) is surfacing captured learnings into the next Epic's DISCUSS/PLAN context.

### Cross-Epic pattern detection
**Tag:** roadmap
Detect recurring patterns across `RETROSPECTIVES.md` over time.

### Evaluate gstack's `/retro` + `/learn` port
**Tag:** roadmap
Assess porting gstack's retro + learn loop as part of the compound phase.

---

## Sprint 5 — Cockpit & interaction surface *(the new command surface)*

The entries themselves say report/orient/audit/goal share validator/README/manifest overhead and should co-ship. Thematically: how the human sees and steers Signal. Sequence: harness → report+orient → audit → breadcrumb → agenda → goal.

### Slash-command testing harness (A5)
**Tag:** hygiene
Promoted from OPEN-QUESTIONS (its "resolve by MILESTONE-4" is overdue). Command markdowns have zero mechanical coverage; this sprint mass-adds commands, so the harness lands first.

### `/sig:report` + `/sig:orient` (co-ship)
**Tag:** roadmap
Shared helpers + shared plain-English mapping tables (phase→plain-English, tier→plain-English — build once, reused by the audience-technicality dial in Sprint 6).

### `/sig:audit` — engineering-readiness scorecard
**Tag:** roadmap
6 dimensions, tier-weighted (the older, more-developed spec; keeps the `/sig:audit` name after the BR-1 split). Its rubric wants A2's second-project data to escape the sample-of-one problem.

### Status-line breadcrumb
**Tag:** roadmap
A statusline script reading STATE.md frontmatter (`current_epic` / `current_wave` / `last_completed_task`) rendering e.g. `M5 › E3 › S6b (EXECUTE)`; tier-gated display depth. One verify step first: confirm Claude Code's statusline-config API surface.

### Pre-scoped DISCUSS agenda
**Tag:** roadmap
A multi-select checklist that pre-scopes the DISCUSS agenda.

### `/sig:goal` wrapper
**Tag:** roadmap
Last — its own entry wants 5–10 real `/goal` runs before wrapping.

---

## Sprint 6 — Calibration depth *(data-gated; needs real usage evidence first)*

All four extend the calibration layer's expressiveness and are gated on real-usage evidence in their own entries. Bundled to keep PROFILE.md schema churn to one release. Lead is likely Option C (most specific watch-signals).

### Option C — concern weighting
**Tag:** roadmap
Primary/secondary/tertiary concerns modulating the 10 calibration dials (the entry's own confirmed lean).

### Audience-technicality dial
**Tag:** roadmap
A property of the person, not the project — lives at user level (a `communication` block in user-scoped config) with an optional per-project PROFILE.md override, read by every command via a shared output-shaping preamble. Reuses Sprint 5's plain-English mapping tables.

### Multi-feature lifecycle remainder
**Tag:** roadmap
Per-feature PROFILE.md override + a `features[]` block + feature-aware status/resume. E6 already answered the single-project tracking half; gate this remainder on second-dogfood (A2) evidence.

### Tier-count validation
**Tag:** roadmap
Are 4 tiers (SKETCH / FEATURE / SPIKE / FULL) the right number? Checked against real calibration runs (OPEN-QUESTIONS watch-item).

---

## Sprint 7 — Framework ports *(M5's remaining ports, re-sequenced by Sprint 2)*

The ports MILESTONE-5.md enumerates; what's new is ordering discipline — Sprint 2's parity audit decides the actual sequence. Prefer after Sprint 3 (ports land into the wiki structure). The command harness (A5) must exist first.

### `/sig:docs-update` — GSD port
**Tag:** roadmap
Tactical, fully spec'd, independent of the 10-phase work — can lead the sprint or pull forward.

### Upstream phases — IDEATE / VALIDATE / STRATEGIZE + the PREPARE seam
**Tag:** roadmap
The v2 upstream-phase skeleton + the PLAN→EXECUTE (PREPARE) seam decision, folding in PREPARE's ODI job-map analysis. Snapshot slotted this as M5.E1; M5.E1 was since repurposed to the doc-runtime flagship, so this re-enters the queue via the Sprint 2 re-audit.

### Security upgrade — gstack's 15-phase audit
**Tag:** roadmap
Deepen REVIEW toward gstack's 15-phase security audit.

### Harder TDD — superpowers TDD + `<HARD-GATE>` + systematic-debugging
**Tag:** roadmap
Port superpowers' stricter TDD, the HARD-GATE mechanism, and systematic-debugging.

### Context-discipline hooks
**Tag:** roadmap
Hook-driven context discipline (planning-with-files lineage).

### Multi-runtime adapters
**Tag:** roadmap
Cursor / Codex adapters — last; least evidence of demand.

---

## Parked — the trigger watchlist *(not sprint material)*

These stay trigger-gated; the standing **WATCHLIST** entry (A1) in `ISSUES-INBOX.md` checks their promote-back conditions at every `/sig:plan` drain. **Tag:** hygiene (except the PREPARE-phase item, which is roadmap).

- **E1 Slices 3–5** — Linux/WSL install matrix + versioning policy + validator hardening. *Trigger:* a platform tester volunteers.
- **E3 contribution scaffolding** — *Triggers:* a/b/c in its entry.
- **Synthesizer validator-side check** — *Trigger:* 2+ regressions by 2026-08-23 (**dated — expires unobserved without the watchlist**).
- **`/sig:doctor` helper-script split** — deferred refactor.
- **`docs/map` Stages 2/3** — the deeper map-refresh protocol.
- **GitHub Issues full setup** — *Trigger:* first live external tester (already fired: onboarding began 2026-07-15).
- **PREPARE-phase early-promotion triggers** *(roadmap)* — 3 conditions; can also fire from lived signal ahead of the upstream-phases work.
- **STATE auto-update Options B/C** (git hook / compute-on-read) — *Trigger:* Option A discipline demonstrably fails.

*Last updated: 2026-07-19*
