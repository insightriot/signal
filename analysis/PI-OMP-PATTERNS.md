# Pi / oh-my-pi — Borrowable Patterns for Signal

**Status:** Research note, not a committed plan. Captured 2026-05-31.
**Purpose:** Evaluate two well-reviewed coding harnesses — **Pi** and its fork **oh-my-pi (omp)** — for patterns Signal could adopt, focused on three areas: memory management, learning loops, and documentation/capability indexing & traversal.
**Audience:** A future contributor or agent session with **zero prior context**. This doc is written to stand alone.

---

## 0. Orientation (read this first if you have no context)

**What Signal is.** Signal (market name *SignalOS*) is a **Claude Code plugin** — a methodology layer that sits *on top of* the Claude Code runtime. It does not run its own agent loop; it ships slash commands (`/sig:*`), agents, and skills that orchestrate a 7-stage workflow:

```
/sig:calibrate → /sig:discuss → /sig:plan → /sig:execute → /sig:verify → /sig:review → /sig:ship
   (Phase 0: routes rigor by project tier)
```

Signal's state lives in plain files under `.planning/` (`PROFILE.md` = tier + rigor settings, `STATE.md` = authoritative progress in YAML frontmatter, `CONTEXT.md`, `PLAN`). Its distinctive idea is **calibration**: a Phase 0 router that asks 5 questions and writes `PROFILE.md`, so every downstream phase dials rigor up or down by tier (SKETCH / FEATURE / SPIKE / FULL). Its 21 quality skills are **loaded on-demand per phase** to protect the context budget — and the project's own notes flag *token budget as the single highest risk*.

**What Pi and oh-my-pi are.** Both are **standalone coding-agent harnesses** — full runtimes, not plugins.

- **Pi** (`earendil-works/pi`, a.k.a. `badlogic/pi-mono` by Mario Zechner): a clean, multi-provider agent harness. TypeScript/Bun monorepo (`packages/ai`, `packages/agent`, `packages/coding-agent`, `packages/tui`). MIT licensed. The minimal-correct reference for an agent loop, sessions, and compaction.
- **oh-my-pi / omp** (`can1357/oh-my-pi`): a "batteries-included" fork of Pi. Adds ~27k lines of Rust core, 32 built-in tools, 40+ providers, LSP/debugger integration, subagents, an autonomous memory system, and tool-discovery search. MIT licensed. This is where almost all the borrowable ideas live; Pi is mostly the substrate.

**The key framing — why this is borrowing, not porting.** Signal's existing integrations (GSD, Agent Skills) are the *same species* as Signal: Claude Code plugins whose organs can be transplanted directly. Pi/omp is a *different species* — a separate runtime in TS/Bun/Rust. **You cannot graft omp's code into Signal.** What you do instead is study its design and re-express the analogous trait in Signal's idiom: markdown commands, `.planning/` files, skills, and Claude Code hooks. Every recommendation below is a *pattern*, with a concrete sketch of how it would land in Signal's layer.

**Layer map:**

```
┌─────────────────────────────────────────────┐
│ Signal (methodology plugin)  ← we are here   │  commands, phases, calibration, gates
├─────────────────────────────────────────────┤
│ Claude Code (the runtime Signal rides on)    │  agent loop, tools, context, hooks
└─────────────────────────────────────────────┘

vs.

┌─────────────────────────────────────────────┐
│ oh-my-pi / Pi (a whole runtime by itself)    │  agent loop + tools + context + memory
└─────────────────────────────────────────────┘
```

Note also a strategic signal: omp ships `/review`, subagents, memory, and skill-discovery as **native runtime features**. Some of what Signal adds as a methodology layer is migrating *down* into harnesses. Not a threat (different layer, different runtime), but worth tracking as the ecosystem evolves.

---

## 1. The three patterns worth borrowing (ranked)

Ranking is by **fit × novelty** — how cleanly it maps onto something Signal already does, times how much new leverage it adds.

