# Phase 11 — VALIDATION

Frozen field fixture. Structure, ID conventions and the contradiction are carried from the source
artifact; all copy is written for this repository. See `README.md`.

**This is FR2's case: one file contradicting itself, that nothing read.** Dimension 2 assigns four
acceptance criteria to slices; the Nyquist map below carries no row for any of them, and the coverage
line then reports **0 gaps** against a denominator that quietly excludes them.

**Note the ID shorthand** — the source writes `AC-16.6` once and then `16.7`, `16.8`, and writes
`NFR-9.1` once and then `9.2`, `9.3`. A check that reads only fully-qualified ids sees `AC-16.6` in
dimension 2, misses it in the map, and reports a contradiction that is not there.

## 8-Dimension Plan Validation

| # | Dimension | Verdict | Notes |
|---|---|---|---|
| 1 | Goal alignment | ✅ PASS | Every slice serves the phase goal. |
| 2 | Completeness | ✅ PASS | AC-16.6→S3, 16.7→S2/S3, 16.8→S4, 16.9→S4, 16.10→S2, 16.11→S5. AC-16.1/16.2/16.4/16.5 are satisfied across S3–S5; AC-16.3 is formally DEFERRED, recorded not dropped. NFR-9.1→S3, 9.2→S4, 9.3→S2/S4, 9.4/9.5 N/A. |
| 3 | Dependency correctness | ✅ PASS | S1→S2→S3→S4 is a real chain. |
| 4 | Testability | ✅ PASS | Every slice has a falsifiable check. |
| 5 | Scope discipline | ✅ PASS | Four named exclusions, each with a reason. |
| 6 | Context feasibility | ✅ PASS | Largest slices are one component and one action apiece. |
| 7 | Risk coverage | ✅ PASS | Each identified risk maps to a slice. |
| 8 | Vertical slicing | ✅ PASS | Each slice ships behaviour plus its tests. |

**Verdict: APPROVE.** No blocking fixes.

## Nyquist AC → Test Map (strict)

| AC | Requirement | Unit | Integration | E2E |
|---|---|---|---|---|
| 16.6 | Section exists on the edit page | — | renders in the section list | covered |
| 16.7 | Content in both modes; direction is mode-scoped | schema: required vs optional | upsert path | — |
| 16.8 | Preview uses the real pipeline and persists nothing | — | fixture shape is realistic | covered |
| 16.9 | Preview is cost-bounded | ceiling comparison (pure) | over-ceiling refuses without calling out | — |
| 16.10 | Write-boundary validation | blank / whitespace-only / over-length rejected | — | — |
| 16.11 | Version-lock invariant | purity + field coverage | hostile input | — |
| NFR-9.1 | Accessible rendering | no inline style attribute in the new component | — | — |
| NFR-9.2 | Write-path rate limiting | limiter unit tests | — | — |
| NFR-9.3 | Logging hygiene | — | content never logged | — |

**Coverage: 6/6 in-scope ACs mapped + 3 NFRs, 0 gaps.** AC-16.3 is out of scope by decision, not by
omission — it carries no test row because it ships no code.
