# Signal — Comprehensive Integration Rundown

**What Signal borrows, from where, and why — across all 7 analyzed repos + Signal's own contribution.**

> **Purpose.** Plain-language inventory of what each source repo contributes to Signal. Complements `REPO-ANALYSIS.md` (deep analysis) and `JOURNEY-MAP.html` (visual companion). This is the "between" doc — structured enough to reference, light enough to read in one sitting.

> **Scope note.** Current `PROJECT.md` specs a 6-phase MVP using only GSD + Agent Skills. This doc reflects the **target 10-phase architecture** recommended by `REPO-ANALYSIS.md` Part 4, which integrates selectively from all 7 repos. Treat this as the vision doc; `PROJECT.md` is the shipping sequence. The two need to be reconciled.

---

## TL;DR — the 9 ingredients, one line each

| Source | Role in Signal | Why it earns its place |
|---|---|---|
| **GSD** | The engine room | Best-in-class orchestration, state, parallelism |
| **Agent Skills** (Osmani) | Quality skill substrate | On-demand phase loading + anti-rationalization scaffolding |
| **gstack** (Garry Tan) | Exec-team borrows | State-of-the-art security audit + retro/learn loop |
| **superpowers** (obra) | Discipline enforcement | Hardest TDD + systematic-debugging in the landscape |
| **pm-skills** (phuryn) | Upstream PM layer | The only repo covering ideation/validation/strategy |
| **planning-with-files** | Context-discipline booster | Hook-driven re-read pattern; 96.7% benchmark lift |
| **oh-my-claudecode** | Spec-rigor gate | Measurable 20% ambiguity gate for spec clarity |
| **compound-engineering** | The memory layer | Post-ship Compound phase + multi-lens review |
| **Signal** (own) | Phase 0 Calibrate | Right-sizes rigor per project tier — nobody else does this |

---

## Mental model — where each repo lives in the stack

Think of Signal as a five-layer stack with a routing knob on top. Each layer is fed by different sources.

```
┌──────────────────────────────────────────────────────────────────┐
│  PHASE 0:   CALIBRATE              (Signal's own)                │
│             Tunes rigor per project — reads PROFILE.md everywhere│
└─────────────────────────────┬────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────┐
│  LAYER 5:   COMPOUND (memory)      (compound-eng + gstack)       │
│             Post-ship learning, retro/learn, session history     │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 4:   REVIEW DEPTH           (compound-eng + gstack +      │
│             Multi-lens review +     Agent Skills)                │
│             15-phase security                                    │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 3:   IMMUNE SYSTEM          (superpowers + GSD + gstack)  │
│             TDD, debugging, hard                                 │
│             gates, anti-rational.                                │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 2:   ENGINE ROOM            (GSD — unchanged + PwF graft) │
│             Wave execution, state,                               │
│             21 agents, CLI                                       │
├──────────────────────────────────────────────────────────────────┤
│  LAYER 1:   STRATEGY / UPSTREAM    (pm-skills + gstack + OMC)    │
│             Ideate, validate,                                    │
│             strategize, spec                                     │
└──────────────────────────────────────────────────────────────────┘
```

**Key insight from the analysis:** Nobody in the landscape covers all five layers. GSD nails Layer 2, superpowers nails Layer 3, pm-skills owns Layer 1, compound-engineering owns Layers 4–5, gstack covers 1 + 3 + 4 + 5 pretty well. Signal's value-add is the **integration architecture** — plus the Calibrate knob on top, which is unique to Signal.

---

## Per-repo deep-dive

Format for each: **(a) What it is · (b) What it does · (c) What Signal integrates and why.**

---

### 1. GSD — the engine room

**(a) What it is.** A Claude Code meta-prompting framework that turns AI coding into a factory-floor operation: 72 commands, 21 specialized agents, a CLI tool (`gsd-tools.cjs`), and a file-based state convention (`.planning/`). Multi-runtime (Claude Code primary, adapts to Cursor/Windsurf/Codex/Gemini/OpenCode).

**(b) What it does.**

