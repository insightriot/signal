---
key: SIG
schema_version: 1
---

# Work store

This file switches the work-item store on for this project. Every bug, backlog row, inbox capture and open question is one file under `.planning/work/`, and its status is written in that file's frontmatter:

- `inbox/` — captured, not yet triaged (N)
- `backlog/` — triaged, not yet in an Epic (T)
- `epics/<EpicID>/` — an Epic's items and artifacts
- `done/YYYY-MM/` — closed (C), by month of closing

`key` is the prefix of every item ID (`SIG-412`). The standing trigger watchlist lives next to this file in `WATCHLIST.md`.

`BUGS.md`, `BACKLOG.md`, `ISSUES-INBOX.md` and `OPEN-QUESTIONS.md` are generated from the item files — do not edit them. Use `/sig:item` (`new`, `triage`, `move`, `close`, `show`, `list`).
