# Phase 1 — VERIFICATION

FULL tier → strict Nyquist enforcement, strict gate, anti-rationalization on.

## Acceptance Criteria — line-by-line

| AC | Status | Evidence |
|---|---|---|
| F1 | ✓ pass | `tests/server.test.js > POST /shorten (F1, F5) > F1: returns 201 + JSON body with 7-char code and shortUrl`. **Live smoke:** `curl POST /shorten` → `{"code":"4677X0Y","shortUrl":"http://localhost:18080/4677X0Y"}`, status 201. |
| F2 (302 known) | ✓ pass | `tests/server.test.js > GET /:code (F2) > F2: returns 302 with Location for known code`. Live smoke: `GET /4677X0Y` → `302 Found, Location: https://verify.example.com/page`. |
| F2 (404 unknown) | ✓ pass | `tests/server.test.js > GET /:code (F2) > F2: returns 404 for unknown code`. Live smoke: `GET /zzzzzzz` → `404 Not Found`. |
| F3 | ✓ pass | `tests/persistence.test.js > a code minted before close + reopen still resolves`. Real HTTP round-trip across two server lifecycles. |
| F4 | ✓ pass | `tests/service.test.js > retries on collision and returns the unique code`; `> throws after 5 retries if codegen never returns a unique code`. Both stub-injected. |
| F5a | ✓ pass | `tests/server.test.js > F5a: empty body → 400`. |
| F5b | ✓ pass | `tests/server.test.js > F5b: missing url field → 400`. |
| F5c | ✓ pass | `tests/server.test.js > F5c: url not a string → 400` + `tests/validate.test.js > F5c: non-string input`. |
| F5d | ✓ pass | `tests/server.test.js > F5d: javascript: scheme → 400` + `tests/validate.test.js > F5d: javascript: scheme`. Live smoke confirmed: `POST {"url":"javascript:alert(1)"}` → 400. |
| F5e | ✓ pass | `tests/server.test.js > F5e: file: scheme → 400` + `tests/validate.test.js > F5e: file: scheme`. |
| F5f | ✓ pass | `tests/server.test.js > F5f: unparseable url → 400` + `tests/validate.test.js > F5f: unparseable input`. |
| F5g | ✓ pass | `tests/server.test.js > F5g: url longer than 2,083 chars → 400` + `tests/validate.test.js > F5g: URL longer than 2,083 chars`. |
| F6 | ✓ pass | `tests/server.test.js > GET /healthz > F6: returns 200 + JSON {status, version}`. Live smoke: `GET /healthz` → `{"status":"ok","version":"0.1.0"}`. |
| N1a | ✓ pass | Validator round-trips through `new URL(input)` and emits `.toString()` (`src/validate.js`). No string concatenation of the user input into `Location`. Tested in `tests/validate.test.js`. |
| N1b | ✓ manual-acknowledged | Code review: `src/server.js` `defaultLog` emits only the access-log line (method, path, status, duration). No body content logged. Verified by inspection. |
| N1c | ✓ manual-acknowledged | Code review: `src/http/respond.js` `error(res, status, message)` accepts a message string, never echoes user input. Static error messages used throughout. Verified by inspection. |
| N1d | ✓ pass | `tests/server.test.js > 400 response sets X-Content-Type-Options + Cache-Control (N1d)` and the 404 test asserts `x-content-type-options: nosniff`. |
| N2a, N2b, N2c, N2d | ✓ manual-acknowledged | Per PROJECT.md ("pragmatically validated by a small benchmark script; no regression suite for v1"), no automated perf gate. Live test latencies for `POST /shorten` and `GET /:code` were 0–5 ms in the smoke run, well within targets. Documented manual-verification per Nyquist policy. |
| N3a | ✓ manual-acknowledged | Live smoke shows access log lines: `POST /shorten 201 5ms`, `GET /4677X0Y 302 0ms`, `GET /zzzzzzz 404 0ms`, `POST /shorten 400 0ms`, `GET /healthz 200 0ms`. Format matches spec. |
| N3b | ✓ pass | `tests/shutdown.test.js > N3b: SIGTERM triggers graceful exit within 10s with code 0`. Live smoke: SIGTERM exited with code 0 within 1 second. |
| N3c | ✓ pass | `tests/shutdown.test.js > N3c: startup fails with non-zero exit when DB_PATH is unwritable`. |

**Summary:** 17/17 automated criteria green. 7/7 manual-acknowledged criteria verified by inspection or live smoke. **0 failures.**

## Test suite

```
Test Files  8 passed (8)
Tests       38 passed (38)
Duration    ~500ms
```

## Build verification

- No build step (Node ESM, no transpile). `npm test` exits 0.
- No linter configured (intentional per PROJECT.md "no lint/format mandated").
- No new warnings.

## Strict Nyquist compliance

Every functional + automatable acceptance criterion maps to ≥1 test (per `1-VALIDATION.md`'s Nyquist table). Each automated row above has a concrete test path. The 7 manual rows are explicitly acknowledged in PLAN with stated rationale (perf benchmarks, code-review-only items).

**Strict-mode "failed before fixed" record:** during EXECUTE, every slice's tests were written *before* the implementation. The red state was confirmed by running `npm test` after writing tests but before writing code (e.g., the run after Slices 2/3/4 tests showed `FAIL Failed Suites 3` because `src/storage.js`, `src/codegen.js`, `src/validate.js` did not yet exist). However, the red→green transitions are bundled in single per-slice commits — git history doesn't preserve a "this test was red at SHA X, then green at SHA Y" trail. **This is a real strict-Nyquist limitation worth flagging in OPEN-QUESTIONS.md** — strict Nyquist's "failed before fixed" criterion would, in a stricter implementation, require either (a) a separate test-write commit that fails CI, or (b) a test-runner harness that records each test's first-red and first-green moments. v1 captures the spirit (TDD discipline preserved per slice) but not the letter (no per-test red→green git evidence).

## Live smoke (curl recipes)

Run from a terminal in the project root:

```bash
PORT=18080 DB_PATH=/tmp/sh-verify.db npm start &
PID=$!
sleep 1
curl -s -X POST http://localhost:18080/shorten \
  -H 'content-type: application/json' \
  -d '{"url":"https://verify.example.com/page"}'
# → {"code":"<7-char>","shortUrl":"http://localhost:18080/<code>"}
curl -is http://localhost:18080/<code>
# → 302 Found, Location: https://verify.example.com/page
curl -is http://localhost:18080/zzzzzzz
# → 404 Not Found
curl -is -X POST http://localhost:18080/shorten \
  -H 'content-type: application/json' \
  -d '{"url":"javascript:alert(1)"}'
# → 400 Bad Request
curl -s http://localhost:18080/healthz
# → {"status":"ok","version":"0.1.0"}
kill -TERM $PID
# → graceful exit, code 0
```

(All steps executed during this VERIFY phase with the expected outputs.)

## Verification verdict

**PASS.** All 24 acceptance criteria satisfied — 17 automated, 7 manual-acknowledged. Test suite green. Live HTTP smoke green. Graceful shutdown verified. Ready for REVIEW.

## Last Updated
2026-04-26