- **Wave-based parallel execution** — groups tasks by dependency graph, runs independent tasks in parallel across fresh agent contexts
- **Context rot prevention** — each atomic task gets a fresh 200K window; warn at 35% remaining, critical at 25%
- **File-based state** — `.planning/` directory with STATE.md, CONTEXT.md, PROGRESS.md, N-PLAN.md, N-VERIFICATION.md
- **21 specialized agents** — planner, executor, verifier, plan-checker, security-auditor, nyquist-auditor, code-reviewer, plus 14 more
- **8-dimension plan validation** — scope, risk, testing, wiring, performance, security, docs, simplification
- **Nyquist test coverage** — tests must actually run and must fail before fix (no test theater)
- **Goal-backward verification** — the verifier doesn't trust task-complete claims; traces from goal through code

**(c) What Signal integrates and why.**

| Component | Decision | Rationale |
|---|---|---|
| Wave-based parallel execution | **Keep as-is** | Best-in-class; no rival in the landscape |
| `.planning/` state convention | **Keep + extend** (add PROFILE.md) | Mature format with XML frontmatter and traceability |
| 21 agents | **Keep most, audit some** | Some overlap with compound-eng's lens pattern; may trim |
| Fresh context per task | **Keep** | Core discipline preventing context rot |
| 8-dim plan validation | **Keep** | Survives every comparison in the analysis |
| Nyquist test coverage | **Keep** | Unique anti-test-theater mechanism |
| Goal-backward verification | **Keep** | Compounds well with anti-rationalization |
| `gsd-tools.cjs` CLI | **Keep (as-is initially)** | Adaptation may be needed later for PROFILE.md |

**Cut nothing from GSD.** It's the load-bearing engine; the analysis is explicit: *don't touch it.*

**Metaphor:** GSD is the factory floor and shipping dock. Every other repo feeds work into it or puts inspectors on top of it.

---

### 2. Agent Skills (Addy Osmani) — quality skill substrate

**(a) What it is.** Osmani's library of ~21 on-demand skill files + 3 specialist agents encoding senior-engineering judgment. Not in the 7-repo landscape analysis (it's the pre-existing partner to Signal's WIP), but sits alongside them.

**(b) What it does.**

- Provides a REVIEW phase that GSD lacks — the bridge between "does it work?" (VERIFY) and "is it good?" (SHIP)
- On-demand per-phase skill loading — never loads all 21 at once (respects context budget)
- Anti-rationalization tables at phase gates
- Per-phase skill bundles: define (idea-refine, spec-driven-development), plan (task-breakdown), build (incremental-impl, TDD, context-engineering), verify (browser-testing, debugging), review (code-review, security, perf, simplification), ship (git, CI/CD, ADRs, launch)

**(c) What Signal integrates and why.**

| Component | Decision | Rationale |
|---|---|---|
| REVIEW phase (concept) | **Keep** | GSD has no REVIEW; this is the big addition |
| `code-review-and-quality` skill | **Keep** | No better alternative |
| `security-and-hardening` skill | **REPLACE with gstack `/cso`** | gstack's 15-phase audit is state-of-the-art; covers LLM-specific attacks and supply chain that Agent Skills misses |
| `performance-optimization` skill | **Keep** | Solid coverage |
| `code-simplification` skill | **Keep** | No better alternative |
| `test-driven-development` skill | **REPLACE with superpowers' TDD** | Superpowers enforces TDD harder (deletes pre-test code) |
| `incremental-implementation`, `context-engineering` | **Drop** | Redundant with GSD's native discipline |
| `idea-refine`, `spec-driven-development` | **Augment with pm-skills + OMC** | Upstream is Agent Skills' weak spot |
| Anti-rationalization tables | **Keep as pattern, upgrade with superpowers'** | Superpowers' tables are more concrete and gate-enforced |
| Ship skills (git, CI/CD, ADRs, launch) | **Keep + augment with pm-skills GTM** | Mechanical ship is fine; GTM is missing |

**Rough estimate:** ~12 of Agent Skills' 21 skills survive into the target architecture. The other 9 are redundant with GSD or weaker than alternatives.

**Metaphor:** Agent Skills is the QA clipboard. Great checklists, but we're upgrading some of the inspectors to specialists.

---

### 3. gstack (Garry Tan) — exec-team borrows

