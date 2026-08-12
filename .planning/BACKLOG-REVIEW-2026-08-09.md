# Backlog review — 2026-08-09

**A point-in-time pass over the whole queue: what's missing, what's under-scoped, and how the live work clusters into sprints.**

**Status:** Review artifact. Frozen snapshot, in the shape of the [2026-07-04 pass](archive/BACKLOG-REVIEW-2026-07-04.md) whose living successor is `BACKLOG.md`. **This document changes nothing on its own** — it recommends; `BACKLOG.md` remains the queue (`D-M5E18-1`).

**Corpus read:** `.planning/BACKLOG.md` (1138 lines), `.planning/ISSUES-INBOX.md` (1921 lines, 52 entries), `.planning/BUGS.md` (26 `confirmed` of 90 rows), `.planning/MILESTONE-5.md`, `analysis/SIGNAL-V2-ROADMAP.md`, `analysis/{LOOP-ENGINEERING,UNREACHED-MECHANISM,CLAIM-INTEGRITY,SOFTWARE-FACTORY-COMPARISON,AUTONOMY-COUNTERWEIGHT}*.md`, plus repo-state checks (`git log`, `gh issue list`, `ls .planning/`, `gh repo view`).

**Citation rule:** every claim carries a path and line, or the command that produced it. Inferences are marked `unverified`.

---

## 1. Bottom line

**The backlog is not short of items. It is short of one decision.** Signal's ratified v2 sequence is five Epics — `M5.E8` through `M5.E12` (`analysis/SIGNAL-V2-ROADMAP.md:112–118`). Two shipped. **Three — `E10`, `E11`, `E12` — have never started: `ls .planning/ | grep -E "M5\.E(10|11|12)"` returns nothing, checked 2026-08-09.** In their place, six unplanned Epics shipped (`E13`, `E15`–`E19`), and two of them record the override in their own status rows: *"ran ahead of E10–E12"* (`MILESTONE-5.md:38`) and *"ran ahead of E10–E12, E14–E16"* (`MILESTONE-5.md:40`).

**That is six legal, individually-justified deferrals of the same three items.** Nothing was violated — `MILESTONE-5.md:175` explicitly sanctions it (*"Don't assume Epics ship in order. Order should follow real user pain points"*), and each override cites a decision ID. But an item deferred six times with a good reason each time is functionally indistinguishable from an item that is not going to happen, and this repo has a standing rule that a **checked-and-declined item must be distinguishable from an unchecked one** (`B39`). **The highest-value work on this list is not a build. It is re-dispositioning `E10`–`E12`** — confirm, resequence, or formally cut them — because four of the five clusters below get cheaper once the roadmap says what is actually next.

The sharpest single observation in this review: **`M5.E11` is "Roadmap Advisor — sequencing and prioritization advisory"** (`SIGNAL-V2-ROADMAP.md:117`, `ISSUES-INBOX.md:1640`), described in the audit that ratified it as *"the best-evidenced new capability."* It is the capability that would produce this document. It has been deferred six times, and it is being hand-substituted right now, by this run.

**Top three moves:** (1) re-disposition `E10`–`E12` and restate what closing Milestone 5 means; (2) give the capture inbox a drain that isn't inside `/sig:plan` — 52 entries, 5 disposition stamps; (3) open the autonomy-floor cluster with `B76`, the unbounded REVIEW loop every autonomy design inherits.

**Two things this pass settled that were open questions when it started.** *(And one it got wrong and corrected — see the note in §2b. The tally error is two cells, not three; the review made the same unverified-extrapolation move it exists to catch.)* The unreached-vs-absent-vs-wrong measurement (`BACKLOG.md:280`) **was run and came back negative** — §2b; do not re-aim the roadmap at wiring. And the `A3` staleness audit **was run** — five `confirmed` rows have lapsed, and `BUGS.md`'s own published tally is wrong on three of five figures.

---

## 1b. Four findings that emerged during this pass

These were not in the queue. Three came from reading documents against each other, which is this project's most productive defect-finding method and also its least automated one.

### `F1` · `M5.E16` names two different Epics — a confirmed ID-is-identity violation

