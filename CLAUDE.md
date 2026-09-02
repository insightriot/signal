# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository is **Signal** (market-facing: *SignalOS*) — a Claude Code plugin that integrates patterns from across the Claude Code plugin ecosystem and adds a project-complexity calibration layer so rigor is right-sized per project.

**v1 MVP — direct ports (currently being built):**
- **GSD (Get Shit Done)** — execution orchestration: wave-based parallel execution, 21 specialized agents, context monitoring, file-based state management
- **Agent Skills** (Addy Osmani) — quality enforcement: 21 skills, 3 specialist agents, anti-rationalization tables, phase gates

**v2 planned integrations (see [`analysis/SIGNAL-INTEGRATION-RUNDOWN.md`](analysis/SIGNAL-INTEGRATION-RUNDOWN.md)):**
- **gstack** (Garry Tan) — 15-phase security audit, retro + learn memory loop, office-hours reframing
- **pm-skills** (phuryn) — upstream ideation / validation / strategy phases
- **superpowers** (Jesse Vincent / obra) — harder TDD, systematic-debugging, `<HARD-GATE>` mechanism
- **compound-engineering** (Every Inc) — post-ship Compound memory phase, multi-lens review panel

**Pattern sources (ideas borrowed, not full ports):**
- **planning-with-files** (OthmanAdi) — hook-driven context discipline
- **oh-my-claudecode** (Yeachan-Heo) — deep-interview spec-rigor gate, consensus planning

**Signal's own contribution:**
- `/sig:calibrate` (Phase 0) + `/sig:escalate` — a routing layer that writes [`.planning/PROFILE.md`](.planning/PROFILE.md) so every downstream command dials rigor up or down based on project tier (SKETCH / FEATURE / SPIKE / FULL). No source repo in the landscape solves this problem; it's Signal's unique contribution.

Command prefix: `/sig:`. The organizing metaphor is *signal vs. noise* at every phase — calibrate tunes the receiver, and the flow amplifies signal (real problem, real coverage, real user value) and suppresses noise (shiny objects, test theater, ship-for-shipping's-sake).

The plugin targets solo developers and small teams who want production-grade engineering output from AI agents — without over-engineering throwaways or under-engineering production systems.

## Current State

Milestones 1–4 closed; v1 + brownfield onboarding (`/sig:init`) feature-complete and shipped. **M4.5 (release hardening / stranger-adoption readiness): CLOSED 2026-07-15** — all Epics E1–E11 shipped across v0.1.1–v0.1.7; the "≥3 non-Signal testers" criterion is **met** (4 non-Signal users onboarded). Highlights: install-path fix (v0.1.1), STATE schema_version 1 + `/sig:checkpoint` (v0.1.2), synthesizer/docs/retro-foundations/`/sig:doctor`/`/sig:add` (v0.1.3), worked example + comparison (v0.1.4), resume-trust + capture integrity (v0.1.5), doc-integrity write-guard (v0.1.6), **Epic-native flow — `--epic` first-class (v0.1.7, 2026-07-15)**.

**Latest: v0.1.33 (2026-08-24) — "what nobody was reading." Four mechanisms that existed while nothing looked at them — and the Epic named for the same thing.** **`B75`'s observability half shipped and the row stays `confirmed` ON PURPOSE** — the enforcement half was **declined, not missed** (asked as a direct either/or 2026-08-22; answer: report, don't block). `attention: attended` sets `gates.confirm_in_phase`, which every phase command describes as confirming with you *as the phase runs* — and that boolean was written by `applyRigorOverrides` and **read by one test and nothing else**. A `PostToolUse` hook on `AskUserQuestion` (`hooks/record-ask.js`) now appends each question and its running phase to `.signal/asks.jsonl`, and `hooks/check-state-write.js` reports at phase close. ⚠ **Nothing fails when a command ignores the dial**, so the row's central sentence still describes reality: documented end to end, enforced nowhere. What would close it is the `adherence-run --canary` shape — something that FAILS on a skipped ask. Same call as `/sig:ship` below. **Whether `AskUserQuestion` is hookable was settled by running it, not by reading about it:** two readings of the same documentation page disagreed, and the *"not hookable"* one was a summarising model's inference rather than a quoted sentence — the exact provenance failure `v0.1.25` shipped a rule against. The test carried a **control arm**, because a silent log cannot distinguish *"the hook did not fire"* from *"the setup is broken"* (`M5.E15`/`B55`). **`/sig:ship` now reads the pull request's review findings before you merge** — every unresolved thread with file, line and headline; **`cannot-check`** (no `gh`, no auth, no network, no PR) renders as its own line and **never as "none"**; an unresolved thread marked **outdated** is counted separately, because a later push marks threads outdated whether or not the finding was fixed. **`.planning/ENVIRONMENT.md` — what an agent can't see from the code:** external services, configuration variable **names**, test accounts, deploy targets, escalation paths, and what automation must not touch — stubbed by `/sig:calibrate`, pre-filled by `/sig:init` from what its scanners actually found. ⚠ **Its names-never-values guard shipped with six holes, and a `.env` paste in a code fence was one of them** — the first version skipped fenced code reasoning *"an example belongs in a fence"*, which inverts the threat model, **and a test shipped pinning that as intended behaviour**. The fix then shipped three more defects, caught by the same reviewer on the next PR, including a false positive that refused ordinary content like `SLACK: #eng-help` — and since the guard refuses the **write**, that one made the file unusable for what it exists to hold. Eleven shapes caught, ten benign shapes checked, one residual documented. **DISCUSS now asks how we will know it worked**, at FULL and FEATURE — an *outcome* oracle, not the *completion* oracle acceptance criteria already are; ⚠ *"no outcome metric, and here is why"* is a **first-class PASS**, because a gate that cannot be satisfied honestly is a gate that gets rationalized past. **`M6.E4` — "what PLAN reads and writes":** three backlog rows batched by **subject, not size** (`D-BR0823-1`), and the **first Epic to run at a per-unit tier** — FEATURE inside a FULL project, the first time `B90`'s advisory changed a decision instead of being read past. Its own `S2` row **quoted a source that never existed** (*"do not close this entry"* is absent from the repo and from all git history) — `M6.E2`'s class, inside the row about not being able to tell checked from unchecked. 2841 → **2979 tests**.

