# Implementation Context

Decisions locked during DISCUSS. Each gray area was framed as 3 options + a recommendation; the locked choice and reasoning are captured here so PLAN and EXECUTE don't need to re-derive them.

## Locked Decisions

### 1. Storage backend → **SQLite (`better-sqlite3`)**

**Options considered:**
- A. **In-memory `Map`** — fastest to implement; loses everything on restart. Pick this if persistence is a v2 concern.
- B. **Flat-file JSON** — a single file holding `{ code → url }`. Pick this if you want zero native deps and few-hundred-record scale.
- C. **SQLite via `better-sqlite3`** — single-file, transactional, scales to millions, no native server. Pick this if you want production-shaped persistence with one library.

**Recommended:** C. **Locked: C.**

**Reasoning:** Success Criterion #3 requires restart-survival, which kills A. Flat-file JSON (B) is fragile under any real concurrency — partial writes corrupt the file. SQLite gives ACID semantics in a single library, with no server process, and the storage interface stays thin enough that swapping to Postgres later is mechanical. `better-sqlite3` is synchronous (simpler control flow) and battle-tested.

### 2. Short-code generation → **Crypto-random base62, 7 chars**

**Options considered:**
- A. **Counter-based** (1, 2, 3, …, base62-encoded) — perfectly compact, perfectly enumerable. Pick this if you want zero collision math and don't mind an attacker walking the keyspace.
- B. **Hash of URL** (SHA-256 truncated to base62) — deterministic; same URL → same code. Pick this if dedup-by-URL is a feature.
- C. **Crypto-random base62, fixed length (7 chars)** — 62⁷ ≈ 3.5×10¹² keyspace; collision probability negligible at 10⁶ codes. Pick this if you want opacity and no enumerability.

**Recommended:** C. **Locked: C.**

**Reasoning:** Success Criterion #4 explicitly calls for collision-resistance at ≥10⁶ codes; A is enumerable (anyone can scrape every redirect by counting), which is a real abuse vector for production. B forces a "what if the same URL is submitted twice?" semantic question into v1 that PROJECT.md doesn't ask for (and which has surprising implications — same code reused = leak across submitters). C is the boring, correct default. 7 chars is a deliberate keyspace choice; collision retry on the rare hit.

### 3. HTTP layer → **Node `node:http` + small route helper**

**Options considered:**
- A. **`node:http` raw** — zero deps, complete control; you write your own routing. Pick this if you want the fewest moving parts.
- B. **Express** — ubiquitous, well-known. Pick this if your team is going to grow and Express idioms are the language people speak.
- C. **Fastify** — fastest mainstream Node framework, schema-driven validation. Pick this if perf and validation hygiene matter and you're OK with a slightly less-known idiom.

**Recommended:** A. **Locked: A.**

**Reasoning:** PROJECT.md constraints explicitly say *"prefer Node's `node:http` or a tiny wrapper; avoid Express/Fastify unless there's a concrete reason."* The service surface is small (`POST /shorten`, `GET /:code`) — two routes don't justify a framework. A small in-file `match(method, path)` helper does the job, keeps deps minimal, and stays fast. Re-evaluate at the edge of v1 only if endpoints multiply.

### 4. URL validation → **`new URL()` constructor + http/https scheme allowlist**

**Options considered:**
- A. **`new URL(input)` constructor** — Node's built-in WHATWG URL parser. Throws on invalid input; gives `.protocol`, `.hostname`, etc. Pick this if you want spec-correct parsing.
- B. **Regex** (`/^https?:\/\/.+/`-shaped) — fast, simple. Pick this if you only care about gross shape.
- C. **A library (e.g., `valid-url`)** — additional dep, broader heuristics. Pick this if you want pre-canned protocol blocklists (`javascript:`, `data:`).

**Recommended:** A + scheme allowlist. **Locked: A + scheme allowlist `{ http, https }`.**

**Reasoning:** Regex (B) misses `javascript:` URLs — that's an XSS vector if redirects ever land in HTML un-escaped, and even without that, `javascript:`/`data:` URLs are not a meaningful "redirect target." A library (C) just wraps A. Using `new URL()` and explicitly allowlisting `http://` and `https://` rejects all the surprising schemes for free, with no deps. Validation also rejects URLs longer than a sane cap (e.g., 2,083 chars — IE-era max but a useful sanity bound) to avoid ID-of-DB-row attacks.

### 5. Configuration → **Environment variables with safe defaults**

**Options considered:**
- A. **Hardcoded defaults**. Pick this if it's truly a one-machine deployment and you commit the config.
- B. **Env vars with safe defaults** (`PORT`, `DB_PATH`, `BASE_URL`). Pick this if you ever want to vary deployment without recompiling.
- C. **Config file** (`config.json` or `.env` parser). Pick this if config is multi-dozen keys.

**Recommended:** B. **Locked: B.**

**Reasoning:** Three knobs (port, database path, base URL for short links) don't justify a config file (C) or .env parser. Hardcoding (A) makes deployment painful even at v1. Env vars with defaults are the lowest-friction shape: `PORT=8080 DB_PATH=./shortener.db BASE_URL=http://localhost:8080 node src/server.js`.

## Deferred Decisions

- **Custom (vanity) codes** — explicitly out of scope for v1 in PROJECT.md.
- **Rate limiting / abuse detection** — out of scope for v1; revisit if/when the service is exposed publicly. Will require coupling between storage layer and request middleware.
- **Click analytics** — out of scope for v1.
- **Multi-instance deployment** — out of scope for v1; SQLite is single-process. Revisit when storage swaps to Postgres.
- **Token-budget review of EXECUTE skills** — PLAN will measure actual loaded skill cost; if EXECUTE bumps near 40K, surface in /sig:plan's validation pass.

## Assumptions

- **Single Node process.** No clustering, no PM2 fork mode, no multi-worker. SQLite handles its own locking but only safely under single-process write.
- **`crypto.randomBytes` is available** (Node 22+ guaranteed).
- **Redirects use 302 (Found), not 301 (Moved Permanently).** Rationale: 302 is non-cacheable, lets us delete codes if needed without poisoned client caches. Trade: minor extra DNS hit per redirect; not material at v1.
- **The service is reachable on a single hostname.** `BASE_URL` is a single value; multi-tenant short-domains is out of v1.
- **No charset normalization on stored long URLs** — we store exactly what the client submitted (after `new URL()` re-parses it; that does perform IDN/percent normalization, which is acceptable).

## Last Updated
2026-04-26
