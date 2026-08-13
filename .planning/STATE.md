---
schema_version: 1
docs_layout_version: 3
phase: REVIEW
current_epic: M5.E10
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-08-12)
  - PLAN (2026-08-12)
  - EXECUTE (2026-08-13)
  - VERIFY (2026-08-13)
blockers: []
last_completed_task:
  id: S4.t1
  status: done
  commit: 5b35110
  completedAt: 2026-08-13T14:47:23.449Z
last_decision_at: 2026-08-13T14:47:23.449Z
last_updated_commit: 260f4459b7b765fb189875f60d57677b6baadba4
last_updated: 2026-08-13T16:52:29.118Z
---
# Project State

> ## ▶ IN FLIGHT — `M5.E10`, opened 2026-08-11. The frontmatter is now authoritative again.
>
> **`phase: REVIEW` / `current_epic: M5.E10` are correct.** The Epic that closes **Milestone 5**
> (`D-BR0809-1`, `D-BR0809-2`) is open; `M5.E19`'s four-phase ledger archived cleanly to
> [`archive/M5/E19/STATE-NARRATIVE.md`](archive/M5/E19/STATE-NARRATIVE.md) on the roll.
>
> **DISCUSS, PLAN, all five EXECUTE waves and VERIFY are closed. REVIEW is running.**
>
> ✅ **`B94` (P1) is FIXED** — it landed after the planned slices and was taken in scope as **FR9 /
> S7** (`92ad0df`, `4e3bfe5`). `BACKLOG.md` gains a discharge path, a SHIP §6.6 step that uses it, and
> a `/sig:sweep` `backlog-discharge` check. **The check evaluates 1 of 12 corpus projects and cannot
> see `eval-project-A`, the project the bug was filed from** — that number belongs in the release
> notes, not a footnote.
>
> **All build work is done. 2410 → 2586 tests.** VERIFY ran as a real dogfood and
> [`M5.E10-VERIFICATION.md`](M5.E10-VERIFICATION.md) is **PASS with documented limits** — coverage
> `45/45`, template gate `valid`. **Its own first draft failed the coverage diff**: it asserted
> *"56 of 56, none missing"* and the check returned **6 missing**, every one an id written only inside
> an en-dash range. Left standing in the report as a boxed note; it is the Epic's best evidence.
>
> Two findings the phase produced: **`B95`** (filed, P2, not fixed — `RETROSPECTIVES.md` orders by
> file mtime, so FR7 reports ordering-only drift) and a **second live FR8 sighting caused by this
> phase's own transition**, fixed above.
>
> Next: REVIEW, an independent `/code-review` pass Brett triggers, then SHIP as **v0.1.25** — *not*
> v0.1.23, which shipped 2026-08-08; `plugin.json` is already at `0.1.24`. Shipping closes Milestone 5.
>
> **Read [`M5.E10-PROGRESS.md`](M5.E10-PROGRESS.md) first** — it carries every finding, including the
> ones that falsified the plan.
>
> ⚠ **This line said `phase: DISCUSS` at the PLAN close and `Next action: EXECUTE` at the EXECUTE
> close — instances SIX and EIGHT, both forming inside the Epic chartered to fix them.** It is not
> carelessness; it is the mechanism: a phase transition moves the frontmatter and structurally cannot
> touch this prose. **Instance eight is the one the shipped check does not catch** — FR8 reads
> `phase:` claims beside the Epic id, and *"Next action: EXECUTE"* is neither. The narrow rule was
> chosen deliberately (a literal reading flagged 62 episodes, most of them false), and this is the
> cost of that choice, paid immediately and on the record.
>
> **The block that used to sit here retired itself, and that is worth keeping.** It read *"do not
> orient from the frontmatter"* and named its own expiry in the same breath — *"both stay wrong
> until `M5.E10` opens."* That condition fired at the roll, which is why it could be removed with
> confidence rather than guessed at. **A staleness note that states its own expiry condition is
> strictly better than one that merely rots** — but nothing retired it automatically, and for the
> ~18 hours between the roll and this edit it was actively steering readers away from the half of
> the file that had just become correct.
>
> **Log that as instance five** of the narrative-vs-frontmatter defect this Epic absorbed
> (`D-BR0810-2`), and note what makes it different from the first four: the prose was not careless,
> it was *conditional and correct*, and it still went wrong the moment its condition flipped. It is
> the strongest available argument that the fix cannot be "write the note more carefully."
>
> **`last_updated_commit` is maintained; the narrative is not.** `/sig:checkpoint` advances the
> commit baseline, and the commit that *records* that refresh necessarily lands after it — so this
> file reads **exactly one commit behind immediately after a checkpoint**. That is the mechanism,
> not drift. **Do not put a commit sha in this block:** naming one is what made two earlier versions
> of this paragraph rot, each falsified by the very run it described.
>
> **For the fuller picture** read [`CONTEXT.md`](CONTEXT.md) § Active work → HANDOFF: the inbox
> triage is **done** (2026-08-10, PRs #136/#137/#138 — 52 entries → 50 dispositioned + 2 standing,
> `B92` filed, 13 rows added to `BACKLOG.md`, `D-BR0810-1…3`), and `B46` is **dismissed** (#140).
> **The routing further down this file that sends the inbox triage to `M5.E14` is historical**
> (`D-M5E17-3` cut it there when nothing else had a home for it); it ran in the fix lane instead.

## Resume pointer

**⚠ RESTART THE CLI PROCESS BEFORE RUNNING ANY WRITING `/sig:` COMMAND — but as of `v0.1.20` the
tool now tells you when it matters, instead of leaving it to you to remember.** `B52` is fixed:
`/sig:status`, `/sig:resume` and a SessionStart hook compare the copy the process actually resolved
against what `installed_plugins.json` records, and banner loudly when they disagree.

**Read this rule as narrowed, not lifted.** The check ships **inside the cache copy it inspects**, so
it cannot fire until a session binds to a version that has it — the first `0.1.20` session is exactly
the one that cannot warn itself. And the banner reports; it does not block. So the habit still
applies, and the *reason* it applies is unchanged: a stale binding served the pre-`B78`
PASS-WITH-FIXES text to **both** `/sig:review` passes of the M5.E18 build (five hits in one session,
2026-08-04), and *a stale binding that serves the wrong version of a **decision document** is worse
than one serving stale code.*

**A context clear is NOT sufficient** — measured, not reasoned: a `/clear` ran 2026-08-02 at 12:50
and the process kept its binding. **Restart the CLI process.** The banner says so in those words for
that reason. To check by hand, run any `/sig:` command and read the cache path it cites.

**Cache status 2026-08-06: `0.1.19` was the bound version for the `B52` fix work itself** (verified —
`installed_plugins.json` records `0.1.19` and this session's `/sig:resume` cited that path, so the
two agreed and no banner was due). ⚠ **`v0.1.20` ships 2026-08-06, so the cache will be a release
behind again until you `/sig:update` **and then** restart — in that order, because a restart before the update has nothing new to bind to** — and the *next* session after that is the first one
this fix can protect.

## ~~▶ NEXT WORK — agreed 2026-08-06, in this order~~ · **CLOSED — all three shipped**

> **Historical as of 2026-08-12. Kept for the reasoning, not the ordering.** All three shipped
> (`B52` → v0.1.20, the archive command → v0.1.22, `M5.E14`'s slice → v0.1.24). **Two claims below
> are now false and are corrected here rather than edited in place**, since the section is a dated
> record: item 3 says `M5.E10`'s trigger *"is NOT met"*, and the closing note says `M5.E10` has
> *"never landed — no artifacts on disk."* `M5.E10` is **open and in flight** with four artifacts on
> disk. Both statements were true when written on 2026-08-06. **The live queue is
> [`BACKLOG.md`](BACKLOG.md)** (`D-M5E18-1`).

**Brett's call: do all three, sequentially.** Full reasoning and the plain-language framing are in
[`BACKLOG.md`](BACKLOG.md) → *"Next work — the agreed sequence"*. That file is the queue
(`D-M5E18-1`); this is the pointer, not a second home for the ordering.

1. ~~**`B52` — the session binds to a stale plugin cache.**~~ **DONE — shipped as `v0.1.20`,
   2026-08-06, fix lane, both halves.** Two corrections to how this item was scoped, both found by
   building it: (a) the SessionStart hook **structurally cannot** see the originating sighting — the
   binding is resolved before the hook runs — so the fix also wires the **command path**
   (`/sig:status`, `/sig:resume`), which reads at the moment of use; (b) the `setCurrentEpic` half was
   not merely a stale-cache backstop — **two** of the three branches that zero an unarchived phase log
   are reachable with no stale cache at all (a linear project opening its first Epic; a non-strict
   `current_epic` such as `PHASE11`). `B84` filed from the release cut itself.
2. ~~**The closure-gated archive command**~~ **DONE — shipped as `v0.1.22` (`M5.E19`), 2026-08-07.** `/sig:archive`; `B82` shipped separately in v0.1.21. Original entry: — wire `resolveClosures` to the mover. **Epic lane.** Trigger
   FIRED 2026-08-04: `curator` was removed from the machine and `eval-project-A` + `eval-project-D` are
   archiving by hand-written runbook today. M5.E18 built the engine and wired none of it. **Fold in
   `B82`** (P2 — `planArchiveMoves` ignores `deriveUnits` and moves half a unit). The bar: the
   replacement must **refuse**, not warn.
3. **`M5.E14`'s shippable slice** — the `discharged` marker + a SHIP-gate open-obligations query.
   **Its stated trigger (`M5.E10` lands) is NOT met** — take only the slice the backlog explicitly
   allows to ship ahead as a patch, not the whole tracker Epic. *Live evidence it is needed: `B55`
   and `B80` sat as `confirmed` for hours after v0.1.19 fixed them.*

**Not proposed, and why:** `M5.E12` and `M5.E14`-in-full both have unmet triggers (`M5.E11` and
`M5.E10` have never landed — no artifacts on disk). Verified 2026-08-06, not assumed.

**▶ FIX-LANE ITEMS reconciled from parallel sessions 2026-08-03/04.** Captured as numbered bugs;
neither blocks M5.E18. Detail in their rows, not here.

1. ✅ **`B78` — FIXED 2026-08-04, fix lane, ahead of its deadline** (`D-M5E18-6`). `review.md` stated
   the PASS-WITH-FIXES rule in four disagreeing places and the test block was a fifth voice; it now
   states it once. **The product call went the other way from the recommendation, and found a real
   hole doing it:** *"requires new tests"* flips from **disqualifier to obligation** — the fix
   carries new coverage, in-phase, green. The old wording penalised the reviewer who wrote a
   regression test, *and* `"all tests still pass"` only ever constrained tests that **already
   existed**, so a fix could close in-phase with **zero** new coverage and satisfy every condition.
   The rule read strict while leaving the test-debt door open. Cap is now `≤ 50 LOC of non-test
   source`, with the required coverage **excluded from it** — otherwise the obligation fights the
   cap. Nothing was cut: *"ripples beyond a single file"* is demoted to an illustration of design
   impact, the condition it was always failing. **Deadline met** — the paragraph that will audit
   M5.E18's own REVIEW is now the fixed one. 2054 → **2062 tests**.
2. **`B77` — `BUGS.md`'s tally could not see the capture format Signal itself writes.** Fixed in the
   record (both formats now derived, new `captured-untriaged` column); the **code** fix — have the
   tooling count both, or report captures as their own line — is still open.

**`B73`–`B76`** are the loop-engineering audit's findings, triaged from heading-captures into
numbered rows. `B74`/`B76` need new capability → Epic-homed. `B75` is worth knowing while M5.E18
runs: **`gate_strictness` `light` and `strict` differ by one boolean in code** — every other
difference is prose, so M5.E18's wave gates are being honoured because the command text says so, not
because anything enforces it. `analysis/LOOP-ENGINEERING-ANALYSIS.md`'s attention-axis proposal is a
**future DISCUSS**, after M5.E18 ships.

---

**✅ `M5.E18` SHIPPED as `v0.1.18` (2026-08-04) — the archive half, for the projects Epic-gating did
not reach.** Retro: [`M5.E18-RETROSPECTIVE.md`](M5.E18-RETROSPECTIVE.md) — read that first.
Plan: [`M5.E18-PLAN.md`](M5.E18-PLAN.md) · Progress: [`M5.E18-PROGRESS.md`](M5.E18-PROGRESS.md) ·
Decisions `D-M5E18-1`…`6`. Closed `B64`, `B70`, `B72`, `B78`. **1994 → 2168 tests.**

**The number the release is about:** `/sig:migrate-memory` went from archiving **67 files across 1 of
12 real projects — every one of those 67 in Signal's own tree — to 114 across 6.** `eval-project-C`
0 → 26. The closed-set is a **union**, measured in both directions: retro-only sees 67 and is blind
to 8 projects; verdict-only sees 110 but **loses 4** (`M5.E17` has a retro and no VERIFICATION, so
the verdict rule reads a shipped Epic as running). A **stub retro vetoes** closure regardless of
verdict, or the union silently undoes `B64`.

**Two loop-backs, both recorded in `completed_phases` rather than smoothed.** REVIEW returned **FAIL**
on a 112-LOC in-phase fix against a ≤ 50 cap — the *"71 of those are deletions"* argument was
available and is rejected on the record, because *"insertions plus deletions"* had been written into
the rule the previous day (`D-M5E18-6`). The loop-back was substantive: the second VERIFY then found
`AC4.5`'s half unreachable.

**The finding worth carrying into the next Epic:** **three separate "correct library code, no command
path" gaps, and none was caught by the same mechanism twice** — one internally, one by a question
from Brett, one by the second VERIFY. The retro proposes making *reachable from a command* an
acceptance criterion rather than a review question.

**Filed at the ship, not fixed:** **`B79`** — `evictEpicNarrative` has **never** been able to fire for
Signal's own STATE.md (`extractEpicSection` wants a `## {EpicID}` heading; this file uses
bold-prefixed paragraphs under one `## Resume pointer`), and reports it as a clean `no-section`
no-op. `C1`'s class. Nothing is lost — relocate-never-delete — but STATE.md grows unbounded in the
repo that runs this flow most.

**Known limit carried:** strict Nyquist is **14 of 18**; S4's four have no red-first evidence and
cannot acquire it. Mutation testing is recorded as a substitute, not an equivalent.

---

**▶ OPEN: `M5.E15`** (`B55` — the adherence control arm; blocks trusting any new adherence verdict).
DISCUSS + PLAN closed 2026-08-04; EXECUTE next.
→ then **`M5.E14`** (tracker migration + the inbox triage (52 entries as of 2026-08-09)) → then **`M5.E10`** (review
hardening / claim integrity). `analysis/LOOP-ENGINEERING-ANALYSIS.md`'s attention-axis proposal is a
**future DISCUSS** now that M5.E18 has shipped.

---

**Three PLAN-time acceptance criteria were corrected in the open before EXECUTE** — `AC1.2`
(the behaviour it called correct was the defect: the flat rule split one eval-project-A slice into two
units, so FR2 would have archived half of it), `AC1.4` (expected set wrong in both directions), and
`AC2.2` (both named fixtures invalid — one file does not exist). Corrections live in the PLAN, not
in the requirements, per `B59`'s precedent.

**DISCUSS walked three real trees rather than quoting the backlog, and two findings reshaped the
scope.** (1) There is no single "prefix" to read — eval-project-A has **10+ unit names**, some beginning
with the word `PLAN`, so a declared-prefix field cannot express the shape (`D-M5E18-2`). (2) **The
retro requirement, not the prefix, is the harder blocker** — none of the three projects has a single
retrospective file, so closure-by-retro returns *nothing is closed* everywhere (`D-M5E18-3`).

**`B70` shipped ahead of the build work as `v0.1.17` (2026-08-03), fix lane, per `D-M5E18-5`** — it
is listed under M5.E18's *Out* section and nothing in FR1–FR6 is gated on it. **Three open questions
are queued for PLAN**, listed at the foot of the requirements: where unit derivation lives, what the
archive directory is for a non-Epic unit, and whether `isEpicDone`'s tightening reaches
`/sig:discuss`'s done-Epic guard (`B71` answers the third in advance: yes, in scope).

**Why it outranks everything else queued:** Signal's two archive paths are Epic-gated **by
construction** — `planArchiveMoves` filters through `EPIC_ID_STRICT_RE`, `extractEpicSection` and
`deriveEpicArchiveDir` reject non-strict IDs. M5.E16 measured the consequence: **Epic mode is 4 of
12 readable projects**, so **8 of 12 cannot archive at all.** This is the capability gap standing
between the doc-runtime and "all my projects are healthy."

**Both pre-M5.E18 items are DONE (2026-08-02, fix lane). Read what they returned — the second one
came back refuted, and it moves M5.E18's scope.**

1. ✅ **`BUGS.md` status column reconciled against the code.** Not 4 stale rows — **17**. Eleven
   were fixed and never flipped (`B39`, `B41`, `B42`, `B43`, `B44`, `B45`, `B48`, `B51`, `B53`,
   `B54`, and `B36` from `needs-triage`); `B20` was mis-statused `dismissed` on a real, fixed bug;
   five `needs-triage` rows triaged to `confirmed`, emptying that bucket. The framing above — *"the
   linear-mode rows are exactly the stale ones"* — was half right: `B41`–`B45` are linear-mode, but
   `B39`/`B48`/`B51`/`B53`/`B54` are M5.E13 rows and were equally stale. Every flip carries a
   `file:line` or a test that fails if it regresses.
2. ❌ **Do NOT "fix" `current_epic` in `eval-project-C` or `agent-tools-sync` — the instruction was
   wrong, and executing it would have broken both projects.** Measured, not reasoned:
   `resolveArtifactPath(…, {currentEpic: null})` returns **`null`** for both, because every artifact
   they own is named after the non-strict value — 19+ `PHASE1*-*.md` files and 6 `M1-*.md` files.
   Nulling the field to make STATE "honest" makes all of them unresolvable. **The finding is better
   than the fix: two projects independently used `current_epic` as an artifact-prefix field, and
   Signal has no such field.** That is an M5.E18 design input, and changing the values now would
   erase the evidence. (`B53`'s divergence itself is genuinely fixed — verified by execution: a
   fresh write to `1-PLAN.md` is found first by Pattern W, so it no longer hides behind the stale
   Epic-prefixed file.)

**Three findings came out of measuring for step 2 — one of them outranks M5.E18's current framing:**

- **`B70` (P1)** — **`/sig:status` and `/sig:resume` throw outright on 5 of 12 readable projects.**
  `nextActionForPhase` rejects any `phase` outside the seven canonical names, and it is **the one
  call in either command that nobody marked fail-open** — every neighbouring optional read is.
  So a hand-maintained project that parked narrative in the `phase:` scalar loses its
  next-action step with nothing telling the agent to continue without it. (The throw is
  measured; the user-facing consequence is read from the command files, not run.) Nothing upstream stops it: `readState` does not validate `phase`, and
  the frontmatter-shape guard only ever inspects `completed_phases`. Measured across the real
  corpus: **7 ok · 5 crash · 1 `readState` throws**. M5.E16's table already recorded the input
  (*"Canonical `phase`: 7 of 12"*) — nobody executed the consequence. **Same population as M5.E18,
  and it should land with or before the archive work: shipping the archive half for projects whose
  `/sig:resume` throws is the second half of a door.**
- **`B69` (P3)** — the SHIP retro write-guard **throws** on a non-strict `current_epic` and the
  hook swallows it. The fail-open is deliberate and correct; the silence is not. `B63`'s shape one
  layer over, so it belongs with M5.E18's port of the four-status model.
- **`B68` (P3)** — the detected Epic/linear mode is printed by nothing, so a non-strict project
  reads as Epic to a human and linear to Signal. The unimplemented third of `B53`'s fix shape,
  split out rather than buried in a row now marked `fixed`.

**M5.E18's scope, decided 2026-08-02 (Brett):** **`B70` is absorbed as the Epic's first slice**,
ahead of the archive planner. Two reasons, both recorded at the time: shipping the archive half for
projects whose orientation commands throw is the second half of a door, and `B70` shares part 2's
root question — `readState` validates neither `phase` nor closure, and the `B45` fix already
established the answer shape (quarantine the off-enum value, surface it, never key on it). Deciding
it once for both fields is why it is one Epic and not two.

**Then queued behind M5.E18:** **M5.E15** (`B55`, the adherence control arm — blocks trusting any
new adherence verdict) → **M5.E14** (tracker migration + the inbox triage (52 entries as of 2026-08-09)) → **M5.E10**
(review hardening / claim integrity — the semantic half of M5.E16's question).

**A sequencing note worth keeping, from the 2026-08-02 review of the bug record.** The last four
releases were, by title, *the measurement foundation · guards that don't guard · instructions that
contradict other instructions · STATE-vs-world drift detection* — **four consecutive bug-FINDING
Epics.** The rising bug count is what looking harder produces, not decay: of 67 catalogued findings,
**17 state in their own text that the defect pre-dated its discovery, and 2 were caused by a Signal
change** (both P3, both fixed). What is *not* healthy is that no release has been a **closing** one,
and `M5.E18`'s own capture says why — **`B63` is *"C1's class in the command next door"***, filed the
day after `C1` was fixed. **Signal has been finding classes and fixing instances.** M5.E18 should fix
by class and prove it by searching for siblings, and a stopping rule — *no new detector Epic while
the verified-open count is high* — is the missing gate.

---

**v0.1.16 — M5.E16, "what `.planning/` asserts vs. what is on disk" — ✅ SHIPPED 2026-08-02.**
`/sig:sweep` gained six deterministic STATE-vs-world checks, each declaring whether it **needs a
person** or **clears itself**. 1836 → **1938 tests**. 18 → **19 commands**. Decisions
**D-M5E16-1…5**. Retro: [`M5.E16-RETROSPECTIVE.md`](M5.E16-RETROSPECTIVE.md).

**The number that shaped the release.** Measured across **13 real `.planning/` projects**: the two
checks aimed at the incident that opened this Epic can evaluate **2 of them**. Signal's own
hand-maintained, Epic-mode, `schema_version: 1` shape is the **minority** shape — 4 of 12 readable
projects are Epic-mode, 7 of 12 have a canonical `phase`, and `readState` **throws** on one outright.
A detector printing nothing on the other 11 would read as *clean* when it never looked, which is
`B39`'s shape and `B54`'s. So the report separates **"checked and clean"** from **"could not
check,"** and `(h)` — a check found only by measuring — reports *why* the others cannot see.

- **Six ship, two dropped with reasons.** Orphan detection duplicates `detectOrphans`; the blockers
  check is **unvalidatable** — *zero of thirteen* real projects have a non-empty `blockers[]`.
- **Precision measured, not asserted:** 13 projects, **5 findings, all true positives, 0 false
  positives**. NFR3 **+19 ms** against a 200 ms budget.
- **Also shipped:** `INDEX.md` regenerates at **every phase transition** (was: only at ship), and
  **`/sig:update`** — installed vs. available *plus the CHANGELOG delta*, the half `/plugin` cannot
  show you.
- **`D-M5E16-1`:** FR4 said *"Signal runs it"*, NFR2 said sweep never writes. Resolved in NFR2's
  favour, and the recorded cost is that **the command-healable bucket ships empty** — asserted by a
  test.

**Two defects in the Epic's own work, both found by reading documents against each other:**

- **`B59`** — `M5.E16-PROFILE.md` carried **two** out-of-enum values, so `readEffectiveProfile`
  threw and **the Epic declaring FEATURE ran its whole DISCUSS at the project's FULL.** Found at its
  own PLAN preamble, the first time any code read the file. Fixed and pinned.
- **`C1` at REVIEW** — check `(c)` reported **"clean"** on `eval-project-C` (19 phase artifacts, 0
  retrospectives) because it declared itself unconditionally evaluable while keying detection to a
  strict filename. **REVIEW returned FAIL and the Epic looped back to EXECUTE**, rather than take the
  small-diff exit `D-M5E17-1` explicitly warns about. The fix then introduced a *false positive*,
  which FR2.1's re-measure requirement caught inside the same loop.

**The sentence worth carrying forward:** *check `(a)` had zero live hits and fixture-only evidence
until the REVIEW→EXECUTE loop-back moved the recorded phase backwards past an artifact that already
existed — so the Epic's own process produced the first field instance of the drift its own check was
built to detect.*

**Published honestly rather than rounded:** Nyquist **87 of 98 red-first**, not 98/98 — measuring the
baseline rather than attesting to it is what surfaced the ten that could not have failed. New:
**`B60`** (P2, six phase commands have no branch for a malformed PROFILE while four meta commands
do), **`B61`** (P3, hand-edited numeric-looking `last_updated_commit` is YAML-coerced).

---

**⚠ HOW CHANGES REACH `main` CHANGED 2026-08-01 — read before your first commit.** `main` is
**protected**; direct pushes are rejected by the server. Every change needs a branch, a PR, and a
green `test` check (0 approvals required). **Two lanes:** the Epic lane runs six phases, the fix lane
runs none — **both** require the PR. Delivery moved to the relative `.` marketplace source, so
**users track `main`**, not a pinned tag. Full rules in `CLAUDE.md` § *How changes reach `main`*;
rationale in **`D-M5E17-4`** / **`D-M5E17-5`**.

---

**v0.1.15 — M5.E17, "instructions that contradict other instructions" — ✅ SHIPPED 2026-08-01.**
Three documents corrected, each pinned by a test comparing one document against another. 1806 →
**1828 tests**. Decisions **D-M5E17-1…5**.

- **`ship.md` referenced a commit that no step created** — four steps staged "into the SHIP commit",
  none made it, and `markFresh` sat at §5.3 ahead of all four, stamping a pre-commit HEAD **by
  construction**. New §9 creates it; `markFresh` follows.
- **`verify.md` / `review.md` stated no `markFresh` ordering at all** — silent, not wrong, which is
  the same defect one step earlier. Audit: **2 explicit / 2 silent / 1 wrong** across 5 call sites.
- **`review.md`'s verdict table contradicted two shipped Epics** (`FAIL | Any Critical` vs M5.E9 and
  M5.E13 both shipping PASS-WITH-FIXES with an in-phase Critical). Rule was miscalibrated, not
  practice — **D-M5E17-1**, four conjunctive conditions, counter-argument recorded in the file.
- **`plan.md` now schedules first-use** — name what the Epic does *for the first time*, put it in
  **wave 1**. `B54`, `B39`, `B42`/`B53`, `B48`, `B55` all surfaced on a first execution, all late.
- **Two of the Epic's own ACs were satisfiable by a no-op** — corrected in the open. The red baseline
  was **measured, not predicted**, and running it caught an error in the probe itself.
- **Cut: FR4**, the inbox triage (52 entries as of 2026-08-09) → **M5.E14** with the tracker migration (`D-M5E17-3`).
- **`B56` filed:** `references/facts.md` publishes 894 tests (actual **1828**); the guard pins
  `facts.md` to `README.md` but never to the real count — both drift together, test stays green.

**Fixed same day, outside the Epic (fix lane):**
- **`B58` (P1)** — `marketplace.json` pinned `sha` to **v0.1.13's commit** while `ref` said v0.1.15.
  Claude Code resolves the **sha**, so **every install since v0.1.14 silently delivered v0.1.13** —
  two releases undeliverable, and Signal's only regular outside user was running v0.1.13 machinery
  against live projects. **Found by Brett running `/plugin`.** The guard checked the sha's *shape*
  and the ref's *value* and never compared them. **`B7` recorded this exact drift at v0.1.7 as
  "needs a look" and nothing enforced it for eight releases.** Closed by **deletion** — the source is
  now the relative `.` form, so there is no second place to record which commit ships.
- **`B57`** — `/sig:sweep` walked `.planning/.migrate/snapshot/`, a frozen backup, and reported it as
  broken live docs: **11 of eval-project-A's 12 findings were noise.** Found by the first run of sweep
  against real non-Signal projects — the FR1 first-use discipline, applied the day it shipped.
- **`ship.md`'s direct-to-main self-exemption removed.** Its Exit Criteria require a PR and an
  approval; §5 exempted "the Signal-on-Signal flow" from exactly that. Written 2026-05-26 —
  **thirteen releases shipped under it and exactly one PR existed in that span.** Fourth contradicting
  instruction pair found in that one file. Now pinned by a test.

---

**v0.1.14 — M5.E13, "guards that don't guard" — ✅ SHIPPED 2026-07-30.** Four defects, one shape: *something was built to catch a mistake, and it does not catch it.* Full DISCUSS→SHIP at FULL/strict. 1736 → **1806 tests**. Retro: `M5.E13-RETROSPECTIVE.md`. Decisions **D-M5E13-1…8**.

**Closed:** `B48` (the phase-entry instruction was **unconditional**, and an agent **correctly refused it** — fixed in the text *and* the code beneath it), `B53` (a non-strict `current_epic` split artifact **write**-naming from **read**-resolution), `B39` (a watchlist nothing walked), `B36`, `B49`-remainder, `B51`, `I2`, and `B54`.

**The two findings that outrank the plan, both found by doing the work rather than planning it:**

- **`B54`** (at PLAN) — `checkGateArtifacts` was the guard class's **fourth** instance and the only one **wrong if wired up**: executed against Signal it returned `missing:['REQUIREMENTS.md']`, so the obvious remediation would have blocked PLAN for every Epic-mode project. **Being uncalled is what protected its bug from discovery.** Deleted.
- **`B55`** (at the last task) — **the adherence control arm was never isolated across files.** `adherence-run.js` mutates one command file while `transitionPhase` is named 4× each in three siblings, so a control-arm agent simply reads a neighbour. The canary re-ran **INDETERMINATE** (3/3 vs 1/3) and was **deliberately not re-rolled** — a second run is a coin-flip and taking the better of two is what M5.E8's impostor table forbids. **v0.1.13's flagship `OBEYED` is not falsified but unisolated: clean by luck, not construction.** → **M5.E15**.

**The sentence worth carrying forward:** *this Epic's own defect classes appeared in its own work five times — at DISCUSS, PLAN, VERIFY, and twice at REVIEW — and all five were caught by someone re-deriving a number that was already written down. None by a mechanism.* REVIEW's two were the sharpest: an **unconditional guard** replacing an unconditional instruction (Critical — it made SKETCH projects unshippable, `B42`'s exact shape), and **two implementations of one rule under a comment denying it**. If these classes survive an Epic explicitly about them, they survive anything short of automation. That is the argument for **M5.E16**.

**Known limits, stated:** AC2.2 **NOT MET** — `B46`'s premise does not survive measurement (**0 of 48** inbox candidates map to any disposition row); work stopped rather than forced. The published coverage share fell 22.4% → 21.1% **because clarifying an instruction lowers it** — documented in `ADHERENCE-LOG.md` above the table.

**New this release:** **CI** (`.github/workflows/test.yml`) — Signal had none. Its first run caught a latent dependency nothing had stated: the suite walks real git history, and `actions/checkout` shallow-clones by default.

## In-flight

**▶ `M5.E10` — review hardening / claim integrity — opened 2026-08-11. DISCUSS + PLAN closed; next is EXECUTE wave 1 (`S1`).** Shipping it
**closes Milestone 5** (`D-BR0809-2`). Running at the project's **FULL / strict** (no Epic-scoped
PROFILE; see the tier note in `M5.E10-REQUIREMENTS.md`). `M5.E19`'s ledger archived to
[`archive/M5/E19/STATE-NARRATIVE.md`](archive/M5/E19/STATE-NARRATIVE.md) on the roll.

*Prior: `M5.E19` closed and shipped as `v0.1.22` (2026-08-07) — `/sig:archive`, the command
archiving never had. Retro: [`M5.E19-RETROSPECTIVE.md`](M5.E19-RETROSPECTIVE.md). Decisions
`D-M5E19-1`…`9`. Filed `B87`. 2284 → 2300 tests, 20 commands.*

**FIVE times now — and instance five happened to THIS paragraph, in the edit that opened the Epic
chartered to fix it.** For roughly twenty minutes after `setCurrentEpic` wrote `current_epic:
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

## Blockers

None.

## Pending ops

None currently open.

## Closed work

- **M5.E8** (The measurement foundation) — SHIPPED as **v0.1.13** (2026-07-28). The adherence harness + the published coverage ceiling (**91/407 = 22.4%** trace-measurable). First verdict: `B41-phase-entry` **OBEYED** (3/3 vs 0/3). 1652→1736 tests; VERIFY PASS (28 ACs); REVIEW PASS-WITH-FIXES (1 Critical — the source commit was captured after the run, defeating `--combine`'s pairing guard). New: **B48** (P2, live), **B49** (P3, fixed). → [M5.E8-RETROSPECTIVE.md](M5.E8-RETROSPECTIVE.md).
- **M5.E9** (Linear mode & the phase ledger) — SHIPPED as **v0.1.12** (2026-07-27), **ran ahead of E8** (D-M5E9-2). Closed B41–B45; `[BREAKING]` `completed_phases` became an append-only trimming log. 1623→1652 tests. → [M5.E9-RETROSPECTIVE.md](M5.E9-RETROSPECTIVE.md).
- **M5.E6** (Doc-runtime close-out — maintenance-command half) — SHIPPED as **v0.1.11** (2026-07-25). `/sig:sweep` + roster 17→18 + FR3 map line + FR7 close-out & B31 + cleared B27/B28/B29/B30; 1561→1623 tests; VERIFY PASS (strict, mutation proof-of-fail), REVIEW PASS (3-specialist panel, 0 false-greens). New `needs-triage`: B32–B36 (incl. **B36** — FR1 gate stale-row blind spot found dogfooding the ship). → [M5.E6-RETROSPECTIVE.md](M5.E6-RETROSPECTIVE.md).
- **M5.E5** (v0.1.10 carry-over bug squash) — SHIPPED as **v0.1.10** (2026-07-21). B24/B25/B26 + B6 refinement fixed, RED-first; 1529→1561 tests; REVIEW PASS (0 false-greens, 12-case mutation matrix); **B26 dogfooded on its own SHIP**. New carry-overs B27–B30 deferred (`needs-triage`). → [M5.E5-RETROSPECTIVE.md](M5.E5-RETROSPECTIVE.md).
- **M5.E4** (Bug & doc-runtime hygiene close-out) — SHIPPED as **v0.1.9** (2026-07-21). 12 confirmed bugs fixed/dismissed + FR5 concurrency-lock; 1492→1529 tests; REVIEW PASS-WITH-FIXES (evict.js false-green security bypass caught + fixed in-phase). B24 + the B6 refinement deferred to v0.1.10. → [M5.E4-RETROSPECTIVE.md](M5.E4-RETROSPECTIVE.md).
- **M5.E1 + M5.E2 + M5.E3** — the doc-runtime, SHIPPED together as **v0.1.8** (2026-07-20): canonical doc-model + eviction (E1), auto-sensing `/sig:migrate-memory` (E2), all-docs hygiene + living `BACKLOG.md` + append-log eviction + auto `/sig:index` (E3). → [M5.E3-RETROSPECTIVE.md](M5.E3-RETROSPECTIVE.md) (+ E1/E2 retros).
- Pre-M5.E1 project history (the full pre-schema_v1 narrative) → [STATE-HISTORY.md](STATE-HISTORY.md).
