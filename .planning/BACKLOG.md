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

## Since the re-audit — what M5.E7 changed (reconciliation, 2026-07-26)

**The BR-8 re-audit ran and closed** (Epic **M5.E7**, 2026-07-25→26). Deliverable:
[`../analysis/SIGNAL-V2-ROADMAP.md`](../analysis/SIGNAL-V2-ROADMAP.md). It gave **45 candidates a
verb** — **11 distinct builds** (+1 re-homed = **12 work items landed below**), 16 continue,
19 abandon — and the sprint list below is reconciled against it.
**Where a sprint entry and the roadmap disagree, the roadmap governs.**

Four rows below were also **shipped and never marked** (this file's stamp predated M5.E6's
2026-07-25 release); they are struck in place.

> ⚠ **`B39` applies to every trigger in this file.** The trigger-watchlist walk it describes
> **has never run** — `ISSUES-INBOX.md:1407` instructs `/sig:plan` to walk the conditions at each
> drain, and `grep -ril "watchlist" commands/ tools/` returns nothing. **Until M5.E9 lands, a
> trigger here is a note, not an enforcement.**

---

## The v2 roadmap — M5.E8 → M5.E12 *(sequenced; the enforcement half of the re-audit)*

Every `build` from the roadmap, landed here with its **trigger** and **first slice** so it is
tracked by a live doc rather than by a document nothing checks. Full rationale and citations live in
[`../analysis/SIGNAL-V2-ROADMAP.md`](../analysis/SIGNAL-V2-ROADMAP.md) — **single home; not restated
here.**

### M5.E8 — Measurement foundation
**Tag:** roadmap · **Trigger: NONE — unconditional next.** Gates M5.E10, E12, and four parked items.
The finding it answers: *Signal cannot detect whether its own interventions work, in any dimension*
(no test asserts a prompt instruction was obeyed; 7-of-12 adherence and a 7.12× output spread on
byte-identical code).
- **(a) Behavioral measurement.** *First slice:* one test on gstack's `carve-section-loading.test.ts`
  pattern (live model via the `claude -p` SDK) asserting a specific Signal command instruction is
  obeyed. *Done-when:* a stranger runs `npm test`, deletes that instruction line from the command
  markdown, re-runs, **and sees it fail.**
- **(b) Second-opinion replay** (reopened per D-M5E7-11). *First slice:* re-run REVIEW against the
  `B19` commit with a reviewer denied that Epic's own artifacts. *Done-when:* a one-page
  caught/not-caught result with the transcript.

### M5.E9 — Overdue enforcement + the bug pile
**Tag:** hygiene · **Trigger: NONE.** Independent of E8 — can run in parallel.
- **`B39` trigger walk.** *Slice:* one drain step in `commands/plan.md` + `tools/lib/drain.js`.
  *Done-when:* a fired trigger surfaces at `/sig:plan`, **and a checked-and-declined trigger is
  distinguishable from an unchecked one.**
- **EXECUTE dispatch guidance + worktree isolation.** Demand cluster F, rank 1 — 4 retro items,
  **0 hits across all four ledgers**, live incident during M5.E7. *Slice:* the executor rule
  (`git add <path> && git commit`, never `--amend`) + `isolation: "worktree"` per concurrent agent.
  *Done-when:* a stranger reads `commands/execute.md` and can tell whether two tasks are safe to
  dispatch simultaneously.
- **SHIP-time ledger reconcile.** *Slice:* a hygiene test asserting `BUGS.md` holds no `confirmed`
  bug whose fix already shipped. *Done-when:* it fails on a planted violation.
- **The 14 open bugs** — `B32`–`B36` (`needs-triage`), `B37`–`B45` (`confirmed`). Required by
  D-M5E7-10; **verified 2026-07-26 that no bug-squash sprint existed anywhere.** ***Slice 1 = the
  v0.1.12 release** (ratified 2026-07-27, **D-M5E9-2** — this Epic opens ahead of M5.E8):* **`B42`
  first** (the only `P1`), then the `state.js:388-395` cluster as **one commit** (`B43`+`B44`+`B45`),
  then **`B41`** — in that order, plus **one end-to-end test of a linear-mode project with a
  multi-unit history**. `B36`, `B39` and the rest of this Epic are **later slices, not v0.1.12**.
  *Done-when (Slice 1):* `/sig:ship` completes on a project with `current_epic: null`, and a
  multi-unit `completed_phases` survives a `transitionPhase` call intact. *Done-when (Epic):* zero
  `confirmed` P1/P2 entries remain. **`B42`'s shape is settled — D-M5E9-1: the FR1 retrospective gate
  is Epic-only, and a linear-mode project owes no retro at SHIP.** The declined alternative (build a
  milestone-scoped retro path for linear projects now) stays open as its own later decision.
  **`B41` was cataloged by M5.E7 REVIEW (2026-07-26)** and belongs here rather than in M5.E8: four
  phase commands never call `transitionPhase`, so `completed_phases` omits PLAN/EXECUTE/VERIFY/REVIEW
  in any command-driven project while `markFresh` stamps the stale position fresh. **Deterministic and
  file-shaped — it needs no measurement layer**, which is exactly the rule §1 of the roadmap sets.
  **`B42`–`B45` were cataloged the same day from a live `nextpass` ship report.** `B42` stands alone:
  **linear mode is first-class in six phase commands and unsupported in the seventh** — `/sig:ship`'s
  FR1 gate hard-halts on `current_epic: null`, no bypass, **live since v0.1.3 and asserted by its own
  tests**, so the fix rescopes M4.5.E9's AC1-extended rather than patching a branch. `B43`/`B44`/`B45`
  are **three distinct defects stacked in the same seven lines** (`state.js:388-395`) and should land
  as one commit: it records the phase being *left* (so a SHIP date is unrecordable — SHIP is terminal),
  it applies set semantics to log data (silent collapse, no diff/warning/count), and it never validates
  existing entries (junk lines become permanent phantom phases). **The scope is wider than linear mode:**
  any project past its first unit hits `B44`/`B45`; Epic mode is spared only because `setCurrentEpic`
  zeroes the list on every roll. **`B41` must not land first** — wiring four more commands to
  `transitionPhase` multiplies the collapse sites. **None of these need a measurement layer.** Together
  they say the quiet part: **nothing exercises linear mode end-to-end**, nor a `completed_phases` longer
  than one unit — a coverage gap worth naming in the slice, since Signal-on-Signal has been Epic-mode
  since M4.5.E11 and structurally cannot see either.
