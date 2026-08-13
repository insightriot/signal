# Claim Integrity — the second defect class

> **What this is:** the combined analysis of a cross-repo investigation (2026-07-28) into why Signal-run
> projects keep producing false completeness claims — "0 gaps", "all criteria verified", "checklist
> complete" — in artifacts that look authoritative. Field evidence is eval-project-C Phase 11; the causes
> are in Signal. This doc names the class, traces the mechanism, ranks the fixes, and records the
> tracker-integration decision. It is the seed for M5.E10 scoping, the same way
> `AGENT-EFFECTIVENESS-ALIGNMENT.md` seeded M5.E8.
>
> `verified-against:` eval-project-C working tree (Phase 11 shipped, `ae55179`+) and Signal `aff4098`
> (v0.1.13) on 2026-07-28. Line numbers were verified that day and will drift; claims were re-derived from
> the files, not from memory of them — which is the whole point of this document.

---

## §0 One paragraph

Signal's flow demands many completeness claims and contains **zero mechanisms that check any claim against
its source**. Every such claim in the corpus is self-attested prose: the model ticks its own box,
enumerating from whatever it just wrote (the shape of the work) rather than from the source of truth (the
artifact). Claims then compound across phases — VERIFY inherits PLAN's map, REVIEW restates VERIFY's notes
with more confidence and no more evidence — and every catch to date has been incidental, not mechanical.
The problem grows with rigor, because each rigor feature adds claim-producing surfaces (reports,
checklists, handoffs, retros) while the claim-checking side has never been built. **More rigor currently
means more places to write an unchecked assertion.**

## §1 The class, named

**Claims written from the shape of the work rather than from the artifact.** The author composes a
summary/coverage/status statement from their mental model of what just happened, instead of re-deriving it
from the thing it describes. The false statement is always *plausible* — that is what makes it dangerous.

This is **distinct from** the class M5.E8 named (*"a guard written, shipped, and never called"* —
`.planning/M5.E8-RETROSPECTIVE.md` §"What to feed back into Signal": B39, B46, I2). The two compose badly:
the first class writes the false claim; the second class ensures the check that would catch it is never
invoked. Signal abstracted the second class into a named defect with a candidate mechanism. The first
class has been **observed at least seven times and never abstracted** — until this document.

Where it strikes: **the summary-shaped parts of artifacts** — closing tallies, "Next:" handoff sections,
pre-ship checklists, correction notices. Sections written last, about other things, from memory.

## §2 Field evidence — eval-project-C Phase 11 (FULL tier, v0.1.13, ~36h DISCUSS→SHIP)

Five instances in one phase. Maximum tier rigor (`nyquist_enforcement: strict`, `gate_strictness: strict`,
all dims) prevented none of them, because tier rigor dials up prose obligations, not derivations.

