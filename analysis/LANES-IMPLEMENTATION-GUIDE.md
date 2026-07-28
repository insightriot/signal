# Lanes — Multi-Lane Mode for Signal
## Proposed Implementation Guide

**Status:** Proposal — intended as DISCUSS input for a new Epic in the **signal** repo
**Date:** 2026-07-28
**Origin:** Concurrency assessment of nextpass × signal (2026-07-28). Absorbs and extends the existing BACKLOG item *"EXECUTE dispatch guidance + worktree isolation"* (demand cluster F, rank 1 — 4 retro items, live incident during M5.E7).
**Suggested entry path:** `/sig:add` this document's summary to the inbox, then open a DISCUSS with this file as the pre-read. Calibration recommendation for the Epic itself: **FULL** — this changes the harness's own state machine, and a defect here corrupts every project Signal manages.

---

## Plain-language summary (read this first)

**The constraint today:** not coding speed — bookkeeping. Signal keeps one clipboard per project: one `phase`, one `current_epic`, one STATE file, one lock. Work that *could* happen side by side lines up single-file behind that clipboard.

**What this feature really is:** teach Signal to be a general contractor instead of a solo project manager. Several crews (agent sessions) work at once, each on a fenced job site (git worktree) with a written work order listing exactly which files are theirs (the lane brief). Anything shared stays with the front office (the hub). Finished work re-enters through one gate, one truck at a time (serial landing). Conflicts are prevented by drawing fences *before* work starts — not by hoping crews are careful.

**The constraint afterward:** the human at the gate. Review, merge decisions, and planning stay serial through one person. That is the *intended* next bottleneck — it is where judgment belongs — and the tier system (§8) exists to spend that attention only where blast radius demands it.

---

## 1 · Problem statement

Signal parallelizes **tasks within a slice** (wave-based EXECUTE, fresh executor per task) but serializes **slices themselves**. For a solo operator with a well-groomed, surface-disjoint backlog — nextpass's is the live example — this is the binding constraint on calendar throughput. The evidence, all from Signal's own repo:

1. **The state model is single-flight by construction.** `STATE.md` frontmatter carries one `phase`, one `current_epic`, one `current_wave`, one `completed_phases` ledger. There is no representation for "two slices in different phases at once."
2. **Concurrency safety stops at the session boundary.** `.state.lock` protects parallel wave-executors *within* a session. The doc-runtime RMW paths (`checkpoint.js`, `drain.js`, `retro-index.js`, `planning-index.js`) are torn-write-safe but deliberately not cross-session-safe — the BACKLOG entry closing that item states the rationale: it "only defends concurrent cross-session writes on one repo, **a mode Signal discourages**."
3. **Demand is already recorded.** *"EXECUTE dispatch guidance + worktree isolation"* sits at rank 1 of demand cluster F, with a live incident during M5.E7. That item hardens *task-level* concurrency; this proposal is its slice-level generalization.
4. **The consumer project proves the cost.** nextpass's pre-pilot backlog partitions into 4–6 file-disjoint surfaces (debrief, session-integrity, voice, onboarding, ops, content), yet the Signal workflow admits exactly one at a time. The queue, not the coding, is the schedule.

**Non-problems, for scope discipline:** this is not about multi-human teams, not about multi-machine sync (the existing pushed-work check covers that), and not about parallelizing DISCUSS/PLAN — planning is cheap and *benefits* from serialization (it is where shared docs get written).

---

## 2 · Solution hypothesis

> **If** Signal adds a *lane* layer — worktree-isolated, manifest-fenced execution of an already-planned slice, dispatched from a hub that retains exclusive ownership of all shared state, with serial reintegration through a mechanical gate —
> **then** a solo operator can run 3–4 slices concurrently with **zero merge-time collisions and zero cross-lane regressions**, at no loss of Signal's phase-discipline guarantees,
> **because** every file in the repo has exactly one writing context at any moment, and the fences are enforced by deterministic tooling rather than by instruction.

**Design axioms (each traces to a Signal finding):**

| Axiom | Traces to |
| --- | --- |
| One file, one writer — always | The RMW lost-update analysis; `.state.lock` scope |
| Plan centrally, execute peripherally, integrate serially | GSD's own orchestrator/executor split, widened one level |
| Enforce mechanically, not by instruction | M5.E8: only **91/407 (22.4%)** of command directives are trace-measurable; B48 showed even a *correct* agent may refuse an instruction |
| Every guard must have a caller | The three-instance defect class: B39 (watchlist never walked), B46 (dispositions nothing reads), M5.E8-I2 (a `--check` nothing invoked) |
| Rigor is a dial, per lane | `/sig:calibrate`'s founding idea, recursed into the project |

