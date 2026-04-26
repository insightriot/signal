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

### 3. SKETCH-tier pass — the critical validation

If calibration doesn't visibly skip phases and drop rigor in SKETCH mode, the whole value prop is broken. This is the single most important test in the build.
- [ ] Pick a throwaway (e.g., "static marketing homepage" or "one-shot script")
- [ ] Run `/sig:calibrate`, answer to produce SKETCH tier
- [ ] Verify: VERIFY and REVIEW phases skipped
- [ ] Verify: TDD off in EXECUTE
- [ ] Verify: no security audit, no nyquist mapping
- [ ] Verify: the output still ships and works — lower rigor ≠ broken output

### 4. Write README quickstart

Claim: installable in under 5 minutes.
- [ ] Install instructions (plugin registration, `npm install`, environment checks)
- [ ] First-project walkthrough (`/sig:new-project` → `/sig:calibrate` → brief explainer of each phase, with expected outputs)
- [ ] Command reference (one paragraph per command)
- [ ] Credits & Heritage section (the 9 source repos with links and roles — Tier-style like LICENSES.md)
- [ ] **`.planning/`-always-committed one-liner** (carried forward from T2 Step 5a): "`.planning/` should be committed to git — it's your project's memory, not scratch state. Don't add it to `.gitignore`."
- [ ] Time a cold install from the README on a fresh machine and verify <5 min

### 5. Triage Tranche 2 outstanding issues

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

- [ ] Dogfood feature shipped via Signal's own commands (not hand-rolled)
- [ ] FULL-tier pass succeeded end-to-end on a throwaway project
- [ ] SKETCH-tier pass succeeded *and* visibly lower-rigor — with measurable difference from the FULL pass
- [ ] README gets a new user from zero to running in <5 min
- [ ] Validator, tests, and all CI checks pass

## What this unlocks

v1 is shippable. Can hand to external testers. Tranche 4 (v2 ports from the rundown) becomes legitimate to start — but only after v1 has real users for a few weeks, since v2 decisions should be shaped by real usage signal.