| # | False claim | Written by | Root | Caught by | Status in working tree |
|---|---|---|---|---|---|
| 1 | `.env.example`: "$1.00 allows roughly 5 previews" — nothing accumulates; it is an on/off threshold | `/sig:execute` (same commit as the code it contradicts) | Doc written from what "cost ceiling" *connotes*, not what the function does | Voluntary self-review pass inside EXECUTE | Fixed (`c05d3f7`) |
| 2 | `PHASE11-VALIDATION.md:36`: "2 NFRs, 0 gaps" — while its own dimension-2 prose 26 lines up correctly maps "9.2→S4" | `/sig:plan` | Tally counted the rows of the table just typed, not the NFRs in REQUIREMENTS.md. **The file contradicts itself — machine-detectable within one file, and nothing looked** | Named as root by VERIFY-amendment and REVIEW | **STILL LIVE, never amended** |
| 3 | `PHASE11-VERIFICATION.md`: NFR-9.2 absent from the coverage table | `/sig:verify` | Enumerated from PLAN's Nyquist map, not from REQUIREMENTS.md. Its claims were hedged to "every **mapped** row" — literally true, which is why the strict Nyquist gate could not bite: **the gate verifies the map, not the requirement set. An unmapped requirement is invisible to a mapped-row check** | `/sig:review`, incidentally — its OWASP A04 row independently forced a read of REQUIREMENTS.md | Amended in REVIEW (banner + row) |
| 4 | "Phase-8 security backfill still owed" — Phase 10's REVIEW had discharged it, ticked in four places | `/sig:verify` ("Next: REVIEW" handoff), then **escalated** by `/sig:review` to a bolded warning and copied into STATE.md | Structural inference from `PROFILE.md` `backfill_warnings` — an append-only history with **no discharged marker**, so a closed obligation reads as open forever. The schema makes the true state unrepresentable | `/sig:ship` pre-ship checklist forced a read of the Phase-10 record | REVIEW + STATE corrected; **`PHASE11-VERIFICATION.md:139` "still owed" STILL LIVE** |
| 5 | `PHASE11-SHIP.md`: "Both `PHASE11-REVIEW.md` and `STATE.md` corrected before this commit" | `/sig:ship` (the correction pass itself) | Completeness claim scoped to the two files that were open, not to a corpus grep for the claim — which returns the uncorrected `PHASE11-VERIFICATION.md:139` | Found by this investigation | **STILL LIVE** |

Prior-phase analogue, same mechanism at the coverage layer: `e2e/stage8.spec.ts` was unloadable since
Phase 6; Playwright reports an unloadable file as "0 tests found", so AC-15.2's mapped E2E cell counted as
covered across multiple VERIFY reports while never once executing (fixed Phase 10, `8d3a743`;
`.planning/OPEN-QUESTIONS.md` in that repo records it — with its own nested correction).

**Mechanism, compressed:** #4 is the purest specimen. The claim gained confidence at each restatement
(passing clause → bolded warning → STATE.md) while never gaining evidence. One grep of `PHASE10-REVIEW.md`
would have refuted it at any hop.

## §3 The same class in Signal's own corpus, previously un-abstracted

