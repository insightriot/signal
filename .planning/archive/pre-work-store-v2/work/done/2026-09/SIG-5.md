---
id: SIG-5
type: BUG
status: C
title: "`npm run lint` is broken — ESLint v9 with no flat config."
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:24
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B5
---
| B5 | `fixed` | P3 | **`npm run lint` is broken — ESLint v9 with no flat config.** `package.json` pins `eslint ^9.0.0` (installed 9.39.4), which requires an `eslint.config.js`; none has ever been committed, so `npm run lint` exits 2 (`ESLint couldn't find an eslint.config.(js\|mjs\|cjs)`). **Pre-existing** (predates v0.1.6 — no lint config in git history; v0.1.6 touched none of it). Not a blocker: `npm run validate` (the plugin validator + 889-test vitest suite) is the effective quality gate. Surfaced during v0.1.6 VERIFY (2026-07-13). Fix = add a flat `eslint.config.js` (separate chore). |