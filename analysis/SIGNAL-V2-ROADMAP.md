# Signal — v2 Roadmap

**What Signal builds next, in what order, and why — grounded in Signal's own record.**

**Produced by:** Milestone 5, Epic 7 (*the v2 direction audit*), 2026-07-25 → 2026-07-26.
**Status:** proposed sequence, **ratified in part by Brett 2026-07-26** (see § Ratified / § Open).
**Supersedes:** `SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` §1 (in frame, not only in content) and the
25 unchecked port checkboxes in `.planning/MILESTONE-5.md` § "Candidate v2 feature-port scope".
`SIGNAL-INTEGRATION-RUNDOWN.md` remains readable as the v1-era target vision; **where it and this
document disagree, this one governs.**

**Evidence base, stated at its real size (P6):** **12** retrospective files carrying
`## What to feed back into Signal` — **not the 16 that carry the heading**; 4 are `[FILL IN]` stubs
and were **reported, not reconstructed**. **39 items, ~1,510 words.** Plus 40 catalogued bugs, 39
inbox entries read at **8% of lines** under a stated cap, 38 tracked backlog subjects, and five live
source-repo verifications dated 2026-07-25. Working files: `.planning/M5.E7-DEMAND-REGISTER.md`,
`.planning/M5.E7-SUPPLY-*.md`, `.planning/M5.E7-COUNTERFACTUAL.md`,
`.planning/M5.E7-DISPOSITIONS.md`.

**Citation rule (P2):** every factual claim below cites a path or an ID, or is labelled
`(recollection — no artifact)`.

---

## 1. The finding this roadmap is organized around

**Signal cannot detect whether its own interventions work, in any dimension.**

Six things that were logged separately turn out to be one thing:

| Observation | Source |
|---|---|
| **No test anywhere asserts that a prompt instruction was obeyed.** All 1,623 tests exercise `tools/` — files and code. | verified by grep, `M5.E7-COUNTERFACTUAL.md` §3.2 |
| Run-to-run variance on a **byte-identical** prompt corpus: **workflow adherence 7 of 12**, output tokens **21,872 → 155,682 (7.12×)** | `ce-retune` A/A noise floor, `M5.E7-SUPPLY-COMPOUND-NEW.md` §2.1 |
| **False-greens are the largest demand cluster** — 9 retro items, plus 5 `BUGS.md` rows | `M5.E7-DEMAND-REGISTER.md` § cluster B |
| **`B39`**: an enforcement mechanism ratified 2026-07-04 was **never implemented**, and nobody noticed for three weeks | `.planning/BUGS.md` B39 |
| Load-bearing external claims decayed unnoticed — one **4.5×-wrong** figure reached a *locked decision* | correction **C6**, `M5.E7-CORRECTIONS.md` |
| This audit's own register **miscounted itself twice**; the disposition table twice more | `M5.E7-DEMAND-REGISTER.md` §4, `M5.E7-DISPOSITIONS.md` §6 |

**Why this leads rather than ranks.** Most of what Signal planned to port is *written instruction* —
a skill, a gate, a table, a phase brief. At 7-of-12 adherence, **porting a prompt-shaped capability
today produces work whose effect cannot be observed afterwards.** Measurement is not one item
competing with the others; it is the condition under which the others become judgeable.

**The rule that follows, and it sorted the whole table:** *deterministic, file-shaped capabilities
are buildable now — a check either runs or it doesn't, and the suite proves which. Prompt-shaped
capabilities wait for measurement.*

---

## 2. What the audit reversed

Three beliefs Signal held going in did not survive contact with its own record. Each was **load-bearing** — the roadmap would be different if any still stood.

**2.1 — "Signal keeps re-learning the same lessons, so it needs a memory loop." Falsified.**
Read the three carry-over chains *with their dates and Epic IDs attached* and they say the opposite:
`B27` surfaced **while building `B24`'s own fixture**; `B34` was found by the same REVIEW panel that
shipped `B29`'s fix; `B30` was found dogfooding `B26` on M5.E5's own SHIP
(`M5.E7-COUNTERFACTUAL.md` §3.1). **In every case the knowledge was in-context at the moment of the
miss.** Nobody forgot anything, so a cross-session store with confidence decay prevents none of it.
The real gap has a name Signal already wrote down — **class-completeness at fix time**
(`.planning/M5.E6-RETROSPECTIVE.md:32`) — and that is a review-scope rule, not a memory phase.
**Consequence: the entire COMPOUND port group is cut.**

