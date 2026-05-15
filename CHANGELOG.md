# Changelog

All notable changes to Signal are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) — pre-1.0 (`0.x.y`) allows breaking changes at `x` bumps; see `docs/versioning.md` (shipping in M4.5.E1 Slice 4) for the full policy.

`[BREAKING]` tags mark entries that change user-visible behavior, slash-command surface, plugin manifest shape, or `.planning/` schema.

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
