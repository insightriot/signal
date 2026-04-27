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
- **T4.8** — Assumption-surfacing step in `/sig:init.md` (Step 5); user-validation flow. Defer until after T4.15 dogfood reveals which markers users struggle with most.
- **T4.9** ✓ — STATE.md initialization + handoff message. Shipped 2026-04-26 (folded into Wave 3 to make the command functional end-to-end). `initState(baseDir, 'CALIBRATE')` + handoff that surfaces project age + brownfield-tier-bias hint.

### Wave 5 — Adjacent updates
- **T4.10** ✓ — `/sig:status` brownfield awareness. Shipped 2026-04-26. New helper `readLandscapeMeta(baseDir)` in `tools/lib/status.js` (parses "## Last Updated" date from LANDSCAPE.md, fall back to null on miss). Branch A (uncalibrated) now branches on LANDSCAPE.md presence with brownfield-specific message. Branches B and C add `Landscape: captured {date}` line conditional on file presence. 5 new helper tests + read-only-contract update.
- **T4.11** ✓ — `/sig:resume` brownfield awareness. Shipped 2026-04-26. Step 2 loads LANDSCAPE.md alongside PROJECT.md. Vision-fallback rule: if PROJECT.md Vision contains `[INFERRED]` or `[FILL IN]` markers AND LANDSCAPE.md exists, the briefing surfaces LANDSCAPE.md's "What this project is" paragraph instead. Briefing template adds a `Landscape: captured {date} (brownfield init)` line.
- **T4.12** ✓ — `/sig:calibrate` Scenario A brownfield redirect. Shipped 2026-04-26. Goes from a single ambiguous question to the locked 3+other pattern (A=brownfield/run /sig:init / B=greenfield/run /sig:new-project / C=cancel). Recommendation auto-selects from a git-state heuristic (`.git/` + ≥1 commit + tracked source files → recommend A). Tentatively addresses TRANCHE-4 design decision #5 (codebase-novelty feeding calibration) via the heuristic; deeper integration deferred until T4.15 dogfood signals.

### Wave 6 — Tests
- **T4.13** — Fixture-based tests for `/sig:init` flow. Three example fixtures: a small Node project, a small Python project, a stale/dormant project (tests the activity scanner's "health" inference). Use vitest fixtures with snapshot-style assertions on the generated LANDSCAPE.md shape. **Defer until after T4.15 dogfood reveals real shapes** — designing fixtures from the spec alone risks over-fitting to the spec.
- **T4.14** ✓ — Validator updates. Shipped 2026-04-26. `tools/validate-plugin.js` adds `init.md` to `REQUIRED_COMMANDS` (now 12 commands) + new `REQUIRED_AGENTS` check for the 4 scanners + `agents/scanners` to `REQUIRED_DIRS`. Agent absence is an error (breaks `/sig:init`); directory absence stays a warning per existing convention.

### Wave 7 — Dogfood + ship
- **T4.15** ✓ — Dogfood pass on Signal-on-Signal. Shipped 2026-04-26. Outputs at `.dogfood/T4-INIT-DOGFOOD/` (gitignored): RUNLOG.md with 18 numbered findings + 4 scan files + LANDSCAPE.md + baseline PROJECT.md. Synthesis pipeline validated end-to-end; one blocker (F2 — agent-spawn registration in dev mode) with documented fallback path locked in DECISIONS.md. Four fix-now refinements applied to init.md + structure-scanner.md + activity-scanner.md. Six findings deferred (logged in RUNLOG.md). 126/126 tests still pass.
- **T4.16** — Documentation update: README brownfield-walkthrough section; `references/tier-definitions.md` adjustment to acknowledge brownfield calibration patterns; LICENSES.md if any new attribution surfaces.

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
