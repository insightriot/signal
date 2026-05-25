# Changelog

All notable changes to Signal are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — pre-1.0 (`0.x.y`) allows breaking changes at `x` bumps; see `docs/versioning.md` (shipping in M4.5.E1 Slice 4) for the full policy.

`[BREAKING]` tags mark entries that change user-visible behavior, slash-command surface, plugin manifest shape, or `.planning/` schema.

---

## [0.1.3] — Unreleased — M4.5.E7 + M4.5.E3 (synthesizer prose-quality + install-UX hardening + public-docs rewrite)

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

[0.1.1]: https://github.com/InsightRiot/signal/releases/tag/v0.1.1
[0.1.0]: https://github.com/InsightRiot/signal/releases/tag/v0.1.0
