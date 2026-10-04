# Signal's storage architecture: proposal

**Status:** proposal for Brett's decision, 2026-10-03. Once decided, this is the DISCUSS input for the
Epic that builds it (`/sig:discuss --epic`). It is not a plan.

**Inputs:**
- Three deep-research reports, from the same brief ([`STORAGE-ARCHITECTURE-RESEARCH-PROMPT.md`](STORAGE-ARCHITECTURE-RESEARCH-PROMPT.md)),
  in [`item-architecture-research/`](item-architecture-research/): GPT, Gemini, Perplexity.
- The inventory of Signal's storage defects (107 of 265 items; 36 closed fixes followed by a new
  defect in the same place), taken the same day.

---

## 1. The answer, in one paragraph

Store every piece of planning data as **one JSON record per thing**, at a path that **never changes**.
An item **does not store its status**. Its status is worked out from a list of **recorded events**
inside the record (created, triaged, started, closed with proof). Explanations, rationale and
retrospectives live in **separate Markdown files that no code reads for facts**. `BUGS.md`,
`BACKLOG.md` and `STATE.md` become **generated views that no code reads at all**. **One library is
the only way to change a record**; agents may edit only the prose files, and a hook blocks the rest.
Jev may **propose** (this belongs to that Epic, this meets the criterion), and **fixed rules decide**
whether to accept, with Jev's input and answer recorded.

## 2. The three reports agree on almost everything

All three were given the same brief, and all three reached the same seven moves independently:

| # | Move | Why it ends a failure class |
|---|---|---|
| 1 | One JSON record per entity, addressed by ID, path fixed for life | Status no longer leaks into folders; files stop moving (classes 6, 8) |
| 2 | Prose in separate `.md` bodies; no code reads them for state | Wording can no longer change a status (classes 1, 2, 5) |
| 3 | Generated views (`BUGS.md` etc.) are output only; no reader parses them | Ends re-parsing the store's own rendering (classes 7, 11) |
| 4 | One write path (library/CLI) with validation; agents edit prose only | One owner per fact (class 3); no hand-edited machine state |
| 5 | Closure is an explicit recorded event with proof; never inferred from files existing | Class 4 |
| 6 | Stable IDs, links by ID, commit-pinned evidence; line numbers are display hints only | Class 10 (the advisory with every citation five lines off) |
| 7 | Migration: inspect read-only → build the new store separately → verify a manifest → one explicit cutover commit; **never automatic** | Classes 8 and 6 for other projects |

They also agree on what **not** to do:
- **Not a single shared event log file.** Every branch appends to its end, so they conflict.
- **Not a committed database.** A binary file in git cannot be merged.
- **Not Dolt or another versioned database.** It's a second version-control system to run.
- **Not CUE or OPA policy languages for now.** JSON Schema plus a small rules file is enough at
  Signal's size.

**How much to trust each report:**
- **GPT:** the strongest. It cites source code and design documents, and says plainly what it could
  not verify.
- **Perplexity:** short and careful. It has the best idea about closing work (§4, decision 3).
- **Gemini:** the weakest.
  - Its Beads row is out of date. I checked Beads' own docs today: its data lives in a Dolt database,
    and `issues.jsonl` *"is an export … not the canonical cross-machine sync channel."* GPT and
    Perplexity had this right.
  - It proposes `git reset --hard` as rollback, and migrating every repo "without manual
    intervention". Both contradict the other two reports and Signal's own rules.
  - It scores itself 30/30 and calls all twelve failure classes "impossible".
  
  I used its one sound point (§6).

## 3. Where they differ, and my pick

**How status is stored.** This is the decision that matters most.
- **Gemini** stores a `status` field **and** a history list in the same record. That is two copies of
  one fact in one file, which is exactly how the 10 self-contradicting items in today's store happened
  (header says closed, body says confirmed).
- **Perplexity** writes each event to its own file.
- **GPT** keeps the events inside the record and works the status out from them.

**Pick: GPT's.** It removes the two-copies problem, keeps one file per thing, and with a few hundred
records separate event files buy nothing. When two branches change the same item, git reports a
conflict. That's the right outcome, because the two changes really do disagree.

**IDs.** Gemini invents `SIG-BUG-0104a`; GPT uses random-looking IDs.
**Pick: keep `SIG-n`.** It's already locked (`D-M6E11-9/10`), you use these IDs when you talk, and
the risk of two branches taking the same number is already handled: new IDs are allocated by checking
every branch.

**The query database (SQLite).** All three suggest a disposable cache that git ignores.
**Pick: not yet.** Reading a few hundred JSON files is fast enough. If a cache is ever needed, Gemini
is right that it should use Node's built-in `node:sqlite`, not a compiled add-on.

## 4. Four decisions for you

**Decision 1: are the generated views committed to git?**
- *GPT says no:* they're noise, and having them there tempts people to edit them.
- *Against that:* you read the backlog in Cursor and on GitHub, and `CLAUDE.md` and the docs map link
  to `.planning/BACKLOG.md`.

**My pick: commit them.** Every write regenerates them, so they're always current, and a test fails
if a view doesn't match its records. The firm rule is that no code ever reads them.

**Decision 2: the 142 old "closed" verdicts that were never re-checked.**
- *GPT and Perplexity:* put them in a "needs re-checking" state.
- *Gemini:* keep them closed, marked as unchecked.

Re-checking would create 142 cleanup jobs that nobody is going to do.

**My pick: close them with the reason `legacy`.** They count as closed everywhere, but a `legacy`
close can never be used as proof of anything. The 10 contradictory items stop for you to decide one
by one, and nothing gets guessed.