**(a) What it is.** 30+ opinionated skills that turn Claude Code into a virtual executive team — CEO, eng manager, designer, CSO, QA, release engineer. Markdown skill library + persistent browser daemon + compiled CLI + multi-host support. The "closest single repo to what Signal is trying to build" per the analysis.

**(b) What it does.**

- **18 Prime Directives + 12 engineering preferences + 15 cognitive patterns** baked in
- **15-phase CSO security audit** (`/cso`) — secrets archaeology, supply chain, LLM-specific attacks, webhook verification, with false-positive exclusion rules
- **`/office-hours`** — product reframing through six forcing questions
- **`/plan-ceo-review`** — 4 scope modes (Expansion / Selective / Hold / Reduction) with dream-state visualization
- **`/browse`** — persistent headless Chromium daemon with sub-100ms latency + 6-layer prompt-injection defense
- **`/retro` + `/learn`** — weekly reflection with per-person metrics + operational learnings logged to JSONL
- **`/pair-agent`** — multi-agent browser sharing with activity attribution
- **`/freeze` + `/careful`** — hard gates that *block* edits to protected directories

**(c) What Signal integrates and why.**

| Component | Decision | Rationale |
|---|---|---|
| **`/cso` 15-phase security audit** | **Port into REVIEW** | Replaces Agent Skills' security skill; best security in the landscape |
| **`/office-hours` reframing** | **Port into `/sig:ideate`** | Strongest product-question forcing function anywhere |
| **`/retro` + `/learn`** | **Port into `/sig:compound`** | Weekly reflection + JSONL learnings are foundational for Layer 5 |
| **`/freeze` / `/careful`** | **Port into enforcement layer** | Hard-gate protection of critical directories |
| **`/plan-ceo-review` 4 modes** | **Inspire `/sig:plan` scope modes** | Not a direct port, but the mode pattern informs plan phase |
| **Design-review pattern** | **Port into `/sig:verify`** (UI projects) | Screenshot-diff verification pairs with OMC's visual-verdict |
| **Persistent browser daemon** | **Consider for `/sig:verify`** | Better than Agent Skills' browser-testing |
| **18 Prime Directives** | **Study, don't port directly** | Informs Signal's own philosophy doc |
| **~40 tooling/infra skills** | **Don't port** | gstack-specific infrastructure |

**Metaphor:** gstack is the C-suite we're contracting in — CSO for security, CEO for reframing, head of HR for retrospectives. We're not hiring the whole exec team, just the ones who fill our org chart gaps.

---

### 4. superpowers (Jesse Vincent / obra) — discipline enforcement

**(a) What it is.** 14 skills + 1 code-reviewer agent + cross-platform session-start hook. Works on Claude Code, Cursor, Copilot CLI, GitHub Copilot. Philosophy: *every shortcut is a rationalization; the tool's job is to make the right path the only path.*

**(b) What it does.**

- **Anti-rationalization tables** with reality checks per excuse ("Too simple to test" → "Simple code breaks. Test takes 30 seconds.")
- **`<HARD-GATE>` tags** — prevent progression; code literally can't proceed past them
- **`test-driven-development` skill** — forces deletion of pre-test code
- **`systematic-debugging` skill** — 4-phase structure (root cause → pattern → hypothesis → implementation) with "3+ fixes fail → STOP and question architecture" escalation
- **`subagent-driven-development`** — parallel agents with mandatory two-stage review (spec compliance THEN code quality)
- **Cross-platform session-start hook** — single codebase, four platforms

**(c) What Signal integrates and why.**

| Component | Decision | Rationale |
|---|---|---|
| **`test-driven-development`** | **Port into EXECUTE** | Replaces Agent Skills' TDD — stronger enforcement |
| **`systematic-debugging` (4-phase)** | **Port into VERIFY** | First-class debugging skill; unique escalation logic |
| **Anti-rationalization tables pattern** | **Adopt as Signal convention** | Every phase gate uses this format |
| **`<HARD-GATE>` tag mechanism** | **Port as enforcement module** | Makes gates actually block vs. being suggestions |
| **`subagent-driven-development` pattern** | **Study, don't port directly** | GSD's wave execution already covers this ground |
| **Cross-platform session-start hook** | **Study for multi-runtime adapter** | Useful reference for Signal's Cursor/Codex adapter later |
| **Other ~10 skills** | **Don't port** | Most overlap with GSD (brainstorming, writing-plans, etc.) |

