# Signal — Fresh-Session Context

Load this at the start of every work session. Short on purpose.

---

## Where things stand (2026-09-04) — M6.E6 IS SHIPPED

**The decision queue has a writer.** `M6.E6` closed 2026-09-04: `routeDecision` decides whether a
mid-run gray-area question may be adopted or must be parked, and `/sig:drive` is its first caller.
Retro: [`M6.E6-RETROSPECTIVE.md`](M6.E6-RETROSPECTIVE.md). Suite **3203 → 3206**. `v0.1.37` released
`ba5d1c3`; the REVIEW fixes are PR **#236**, open.

**The oracle was met by the first run that could physically reach the code**, about an hour after
the release that made it reachable. VERIFY had reported it NOT MET, correctly — no cached copy
carried `routeDecision`, because M6.E6 merged to `main` unreleased. Three `/sig:drive` invocations
across two days were needed: two halted at the front door, one ran retired code (`B115`).

⚠ **REVIEW ran AFTER the code merged and shipped**, so it could only fix forward — and it found two
guards that each stood down in the exact case they were written for. Both were live in `v0.1.37` for
about half an hour. Where an Epic's oracle names a *released* artifact, the release is a
prerequisite of VERIFY, not a consequence of it.

⚠ **Three claim-integrity slips in one Epic is a rate, not a slip** — *"19 of 19"* against an 18-row
table, a vacuous test set, and a comment claiming the queue's write half *"has a caller"* before any
run had reached that step. All three caught by a person, never by the suite.

**Open:** `Q-M6E6-1` in [`DECISION-QUEUE.md`](DECISION-QUEUE.md), unanswered by design — whether
meeting the oracle on `v0.1.37` re-opens VERIFY's `NOT MET` verdict. Product-altitude, painful to
undo, so the run that raised it did not decide it.

---

## Where things stood (2026-08-28) — M6.E5 shipped

**`/sig:permissions` is MERGED.** PR **#211** merged 2026-08-28, branch deleted. Suite **3006 →
3107**. Commands **21 → 22**. Retro: [`M6.E5-RETROSPECTIVE.md`](M6.E5-RETROSPECTIVE.md).

⚠ **The merge SQUASHED despite `--merge`, and the predicted damage happened immediately.** All 24
commits are absent from `main`; `ADHERENCE-LOG.md` was left pinning `0e88e03`, a commit nobody can
reach from `main` — verbatim the failure the Epic lane's `--merge` rule exists to prevent. Repaired
by recomputing against `d0ac0c5`. Filed; root cause **not** established, and the next Epic merge is
the experiment: pass `--merge`, then run `git rev-list --parents -n1 HEAD` before anything else.

⚠ **The independent PR reviewer found 43 issues this Epic's own six phases did not** — including
`Bash(node:*)` (unrestricted shell execution) in a permissions proposal, a fabricated decision id, a
duplicate bug filing, and a headline claim that was false and had been propagated into five
documents. All fixed. **This is the single most useful input to the loop analysis below.**

**What it does, in one line:** proposes an allowlist (and a short deny list) for what the flow needs
here, and **you** install it. It never writes a settings file — Signal cannot grant itself
permission, and that is settled, not a limitation to be worked around.

**⚠ A headline finding was published and then RETRACTED — read this before citing the Epic.** It
claimed `git commit` appears zero times as a runnable command string in the payload. **False**, and
caused by two defects in the Epic's own scanner (the code layer discarded captured subcommands; the
prose layer could not see inside fenced blocks). Both fixed on PR #211 review; the scan now returns
**200 entries** and `Bash(git commit:*)` **is** proposed. Measured against the 43 hand-cleaned rules
after the fixes: **36 generated, 15 agree.** The surviving limits are real but smaller — `gh` is
genuinely prescribed nowhere in the payload, and the generator only emits `Bash()` rules.

**Three defects found by running code rather than reading it** — the pattern the plan was built
around: `B112` (`detectProjectKind` calls every non-git directory `greenfield`), `Bash(git:*)` being
proposed and re-granting what the classification withholds, and cross-ecosystem contamination in the
flow half. The last two survived 25 green tests and were visible in the first render.