**Falsifiers** (pre-committed, per Signal norm): the hypothesis fails if, across the first 4 dogfooded lanes on nextpass, (a) any land produces a merge conflict or a regression traced to cross-lane interaction, or (b) wall-clock slice throughput does not improve because lanes queue idle at the hub. Either outcome is a finding, not a tuning opportunity.

---

## 3 · Design at a glance

```
                HUB  (main checkout — Signal's existing home)
                │  owns: STATE.md · BACKLOG · BUGS · INBOX · INDEX
                │        migrations/serial resources · external ops state
                │  runs:  DISCUSS · PLAN · /sig:dispatch · /sig:land
                │
   dispatch ────┼──────────────┬──────────────┐        (brief committed to
   (fences      ▼              ▼              ▼         main BEFORE branch)
   drawn)   ┌────────┐    ┌────────┐    ┌────────┐
            │ LANE A │    │ LANE B │    │ LANE C │   each: worktree + branch
            │ slice X│    │ slice Y│    │ slice Z│   writes ONLY manifest paths
            └───┬────┘    └───┬────┘    └───┬────┘   + its own lanes/<id>/ files
                │              │              │
   land ────────┴──────────────┴──────────────┘
   (serial: rebase → manifest-diff check → tests/CI → merge → drain notes)
```

A **lane** is *not* a new phase and *not* a fork of the workflow. It is a container that runs the existing EXECUTE machinery (waves, executors, commits-per-task) against one slice, in isolation, under a contract. DISCUSS and PLAN for that slice already happened in the hub; VERIFY/REVIEW placement is tier-dependent (§8). The hub's `phase` field stops describing "the project" and starts describing "the hub's own current activity" — lanes carry their own phase pointer in their lane file.

---

## 4 · Vocabulary (locked-terms addition to PROJECT.md)

- **Lane** — a worktree-isolated execution context for exactly one PLAN-complete slice, created by `/sig:dispatch`, destroyed by `/sig:land` (or `/sig:land --abort`). Lane ID = `LANE-<SLICE-ID>`; ID-is-identity applies (a re-dispatched slice gets a suffixed ID, never a reused one).
- **Manifest** — the lane's write-permission set: an explicit list of path globs. Everything outside it is read-only to the lane.
- **Serialized resources** — paths no lane may ever own (they queue through the hub): migration directories, dependency manifests, shared shell/config files, `.planning/**` except the lane's own shard.
- **Landing** — serial reintegration of a lane into main under `.landing.lock`.
- **Blast-radius tier** — per-lane autonomy grade (GREEN / YELLOW / RED), orthogonal to the project's calibration tier (§8).

---

## 5 · Artifacts & schema

**Single-writer table — the core of the design.** Every artifact below names its one writer; a write from any other context is a defect by definition.

| Artifact | Writer | Lives on | Notes |
| --- | --- | --- | --- |
| `.planning/LANES.md` | hub only | main | Registry: one row per lane — id, slice, branch, worktree path, tier, status (`open / landing / landed / aborted`), dispatched/landed dates. Auto-regenerated section, `/sig:index`-style |
| `.planning/lanes/<ID>/BRIEF.md` | hub, at dispatch, never after | main (branch inherits it) | The contract (§6). YAML frontmatter: `slice`, `branch`, `tier`, `manifest:` (globs), `phase` pointer, `dispatched_at` |
| `.planning/lanes/<ID>/PROGRESS.md` | that lane only | lane branch → arrives on main at land | Lane-scoped equivalent of today's slice progress file |
| `.planning/lanes/<ID>/NOTES.md` | that lane only | lane branch → drained at land | Lane-local capture inbox — ideas/bugs found mid-lane. **Lanes never write the shared `ISSUES-INBOX.md`** |
| `.planning/SERIALIZED.md` | hub / human | main | Project-specific deny-list with reasons (for nextpass: `supabase/migrations/**`, `package.json`, `proxy.ts`, `vercel.json`, `app/(authed)/layout.tsx`, `CLAUDE.md`, …) |
| `.planning/GUARDED-SURFACES.md` | hub / human | main | Paths whose presence in a manifest auto-escalates tier (webhook receiver, state machine, provisioning scripts, spend-adjacent code) |
| `STATE.md` | hub only (unchanged) | main | **Additive, minimal:** one new frontmatter key `lanes_active: [ids]` — a pointer, not a payload. Lane detail stays in LANES.md to keep STATE.md lean and lock contention unchanged |