| # | Pattern (omp name) | What it gives Signal | Fit |
|---|---|---|---|
| 1 | **BM25 relevance-gated capability loading** (`search_tool_bm25`) | Upgrade per-phase skill loading from a static set to relevance-ranked retrieval. Directly attacks the #1 risk (token budget). | **Highest practical fit** |
| 2 | **Curated, project-scoped memory** (Autonomous Memory — `local` / `hindsight` / `mnemopi` backends) | A concrete blueprint for the planned v2 Compound/retro learning loop: curated, project-scoped, synthesized memory injected into future sessions. | **High (conceptual)** |
| 3 | **Just-in-time guardrail injection** (TTSR — time-traveling stream rules) | A lazier, finer-grained cousin of anti-rationalization tables / the planned `<HARD-GATE>`: inject the *specific* correction only at the moment of violation. | **High (principle)** |
| — | **`/review` P0–P3 verdict rubric** (honorable mention) | A clean output-format upgrade for `/sig:review`. | Easy drop-in |

What to **skip**: omp's uniform `://` addressing (`pr://`, `skill://`, `memory://`) and tree-sitter "summarized reads." Elegant, but they are tool-API design choices for a harness that *builds tools*. Signal isn't that layer.

---

## 2. Pattern 1 — Relevance-gated capability loading (`search_tool_bm25`)

### What omp does
omp has 32 built-in tools but does not put them all in the model's context. Non-essential tools are kept **hidden but indexed** (`loadMode: "discoverable"`); only essentials load by default (`read`, `bash`, `edit`). When the agent needs something else, it calls `search_tool_bm25(query, limit=8)`, which:

1. Tokenizes the query (NFKD-normalize, split camelCase/acronym/digit boundaries, lowercase).
2. Scores every hidden tool with **BM25+** against a weighted document built from each tool's metadata.
3. **Activates** the top matches into the live session tool set (selections accumulate across calls), so the tool becomes callable *before the next model turn in the same conversation*.

Mechanics worth copying:
- **Field weights** (what makes a tool "match"): `name` ×6, `label` ×4, `mcpToolName` ×4, `serverName` ×2, `summary` ×2, each `schemaKey` ×1.
- **BM25+ params:** `k1=1.2`, `b=0.75`, `delta=1.0`.
- **Summary fallback:** first 200 chars of the description when no explicit summary exists.
- **Discovery modes:** `"all"` (built-ins + MCP tools), `"mcp-only"`, or `"off"`.
- **Cache invalidation:** the discoverable index is rebuilt when newly activated tools change the hidden corpus.

Source files (omp): `packages/coding-agent/src/tools/search-tool-bm25.ts`, `packages/coding-agent/src/tool-discovery/tool-index.ts` (the index + BM25), `packages/coding-agent/src/session/agent-session.ts` (corpus assembly, activation, invalidation), `packages/coding-agent/src/sdk.ts` (initial hiding of non-essential tools).

### Why it matters for Signal
This is the **generalization of something Signal already does**. Signal loads its 21 skills **on-demand per phase** — but the gate is *static*: each phase loads its fixed bundle. omp gates by *semantic relevance to the actual task*. Signal's own docs name token budget as the highest risk; relevance ranking is the lever that lets you carry fewer skills per turn without losing coverage.

### How it would land in Signal
- **Build a skill index.** A manifest (e.g. `references/skill-index.json` or generated at install) holding each skill's `name`, phase binding, a short `summary`, and keyword tags. This is the corpus.
- **Add a selection step inside phase commands.** When a phase command runs, it already reads `PROFILE.md`. Extend it to also read the current task/slice description (from `STATE.md` / `PLAN`) and select skills by **phase-gate ∩ relevance-rank**, not the whole phase bundle. Even a simple keyword/BM25 match over skill summaries beats loading everything.
- **Hybrid gating is the recommended design:** phase narrows the candidate set; relevance ranks within it. Tier can cap how many skills load (SKETCH loads 1–2; FULL loads more).
- You don't need a runtime to do this. A `/sig:*` command is a prompt; it can be told "here is the skill index; given this task, load only the top-N relevant skills for this phase."