**2.2 — "`<HARD-GATE>` is the blocking mechanism Signal should port." There is nothing to port.**
Verified at source 2026-07-25 against superpowers v6.2.0: **4 grep hits repo-wide, exactly 1 in a
live skill**, zero in `hooks/`, zero in `tests/`, no parser, no validator; the maintainer's own
planning doc calls the mechanism unsettled (correction **C3**). Signal has been planning to port a
**syntax** instead of a mechanism. The real machinery is `subagent-driven-development`'s five-round
breaker with `BLOCKED` propagation. **Signal already has the capability natively and better** — the
exit-2 STATE write-guard, the `PreToolUse` hook, and an FR1 retro gate that **hard-blocked its own
SHIP** in v0.1.10.

**2.3 — "The coverage question is the right question." It cannot see where Signal is ahead.**
A scorecard counts what is **absent**, so it is structurally blind to the case the audit found on
its first pass: Signal's `performance-optimization` is measurement-first and refuses to optimize
without evidence, while pm-skills' `/performance-audit-static` **never measures**
(`M5.E7-SUPPLY-PMSKILLS.md`). **Consequence: the seed's §1 scorecard is superseded in frame, and
the audit re-ran on "what does Signal need next?"**

> **Not a reversal, but the correction that matters most for trust:** the April analyses were
> **~3 months old, not ~15** — a figure wrong by ~4.5× that propagated from a research note into a
> locked decision, the spec, and four research briefs before anyone checked
> (correction **C6**). **Staleness therefore carries zero weight in any cut below.** Every
> `abandon` argues **fit** or **overlap**, and that is mechanically asserted in
> `M5.E7-DISPOSITIONS.md` §6.

---

## 3. The sequenced queue (P8 — one page)

**Five Epics, real IDs from M5.E8 onward** (AC4.3 — the pre-override `M5.E1–E6` port labels are
dead; they were reassigned to the doc-runtime and bug-squash Epics that actually shipped).

**Near-term is committed; far-term is loose. That asymmetry is deliberate** — Signal's measured
prior on source-and-sequencing predictions is **0 for 6** (D-M5E7-7), so confidence decays with
distance and the roadmap says so rather than pretending otherwise.

| Epic | What | Why now | Trigger (P4) |
|---|---|---|---|
| **M5.E8** | **Measurement foundation** — (a) one test that asserts a Signal prompt instruction was actually obeyed; (b) the second-opinion replay experiment | §1. **Gates five other items.** Nothing prompt-shaped can be honestly evaluated until this exists | **None — unconditional next.** The only Epic here that does not wait for anything |
| **M5.E9** | **Overdue enforcement + the bug pile** — the `B39` trigger walk · dispatch/worktree rules · SHIP-time ledger reconcile · the 9 open bugs | All deterministic, all cheap, all already costing. Independent of E8, so it **can run in parallel** | **None.** Runs alongside or immediately after E8 |
| **M5.E10** | **Review hardening** — false-green audit + RED-against-`main`; reclassify every anti-rationalization table (`B38`) | Answers the one guard that reached users (`B19`) and the one convention Signal adopted universally on no measurement | **E8 lands** — both are partly prompt-shaped, and E8 is what makes "did it help?" answerable |
| **M5.E11** | **Roadmap Advisor** — sequencing and prioritization advisory | The best-evidenced *new* capability in the audit (§4.3). Makes this Epic repeatable instead of one-off | **E9 lands** — it advises on a backlog, so the backlog should be reconciled first |
| **M5.E12** | **Project-facing currency** — accurate, agent-navigable docs for the codebase and its external services; external-claim staleness stamps | Signal's doc-runtime pointed **outward** at the project instead of inward at `.planning/`. Mechanism largely exists; the work is retargeting | **E11 lands**, or a doc-drift incident in a Signal-built project is recorded |

