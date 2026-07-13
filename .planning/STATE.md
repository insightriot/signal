---
schema_version: 1
phase: SHIP
current_epic: M4.5.E10
current_wave: S1
current_tasks: []
completed_phases:
  - DISCUSS (2026-07-04)
  - PLAN (2026-07-05)
  - EXECUTE (2026-07-05)
  - VERIFY (2026-07-05)
  - REVIEW (2026-07-05)
blockers: []
last_completed_task:
  id: M4.5.E10.S5.t3
  status: done
  commit: dfc4bf7
  completedAt: 2026-07-05T16:24:45.218Z
last_decision_at: 2026-07-05T16:24:45.218Z
last_updated_commit: 5feb5ea0f0065eaed6facbe43556269b3b19ef39
last_updated: 2026-07-05T20:57:49.649Z
---
<!-- Original STATE.md content preserved verbatim from pre-schema_v1 migration on 2026-05-18. The YAML frontmatter above is the authoritative machine-readable state; everything below is human-readable history. -->

# Signal — Project State

Meta-state of the Signal build. Not to be confused with the `.planning/` that Signal's own commands will write in *user* projects once it's functional — this one is for building Signal itself.

---

## ⚡ POST-CONTEXT-CLEAR RE-ENTRY PROTOCOL (read this first)

**The YAML frontmatter at the top of this file is the authoritative machine state.** This prose section is the human companion, refreshed by hand at phase/Epic boundaries. (Since M4.5.E6 shipped, `/sig:resume` reads the frontmatter directly — this README-style protocol is now a convenience, not the load-bearing recovery path it was before E6.)

**If you (Claude or Brett) are reading this after a context clear:**

1. **Where we are (2026-06-01):** **M4.5.E2 (`/sig:add`) shipped and v0.1.3 is cut.** The full 5-slice Epic closed (capture hot path + `--question`/`--milestone`/`--file` flags + naked-invocation interview + stranger-safety hardening + the `/sig:plan` advisory FUTURE-IDEAS drain), and E7+E3+E9+E8+E2 were bundled into the **v0.1.3 release** (tag `v0.1.3`, pushed; `marketplace.json` pinned to the release commit). Frontmatter says `phase: SHIP`, `current_epic: M4.5.E2`, DISCUSS→SHIP all complete. No Epic is currently in flight.

2. **What's next:** **M4.5.E4 closed (lightweight) 2026-06-03 — `examples/url-shortener/` + `docs/vs.md` shipped to `main`, `[Unreleased]`.** The active Epic is now **E5 — external validation + launch** (the last M4.5 Epic; E1–E4 all landed). E5 is the release trigger (E4's CHANGELOG block ships then). Also open: **E1 Slices 3–5** (Linux/WSL install matrix + versioning-policy doc + validator hardening), shelved pending volunteer testers (D-E3-12).

3. **What to read in order:** `.planning/CONTEXT.md` → this file's frontmatter → `.planning/MILESTONE-4.5.md` (Epic roadmap) → the target Epic's `M4.5.E{N}-*.md` artifacts. Locked decisions are in `.planning/DECISIONS.md`; per-Epic retrospectives are indexed in `.planning/RETROSPECTIVES.md`.

4. **Working norms (load-bearing):** per-task atomic commits with the `M4.5.E{N}.S{M}.t{K}` naming convention; FULL tier (`gate_strictness: strict`) means explicit user approval at each wave/phase boundary; no new runtime dependencies; commit **and** push (push is the default, not a separate ask).

---

## Current Phase

**M4.5.E10 (Resume trust & capture integrity) — SHIPPED as v0.1.5 (2026-07-05); full DISCUSS→SHIP complete.** New Epic promoted from the 2026-07-04 backlog review (BR-7); trust-hardening batch shipped before external testers onboard. Six items → **5 slices** (high-risk-first): **S1** origin-drift (`isStaleVsOrigin`, hardened+bounded fetch on resume/status/checkpoint) + STATE freshness in discuss/plan · **S2** resume Epic-prefix resolver (+ traversal guard) · **S3** capture-pipe guards (drain dangling-fence + `/sig:add` footer repair + lint, recover+warn) · **S4** schema-drift banner in `/sig:status`+`/sig:resume` (moved out of `/sig:doctor`, AD2) · **S5** hook smoke harness + `references/hooks-api.md` + privacy-doc fix. PLAN gated 3 scope decisions: FR1 kept as the Signal-on-Signal resolver read-half (AD1); schema-drift → status/resume (AD2); privacy docs reconciled (AD3). **Epic-native flow committed as the NEXT Epic after E10** (make Epic mode first-class — DECISIONS 2026-07-05); FR1 is its forward-compatible read-half. PLAN output: `M4.5.E10-{RESEARCH,PLAN,VALIDATION}.md`, 8/8 dims PASS, 31/31 ACs mapped. **EXECUTE shipped all 5 slices** (`0c0ca54..dfc4bf7`, per-task atomic commits, all pushed): **S1** FR2 origin-drift (`isStaleVsOrigin` hardened fail-open + banner in resume/status/checkpoint) + FR3 `markFresh` in discuss/plan · **S2** FR1 `resolveArtifactPath` Epic-prefix resolver + traversal guard (fixes the resume-can't-find-`M4.5.E10-PLAN.md` papercut) · **S3** FR4 capture-pipe guards (`listDrainCandidatesWithRecovery` dangling-fence + `insertFutureIdeasEntry` footer repair + `lintFutureIdeasFooter` dogfood lint) · **S4** FR5 `detectSchemaDrift`/`readSchemaDrift` + banner in status/resume (AD2 host) · **S5** FR6 hook spawn harness + `references/hooks-api.md` + SD3 privacy-doc reconciliation. **777→848 tests** (+71), validator green, no new deps. Progress board: `M4.5.E10-PROGRESS.md`. **VERIFY:** PASS — 31/31 ACs, strict-Nyquist RED-first attestation (`M4.5.E10-VERIFICATION.md`). **REVIEW:** PASS-WITH-FIXES — 2 independent specialist agents (code-quality + security); both caught the same crash (F1: `isStaleVsOrigin`/`isStateStale` threw on a schema-drifted STATE.md instead of degrading); 7 findings fixed in-phase (+ Sec-2 git-option-injection guard), 848→**854 tests**; report `M4.5.E10-REVIEW.md`. **SHIP:** complete — **v0.1.5 released** (release commit `e98e2d7`, tag `v0.1.5` pushed, marketplace sha-pinned, GitHub Release published under `insightriot`); retro `M4.5.E10-RETROSPECTIVE.md` (FR1 gate passed); `MILESTONE-4.5.md` § E10 marked shipped. Release carry-over: AC6.4 real-session hook smoke check (human step). **Next: no Epic in flight — the committed Epic-native flow Epic (or M5).** (Authoritative per-Epic state is the frontmatter above; this prose echoes it.)

**M4.5.E5 (external validation + launch) — SHIPPED as v0.1.4 (2026-06-06); the last M4.5 Epic before E10 was added.** PLAN complete 2026-06-03; phase → EXECUTE (Slice 1). Four gray areas gated individually under FULL/strict: launch posture = **quiet peer release**; validation = **assets now, validate async**; assets = **full launch-post draft + demo script**; version = **decide at E5 close with a written rubric**. Spine decision (D-E5-6): **asset/human split** — EXECUTE ships only Claude-producible drafts/templates; the outward actions (recruit peers, record, publish, push tag) are Brett's async handoff. PLAN output: `M4.5.E5-{RESEARCH,PLAN,VALIDATION}.md` — 4 vertical slices / 9 tasks, 8/8 dim PASS + strict Nyquist (9/9 ACs mapped). R1→inline version rubric (no `docs/versioning.md`); R2→GitHub-release + direct peer share + README surfacing. **Next: `/sig:execute` (S1.t1 — launch-asset guard test, RED).** (Authoritative per-Epic phase state is the frontmatter at the top; this prose echoes it.)

**M4.5.E4 (worked example + comparison page) — closed (lightweight) 2026-06-03.** All 3 slices + 9 ACs done; VERIFY/REVIEW/SHIP folded into the close (docs/example Epic, ACs verified inline with test evidence). E4's CHANGELOG block is `[Unreleased]` and batches with E5's release (the version E5 cuts — D-E5-5).

## Current Milestone

**Milestone 4.5 — Release Hardening / Stranger-Adoption Readiness — in flight.** Scaffolded 2026-05-13. **Shipped Epics:** **E1** (install-path fix → v0.1.1; Slice 1 + Phase A only — Slices 3–5 shelved pending testers), **E6** (resume reliability — STATE.md YAML-frontmatter schema + auto-update protocol + `/sig:checkpoint` → v0.1.2), **E7** (synthesizer prose-quality + install-UX), **E3** (public-facing docs rewrite — audience reframe), **E9** (retro foundations — SHIP retro gate + `RETROSPECTIVES.md` index), **E8** (`/sig:doctor` install-state diagnostician — 15th slash command, shipped 2026-05-30), and **E2** (`/sig:add` capture-and-route + `/sig:plan` advisory FUTURE-IDEAS drain — full 5-slice Epic, shipped 2026-05-31; see `M4.5.E2-RETROSPECTIVE.md`). **v0.1.3 released 2026-05-31** (tag `v0.1.3` at the release commit; `marketplace.json` ref + sha pinned to it) — bundling E7+E3+E9+E8+E2. **Remaining M4.5 Epics: E4** (worked example + comparison page) and **E5** (external validation + launch). **Also open:** E1 Slices 3–5 (Linux/WSL install matrix + versioning-policy doc + validator hardening), shelved pending volunteer testers (D-E3-12). Test suite at **762**; validator green. Full Epic roadmap in `MILESTONE-4.5.md`; per-Epic retrospectives indexed in `RETROSPECTIVES.md`; locked decisions in `DECISIONS.md`.

**Milestone 4 — Brownfield Onboarding via `/sig:init` — closed 2026-05-12 + v0.1.0 tagged.** 19 of 19 tasks shipped. M4.t18 (vocabulary refactor: Tranche → Milestone, add Epic mid-layer) and M4.t19 (marketplace install layout fix + plugin slug `signal` → `sig`) both shipped 2026-05-12. Design notes in `MILESTONE-4.md`.

Plugin is now marketplace-installable from `InsightRiot/signal` via Claude Code's plugin system. Slash-command prefix `/sig:*` works because the plugin slug in `.claude-plugin/plugin.json` is `sig` (brand "Signal" preserved in descriptions). The v0.1.0 tag is the publish point. Remaining F2 sub-question (does Claude Code auto-register Signal's agents post-install, or do they need restructuring to flat `agents/sig-<name>.md`?) is the headline item for M4.5.E1 — `/sig:init` Step 2 has the documented fallback path so it works regardless.

