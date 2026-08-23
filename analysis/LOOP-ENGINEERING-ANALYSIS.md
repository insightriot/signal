# Loop Engineering in Signal — Findings & Recommended Build Path

**Date:** 2026-08-03
**Status:** Analysis. Feeds a future Epic (not yet scheduled; captured in `.planning/ISSUES-INBOX.md`).
**Method:** Line-cited audit of every human-in-the-loop touchpoint across `commands/*.md` (the seven phase commands plus `resume` and `escalate`), `references/profile-schema.md`, `references/tier-definitions.md`, `references/phase-gates.md`, `references/question-patterns.md`, `references/epic-native-flow.md`, and the code paths that consume them (`tools/lib/profile.js`, `tools/lib/execute.js`, `agents/executors/executor.md`). Code-level claims below were verified directly against the source, not inferred from prose.

---

## 1. The question

Signal's rigor is built around a human making decisions at every phase: answer calibration questions, lock DISCUSS decisions, approve the plan, approve verification, approve review, approve the ship. What would "loop engineering" look like inside a Signal project — keeping the rigor, structure, and guardrails, while removing most of the *synchronous* human attention, so more work happens faster (parallelism) and more autonomously (no constant supervision)?

## 2. Core recommendation

**Yes — this is achievable, and Signal is unusually well-positioned for it.** The honest form of the "yes": the human is not removed from the loop, they are **relocated** — from synchronous approver (blocking mid-flight ~48–86 times per FULL-tier Epic) to three cheaper positions:

1. **Policy author** before the run (standing decisions, calibration, autonomy envelope).
2. **Async exception handler** during the run (a queue, not an interrupt).
3. **Batch auditor** after the run (review the decision log + **diff** + retro in one sitting — the diff, meaning the code, not a diffstat; see FM-3).

**And one role that is not a position but a floor** *(added 2026-08-08)*: the human keeps reading the code of shipped work at every attention level, because that is what keeps the system diagnosable when something eventually goes wrong that neither the human nor the agent can explain. This is the sixth row of §5.2's conversion table and the only row that does not convert. Attention is relocated by this design; **comprehension is not relocatable**, and the counter-evidence for what happens when it is treated as if it were is in `analysis/AUTONOMY-COUNTERWEIGHT.md` §1.

One gate stays hard under the current delivery contract: **PR merge**. Because `marketplace.json` uses the relative `.` source, users track `main` — merging *is* shipping (`D-M5E17-4`). An unattended loop that merges its own PRs is unattended deployment to real users. The loop terminates at PR-open and keeps working; the human merges on their own schedule.

What makes this a confident yes rather than a hopeful one: **most of Signal's human gating is ceremony that exists only in prose, and an autonomy switch already exists in the schema.** The machinery is roughly 70% built. What's missing is one conceptual unbundling (attention ≠ rigor), one queue (async decisions), one driver (the loop itself), and — for cross-Epic parallelism — one real state redesign.

The framing is also on-brand: `/sig:calibrate` right-sizes **rigor** per project; loop engineering is the same move applied to **attention**. Signal vs. noise, applied to interrupts. No repo in the analyzed landscape (`analysis/REPO-ANALYSIS.md`) has this either — it would be a second unique contribution alongside calibration.

---

## 3. Findings

### 3.1 The touchpoint inventory

Synchronous human touchpoints per phase, at FULL tier (`gate_strictness: strict`, no skips, `review_depth: full`). The count is a formula, not a constant:

`G` = DISCUSS gray areas · `M` = PLAN inbox-drain candidates · `P` = promoted · `D` = deleted/merged · `U` = unevaluated watchlist rows · `W` = EXECUTE waves · `L` = VERIFY fail-loops.

| Phase | Gate sites | Expansion at FULL | Fires regardless of `gate_strictness` |
|---|---|---|---|
| CALIBRATE (per-Epic, optional) | 5 diagnostic questions + tier accept/override | 6 | all of them — calibrate has no profile to consult yet; plus the `.gitignore` confirm (`calibrate.md:101`) and the no-auto-create-`.planning/` block (`calibrate.md:63`) |
| DISCUSS | per-gray-area asks, NFR prompt, Epic tier offer, transition approval | G + 3 | Done-Epic halt; Epic tier offer |
| PLAN | 7 step-confirms + plan approval + drain cluster | 9 + M + 3P + D + U (drain = 0 if skipped) | diff-preview accept (`plan.md:93`), delete/merge `[confirm, keep]` (`plan.md:95`) |
| EXECUTE | wave-boundary confirms only; **no approval box in Exit Criteria** | W | none |
| VERIFY | 5 step-confirms + results approval + FAIL ask | 6 + L | the Loop Back ask (`verify.md:108`) — no tier qualifier |
| REVIEW | 5 step-confirms + results approval; **no FAIL ask** | 6 | none |
| SHIP | 10-item checklist + PR creation + evict confirm + merge approval | 13 | retro pre-check halt (`ship.md:27-42`, "No bypass" per D-E9-3), `lossy-card` refusal (`ship.md:113`), PR-not-optional (`ship.md:104`) |

