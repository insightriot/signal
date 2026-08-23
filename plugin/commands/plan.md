---
name: sig:plan
description: "PLAN phase — multi-agent research, plan creation with vertical slicing, 8-dimension validation, and Nyquist test-coverage mapping."
args: "<phase-number>"
---

# PLAN Phase

You are running the PLAN phase of the Signal workflow. Your goal: produce an executable plan that any agent can follow without further clarification.

## 0. Tier-gating preamble (run before anything else)

Read the **effective profile** before any other workflow step: `readEffectiveProfile(baseDir, { currentEpic })` (`tools/lib/profile.js`), where `currentEpic` is `current_epic` from STATE.md (via `readState`). In **Epic mode** (a strict `current_epic`) an Epic-scoped `.planning/{EpicID}-PROFILE.md` shadows the project PROFILE for this Epic's phases; in **linear mode** (null / absent / non-strict `current_epic`) it reads `.planning/PROFILE.md` unchanged — byte-identical to pre-E11. Fail-open on the STATE value: a hand-edited or garbage `current_epic` degrades to the project PROFILE, never throws.

- **If neither PROFILE.md is present:** `readEffectiveProfile` throws the same not-found error — halt with *"No PROFILE.md found at .planning/PROFILE.md. Run `/sig:calibrate` first to tier this project, then re-run `/sig:plan`."* Do not proceed.
- **If `PLAN` is in `phases_skipped`:** exit with *"This tier ({tier}) skips PLAN. Run `/sig:execute` next, or `/sig:escalate` if scope has grown and PLAN should run."* Do not proceed. (No v1 tier currently skips PLAN; this guard is defensive.)
- **Apply `rigor_overrides`** from PROFILE.md:

| Override | Effect on this phase |
|---|---|
| `research_parallelism: 0` | Skip Step 2 (Research) entirely. |
| `research_parallelism: 2` | Spawn 2 research agents instead of 4 (pick the most relevant — usually domain + codebase). |
| `research_parallelism: 4` | Full 4-agent research (domain, codebase, risk, prior art). |
| `plan_validation_dims: none` | Skip Step 4 (Plan Validation) entirely. |
| `plan_validation_dims: core` | Run only 3 dimensions: goal alignment, completeness, testability. |
| `plan_validation_dims: all` | Run all 8 dimensions. |
| `nyquist_enforcement: off` | Skip Step 5 (Nyquist mapping). |
| `nyquist_enforcement: basic` or `strict` | Run Step 5. (Strictness — proof-of-fail-before-pass — is enforced in VERIFY, not here.) |
| `attention: unattended` | Auto-advance — through plan approval; no user confirmation required. |
| `attention: checkpointed` | Confirm at the end of the phase (the default). |
| `attention: attended` | Confirm at every step inside the phase (`gates.confirm_in_phase`), plus at the end. |
| `gate_strictness: strict` | Runs the anti-rationalization check at the gate. **That is all `gate_strictness` does to gates** (`v0.1.31`) — it no longer sets confirm cadence. |

Tooling: `tools/lib/profile.js` exposes `readProfile`, `readEffectiveProfile`, `isPhaseEnabled`, `applyRigorOverrides`. Schema reference: `references/profile-schema.md`. Question convention: `references/question-patterns.md`.

## Skill Loading

Load these skills (paths shown — bound to PLAN regardless of which directory the SKILL.md file lives in):
- `${CLAUDE_PLUGIN_ROOT}/skills/plan/planning-and-task-breakdown/SKILL.md`
- `${CLAUDE_PLUGIN_ROOT}/skills/build/api-and-interface-design/SKILL.md` (cross-bound: lives in `build/`, used in PLAN for designing contracts before code is written)
- `${CLAUDE_PLUGIN_ROOT}/skills/ship/deprecation-and-migration/SKILL.md` (cross-bound: lives in `ship/`, used in PLAN for deprecation planning at design time; also loaded in SHIP for cleanup)