Because every lane-written path is unique to that lane (`lanes/<ID>/…` plus disjoint manifests), **merges are conflict-free by construction** — the property is structural, not behavioral.

---

## 6 · The Lane Brief — the contract

Generated by `/sig:dispatch` from the slice's existing PLAN + REQUIREMENTS (Signal plans already enumerate touched files — the manifest is extracted, then human-confirmed). Seven clauses:

1. **Mission & done-when** — the slice's acceptance criteria, verbatim from PLAN.
2. **Manifest** — "you may modify only: …" (globs).
3. **Read-only world** — everything else, with the serialized-resources list restated explicitly.
4. **Hard prohibitions** — no new migrations (request allocation from the hub); no dependency changes; no external-state changes (EL/Vercel/Supabase dashboards); no edits to invariant tests; no shared-interface signature changes.
5. **Interface freeze** — shared types/functions are consumed as-is; a needed change is an escalation, not an edit.
6. **Escalation rule** — "if the task cannot complete inside the manifest, **stop and report** — do not widen scope." (Same register as the anti-rationalization tables; a stopped lane is a success of the system, not a failure of the lane.)
7. **Deliverable** — branch with per-task commits (`git add <path> && git commit`, never `--amend` — lifted verbatim from the cluster-F item), updated PROGRESS, NOTES for any captures.

---

## 7 · Enforcement — three rings, because instructions alone are measured-unreliable

M5.E8's own numbers forbid trusting Ring 1 alone: 77.6% of directive lines are not trace-measurable, and B48 demonstrated a shipped instruction an agent *correctly declined*. Hence:

- **Ring 1 — the brief** (prompt-level). Necessary for the agent to *plan* within the fence; known insufficient to *guarantee* it.
- **Ring 2 — write-time hook** (mechanical, advisory-to-blocking). A hook in the lane worktree (Signal already ships a `hooks/` layer) checks each staged/written path against the manifest; out-of-fence writes are rejected with the fence named. Ships as warn-mode first, blocking once dogfooding confirms no false positives.
- **Ring 3 — land-time diff gate** (mechanical, deterministic, the backstop). `tools/lane-guard.js --check-diff <ID>`: asserts `git diff --name-only main...lane` ⊆ manifest ∪ `lanes/<ID>/**`. Any violation aborts the land with the offending files listed. Deterministic and file-shaped — exactly the class of check the v2 roadmap's rule §1 says needs no measurement layer.

Plus the dispatch-time check that makes lanes safe *against each other*: `lane-guard --check-overlap` refuses to open a lane whose manifest intersects any open lane's manifest or the serialized list.

**Defect-class insurance (non-optional):** a hygiene test asserting every `lane-guard` mode has a wired caller in a command file — the B39/B46/I2 lesson ("a guard written, shipped, and never called") applied to this feature on day one. Add the manifest directive to the adherence harness as a canary (`adherence-run --canary lane-manifest`) so Ring 1's real obedience rate gets *measured*, not assumed.

---

## 8 · Blast-radius tiers — per-lane calibration

Recursion of Signal's founding idea: the *project* answered five questions once; each *lane* gets a grade from its manifest.

| Tier | Trigger | Autonomy | VERIFY/REVIEW placement |
| --- | --- | --- | --- |
| **GREEN** | Manifest touches no guarded surface, no schema, additive/render-only | Fully autonomous, end-to-end | Lane runs VERIFY itself; hub spot-checks at land |
| **YELLOW** | Schema change (hub-allocated migration), state-machine or pipeline logic | Autonomous build; **human-gated merge** — the diff is read like it's radioactive | Hub re-runs VERIFY against merged main; REVIEW at hub |
| **RED** | External mutable state, prod data ops, spend-adjacent surfaces | **Not dispatchable.** `/sig:dispatch` refuses with the reason; the work runs supervised in the hub | n/a — never a lane |

Tier is computed at dispatch (manifest ∩ GUARDED-SURFACES), shown to the human, and recorded in the brief. Escalation is one-directional (a lane can be upgraded mid-flight, never downgraded) — same shape as `/sig:escalate`.

