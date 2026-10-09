# Open Questions

> Things we have to decide before the **current** step can finish. An entry leaves once decided; anything that is really a task belongs in `.planning/BACKLOG.md` (defects in `.planning/BUGS.md`).

---

## Currently blocking

**None.** Nothing is in progress since v4.1 shipped; one config change is waiting for a date (not before 2026-04-01) and needs no decision.

New questions will appear here once the next round of work begins.

---

## Resolved during v4.1 (kept for reference)

### R3 — Missing delete policy on `pantry_events`

**Status:** Fully resolved. Logged as Issue #12 on 2026-02-10; the missing rule was added in `0007_pantry_events_delete.sql` (PR #20, 2026-02-14), so deletes now take effect.

### Issue #45 — `unsafe-eval` header violation

**Status:** Resolved. The warning came from a check the form library runs on start-up; a setting in `src/lib/schemas.ts` switches it off (PR #22, 2026-02-15).

### NFR-04 — sync worker swallows its own errors

**Status:** Resolved at REVIEW. The worker now logs and rethrows; two quiet spots were kept on purpose (PR #23, 2026-02-16).

---

## Last Updated
2026-02-16 — v4.1 shipped and work is paused; the three questions above were settled along the way.