## Phase entry — record the phase (M5.E9 FR6, `B41`)

**Call this only if every precondition above passed.** The tier gate must have let this command through, and any halt condition in it must not have fired. If this command is halting — wrong tier, a missing prerequisite artifact, a failed gate — **do not call `transitionPhase`**: return the halt instead.

**Then, before any Workflow step**, call `await transitionPhase(baseDir, 'PLAN')` (`tools/lib/state.js`). It appends the phase being **left** to `completed_phases` and sets `phase: PLAN`.

**Why the condition (M5.E13, `B48`).** This instruction used to be unconditional, and an agent running `/sig:execute` against a project with no PLAN artifact **correctly refused it** — obeying would have recorded `phase: EXECUTE` for a project with nothing to execute, writing a false entry into the ledger M5.E9 had just made honest. Obeying corrupted the record; disobeying reproduced `B41`. The instruction was the thing that was wrong. `transitionPhase` now also refuses to record a phase that produced no artifact, so the text and the code agree rather than one relying on the other.

**Why this exists.** Until M5.E9 only `calibrate` / `discuss` / `ship` ever called `transitionPhase`. `plan`, `execute`, `verify` and `review` advanced nothing — so a command-driven project finished a full build with `completed_phases: [DISCUSS]`, `phase: SHIP`, and **PLAN / EXECUTE / VERIFY / REVIEW never recorded at all**, while `/sig:status` and `/sig:resume` reported `DISCUSS` for the entire run. `markFresh` then stamped a fresh timestamp over that stale position, turning *stale-and-flagged* into *stale-and-silent*. It survived eleven releases because Signal's own repo maintained these fields **by hand**.

**At entry, not exit** — the position must be true *while* the phase runs, which is what any "current phase is PLAN" precondition depends on. Surface the returned `{quarantined}` list if non-empty: malformed ledger entries are relocated, never silently dropped.

## Workflow

**Artifact naming (M4.5.E11).** Name each artifact this phase writes with `artifactName(ARTIFACT, { currentEpic })` (`tools/lib/resume.js`), and resolve ones it reads with `resolveArtifactPath(planningDir, ARTIFACT, { currentEpic, phase })` — `currentEpic` is `current_epic` from STATE. **Epic mode** → `{EpicID}-{ARTIFACT}.md` (e.g. `M4.5.E11-PLAN.md`); **linear mode** → the `{phase}-{ARTIFACT}.md` forms below, byte-identical to pre-E11. Substitute the `artifactName` result wherever this file writes a literal `.planning/{phase}-*.md` path.

### 1. Load Context

