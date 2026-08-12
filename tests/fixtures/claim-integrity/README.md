# Claim-integrity fixtures — provenance

**Source: a private project in the maintainer's local corpus, referred to here and everywhere in
Signal's docs as `field-project-A`.** Captured **2026-08-12**, once, read-only. **These files are
never re-read from the source** — they are frozen inputs, and a test that reached back to a live
project would make its own result depend on someone else's working tree (AC S1.4).

**The identity of the source project is deliberately absent, and so is its subject matter.** This
repository is public; the source is a commercial product specification. What a coverage check reads
is IDs and document structure, so that is what was carried across. See "What is real" below —
the distinction matters when you are deciding what these fixtures can prove.

## Why a field case at all

`AC1.5` asks for the field case rather than a synthetic one, because **a fixture whose author also
invented the defect only proves the check catches what its author imagined.** The field defect here
is a matter of record: one FULL-tier phase shipped **five false coverage claims**, and every catch
was incidental — the evidence that opened `M5.E10` (`analysis/CLAIM-INTEGRITY-ANALYSIS.md`).

## What is real, and what is not

**Real — measured from the source artifacts, not invented:**

- The **ID scheme**: hyphenated, sub-numbered — `FR-16`, `AC-16.10`, `NFR-9.2`. Signal's own
  projects write `FR2b` / `AC6.4`, and the pre-`M5.E10` extractor matched **none** of this scheme.
- The **shape mismatch**: REQUIREMENTS is **project-scoped** (every phase in one file); VERIFICATION
  is **phase-scoped**. There is no 1:1 pair, which is the fact that produced `D-M5E10-6`.
- The **ID inventory**: `AC-16.1`–`AC-16.11`, `NFR-9.1`–`NFR-9.5`, and the surrounding groups that
  make the file genuinely multi-unit.
- The **coverage gap**: VERIFICATION names 3 of 11 `AC-16.*` requirements.
- **`AC-16.3` struck through and marked deferred out of the unit** — the case behind `D-M5E10-7`.
- The **contamination trap** (`NFR-10`): a *different* unit's section that mentions this unit in its
  body. In the source it carries 70+ ids, and any scoping rule that reads prose pulls all of them
  into this unit's denominator. It is in the fixture because it is what disproved the first version
  of `D-M5E10-6` — the rule was written, then measured against this section within the hour.
- The **before/after pair**, and the delta between them: the source's VERIFICATION was amended in the
  field to add `NFR-9.2`, which it had originally omitted **while claiming complete NFR coverage**.
  Both revisions are real; neither was authored here.

**Not real — written for this repository:**

- Every **section title and every sentence of description**. The source's copy is a commercial
  product spec and is not reproduced.

**So state what these fixtures prove, carefully:** they prove the check behaves correctly on the
**structure, ID scheme and coverage gap of a real artifact pair, including a real defect and its real
fix**. They do **not** prove anything about parsing arbitrary human copy — the copy here is mine.
That limit is the price of not publishing someone's specification, and it is stated rather than left
for a reader to discover.

## The files

| File | What it is |
|---|---|
| `field-REQUIREMENTS.md` | project-scoped requirements, multi-unit, including the `NFR-10` contamination trap and the deferred `AC-16.3` |
| `field-VERIFICATION-before.md` | the pre-amendment revision — omits `NFR-9.2` while asserting complete NFR coverage |
| `field-VERIFICATION-after.md` | the post-amendment revision — same artifact after the field fix |

**The unit under verification is `Phase 11`** in all three.

## What the pair does NOT establish

`AC1.5` reads *"the amended pair passes."* **On this data it does not, and pretending otherwise would
be the defect this Epic exists to kill.** The amendment fixed the `NFR-9.2` omission; it left eight
`AC-16.*` requirements unmentioned. The honest contrast is scoped to the defect the amendment
addressed — `NFR-9.2` is named missing before and not after — while the `AC-16` gap is **reported in
both**, because in the source project it appears to be a real and still-open gap.
