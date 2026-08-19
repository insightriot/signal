# Signal — Fresh-Session Context

Load this at the start of every work session. Short on purpose.

---

## Where things stand (2026-08-19)

> **One section, by design (2026-08-19).** This file used to answer *"what's current"* in two
> places — a narrative section here and a numbers-and-table section 160 lines below. **Every**
> refresh updated one and left the other, and on 2026-08-19 both were wrong at once: this section
> sat five releases and one milestone stale while the other sat two. The split was introduced to
> keep prose and figures from crowding each other; what it actually produced was two answers and no
> rule that they move together. **They are merged here. Update this section, or the file is wrong.**
> The refresh history is preserved verbatim in the stamp at the end of *"Active work"*.

**v1 is feature-complete and shipped, at `v0.1.30` (2026-08-18).** **20 slash commands, 26 agents, 21 skills, 2761 tests, validator green** — these counts describe that release; the releases themselves are below, newest first.

**`v0.1.30` shipped — `B104`, fix lane.** *Four agents with a shell, reading text nobody checked.*
`/sig:init` spawns **four scanner agents in parallel**, all four declaring `tools: Read, Bash, Grep,
Glob`, and **nothing in any scanner file or in `init.md` told them what they read was data** — a grep
returned **zero**, not weak instructions. ⚠ **The first headline was overstated and was corrected the
same day**, after Brett asked how scanners write to a codebase: they do not. `/sig:init` runs on
**your own** codebase and every scanner is confined to `.planning/scan/{name}.md`. The real exposure
is **command execution** (they hold `Bash` — *"run this setup command first"*) and **downstream
propagation** (scanner output becomes `LANDSCAPE.md` → `PROJECT.md` → every later phase), not file
writes. Still real, because your own repo carries text you did not write — vendored deps, contributor
commits, forked files — and because people do point `/sig:init` at a clone they are evaluating.
**Found by reading someone else's code:** `vercel-labs/eve-software-factory-template` (MIT) ships a
prompt-injection eval Signal had no equivalent of. Pinned by a whole-population assertion that reads
the scanner directory **from disk**, so a fifth scanner fails the suite until it carries the clause.
⚠ **Scope is the scan surface only**, and **an instruction is not a sandbox** — explicit and testable,
not impossible, and **no eval exercises it**. Suite **2761**; **20 commands**.

**Prior — `v0.1.29`, `M6.E2`** — *the facts Signal publishes about itself.* A document states a fact
about the project — a count, a status, a version — and **nothing derives it from the artifact it
summarises**. Five checks for that class, reached from `/sig:sweep` and `/sig:resume`, plus the
write-path fix that stops **`/sig:add --bug` falsifying the file it writes to**. **The mechanism
already existed and nothing reached it:** `bugs-tally.js` has derived-then-compared correctly since
`B77` and its **only caller was a test**. ⚠ **Three of the five checks evaluate one project: this
one** — measured across 12 local projects *before* scope was locked; the tally and milestone checks
reach **1 of 12**, **0 of 11** excluding Signal. Brett ruled *no trimming* (`D-M6E2-1`), so all five
ship **with their reach printed next to the clean count** — narrow reach has never been the
disqualifying property; claiming generality you do not have is. ⚠ **The semantic half stays unbuilt**
(`D-M6E2-7`) — everything here compares tokens.

**Prior — `v0.1.28`** (`B103`, fix lane) — `/sig:doctor --fix` offered `rm -rf` on cache directories
a live session was running, because *orphan* meant "not current", not "nobody is using it". Both
script builders now emit a guard that **re-checks at script-run time**. **Prior — `v0.1.27`**
(`B102`, fix lane) — `v0.1.26`'s own migration advice **uninstalled Signal and said it didn't**.
**Prior — `v0.1.26`, `M6.E1`** — the plugin payload: an install ships the plugin, not the repository
(**985 files / 12.4 MB → 382 / 3.2 MB**; `.planning/` **270 files → 0**). ⚠ That stops `.planning/`
being *copied to users*; it does **not** make it private.

