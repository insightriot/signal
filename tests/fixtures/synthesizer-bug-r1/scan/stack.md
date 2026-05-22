# Stack Scan

## Languages

| Language | Files | LOC (approx) | % of code |
|---|---|---|---|
| JavaScript | 141 | 21346 | 66.2% |
| EJS (templates) | 20 | 243 | 9.4% |
| Plain text | 10 | unknown | 4.7% |
| HTML | 8 | unknown | 3.8% |
| Tmpl (templates) | 7 | unknown | 3.3% |
| YAML | 6 | unknown | 2.8% |
| Markdown | 4 | 4197 | 1.9% |
| CSS | 4 | unknown | 1.9% |
| Handlebars (.hbs) | 3 | unknown | 1.4% |

Total source files (excluding vendored): 213

Note: percentages computed against total tracked files (213). JavaScript is the overwhelmingly dominant language; EJS/HTML/Tmpl/Hbs files live under `examples/` as demo view templates.

## Package Managers + Manifests

### Node.js

- **Manifest:** `package.json` (declared name: `express`, version: `5.2.1`)
- **Lockfile:** (absent — no `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, or `bun.lockb`; `npm install` will create one. A `.npmrc` is present at the repo root.)
- **Top dependencies:** `accepts ^2.0.0`, `body-parser ^2.2.1`, `router ^2.2.0`, `send ^1.1.0`, `serve-static ^2.2.0`, `qs ^6.14.2`, `proxy-addr ^2.0.7`, `finalhandler ^2.1.0`, `type-is ^2.0.1`, `http-errors ^2.0.0`
- **Runtime constraint:** `node >= 18` (declared in `engines.node`)

## Frameworks Detected

| Framework | Version | Marker File | Notes |
|---|---|---|---|
| Express | 5.2.1 | `package.json` (`name: express`) + `lib/application.js`, `lib/express.js`, `lib/request.js`, `lib/response.js` | This repository **is** the Express framework itself, not a project consuming it. No downstream web-app framework (Next.js / Vite / Nuxt / Remix / Astro / SvelteKit) detected — no `*.config.{js,ts,mjs}` config files for any of them, and no `app/`, `pages/`, or `src/` directories at the root. |

## Runtime / Deployment

- **Container:** (no Dockerfile)
- **Edge / serverless:** (none detected — no `vercel.json`, `netlify.toml`, `wrangler.toml`, `fly.toml`, `serverless.yml`, `app.yaml`)
- **Mobile / desktop:** (none detected)

## Notes

- Lockfile is absent. This is unusual for an application but normal for a published npm library: Express ships without committing a lockfile so consumers' resolvers control transitive versions.
- Repository shape strongly indicates this is a **library / framework package** (top-level `index.js` + `lib/` + `test/` + `examples/` + `History.md` + `Readme.md`), not an application. No build output directory, no deployment config, no runtime entry beyond the library export.
- `examples/` contains 27 sub-applications demonstrating Express usage (auth, sessions, mvc, routing variants, view-engine integrations with EJS/Handlebars/Tmpl). These templates account for the EJS/HTML/Tmpl/Hbs file counts above.
- ESLint is configured (`.eslintrc.yml`, `.eslintignore`); Mocha + nyc are the declared test/coverage stack (in `devDependencies` + `scripts`).
- CI configured via GitHub Actions (`.github/workflows/ci.yml`, `codeql.yml`, `legacy.yml`, `scorecard.yml`), and dependabot is enabled (`.github/dependabot.yml`).

## Detection Failures

- LOC counts for `.txt`, `.html`, `.tmpl`, `.yml`, `.css`, and `.hbs` were not individually computed (each below the 5% / 20-file threshold for top-language reporting); marked `unknown` in the table.
- The extension tally surfaced a few spurious entries (`.txt"`, `.send`, `.gitkeep"`) caused by filenames with embedded quotes or unusual suffixes inside `examples/`; these are not real language extensions and were dropped from the language table.
