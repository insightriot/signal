---
schema_version: 1
docs_layout_version: 3
phase: SHIP
current_epic: M6.E8
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-09-14)
  - PLAN (2026-09-14)
  - EXECUTE (2026-09-14)
  - VERIFY (2026-09-14)
  - REVIEW (2026-09-14)
  - EXECUTE (2026-09-14)
  - REVIEW (2026-09-14)
  - EXECUTE (2026-09-14)
  - REVIEW (2026-09-24)
  - SHIP (2026-09-24)
blockers: []
last_completed_task:
  id: t3.4
  status: done
  commit: 3e377ce
  completedAt: 2026-09-14T12:41:57.391Z
last_decision_at: 2026-09-14T12:41:57.391Z
last_updated_commit: ff74986
last_updated: 2026-09-24T20:12:29.670Z
---
# Project State

## Resume pointer

### ▶ WHERE THE WORK IS — read this first (2026-09-25)

**`M6.E8` SHIPPED as `v0.1.41` (2026-09-25)** — PR #254 merged with `--merge`; the release also carries
the `/sig:resume` phase-count fix (`B124` + `B47`, PR #255). Retro:
[`M6.E8-RETROSPECTIVE.md`](M6.E8-RETROSPECTIVE.md). Its resume pointer and this file's stale
`In-flight` section were relocated verbatim to
[`archive/M6/E8/STATE-NARRATIVE.md`](archive/M6/E8/STATE-NARRATIVE.md).

**Next: `M6.E3` is UN-PARKED (`D-BR0925-5`), rebuilt around TypeSafe's Jev** as an optional,
bring-your-own-key judge (`D-BR0925-1`). Start at `/sig:discuss`. Evidence:
[`../analysis/TYPESAFE-JEV-ASSESSMENT.md`](../analysis/TYPESAFE-JEV-ASSESSMENT.md) §6 — on this
repository's own `STATE.md`, Jev found 4 of 4 stale claims where the shipped check found 0. The
frontmatter still reads `M6.E8` / `SHIP` until `/sig:discuss` opens the next Epic.

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

**`M6.E8` is shipped; nothing is being built.** `M6.E3` opens next at DISCUSS (see the resume pointer).

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
