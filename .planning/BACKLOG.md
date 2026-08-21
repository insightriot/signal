# Backlog

Groomed, sequenced roadmap — promoted from the issues inbox (`ISSUES-INBOX.md`). Roadmap-vs-hygiene is a **Tag** on each entry, not a separate file (**roadmap** = new capability / direction; **hygiene** = maintenance, trust-hardening, doc/tooling cleanup). Sprint clusters are the sequencing spine; within a sprint, order is listed where it matters.

> **Source.** Restructured from the point-in-time backlog pass `BACKLOG-REVIEW-2026-07-04.md`, now archived at [`archive/BACKLOG-REVIEW-2026-07-04.md`](archive/BACKLOG-REVIEW-2026-07-04.md) (move-never-delete — the snapshot is frozen; this file is its living successor). The snapshot's added items (A1–A5), sharpened items, and sprint clusters are folded in below.

## Since the snapshot — what shipped (reconciliation, 2026-07-19)

The snapshot was captured 2026-07-04; four of its clusters have since closed or opened as real Epics. Condensed here so the living list below carries only still-open work (the full snapshot is archived, nothing lost).

- **Sprint 0 — Close the loop outward:** the M5 usage-signal gate was **lifted 2026-07-15** (4 non-Signal users onboarded, positive reception); M4.5 formally closed. Ongoing tester feedback folds in as it arrives. The deliberate second-dogfood hedge (**A2**) is no longer blocking — it can run opportunistically for extra signal.
- **Sprint 1 — Trust hardening: shipped.** `/sig:resume` Epic-prefix resolver + origin-drift detection + capture-pipe guards + SessionStart-resume hook smoke test (**v0.1.5 / M4.5.E10**); STATE-frontmatter write-guard + drain-convergence + `/sig:add` footer/title guards (**v0.1.6**). Also landed: STATE per-command refresh across the non-EXECUTE commands, `references/hooks-api.md`, `/sig:doctor` upgrade diagnostics (**A4**), and the standing trigger **WATCHLIST** (**A1**, now living in `ISSUES-INBOX.md`).
- **Sprint 3 — Memory & doc-runtime: in progress.** Canonical doc-model + STATE/inbox eviction (**M5.E1**), auto-sensing `/sig:migrate-memory` (**M5.E2**), and the living `BACKLOG.md` + auto `/sig:index` + all-docs hygiene + append-log eviction (**M5.E3**, in flight). Residual items are carried below.
- **Epic-native flow** (committed 2026-07-05, not a 2026-07-04 cluster) shipped as **v0.1.7 / M4.5.E11** — `--epic` first-class + per-Epic calibration.

Still-open roadmap follows, in sprint sequence.

---

## Next work — the agreed sequence *(Brett, 2026-08-06, after v0.1.19 shipped)*

**Do all three, in this order.** Recorded here because this file is the queue (`D-M5E18-1`);
`STATE.md` carries a pointer to it, not a second copy of the ordering.

> **✅ ALL THREE ARE DONE as of `v0.1.24` (2026-08-09).** `B52` → v0.1.20, the archive command →
> v0.1.22, `M5.E14`'s slice → v0.1.24. **This sequence is closed; it is history, not a queue.**
> Live work is the section below, *"Filed since that agreement"* — where `B88`, `B89` and `B90` have
> also now shipped in v0.1.24, leaving the **command-namespace decision** (item 4) as the only
> sequenced item still open. Kept rather than deleted because it records *why* that order and what
> was excluded on evidence.

The two big roadmap Epics were **considered and excluded on evidence, not overlooked**: `M5.E12`
waits on `M5.E11` and `M5.E14`-in-full waits on `M5.E10`, and **neither has any artifact on disk**
(checked 2026-08-06). A checked-and-declined trigger must be distinguishable from an unchecked one
(`B39`).

### 1. ~~`B52` — the session binds to a stale plugin cache~~ · **DONE, v0.1.20 (2026-08-06)**

**Shipped in the fix lane, both halves.** `tools/lib/plugin-binding.js` + a SessionStart hook + wiring into `/sig:status` and `/sig:resume`; plus the `setCurrentEpic` guard. **Item 2 is now the next work.**

**Two things the build learned that this entry did not know:**

1. **A hook-only fix would have been the band-aid.** The binding is resolved *before* `SessionStart` runs, so a mid-session auto-update — the originating 78-second sighting — is structurally invisible to a hook. The command path (`/sig:status`, `/sig:resume`) re-reads both files at the moment of use, which is the only moment that can observe it. Both surfaces ship; neither is sufficient alone.
2. **The ledger loss was never only a stale-cache consequence.** Two of the three branches that zero an unarchived phase log are reachable with no stale cache at all (a linear project opening its first Epic; a non-strict `current_epic` like `PHASE11`). The entry's framing — *"the guard makes the damage loud regardless of version"* — turned out to be more literally true than it read.

`B84` was filed from this release's own cut: `cut-release.js`'s no-release-notes guard is unreachable and relabelled a historical section instead of refusing. Not folded in — it is a separate defect in a separate tool.

<details><summary>Original entry (kept for the reasoning that set the order)</summary>

### `B52` — the session binds to a stale plugin cache · **fix lane** · small

*Plain: stop the tool lying about which version of itself is running.*

**Trigger satisfied** — three sightings in six days, and **five hits in one session** on 2026-08-04,
where every command of the M5.E18 build ran `0.1.16` while `0.1.17` was installed and both REVIEW
passes were handed a superseded decision document. One earlier sighting **silently destroyed a phase
ledger**.

**Why first.** A stale binding makes a fixed bug look live and a live bug look fixed, so it corrupts
the evidence every other item on this list depends on. Doing items 2 and 3 first means doing them on
that footing. It is also the cheapest of the three: the pieces are already on disk (the hook runs
from the bound path; each cached copy carries its own `plugin.json` version; `installed_plugins.json`
records what *should* run and was correct in all three sightings). Two file reads, offline,
deterministic, fail-open.

**Do not skip the second half:** the `setCurrentEpic` guard that refuses to reset a non-empty
`completed_phases` it did not archive. The warning makes the *cause* visible; the guard makes the
*damage* loud regardless of version, and it is the half that would have saved M5.E8's ledger. A
warning alone leaves the silent-data-loss path intact.

</details>

### 2. ~~The closure-gated archive command~~ · **DONE — `v0.1.22` (`M5.E19`), 2026-08-07** · `B82` shipped in `v0.1.21`

*Plain: finish the archiving tool, because the thing it replaced is gone.*

**▶ TWO CORRECTIONS from `M5.E19`'s own research (2026-08-07), both found by running the code
rather than reading this entry.** Left in place rather than rewritten, because the entry's error is
the useful part.

