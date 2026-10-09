# Open Questions

> Unresolved questions for the **current** phase that need a decision before the next step can proceed. Cleared as they are answered. Work-item-shaped questions go to `.planning/BACKLOG.md` (or `.planning/BUGS.md` for defects).

---

## Currently blocking

**None.** The project is paused after v4.1 closed. The only outstanding item is a time-gated header change (earliest 2026-04-01), which is mechanical, not a decision.

When the next milestone starts, this file will be refilled with that cycle's questions.

---

## Resolved during v4.1 (kept for reference)

### R3 — Missing delete policy on `pantry_events`

**Status:** Fully resolved. Filed as Issue #12 during v4.1 PLAN (2026-02-10). Root cause fixed by adding the delete policy in migration `0007_pantry_events_delete.sql` (PR #20, 2026-02-14).

### Issue #45 — `unsafe-eval` header violation

**Status:** Resolved. Diagnosed during the v4.1 observation window as the schema library's runtime feature probe. Fixed by turning the probe off in `src/lib/schemas.ts` (PR #22, 2026-02-15).

### NFR-04 — empty catch blocks at API boundaries

**Status:** Resolved at REVIEW phase. Audit found 9 catch sites: 6 intentional, 3 real gaps, all fixed in PR #23 (2026-02-16).

---

## Last Updated
2026-02-16 — v4.1 cycle closed; paused. Three R-questions resolved during the cycle. No blocking questions.
