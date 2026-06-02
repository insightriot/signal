# Phase 1 — Research Synthesis

Output of 4 parallel research agents (FULL tier `research_parallelism: 4`). Synthesized into a single brief; raw agent outputs are summarized inline.

## Domain (`node:http`, `better-sqlite3`, base62)

- **HTTP routing pattern:** single `createServer((req, res) => …)` + URL-parse + dispatch. Two routes don't justify a framework. Use **`for await (const chunk of req)`** for body parse (modern idiom; propagates errors via try/catch). Track total bytes; abort + 413 past 4 KB.
- **`better-sqlite3` v11+ pragmas:** `db.pragma('journal_mode = WAL'); db.pragma('synchronous = NORMAL'); db.pragma('busy_timeout = 5000')`. Hoist `db.prepare(...)` to module scope (compiled-statement caching). Use `db.transaction(fn)` over manual `BEGIN/COMMIT`.
- **Base62 from `randomBytes`:** rejection sampling (drop bytes ≥ 248, mod 62 the rest) is the textbook collision-bias-free approach. Alternative: `crypto.randomInt(0, 62)` per char — simpler, also unbiased. **Pick:** `crypto.randomInt(0, 62)` — least error-prone.
- **Watchouts:**
  - Async-iter body parse swallows `aborted` events unless `req.on('close')` checked.
  - WAL leaves `-wal`/`-shm` sidecars; backup tooling that copies only `.db` corrupts on restore.
  - `byte % 62` and `Math.random()` both bias — must use crypto + uniform sampling.

## Risk

- **Open-redirect by design** — that's the product. But: never string-concat the user URL into the `Location` header (CRLF injection). Always round-trip through `new URL(input).toString()`.
- **Strict scheme check on `:`**: assert `parsed.protocol === 'http:' || parsed.protocol === 'https:'`. Don't `startsWith('http')` (catches `httpx:` nonsense).
- **TOCTOU on code generation:** generate-check-INSERT has a race window. **Fix:** `UNIQUE` constraint on `code` + `INSERT … ON CONFLICT(code) DO NOTHING`; if 0 rows changed, regen + retry up to 5 attempts before 500.
- **Slowloris:** `node:http` has no default body-read timeout. Set `server.requestTimeout = 10_000`, `server.headersTimeout = 5_000`, `server.keepAliveTimeout = 5_000`, `server.maxRequestsPerSocket = 100`.
- **Operational risks:**
  - `SQLITE_BUSY` → mitigated by WAL + `busy_timeout = 5000`.
  - `SQLITE_FULL` → return 503, log, exit 1.
  - SIGTERM → `server.close()` first, then `db.close()`.

**Must-mitigate (ranked):**
1. UNIQUE + ON CONFLICT retry (data corruption)
2. `requestTimeout` + body cap (DoS)
3. Strict `protocol === 'http:'/'https:'` (scheme smuggling)
4. WAL + busy_timeout (prod stability)
5. `randomInt`, not `randomBytes % 62` (silent collision-rate doubling)

**Accepted v1 risks (deferred to v2):** no domain reputation / Safe Browsing; no per-IP rate limiting (rely on upstream).

## Prior Art

- **Bitly:** scheme allowlist + ~2,048 char cap + branded 404 page. Counter-based base62 (per reverse-engineering — not officially documented). 2014 source-code/credentials breach.
- **TinyURL:** lax validation (accepts `ftp://`); long history of malware-laundering reputation. Many corp proxies block the domain.
- **YOURLS:** explicit configurable scheme allowlist (`$yourls_allowedprotocols`). Default code-gen is a sequential counter, base-converted (default 36, optional 62). Multiple CVEs over the years (XSS, SSRF, auth bypass).

**Borrow:** strict scheme allowlist (YOURLS-style) + branded-but-minimal 404 (Bitly-style; for v1, plain JSON 404 — branding is out of scope).

**Ignore:** domain blocklisting, abuse heuristics, credential stores. Prior art borrowing the threat model imports v2-scope work.

**Counter-vs-random tension.** Prior art (YOURLS) and CONTEXT.md disagree: counter-based codes are simpler and collision-free, but enumerable. **Decision (preserved from CONTEXT.md):** stick with random base62 — opacity is a real abuse-prevention property at v1 even without explicit rate limiting.

## Ecosystem & Protocol

- **Redirect code:** Bitly/TinyURL use 301 for cache-friendliness; YOURLS defaults to 301 with config option for 302. **Pick: 302** — non-cacheable, lets us delete codes without poisoned client caches. Click-tracking implication is moot in v1 (no analytics).
- **Vitest + `node:http`:** `server.listen(0)` for ephemeral port; native `fetch` with `redirect: 'manual'` to assert 3xx + `Location`. One server per test file; close in `afterAll`.
- **SIGTERM graceful shutdown:** `server.close()` → `db.close()`, in that order. 10s force-exit timer (`unref`'d). Matches K8s `terminationGracePeriodSeconds: 30` with headroom.
- **Health endpoint:** `/healthz` (K8s convention) over `/health` — `z` suffix avoids collision with user routes.

## Lock-ins from research (folds into 1-PLAN.md)

| Decision | Locked value |
|---|---|
| Body parse | `for await (const chunk of req)` + 4 KB cap |
| Body abort on too-large | 413 + `req.destroy()` |
| `requestTimeout` / `headersTimeout` / `keepAliveTimeout` | 10s / 5s / 5s |
| `maxRequestsPerSocket` | 100 |
| SQLite pragmas | `WAL`, `synchronous = NORMAL`, `busy_timeout = 5000` |
| Code gen | `crypto.randomInt(0, 62)` × 7 chars |
| Insert | `UNIQUE` constraint + `INSERT OR IGNORE`; retry up to 5; 500 after exhaustion |
| Scheme check | strict `parsed.protocol === 'http:' || 'https:'` |
| URL length cap | 2,083 chars |
| Redirect status | 302 |
| Test runner | vitest with `server.listen(0)` + native `fetch({ redirect: 'manual' })` |
| Shutdown order | HTTP first → DB second; 10s force-exit timer |
| Health endpoint | `/healthz` |

## Last Updated
2026-04-26
