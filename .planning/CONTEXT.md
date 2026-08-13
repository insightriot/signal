# Signal — Fresh-Session Context

Load this at the start of every work session. Short on purpose.

---

## Where things stand (2026-08-09)

**`v0.1.24` shipped** — *the unreached mechanism*: **one defect class, five instances.** Signal kept
building a capability, writing down the rule that should invoke it, and shipping with **nothing that
reaches for it** — so correctness rested on the operator already knowing.
`analysis/UNREACHED-MECHANISM-ANALYSIS.md` names it, and `B75` had already measured the ceiling on
Signal's habitual answer (write the rule more carefully): `light` and `strict` differ by **one
boolean** in code. Every fix in the release is a **check that fires where the situation is**.

- **`B88`** — Signal was branch-blind: **not one of 20 commands read the current branch and none
  created one**, while `execute.md` said *"create an atomic git commit"* and contained the word
  *branch* zero times. `/sig:execute` and `/sig:ship` now **refuse the default branch** at
  FEATURE/FULL (`--allow-default-branch` overrides), and the PR exit criterion is filled from a real
  URL — that box was ticked across **thirteen releases while one PR existed**.
- **`B89`** — `plan.md` permitted and forbade skipping the inbox drain, **in the same file**. Now
  required, with *"defer all remaining"* as the bounded escape.
- **`B90`** — the tier dial turns **both ways**, and every surface said otherwise. 7 of 12 projects
  run FULL; exactly one had ever written a per-unit PROFILE.
- **`B87`** — `phase-log-gap` detects a phase that ran and never entered the ledger.
- **`M5.E14`'s slice** — a discharged obligation is finally **recordable**. Its parser shipped a
  phantom *"still owed"* caught pre-release: **3 phantoms → 0 across 12 projects**, and **0 both ways
  in Signal's own tree** — `B82`'s blindness again.

⚠ **`dischargeObligation` is called by nothing.** The marker is readable and writable by hand; wiring
discharge into the phase gates stays with the tracker Epic. Said out loud so nothing reads the class
as closed.

**Prior — `v0.1.23`** — **`B85`**, fix lane. `/sig:update`'s one mutating step had never worked as
written: it told users to run `claude plugin update sig`, which the CLI rejects — an installed plugin
is identified as `{plugin}@{marketplace}`, so the working string is `sig@signal`. Live for four
releases, because **nothing in the suite ever inspected a CLI string a command file prescribes**.
`tests/prescribed-cli.test.js` now walks every `claude plugin <verb> <target>` across `commands/` and
checks the target against an identity **derived from** `plugin.json` + `marketplace.json` — pinning
the literal string would have recreated the bug inside the test.

**⚠ 11 commits sit on `main` past the `v0.1.23` tag — unreleased.** `plugin.json` still reads
`0.1.23` while two P1 fixes and two new tools are live for anyone tracking `main`:
- **`B87` fixed** (`58f5097`, `0340448`) — a phase that ran and never entered `completed_phases`.
- **`B90` fixed** (`f7b452f`) — the tier dial made visible **as a mechanism**, not a paragraph.
- **`B88`** (P1, `confirmed`), **`B89`** (P2, `confirmed`) filed — both from `eval-project-A`, both
  **unsequenced**: they landed after Brett's 2026-08-06 ordering and the priority call is his.
- Cross-project analysis tooling (`35d3fa5`) and a pre-release corpus stress test (`ab7a564`).
- The defect class behind `B87`–`B90` named (`17e445c`): **the unreached mechanism** — the capability
  exists, nothing reaches for it, and correctness depends on the operator already knowing.

**`v0.1.22` shipped** — `M5.E19`, *file finished work away*. **`/sig:archive`**: Signal could already
archive closed units but had **no command whose job that was** — it happened inside
`/sig:migrate-memory`, a command about document *layout*. Closure is a **gate**, dry-run by default.
**The release's content is the report:** the pre-existing helpers named what would move and what
could not be evaluated, and said **nothing** about units considered and **refused** — three of six
vanished, the stub-retro veto among them. Every refusal now carries its reason. **The Epic's premise
was false** and running it proved so (`D-M5E19-6`): *"wired none of it"* quoted M5.E18's **mid-Epic**
finding as an end state. Also shipped `references/command-taxonomy.md` and `examples/sandbox/`.
Filed **`B87`**. Suite **2300**; **20 commands**.