**Everything else is parked with a trigger, not a position.** ⚠ **`B39` caveat, which applies to
every trigger on this page:** Signal's trigger-evaluation mechanism **has never run** —
`ISSUES-INBOX.md:1407` instructs `/sig:plan` to walk the watchlist at each drain, and
`grep -ril "watchlist" commands/ tools/` returns nothing. **Until M5.E9 fixes that, a trigger on
this page is a note, not an enforcement.** Saying so is the difference between a roadmap and the 25
never-checked boxes it replaces.

---

## 4. The work, with first slices (P3)

Every `build` names a first slice and a **done-when a stranger could check**. Where I could not
reduce something to one slice, it is parked instead — that rule alone moved four items down.

### 4.1 — M5.E8 · Measurement foundation

**(a) Behavioral measurement.** *First slice:* one test, borrowing gstack's
`carve-section-loading.test.ts` pattern (it drives a live model through the `claude -p` SDK to assert
an agent actually read a deferred file — `M5.E7-SUPPLY-GSTACK.md` §2.3), asserting that one specific
Signal command instruction is obeyed. superpowers' `testing-skills-with-subagents` is the
RED/GREEN/VERIFY-GREEN harness for the same job (`M5.E7-SUPPLY-SUPERPOWERS.md` §5.1b). **Signal has
zero of either** (grep-verified). *Done-when:* a stranger runs `npm test`, sees it pass, **deletes
that instruction line from the command markdown, re-runs, and sees it fail.**

**(b) The second-opinion replay.** Reopened at Brett's challenge (**D-M5E7-11**) after the audit
answered the wrong question — both prior passes asked *"should Signal port compound-engineering's
cross-model review?"* (no: it substitutes a reviewer rather than adding one) and **neither asked
*"should Signal have a genuine independent second opinion?"*** *First slice:* re-run REVIEW against
the `B19` commit with a reviewer given **no access to that Epic's own artifacts**, and see whether
it catches the `ann.legend === null` predicate. *Done-when:* a one-page result — caught or not
caught — with the transcript. **A measurement, not an argument**, which is the only honest way to
settle it.

### 4.2 — M5.E9 · Overdue enforcement + the bug pile

- **`B39` — implement the trigger walk.** The store exists; **the reader was never built.**
  *Slice:* one drain step in `commands/plan.md` + `tools/lib/drain.js`. *Done-when:* a fired trigger
  surfaces at `/sig:plan`, **and a checked-and-declined trigger is distinguishable from an unchecked
  one** — or the next audit re-finds this.
- **Dispatch guidance + worktree isolation.** Demand cluster **F**, rank 1: four retro items across
  M5.E1/E4/E5/E6, **0 hits across all four ledgers**, and a **live incident during this Epic** (two
  agents silently absorbed a sibling's file via `git commit --amend` on a shared worktree; recovery
  needed a `git reset` — `.planning/M5.E7-PROGRESS.md`). *Slice:* the executor rule
  (`git add <path> && git commit`, never `--amend`) plus `isolation: "worktree"` per concurrent
  agent. *Done-when:* a stranger reads `commands/execute.md` and can tell whether two given tasks
  are safe to dispatch simultaneously.
- **SHIP-time ledger reconcile.** *Slice:* one hygiene test asserting `BUGS.md` carries no
  `confirmed` bug whose fix already shipped. *Done-when:* it runs in `npm test` and fails on a
  planted violation. **Evidence is four instances found during this Epic alone** — `BACKLOG.md`'s
  four unmarked closures, `CLAUDE.md`'s stale `B27`/`B28`, `ISSUES-INBOX.md`'s pre-rename header,
  and this audit's own miscounts.
- **The bug pile.** **Nine open bugs have no home on any plan** — `B32`–`B36` `needs-triage`,
  `B37`–`B40` `confirmed`; verified 2026-07-26 that **no bug-squash sprint exists in `BACKLOG.md`**.
  *Slice:* the two P2s (`B36`, `B39`). *Done-when:* zero `confirmed` P2 entries remain.