### Open decisions
- Pure relevance vs. phase-gate + relevance hybrid → **recommend hybrid.**
- Where the index lives and how it's kept in sync with `skills/` (generate on install vs. checked-in file).
- Whether tier (`PROFILE.md`) sets the `limit` (top-N) per phase.

---

## 3. Pattern 2 — Two-phase extract→consolidate memory (the learning loop)

omp ships **two memory designs across three configurable backends** (`memory.backend` = `off` | `local` | `hindsight` | `mnemopi`; default `off`). Understand both designs; Signal should borrow the *shape* of the simpler one.

- **Design A — background summary pipeline** (the `local` backend). Extracts and consolidates *after the fact*, writes plain markdown. Closest to Signal's file-based model.
- **Design B — live agent-curated memory bank** (the `hindsight` and `mnemopi` backends). The agent writes/reads memory *during* the run via tools; needs embeddings + a store.

### 3a. Local summary backend (simpler — closest to Signal's file-based ethos)
Off by default; enabled with `memory.backend: local`. A background pipeline runs at session start (skipped for subagents and non-persisted sessions):

- **Phase 1 — per-session extraction.** For each *changed* past session, a model (role `default`) reads the session history and extracts **durable signal**: technical decisions, constraints, resolved failures, recurring workflows. Sessions too recent, too old, or active are skipped (caps: `maxRolloutAgeDays=30`, `minRolloutIdleHours=12`, `maxRolloutsPerStartup=64`). Output: a raw memory block + a short synopsis per session.
- **Phase 2 — consolidation.** A second pass (role `smol`, cheaper) reads *all* per-session extractions and writes three artifacts to disk:
  - `MEMORY.md` — curated long-term memory document.
  - `memory_summary.md` — the compact text injected at session start (capped, `summaryInjectionTokenLimit=5000`).
  - `skills/<name>/SKILL.md` — generated, reusable procedural playbooks.
  - A **lease + heartbeat** prevents double-running across concurrent processes; stale generated skills are pruned; output is **secret-redacted** before write.

- **Injection + guardrails (copy these verbatim).** At session start the summary is injected as a **"Memory Guidance"** block instructing the agent to:
  - Treat memory as **heuristic context**, *not authoritative* on current repo state.
  - **Cite the memory artifact path** when memory changes the plan, and pair it with current-repo evidence before acting.
  - **Prefer repo state and user instruction** when they conflict with memory; treat conflicting memory as **stale**.
- **Read-back:** the `read` tool resolves `memory://root` (compact summary), `memory://root/MEMORY.md` (full), `memory://root/skills/<name>/SKILL.md`.
- **Control:** a `/memory` command with `view | stats | diagnose | clear/reset | enqueue/rebuild`.

Source files (omp): `packages/coding-agent/src/memories/index.ts` (orchestration, injection, slash command), `packages/coding-agent/src/memories/storage.ts` (SQLite job queue + thread registry), `packages/coding-agent/src/prompts/memories/*.md` (extraction/consolidation/injection prompt templates), `packages/coding-agent/src/internal-urls/memory-protocol.ts`.

### 3b. Live agent-curated banks — Hindsight & Mnemopi (heavier; probably *not* for Signal v1)
Two backends expose the *same three tools*; the agent curates memory while it works:
- `retain(items: [{content, context?}])` — store durable, **self-contained** facts. Writes are **queued and batched** (Hindsight flushes at 16 items or a 5s debounce; Mnemopi writes to local SQLite). Each fact gets an `importance` score, a `memoryType` (`fact` vs `episode`), and `source`/provenance metadata.
- `recall(query)` — raw retrieval of stored memories.
- `reflect(query, context?)` — Hindsight returns a server-**synthesized** prose answer over the bank; Mnemopi returns formatted recall hits ("Based on recalled memories: …"). Read-only.

The two backends differ only in *where* memory lives:
- **`hindsight`** — a remote HTTP memory server (banks addressed as `/v1/default/banks/{bank_id}`). Storage is server-side.
- **`mnemopi`** — fully local SQLite under the agent's memory dir, with optional embedding/extraction providers. No network.

