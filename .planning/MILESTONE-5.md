# Milestone 5 — Rundown v2 Integrations

> **Roadmap note (2026-04-26):** This was originally MILESTONE-4. It moved to MILESTONE-5 when `/sig:init` (brownfield onboarding) was promoted to MILESTONE-4 — see `.planning/DECISIONS.md` (2026-04-26 — "Roadmap reorder: brownfield onboarding promoted to MILESTONE-4"). The v2-ports work itself is unchanged; only its position in the queue moved.

**Goal:** Expand Signal from 6-phase v1 to the 10-phase architecture from `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`.

**Estimated effort:** Multi-week. Attempt one Epic at a time, ship, observe, iterate.

**Blocked by:** ~~Milestone 4 complete (brownfield onboarding shipped) + v1 shipping to actual users for at least a few weeks. Without usage signal, v2 additions are speculative.~~ **LIFTED 2026-07-15** — usage-signal gate cleared (4 non-Signal users onboarded, M4.5 closed). See DECISIONS 2026-07-15. Note: the re-audit still gates the *speculative* v2 feature ports; the eviction Epic (M5.E1, first-built) is independent of it.

**Note:** This file is directional, not prescriptive. Expect significant rewrite once v1 usage data rolls in and priorities clarify. Epics may be re-ordered based on user pain points, not the order listed here.

---

> **OVERRIDE (2026-07-15, expanded 2026-07-16):** first-*built* Epic is **`M5.E1` — Doc-runtime & memory hygiene** (the go-big doc-runtime flagship: canonical doc-model + STATE/FUTURE-IDEAS eviction + all-docs hygiene + living BACKLOG.md + an auto-sensing migrate command + a doc-layout upgrade stamp/banner), not the re-audit. `M5.E1` **folds in** the re-audit's one gating decision (the doc-index/traversal model, FR1) and records it as canonical; the re-audit is not dropped — it follows and still gates the *speculative* v2 feature ports (upstream phases, compound loop, framework ports), which no longer include the doc-runtime. Full spec: `M5.E1-REQUIREMENTS.md`. See DECISIONS 2026-07-16 (D-M5E1-1 … D-M5E1-6). The BR-8 note below stands for the re-audit's own (now feature-port-only) scope when it runs.

> **Opening move (locked 2026-07-04, BR-8):** M5's first Epic is the **landscape re-audit + roadmap refresh** — feature-parity audit across all inspiration repos → `SIGNAL-INTEGRATION-RUNDOWN-v2.md` with a *sequenced* Epic queue. Scope: `BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 2 + FUTURE-IDEAS "M5 opening move." The E1–E6 order below gets re-sequenced by that audit's output, and the memory/doc-runtime scope (BACKLOG-REVIEW Sprint 3, from the FUTURE-IDEAS memory-management entry) enters the queue then. See DECISIONS 2026-07-04. **A preview seed for this audit — the reflection scorecard + the "flagged-but-not-yet-queued" frontier the E1–E6 list is missing — is captured in `analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` (2026-07-13); the re-audit should verify it fresh and supersede it.**

## Epic status

The doc-runtime flagship (per the 2026-07-16 override) takes the early M5.E IDs. The
speculative v2-port candidates below are **unsequenced** — their pre-override `M5.E1–E6`
labels are **superseded** and will be assigned real IDs by the re-audit (BR-8). Read this
table, not the candidate headings, for what the IDs mean.

> **Sequencing pivot (2026-07-16):** E2 and E3 **swapped**. Live doc-bloat is blocking Brett across ~5 projects (`nextpass/.planning/STATE.md` at 529 KB is write-wedged — see `BUGS.md` B8), and the **migrate command** (FR6/FR7) is what un-sticks existing projects; the all-docs hygiene runtime + living BACKLOG.md (FR4/FR5) is prevention/maintenance that can follow. So the migrate command is pulled forward to **M5.E2** and the hygiene/backlog work moves to **M5.E3**. B8's cheap discoverability mitigation shipped standalone (`56593a2`); its full auto-remediation is now M5.E2's job.

