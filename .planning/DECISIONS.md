# Architectural Decisions Log

Append-only. When a decision is reversed, *add* a new entry noting the reversal with the reason — don't edit the old one. This is history, not state.

---

## 2026-07-15 — Compounding memory is per-repo; org-level learning is a user-run analysis on top (not a Signal primitive)

**Context.** Resolves the last of `REPO-ANALYSIS.md` Part 6's four strategic-decision points, flagged still-open in `analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` §3 ("Compounding substrate: per-project vs per-org — **decide before building the Compound phase, not during**"). `MILESTONE-5.md` E2 punted with "carry forward via `.planning/`," which never actually answered per-repo vs per-org. Decided by Brett 2026-07-15 during roadmap orientation (not during a build), which is exactly the "decide before building" the seed asked for.

**Decision.** The compounding/learning substrate is **per-repository**: each project's accumulated learnings live in that repo's own `.planning/` (retros, `RETROSPECTIVES.md`, whatever the future `/sig:compound` phase writes). Signal does **not** maintain a shared central/per-org learning store as a primitive. Org-wide or cross-repo learnings are an **opt-in analysis a user runs over multiple repos' `.planning/`** — a derived pass on top of the per-repo substrate, not a service Signal keeps in sync.

**Why.** Keeps each repo self-contained and portable (learnings travel with the code, no external store to provision, sync, or secure) and keeps Signal's blast radius inside the repo it's installed in — consistent with the whole `.planning/`-as-project-memory thesis. It doesn't foreclose org learning; it relocates it to a cheaper, opt-in layer (run your own analysis across repos when you want it) instead of paying central-store cost by default for every project.

**Consequences for M5.** The Compound phase (M5.E2 / backlog Sprint 4 "compounding replay") builds on repo-local `.planning/` memory — retro *replay* into the next Epic's DISCUSS/PLAN, cross-Epic pattern detection over that repo's `RETROSPECTIVES.md`. Any "org learnings" feature is explicitly out of the Compound-phase core; if it ever lands, it's a separate optional analysis tool, not a change to where learnings are stored. The M5 opening re-audit (BR-8) inherits this as settled input rather than re-opening it.

**Rules out.** A shared per-org learning store as a default/primitive; blocking or scoping the Compound phase on standing up central infrastructure; leaving the per-repo-vs-per-org question implicit for the re-audit to re-litigate.

**Cross-references.** `analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` §3 (the open question, now resolved — updated in place); `MILESTONE-5.md` E2 (COMPOUND phase — "carry forward via `.planning/`" now has a definite answer); `.planning/BACKLOG-REVIEW-2026-07-04.md` Sprint 4 (compounding replay); `REPO-ANALYSIS.md` Part 6 (strategic decision points).

---

## 2026-07-15 — M4.5.E11 (Epic-native flow) DISCUSS decisions locked (D-E11-1 … D-E11-3)

**Context.** `/sig:discuss` on the committed "Epic-native flow" Epic (DECISIONS 2026-07-05). FULL / `gate_strictness: strict`: two product-altitude decisions gated individually via `AskUserQuestion`; migration posture decided at product altitude (plumbing). Root problem, restated: Signal has two unreconciled modes — **linear** (what the commands implement: one `calibrate→ship` pass, phase-named artifacts, no Epic concept) and **Epic** (what Signal-on-Signal runs by hand: Milestones→Epics, each Epic runs its own `discuss→ship`, `M4.5.EN-*.md` artifacts, `current_epic` hand-typed). This Epic makes Epic mode first-class. **Bootstrap irony captured as evidence:** this very DISCUSS did the STATE transition + Epic ID assignment *by hand* — that friction is the requirements input.

1. **D-E11-1 — Scope = tight core.** Build: Epics first-class (commands create/track Epics, assign IDs, auto-populate `current_epic`, write Epic-scoped `{EpicID}-*.md` artifacts) + **per-Epic calibration** (an Epic inside a FULL project can honestly be SKETCH; falls out of Epic-scoping). **Parked (not cut):** the FUTURE-IDEAS "Multi-feature project lifecycle" layer — `features[]` block in STATE, per-feature `.planning/features/{slug}/` subdirs + PROFILE overrides, feature-aware status/resume. *(User-gated: "Tight core" over Broad multi-feature and Minimal plumbing.)* **Why parked:** that entry's own "resolve by" is "first real attempt to add feature #2 to a Signal-built project" (BR-9 second-dogfood) — designing the multi-feature model on a sample of one is premature. Tight core still un-parks the entry's *reason*; the broad layer waits for evidence.

2. **D-E11-2 — Placement = M4.5.E11.** Next Epic in the still-open release-hardening milestone, built now, immediately after E10, **before M5 opens**. *(User-gated: "M4.5.E11" over "M5.E0 — v2 foundation" and "Defer ID to PLAN".)* **Why here, not M5:** M4.5 is still in flight (its ≥3-tester criterion is open); the 2026-07-05 decision says "sequenced immediately after E10"; placing it in M5 would either violate M5's gate (v1 + weeks of usage) or jump ahead of M5's **locked** opening move — the landscape re-audit (BR-8). On-theme: the resume-papercut fix + per-Epic calibration *are* stranger-adoption readiness. **Defer-ID rejected** (advisor-flagged): a provisional label re-introduces the exact resume papercut this Epic exists to kill.

3. **D-E11-3 — Migration posture = additive / opt-in (product-altitude call, not gated).** Epic mode is **new and additive**; **linear mode keeps working untouched** — one project = one `calibrate→ship` pass with phase-named `{phase}-*.md` artifacts still resolves. Forced by reality: Signal now lives in stranger repos where the STATE hook fires, and FR1 (E10 `resolveArtifactPath` Epic-prefix resolver) was built as the **forward-compatible read-half** so the write-half "slots on with zero rework" (DECISIONS 2026-07-05). No migration of existing linear-mode projects; no `schema_version` bump anticipated (confirm at PLAN).

