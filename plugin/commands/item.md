---
name: sig:item
description: "Move work items through the work store — new, triage, move, close, reopen, show, list. Every status change to a file under .planning/work/ goes through this command, so an item's folder and its own status cannot disagree. Only for projects with the store on (.planning/work/WORK.md). Not phase-gated."
args: "<new|triage|move|close|reopen|show|list> [args]"
---

# `/sig:item` — Move Work Items

You are running `/sig:item`, a not-phase-gated **capture**-group command (`references/command-taxonomy.md`). Same class as `/sig:add` — no tier-gating preamble, no skill loading, no agent spawning.

With the work store on, every bug, backlog row, inbox capture and open question is one file, `.planning/work/<folder>/SIG-n.md`, and its **folder is its status**: `inbox/` = N (new), `backlog/` = T (triaged), `epics/<EpicID>/` = Q or P (queued or in progress) — or C, closed in its Epic's folder and archived with it — `done/YYYY-MM/` = C (closed, no Epic). **Every move goes through here.** Never `mv`, `git mv`, delete or hand-edit the status of an item file — that is how a folder and a status come to disagree, and `checkStore` will report it. Nothing is ever deleted: closing is a move to `done/` (or, for an Epic's item, a status change in place).

`BUGS.md`, `BACKLOG.md`, `ISSUES-INBOX.md` and `OPEN-QUESTIONS.md` are **generated** from the item files after every change. Do not edit them.

Authoritative references:
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/work-ops.js` — `newItem`, `triageNext`, `proposeTriage`, `applyTriage`, `listNeedsReview`, `moveItem`, `closeItem`, `reopenItem`, `getItem`, `listItems`, `listThemes`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/work-store.js` — `isStoreOn`, `checkStore`
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/work-item.js` — `renderLabel`, `WorkStoreError` (dispatch on its `code`: `CONFIG`, `SCHEMA`, `NOT_FOUND`, `CONFLICT`)
- `${CLAUDE_PLUGIN_ROOT}/tools/lib/profile.js` — `readEffectiveProfile` (for `attention`, triage only)

## Pre-flight: is the store on?

Call `isStoreOn(baseDir)`.

- `{on: false}` → stop and say, in plain words: *"This project does not use the work store, so there are no items to move. To turn it on, create `.planning/work/WORK.md` with `key: SIG` (your project's key) in its frontmatter. Until then, `/sig:add` captures into the usual files."* Write nothing.
- A `CONFIG` error → show its message verbatim (it names `WORK.md` and the fix) and stop. Never fall back to the legacy files.

Items are named by their **ID**, `SIG-412`. The label `SIG-412-BUG-T` (ID, type, status) is for reading; you may pass either, and only the ID part is used.

## The seven actions

### `new "<words>"` — capture an item

`newItem(baseDir, {title, body, source: '/sig:item', by})`. The words go into `body` verbatim; write a one-line `title` (as `/sig:add` does). It lands in `inbox/` as `NEW`, status N. Print the new label and path.

### `triage` — sort the inbox, one item at a time

1. `triageNext(baseDir, {exclude})` returns the next item — ones the migration flagged (`migration_note`) first, then the oldest — with a **proposal**: type, title, theme, priority and possible duplicates. The proposal is keyword and word-overlap arithmetic, not judgement; **read the item and refine it** before presenting it. `listThemes(baseDir)` shows themes already in use — prefer joining one to inventing a near-copy.
2. Get a decision, one of:
   - **accept** — `{accept: {type, priority, theme, title}}` → status T, moved to `backlog/`. The type must be `BUG`, `FEAT`, `CHORE` or `Q`.
   - **dup** — `{dup: 'SIG-n'}` → closed `dup` of that item.
   - **reject** — `{reject: '<what was checked and found false>'}` → closed `rejected`, the text kept as proof.
   - **skip** — `{skip: true}` → left in the inbox; add its ID to `exclude` for the rest of this run.
3. `applyTriage(baseDir, id, decision, {by})`, then repeat until `triageNext` returns null.
4. Then `listNeedsReview(baseDir)` — migrated rows already in `backlog/` that carry a `migration_note`. Offer them the same way; accepting one clears its note.

**The attention setting governs confirmation, as in every phase** (`attention` from `readEffectiveProfile`, via `gates.confirm_in_phase` — not `gate_strictness`):

| `attention` | What triage does |
|---|---|
| `attended` | Ask for each item's decision individually, showing the refined proposal. |
| `checkpointed` | Refine every proposal, show them together, confirm once, then apply. |
| `unattended` | Apply the refined proposals as `accept` without asking. **Never** `dup` or `reject` unattended — closing someone's capture needs a person; skip those and list them at the end. |

### `move <ID> <status> [<EpicID>]` — change status

`moveItem(baseDir, id, {status, epic})`. N → `inbox/`, T → `backlog/`, Q or P → `epics/<EpicID>/` (the Epic is required when the item is not already in one). Closing is not a move — use `close`. Print *from → to*.

In a git repository a tracked file is moved with `git mv`, so its history follows it. If the move cannot finish, the item is put back exactly as it was; say so and show the error.

### `close <ID> <reason> [proof]` — close an item

`closeItem(baseDir, id, {reason, by, proof, dup_of})`. The reason is required, one of:

| Reason | Means | Needs |
|---|---|---|
| `fixed` | it was fixed | **ask for proof** — a commit, PR or test. If the user has none, the item records `proof: none given`, never an empty field |
| `stale` | no longer relevant | — |
| `wontdo` | true, but not worth doing | — |
| `dup` | another item covers it | `dup_of`: that item's ID, which must exist |
| `rejected` | checked, and not true | say what was checked, as `proof` |

The item moves to `done/YYYY-MM/` — unless it is in an Epic folder, where it stays, closed, and is archived with the Epic. Print its new label and path.

### `reopen <ID> "<reason>"` — a closed item came back

`reopenItem(baseDir, id, {by, reason})`. Reopen the same item rather than capturing a new one (`D-M6E11-31`): it returns to `backlog/` as T, and its previous close — reason, who, when, proof — is kept in the file's `history` with who reopened it, when and why. The reason is required: say what came back. Refused for an item that is not closed, and for one archived with its Epic — that Epic is finished, so capture a new item and link it to the old one. Print *from → to*.

### `show <ID>` — one item

`getItem(baseDir, id)` → the label, path, Epic (if any), frontmatter and body. Finds archived items too.

### `list [filters]` — many items

`listItems(baseDir, {status, type, theme, priority, epic})`, each filter optional. Print one line per item: label, title, path. With `--themes`, it calls `listThemes(baseDir)` instead: each theme with its count.

## Errors

Show the message; it names the file and the fix. `SCHEMA` means the change was refused before anything was written. `CONFLICT` means two files claim one ID, or the destination is taken — resolve by hand, then run `checkStore(baseDir)`. `NOT_FOUND` — check the ID with `list`. A message that says an item moved *but the lists were not regenerated* means the move stood; fix the file it names and re-run any `/sig:item` action.

## Gate: Item Command Complete

- [ ] Store checked first; store off → the turn-it-on message, nothing written.
- [ ] Every change went through a `work-ops.js` function — no item file moved, deleted or re-statused by hand.
- [ ] Triage confirmation followed `attention`; nothing was closed `dup`/`rejected` without a person.
- [ ] A `fixed` close asked for proof.