**~4 of superpowers' 14 skills make it into Signal directly.** But its *philosophy* — gates as enforcement, not suggestions — permeates Layer 3.

**Metaphor:** Superpowers is the bouncer at the door. GSD gets the party started, superpowers keeps the troublemakers out.

---

### 5. pm-skills (phuryn) — upstream PM layer

**(a) What it is.** 65 PM skills across 8 plugins that operationalize canonical frameworks (Teresa Torres, Marty Cagan, Strategyzer, Alberto Savoia, Dan Olsen). Pure skill library — no agents, no orchestration. 36 chained slash commands group skills into workflows.

**(b) What it does.**

- **`/discover`** workflow — ideation → assumption mapping → prioritization → experiment design
- **`/strategy`** workflow — Lean Canvas, Business Model Canvas, VPD, Startup Canvas, Ansoff, SWOT, PESTLE, Porter's
- **`/write-prd`** workflow — 8-section PRD template with acceptance criteria
- **`/plan-launch`** workflow — beachhead segment, ICP, growth loops, battlecards, GTM motions
- **Opportunity Solution Trees** (Teresa Torres) for continuous discovery
- **Assumption mapping** — Impact × Risk prioritization
- **Pre-mortem** with Tiger/Paper Tiger/Elephant risk classification
- **Data-analytics stubs** — SQL generation, cohort analysis, A/B significance

**(c) What Signal integrates and why.**

| Component | Decision | Rationale |
|---|---|---|
| **`/discover` workflow** | **Port into `/sig:ideate` + `/sig:validate`** | Entire upstream gap — biggest add to Signal |
| **Assumption mapping (Impact × Risk)** | **Port** | First-class validation primitive |
| **Opportunity Solution Trees** | **Port** | Torres methodology for continuous discovery |
| **`/strategy` workflow** | **Port into `/sig:strategize`** | Lean Canvas, VPD, BMC are the strategy bedrock |
| **Beachhead + ICP** | **Port into `/sig:ship` GTM** | Launch phase is currently ship-mechanical only |
| **Growth loops + battlecards** | **Port into `/sig:ship`** | Needed for consulting deliverables |
| **`/write-prd`** | **Bridge with GSD spec phase** | pm-skills' PRD + GSD's Socratic spec refinement |
| **Pre-mortem** | **Port into `/sig:plan`** | Risk identification primitive |
| **Data-analytics stubs (SQL, cohorts)** | **Port selectively** | Useful for post-launch phases |
| **Resume review, NDA, privacy-policy skills** | **Don't port** | Off-core for Signal's use case |

**Rough estimate:** ~15 of pm-skills' 65 skills make it into Signal (covering ~80% of the upstream need). The rest are admin/legal/miscellaneous.

**This is the biggest architectural addition Signal makes over the current PROJECT.md MVP.** Without pm-skills, Signal is still "GSD with a review phase." With it, Signal covers the full entrepreneur journey.

**Metaphor:** pm-skills is the product management + strategy team. GSD can't ship what strategy can't describe; pm-skills is how strategy becomes describable.

---

### 6. planning-with-files (OthmanAdi) — context-discipline booster

**(a) What it is.** A hooks-driven three-file planning pattern (`task_plan.md` / `findings.md` / `progress.md`) that raised benchmark pass rate from **6.7% → 96.7%** by using disk as the agent's working memory. Single-skill marketplace plugin, 6 languages, 16+ IDE reach.

**(b) What it does.**

- **Disk as cognitive scaffold** — context window = RAM, filesystem = Disk
- **Lifecycle hooks** (UserPromptSubmit, PreToolUse, PostToolUse, Stop) auto-inject task context
- **2-Action Rule** — save findings immediately after viewing (guards against multimodal info loss)
- **Session recovery via JSONL** analysis after context resets
- **Security model** — `findings.md` quarantines untrusted web/API content to protect `task_plan.md` from indirect injection

**(c) What Signal integrates and why.**

