# Issues Inbox

**The capture inbox.** Everything `/sig:add` records lands here first — ideas, bugs, questions, observations — in the words they were captured in, before anyone decides what they are.

**Where entries go from here.** Captures **drain to [`BACKLOG.md`](BACKLOG.md) (roadmap work) or [`BUGS.md`](BUGS.md) (defects)**, via `/sig:plan`'s Step 1b, which stamps each entry with its disposition (`promote` / `defer` / `merge` / `delete`). Nothing is built from this file directly. An entry with no stamp has not been decided on — it has only been written down.

> **Header corrected 2026-08-09 (backlog-review triage, finding `C5`).** This file described itself as what it stopped being at docs-layout **v3**: it was titled *"Future Ideas"*, called itself *"distinct from `MILESTONE-4.md`"* (a file now under `archive/milestones/`), said entries were *"not committed work"* candidates for *"v1.5 or v2"*, and instructed *"promote to a milestone file when ready to build."* **All four were wrong in the same direction** — they route a reader to milestone files, while `INDEX.md:22` and the live drain both route to `BACKLOG.md`/`BUGS.md`. The file's own most recent entries are bug-bearing captures, which the old header had no route for. Nothing mechanical caught this: the `MILESTONE-4.md` reference was in backticks, not a link, so the dead-link check could not see it.

---

## Trigger watchlist — standing entry (check conditions at every drain)

**Status:** Added 2026-07-04 (backlog review, ratified BR-6). **Standing entry — never promote, merge, or delete.** At each `/sig:plan` drain, walk the conditions below and act on any that have fired; update rows as triggers fire or as new trigger-parked items land. Rationale: 10+ parked entries carry promote-back conditions that nothing evaluated — including one *dated* trigger that would otherwise expire unobserved. See `BACKLOG-REVIEW-2026-07-04.md` §2 A1 + DECISIONS 2026-07-04.

