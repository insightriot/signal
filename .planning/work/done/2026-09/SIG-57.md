---
id: SIG-57
type: BUG
status: C
title: "`/sig:sweep` walks the migrate snapshot backup and reports a frozen
  directory as broken live docs — 92% noise on a…"
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:96
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B57
---
| B57 | `fixed` | P2 | **`/sig:sweep` walks the migrate snapshot backup and reports a frozen directory as broken live docs — 92% noise on a real project.** `/sig:migrate-memory` writes a pre-reorg snapshot to `.planning/.migrate/snapshot/` before relocating anything; its links point at **pre-migration paths by design**. `WALK_IGNORE` (`tools/lib/doc-hygiene.js:40`) already exempts `archive/` for exactly this reason (AC1.2) and simply never listed `.migrate`. **Found 2026-08-01 by the first run of `/sig:sweep` against real non-Signal projects** (eval-project-C, eval-project-A, eval-project-F, eval-project-D) — the FR1-first-use discipline shipped in v0.1.15, applied the day after it shipped. eval-project-A reported **12 structural findings; 11 were snapshot links**. **This is the precision failure M5.E16's FR2 exists to prevent, present in the tool today:** a report that is 92% noise gets muted within a week, and a muted checker looks like coverage while providing none — the same reasoning that deleted M5.E9's REVIEW Critical rather than re-tuning it. **Fixed 2026-08-01 (`.migrate` added to `WALK_IGNORE`, RED-first):** eval-project-A 12 structural → **2, both real** (a stale INDEX and a genuine link escaping the repo root into `~/.codex/`). Control test asserts a dead link in *live* `.planning/` is still flagged, so the exemption is scoped, not a mute. |