### 4.3 — M5.E11 · Roadmap Advisor *(the largest new capability)*

**The audit never asked the question this answers.** The counterfactual asked *"would this have
prevented a bug we shipped?"* and *"would it have shortened an Epic we ran?"* — **it never asked
*"would it have stopped us building the wrong thing, or in the wrong order?"*** Signal's record
answers that one loudly and it went uncounted. **A blind spot in the audit's method, not in the
corpus:**

- **The 0-for-6 displacement chain** — a six-Epic port queue recorded 2026-07-13; the 2026-07-16
  override displaced E1 three days later and **every one of the six was displaced**; eleven releases
  shipped containing **zero lines** from that queue (D-M5E7-7).
- **P4's own justification:** *"position is what got overridden six times."*
- **Five port candidates sat un-cut for the project's life** with no cut decision ever recorded.
- **`B39`** — nothing has ever evaluated a promote-back condition.
- **M5.E7 itself is a manual run of this capability** — a full Epic, one-off and non-repeatable,
  which produced 19 cuts, found four unmarked backlog closures and a 4.5×-wrong figure inside a
  locked decision.

*Scope boundary, ratified:* **product discovery is out** — *what product should exist* is not
Signal's job. **Roadmap advisory is in** — *given a backlog, what should be next and why*.
*Supply to borrow rather than invent:* gstack's `/office-hours` six forcing questions **re-pointed
at sequencing**, gstack's `/plan-ceo-review` Step 0B, and pm-skills' assumption mapping (Impact ×
Risk), which is a prioritization technique that was mis-grouped as discovery from the start.
*First slice:* **make M5.E7 repeatable** — a command that reads `BACKLOG.md` + `BUGS.md` + the retro
corpus and returns, for the top N, *why this and not that*, each answer citing a path. *Done-when:*
a stranger runs it on Signal's own backlog and gets a ranked answer whose citations resolve.
**Naming is deliberately open** (`/sig:advise`, an extension of `/sig:plan`, or a fold into the
planned `/sig:audit`) — do not fix the name before the shape.

### 4.4 — M5.E10 and M5.E12, briefly

