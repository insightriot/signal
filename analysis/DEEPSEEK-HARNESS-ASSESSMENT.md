# DeepSeek Harness, assessed against Signal

**Date:** 2026-09-01
**Source:** [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) (MIT).
**Method:** Read primary source via the GitHub API — repo metadata, the package and docs trees,
`.agents/notes/README.md`, `packages/goal/README.md`, `scripts/` listing, `scripts/doc-typecheck.ts`,
`scripts/doc-budgets.manifest.json`. **Not** read from a summarising model's description of the page:
the first fetch produced exactly that, and this repository shipped a rule against it in `v0.1.25`.

---

## 0. What it is, and what does not transfer

`dsh` is an agent **runtime** — a pnpm/TypeScript monorepo of ~50 packages on a plugin kernel
(Cordis), with a web UI, sandboxing, LLM adapters, and an API gateway. Signal is a **methodology
plugin** for a runtime someone else ships. So most of what is impressive here is not borrowable:
the package topology, the service/seam architecture, the transport layers.

**Two caveats stated up front, because they bound every claim below.**

1. **The repository is three weeks old** (created 2026-08-13). Its 207,935 stars and 24,200 forks are
   real and were read from the API, not the page — but at three weeks those measure launch attention,
   not a design proven in use. Nothing here should be adopted *because* of that number.
2. **I read their documented rules, not evidence that the rules hold.** Their gates are described in
   prose I am now treating as fact about their repo. That is the same provenance step Signal fails
   when it cites its own unenforced rules — so every item below is assessed on whether the *mechanism*
   is sound for Signal, not on whether DeepSeek is succeeding with it.

---

## 1. The one finding that matters most

**Status is encoded in the file path, and a gate cross-checks it against the file's own header.**

`.agents/notes/{lifecycle}/{class}/yyyy-mm-dd-topic-title.md`, where lifecycle is one of
`proposed/`, `implemented/`, `rejected/`, `archived/`. The in-file header carries `Status: proposed |
implemented | rejected — <why>`, and — quoting their README — *"must agree with the lifecycle folder
the file sits in — the gate cross-checks them."*

**This is a direct answer to something Signal measured this morning and could not fix with a better
regex.** [`LOOP-GOAL-DIRECTION.md`](LOOP-GOAL-DIRECTION.md) §3 ran the best honest candidate rule over
`BACKLOG.md`'s real rows: **77% precision, ~37% recall**. Two of the three false positives were
structural — a closed item's closure is recorded in a *struck sibling heading* while the original row
is preserved unstruck for provenance, so **the fact that distinguishes done from live is not in the
row**. No row-local rule can see it.

Path-encoding makes status row-local **by construction**. There is nothing to parse, nothing to infer,
and no drift possible between where a thing lives and what it claims — because a script rejects the
disagreement.

**Signal-shaped version, and it is smaller than it sounds:** the finding is not "adopt a notes tree."
It is that **a status a machine must infer from prose is a status Signal cannot act on**, and Signal
has now measured that twice (`AC3.2` at 13-flags/1-real; this at 77%). Either status becomes
structural — a path, or a machine-readable marker written at authoring time — or automatic work
selection stays off the table. My analysis recommended the latter; this is the concrete shape of the
former, and it is the more durable fix.

---

## 2. Genuinely new, ranked by value to Signal

### 2.1 `rejected/` as a first-class tree with a *retention policy*

Their rule: *"Keep it only while its rationale prevents a tempting, meaningful mistake; otherwise
delete the complete triplet."*

Signal records dead ends unusually well — `BACKLOG.md`'s dated "checked and declined" and "RE-PARKED"
entries, `M5.E10`'s required *"what this could not establish"* sections — and
[`LOOP-GOAL-DIRECTION.md`](LOOP-GOAL-DIRECTION.md) §4 found **nothing reads any of it at cycle start**,
with budget named as the real constraint (`BACKLOG.md` 139 KB, `BUGS.md` 320 KB).

**The insight Signal is missing is not how to read dead ends. It is that dead ends should be
deleted when they stop earning their place.** Signal's retention policy is "keep everything, dated,"
which is why reading it forward is a budget problem rather than a lookup. A `rejected` record whose
mistake nobody is tempted to make any more is cost with no signal.

### 2.2 Cross-references must be links, never bare prose or numbers

Quoting: cross-references *"use relative markdown links … never bare prose or numbers — **so they are
mechanically checkable and survive moves between folders**."*