| Epic | Status | Scope |
|---|---|---|
| **E1** | ✅ shipped 2026-07-16 | **Doc-runtime & memory hygiene** — canonical doc-model (FR1) + STATE/FUTURE-IDEAS eviction (FR2/FR3) + dogfood. Retro: [`M5.E1-RETROSPECTIVE.md`](M5.E1-RETROSPECTIVE.md). |
| **E2** | ✅ shipped 2026-07-18 (unreleased) | **Auto-sensing migrate command + doc-layout stamp/banner** (FR6, FR7) — *pulled forward*. `/sig:migrate-memory`: relocate-never-delete, dry-run-default, git-reversible, all 3 bloat vectors + archive-tree + FR7 stamp/hook/banner. Un-sticks live bloated projects (B8 auto-remediation; nextpass 546 KB→1.3 KB, 0 words dropped). REVIEW PASS-WITH-FIXES (3-specialist panel; SHIP-blocking rollback gap caught + fixed). ≈1071→1300 tests. Retro: [`M5.E2-RETROSPECTIVE.md`](M5.E2-RETROSPECTIVE.md). Landed on `main` unreleased — release batched with E3 (D-M5E2-6). |
| **E3** | ✅ **SHIPPED as v0.1.8** (2026-07-20, combined E1+E2+E3) | **All-docs hygiene runtime + living `BACKLOG.md` + append-log eviction** (FR4, FR5, +FR1/2/3/6) — *deferred from E2*, **folded into the release** (D-M5E2-6): the doc-runtime ships as ONE `0.1.x` = E1+E2+E3. 7 slices / 5 waves at FULL/strict. Shipped: `ISSUES-INBOX.md` rename + `--bug` (FR1), auto-`/sig:index` + D-ID map (FR3), living `BACKLOG.md` + drain classify (FR2), all-docs hygiene guard (FR4), append-log evict-with-anchors (FR5), v2→v3 migrate + born-on-v3 + Curator retired (FR6). **Signal dogfooded to v3** (DECISIONS 178 KB→33 KB, 0 dropped). Stamp-null rollout fix (existing projects converge). 1300→**1492 tests** (through SHIP). VERIFY 28/28 ACs; REVIEW PASS-WITH-FIXES (3-specialist panel, 4 Important fixed in-phase); findings B18–B23. Retro: [`M5.E3-RETROSPECTIVE.md`](M5.E3-RETROSPECTIVE.md). **Released as v0.1.8 (2026-07-20).** |

**Release prep — ✅ DONE: the combined E1+E2+E3 doc-runtime shipped as v0.1.8 (2026-07-20).** Tag `v0.1.8` → release commit `b9fc456`; `plugin.json`/`marketplace.json` bumped + sha-pinned; CHANGELOG folded under `[0.1.8]`; README command-reference + CLAUDE.md refreshed; GitHub release live (Latest). All items below resolved:
- ~~(1) bump the **"N slash commands" count**~~ **✅ DONE (M5.E3 FR4/S3.t1 + S6b)** — the reconcile-before-guard fixed every current prose count against `roster.js`. **Note: the target was 15 → 17, not 16** — E3 added `/sig:index` (FR3) on top of E2's `/sig:migrate-memory`, so the roster is now **17 commands / 26 agents / 21 skills**. `CLAUDE.md:70` + `docs/map` reconciled; the FR4 hygiene guard enforces it on `main`.
- **(2) STILL OPEN — README § Command reference prose:** the README's command *list* still enumerates 15 commands (S3.t1 reconciled *counts*, not the prose roster). **Both `/sig:migrate-memory` AND `/sig:index` must be added to the README command reference before the tag** — prose authoring, out of FR4's count-reconcile scope (flagged in `M5.E3-PROGRESS.md`).
- **(3) tag-time:** bump `plugin.json` + tag + `marketplace.json` per the version rubric (the FR4 version-check skips `[Unreleased]`, green through the unreleased window, asserts once the tag cuts).
- **(4) tag-time:** fold the CHANGELOG `[Unreleased]` doc-runtime block under the cut version heading.
- **(5) doc-accuracy sweep (flagged during E3):** `CLAUDE.md` predates M5 (says M4.5 tester criterion "remains open" — MILESTONE-4.5.md says closed 2026-07-15; lists E1–E10 not E11; no M5). A CLAUDE.md refresh belongs to the release cut.