**Worked totals:**
- Minimal FULL Epic (G=3, drain skipped, W=3, L=0, per-Epic calibrate taken): **48 touchpoints**. Without per-Epic calibrate: 42.
- Same run with a realistic drain (M=12, P=4, D=2, U=11): **86 touchpoints**.
- SKETCH run (`gate_strictness: off`, REVIEW skipped): **~8** (calibrate's 6, the two tier-independent drain sub-gates when drain runs, SHIP's PR-creation floor).

Signal already spans a ~10x attention range. The problem is that the attention dial is welded to the rigor dial: today the only way to get SKETCH-level attention is to accept SKETCH-level rigor.

Out-of-band: `/sig:resume` adds 2 (orphan prompt — always-on per D12, `resume.md:104` — plus the "Ready to continue?" safety gate, which explicitly refuses to auto-invoke, `resume.md:197`). `/sig:escalate` adds 7–8, all unconditional by design.

### 3.2 Structural findings

1. **The autonomy switch already exists.** `gate_strictness: off` means "auto-advance" (`references/profile-schema.md:150`). At `off`, `commands/discuss.md:21` says: "present recommendations as a batch, accept all without confirmation." SKETCH ships with this today. Auto-advance is a first-class mode — currently only reachable by lowering rigor.

2. **Most FULL-tier ceremony is prose-only.** Verified in code: `applyRigorOverrides` (`tools/lib/profile.js`) expands `light` and `strict` to *identical* gate config except the single `gates.anti_rationalization` boolean. The "confirm at every step" expansion — the bulk of the 48-touchpoint count — exists only in command markdown, enforced by nothing programmatic.

3. **EXECUTE is already autonomous in all but one table row.** The wave-boundary confirm appears in one preamble row (`execute.md:25-27`) and nowhere else: not in the workflow body (§2 defines wave membership and per-task dispatch; no barrier, no confirmation step), not in `tools/lib/execute.js` (verified: `dispatchTaskWithState` is per-task; it reads `gate_strictness` only to decide whether a *state-write failure* halts; `wave` is recorded as metadata), not in `agents/executors/executor.md` (zero user-facing asks). EXECUTE is also the only phase whose Exit Criteria contain no "User approves" checkbox — its exits are all machine-checkable (commits, tests, build, no skipped tasks).

4. **Every gray-area question already contains its autonomous answer.** `references/question-patterns.md` mandates an explicit recommendation on every 3-options-plus-other question ("Hiding the recommendation is failing to use the model's signal"). The human's role at most preference gates is confirm-or-override a recommendation that was already computed. DISCUSS's `--auto` mode (`discuss.md:98`) already implements auto-adopt: select the recommendation for every gray area, log each pick, batch-approve once.

5. **Exception-based escalation already exists in one place.** VERIFY loops back to EXECUTE up to 3 times, then escalates to the human (`references/phase-gates.md:24-30`; the 3-options FAIL ask at `verify.md:108-125`). That is the loop-engineering pattern — bounded retry, then human — already shipped for one gate.

6. **Four gates are explicitly tier-independent by design** and need individual dispositions in any autonomy layer: the PLAN drain diff-preview (`plan.md:93`), the PLAN delete/merge confirm (`plan.md:95`), the resume orphan prompt (`resume.md:99-104`, per D12), and the SHIP retro pre-check ("No bypass," per D-E9-3, `ship.md:42`).

7. **SHIP has a hard floor that survives `off`:** the PR-creation confirm (`ship.md:21`) and the no-direct-to-main rule (`ship.md:104`, `D-M5E17-5`). This floor is the natural terminus for an autonomous run.

8. **The project's own record names the scarce resource.** `D-M5E17-3` deferred the inbox triage because it "requires sustained product judgment from Brett — the scarcest input, and the one least available right now." Loop engineering is the discipline of spending that input only where it is irreplaceable.