`BACKLOG.md:550` carries `### M5.E16 — The other two shapes of "shipped but never run"`, **promoted on evidence 2026-07-30, no closure marker, still open.** The Epic that actually shipped as `M5.E16` (v0.1.16) is a different piece of work: `M5.E16-REQUIREMENTS.md:1` reads *"M5.E16 — STATE-vs-world drift detection,"* **opened 2026-08-01** — one day after the backlog entry was promoted. The requirements file mentions *"document-shaped"* / *"data-shaped"* once; the retrospective, zero times.

`PROJECT.md` § Vocabulary locks **ID-is-identity**. This breaks it in the most costly direction: a live roadmap item is now unreachable by its own ID, and anyone checking *"did M5.E16 ship?"* gets **yes** for work that isn't the item. **Recommend: file as a bug, give the unbuilt work a fresh ID, and strike the old entry with a pointer.** Do not silently renumber — the whole point of the rule is that the old ID stays wrong out loud.

### `F2` · The user evidence that justifies six deferrals has no artifact behind it

This is the load-bearing one, and the repo already found it. `DECISIONS.md` (`D-M5E7-3`, 2026-07-25) records, as an explicit assumption rather than an aside:

> *"there is **no written tester feedback to mine.** `M4.5.E5-LAUNCH-KIT.md` §3 is entirely unchecked — including 'Capture returned friction logs → fold into the v0.1.(N+1) backlog' — so CONTEXT.md's '4 non-Signal users, positive reception' is recollection, not artifact. `MILESTONE-5.md`'s instruction that sequencing 'should follow real user pain points from v1 usage' therefore **cannot be followed literally**; it resolves to Signal's own dogfooding pain plus Brett's judgment."*

**Follow the chain.** `MILESTONE-5.md:175` — *"Order should follow real user pain points from v1 usage"* — is the standing justification for running Epics out of sequence, and it is what makes each `E10`–`E12` deferral legal. `D-M5E7-3` says that instruction cannot be followed literally, because the user-pain input does not exist in written form. **So the six deferrals rest on a criterion the project has already recorded as unusable.** That does not make them wrong — Brett's judgment is a legitimate input and is named as the substitute — but it does mean the deferrals are *judgment calls presented as evidence-driven*, which is precisely the pattern `CLAIM-INTEGRITY-ANALYSIS.md` exists to name.

**And it directly gates v2.** `PROJECT.md:62–69` gates v2 on *"v1 has real users… at least a few weeks of real usage, long enough for feedback to shape v2 priorities."* Gate 1 is met. Gate 2 was declared lifted 2026-07-15 on the four-user figure. Per `D-M5E7-3` that figure is recollection. **The gate is open on an unverified claim** — which is worth saying plainly given that this repo files `B50` against exactly this shape when it appears anywhere else.

### `F3` · Every recent "found from outside" defect came from one person on a second project

`UNREACHED-MECHANISM-ANALYSIS.md:77` — *"Three of today's four came from outside. That is the loudest signal in the file."* Checked against the source rows: **all of them read `Reported from eval-project-A`** (`B87`, `B88`, `B90`, plus the earlier `B82`). `eval-project-A` is Brett's own project.

