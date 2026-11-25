# Signal — Integration Rundown v2: SEED (input, not the deliverable)

> ## 📜 ARCHIVED 2026-07-26 — the audit this seeded has run
>
> **Deliverable: [`SIGNAL-V2-ROADMAP.md`](SIGNAL-V2-ROADMAP.md).** This file did its job and is kept
> for provenance, not for guidance. **Partial supersede — read which half is which:**
>
> - **§1 (the reflection scorecard) is DEAD, in frame and not merely in content.** A coverage
>   scorecard counts what is **absent**, so it structurally cannot see where Signal is *ahead* of a
>   source — which the audit found on its first pass (D-M5E7-1). Its Epic IDs are also superseded,
>   and three of its rows carry factual corrections (**C3**, **C5**, **C7**).
> - **§2 (the five "flagged desirable, never queued" items) CARRIES FORWARD** — and it was right to
>   demand a home or an explicit cut for each. **All five now have one** (`SIGNAL-V2-ROADMAP.md` §5
>   and [`.planning/M5.E7-DISPOSITIONS.md`](../.planning/M5.E7-DISPOSITIONS.md) §4): four abandoned on fit or overlap, one split, with the
>   worktree half promoted to a **`build`**. *The GTM item in particular was cut here for the first
>   time — it had read as "planned" for three months while belonging to no queue at all, which is
>   exactly the silent drop §2 was written to prevent.*
> - **§3 (the settled per-repository substrate decision) CARRIES FORWARD, unchanged and still
>   locked.** The audit explicitly held it closed (AC3.5); cross-install telemetry is scoped as the
>   opt-in analysis layer that lock already permits, not a change to the primitive.
>
> The name it anticipated — `SIGNAL-INTEGRATION-RUNDOWN-v2.md` — was **deliberately not used**: it
> presupposes the coverage frame the audit retired (D-M5E7-5).

> **Status.** This is a **seed / input**, captured 2026-07-13 — *not* the v2 rundown itself.
> M5's locked opening Epic (BR-8, `DECISIONS.md` 2026-07-04) is to run a fresh feature-parity
> re-audit across all inspiration repos and produce `SIGNAL-INTEGRATION-RUNDOWN-v2.md` with a
> **sequenced** Epic queue. This file exists so the two findings that the current
> `MILESTONE-5.md` plan does **not** already capture aren't lost before that audit runs. The
> re-audit should **re-verify everything here against live repos** (the source analysis is
> April 2026 — ~15 months stale by M5) and then **supersede this file**.
>
> **⚠ C6 — corrected 2026-07-26. "~15 months" is false by ~4.5×, and it is this line that
> propagated the error.** `REPO-ANALYSIS.md` is dated **2026-04-21**; the first repo commit is
> **2026-04-13**; the re-audit ran **2026-07-25** → **3 months and 4 days**. The figure was
> inherited uncritically from here into a **locked decision** (`D-M5E7-1`), into
> `M5.E7-REQUIREMENTS.md` FR2, and into the research briefs. It was load-bearing: it supplied one
> of two supports for the audit's reframe and implied that a port left un-built that long had been
> implicitly rejected. Three months — while shipping v1, closing an 11-Epic milestone, cutting 11
> releases, and building the doc-runtime — is ordinary sequencing under finite capacity, not
> evidence of rejection. **Ruling (`D-M5E7-6`): staleness carries zero weight in any abandon
> decision.** The reframe stands on its surviving support, which is unaffected by dates.
>
> Complements `REPO-ANALYSIS.md` (original landscape) and `SIGNAL-INTEGRATION-RUNDOWN.md`
> (v1 target vision). Feeds `MILESTONE-5.md` § opening move.

---

## 1. Reflection scorecard — how much of each inspiration repo is in Signal today (v0.1.5)

Fills are **directional estimates**, not measured — the pattern matters, not the number.