- **Retro replay into the next Epic's DISCUSS/PLAN** → **kept in its Sprint 4 home**, sequenced here.
  Pointer rather than a copy (single-home). It shares `B39`'s shape — *a store exists and the reader
  was never built* — which is why it lands in this Epic and not in the abandoned Sprint-4 group.
- **⚠ The re-audit's own falsifier — a DATED check, not a trigger** *(added by M5.E7 REVIEW,
  2026-07-26)*. `SIGNAL-V2-ROADMAP.md` §6.1 answers the confirmation-bias charge against itself with
  one falsifier: *M5.E8 lands, measurement shows Signal's enforcement is as good as claimed, and the
  parked ports still never happen — if that occurs, the reframe was decorative.* **It cannot ride a
  trigger: "the ports still never happen" is a null result, and nothing fires on nothing** — the
  failure class this file already documents twice (the synthesizer-validator trigger, closed only
  because someone deliberately checked it; the GitHub-Issues trigger, which fired 2026-07-15 and
  promoted nothing). *Check by:* **2026-10-26** — three months. *Done-when:* a written verdict, one
  of *(i)* ports promoted on measurement, *(ii)* re-parked with a **new date**, or *(iii)* **the
  reframe is recorded as decorative and the roadmap is re-run.** Silence past the date is verdict
  *(iii)* by default. **Date is Brett's to move; letting it lapse unobserved is the one outcome the
  falsifier exists to prevent.** *This is also the canonical instance of the `B39` fix's second
  half — a checked-and-declined condition must be distinguishable from an unchecked one.*

### M5.E10 — Review hardening
**Tag:** roadmap · **Trigger: M5.E8 lands** (both halves are partly prompt-shaped; E8 is what makes
"did it help?" answerable). **Trigger satisfied 2026-07-28.** **Scope widened 2026-07-28** by the
claim-integrity investigation ([`../analysis/CLAIM-INTEGRITY-ANALYSIS.md`](../analysis/CLAIM-INTEGRITY-ANALYSIS.md))
— the false-green audit's target class now has a name and field evidence: **completeness claims
written from the shape of the work rather than from the artifact** (five instances in one FULL-tier
traction-engine phase, every catch incidental; ≥7 prior un-abstracted sightings in Signal's own
corpus). Principle for every item below: *a completeness claim must be derived, checked, or labeled
unverified — never asserted from memory* (the `buildCaveats()` lesson, generalized).
- **False-green audit + RED-against-`main`.** *Done-when:* every guard fix in the following Epic
  ships with a test demonstrated to fail against `main`.
- **`B38` — reclassify every anti-rationalization table entry** as *discipline* (keep the
  prohibition form) or *shaping* (convert to a positive recipe). *Done-when:* a one-page table
  names each entry's class and every shaping entry is a positive recipe. **Add as a shaping
  entry:** the claim-provenance rule — never restate or escalate an upstream claim about a third
  artifact without opening that artifact (CLAIM-INTEGRITY §6 item 6).
- **Requirement-coverage diff** (CLAIM-INTEGRITY §6 item 1) — deterministic `tools/lib` check +
  `verify.md` instruction: every FR/NFR/AC ID in `REQUIREMENTS.md` must appear in the VERIFICATION
  artifact (absent = red), plus an intra-file VALIDATION consistency check (dimension-2 assignments
  and Nyquist-map rows must agree — Phase 11's root was a single-file self-contradiction nothing
  read). *Done-when:* replaying traction-engine Phase 11's artifact pair fails both checks and the
  amended pair passes.
- **VERIFICATION template: denominator table + required "what this could not establish" section**
  (§6 item 2; absorbs the ISSUES-INBOX self-critique entry and AGENT-EFFECTIVENESS Rec 3).
  *Done-when:* an artifact missing the section or the table fails the phase gate. Structural only —
  works **paired with the diff above**, never instead of it.
