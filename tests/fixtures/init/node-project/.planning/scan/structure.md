# Structure Scan

## Top-Level Inventory

### Source-shaped directories
- `src/` — JavaScript source (server, routes, db, middleware)

### Test-shaped directories
- `tests/` — 14 files (`.test.js`)

### Doc-shaped directories
- `docs/` — operator + API reference docs (3 files)

### CI / tooling
- `.github/` — GitHub Actions workflows

### Standard project files
- `README.md` — present (88 lines)
- `LICENSE` — present (MIT)
- `CHANGELOG.md` — present (last entry 2026-04-08)
- `CONTRIBUTING.md` — present
- `CODE_OF_CONDUCT` — absent

### Other top-level entries
- `Dockerfile`
- `.dockerignore`
- `package.json` + `package-lock.json`
- `.eslintrc.cjs`
- `.prettierrc.json`

## Monorepo Detection

- **Type:** single-repo
- **Workspace tool:** (none)
- **Sub-package count:** N/A
- **Sub-packages:** N/A

## Source Tree (depth-3)

Source root: `src/` (chosen because: it exists and contains the entry point `src/server.js`).

| Path | Annotation |
|---|---|
| `src/routes/` | HTTP handlers (5 files) |
| `src/db/` | SQLite access layer + migrations |
| `src/middleware/` | Express middleware (auth, logging, errors) |
| `src/lib/` | Shared utilities |
| `tests/` | Vitest test files (14) |
| `docs/` | Operator + API docs |
| `.github/workflows/` | CI configuration |

## Test Surface (organizational view)

- **Dedicated directories:** `tests/`
- **Co-located:** no
- **By-name detection:** 14 files matched test patterns (all in `tests/`)
- **Net assessment:** tests in dedicated directory

## Documentation Surface

- **Dedicated directory:** `docs/` (3 files)
- **Tooling:** (none — plain markdown)
- **README size:** 88 lines
- **Other docs:** CHANGELOG.md, CONTRIBUTING.md

## Notes

- Standard Node-Express layout; no surprises.

## Detection Failures

- (none)