> **⚠ §1 is superseded in frame, not just in content (2026-07-26, M5.E7 / `D-M5E7-1`).** A coverage
> scorecard asks *"how much of each source repo have we absorbed?"* — it can only count what is
> **absent**, so it structurally cannot see where Signal is **ahead** of a source. M5.E7 found such
> a case on its first pass: Signal's `performance-optimization` is measurement-first and refuses to
> optimize without evidence, while pm-skills' `/performance-audit-static` **never measures**
> ([`.planning/M5.E7-SUPPLY-PMSKILLS.md`](../.planning/M5.E7-SUPPLY-PMSKILLS.md)). The audit therefore runs on *"what does Signal need
> next?"* instead. §2's five items and §3's settled decision carry forward; **§1's frame does not.**
>
> Two rows below also carry inline claim corrections — **C3** (superpowers) and **C5**
> (compound-engineering).

| Repo | Role in the vision | Status today |
|---|---|---|
| **GSD** | Engine room (Layer 2) | **Built.** Wave execution, fresh-context-per-task, `.planning/` state, 8-dim plan validation, Nyquist, goal-backward verify, ~19 agents. Load-bearing core; nothing material pending. |
| **Agent Skills** (Osmani) | Quality substrate | **Built.** All 21 skills, phase-bound, on-demand, REVIEW phase, 3 specialists, anti-rationalization tables. *Caveat:* two skills (TDD, security) are slated for **replacement** in M5 — so it's currently *more* present than the target wants. |
| **Signal / Calibrate** | Phase 0 (own) | **Built + expanded.** calibrate + escalate + PROFILE.md + tier-gating — plus six commands no source repo called for: `init`, `status`, `resume`, `add`, `checkpoint`, `doctor`. |
| **superpowers** (obra) | Immune system (Layer 3) | **Partial — concept, not teeth.** Anti-rationalization gate concept is live (`phase-gate-enforcer`); the harder TDD (delete pre-test code), 4-phase systematic-debugging, and `<HARD-GATE>` blocking mechanism are **queued (M5.E4)**. |
| **planning-with-files** | Context booster (Layer 2 graft) | **Partial — thesis, not the grafts.** Disk-as-memory is live (GSD `.planning/` + Signal's own hooks); the 2-Action Rule, PostToolUse re-read, and findings-quarantine grafts are **queued (M5.E5)**. |
| **oh-my-claudecode** | Spec-rigor gate (Layer 1) | **Partial — questioning, not the measurable gate.** DISCUSS does adaptive questioning; `plan-checker`'s 8-dim is a weak native stand-in for consensus. The 20% ambiguity gate, true consensus planning, `ralph`, `visual-verdict` are **queued or unslated**. |
| **compound-engineering** (Every) | Memory (Layer 5) | **Partial — retrospection seeded, the loop absent.** Native down-payment: E9 SHIP retro gate + `RETROSPECTIVES.md` + `/sig:index` doc-runtime work. But that's **memory-hygiene**, not the **compounding-improvement loop** (`learnings-researcher` mining sessions, `session-historian`, multi-lens panel) — **queued (M5.E2)**. |
| **gstack** (Garry Tan) | Exec-team borrows (Layers 1/3/4/5) | **Not yet — ~nothing ported.** The repo the analysis called *"the sleeper — steal from it"* is the **least reflected of all nine.** `/cso` → M5.E3, `/office-hours` → M5.E1, `/retro`+`/learn` → M5.E2; only the scope-mode idea faintly echoes in calibrate. |
| **pm-skills** (phuryn) | Upstream (Layer 1) | **Not yet — zero.** The entire IDEATE/VALIDATE/STRATEGIZE layer is empty — the analysis's named **#1 gap**, still #1. All **M5.E1**. |

> **⚠ C3 — corrected 2026-07-26 · ⚠ C5 — corrected 2026-07-26 · ⚠ C7 — corrected 2026-07-26.**
> Three row-level corrections, verified against live repos in M5.E7 Slice 2.
>
> - **C3, superpowers row.** *"`<HARD-GATE>` blocking mechanism"* names a thing that does not exist
>   as a mechanism: no parser, no validator, 1 live occurrence in v6.2.0, author says the mechanism
>   is unsettled. The portable machinery is `subagent-driven-development`'s five-round breaker with
>   `BLOCKED` propagation (1,063 lines, shipped 2026-07-23). Signal has been queuing a **syntax**.
> - **C5, compound-engineering row.** *"`learnings-researcher` mining sessions, `session-historian`"*
>   presents two agents as one Compound-phase unit. Only `session-historian` is under `ce-compound`.
> - **C7, Signal/Calibrate row.** *"six commands no source repo called for"* then lists six, but
>   the count is stale: it is **nine** today (`init`, `status`, `resume`, `add`, `checkpoint`,
>   `doctor`, `index`, `migrate-memory`, `sweep`).
>
> **The Epic IDs in every row are also superseded.** `M5.E1`–`M5.E5` here are pre-override port
> labels; those IDs were reassigned to the doc-runtime and bug-squash Epics that actually shipped.
> Read `MILESTONE-5.md` § Epic status, and after M5.E7 closes, [`analysis/SIGNAL-V2-ROADMAP.md`](SIGNAL-V2-ROADMAP.md).

**Big picture.** Signal built the **middle of the stack to production quality and left both ends open** — Layer 2 (engine) + Calibrate + the Agent Skills quality half are in; **Layer 1 (strategy/upstream)** and **Layer 5 (compound/memory)** remain the real frontier. Shipped v1 is **deliberately narrower than the analysis's own "Minimum Viable Frankenstein"** (which included pm-skills upstream, superpowers TDD, gstack `/cso`, and the Compound phase) — a sanctioned choice (RUNDOWN Reconciliation § "ship the narrow MVP first"), and it worked (v1 shipped + hardened through M4.5).

---

## 2. The gap `MILESTONE-5.md` does NOT capture — "flagged desirable, not even queued"

These were called out as desirable in `REPO-ANALYSIS.md` / `SIGNAL-INTEGRATION-RUNDOWN.md` but appear in **no** M5 Epic (E1–E6). As the roadmap stands, executing M5 as written would silently drop them. The re-audit must give each a **home or an explicit cut decision** — no silent drops.

- **gstack `/plan-ceo-review` scope-modes → `/sig:plan`.** RUNDOWN said "inspire the plan phase"; not in any M5 Epic.
- **gstack design-review + browser daemon → `/sig:verify`.** Unslated. *Partly moot* — Signal already grew native `ui-auditor` / `ui-checker`, so some of this is covered its own way.
- **OMC `visual-verdict`, `ralph` acceptance-loop, consensus-planning (planner+architect+critic).** M5.E1 names only `deep-interview`; these three aren't slated. (`plan-checker`'s 8-dim is a partial native stand-in for consensus.)
- **pm-skills GTM (beachhead / ICP / growth loops) + data-analytics stubs.** RUNDOWN routes these into SHIP, but M5.E1 is upstream-only — so **GTM currently has no home in the queue.**
- **compound-eng language-specific style agents (DHH Rails, etc.) + worktree execution.** Unslated. *Worktree is now partly moot* — the Agent tool has native worktree isolation.

