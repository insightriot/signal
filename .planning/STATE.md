# Signal — Project State

Meta-state of the Signal build. Not to be confused with the `.planning/` that Signal's own commands will write in *user* projects once it's functional — this one is for building Signal itself.

## Current Tranche

**Tranche 4 — Brownfield Onboarding via `/sig:init` — 16 of 17 tasks shipped.** T4.1 + T4.2–T4.7 + T4.8 + T4.9–T4.12 + T4.13 + T4.14 + T4.15 + T4.16 + T4.17 shipped. **Pending: T4.18** — Vocabulary refactor (Tranche → Milestone, add Epic mid-layer; logged 2026-05-12 after investigation traced "Tranche" to a single arbitrary word-choice commit on 2026-04-22 with no principled grounding). Design notes in `TRANCHE-4.md`.

The brownfield path is feature-complete on the markdown + code layer, including the conversational assumption-surfacing walkthrough and fixture-based regression coverage for the synthesizer. v0.1.0 tag-and-publish gated on (a) T4.18 vocabulary refactor — better to never have a tagged Signal release using the finance term — and (b) one external validation: marketplace-install behavior for plugin-agent registration (F2 unknown).

Tranche 3 closed 2026-04-26. v1 + v1.5 (brownfield) feature-complete on the markdown and code layer.

## Completed

- **Tranche 4, Task 13 — Fixture-based tests for `/sig:init` flow** (2026-05-09):
  - **`tests/fixtures/init/{node,python,dormant}-project/.planning/scan/`** (12 new files) — three project fixtures with hand-authored `{stack,structure,activity,quality}.md` files modeled on the real T4.15 dogfood shape but synthetic (Node Express + GitHub-Actions-CI; Python Flask + no CI + Sphinx docs; Ruby Sinatra + Travis-legacy + dormant 9 months). Each fixture totals ~150–200 lines across the 4 scan files.
  - **`tests/init-fixtures.test.js`** (new, 21 tests) — per fixture: (a) all 4 scans load via `readAllScans`, (b) load-bearing fields extract correctly via `extractSection` + `extractField` (health, framework, CI, license, test runner), (c) one `toMatchInlineSnapshot` of the synthesized 10-field bundle (runtime / lockfile / projectAge / contributors90d / health / defaultBranch / ciPlatforms / license / testAssessment / todoCount). Plus a cross-fixture `describe` block enforcing scanner-ownership boundaries (CI never in stack; Health never in quality; Frameworks never in structure; Test Runners never in stack). Dormant fixture's `Status: dormant` + `rule 2 fired` extraction is the spec-named focus.
  - **Design choice locked.** Scanners are agent specs (markdown), not JS — so what's testable in code is the synthesis layer in `tools/lib/landscape.js`, not the scan itself. The TRANCHE-4 spec's "snapshot of the generated LANDSCAPE.md shape" reframed as snapshot of the *extracted-values bundle* — what the LANDSCAPE.md template consumes. Re-implementing scanner logic in JS to test the scanners themselves was rejected (two truths, maintenance trap).
  - **Tests 148 → 169** (+21). Validator green.

- **Tranche 4, Task 8 — Assumption-surfacing walkthrough in `/sig:init` Step 5** (2026-04-27):
  - **`tools/lib/walkthrough.js`** (new) — two helpers: `countMarkers(content)` returns `{inferred, fillIn, total}` and powers the pre-walkthrough zero-marker skip path; `appendNote(content, note)` adds a `- ` bullet to the `## Notes` section, creating the section if absent. Marker detection deliberately uses `\\[INFERRED[^\\]]+\\]` / `\\[FILL IN[^\\]]+\\]` (requires content after the keyword) so the PROJECT.md header's prose references — `Every \`[INFERRED]\` and \`[FILL IN]\` marker is your responsibility...` — don't inflate the count.
  - **`/sig:init.md` Step 5 fully replaced.** Placeholder reminder is gone; the new spec covers: (5.1) zero-marker skip with announce-N message; (5.2) locked walkthrough order (Vision → Problem → Scope-In → Constraints → Success Criteria → Done When → Scope-Out) with rationale; (5.3) 3+other shape verbatim for `[INFERRED]` markers, with confidence-driven recommendation rules (recommend Accept on high-confidence, Edit on low-confidence, Defer only when no signal); (5.4) open-ended-or-defer shape for `[FILL IN]` markers, with field-specific framing + prompt table for the four FILL-IN field types (Success Criteria, Done When, Scope-Out, Constraints-per-item); (5.5) capture rules (Accept strips marker, Edit replaces + history note, Defer leaves marker + Notes entry, Skip replaces with placeholder + Notes entry, "other" verbatim capture); (5.6) post-walkthrough summary with deferred-fields warning.
  - **Anti-rationalization table grew by 4 rows** — walk-LANDSCAPE-too (defer to scope b), skip-Defer-to-force-completeness (no — Defer is first-class), auto-accept-high-confidence (no — user is source of truth), over-detailed-questions (≤8 lines per question to prevent fatigue).
  - **22 new tests** in `tests/walkthrough.test.js`. Tests 126 → 148. Validator green.
  - **Pre-existing landscape.js fix bundled.** The `extractSection` regex used `(?m:...)` inline modifiers, which require V8 12.7+ (Node 23+) and were silently failing on Node 22.13 — 13 tests had been red on `main` post-context-clear (must have been written and tested on a newer Node). Rewrote with manual line anchors (`(?:^|\\n)##` / `(?=\\n##\\s+|$)`) and replaced `\\s*` after the heading text with `[ \\t]*` so the trailing-whitespace allowance can't gobble the heading-ending newline and pull blank lines from the next section. All 25 landscape tests + the 5 status `readLandscapeMeta` tests now pass on Node 22.