| Parked item (entry / doc) | Trigger condition | Fired? |
|---|---|---|
| E1 Slices 3–5 — Linux/WSL install matrix + versioning policy + validator hardening (`MILESTONE-4.5.md` § E1) | A Linux or WSL tester volunteers (D-E3-12) | ❌ **NOT FIRED — checked 2026-08-01** (M5.E16 PLAN drain). No Linux or WSL tester has volunteered; the 4 non-Signal testers onboarded at M4.5 close are all macOS. Note the walk cannot *prove* this from inside the repo — no tester platform is recorded anywhere, so this row is evaluated against absence of evidence. **Re-parked, condition sharpened:** fires when a tester reports a platform, OR when any install-failure report names Linux/WSL. *Review by:* **2026-12-31** regardless — if no non-macOS user has appeared in five months, the honest move is to scope Signal as macOS-first in the README rather than keep this parked forever. |
| E3 contribution scaffolding — CONTRIBUTING.md / issue templates / `docs/compatibility.md` | (a) external PR opens; (b) ~5+ non-author issues; (c) Linux/WSL tester (pairs with the row above) | ❌ **NOT FIRED — checked 2026-08-01** (M5.E16 PLAN drain), all three sub-conditions measured, none met: **(a)** `gh pr list --state all` → 6 PRs, **all authored by `brettvt-insightriot`**, zero external; **(b)** `gh issue list --state all` → **0 issues** (the repo has never had one — and GitHub Issues adoption is itself still an unstarted Epic, so a non-author *cannot* currently file one; this sub-condition is unreachable by construction until that Epic lands); **(c)** pairs with the row above, also not fired. **Re-parked unchanged.** |
| Synthesizer-output validator-side sanity check | 2+ new synthesizer quality regressions by **2026-08-23** — dated; if the date passes with <2, mark expired-clean | ⏳ **PENDING, live until 2026-08-23** — checked 2026-07-29, 0 regressions so far. This is the row whose existence argued for implementing the walk rather than retiring the entry. |
| `/sig:doctor` helper-script split | Inline `node -e` payloads reported hard to audit, OR a P-state needs JSON mutations beyond delete-a-key | ❌ **NOT FIRED — checked 2026-08-01** (M5.E16 PLAN drain). `commands/doctor.md` carries **1** inline `node -e` payload, and no audit-difficulty report exists; no P-state has needed a JSON mutation beyond delete-a-key. **Re-parked unchanged** — the condition is well-formed and cheap to re-check. |
| `docs/map` refresh Stage 2 (auto-generate) | Stage 1 checklist forgotten on 3+ consecutive Epic ships | ❌ **NOT FIRED — but the condition was unmeasurable as written, and is now fixed.** Checked 2026-08-01 (M5.E16 PLAN drain). Stage 1 is `ship.md:66`, and it is **conditional**: *"refreshed **if** the command/agent/skill roster or structure changed."* Across the last three Epic ships (v0.1.13/M5.E8, v0.1.14/M5.E13, v0.1.15/M5.E17) the roster never moved — 18 commands / 26 agents / 21 skills throughout — so the checklist item was a **correct no-op**, not a forgotten step. *"Forgotten"* and *"not applicable"* are indistinguishable from the outside, which means this row could never have fired no matter how long it sat. **Re-parked, condition rewritten to something observable:** fires when a ship changes the roster **and** `docs/map/index.html` is unchanged in that same release. **This is now live rather than theoretical: M5.E16 FR6 moves the roster 18 → 19**, so the next ship is the first in four releases where Stage 1 actually applies. *Review by:* **the M5.E16 ship.** |
| GitHub Issues adoption (setup checklist in its entry) | First live external tester (expected to fire in Sprint 0 — `BACKLOG-REVIEW-2026-07-04.md` §4) | ✅ **FIRED 2026-07-15** (4 non-Signal testers). Decided 2026-07-29: direction ratified, needs its own Epic — `analysis/CLAIM-INTEGRITY-ANALYSIS.md` §7 + D-M5E13-7. |
| PREPARE phase early promotion | Any of: PLAN skill-load approaches ~40K tokens; 2+ independent "this is prep, not planning" observations; 2+ new skills land homeless | ❌ **NOT FIRED — checked 2026-08-01** (M5.E16 PLAN drain). Skill count is **21**, unchanged since M4.5 — zero new skills have landed, so none can have landed homeless. No "this is prep, not planning" observation is on record. The token sub-condition is **unmeasured, not passing**: nothing instruments PLAN's skill-load size, so it is being reported as not-fired on the strength of the other two only. **Re-parked with that limit stated in the row** rather than left implied. |
| STATE auto-update Options B/C | Option A discipline demonstrably fails (frontmatter stale despite the refresh steps) | ❌ **NOT FIRED — and the near-miss is the interesting part.** Checked 2026-08-01 (M5.E16 PLAN drain). The condition asks whether **frontmatter** goes stale despite the refresh steps. It does not: `transitionPhase` + `markFresh` have kept the frontmatter accurate, and the M5.E16-opening incident that looks like a failure of this row **is not one** — frontmatter correctly read `current_epic: M5.E17`; the **body prose** was what omitted M5.E17. Same file, opposite halves, and only the prose half drifted. **Option A's discipline is holding exactly where it was scoped to hold.** Two same-day data points confirm the split rather than contradict it: `CONTEXT.md` is seven Epics stale (prose, no frontmatter), and `B59` was a malformed PROFILE (neither). **Re-parked, condition left deliberately narrow** — do not widen it to cover prose drift, because that is not what Options B/C would fix. **Prose-vs-data drift is M5.E16's own subject matter**; if anything covers it, checks (a)–(g) do. |
| Second dogfood project (BR-9) | Committed in Sprint 0; if not started by the time M5 PLAN runs, escalate — M5's usage-signal gate has no other source | ✅ **SPLIT AND DECIDED 2026-07-30 (Brett).** **(a) The hedge half is DISCHARGED.** BR-9 existed because usage signal might never arrive — *"the only planned signal source is the outward tester loop, which is stalled"*. It arrived anyway, from **three** non-Signal projects: `eval-project-A` (its ship report produced **`B42`**, a P1 live since v0.1.3 across nine releases, plus `B43`/`B44`/`B45`), `eval-project-C` (`B53` + a `B50` sighting), and the CMMC dogfood (the 455 KB `STATE.md` that drove the whole doc-runtime design) — plus 4 non-Signal testers at M4.5 close. **No escalation:** the drought this insured against did not happen. **(b) The controlled-run half is RE-PARKED with a sharper condition.** Every one of those findings was **incidental** — someone read a ship report, someone checked a claim, someone read a transcript. And `B42` and `B53` are the *same class* (Signal breaks on linear / non-Epic projects), found separately, months apart; one deliberate FEATURE-tier greenfield run would have surfaced both at once. The `/sig:audit` entry's admission that its rubrics are *"calibrated against a sample of one"* is still true. *Promote on:* **before the v2 feature ports (BR-8) are committed to** — that is the decision the signal is actually for. *Review by:* **2026-10-31** regardless. |
| Multi-feature lifecycle design | First real "feature #2" added to a Signal-built project (likely the second dogfood project) | ✅ **FIRED — and largely discharged by work that shipped without anyone connecting it to this row.** Checked 2026-08-01 (M5.E16 PLAN drain). The entry's premise (line 283) is *"v1's 6-phase flow assumes a project goes through CALIBRATE → … → SHIP linearly, once"* and that Signal *"has no first-class concept of feature #N."* **It has one: Epic-native flow, shipped v0.1.7 (M4.5.E11, 2026-07-15)** — `current_epic`, Epic-scoped artifacts, Epic-scoped PROFILEs, `setCurrentEpic`'s roll semantics. Signal-on-Signal has since run **more than a dozen** sequential Epics on one project, which is the "feature #N" case executed repeatedly rather than designed for in advance. The trigger fired *and* the need was met, and this row sat at `—` through the whole of it. **Residual, re-parked:** the Epic model has only been exercised on a project that is **hand-maintained and Epic-mode from the start**; `B42`/`B53` are the standing proof that Signal behaves differently on project shapes it was not built against. *Promote on:* an **external** Signal-built project reaching its second feature. *Review by:* **2026-10-31** (pairs with the BR-9 controlled-run half above — same evidence gap, same date). |
| Option C concerns block (calibration granularity) | Users hand-edit dials against tier defaults, or want a rigor level their tier doesn't offer | ✅ **FIRED on the first half — measured, not inferred.** Checked 2026-08-01 (M5.E16 PLAN drain). Three Epic-scoped profiles exist, **all `created_by: hand`, all overriding tier defaults**: `M5.E7-PROFILE.md`, `M5.E17-PROFILE.md`, `M5.E16-PROFILE.md`. The last states the motive outright — *"`nyquist_enforcement` goes to `strict` — a level above M5.E17's `basic`. This is deliberate and it is the one dial that matters here."* That is the condition's first clause verbatim. **But the remedy Option C proposed is not what is needed**, so this is decided rather than promoted: hand-editing dials is not a workaround here, it is the **supported mechanism** (Epic-scoped PROFILE, M4.5.E11 FR3), and it works. **What the practice actually exposed is that nothing validated the hand-edits** — `B59`, found the same day at this Epic's own PLAN preamble: `M5.E16-PROFILE.md` carried two out-of-enum values and the Epic that declared FEATURE ran DISCUSS at FULL. **That gap is now closed twice over** — `tests/own-profiles-parse.test.js` for Signal's own repo, and **M5.E16 check (g)** for every invoking project. **Row closed as decided.** A concerns block remains a v2 idea with no live pull; re-open only if someone wants a rigor level the four tiers genuinely cannot express, which is the second clause and has **never** been observed. |

