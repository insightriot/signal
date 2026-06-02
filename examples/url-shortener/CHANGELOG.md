# Changelog

## 0.1.0 — 2026-04-26

Initial release. Single-process Node.js URL shortener.

### Features
- `POST /shorten` mints a 7-char base62 code (cryptographically random, collision-resistant via SQLite UNIQUE + retry).
- `GET /:code` redirects to the stored long URL with HTTP 302.
- `GET /healthz` operational probe returning `{ status, version }`.
- Strict scheme allowlist (`http://`, `https://`); rejects `javascript:`, `data:`, `file:`, etc.
- URL length cap at 2,083 chars.
- File-based SQLite persistence (`better-sqlite3`, WAL mode).
- Graceful SIGTERM/SIGINT shutdown with 10-second force-exit guard.
- Per-request access logging.

### Operational hardening
- Body size cap at 4 KB with `Content-Length` pre-check (rejects oversized requests before reading).
- Server-level timeouts: `requestTimeout=10s`, `headersTimeout=5s`, `keepAliveTimeout=5s`, `maxRequestsPerSocket=100`.
- Security headers on JSON + 404 responses: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`.
- SQLite pragmas: `journal_mode=WAL`, `synchronous=NORMAL`, `busy_timeout=5000`.

### Configuration
- `PORT`, `DB_PATH`, `BASE_URL` environment variables (see `.env.example`).

### Tests
- 39 tests across 8 files (units + HTTP integration + persistence round-trip + child-process shutdown).

### Out of scope (deferred to future releases)
- Custom (vanity) codes
- Rate limiting / abuse detection
- Click analytics
- Multi-instance deployment with shared storage
- Front-end UI
