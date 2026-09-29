---
id: SIG-3
type: BUG
status: C
title: "`/sig:add` derived-title cut mid-clause."
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:21
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B3
---
| B3 | `fixed` | P3 | **`/sig:add` derived-title cut mid-clause.** `deriveHeading` (`add.js`) sliced the first ~6 words / 60 chars, landing mid-clause (the "STATE.md append-without-evict" capture headed "closed-work narrative must"). **Fixed in v0.1.6 (FR4, `16155b3`):** prefer the first em-dash/`.`/`:`/`,` boundary (followed by whitespace; em-dash not hyphen; ≥20-char floor) before the length cap, word-slice fallback. Shared helper → all 3 capture destinations. |