**Decision 3: when does a fix count as closed?**
- *Perplexity's idea:* a fix is **close-requested** when the work is done, and **closed** only once
  its proof commit is reachable from `main`.
- This makes the squash-merge problem (`B117`, `B138`: commits that vanish from `main`) a rule the
  data enforces, not a paragraph in `CLAUDE.md`. It also gives the fix lane, which runs no Signal
  command, a real close event.

**My pick: adopt it.**

**Decision 4: what the first Epic covers.**
- *My pick:* the core plus the things that break most often:
  - the record format and write path;
  - work items;
  - Epics and units as real records, which replaces guessing a unit from filenames;
  - typed verdicts on VERIFICATION and REVIEW;
  - `STATE.md` split into data plus a notes file;
  - migrating Signal's own repo.
- *Second Epic:* decisions, requirements and retrospectives as records; then the other projects, one at
  a time.
- *Why split:* the first Epic is already large, and the second needs the first proven on Signal before
  it touches anyone else's repo.

## 5. What Signal adds that none of the three reports did

1. **Enforcement already exists in Signal; it just covers one file.** `plugin/hooks/check-state-write.js`
   is a Claude Code `PreToolUse` hook that blocks a bad `Edit`/`Write` to `STATE.md` today. Extend it
   to refuse any `Edit`/`Write` to the record files, which makes the write path enforced, not merely
   requested. All three reports leaned on git pre-commit hooks, which aren't installed in a fresh
   clone. ⚠ **Limit:** the hook sees `Edit`/`Write` but not a shell command like `sed`. A test that
   validates every record catches those afterwards.
2. **The first test is a write-path inventory** (GPT's idea, in Signal's vocabulary: *enforced*, not
   advisory). Every exported function that changes a record must record an event, or be listed in a
   reviewed exemption list. That's what stops the next command author writing a JSON file directly.
3. **The timing is cheap now and expensive later.** Only Signal itself is on the work-item store, and
   the migration command for other projects (step 5) was never built. Changing the design now means
   one migration; after step 5 ships it means twelve.
4. **Phase artifacts are most of the change.** A typed `verdict` on VERIFICATION and REVIEW means
   editing `commands/*.md`. That moves the instruction-line ceiling, which means regenerating
   `ADHERENCE-LOG.md` and merging with `--merge`. Plan for it at the start, not at SHIP.
5. **Splitting `STATE.md` removes a whole bug family.** The "N commits behind" count (`SIG-265`, and
   earlier `B6`) and the narrative going stale (`SIG-175`) disappear by construction. It also forces
   `/sig:resume`, `/sig:status` and `/sig:drive` onto the new read path. About 15 library files call
   `readState` today.
6. **Several open items close by construction** rather than by being fixed one at a time:
   - the backlog-wording chain (`SIG-260`, the `declaresNotLiveWork` drop);
   - the unit-file grouping chain (`SIG-255`'s keep-live becomes a field on the unit);
   - the self-contradicting items;
   - `/sig:advise`'s missing sources (`SIG-258`, `SIG-259`, `SIG-267`), once milestones, the vision
     and the roadmap are records rather than headings to find.

## 6. Decisions this overturns, and the ones it keeps

**Overturned** (each needs a recorded superseding decision at DISCUSS):

| Decision | What it said | Why it goes |
|---|---|---|
| `D-M6E11-8` | The folder must agree with the status | The status leaves the folder entirely |
| `D-M6E11-20` | Generated files keep the old `B{n}` IDs for old readers | No reader parses generated files |
| `D-M6E11-14` | The migration carries statuses without re-judging them | Replaced by decision 2 above |
| `D-M5E18-2` | Units are derived from filenames | Units become records |
| `D-M5E18-3` | Closure is inferred, with three outcomes | Closure is a recorded event |
| `D-M6E11-4` | Readers keep parsing the generated lists | All readers go through the library |

**Kept:**
- `D-BR0928-1…7`: one system of record, a mandatory ID and close event, Epic membership optional, a
  tracker as a replacement only.
- `D-M6E11-6`: an item keeps one file for life. This design makes that literally true, because the
  file no longer moves.
- `D-M6E11-9/10`: `SIG-n` IDs, never reused.
- `D-M6E11-12`: nothing is deleted.
- `D-M5E17-4/5`: merge commits; users track `main`.

## 7. What it does not solve

Graded the way GPT does. "Impossible" means the supported read path has no way for the defect to give
a valid answer.

- **Impossible for recorded state:** classes 1, 2, 4, 5, 7 and 11.
- **Reduced, not eliminated:**
  - Class 3. Prose can still restate a fact; nothing reads it, but a person can be misled.
  - Class 6. The import adapters for other projects' shapes can have bugs.
  - Class 8. A migration can have bugs.
  - Class 9. Two branches changing the same item still conflict, though now visibly.
  - Class 10. An anchor deleted from prose still needs repair.
  - Class 12. Old decisions are imported, not rewritten.
- **Not solved by storage at all:** whether an agent calls the write path. The hook plus the
  validation test make skipping it fail loudly. Neither can make an agent call it.
- **Jev cannot make a judgment deterministic.** It can make one **auditable**: the inputs, the model
  and the answer are recorded, and a fixed rule decides whether that answer is enough.

## 8. Next step

Make the four decisions in §4, or accept my picks. Then `/sig:discuss --epic` with this document as
input: the superseding decisions in §6 get written there, and PLAN works out the slices.
