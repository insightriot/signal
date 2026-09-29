---
id: SIG-67
type: BUG
status: T
title: Nothing detects a second, rival index — the freshness check only ever
  looks at the one file it manages.
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:106
legacy_id: B67
---
| B67 | `confirmed` | P3 | **Nothing detects a second, rival index — the freshness check only ever looks at the one file it manages.** `checkIndexFreshness` reads exactly `.planning/INDEX.md` (`sweep.js:68-70`); `isForeignIndexFormat` (`planning-index.js:131-138`) judges **that one file's** format and downgrades a hand-written one to advisory. Neither notices that a *different* index-shaped artifact exists alongside it. **Found by hand at eval-project-A 2026-08-02:** `.planning/llms.txt` at **1182 lines**, still carrying four dead rows, against a **482-line** `INDEX.md` — two indexes disagreeing about the same corpus, with no way to know which an agent would read first (they had to grep across `mjs/ts/tsx/json/yml/md` to establish that nothing did). **The shape was anticipated and never checked for:** `references/doc-runtime-model.md:178` names `llms.txt` explicitly, as out-of-scope for discovery. Out-of-scope for generation is not the same as absent from the tree. **Fix shape:** flag a second index-shaped artifact in `.planning/` as a finding, since the failure is contradiction rather than staleness and the freshness check cannot express it. |