The claim is true but reads stronger than it is. *"Outside"* means **a structurally different corpus, not a different reporter** — which is exactly why it works (`B82` proved a bug that could not reproduce in Signal's tree by construction). But it means **zero defects have arrived from the four claimed users**, which is the same absence `F2` describes from the other side, and it makes Wave 5 more urgent rather than less: the second project is doing the work four users were supposed to do.

### `F4` · Milestone 5 has no valid definition of done

`MILESTONE-5.md:167–169` § Exit Criteria: *"When the 10-phase architecture from `SIGNAL-INTEGRATION-RUNDOWN.md` is functional end-to-end on real projects."* That architecture was substantially abandoned by M5's own `E7` re-audit — *"Not one straight port survived"* (`MILESTONE-5.md:36`) — and nothing restated a corrected criterion afterward. Every Epic M5 has actually shipped (doc-runtime, archiving, self-diagnostics) is outside the stated exit condition. **M5 cannot close against the sentence that defines closing it.** Fold this into `A1`: the disposition pass should end with an M5 exit criterion that matches what M5 is.

---

## 2. Added items — gaps, each grounded

| Item | Why it's missing (grounded) | Value it unlocks |
|---|---|---|
| **`A1` · A disposition pass on `M5.E10`–`E12`** | Zero artifacts on disk (checked 2026-08-09). Their triggers are **met**: `E10` waits on *"E8 lands"* and `E11` on *"E9 lands"* (`SIGNAL-V2-ROADMAP.md:116–117`); both shipped (`MILESTONE-5.md:37,39`). Six recorded overrides since. | Ends the ambiguity between *deferred* and *dead*. Every sizing estimate below currently assumes three Epics that may never run. |
| **`A2` · A home for the inbox drain outside `/sig:plan`** | 52 entries (`grep -c '^## '`), **5** disposition stamps in the whole file. The drain is the inbox's only output pipe — an entry at `ISSUES-INBOX.md:983` is *itself* about the input/output asymmetry, logged 2026-05-24 and still true. `B89` established that `plan.md` both permits and forbids skipping it. | The **trigger watchlist** (`ISSUES-INBOX.md:1510`) is checked *"at every drain."* Trigger evaluation is therefore gated on a step that rarely runs — so parked-with-trigger items are parked in practice regardless of their conditions. |
| **`A3` · A staleness audit of the 26 `confirmed` bug rows** — **✅ RUN during this pass; see §2b** | `B77` proves the tally is **structurally blind** to the capture format Signal itself writes. Several `confirmed` rows predate releases that plausibly fixed them; none had been re-verified. | **Done.** Five stale rows found, and the pre-committed unreached-vs-absent-vs-wrong measurement was run and **came back negative.** |
| **`A4` · The user-facing half of tracker intake** | The GitHub Issues trigger reads **`✅ FIRED 2026-07-15`** (`ISSUES-INBOX.md:1521`) — 25 days ago. `gh issue list --state all` returns `[]` on a repo with `hasIssuesEnabled: true` and `visibility: PUBLIC`. `docs/tester-brief.md` routes feedback via *"Reply however we already talk."* | `UNREACHED-MECHANISM-ANALYSIS.md:77`: *"Three of today's four came from outside. That is the loudest signal in the file."* Intake currently depends on one person relaying. Note this is **carved, not absent** — `D-M5E14` split *"tracker adoption here"* from *"a tracker adapter for users"* (commit `24ef6be`); this is the second half. |

---

## 2b. The pre-committed measurement, run — and it comes back negative

`UNREACHED-MECHANISM-ANALYSIS.md:63–67` proposed a falsification test and stated plainly that it had not been run: *"take the 30 `confirmed` rows in `BUGS.md` and count how many are 'exists but unreached' versus 'absent' versus 'wrong'. **If the first bucket dominates**, this document is describing the repo's dominant failure mode and the roadmap should be re-aimed at wiring rather than building."*

**It was run in this pass, per-row, with each bucket checked against the code rather than the row's own wording.**

| Bucket | Count | % |
|---|---|---|
| `UNREACHED` — exists, correct, nothing routes to it | **2** | 7.7% |
| `ABSENT` — the thing does not exist | **13** | 50.0% |
| `WRONG` — exists, runs, emits a false result | **11** | 42.3% |

Under a **maximally generous** reading — every row naming *any* unrouted mechanism, primary or secondary — `UNREACHED` reaches **13 of 26 (50%)**: a tie, not dominance, and it gets there by absorbing rows whose own stated fix is a build. **Under both readings the condition fails. Do not re-aim the roadmap at wiring** — that is `BACKLOG.md:280`'s open question, now answered.

**But the test is biased against its own hypothesis, and that matters more than the number.** All four exemplars in the analysis — `B87`, `B88`, `B89`, `B90` — are already `fixed`, every one within 0–2 days of filing, all shipped in v0.1.24. **Unreached mechanisms are cheap to wire, so they leave the `confirmed` pool almost immediately.** The confirmed pool is *residue*, and residue is systematically enriched in the expensive buckets. So the honest conclusion is narrower than the test allows: **the confirmed backlog is not wiring-shaped**, which is not the same claim as *the class is not the repo's dominant failure mode*. **Testing the real claim requires counting the 62 `fixed` rows too** — and that is now the version of `BACKLOG.md:280` worth running.

**What actually recurs in the confirmed pool** (offered as an observation, not a counted result): **a check that cannot see what it claims to check.** `B35`, `B40`, `B50`, `B56`, `B65`, `B66`, `B67`, `B71`, `B73`, `B77`, `B79`, `B81` are all guard, tally, or detector gaps — the *"guard that does not guard"* class `BUGS.md` already names by that phrase. That is a **build** problem, not a wiring one.

### Five stale `confirmed` rows

| Row | What lapsed |
|---|---|
| `B62` | Headline is squash-specific; the Epic lane moved to `--merge` at v0.1.19 precisely so branch commits survive. STATE's `last_updated_commit` **is** an ancestor of HEAD. Residual live: the fix lane still squashes and `ship.md` §9 gives no post-merge instruction. |
| `B46` | **Premise falsified by this file's own footer and never carried into the row** — M5.E13 measured *0 of 48* inbox candidates matching any disposition row. Needs **re-triage, not a fix.** (The 0-stamps/52-entries fact behind `A2` is independently re-verified and holds.) |
| `B56` | Numbers stale three corrections over. Structural gap live: `cross-file-consistency.test.js:65` compares docs to `facts.md`, never to the suite, and `cut-release.js` is referenced only from tests — never CI, never a command. |
| `B71` | Live consequence gone (`M5.E17-RETROSPECTIVE.md` now exists). Core defect live — still only two detectors, no world-check. |
| `B77` | Partly superseded by a hand-written `captured-untriaged` cell — **and the tally is wrong anyway.** |

### A live new instance, in the tally meant to fix it

`BUGS.md:157` publishes **`0 needs-triage · 2 captured-untriaged · 28 confirmed · 2 dismissed · 60 fixed (92 total)`.** Re-derived from the table on 2026-08-09: **0 / 2 / 26 / 2 / 62 = 90 rows + 2 captures = 92.**

**Two of five status cells are wrong** — `confirmed` and `fixed`, each off by exactly two. The total is **correct**. The cause is precise and unflattering: `B87` and `B90` flipped to `fixed` on 2026-08-08, **the tally's own narrative announces both flips by name**, and the cells above that narrative were not re-derived — against the file's own stated convention, repeated a dozen times in that same paragraph: *"Counts re-derived by grepping the status column … not incremented."*

> **Correction, and it is the review's own instance of the class.** An earlier draft of this section said *"three of five figures are wrong, and the total is over by two in a way the confirmed→fixed migration does not explain."* Both halves were false — the total is right, and the migration explains the discrepancy exactly. The claim was extrapolated from one verified fact (`28` vs `26`) rather than derived by counting all five cells, which is `B50`'s shape appearing in a document about `B50`'s shape. Counting takes one command; it is now run above.

Separately and still live: the "footer" is no longer at the foot — `/sig:add --bug` captures land *below* it, so the file's summary sits mid-document with entries after it, exactly as the `needs-triage` capture at `BUGS.md:171` describes about itself. **`B77` is not fixed; it has a fresh instance, and the artifact demonstrating it is the artifact meant to close it.**

---

## 3. Sharpened items

**`Loop engineering: split attention from rigor`** (`ISSUES-INBOX.md:1853`)
- **Before:** one inbox entry pointing at a 258-line analysis with three build phases and ten moves.
- **After:** three separately shippable items — (i) the prerequisite bundle `B73`–`B76`, done-when *"`light` and `strict` differ in code by more than one boolean, and REVIEW's FAIL path has VERIFY's 3-loop ceiling"*; (ii) the `attention` axis in `PROFILE.md`, done-when *"a FEATURE Epic runs DISCUSS→PR-open with ≤3 synchronous touchpoints and every auto-decision logged"* (the analysis's own Phase A exit criteria, `LOOP-ENGINEERING-ANALYSIS.md:223`); (iii) the driver, parked.
- **Lens:** INVEST — fails **Small** and **Estimable**.
- **Why better:** (i) is worth doing even if the rest never ships — the analysis says so itself (`:219`) — and it can start today.

**`/sig:permissions` — declared execution-authority levels** (`ISSUES-INBOX.md:1733`)
- **Before:** one item, framed as *the* answer to environment readiness, and blocked on a permission model.
- **After:** split. `.planning/ENVIRONMENT.md` (services, config-variable **names**, test accounts, channels) ships independently; the authority model stays parked.
- **Lens:** structural.
- **Why better:** `AGENT-EFFECTIVENESS-ALIGNMENT.md` calls environment readiness *"the absent axis"* and blocks it on this item. Half of it was never blocked on anything — it is a markdown file. Filed 2026-08-08 in `BACKLOG.md`.

**`Command namespace — decide whether group 4 gets a prefix`** (`BACKLOG.md:195`)
- **Before:** one item bundling a naming decision with a breaking rename, deprecation aliases, a `0.2.0` bump, and a pass over every doc.
- **After:** two. **Decide and record the target convention now** (free, reversible, unblocks every future command name); **execute the rename** at the next `0.2.0`-worthy moment.
- **Lens:** INVEST — fails **Independent** and **Small**.
- **Why better:** the entry's own argument is *"pre-1.0 with a small user base is when this is cheapest,"* but the cost it describes is entirely in the rename, not the decision. Separating them captures the cheap half immediately.

**`M5.E11 — Roadmap Advisor`** (`SIGNAL-V2-ROADMAP.md:117`)
- **Before:** *"sequencing and prioritization advisory"* — the largest new capability in the audit (`§4.3`).
- **After:** first slice is a **read-only report over the three queue files** that emits what §4 and §5 of this document contain: live-vs-dead classification, trigger states, and cluster grouping. Done-when: *"run on this repo, it reproduces the live set in §4 without a human editing the output."*
- **Lens:** architectural.
- **Why better:** this review is the manual proof that the output is useful. A read-only reporter is a fraction of an advisory system and is testable against a known-good answer that now exists.

**`Cross-document contradiction sweep — 11 open findings`** (`ISSUES-INBOX.md:1311`)
- **Before:** *"Captured 2026-08-04. Needs triage"* — 11 findings from the first real `auditor` run, still one undifferentiated entry five days later.
- **After:** triaged into numbered `BUGS.md` rows or dismissed with a recorded reason each.
- **Lens:** INVEST — fails **Testable**; "11 findings" is not a work item and cannot be called done.
- **Why better:** `auditor` is the only cross-document contradiction finder available and `/sig:sweep` has no equivalent. Leaving its first real output untriaged is the strongest possible argument against running it again.

---

## 4. Sprint clusters

Ordered by dependency and risk. Each is independently shippable.

### Wave 1 — Decide, don't build · **✅ COMPLETE 2026-08-09** *(hours; zero code; unblocked everything below)*

> **All six items closed the day this review was written.** Decisions: `D-BR0809-1` (`M5.E10`
> confirmed next; `M5.E11` kept at first-slice and sequenced behind it; `M5.E12` parked),
> `D-BR0809-2` (**M5 closes when `M5.E10` ships**; `E11`/`E12`/loop work become M6), `D-BR0809-3`
> (group 4 keeps bare verbs; `migrate-memory` → `migrate` at the next breaking window — closes
> `D-M5E19-9`). `B91` fixed: the unbuilt Epic is renumbered **`M5.E20`**, with the dead ID left
> legible rather than swapped. `M5.E8`'s heading struck. The 11 contradiction findings triaged —
> 3 dead, 3 merged into one root, 5 fixed. Both `needs-triage` inbox entries closed, one of which
> turned out to be **reversed** rather than stale.
>
> **What Wave 1 did not close, and should not be read as closing:** the allocator reconciliation
> behind `B91` (named, not built), and the release-vs-Epic delta label carrying `C2`/`SH2`/`SH4`
> (a decision, still open). Both are in Wave 2's territory.

`A1` re-disposition `E10`–`E12` **and restate M5's exit criterion** (`F4`) · file and resolve the `M5.E16` ID collision (`F1`) · strike `M5.E8`'s unclosed heading · the namespace **decision** half · triage the 11 contradiction findings · triage the two `needs-triage` inbox entries (`ISSUES-INBOX.md:1311`, `:1815`).

**Why these belong together:** every one is a decision blocked on nobody, none requires a code change, and each removes ambiguity that makes a later estimate wrong. **Sequence:** `A1` first — the other items are cheaper once the roadmap's shape is settled, and `F1`/`F4` are both things `A1` has to touch anyway. **Unblocks:** Waves 2–5 all size differently depending on `A1`'s outcome.

**One honest note on `A1` itself.** Per `F2`, the criterion normally used to sequence this work — *"real user pain points from v1 usage"* — has no written source. So the disposition pass should say **on what basis** it decides, in writing, and *"Brett's judgment"* is a legitimate and sufficient answer. What is not sufficient is repeating the user-pain justification, because the project has already recorded that it cannot be followed literally.

### Wave 2 — Make the queue honest *(small; every later estimate depends on it)*

`A2` drain home outside PLAN · **re-triage the five stale rows** (§2b) · `B77` (the tally cannot see the capture format — **and now has a fresh instance**) · `B89` follow-through.

**Why together:** all act on the same three files, and they share one failure: **the queue misreports its own contents.** 52 captures with 5 dispositions; a published tally wrong on three of five figures, sitting mid-document because captures land below it; five `confirmed` rows that have lapsed. **`A3` is done** — it was run in this pass, so this wave inherits a result instead of a task. **Sequence:** `B77` first now, because its new instance is one line of arithmetic away from being wrong again, and every count in this review was read off that file. Then `A2`. **Re-triage `B46` rather than fixing it** — its premise is falsified by its own file's footer. **Depends on:** nothing. **Unblocks:** honest sizing everywhere, and the trigger watchlist gets a real cadence.

### Wave 3 — The autonomy floor *(small–medium; the entry price for any loop work)*

`B76` **first and separately** · then `B73`, `B74`, `B75`.

**Why together:** one theme — the gap between documented and enforced gating.

> **Correction to my own recommendation.** Earlier in this pass I twice advised shipping `B76` in the **fix lane**. **The bug row disagrees, in writing:** *"Needs new capability, so Epic-homed rather than fix-lane"* (`BUGS.md:121`). The per-row verification agrees it is `ABSENT`/build and notes the ambiguity honestly — porting `verify.md`'s 3-option pattern *looks* like wiring, but that pattern is **prose in another file, not a shared mechanism**, so there is nothing to call. **The row's homing stands; my fix-lane framing was wrong on the mechanics.** The urgency argument is unaffected: it is still an unbounded loop, it still fired in the field during `M5.E16`, and it should be the **first slice of this cluster** rather than a separate lane.

**The real content is `B75`:** `light` and `strict` differ by one boolean, and you cannot widen that gap without deciding what "strict" means — which *is* Move 1 of the loop plan. Treat this cluster as either a hygiene Epic or the front half of Phase A, deliberately, not by discovery. **Depends on:** nothing. **Unblocks:** the `attention` axis.

### Wave 4 — What the agent doesn't know *(medium; the most coherent unbuilt Epic in the corpus)*

`.planning/ENVIRONMENT.md` · the measurable-outcome question at DISCUSS · task-handoff completeness (`ISSUES-INBOX.md:1687`) · self-critique at task and phase close (`:1705`) · blast radius and rollback (`:1719`).

**Why together — and this is the cluster the corpus was hiding:** four of these five were captured on the same day from the same source (`analysis/AGENT-EFFECTIVENESS-ALIGNMENT.md`, all logged 2026-07-26), and they have sat as five unrelated inbox rows ever since. They are one thing: **context and constraints the agent needs and is never given** — its environment, the outcome it's optimizing, what the research found, what it was unsure of, and what breaks if it's wrong. **Sequence:** `ENVIRONMENT.md` first (self-contained, useful attended); handoff completeness second (it is the one with a measured failure behind it). **Depends on:** nothing. **Unblocks:** unattended operation, where each of these becomes a halt.

> **Correction from the inventory pass — the batch is bigger than five.** A full read of `ISSUES-INBOX.md` shows **eight** entries logged on 2026-07-26 from that single alignment session: the five above (`:1687`, `:1705`, `:1719`, plus environment and outcome), and also **`:1618`** (measurement layer + telemetry bolt-on), **`:1640`** (Roadmap Advisor), **`:1665`** (project-facing currency), **`:1733`** (`/sig:permissions`), **`:1757`** (trajectory scoring, *proposed and declined*). Three of those became `M5.E11`, `M5.E12` and the parked telemetry item — **so this wave and the `E10`–`E12` disposition in Wave 1 are the same conversation seen from two ends.** That is an argument for doing `A1` first and letting it absorb this wave's scope question, rather than sizing Wave 4 independently. It is also why `/sig:permissions` should stay parked here: it blocks the 7th dimension of `/sig:audit` (`ISSUES-INBOX.md:571`) and nothing else in this wave.

### Wave 5 — Users can reach Signal *(small; gated on Wave 1)*

`A4` the tracker adapter for users · GitHub Issues adoption follow-through.

**Why together:** both are the intake path, and the trigger for both fired 25 days ago. **Depends on:** `A1`, because `M5.E14`'s full form is the tracker Epic and its relationship to `E10`–`E12` is exactly what Wave 1 settles. **Explicitly not in scope:** contribution scaffolding — see §5.

---

## 5. Actually fine — what looks like a gap and isn't

**`.github/` contains only `workflows/test.yml` — no `CONTRIBUTING.md`, no issue templates, no PR template.** This looks like an obvious omission for a public repo. It is a **dated, trigger-parked decision**: `ISSUES-INBOX.md:1091` records the deferral at `M4.5.E3` close, and `:1517` carries the standing trigger with three explicit conditions — *(a) an external PR opens; (b) ~5+ non-author issues; (c) a Linux/WSL tester*. **None has fired.** Building scaffolding for contributors who have not arrived is exactly the speculative work the trigger system exists to prevent. Leave it.

**The trigger watchlist looks unenforced.** `SIGNAL-V2-ROADMAP.md:120–125` states the mechanism *"has never run"* and that `grep -ril "watchlist" commands/ tools/` returns nothing. **That caveat is stale** — the grep now returns `commands/plan.md` and `tools/lib/drain.js`, plus `tests/trigger-watchlist.test.js`, and `M5.E13` ran the walk for the first time (`MILESTONE-5.md:38`: *"11 rows, all unevaluated, two already fired"*). The rows carry dated verdicts. The mechanism is real and has been used. Its *cadence* is the problem, which is `A2`, not a missing feature. **Recommend a one-line correction to the roadmap's caveat** so it stops describing a fixed condition.

**No telemetry, no cross-install measurement.** Ratified in principle (`SIGNAL-V2-ROADMAP.md:326–328`) and correctly parked. The roadmap already states the honest reason: *"at 7-of-12 adherence, four users will show nothing for a long while. A compounding asset, not a near-term signal"* (`:336–337`). Nothing to add.

**Most of `BACKLOG.md` is closed work.** 32 strikethrough/closed markers and three `<details>` blocks of superseded entries. This reads as clutter and is deliberate — the file preserves the reasoning that set an order even after the order changes, which is why the `M5.E19` correction (*"the entry's error is the useful part"*) could be written at all. Do not clean it up. The one thing worth adding is a **live-set index at the top**, so a reader reaches the ~15 open entries without judging 1138 lines. That is a formatting change, not a purge.

**Duplicate and unstruck entries in `BACKLOG.md`.** `B52` appears three times (`:37` terse-done, `:50` superseded-in-`<details>`, `:727` a fuller done write-up), the archive command twice (`:73`, `:676`), `B88` twice (`:155`, `:161`). One entry at `:728` is tagged `correctness` where every other tagged entry uses `roadmap` or `hygiene`, so a strict tag filter silently misses it. **Mostly fine** — the duplication is the provenance convention working as designed, and the cost is a reader reading twice. **One is not fine and belongs with `F1`:** `M5.E8`'s heading at `:418` carries **no closure marker and reads `Trigger: NONE — unconditional next`**, while line `:1108` of the same file says in passing *"M5.E8 landed as v0.1.13."* The file contradicts itself about whether its own foundational Epic shipped. Strike the heading.

**The unbuilt half of `/sig:sweep` is the thing that would have caught `F1`.** `BACKLOG.md:958` — the `--docs` judgment half (contradiction and duplication detection) and the `--code` half were never built, and the entry records a prior flat `✅ SHIPPED` claim it had to correct in place. The one tool that *can* do this work is the `auditor` agent, whose **first real run on 2026-08-04 produced 11 findings that are still untriaged** (`ISSUES-INBOX.md:1311`). Signal found a contradiction-finder, ran it once, and left the output sitting for five days — during which an ID collision went unnoticed. Not a gap in capability; a gap in follow-through, which is Wave 1.

**The old command proposals** — `/sig:report` (`:444`), `/sig:orient` (`:490`), `/sig:audit` (`:567`), `/sig:docs-update` (`:645`), PREPARE phase (`:307`), knowledge-graph (`:1039`), path-scoped skills (`:1494`). Seven entries from 2026-04/05, all still open, all looking like neglect. They are **correctly parked**: `/sig:audit --docs` is marked partially shipped by `/sig:sweep` (`:1383`), PREPARE carries an unfired trigger with three measurable conditions (`:1522`), and the rest predate v1 shipping. Re-deciding them is a `Wave 1` disposition question if `A1` goes well, not separate work.

---

## 6. Ranking (RICE, offered not imposed)

Applied only to the added and sharpened items, since the bug clusters are sized by their own priorities.

| Item | Reach | Impact | Confidence | Effort | Score | Note |
|---|---|---|---|---|---|---|
| `A1` disposition pass (+ `F4` exit criterion) | all future work | high | high | hours | **highest** | Nothing else is correctly sized until this lands |
| `F1` `M5.E16` ID collision | 1 roadmap item | high | **confirmed** | hours | **highest** | A live item unreachable by its own ID; breaks a locked rule |
| `B76` fix-lane | 1 command path | high | high | hours | **high** | Unbounded loop; already fired in the field |
| `A2` drain home | 52 queued items | high | medium | small | **high** | Also switches trigger evaluation back on |
| `ENVIRONMENT.md` | every project | medium | high | small | **high** | Half of a named absent axis, unblocked |
| ~~`A3` staleness audit~~ | — | — | — | — | **DONE** | Run in this pass (§2b): 5 stale rows, tally wrong on 3 of 5 figures, hypothesis falsified |
| `B77` re-fix (new instance) | every count in this file | medium | **confirmed** | small | **high** | The tally is wrong today and everything here was read off it |
| The *real* unreached test (incl. 62 `fixed` rows) | roadmap direction | high | medium | small | medium | The version of `BACKLOG.md:280` that can actually answer the question |
| Namespace **decision** | all future commands | medium | high | hours | medium | Only the decision — the rename is a `0.2.0` |
| Wave 4 remainder | every Epic | high | **low** | medium | medium | Confidence is the weak leg: no measured failure behind three of the five |
| `A4` tracker adapter | **unknown** (see `F2`) | medium | **low** | small | medium | Gated on `A1`. Reach is stated as unknown deliberately: the "4 users" figure is recollection per `D-M5E7-3`, and zero defects have arrived from it (`F3`). Building intake is also **how you'd find out** — which is an argument for it, not against |

**Confidence is where I'd push back on myself:** Wave 4 is the most *coherent* cluster and the least *evidenced* one. Four of its five items came from a single alignment analysis rather than from a recorded failure. Ship `ENVIRONMENT.md` and handoff-completeness first and let them argue for the other three.

---

*Successor document: `BACKLOG.md` remains the queue. Nothing here is committed until it lands there with a trigger and a first slice — the same rule `D-M5E7-8b` set for the v2 roadmap, and the reason that roadmap is enforced by a live doc rather than read by nobody.*
