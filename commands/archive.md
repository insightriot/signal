---
name: sig:archive
description: "File finished work out of the live .planning/ root into .planning/archive/. Only units that are genuinely closed move; every other unit is reported with the reason it was declined. Dry-run by default; --apply writes. Not phase-gated."
args: "[--apply]"
---

# `/sig:archive` — file finished work away

You are running `/sig:archive`, a **not phase-gated** command in the **document-upkeep** group
(`references/command-taxonomy.md` § 4, alongside `/sig:index`, `/sig:sweep`,
`/sig:migrate-memory`). No tier-gating preamble, no skill loading, no agent spawning.

Its one job: move the scaffold files of **closed units** out of `.planning/` and into
`.planning/archive/<unit>/`, and **say what it decided about every unit it did not move.**

Authoritative references:
- `tools/lib/archive-command.js` — `buildArchiveReport`, `renderArchiveReport`, `applyArchive`
- `tools/lib/archive-tree.js` — `senseArchiveTree`, `applyArchiveTree`, `planArchiveMoves`
- `tools/lib/closure.js` — `resolveClosures`, `CLOSURE`
- `tools/lib/work-units.js` — `deriveUnits` (the single source of unit membership)
- `references/doc-runtime-model.md` — why finished work leaves the live files at all

## Why this is its own command and not a flag

`/sig:migrate-memory` reorganizes document **layout** and archives along the way. Those are
different questions on different cadences — layout changes when the structure does, archiving
happens at **every unit close** — so filing away finished work through a layout command means
reading past half its output (`D-M5E19-2`, restated against the taxonomy in `D-M5E19-8`).

**This command adds no new archiving power.** The machinery already worked; it had no front door.

## The bar: a warning asks, a gate refuses

The external tool this replaces (removed from the machine 2026-08-04 — named in `BACKLOG.md` and
`references/doc-runtime-model.md`; deliberately not named here, because no Signal command file may
mention it by name) matched filenames and **never checked whether the work was finished**. Its only
protection was a hand-maintained list you had to update *before* writing a file, and it proposed
archiving the same four **live** units twice. The 2026-08-01 remedy was a printed warning, and it
failed the way warnings fail.

So closure is a **gate**, not a note: a unit that is not provably closed is **not moved**, and the
run says so rather than moving it with a caveat attached.

## Workflow

### 1. Pre-flight

- Resolve the project root (cwd). If `.planning/` is absent → `No project detected. Run
  /sig:new-project or /sig:init first.` Exit.
- Parse args: `--apply` writes; anything else is ignored with a one-line note (unknown args are
  forgivable, same as `/sig:checkpoint`).

### 2. Build the report — one read, no writes

```js
const report = await buildArchiveReport(baseDir);
```

It never throws for a project-shaped reason. An unreadable `STATE.md` or an unlistable `.planning/`
comes back as a **reported refusal** (`stateReadable: false` plus `reason`), because a command that
dies cannot tell you why it archived nothing.

Every unit lands in **exactly one** of `plan` or `refusals`, and every refusal carries the reason
its resolver produced.

### 3. Render

```js
renderArchiveReport(report, { apply: false }).forEach((l) => console.log(l));
```

The load-bearing property: **"checked and clean" never renders the same as "could not check."** An
empty plan has three distinct causes — no units at all, units all still open, or nothing evaluable —
and the reader must be able to tell them apart. A detector that never looked must not read as one
that found nothing (`B39`; the whole of M5.E16).

### 4. Apply — only on `--apply`

Dry-run is the default and writes **zero bytes** under `.planning/`. On `--apply`:

```js
const res = await applyArchive(baseDir);
```

`applyArchiveTree` moves each file with a **byte-identical read-back assert** before removing the
source, then rewrites inbound links at the files' new locations. The moves are `git`-visible and
revertible; Signal never auto-commits.

Re-render with `{ apply: true }` and report `res.moves.length` moved and `res.rewrittenFiles`
referrers updated.

**Idempotent:** a second `--apply` is a no-op — archived files are excluded from move planning, so
nothing is re-proposed.

## What it will not do

| Temptation | Check |
|---|---|
| "Archive a unit whose closure I could not read — it's probably done." | No. `cannotDetermine` is a refusal. 9 of 30 terminal artifacts in the real corpus carry no readable verdict; guessing at that rate is how the retired tool proposed archiving live work. |
| "A retrospective file exists, so the unit is closed." | No — a **stub** retro still holding `[FILL IN]` is not closure (`B64`). The file existing is not the unit being finished, and this is the refusal most likely to surprise, so it is reported with its reason rather than silently. |
| "Skip the ungrouped line when it's zero — it's noise." | No. An empty collection must stay distinguishable from one that was never computed (`B39`). It renders at 0. |
| "Archive the current unit; it looks finished." | No. The unit named by `STATE.md`'s `current_epic` is mid-flight by definition. Without a readable `STATE.md` there is no way to know which unit that is, which is why an unreadable STATE refuses *everything*. |
| "Move files first, rewrite links after — if a link rewrite fails, the moves are already good." | No. `applyArchiveTree` owns the ordering (move + read-back assert, then rewrite). Do not reimplement it here. |
| "Test it against a real project to be sure." | **Never.** Use `examples/sandbox/`, which exists for exactly this. Production repos are not test beds, `--apply` or not. |

## Gate: Archive Complete

- [ ] Dry-run wrote nothing (verify: no `.planning/` mtime changed without `--apply`)
- [ ] Every unit appears exactly once — in the plan or in the refusals
- [ ] Every refusal shows its reason
- [ ] The ungrouped count rendered, including at zero
- [ ] On `--apply`: a second run is a clean no-op
