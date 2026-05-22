# Quality Scan

## Test Runners

| Runner | Version | Config | Test File Count |
|---|---|---|---|
| Mocha | ^11.7.5 (devDep in package.json) | `package.json` `scripts.test` invokes `mocha --require test/support/env --reporter spec --check-leaks test/ test/acceptance/` (no dedicated `.mocharc.*`) | 91 `.js` files under `test/` (per `git ls-files 'test/*.js'`) |
| nyc (coverage wrapper, not a runner itself) | ^17.1.0 (devDep) | `package.json` `scripts.test-ci` / `test-cov` — `nyc --exclude examples --exclude test --exclude benchmarks ... npm test` | n/a |

No `.mocharc.js`/`.mocharc.json`/`.mocharc.yml` found; Mocha is configured purely via CLI flags in the `scripts.test` entry of `package.json`. Test bootstrap is `test/support/env.js` (loaded via `--require`).

## CI Configuration

- **Platform(s):** GitHub Actions
- **Workflow files:**
  - `.github/workflows/ci.yml`
  - `.github/workflows/codeql.yml`
  - `.github/workflows/legacy.yml`
  - `.github/workflows/scorecard.yml`
  - (companion: `.github/dependabot.yml` — dependency-update bot, not a CI workflow)
- **CI runs tests:** yes — `.github/workflows/ci.yml` line 80: `run: npm run test-ci` (which invokes `nyc ... npm test` → Mocha). Lint is a separate `lint` job (line 42: `run: npm run lint`). Coverage is merged + uploaded to Coveralls in a downstream `coverage` job. `.github/workflows/legacy.yml` runs the same `npm run test-ci` on Node 16/17. CodeQL and Scorecard workflows perform security scanning, not unit tests.
- **CI runs on PRs:** yes — `ci.yml` line 13 (`pull_request:`), `legacy.yml` line 13, `codeql.yml` line 17.
- **CI test matrix:** Node `[18, 19, 20, 21, 22, 23, 24, 25, 26]` × `[ubuntu-latest, windows-latest]` in `ci.yml`; Node `[16, 17]` × same OS pair in `legacy.yml`. Lint job runs once on `lts/*`.

## Lint / Format Tooling

| Tool | Config | Notes |
|---|---|---|
| ESLint | `.eslintrc.yml` (+ `.eslintignore`) | Legacy `.eslintrc.yml` flat-rules format; `root: true`, `env: { es2022, node }`. Pinned rules only — `eol-last`, `eqeqeq` (allow-null), 2-space `indent` (with `MemberExpression: off`, `SwitchCase: 1`), `no-trailing-spaces`, `no-unused-vars` (args ignored), and a `no-restricted-globals` rule that forbids `Buffer` in favor of `import { Buffer } from "node:buffer"`. Pinned at `eslint 8.47.0` (pre-flat-config). `.eslintignore` excludes `coverage` and `node_modules`. |
| EditorConfig | `.editorconfig` | UTF-8, `insert_final_newline`, `trim_trailing_whitespace` globally; `.js`/`.json`/`.yml` set to 2-space indent. |

No Prettier, Biome, TypeScript, or type-checker config detected. No `prettier`/`tsc`/`biome` dev dependencies in `package.json`. The codebase is plain JavaScript (Node, `engines: ">= 18"`).

## README

- **Path:** `Readme.md` (note: lowercase-d filename)
- **Size:** 278 lines
- **Sections present:** Table of contents, Installation, Features, Docs & Community, Quick Start, Philosophy, Examples, Contributing (incl. "Security Issues" + "Running Tests" subheads), Current project team members (incl. TC, Triagers + emeriti subheads), License. README covers Installation, Quickstart, Contributing, and License — but no explicit "Usage" heading (Usage content lives inside the "Quick Start" code block).
- **First 30 lines:**

