---
id: SIG-98
type: BUG
status: C
title: "`tools/measure-corpus.js` pins only labels `A`–`E` by hash; `F` onward
  are handed out by `spare.shift()` over a…"
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:201
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B98
---
| B98 | `fixed` | **P2** | **`tools/measure-corpus.js` pins only labels `A`–`E` by hash; `F` onward are handed out by `spare.shift()` over a hash-sorted list, so adding or removing one corpus project renames every unpinned project.** Found 2026-08-13 by the independent `/code-review` pass on `M5.E10` and confirmed by reading `measure-corpus.js`. The comment immediately above the code says *"Labels must be STABLE across runs and consistent with the ones already used in Signal's documents"*; `references/eval-corpus.md` says *"`eval-project-A` is the same project in every document that mentions it, so evidence stays traceable across releases"*; and `CLAUDE.md` cites `eval-project-L` by name. **For A–E all three statements are true. For F–L none of them are.** The corpus is a live set of directories, so its membership does change — `M5.E10`'s own measurement moved `FR8` from 5 to 4 to 5 in two days for exactly that reason. Every recorded measurement naming a project past `E` is therefore **quietly incomparable across releases**, which is the failure the comment says positional labelling already caused once. *Fix:* derive the letter deterministically from the hash rather than from list position, or pin all 13. Pairs with `B97`, which needs the same decision about which letter each project takes. **FIXED 2026-08-13 (`M5.E10`)** — all 13 pinned by hash in `measure-corpus.js`; a new project takes the next free letter and keeps it, and a departing project does **not** free its letter (reuse would make two projects share a label across releases, which is the whole failure). **Brett's call, recorded:** pin today's mapping and publish the caveat rather than reconstruct `F`–`L` by hand — the original assignment was never recorded and reconstruction would be a guess. `references/eval-corpus.md` now says that references to `F`+ predating this date may not resolve to the same project. **Confirmed live while fixing it:** the mapping moved twice inside ten minutes, and one project shifted `M` → `L` between two runs. |