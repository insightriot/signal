---
name: sig:build
description: "Build one backlog item: see the open problems beside it, size it with the person, build it, and leave the record of what was done and why in .planning/BACKLOG.md. Needs only a BACKLOG.md; no phases."
args: "<item title or a few words from it>"
---

# `/sig:build` — build one backlog item

The item: **$ARGUMENTS**

The project's record is `.planning/BACKLOG.md`: `## ` sections, each item a `### <title>` with a short
description. Bugs go in `.planning/BUGS.md` the same way. This command has no phases; do these steps.

## 1. Start

Run, from the project folder:

```bash
node "${CLAUDE_PLUGIN_ROOT}/hooks/start-build.js" "$ARGUMENTS"
```

- If it says no item matches, or there is no BACKLOG.md: create what it asks for (a `# Backlog` file
  with a `## ` section if there is none), file the item as `### <title>` with what is wanted and why,
  in the person's words where you have them, commit, and run it again with that title.
- If it lists several items, ask the person which one, then run it again with that full title.

## 2. Do what it printed

Its output is the open problems beside this item and how to size and shape it. Follow it: decide each
open problem (fix it now, or leave it with a reason), draft sizes and stop for the person's pick when it
asks you to, then build inside the size picked, writing each check as a test before the code.

## 3. Finish: leave the record

When the work is done and its tests pass:

- Mark the item done in its heading: strike the title and add the date, as
  `### ~~<title>~~ · **DONE — YYYY-MM-DD**`. Keep the item in the file; do not delete it.
- Under it, add one `Built:` line: what was built and why, in plain words, with the commit or PR.
- File every limit or follow-up as its own open `### ` item (or in BUGS.md for a bug), not as
  sentences inside the done item.
- Commit the records with the work.

If the work stops before it is done, leave the item open and add a dated `Stopped:` line saying what
is done, what is not, and why.

At the end, Signal checks that the limits you name were filed and that the item's checks have tests.
If it sends you back, do what it says once.