**Filed and NOT fixed: `B112`.** ⚠ A second was filed as `B111` and **withdrawn as a duplicate of `B100`**, which had recorded it two weeks earlier — caught by the PR reviewer, not the filer. `B100` matters beyond this Epic — `AC_ID_RE` lacks the
`[a-z]?` its two siblings carry, so sub-lettered acceptance criteria collapse on **both** sides of
`requirement-coverage.js`'s diff. The tool built to catch completeness claims reported **5** criteria
where **34** exist.

**✅ DONE — the loop/goal analysis is written** (2026-09-01):
[`../analysis/LOOP-GOAL-DIRECTION.md`](../analysis/LOOP-GOAL-DIRECTION.md). Brett's 2026-08-28 call,
scoped strictly to loop / goal functionality, nothing else in it. It is the **goal** half —
what the loop works on and how it knows the run is done — companion to
[`LOOP-ENGINEERING-ANALYSIS.md`](../analysis/LOOP-ENGINEERING-ANALYSIS.md)'s **attention** half.

**Its headline is that the goal half barely needs building — it needs the parts already built to be
reached.** One of six loop components is built-and-enforced. `attention` is enforced nowhere
(`B75`, open on purpose); the decision queue is called by tests and nothing else; and the loop
ceiling is **mis-wired** — filed as **`B113`**, reproduced against the live module: `drive.md`
documents a two-argument `canProceedUnattended`, so `VERIFY` and `REVIEW` can only ever return
`loop-unknown`. Three unreached mechanisms in one area, from three releases.

⚠ **Two things it recommends NOT building, on evidence:** an automatic trigger, and automatic Epic
selection. The second was **measured, not argued** — the best honest rule over `BACKLOG.md`'s real
rows runs **77% precision / ~37% recall** (10 of 13 flagged rows live; ≥17 live rows invisible).
Two of the three false positives are structural: a closed row's closure lives in a *struck sibling
heading* while the original is preserved unstruck for provenance, so **no row-local rule can tell
them apart**. Measured on this project only; Signal's `.planning/` is the minority shape.

**Build, in order:** fix `B113` → wire or delete the decision queue → memory read-forward at cycle
start (the one purely additive gap) → size the cost ceiling (the missing third brake).

✅ **`B112` is now actually filed** (2026-09-01, P3) — it had been cited as *filed* in six places
across five documents since 2026-08-28 while absent from `BUGS.md`, which is `M6.E2`'s own
published-facts class. Verified in code before filing: `add.js:192` returns `greenfield` on a missing
`.git` **before** the `hasSource` scan runs. Filed, not fixed — the caller that prompted it now
avoids the function.

---

## Where things stood (2026-08-26) — M6.E5 opened

**`/sig:permissions` is in flight as `M6.E5`.** Epic opened 2026-08-26; DISCUSS is written and the
next phase is PLAN. Read `.planning/M6.E5-REQUIREMENTS.md` and `D-M6E5-1`…`D-M6E5-5` in
[`DECISIONS.md`](DECISIONS.md) before planning it.

**It runs at FEATURE, not the project's FULL** (`M6.E5-PROFILE.md`, `D-M6E5-1`) — the second use of
the per-unit dial after `M6.E4`. The cost of that tier and the trigger for escalating back up are
written at the profile.

**Five things were decided at DISCUSS, and one went against the recommendation:**

1. Derive the candidate command set from the payload, then **classify** it — neither half alone.
   Measured: the corpus scan returns **49 binary+subcommand pairs across 130 occurrences**, and that
   set contains **`rm`**, `git reset`, `git rebase` and `pip install`. **A generator that emitted its
   own scan would propose `Bash(rm *)`.**
2. Cover the **host project's stack** as well as Signal's flow — ⚠ **against the DISCUSS
   recommendation** (`D-M6E5-3`), on the ground that a generator leaving a Python developer
   prompting for their own test runner has not solved the problem it was built for. Cost accepted: a
   new deterministic manifest reader, which is **not** a reuse of `/sig:init`'s scanners (they are
   agent prose; no deterministic detector exists to call).
3. Output is a report **plus** `.planning/PERMISSIONS.md`, a tracked artifact. **The recommended
   install target is `.claude/settings.json` — the tracked project scope**, not the gitignored
   `settings.local.json` the platform's *"don't ask again"* path writes to.
4. A **small, conservative deny list** — 43 allow rules and zero deny is a protective half empty by
   construction. Deny is absolute and cannot carry exceptions, and the report says so at the list.
5. FEATURE tier, above.

