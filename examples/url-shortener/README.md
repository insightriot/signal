# url-shortener

A small, single-process URL shortener service in Node.js.

- Two routes: `POST /shorten` (mint a code), `GET /:code` (302 redirect).
- Health probe: `GET /healthz`.
- File-based persistence: a plain JSON file (no native modules — `npm install` compiles nothing).
- Crypto-random 7-char base62 codes (collision-resistant via UNIQUE constraint + retry).
- Strict scheme allowlist (`http://`, `https://`).

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
- `shutdown` SIGTERM grace + DB-open-failure (N3b, N3c) via child process

## Operational

- Graceful shutdown: `SIGTERM` / `SIGINT` → `server.close()` then `storage.close()`. 10s force-exit guard.
- Persistence: a JSON file at `DB_PATH`, read on open and written on each change. Zero runtime dependencies.
- HTTP server: `requestTimeout = 10s`, `headersTimeout = 5s`, `keepAliveTimeout = 5s`, `maxRequestsPerSocket = 100`.
- Body cap: 4 KB.
- Security headers on JSON + 404 responses: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
