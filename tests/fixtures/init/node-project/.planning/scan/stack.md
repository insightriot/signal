# Stack Scan

## Languages

| Language | Files | LOC (approx) | % of code |
|---|---|---|---|
| JavaScript | 28 | 1,840 | 78% |
| JSON | 4 | 312 | (config) |
| Markdown | 6 | 420 | 18% |
| YAML | 2 | 38 | 4% |

Total source files (excluding vendored): 40

## Package Managers + Manifests

### Node.js

- **Manifest:** `package.json` (declared name: `acme-link-shortener`, version: `1.4.2`)
- **Lockfile:** `package-lock.json` (npm)
- **Top dependencies:**
  - `express@^4.19.2`
  - `better-sqlite3@^11.0.0`
  - `zod@^3.23.8`
- **devDependencies:**
  - `vitest@^1.6.0`, `eslint@^9.0.0`, `prettier@^3.3.0`, `supertest@^7.0.0`
- **Runtime constraint:** `node >=20.0.0`

## Frameworks Detected

| Framework | Version | Marker File | Notes |
|---|---|---|---|
| Express | ^4.19.2 | `package.json` deps + `src/server.js` shape | Classic CommonJS-style Express API on Node 20+ |

## Runtime / Deployment

- **Container:** `Dockerfile` (Node 20 alpine base)
- **Edge / serverless:** (none detected)
- **Mobile / desktop:** (none)

## Notes

- Single-purpose service. Three production deps; tight surface.
- SQLite via `better-sqlite3` — synchronous embedded store, no separate DB process.

## Detection Failures

- (none — all checks completed within time bounds)
