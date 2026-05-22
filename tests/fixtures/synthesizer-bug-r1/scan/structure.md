# Structure Scan

## Top-Level Inventory

### Source-shaped directories
- `lib/`

### Test-shaped directories
- `test/` — 111 files total (.js sources + fixtures); 70 `.js` files at `test/*.js`

### Doc-shaped directories
- (none)

### CI / tooling
- `.github/` — `dependabot.yml` + `workflows/` (ci.yml, codeql.yml, legacy.yml, scorecard.yml)

### Standard project files
- Present: `Readme.md` (note: capitalized `R`, not `README.md`), `LICENSE`, `History.md` (de-facto changelog), `.gitignore`, `.editorconfig`, `.npmrc`, `.eslintignore`, `.eslintrc.yml`, `package.json`
- Absent and notable: no `CHANGELOG.md` (changes recorded in `History.md` instead), no `CONTRIBUTING.md`, no `CODE_OF_CONDUCT.md`, no `.nvmrc` / `.tool-versions` / `.python-version`, no `.env.example`, no lockfile committed (`package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` absent — likely `.gitignore`d per library convention)

### Other top-level entries
- `index.js` — repo-root entrypoint (224 bytes; re-exports from `lib/`)
- `examples/` — 25 example sub-applications (auth, content-negotiation, cookies, downloads, ejs, error-pages, hello-world, markdown, multi-router, mvc, online, params, resource, route-map, route-middleware, route-separation, search, session, static-files, vhost, view-constructor, view-locals, web-service, error, cookie-sessions). Top-level `examples/README.md` lists them.
- `.planning/` — pre-existing directory (contains `scan/` only at this scan time; this is the brownfield-onboarding workspace)

## Monorepo Detection

- **Type:** single-repo
- **Workspace tool:** (none — `package.json` has no `workspaces` key; no `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`, or `rush.json`)
- **Sub-package count:** N/A
- **Sub-packages:** N/A

## Source Tree (depth-3)

Source root: `lib/` (chosen because: `lib/` exists at the repo root and contains 6 `.js` files; `package.json`'s `files` array publishes `lib/`; convention for Node libraries)

| Path | Annotation |
|---|---|
| `lib/` | Library source — 6 `.js` files, flat (no subdirectories): `application.js` (14KB), `express.js` (1.6KB — package entry), `request.js` (12KB), `response.js` (25KB), `utils.js` (5.3KB), `view.js` (3.8KB). Module boundaries are file-per-concern. |

(All 1 of 1 subdirectory shown; `lib/` has no nested directories.)

Note: `index.js` at the repo root is a 224-byte shim that requires `./lib/express`. The actual source surface is the 6 files inside `lib/`.

## Test Surface (organizational view)

- **Dedicated directories:** `test/` — file count: 111 (88 `.js` test files outside fixtures/support + 20 fixture files + 3 support helpers). Subdirectories: `test/acceptance/` (18 `.js` files, one per example app), `test/fixtures/` (20 files: templates, blog/, pets/, users/, default_layout/, local_layout/, snow ☃/), `test/support/` (3 files: `env.js`, `tmpl.js`, `utils.js`). Top-level `test/*.js` files include `Route.js`, `Router.js`, `app.*.js` (16 files), `express.*.js` (5 files: json/raw/static/text/urlencoded), `req.*.js` (23 files), `res.*.js` (27 files), `config.js`, `exports.js`, `middleware.basic.js`, `regression.js`, `utils.js`.
- **Co-located with source:** 0 files (no `.test.js` / `.spec.js` files in `lib/` or anywhere outside `test/`)
- **By-name total:** 111 files matched test directory + by-name patterns (all under `test/`)
- **Net assessment:** tests in dedicated directory

Naming convention note: test files mirror the source surface they exercise (`app.use.js` tests `app.use`, `req.is.js` tests `req.is`, etc.) rather than using a `.test.js` / `.spec.js` suffix. This is why a naive by-name grep returns 0 hits outside `test/` even though the directory is full of tests.

## Documentation Surface

- **Dedicated directory:** (none)
- **Tooling:** (none — plain markdown, no Docusaurus / MkDocs / mdBook / VitePress / GitBook / Sphinx config detected)
- **README size:** 278 lines (`Readme.md` — note non-standard capitalization)
- **Other docs:** `History.md` (3887 lines — extensive changelog dating back to early versions); `examples/README.md` (lists/describes the 25 example apps). No `CONTRIBUTING.md`, no `CODE_OF_CONDUCT.md`, no `SECURITY.md` at top level.

## Notes

- Flat `lib/` layout: 6 files, no subdirectories. Unusual for a project of this scope (5.2.1); reflects Express's long-standing minimalism — the file count has barely grown across major versions.
- Test directory mirrors source API surface 1:1 (one test file per public method/property). Conventions: `app.*.js`, `req.*.js`, `res.*.js`, `express.*.js`, plus capitalized `Route.js` / `Router.js` for the two main constructors.
- `examples/` is sizable (25 sub-apps) and each example has a corresponding acceptance test in `test/acceptance/` — examples are exercised by CI, not just docs.
- Non-standard `Readme.md` capitalization (rather than `README.md`) — long-standing in this repo.
- No committed lockfile — typical for a library (not application) `package.json`; `.gitignore` likely excludes it.
- `History.md` serves the changelog role; no separate `CHANGELOG.md`.
- `.planning/` directory was pre-created with an empty `scan/` subdirectory before this scan ran (brownfield-onboarding workspace, not Express's own).

## Detection Failures

- (none)
