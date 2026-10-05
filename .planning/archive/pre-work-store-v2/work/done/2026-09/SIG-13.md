---
id: SIG-13
type: BUG
status: C
title: "`tools/lib/migrate-memory.js` has a literal NUL byte (~offset 57833)
  that makes `grep` treat the whole file as binary…"
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:36
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B13
---
| B13 | `fixed` | P3 | **`tools/lib/migrate-memory.js` has a literal NUL byte (~offset 57833) that makes `grep` treat the whole file as binary (returns nothing).** In `computeDanglingDelta` a map key uses a raw NUL delimiter `` `${d.file}<NUL>${d.link}` `` written as an actual NUL in source, not the `\0` escape. Functional (the key works), but plain `grep`/`grep -n` on the file silently returns nothing — every agent working M5.E2 hit this and had to fall back to `rg -a`/node (it's the "grep glitchy in this sandbox" note that recurred). Dev-experience regression, not a runtime defect. **Fix:** replace the raw NUL with the `\0` escape sequence (byte-identical behavior, restores greppability). Surfaced during M5.E2 VERIFY (B12 work), 2026-07-18. **→ Fixed 2026-07-18 (`50ad065`):** raw NUL → `\0` escape at the `computeDanglingDelta` key; byte-identical behavior, `grep` restored (38 exports now visible, was 0). **→ Recurrence in `.planning/BUGS.md` itself, fixed 2026-07-25 (found at `/sig:resume`):** this entry re-introduced the byte — the writeup above pasted the offending source snippet verbatim, NUL included, so **BUGS.md became grep-blind** from `5062526` until this fix (`grep -c needs-triage .planning/BUGS.md` → no output, exit 1; `grep -a` → 8). Sharper edge than the source case: BUGS.md is the file agents grep to check bug status, so the failure mode is a silent "no open bugs" read. Fixed by rendering the delimiter as the placeholder `<NUL>`; Node/`fs` reads were never affected. **Lesson:** never paste a raw control byte into a bug writeup — describe it. |