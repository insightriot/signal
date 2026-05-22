# Landscape

## What this project is

Express is a Node.js web framework written primarily in JavaScript (141 files, ~21,346 LOC, 66.2% of tracked source). The repository **is** the Express framework itself (declared name `express` at version `5.2.1` in `package.json`), not a downstream application that uses Express. `[INFERRED — high confidence]`: the README states this directly — *"Fast, unopinionated, minimalist web framework for Node.js."* Activity classification reads `active` (last commit 4 days ago) but the clone is shallow (`--depth=1`), so cadence/contributor/age signals are not representative of the upstream project; treat them as placeholders until a full clone is run.

## Tech stack

- **Languages:** JavaScript (66.2%), EJS templates (9.4%), Plain text (4.7%), HTML (3.8%), Tmpl templates (3.3%). Total tracked source files: 213.
- **Frameworks:** Express 5.2.1 (this repository is the framework itself).
- **Test runner:** Mocha ^11.7.5 (configured via `package.json scripts.test`, no `.mocharc.*` file); coverage via nyc ^17.1.0.
- **CI:** GitHub Actions runs tests on PRs: yes (4 workflows — `ci.yml`, `legacy.yml`, `codeql.yml`, `scorecard.yml`).
- **Container / deployment:** (none detected — pure library, no Dockerfile, no edge/serverless config).

## Project structure

Single-repo project. No monorepo workspace tooling detected (no `workspaces` in `package.json`; no `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`, or `rush.json`).

Source root: `lib/` (chosen because: `lib/` exists at the repo root and contains 6 `.js` files; `package.json`'s `files` array publishes `lib/`; convention for Node libraries)

| Path | Annotation |
|---|---|
| is | Top-level entry (224 bytes) — shim that re-exports from `./lib/express`. |
| `lib/` | Library source — 6 `.js` files, flat (no subdirectories): `application.js` (14KB), `express.js` (1.6KB — package entry), `request.js` (12KB), `response.js` (25KB), `utils.js` (5.3KB), `view.js` (3.8KB). Module boundaries are file-per-concern. |

(All 1 of 1 subdirectory shown; `lib/` has no nested directories.)

## Activity signals

- **Last commit:** 2026-05-17 (4 days ago) — `(shallow clone — earliest visible commit, not necessarily latest upstream)`
- **Project age:** 4 days *(shallow clone — not representative; expressjs/express dates to 2009)*
- **Cadence (90 days):** 1 commit, ~0.08/week *(shallow — not representative)*
- **Active contributors (90 days):** 1 — `dependabot[bot]` *(shallow — not representative; sole visible author is a bot, an artifact of the shallow clone landing on a dependency-bump commit)*
- **Hot files:** (insufficient activity — shallow clone shows 20+ files all tied at 1 commit; no real churn ranking).
- **Health:** active (Rule 4 fired on recency; **strong caveat** — neither rule-3 nor rule-4 can be evaluated faithfully from a `--depth=1` clone. Caveat: the cadence numbers above reflect a single visible commit and are not real cadence).git fetch --unshallow` and re-run for a representative classification.

## Test surface

- **Test runner:** Mocha ^11.7.5 — invoked via `mocha --require test/support/env --reporter spec --checkt/ test/acceptance/` (from `package.json scripts.test`).
- **Tests detected:** tests in dedicated directory (`test/`, 111 files: 88 `.js` test files outside fixtures/support + 20 fixtures + 3 support helpers). Tests mirror the source API surface 1:1 (`app.use.js` tests `app.use`, etc.) rather than using `.test.js`/`.spec.js` suffix.
- **CI runs tests:** yes (`.github/workflows/ci.yml` runs `npm run test-ci` across Node 18–26 × Ubuntu/Windows; `legacy.yml` covers Node 16/17).
- **Coverage tooling:** nyc ^17.1.0 + Coveralls (invoked via `test-ci` / `test-cov` npm scripts; CI uses `test-ci`, so coverage IS collected on PRs).

## Open work signals

- **TODO/FIXME/HACK count:** 0 (zero) tracked-source matches.
- **Top files by marker:** (none — no markers detected).
- **CHANGELOG state:** fresh (< 90d) — `History.md` last touched 2026-05-17; latest declared version `5.2.1 / 2025-12-01`. Active "Unreleased Changes" section at the top.
- **License:** MIT (`LICENSE` first line `(The MIT License)`; agrees with `package.json` `"license": "MIT"`).

## Ierred goals & uncertainties

**INFERRED — please verify before relying on:**
- This repository is the **Express framework itself** (not a project consuming Express). Sources: `package.json` name `express`, `lib/{application,express,request,response,utils,view}.js`, README first paragraph, History.md as de-facto changelog. Confidence: **high**.
- Active maintenance posture, with deliberate supply-chain hygiene. Sources: `.npmrc` settings (`min-release-age=7`, `ignore-scripts=true`, `allow-git=none`, `package-lock=false`), CodeQL + OSSF Scorecard CI workflows, broad Node 16–26 × Ubuntu/Windows test matrix, dependabot enabled. Confidence: **high**.
- Stable / mature codebase rather than greenfield. Sources: 3,887-line `History.md` reaching back to early versions, minimalist 6-file `lib/` layout that has barely grown across major versions. Confidence: **high**.

**Open questions for the user:**
- Why is this clone shallow (`--depth=1`)? The activity scanner could not produce representative cadence, contributor, or hot-file signals because of it.
- Is this clone a **scratchpad for fixture capture**, or are you actually planning Signal work on `expressjs/express` upstream?
- The README references "Current project team members" sections — is the **team / governance model** something you'd like reflected in Constraints, or out-of-scope?

## Last Updated

2026-05-21