**Signal's `B112` was cited as *filed* in six places across five documents for three days while
absent from `BUGS.md`.** Every one of those citations was a bare token. A link-shaped citation is
checkable by a dead-link walk Signal **already has** (`/sig:sweep`'s dead internal links check) — the
rule change alone would have caught it with no new detector.

Cheapest high-value item in this document.

### 2.3 Documents generated from code, with a "do not edit by hand" header

`gen-doc-graphs.ts`, `gen-tool-catalog.ts`, `gen-config-catalog.ts`, `gen-module-graph.ts`,
`gen-persistence-catalog.ts`. Their architecture doc opens: *"Generated by scripts/gen-doc-graphs.ts -
do not edit by hand."*

`M6.E2` named Signal's defect class as *a document stating a fact about the project that nothing
derives from the artifact it summarises*, and shipped five **checks** for it. DeepSeek's answer is one
level stronger: for whole categories of document, **don't check the hand-written text — don't have
hand-written text.** Signal already does this in two places (`bugs-tally.js`, `adherence-ceiling.js`),
and both are among its most reliable mechanisms. The direction generalizes further than Signal has
taken it — a generated command roster, a generated agent roster.

### 2.4 `doc-typecheck.ts` — code fences in docs are compiled against the real API

TypeScript fences in markdown are typechecked against the workspace; unchecked fences are marked
`ignore-check` and **counted as an opt-out ratio**.

Signal's docs are full of symbol and `file:line` citations that nothing verifies. Two live examples
from today: `LOOP-ENGINEERING-ANALYSIS.md`'s citations predate the `M6.E1` payload move and are
stale wholesale, and **`B113` was exactly this defect** — `drive.md` named a call signature that the
code would refuse. The test I wrote for it (`drive-doc-contract.test.js`) resolves every symbol
`drive.md`'s reference list names against real exports. **That is a hand-rolled one-file version of
what they run repo-wide**, and generalizing it to every command file is a well-scoped Signal-sized job.

⚠ The opt-out *ratio* is the subtle part and the part worth copying: an escape hatch that is counted
is a measurement; one that is merely available is an unbounded leak.

### 2.5 `doc-budgets.manifest.json` — per-file line budgets, enforced

Eight files with explicit line ceilings (`AGENTS.md: 1950`, `docs/architecture.md: 2400`, …).

Signal has a CLAUDE.md-bloat check in `/sig:sweep` and a tier-aware `STATE.md` size banner, so the
idea is not new — but both are **advisory**, and Signal's `CLAUDE.md` has grown to a size where the
current-state section alone is many screens. A budget is a decision made once, in advance, that a
reviewer does not have to re-argue.

### 2.6 A record with every non-trivial change, not just at Epic close

*"Every non-trivial change MUST add or update at least one Agent Note in the same PR"* — with
"non-trivial" defined explicitly and a narrow stated exemption.

Signal's retrospective gate is real and unbypassable, but it fires at **Epic close**. The fix lane —
which shipped five of the last nine releases — produces no durable rationale record at all; what
exists is the commit message and a `BUGS.md` row. Their rule is stricter than Signal's and cheaper
than it sounds, because updating the note that already owns the decision satisfies it.

---

## 3. Confirmation, not information

Recorded because agreement from an unrelated team is worth knowing, and because this repository's
own convention is to say which sources taught it nothing new.

- **"A goal is state, not a scheduler — automatic continuation is an opt-in consumer you mount
  deliberately."** (`packages/goal/README.md`.) This is
  [`LOOP-GOAL-DIRECTION.md`](LOOP-GOAL-DIRECTION.md) §2's conclusion — *do not build a trigger; the
  operator supplies the clock* — reached independently, hours earlier, from Signal's own constraints.
  Two teams converging on the separation is meaningful support for a recommendation that otherwise
  rests on one analysis. **No new build item.**
- **One durable goal per session, surviving restart/resume/fork, stored in the session log rather than
  a separate store.** Signal's equivalent is `.planning/` and `current_epic`. Same shape.
- **Numbered postmortems** (`docs/postmortem/0001-…`). Signal has `BUGS.md` with richer per-entry
  forensics; the numbering buys nothing here.
- **Skills as calibrated workflows** — their archive skill explicitly prefers a judgement workflow
  *"rather than word count, age, or a target quota."* That is `/sig:calibrate`'s thesis restated.

---

## 4. Explicitly do not borrow

- **The i18n triplet + sidecar hashes + frozen-archive manifest.** Every note exists in English,
  Chinese, and a consistency sidecar, with hash verification and an append-only frozen manifest.
  Correct for a 200k-star multilingual project; absurd overhead for one maintainer writing English.
- **The no-`INDEX.md` decision.** They removed their generated index deliberately. Signal's `INDEX.md`
  regenerates at every phase transition and works. Different scale, different answer; do not import
  their conclusion with their mechanism.
- **The Cordis plugin kernel and the package/seam topology.** Signal is not a runtime. Adopting this
  vocabulary would be architecture cosplay.

---

## 5. Recommendation

**One item is worth an Epic; three are worth an afternoon each; the rest is confirmation.**

| Item | Size | Why now |
|---|---|---|
| §2.2 link-shaped cross-references | **small** | `B112` would have been caught by a walker Signal already has. Do this first. |
| §2.4 doc↔code symbol contract, generalized to all commands | **medium** | `B113` is the proof it catches real defects; the one-file version already exists and passes. |
| §2.5 doc budgets | **small** | Turns a recurring advisory into a decision made once. |
| §1 / §2.1 structural status + dead-end retention | **large, Epic-shaped** | The measured fix for 77%/37%, and the unblock for automatic work selection. Not before the others. |
| §2.3 generate more documents | **medium** | Extends two mechanisms Signal already trusts. |
| §2.6 record per non-trivial change | **product call** | Raises fix-lane overhead. Brett's call, not a mechanical one. |

**What I would not do is treat this as a porting exercise.** The valuable part is not their tree; it
is that **four of Signal's live defect classes have the same root** — a fact that a machine must infer
from prose is a fact that drifts — and this repository has independently converged on structural
answers to it. Signal has been fixing that class one detector at a time.

---

## 6. What this assessment could not establish

- **Whether any of their gates actually hold.** I read the rules, not CI runs or a compliance
  measurement. A repository can document a gate and not enforce it — that is `B75`, filed here.
- **Whether the design survives contact with users.** Three weeks old, developer preview, README
  warning of compatibility-breaking changes.
- **Nothing was read at code level** beyond `doc-typecheck.ts`'s header comment and the budgets
  manifest. The package READMEs describe intent; I did not verify implementations match.
- **No claim about star-count meaning.** It was read from the API and is stated as attention, not
  quality.
