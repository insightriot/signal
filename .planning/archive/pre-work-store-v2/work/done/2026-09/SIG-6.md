---
id: SIG-6
type: BUG
status: C
title: "`/sig:resume` + `/sig:status` origin-drift banner false-positives on
  your own just-pushed checkpoint commit."
priority: P3
source: migration:BUGS.md
source_ref: BUGS.md:25
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B6
---
| B6 | `fixed` | P3 | **`/sig:resume` + `/sig:status` origin-drift banner false-positives on your own just-pushed checkpoint commit.** `isStaleVsOrigin` compares `origin/main` to STATE's `last_updated_commit`, **not** to local `HEAD`. A STATE-writing commit leaves `last_updated_commit` one behind `HEAD` (it records the last *work* commit; the bookkeeping commit is the "+1"), so right after a clean checkpoint+push, resume shows `⚠ origin is 1 commit ahead … git pull` even though local `HEAD` == `origin/main` and there is nothing to pull. Confirmed 2026-07-15 (M4.5.E11.S1 close): `{stale:true, aheadCount:1, touchedPlanning:true}` while `git rev-list HEAD..origin/main` = 0. Advisory + fail-open, so harmless — but the "git pull" advice is misleading at the exact resume-trust moment E10 was built to protect. **Fix:** gate the banner on `git rev-list HEAD..origin/main > 0` (a genuine remote push — local actually *behind* origin), not merely on the STATE baseline lagging. Adjacent to M4.5.E10/E11 resume-trust work. *(Re-observed 2026-07-16 during the M5.E1 `/sig:resume` — both the local-stale and origin-drift banners fired on the `markFresh after PLAN close` commit while local HEAD == origin/main; same root cause. The local-stale side is the same "+1 bookkeeping commit" lag.)* |