Read from `.planning/`:
- `PROJECT.md`, `PROFILE.md`, `CONTEXT.md`, `REQUIREMENTS.md`
- `STATE.md` — current phase is `PLAN`, set by the phase-entry step above. *(Until M5.E9 this line read "verify current phase is PLAN" — a precondition **no command could ever satisfy**, since nothing advanced `phase` between DISCUSS and SHIP. `B41`'s symptom was written into the instructions as an unsatisfiable check.)*

### 1b. Drain the inbox (required — classify + promote captured ideas into this plan)

`/sig:add` captures ideas to the inbox (`ISSUES-INBOX.md`, back-compat `FUTURE-IDEAS.md`) between planning passes; PLAN is where they get dispositioned, so captures don't rot in a write-only file.

**This step is required. The escape is bounded, not open** (`B89`): you never have to *think about* the entries, but the inbox must always advance. If you don't want to triage now, take **"defer all remaining"** — one action, one batch write, every non-recovered entry stamped `→ Deferred`. What is no longer available is walking away leaving the entries unstamped.

> **Why this changed.** This step used to read — **[RETIRED v0.1.24, no longer in force]** *"advisory and fully skippable — skip the whole step and planning proceeds unchanged"* **[/RETIRED]** — while the Anti-Rationalization table in **this same file** answered *"The plan's decided — skip the FUTURE-IDEAS drain"* with *"**No.** … Skip it and captures rot in a write-only file."* Both were live. An agent that skipped was simultaneously obeying Step 1b and committing the exact rationalization the table forbids, and **neither instruction was wrong on its own terms** — which is why nothing caught it. That is `M5.E17`'s class (instructions contradicting instructions), but **inside one file**, where the cross-document tests M5.E17 shipped do not look.
>
> **It was live and had already fired:** during `M5.E19` PLAN on 2026-08-07 the drain was skipped citing this step's permission, with **52 candidates** in the inbox, the oldest dating to 2026-05 — the precise outcome the table exists to prevent. Visible only because the skip was declared out loud.
>
> **Resolved toward required rather than toward optional**, because the consequence is not symmetric. The drain is Signal's **only** culling mechanism for `/sig:add` captures and it runs **only here**, so a permission to skip is a permission for the inbox to grow without bound. `evictTerminalToLedger` makes the inbox *converge* once entries are dispositioned — nothing makes them get dispositioned. Deferring all is one keystroke; an unbounded inbox is a file people stop reading, which silently converts `/sig:add` into a place ideas go to die.

Load candidates with `listDrainCandidatesWithRecovery(content)` from `tools/lib/drain.js`. It reads the inbox resolved by `resolveInboxPath(baseDir)` (`ISSUES-INBOX.md` if present, else the legacy `FUTURE-IDEAS.md`) and returns `{candidates, danglingFence, recoveredCount}`: `candidates` is every top-level `## ` entry that is **not** already dispositioned (no date window, so the first run surfaces the whole standing backlog by design), plus any entries a **dangling (unclosed) code fence** had swallowed. If `danglingFence` is true, **announce** it before listing candidates — e.g. `⚠ the inbox has an unclosed code fence; recovered {recoveredCount} otherwise-hidden entr(y/ies). Fix the fence when convenient.` — so a malformed fenced sample can't silently drop captured ideas. (`listDrainCandidates` remains the bare-return primitive for callers that don't need the recovery signal.)

**Recovered entries are read-only-visible, NOT dispositionable.** A candidate carrying `recovered: true` was resurfaced from below the dangling fence; it has a valid `range` but **no `entryIndex` in `parseEntries(content)`** (the fence swallowed it), so `applyDisposition`/`applyDispositions` cannot target it. **List recovered entries for awareness but do NOT offer promote/defer/merge/delete on them, and exclude them from the "defer all remaining" batch.** The only correct action is: fix the unclosed fence, then re-run the drain — they become normal, dispositionable entries. Disposition acts only on the non-`recovered` candidates.

- **No candidates** → emit the one-line note `(no inbox candidates to drain)` and continue to Step 2.

**Report standing entries separately, every time (M6.E4 FR2.2).** Call `listStandingEntries(content)`
from `tools/lib/drain.js` and state the count alongside the candidates — e.g.
`(no inbox candidates to drain; 1 standing entry not counted)`. A **standing** entry carries a
`<!-- standing -->` marker in its header region and is deliberately permanent — the trigger
watchlist below is the canonical one, marked *"never promote, merge, or delete."*