---

## **Dedicated test-sandbox project for Signal QA.** A commi...

**Status:** Logged 2026-07-17 via `/sig:add`. Surfaced 2026-07-17 during M5.E2 S4.t1 dogfood — verifying a live 28-move migration on the real repo took ~6 introspection passes; a curated sandbox would make it a glance. → Deferred 2026-08-14 (M6.E1 drain).

**▶ PARTIALLY DELIVERED 2026-08-07 — `examples/sandbox/` exists, covering the closure/archive
surface only.** Built after a recommendation to dry-run against `eval-project-A` was correctly rejected:
**production repos are not test beds**, and the absence of this sandbox is what made that the
obvious-looking move. Six units force all three closure outcomes plus the two interactions that
matter — `M1.E2` (closed by verdict, **vetoed** by a stub retro — `B64`) and `SLICE-AUTH` (the
non-Epic fold shape Signal's own tree structurally cannot reproduce — `B82`).
`tests/sandbox-corpus.test.js` pins the corpus so it cannot drift into agreeing with whatever the
code does.

**Still open, and listed in the sandbox README so an empty result is never read as a clean one:**
un-sectioned body bloat, append-logs (`DECISIONS.md`), milestone bloat, dangling / anchor /
reference-style / HTML links, CRLF, unstamped-but-conformant, and pre-reorg (v2) layouts. **Do not
close this entry** — add shapes as the commands needing them get worked on.

**Dedicated test-sandbox project for Signal QA.** A committed, browsable fixture project — one `.planning/` corpus deliberately seeded with every situation Signal's commands must handle plus edge cases (closed Epics with and without retros; un-sectioned body bloat; append-logs like `DECISIONS.md`; milestone bloat; dangling / anchor / reference-style / HTML links; CRLF; non-standard and linear layouts; unstamped-but-conformant; pre- and post-reorg) — that any `/sig:` command (especially `/sig:migrate-memory`) can be run against and diffed.

Purpose: fast human QA + faithfulness eyeballs, demos, onboarding, and regression — instead of "go read 10k lines of markdown and tell me if it's good." Complements the inline per-shape test fixtures (which prove the code) with something a human can open and reason about. Sibling to `examples/url-shortener/`, deliberately isolated from Signal's real `.planning/`. Candidate framing: its own small M5 Epic.

---

## Behavioral evals as a second measurement shape (eve factory)

**Status:** Logged 2026-08-18 via `/sig:add`.

**Behavioral evals as a SECOND measurement shape, next to the adherence harness.** From `vercel-labs/eve-software-factory-template` (MIT), `evals/`.

`tools/adherence-ceiling.js` currently reports **105 of 493 directives trace-measurable (21.3%)** — 388 directives with no observable trace, and the tool is explicit that those are *unmeasured, NOT passing*. Signal's harness measures by **deleting** an instruction and comparing treatment against control; that only works where obedience leaves a trace it can name.

The eve evals measure differently: send a prompt, then assert against the run's **event stream** — `t.calledSubagent("implementer", {count: 0})`, `t.notCalledTool(...)`, `t.eventsSatisfy("classifier before analyst", events => calledInOrder(events, [...]))` — and add a **soft LLM judge** (`t.judge.autoevals.closedQA(...).atLeast(0.5)`) for the part that is a wording judgement. Hard assertions and a soft judge in the same eval, so the graded part is scoped to what actually needs grading.

**What this would cover that the canary cannot:** ordering directives ("read PROFILE.md before anything else"), negative directives ("do not spawn agents at SKETCH"), and refusal directives ("halt on the default branch") — all of which are behaviours, not artifacts.

⚠ **Not a straight port.** Signal has no equivalent of `MessageStreamEvent` to assert over; a Claude Code plugin does not get a structured trace of its own run. Whether this shape is even implementable here is the first question, not an implementation detail — and `claude plugin eval` may be the missing substrate. Park it against that, rather than treating it as ready work.

---

## /sig:permissions principle — authority from outside the model input surface

**Status:** Logged 2026-08-18 via `/sig:add`.

**A principle for `/sig:permissions`: derive authority from something the model cannot influence.** From `vercel-labs/eve-software-factory-template` (MIT), `agent/lib/trust.ts` and `agent/lib/factory-brain.ts`.

`AGENT-EFFECTIVENESS-ALIGNMENT.md` names environment readiness as Signal's absent axis and says it is blocked on a permission model, not a one-off exception. That model needs a founding principle, and this repo states one twice, in two unrelated places:

- **Trust:** *"Trust is decided once, at dispatch, on the signed webhook… Nothing downstream re-derives trust from model-readable content."* The channel stamps a `trusted` attribute only for commenters whose GitHub `author_association` is OWNER / MEMBER / COLLABORATOR — a fact from the signed payload, never from anything the model read.
- **Scoping:** the shared memory document's storage key is *"derived entirely from `FACTORY_REPO`… **never from model input or a caller's principal**"*, and lives under a reserved namespace so no general-purpose storage tool can use it as a side channel.

One rule, stated twice: **authority and scope come from outside the model's input surface.** Signal's current gates are the opposite — every one of them reads a document (`PROFILE.md`, `STATE.md`, `BUGS.md`) that a model can also write.

This is a note for whenever `/sig:permissions` is designed, not a work item. It settles nothing about scope; it says what the first design constraint should be.

---

## Prior art for the attention axis — an unattended principal that parks

**Status:** Logged 2026-08-18 via `/sig:add`.

**Prior art for `LOOP-ENGINEERING-ANALYSIS.md`'s `attention` axis — a working unattended principal that parks.** From `vercel-labs/eve-software-factory-template` (MIT), `agent/lib/trust.ts`.

The analysis proposes splitting `gate_strictness` into rigor and **attention** (attended / checkpointed / unattended), with an async decision queue and reversibility-weighted auto-adopt. This repo has a shipped version of the hard part.

An unattended run gets a **distinct constructed principal** (`github:foreman-factory`, deliberately shaped so it can never collide with a real user id), and the approval policies deny it everything except: labels, progress comments **on its own intake issue**, closing/reopening issues, and **draft** pull requests. The reasoning is stated in the source: *"an unattended turn has nobody to answer an approval card and would park forever."*

**The three transferable pieces:**
1. **Unattended is an identity, not a flag.** The permitted set hangs off the principal, so a new capability inherits the right behaviour by default instead of needing its own attended/unattended branch — which is `B75`'s failure mode (`light` and `strict` differing by one boolean because every other difference was prose).
2. **The split is by reversibility, exactly as the analysis proposed** — reversible writes run unattended, anything that *ships* parks for a person. Their scheduled-run principal follows the same rule even though no schedule ships in the template.
3. **The unattended run may narrate only on its own thread**, scoped by an attribute stamped at dispatch. Signal has no equivalent notion of "where this run is allowed to write."

Pairs with the `/sig:permissions` principle entry; both come from the same file.

---

## A hard size bound on the curated memory document

**Status:** Logged 2026-08-18 via `/sig:add`.

**A hard size bound on the curated memory document.** From `vercel-labs/eve-software-factory-template` (MIT), `agent/lib/factory-brain.ts`.

`MAX_FACTORY_BRAIN_LENGTH = 40_000` characters, with the intent written next to the constant: the brain is *"a short, curated set of durable notes about the target repository, not a transcript of every run… The bound keeps it small and cheap to load into context at the start of every task."*

Signal's equivalent surfaces have no bound and show it: `.planning/` is ~4.7 MB, `CONTEXT.md` answers *"what's current"* in **two places** (a known, still-unfixed structural defect recorded in its own footer), and `CLAUDE.md`'s Current State has gone stale enough to need correcting three times in this repository's recent history. `checkClaudeMdBloat` exists but **advises**; nothing bounds anything.

The borrowable part is not the number — 40k is theirs, for one document, on a different runtime. It is that **the bound is a constant in code with its rationale beside it**, so "this file is getting long" becomes a failing check rather than a judgement someone has to make while tired.

Open question this does not answer: which Signal document should carry a bound. `CONTEXT.md` is the obvious candidate; `.planning/` as a whole is the wrong unit, because archive growth is correct behaviour.

---




*Last updated: 2026-08-18*
