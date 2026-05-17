# Migration: STATE.md schema_version 1 (Signal v0.1.x — M4.5.E6)

If you have a Signal-managed project with a pre-M4.5.E6 `.planning/STATE.md`, this migration brings it onto the locked schema_version 1 (YAML frontmatter + freeform body) shape introduced in M4.5.E6.

**Short version: you don't have to do anything.** Signal auto-migrates your STATE.md on the next mutating write — typically the first time `/sig:execute` / `/sig:checkpoint` / `/sig:verify` / `/sig:review` runs against the project after you've upgraded Signal. The original content is preserved verbatim under an HTML comment marker.

---

## What changes

**Before (legacy STATE.md):**

```
# Project State

## Current Phase
EXECUTE

## Completed Phases
- CALIBRATE (2026-05-14)
- DISCUSS (2026-05-16)
- PLAN (2026-05-17)

## Blockers
(none)

## Last Updated
2026-05-17
```

**After (schema_version 1):**

```
---
schema_version: 1
phase: EXECUTE
current_epic: null
current_wave: null
current_tasks: []
completed_phases:
  - CALIBRATE (2026-05-14)
  - DISCUSS (2026-05-16)
  - PLAN (2026-05-17)
blockers: []
last_decision_at: null
last_updated_commit: <git HEAD at migration>
last_updated: <ISO timestamp at migration>
---
<!-- Original STATE.md content preserved verbatim from pre-schema_v1 migration on YYYY-MM-DD. The YAML frontmatter above is the authoritative machine-readable state; everything below is human-readable history. -->

# Project State

## Current Phase
EXECUTE

## Completed Phases
- CALIBRATE (2026-05-14)
- DISCUSS (2026-05-16)
- PLAN (2026-05-17)

## Blockers
(none)

## Last Updated
2026-05-17
```

Migration is **strictly additive**. Nothing is deleted, rewritten, or paraphrased — only prepended. Every line of your original STATE.md survives intact below the HTML comment marker.

---

## When migration runs

The first Signal command that mutates STATE.md will detect the absence of frontmatter and call `upgradeStateFile` automatically. Mutating commands include:

- `/sig:execute` — at the first `setCurrentTask` (start of each task).
- `/sig:checkpoint` — at the first state write.
- `/sig:verify` — at `markFresh` (phase exit).
- `/sig:review` — at `markFresh` (phase exit).
- `/sig:discuss`, `/sig:calibrate`, etc. — at `transitionPhase` or `initState`.

Read-only commands (`/sig:status`, `/sig:resume`) detect the legacy shape and read through a fallback parser without writing — so opening a stale project to look around won't trigger the migration. Only an intentional mutation will.

---

## Common questions

### Will my data be lost?

**No.** Original content is preserved verbatim under the HTML comment marker. If you want to revert, the pre-migration version is in your git history (every `STATE.md` change should already be committed per Signal's "`.planning/` is the project's memory" convention).

### Do I need to do anything?

**No.** Run any Signal command that touches state and the migration applies once, automatically. From then on, STATE.md uses the new schema.

If you want to verify before any command runs, you can preview the migration manually:

```bash
cp .planning/STATE.md /tmp/state-preview.md
mkdir -p /tmp/state-preview/.planning
cp /tmp/state-preview.md /tmp/state-preview/.planning/STATE.md

# Run upgradeStateFile() through node
node --input-type=module -e "
  import { upgradeStateFile } from './node_modules/.../tools/lib/state.js';
  await upgradeStateFile('/tmp/state-preview');
"

# Compare
diff .planning/STATE.md /tmp/state-preview/.planning/STATE.md
```

(Signal-on-Signal ran exactly this dry-run during M4.5.E6.S1.t4 before approving the migration — see `.planning/M4.5.E6-RESEARCH.md` § 8.1.)

### How do I revert?

```bash
# Find the commit that introduced the migration
git log --diff-filter=M .planning/STATE.md

# Check out the pre-migration version
git checkout <commit-before-migration>~1 -- .planning/STATE.md
```

Or simply edit the file: delete the frontmatter block (`---` … `---`) and the HTML comment marker. The legacy parser will pick up the freeform shape on the next read and treat it as a fresh legacy STATE.md (which means the next mutation will re-migrate — that's the cost of reverting without also pinning Signal to a pre-M4.5.E6 version).

### What if Signal can't infer some fields during migration?

It will leave them at sensible defaults — usually `null` or `[]`. The two most common gaps:

- **`current_epic` / `current_wave`** — legacy STATE.md doesn't have machine-readable fields for these; the legacy "Current Milestone" / "Active" sections are freeform narrative. Migration sets both to `null`. You can hand-edit them once after migration if you want `/sig:resume` to display them; alternatively, run `/sig:checkpoint` and let it populate them from your commit log going forward.
- **`last_updated_commit`** — populated from `git rev-parse HEAD` at migration time. If you ran migration in a non-git directory (rare), this stays `null` and the staleness banner won't fire until the next `markFresh` resolves it.

Neither gap blocks functionality. They're cosmetic enhancements to `/sig:resume`.

### What if my STATE.md already has frontmatter but no `schema_version`?

Signal **refuses to auto-upgrade** in that case (D14 case 4). The reasoning: if you already added frontmatter manually, you might have meant something specific by it — Signal won't guess. You have two options:

- **Remove the frontmatter** and let Signal migrate the file fresh on next mutation. Signal will write a clean `schema_version: 1` block.
- **Hand-edit `schema_version: 1` into your frontmatter** if you want to keep your existing fields. Signal will then parse it as schema_version 1 going forward; verify the field names match the canonical schema (see `references/state-schema.md`).

### What if Signal sees an unknown `schema_version` (e.g., 999)?

Signal **fails closed** — refuses to read the file. This happens if a newer Signal wrote your STATE.md and you've downgraded. Upgrade Signal or hand-edit the frontmatter.

---

## Why M4.5.E6 introduced this

The pre-schema STATE.md was freeform narrative. After a Claude Code context clear mid-EXECUTE, `/sig:resume` couldn't reliably extract "what was in flight, what just completed, what commit was the last writer" — the manual workaround was a 280-line "POST-CONTEXT-CLEAR RE-ENTRY PROTOCOL" hand-maintained at the top of the file. This Epic replaces that protocol with structured state that `/sig:resume` can render unambiguously.

Full rationale: `.planning/M4.5.E6-RESEARCH.md` and `.planning/DECISIONS.md` entries dated 2026-05-16 + 2026-05-17.
