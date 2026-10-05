---
id: SIG-80
type: BUG
status: C
title: "`ADHERENCE-LOG.md` carries three kinds of annotation and `NOTICE_KINDS`
  knows two, so the third was hand-written into…"
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:113
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B80
---
| B80 | `fixed` | P3 | **`ADHERENCE-LOG.md` carries three kinds of annotation and `NOTICE_KINDS` knows two, so the third was hand-written into an append-only log.** `tools/lib/adherence-log.js:187-191` freezes `NOTICE_KINDS` to `INVALIDATED` and `QUALIFIED`, and `appendNotice` **throws** on any other kind. But the log's `INDETERMINATE` record carries a `> ### ⚠ DIAGNOSED` block (`.planning/ADHERENCE-LOG.md:205`), and `grep -rn DIAGNOSED tools/ tests/` returns **nothing** — so that block cannot have come from `appendNotice`. It was written by hand into the one file whose integrity guarantee is *"structural, not procedural"* (`appendRunRecord`'s header: there is no code path that reads an existing record, so there is none that can rewrite one). The guarantee holds for **records**; annotations have no such protection, and the only supported way to add one silently mislabels a diagnosis as a qualification. **Found 2026-08-04 at M5.E15 DISCUSS**, while establishing how M5.E8's unisolated `OBEYED` should be amended (`D-M5E15-7`) — i.e. by the next person who needed the mechanism, which is the same way `B55` was found. **In scope for M5.E15 (AC7.3):** whichever kind FR7 uses must exist in code, or this Epic's own amendment is a second hand-edit. Same class as `B39` and `B54` — a convention that lives in a document while the code knows a smaller version of it. **✅ FIXED in v0.1.19 (M5.E15), 2026-08-06.** `DIAGNOSED` is a real kind in `NOTICE_KINDS` — a finding about the *instrument*, where the number stands and what it could ever have shown is what changed. An unknown kind still throws. M5.E8's `OBEYED` record now carries its unisolated stamp appended **from code**: the first annotation in that log not written by hand, and `appendNotice`'s first production caller. |