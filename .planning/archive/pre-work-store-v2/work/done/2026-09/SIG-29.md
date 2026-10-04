---
id: SIG-29
type: BUG
status: C
title: The `_afterRead` FR5 test seam destructures `opts._afterRead` (resolves
  inherited props) — an unreachable…
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:56
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B29
---
| B29 | `fixed` | P3 | **The `_afterRead` FR5 test seam destructures `opts._afterRead` (resolves inherited props) — an unreachable prototype-pollution gadget; add an own-property/`typeof` guard (defense-in-depth).** The 6 RMW Cores (`drain.js:476,615,755`, `checkpoint.js:316`, `retro-index.js:235,372`) read `opts._afterRead` and, if truthy, `await` it inside the coarse state lock. **Currently unreachable** (M5.E5 REVIEW security audit, OWASP A08): 0 prod callers pass it (none in `commands/`/`hooks/`), and JSON/CLI input cannot carry a function — only a pre-existing `Object.prototype._afterRead` *function* pollution (which requires code-exec already) could trigger it; worst case is a `TypeError` inside a lock whose promise rejects (fail-safe, lock released) — not RCE, not lock-DoS. **Fix (deferred per the auditor — non-blocking hardening):** gate the seam on `Object.hasOwn(opts, '_afterRead') && typeof opts._afterRead === 'function'`, or key it on a `Symbol`. Surfaced 2026-07-21 (M5.E5 REVIEW). **→ Fixed in M5.E6 (T19, `78c433e`):** the `_afterRead` test seam is gated on `Object.hasOwn(opts,'_afterRead') && typeof …==='function'` at all 6 RMW sites (own-property, not a destructured local) — a prototype-polluted `_afterRead` no longer fires. RED-proven across all 6 paths; the B25 interleaving suite stays unchanged-green. |