1. M5.E7: **"Six counts were wrong until re-derived"** (`.planning/RETROSPECTIVES.md`, M5.E7 hook).
2. M5.E7: false-greens were **the largest retro cluster at 9 items** (`.planning/ISSUES-INBOX.md`, the entry that seeded M5.E8).
3. M5.E8: R1's research claim — "these four commands name zero library calls" — falsified on re-derivation (they name 4/3/3/0); the inference built on it was wrong (`M5.E8-RETROSPECTIVE.md`).
4. M5.E8: the `OBEYED` record shipped without caveats and needed an appended correction → fixed narrowly as `buildCaveats()`: **"generate scope, never remember it"** (`M5.E8-RETROSPECTIVE.md` §4). The one place the remedy exists as code, for one record type.
5. C6: a locked decision rested on a ~4.5×-wrong date (M5.E7).
6. `B40`: citation integrity in `analysis/` unenforceable by construction (`.planning/BUGS.md`).
7. **Live on 2026-07-28:** `.planning/RETROSPECTIVES.md` presented as the complete retro index while missing M5.E8 entirely — the regen is Epic-close-gated, the gate skipped (`B36`'s third sighting), nothing checks retro-index freshness (`/sig:sweep` covers INDEX.md only). Fixed same day; the freshness check is fix #8 below.

## §4 Why Signal permits this — five structural causes

1. **`commands/verify.md` never names `REQUIREMENTS.md`.** Its entire coverage instruction (§1) is "for
   each task in `{phase}-PLAN.md` … record pass/fail." A requirement that never became a PLAN task AC is
   structurally outside VERIFY's enumeration loop. The report instruction (§5) is one sentence — no
   template, no denominator, no required "what this could not establish" section. The exit criterion "All
   acceptance criteria verified with evidence" is a self-attested checkbox over a self-enumerated set.
2. **The agents with the right shape are unreachable.** `agents/verifiers/verifier.md` names
   REQUIREMENTS.md as input and emits a Requirement Coverage table; `agents/verifiers/nyquist-auditor.md`
   is the only artifact in the repo demanding "{n} of {total}". **No command dispatches either** —
   `commands/verify.md` spawns no agents at all.
3. **REVIEW is designated the faithfulness backstop in two places and implements it nowhere.**
   `commands/ship.md` §5.5 ("REVIEW is the faithfulness backstop") and the `tools/lib/evict.js` header
   both delegate semantic-faithfulness checking to REVIEW; `commands/review.md` contains no step reading
   any prior `.planning/` artifact for claim accuracy. That is class #2 (guard never called) enabling
   class #1 (claim never checked).
4. **Every deterministic validator checks structure, not claims.** doc-hygiene (links, roster counts,
   versions, stubs — and its walk excludes `.planning/`), sweep (INDEX freshness, inbox staleness),
   retro gate (headings present + byte length), evict gate (discrete-token no-loss, explicitly not
   semantic). Exactly two claim-vs-reality checks exist in all of Signal — `checkRosterCounts` and
   `adherence-ceiling.js --check` — and neither would catch any Phase-11 defect.
5. **The M5.E8 harness cannot see this class by construction.** Its traces are "a named function was
   called" / "a named file was written" — never what the file *says*. A VERIFY report omitting a
   requirement while writing `{phase}-VERIFICATION.md` scores as a PASS trace. VERIFY and REVIEW are also
   the two least trace-measurable commands (3/26 and 3/34 directives). D-M5E8-2's "observable or dropped"
   rule dropped claim fidelity — correctly, for that Epic; the drop is now the open flank.

## §5 Why frequency is rising

- **Claim surfaces grow with every release; checks don't.** Each new checklist, report section, handoff
  note, and retro requirement is another self-attested completeness statement.
- **Corpus growth pushes reading toward derived artifacts.** As `.planning/` grows, context economy makes
  the model read maps (PLAN tables, prior summaries, STATE) instead of territories (REQUIREMENTS, the
  actual closing record) — and the maps are where the class lives.
- **Append-only ledgers age into misleading shapes.** Any obligation list without a discharge marker
  accumulates entries that read as open. Older project = more false "still owed" inferences available.
- **Restatement compounds.** One ungrounded upstream claim seeds several downstream artifacts, each
  restatement more confident than the last.

**Why it matters:** the false claims live in exactly the artifacts future sessions treat as ground truth
(`resume.js` reads STATE as gospel; every fresh session orients from these files). An authoritative-looking
"0 gaps" is worse than no claim — it terminates investigation. The code has held up better than the prose
about it; the prose is what Signal exists to make trustworthy.

## §6 Fixes, ranked (kill-map per item)

The principle, generalized from `buildCaveats()`: **every completeness claim must be (a) mechanically
derived, (b) deterministically checked, or (c) explicitly labeled unverified.** No fourth state.

1. **Deterministic requirement-coverage diff** — new `tools/lib` check + instruction in `verify.md`:
   extract every FR/NFR/AC ID from REQUIREMENTS.md, diff against IDs present in the VERIFICATION artifact;
   any requirement ID absent from the report = red. Plus an intra-file consistency check for
   VALIDATION.md: dimension-2 assignments and Nyquist-map rows must agree (Phase 11's root was a
   single-file self-contradiction). *Kills #2 and #3 at origin and inheritance.* **Home: M5.E10.**
2. **Required VERIFICATION template** — denominator table + mandatory "what this could not establish"
   section. Already captured (`ISSUES-INBOX.md` self-critique entry; `AGENT-EFFECTIVENESS-ALIGNMENT.md`
   Rec 3). Its done-when is structural (section present), so it only works **paired with #1**. **Home: M5.E10.**
3. **Implement the backstop `review.md` is already assigned** — a claims-audit step: every
   coverage/status/completeness claim in VERIFICATION and prior-phase artifacts verified against its
   source. The adversarial `docs-verifier` design ("every claim guilty until the filesystem proves
   innocence") has been parked in ISSUES-INBOX since 2026-05-12. *Kills the class generally; catches what
   determinism can't.* **Home: M5.E10.**
4. **Obligation lifecycle → single-home tracker** — see §7. Offline fallback: a `discharged` status field
   (+ discharged-by ref) on `PROFILE.md` `backfill_warnings` and any other obligation ledger. *Kills #4's
   enabler.* **Home: its own epic (see §7); the fallback marker can ship earlier.**
5. **Correction protocol** — a correction is complete when a corpus grep for the claim (and its
   restatements) returns only corrected instances: root + all carriers, not the files that happened to be
   open. Mechanically checkable at SHIP. *Kills #5 and the residue problem.* **Home: M5.E10.**
   **Corollary — retract at the granularity people search at** *(added 2026-07-28, from a review of the
   eval-project-C correction pass)*: an amendment appended below a false claim leaves the claim's own
   line reading as live. `grep -rn` prints **one line**; a correction three lines down is invisible to it,
   and grep-shaped reading is exactly how the backfill claim propagated VERIFY→REVIEW in the first place.
   So the claim's line must carry its own retraction inline (`~~still owed~~ **[RETRACTED — see
   amendment below]**`), not merely be followed by one. Note the tension this resolves: *amend, never
   rewrite* and *the grep must come back clean* cannot both hold if amending means appending — the
   resolution is that the matching line must be **self-correcting**, not absent. `PHASE11-SHIP.md`
   got this right by accident (its retraction fell on the same line); everything else needed the fix.
   *Done-when, sharpened:* the SHIP check tests whether each matching **line**, read alone, still
   asserts the false claim — not merely whether a correction exists somewhere in the file.
6. **Provenance rule for cross-phase restatement** — never restate (and never *escalate*) an upstream
   claim about a third artifact without opening that artifact. Anti-rationalization tables, as a positive
   recipe — fits the B38 discipline-vs-shaping reclassification. *Degrades #4's compounding.* **Home: M5.E10 (B38 work).**
7. **Wire up or fold in the verifier agents** — the enumerate-with-a-denominator discipline already exists
   in `agents/verifiers/`; it is unreachable from every command. Either commands dispatch it or its
   discipline moves into the command text. **Home: M5.E10.**
8. **Retro-index freshness check** — sibling of `checkIndexFreshness`, trivially buildable because
   `regenerateIndex` is deterministic and compare-before-write. *Kills recurrence of §3 item 7.* **Home:
   M5.E10 or the B36/B48 fix Epic, whichever ships first.**

## §7 The tracker decision (Brett + Claude, 2026-07-28)

**Question:** doesn't #4 argue for integrating with a real issue tracker (Linear / GitHub Issues), where
closed is *checked*, rather than status markers in markdown?

**Position: agreed on direction — for obligations.** The structural advantages are real, not cosmetic:

- **"Closed" in a tracker is an event** (actor, timestamp, audit trail); in markdown it is a string an
  agent rewrites wholesale on every edit — every write a chance to corrupt (B41–B45 were exactly this
  shape against STATE.md).
- **Trackers eliminate the inference step.** Phase 11's backfill falsehood was an inference from a list's
  shape. Against a tracker there is nothing to infer: `gh issue list --state open` is the answer, and the
  ship-gate check "anything still owed?" becomes a one-line query instead of a schema Signal maintains
  forever.
- **The honest concession:** Signal has been incrementally building its own issue tracker out of markdown
  (ISSUES-INBOX, BACKLOG, BUGS, dispositions, backfill_warnings) and keeps re-hitting bugs trackers solved
  decades ago. B46 — two files disagreeing about disposition state with nothing noticing — cannot happen
  when status has one home.

**Two conditions, both load-bearing:**

1. **Single home.** The tracker is the *only* place obligation status lives. Markdown references issue
   numbers and never restates status — mirroring status back into files recreates the B46 class with
   extra steps. Half-integration is worse than none.
2. **Closing must be wired into the phase gates.** Phase 10 discharged the backfill and stamped nothing —
   nothing in the flow made it. If nothing closes the GitHub issue either, the same false "still owed"
   appears in a nicer UI. SHIP/REVIEW need a "what's open, and did this phase close what it claims it
   closed?" step. The tracker makes that step trivial and definitive; it does not make it automatic.

**The boundary — what the tracker does NOT fix:** findings about *claims* (§6 items 1–3, 5). A false
"0 gaps" is an assertion about a document, not a work item; no tracker checks whether a verification
report enumerated the requirements file. If the epic becomes "integrate a tracker and the honesty problem
is solved," the furniture moved and the disease stayed.

**Scope split:** things with an open/closed **lifecycle** (backfills, bugs, deferred work, the capture
inbox) → tracker. Things that are **records** (decisions, retros, requirements, state narrative) → stay in
`.planning/`, versioned with the code. **GitHub Issues first** (users already have it; `gh` is already in
the ship flow; zero new auth), Linear as a possible later adapter. Prerequisite to design honestly:
Signal's guards are deliberately offline+deterministic and Signal has no permission vocabulary yet
(`/sig:permissions`, per `AGENT-EFFECTIVENESS-ALIGNMENT.md` Call A) — the integration needs a declared
degraded mode, which is precisely the status-marker fallback of §6 item 4.

## §8 Live residues as of 2026-07-28

**Signal (this repo):**
- ~~`RETROSPECTIVES.md` missing M5.E8~~ — **fixed 2026-07-28** (regen run + hand-written hook). The
  freshness check (§6 item 8) is still unbuilt.
- ~~Stale citation: `AGENT-EFFECTIVENESS-ALIGNMENT.md` and the ISSUES-INBOX self-critique entry both
  cite `commands/verify.md:64-66`~~ — **fixed 2026-07-28 in `AGENT-EFFECTIVENESS-ALIGNMENT.md`**, and
  re-cited by **section name** (§5 "Write Verification Report") rather than re-pinned to the current
  line numbers, because a line cite rots on the next edit — this one rotted at M5.E9. The ISSUES-INBOX
  copy is left as-is: it is a dated verbatim capture, not a live reference. *Generalizable:* prefer
  section/symbol cites over line cites in `analysis/`; this is the cheap half of `B40` (citation
  integrity unenforceable by construction) and of M5.E12's `verified-against:` stamps.

**eval-project-C (fix there, not here — listed so no agent re-trusts them):**
- `.planning/PHASE11-VALIDATION.md:36` — still reads "2 NFRs, 0 gaps"; named as the NFR-9.2 root by two
  other artifacts, never amended.
- `.planning/PHASE11-VERIFICATION.md:139` — still says the Phase-8 backfill is "still owed"; it was
  discharged by Phase 10 REVIEW.
- `.planning/PHASE11-SHIP.md` "Both … corrected" — false by scope while the line above stands; amend when
  the VERIFICATION line is fixed.
- `PROFILE.md` `backfill_warnings` — still cannot represent "discharged" (schema; §6 item 4).

## §9 Routing

- **M5.E10 (review hardening / false-green audit)** — trigger ("M5.E8 lands") is satisfied. Seed its scope
  from §6 items 1–3 and 5–8. Its existing done-when standard applies: every guard fix ships with a test
  demonstrated to fail against `main`.
- **Tracker integration** — its own epic, scoped by §7's two conditions and boundary. Additive to, never a
  substitute for, the claims work.
- **This class deserves a ledger identity** — on triage, either a B-number or a named entry beside the
  "guard never called" class, so future retros can count sightings instead of re-discovering it.
