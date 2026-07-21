# Implementation Context — M5.E5 (v0.1.10 carry-over bug squash)

**Epic:** M5.E5 · **Tier:** FULL / strict · **Phase:** DISCUSS
**Scope:** the 3 confirmed `BUGS.md` carry-overs from M5.E4 (B24, B26, B25) + the M5.E4 REVIEW I-3 semantics refinement (B6-local-stale). Bugs-only — the Sprint-3 hygiene *commands* stay deferred (see Deferred).

Each decision below was investigated in the real code by a dedicated read-only agent (root cause confirmed with file:line refs).

**✅ RATIFIED 2026-07-21** (Brett — "go with your recs"). All four recommendations accepted as-is, including every **⚑ RATIFY** item: D1 the resolved-abs-target key (catalogue deviation), D2 the all-three-layers scope, D3 the full 6-wrapper close, and D4 **tighten** the stale gate + `CONTEXT.md` classified as **bookkeeping**. The ⚑ tags remain below as the record of what needed sign-off.

---

## Locked Decisions

### D1 — B24 (P2): re-key the dangling-delta on the *resolved absolute target*, not `file\0link`  ⚑ RATIFY (catalogue deviation)

**Problem (confirmed):** `computeDanglingDelta` (`tools/lib/migrate-memory.js:1503-1507`) keys each dangle as `` `${d.file}\0${d.link}` ``. The append-log evict relocates a strictly-closed DECISIONS block to `archive/M{n}/` **and** re-roots its links (`./ghost.md` → `../../ghost.md`, resolution-preserving, `archive-tree.js:157-180`). Both key components mutate, so the pre-existing dangle can't be subtracted against the baseline → misread as migrate-introduced → `enforceNoDangling` aborts + rolls back byte-identical. Any external repo whose *closed* DECISIONS history carries one broken `](*.md)` link cannot migrate. There is also a **dry-run/apply divergence**: `renderDryRun` correctly lists the same link as "pre-existing, NOT caused by this migrate" while apply aborts on it.

**Decision:** key the delta on the **resolved repo-root-relative absolute target** — the one quantity the re-root holds invariant — with **multiset/count semantics** (subtract at most as many as the baseline held for that target). Fix at the shared `scanDanglingLinks`/`computeDanglingDelta` layer so every migrate path is repaired at once.

**Why not the catalogue wording:** `BUGS.md` B24 said "key on decision ID / original link text." Both fail — the re-root *mutates* the link text, and there is no decision-ID at the generic scanner layer every migrate path shares. The resolved-abs-target is the generalization that actually survives move + re-root.

**Gate strength preserved:** a genuinely migrate-*introduced* dangle has an abs-target absent from the baseline (or increases the count for one present) → still aborts. **Named, accepted limitation:** delete-the-sole-dangle-to-X *and* introduce a different new dangle to the same already-missing X → count stays 1 → masked. Bounded/low-stakes (X was already missing pre-migrate); document, don't silently ship.

**Cost:** 3 test updates — the `computeDanglingDelta` unit test (carry the new field), **invert** the current B23(a) assertion (`tests/migrate-dangling-baseline.test.js:162-219`, which today asserts the *wrong* abort behavior and explicitly says so), and a **new non-injected** gate-strength test.

---

### D2 — B26 (P3, scope wider than catalogue): STATE-based Epic-close fallback across all 3 enforcement layers  ⚑ RATIFY (scope expansion)

**Problem (confirmed, worse than ticket):** the FR1 retro gate's Epic-close verdict is **100% milestone-table-driven** — `isEpicCloseShip` (`retrospective.js:341-358`) reads only the `MILESTONE-{n}.md` status row for the current Epic. `MILESTONE-5.md` has **no E4 row at all** (only E1/E2/E3), so `findEpicStatusRow('M5.E4')` returns `null` → skip. The retro was written by hand; the hard-block never fired. **This blind predicate is shared across all three D-E9-8 enforcement layers**, so fixing only `shipFR1Check` leaves two others blind:
- **Layer 1** `shipFR1Check` (`retrospective.js:667`) — the reported symptom.
- **Layer 3** `detectDirtyExecute` resume hook (`retrospective.js:603`) — same blind predicate.
- **Layer 2** `checkProposedStateWrite` (`retrospective.js:379,398`) — blind for an *independent* reason: it triggers on a `- SHIP` line in `completed_phases`, which per `references/epic-native-flow.md:27` Signal by design **never writes**. Structurally dead on this flow.

**Decision:** add a STATE-based fallback `isEpicCloseByState(state, profile)` — true when `current_epic` is set, `phase === 'SHIP'`, and `completed_phases` covers **every tier-enabled phase before SHIP** (tier-aware: FULL/FEATURE → through REVIEW; SKETCH → through VERIFY; SPIKE skips SHIP so FR1 never runs). **Gate it on row-absence** (`findEpicStatusRow === null AND isEpicCloseByState`), **not a pure OR** — a maintained table saying "S2–S5 pending" must still win for a legitimate per-slice ship (preserves D-E9-5). Apply the combined predicate to Layer 1 **and** Layer 3; **re-key Layer 2** off `phase: SHIP` + tier-complete phases instead of the never-written `- SHIP`.

**False-positive risk (flag + negative-test):** linear mode + unmaintained table (row absent) + genuinely multi-slice with phases re-run per slice → could demand a retro on a non-final slice. Narrow (Epic mode has no mid-Epic SHIP), and over-firing a retro is the softer failure vs. silently skipping.