This table is also the second throughput lever hiding inside the feature: GREEN lanes may run at **FEATURE-tier ceremony inside a FULL-tier project**, because the blast radius — not the project — is what the rigor is protecting.

---

## 9 · Command surface

**New:**
- `/sig:dispatch <SLICE-ID>` — preconditions: slice is PLAN-complete; manifest extractable and human-confirmed; no overlap; tier ≠ RED. Actions: write BRIEF + registry row on main (commit), branch `lane/<slice-id>` from that commit, `git worktree add`, print the launch instruction for the lane session. *(Precondition style per the B48 lesson: conditional entry, halt-with-reason, never an unconditional ledger write.)*
- `/sig:land <ID>` — serial under `.landing.lock` (new lock file — do **not** overload the non-reentrant `.state.lock`; the §9 migrate-deadlock hazard is the standing warning). Sequence: rebase lane on main → Ring 3 diff gate → full test suite/CI → merge → drain NOTES → shared inbox → registry row → `landed` → archive `lanes/<ID>/` → `archive/lanes/` (relocate-never-delete) → remove worktree. `--abort` variant archives without merging.
- `/sig:lanes` — read-only registry view: what's open, what tier, how long, what's waiting to land.

**Modified (lane-context awareness):** `/sig:resume` and `/sig:status`, run inside a lane worktree, detect the lane (BRIEF.md present, branch matches) and scope themselves to the lane — brief, manifest, progress, "you are lane N of M." `/sig:add`, in a lane, writes to the lane's NOTES.md. `/sig:ship` in a lane refuses ("lanes land; the hub ships").

**Explicit non-goals (v1):** parallel DISCUSS/PLAN; multi-repo lanes; nested lanes; lane-to-lane communication (all coordination routes through the hub, by design); auto-merge without a human present.

---

## 10 · Implementation plan

Proposed as one Epic (**"Lanes core,"** slices S1–S5) with a fast-follow Epic (**"Lanes hardening & dogfood,"** S6–S8). Signal norms assumed throughout: RED-first tests with proof-of-fail on pre-change code; stranger-verifiable done-whens; decisions logged.

| # | Slice | Scope (files) | Done-when (stranger-verifiable) |
| --- | --- | --- | --- |
| **S1** | Vocabulary + schema + registry | `PROJECT.md` vocab, `references/lane-schema.md`, LANES.md format, `STATE.md` `lanes_active` key, hygiene-validator awareness | A stranger reads `lane-schema.md` and hand-writes a valid LANES.md + BRIEF.md that the hygiene guard accepts; an invalid one is rejected with the field named |
| **S2** | `tools/lane-guard.js` (+ tests) | `--check-overlap`, `--check-diff`, serialized-list load; pure functions, no locks | Two manifests sharing one glob fail overlap with paths named; a planted out-of-fence file fails diff-check; **proof-of-fail: both tests red against a stub** |
| **S3** | `/sig:dispatch` | `commands/dispatch.md`, manifest extraction from PLAN, brief generation, worktree/branch creation, registry write | Dispatch on a PLAN-complete fixture slice yields worktree + branch + brief; a second dispatch with an overlapping manifest is **refused**; a RED-tier manifest is **refused with the guarded surface named** |
| **S4** | Lane-side context + Ring 2 | resume/status/add lane-detection; write-time hook (warn mode) | In a lane worktree: `/sig:status` shows lane scope; `/sig:add` lands in NOTES.md not the shared inbox; a write outside the manifest produces the warning with the fence named |
| **S5** | `/sig:land` | `commands/land.md`, `.landing.lock`, rebase + Ring 3 + test gate + drain + archive; `--abort` | Landing a clean fixture lane merges + drains + archives; a lane with an out-of-fence file **aborts at Ring 3** with files listed; two simultaneous lands serialize on the lock |
| **S6** | Tier engine | GUARDED-SURFACES loading, tier computation, YELLOW merge-gate flag, one-way escalation | A manifest touching a guarded path auto-escalates and the dispatch output says why; a GREEN lane lands without the hub VERIFY step; a YELLOW lane blocks until the human-review flag is set |
| **S7** | Guard-caller + adherence insurance | Hygiene test (every lane-guard mode has a command caller); `lane-manifest` canary in the adherence harness | Deleting the Ring 3 call from `land.md` fails the hygiene test; the canary produces an as-written vs. instruction-deleted verdict pair |
| **S8** | Dogfood on nextpass + retro | Lane briefs for 2 real slices (candidates: a debrief-surface slice + ONB1-class work); metrics capture | **2 real lanes landed, 0 land-time conflicts, 0 cross-lane regressions**; wall-clock vs. the serial baseline recorded; retro written; falsifiers (§2) formally judged |

