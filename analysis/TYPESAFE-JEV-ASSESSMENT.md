# TypeSafe's Jev — what it is, and where it fits Signal

**Written 2026-09-25.** Commissioned by Brett during `/sig:resume`, mid-way through deciding what to
do with `M6.E3`. Three questions: what is this model and what can it do; does it change `M6.E3`;
and if it helps, where and in what order.

**Short answer.** Jev is a cheap, fast, outside model that answers **narrow typed questions** —
pick one of these options, rate this on this scale, is this true yes/no — and says how sure it is.
It fits one specific gap Signal has documented and deliberately left open: **checking whether a
sentence is true, not just whether the right words are present.** It does **not** change whether
`M6.E3` should be un-parked (that is Brett's call on direction). It changes **how** its unbuilt half
could be built — from an open-ended agent re-reading prose, which the project rejected, to small
yes/no and pick-one questions that code sets up and code acts on.

**Sections 1–5 were written before anything was run**, from Jev's public docs (read 2026-09-25,
model `jev-1.13.0`). **Section 6 is the measurement**, run the same day on this repository's own
records — read it before acting on the list in section 3.

---

## 1. What Jev is

TypeSafe calls Jev a **"System One" model**: fast, narrow judgment rather than long reasoning or
writing. You send it **state** (the text or data to judge) and **a set of questions**; it answers
every question in parallel, each one in isolation, and returns typed answers your code uses
directly. It never writes prose.

