# Work items: one system of record — design direction

**Status:** direction agreed in conversation with Brett, 2026-09-28. ~~**Not yet DISCUSSed.**~~ Step 1 built as `M6.E11` (2026-09-29). This is the
input to `/sig:discuss` for the status-redesign Epic (`D-M6E3-16`; `BACKLOG.md` → *Structural
status*). Decisions below are `D-BR0928-1` … `D-BR0928-7` in `.planning/DECISIONS.md`.
**Diagram:** [`work-items/work-items-architecture.html`](work-items/work-items-architecture.html)
(source: [`work-items/work-items.architecture.json`](work-items/work-items.architecture.json), built
with the archify skill; open the HTML in a browser).

---

## 1. The problem, measured (2026-09-28)

A "thing" (bug, idea, question, finding) has **no single home**. It lives in a different file at
each stage, each file has its own word for "done", and it is retold in several more.

| Stage | Where it lives today | "Done" is written as |
|---|---|---|
| Capture | `ISSUES-INBOX.md`, `BUGS.md` (`--bug`), `OPEN-QUESTIONS.md` (`--question`), a milestone's *"Captured via /sig:add"* section | inbox: `**Status:** Promoted … (drain)` / `## ✓ SHIPPED`; bugs: a status cell; questions: **no marker code reads** |
| Triage | inbox dispositions; promoted → `BACKLOG.md`; terminal → `ISSUES-INBOX-LEDGER.md` | disposition verb + date |
| Roadmap | `BACKLOG.md` rows; `MILESTONE-N.md` Epic table | strike-through or a bold done-word (`DONE_WORD_RE`, which caused `B127`); free text in a cell |
| Execution | `STATE.md` (frontmatter + narrative + *In-flight*); per-Epic REQUIREMENTS / PLAN / PROGRESS / VALIDATION / VERIFICATION / REVIEW; `DECISIONS.md`; `DECISION-QUEUE.md`; `PROFILE.md` obligations | `completed_phases`, `[x]`, verdict lines, a `discharged` flag |
| Finished | retrospective + index, CHANGELOG, `archive/`, `STATE-HISTORY.md`, git (commit / PR / tag) | retro exists; version heading; merge |
| Retold | `CLAUDE.md` *Active*, `CONTEXT.md`, `STATE.md` narrative, `INDEX.md` | prose |

- **`M6.E3`** was named in 20 `.planning/` files + CHANGELOG + CLAUDE.md + 8 archive files, and its
  "done" was written in ~6 places by hand. One said *"EXECUTE done"* mid-flight and hid the Epic from
  `/sig:advise` (`B127`).
- **`B102`**: status in one cell, mentioned in 28 files; the only proof of the fix is a CHANGELOG
  sentence — which is why `M6.E3` needed a model to read it.
- **~17 checks** exist to reconcile copies after the fact (13 drift checks, `closure.js`,
  `/sig:advise` discharge, two Jev checks). Only **Epics** have a moment where done happens
  (`/sig:ship`); fix-lane work runs no Signal command, so nothing records its close.
- Only bugs and Epics have IDs; inbox entries, questions and backlog rows are identified by wording.

## 2. Field evidence — the most active eval-corpus project (read-only survey, 2026-09-28)

*(Named by role, not by name — `tests/private-name-guard.test.js`.)*

- **~10 intake channels, Signal models 3.** Also: the owner's live demos, customer/pilot feedback,
  curriculum reviews, weekly + nightly automated audits, a self-audit, per-PR review rounds, REVIEW
  deferrals (filed "→ inbox" and **never landing** — the inbox says so), planning-agent analyses.
- **Almost nothing has a stable ID.** `BUGS.md` promises "Triage assigns … a B-ID later" and holds
  **zero** B-IDs; inbox guidance says "cite the heading, not the number; edits shifted it by 44
  lines"; backlog ordinals get re-lettered; **audit IDs collide** (the same `NP-006` means two
  different things in two audits). Only unit names are stable.
- **The owner built the sprint layer by hand:** a `WORK-QUEUE.md` with `OPEN` / `NEEDS-BRETT` /
  `STALE`, one item → one PR, a "set by Brett" execution order, run by `/loop`. Priority actually
  lives there; `/sig:advise`'s #1 pick was not what got worked on.
- **"Done" in 6+ places that disagree.** One traced bug: the ledger says *shipped* **four days before
  the real fix**; the backlog still says a shape is live; REQUIREMENTS still lists it open.
- **Closing is not just "fixed":** doesn't-reproduce (STALE), decided-no-action, rejected (audit
  claims kept "so they aren't re-raised"), merged duplicate.