**M5.E3 DISCUSS pre-decisions (locked 2026-07-16, before the pivot — carry into E3's DISCUSS):**
1. **`INDEX.md` → fully auto-generated** by a Signal-native `/sig:index` generator; hand-curation retired (reverses the `curator-dormant-on-signal-planning` hand-curated stance — that memory + a DECISIONS entry get updated *when E3 implements it*, not before). One-line notes derived from each file (mechanism = E3 PLAN).
2. **Cleanup scan runs inside the test suite** (dead links / `[FILL IN]` stubs / roster+count drift across `docs/`, `README`, `CLAUDE.md`, `analysis/`); no new command — the `/sig:sweep` name stays reserved. Structural drift = hard test failure; soft findings = reported.
3. **Living `BACKLOG.md` = full switch:** build it as the single sequenced roadmap, migrate `BACKLOG-REVIEW-2026-07-04.md`'s content in, archive that snapshot with a pointer (move-never-delete). `FUTURE-IDEAS.md` stays the raw inbox.

## Candidate v2 feature-port scope (unsequenced — the re-audit assigns IDs)

*Pre-override labels retained for continuity only; the `M5.E1–E6` numbers below no longer bind (see the status table + override note above).*

### Upstream phases — IDEATE / VALIDATE / STRATEGIZE

From pm-skills + gstack + oh-my-claudecode.
- [ ] Port `/discover` workflow from pm-skills → split into `/sig:ideate` + `/sig:validate`
- [ ] Port `/strategy` workflow from pm-skills → `/sig:strategize`
- [ ] Port assumption-mapping (Impact × Risk) and Opportunity Solution Trees from pm-skills
- [ ] Port `/office-hours` reframing from gstack → integrate into `/sig:ideate`
- [ ] Port `deep-interview` with 20% ambiguity gate from oh-my-claudecode → integrate into `/sig:spec` (possibly renamed from `/sig:discuss`)
- [ ] Update tier-gating: these phases skip entirely in SKETCH, may skip in FEATURE

### COMPOUND phase (memory layer)

From compound-engineering + gstack.
- [ ] Port `/sig:compound` from compound-engineering's Compound phase
- [ ] Port `learnings-researcher` + `session-historian` agents
- [ ] Port `/retro` + `/learn` from gstack (weekly reflection + JSONL learning log)
- [ ] Integrate with `.planning/` so learnings carry forward between projects

### Security upgrade

- [ ] Replace Agent Skills' `security-and-hardening` skill with gstack's 15-phase `/cso` audit
- [ ] Verify full license attribution in `LICENSES.md`
- [ ] Update `/sig:review` to reference the new skill

### TDD & gate upgrades

From superpowers.
- [ ] Replace Agent Skills' TDD with superpowers' harder version (deletes pre-test code)
- [ ] Port `<HARD-GATE>` tag mechanism as an enforcement module that actually blocks progression
- [ ] Port `systematic-debugging` 4-phase skill
- [ ] Adopt superpowers' anti-rationalization table format across all existing phase gates

### Context discipline hooks

From planning-with-files.
- [ ] Graft the 2-Action Rule into the executor agent
- [ ] Add hook-driven `PROFILE.md` re-read on `PostToolUse` to prevent drift
- [ ] Implement findings-quarantine pattern for untrusted external data (web fetch, API responses)

### Multi-runtime adapters

- [ ] Cursor adapter layer
- [ ] Codex adapter layer
- [ ] Study superpowers' cross-platform session-start hook as reference

> **Effort read (2026-07-19):** Checked current Codex CLI docs — the Codex-adapter line item is no longer "build missing infrastructure." Codex now ships direct analogs for most of what Signal needs: `AGENTS.md` (≈ `CLAUDE.md`), Skills with `SKILL.md` + on-demand loading (≈ Signal's 21 skills), subagents with `sandbox_mode`/`mcp_servers`/`skills.config` (≈ Signal's 26 per-agent tool allowlists), and a hooks framework (flagged `codex_hooks`, newer/less proven than Claude Code's). Real gaps remain: Codex's Custom Prompts (the `/sig:*`-command analog) are deprecated in favor of skills, so the 17 commands need re-casting as skills rather than a straight port, and there's no `AskUserQuestion` equivalent (markdown fallback already anticipated in `references/question-patterns.md`). Rough call: ~6/10 effort — real multi-week translation plus end-to-end testing of the wave-based orchestration on the actual runtime, not the ~9/10 "reimplement missing primitives" job the framing above implied. Doesn't change sequencing — still gated behind the re-audit (BR-8) — just corrects the cost estimate for whenever it's picked up. Cursor's current capability set is unverified; re-check before estimating that line the same way.

---

## Exit Criteria

When the 10-phase architecture from `SIGNAL-INTEGRATION-RUNDOWN.md` is functional end-to-end on real projects.

## Notes

- **v2 must not break v1 for existing users.** Every change feature-flagged or opt-in until proven.
- **Attribution discipline:** each port adds the source repo's full license text to `LICENSES.md` per the "Planned Integrations (v2)" section. Move entries from "Planned" to "Ported" tier when work lands.
- **Re-evaluate priority.** Don't assume Epics ship in M5.E1 → M5.E6 order. Order should follow real user pain points from v1 usage.

## Captured via /sig:add

### Doc-lifecycle / eviction discipline — the

**Captured:** 2026-07-13 via `/sig:add`.

Doc-lifecycle / eviction discipline — the shared root of BOTH the STATE.md bloat and the FUTURE-IDEAS bloat. Both files grow without bound because content never LEAVES them; splitting docs by topic won't fix that, eviction will. One Sprint-3 (memory & doc-runtime) design, three parts: (1) Inbox->Backlog->Milestone lifecycle — a living BACKLOG.md (groomed, sequenced) that supersedes the dated BACKLOG-REVIEW-2026-07-04 snapshot; FUTURE-IDEAS stays the raw inbox; hygiene-vs-roadmap becomes a tag inside the backlog, not a new file. (2) Eviction step — shipped/promoted entries must EXIT FUTURE-IDEAS (fixes the ~42-candidate drain non-convergence documented in "Drain disposition-detector misses blockquote promotions", and the stale "✓ SHIPPED" entry still sitting inline at ~line 500). (3) STATE.md — the write-hook guardrail + evict-on-close already fully specced at "STATE.md append-without-evict" (HIGH PRIORITY); note that E10 shipped WITHOUT it, so it is now homeless. Timing: pull the STATE write-hook guardrail forward to a small v0.1.6 trust patch (it prevents the 455KB CMMC-dogfood failure at write time, and testers will run /sig:resume day one); the fuller lifecycle redesign belongs in Sprint 3 (gated on M5 usage signal). Also route bug-flavored "hygiene" items (drain blockquote, footer drift, /sig:add derived-title) to BUGS.md, which sits at 0 open and is underused — not to FUTURE-IDEAS. This entry deliberately consolidates and points back to existing entries rather than re-describing them, to avoid adding to the pile it is about.