⚠ **Every count in those documents was re-derived on 2026-08-26.** The spike publishes 94 rules and
`D-BR0826-1` publishes 91; **both describe a state that no longer exists.** The live figure is
**43 allow, 0 deny, 0 ask, no `defaultMode`**.

**Filed during the phase:** `B111` — later withdrawn as a duplicate of `B100`. `AC_ID_RE` drops the sub-letter, so `AC1.1a`…`AC1.1d` collapse
to `AC1` and `requirement-coverage.js` reads the collapsed ids on both sides of its diff. Found by
running the coverage checker over this Epic's own REQUIREMENTS. Not fixed; reach unmeasured.

---

### The scope call this Epic implements (2026-08-26)

**Build `/sig:permissions` — the permission-rule generator.** Decided by Brett 2026-08-26
(`D-BR0826-1`). Sized **small**, not the `large` it was filed as. This is the next unit of work and
it does **not** need another scope call.

**Read in this order before starting:** [`analysis/PERMISSIONS-SPIKE.md`](../analysis/PERMISSIONS-SPIKE.md)
→ `D-BR0826-1` in [`DECISIONS.md`](DECISIONS.md) → the `/sig:permissions` row in
[`BACKLOG.md`](BACKLOG.md). The row is a summary; the first two are the evidence.

**What it is, in one line:** it **emits** a proposed permission allowlist for what the flow needs at
this project's tier, and the **user** installs it. Dry-run by default. It never writes a settings
file itself.

⚠ **Signal cannot build a permission model and must not try.** Rules are enforced by Claude Code and
**not by the model**; plugins are locked out three ways (no `permissions` key in the plugin manifest,
`permissionMode` unsupported for plugin-shipped agents *"for security reasons"*, plugins are not a
settings source). Verified 2026-08-25 against the live docs plus every plugin on this machine.
Anything Signal writes *about* permission in a command file or `PROFILE.md` is prose — which is
`B75`, still open, still the repository's named defect.

⚠ **Do not invent a consent dial.** The three options anyone would design are the three modes that
already ship: `default` (ask every time), an `allow` rule (ask once, remember), `dontAsk` (only what
was declared). A fourth unenforced dial beside `tier` / `gate_strictness` / `attention` is `B75` again.

**The evidence came from running the alternative.** The spike recommended hand-cleaning the 91
accumulated rules first and then deciding; that cleanup was performed on 2026-08-26 (**91 → 43**:
user 37 → 23, project 54 → 20) and produced three findings that argue *against* the recommendation
that proposed it: the project-scope file is **gitignored and untracked** so every repo re-accumulates
from empty; the cleaned list is **20 rules and nearly all derivable** from the flow, i.e. the
generator's output was written by hand; and **the classifier refused a programmatic write** to the
settings files, confirming by experiment that the tool must suggest rather than write.

**Also in scope: a proposed `deny` list.** There are **43 allow rules and zero deny rules** and no
`defaultMode`. *"Yes, and don't ask again"* only ever teaches the system to say yes, so the
protective half is empty **by construction** and cannot fill itself. Ships as a suggestion — a
badly-chosen block rule stops work the operator wants.

⚠ **It does NOT unblock** the readiness-scorecard executability dimension or the
environment-readiness baseline, whatever the old row implied. Both need a person to grant permission
in a user-owned file. Claiming otherwise is `M6.E2`'s class.

**Released since the last section:** `v0.1.33` (2026-08-24, *"what nobody was reading"*), tag pushed,
3004 tests on `main`. `B109` and `B110` filed and fixed. `analysis/PERMISSIONS-SPIKE.md` and the
*"row that doesn't know what the platform already does"* backlog row both landed.

---

## Where things stand (2026-08-24)

**`M6.E4` IS MERGED AND RELEASED** — PR **#200**, `--merge` per the Epic lane, branch deleted. Suite 2929 →
**2979**. Cut as **v0.1.33** (2026-08-24, *"what nobody was reading"*) — the release also carries `B75`'s
observer, `.planning/ENVIRONMENT.md`, DISCUSS's outcome oracle and `/sig:ship` reading PR review findings,
none of which were M6.E4. It is the first Epic to run at a **per-unit tier**: FEATURE via `M6.E4-PROFILE.md`, not the project's FULL
(`D-BR0823-2`). `B90`'s advisory fired at `/sig:resume` and this is the first time it changed a
decision rather than being read past — measured 2026-08-08, 7 of 12 projects ran FULL and exactly
**1** had ever written a per-unit profile.

