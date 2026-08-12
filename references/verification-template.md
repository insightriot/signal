# VERIFICATION Templates

> Per-tier templates for the VERIFY phase's report, enforced by `validateVerificationContent`
> (`tools/lib/verification-template.js`). Structure and enforcement mechanism are deliberately the
> same as `references/retrospective-template.md` — exact-string-locked headings, non-empty bodies,
> tier byte thresholds — because that mechanism has already survived contact with stub artifacts.

## This template proves nothing on its own

**It is paired with FR1, and says so here so that nobody reads a filled-in template as evidence
(`AC3.3`).** Every heading below can be present, every body substantive, and the report still be
false: a denominator can be wrong, and *"what this could not establish"* can omit the thing it could
not establish. **The structural gate catches an artifact that never asked the question. Only
`diffRequirementCoverage` (VERIFY Step 1b) checks the answer against the requirements.**

A template without the derived check is theatre. The check without the template lets a run report a
number with no stated total. Both, or neither is worth much.

## What is NOT built (`AC0.1`)

**The semantic backstop does not exist.** Everything Signal ships for claim integrity compares
**tokens**: requirement IDs present or absent, sections present or empty, a line that retracts
itself, a denominator that is stated. Every one of those is a regular expression over a document.

**So a VERIFICATION that names every requirement, carries a denominator, fills every section, and is
simply *wrong* about what its evidence establishes passes all of them.** A row reading
*"AC-16.10 | covered by `login.test.js`"* is checked for the ID and never for whether that test
asserts anything of the kind. The claims in a document are only checkable against the thing they
describe, and no pattern-matcher opens that thing.

Closing it needs an agent that re-reads each claim against its source — the **REVIEW claims-audit**,
live in [`../.planning/BACKLOG.md`](../.planning/BACKLOG.md) and deferred out of `M5.E10` by
`D-M5E10-1`. It is named here because a reader who finds a template, a gate and five checks would
otherwise reasonably conclude that claim integrity is guarded. **It is half-guarded, and this is the
half that is missing.**

## How to use this file

1. **Find your tier** — `.planning/PROFILE.md` → `tier:`.
2. **Copy the matching template block** into `{Unit}-VERIFICATION.md`.
3. **Fill in every section.** An empty body fails exactly as hard as a missing heading, and a
   near-empty one fails too — see the threshold note below.
4. **Headings are exact-string locked.** Extra sections are fine, after the locked ones.

### The two elements every tier requires

**A denominator table.** Every coverage claim reads `{n} of {total}`, never a bare count. *"All
criteria verified"* is unfalsifiable by construction — a reader cannot check a total that was never
stated. `{total}` comes from `diffRequirementCoverage`'s `basis`, which names the requirement groups
it scoped to; write that down, not a number you recall.

**A `## What this could not establish` section.** Every phase has limits: paths asserted at a lower
layer than they ship at, environments not exercised, criteria taken on attestation rather than a red
test. A verification report that names none is not a report with no limits — it is a report that did
not look for them.

**Present-but-empty fails (`AC3.2`, `RK3`).** *"None"* / *"N/A"* / a single word does not satisfy the
requirement; structural presence was never the requirement. The validator applies a minimum body
size, because a heading everyone fills with one word is how a required section becomes a formality.
If a limit genuinely does not apply, write the sentence explaining why it does not — that sentence is
the content.

---

## SKETCH tier

Smallest ceremony: did it work, what was not checked.

**Section headings (locked):**

1. `## Verdict`
2. `## Coverage`
3. `## What this could not establish`

<!-- TEMPLATE: SKETCH -->
## Verdict

PASS / FAIL, and the one sentence that decides it.

## Coverage

{n} of {total} — where the total came from.

## What this could not establish

What was not exercised, and why that was an acceptable call here.
<!-- /TEMPLATE: SKETCH -->

---

## FEATURE tier

**Section headings (locked):**

1. `## Verdict`
2. `## Gate results`
3. `## Requirement coverage`
4. `## What this could not establish`

<!-- TEMPLATE: FEATURE -->
## Verdict

PASS / FAIL / PASS with documented limits. State which, and what decides it.

## Gate results

| Gate | Result |
|---|---|
| Test suite | {n} passed / {n} failed (baseline at phase start: {n}) |
| Build | |
| Lint | |

## Requirement coverage

| Requirement | Verified by |
|---|---|
| | |

**Coverage: {n} of {total}.** The total is the denominator `diffRequirementCoverage` derived — name
the requirement groups it scoped to. List every requirement it reported `missing`, and every one the
REQUIREMENTS artifact marks deferred, separately.

**Could not evaluate:** what the check could not look at, including when that set is empty.

## What this could not establish

The limits of this verification. Paths covered at a lower layer than they ship at; environments not
exercised; criteria taken on attestation rather than a demonstrated red test.
<!-- /TEMPLATE: FEATURE -->

---

## SPIKE tier

A spike verifies that its question got answered, not that a feature works.

**Section headings (locked):**

1. `## Verdict`
2. `## What the spike established`
3. `## What this could not establish`

<!-- TEMPLATE: SPIKE -->
## Verdict

Did the spike resolve its question? Build / abandon / continue.

## What the spike established

The findings, and the evidence for each. {n} of {total} questions answered.

## What this could not establish

What remains open, and what it would take to close it.
<!-- /TEMPLATE: SPIKE -->

---

## FULL tier

**Section headings (locked):**

1. `## Verdict`
2. `## Gate results`
3. `## Requirement coverage`
4. `## Nyquist compliance`
5. `## What this could not establish`

<!-- TEMPLATE: FULL -->
## Verdict

PASS / FAIL / PASS with documented limits, and what decides it. A `missing` requirement is a FAIL.

## Gate results

| Gate | Result |
|---|---|
| Test suite | {n} passed / {n} failed (baseline at phase start: {n}) |
| Build | |
| Lint | |
| Typecheck | |

## Requirement coverage

| Requirement | Verified by |
|---|---|
| | |

**Coverage: {n} of {total}.** The total is the denominator `diffRequirementCoverage` derived — name
the requirement groups it scoped to, and whether it scoped at all.

**Missing:** every requirement reported missing, by name. A count does not satisfy this.
**Deferred:** every requirement the REQUIREMENTS artifact itself struck out of the unit, by name.
**Could not evaluate:** the groups the check could not attribute, and the reason — **including when
that set is empty.** Silence about blindness reads as a clean result.

## Nyquist compliance

Per criterion: red-before-green evidence, or a declared deviation. A deviation is declared here, in
this section, not left to be inferred — it is never counted as strict-Nyquist compliance.

## What this could not establish

The limits of this verification, in specifics. Paths covered at a lower layer than they ship at;
environments not exercised; criteria taken on attestation rather than a demonstrated red test;
anything the coverage check could not see.

If a category genuinely does not apply, write the sentence saying why. That sentence is the content —
a one-word body fails this section.
<!-- /TEMPLATE: FULL -->