**Open for PLAN (design/plumbing — decided there with sensible defaults):** (a) **Epic-creation UX** — how a user opens/switches an Epic (candidates: a dedicated `/sig:epic <name>` meta-command; a flag on `/sig:discuss`/`/sig:new-project`; or auto-detect-and-offer when a phase command runs with no active Epic). *Surfaced to Brett for optional input at the DISCUSS gate; else PLAN decides.* (b) `current_epic` auto-population — which command writes it, when. (c) Per-Epic calibration mechanics — where the Epic-level tier lives (Epic-scoped PROFILE override vs a field) and how it composes with the project PROFILE (override for that Epic's phases; project PROFILE is the default). (d) Linear-vs-Epic mode detection signal. (e) Artifact naming — adopt the established `{EpicID}-*.md` convention.

**What this rules out (so PLAN doesn't re-litigate):** the broad multi-feature layer (parked, evidence-gated); placement in M5 (before its locked re-audit); a linear-mode migration or any mode that breaks existing `{phase}-*.md` projects; proceeding under a provisional Epic ID.

**Cross-references.** `M4.5.E11-REQUIREMENTS.md` (FRs + scope + NFRs + assumptions + PLAN-open items); DECISIONS 2026-07-05 (the commitment + two-modes root cause); `FUTURE-IDEAS.md` "Multi-feature project lifecycle" (parked broad layer + its "resolve by"); `MILESTONE-5.md` § opening move / BR-8 (the locked re-audit placement must not jump); `tools/lib/resume.js` (FR1 read-half + `EPIC_ID_RE`); `STATE.md` frontmatter (transitioned to DISCUSS / M4.5.E11 on 2026-07-15).

---

## 2026-07-15 — M4.5.E11 PLAN research decisions (D-E11-4, D-E11-5)

**Context.** 4-agent PLAN research (`M4.5.E11-RESEARCH.md`) surfaced two product/positioning gray areas beyond the DISCUSS set; both gated to Brett via `AskUserQuestion` under the "align with standard developer practice" principle he set. Research also settled a pile of plumbing (design A/B/C: `--epic` flag on discuss/new-project; `{EpicID}-PROFILE.md` whole-file shadowing; non-null `current_epic` as the sole atomic mode signal) and reconciled a close-semantics conflict (roll-on-open, never clear — clear-at-SHIP would strand SPIKE Epics that skip SHIP; done-signal = `{EpicID}-RETROSPECTIVE.md` existence, since Signal's STATE never moves SHIP into `completed_phases`).

4. **D-E11-4 — Epic-ID shape = M-shaped only.** `current_epic` always holds a strict Epic ID (`/^M\d+(\.\d+)*\.E\d+$/`, e.g. `M4.5.E12`); version numbers (`v0.1.6`) become **separate release tags**, decoupled from `current_epic`. *(User-gated on developer-best-practices grounds: work-tracking and versioning are separate axes in every standard toolchain — epics = work, SemVer tags = releases; a release bundles work, it is not a work-item ID. Putting `v0.1.6` in `current_epic` was the conflation that created the regex schism.)* **Consequences:** the write-half validates the ID against the strict regex at write time and shares ONE canonical strict regex across `state.js`/`retrospective.js`/`milestones.js` (fixes the schism); lightweight patches ship the normal way — a small SKETCH-tier Epic released as `vX.Y.Z`, or just commits + a release tag with no Epic (not every release is an epic). **Shrinks S1** (no regex-widening). Rules out widening the strict regexes to make version-strings first-class Epic IDs.

5. **D-E11-5 — Retro-gate coupling = warn, not block.** When an Epic-mode project reaches Epic-close SHIP with no `{EpicID}-RETROSPECTIVE.md`, the STATE-write hook emits a **non-blocking warning** (exit 0), never a block (exit 2). *(User-gated on hook/CI-best-practice grounds: hooks block on deterministic failures — failing tests, malformed data — and nudge on process/doc steps like retros; hard-blocking a stranger's release on a process step is a recognized anti-pattern that invites `--no-verify` bypass.)* Consistent with the posture already shipped in v0.1.6 (D-v016-2: block malformed frontmatter, *flag* everything else) and with the M4.5 stranger-adoption thesis. Rules out a hard exit-2 block; rules out `off` (the retro nudge is kept, just non-blocking). **Note:** the E9 retro-gate path is dormant today (no command writes `current_epic`); E11 makes it reachable in stranger repos, so S1 must ensure that path *warns* and the hook is throw-safe (fail-open) on any malformed `current_epic`.

**Cross-references.** `M4.5.E11-RESEARCH.md` (§ headline regex schism, § design A/B/C, § risk register R1/R2/R3, § decisions for the PLAN gate); `M4.5.E11-PLAN.md` (slice map); DECISIONS 2026-07-13 D-v016-2 (the block-malformed/flag-rest hook posture this extends); `tools/lib/retrospective.js` (`deriveRetroPath` strict regex = the canonical shape) + `tools/lib/milestones.js` (`CURRENT_EPIC_RE`) + `tools/lib/resume.js` (`EPIC_ID_RE`, the permissive read-half regex).

---

## 2026-07-15 — M5 opens: usage-signal gate cleared + eviction Epic goes first (BR-8 override)

**Context.** M4.5's last open done-when clause and M5's "Blocked by … real users" gate both hinged on outward usage signal. Brett confirmed 2026-07-15 he has onboarded **4 non-Signal users** with positive reception and sufficient input to proceed. As the maintainer he is the **source of truth** on what "bulletproof AI coding harness" means for Signal; external feedback folds in as it arrives, and no adoption barrier is treated as blocking further build.

**Decision 1 — the usage-signal gate is cleared.** M4.5 done-when clause (d) ("≥3 non-Signal users have completed this path with feedback merged") is **met**; M4.5 formally closes. M5's "Blocked by: … v1 shipping to actual users for at least a few weeks" (`MILESTONE-5.md`) is **lifted**. M5 is open.

**Decision 2 — M5's first *built* Epic is the STATE/FUTURE-IDEAS eviction work (`M5.E1`), overriding BR-8's re-audit-first ordering.** BR-8 (2026-07-04) locked M5's opening move as the landscape re-audit. Brett chose 2026-07-15 to build the file-bloat (eviction) fix first instead. The re-audit is **not dropped** — it follows, and remains the gate for the *speculative* v2 feature ports (upstream phases, compound loop, framework ports), which stay sequenced behind it.

**Rationale.** The eviction work is felt-pain (the 455 KB CMMC-dogfood STATE.md; Signal's own file on the same curve), already well-specced (`FUTURE-IDEAS.md` "STATE.md append-without-evict", HIGH PRIORITY), and — crucially — **independent of the re-audit**: it moves closed narrative into structure that already exists (`.planning/archive/` SUMMARY + a sibling `STATE-HISTORY.md`), so it needs no traversal/index decision. It therefore does not need usage signal and does not wait on Sprint 2. The re-audit's dependency binds only the *speculative* ports.

**Scope guardrail (the line that keeps this Epic re-audit-independent).** `M5.E1` is the eviction **mechanics only** — NOT the Sprint-3 "memory & doc-runtime flagship" (wiki restructure, `/sig:migrate-memory`, `/sig:sweep`, doc-runtime index/graph). That larger flagship keeps its hard dependency on the re-audit (`BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 3 cross-cluster note) and is deferred. Eviction stays safe only while it targets **existing** structure; the moment DISCUSS reaches for a *new* index/graph/destination it has crossed into the flagship and must defer.

**Already shipped (do not rebuild).** v0.1.6 shipped the **write-time prevention** half — the STATE-write hook hard-blocks prose in `completed_phases`/`blockers` (`hooks/check-state-write.js` → `checkStateFrontmatterShape`) plus a read-time size banner in `/sig:resume` (`readStateSize`, 150 KB). `M5.E1` builds the **eviction / remediation** half: evict-on-close in `/sig:ship` + `/sig:checkpoint`, the migration-side legacy-body relocation (`upgradeStateFile` → `STATE-HISTORY.md` + pointer), the normative body skeleton in `references/state-schema.md`, tier-aware size budgets, and FUTURE-IDEAS eviction of shipped/promoted entries. Exact scope-in/scope-out is the DISCUSS agenda.

**Cross-references.** `MILESTONE-5.md` (§ opening move / BR-8 override + § doc-lifecycle capture); `MILESTONE-4.5.md` (done-when clause (d)); `FUTURE-IDEAS.md` "STATE.md append-without-evict — closed-work narrative must leave the live file" (HIGH PRIORITY spec); `BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 3 (the deferred flagship); `analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` (the re-audit's seed, still queued); DECISIONS 2026-07-04 (BR-8 origin) + 2026-07-15 (per-repo compounding); `hooks/check-state-write.js` + `tools/lib/state.js` `upgradeStateFile` (the eviction seams).

---

## 2026-07-16 — M5.E1 go-big: doc-runtime flagship (D-M5E1-1 … D-M5E1-6)

**Context.** M5.E1's DISCUSS opened scoped to eviction mechanics only (DECISIONS 2026-07-15). During DISCUSS Brett chose to **go big** — solve doc bloat across *all* docs now rather than later — and raised the migrate-command and upgrade-recognition requirements. As source of truth on Signal's "bulletproof" bar, he owns this scope call. These six decisions upgrade M5.E1 from eviction-only to the full doc-runtime flagship (Sprint 3). Full spec: `M5.E1-REQUIREMENTS.md` (FR1–FR7 + NFRs + assumptions).

1. **D-M5E1-1 — M5.E1 is the full doc-runtime flagship, not eviction-only.** Supersedes the narrow scope in DECISIONS 2026-07-15. In-scope: canonical doc-model, STATE.md eviction, FUTURE-IDEAS eviction, all-docs hygiene runtime, the living BACKLOG.md lifecycle, the auto-sensing migrate command, and the doc-layout stamp/banner. *Rationale:* doc bloat across all docs is high-value and compounding; Brett prefers to solve it structurally now. *Risk read:* medium, concentrated entirely in the migrate command (mitigated by D-M5E1-4); the rest is standard FULL-tier work. Not off the charts.

2. **D-M5E1-2 — Fold the re-audit's traversal decision in; don't wait on the re-audit.** The flagship's only real dependency on the M5 landscape re-audit was "don't design the index/graph twice." M5.E1 makes that canonical doc-model decision itself (FR1), grounded in Curator's blueprint, and records it so the later re-audit **inherits** it. The re-audit still gates the *speculative* v2 feature ports (upstream phases, compound loop, framework ports) — it no longer gates the doc-runtime.

3. **D-M5E1-3 — Borrow Curator's design, take no dependency on it.** Consistent with DECISIONS 2026-07-13 (Signal external-Curator-free; native `/sig:index` successor). Curator's model (read-first INDEX, distilled SUMMARY cards, shallow archive tree, reference/link-health, deterministic-engine-plus-judgment-subagents) is the blueprint; the installed `auditor`/`distiller` agents + `curator` skill are **raw material to study**, reimplemented Signal-native. This Epic's SHIP retires the optional Curator step in `ship.md` §8 once the native hygiene runtime (FR4) lands.

4. **D-M5E1-4 — The migrate/re-org command is dry-run-first, safety-first, built last, and is NOT `/sig:doctor`.** Auto-senses old-layout projects; dry-run by default (changes nothing); git-backed + rollback + move-never-delete + dangling-link verify; explicit confirm to apply; idempotent. It's the one high-risk surface; these constraints are what make go-big acceptable. `/sig:doctor` stays **install-only** (Brett's boundary) — doc hygiene is a different axis. Command name/placement (likely `/sig:migrate-memory`) settled in PLAN.

5. **D-M5E1-5 — Doc-layout designation lives in STATE.md frontmatter; the auto-check rides SessionStart + resume/status, not doctor.** A `docs_layout_version` integer — **its own axis**, distinct from `schema_version` (frontmatter format) and the plugin SemVer (same decoupling lesson as D-E11-4). Set by the migrate command on completion. A fail-open SessionStart Node hook (+ `/sig:resume` + `/sig:status`) banners pre-reorg-on-post-reorg-plugin; post-reorg is silent. **Splits backlog A4:** install/version drift stays doctor-adjacent; doc-layout/reorg state moves to the session-start + resume/status family.

6. **D-M5E1-6 — M5.E1 runs at FULL tier (no per-Epic downgrade).** It edits the state-management core every installed repo depends on and ships an auto-rewrite command; painful to reverse if wrong. FULL rigor (TDD, strict Nyquist, full REVIEW) is warranted; the Epic inherits the project PROFILE rather than calibrating a lighter Epic-scoped one.

**Cross-references.** `M5.E1-REQUIREMENTS.md` (FR1–FR7 + NFRs + assumptions + proposed slices); DECISIONS 2026-07-15 (the superseded narrow scope) + 2026-07-13 (external-Curator-free + native `/sig:index`) + 2026-07-04 BR-8 (re-audit placement, now folded) + D-E11-4 (the version-axis-decoupling lesson reused in D-M5E1-5); `FUTURE-IDEAS.md` "STATE.md append-without-evict" / "Memory & Documentation Management as Signal-managed Runtime" (workstreams #3/#4) / "Map drift-guard" / `/sig:migrate-memory` archive-dogfood lessons; `BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 3 (A1 watchlist, A4 upgrade-diagnostics split); `hooks/session-start.sh` + `hooks/hooks.json` (FR7 host); the installed `auditor`/`distiller` agents + `curator` skill (FR1 raw material).

---

## 2026-07-16 — M5.E1 shipped (model + eviction mechanics); doc-runtime release batched with E2/E3

**Decision:** M5.E1 (Doc-runtime & memory hygiene) shipped a **bounded first slice** of the go-big flagship — the doc-runtime *model* (FR1) + STATE.md/FUTURE-IDEAS *eviction mechanics* (FR2, FR3) + dogfood — deferring **FR4/FR5 → M5.E2** (all-docs hygiene runtime + living `BACKLOG.md`) and **FR6/FR7 → M5.E3** (auto-sensing migrate command + doc-layout stamp). It **lands on `main` intentionally unreleased**: the marketplace release is **batched with the doc-runtime continuation** (cut when M5.E2/E3 land). plugin.json stays `0.1.7`; the CHANGELOG entry is `[Unreleased]`.

**Rationale:** the eviction mechanics are shippable, but the *user-facing* completeness of the doc-runtime depends on the **migrate command (FR6/E3)** that existing bloated projects need to actually reorganize — and **FR2b `evictEpicNarrative` is fixture-proven but never live-fired** (it no-ops at M5.E1's own close). Releasing a partial doc-runtime would read as "eviction shipped but I can't migrate my existing docs." Batching ships it as a coherent unit. (Brett's call, this session.)

**Also decided (bookkeeping):** the built **`M5.E1` = Doc-runtime** takes the early `M5.E` IDs; the pre-override speculative v2-port queue in `MILESTONE-5.md` (`### M5.E1–E6`) is **superseded and unsequenced** — the re-audit (BR-8) assigns its real IDs. `MILESTONE-5.md` now carries an Epic-status table (E1 shipped, E2/E3 = doc-runtime continuation) as the source of truth over the candidate headings.

**Carry-forwards (see `M5.E1-VERIFICATION.md` Part E + `M5.E1-REVIEW.md`):** FR2b never-live-fired (REVIEW hardened its path — 4 Important fixed — before it goes live); relocating an *already-migrated* inlined body has no shipped mechanism (E3/FR6); S5's `dogfood-orientation.test.js` declined by design (verified-once historical event). Release-hygiene bug B7 (`plugin.json` stuck at 0.1.6 through v0.1.7) fixed en route.

---

## 2026-07-16 — M5.E2 sequencing pivot + migrate-command scope (D-M5E2-1 … D-M5E2-5)

**Context:** Brett reports live doc-bloat blocking him across ~5 projects (`nextpass/.planning/STATE.md` write-wedged at 529 KB — `BUGS.md` B8). During M5.E2's DISCUSS he directed: build the *complete* cross-project fix, not per-file band-aids ("stay the course until we get to the proper upgrade number that will solve this across ALL my projects, not just one offs").

**D-M5E2-1 — E2/E3 swapped; the migrate command is pulled forward.** M5.E2 becomes the **auto-sensing migrate command (FR6/FR7)**; the all-docs hygiene runtime + living `BACKLOG.md` (FR4/FR5) moves to **M5.E3**. *Rationale:* the migrate command is what reorganizes an *existing* bloated project's docs — the live pain; FR4/FR5 is prevention/maintenance that can follow. (Reverses the E1-era slice order `MILESTONE-5.md` recorded; the 3 FR4/FR5 DISCUSS pre-decisions are preserved for E3 in `MILESTONE-5.md`.)

**D-M5E2-2 — full scope, not a narrow first cut.** "100% of intended functionality" = the migrate command **complete** (FR6/FR7, all three bloat vectors, conservative auto-sense, dry-run/rollback/idempotent), NOT pulling FR4/FR5 into E2. The E2/E3 boundary is explicit in `M5.E2-REQUIREMENTS.md` § Out.

**D-M5E2-3 — the deliverable is a *release*, on its own.** E2's finish line is "releasable as the doc-bloat fix." E1+E2 (eviction + migrate) is a coherent releasable unit — "the proper upgrade number" Brett installs everywhere and runs per-project; the release is **not** gated on E3. The command operates on the **invoking** project's `.planning/`, never Signal's repo except the dogfood (the fix reaches a project via release → plugin-update → run-in-project).

**D-M5E2-4 — de-prose RELOCATES, never deletes (headline risk).** Automated vector-1 frontmatter de-prose must *relocate* the narrative (body / `STATE-HISTORY.md` / archive card) with the model §5 word-accounting + faithfulness gate — **not** drop it. The B8 hand-recipe (frontmatter 107→27, "body byte-identical") *deleted* ~80 lines of prose: acceptable for Brett eyeballing one file, catastrophic as an unattended default (the silent-memory-degradation failure §5 exists to prevent; breaks move-never-delete). **Faithfulness is proven by a human-approved per-project dry-run diff + the Signal-own dogfood eyeball, not green tests** (§5 blind spot: tests can prove the mechanical move + coverage backstop, never that a card faithfully represents its source).

**D-M5E2-5 — conservative auto-sense across unseen projects.** The command runs against projects it can't inspect beforehand (varied sizes, partial migrations, linear vs Epic mode). Dry-run + full plan + explicit per-project confirm is the default; it never assumes a uniform old layout, plans the smallest safe move when unsure, and a re-run on a migrated project is a no-op.

**Also this session:** B8 discoverability mitigation shipped standalone (`56593a2` — the guard reason now states the whole-file semantics); **B9** logged confirmed (`setCurrentEpic` doesn't reset `phase`/`completed_phases`/`last_completed_task` on an Epic roll — candidate to fold into M5.E2's state-mutation work).

**D-M5E2-6 — fold M5.E3 into the release (2026-07-18).** Supersedes D-M5E2-3's "E1+E2 releasable on its own." Brett's call after M5.E2 REVIEW: the doc-runtime ships as **ONE 0.1.x = E1 + E2 + E3**, not E1+E2 alone. *Rationale:* "the full, real intended functionality… battle-tested and 100% reliable before using in other repos." E1+E2 fix STATE/FUTURE-IDEAS bloat + the migrate command (unwedges nextpass); **E3 (FR4/FR5) extends auto-hygiene to every other planning doc** (the append-logs the E2 migrate *protects but doesn't clean* — e.g. nextpass's 169 KB `DECISIONS.md`) + a living `BACKLOG.md`, so "entire memory/doc cleanup" is genuinely complete at release. **Sequence:** open M5.E3 (`/sig:discuss --epic M5.E3`) → full DISCUSS→SHIP → cut the combined **E1+E2+E3** marketplace release → then per-project `/plugin update` + `/sig:migrate-memory`.

**M5.E2 REVIEW outcome (2026-07-18) — PASS-WITH-FIXES.** 3-specialist adversarial panel (code-reviewer + security-auditor + test-engineer) caught a **SHIP-blocking rollback gap** (rollback not wired around the mechanical move/rewrite phase → unrecoverable partial write in fs-backup/`--force` modes; **2 reviewers independently reproduced it**) + a directory-symlink path escape (out-of-tree write + source deletion) + fence-less false-success + a `readLayoutBanner` perf/DoS + test-adequacy gaps (no real-parser round-trip; confounded conservation test; missing blocker-label/CRLF coverage). **All fixed in-phase across 5 RED-first batches (`50ad065`..`dd77ef1`)**, 1071→**1300 tests** green, real-file faithfulness re-confirmed 0-dropped on the final code (`ca6ec22`). Confirmed SAFE: path traversal (`EPIC_ID_STRICT_RE`), git command/option injection (`execFileSync`), `--force` destructive-safety (surgical, never `reset --hard`), TOCTOU, coarse-lock non-reentrancy. Bugs **B10–B16** logged: B10 (SHIP-suffix), B11 (flag over-fire), B12 (de-prose label), B13 (NUL byte) **fixed**; **B14** (codebase-wide lexical symlink confinement in evict/add/resume — not in E2's attack surface per §9), **B15** (>1 MB scan-ceiling truncation), **B16** (tag-lingers-on-failure) ticketed.

---

## 2026-07-18 — M5.E3 DISCUSS: doc-lifecycle model + naming + append-log hygiene (D-M5E3-1 … D-M5E3-8)

**Context.** M5.E3 opened (`/sig:discuss --epic M5.E3`) to build the doc-runtime's FR4 (all-docs hygiene) + FR5 (living BACKLOG) + the D-M5E2-6 append-log extension. Most of E3 was pre-locked (the 3 `MILESTONE-5.md` pre-decisions); DISCUSS was narrow — the genuinely-new call was append-log hygiene. Full spec: `M5.E3-REQUIREMENTS.md` (6 FRs + ACs + NFRs). Tier FULL/strict, inherited (no Epic PROFILE).

**D-M5E3-1 — The doc-lifecycle model: four role-named files.** `ISSUES-INBOX.md` (raw capture inbox) → the drain classifies + dispositions into `BACKLOG.md` (sequenced planned work; roadmap-vs-hygiene is a *tag inside* it) + `BUGS.md` (defects); `OPEN-QUESTIONS.md` holds questions. Each file has exactly one job. *(Corrected Brett's initial inverted mental model — he had FUTURE-IDEAS as the roadmap and BACKLOG as bugs; the locked FR5 model is the reverse.)*

**D-M5E3-2 — Naming: `FUTURE-IDEAS.md` → `ISSUES-INBOX.md`; keep `BACKLOG`; keep `BUGS` (NOT `ISSUES`).** "ISSUES" is the familiar GitHub word, but the `-INBOX` suffix marks it as the raw capture point, not the system of record — best of both. `BACKLOG` is the industry term for sequenced work. **Rejected renaming `BUGS`→`ISSUES`:** GitHub's "Issues" is an *umbrella* (bugs+features+chores sorted by label) that works because it's a queryable DB; Signal is flat markdown, where one clear role per file reads better than one labeled stream — an umbrella `ISSUES` would collide with the `BACKLOG`/`BUGS` split. *(Brett's call: `ISSUES-INBOX.md`.)*

**D-M5E3-3 — Capture: verbatim body + agent-authored auto-title.** `/sig:add` keeps the body byte-identical (the sacred capture contract) but writes an agent-authored one-line title (the in-loop agent summarizes for the *heading only*); the mechanical clause-slice `deriveHeading` stays as the deterministic fallback for non-interactive/hook captures. New `--bug` fast-path routes straight to `BUGS.md` (alongside `--question`→`OPEN-QUESTIONS`); untyped default → `ISSUES-INBOX`. *Rationale:* pasting messy content (e.g. a GitHub issue body whose first line is "Here's a summary:") produced confusing front-matter under pure clause-slicing; auto-title fixes it. **Conscious trade:** softens `/sig:add`'s zero-interpretation principle — but only for the label, never the body.

**D-M5E3-4 — Drain classifies + dispositions; promote evicts.** The `/sig:plan` drain is extended to **classify** each inbox entry (work→`BACKLOG` / bug→`BUGS`) on top of its existing disposition verbs (promote/defer/merge/delete); promote may retitle; promoted entries physically **evict** from `ISSUES-INBOX` (reusing M5.E1 FR3). Anchored at `/sig:plan` (primary — when you choose what to build) + a light inbox-sweep at `/sig:ship` (Epic-close); **not** `/sig:execute` (heads-down building; triage there breaks flow). Hybrid: typed fast-paths for known items, untyped → inbox → drain sorts.

**D-M5E3-5 — `INDEX.md` fully auto-generated by a native `/sig:index`; the traversal layer.** Hand-curation retired; the generator preserves hand-curated annotations (the "Gotcha:" notes, tier legend) by file/Epic ID across regen — same survive-by-ID pattern as `RETROSPECTIVES.md` hooks. This index is **load-bearing for D-M5E3-6**: it's what keeps evicted content findable.

**D-M5E3-6 — Append-log hygiene = evict-with-anchors (chose option a over detect-only/defer).** Closed-milestone `DECISIONS.md` (+ closed milestone-doc) blocks relocate to `DECISIONS-HISTORY.md` behind dated pointers, **every `D-…` anchor preserved** so cross-refs resolve via the auto-index; live `DECISIONS.md` keeps only the current milestone. *Rationale (Brett):* a year-long project's decision log gets massive; index→archive is the proven G-Brain/LLM-wiki scaling pattern — IF the index is thorough. **The cross-ref-integrity risk I raised was audited and is near-zero:** only **2** hard markdown links point at `DECISIONS.md` (both file-level, no anchors → eviction breaks neither); the **669** bare `D-…` mentions + 67 date-refs are plain text handled by the index; the 3 tools that touch it are compatible (`checkpoint.js` *appends* to the live file; `add.js` *denylists* it; `migrate-memory.js` already classifies it as a protected `APPEND_LOG` — E3 just adds the eviction path). Nothing in how the content is used prohibits it. **Cost:** this is E3's risky, migrate-shaped piece and makes E3 a 3-part Epic (FR4 + FR5-backlog + append-log eviction) — the append-log eviction plays the role the migrate command played in E2.

**D-M5E3-7 — Hygiene checks live in the test suite; deterministic + offline.** Internal link-health + roster/count/version drift = **hard test failure**; soft findings (prose staleness) = reported, non-blocking; the guard only reads, never auto-writes prose. **No external URL checks** — that's a B17-class CI-flakiness time-bomb (fresh lesson: 4 git-heavy migrate tests flaked on timeouts under parallel load in the M5.E2 SHIP). Absorbs the queued map-drift guard. Covers `docs/`, `README`, `CLAUDE.md`, `analysis/`.

**D-M5E3-8 — Rollout covers new AND existing projects; retires Curator.** New projects are **born on layout v3** (new-project/init create the new-named files on-demand — lazy, no empty-file litter). Existing projects ride E2's already-shipped mechanism: bump `CURRENT_LAYOUT_VERSION` 2→3, the SessionStart/resume/status drift banner auto-detects on `/plugin update`, `/sig:migrate-memory` is extended for the v2→v3 transition (rename `FUTURE-IDEAS`→`ISSUES-INBOX` + create `BACKLOG` + append-log evict) under the dry-run→approve→apply, relocate-never-delete, idempotent contract. **Retires the `ship.md` §8 external-Curator step** (D-M5E1-3 + FR4 — native hygiene replaces it); this reverses the `curator-dormant-on-signal-planning` "INDEX is hand-curated" stance, so that memory + a DECISIONS entry update *when FR3 lands*, not before.

**Cross-references.** `M5.E3-REQUIREMENTS.md` (6 FRs + ACs); `MILESTONE-5.md` (E3 pre-decisions + Epic-status table); `archive/M5/E1/M5.E1-REQUIREMENTS.md` (original FR4/FR5/FR7 lineage); DECISIONS 2026-07-16 (D-M5E1-3 Curator-borrow-not-depend, D-M5E2-6 fold-E3); `tools/lib/migrate-memory.js` (`CURRENT_LAYOUT_VERSION = 2`, `APPEND_LOG_BASENAMES`); `tools/lib/add.js` + `drain.js` (the `FUTURE-IDEAS`→`ISSUES-INBOX` rename surface).

---

<!-- append-log-evicted: milestones -->
## 2026-07-19 — Closed-milestone decisions relocated (milestones)

The milestones closed-milestone decision sections were relocated verbatim to [archive/milestones/DECISIONS.md](archive/milestones/DECISIONS.md). Grep the archive by decision ID; every anchor still resolves via `/sig:index`.

---

<!-- append-log-evicted: M4.5 -->
## 2026-07-19 — Closed-milestone decisions relocated (M4.5)

The M4.5 closed-milestone decision sections were relocated verbatim to [archive/M4.5/DECISIONS.md](archive/M4.5/DECISIONS.md). Grep the archive by decision ID; every anchor still resolves via `/sig:index`.

---

## 2026-07-19 — M5.E3 EXECUTE: doc-runtime lands; `/sig:index` reverses the hand-curated-INDEX stance

**Context.** M5.E3 EXECUTE completed at FULL/strict — the final doc-runtime layer (FR1–FR6), 7 slices / 5 waves, dogfooded on Signal's own `.planning/`. Records the downstream consequence D-M5E3-8 reserved for "when FR3 implements it."

1. **FR3 lands → `.planning/INDEX.md` is now AUTO-generated** by the Signal-native `/sig:index` (`tools/lib/planning-index.js`); hand-curation is retired. Curated one-liner notes survive regeneration by key (path / Epic ID) via `parseExistingAnnotations`; the tier model is two-tier (Live/Cold). **This reverses the prior stance** ("INDEX is hand-curated; Curator dormant" — DECISIONS 2026-07-13) recorded in the `curator-dormant-on-signal-planning` memory (now updated). **External Curator is fully retired** — `ship.md §8` removed; the vacated slot calls native `regeneratePlanningIndex`; `grep -rn curator commands/` is empty (AC6.4). Signal carries no external doc-reconcile dependency.

2. **Doc-lifecycle shipped:** `FUTURE-IDEAS.md` → `ISSUES-INBOX.md` (back-compat resolver, non-breaking) → drain classifies (`/sig:plan`) into a living `BACKLOG.md` (roadmap/hygiene tag) + `BUGS.md`. Append-log hygiene = evict-with-anchors: closed-milestone `DECISIONS.md` date-sections (`< 2026-07-15`) relocate verbatim to per-milestone `archive/M{n}/DECISIONS.md` behind dated pointers, D-anchors preserved via the FR3 index (fail-closed if any won't resolve). All-docs hygiene guard is deterministic + offline (no network).

3. **Signal dogfood (AC6.5):** own `.planning/` migrated to v3 — `DECISIONS.md` 178 KB → 33 KB (37 sections → archives, 0 content dropped, 73 anchors preserved), BACKLOG seeded from the 2026-07-04 review (snapshot archived), `docs_layout_version: 3`. Fully git-reversible.

4. **Rollout completeness (user-gated 2026-07-19):** stamp-null projects (every existing external repo at the combined release — the layout stamp is unreleased) now **route through the v3 migration** (`needsV3 = stamp === null || stamp < CURRENT`), so they converge on the new layout rather than staying resolver-back-compat forever ("less tech/feature debt"). The append-log evict stays **detect-only for external projects** (the milestone-open map is Signal-M5-specific) — a deliberate safe default for the riskiest op, generalize milestone-window derivation in a follow-up.

5. **Findings logged (`BUGS.md`):** B18 (`regeneratePlanningIndex('.')` latent path corruption — absolute baseDir only), B19 (the migrate's tail index-regen silently clobbers a pre-v3 curated INDEX — REVIEW). Combined E1+E2+E3 doc-runtime is ready for the release cut.

---

## 2026-07-20 — M5.E4 DISCUSS: v0.1.9 bug/hygiene close-out — scope + B19 approach

**Context.** M5's doc-runtime shipped as v0.1.8; no Epic open. Rather than jump straight to the v2-port re-audit (BR-8), Brett chose (order 3→2→1) to first clear known-bug debt, then close the docs/code-hygiene loop, *then* re-audit. M5.E4 is step 3 (+ the code-overlapping bit of step 2). Triage this DISCUSS: `BUGS.md` carries **12 unique confirmed-but-unfixed** bugs (not the "B18–B23" STATE advertised — the footer's "0 open" counts only `needs-triage`); B8 is closeable-on-verification (both halves shipped v0.1.8); B20 is a duplicate of B5.

**D-M5E4-1 — v0.1.9 scope = confirmed bugs + the concurrency-lock refactor; Sprint-3 hygiene *commands* → v0.1.10.** The Sprint-3 residual splits: the concurrency-lock RMW refactor rides *in* v0.1.9 (it lives in the exact modules B18/B19/B21/B22/B23 touch — same files open), but the net-new hygiene *commands* (`/sig:sweep --docs/--code`, CLAUDE.md de-bloat, `docs/map` refresh) become the next Epic. *Rationale:* `/sig:sweep` is net-new capability needing its own DISCUSS, and the de-bloat items literally depend on it existing — bundling would sprawl a bug close-out and mix "fix known debt" with "build new capability." Keeps v0.1.9 tight/fast and preserves Brett's 3→2→1 as distinct steps. `OBSERVATIONS.md` stays **out** (compound-loop feeder the re-audit shapes, not hygiene).

**D-M5E4-2 — B19 (live P2) fix = detect old-format INDEX → skip auto-regen + flag** (chose over the auto-migrator and consent-to-clobber options). When `applyMigrate`'s tail `regeneratePlanningIndex` meets an old-format hand-curated INDEX it can't parse, it now **skips** (leaves the file byte-identical) and surfaces it in the dry-run + apply summary with a pointer to run `/sig:index` manually. *Rationale (Brett-confirmed):* eliminates the silent data-loss **completely** with the smallest code surface; the rare case (few external repos hand-curate INDEX) doesn't justify a fragile parser of arbitrary old formats — a buggy migrator could itself corrupt the notes it means to save. The old→new format migrator is a possible later follow-up only on real demand.

**D-M5E4-3 — The concurrency-lock refactor is bundled but *isolated*.** It gets its own PLAN slice and does **not** ride a parallel quick-fix wave — it's a ~4-module refactor with a documented deadlock trap (the naive `file-lock.js` reuse re-enters the non-reentrant `.state.lock` via `migrate-memory.js:2375`). Built via the prescribed **lock-free core + self-locking wrapper** split: lock only true command entries, keep inner helpers (`backlog.js`, `applyDispositionToFile`) lock-free, keep `regeneratePlanningIndex` lock-free where `applyMigrate` calls it inside its coarse lock.

**D-M5E4-4 — Container = `M5.E4`, ships as v0.1.9; B8 closes-on-verify; B20 dedups to B5; eslint bounded.** Epic ID ≠ version — the E11 `--epic` machinery requires a strict `M{N}.E{N}` ID (`state.js:109/587`; a bare `v0.1.9` forces linear-mode hand-management, the exact friction E11 killed), so the work-container is `M5.E4` and the *release* is the v0.1.9 patch (as M4.5.E11→v0.1.7, M5.E3→v0.1.8). **B8** flips `confirmed→fixed` on verification (both halves shipped v0.1.8: `WHOLE_FILE_NOTE` discoverability + the vector-1 de-prose auto-remediation, dogfooded on nextpass per B12) once a regression test guards the wedged→unwedged path. **B20** is dismissed as a duplicate of **B5** (identical ESLint-9-no-flat-config break; B20's "no B5 entry exists" premise is false). The eslint fix (FR6) is bounded to "`npm run lint` *runs*" — mechanical `--fix` only, residual violations ticketed, no lint-backlog rabbit hole.

**Cross-references.** `M5.E4-REQUIREMENTS.md` (7 FRs + ACs); `BUGS.md` (B5/B6/B8/B14–B23 — the triaged surface); `MILESTONE-5.md` (BACKLOG Sprint 3 residual — the concurrency-lock entry + the deferred hygiene commands); `tools/lib/migrate-memory.js` (B19 tail regen, `deproseFrontmatter` B8, `.state.lock` §9), `tools/lib/planning-index.js` / `doc-hygiene.js` / `evict.js` / `add.js` / `resume.js` (FR2 targets), `retrospective.js:454` (`WHOLE_FILE_NOTE`, B8 discoverability half).

**D-M5E4-5 — `add.js` `--file` symlink-confinement reversal (PLAN, ratified by Brett 2026-07-20).** The 4-agent research surfaced that B14's `add.js` site (`assertSafeFilePath`) reverses a *documented* design decision: the docstring (`add.js:853-857`, `:837`) declares `--file` symlink-confinement deliberately **out of scope** ("an undocumented power-user escape valve in a local repo the user already controls") and the function **pure path-math, NO I/O** (so it can refuse before acquiring the lock). Surfacing rather than silently flipping (per the working-norms "surface conflicting context" rule), Brett **ratified overturning it**: T1.2 adds `realpathSync`-based `assertRealInsidePlanning` to all three FR2 write/read sites *including* `add.js`, and **rewrites the `add.js` docstring** to match (no longer "no I/O"; symlink escape now in scope). Rationale: uniform directory-symlink confinement across every `.planning/` write path — B14 treated as a real security gap, not a partial one. The other two sites (`evict.js` write-gate, `resume.js` read-side via injectable `realpathFn`) carried no such documented conflict.

---

## 2026-07-21 — M5.E5 (v0.1.10 carry-over bug squash)

*(These four decisions were captured as `CONTEXT.md` D1–D4 during DISCUSS and relocated here at the v0.1.10 release per the CONTEXT.md-is-orientation convention; the DISCUSS-era detail is preserved in git at `befbaac`. The M5.E5 process artifacts' "CONTEXT.md D1–D4" references point to that content.)*

**D-M5E5-1 — B24: key the dangling-delta on the resolved absolute target, not `file\0link` (deviates from the catalogue).** The `BUGS.md` B24 wording ("key on decision-ID / original link text") doesn't work — the append-log reroot *mutates* the link text and there's no decision-ID at the shared `scanDanglingLinks`/`computeDanglingDelta` layer. The correct key is the resolved repo-root-relative absolute target (the invariant the reroot preserves) with **multiset/count** semantics (a `Set` reintroduces the AC1.4 masking bug). Fixes all migrate paths at the shared layer; closes the dry-run/apply divergence; preserves the gate against migrate-introduced dangles. Named limitation documented in-code (`migrate-memory.js:1519-1524`).

**D-M5E5-2 — B26: STATE-based Epic-close fallback, row-absence-gated, Layers 1+2; Layer 3 descoped (ratified).** `isEpicCloseByState(state, profile)` (tier-aware via `PHASES − phases_skipped`) fires when `phase===SHIP` + all required pre-SHIP phases complete, gated on milestone-**row-absence** (not a pure OR — a maintained per-slice row still wins). Applied to Layer 1 (`shipFR1Check`) + Layer 2 (`checkProposedStateWrite`, re-keyed off the never-written `- SHIP`). **Layer 3 (`detectDirtyExecute`) descoped** — it runs at `phase===EXECUTE` while the fallback needs `phase===SHIP` (empty intersection = no-op); the harm is fully closed by Layers 1+2. Brett ratified the descope; the resume-nudge enhancement → `ISSUES-INBOX.md`.

**D-M5E5-3 — B25: prove FR5 read-enclosure with an `_afterRead` seam + broken-twin RED; full close (all 6 wrappers).** A test-only `_afterRead` opts-seam (default no-op, mirrors the `renameFn` crash-injection seam; inert in prod) pauses a writer mid-lock; a deliberately-broken read-outside-lock twin makes the new interleaving test genuinely fail on the bug. All 6 `RMW_PATHS` carry the assertion (honest scoping: only `applyDispositionToFile` is a true lost-update discriminator; the other 5 are lock-enclosure proofs).

**D-M5E5-4 — B6: tighten `isStateStale` local-stale by file identity (`BOOKKEEPING_PATHS`); `CONTEXT.md` = bookkeeping.** A new, smaller `BOOKKEEPING_PATHS` (`STATE.md` + `CONTEXT.md`) drives Walk 2's exclude — a committed-but-unrolled `*-PLAN/PROGRESS/VERIFICATION/REVIEW` reads as *stale* (worth a nudge), a STATE/CONTEXT-only "+1" still suppresses. Count-independent (rejects the reviewer's `commits.length===1` candidate, which misfired on a split refresh). `STATE_AFFECTING_PATHS` byte-unchanged.

**Deferred findings (all `needs-triage` in `BUGS.md`):** B27/B28 (migrate over-aborts, fail-safe, on rarer link shapes in evicted closed blocks — one design question: flag-not-abort for archive links), B29 (`_afterRead` prototype-pollution hardening — unreachable), B30 (FR1 pre-check timing — the retro gate skips at `/sig:ship` Step 0.5 because it runs before the SHIP transition; surfaced dogfooding B26 on its own SHIP).

## 2026-07-22 — M5.E6 DISCUSS: doc-runtime close-out (D-M5E6-1 … D-M5E6-4)

Opened via `/sig:discuss --epic M5.E6`. The **maintenance-command half** of the doc-runtime flagship — finish Signal's self-maintenance so it's 100% locked *before* the v2-port re-audit (BR-8). Spec: `M5.E6-REQUIREMENTS.md` (7 FRs). Tier FULL/strict (inherited). Scope = BACKLOG Sprint-3 residual (`/sig:sweep`, CLAUDE.md de-bloat, `docs/map` line, concurrency-lock) + the four M5.E5 carry-over bugs (B27/B28/B29/B30). Four gray areas put to Brett; all four answered (recommendations accepted).

**D-M5E6-1 — `/sig:sweep` = invoking-project, read-only, `.planning/`-aware; portable-vs-Signal-only check split; defer `--code`/curation.** The live design question was *scan scope*, not "how ambitious." Sweep runs on `process.cwd()` (the `/sig:migrate-memory` pattern) so it helps *stranger* repos — whose `.planning/` is what bloats — not just Signal. This forces two things the existing test-suite guard doesn't do: (1) scan `.planning/` (exempting `archive/`, mirroring migrate's R7 prose exemption), where the guard's `WALK_IGNORE` deliberately skips it; (2) split checks into **portable** (dead-links, `[FILL IN]`, index-freshness, stale-inbox advisory, CLAUDE.md bloat — run anywhere) vs. **Signal-only** (roster, version, command-frontmatter — auto-skip when no `plugin.json`). Sweep is **read-only** (detect + report); `--fix`/auto-remediation and the `--code` sweep and the Dreaming-style inbox-curation pass are Not-Doing (deferred). Reuses `doc-hygiene.js` internals with parameterized scope; the test-suite guard is unchanged.

**D-M5E6-2 — OBSERVATIONS.md passive capture deferred to the Sprint-4 compound Epic.** The one Sprint-3 item that does NOT ship here. Rationale: "passive capture" has an unsolved mechanism (a Stop-hook fires on completion but is handed no summary of what Claude "noticed" — truly-passive capture needs design), and it composes with the retro/compound loop, so it belongs with that work. Keeps M5.E6 to deterministic hygiene + shippable. ("100% closed" gets a deliberate, recorded asterisk here — Brett's explicit call.)

**D-M5E6-3 — Concurrency-lock the doc-runtime RMW paths: IN, sequenced LAST — a *wanted* feature, not droppable completeness.** Brett corrected the framing: he **does** run parallel Claude sessions on one repo on occasion, so lost-update protection on the unlocked RMW paths (`checkpoint`/`drain`/`retro-index`/`planning-index`) has real payoff — not the "mode you avoid" the BACKLOG note assumed. Kept IN. Sequenced **last** purely for *risk-isolation* (largest/riskiest slice; the migrate re-entrancy deadlock hazard means the naive self-lock is unsafe — required pattern is the lock-free-Core + self-locking-wrapper split reusing `file-lock.js`). "Last" = risk order, NOT "first to cut." (Refines the `parallel-claude-sessions-race` guidance: the warning about duplicate *workflow* work stands, but the RMW lock is the right defense for the incidental-parallel case.)

**D-M5E6-4 — B27/B28 migrate dangling-gate → flag-not-abort for archive-inline + absolute-path `.md` links.** A behavior change: when migrate finds a *pre-existing* dangling link of the archive-doc-inline (B27) or absolute-path (B28) shape inside a historical/closed block, it **flags** (surfaces in the dry-run "pre-existing dangling links" list) rather than **aborting the whole migrate** — matching R7's existing archive-**prose** exemption. Preserves fail-safety: a genuinely migrate-*introduced* dangle still aborts + rolls back. Unblocks stranger repos that would otherwise be hard-blocked from migrating over a broken link the migration didn't cause. Scoped to those two shapes, never a blanket gate relaxation.

**Also folded into M5.E6 (scope inclusions, not gray areas):** **B30** (P2 — retro-gate skips on a fresh REVIEW→SHIP flow; FR5, fix approach (a)-transition-first vs (c)-re-run-post-transition left to PLAN with the recovery-implication flagged, NOT picked blind); **B29** (own-property/`typeof` guard on the `_afterRead` seam; FR6); the **`docs/map` Stage-1 ship-checklist line** (FR3, both map screens + explainer). **NFRs N/A** — CLI + hook code, no network surface (stated to clear the FULL gate, not skipped).

*(Per the CONTEXT.md-is-orientation convention, these decisions are recorded here in `DECISIONS.md` as their durable home from the outset; `M5.E6-REQUIREMENTS.md` references the `D-M5E6-*` IDs directly.)*

## 2026-07-24 — M5.E6 PLAN: FR7 re-scope + B31 fold-in (D-M5E6-5)

PLAN-phase codebase research (4 parallel agents; `M5.E6-RESEARCH.md`) surfaced a scope correction and a new bug that revise the DISCUSS-era FR7.

**D-M5E6-5 — FR7 "build the concurrency lock" was already shipped; re-scoped to bookkeeping + the B31 cross-lock fix (Brett-approved 2026-07-24).** Verification (verdict A, definitive) found every RMW path FR7/D-M5E6-3 targeted (`captureCheckpointContext`, `promoteDrainEntry`, `evictTerminalToLedger`, `applyDispositionToFile`, `regenerateIndex`, `generateMilestoneMetaRetro`, `regeneratePlanningIndex`) **already locked in `withStateLock`** by **M5.E4 FR5** + **M5.E5 B25** — mutex-sufficiency RED-proven in `rmw-lock.test.js`, no deadlock. FR7's own "unlocked" premise was factually stale; only AC7.5 (mark the BACKLOG entry done) was ever outstanding — the stale `BACKLOG.md` entry masked the delivery, which is why it got re-scoped as a build task at DISCUSS. **So the concurrency protection D-M5E6-3 wanted already exists.** BUT the same verification found **B31** (`BUGS.md`): `/sig:add` writes the inbox (and OPEN-QUESTIONS/BUGS) under `.add.lock` while drain/ship write the SAME files under `.state.lock` → different mutexes → concurrent lost-update — the one genuine remaining hole in D-M5E6-3's exact threat model, NOT covered by the M5.E4 read-enclosure locking. Brett chose **Option 1: fold B31's fix into M5.E6** (over deferring it) — closing AC7.5 alone would mark the item "done" while leaving the real gap open. **B31 fix (plumbing, decided at PLAN altitude):** route add's doc-WRITE through `.state.lock` as a short non-interactive re-read-inside-lock RMW Core (pure-insert helpers → `atomicWrite`); the scrub prompt + entry-build stay outside the coarse lock under `.add.lock` (preserving its 30s interactive TTL). No re-entrancy, add-only lock ordering (no deadlock cycle). FR7 rewritten in `M5.E6-REQUIREMENTS.md` accordingly (new AC7.1–7.7). Net: the Epic got *smaller* than DISCUSS scope (FR7's build vanished) even with B31 folded in.

**Also decided at PLAN (plumbing/altitude — recorded for traceability, not gray areas):**
- **FR5 fix = approach (c) done as in-memory synthesized post-transition state** (persist nothing): inside `shipFR1Check`, when `aboutToClose` (`!phases_skipped.includes('SHIP') && phase===lastPreShip && rowStatus===null`), evaluate `isEpicCloseByState` against `{...state, phase:'SHIP', completed_phases:[...+prior]}` and persist nothing until the gate passes. Chosen over (a) reorder-transition-first (which persists SHIP on halt → `/sig:resume` mis-orients + bypasses the Layer-2 hook). `isEpicCloseByState` + `ship.md` stay byte-unchanged.
- **FR4/B28 fix = fix-divergence** (leave absolute-path links unrewritten in `computeLinkEdits`), not exempt-from-gate; **B27 ≠ B28** (separate fixes). AC4.4 corrected — the B27 flag is NOT "pre-existing dangling" (resolves pre-rename) → distinct dry-run line.
- **FR6 guard = `Object.hasOwn + typeof`** (not Symbol — Symbol would change the B25 test).

## 2026-07-25 — M5.E7 DISCUSS: the v2 direction audit / BR-8 (D-M5E7-1 … D-M5E7-5)

M5.E7 opens the long-deferred BR-8 landscape re-audit (locked 2026-07-04; deferred behind the doc-runtime by the 2026-07-16 override, and again by the E4/E5/E6 bug-squashes). DISCUSS reframed it before scoping it.

**D-M5E7-1 — The audit runs on "what does Signal need next," NOT "how much of each source repo have we absorbed."** `SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` §1 frames BR-8 as a **reflection scorecard** — score each of the 9 inspiration repos by how much of it is in Signal today, then queue the remainder. That frame is ~~~15 months~~ **[CORRECTED → ~3 months; see D-M5E7-6]** old and Signal has drifted decisively away from it: the repo now carries ~~eight~~ **nine** commands no source repo ever called for (`init`, `status`, `resume`, `add`, `checkpoint`, `doctor`, `index`, `migrate-memory`, `sweep`) plus an entire doc-runtime (eviction, hygiene guard, layout migration) present in *none* of the nine. The seed notices this in passing and keeps scoring against the repos anyway. The two frames produce materially different roadmaps: absorb-the-remainder drives toward completing the 10-phase architecture and makes pm-skills' empty upstream column "the #1 gap by definition"; what-does-Signal-need treats the nine repos as a **menu**, where an unported item is only a gap if it serves where Signal is actually going — and can legitimately conclude a whole port should be **cut**. Brett chose the second (2026-07-25). **Rationale that decided it:** Signal's two strongest assets — the calibration router and the doc-runtime — appear on neither frame's checklist. They came from Brett's own pain. That is direct evidence the checklist has not been where the value is. **Consequence: the evidence base changes** — see D-M5E7-3.

**D-M5E7-2 — M5.E7 gets Signal's first Epic-scoped PROFILE: `tier: FULL`, ceremony off, strict gates kept.** Per-Epic calibration shipped in v0.1.7 (M4.5.E11/FR3) and had **never been used** — no `{EpicID}-PROFILE.md` had ever been committed to this repo. `M5.E7-PROFILE.md` is the first, and it validates + shadows the project profile correctly (verified at DISCUSS). **Shape: "strict thinking, zero test theater."** `tdd_required`/`security_audit`/`performance_pass`/`simplification_pass`/`nyquist_enforcement` all off (the deliverable is a document — no code to test, no attack surface, nothing to profile); `gate_strictness: strict`, `plan_validation_dims: all`, `research_parallelism: 4`, `context_rot_reread: true` all **kept** (judgment quality is exactly what this Epic is sensitive to). `phases_skipped: []`; `review_depth: quality-only` (REVIEW repurposed as an adversarial read of the roadmap's reasoning). **Dropping to SPIKE was rejected on substance, twice:** (1) SPIKE skips SHIP, and the FR1 retro gate lives in the SHIP path (`retrospective.js:837`) — no SHIP means no `M5.E7-RETROSPECTIVE.md`, so `isEpicDone('M5.E7')` stays false forever and the Epic never enters the compounding record; (2) the SPIKE retro template (`references/retrospective-template.md:116–128`) has **no `## What to feed back into Signal`** — running the harvest-the-feedback Epic at SPIKE would produce the one retro shape that feeds nothing back. `tier: FULL` is retained deliberately because the retro gate validates against `profile.tier`, so FULL is what makes the FULL template (including that section) mandatory at close. **Finding for the retro:** Signal's tiers conflate "how careful must the thinking be" with "how much code-rigor ceremony applies" — a high-stakes research Epic wants strict gates and zero ceremony, and no tier says that. Whether that warrants a fifth tier, a documented hand-tune pattern, or nothing is a `## What to feed back into Signal` question at close, not a mid-Epic change.

**D-M5E7-3 — The audit's primary input is Signal's own accumulated record; the nine repos are checked second, as a menu.** The reframe changes the *method*, not just the conclusion. **16 of the 18 retro files carry a section literally titled `## What to feed back into Signal`** — plus `## What assumptions broke` (17), `## What surprised us` (17), `## What we'd do differently` (16). That is a structured, first-party, 17-Epic accumulation of demand signal, written when the pain was fresh, and it has **never been systematically harvested**. The seed's scorecard never touches it. So: mine the retros + `BUGS.md` + `BACKLOG.md` + `ISSUES-INBOX.md` + `OPEN-QUESTIONS.md` for demand (including *patterns* across carry-over chains — B24→B27/B28→B34/B35 is one signal, not three tickets), **then** check the four planned-port repos (gstack, pm-skills, superpowers, compound-engineering) live against that demand; spot-check the rest. GSD + Agent Skills get a spot-check only (seed: "Built… nothing material pending"). **Bounded below** by the seed's §2 five-item no-silent-drops list, which stays the hard completeness floor — the reframe widens the input surface from 9 repos to "everything Signal has recorded," which is a real over-run risk on a doc Epic, so retro/bug mining is depth-limited on top of that floor. **Assumption recorded, not assumed away:** there is **no written tester feedback to mine.** `M4.5.E5-LAUNCH-KIT.md` §3 is entirely unchecked — including "Capture returned friction logs → fold into the v0.1.(N+1) backlog" — so CONTEXT.md's "4 non-Signal users, positive reception" is recollection, not artifact. `MILESTONE-5.md`'s instruction that sequencing "should follow real user pain points from v1 usage" therefore **cannot be followed literally**; it resolves to Signal's own dogfooding pain plus Brett's judgment.

**D-M5E7-4 — The audit PROPOSES a sequence; Brett ratifies. Every candidate gets an explicit build / abandon / continue disposition.** Not binding output, and not menu-only. Binding was rejected because the single input that most determines correct order — where Brett wants Signal to go — exists only in his head, not in the corpus being mined; menu-only was rejected because it would close BR-8 without producing the sequenced queue that is BR-8's entire reason for existing. The **build / abandon / continue** verb set is borrowed from the SPIKE retro template's "Next:" section — the tier was rejected (D-M5E7-2) but its disposition vocabulary is exactly right for a per-candidate call, and "abandon" being a first-class verb is what makes D-M5E7-1's reframe operative rather than decorative.

**D-M5E7-5 — Deliverable is `analysis/SIGNAL-V2-ROADMAP.md`, and the seed is superseded in PART, not deleted.** The name `SIGNAL-INTEGRATION-RUNDOWN-v2.md` (the seed's §4.3 instruction) is **rejected**: "integration rundown" presupposes the absorb-the-repos frame that D-M5E7-1 just retired, and the name would drag every future reader back into it. Lives in `analysis/` beside its predecessor `SIGNAL-INTEGRATION-RUNDOWN.md` (single-home consistency; `.planning/`'s growth-policy/eviction rules are the wrong regime for a landscape doc). **Partial supersede:** the seed's §1 scorecard dies with the reframe, but §2 (the five unslated no-silent-drops items) and §3 (the settled per-repo compounding substrate, DECISIONS 2026-07-15 — explicitly *not* re-opened) survive intact and carry into the new doc. Archive the seed with a pointer rather than deleting it — relocate-never-delete, consistent with the doc-runtime.

*(Per the CONTEXT.md-is-orientation convention, these decisions live here in `DECISIONS.md`; `M5.E7-REQUIREMENTS.md` references the `D-M5E7-*` IDs directly.)*

## 2026-07-25 — M5.E7 PLAN: research corrections + scope hardening (D-M5E7-6 … D-M5E7-8)

PLAN-phase research (4 parallel agents, `M5.E7-RESEARCH.md`) falsified two claims inside the DISCUSS decisions above and reshaped the Epic's scope. Recorded here rather than by rewriting D-M5E7-1…5, which stay as written with inline correction markers — the log is append-only and the reasoning that *led* to an error is itself evidence.

**D-M5E7-6 — CORRECTION: the April analyses are ~3 months old, not ~15. Staleness carries ZERO weight in any abandon decision.** `analysis/REPO-ANALYSIS.md` is dated **2026-04-21**; this repo's first commit is **2026-04-13**; today is **2026-07-25** — an age of **3 months and 4 days**. The "~15 months" figure originates in `SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md:9` and was inherited uncritically into `D-M5E7-1`, `M5.E7-REQUIREMENTS.md`, and the PLAN research briefs. **Why it was load-bearing:** it supplied one of D-M5E7-1's two supporting arguments — that the absorb-the-repos frame was too old to trust — and it implied that a port left un-built for "15 months" had been implicitly rejected. Neither survives. Three months of not porting pm-skills, *while* shipping v1, closing an 11-Epic hardening milestone, cutting 11 releases, and building the doc-runtime, is ordinary sequencing under finite capacity — not evidence a gap was fake. **D-M5E7-1's reframe stands, but rests solely on its surviving support:** the calibration router and the doc-runtime — Signal's two strongest assets — came from Brett's own pain and appear on no source repo's checklist. That argument is unaffected by dates. Related count fix: D-M5E7-1 said "eight" self-invented commands and listed **nine** (stale from before `/sig:sweep` shipped). *Meta-note kept deliberately: this is what motivated reasoning looks like from the inside — an unchecked supporting detail that pointed where the argument already wanted to go. It was caught by an agent briefed to be adversarial, which is the argument for D-M5E7-8.*

**D-M5E7-7 — The April audit was right about CAPABILITIES and wrong about SOURCES and SEQUENCE. The roadmap inherits the first freely and treats the second with visible humility.** This is the sharpest prior-art finding and it *refines* D-M5E7-1 rather than replacing it. Measured on this project's own record: the April analyses' **capability-level** calls largely came true — but Signal built each one **natively, under a different name, from no source repo**. compound-engineering's ~50-agent review panel → Signal's **3-specialist adversarial panel** (which caught the `evict.js` false-green in v0.1.9 and ran a 12-case mutation matrix with 0 false-greens in v0.1.10). superpowers' `<HARD-GATE>` → `phase-gate-enforcer` + the exit-2 STATE write-guard hook + the FR1 retro gate (which **hard-blocked its own SHIP** in v0.1.10). planning-with-files' disk-as-cognitive-scaffold → the entire doc-runtime. gstack `/retro` + `/learn` → `RETROSPECTIVES.md` + the SHIP retro gate + 18 Epic retros. **Meanwhile the source-and-order queue went 0-for-6 in a single week:** the seed (2026-07-13) recorded a six-Epic v2-port queue; the 2026-07-16 override displaced E1 three days later, and **every one of the six planned port Epics was displaced.** Eleven releases have shipped containing **zero lines** from the April port queue. **Consequence for `SIGNAL-V2-ROADMAP.md`:** capability-level conclusions ("Signal needs a compounding memory loop") deserve real weight; source-and-sequencing conclusions ("port `learnings-researcher` from compound-engineering as Epic 2") deserve very little — the measured prior on that class of claim, on this project, is **0 for 6**. This is why FR4 commits hard near-term and loose far-term, and why every item carries a **trigger condition**, not merely a queue position: position is the thing that got overridden six times.

**D-M5E7-8 — The audit must run an explicit counterfactual pass against itself; and its `build` items land in `BACKLOG.md`, not only in `analysis/`.** Two structural mitigations for two confirmed risks. **(a) Confirmation bias is structurally unavoidable here** — the audit is run by the same agent-and-human pair that built the thing being audited, mining a corpus *they wrote*, to decide whether what they built was right. That corpus faithfully records the pain of work that was **done** and is structurally silent on the pain of work **never attempted**: nobody logs friction with upstream phases they don't have. Mining retros will surface doc-runtime and state-management pain because that is what was built, and will surface nothing about ideation — and reading that silence as "no demand" would confirm the existing course using evidence that could not have contradicted it. **Mitigation (FR7): one deliberate counterfactual pass — "which of the four ports would have prevented a bug we actually shipped, or shortened an Epic we actually ran?"** That question can return an uncomfortable answer, which is exactly why it is worth asking; D-M5E7-7 suggests it may. **(b) A roadmap in `analysis/` is enforced by nothing.** Signal's own record on unenforced docs is damning: `MILESTONE-5.md`'s 25 port checkboxes have **never had one checked**; `M4.5.E5-LAUNCH-KIT.md` §3 sits entirely unchecked *while v0.1.4 demonstrably shipped*; and backlog item **A3 "Tester-friction intake protocol"** — identified 2026-07-04 as the specific missing mechanism behind M4.5's exit criterion — was never built, after which **the exit criterion it protected was declared met on recollection** (DECISIONS 2026-07-15). **Mitigation (FR5): at SHIP, every `build` item is also written into `BACKLOG.md` as a dated entry with its trigger condition** — `BACKLOG.md` is a live doc the hygiene runtime already touches, whereas `analysis/` is checked by nothing.

*(Corrections C1 (B34/B35 chain mis-grouped) and C2 (harvest base 12, not 16) are recorded in `M5.E7-RESEARCH.md` §0a and applied to `M5.E7-REQUIREMENTS.md`; they revise acceptance criteria rather than decisions.)*

## 2026-07-25 — M5.E7 EXECUTE checkpoint: dispatch discipline (D-M5E7-9)

Captured via `/sig:checkpoint --context` at the Wave 1 → Wave 2 boundary, before a planned context clear. These are execution-process rules learned during Wave 1, recorded so the next session doesn't re-derive them the same expensive way.

**D-M5E7-9 — Three dispatch rules, all learned by being bitten during M5.E7 Wave 1.**

**(a) Direct-vs-delegate is a deliberate call, not a default.** Delegate the large / isolated / independence-requiring tasks; the orchestrator does mechanical and judgment-synthesis work directly. Wave 1 applied this: the retro harvest (~1,510 words) was faster to read directly than to brief, while the 174 KB ledger sweep and the three live-repo verifies went to agents. This *dogfoods demand item #29* (M5.E4 retro): *"a ~30-min/task executor floor makes pure-sequential dispatch impractical … Signal's EXECUTE guidance could note the direct-vs-delegate tradeoff rather than implying uniform delegation."* Recorded because the corpus explicitly asks for the tradeoff to be **stated** rather than assumed.

**(b) Never `git commit --amend` on a shared worktree; dispatch sequentially or with `isolation: "worktree"`.** Three agents were dispatched concurrently against one worktree and **two silently absorbed a sibling's file** — `--amend` targets whatever HEAD is at that instant, not the agent's own commit. A `git reset` was needed to unpick it (reflog: `545e685` → amended ×2 → `6b5db56` → reset to `136e598` → `1d057d7` → amended into a sibling's commit → reset → `3c5d8d3`). Verified independently: no work lost, each final commit holds exactly one agent's file. **This is a live reproduction of demand item #32** (M5.E5 retro): *"EXECUTE guidance should distinguish 'logically parallel' from 'safe to dispatch concurrently' … every executor runs the full suite + commits against a shared index, so concurrent dispatch races."* The hazard was harvested into the register roughly 40 minutes before it bit. **Consequence for the audit:** Theme F is no longer merely un-tracked, it is *actively costing* — which is stronger evidence than "raised three times," and it has a named upstream supply (superpowers' `using-git-worktrees`, one of four skills with no Signal analog).

**(c) Never mark a delegated task done on an agent's self-report — verify the file on disk AND the commit sha.** Dogfoods demand item #17 (M5.E1 retro): *"never trust an executor's self-report — re-run the suite + review the diff."* It paid off immediately in Wave 1: agent t4 reported its task complete while its artifact was still untracked (`?? .planning/M5.E7-SUPPLY-SUPERPOWERS.md`). On a self-report that task would have been marked done with the deliverable unsaved.

*Recorded in `DECISIONS.md` only — deliberately NOT dual-written to `CONTEXT.md` § Locked Decisions as `commands/checkpoint.md:12` (D16) instructs. That instruction contradicts `references/doc-runtime-model.md:56` ("single-home"), is filed as **B37**, and following it here would have committed the exact violation the doc-runtime exists to prevent.*

---

## 2026-07-26 — M5.E7 EXECUTE: bug deferral is ratified, with two conditions (D-M5E7-10)

**D-M5E7-10 — The nine open bugs defer to a bug-squash Epic; M5.E7 does not fix them. But the container has to be real, and the roadmap has to say what is broken under it.**

**The call (Brett, 2026-07-26):** keep M5.E7 moving; roll `B32`–`B40` into a future bug-squash sprint rather than interrupting the audit. **Ratified** — and it corrects an over-strong recommendation I had just made ("fix `B39` before `S4.t9`"). That recommendation rested on a wrong premise: AC5.6 lands roadmap `build` items in **`BACKLOG.md`**, which is live and hygiene-touched. The broken watchlist governs **parked** items only. The roadmap's enforcement path does not run through the defect, so the deferral costs nothing structural. Recorded because the reasoning is the useful part — *"this blocks that"* claims should name the path, and mine didn't.

**Condition 1 — the bug-squash Epic must be a named item in the roadmap's proposed sequence, not an intention.** Verified 2026-07-26: **no bug-squash sprint exists in `BACKLOG.md`** (Sprints 2–7 are re-aim / doc-runtime residual / compounding / cockpit / calibration / ports). So "a future bug-squash sprint" currently names a container that does not exist — and **nine open bugs** (`B32`–`B36` `needs-triage`, `B37`–`B40` `confirmed`) have no home in the sequenced roadmap at all. Deferring into an unnamed container is the same silence pattern this Epic catalogued against five un-cut ports and against `B39`'s own never-walked watchlist. **`S4.t9` creates the Epic with a real ID and a trigger; `S4.t11` lands it in `BACKLOG.md`.**

**Condition 2 — `S4.t9` must state the `B39` caveat wherever it proposes a trigger.** P4 requires every roadmap item to carry a **trigger condition** rather than a queue position, on the measured grounds that position got overridden six times (D-M5E7-7). `B39` establishes that Signal's trigger-evaluation mechanism **has never run** — `/sig:plan` was never taught to walk the watchlist a BR-6 decision instructed it to walk. A roadmap that leans on triggers while the trigger substrate is inert would be promising an enforcement it does not have, which is precisely the shelf-ware failure D-M5E7-8(b) exists to close. **The roadmap states this plainly and carries `B39` as a `build` candidate in its own right** — it is the item that makes every other trigger real, so it is an *input* to the sequence rather than a blocker on it.

*`B40` (citation integrity in `analysis/` unenforceable by construction) defers on the same terms, with its fix folded into the `analysis/` staleness recommendation (`M5.E7-CORRECTIONS.md` §2) rather than solved separately.*

---

## 2026-07-26 — M5.E7 Wave 3: two Brett corrections to the audit's own conclusions (D-M5E7-11, D-M5E7-12)

Raised at the post-S3.t7 checkpoint. Both correct the *audit*, not the sources — recorded because in each case the reasoning was wrong in a way the audit's own machinery did not catch.

**D-M5E7-11 — "Genuine independent second opinion" was never dispositioned. It is reopened as a Signal-native candidate, and the reasoning that buried it has a named hole.**

**What is NOT reopened:** S2.t6b and S3.t7 are both correct on the facts. compound-engineering's cross-model review **substitutes** a reviewer rather than adding one — the peer receives the *same* `adversarial-reviewer.md` brief (`cross-model-review.md:3`), is adversarial-only (`:5`), and is **mutually exclusive** with the in-process reviewer (`persona-catalog.md:38`). **Do not port their implementation.** That verdict stands.

**What is reopened:** both passes evaluated *"should Signal port compound-engineering's thing?"* **Neither evaluated *"should Signal have a genuine independent second opinion?"*** The capability fell through the gap between "port theirs" and "build our own" and never received a verb. Brett caught this at the checkpoint: *"why are we nixing that vs. actually DOING / implementing what we had planned (re: 'second opinion') — I'm confused that because we didn't implement it properly we're just killing it?"* He is right. Under **AC3.4** this is precisely a Signal-native candidate — demand that exists and that no source repo supplies properly. **It goes to S3.t8 as its own row with its own verb.**

**The hole in the dismissal, stated so it is not repeated.** `M5.E7-COUNTERFACTUAL.md` §2.4 point 3 justifies *"cross-model adds nothing"* with *"Signal's diversity is lens-diversity, and it worked on the case in question"* — citing the panel catching **B14**. But **B14 is the case the panel won**: an incomplete fix authored inside M5.E4 and caught by that same Epic's REVIEW, in-phase, on its own work. **B19 is the case it lost** — shipped green and inert for a full release, found by M5.E4 PLAN research rather than by any REVIEW. **The dismissal leans on the win and skips the loss.** Compounding it: §2.4's recommended answer to B19 is **technique 5**, three lines of prompt with no enforcement, and §5 blind spot 6 concedes *"whether an agent reading it would have caught B19's `ann.legend === null` predicate is unknowable."* Meanwhile §3.2 established that prompt-shaped interventions run at **7-of-12 adherence**. So the recommendation answers **the one failure that reached users** with exactly the class of mechanism **the same document proved cannot be verified**. That tension is an argument for reconsidering a real second opinion — not for building compound-engineering's.

*Process note, recorded deliberately: this is the orchestrator reopening a verdict produced by its own independence mitigation, which is the one move most likely to look like bias reasserting itself. It is legitimate **here** because the defect is in the pass's reasoning, not its facts — the facts are what exposed the hole. A future reader should hold any further reopening to the same standard: name the specific reasoning defect, or leave the verdict alone.*

**D-M5E7-12 — The measurement gap is the audit's spine, not one of its ranked findings. The roadmap leads with it.**

Brett's read at the same checkpoint: *"there is a theme here that we don't have a strong enough (or could have a stronger) 'measure what works' mechanism."* Correct, and it collapses six separately-ranked findings into one. **Signal cannot detect whether its own interventions work, in any dimension:** no test anywhere asserts a prompt instruction was obeyed (verified by grep, S3.t7 §3.2) · `ce-retune`'s A/A noise floor measures **7-of-12 workflow adherence and a 7.12× output-token spread on byte-identical code** · false-greens are the register's largest cluster (9 retro items, cluster **B**) · **B39** was ratified 2026-07-04 and never built, *with nobody noticing for three weeks* · the claimed-facts-ledger gap (retro #4) · and this Epic's own demand register **miscounted itself twice**, caught only by re-derivation. **Consequence for S4.t9: this leads the roadmap rather than occupying a rank in it** — it is the condition under which every other item can be evaluated at all.

**The telemetry bolt-on is a roadmap candidate, with a hard ordering constraint.** Captured verbatim via `/sig:add` → `ISSUES-INBOX.md` (2026-07-26, *"Measurement layer + optional telemetry bolt-on"*); that entry is its single home and is not restated here. Two things ratified now: **(a) mass-market palatability is explicitly waived** as an objection (Brett: *"I do NOT care about this being acceptable for the masses"*), so consent is a **design parameter** of the optional bolt-on, not a blocker; **(b) local behavioral measurement is a prerequisite for cross-install aggregation** — you cannot pool across installs what you cannot measure in one, and getting it backwards collects noise at scale. The A/A noise floor argues both sides honestly: many runs are needed to see a real effect (so pooling is valuable), and **four users will show nothing for a long while** (so it is not a near-term signal source).

**Named as scope growth, not absorbed silently** — the D5 discipline this Epic's own validation applied to FR6/FR7. **M5.E7 ships no code**; this is a candidate for S3.t8's disposition and S4.t9's sequence, and nothing here is built inside this Epic.

---

## 2026-07-26 — Agent-effectiveness alignment pass: two calls (permission model; M5.E8 scope held)

Raised outside any Epic, at Brett's request, after reading Span's *Beyond the Model* (Q3 2026) — a
103-team / 12-week observational study of what distinguishes effective agentic development. The
assessment is `analysis/AGENT-EFFECTIVENESS-ALIGNMENT.md`; **that document is its single home** and
the evidence is not restated here. Findings captured to `ISSUES-INBOX.md` the same day for
disposition at the next `/sig:plan` drain — deliberately **not** written straight to `BACKLOG.md`,
so the capture lifecycle stays the one path in.

**Headline of the assessment, for the record.** Signal is strong on the study's prompt-clarity and
quality-stewardship axes — ahead of the recommendations in three places (DISCUSS as a gated phase,
the REVIEW panel, and `nyquist_enforcement: strict`'s proof-of-fail, which is stricter than the
study's "run the suite"). It is **absent on environment readiness**, the axis with the study's
largest measured effect (88% higher merged-lines-per-human-turn per point; R² = 0.949). Signal
*detects* readiness at `/sig:init`, never verifies it, and nothing reads it — `readLandscapeMeta`
(`tools/lib/status.js:194-201`) extracts the captured-on date and nothing else.

**Call A — environment execution is a *permission* question, not an exception. (Brett's reframe.)**
The question posed was narrow: should Signal start executing build/test/lint commands in a
stranger's repo? Brett rejected the framing as too small — the right shape is a **declared
permission model** (`/sig:permissions`, or a PROFILE.md `authority` block), likely established at
onboarding, with a future in which the user is required only for what/why decisions and Signal runs
unattended from EXECUTE onward.

The reframe is adopted because it names the actual blocker: **Signal has no vocabulary for what it
is allowed to do in a given repo.** Read-only is not a per-project choice; it is a hard-coded
default in two files (`agents/scanners/quality-scanner.md:209`,
`agents/scanners/stack-scanner.md:150`). A permission model makes that a setting, and every
environment-readiness item becomes a **consumer** of it rather than an exception to it. It also
makes mechanical the *gate at product altitude* norm, which today lives in prose and depends on each
agent honoring it.

**Consequences recorded now, scope deliberately not set:** the readiness baseline check and the
"should `/sig:init` offer to draft the project's own `CLAUDE.md`/`AGENTS.md`" question are both
**downstream** of this and are not separate builds. `/sig:audit`'s candidate **7th dimension —
agent executability** — is downstream too, and that entry is annotated in place rather than
duplicated. **M5.E12 is not silently widened:** it is scoped to drift in docs that *exist*;
authoring a build/test contract file is a widening and must be named as one.

**Call B — M5.E8's scope holds at instruction-adherence. Trajectory scoring is parked with a
trigger.** Proposed: widen M5.E8 to score whole trajectories on the study's three axes. **Declined**
(Brett): *"keep our current posture… 'Trajectory Tracking' feels like another level / dimension of
that and the two may be better served as separate but complimentary endeavors."*

The distinction that makes the decline right: the study measures **human→agent prompt clarity**;
Signal's measured problem is **Signal's own instruction→agent adherence** (7 of 12). Different
failure modes — the 27%-per-point coefficient does not transfer, and one Epic chasing both ships
neither cleanly. *Trigger for the parked half: M5.E8 lands and instruction-adherence measurement is
repeatable* — the same ordering constraint as the cross-install telemetry bolt-on (D-M5E7-12), for
the same reason.

**What the study contributes to M5.E8 without changing its scope:** the Appendix's rubric-building
method — trace review over the best/worst tails → rubrics written as **observable** criteria, with
any dimension that cannot be operationalized **dropped** → automated scoring → validation against
blind human ratings. **The "observable or dropped" rule is worth adopting in E8(a) now.**

**Two things recorded so they are not later mistaken for findings.** (1) The study found no
threshold below which clarity and stewardship stop paying, while Signal's calibration assumes one
(SKETCH drops TDD and skips REVIEW). The study examined **merged production PRs** and says nothing
about throwaways, so it cannot refute tier-calibration — but Signal adopted that threshold on
judgment, not measurement, which is the same shape as `B38`. **An untested assumption worth a line
in M5.E8's scope, not a redesign.** (2) The source is observational, vendor-authored (Span sells the
evals), and its Appendix carries **literal unfilled placeholders** where the inter-rater agreement
statistic and the list of controlled confounds should be. **Directional only — no coefficient from
it is hard-coded into anything.** That is correction **C6**'s rule applied on arrival rather than
three months late.

---

## 2026-07-27 — M5.E9 goes first, and the retro gate becomes Epic-only (D-M5E9-1, D-M5E9-2)

Both ratified by Brett 2026-07-27, off the `B42`–`B45` catalog. The occasion was an outside report:
a live `/sig:ship` on **`nextpass`** — a project that has run in **linear mode** (`current_epic:
null`) its whole life — halted on step zero, and two Signal helpers misbehaved on the same close.
Three of the four items were Signal's; the fourth (`npm run ship:archive`) belongs to the reporting
project's own tooling and is recorded as **not Signal's** in [`BUGS.md`](BUGS.md).

**D-M5E9-1 — The FR1 retrospective gate is Epic-only. A linear-mode project owes no retrospective at
SHIP, and `/sig:ship` must run for it.**

`B42` (**P1**, the ledger's first) is not degraded behavior: `shipFR1Check` hard-halts on
`current_epic: null` before any Epic-close reasoning, `ship.md:27` runs that check ahead of every
other step regardless of `gate_strictness`, and `ship.md:41` states there is no bypass. **Linear mode
is documented as first-class in the other six phase commands** and in `new-project.md:35`. So the
fix is *"the requirement does not apply,"* not *"design a linear retro obligation now."* The
alternative — building a milestone-scoped retro path for linear projects — was **considered and
declined at this point**: it is more design than a P1 unblock warrants, and `resume.js:129` already
asserts the milestone-scoped shape, so the option stays open as its own decision later.

**This softens D-E9-3's "no bypass" and says so out loud.** D-E9-3 locked the retro gate with no
flag, no env var, no extra-args trick — and that stands **for Epics**. What D-E9-3 never decided is
what a project with no Epics owes, and the code silently answered *"it is broken"* rather than *"the
rule does not reach it."* Two pieces of evidence that the halt was never a deliberate reading: the
enforcement layers **disagree on the identical condition** (Layer 1 fails closed; Layer 2's
`checkProposedStateWrite` fails **open** on a null `current_epic`, `retrospective.js:500-502`), and
`isEpicCloseByState` returns `false` on the same input (`:412`), leaving the whole B26/B30 Epic-close
machinery dead code in linear mode. **Scope note for whoever implements it:** three gates assume an
Epic, and `ship.md:34`'s milestone-file derivation runs *before* `shipFR1Check` — fixing only the
latter leaves ship blocked.

**D-M5E9-2 — M5.E9 runs before M5.E8. The measurement Epic keeps its ID and its slot behind the
patch release.**

M5.E7 declared **M5.E8 (measurement) unconditional-next** (D-M5E7-8). That holds as *sequence
intent*, not as a bar on a P1: a defect that fully blocks a documented mode for a real project
outranks a research Epic, and the unblock is small. **IDs are not resequenced** — `## Vocabulary`
in [`PROJECT.md`](PROJECT.md) locks ID-as-identity and explicitly anticipates this case (*"M4.t13
might ship after M4.t17"*), so **M5.E9 shipping before M5.E8 is the rule working, not drift.**
Recorded here because a future reader hitting E9-before-E8 in the log would otherwise read it as a
mistake.

**Scope of the release (v0.1.12, per the 0.1.x cadence):** `B42`, then the `state.js:388-395` cluster
(`B43`+`B44`+`B45`) as one commit, then `B41` — **in that order**, because wiring four more commands
to `transitionPhase` before the cluster is fixed multiplies the sites where history gets collapsed.
Plus **one end-to-end test of a linear-mode project with a multi-unit history**: not coverage
ceremony — that exact combination is the blind spot all four bugs lived in for nine releases, and
Signal-on-Signal has been Epic-mode since M4.5.E11 and structurally cannot reach it. **M5.E9's other
items** (`B36`, `B39`, retro replay, EXECUTE dispatch guidance, SHIP-time ledger reconcile, the dated
falsifier check) stay in the Epic as later slices — they are not in v0.1.12.

---

## 2026-07-27 — M5.E9 scope: B41 rides along; detect-in-`sweep` / repair-in-`migrate-memory`; the phase list is a log (D-M5E9-3 … D-M5E9-5)

Three follow-on calls, same conversation as D-M5E9-1/2. **D-M5E9-4 corrects a recommendation I had
just made**, which is the part worth keeping.

**D-M5E9-3 — `B41` ships inside v0.1.12, not the release after.**

`B41` is the only one of the four that is not pure repair: it makes `plan`/`execute`/`verify`/`review`
start writing a phase they have never written, which every project will notice. The case for holding
it was a smaller, safer unblock; the case for including it — **ratified** — is that the ordering
constraint is already handled (it lands *after* the `state.js:388-395` cluster, never before), and
splitting means every project records an incomplete history for another cycle. One release.

**D-M5E9-4 — Detection belongs in `/sig:sweep`; repair belongs in `/sig:migrate-memory`. `/sig:doctor`
is out of scope — it diagnoses the plugin install, never the invoking project's docs.**

**Correcting myself:** I recommended teaching `/sig:doctor` to flag junk entries and collapsed
histories. **Wrong scope, caught by Brett.** `doctor.md`'s own frontmatter is unambiguous — *"Claude
Code plugin install-state diagnostician… 5 documented failure modes"* — it repairs the **install**,
not the project. Signal already has the right two commands and they already have the right shapes:
`/sig:sweep` is the **read-only, project-scoped hygiene reporter** with an existing
`structural`/`advisory` split, and `/sig:migrate-memory` is the **propose-then-apply repairer**
(dry-run by default, relocate-never-delete, git-reversible, *"only after the user has eyeballed the
plan"*). **So the interaction Brett specified — warn, name the command, user agrees, then repair —
is not a new mechanism; it is the one already built.** No new command.

**The honest split, because the two problems are not equally fixable:** a **junk entry** is
quarantinable → `sweep` reports it, `migrate-memory` gains a vector that relocates it out of the
frontmatter. **Already-collapsed history is not recoverable** — the entries are gone from the file
and no pass can reconstruct them → `sweep` warns that a history looks truncated and says so plainly;
it must not imply a repair exists. **Both halves are affordable in v0.1.12 precisely because neither
needs new machinery**, which is what changed my earlier "detection only" recommendation.

**D-M5E9-5 — `completed_phases` is an append-only log, not a set. Keep it in markdown; this is not an
issue-tracker question. But the log now owes a trim rule.**

The dedupe (`state.js:393-395`) goes — the deletion is bigger than the addition. **Brett's follow-up
was the right one to ask:** does "log" push Signal toward Linear / GitHub Issues? **No — different
kind of data.** `completed_phases` is machine state read by commands at runtime; issue trackers hold
**work items**, which for Signal are [`BUGS.md`](BUGS.md) and [`BACKLOG.md`](BACKLOG.md). That
question is real and already parked with a trigger (*"GitHub Issues… deferred until Signal has live
users"*, `BUGS.md` header) — it just lives one file over and is untouched by this call.

**What the log decision does create is an obligation nobody has priced:** unbounded growth. The live
report is at **53 entries** in YAML frontmatter, and Signal already has a 529 KB `STATE.md` incident
on record (`B8`). Epic mode is covered by accident — `setCurrentEpic` zeroes the list on every roll —
and **Epic-close SHIP already evicts STATE narrative to `archive/.../STATE-NARRATIVE.md`
(`ship.md` §5.5, M5.E1 FR2b). Linear mode has neither.** So v0.1.12 must say **where a linear
project's phase log gets trimmed and to where**, or the fix trades silent deletion for silent bloat —
the same failure wearing the opposite mask. Pin it in `references/state-schema.md:128`, which today
specifies the dedupe without ever stating the scope it assumed.

---

## 2026-07-27 — M5.E9 DISCUSS: the phase log's trim rule, in both modes (D-M5E9-6, D-M5E9-7)

The two gray areas the DISCUSS gate had left. Both answer the same question — **once the log stops
being silently collapsed, where does the history actually go?** — and D-M5E9-5 is what made them
owed. Spec: [`M5.E9-REQUIREMENTS.md`](M5.E9-REQUIREMENTS.md) FR5.

**D-M5E9-6 — In linear mode the phase log trims at `/sig:ship`: the finished run's entries relocate
to `.planning/STATE-HISTORY.md`, and the live list starts fresh.**

Chosen over *warn-only* and *let it grow*. The reasoning that decided it: **a warning you can ignore
is the weakest brake Signal has**, and this Epic is already fixing `B39` — a trigger that was written
down, never walked, and enforced nothing. Adopting warn-only here would have re-created that shape in
the same release that catalogues it. *Let it grow* was rejected on the record rather than on
principle: `B8` is a **529 KB `STATE.md`** in a real project, so "it will not get big" is a claim
Signal's own bug ledger contradicts.

**Target is the existing `.planning/STATE-HISTORY.md`**, not a new file — it is already *"where STATE
content goes when it leaves the live file"* (M5.E1 FR2a relocates the legacy narrative there), and
[`../references/doc-runtime-model.md`](../references/doc-runtime-model.md) classifies append-logs as
**grow-by-design, bounded by TOC + grep, never loaded whole**, which is exactly this data's shape.
**`/sig:ship` is the right boundary** because it is the only close event a linear project actually
has.

**D-M5E9-7 — On an Epic roll, `setCurrentEpic` archives the closing Epic's phase list before it
resets — and the write lives in the state-mutation seam, not in command prose.**

`setCurrentEpic` (`state.js:614-616`) has zeroed `completed_phases` since the `B9` fix, and the
Epic-close eviction it pairs with operates on the STATE **body**, never the frontmatter
(`evict.js:296`) — so **the phase list is deleted with no copy kept anywhere.** Under D-M5E9-5 that is
unarchived history loss: the same defect this Epic exists to fix, in the mode that currently looks
healthy. Chosen over *leave Epic roll alone* — whose real argument (the retrospective already narrates
the Epic, so the dated list is thin) is fair, but it buys a smaller blast radius at the price of
turning the rule into *"a log is never silently deleted — except here,"* and an unstated exception is
how the original bug survived nine releases. Entries append to
`archive/<milestone>/<epic>/STATE-NARRATIVE.md`, the file that already holds that Epic's evicted STATE
content.

**The placement is the load-bearing half (AC5.3).** Putting the archive step in `discuss.md`'s
Epic-open prose would keep `state.js` pure and cost nothing today — and would be **precisely the
`B41` failure mode**: a guarantee that lives in a command file, which four commands have already
demonstrated they simply do not execute. It goes in the seam, where it cannot be skipped.
**The coupling of `state.js` to the archive path is a real cost and is accepted deliberately, not
overlooked.**

---

## 2026-07-27 — M5.E8 DISCUSS: measurement is an on-demand harness over observable traces (D-M5E8-1 … D-M5E8-3)

M5.E7's headline finding — **Signal cannot detect whether its own interventions work** — becomes
buildable here. M5.E9 made it urgent rather than theoretical: that Epic added instructions to four
command files and **could not prove any agent follows them**, and said so in its own test-file header.

**D-M5E8-1 — The measurement runs as an on-demand harness, not in CI, and not as transcript archaeology.**

Chosen over wiring live agent runs into the test suite, and over analyzing recorded real sessions.

*Against CI:* a real agent call costs money, takes minutes, and **returns different answers on
identical input**. A test that fails for no reason gets switched off, and a switched-off test is worse
than none — it reads as coverage. Signal's suite is deterministic and offline by design
(`references/doc-runtime-model.md`); putting a nondeterministic paid call inside it would make the
whole suite untrustworthy to protect one measurement.

*Against transcript archaeology:* it **cannot answer the question the Epic exists for.** *"Does this
instruction change behavior?"* requires a comparison against not having it, and recorded history has
no control group. It measures what happened, never what caused it.

**D-M5E8-2 — Only instructions with an OBSERVABLE TRACE are measured. The measurement is a
delete-the-instruction control run.**

The harness runs a command twice — once as written, once with the instruction line removed — and
checks for a trace that needs no judgment: a file exists, a state field changed, a commit landed, a
string appears in an artifact. **Chosen over rubric scoring by a second model**, which would cover
Signal's prose-shaped guidance too but measures with the same instrument it is testing: a
disagreement means either the agent disobeyed or the judge misjudged, **with no way to tell which**.
That is the failure shape M5.E7 already catalogued.

**The cost is real and must be stated in the deliverable, not discovered later: most of what Signal's
command files say leaves no trace.** *"Surface ambiguity," "don't rationalize," "gate at product
altitude"* — the guidance carrying most of Signal's value — is **out of reach of this method**.
Quantifying that ceiling is itself a requirement (FR5), because *"we measured the measurable 12%"*
is an honest finding and *"we measured adherence"* is not.

**D-M5E8-3 — The harness is anchored to the SHIP pre-ship checklist, not to a trigger.**

On-demand measurement has one failure mode, and it is the one this codebase keeps re-committing:
**nobody runs it.** `B39` established that Signal's trigger-watchlist has **never been walked**;
M5.E7's own falsifier needed a *dated* check because a null result fires nothing; `B46` found 45
dispositions written where nothing reads them back.

So the anchor is a line in `commands/ship.md` § 1 Pre-Ship Checklist — beside the `docs/map` line —
because that list is **demonstrably read at every release**. **Not a trigger, not a backlog entry,
not a note.** *Decided rather than asked: the reasoning is Signal's own record, and there is no
product judgment left in it once that record is read.*


---

## 2026-07-28 — What the build found: the seam, the threshold, and a number that moved (D-M5E8-4 … D-M5E8-6)

Three decisions taken during M5.E8's EXECUTE. All three are corrections to things the Epic's own
DISCUSS/PLAN/RESEARCH had assumed, which is what an execution phase is supposed to surface.

**D-M5E8-4 — The control-arm seam is `claude --plugin-dir`, not the `CLAUDE_PLUGIN_ROOT` env var,
and proving the seam is a permanent precondition of every verdict.**

R3 justified the env-var seam on the grounds that `commands/*.md` reference `${CLAUDE_PLUGIN_ROOT}`
for skill paths. That is **text substitution inside an already-loaded command**, not command
*resolution* — different mechanisms, and the difference is the whole Epic. Direct counter-evidence
was available in the session that built this: invoking the `sig:execute` skill loaded the **v0.1.11
plugin cache**, not the working repo. `--plugin-dir` is a documented CLI flag for exactly this.

**Why it is a precondition and not a setup step.** If the mutation never reaches the agent, both
arms produce the trace, and the harness reports **`inert`** — an outcome this Epic *pre-committed
to* as acceptable, specifically so nobody would treat it as a crisis. A plumbing failure would have
passed straight through the one guardrail meant to catch surprises and been written into
`ADHERENCE-LOG.md` as a measurement. So `resolveVerdict` **refuses to return anything** unless the
seam was proven that run. Same discipline as AC1.4: never emit a result-shaped output when you did
not measure.

Probed and **PASS** on both arms: `--plugin-dir` loads the copied tree, *and* shadows the installed
`sig` plugin (a genuine conflict — `sig@signal` is enabled at user scope, so both trees offered
`/sig:status` and the copy won).

**D-M5E8-5 — The verdict threshold is fixed in the registry before any run, and it is conservative:
anything short of a unanimous split is `indeterminate`.**

AC3.3 pins each canary's *trace* before a run, because a trace chosen after seeing output is a
rationalization. The **mapping from run counts to a verdict has exactly the same problem** and was
not covered — so it now sits in `references/adherence-canaries.json` → `verdictRule`, written before
the first measurement. Without that, the threshold gets chosen after seeing 3/3 versus 2/3.

Four verdicts, three of which are not "pass": `obeyed`, `inert`, `absent`, `indeterminate`.
**`indeterminate` is first-class** — a split vote, a failed run, or a backwards result is an honest
*we do not know*, not something to round into a finding.

**D-M5E8-6 — The published ceiling is 91/407 (22.4%), and R1's "the phases doing the most work are
the least measurable" is withdrawn as false.**

The pre-build estimate was 22/202 = 10.9%. The built classifier measures **22.4%** — the estimate
required directives to *begin* with an imperative verb (dropping the corpus's most common shape, a
leading clause) and matched library calls by shape rather than against the 263 real `tools/lib`
exports. **The inference that died with it matters more than the number:** R1 claimed `execute.md`,
`verify.md`, `review.md` and `calibrate.md` name *zero* library calls. They name **4 / 3 / 3 / 0**,
including `transitionPhase` — this Epic's own canary. The canary set is **not** confined to the
low-risk phases.

The estimate is left **verbatim** in `M5.E8-RESEARCH.md` under a superseded-by-measurement block
rather than rewritten, because the plan was built on that number and deleting it would hide that.

**What survives unchanged:** roughly **three in four** of Signal's own instructions still leave no
observable trace, and the guidance carrying the most value — *surface ambiguity*, *don't
rationalize*, *gate at product altitude* — remains entirely out of reach of this method. The
published log states the remainder is **unmeasured, not passing**, and a wording test pins that
sentence.

## 2026-07-28 — M5.E13 DISCUSS: guards that don't guard (D-M5E13-1 … D-M5E13-8)

**D-M5E13-1 — The Epic takes ID `M5.E13`, not the next-derived `M5.E10`.**

`deriveNextEpicId` returns `M5.E10`, but `M5.E10`/`E11`/`E12` are live roadmap headings with inbound
references — `BACKLOG.md:234` homes `B38` at M5.E10, and several entries read *"absorbed into
M5.E12."* Renumbering breaks those; a fresh ID does not. `## Vocabulary` in `PROJECT.md` locks
**ID-as-identity**, and M5.E9-before-M5.E8 (D-M5E9-2) is the precedent. **IDs are identity, not
sequence.**

**D-M5E13-2 — Scope: the four defects are one story, and the story is the Epic's name.**

`B48` (an unconditional instruction a correct agent refused) · `B39`/`B46`/`I2` (the guard-never-called
class) · `B36` + retro-index freshness (a release gate that skips silently) · `B49`'s remainder (a
version check covering two of three files). Each is *something built to catch a mistake that does not
catch it*. **Explicit non-goal: no new status-tracking machinery** — see D-M5E13-7.

**D-M5E13-3 — The retro's candidate mechanism covers one of its own three instances. Fix the three,
build the narrow test, label the gap.**

M5.E8's retrospective proposed *"a hygiene check asserting every `--check`-style guard in `tools/`
has a caller."* Checked against the artifact rather than accepted: `--check` appears in **exactly one
file** in all of `tools/` — `adherence-ceiling.js`, which is `I2` itself. `B39` is an instruction in
a document no command implements (`grep -ril watchlist commands/ tools/` → nothing). `B46` is a data
write-back nothing ran (0 stamps in `ISSUES-INBOX.md`). **Population of the proposed test: one.
Coverage of its own motivating set: one of three.**

The retro wrote the mechanism from the shape of the most recent instance rather than from all three —
**the class named in `analysis/CLAIM-INTEGRITY-ANALYSIS.md`, committed the same week, appearing in the
document that named the sibling class.** Recorded as a sighting, not just a scope correction.

Rejected: a cross-shape mechanism covering document-shaped obligations. It needs a declared registry
— new schema, new authoring — and overlaps the tracker Epic. **The gap is labeled in the test's own
name instead** (FR2.3), because an honest partial beats an over-promised mechanism, and because
shipping a check that claims more than it does would repeat the exact error above.

**D-M5E13-4 — `B48` is fixed in both the text and the code beneath it.**

The agent that refused the instruction **obeyed correctly** — it declined because obeying would write
a false record. So adherence is not the broken part; the instruction is simply wrong, which argues
for a cheap text fix. Two things outweigh that: the Lanes proposal (`e61f614`) adds two more commands
that write phase records and its own §10 says the precondition idiom must be settled before it is
copied; and this Epic's thesis is that mechanisms beat instructions.

So: reword all four commands in one shared wording, **and** make `recordPhase` refuse to append a
phase whose artifact does not exist, resolved through the existing `resolveArtifactPath` rather than
new detection logic. Accepted cost: this reopens `state.js`, which M5.E9 stabilized (`B43`/`B44`/`B45`
all lived there). Mitigation is AC1.3 — a legitimately artifact-less phase must be enumerated in the
tests, not assumed absent.

**D-M5E13-5 — M5.E13 runs before M5.E10, on collision grounds first and urgency second.**

`CLAIM-INTEGRITY-ANALYSIS.md` §6 items 1–3 and 7 edit `commands/verify.md` and `commands/review.md`;
`B48` edits `plan`/`execute`/`verify`/`review`. **Both Epics land on the same four files.** Doing the
smaller command-text fix first means the larger Epic edits them once, cleanly. That `B48` is live in
shipped code is the supporting reason, not the lead one.

**D-M5E13-6 — M5.E8 landing fired five triggers; each gets a decision, and four are re-parked.**

Per `B39` nothing walks the watchlist, so leaving them untouched would be the class's fourth instance
inside the Epic meant to fix it. **Promoted:** M5.E10 (review hardening), now re-scoped by the
claim-integrity analysis from two small items to seven, with `B38` folded in and given a purpose it
did not have (§6 item 6, the provenance rule as a positive recipe). **Re-parked with new written
conditions and dates:** the `subagent-driven-development` five-round breaker (its trigger reads *"M5.E8
lands"* full stop, while both its neighbours read *"M5.E8 lands **and** a measured run shows X"* — read
as a lost second half, and argued as such rather than quietly deferred); cross-install telemetry (four
users; nothing to pool); harder TDD (now a five-minute canary run rather than a vague park);
the 2-Action Rule (needs one recorded instance of executor context drift).

**This reverses advice given earlier the same day** to split M5.E10 and shelve `B38`, which was
offered before `analysis/CLAIM-INTEGRITY-ANALYSIS.md` (`34972f4`) existed. Recorded so the reversal is
visible rather than silent.

**D-M5E13-7 — The tracker is decided in direction and needs its own Epic; that discharges the
2026-07-15 trigger.**

`CLAIM-INTEGRITY-ANALYSIS.md` §7 records the call: GitHub Issues as the single home for anything with
an open/closed lifecycle, on two load-bearing conditions — the tracker is the **only** home for status,
and closing is wired into the phase gates. This resolves the *GitHub Issues adoption* trigger that
`BACKLOG.md` records as **fired 2026-07-15** and that `B39` names as its canonical never-acted-upon
instance. **Promote branch taken; scoping is a separate Epic — `M5.E14`, entered in `BACKLOG.md` by
a parallel session at `4cd9f9d` (2026-07-28 12:45), trigger *M5.E10 lands*.** Its boundary matters
and is recorded here: a tracker fixes obligation *status*; it does not check whether a verification
report enumerated the requirements file. Those are M5.E10's.

**Addendum — a fourth `B50` sighting, found while reconciling with that parallel session.** The
`M5.E14` entry justified its ID with a claim now **[RETRACTED — FALSE]**: *"`M5.E13` was already claimed by the in-flight Lanes epic."*
**False in both halves:** Lanes carried no Epic ID in `BACKLOG.md`, `MILESTONE-5.md`, or its own
guide (which calls itself *"DISCUSS input for a new Epic"*), and it was not in flight — it was an
uncommitted file in the working tree until `e61f614` the same day. Corrected in place; `M5.E14`
keeps its ID and nothing renumbers. **Recorded because the pattern is the point:** a status claim
written from a mental model rather than checked against the artifact, committed on the same day the
class was named, by a session that had read the analysis naming it.

**Operational note:** two Claude sessions were writing to this repo concurrently (`4cd9f9d` landed
between `e61f614` and this Epic's `42d3f13`). No work was lost — the edits touched disjoint regions
of `BACKLOG.md` — but the false ID note is exactly the failure mode the *don't run parallel sessions
on one repo* rule exists to prevent: a second session reasoning about state it could not see.

**D-M5E13-8 — Every fix ships with a test proven red before the fix; `B48`'s text half re-runs the
canary.**

M5.E10's own done-when standard (*"every guard fix in the following Epic ships with a test
demonstrated to fail against `main`"*) is adopted here rather than waiting for M5.E10 to establish it —
the standard is a working habit, not a dependency. For the half of `B48` that is command text, the
proof is the adherence harness: rewording a measured instruction invalidates the `OBEYED` verdict
recorded against it, so `B41-phase-entry` is re-run. **This is the first use of the harness for its
intended purpose rather than to prove itself.** Test mechanics decided here rather than asked, per
*gate at product altitude*.

## 2026-07-31 — M5.E17 PLAN: verdict rule for an in-phase Critical + where "park" lives (D-M5E17-1 … D-M5E17-3)

**D-M5E17-1 — A Critical discovered and closed inside REVIEW is PASS-WITH-FIXES, under the
conditions already written for Important.**

`commands/review.md` stated Critical ⇒ FAIL in three places (checklist bullet, guidance paragraph,
verdict table row). Practice went the other way twice: M5.E9 and M5.E13 both shipped
PASS-WITH-FIXES with a Critical closed inside REVIEW. The document and the practice disagreed, and
PLAN had to pick a direction rather than assume the convenient one.

**Direction chosen: the rule was miscalibrated, not the practice.** A Critical *found and fixed
inside REVIEW*, with a small diff and green tests, is a different event from a Critical found at
ship or one needing re-planning — and the guidance paragraph already makes exactly that argument
for Important issues; it simply never extended it to Critical. Two Epics reaching the same judgment
independently under strict gating reads as a rule out of step with the work, not as discipline
slipping twice.

**The counter-argument, recorded because it is real:** "Critical" exists to force a harder stop, and
"the diff was small" is precisely how a Critical gets under-fixed. Therefore the three conditions
are **conjunctive and load-bearing, not a rule of thumb**: ≤ 50 LOC **and** tests green **and** no
design impact **and** fixed in-phase. A Critical failing any one of them is **FAIL**.

**D-M5E17-2 — "Park with a condition" routes through the existing trigger watchlist. No new
disposition verb, no schema change.**

The drain has two states: undecided (shows every drain, forever) or dispositioned (never shows
again — `defer` included, verified against `listDrainCandidates`, which filters on
`!e.dispositioned`). There is no "parked, remind me," so every capture is either permanent noise or
permanently buried.

The watchlist already solved this — each row carries a promote-back condition and a review-by date,
and `/sig:plan` now walks it every drain. An entry needing "not now, but genuinely revisit" is
therefore promoted **into** the watchlist rather than given a fourth verb. Satisfies NFR2 (no new
schema) using machinery that exists and is exercised. A `parked` verb was considered and rejected:
it touches `drain.js`'s terminal/non-terminal handling, which is the schema change NFR2 says should
trigger escalation.

**D-M5E17-3 — M5.E17 ships as FR1 + FR2 + FR3 only. FR4 (the 48-entry inbox triage) is cut to
M5.E14.**

Called by Brett 2026-07-31 at the PLAN approval gate. The stated reason is the one that matters:
**six consecutive M5 Epics have been Signal working on Signal** (E8 measure, E9 ledger, E13 guards,
E15 the measuring instrument, E16 detectors, E17 contradicting instructions), and the last release
adding a user-facing capability was `/sig:sweep` in v0.1.11. The introspection loop generates its
own work and has no natural exit unless one is forced.

FR1–FR3 are three document corrections plus three tests, two of them for defects hit live by hand.
FR4 is a triage of 48 captures dating to April that requires sustained product judgment from Brett —
the scarcest input, and the one least available right now. It moves to **M5.E14** (the tracker Epic),
where migrating the inbox to a real tracker and deciding its contents are the same conversation
rather than two.

**Not deferred, decided:** the inbox wall is not a papercut and will not be cleared as one.

## 2026-08-01 — Release delivery: relative source + branch-per-Epic (D-M5E17-4)

**D-M5E17-4 — `marketplace.json` uses the relative `.` source; Epic work happens on a branch and
`main` is the release channel.**

`B58` (P1) established that the pinned `url` + `ref` + `sha` form had been delivering v0.1.13 to
every install since v0.1.14 — the `ref` advanced each release, the `sha` did not, and Claude Code
resolves the `sha`. The first fix corrected the value and added a test resolving the tag through
git. **That guarded the problem; this decision deletes it.**

The plugin *is* this repo, so `.` is the whole address. With no second place to record which commit
ships, two places cannot disagree. Signal was the **only** marketplace on the machine using a pinned
remote source — `prose`, `cloudflare`, `openai-codex` and `anthropics/claude-code` all use a
relative path. The v0.1.1 change that introduced `url` was choosing against the **`github`
shorthand** (which resolved to SSH and broke stranger installs); the relative form was never
considered at the time.

**The trade, accepted knowingly.** Users now track `main` instead of a pinned tag, which couples
"what is pushed" to "what is delivered." Signal has been committing mid-Epic work straight to
`main`, so the counterweight is **Epic work on a branch, merged at ship** — `main` moves once per
release and is the release channel by construction. CI gates every push, so green `main` means
installable `main`.

**Scoped deliberately light (Brett, 2026-08-01).** Signal has three users, is explicitly built for
Brett's own projects, and is not being optimised for commercial or open-source viability. Tags stay
as bookmarks, not as delivery. The release action is *(a)* bump `plugin.json` — the only thing that
makes an update visible.

> **⚠ CORRECTED SAME DAY (2026-08-01), before anything was built on it.** This paragraph originally
> read *"no PR ceremony, no review gate, no required tagging"* and *"branch when a change would leave
> `main` genuinely half-wired."* **That was wrong on the review half, and it was an inference, not a
> decision Brett made.** Brett's actual position, stated when he caught it: *every* change goes
> through a PR — *"as should all things frankly"* — and what varies is **Epic ceremony**, not PR
> discipline. His only concern was that a small fix shouldn't need a full six-phase Epic.
>
> The error mattered because of what it combined with. This same decision moved users from a pinned
> tag onto `main`, so an ungated `main` is now **live to users** — the moment the gate matters most.
> The original text removed the gate at exactly that moment, and would have made the arrangement
> strictly worse than the pinned form it replaced. **Seven commits landed directly on `main` in the
> session that wrote it**, `B57` and `B58` among them — both textbook small-fix-still-wants-a-PR
> cases. → **`D-M5E17-5`.**

**D-M5E17-5 — PR discipline is constant; Epic ceremony is what varies.**

Two lanes, one gate:

| | **Epic lane** | **Fix lane** |
|---|---|---|
| For | features, design work | bugs, papercuts, doc fixes |
| Six phases | yes | **no** |
| Branch + PR | **yes** | **yes** |
| CI green to merge | **yes** | **yes** |

A one-line fix does **not** need DISCUSS→SHIP. It **does** need a branch, a PR, and a green suite.
Collapsing those two axes into one dial — and then turning that dial down — is the mistake corrected
above.

**Enforced by branch protection, not by this entry.** A rule written in a document and enforced by
nothing is the defect class this project has hit twice in one day: `B7` recorded the marketplace sha
drift at v0.1.7 as *"needs a look"* and nothing enforced it for eight releases (→ `B58`, P1), and
`B39` was a watchlist that instructed its own walk while no command performed it. **The note is not
the guard.** `main` therefore carries a GitHub ruleset requiring a pull request and a passing `test`
check, with zero required approvals (Brett is sole maintainer; a self-approval requirement would
deadlock). That is ~30 seconds per change via `gh pr create --fill && gh pr merge --squash`, and it
is the mechanism that makes users-track-`main` safe.

---

## 2026-08-01 — M5.E16 PLAN: the check set, where healing lives, and what the checks cannot see (D-M5E16-1 … D-M5E16-5)

**D-M5E16-1 — `/sig:sweep` stays read-only. Category-2 healing lives at the phase transition and
behind an opt-in flag (Brett, 2026-08-01).**

**The requirements contradicted themselves and PLAN could not settle it alone.** FR4.1 category 2
says a command-healable finding is one where *"**Signal runs it**; it does not tell the user to go
run it."* NFR2 says *"**No writes, no network.** `/sig:sweep` is detect-and-report; that holds,"* and
FR1.3 repeats the read-only contract. **Sweep cannot both run a fix and never write.** This is
M5.E17's own defect class — instructions that contradict other instructions — sitting unresolved
inside the requirements of the very next Epic, and it was found by reading FR4 against NFR2 rather
than by any mechanism.

**Chosen: sweep stays pure.** NFR2 is the older contract, and M5.E9's REVIEW set the precedent of
**removing** a bad sweep behaviour rather than softening it. Healing arrives two other ways —
**FR5's phase-transition regeneration**, which covers the only category-2 case the 16-finding
baseline actually produced (a stale `INDEX.md`) without anyone typing anything, and an explicit
**`/sig:sweep --heal`** for anything later.

**The cost is recorded because it is real.** FR4 calls itself *"the load-bearing requirement, and the
reason the Epic exists in this form,"* and its argument is that detect-only *"manufactures chores."*
An opt-in flag is detect-only for anyone who never types it. The counter-argument that carried:
FR4's own evidence pointed at exactly one category-2 case, and FR5 heals that one automatically.

> **The concrete consequence, added after the plan's second validation pass:
> the category-2 bucket contains zero shipped checks.** Every check that ships is category 1
> (self-healing) or category 3 (needs a person). This surfaced because **(d) was first declared
> category 2 — *"Signal runs it"* — while no slice ran anything**, which is precisely what FR4.2
> forbids; the render would have promised *"heals on next phase command"* for a finding nothing
> healed. Re-measuring settled it: `markFresh` is not tier-gated in code and the live instance
> (`cm-mentor-coach`) is FULL tier, so the finding clears unaided — **(d) is category 1**.
> FR4's middle bucket therefore exists in the registry and holds nothing, and `/sig:sweep --heal` is
> scaffolding for a check that does not exist yet. Stated here rather than left to be discovered at
> REVIEW. `S1.t5` now tests that every declared category has an implementation, because the
> validation question *"is a category declared?"* passes this defect and *"does its promise come
> true?"* catches it.

**D-M5E16-2 — STATE findings surface at `/sig:resume`, but only category 3, as a single line (FR3).**

FR3 asked PLAN to decide **with a written reason**, and both sides were real. The live incident
happened *at* `/sig:resume`, which is run constantly; but resume's briefing is capped at 50 lines,
and a detector nobody runs is `B39` in a new costume.

**Decision: one line, category-3 findings only, with a count and a pointer to `/sig:sweep`.**
Categories 1 and 2 never appear — one heals itself and the other is a command away, so both are
noise in a briefing. The line sits in the **advisory tier**, below the schema-drift and staleness
banners: a STATE *content* contradiction makes the briefing's narrative suspect, but not its
**parse**, and the existing banner order already encodes that distinction. One line for the finding
a whole Epic exists to catch is the right trade against the cap.

**D-M5E16-3 — Two checks added, two dropped; every disposition backed by a measurement (AC1.4).**

Ships: **(a)**, **(b)** narrowed, **(c)** restructured, **(d)** narrowed, **(g)**, **(h)**.

- **(g) — every `PROFILE.md` parses** (Brett, 2026-08-01). Highest precision available: a file
  either loads or throws, so there is no threshold and nothing for FR2.2 to kill. Its live instance
  is **`B59`**, found hours earlier at this Epic's own PLAN preamble.
- **(h) — `current_epic` is set but is not a strict Epic ID.** *Not in the requirements; it exists
  because the corpus was measured.* `agent-tools-sync` carries `"M1"` and `traction-engine` carries
  `"PHASE12"`; both fail `EPIC_ID_STRICT_RE`, so every resolver falls open to linear mode while the
  project believes it is running Epics. **That is `B53`'s class, live in the field**, on half the
  Epic-mode corpus, after being fixed as a Signal-side bug in v0.1.14. Included without a second
  approval round because it sits inside FR1.1's existing frame (a STATE field versus how the code
  reads it), where (g) genuinely widened the frame.
- **(e) dropped — duplicate.** `detectOrphans` already finds it and `/sig:resume` already prompts on
  it, always-on regardless of `gate_strictness` (D12).
- **(f) dropped — unvalidatable.** FR2.1 requires every check to run against a real non-Signal
  project before shipping. **Zero of thirteen** real projects have a non-empty `blockers[]`, so (f)
  cannot meet that bar even in principle. Its bug-status half also depends on `BUGS.md`'s table
  format, which is a **Signal convention**, not something a Signal-managed project has. Re-open when
  a real project carries a blocker.

**Restructured, not merely narrowed: (c).** As written it keys off `completed_phases` containing
`SHIP` — which **does not fire on the one live instance available to it**, because this repo's
`completed_phases` is `[]` while `M5.E17` sits shipped with no retrospective. Re-keyed to
artifacts-on-disk, it fires. **A requirement that would have been silent on its own motivating case
is a requirement written from the shape of the work rather than from the artifact.**

**D-M5E16-4 — The applicability numbers are published, not merely measured.**

Across 13 real `.planning/` trees, **checks (a) and (b) — the two aimed at the incident that opened
this Epic — can evaluate 2 projects.** Signal's own shape (hand-maintained, Epic-mode,
`schema_version: 1`) is the **minority** shape: 4 of 12 readable projects are in Epic mode, 7 of 12
have a canonical `phase`, and `readState` **throws** on one project outright.

A sweep that runs those checks against `traction-engine` prints nothing, and a user reads that as
*clean*. It is not clean — the check could not look. **Zero-findings and not-applicable rendering
identically is `B39`'s shape and `B54`'s**, and building it into the Epic written to catch that class
would be the fourth recurrence.

Therefore the report distinguishes **checked-clean** from **could-not-check** as a shipped
requirement with a RED-first test, and the coverage numbers go in `references/` the way M5.E8
published its 22.4% ceiling with the words *"the remainder is unmeasured, not passing."* This is the
third Signal measurement in a row — adherence ceiling, claim integrity, now applicability — to find
the instrument covering less than it appeared to.

**D-M5E16-5 — FR6 is the last slice and splits rather than shrinks.**

The requirements delegate this to PLAN: *"If PLAN finds the scope does not slice cleanly, split FR6
into its own Epic rather than dropping requirements."* `/sig:update` has **zero dependency** on
FR1–FR5, and its feasibility was confirmed by execution rather than by reading docs (`claude plugin
list` exits 0 on this machine). It stays as **S6, the final independent slice**, under a standing
rule: **if S1–S5 overrun, S6 becomes M5.E18 intact — it is never trimmed to fit.**

`M5.E16-VALIDATION.md` Dimension 1 records that S6 **does not serve the phase goal**. Carrying it is
a deliberate choice, flagged rather than rationalised into alignment.

## 2026-08-03 — M5.E18 DISCUSS: the archive half for linear projects (D-M5E18-1 … D-M5E18-5)

**D-M5E18-1 — M5.E18 opens after M5.E16 and M5.E17, and the queue that said otherwise was stale.**

Out-of-order by ID, deliberate, and legal under `## Vocabulary`'s ID-is-identity rule — same
precedent as **D-M5E9-2** (*"E9 runs before E8 — deliberate, not drift"*) and **D-M5E13-1**.
Recorded because without it the next reader sees drift.

**What made the call.** `/sig:resume` reported M5.E15 as next, sourcing `CONTEXT.md`'s queue. That
queue was written in **PR #19** (the v0.1.16 ship). `BACKLOG.md`'s M5.E18 entry landed in **PR #21**
and was updated in **#24** — both after — and carries a Brett quote dated 2026-08-02, *"get past
this document crap so all my projects can migrate and be healthy,"* marked **unconditional next for
doc-health**. `CONTEXT.md` was the stale document, and the briefing repeated its ordering without
checking it against the newer file.

Two facts decided it against M5.E15: **M5.E15's own trigger is `NONE — fires on the next adherence
claim`** and no adherence claim is pending, while **M5.E18 carries `B70`, a P1** that makes
`/sig:status` and `/sig:resume` throw on 5 of 12 real projects. M5.E15's standing prohibition
survives untouched — **no canary re-run for a cleaner number until its control arm is fixed.**

**The `CONTEXT.md` staleness is itself the finding.** That file was rewritten whole at v0.1.16 *for
being seven Epics stale*, and was stale again within two PRs — because the queue lives in two places
and only one of them is the one people edit. Noted here; not fixed here.

**D-M5E18-2 — A unit of work is derived from its filenames, not declared in a field.**

The archive planner groups `.planning/*.md` by matching **known artifact suffixes from the right**:
`PHASE10-S4-PLAN.md` → unit `PHASE10-S4`; `PLAN-GATE-A-RESEARCH.md` → unit `PLAN-GATE-A`;
`M1-PLAN.md` → unit `M1`. Nesting and awkward unit names fall out for free.

**Measured, not assumed** — three real trees, three different conventions:

| Project | `current_epic` | Naming |
|---|---|---|
| `agent-tools-sync` | `M1` | one consistent prefix |
| `traction-engine` | `PHASE12` | **nested** units (`PHASE10`, `PHASE10-S4`, `PHASE10-S5`) |
| `nextpass` | `null` | **10+ unit names** (`PROXY`, `GATE-A`, `PLAN-SC1`, `NEXTPASS`, …) |

`BACKLOG.md` framed this as *"the prefix is not in `current_epic`'s contract."* True, and an
understatement: **nextpass has no single prefix to put in a field.** Some of its unit names begin
with the word `PLAN`, so `PLAN-GATE-A.md` is ambiguous alone — only the sibling
`PLAN-GATE-A-RESEARCH.md` reveals the unit. A declared-prefix field cannot express this shape; a
suffix match can. Verified against `traction-engine`: the rule produced exactly the five real units
and correctly left `CONTEXT.md` / `DECISIONS.md` / `INDEX.md` ungrouped.

**The cost is accepted and must be visible:** files with no recognised suffix
(`NEXTPASS-STACK-DECISION.md`, `BUGHUNT-2026-06-12.md`, `PLAN-SLICE-VOICE1.md`) do not group. The
ungrouped set is **reported**, never dropped — an unreported `0 ungrouped` would read as full
coverage, which is `B39`'s shape.

**D-M5E18-3 — Closure is a terminal artifact plus not-current plus a verdict where one is readable —
and it has three outcomes, not two.**

Today closure is *"a `{EpicID}-RETROSPECTIVE.md` exists"* (`retrospective.js:168` — `existsSync`).
**None of the three field projects has a single retrospective file.** So the existing rule returns
*nothing is closed* everywhere, and fixing unit-grouping alone would still archive **zero files** on
all three. The retro requirement — not the prefix — is the harder blocker.

A unit is **closed** when it has a `VERIFICATION` or `SHIP` artifact, it is **not** the current unit,
and — where a verdict line is readable — that verdict passed. Verdict parseability is **1 of 3**
measured (`PHASE8-VERIFICATION.md` → `Verdict: PASS`; `M1-VERIFICATION.md` → prose *"Verdict
remains"*; nextpass → none), so `cannotDetermine` is a **first-class status in the return shape**,
not a rendering note. If it is not in the data, the dry-run's `0` means both *nothing closed* and
*could not look* — which is exactly what **`B63`** asks to fix by porting M5.E16's four-status model.

**This also closes `B64`.** `archive-tree.js:357` is `closedEpicIds = retros.map(r => r.epicId)` —
**no `isStub` filter**, though `retro-index.js` already computes one. Signal's own tree has **4 stub
retros** (`M4.5.E1`, `M4.5.E3`, `M4.5.E6`, `M4.5.E7`), all currently counted as closed. nextpass named
it exactly: *"a label, not a guard."*

**Known weakness, stated rather than discovered later.** `PHASE11-SHIP.md` exists and `PHASE11` was
the current, actively-edited unit as recently as 2026-07-28; it is archivable now only because
`PHASE12` took over. **A terminal artifact written mid-unit is a real shape in this corpus**, so the
not-current clause carries the whole guard. `agent-tools-sync` supplies the regression test for
free: `M1` has a `VERIFICATION` **and is current** — it must never be proposed for archive.

**D-M5E18-4 — The current-unit guard reads the raw `current_epic` string, never a strict-gated
helper.**

Confirmed by execution against `traction-engine`, and it would have made D-M5E18-3 wrong:

```
readState().current_epic          → "PHASE12"   (raw value survives)
detectMode()                      → linear
EPIC_ID_STRICT_RE.test('PHASE12') → false
EPIC_ID_STRICT_RE.test('M1')      → false
```

Both field projects sit in **linear** mode while still carrying a usable unit name. Any code that
asks *"which unit is current"* through a strict-gated path receives `null`, the not-current clause
**silently never fires**, and `PHASE12-*.md` — the unit being edited today — becomes archivable.
This is `B53`'s seam one field over: two readers of the same field disagreeing, with the failure
mode being *silence* rather than an error.

**D-M5E18-5 — `B70` ships in the fix lane, ahead of this Epic's design work.**

`B70` (P1): `nextActionForPhase` throws on any `phase` outside the seven canonical names —
5 of 12 real projects. In `resume.md:128` the call sits **inside `renderResumeBriefing`'s argument
list**, so the whole briefing dies before rendering. Every neighbouring optional read
(`isStaleVsOrigin`, `readLayoutBanner`, `readStateSizeForTier`, `readEffectiveProfile`) is marked
fail-open; this one call nobody marked safe. `traction-engine`'s `phase` holds a **multi-paragraph
prose blob** — the concrete trigger.

**Behavior (Brett's call): render everything, name the problem.** The briefing renders in full; the
next-action line states the phase is not one Signal recognises, shows what STATE actually holds, and
names the seven valid values. Staying silent was rejected as `B39`'s shape — a field that drifted by
accident would look identical to one set deliberately.

**Lane and ordering:** its own branch off `main`, its own PR, no six phases — per `D-M5E17-5`. It
does **not** ride along in the Epic branch. `BACKLOG.md` homes it in M5.E18 *"arguably ahead of part
1"*; this ratifies the *ahead* and moves the delivery out of the Epic.

---

## 2026-08-04 — Fix lane (`B78`): the PASS-WITH-FIXES rule, stated once (D-M5E18-6)

*Not an M5.E18 phase decision — a fix-lane call carrying an Epic ID, same shape as `D-M5E17-4`.
Taken ahead of M5.E18's own REVIEW so the paragraph auditing that Epic is not the one being fixed.*

**D-M5E18-6 — Needing new coverage is an obligation, not a disqualifier; and the 50-LOC cap counts
non-test source only. Supersedes `D-M5E17-1`'s condition set without rewriting it.**

`D-M5E17-1` settled *whether a Critical can qualify*. It did not settle **what the conditions are**,
and `commands/review.md` went on to state them in four places that no two of which agreed —
`tests/commands-wording.test.js` being a fifth voice with its own count. Three disagreements, all
recorded in `B78`:

1. **The set.** The guidance paragraph declared a count, then named *"ripple beyond a single file"*
   and *"require new tests"* as further disqualifiers — neither among the counted set, neither in
   the table.
2. **The operator.** `≤ 50` / `< 50` / `> 50` across three statements, so a fix of **exactly 50
   lines** was PASS-WITH-FIXES per the paragraph and matched **neither table row**.
3. **The denominator.** *50 LOC of what?* Source only, or source plus tests? Under every reading
   tests inflated the count.

**The product call (Brett, 2026-08-04): the fix carries new coverage, in-phase, and it must be
green.** The old wording bounced a fix back to EXECUTE for needing a test. That is backwards on two
counts. First, it penalised the careful reviewer: writing a regression test moved you *toward* FAIL,
so the rule trained reviewers not to test. Second — and this is the hole nobody had named — *"all
tests still pass"* only ever constrained the tests that **already existed**. Nothing in the rule
required a fix to be covered at all, so a defect could be closed in-phase with zero new coverage and
satisfy every condition. The rule read as strict while leaving the actual test-debt door open.

Flipping it closes that door and removes the perverse incentive in one move: **more rigor than
either prior reading, and no penalty for testing.**

**The denominator follows from the flip.** The cap is **≤ 50 LOC of non-test source, insertions plus
deletions**, and the required coverage is **excluded from it**. It has to be — otherwise the new
obligation fights the cap, and the regression test a fix is now required to carry would be the thing
that pushes it into FAIL.

**Resolved consistently, not per-statement:** `≤ 50` in the paragraph and the PASS-WITH-FIXES row,
`> 50` in the FAIL row — no gap at exactly 50. *"No design impact"* replaces the row's *"no
architectural impact"*; *"touches architecture"* and *"ripples beyond a single file"* are demoted to
what they always were — **illustrations of design impact, not extra conditions**. Nothing is cut:
a fix rippling across files still fails, on the condition it was always failing.

**No count is written anywhere.** The set is enumerated. A number stated in two places is precisely
what drifted, and `tests/commands-wording.test.js` now fails on any spelled condition-count in
`review.md` — including the correct one.

**Why a new entry rather than an edit.** `PROJECT.md` makes IDs permanent addresses. `D-M5E17-1` is
cited from `review.md`, from `M5.E16-REVIEW.md` and from the test suite; it stays readable where it
was written, and this entry supersedes its condition set. Its *counter-argument* — that "Critical"
exists to force a harder stop and *"the diff was small"* is how a Critical gets under-fixed — is
**unchanged and still load-bearing**, which is why these conditions remain conjunctive.

**No wrong verdict is on record.** `M5.E16-REVIEW.md:60-67` read the rule as six conditions and
invented a seventh (*"requires re-validation"*), but returned FAIL on *"no design impact"* — a real
condition — so the outcome was correct regardless. That record is left as written: it is a record of
a REVIEW that happened, not a statement of the rule.

---

## 2026-08-04 — M5.E15 DISCUSS: what a verdict claims, and how far the control arm deletes (D-M5E15-1 … D-M5E15-9)

**D-M5E15-1 — The verdict is DIRECTIVE-scoped: the control arm deletes every site that *orders* the
call, and nothing else.**

`B55` prescribes the fix as *"delete the instruction corpus-wide across the copied plugin."* Measured
against the copy, that is not a coherent operation. `PLUGIN_COPY_DIRS`
(`tools/lib/adherence-harness.js:50-62`) copies `.claude-plugin`, `commands`, `skills`, `agents`,
`references`, `hooks`, `tools`, `state` — and `transitionPhase` occurs in **13 files** across that
tree in **five different kinds of statement**:

| Kind | Files (mentions) | Deletable? |
|---|---|---|
| **Orders the call** | `execute.md` (4, the target), `plan.md` (4), `verify.md` (4), `review.md` (4) — byte-identical wording per M5.E13 FR1.1 — and `ship.md:98` (1) | **Yes. This is the instruction.** |
| Teaches the rule without ordering it | `discuss.md:158` (*"do NOT set `phase` here — the **incoming** command advances it"*), `index.md:11`, `calibrate.md:251` | No — removes a convention, not an instruction |
| Documents the semantics | `references/state-schema.md` (6, incl. *"appends the phase you are leaving"*) | No — same problem, larger |
| The experiment itself | `references/adherence-canaries.json` (4) — carries the measured sentence **verbatim** in `instruction`, plus the `deleteSection` anchor | Handled by D-M5E15-4 |
| The capability | `tools/lib/state.js` (3) — the function | **Never.** See below. |

**There are two ways to be wrong here, and `B55` names only one.** Under-delete (today) and the
instruction leaks — the recorded defect. **Over-delete and you get a different invalidity:** a
control-arm agent stripped of `state-schema.md` is not an *uninstructed* agent, it is a
*differently-informed* one, and its 0/3 is equally unreadable. The extreme case makes it obvious —
delete `transitionPhase` from `tools/lib/state.js` and a control arm that does not transition means
**"could not"**, not **"was not told"**. The capability must survive; only the order to use it is
removed.

**So the claim this harness makes, stated so it cannot be inflated:** *this rule, as instructed
anywhere a command tells an agent to act on it, does work.* Not *"this line does work"* (too weak to
be worth the run) and not *"this rule, wherever stated"* (a claim the mutation cannot support).

Ratified by Brett at DISCUSS against the two alternatives, both costed: site-scoped-but-labeled
(fixes the overclaiming, leaves the arm leaking) and corpus-total (maximum isolation, buys the
confound above).

**D-M5E15-2 — The leak check greps the copied tree independently; the canary's anchors are used to
delete, never to decide what is clean.**

This is the whole anti-regression property of the Epic, and it is a direct answer to how `B55`
happened. The current guard (`tools/adherence-run.js:383-384`) reads
`mutated.includes(residue)` — it inspects **the one string it just edited**. A file it never opened
cannot fail it. A *declared list* of deletion sites has exactly the same defect one level up: it is
correct on the day it is written and silently stops matching the corpus the moment a sixth command
names the function. `B55` **is** that failure — the anchor was widened line → section and stopped one
scope short.

So the two jobs are split:

- The canary **declares** its deletion anchors per file (needed to perform the mutation).
- The leak check **independently walks the whole copied tree** for the residue token and classifies
  what survives. It never consults the canary's list to decide whether the tree is clean.

**Fail-closed on the unknown.** Descriptive sites are enumerated in an explicit allowlist pinned by a
test; anything the walk finds that is not on it is treated as **directive** and refuses the run. A
new command file naming `transitionPhase` therefore breaks the harness loudly instead of leaking
into a verdict quietly. This is the inverse of today's behavior and the point of the Epic.

**D-M5E15-3 — Surviving directive residue REFUSES; descriptive residue is REPORTED and rides on the
verdict record.**

Consistent with the harness's existing refusal discipline (`adherence-verdict.js:20-26` — no verdict
at all unless the mutation was proven to reach the agent). A directive site the deletion missed voids
any verdict, so the run stops with the file and line named.

Descriptive residue is **never empty by construction** under D-M5E15-1 — `state-schema.md` and
`discuss.md:158` survive every run by design. Printing it once and discarding it would leave the next
reader unable to tell a clean isolation from an unexamined one, so it is carried **on the verdict
record itself**, next to the isolation scope. A reader who sees `OBEYED` sees, in the same table, what
the control arm could still reach.

**D-M5E15-4 — `references/adherence-canaries.json` is excluded from the plugin copy.**

It states the measured instruction verbatim in its `instruction` field and names the exact section
being removed. Leaving it in the copy hands the control-arm agent both the deleted sentence *and* the
fact that it is being tested — the sharpest leak of the five, and it is the measuring apparatus
leaking into its own measurement.

Cheap and safe: `loadCanaryRegistry(ROOT)` (`tools/adherence-run.js:446`, `:495`, `:559`) reads the
registry from the **real repo root**, never from the copy. Nothing in the copy needs it. Users are
unaffected — this changes what the harness copies into a temp dir, not what the plugin ships.

**D-M5E15-5 — The leak check is registered in `tests/guard-callers.test.js`.**

`BACKLOG.md` says the leak check is *"the same shape as the `--check`-has-a-caller test — so M5.E13's
own mechanism should cover it."* That mechanism exists under a different name: `tests/guard-callers.test.js`
(M5.E13 S3.t3 / FR2.3, the `I2` case). The backlog's pointer is corrected here rather than left to be
re-derived.

The reasoning is self-referential and deliberate: `B55` is a guard that under-reached, and the class
directly above it is *a guard written and never called*. A leak check nothing invokes would be this
Epic committing the defect it exists to fix, in the code that fixes it.

**D-M5E15-6 — The Epic does not close until `B41-phase-entry` is re-run under the fixed arm, and it
publishes whatever comes back.**

Ratified by Brett at DISCUSS with the worst case named in advance: **`INERT` would mean M5.E9's
phase-entry instruction — four command files and FR1.1's shared wording — changes nothing.** That
result gets written to `ADHERENCE-LOG.md` like any other. Same discipline M5.E8 pre-committed to for
this same canary, and the reason is unchanged: a result that is only publishable when it flatters the
project is not a measurement.

The standing prohibition is satisfied, not waived — it forbids re-running *before* the arm is fixed,
and explicitly requires a re-run after.

**D-M5E15-7 — The three existing log records are amended in place, never rewritten.**

`ADHERENCE-LOG.md` is append-only below the runs marker and already carries the convention: the
`ABSENT` record has an **⚠ INVALIDATED** block, the `OBEYED` record an **ℹ QUALIFIED** block, the
`INDETERMINATE` record a **⚠ DIAGNOSED** block, each left byte-identical beneath its annotation.

M5.E8's `OBEYED` gains a second annotation recording that it was **unisolated** — true when written,
and a reader landing on that record must not have to read forward to a later record to learn it. It
is **not** retracted: 0/3 means no leak was observed in those three runs. Unisolated is not falsified,
and the log has to be able to say the difference.

**Nothing outside the log needs correcting** — `README.md` and `references/facts.md` cite no adherence
verdict. Checked, so that a later reader knows the surface was examined rather than assumed.

**D-M5E15-8 — `ship.md:98` is a directive site, and it is deleted by line, not by section.**

Recorded because it is exactly the *"one scope short"* judgment that produced `B55`, and because the
requirements briefly carried both answers at once.

Measured against the live corpus: `plan.md:42`, `verify.md:36` and `review.md:47` each carry
`## Phase entry — record the phase (M5.E9 FR6, `B41`)` — **byte-identical to `execute.md`'s existing
anchor** — with all four mentions inside and `## Workflow` next, so `applySectionDeletion` works on
them unchanged. `ship.md` is different in kind: the mention at `:98` is a numbered list item inside
`### 5. Update State (programmatic, not prose)` (`:94-105`), a section holding unrelated ship steps.

Two questions were being conflated. **Is it directive?** Yes — it orders
`transitionPhase(baseDir, 'SHIP')`, which teaches the same rule the canary measures; excluding it
because `/sig:ship` is unreachable from the fixture would isolate against the agent's *path* rather
than its *reach*, and reach is what leaked. **Is it section-shaped?** No. So the deletion primitive
becomes per-entry `{file, section}` **or** `{file, line}`, and the two facts stop being traded
against each other.

**D-M5E15-9 — A repeat `INDETERMINATE` is read as "multi-homed beyond isolation", declared before the
run, and does not auto-escalate to corpus scope.**

It is the likely outcome, so leaving it uninterpreted would mean choosing a reading after seeing the
number — the tuning M5.E8's impostor table exists to forbid. Directive scope **deliberately** leaves
`discuss.md:158` and `state-schema.md` in the control arm's reach (D-M5E15-1), and an agent reading
either can derive the rule.

With the leak check passing and the seam proven, a control arm that hits again means the rule is
multi-homed beyond what deleting instructions can isolate. The log records that permanently, with the
residue list naming the sites the control agent could still reach.

**It does not fall back to corpus scope.** That would silently overturn a decision Brett made *with*
the corpus option costed in front of him. Re-opening it is a human call on the evidence.

## 2026-08-06 — Checkpoint-captured: Epic lane merges with `--merge`; fix lane squashes. `.planning/ADHERENCE-LOG.md` pins commit SHAs as its reproducibility anchor (AC4.3 breaks when "the record would name a state nobody can return to"), so squashing or rebasing an Epic leaves a published verdict naming a commit absent from `main`. Stated in CLAUDE.md + commands/ship.md §2 as of v0.1.19 (#89); previously inferred from the fix-lane example and stated nowhere.

## 2026-08-06 — Checkpoint-captured: Next work is sequenced: (1) `B52` stale plugin-cache binding, fix lane; (2) the closure-gated archive command, Epic lane, folding in `B82`; (3) `M5.E14`'s shippable slice only (the `discharged` marker + SHIP-gate open-obligations query). Reasoning lives in BACKLOG.md → "Next work — the agreed sequence". `M5.E12` and full `M5.E14` excluded on checked evidence: their triggers (`M5.E11`, `M5.E10`) have no artifacts on disk.

## 2026-08-06 — Checkpoint-captured: Mutation-verification is a DECLARED DEVIATION from RED-first, never counted as strict-Nyquist compliance. Where a test was written after its implementation, breaking the code and requiring the test to go red proves the assertion discriminates today — it does not prove the test was written honestly. M5.E15 declared six such criteria rather than attesting falsely.

## 2026-08-06 — Checkpoint-captured: A caveat whose absence is indistinguishable from a clean result must either render unconditionally or be pinned by a test that fails when it stops rendering. Written into tools/lib/adherence-caveats.js after the same defect occurred twice in the same file three months apart (M5.E8 and M5.E15 S7) — a published record silently omitting its own scope. The isolation scope now renders `undeclared` out loud rather than omitting the line.

## 2026-08-07 — M5.E19 DISCUSS: wiring the archive half, and the gate that refuses (D-M5E19-1 … D-M5E19-5)

**D-M5E19-1 — M5.E19 runs at Epic-scoped FEATURE, and `review_depth: full` is set against the tier's own default.**

The project is FULL; `BACKLOG.md` sizes this item as *medium*. M5.E18 already built and measured the
library, so this Epic is wiring plus one defect in a function that exists. FEATURE is the honest tier.

But FEATURE's defaults are calibrated for additive feature work, and this is a **destructive file
mover** replacing a tool that failed by being too permissive. Three dials stay up: `security_audit:
basic` (the mover feeds a path-confinement boundary), `nyquist_enforcement: strict` (an unpinned
refusal is a warning wearing a gate's clothes), and `review_depth: full`.

**The third one is load-bearing and non-obvious.** Under `quality-only`, `commands/review.md:17`
skips REVIEW Steps 2/3/4 *"regardless of what `security_audit` / `performance_pass` /
`simplification_pass` say."* Setting FEATURE's default would have made the other two dials **inert**
while this file claimed them — a profile asserting rigor the Epic never receives. That is precisely
the finding carried unhomed in STATE's In-flight section from M5.E16's retro, and it is `B59`'s shape
one level up: `B59` was a profile the code could not *parse*; this is one it parses and then silently
overrides.

**Verified, not assumed:** `readEffectiveProfile(base, {currentEpic: 'M5.E19'})` was executed before
PLAN and returns `FEATURE` with all ten overrides intact. `B59` shipped because nobody ran that call
until the Epic's own PLAN preamble, by which point a whole DISCUSS had run at the project's FULL.

**D-M5E19-2 — Archiving is a new `/sig:archive`, not a flag on `/sig:migrate-memory`.**

`/sig:migrate-memory` is a layout reorganizer keyed to `docs_layout_version` — it answers *"is this
project's `.planning/` in the current shape?"* Archiving closed work answers *"is this unit
finished?"*, on a different cadence (every Epic close, not every layout bump). Folding them produces
one command with two unrelated triggers, where the dry-run output would mix a reorganization plan
with a closure plan and the reader could not tell which refusal belonged to which question.

Cost accepted, and stated rather than elided: **a 20th command**. The alternative was judged worse.

**D-M5E19-3 — `cannotDetermine` refuses the unit; the run completes anyway.**

The bar for this Epic is *"a warning asks; a gate refuses"* — so an unreadable closure must never
result in a move. The question this decision settles is what happens to the **rest of the run**.

It completes. **From the corpus, not from principle:** 9 of 30 terminal artifacts (30%) carry no
readable verdict, and `resolveClosures` is explicit that a project-scoped failure — `affiliate-mojo`
throws on `readState` — makes **every** unit `cannotDetermine` rather than dropping units or
throwing. If `cannotDetermine` aborted the run, one unreadable project would block archiving
everywhere, and the command would be least useful exactly where the corpus is messiest.

Each refusal carries the `reason` string `resolveClosures` already produces. A refusal with no reason
is indistinguishable from a unit that was never examined.

**D-M5E19-4 — `B82` is fixed by making the closure record carry its own files.**

`resolveClosures` already calls `deriveUnits` and iterates `[unit, unitFiles]` — it **has** the
correct membership and discards it, keeping only `{unit, status, reason, evidence}`.
`planArchiveMoves` then rebuilds candidates as `` `${PLANNING_DIR}/${unit}-${suffix}.md` `` from a
fixed suffix list, which cannot express `deriveUnits`' conservative fold. Two implementations of one
rule, in two modules.

The fix adds `files` to the record and has the mover consume it. **The rejected alternative** — pass
`deriveUnits`' output into `planArchiveMoves` as a second argument — is rejected precisely because it
preserves the defect's shape: two callers, each free to derive membership its own way, disagreeing
again the next time one is edited.

**Re-measured 2026-08-07 across all 12 local projects with a `.planning/`, because the row's number
was too small.** `B82` splits **3 units across 2 projects, stranding 6 files**: `SLICE-SSO` in both
`nextpass` and `cm-mentor-coach`, and `GATE-A` in `nextpass`. `BUGS.md` records one unit on one
project. **Signal's own tree shows 0 splits** (13 units, 57 ungrouped) — so dogfooding alone would
have shipped this defect, and the two projects it does hit are the two archiving by hand-written
runbook today. The regression test is therefore keyed to the real corpus, not to a fixture
(`AC3.3`).

**D-M5E19-5 — Dry-run by default; the ungrouped set is reported unconditionally, including at zero.**

Dry-run matches `/sig:migrate-memory`'s posture and is the correct default for a tool whose
predecessor's failure mode was moving things it should not have. Writes require an explicit flag.

The ungrouped half is `D-M5E18-2` applied here, and it is not a formality: Signal's own tree carries
**57 ungrouped files against 13 units**. A run that archives 13 units and says nothing about 57 files
reads as complete when it is not. Reporting at **0** as well as at 57 is `B39`'s rule — an empty
collection must stay distinguishable from one that was never computed.

## 2026-08-07 — M5.E19 PLAN: the premise did not survive execution (D-M5E19-6, D-M5E19-7)

**D-M5E19-6 — `B82` leaves this Epic and ships in the fix lane. `D-M5E19-4` is superseded on its
mechanism, upheld on its principle.**

Running the seam at PLAN falsified the entry this Epic was opened on. `BACKLOG.md` and `STATE.md`
both said *"M5.E18 built the engine and wired none of it"*, quoting the retro's *"the library could
do 110; nothing wired it."* **That quote describes what M5.E18 found mid-Epic**; its wave 6 fixed it,
and the release's headline *114 files across 6 projects* is the delivery. Verified by execution:
`applyArchiveTree({apply:true})` is reachable at `migrate-memory.js:2554` behind
`if (archiveMoveMap.size > 0)` — **not** gated on a layout bump — so `/sig:migrate-memory --apply`
archives closed units on any project today.

The closure **gate** also already exists: `senseArchiveTree` computes `closedUnits = retro ∪ verdict`
(stub retros veto) and only those units get moves. Default-deny. The `resolveClosures` call at
`migrate-memory.js:1975` is **narration** — `try`/`catch`, feeding `explainArchiveOutcome`, and its
own comment says *"an explanatory read on a dry-run display."* The word *"wired"* in the backlog
entry hid the difference between **called** and **load-bearing**.

What remained genuinely broken was `B82` — live, measured, and hurting the two projects that archive
by hand today. Splitting it out: a data-integrity defect should not wait on six phases for a feature
nobody is blocked by. Shipped as `#98`, 2026-08-07, squash-merged.

**`D-M5E19-4` is superseded on mechanism.** It specified *the closure record carries its files*. The
shipped fix has `planArchiveMoves` call `deriveUnits` directly and exports `suffixOf` from
`work-units.js` so the mover preserves lifecycle ordering without re-deriving the suffix rule. The
**principle** — one implementation of unit membership, never two — is what the decision was for, and
it holds; `resolveClosures` simply turned out not to be the caller that needed changing. Recorded as
superseded rather than edited, because the original reasoning is why the fix took the shape it did.

**D-M5E19-7 — the Epic's remaining scope is smaller than what was approved, and that is stated
before PLAN rather than discovered at REVIEW.**

With `B82` gone and the gate found to exist, M5.E19 is: **a standalone `/sig:archive` command**
(FR1), **tests pinning the gate that already works** (FR2, re-scoped from *build* to *verify and
surface*), and the reporting requirements (FR4–FR6). That is a command wrapper over working
machinery.

The real user-facing gap is unchanged and still real: archiving today is a **side effect of a
document-layout reorganizer**, so there is no way to archive at an Epic close without running a
command about something else and reading past the parts that do not apply. That is why `nextpass` and
`cm-mentor-coach` wrote runbooks. But it is a convenience gap, not damage.

**Open for the user, deliberately not resolved here:** whether that remainder is Epic-shaped at all,
or a fix-lane command addition. Put in front of them with the fix already shipped as context, rather
than allowed to re-inflate inside PLAN to justify six phases.
## 2026-08-07 — Command taxonomy: the ontology existed, the rule did not (D-M5E19-8, D-M5E19-9)

**D-M5E19-8 — the new command is `/sig:archive`, a bare verb, and NOT `/sig:memory-archive`.**

Raised by Brett while approving it: *"do we make similar taxonomy for the commands — something like
`sig:memory-organize` and then `sig:memory-archive` — or are those flags? But if every command is
super different and doesn't have any ontology (reflected in taxonomy) then feels like it gets more
and more confusing over time."*

The worry is well-founded and the evidence was already on disk. **Five coherent groups exist** —
derived by reading `commands/*.md`, not invented: flow, orientation, capture, document upkeep, and
Signal's own health. What did not exist was a written rule, so each of 19 commands was named on the
day it was built. The **document-upkeep** group shows the drift directly: `index` and `sweep` are
bare verbs while `migrate-memory` is a verb-noun compound.

**The decisive argument against `memory-archive` today** is not taste. Adding it while `index` and
`sweep` stay bare introduces a **third** naming style into a four-member group — the cost of
inconsistency without the benefit of grouping. Either the group converts wholesale or the existing
convention holds. **Half-migrating a namespace is worse than either end state.**

`archive` also satisfies the rule now written down: name the act as a bare verb unless the verb is
ambiguous without its object. `migrate-memory` earns its noun (*migrate* alone would not say what
moves); `archive` does not need one.

**Also settled: separate command, not a flag on `/sig:migrate-memory`** — restating `D-M5E19-2`
against the taxonomy rather than against convenience. The test is *what question is the user
answering*: layout changes when the structure does, archiving happens at every unit close. A flag
would assert they are variants of one operation.

**Written down as `references/command-taxonomy.md`.** A group nobody can see from the command file
is a group that drifts, so each command states its group where it already states whether it is
phase-gated.

**D-M5E19-9 — whether group 4 becomes a prefixed namespace is filed, not decided, and not
"someday."**

The case for `memory-*` / `docs-*` is real: at 30 commands a flat namespace is harder to learn.
The case against doing it *now* is that a rename is **user-visible and breaking** — deprecation
aliases, a `[BREAKING]` entry, a `0.2.0` bump, and a pass over every doc naming a command. That is
separate work from adding a command, and bundling them means a wrong taxonomy would make the new
command wrong too.

**But "later" is bounded.** Pre-1.0 with a small user base is when this is cheapest, and the cost
rises with every command added. Filed as `BACKLOG.md` item 4, tagged **hygiene**, with the explicit
note that it means *the next naming-shaped thing*, not *someday*. Recording the deadline-shaped
reasoning because `B39` is this repo's standing lesson about triggers nobody walks.

## 2026-08-08 — The tracker split: adoption here vs. an adapter for users (D-M5E14-1 … D-M5E14-3)

**Context.** Brett, reading the archive/backlog/inbox loop for the third time: *"a roadmap and
backlog are solved problems… almost makes me want to make the leap to github issues and be done
with this circle jerk."* Correct, and Signal's own `BACKLOG.md` already concedes it in writing —
Signal *"has been incrementally building its own issue tracker out of markdown"*. The leap is
**deferred, not declined** (*"not ready quite yet — but soon"*). Recorded now because the reason it
kept looping is that the call was parked behind a trigger nobody walked (`B39`'s standing lesson),
and a deferral that isn't written down is indistinguishable from another lap.

**D-M5E14-1 — These are two decisions, and conflating them is what made this feel unresolvable.**

**(a) Signal-the-repo adopts a tracker on its own merit.** An operations call about this project:
90 `BUGS.md` rows, 52 untriaged inbox entries, a hand-sequenced backlog, and nothing that
reconciles them. It needs **no Signal code** and could happen in an afternoon.

**(b) Signal-the-product grows a tracker adapter** so *users* can point Signal at GitHub Issues.
That is `M5.E14`, an Epic: a migration, a capability check, and the ship gate rewired.

They were previously discussed as one thing, which made (a) — cheap, local, reversible — inherit
(b)'s Epic-sized cost and unmet trigger. Separated, (a) is unblocked whenever Brett wants it.

**D-M5E14-2 — (a) should go first, and it is the field evidence (b) needs — with a named blind
spot.** Running Signal's own lifecycle on GitHub for a few weeks answers what the adapter must do
far better than designing it dry. **The caveat is `B82`'s lesson, restated:** Signal's own tree is
an unrepresentative corpus, so (a) validates the *GitHub* path only. It says nothing about the
no-tracker path or a second provider, and those must be measured elsewhere — a blind spot named in
advance rather than discovered in a retro.

**D-M5E14-3 — GitHub Issues first; Linear is an adapter, not a peer, and the reason is auth.**
`gh` is already in the ship flow, so GitHub costs Signal's audience **zero new credentials**. Linear
needs a per-user API key, which is a **permission-model** question — and Signal has no vocabulary
for one (`/sig:permissions` is unbuilt; `AGENT-EFFECTIVENESS-ALIGNMENT.md` names environment
readiness as the absent axis and blocks it on exactly that). So Linear is gated on `/sig:permissions`,
not on interest. Confirms `BACKLOG.md`'s existing "Linear at most a later adapter" line, with the
reason attached.

**What this changes in the near term: nothing is cancelled, and one thing is built differently.**
The `discharged` marker still ships — it is the **offline fallback the tracker Epic requires
regardless** (a user with no GitHub repo must still be able to record that an obligation is
discharged). But the SHIP-time question is built as *"is anything still open?"* against a **named
source**, so adopting a tracker later swaps the source rather than rewriting the gate.

---

## 2026-08-09 — Backlog review: the disposition pass (D-BR0809-1 … D-BR0809-3)

*Source: [`BACKLOG-REVIEW-2026-08-09.md`](BACKLOG-REVIEW-2026-08-09.md), Wave 1. The 2026-07-04 pass
used bare `BR-n` IDs; this pass uses `D-BR0809-n` so the two ID spaces cannot collide — a
distinction `B91`, filed the same day, exists to enforce.*

**D-BR0809-1 — `M5.E10` is confirmed as the next Epic. `M5.E11` is kept, re-scoped to its first
slice, and sequenced behind it. `M5.E12` stays parked.**

The three had **never started** — no artifact on disk — while their triggers read satisfied and six
unplanned Epics shipped past them, two recording the override in their own status rows (*"ran ahead
of E10–E12"*). Six legal deferrals of the same three items is indistinguishable from a silent cut,
and `B39` exists to force that distinction. This is the distinction, made.

**`M5.E10` (review hardening / claim integrity) — CONFIRMED NEXT.** Trigger satisfied 2026-07-28.
Eight sub-items, each with a stranger-checkable done-when. It is the only one of the three whose
evidence **compounded during the review that dispositioned it**: `BUGS.md`'s tally was wrong in two
of five cells *while its own narrative named both flips that caused it*; `B91` is a live ID whose
provenance nobody checked; and the review itself published a completeness claim
(*"three of five figures"*) extrapolated from one verified cell rather than derived — `B50`'s shape,
inside the document about `B50`'s shape. Three instances in one session, none of which any existing
mechanism caught.

**`M5.E11` (Roadmap Advisor) — KEPT, first slice only, sequenced behind E10.** Two things changed on
2026-08-09: this review **did E11's job by hand**, so the automation's value is now demonstrably
*repeatability*, not capability — and its own done-when (*"a stranger runs it on Signal's own backlog
and the citations resolve"*) now has a **known-good output to test against**. It goes behind E10 for
a specific reason, not politeness: an advisor emitting unverified claims is the claim-integrity
defect with a wider blast radius.

**`M5.E12` (project-facing currency) — PARKED, unchanged.** Trigger (`E11` lands) genuinely unmet; no
new evidence.

**The basis is stated, because the usual one is unusable.** This disposition rests on Brett's
judgment plus measured defect density in Signal's own corpus. It explicitly does **not** rest on
*"real user pain points from v1 usage"* (`MILESTONE-5.md`) — `D-M5E7-3` already recorded that the
input for that criterion does not exist in written form (*"'4 non-Signal users, positive reception'
is recollection, not artifact"*), and every recent externally-sourced defect came from `nextpass`, a
second **project**, not a second **reporter**. Repeating the user-pain justification would be the
exact move this review exists to catch.

**D-BR0809-2 — Milestone 5 closes when `M5.E10` ships. `E11`, `E12` and the loop-engineering work
become M6.**

M5's stated Exit Criteria named the 10-phase architecture from `SIGNAL-INTEGRATION-RUNDOWN.md` — an
architecture **M5's own `E7` re-audit largely abandoned** (*"Not one straight port survived"*), and
nothing restated a criterion afterward. Every Epic M5 actually shipped falls outside the sentence
that defines closing it, so **the milestone could not close against its own definition** and had been
accumulating unrelated work for six weeks.

What M5 has actually been, across E1–E19 without exception, is **making Signal's own record
trustworthy** — the doc runtime, measurement, archiving, drift detection, and the two named defect
classes. `E10` is the last piece of that theme, which makes it the honest terminus rather than an
arbitrary one. The alternative — leaving M5 open as *"whatever Signal does next"* — is precisely how
it acquired a dead exit criterion in the first place.

**D-BR0809-3 — Group 4 keeps bare verbs. No prefixed namespace. `migrate-memory` → `migrate` at the
next breaking window. This closes `D-M5E19-9`, which filed the question as explicitly not decided.**

`/sig:` is already the namespace. [`../references/command-taxonomy.md`](../references/command-taxonomy.md)
already supplies the ontology, and **writing the grouping down is what makes the prefix unnecessary**
— a prefix encodes in every future keystroke what one document explains once. Against that, a rename
is user-visible and breaking: deprecation aliases, a `[BREAKING]` CHANGELOG entry, a minor bump, and
a pass over every doc naming a command, with `install-contract.test.js` and the roster checks both
holding opinions.

The group's only real inconsistency is **one compound name**, and the fix for that is a rename *down*
to a bare verb, not a prefix applied *up* to the other three. Deferred to the next breaking window
rather than done now, because it is the one genuinely expensive part and there is no `0.2.0` pending.

**What this decision is worth, stated honestly:** it is cheap and reversible. If the roster reaches
~30 commands and a flat namespace measurably hurts — new users mis-guessing names, the taxonomy doc
going unread — this should be revisited, and pre-1.0 remains when a rename is cheapest. That is a
*trigger*, and it belongs on the watchlist rather than in someone's memory.

## 2026-08-10 — Inbox drain: the two calls that changed a premise (D-BR0810-1 … D-BR0810-3)

*Source: the 52-entry inbox drain (PRs #136, #137 and this one), the pass the 2026-08-09 session
stopped mid-way through. Rows filed in [`BACKLOG.md`](BACKLOG.md) § "Twelve promoted from the inbox
drain".*

**D-BR0810-1 — Trajectory scoring is UNPARKED and will be built, fed by the local project corpus.**

The entry carried a trigger (*"`M5.E8` lands and instruction-adherence measurement is repeatable"*)
that fired when `M5.E15` gave the canary a real control arm. But it was parked on a **supply**
problem inherited from its sibling — *"four users will show nothing for a long while."*

Brett, 2026-08-10: **use the dozens of local projects as the initial data feed.** That replaces the
blocked input with one that exists today. The distinction the parked caution missed: it was about
**external users**, and it was never about **runs**. Twelve-plus local corpora have already produced
`B82`, `B88` and `B90` — every one a finding Signal's own tree was structurally blind to.

**This does not unpark the cross-install telemetry sibling.** That one pools data *across installs*;
a local corpus is one install. Its stated caution stands and its 2026-12-31 review date is unchanged.

**D-BR0810-2 — The `STATE.md` narrative-vs-frontmatter check folds into `M5.E10` rather than shipping
as a standalone deterministic check.**

The entry itself posed the question: a narrow deterministic slice now, or wait for the Epic that owns
prose-vs-prose comparison? Brett's call: **fold it in.** `M5.E10` is next and already owns the
territory; a separate deterministic check would be a second mechanism for one concept.

Sibling of `B87` — the ledger missing a phase that ran, vs. the narrative describing a phase already
passed. Both are *the record disagreeing with the work*; a fix for either should be weighed against
the other.

**D-BR0810-3 — All twelve homeless inbox entries are filed as backlog rows; the standing-entry
mechanism is filed, not built.**

Brett approved all four groups, the fourth conditionally — *"fix if there is a reliable/recommended
fix."* **The reliable fix is a feature, not a stamp:** making the drain distinguish a
deliberately-permanent entry from an unanswered one changes `parseEntries`' return shape and
`listDrainCandidates`' contract, both consumed by `commands/plan.md` and the drain tests. That is
Epic-lane work, and doing it inside a chore branch would convert a hedged yes into a semantics change
in a shared module. Filed with its design question stated — a new marker, or widen the existing
`parseTriggerWatchlist` — and explicitly **not both**.

## 2026-08-11 — M5.E10 DISCUSS: the scope call, and what refusing it would have cost (D-M5E10-1 … D-M5E10-5)

*Epic: `M5.E10`, review hardening / claim integrity. Shipping it closes Milestone 5 (`D-BR0809-2`).
Requirements: [`M5.E10-REQUIREMENTS.md`](M5.E10-REQUIREMENTS.md). Evidence:
[`../analysis/CLAIM-INTEGRITY-ANALYSIS.md`](../analysis/CLAIM-INTEGRITY-ANALYSIS.md), its single home.*

**D-M5E10-1 — Scope is "checkable parts + writing rules". The adversarial claims-audit agent is
deferred, and the deferral must be VISIBLE in what ships.**

Brett, 2026-08-11. In: everything a machine can verify — requirement-coverage diff, VALIDATION
self-consistency, the VERIFICATION denominator + *"what this could not establish"* section, the
correction-protocol grep, retro-index freshness, the `STATE.md` narrative check — plus the guidance
changes that cost text rather than machinery (the provenance rule, the `B38` reclassification).

Out: `CLAIM-INTEGRITY` §6 item 3, an agent re-reading every claim against its source.

**The deferral carries an acceptance criterion of its own (`AC0.1`), and that is the point.** §6 item
3 is the piece that *"kills the class generally; catches what determinism can't."* Shipping the
deterministic half and letting the docs read as though claim integrity were solved would be **a
completeness claim written from the shape of the work** — this Epic's own defect, committed by the
Epic while closing the milestone named after it. So the shipped output must state that the semantic
backstop is not built and what it would have caught.

**D-M5E10-2 — §6 item 7's either/or resolves to the text half: the denominator discipline moves into
the command text; VERIFY does not gain an agent dispatch.**

Follows from `D-M5E10-1` — dispatch is machinery. `agents/verifiers/verifier.md` and
`nyquist-auditor.md` already carry the enumerate-with-a-denominator discipline and **no command
dispatches either**; `commands/verify.md` spawns no agents at all. Moving the discipline into the
command is what makes it run.

**The agents do not get to stay quietly unreachable.** `AC6.2` requires them to be made reachable or
**documented as unreachable** — an uncalled guard left undocumented is `M5.E8`'s named class, and
leaving one inside the Epic about false claims would be the joke telling itself.

**D-M5E10-3 — The correction-protocol check blocks at FULL and is advisory below.**

Consistent with every other tier-gated gate. Decided rather than asked: this is gate mechanics, not a
product call, and the tier system already answers "how hard should this bite."

**D-M5E10-4 — The `STATE.md` narrative check is a NARROW deterministic slice, not a prose reading.**

Folded into this Epic by `D-BR0810-2`. Scope: the phase-name token nearest the `current_epic`
mention, compared against the frontmatter — **not** a general narrative-vs-frontmatter comparison,
which is the deferred semantic half.

**The bar is that it must fail where the existing checks pass** (`AC8.3`). `runDriftChecks` reported
**6/6 clean** across every instance, and it was right to: `body-omits-current-epic` tests
`mentioned.has(epic)` — presence, not agreement — and `phase-behind-artifacts` never reads the prose.
A check that duplicates either reading adds nothing.

**Five instances, and the fifth happened during this Epic's opening commit** — *"Nothing in flight"*
while `current_epic: M5.E10` sat twenty lines above, **in the section that catalogues instances 1–4
and argues the defect is structural.** The catalogue did not protect the file it lives in. That is the
strongest available evidence that the remedy is not documentation.

**D-M5E10-5 — Read the effective tier AFTER the Epic roll, never before.**

Recorded as a repeatable trap, not a one-off. At this Epic's open, `readEffectiveProfile` returned
**`M5.E19`'s FEATURE/light** right up until `setCurrentEpic` ran, because the closing Epic's PROFILE
was still shadowing. `M5.E10` inherits the project's **FULL/strict**.

This is `B59`'s shape — an Epic running a whole phase at the wrong tier because the tier was read one
step too early — and `B59` cost `M5.E16` its entire DISCUSS at the wrong rigor. The command file's
preamble ordering (tier-gate first, Epic mode second) reads naturally and is wrong for `--epic` runs.
**Filed as a `commands/discuss.md` ordering defect for this Epic's own build queue.**
