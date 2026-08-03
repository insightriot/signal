# Signal — Fresh-Session Context

Load this at the start of every work session. Short on purpose.

---

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

**v1 is feature-complete and shipped. Latest: v0.1.17 (2026-08-03) — `B70`, a one-bug patch: `/sig:status` and `/sig:resume` threw outright on a project whose `phase` is not one of the canonical seven (5 of 12 real projects), losing the whole briefing rather than one line. Cut ahead of M5.E18's build work. 1954 tests.** Prior: **v0.1.16 (2026-08-02, M5.E16 — STATE-vs-world drift detection).** `/sig:sweep` compares what a project's `.planning/` **asserts** against what is on disk and in git; each finding declares whether it needs a person or clears itself, and the report separates **"checked and clean"** from **"could not check."** **19 slash commands, 26 agents, 21 skills, 1938 tests, validator green.**

Recent releases, newest first — full detail in `CHANGELOG.md`:

| Version | Epic | What it was |
|---|---|---|
| **v0.1.16** | M5.E16 | STATE-vs-world drift detection · `INDEX.md` at every phase transition · `/sig:update` |
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

**M5.E18 is open — DISCUSS closed 2026-08-03.** *The archive half, for the projects Epic-gating does not reach.* Both of Signal's archive paths are Epic-gated by construction, so they reach 4 of 12 readable projects; the halves that stop `.planning/` growing forever reach a third of the corpus. Requirements: [`M5.E18-REQUIREMENTS.md`](M5.E18-REQUIREMENTS.md). Decisions: `D-M5E18-1 … D-M5E18-5`.

**Read the queue below against `BACKLOG.md`, not instead of it.** This list was wrong on 2026-08-03 — it named M5.E15 next while `BACKLOG.md`'s newer M5.E18 entry (PRs #21/#24, vs this file's #19) carried an unconditional-next marker and a Brett quote from that day. `/sig:resume` repeated the stale ordering. **The queue lives in two places and only `BACKLOG.md` gets edited when work is filed** (D-M5E18-1).

**Queued after M5.E18, in the order the evidence argues for:**

1. **M5.E15** — `B55`, the adherence control arm made real. Blocks any new adherence verdict being trusted. **Standing prohibition: do not re-run a canary for a cleaner number before the arm is fixed.**
2. **M5.E14** — tracker migration **plus** the 48-entry inbox triage cut from M5.E17 (`D-M5E17-3`). The deeper problem is the capture *channel*: findings that reach the backlog arrive incidentally, from someone reading an artifact.
3. **M5.E10** — review hardening / claim integrity. The **judge-based, semantic** half of M5.E16's question (claims-vs-artifacts) lands here, after the deterministic checks rather than with them.

**Open bug tail:** `B60` (P2, `needs-triage` — six phase commands have no branch for a malformed PROFILE while four meta commands do), `B61` (P3, `confirmed` — hand-edited numeric-looking `last_updated_commit` is YAML-coerced), `B56` (P3 — `facts.md`'s test count has no guard pinning it to the real suite; the *number* was corrected at v0.1.16, the *guard* is still missing).

**Carried from M5.E16's retro, unhomed:** `review_depth: quality-only` silently disables `simplification_pass`, and a profile's prose can claim a dial the precedence rules turn off. That is a prose-vs-precedence comparison — M5.E10's semantic territory, not M5.E16's deterministic one.

---

*Last updated: 2026-08-03 (**M5.E18 opened; DISCUSS closed**). Prior update 2026-08-02 (v0.1.16 / M5.E16 shipped), when this file had gone **seven Epics stale** — it described M5.E7 as in-flight while M5.E16 was closing — and was rewritten whole rather than patched, because `CLAUDE.md` tells every reader to open it first. **It went stale again within two PRs**, on the "Active work" queue specifically; see D-M5E18-1.*
