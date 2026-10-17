---
schema_version: 1
docs_layout_version: 3
phase: EXECUTE
current_epic: M6.E17
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-10-15)
  - PLAN (2026-10-15)
  - EXECUTE (2026-10-16)
  - VERIFY (2026-10-16)
  - EXECUTE (2026-10-17)
  - VERIFY (2026-10-17)
  - REVIEW (2026-10-17)
blockers: []
last_completed_task:
  id: M6.E17.S3
  status: done
  commit: 76b00d5a
  completedAt: 2026-10-15T19:01:26.668Z
last_decision_at: 2026-10-15T19:01:26.668Z
last_updated_commit: 813d2eb33dc254c8c95b8f8a6f4822f9f1b191c9
last_updated: 2026-10-17T02:56:22.385Z
phase_passes:
  - VERIFY FAIL (2026-10-16)
  - VERIFY PASS-WITH-FIXES (2026-10-16)
  - REVIEW FAIL (2026-10-17)
---
# Project State

## Resume pointer

### ▶ WHERE THE WORK IS — read this first (2026-10-14)

**`M6.E16` — *"Epics and units as records"* — SHIPPED as `v0.1.51` and CLOSED (2026-10-14).** PR #301
merged with `--merge` (`d0df0ef5`) on Brett's word, after a fresh read of the last fix found nothing
that blocks. Tag `v0.1.51` and the GitHub release are published. `/sig:docs-sweep` on `main` confirmed
the close of `M6.E16` and of `SIG-132`, `-255`, `-288`, `-289`, `-295`, `-305`, `-310`.
Report: [`M6.E16-REVIEW.md`](M6.E16-REVIEW.md). Retrospective:
[`M6.E16-RETROSPECTIVE.md`](M6.E16-RETROSPECTIVE.md).

- **RESUME HERE:** update the installed plugin to `0.1.51` (`claude plugin update sig@signal`) and
  restart the CLI before using `/sig:` commands (`B52`). Then pick the next work from
  [`BACKLOG.md`](BACKLOG.md) (`/sig:advise`). The candidate this Epic left behind is a "harden unit
  records" Epic over the items below, as `M6.E14` was for `M6.E13`.
- **The sweep moved no narrative out of this file** ("nothing in STATE.md to move"). This Epic's
  narrative sits under this resume pointer, not where `evictEpicNarrative` looks. The bullets below
  are kept until the next Epic opens and replaces them.
- **Put off on purpose, on record, to come back to:** `SIG-294`, `SIG-296` … `SIG-322` (in
  `BUGS.md`). From REVIEW: `SIG-303` … `SIG-313`. `SIG-305` and `SIG-310` were fixed in fix round 6
  and are now closed; parts of `SIG-309` and `SIG-311` were fixed there too. They are the
  natural scope of a "harden unit records" Epic, as `M6.E14` was for `M6.E13`. `r5.9`, the last 28
  lines of fixes, was read first by the pull request's reviewer, not by a REVIEW pass.
- **How REVIEW went:** four full passes failed, each in a different corner; pass 3 reached the loop
  ceiling and Brett chose each step after it (`D-M6E16-26` … `-31`).
- **Signal's own cutover is done** (`010262f7`, 2026-10-12): 48 unit records under `work/units/` —
  `M6.E16` open, 43 legacy closes Brett confirmed, 4 Epic IDs closed as dropped (`M5.E11`, `M5.E12`,
  `M5.E14`, `M5.E20`). The Epic table in `MILESTONE-6.md` and `work/EPICS.md` are generated from the
  records. The diff Brett read: [`M6.E16-MIGRATION-DIFF.md`](M6.E16-MIGRATION-DIFF.md).
- **A unit record** holds existence, membership, close with proof and a hold; phase progress stays in
  this file (`D-M6E16-1`). A project without `work/units/` behaves as on `v0.1.50`.