| Component | Decision | Rationale |
|---|---|---|
| **2-Action Rule pattern** | **Port into GSD executors** | Strengthens context discipline in Layer 2 |
| **Hook-driven re-read on PostToolUse** | **Graft onto GSD's state management** | Prevents agents drifting from PROFILE.md / CONTEXT.md |
| **Findings quarantine pattern** | **Adopt for external-data handling** | Defense against prompt injection |
| **Three-file format** | **Don't adopt wholesale** | GSD's `.planning/` is more mature; take the *discipline*, not the schema |
| **Multi-language support** | **Don't port** | Signal starts English-first |

**Surgical graft, not a full port.** ~2 patterns borrowed. The benchmarked lift (6.7% → 96.7%) is what earns its place — the data says the pattern works.

**Metaphor:** planning-with-files is the note-taking discipline of a senior engineer — not a framework, just a habit. We're adopting the habit into how GSD's agents operate.

---

### 7. oh-my-claudecode (Yeachan-Heo) — spec-rigor gate

**(a) What it is.** Production-grade autonomous execution framework — 37 skills + 19 agents + 17 lifecycle hooks. Full orchestration with `.omc/` state, MCP bridge, tmux CLI workers. Philosophy: *specification quality is the bottleneck.*

**(b) What it does.**

- **`deep-interview`** — Socratic specification with mathematical **ambiguity scoring (20% gate)** — weakest-dimension targeting, one question at a time
- **Consensus planning** — Planner + Architect + Critic agents independently validate before execution
- **`ralph`** — PRD-driven loops that persist until all acceptance criteria pass
- **`visual-verdict`** — screenshot-diff review for UI changes
- **17 lifecycle hooks** across 7 events — most granular in the landscape

**(c) What Signal integrates and why.**

| Component | Decision | Rationale |
|---|---|---|
| **`deep-interview` with 20% ambiguity gate** | **Port into `/sig:spec`** | Measurable spec clarity is unique in the landscape |
| **Consensus planning (planner + architect + critic)** | **Adopt pattern for `/sig:plan`** | Informs GSD's planner with critic-pair verification |
| **`visual-verdict` pattern** | **Port into `/sig:verify`** for UI projects | Complements gstack's design-review |
| **`ralph` acceptance-loop** | **Adopt pattern for `/sig:execute`** | Informs GSD executor's loop logic |
| **17 lifecycle hooks** | **Study for hook architecture** | Most granular hook reference; plan Signal's hooks against this |
| **Full orchestration (37 skills, 19 agents)** | **Don't port wholesale** | GSD's orchestration is already in place |

**2–3 patterns ported, not a wholesale integration.** OMC's value is its spec-phase rigor and hook design — we're lifting those, not the full framework.

**Metaphor:** OMC is the demanding tech-lead during spec review. Won't let you start coding until the ambiguity is measurably low.

---

### 8. compound-engineering (Every Inc) — the memory layer

**(a) What it is.** ~45 skills + ~50 specialist agents organized around a six-phase workflow: **Ideate → Brainstorm → Plan → Work → Review → Compound.** TypeScript multi-platform plugin. Philosophy: *compound engineering inverts cost-of-change. 80% planning + review + knowledge capture; 20% execution.*

**(b) What it does.**

- **Compound phase** — dedicated phase for knowledge capture after ship
- **`learnings-researcher` + `session-historian` agents** — institutional memory as first-class engineering deliverable
- **~50-agent review panel** — multiple lenses applied in parallel (simplicity, correctness, maintainability, coherence, DHH Rails style, data integrity, API contract, deployment readiness)
- **Worktree-based task execution** with conventional commits
- **Language-specific style agents** — DHH Rails style, Andrew-Kane gem-writer, etc.
- **80/20 planning-to-execution split** embedded in workflow

**(c) What Signal integrates and why.**

| Component | Decision | Rationale |
|---|---|---|
| **Compound phase (the concept)** | **Port as Phase 10 (`/sig:compound`)** | Entire new phase Signal previously lacked |
| **`learnings-researcher` agent** | **Port** | Core to Layer 5 memory |
| **`session-historian` agent** | **Port** | Structures session logs into institutional memory |
| **Multi-lens review panel** | **Port, reduced to ~8 lenses** | 50 agents is overkill; 8 (simplicity, correctness, maintainability, security, perf, API contract, coherence, framework style) covers it |
| **80/20 planning-to-execution rule** | **Adopt as Signal principle** | Inform PROFILE.md rigor settings |
| **Conventional commits + release automation** | **Adopt in `/sig:ship`** | Already partially in Agent Skills' git-workflow |
| **Worktree-based execution** | **Study, compare with GSD's approach** | May inform parallel execution |
| **Language-specific style agents** | **Port on-demand, tier-gated** | Load only when FULL tier + relevant language |

