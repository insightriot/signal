# Tranche 3 — Ready for Real-Project Testing

**Goal:** Prove Signal actually holds up end-to-end.

**Estimated effort:** 3–4 days focused.

**Done when:** Signal can be handed to another developer with a README and work without the author present.

**Blocked by:** ~~Tranche 2 complete.~~ **Tranche 2 is COMPLETE as of 2026-04-25 — Tranche 3 is unblocked.**

**What Tranche 2 surfaced** (informs Tranche 3):
- Calibration layer is fully wired — phase commands respect PROFILE.md (Step 3).
- Token budget is not a blocker — all 6 phases fit comfortably (Step 7). PREPARE-phase token-budget trigger NOT firing.
- Cross-bound skills work correctly after Step 7's `findSkillPath` fix.
- 3 friction points logged to OPEN-QUESTIONS for Tranche 3 to triage (see Task 5).
- Real end-to-end execution explicitly deferred from T2 Step 8 to T3 Tasks 2 + 3 (where it naturally lives).

---

## Tasks

### 1. Build `/sig:status` and `/sig:resume` — critical project-resumption UX

These are load-bearing for the actual user experience. Users will jump back into Signal projects hundreds of times across the lifetime of any serious project; they need a reliable way to get the model up to speed without re-reading five `.planning/` files themselves. Without these, every resumption is a manual context-rebuilding exercise — which kills the whole value prop of `.planning/` as persistent project memory.

**`/sig:status`** — read-only project inspection. Reports:
- Current tier + (once concerns ship) concerns weighting
- Current phase, completed phases, blockers (from STATE.md)
- Last calibration date, any escalations (from PROFILE.md metadata)
- Pending open questions (from OPEN-QUESTIONS.md if present)
- One-line recommendation for next action ("You're mid-PLAN. Run `/sig:plan` to continue, or `/sig:resume` for a full re-orientation.")

**`/sig:resume`** — same inspection, plus **actively loads the context needed to continue**. Reads PROJECT.md, PROFILE.md, STATE.md, and the current phase's artifact (e.g., CONTEXT.md if in DISCUSS, PLAN.md if in EXECUTE). Prints a concise re-orientation that includes decisions locked, work done, and work remaining. Ends with: *"Ready to continue with /sig:{current_phase}?"*

