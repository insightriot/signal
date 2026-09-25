# M6.E8 — STATE.md narrative, relocated verbatim (2026-09-25)

Moved out of `.planning/STATE.md` at the `v0.1.41` release. Relocate-never-delete: nothing below is edited.

## The M6.E8 resume pointer (as of 2026-09-24)

### ▶ WHERE THE WORK IS — read this first (2026-09-24)

**`M6.E8` IS AT SHIP — PR [#254](https://github.com/insightriot/signal/pull/254) is open on
`feat/m6.e8-advisor-ranking-inputs`, awaiting CI and Brett's merge (`--merge`, never squash).**
Suite **3441**, lint clean. Retro: [`M6.E8-RETROSPECTIVE.md`](M6.E8-RETROSPECTIVE.md). REVIEW:
[`M6.E8-REVIEW.md`](M6.E8-REVIEW.md) — PASS-WITH-FIXES at the loop ceiling, 1 Critical (test design)
+ 16 Important across three passes, every one reproduced; **the previous pass's fix carried the next
pass's defect three rounds running.**

At SHIP (2026-09-24) the Epic's backlog row was struck, and exactly the one predicted constant broke:
`TRIGGER_MET_MEASURED` 3 → 2, bumped in `207de48` in the same commit as the strike. **`B121`,
`B122` and `B123` are filed, not fixed.** After merge: push the branch back if GitHub deletes it
(commit messages are the record), then cut the release — `CHANGELOG.md` carries this under
`[Unreleased]` and `plugin.json` is still `0.1.40`.

**Latest advisory:** [`BACKLOG-REVIEW-2026-09-14.md`](BACKLOG-REVIEW-2026-09-14.md), written during
`M6.E8` VERIFY as the Outcome evidence — 53 citations, all resolved, **true at `60b9f1f` and nowhere
else, because the file carries no commit anchor (`B119`)**. It supersedes the 2026-09-13 artifact as
the current reading, **but that one is not its baseline**: it was generated on `main` and lacks this
branch's rows, which is the instrument failure recorded in the Verdict above (`B118`).


## The `In-flight` section, stale since 2026-08-20

> Kept for the record: this section said *"Nothing is in flight"* and *"`phase: PLAN` above is accurate"*
> through five Epics while the frontmatter moved on. `narrative-phase-contradicts-frontmatter` returned
> clean on it because it reads only lines naming the current Epic. Jev flagged all four stale claims
> (`analysis/TYPESAFE-JEV-ASSESSMENT.md` §6, set 3).


**Nothing is in flight. `M6.E3` is PLANNED AND PARKED (2026-08-20).**

`phase: PLAN` above is accurate — DISCUSS and PLAN both ran and their artifacts are on disk. It does
**not** mean work is queued. The plan was never approved (its exit criterion asks for explicit
approval; it was not given), nothing is built, and parking it costs nothing.

**The direction changed on 2026-08-20.** Brett's call: months of releases had shipped no
inspiration-repo functionality and no loop functionality — checked against the record and correct on
both counts. `M6.E3` is the claims-audit backstop, i.e. more Signal-inspecting-Signal, which is the
class that call was about. **Do not resume it by default.** Read `CONTEXT.md` §*Where things stand
(2026-08-20)* before deciding anything.

**What shipped instead:** the `attention` axis (rigor and attention are separate dials at last) and
**`/sig:drive`**, the 21st command. ⚠ The obvious next slice is making the phase commands actually
read `confirm_in_phase` — today the setting is honest but only `/sig:drive` acts on it.

⚠ **`plugin.json` reads `0.1.30` and the above is unreleased.** Users track `main` so the code is
live, but `/sig:update` shows no delta until someone bumps it. That cut has not been made.



**`M6.E2` — the facts Signal publishes about itself. SHIPPED as `v0.1.29`, 2026-08-18.** Six phases
closed in one day; PR #156, suite **2747**. Retro:
[`M6.E2-RETROSPECTIVE.md`](M6.E2-RETROSPECTIVE.md).

**Five checks for one class**, reached from `/sig:sweep` and `/sig:resume`, plus the `/sig:add --bug`
write-path fix. ⚠ **Three of the five evaluate one project: this one** — measured before scope was
locked, and printed in the report next to the clean count rather than buried
([`M6.E2-CORPUS-MEASUREMENT.md`](M6.E2-CORPUS-MEASUREMENT.md)).

**Eight times the Epic committed its own defect while building the checks for it** — en-dash-ranged
criteria invisible to the coverage tool, a non-existent commit sha, a test count two too high, a
report heading that stopped being true, a silent no-op in `rewriteBugTally`, and at SHIP itself a
check that would have fired on every Epic close forever. Three of the eight were found by **running**
a tool, not by reading code.

**Left open on purpose:** the dated `[Unreleased]` heading needs a product call
([`OPEN-QUESTIONS.md`](OPEN-QUESTIONS.md)), and the **semantic half** of claim integrity stays
unbuilt (`D-M6E2-7`) — everything shipped here compares tokens.

**Nothing is in flight.**

**Milestone 6 is open.** `M6.E1` (the plugin payload) shipped as `v0.1.26` on 2026-08-17; three
fix-lane releases followed — `B102`/`v0.1.27`, `B103`/`v0.1.28`, and `B104`/`v0.1.30`, the last of
which shipped **after** this section was written and had to be added by hand on 2026-08-19. The queue
remains
[`BACKLOG.md`](BACKLOG.md) (`D-M5E18-1`); this is the pointer, not a second copy of it.

*Prior: `M5.E10` (review hardening / claim integrity) shipped as `v0.1.25` on 2026-08-13, closing
**Milestone 5** (`D-BR0809-2`). PR #141 merged with `--merge` (commit `6f7cfd5`); suite **2602**.
Retro: [`M5.E10-RETROSPECTIVE.md`](M5.E10-RETROSPECTIVE.md); narrative evicted to
[`archive/M5/E10/STATE-NARRATIVE.md`](archive/M5/E10/STATE-NARRATIVE.md).*

*Prior: `M5.E19` closed and shipped as `v0.1.22` (2026-08-07) — `/sig:archive`, the command
archiving never had. Retro: [`M5.E19-RETROSPECTIVE.md`](M5.E19-RETROSPECTIVE.md). Decisions
`D-M5E19-1`…`9`. Filed `B87`. 2284 → 2300 tests, 20 commands.*

**SIX times now — and instance six ran the full length of the Epic chartered to fix it.** For the
whole of `M5.E10`'s EXECUTE → VERIFY → REVIEW → SHIP, the release, and the merge, this section read
*"`M5.E10` … DISCUSS + PLAN closed; next is EXECUTE wave 1 (`S1`)"* — falsified by four
`transitionPhase` calls and then by the ship itself, while the frontmatter twenty lines above
recorded all six phases done. Instance (5) was caught in the session that caused it; **(6) survived
that session, the release, and a doc-refresh commit aimed at this exact problem**, and was found by
a `/sig:resume` on 2026-08-13.

**The doc-refresh commit is the sharper half.** `24bd626`'s message reads *"The handoff and STATE
narrative still read 'next action: /sig:ship' after the release merged"* and states it is refreshing
them. `git show --name-only` returns **`.planning/CONTEXT.md` alone** — STATE.md was never touched.
A completeness claim written from the shape of the work rather than the artifact, in the commit that
closed the milestone named after that defect, about the file the defect is catalogued in.

*(Instance five, kept because it is the one that argued the class is structural:)* For roughly
twenty minutes after `setCurrentEpic` wrote `current_epic:
M5.E10` into the frontmatter directly above, this section read *"Nothing in flight"* — the same
words as instance (3), falsified the same way, in the section that already catalogued (1) through
(4) and argued they were structural. **The catalogue did not protect the file it lives in.** That is
the finding: awareness of the defect, written at length, at the top of the very section, did not
prevent the next occurrence twenty lines below. Whatever the fix is, it is not documentation.

The sequence: (1) *"Nothing, M5.E16 closed"* while two Epics shipped and a third
opened — **two Epics behind** the frontmatter; (2) *"`M5.E15` … EXECUTE next"* for a day after that
Epic shipped; (3) *"Nothing in flight"* — written as the correction to (2) and falsified minutes
later by `setCurrentEpic`; (4) *"At `PLAN`, and PAUSED … no `M5.E19-PLAN.md` yet, deliberately"* —
falsified by **four** `transitionPhase` calls across EXECUTE → VERIFY → REVIEW → SHIP, while a
`M5.E19-PLAN.md` sat on disk, **inside the Epic that filed `B87` about ledger honesty.**

(5) *"Nothing in flight"* — while `current_epic: M5.E10` sat in the frontmatter twenty lines above,
written by `setCurrentEpic` in the act of opening the Epic that owns this defect. Caught in the same
session that caused it, by the author re-reading rather than by any check.

(3) could still be read as inattention. (4) cannot: the prose was accurate when written and was
falsified by a **full phase sequence** of machine writes that structurally cannot touch it. (5)
closes the argument from the other end — the author *knew about the defect, was working on it, and
had just written a paragraph about it*, and the paragraph still went stale.
`transitionPhase` moves frontmatter only; the frontmatter is the declared machine-truth
(`INDEX.md:119`); this narrative is hand-maintained and **nothing reconciles it.** Filed in
`ISSUES-INBOX.md`; it is a sibling of `B87` — both are *the record disagreeing with the work*.

**Prior:** `M5.E15` — the control arm, made real (`B55`) — **closed and shipped as `v0.1.19`,
2026-08-06**; `B52` shipped as `v0.1.20` the same day in the fix lane. Its six-phase log is archived
at [`archive/M5/E15/STATE-NARRATIVE.md`](archive/M5/E15/STATE-NARRATIVE.md).

**This section has now gone stale three times, the same way — and the third time was inside the
commit that fixed the second.** The sequence, because the last instance is the informative one:
(1) *"Nothing, M5.E16 closed 2026-08-02"* while M5.E17 and M5.E18 shipped and M5.E15 opened —
**two Epics behind the frontmatter**; (2) *"`M5.E15` … EXECUTE next"* for a day after that Epic
shipped; (3) *"Nothing in flight"* — written as the correction to (2), then contradicted minutes
later by `setCurrentEpic` writing `current_epic: M5.E19` into the frontmatter above it, and
committed that way. **A hand-edit is stale the moment the next state write lands**, which is why
care is not the remedy. The frontmatter is the declared machine-truth (`INDEX.md:119`); this prose
is hand-maintained and nothing reconciles it.

**Carried from M5.E16's retro, unhomed:** `review_depth: quality-only` silently disables
`simplification_pass`, and `M5.E16-PROFILE.md`'s prose claimed the dial anyway — so the profile
asserted rigor it did not receive for the whole Epic. That is `B59`'s shape one level up (`B59` was a
profile the code could not *parse*; this is one it parses and then overrides). Detecting it is a
prose-vs-precedence comparison — **M5.E10's semantic territory**, not M5.E16's deterministic one.
**Still unhomed, and now more so:** `M5.E10` shipped (v0.1.25) with the semantic half deliberately
left out (`AC0.1`), so this item pointed at a destination that no longer exists. It travels with the
semantic claims-audit backstop, wherever that lands.
