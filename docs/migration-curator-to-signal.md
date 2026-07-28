# Migration: Curator → Signal's built-in doc indexing

If you have a project wired to [Curator](https://github.com/insightriot/curator) (a `.curator.yml`
plus a `post-commit` hook that runs `curator refresh`), this explains when to move it onto Signal's
own document runtime, and how.

**Short version: move a repo when Signal covers what that repo actually uses Curator for.** Signal
fully owns `.planning/` today. It does not yet index anything outside `.planning/`. So a repo where
Curator only manages `.planning/` can move now; a repo where Curator also indexes `docs/`,
`campaigns/`, or similar should keep Curator for those folders until **M5.E12** lands.

*Status as of 2026-07-28. Signal v0.1.13.*

---

## Don't run both on the same directory

This is the part that matters more than tidiness. Two tools generating the same index file is not
neutral — one wins the file, and the loser's assumptions get written down as fact.

**What happened on `traction-engine` (2026-07-28, commit `f09c11b`):** Curator's `.planning/INDEX.md`
— the file whose own header says *"read me first"* — listed Phases 7 through 11 under **"Archived
units (closed — pull on demand)"**, linking to `archive/phase7/` … `archive/phase11/`. Those
directories do not exist. The archive holds phases 1–6 only, and the real Phase 7–11 documents were
live in `.planning/`, several edited that same day. Curator's post-commit hook was rendering its
*proposed* archive moves as though they had already happened, and rewriting the file on every commit.

Roughly 40 of the 53 reported "integrity issues" were orphan advisories on those same live files —
orphaned precisely because the index believed they were already archived. The number appeared on
every commit and had become something to scroll past.

So the navigation file asserted Phase 11 was closed and filed away while Phase 11 was the current
phase. That is the same defect class documented in
[`../analysis/CLAIM-INTEGRITY-ANALYSIS.md`](../analysis/CLAIM-INTEGRITY-ANALYSIS.md) — a
completeness claim written from the shape of the work rather than from the artifact — sitting in the
map instead of in the phase reports.

Either tool alone is fine. Both on one directory is not.

---

## The test for each repo

Open the repo's `.curator.yml` and see what it points at.

| What Curator manages there | What to do |
|---|---|
| Only `.planning/` | **Cut over now** — Signal covers all of it. |
| Also other folders (`docs/`, `campaigns/`, `research-pipeline/`, …) | **Keep Curator for those folders.** Signal has no replacement yet. Cut over the `.planning/` half only if you can scope Curator away from it cleanly; otherwise wait for M5.E12. |

**Check the scope while you're in there.** Curator pointed at a *repo root* ignores `.gitignore` and
scans `node_modules`, which generates hundreds of false integrity issues. Curator's own setup notes
call this out as a rule: one clean directory per root, never the repo root.

---

## What Signal covers today

**Covered:**

- **`.planning/INDEX.md`, auto-generated** — `/sig:index`. Walks the corpus (including `archive/`),
  renders mechanical rows, re-attaches curated notes by key, and writes only when content changed.
- **Archiving and eviction** — closed work is archived and old narrative evicted down to a summary
  card, with a coverage gate that proves no discrete item was silently dropped.
- **Layout migration** — `/sig:migrate-memory` reorganizes a messy or old-layout `.planning/`.
  Relocate-never-delete, dry-run by default, git-reversible.
- **Hygiene reporting** — `/sig:sweep` finds dead internal links, unfilled `[FILL IN]` stubs, index
  and roster drift, a stale capture inbox, and `CLAUDE.md` bloat. Note its scan is **wider than the
  index**: it covers `README`, `CLAUDE.md`, `docs/` and `analysis/` as well as `.planning/`. It
  reports only — it never edits.

**Not covered (the real gaps):**

- Generating index files for folders outside `.planning/`
- `llms.txt`
- The reference graph between documents
- Refreshing on every commit — Signal regenerates at Epic-close ship, or when you run `/sig:index`

---

## When the rest arrives

The missing piece is scoped as **M5.E12 — "Project-facing currency"** (see
[`../.planning/BACKLOG.md`](../.planning/BACKLOG.md)), described as taking Signal's doc runtime and
pointing it *outward at the project* instead of inward at `.planning/` — retargeting existing tools,
not inventing new ones.

Its trigger is **"M5.E11 lands, or a doc-drift incident in a Signal-built project."** The
`traction-engine` false-index above is a candidate instance of that second condition; whether it
fires the Epic early is a live call, not a settled one.

---

## How to cut over

The recipe below is what `traction-engine` did on 2026-07-28.

1. **Get `.planning/` onto Signal's current layout** — run `/sig:migrate-memory` if it isn't already.
   Dry-run by default; nothing is deleted; every move is reversible with git.
2. **Run `/sig:index`** so Signal writes its own `.planning/INDEX.md`.
3. **Delete `.curator.yml`.**
4. **Remove the Curator `post-commit` hook** from `.git/hooks/`. It is not version-controlled, so
   this is per-clone — check every machine you work from.
5. **Commit, then run `/sig:sweep`** to confirm the new index is clean.

**Also delete any leftover `llms.txt`.** Signal neither produces nor reads it, so it becomes a stale
file nobody updates — exactly the drift this migration exists to remove.

**Verify, don't assume.** After the cutover, `.planning/INDEX.md` should open with
`# Signal — .planning/ Documentation Map` and a line crediting `/sig:index`. If it still carries
Curator's header, something is still regenerating it.

---

## Uninstalling Curator entirely

Disabling Curator per repo and removing the tool are separate decisions. Curator only acts where a
`.curator.yml` and a hook exist, so leaving it installed while any repo still uses it is harmless.

**The test for "safe to uninstall":** no `.curator.yml` remains under your projects directory, and
no repo has a Curator `post-commit` hook:

```sh
find ~/dev-biz -maxdepth 3 -name .curator.yml -not -path "*/node_modules/*"
for d in ~/dev-biz/*/; do grep -l curator "$d.git/hooks/post-commit" 2>/dev/null; done
```

Both empty means nothing depends on it. Signal and `traction-engine` are already off it; four repos
were still wired as of 2026-07-28 (`operator-os`, `operator-os-lean-loop`, `cm-mentor-coach`,
`nextpass`) — that list will go stale, so run the commands rather than trusting it.

Leftover `Bash(command -v curator)` entries in a project's `.claude/settings.local.json` are
permission grants, not wiring. Harmless; remove them whenever.
