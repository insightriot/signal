# Signal — Fresh-Session Context

Load this at the start of every work session. Short on purpose.

---

## Project

**Signal** (market-facing: *SignalOS*) — a Claude Code plugin that integrates patterns from the Claude Code plugin ecosystem with a project-complexity calibration router. Command prefix: `/sig:`.

## Scope (locked)

- **v1** = 6-phase MVP (`calibrate → discuss → plan → execute → verify → review → ship` + `escalate`). Currently being built.
- **v2** = 10-phase expansion (adds ideate/validate/strategize upstream + compound downstream). Follow-on, after v1 ships and validates.

See `DECISIONS.md` for full rationale.

## Attribution (locked)

9 source repos in 4 tiers:
- **Ported (v1):** GSD, Agent Skills.
- **Planned (v2):** gstack, pm-skills, superpowers, compound-engineering.
- **Pattern source:** planning-with-files, oh-my-claudecode.
- **Reference:** GSD Skill Creator.

See `LICENSES.md` for details.

## Build approach (locked)

Hand-rolled `.planning/` (this directory) drives the build. **No GSD install.** Once `/sig:calibrate`, `/sig:discuss`, `/sig:plan` are functional (late Milestone 2 / early Milestone 3), switch to dogfooding Signal on itself.

**`.planning/` is always tracked in git** — here and in every user project Signal touches. Never add it to `.gitignore`. It's the project's memory, not scratch state. See `DECISIONS.md` for the full principle.

## Current state

**v1 is feature-complete and shipped.** Latest release **v0.1.11** (2026-07-25, **M5.E6 — doc-runtime close-out**: `/sig:sweep` + FR7/B31 + the four M5.E5 carry-overs, 1623 tests; retro `M5.E6-RETROSPECTIVE.md`, decisions D-M5E6-1…5); prior **v0.1.10** (2026-07-21, **M5.E5 — carry-over bug squash**: B24/B25/B26 + B6 refinement, 1561 tests); **v0.1.9** (2026-07-21, **M5.E4 — bug & doc-runtime hygiene close-out**: 12 bugs + FR5 concurrency-lock, 1529 tests); **v0.1.8** (2026-07-20, the M5 doc-runtime — combined E1+E2+E3); **v0.1.7** (2026-07-15, M4.5.E11 Epic-native flow); **v0.1.6** (2026-07-14, doc-integrity guardrail); **v0.1.5** (2026-07-05, M4.5.E10); **v0.1.4** (2026-06-06) bundled E4+E5; **v0.1.3** (2026-05-31) bundled E7+E3+E9+E8+E2. Plugin marketplace-installable from `InsightRiot/signal`. Milestones 1–4 closed (M4 + v0.1.0 tagged 2026-05-12).

**MILESTONE 4.5 (Release Hardening / Stranger-Adoption Readiness): CLOSED 2026-07-15.** All Epics E1–E11 shipped (v0.1.1–v0.1.7); the external-validation criterion (≥3 non-Signal testers) is **met** — 4 non-Signal users onboarded with positive reception; Brett is source of truth on "bulletproof," external feedback folds in as it arrives (DECISIONS 2026-07-15). Shipped Epics: **E1** (install-path fix → v0.1.1; Slices 3–5 shelved), **E6** (STATE schema + `/sig:checkpoint` → v0.1.2), **E7 / E3 / E9 / E8 / E2** (→ v0.1.3), **E4 + E5** (worked example + comparison + launch assets → v0.1.4), **E10** (resume trust & capture integrity → v0.1.5), **E11** (Epic-native flow → v0.1.7, 2026-07-15). One release carry-over: AC6.4 (real-session SessionStart-resume hook smoke check) is a documented human step — see `references/hooks-api.md`.

- **18 slash commands**, **26 agents**, **21 skills**, **1623 tests passing**, validator green.
- **Conventions locked**: question-patterns (strict enum / 3+other / open-ended); PROFILE.md schema + tier-to-defaults + escalation_history; ID-is-identity vocabulary (M4.5.E6.S1.t1 addressing); `.planning/` always tracked in git; STATE.md YAML frontmatter (`schema_version: 1`) with auto-migration.
- **`.planning/` restructured 2026-06-05** (out-of-band hygiene, *not* an E5 task): 72 → 24 root files; closed-cycle scaffolding archived under `.planning/archive/M4.5/E{n}/` (M1–M4 under `archive/milestones/`). **`.planning/INDEX.md` is the documentation map — read it first.** Retros stay in root as the traceability spine. `tools/archive-migrate.mjs` = `/sig:migrate-memory` prototype. Commits `be9d87d`, `79c030f`.

## Active work

