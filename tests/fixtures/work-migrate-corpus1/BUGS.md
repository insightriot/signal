# Bugs

| ID | Status | Pri | What |
|---|---|---|---|
| B1 | `fixed` | P2 | **Pantry sync trusts the stored row — one bad shelf record crashes the planner** (was tracker #41) — fixed in M9.E1, [PR #44](https://example.com/lanternfly/pull/44) |
| BUG-7 | `needs-triage` | P3 | **Recipe card shows the wrong unit after a locale switch** — seen once on a demo account, not reproduced. |
| — | `confirmed` | P2 | **Shopping list export drops the last aisle when it is empty** — reproduced with the sample pantry. |

## Meal snapshot load uses the strict check instead of the two-step one

**Status:** not-a-bug (closed 2026-03-02 during M9.E1 DISCUSS) — the save path already runs the strict check before it stores anything (`src/routes/plan.ts:120`), so a stored snapshot cannot fail it.

`loadLatestSnapshot` (src/lib/snapshots.ts:40) gives up on the first check failure, which would leave Undo empty for a half-built plan. Status: guessed from how #18 behaved; nobody has seen it happen. Related to B1.

---

## Suggest-a-swap rejects meal plans with an empty slot

**Status:** fixed in M9.E2 (S4) — empty slots are now passed over instead of failing the request. [PR #57](https://example.com/lanternfly/pull/57).

A plan with no breakfast chosen made Suggest-a-swap answer with an error, and the dialog told the cook to refresh the page, which changed nothing.

---

## Recipe import keeps unknown top-level keys

**Status:** needs-triage

`importRecipe` (src/lib/import/recipe.ts:88) passes extra fields from a recipe file straight through to the page, and an odd one can stop the page drawing. Noticed during M9.E1 REVIEW.

---

## Pantry banner "Retry" reloads the list, not the shelf

**Status:** scoped into M9.E3 (FR-02), 2026-03-09

A shelf that fails to open shows its error in the list's banner, and pressing Retry there refreshes the list instead of trying the shelf again.

---

## Older clients overwrite a row written by a newer deploy

An app still on last week's version sees a meal type it does not recognise, shows its own saved copy, and the next save replaces the newer one. Worked out on paper during REVIEW; not tried. Idea: pause saving for that plan until the app reloads.

---
