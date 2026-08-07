# Signal QA sandbox

A **throwaway `.planning/` corpus** for running Signal's commands against and diffing the result.

> **This exists so that nobody ever needs to point a Signal command at a real project to see what it
> does.** Production repos are not test beds — not even in dry-run, because a dry run is one typo
> away from `--apply` and the downside is asymmetric. Run it here.

Nothing in `examples/sandbox/` is real work. Every file is a fixture. Break it freely — `git
checkout examples/sandbox` restores it.

## What it currently covers

The **closure and archive decision surface**. Each unit below exists to force a different answer,
and `tests/sandbox-corpus.test.js` asserts it still does — so the corpus cannot rot into agreeing
with whatever the code happens to do.

| Unit | Shape | Must resolve to | Archives? |
|---|---|---|---|
| `M1.E1` | Epic ID, PASS verdict, **complete** retro | `closed` | ✅ → `archive/M1/E1/` |
| `M1.E2` | Epic ID, PASS verdict, **stub** retro (`[FILL IN]`) | `closed`, then **vetoed** | ❌ — `B64` |
| `M1.E3` | Epic ID, the **current** unit in `STATE.md` | `open` | ❌ |
| `SLICE-AUTH` | **non-Epic**, split naming, PASS verdict | `closed` | ✅ **all 5 files** — `B82` |
| `SLICE-BILLING` | non-Epic, no terminal artifact | `open` | ❌ |
| `GATE-B` | terminal artifact, **no readable verdict** | `cannotDetermine` | ❌ |

Two of these are worth understanding before you read any output:

**`M1.E2` is the one that catches subtle regressions.** `resolveClosures` reports it **closed** —
its VERIFICATION really does record a PASS. It is the **stub retro** that vetoes archiving, one
layer later. So a run that archives `M1.E2` is not a closure bug; it is the veto having stopped
working. The two layers disagreeing *on purpose* is the point.

**`SLICE-AUTH` is the `B82` shape.** Its files split across two naming conventions —
`PLAN-SLICE-AUTH-RESEARCH.md` on the plan side, `SLICE-AUTH-PROGRESS.md` on the execution side.
`deriveUnits` folds them into one unit; before v0.1.21 the mover rebuilt names from a template,
could not express the fold, and archived 3 of the 5 — splitting the unit across `.planning/` and
`.planning/archive/`. **Signal's own tree cannot reproduce this**, because every unit here is a
strict Epic ID whose files really are `{EpicID}-{SUFFIX}.md`.

## What it does NOT cover yet

Stated so an empty result is never mistaken for a clean one. From the original request in
`.planning/ISSUES-INBOX.md`, still missing: un-sectioned body bloat, append-logs (`DECISIONS.md`),
milestone bloat, dangling / anchor / reference-style / HTML links, CRLF files, unstamped-but-
conformant layouts, and pre-reorg (v2) layouts. Add them as the commands that need them get worked
on — a fixture nobody reads is worse than no fixture.

## Using it

```bash
# from the repo root — read-only sensing
node -e "import('./tools/lib/archive-tree.js').then(async m => \
  console.log((await m.senseArchiveTree('examples/sandbox')).moves))"
```

To run a real command against it, point the command at `examples/sandbox` as its project root.
Reset afterwards with `git checkout examples/sandbox`.