**✅ CLOSED: M5.E9 — shipped as v0.1.12 (2026-07-27).** The linear-mode & phase-ledger close-out. Full detail: [`M5.E9-RETROSPECTIVE.md`](M5.E9-RETROSPECTIVE.md) · [`CHANGELOG.md`](../CHANGELOG.md) `[0.1.12]`. `B41`–`B45` fixed; **`B46`, `B47` opened** and homed in M5.E9's later slices, **not** v0.1.12.

**The one sentence worth carrying forward:** *all four originating bugs came from outside Signal's own use.* A live `/sig:ship` on a project that has never used Epics found in one afternoon what a 1623-test suite had missed for nine releases — because Signal-on-Signal has been Epic-mode since M4.5.E11 and **structurally cannot reach that path**. The Epic then reproduced its own bug class **three times inside the fix**: `B44` is a silent write that drops data; FR4's first implementation dropped quarantined entries silently; and REVIEW's **Critical** was a new `/sig:sweep` check telling *every healthy project* its history had been destroyed. That last one was **removed rather than re-tuned** — a past collapse is **not detectable from the file**, because the evidence was destroyed by the bug being detected. Admitting undetectability was the fix.

**Live `B36` sighting at this Epic's own SHIP:** the FR1 retro gate **skipped** (`{skipped:true}`) because `MILESTONE-5.md` carried a maintained non-shipped E9 row — the exact stale-row inertia `B36` describes. The retro existed only because it was written before the gate ran. **`B36` is confirmed by dogfooding, not just by reading.**

**▶ OPEN: M5.E8 — the measurement foundation. DISCUSS + PLAN both closed 2026-07-27.**

**⏭ NEXT: `/sig:execute` — but it is GATED on Brett's approval, which was not given before the context clear.** The plan is written and committed; nothing has been built. Re-read [`M5.E8-PLAN.md`](M5.E8-PLAN.md) and re-ask for the go-ahead before dispatching Wave 1. *(Do not assume approval from the fact that PLAN is complete — that is the failure mode the 2026-07-26 CONTEXT refresh was written to stop.)*

Artifacts: [`M5.E8-REQUIREMENTS.md`](M5.E8-REQUIREMENTS.md) (6 FRs) · [`M5.E8-RESEARCH.md`](M5.E8-RESEARCH.md) · [`M5.E8-PLAN.md`](M5.E8-PLAN.md) (4 slices / 3 waves) · [`M5.E8-VALIDATION.md`](M5.E8-VALIDATION.md) (28 ACs, 3 RED-first). Decisions **D-M5E8-1…3**. Tier FULL inherited. Suite **1652**, validator green, at `25a9e27`.

