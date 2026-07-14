# Signal — Integration Rundown v2: SEED (input, not the deliverable)

> **Status.** This is a **seed / input**, captured 2026-07-13 — *not* the v2 rundown itself.
> M5's locked opening Epic (BR-8, `DECISIONS.md` 2026-07-04) is to run a fresh feature-parity
> re-audit across all inspiration repos and produce `SIGNAL-INTEGRATION-RUNDOWN-v2.md` with a
> **sequenced** Epic queue. This file exists so the two findings that the current
> `MILESTONE-5.md` plan does **not** already capture aren't lost before that audit runs. The
> re-audit should **re-verify everything here against live repos** (the source analysis is
> April 2026 — ~15 months stale by M5) and then **supersede this file**.
>
> Complements `REPO-ANALYSIS.md` (original landscape) and `SIGNAL-INTEGRATION-RUNDOWN.md`
> (v1 target vision). Feeds `MILESTONE-5.md` § opening move.

---

## 1. Reflection scorecard — how much of each inspiration repo is in Signal today (v0.1.5)

Fills are **directional estimates**, not measured — the pattern matters, not the number.

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

## 3. Strategic decision still undecided

- **Compounding substrate: per-project vs per-org.** One of the four "strategic decision points" in `REPO-ANALYSIS.md` Part 6, never resolved. `MILESTONE-5.md` E2 punts with *"carry forward via `.planning/`"*, which does not answer whether learnings live **per-repo** or in a shared **per-org** store — the latter was called *the* differentiator for the consultancy. **Decide before building the Compound phase**, not during.

---

## 4. What the M5 opening re-audit should do

1. **Re-verify** every repo characterization against the live repos (source is April 2026).
2. **Fold sections 2 + 3 into the sequenced Epic queue** — a home or an explicit cut for each unslated item; resolve the per-org/per-project decision.
3. Produce `SIGNAL-INTEGRATION-RUNDOWN-v2.md` and **supersede this seed** (delete or archive it).

---

*Seed captured 2026-07-13. Cross-refs: `REPO-ANALYSIS.md`, `SIGNAL-INTEGRATION-RUNDOWN.md`, `MILESTONE-5.md` (opening move), `DECISIONS.md` 2026-07-04 (BR-8).*
