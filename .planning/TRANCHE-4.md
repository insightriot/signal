# Tranche 4 — Brownfield Onboarding via `/sig:init`

**Goal:** Build `/sig:init` — a single-command entry point that gets Signal applied to an *existing codebase* (one that wasn't built with Signal), producing a `.planning/LANDSCAPE.md` "lay of the land" document derived from the code itself, then handing off to `/sig:calibrate`.

**Estimated effort:** 3–5 focused days. One command + one new agent + adjustments to adjacent commands + tests + dogfood pass.

**Blocked by:** v1 (`v0.1.0`) shipped. *Not* blocked on real-user signal — this is the recognized highest-impact gap from T3 dogfood reflection (see DECISIONS 2026-04-26 — "Roadmap reorder").

**Done when:** A user can clone an existing non-Signal codebase, run `/sig:init`, and get a usable Signal project state in under 5 minutes — including a landscape doc accurate enough that `/sig:calibrate` lands the right tier without manual fixup.

---

## Why this is TRANCHE-4 and not v1.5 buried in FUTURE-IDEAS

Three user journeys exist today; only one had a clean entry point at v1:

| Journey | Today | Quality |
|---|---|---|
| Greenfield ("starting fresh") | `/sig:new-project` | clean (T2) |
| Existing Signal project ("coming back") | `/sig:status` → `/sig:resume` | clean (T3 Task 1) |
| **Brownfield ("existing codebase, no Signal yet")** | `/sig:new-project` + `/sig:calibrate` Scenario A + `/sig:discuss --assumptions` | **ad-hoc, three-step, easy to do wrong** |

Brownfield is almost certainly the most common real-world adoption path — greenfield Signal projects are rare; most users have existing code they want to bring discipline to. Without a dedicated command, the first thing users see when adopting Signal is a friction-rich path that requires reverse-engineering Signal's mental model. That kills adoption.

**The strategic call (2026-04-26):** ship v1 narrow but make brownfield onboarding TRANCHE-4 — *before* v2 ports (now TRANCHE-5). Brownfield is a v1-completing feature, not a v2-expanding one.

---

## What `/sig:init` actually does

### Pre-flight (run before any writes)

1. **`.gitignore` check.** Same rule as `/sig:new-project` and `/sig:calibrate` — refuse if `.planning/` is or would be ignored. Non-negotiable; `.planning/` is institutional memory.
2. **Project-state detection.**
   - If `.planning/PROFILE.md` exists → suggest `/sig:resume` instead. `/sig:init` is for projects that haven't been Signal-ized yet.
   - If `.planning/` exists but no PROFILE.md → ambiguous (partial init? abandoned attempt?). Halt and ask: continue init / start over (warn before deleting) / cancel.
   - If repo has files but no `.git/` → ask the user to `git init` first. `.planning/` requires a git repo.
   - If repo is genuinely empty (no source files, no commits) → suggest `/sig:new-project` instead. `/sig:init` is for *existing* code.

### Step 1 — Codebase scan (parallel, multi-aspect)

Spawn up to 4 parallel scanner agents. Each focuses on one dimension; results merge into the LANDSCAPE.md draft. Tier-gate this: at high `research_parallelism`, all 4 fire; at low, condense to 2.

| Scanner | Looks for |
|---|---|
| **Stack scanner** | Package files (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `pom.xml`, etc.); lockfiles; language detection (Linguist-style heuristics); framework markers (`next.config.*`, `vite.config.*`, `manage.py`, `app.py` shapes). |
| **Structure scanner** | Top-level directory layout; conventions (`src/`, `lib/`, `app/`, monorepo markers like `packages/` or `apps/`); test directory presence; docs directory presence. |
| **Activity scanner** | `git log` last 30 / 90 days; top contributors; hot files (most-changed); commit-message patterns (Conventional Commits? PR-merge? squash?); branch state; whether the project is active / dormant / archived. |
| **Quality scanner** | README presence + content sample; CI workflows (`.github/workflows/`, `.gitlab-ci.yml`, etc.); lint config; test runner detection (vitest / jest / pytest / etc.); test count if cheap; existing TODOs / FIXMEs grep. |

Scanners must be **read-only**. No writes during scan. Results synthesized in Step 2.

### Step 2 — Write `.planning/LANDSCAPE.md`

The signature artifact of TRANCHE-4. Brownfield's analog of greenfield's PROJECT.md. Contains:

```markdown
# Landscape

## What this project is
{1-paragraph inferred-from-evidence summary: what does the code do, who is it for, what's its current state — drawn from README + package metadata + recent commits}

## Tech stack
- Languages: {detected, ordered by lines-of-code}
- Frameworks: {detected from manifests + config files}
- Test runner: {if any}
- CI: {if any}

## Project structure
{tree of top-level + key dirs, with one-line annotations}

## Activity signals
- Last commit: {date, days ago}
- Active contributors (90 days): {N people}
- Hot files (10+ commits in 90 days): {list}
- Health: {active / maintenance-mode / dormant / archived — inferred}

## Test surface
- Tests detected: {yes/no, count if cheap}
- Test runner: {detected name}
- CI runs tests: {yes/no/unknown}
- Coverage: {if a config file or report is present}

## Open work signals
- TODO/FIXME count: {grep-derived count, top 5 with file:line}
- Open issues file: {presence}
- CHANGELOG state: {up-to-date / stale / absent}

## Inferred goals & uncertainties
**INFERRED — please verify before relying on:**
- {Goal 1 — the project appears to do X, based on Y evidence}
- {Goal 2 — ...}

**Open questions for the user:**
- {What's not clear from the code that the user needs to confirm}
- {Any major dependencies on external context}

## Last Updated
{ISO date}
```

### Step 3 — Generate baseline `.planning/PROJECT.md`

From the LANDSCAPE, generate a PROJECT.md skeleton in Signal's standard shape (Vision / Problem / Success Criteria / Scope / Constraints / Done When). Mark every inferred field with `[INFERRED — please verify]` so the user knows what's a guess. Empty fields get `[FILL IN — Signal could not infer this]` rather than fabrication.

This is the moment Signal acknowledges: **a brownfield codebase doesn't have a Vision file, but Signal needs one — so make one and ask the user to vet it.**

### Step 4 — Surface assumptions for validation (3-options-plus-other where relevant)

Walk the user through the inferred-content checkpoints. For each, accept / correct / defer. Use the locked question-pattern conventions (`references/question-patterns.md`):
- 3-options-plus-other for genuine tradeoff questions ("Should we treat this project as FEATURE / SUBSYSTEM / PRODUCT scope?")
- Open-ended for clarifying genuinely unknown intent ("What's the *current* problem you're solving — the README is from 18 months ago.")

### Step 5 — Initialize STATE.md and hand off to `/sig:calibrate`

Write `.planning/STATE.md` with `Current Phase: CALIBRATE`. Print the next-step message:

```
Landscape captured at .planning/LANDSCAPE.md.
Baseline PROJECT.md drafted at .planning/PROJECT.md (review the [INFERRED] markers).

Next: /sig:calibrate to tier the work — given this is a brownfield project with
{N months/years} of history, the calibration questions will lean toward higher
tiers (reversibility tends to be painful or worse for established codebases).

Reminder: review LANDSCAPE.md and PROJECT.md before /sig:calibrate so the
tiering reflects what's *actually true* about your project, not what Signal
inferred.
```

### Step 6 — Update STATE.md to enter CALIBRATE

Same pattern as `/sig:new-project`'s tail. Calibration becomes the next user action.

---

## Tasks

### Wave 1 — Foundation
- **T4.1** ✓ — Pre-flight + state machine. Shipped 2026-04-26. `.claude/commands/sig/init.md` skeleton with 5-state pre-flight (already-Signalized / no-`.git/` / empty repo / ambiguous `.planning/` / happy path) + `.gitignore` check + scaffolded Steps 2-6 with `[T4.X — not yet implemented]` markers + 5-row anti-rationalization table + per-wave-tagged gate checklist. Auto-discovered by Claude Code as `sig:init`. Validator updates deferred to T4.14 per the spec. Tests 96/96; validator green.

### Wave 2 — Scanners (parallel)
- **T4.2** ✓ — Stack scanner agent. Shipped 2026-04-26. Detects languages (file-extension tally with vendored exclusions), package managers + manifests (Node/Python/Rust/Go/Ruby/JVM/.NET/PHP/Elixir/Swift + container/edge), framework markers (Next/Vite/Astro/Remix/Nuxt/SvelteKit/Express/Django/Flask/Rails/Spring/Laravel via config-file presence not just deps), and runtime/deployment targets. Writes `.planning/scan/stack.md`.
- **T4.3** ✓ — Structure scanner agent. Shipped 2026-04-26. Top-level inventory (categorized: source-shaped / test-shaped / doc-shaped / CI-tooling / standard-files / other), monorepo detection (workspaces / Nx / Turbo / Lerna / Rush / implicit / single-repo), source-tree depth-3 walk with conservative annotations, test-directory presence (dedicated + co-located + by-name detection), doc-directory presence (Docusaurus/MkDocs/mdBook/VitePress/GitBook/Sphinx). Writes `.planning/scan/structure.md`.
- **T4.4** ✓ — Activity scanner agent. Shipped 2026-04-26. Repo lifetime, commit cadence (30/90/365d windows + avg/week), contributor counts (90d unique + top 10, names-only no emails), hot files (90d with lockfile/CHANGELOG/generated-doc filters), commit-message convention detection (Conventional Commits / PR-merge / squash-and-merge / free-form / mixed; >50%/>30% thresholds), branch state, 5-tier rule-based health classification (archived / dormant / maintenance-mode / active / brand-new). Writes `.planning/scan/activity.md`.
- **T4.5** ✓ — Quality scanner agent. Shipped 2026-04-26. Test-runner detection (vitest/jest/mocha/Playwright/Cypress/pytest/RSpec/cargo/go-test/JUnit via config-file presence not just devDeps), CI workflow detection (GitHub Actions / GitLab / CircleCI / Travis / Buildkite / Jenkins / Azure / Vercel / Netlify) with "does CI run tests on PRs" derived from workflow grep, lint/format tooling (ESLint / Prettier / Biome / Ruff / Black / mypy/pyright / rustfmt / golangci-lint / RuboCop / EditorConfig / TypeScript), README sections + first-30-lines verbatim (synthesizer uses these for "What this project is"), CHANGELOG freshness, TODO/FIXME/HACK debt grep with `:!*.lock` `:!CHANGELOG*` exclusions and 1000-result cap, license SPDX detection. Writes `.planning/scan/quality.md`.

  All 4 scanners share the same defensive posture: read-only, no install/build commands, 30s per-command timeout, "report no data" failure mode for missing/unparseable inputs, no PROFILE.md awareness. Sibling overlap explicitly resolved via per-agent Constraints sections.

### Wave 3 — Synthesis
- **T4.6** ✓ — LANDSCAPE.md writer. Shipped 2026-04-26. `/sig:init.md` Step 2 (parallel scanner orchestration via Task tool with per-agent `subagent_type`) + Step 3 (LANDSCAPE.md template with 7 sections, 5 mechanical + 2 narrative). Helper `tools/lib/landscape.js`: `readScan` / `readAllScans` / `extractSection` (inline `(?m:...)` group for h2-anchored heading match) / `extractField` (markdown-emphasis-normalize-then-plain-match). 25 tests added.
- **T4.7** ✓ — Baseline PROJECT.md generator. Shipped 2026-04-26. `/sig:init.md` Step 4 with full Signal-shape template (Vision / Problem / Success Criteria / Scope-in/out / Constraints / Done When / Notes). Generation rules per field: forward-looking fields (Success Criteria / Done When / Scope-out) are *always* `[FILL IN]`; manifest-derived fields (language, runtime) are facts; everything else gets `[INFERRED — please verify]`.

### Wave 4 — Validation
- **T4.8** ✓ — Assumption-surfacing step in `/sig:init.md` (Step 5); user-validation flow. Shipped 2026-04-27. Replaced the placeholder reminder with a full structured walkthrough per the Wave 4 design below: pre-walkthrough zero-marker skip + locked field order (Vision → Problem → Scope-In → Constraints → Success Criteria → Done When → Scope-Out) + 3+other for `[INFERRED]` markers + open-ended-or-defer for `[FILL IN]` markers + Accept/Edit/Defer/Skip capture rules with `## Notes` history appendage + post-walkthrough summary. Field-specific framing + open-ended prompts for the four `[FILL IN]` field types codified in a table. Anti-rationalization table grew 4 rows (LANDSCAPE-too / skip-Defer / auto-accept-high-confidence / over-detailed-questions). Added `tools/lib/walkthrough.js` (`countMarkers` + `appendNote`) for the zero-marker skip + Notes-section history append. 22 new tests in `tests/walkthrough.test.js` (count: zeros / single / multi / bare-prose-ignored / confidence-labeled / no-backticks; appendNote: empty input / null / populated section / empty section / blank-only body / no Notes section / no trailing newline / mid-document / h3 ignored / whitespace-trim / multi-line / idempotent twice). Tests 126 → 148; validator green. Also fixed a pre-existing landscape.js regex incompatibility — `(?m:...)` inline modifier requires V8 12.7+ (Node 23+) and was failing on Node 22.13; rewrote `extractSection` to use manual line anchors with `[ \\t]*` (not `\\s*`) so the heading-line whitespace allowance doesn't eat blank lines.
- **T4.9** ✓ — STATE.md initialization + handoff message. Shipped 2026-04-26 (folded into Wave 3 to make the command functional end-to-end). `initState(baseDir, 'CALIBRATE')` + handoff that surfaces project age + brownfield-tier-bias hint.

#### T4.8 detailed design (next-session pickup)

**Why it matters.** T4.15 dogfood (Signal-on-Signal) ran without T4.8. Doing the walkthrough manually I felt the absence: `[INFERRED]` and `[FILL IN]` markers are scattered through LANDSCAPE.md and baseline PROJECT.md, and the user has to spot them, decide what to do with each, and edit the files manually. T4.8 is the conversational layer that turns "scan output" into "vetted artifacts the user trusts to feed `/sig:calibrate`."

**Goal.** A structured walkthrough that surfaces every `[INFERRED]` and `[FILL IN]` marker in `.planning/PROJECT.md` (the higher-priority file — calibration questions derive from these fields) with question-pattern-compliant prompts. User responses get captured into the file directly; the walkthrough either resolves the marker or explicitly defers it.

**Scope decision (lock during implementation).** Two reasonable scopes:
- **(a) PROJECT.md only.** The forward-looking fields (Vision / Problem / Success Criteria / Done When / Scope-out / Constraints) are what `/sig:calibrate` needs vetted. LANDSCAPE.md is reference material the user can read manually.
- **(b) PROJECT.md + LANDSCAPE.md narrative sections** ("What this project is" + "Inferred goals & uncertainties"). LANDSCAPE.md's narrative inferences also have confidence markers; if they're wrong, the project description carries that wrongness forward.
- **Recommendation: (a) first** — ship a focused walkthrough; expand to (b) only if dogfood-2 surfaces real friction.

**Walkthrough order** (locked):
1. **Vision** (`[INFERRED — please verify]` or `[FILL IN]` from PROJECT.md)
2. **Problem Statement** (same)
3. **Scope (In)** (`[INFERRED]` — auto-filled from observable signal)
4. **Constraints** (mix; `[FILL IN]` items only — manifest-derived facts get skipped)
5. **Success Criteria** (always `[FILL IN]`)
6. **Done When** (always `[FILL IN]`)
7. **Scope (Out)** (always `[FILL IN]`)

Order rationale: vetted Vision + Problem are prerequisites for Success Criteria + Done When + Scope-out (those forward-looking fields require knowing the goal first). Constraints come before Success Criteria because constraints often shape what success looks like.

**Per-marker question pattern (per `references/question-patterns.md`):**

For `[INFERRED]` markers (auto-filled content the user can accept, correct, or defer):
```
Vision (inferred from {source — e.g., "README + framework + activity signals"}):

  "{the inferred Vision text}"

Three options:

A. Accept as-is — replace [INFERRED] marker with confirmation.
B. Edit — give me the corrected version.
C. Defer — leave the [INFERRED] marker; you'll vet later.

Recommendation: {A if confidence-marker is "high"; "Edit (B)" if "low"; "Defer (C)" only if you genuinely have no signal — but note that calibration depends on this field}.

If none fit, describe what you'd prefer.
```

For `[FILL IN]` markers (forward-looking content Signal can't infer):
```
Success Criteria — Signal can't infer this; you have to articulate it.

Open-ended: what does success look like for this project today? List 3-5 measurable
criteria (e.g., "P95 latency under 200ms", "Free-tier user growth >10%/month",
"v0.1.0 shipped to plugin marketplace by 2026-05-15").

Or pick:
A. Defer — leave the [FILL IN] marker; you'll fill in later. Calibration may
   land at a less-accurate tier without this.
B. Skip — explicitly mark "no fixed criteria" if this project doesn't have
   measurable success criteria yet (rare; mostly applies to research SPIKE
   tier work).

Recommendation: take the open-ended path; even rough criteria help calibration
(stakes / horizon answers depend on knowing what "done" looks like).
```

**Capture rules:**
- Accept (A): replace the marker with the inferred content unwrapped (no `[INFERRED]` annotation).
- Edit (B): replace the marker with the user's edited content; capture the original inferred content + the user's reason for edit in a "## Notes" section at the end of PROJECT.md (history is load-bearing for future Claude sessions).
- Defer (C): leave the marker in place. Append a note to PROJECT.md "## Notes" section: `Deferred at /sig:init walkthrough on {date}: {field name}.`
- Open-ended `[FILL IN]` answer: replace the marker with the user's content; no inferred-content backup needed (there was none).
- Defer on `[FILL IN]`: same as defer on `[INFERRED]` — note in "## Notes."

**Pre-walkthrough check:** before starting the walkthrough, count how many markers exist in PROJECT.md. If 0 markers (the user pre-edited the file), skip Step 5 entirely and go straight to Step 6. Useful telemetry to surface to the user: "0 unresolved markers in PROJECT.md — skipping the walkthrough and proceeding to calibration."

**Post-walkthrough summary:** after the walkthrough, emit a 1-line summary:
```
Walkthrough complete: {N} markers resolved, {M} deferred.
{If M > 0}: Deferred fields are noted in PROJECT.md "## Notes"; calibration
will proceed but tier accuracy may be reduced for the deferred dimensions.
```

**Implementation notes:**
- Use `extractField` from `tools/lib/landscape.js` to find marker lines: pattern `[INFERRED — please verify]` or `[FILL IN — ...]`. Or walk PROJECT.md as raw text and grep for the marker substrings.
- A new helper `tools/lib/walkthrough.js` may be worthwhile if the marker-detection + edit logic gets complex. Decide during implementation; if PROJECT.md manipulation can be done cleanly inline in the command, no helper needed.
- Tests: at minimum, a fixture PROJECT.md with mixed markers + a unit test that the walkthrough's pre-check correctly counts markers. Full conversational walkthrough test is harder; a smoke test that the helper functions work is enough.

**Anti-rationalization for T4.8 implementation:**
| Temptation | Check |
|---|---|
| "Walk LANDSCAPE.md too — it has markers." | Defer to scope (b). Ship (a) first; LANDSCAPE.md walkthrough is more questions, more tokens, and the user can review LANDSCAPE.md manually before /sig:calibrate. |
| "Skip the 'Defer' option to force completeness." | No — forcing completeness on an entrypoint command kills adoption. Defer must be a first-class option. |
| "Auto-accept high-confidence [INFERRED] markers without asking." | No — even if Signal's confidence is high, the user is the source of truth on their own project's purpose. The walkthrough exists to surface, not to auto-decide. |
| "Make the questions multi-line and detailed." | Keep each question to ≤ 8 lines (the option enumeration + recommendation). Brevity matters; the walkthrough has 7 fields and a 50-line question per field is fatigue-inducing. |

**Success criteria for T4.8 ship:**
- [ ] Step 5 placeholder in `init.md` replaced with the structured walkthrough.
- [ ] All 7 PROJECT.md fields covered in the locked order.
- [ ] 3+other for `[INFERRED]` markers; open-ended-or-defer for `[FILL IN]` markers.
- [ ] Capture rules implemented (Accept/Edit/Defer behavior + Notes section appendage).
- [ ] Pre-walkthrough zero-marker skip path implemented.
- [ ] Post-walkthrough summary emitted.
- [ ] Validator + 126 tests still pass.
- [ ] Dogfood pass on Signal itself confirms the walkthrough is non-fatiguing.

### Wave 5 — Adjacent updates
- **T4.10** ✓ — `/sig:status` brownfield awareness. Shipped 2026-04-26. New helper `readLandscapeMeta(baseDir)` in `tools/lib/status.js` (parses "## Last Updated" date from LANDSCAPE.md, fall back to null on miss). Branch A (uncalibrated) now branches on LANDSCAPE.md presence with brownfield-specific message. Branches B and C add `Landscape: captured {date}` line conditional on file presence. 5 new helper tests + read-only-contract update.
- **T4.11** ✓ — `/sig:resume` brownfield awareness. Shipped 2026-04-26. Step 2 loads LANDSCAPE.md alongside PROJECT.md. Vision-fallback rule: if PROJECT.md Vision contains `[INFERRED]` or `[FILL IN]` markers AND LANDSCAPE.md exists, the briefing surfaces LANDSCAPE.md's "What this project is" paragraph instead. Briefing template adds a `Landscape: captured {date} (brownfield init)` line.
- **T4.12** ✓ — `/sig:calibrate` Scenario A brownfield redirect. Shipped 2026-04-26. Goes from a single ambiguous question to the locked 3+other pattern (A=brownfield/run /sig:init / B=greenfield/run /sig:new-project / C=cancel). Recommendation auto-selects from a git-state heuristic (`.git/` + ≥1 commit + tracked source files → recommend A). Tentatively addresses TRANCHE-4 design decision #5 (codebase-novelty feeding calibration) via the heuristic; deeper integration deferred until T4.15 dogfood signals.

### Wave 6 — Tests
- **T4.13** — Fixture-based tests for `/sig:init` flow. Three example fixtures: a small Node project, a small Python project, a stale/dormant project (tests the activity scanner's "health" inference). Use vitest fixtures with snapshot-style assertions on the generated LANDSCAPE.md shape. **Defer until after T4.15 dogfood reveals real shapes** — designing fixtures from the spec alone risks over-fitting to the spec.
- **T4.14** ✓ — Validator updates. Shipped 2026-04-26. `tools/validate-plugin.js` adds `init.md` to `REQUIRED_COMMANDS` (now 12 commands) + new `REQUIRED_AGENTS` check for the 4 scanners + `agents/scanners` to `REQUIRED_DIRS`. Agent absence is an error (breaks `/sig:init`); directory absence stays a warning per existing convention.

### Wave 7 — Dogfood + ship
- **T4.15** ✓ — Dogfood pass on Signal-on-Signal. Shipped 2026-04-26. Outputs at `.dogfood/T4-INIT-DOGFOOD/` (gitignored): RUNLOG.md with 18 numbered findings + 4 scan files + LANDSCAPE.md + baseline PROJECT.md. Synthesis pipeline validated end-to-end; one blocker (F2 — agent-spawn registration in dev mode) with documented fallback path locked in DECISIONS.md. Four fix-now refinements applied to init.md + structure-scanner.md + activity-scanner.md. Six findings deferred (logged in RUNLOG.md). 126/126 tests still pass.
- **T4.16** ✓ — Documentation update. Shipped 2026-04-26. README gained "Bringing Signal to an existing codebase" section (between greenfield walkthrough and `.planning/`-in-git note) + `/sig:init` in Command reference. tier-definitions.md gained "Brownfield calibration patterns" section (between Escalation and Design notes) — codifies why brownfield leans higher-tier (reversibility-not-trivial + horizon-rarely-hours) and four practical patterns. LICENSES.md unchanged (no new attribution — `/sig:init` is Signal's own design).

---

## Design decisions to lock during execution (not decided here)

These are the gray areas a real implementation will surface. Logged for the implementing session to decide; pre-deciding them here is over-planning.

1. **Scanner agents vs in-command logic.** Are the 4 scanners separate agents (faithful to GSD pattern) or embedded steps in `/sig:init.md`? Tradeoff: agent fan-out costs tokens but is the canonical Signal pattern; embedded is cheaper but loses the parallelism. Likely answer: agents at FULL/FEATURE; embedded at SKETCH (but SKETCH is unlikely to use `/sig:init` — brownfield projects rarely calibrate to SKETCH).

2. **LANDSCAPE.md vs splitting into multiple files.** Single doc vs separate `STACK.md` + `ACTIVITY.md` + etc. Single is simpler and matches the "one project = one linear flow" v1 framing. Likely answer: single file for v1.5; revisit if it grows past ~200 lines on real projects.

3. **How aggressive should the inference be?** Should `/sig:init` *guess* a project's primary goal from commits + README, or should it stop at "here's what I can observe, you fill in the goal"? The aggressive path is more useful when right and worse when wrong. Likely answer: guess with confidence-marker labels (`[INFERRED — high confidence]`, `[INFERRED — low confidence]`, `[FILL IN]`); user reviews.

4. **Should `/sig:init` write PROJECT.md or just LANDSCAPE.md?** Writing PROJECT.md means inferring vision/scope/done-when from code, which is risky. Not writing it means users still have to do the greenfield-PROJECT.md step manually. Likely answer: write a baseline PROJECT.md with explicit `[INFERRED]` and `[FILL IN]` markers — the friction of post-editing is lower than starting from a blank.

5. **Codebase-novelty signal feeding calibration.** Should `/sig:init`'s scan tell `/sig:calibrate` anything? E.g., a 5-year-old codebase with 50K LOC pretty obviously isn't `scope: throwaway`. Could pre-fill calibration answers as defaults. Likely answer: yes, but as defaults the user can override, not as forced values.

---

## Exit Criteria

- [ ] `/sig:init` command exists; auto-discovered by Claude Code.
- [ ] 4 scanner agents (stack / structure / activity / quality) exist; auto-discovered.
- [ ] `.planning/LANDSCAPE.md` template and synthesizer produce useful output on at least 3 real-world brownfield projects.
- [ ] Baseline `.planning/PROJECT.md` generated with appropriate `[INFERRED]` / `[FILL IN]` markers.
- [ ] `/sig:status`, `/sig:resume`, `/sig:calibrate` updated to recognize LANDSCAPE.md and the brownfield-init path.
- [ ] Validator + tests pass.
- [ ] At least one dogfood pass on a real existing codebase produces a usable LANDSCAPE.md without major manual fixup.
- [ ] README's "Your first project" section grows a "Bringing Signal to an existing codebase" subsection.
- [ ] DECISIONS.md gains a 2026-04-26 entry locking the brownfield-init pattern.

---

## What this unlocks

- **Brownfield adoption becomes a one-command operation.** Removes the biggest barrier to Signal being usable on real-world existing projects.
- **TRANCHE-5 (v2 ports)** becomes legitimate to start once `/sig:init` lands AND v1+v1.5 has real users for a few weeks.
- **A scanner-agent pattern** that future v2 work (especially gstack's `/cso` audit, which is similar — multi-dimensional codebase scan + report) can build on.

---

## How to start a session for TRANCHE-4

1. Read `.planning/CONTEXT.md` + `.planning/STATE.md` (current state of Signal-the-project).
2. Read this file (`TRANCHE-4.md`) for task list.
3. Re-read `.claude/commands/sig/new-project.md` and `.claude/commands/sig/calibrate.md` — `/sig:init` is conceptually a new entry point that overlaps both, so understanding their shapes is necessary background.
4. Re-read `references/question-patterns.md` — `/sig:init`'s Step 4 (assumption surfacing) is question-pattern-heavy.
5. Re-read T3 Task 1's commits (`5bf4184`, `600de7f`) — `/sig:status` and `/sig:resume`'s structure is the closest existing analog to what `/sig:init` will look like.
6. Pick up Task T4.1 first.