**`v0.1.21` shipped** — **`B82`**, fix lane. A closed unit archived **half of itself**: the mover
rebuilt candidates from a `{unit}-{suffix}` template that cannot express `deriveUnits`' fold. Across
12 local projects: **3 split units / 6 stranded files → 0 / 0.** Signal's own tree shows 0 before and
after — every unit here is a strict Epic ID, so **dogfooding was structurally blind to it**.

⚠ **Production repos are never test beds.** `eval-project-A`, `eval-project-D` and any live project are
off-limits to Signal commands, `--apply` or not. Use `examples/sandbox/`, which exists for exactly
this. Read-only diagnosis is fine.

**Prior — `v0.1.19`** — M5.E15, *the control arm, made real* (`B55`). The adherence harness's control
arm now deletes the measured instruction from all five sites that order it, and an independent leak
walk verifies the tree without consulting what the canary declared. `B41-phase-entry` re-ran
**`OBEYED`** (treatment 3/3, control 0/3, seam PASS) — the first verdict the harness has produced
that means what it says. Closed `B55`, `B80`, `B83`.

**Two lanes, two merge strategies** — `ADHERENCE-LOG.md` pins commit SHAs as its reproducibility
anchor, so squashing an **Epic** would leave a published verdict naming a commit absent from `main`;
v0.1.19 merged with `--merge` for that reason. The **fix lane** squashes (v0.1.20 did). The rule is
stated in `CLAUDE.md` and `commands/ship.md` (`#89`).

**▶ Next work: `M5.E14`'s shippable slice** — the `discharged` marker + a SHIP-gate
open-obligations query. It is **item 3 of Brett's 2026-08-06 ordering**; items 1 (`B52`) and 2
(`/sig:archive`) are done, and `B87` — which that ordering listed behind it — was fixed 2026-08-08.
Behind it: the **command-namespace decision** (`BACKLOG.md` item 4 — whether document-upkeep
commands get a prefix; pre-1.0 is when a rename is cheapest). The reasoning lives in **`BACKLOG.md`
→ "Next work — the agreed sequence"**; read it before starting, it records *why* that order and what
was excluded on evidence. **`B88` and `B89` are filed but deliberately outside that sequence** —
see the section below it, *"Filed since that agreement — not yet sequenced."*

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

**v1 is feature-complete and shipped. Latest: v0.1.22 (2026-08-07 — `M5.E19`, `/sig:archive`: file finished work away, and say why you didn't).** Archiving worked but had no front door — it happened inside a document-*layout* command — and the reporting named what would move while staying silent about every unit it **refused**. Prior: **v0.1.21 (2026-08-07 — `B82`: a closed unit archived half of itself; 3 split units / 6 stranded files → 0 / 0 across 12 projects, and Signal's own tree could never have shown it)**; **v0.1.20 (2026-08-06 — `B52`: a session binds to one plugin-cache version for the life of the process, so it can run a release two versions behind the repo while every config file on disk reads correctly; the tool now says so at a hook **and** on the command path, because the hook alone cannot see a mid-session update)**; **v0.1.19 (2026-08-06, M5.E15 — the control arm, made real)**. **20 slash commands, 26 agents, 21 skills, 2300 tests, validator green.**

Recent releases, newest first — full detail in `CHANGELOG.md`:

| Version | Epic | What it was |
|---|---|---|
| **v0.1.22** | M5.E19 | `/sig:archive` — a front door for archiving; every refused unit reported with its reason |
| **v0.1.21** | — (fix lane) | `B82` — a closed unit archives whole, not half; 3 split units / 6 stranded files → 0 / 0 |
| v0.1.20 | — (fix lane) | `B52` — which copy of Signal is actually running; `setCurrentEpic` refuses to clear a log it did not archive |
| v0.1.19 | M5.E15 | The control arm, made real — the harness's first verdict that means what it says |
| v0.1.18 | M5.E18 | The archive half — non-Epic units archive; three-outcome closure; a stub retro is not closure |
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

