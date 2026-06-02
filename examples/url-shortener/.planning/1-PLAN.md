# Phase 1 — PLAN

## Phase Goal

Ship a single-process Node.js URL shortener service that satisfies all 16 acceptance criteria in REQUIREMENTS.md, with a clean test suite (TDD per task), strict shutdown discipline, and no high-severity REVIEW findings.

## Vertical Slices

Each slice is independently shippable: passes its acceptance tests, leaves the working tree in a green state, and is one logical commit. Slices are ordered by dependency.

### Slice 1 — Project scaffolding (S)

**Goal:** Empty Node project with vitest + `better-sqlite3` installed; one passing smoke test.

**Tasks:**
- `package.json` with `"type": "module"`, scripts: `test`, `start`, `node` engine ≥ 22.
- Install `better-sqlite3` as runtime dep, `vitest` as dev dep.
- Add `.gitignore` (`node_modules/`, `*.db`, `*.db-wal`, `*.db-shm`, `coverage/`).
- One smoke test: `1+1 === 2`.

**Acceptance:** `npm test` exits 0; `npm start` does nothing yet (no server) — **no script entry needed yet**.

**Test strategy:** existence of vitest config + the smoke test passing.

**Depends on:** nothing.

### Slice 2 — Storage layer (M)

**Goal:** `src/storage.js` exports a small interface (`init`, `put`, `get`, `close`) backed by `better-sqlite3`. Passes its own unit tests round-tripping codes through the store and surviving close-and-reopen.

**Tasks:**
- `src/storage.js` opens DB at `dbPath`, runs `CREATE TABLE IF NOT EXISTS urls(code TEXT PRIMARY KEY, long_url TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`. Sets pragmas (`WAL`, `synchronous = NORMAL`, `busy_timeout = 5000`).
- `put(code, longUrl)`: prepared `INSERT OR IGNORE INTO urls(code, long_url) VALUES (?, ?)`; returns `{ inserted: changes === 1 }`.
- `get(code)`: prepared `SELECT long_url FROM urls WHERE code = ?`; returns `{ longUrl } | null`.
- `close()`: `db.close()`.
- Tests: temp-file DB, put new code → inserted=true; put same code again → inserted=false; get returns long_url; get unknown code → null; close + reopen + get → still resolves (persistence test, F3).

**Acceptance:** unit tests pass; storage layer is the **only** module that knows about SQLite (rest of app talks through this interface).

**Test strategy:** unit (vitest), 5 test cases, one per success criterion.

**Depends on:** Slice 1.

### Slice 3 — Code generator (S)

**Goal:** `src/codegen.js` exports `generateCode()` returning a 7-char base62 string from `crypto.randomInt(0, 62)`. Pure function; trivial unit tests.

**Tasks:**
- `src/codegen.js`: `import { randomInt } from 'node:crypto'`. `const ALPHABET = '0-9A-Za-z'` expansion. `generateCode()` loops 7× `randomInt(0, 62)` and indexes alphabet.
- Tests: returns 7-char string; matches `[0-9A-Za-z]{7}`; calling 1000× produces ≥ 999 distinct values (sanity, not a chi-square test for v1).

**Acceptance:** unit tests pass.

**Test strategy:** unit (vitest), 3 test cases.

**Depends on:** Slice 1.

### Slice 4 — URL validator (S)

**Goal:** `src/validate.js` exports `validateUrl(input)` returning `{ ok: true, normalized: <string> } | { ok: false, reason: <string> }`.

**Tasks:**
- Use `new URL(input)` inside try/catch.
- Reject if `protocol !== 'http:' && protocol !== 'https:'` (strict colon equality).
- Reject if `input.length > 2083`.
- Tests: each F5 row (F5a–F5g) is its own test case.

**Acceptance:** unit tests pass; F5 acceptance criteria covered 7-of-7.

**Test strategy:** unit (vitest), 7 test cases.

**Depends on:** Slice 1.

### Slice 5 — Service composition: `mintCode` (S)

**Goal:** `src/service.js` exports `mintCode(longUrl, deps)` that wires validator + codegen + storage. Encapsulates the F4 collision-retry logic (up to 5 attempts; throw on exhaustion).

**Tasks:**
- Validate URL (Slice 4); throw `ValidationError(reason)` on `{ ok: false }`.
- Loop up to 5 times: `code = generateCode()`; `if storage.put(code, normalized).inserted: return { code, longUrl: normalized }`.
- After 5 retries: throw `Error('codegen exhausted retries')`.
- Tests: stub `deps.generateCode` to return a known-colliding code once, then unique → assert unique value lands. Stub to always-collide → assert throw.

**Acceptance:** unit tests pass; F4 retry path has a test.

**Test strategy:** unit with stubbed deps, 3 test cases.

**Depends on:** Slices 2, 3, 4.

### Slice 6 — HTTP layer: `POST /shorten` + `GET /:code` + `GET /healthz` (M)