---

### D3 — B25 (P3): prove FR5 read-enclosure with an `_afterRead` seam — full close (all 6 wrappers)  ⚑ RATIFY (full vs canonical-only)

**Problem (confirmed):** read-enclosure IS correct — all 6 RMW wrappers are `withStateLock(baseDir, () => XxxCore(...))` with the read inside `Core`. But `tests/rmw-lock.test.js` only asserts throw-under-held-lock, which a *broken* read-outside-lock wrapper passes identically → AC5.2 ("no lost update") has no behavioral test.

**Decision:** add an optional `_afterRead` opts hook to each `Core` (fires after the version-establishing read), defaulting to no-op — **mirroring the existing `renameFn` crash-injection seam** (`atomic-write.js:20`), so production is byte-identical and there's precedent. Reject a module-level global. Add a shared orchestration helper. Prove it with a deliberately-**broken** `reads-outside-lock` twin built from exported primitives: the new test must **FAIL** against the broken twin and **PASS** against the real wrappers (RED-first). Because the lock is throw-on-contention (not blocking), the *arriving* writer fails fast — assert "no lost update" via final on-disk content, not "A incorporates B."

**Scope = full close (all 6 in `RMW_PATHS`)**, not canonical-path-only. Lead with `applyDispositionToFile` as the reference path (zero wrapper change — already forwards `opts`); `regenerateIndex` needs a one-line signature bump to `(baseDir, opts = {})`. Rationale: B25 is framed as "all 6 correct on inspection," so the honest close covers all 6 (matches the build-complete-not-band-aid norm).

**Doc-accuracy note (free):** `M5.E4-REVIEW.md:29` says "7 wrappers swept" — there is a 7th (`regeneratePlanningIndex`), read-enclosed and covered indirectly; `RMW_PATHS` canonicalizes 6. Reconcile the wording.

---

### D4 — B6-refinement (P3): tighten local-stale by *file identity*, not commit count  ⚑ RATIFY (taste call)

**Problem (confirmed):** `isStateStale` (`state.js:769-844`) suppresses the "STATE is behind" banner whenever *every* commit in `lastCommit..HEAD` touches only `STATE_AFFECTING_PATHS` — which includes `*-PLAN/PROGRESS/VERIFICATION/REVIEW.md`. So a committed PLAN/PROGRESS file that was never rolled into STATE reads as "not stale." Internal inconsistency: those same files are in the *trigger* set (Walk 1 treats them as "state moved") but Walk 2 then swallows them.

**Decision:** tighten via a **separate, smaller `BOOKKEEPING_PATHS`** (= `STATE.md`, plus `CONTEXT.md` — see sub-call) that drives Walk 2's exclude, instead of deriving Walk 2 from the full trigger list. Result: a STATE.md-only "+1" still suppresses (real bookkeeping); a committed PLAN/PROGRESS/VERIFICATION/REVIEW that never reached STATE reads as **work worth a nudge** → stale. **Count-independent**, so it's also correct where the M5.E4 reviewer's `commits.length === 1` candidate *misfired* (a STATE refresh split across two commits). Do **not** remove PLAN/PROGRESS from `STATE_AFFECTING_PATHS` (they'd become invisible — the opposite bug — and break the `is-state-stale.test.js:136` pathspec test).

**⚑ Taste call — RATIFIED: tighten.** When you've committed a PLAN/PROGRESS file but haven't refreshed STATE, you want the "you're behind" nudge. Rationale held: the miss is costly (resuming on stale info at the exact moment the banner exists to protect); the false alarm is one dismissable, fail-open line.

**⚑ Sub-call — RATIFIED: `CONTEXT.md` is bookkeeping** (goes in `BOOKKEEPING_PATHS`, no nudge — curated orientation like STATE).

---

## Deferred Decisions

- **Sprint-3 hygiene *commands*** — `/sig:sweep --docs/--code`, CLAUDE.md de-bloat + command-frontmatter freshness, the `docs/map` ship-checklist line (`BACKLOG.md` § "Sprint 3 (residual)"). These are *features*, not defects; out of a bug-squash Epic. The `docs/map` two-screen app itself already shipped this session (`ab05bb0`, `931c959`); only the freshness-checklist line remains. → a later Epic.
- **B24 named limitation** (delete-one/add-one to the same already-missing target) — accepted + documented, not fixed.
- **`isEpicCloseByState` linear-multi-slice false-positive** — bounded; handled by the row-absence gate + a negative test, not a separate mechanism.

## Assumptions (validate during EXECUTE)

1. `computeLinkEdits` (`archive-tree.js:171-174`) is genuinely resolution-preserving for every reroot path — D1's abs-target key relies on it. Verify with the inverted B23(a) fixture.
2. No production caller of the 6 RMW Cores passes `_afterRead` (grep `commands/*.md`) — the seam must stay test-only and inert (D3, mirrors `renameFn`).
3. `completed_phases` phase-name matching tolerates the `(date)` suffix (`REVIEW (2026-07-21)`) — D2's tier-complete check must prefix/word-boundary match, not exact-string.
4. Fixing D2 across all 3 layers does not disturb `detectDirtyExecute`'s intended "milestone-says-close but STATE-says-EXECUTE" trigger — re-check `retrospective.js:600-603` before touching the shared predicate.

## Last Updated
2026-07-21 (DISCUSS complete — four investigations synthesized; all four decisions ratified by Brett)