**Release history lives in [`CHANGELOG.md`](CHANGELOG.md), not here.** Everything from `v0.1.15`
through `v0.1.32` had a paragraph in this file summarising what shipped and what it taught. That is
duplicated content — [`CHANGELOG.md`](CHANGELOG.md) carries every entry in full, and the per-Epic retrospectives in
[`.planning/RETROSPECTIVES.md`](.planning/RETROSPECTIVES.md) carry the reasoning. This file is read at
the start of **every** session, so the duplication was paid for on every run.

Removed 2026-09-02 under the doc-budget rule (see *House rules* below). Nothing was lost: search
[`CHANGELOG.md`](CHANGELOG.md) for a version, or the retros for an Epic.

**Active: the loop/goal work, and one test owed.** Milestone 6 is open. `M6.E1` shipped as v0.1.26,
`M6.E2` as v0.1.29, `M6.E4` as v0.1.33, `M6.E5` (`/sig:permissions`, the 22nd command) merged
2026-08-28. Since then, un-versioned on `main`: the goal-direction and external-harness analyses,
`B113` (the loop ceiling's argument was never supplied, so `/sig:drive` could only ever refuse at
VERIFY and REVIEW), decision-queue depth surfaced in `/sig:status` and `/sig:resume`, the `docs-`
command prefix (**breaking**, `D-BR0902-1`), and the docs-integrity set — doc budgets with a
grandfather ratchet, orphan detection, and dangling-reference resolution.

⚠ **`/sig:drive` has never been run end-to-end** and that is the gate on further loop work — `B113`'s
fix is verified against the module and the documented call site, not by a live run. A run that halts
on `loop-unknown` means it is not actually fixed. Filed in [`.planning/BACKLOG.md`](.planning/BACKLOG.md).

**The queue is [`.planning/BACKLOG.md`](.planning/BACKLOG.md), not this file** (`D-M5E18-1`) — read the
candidates there, including what was excluded on evidence.