1. **`B82` is DONE** — shipped in the fix lane as part of `v0.1.21` (#98), not folded into the Epic.
   A live data-integrity defect should not wait on six phases. Measured across 12 local projects:
   **3 split units / 6 stranded files → 0 / 0.**
2. **"M5.E18 built the engine and wired none of it" is WRONG.** That sentence quotes M5.E18's retro
   — but the retro is describing what it found **mid-Epic**, and its wave 6 fixed it. The release's
   headline *114 files across 6 projects* **is** the delivery. Verified by execution:
   `applyArchiveTree({apply:true})` is reachable from `/sig:migrate-memory` behind
   `if (archiveMoveMap.size > 0)`, **ungated by layout version**. The closure **gate** also already
   exists — `senseArchiveTree`'s retro ∪ verdict union is default-deny. The `resolveClosures` call
   at `migrate-memory.js:1975` is **narration**, not gating, and its own comment says so.
   **The word "wired" hid the difference between *called* and *load-bearing*.** `D-M5E19-6`.

**So the real gap is narrower than this entry claimed, and still worth building:** archiving works,
but it has **no command of its own** — it happens inside a document-*layout* reorganizer, so filing
away finished work means running a command about something else and reading past half its output.
Brett, 2026-08-07: *"YES — definitely want sig:archive."* Named per
[`../references/command-taxonomy.md`](../references/command-taxonomy.md) (`D-M5E19-8`).

**Trigger FIRED 2026-08-04** — `curator` was removed from the machine; `eval-project-A` and
`eval-project-D` archive by hand-written runbook **today**. This is the only item with users
waiting.

**M5.E18 built the hard half and wired none of it** — its own retro: *"the library could do 110;
nothing wired it."* This is the wiring.

**`B82` is in scope, not separate** (P2): `planArchiveMoves` rebuilds candidate names from a template
instead of consuming `deriveUnits`, so it **archives half a unit** — the two functions disagree about
which files belong together, and a unit ends up split across `.planning/` and `.planning/archive/`.
Shipping the command over that defect ships the split.

**The bar, set by how curator failed:** it matched filenames and never checked whether the work was
finished, and its only protection was a hand-maintained list you had to update *before* writing a
file. It proposed archiving the same four **live** units twice. The 2026-08-01 remedy was a printed
warning and it failed the way warnings fail. **A warning asks; a gate refuses.**

### 3. ~~`M5.E14`'s shippable slice only~~ · **DONE — `v0.1.24`, 2026-08-09** · *not the tracker Epic*

**Shipped in the fix lane.** The `discharged` marker (`discharged` / `discharged_by` / `discharged_at` on `backfill_warnings`, with a bare string still meaning open so nothing migrates) plus `readOpenObligations` wired into `/sig:ship`'s pre-ship checklist. **Reports, never halts** — Brett's call, and the opposite of the `B88` branch gate in the same release: that one asks *"did you follow the process?"* (one right answer); this asks *"is anything outstanding?"*, where shipping anyway is often correct.

**What the slice did NOT do, stated so nothing reads it as closed:** `dischargeObligation` exists and **is called by nothing**. Only a maintainer invoking the library function by hand can set a marker. Wiring discharge into the phase gates is the Epic's second load-bearing condition and stays with the Epic.

**Two things the build learned:**

1. **The parser shipped a false *"still owed"* and the corpus proved it.** `parseEscalationHistory` latched its "inside a warnings list" flag past the end of an entry, so a **second** escalation's `- from_tier: FULL` became a phantom open obligation — specimen #4 **inverted**, inside the fix for specimen #4. Measured read-only across 12 projects: **3 phantoms → 0**, in `eval-project-D`, `eval-project-A`, `eval-project-A-codex-review`. **Signal's own tree read 0 both ways** (its `escalation_history` is empty), so this is `B82`'s shape again — dogfooding was structurally blind and only the real corpus could see it.
2. **The named-source registry has exactly one resolver and no placeholder for the tracker.** A declared-but-unimplemented source would be the unreached-mechanism defect this release is named after. Adding GitHub Issues later is registering a resolver (`D-M5E14-1`).

<details><summary>Original entry (kept for the reasoning that set the order)</summary>

*Plain: make "is this actually done?" answerable.*

**Take the carve-out, not the Epic.** `M5.E14`'s trigger (`M5.E10` lands) is **unmet**, but the entry
explicitly allows one piece to ship ahead as a patch: the **`discharged` status marker** on
`backfill_warnings` plus a **SHIP-gate open-obligations query** behind a capability check (`gh`
present and authed; silent, logged skip otherwise). That is also the schema fix that ends the false
*"still owed"* class for tracker-less projects.

**Live evidence it is needed, from v0.1.19's own ship:** `B55` and `B80` — the two bugs that release
was *about* — still read `confirmed` for hours after shipping, while `B83`, the bug the Epic stumbled
into, was filed correctly. Caught only because someone went looking for the next task. Status lives
in a hand-maintained table that nothing reconciles.

**Do NOT start the full tracker integration here.** Its two load-bearing conditions (single home;
closing wired into the phase gates) are Epic-shaped and its trigger is unmet.

</details>

---

## Filed since that agreement — **not yet sequenced**

Everything above is Brett's 2026-08-06 ordering. Everything below was filed
**after** it and has **not** been placed in that sequence — the priority call is his,
not the filer's. Kept separate so *"the agreed sequence"* keeps meaning what it says.

### ~~`B88` — Signal is branch-blind~~ · **DONE — `v0.1.24`, 2026-08-09**

**The product call was made** (Brett, 2026-08-08): all three remediation sites, **hard stop** with `--allow-default-branch` as the deliberate override, tier-gated to FEATURE + FULL. Full detail in `BUGS.md`. `B89` and `B90` also shipped in `v0.1.24`; **`B87` shipped ahead of them** in the same release.

<details><summary>Original entry (the product call it was waiting on)</summary>

### `B88` — Signal is branch-blind · **P1** · **needs a product call, then small**

*Plain: the workflow never puts you on a branch, and never notices you aren't on one.*

**Reported from `eval-project-A` 2026-08-08, verified here and broader than reported.** `grep -rln
"git branch --show-current|rev-parse --abbrev-ref" commands/ tools/lib/` returns **nothing** — not
one of 20 commands, not one library module. `execute.md` has **zero** occurrences of the word
"branch"; `ship.md` §3 says *"Create a pull request with:"* with no precondition that one is still
possible; the Exit Criteria is a **checkbox**, not a PR URL.

**Where it lives is the finding.** `ship.md:116` is the paragraph that *removed* the direct-to-main
exemption and states in prose that a change *"does need a branch, a PR, and a green suite"* — in a
file that supplies no mechanism and no check. **The file states the rule and still supplies no
enforcement**, which is exactly what `D-M5E17-5` was filed to end.

**The decision, not the code, is what's blocking.** Three candidate sites, not equivalent:

1. **Assert a non-default branch at `/sig:execute` entry** — earliest point that matters; a slice
   cannot *begin* on the default branch. **But the fix lane skips EXECUTE entirely**, so it covers
   one lane only.
2. **Halt at `/sig:ship` when `HEAD == default`** — `B48`'s remedy one level up: the code refuses
   instead of the text asking. **Covers both lanes**, and forces the conversation the reporter chose
   to have with a summary file instead.
3. **Read the Exit Criteria from a PR URL** — closes the claim-integrity half, but only after the
   fact.

**Recommended: (2) with (3)**, together small. (1) is worth adding later for the Epic lane.

**Live here today and masked only by habit** — every branch in the 2026-08-08 session existed
because `CLAUDE.md` says so and the operator remembered. Same *depends-on-remembering* mode as
`B87`.

</details>

### Command namespace — decide whether group 4 gets a prefix · **hygiene** · small-to-medium

*Plain: decide now, deliberately, whether commands get grouped names — before there are 30 of them.*

**Raised by Brett 2026-08-07** while approving `/sig:archive`: *"if every command is super different
and doesn't have any ontology (reflected in taxonomy) then feels like it gets more and more
confusing over time."* Correct, and the evidence was already on disk.

**The ontology existed; the taxonomy did not.** Five coherent groups were derived by reading
`commands/*.md` and are now written down in
[`../references/command-taxonomy.md`](../references/command-taxonomy.md) with a naming rule. **That
doc is the cheap half and it is done.** What remains is one decision it deliberately does not make.

**The open question:** should group 4 (document upkeep — `index`, `sweep`, `migrate-memory`,
`archive`) become `memory-*` or `docs-*`? The group already carries **two naming styles**
(`index`/`sweep` are bare verbs, `migrate-memory` is a compound), which is the drift Brett is
describing.

**Why it was NOT folded into `/sig:archive`.** Adding `memory-archive` while `index` and `sweep`
stayed bare would introduce a **third** style into one group — the inconsistency without the
grouping. Either convert the group wholesale or keep the convention; half-migrating is the worst of
the three. `D-M5E19-8`.

**What makes it non-trivial:** a rename is **user-visible and breaking**. It needs deprecation
aliases, a `[BREAKING]` CHANGELOG entry, a minor bump (`0.2.0` — pre-1.0 allows it), and a pass over
every doc that names a command. `install-contract.test.js` and the roster-count checks will both
have opinions.

**Why it should not sit indefinitely:** pre-1.0 with a small user base is when this is cheapest, and
it only gets more expensive per command added. Treat *"later"* as *"the next naming-shaped thing,"*
not *"someday."*


### ~~Write down which tool new work goes into — Signal or prose~~ · **DONE 2026-08-14** · `D-BR0814-1`

**Shipped in the fix lane.** The rule below is now stated in `CLAUDE.md` § *Signal or prose* (the
surface a fresh session reads) and recorded as `D-BR0814-1` in `DECISIONS.md` (the record). Entry
kept for the reasoning that produced it. **What the decision deliberately does not settle:** whether
the plugins ever combine, and whether any specific prose capability gets ported — the *"actually
fine" / considered-and-not-flagged* row below is still open and is a separate call.

*Plain: one rule so this question stops getting re-argued.*

**Nothing anywhere says.** Grepped `.planning/`, `analysis/` and `CLAUDE.md` on 2026-08-08: every
hit for "prose" is the English word (*de-prose*, *self-attested prose*). There is **no decision,
note, or plan** about the `/prose:` plugin — it was never declined, it was never written down. So
the question gets re-derived from scratch every time it comes up, which it did today.

**The rule to write:**

> If it looks at the work you are doing **right now** — the change in progress, the slice, the
> phase — it belongs in **Signal**.
> If it looks at the **whole codebase, whenever you ask** — no phase, no `.planning/` required — it
> belongs in **prose**.

Plus one line recording that prose is separate *on purpose*, so it can run in any repo without
Signal's state files.

**Why it is worth writing rather than remembering:** `/prose:audit` and Signal's
`agents/specialists/security-auditor.md` already cover the same ground at different scopes, and one
person maintains both. Without a stated rule the overlap grows by accident.

**Home:** a short section in `CLAUDE.md` (where a fresh session reads it) plus a `D-` entry.

### Adopt prose's "actually fine" rule into Signal's own reports · **hygiene** · small

*Plain: make every report say what it looked at and deliberately did NOT flag.*

**Verified missing 2026-08-08.** `grep -rin "actually fine|deliberately not flag|exclusion" agents/
skills/review/` returns **nothing** relevant — the only hits are `grep` exclusions in
`quality-scanner.md`. Signal's `code-reviewer`, `security-auditor` and `test-engineer` have no
requirement to report what they considered and cleared.

**Prose requires it of every report**, and its README states the reasoning: *a findings list with no
exclusions is a warning sign — it means real issues weren't separated from things that merely look
off.*

**This is Signal's own principle, unenforced.** *"Checked and clean must never read like could not
check"* is `B39`, the whole of `M5.E16`, and the archive report shipped in `v0.1.22`. Signal enforces
it at **three specific sites** and nowhere as a **rule**. Prose arrived at the same idea
independently and states it once, generally.

**Scope:** a required "Considered and not flagged" section for the REVIEW specialists and the
report-producing commands. **Note the interaction with `review_depth`** — under `quality-only` only
Step 1 runs, so the requirement must attach to whichever steps actually execute, or it becomes a
rule that silently does not apply (`M5.E16`'s carried finding).

**Not a merge.** Borrowing the discipline is Signal's stated model (*"integration of existing
frameworks, not reinvention"*); it settles nothing about whether the plugins combine.


### Re-aim on "the unreached mechanism" — the class behind `B87`–`B90` · **roadmap** · medium

*Plain: four bugs in one day were the same bug. Fix the pattern, not the four.*

Analysis: [`../analysis/UNREACHED-MECHANISM-ANALYSIS.md`](../analysis/UNREACHED-MECHANISM-ANALYSIS.md).

**The shape:** a mechanism exists, is correct, and is never reached — because reaching it depends on
a person remembering and nothing observes whether they did. `B87` (phase ledger), `B88` (branch),
`B89` (drain), `B90` (per-unit tier) are all one defect wearing four hats.

**Why it needs a decision rather than four fixes.** Signal's standard remedy for *"the rule wasn't
followed"* has been to **write the rule more carefully** — and `B75` already measured that ceiling:
`gate_strictness` `light` and `strict` **differ by one boolean in code; every other difference is
prose.** More prose does not move that number. The durable remedies are: make the rule executable or
delete it (`B48`'s model — refusal beats instruction); put the check where the *situation* is, not
where the *topic* is; and file these as *unreached*, not *absent*, because that turns **build** into
**wire**.

**The cheap first move, and it is a measurement, not a build:** classify the 30 `confirmed` rows in
`BUGS.md` into *exists-but-unreached* / *absent* / *wrong*. If the first bucket dominates, the
roadmap should be re-aimed at wiring. ~~**That count has not been run**~~ — **RUN 2026-08-14
(Brett's call). The stated decision rule was NOT satisfied: unreached leads at 10 of 25 (40%), a
plurality, not a majority** (`absent` 8, `wrong` 7). Full table, classification rule, and limits:
[`../analysis/UNREACHED-MECHANISM-ANALYSIS.md`](../analysis/UNREACHED-MECHANISM-ANALYSIS.md)
§ *The count, run*.

**Three findings the count produced that this entry did not anticipate**, and the second is the one
that should drive sequencing:

1. **The count is rule-sensitive.** Writing the unreached/absent boundary down moved two rows and
   swung the split 20%. The rule ships with the number.
2. **Collapsing *unreached* + *wrong* gives 17 of 25 (68%) — "a mechanism exists and does not do its
   job"** vs. 8 (32%) that need building. That reading *does* argue for re-aiming at existing
   mechanisms, but it is a **different claim** than this entry made, and 7 of those 17 are the
   sibling class (`B39` — a mechanism silent about its own limits), not this one. **A roadmap aimed
   only at wiring leaves all seven.**
3. **The sample is biased against the hypothesis:** `B87`–`B90`, the four instances that named the
   class, all shipped in `v0.1.24` and are therefore outside a `confirmed`-only denominator. The
   count measures what is **left**, not what the repo **produces**. A pass over all 95 triaged rows
   would answer the intended question; not run.

**Byproduct:** `B38` reads `confirmed` and shipped in `v0.1.25` — a stale status found by measuring
the file, and one more instance for `M5.E14`'s uncalled `dischargeObligation`.

**The uncomfortable input:** three of the four came from **outside** Signal's own use.
Signal-on-Signal is driven by an operator who already knows where every mechanism is, so it is
structurally poor at finding this class — the same blindness `B82` proved by construction and
`M5.E16` measured (Signal's own `.planning/` shape is the *minority* shape).

### Three items from the autonomy-counterweight analysis *(filed 2026-08-08, all accepted by Brett the same day)*

Source: [`../analysis/AUTONOMY-COUNTERWEIGHT.md`](../analysis/AUTONOMY-COUNTERWEIGHT.md) — Signal's
loop-engineering plan compared against an external workflow guide whose central case is a team that
stopped reading its own code and lost the ability to diagnose its own system. Two amendments to
`LOOP-ENGINEERING-ANALYSIS.md` were applied immediately (the `diff`/`diffstat` contradiction; the
success metric, which as written scored its best result on that exact failure). These three are the
build work that came out of it. **None is sequenced — the priority call is Brett's.**

**A binding constraint on all three, from that analysis §5.3:** the source guide is entirely honor
system, and its author's own team abandoned its most important rule for a month without noticing.
**Adopt these as gates or not at all.** Landing any of them as a paragraph in a command file
reproduces the unreached-mechanism class named directly above.

#### `.planning/ENVIRONMENT.md` — the environment the agent can't see · **small** · *roadmap*

*Plain: write down the things about this project that aren't in the code.*

External services, configuration-variable **names** (never values), test accounts, support channels,
deploy targets. Drafted at `/sig:init` — the four scanners already detect stack, CI, and quality
signals — plus one `/sig:calibrate` question for what a scanner cannot see.

**Why this one first among the three.** `analysis/AGENT-EFFECTIVENESS-ALIGNMENT.md` names
**environment readiness** as Signal's absent axis and blocks it on a permission model
(`/sig:permissions`). **Half of it is not blocked on anything** — it is a markdown file. An
independent source arriving at the same absent axis and supplying the unblocked half is the
strongest evidence in that analysis for building something. Useful attended; a **prerequisite** for
unattended, where it converts a halt into a lookup.

*Watch the obvious footgun:* a file of variable names is one careless edit from a file of variable
values. The write path needs the same sensitive-data scrub `/sig:add` already runs.

#### The measurable-outcome question in DISCUSS · **small** · *roadmap*

*Plain: ask "how will we know this worked?" before building.*

Tier-gated — FULL and FEATURE ask, SKETCH and SPIKE do not. Signal's REQUIREMENTS carry
stranger-verifiable acceptance criteria, which is a **completion** oracle; this is an **outcome**
oracle, and the two are not the same. The argument for it is that without one, the agent makes
product decisions by default — the same concern as the standing *"gate at product altitude"* norm,
stated as an input rather than as an interrupt.

**The design constraint is the whole difficulty.** For infrastructure and tooling work an outcome
metric frequently does not exist, so the gate **must** accept *"no outcome metric, and here's why"*
as a valid, recorded answer. A gate that cannot be satisfied honestly becomes a gate that gets
rationalized past — which is the failure the anti-rationalization tables exist to prevent, arriving
by way of the mechanism meant to prevent it.

#### Cross-model review at REVIEW — **scope it, don't build it yet** · **question first** · *roadmap*

*Plain: have a different AI check the first one's work.*

`FM-1` of the loop analysis correctly names claim integrity as autonomy's central risk, and its
countermeasure is adversarial verification with *fresh context*. Fresh context removes the writer's
**conversation**; it does not remove the writer's **priors**. The evidence in FM-1's own paragraph is
that every major catch in this project came from *a human reading documents against each other* —
two different readers, not one reader twice.

**Verified 2026-08-08: no agent in `agents/` pins `model:` in frontmatter**, so this is new
machinery either way. Two very different scopes, and the entry exists to force the choice before any
build:

- **Cross-tier** (a different-strength model, same family) — reachable: frontmatter plus a decision
  about which agent gets it.
- **Cross-vendor** (write with Claude, review with Codex) — **Signal cannot assume this.** It depends
  on a plugin the user may not have installed, so it is a capability-checked optional path at best,
  and a broken promise at worst. `/sig:doctor`'s capability-detection idiom is the precedent.

Fold whichever is chosen into FM-1's existing countermeasure. **Do not add a phase step.**

#### The entry price for *any* Phase A autonomy work: `B73`–`B76` · **agreed 2026-08-08**

Not a new item — a **precondition**, recorded here because this file is the queue. All four were
filed by the loop-engineering gate audit on 2026-08-03 and all four still read `confirmed`. The loop
plan's own Phase A step 1 lists them, and step 1's own note says they are *"worth doing even if loop
engineering never ships — they are documented-vs-enforced gaps today."*

`B76` is the one that is not merely untidy: **REVIEW's FAIL path is a bare "return to EXECUTE" with
no user ask and no loop ceiling**, where VERIFY's equivalent asks via the 3-options pattern and stops
after three. Attended, that asymmetry is tolerable and `M5.E16` lived through one loop-back in the
field. **Unattended, it is a loop that does not stop** — and any driver built on top inherits it on
day one. Brett, 2026-08-08: *"agreed."*

---

### Twelve promoted from the inbox drain *(2026-08-10, `D-BR0810-1` … `D-BR0810-3`)*

Filed by the 52-entry inbox drain. Each had **no row anywhere** — several name a proposed home in
their own text that was never written down, which is why they sat un-sequenced for months while
reading as decided. Ordered small-to-large; **not** placed in the agreed sequence.

#### Trajectory scoring — score whole runs, not single instructions · **roadmap** · medium · **UNPARKED 2026-08-10**

*Plain: measure whether a whole piece of work went well, not just whether one instruction was obeyed.*

**Its trigger fired and its blocker dissolved, and the second is the reason this is unparked.** The
trigger — *"`M5.E8` lands and instruction-adherence measurement is repeatable"* — was met when
`M5.E15` gave the canary a real control arm and published a verdict that means what it says. But the
entry was parked on a *supply* problem, inherited from its sibling: **"four users will show nothing
for a long while."**

**Brett, 2026-08-10: use the dozens of local projects as the initial data feed** (`D-BR0810-1`). That
replaces the blocked input with one that exists today — 12+ real corpora already used as the
measurement substrate for `B82`, `B88` and `B90`, all of which produced findings Signal's own tree
structurally could not. The caution was about *external* users; it was never about *runs*.

**Carry forward the method the entry already banked**, from the study's appendix: qualitative review
of the best and worst tails → rubrics written as **observable** criteria → any dimension that cannot
be operationalized is **dropped** → automated scoring validated against blind human ratings. The
observable-or-dropped rule is the load-bearing half.

*Done-when:* a trajectory from the local corpus is scored on published, observable criteria, and a
dimension that could not be operationalized is recorded as dropped rather than fudged.

#### `STATE.md`'s narrative vs. its frontmatter · **hygiene** · small · **FOLDED INTO `M5.E10`**

*Plain: the machine-written half of the status file is right and the hand-written half beside it is often wrong.*

**Folded into `M5.E10` by Brett's call, 2026-08-10** (`D-BR0810-2`) rather than built as a standalone
deterministic check — it is a prose-vs-frontmatter comparison, which is that Epic's territory.

**Four instances, and the fourth is the argument.** The `In-flight` section has gone stale four
times; the third was *written as the correction to the second* and falsified by the next state write;
the fourth was falsified by a full phase sequence — four `transitionPhase` calls — **while the author
was filing `B87` about the record disagreeing with the work.** A hand-maintained narrative beside a
machine-written frontmatter goes stale **by construction**, not by neglect.

**`runDriftChecks` reported 6/6 clean across every instance**, and correctly: `body-omits-current-epic`
tests `mentioned.has(epic)` — presence, not agreement — and `phase-behind-artifacts` never reads the
prose. Two honest checks with a gap between them.

*Done-when:* a body that names the right Epic in the wrong phase is caught. **Sibling of `B87`** —
the ledger missing a phase that ran, vs. the narrative describing a phase already passed; a fix for
one should be weighed against the other.

#### ~~Blast radius and rollback — asked by no phase~~ · **DONE 2026-08-14**

**Shipped in the fix lane, both halves, as the done-when specified.** `commands/ship.md` §1 carries a
**Rollback stated** checklist line; `commands/discuss.md` §6 asks the blast-radius question at FULL
and FEATURE and skips it at SPIKE and SKETCH. **One deliberate shaping choice, made against this
entry's neighbours:** both lines state that the easy honest answer — *"revert the commit"*, *"nothing
downstream"* — **satisfies** them. The `#### The measurable-outcome question in DISCUSS` row two
items down names the failure this avoids: a gate that cannot be satisfied honestly is a gate that
gets rationalized past. Entry kept for the evidence that these were absent.

*Plain: nothing ever asks what a change touches, or how you would undo it.*

The knowledge is already in four skills (`incremental-implementation` feature flags + rollback-friendly,
`ci-cd-and-automation` rollback plan, `shipping-and-launch` canary). **No phase asks the question.**
DISCUSS's production-readiness row covers probes, shutdown, logging, headers, rate limiting; SHIP's
checklist covers secrets, env vars, README, CHANGELOG, tests, build, linter — neither has a rollback line.

**Not already covered by calibration:** `reversibility` is one of the five calibrate questions, but it
tiers the *project*. Per-change blast radius is a different altitude and nothing asks it.

*Done-when:* the SHIP checklist carries a rollback line and DISCUSS asks the blast-radius question at
FEATURE and FULL. Two lines of markdown.

#### Spec-internal consistency — a plan that contradicts itself · **hygiene** · small

*Plain: check that a plan's own numbers can satisfy its own acceptance criteria.*

`M4.5.E9` shipped a task whose stated threshold formula could not satisfy the acceptance criterion
stated in the same task. **The 8-dimension validation pass cannot catch this class** — it audits goal
alignment, completeness, dependency, testability, scope, context, risk and vertical slicing, none of
which compare a plan's stated formula against a plan's stated criterion.

*Done-when:* a validation pass on a plan carrying a quantitative threshold walks the matching
criterion and states whether the formula's output satisfies it. **Cheap because it is scoped:** only
tasks with a number in them.

#### The dry-run gate, written down as a pattern · **hygiene** · small

*Plain: "show me what you'd change before you change it" is house style; say so out loud.*

Two of two Epics that used it caught real bugs that would otherwise have shipped (`M4.5.E6` D15 on a
live STATE.md; `M4.5.E9` S1.t10, which caught two — a `git log --grep` matching commit bodies, and
link paths resolving one directory too high — before they propagated to five committed files).

**It has since become practice without ever being written as a rule:** `/sig:migrate-memory` and
`/sig:archive` are both dry-run-by-default (`D-M5E19-5`). The gap is that a *pattern nobody wrote down*
is applied when someone remembers it — the shape `B90` and `B87` share.

*Done-when:* `references/` names the pattern, and PLAN inserts a dry-run task ahead of any task that
writes to existing user state.

#### Resume-time retro nudge · **hygiene** · small

*Plain: warn earlier when you are parked at ship with no retrospective, instead of hard-stopping later.*

Descoped from `M5.E5`/`B26` as the executor's Option 2. The `B26` fix applies at SHIP-time only, so it
is a no-op inside `detectDirtyExecute`, which is guarded on `phase === 'EXECUTE'` (`retrospective.js:697`).
A hand-managed project sitting at `phase: SHIP` with no retro gets no early heads-up — Layer 1 still
hard-blocks at `/sig:ship`, so this is purely a friendlier, earlier warning.

*Slice:* broaden the phase guard to cover SHIP, thread `completed_phases` + `profile` through
`hooks/warn-dirty-execute.js`, reuse `isEpicCloseByState`. Advisory-only, touches hook JS.

#### Map drift-guard · **hygiene** · small

*Plain: make the suite fail when the diagram page falls behind the code.*

`docs/map/index.html` silently sat two releases behind — showed v0.1.3 while prod was v0.1.5, omitted
all 26 agents and 21 skills, and carried stale work-unit examples — because its refresh protocol is a
checklist line a human runs.

**A guard, not a regenerator.** Compare the map's listed commands/agents/skills and version stamp
against `commands/*.md`, `agents/**/*.md`, `skills/**/SKILL.md` and `plugin.json`; **fail** on roster
or version drift. The one-line summaries, flag curation, vocabulary examples, tiers and rigor matrix
stay hand-curated — it never auto-writes prose.

**Explicitly not a hook:** there is no "on version bump" event, and a per-commit git hook is the
Curator footgun (`DECISIONS` 2026-07-13).

*Done-when:* a PR that adds an agent without touching the map turns the suite red.

#### Config-drift hazard check before shipping · **roadmap** · medium

*Plain: catch a config key the code uses but nothing declares — and the stale alias left behind.*

**Origin is a real outage, not a hypothetical:** an env key renamed in code while an old-name alias
lingered in `.env`, `.env.example` and Vercel.

*Slice:* a deterministic, offline VERIFY pass reconciling keys the code references against keys
declared in `.env.example` / config templates — flagging **referenced-but-undeclared**,
**declared-but-unreferenced**, and **alias pairs**. Tier-gated: advisory at SKETCH, enforced at FULL.
Explicitly local and offline — **not** a live vendor-API check; deploy-target reconciliation stays the
project's own CI job, and SHIP gets a checklist line saying so.

**The wider question it opens, worth answering here rather than drifting:** should Signal carry a small
set of stack-aware universal pre-ship hazard checks? Config drift is the ideal first one — high value,
low stack-specificity, deterministic. *Open for PLAN:* JS/`.env` only first, or a small pluggable
key-extractor set.

#### Task-handoff completeness — the research never reaches the builder · **roadmap** · medium

*Plain: Signal pays four agents to find the good examples, then hands the builder a task without them.*

Three leaks in one seam, all verified 2026-07-26:

1. `commands/plan.md:89-97` spawns a codebase researcher for *"existing patterns, reusable code,
   integration points"* and writes `{phase}-RESEARCH.md`. `agents/executors/executor.md:17-21` declares
   its inputs as the PLAN task, `CONTEXT.md` and `{phase}-VALIDATION.md` — **RESEARCH.md is not among
   them**, and nothing in `commands/execute.md:58-65`'s dispatch injects it.
2. The planning skill has a **Files likely touched** field; `commands/plan.md:101-107`, the
   authoritative list of required plan contents, omits it. Skill and command disagree.
3. **No per-task out-of-scope field exists anywhere** — the executor's "every changed line traces to
   the acceptance criteria" is a discipline rule, not a named boundary.

*Done-when:* an executor dispatched on a task whose research names an exemplar follows it rather than
re-deriving the pattern, and a plan lacking the new fields fails the 8-dimension pass at scope discipline.

#### The contradiction sweep's live residual · **hygiene** · medium

*Plain: finish the last third of the document-vs-document cleanup, and stop writing live counts into prose.*

Eleven findings, triaged 2026-08-09: five fixed, three already dead, three merged into one root. **The
root is a labelling decision, not eleven edits** — nothing distinguishes a *release* delta from an *Epic*
delta, so two true facts published in identical shape read as a contradiction. `B56` already recommends
the release reading; adopt it rather than "correcting" either number. Residual also covers the `B41`
verdict restated across **7 live governance docs** (the rest are frozen Epic artifacts, correctly left
alone) and `CONTEXT.md`'s unlabelled "Open bug tail" enumeration.

**Demonstrated perishable, twice.** Three of the eleven resolved themselves within five days of capture.
And the finding that four documents cited a *"48-entry inbox"* against a live 52 **is wrong again as of
this drain** — 52 total, 38 dispositioned, 2 standing, 12 live. A point-in-time measurement published as
a live descriptor will always drift; **derive it or drop it.**

#### `/sig:permissions` — what Signal is allowed to do here · **roadmap** · large

*Plain: Signal has no way to say what it may run in a given project, so it may run nothing.*

**Read-only is not a principle Signal chose per project; it is hard-coded in two scanner files**
(`quality-scanner.md:209`, `stack-scanner.md:150` — both *"Never run `npm install`, `npm test`,
`pytest`"*). A permission model turns that default into a per-project setting.

**It is a bottleneck, not just an item.** Two filed items are blocked on it: the readiness scorecard's
seventh dimension (agent executability — five of its six inputs are *executions*, and scoring
executability you are not permitted to test produces exactly the false comfort that dimension exists to
prevent), and the environment-readiness baseline, which the external evidence rates as the largest
single effect on agent output.

*Open, none resolved:* where it lives (a `PROFILE.md` block vs. a separate file, since permission is a
property of the repo and operator rather than the work's complexity); its relationship to Claude Code's
own permission system — **needs a verify step against the current API before anything is designed**;
what the levels are (straw man: read-only → run declared read-only commands → write → commit → push);
and consent, since running an unknown project's suite can be slow, hit a live database, or cost money.

#### Loop engineering — split attention from rigor · **roadmap** · large · **M6**

*Plain: let Signal run longer without checking in, without lowering its standards.*

Full analysis in [`../analysis/LOOP-ENGINEERING-ANALYSIS.md`](../analysis/LOOP-ENGINEERING-ANALYSIS.md).
The audit found **~48–86 synchronous human touchpoints per FULL Epic**, most enforced only in prose, and
that `gate_strictness` already has an auto-advance mode **welded to tier** — so rigor and attention are
two dials sharing one knob.

*Proposal:* an `attention` axis (attended / checkpointed / unattended) orthogonal to tier; an async
decision queue with reversibility-weighted auto-adopt; a driver command; **PR-merge stays human**
(merge = delivery); parallel Epic lanes last.

**Three items already derive from this analysis and are filed above** (the autonomy-counterweight
cluster) — this is the parent idea, which had no row of its own. Brett wants to approach it soon;
`D-BR0809-2` puts the loop work in **M6**.

**Phase C is now a build-vs-adopt question, not a build question** *(2026-08-16)*. Phase C and all of
[`../analysis/LANES-IMPLEMENTATION-GUIDE.md`](../analysis/LANES-IMPLEMENTATION-GUIDE.md) propose
hand-building `/sig:dispatch`, `/sig:land`, a `LANES.md` registry, worktree lifecycle, `.landing.lock`
and a serial merge queue. **The runtime beneath Signal now ships part of that** — parallel and
pipelined agent fan-out, per-agent worktree isolation, schema-validated agent returns, a concurrency
cap, a token budget with a hard ceiling, resume-by-run-id. *Observed directly in a Claude Code session's
tool surface on 2026-08-16; the term "dynamic workflow" returns **zero** hits repo-wide, so Signal has
never recorded it.* [`../analysis/PI-OMP-PATTERNS.md`](../analysis/PI-OMP-PATTERNS.md)`:54` predicted
exactly this — *"some of what Signal adds as a methodology layer is migrating **down** into
harnesses… worth tracking"* — and
[`../analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md`](../analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md)`:105`
already caught the smaller half of it (*"worktree is now partly moot"*).

*Three constraints, and skipping them turns this from a finding into a mistake:*
- **Verify before designing.** One session's tool list is not the user's runtime. Signal ships to
  users, so this is a **capability-detection** question — precedent `/sig:doctor`, and the same
  verify-against-the-current-API precondition already attached to `/sig:permissions`. Nothing should
  be designed against it until that check is run.
- **The tool requires explicit user opt-in**, so a `/sig:` command cannot silently invoke it. That is
  a constraint on any design, and arguably a feature given the sequencing note below.
- **It does not make lanes moot.** A workflow run is **ephemeral and returns a value**; a lane is a
  **durable git branch with a human merge gate** (`D-M5E17-4`: merging *is* delivery). The runtime is
  a candidate substrate for the *dispatch / fan-out* half only. The *branch → land → reconcile →
  merge-queue* half stays Signal's, and it is the half the hard gate lives in.

*Done-when (this note only):* ~~the current plugin/tool API has been checked, and Phase C's scope says
which half Signal builds and which half it adopts.~~ **MET 2026-08-21 —
[`../analysis/PHASE-C-BUILD-VS-ADOPT.md`](../analysis/PHASE-C-BUILD-VS-ADOPT.md).**

**The check's answer is that there is no capability detection to check with.** A plugin cannot
declare a tool dependency, cannot query the session's tool roster, and has no minimum-version field;
the manifest's `dependencies` is plugin-to-plugin only. So detection exists at the **prompt** layer
(the model sees its own tools) and **not** at the **deterministic** layer (`tools/lib` cannot know) —
and Signal puts load-bearing checks in the deterministic layer *precisely because* the prompt layer
is measured-unreliable (`M5.E8`: **77.6%** of directive lines not trace-measurable). **Adoption may
make lanes faster; it must never be what makes them correct.**

**Scope, decided:** ADOPT the ephemeral fan-out half (parallel subagents, cap 20; `isolation:
worktree`). BUILD everything durable — `lane-guard` overlap + Ring 3 diff gate, the registry and
brief artifacts, the lane worktree lifecycle, `.landing.lock` and the merge queue. ⚠ **A documented
detail rules out the drop-in that prompted the re-check:** the runtime's worktree branches from the
**default branch, not parent `HEAD`**, while `/sig:dispatch` branches from the brief commit — not the
same object. ⚠ **Do not build detection on the environment**: docs name two exported variables, this
machine exports thirteen, neither set enumerates tools, and a surface that undercounts itself is not
a contract (`B52`'s precedent).

**Net: the Epic's hard half does not shrink.** The guide's honest minimum — *S2 + Ring 3 +
hand-written briefs* — is unchanged, because adoption touches only the convenience half. The runtime's
arrival was a reason to re-check and is **not** a reason to re-scope. *(Also corrected there: the
`/sig:permissions` precedent this note cites is an **unbuilt** command.)*

**The sequencing does not change** — parallelism still comes last (§5.4: it multiplies unaudited
output). `B76`'s loop ceiling, the stated entry price, was **paid 2026-08-21** (one release after
`/sig:drive` shipped and inherited the unbounded loop it predicted).

*Source: a July-2026 "graph engineering" explainer assessed against the loop plan on 2026-08-16. The
rest of that piece was **confirmation, not information** — its fan-out/verify/anchor material is
already `B39`, `FM-1` and `B88` here, its worktree answer is weaker than the lane manifest, and its
"when not to use a graph" list is the third independent source to need `/sig:calibrate`'s dial after
Marks's binary `auto` label and Horthy's pre-PMF exclusion. Its cost figures are third-hand and
fleet-scale; `FM-5`'s secondary ranking stands for Signal's audience, but the article is a fair
calibration input for **where the runaway budget cap in §5.3 is set**, which is currently unsized.*

#### Standing inbox entries are counted as undecided · **hygiene** · small

*Plain: two notes are meant to stay open forever, and the count can't tell them from unanswered ones.*

The trigger watchlist says *"never promote, merge, or delete"* and the QA sandbox says *"do not close
this entry"* — both correctly, and both therefore read as live drain candidates forever. **A
deliberately-permanent entry is indistinguishable from an unanswered one**, which is the same
can't-tell-checked-from-unchecked shape as `B39` and `B90`.

**Raised by Brett at the 2026-08-10 drain**, conditionally — *"fix if there is a reliable/recommended
fix"* — and filed rather than built, because the reliable fix is a **feature**, not a stamp: it changes
`parseEntries`' shape and `listDrainCandidates`' contract, both consumed by `commands/plan.md` and the
drain tests.

*Open design question, and it is the whole decision:* a new explicit marker (e.g. an HTML-comment
`<!-- standing -->`, the shape already used for the `backlog-key` dedupe markers) **or** widen the
existing `parseTriggerWatchlist`, which already special-cases exactly one of the two. **Do not ship
both** — two mechanisms for one concept is what this row exists to avoid.

*Done-when:* the drain reports standing entries separately from live candidates, and the count of live
candidates excludes them.


## Since the re-audit — what M5.E7 changed (reconciliation, 2026-07-26)

**The BR-8 re-audit ran and closed** (Epic **M5.E7**, 2026-07-25→26). Deliverable:
[`../analysis/SIGNAL-V2-ROADMAP.md`](../analysis/SIGNAL-V2-ROADMAP.md). It gave **45 candidates a
verb** — **11 distinct builds** (+1 re-homed = **12 work items landed below**), 16 continue,
19 abandon — and the sprint list below is reconciled against it.
**Where a sprint entry and the roadmap disagree, the roadmap governs.**

Four rows below were also **shipped and never marked** (this file's stamp predated M5.E6's
2026-07-25 release); they are struck in place.

> ⚠ **`B39` applies to every trigger in this file.** The trigger-watchlist walk it describes
> **has never run** — `ISSUES-INBOX.md:1407` instructs `/sig:plan` to walk the conditions at each
> drain, and `grep -ril "watchlist" commands/ tools/` returns nothing. **Until M5.E9 lands, a
> trigger here is a note, not an enforcement.**

---

## The v2 roadmap — M5.E8 → M5.E12 *(sequenced; the enforcement half of the re-audit)*

Every `build` from the roadmap, landed here with its **trigger** and **first slice** so it is
tracked by a live doc rather than by a document nothing checks. Full rationale and citations live in
[`../analysis/SIGNAL-V2-ROADMAP.md`](../analysis/SIGNAL-V2-ROADMAP.md) — **single home; not restated
here.**

### ~~M5.E8 — Measurement foundation~~ — **✅ SHIPPED v0.1.13 (2026-07-28)**

> **Struck 2026-08-09 (backlog-review triage).** This heading carried **no closure marker** and read
> `Trigger: NONE — unconditional next` while `:1108` of *this same file* said *"M5.E8 landed as
> v0.1.13."* One file, two answers about whether its own foundational Epic had shipped — and the
> unstruck heading is what a trigger walk reads. Retro:
> [`M5.E8-RETROSPECTIVE.md`](M5.E8-RETROSPECTIVE.md); status row: `MILESTONE-5.md:39`.
> **Its downstream gates are the live part:** it gates `M5.E10`, `M5.E12` and four parked items, and
> `M5.E10`'s trigger has therefore read **satisfied since 2026-07-28** with no work started — which
> is the subject of the disposition pass in
> [`BACKLOG-REVIEW-2026-08-09.md`](BACKLOG-REVIEW-2026-08-09.md) §1.

**Tag:** roadmap · **Trigger: NONE — unconditional next.** Gates M5.E10, E12, and four parked items.
The finding it answers: *Signal cannot detect whether its own interventions work, in any dimension*
(no test asserts a prompt instruction was obeyed; 7-of-12 adherence and a 7.12× output spread on
byte-identical code).
- **(a) Behavioral measurement.** *First slice:* one test on gstack's `carve-section-loading.test.ts`
  pattern (live model via the `claude -p` SDK) asserting a specific Signal command instruction is
  obeyed. *Done-when:* a stranger runs `npm test`, deletes that instruction line from the command
  markdown, re-runs, **and sees it fail.**
- **(b) Second-opinion replay** (reopened per D-M5E7-11). *First slice:* re-run REVIEW against the
  `B19` commit with a reviewer denied that Epic's own artifacts. *Done-when:* a one-page
  caught/not-caught result with the transcript.

### ~~M5.E9 — Overdue enforcement + the bug pile~~ · **DONE — v0.1.12, 2026-07-27**
**Tag:** hygiene · **Trigger: NONE.** Independent of E8 — can run in parallel.
- **`B39` trigger walk.** *Slice:* one drain step in `commands/plan.md` + `tools/lib/drain.js`.
  *Done-when:* a fired trigger surfaces at `/sig:plan`, **and a checked-and-declined trigger is
  distinguishable from an unchecked one.**
- **EXECUTE dispatch guidance + worktree isolation.** Demand cluster F, rank 1 — 4 retro items,
  **0 hits across all four ledgers**, live incident during M5.E7. *Slice:* the executor rule
  (`git add <path> && git commit`, never `--amend`) + `isolation: "worktree"` per concurrent agent.
  *Done-when:* a stranger reads `commands/execute.md` and can tell whether two tasks are safe to
  dispatch simultaneously.
- **SHIP-time ledger reconcile.** *Slice:* a hygiene test asserting `BUGS.md` holds no `confirmed`
  bug whose fix already shipped. *Done-when:* it fails on a planted violation.
- **The 14 open bugs** — `B32`–`B36` (`needs-triage`), `B37`–`B45` (`confirmed`). Required by
  D-M5E7-10; **verified 2026-07-26 that no bug-squash sprint existed anywhere.** ***Slice 1 = the
  v0.1.12 release** (ratified 2026-07-27, **D-M5E9-2** — this Epic opens ahead of M5.E8):* **`B42`
  first** (the only `P1`), then the `state.js:388-395` cluster as **one commit** (`B43`+`B44`+`B45`),
  then **`B41`** — in that order, plus **one end-to-end test of a linear-mode project with a
  multi-unit history**. `B36`, `B39` and the rest of this Epic are **later slices, not v0.1.12**.
  *Done-when (Slice 1):* `/sig:ship` completes on a project with `current_epic: null`, and a
  multi-unit `completed_phases` survives a `transitionPhase` call intact. *Done-when (Epic):* zero
  `confirmed` P1/P2 entries remain. **`B42`'s shape is settled — D-M5E9-1: the FR1 retrospective gate
  is Epic-only, and a linear-mode project owes no retro at SHIP.** The declined alternative (build a
  milestone-scoped retro path for linear projects now) stays open as its own later decision.
  **`B41` was cataloged by M5.E7 REVIEW (2026-07-26)** and belongs here rather than in M5.E8: four
  phase commands never call `transitionPhase`, so `completed_phases` omits PLAN/EXECUTE/VERIFY/REVIEW
  in any command-driven project while `markFresh` stamps the stale position fresh. **Deterministic and
  file-shaped — it needs no measurement layer**, which is exactly the rule §1 of the roadmap sets.
  **`B42`–`B45` were cataloged the same day from a live `eval-project-A` ship report.** `B42` stands alone:
  **linear mode is first-class in six phase commands and unsupported in the seventh** — `/sig:ship`'s
  FR1 gate hard-halts on `current_epic: null`, no bypass, **live since v0.1.3 and asserted by its own
  tests**, so the fix rescopes M4.5.E9's AC1-extended rather than patching a branch. `B43`/`B44`/`B45`
  are **three distinct defects stacked in the same seven lines** (`state.js:388-395`) and should land
  as one commit: it records the phase being *left* (so a SHIP date is unrecordable — SHIP is terminal),
  it applies set semantics to log data (silent collapse, no diff/warning/count), and it never validates
  existing entries (junk lines become permanent phantom phases). **The scope is wider than linear mode:**
  any project past its first unit hits `B44`/`B45`; Epic mode is spared only because `setCurrentEpic`
  zeroes the list on every roll. **`B41` must not land first** — wiring four more commands to
  `transitionPhase` multiplies the collapse sites. **None of these need a measurement layer.** Together
  they say the quiet part: **nothing exercises linear mode end-to-end**, nor a `completed_phases` longer
  than one unit — a coverage gap worth naming in the slice, since Signal-on-Signal has been Epic-mode
  since M4.5.E11 and structurally cannot see either.
- **Retro replay into the next Epic's DISCUSS/PLAN** → **kept in its Sprint 4 home**, sequenced here.
  Pointer rather than a copy (single-home). It shares `B39`'s shape — *a store exists and the reader
  was never built* — which is why it lands in this Epic and not in the abandoned Sprint-4 group.
- **⚠ The re-audit's own falsifier — a DATED check, not a trigger** *(added by M5.E7 REVIEW,
  2026-07-26)*. `SIGNAL-V2-ROADMAP.md` §6.1 answers the confirmation-bias charge against itself with
  one falsifier: *M5.E8 lands, measurement shows Signal's enforcement is as good as claimed, and the
  parked ports still never happen — if that occurs, the reframe was decorative.* **It cannot ride a
  trigger: "the ports still never happen" is a null result, and nothing fires on nothing** — the
  failure class this file already documents twice (the synthesizer-validator trigger, closed only
  because someone deliberately checked it; the GitHub-Issues trigger, which fired 2026-07-15 and
  promoted nothing). *Check by:* **2026-10-26** — three months. *Done-when:* a written verdict, one
  of *(i)* ports promoted on measurement, *(ii)* re-parked with a **new date**, or *(iii)* **the
  reframe is recorded as decorative and the roadmap is re-run.** Silence past the date is verdict
  *(iii)* by default. **Date is Brett's to move; letting it lapse unobserved is the one outcome the
  falsifier exists to prevent.** *This is also the canonical instance of the `B39` fix's second
  half — a checked-and-declined condition must be distinguishable from an unchecked one.*

### ~~▶ M5.E10 — Review hardening · **NEXT (confirmed 2026-08-09, `D-BR0809-1`)**~~ · **DONE — v0.1.25, 2026-08-13**

> ⚠ **CORRECTED 2026-08-13, at this Epic's own REVIEW.** Four sub-bullets below read
> ***"✅ DISCHARGED — `v0.1.23` (M5.E10), 2026-08-12"***. **Both halves were false.** `v0.1.23`
> shipped **2026-08-08** and its content was `B85` (`/sig:update` naming a command that works) —
> a release that *predates* the work these lines claim it carried. And nothing here is discharged,
> because `M5.E10` **has not shipped**; it is at REVIEW, and it will ship as **`v0.1.25`**.
>
> They were written mid-EXECUTE, from the shape of the work — *the slice is done, so write it down as
> released* — which is the exact class this Epic exists to kill, in this Epic's own queue entry.
> **Nothing caught it**: the `backlog-discharge` check `M5.E10` itself shipped reads **headings**, and
> these are sub-bullets, so the tool built to find this could not see it. That limit is now stated in
> `M5.E10-REVIEW.md` rather than left to be discovered.


> **Dispositioned, not merely scheduled.** This Epic had a satisfied trigger and **no artifact on
> disk** for six weeks while six unplanned Epics shipped past it — two recording the override in
> their own status rows (*"ran ahead of E10–E12"*). Six legal deferrals of one item is
> indistinguishable from a silent cut, which is what `B39` exists to prevent. **Confirmed next**
> because its evidence compounded during the very review that dispositioned it: three fresh
> claim-integrity instances in one session (`BUGS.md`'s tally wrong in two cells while its own
> narrative named the cause; `B91`; and the review's own unverified *"three of five figures"*
> claim), none caught by any existing mechanism.
>
> **Shipping this closes Milestone 5** (`D-BR0809-2`). Sibling dispositions: `M5.E11` kept, first
> slice only, sequenced behind this; `M5.E12` parked unchanged.

**Tag:** roadmap · **Trigger: M5.E8 lands** (both halves are partly prompt-shaped; E8 is what makes
"did it help?" answerable). **Trigger satisfied 2026-07-28.** **Scope widened 2026-07-28** by the
claim-integrity investigation ([`../analysis/CLAIM-INTEGRITY-ANALYSIS.md`](../analysis/CLAIM-INTEGRITY-ANALYSIS.md))
— the false-green audit's target class now has a name and field evidence: **completeness claims
written from the shape of the work rather than from the artifact** (five instances in one FULL-tier
eval-project-C phase, every catch incidental; ≥7 prior un-abstracted sightings in Signal's own
corpus). Principle for every item below: *a completeness claim must be derived, checked, or labeled
unverified — never asserted from memory* (the `buildCaveats()` lesson, generalized).
- **False-green audit + RED-against-`main`.** *Done-when:* every guard fix in the following Epic
  ships with a test demonstrated to fail against `main`.
- **`B38` — reclassify every anti-rationalization table entry** **✅ SHIPPED in `v0.1.25` (`M5.E10`), 2026-08-13.** Shipped: 109 entries classified (93 discipline / 16 shaping), `references/anti-rationalization-forms.md` generated from the corpus and pinned both ways, provenance rule added as a shaping entry. as *discipline* (keep the
  prohibition form) or *shaping* (convert to a positive recipe). *Done-when:* a one-page table
  names each entry's class and every shaping entry is a positive recipe. **Add as a shaping
  entry:** the claim-provenance rule — never restate or escalate an upstream claim about a third
  artifact without opening that artifact (CLAIM-INTEGRITY §6 item 6).
- **Requirement-coverage diff** **✅ SHIPPED in `v0.1.25` (`M5.E10`), 2026-08-13.** Shipped: `tools/lib/requirement-coverage.js` + `tools/lib/validation-consistency.js`, wired into `commands/verify.md` §1b. **Read the done-when critically — it is not met as written:** the field pair has no unit-scoped REQUIREMENTS artifact, so `AC1.6`/`D-M5E10-6` changed the contract, and the amended copy does not pass a full diff. See `M5.E10-PROGRESS.md`. (CLAIM-INTEGRITY §6 item 1) — deterministic `tools/lib` check +
  `verify.md` instruction: every FR/NFR/AC ID in `REQUIREMENTS.md` must appear in the VERIFICATION
  artifact (absent = red), plus an intra-file VALIDATION consistency check (dimension-2 assignments
  and Nyquist-map rows must agree — Phase 11's root was a single-file self-contradiction nothing
  read). *Done-when:* replaying eval-project-C Phase 11's artifact pair fails both checks and the
  amended pair passes.
- **VERIFICATION template: denominator table + required "what this could not establish" section** **✅ SHIPPED in `v0.1.25` (`M5.E10`), 2026-08-13.** Shipped: `references/verification-template.md` + `tools/lib/verification-template.js`, gate wired into `commands/verify.md` §5 and its exit criteria. Present-but-vacuous fails, not just present-but-empty.
  (§6 item 2; absorbs the ISSUES-INBOX self-critique entry and AGENT-EFFECTIVENESS Rec 3).
  *Done-when:* an artifact missing the section or the table fails the phase gate. Structural only —
  works **paired with the diff above**, never instead of it.
- **REVIEW claims-audit** (§6 item 3) — ⚠ **NOT BUILT. Deliberately deferred out of `M5.E10` by
  `D-M5E10-1`, and still open.** This is the **semantic** half of claim integrity, and nothing
  shipped in `v0.1.23` covers it. Implement the faithfulness backstop that `ship.md` §5.5 and the
  `evict.js` header already assign to REVIEW: every coverage/status/completeness claim in
  VERIFICATION and prior-phase artifacts verified against its source (the adversarial
  `docs-verifier` design has been parked in ISSUES-INBOX since 2026-05-12). *Done-when:* a fixture
  VERIFICATION with a seeded false claim is caught by the step.

  **What the deterministic half cannot see, stated so the gap has a shape.** `M5.E10` shipped checks
  that compare *tokens* — requirement IDs present or absent, sections present or empty, a line
  retracting itself. **A VERIFICATION naming every requirement, with a denominator, whose evidence
  column is wrong about what the tests actually assert, passes every one of them.** The claims in a
  document are only checkable against the thing they describe, and no regular expression opens that
  thing. `AC0.1` exists so this sentence is somewhere a reader lands, rather than inferred from
  silence.

  **A second candidate mechanism, alongside the judge: make the agent's return a contract, not a
  template** *(2026-08-16)*. Signal's agents define output as a **markdown skeleton they are asked to
  fill in** — verified at `plugin/agents/verifiers/verifier.md:30` (*"## Output Format"* → a fenced
  template) and `plugin/agents/verifiers/plan-checker.md:35`. **Nothing validates the return shape**,
  so a report can omit the denominator, drop the verdict line, or render the table as prose, and the
  deterministic checks then parse whatever arrived. A schema-validated return moves some claims out of
  *prose-a-checker-must-parse* and into *a field that exists or does not*. **It does not solve
  faithfulness** — a schema cannot tell you the evidence supports the claim — so this is a
  complement to the judge, never a substitute for it.

  *Two limits, stated so it is not oversold:* (1) Signal's artifacts are **files, not return values**,
  and deliberately so — the artifact *is* the record, readable months later. Any design produces
  **both**: structured return **plus** rendered markdown, not one replacing the other. (2) Enforcement
  sits at the agent-return boundary, which is **runtime surface**, so it carries the same
  verify-the-API-first precondition as the Phase C note on the loop-engineering row. *And the binding
  rule from `AUTONOMY-COUNTERWEIGHT.md` §5.3 applies with force here:* a paragraph in an agent file
  saying *"return valid JSON"* is the **unreached-mechanism class committed inside the fix for claim
  integrity**. Adopt it as a gate or not at all.
- **Correction protocol** **✅ SHIPPED in `v0.1.25` (`M5.E10`), 2026-08-13.** Shipped: `tools/lib/correction-protocol.js`, blocks at FULL / advisory below. Known limit, pinned by its own test: a claim that WRAPS across lines is invisible. (§6 item 5) — a correction is complete when a corpus grep for the claim
  and its restatements returns only corrected instances: root + all carriers, not the files that
  happened to be open. **Plus the corollary: retract at the granularity people search at** — `grep`
  prints one line, so an amendment appended three lines below leaves the claim's own line reading as
  live; the line must carry its own inline retraction. (Resolves the real tension between *amend,
  never rewrite* and *the grep must come back clean*: the matching line must be **self-correcting**,
  not absent.) *Done-when:* a SHIP-time check fails on a fixture with a corrected root and one live
  carrier, **and** on a fixture whose correction exists in the file but not on the claim's own line.
- **Wire up or fold in the verifier agents** (§6 item 7) — `agents/verifiers/verifier.md` and
  `nyquist-auditor.md` carry the enumerate-with-a-denominator shape and are dispatched by no
  command. *Done-when:* that discipline is reachable from `/sig:verify`, by dispatch or absorption.
- **Retro-index freshness check** (§6 item 8) — sibling of `checkIndexFreshness`;
  `regenerateIndex` is already deterministic and compare-before-write. *Done-when:* a repo whose
  `RETROSPECTIVES.md` lacks a row for an existing retro fails `/sig:sweep` (the 2026-07-28
  missing-M5.E8-row incident, mechanized).

### M5.E11 — Roadmap Advisor · **KEPT — first slice only, sequenced behind `M5.E10`** *(2026-08-09, `D-BR0809-1`)*

> **Two things changed on 2026-08-09, and they cut in opposite directions.** The
> [backlog review](BACKLOG-REVIEW-2026-08-09.md) **did this Epic's job by hand** — so the
> automation's value is now demonstrably *repeatability*, not capability, and the manual version
> costs one pass. That is an argument for shrinking it to the first slice, not for cutting it: a
> judgement made once by hand and never again is exactly the *"0-for-6 displacement chain"* this
> Epic was proposed to fix.
>
> It also means the done-when is now **testable against a known-good output** — that review is the
> answer the first slice must reproduce.
>
> **Sequenced behind `M5.E10` for a specific reason, not politeness:** an advisor that emits
> unverified claims is the claim-integrity defect with a wider blast radius. Build the claim checks
> first, then the thing that makes claims at scale. **Moves to M6** (`D-BR0809-2`).

**Tag:** roadmap · **Trigger: M5.E9 lands** (it advises on a backlog, so reconcile the backlog first).
The best-evidenced *new* capability in the audit, and one it nearly missed: the counterfactual asked
about shipped bugs and Epic duration and **never asked "would this have stopped us building the
wrong thing, in the wrong order?"** — the failure Signal's record documents loudest (the 0-for-6
displacement chain; five ports un-cut for the project's life; `B39`).
**Scope:** product discovery is **out** (ratified 2026-07-26); *given a backlog, what's next and
why* is **in**. Absorbs gstack's `/office-hours` forcing questions re-pointed at sequencing,
`/plan-ceo-review` Step 0B, and pm-skills' assumption mapping (Impact × Risk).
*First slice:* **make M5.E7 repeatable** — read `BACKLOG.md` + `BUGS.md` + the retro corpus, return
*why this and not that* for the top N, every answer citing a path. *Done-when:* a stranger runs it
on Signal's own backlog and the citations resolve. **Naming deliberately open** — do not fix the
name before the shape.

### M5.E20 — The other two shapes of "shipped but never run" *(renumbered from `M5.E16`, 2026-08-09)*

> **This entry carried a dead ID for nine days — `B91`.** It was promoted as `M5.E16` on 2026-07-30.
> On **2026-08-01** a different Epic opened under the same ID — *"M5.E16 — STATE-vs-world drift
> detection"* (`M5.E16-REQUIREMENTS.md:1`) — and shipped as **v0.1.16**. Two Epics, one ID, one day
> apart, breaking **ID-is-identity** (`PROJECT.md` § Vocabulary) in the direction that hurts: asking
> *"did `M5.E16` ship?"* returned **yes**, for work that is not this item, so this entry was
> invisible to anything keying on the ID — including the trigger walk, which reads this file.
>
> **Renumbered to `M5.E20`** (next free; `E10`–`E12` are reserved, `E19` shipped). **The old ID is
> not reused and not silently swapped** — the whole value of the rule is that the collision stays
> legible. `M5.E16` now means one thing: the shipped drift-detection Epic.
>
> **The cause is a missing mechanism, not carelessness:** IDs are allocated by *promotion* in this
> file and by *Epic-open* in `.planning/{EpicID}-*.md`, and **nothing reconciles the two
> allocators.** `B91` carries the candidate fix — a hygiene test asserting every `M5.E{n}` heading
> here either has no `{EpicID}-REQUIREMENTS.md` on disk or matches its title, which would have gone
> red on 2026-08-01.
>
> **Scope and trigger below are unchanged.** Only the identifier moved.
**Tag:** roadmap · **Trigger: NONE — promoted on evidence 2026-07-30 (Brett).**
Was M5.E13's explicit *"not doing — a cross-shape mechanism for the guard class."* Promoted
because the class turned out to be a **search strategy**, not a bug list.

**The evidence that changed its status.** Every significant find of the last three Epics came
from a **first execution** — not from working harder, but from the first time anyone actually
ran something instead of assuming it:

| Found | Circumstance |
|---|---|
| `B55` — the adherence control arm was never isolated | first real use of the harness for its purpose |
| `B54` — a guard both uncalled **and** wrong if wired up | first read of `state.js` while implementing FR1.2 |
| 2 fired, unmarked triggers | first time the watchlist was ever walked |
| `B42` (P1, live 9 releases) + `B43`/`B44`/`B45` | first ship report from a non-Signal project |
| `B53` | first check of a downstream project's claim |
| `B48` — opened M5.E13 | first read of an adherence run transcript |

**So "shipped but never run" is the best defect predictor Signal has** — better than complexity,
age, or coverage. M5.E13 treated that category as *four bugs to fix*. It is a **way of looking**.

**What is already built (M5.E13 S3.t3):** the **code-shaped** detector —
`tests/guard-callers.test.js`, asserting every `--flag` CLI guard in `tools/` has a non-self
caller, plus a regression guard on `B54`. It covers **2 of the 4 known instances** and says so in
its own name, per D-M5E13-3.

**What this Epic builds — the two shapes left uncovered, and note that both hosted a real bug:**
- **Document-shaped** — a doc instructs an action **no command implements**. `B39`'s home: a
  standing entry told `/sig:plan` to walk a watchlist for **three weeks** while `grep -ril
  watchlist commands/ tools/` returned nothing. Detection needs a declared registry of
  obligations, which is the hard part and the reason M5.E13 declined it.
- **Data-shaped** — data written that **nothing ever reads back**. `B46`'s home. Note `B46`'s own
  premise later proved wrong, which sharpens rather than weakens the case: nobody could tell
  whether that data was read, because **nothing tracks readership**.

**Ordering note:** M5.E15 (`B55`) has a leak-check sub-item — *refuse to run when the instruction
is still reachable in the mutated tree* — which is this same class in a third shape. Build the
registry here first, or knowingly duplicate it there.

**Cost of leaving it:** the guard class keeps being discovered one instance at a time, by
accident, which is the mechanism this whole line of work exists to replace.

### ~~M5.E18 — The archive half, for the 8 projects out of 12 it does not reach~~ — **✅ SHIPPED v0.1.18 (M5.E18, 2026-08-04)**

**Delivered against the measurement below:** 67 files across 1 of 12 projects → **114 files across 6**
(`eval-project-C` 0 → 26), with **0 previously-planned moves lost**. Closure gained a third outcome
(`cannotDetermine`), the closed-set became a **union** of retro-and-verdict, and a **stub retrospective
vetoes closure** (`B64`, found at five decision sites, not the two planned). Retro:
[`M5.E18-RETROSPECTIVE.md`](M5.E18-RETROSPECTIVE.md).

**Tag:** roadmap · **Trigger: NONE — unconditional next for doc-health (Brett, 2026-08-02:
*"get past this document crap so all my projects can migrate and be healthy"*).**

*(`M5.E18` was reserved as M5.E16's contingent split target for `/sig:update` and released
unused — `M5.E16-PROGRESS.md:210`, "It did **not** need to split to M5.E18." The ID is free.)*

**The measurement that sequences this above everything else in doc-health.** M5.E16's own
research walked 13 real `.planning/` trees: **Epic mode is 4 of 12 readable projects**
(`M5.E16-RESEARCH.md:55` — *"Signal's own shape is the minority shape"*). Both of Signal's
archive paths are Epic-gated **by construction**, not by omission:

- `planArchiveMoves` filters its input through `EPIC_ID_STRICT_RE` and only matches
  `.planning/{epicId}-{suffix}.md` (`archive-tree.js:96-110`).
- `extractEpicSection` rejects any non-strict ID (`evict.js:175`); `deriveEpicArchiveDir`
  throws on one (`:243`).

So the de-prose, stamp, `BACKLOG`-create and v3-rename halves of `/sig:migrate-memory` work
everywhere, and **the halves that actually stop `.planning/` from growing forever reach a
third of the corpus.** That is the whole reason eval-project-A still runs Curator: reported
2026-08-02, with the citations checked — *"`reconcile --apply`'s move half has no Signal
equivalent for linear slices … so the move stays curator's until Signal's built-in covers
linear work."* Their conclusion is correct.

**This is `B42`'s shape one layer over** — a documented mode that a whole subsystem silently
does not serve, invisible because Signal-on-Signal has been Epic-mode since M4.5.E11.

**Three parts, one design:**
1. **An archive planner for non-Epic units** — what Curator's `reconcile --apply` does today.
2. **Real closure verification, folding in `B64`.** Do not sequence that bug separately:
   Signal currently proves *closed* by a retro **file existing** and throws away the `isStub`
   flag it already computed, so whatever verifies closure for linear slices is the same
   verification Epic mode is missing. eval-project-A named the failure precisely — *"a label, not a
   guard."*
3. **Port M5.E16's four-status model into the migrate's dry-run** (`B63`), so `0` stops
   meaning both *could not look* and *checked and clean*.

**Related, already recorded and deliberately not fixed:** M5.E16 REVIEW-2 `S3` — check `(c)`'s
applicability probe misses the unprefixed `RETROSPECTIVE.md` that linear projects write
(`M5.E16-REVIEW-2.md:70-84`). Left alone there because it fails **safe** (`not-applicable`,
never a false clean). Same root — linear projects name things differently — so fold it in here
where the corpus is being re-measured anyway.

**Cost of leaving it:** every non-Epic project either grows `.planning/` without bound or keeps
a second, external doc tool alive to do the half Signal cannot — which is the exact
two-tools-one-corpus state the doc-runtime flagship was built to end.

**Scope inputs added 2026-08-02, from measuring the two pre-M5.E18 fix-lane items.** The second
one (*"fix `current_epic` in `eval-project-C` and `eval-project-I`"*) came back **refuted**, and
what it returned instead is design input for this Epic:

- **`current_epic` is being used as an artifact-prefix field, and Signal has no such field.**
  Both projects name every artifact after their non-strict value (19+ `PHASE1*-*.md`, 6 `M1-*.md`),
  and `resolveArtifactPath(…, {currentEpic: null})` returns **`null`** for both — so "make STATE
  honest by nulling it" **loses** read resolution for every document they own. Signal's linear mode
  assumes a `{N}-` numeric prefix or none; neither project matches, and neither is wrong. **An
  archive planner for non-Epic units has to answer what the prefix is** before it can group
  anything, and the answer is not in `current_epic`'s current contract.
- **`B70` (P1) belongs here, and arguably ahead of part 1.** `/sig:status` and `/sig:resume`
  **throw** on 5 of 12 readable projects — every one of them a hand-maintained linear project whose
  `phase:` scalar holds narrative rather than one of the seven canonical names. Building the
  archive half for a population that cannot run the two orientation commands is the second half of
  a door. It also shares part 2's root question: `readState` validates neither `phase` nor closure,
  and the `B45` fix already established the answer shape (quarantine the off-enum value, surface it,
  do not key on it).
- **`B69` (P3) folds into part 3.** The SHIP retro write-guard throws on a non-strict
  `current_epic` and the hook swallows it — `could not evaluate` rendered as silence, which is
  exactly the four-status model part 3 is porting.
- **`B68` (P3), cheap, same corpus.** Nothing prints the detected Epic/linear mode, so these
  projects read as Epic to a human and linear to every resolver. One `detectMode` call in each of
  two renderers.

**The stopping rule this Epic was given** (STATE.md, 2026-08-02): fix **by class**, and prove it by
searching for siblings before closing. `B70` is what that discipline produced on its first
application — `B45` quarantines an off-enum `completed_phases` entry, and nobody asked whether the
`phase` scalar next to it had the same hole. It did, on five real projects.

### ~~A closure-gated archive **command** — wire `resolveClosures` to the mover~~ — **✅ SHIPPED v0.1.22 (`M5.E19`, 2026-08-07)**; its premise was corrected at PLAN (`D-M5E19-6`) — archiving was already wired, the gap was the missing front door

**Tag:** roadmap · **Trigger: FIRED 2026-08-04** — `curator`, the external tool that did this job
across `eval-project-A` and `eval-project-D`, was **removed from the machine that day**. Archiving in
those repos is now a hand-written `git mv` runbook. This entry is the permanent replacement.

**Why curator went, because the replacement must not repeat it.** It chose what to archive by
matching **filenames** and never checked whether the work was finished. Its only protection was a
hand-maintained `live_zone` list you had to update *before* you started writing a file. It got this
wrong three times across two projects: `eval-project-A` proposed archiving the **same 4 live units twice**
(ENV1, MOD1, PILOT0, VOICE1 — 2026-08-01 and again 2026-08-04), and `eval-project-D` failed in the
opposite direction, falsely *refusing* an archive by prefix-matching the unit `ADMIN-UI` against
`ADMIN`. The 2026-08-01 remedy was a **printed warning**, and it failed the way warnings fail: it
asks a human to be vigilant forever. **A warning asks; a gate refuses.**

**M5.E18 built the hard half and wired none of it.** That Epic's own retro records the shape —
*"the library could do 110; nothing wired it."* This entry is the wiring.

**What works, measured 2026-08-04 against eval-project-A's real corpus:** `tools/lib/closure.js`
(`resolveClosures`) returns finished / not-finished / cannot-tell per unit — **1 closed, 7 open, 0
cannot-tell**, and it correctly reads **PILOT0** and **VOICE1** as *open*. Those are two of the four
units the old tool wanted to archive.

**What is broken, same measurement — and it is the blocker.** `planArchiveMoves` builds every
candidate as `` `${PLANNING_DIR}/${unit}-${suffix}.md` `` — the `<UNIT>-<SUFFIX>.md` form only.
eval-project-A and eval-project-D both carry **two filename shapes for one unit**: `SLICE-SSO` exists as
`SLICE-SSO-{PROGRESS,REVIEW,VERIFICATION}.md` **and** `PLAN-SLICE-SSO{,-RESEARCH,-VALIDATION}.md`.
Run against it today the planner returns **3 of 6 files**.

> **A unit split across live and archive is worse than one never archived.** `INDEX.md`, cross-doc
> links, and the next reader all disagree about where the unit lives. The old tool at least moved
> all-or-nothing. **Do not wire the mover in as a substitute until this is fixed**, and do not write
> documentation implying it is close — the two consuming repos' runbooks were corrected on
> 2026-08-04 to describe manual archiving as *the method*, not a stopgap.

**Three requirements for whoever builds it:**

1. **One unit at a time.** All-or-nothing is why reading the old tool's warning never helped: a
   correct read left **no safe partial action**, so the only move was doing it by hand.
2. **A manual override alongside the automatic check.** Signal's checker reads Slice SSO as
   *finished*; eval-project-A deliberately holds it **live** (merged but dormant pending Wolverine
   go-live — the reason is a comment in that repo's `.curator.yml` `live_zone`). Both layers are
   required; **either one alone is wrong.**
3. **Refuse to re-move a unit already present in `archive/`.** *(Carried forward from the deleted
   `ship-archive.mjs` — the one idea in it worth keeping.)* It was that script's only guard, and it
   is the guard that prevents the split-unit failure above.

**Prior art to read, not to re-derive:** the two rewritten runbooks
(`eval-project-A/docs/operational/ship-archive-runbook.md` and eval-project-D's) carry the manual
sequence, and the deleted wrapper is in those repos' git history.

### ~~`B52` — warn at session start when the bound plugin cache is not the installed one~~ — **✅ SHIPPED v0.1.20 (2026-08-06)**
**Tag:** correctness · **Trigger: SATISFIED — third live sighting 2026-08-03. Filed as a home for a
P1 that has had no home across three sightings in six days.**

**Recommended lane: fix lane, ahead of M5.E18's EXECUTE work.** It is a confirmed P1 whose fix is a
guard inside an existing hook, not new design — but it adds a user-facing warning, so if PLAN judges
it Epic-shaped, absorb it as an M5.E18 slice rather than leaving it unhomed a fourth time. **The
recommendation is the disposition, not the decision — Brett's to override.**

**Why now.** `B52` is *"a session binds to one plugin-cache version for its whole life."* Sightings:
**2026-07-28** (bound 0.1.11, installed 0.1.13 — **destroyed M5.E8's phase ledger silently**),
**2026-08-02** (bound 0.1.13, installed 0.1.15 — re-issued an instruction `B51` had deleted),
**2026-08-03** (bound 0.1.16, installed 0.1.17 — no damage, near-miss on `B70`). **Three in six days,
each found by a human noticing a version string in passing, and the version gap is narrowing — a
smaller gap is harder to spot, not easier.** The row's own conclusion after sighting two: a
session-start check is *"the only thing that would have caught either sighting."*

**The mechanism is cheap, and the pieces are already on disk** — verified 2026-08-03, not assumed:

- Hooks are registered as `${CLAUDE_PLUGIN_ROOT}/hooks/…` (`hooks/hooks.json`), so **the hook runs
  from the same resolved path the session bound to** — it is the bound version reporting on itself,
  which is exactly the needed vantage point.
- Every cached copy carries its own version: `…/cache/signal/sig/0.1.16/.claude-plugin/plugin.json`
  reads `0.1.16`, `…/0.1.17/…` reads `0.1.17`. So the comparison reads a **file**, not a path
  segment — no brittle string-parsing of the cache directory name.
- `~/.claude/plugins/installed_plugins.json` records the version that *should* be running
  (`installPath` + `version`), and has been **correct in all three sightings** — the config is not
  the broken part.

So: two file reads, offline, deterministic, fail-open, inside a SessionStart hook that already runs.

**Do not skip the second half.** The row also asks whether `setCurrentEpic` should refuse to reset a
non-empty `completed_phases` it did not archive. The warning makes the *cause* visible; that guard
makes the *damage* loud regardless of version, and it is the half that would have saved M5.E8's
ledger. A warning alone leaves the silent-data-loss path intact.

**The counter-argument, recorded.** STATE.md's sequencing note says *"no new detector Epic while the
verified-open count is high"* — Signal has shipped four consecutive bug-finding releases and this
would be a fifth detector. The reply is that this is not a detector for a **class**, it is a guard on
the **install layer** that corrupts the evidence every other detector depends on: a stale binding
makes a fixed bug look live and a live bug look fixed. It is infrastructure for the stopping rule,
not another instance of what the stopping rule is aimed at.

### Add a "first use" step to `/sig:plan`
**Tag:** hygiene · **Trigger: NONE — filed 2026-07-30 (Brett). Small; one instruction.**

**The problem, concretely.** `B55` — the biggest finding of M5.E13 — surfaced on the Epic's
**very last task**, because that is when the adherence harness was first genuinely used for its
intended purpose rather than to prove itself. Had it surfaced in Wave 1, M5.E13 would have been
scoped differently: FR1.1's single-shared-wording requirement is in direct tension with the
harness's control arm, and nobody could have known that before running it.

**The change.** One instruction in `commands/plan.md`: *name the thing this Epic will do for the
first time — a tool used for its real purpose, a doc executed rather than read, a path taken by a
project shape we have not tried — and schedule it in the first wave.*

**Why it is worth an entry rather than just doing it:** it changes wave ordering, which touches
the plan-validation dimensions (dependency correctness, vertical slicing). Small, but not
zero-design.

**Evidence base:** the same table as M5.E16 above. First-execution is where the yield is, and
right now it lands wherever it happens to land.

### ~~M5.E15 — The control arm, made real (`B55`)~~ — **✅ SHIPPED v0.1.19 (2026-08-06)**

> **Marked open 2026-08-04, late — and the lateness is the finding.** `D-M5E18-1` made *this file*
> the single home for the queue **because** it drifted on 2026-08-03. Three days later M5.E15 opened,
> nine decisions were recorded, and PLAN artifacts were written — and the open marker went into
> `CONTEXT.md`, the file that decision demoted. **Second use, second failure**, because the rule
> lives only in prose and nothing derives this row from `STATE.md`'s `current_epic`. Filed as a
> capture; the durable fix is derivation, not another reminder.
>
> Artifacts: `M5.E15-{REQUIREMENTS,RESEARCH,PLAN,VALIDATION}.md` · Decisions: `D-M5E15-1 … D-M5E15-9`

**Tag:** roadmap · **Trigger: FIRED — the arm is being fixed now.** Blocks any new
`OBEYED`/`INERT` verdict being trusted, and any published number derived from one.
**Filed 2026-07-30 (Brett's call: its own piece of work, not bolted onto M5.E13).**

**The defect (`B55`, `confirmed`, P2).** `adherence-run.js` copies the whole plugin and mutates
**exactly one** command file, while `transitionPhase` is named **4× each** in `plan.md`,
`verify.md` and `review.md` plus four more files. **The control arm has never been isolated
across files** — a control-arm agent simply opens a sibling command and finds the instruction it
was supposed to be deprived of.

**Why it is an Epic and not a patch.** The fix is not "delete from more files." M5.E13's FR1.1
*required* one shared wording across the four middle commands so they cannot drift — so the
instruction **legitimately** appears four times, and deleting it corpus-wide changes the
question being asked from *"does this line in `execute.md` do work?"* to *"does this rule,
wherever stated, do work?"* Those are different claims with different validity. **Deciding what a
verdict means for a multi-homed instruction is the actual deliverable**; the code change follows
from it.

**Scope sketch (not a plan).**
- A canary declares a **corpus-level** deletion target, not a single `deleteSection` anchor.
- A verdict states its **isolation scope** on its face, so a reader cannot mistake a
  one-file result for a corpus result.
- A pre-run **leak check**: refuse to run when the instruction is still reachable in the
  mutated tree. This is the guard whose absence is `B55`, and it is the same shape as the
  `--check`-has-a-caller test — so M5.E13's own mechanism should cover it.
- Re-run `B41-phase-entry` **after** the arm is fixed, never before.

**Standing prohibition until this lands.** Do **not** re-run a canary hoping for a cleaner
number. A second run is a coin-flip and taking the better of two is precisely the tuning the
four-verdict impostor table in `M5.E8-REVIEW.md` forbids. `ADHERENCE-LOG.md` carries an
**INDETERMINATE** and that is the truthful state to sit on.

**What it costs to leave.** M5.E8's `OBEYED` — Signal's flagship adherence result — is **not
falsified** but **unisolated**: it could never have distinguished *"the instruction works"* from
*"the agent found it elsewhere."* Every future verdict inherits that defect until this is fixed,
so the harness cannot support the claims it was built to support.

### M5.E12 — Project-facing currency
**Tag:** roadmap · **Trigger: M5.E11 lands**, or a doc-drift incident in a Signal-built project.
**⚠ The second condition has a candidate instance — checked 2026-07-28, not yet adjudicated.**
On `eval-project-C`, Curator's `.planning/INDEX.md` listed Phases 7–11 as *archived, closed* —
linking to directories that do not exist — while Phase 11 was the current phase, edited that day;
its post-commit hook rendered *proposed* archive moves as completed and rewrote the file every
commit (~40 of 53 "integrity issues" were orphan advisories caused by that false belief). Removed
by pulling Curator (`eval-project-C` `f09c11b`), so **the incident is closed; what is open is
whether it fires this Epic ahead of M5.E11.** Caveat against over-claiming: the drift was authored
by an *external* tool contending for a Signal-owned file, not by Signal's own generator — the fix
was tool removal, and this Epic's scope (index the project's own `docs/`) would not have prevented
it. **Brett's call.** Recorded here because a checked-and-declined trigger must be distinguishable
from an unchecked one (`B39`). Migration guidance shipped meanwhile:
[`../docs/migration-curator-to-signal.md`](../docs/migration-curator-to-signal.md).
*The insight that makes it cheap:* this is Signal's doc-runtime **pointed outward at the project**
instead of inward at `.planning/` — the work is **retargeting, not inventing.**
- **Accurate, agent-navigable docs for the codebase and its external services.** Supersedes in scope
  both `/sig:docs-update` (Sprint 7) and the tooling-catalog inbox entry — **reconcile, don't
  re-derive.** *Slice:* run the existing hygiene + index generation over a project's own `docs/` and
  its external-service surface. *Done-when:* a generated doc map whose links all resolve, and a
  broken one fails the check.
- **External-claim staleness stamps** (`verified-against: <ref> on <date>`, advisory, homed in
  `/sig:sweep`) covering `analysis/` (correction **C6**) and the two ⚠-flagged untrustworthy claims
  at Sprint 2 below. *Done-when:* an unsourced or expired claim produces a sweep advisory naming the
  file and the claim.

### M5.E14 — Obligation tracker integration (single home for open/closed work)
**Tag:** roadmap · **Trigger: M5.E10 lands** (the claims fixes come first — the tracker is
**additive to, never a substitute for**, claim verification: no tracker checks whether a report
enumerated a requirements file). Added 2026-07-28, Brett's call at the claim-integrity pass; design
record: [`../analysis/CLAIM-INTEGRITY-ANALYSIS.md`](../analysis/CLAIM-INTEGRITY-ANALYSIS.md) §7.
**Not part of the M5.E7 sequencing — a post-audit widening, named as one.**

> **⚠ ID note corrected 2026-07-28 (M5.E13 DISCUSS).** This entry originally read, and this is
> **[RETRACTED — FALSE]**: *"`M5.E13` was already claimed by the in-flight Lanes epic when this entry was written; E14 was the next free ID."* **[/RETRACTED]**
> **That was false in both halves.** Lanes carried **no Epic ID** — not here, not in `MILESTONE-5.md`,
> not in [`../analysis/LANES-IMPLEMENTATION-GUIDE.md`](../analysis/LANES-IMPLEMENTATION-GUIDE.md),
> which describes itself as *"DISCUSS input for a new Epic"* — and it was **not in flight**; it was an
> uncommitted proposal in the working tree until `e61f614` the same day. `M5.E13` was free and is now
> **"Guards that don't guard"** (opened `42d3f13`). This entry keeps **M5.E14**; nothing renumbers.
>
> **Recorded as a `B50` sighting, not just a typo** — a status claim ("already claimed", "in-flight")
> written from the author's mental model rather than checked against the artifact, in a commit made
> the same day the class was named. **Fourth sighting on one day (2026-07-28)** — enumerated so the
> count matches its own list, since an unenumerated tally is the class in miniature: (1)
> `RETROSPECTIVES.md` presented as the complete retro index while missing M5.E8 entirely
> (`CLAIM-INTEGRITY-ANALYSIS.md` §8; fixed same day); (2) M5.E8's retro mechanism, which covers 1 of
> its own 3 instances (**D-M5E13-3**); (3) this class's own inbox capture, filed with a body-less
> *"Logged"* status line; (4) this ID note. The class is not historical.

**The argument:** "closed" in a tracker is an *event* — actor, timestamp, audit trail; in markdown
it is a string an agent rewrites wholesale on every edit (the `B41`–`B45` shape, aimed at status).
Phase 11's false "still owed" was an inference from a list's shape; against a tracker there is
nothing to infer — `gh issue list --state open` *is* the answer, and the ship-gate "anything still
owed?" check becomes one query instead of a schema Signal maintains forever. The honest concession:
Signal has been incrementally building its own issue tracker out of markdown (ISSUES-INBOX /
BACKLOG / BUGS / dispositions / `backfill_warnings`) and keeps re-hitting bugs trackers solved
decades ago — `B46` cannot happen when status has one home.

**Two load-bearing conditions (both required, or don't build it):**
1. **Single home** — the tracker is the *only* place obligation status lives; markdown references
   issue numbers and never restates status. Mirroring status back into files recreates the `B46`
   class with extra steps. Half-integration is worse than none.
2. **Closing wired into the phase gates** — SHIP/REVIEW run "what's open, and did this phase close
   what it claims it closed?" Phase 10 discharged an obligation and stamped nothing; a tracker makes
   that check trivial and definitive — it does not make it automatic.

**Boundary:** lifecycle items (backfills, bugs, deferred work, the capture inbox) → tracker.
Records (decisions, retros, requirements, state narrative) → stay in `.planning/`, versioned with
the code. **GitHub Issues first** (`gh` is already in the ship flow; zero new auth for Signal's
audience); Linear at most a later adapter. **A degraded/offline mode is required** — Signal's
guards are offline+deterministic and there is no `/sig:permissions` vocabulary yet: the fallback is
the `discharged` status marker on `backfill_warnings`, **which can ship ahead of this Epic as a
patch** (it is also the schema fix that ends the false-"still owed" class for tracker-less projects).

*First slice:* the `discharged` marker + a SHIP-gate open-obligations query behind a capability
check (`gh` present and authed; silent, logged skip otherwise). *Done-when:* a fixture with a
discharged-but-unmarked obligation produces no false "still owed" through a full VERIFY→SHIP run —
and the same fixture with a tracker present shows the obligation closed by the phase that
discharged it.

---

## Sprint 2 — Re-aim the map *(research; gates the v2-port arc)* — **✅ CLOSED by M5.E7**

**Ran as Epic M5.E7, 2026-07-25→26.** Four of five items are closed by it; one survives and is
absorbed into M5.E12. *(Historical note: this sprint's framing — "the v2 vision is stale" — was
itself corrected. The April analyses were **~3 months old, not ~15**; correction **C6**. Staleness
carried **zero** weight in any cut.)*

### ~~Feature-parity + landscape re-audit → `SIGNAL-INTEGRATION-RUNDOWN-v2.md`~~ — **✅ DONE (M5.E7)**
**Tag:** roadmap
**Delivered as [`../analysis/SIGNAL-V2-ROADMAP.md`](../analysis/SIGNAL-V2-ROADMAP.md)** — deliberately *not* named `-RUNDOWN-v2`, whose name presupposes the retired coverage frame (D-M5E7-5). 45 candidates verbed; the seed is partially superseded (its §1 scorecard dies, §2/§3 carry forward). Original entry preserved for provenance:

Feature-parity audit across all inspiration repos → a *sequenced* Epic queue in a fresh `SIGNAL-INTEGRATION-RUNDOWN-v2.md` (only the `-SEED.md` exists today; the re-audit should verify it fresh and supersede it). This is M5's locked opening move (BR-8) and gates the speculative v2 feature ports.

### ~~Compound-engineering implementation audit~~ — **✅ DONE (M5.E7 S2.t6a/t6b), and it cut what it gated**
**Tag:** roadmap
**Delivered:** `.planning/M5.E7-SUPPLY-COMPOUND.md` + `-COMPOUND-NEW.md`. The audit it gated (`/sig:compound`, Sprint 4) is **abandoned** — the memory-loop premise was falsified, and **C5** found the two agents are not a unit upstream, so porting "the phase and its two agents" would build something the source does not have. Original entry preserved for provenance:

Study compound-engineering's post-ship memory loop before designing `/sig:compound` (Sprint 4). Explicitly gates that design.

### Traversal-artifact decision spike
**Tag:** roadmap
One spike with a recommended default — **hierarchical markdown intent layer wins; graph is a later opt-in** (plain markdown in git is load-bearing; graphify adds a Python dep that dents the <5-min-install target). Run the installed `intent-layer` skill on one large repo, decide, and close the three circling entries (graphify / graph-only / Intent-Layers reframe).

### ~~Vocabulary attribution sweep~~ — **✅ largely DONE (M5.E7 S4.t10)**
**Tag:** hygiene
**Delivered:** 10 dated correction markers over 6 IDs across four `analysis/` files (**C3** `<HARD-GATE>` is a syntax not a mechanism · **C4** pm-skills engineering integration · **C5** `learnings-researcher` location · **C6** the "~15 months" figure · **C7** the command count · **C8** the anti-rationalization generalization). **Residual, deliberately not claimed as done:** only the five claims M5.E7's supply verification touched were checked. The rest of the corpus was **not** re-verified — that is what the stamp below is for.

### Re-source the stale external claims → **absorbed into M5.E12**
**Tag:** hygiene
Verify the path-scoped-skills frontmatter claim and re-source the "5 CC tools" claims against current Claude Code docs (both flagged ⚠ in their entries — can't be trusted at face value). **M5.E7 promoted this from a one-off pass to a standing mechanism:** these two ⚠ claims are the *second recorded instance* of the failure class (C6 was the first), which is what graduated the external-claim staleness stamp from `continue` to `build`. Do the two re-sources **as the stamp's first fixtures**, not separately.

---

## Sprint 3 (residual) — Memory & doc-runtime *(the rest of the flagship)*

The structure half (doc-model, eviction, migrate, index, hygiene) is shipping as M5.E1–E3. What remains is the maintenance-command half.

### `/sig:sweep --docs / --code` — periodic hygiene sweep — **⚠ PARTIALLY SHIPPED (v0.1.11, M5.E6, 2026-07-25)**

> **Corrected 2026-08-04.** This row read a flat **✅ SHIPPED**. The mechanical half shipped; **two
> halves did not**, and marking the whole row done is what hid them for ten days:
> - **The `--docs` judgment half** — *"internal contradictions, duplication"*, in the entry's own
>   words. Every shipped check compares STATE/PROFILE against **the filesystem or git**; none
>   compares two prose documents against each other. See the sharpened entry in `ISSUES-INBOX.md`.
> - **The `--code` half entirely** — sprawl, dead code, over-engineering. Not built.
>
> There is also **no `--docs` / `--code` flag**: `/sig:sweep` takes no scope argument. The row was
> marked from the command's existence rather than from its scope — the class `M5.E10` exists to
> catch, in this file.
**Tag:** roadmap
**Delivered:** `commands/sweep.md` + `tools/lib/sweep.js` — Signal's **18th** command. *This row read "Confirmed not yet built" until 2026-07-26; the file's stamp (2026-07-19) predated the release. Caught by M5.E7 S1.t3, which had to use this file as its subtraction authority and found the authority stale.* Original entry preserved for provenance:

New command (name resolved from the `/sig:audit` collision, BR-1); absorbs the old `/sig:doc-review` (stale indexes, drifted CLAUDE.md, `[FILL IN]` stubs, stale inbox) plus a Dreaming-style inbox-curation pass. `/sig:audit` keeps the readiness scorecard (Sprint 5).

### Passive `OBSERVATIONS.md` capture
**Tag:** roadmap
A passive Stop-hook that captures observations to `OBSERVATIONS.md`, composing with E9's retro loop; drained by `/sig:checkpoint` and SHIP.

### ~~CLAUDE.md de-bloat + command-frontmatter freshness~~ — **✅ SHIPPED v0.1.11 (M5.E6), both halves**
**Tag:** hygiene
**Delivered:** `tools/lib/sweep.js:137` `checkClaudeMdBloat` (advisory, `CLAUDE_MD_BLOAT_BYTES`) + `:169` `checkCommandFrontmatter`. *Also unmarked until 2026-07-26.* Original entry preserved for provenance:

De-bloat test for CLAUDE.md + a command-frontmatter freshness check — both are `--docs` sweep instances (build once the sweep command exists). (Index-freshness + link-health from workstream #4 are largely absorbed into M5.E3 FR3/FR4.)

### ~~`docs/map` refresh protocol — Stage 1~~ — **✅ SHIPPED v0.1.11 (M5.E6 FR3)**
**Tag:** hygiene
**Delivered:** `commands/ship.md:65` — the checklist line, covering both tabs. *Also unmarked until 2026-07-26.* Original entry preserved for provenance:

One checklist line in `commands/ship.md` to keep the public `docs/map` fresh at Epic close. Scope widened 2026-07-21: the map app now has TWO screens — the structure/functionality view (data objects in `index.html`) and the "Signal, explained" tab, which mirrors `docs/signal-explained.md`. The checklist line must cover both: at each meaningful release, evaluate whether the map data AND the explainer doc + tab need updating (they won't change every cycle, but the evaluation should happen every cycle — "no change needed" is a valid outcome). (Stages 2/3 are parked below.)

### ~~Concurrency-lock the doc-runtime RMW paths~~ — **DONE** (M5.E4 FR5 + M5.E5 B25; closed-out M5.E6 FR7) *(deferred from the 2026-07-19 memory-layer review)*
**Tag:** hygiene
**Delivered:** every named RMW path is now `withStateLock`-guarded via the exact safe migrate pattern the entry below prescribed — a lock-free core + a self-locking wrapper, with `applyMigrate`'s in-lock composers calling the lock-free cores directly (**M5.E4 FR5**), plus the read-enclosure behavioral interleaving test proving no lost update (**M5.E5 B25**). M5.E6 FR7 is the bookkeeping close-out, not a new build. Original entry preserved for provenance:

The unlocked read-modify-write paths — `checkpoint.js` (`captureCheckpointContext`), `drain.js` (`promoteDrainEntry`, `evictTerminalToLedger`), `retro-index.js` (`regenerateIndex`, `generateMilestoneMetaRetro`), `planning-index.js` (`regeneratePlanningIndex`) — are torn-write-safe (`atomicWrite`) but have no compare-and-swap/lock, so two *concurrent* writers could lost-update. **Low priority:** these are orchestrator-only (wave-executors never call them) so single-session writes are sequential, and the one file parallel executors contend on — `STATE.md` — is already locked (`.state.lock`). It only defends concurrent **cross-session** writes on one repo, a mode Signal discourages. **The naive "just reuse `file-lock.js`" fix is unsafe:** `migrate-memory.js:2375` calls `regeneratePlanningIndex` *inside* `applyMigrate`'s coarse `.state.lock`, so making that function self-lock re-enters the non-reentrant lock and deadlocks migrate (the documented §9 hazard). Safe version = the established migrate pattern: split each locked entry into a lock-free core + a self-locking wrapper, lock only true command entries, keep inner helpers (`backlog.js`, `applyDispositionToFile`) lock-free. ~4-module refactor + tests; reuse `tools/lib/file-lock.js`.

---

## Sprint 4 — Compounding replay — **✂ MOSTLY CUT by M5.E7**

**The premise was falsified.** Read the three carry-over bug chains *with their dates and Epic IDs
attached* and the knowledge was **in-context at the moment of the miss in all three** — `B27`
surfaced while building `B24`'s own fixture; `B34` was found by the same REVIEW panel that shipped
`B29`'s fix; `B30` was found dogfooding `B26` on M5.E5's own SHIP. A cross-session store prevents
none of *those*. **The one genuine cross-session recurrence — `B13`'s NUL byte — is cut separately
and on stronger grounds** (see the `/retro` + `/learn` row below: a deterministic content check, not
a digest). **Read the claim at that scope** — three documented chains plus one named exception, not
"nobody ever forgot anything"; and the three were selected *because* they are documented, so a
forgetting-caused miss nobody caught would not appear here at all.
The real gap Signal already named is **class-completeness at fix time**
(`M5.E6-RETROSPECTIVE.md:32`) — a review-scope rule, which is where it now lives (**M5.E10**).
Substrate stays **per-repository** (locked 2026-07-15) — untouched by the re-audit.

### ~~`/sig:compound` phase — design + build~~ — **✂ ABANDONED (M5.E7, fit)**
**Tag:** roadmap
The demand it was believed to serve does not exist — see above. Original entry preserved for provenance: *Shape set by Sprint 2's compound-engineering audit. The post-ship memory phase.*

### Retro *replay* into the next Epic's DISCUSS/PLAN — **KEPT, re-homed**
**Tag:** roadmap
**Survives the Sprint-4 cut and is the strongest thing in it.** *Not* a memory store — it is
retrieval into a context that is already open, which is a different mechanism and one Signal has a
live instance of: **`B39`**, where a store exists and *the reader was never built*. **Sequenced into
M5.E9** alongside the `B39` trigger walk, which shares its shape. *First slice:* surface the prior Epic's `## What to feed back into Signal` items into the next Epic's DISCUSS context. *Done-when:* opening an Epic shows the previous Epic's feedback items without the author going to look for them. Original scope: E9 built retro *capture* only; the gap (named in the very first inbox entry) is surfacing captured learnings into the next Epic's DISCUSS/PLAN context.

### Cross-Epic pattern detection — **KEPT, absorbed into M5.E11**
**Tag:** roadmap
Detect recurring patterns across `RETROSPECTIVES.md` over time. **M5.E7 was a manual instance of exactly this** — it harvested 12 retros into 11 themed clusters and found Theme F (EXECUTE dispatch) raised in four consecutive Epics with **zero ledger coverage**. That makes this a *component of the Roadmap Advisor*, not a standalone build.

### ~~Evaluate gstack's `/retro` + `/learn` port~~ — **✂ ABANDONED (M5.E7 — evaluated, then cut)**
**Tag:** roadmap
**The evaluation ran and returned no.** gstack's read-back surfaces a top-10 digest, decay-filtered, **at skill start in 10 of 54 skills**. Signal's one genuine cross-session recurrence (`B13`'s NUL byte, learned 2026-07-18, violated 2026-07-25) would not have been caught — the chance that *"don't paste control bytes"* surfaces at the moment someone edits a bug entry is not credible, and Signal's real defense for that class is a **deterministic content check** `doc-hygiene.js` already hosts. Cut on **overlap + fit**.

---

## Sprint 5 — Cockpit & interaction surface *(the new command surface)*

The entries themselves say report/orient/audit/goal share validator/README/manifest overhead and should co-ship. Thematically: how the human sees and steers Signal. Sequence: harness → report+orient → audit → breadcrumb → agenda → goal.

### Slash-command testing harness (A5)
**Tag:** hygiene
Promoted from OPEN-QUESTIONS (its "resolve by MILESTONE-4" is overdue). Command markdowns have zero mechanical coverage; this sprint mass-adds commands, so the harness lands first.

### `/sig:report` + `/sig:orient` (co-ship)
**Tag:** roadmap
Shared helpers + shared plain-English mapping tables (phase→plain-English, tier→plain-English — build once, reused by the audience-technicality dial in Sprint 6).

### `/sig:audit` — engineering-readiness scorecard
**Tag:** roadmap
6 dimensions, tier-weighted (the older, more-developed spec; keeps the `/sig:audit` name after the BR-1 split). Its rubric wants A2's second-project data to escape the sample-of-one problem.

### Status-line breadcrumb
**Tag:** roadmap
A statusline script reading STATE.md frontmatter (`current_epic` / `current_wave` / `last_completed_task`) rendering e.g. `M5 › E3 › S6b (EXECUTE)`; tier-gated display depth. One verify step first: confirm Claude Code's statusline-config API surface.

### Pre-scoped DISCUSS agenda
**Tag:** roadmap
A multi-select checklist that pre-scopes the DISCUSS agenda.

### `/sig:goal` wrapper
**Tag:** roadmap
Last — its own entry wants 5–10 real `/goal` runs before wrapping.

---

## Sprint 6 — Calibration depth *(data-gated; needs real usage evidence first)*

All four extend the calibration layer's expressiveness and are gated on real-usage evidence in their own entries. Bundled to keep PROFILE.md schema churn to one release. Lead is likely Option C (most specific watch-signals).

### Option C — concern weighting
**Tag:** roadmap
Primary/secondary/tertiary concerns modulating the 10 calibration dials (the entry's own confirmed lean).

### Audience-technicality dial
**Tag:** roadmap
A property of the person, not the project — lives at user level (a `communication` block in user-scoped config) with an optional per-project PROFILE.md override, read by every command via a shared output-shaping preamble. Reuses Sprint 5's plain-English mapping tables.

### Multi-feature lifecycle remainder
**Tag:** roadmap
Per-feature PROFILE.md override + a `features[]` block + feature-aware status/resume. E6 already answered the single-project tracking half; gate this remainder on second-dogfood (A2) evidence.

### Tier-count validation
**Tag:** roadmap
Are 4 tiers (SKETCH / FEATURE / SPIKE / FULL) the right number? Checked against real calibration runs (OPEN-QUESTIONS watch-item).

---

## Sprint 7 — Framework ports — **✂ RESOLVED by M5.E7: 0 straight ports survive**

Sprint 2's audit ran and **decided the sequence by deciding most of these are not the work.** Not
one entry below survives as a straight port. **Nothing here was cut for being stale or un-started** —
every cut argues **fit** or **overlap** (AC2.3, mechanically asserted in `M5.E7-DISPOSITIONS.md` §6).

### `/sig:docs-update` — GSD port → **absorbed into M5.E12**
**Tag:** roadmap
Tactical, fully spec'd, independent of the 10-phase work. **Superseded in scope**, not cut: M5.E12 covers doc-vs-codebase drift **plus** the external-service surface this entry never included, and does it by retargeting the existing doc-runtime rather than porting. **Reconcile against M5.E12 — do not build both.**

### ~~Upstream phases — IDEATE / VALIDATE / STRATEGIZE~~ — **✂ ABANDONED (ratified by Brett 2026-07-26)** · **PREPARE seam survives, parked**
**Tag:** roadmap
**Product-fit cut, and it is a positioning decision rather than an evidence one** — *"that's not signal."* Signal builds things well; it does not decide what product should exist. ⚠ **Read with the caveat (AC7.3):** Signal's corpus is silent about ideation, but Signal is built by someone who already knows what to build, from a spec written up front — **close to a worst case for detecting that demand.** The silence is weak evidence about other users; this cut rests on positioning, **not** on the corpus. *The prioritization half was NOT cut* — it became **M5.E11**. **The PREPARE seam** (PLAN→EXECUTE) is a separate question, untouched by the re-audit, and stays parked below.

### ~~Security upgrade — gstack's 15-phase audit~~ — **✂ ABANDONED (threat-model fit)** · Phase 8 parked
**Tag:** roadmap
`/cso` Phases 2–11 target secrets archaeology, dependency supply chain, CI/CD, infrastructure, webhooks and STRIDE — **an attack surface a markdown-plus-Node-CLI plugin does not have.** Signal's two security findings (`B14`, `B22`) were both caught by its **existing** REVIEW panel; replacing a working skill with one aimed at a different threat model is a downgrade. **Carved out and parked: Phase 8 (skill supply chain)** — *"SKILL.md files are NOT documentation… they are executable prompt code"* — the one phase matching Signal's shape. *Trigger:* first report of a malicious or tampered skill in any Claude Code plugin ecosystem.

### ~~Harder TDD + `<HARD-GATE>` + systematic-debugging~~ — **✂ SPLIT: 1 abandoned, 2 parked**
**Tag:** roadmap
- **`<HARD-GATE>` → ABANDONED. There is nothing to port** (**C3**): 4 grep hits repo-wide, exactly 1 in a live skill, **zero** in `hooks/` or `tests/`, no parser, no validator; the maintainer calls the mechanism unsettled. Signal already has the capability natively and better — the exit-2 write-guard, the `PreToolUse` hook, and an FR1 retro gate that **hard-blocked its own SHIP**. *The real upstream machinery — `subagent-driven-development`'s five-round breaker with `BLOCKED` propagation — is parked in its place.*
- **Harder TDD → parked.** Prompt-shaped; *trigger:* **M5.E8 lands** and a measured run shows TDD-instruction adherence below target. **✅ Trigger checked and declined 2026-07-28 (M5.E13 DISCUSS, D-M5E13-6).** First half fired (M5.E8 landed as v0.1.13); **second half not met — TDD-instruction adherence has never been measured.** **RE-PARKED with a condition that is now cheap to evaluate:** run the TDD-instruction canary during the next Epic that writes tests — the harness exists, so this is one command, not a project. *Promote if:* adherence scores below 3/3 as-written. *Review by:* **2026-10-31** regardless. **This row is a checked-and-declined condition, deliberately distinguishable from an unchecked one** — `B39`'s second half.
- **`systematic-debugging` → parked.** No cataloged bug traces to its absence and the `debugger` agent covers the ground. *Trigger:* two consecutive Epics where a bug takes >3 fix attempts.

### Context-discipline hooks — **parked, all three, with triggers**
**Tag:** roadmap
Hook-driven context discipline (planning-with-files lineage). **2-Action Rule** — prompt-shaped; *trigger:* M5.E8 lands + one measured instance of executor context drift. **✅ Checked and declined 2026-07-28 (D-M5E13-6): first half fired, second half not met — no instance of executor context drift has been recorded.** RE-PARKED; *promote on:* the first recorded instance in any Signal REVIEW. *Review by:* **2026-10-31**. **PostToolUse `PROFILE.md` re-read** — deterministic, so measurement does not gate it, but no bug traces to PROFILE drift; *trigger:* first recorded instance of a command acting on a stale tier. **Findings-quarantine for untrusted web content** — ⚠ **the highest-severity parked item in this file.** Signal's researcher agents *do* call `WebSearch`/`WebFetch` with no protection against fetched content carrying instructions. **No incident is recorded, so by the rules it stays parked** — flagged so a low verb is not read as low risk. *Trigger:* first injection-shaped finding in any Signal REVIEW, or a credible ecosystem report. **⚠ Restored by M5.E7 REVIEW (2026-07-26) — the audit's own recommendation was dropped between documents:** `M5.E7-DISPOSITIONS.md` §7 called this *"the biggest risk in this table"* and said plainly — *"if you want one `continue` promoted to `build` on precaution rather than evidence, make it that one."* The roadmap renders it as an open question and this file as a flagged park; **neither carries the recommendation.** The verb is unchanged and the promote/park call is Brett's — but the audit's advice should reach him as advice. **Note the trigger's own weakness:** both conditions require someone to *notice*, and per `B39` nothing evaluates them; unlike every other parked item, being late here has a **safety** cost rather than an opportunity cost.

### Multi-runtime adapters — **✂ Cursor ABANDONED · Codex parked**
**Tag:** roadmap
**Cursor → cut on demand-fit** — this file already said *"least evidence of demand."* The trap avoided: Brett works **in** Cursor but runs **Claude Code** inside it; that is not demand for Signal on Cursor's own agent runtime. **Codex → parked** at the corrected ~6/10 estimate (direct analogs now exist: `AGENTS.md`, skills with on-demand loading, subagents with tool allowlists, a hooks framework; real gaps are Custom Prompts being deprecated — 18 commands re-cast as skills — and no `AskUserQuestion` equivalent). *Trigger:* a user asks in writing, or Brett wants a second runtime.

---

## Parked — the trigger watchlist *(not sprint material)*

These stay trigger-gated; the standing **WATCHLIST** entry (A1) in `ISSUES-INBOX.md` checks their promote-back conditions at every `/sig:plan` drain. **Tag:** hygiene (except the PREPARE-phase item, which is roadmap).

- **E1 Slices 3–5** — Linux/WSL install matrix + versioning policy + validator hardening. *Trigger:* a platform tester volunteers.
- **E3 contribution scaffolding** — *Triggers:* a/b/c in its entry.
- ~~**Synthesizer validator-side check** — *Trigger:* 2+ regressions by 2026-08-23~~ — **CLOSED 2026-07-25: trigger did not fire, evidence-backed.** Checked during M5.E7 (Brett-approved). **Zero** regressions in the window: none in `BUGS.md`, none in any retro, no fix commits touching `embedSection` since the 2026-05-23 deferral (its files were touched once, by unrelated M5.E3 born-on-v3 work). **The zero is informative, not vacuous** — `tests/synthesizer-regression.test.js` + `tests/landscape.test.js` carry a dedicated regression guard (24 `embedSection` references, plus `tests/fixtures/synthesizer-bug-r1/`) that has run green in every suite execution, so the code was continuously exercised rather than merely untouched. The deferral decision was correct and the build condition never arose. *Closed by decision rather than allowed to lapse at the date — the corpus's only dated expiry, and letting it pass unobserved would have been exactly the "no cut decision was ever recorded" failure this Epic catalogued against five un-cut ports.*
- **`/sig:doctor` helper-script split** — deferred refactor.
- **`docs/map` Stages 2/3** — the deeper map-refresh protocol.
- **GitHub Issues full setup** — *Trigger:* first live external tester — **FIRED 2026-07-15 and never acted on.** M5.E7 flagged this as the clearest instance of `B39`: a trigger that fires, is recorded as fired, and promotes nothing, across ≥2 `/sig:plan` drains. **Forcing the call is an M5.E9 deliverable** — promote it, or re-park it with a *new written trigger and a date*. Silence is not a decision.
- **Dependency and release currency** *(roadmap; new 2026-07-26)* — is the user's stack moving underneath them? (Brett's worked example: Node's middleware→proxy transition — which versions to use.) **The item furthest from Signal's existing shape**: it needs a live external data source (registry / changelog / advisory reads) Signal has never had, which means network I/O, caching, and a staleness model. *Trigger:* **M5.E12 lands** (shared "watch an external surface" machinery), **or** a Signal-built project ships on a deprecated API and it is recorded.
- **Cross-install telemetry bolt-on** *(roadmap; new 2026-07-26)* — pool performance data across Signal installs to improve the harness over time. Mass-market palatability **explicitly waived** by Brett, so consent is a design parameter, not a blocker. ⚠ **Hard ordering constraint: M5.E8 first** — you cannot pool across installs what you cannot measure in one; backwards it collects noise at scale. Honest caution: at 7-of-12 adherence, **four users will show nothing for a long while.** A compounding asset, not a near-term signal. *Trigger:* M5.E8 lands and local measurement is repeatable. **✅ Checked and declined 2026-07-28 (D-M5E13-6).** Both halves arguably fired — M5.E8 landed and the harness is re-runnable — **and it is re-parked anyway, on the item's own stated caution:** with four users there is nothing to pool, and the entry itself says they *"will show nothing for a long while."* Building now collects noise and burns the consent design early. **RE-PARKED**; *promote on:* **ten or more non-Signal users**, or the local harness has produced **five verdicts** worth comparing. *Review by:* **2026-12-31**.
- **`subagent-driven-development`'s five-round breaker + `BLOCKED` propagation** *(roadmap; new 2026-07-26)* — the mechanism Signal was actually reaching for when it queued `<HARD-GATE>`. 1,063 lines upstream, sized **L**, prompt-shaped. *Trigger:* M5.E8 lands. **✅ Checked and declined 2026-07-28 (M5.E13 DISCUSS, D-M5E13-6) — and this one is a re-park *against* its trigger as written, so the reasoning is recorded rather than assumed.** The trigger reads *"M5.E8 lands"* full stop, and M5.E8 landed. But both of its neighbours in this section read *"M5.E8 lands **and** a measured run shows X"* — **this trigger is read as having lost its second half.** Landing the measurement establishes that a thing *can* be checked; it is not evidence the problem exists. This is a breaker for agents that loop without converging, and **Signal has no recorded instance of that happening** — 1,063 lines of port against an unobserved failure. **RE-PARKED**; *promote on:* one measured run where an agent loops past **three rounds** without converging, **or** any Epic where an executor visibly stalls. *Review by:* **2026-10-31** regardless. **If this re-park is wrong, it is wrong in a recorded, dated, arguable way — which is the outcome `B39` exists to force.**
- **gstack `/cso` Phase 8 — skill supply chain** *(roadmap; new 2026-07-26)* — carved out of the abandoned security port. *Trigger:* first report of a malicious or tampered skill in any Claude Code plugin ecosystem.
- **PREPARE-phase early-promotion triggers** *(roadmap)* — 3 conditions; can also fire from lived signal ahead of the upstream-phases work.
- **STATE auto-update Options B/C** (git hook / compute-on-read) — *Trigger:* Option A discipline demonstrably fails.

## CLAUDE.md version headline: derive at release, check as backstop

**Tag:** roadmap
<!-- backlog-key: cfbef0eda31a4cb16a5b83e57d2613905e98e969 -->

**Status:** Logged 2026-08-18 via `/sig:add`.

**`CLAUDE.md`'s "Latest: vX" is a published fact nothing derives — and it went stale one commit after a release THREE times on 2026-08-18 alone** (v0.1.28, v0.1.29, v0.1.30), each time needing its own follow-up PR.

`M6.E2` shipped five checks for exactly this class and **none of them reads `CLAUDE.md`**. The five look at `BUGS.md`, `CHANGELOG.md`, milestone files and `facts.md`; the one document every reader and every agent opens first is not among them.

**Two candidate fixes, and they are not equivalent:**

1. **A sixth published-fact check** — `CLAUDE.md`'s `**Latest: vX**` against `plugin/.claude-plugin/plugin.json`. Mechanically trivial, reuses the harness, and reach is **1 of 12** like the others (only Signal keeps a release headline in its `CLAUDE.md`). It detects; it does not prevent.
2. **Make it part of the release** — `tools/cut-release.js` already sets `facts.md`'s test count from the gating vitest run. The version headline is the same kind of value. This *prevents* rather than detects, and prevention is the better answer for a value that has one correct source.

**Recommendation is (2), with (1) as the backstop** — the same pairing `M6.E2` used for `BUGS.md` (the write path re-derives, and a check catches what the write path missed). Doing only (1) means a check that fires on every release until someone hand-fixes it, which trains the mute.

⚠ Worth noting against (2): `cut-release.js` currently has its own open defect (`B84` — its no-release-notes guard is unreachable and relabels a historical section instead of refusing), so touching it means reading that first.

---





*Last updated: 2026-08-18*

---


*Last updated: 2026-08-19*
