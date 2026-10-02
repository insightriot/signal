---
schema_version: 1
docs_layout_version: 3
phase: VERIFY
current_epic: M6.E12
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-10-01)
  - PLAN (2026-10-01)
  - EXECUTE (2026-10-02)
blockers: []
last_completed_task: null
last_decision_at: 2026-09-29T14:06:07.617Z
last_updated_commit: af5b1d4e033c022256cdfaad94240b46872100ea
last_updated: 2026-10-02T00:54:26.854Z
---
# Project State

## Resume pointer

### ▶ WHERE THE WORK IS — read this first (2026-10-01)

**`M6.E11` SHIPPED as `v0.1.43`** (PR #263, merged 2026-09-30): the work-item store, step 1 of
[`analysis/WORK-ITEM-SYSTEM-DESIGN.md`](../analysis/WORK-ITEM-SYSTEM-DESIGN.md). Retro:
[`M6.E11-RETROSPECTIVE.md`](M6.E11-RETROSPECTIVE.md).

**Next, in this order (agreed with Brett 2026-10-01):**
1. ~~**`B118`** (`SIG-118`) — `/sig:drive` and `/sig:advise` read one branch's `.planning/`.~~
   **Fixed in `v0.1.44`** (`tools/lib/branch-work.js`, shared by both).
2. **`/sig:advise` stops ranking by age** — it reviews the docs for the big picture, proposes 3–5
   big-picture priorities, and asks the user to choose.
3. **Steps 2–5 of the work-item store** — step 5 is what moves other projects over via
   `/sig:docs-migrate`.

### ▶ PREVIOUS — `M6.E3` SHIPPED

**`M6.E3` — SHIPPED as `v0.1.42`: PR #260 merged 2026-09-28 with `--merge` (merge commit `6cc50a0`),
tagged and released.** The Jev checks run as advice with receipts: the `STATE.md` check at
`/sig:resume` and SHIP, and the bug-fixed check at SHIP. A model finding cannot refuse, by declaration. Retro:
[`M6.E3-RETROSPECTIVE.md`](M6.E3-RETROSPECTIVE.md).

- **VERIFY:** 2 loops. Loop 1 failed (`AC4.2` plus two receipts quoting unjudged text). `AC4.1`/`AC4.2`
  were revised (`D-M6E3-17`). 44 of 44 live criteria met, 6 of them with a stated limit.
- **REVIEW:** 3 passes, each by three fresh-context reviewers. Pass 1 found 13 Important; pass 2
  found defects in pass 1's fixes, one High (the `.env` check bypassed by filename case); pass 3
  found 0 Important. The leftovers are one BACKLOG row, *"Jev key and receipt hardening"*.
- **Re-measured live after REVIEW:** the `STATE.md` check found 4 of 4 with 0/26 false alarms; the bug
  check flagged B102 only (p 0.63). Output: `analysis/jev-spike/runs/`.
- **Filed:** `B126` (the coverage tool counts mentions as verified), `B127` (a BACKLOG heading saying
  "done" hid the in-flight Epic from `/sig:advise`).
- **Next Epic, by Brett's direction:** redesign how Signal records status, so that "done" is recorded
  when it happens (`D-M6E3-16`). ~~Its first question is Brett's: a marker in the files, or GitHub
  Issues.~~ Answered by `D-BR0928-7`; **shipped as `M6.E11` in `v0.1.43`** (the work-item store, step 1; PR #263).

### ▶ PREVIOUS — `M6.E8` SHIPPED as `v0.1.41` (2026-09-25)

PR #254 merged with `--merge`; the release also carries the `/sig:resume` phase-count fix (`B124` +
`B47`, PR #255). Retro: [`M6.E8-RETROSPECTIVE.md`](M6.E8-RETROSPECTIVE.md). Narrative relocated to
[`archive/M6/E8/STATE-NARRATIVE.md`](archive/M6/E8/STATE-NARRATIVE.md).

### ▶ PREVIOUS — `M6.E7` shipped and merged (PR #239), 2026-09-06. Narrative relocated.

Relocated verbatim to [`archive/M6/E7/STATE-NARRATIVE.md`](archive/M6/E7/STATE-NARRATIVE.md) on 2026-09-14
(STATE.md over its 40 KB ceiling). Retro: [`M6.E7-RETROSPECTIVE.md`](M6.E7-RETROSPECTIVE.md); `B117`, `B119`.

### ▶ PREVIOUS — `M6.E6` SHIPPED and merged (PR #236), 2026-09-04. Narrative relocated.

Moved verbatim to [`archive/M6/E6/STATE-NARRATIVE.md`](archive/M6/E6/STATE-NARRATIVE.md) to keep
this file under its byte ceiling. Retro: [`M6.E6-RETROSPECTIVE.md`](M6.E6-RETROSPECTIVE.md).

## ~~▶ NEXT WORK — agreed 2026-08-06, in this order~~ · **CLOSED — all three shipped. Relocated.**

Relocated verbatim to [`archive/M5/STATE-NEXT-WORK-2026-08-06.md`](archive/M5/STATE-NEXT-WORK-2026-08-06.md)
on 2026-09-14 (STATE.md over its 40 KB ceiling). **The live queue is [`BACKLOG.md`](BACKLOG.md)** (`D-M5E18-1`).

## In-flight

None in flight. Next: the `/sig:advise` priorities redesign — see *Where the work is* above.

## Blockers

None.

## Pending ops

None currently open.

## Closed work
- M5.E10 — evicted to .planning/archive/M5/E10/STATE-NARRATIVE.md · card: M5.E10-RETROSPECTIVE.md

- **M5.E8** (The measurement foundation) — SHIPPED as **v0.1.13** (2026-07-28). The adherence harness + the published coverage ceiling (**91/407 = 22.4%** trace-measurable). First verdict: `B41-phase-entry` **OBEYED** (3/3 vs 0/3). 1652→1736 tests; VERIFY PASS (28 ACs); REVIEW PASS-WITH-FIXES (1 Critical — the source commit was captured after the run, defeating `--combine`'s pairing guard). New: **B48** (P2, live), **B49** (P3, fixed). → [M5.E8-RETROSPECTIVE.md](M5.E8-RETROSPECTIVE.md).
- **M5.E9** (Linear mode & the phase ledger) — SHIPPED as **v0.1.12** (2026-07-27), **ran ahead of E8** (D-M5E9-2). Closed B41–B45; `[BREAKING]` `completed_phases` became an append-only trimming log. 1623→1652 tests. → [M5.E9-RETROSPECTIVE.md](M5.E9-RETROSPECTIVE.md).
- **M5.E6** (Doc-runtime close-out — maintenance-command half) — SHIPPED as **v0.1.11** (2026-07-25). `/sig:sweep` + roster 17→18 + FR3 map line + FR7 close-out & B31 + cleared B27/B28/B29/B30; 1561→1623 tests; VERIFY PASS (strict, mutation proof-of-fail), REVIEW PASS (3-specialist panel, 0 false-greens). New `needs-triage`: B32–B36 (incl. **B36** — FR1 gate stale-row blind spot found dogfooding the ship). → [M5.E6-RETROSPECTIVE.md](M5.E6-RETROSPECTIVE.md).
- **M5.E5** (v0.1.10 carry-over bug squash) — SHIPPED as **v0.1.10** (2026-07-21). B24/B25/B26 + B6 refinement fixed, RED-first; 1529→1561 tests; REVIEW PASS (0 false-greens, 12-case mutation matrix); **B26 dogfooded on its own SHIP**. New carry-overs B27–B30 deferred (`needs-triage`). → [M5.E5-RETROSPECTIVE.md](M5.E5-RETROSPECTIVE.md).
- **M5.E4** (Bug & doc-runtime hygiene close-out) — SHIPPED as **v0.1.9** (2026-07-21). 12 confirmed bugs fixed/dismissed + FR5 concurrency-lock; 1492→1529 tests; REVIEW PASS-WITH-FIXES (evict.js false-green security bypass caught + fixed in-phase). B24 + the B6 refinement deferred to v0.1.10. → [M5.E4-RETROSPECTIVE.md](M5.E4-RETROSPECTIVE.md).
- **M5.E1 + M5.E2 + M5.E3** — the doc-runtime, SHIPPED together as **v0.1.8** (2026-07-20): canonical doc-model + eviction (E1), auto-sensing `/sig:migrate-memory` (E2), all-docs hygiene + living `BACKLOG.md` + append-log eviction + auto `/sig:index` (E3). → [M5.E3-RETROSPECTIVE.md](M5.E3-RETROSPECTIVE.md) (+ E1/E2 retros).
- Pre-M5.E1 project history (the full pre-schema_v1 narrative) → [STATE-HISTORY.md](STATE-HISTORY.md).