**Do not offer it a disposition verb.** Every one is wrong: `promote`, `merge` and `delete` are
forbidden by the entry itself, `defer` postpones something permanent, and `shipped` is nonsense.
Before the marker existed the only lawful action was `skip`, and `skip` returned it to the next
drain forever — so this repo's live count was **pinned at ≥ 1** and the no-candidates branch above
**could never execute**. Reporting the count is what keeps a deliberately-permanent entry
distinguishable from an unanswered one (`B39`'s shape) without it being counted as work.
- **Candidates present** → render them **compactly** — heading + the one-line Status, numbered (recovered entries flagged and un-numbered / not selectable). **Always offer "defer all remaining" up front**, not only on a large first run (a single `applyDispositions` batch over the **non-recovered** candidates only). It is the bounded escape this step's requirement depends on, so it has to be present every time the step runs — an escape that appears only above some unstated size threshold is not one a user can rely on, and this step may no longer be skipped.

For each entry the user keeps triaging, offer a `strict-enum [promote, defer, shipped, merge, delete]` choice plus an explicit **skip** (leave the entry untouched and move on):

| Verb | Effect |
|---|---|
| **promote** | Fold the idea into this plan as a candidate task (feeds Step 3) **and** classify + route it to a home (see **Classify + promote** below). Stamps the entry's Status inline — `→ Promoted {date} ({Epic} drain).` — so the entry stays in the inbox, marked done (terminal → evicted on the next sweep), and never resurfaces on a later drain. |
| **defer** | Leave it for a later pass. Stamps `→ Deferred {date} ({Epic} drain).`. |
| **shipped** | **The work described here is already done.** Stamps `→ Shipped {date} ({Epic} drain).`; the block **stays**, because the capture usually holds the reasoning behind the shipped work. Terminal, so it is eligible to leave for the archive ledger later. |
| **merge** | The idea folds into another entry; the source block is **removed**. |
| **delete** | Drop the idea entirely; the block is **removed**. |
| **skip** | No change; the entry stays a candidate for the next drain. |

> **Do not offer `defer` for work that is already finished, and do not reach for `delete` to get it out of the way.** `defer` postpones a completed thing, which is nonsense, and `delete` destroys the record of *why* the thing exists in a repo whose standing rule is relocate-never-delete. `shipped` is the honest verb, and it was added on 2026-08-09 because the drain had no way to say it — the readers had understood `SHIPPED` since M5.E1 while the writer's verb set stopped at four, so completed captures were being mislabelled or destroyed. A verb set that cannot describe the situation is how 52 captures accumulated 5 stamps.

**Classify + promote (FR2).** A `promote` is a two-part move — pick a *destination* (and, for work, a *tag*), then physically route the idea:

- **Classify** with a `strict-enum [work, bug]`: real work (a feature, refactor, or roadmap item) → `.planning/BACKLOG.md`; a confirmed or suspected defect → `.planning/BUGS.md`.
- **Tag** (work only) with a `strict-enum [roadmap, hygiene]` — roadmap-vs-hygiene is a Tag on the BACKLOG entry, not a separate file.
- **Retitle** — offer a cleaned one-line title; the item lands under that title (the source heading is groomed away). A blank keeps the source heading.

Run the route via `promoteDrainEntry(baseDir, { classification, block, tag, title, entryIndex, reason: '{Epic} drain', date })` from `tools/lib/drain.js`, where `block` is the source entry's raw block (`content.slice(range.start, range.end)`). It writes the **destination first** (`promoteToBacklog` / `promoteToBugs`, each sha1(block)-dedupe-guarded), **then** stamps the inbox entry `→ Promoted` (terminal) via `applyDispositionToFile`. Destination-first + sha1 dedupe is the crash-safe ordering: a crash before the stamp re-runs clean (the destination no-ops on the duplicate key), and the promoted item ends up double-homed — groomed in `BACKLOG`/`BUGS` and archived verbatim in the ledger — before the eviction step removes it from the inbox.

**R1 — HARD GATE: preview the diff before any disposition write.** A drain write mutates the project's idea database, so — unlike `/sig:add`'s instant-capture hot path — every write is **previewed first**. Compute the proposed content with `applyDisposition` (or `applyDispositions` for the batch), show the user a diff of exactly what will change, and write **only after they accept**. Never persist a disposition the user hasn't seen. The write itself goes through `applyDispositionToFile` (one full-file `atomicWrite` per disposition, reusing the `/sig:add` substrate).

**delete / merge confirm (R5 sub-gate).** Because they remove text, `delete` and `merge` require a per-entry `strict-enum [confirm, keep]` confirmation **regardless of `gate_strictness`** — `keep` leaves the file byte-for-byte unchanged. The removal reason is recorded in the eventual commit message, not in the file.

**promote** entries flow into Step 3 (Create Plan) as candidate tasks. This step never blocks planning: skip it, batch-defer it, or triage entry-by-entry — all three leave you ready for Step 2.

#### Walk the trigger watchlist (M5.E13 FR2.1, `B39`)

The inbox carries a **standing entry** — *"Trigger watchlist … (check conditions at every drain)"*, marked *never promote, merge, or delete* — whose parked items each hold a promote-back condition. Call `parseTriggerWatchlist(content)` (`tools/lib/drain.js`) on the same inbox content loaded above. It returns `null` when the project has no watchlist (skip silently), else `{rows, unevaluated, decided, dated}`.

**Surface all three groups, then decide each `unevaluated` row — promote it, or re-park it with a new written condition and a date.** Leaving a row at `—` is the bug this exists to fix.

- **`dated`** — conditions carrying an explicit date. Report these **first**: they expire whether or not anyone looks. If a date has passed and the condition was not met, mark it **expired-clean** rather than leaving it pending forever.
- **`unevaluated`** — verdict cell still `—` / blank. Nobody has looked.
- **`decided`** — already carries a verdict. Show the count only; a *checked-and-declined* row must stay visibly distinct from an unchecked one, which is `B39`'s second half.

**Why this step exists.** The standing entry instructed this walk since 2026-07-04 and **no command implemented it** — an instruction in a document that nothing executes. When it was finally run by hand at M5.E13 PLAN, **all 11 rows read `—`**, and at least two had fired: *GitHub Issues adoption* (its condition, "first live external tester", was met 2026-07-15) and the *BR-9 second dogfood project*, whose condition reads *"escalate if not started by the time M5 PLAN runs"* — M5 PLAN had run repeatedly. Neither was noticed for weeks. This is the drain's answer to a guard that existed only as prose.

**Physically evict terminal entries (FR3).** promote / ship / merge / delete are *terminal* dispositions — once stamped, the entry is done and should physically leave the inbox so the inbox converges instead of only growing (**DEFERRED is parked-but-live and stays**). After the disposition pass, call `evictTerminalToLedger(baseDir, { dryRun: true })` from `tools/lib/drain.js` to **preview** which terminal entries would move to the archive ledger (`ISSUES-INBOX-LEDGER.md`, back-compat `FUTURE-IDEAS-LEDGER.md`, resolved by `resolveLedgerPath`) — a dry run leaves the inbox byte-identical; then, on confirm (honoring `gate_strictness`), call `evictTerminalToLedger(baseDir)` for real. It appends to the ledger **first**, then removes the blocks from the inbox — crash-safe and keyed, so a re-run never dupes or loses. If it reports `danglingFence: true` it performed a **scoped no-op** (never cutting across an unclosed fence); report that and leave the file for the fence to be fixed.

### 2. Research (Parallel Agents)

Spawn up to 4 research agents in parallel:
- **Domain researcher** — external docs, libraries, APIs relevant to this phase
- **Codebase researcher** — existing patterns, reusable code, integration points
- **Risk researcher** — what could go wrong, edge cases, known pitfalls
- **Prior art researcher** — how similar problems have been solved

Synthesize research into the RESEARCH artifact (`artifactName('RESEARCH', { currentEpic })` — `{phase}-RESEARCH.md` linear / `{EpicID}-RESEARCH.md` Epic).

### 3. Create Plan

Generate the PLAN artifact (`artifactName('PLAN', { currentEpic })` — `{phase}-PLAN.md` linear / `{EpicID}-PLAN.md` Epic) with:
- Phase goal (one sentence)
- Tasks broken into vertical slices (each slice is independently shippable)
- Dependencies between tasks
- Acceptance criteria per task
- Test strategy per task (TDD where applicable)
- Estimated complexity (S/M/L — not time)
- **Files likely touched** per task — reconciles this list with
  `skills/plan/planning-and-task-breakdown/SKILL.md`, which has carried the field all along while
  this list, the authoritative one, omitted it (M6.E4 FR3.2)
- **Out of scope** per task — what this task explicitly does *not* do. The executor's rule that
  *"every changed line traces to the acceptance criteria"* was a discipline with no named boundary
  to point at; this is the boundary
- **An exemplar reference** where `{phase}-RESEARCH.md` found one — a pointer to the section, not
  the document (M6.E4 FR3.1)

⚠ **These four are ADVISORY, not fatal** (`D-M6E4-7`). A plan lacking them is **reported**, never
failed. Every plan already on disk across the corpus predates them and was correct when written;
failing them retroactively would be a guard punishing authors for not having read the future.

#### Name what this Epic does for the first time — and schedule it in the FIRST WAVE (M5.E17 FR1)

Before finalising the wave order, add a short section to the PLAN that **names the thing this Epic will do for the first time.** Not the thing it *builds* — the thing it **runs**. Three kinds count:

- **A tool used for its real purpose** rather than to prove itself.
- **A document executed** rather than read — an instruction nothing has ever actually followed.
- **A code path taken by a project shape not previously tried** — a different tier, a linear-mode project, a first outside contact.

**Then put it in wave 1.** Not "early", not "consider it" — the first wave, ahead of the work that looks more important. If nothing in the Epic qualifies, say so explicitly; "nothing is new here" is a result, and it is usually wrong on inspection.

**Why this is an instruction and not advice.** *"Shipped but never run"* is the best defect predictor Signal has, and until v0.1.15 nothing scheduled the running. Every significant find of the last three Epics came from a **first execution**, and every one arrived late: `B54` (the first read of that file — a guard that was wrong if wired up, protected from discovery by being uncalled), `B39` (the first walk of a watchlist that had instructed the walk since 2026-07-04 — 11 rows, all unevaluated, **two already fired**), `B42`/`B53` (first contact with a non-Epic project), `B48` (the first read of a transcript), and `B55` — M5.E13's **largest** finding, which surfaced on that Epic's **very last task**, because that is when the adherence harness was first used for its real purpose. Had `B55` landed in wave 1, the requirement it contradicts would have been recognised as in tension with the measurement *before* it was built.

**Worked example — M5.E17's own PLAN, which is the first Epic to run this step:**

> **What this Epic does for the first time:** the drain's write path has never run at scale.
> `applyDispositions` and `evictTerminalToLedger` have only ever executed over a handful of
> entries; FR4 puts **48** through them in one pass. Second first: routing an entry *into* the
> trigger watchlist is a path that has **never been executed at all**.
> **Therefore S1 is wave 1** — the mechanical pass and the *dry runs* of both write paths, before
> any real mutation. If the bulk path is broken, it breaks against a dry run rather than against 48
> captured ideas.

Note what the example is **not**: it does not name the new instruction M5.E17 was writing. A newly-authored thing has no history to be wrong about — the risk lives in the machinery that already exists, was built for a purpose, and has **never been run for that purpose**. That is the distinction the instruction turns on.

### 4. Plan Validation (8 Dimensions)

Validate the plan against:
1. **Goal alignment** — does every task serve the phase goal?
2. **Completeness** — are all requirements covered?
3. **Dependency correctness** — are dependencies accurate and minimal?
4. **Testability** — can every task be verified?
5. **Scope discipline** — no gold-plating or scope creep?
6. **Context feasibility** — can each task fit in a single agent context?
7. **Risk coverage** — are identified risks mitigated?
8. **Vertical slicing** — is each task a full slice, not a horizontal layer?

### 5. Nyquist Test-Coverage Mapping

For each task, map the acceptance criteria to specific test types:
- Unit tests for logic
- Integration tests for boundaries
- E2E tests for user flows

Write to the VALIDATION artifact (`artifactName('VALIDATION', { currentEpic })` — `{phase}-VALIDATION.md` linear / `{EpicID}-VALIDATION.md` Epic).

### 6. Environment check (final gate before EXECUTE)

PLAN's research happens against assumed runtimes (e.g., "Node 22 + better-sqlite3 v11 prebuilts"). EXECUTE happens against the actual dev machine. Drift between the two — different Node major, missing prebuilt binary, OS-specific compiler toolchain — is a common, expected friction that's cheaper to surface here than at first `npm install`.

For each runtime / native dep / external service identified during research:

- [ ] Note the assumed runtime version in `{phase}-PLAN.md` (e.g., "Node 22+ assumed; tested on Node 22.x").
- [ ] If the project has a package manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, etc.), do a dry-run of the install (`npm install --dry-run`, `cargo check`, etc.) to confirm dependency resolution works on the dev runtime.
- [ ] If a native module is involved, confirm a prebuilt binary exists for the dev runtime — or budget time for source-build dependencies (Xcode CLT, build-essential, etc.) in EXECUTE Slice 1.
- [ ] If research named specific package versions, confirm they are still on the registry and not yanked.