Both need embeddings + a store, which clashes with Signal's "plain files in `.planning/`" model. Note them for later; don't build them first.

### 3c. Borrowable sub-ideas regardless of backend (these are cheap and high-value)
- **Seeded memory categories ("mental models").** Hindsight ships built-in seeds — `user-preferences`, `project-conventions`, `project-decisions` — so memory starts with *named buckets* instead of an empty blob, and injects a `<mental_models>` block into the prompt. **Signal analog:** give `.planning/MEMORY.md` fixed sections (Decisions / Conventions / Pitfalls / Preferences) so the retro step fills a known structure.
- **Auto-retain on a cadence.** Memory isn't only written on demand — it's captured automatically every N completed turns (Hindsight default every 3, Mnemopi every 4, with turn overlap). **Signal analog:** a checkpoint/`STATE.md` write or a lightweight learning-capture at phase-gate boundaries, not just at `/sig:ship`.
- **Project scoping modes.** `global` / `per-project` / `per-project-tagged`. **Signal analog:** memory lives in the project's `.planning/`, with an optional shared/global layer for cross-project conventions.
- **The heuristic-not-authoritative guardrail** (from 3a) — the single most reusable artifact; copy it whatever backend you choose.

### Why it matters for Signal
This is a **working blueprint for Signal's planned v2 work** — the gstack retro/learn loop and the compound-engineering Compound (post-ship) memory phase. The two-phase shape (extract durable signal per unit of work → consolidate into a curated, capped, injectable summary) is exactly what a learning loop needs, and the **guardrail prompt** solves the hardest part: keeping accumulated memory from overriding current reality.

### How it would land in Signal
- **A retro/compound step writes memory as `.planning/` artifacts.** At `/sig:ship` (or a dedicated `/sig:retro`), extract durable learnings from the session and `.planning/` state into:
  - `.planning/MEMORY.md` — curated long-term memory (decisions, pitfalls, recurring workflows).
  - `.planning/MEMORY-SUMMARY.md` — compact, token-capped, injectable.
- **`/sig:calibrate` and `/sig:discuss` read the summary at the start** of the next cycle and surface it as a "Memory Guidance" block.
- **Adopt the guardrail prompt verbatim:** heuristic-not-authoritative, cite-the-artifact-path, prefer-repo-state, treat-conflicts-as-stale. This is the single most reusable piece.
- **Keep it curated and synthesized — never raw transcript dumps.** Project-scoped by living in that project's `.planning/`.
- Mirror the safety details: cap the injected summary's size; redact secrets before writing.

### Open decisions
- **Backend shape: local-summary style (curated markdown, no embeddings) vs. Mnemosyne (vector store).** Recommend **local-summary style for the first version** — it fits Signal's file-based model and needs no infra. Revisit vectors only if recall quality demands it.
- Trigger cadence: every `/sig:ship`, or a manual `/sig:retro`, or both.
- How memory interacts with calibration: does prior memory pre-fill `PROFILE.md` answers? (Tempting, but respect the "stale unless confirmed" guardrail.)

---

## 4. Pattern 3 — Just-in-time guardrail injection (TTSR)

### What omp does (verified from the lifecycle doc)
**TTSR = time-traveling stream rules.** Rules sit *dormant* and cost nothing until the model goes off-script. A rule is a small object with a `condition` (one or more regexes), a `scope` (which streams to watch: assistant `text`, `thinking`, or `toolcall`), optional `globs` (only fire when a matching file path is in play), a `repeatMode` (`once`, or `after-gap` with a `repeatGap` measured in turns), and an `interruptMode`. At session start rules are loaded and bucketed (`alwaysApply` vs `rulebook`); built-in defaults and a `disabledRules` list are honored.

There are **two firing paths**, and the distinction is what matters for Signal:

1. **Interrupting path (the headline trick).** When matched output should be stopped, omp **aborts generation mid-token**, optionally **discards the partial output** (`contextMode: "discard"` vs `"keep"`), injects the rule as a `<system-interrupt reason="rule_violation" rule="…">` block, and **retries from the same point** (~50ms later via `agent.continue()`). This needs control of the token stream — a *runtime-only* power.
2. **Non-interrupting path (the replicable one).** No abort. For a **tool-source** match, when the offending tool produces its result, an `afterToolCall` hook **prepends a `<system-reminder reason="rule_violation">` block to the tool's result content**. For a prose match, a hidden reminder is injected *after* the assistant message completes.

Injected-rule state is **persisted and restored across resume/compaction** (`ttsr_injection` entries), so a fired rule stays fired and doesn't nag every turn. Worked example: the agent starts to write `Box::leak`; a `box-leak` rule fires and injects "Don't reach for Box::leak in production code paths"; the agent course-corrects to `Arc<str>`.

Related: omp **inherits rules other tools already wrote** — it reads rules/skills/MCP config from `.claude`, `.cursor`, `.windsurf`, `.gemini`, `.codex`, `.cline`, `.github/copilot`, `.vscode` with no migration step.

Source/refs (omp): `docs/ttsr-injection-lifecycle.md`, `docs/rulebook-matching-pipeline.md`, templates `prompts/system/ttsr-interrupt.md` + `ttsr-tool-reminder.md`, example rule `.omp/rules/ts-hook-fetch.md`.

### Why it matters for Signal
Signal enforces quality with **anti-rationalization tables** loaded with each phase's skills, and plans to adopt superpowers' `<HARD-GATE>` and planning-with-files' hook-driven context discipline. TTSR is the same family but **lazier and finer-grained**: instead of front-loading a whole skill to prevent a mistake, inject the *one specific guardrail* exactly when the model is about to make it. That is precisely the token-budget-friendly enforcement Signal wants.

### How it would land in Signal
- **Signal can faithfully replicate the *non-interrupting* path.** Claude Code's `PreToolUse` / `PostToolUse` hooks fire around tool calls and can inject context — which is *exactly* omp's tool-source path (match → prepend a `<system-reminder>` to the tool result / block the action). So this is not a watered-down approximation; it's the same mechanism at the same layer.
- **The *interrupting* (mid-token rewind) path is out of reach** — that needs control of the token stream, which only the runtime has. Note this gap honestly, but it's the smaller half of TTSR's value.
- **Implement as a rulebook + a hook.** A set of markdown rule files (à la `.omp/rules/*.md`), each with: `condition` (trigger pattern), `correction` (reminder text), optional `globs` (path gate), `repeatMode` (`once` / `after-gap`), and severity (warn vs block → maps to soft gate vs `<HARD-GATE>`). A hook matches agent actions against conditions and injects the matching correction.
- **Persist fired-rule state** so a guardrail doesn't re-fire every turn — Signal already has `STATE.md`; an `injected_rules` list there mirrors omp's `ttsr_injection` persistence and survives `/sig:resume`.
- **Make the rulebook tier-aware:** `PROFILE.md` decides which rules are armed (SKETCH arms few; FULL arms many), echoing calibration.
- Consider the "inherit existing rules" idea: read rules already present in `.claude/` so teams don't re-author guardrails.

### Open decisions
- Hook events to use, and whether a rule can *block* an action vs. only *warn* (maps to soft gate vs. `<HARD-GATE>`).
- Rule file schema (trigger type: regex vs. semantic; correction text; severity; tier-arming).
- Overlap with anti-rationalization tables — is TTSR a *replacement*, a *complement*, or the *delivery mechanism* for them?

---

## 5. Honorable mention — `/review` verdict rubric

omp's `/review` spawns dedicated reviewer **subagents** that sweep branches, single commits, or uncommitted work **in parallel**, and returns a **ship / no-ship verdict** with every issue ranked **P0–P3 and scored for confidence** (so you fix what blocks release first, and nothing important hides in a wall of prose). Ref: `.omp/commands/review-prs.md`.

