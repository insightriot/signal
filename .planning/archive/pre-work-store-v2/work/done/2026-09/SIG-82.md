---
id: SIG-82
type: BUG
status: C
title: "`planArchiveMoves` does not use `deriveUnits`, so it archives half a
  unit — the exact outcome M5.E18's own test…"
priority: P2
source: migration:BUGS.md
source_ref: BUGS.md:115
close:
  reason: fixed
  by: migration
  at: 2026-09-29
  proof: legacy — not re-verified
legacy_id: B82
---
| B82 | `fixed` | **P2** | **`planArchiveMoves` does not use `deriveUnits`, so it archives half a unit — the exact outcome M5.E18's own test comment says it prevents.** `archive-tree.js` rebuilds every candidate as `` `${PLANNING_DIR}/${unit}-${suffix}.md` `` and never consults `work-units.js`; `grep -rn deriveUnits tools/` returns `closure.js:260` and `state-drift.js:496` and **nothing in `archive-tree.js`**. `deriveUnits` performs a **conservative fold** that the template cannot express, so the two disagree about which files belong to a unit. **Measured 2026-08-04 against eval-project-A's live `.planning/`:** `deriveUnits` resolves `SLICE-SSO` to **5 files** (folding `PLAN-SLICE-SSO-RESEARCH.md` + `PLAN-SLICE-SSO-VALIDATION.md` in alongside the three `SLICE-SSO-*` files); `planArchiveMoves(['SLICE-SSO'], …)` plans **3**. Two files the system already knows belong to the unit are left live. **M5.E18 knew.** `tests/work-units.test.js:86-90` carries a `eval-project-A_SPLIT_PAIRS` fixture built from these real filenames and a comment stating the split *"puts the VERIFICATION on one side and the PLAN on the other, **so FR2 would archive half a slice**"* — the Epic wrote the sentence describing the defect it shipped, fixed it in the derivation, and left the mover on the old template. **This is the two-implementations-of-one-rule shape** that `M5.E18-REQUIREMENTS.md` open question 1 and M5.E13 REVIEW both warn about, realised across two modules. **Impact:** a unit split across `.planning/` and `.planning/archive/` — `INDEX.md`, cross-doc links and the next reader all disagree about where it lives. The external tool this replaces at least moved all-or-nothing. **Found 2026-08-04** while writing the manual-archiving runbooks for eval-project-A + eval-project-D, by running both functions against the real corpus instead of reading either one. **Fix shape (not attempted):** `planArchiveMoves` takes the file list `deriveUnits` already returns, rather than re-deriving names. **Separate and NOT this bug:** a bare `PLAN-SLICE-SSO.md` (no recognised suffix) stays `ungrouped` — accepted by design under `D-M5E18-2`, which requires the ungrouped set be **reported, never dropped**. |