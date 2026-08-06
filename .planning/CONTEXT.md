# Signal — Fresh-Session Context

Load this at the start of every work session. Short on purpose.

---

## Where things stand (2026-08-06)

**`v0.1.19` shipped** — M5.E15, *the control arm, made real* (`B55`). The adherence harness's control
arm now deletes the measured instruction from all five sites that order it, and an independent leak
walk verifies the tree without consulting what the canary declared. `B41-phase-entry` re-ran
**`OBEYED`** (treatment 3/3, control 0/3, seam PASS) — the first verdict the harness has produced
that means what it says. Closed `B55`, `B80`, `B83`. Suite **2233**.

**Merged with `--merge`, deliberately** — `ADHERENCE-LOG.md` pins commit SHAs as its reproducibility
anchor, so squashing would leave a published verdict naming a commit absent from `main`. The two-lane
merge rule is now stated in `CLAUDE.md` and `commands/ship.md` (`#89`).

**▶ Next work is agreed and sequenced: `B52` → the closure-gated archive command (+`B82`) →
`M5.E14`'s shippable slice.** The reasoning lives in **`BACKLOG.md` → "Next work — the agreed
sequence"**; `STATE.md`'s resume pointer carries a summary. Read the BACKLOG entry before starting —
it records *why* this order and what was excluded on evidence.

**Start item 1 in the fix lane** (branch + PR + green CI; no six phases). Items 2 is Epic-shaped.

## Project

**Signal** (market-facing: *SignalOS*) — a Claude Code plugin that integrates patterns from the Claude Code plugin ecosystem with a project-complexity calibration router. Command prefix: `/sig:`.

## Scope (locked)

- **v1** = 6-phase MVP (`calibrate → discuss → plan → execute → verify → review → ship` + `escalate`). Currently being built.
- **v2** = 10-phase expansion (adds ideate/validate/strategize upstream + compound downstream). Follow-on, after v1 ships and validates.

See `DECISIONS.md` for full rationale.

## Attribution (locked)

9 source repos in 4 tiers:
- **Ported (v1):** GSD, Agent Skills.
- **Planned (v2):** gstack, pm-skills, superpowers, compound-engineering.
- **Pattern source:** planning-with-files, oh-my-claudecode.
- **Reference:** GSD Skill Creator.

See `LICENSES.md` for details.

## Build approach (locked)

Hand-rolled `.planning/` (this directory) drives the build. **No GSD install.** Once `/sig:calibrate`, `/sig:discuss`, `/sig:plan` are functional (late Milestone 2 / early Milestone 3), switch to dogfooding Signal on itself.

**`.planning/` is always tracked in git** — here and in every user project Signal touches. Never add it to `.gitignore`. It's the project's memory, not scratch state. See `DECISIONS.md` for the full principle.

## Current state

**v1 is feature-complete and shipped. Latest: v0.1.18 (2026-08-04, M5.E18 — the archive half, for the projects Epic-gating did not reach).** Both archive paths were Epic-gated by construction; `/sig:migrate-memory` went from **67 files across 1 of 12 projects** to **114 across 6**. Closure gained a third outcome (`cannotDetermine`) because 9 of 30 terminal artifacts carry no readable verdict, and the closed-set is a **union** — retro-only is blind to 8 projects, verdict-only loses 4. Fixed `B64`, `B72`, `B63`, `B78`. Prior: **v0.1.17 (2026-08-03 — `B70`,** `/sig:status` and `/sig:resume` threw outright on a project whose `phase` is not one of the canonical seven, losing the whole briefing rather than one line**)**; **v0.1.16 (2026-08-02, M5.E16 — STATE-vs-world drift detection).** **19 slash commands, 26 agents, 21 skills, 2168 tests, validator green.**

Recent releases, newest first — full detail in `CHANGELOG.md`:

| Version | Epic | What it was |
|---|---|---|
| **v0.1.18** | M5.E18 | The archive half — non-Epic units archive; three-outcome closure; a stub retro is not closure |
| v0.1.17 | — (fix lane) | `B70` — the briefing survives a phase it doesn't recognize |
| v0.1.16 | M5.E16 | STATE-vs-world drift detection · `INDEX.md` at every phase transition · `/sig:update` |
| v0.1.15 | M5.E17 | Instructions that contradict other instructions; `ship.md`'s direct-to-main self-exemption removed |
| v0.1.14 | M5.E13 | Guards that don't guard · **CI added** (Signal had none) |
| v0.1.13 | M5.E8 | The measurement foundation — the adherence harness + published coverage ceiling |
| v0.1.12 | M5.E9 | Linear mode & the phase ledger |
| v0.1.8–v0.1.11 | M5.E1–E6 | The doc-runtime: capture lifecycle, auto `/sig:index`, `/sig:migrate-memory`, `/sig:sweep` |

Milestones 1–4 closed; **M4.5 closed 2026-07-15** (release hardening; 4 non-Signal testers onboarded).

- **Conventions locked**: question-patterns (strict enum / 3+other / open-ended); PROFILE.md schema + tier-to-defaults + escalation_history; ID-is-identity vocabulary; `.planning/` always tracked in git; STATE.md YAML frontmatter (`schema_version: 1`) with auto-migration.
- **`.planning/INDEX.md` is the documentation map — read it first.** It now regenerates at every phase transition, so it should be current.

## How changes reach `main` (read before your first commit)

**`main` is protected — direct pushes are rejected by the server.** Every change needs a branch, a PR, and a green `test` check. Zero approvals required, so nothing deadlocks.

**Two lanes, one gate** (`D-M5E17-5`): the **Epic lane** runs the six phases; the **fix lane** runs none. **Both** require the PR. A one-line fix does not need DISCUSS→SHIP; it does need `gh pr create --fill && gh pr merge --squash`.

Delivery uses the relative `.` marketplace source, so **users track `main`**, not a pinned tag. Bumping `plugin.json` is what makes an update visible.

## Active work

**M5.E15 is open — DISCUSS closed 2026-08-04.** *The control arm, made real (`B55`).* The adherence harness mutates one command file while the instruction it deletes lives in **13 files** of the copied plugin — so no verdict it has ever produced was isolated. Requirements: [`M5.E15-REQUIREMENTS.md`](M5.E15-REQUIREMENTS.md). Decisions: `D-M5E15-1 … D-M5E15-9`.

**The two calls that shaped it.** The verdict is **directive-scoped** — the control arm deletes the five sites that *order* the call and leaves the schema docs and the implementation alone, because over-deleting produces a *differently-informed* control agent whose 0/3 is as unreadable as a leaky one (`D-M5E15-1`). And the Epic **does not close until `B41-phase-entry` is re-run under the fixed arm, publishing whatever comes back** — `INERT` would mean M5.E9's phase-entry instruction changes nothing, pre-committed at DISCUSS (`D-M5E15-6`).

**Prior: M5.E18 closed 2026-08-04**, shipped as v0.1.18 — retrospective at [`M5.E18-RETROSPECTIVE.md`](M5.E18-RETROSPECTIVE.md).

**Read the queue below against `BACKLOG.md`, not instead of it.** This list was wrong on 2026-08-03 — it named M5.E15 next while `BACKLOG.md`'s newer M5.E18 entry (PRs #21/#24, vs this file's #19) carried an unconditional-next marker and a Brett quote from that day. `/sig:resume` repeated the stale ordering. **The queue lives in two places and only `BACKLOG.md` gets edited when work is filed** (D-M5E18-1).

**The queue, in the order the evidence argues for:**

