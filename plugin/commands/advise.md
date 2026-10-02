---
name: sig:advise
description: "Review this project's own .planning/ docs for the big picture, propose 3–5 priorities — every claim carrying a citation that resolves — and ask which to work on. Records the pick in its dated advisory and offers to start it. Read-only except for that advisory. Not phase-gated."
args: ""
---

# `/sig:advise` — the Roadmap Advisor

You are running `/sig:advise`. It reviews this project's `.planning/` documents for the big
picture, **proposes 3–5 priorities, and asks the user which one to work on.** It writes a dated
advisory holding the priorities, the evidence for each, and — as an unranked appendix — every live
backlog row, so a row that was passed over is distinguishable from one nobody looked at.

**It proposes. The user picks.** Nothing it writes marks an item decided, nothing lands in
`DECISION-QUEUE.md`, and no backlog row is struck. The pick is recorded only after the user makes
it, and nothing starts without a yes.

**Age is not an input** (`M6.E12`). The previous version ranked 44 of 46 rows by how long they had
sat there (`SIG-142`). The big picture is a judgment; this command makes it with receipts.

## It is not a phase command, and does not read `PROFILE.md`

Taxonomy group **orientation** (`references/command-taxonomy.md`) — it reports, it does not advance
the flow. So there is **no tier-gating preamble**, the same posture `/sig:status` and `/sig:doctor`
take. Said out loud because silence here reads as an omission rather than a decision.

No arguments.

## What it writes, and the one thing it does not

`.planning/BACKLOG-REVIEW-YYYY-MM-DD.md` (or `-2`, `-3`, … when a same-day advisory already holds a
pick — a recorded pick is never overwritten), and **nothing else** in `.planning/`. Not
`BACKLOG.md`, not `INDEX.md`, not `STATE.md`. The pick is appended to that same file.

**One write outside `.planning/`, and it is scratch:** your proposal, as JSON, goes to a file in the
session's scratchpad directory so it can be passed by path (inline JSON breaks on the first quote
or backtick in a `why`). It is not project state and is not committed.

⚠ **The inbound link from `BACKLOG.md` and the `INDEX.md` regeneration are ONE-TIME HUMAN EDITS AT
SHIP, not command behaviour.** `ORPHAN_ENTRY_POINTS` does not match this filename, so
`/sig:docs-sweep` flags the artifact as an orphan until `INDEX.md` is regenerated.

The name is **constrained, not chosen**: the doc-budget manifest exempts exactly
`BACKLOG-REVIEW-YYYY-MM-DD[-N].md`.

## Workflow

Authoritative references: `tools/lib/advise.js` — `prepareAdvise`, `runAdvise`,
`formatAdviseSummary`; `tools/lib/advise-priorities.js` — `validatePriorities`, `PRIORITY_COUNT`;
`tools/lib/advise-record.js` — `recordChoice`; `tools/lib/advise-digest.js` — `DIGEST_SOURCES`.

### 1. Gather — `prepareAdvise(baseDir)`

Returns `{corpus, digest, digestText}` and writes nothing. `digestText` is the big-picture digest:
the project's vision, its current milestone, open Epics (here and on other branches), open bugs by
priority, every live backlog row, the newest retrospectives' *What to feed back* and *What we'd do
differently* sections, open questions, and the inbox count — each line ending in its `path:line`.
**What it could not read is listed first.** Say so to the user if it is not empty: a priority drawn
from a partial picture is a different claim from one drawn from the whole.

### 2. Propose — you, reading the digest

**Read the whole digest, then open the cited files you need** — a row's body, a retrospective
section — before proposing. A priority is a direction for the project, not a restated row: group
the rows and bugs that serve one outcome, and say why that outcome matters **now**.

Write **3 to 5** priorities as a JSON array to a scratchpad file. Each is:

```json
{
  "title": "Under 120 characters",
  "why": "At most three sentences: what it is and why now.",
  "covers": [".planning/BACKLOG.md:42", "B254", "new: work nobody has filed yet"],
  "evidence": [".planning/M6.E11-RETROSPECTIVE.md:82", ".planning/BUGS.md:165"],
  "dependsOn": [2]
}
```

