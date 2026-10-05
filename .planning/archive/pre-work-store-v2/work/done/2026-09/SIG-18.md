---
id: SIG-18
type: BUG
status: C
title: "`regeneratePlanningIndex('.')` / `enumeratePlanningDocs('.')` corrupt
  INDEX.md when `baseDir` is `'.'`."
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:43
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B18
---
| B18 | `fixed` | P3 | **`regeneratePlanningIndex('.')` / `enumeratePlanningDocs('.')` corrupt INDEX.md when `baseDir` is `'.'`.** The doc-key derivation does `full.slice(baseDir.length + 1)` assuming `baseDir + '/'` prefixes every walked path. With `baseDir='.'`, `path.join('.', '.planning')` normalizes to `.planning` (no `./`), so `baseDir.length` is 1 and `slice(2)` chops the first two chars → mangled keys (`lanning/DECISIONS.md`), a `{written:true}` diff, and garbage written over INDEX.md. **Latent, not a live break:** every shipped caller (`migrate-memory.js` tail regen, `ship.md`, `commands/index.md`) passes an absolute / `process.cwd()` baseDir, so the canonical path is unaffected; only a `'.'` (or other non-prefix-normalized) baseDir triggers it. Confirmed root cause 2026-07-19 (M5.E3 S6b dogfood curation — bit the curation pass once; recovered from the staged copy). **Fix:** `resolve(baseDir)` at entry (or compute the rel key via `path.relative(baseDir, full)` instead of `slice`). Separate ticket. |