**Three question types** ([primitives](https://docs.typesafe.ai/primitives.md)):

| Type | What you ask | What comes back |
|---|---|---|
| **Choice** | Pick one from a list you supply (up to 255 options) | the pick, a probability per option, a confidence |
| **Score** | Rate against 2–10 levels you describe | a weighted score, a probability per level, a confidence |
| **Noul** | A yes/no question | one number: the probability the answer is yes |

**Confidence** ([confidence](https://docs.typesafe.ai/confidence.md)) is a separate 0–1 number for
how concentrated the probabilities are. Their own advice: act automatically when high, confirm when
medium, hand to a person when low — and **"the correct threshold values depend on your domain…
test with your own data."** They do not claim a calibration figure; they give you the full
probabilities so you can pick your own rule.

**Their design philosophy** ([how to build](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)):
*"code owns the workflow and AI handles narrow, structured decisions."* Break a broad question into
small ones, keep arithmetic and rules in code, combine answers in code with weights you control.
**This is already Signal's own posture** — `D-M6E3-1` (a reviewer may block only with a receipt a
person can check) and the whole *"derived, checked, or labeled unverified"* rule in
`CLAIM-INTEGRITY-ANALYSIS.md` say the same thing from the other side.

**Practical facts** ([models](https://docs.typesafe.ai/models.md), [API](https://docs.typesafe.ai/api.md)):

- One HTTP endpoint, `POST https://api.typesafe.ai/v1/systemone`, API key as a bearer token.
  JavaScript and Python SDKs.
- 64k-token window per request, 32k of it for state. Text only. Best in English.
- **Price: $0.042 per million input tokens; output is free.** A run over all of Signal's
  `.planning/` would cost well under a cent.
- 1,200 requests a minute. Rate limits "adjusting dynamically" due to demand.
- **Not trained on customer data.** **Retention is not specified**: the data-processing agreement
  says data is kept *"as long as necessary taking into account the purpose"*; zero retention is an
  enterprise option through sales.
- **No seed or determinism setting is documented.** The same request may not always return the
  same numbers.
- They ship a Claude Code plugin (`typesafe@typesafe-ai`) — a skill that teaches an agent the API.
  It is **not** a way to run Claude Code on Jev; their docs say plainly that Jev does not write
  code or hold conversations ([coding agents](https://docs.typesafe.ai/introduction/coding-agents.md)).

**Its own list of weaknesses** ([jev-1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md)) —
the most useful page in the docs, and several items land squarely on Signal's work:

1. **Literal reading** — answers the question you wrote, not the one you meant.
2. **Not a calculator** — counting and numbers are weak.
3. **Dates read as text**, not as ordered quantities.
4. Struggles with **indirection** and double negatives.
5. **Accuracy drops with irrelevant state** — filter before sending.
6. **Adversarial content** is not treated as hostile.
7. Confused by **contradictory instructions**.
8. **No guarantee related answers agree** with each other.
9. Not built to **generate** text.

**Evidence quality.** The cookbook closest to Signal's problem,
[citation check](https://docs.typesafe.ai/cookbooks/citation_check.md), is tested on **eight
hand-made citations** — four correct, four deliberately broken. It sorted them sensibly (correct
ones at 0.93–0.99 confidence; the two "says nothing" cases at 0.27–0.56, which routed to a person).
That is a demonstration, not a measurement. Signal would have to measure it on its own records.

---

## 2. Does it change `M6.E3`?

**It changes how, not whether.**

**What `M6.E3` is** (`.planning/M6.E3-PLAN.md`, `DECISIONS.md` § *2026-08-19 — M6.E3 DISCUSS*): a
checker for whether Signal's records tell the truth, under one rule — *it may only stop you when it
can show you why* (`D-M6E3-1`). Planned 2026-08-19, parked 2026-08-20 when Brett redirected work
toward features and the loop (`STATE.md` § *In-flight*).

**What Jev does not change:**

- **Why it was parked.** That was a call about direction — less Signal-checking-Signal, more
  features — and a new tool does not reverse it.
- **Slices 1–3.** The plan says *"Slices 1–3 contain no model judgment at all"*
  (`M6.E3-PLAN.md:39`). They are deterministic search, and should stay that way.
- **The receipt rule.** A Jev answer is **not** a receipt. *"Contradicts, confidence 0.99"* is still
  a judgment. The receipt is the claim and the source quoted side by side — which code assembles
  before Jev is asked anything. Jev decides **which pairs are worth showing a person**; the pair is
  what blocks.
- **The closed-list rule** (`D-M6E3-2`). Jev judges the pairs you give it; it cannot search. *"Is
  this implemented anywhere?"* stays unprovable, and stays advisory.

**What it does change:** the half that was **deliberately never built** — `AC0.1`, from
`D-M5E10-1`: *"an agent re-reading every claim against its source."* That was deferred because an
open-ended agent reading prose is expensive, has no probabilities, and cannot be separated from the
rest of the run. `M6.E3`'s own `NFR1` asks that *"any model-judged step is separable."* Jev's
question types meet that by construction: one typed question, one typed answer, a probability, and
a reason in code for what happens next. **The semantic half goes from "no acceptable way to build
it" to "a measurable design."**

**How many of today's four misses Jev could have caught** (from this session, 2026-09-25):

| Miss | Could Jev have caught it? |
|---|---|
| `STATE.md` § *In-flight* has said *"Nothing is in flight… `phase: PLAN` above is accurate"* since 2026-08-20; the frontmatter says `SHIP`. `narrative-phase-contradicts-frontmatter` returned clean because it only reads lines naming the **current** Epic. | **Yes.** A Choice question per paragraph — *supports / contradicts / says nothing* — against the frontmatter. A closed list of paragraphs. |
| `bug-status-vs-changelog` flagged `B75` as possibly fixed; the entry actually says `B75` *"stays open, by choice."* | **Yes.** A yes/no question per matched entry: *"does this entry say this bug was fixed?"* This is exactly the rule `D-M6E3-6` tried to express as a regex and would not adopt on two data points. |
| `/sig:resume` read `10/7 phases done` (`B124`). | **No.** Counting — Jev's own weakness #2. Fixed in code (PR #255). |
| `M6.E7`'s first advisory had every citation off by five lines (`CLAUDE.md`, *Latest*). | **Partly.** Advise's own citations are now guarded in code by an exact row match. Jev would help where a claim is **paraphrased** and exact matching cannot work. |

**Two and a half of four.** Stated as that, not rounded up.

**On parking with a "check yourself" loop.** Jev offers one new piece. Today a backlog row's
`Trigger:` line changes to *"met"* only when a person rewrites it — `/sig:advise` reads the words,
it does not check the condition. If a trigger is written as a checkable statement against named
files, Jev could evaluate it on every advise run and **propose** flipping it, with the evidence.
That is the loop Brett asked about. It still needs `M6.E3` to have a backlog row at all — it has
none today, so `/sig:advise` cannot see it.

---

## 3. Where Jev could help Signal, in priority order

**The ordering rule:** does Signal already have **labeled examples** (known right and wrong
answers) for the job? If yes, the first step is a cheap measurement; if no, the job waits. That is
the standard this repository holds itself to (`D-M6E3-6`: a rule tuned on two data points is not
adopted).

### Conditions every item below must meet

These come from Signal's own record, and an integration that skips one fails on this repository's
own evidence.

1. **Opt-in, and off by default.** Turned on by an explicit setting (a `PROFILE.md` key plus an API
   key) — never guessed from the environment. `PHASE-C-BUILD-VS-ADOPT.md`: *"the honest mechanism is
   a documented one or none."*
2. **Falls back to today's behaviour, and says so.** No key, offline, or rate-limited → the
   deterministic path runs and the output **states that the model check did not run**. Silence
   about blindness is the bug `M5.E16` exists to fix. Commands documented as *"touches no network"*
   (e.g. `/sig:docs-sweep`) keep that property unless their documentation changes.
3. **A caller that acts.** A new advisory line nobody reads is `UNREACHED-MECHANISM-ANALYSIS.md`'s
   sixth entry. `CROSS-MODEL-REVIEW-SCOPE.md` found an independent reviewer had run on every PR for
   weeks and **nobody had read its output**. Each item names the command that uses the answer.
4. **Blocks only with a receipt** (`D-M6E3-1`). A Jev answer ranks, sorts, or proposes. Only the
   quoted evidence stops anything.
5. **Nothing numeric.** Test counts, tallies, versions, fractions, dates, commit reachability stay in
   code. Jev's own weaknesses #2 and #3.
6. **Data boundary.** Signal's own `.planning/` is Brett's to send. **The eval corpus and users'
   repositories are not** — `tests/private-name-guard.test.js` and the hash denylist exist because
   that line matters, and default retention is unspecified. See Decision C.
7. **Tests never call the network.** Recorded responses as fixtures; the live call is a separate,
   opt-in measurement script.
8. **Every result says it used Jev**, and which version — the same rule as advise's *Consulted by
   the ranking* line. A number from a model with no seed must never read like a number from code.

### The list

| # | What | Why here | Labeled data already on disk | Caller that acts | Size |
|---|---|---|---|---|---|
| **1** | **Measurement spike** — a script in `tools/` (maintainer tooling, not a command) that asks Jev the questions below over Signal's own records and reports hits and misses. No integration. | Every later item depends on whether Jev can tell these cases apart on **this** project's text. Costs pennies. | See items 2–4. | None — it produces a number, and the number decides the rest. | S |
| **2** | **`bug-status-vs-changelog` precision** — one yes/no per flagged entry: *"does this entry say bug X was fixed?"* | Fired falsely today (`B75`). Its published record is 13 flags/1 real, 3/1, 2/1. | The 28-row corpus from `D-M6E3-6`; `B75` (false) and `B102` (true). | `/sig:resume` banner and `/sig:docs-sweep` already surface it; a sharper flag makes an existing line worth reading. | S |
| **3** | **`/sig:advise` ranking inputs** — replace the word-pattern rules (blocked, trigger-met, fold, bug-discharge) with typed questions per backlog row, all asked in one call. | `M6.E8` spent an Epic tuning these patterns and documented their false positives: `TRIGGER_MET_RE` hits 6 of 50 live rows, **2 of them wrong** (`plugin/tools/lib/advise.js:86-92`); `BLOCKED_RE` was not widened because the tuning failed (`CHANGELOG.md`, *Not changed, deliberately*). | The per-pattern measurements beside each regex (`*_MEASURED`), plus `M6.E8-REVIEW.md`. | `/sig:advise` — it ranks, and every row it passes over carries a reason. | M |
| **4** | **Trigger evaluation** — a backlog row's trigger written as a checkable statement; Jev proposes *"met"* with evidence each advise run. | Brett's "park with a check-yourself loop" question. | None yet — triggers are free text today. Needs item 3 first. | `/sig:advise` proposes; a person flips it. | S after 3 |
| **5** | **`M6.E3`'s semantic half** — narrative-vs-fact contradiction for `STATE.md`, `CONTEXT.md`, `CLAUDE.md` prose against frontmatter and artifacts. | The class `M6.E3` was chartered for, reproduced today (`STATE.md` § *In-flight*). | The narrative check's history: a broad rule flagged 62 episodes, the narrow one finds 5 (`state-drift.js`, `checkNarrativePhaseContradiction` docblock). | `/sig:resume` banner; the SHIP gate, with a receipt, per `D-M6E3-5`. | M–L |
| **6** | **Paraphrased-citation check** — does the cited section support the claim, where the claim is not a verbatim quote. | `verifyCitations` checks a line exists, never what it says (`CLAUDE.md`, *Latest*). | Hand-built, like TypeSafe's cookbook; no corpus yet. | VERIFY / REVIEW artifacts. | M |
| **7** | **`/sig:drive` decision routing** — confidence as the input to *adopt / queue / halt*. | Confidence routing maps directly onto the `attention` dial. | None — too few queued decisions (`DECISION-QUEUE.md` holds 1). | `/sig:drive`. | Wait |
| **8** | **`/sig:calibrate` tier pick** — a Choice over SKETCH / FEATURE / SPIKE / FULL, with low confidence prompting a follow-up question. | Plausible, but no documented failures. | None. | `/sig:calibrate`. | Wait |

**Explicitly not recommended:**

- **Requirement-coverage counting** (`B116`) — an extraction and counting problem. Fix it in code.
- **A "cross-vendor reviewer."** Jev **is** a different vendor, but it cannot read a diff or reason
  across files. It is a cross-vendor **judge** for claims code has already broken apart. Calling it
  the cross-model review that `CROSS-MODEL-REVIEW-SCOPE.md` scoped would be a label claiming a
  property it does not have — this repository's named defect.
- **Anything a user's installed Signal calls by default.** See Decision B.

---

## 4. Decisions this puts in front of Brett

**A. Measure at all?** Item 1 only: a maintainer script, Signal's own records, no user-facing change.
Needs a TypeSafe API key. *Recommended: yes* — it is the cheapest way to turn this document's
guesses into numbers.

**B. Is a paid outside API acceptable inside Signal, even optional?** Today Signal needs nothing
beyond Claude Code and Node. An optional integration adds an account, a key, network calls, and a
vendor who could change terms. This is a product-positioning call — *"installable in under five
minutes"* is a stated constraint — and it can wait for item 1's numbers.

**C. What text may leave the machine?** Proposed line: **this repository's `.planning/` — yes, for
the spike. The eval corpus — never. Users' projects — only if a user turns it on, told plainly
what is sent.** Default retention is unspecified, so nothing private goes until that is answered or
zero retention is arranged.

**D. `M6.E3` itself** — still Brett's open question from 2026-09-25 (a/b/c: park properly with a
backlog row, un-park, or leave). This document adds one input: if item 1 shows Jev can tell the
cases apart, the un-built half has a design, and a reshaped `M6.E3` would be item 5.

---

## 5. Where this lives

- **This file** is the single home for the assessment — the same genre as
  `DEEPSEEK-HARNESS-ASSESSMENT.md` and `OPENKB-ASSESSMENT.md`.
- **Work items go to `.planning/BACKLOG.md`** (the queue, `D-M5E18-1`) once Brett decides A — item 1
  as a row, and a row for `M6.E3` so `/sig:advise` can see it.
- **Brett's calls on A–D go to `.planning/DECISIONS.md`** as `D-BR0925-N`, citing this file.
- **Not `CLAUDE.md`** until something ships. It is over its size budget and may not grow
  (`tools/doc-budgets.json`).

---

## 6. The measurement (2026-09-25) — decision A, run

**Result in one line: Jev found every contradiction and the one real "fixed", and was never
confidently wrong — but at the plain 0.5 cut it is no more precise than the regex it would replace
on backlog triggers, and its one real "fixed" sat at a coin flip.** Small sets; read the caveats.

**What was sent.** 94 questions, one per case, all from this repository: `CHANGELOG.md`,
`BUGS.md`, `BACKLOG.md` and `STATE.md` text. Nothing from the eval corpus or any other project.
**~94,000 input tokens per run, about $0.004.** Run twice to test repeatability. The script ran
from a scratch directory, not from `tools/`, because `tools/audit-network-calls.js` backs the
README's *"no network calls beyond Claude's API"* promise — a network-calling script in `tools/`
would break it, and putting it somewhere the audit skips would be dodging it.

### Set 1 — "does this changelog text say bug X was fixed?" (replaces `bug-status-vs-changelog`)

The 13 rows the *any-mention* rule flagged at `fc4b8b1` (reproduced exactly from history: 28
`confirmed` rows, 13 flagged). Labels **re-read against the question asked**, not just the bug's
status: 12 passages cite, file, measure with, or say the bug *stays open* (`B56`: *"addresses the
recurring half… it does not close the bug"*); one, `B102`, is the release written around fixing it.

| | Flags | Real | Missed |
|---|---|---|---|
| any-mention rule | 13 | 1 | 0 |
| headline rule (**shipped**) | 2 | 1 | 0 |
| **Jev, ≥ 0.5** | **1** | **1** | **0** |

**The catch: `B102` scored 0.53 and 0.51.** All twelve negatives stayed at or below 0.07 in both
runs, so the separation is real, but the one positive barely cleared the line. `B102`'s entry never
says *"fixed"* — it says *"`B102`, fix lane. A P1…"* — and Jev's documented weakness #1 is literal
reading. **One positive is not a measurement of recall.**

### Set 2 — "does this backlog row say ITS OWN trigger was met?" (replaces `TRIGGER_MET_RE`)

All 50 live rows from 2026-09-05, reproduced by running `advise.js` as it stood at `bbe5721` over
that day's `BACKLOG.md` (50 live, 6 regex hits — matching the recorded count).

**⚠ Finding on the way in — the published false-positive count is wrong.** `advise.js` says
*"2 of those 6 are false positives."* Read against each row's own `Trigger:` line, **5 of 6 are**:
rows 1362 and 1601 state their own trigger as **`NONE`**, and three of the six carry 11–18 thousand
characters of *other* entries' text, absorbed by the row-parsing defect `M6.E7`'s PR reviewer found
later. Only row 762 says its own trigger fired. **These are Claude's labels**, with the evidence line
recorded per row; the 44 unflagged rows were labeled mechanically (own text has no trigger, or names
a condition without saying it was met). Not yet corrected in `advise.js` — see decisions below.

| | Flagged | Real | Wrong |
|---|---|---|---|
| `TRIGGER_MET_RE` (**shipped**) | 6 | 1 | 5 |
| **Jev, ≥ 0.5** | 6 | 1 | 5 |
| Jev, ≥ 0.7 *(threshold picked after seeing the data)* | 1 | 1 | 0 |

**Same count, different mistakes.** Jev rejected **all five** of the regex's false positives
(0.09–0.34), including both published ones (1117: 0.34, 1952: 0.23–0.24), and gave the real one
0.91–0.94. Its own five mistakes are rows describing **evidence rather than a trigger** — *"three
instances in five weeks"*, *"the entry price… agreed"*, *"went stale three times"* — all scored
0.53–0.65. **Every Jev error sits in the band its own docs say to send to a person.** The 0.7 row
is shown because it is the honest reading of that, **not** as a validated threshold: it was chosen
after looking, which is the tuning-on-the-test-set mistake `D-M6E3-6` refuses.

### Set 3 — "does this `STATE.md` paragraph contradict the facts?" (the `M6.E3` class)

The 31 body paragraphs of `STATE.md` on `main`, against the frontmatter plus two stated facts
(what is in flight; `M6.E3` parked). **Claude's labels**: 4 contradictions, 2 agreements, 24
history, 1 left unscored as ambiguous.

| | Contradictions found (of 4) | False alarms (of 26) |
|---|---|---|
| `narrative-phase-contradicts-frontmatter` (**shipped**) | **0** | 0 |
| **Jev** | **4** (3 at confidence 0.91–1.00; 1 at 0.23–0.37) | 1, at confidence 0.11 |

It found *"Nothing is in flight"* (twice), *"`phase: PLAN` above is accurate"*, and *"`plugin.json`
reads `0.1.30`"* — and correctly left alone paragraphs 29 and 31, which **quote** the old *"Nothing
in flight"* as history. The one false alarm is *"Pending ops: None currently open"*, a label that is
itself arguable. **This is the strongest result, and the smallest set with the weakest labels.**

### Repeatability

No seed is documented; the two runs differed by **up to 0.13** on one answer, and **2 of 94
decisions flipped** — both already within 0.1 of the line (row 785: 0.53 → 0.44; paragraph 39:
contradicts → says nothing). **Nothing confident moved.** A Jev number must never be recorded as if
it were reproducible the way a commit-pinned verdict is (`ADHERENCE-LOG.md`).

### What this does and does not establish

- **Does:** on Signal's own text, Jev's confident answers were right every time (every answer at
  ≥ 0.8 confidence or noul ≥ 0.9 / ≤ 0.1 matched its label — 50 such answers in run 1 and 47 in
  run 2, none wrong). Its errors cluster
  where its docs say uncertainty lives. On the `M6.E3` class it found what the shipped check cannot.
- **Does not:** establish recall (sets 1 and 2 have **one** positive each), validate any threshold,
  or generalise past this repository. Two of three label sets are Claude's reading, not an
  independent record.
- **Revises section 3:** item 5 (`M6.E3`'s semantic half) moves up — it is where the gap between
  the shipped check (0 of 4) and Jev (4 of 4) is widest. Items 2 and 3 hold, but only with
  confidence routing (auto-act high, person in the middle), never a bare 0.5 cut.

### Decisions this adds

- **E. The `TRIGGER_MET_RE` comment publishes 2 of 6 false; the rows say 5 of 6.** A fix-lane
  correction once Brett confirms the labels — rows 1362 and 1601 (own trigger `NONE`) are the
  quickest to check.
- **F. Commit the spike?** The script and dataset live in the session scratchpad. Committing them
  means a network-calling file in the repo; outside `tools/` it escapes the privacy audit's scope,
  which is the thing this section declined to do. Options: commit only the dataset and the labels
  (no network code), or commit nothing and keep this section as the record.
