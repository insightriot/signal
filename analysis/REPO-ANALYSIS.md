# Signal — Frankenstein Analysis: 7 AI-Dev Plugins + Your WIP

**Working name:** **Signal** (signal vs. noise across vision → planning → scope → code → test → ship → learn). Command prefix: `/sig:`. Phase 0 is **Calibrate**.

**Goal:** Identify best-of-breed components across 7 Claude Code plugins/frameworks and your existing GSD × Agent Skills WIP, to design one coherent "system of record" for building products with AI agents — from idea to ship to learn.

**Lens:** Coverage of the full entrepreneur journey, with GSD as the coding-rigor anchor.

---

## TL;DR — The Five Insights

1. **Your WIP solves the wrong half first.** GSD × Superpowers = two "engineer-for-quality" frameworks stacked on top of each other. Both assume the problem is already defined. The real coverage gap is *upstream* (idea → validation → strategy), not downstream quality.

2. **There are only 3 archetypes among these 7 repos.** (a) *Orchestration engines* that run agents: GSD, oh-my-claudecode, compound-engineering. (b) *Quality enforcers* that gate shortcuts: superpowers, gstack. (c) *Domain skill libraries* that encode methodology: pm-skills, compound-engineering (shares this trait). Planning-with-files is a utility under all of them.

3. **gstack is the sleeper.** It's the closest single repo to what you're trying to build — broad journey coverage, production-grade rigor, "virtual exec team" metaphor. It's more ambitious than your WIP. You should steal from it, not just reference it.

4. **The missing phase isn't REVIEW — it's COMPOUND.** Agent Skills' Review phase (code quality, security, perf) is great, but compound-engineering's *Compound* phase (learnings-researcher, session-historian, institutional memory) is the difference between "agent writes good code this time" and "agent writes better code every time."

5. **Three layers belong on every project; four skill libraries belong to the problem.** The Frankenstein isn't "pick the best skills" — it's a 3-layer core (orchestration + enforcement + compounding) that stays constant, with skill libraries swapped in per project type (product/app, SaaS, consulting deliverable, etc.).

---

## The Mental Model

Think of AI-assisted building as running a company with four organs. Each repo optimizes one or two; none covers all four.

```
                ┌─────────────────────────────────────────────┐
                │  ORGAN 4: The Memory                        │
                │  ("what did we learn? what's worth keeping?")│
                │                                             │
                │  compound-engineering  ██████                │
                │  gstack (retro/learn)  ████                  │
                │  OMC (wiki, memory)    ███                   │
                │  GSD (STATE.md)        ██                    │
                │  planning-with-files   █                     │
                │  superpowers           ·                     │
                │  pm-skills             ·                     │
                └─────────────────────────────────────────────┘
                                  ▲
                                  │
                ┌─────────────────────────────────────────────┐
                │  ORGAN 3: The Immune System                 │
                │  ("don't let the agent cheat or drift")     │
                │                                             │
                │  superpowers           ██████                │
                │  gstack (CSO, review)  █████                 │
                │  GSD (verifier, plan-check) ████             │
                │  compound-eng (~50 agents) ████               │
                │  OMC (multi-agent validation) ███            │
                │  pm-skills             ·                     │
                │  planning-with-files   ·                     │
                └─────────────────────────────────────────────┘
                                  ▲
                                  │
                ┌─────────────────────────────────────────────┐
                │  ORGAN 2: The Engine Room                   │
                │  ("get agents actually building things")    │
                │                                             │
                │  GSD                   ██████                │
                │  OMC                   █████                 │
                │  compound-eng          ████                  │
                │  gstack                ████                  │
                │  superpowers           ███                   │
                │  planning-with-files   ██                    │
                │  pm-skills             ·                     │
                └─────────────────────────────────────────────┘
                                  ▲
                                  │
                ┌─────────────────────────────────────────────┐
                │  ORGAN 1: The Brain / Strategy              │
                │  ("what are we building and why?")          │
                │                                             │
                │  pm-skills             ██████                │
                │  gstack (CEO/office-hrs)  █████              │
                │  compound-eng (brainstorm) ███               │
                │  OMC (deep-interview)  ███                   │
                │  GSD (spec-phase)      ██                    │
                │  superpowers (brainstorm) ██                 │
                │  planning-with-files   ·                     │
                └─────────────────────────────────────────────┘
```

**Your WIP currently covers Organs 2 + 3 well, Organ 4 partially (STATE.md only), Organ 1 barely.** That's the real shape of the gap.

---

## Part 1: Per-Repo Summaries

### 1. gstack (Garry Tan) — [github.com/garrytan/gstack](https://github.com/garrytan/gstack)

**UVP:** 30+ opinionated skills that turn Claude Code into a virtual exec team (CEO, eng manager, designer, CSO, QA, release engineer) covering the full delivery cycle.

**Form factor:** Markdown-based skill library with a persistent browser daemon, compiled CLI binaries, multi-host support (Claude Code, Cursor, Codex, 5 others). Host-agnostic by design.

**Philosophy:** *Boil the lake, not the ocean.* AI compresses marginal cost to zero — so do the complete thing, not the shortcut. Search before building. User sovereignty: models recommend, users decide (explicit AskUserQuestion gates).

**Rigor signal:** 18 "Prime Directives" + 12 engineering preferences + 15 cognitive patterns in `/plan-ceo-review` alone. 15-phase CSO security audit (phases 0–14) with false-positive exclusion rules per phase. Hard gates: `/freeze` *blocks* edits to protected directories. Skill health dashboard + operational learnings JSONL.