**M5.E10 — Review hardening.** The false-green audit question (*"does this test plant the hostile
input at the precise location the guard covers, and would it fail against the unfixed code?"*) plus
**RED-against-`main`** as the standard for guard fixes; *done-when:* every guard fix in the next
Epic ships with a test demonstrated to fail against `main`. And **`B38`**: reclassify every
anti-rationalization table entry as **discipline** (keep the prohibition form) or **shaping**
(convert to a positive recipe) — the upstream source measured that the prohibition form *"produced
clearly more of the unwanted content than the recipe arm (fully separated distributions), and
trended worse than even the no-guidance control"*, and Signal adopted the generalization universally
on no measurement at all.

**M5.E12 — Project-facing currency.** *The insight that makes it cheap:* this is Signal's
doc-runtime **pointed outward at the project** rather than inward at `.planning/` — single-home,
resolvable references, a generated traversal layer, a hygiene guard. **The work is retargeting, not
inventing.** Brett's third requirement is the Signal-shaped one: *"easy to navigate for the
agents"* — the consumer is an agent, so navigability means resolvable references and single-home
content, which the runtime already enforces. Supersedes in scope both `BACKLOG.md:152`
(`/sig:docs-update`) and `ISSUES-INBOX.md:1467` (tooling catalog) — **reconcile, do not re-derive.**
Bundled: the `verified-against: <ref> on <date>` staleness stamp for external claims, covering both
`analysis/` (correction **C6**) and the two ⚠-flagged untrustworthy claims already sitting at
`BACKLOG.md:40`.

---

## 5. What was cut, and on what grounds

**19 cuts.** None cites dormancy, staleness, or "we never got to it" — mechanically asserted
(`M5.E7-DISPOSITIONS.md` §6). Every one argues **fit** or **overlap**. The full table is there; the
consequential ones:

| Cut | Grounds |
|---|---|
| **The entire COMPOUND port group** — `/sig:compound`, `learnings-researcher` + `session-historian`, gstack's `/retro` + `/learn`, cross-project learning integration | **Fit.** §2.1 falsified the premise. Also **C5**: the two agents are not a unit upstream, so porting "the phase and its two agents" **builds something the source does not have.** gstack's read-back surfaces a digest at skill start in 10 of 54 skills — it would not have caught Signal's one genuine cross-session recurrence (`B13`'s NUL byte), whose real defense is a deterministic content check `doc-hygiene.js` already hosts |
| **gstack's 15-phase `/cso` replacing `security-and-hardening`** | **Fit — threat model.** Phases 2–11 target secrets archaeology, dependency supply chain, CI/CD, infrastructure, webhooks and STRIDE: **an attack surface a markdown-plus-Node-CLI plugin does not have.** Signal's two security findings (`B14`, `B22`) were both found by its existing REVIEW panel. *Phase 8 (skill supply chain) is carved out and parked* — it is the one phase that matches Signal's shape |
| **`<HARD-GATE>` as an enforcement module** | **Fit.** §2.2 — the artifact does not exist as a mechanism |
| **pm-skills product discovery** (`/discover`, `/strategy`, OST) | **Product fit**, ratified by Brett 2026-07-26. Signal builds things well; it does not decide what product should exist |
| **pm-skills GTM (beachhead / ICP / growth loops) + data-analytics** | **Fit.** A different product with a different buyer; serves no demand entry across 39 retro items, 40 bugs and 39 inbox entries. **The cut the seed most needed and never made** — it fell between RUNDOWN routing it to SHIP and M5.E1 being upstream-only, and read as "planned" for three months |
| **Cursor adapter** | **Demand fit.** `BACKLOG.md:174` already said *"least evidence of demand."* The trap avoided: Brett works **in** Cursor but runs **Claude Code** inside it — that is not demand for Signal on Cursor's agent runtime |
| **OMC `visual-verdict` + consensus-planning** | **Overlap.** `ui-auditor` covers the first. For the second, `plan-checker`'s 8 dimensions are not the weak stand-in the seed assumed — **this Epic's own validation caught two real defects with them** (a false dependency; a task that did not fit one context) |
| **gstack `/plan-ceo-review` scope-modes; design-review + browser daemon** | **Overlap**, with a near-miss recorded honestly: Step 0B matched a real stale premise in M5.E6 — but **Signal's own 4-agent PLAN research caught it at PLAN** and the Epic got smaller |
| **compound-engineering language-specific style agents** | **Fit** — and note *how* we know: **the source deliberately narrowed them away upstream.** A lesson to inherit, not a gap to fill |

---

## 6. What this roadmap gets wrong (P7)

**6.1 — Every `build` is Signal-native or a repair of Signal's own work. Not one is a straight port.
That is exactly the shape a confirmation-biased audit would produce.** The risk was rated *High and
structural* before the audit began (`M5.E7-VALIDATION.md` D7): it was run by the same pair that
built the thing, over a corpus they wrote. Three reasons it is probably not that, offered so they
can be attacked: **(a)** the largest cut group is the one the reframe's own thesis most wanted to
keep, and it fell to an adversarial pass that falsified that thesis; **(b)** the parked ports are
gated on a measurement layer that does not exist yet — **this defers them, it does not dismiss
them**, and if M5.E8 shows Signal's prompts fire reliably, several become `build`s on evidence;
**(c)** the one capability Brett pushed back on was reopened *against* the audit's conclusion.
**The falsifier: M5.E8 lands, measurement shows Signal's enforcement is as good as claimed, and the
ports still never happen. If that occurs, the reframe was decorative.**

**6.2 — The audit's method had a blind spot it did not discover on its own.** The counterfactual
asked about shipped bugs and Epic duration and **never asked about building the wrong thing in the
wrong order** — the failure mode Signal's record documents most loudly. **A human caught it, not the
process.** M5.E11 exists because of that catch. A method that misses its own strongest evidence
class should be assumed to have other blind spots.