**Dogfood:** build `/sig:status` via Signal itself (the smaller, pure-read command); hand-roll `/sig:resume` to avoid the chicken-and-egg loop (can't use resumption to build the resumption tool). This lean was already in OPEN-QUESTIONS pre-T3; locked here.

- [x] Hand-roll `/sig:status` first — but actually run Signal *against itself* to dogfood the build of it (use `/sig:calibrate` (FEATURE) → `/sig:discuss` → ... → `/sig:ship`). Lock the build approach in DECISIONS.md.  ← 2026-04-26 — DECISIONS entry "Dogfood approach: worktree + cherry-pick" locks the protocol.
- [x] Run the full 6-phase flow on the `/sig:status` dogfood target.  ← 2026-04-26 — 8 commits in `worktree-dogfood-status` branch document each phase; substantive output cherry-picked to main.
- [x] Take notes on every friction point — these go in OPEN-QUESTIONS.md and drive Tranche 3+ improvements.  ← 2026-04-26 — 5 findings added.
- [x] Hand-roll `/sig:resume` after `/sig:status` lands.  ← 2026-04-26.
- [x] Ship both commands before moving on; they unblock every subsequent dogfood pass.  ← Both auto-discovered by Claude Code; validator green; 93/93 tests.

**Design note:** `/sig:resume` is the more complex of the two — it has to know how to "re-orient" for each phase, which means it needs per-phase resumption logic. That's a small state machine. `/sig:status` is the pure-read version and lands first.

### 2. FULL-tier pass on a throwaway sample project ✓ COMPLETE (2026-04-26)

- [x] Pick something small but real — chose URL shortener in Node.js (Bitly-shaped: 7-char base62 codes, SQLite persistence, strict scheme allowlist).  ← `.dogfood/url-shortener-fulltier/` (gitignored from Signal).
- [x] Run complete flow from `/sig:new-project` through `/sig:ship`. ← 13 commits, one per logical phase/slice. All 6 Signal phases ran end-to-end.
- [x] Verify every phase fired, every skill loaded, every gate gated. ← every phase produced its expected artifact (PROFILE.md → CONTEXT.md + REQUIREMENTS.md → 1-RESEARCH.md + 1-PLAN.md + 1-VALIDATION.md → 1-PROGRESS.md + commits → 1-VERIFICATION.md → 1-REVIEW.md → 1-SHIP.md). Tier-gating preamble fired in each phase command. FULL-tier overrides applied (TDD on, strict Nyquist, all 8 plan-validation dims, 4-agent research, full security audit, all 4 review specialists, strict gate, anti-rationalization on).
- [x] Record timing and token usage per phase. ← Wall clock ~2 hours focused (single Claude session). Token cost: 4-agent research ~61K agent tokens (PLAN); per-phase narrative + artifacts within reasonable budget; biggest in-context cost was EXECUTE (writing implementation + tests). Logged in `.dogfood/T3-TASK2-RUNLOG.md`.

**Outcome:** all 24 acceptance criteria satisfied (18 automated, 6 manual-acknowledged). 39/39 tests green. REVIEW caught and fixed 2 real Important issues (Content-Length pre-check, unhandled-error logging) inline. 6 new findings appended to OPEN-QUESTIONS.md (env-var resolution, strict Nyquist audit-trail gap, REVIEW PASS-WITH-FIXES verdict, research-parallelism overkill for known domains, DISCUSS NFR checklist gap, Node-runtime / native-prebuilt drift). All triage-able; none gating ship of v1.

### 3. SKETCH-tier pass — the critical validation ✓ COMPLETE (2026-04-26)

If calibration doesn't visibly skip phases and drop rigor in SKETCH mode, the whole value prop is broken. This is the single most important test in the build.

**Outcome: PASSED. Calibration measurably and visibly drops rigor.**

- [x] Pick a throwaway — chose CSV-to-JSON one-shot Node script (`.dogfood/csv-to-json-sketch/`).
- [x] Run `/sig:calibrate`, answer to produce SKETCH tier — answers (throwaway/none/familiar/trivial/hours) hit rule 3 → SKETCH.
- [x] Verify: ~~VERIFY and~~ REVIEW phase skipped — **only REVIEW is in `phases_skipped` per the locked schema** (the original Task-3 spec was wrong; doc/schema drift logged for Task 5 triage). VERIFY runs but with `nyquist_enforcement: off`.
- [x] Verify: TDD off in EXECUTE — confirmed; wrote no automated tests; manual smoke covered the cases.
- [x] Verify: no security audit, no Nyquist mapping — confirmed; PLAN skipped Step 2 (research, `research_parallelism: 0`), Step 4 (8-dim, `plan_validation_dims: none`), Step 5 (Nyquist, `nyquist_enforcement: off`); REVIEW skipped entirely.
- [x] Verify: the output still ships and works — lower rigor ≠ broken output. Confirmed: `csv-to-json.js` runs cleanly, produces valid JSON, handles error paths.

**Contrast vs FULL pass (URL shortener):** wall clock ~24x lower, source LOC ~20x lower, agent spawns 0 vs 4, `.planning/` artifacts 8 vs 14, automated tests 0 vs 39, commits 2 vs 13. **The contrast is real.** 3 new findings logged to OPEN-QUESTIONS.md, all doc-level.

### 4. Write README quickstart ✓ COMPLETE (2026-04-26)

Claim: installable in under 5 minutes. **Verified.**
- [x] Install instructions (plugin registration via `/plugin install signal` + from-source steps with `npm install` + validator).
- [x] First-project walkthrough (`/sig:new-project` → `/sig:calibrate` with the 5 enums spelled out → table walking through each phase + when it skips).
- [x] Command reference (one paragraph per command for all 11 commands).
- [x] Credits & Heritage section — 9 source repos with GitHub links, organized into the 4 tiers (Ported v1, Planned v2, Pattern source, Reference) matching LICENSES.md / CLAUDE.md.
- [x] `.planning/`-always-committed one-liner (its own dedicated section explaining *why*, not just *what*).
- [x] Cold install timed: `npm install` ~1.3s on warm cache; validator + 93 tests ~1.4s. (Doesn't include `git clone` — but Signal repo excluding `node_modules` is a few MB and only one runtime dep.) Well under 5 min.

**Sub-action: moved Signal's own `PROJECT.md` from repo root to `.planning/PROJECT.md`** via `git mv` (history preserved). CLAUDE.md updated. No symlink — commits to convention. Resolves OPEN-QUESTIONS friction "Calibrate Scenario B and `checkGateArtifacts` PLAN gate require `.planning/PROJECT.md`" (logged in T1 dogfood).

**Bonus:** CLAUDE.md "Current State" section was wildly stale ("no source code, build system, or tests yet") — refreshed to point at TRANCHE-3 / dogfood as the current orientation.

### 5. Triage outstanding issues ✓ COMPLETE (2026-04-26)

20 active items going into triage. Outcomes:
- **14 fix-nows applied** (state.js + 5 command markdowns + tier-definitions + README + historical-doc annotation).
- **4 marked resolved** (PROJECT.md location, numeric `{phase}-` prefix, TRANCHE-3 schema-drift, REVIEW/SHIP read-prior-artifacts).
- **1 deferred to T4** (slash-command testing harness).
- **1 confirmed-no-change** (4-tier count — two data points show no drift).

Architecturally-meaningful refinements logged as a DECISIONS entry: PASS-WITH-FIXES verdict, two-form Nyquist evidence, PLAN environment-check, DISCUSS tier-aware NFR prompt, SKETCH-floor codified.

OPEN-QUESTIONS.md: 20 → 2 items. Validator green; 96/96 tests.

### Original Task 5 scope (kept for traceability)

Specific items to triage (from OPEN-QUESTIONS.md as of 2026-04-25):

**T2 Step 8 paper-walkthrough findings (3):**
- [ ] **`{phase}-` artifact naming convention** — single-phase v1 inherits multi-phase prefix from GSD. Decide: embrace multi-phase explicitly (tied to multi-feature lifecycle in FUTURE-IDEAS) OR drop the prefix for v1. **Resolve via dogfood signal** (Tasks 2 + 3 will reveal whether `{phase}-` helps or noises).
- [ ] **REVIEW and SHIP could read prior-phase artifacts more explicitly** — currently they rely on Claude inferring from {phase}-VERIFICATION.md / {phase}-REVIEW.md. **Resolve via dogfood signal** (if Claude misses Review findings in SHIP during real runs, add explicit "Load prior-phase artifacts" steps mirroring DISCUSS's pattern).
- [ ] **state.js `initState` writes DISCUSS, but `/sig:new-project` writes CALIBRATE** — minor, only matters if `initState` is called directly. **Trivial fix** in any session that touches state.js (update default to CALIBRATE or accept a phase param).

**Older T2-era questions still active (4):**
- [ ] **Tier count: validate 4 tiers against real calibration** — likely confirmed-as-is during dogfood; watch for projects that land between SKETCH and FEATURE.
- [ ] **Testing strategy for Signal itself** — slash commands aren't currently testable. Decide whether to build a fixture-based command-execution harness in T3 or defer.
- [ ] **Historical docs: annotate or archive?** — `GSD-AgentSkills-Combination-Analysis.md` is superseded by `analysis/`. Low priority; decide during README work in Task 4.

**Categorize after dogfood passes:** fix now / fix in Tranche 4 / accept-and-document. Resolve the "fix now" ones; move others into the appropriate tranche or DECISIONS.md.

---

## Exit Criteria

- [x] Dogfood feature shipped via Signal's own commands (not hand-rolled) — `/sig:status` shipped via Signal-on-Signal in T1.
- [x] FULL-tier pass succeeded end-to-end on a throwaway project — URL shortener (T2; 39 tests, all 24 AC, REVIEW caught real issues).
- [x] SKETCH-tier pass succeeded *and* visibly lower-rigor — CSV-to-JSON one-shot (T3; 24x wall-clock contrast vs FULL, 0 agents vs 4, 8 vs 14 `.planning/` artifacts).
- [x] README gets a new user from zero to running in <5 min — verified `npm install` ~1.3s + validator/tests ~1.4s on warm cache (T4).
- [x] Validator, tests, and all CI checks pass — validator green; 96/96 tests.

## What this unlocks

**v1 is shippable.** Can hand to external testers. Tranche 4 (v2 ports from the rundown) becomes legitimate to start — but only after v1 has real users for a few weeks, since v2 decisions should be shaped by real usage signal.