**Unique contributions:**
- **`/office-hours`** — product-reframing with six forcing questions
- **`/plan-ceo-review`** — 4 scope modes (Expansion / Selective / Hold / Reduction), dream-state visualization, 10x check
- **`/cso`** — 15-phase security audit (secrets archaeology, supply chain, LLM-specific, webhook verification)
- **`/browse`** — persistent headless Chromium daemon with sub-100ms latency + 6-layer prompt-injection defense
- **`/retro` + `/learn`** — weekly reflection with per-person metrics + operational learnings logged to JSONL
- **`/pair-agent`** — multi-agent browser sharing with activity attribution

**Gap:** No market/user validation, no financial modeling, no A/B testing, no retention/churn analysis.

---

### 2. superpowers (Jesse Vincent / obra) — [github.com/obra/superpowers](https://github.com/obra/superpowers)

**UVP:** Mandatory engineering discipline enforced as hard gates — TDD, systematic debugging, design-first — via session-start hooks and anti-rationalization tables.

**Form factor:** 14 skills + 1 code-reviewer agent + 3 legacy commands. Works on Claude Code, Cursor, Copilot CLI, GitHub Copilot via cross-platform session-start hook.

**Philosophy:** *Every shortcut is a rationalization.* The tool's job is to make the right path the only path. "Pragmatic" means systematic, not fast.

**Rigor signal:** `<HARD-GATE>` tags prevent progression. `test-driven-development` skill forces deletion of pre-test code. `systematic-debugging` has 4-phase structure with "if 3+ fixes fail, STOP and question architecture" escalation. Two-stage review (spec compliance THEN code quality).

**Unique contributions:**
- **Anti-rationalization tables** with reality checks for every excuse ("Too simple to test" → "Simple code breaks. Test takes 30 seconds.")
- **`systematic-debugging`** as first-class 4-phase skill (root cause → pattern → hypothesis → implementation)
- **`subagent-driven-development`** — parallel agents with mandatory two-stage review
- **Cross-platform session-start hook** — single codebase, 4 platforms

**Gap:** Purely engineering-focused. Zero business/validation/strategy/shipping coverage.

**vs GSD:** Superpowers is a *philosophy wrapper*. GSD's wave execution and state management ≈ superpowers' subagent-driven-development. GSD is orchestration-first; superpowers is discipline-first. They share the quality obsession but come at it from different layers.

---

### 3. pm-skills (phuryn) — [github.com/phuryn/pm-skills](https://github.com/phuryn/pm-skills)

**UVP:** 65 PM skills across 8 plugins that turn canonical PM frameworks (Teresa Torres, Cagan, Strategyzer, Savoia, Olsen) into interactive workflows.

**Form factor:** Pure skill library — no agents, no orchestration. 36 chained slash commands group skills into workflows like `/discover` → `/strategy` → `/write-prd` → `/plan-launch`.

**Philosophy:** *Frameworks over templates.* "Generic AI gives you text. PM Skills gives you structure." Each skill credits source books with further-reading links.

**Rigor signal:** Framework-specific, not generic. Opportunity Solution Trees (Torres). 9-section Product Strategy Canvas. 8-section PRD template. Assumption mapping (Impact × Risk). Pre-mortem with Tiger/Paper Tiger/Elephant classification.

**Unique contributions:**
- **Continuous Discovery:** `/discover` = ideation → assumption mapping → prioritization → experiment design
- **Strategy canvases:** Lean Canvas, Business Model Canvas, VPD, Startup Canvas, Ansoff, SWOT, PESTLE, Porter's
- **Go-to-market:** beachhead segment, ICP, growth loops, battlecards, GTM motions
- **Data analytics stubs:** SQL generation, cohort analysis, A/B test significance
- **JTBD-centric** language across discovery, strategy, execution

**Gap:** Zero engineering integration. No code review, no testing, no security, no deployment. Assumes PRD lands in engineers' hands magically.

---

### 4. planning-with-files (OthmanAdi) — [github.com/OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files)

**UVP:** A hooks-driven three-file planning pattern (`task_plan.md` / `findings.md` / `progress.md`) that raised benchmark pass rate from 6.7% → 96.7% by using disk as the agent's working memory.

**Form factor:** Single-skill marketplace plugin in 6 languages. Lifecycle hooks (UserPromptSubmit, PreToolUse, PostToolUse, Stop) auto-inject task context. Works across 16+ IDEs.

**Philosophy:** *Context window = RAM. Filesystem = Disk.* Grounded in Manus principles: attention through recitation, 2-Action Rule (save findings immediately), errors preserved as signals.

**Rigor signal:** Formal benchmarking (96.7% pass, blind A/B). Security model: findings.md quarantines untrusted web/API content to protect task_plan from indirect injection. Active community (34+ contributors).

**Unique contributions:**
- **Disk-as-cognitive-scaffold** thesis with hook automation
- **2-Action Rule** (immediate save after view — guards against multimodal info loss)
- **Session recovery via JSONL** analysis after context resets
- **16+ IDE reach** — hook-driven design is platform-portable

**Gap:** No specialist agents. No skill library. Pure utility. This is a *pattern*, not a system.

---

### 5. oh-my-claudecode (Yeachan-Heo) — [github.com/Yeachan-Heo/oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode)

**UVP:** Production-grade autonomous execution — 37 skills + 19 agents + 17 lifecycle hooks — that takes "build a task REST API" from one-liner to shipped code via Socratic interrogation, consensus planning, and multi-perspective validation.

**Form factor:** Full orchestration framework with `.omc/` state directory, custom MCP bridge, tmux CLI workers for Codex/Gemini delegation, multi-language README.