Document any drift discovered (e.g., "research assumed `better-sqlite3@11`; dev machine on Node 25 needs `@12+`") in `{phase}-RESEARCH.md` as an addendum, then either update the plan or budget Slice 1 to handle the version bump.

This step is intentionally lightweight at FEATURE/SKETCH (`research_parallelism: 0–2`); it's primarily a guard against silent assumption drift at FULL where 4-agent research can produce confident-but-stale environment claims.

### 7. Mark STATE.md fresh (M4.5.E10.S1.t5, FR3)

**SKETCH tier:** skip this step. STATE.md updates only via manual `/sig:checkpoint`.

**FEATURE/SPIKE/FULL:** after the PLAN artifacts (`{phase}-PLAN.md` / `{phase}-RESEARCH.md` / `{phase}-VALIDATION.md`) are committed, call `markFresh(baseDir, {commit: <git HEAD>})` from `tools/lib/state.js`. This advances `last_updated` + `last_updated_commit` to the phase-close commit so the staleness banner in `/sig:resume` reads fresh after PLAN. Run it **after** the commit — passing a pre-commit HEAD records a stale sha and silently defeats the freshness check (AC3.4).

Wrap the call in a **catch-all**: if `markFresh` throws for *any* reason — `StateSchemaError` on a schema-mismatched STATE.md, `StateWriteError` on lock contention, git unavailable — warn and continue. The plan is written and committed; a state-write blip is a recovery item, not a PLAN failure. (Mirrors verify/review/ship; a bare git/lock guard is not enough — `markFresh` can throw `StateSchemaError` too.)