- **REVIEW claims-audit** (§6 item 3) — implement the faithfulness backstop that `ship.md` §5.5 and
  the `evict.js` header already assign to REVIEW: every coverage/status/completeness claim in
  VERIFICATION and prior-phase artifacts verified against its source (the adversarial
  `docs-verifier` design has been parked in ISSUES-INBOX since 2026-05-12). *Done-when:* a fixture
  VERIFICATION with a seeded false claim is caught by the step.
- **Correction protocol** (§6 item 5) — a correction is complete when a corpus grep for the claim
  and its restatements returns only corrected instances: root + all carriers, not the files that
  happened to be open. *Done-when:* a SHIP-time check fails on a fixture with a corrected root and
  one live carrier.
- **Wire up or fold in the verifier agents** (§6 item 7) — `agents/verifiers/verifier.md` and
  `nyquist-auditor.md` carry the enumerate-with-a-denominator shape and are dispatched by no
  command. *Done-when:* that discipline is reachable from `/sig:verify`, by dispatch or absorption.
- **Retro-index freshness check** (§6 item 8) — sibling of `checkIndexFreshness`;
  `regenerateIndex` is already deterministic and compare-before-write. *Done-when:* a repo whose
  `RETROSPECTIVES.md` lacks a row for an existing retro fails `/sig:sweep` (the 2026-07-28
  missing-M5.E8-row incident, mechanized).

### M5.E11 — Roadmap Advisor
**Tag:** roadmap · **Trigger: M5.E9 lands** (it advises on a backlog, so reconcile the backlog first).
The best-evidenced *new* capability in the audit, and one it nearly missed: the counterfactual asked
about shipped bugs and Epic duration and **never asked "would this have stopped us building the
wrong thing, in the wrong order?"** — the failure Signal's record documents loudest (the 0-for-6
displacement chain; five ports un-cut for the project's life; `B39`).
**Scope:** product discovery is **out** (ratified 2026-07-26); *given a backlog, what's next and
why* is **in**. Absorbs gstack's `/office-hours` forcing questions re-pointed at sequencing,
`/plan-ceo-review` Step 0B, and pm-skills' assumption mapping (Impact × Risk).
*First slice:* **make M5.E7 repeatable** — read `BACKLOG.md` + `BUGS.md` + the retro corpus, return
*why this and not that* for the top N, every answer citing a path. *Done-when:* a stranger runs it
on Signal's own backlog and the citations resolve. **Naming deliberately open** — do not fix the
name before the shape.

### M5.E12 — Project-facing currency
**Tag:** roadmap · **Trigger: M5.E11 lands**, or a doc-drift incident in a Signal-built project.
*The insight that makes it cheap:* this is Signal's doc-runtime **pointed outward at the project**
instead of inward at `.planning/` — the work is **retargeting, not inventing.**
- **Accurate, agent-navigable docs for the codebase and its external services.** Supersedes in scope
  both `/sig:docs-update` (Sprint 7) and the tooling-catalog inbox entry — **reconcile, don't
  re-derive.** *Slice:* run the existing hygiene + index generation over a project's own `docs/` and
  its external-service surface. *Done-when:* a generated doc map whose links all resolve, and a
  broken one fails the check.
- **External-claim staleness stamps** (`verified-against: <ref> on <date>`, advisory, homed in
  `/sig:sweep`) covering `analysis/` (correction **C6**) and the two ⚠-flagged untrustworthy claims
  at Sprint 2 below. *Done-when:* an unsourced or expired claim produces a sweep advisory naming the
  file and the claim.

### M5.E14 — Obligation tracker integration (single home for open/closed work)
**Tag:** roadmap · **Trigger: M5.E10 lands** (the claims fixes come first — the tracker is
**additive to, never a substitute for**, claim verification: no tracker checks whether a report
enumerated a requirements file). Added 2026-07-28, Brett's call at the claim-integrity pass; design
record: [`../analysis/CLAIM-INTEGRITY-ANALYSIS.md`](../analysis/CLAIM-INTEGRITY-ANALYSIS.md) §7.
**Not part of the M5.E7 sequencing — a post-audit widening, named as one.**

> **⚠ ID note corrected 2026-07-28 (M5.E13 DISCUSS).** This entry originally read: *"`M5.E13` was
> already claimed by the in-flight Lanes epic when this entry was written; E14 was the next free ID."*
> **That was false in both halves.** Lanes carried **no Epic ID** — not here, not in `MILESTONE-5.md`,
> not in [`../analysis/LANES-IMPLEMENTATION-GUIDE.md`](../analysis/LANES-IMPLEMENTATION-GUIDE.md),
> which describes itself as *"DISCUSS input for a new Epic"* — and it was **not in flight**; it was an
> uncommitted proposal in the working tree until `e61f614` the same day. `M5.E13` was free and is now
> **"Guards that don't guard"** (opened `42d3f13`). This entry keeps **M5.E14**; nothing renumbers.
>
> **Recorded as a `B50` sighting, not just a typo** — a status claim ("already claimed", "in-flight")
> written from the author's mental model rather than checked against the artifact, in a commit made
> the same day the class was named. **Fourth sighting in one session**, after M5.E8's retro mechanism
> (covered 1 of its own 3 instances), this class's own inbox capture (filed with a body-less "Logged"
> status line), and this. The class is not historical.