---

## 3. Strategic decision — RESOLVED 2026-07-15

- **Compounding substrate: per-project vs per-org — decided per-repo.** One of the four "strategic decision points" in `REPO-ANALYSIS.md` Part 6. **Resolved 2026-07-15** (Brett, during orientation — i.e. *before* building, as this section asked): the substrate is **per-repository** — learnings live in each repo's own `.planning/`. Org-wide learning is **not** a Signal primitive; it's an **opt-in analysis a user runs over multiple repos' `.planning/`**, layered on top of the per-repo store. `MILESTONE-5.md` E2's "carry forward via `.planning/`" now has a definite answer. The re-audit inherits this as settled input — do not re-open it. See `DECISIONS.md` 2026-07-15.

---

## 4. What the M5 opening re-audit should do

1. **Re-verify** every repo characterization against the live repos (source is April 2026).
2. **Fold sections 2 + 3 into the sequenced Epic queue** — a home or an explicit cut for each unslated item; resolve the per-org/per-project decision.
3. Produce `SIGNAL-INTEGRATION-RUNDOWN-v2.md` and **supersede this seed** (delete or archive it).

---

*Seed captured 2026-07-13. Cross-refs: `REPO-ANALYSIS.md`, `SIGNAL-INTEGRATION-RUNDOWN.md`, `MILESTONE-5.md` (opening move), `DECISIONS.md` 2026-07-04 (BR-8).*
