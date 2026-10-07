---
name: sig:item
description: "Change work items in the work store — new, triage, move, close, reopen, edit, show, list. Every change to an item goes through this command as an event on its record, so an item's status is always derived from its own history. Only for projects with the store on (.planning/work/WORK.md). Not phase-gated."
args: "<new|triage|move|close|reopen|edit|show|list> [args]"
---

# `/sig:item` — Change Work Items

You are running `/sig:item`, a not-phase-gated **capture**-group command (`references/command-taxonomy.md`). Same class as `/sig:add` — no tier-gating preamble, no skill loading, no agent spawning.

With the work store on (`schema_version: 2` in `.planning/work/WORK.md`), every bug, backlog row, inbox capture and open question is one **record**, `.planning/work/items/NN/SIG-n.json` (NN is the item number divided by 1000, two digits: `SIG-412` is in `items/00/`). **A record never moves.** Its status is not stored anywhere — it is derived from the record's own list of events: `created` → N (new), `triaged` → T, `queued` → Q, `started` → P (in progress, in an Epic), `close_requested` → *closing* (a fix is committed but not yet confirmed on the default branch), `closed` → C, `reopened` → T. **Every change to an item goes through here, as one more event.** Never hand-edit, move or delete a record — the hook blocks writes to `items/**/*.json`, and `checkRecords` reports a record whose history does not fold. Nothing is ever deleted: closing is an event, and the record stays where it is.

An item's prose lives beside its record, in `SIG-n.md`. **That body file is yours to edit directly** — it is not blocked and carries no event.

`BUGS.md`, `BACKLOG.md`, `ISSUES-INBOX.md`, `OPEN-QUESTIONS.md`, `.planning/work/EPICS.md` and `.planning/work/history/*.md` are **views**: generated from the records after every change. Do not edit them; the hook blocks it and says to come here.

