# Backlog

Groomed, sequenced roadmap — promoted from the issues inbox (`ISSUES-INBOX.md`). Roadmap-vs-hygiene is a **Tag** on each entry, not a separate file (**roadmap** = new capability / direction; **hygiene** = maintenance, trust-hardening, doc/tooling cleanup). Sprint clusters are the sequencing spine; within a sprint, order is listed where it matters.

> **Source.** Restructured from the point-in-time backlog pass `BACKLOG-REVIEW-2026-07-04.md`, now archived at [`archive/BACKLOG-REVIEW-2026-07-04.md`](archive/BACKLOG-REVIEW-2026-07-04.md) (move-never-delete — the snapshot is frozen; this file is its living successor). The snapshot's added items (A1–A5), sharpened items, and sprint clusters are folded in below.


> **Latest generated review:** [`BACKLOG-REVIEW-2026-09-13.md`](BACKLOG-REVIEW-2026-09-13.md) —
> produced by `/sig:advise`, not by hand. It recommends and declines with citations that resolve;
> it changes nothing in this file. The inbound link is a **one-time human step at SHIP**: the command
> writes its artifact and nothing else, deliberately.

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

### Jev key and receipt hardening — the pass-3 REVIEW residue · **fix lane** · small · *filed 2026-09-27 from `M6.E3` REVIEW*

*Plain: the small leftovers three rounds of fresh review found in the Jev checks, none Important, all recorded in `M6.E3-REVIEW.md` § pass 3.*

- **Medium limit:** a template `.env.example` with a real key, copied by the user, supplies the author's key. Warn when a tracked `.env*` sibling holds `TYPESAFE_API_KEY`, and add a README line.
- **`dotenvRefusal`:** use `LC_ALL=C` or `rev-parse` exit status instead of stderr text; drop the `GIT_*` env vars from the spawn.
- **`releasedSectionsFor`:** heading-only sections over the cap; a heading over the cap; partial-line citation.
- **`CONTROL_RE`:** needs the `u` flag and tag characters; handle `\n` in messages.
- **Audit gaps; test gaps:** a Linux-proof `.ENV` case, global-gitignore isolation, exit-128 variants, and the exact-count stale check.
- **Shared bounded worker pool** for both Jev checks.

### More places Jev can decide — where code cannot, and only after measuring · **roadmap** · medium · *filed 2026-09-26 from `M6.E3` EXECUTE*
### ~~Cross-references become links, so a walker can check them~~ · **SUPERSEDED 2026-09-02 by `dangling-reference`** — the identifier half is solved better; the file-path half remains

⚠ **The proposal was to rewrite `B112`-style references as markdown links so the existing dead-link
walk would catch them. Resolving the id directly turned out strictly better and far cheaper:** no
backfill across 100+ files, works on prose already written, and it verifies the **referent** rather
than the syntax — a well-formed link can point at a heading that says nothing about the id. Shipped
as `checkDanglingReferences`; found `B111` (withdrawn, still cited in 8 files) and a typo'd
`D-M6E19-6`, both fixed.

**File-path half: DONE 2026-09-02 for the live surface** — 81 bare paths converted to links across
`README.md` and every `analysis/` document; zero dead links introduced; `analysis/CROSS-MODEL-REVIEW-SCOPE.md`
stopped reading as an orphan. ⚠ **Four targets remain unconverted and both reasons are deliberate:**
three are cited only in **historical `.planning/` documents**, which are not rewritten to match later
conventions (the same rule that left 102 files saying `/sig:sweep` after the rename); and
`analysis/SIGNAL-INTEGRATION-RUNDOWN.md` plus `docs/migration-state-schema-v0.1.x.md` are cited from
**`CLAUDE.md`, which is at its budget ceiling with zero headroom** — a link costs more bytes than a
bare path, so the conversion is **blocked by the de-bloat row above** and sequenced behind it rather
than settled by raising the ceiling a second time.

**Original scope of this half:** the *file-path* half. `checkOrphanDocs` measured **5 documents
referenced only as bare backticked paths** — `CLAUDE.md` names `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`
**ten times** without linking it once. Those still break silently on a move and no walker verifies
them. Converting them is a small, bounded edit now that the check names exactly which files. Original
entry:

### Cross-references become links, so a walker can check them · **hygiene** · small · **filed 2026-09-01**

*Plain: writing `B112` in a sentence proves nothing; writing a link means a script can catch it when it's wrong.*

**`B112` was cited as *filed* in six places across five documents for three days while absent from
`BUGS.md`** — `M6.E2`'s published-facts class, committed in the same span as the checks for it. Every
one of those citations was a bare token, so nothing could verify it.

*Source:* [`../analysis/DEEPSEEK-HARNESS-ASSESSMENT.md`](../analysis/DEEPSEEK-HARNESS-ASSESSMENT.md)
§2.2 — their rule is that cross-references use relative markdown links *"never bare prose or numbers —
so they are mechanically checkable."*

**The cheapest item in that assessment, because the detector already exists:** `/sig:sweep` walks dead
internal links today. A link-shaped `B`-citation would have been caught with no new code. ⚠ The work is
the **convention plus a backfill**, not a detector — and the backfill is the large half.

*Done-when:* B-ids and D-ids in `.planning/` prose resolve as links (or are deliberately exempt with the
exemption stated), and `/sig:sweep` reports the unresolvable ones.

### Doc↔code symbol contract, generalized past `drive.md` · **roadmap** · medium · **filed 2026-09-01**
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

### ~~Command namespace — decide whether group 4 gets a prefix~~ · **DONE — `docs-` prefix shipped 2026-09-02, `D-BR0902-1`** (clean break, no aliases)

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

#### ~~`.planning/ENVIRONMENT.md` — the environment the agent can't see~~ · **DONE 2026-08-22** · three deviations recorded at `D-BR0822-1`…`3`

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

#### ~~The measurable-outcome question in DISCUSS~~ · **DONE 2026-08-23** · asked at FULL+FEATURE; the honest decline is first-class and pinned

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

#### ~~Cross-model review at REVIEW~~ · **SCOPED 2026-08-23** · `analysis/CROSS-MODEL-REVIEW-SCOPE.md` — verdict: **build neither**; the binding problem is that nothing READS the reviewer already running (measured: 4 real findings across 10 PRs, all four unread until the scoping pass went looking)

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

### Promoted from the inbox drain *(2026-08-10, `D-BR0810-1` … `D-BR0810-3`)*
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

## Nothing compares the tier a decision states with the tier the phase commands read

**Tag:** hygiene
<!-- backlog-key: 147da83624ee957add0e2570acb0099417515ddd -->

**Status:** Logged 2026-09-14 via `/sig:add`. Filed from `/sig:resume` at M6.E8 PLAN entry (`D-BR0914-1`).

No check compares a decision's or a `*-REQUIREMENTS.md` frontmatter's stated tier against the effective profile. Found 2026-09-14 by `/sig:resume` one command before `/sig:plan`: `D-M6E8-1` and `M6.E8-REQUIREMENTS.md` both said **FEATURE**, `readEffectiveProfile` returned **FULL**, because the decision assumed the project profile was FEATURE (it is FULL) and declined to write `M6.E8-PROFILE.md`. `M6.E6`/`M6.E7` were FEATURE only because each had one. PLAN would have run four researchers and a full security audit against a decision that chose two and `basic`. Corrected by `D-BR0914-1`.

**Two candidate fixes, not one.** (1) A published-fact drift check for `M6.E2`'s registry: the `tier:` field of the current Epic's `*-REQUIREMENTS.md` must equal `readEffectiveProfile(...).tier`, category 3 (needs a person). Today the requirements `tier:` field is reconciled against nothing. (2) A `discuss.md` change: when DISCUSS chooses a tier different from the project profile's, the per-Epic profile write is not optional — `D-M6E8-1`'s `B75` argument (a per-Epic profile identical to the project's is a setting read by nothing) is sound only when the two are identical, and DISCUSS never checked that they were.

**Pattern:** `M6.E7`-retro finding — a claim written from the shape of the sibling Epics rather than derived from the artifact — one Epic later.

---


*Last updated: 2026-09-14*

---



*Last updated: 2026-09-27*