## Phase Gate

### Anti-Rationalization Check
| Temptation | Check |
|---|---|
| "The plan is in my head, I don't need to write it down" | File-based plans are what make agents durable across sessions |
| "This task is too small to need acceptance criteria" | If it doesn't have criteria, how will you know it's done? |
| "We can figure out the test strategy during execution" | TDD requires knowing what to test before writing code |
| "Vertical slicing is overkill for this" | Horizontal slicing creates integration debt |
| "The plan's decided — skip the inbox drain" | No, and Step 1b no longer offers it. `ISSUES-INBOX.md` (back-compat `FUTURE-IDEAS.md`) is `/sig:add`'s default destination; the PLAN drain (Step 1b) IS the promotion step, and it is the only one. Skip it and captures rot in a write-only file. **The legitimate move is "defer all remaining"** — one action, every entry stamped, the inbox still advances. Not triaging is fine; leaving the entries unstamped is not. |

### Exit Criteria
- [ ] `{phase}-PLAN.md` exists with vertical slices and acceptance criteria
- [ ] `{phase}-RESEARCH.md` captures relevant findings
- [ ] `{phase}-VALIDATION.md` maps tests to requirements
- [ ] Plan passes 8-dimension validation
- [ ] User explicitly approves the plan — **when `gates.confirm_plan` is set** (`attention` ≠ `unattended`). Unattended: no ask; the transition is recorded, not approved (`B74`).
