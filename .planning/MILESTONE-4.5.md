# Milestone 4.5 — Release Hardening / Stranger-Adoption Readiness

**Goal:** Bridge from "v0.1.0 feature-complete" (M4 closed) to "real strangers can adopt this." Close the gaps that block word-of-mouth adoption — install-path bulletproofing, public-facing docs, vocabulary-friction reduction, and external validation — without expanding Signal's architectural surface.

**Estimated effort:** 5–10 focused days across 5 Epics. Each Epic ships as a v0.1.x minor release. Order is flexible; E1 (install-path) and E2 (`/sig:add`) are highest-leverage early.

**Blocked by:** M4 closed and v0.1.0 tagged (✓ 2026-05-12). Not blocked on usage data — these are known stranger-adoption gaps surfaced during M4.t19 follow-up conversation 2026-05-13.

**Done when:** A developer who has never seen Signal can (a) install it from the marketplace on a fresh machine, (b) read the README and understand within 2 minutes what it does and whether it's for them, (c) run `/sig:init` on an existing codebase and reach `/sig:ship` without consulting source files, and (d) capture new ideas via `/sig:add` without learning the vocabulary. At least 3 non-Signal users have completed this path with their feedback merged.

---

## Why a 4.5, not a 5 or a v2

Three reasons:

1. **M5 is locked as "v2 architectural ports"** per its own roadmap note — IDEATE/VALIDATE/STRATEGIZE/COMPOUND phases from pm-skills + gstack + compound-engineering. That's expansion, not hardening. Conflating release-hardening with v2 ports muddles both.
2. **Release hardening is patch/minor-release work, not architectural work.** README rewrites, CHANGELOG discipline, install verification, vocabulary-friction reduction — these are v0.1.x deliverables. Decimal numbering signals "between M4 and M5" without implying v2.
3. **The vocabulary lock landed in M4.t18** (Milestone / Epic / Phase / Wave / Task). Adding a "between" milestone exercises the new vocabulary's flexibility — and tests whether the locked terms hold up under a non-standard milestone shape. If 4.5 feels wrong, that's signal about vocabulary.

---

## Epics

Listed in suggested execution order. Each Epic is independently shippable as v0.1.x.

### Status snapshot (as of 2026-05-19)

| Epic | Status | Notes |
|---|---|---|
| E1 — Stranger-install path bulletproof | S1 shipped 2026-05-15 (v0.1.1); **S2 Phase A shipped 2026-05-19 (outcome a — Phase B not needed)**; S3–S5 pending | F2 resolved as outcome (a); R1 row of install-verification matrix complete. Remaining: S3 R2/R3/R5 rows + S4 versioning policy + S5 validator hardening. |
| E2 — `/sig:add` capture-and-route | S1 shipped 2026-05-14; S2–S5 pending | Hot path done; force-route flags + interview + hardening + plan-loop remain |
| E3 — Public-facing docs rewrite | pending | |
| E4 — Worked example + comparison page | pending | |
| E5 — External validation + launch | pending | Cannot finish until E1–E4 land |
| **E6 — Resume reliability (STATE.md schema + auto-update + `/sig:checkpoint`)** | **✓ shipped 2026-05-18 (v0.1.2)** | All 5 slices + S6 REVIEW loop-back (5 IMPORTANT findings resolved pre-publish). YAML-frontmatter STATE.md + auto-state-protocol + new `/sig:checkpoint` + staleness banner + orphan UI in `/sig:resume`. 225 → 366 tests; no new runtime deps. |
| **E7 — Synthesizer prose-quality + install-UX hardening** | **scaffolded 2026-05-19; not yet CALIBRATED** | Surfaced during M4.5.E1.S2 Phase A. Two findings: `/sig:init` synthesizer character-eating bug (6+ instances in one run) + 3 install-path UX papercuts requiring troubleshooting docs. See § E7 below + `docs/install-verification.md` R1. |

E2 plan + execute artifacts live in `M4.5.E2-{RESEARCH,PLAN,VALIDATION,PROGRESS}.md`. E6 artifacts live in `M4.5.E6-{RESEARCH,PLAN,VALIDATION,VERIFICATION,REVIEW}.md` (DISCUSS/PLAN/EXECUTE/VERIFY/REVIEW/SHIP all complete).

---

### M4.5.E1 — Stranger-install path bulletproof

The single highest-leverage Epic. If the install path is broken, every other Epic's value is gated.