**The Epic is "what PLAN reads and writes"** — three backlog rows batched by **subject, not size**,
each a slice: spec-internal consistency (S1), standing inbox entries (S2), task-handoff
completeness (S3). Batching the twelve promoted rows by size was proposed and **rejected**
(`D-BR0823-1`): size measures diff cost, and the six phases exist to pay decision cost. Two rows
both marked `small` belong in opposite lanes.

**DISCUSS found two things that changed the work:**

1. **S2's premise was half wrong.** The row quotes a second standing entry as saying *"do not close
   this entry."* **That phrase is absent from the repo and from all git history.** Measured: 6
   inbox entries, **1 live candidate — which is itself the permanent trigger-watchlist entry**, so
   the live count can never reach zero. One standing entry, not two, and the real problem is
   sharper than the row states (`D-M6E4-1`).
2. **S1 and S3's done-whens named a dimension that does not run at their own tier.** At FEATURE,
   `plan_validation_dims: core` runs three dimensions and **scope discipline is not one of them**.
   Both fold into `testability` / `completeness` instead; the count stays 8 (`D-M6E4-3`).

Decisions: `D-M6E4-1 … D-M6E4-7`. Requirements: [`M6.E4-REQUIREMENTS.md`](M6.E4-REQUIREMENTS.md).

⚠ **`/sig:resume` now reports `M6.E3` as an Epic with no retrospective, every run.** True positive
and permanent: the check skips whatever is `current_epic` (`state-drift.js:525`), so rolling to
`M6.E4` un-blinded it. Nothing expresses *parked* as distinct from *abandoned*. **Do not write
`M6.E3-RETROSPECTIVE.md` to silence it** — that is the stub-as-closure `B64` was filed about.

---

## Where things stand (2026-08-20)

**Read this first: the direction changed on 2026-08-20, and it changed because the numbers said so.**

Brett's call, in his words: months of releases with *"no additional functionality via inspiration
repos, no loop functionality built."* **Checked against the record rather than argued with, and he
was right on every count.** 23 releases since 2026-07-15 were almost entirely *Signal auditing
Signal* — doc-runtime, drift checks, claim integrity, guards, packaging, and eight bug fixes mostly
in the above. Command count moved 18 → 20 in five weeks and **both new commands managed Signal's own
files**. Inspiration-repo ports shipped: **zero** (grep returns nothing). Loop functionality shipped:
**zero** — an analysis document and nothing else.

Every release had an articulate justification. That is precisely why it ran so long: each step was
defensible and the direction was wrong.

### What shipped 2026-08-20 — the loop, built instead of discussed

**`attention` is now a real dial, split from rigor.** `attended` / `checkpointed` / `unattended`.
`gate_strictness` keeps the one job it ever had **in code** — whether anti-rationalization runs —
because `light` and `strict` were measured to expand to identical gate config except that single
boolean. **FULL rigor, unattended, is now expressible**; it was not before, and that was the whole
complaint the loop analysis made.

