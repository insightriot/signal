---
id: SIG-1
type: BUG
status: C
title: '`/sig:checkpoint` "Epic-ID-as-task-ID" + "only 2 of 5 commits".'
source: migration:BUGS.md
source_ref: BUGS.md:19
close:
  reason: rejected
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B1
---
| B1 | `dismissed` | — | **`/sig:checkpoint` "Epic-ID-as-task-ID" + "only 2 of 5 commits".** Non-bug (triaged 2026-06-06). `isStateStale` deliberately filters the commit walk to `STATE_AFFECTING_PATHS` (`state.js:583`, D6 — editing future-ideas / decisions / milestone files is metadata curation, excluded by design), so 2-of-5 counting is correct. `TASK_ID_RE` (`checkpoint.js:25`) intentionally matches every hierarchy level, so `taskIdsInCommits` can include Epic/milestone IDs — harmless: it only filters `current_tasks`, which holds full task IDs. Surfaced from unverified surface behavior during a `markFresh` detour; reading the source dismissed it. |