For current state and active work, read in order: [`.planning/CONTEXT.md`](.planning/CONTEXT.md) → [`.planning/STATE.md`](.planning/STATE.md) (YAML frontmatter is authoritative) → [`.planning/MILESTONE-5.md`](.planning/MILESTONE-5.md). The full v1 spec is [`.planning/PROJECT.md`](.planning/PROJECT.md). See `## Vocabulary` in PROJECT.md for the locked Milestone / Epic / Slice / Task / Phase / Wave / Tier terms and the ID-is-identity rule.

Key supporting docs:
- [`analysis/REPO-ANALYSIS.md`](analysis/REPO-ANALYSIS.md) — landscape analysis of 7 AI-dev plugins; the seed of Signal.
- [`analysis/SIGNAL-INTEGRATION-RUNDOWN.md`](analysis/SIGNAL-INTEGRATION-RUNDOWN.md) — v2 vision (10-phase architecture).
- [`analysis/AGENT-EFFECTIVENESS-ALIGNMENT.md`](analysis/AGENT-EFFECTIVENESS-ALIGNMENT.md) — Signal vs. external field evidence (Span, *Beyond the Model*, Q3 2026). Strong on prompt clarity + quality stewardship; **environment readiness is the absent axis**, and it is blocked on a permission model (`/sig:permissions`), not on a one-off exception. M5.E8 stays scoped to instruction-adherence.
- `references/eval-corpus.md` — **what `eval-project-A` … `eval-project-L` mean.** Signal's checks are measured against a set of real projects of varying size and complexity — the *eval corpus* — because this repository's own `.planning/` is not a representative shape and assuming it was has produced real defects (`B82` lived only where unit names are not Epic IDs: 8 of 12 corpus projects). **Corpus projects are referred to by stable anonymous labels and never by name**; no mapping is published, and `tests/private-name-guard.test.js` fails the suite if one appears. Corpus runs are read-only — to exercise a command end-to-end, use `examples/sandbox/`.
- [`analysis/CLAIM-INTEGRITY-ANALYSIS.md`](analysis/CLAIM-INTEGRITY-ANALYSIS.md) — the second defect class, named (2026-07-28): **completeness claims written from the shape of the work rather than from the artifact.** Field evidence from eval-project-C Phase 11 (five false coverage claims in one FULL-tier phase; every catch incidental); Signal-side causes traced to `verify.md`/`review.md`/validators. Ranked fixes homed at **M5.E10** (trigger satisfied) + a tracker-integration epic (GitHub Issues as single home for obligation status). Every completeness claim must be derived, checked, or labeled unverified — never asserted from memory.
- [`analysis/LOOP-ENGINEERING-ANALYSIS.md`](analysis/LOOP-ENGINEERING-ANALYSIS.md) — loop engineering, analyzed (2026-08-03): **rigor and attention are two dials currently welded into one knob (`gate_strictness`).** Line-cited audit found ~48–86 synchronous human touchpoints per FULL-tier Epic, most enforced only in prose (`light` ≡ `strict` in code except `anti_rationalization`); proposes an `attention` axis (attended / checkpointed / unattended), an async decision queue with reversibility-weighted auto-adopt, a driver command, and parallel Epic lanes last — PR-merge stays human (merge = delivery). Feeds a future Epic (captured in ISSUES-INBOX); four defects found by the audit are in BUGS.md (needs-triage).
- `analysis/JOURNEY-MAP.html` — visual companion.
- [`GSD-AgentSkills-Combination-Analysis.md`](GSD-AgentSkills-Combination-Analysis.md) — historical (pre-landscape) two-framework analysis.

## Architecture

Three-layer design, plus a Phase 0 router above it:

0. **Calibration Router (Phase 0, Signal's own)** — `/sig:calibrate` asks 5 diagnostic questions, writes [`.planning/PROFILE.md`](.planning/PROFILE.md) that gates every downstream phase by tier (SKETCH / FEATURE / SPIKE / FULL). `/sig:escalate` upgrades tier mid-flight.
1. **Orchestration Engine (Layer 1, from GSD)** — wave-based parallel execution, `.planning/` state management, context monitoring (35% warn / 25% critical), agent spawning, CLI tools
2. **Quality Gates (Layer 2, from Agent Skills)** — on-demand skill loading per phase (not all at once), exit criteria checklists, anti-rationalization tables
3. **Anti-Rationalization & Verification (Layer 3, shared)** — Nyquist test-coverage validation, 8-dimension plan validation, specialist verifier agents

## Workflow — Phase 0 + Six Phases

```
/sig:calibrate → /sig:discuss → /sig:plan → /sig:execute → /sig:verify → /sig:review → /sig:ship
   (Phase 0,
    routes by tier)
```

Escape hatch: **`/sig:escalate` moves the tier in EITHER direction mid-flight** — up if scope or stakes grow, **down if the work turns out to be smaller than the project's ceiling** (the command is named for the common case; `escalate.md` §Case C is de-escalation). **Project tier is a CEILING, not a floor:** a per-unit `{UnitID}-PROFILE.md` runs one slice lighter without touching the project's calibration.

The REVIEW phase (between VERIFY and SHIP) is the key addition over GSD's original flow. It covers code quality, security hardening, performance optimization, and code simplification via Agent Skills' specialist agents.

**Tier-gating:** Every phase command's first action is to read `PROFILE.md`. If the current tier skips that phase, the command exits early. If `rigor_overrides` apply (e.g., `tdd_required: false` in SKETCH), the command respects them.

**v1 vs v2 scope:** v1 is the 6-phase MVP speced in [`.planning/PROJECT.md`](.planning/PROJECT.md). v2 expands to 10 phases per [`analysis/SIGNAL-INTEGRATION-RUNDOWN.md`](analysis/SIGNAL-INTEGRATION-RUNDOWN.md) (adds IDEATE / VALIDATE / STRATEGIZE upstream and COMPOUND downstream), and is gated on v1 shipping + having real users. See [`.planning/PROJECT.md`](.planning/PROJECT.md) → "Scope & Roadmap" for the full v1/v2 split and gating criteria.

## Planned Plugin Structure

```
commands/       # 22 slash commands, in 5 groups (references/command-taxonomy.md):
                #   flow        /sig:new-project, /sig:init, /sig:calibrate,
                #               /sig:discuss, /sig:plan, /sig:execute,
                #               /sig:verify, /sig:review, /sig:ship, /sig:escalate
                #   orientation /sig:status, /sig:resume
                #   capture     /sig:add, /sig:checkpoint
                #   doc upkeep  /sig:docs-index, /sig:docs-sweep, /sig:docs-migrate, /sig:docs-archive
                #   own health  /sig:doctor, /sig:update, /sig:permissions
agents/         # 26 agents (19 GSD + 3 Agent Skills specialists + 4 brownfield scanners)
skills/         # 21 quality skills organized by phase (define/, plan/, build/, verify/, review/, ship/)
references/     # Merged checklists and gates from both frameworks,
                # plus PROFILE.md schema + tier definitions
state/          # GSD's .planning/ state management (now including PROFILE.md)
tools/          # GSD's CLI tools layer
```

## Key Constraints

- Node.js 22+
- Skills must load on-demand per phase to preserve context budget — never load all 21 at once
- Plugin must be installable in under 5 minutes
- Claude Code is the primary runtime; adapter layer for Cursor/Codex is secondary
- Integration of existing frameworks, not reinvention — respect both projects' licenses
- `STATE.md` uses YAML frontmatter (`schema_version: 1`) as of v0.1.x (M4.5.E6). Schema migrations are auto-applied on first write to a legacy STATE.md; original content is preserved verbatim under an HTML comment marker. See `references/state-schema.md` and [`docs/migration-state-schema-v0.1.x.md`](docs/migration-state-schema-v0.1.x.md).

## Working in this repository

Behavioral rules that apply to every conversation and every agent, in addition to anything Signal's phase commands add on top.

### How changes reach `main` (as of 2026-08-01 — read this before your first commit)

**`main` is protected. You cannot push to it directly — the server rejects it.** Every change goes through a branch and a pull request with a green `test` check. Zero approvals are required, so nothing deadlocks, but the PR is not optional.

**Two lanes, one gate** (`D-M5E17-5`):

| | Epic lane | Fix lane |
|---|---|---|
| For | features, design work | bugs, papercuts, doc fixes |
| Six phases | yes | **no** |
| Branch + PR + green CI | **yes** | **yes** |
| Merge strategy | **`--merge`** (merge commit) | `--squash` |

A one-line fix does **not** need DISCUSS→SHIP. It **does** need a branch, a PR, and a green suite. `gh pr create --fill` then `gh pr merge --squash` is the whole overhead.

**Why the Epic lane merges instead of squashing** (`v0.1.19`, the first PR to set the precedent). Squash is right for the fix lane: one small change, one commit, nothing worth preserving underneath. It is **wrong** for an Epic, for a reason specific to this repo rather than a taste in git history.

[`.planning/ADHERENCE-LOG.md`](.planning/ADHERENCE-LOG.md) **pins commit SHAs as its reproducibility anchor** — every run record names the commit that produced the verdict, and `adherence-run.js` states the failure mode in its own words: AC4.3 breaks when *"the record would name a state nobody can return to."* Squash-merging never lands those commits on `main`; rebase-merging rewrites them. Either leaves a published verdict pointing at a commit absent from `main`'s history.

There is a second, softer reason: `commands/ship.md` §2 asks you to curate a coherent history of atomic, descriptively-messaged commits. Squashing an Epic discards that curation, which makes §2 wasted work. Under `--merge` the section means something — and an Epic's commit messages are frequently the best surviving account of *why* a line exists.

**Why this is enforced rather than written down.** `ship.md` used to carry a parenthetical exempting "the Signal-on-Signal flow" from its own Exit Criteria — which require a PR and an approval. It was written 2026-05-26; **thirteen releases shipped under it and exactly one pull request existed in that span.** The file defining the rule was the file granting the exception, so nothing caught it. Removed in v0.1.15, and the gate now lives in a GitHub ruleset because this repo has twice been bitten by rules that existed only as prose (`B7`→`B58`, `B39`).

**Delivery** (`D-M5E17-4`): `marketplace.json` uses the relative `.` source — the plugin *is* this repo — so **users track `main`**, not a pinned tag. There is no `ref` or `sha` to keep in sync, and reintroducing them fails `install-contract.test.js`. Bumping `plugin.json` is what makes an update visible to users. Tags are bookmarks, not delivery.

### House rules, and how one becomes a check

A rule here has three states, and the point of naming them is that a rule is allowed to sit in the
first one — not every convention needs a test on day one.

1. **Convention** — written down, honoured by judgement. Most rules live here and should.
2. **Advisory** — a check that reports and never fails. Useful for things where the right answer is
   a judgement call the tool cannot make.
3. **Enforced** — a test that fails the suite.

**Promote a rule when the advisory stops changing behaviour.** That is the trigger, and it is
observable rather than a matter of taste. Worked example: `checkClaudeMdBloat` has nudged at 40 KB
for weeks while [`CLAUDE.md`](CLAUDE.md) grew to 49 KB. The nudge was ignored, so the rule earned a ceiling —
`tools/doc-budgets.json`, enforced by `tests/doc-budgets.test.js`.

**Promotion requires a grandfather list, not a clean corpus.** A limit that fails on adoption day
never gets adopted, which is how the 40 KB nudge ended up decorative. So a file already over budget
is recorded at its **current** size, with a stated reason: it may shrink freely and may not grow, and
shrinking re-tightens the ceiling. **The exception list is the debt register** — it is supposed to be
non-empty, and it is supposed to shrink.

⚠ **A ceiling on an append-only ledger is wrong.** `BUGS.md` growing when a bug is found is correct
behaviour, and a check that fires on correct behaviour teaches people to ignore checks. Ledgers are
exempt **by category with a reason**, and their size is managed by archiving instead. Exemptions are
listed rather than merely absent, so a population check can tell a deliberate exemption from a file
nobody considered.

*(Borrowed and credited: [`analysis/OPENKB-ASSESSMENT.md`](analysis/OPENKB-ASSESSMENT.md) §1.)*

### Naming & plain language
- **Use real names.** Refer to features, functions, files, tables, and flows by the name that exists in the code, plan, or spec. If you don't know the real name, grep for it before using it. Never invent a label that sounds plausible.
- **Mark dev-only terms.** If you reference an internal identifier (a function, a flag, a table), say it's the code-level name — don't present it as user-facing language.
- **No filler jargon.** Don't reach for a fancier word to sound precise. If a term doesn't carry concrete meaning, cut it and say the plain thing.
- **State guesses as guesses.** If you're inferring something, flag it as an assumption. Don't assert it.
- **Don't dress up mistakes.** If you got something wrong, say so plainly and fix it. Never reframe an error as if it were intentional.

### Surface ambiguity, don't resolve silently
- If a request admits multiple interpretations, present them. Don't pick one and proceed.
- If you find a simpler approach than what was asked, surface it. Don't silently substitute.
- If you discover context that conflicts with what you were told, stop and flag it.

### Surgical edits
- Every changed line should trace directly to the requested change. If you can't justify a line against the task, don't write it.
- Don't refactor, reformat, or "improve" code outside the scope of the change — even in files you're already editing.
- Match the existing style of the file you're editing, even if you'd do it differently.
- Pre-existing dead code or issues you notice but weren't asked to fix: mention them. Don't delete or "improve" them unsolicited.
- Orphans your changes created (now-unused imports, variables, helpers): remove them.

### Signal or prose — which tool does new work go into (`D-BR0814-1`)

Both plugins are installed and one person maintains both, so this gets asked. The rule:

> If it looks at the work you are doing **right now** — the change in progress, the slice, the phase —
> it belongs in **Signal**.
> If it looks at the **whole codebase, whenever you ask** — no phase, no `.planning/` required — it
> belongs in **prose**.

`/prose:` is a **separate plugin on purpose**: it must run in any repo, including one with no
`.planning/` and no Signal install. That is the property Signal cannot give it.

They already overlap — `/prose:audit` and `agents/specialists/security-auditor.md` cover the same
ground at different scopes. The rule exists so the overlap stays deliberate. It settles nothing about
whether the plugins ever combine; borrowing a discipline from prose is Signal's stated model and is a
separate call each time.

## Reference Repositories

- **Agent Skills**: https://github.com/addyosmani/agent-skills
- **GSD**: https://github.com/gsd-build/get-shit-done
- **GSD Skill Creator** (bridge reference): https://github.com/Tibsfox/gsd-skill-creator

## Development Strategy

**Build `/sig:calibrate` first**: It's the smallest, most self-contained command — no skills loaded, no agents spawned. Just 5 questions → YAML write to `PROFILE.md`. Ship this first because every downstream command depends on the `PROFILE.md` contract. Validating the contract early de-risks the entire flow.

**Then `/sig:discuss`**: Once calibration works, build DISCUSS as the first phase that exercises the full pattern — command → reads PROFILE.md → loads skills → spawns agents → gates approval.

**Self-bootstrapping**: Once `/sig:calibrate`, `/sig:discuss`, and `/sig:plan` work, use Signal itself to plan and execute remaining phases. This is the fastest way to validate whether the architecture holds.

**Token budget is the highest risk**: Before investing days in building phase commands, measure the token cost of loading Agent Skills' larger skill files (especially `security-and-hardening`). If they blow the context budget, you'll need to summarize or chunk them — which changes the loader design. Test this in Phase 1.

**Critical path runs through Phase Commands (WBS 2.0)**: The commands are where the two frameworks' philosophies collide — that's where the integration design gets proven or broken. Agents (3.0) and skills (4.0) can be developed in parallel once `/sig:calibrate` + `/sig:discuss` validate the command pattern.

## Critical Path

Foundation (1.0) → `/sig:calibrate` → `/sig:discuss` → rest of Phase Commands (2.0) → Integration Testing (5.0) → Documentation (6.0)

## MPS (automated, by design)

This repo is tracked by **MPS**, Brett's portfolio system of record. A daily `mps-compiler[bot]` job regenerates [`STATUS.md`](STATUS.md) — its frontmatter, the `owner=agent` sections, and "Recent reality"; commits are `[skip ci]` (no CI/deploy). Harmless background activity — rebase past it on push, don't flag it as drift.

- **Don't delete [`STATUS.md`](STATUS.md)** — recreated, and its absence reads as drift in MPS.
- **Don't hand-edit** the frontmatter, `owner=agent` blocks, or "Recent reality" — regenerated daily, edits lost. The `owner=human` sections (`Decision rules`, `Deferred`) are the safe-to-edit zone.
