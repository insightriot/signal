---
name: sig:advise
description: "Read this project's own .planning/ corpus and recommend what to work on next — every claim carrying a citation that resolves. Read-only except for its dated advisory artifact. Not phase-gated."
args: ""
---

# `/sig:advise` — the Roadmap Advisor

You are running `/sig:advise`. It reads this project's `.planning/` corpus and writes a dated
advisory naming what to work on next — **and what it looked at and passed over.**

**It proposes. It never selects.** Nothing it writes marks an item decided, nothing lands in
`DECISION-QUEUE.md`, and no backlog row is struck. The advisory changes nothing on its own.

## It is not a phase command, and does not read `PROFILE.md`

Taxonomy group **orientation** (`references/command-taxonomy.md`) — it reports, it does not advance
the flow. So there is **no tier-gating preamble**, the same posture `/sig:status` and `/sig:doctor`
take. Said out loud because silence here reads as an omission rather than a decision.

No arguments in this first slice.

## What it writes, and the one thing it does not

`.planning/BACKLOG-REVIEW-YYYY-MM-DD.md`, and **nothing else**. Not `BACKLOG.md`, not `INDEX.md`,
not `STATE.md`.

⚠ **The inbound link from `BACKLOG.md` and the `INDEX.md` regeneration are ONE-TIME HUMAN EDITS AT
SHIP, not command behaviour.** `ORPHAN_ENTRY_POINTS` does not match this filename, so
`/sig:docs-sweep` flags the artifact as an orphan until `INDEX.md` is regenerated. Writing those
files from here would breach the read-only contract twice over, in a command whose own
`writeArtifact` correctly refuses to write anything else.

The name is **constrained, not chosen**: in Signal's own repository the doc-budget manifest already
exempts exactly the `BACKLOG-REVIEW-*` pattern, so any other name would need a manifest entry of its
own or fail the budget check once the advisory grows past 32 KB.

## Workflow

Call `runAdvise(baseDir, { today, projectName })` from `tools/lib/advise.js`. It does the whole run:

1. **Read the corpus** — `readCorpus` (`tools/lib/advise-corpus.js`) over the five sources in
   `ADVISOR_SOURCES`: `BACKLOG.md`, `BUGS.md`, retrospectives, STATE/closure, milestone rows. A
   source that could not be read lands in `cannotCheck` with a reason and its slot stays `null` —
   never an empty result standing in for one.
2. **Rank** — five inputs in order: blocked-by, trigger-met, discharge, age, and **self-declared
   not-live** (a row whose own *heading* says it is parked, shelved, a reconciliation record, or
   held open on purpose drops out — `declaresNotLiveWork` in `tools/lib/backlog.js`, which reads the
   heading and never the body). Stable tiebreak on source line number. Top `RECOMMENDATION_LIMIT` (5) are recommended; **every other live row is
   declined, with the reason naming the input that demoted it.** The declined pool is complete
   rather than curated, which is what makes a passed-over row distinguishable from an unconsidered
   one (`B39`).
3. **Render** — `renderArtifact`, pure and file-facing.
4. **GATE** — `verifyCitations` over the rendered artifact, asserting `unresolved.length === 0`
   **and** `resolved.length >= recommendations + declined`. Any failure and the artifact is **not
   written**.
5. **Write** — `writeArtifact`, idempotent by byte-compare.

Print `formatAdviseSummary(result)`. On `status: 'skipped'`, print the reason and stop — do not
write the artifact by another route, and do not describe the run as successful.

## Why the gate asserts a count and not a flag

`verifyCitations` returns `ok: true` over an artifact with **zero** citations. That is correct at
the unit — nothing was wrong because nothing was claimed — and **vacuous here**. An extractor that
missed the renderer's grammar would hand back `ok: true` over an artifact in which nothing was
checked at all. "Every citation resolves, whole output, not sampled" is only ever as whole as
`extractCitations`: extraction **recall** is the hole, not sampling, and a count is what measures it.

## What the citation check does not do

It resolves a path and a line. **It does not check that the cited line says what the claim says it
says.** Same limit `M5.E10`'s seven checks and `B75`'s ask-record both publish — the semantic half
is not built. The artifact states this in its own Citation rule section rather than leaving a reader
to assume otherwise.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Strike the rows it recommends, so the queue stays current." | No. It proposes; you decide. A command that edits the queue it just reviewed is no longer read-only, and its next run would be reading its own output. |
| "The citation check is slowing this down — write the artifact and note the failures inside it." | An advisory that ships with known-bad citations is exactly the artifact this command exists to not produce. A failed check means no file. |
| "Add the `BACKLOG.md` link and regenerate `INDEX.md` while we're here." | Two writes outside the contract. They are human SHIP steps, named as such above. |
| "Nothing resolved, but `ok` was true — good enough." | That is the vacuous case, and it is why the gate counts. |
