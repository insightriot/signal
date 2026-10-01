---
id: SIG-63
type: BUG
status: C
title: "verified in source not documents: `tools/lib/migrate-memory.js:1945`
  opens the fix block naming the bug, and…"
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:102
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B63
---
| B63 | `fixed` (v0.1.18) | P2 | **FIXED — flipped 2026-08-04**, verified in source not documents: `tools/lib/migrate-memory.js:1945` opens the fix block naming the bug, and `explainArchiveOutcome` is appended unconditionally at `:1976`. `CHANGELOG.md` `[0.1.18]` § Fixed listed it while this row still read `confirmed` — **the third instance in one release of the fixed-and-never-flipped pattern this file's own footer said was "about to happen again inside the Epic meant to stop it."** Original entry follows. | **`/sig:migrate-memory`'s dry-run prints `0` for its two Epic-only vectors on a linear project, so "could not apply" is byte-identical to "already clean."** `renderDryRun` pushes `vector-3 (closed-Epic evicts): ${v3.evicts.length}` and `archive-tree moves: ${archive.moves.length}` unconditionally (`migrate-memory.js:1931-1932`). On a project that does not use Epic IDs both are **structurally** zero, not incidentally: `planArchiveMoves` filters its input through `EPIC_ID_STRICT_RE` and only matches `.planning/{epicId}-{suffix}.md` (`archive-tree.js:96-110`), and `extractEpicSection` rejects any non-strict ID (`evict.js:175`). If nothing else fires, `noop` goes true (`:1907`) and the whole run reports as a no-op — **a linear project is told the migration is complete when half of it never applied in principle.** **This is `C1`'s exact class in the command next door**, live in the same week M5.E16 shipped the four-status model that fixes it for `/sig:sweep`: a `0` that means *could not look* rendered the same as a `0` that means *checked and clean*. **Found 2026-08-02** reviewing a eval-project-A session report; confirmed by reading the renderer, not by running it. **Fix shape:** apply M5.E16's applicability distinction here — a linear project should read *"not applicable: no Epic-ID'd units in this project"*, never `0`. The missing **capability** (an archive path for linear units) is a separate, Epic-sized item and is filed in `BACKLOG.md`, not here; this entry is only the false-clean report. |