```
[![Express Logo](https://i.cloudup.com/zfY6lL7eFa-3000x3000.png)](https://expressjs.com/)

**Fast, unopinionated, minimalist web framework for [Node.js](https://nodejs.org).**

**This project has a [Code of Conduct].**

## Table of contents

- [Table of contents](#table-of-contents)
- [Installation](#installation)
- [Features](#features)
- [Docs \& Community](#docs--community)
- [Quick Start](#quick-start)
- [Philosophy](#philosophy)
- [Examples](#examples)
- [Contributing](#contributing)
  - [Security Issues](#security-issues)
  - [Running Tests](#running-tests)
- [Current project team members](#current-project-team-members)
  - [TC (Technical Committee)](#tc-technical-committee)
    - [TC emeriti members](#tc-emeriti-members)
  - [Triagers](#triagers)
    - [Emeritus Triagers](#emeritus-triagers)
- [License](#license)


[![NPM Version][npm-version-image]][npm-url]
[![NPM Downloads][npm-downloads-image]][npm-downloads-url]
[![Linux Build][github-actions-ci-image]][github-actions-ci-url]
[![Test Coverage][coveralls-image]][coveralls-url]
```

## CHANGELOG

- **Path:** `History.md` (3,887 lines)
- **Last updated:** 2026-05-17 (4 days ago, per `git log -1 --format='%aI' -- History.md`)
- **Latest declared version:** `5.2.1 / 2025-12-01` (top of file is a `# Unreleased Changes` section; first dated/versioned heading underneath is `5.2.1`). Subsequent entries: `5.2.0 / 2025-12-01`, `5.1.0 / 2025-03-31`, `5.0.1 / 2024-10-08`, `5.0.0 / 2024-09-10`.
- **Freshness:** fresh (< 90d)
- **Format:** Not strictly Keep-a-Changelog; uses `<version> / <date>` heading lines with bulleted change descriptions. Active "Unreleased Changes" section at the top, which is conventional and a positive signal.

## Open Work Signals

- **TODO/FIXME/HACK count:** 0 (zero) tracked-source matches for `git grep -nE '(TODO|FIXME|HACK|XXX)' -- ':!*.lock' ':!*.min.*' ':!History.md' ':!Readme.md' ':!.planning/*'`
- **Top files by marker count:** (none)
- **Sample markers:** (none)

No TODO/FIXME/HACK/XXX markers found in tracked source. (Excluded from the grep: lockfiles, minified files, `History.md`, `Readme.md`, and the `.planning/` scan workspace.)

## License

- **Detected:** MIT
- **Source:** `LICENSE` (first line: `(The MIT License)`) and corroborated by `package.json` `"license": "MIT"`.

## Notes

- **Test runner is configured via npm script, not a dedicated config file.** `package.json scripts.test` carries the Mocha CLI invocation directly (`mocha --require test/support/env --reporter spec --check-leaks test/ test/acceptance/`). There is no `.mocharc.*` file. This is a valid, if older-style, Mocha setup — it works, but it means changing test config requires editing `package.json` rather than a dedicated file.
- **Coverage tooling (`nyc`) exists but is invoked only via `test-ci` / `test-cov` scripts**, not from the default `npm test`. CI uses `npm run test-ci`, so coverage IS collected on PRs and uploaded to Coveralls.
- **CI matrix is unusually broad** — Node 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26 across Ubuntu + Windows (two workflows, `ci.yml` + `legacy.yml`). 22 OS×version combos per push. Lint is gated separately on `lts/*`.
- **Security-scanning workflows present:** GitHub CodeQL (JavaScript + Actions analysis, weekly cron + PRs to master) and OSSF Scorecard (supply-chain checks, weekly cron + push to master). Both upload SARIF to the GitHub code-scanning dashboard.
- **`.npmrc` enforces supply-chain hygiene:** `min-release-age=7` (rejects deps published in the last 7 days), `ignore-scripts=true` (blocks postinstall script execution), `allow-git=none`, `package-lock=false`. This is a deliberate posture against malicious-package attacks.
- **ESLint pin is dated.** `eslint 8.47.0` (released Aug 2023, pre-flat-config). The repo uses `.eslintrc.yml` rather than the newer `eslint.config.js` flat config format — consistent with the pinned 8.x version but a future migration risk when the project moves to ESLint 9+.
- **Tooling absences worth flagging for synthesizer:** no Prettier, no TypeScript, no type-checker (mypy/pyright/tsc), no formatter beyond ESLint's own indent/whitespace rules. Code style is enforced via a tight ESLint rule set + EditorConfig, not via a separate formatter.

## Detection Failures

- (none)