**Nothing is in flight. Milestone 6 is open** — `M6.E1` shipped as v0.1.26, `M6.E2` as v0.1.29, plus
three fix-lane releases. **Next work is a decision, not a queue item, and it is Brett's.** Open and
deliberately deferred: **`B99`'s remaining half** (the packaging half shipped in `M6.E1`); **whether
`.planning/` should be public at all** (keeping it *in the repo* was chosen; *copying it into every
user's plugin cache* never was); **the semantic claims-audit backstop** (`AC0.1`); and two findings
that ship open by choice — the dated `[Unreleased]` heading (a product call, in `OPEN-QUESTIONS.md`)
and `bug-status-vs-changelog` running at a measured 1-in-2 precision. The queue itself is
[`BACKLOG.md`](BACKLOG.md) (`D-M5E18-1`).

**Prior — `v0.1.25`** — `M5.E10`, and it closed Milestone 5. *Claim integrity: the checks, and what
they cannot see.* Seven deterministic checks for one defect class — **completeness claims written
from the shape of the work rather than from the artifact**. **The honest headline is the reach, not
the count:** one check evaluates 12 of 12 corpus projects, one 10 of 12, and **five apply to between
1 and 5 of twelve**. The Epic's own VERIFICATION **failed its own coverage check** on the first draft
(asserted *"56 of 56"*; the check returned **six missing**) and that refutation ships as a boxed note
rather than being tidied away. Closed `B94`–`B98`, plus five defects from an independent
`/code-review` pass.

⚠ **The semantic half is deliberately NOT built** (`AC0.1`, `D-M5E10-1`). Everything shipped compares
*tokens*. A report that names every requirement, carries a denominator, and is simply **wrong about
what its evidence asserts** passes all seven checks. A live `BACKLOG.md` row and a test keep that
absence visible — do not let the docs read as though claim integrity were solved.

**Prior — `v0.1.24`** — *the unreached mechanism*: **one defect class, five instances.** Signal kept
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

*(A warning here about 11 unreleased commits sitting past the `v0.1.23` tag is **resolved** —
`v0.1.24` released them on 2026-08-09, and `B87`, `B88`, `B89` and `B90` all shipped in it.)*

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

*(Brett's 2026-08-06 ordering — `B52`, then `/sig:archive`, then `M5.E14`'s slice — is **fully
discharged**: v0.1.20, v0.1.22 and v0.1.24 respectively. `B88`, `B89` and `B90`, filed outside that
sequence, also shipped in v0.1.24. The **command-namespace question closed** on 2026-08-09: bare
verbs stay, `migrate-memory` → `migrate` at the next breaking window (`D-BR0809-3`). The sequence is
kept in `BACKLOG.md` as history, not as a queue.)*

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

Recent releases, newest first — full detail in `CHANGELOG.md`:

| Version | Epic | What it was |
|---|---|---|
| **v0.1.30** | — (fix lane) | `B104` — scanned repository content is data, not instructions; the scan surface only, and no eval exercises it |
| v0.1.29 | M6.E2 | The facts Signal publishes about itself — five published-fact checks, three of which evaluate only this project, each shipping with its reach printed |
| v0.1.28 | — (fix lane) | `B103` — `/sig:doctor --fix` no longer offers to delete the cache copy a live session is running |
| v0.1.27 | — (fix lane) | `B102` — the migration instructions uninstalled Signal and said they didn't |
| v0.1.26 | M6.E1 | The plugin payload — an install ships the plugin, not the repository (985 files / 12.4 MB → 382 / 3.2 MB) |
| v0.1.25 | M5.E10 | Claim integrity — seven deterministic checks; the reach measured and published, the semantic half deliberately not built |
| **v0.1.24** | — (fix lane) | The unreached mechanism — five rules that now check themselves (`B87`–`B90`, `M5.E14`'s slice) |
| v0.1.23 | — (fix lane) | `B85` — `/sig:update` prescribes a CLI string that works (`sig@signal`) |
| v0.1.22 | M5.E19 | `/sig:archive` — a front door for archiving; every refused unit reported with its reason |
| v0.1.21 | — (fix lane) | `B82` — a closed unit archives whole, not half; 3 split units / 6 stranded files → 0 / 0 |
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

Milestones 1–4 closed; **M4.5 closed 2026-07-15** (release hardening; 4 non-Signal testers onboarded). **Milestone 5 closed 2026-08-13** when `M5.E10` shipped (`D-BR0809-2`). **Milestone 6 is open**: `M6.E1` shipped as v0.1.26 and `M6.E2` as v0.1.29; three fix-lane releases (v0.1.27, v0.1.28, v0.1.30) followed. Nothing is in flight.

- **Conventions locked**: question-patterns (strict enum / 3+other / open-ended); PROFILE.md schema + tier-to-defaults + escalation_history; ID-is-identity vocabulary; `.planning/` always tracked in git; STATE.md YAML frontmatter (`schema_version: 1`) with auto-migration.
- **`.planning/INDEX.md` is the documentation map — read it first.** It now regenerates at every phase transition, so it should be current.

## How changes reach `main` (read before your first commit)

**`main` is protected — direct pushes are rejected by the server.** Every change needs a branch, a PR, and a green `test` check. Zero approvals required, so nothing deadlocks.

**Two lanes, one gate** (`D-M5E17-5`): the **Epic lane** runs the six phases; the **fix lane** runs none. **Both** require the PR. A one-line fix does not need DISCUSS→SHIP; it does need `gh pr create --fill && gh pr merge --squash`.

Delivery uses the relative `.` marketplace source, so **users track `main`**, not a pinned tag. Bumping `plugin.json` is what makes an update visible.

## Active work

> ## ▶ CLOSED — `M6.E2` SHIPPED as `v0.1.29`, 2026-08-18. Kept for the reach evidence.
>
> **The facts Signal publishes about itself, and what re-derives them.** All six phases closed the
> same day; retro at [`M6.E2-RETROSPECTIVE.md`](M6.E2-RETROSPECTIVE.md). Requirements:
> `M6.E2-REQUIREMENTS.md` (26 criteria). Decisions: `DECISIONS.md` § *2026-08-18 — M6.E2 DISCUSS*
> (`D-M6E2-1` … `D-M6E2-7`). Reach evidence: `M6.E2-CORPUS-MEASUREMENT.md`.
>
> **Read the measurement before the requirements.** The Epic was pitched on five instances found in
> five files of this repository; the corpus run found **three of the five reach only this
> repository** — the `BUGS.md` tally check evaluates 1 of 12 projects, the milestone Epic-status
> check 1 of 12, and excluding Signal itself both reach **0 of 11**. Brett ruled *no trimming*
> (`D-M6E2-1`), so all five ship **with their reach printed**. The obligation that creates is
> disclosure, not scope discipline.
>
> **Two things are deliberately left broken until a check catches them** (`D-M6E2-5`): `B102`'s
> status row reads `confirmed` while it shipped fixed in `v0.1.27`, and the `[Unreleased]` defect is
> filed in two places. Fixing them before the detectors exist would ship the detectors untested
> against the only real instances available.
>
> **What happened to the two deliberate breaks:** `B102`'s row was corrected **by a check finding
> it**, so the detector shipped tested. The `[Unreleased]` heading **ships open by choice** — it
> needs a product call and is filed in [`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md).
>
> **The Epic committed its own defect eight times while building the checks for it** — including a
> silent no-op in `rewriteBugTally` (every fixture used Signal's own shape) and, at SHIP, a check
> that would have fired on **every Epic close forever**. Three of the eight were found by *running*
> a tool, not reading code.

> ## ▶ SUPERSEDED HANDOFF — session paused 2026-08-09, mid-Wave-2. History, not instructions.
>
> ⚠ **Do not act on the STATE.md claims below** — they describe `current_epic: M5.E19` and a
> baseline four releases old. Kept for the reasoning about what each command does and does not fix.
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

> ## ▶ SUPERSEDED HANDOFF — `M5.E10` SHIPPED as `v0.1.25`, 2026-08-13. Milestone 5 closed. History.
>
> ⚠ **The open-work list at the end of this block is out of date** — `B99`'s packaging half shipped
> in `M6.E1`/v0.1.26, and Milestone 6 has since opened and closed two Epics. Current open work is in
> *"Where things stand"* at the top of this file, and the queue is [`BACKLOG.md`](BACKLOG.md).
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
**▶ Nothing is in flight. The last Epic was `M6.E2`, shipped as `v0.1.29` (2026-08-18)** — the facts Signal publishes about itself; ran at the project's **FULL/strict**. Retro: [`M6.E2-RETROSPECTIVE.md`](M6.E2-RETROSPECTIVE.md); reach evidence [`M6.E2-CORPUS-MEASUREMENT.md`](M6.E2-CORPUS-MEASUREMENT.md); decisions `D-M6E2-1…7`. Three fix-lane releases followed: `v0.1.27` (`B102`), `v0.1.28` (`B103`), `v0.1.30` (`B104`).

*Prior: `M5.E10` closed and shipped as `v0.1.25` (2026-08-13), which closed Milestone 5* (`D-BR0809-2`). Review hardening / claim integrity; ran at the project's **FULL/strict** — no Epic-scoped PROFILE. Retro: [`M5.E10-RETROSPECTIVE.md`](M5.E10-RETROSPECTIVE.md); artifacts [`M5.E10-REQUIREMENTS.md`](M5.E10-REQUIREMENTS.md), [`M5.E10-RESEARCH.md`](M5.E10-RESEARCH.md), [`M5.E10-PLAN.md`](M5.E10-PLAN.md), [`M5.E10-VALIDATION.md`](M5.E10-VALIDATION.md), [`M5.E10-VERIFICATION.md`](M5.E10-VERIFICATION.md), [`M5.E10-REVIEW.md`](M5.E10-REVIEW.md); decisions `D-M5E10-1…5`.

**The scope call** (`D-M5E10-1`, Brett): **checkable parts + writing rules.** In — the requirement-coverage diff, VALIDATION self-consistency, the VERIFICATION denominator + *"what this could not establish"* section, the correction-protocol grep, retro-index freshness, and the `STATE.md` narrative check folded in by `D-BR0810-2`; plus the provenance rule and the `B38` reclassification, which cost text rather than machinery. **Out** — the adversarial claims-audit agent, *and its absence has to be visible in what ships* (`AC0.1`): that is the half which catches what determinism cannot, so letting the docs read as though claim integrity were solved would be this Epic's own defect, committed while closing the milestone named after it.

**Filed at its own DISCUSS: `B93`** — `commands/discuss.md` reads the tier *before* the Epic roll, so a `--epic` run gates the whole phase on the **previous** Epic's profile. Measured at this open: pre-roll **FEATURE/light**, post-roll **FULL/strict**. Not hit here, because the tier was deliberately re-read after the roll — so the exposure is the instruction, not the run.

*Prior: `M5.E19` closed and shipped as **v0.1.22** (retrospective at [`M5.E19-RETROSPECTIVE.md`](M5.E19-RETROSPECTIVE.md)); `B82` shipped as **v0.1.21** in the fix lane — no six phases, so no Epic artifacts and no retrospective. `M5.E14`'s shippable slice shipped as **v0.1.24**.*

**What M5.E15's close settled.** The verdict is **directive-scoped** — the control arm deletes the five sites that *order* the call and leaves the schema docs and the implementation alone, because over-deleting produces a *differently-informed* control agent whose 0/3 is as unreadable as a leaky one (`D-M5E15-1`). Its closing condition (`D-M5E15-6`) was met rather than waived: `B41-phase-entry` was re-run under the fixed arm and published — **`OBEYED`**, not the `INERT` the Epic pre-committed to publishing if that is what came back.

**Earlier: M5.E18 closed 2026-08-04**, shipped as v0.1.18 — retrospective at [`M5.E18-RETROSPECTIVE.md`](M5.E18-RETROSPECTIVE.md).

**Read the queue below against `BACKLOG.md`, not instead of it.** This list was wrong on 2026-08-03 — it named M5.E15 next while `BACKLOG.md`'s newer M5.E18 entry (PRs #21/#24, vs this file's #19) carried an unconditional-next marker and a Brett quote from that day. `/sig:resume` repeated the stale ordering. **The queue lives in two places and only `BACKLOG.md` gets edited when work is filed** (D-M5E18-1).

**The queue that used to live here is empty — every item shipped.** Kept as one line each, because the sequence records what was excluded on evidence:

1. ~~**M5.E15**~~ — shipped as **v0.1.19** (2026-08-06). The canary re-run happened and published `OBEYED` (`D-M5E15-6`).
2. ~~**`B52`**~~ — shipped as **v0.1.20** (2026-08-06, fix lane).
3. ~~**The closure-gated archive command** (+`B82`)~~ — shipped as **v0.1.22** (`M5.E19`) and **v0.1.21** (2026-08-07). Its premise was corrected at PLAN: archiving was already wired, the gap was the missing front door (`D-M5E19-6`).
4. ~~**`M5.E14`'s shippable slice only**~~ — shipped as **v0.1.24** (2026-08-09). ⚠ **`dischargeObligation` is called by nothing** — the marker is readable and writable by hand; wiring discharge into the phase gates stays with the tracker Epic. Said out loud so nothing reads the class as closed.
5. ~~**M5.E10**~~ — shipped as **v0.1.25** (2026-08-13); **closed Milestone 5.** The **judge-based, semantic** half is the part that did *not* ship (`AC0.1`, `D-M5E10-1`) and it has a live `BACKLOG.md` row.

**Nothing replaces this list yet. Milestone 6 is not opened — the next move is a decision, and it is Brett's.** Read [`BACKLOG.md`](BACKLOG.md) for the candidates.

**Open bug tail** *(statuses re-read off `BUGS.md` 2026-08-19; `B99` has since shipped **`fixed`** in `M6.E1`/v0.1.26 and is dropped from this line — the packaging half is done, the "should `.planning/` be public at all" question is not a bug and stays open above. `B84`, `B82` and `B77` were dropped at the prior refresh.)*: `B93` (`commands/discuss.md` reads the tier *before* the Epic roll, so a `--epic` run gates the phase on the **previous** Epic's profile), `B79` (`evictEpicNarrative` has never been able to fire for Signal's own STATE.md and reports it as a clean no-op), `B73`–`B76` (the loop-engineering audit's `LE-1…LE-4`), `B60` (P2 — six phase commands have no branch for a malformed PROFILE while four meta commands do), `B61` (P3 — hand-edited numeric-looking `last_updated_commit` is YAML-coerced), `B56` (P3 — `facts.md`'s test count still has no guard pinning it to the real suite; `tools/cut-release.js` sets it from the gating `vitest` run, but only if the script is used, so the bug stays `confirmed` — **this refresh corrected the number by hand for the fourth time, which is the recurrence the row predicts**).

**Carried from M5.E16's retro, unhomed:** `review_depth: quality-only` silently disables `simplification_pass`, and a profile's prose can claim a dial the precedence rules turn off. That is a prose-vs-precedence comparison — M5.E10's semantic territory, not M5.E16's deterministic one. **Still unhomed, and now more so:** `M5.E10` shipped with the semantic half deliberately left out (`AC0.1`), so this item pointed at a destination that no longer exists. It travels with the semantic claims-audit backstop, wherever that lands.

---

*Last updated: 2026-08-19 (**`M6.E2` shipped as v0.1.29; v0.1.30 shipped; nothing in flight**). **Caught by `/sig:resume` for the fifth consecutive time**, and this round the two-places gap is no longer a structural worry — it is measured. The 2026-08-18 stamp, written one day earlier, said the gap survives because *"only one of them was wrong this time."* **Today both were wrong**: *"Where things stand"* sat at v0.1.25 and still read *"Milestone 6 is not opened"* while `M6.E1` and `M6.E2` had both shipped, and *"Current state"* sat at v0.1.28 — against a live v0.1.30. One section was five releases and one milestone stale; the other, two releases. **A patch that updates one section and leaves the other is not the exception here, it is the pattern**, observed on three consecutive refreshes. **Brett called it the same day: collapse them.** Done — the two sections are now one, at the top of this file, carrying the narrative and the numbers together, with the reason stated in a box a future editor cannot miss. The refresh history below is preserved verbatim, because it is the evidence chain for why the split failed and is the only record of five consecutive catches. Refreshed this round: both current-state sections, two release rows (v0.1.29, v0.1.30), the test count (2681 → 2761, verified against a full `vitest` run rather than copied), the milestone line, the `M6.E2` in-flight block (retitled **CLOSED** — it still said *"Next phase: PLAN"* for an Epic that had shipped), the trailing in-flight paragraph, and the open-bug tail (`B99` now `fixed`). **Two superseded handoff blocks were retitled, not deleted** — both said *"READ THIS FIRST"* over claims four releases out of date, which is misdirection rather than history; the bodies are kept intact with a dated warning on top. **`STATE.md`'s body was read, not just its frontmatter** — its *Resume pointer* and *NEXT WORK* sections still narrated the 2026-08-06 queue (the *Resume pointer* asserted a cache status from 2026-08-06 and pre-`v0.1.20` restart advice as current; the *NEXT WORK* block carried a correction saying `M5.E10` was *"open and in flight"*, which had itself expired when that Epic shipped). **Both `narrative-phase-contradicts-frontmatter` and `body-omits-current-epic` returned clean on it**, because they compare tokens — the semantic gap (`AC0.1`) demonstrated on this repository's own state file. **It was left standing for one day as evidence, then repaired on Brett's instruction the same day**; the instance is recorded here rather than in the file that no longer shows it. ⚠ *Its `## In-flight` section was **not** an instance* — it was accurate through `v0.1.29` and merely predated `v0.1.30`, which is a fix-lane release that moves no phase. The long-running *"SIX times now"* tally in that section was **left at six** rather than incremented, because inflating a defect count with a case that is not the defect would be this file's own failure mode. Prior stamp, 2026-08-18 (**`M6.E2` DISCUSS closed; v0.1.26/27/28 shipped; Milestone 6 open**). This round the file was five releases and one milestone stale — it still said *"M6 is not opened"* while `M6.E1` had shipped and `M6.E2` was in flight. Refreshed: the current-state headline, three release rows, the milestone line, and a new in-flight handoff block. **The structural note below is still true and still unaddressed** — this file answers "what's current" in two places, and only one of them was wrong this time, which is exactly how the gap survives. Prior stamp, 2026-08-13 (**`M5.E10` shipped as v0.1.25; Milestone 5 closed**). **Caught by `/sig:resume` again — the fourth consecutive time this file has been refreshed because a briefing read it against the world and lost.** What was stale this round: both "what's current" sections (one at v0.1.24, one at v0.1.22, against a live v0.1.25), the next-work pointer (naming an item that shipped in v0.1.24), a resolved warning about unreleased commits, a five-item queue whose every item had shipped, and an open-bug tail listing three fixed bugs. **The structural note the last stamp made is still true and still unaddressed: this file answers "what's current" in two places.** Collapsing them to one is the fix; it was raised rather than done, because it is a whole-file restructure and Brett's call. Also refreshed in the same pass: `STATE.md`'s In-flight section (stale through the entire Epic — logged as instance (6) there), `CLAUDE.md`'s Current State, `references/facts.md`'s test count (2389 → 2602), and four `BACKLOG.md` sub-bullets reading "UNRELEASED at the time of writing" about a shipped release. **Prior stamp, 2026-08-06** (**M5.E15 shipped as v0.1.19; `B52` shipped as v0.1.20; the archive command is next**) — *and this time the file contradicted itself rather than the world:* its top section already said `v0.1.19` shipped with a suite of 2233 while "Current state" 60 lines below still read `v0.1.18` / 2168 tests. A patch had updated the section a reader hits first and left the section that carries the numbers — so the stamp said "current" and the file held two different answers. **Both were two releases stale by the time anyone read them.** Fixed together with `CLAUDE.md`, which had the same two defects (`Latest: v0.1.18`, and `Active: M5.E15 — EXECUTE not started` describing an Epic that had shipped). Prior update 2026-08-04 (**M5.E18 shipped as v0.1.18**) — patched, not rewritten, and caught by `/sig:resume` reading this file against `M5.E18-RETROSPECTIVE.md`, one day after the stamp below promised the same section would be watched. Prior update 2026-08-03 (**M5.E18 opened; DISCUSS closed**). Prior update 2026-08-02 (v0.1.16 / M5.E16 shipped), when this file had gone **seven Epics stale** — it described M5.E7 as in-flight while M5.E16 was closing — and was rewritten whole rather than patched, because `CLAUDE.md` tells every reader to open it first. **It went stale again within two PRs**, on the "Active work" queue specifically; see D-M5E18-1.*

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
