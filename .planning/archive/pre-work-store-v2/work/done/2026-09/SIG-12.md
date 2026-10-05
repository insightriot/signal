---
id: SIG-12
type: BUG
status: C
title: Vector-1 de-prose leaves a generic `[relocated…]` placeholder (not a
  meaningful label) for a `completed_phases` entry…
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:35
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B12
---
| B12 | `fixed` | P2 | **Vector-1 de-prose leaves a generic `[relocated…]` placeholder (not a meaningful label) for a `completed_phases` entry that lacks a leading `PHASE (date)` token — and sweeps an *active* marker into history.** The de-prose keeps a short scalar by grabbing the leading `PHASE (date)` prefix; an entry without one falls back to `"[relocated to STATE body — migrate-memory]"`, erasing which entry it was (the prose is preserved verbatim in the body — **no data loss** — but the frontmatter label is useless). **Confirmed 2026-07-18** via the S4.t2 eval-project-A full-migrate on a throwaway copy (546 KB → 1.3 KB STATE.md): the entry `"**▶ Active: Slice SEC1 — Supabase Security-Advisor Hardening: DISCUSS ✅ → …"` (a free-form active-work marker parked in `completed_phases`) placeholdered, and its prose relocated to `STATE-HISTORY.md` — i.e. an **active** item filed into **history** (exactly the "don't bury a live open item" case the S1.t2 carry-forward flagged for the S4 eyeball). **Fix (two parts):** (1) derive a meaningful truncated label from any entry, never a generic placeholder; (2) DECIDE (product) whether an entry that reads active (`▶ Active:`/similar) should be flagged/skipped rather than swept to history, or whether `completed_phases` is always fair game (→ data-hygiene guidance instead). Surfaced by the real dogfood — a "battle-tested" find. Fix before the release. **→ Fixed 2026-07-18 (`e42afed`):** new `deriveNonStandardLabel` (mirrors `/sig:add`'s clause-boundary `deriveHeading`: first clause ≤60 chars, 6-word fallback) for any `completed_phases`/`blockers` entry lacking a `PHASE (date)` prefix — never the generic placeholder; idempotent; conservation unchanged. `renderDryRun` now emits `⚠ Non-standard completed_phases entries relocated (N) … verify these were actually complete` (product call: flag-in-dry-run, still relocate). Verified on the real eval-project-A file: SEC1 entry → label `"▶ Active: Slice SEC1"` + warning fires; 0 placeholders. 1264→1269 tests. |