- `covers` names what the priority would take on: a **live backlog row by its citation** (the
  `path:line` the digest gives it), an **open bug by id**, or **unfiled work** as `new: …`. A row
  sits under one priority only.
- `evidence` is one or more `path:line` (or `path`) citations, repo-root-relative, that support the
  `why` — lines you actually read.
- `dependsOn` (optional) lists the priorities this one should come after, by number.

**Before asking, check the priorities against each other.** Does one make another unsafe or
pointless to do first — a fix another priority's tool relies on, a measurement another one needs?
If so, either fold the precondition into the priority that needs it, or say it with `dependsOn`.
Found on the first real run: the user asked *"are there any natural dependencies?"* and there was
one (step 5 moves backlogs with the reader that two of the proposed bugs break) — the proposal had
not looked.

### 3. Validate, render, gate, write — `runAdvise(baseDir, { today, priorities, projectName })`

Parse the scratch file and pass the array. `runAdvise` re-reads the corpus, runs
`validatePriorities` (count, fields, every citation resolves, every covered row and bug is live),
renders the advisory, re-checks that every cited row and bug line still carries what it was cited
for, and asserts the citation **count** before writing.

On `status: 'skipped'`, print `formatAdviseSummary(result)` — it lists **every** reason. If the
reasons are about the proposal, fix the proposal and call again; do not write the artifact by
another route, and do not describe the run as successful.

On success, print `formatAdviseSummary(result)`.

### 4. Ask — the user picks

Ask which priority to work on:

- **3 or 4 priorities:** one `AskUserQuestion`, one option per priority (label = title, description
  = the `why`). `AskUserQuestion` takes at most four options, and adds "Other" itself.
- **5 priorities:** a plain numbered list and the question *"Which one — 1 to 5, or something else?"*
  — five do not fit the picker.

Present them as proposals, with each `dependsOn` stated in the option. Do not mark one recommended
unless one is a precondition of another, and then name the reason.

### 5. Record — `recordChoice(baseDir, result.path, { pick, words, by })`

`pick` is the priority number, or `'other'` with the user's own `words`, verbatim. It appends a
**Picked by you** section to the advisory and writes nothing else. A file that already records a
pick is refused — the record is evidence, and it is never replaced.

### 6. Offer to start

Offer, and wait for the answer:

- **Start it with `/sig:drive`** — the picked priority becomes the run's work.
- **Open an Epic with `/sig:discuss --epic`** — scope it first.
- **Not now.**

Nothing starts without a yes.

## Why the gate asserts a count and not a flag

`verifyCitations` returns `ok: true` over an artifact with **zero** citations. That is correct at
the unit — nothing was wrong because nothing was claimed — and **vacuous here**. An extractor that
missed the renderer's grammar would hand back `ok: true` over an artifact in which nothing was
checked at all. So the gate counts: one citation per priority's `why`, per cited covered row or bug,
and per appendix row.

## What the citation check does not do

It resolves a path and a line. **It does not check that the cited line says what the claim says it
says** — beyond one narrow case: every cited backlog row and bug line is re-read to confirm it still
carries that row or bug. A priority's `evidence` lines are checked for existence only. The artifact
states this in its own Citation rule section.

## Anti-Rationalization Check

| Temptation | Check |
|---|---|
| "Propose from the row titles; the digest is long." | The digest is the big picture; a priority built from titles is the age ranking with a new label. Read it, and open the files your `why` depends on. |
| "Mark one priority recommended to save the user a decision." | It proposes; the user picks. Recommend only with a concrete dependency, named. |
| "The user said yes to the advisory, so start the work." | Picking is not starting. Offer `/sig:drive` / `/sig:discuss --epic` / not now, and wait. |
| "Strike the rows the pick covers, so the queue stays current." | No. A command that edits the queue it just reviewed is no longer read-only, and its next run would be reading its own output. |
| "The citation check failed — write the artifact and note the failures inside it." | A failed check means no file. Fix the proposal and run again. |
| "Re-run and overwrite today's advisory; the pick was a mistake." | A recorded pick is never replaced. Re-run: it writes `-2`, and both records stand. |
