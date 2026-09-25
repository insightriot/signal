<!-- Relocated verbatim from .planning/STATE.md on 2026-09-14 during M6.E8 EXECUTE, when STATE.md
     crossed its 40 KB ceiling (tools/doc-budgets.json). This is the "NEXT WORK — agreed 2026-08-06"
     section: all three items shipped (v0.1.20, v0.1.22, v0.1.24) and its own corrections had expired
     by v0.1.25 (2026-08-13). 25 KB of closed, three-layer dated record; kept whole for the reasoning.
     The live queue is .planning/BACKLOG.md (D-M5E18-1). -->

## ~~▶ NEXT WORK — agreed 2026-08-06, in this order~~ · **CLOSED — all three shipped**

> **Historical as of 2026-08-12. Kept for the reasoning, not the ordering.** All three shipped
> (`B52` → v0.1.20, the archive command → v0.1.22, `M5.E14`'s slice → v0.1.24). **Two claims below
> are now false and are corrected here rather than edited in place**, since the section is a dated
> record: item 3 says `M5.E10`'s trigger *"is NOT met"*, and the closing note says `M5.E10` has
> *"never landed — no artifacts on disk."* **Both statements were true when written on 2026-08-06, and
> the correction itself has since expired**: `M5.E10` shipped as `v0.1.25` on 2026-08-13, closing
> Milestone 5. Left as a three-layer record rather than flattened, because it shows how fast a
> correction goes stale when it is written in prose next to a dated claim. **The live queue is
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
2. ❌ **Do NOT "fix" `current_epic` in `eval-project-C` or `eval-project-I` — the instruction was
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
