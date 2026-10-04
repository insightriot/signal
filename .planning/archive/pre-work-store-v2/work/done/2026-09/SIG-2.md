---
id: SIG-2
type: BUG
status: C
title: FUTURE-IDEAS footer drift — new entries could land below the `*Last
  updated:*` footer.
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:20
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B2
---
| B2 | `fixed` | P2 | **FUTURE-IDEAS footer drift — new entries could land below the `*Last updated:*` footer.** Once any content sat below a stranded mid-file footer, `insertAboveFooter` buried every subsequent `/sig:add` above it. **Fixed in v0.1.5 (M4.5.E10.S3):** `insertFutureIdeasEntry` footer-repair (relocate footer to EOF + absorb stranded content, announce) + `lintFutureIdeasFooter` dogfood lint. Migrated from FUTURE-IDEAS 2026-07-13 (v0.1.6.S4). |