**Wave plan:** W1 = S1 (publish the coverage ceiling) ∥ S2 (harness skeleton) · W2 = S3 (the control arm — the Epic's real work, split point named) · W3 = S4 (append-only log + ship-checklist anchor).

**The number PLAN produced, which is the thing to carry into EXECUTE:** across all 18 command files there are **202 directive lines**; **22 (10.9%) leave an observable trace, 180 (89.1%) do not.** So the harness can only ever reach ~11% of what Signal instructs — and `execute.md`, `verify.md`, `review.md` and `calibrate.md` name **zero** library calls, meaning **the phases doing the most work are the least measurable.** Publishing that ceiling is **Slice 1**, deliberately ahead of the harness, so the figure cannot be accused of being fitted to the tool. **AC5.3 requires the log to state that the unmeasured remainder is *unmeasured, not passing*** — the sentence most likely to be softened later.

**Named worst case, and it is the desired one:** if `B41`'s phase-entry rule (the first subject, chosen because M5.E9 shipped it unverified) shows **no difference between arms**, Signal will have spent an Epic proving one of its own shipped fixes is **inert**. That is what a real measurement is for. Written down so it is not rediscovered as a crisis mid-EXECUTE and answered by tuning the harness until the number improves.

**Two open safety items from plan validation (F1, F2):** the harness runs a real agent that writes files, so **isolation needs a test** — the catastrophic bug is pointing it at the invoking project and letting an agent edit Signal's own `.planning/` (assigned to S2.t1, reusing `path-confine.js`). And **half this Epic is not suite-testable by construction**: a stub-driven test proves the harness *computes* correctly, never that its answer about a real agent is *true*.

**The question:** does a Signal instruction change what an agent does? **The occasion is not theoretical** — M5.E9 added a phase-entry instruction to four command files and could not prove any agent follows it, and said so in its own test header. Every prompt-shaped port parked in `SIGNAL-V2-ROADMAP.md` is gated on this.

**Three decisions.** **(1)** An **on-demand harness**, not CI — a real agent call is paid, slow and nondeterministic, and a test that cries wolf gets switched off, which reads as coverage while being worse than nothing. Not transcript archaeology either: it has **no control group**, so it measures what happened and never what caused it. **(2)** Only instructions with an **observable trace**, verdicted by a **delete-the-instruction control run** — a trace present in *both* arms proves the instruction is **inert**, which is a finding, not a pass. Rubric scoring by a second model was rejected: it measures with the same instrument it tests. **(3)** Anchored to the **SHIP pre-ship checklist, not a trigger** — `B39` proved Signal's triggers have never been walked.

**The cost, stated up front rather than discovered:** most of what Signal's command files say leaves **no trace**. *"Surface ambiguity," "don't rationalize," "gate at product altitude"* — the guidance carrying most of the value — is out of reach of this method. **Quantifying that ceiling is FR5**, because *"we measured the measurable 12%"* is an honest finding and *"we measured adherence"* is not.

**M5.E7 — "the v2 direction audit" (BR-8) — ✅ CLOSED 2026-07-26. Full DISCUSS → PLAN → EXECUTE → VERIFY → REVIEW → SHIP.** No code shipped, so **no version was cut** — the deliverable is a decision. Retro: [`M5.E7-RETROSPECTIVE.md`](M5.E7-RETROSPECTIVE.md); CHANGELOG entry is `[Unreleased]`. **The FR1 retro gate hard-blocked SHIP** (`NO_RETRO_FILE`) until the retro existed — the mechanism working, and worth noting against **B36**, where the same gate went inert on a stale milestone row at M5.E6's SHIP; `MILESTONE-5.md`'s E7 row was marked shipped at close so the next Epic doesn't hit that condition. `evictEpicNarrative` returned `no-section` (safe no-op — **FR2b still has never live-fired**, the carry-forward from M5.E1).

**REVIEW = PASS-WITH-FIXES (2026-07-26)** — repurposed per AC7.4 to attack the *reasoning*, not code (`M5.E7-REVIEW.md`). 0 Critical · 3 Important + 1 Suggestion, **all fixed in-phase** (+63/−14, prose only; 1623/1623 tests, validator green). **I1** — §2.1's *"nobody forgot anything"* was a universal the corpus does not support, and `BACKLOG.md` carried the denial and its counter-instance (`B13`, learned 2026-07-18 / violated 2026-07-25) **25 lines apart**; re-scoped, and §6.6's survivorship logic applied where it bites hardest (the three chains were selected *because* documented). **The COMPOUND cut survives** on `B13`'s independent deterministic-check ground. **I2** — two of §6.1's three self-defences don't answer the charge §6.1 states: **(c) withdrawn** (an external catch is a symptom of the bias, not a defence), **(a) relabelled**, **(b) survives and is checkable**. **I3** — the falsifier lived only in `analysis/`, the location D-M5E7-8(b) names as enforced by nothing, and **cannot ride a trigger** (a null result fires nothing) → landed under M5.E9 as a **dated check, 2026-10-26**, where silence defaults to *"the reframe was decorative; re-run the roadmap."* **S1** — the audit's own strongest safety recommendation (promote findings-quarantine on precaution) was dropped downstream; restored, verb unchanged. **New bug `B41` (`confirmed`, P2)** cataloged at REVIEW and homed in M5.E9: four phase commands never call `transitionPhase`, so `completed_phases` omits PLAN/EXECUTE/VERIFY/REVIEW in any command-driven project — and `markFresh` stamps the stale position fresh, turning *stale-and-flagged* into *stale-and-silent*. **Two calls carried through SHIP with reversible defaults standing** (Brett: *"please continue,"* 2026-07-26): the falsifier's **2026-10-26** date is a chosen three-month default, not derived — **move it if M5.E8's real schedule says otherwise**; and **findings-quarantine stays parked**, with the audit's recommendation restored at its `BACKLOG.md` entry rather than acted on. Both remain changeable; **neither is recorded as a ratified decision.** Runs under Signal's first Epic-scoped PROFILE (`M5.E7-PROFILE.md`, D-M5E7-2): `tier: FULL`, code-ceremony flags off, gates strict — *"strict thinking, zero test theater."* Spec `M5.E7-REQUIREMENTS.md` (**7 FRs**, grew from 5 — FR6/FR7 emerged in research and were flagged as scope growth, not absorbed silently). Decisions **D-M5E7-1…12**.

**Deliverable: `analysis/SIGNAL-V2-ROADMAP.md`.** 45 candidates verbed — **11 distinct builds · 16 continue · 19 abandon** — sequenced **M5.E8–M5.E12** and landed in `BACKLOG.md` with triggers + first slices (that landing is the enforcement half; a roadmap in `analysis/` is checked by nothing).

**The finding everything is organized around: Signal cannot detect whether its own interventions work, in any dimension.** No test asserts a prompt instruction was obeyed, against a measured **7-of-12 adherence and 7.12× output spread on byte-identical code**. Hence **M5.E8 (measurement) is unconditional-next** and gates every prompt-shaped port.

**Three beliefs were reversed, all load-bearing.** (1) *"Signal keeps forgetting, so it needs a memory loop"* — **falsified**: read the three carry-over chains with dates attached and the knowledge was **in-context at the moment of every miss**. The whole COMPOUND port group is cut. (2) *`<HARD-GATE>` is the mechanism to port* — **it does not exist as a mechanism** (C3: 4 grep hits, 1 live, no parser, no validator). (3) *the coverage frame* — a scorecard counts only what is absent, so it cannot see Signal **ahead** of a source, which happened on the first pass.

**Not one straight port survived.** 10 of the 11 builds are Signal-native. **That is also exactly what a confirmation-biased audit would produce** — roadmap §6.1 carries the self-attack and a falsifier: *if M5.E8 lands, measurement shows Signal's enforcement is as good as claimed, and the ports still never happen, the reframe was decorative.*

**Brett ratified (2026-07-26):** product discovery is out of scope, **roadmap advisory is in** (→ M5.E11, the best-evidenced *new* capability, and one the audit nearly missed because it never asked *"would this have stopped us building the wrong thing, in the wrong order?"*); bugs defer to a named Epic (**M5.E9**); telemetry acceptable, **local measurement before cross-install aggregation**.

**Known gaps, recorded not papered over:** **12 of 18 retros harvestable** (**not 16** — C2; 4 are `[FILL IN]` stubs, reported and deliberately **not** reconstructed); the inbox read at **8% of lines** with **33 of 39 bodies unread**; no written tester feedback exists (`M4.5.E5-LAUNCH-KIT.md` §3 unchecked). **Six counts in this Epic were wrong until re-derived** — the strongest evidence produced for its own ledger-reconcile build.

**M5.E6 — Doc-runtime close-out (the maintenance-command half) — ✅ SHIPPED as v0.1.11 (2026-07-25).** Finishes the doc-runtime so Signal's self-maintenance is locked *before* the BR-8 re-audit. Shipped: **`/sig:sweep`** (read-only, invoking-project hygiene — the **18th** command) + `docs/map` ship-checklist line (FR3) + FR7 close-out & **B31** (`/sig:add`'s doc-write moved under `.state.lock`, closing the add-vs-drain cross-lock hole) + the four M5.E5 carry-overs cleared (**B27/B28** migrate flag-not-abort, **B29** `_afterRead` guard, **B30** retro-gate fresh-flow). Full DISCUSS→SHIP at FULL/strict: 25 task-commits / 3 waves; 1561 → **1623 tests**. VERIFY **PASS** (strict — independent mutation proof-of-fail on B27/B30/B29). REVIEW **PASS** — 3-specialist adversarial panel (code-quality + security OWASP/ASVS-L2 + test-integrity), **0 Critical, 0 false-greens**. Decisions **D-M5E6-1…5** (notably D-M5E6-5: FR7's "build the lock" was already shipped by M5.E4/E5 — re-scoped to bookkeeping + B31). Retro: `M5.E6-RETROSPECTIVE.md`. **Self-dogfood note:** the FR1 retro-gate skipped on M5.E6's own stale milestone row (→ **B36**, P2) — the Epic that fixed B30 tripped the *third* milestone-row residual; caught by hand, gate fired once the row was marked shipped. **New carry-overs (all `needs-triage`):** **B36** (FR1 gate stale-row blind spot, P2), **B34/B35** (renameFn pollution parity + sweep crash-safety, P3), **B32/B33** (map-array + comment drift, P3). No Epic open; next horizon: the **BR-8 v2-port re-audit**, plus the queued Sprint-4 compound Epic (OBSERVATIONS.md passive capture, D-M5E6-2).

**M5.E5 — Carry-over bug squash — ✅ SHIPPED as v0.1.10 (2026-07-21).** The four M5.E4 carry-overs cleared: **B24** (migrate dangling-gate over-abort → resolved-abs-target key + multiset), **B26** (retro gate blind on the self-hosted flow → STATE-based Epic-close fallback, Layers 1+2; Layer 3 descoped), **B25** (FR5 read-enclosure behavioral interleaving test + `_afterRead` seam), **B6** (stale-nudge by file identity → `BOOKKEEPING_PATHS`). Full DISCUSS→SHIP at FULL/strict, sequential dispatch (4 tasks / 2 waves); 1529 → **1561 tests**; REVIEW **PASS** — 3-specialist adversarial panel, 12-case mutation matrix, **0 false-greens** (contrast v0.1.9's two). **B26 dogfooded on its own SHIP** (hard-blocked until the retro existed). Decisions D-M5E5-1…4. Retro `M5.E5-RETROSPECTIVE.md`. **New carry-overs (all `needs-triage`):** **B27/B28** (migrate over-abort cluster — fail-safe; one design call: flag-not-abort for archive links), **B29** (`_afterRead` prototype-pollution hardening — unreachable), **B30** (FR1 pre-check timing). No Epic open; next horizon: the **v2-port re-audit (BR-8)** or a new Epic.

**M5.E4 — Bug & doc-runtime hygiene close-out — ✅ SHIPPED as v0.1.9 (2026-07-21).** Full DISCUSS→SHIP at FULL/strict: the 12 confirmed `BUGS.md` items cleared (or dismissed) + the FR5 doc-runtime concurrency-lock; 1492 → **1529 tests**; REVIEW **PASS-WITH-FIXES** — a 3-specialist adversarial panel caught + closed a real path-confinement bypass shipping under a *false-green test* (the `evict.js` leaf-symlink escape — the B19 lesson recurring). Decisions D-M5E4-1…5. Retro: `M5.E4-RETROSPECTIVE.md`. **Two v0.1.10 carry-overs:** **B24** (pre-existing dangle in a closed DECISIONS section blocks migrate) + the **B6 local-stale scope refinement**. Sprint-3 hygiene *commands* (`/sig:sweep`, CLAUDE.md de-bloat, `docs/map`) also → v0.1.10. Broader next horizon: the **v2-port re-audit (BR-8)**.

**M5.E3 — All-docs hygiene runtime + living `BACKLOG.md` + append-log eviction (FR4/FR5 + D-M5E2-6) — ✅ DISCUSS complete (2026-07-18); PLAN next.** Opened via `/sig:discuss --epic M5.E3` (clean B9-fixed roll). The final doc-runtime Epic; **folded into the release** — the doc-runtime ships as ONE 0.1.x (E1+E2+E3). **Doc-lifecycle model locked (D-M5E3-1…8, `DECISIONS.md` 2026-07-18):** four role-named files — `ISSUES-INBOX.md` (raw capture, renamed from `FUTURE-IDEAS.md`) → drain classifies/dispositions → `BACKLOG.md` (sequenced work) + `BUGS.md` (defects); `OPEN-QUESTIONS.md` (questions). Capture = verbatim body + agent-authored auto-title. Append-log hygiene = **evict-with-anchors** (closed-milestone `DECISIONS.md` → `DECISIONS-HISTORY.md` behind pointers, anchors preserved; the auto-`/sig:index` is the load-bearing traversal layer) — E3's risky migrate-shaped piece; audit showed near-zero cross-ref risk (2 file-level hard links, 669 index-resolvable prose refs). Hygiene checks = test-suite, deterministic + offline. Rollout: layout v2→v3 via the E2 banner + extended `/sig:migrate-memory` (existing projects) / born-on-v3 (new projects); retires the `ship.md` §8 Curator step. Spec: **`M5.E3-REQUIREMENTS.md`** (6 FRs + ACs + NFRs). Tier FULL/strict (inherited). Next: **`/sig:plan`** (`current_epic: M5.E3` set; no `--epic` needed).

**M5.E2 — Auto-sensing migrate command (FR6/FR7) — ✅ SHIPPED 2026-07-18** (full DISCUSS→SHIP at FULL/strict in one session; **landed on `main` intentionally unreleased** — release batched into the combined E1+E2+E3 cut per D-M5E2-6; retro `M5.E2-RETROSPECTIVE.md`). Shipped `/sig:migrate-memory` (relocate-never-delete, dry-run-default, git-reversible, all 3 bloat vectors + archive-tree + FR7 stamp/hook/banner) — S1 engine (t0–t8) + S2/S3 vectors/hook/banner + S4 Signal dogfood (`.planning/` 31 archive relocations + stamp v2) + nextpass faithfulness proof (546 KB→1.3 KB, **0 words dropped**, re-confirmed post-REVIEW). **REVIEW = 3-specialist adversarial panel** → caught + fixed a **SHIP-blocking rollback gap** (2 reviewers reproduced it), a directory-symlink escape, fence-less false-success, a `readLayoutBanner` perf/DoS, and test-adequacy gaps — 5 RED-first batches (`50ad065`..`dd77ef1`), 1071→**1300 tests**. Bugs B10–B16 logged (B10–B13/B11 fixed; B14/B15/B16 ticketed). Reports `M5.E2-{VERIFICATION,REVIEW}.md`. The command operates on the **invoking** project (unwedges nextpass et al.); live per-project apply happens after the combined release via `/plugin update`. Spec `M5.E2-REQUIREMENTS.md`; decisions D-M5E2-1…6.

**M5.E1 — Doc-runtime & memory hygiene — SHIPPED 2026-07-16 (full DISCUSS→SHIP, FULL/strict).** M5's first-built Epic, opened via `/sig:discuss --epic M5.E1`. Delivered the doc-runtime **model + eviction mechanics** (a bounded first slice of the go-big flagship): canonical doc-model (FR1, `references/doc-runtime-model.md`) + STATE.md migration-relocate/evict-on-close/skeleton/tier-size-warning (FR2a–d) + FUTURE-IDEAS physical eviction to a ledger (FR3), **dogfooded on Signal's own `.planning/`** (STATE.md 64.5 KB→1 KB; 6 shipped entries → ledger). 999→**1070 tests**; REVIEW PASS-WITH-FIXES (2 independent specialists, 4 Important fixed — incl. a coverage-gate-defeat + a ledger data-loss bug). Retro `M5.E1-RETROSPECTIVE.md`. **Carry-forward:** FR2b `evictEpicNarrative` is fixture-proven but **never live-fired** (no-ops at M5.E1's own close). **Deferred:** FR4/FR5 → M5.E2 (all-docs hygiene + living `BACKLOG.md`); FR6/FR7 → M5.E3 (auto-sensing migrate command + doc-layout stamp). Spec: `M5.E1-REQUIREMENTS.md`; decisions D-M5E1-1…6. **Landed on main, intentionally unreleased** — release **batched with the doc-runtime continuation** (cut the marketplace release when M5.E2/E3 land, so the doc-runtime ships as a coherent unit rather than a partial eviction-without-migrate; DECISIONS 2026-07-16). plugin.json stays 0.1.7; CHANGELOG entry is `[Unreleased]`. **Next: M5.E2 (doc-runtime continuation — FR4/FR5) or the v2-port re-audit.**

**M4.5.E11 — Epic-native flow — SHIPPED as v0.1.7 (2026-07-15).** Full DISCUSS→SHIP at FULL/strict. Made Epic mode first-class: `--epic` on `/sig:discuss` + `/sig:new-project`, `setCurrentEpic` write-half, `{EpicID}-*.md` artifacts, per-Epic PROFILE calibration; **linear mode byte-identical** (opt-in/additive). 894→**999 tests**; REVIEW PASS-WITH-FIXES (2 specialists, 0 Critical). Retro `M4.5.E11-RETROSPECTIVE.md`. **Closed M4.5.**

**v0.1.6 — Doc-integrity guardrail — SHIPPED (2026-07-14).** Lightweight patch (no Epic ID; tracked as `current_epic: v0.1.6`), full DISCUSS→SHIP at FULL/strict. 5 slices (`94aaaa7..b70da15`): **FR1** STATE-frontmatter write-guard (block prose in `completed_phases`/`blockers` — field-specific/blacklist/raw-text; fires in every installed repo) · **FR2** read-time size banner (resume/status/checkpoint, 150 KB) · **FR3** `/sig:plan` drain recognizes `> **Promoted**` blockquote stamps (converges 43→37) · **FR4** `/sig:add` clause-boundary titles · **FR5** 3 bugs → `BUGS.md`. VERIFY 21/21 ACs; **REVIEW PASS-WITH-FIXES** — 2 specialists, FR1 was inert on CRLF + `$`-replacement desync, 6 fixes in-phase. 854→**894 tests**, no new deps. Decisions D-v016-1…7; retro `v0.1.6-RETROSPECTIVE.md`. **Carry-over:** AC6.4-style real-session hook smoke (human step). **Next horizon: the committed Epic-native flow Epic**, or **Milestone 5**. (The version-as-`current_epic` friction hit during this SHIP is one more vote for Epic-native flow.)

**M4.5.E10 — Resume trust & capture integrity — SHIPPED as v0.1.5 (2026-07-05).** Full DISCUSS→SHIP at FULL/strict in one session. 5 slices / 13 tasks (`0c0ca54..dfc4bf7`): **S1** FR2 origin-drift (`isStaleVsOrigin`) + FR3 STATE freshness in discuss/plan · **S2** FR1 `resolveArtifactPath` Epic-prefix resolver (fixed the resume-can't-find-`M4.5.E10-PLAN.md` papercut) · **S3** FR4 capture-pipe guards · **S4** FR5 schema-drift banner in status/resume (AD2) · **S5** FR6 hook harness + `references/hooks-api.md` + SD3 privacy fix. VERIFY 31/31 ACs; **REVIEW PASS-WITH-FIXES** — 2 independent agents caught the same crash (F1: staleness checks threw on a schema-drifted STATE.md instead of degrading), 7 findings fixed in-phase + a git-option-injection guard. 777→**854 tests**, no new deps, validator green. Retro: `M4.5.E10-RETROSPECTIVE.md`. **One carry-over:** AC6.4 real-session hook smoke check (human step, `references/hooks-api.md`). **Next horizon: the committed Epic-native flow Epic** (make Epic mode first-class — commands write Epic-scoped artifacts + populate `current_epic`; FR1 is its forward-compatible read-half — DECISIONS 2026-07-05).

> **Resume caveat (expected, not a bug — it's the thing E10 fixes):** `/sig:resume`'s artifact resolver can't yet find `M4.5.E10-PLAN.md` — the Epic-prefix resolver *is* S2/FR1, not built. Post-clear resume reports the correct STATE (EXECUTE / S1 / next-action) but its current-phase-artifact section will say "not found." Read `M4.5.E10-PLAN.md` directly for the task list until S2 lands.

**Epic-native flow = the committed NEXT Epic after E10** — make Epic mode first-class (commands create/track Epics, write Epic-scoped artifacts, populate `current_epic`, per-Epic calibration). Root cause + full context in DECISIONS 2026-07-05; FR1 is its forward-compatible read-half.

**M4.5.E5 — external validation + launch — SHIPPED as v0.1.4 (2026-06-06)** (the last M4.5 Epic before E10 was added). v0.1.4 tagged (`6328fed`), first GitHub Release; the outward tester loop (recruit ≥3, record demo) remains open, tracked in `M4.5.E5-LAUNCH-KIT.md` §3.

**Build horizon after E10 + Epic-native: M5** (v2 framework ports + memory-management milestone). The 2026-06-05 corpus restructure already dogfooded part of M5's memory work (see the `/sig:migrate-memory` FUTURE-IDEAS entry).

**Shelved (not deleted), pending tester volunteers (per D-E3-12):**

- **M4.5.E1 Slices 3–5** — Linux + WSL install matrix + versioning-policy doc + validator hardening. Scoped in `MILESTONE-4.5.md` § E1; paused until a tester on the platform commits to running `/sig:init` → verifying agent registration.

**Multi-machine norm:** Signal-the-codebase work happens on **this Mac Studio**. Biz machine + personal laptop are `/plugin install` test environments only. Don't run parallel `/sig:*` workflow commands across machines — git races create duplicate work.

## Key files

- `.planning/PROJECT.md` — the full v1 spec
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` — the v2 vision
- `analysis/AGENT-EFFECTIVENESS-ALIGNMENT.md` — Signal measured rec-by-rec against Span's *Beyond the Model* (Q3 2026). Confirms M5.E8's priority from outside; finds one absent axis (**environment readiness**), now blocked on the `/sig:permissions` reframe. Decisions: `DECISIONS.md` 2026-07-26 (the alignment pass)
- `CLAUDE.md` — project instructions
- `.planning/MILESTONE-5.md` (**active** — the doc-runtime E1–E6 all closed; BR-8 re-audit + v2 ports next) + `MILESTONE-4.5.md` (closed 2026-07-15 — release-hardening / stranger-adoption). **M1–M4 archived** at `.planning/archive/milestones/` (M4 = `/sig:init` brownfield onboarding, closed 2026-05-12 + v0.1.0).
- `.planning/DECISIONS.md` — append-only architecture decisions
- `.planning/OPEN-QUESTIONS.md` — unresolved design questions (v1-scoped)
- `.planning/ISSUES-INBOX.md` — post-v1 architectural evolutions of Signal's own mechanisms (distinct from MILESTONE-5's rundown-v2 integrations)
- `.planning/STATE.md` — what milestone we're in, active, blocked

**Authoritative references (in `references/`):**
- `profile-schema.md` — PROFILE.md format + validation rules
- `tier-definitions.md` — 4-tier definitions + tier-to-defaults table + escalation paths + brownfield calibration patterns (added in M4.t16)
- `question-patterns.md` — three question shapes (strict enum / 3+other / open-ended) — **especially relevant for M4.t8**
- `anti-rationalization.md` — anti-rationalization patterns

**Tooling (in `tools/`):**
- `lib/state.js` — `initState`, `readState`, `transitionPhase`, `checkGateArtifacts`, `PHASES`
- `lib/profile.js` — `readProfile`, `isPhaseEnabled`, `applyRigorOverrides`, `ProfileSchemaError`
- `lib/landscape.js` — `readScan`, `readAllScans`, `extractSection`, `extractField` (consumed by `/sig:init` Step 3 synthesis)
- `lib/walkthrough.js` — `countMarkers`, `appendNote` (consumed by `/sig:init` Step 5 walkthrough)
- `lib/status.js` — `nextActionForPhase`, `readOpenQuestions`, `formatEscalationSummary`, `reachedDoneViaSkip`, `readLandscapeMeta`
- `lib/context-monitor.js` — `estimateTokens`, `checkContextBudget`, `findSkillPath`, `estimatePhaseSkillCost`
- `lib/skill-loader.js` — skill resolution
- `validate-plugin.js` — `npm run validate`
- `measure-phase-costs.js` — token-cost measurement (`node tools/measure-phase-costs.js`)

## How to start a session

1. Run `/sig:resume`. It reads PROFILE.md + STATE.md frontmatter and prints a single-screen re-orientation briefing (vision, tier, phase, in-flight tasks, last completed task, blockers, open questions, next action). This replaces the manual "read CONTEXT.md + STATE.md + MILESTONE-*.md" ritual.
2. If `/sig:resume` reports `Next: /sig:review` — that is correct, **M5.E7 is mid-flight at VERIFY (passed)**. Run `/sig:review`; it is repurposed to attack the reasoning, not the prose (AC7.4). If it reports `Next: done` instead, the Epic shipped — pick the next Epic from `BACKLOG.md` § "The v2 roadmap" (**M5.E8** is unconditional-next) and run `/sig:discuss --epic M5.E8`.
3. If staleness is reported (STATE.md behind work history), it's very likely the **benign B6 "+1"** (a markFresh/bookkeeping commit — local HEAD already == origin; nothing to pull). Confirm with `git rev-list HEAD..origin/main` = 0; only run `/sig:checkpoint` if a *real* remote push exists. Run `/sig:checkpoint --context` before any planned context clear.
4. For deeper context, open the files in this order: `CONTEXT.md` (this file) → `MILESTONE-5.md` → `DECISIONS.md` (2026-07-16 entries).

**Current work (2026-07-26):** **M5.E7 is OPEN at phase VERIFY (passed). NEXT: `/sig:review`, then `/sig:ship`.**

**REVIEW is repurposed for this Epic (AC7.4): the panel attacks the *reasoning*, not the prose.** There is no code, so a code-quality review would verify nothing. **This is where the Epic fails if it fails** — `M5.E7-VALIDATION.md` D4 said so before it began: *the mechanical checks confirm every candidate **got** a verb; nothing can confirm the verb was **right**.* Point the panel at **`SIGNAL-V2-ROADMAP.md` §6** and **`M5.E7-DISPOSITIONS.md` §6** — the self-attacks are the most load-bearing, least externally-checked claims in the Epic. Four things VERIFY explicitly could not establish are listed in `M5.E7-VERIFICATION.md` §4.

**Read in this order to pick up:** this file → `M5.E7-PROGRESS.md` (24 findings + the wave table) → `analysis/SIGNAL-V2-ROADMAP.md` (the deliverable) → `M5.E7-VERIFICATION.md` (what passed and what can't be checked). Working files: `M5.E7-{DEMAND-REGISTER,COUNTERFACTUAL,DISPOSITIONS,CORRECTIONS}.md`.

**After SHIP:** M5.E8 (measurement) is unconditional-next; M5.E9 (bugs + overdue enforcement) can run in parallel. Both are in `BACKLOG.md` with triggers and first slices. ⚠ **`B39` caveat: the trigger-watchlist walk has never run**, so every trigger in `BACKLOG.md` is a note rather than an enforcement until M5.E9 fixes it.

**Prior:** the doc-runtime is DONE (E1+E2+E3 → v0.1.8; close-out E6 → v0.1.11) — `ISSUES-INBOX`→`BACKLOG`/`BUGS` capture lifecycle, auto `/sig:index`, all-docs hygiene guard, DECISIONS append-log eviction, `/sig:migrate-memory`, `/sig:sweep`. **18 commands, 26 agents, 21 skills, 1623 tests.**

**Sequencing (decided — the doc-runtime half is now history):**
1. ~~**M5.E1/E2/E3** = doc-model + eviction, migrate command, all-docs hygiene~~ — ✅ shipped v0.1.8.
2. ~~**M5.E4/E5/E6** = bug squashes + the maintenance-command close-out~~ — ✅ shipped v0.1.9 / v0.1.10 / v0.1.11.
3. **BR-8 v2-port re-audit** — now the front of the queue. Still gates the speculative feature ports; the re-audit assigns their real Epic IDs (the pre-override `M5.E1–E6` port labels are superseded — read `MILESTONE-5.md` § Epic status, not the candidate headings).

Open tail: `BUGS.md` **B32–B36**, all `needs-triage` — **B36** (P2, FR1 retro-gate blind on a stale milestone row; found dogfooding M5.E6's own ship), **B34/B35** (P3, renameFn pollution parity + sweep crash-safety), **B32/B33** (P3, map-array + comment drift). B5/B6/B8/B9 and B10–B31 are all `fixed`.

---

*Last updated: 2026-07-25 (**M5.E6 shipped as v0.1.11** — doc-runtime close-out: `/sig:sweep` + FR7/B31 + carry-overs B27–B30, 1623 tests, VERIFY + REVIEW both PASS with 0 false-greens. The doc-runtime is done; no Epic open; next is the BR-8 v2-port re-audit. New carry-overs B32–B36 `needs-triage`. This pass reconciled the stale v0.1.8/v0.1.10-era counts, roster, open-bug tail, and milestone-active markers flagged in the previous footer.)*
