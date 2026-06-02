# url-shortener

A small, single-process URL shortener service in Node.js — and a **worked example of the Signal workflow**.

- Two routes: `POST /shorten` (mint a code), `GET /:code` (302 redirect).
- Health probe: `GET /healthz`.
- File-based persistence: a plain JSON file (no native modules — `npm install` compiles nothing).
- Crypto-random 7-char base62 codes (collision-resistant via UNIQUE constraint + retry).
- Strict scheme allowlist (`http://`, `https://`).

---

## A worked example of Signal

This directory is a **complete, real run** of Signal's Phase-0 + six-phase flow
(`CALIBRATE → DISCUSS → PLAN → EXECUTE → VERIFY → REVIEW → SHIP`) on a small,
production-shaped service. The code under `src/` and `tests/` is what got built;
the `.planning/` directory is the paper trail of *how* Signal got there.

### Why it was calibrated FULL

Phase 0 (`/sig:calibrate`) asked five questions and wrote `.planning/PROFILE.md`:

| Question | Answer |
|---|---|
| scope | product |
| stakes | major |
| novelty | familiar |
| reversibility | **irreversible** |
| horizon | **years** |

That derived **tier FULL** — and the *why* is the whole point of the calibration
router: a URL shortener is tiny, but **a published short URL is a public contract
that can't be retracted**. Irreversibility trumps surface area. So this small
service got full rigor: TDD, strict Nyquist test-coverage, a full security pass,
all 8 plan-validation dimensions, 4-agent research, and explicit gates at every
phase. A throwaway script answering `reversibility: trivial / horizon: hours`
would calibrate **SKETCH** and skip almost all of that. Same workflow, rigor
dialed to the project — that's the wedge. (See `docs/vs.md` for how that compares
to other plugins.)

### The paper trail (`.planning/`)

Read them roughly in this order:

| File | Phase | What it shows |
|---|---|---|
| `PROFILE.md` | CALIBRATE | The 5 calibration answers + the derived tier. **Start here.** |
| `PROJECT.md` | (pre-flight) | Vision, problem, success criteria, scope. |
| `CONTEXT.md` | DISCUSS | The implementation decisions locked before any planning. |
| `REQUIREMENTS.md` | DISCUSS | Functional + non-functional requirements, each with an acceptance criterion. |
| `1-RESEARCH.md` | PLAN | The 4-agent research synthesis. |
| `1-PLAN.md` | PLAN | The 8-slice vertical plan. |
| `1-VALIDATION.md` | PLAN | 8-dimension plan validation + Nyquist test-coverage mapping. |
| `1-PROGRESS.md` | EXECUTE | The per-slice execution log. |
| `1-VERIFICATION.md` | VERIFY | Line-by-line acceptance check (24 criteria = 17 automated + 7 manual-verified). |
| `1-REVIEW.md` | REVIEW | Quality/security/perf review — two issues found and fixed before ship. |
| `1-SHIP.md` | SHIP | Pre-ship checklist, clean git history, ship verdict. |
| `STATE.md` | (all) | Machine-readable phase state (`schema_version: 1`). |

> **Note on storage:** this run originally used `better-sqlite3`. For the committed
> example it uses a plain JSON file instead — which `PROJECT.md` already scoped as
> an acceptable choice ("SQLite **or a JSON file**") — so the example has **zero
> runtime dependencies**: `npm install` compiles nothing and `npm test` runs on any
> Node ≥ 22.5. The Signal-side record of that change is in the repo's
> `.planning/M4.5.E4-PROGRESS.md`.

---

## Install + run

```bash
npm install
PORT=8080 DB_PATH=./shortener.db BASE_URL=http://localhost:8080 npm start
```

Defaults: `PORT=8080`, `DB_PATH=./shortener.db`, `BASE_URL=http://localhost:${PORT}`.

## API

### `POST /shorten`

Request:

```json
{ "url": "https://example.com/some/long/path?q=1" }
```

Response (`201 Created`):

```json
{ "code": "aBc123Z", "shortUrl": "http://localhost:8080/aBc123Z" }
```

Errors: `400` (invalid body, scheme not in {http,https}, URL > 2,083 chars, malformed JSON), `413` (body > 4 KB).

### `GET /:code`

Returns `302 Found` with `Location: <stored long URL>`. Returns `404 Not Found` if unknown.

### `GET /healthz`

Returns `{ "status": "ok", "version": "<package version>" }`.

## Quick smoke

```bash
PORT=8080 DB_PATH=./demo.db npm start &
SERVER_PID=$!

# create
curl -s -X POST http://localhost:8080/shorten \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/hello"}'

# resolve (replace CODE)
curl -i http://localhost:8080/CODE

# health
curl -s http://localhost:8080/healthz

kill $SERVER_PID
```

## Tests

```bash
npm test
```

8 test files, 39 tests covering:
- `storage`, `codegen`, `validate` units
- `service` (collision retry, validation error)
- `server` integration (F1, F2, F5, F6, N1d via real `fetch` against an ephemeral port)
- `persistence` round-trip across restart (F3)
- `shutdown` SIGTERM grace + open-failure (N3b, N3c) via child process

## Operational

- Graceful shutdown: `SIGTERM` / `SIGINT` → `server.close()` then `storage.close()`. 10s force-exit guard.
- Persistence: a JSON file at `DB_PATH`, read on open and written on each change. Zero runtime dependencies.
- HTTP server: `requestTimeout = 10s`, `headersTimeout = 5s`, `keepAliveTimeout = 5s`, `maxRequestsPerSocket = 100`.
- Body cap: 4 KB.
- Security headers on JSON + 404 responses: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