**Sequencing & prerequisites.** (1) Land v0.1.14 first — the B48 fix rewords a measured instruction and owes the canary re-run; dispatch/land add *more* phase-entry surface, so the precondition idiom must be settled before it's copied. (2) This Epic **absorbs** the cluster-F worktree item — its executor rule becomes brief clause 7; close the backlog entry into this one, single-home. (3) Run the *manual* lane convention on nextpass in parallel starting now (briefs as markdown, worktrees by hand, hub ritual by habit) — it is both the pilot's throughput win and S8's evidence base. The feature is the automation of a convention already proven by hand, which is the cheapest possible spec.

**Rough size honestly stated:** comparable to two M5.E6-scale Epics. S2/S5 carry the risk; S1/S3/S4 are mostly authoring; S6–S8 are small. If it must shrink, the minimum honest v0 is S2 + S5's Ring 3 + hand-written briefs — mechanical safety first, convenience commands second.

---

## 11 · Risks

| Risk | Mitigation |
| --- | --- |
| Lock re-entrancy — reusing `.state.lock` deadlocks (documented §9 hazard) | Separate `.landing.lock`; lane-guard stays lock-free (pure read) |
| Agent ignores the brief (measured: instructions ≠ obedience) | Rings 2–3 are mechanical; Ring 3 is the hard gate; canary measures Ring 1 |
| A guard ships and nothing calls it (B39/B46/I2 class) | S7 hygiene test, written *before* the feature is declared done |
| Worktree environment cost — `node_modules` per worktree, dev-server port collisions, one shared dev Supabase | Document in the brief template; lanes run unit/integration suites (hermetic per CI's own design); e2e stays a hub/land activity |
| Registry/STATE divergence | LANES.md auto-regenerated; hygiene guard cross-checks `lanes_active` ↔ registry rows |
| Manifest extracted wrong from PLAN | Human confirms at dispatch (one glance); Ring 3 catches the miss anyway — defense in depth |
| Review queue shifts to the human | Expected and intended (see plain-language §c); tier system meters it; not a defect of this design but its consequence |
| `.planning/archive` growth from lane shards | Same relocate-never-delete path the doc-runtime already maintains; `/sig:index` covers it |

---

## 12 · Open questions for DISCUSS

1. Should GREEN lanes run REVIEW at all, or is land-time spot-check + CI the whole gate? (Rigor-dial question — the answer probably differs per project tier.)
2. Migration allocation: hub pre-allocates numbers at dispatch ("you get 0044") vs. lanes never migrate and schema work is always hub-side? (Simpler is safer; nextpass evidence suggests YELLOW lanes with pre-allocated numbers work.)
3. Does a lane get its own `PROFILE.md`-style rigor override file, or is tier-in-brief sufficient? (Recommend: brief-only until dogfooding demands more.)
4. Ring 2 hook: warn vs. block at v1? (Recommend warn → block after S8 confirms false-positive rate ≈ 0.)
5. Hub `phase` semantics once lanes exist — rename or just re-document? (`completed_phases` just became an append-only run log in v0.1.12; touching its semantics again deserves its own decision.)
6. Cross-plugin reality check: worktrees share `.git` — confirm plugin resolution and hooks behave identically inside `git worktree` checkouts on macOS + Linux (an install-matrix-shaped question; D-E3-12's shelved tester item is adjacent).

---

## 13 · Success metrics (judged at S8 retro, against §2's falsifiers)

- **0** merge conflicts at land, across ≥4 dogfooded lanes (structural claim — any conflict is a design defect, not bad luck)
- **0** regressions traced to cross-lane interaction
- ≥**2** lanes concurrently open on nextpass during real pre-pilot work
- Wall-clock throughput: ≥1.5× slices-landed-per-week vs. the serial baseline (honest bar; 3–4 lanes ≠ 3–4×, because the hub serializes planning and landing)
- Adherence canary verdict recorded for the manifest directive (whatever it shows — a low obedience rate *vindicates* Rings 2–3 rather than indicting the feature)
