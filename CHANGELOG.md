# Changelog

All notable changes to Signal are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — pre-1.0 (`0.x.y`) allows breaking changes at minor (`0.x`) bumps. See the pre-1.0 line in [`SECURITY.md`](SECURITY.md) for the support policy, and Signal's version-decision rubric (adopted with the M4.5.E5 launch assets) for how minor vs. patch is decided.

`[BREAKING]` tags mark entries that change user-visible behavior, slash-command surface, plugin manifest shape, or `.planning/` schema.

---

## [0.1.7] — 2026-07-15 — M4.5.E11 (Epic-native flow)

Makes **Epic mode** first-class: commands can open/track Epics, auto-write a strict `current_epic`, name artifacts `{EpicID}-*.md`, and honor a per-Epic tier — all **additive over a byte-identical linear mode**. No breaking changes; no new runtime dependencies; no `.planning/` schema bump. 894 → 999 tests. Full DISCUSS→SHIP at FULL/strict; REVIEW ran two independent specialist agents. Reference: [`references/epic-native-flow.md`](references/epic-native-flow.md).

### Added

- **`--epic <name>` on `/sig:discuss` and `/sig:new-project`** opens (or rolls to) an Epic: the tooling derives a strict Epic ID (`M{maj}.{min}.E{n}`, via `deriveNextEpicId`) or accepts an explicit one, writes it to STATE `current_epic` **automatically** (no hand-editing), and atomically resets the coupled in-flight fields (`current_wave` / `current_tasks`) on a roll. A *done* Epic — one whose `{EpicID}-RETROSPECTIVE.md` exists — requires `--epic` to open the next one, so a completed Epic's artifacts are never clobbered.
- **Epic-scoped artifact naming.** When an Epic is active, the six phase commands write `{EpicID}-{ARTIFACT}.md` (RESEARCH / REQUIREMENTS / PLAN / VALIDATION / VERIFICATION / REVIEW / PROGRESS) and `/sig:resume` + `/sig:status` resolve them via the E10 read-half. The retrospective stays `deriveRetroPath`-owned (`{EpicID}-RETROSPECTIVE.md`); `CONTEXT.md` is never Epic-prefixed.
- **Per-Epic calibration.** An Epic can carry its own tier via a whole-file `.planning/{EpicID}-PROFILE.md` that shadows the project PROFILE **for that Epic's phases only** (`readEffectiveProfile`). `/sig:calibrate` and `/sig:escalate` target the Epic PROFILE when an Epic is active; `/sig:status` and `/sig:resume` render the override (`Tier: SKETCH (Epic M4.5.E11 override; project default FULL)`) so shadowing is never silent.

### Fixed

- **The `check-state-write` PreToolUse hook no longer crashes on a hostile `current_epic`.** A malformed `current_epic` on an Epic-close SHIP write previously threw an uncaught error (a stranger-session crash); it now fails open (exit 0). The hook's missing-retro path warns rather than blocks — the hard "no retro, no ship" gate stays in `/sig:ship` §0.5 (running the command opts you into its contract).

### Notes

- **Additive / opt-in.** A project with no active Epic runs exactly as before — linear mode is byte-identical to pre-E11, with no migration and no schema bump. The `resolveArtifactPath` read-half stays intentionally permissive to keep resolving pre-E11 hand-managed artifacts (e.g. `v0.1.6-*.md`) that the strict write-side shape would reject.

## [0.1.6] — 2026-07-14 — v0.1.6 (doc-integrity guardrail)

A lightweight trust-hardening patch that prevents new documentation-integrity pathology at the point it's created and converges two capture/planning papercuts. No breaking changes; no new runtime dependencies. 854 → 894 tests. Shipped as a version patch (not an Epic) — but the cross-project write-hook earned a full specialist REVIEW pass (2 independent auditors, 6 fixes in-phase; see `.planning/v0.1.6-REVIEW.md`).

Scope note: this **prevents** new bloat and **flags** growth — it does not evict an already-bloated `STATE.md`. Automated eviction is a Milestone 5 concern.

### Added

- **STATE.md frontmatter guard (write-time).** The `check-state-write` PreToolUse hook now blocks a write that puts prose into the `completed_phases` / `blockers` frontmatter fields (a raw-text, field-specific check: multi-line or over-budget `completed_phases` entries; over-budget or block-scalar `blockers[].text`). Blacklist stance — when in doubt it allows, so a legitimate write is never wedged; a cleanup edit that lands clean frontmatter always passes. Guards against the 455 KB "prose in the YAML list" failure mode observed in a dogfood project. Fires in every repo where Signal is installed; CRLF-tolerant.
- **STATE.md size banner (read-time).** `/sig:resume`, `/sig:status`, and `/sig:checkpoint` now surface an advisory banner when `STATE.md` exceeds ~150 KB — a "closed-work history is accumulating; eviction is planned for M5" nudge. Read-only, never blocks; quiet on files under budget.
- **`.planning/BUGS.md`** gains a defect register for three previously-`FUTURE-IDEAS` items (footer-drift, drain-blockquote, `/sig:add` title), now marked `fixed`, plus a pre-existing lint-tooling finding.

### Fixed

