# Review Report — Phase 1

FULL tier → all four review passes ran. Skills loaded conceptually: `code-review-and-quality`, `security-and-hardening`, `performance-optimization`, `code-simplification`.

## Critical Issues (must fix before SHIP)

**None.** Code is small, all paths are tested, no critical defects found.

## Important Issues (should fix)

### I-1 — `Content-Length` pre-check missing (security hardening) ✓ FIXED

**Where:** `src/http/parse-body.js`.
**Found:** body-size enforcement was streaming-only (count chunks). A client could send `Content-Length: 999999` and we'd accept the connection and start reading.
**Risk:** moderate — slowloris-adjacent; a hostile client can occupy the read path until the streaming cap fires.
**Fix:** added a pre-read check that compares declared `Content-Length` to `MAX_BODY_BYTES` and throws `BodyTooLargeError` before reading any chunks.
**Test added:** `tests/server.test.js > rejects oversized body — either 413 or socket-destroy`. Test tolerates both response shapes (413 or socket-reset) because `req.destroy()` may close the socket before the response flushes — both outcomes are "rejected without processing", which is the security property.

### I-2 — silently-swallowed unhandled error in server's outer try/catch ✓ FIXED

**Where:** `src/server.js` lines 16–21.
**Found:** the outer try/catch wrapped `dispatch(...)` and silently called `error(res, 500, 'internal error')` on any throw, with no log output.
**Risk:** low — operational. Production debugging is harder if a 500 leaves no trace.
**Fix:** added `log(\`unhandled error: ${err.message}\`)` before the 500 response.

## Suggestions (optional improvements — applied selected)

### S-1 — `dispatch` parsed `req.url` against a placeholder host ✓ APPLIED

**Where:** `src/server.js` line 33.
**Was:** `const url = new URL(req.url, 'http://placeholder'); const path = url.pathname;`
**Changed to:** `const path = req.url.split('?')[0];` — direct, no placeholder dance.
**Rationale:** the `URL` constructor was used only to extract the pathname. `req.url` for `node:http` is path+query already; splitting is unambiguous and faster.

### S-2 — dead `// eslint-disable-next-line no-console` comment ✓ APPLIED

**Where:** `src/server.js` `defaultLog`.
**Was:** the comment disabled an eslint rule that doesn't exist (no eslint configured).
**Changed:** removed the comment.

### S-3 — `/healthz` exposes package version ✗ NOT APPLIED

**Where:** `src/server.js` health handler.
**Suggestion:** removing `version` from the public response would reduce information disclosure.
**Decision:** keep the version. F6 explicitly requires `{ status, version }`, and information-disclosure risk is negligible at v1 scale (the version is in the public package.json anyway). If `/healthz` is ever exposed publicly (vs. behind a load-balancer probe path), revisit.

## Security Findings (FULL = OWASP + ASVS Level 2 audit)

OWASP Top 10 walkthrough — only items relevant to this surface:

- **A01: Broken Access Control** — N/A. No auth; no per-user resources. Service is intentionally open.
- **A02: Cryptographic Failures** — `crypto.randomInt` for code generation (uniform, no modulo bias). No secrets stored; no tokens issued. ✓
- **A03: Injection** — SQL: prepared statements + parameter binding (`db.prepare(...).run(?, ?)`). HTTP header injection: `Location` is the *normalized* output of `URL.toString()`, which encodes any CRLF that would be needed for response splitting. JSON parsing: standard `JSON.parse` in a try/catch. ✓
- **A04: Insecure Design** — open-redirect-by-design is the product. Documented in CONTEXT.md "Deferred Decisions"; no rate limiting (deferred to upstream proxy or v2). Acceptable risk at v1.
- **A05: Security Misconfiguration** — security headers set (`X-Content-Type-Options: nosniff`, `Cache-Control: no-store`); server timeouts set; SQLite WAL + `busy_timeout` set. ✓
- **A06: Vulnerable Components** — `better-sqlite3@^12.9.0` (current major). `vitest@^2.1.0` (dev only). Both well-maintained. No `npm audit` warnings on install.
- **A07: Identification & Authentication Failures** — N/A.
- **A08: Software & Data Integrity Failures** — no code is loaded dynamically; no auto-update; no untrusted code paths. ✓
- **A09: Security Logging & Monitoring Failures** — basic per-request log line emitted. No body content logged (N1b). Errors logged with the `unhandled error: …` prefix (post-I-2 fix). For real production, structured logging + log shipping would be the next-tier hardening; v1 ships with stdout.
- **A10: Server-Side Request Forgery** — N/A. The service does not fetch the long URL — it only stores and emits it as a `Location` header. The redirect is performed client-side.

**ASVS Level 2 highlights:**
- Input validation at boundary (`validateUrl` runs `new URL` + protocol allowlist + length cap). ✓
- Error messages do not echo input (static strings). ✓
- HTTP method enforced per route; non-matching method/route → 404. ✓
- Response set explicit `Content-Type` + `Content-Length`. ✓
- No query-parameter parsing (no surface for query-string injection). ✓

**Verdict: no security findings beyond I-1 (now fixed).**

## Performance Findings

- **Storage:** primary-key lookup on `code` (B-tree, O(log n)). Prepared statements hoisted to module scope (compiled-statement cache). WAL + `busy_timeout=5000`. No N+1 risk (no list endpoints). ✓
- **HTTP:** server-level timeouts set (`requestTimeout=10s`, `headersTimeout=5s`, `keepAliveTimeout=5s`, `maxRequestsPerSocket=100`). Body cap pre-check (post-I-1 fix). ✓
- **Codegen:** 7 `randomInt` calls per code; trivial. Collision-retry loop bounded at 5 attempts. ✓
- **Logging:** synchronous `console.log` is the bottleneck if request rate is very high. Acceptable at v1; would swap to a buffered/async logger in v2 if profiling shows it.
- **Live smoke latencies:** `POST /shorten` 5 ms first call (cold), `GET /:code` 0 ms (warm). Well within N2 targets.

**Verdict: no performance issues at v1 scale. Acceptable for the production-shaped tier.**

## Simplification Opportunities

Already applied in S-1 (placeholder URL parse) and S-2 (dead eslint comment). Nothing else. Code is small, naming is clear, no dead exports.

## Verdict

- [x] **PASS — ready for SHIP.**

All 4 review passes ran. 0 critical issues, 2 important issues (both fixed in-phase rather than looped back to EXECUTE — the changes were small enough that a separate EXECUTE loop would have added ceremony without value), 3 suggestions (2 applied, 1 documented decline).

Final test count: **39 tests passing** (added 1 oversized-body integration test as part of I-1 fix). Test suite still runs in ~0.5 s.

Tier-appropriate: this REVIEW caught small but real issues that VERIFY would not have surfaced (silent error swallowing, missing pre-read body cap, dead lint comment) — exactly the "is it good?" beyond "does it work?" job.

## Last Updated
2026-04-26
