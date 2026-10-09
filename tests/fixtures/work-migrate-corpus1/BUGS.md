# Bugs

| ID | Status | Pri | What |
|---|---|---|---|
| B1 | `fixed` | P2 | **Pantry sync skips the shape check — a malformed shelf row crashes the planner (invariant break, #18 sibling)** (was tracker #41) — fixed in M9.E1, [PR #44](https://example.com/lanternfly/pull/44) |
| BUG-7 | `needs-triage` | P3 | **Recipe card shows the wrong unit after a locale switch** — seen once on a demo account, not reproduced. |
| — | `confirmed` | P2 | **Shopping list export drops the last aisle when it is empty** — reproduced with the sample pantry. |

## Meal snapshot load uses the strict check instead of the two-step one

**Status:** not-a-bug (closed 2026-03-02 during M9.E1 DISCUSS) — snapshots are written only after `/api/plan` accepts the submitted meal plan, so every stored snapshot passes the strict check when it is written (`src/routes/plan.ts:120`).

Meal snapshot load uses the strict check — `loadLatestSnapshot` (src/lib/snapshots.ts:40) returns null on any failure, so a snapshot of an unfinished plan would be dropped and Undo has nothing to restore. Status: inferred from the #18 pattern, not yet reproduced. P2. Sibling of B1.

---

## Suggest-a-swap rejects meal plans with an empty slot

**Status:** fixed in M9.E2 (S4) — an empty slot is now skipped rather than refused. [PR #57](https://example.com/lanternfly/pull/57).

Suggest-a-swap parses the submitted plan with the strict schema and returns 400 on any failure, including an empty breakfast slot. The modal then says "Please reload and try again", which reloading cannot fix.

---

## Recipe import keeps unknown top-level keys

**Status:** needs-triage

`importRecipe` (src/lib/import/recipe.ts:88) returns the parser's output object, which keeps unknown top-level keys. A shared recipe file is the realistic route; the effect is a render crash. Found during M9.E1 REVIEW.

---

## Pantry banner "Retry" reloads the list, not the shelf

**Status:** scoped into M9.E3 (FR-02), 2026-03-09

When a shelf fails to open, the error goes to the list banner, so Retry reloads the list and clears the banner without retrying the shelf. Text and action disagree.

---

## Older clients overwrite a row written by a newer deploy

Since M9.E1 an older client rejects a row whose enum value it does not know, keeps its cached copy on screen, and the first edit's sync writes the older copy over the newer row. Reasoned from the code during REVIEW, not reproduced. Option: block sync for a rejected row until reload.

---