- **`/sig:plan` drain now converges.** The FUTURE-IDEAS disposition detector recognizes the `> **Promoted 2026-07-04 → …**` blockquote convention (`^`-anchored, fence-aware), so entries promoted via that convention stop resurfacing on every drain (live candidates 43 → 37).
- **`/sig:add` derived titles cut at a clause boundary** (em-dash / period / colon / comma) instead of mid-clause, with a URL guard and a minimum-length floor.
- **Hook Edit-reconstruction fidelity.** `$`-tokens (`$&`, `` $` ``, `$'`, `$$`) in an Edit's `new_string` are now inserted literally, so the write-hook judges the same content Claude Code actually writes.

## [0.1.5] — 2026-07-05 — M4.5.E10 (resume trust & capture integrity)

A trust-hardening batch shipped before external testers onboard: the `/sig:resume` briefing and the `/sig:add` capture pipe must be trustworthy. No breaking changes; no new runtime dependencies. 777 → 854 tests.

### Added

- **Origin-drift detection** — `/sig:resume`, `/sig:status`, and `/sig:checkpoint` now run a bounded, read-only `git fetch` against your own remote and surface a non-blocking banner when someone (or another machine) pushed work your `STATE.md` doesn't reflect yet. Fail-open by construction (offline / no-remote / auth-prompt / timeout → silently skipped); the fetch is hardened against auth-hangs (`GIT_TERMINAL_PROMPT=0`, SSH `BatchMode`, 2s timeout + `SIGKILL`) and writes only `.git/`, never `.planning/`.
- **Schema-drift banner** — `/sig:status` + `/sig:resume` detect when a project's `STATE.md schema_version` is behind (needs migration) or ahead (written by a newer Signal) of what the installed plugin supports, and point at the migration path. Platform-agnostic and read-only (deliberately not in the macOS-gated `/sig:doctor`), and it reports rather than crashes on an ahead-schema file.
- **STATE freshness in DISCUSS + PLAN** — both phases now refresh `STATE.md` at close (like verify/review/ship), so `/sig:resume`'s staleness banner reads fresh after them.
- **`references/hooks-api.md`** — documents all three wired hooks (their stdin/stdout/exit contracts, the cwd-vs-stdin asymmetry, fail-open convention, and the manual real-session smoke procedure).

### Fixed

- **`/sig:resume` finds Epic-prefixed plan artifacts** — a new resolver tries `{current_epic}-{ARTIFACT}.md` first, so hand-managed Epic-prefixed projects stop reporting "artifact not found" for files like `M4.5.E10-PLAN.md`. Guarded against path traversal via a crafted `current_epic`.
- **Capture pipe can't silently lose ideas** — `/sig:plan`'s FUTURE-IDEAS drain now recovers entries hidden below an unclosed code fence (with a warning), and `/sig:add` repairs a `*Last updated:` footer that has drifted mid-file (single footer at true EOF, nothing lost) and no longer mistakes a fenced footer sample for the real footer. A lint keeps Signal's own `FUTURE-IDEAS.md` clean.
- **Hardening (REVIEW)** — the origin/staleness checks now fail open on a schema-drifted or malformed `STATE.md` instead of crashing the command (both review agents caught this), and a user-editable `last_updated_commit` is validated so a crafted value can't be parsed by git as an option.

## [0.1.4] — 2026-06-06 — M4.5.E4 + M4.5.E5 (worked example + comparison page + launch assets)

### Added — worked example (M4.5.E4 Slice 1)

- **`examples/url-shortener/`** — a complete, committed `calibrate → ship` run of Signal on a small URL-shortener service, so newcomers can see what Signal produces and how the calibration router right-sizes rigor. Runnable with **zero runtime dependencies** (a plain JSON-file store — `npm install` compiles nothing, `npm test` → 39/39 on Node ≥ 22.5). The annotated README tours each `.planning/` artifact and explains why the project calibrated FULL (a published short URL is an irreversible public contract). Promoted out of the gitignored `.dogfood/` into a tracked directory so it can't silently rot.
- **`tests/example-currency.test.js`** — a guard that asserts the example stays on the current STATE/PROFILE schema (`readState(...)._schema === 1`, `readProfile(...)` valid), so a future schema change can't leave the worked example stale.

### Added — comparison page (M4.5.E4 Slice 2)

- **`docs/vs.md`** — a prose "when to reach for which" guide across the plugins Signal is built from (GSD, Agent Skills, superpowers, planning-with-files, compound-engineering), framed as a toolbox: each is excellent on its own; Signal assembles them under one roof and adds the calibration router that right-sizes rigor. Linked from the README and registered in the validator.

### Added — launch assets (M4.5.E5)

- **`docs/launch-post.md`** — the research-arc launch post: the seven-plugin landscape → Signal as a synthesis of the patterns worth keeping, plus the calibration wedge no other plugin set out to build. Leads with the landscape analysis, states v1 ports GSD + Agent Skills (the rest are v2 roadmap), and keeps the honest limits up front (0.1.x, macOS-only, sample-of-one). Registered in the validator's `REQUIRED_FILES`.
- **`docs/demo-script.md`** — a turnkey ~45–60s demo recording storyboard (`/sig:init → /sig:calibrate → /sig:status`) with the macOS + marketplace-install assumptions stated up front, so a recording shows what a peer actually experiences rather than dev-mode fallback agent names.
- **`docs/tester-brief.md`** — a peer-tester invitation with a scoped ~20-minute ask (`/sig:calibrate → /sig:discuss`, log the friction), who-to-ask criteria, the macOS-only caveat, an explicit nothing-sensitive boundary, and a copy-paste friction-log template.
- **`tests/e5-launch-assets.test.js`** — a growing guard over the launch docs: existence, the launch-post word budget, the exact privacy sentence, structural markers (friction-log template, demo assumptions, calibrate-before-status sequence), and relative-link integrity across all three docs.
- **`.planning/M4.5.E5-LAUNCH-KIT.md`** — internal launch-ops kit: the version-decision rubric, a release-notes draft, the human-handoff checklist, and the (deliberately narrow) distribution channels for a quiet peer release.

---

## [0.1.3] — 2026-05-31 — M4.5.E7 + M4.5.E3 + M4.5.E9 + M4.5.E8 + M4.5.E2 (synthesizer prose-quality + install-UX hardening + public-docs rewrite + retro foundations + install-state diagnostician + `/sig:add` force-route flags + naked-invocation interview + stranger-safety hardening + `/sig:plan` FUTURE-IDEAS drain)

### Added — `/sig:add` force-route flags (M4.5.E2 Slice 2)

- **Explicit routing flags** for `/sig:add`, on a generalized capture spine that reuses Slice 1's sensitive-data scrub + body-length check + lock + atomic write for every destination:
  - **`--question "…"`** → appends to `.planning/OPEN-QUESTIONS.md` in the file's Status/Resolve-by shape, at end-of-file (no footer to rewrite).
  - **`--milestone [N] "…"`** → appends to a `## Captured via /sig:add` holding section in a milestone file, created if absent and reused on later captures. `--milestone` (no `N`) targets the current milestone resolved from STATE.md `current_epic`; `--milestone 5` targets `MILESTONE-5.md`. It never edits the structured plan body, and never scaffolds a missing milestone file — both no-current-milestone and missing-`MILESTONE-N.md` cases fail clearly with no write.
  - **Multi-destination guard** — supplying two destination flags in one call exits non-zero with a clear message *before* any lock acquisition or write.
- Default capture (no flag) still lands in `.planning/FUTURE-IDEAS.md`. Routing is flags-only — there is no heuristic that re-routes based on input.
- New helper `tools/lib/milestones.js` — `currentMilestone` (derives the target milestone from STATE.md `current_epic`; no file-scan heuristics) + `listMilestones` (decimal-aware, so `4.5` sorts between `4` and `5`).
- `commands/add.md` Step 2 + error table + intro document `--question` / `--milestone [N]`; README command reference + first-project note updated. No new runtime dependencies.

### Added — `/sig:add` naked-invocation interview (M4.5.E2 Slice 3)

- **Naked `/sig:add`** (no arguments) now asks one plain-English question — "What's the idea?" — and files the answer to `.planning/FUTURE-IDEAS.md`. An empty/whitespace answer aborts cleanly with no file write and no `.add.lock` left behind. Quoted input (`/sig:add "text"`) stays instant — it skips the question and goes straight to FUTURE-IDEAS, even when the text ends in `?` or starts with `fix`/`bug`/`TODO`.
- **No destination heuristics.** Routing is the explicit flags (`--question`, `--milestone`) or the default FUTURE-IDEAS — nothing in between; there is no `suggestDestination`-style guesser that re-routes based on the text (Decision 5 cut the heuristic hints planned on 2026-05-14). An export-surface + source-text guard test permanently asserts this absence (FR5.4).
- *(The `/sig:plan` FUTURE-IDEAS drain landed in M4.5.E2 Slice 5 — see below.)*

### Added — `/sig:add` stranger-safety hardening (M4.5.E2 Slice 4)

- **One-time first-run onboarding note.** The first `/sig:add` in a repo reminds you that `.planning/` is tracked in git — captures become a permanent part of the project once you commit. A `.planning/.add-onboarded` marker persists the fact, so the note never shows again. Its loudness follows the project's `PROFILE.md` `gate_strictness`: `strict` → a one-time confirm; `light` (and projects with no `PROFILE.md` yet) → a single-line FYI; `off` → silent. There is no per-capture confirmation at any strictness — capture stays instant (Decision 4, Q1).
- **Brownfield-vs-greenfield missing-`.planning/` error.** When `.planning/` doesn't exist, the error now distinguishes a brownfield repo (existing code + `.git/` → suggests `/sig:init`) from a greenfield directory (suggests `/sig:new-project`), instead of a single generic message.
- **Validator vocabulary lint.** `npm run validate` now runs `checkBannedVocabulary` over `commands/add.md` and `tools/lib/add.js` (via the existing `findJargonHits` helper), failing the validate step if the pre-M4.t18 legacy term that the `Milestone` / `Epic` / `Slice` vocabulary replaced reappears — a long-term guard against vocabulary drift.

### Added — `/sig:plan` FUTURE-IDEAS drain (M4.5.E2 Slice 5 — closes the GTD loop)

- **`/sig:plan` now drains `.planning/FUTURE-IDEAS.md`** at the start of planning (a new advisory `### 1b.` step), so captured ideas no longer rot in a write-only file — capture (`/sig:add`) and clarify (the drain) are both present. The step surfaces **every un-dispositioned entry** (no date window), rendered compactly, and offers a **"defer all remaining"** batch for the first large triage. The whole step is **skippable** and never blocks planning; an empty backlog prints a one-line note and continues.
- **Four dispositions per entry** — *promote* (fold into the plan as a candidate task), *defer*, *merge*, *delete* — plus an explicit *skip*. `promote`/`defer` record the decision inline by stamping the entry's `**Status:**` line (`→ Deferred 2026-05-30 (M4.5.E2 drain).`), so a dispositioned entry never resurfaces. `merge`/`delete` remove the entry's block and require a per-entry `[confirm, keep]` confirmation **regardless of `gate_strictness`**.
- **R1 hard gate** — every disposition write is **previewed as a diff before it is written**; unlike `/sig:add`'s instant-capture hot path, a planning-time mutation of the idea database always shows the user what will change first. Writes go through a single full-file `atomicWrite`, reusing the `/sig:add` substrate.
- New helper `tools/lib/drain.js` — `parseEntries` (fence-aware top-level `## ` segmentation, tolerant of an orphaned mid-file `*Last updated:*` footer), `listDrainCandidates`, `applyDisposition` / `applyDispositions` (byte-range edits — dispositioning one entry leaves every other byte identical), and `applyDispositionToFile`. Pure Node, no new runtime dependencies.

### Added — `/sig:doctor` install-state diagnostician (M4.5.E8)

- New slash command `/sig:doctor` (15th in the suite — commands/doctor.md). Meta-command class; no tier-gating preamble, no skill loading, no agent spawning.
- macOS-only first ship (D-E8-2). Linux + WSL receive a polite stub via `checkDoctorEnvironment` with a positive-allowlist platform guard. Linux/WSL support is in flight for a follow-on Epic.
- Detects 5 documented install-state failure modes against `~/.claude/plugins/installed_plugins.json`, `~/.claude/settings.json`, and `~/.claude/plugins/cache/signal/`:
  - **P1** — stale `gitCommitSha` (cached `plugin.json` version ≠ manifest version)
  - **P2** — orphan cache version directories under `signal/sig/`
  - **P3** — `enabledPlugins["sig@signal"]` entry without matching install
  - **P4** — pre-rename `signal@signal` slug present anywhere
  - **P5** — multi-identity `~/.ssh/config` (informational only — does not change healthy status)
- All detectors are Signal-scoped (D-E8-11) — non-Signal plugin entries with state that *would* match are explicitly ignored. Detection cannot propose destructive actions against other plugins.
- Three flag modes:
  - **No flags** — read-only detection. Exit 0 (healthy) / 1 (P-states detected) / 2 (doctor errored — install state unknown) per D-E8-12.
  - **`--fix`** — generates a *surgical* shell script at `~/.claude/sig-doctor.sh` containing remediation steps only for detected P-states. Does NOT execute. User reviews, runs `bash ~/.claude/sig-doctor.sh`, then re-invokes `/sig:doctor` to verify.
  - **`--reinstall`** — generates the *full canonical clean reinstall* script regardless of starting state. Same body whether install is healthy or broken; per-step `[y/N]` prompts at execution time are the safeguard.
- Generated script discipline (D-E8-8):
  - Shebang `#!/usr/bin/env bash` (picks up Homebrew bash 5 over macOS's 3.2)
  - `set -u -o pipefail` — deliberately omits `-e` so declined `[y/N]` branches don't abort the script
  - Every mutating step wrapped in `read -p "Execute: ... [y/N]"` with `[done]` / `[skipped]` markers
  - Resolved absolute paths only — no literal `~/.claude` (D-E8-10; meta-test asserts this)
  - Preamble probes `claude --version` and surfaces the 2.1.150 minimum requirement
  - Inline `node -e` for JSON edits (no `jq` dependency; well-formedness asserted at script-gen time)
- `checkCacheCasingClash` — aborts hard with `DoctorDetectionError → exit 2` when the marketplace cache contains case-mismatched siblings (e.g. `signal/` + `Signal/`). Prevents the generated script from `rm -rf`-ing the wrong directory on case-sensitive filesystems.

### Added — `/sig:status` version-check (M4.5.E8.S3, FR6)

- `readStalenessWarning` in `tools/lib/status.js` — composes install state, detector results, and a 24h-cached `/repos/InsightRiot/signal/tags` query into a one-line banner prepended to `/sig:status` output.
- `commands/status.md` § 2.0 — Version staleness check (prepended) wires the helper.
- D-E8-7 — uses GitHub `/tags` endpoint (NOT `/releases/latest`, which 404s for Signal). Field is `name`; leading `v` stripped for compare. Hand-rolled 3-part numeric `compareVersions` (no `semver` runtime dep).
- 24h on-disk cache at `~/.claude/.sig-version-cache.json` (OQ5 lock). Cache shape: `{ fetched_at: ISO8601, data: { name: "v0.1.2" } }`. Atomic write via `tools/lib/atomic-write.js`. Invalid (parse-fail / shape-fail) treated as miss.
- Native `fetch` + `AbortSignal.timeout(5000)`. No new runtime dependencies. All failure modes (offline / 404 / empty / malformed / timeout) collapse to null — `/sig:status` prints normally without the staleness banner when the API is unreachable.
- FR6 matrix in `computeStalenessRecommendation`:
  - stale + no P-states → `Run /plugin install sig@signal`
  - stale + P-states → `Run /sig:doctor --reinstall`
  - current + P-states → `Run /sig:doctor --fix`
  - current + no P-states → silent (no banner)
  - latest unknown → silent

### Changed — `docs/install-troubleshooting.md` ownership reframe (M4.5.E8.S3.t11, FR8)

- Opens with explicit ownership statement — most documented failure modes are Claude Code plugin-host bugs, not Signal bugs.
- "Ownership at a glance" table maps each P-state to its owner (Claude Code plugin host / Signal historical / Environmental) and links the upstream issue.
- Each of 5 symptom sections now leads with a `**Owner:** ...` tag + a quickest-fix lead-in pointing at `/sig:doctor` flags. Manual fallback sequences retained for environments where `/sig:doctor` isn't available (older Claude Code, Linux, WSL).

### Filed — upstream issues (M4.5.E8.S1.t13–t14, D-E8-9)

- Cross-link in `docs/install-troubleshooting.md`:
  - **P1**: [anthropics/claude-code#56740](https://github.com/anthropics/claude-code/issues/56740) (open since 2026-05-06)
  - **P2**: [anthropics/claude-code#62497](https://github.com/anthropics/claude-code/issues/62497) (open since 2026-05-26)
- New issue filed:
  - **P3**: [anthropics/claude-code#63624](https://github.com/anthropics/claude-code/issues/63624) (filed 2026-05-29, Signal-originated)

### Test suite: 535 → 608+ (+73+, M4.5.E8)

- `tests/doctor.test.js` (+26) — 5 detector unit tests with Signal-scoped narrowing, `runAllDetectors` aggregate, 6 fixture-tree integration scenarios (healthy + 5 P-states + combined), `readInstallState` IO orchestrator, `checkDoctorEnvironment` positive-allowlist.
- `tests/doctor-script-gen.test.js` (+19) — script-content lint, inline `node -e` well-formedness, casing-clash abort, version probe, no-op-on-healthy, no-literal-`~/.claude` meta-test.
- `tests/status-version-check.test.js` (+28) — `fetchLatestTag` failure modes, cache helpers + TTL boundary, `compareVersions` table, FR6 matrix, `readStalenessWarning` orchestrator, install-troubleshooting reframe lint.

### Decisions — `.planning/DECISIONS.md` (M4.5.E8)

- **D-E8-1** through **D-E8-6** locked at DISCUSS (2026-05-24) — execution model, macOS-only first ship, interactive prompts, GitHub releases API + cache, `--fix`/`--reinstall` flag naming, NFRs N/A.
- **D-E8-7** through **D-E8-12** locked at PLAN (2026-05-28) — `/tags` endpoint, bash shebang + strictness, upstream-filing timing, `homeDir` parameter injection, Signal-scoped detector filtering, 3-level exit code.

### Deferred — `.planning/FUTURE-IDEAS.md`

- "`/sig:doctor` helper-script split" — PLAN locked an 80-char threshold for inline `node -e` payloads; S2 kept them inline (~200 chars) with a well-formedness gate. Revisit if audit complaints surface, or if a future P-state requires JSON edits more complex than "delete a key."

### Added — Retro Foundations (M4.5.E9)

- **SHIP hard-block gate** (D-E9-3, D-E9-8). Every Epic-close SHIP must produce a per-Epic `RETROSPECTIVE.md` that passes a tier-aware content validator before `/sig:ship` will write the `completed_phases: SHIP` entry. The mechanism is **layered**: (1) command-internal pre-check in `commands/ship.md` §0.5 — works in all runtimes including Cursor/Codex; (2) `PreToolUse(Edit|Write)` hook on `.planning/STATE.md` (Claude Code + Codex) — bypass-resistant at the tool layer; (3) `SessionStart(resume)` hook (Claude Code + Codex) — surfaces dirty-EXECUTE state on the next session resume, catching the original motivating failure mode (context cleared before SHIP was invoked). No `--no-retro` flag, no environment override, no extra-args trick.
- **Tier-aware retrospective templates** at `references/retrospective-template.md`. One copy-paste-able block per tier (SKETCH 3 sections, FEATURE 5, SPIKE 3, FULL 8). Section headings are exact-string locked per the validator's contract; template content scales by tier so SKETCH throwaways aren't burdened with FULL-tier ceremony.
- **6 retrospective files in `.planning/`**: M4.5.E9 (substantive dogfood from S1.t12) + backfilled stubs for E1 (partial), E2 (partial), E3, E6, E7. Backfill mechanism (`tools/backfill-retros.js`) auto-extracts artifact links + commit ranges via `git log --grep=^M4.5.E{N}` (with subject-line filter to avoid false-positives from body content) and pre-populates the Links section; reflection sections retain `[FILL IN]` markers for opportunistic completion.
- **`.planning/RETROSPECTIVES.md` index** — hand-curated hooks per Epic survive auto-regen (merged by Epic ID); reverse-chronological order; sibling links from the index file's own location.
- **`tools/lib/retrospective.js`** — exports: `parseSections`, `getRequiredSections`, `deriveRetroPath`, `loadTemplate`, `validateRetroContent`, `expectedRetroPath`, `isEpicCloseShip`, `shipFR1Check` (command-internal layer), `checkProposedStateWrite` (PreToolUse layer), `detectDirtyExecute` (SessionStart-resume layer).
- **`tools/lib/retro-index.js`** — exports: `isStubRetro`, `enumerateRetros` (path-agnostic recursive walk), `parseExistingHooks`, `renderIndex`, `regenerateIndex` (idempotent), `composeMilestoneMetaRetro`, `generateMilestoneMetaRetro` (manual trigger per A6 / FR6 downgrade).
- **`tools/backfill-retros.js`** — CLI for one-shot Epic-retro stub generation. Supports `--dry-run`, `--force`, `--milestone Mx.y`. Idempotent on re-run; refuses to overwrite edited stubs (heuristic: `[FILL IN]` count drop OR size > 2× baseline).
- **`hooks/check-state-write.js`** — Node CLI for the PreToolUse hook. Reads Claude Code hook event JSON from stdin; exits 2 + stderr block when a proposed STATE.md write would mark Epic-close SHIP without a matching retro file.
- **`hooks/warn-dirty-execute.js`** — Node CLI for the SessionStart(resume) hook. Emits an additionalContext JSON payload surfacing the gap when STATE.md shows EXECUTE for an Epic that already looks shipped per MILESTONE.md.

### Changed — `commands/ship.md` (M4.5.E9.S1.t6)

- **§0.5 FR1 retrospective pre-check** added between the §0 tier-gating preamble and the `Skill Loading` section. Documents the layered enforcement flow + the 4-step shipFR1Check integration. Fires regardless of `gate_strictness`; no bypass parameter.
- **§5 Update State** rewritten from prose ("Update `.planning/STATE.md` to reflect completion") to programmatic (`transitionPhase(baseDir, 'SHIP')` + `markFresh(baseDir, {commit: <HEAD>})`). Brings SHIP into parity with `verify.md`/`review.md`'s state-write pattern. Documents the markFresh failure-mode policy (surface but don't roll back SHIP).
- **§6 Regenerate RETROSPECTIVES.md index** added — calls `regenerateIndex(baseDir)` post-state-write on every Epic-close SHIP. Atomic-writes the new index file when content changes; idempotent no-op when unchanged.
- **§7 Manual milestone meta-retro** added — documents the optional `--milestone-meta` flag invocation that calls `generateMilestoneMetaRetro` to produce a milestone-scoped synthesis stub. Opt-in per A6 (FR6 auto-detection downgraded because MILESTONE-{N}.md has no fully-parseable close-detection schema).

### Changed — `commands/resume.md` (M4.5.E9.S2.t7)

- **Step 3c Retro completeness** added — calls `enumerateRetros(baseDir)` to build a `{total, complete, stub}` summary and passes as `retroSummary` to `renderResumeBriefing`. The briefing now surfaces one new line: `Retros:  1/6 complete (5 stubs awaiting backfill)` (or `0/0 (no retros yet)` for greenfield).

### Changed — `hooks/hooks.json` (M4.5.E9.S1.t7)

- **`PreToolUse` with `matcher: "Edit|Write"`** invoking `node hooks/check-state-write.js` — bypass-resistant layer of D-E9-8.
- **`SessionStart` with `matcher: "resume"`** invoking `node hooks/warn-dirty-execute.js` — catches the original motivating failure mode.
- **Cross-platform note:** PLAN spec called for bash wrappers; collapsed to direct Node invocation. Bash availability is platform-dependent (Windows lacks it natively); the bash→node wrapper bought no testability. Existing `session-start.sh` preserved as the default-source SessionStart handler.

### Test suite: 397 → 535 (+138, M4.5.E9)

- `tests/retrospective.test.js` (29 cases) — parsers, validator, path derivation, template loading, shipFR1Check
- `tests/retro-index.test.js` (24 cases) — enumeration, stub detection, index rendering, regen, idempotency
- `tests/retro-index-fr5.test.js` (6 cases) — AC14-17 integration
- `tests/backfill-retros.test.js` (13 cases) — Epic enumeration, commit-range scan, subject-line filter regression
- `tests/backfill-stub-gen.test.js` (13 cases) — stub composition, partial-Epic header, idempotency, edit-detection
- `tests/ship-fr1.test.js` (9 cases) — AC1, AC1-extended, AC2 (no-bypass), AC3
- `tests/hook-state-write.test.js` (11 cases) — checkProposedStateWrite + detectDirtyExecute
- `tests/milestone-meta-retro.test.js` (8 cases) — AC18, AC19, idempotency
- `tests/resume-briefing.test.js` (+5 cases) — retroSummary param

### Documented for downstream

- 5-axis code review + OWASP/ASVS audit clean. 1 Important + 3 Suggestions fixed in-phase (regex precision in `check-state-write.js`, redundant dynamic import removed, unused imports removed, `execSync` → `execFileSync` for defense-in-depth).
- PLAN deviations surfaced + resolved: (1) byte-threshold formula `150B × section_count` per PLAN vs. AC "one sentence per section passes" — resolved with 60B coefficient honoring the AC. (2) hooks spec called bash wrappers, shipped as Node CLIs.
- Items logged to FUTURE-IDEAS for next planning gate: "spec-internal consistency" PLAN-validation axis, dry-run gate as standard PLAN pattern, hook output format reference doc.



### Fixed — `/sig:init` synthesizer character-drop regression coverage

- **Character drops in synthesized `LANDSCAPE.md` + baseline `PROJECT.md`** — the 6 patterns documented in `docs/install-verification.md` § R1 (heading-boundary drops, table-cell drops, command-flag drops, sentence/code-fence boundary collapse, mid-word truncation in dense prose) are no longer reproducible. Verified by R1+ rerun on 2026-05-23 (`docs/install-verification.md` § R1+).
- The fix is two-layered: (a) a new `embedSection` helper takes the verbatim-embed of the structure-scan Source Tree out of LLM discretion entirely (eliminates patterns 3 + 4 structurally); (b) `commands/init.md` long lines split at sentence boundaries (reduces dense-generation pressure that produced patterns 5 + 6).

### Added — `embedSection` helper + regression test fixtures

- **`embedSection(content, heading)`** in `tools/lib/landscape.js` — like `extractSection`, but preserves interior content (tables, fenced code, bullets, pipe characters) verbatim. Designed for `/sig:init` Step 3's "embed verbatim" instructions — asking the LLM to copy scan content character-for-character is what produced R1's drops; the helper takes the LLM out of the loop.
- **`tests/fixtures/synthesizer-bug-r1/`** — hermetic regression fixture: `scan/` (4 scanner outputs from `expressjs/express` v5.2.1, captured 2026-05-22), `actual/` (synthetic injection of all 6 R1 patterns at documented locations), `expected/` (hand-corrected clean form), `CLASSIFICATION.md` (per-pattern Layer B vs Layer C determinism class), `README.md` (provenance + per-pattern bug→clean diff table).
- **`tests/synthesizer-regression.test.js`** (new, 15 tests) — Layer B regression tests (heading-literal preservation, round-trip via `extractSection`, sibling heading-boundary smells, `embedSection` existence + behavior, init.md template references the helper) + Layer C property tests (line-length lint, sentence-then-fence detection, h2 heading-length, double-brace detection, sibling-template coverage of `discuss.md` + `calibrate.md`).
- **`tests/helpers/template-lint.js`** (new, ~95 LOC, no deps) — `loadTemplate`, `findLongLines`, `findSentenceBeforeFence`, `findShortHeadings`, `findDoubleBraces`.
- **Test suite: 366 → 384** (366 baseline + 9 new in `synthesizer-regression.test.js` + 3 new `embedSection` units in `landscape.test.js`; some Layer C tests count as a single property test that scans all template lines).

### Changed — `commands/init.md` Step 3 wiring

- Step 3 Project structure template now calls `embedSection(scans.structure, 'Source Tree (depth-3)')` explicitly instead of asking the model to "embed the structure scan's table verbatim" — the helper guarantees character-for-character preservation.
- Step 3 Synthesis rules bullet on scanner data embedding updated to reference `embedSection` so the wiring is documented in two places (instruction + rule).
- Authoritative references list updated to include `embedSection`.
- 2 long lines (L170 at 851 chars, L404 at 562 chars) split at natural sentence boundaries to reduce dense-prose generation pressure. No content reordering; no instruction rewriting.

### Added — `docs/install-troubleshooting.md`

- **Symptom-organized install troubleshooting doc** at `docs/install-troubleshooting.md`. Strangers find their fix by searching the failure mode they see, not by reading sequentially.
- Contains: Quick Triage decision table, Canonical Clean Reinstall 4-step sequence, 5 symptom sections (P1 stale `gitCommitSha` short-circuit / P2 no-Uninstall-verb in `/plugin` UI / P3 Disabled state survives reinstall / pre-rename `signal@signal` cache orphan / SSH multi-identity cross-link to v0.1.1), Reference table for the 4 Claude Code plugin-state files, See Also pointers.
- Linked from README's existing "Troubleshooting install" section.

### Added — Privacy & telemetry posture (M4.5.E3 Slice 1)

- **README "Privacy & telemetry" section** — explicit, reader-facing claim that Signal makes no network calls beyond Claude Code's own API traffic to Anthropic; no analytics, no telemetry, no usage pings. Names the future-telemetry bar (major-version bump + opt-in + audit update).
- **`tools/audit-network-calls.js`** — reproducible audit script. Greps `tools/`, `skills/`, `agents/`, `commands/` for 6 network-call patterns (`fetch(`, bare `axios`/`node-fetch`, `http.request`, `require`/`import` of `http`/`https`/`node-fetch`/`axios`/`got`, `child_process` shelling to `curl`/`wget`). Default scope excludes `node_modules`, `tests`, `.planning`, `analysis`, and Markdown. Optional positional arg overrides scope (used by the test fixture). Exit 0 clean / exit 1 + per-hit path on violations. Covers Signal's source, not transitive deps.
- **`tests/audit-network-calls.test.js`** — 3-test vitest wrapper: existence + executable bit, exit-0 against current repo, exit-1 + violation path against a seeded `fetch(...)` fixture under `tests/fixtures/audit-network-calls-seeded/`.
- **Test suite: 384 → 387** (3 new audit-script tests).

### Added — `references/facts.md` (M4.5.E3 Slice 2)

- **Canonical source-of-truth file** for facts cross-cited in `README.md` and `SECURITY.md` (Node.js version, Claude Code version, OS posture, dependency counts, test count, license, repo URL). The cross-file consistency test (below) asserts that doc citations match this file. Update HERE first; the tests catch drift in the doc that cite the values.

### Added — `SECURITY.md` (M4.5.E3 Slice 2)

- **Standard-shape security policy** at repo root: `# Security Policy` H1, Supported Versions table (latest 0.1.x supported, prior patches not), Reporting a Vulnerability (GitHub private advisory preferred, `brett@insightriot.com` backup), Disclosure (fixes noted in CHANGELOG against the version that carries them), Scope (explicit IN: plugin source + validator + CLI helpers; explicit OUT: Claude Code → Anthropic, your project's code, transitive npm deps → upstream).
- **Zero Signal workflow vocabulary** — no Tier, Phase, Slice, Wave, Epic, Milestone, no `/sig:*` references. Enforced by the consistency suite's jargon-lint test.
- README footer now carries a `## Security` line pointing at the file, alongside `## License`.

### Added — `tests/cross-file-consistency.test.js` (M4.5.E3 Slice 2)

- **9-assertion vitest suite** + a `facts.md` parse preamble = 10 test blocks total. Asserts: Node version + Claude Code version cited in README match `references/facts.md`; vacuous-pass on test-count and dep-count mentions (only enforces if a doc cites a value); SECURITY.md contains no Signal workflow vocabulary; README has the four anchor sections (`## Privacy & telemetry`, `### Requirements & compatibility`, `docs/map/index.html` link, `## Open Source Origins` with 9 source-repo URLs).
- New `findJargonHits(content, regex)` helper in `tests/helpers/template-lint.js` — line-level finder for the jargon-lint test, reusable for any future "this doc must avoid these terms" assertion.

### Changed — `README.md` (M4.5.E3 Slices 1 + 2)

- **`## Privacy & telemetry` section** (Slice 1) — between the `.planning/` git-tracking section and the command reference; names the no-network claim, hands the reader the audit command, and names the bar for any future telemetry.
- **Nested `### Requirements & compatibility` table** (Slice 2) inside `## Install`, replacing the inline `**Requirements:**` prose line. Four rows: Node.js 22+, Claude Code 2.1.141+, OS (macOS verified, Linux/WSL untested + link to `docs/install-verification.md`), Git.
- **`docs/map/index.html` link** (Slice 2) under the `## Your first project` heading as a one-line visual companion pointer.
- **`## Open Source Origins` section** (Slice 2) — rewrites the prior `## Credits & Heritage` section with a gratitude-framed intro and warmer subsection labels (Directly ported / Inspiration for v2 / Patterns borrowed / Bridge references / Signal's own contribution). All 9 source-repo URLs + 1-line acknowledgments preserved verbatim; `LICENSES.md` cross-link retained.
- **`## Security` footer** (Slice 2) alongside `## License`, pointing at the new `SECURITY.md`.
- **Test-count drift cleanup** — `npm test` example line updated from "380+ tests should pass" to "397 tests should pass" (matches `references/facts.md`).

### Test suite: 387 → 397 (M4.5.E3)

- +10 from `tests/cross-file-consistency.test.js` (9 named assertions + 1 parse preamble). Plan-time forecast was 396 ± 1; landed within tolerance.

## [0.1.2] — 2026-05-18 — M4.5.E6 (resume reliability)

### Added — `STATE.md` schema_version 1 + auto-update protocol + `/sig:checkpoint`

- **YAML-frontmatter `STATE.md` schema** (`schema_version: 1`) replacing the previous freeform-markdown shape. Structured fields: `phase`, `current_epic`, `current_wave`, `current_tasks[]`, `completed_phases[]`, `blockers[]`, `last_decision_at`, `last_updated_commit`, `last_updated`, `last_completed_task`. Body below the frontmatter remains freeform human-readable narrative. Spec: `references/state-schema.md`.
- **`/sig:checkpoint`** (new slash command) — manual state-refresh ritual with two modes:
  - Default (quick): diffs git log since `last_updated_commit` against `STATE.md`, proposes a refreshed state, confirms-and-writes per `gate_strictness`.
  - `--context`: same plus prompts for decisions + open questions; dual-writes decisions to `CONTEXT.md` § Locked Decisions AND `DECISIONS.md` (D16); appends questions to `OPEN-QUESTIONS.md`. Use before any planned context-clear.
- **Auto-state-protocol in `/sig:execute`** — `dispatchTaskWithState` wraps each task: `setCurrentTask` before agent dispatch, `clearCurrentTask({status, commit})` after. SKETCH tier opts out entirely (manual `/sig:checkpoint` only). FEATURE/SPIKE under `gate_strictness: light` (state-write failures warn + continue); FULL under `strict` (state-write failures halt the dispatch). D9.
- **Staleness banner + orphan-prompt UI in `/sig:resume`** — banner prepends when `isStateStale` reports commits-behind on D6 state-affecting paths. Orphan-detection prompt fires before briefing render if any `current_tasks[]` entry has aged past the threshold (default 30 min) with no matching commit. D11 + D12.
- **`markFresh` calls in `/sig:verify` + `/sig:review`** — phase-end refresh of `last_updated` / `last_updated_commit`. Failure under strict surfaces but does NOT halt phase exit (the work is already done).
- New helpers in `tools/lib/state.js`: `parseFrontmatter`, `stringifyFrontmatter`, `StateSchemaError`, `StateWriteError`, `upgradeStateFile`, `setCurrentTask`, `clearCurrentTask`, `getCurrentTasks`, `detectOrphans`, `isStateStale`, `addBlocker`, `clearBlocker`, `touchDecisionTimestamp`, `markFresh`.
- New modules: `tools/lib/atomic-write.js` (extracted from `add.js`), `tools/lib/file-lock.js` (extracted from `add.js`, parameterized for state.js's 5s TTL), `tools/lib/checkpoint.js`, `tools/lib/execute.js`, `tools/lib/resume.js` (with `renderResumeBriefing` + `handleOrphansAtResume`).
- `tools/validate-plugin.js` — `commands/checkpoint.md` is now a required artifact.
- New docs: `references/state-schema.md` (canonical schema reference), `docs/migration-state-schema-v0.1.x.md` (downstream user-facing migration guide).
- New test files (12): `atomic-write.test.js`, `file-lock.test.js`, `state-schema.test.js`, `current-tasks.test.js`, `detect-orphans.test.js`, `is-state-stale.test.js`, `blockers.test.js`, `append-decision-mark-fresh.test.js`, `checkpoint.test.js`, `dispatch-task-with-state.test.js`, `resume-briefing.test.js`, `state-end-to-end.test.js`. **Total tests: 225 → 366** (post-S6 final).

### Changed — `[BREAKING]` `STATE.md` shape

- `[BREAKING]` `STATE.md` now uses YAML frontmatter as the authoritative machine-readable state. **Auto-migrated on first write** to a legacy STATE.md (no user action required); original content preserved verbatim under an HTML comment marker so the freeform narrative remains accessible. Strict three-way detection (D14): legacy → auto-upgrade; `schema_version: 1` → parse normally; unknown version → fail closed with `StateSchemaError`; frontmatter without `schema_version` → refuse to auto-upgrade. Migration policy: `docs/migration-state-schema-v0.1.x.md`.
- `commands/status.md` § 2.3 — blocker section reads from `state.blockers` via `readState` instead of an inline STATE.md regex.

### Fixed

- `isStateStale` short-circuits via HEAD-hash compare (S6.t3, replacing the original 60s wall-clock grace window per REVIEW IMPORTANT-4). Same optimization intent — skip the git log when the state-baseline commit is HEAD — no clock-skew dependency. `/sig:checkpoint`'s `bypassGrace: true` opts out of the short-circuit AND the rev-parse so explicit "what changed?" requests always hit git log.
- `captureCheckpointContext` scrubs sensitive data **before** any write (S6.t1, REVIEW IMPORTANT-1 + IMPORTANT-5). New `acknowledgeSensitive` opt; default behavior refuses to mutate any file when hits are detected, returning `{wrote: [], sensitiveHits, aborted: 'sensitive-data-pending'}` so the caller can prompt the user. Matches the precedent established by `tools/lib/add.js`. `commands/checkpoint.md` § 7 updated; fictional rollback paragraph dropped.
- `dispatchTaskWithState` protects the success path from post-dispatch state-write failures (S6.t2, REVIEW IMPORTANT-2). A blip in `clearCurrentTask({done})` after a successful task is now logged to stderr and the dispatch result returned — instead of re-thrown as if the task failed. The orphan detector clears the residual entry on next run.

### Changed — public API rename

- `tools/lib/state.js` exports `touchDecisionTimestamp` (renamed from `appendDecision` in S6.t4 per REVIEW IMPORTANT-3). The original name implied an append-to-list operation matching `addBlocker`/`clearBlocker`, but there is no `decisions[]` field — the function only refreshes the `last_decision_at` scalar. The rename is pre-publish (`appendDecision` was never released).

### Notes

- M4.5.E6 closes the "post-context-clear re-orientation" gap that motivated the milestone. `/sig:resume` is now an unambiguous validated picture of where the user left off — even after a full context-clear mid-EXECUTE. The 280-line manual re-entry protocol previously hand-maintained at the top of Signal's own `STATE.md` is no longer the recovery path; the schema + briefing + checkpoint command together replace it.
- AC#8 dogfood (real context-clear during E6 EXECUTE) verified in `M4.5.E6-VERIFICATION.md` § 8.
- REVIEW loop-back (path B): the original review pass surfaced 5 Important findings that were resolved via S6 (5 tasks, ~240 LOC, +5 tests). Re-VERIFY + re-REVIEW appendices in `M4.5.E6-VERIFICATION.md` § 12 and `M4.5.E6-REVIEW.md`. Verdict: PASS.

---

## [0.1.1] — 2026-05-15

### Fixed

- **Marketplace install no longer requires SSH access to GitHub.** Changed `.claude-plugin/marketplace.json` `source` block from `{"source": "github", "repo": "InsightRiot/signal"}` to `{"source": "url", "url": "https://github.com/InsightRiot/signal.git", "ref": "v0.1.1", "sha": <pinned>}`. The previous `"github"` shorthand resolved to SSH (`git@github.com:`) which fails on machines with multi-identity SSH configs, `IdentitiesOnly yes` hardening, or corporate firewalls blocking port 22. Anthropic's own `claude-plugins-official` catalog uses the `"url"` form for ~40% of its plugins; Signal now matches that convention. Closes the original v0.1.0 stranger-install break (issue surfaced 2026-05-15 on the maintainer's business machine; same class as anthropics/claude-code #47088, #29722, #52234).

- **Stale `/plugin install signal` bare-slug reference in README removed** (artifact of pre-M4.t19 slug rename).

### Added

- `README.md` — install section now documents the correct 3-line install (`/plugin marketplace add ... → /plugin install sig@signal → /reload-plugins`) and a Troubleshooting subsection naming the `CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` env var (Claude Code 2.1.141+) as a stopgap workaround for any user hitting SSH-config friction with other plugins.
- `CHANGELOG.md` (this file) — first formal release history. v0.1.0 entry written retroactively.
- `tools/validate-plugin.js` — enforces `plugin.json.version` is semver-shaped (`MAJOR.MINOR.PATCH`). Future version-format drift caught at validate time.
- `tests/install-contract.test.js` (new) — guards marketplace.json shape and plugin.json version contract.
- `tests/readme-content.test.js` (new) — smoke-tests the README install section so future edits can't silently re-introduce stale install instructions.

### Notes

- M4.5.E1 Slice 1 of 5. Slices 2–5 (F2 agent-registration resolution, fresh-machine verification matrix, versioning policy, validator hardening) follow in subsequent v0.1.x patches.

---

## [0.1.0] — 2026-05-12

Initial public release. Marketplace-installable from `InsightRiot/signal` via Claude Code's plugin system.

### Added

- **`/sig:*` command surface** — 12 slash commands wiring Signal's 6-phase workflow plus calibration + status meta-commands: `/sig:new-project`, `/sig:init`, `/sig:calibrate`, `/sig:discuss`, `/sig:plan`, `/sig:execute`, `/sig:verify`, `/sig:review`, `/sig:ship`, `/sig:escalate`, `/sig:status`, `/sig:resume`. (Note: `/sig:add` shipped as the 13th command in M4.5.E2 Slice 1 on 2026-05-14, pre-v0.1.0-tag — included in v0.1.0 marketplace state.)
- **Calibration router** — `/sig:calibrate` asks 5 diagnostic questions and writes `.planning/PROFILE.md`. Every downstream phase command reads `PROFILE.md` first; tier (SKETCH / FEATURE / SPIKE / FULL) gates rigor.
- **Brownfield onboarding** — `/sig:init` scans an existing repo and produces `.planning/LANDSCAPE.md` + a baseline `PROJECT.md` with `[INFERRED]` / `[FILL IN]` markers, then hands off to calibrate.
- **22+ agents** under `agents/` (scanners, specialists, verifiers, executors, planners, researchers, support).
- **21 skills** bound to phases via `state/config.json`, loaded on-demand to preserve context budget.
- **Validator** (`tools/validate-plugin.js`) — enforces required files, commands, agents, plugin.json shape, `plugin.json.name === "sig"`.
- **209 tests** (vitest) — covering `tools/lib/{profile,state,context-monitor,status,landscape,walkthrough,add}.js` + init fixtures.
- **`hooks/session-start.sh`** — surfaces project state at session start when a `.planning/` directory is present in cwd.

### Changed — `[BREAKING]`

- **Plugin slug renamed `signal` → `sig`** (M4.t19, 2026-05-12). The slash-command namespace derives from `plugin.json.name`; `signal` would have rendered as `/signal:sig:command` (double-stutter). Brand "Signal" preserved everywhere user-facing; only the internal plugin slug changed.
- **Commands relocated from `.claude/commands/sig/*.md` → `commands/*.md`** (M4.t19). Marketplace install discovers commands at `<plugin-root>/commands/`; the nested location broke auto-discovery on stranger installs.
- **Vocabulary refactor** `Tranche` → `Milestone` with new `Epic` mid-layer (M4.t18, 2026-05-12). Affects `.planning/*` file names (`TRANCHE-N.md` → `MILESTONE-N.md`) and any downstream-project usage. Migration prompt at `docs/migration-vocab-v0.1.0.md`.

### Known limitations at v0.1.0

- **F2 (agent auto-registration post-marketplace-install)** — `commands/init.md` Step 2 has a documented fallback path; resolution gates v0.1.x patch work (see M4.5 Epic 1).
- **Stranger-install on multi-identity SSH machines** — discovered 2026-05-15; fixed in v0.1.1 (see above).

---

[0.1.4]: https://github.com/InsightRiot/signal/releases/tag/v0.1.4
[0.1.1]: https://github.com/InsightRiot/signal/releases/tag/v0.1.1
[0.1.0]: https://github.com/InsightRiot/signal/releases/tag/v0.1.0