Milestone 3 closed 2026-04-26. v1 + v1.5 (brownfield) feature-complete on the markdown and code layer.

## Completed

- **Milestone 4.5, Epic 2 — `/sig:add` capture-and-route, full Epic closed** (2026-05-31):
  - **Slices 2–5 shipped** after a full 2026-05-30 re-DISCUSS + re-PLAN (which superseded the 2026-05-14 S2–S5 draft — heuristics cut per Decision 5, drain made advisory per Decision 2). **S2:** generalized capture spine (`captureToDestination`) + `tools/lib/milestones.js` + `--question`/`--milestone [N]`/`--file` flags with multi-flag guard + `--file` path-escape hard gate. **S3:** naked-invocation interview (one question → FUTURE-IDEAS) + no-heuristics guard. **S4:** first-run onboarding note (gate_strictness-modulated) + brownfield/greenfield error + validator vocab lint. **S5:** the `/sig:plan` advisory drain — `tools/lib/drain.js` (`parseEntries` fence-aware + `listDrainCandidates` + `applyDisposition`/`applyDispositions`/`applyDispositionToFile`) + `commands/plan.md` `### 1b.` step with R1 preview-diff gate + R5 delete/merge confirm.
  - **Full DISCUSS→PLAN→EXECUTE→VERIFY→REVIEW→SHIP cycle** run at FULL/strict. VERIFY: 762 tests, strict Nyquist. REVIEW: four-lens, verdict **PASS-WITH-FIXES** — the Q2 dispositioned-rule was refined in-loop (bare-verb match → drain-stamp signature) after REVIEW found it hid 1 of 29 live entries; user-approved. Shipped direct-to-main (no per-slice tag, Decision 8).
  - **New surface:** `tools/lib/drain.js`, `tools/lib/milestones.js`, `commands/plan.md` § 1b (plus S1's `commands/add.md` + `tools/lib/add.js`). **Epic-owned tests:** `add.test.js` 137 + `milestones.test.js` 8 + `drain.test.js` 38 = 183. Commit range `fdc1247..d79e1b1`. Retro: `M4.5.E2-RETROSPECTIVE.md`.

- **Milestone 4.5, Epic 2, Slice 1 — `/sig:add` hardened hot path** (2026-05-14):
  - **`commands/add.md`** (new) — meta-command spec for `/sig:add "idea"`. No tier-gating preamble (capture should always work); modeled on `commands/resume.md`. Slice 1 covers verbatim capture to `.planning/FUTURE-IDEAS.md` only; force-route flags (`--question`, `--milestone`, `--milestone N`, `--file`), naked-invocation interview, and stranger-safety hardening are deferred to Slices 2–4 per `M4.5.E2-PLAN.md`.
  - **`tools/lib/add.js`** (new, ~250 lines) — pure-function module: `parseInput`, `scrubSensitive`, `checkBodyLength`, `buildFutureIdeasEntry`, `rewriteFooter`, `insertAboveFooter`, `atomicWrite` (write-to-temp + `fs.rename` with `EXDEV` fallback), `acquireLock` / `releaseLock` (stale-lock detection via `unlink` before atomic-create with `wx` flag), `captureToFutureIdeas`. `BODY_LENGTH_SOFT_CAP = 4000` per acceptance criterion #9.
  - **`tests/add.test.js`** (new, 40 tests) — pure-function unit tests for each helper + integration tests covering all 9 acceptance criteria: well-formed write above footer, `.planning/` absence handling, concurrent-run lock failure, sensitive-data scrub prompt (abort + keep paths), atomic rename failure leaves destination unchanged, footer date rewrite, validator green, no new deps, body-length warning.
  - **`tests/fixtures/add/future-ideas-minimal/.planning/FUTURE-IDEAS.md`** (new, ~25 lines) — synthetic minimal fixture for capture integration tests. Models the real `.planning/FUTURE-IDEAS.md` footer convention so footer-rewrite assertions are realistic.
  - **`tools/validate-plugin.js`** — `REQUIRED_COMMANDS` += `'commands/add.md'`.
  - **`README.md`** — added `/sig:add` callout in flow section + per-command bullet in command reference.
  - **`CLAUDE.md`** — "9 slash commands" → "13 slash commands" with full list (`/sig:new-project`, `/sig:init`, `/sig:calibrate`, `/sig:discuss`, `/sig:plan`, `/sig:execute`, `/sig:verify`, `/sig:review`, `/sig:ship`, `/sig:escalate`, `/sig:status`, `/sig:resume`, `/sig:add`).
  - **One defect found + fixed in-slice.** Stale-lock test failure on first run — `acquireLock` did not `unlink` the stale lock before the atomic-create, so `openSync(lockPath, 'wx')` failed with EEXIST. Fixed by adding `unlink` in the stale-detection branch.
  - **Anti-rationalization honored** (per M4.5.E2-PLAN.md): no `appendFile` shortcut (always temp + rename), lock file kept despite solo-dev assumption, sensitive-data scrub prompts user (never auto-redacts), no preview before write, verbatim capture (no LLM rewrite / smart-quoting / normalization), no numeric entry IDs.
  - **Tests 169 → 209** (+40). Validator green. FULL-tier `gate_strictness: strict` honored — slice held for explicit user approval before commit.

- **Milestone 4, Tasks 17 + 18 + 19 — finishing M4 + v0.1.0 tag** (2026-05-11 to 2026-05-12):
  - **M4.t17** (PR #1, merged 2026-05-11) — wire `AskUserQuestion` tool into decision-gathering commands. Replaces free-text prompts in `/sig:calibrate`, `/sig:discuss`, `/sig:escalate`, and `/sig:init` Step 5 walkthrough with structured single-select / multi-select questions where appropriate. Preserves the 3+other pattern for branch-and-other shapes; free-text remains for genuinely open-ended fields (Vision, Problem). Calibrate's 5 diagnostic questions all use the structured tool now.
  - **M4.t18** (2026-05-12) — vocabulary refactor. Renames Tranche → Milestone, introduces Epic as a mid-layer between Milestone and Phase/Wave/Task. Locked vocabulary stanza added to `.planning/PROJECT.md` ("## Vocabulary") with the ID-is-identity rule (e.g., `M4.5.E2.S1` is the canonical reference shape; never re-number after publish). Mechanical sweep across all `.planning/`, `commands/`, `agents/`, `skills/`, `references/`, `docs/`, `README.md`, `CLAUDE.md`. Test fixtures (`tests/fixtures/init/*`) updated to match. The 4.5 milestone shape was the first test of the new vocabulary's flexibility.
  - **M4.t19** (2026-05-12, v0.1.0) — marketplace install layout fix + plugin slug `signal` → `sig`. `.claude-plugin/plugin.json` name field `signal` → `sig` so command prefix `/sig:*` works post-install (Claude Code's marketplace flow uses plugin name as slash-command namespace). Brand "Signal" preserved in `description`. `commands/` directory promoted to repo root (was `.claude/commands/`) so marketplace install resolves correctly. `agents/`, `skills/`, `references/` paths verified against marketplace conventions. v0.1.0 tagged at commit `a73d550`. Marketplace-installable from `InsightRiot/signal`. F2 sub-question (post-install agent registration) deferred to M4.5.E1 — `/sig:init` Step 2 has documented fallback.

- **Milestone 4, Task 13 — Fixture-based tests for `/sig:init` flow** (2026-05-09):
  - **`tests/fixtures/init/{node,python,dormant}-project/.planning/scan/`** (12 new files) — three project fixtures with hand-authored `{stack,structure,activity,quality}.md` files modeled on the real M4.t15 dogfood shape but synthetic (Node Express + GitHub-Actions-CI; Python Flask + no CI + Sphinx docs; Ruby Sinatra + Travis-legacy + dormant 9 months). Each fixture totals ~150–200 lines across the 4 scan files.
  - **`tests/init-fixtures.test.js`** (new, 21 tests) — per fixture: (a) all 4 scans load via `readAllScans`, (b) load-bearing fields extract correctly via `extractSection` + `extractField` (health, framework, CI, license, test runner), (c) one `toMatchInlineSnapshot` of the synthesized 10-field bundle (runtime / lockfile / projectAge / contributors90d / health / defaultBranch / ciPlatforms / license / testAssessment / todoCount). Plus a cross-fixture `describe` block enforcing scanner-ownership boundaries (CI never in stack; Health never in quality; Frameworks never in structure; Test Runners never in stack). Dormant fixture's `Status: dormant` + `rule 2 fired` extraction is the spec-named focus.
  - **Design choice locked.** Scanners are agent specs (markdown), not JS — so what's testable in code is the synthesis layer in `tools/lib/landscape.js`, not the scan itself. The MILESTONE-4 spec's "snapshot of the generated LANDSCAPE.md shape" reframed as snapshot of the *extracted-values bundle* — what the LANDSCAPE.md template consumes. Re-implementing scanner logic in JS to test the scanners themselves was rejected (two truths, maintenance trap).
  - **Tests 148 → 169** (+21). Validator green.

- **Milestone 4, Task 8 — Assumption-surfacing walkthrough in `/sig:init` Step 5** (2026-04-27):
  - **`tools/lib/walkthrough.js`** (new) — two helpers: `countMarkers(content)` returns `{inferred, fillIn, total}` and powers the pre-walkthrough zero-marker skip path; `appendNote(content, note)` adds a `- ` bullet to the `## Notes` section, creating the section if absent. Marker detection deliberately uses `\\[INFERRED[^\\]]+\\]` / `\\[FILL IN[^\\]]+\\]` (requires content after the keyword) so the PROJECT.md header's prose references — `Every \`[INFERRED]\` and \`[FILL IN]\` marker is your responsibility...` — don't inflate the count.
  - **`/sig:init.md` Step 5 fully replaced.** Placeholder reminder is gone; the new spec covers: (5.1) zero-marker skip with announce-N message; (5.2) locked walkthrough order (Vision → Problem → Scope-In → Constraints → Success Criteria → Done When → Scope-Out) with rationale; (5.3) 3+other shape verbatim for `[INFERRED]` markers, with confidence-driven recommendation rules (recommend Accept on high-confidence, Edit on low-confidence, Defer only when no signal); (5.4) open-ended-or-defer shape for `[FILL IN]` markers, with field-specific framing + prompt table for the four FILL-IN field types (Success Criteria, Done When, Scope-Out, Constraints-per-item); (5.5) capture rules (Accept strips marker, Edit replaces + history note, Defer leaves marker + Notes entry, Skip replaces with placeholder + Notes entry, "other" verbatim capture); (5.6) post-walkthrough summary with deferred-fields warning.
  - **Anti-rationalization table grew by 4 rows** — walk-LANDSCAPE-too (defer to scope b), skip-Defer-to-force-completeness (no — Defer is first-class), auto-accept-high-confidence (no — user is source of truth), over-detailed-questions (≤8 lines per question to prevent fatigue).
  - **22 new tests** in `tests/walkthrough.test.js`. Tests 126 → 148. Validator green.
  - **Pre-existing landscape.js fix bundled.** The `extractSection` regex used `(?m:...)` inline modifiers, which require V8 12.7+ (Node 23+) and were silently failing on Node 22.13 — 13 tests had been red on `main` post-context-clear (must have been written and tested on a newer Node). Rewrote with manual line anchors (`(?:^|\\n)##` / `(?=\\n##\\s+|$)`) and replaced `\\s*` after the heading text with `[ \\t]*` so the trailing-whitespace allowance can't gobble the heading-ending newline and pull blank lines from the next section. All 25 landscape tests + the 5 status `readLandscapeMeta` tests now pass on Node 22.

- **Milestone 4, Task 16 — Documentation: README brownfield section + tier-definitions brownfield patterns** (2026-04-26):
  - **README.md** — added "Bringing Signal to an existing codebase" section between "Your first project" (greenfield) and "`.planning/` is your project's memory." Walks through `/sig:init`'s 4 outputs (LANDSCAPE.md, baseline PROJECT.md, STATE.md, scan/*.md), the [INFERRED]/[FILL IN] marker convention, the brownfield-tier-bias hint, and the calibrate-Scenario-A auto-redirect behavior. Also added `/sig:init` to the Command reference list (between new-project and calibrate).
  - **references/tier-definitions.md** — added "Brownfield calibration patterns" section after Escalation, before Design notes. Codifies: reversibility-not-trivial + horizon-rarely-hours-or-days as the two reasons brownfield leans higher-tier, four practical patterns (5yo codebase ≠ SKETCH; FEATURE is most common landing zone; FULL on critical surfaces; SPIKE for novel-capability investigation), and a forward-looking note on codebase-novelty signal feeding calibration (deferred per design decision #5).
  - **LICENSES.md** — no changes. `/sig:init` is Signal's own design (per PROJECT.md attribution tier); no new source repos to attribute.

  Validator green; 126/126 tests still pass after doc-only changes.

- **Milestone 4, Task 15 — `/sig:init` dogfood on Signal itself** (2026-04-26): ran scanners + synthesizer on Signal-the-codebase, output to `.dogfood/M4-INIT-DOGFOOD/` (gitignored). Outputs: 4 scan files + LANDSCAPE.md + baseline PROJECT.md + RUNLOG.md with 18 numbered findings.

  **Headline outcome:** synthesis pipeline works end-to-end. Generated LANDSCAPE.md correctly identified Signal as "a Claude Code plugin in mid-shipping its first release, planning-driven (hot files concentrated in `.planning/`), 13 days old + active, single contributor." Inference labels (`[INFERRED — high/low confidence]`) applied correctly; "Open questions for the user" section produced 4 sharp, data-grounded questions (no CI / no agent registration / no v0.1.0 tag / hand-rolled `.planning/`). Baseline PROJECT.md generation forced `[FILL IN]` for forward-looking fields (Success Criteria, Done When, Scope-out) per design intent.

  **One blocker (F2):** Task tool in dev mode does NOT see Signal's `agents/scanners/*` even though the command list does. `subagent_type: stack-scanner` returns `Agent type 'stack-scanner' not found`. Available agents are harness defaults + `gsd-*` (from properly-installed gsd plugin). Decision logged in DECISIONS.md (2026-04-26 entry — "scanner-spawn fallback path locked"): init.md Step 2 now documents primary path (named subagent) + fallback path (`general-purpose` with agent definition embedded inline) with auto-detect-and-switch instruction. Three open unknowns about marketplace-install behavior flagged for pre-publish validation.

  **Four fix-now refinements applied:**
  - **F2:** init.md Step 2 documents the dev-mode + pre-marketplace fallback path.
  - **F3:** `agents/scanners/structure-scanner.md` exclude list adds `.dogfood/` + `.claude/worktrees/`.
  - **F5:** `agents/scanners/activity-scanner.md` health rule 5 (brand-new) loosened from `<20 commits + <30 days` to `<50 commits + <60 days`; rule 4 (active) gets a tiebreaker note appending "(young + active)" when project age <90 days. Signal itself was hitting rule 4 and losing the brand-new signal.
  - **F10:** `agents/scanners/structure-scanner.md` co-located test detection no longer double-counts files inside dedicated test dirs. Outputs split into "tests in dedicated directory: N" + "tests co-located with source: M" rather than a single conflated count.

  **Six findings deferred** (logged in RUNLOG.md): F1 (Step 1.4 recommendation tone — M4.t8 territory), F6 (quality-scanner test-script grep doc-fix — minor), F8 (Frameworks empty-state for plugin/library projects — defer until 2nd dogfood), F9 (source-root precedence for plugin-shaped repos — defer until 2nd dogfood), F15 (M4.t8 absence felt during dogfood — reinforces M4.t8 priority), F16 ("established codebases" wording in handoff message — minor doc).

  **Eight positive observations** (no action — validates design): F4, F7, F11–F14, F17, F18 — see RUNLOG.md.

  **Wall clock for the full pass:** ~10 minutes (scan data ~2 min + scanner output writes ~5 min + synthesis ~3 min). Mostly token-bound, not thinking-bound. With proper agent-spawn working in parallel, expect significant reduction.

  Validator green; 126/126 tests still pass after fix-now refinements (all changes are markdown-only).

- **Milestone 4, Tasks 10 + 11 + 12 + 14 — adjacent updates make brownfield path first-class** (2026-04-26):
  - **M4.t14 — validator updates.** `tools/validate-plugin.js` adds `.claude/commands/sig/init.md` to `REQUIRED_COMMANDS` (now 12 commands) and a new `REQUIRED_AGENTS` check for the 4 scanner agents. Also adds `agents/scanners` to `REQUIRED_DIRS`. The split between REQUIRED_COMMANDS (errors) and REQUIRED_DIRS (warnings) is preserved; agents land in errors because their absence breaks `/sig:init`.
  - **M4.t10 — `/sig:status` brownfield awareness.** New helper `readLandscapeMeta(baseDir)` in `tools/lib/status.js` returns `{capturedOn}` (date parsed from LANDSCAPE.md "## Last Updated" section, falling back to null on missing/unparseable). 5 new helper tests + 1 read-only-contract update (LANDSCAPE.md mtime preserved across status calls). Branch A (uncalibrated) now branches on LANDSCAPE.md presence: if present, surfaces "Brownfield init complete (landscape captured {date}); not yet calibrated" with a reminder to vet [INFERRED] markers before calibrating. Branches B and C add a `Landscape: captured {date}` line; greenfield projects (no LANDSCAPE.md) are unchanged.
  - **M4.t11 — `/sig:resume` brownfield awareness.** Step 2 loads LANDSCAPE.md alongside PROJECT.md. Vision-fallback rule: if PROJECT.md's Vision contains `[INFERRED]` or `[FILL IN]` markers AND LANDSCAPE.md exists, the briefing surfaces LANDSCAPE.md's "What this project is" paragraph instead, prefixed `(LANDSCAPE inference — PROJECT.md Vision not yet vetted):` so the user can see the inferred-but-unvetted summary clearly. Briefing template adds a `Landscape: captured {date} (brownfield init)` line conditional on LANDSCAPE.md presence.
  - **M4.t12 — `/sig:calibrate` Scenario A redirects.** Scenario A (no `.planning/`) now uses the locked 3+other pattern: A=brownfield (run /sig:init first) / B=greenfield (run /sig:new-project first) / C=cancel (wrong directory). Recommendation auto-selects based on git-state heuristic: `.git/` + ≥1 commit + tracked source files → recommend A; else recommend B. Goes from a single ambiguous question to a directed branch — under-tiering due to user-in-wrong-flow risk significantly reduced.

  Validator green; 121/121 → 126/126 tests pass after readLandscapeMeta tests added.

- **Milestone 4, Wave 3 — `/sig:init` Steps 2–4 + Step 6 (M4.t6 + M4.t7 + M4.t9)** (2026-04-26):
  - **`tools/lib/landscape.js`** — 3 helpers (`readScan`, `readAllScans`, `extractSection`, `extractField`). `extractSection` uses an inline `(?m:...)` regex group to anchor h2 heading matches per-line while letting the closing-lookahead `$` mean end-of-input (JavaScript regex doesn't support `\Z`). `extractField` normalizes markdown emphasis (`**X**` → `X`) before matching to handle the common `- **Label:** value` shape without brittle multi-variant regex. 25 new tests; total 96 → 121.
  - **`/sig:init.md` Step 2 (Codebase scan)** — declarative "spawn all 4 scanner agents in parallel via the Task tool" with a per-scanner `subagent_type` table and a uniform agent prompt. Locked design decision: scanner count fixed at 4 (rationale in DECISIONS.md 2026-04-26 entry — calibration happens *after* the scan, so tier-aware reduction is structurally moot). Failure mode: continue on scanner failure; the synthesizer marks the corresponding LANDSCAPE.md section `(scan output unavailable)`.
  - **`/sig:init.md` Step 3 (Write LANDSCAPE.md)** — full template with 7 sections: 1 narrative ("What this project is" — synthesized from cross-source signals), 5 mechanical (Tech stack / Project structure / Activity signals / Test surface / Open work signals — extracted via `extractSection` + `extractField`), 1 narrative ("Inferred goals & uncertainties" — confidence-marker labels mandatory, `[INFERRED — high/low confidence]` or `[FILL IN]`). Synthesis rules: don't aggregate weak signals into strong claims; embed scanner data, don't paraphrase.
  - **`/sig:init.md` Step 4 (Generate baseline PROJECT.md)** — full template in Signal's standard shape (Vision / Problem / Success Criteria / Scope-in/out / Constraints / Done When / Notes). Generation rules codified per field: Vision + Problem may be `[INFERRED]` from LANDSCAPE; Success Criteria + Done When + Scope-out are *always* `[FILL IN]` (forward-looking; no scan can produce them); Constraints mix inferred (manifest-derived) and `[FILL IN]` (compliance, partner SLAs).
  - **`/sig:init.md` Step 6 (STATE.md + handoff)** — `initState(baseDir, 'CALIBRATE')` + handoff message that surfaces project age + brownfield-tier-bias hint to the user (older codebases tend toward higher tiers due to reversibility cost).
  - **Step 5 (assumption surfacing) remains M4.t8.** A manual reminder text is emitted in its place ("review LANDSCAPE.md and PROJECT.md before /sig:calibrate"). Functional command without it; M4.t8 is the conversational-UX upgrade.
  - Gate checklist rewritten: removed per-task tags now that everything is in place except M4.t8.
  - Validator gating still deferred to M4.t14 — adding init.md to REQUIRED_COMMANDS is bundled with adding scanner agents to a new REQUIRED_AGENTS list (current validator has no agent-file checks).

- **Milestone 4, Tasks 2–5 — 4 parallel scanner agents** (2026-04-26): wrote `agents/scanners/{stack,structure,activity,quality}-scanner.md`. Each is read-only, single-purpose, fact-only (no synthesis — M4.t6's job), and writes to `.planning/scan/{name}.md` for the synthesizer to consume. Output formats are pinned-section-shape so M4.t6 can mechanically combine them; missing sections are explicit `(none detected)` rather than omitted.

  Sibling-scanner overlap was the design challenge — resolved by assigning ownership: stack owns languages + frameworks + Dockerfile + lockfiles; structure owns directory shapes + monorepo detection + test-dir presence + doc-dir presence; activity owns git-history signals (lifetime, cadence, contributors, hot files, commit conventions, branch state, health classification); quality owns test-runner config + CI workflows + lint/format tooling + README/CHANGELOG state + TODO/FIXME debt + license. Each agent's Constraints section explicitly disclaims what's *not* its territory to prevent duplicate reporting in LANDSCAPE.md.

  All 4 scanners share the same defensive posture: read-only, no `npm install`/`pip install`/`cargo build`, 30s per-command timeout, "report no data" failure mode, no PROFILE.md awareness (runs before calibration). Stack scanner skips minified/vendored files (`node_modules/`, `vendor/`, `dist/`, `build/`, `.next/`, `target/`, `__pycache__/`, etc.) via `git ls-files`; the others inherit the same exclusions. Activity scanner explicitly omits author emails (privacy + LANDSCAPE.md is a project artifact).

  Health classification rules (activity scanner) are 5-tier rule-based, first-match-wins: archived > 18mo / dormant 6-18mo / maintenance-mode <6mo + low cadence + 1 contributor / active <6mo + high cadence or multi-contributor / brand-new <30 days + <20 commits.

  Validator updates **deferred to M4.t14** for the same reason as init.md: skeleton ≠ functional. Tests 96/96 still pass; validator green. Auto-discovery by Claude Code untested at this commit (all 4 are sub-agents called from `/sig:init` at M4.t6 time, not standalone slash commands — Claude Code's agent registration confirms availability via the `Task` tool's `subagent_type` parameter at runtime).

- **Milestone 4, Task 1 — `/sig:init` skeleton + pre-flight + state machine** (2026-04-26): wrote `.claude/commands/sig/init.md` — auto-discovered by Claude Code as `sig:init`. Pre-flight implements 5 detected-state branches per the MILESTONE-4 spec, plus the entry-point `.gitignore` check pattern shared with `/sig:new-project` and `/sig:calibrate`:
  - **1.1 Already-Signalized** (PROFILE.md exists + validates) → halt + redirect to `/sig:resume`/`/sig:status`/`/sig:escalate`/`/sig:calibrate --re-calibrate`. Also handles malformed-PROFILE.md case (refuses to overwrite — explicit `--re-calibrate` required).
  - **1.2 No `.git/`** (worktree-aware: directory or `.git`-file pointer) → halt; refuses to auto-run `git init` to preserve user's git ceremony.
  - **1.3 Genuinely empty** (no commits via `git rev-list --count HEAD`, no tracked files via `git ls-files`, no obvious source files) → halt + redirect to `/sig:new-project`. README + LICENSE alone don't constitute a codebase.
  - **1.4 Ambiguous `.planning/`** (directory exists but no PROFILE.md) → 3+other question per `references/question-patterns.md` (continue / start-over / cancel; recommend cancel because partial state is rare-but-load-bearing). Destructive "start over" requires explicit user confirmation even after option B is picked.
  - **1.5 Happy path** (brownfield codebase, no `.planning/`) → proceed to Step 1b.
  - **Step 1b** — `.gitignore` check (mirrors new-project + calibrate exactly).

  Steps 2–6 are scaffolded with `[M4.X — not yet implemented]` markers pointing to the downstream wave that fills them in (M4.t2–M4.t5 scanners, M4.t6 LANDSCAPE.md writer, M4.t7 baseline PROJECT.md generator, M4.t8 assumption surfacing, M4.t9 STATE.md init + handoff). Anti-rationalization table seeded with 5 brownfield-specific temptations (auto-init git, auto-merge ambiguous `.planning/`, skip pre-flight, skip gitignore check, scan empty repo). Gate checklist tagged per-wave so future tasks know which boxes they own.

  Validator updates **deferred to M4.t14** per the MILESTONE-4 spec — adding init.md to `REQUIRED_COMMANDS` before it's functional would make a partial skeleton the new "required minimum," violating Signal's invariant that required = functional. Tests 96/96 still pass; validator green.



- **Pre-Milestone — Attribution cleanup** (2026-04-22): rewrote `PROJECT.md`, `CLAUDE.md`, `LICENSES.md`, `plugin.json`, `marketplace.json`, `package.json` to acknowledge all 9 source repos with Ported / Planned / Pattern-source / Reference tiers. Committed.
- **Pre-Milestone — `.planning/` scaffold** (2026-04-22): created this directory; un-ignored `.planning/` in `.gitignore`. Committed.
- **Milestone 1, Step 1 — Manifest rebrand** (2026-04-22): `name` fields changed to `signal` in 4 places. Repo URLs deferred (initially), then resolved in end-of-session work: GitHub repo renamed `dev-skills-gsd` → `signal`, local remote + all manifest URLs updated. Committed.
- **Milestone 1, Step 2 — Plugin manifest parts** (2026-04-22): resolved as no-op. Claude Code auto-discovers agents/, skills/, hooks/. References/ is ad-hoc. Committed.
- **Milestone 1, Step 3 — npm install + tests + validator** (2026-04-22): 135 packages, 19 tests passing, validator green. Committed (via `tools/validate-plugin.js`).
- **Milestone 1, Step 4 — Scope formalization** (2026-04-22): added "Scope & Roadmap" section to PROJECT.md; CLAUDE.md forward-looking note updated. Committed.
- **Milestone 1, Step 5 — PROFILE.md schema + tier definitions** (2026-04-22): wrote `references/profile-schema.md` and `references/tier-definitions.md`. Schema locked in DECISIONS.md. Committed (`0c5ead6`).
- **Milestone 2, Step 1 — `/sig:calibrate` complete** (2026-04-22 → 2026-04-24): wrote `.claude/commands/sig/calibrate.md` — pre-flight detects 3 scenarios (new project / first calibration / existing PROFILE.md with 4 sub-paths), 5 diagnostic questions with strict enum parsing, tier derivation (FULL / SPIKE / SKETCH / FEATURE), PROFILE.md writer with all 10 rigor_overrides inlined per tier, up/down override handling (downward = warn, upward = brief-confirm with cost implications), `escalation_history` preserved on `--re-calibrate`, anti-rationalization table, gate checklist. Auto-discovered by Claude Code. 19/19 tests pass; validator green. Self-test traced against all 5 scenarios in MILESTONE-2 Step 1.

  Surrounding design decisions logged: `FUTURE-IDEAS.md` (new — calibration granularity options A/B/C with C as the lean; multi-feature project lifecycle), `MILESTONE-3.md` (promoted `/sig:status` + `/sig:resume` to committed Task 1), `OPEN-QUESTIONS.md` (logged Socratic question-pattern codification, resolve before M2 Step 3).

- **Milestone 2, Step 2 — `/sig:escalate` complete** (2026-04-24): wrote `.claude/commands/sig/escalate.md` — pre-flight requires existing PROFILE.md, re-asks 5 questions with prior answers as defaults, derives new tier with same rules, three-case comparison (same/escalation-up/de-escalation), backfill warnings table (5 rows including Nyquist permanent-gap row), appends to `escalation_history` (preserves `created_at` and `created_by`), markdown body section per escalation. **All 9 sig commands now exist on disk.** Tests 19/19, validator green, auto-discovered.

  Architectural insight surfaced: **strict Nyquist is a one-way ratchet — only forward work can achieve it; pre-escalation commits hold permanent quality gaps that no command can recover.** Documented in `references/tier-definitions.md` (new "Recoverable vs. permanent backfills" subsection) and surfaced in `escalate.md`'s Nyquist backfill warning. Reinforces why `/sig:calibrate`'s 5 questions matter — under-tiering creates irrecoverable cost, not just deferrable work.

- **Milestone 2, Step 4 — state.js + profile helpers** (2026-04-24): added `CALIBRATE` to `PHASES` in `tools/lib/state.js`. New `tools/lib/profile.js` exports `readProfile(baseDir)` (parses + strict-validates `.planning/PROFILE.md` frontmatter against the schema in `references/profile-schema.md`; throws `ProfileSchemaError` on any violation), `isPhaseEnabled(profile, phaseName)` (CALIBRATE always true, otherwise checks `phases_skipped`), and `applyRigorOverrides(config, profile)` (returns a new merged config with `rigor_overrides` attached + obvious legacy-key correspondences for `workflow.*`, `gates.*`, `parallelization.max_concurrent_agents`; non-mutating). Added `yaml@^2.8.3` as a runtime dependency (real parser since `escalation_history` carries nested arrays of objects with quoted strings). 28 new tests in `tests/profile.test.js`. Total 47/47 passing, validator green.

- **Milestone 2, Steps 5 + 5a — naming drift, validator updates, .planning/-always-tracked enforcement** (2026-04-25):
  - **Orphan-skill audit & bindings.** 4 orphan skills bound to phases (interim, pending v2 PREPARE-phase decision): `api-and-interface-design` → `plan`; `deprecation-and-migration` → `plan` + `ship`; `frontend-ui-engineering` → `execute`; `source-driven-development` → `execute`. PLAN goes 1 → 3 skills, EXECUTE 3 → 5, SHIP 4 → 5. The 5th unbound skill `using-agent-skills` is meta — correctly not phase-bound.
  - **PREPARE phase candidate logged.** During the audit, an ODI (Outcome-Driven Innovation) Universal Job Map parallel surfaced — Signal collapses ODI's *Locate* (research) and *Prepare* (set up scaffolding, fetch docs, verify framework patterns) into PLAN's tail. Two of the four orphans (especially `source-driven-development`, partially `api-and-interface-design`) are *prep* skills with no clean home in v1's phase decomposition. Added a long-form entry to `FUTURE-IDEAS.md` proposing a v2 PREPARE phase between PLAN and EXECUTE, with three concrete promotion triggers (token-budget signal in PLAN, repeated user-language friction at the seam, two+ new skills landing homeless). v1 stays at 6 phases.
  - **Naming reconciliation.** `references/testing-patterns.md` → `references/testing-checklist.md` (matches family naming: security-checklist, performance-checklist, accessibility-checklist). Updated all references (LICENSES.md, test-driven-development SKILL.md). Used `git mv` to preserve history.
  - **Validator updates.** `validate-plugin.js` now requires `calibrate.md` + `escalate.md` (REQUIRED_COMMANDS) and `profile-schema.md` + `tier-definitions.md` (REQUIRED_FILES).
  - **.planning/-always-tracked.** Added `Step 0 — .gitignore check` to `/sig:new-project.md` (mirrors the existing pattern in `/sig:calibrate.md` Step 1b). README one-liner deferred to MILESTONE-3 Task 4 (where the README itself will be written) — explicit checkbox added there.
  - **OPEN-QUESTIONS cleanup.** Removed the resolved orphan-skill question. Decision logged in `DECISIONS.md` (2026-04-25 entry).
  - 47/47 tests still passing, validator green.

- **Milestone 2, Step 3 — preamble pass + question-pattern convention** (2026-04-25):
  - **Question-pattern convention locked.** Wrote `references/question-patterns.md` codifying three shapes: strict enum (calibrate's 5 questions; correctness constraint), 3-options-plus-other (default for tradeoff questions), open-ended (rare; for genuine clarification at workflow openings). Strictness convention: **strongly recommended with explicit justification for exceptions**. Strict enums mandatory where schema requires; 3+other default for tradeoffs; open-ended is the rare case. Decision logged in DECISIONS.md (2026-04-25 entry); Socratic OPEN-QUESTION resolved and removed.
  - **Preamble + rigor table added to all 6 phase commands.** Each command now opens with "0. Tier-gating preamble" that (a) reads PROFILE.md (halts if missing), (b) exits if phase is in `phases_skipped` (with next-step message), (c) applies phase-specific `rigor_overrides`. Each command has a customized rigor table mapping the relevant overrides — DISCUSS (gate_strictness), PLAN (research_parallelism, plan_validation_dims, nyquist_enforcement, gate_strictness), EXECUTE (tdd_required, context_rot_reread, gate_strictness), VERIFY (nyquist_enforcement with permanent-gap warning, gate_strictness), REVIEW (review_depth, security_audit, performance_pass, simplification_pass, gate_strictness — most overrides), SHIP (gate_strictness).
  - **Question-pattern retrofits.** DISCUSS Step 4 made explicit: exactly 3 named options + recommendation + "other" with verbatim capture into CONTEXT.md. VERIFY's "Loop Back" retrofitted from prescriptive ("return to EXECUTE") to 3+other (loop-back / escalate-tier / accept-failure-with-documented-limit) with recommendation per loop-count.
  - **Skill loading updated.** PLAN now loads api-and-interface-design + deprecation-and-migration. EXECUTE adds source-driven-development + frontend-ui-engineering (with conditional-loading note pointing to FUTURE-IDEAS.md). SHIP adds deprecation-and-migration. Reflects the Step 5 binding decisions.
  - 47/47 tests still passing; validator green.

- **Milestone 2, Step 7 — phase token-cost measurement** (2026-04-25): wrote `tools/measure-phase-costs.js`. All 6 phases within budget; largest is EXECUTE at 12,761 tokens (6.4% of 200K). REVIEW at 5.2% — original "highest risk" framing was overcautious. PLAN at 3.3% with 3 skills — PREPARE-phase token-budget trigger NOT firing (FUTURE-IDEAS updated). Loader bug surfaced and fixed: `findSkillPath` searches all skill phase directories so cross-bound skills load correctly. 6 new tests; 53/53 passing.

- **Milestone 2, Step 6 — agent count reconciliation** (2026-04-25): audit found 22 agents on disk (the OPEN-QUESTIONS "17" count was stale). PROJECT.md claimed 24 but contained two errors — Security Auditor double-counted (in both 3.3 GSD verification and 3.4 Agent Skills specialists), plus Doc Writer + Doc Verifier never written. Decision: revise spec to 22 (drop the docs agents — already covered by `documentation-and-adrs` SHIP-phase skill; same skill-not-agent pattern compound-engineering uses). PROJECT.md sections 3.0/3.3/3.5/Gate 2 updated; CLAUDE.md updated.

- **Milestone 2, Step 8 — paper walkthrough** (2026-04-25): structural smoke test (real execution deferred to MILESTONE-3 Tasks 2+3 where fresh-project setup, real time/token measurement, and full execution time naturally live). Findings: PLAN's skill-loading paths were wrong for cross-bound skills (fixed inline); references all resolve; skill-binding consistency holds; 3 friction points logged to OPEN-QUESTIONS for MILESTONE-3: `{phase}-` artifact naming convention, REVIEW/SHIP not explicitly reading prior-phase artifacts, state.js initState phase-name mismatch.

- **Milestone 3, Task 5 — OPEN-QUESTIONS triage** (2026-04-26): triaged 20 active items into buckets — 14 fix-nows applied, 4 marked resolved, 1 deferred to M4, 1 confirmed-no-change with current data.

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

  **Resolved (struck from OPEN-QUESTIONS):** PROJECT.md location (M4 move); numeric `{phase}-` prefix (DECISIONS lock); MILESTONE-3.md schema-drift (corrected during M3 Task 3 wrap-up); REVIEW/SHIP read-prior-artifacts (didn't bite in dogfood).

  **Deferred to MILESTONE-4:** slash-command testing harness — non-trivial; current 96-test tooling coverage + dogfood passes provide enough signal for v1.

  **Confirmed no-change with data:** 4-tier count — two dogfood data points didn't surface drift; revisit on real-user calibration data.

  **Architecturally meaningful triage outcomes** logged as a single DECISIONS entry (2026-04-26 — "M3 Task 5 triage: workflow refinements from dogfood evidence"). Five small refinements: PASS-WITH-FIXES verdict, two-form Nyquist evidence, PLAN environment-check, DISCUSS tier-aware NFR prompt, SKETCH-floor codified.

  Validator green; 96/96 tests still pass. **OPEN-QUESTIONS.md goes from 20 active items to 2** (tier-count + testing-harness, both with deferred resolution paths).

- **Milestone 3, Task 4 — README quickstart + move PROJECT.md to `.planning/`** (2026-04-26): wrote a comprehensive `README.md` covering value-prop (with the SKETCH-vs-FULL contrast table from M3 Task 3), install instructions (plugin marketplace + from-source), first-project walkthrough (`/sig:new-project` + `/sig:calibrate` + the 5 questions), command reference (one paragraph per command), the `.planning/`-always-committed one-liner (load-bearing — explains why), and Credits & Heritage tiered like LICENSES.md (4 tiers, all 9 source repos linked).

  **Sub-action: moved Signal's own `PROJECT.md` from repo root to `.planning/PROJECT.md`** via `git mv` (history preserved). Updated CLAUDE.md's three references + refreshed CLAUDE.md "Current State" section (it claimed "no source code yet" — wildly stale). No symlink at repo root: the move commits to the convention.

  **Resolves OPEN-QUESTIONS friction "Calibrate Scenario B and `checkGateArtifacts` PLAN gate require `.planning/PROJECT.md`"** (logged in M1 dogfood). `checkGateArtifacts(".", "PLAN")` now correctly finds PROJECT.md.

  **Cold-install timing on this machine:** `npm install` ~1.3s (warm npm cache); validator + 93 tests ~1.4s. Well under the 5-minute claim. (Doesn't include `git clone` — but Signal repo excluding `node_modules` is a few MB, and `npm install` has only one runtime dep, `yaml`.)

  Validator green; 93/93 tests still pass after the move.

- **Milestone 3, Task 3 — SKETCH-tier dogfood on a CSV-to-JSON one-shot script** (2026-04-26): the critical "does calibration actually drop rigor?" validation. Single Claude session ran the SKETCH-tier flow (calibrate → discuss → plan → execute → verify → ship; REVIEW skipped per `phases_skipped: [REVIEW]`) on a 30-LOC Node.js one-shot in `.dogfood/csv-to-json-sketch/`. SKETCH-shaped answers: scope=throwaway, stakes=none, novelty=familiar, reversibility=trivial, horizon=hours → rule 3 fired.

  **Throwaway shipped:** 2 commits, 1 source file (`csv-to-json.js`, ~30 LOC), 0 automated tests (TDD off in SKETCH), manual smoke covered happy path + 2 error paths. 8 `.planning/` artifacts (PROJECT, PROFILE, STATE, config.json, CONTEXT, 1-PLAN, 1-VERIFICATION, 1-SHIP — no RESEARCH/VALIDATION/PROGRESS/REVIEW/REQUIREMENTS).

  **Contrast vs FULL (URL shortener):** wall clock ~5 min vs ~2 hours (~24x), research agents 0 vs 4, source files 1 vs 8, source LOC ~30 vs ~600 (~20x), automated tests 0 vs 39, commits 2 vs 13, `.planning/` artifacts 8 vs 14 (~57%). **Calibration delivers measurable, visible rigor reduction. Value prop validated.**

  **Run log:** `.dogfood/M3-TASK3-RUNLOG.md` (gitignored).

  **3 new findings appended to OPEN-QUESTIONS.md (2026-04-26):**
    1. MILESTONE-3.md predicted SKETCH skips VERIFY; schema only skips REVIEW. Doc/schema drift; trivial fix.
    2. SKETCH still writes 8 `.planning/` artifacts — is that the right floor? Recommendation: accept floor; document explicitly.
    3. `1-PROGRESS.md` is implicit-optional for single-task plans (SKETCH default).

  All 3 are doc-level / one-line fixes for Task 5 triage.

  **High-confidence outcomes:**
  - The contrast between SKETCH and FULL is real and large.
  - Phase-skipping (REVIEW) works cleanly via `phases_skipped`.
  - In-phase skipped *steps* (research, plan-validation, Nyquist) work cleanly via individual rigor_overrides.
  - Auto-advance gates (`gate_strictness: off`) work cleanly — no confirmation prompts firing inappropriately.
  - The one-shot script actually runs and produces correct JSON.

- **Milestone 3, Task 2 — FULL-tier dogfood on a throwaway URL shortener** (2026-04-26): first end-to-end pass of Signal on a *non-Signal* target. Single Claude session ran the full 6-phase flow (`new-project → calibrate → discuss → plan → execute → verify → review → ship`) on a Node.js URL shortener service in `.dogfood/url-shortener-fulltier/` (gitignored from Signal). Synthesized FULL-shaped calibration answers (scope=product, stakes=major, novelty=familiar, reversibility=irreversible, horizon=years → rule 1 fired on irreversibility + years).

  **Throwaway shipped:** 13 commits on its own main branch, 8 production source files in `src/`, 8 test files (39 tests, ~0.5s suite), README + CHANGELOG + .env.example. All 24 acceptance criteria satisfied (18 automated, 6 manual-acknowledged). Live curl smoke confirmed all routes work end-to-end with proper status codes, security headers, graceful SIGTERM. `1-RESEARCH.md` (4-agent synthesis), `1-PLAN.md` (8 vertical slices), `1-VALIDATION.md` (8-dim + Nyquist), `1-PROGRESS.md`, `1-VERIFICATION.md`, `1-REVIEW.md` (2 Important issues fixed in-phase, 2 Suggestions applied), `1-SHIP.md` all generated cleanly.

  **Run log:** `.dogfood/M3-TASK2-RUNLOG.md` captures phase-by-phase observations (gitignored).

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

- **Milestone 3, Task 1 — `/sig:status` (dogfooded) + `/sig:resume` (hand-rolled)** (2026-04-26): first Signal-on-Signal dogfood pass. Worktree `worktree-dogfood-status` ran the full 6-phase flow on building `/sig:status`. Substantive work cherry-picked to main:
  - `.claude/commands/sig/status.md` — 3-branch (uncalibrated / unbegun / in-flight) read-only inspection with tier-aware next-action recommendation.
  - `.claude/commands/sig/resume.md` — re-orientation briefing that loads PROJECT/CONTEXT + the current phase's artifact and ends with "Ready to continue with /sig:{phase}?" prompt; tolerant to `{phase}-` naming variants.
  - `tools/lib/status.js` — `nextActionForPhase`, `reachedDoneViaSkip`, `extractTopOpenQuestions`, `countOpenQuestions`, `readOpenQuestions`, `formatEscalationSummary`.
  - `tests/status.test.js` — 40 new tests (helpers + 3 branch fixtures + read-only mtime check + static contract checks). 53 → 93 tests.
  - `tools/validate-plugin.js` — adds `status.md` and `resume.md` to REQUIRED_COMMANDS.
  - `PROJECT.md` — adds WBS sections 2.10 and 2.11.
  - `.gitignore` — ignores `.claude/worktrees/`.

  Five dogfood-friction findings appended to `OPEN-QUESTIONS.md` (Scenario B's `.planning/PROJECT.md` check vs. Signal's repo-root PROJECT.md; calibrate doesn't init STATE.md; PLAN gate `checkGateArtifacts` likewise; `review_depth: quality-only` precedence; `transitionPhase` doesn't dedupe). Two `DECISIONS.md` entries: dogfood worktree+cherry-pick protocol, `{phase}-` numeric prefix locked.

## Active

**No Epic in flight.** Most recent ship: **M4.5.E10 (resume trust & capture integrity) → v0.1.5 (2026-07-05)** — full DISCUSS→SHIP detail is in `## Current Phase` above (authoritative) and the frontmatter. E5 (external validation + launch → v0.1.4) and E4 (worked example + `docs/vs.md`) shipped earlier; their per-Epic history lives in `## Current Milestone` above and `RETROSPECTIVES.md`.

**Next:** the committed **Epic-native flow** Epic (make Epic mode first-class — DECISIONS 2026-07-05), then **Milestone 5** (v2 ports + memory/doc-runtime per `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` and `MILESTONE-5.md`).

**M4.5's one open criterion** is external, not code: **≥3 non-Signal testers with feedback merged** — the outward loop, tracked in `M4.5.E5-LAUNCH-KIT.md` §3 (assets shipped; recruit/record/publish are Brett's async handoff). Also shelved: **E1 Slices 3–5** (Linux/WSL install matrix + versioning-policy doc + validator hardening), pending volunteer testers (D-E3-12).

Per-Epic shipped detail lives in `## Current Milestone` above and `RETROSPECTIVES.md`; locked decisions in `DECISIONS.md`.

## Blockers

None.

## Last Updated

2026-07-13 (STATE prose accuracy refresh — `## Active` was still narrating M4.5.E5 as in-EXECUTE with "Next: `/sig:execute`", contradicting the frontmatter + `## Current Phase`, which show **M4.5.E10 shipped as v0.1.5** (2026-07-05) and no Epic in flight. Rewrote `## Active`: no Epic active, next = Epic-native flow → M5, M4.5's one open criterion = ≥3 testers. Trimmed the stale E4/E5 closed-work paragraphs to pointers (detail already lives in `## Current Milestone` + `RETROSPECTIVES.md`). **No frontmatter change** — the frontmatter was already correct; only the human-history prose had drifted. Companion note filed to `MILESTONE-5.md` on the doc-lifecycle/eviction fix that would prevent this drift class.)

Prior: 2026-06-03 (M4.5.E5 PLAN complete → phase EXECUTE, Slice 1. 4 parallel research agents ran (codebase conventions / launch-post source / risk-accuracy / external norms); `M4.5.E5-{RESEARCH,PLAN,VALIDATION}.md` written. Plan = 4 vertical slices / 9 tasks; 8/8 plan-dim PASS + strict Nyquist (9/9 ACs mapped, docs-Epic posture: link-integrity + word-count + validator, not code TDD). R1 settled → inline version rubric in a LAUNCH-KIT, NOT `docs/versioning.md` (avoids unshelfing E1). R2 settled → GitHub-release + direct peer share + README surfacing; HN/Reddit/X deferred. Bonus: CHANGELOG dangling `docs/versioning.md` ref to be softened in S3.t8. Mid-PLAN: a `/sig:add` capture (technical-language calibration idea) + a FUTURE-IDEAS footer-drift fix (footer was stranded mid-file; moved to EOF) + root-cause item logged — commits `37f7e10`, `aba41ae`. Frontmatter: `phase: EXECUTE`, `current_wave: S1`, `completed_phases: [DISCUSS, PLAN]`. Next: `/sig:execute` (S1.t1 launch-asset guard, RED).)

Prior: 2026-06-03 (M4.5.E5 DISCUSS complete → phase PLAN. Four gray areas gated under FULL/strict: launch posture = quiet peer release; validation = assets now, validate async; assets = full launch-post draft + demo script; version = decide at close with a written rubric. Spine = D-E5-6 asset/human split (Claude ships drafts/templates; Brett runs the outward actions async). Output: `M4.5.E5-REQUIREMENTS.md` (10 decisions, 8 FRs, doc-quality NFRs, 2 risks R1/R2, 9 ACs) + DECISIONS 2026-06-03 (D-E5-1…10). Frontmatter: `current_epic: M4.5.E5`, `phase: PLAN`, `completed_phases: [DISCUSS]`. Next: `/sig:plan`.)

Prior: 2026-06-03 (M4.5.E4 closed, lightweight. EXECUTE finished all 3 slices / 10 tasks / 9 ACs; VERIFY/REVIEW/SHIP folded per user decision (docs Epic, ACs verified inline with test evidence). Shipped `examples/url-shortener/` (runnable zero-dep + `tests/example-currency.test.js` guard) + `docs/vs.md` (toolbox-framed). Key pivots: `node:sqlite`→JSON store (vitest/vite builtin-resolution wall), AC-count reconciled 24 = 17+7, `vs.md` tone reframe, `gate-at-product-altitude` norm captured. `[Unreleased]` — batches with E5. Frontmatter: `completed_phases: [DISCUSS, PLAN, EXECUTE]`, `last_completed_task: M4.5.E4.S3.t10`. Retro: `M4.5.E4-RETROSPECTIVE.md`. Next: E5.)

Prior: 2026-06-02 (M4.5.E4 EXECUTE Slice 1 complete — worked example shipped to `examples/url-shortener/`. Promoted from `.dogfood/`, swapped to a zero-dep JSON store (node:sqlite hit a vitest/vite builtin-resolution wall — documented in PROGRESS), refreshed STATE to schema_version 1, reconciled the AC-count (24 = 17 automated + 7 manual), added `tests/example-currency.test.js` currency guard. Root suite 762 → 764, validator green. Slice 2 (`docs/vs.md`) pending approval. `last_completed_task: M4.5.E4.S1.t5`.)

Prior: 2026-06-02 (M4.5.E4 PLAN complete — phase → EXECUTE. 4 parallel research agents ran; R1 resolved (swap `better-sqlite3` → Node built-in `node:sqlite`; env check: Node 22.13.0, swap removes the native dep). Drift audit: only STATE.md needs refresh (zero "tranche" hits). `M4.5.E4-{RESEARCH,PLAN,VALIDATION}.md` written; 8-dim PASS + strict Nyquist. Plan = 3 vertical slices / 10 tasks. Frontmatter: `phase: EXECUTE`, `current_wave: S1`, `completed_phases: [DISCUSS, PLAN]`. Next: EXECUTE Slice 1.)

Prior: 2026-06-01 (M4.5.E4 DISCUSS complete — phase → PLAN. Four gray areas gated individually under FULL/strict: worked-example scope / source / form / `vs.md` format. Output in `M4.5.E4-REQUIREMENTS.md` (9 decisions, 8 FRs, doc-quality NFRs, 3 risks, 9 ACs) + DECISIONS 2026-06-01 (D-E4-1…9). Risk R1 flagged for PLAN. Next: `/sig:plan`.)

Prior: 2026-06-01 (STATE prose refresh — `## Active` + `## Last Updated` brought in line with the frontmatter after M4.5.E2 shipped and v0.1.3 was cut; dropped the stale E6 EXECUTE checklist + resolved M4 design-decisions block); 2026-05-31 (M4.5.E2 full Epic closed + **v0.1.3** released — bundled E7+E3+E9+E8+E2; tag pushed, marketplace.json sha pinned); 2026-05-23→30 (E7 synthesizer/install-UX, E3 docs rewrite, E9 retro foundations, E8 `/sig:doctor` 15th command — all shipped); 2026-05-17 (M4.5.E6 PLAN complete — 5 slices, 37 tasks); 2026-05-16 (E6 scaffolded + DISCUSS); 2026-05-15 (M4.5.E1 Slice 1 shipped + v0.1.1); 2026-05-14 (M4.5.E2 Slice 1: `/sig:add` hardened hot path); 2026-05-12 (M4 closed + v0.1.0 tagged); 2026-05-09 (M4.t13 fixture tests).
