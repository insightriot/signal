---
key: SIG
schema_version: 2
---

# Work store

This file switches the work-item store on for this project. Every bug, backlog row, inbox capture and open question is one **record**, `.planning/work/items/NN/SIG-n.json` (NN is the item number divided by 1000, two digits), with its body beside it as `SIG-n.md`. **A record never moves.** Its status is not stored: it is derived from the record's own events — `created` → N, `triaged` → T, `queued` → Q, `started` → P, `close_requested` → *closing*, `closed` → C, `reopened` → T.

- `items/` — every record and its body, by number
- `epics/<EpicID>/` — an Epic's documents; its items are the records whose events name the Epic
- `history/YYYY.md` — closes from more than 30 days before the newest event (a view)

`key` is the prefix of every item ID (`SIG-412`). The standing trigger watchlist lives next to this file in `WATCHLIST.md`.

`BUGS.md`, `BACKLOG.md`, `ISSUES-INBOX.md`, `OPEN-QUESTIONS.md`, `work/EPICS.md` and `work/history/` are views generated from the records — do not edit them. Change an item with `/sig:item` (`new`, `triage`, `move`, `close`, `reopen`, `edit`, `show`, `list`); a hook blocks hand edits to records.

This store was migrated from v1 item files (`node tools/work-migrate-v2.mjs --apply`). Those files are kept, never deleted, in `.planning/archive/pre-work-store-v2/`, with the migration's `MANIFEST.json`.
