# Open Questions

Unresolved design questions. Append new ones; delete resolved ones (or move to `DECISIONS.md` if the resolution is architecturally meaningful).

---

## `{phase}-` artifact naming convention — multi-phase semantics in a single-phase v1

**Surfaced by:** Tranche 2 Step 8 paper walkthrough (2026-04-25).

PLAN/EXECUTE/VERIFY/REVIEW commands all write artifacts with a `{phase}-` prefix (e.g., `{phase}-PLAN.md`, `{phase}-RESEARCH.md`, `{phase}-VALIDATION.md`, `{phase}-PROGRESS.md`, `{phase}-VERIFICATION.md`, `{phase}-REVIEW.md`). This implies multi-phase semantics (a project has phase 1, phase 2, etc.) — inherited from GSD's pattern of multi-phase project work.

But Signal v1's framing (per `CONTEXT.md`) is "one project = one linear flow" — there isn't a "phase 1" because there isn't a "phase 2." The `{phase}-` prefix is vestigial.

Two paths:
- **Embrace multi-phase explicitly.** Tie the naming to the multi-feature project lifecycle question already in `FUTURE-IDEAS.md`. A "phase" becomes a feature increment.
- **Simplify naming for v1.** Drop the prefix — files become `PLAN.md`, `RESEARCH.md`, `VALIDATION.md`, etc.

**Resolve by:** Tranche 3 dogfood — first real run will surface whether `{phase}-` is helpful or noise.

---

## REVIEW and SHIP could read prior-phase artifacts more explicitly

**Surfaced by:** Tranche 2 Step 8 paper walkthrough (2026-04-25).

REVIEW writes `{phase}-REVIEW.md` based on the codebase but doesn't explicitly read `{phase}-VERIFICATION.md` (VERIFY's output). SHIP's pre-ship checklist mentions "Review report issues resolved" but doesn't explicitly instruct reading `{phase}-REVIEW.md`.

Currently, Claude infers what to do — usually correctly. Risk: in a long session or with context degradation, the inference might miss critical findings.

**Candidate fix:** Add explicit "Load prior-phase artifacts" steps to REVIEW (read VERIFICATION.md) and SHIP (read REVIEW.md). Mirror DISCUSS's "Load Prior Context" pattern.

**Resolve by:** Tranche 3 dogfood — observe whether implicit inference holds in real runs. If Claude misses Review findings in SHIP, the explicit-read pattern becomes a fix-now.

---

## state.js `initState` writes DISCUSS; `/sig:new-project` writes CALIBRATE

**Surfaced by:** Tranche 2 Step 8 paper walkthrough (2026-04-25); reinforced by Tranche 3 Task 1 dogfood (2026-04-26).

`tools/lib/state.js` `initState(baseDir)` initializes STATE.md with `Current Phase: DISCUSS`. But `/sig:new-project.md` Step 1 says to initialize STATE.md with `Current Phase: CALIBRATE` (because Phase 0 should run next).

If `initState` is called directly from tooling (not via the slash command), STATE.md gets the wrong initial phase. Minor — only matters when bypassing the command — but it's a discrepancy.

**Candidate fix:** Update `initState` default to `CALIBRATE`, OR accept a `phase` parameter so the caller chooses.

**Resolve by:** Trivial; can be done in any session that touches state.js.

---

## `/sig:calibrate` doesn't initialize STATE.md (init gap between Phase 0 and Phase 1)

**Surfaced by:** Tranche 3 Task 1 dogfood (2026-04-26).