**Signal fit:** Signal's REVIEW phase (its key addition over GSD's flow) could adopt this **output rubric** directly — a ship/no-ship verdict plus P0–P3 + confidence per issue. Low effort, immediately useful, and it sharpens the phase's deliverable. The parallel-reviewer-subagents idea is also compatible with Signal's existing agent-spawning model.

---

## 6. What NOT to borrow (and why)

- **Uniform `://` addressing** (`pr://`, `issue://`, `skill://`, `memory://`, `agent://<id>/field.path`): omp makes everything a filesystem-shaped path read through one `read`/`search`/`find` interface. Elegant simplification, but it's a *tool-API* design choice for a harness that owns its tools. Signal doesn't build the tool surface, so there's nothing to apply it to. (`memory://` is the one exception worth a nod — see Pattern 2 read-back.)
- **Summarized / tree-sitter structural reads** (`crates/pi-ast`): a runtime optimization for token-efficient file reading. Belongs to Claude Code's layer, not Signal's.
- **The full compaction subsystem** (`packages/agent/src/compaction/*` — pruning, branch-summarization, handoff generation): genuinely good context-management engineering, but it's the runtime's job. Signal's analog is its existing context monitoring (35% warn / 25% critical) plus `STATE.md` checkpointing, which already live at the right layer. *Two ideas worth stealing into Signal's resume story (E6 / `/sig:checkpoint` / `/sig:resume`), though:* (1) omp's **handoff document** — when context fills, it generates a structured handoff and starts a fresh session seeded with it; that is conceptually `/sig:checkpoint` → `/sig:resume`. (2) Its compaction **never prunes `skill` or `read` tool outputs** and tags summaries with `<read-files>`/`<modified-files>` — a good rule of thumb for what Signal's state should always preserve.
- **Mnemosyne vector store** (for now): see Pattern 2 — defer until a curated-markdown memory proves insufficient.

---

## 7. Suggested sequencing if these become features

1. **Pattern 1 (skill relevance loading)** — highest practical payoff, smallest blast radius, attacks the named #1 risk. Start here.
2. **Honorable mention (`/review` rubric)** — trivial, ships value immediately, no new infra.
3. **Pattern 2 (memory loop, local-summary style)** — the substance of the v2 Compound/retro vision; build after the v1 flow is stable and there are real sessions to learn from.
4. **Pattern 3 (TTSR-style guardrails via hooks)** — most design work and a known fidelity gap; do it once the rulebook concept is clear and hooks are already in play.

---

## 8. Provenance & licensing

**Licensing.** Both Pi and oh-my-pi are **MIT**. Borrowing *patterns and ideas* is unrestricted. If any text or code is copied verbatim (e.g. the memory-guardrail wording), attribute it. Signal's own rule — *respect both projects' licenses; integrate, don't reinvent* — applies.

**How this was researched (and its limits).** Sources read in full: both project READMEs; omp's full file tree (3,103 files); and the omp design docs `docs/memory.md`, `docs/tools/search_tool_bm25.md`, `docs/tools/retain.md`, `docs/tools/reflect.md`, `docs/ttsr-injection-lifecycle.md`, `docs/compaction.md`, and `docs/tools/task.md`. These ground feature **existence, naming, design, and key constants** with high confidence.

*Assumptions / not verified at line level:* the actual `.ts` source was not read (fetch timeouts during research) — descriptions are from the design docs, which are detailed but secondary. Naming has been checked against those docs: the advanced memory backends are **Hindsight** (remote) and **Mnemopi** (local SQLite); `local` is the summary-pipeline backend. (An earlier draft called the advanced backend "Mnemosyne" — that name is wrong and was corrected.) Default branch for both repos is `main`; pi is also published as `badlogic/pi-mono`.

**Reference repositories.**
- Pi: https://github.com/earendil-works/pi (a.k.a. https://github.com/badlogic/pi-mono)
- oh-my-pi: https://github.com/can1357/oh-my-pi
- omp memory design: https://github.com/can1357/oh-my-pi/blob/main/docs/memory.md
- omp tool-discovery: https://github.com/can1357/oh-my-pi/blob/main/docs/tools/search_tool_bm25.md
