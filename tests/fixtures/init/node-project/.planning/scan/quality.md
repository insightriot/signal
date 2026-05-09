# Quality Scan

## Test Runners

| Runner | Version | Config | Test File Count |
|---|---|---|---|
| Vitest | ^1.6.0 | `vitest.config.js` | 14 (`tests/*.test.js`) |
| Supertest | ^7.0.0 | (used inside vitest tests) | (HTTP integration helper, not a separate runner) |

## CI Configuration

- **Platform(s):** GitHub Actions
- **Workflow files:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- **CI runs tests:** yes (`npm test` invoked in `ci.yml` matrix on Node 20 + 22)
- **CI runs on PRs:** yes (`pull_request` trigger present)

## Lint / Format Tooling

| Tool | Config | Notes |
|---|---|---|
| ESLint | `.eslintrc.cjs` | Flat config not in use; classic rc |
| Prettier | `.prettierrc.json` | 100-char width, single quotes |
| EditorConfig | `.editorconfig` | 2-space indent |

## README

- **Path:** `README.md`
- **Size:** 88 lines
- **Sections present:** Overview / Quickstart / API / Configuration / Deployment / Contributing
- **First 30 lines:**

```
# acme-link-shortener

A small URL-shortener service. Accepts long URLs over HTTPS, returns short slugs,
serves redirects with proper status codes (302 / 410 / 404). SQLite-backed. No
external services required to run locally.

## Quickstart

    npm install
    npm test
    npm start
```

## CHANGELOG

- **Path:** `CHANGELOG.md`
- **Last updated:** 2026-04-08
- **Latest declared version:** 1.4.2
- **Freshness:** current (within 30 days)

## Open Work Signals

- **TODO/FIXME/HACK count:** 12
- **Top files by marker count:**

  | File | Markers |
  |---|---|
  | `src/db/migrations.js` | 4 |
  | `src/routes/links.js` | 3 |
  | `src/middleware/rate-limit.js` | 3 |
  | `tests/routes.test.js` | 2 |

- **Sample markers:**
  - `// TODO: switch to prepared-statement cache once we add benchmark coverage`
  - `// FIXME: handle race when two requests claim the same slug pre-insert`

## License

- **Detected:** MIT
- **Source:** `LICENSE` (root file) + `package.json` `"license": "MIT"`

## Notes

- CI is wired and runs tests on PRs — strong signal for a brownfield Signal user.

## Detection Failures

- (none)