- **F2 resolution** — verify Claude Code auto-registers Signal's agents post-marketplace-install. Three viable outcomes: (a) it does, document and close. (b) it doesn't but the documented fallback in `/sig:init` Step 2 holds, document the limitation and close. (c) it doesn't and the fallback is brittle — restructure agents to flat `agents/sig-<name>.md` layout. Sub-question open since v0.1.0 tag; resolution unblocks confident promotion.
- **Fresh-machine install protocol** — actual cold install on a Mac (and ideally Linux/WSL) box you've never touched. Document the exact command sequence that worked. Catches papercuts the M4.t19 fix didn't surface (e.g., does `signal` marketplace conflict with prior `signal` plugin slug for users who installed pre-rename? — turns out yes, requires `/plugin uninstall signal@signal` first; this kind of finding belongs in install docs).
- **Versioning & deprecation policy** — write the policy that would have made the `signal → sig` rename non-painful for users (semver-strict? breaking changes only at 0.X.0 minors with explicit upgrade notes? deprecation period before removal?). One-page doc; lives in `docs/versioning.md`. Future renames cite it.

**Exit:** F2 resolved, install protocol documented + verified on at least one fresh machine, versioning policy committed.

### M4.5.E2 — `/sig:add` capture-and-route command

Detail in FUTURE-IDEAS.md entry of same name (logged 2026-05-13). Summary: lowest-friction capture for new ideas, routes default to FUTURE-IDEAS.md with planning-phase promotion. Stranger-adoption value is high — newcomers shouldn't need vocabulary fluency to capture ideas.

**Sliced into 5 waves** during PLAN phase 2026-05-14 (full plan in `M4.5.E2-PLAN.md`):

- **S1 — hardened hot path [shipped 2026-05-14].** `/sig:add "idea"` → atomic write to FUTURE-IDEAS.md. Verbatim capture, sensitive-data scrub, lock-protected, atomic write with EXDEV fallback. 40 tests. `commands/add.md` + `tools/lib/add.js` + minimal fixture + validator/README/CLAUDE.md wiring.
- **S2 — force-route flags [pending].** `--question`, `--milestone`, `--milestone N`, `--file` flags. New `tools/lib/milestones.js` helper for milestone-file resolution.
- **S3 — cold-path interview + heuristic hints [pending].** Naked-invocation 1–3 question interview; heuristic single-key overrides for power users.
- **S4 — stranger-safety hardening [pending].** First-run onboarding warning, brownfield-detection enrichment, `gate_strictness` honoring, vocab-lint validator extension.
- **S5 — close the loop [pending].** `commands/plan.md` "review FUTURE-IDEAS" step so captured entries get reviewed at the next planning gate.

- Design routing interview (1–3 questions, adaptive). [S3]
- Implement capture-flow tooling in `tools/lib/` (reuse existing `readProfile`, `readState`, `readOpenQuestions` helpers). [S1 done; S2 adds milestones.js]
- Wire validator's `REQUIRED_COMMANDS` [S1 done], `plugin.json` commands list (auto-discovered — no change needed), README [S1 done], decision-tree viewer (`docs/map/index.html`) [defer; viewer is calibration-focused], MCP/skill descriptions [defer until cross-skill changes].
- Tests: fixture-driven, verify each routing destination receives a well-formed entry. [S1: FUTURE-IDEAS destination covered with 40 tests; S2–S5 expand]

**Exit:** `/sig:add` shipped, all 5 routing destinations (FUTURE-IDEAS / OPEN-QUESTIONS / current MILESTONE / other MILESTONE / new MILESTONE scaffold) demonstrated working, anti-rationalization gates from the FUTURE-IDEAS entry honored.

### M4.5.E3 — Public-facing documentation rewrite

Current top-level docs read as internal architecture notes. Strangers need a pitch + quickstart, not a planning archive.

