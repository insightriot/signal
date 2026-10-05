---
id: SIG-95
type: BUG
status: C
title: "`RETROSPECTIVES.md` orders its rows by file mtime, which git does not
  preserve — so the retro-index freshness check…"
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:203
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B95
---
| B95 | `fixed` | **P2** | **`RETROSPECTIVES.md` orders its rows by file mtime, which git does not preserve — so the retro-index freshness check reports `structural` drift on a fresh clone.** Found 2026-08-13 by `M5.E10`'s own VERIFY, running the Epic's own `checkRetroIndexFreshness` (FR7) against this repository: it reported **stale**, and diffing expected-vs-on-disk showed the difference is **ordering only** — every row present, same text, different sequence. `tools/lib/retro-index.js:227` sorts `(a, b) => b.lastModified.getTime() - a.lastModified.getTime()` where `lastModified` is `stat().mtime` (line 111). **Git stores no mtime**, so a clone, a checkout, a rebase or a stray `touch` rewrites the order while the retros themselves are unchanged. **Why it matters beyond noise:** the check is `structural` severity, so `/sig:sweep` reports a hard finding that carries no information, and the SHIP-time regen (`ship.md` §6) will happily rewrite the file to whatever today's filesystem happens to say — a diff in every release that means nothing. It is also this Epic's own class: a check reporting drift that is not drift, and a document whose order asserts a chronology it did not derive. **Not fixed here** — it is a pre-existing `M4.5.E9` defect surfaced by VERIFY, not `M5.E10` work, and the fix is a design call (sort by the Epic id's natural order, or by a date parsed from the retro's own `**Closed:**` line, which is the data actually claiming chronology). *Repro:* `node -e` diff of `renderIndex(await enumerateRetros(cwd), parseExistingHooks(onDisk))` against the on-disk file. **FIXED 2026-08-13 (`M5.E10`).** Sorted by **descending Epic ID** — a key every retro has by construction and no filesystem operation can change. **The suggested fix was measured out first:** sorting by each retro's own `**Closed:**` date is the field actually claiming chronology, and **3 of 28 retros carry a parseable one**, so 25 would have had no key. The index is therefore deliberately **not** a timeline (`M5.E19` shipped before `M5.E10`) and does not claim to be — an index owes the reader the same answer twice, not a chronology it cannot derive. `retroIndexFreshness` now reports `fresh`. |