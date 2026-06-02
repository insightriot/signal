# PROJECT.md — URL Shortener Service

## Vision

A production-grade URL shortener service exposed via HTTP. Users submit a long URL and receive a short, opaque, collision-resistant code; visiting the short URL redirects to the original. The service is intended to be deployed as a public-facing endpoint and stores user-submitted data persistently.

## Problem Statement

Long, complex URLs are awkward to share, paste, scan, or include in length-constrained channels (SMS, social posts, print). A URL shortener trades one indirection (a redirect hop) for portability. The service must be reliable enough that the short codes don't break — once issued, a short URL is a public contract.

## Success Criteria

1. **Create:** `POST /shorten` accepts a JSON body with `{ "url": "<absolute-url>" }` and returns a JSON body with `{ "code": "<short-code>", "shortUrl": "<full-short-url>" }`. 201 Created on success; 400 Bad Request with structured error body on invalid input.
2. **Resolve:** `GET /:code` returns a 302 redirect to the stored long URL. 404 Not Found with structured error body if code is unknown.
3. **Persistence:** restart-survival — codes minted before a process restart still resolve after it.
4. **Collision resistance:** short codes are deterministically generated from a sufficiently large keyspace that collisions are negligible at expected scale (≥10⁶ codes).
5. **Validation:** rejects non-absolute URLs, missing schemes, and obviously malformed input. Does NOT validate reachability of the target — that's not the service's job.
6. **Tests:** the test suite covers the happy path, each documented error case, and the persistence-across-restart case.

## Scope

**In scope:**
- HTTP service in Node.js (no framework lock-in mandate; use what's idiomatic).
- File-based persistence (e.g., SQLite or a JSON file with proper write semantics) — adequate for v1; swappable interface for future Postgres.
- A small CLI smoke-test or curl recipes documented in README.

**Out of scope (v1):**
- User accounts, auth, or per-user shortening — anyone with the endpoint can shorten.
- Rate limiting, abuse detection, blocklists.
- Analytics (click counts, geo, referer tracking).
- Custom (vanity) codes — codes are system-generated.
- Front-end UI — service-only.
- Multi-instance deployment with shared storage — single-process only.

## Constraints

- **Runtime:** Node.js 22+.
- **No heavy framework:** prefer Node's `node:http` or a tiny wrapper; avoid Express/Fastify unless there's a concrete reason.
- **Storage:** file-based (single process). The storage layer is a small interface so it's swappable later.
- **Tests:** vitest. TDD discipline — tests precede implementation.
- **Lint/format:** none mandated (keep it simple); rely on consistent style.

## Done When

- All success criteria pass an automated test.
- A round-trip can be demonstrated via curl: `POST /shorten → 201 with code → GET /<code> → 302 to original URL`.
- A README documents install, run, and the API contract.
- A code review pass (REVIEW phase) finds no high-severity issues.
- The git history is clean (one logical commit per task; no fix-up noise).