- **Tranche 4, Task 16 — Documentation: README brownfield section + tier-definitions brownfield patterns** (2026-04-26):
  - **README.md** — added "Bringing Signal to an existing codebase" section between "Your first project" (greenfield) and "`.planning/` is your project's memory." Walks through `/sig:init`'s 4 outputs (LANDSCAPE.md, baseline PROJECT.md, STATE.md, scan/*.md), the [INFERRED]/[FILL IN] marker convention, the brownfield-tier-bias hint, and the calibrate-Scenario-A auto-redirect behavior. Also added `/sig:init` to the Command reference list (between new-project and calibrate).
  - **references/tier-definitions.md** — added "Brownfield calibration patterns" section after Escalation, before Design notes. Codifies: reversibility-not-trivial + horizon-rarely-hours-or-days as the two reasons brownfield leans higher-tier, four practical patterns (5yo codebase ≠ SKETCH; FEATURE is most common landing zone; FULL on critical surfaces; SPIKE for novel-capability investigation), and a forward-looking note on codebase-novelty signal feeding calibration (deferred per design decision #5).
  - **LICENSES.md** — no changes. `/sig:init` is Signal's own design (per PROJECT.md attribution tier); no new source repos to attribute.

  Validator green; 126/126 tests still pass after doc-only changes.

- **Tranche 4, Task 15 — `/sig:init` dogfood on Signal itself** (2026-04-26): ran scanners + synthesizer on Signal-the-codebase, output to `.dogfood/T4-INIT-DOGFOOD/` (gitignored). Outputs: 4 scan files + LANDSCAPE.md + baseline PROJECT.md + RUNLOG.md with 18 numbered findings.

  **Headline outcome:** synthesis pipeline works end-to-end. Generated LANDSCAPE.md correctly identified Signal as "a Claude Code plugin in mid-shipping its first release, planning-driven (hot files concentrated in `.planning/`), 13 days old + active, single contributor." Inference labels (`[INFERRED — high/low confidence]`) applied correctly; "Open questions for the user" section produced 4 sharp, data-grounded questions (no CI / no agent registration / no v0.1.0 tag / hand-rolled `.planning/`). Baseline PROJECT.md generation forced `[FILL IN]` for forward-looking fields (Success Criteria, Done When, Scope-out) per design intent.

  **One blocker (F2):** Task tool in dev mode does NOT see Signal's `agents/scanners/*` even though the command list does. `subagent_type: stack-scanner` returns `Agent type 'stack-scanner' not found`. Available agents are harness defaults + `gsd-*` (from properly-installed gsd plugin). Decision logged in DECISIONS.md (2026-04-26 entry — "scanner-spawn fallback path locked"): init.md Step 2 now documents primary path (named subagent) + fallback path (`general-purpose` with agent definition embedded inline) with auto-detect-and-switch instruction. Three open unknowns about marketplace-install behavior flagged for pre-publish validation.

  **Four fix-now refinements applied:**
  - **F2:** init.md Step 2 documents the dev-mode + pre-marketplace fallback path.
  - **F3:** `agents/scanners/structure-scanner.md` exclude list adds `.dogfood/` + `.claude/worktrees/`.
  - **F5:** `agents/scanners/activity-scanner.md` health rule 5 (brand-new) loosened from `<20 commits + <30 days` to `<50 commits + <60 days`; rule 4 (active) gets a tiebreaker note appending "(young + active)" when project age <90 days. Signal itself was hitting rule 4 and losing the brand-new signal.
  - **F10:** `agents/scanners/structure-scanner.md` co-located test detection no longer double-counts files inside dedicated test dirs. Outputs split into "tests in dedicated directory: N" + "tests co-located with source: M" rather than a single conflated count.

  **Six findings deferred** (logged in RUNLOG.md): F1 (Step 1.4 recommendation tone — T4.8 territory), F6 (quality-scanner test-script grep doc-fix — minor), F8 (Frameworks empty-state for plugin/library projects — defer until 2nd dogfood), F9 (source-root precedence for plugin-shaped repos — defer until 2nd dogfood), F15 (T4.8 absence felt during dogfood — reinforces T4.8 priority), F16 ("established codebases" wording in handoff message — minor doc).

  **Eight positive observations** (no action — validates design): F4, F7, F11–F14, F17, F18 — see RUNLOG.md.

  **Wall clock for the full pass:** ~10 minutes (scan data ~2 min + scanner output writes ~5 min + synthesis ~3 min). Mostly token-bound, not thinking-bound. With proper agent-spawn working in parallel, expect significant reduction.

  Validator green; 126/126 tests still pass after fix-now refinements (all changes are markdown-only).

- **Tranche 4, Tasks 10 + 11 + 12 + 14 — adjacent updates make brownfield path first-class** (2026-04-26):
  - **T4.14 — validator updates.** `tools/validate-plugin.js` adds `.claude/commands/sig/init.md` to `REQUIRED_COMMANDS` (now 12 commands) and a new `REQUIRED_AGENTS` check for the 4 scanner agents. Also adds `agents/scanners` to `REQUIRED_DIRS`. The split between REQUIRED_COMMANDS (errors) and REQUIRED_DIRS (warnings) is preserved; agents land in errors because their absence breaks `/sig:init`.
  - **T4.10 — `/sig:status` brownfield awareness.** New helper `readLandscapeMeta(baseDir)` in `tools/lib/status.js` returns `{capturedOn}` (date parsed from LANDSCAPE.md "## Last Updated" section, falling back to null on missing/unparseable). 5 new helper tests + 1 read-only-contract update (LANDSCAPE.md mtime preserved across status calls). Branch A (uncalibrated) now branches on LANDSCAPE.md presence: if present, surfaces "Brownfield init complete (landscape captured {date}); not yet calibrated" with a reminder to vet [INFERRED] markers before calibrating. Branches B and C add a `Landscape: captured {date}` line; greenfield projects (no LANDSCAPE.md) are unchanged.
  - **T4.11 — `/sig:resume` brownfield awareness.** Step 2 loads LANDSCAPE.md alongside PROJECT.md. Vision-fallback rule: if PROJECT.md's Vision contains `[INFERRED]` or `[FILL IN]` markers AND LANDSCAPE.md exists, the briefing surfaces LANDSCAPE.md's "What this project is" paragraph instead, prefixed `(LANDSCAPE inference — PROJECT.md Vision not yet vetted):` so the user can see the inferred-but-unvetted summary clearly. Briefing template adds a `Landscape: captured {date} (brownfield init)` line conditional on LANDSCAPE.md presence.
  - **T4.12 — `/sig:calibrate` Scenario A redirects.** Scenario A (no `.planning/`) now uses the locked 3+other pattern: A=brownfield (run /sig:init first) / B=greenfield (run /sig:new-project first) / C=cancel (wrong directory). Recommendation auto-selects based on git-state heuristic: `.git/` + ≥1 commit + tracked source files → recommend A; else recommend B. Goes from a single ambiguous question to a directed branch — under-tiering due to user-in-wrong-flow risk significantly reduced.

  Validator green; 121/121 → 126/126 tests pass after readLandscapeMeta tests added.

- **Tranche 4, Wave 3 — `/sig:init` Steps 2–4 + Step 6 (T4.6 + T4.7 + T4.9)** (2026-04-26):
  - **`tools/lib/landscape.js`** — 3 helpers (`readScan`, `readAllScans`, `extractSection`, `extractField`). `extractSection` uses an inline `(?m:...)` regex group to anchor h2 heading matches per-line while letting the closing-lookahead `$` mean end-of-input (JavaScript regex doesn't support `\Z`). `extractField` normalizes markdown emphasis (`**X**` → `X`) before matching to handle the common `- **Label:** value` shape without brittle multi-variant regex. 25 new tests; total 96 → 121.
  - **`/sig:init.md` Step 2 (Codebase scan)** — declarative "spawn all 4 scanner agents in parallel via the Task tool" with a per-scanner `subagent_type` table and a uniform agent prompt. Locked design decision: scanner count fixed at 4 (rationale in DECISIONS.md 2026-04-26 entry — calibration happens *after* the scan, so tier-aware reduction is structurally moot). Failure mode: continue on scanner failure; the synthesizer marks the corresponding LANDSCAPE.md section `(scan output unavailable)`.
  - **`/sig:init.md` Step 3 (Write LANDSCAPE.md)** — full template with 7 sections: 1 narrative ("What this project is" — synthesized from cross-source signals), 5 mechanical (Tech stack / Project structure / Activity signals / Test surface / Open work signals — extracted via `extractSection` + `extractField`), 1 narrative ("Inferred goals & uncertainties" — confidence-marker labels mandatory, `[INFERRED — high/low confidence]` or `[FILL IN]`). Synthesis rules: don't aggregate weak signals into strong claims; embed scanner data, don't paraphrase.
  - **`/sig:init.md` Step 4 (Generate baseline PROJECT.md)** — full template in Signal's standard shape (Vision / Problem / Success Criteria / Scope-in/out / Constraints / Done When / Notes). Generation rules codified per field: Vision + Problem may be `[INFERRED]` from LANDSCAPE; Success Criteria + Done When + Scope-out are *always* `[FILL IN]` (forward-looking; no scan can produce them); Constraints mix inferred (manifest-derived) and `[FILL IN]` (compliance, partner SLAs).
  - **`/sig:init.md` Step 6 (STATE.md + handoff)** — `initState(baseDir, 'CALIBRATE')` + handoff message that surfaces project age + brownfield-tier-bias hint to the user (older codebases tend toward higher tiers due to reversibility cost).
  - **Step 5 (assumption surfacing) remains T4.8.** A manual reminder text is emitted in its place ("review LANDSCAPE.md and PROJECT.md before /sig:calibrate"). Functional command without it; T4.8 is the conversational-UX upgrade.
  - Gate checklist rewritten: removed per-task tags now that everything is in place except T4.8.
  - Validator gating still deferred to T4.14 — adding init.md to REQUIRED_COMMANDS is bundled with adding scanner agents to a new REQUIRED_AGENTS list (current validator has no agent-file checks).

- **Tranche 4, Tasks 2–5 — 4 parallel scanner agents** (2026-04-26): wrote `agents/scanners/{stack,structure,activity,quality}-scanner.md`. Each is read-only, single-purpose, fact-only (no synthesis — T4.6's job), and writes to `.planning/scan/{name}.md` for the synthesizer to consume. Output formats are pinned-section-shape so T4.6 can mechanically combine them; missing sections are explicit `(none detected)` rather than omitted.

  Sibling-scanner overlap was the design challenge — resolved by assigning ownership: stack owns languages + frameworks + Dockerfile + lockfiles; structure owns directory shapes + monorepo detection + test-dir presence + doc-dir presence; activity owns git-history signals (lifetime, cadence, contributors, hot files, commit conventions, branch state, health classification); quality owns test-runner config + CI workflows + lint/format tooling + README/CHANGELOG state + TODO/FIXME debt + license. Each agent's Constraints section explicitly disclaims what's *not* its territory to prevent duplicate reporting in LANDSCAPE.md.

  All 4 scanners share the same defensive posture: read-only, no `npm install`/`pip install`/`cargo build`, 30s per-command timeout, "report no data" failure mode, no PROFILE.md awareness (runs before calibration). Stack scanner skips minified/vendored files (`node_modules/`, `vendor/`, `dist/`, `build/`, `.next/`, `target/`, `__pycache__/`, etc.) via `git ls-files`; the others inherit the same exclusions. Activity scanner explicitly omits author emails (privacy + LANDSCAPE.md is a project artifact).

  Health classification rules (activity scanner) are 5-tier rule-based, first-match-wins: archived > 18mo / dormant 6-18mo / maintenance-mode <6mo + low cadence + 1 contributor / active <6mo + high cadence or multi-contributor / brand-new <30 days + <20 commits.

  Validator updates **deferred to T4.14** for the same reason as init.md: skeleton ≠ functional. Tests 96/96 still pass; validator green. Auto-discovery by Claude Code untested at this commit (all 4 are sub-agents called from `/sig:init` at T4.6 time, not standalone slash commands — Claude Code's agent registration confirms availability via the `Task` tool's `subagent_type` parameter at runtime).

- **Tranche 4, Task 1 — `/sig:init` skeleton + pre-flight + state machine** (2026-04-26): wrote `.claude/commands/sig/init.md` — auto-discovered by Claude Code as `sig:init`. Pre-flight implements 5 detected-state branches per the TRANCHE-4 spec, plus the entry-point `.gitignore` check pattern shared with `/sig:new-project` and `/sig:calibrate`:
  - **1.1 Already-Signalized** (PROFILE.md exists + validates) → halt + redirect to `/sig:resume`/`/sig:status`/`/sig:escalate`/`/sig:calibrate --re-calibrate`. Also handles malformed-PROFILE.md case (refuses to overwrite — explicit `--re-calibrate` required).
  - **1.2 No `.git/`** (worktree-aware: directory or `.git`-file pointer) → halt; refuses to auto-run `git init` to preserve user's git ceremony.
  - **1.3 Genuinely empty** (no commits via `git rev-list --count HEAD`, no tracked files via `git ls-files`, no obvious source files) → halt + redirect to `/sig:new-project`. README + LICENSE alone don't constitute a codebase.
  - **1.4 Ambiguous `.planning/`** (directory exists but no PROFILE.md) → 3+other question per `references/question-patterns.md` (continue / start-over / cancel; recommend cancel because partial state is rare-but-load-bearing). Destructive "start over" requires explicit user confirmation even after option B is picked.
  - **1.5 Happy path** (brownfield codebase, no `.planning/`) → proceed to Step 1b.
  - **Step 1b** — `.gitignore` check (mirrors new-project + calibrate exactly).

  Steps 2–6 are scaffolded with `[T4.X — not yet implemented]` markers pointing to the downstream wave that fills them in (T4.2–T4.5 scanners, T4.6 LANDSCAPE.md writer, T4.7 baseline PROJECT.md generator, T4.8 assumption surfacing, T4.9 STATE.md init + handoff). Anti-rationalization table seeded with 5 brownfield-specific temptations (auto-init git, auto-merge ambiguous `.planning/`, skip pre-flight, skip gitignore check, scan empty repo). Gate checklist tagged per-wave so future tasks know which boxes they own.

  Validator updates **deferred to T4.14** per the TRANCHE-4 spec — adding init.md to `REQUIRED_COMMANDS` before it's functional would make a partial skeleton the new "required minimum," violating Signal's invariant that required = functional. Tests 96/96 still pass; validator green.



- **Pre-Tranche — Attribution cleanup** (2026-04-22): rewrote `PROJECT.md`, `CLAUDE.md`, `LICENSES.md`, `plugin.json`, `marketplace.json`, `package.json` to acknowledge all 9 source repos with Ported / Planned / Pattern-source / Reference tiers. Committed.
- **Pre-Tranche — `.planning/` scaffold** (2026-04-22): created this directory; un-ignored `.planning/` in `.gitignore`. Committed.
- **Tranche 1, Step 1 — Manifest rebrand** (2026-04-22): `name` fields changed to `signal` in 4 places. Repo URLs deferred (initially), then resolved in end-of-session work: GitHub repo renamed `dev-skills-gsd` → `signal`, local remote + all manifest URLs updated. Committed.
- **Tranche 1, Step 2 — Plugin manifest parts** (2026-04-22): resolved as no-op. Claude Code auto-discovers agents/, skills/, hooks/. References/ is ad-hoc. Committed.
- **Tranche 1, Step 3 — npm install + tests + validator** (2026-04-22): 135 packages, 19 tests passing, validator green. Committed (via `tools/validate-plugin.js`).
- **Tranche 1, Step 4 — Scope formalization** (2026-04-22): added "Scope & Roadmap" section to PROJECT.md; CLAUDE.md forward-looking note updated. Committed.
- **Tranche 1, Step 5 — PROFILE.md schema + tier definitions** (2026-04-22): wrote `references/profile-schema.md` and `references/tier-definitions.md`. Schema locked in DECISIONS.md. Committed (`0c5ead6`).
- **Tranche 2, Step 1 — `/sig:calibrate` complete** (2026-04-22 → 2026-04-24): wrote `.claude/commands/sig/calibrate.md` — pre-flight detects 3 scenarios (new project / first calibration / existing PROFILE.md with 4 sub-paths), 5 diagnostic questions with strict enum parsing, tier derivation (FULL / SPIKE / SKETCH / FEATURE), PROFILE.md writer with all 10 rigor_overrides inlined per tier, up/down override handling (downward = warn, upward = brief-confirm with cost implications), `escalation_history` preserved on `--re-calibrate`, anti-rationalization table, gate checklist. Auto-discovered by Claude Code. 19/19 tests pass; validator green. Self-test traced against all 5 scenarios in TRANCHE-2 Step 1.

  Surrounding design decisions logged: `FUTURE-IDEAS.md` (new — calibration granularity options A/B/C with C as the lean; multi-feature project lifecycle), `TRANCHE-3.md` (promoted `/sig:status` + `/sig:resume` to committed Task 1), `OPEN-QUESTIONS.md` (logged Socratic question-pattern codification, resolve before T2 Step 3).

- **Tranche 2, Step 2 — `/sig:escalate` complete** (2026-04-24): wrote `.claude/commands/sig/escalate.md` — pre-flight requires existing PROFILE.md, re-asks 5 questions with prior answers as defaults, derives new tier with same rules, three-case comparison (same/escalation-up/de-escalation), backfill warnings table (5 rows including Nyquist permanent-gap row), appends to `escalation_history` (preserves `created_at` and `created_by`), markdown body section per escalation. **All 9 sig commands now exist on disk.** Tests 19/19, validator green, auto-discovered.

  Architectural insight surfaced: **strict Nyquist is a one-way ratchet — only forward work can achieve it; pre-escalation commits hold permanent quality gaps that no command can recover.** Documented in `references/tier-definitions.md` (new "Recoverable vs. permanent backfills" subsection) and surfaced in `escalate.md`'s Nyquist backfill warning. Reinforces why `/sig:calibrate`'s 5 questions matter — under-tiering creates irrecoverable cost, not just deferrable work.

- **Tranche 2, Step 4 — state.js + profile helpers** (2026-04-24): added `CALIBRATE` to `PHASES` in `tools/lib/state.js`. New `tools/lib/profile.js` exports `readProfile(baseDir)` (parses + strict-validates `.planning/PROFILE.md` frontmatter against the schema in `references/profile-schema.md`; throws `ProfileSchemaError` on any violation), `isPhaseEnabled(profile, phaseName)` (CALIBRATE always true, otherwise checks `phases_skipped`), and `applyRigorOverrides(config, profile)` (returns a new merged config with `rigor_overrides` attached + obvious legacy-key correspondences for `workflow.*`, `gates.*`, `parallelization.max_concurrent_agents`; non-mutating). Added `yaml@^2.8.3` as a runtime dependency (real parser since `escalation_history` carries nested arrays of objects with quoted strings). 28 new tests in `tests/profile.test.js`. Total 47/47 passing, validator green.

- **Tranche 2, Steps 5 + 5a — naming drift, validator updates, .planning/-always-tracked enforcement** (2026-04-25):
  - **Orphan-skill audit & bindings.** 4 orphan skills bound to phases (interim, pending v2 PREPARE-phase decision): `api-and-interface-design` → `plan`; `deprecation-and-migration` → `plan` + `ship`; `frontend-ui-engineering` → `execute`; `source-driven-development` → `execute`. PLAN goes 1 → 3 skills, EXECUTE 3 → 5, SHIP 4 → 5. The 5th unbound skill `using-agent-skills` is meta — correctly not phase-bound.
  - **PREPARE phase candidate logged.** During the audit, an ODI (Outcome-Driven Innovation) Universal Job Map parallel surfaced — Signal collapses ODI's *Locate* (research) and *Prepare* (set up scaffolding, fetch docs, verify framework patterns) into PLAN's tail. Two of the four orphans (especially `source-driven-development`, partially `api-and-interface-design`) are *prep* skills with no clean home in v1's phase decomposition. Added a long-form entry to `FUTURE-IDEAS.md` proposing a v2 PREPARE phase between PLAN and EXECUTE, with three concrete promotion triggers (token-budget signal in PLAN, repeated user-language friction at the seam, two+ new skills landing homeless). v1 stays at 6 phases.
  - **Naming reconciliation.** `references/testing-patterns.md` → `references/testing-checklist.md` (matches family naming: security-checklist, performance-checklist, accessibility-checklist). Updated all references (LICENSES.md, test-driven-development SKILL.md). Used `git mv` to preserve history.
  - **Validator updates.** `validate-plugin.js` now requires `calibrate.md` + `escalate.md` (REQUIRED_COMMANDS) and `profile-schema.md` + `tier-definitions.md` (REQUIRED_FILES).
  - **.planning/-always-tracked.** Added `Step 0 — .gitignore check` to `/sig:new-project.md` (mirrors the existing pattern in `/sig:calibrate.md` Step 1b). README one-liner deferred to TRANCHE-3 Task 4 (where the README itself will be written) — explicit checkbox added there.
  - **OPEN-QUESTIONS cleanup.** Removed the resolved orphan-skill question. Decision logged in `DECISIONS.md` (2026-04-25 entry).
  - 47/47 tests still passing, validator green.

- **Tranche 2, Step 3 — preamble pass + question-pattern convention** (2026-04-25):
  - **Question-pattern convention locked.** Wrote `references/question-patterns.md` codifying three shapes: strict enum (calibrate's 5 questions; correctness constraint), 3-options-plus-other (default for tradeoff questions), open-ended (rare; for genuine clarification at workflow openings). Strictness convention: **strongly recommended with explicit justification for exceptions**. Strict enums mandatory where schema requires; 3+other default for tradeoffs; open-ended is the rare case. Decision logged in DECISIONS.md (2026-04-25 entry); Socratic OPEN-QUESTION resolved and removed.
  - **Preamble + rigor table added to all 6 phase commands.** Each command now opens with "0. Tier-gating preamble" that (a) reads PROFILE.md (halts if missing), (b) exits if phase is in `phases_skipped` (with next-step message), (c) applies phase-specific `rigor_overrides`. Each command has a customized rigor table mapping the relevant overrides — DISCUSS (gate_strictness), PLAN (research_parallelism, plan_validation_dims, nyquist_enforcement, gate_strictness), EXECUTE (tdd_required, context_rot_reread, gate_strictness), VERIFY (nyquist_enforcement with permanent-gap warning, gate_strictness), REVIEW (review_depth, security_audit, performance_pass, simplification_pass, gate_strictness — most overrides), SHIP (gate_strictness).
  - **Question-pattern retrofits.** DISCUSS Step 4 made explicit: exactly 3 named options + recommendation + "other" with verbatim capture into CONTEXT.md. VERIFY's "Loop Back" retrofitted from prescriptive ("return to EXECUTE") to 3+other (loop-back / escalate-tier / accept-failure-with-documented-limit) with recommendation per loop-count.
  - **Skill loading updated.** PLAN now loads api-and-interface-design + deprecation-and-migration. EXECUTE adds source-driven-development + frontend-ui-engineering (with conditional-loading note pointing to FUTURE-IDEAS.md). SHIP adds deprecation-and-migration. Reflects the Step 5 binding decisions.
  - 47/47 tests still passing; validator green.

- **Tranche 2, Step 7 — phase token-cost measurement** (2026-04-25): wrote `tools/measure-phase-costs.js`. All 6 phases within budget; largest is EXECUTE at 12,761 tokens (6.4% of 200K). REVIEW at 5.2% — original "highest risk" framing was overcautious. PLAN at 3.3% with 3 skills — PREPARE-phase token-budget trigger NOT firing (FUTURE-IDEAS updated). Loader bug surfaced and fixed: `findSkillPath` searches all skill phase directories so cross-bound skills load correctly. 6 new tests; 53/53 passing.

- **Tranche 2, Step 6 — agent count reconciliation** (2026-04-25): audit found 22 agents on disk (the OPEN-QUESTIONS "17" count was stale). PROJECT.md claimed 24 but contained two errors — Security Auditor double-counted (in both 3.3 GSD verification and 3.4 Agent Skills specialists), plus Doc Writer + Doc Verifier never written. Decision: revise spec to 22 (drop the docs agents — already covered by `documentation-and-adrs` SHIP-phase skill; same skill-not-agent pattern compound-engineering uses). PROJECT.md sections 3.0/3.3/3.5/Gate 2 updated; CLAUDE.md updated.

- **Tranche 2, Step 8 — paper walkthrough** (2026-04-25): structural smoke test (real execution deferred to TRANCHE-3 Tasks 2+3 where fresh-project setup, real time/token measurement, and full execution time naturally live). Findings: PLAN's skill-loading paths were wrong for cross-bound skills (fixed inline); references all resolve; skill-binding consistency holds; 3 friction points logged to OPEN-QUESTIONS for TRANCHE-3: `{phase}-` artifact naming convention, REVIEW/SHIP not explicitly reading prior-phase artifacts, state.js initState phase-name mismatch.

- **Tranche 3, Task 5 — OPEN-QUESTIONS triage** (2026-04-26): triaged 20 active items into buckets — 14 fix-nows applied, 4 marked resolved, 1 deferred to T4, 1 confirmed-no-change with current data.

  **Fix-nows applied:**
  - **`tools/lib/state.js`:** `initState` default phase changed from `DISCUSS` to `CALIBRATE`; now accepts explicit `initialPhase` param. `transitionPhase` dedupes `completedPhases` by phase name (recovery scenarios). Tests updated; 93 → 96.
  - **`/sig:calibrate`:** added Step 5b (initialize STATE.md after PROFILE.md write); footnote on `research_parallelism` row noting FULL's `4` is calibrated for novel domains, not known ones.
  - **`/sig:review`:** precedence note above rigor table (`review_depth` master switch); added PASS-WITH-FIXES verdict to the report template with explicit guidance.
  - **`/sig:verify`:** softened strict-Nyquist language to accept either per-test red→green git evidence OR explicit attestation in VERIFICATION.md.
  - **`/sig:plan`:** new Step 6 "Environment check" — confirms dev runtime matches research's assumed runtime before EXECUTE.
  - **`/sig:execute`:** `1-PROGRESS.md` marked implicit-optional for single-task plans.
  - **`/sig:discuss`:** tier-aware NFR prompt added (FULL gets 5 ops items, FEATURE gets 3, SPIKE/SKETCH skip).
  - **`references/tier-definitions.md`:** SKETCH 8-artifact floor codified (no TRIVIAL tier in v1).
  - **`README.md`:** `${CLAUDE_PLUGIN_ROOT}` dev-mode hint added.
  - **`GSD-AgentSkills-Combination-Analysis.md`:** prefixed with "Historical document" annotation pointing readers to current `analysis/` docs.

  **Resolved (struck from OPEN-QUESTIONS):** PROJECT.md location (T4 move); numeric `{phase}-` prefix (DECISIONS lock); TRANCHE-3.md schema-drift (corrected during T3 Task 3 wrap-up); REVIEW/SHIP read-prior-artifacts (didn't bite in dogfood).

  **Deferred to TRANCHE-4:** slash-command testing harness — non-trivial; current 96-test tooling coverage + dogfood passes provide enough signal for v1.

  **Confirmed no-change with data:** 4-tier count — two dogfood data points didn't surface drift; revisit on real-user calibration data.

  **Architecturally meaningful triage outcomes** logged as a single DECISIONS entry (2026-04-26 — "T3 Task 5 triage: workflow refinements from dogfood evidence"). Five small refinements: PASS-WITH-FIXES verdict, two-form Nyquist evidence, PLAN environment-check, DISCUSS tier-aware NFR prompt, SKETCH-floor codified.

  Validator green; 96/96 tests still pass. **OPEN-QUESTIONS.md goes from 20 active items to 2** (tier-count + testing-harness, both with deferred resolution paths).

- **Tranche 3, Task 4 — README quickstart + move PROJECT.md to `.planning/`** (2026-04-26): wrote a comprehensive `README.md` covering value-prop (with the SKETCH-vs-FULL contrast table from T3 Task 3), install instructions (plugin marketplace + from-source), first-project walkthrough (`/sig:new-project` + `/sig:calibrate` + the 5 questions), command reference (one paragraph per command), the `.planning/`-always-committed one-liner (load-bearing — explains why), and Credits & Heritage tiered like LICENSES.md (4 tiers, all 9 source repos linked).

  **Sub-action: moved Signal's own `PROJECT.md` from repo root to `.planning/PROJECT.md`** via `git mv` (history preserved). Updated CLAUDE.md's three references + refreshed CLAUDE.md "Current State" section (it claimed "no source code yet" — wildly stale). No symlink at repo root: the move commits to the convention.

  **Resolves OPEN-QUESTIONS friction "Calibrate Scenario B and `checkGateArtifacts` PLAN gate require `.planning/PROJECT.md`"** (logged in T1 dogfood). `checkGateArtifacts(".", "PLAN")` now correctly finds PROJECT.md.

  **Cold-install timing on this machine:** `npm install` ~1.3s (warm npm cache); validator + 93 tests ~1.4s. Well under the 5-minute claim. (Doesn't include `git clone` — but Signal repo excluding `node_modules` is a few MB, and `npm install` has only one runtime dep, `yaml`.)

  Validator green; 93/93 tests still pass after the move.

- **Tranche 3, Task 3 — SKETCH-tier dogfood on a CSV-to-JSON one-shot script** (2026-04-26): the critical "does calibration actually drop rigor?" validation. Single Claude session ran the SKETCH-tier flow (calibrate → discuss → plan → execute → verify → ship; REVIEW skipped per `phases_skipped: [REVIEW]`) on a 30-LOC Node.js one-shot in `.dogfood/csv-to-json-sketch/`. SKETCH-shaped answers: scope=throwaway, stakes=none, novelty=familiar, reversibility=trivial, horizon=hours → rule 3 fired.

  **Throwaway shipped:** 2 commits, 1 source file (`csv-to-json.js`, ~30 LOC), 0 automated tests (TDD off in SKETCH), manual smoke covered happy path + 2 error paths. 8 `.planning/` artifacts (PROJECT, PROFILE, STATE, config.json, CONTEXT, 1-PLAN, 1-VERIFICATION, 1-SHIP — no RESEARCH/VALIDATION/PROGRESS/REVIEW/REQUIREMENTS).

  **Contrast vs FULL (URL shortener):** wall clock ~5 min vs ~2 hours (~24x), research agents 0 vs 4, source files 1 vs 8, source LOC ~30 vs ~600 (~20x), automated tests 0 vs 39, commits 2 vs 13, `.planning/` artifacts 8 vs 14 (~57%). **Calibration delivers measurable, visible rigor reduction. Value prop validated.**

  **Run log:** `.dogfood/T3-TASK3-RUNLOG.md` (gitignored).

  **3 new findings appended to OPEN-QUESTIONS.md (2026-04-26):**
    1. TRANCHE-3.md predicted SKETCH skips VERIFY; schema only skips REVIEW. Doc/schema drift; trivial fix.
    2. SKETCH still writes 8 `.planning/` artifacts — is that the right floor? Recommendation: accept floor; document explicitly.
    3. `1-PROGRESS.md` is implicit-optional for single-task plans (SKETCH default).

  All 3 are doc-level / one-line fixes for Task 5 triage.

  **High-confidence outcomes:**
  - The contrast between SKETCH and FULL is real and large.
  - Phase-skipping (REVIEW) works cleanly via `phases_skipped`.
  - In-phase skipped *steps* (research, plan-validation, Nyquist) work cleanly via individual rigor_overrides.
  - Auto-advance gates (`gate_strictness: off`) work cleanly — no confirmation prompts firing inappropriately.
  - The one-shot script actually runs and produces correct JSON.

- **Tranche 3, Task 2 — FULL-tier dogfood on a throwaway URL shortener** (2026-04-26): first end-to-end pass of Signal on a *non-Signal* target. Single Claude session ran the full 6-phase flow (`new-project → calibrate → discuss → plan → execute → verify → review → ship`) on a Node.js URL shortener service in `.dogfood/url-shortener-fulltier/` (gitignored from Signal). Synthesized FULL-shaped calibration answers (scope=product, stakes=major, novelty=familiar, reversibility=irreversible, horizon=years → rule 1 fired on irreversibility + years).

  **Throwaway shipped:** 13 commits on its own main branch, 8 production source files in `src/`, 8 test files (39 tests, ~0.5s suite), README + CHANGELOG + .env.example. All 24 acceptance criteria satisfied (18 automated, 6 manual-acknowledged). Live curl smoke confirmed all routes work end-to-end with proper status codes, security headers, graceful SIGTERM. `1-RESEARCH.md` (4-agent synthesis), `1-PLAN.md` (8 vertical slices), `1-VALIDATION.md` (8-dim + Nyquist), `1-PROGRESS.md`, `1-VERIFICATION.md`, `1-REVIEW.md` (2 Important issues fixed in-phase, 2 Suggestions applied), `1-SHIP.md` all generated cleanly.

  **Run log:** `.dogfood/T3-TASK2-RUNLOG.md` captures phase-by-phase observations (gitignored).

  **6 new findings appended to OPEN-QUESTIONS.md (2026-04-26):**
    1. `${CLAUDE_PLUGIN_ROOT}` env var doesn't resolve in dev/dogfood runs.
    2. Strict Nyquist's "failed before fixed" record is structurally unmet by per-slice atomic commits.
    3. REVIEW phase needs a "PASS-WITH-FIXES" verdict for small in-phase fixes.
    4. `research_parallelism: 4` (FULL) is overkill for known domains.
    5. DISCUSS doesn't surface tier-driven non-functional requirements.
    6. Native module / Node version friction (`better-sqlite3` prebuilts vs runtime mismatch in EXECUTE).

  All 6 are small/triage-able; none gate ship of v1. Three (REVIEW PASS-WITH-FIXES, NFR checklist in DISCUSS, env-check at PLAN/EXECUTE seam) are real Signal-flow improvements; three are documentation-style fixes.

  **High-confidence outcomes from this dogfood:**
  - Signal's full FULL-tier flow works end-to-end on a real (small) production-shaped project.
  - Phase artifacts are load-bearing across phases; the chain DISCUSS → PLAN → EXECUTE → VERIFY → REVIEW → SHIP holds together.
  - Numeric `{phase}-` prefix (`1-PLAN.md` etc.) per DECISIONS.md (2026-04-26) worked cleanly.
  - REVIEW caught real issues VERIFY would not have surfaced — high signal-to-noise; tier-appropriate.
  - Wall clock for one Claude session: roughly 2 hours focused.

- **Tranche 3, Task 1 — `/sig:status` (dogfooded) + `/sig:resume` (hand-rolled)** (2026-04-26): first Signal-on-Signal dogfood pass. Worktree `worktree-dogfood-status` ran the full 6-phase flow on building `/sig:status`. Substantive work cherry-picked to main:
  - `.claude/commands/sig/status.md` — 3-branch (uncalibrated / unbegun / in-flight) read-only inspection with tier-aware next-action recommendation.
  - `.claude/commands/sig/resume.md` — re-orientation briefing that loads PROJECT/CONTEXT + the current phase's artifact and ends with "Ready to continue with /sig:{phase}?" prompt; tolerant to `{phase}-` naming variants.
  - `tools/lib/status.js` — `nextActionForPhase`, `reachedDoneViaSkip`, `extractTopOpenQuestions`, `countOpenQuestions`, `readOpenQuestions`, `formatEscalationSummary`.
  - `tests/status.test.js` — 40 new tests (helpers + 3 branch fixtures + read-only mtime check + static contract checks). 53 → 93 tests.
  - `tools/validate-plugin.js` — adds `status.md` and `resume.md` to REQUIRED_COMMANDS.
  - `PROJECT.md` — adds WBS sections 2.10 and 2.11.
  - `.gitignore` — ignores `.claude/worktrees/`.

  Five dogfood-friction findings appended to `OPEN-QUESTIONS.md` (Scenario B's `.planning/PROJECT.md` check vs. Signal's repo-root PROJECT.md; calibrate doesn't init STATE.md; PLAN gate `checkGateArtifacts` likewise; `review_depth: quality-only` precedence; `transitionPhase` doesn't dedupe). Two `DECISIONS.md` entries: dogfood worktree+cherry-pick protocol, `{phase}-` numeric prefix locked.

## Active

**Tranche 4 closed on the markdown + code layer.** All 16 task slots shipped (T4.1 + Waves 2 + 3 + adjacent updates + T4.13 fixtures + T4.15 dogfood + T4.16 docs + T4.8 walkthrough + T4.17 AskUserQuestion wiring). Synthesis pipeline validated end-to-end on Signal-on-Signal; brownfield path documented in README + tier-definitions; F2 blocker has a documented fallback path; synthesizer regression coverage is now in place via three project fixtures.

**Pending dogfood validation of T4.8.** The walkthrough is implemented + unit-tested but hasn't been exercised against a real PROJECT.md draft. Recommended next pass: re-run `/sig:init` on a fresh worktree and walk all 7 fields to confirm the conversational layer is non-fatiguing in practice (the Wave 4 design's success criterion #8). Bundle this dogfood with marketplace validation when that publish-then-test cycle happens.

**Open items, in priority order:**
1. **Marketplace-install validation** (pre-publish blocker for F2): publish a test build of Signal, install via marketplace, verify whether named subagents resolve and what prefix (if any) Claude Code applies. Update init.md Step 2 table accordingly. **The single remaining external blocker between current state and shipping v0.1.0.** Not a TRANCHE-4 task (needs publish-then-test cycle).
2. **T4.8 conversational dogfood** — exercise the walkthrough against a real brownfield run; surface fatigue / phrasing issues. Can ride the next `/sig:init` dogfood pass alongside marketplace validation.

**Five TRANCHE-4 design decisions resolved (all logged):**
- Scanner count → fixed at 4.
- Scanner agents vs embedded logic → agents.
- LANDSCAPE.md vs multi-file → single LANDSCAPE.md (scan files in `.planning/scan/` as the multi-file layer).
- Write PROJECT.md or just LANDSCAPE.md → both, with per-field `[INFERRED]` / `[FILL IN]` markers.
- Codebase-novelty feeding calibration → light-touch heuristic in `/sig:calibrate` Scenario A; deeper integration documented as forward-looking in tier-definitions.md.

**One open unknown:** plugin agent registration mechanism post-marketplace-install + namespacing convention. Has documented fallback path; resolution gates v0.1.0 marketplace publish.

## Blockers

None.

## Last Updated

2026-05-09 (T4.13 shipped: fixture-based regression tests for `/sig:init` synthesizer — 3 fixtures × 4 scan files + `tests/init-fixtures.test.js` with 21 tests including the spec-named dormant-health assertion + cross-fixture scanner-ownership discipline. Tests 148 → 169. Tranche 4 closed on markdown + code layer; v0.1.0 ship gated only on marketplace-install validation for F2.)
