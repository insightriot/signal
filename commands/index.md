---
name: sig:index
description: "Regenerate .planning/INDEX.md — the auto-generated documentation map. Walks the corpus, renders mechanical rows (path · growth-policy), re-attaches curated notes by key, and writes only when the content changed. Idempotent; not phase-gated."
args: ""
---

# `/sig:index` — Regenerate the Documentation Map

You are running `/sig:index`, a not-phase-gated meta command. Same class as `/sig:status`, `/sig:checkpoint`, `/sig:add` — no tier-gating preamble, no skill loading, no agent spawning. Its one job: regenerate `.planning/INDEX.md` from disk so the documentation map never drifts from the corpus it indexes.

`INDEX.md` is **fully auto-generated** (hand-curation retired, M5.E3 FR3). The generator walks `.planning/` (including `archive/`), renders one mechanical row per tracked doc (path + growth-policy), and re-attaches the **hand-curated notes** — the per-file gotchas, the per-Epic one-liners, and the tier legend — **by key**, exactly the survive-by-ID pattern `RETROSPECTIVES.md` already uses. You edit the notes; the rows regenerate. It is the load-bearing traversal layer that keeps archived decisions findable (FR5's lifeline).

Authoritative reference:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/planning-index.js` — `regeneratePlanningIndex`, `enumeratePlanningDocs`, `parseExistingAnnotations`, `renderPlanningIndex`, `resolveDecisionId`

## Workflow

### 1. Pre-flight

- Resolve the project root (typically cwd; verify `.planning/` is present).
- If `.planning/` is absent → "No project detected. Run `/sig:new-project` or `/sig:init` first." Exit.
- `.gitignore` check (same pattern as the other `.planning/`-writing commands): if any line would silence `.planning/`, warn + offer to remove + halt until confirmed. `INDEX.md` lives under `.planning/`; a gitignored `.planning/` would drop the regenerated map from version control.

### 2. Regenerate

Call `regeneratePlanningIndex(baseDir)` from `tools/lib/planning-index.js`. It:
1. enumerates every tracked doc under `.planning/` (incl. `archive/`), skipping `INDEX.md` itself;
2. parses the existing `INDEX.md` for hand-curated notes (two keyspaces — file-path + Epic-ID — plus the tier legend);
3. renders the canonical content with the mechanical rows refreshed and the curated notes re-attached by key (an absent note gets a `_(note pending)_` placeholder);
4. **render-then-compares** and writes **only** when the content changed.

It returns `{written, path, docCount?}`. It is **idempotent** — a run with nothing to change writes nothing and returns `{written: false}`.

### 3. Report

- On `{written: true}`:

  ```
  ✓ INDEX.md regenerated — {docCount} docs indexed.
    Curated notes preserved by key; mechanical rows refreshed from disk.
  ```

- On `{written: false}`:

  ```
  INDEX.md already current — no changes.
  ```

If any doc now shows a `_(note pending)_` placeholder that deserves a one-line gotcha, mention it so the user can fill it in — the note will survive the next regeneration.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Hand-edit the mechanical rows to fix a path or tier." | Don't. The rows regenerate from disk on the next `/sig:index` — a hand edit is overwritten. Fix the underlying file (move it, rename it); edit only the curated note after the ` — `. |
| "Rewrite a curated gotcha to sound better while I'm here." | Out of scope. `/sig:index` preserves notes verbatim by key; it doesn't author them. Improving a note is a separate, deliberate edit. |
| "Skip the render-then-compare and just always write." | No. The no-op path (`{written:false}`) is what keeps `/sig:index` safe to run on every SHIP and keeps git history clean — a churny always-write index is noise. |
| "Regenerate even though `.planning/` is gitignored — it's just a local file." | No. A gitignored `.planning/` means the map isn't versioned or synced; halt and surface it (same rule as every `.planning/`-writing command). |

## Gate: Index Complete

- [ ] Pre-flight handled (no `.planning/`, gitignored `.planning/`).
- [ ] `regeneratePlanningIndex` called (not a hand-rolled write).
- [ ] Result reported (`{written}` true → regenerated + docCount; false → already current).
- [ ] No skills loaded, no agents spawned, no tier-gating preamble run.