**This is the second-biggest architectural addition** (after pm-skills' upstream). Compound phase is explicitly called out in the analysis as *the* differentiator between "agent writes good code this time" vs. "agent writes better code every time."

**Metaphor:** compound-engineering is the institutional memory — the company wiki, the postmortem archive, the "what worked last time" database. Without it, every project starts from zero.

---

### 9. Signal — own contribution (Phase 0 Calibrate + escalate)

**(a) What it is.** The routing layer that sits above the five-layer stack. Not borrowed from any repo — this is Signal's unique addition to the landscape. The analysis is explicit: *no repo in the landscape solves this problem.*

**(b) What it does.**

- **`/sig:calibrate`** — asks 5 diagnostic questions (Scope, Stakes, Novelty, Reversibility, Horizon) → computes tier (SKETCH / FEATURE / SPIKE / FULL) from a Stakes × Novelty 2×2 → writes `.planning/PROFILE.md`
- **`PROFILE.md` contract** — machine-readable tier + rigor overrides (`tdd_required`, `security_audit`, `nyquist_tests`, etc.)
- **Every downstream command reads PROFILE.md first** — phases skip themselves when the tier says they don't apply; skills load lighter or heavier versions per rigor settings
- **`/sig:escalate`** — promotes a running project's tier mid-flight (SKETCH → FEATURE → FULL) if scope grows. Prevents the "cheap mode becomes technical debt" failure.

**(c) Why this is load-bearing.**

Every framework in the landscape assumes every project deserves the same rigor. A marketing homepage and a production auth system don't. GSD's 60-minute planning for a static page actively *degrades* output (planning overhead crowds out design iteration). The analysis observed this as a real failure mode.

Without Calibrate, Signal would inherit the same flaw — and adoption by mid-market orgs (Brett's consultancy target) would fail on the same trap.

| Component | Decision | Rationale |
|---|---|---|
| **`/sig:calibrate`** (5 questions → tier) | **Build first** | Smallest, most self-contained; every downstream depends on it |
| **`PROFILE.md` schema** | **Build first** | Contract every other command reads |
| **Stakes × Novelty 2×2** | **Build first** | Core mental model; informs tier mapping |
| **`/sig:escalate`** | **Build second** | Escape hatch for scope creep |
| **Tier-gating in every phase command** | **Build incrementally** | Each command's first action: `read PROFILE.md` |

**Metaphor:** Calibrate is the volume knob on a high-end stereo system. The amplifier (GSD), speakers (Agent Skills), equalizer (superpowers), source (pm-skills) are all excellent — but without a volume knob, you're always playing at max. Calibrate is how Signal adapts the same pipeline to every project type without maintaining two separate pipelines.

---

## Cross-cut: what we deliberately do *not* integrate

Discipline is easier to see when you name the cuts.

| From | What we skip | Why |
|---|---|---|
| gstack | 40+ tooling/infra skills (`/browse`, `/setup-*`, `/pair-agent`) | gstack-specific infrastructure |
| pm-skills | ~50 of 65 skills (resume review, NDA, privacy-policy, etc.) | Off-core for Signal's build-software-with-AI frame |
| superpowers | ~10 of 14 skills | Overlap with GSD (brainstorming, writing-plans) |
| compound-eng | ~42 of 50 review agents | 8 lenses cover 90%; more adds noise |
| OMC | Full orchestration framework (37 skills, 19 agents) | GSD already covers Layer 2 |
| planning-with-files | Three-file schema | GSD's `.planning/` is more mature |
| Agent Skills | ~9 of 21 skills (incremental-impl, context-engineering, TDD, security-and-hardening) | Redundant or weaker alternatives exist |

**The principle:** *steal patterns, not whole repos.* The integration architecture is Signal's value-add — not the individual skills.

---

## The integrated 10-phase flow

```
[Phase 0] /sig:calibrate ── writes .planning/PROFILE.md ─── routes ↓

IDEATE → VALIDATE → STRATEGIZE → SPEC → PLAN → EXECUTE → VERIFY → REVIEW → SHIP → COMPOUND
  │         │           │         │      │        │        │        │        │        │
  ▼         ▼           ▼         ▼      ▼        ▼        ▼        ▼        ▼        ▼
 pm-      pm-        pm-       OMC    GSD      GSD     GSD +    compound   Agent    compound
 skills + skills     skills +  +      +        +       superp. + -eng +    Skills + -eng +
 gstack              compound  pm-    compound superp. gstack    gstack +  pm-      gstack
 /office  /discover  /strategy skills -eng             /qa       Agent     skills
 hours                         /spec                            Skills    GTM
  │         │           │         │      │        │        │        │        │        │
 Human    Human       Human     Human  Human    Human    Human    Human    Human    Human
 gate     gate        gate      gate   gate     gate     gate     gate     gate     gate

 └─────── new UPSTREAM ──────┘   └─── GSD's engine + layered quality ────┘  └─ new ─┘
```

Every phase command's first action: **read PROFILE.md**. If the current tier skips this phase, exit early. If rigor overrides apply, respect them.

---

## Minimum Viable Frankenstein (per analysis Part 5)

If the goal is the smallest useful version that honors the integration strategy:

**Must-have:**
- GSD engine (as-is)
- 5 pm-skills (`/discover`, `/strategy`, VPD, assumption-map, interview-script) + OMC's `deep-interview`
- Superpowers' 4 core skills (TDD, systematic-debugging, anti-rationalization doc, HARD-GATE mechanism)
- Compound-eng's multi-lens review (reduced to 6 lenses) + gstack's `/cso` + Agent Skills' code-simplification + performance-optimization
- Existing GSD ship + Agent Skills' docs-and-adrs
- Compound-eng's `learnings-researcher` + gstack's `/retro` & `/learn`
- Signal's `/sig:calibrate` + `/sig:escalate`

**Nice-to-have (v2):**
- planning-with-files hook grafts
- gstack browser daemon
- `visual-verdict` for UI projects
- pm-skills GTM suite (beachhead, ICP, growth loops, battlecards)
- Multi-runtime adapters

Total MVP scope: ~8 upstream skills, GSD's 21 agents unchanged, ~8 review skills, ~4 enforcement skills, ~3 compound skills.

---

## Reconciliation with current PROJECT.md

**Current PROJECT.md** specs a narrower 6-phase MVP (DISCUSS → PLAN → EXECUTE → VERIFY → REVIEW → SHIP) using only GSD + Agent Skills + Calibrate. That scope ships faster but leaves Layers 1 and 5 (Strategy upstream, Compound memory) empty.

**This doc** reflects the target 10-phase architecture recommended by the analysis.

**Strategic decision pending:** Does `PROJECT.md` get updated to match this doc, or does Signal ship the narrow MVP first and then expand? The analysis's Part 6 flags this as one of four locked/unlocked strategic questions.

**Recommendation:** treat this doc as the canonical vision. Update `PROJECT.md` to reflect phased delivery — MVP v1 (6 phases, GSD + Agent Skills + Calibrate), MVP v2 (adds pm-skills upstream + compound-eng Compound phase + gstack `/cso`), v3 (full 10-phase flow, multi-runtime adapters, planning-with-files hook grafts).

---

## Appendix — repo URLs for reference

- **GSD:** https://github.com/gsd-build/get-shit-done
- **Agent Skills:** https://github.com/addyosmani/agent-skills
- **gstack:** https://github.com/garrytan/gstack
- **superpowers:** https://github.com/obra/superpowers
- **pm-skills:** https://github.com/phuryn/pm-skills
- **planning-with-files:** https://github.com/OthmanAdi/planning-with-files
- **oh-my-claudecode:** https://github.com/Yeachan-Heo/oh-my-claudecode
- **compound-engineering:** https://github.com/EveryInc/compound-engineering-plugin

---

*This doc complements `REPO-ANALYSIS.md` (deep analysis) and `JOURNEY-MAP.html` (visual companion). Last updated alongside the Signal rebrand.*