- **The drain adds noise:** 172 *"Deferred (… drain)"* re-stamps in one inbox.
- **Uses zero GitHub Issues.** Everything runs from the repo.

## 3. The direction (agreed)

**Things move through the system; they do not stay put and collect annotations** (`D-BR0928-2`).
An Epic that points at twelve documents is the mess to avoid.

```
.planning/work/
  inbox/        KEY-412.md   ← captured, any channel, ID assigned here           (N)
  backlog/      KEY-398.md   ← triaged: typed, deduped, prioritised               (T)
  epics/<id>/   README.md    ← the Epic's intent
                KEY-377.md   ← items MOVE in                                      (Q / P)
                PLAN.md …    ← the Epic's artifacts, same folder
  sprints/S3.md              ← a themed scope box: an ordered list of IDs
  done/2026-09/ KEY-301.md   ← closed, with reason + proof                        (C)
archive/                     ← done/ rolls here by period; the live tree holds only open work
```

- **One file per item.** A move is a `git mv`, not a cut-and-paste between shared files.
- **Every move goes through one command**, so the folder and the item's metadata never disagree.
- **Everything else is generated:** backlog list, inbox list, milestone table, `/sig:advise`'s input.
- **Grouping is separate from status.** Epic = a folder items move into. Sprint = a **scope box**
  (`D-BR0928-3`): themed, focused, ordered, done when its items are done — not a time box. A bug
  squash is a sprint themed "bugs". Epic membership is **optional**; an ID and a close event are
  **not** (`D-BR0928-4`).

## 4. Taxonomy

**Label:** `KEY-412-BUG-P` (`D-BR0928-5`). The **front** (`KEY-412`) is the identity — file name,
links, commits — and never changes. The **suffix** (type + status) is a live label; tools look items
up by the front only.

- **`KEY`** = the **project's own key**, chosen once at setup (Signal = `SIG`), like a Jira project
  key — not Signal's (`D-BR0928-6`). ⚠ Pick keys that don't collide with IDs a project's sources
  already use (e.g. audit IDs); a source's own ID is recorded as `source_ref`, never as the item ID.
- **Number:** sequential per project, never reused, assigned at intake from any channel.
- **Type** (set at triage; `NEW` before): `BUG` broken · `FEAT` build/improve · `CHORE` upkeep ·
  `Q` a decision needed. *Where it came from* is **source** (`/sig:add`, review, audit, support,
  demo) — "audit finding" is a source, not a type.
- **Status** (exactly one): `N` new · `T` triaged · `Q` queued (in a sprint or Epic) · `P` in
  progress · `C` closed.
- **Close reasons** (always with who + when): `fixed` (commit / PR / test), `stale`, `wontdo`,
  `dup` (of `KEY-n`), `rejected` (checked and false; kept so it isn't re-raised).
- **Fix-lane close:** a `Fixes: KEY-412` line in the commit or PR — the one place every change passes.

## 5. System of record

**One system of record per project, never two** (`D-BR0928-7`).

- **Default:** Signal's repo store (above). Works offline, in any repo.
- **Opt-in add-on:** a tracker (GitHub Issues first; Linear only if asked) **replaces** the repo
  store for that project — labels carry type/status, milestones carry Epics, a Project board
  carries sprints. The repo keeps Epic plans and reports, linking to issues. Never a mirror.
- **Add-ons are a category** (`D-BR0928-1`): Jev (already on-with-a-key) and a tracker are optional
  enhancements a project turns on. The core must be best-practice without them.

## 6. Build order (recommended; to be sliced at PLAN)

1. **Item model + repo store** — IDs, taxonomy, move/close commands, folders. Migrate **Signal's own**
   `BUGS.md` / inbox / backlog first (live in it before anyone else).
2. **Intake + triage** — every channel lands in `inbox/` with an ID and source; triage replaces the
   drain. REVIEW findings and audits file straight in.
3. **Epics, sprints, closing** — items move into Epic folders; sprints first-class (`/sig:drive` runs
   one); `Fixes: KEY-n` closes fix-lane work; retire the ~17 inference checks.
4. **GitHub Issues add-on** — off by default; try it on one real project, decide from what happens.
5. **Migration** for existing projects via `/sig:docs-migrate`.

## 7. Open — for DISCUSS

- Item file format (frontmatter fields) and where the project key is stored (`PROFILE.md`?).
- How `STATE.md`'s current-task fields relate to item status `P`.
- What happens to `DECISIONS.md`, `OPEN-QUESTIONS.md` (`Q` items?), `DECISION-QUEUE.md`.
- Migration of existing IDs (`B###`, Epic IDs) into the new ID space, and of history.
- Which of the ~17 checks retire at step 3, and what replaces each.
- Whether the tracker add-on is in this milestone or the next.