⚠ **Back-compat is derived, not defaulted.** A profile with no `attention` derives it from
`gate_strictness` (`off`→unattended, `light`→checkpointed, `strict`→attended), so every PROFILE.md
written before the field produces byte-identical gate config. The suite passing unchanged is the
proof. Adding the field also required teaching the validator to honour `optional` — without it,
adding *any* new override field makes every PROFILE.md on disk throw (`B59`'s failure by addition).

**`/sig:drive` — the 21st command.** Runs the flow and stops when it must. It **never merges**, and
it never overrides a `FLOORS` entry (SHIP's PR, the retro gate, the drain's diff preview and
destructive confirms, the orphan prompt) — each was made tier-independent by a specific decision, and
overriding one silently would re-litigate that decision by omission. It **fails closed**: unreadable
profile, unknown phase, missing attention all stop the loop. Deliberately the opposite of `B39`'s
fail-open posture for *reporting* — a detector that cannot look should say so and continue; **an
actor that cannot tell should stop.**

⚠ **The setting is honest but only `/sig:drive` acts on it.** No phase command reads
`confirm_in_phase` yet. That is the obvious next slice and it is **not** claimed as done.

**CI review is live.** `claude-code-review.yml` + `claude.yml` (`@claude` mentions), authenticating
with `CLAUDE_CODE_OAUTH_TOKEN`. Auto-merge and delete-branch-on-merge are enabled, so a PR lands
itself the moment `test` goes green. **Review comments; it never blocks** — `test` stays the only
required check, because a failing test names itself while a reviewer blocking on judgment trains an
override reflex (`D-M6E3-1`'s receipt rule applied to CI).

⚠ **A review workflow I wrote earlier the same day was wrong and was replaced.** It pointed CI at
`/sig:review`, which is a **phase** command — tier-gated, halts without PROFILE.md, reviews an Epic's
phase work rather than a PR diff. A Signal-native CI reviewer is still worth building (it would be
the first thing ever to dispatch `agents/specialists/*`, all three of which carry a *"NOT DISPATCHED
BY ANY COMMAND"* banner) but it needs a command **designed for a diff**. Not faked in the meantime.

**RELEASED as `v0.1.32` (2026-08-21) — the entry price, paid.** `B76` (the unbounded REVIEW loop
`/sig:drive` inherited on day one), `B73`, `B74`, `B107`, `B108`, plus the Phase C build-vs-adopt
check. ⚠ **`B75` ships open on purpose** — the `attention` dial is documented end to end and enforced
nowhere; nothing fails if a command ignores `confirm_in_phase`. ⚠ **Phase C's check answers *no*:**
there is no capability detection, so Signal cannot gate on presence, and the lanes Epic's hard half
**does not shrink**.

**Prior — released as `v0.1.31` (2026-08-21).** Brett made the call on 2026-08-20 and the cut ran the same
session. `plugin.json`, `package.json`, `CHANGELOG.md`, the map stamp and `references/facts.md` all
read `0.1.31`, so `/sig:update` now shows the delta. Users track `main`, so the *code* had been live
since 2026-08-20 — what the cut changed is that it is now **versioned and documented**, which is the
half that was actually missing.

⚠ **Writing the notes surfaced two defects, both catalogued and fixed in the same release.** `B105`:
a guard asserted `CHANGELOG.md` carries **no** `[Unreleased]` heading at all, so writing the release
notes turned the suite red — the guard blocked the workflow it exists to protect, and its own comment
history had already recorded that identical transient-property error one revision earlier, inverted.
`B106`: `cut-release.js` rewrote the published test count and left the sentence attributing it to the
**previous** release — **the detector worked and the tool did not**, since `M6.E2`'s
`facts-attribution` check fired on the cut while the tool that creates that condition at every
release had never been taught to fix it.

⚠ **Restart is still required to run the new code**, and the order matters: **`/sig:update` first,
then restart the CLI process.** A restart before the update has nothing new to bind to (`B52`).

### `M6.E3` is PLANNED AND PARKED — do not read it as awaiting execution

DISCUSS and PLAN closed (`D-M6E3-1…6`; `M6.E3-REQUIREMENTS.md` 30 criteria; `M6.E3-PLAN.md` three
slices; 8-dimension validation PASS). **Nothing is built, and the plan was never approved** — the
exit criterion asks for explicit approval and it was not given. It is parked on purpose, costs
nothing to leave, and **if it is never built that is a fine outcome.** It is the claims-audit
backstop: more Signal-inspecting-Signal, which is the class the 2026-08-20 call was about.

*Prior state — the release history and the pre-2026-08-20 narrative — follows below.*

## Where things stood (2026-08-19) — relocated

Moved verbatim to [`archive/M6/E3/CONTEXT-2026-08-19.md`](archive/M6/E3/CONTEXT-2026-08-19.md)
on 2026-09-04 to make room for `M6.E6` under this file's byte ceiling. Its release narrative is
also in [`CHANGELOG.md`](../CHANGELOG.md).

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
**▶ Nothing is in flight. `M6.E4` MERGED 2026-08-24 (PR #200) — see *Where things stand* at the top of this file. The previous Epic was `M6.E2`, shipped as `v0.1.29` (2026-08-18)** — the facts Signal publishes about itself; ran at the project's **FULL/strict**. Retro: [`M6.E2-RETROSPECTIVE.md`](M6.E2-RETROSPECTIVE.md); reach evidence [`M6.E2-CORPUS-MEASUREMENT.md`](M6.E2-CORPUS-MEASUREMENT.md); decisions `D-M6E2-1…7`. Three fix-lane releases followed: `v0.1.27` (`B102`), `v0.1.28` (`B103`), `v0.1.30` (`B104`).

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