**The argument:** "closed" in a tracker is an *event* — actor, timestamp, audit trail; in markdown
it is a string an agent rewrites wholesale on every edit (the `B41`–`B45` shape, aimed at status).
Phase 11's false "still owed" was an inference from a list's shape; against a tracker there is
nothing to infer — `gh issue list --state open` *is* the answer, and the ship-gate "anything still
owed?" check becomes one query instead of a schema Signal maintains forever. The honest concession:
Signal has been incrementally building its own issue tracker out of markdown (ISSUES-INBOX /
BACKLOG / BUGS / dispositions / `backfill_warnings`) and keeps re-hitting bugs trackers solved
decades ago — `B46` cannot happen when status has one home.

**Two load-bearing conditions (both required, or don't build it):**
1. **Single home** — the tracker is the *only* place obligation status lives; markdown references
   issue numbers and never restates status. Mirroring status back into files recreates the `B46`
   class with extra steps. Half-integration is worse than none.
2. **Closing wired into the phase gates** — SHIP/REVIEW run "what's open, and did this phase close
   what it claims it closed?" Phase 10 discharged an obligation and stamped nothing; a tracker makes
   that check trivial and definitive — it does not make it automatic.

**Boundary:** lifecycle items (backfills, bugs, deferred work, the capture inbox) → tracker.
Records (decisions, retros, requirements, state narrative) → stay in `.planning/`, versioned with
the code. **GitHub Issues first** (`gh` is already in the ship flow; zero new auth for Signal's
audience); Linear at most a later adapter. **A degraded/offline mode is required** — Signal's
guards are offline+deterministic and there is no `/sig:permissions` vocabulary yet: the fallback is
the `discharged` status marker on `backfill_warnings`, **which can ship ahead of this Epic as a
patch** (it is also the schema fix that ends the false-"still owed" class for tracker-less projects).

*First slice:* the `discharged` marker + a SHIP-gate open-obligations query behind a capability
check (`gh` present and authed; silent, logged skip otherwise). *Done-when:* a fixture with a
discharged-but-unmarked obligation produces no false "still owed" through a full VERIFY→SHIP run —
and the same fixture with a tracker present shows the obligation closed by the phase that
discharged it.

---

## Sprint 2 — Re-aim the map *(research; gates the v2-port arc)* — **✅ CLOSED by M5.E7**

**Ran as Epic M5.E7, 2026-07-25→26.** Four of five items are closed by it; one survives and is
absorbed into M5.E12. *(Historical note: this sprint's framing — "the v2 vision is stale" — was
itself corrected. The April analyses were **~3 months old, not ~15**; correction **C6**. Staleness
carried **zero** weight in any cut.)*

### ~~Feature-parity + landscape re-audit → `SIGNAL-INTEGRATION-RUNDOWN-v2.md`~~ — **✅ DONE (M5.E7)**
**Tag:** roadmap
**Delivered as [`../analysis/SIGNAL-V2-ROADMAP.md`](../analysis/SIGNAL-V2-ROADMAP.md)** — deliberately *not* named `-RUNDOWN-v2`, whose name presupposes the retired coverage frame (D-M5E7-5). 45 candidates verbed; the seed is partially superseded (its §1 scorecard dies, §2/§3 carry forward). Original entry preserved for provenance:

Feature-parity audit across all inspiration repos → a *sequenced* Epic queue in a fresh `SIGNAL-INTEGRATION-RUNDOWN-v2.md` (only the `-SEED.md` exists today; the re-audit should verify it fresh and supersede it). This is M5's locked opening move (BR-8) and gates the speculative v2 feature ports.

### ~~Compound-engineering implementation audit~~ — **✅ DONE (M5.E7 S2.t6a/t6b), and it cut what it gated**
**Tag:** roadmap
**Delivered:** `.planning/M5.E7-SUPPLY-COMPOUND.md` + `-COMPOUND-NEW.md`. The audit it gated (`/sig:compound`, Sprint 4) is **abandoned** — the memory-loop premise was falsified, and **C5** found the two agents are not a unit upstream, so porting "the phase and its two agents" would build something the source does not have. Original entry preserved for provenance:

Study compound-engineering's post-ship memory loop before designing `/sig:compound` (Sprint 4). Explicitly gates that design.

### Traversal-artifact decision spike
**Tag:** roadmap
One spike with a recommended default — **hierarchical markdown intent layer wins; graph is a later opt-in** (plain markdown in git is load-bearing; graphify adds a Python dep that dents the <5-min-install target). Run the installed `intent-layer` skill on one large repo, decide, and close the three circling entries (graphify / graph-only / Intent-Layers reframe).

### ~~Vocabulary attribution sweep~~ — **✅ largely DONE (M5.E7 S4.t10)**
**Tag:** hygiene
**Delivered:** 10 dated correction markers over 6 IDs across four `analysis/` files (**C3** `<HARD-GATE>` is a syntax not a mechanism · **C4** pm-skills engineering integration · **C5** `learnings-researcher` location · **C6** the "~15 months" figure · **C7** the command count · **C8** the anti-rationalization generalization). **Residual, deliberately not claimed as done:** only the five claims M5.E7's supply verification touched were checked. The rest of the corpus was **not** re-verified — that is what the stamp below is for.

### Re-source the stale external claims → **absorbed into M5.E12**
**Tag:** hygiene
Verify the path-scoped-skills frontmatter claim and re-source the "5 CC tools" claims against current Claude Code docs (both flagged ⚠ in their entries — can't be trusted at face value). **M5.E7 promoted this from a one-off pass to a standing mechanism:** these two ⚠ claims are the *second recorded instance* of the failure class (C6 was the first), which is what graduated the external-claim staleness stamp from `continue` to `build`. Do the two re-sources **as the stamp's first fixtures**, not separately.

---

## Sprint 3 (residual) — Memory & doc-runtime *(the rest of the flagship)*

The structure half (doc-model, eviction, migrate, index, hygiene) is shipping as M5.E1–E3. What remains is the maintenance-command half.

### ~~`/sig:sweep --docs / --code` — periodic hygiene sweep~~ — **✅ SHIPPED v0.1.11 (M5.E6, 2026-07-25)**
**Tag:** roadmap
**Delivered:** `commands/sweep.md` + `tools/lib/sweep.js` — Signal's **18th** command. *This row read "Confirmed not yet built" until 2026-07-26; the file's stamp (2026-07-19) predated the release. Caught by M5.E7 S1.t3, which had to use this file as its subtraction authority and found the authority stale.* Original entry preserved for provenance:

New command (name resolved from the `/sig:audit` collision, BR-1); absorbs the old `/sig:doc-review` (stale indexes, drifted CLAUDE.md, `[FILL IN]` stubs, stale inbox) plus a Dreaming-style inbox-curation pass. `/sig:audit` keeps the readiness scorecard (Sprint 5).

### Passive `OBSERVATIONS.md` capture
**Tag:** roadmap
A passive Stop-hook that captures observations to `OBSERVATIONS.md`, composing with E9's retro loop; drained by `/sig:checkpoint` and SHIP.

### ~~CLAUDE.md de-bloat + command-frontmatter freshness~~ — **✅ SHIPPED v0.1.11 (M5.E6), both halves**
**Tag:** hygiene
**Delivered:** `tools/lib/sweep.js:137` `checkClaudeMdBloat` (advisory, `CLAUDE_MD_BLOAT_BYTES`) + `:169` `checkCommandFrontmatter`. *Also unmarked until 2026-07-26.* Original entry preserved for provenance:

De-bloat test for CLAUDE.md + a command-frontmatter freshness check — both are `--docs` sweep instances (build once the sweep command exists). (Index-freshness + link-health from workstream #4 are largely absorbed into M5.E3 FR3/FR4.)

### ~~`docs/map` refresh protocol — Stage 1~~ — **✅ SHIPPED v0.1.11 (M5.E6 FR3)**
**Tag:** hygiene
**Delivered:** `commands/ship.md:65` — the checklist line, covering both tabs. *Also unmarked until 2026-07-26.* Original entry preserved for provenance:

One checklist line in `commands/ship.md` to keep the public `docs/map` fresh at Epic close. Scope widened 2026-07-21: the map app now has TWO screens — the structure/functionality view (data objects in `index.html`) and the "Signal, explained" tab, which mirrors `docs/signal-explained.md`. The checklist line must cover both: at each meaningful release, evaluate whether the map data AND the explainer doc + tab need updating (they won't change every cycle, but the evaluation should happen every cycle — "no change needed" is a valid outcome). (Stages 2/3 are parked below.)

### ~~Concurrency-lock the doc-runtime RMW paths~~ — **DONE** (M5.E4 FR5 + M5.E5 B25; closed-out M5.E6 FR7) *(deferred from the 2026-07-19 memory-layer review)*
**Tag:** hygiene
**Delivered:** every named RMW path is now `withStateLock`-guarded via the exact safe migrate pattern the entry below prescribed — a lock-free core + a self-locking wrapper, with `applyMigrate`'s in-lock composers calling the lock-free cores directly (**M5.E4 FR5**), plus the read-enclosure behavioral interleaving test proving no lost update (**M5.E5 B25**). M5.E6 FR7 is the bookkeeping close-out, not a new build. Original entry preserved for provenance:

The unlocked read-modify-write paths — `checkpoint.js` (`captureCheckpointContext`), `drain.js` (`promoteDrainEntry`, `evictTerminalToLedger`), `retro-index.js` (`regenerateIndex`, `generateMilestoneMetaRetro`), `planning-index.js` (`regeneratePlanningIndex`) — are torn-write-safe (`atomicWrite`) but have no compare-and-swap/lock, so two *concurrent* writers could lost-update. **Low priority:** these are orchestrator-only (wave-executors never call them) so single-session writes are sequential, and the one file parallel executors contend on — `STATE.md` — is already locked (`.state.lock`). It only defends concurrent **cross-session** writes on one repo, a mode Signal discourages. **The naive "just reuse `file-lock.js`" fix is unsafe:** `migrate-memory.js:2375` calls `regeneratePlanningIndex` *inside* `applyMigrate`'s coarse `.state.lock`, so making that function self-lock re-enters the non-reentrant lock and deadlocks migrate (the documented §9 hazard). Safe version = the established migrate pattern: split each locked entry into a lock-free core + a self-locking wrapper, lock only true command entries, keep inner helpers (`backlog.js`, `applyDispositionToFile`) lock-free. ~4-module refactor + tests; reuse `tools/lib/file-lock.js`.

---

## Sprint 4 — Compounding replay — **✂ MOSTLY CUT by M5.E7**

**The premise was falsified.** Read the three carry-over bug chains *with their dates and Epic IDs
attached* and the knowledge was **in-context at the moment of the miss in all three** — `B27`
surfaced while building `B24`'s own fixture; `B34` was found by the same REVIEW panel that shipped
`B29`'s fix; `B30` was found dogfooding `B26` on M5.E5's own SHIP. A cross-session store prevents
none of *those*. **The one genuine cross-session recurrence — `B13`'s NUL byte — is cut separately
and on stronger grounds** (see the `/retro` + `/learn` row below: a deterministic content check, not
a digest). **Read the claim at that scope** — three documented chains plus one named exception, not
"nobody ever forgot anything"; and the three were selected *because* they are documented, so a
forgetting-caused miss nobody caught would not appear here at all.
The real gap Signal already named is **class-completeness at fix time**
(`M5.E6-RETROSPECTIVE.md:32`) — a review-scope rule, which is where it now lives (**M5.E10**).
Substrate stays **per-repository** (locked 2026-07-15) — untouched by the re-audit.

### ~~`/sig:compound` phase — design + build~~ — **✂ ABANDONED (M5.E7, fit)**
**Tag:** roadmap
The demand it was believed to serve does not exist — see above. Original entry preserved for provenance: *Shape set by Sprint 2's compound-engineering audit. The post-ship memory phase.*

### Retro *replay* into the next Epic's DISCUSS/PLAN — **KEPT, re-homed**
**Tag:** roadmap
**Survives the Sprint-4 cut and is the strongest thing in it.** *Not* a memory store — it is
retrieval into a context that is already open, which is a different mechanism and one Signal has a
live instance of: **`B39`**, where a store exists and *the reader was never built*. **Sequenced into
M5.E9** alongside the `B39` trigger walk, which shares its shape. *First slice:* surface the prior Epic's `## What to feed back into Signal` items into the next Epic's DISCUSS context. *Done-when:* opening an Epic shows the previous Epic's feedback items without the author going to look for them. Original scope: E9 built retro *capture* only; the gap (named in the very first inbox entry) is surfacing captured learnings into the next Epic's DISCUSS/PLAN context.

### Cross-Epic pattern detection — **KEPT, absorbed into M5.E11**
**Tag:** roadmap
Detect recurring patterns across `RETROSPECTIVES.md` over time. **M5.E7 was a manual instance of exactly this** — it harvested 12 retros into 11 themed clusters and found Theme F (EXECUTE dispatch) raised in four consecutive Epics with **zero ledger coverage**. That makes this a *component of the Roadmap Advisor*, not a standalone build.

### ~~Evaluate gstack's `/retro` + `/learn` port~~ — **✂ ABANDONED (M5.E7 — evaluated, then cut)**
**Tag:** roadmap
**The evaluation ran and returned no.** gstack's read-back surfaces a top-10 digest, decay-filtered, **at skill start in 10 of 54 skills**. Signal's one genuine cross-session recurrence (`B13`'s NUL byte, learned 2026-07-18, violated 2026-07-25) would not have been caught — the chance that *"don't paste control bytes"* surfaces at the moment someone edits a bug entry is not credible, and Signal's real defense for that class is a **deterministic content check** `doc-hygiene.js` already hosts. Cut on **overlap + fit**.

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

## Sprint 7 — Framework ports — **✂ RESOLVED by M5.E7: 0 straight ports survive**

Sprint 2's audit ran and **decided the sequence by deciding most of these are not the work.** Not
one entry below survives as a straight port. **Nothing here was cut for being stale or un-started** —
every cut argues **fit** or **overlap** (AC2.3, mechanically asserted in `M5.E7-DISPOSITIONS.md` §6).

### `/sig:docs-update` — GSD port → **absorbed into M5.E12**
**Tag:** roadmap
Tactical, fully spec'd, independent of the 10-phase work. **Superseded in scope**, not cut: M5.E12 covers doc-vs-codebase drift **plus** the external-service surface this entry never included, and does it by retargeting the existing doc-runtime rather than porting. **Reconcile against M5.E12 — do not build both.**

### ~~Upstream phases — IDEATE / VALIDATE / STRATEGIZE~~ — **✂ ABANDONED (ratified by Brett 2026-07-26)** · **PREPARE seam survives, parked**
**Tag:** roadmap
**Product-fit cut, and it is a positioning decision rather than an evidence one** — *"that's not signal."* Signal builds things well; it does not decide what product should exist. ⚠ **Read with the caveat (AC7.3):** Signal's corpus is silent about ideation, but Signal is built by someone who already knows what to build, from a spec written up front — **close to a worst case for detecting that demand.** The silence is weak evidence about other users; this cut rests on positioning, **not** on the corpus. *The prioritization half was NOT cut* — it became **M5.E11**. **The PREPARE seam** (PLAN→EXECUTE) is a separate question, untouched by the re-audit, and stays parked below.

### ~~Security upgrade — gstack's 15-phase audit~~ — **✂ ABANDONED (threat-model fit)** · Phase 8 parked
**Tag:** roadmap
`/cso` Phases 2–11 target secrets archaeology, dependency supply chain, CI/CD, infrastructure, webhooks and STRIDE — **an attack surface a markdown-plus-Node-CLI plugin does not have.** Signal's two security findings (`B14`, `B22`) were both caught by its **existing** REVIEW panel; replacing a working skill with one aimed at a different threat model is a downgrade. **Carved out and parked: Phase 8 (skill supply chain)** — *"SKILL.md files are NOT documentation… they are executable prompt code"* — the one phase matching Signal's shape. *Trigger:* first report of a malicious or tampered skill in any Claude Code plugin ecosystem.

### ~~Harder TDD + `<HARD-GATE>` + systematic-debugging~~ — **✂ SPLIT: 1 abandoned, 2 parked**
**Tag:** roadmap
- **`<HARD-GATE>` → ABANDONED. There is nothing to port** (**C3**): 4 grep hits repo-wide, exactly 1 in a live skill, **zero** in `hooks/` or `tests/`, no parser, no validator; the maintainer calls the mechanism unsettled. Signal already has the capability natively and better — the exit-2 write-guard, the `PreToolUse` hook, and an FR1 retro gate that **hard-blocked its own SHIP**. *The real upstream machinery — `subagent-driven-development`'s five-round breaker with `BLOCKED` propagation — is parked in its place.*
- **Harder TDD → parked.** Prompt-shaped; *trigger:* **M5.E8 lands** and a measured run shows TDD-instruction adherence below target. **✅ Trigger checked and declined 2026-07-28 (M5.E13 DISCUSS, D-M5E13-6).** First half fired (M5.E8 landed as v0.1.13); **second half not met — TDD-instruction adherence has never been measured.** **RE-PARKED with a condition that is now cheap to evaluate:** run the TDD-instruction canary during the next Epic that writes tests — the harness exists, so this is one command, not a project. *Promote if:* adherence scores below 3/3 as-written. *Review by:* **2026-10-31** regardless. **This row is a checked-and-declined condition, deliberately distinguishable from an unchecked one** — `B39`'s second half.
- **`systematic-debugging` → parked.** No cataloged bug traces to its absence and the `debugger` agent covers the ground. *Trigger:* two consecutive Epics where a bug takes >3 fix attempts.

### Context-discipline hooks — **parked, all three, with triggers**
**Tag:** roadmap
Hook-driven context discipline (planning-with-files lineage). **2-Action Rule** — prompt-shaped; *trigger:* M5.E8 lands + one measured instance of executor context drift. **✅ Checked and declined 2026-07-28 (D-M5E13-6): first half fired, second half not met — no instance of executor context drift has been recorded.** RE-PARKED; *promote on:* the first recorded instance in any Signal REVIEW. *Review by:* **2026-10-31**. **PostToolUse `PROFILE.md` re-read** — deterministic, so measurement does not gate it, but no bug traces to PROFILE drift; *trigger:* first recorded instance of a command acting on a stale tier. **Findings-quarantine for untrusted web content** — ⚠ **the highest-severity parked item in this file.** Signal's researcher agents *do* call `WebSearch`/`WebFetch` with no protection against fetched content carrying instructions. **No incident is recorded, so by the rules it stays parked** — flagged so a low verb is not read as low risk. *Trigger:* first injection-shaped finding in any Signal REVIEW, or a credible ecosystem report. **⚠ Restored by M5.E7 REVIEW (2026-07-26) — the audit's own recommendation was dropped between documents:** `M5.E7-DISPOSITIONS.md` §7 called this *"the biggest risk in this table"* and said plainly — *"if you want one `continue` promoted to `build` on precaution rather than evidence, make it that one."* The roadmap renders it as an open question and this file as a flagged park; **neither carries the recommendation.** The verb is unchanged and the promote/park call is Brett's — but the audit's advice should reach him as advice. **Note the trigger's own weakness:** both conditions require someone to *notice*, and per `B39` nothing evaluates them; unlike every other parked item, being late here has a **safety** cost rather than an opportunity cost.

### Multi-runtime adapters — **✂ Cursor ABANDONED · Codex parked**
**Tag:** roadmap
**Cursor → cut on demand-fit** — this file already said *"least evidence of demand."* The trap avoided: Brett works **in** Cursor but runs **Claude Code** inside it; that is not demand for Signal on Cursor's own agent runtime. **Codex → parked** at the corrected ~6/10 estimate (direct analogs now exist: `AGENTS.md`, skills with on-demand loading, subagents with tool allowlists, a hooks framework; real gaps are Custom Prompts being deprecated — 18 commands re-cast as skills — and no `AskUserQuestion` equivalent). *Trigger:* a user asks in writing, or Brett wants a second runtime.

---

## Parked — the trigger watchlist *(not sprint material)*

These stay trigger-gated; the standing **WATCHLIST** entry (A1) in `ISSUES-INBOX.md` checks their promote-back conditions at every `/sig:plan` drain. **Tag:** hygiene (except the PREPARE-phase item, which is roadmap).

- **E1 Slices 3–5** — Linux/WSL install matrix + versioning policy + validator hardening. *Trigger:* a platform tester volunteers.
- **E3 contribution scaffolding** — *Triggers:* a/b/c in its entry.
- ~~**Synthesizer validator-side check** — *Trigger:* 2+ regressions by 2026-08-23~~ — **CLOSED 2026-07-25: trigger did not fire, evidence-backed.** Checked during M5.E7 (Brett-approved). **Zero** regressions in the window: none in `BUGS.md`, none in any retro, no fix commits touching `embedSection` since the 2026-05-23 deferral (its files were touched once, by unrelated M5.E3 born-on-v3 work). **The zero is informative, not vacuous** — `tests/synthesizer-regression.test.js` + `tests/landscape.test.js` carry a dedicated regression guard (24 `embedSection` references, plus `tests/fixtures/synthesizer-bug-r1/`) that has run green in every suite execution, so the code was continuously exercised rather than merely untouched. The deferral decision was correct and the build condition never arose. *Closed by decision rather than allowed to lapse at the date — the corpus's only dated expiry, and letting it pass unobserved would have been exactly the "no cut decision was ever recorded" failure this Epic catalogued against five un-cut ports.*
- **`/sig:doctor` helper-script split** — deferred refactor.
- **`docs/map` Stages 2/3** — the deeper map-refresh protocol.
- **GitHub Issues full setup** — *Trigger:* first live external tester — **FIRED 2026-07-15 and never acted on.** M5.E7 flagged this as the clearest instance of `B39`: a trigger that fires, is recorded as fired, and promotes nothing, across ≥2 `/sig:plan` drains. **Forcing the call is an M5.E9 deliverable** — promote it, or re-park it with a *new written trigger and a date*. Silence is not a decision.
- **Dependency and release currency** *(roadmap; new 2026-07-26)* — is the user's stack moving underneath them? (Brett's worked example: Node's middleware→proxy transition — which versions to use.) **The item furthest from Signal's existing shape**: it needs a live external data source (registry / changelog / advisory reads) Signal has never had, which means network I/O, caching, and a staleness model. *Trigger:* **M5.E12 lands** (shared "watch an external surface" machinery), **or** a Signal-built project ships on a deprecated API and it is recorded.
- **Cross-install telemetry bolt-on** *(roadmap; new 2026-07-26)* — pool performance data across Signal installs to improve the harness over time. Mass-market palatability **explicitly waived** by Brett, so consent is a design parameter, not a blocker. ⚠ **Hard ordering constraint: M5.E8 first** — you cannot pool across installs what you cannot measure in one; backwards it collects noise at scale. Honest caution: at 7-of-12 adherence, **four users will show nothing for a long while.** A compounding asset, not a near-term signal. *Trigger:* M5.E8 lands and local measurement is repeatable. **✅ Checked and declined 2026-07-28 (D-M5E13-6).** Both halves arguably fired — M5.E8 landed and the harness is re-runnable — **and it is re-parked anyway, on the item's own stated caution:** with four users there is nothing to pool, and the entry itself says they *"will show nothing for a long while."* Building now collects noise and burns the consent design early. **RE-PARKED**; *promote on:* **ten or more non-Signal users**, or the local harness has produced **five verdicts** worth comparing. *Review by:* **2026-12-31**.
- **`subagent-driven-development`'s five-round breaker + `BLOCKED` propagation** *(roadmap; new 2026-07-26)* — the mechanism Signal was actually reaching for when it queued `<HARD-GATE>`. 1,063 lines upstream, sized **L**, prompt-shaped. *Trigger:* M5.E8 lands. **✅ Checked and declined 2026-07-28 (M5.E13 DISCUSS, D-M5E13-6) — and this one is a re-park *against* its trigger as written, so the reasoning is recorded rather than assumed.** The trigger reads *"M5.E8 lands"* full stop, and M5.E8 landed. But both of its neighbours in this section read *"M5.E8 lands **and** a measured run shows X"* — **this trigger is read as having lost its second half.** Landing the measurement establishes that a thing *can* be checked; it is not evidence the problem exists. This is a breaker for agents that loop without converging, and **Signal has no recorded instance of that happening** — 1,063 lines of port against an unobserved failure. **RE-PARKED**; *promote on:* one measured run where an agent loops past **three rounds** without converging, **or** any Epic where an executor visibly stalls. *Review by:* **2026-10-31** regardless. **If this re-park is wrong, it is wrong in a recorded, dated, arguable way — which is the outcome `B39` exists to force.**
- **gstack `/cso` Phase 8 — skill supply chain** *(roadmap; new 2026-07-26)* — carved out of the abandoned security port. *Trigger:* first report of a malicious or tampered skill in any Claude Code plugin ecosystem.
- **PREPARE-phase early-promotion triggers** *(roadmap)* — 3 conditions; can also fire from lived signal ahead of the upstream-phases work.
- **STATE auto-update Options B/C** (git hook / compute-on-read) — *Trigger:* Option A discipline demonstrably fails.

*Last updated: 2026-07-26 — reconciled against the M5.E7 re-audit ([`../analysis/SIGNAL-V2-ROADMAP.md`](../analysis/SIGNAL-V2-ROADMAP.md)): M5.E8–E12 landed with triggers + first slices; Sprints 2/4/7 resolved; 4 unmarked closures struck; 5 new parked items with triggers. Later same day: M5.E9's bug slice re-scoped for `B42`/`B43`/`B44` (linear-mode findings from a live `nextpass` ship report; `B42` is the ledger's first `P1`).*