**Philosophy:** *Specification quality is the bottleneck.* Invest heavily in Socratic questioning *before* code starts. Agents are specialists with constrained responsibilities (executor doesn't architect, security-reviewer is read-only).

**Rigor signal:** `deep-interview` has mathematical ambiguity scoring with a 20% gate. `ralph` loops on PRD stories until all acceptance criteria pass. Consensus planning: Planner + Architect + Critic independently validate before execution. 17 hooks across 7 lifecycle events.

**Unique contributions:**
- **`deep-interview`** — Socratic specification with ambiguity scoring (weakest-dimension targeting, one question at a time)
- **Consensus planning** — 3 agents independently validate before execution
- **`ralph`** — PRD-driven loops that persist until all acceptance criteria pass
- **`visual-verdict`** — screenshot-diff review for UI changes
- **17 lifecycle hooks** — context management, state persistence, rule injection all hook-driven

**Gap:** No discovery layer — assumes validated problem. Minimal shipping detail. Single-project focus.

---

### 6. compound-engineering-plugin (Every Inc) — [github.com/EveryInc/compound-engineering-plugin](https://github.com/EveryInc/compound-engineering-plugin)

**UVP:** ~45 skills + ~50 specialist agents organized around a six-phase workflow (Ideate → Brainstorm → Plan → Work → Review → Compound) that inverts the velocity-decay curve — each task makes the next one easier.

**Form factor:** TypeScript multi-platform plugin with Cursor/Codex adapters. Marketplace-style skill loading. Worktree-based task execution with conventional commits.

**Philosophy:** *Compound engineering inverts cost-of-change.* 80% planning + review + knowledge capture; 20% execution. Knowledge capture is a first-class engineering deliverable, not overhead.

**Rigor signal:** ~50 specialist agents with distinct lenses (simplicity, correctness, maintainability, coherence, DHH Rails style, data integrity, API contract, deployment). Platform-agnostic source with explicit conversion layer. Conventional commits + automated release automation.

**Unique contributions:**
- **Compound phase** — dedicated phase for knowledge capture; learnings-researcher + session-historian agents
- **~50-agent review panel** — multiple lenses applied in parallel (simplicity, correctness, security, framework conventions)
- **80/20 planning-to-execution** split embedded in workflow
- **Session history as engineering asset** — not just logs; structured institutional memory
- **Language-specific style agents** — DHH Rails style, Andrew-Kane gem-writer, etc.

**Gap:** Pre-launch validation absent (no market research, pricing, GTM). Deployment automation thin.

---

### 7. GSD (gsd-build/get-shit-done) — [github.com/gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done)

**UVP:** Meta-prompting orchestration that solves context rot via wave-based parallel execution, 21 specialized agents, file-based `.planning/` state, and goal-backward verification.

**Form factor:** 72 commands + 21 agents + CLI (`gsd-tools.cjs`) + multi-runtime adapter layer (Claude Code primary, adapts to Cursor/Windsurf/Cline/Codex/Gemini/OpenCode).

**Philosophy:** *Context rot is catastrophic.* Force atomic decomposition — each task in a fresh 200k-token context, reading only what it needs. Wave-based parallelization respecting dependency graphs. File-based state is simpler + more traceable than databases.

**Rigor signal:** 8-dimension plan validation (scope, risk, testing, wiring, perf, security, docs, simplification). Nyquist test coverage (tests must run, must fail before fix). Goal-backward verification (don't trust task completion — trace from goal through code). Adversarial code review in 3 depths.

**Unique contributions:**
- **Wave-based parallelization** with dependency graphs
- **Fresh context per atomic task** — prevents rot
- **`.planning/` file conventions** — version-controllable agent memory (PROJECT.md, STATE.md, ROADMAP.md, N-CONTEXT.md, N-PLAN.md, N-SUMMARY.md, N-VERIFICATION.md)
- **Goal-backward verification** — the verifier doesn't trust completion claims
- **Nyquist test validation** — behavioral tests that actually fail
- **21-agent specialization** — optimized per domain (planner, executor, verifier, plan-checker, security-auditor, nyquist-auditor, code-reviewer, 14 more)

**Gap:** Upstream (ideation/validation/strategy) is assumed done. "Good code" is undefined beyond rigor. No compounding learning loop. Limited shipping orchestration (assumes you have a pipeline).

---

### 8. YOUR WIP: GSD × Agent Skills Hybrid

**Positioning:** A Claude Code plugin that combines GSD's orchestration engine with Agent Skills' quality standards into a six-phase flow (DISCUSS → PLAN → EXECUTE → VERIFY → REVIEW → SHIP).

**Architecture:** 3-layer — (1) GSD orchestration core, (2) Agent Skills loaded on-demand per phase, (3) anti-rationalization + verification shared.

**Key innovation:** Adds REVIEW phase between VERIFY and SHIP (Agent Skills' contribution — code quality, security, perf, simplification).

**Strengths:**
- Skills load on-demand per phase (respects context budget)
- Merges GSD's 21 agents with Agent Skills' 3 specialists
- File-based state preserved
- Multi-runtime intent from day 1

**What's missing (per this analysis):**
- **Upstream layer absent.** Discuss phase is scoped to "is this spec refined?" — not "is this the right problem?" You need pm-skills-style discovery/validation.
- **No compounding loop.** You ship and forget. compound-engineering's Compound phase is the biggest architectural miss.
- **REVIEW is good but not the *best* REVIEW.** Agent Skills' security-and-hardening is fine; gstack's 15-phase CSO audit is *state-of-the-art* and covers ground Agent Skills misses (LLM-specific attacks, supply chain, webhook verification, secrets archaeology).
- **Discipline enforcement is implicit.** Superpowers-style hard gates and anti-rationalization tables are listed as "shared layer" but not architected as *enforcement*.

---

## Part 2: Coverage Across the Entrepreneur Journey

Strong █ | Partial ▒ | None · | Very Strong ██ (distinctive leader)

| Journey Stage | gstack | superpowers | pm-skills | planning-with-files | oh-my-claudecode | compound-eng | GSD | Your WIP |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **1. Idea generation** | █ | ▒ | ██ | · | · | █ | · | · |
| **2. Market validation** | ▒ | · | ██ | · | · | ▒ | · | · |
| **3. Vision / strategy** | █ | ▒ | ██ | · | ▒ | ▒ | ▒ | ▒ |
| **4. Requirements / spec** | █ | █ | █ | █ | ██ | █ | █ | █ |
| **5. Planning / decomp** | █ | █ | █ | █ | █ | █ | ██ | █ |
| **6. Coding / execution** | █ | █ | · | █ | █ | █ | ██ | █ |
| **7. Testing** | █ | █ | ▒ | ▒ | █ | █ | █ | █ |
| **8. Code review** | █ | █ | · | · | █ | ██ | █ | █ |
| **9. Security / hardening** | ██ | · | · | ▒ | █ | █ | █ | █ |
| **10. Shipping / deploy** | █ | ▒ | ▒ | ▒ | ▒ | ▒ | ▒ | █ |
| **11. PM / ongoing** | █ | · | ██ | █ | ▒ | █ | ▒ | ▒ |
| **12. Compounding / learning** | █ | · | · | · | ▒ | ██ | ▒ | · |

### Reading the matrix

- **Only pm-skills covers Stages 1–3 seriously.** Every coding-oriented repo skips or punts on validation/strategy.
- **Stages 4–7 are commoditized.** Every orchestration framework does them competently; GSD does them best.
- **Stages 8–9 have two leaders.** compound-eng (review) and gstack (security) — both better than Agent Skills on their specialty.
- **Stage 10 is universally weak.** No repo really orchestrates deploy/release. This is a *green field*.
- **Stage 11 is where pm-skills and compound-eng diverge from everything else.**
- **Stage 12 (Compounding) is compound-eng's unique territory.** Your WIP has zero coverage here.

### Where your WIP currently sits

Your WIP scores the same or worse than GSD alone on Stages 1–3 (no improvement upstream), matches GSD on 4–7, improves on 8–9 via Agent Skills' REVIEW, improves on 10 via Agent Skills' shipping-and-launch, and is *worse than both gstack and compound-eng* on 11–12.

You're adding Agent Skills to cover Stage 9 (security) and late 10 (shipping polish) — but gstack and compound-eng already cover those better, and pm-skills and compound-eng cover Stages 1–3 and 12 that you're still missing.

---

## Part 3: Cross-Repo Pattern Analysis

### A. Architectural patterns

| Pattern | gstack | superpowers | pm-skills | planning-with-files | oh-my-claudecode | compound-eng | GSD | Your WIP |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| File-based state | ✓ | (git only) | · | ✓ | ✓ | ✓ | ✓ | ✓ |
| Phase-gated workflow | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| On-demand skill loading | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ | ✓ |
| Specialist agents (5+) | ✓ | · | · | · | ✓ | ✓ | ✓ | ✓ |
| Hard gates / anti-rationalization | ✓ | ✓ | · | · | ✓ | ✓ | ✓ | ✓ |
| Multi-platform (>2 hosts) | ✓ | ✓ | · | ✓ | ✓ | ✓ | ✓ | (planned) |
| Lifecycle hooks | partial | ✓ (session-start) | · | ✓ | ✓ (17) | · | · | · |
| Goal-backward verification | · | · | · | · | ✓ | ✓ | ✓ | ✓ |
| Parallel agent orchestration | · | ✓ | · | · | ✓ | ✓ | ✓ | ✓ |
| Ambiguity/spec scoring gate | · | · | · | · | ✓ (20%) | · | · | · |
| Knowledge-capture loop | ✓ | · | · | · | ▒ | ✓ | ▒ | · |

### B. Methodological patterns

| Pattern | gstack | superpowers | pm-skills | planning-with-files | oh-my-claudecode | compound-eng | GSD | Your WIP |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| Socratic requirements interrogation | ✓ (office-hrs) | · | ✓ (interview) | · | ✓ (deep-interview) | ✓ | ✓ (spec-phase) | ✓ |
| Canonical framework grounding (JTBD, BMC, etc.) | partial | · | ✓✓ | · | · | partial | · | · |
| TDD enforcement | ▒ | ✓✓ | · | · | ✓ | ✓ | ✓ | ✓ |
| Systematic debugging (multi-phase) | ✓ | ✓✓ | · | · | ✓ | ✓ | ▒ | ▒ |
| Adversarial code review | ✓ | ✓ | · | · | ✓ | ✓✓ (~50 agents) | ✓ | ✓ |
| Security audit depth | ✓✓ (14-phase CSO) | · | · | · | ▒ | ✓ | ✓ | ✓ |
| Multi-agent consensus (planner+critic) | ✓ | ✓ (2-stage review) | · | · | ✓✓ (3-way) | ✓ | ✓ | ✓ |
| Screenshot/visual verification | ✓ (design-review) | · | · | · | ✓ (visual-verdict) | ▒ | · | · |
| Retro / compounding reflection | ✓ (retro/learn) | · | ✓ (retro skill) | · | ▒ | ✓✓ (Compound) | ▒ | · |
| Scope-mode negotiation | ✓✓ (4 modes) | · | · | · | · | ▒ | ▒ | · |

### C. Where you find "best in class" for each capability

| Capability | Best-in-class repo | Why |
|---|---|---|
| Wave-based parallel execution | **GSD** | Dependency graph analysis is core; no rival |
| Context rot prevention | **GSD** + **planning-with-files** | Fresh-context discipline (GSD) + hook-driven recitation (PwF) |
| Anti-rationalization / hard gates | **superpowers** | Explicit tables with reality checks; HARD-GATE tags |
| Systematic debugging | **superpowers** | 4-phase, with "3 fixes fail → architecture" escalation |
| Socratic requirements | **oh-my-claudecode** | Ambiguity scoring with 20% gate is uniquely measurable |
| Product strategy | **pm-skills** | 12 strategy skills grounded in Cagan/Strategyzer |
| Ideation + reframing | **gstack** + **pm-skills** | /office-hours (reframe) + /brainstorm (multi-perspective) |
| Market validation | **pm-skills** | Only repo with OST, assumption mapping, JTBD as first-class |
| Security audit | **gstack (/cso)** | 15-phase including LLM-specific, supply chain, webhook |
| Multi-lens code review | **compound-engineering** | ~50 agents with specialized lenses |
| Deployment / release | *(green field)* | No repo is strong here — opportunity |
| Compounding learning | **compound-engineering** | Dedicated Compound phase + learnings-researcher agent |
| QA / browser testing | **gstack** | Persistent browser daemon with sub-100ms latency |
| State persistence convention | **GSD** (`.planning/`) | Most mature file format with XML frontmatter + traceability |
| Lifecycle hook infrastructure | **oh-my-claudecode** | 17 hooks across 7 events — most granular |
| GTM / launch | **pm-skills** | Only repo covering beachhead, ICP, growth loops |

---

## Part 4: The Frankenstein Recommendation

### Design principle

*GSD is your engine room. Don't touch it.* Then add three adjacent layers — upstream (strategy), immune system (enforcement), and memory (compounding) — by grafting specific components, not merging whole repos.

### Architecture

```
┌────────────────────────────────────────────────────────────────┐
│   LAYER 5: COMPOUND (persistent institutional memory)          │
│   Source: compound-engineering + gstack                         │
│                                                                 │
│   • /retro (gstack — weekly reflection)                        │
│   • /learn (gstack — operational learnings → JSONL)            │
│   • learnings-researcher agent (compound-eng)                  │
│   • session-historian agent (compound-eng)                     │
│   • /compound phase that runs between SHIP and next project     │
│   • GSD's STATE.md as substrate                                │
└──────────────────────────────┬─────────────────────────────────┘
                               │ writes back into
┌──────────────────────────────▼─────────────────────────────────┐
│   LAYER 4: QUALITY DEPTH (the REVIEW phase — upgraded)         │
│   Source: compound-engineering + gstack + Agent Skills          │
│                                                                 │
│   • Multi-lens code review (compound-eng's ~50-agent pattern,   │
│     reduced to ~8 lenses: simplicity, correctness, maintainability,│
│     security, perf, API contract, coherence, framework style)   │
│   • /cso 14-phase security audit (gstack — REPLACES Agent       │
│     Skills' security-and-hardening)                             │
│   • visual-verdict / design-review (gstack + OMC)               │
│   • Keep Agent Skills: code-simplification, performance-opt     │
└──────────────────────────────┬─────────────────────────────────┘
                               │ enforces via
┌──────────────────────────────▼─────────────────────────────────┐
│   LAYER 3: IMMUNE SYSTEM (enforcement — made explicit)         │
│   Source: superpowers + GSD + gstack                            │
│                                                                 │
│   • Anti-rationalization tables at every gate (superpowers)    │
│   • HARD-GATE pattern — code literally can't proceed (superpowers)│
│   • 4-phase systematic-debugging skill (superpowers)            │
│   • Goal-backward verification (GSD)                            │
│   • 8-dimension plan validation (GSD)                          │
│   • Nyquist test-coverage (GSD)                                │
│   • /freeze + /careful protection (gstack)                      │
└──────────────────────────────┬─────────────────────────────────┘
                               │ runs on top of
┌──────────────────────────────▼─────────────────────────────────┐
│   LAYER 2: ENGINE ROOM (orchestration — keep GSD as-is)        │
│   Source: GSD                                                   │
│                                                                 │
│   • Wave-based parallel execution                               │
│   • Fresh context windows per atomic task                       │
│   • .planning/ file-based state                                │
│   • 21 specialized agents                                       │
│   • Context monitoring (35% warn / 25% critical)                │
│   • gsd-tools.cjs CLI layer                                    │
│   Optional graft: planning-with-files' hook-driven re-read       │
│   pattern as a context discipline booster (2-Action Rule)       │
└──────────────────────────────┬─────────────────────────────────┘
                               │ fed by
┌──────────────────────────────▼─────────────────────────────────┐
│   LAYER 1: STRATEGY / UPSTREAM (the biggest gap to fill)       │
│   Source: pm-skills + gstack + oh-my-claudecode                 │
│                                                                 │
│   • /sig:ideate — brainstorm-ideas-new (pm-skills) + /office-   │
│     hours (gstack) in combination                               │
│   • /sig:validate — OST, assumption-mapping, interview-script,  │
│     prioritize-assumptions (pm-skills)                          │
│   • /sig:strategize — Lean Canvas, BMC, VPD, product-vision,     │
│     beachhead-segment, ICP (pm-skills)                          │
│   • /sig:spec — deep-interview with 20% ambiguity gate (OMC)    │
│     + GSD's gsd-spec-phase Socratic refinement                  │
│   • Output: validated PROJECT.md + REQUIREMENTS.md that feed    │
│     into GSD's engine room                                      │
└─────────────────────────────────────────────────────────────────┘
```

### Signal's ten-phase flow (upgrade from your current six)

With `/sig:calibrate` sitting at Phase 0 as the router:

```
[Phase 0] /sig:calibrate ── writes .planning/PROFILE.md ─── routes ↓

IDEATE → VALIDATE → STRATEGIZE → SPEC → PLAN → EXECUTE → VERIFY → REVIEW → SHIP → COMPOUND
(/sig:   (/sig:    (/sig:       (/sig: (/sig: (/sig:   (/sig:   (/sig:  (/sig: (/sig:
 ideate)  validate) strategize)  spec)  plan)  execute) verify)  review) ship)  compound)
  │         │           │         │      │        │        │        │        │        │
  ▼         ▼           ▼         ▼      ▼        ▼        ▼        ▼        ▼        ▼
 Human    Human       Human     Human  Human    Human    Human    Human    Human    Human
 gate     gate        gate      gate   gate     gate     gate     gate     gate     gate

 └─────── new UPSTREAM ──────┘   └─────── GSD's existing engine ───────┘  └─ new ─┘
```

The first three phases (IDEATE, VALIDATE, STRATEGIZE) can collapse into a single `/sig:discover` command for established codebases — but exist as distinct phases for greenfield work where they each carry weight.

### What to keep, replace, and add vs. your current WIP

| Component | Current WIP plan | Frankenstein recommendation | Why |
|---|---|---|---|
| Engine | GSD | GSD (unchanged) | Best in class; don't touch |
| State | `.planning/` (GSD) | `.planning/` + PwF hook pattern | Better context discipline |
| Enforcement | "Anti-rationalization (shared)" | Superpowers skills + HARD-GATE tags as explicit module | You had it abstract; make it concrete |
| Discuss/Spec | Agent Skills idea-refine + spec-driven | **Add:** pm-skills `/discover` + `/strategy` + OMC `deep-interview` | Upstream gap is the #1 gap |
| Plan | GSD planner + Agent Skills task-breakdown | GSD planner (unchanged) + compound-eng 80/20 rule | pm-skills' task-breakdown is redundant with GSD |
| Execute | GSD executor + incremental-impl, TDD, context-eng | GSD executor + superpowers' TDD (replaces Agent Skills TDD) | Superpowers' TDD enforcement is stronger |
| Verify | GSD verifier + browser-testing + debugging | GSD verifier + superpowers' systematic-debugging + gstack's `/qa` browser daemon | gstack's browser is better than raw Agent Skills browser-testing |
| Review | Agent Skills: code-review, security, perf, simplification | **Replace security** with gstack's `/cso` (14-phase) + **add** compound-eng's multi-lens review pattern | Agent Skills security is weaker than gstack; adding lens pattern scales review quality |
| Ship | Agent Skills: git-workflow, ci-cd, docs, shipping-and-launch | Agent Skills kept + **add** pm-skills' `/plan-launch` GTM + gstack's `/canary` post-deploy | Your current plan is ship-mechanical; GTM+monitoring are missing |
| Compound | *(not in your plan)* | **NEW phase.** compound-eng's learnings-researcher + gstack's `/retro` + `/learn` | This is the biggest architectural add |

### Cuts from your current plan

1. **Don't bring in all 21 Agent Skills.** Audit them against the Frankenstein — many are redundant with GSD (incremental-impl, context-engineering) or weaker than alternatives (security-and-hardening). Estimate ~12 survive.
2. **Don't treat Superpowers as a philosophy overlay.** Architect its enforcement mechanisms (anti-rationalization tables, HARD-GATE) as first-class components. Otherwise they don't run.
3. **Don't skip the upstream phases.** If it's hard to scope, ship them as a separate `/discover` command that outputs to `.planning/PROJECT.md` — but don't defer them to "future phase."

### Additions beyond your current plan

1. **pm-skills integration** — the highest-leverage upstream add. Probably a selective port of ~15 skills (discovery, strategy, GTM) rather than all 65.
2. **gstack `/cso` security audit** — probably replaces Agent Skills' security-and-hardening entirely.
3. **compound-engineering Compound phase** — new phase, new agents.
4. **planning-with-files hook pattern** — a small, surgical graft to improve GSD's context discipline.
5. **Explicit HARD-GATE mechanism** — not just "anti-rationalization tables in references/"; a blocking gate implementation.

### Deletions / "don't duplicate"

- Don't port GSD agents whose job compound-eng does better (e.g., if you bring in compound-eng's multi-lens review, some GSD code-reviewer work overlaps).
- Don't port all 65 pm-skills — ~15 of them cover 80% of the upstream need.
- Don't port all 14 superpowers skills — you need ~4 (TDD, systematic-debugging, subagent-driven-dev pattern, anti-rationalization model). The rest overlap with GSD.

---

## Part 5: The Minimum Viable Frankenstein

If you wanted to ship the smallest useful version, here's what you'd include:

### Must-have (MVP v1)
- **Engine:** GSD (as-is)
- **Upstream:** 5 pm-skills (`/discover`, `/strategy`, VPD, assumption-map, interview-script) + OMC's deep-interview
- **Enforcement:** superpowers' 4 core skills (TDD, systematic-debugging, anti-rationalization doc, HARD-GATE mechanism)
- **Review depth:** compound-eng's multi-lens review (reduced to 6 lenses) + gstack's `/cso` + Agent Skills' code-simplification + performance-optimization
- **Ship:** existing GSD ship + Agent Skills' docs-and-adrs
- **Compound:** compound-eng's learnings-researcher + gstack's `/retro` & `/learn`

Total: ~8 upstream skills, GSD's 21 agents unchanged, ~8 review skills, 4 enforcement skills, 3 compound skills = manageable scope.

### Nice-to-have (v2)
- planning-with-files hook grafts
- gstack browser daemon
- Visual-verdict for UI projects
- pm-skills GTM suite (beachhead, ICP, growth loops, battlecards)
- Multi-runtime adapters

### Skip (noise, not signal)
- Don't port the 40+ skills in gstack that cover tooling gstack-specific infrastructure (browse, setup-*, pair-agent)
- Don't port pm-skills' resume review, NDA, privacy-policy skills — they're nice but off-core
- Don't port all 60 compound-eng agents — the lens pattern matters, not the exact agents

---

## Part 6: Strategic Decision Points

Before you code, you need to decide:

### 1. Is your Frankenstein one plugin, or a meta-plugin that installs others?

**One plugin:** Easier to ship, harder to maintain (you're copying others' work into your repo).

**Meta-plugin:** Tougher to architect, but you graft gstack's `/cso` by reference rather than by copy. Updates from upstream flow automatically. Legal/attribution is cleaner.

I'd recommend *meta-plugin for shared components, own code for the orchestration layer*. Your value-add is the integration architecture, not the individual skills.

### 2. How opinionated should the flow be?

**Prescriptive:** Every project goes through all 10 phases. High rigor, slower starts. Superpowers/gstack-style.

**Adaptive:** Skip phases based on project type (MVP spike vs. production app). Faster, looser. GSD's current approach.

Your consulting target (mid-market orgs) probably wants prescriptive for new projects, adaptive for existing. So you need a `/new-project` that runs all phases and a `/new-feature` that skips upstream.

### 3. What's the compounding substrate?

**Per-project:** `.planning/STATE.md` stays inside the repo. Simple. No cross-project learning.

**Per-org:** Separate learnings store (JSONL, vector DB, or markdown corpus) that all projects write to and read from. This is the true compound-engineering vision. More infrastructure, massively more leverage.

If you're building for your consultancy, per-org is the differentiator. It's also significantly more work.

### 4. Positioning / naming — LOCKED

Working name: **Signal** (market-facing: *SignalOS* if positioning earns it). Command prefix: `/sig:`. The frame is signal-vs-noise operating at every phase — vision, validation, spec, plan, code, test, review, ship, compound. Calibrate (Phase 0) is the tuning fork; the 10-phase flow keeps the station in tune end-to-end.

If asked for an acronym, the mnemonic version that names the architecture is **S**cope / **I**ntegrity / **G**uardrails — the three things the system enforces. Otherwise the word stands alone.

---

## Part 7: The Missing Layer — Rigor Calibration (Phase 0)

### The problem

Every framework in this analysis assumes every project deserves the same rigor. That assumption breaks on real-world variance. A marketing homepage and a production auth system don't deserve the same GSD-level planning — but GSD (and your WIP, and most of these repos) treats them identically.

The observed failure mode: spending 60+ minutes in GSD planning a static homepage, then being surprised by design output that's worse than a 15-minute direct prompt. Full rigor applied to the wrong problem actively *degrades* output, because planning overhead crowds out design iteration.

**Naming:** *Calibrate*, not *triage*. Triage is battlefield language (sort casualties to prevent death). Calibrate is instrument language (tune the receiver before detecting signal). Phase 0's job is tuning, not emergency stabilization — and it pairs cleanly with the Signal metaphor: calibrate the receiver so the rest of the system can amplify signal and suppress noise at every phase.

### The mental model — Stakes × Novelty

A 2×2 that determines which mode to run in:

```
                    STAKES (blast radius if wrong)
                           HIGH
                            │
           ┌────────────────┼────────────────┐
           │                │                │
           │   SPIKE MODE   │   FULL MODE    │
           │  (4–5 phases)  │  (10 phases)   │
           │                │                │
           │  Novel + risky │  Real product  │
           │  Heavy validate│  e.g. Conversor│
           │  Light verify  │  All guards on │
    NOVEL  │                │                │  FAMILIAR
   ────────┼────────────────┼────────────────┼────────
           │                │                │
           │  SKETCH MODE   │  FEATURE MODE  │
           │  (2–3 phases)  │  (5–6 phases)  │
           │                │                │
           │  Experiments   │  Add to known  │
           │  Throwaway     │  codebase      │
           │  e.g. landing  │  Skip upstream │
           │                │                │
           └────────────────┼────────────────┘
                            │
                           LOW
```

### The calibration mechanism — a Phase 0 before everything

A `/sig:calibrate` command (or baked into `/sig:new-project`) asks five diagnostic questions and writes a rigor profile to `.planning/PROFILE.md`:

1. **Scope** — Net-new system or modifying an existing one?
2. **Stakes** — Blast radius if it breaks? (no users → prototype → production → money/compliance)
3. **Novelty** — Well-understood problem with clear analogs, or new territory?
4. **Reversibility** — Bezos' two-way door test (reversible → less rigor required)
5. **Horizon** — Throwaway/demo or durable/production?

**Output (a state file every downstream command reads):**

```yaml
# .planning/PROFILE.md
tier: SKETCH              # SKETCH | FEATURE | SPIKE | FULL
stakes: low
novelty: familiar
reversible: yes
horizon: <1 week
phases_enabled:
  - ideate                # light variant
  - execute               # minimal gates
  - visual_check
phases_skipped:
  - validate
  - strategize
  - review
  - cso_security
  - compound
rigor_overrides:
  tdd_required: false
  security_audit: false
  nyquist_tests: false
  goal_backward_verification: false
escape_hatch: /sig:escalate   # upgrade mid-flight if scope grows
```

### Mode definitions

| Tier | When | Phases run | Rigor |
|---|---|---|---|
| **SKETCH** | Homepage, landing page, demo, throwaway, static content | Ideate → Execute → Visual Check | No TDD, no security, no review. Fast iteration, visual verdict only. |
| **FEATURE** | Adding to existing codebase, well-understood problem | Spec → Plan → Execute → Verify → Review → Ship | Full engineering rigor, skip upstream (problem already validated) |
| **SPIKE** | Novel problem with real stakes, early exploration | Ideate → Validate → Spec → Execute → Verify → Ship | Heavy front-end discovery, lighter back-end verification, time-boxed |
| **FULL** | Production app, real users, meaningful blast radius (Conversor-class) | All 10 phases | All guards on. GSD-level rigor end-to-end. |

### The critical architectural principle — phases don't get removed, they get gated

Skipped phases remain *available*. A `/sig:escalate` command can mid-flight promote a SKETCH to a FEATURE or FULL if scope grows. The profile is mutable; the project can evolve. This prevents the classic "cheap mode becomes technical debt" failure where you sketch something, it ships, becomes real, and there's no retroactive rigor.

### What this adds to the Signal flow

```
         ┌──────────────────────────────────────────────┐
         │  PHASE 0: CALIBRATE (/sig:calibrate)         │
         │  5 questions → .planning/PROFILE.md          │
         └──────────────┬───────────────────────────────┘
                        │
                        ▼
       10-phase flow runs in one of 4 modes
       (determined by PROFILE.md, re-readable/mutable)
```

Every phase command's first action becomes: *read PROFILE.md. If this phase is skipped in current tier, exit. If rigor_overrides apply, respect them.*

### Closest analogs in the landscape (none fully solve it)

| Repo | What it does | Why it's not the solution |
|---|---|---|
| GSD `gsd-spike` / `gsd-sketch` | Light-mode escape hatch commands | Requires operator to *already know* they want light mode. No classifier. Endpoint commands, not project-kickoff mode setters. |
| gstack `/plan-ceo-review` 4 modes | Expansion / Selective / Hold / Reduction | Runs at plan-review time inside a project, not at project start. Mode-pick for planning scope, not for project type. |
| OMC `deep-interview` 20% ambiguity gate | Measures spec clarity | Spec ambiguity ≠ project complexity. You can have a clear spec for a throwaway or a fuzzy spec for a mission-critical system. Orthogonal signals. |
| Agile t-shirt sizing | XS/S/M/L/XL per story | Sizes work, not project type or rigor profile. |

**The gap is real across the entire landscape, not just your WIP.** This is probably the single most differentiated addition you could make to what you're building.

### Why this matters strategically

For your consultancy, this is the feature that lets mid-market orgs actually *adopt* AI-assisted development safely. Without it, they face the choice of:

- Full rigor always → adoption fails because the simple stuff feels overbuilt
- Light touch always → the important stuff ships broken

Calibration is how Signal earns the right to prescribe rigor — by showing it knows when *not* to.

### Integration with existing layers

Calibrate sits above the 5-layer stack as a *routing layer*, not a new layer itself:

```
┌─────────────────────────────────────────────────────┐
│  PHASE 0 — CALIBRATE (/sig:calibrate, routing)      │
│  Sets PROFILE.md that all other layers read         │
└────────────────────┬────────────────────────────────┘
                     │ routes to
                     ▼
         ┌───────────────────────────┐
         │  Layers 1–5 (unchanged)   │
         │  Strategy → Engine →      │
         │  Immune → Review →        │
         │  Compound                 │
         │                           │
         │  Each layer reads PROFILE │
         │  and adapts its behavior  │
         └───────────────────────────┘
```

---

## Part 8: Sources & Attribution

All findings are sourced from direct inspection of the repos as of April 2026. Key files reviewed:
- gstack: `ETHOS.md`, `ARCHITECTURE.md`, `plan-ceo-review/SKILL.md.tmpl`, `cso/SKILL.md.tmpl`, `design-review/SKILL.md.tmpl`
- superpowers: `skills/test-driven-development/SKILL.md`, `skills/brainstorming/SKILL.md`, `skills/systematic-debugging/SKILL.md`, `skills/writing-plans/SKILL.md`, `hooks/session-start.sh`
- pm-skills: 8 plugin manifests + ~12 representative skill files
- planning-with-files: README, `reference.md` (Manus principles), benchmark methodology
- oh-my-claudecode: README, `hooks/hooks.json`, representative skill files (autopilot, deep-interview, ralph)
- compound-engineering-plugin: `README.md`, agent inventory, skill manifest
- GSD: `README.md`, command inventory, 21 agent definitions, `.planning/` schema

Licenses: MIT-compatible across the board for most (confirm gstack and compound-eng before merging code — they may have commercial restrictions).

---

## Next Steps

1. **Review this doc** — push back on any repo characterization or recommendation that feels off.
2. **Decide on the four strategic questions above** — meta-plugin vs. monolith, prescriptive vs. adaptive, per-project vs. per-org compounding, naming.
3. **Update PROJECT.md** to reflect the 10-phase flow (or keep 6 with collapsed upstream) and the new architectural layers.
4. **Start with the upstream phase first**, not Foundation. Why: you already have GSD's Foundation. Your differentiator is the upstream + compound layers. Prove those work before integrating.
5. **Token-budget check:** Before porting pm-skills + compound-eng skills, measure combined skill load for a typical project. This is the same risk you already flagged in PROJECT.md — now with more skills, higher stakes.

---

*End of analysis.*