- **README rewrite as pitch.** Top of README: one-sentence what-it-is, a 30-second animated GIF or screen recording showing `/sig:init` → `/sig:status`, copy-paste install, first command to run. Move existing architecture content below a fold or into `docs/architecture.md`.
- **CHANGELOG.md** — establish the file with v0.1.0 entry (M4 close + signal→sig rename). Subsequent v0.1.x releases (each M4.5 Epic) append entries.
- **Requirements + compatibility matrix** — Node 22+, Claude Code version range, OS support (Mac confirmed; Linux/WSL pending E1's cross-platform install test).
- **CONTRIBUTING.md + SECURITY.md + issue templates** — signals to strangers that bug reports go somewhere.
- **Privacy/telemetry statement** — one section in README: "Signal makes no network calls beyond Claude's own API; all state lives in `.planning/` in your repo."

**Exit:** README opens with the pitch, CHANGELOG exists, compatibility documented, contribution/security paths visible, privacy statement explicit.

### M4.5.E4 — Worked example + comparison page

Strangers learn by seeing outputs and by understanding *why this, not the others*.

- **`examples/` directory** — pick a small public repo (e.g., a small Express app or Python CLI), run `/sig:init` on it, commit the resulting `.planning/` directory + a README explaining what was generated and why. Future Epics can add more examples (a Python project, a Rust project, a dormant repo).
- **Comparison/positioning page** — Signal vs. GSD vs. superpowers vs. Agent Skills vs. planning-with-files vs. compound-engineering. The 7-plugin landscape analysis in `analysis/REPO-ANALYSIS.md` is the raw material. Public-facing version focuses on *when to use Signal* (calibration router is the wedge) — not technical depth. ~60–80 lines, lives in `docs/vs.md`.

**Exit:** At least one worked example committed, comparison page published, both linked from README.

### M4.5.E5 — External validation + launch

Without external feedback, M4.5's earlier Epics are calibrated against a sample of one (the user).

- **Three friendly external testers** — not the author, not on the author's projects. Run `/sig:init` → `/sig:ship` on real work. Capture friction logs (where did they pause? what was confusing? what failed?). Friction logs become v0.1.(N+1) backlog.
- **Launch post** — short, ~600–800 words. Lead with the 7-plugin landscape analysis (genuinely original content) → Signal as the synthesis + calibration router. Distribution channels TBD; minimum bar is a GitHub release announcement linking to the post.
- **v0.1.x → v0.2.0 decision point** — after external feedback merges, evaluate: is v0.2.0 warranted (cumulative changes), or stay on v0.1.x until M5 work begins? Versioning policy from E1 governs this call.

**Exit:** 3 external tester reports captured, launch post published, version bump decision made + tagged.

### M4.5.E6 — Resume reliability (STATE.md schema + auto-update protocol + `/sig:checkpoint`)

**Critical — ships next.** `/sig:resume`'s briefing contract depends on `STATE.md` + `CONTEXT.md` + phase artifacts being current — but today only `/sig:discuss` and `/sig:ship` document state updates. `plan.md` / `execute.md` / `verify.md` / `review.md` don't, the `executor` agent has no state-mutation step in its 6-step process (just commits + returns), and `STATE.md`'s schema is too coarse (`current_phase` / `completed_phases` / `blockers` / `last_updated`) to record where-inside-a-phase you actually are. Result: after a context clear mid-EXECUTE, `/sig:resume` cannot meaningfully re-orient. A real user (the author, on a different Signal-managed project) hit this 2026-05-16; gap was previously flagged in FUTURE-IDEAS.md lines 100/102 but deferred.

**Scope-tension flag (read this).** This milestone's Notes section says "No new architectural surface — does not change PROFILE.md schema." E6 extends `STATE.md`'s schema (not `PROFILE.md`'s) and adds one meta-command (`/sig:checkpoint`). I am treating this as hardening of an existing contract — `/sig:resume` is broken-by-default for any work that spans a context clear, which is day-one stranger territory — rather than net-new feature work. If that reading is wrong, demote to M5.E0 instead.

**Five-slice plan (refined in DISCUSS/PLAN):**

- **S1 — `STATE.md` schema extension + `tools/lib/state.js` helpers + migration.** New fields: `current_epic`, `current_wave`, `current_task` (with commit hash + status), `last_decision_at`, structured in-flight `blockers` list. Helpers: `setCurrentTask`, `clearCurrentTask`, `addBlocker`, `clearBlocker`, `appendDecision`, `markStale`. Backwards-compatible reader; first write to a pre-S1 STATE.md auto-extends the file with sensible defaults (including Signal's own `.planning/STATE.md`).
- **S2 — `/sig:checkpoint` command (manual force-refresh, kept post-S3/S4 as peace-of-mind knob).** Thin meta-command — same class as `/sig:status` / `/sig:resume` / `/sig:add`. Reads git log since `last_updated`, diffs against `{phase}-PROGRESS.md`, refreshes `STATE.md`, prompts user "any decisions to lock?" → `CONTEXT.md`, "any new open questions?" → `OPEN-QUESTIONS.md`. Prints "Checkpoint saved at {date} — safe to clear context." Idempotent (safe to run twice in a row).
- **S3 — Patch `executor` agent + `execute.md` orchestrator.** Executor: call `setCurrentTask` at start, `clearCurrentTask` + record commit hash at end. Orchestrator: refresh STATE.md at wave boundaries; offer to `appendDecision` if the wave surfaced a new locked decision; ensure orchestrator-level update runs even if individual executor crashes (resilience matters for the recovery use-case).
- **S4 — Patch `verify.md` + `review.md` + add `/sig:resume` staleness check.** Both phases write STATE.md update after their report. `/sig:resume`: compare `STATE.md.last_updated` against `git log -1 --format=%ct -- .planning/`; if commits are newer, prepend `⚠ STATE.md may be stale — N commit(s) since last update. Consider running /sig:checkpoint first.` to the briefing (does not block — surfaces drift).
- **S5 — Tier-aware behavior + validator + docs + tests.** SKETCH opts out of auto-protocol (manual `/sig:checkpoint` still available). FEATURE/FULL on by default. `gate_strictness: strict` treats state-update failure as a phase-gate failure. Validator: `REQUIRED_COMMANDS += commands/checkpoint.md`. README: `/sig:checkpoint` callout + state-hygiene section. CLAUDE.md: 13 → 14 commands. Tests: per-helper units + end-to-end "context-clear then resume" scenario using a fixture project that runs a fake EXECUTE wave and verifies the resulting briefing.

**Acceptance criteria (high level — refined in PLAN):**

1. After any wave boundary in EXECUTE, `/sig:resume` reports current wave + current task without manual STATE.md edits.
2. After a simulated context clear mid-EXECUTE, `/sig:resume` renders a briefing that includes both the last completed task (with commit hash) and the in-flight task (if any).
3. `/sig:checkpoint` is callable from any post-CALIBRATE state, never errors on a calibrated project, and is idempotent.
4. New `STATE.md` schema is backwards-compatible: reading a pre-S1 STATE.md does not crash; first write auto-upgrades and preserves existing data.
5. `/sig:resume` warns when `STATE.md.last_updated` is older than the most recent `.planning/` commit.
6. SKETCH tier skips the auto-protocol but retains the manual command. FEATURE/FULL run the auto-protocol; `strict` gates on update failure.
7. Existing 225 tests stay green; new tests cover all helpers + the end-to-end context-clear scenario.
8. The Epic dogfoods itself: at least one real context-clear during E6's own EXECUTE phase produces an accurate `/sig:resume` briefing.

**Exit:** All 5 slices shipped; the dogfood criterion (#8) demonstrated; release notes call out the schema migration; FUTURE-IDEAS.md entries at lines 100/102 updated to point at this Epic as resolution.

### M4.5.E7 — Synthesizer prose-quality + install-UX hardening

Surfaced during M4.5.E1.S2 Phase A on 2026-05-19. Two distinct findings that do not fit E1's "install path" scope but each block "stranger-ready" quality. Full evidence in `docs/install-verification.md` § R1.

**Why a new Epic rather than slotting into E1.** E1 owns marketplace install + agent registration + fresh-machine verification. The synthesizer bug is a `/sig:init` prose-generation defect (different domain); the install-UX papercuts are Claude Code-side behaviors that Signal can only mitigate via troubleshooting docs (also a different domain than "make install work"). Stretching E1 to absorb both would dilute its identity. E7 keeps the closure: E1 ships the install path; E7 ships the polish around the install path's edges.

**Finding 1 — `/sig:init` synthesizer character-eating bug.**

LANDSCAPE.md and PROJECT.md outputs show systematic character drops. At least 6 confirmed instances in a single dogfood run on `expressjs/express` (2026-05-19):

- `## Ierred goals & uncertainties` (should be `## Inferred goals & uncertainties`)
- `## ints` (should be `## Constraints`)
- `is | Top-level entry (224 bytes)` (should be `index.js | Top-level entry (224 bytes)`)
- `--checkt/ test/acceptance/` (should be `--check-leaks test/ test/acceptance/`)
- Concatenated sentence boundary: `...not real cadence).git fetch --unshallow\`` (missing newline + backtick before remediation prose)
- Mid-sentence drop in PROJECT.md Notes: `Constraints (Team / contributoiteria.`

The pattern is **systematic**, not a paste artifact. Hypotheses to investigate:

- Regex with buggy lookahead/lookbehind eating the prior character at section transitions
- String-slicing offset error in synthesizer combining scanner outputs
- LLM prompt-boundary issue in the scanner-output → synthesizer handoff (synthesizer agent may be receiving truncated input)

**Finding 2 — Install-path UX papercuts** (Claude Code behaviors; Signal mitigates via docs).

Three failure modes documented in `docs/install-verification.md` § R1:

- **P1 — `/plugin install` short-circuits on stale `gitCommitSha`.** When `installed_plugins.json` shows matching `version` field, install exits "already at latest" even when `gitCommitSha` reveals the cached code is stale. Workaround: filesystem purge before reinstall.
- **P2 — `/plugin` UI has no uninstall verb.** The interactive menu only offers Disable; cache directory survives, which interacts badly with P1. Workaround: `rm -rf ~/.claude/plugins/cache/<marketplace>/` + manual edit of `installed_plugins.json` to remove dangling entry.
- **P3 — Disable state survives uninstall + reinstall.** Lives in `~/.claude/settings.json` under `enabledPlugins`; neither marketplace removal nor uninstall touches it. Workaround: manually remove the `<plugin>@<marketplace>` line from settings.json before reinstall.

**Scope:**

- **Synthesizer bug (highest priority).** Root-cause analysis on `tools/lib/landscape.js` + scanner-output parsing path. Add regression tests covering each of the 6 documented patterns + likely sibling cases (heading boundaries, table cells, sentence joins, fenced-code boundaries). Fix produces clean output on the Express dogfood replay.
- **Install troubleshooting docs.** Either expand the existing README "Troubleshooting install" section or create a dedicated `docs/install-troubleshooting.md` covering the 3 papercuts with copy-paste resolution commands. Prefer the dedicated doc — strangers benefit from a focused page that names each failure mode by symptom.
- **Optional — synthesizer output sanity check.** A validator pass or test that detects garbled output patterns (e.g., heading shorter than 4 chars after `## `, table row with single-character cell where a filename is expected). Probably impractical for arbitrary content but worth scoping.

**Exit:** Synthesizer regression tests green on all 6 documented patterns + the synthesizer rerun on Express produces clean output. `docs/install-troubleshooting.md` (or expanded README section) covers the 3 papercuts. CHANGELOG entry for the patch release.

**Estimated effort:** 1–2 focused days. Depends primarily on synthesizer bug root-cause complexity; troubleshooting docs are 1–2 hours.

**Not in scope (for E7 specifically):**

- Synthesizer **prompt** improvements (LANDSCAPE.md narrative quality, PROJECT.md inference quality) — these were validated as solid in the R1 run; not a fix. Defer to FUTURE-IDEAS if quality concerns emerge later.
- `/sig:init` agent-discovery convention reconciliation — defer to M4.5.E1.S5 validator hardening.
- The 26-vs-25 agent-count drift between CLAUDE.md docs and on-disk reality — defer to M4.5.E1.S5.

---

## Exit Criteria for Milestone 4.5

All 5 Epics shipped. At least 3 non-Signal users have run `/sig:init` through `/sig:ship` on real projects. Friction logs from those runs reviewed; resulting fixes either shipped or promoted to FUTURE-IDEAS / M5. README opens with a pitch a stranger can parse in 60 seconds. Install path verified on at least one fresh non-author machine.

## Notes

- **`/sig:add` (E2) likely lands first** despite being listed second. It's small, self-contained, and immediately useful for capturing the rest of M4.5's emergent work. F2 (E1) is technically harder but doesn't block other Epics from starting in parallel.
- **E5 (external testers) cannot finish until E1–E4 land** — strangers shouldn't be the ones discovering install-path bugs or README opacity.
- **No new architectural surface.** M4.5 explicitly does *not* add phase commands, new tier values, or change PROFILE.md schema. Anything that would do those things belongs in M5 or a new FUTURE-IDEAS entry.
- **Versioning discipline starts with this milestone.** Pre-M4.5, `signal → sig` shipped without a written deprecation policy. From M4.5.E1 onward, breaking changes follow the policy.
- **Numbering choice (4.5 vs. promoting to M5):** Decimal preserves M5's identity as "v2 architectural ports." If M4.5 grows beyond 5 Epics (and especially beyond release-hardening into new feature work), reconsider whether it should be renamed M5 with the current M5 becoming M6. Don't make that call until at least 3 Epics ship and the scope is concrete.

---

*Created 2026-05-13 in response to release-hardening / stranger-adoption gap surfaced during M4.t19 follow-up conversation. Expect rewrite as Epics ship and external feedback rolls in.*
