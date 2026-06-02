# Requirements

Generated from PROJECT.md success criteria + CONTEXT.md decisions. Each requirement carries an explicit acceptance criterion that drives Nyquist test mapping in PLAN.

## Functional Requirements

### F1 — Create short URL
**Endpoint:** `POST /shorten`
**Request body:** `{ "url": "<absolute http or https URL>" }`
**Response (201 Created):** `{ "code": "<7-char base62>", "shortUrl": "<BASE_URL>/<code>" }`
**Response (400 Bad Request) if:** body missing, body not JSON, `url` field missing, `url` not parseable, `url` scheme not in `{http, https}`, `url` length > 2,083 chars.
**Acceptance:** test posts a valid URL and asserts 201 + JSON body contains a 7-char code matching `[0-9A-Za-z]{7}` and `shortUrl` ending in that code.

### F2 — Resolve short URL
**Endpoint:** `GET /:code`
**Response (302 Found):** `Location` header set to the stored long URL; empty body.
**Response (404 Not Found) if:** `code` is not in storage.
**Acceptance:** test creates a code via F1, then GETs `/:code` and asserts 302 + correct Location header. Separate test GETs an unknown code and asserts 404.

### F3 — Persistence across restart
**Behavior:** codes minted before the process exits are still resolvable after restart.
**Acceptance:** test creates a code, simulates process restart (close DB handle, re-open with same path), GETs the code, asserts 302 + correct Location.

### F4 — Collision resistance
**Behavior:** generator does not return a code that's already in storage. On the rare collision, retry up to 5 times before failing 500.
**Acceptance:** test stubs the random source to return a known-colliding value once, then a unique value; asserts the unique value lands in the response.

### F5 — Reject invalid URLs
**Acceptance — covers each rejection path:**
- F5a: empty body → 400
- F5b: missing `url` field → 400
- F5c: `url` is not a string → 400
- F5d: `url` is `"javascript:alert(1)"` → 400
- F5e: `url` is `"file:///etc/passwd"` → 400
- F5f: `url` is `"not-a-url"` → 400
- F5g: `url` is 2,500 chars → 400

### F6 — Health/identity endpoint (operational hygiene, derived from FULL tier)
**Endpoint:** `GET /healthz`
**Response (200):** `{ "status": "ok", "version": "<package.json version>" }`
**Acceptance:** GET /healthz returns 200 + JSON.
**Rationale:** added during DISCUSS for FULL-tier — production services need an unauthenticated liveness probe.

## Non-Functional Requirements

### N1 — Security
- N1a: redirect `Location` header is whatever the user submitted (validated through `new URL()` — no eval, no template substitution).
- N1b: no logging of the request body unless logging is explicitly enabled (so we don't leak URLs into log files by default).
- N1c: error responses do not echo the input back into the response body unescaped (defense against header injection).
- N1d: response sets `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` on `/shorten` and 404 responses (avoid intermediate caching of error pages).

### N2 — Performance
- N2a: `POST /shorten` p99 latency < 50ms on local hardware for warm DB.
- N2b: `GET /:code` p99 latency < 20ms on local hardware (single index lookup).
- N2c: storage handles 10⁶ codes without index scan regression.
- N2d: pragmatically validated by a small benchmark script; no regression suite for v1.

### N3 — Operability
- N3a: server logs each request as one line: `<method> <path> <status> <duration_ms>`.
- N3b: `SIGTERM` triggers graceful shutdown — accept no new connections, wait up to 5s for in-flight, close DB.
- N3c: process exit code is non-zero if startup fails (DB open failure, port bind failure).

## Acceptance Criteria Summary

Total acceptance points: F1 (1), F2 (2), F3 (1), F4 (1), F5 (7), F6 (1), N1d (1), N3b (1), N3c (1) = **16 testable acceptance criteria**.

Nyquist mapping happens in PLAN — every acceptance criterion above must map to ≥1 test case in `1-PLAN.md`.

## Last Updated
2026-04-26