1. ~~**M5.E15**~~ — **open, DISCUSS closed 2026-08-04** (above). The standing prohibition is now *satisfied by* the Epic rather than pending: it forbids a re-run before the arm is fixed, and `D-M5E15-6` requires one after.
2. **M5.E14** — tracker migration **plus** the 48-entry inbox triage cut from M5.E17 (`D-M5E17-3`). The deeper problem is the capture *channel*: findings that reach the backlog arrive incidentally, from someone reading an artifact.
3. **M5.E10** — review hardening / claim integrity. The **judge-based, semantic** half of M5.E16's question (claims-vs-artifacts) lands here, after the deterministic checks rather than with them.

**Open bug tail:** `B79` (filed at M5.E18's SHIP — `evictEpicNarrative` has never been able to fire for Signal's own STATE.md and reports it as a clean no-op), `B77` (a tally that greps for exact cell values cannot see one of its own file's two formats), `B73`–`B76` (the loop-engineering audit's `LE-1…LE-4`), `B60` (P2, `needs-triage` — six phase commands have no branch for a malformed PROFILE while four meta commands do), `B61` (P3, `confirmed` — hand-edited numeric-looking `last_updated_commit` is YAML-coerced), `B56` (P3 — `facts.md`'s test count still has no guard pinning it to the real suite; `tools/cut-release.js` now sets the number from the gating `vitest` run, but only if the script is used, so the bug stays `confirmed`).

**Carried from M5.E16's retro, unhomed:** `review_depth: quality-only` silently disables `simplification_pass`, and a profile's prose can claim a dial the precedence rules turn off. That is a prose-vs-precedence comparison — M5.E10's semantic territory, not M5.E16's deterministic one.

---

*Last updated: 2026-08-04 (**M5.E18 shipped as v0.1.18; M5.E15 next**) — patched, not rewritten. Caught by `/sig:resume` reading this file against `M5.E18-RETROSPECTIVE.md`, one day after the stamp below promised the same section would be watched. Prior update 2026-08-03 (**M5.E18 opened; DISCUSS closed**). Prior update 2026-08-02 (v0.1.16 / M5.E16 shipped), when this file had gone **seven Epics stale** — it described M5.E7 as in-flight while M5.E16 was closing — and was rewritten whole rather than patched, because `CLAUDE.md` tells every reader to open it first. **It went stale again within two PRs**, on the "Active work" queue specifically; see D-M5E18-1.*

## Locked Decisions

- Epic lane merges with `--merge`; fix lane squashes. `.planning/ADHERENCE-LOG.md` pins commit SHAs as its reproducibility anchor (AC4.3 breaks when "the record would name a state nobody can return to"), so squashing or rebasing an Epic leaves a published verdict naming a commit absent from `main`. Stated in CLAUDE.md + commands/ship.md §2 as of v0.1.19 (#89); previously inferred from the fix-lane example and stated nowhere. (2026-08-06)
- Next work is sequenced: (1) `B52` stale plugin-cache binding, fix lane; (2) the closure-gated archive command, Epic lane, folding in `B82`; (3) `M5.E14`'s shippable slice only (the `discharged` marker + SHIP-gate open-obligations query). Reasoning lives in BACKLOG.md → "Next work — the agreed sequence". `M5.E12` and full `M5.E14` excluded on checked evidence: their triggers (`M5.E11`, `M5.E10`) have no artifacts on disk. (2026-08-06)
- Mutation-verification is a DECLARED DEVIATION from RED-first, never counted as strict-Nyquist compliance. Where a test was written after its implementation, breaking the code and requiring the test to go red proves the assertion discriminates today — it does not prove the test was written honestly. M5.E15 declared six such criteria rather than attesting falsely. (2026-08-06)
- A caveat whose absence is indistinguishable from a clean result must either render unconditionally or be pinned by a test that fails when it stops rendering. Written into tools/lib/adherence-caveats.js after the same defect occurred twice in the same file three months apart (M5.E8 and M5.E15 S7) — a published record silently omitting its own scope. The isolation scope now renders `undeclared` out loud rather than omitting the line. (2026-08-06)