- **S10 was added after S9** for three gaps: a finished Epic's narrative is now evicted when its
  close is confirmed (`SIG-295`, `D-M6E16-19`), `/sig:docs-archive` says how to place a hold
  (`SIG-255`), and one stale archive message (`SIG-289`).
- **Closing, proof not yet on `main`:** `SIG-132`, `SIG-255`, `SIG-288`, `SIG-289`, `SIG-295`.
  Filed and open: `SIG-294`, `SIG-296` … `SIG-302`.
- Requirements: [`M6.E16-REQUIREMENTS.md`](M6.E16-REQUIREMENTS.md). Plan:
  [`M6.E16-PLAN.md`](M6.E16-PLAN.md). Decisions `D-M6E16-1` … `-31`.
- Not done from the small-fix batch: `SIG-285`, `SIG-139`.

### Previously (2026-10-10)

**`M6.E15` — *"move other projects onto the work store"* — SHIPPED in `v0.1.50`: PR #296 merged
2026-10-10 with `--merge` (merge commit `3524cd2`), tagged and released.** `/sig:docs-migrate --work-store` moves a project's hand-kept
lists onto the store: old IDs kept, originals archived byte-for-byte, nothing closed on its own —
entries that look finished, with evidence from the default branch, are proposed and one yes closes
them (`D-M6E15-25`, Brett's call at the REVIEW loop ceiling). REVIEW passes 1–3 failed on a wording
rule closing open entries; pass 4 found 0 Critical. Tests 5426 → 5968. Retro:
[`M6.E15-RETROSPECTIVE.md`](M6.E15-RETROSPECTIVE.md). Decisions `D-M6E15-1` … `-25`. `SIG-274`,
`SIG-286`, `SIG-292` and `SIG-293` were confirmed closed against `main` after the merge. `v0.1.50` is
installed and loaded. **Next:** Brett runs it on corpus project 1 at an Epic boundary, on its default
branch.

### Previously (2026-10-07)

**`M6.E14` — *"harden the work store"* — SHIPPED in `v0.1.49` (PR #292).** Eight work-store defects
fixed before other projects depended on it. Retro: [`M6.E14-RETROSPECTIVE.md`](M6.E14-RETROSPECTIVE.md).

### Previously (2026-10-04)

**`M6.E13` — *"work items as records"* — SHIPPED in `v0.1.48` (2026-10-05; PR #280, release PR #281).**
Epic 1 of the storage re-architecture is done.

**What changed:**
- Work items are JSON records at `.planning/work/items/NN/SIG-n.json`. They never move, and their
  status is folded from recorded events.
- One write library (`plugin/tools/lib/work-records.js`); a hook blocks hand edits to records and
  views.
- Every store-on reader goes through the library, and `/sig:advise` covers cite `SIG-n`.

**Signal's own store was cut over** in `a01d464`:
- 275 records, 145 of them legacy closes;
- 6 closes confirmed against `main`;
- the v1 files are kept in `archive/pre-work-store-v2/`.

Tests: 4444 → 5346. Branch `feat/m6.e13-work-item-records`. Retro:
[`M6.E13-RETROSPECTIVE.md`](M6.E13-RETROSPECTIVE.md). Decisions `D-M6E13-1` … `D-M6E13-22`.

**Also shipped in `v0.1.48`:** SIG-275 (#279), so `checkpointed` no longer asks at every phase end.
**Restart Claude Code** to load `v0.1.48`, which is installed; `v0.1.47` cannot read the v2 store.
**Next:** pick the next work with `/sig:advise` or `/sig:drive`.

**Why this replaced the queued work:** the next pick was moving other projects onto the store; doing that
first would copy the current design into every repo. Reader fixes shipped as `v0.1.46`, `B254` as
`v0.1.47` (both 2026-10-03); `B255` waits for units-as-records. The `/sig:advise` outside test is done
(three runs; findings `SIG-258`…`SIG-262`, `SIG-267`, `SIG-268`).

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

`M6.E16` — see the resume pointer above.

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