9. **The "what's next" primitive the loop driver needs was just hardened.** `describeNextAction` + `formatNextActionCopy` (B70, v0.1.17) compute the next action from STATE and now survive every phase value found across 12 real projects. `/sig:resume` is, functionally, one iteration of the loop minus the auto-invoke.

10. **Sweep already invented the halt protocol.** M5.E16's STATE-vs-world checks each declare whether they **need a person** or **clear themselves**, and reports distinguish **"checked and clean"** from **"could not check."** That classification, generalized to every gate, is exactly the autonomy triage an unattended loop requires.

### 3.3 Defects found during the audit

Four defects surfaced while mapping the gates. Three are the M5.E17 defect class (instructions that contradict other instructions); the fourth is a pre-existing gap that autonomy would promote from cosmetic to dangerous. **Each should become a `BUGS.md` entry** (filed via `/sig:add --bug`; see the ISSUES-INBOX capture pointing at this doc).

| # | Defect | Evidence | Why it matters for this work |
|---|---|---|---|
| LE-1 | `references/phase-gates.md:3` — "Every phase transition requires explicit approval. **No exceptions.**" — is contradicted by `gate_strictness: off` (= auto-advance, `profile-schema.md:150`) and every command's `off` preamble row. Nothing pins the two files (the pinning pattern exists for tier precedence: `tests/tier-precedence-consistency.test.js`). | phase-gates.md:3,10 vs. discuss.md:21, plan.md:29, execute.md:25, verify.md:24, review.md:29, ship.md:21; tier-definitions.md:141 (SKETCH = `off`) | phase-gates.md is the reference an autonomy design would amend; today it misstates the current system, in both directions. |
| LE-2 | Every phase's Exit Criteria carries an unconditional "User explicitly approves…" checkbox while the same file's §0 preamble makes that approval tier-conditional. Same gate, two statements, one ignores the profile. | discuss.md:156, plan.md:217, verify.md:104, review.md:162, ship.md:191 vs. each file's §0 table | An unattended mode needs one authoritative statement of when approval is required. |
| LE-3 | `light` and `strict` are identical in code except `gates.anti_rationalization` (verified in `tools/lib/profile.js`, `applyRigorOverrides`). "Confirm at every step" is enforced nowhere. Related: EXECUTE's wave-boundary confirm exists in one preamble row (`execute.md:25-27`) and in no body, tool, or agent. | profile.js switch on `gate_strictness`; execute.md/execute.js/executor.md as cited in §3.2.3 | The gap between documented and enforced gating is exactly where an autonomy layer would silently misbehave. |
| LE-4 | REVIEW's FAIL path has no user ask and **no loop ceiling** — a bare "return to EXECUTE" (`review.md:122`), unlike VERIFY's full 3-options ask with a 3-loop ceiling (`verify.md:108`, `phase-gates.md:24-30`). M5.E16 demonstrated a live REVIEW→EXECUTE loop-back in the field. | review.md:122,133; verify.md:106-125 | Attended, this asymmetry is tolerable. Unattended, it is an infinite-loop hazard. |

---

### 3.4 Signal audited against a standard parts list *(added 2026-08-22)*

An external course names six components every durable loop has, and the failure mode for each missing one. This document had no equivalent parts list. Signal, scored against it:

| Component | Signal's answer | State |
|---|---|---|
| **Trigger** — starts a cycle | A person types `/sig:drive` | **Human.** The trigger is not handed off; see §5.5. |
| **Work-finding** — what to do this cycle | `describeNextAction` (`B70`) | Built, but scoped **within** an Epic; nothing selects the Epic. |
| **Action** — the work, isolated | Phase commands; wave-parallel EXECUTE | Built. |
| **Verification** — decided by someone other than the maker | Verifier agents with read-only tools (`nyquist-auditor`'s `Write, Edit` is by design — it generates tests), and `agents/verifiers/verifier.md:52` returns a machine-readable `PASS \| FAIL` | Built. This is Signal's strongest component and it predates this analysis. |
| **Memory** — survives between cycles, on disk | `.planning/` in its entirety | Built, and unusually strong **to write** — but **nothing reads it forward at cycle start**. The one real gap in the table; see below. |
| **Stop condition** — ends the cycle and the run | `FLOORS` + `canProceedUnattended` + `tools/lib/loop-ceiling.js` | Two brakes of three; see §5.3. |

**The one real gap the list exposes is in Memory, and it is a read gap, not a write gap.** The course's point is that most state files record successes — which the code already shows — while the dead ends are what stop cycle four from repeating cycle two. Signal records dead ends richly and by habit: `BACKLOG.md` preserves dated "checked and declined" and "RE-PARKED" reasoning, `M5.E10` shipped required *"what this could not establish"* sections, and `references/retrospective-template.md:43` prompts for friction and dead ends explicitly. **Nothing in the loop reads any of it forward at cycle start.** `commands/drive.md`'s only retrospective reference is the Epic-close *floor* (`:29`); its opening reads are the profile, the decision queue, and `describeNextAction`. Attended, the operator supplies this from memory. Unattended, cycle four is free to repeat cycle two.

---

## 4. The design insight: rigor and attention are orthogonal

`gate_strictness` currently conflates two questions:

- **How hard are the machine checks?** (TDD, Nyquist, plan-validation dimensions, review depth…)
- **How often does a human have to be present?**

These are independent axes, and the most valuable quadrant is **FULL rigor + low attention**: every machine gate at maximum strictness, zero synchronous pauses, everything logged for batch audit. That quadrant is arguably *safer* for autonomy than SKETCH is — the machine guardrails are strongest exactly when nobody is watching. Today it is unreachable: lowering attention requires lowering rigor.

Loop engineering in Signal = splitting that knob, then rebuilding the human's three remaining roles (policy, exceptions, audit) as first-class artifacts.

---

## 5. Recommended build

### 5.1 Move 1 — the `attention` axis in PROFILE.md

*(`attention` is a proposed name — final naming is a DISCUSS decision.)*

Add a second calibration axis, orthogonal to tier:

```yaml
attention: attended | checkpointed | unattended
```

- **attended** — today's behavior, byte-identical. The default; existing profiles that lack the key read as `attended` (fail-open, additive — the M4.5.E11 pattern).
- **checkpointed** — each phase runs with zero mid-phase asks; the loop pauses at phase boundaries with a compact resume-style briefing. The trust-ramp middle rung.
- **unattended** — phase-to-phase without pausing; stops only at the SHIP floor (PR-open), on exceptions (see 5.3), and at the four tier-independent gates that survive (per their individual dispositions in 5.2).

**Where it lives / what changes:**
- `references/profile-schema.md` — new top-level field (or eleventh `rigor_overrides` key; top-level is cleaner since it is not a rigor setting — that's the whole point).
- `tools/lib/profile.js` — validation + an `applyAttention` expansion analogous to (and eventually replacing the ask-related half of) `applyRigorOverrides`. This is also the natural place to fix LE-3: make the expansion the *enforced* source of truth for asking, with command markdown reading it rather than restating it.
- `commands/*.md` §0 preamble tables — each phase's ask behavior keys off `attention`, while `gate_strictness` returns to governing only the anti-rationalization check depth (or is absorbed and deprecated — DISCUSS decision).
- **Per-Epic autonomy is free:** `readEffectiveProfile` already shadows the project profile with `.planning/{EpicID}-PROFILE.md`, so one Epic can run unattended inside an attended project with zero new machinery.
- `/sig:calibrate` asks one additional question (or takes a flag). Note: attention is a *choice*, not a derived property — it should not be computed from the 5 diagnostic answers. Stakes inform the *ramp* (see 5.5), not the axis.

### 5.2 Move 2 — convert each gate by what the human is actually doing there

The ~48 touchpoints sort into six roles. Five convert. **One does not** — and the sixth row was added after the fact (2026-08-08, see `analysis/AUTONOMY-COUNTERWEIGHT.md` §4.1); its absence from the original five is the defect that analysis found in this document.

| The human is… | Examples | Conversion |
|---|---|---|
| **An information source** | calibrate's 5 answers; DISCUSS gray areas; the NFR prompt | Front-load + default. Auto-adopt the (already mandatory) recommendation, tag the decision `provisional`, log to the decision queue for batch review. DISCUSS `--auto` is the existing prototype. |
| **A rubber stamp with veto** | PLAN's 7 step-confirms; VERIFY's 5; REVIEW's 5; SHIP's 10-item checklist; wave boundaries | Convert to **evidence records + machine checks**. Code-verified: these were never enforced anyway (LE-3). The human was contributing presence, not judgment. Each former confirm becomes a logged line in the phase artifact. |
| **A circuit breaker** | VERIFY's FAIL ask; escalation confirms | Keep, made async: take the recommended default when reversible, file the exception to the queue, continue other work. Generalize VERIFY's 3-loop ceiling to **every** loop-back (fixes LE-4 as a prerequisite). Add: same-failure-twice ⇒ escalate, don't retry. |
| **An irreversibility guard** | delete/merge confirms; drain diff-preview; retro pre-check halt | Where possible, **make the action reversible by mechanism and stop asking**: dispositions are already git-reversible; a documented revert lane converts these to logged evidence. The retro pre-check halt **stays** — it is a fail-closed quality gate, and the loop writing/fixing the retro itself is legitimate work, after which it re-invokes ship. |
| **The delivery authority** | "User approves PR for merge" | **Stays human.** The loop stops at PR-open (the floor `ship.md:21` already preserves at `off`). PRs accumulate; the human merges in batch. Throughput cost ≈ zero because the loop moves on to the next lane. |
| **Maintaining the mental model** | reading the diff of shipped work — the code, not a report about it | **Does not convert.** Survives every `attention` level, including `unattended`. This is the comprehension floor: the loop may remove the human from every *decision* in the middle and still must not remove them from *knowing what the system now does*. Enforcement mechanism **TBD** (not urgent, decided 2026-08-08) — the natural home is the merge gate, which is already the one structurally-human point, in the evidence-rendered shape `B88` established for the PR line (`ship.md:214`, *"filled from evidence, never ticked from memory"*). Until it exists, this row is a stated principle and nothing checks it — which is, by `UNREACHED-MECHANISM-ANALYSIS.md`'s own argument, exactly as durable as any other unenforced rule. |

**The decision queue.** *(Proposed artifact; name TBD — could extend `OPEN-QUESTIONS.md` rather than add a file.)* When the loop meets a decision it may not auto-adopt, it writes the full 3-options-plus-other content (options, trade-offs, recommendation, reversibility tag) to the queue, adopts the recommendation *only if* reversibility permits (marking it `provisional` in `DECISIONS.md` / `CONTEXT.md` Locked Decisions), and continues. The human processes the queue in one sitting; overriding a provisional decision triggers targeted rework, which the loop executes.

**The routing rule for auto-adopt vs. queue-and-block** already exists in two established pieces:
- **Altitude:** plumbing / tooling / test-mechanics decisions auto-resolve with sensible defaults; product / scope / positioning decisions queue. (This is the standing "gate at product altitude" working norm, made machine-readable.)
- **Reversibility:** reuse calibration's own vocabulary *per decision*: `trivial` / `moderate` → auto-adopt provisional; `painful` / `irreversible` → queue, and block only if downstream work depends on it.

**Take the inbox drain out of the loop entirely.** It is PLAN's densest gate cluster (up to ~46 touchpoints), it is already explicitly skippable ("never blocks planning," `plan.md:97`), and `D-M5E17-3` established it needs sustained product judgment. The unattended loop always skips drain; drain becomes a human-scheduled session.

### 5.3 Move 3 — the driver

*(Proposed command name `/sig:run` — naming is a DISCUSS decision.)*

The loop, per iteration:

1. Read STATE (+ effective profile). `describeNextAction` computes the next step — the B70-hardened primitive.
2. Invoke the next phase command under the `attention` mode.
3. On completion, iterate. On **exception**, file to the queue and either halt (single lane) or switch lanes (5.4).

**Halt conditions (fail-closed, all logged with the reason):**
- Any gate reports **could-not-check** (the B39 lesson: silence must never read as clean — a check that cannot evaluate halts rather than passes).
- Loop ceiling reached, or the same failure signature twice.
- A queued decision blocks downstream work (irreversible + depended-upon).
- The SHIP floor: PR opened → lane complete.
- Budget/iteration cap (a runaway backstop). **Two of the three brakes are built; the third is not.** An external loop-engineering course (assessed 2026-08-22) states the stop condition as three *independent* brakes, because they fail differently: the success condition, a turn/time cap for when the condition is unreachable, and a **cost ceiling**. Measured against the shipped driver: the condition is `FLOORS` + `canProceedUnattended` ✅; the turn cap is `tools/lib/loop-ceiling.js`, derived per-Epic from `completed_phases` and paid in `v0.1.32` ✅; **the cost ceiling does not exist** — `drive.js`, `loop-ceiling.js` and `drive.md` contain no budget, token or spend term. `BACKLOG.md` already records this cap as *"currently unsized."* An independent source arriving at cost-as-a-third-brake is the evidence that row was waiting for; it does not size it.

**Checkpointed mode** is the same driver pausing at each phase boundary, emitting the briefing `/sig:resume` already knows how to render. Notably, `resume.md:197` explicitly forbids auto-invoking the next phase — that is *correct* for resume (a briefing, not a launcher) and is exactly why the driver must be a separate command with an explicit opt-in, not a modified resume.

The driver can even live outside Signal initially (any scheduler or plain loop invoking the CLI); Signal's real deliverable is being **driveable** — which, after Moves 1–2, it is. But a first-class `/sig:run` keeps the halt conditions, logging, and queue handling inside the tested surface, which is where Signal's own history says they must live (rules that existed only as prose have failed twice: `B7`→`B58`, `B39`).

### 5.4 Move 4 — parallelism (sequenced last, deliberately)

Two tiers with very different costs:

- **Within EXECUTE: already done.** Waves parallelize independent tasks with fresh context per task. Nothing to build.
- **Across Epics: the one genuinely expensive build.** The artifact layer is already Epic-partitioned (`{EpicID}-*.md`), which is most of the isolation needed. The contention is `STATE.md` (a single `current_epic` field, singular by design), the shared running docs (`CONTEXT.md`, `DECISIONS.md`, `INDEX.md`), and the observed field reality that parallel sessions on one repo race.

**Design sketch:** one lane = git worktree + branch + Epic PROFILE + Epic-scoped artifacts + per-lane state. A serialized **merge queue** is the only cross-lane synchronization point: PR per Epic, green CI, then a post-merge reconcile (roll STATE, regenerate INDEX, append DECISIONS in merge order). Epics that touch the same files get sequenced at DISCUSS time; independent Epics parallelize cleanly.

**Sequencing recommendation: build this only after single-lane autonomy has proven itself.** A single unattended lane already converts ~48–86 interrupts into ~3, and the state-ownership redesign is a full Epic (or two) of its own. Parallelism multiplies throughput *and* multiplies unaudited output — it should wait until the audit loop (5.5) has demonstrated it catches what the human used to catch.

### 5.5 The trust ramp

Not a switch — a ratchet, earned per-Epic:

1. **attended** (today) → 2. **checkpointed** (phase-boundary pauses) → 3. **unattended** (PR-open terminus).

Promotion criterion: N consecutive Epics whose batch audits surfaced no decision the human would have made differently and no false gate claim. Demotion is automatic on either. High-stakes Epics (FULL escalators: `stakes: catastrophic`, `reversibility: irreversible`) cap at **checkpointed** until the track record justifies otherwise.

**A second axis the ramp does not cover** *(external course, 2026-08-22)*. The ramp measures **how much attention** a run costs. The course's ladder measures **which piece of judgment was handed off**, and the two are orthogonal: (1) hand off the check, (2) hand off the stop condition, (3) hand off the trigger, (4) hand off the prompt. Its rule — *do not climb past the point where you can still verify the output* — is `AUTONOMY-COUNTERWEIGHT.md`'s comprehension floor stated as a sequencing constraint rather than as a principle.

**Where Signal actually sits: the first two handoffs, not the third.** `/sig:drive` hands off the check (verifier agents, read-only, machine-readable verdict) and the stop condition (`FLOORS`, `loop-ceiling.js`). It does **not** hand off the trigger: a person types `/sig:drive`, and `describeNextAction` finds the next *phase* inside an Epic that `STATE.md` already names — `tools/lib/drive.js` contains zero references to `current_epic`. **Nothing in Signal picks what to work on.** By the course's own test (*"a loop that needs you to say what to work on has you as its trigger"*), Signal's work-finding component is scoped to a phase, not to a queue. This is a characterization, not a defect: handing off the trigger is where §5.4's warning bites (parallelism multiplies unaudited output), and no roadmap row currently states which handoff the plan is aiming at next.

*External vocabulary, deliberately not imported.* "Rung", "turn-based", "goal-based" and "proactive" are the course's labels, used here to locate Signal against an outside frame. `PROJECT.md` §Vocabulary is locked; none of these become Signal terms.

---

## 6. The hard gate, and the failure modes stated honestly

### 6.1 The hard gate

**PR merge stays human.** Merging to `main` is delivery (`D-M5E17-4`: users track `main`; there is no pinned ref). This is not a temporary caution — it is the correct permanent boundary *under the current delivery contract*. If a staging lane ever exists (release branch + promotion), the boundary could move there; that is a separate delivery-design decision, not part of this work.

### 6.2 Failure modes and countermeasures

**FM-1 — The claim-integrity problem is the central risk.** Every major recent catch in this project came from a human reading documents against each other: `B59` (the Epic that ran DISCUSS at the wrong tier), REVIEW check (c) reporting "clean" on a project it could not see, eval-project-C's five false coverage claims (`analysis/CLAIM-INTEGRITY-ANALYSIS.md`). In attended mode the human catches these incidentally; unattended, a false PASS compounds silently downstream. Countermeasures — all of which Signal has already invented and this work makes load-bearing:
- Claims **derived, checked, or labeled unverified — never asserted** (the existing doctrine, now enforced at gates).
- Every gate report distinguishes **checked-and-clean** from **could-not-check**, and could-not-check **halts** (M5.E16's sweep protocol, generalized).
- **Adversarial verification at gates:** verifier agents prompted with fresh context to *refute* the phase's claims, not confirm them. Signal's verifier/checker agents exist; the change is the adversarial stance.
- Honest statement: this **reduces** the risk, it does not eliminate it. The loop is therefore biased to halt on uncertainty, and the throughput case must survive that bias. (It does: most halts are cheap async questions, not stalls.)

**FM-2 — Oscillation.** M5.E16's REVIEW→EXECUTE loop-back fired its own drift detector; LE-4 shows REVIEW has no ceiling at all. Countermeasure: uniform loop ceilings everywhere, same-failure-twice ⇒ escalate. Prerequisite fix, not an optional hardening.

**FM-3 — The human bottleneck just moves.** 86 interrupts becoming one batch review is only a win if the batch is auditable in minutes: the decision queue with recommendations and provisional markers, the retro, **the diff** (not a diffstat — see the correction below), and a one-screen "what was auto-decided and why" summary. If the loop produces five Epics overnight and the audit takes five hours, autonomy delivered nothing.

> **Correction, 2026-08-08.** This paragraph originally listed *"a diffstat"* while §2 listed *"the decision log + **diff** + retro"* — the same document asking for the code in one place and a line-count summary of it in the other, with the weaker version sitting in the section that defines the success criteria. That is the `M5.E17` defect class (instructions contradicting instructions) inside a document about running with less supervision, and it is the disagreement that would have decided the floor: **a diffstat cannot maintain a mental model.** Both now read *diff*. The originating comparison is `analysis/AUTONOMY-COUNTERWEIGHT.md` §4.1.

**The success metric is not touchpoints removed, and it is not total attention minimized.** *(Revised 2026-08-08.)* It is:

- **Mid-flight attention → down.** Synchronous interrupts between phase start and PR-open. This is the number the whole design exists to reduce.
- **Input attention and diff attention → held or up.** Minutes spent on the Epic's inputs (outcome, architecture, program design) and on reading the shipped diff. These are the two positions where human time compounds instead of costing.
- **Defects caught late** (batch audit or post-merge) vs. caught by gates — unchanged, and now the check on whether the split above is real rather than declared.
- **Comprehension probe:** can the operator describe what a changed module does without asking the agent? A cheap, subjective, and *directional* signal — the one thing a lights-off factory loses first and notices last.

**Why the revision.** The original read *"minutes-of-attention per shipped Epic"*, minimized — a target that scores its best result on the exact behaviour that produced the July-2025 incident in `analysis/AUTONOMY-COUNTERWEIGHT.md` §1: a team that stopped reading code, kept reviewing plans and tickets, and lost the ability to diagnose its own system. Attention is not a cost to minimize; **it is a cost to relocate**, and one of its destinations is after the work, not before it.

**FM-4 — A wrong auto-decision compounds.** A bad provisional DISCUSS decision poisons PLAN and EXECUTE downstream. Countermeasure: the reversibility-weighted auto-adopt rule (5.2) — only cheaply-reversible decisions are ever taken without a human; and provisional decisions are first-class artifacts the audit walks, newest-first, before anything merges.

**FM-5 — Cost.** Unattended loops with `research_parallelism: 4` and adversarial verifiers burn real tokens. Secondary concern by *magnitude*; **shaped** by the iteration cap and by tier (the loop inherits the Epic's rigor profile, so a FEATURE Epic runs 2 researchers, not 4) — but **not bounded by them**, for the reason the amendment below gives. There is no spend ceiling.

> *Amended 2026-08-22.* "Secondary concern" is defensible for the *magnitude*; it is not a reason the brake is absent. An external source treats the cost ceiling as one of three **independent** brakes precisely because the other two do not catch its failure — an unreachable condition and a bounded turn count can both be satisfied while spend runs away. The ranking stands; the missing mechanism is now stated as missing (§5.3).

---

## 7. Phased build path

Sized in Signal's own units. Each phase is shippable alone and valuable alone.

### Phase A — split the knob, single lane, no driver *(the 80% win; mostly plumbing on existing machinery)*

1. **Fix the prerequisites:** LE-1 through LE-4 (reconcile phase-gates.md with `gate_strictness`; single authoritative approval statement per phase; make the ask-expansion code-enforced; give REVIEW the VERIFY loop ceiling + FAIL ask). These are fix-lane or one small Epic, and they are worth doing even if loop engineering never ships — they are documented-vs-enforced gaps today.
2. **`attention` axis:** schema + `tools/lib/profile.js` expansion + §0 preamble rewiring in the seven phase commands. Additive; absent key = `attended`; existing projects byte-identical (the M4.5.E11 back-compat pattern, provable the same way — golden fixtures + suite passing without fixture edits).
3. **Decision queue + provisional decisions:** extend DISCUSS `--auto` into the queue-writing shape; reversibility-tagged auto-adopt; batch-review rendering (likely in `/sig:status` or the SHIP report).
4. **Drain out of the loop:** unattended PLAN always skips §1b.
5. Exit criteria: a FEATURE-tier Epic runs DISCUSS→PR-open at `unattended` with ≤ 3 synchronous touchpoints, every auto-decision logged with its recommendation and reversibility tag, and the full suite green.

### Phase B — the driver + checkpointed mode

6. `/sig:run` (name TBD): the iteration loop, halt conditions, could-not-check discipline, iteration cap, queue integration. Checkpointed mode = same driver + phase-boundary briefings.
7. Adversarial verification stance at VERIFY/REVIEW gates (fresh-context refuters).
8. Exit criteria: a real Epic ships end-to-end under the driver in checkpointed mode; then one under unattended; batch audit artifacts judged sufficient by the human actually doing the audit.

### Phase C — parallel Epic lanes *(only after A+B have a track record)*

9. Per-lane state ownership design (the real work: `current_epic` plurality, CONTEXT/DECISIONS/INDEX write discipline, worktree lifecycle), merge queue, post-merge reconcile.
10. Exit criteria: two independent Epics run concurrently in worktrees, merge serially through the queue, and a post-merge sweep reports checked-and-clean on all state-vs-world checks.

**Dogfooding note:** Signal-on-Signal is the natural first test bed — but per the hard gate, its loop stops at PR-open, and per the trust ramp it starts checkpointed, not unattended. A low-stakes external project (one of the 12 in the field corpus) is the right first *unattended* candidate.

---

## 8. Success metrics

**The target is a split, not a single number** *(revised 2026-08-08 — the original read "minutes of human attention per shipped Epic (the real target)", minimized; see FM-3 for why that scores its best result on the failure mode this design is trying to avoid).*

- **Minutes of *mid-flight* attention per shipped Epic → down.** Synchronous interrupts between phase start and PR-open. Not touchpoint count — minutes.
- **Minutes at the inputs and at the diff → held or up.** Attention spent before the work (outcome, architecture, program design) and after it (reading the shipped diff, not a summary of it). A run that drops these has not become efficient; it has become blind.
- **Comprehension probe:** can the operator describe what a changed module does without asking the agent? Directional and subjective, and still the earliest available signal that the floor has eroded.
- **Defects caught late** (at batch audit or post-merge) vs. caught by gates — the claim-integrity health signal. Any false "checked and clean" is a P1 on the loop itself.
- **Queue latency tolerance:** how long the loop keeps productive (other lanes / other phases) while decisions sit unanswered.
- **Override rate at batch audit:** what fraction of provisional decisions the human reverses. High and rising ⇒ the recommendation engine or the altitude routing is miscalibrated; demote the ramp.

## 9. Open questions for DISCUSS (when this becomes an Epic)

1. Naming: `attention` vs. something else; `/sig:run` vs. something else; queue artifact = new file vs. extended `OPEN-QUESTIONS.md`.
2. Does `gate_strictness` survive as anti-rationalization-depth only, or is it absorbed and deprecated? (Schema/migration implications either way.)
3. Where does the batch-audit view live — `/sig:status`, the SHIP report, or its own read-only command?
4. Per-decision reversibility tagging: model-judged with the tag logged, or does the human pre-declare classes of decision as auto-adoptable in PROFILE.md body?
5. The delivery boundary long-term: is a staging/promotion lane ever worth it, or is PR-open-then-human-merge the permanent contract?
6. Does the driver live in Signal (`/sig:run`) from day one, or does Phase B start with an external driver against the Phase A surface to learn the halt conditions cheaply first?

---

*Companion docs: `analysis/CLAIM-INTEGRITY-ANALYSIS.md` (the defect class FM-1 rests on), `analysis/AGENT-EFFECTIVENESS-ALIGNMENT.md` (environment-readiness axis this would extend), `references/profile-schema.md` + `references/tier-definitions.md` (the machinery Move 1 modifies).*