**6.3 — Silence about ideation is not evidence of no demand (AC7.3).** Across 18 retrospectives, 40
catalogued bugs and a 1,507-line inbox, **nothing surfaced as "I couldn't figure out what to
build."** But **Signal is built by someone who already knows what to build, from a spec written up
front — close to a worst case for detecting demand for an upstream ideation layer.** Absence of
signal here is **weak** evidence about the gap for other users. It is the only evidence available
and it points one way, but the `abandon` verdicts on product discovery rest on **Brett's positioning
decision**, not on the corpus.

**6.4 — Sequencing rests partly on product intent, and saying so beats a data-driven veneer
(AC4.2/4.5).** M5.E8 before M5.E11 is defensible on dependencies. **M5.E11 before M5.E12 is not
evidence — it is a judgment** that a repeatable prioritization capability compounds faster than
project-facing docs. Reasonable people would swap them.

**6.5 — "Shortened an Epic" was mostly unanswerable.** Signal records Epic *content* well and Epic
*duration* poorly; M5.E4's ~36 min/task is the only figure in the corpus. **Every "no" on that half
should be read as *not measurable*, not as measured-and-refuted**
(`M5.E7-COUNTERFACTUAL.md` §5.7).

**6.6 — The bug ledger has survivorship bias.** `BUGS.md` records defects Signal's existing REVIEW
panel and dogfooding were good enough to find. **A class of defect Signal's process cannot see at
all would be absent from the very corpus used to judge whether a new lens was needed** — and that is
precisely the class a new lens would address. This argues for M5.E8(b) more strongly than the
counterfactual did.

**6.7 — Supply is entirely second-hand.** No source repo was cloned or executed for the
counterfactual; every supply claim comes from the five S2 files, each declaring its own unread
surface — 49 of 54 gstack skills unopened, superpowers read at depth-1, **nothing executed anywhere**.

**6.8 — 33 of 39 inbox entry bodies were never read** (headings + status lines only, under a stated
8% cap). If a disposition turns on an entry's internal proposal, **that body is still unread.**

---

## 7. Ratified, and still open

**Ratified by Brett, 2026-07-26:**
1. **Product discovery is out of scope**; roadmap advisory is in (§4.3).
2. **Bugs defer to a bug-squash Epic** — on condition it is a *named* item with an ID and a trigger,
   which is M5.E9 (D-M5E7-10).
3. **Telemetry across installs is acceptable in principle** — private or optional bolt-on, his
   choice; mass-market palatability **explicitly waived**, so consent is a design parameter rather
   than a blocker.

**Still open — genuinely his, not the evidence's:**
1. **Should Signal carry stack-aware pre-ship hazard checks?** (`ISSUES-INBOX.md:1475`) It would
   make Signal opinionated about *stacks*, which it currently is not. A real scope change.
2. **Telemetry: private, or optional bolt-on?** The disposition holds either way; the choice changes
   the build, not the verb. **Ordering constraint regardless: local measurement (M5.E8) before
   cross-install aggregation** — you cannot pool what you cannot measure in one place, and backwards
   it collects noise at scale. Honest caution: **at 7-of-12 adherence, four users will show nothing
   for a long while.** A compounding asset, not a near-term signal.
3. **Findings-quarantine for untrusted web content** — Signal's researcher agents fetch the open
   web with no protection against fetched content carrying instructions. **No incident is recorded,
   so by the rules it is parked** — but it is the one parked item where being early beats being
   right. *Note the correction: this was originally conflated with the separate and better-evidenced
   problem of **sourcing and currency** of external claims, which has two recorded instances and
   graduated to `build` in M5.E12.*
4. **Dependency and release currency** (Brett's Node middleware→proxy example) is parked, not cut —
   it is **the item furthest from Signal's existing shape**, needing a live external data source
   Signal has never had. *Trigger:* M5.E12 lands (shared machinery), or a Signal-built project ships
   on a deprecated API and it is recorded.

---

## Last Updated

2026-07-26 — written at M5.E7 S4.t9. Next: S4.t11 lands every `build` above into
`.planning/BACKLOG.md` with its trigger and first slice, so this document is enforced by something
rather than read by nobody.
