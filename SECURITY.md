# Security Policy

## Supported Versions

| Version | Supported |
|---|---|
| 0.1.x (latest) | ✅ |
| < 0.1.x (earlier patch versions) | ❌ — upgrade to latest |

Pre-1.0 versioning: minor bumps may include breaking changes; only the latest patch line receives security fixes.

## Reporting a Vulnerability

**Preferred:** Open a private vulnerability advisory at <https://github.com/InsightRiot/signal/security/advisories/new>. This keeps the report confidential until a fix is ready.

**Backup:** Email `brett@insightriot.com` with subject `[security] Signal: <one-line>`.

We will acknowledge within ~72 hours, best-effort. Signal is solo-maintained at pre-1.0; there is no formal SLA.

## Disclosure

Fixed issues are noted in `CHANGELOG.md` against the version that contains the fix. Pre-disclosure coordination — embargo windows, credit attribution, advisory drafts — happens in the private advisory thread.

## Scope

**Covered by this policy:**

- The plugin source in this repository — slash commands, agents, skills, tools, hooks, and the `.planning/` state-management code.
- The bundled validator and CLI helpers under `tools/`.

**Not covered (report upstream):**

- **Claude Code itself** — report to Anthropic through their channels (<https://www.anthropic.com/security>).
- **Your own project's code** — Signal manages `.planning/` files inside your repo, but vulnerabilities in the code Signal helps you write are yours to triage.
- **Transitive npm dependencies** — report to the upstream package maintainer. Signal currently has one runtime dependency (`yaml`) and three development dependencies (`vitest`, `esbuild`, `eslint`); see `package.json`.

If you are not sure whether something is in scope, file the report anyway — we will route it to the right place.