**Goal:** `src/server.js` builds a `node:http` server with a `match` helper, body-parser (4 KB cap), and three handlers. Server-level timeouts set per research lock-ins.

**Tasks:**
- `src/http/parse-body.js`: `await readJsonBody(req, { maxBytes: 4096 })` — `for await` chunks, abort + 413 over cap, JSON.parse inside try/catch.
- `src/http/respond.js`: helpers `json(res, status, body, headers?)`, `redirect(res, location)`, `notFound(res)`, `error(res, status, message)`. Sets `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` on JSON + 404 responses (N1d).
- `src/server.js`: `createServer((req, res) => …)` dispatches:
  - `POST /shorten` → readJsonBody → `mintCode` → 201 JSON `{ code, shortUrl: BASE_URL + "/" + code }`. Catches `ValidationError` → 400. Catches other errors → 500.
  - `GET /:code` (regex `^/[0-9A-Za-z]{7}$`) → `storage.get(code)` → 302 with `Location` = stored long_url, or 404.
  - `GET /healthz` → 200 JSON `{ status: "ok", version: <package.json version> }` (read once at startup).
  - Anything else → 404.
- Set `server.requestTimeout = 10_000`, `server.headersTimeout = 5_000`, `server.keepAliveTimeout = 5_000`, `server.maxRequestsPerSocket = 100`.
- One-line per-request access log: `<method> <path> <status> <duration_ms>`.
- Tests: integration tests with `server.listen(0)` + native `fetch({ redirect: 'manual' })`. F1, F2, F5 (each), F6 covered. F3 covered separately (Slice 7).

**Acceptance:** integration tests pass; covers F1, F2 (both rows), F5 (all 7), F6.

**Test strategy:** integration (vitest + ephemeral port), 11 test cases.

**Depends on:** Slice 5.

### Slice 7 — Persistence-across-restart integration test (S)

**Goal:** Explicit F3 acceptance — start server, mint a code, close server + DB, re-open with same DB path, GET /:code → 302.

**Tasks:**
- One integration test in `tests/persistence.test.js`. Use a per-test temp DB path (e.g., `os.tmpdir() + '/' + Date.now() + '.db'`).

**Acceptance:** F3 acceptance criterion covered.

**Test strategy:** integration, 1 test case.

**Depends on:** Slice 6.

### Slice 8 — Bootstrap + graceful shutdown + env config (M)

**Goal:** `src/index.js` is the executable entry. Reads `PORT`, `DB_PATH`, `BASE_URL` from env (with defaults). Wires `SIGTERM`/`SIGINT` to `server.close() → db.close()` with a 10s force-exit timer. Exits non-zero on startup failure.

**Tasks:**
- `src/index.js` opens storage, builds server, calls `listen(PORT)`. On `SIGTERM` / `SIGINT`: `server.close(() => db.close())`. Set 10s `setTimeout(() => process.exit(1), 10_000).unref()`.
- `package.json` `"start": "node src/index.js"`.
- README quickstart: install, run, curl example.
- Tests: integration test sends `SIGTERM` to a child process started via `node:child_process` and asserts (a) it exits within 10s, (b) exit code is 0. Separate test asserts startup failure when DB_PATH is unwritable → exit code non-zero.

**Acceptance:** N3b, N3c covered. README runnable end-to-end.

**Test strategy:** integration via `child_process`, 2 test cases. README is a manual smoke (curl recipes).

**Depends on:** Slice 7.

## Dependency Graph

```
Slice 1 (scaffold)
   ├── Slice 2 (storage)
   ├── Slice 3 (codegen)
   └── Slice 4 (validator)
         └── Slice 5 (service)
               └── Slice 6 (HTTP)
                     └── Slice 7 (restart test)
                           └── Slice 8 (bootstrap)
```

Slices 2, 3, 4 are independent and could parallelize in execution. Slices 5–8 are strictly serial.

## Estimated Complexity

| Slice | Size | Notes |
|---|---|---|
| 1 | S | scaffolding |
| 2 | M | storage + 5 tests |
| 3 | S | codegen + 3 tests |
| 4 | S | validator + 7 tests |
| 5 | S | service composition + 3 tests |
| 6 | M | HTTP layer + 11 tests; the largest slice |
| 7 | S | one persistence test |
| 8 | M | bootstrap + signals + README |

Total: 4 S, 3 M, 0 L. Roughly half a day of focused work for an experienced Node engineer.

## Anti-Rationalization Already Resolved

- **"node:http is too low-level, just use Express"** — explicitly ruled out in PROJECT.md constraints. Two routes do not justify a framework.
- **"Counter-based codes are simpler"** — prior art agrees, but enumerability is a real abuse vector at v1 with no rate limiting. Random base62 stands.
- **"Skip the persistence test, the storage test covers it"** — the storage test covers `close-reopen` at the storage layer; F3 specifically asserts the *full HTTP round trip* survives restart. Not redundant.

## Last Updated
2026-04-26