> ## ▶ HANDOFF — session paused 2026-08-09, mid-Wave-2. READ THIS FIRST.
>
> **`STATE.md`'s frontmatter is stale and will mis-orient you.** It reads
> `phase: SHIP`, `current_epic: M5.E19` — that Epic shipped as **v0.1.22, two releases ago**. Every
> piece of work below ran in the **fix lane**, so no phase command executed and nothing updated
> those fields. `last_updated_commit` points at the v0.1.24 release; **six merges have landed since**
> (#126, #128, #129, #130, #131 and this one). The staleness banner will fire — believe the banner,
> not the fields.
>
> **The order, and what each command will and will not fix** *(corrected 2026-08-09 — an earlier
> version of this line said "run `/sig:checkpoint --context` before anything else", which overstated
> what it does):*
> 1. **`/sig:resume`** — read-only orientation. It reads this file and `STATE.md`, so it surfaces
>    this handoff. Start here.
> 2. **`/sig:checkpoint --context`** — walks the git log since `last_updated_commit` and calls
>    `markFresh` to advance it to HEAD, which silences the staleness banner. **It does not touch
>    `current_epic` or `phase`.**
> 3. **Neither command corrects `current_epic: M5.E19`.** That field only moves when an Epic opens,
>    because `setCurrentEpic` is what writes it — so it stays wrong until `M5.E10` starts, and this
>    prose is what carries the truth until then.
>
> **Expect a guard when `M5.E10` opens:** `setCurrentEpic` refuses to zero a non-empty
> `completed_phases` it did not archive (`B52`'s second half). `M5.E19`'s ledger holds four phases.
> It should archive cleanly — that Epic shipped with all its artifacts — but if it halts, that is
> the guard doing its job, not a fault.
>
> **What was decided today** (full text in [`DECISIONS.md`](DECISIONS.md), `D-BR0809-1…3`):
> 1. **`M5.E10` (review hardening / claim integrity) is the next Epic.** `M5.E11` kept but cut to its
>    first slice and sequenced behind it; `M5.E12` parked.
> 2. **Milestone 5 closes when `M5.E10` ships.** `E11`, `E12` and the loop work become **M6**. The
>    old exit criterion named an architecture M5's own `E7` abandoned, so M5 could not close against
>    its own definition.
> 3. **Command names keep bare verbs** — no `docs-*`/`memory-*` prefix; `migrate-memory` → `migrate`
>    at the next breaking window. Closes `D-M5E19-9`.
>
> **What shipped today, all fix lane:** the [backlog review](BACKLOG-REVIEW-2026-08-09.md) (#126);
> Wave 1 triage — 11 contradiction findings dispositioned, `M5.E8`'s heading struck, `OPEN-QUESTIONS.md`
> refreshed off a 25×-stale test count (#128); the three decisions (#129); **`B77` fixed** — `BUGS.md`'s
> tally is now derived by `tools/lib/bugs-tally.js` and pinned by a test that caught its own author on
> first use (#130); **the `shipped` drain verb** — the drain could read a `SHIPPED` marker it could not
> write, so completed captures had no honest disposition (#131).
>
> **Where the session stopped.** Mid **Wave 2** of the review. Next action was to **triage the 52
> inbox captures** — Brett is ready to work through them; the plan was to cluster them, recommend a
> verb + reason each, and take his calls in batches. `shipped` now exists precisely so completed
> entries are not mislabelled `defer` or destroyed with `delete`.
>
> ## ▶ THE TRIAGE IS DONE — 2026-08-10, PRs #136 / #137 / #138
>
> **52 entries → 50 dispositioned + 2 standing.** Live drain candidates **52 → 2**, and 2 is the
> finished state: the trigger watchlist and the QA sandbox each forbid their own disposition in their
> own text.
>
> **The file was never 52 undecided items.** `BACKLOG.md` already carried 26 of them as sequenced
> rows and 12 more described work that had shipped — the decisions were made and the inbox copy was
> never stamped. It had been running as a shadow of the backlog. Only **12** were genuinely homeless,
> and five of those named a proposed home *in their own text* that was never written into any row.
>
> **What came out of it:** `B92` (a disposition stamp is only recognised when the reason's **last**
> word is `drain`, so a natural reason reads disposed to a human and live to the code — found by
> asserting the candidate count rather than reading the file); **13 new `BACKLOG.md` rows**; and
> **`D-BR0810-1…3`** — trajectory scoring **unparked** and fed by the local project corpus, the
> `STATE.md` narrative check **folded into `M5.E10`**, and the standing-entry mechanism **filed, not
> built** (the reliable fix is a feature, not a stamp).
>
> **`A2` gained direct evidence rather than an argument:** this drain ran entirely **outside**
> `/sig:plan`, by hand, because there is nowhere else for it to live. That is the entry's whole claim,
> demonstrated.
>
> **Two open calls carried into the next session:**
> - **`B46`** — recommendation on the table: **dismiss it, keep the row.** Its stated cause is
>   disproved (the 45 dispositions were the v2 port list, not the inbox), so the fix as written would
>   corrupt data. **Its residual symptom is now discharged** — the triage ran and 50 entries carry
>   stamps, so nothing resurfaces identically at the next drain. Still not formally actioned.
> - **`A2`** (a drain home outside `/sig:plan`) — recommended **park with a trigger**, because `B89`
>   just made the drain required and nobody has seen the new behaviour yet. Brett pushed back that it
>   may be a big deal worth building soon; the reframe that shrinks it is that `/prose:backlog`
>   *analyses* and only Signal *records*, so `A2` is "somewhere to record decisions outside PLAN,"
>   which is fix-lane sized. **Undecided.**
>
> **Also owed:** the `captureToBugs` insertion half of `B77` (cause identified — `FUTURE_IDEAS_FOOTER_RE`
> cannot match this file's tally-shaped footer), to be done next time anyone is in `add.js`'s
> insertion path.

> ## ▶ HANDOFF — `M5.E10` SHIPPED as `v0.1.25`, 2026-08-13. **Milestone 5 is closed.**
>
> **Nothing is in flight.** PR **#141** is **MERGED** (merge commit `6f7cfd5`, `--merge` not squash);
> the local checkout is on **`main`**, clean and up to date. Suite **2602**, green on `main`.
> `plugin.json` reads **`0.1.25`** — users track `main`, so that bump *is* the delivery.
>
> **Verified after the merge, because it is the reason the Epic lane does not squash:** every commit
> SHA `ADHERENCE-LOG.md` pins as its reproducibility anchor is reachable from `main`. A squash would
> have left published verdicts naming commits that never landed.
>
> ⚠ **Restart the CLI process before running any writing `/sig:` command.** This session shipped
> `0.1.25` while bound to the `0.1.24` cache — which is why the `ship.md` it loaded was missing the
> §6.6 step the same release added. `B52`'s exact shape, observed live during its own ship.
>
> ### What shipped, in one line each
>
> Seven claim-integrity checks; the honest headline is **not** the count but the reach — one check
> evaluates 12 of 12 projects, one 10 of 12, and **five apply to between 1 and 5 of twelve**. The
> Epic's own VERIFICATION **failed its own coverage check** on its first draft (asserted *"56 of 56"*,
> the check returned **six missing**) and the refutation ships as a boxed note. `B94`, `B95`, `B96`,
> `B97`, `B98` all closed, plus five defects from an independent `/code-review` pass.
>
> ### Open work — read `BACKLOG.md`, not this file (`D-M5E18-1`)
>
> - **`B99`** (filed, deferred by Brett) — an install carries ~11 MB of tracked files, 4.7 MB of it
>   `.planning/`, where ~1.9 MB is what the commands need. No other installed plugin ships `tests/`
>   or `node_modules`. **The fix needs research**: whether the manifest supports an include/exclude
>   list, or whether the plugin should ship from a subdirectory rather than the repo root.
> - **Should `.planning/` be public at all** — deliberately deferred past this release by Brett. The
>   distinction he drew is the useful one: keeping it *in the repository* was chosen and it must
>   travel with the project; *copying it into every user's plugin cache* was never separately decided.
> - **`CLAUDE.md` still names Brett's portfolio system** in a section he wrote on purpose. Left alone;
>   his call, not a scrub.
> - **The semantic backstop is still not built** (`AC0.1`, `D-M5E10-1`). Everything shipped compares
>   *tokens*; a report that names every requirement and is simply wrong about its evidence passes all
>   seven checks. It has a live `BACKLOG.md` row and a test keeps it live.
> - **Milestone 6 is not opened.** Next work is a decision, not a queue item.
**▶ `M5.E10` is IN FLIGHT — opened 2026-08-11; DISCUSS + PLAN closed.** Review hardening / claim integrity; **shipping it closes Milestone 5** (`D-BR0809-2`). Running at the project's **FULL/strict** — no Epic-scoped PROFILE. Artifacts: [`M5.E10-REQUIREMENTS.md`](M5.E10-REQUIREMENTS.md), [`M5.E10-RESEARCH.md`](M5.E10-RESEARCH.md), [`M5.E10-PLAN.md`](M5.E10-PLAN.md), [`M5.E10-VALIDATION.md`](M5.E10-VALIDATION.md); decisions `D-M5E10-1…5`.

**The scope call** (`D-M5E10-1`, Brett): **checkable parts + writing rules.** In — the requirement-coverage diff, VALIDATION self-consistency, the VERIFICATION denominator + *"what this could not establish"* section, the correction-protocol grep, retro-index freshness, and the `STATE.md` narrative check folded in by `D-BR0810-2`; plus the provenance rule and the `B38` reclassification, which cost text rather than machinery. **Out** — the adversarial claims-audit agent, *and its absence has to be visible in what ships* (`AC0.1`): that is the half which catches what determinism cannot, so letting the docs read as though claim integrity were solved would be this Epic's own defect, committed while closing the milestone named after it.

**Filed at its own DISCUSS: `B93`** — `commands/discuss.md` reads the tier *before* the Epic roll, so a `--epic` run gates the whole phase on the **previous** Epic's profile. Measured at this open: pre-roll **FEATURE/light**, post-roll **FULL/strict**. Not hit here, because the tier was deliberately re-read after the roll — so the exposure is the instruction, not the run.

*Prior: `M5.E19` closed and shipped as **v0.1.22** (retrospective at [`M5.E19-RETROSPECTIVE.md`](M5.E19-RETROSPECTIVE.md)); `B82` shipped as **v0.1.21** in the fix lane — no six phases, so no Epic artifacts and no retrospective. `M5.E14`'s shippable slice shipped as **v0.1.24**.*

**What M5.E15's close settled.** The verdict is **directive-scoped** — the control arm deletes the five sites that *order* the call and leaves the schema docs and the implementation alone, because over-deleting produces a *differently-informed* control agent whose 0/3 is as unreadable as a leaky one (`D-M5E15-1`). Its closing condition (`D-M5E15-6`) was met rather than waived: `B41-phase-entry` was re-run under the fixed arm and published — **`OBEYED`**, not the `INERT` the Epic pre-committed to publishing if that is what came back.

**Earlier: M5.E18 closed 2026-08-04**, shipped as v0.1.18 — retrospective at [`M5.E18-RETROSPECTIVE.md`](M5.E18-RETROSPECTIVE.md).

**Read the queue below against `BACKLOG.md`, not instead of it.** This list was wrong on 2026-08-03 — it named M5.E15 next while `BACKLOG.md`'s newer M5.E18 entry (PRs #21/#24, vs this file's #19) carried an unconditional-next marker and a Brett quote from that day. `/sig:resume` repeated the stale ordering. **The queue lives in two places and only `BACKLOG.md` gets edited when work is filed** (D-M5E18-1).

**The queue, in the order the evidence argues for:**

1. ~~**M5.E15**~~ — **closed, shipped as v0.1.19** (2026-08-06). The standing prohibition on re-running the canary is now discharged, not pending: it forbade a re-run before the arm was fixed, and `D-M5E15-6` required one after — which happened and published `OBEYED`.
2. ~~**`B52`**~~ — **closed, shipped as v0.1.20** (2026-08-06, fix lane).
3. **▶ The closure-gated archive command** (+`B82`) — Epic lane. Trigger **fired** 2026-08-04 when `curator` was removed from the machine; `eval-project-A` and `eval-project-D` archive by hand-written runbook today. This is the only queued item with users waiting. M5.E18 built the engine and wired none of it.
4. **`M5.E14`'s shippable slice only** — the `discharged` marker + a SHIP-gate open-obligations query behind a capability check. **Not** the tracker Epic: its stated trigger (`M5.E10` lands) is unmet, and the backlog entry explicitly allows this one piece to ship ahead as a patch.
5. **M5.E10** — review hardening / claim integrity. The **judge-based, semantic** half of M5.E16's question (claims-vs-artifacts) lands here, after the deterministic checks rather than with them.

**Open bug tail:** `B84` (**new, v0.1.20** — `cut-release.js`'s no-release-notes guard is unreachable, because a historical `## [Unreleased]` heading satisfies it forever; the tool then relabelled *that* section as the new release rather than refusing. Found by running the tool, not by reading it), `B82` (`planArchiveMoves` rebuilds candidate names instead of consuming `deriveUnits`, so it archives half a unit — **in scope for the next Epic, not separate**), `B79` (filed at M5.E18's SHIP — `evictEpicNarrative` has never been able to fire for Signal's own STATE.md and reports it as a clean no-op), `B77` (a tally that greps for exact cell values cannot see one of its own file's two formats), `B73`–`B76` (the loop-engineering audit's `LE-1…LE-4`), `B60` (P2, `needs-triage` — six phase commands have no branch for a malformed PROFILE while four meta commands do), `B61` (P3, `confirmed` — hand-edited numeric-looking `last_updated_commit` is YAML-coerced), `B56` (P3 — `facts.md`'s test count still has no guard pinning it to the real suite; `tools/cut-release.js` now sets the number from the gating `vitest` run, but only if the script is used, so the bug stays `confirmed`).

**Carried from M5.E16's retro, unhomed:** `review_depth: quality-only` silently disables `simplification_pass`, and a profile's prose can claim a dial the precedence rules turn off. That is a prose-vs-precedence comparison — M5.E10's semantic territory, not M5.E16's deterministic one.

---

*Last updated: 2026-08-06 (**M5.E15 shipped as v0.1.19; `B52` shipped as v0.1.20; the archive command is next**). **Caught by `/sig:resume` again, and this time the file contradicted itself rather than the world:* its top section already said `v0.1.19` shipped with a suite of 2233 while "Current state" 60 lines below still read `v0.1.18` / 2168 tests. A patch had updated the section a reader hits first and left the section that carries the numbers — so the stamp said "current" and the file held two different answers. **Both were two releases stale by the time anyone read them.** Fixed together with `CLAUDE.md`, which had the same two defects (`Latest: v0.1.18`, and `Active: M5.E15 — EXECUTE not started` describing an Epic that had shipped). Prior update 2026-08-04 (**M5.E18 shipped as v0.1.18**) — patched, not rewritten, and caught by `/sig:resume` reading this file against `M5.E18-RETROSPECTIVE.md`, one day after the stamp below promised the same section would be watched. Prior update 2026-08-03 (**M5.E18 opened; DISCUSS closed**). Prior update 2026-08-02 (v0.1.16 / M5.E16 shipped), when this file had gone **seven Epics stale** — it described M5.E7 as in-flight while M5.E16 was closing — and was rewritten whole rather than patched, because `CLAUDE.md` tells every reader to open it first. **It went stale again within two PRs**, on the "Active work" queue specifically; see D-M5E18-1.*

## Locked Decisions

- Epic lane merges with `--merge`; fix lane squashes. `.planning/ADHERENCE-LOG.md` pins commit SHAs as its reproducibility anchor (AC4.3 breaks when "the record would name a state nobody can return to"), so squashing or rebasing an Epic leaves a published verdict naming a commit absent from `main`. Stated in CLAUDE.md + commands/ship.md §2 as of v0.1.19 (#89); previously inferred from the fix-lane example and stated nowhere. (2026-08-06)
- Next work is sequenced: (1) `B52` stale plugin-cache binding, fix lane; (2) the closure-gated archive command, Epic lane, folding in `B82`; (3) `M5.E14`'s shippable slice only (the `discharged` marker + SHIP-gate open-obligations query). Reasoning lives in BACKLOG.md → "Next work — the agreed sequence". `M5.E12` and full `M5.E14` excluded on checked evidence: their triggers (`M5.E11`, `M5.E10`) have no artifacts on disk. (2026-08-06)
- Mutation-verification is a DECLARED DEVIATION from RED-first, never counted as strict-Nyquist compliance. Where a test was written after its implementation, breaking the code and requiring the test to go red proves the assertion discriminates today — it does not prove the test was written honestly. M5.E15 declared six such criteria rather than attesting falsely. (2026-08-06)
- A caveat whose absence is indistinguishable from a clean result must either render unconditionally or be pinned by a test that fails when it stops rendering. Written into tools/lib/adherence-caveats.js after the same defect occurred twice in the same file three months apart (M5.E8 and M5.E15 S7) — a published record silently omitting its own scope. The isolation scope now renders `undeclared` out loud rather than omitting the line. (2026-08-06)
- **M5.E19 opened as the closure-gated archive command, at Epic-scoped FEATURE against the project's FULL** (`M5.E19-PROFILE.md`). `review_depth: full` is set deliberately *against* the tier's default: under `quality-only`, `commands/review.md:17` skips Steps 2/3/4 regardless of `security_audit` / `performance_pass` / `simplification_pass`, so those dials would be inert and the profile would assert rigor the Epic never receives — the unhomed M5.E16 retro finding. Verified through `readEffectiveProfile` before PLAN rather than assumed (`B59` threw silently and ran a whole DISCUSS at project FULL). (2026-08-07) → `D-M5E19-1`
- **Archiving gets its own `/sig:archive`, not a flag on `/sig:migrate-memory`** — different trigger (every Epic close vs. every `docs_layout_version` bump), so folding them makes one command with two unrelated cadences. Cost accepted: a 20th command. (2026-08-07) → `D-M5E19-2`
- **`cannotDetermine` refuses the unit and the run still completes.** Never archived, always reported with its reason; the run does not abort. On the real corpus this is not an edge case — 9 of 30 terminal artifacts carry no readable verdict and `eval-project-B` throws on `readState`, making every unit `cannotDetermine`; aborting would let one unreadable project block archiving everywhere. (2026-08-07) → `D-M5E19-3`
- **`B82` shipped in the FIX LANE 2026-08-07 (#98), not in this Epic** — a live data-integrity defect should not wait on six phases. `planArchiveMoves` now calls `deriveUnits` directly and `suffixOf` is exported from `work-units.js` so lifecycle ordering survives. **This supersedes `D-M5E19-4`'s mechanism** (which said the closure record carries its files) while upholding its principle — one implementation of unit membership; `resolveClosures` was simply not the caller that needed changing. Measured across 12 projects: 3 split units / 6 stranded files → **0 / 0**. (2026-08-07) → `D-M5E19-4`, superseded by `D-M5E19-6`
- **Dry-run by default; the ungrouped set is reported unconditionally, including at 0.** Matches `/sig:migrate-memory`'s posture, and the tool being replaced failed by moving things it shouldn't have. Signal's tree carries 57 ungrouped against 13 units — a run that archives 13 and says nothing about 57 reads as complete when it isn't (`B39`, `D-M5E18-2`). (2026-08-07) → `D-M5E19-5`