`/sig:calibrate` writes `.planning/PROFILE.md` but not `.planning/STATE.md`. `/sig:discuss` Step 1 expects STATE.md to exist. On a clean post-calibrate path, STATE.md is missing — `/sig:discuss` continues gracefully (Step 1 doesn't halt), but `transitionPhase` later fails because there's no state to transition.

**Candidate fix:** add a final step to `/sig:calibrate` that calls `initState(baseDir, 'DISCUSS')` after writing PROFILE.md. Or: `/sig:discuss` Step 1 calls `initState` if STATE.md is absent. The first option is cleaner — the calibration phase produces both artifacts the workflow expects.

**Resolve by:** small fix in `/sig:calibrate.md` Step 5 or Step 6. Couples to the `initState` phase-default question above (if both fix together, can hardcode the right initial phase).

---

## Calibrate Scenario B and `checkGateArtifacts` PLAN gate require `.planning/PROJECT.md`

**Surfaced by:** Tranche 3 Task 1 dogfood (2026-04-26).

Two places assume PROJECT.md lives at `.planning/PROJECT.md`:
- `/sig:calibrate.md` Scenario B (line 26): "`.planning/PROJECT.md` exists, no `PROFILE.md`" → happy path.
- `tools/lib/state.js` `checkGateArtifacts(baseDir, 'PLAN')` (line 124): requires `PROJECT.md` to exist in `.planning/`.

But the Signal-build's own `PROJECT.md` lives at repo root (legacy from before `.planning/` was introduced). The dogfood worked around this by symlinking `.planning/PROJECT.md → ../PROJECT.md`.

**Two fix paths:**
- **Move Signal's own PROJECT.md to `.planning/PROJECT.md`** so the convention applies uniformly. Symlink at repo root for backward refs.
- **Make calibrate + checkGateArtifacts also check repo root** as a fallback. More code, but accommodates self-managed projects that drifted.

**Resolve by:** Tranche 3 Task 4 (README work) is a natural seam — moving PROJECT.md is a small refactor and the README will reference the new path anyway.

---

## `review_depth: quality-only` supersedes `security_audit` / `performance_pass` / `simplification_pass`

**Surfaced by:** Tranche 3 Task 1 dogfood (2026-04-26).

In `review.md` Section 0's override table, `review_depth: quality-only` says "Skip Steps 2 (security), 3 (performance), 4 (simplification)" — but the table also lists `security_audit`, `performance_pass`, `simplification_pass` as separate overrides with their own effects. FEATURE tier sets `review_depth: quality-only` but ALSO sets `security_audit: basic`, `performance_pass: true`, `simplification_pass: true` — which wins?

The current behavior (per the table's prose) is that `review_depth` wins: when it's `quality-only`, the other flags are ignored. That's a precedence rule that isn't explicit in the table.

**Candidate fix:** Add a one-line precedence note above the rigor table in `review.md`: *"`review_depth` is the master switch — `none` skips REVIEW entirely, `quality-only` skips Steps 2/3/4, `full` runs all four. The other rigor flags (`security_audit`, `performance_pass`, `simplification_pass`) only matter when `review_depth: full`."*

**Resolve by:** Tranche 3 triage; one-line edit.

---

## `transitionPhase` doesn't dedupe completed phases

**Surfaced by:** Tranche 3 Task 1 dogfood (2026-04-26).

If `transitionPhase` is called after `state.completedPhases` was edited by hand (or by an earlier transition that wasn't undone), it appends — producing duplicate entries (`VERIFY` listed twice, etc). Minor in the happy path; bites in recovery scenarios.

**Candidate fix:** in `state.js#transitionPhase` line 88, dedupe `completed` by phase name (keep latest timestamp): `Array.from(new Map(completed.map(p => [p.split(' ')[0], p])).values())`.

**Resolve by:** Trivial; bundled with the other state.js fix above.

---

## Tier count: validate 4 tiers against real calibration

Schema is locked at 4 tiers (SKETCH / FEATURE / SPIKE / FULL) per DECISIONS.md. The design note in `references/tier-definitions.md` explains why, but this is a judgment call that can only be validated by calibrating real projects.

Watch for:
- **Too-coarse signal:** if real projects keep landing between SKETCH and FEATURE (e.g., "this is more than SKETCH but I'm uncomfortable calling it FEATURE"), we may need a 5th tier.
- **Redundant tiers:** if SPIKE and SKETCH feel interchangeable in practice, we may consolidate.
- **Missing dimensions:** if Scope / Stakes / Novelty / Reversibility / Horizon don't capture some real project quality (e.g., team size, deadline pressure), the diagnostic questions may need to evolve.

**Resolve by:** Tranche 3 (real-project calibration runs). Likely outcome: confirmed as-is, with minor override-key tweaks.

---

## Historical docs: annotate or archive?

`GSD-AgentSkills-Combination-Analysis.md` predates the broader landscape analysis. Options:
- Add a one-line "superseded by `analysis/` docs" header at the top.
- Move to an `archive/` folder.
- Leave as-is; the Reference Repositories table now flags it as "Historical."

**Resolve by:** Low priority; decide in Tranche 3 docs work.

---

## Testing strategy for Signal itself

Currently: 3 vitest files (`state.test.js`, `context-monitor.test.js`, `profile.test.js`) — 53 tests covering tooling helpers. No tests for slash commands (they're markdown interpreted by Claude — how would you test their behavior?). No integration tests yet.

- Should slash command behavior be testable? How (simulated runs against fixture projects, golden-output diffs, prompt-replay harness)?
- Is Nyquist-compliance something Signal enforces on its own codebase, dogfood-style?

**Resolve by:** Tranche 3 dogfood. Likely outcome: a fixture-based command-execution test harness lands as part of (or after) the FULL-tier and SKETCH-tier passes.

---

## `${CLAUDE_PLUGIN_ROOT}` env var doesn't resolve in dev/dogfood runs

**Surfaced by:** Tranche 3 Task 2 FULL-tier dogfood (2026-04-26).

`/sig:new-project` Step 1 says "copy `${CLAUDE_PLUGIN_ROOT}/state/config.json`" and skill-loading directives across multiple commands reference `${CLAUDE_PLUGIN_ROOT}/skills/.../SKILL.md`. The env var is set when Signal is installed via the Claude Code plugin system, but for users running Signal-on-Signal (dogfood) or developing Signal locally, the var doesn't resolve and operators must manually substitute the literal path.

**Candidate fix:** add a fallback hint in command markdown ("if `${CLAUDE_PLUGIN_ROOT}` is unset, the plugin root is the directory containing this file's grandparent — usually a Signal install path"). Or document a one-liner for dev/dogfood: `export CLAUDE_PLUGIN_ROOT=/path/to/signal`. Cheap to fix.

**Resolve by:** TRANCHE-3 Task 5 triage; small README addendum + one-line note in command markdown.

---

## Strict Nyquist's "failed before fixed" record is structurally unmet by per-slice atomic commits

**Surfaced by:** Tranche 3 Task 2 FULL-tier dogfood (2026-04-26).

VERIFY's strict Nyquist mode in `verify.md` says: *"every test must have a documented 'failed before fixed' record."* During EXECUTE, TDD discipline is honored per slice (test → red → impl → green) — but each slice's commit bundles the test + the implementation, so git history has no per-test red→green moment.

This is not a TDD failure (the discipline was followed) — it's a *recordkeeping* failure (no audit trail).

**Two paths:**
- **Stricter EXECUTE pattern.** Require a "test-only commit that fails CI" before the implementation commit. Doubles the commit count but produces a real audit trail.
- **Runtime harness.** A test runner that records each test's first-red SHA and first-green SHA. More invasive; doesn't exist today.

**Candidate fix (lightweight):** Soften the strict-mode language in `verify.md` to say: *"strict Nyquist requires either (a) per-test red→green git evidence, or (b) explicit attestation in {phase}-VERIFICATION.md that the test was written before the implementation."* This codifies what the dogfood actually did — the spirit was preserved without the letter.

**Resolve by:** TRANCHE-3 Task 5 triage or TRANCHE-4 if the stricter (a)-path is wanted. v2 PREPARE-phase candidate could include a "TDD audit trail" sub-step.

---

## REVIEW phase needs a "PASS-WITH-FIXES" verdict (not just PASS / FAIL)

**Surfaced by:** Tranche 3 Task 2 FULL-tier dogfood (2026-04-26).

`review.md` step 5 ("Write Review Report") template offers two verdict options: PASS — ready for SHIP, or FAIL — issues must be addressed (return to EXECUTE). In the dogfood, REVIEW found 2 important issues (Content-Length pre-check missing, unhandled-error not logged). Both fixes were small (1–3 lines each). Looping back to a full EXECUTE phase ceremony for two-line fixes is theatrical; I made the fixes inline within REVIEW and documented the choice.

**Candidate fix:** add a third verdict option PASS-WITH-FIXES for cases where Important findings are addressed in REVIEW itself, with a guideline (e.g., "if total change is < 50 LOC and tests still pass, fix in-phase; otherwise loop to EXECUTE"). Keeps the EXECUTE loop available for genuine large remediations while not punishing small high-quality REVIEW findings.

**Resolve by:** TRANCHE-3 Task 5 triage; one-paragraph addition to `review.md`'s verdict template.

---

## `research_parallelism: 4` (FULL) is overkill for known domains

**Surfaced by:** Tranche 3 Task 2 FULL-tier dogfood (2026-04-26).

PLAN spawned 4 research agents per FULL tier's `research_parallelism: 4`. Total cost: ~61K agent tokens. For a URL shortener — a well-trodden, well-documented domain — three of the four agents returned overlapping observations about the same prior art. The signal-to-noise was low.

For a *novel* domain, 4 agents would each contribute unique angles. For a *known* domain, 2 (FEATURE/SPIKE level) would be sufficient.

**Candidate fix paths:**
- **Domain-novelty input** in calibration. Add a question like "is the technical approach well-known?" that influences `research_parallelism`. Adds a 6th calibration question.
- **Adaptive parallelism in PLAN.** First agent does a "domain familiarity scan"; if the domain is well-known per its own report, subsequent agents are deduped. Adds complexity to PLAN.
- **Document the trade.** Calibrate.md's table notes "FULL `research_parallelism: 4` assumes the domain has enough surface that 4 distinct angles each return non-redundant signal. For known domains, consider downward-overriding to 2."

The third option is cheapest and aligns with Signal's "transparent overrides" philosophy.

**Resolve by:** TRANCHE-3 Task 5 triage; small note in `calibrate.md`'s rigor table.

---

## DISCUSS doesn't surface tier-driven non-functional requirements

**Surfaced by:** Tranche 3 Task 2 FULL-tier dogfood (2026-04-26).

In DISCUSS, I added F6 (`/healthz`), N1d (security headers), N3a/b/c (graceful shutdown, exit codes) because I (as an experienced Claude) know FULL-tier production-shaped projects need them. A real user — especially less experienced — might not surface these.

`discuss.md` Step 6 says "If the discussion surface enough detail, generate REQUIREMENTS.md" but doesn't prompt for tier-appropriate non-functional requirements.

**Candidate fix:** add a tier-aware NFR checklist to DISCUSS. For FULL: prompt "consider adding healthcheck endpoint, graceful shutdown, structured logging, security headers, rate limiting (if exposed)." For FEATURE: lighter set. For SKETCH: skip entirely.

**Resolve by:** TRANCHE-3 Task 5 triage or TRANCHE-4. Couples to the v2 PREPARE-phase question (some of these are *prep* concerns, not *discussion* concerns).

---

## Native module / Node version friction: `better-sqlite3` prebuilts vs runtime mismatch

**Surfaced by:** Tranche 3 Task 2 FULL-tier dogfood (2026-04-26).

PLAN's research agent flagged `better-sqlite3@>=11.5` for Node 22 prebuilts. The actual dev machine ran Node 25; v11.10 has no Node-25 prebuilt and source-build failed on first `npm install`. Fix was to bump to `better-sqlite3@^12.9.0`. **Lesson:** PLAN's research-time runtime-vs-prebuilt assumption can drift between PLAN and EXECUTE.

This is one specific instance of a broader pattern: **PLAN's research happens in one environment (Claude's mental model + agent web fetches), EXECUTE happens in a real environment (the user's machine)**. Drift between them is a normal, expected friction.

**Candidate fix:** EXECUTE's first sub-step (or PLAN's tail) could include an "environment-check" that runs `npm install` (or its equivalent) and confirms research's runtime assumptions hold. Cheap; surfaces these issues at the right phase boundary.

**Resolve by:** TRANCHE-3 Task 5 triage; could add "Environment check" as Slice 0 in EXECUTE templates, OR as a tail step in PLAN ("verify your dev runtime matches your research's runtime assumptions").

---

## TRANCHE-3.md predicts SKETCH skips VERIFY; the schema only skips REVIEW

**Surfaced by:** Tranche 3 Task 3 SKETCH-tier dogfood (2026-04-26).

`TRANCHE-3.md` Task 3 line 57 says: *"Verify: VERIFY and REVIEW phases skipped"*. The actual locked schema (`references/tier-definitions.md` + `tools/lib/profile.js` + the per-tier defaults written into `/sig:calibrate`) only puts REVIEW in `phases_skipped` for SKETCH. VERIFY runs (with `nyquist_enforcement: off` and `gate_strictness: off`).

**Decision implication:** the document predates the schema lock. The schema is correct (VERIFY is a "does it work?" minimum every tier should run; only REVIEW's "is it good?" pass is genuinely optional). Fix the doc, not the schema.

**Candidate fix:** edit TRANCHE-3.md Task 3 to say "VERIFY runs with Nyquist off; REVIEW skipped." One-line change.

**Resolve by:** TRANCHE-3 Task 5 triage; trivial edit.

---

## SKETCH still writes 8 `.planning/` artifacts — is that the right floor?

**Surfaced by:** Tranche 3 Task 3 SKETCH-tier dogfood (2026-04-26).

Even at the lowest tier, SKETCH produces: PROJECT.md, PROFILE.md, STATE.md, config.json, CONTEXT.md, 1-PLAN.md, 1-VERIFICATION.md, 1-SHIP.md. Plus the source code itself.

For a genuine "I want to convert one CSV file *right now*" moment, this is more ceremony than typing `awk -F, '...'` in a terminal. SKETCH is honest documentation but isn't *zero overhead*.

**Two paths:**
- **Accept the floor.** `.planning/` is the project's memory; the artifacts at SKETCH are minimal. Anyone who wants pure-zero overhead doesn't need Signal — they `awk`. SKETCH is for "I want a small but real artifact and a record of what I decided."
- **Add a TRIVIAL tier below SKETCH.** Collapses CONTEXT.md, 1-PLAN.md, 1-VERIFICATION.md, 1-SHIP.md into a single `NOTES.md`. A 5th tier doesn't fit cleanly into the current 4-tier mental model and risks tier proliferation.

**Recommendation:** accept the SKETCH floor for v1. The contrast vs FEATURE/FULL is already strong (~10–24x); pushing lower trades documentation value for marginal ceremony savings. **Document explicitly** in `references/tier-definitions.md`: "SKETCH still produces a minimum 8-artifact `.planning/`; if you want zero overhead, you don't want Signal — you want a shell script."

**Resolve by:** TRANCHE-3 Task 5 triage; one-paragraph addition to tier-definitions.md. Couples to the older "Tier count" question.

---

## `1-PROGRESS.md` is implicit-optional for single-task plans (SKETCH default)

**Surfaced by:** Tranche 3 Task 3 SKETCH-tier dogfood (2026-04-26).

Signal's EXECUTE phase markdown (`execute.md` Step 4) instructs to write `{phase}-PROGRESS.md` after each task. For a SKETCH plan with one task, this artifact is noise (the commit message + git log are the progress log). My SKETCH run skipped it without obvious downside.

**Candidate fix:** `execute.md` could note that for plans with ≤1 task, `1-PROGRESS.md` is optional (the commit log substitutes). Or: `1-PROGRESS.md` is always-optional and the spec language ("update `1-PROGRESS.md`") becomes "update if maintaining one." Coupled to gate_strictness — at gate_strictness:off, progress tracking is informational only.

**Resolve by:** TRANCHE-3 Task 5 triage; one-line tweak to execute.md.

---