Authoritative references:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/work-records.js` — `storeVersion`, `listRecords`, `getRecord`, `triageNext`, `listNeedsReview`, `listThemes`, `newItem`, `triageItem`, `queueItem`, `startItem`, `requestClose`, `closeItem`, `reopenItem`, `editItem`, `checkRecords`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/work-item.js` — `renderLabel`, `WorkStoreError` (dispatch on its `code` — every code is listed under *Errors* below)
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/profile.js` — `readEffectiveProfile` (for `attention`, triage only)

## Pre-flight: which store is this?

Call `storeVersion(baseDir)`.

- `null` → the store is off. Stop and say, in plain words: *"This project does not use the work store, so there are no items to change. Turning it on for a project with existing lists is done by a migration, which moves every entry into the store and writes `.planning/work/WORK.md` itself: `/sig:docs-migrate`, in a later release. Don't create `WORK.md` by hand: with hand-kept lists present, every item change then refuses rather than overwrite them. Until then, `/sig:add` captures into the usual files."* Write nothing.
- `2` → every action below works.
- `1` → a **v1 store** (item files in status folders, written before records existed). `show` and `list` work — they read the v1 files through the converter, and `path` is the v1 file. **Every change refuses** with a `CONFIG` error whose `version` is `1` and whose message names `node tools/work-migrate-v2.mjs` — show it verbatim and stop. Never move a v1 item file by hand instead.
- A `CONFIG` error naming a **hand-kept** list → the store was switched on without the migration. Show the message verbatim and stop; nothing was written.
- A `CONFIG` error → show its message verbatim (it names `WORK.md` and the fix) and stop. Never fall back to the views.

Items are named by their **ID**, `SIG-412`. The label `SIG-412-BUG-T` (ID, type, status — `renderLabel({id, type: record.type, status})`) is for reading; you may pass either, and only the ID part is used. A closing item's label ends in `closing`.

## The eight actions

Every change below takes `by` (who made it) and returns the entry `{id, path, record, status, epic}`; print the new label and the record's path.

### `new "<words>"` — capture an item

`newItem(baseDir, {title, body, source: '/sig:item', by})`. The words go into `body` verbatim — written to `SIG-n.md` beside the record; write a one-line `title` (as `/sig:add` does). It is created as type `NEW`, status N.

`newItem` scrubs the title and body for secrets (AWS keys, GitHub tokens, bearer tokens, 40-character hex) before writing. If it returns `{aborted: 'sensitive-data-pending', sensitiveHits}`, nothing was written: show the user each hit and ask **keep** or **abort**. On keep, call again with `{acknowledgeSensitive: true}` as the third argument; on abort, stop. Never redact on the user's behalf.

### `triage` — sort the inbox, one item at a time

1. `triageNext(baseDir, {exclude})` from `tools/lib/work-records.js` hands over the next record at N — ones the migration flagged (`migration_note`) first, then the oldest (`created` event), then the lowest number — with its body and a **proposal** (`proposal`: type, title, theme, priority, and `duplicates`, open items whose title overlaps), or `null` when none is left; `exclude` is the IDs skipped so far in this run. The proposal is deterministic keyword and overlap arithmetic, a starting point: **read the body and the record and refine it** before asking. The themes already in use are `listThemes(baseDir)` — prefer joining one to inventing a near-copy.
2. Get a decision, one of:
   - **accept** — `triageItem(baseDir, id, {type, priority, theme, title, by})` → status T. The type must be `BUG`, `FEAT`, `CHORE` or `Q`.
   - **dup** — `closeItem(baseDir, id, {reason: 'dup', dup_of: 'SIG-n', by})` → closed `dup` of that item.
   - **reject** — `closeItem(baseDir, id, {reason: 'rejected', proof: '<what was checked and found false>', by})` → closed `rejected`, the text kept as proof.
   - **skip** — leave it at N and pass over it for the rest of this run.
3. Repeat until no N record is left that was not skipped. A new title or theme, or a reject's proof, is scrubbed for secrets as in `new`: on `{aborted: 'sensitive-data-pending'}` nothing changed — ask **keep** or **abort**, and on keep call again with `acknowledgeSensitive: true` in the options.
4. Then the records at T that still carry a `migration_note` — migrated rows that need a person's look: `listNeedsReview(baseDir)`. Offer them the same way; accepting one clears its note with `editItem(baseDir, id, {changes: {migration_note: null}, by})`.

**The attention setting governs confirmation, as in every phase** (`attention` from `readEffectiveProfile`, via `gates.confirm_in_phase` — not `gate_strictness`):

| `attention` | What triage does |
|---|---|
| `attended` | Ask for each item's decision individually, showing the proposal. |
| `checkpointed` | Make every proposal, show them together, confirm once, then apply. |
| `unattended` | Apply the proposals as `accept` without asking. **Never** `dup` or `reject` unattended — closing someone's capture needs a person; skip those and list them at the end. |

### `move <ID> <status> [<EpicID>]` — change status

Each target status is its own event:

| To | Call | From |
|---|---|---|
| T (back to the backlog) | `triageItem(baseDir, id, {by})` — the Epic is cleared | Q, P |
| Q (queued for an Epic) | `queueItem(baseDir, id, {epic, by})` | T, Q, P |
| P (started in an Epic) | `startItem(baseDir, id, {epic, by})` | T, Q |

The Epic is an Epic ID (`M6.E13`) and is required for Q and P. An item at N reaches T through `triage`, which sets its type — a bare `triageItem` on a `NEW` item is refused (`SCHEMA`). Nothing moves back to N. Closing is not a move — use `close`. Print *from → to*. The record stays where it is; only its events change.

### `close <ID> <reason> [proof]` — close an item

The reason is required, one of:

| Reason | Means | Call, and what it needs |
|---|---|---|
| `fixed` | it was fixed | `requestClose(baseDir, id, {proof, by})`. **Ask for the commit** — `proof` is a bare commit hash (lowercase hex, 7 to 64 characters) and nothing else. The item reads ***closing*** until `confirmCloses` finds that commit on the default branch (`/sig:docs-sweep` and SHIP run it; `/sig:resume` only reports it as ready), and only then C. With no commit yet, it cannot be closed `fixed`: leave it open until the fix is committed. |
| `stale` | no longer relevant | `closeItem(baseDir, id, {reason, proof, by})` — `proof` says what was checked, in words |
| `wontdo` | true, but not worth doing | `closeItem`, with `proof` as for `stale` |
| `dup` | another item covers it | `closeItem(baseDir, id, {reason: 'dup', dup_of, by})` — `dup_of` must exist, not be this item, and not itself be a duplicate |
| `rejected` | checked, and not true | `closeItem`, with `proof`: what was checked |

The Epic is kept on a closed item. A `closing` item can still be closed with another reason, or reopened. The proof of a `closeItem` is scrubbed for secrets as in `new`: on `{aborted: 'sensitive-data-pending'}` nothing was closed — ask **keep** or **abort**, and on keep call again with `{acknowledgeSensitive: true}` as the fourth argument. A commit hash is not scrubbed: it can only be hex.

### `reopen <ID> "<reason>"` — a closed item came back

`reopenItem(baseDir, id, {by, reason})`. Reopen the same item rather than capturing a new one (`D-M6E11-31`): it returns to T with its Epic cleared, and its previous close stays in its events, followed by the `reopened` event saying who, when and why. The reason is required: say what came back. Works on a C or a *closing* item. Refused for an item that is open, and for one whose Epic is archived (`.planning/archive/epics/<EpicID>/` exists) — that Epic is finished, so capture a new item and link it to the old one. Print *from → to*. The reason is scrubbed for secrets as in `new`: on `{aborted: 'sensitive-data-pending'}` nothing was reopened — ask **keep** or **abort**, and on keep call again with `{acknowledgeSensitive: true}`.

### `edit <ID> <field> <value>` — change a record field

`editItem(baseDir, id, {changes: {field: value}, by})` — one `edited` event recording each field's old and new value; status and Epic do not change. Editable fields: `type`, `title`, `theme`, `priority`, `source`, `source_ref`, `legacy_id`, `keep_because`, `migration_note`. A value of `null` removes the field. If every field already holds its new value, nothing is written. String values are scrubbed for secrets as in `new`.

The body is not a record field: edit `SIG-n.md` directly.

### `show <ID>` — one item

`getRecord(baseDir, id)` → the label, path, status, Epic (if any), the record's fields and events, and the body. Records of archived Epics are read the same way: a record never leaves `items/`.

### `list [filters]` — many items

`listRecords(baseDir)` and filter its `records` by `status`, `record.type`, `record.theme`, `record.priority` or `epic`, each optional. Print one line per item: label, title, path. With `--themes`, print each `theme` in use with its count instead. If `broken` is non-empty, say so under the list and name each by ID and path — a broken record is never silently left out.

## Checking the store

`checkRecords(baseDir)` reads every record and reports each problem by ID: a record that does not parse or validate, a history that does not fold, a record outside its folder, a symbolic link, a `dup_of` that names nothing, two records with one ID, and a view that differs from a regeneration of the records. It writes nothing. On a v1 store it returns one `v1-store` finding and nothing else. `/sig:docs-sweep` runs it as its work-store check.

## Errors

Show the message; it names the file and the fix. Every failure is a `WorkStoreError`; act on its `code`, never on the message text:

- `CONFIG` — the store is off, `WORK.md` is broken, a list is hand-kept, or the store is v1 (`version` is `1` on the error, and the message names `node tools/work-migrate-v2.mjs`). See *Pre-flight* above.
- `SCHEMA` — the change was refused before anything was written: a bad ID, status or reason, a `fixed` close without a commit hash, a close without its proof, or a broken record.
- `NOT_FOUND` — no item has that ID; check it with `list`.
- `CONFLICT` — a change the item's current status does not allow (a move, close or reopen from the wrong status), a `dup_of` that is itself a duplicate, a reopen into an archived Epic, two files claiming one ID, or a folder on the way that is a symlink out of `.planning/`. For the last two, resolve by hand, then run `checkRecords(baseDir)`. The views are written through no symbolic link below `.planning/`. `.planning/` itself may be a link to a folder inside the repository (`SIG-279`, fixed in `M6.E14`); one that resolves outside the repository refuses with `CONFLICT`.
- `GENERATED` — something tried to write a view through Signal's own writer. Change the item instead.
- `OPEN_ITEMS` — an Epic cannot close while items in it are open (*closing* counts as open); the message names each.
- `LOCKED` — another item change is running. Wait for it and re-run.
- `IO` — git or the filesystem failed; the message carries the underlying error. Unless it says otherwise, nothing changed.

A message that says an item changed *but the views were not regenerated* means the change stood, whatever its code; fix what it names, then run any action that changes an item and the views are regenerated with it. `show` and `list` only read, so they do not.

## Gate: Item Command Complete

- [ ] Store checked first; store off → the turn-it-on message, v1 store → the migration message, nothing written.
- [ ] Every change went through a `work-records.js` function — no record moved, deleted or edited by hand.
- [ ] Triage confirmation followed `attention`; nothing was closed `dup`/`rejected` without a person.
- [ ] A `fixed` close asked for the commit, and was reported as *closing*, not closed.
