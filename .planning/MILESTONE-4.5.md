# Milestone 4.5 — Release Hardening / Stranger-Adoption Readiness

**Goal:** Bridge from "v0.1.0 feature-complete" (M4 closed) to "real strangers can adopt this." Close the gaps that block word-of-mouth adoption — install-path bulletproofing, public-facing docs, vocabulary-friction reduction, and external validation — without expanding Signal's architectural surface.

**Estimated effort:** 5–10 focused days across 5 Epics. Each Epic ships as a v0.1.x minor release. Order is flexible; E1 (install-path) and E2 (`/sig:add`) are highest-leverage early.

**Blocked by:** M4 closed and v0.1.0 tagged (✓ 2026-05-12). Not blocked on usage data — these are known stranger-adoption gaps surfaced during M4.t19 follow-up conversation 2026-05-13.

**Done when:** A developer who has never seen Signal can (a) install it from the marketplace on a fresh machine, (b) read the README and understand within 2 minutes what it does and whether it's for them, (c) run `/sig:init` on an existing codebase and reach `/sig:ship` without consulting source files, and (d) capture new ideas via `/sig:add` without learning the vocabulary. At least 3 non-Signal users have completed this path with their feedback merged.

> **Status (2026-06-06): build-complete.** All Epics shipped — E1, E6, E7, E3, E9, E8, E2 (→ v0.1.1/v0.1.2/v0.1.3) and E4 + E5 (→ v0.1.4, 2026-06-06, the repo's first GitHub Release). Done-when (a)–(d) are satisfied by shipped code/docs. The remaining clause — **"≥3 non-Signal users have completed this path with feedback merged"** — is **OPEN**: it depends on the outward tester loop (voice pass, recruit peers via `M4.5.E5-LAUNCH-KIT.md` §3), which is Brett's async work, not buildable. M4.5 formally closes when that feedback lands. **M5** (v2 ports) is the next build horizon and is not blocked by it.

---

## Why a 4.5, not a 5 or a v2

Three reasons:

1. **M5 is locked as "v2 architectural ports"** per its own roadmap note — IDEATE/VALIDATE/STRATEGIZE/COMPOUND phases from pm-skills + gstack + compound-engineering. That's expansion, not hardening. Conflating release-hardening with v2 ports muddles both.
2. **Release hardening is patch/minor-release work, not architectural work.** README rewrites, CHANGELOG discipline, install verification, vocabulary-friction reduction — these are v0.1.x deliverables. Decimal numbering signals "between M4 and M5" without implying v2.
3. **The vocabulary lock landed in M4.t18** (Milestone / Epic / Phase / Wave / Task). Adding a "between" milestone exercises the new vocabulary's flexibility — and tests whether the locked terms hold up under a non-standard milestone shape. If 4.5 feels wrong, that's signal about vocabulary.

---

## Epics

Listed in suggested execution order. Each Epic is independently shippable as v0.1.x.

### Status snapshot (as of 2026-07-04 — E5 shipped v0.1.4; E10 added via backlog review)

| Epic | Status | Notes |
|---|---|---|
| E1 — Stranger-install path bulletproof | S1 shipped 2026-05-15 (v0.1.1); **S2 Phase A shipped 2026-05-19 (outcome a — Phase B not needed)**; **S3–S5 ⏸ shelved 2026-05-24** | F2 resolved as outcome (a); R1 row of install-verification matrix complete. S3–S5 (R2/R3/R5 + versioning policy + validator hardening) paused pending Linux/WSL tester volunteers — see M4.5.E3-REQUIREMENTS.md § D-E3-12 for unshelf trigger. |
| **E2 — `/sig:add` capture-and-route** | **✓ shipped 2026-05-31 (in v0.1.3)** | Full 5-slice Epic: hot path (S1) + force-route flags & `--file` (S2) + naked-invocation interview (S3, heuristics cut per Decision 5) + stranger-safety & vocab lint (S4) + `/sig:plan` advisory FUTURE-IDEAS drain (S5). Q2 dispositioned-rule refined in-loop at REVIEW. 183 Epic-owned tests. See `M4.5.E2-RETROSPECTIVE.md`. |
| **E3 — Public-facing docs rewrite** | **✓ shipped 2026-05-24 (released in v0.1.3 on 2026-05-31)** | Audience reframe to self + peers (D-E3-11). 2 slices, 10 tasks. New: tools/audit-network-calls.js + README Privacy section + Compat table + docs/map link + README Open Source Origins rewrite + SECURITY.md + references/facts.md + tests/cross-file-consistency.test.js. 384 → 397 tests. CONTRIBUTING.md + issue templates + docs/compatibility.md deferred per D-E3-11 (see FUTURE-IDEAS.md "E3 contribution scaffolding — deferred"). |
| **E4 — Worked example + comparison page** | **✓ shipped 2026-06-03 (closed lightweight; `[Unreleased]` — batches with E5)** | `examples/url-shortener/` (runnable, zero runtime deps, annotated tour, currency guard) + `docs/vs.md` (toolbox-framed prose guide). 3 slices, 10 tasks. `node:sqlite`→JSON-store pivot; AC-count reconciled (24 = 17+7); `vs.md` tone reframe. Root suite 762 → 764; validator green. See `M4.5.E4-RETROSPECTIVE.md`. |
| **E5 — External validation + launch** | **✓ shipped 2026-06-06 (v0.1.4)** | All 4 slices / 9 tasks (launch post, demo script, tester brief + friction log, launch kit, CHANGELOG). v0.1.4 tagged + first GitHub Release; E4's `[Unreleased]` block shipped with it. The outward tester loop (voice pass, recruit ≥3, record demo) remains open — tracked in `M4.5.E5-LAUNCH-KIT.md` §3. |
| E10 — Resume trust & capture integrity | added 2026-07-04 — pending | v0.1.5 hardening batch from the backlog review (DECISIONS 2026-07-04, BR-7). Ship before external testers onboard. See § E10 below. |
| **E6 — Resume reliability (STATE.md schema + auto-update + `/sig:checkpoint`)** | **✓ shipped 2026-05-18 (v0.1.2)** | All 5 slices + S6 REVIEW loop-back (5 IMPORTANT findings resolved pre-publish). YAML-frontmatter STATE.md + auto-state-protocol + new `/sig:checkpoint` + staleness banner + orphan UI in `/sig:resume`. 225 → 366 tests; no new runtime deps. |
| **E7 — Synthesizer prose-quality + install-UX hardening** | **✓ shipped 2026-05-23 (released in v0.1.3 on 2026-05-31)** | DISCUSS + PLAN closed 2026-05-21 (commit `015525e`); EXECUTE 2026-05-22 → 2026-05-23 (per-task atomic commits S1.t1 → S2.t8). Two-layer synthesizer fix: new `embedSection` helper in `tools/lib/landscape.js` (eliminates LLM verbatim-copy as failure mode) + `commands/init.md` long-line splits (reduces dense-prose generation pressure). `docs/install-troubleshooting.md` with 5 symptom sections + Quick Triage + Canonical Clean Reinstall. R1+ rerun on Mac Studio 2026-05-23 verified clean (`docs/install-verification.md` § R1+). Tests 366 → 384; validator green. CHANGELOG [0.1.3] section. See § E7 below + `docs/install-verification.md` R1 for original motivation. |
| **E8 — `/sig:doctor` install-state diagnostician + reframe** | **✓ shipped 2026-05-30 (in v0.1.3)** | Scoped after E7 surfaced that 3 of 5 install failure modes (P1/P2/P3) are upstream Claude Code plugin-host bugs, not Signal bugs, but the 280-line troubleshooting doc reads as Signal's shame. E8 ships a single command users run to get diagnosis + the exact remediation commands, reframes the troubleshooting doc to name upstream-vs-Signal ownership, and adds auto-version-check to `/sig:status` so staleness gets surfaced before strangers hit weird behavior. Sequenced before E5 launch — launching without it ships the current install dance to strangers. See § E8 below. |
| **E9 — Retro Foundations (SHIP enforcement + RETROSPECTIVES.md index)** | **✓ shipped 2026-05-26 (released in v0.1.3 on 2026-05-31)** | DISCUSS + PLAN closed 2026-05-25; EXECUTE 2026-05-26 (Waves 1-5, 19/19 tasks); VERIFY PASS 23/23 ACs; REVIEW PASS-WITH-FIXES (1 Important + 3 Suggestions fixed in-phase). Layered enforcement per D-E9-8 (command-internal + PreToolUse + SessionStart-resume hooks). 5 backfilled stub retros (E1, E2, E3, E6, E7) + E9 own substantive retro + RETROSPECTIVES.md index live. Tests 397 → 535 (+138). 24 atomic commits. See § E9 below. |

E2 plan + execute artifacts live in `M4.5.E2-{RESEARCH,PLAN,VALIDATION,PROGRESS}.md`. E6 artifacts live in `M4.5.E6-{RESEARCH,PLAN,VALIDATION,VERIFICATION,REVIEW}.md` (DISCUSS/PLAN/EXECUTE/VERIFY/REVIEW/SHIP all complete). E9 artifacts live in `M4.5.E9-{REQUIREMENTS,RESEARCH,PLAN,VALIDATION,PROGRESS,VERIFICATION,REVIEW,RETROSPECTIVE}.md` (all phases complete).

---

### M4.5.E1 — Stranger-install path bulletproof

The single highest-leverage Epic. If the install path is broken, every other Epic's value is gated.

- **F2 resolution** — verify Claude Code auto-registers Signal's agents post-marketplace-install. Three viable outcomes: (a) it does, document and close. (b) it doesn't but the documented fallback in `/sig:init` Step 2 holds, document the limitation and close. (c) it doesn't and the fallback is brittle — restructure agents to flat `agents/sig-<name>.md` layout. Sub-question open since v0.1.0 tag; resolution unblocks confident promotion.
- **Fresh-machine install protocol** — actual cold install on a Mac (and ideally Linux/WSL) box you've never touched. Document the exact command sequence that worked. Catches papercuts the M4.t19 fix didn't surface (e.g., does `signal` marketplace conflict with prior `signal` plugin slug for users who installed pre-rename? — turns out yes, requires `/plugin uninstall signal@signal` first; this kind of finding belongs in install docs).
- **Versioning & deprecation policy** — write the policy that would have made the `signal → sig` rename non-painful for users (semver-strict? breaking changes only at 0.X.0 minors with explicit upgrade notes? deprecation period before removal?). One-page doc; lives in `docs/versioning.md`. Future renames cite it.

**Exit:** F2 resolved, install protocol documented + verified on at least one fresh machine, versioning policy committed.

**S3–S5 shelved 2026-05-24** — see M4.5.E3-REQUIREMENTS.md § D-E3-12 for the trigger to unshelf (a Linux or WSL tester raising a hand). Work is paused, not cancelled; the scope still stands.

### M4.5.E2 — `/sig:add` capture-and-route command

Detail in FUTURE-IDEAS.md entry of same name (logged 2026-05-13). Summary: lowest-friction capture for new ideas, routes default to FUTURE-IDEAS.md with planning-phase promotion. Stranger-adoption value is high — newcomers shouldn't need vocabulary fluency to capture ideas.

**Sliced into 5 waves** during PLAN phase 2026-05-14 (full plan in `M4.5.E2-PLAN.md`):

- **S1 — hardened hot path [shipped 2026-05-14].** `/sig:add "idea"` → atomic write to FUTURE-IDEAS.md. Verbatim capture, sensitive-data scrub, lock-protected, atomic write with EXDEV fallback. 40 tests. `commands/add.md` + `tools/lib/add.js` + minimal fixture + validator/README/CLAUDE.md wiring.
- **S2 — force-route flags [shipped 2026-05-31].** `--question`, `--milestone [N]`, `--file` flags on a generalized capture spine (`captureToDestination`). New `tools/lib/milestones.js` helper for milestone-file resolution. Multi-flag guard + `--file` path-escape hard gate.
- **S3 — naked-invocation interview [shipped 2026-05-31].** Naked `/sig:add` → one "What's the idea?" question → FUTURE-IDEAS. **Heuristic hints CUT** (Decision 5 — no `suggestDestination`; routing is explicit flags or the default, nothing between). Quoted capture stays instant.
- **S4 — stranger-safety hardening [shipped 2026-05-31].** First-run onboarding note **modulated by `gate_strictness`** (strict = confirm once / light+absent = FYI once / off = silent) — **not** a per-capture destination-confirm (Q1). Brownfield-vs-greenfield missing-`.planning/` error. Vocab-lint validator extension.
- **S5 — close the loop [shipped 2026-05-31].** `commands/plan.md` `### 1b.` advisory FUTURE-IDEAS drain step so captured entries get reviewed at the next planning gate. Per DECISIONS.md 2026-05-24 (Option A drain), this is **also Signal's primary drain mechanism** for FUTURE-IDEAS — not just a surfacing step. Each entry surfaced must receive one of four dispositions: **promote** (becomes an Epic or task in the current/upcoming planning round), **defer** (stays in FUTURE-IDEAS, no action this round), **merge** (folded into another existing entry; original deleted with a one-line redirect), **delete** (outdated / superseded / no longer relevant — removed with a one-line note in the commit message). Disposition recorded inline by editing the entry's Status line (e.g., `**Status:** Deferred 2026-05-26 — re-evaluate at next planning gate`). No new file, no new command surface. See `FUTURE-IDEAS.md` entry "FUTURE-IDEAS drain process" for full design rationale and anti-rationalization counters.

- Design routing interview (1–3 questions, adaptive). [S3]
- Implement capture-flow tooling in `tools/lib/` (reuse existing `readProfile`, `readState`, `readOpenQuestions` helpers). [S1 done; S2 adds milestones.js]
- Wire validator's `REQUIRED_COMMANDS` [S1 done], `plugin.json` commands list (auto-discovered — no change needed), README [S1 done], decision-tree viewer (`docs/map/index.html`) [defer; viewer is calibration-focused], MCP/skill descriptions [defer until cross-skill changes].
- Tests: fixture-driven, verify each routing destination receives a well-formed entry. [S1: FUTURE-IDEAS destination covered with 40 tests; S2–S5 expand]

**Exit [met 2026-05-31]:** `/sig:add` shipped. Four routing destinations demonstrated working (FUTURE-IDEAS default / `--question` → OPEN-QUESTIONS / `--milestone [N]` → current or named MILESTONE / `--file` → arbitrary `.planning/` path); the 5th (new-MILESTONE-N scaffold) was deferred to v0.2 (out of scope, per `M4.5.E2-REQUIREMENTS.md` § Deferred). Anti-rationalization gates honored.

### M4.5.E3 — Public-facing documentation rewrite

Current top-level docs read as internal architecture notes. Strangers need a pitch + quickstart, not a planning archive.

- **README rewrite as pitch.** Top of README: one-sentence what-it-is, a 30-second animated GIF or screen recording showing `/sig:init` → `/sig:status`, copy-paste install, first command to run. Move existing architecture content below a fold or into `docs/architecture.md`.
- **CHANGELOG.md** — establish the file with v0.1.0 entry (M4 close + signal→sig rename). Subsequent v0.1.x releases (each M4.5 Epic) append entries.
- **Requirements + compatibility matrix** — Node 22+, Claude Code version range, OS support (Mac confirmed; Linux/WSL pending E1's cross-platform install test).
- **CONTRIBUTING.md + SECURITY.md + issue templates** — signals to strangers that bug reports go somewhere.
- **Privacy/telemetry statement** — one section in README: "Signal makes no network calls beyond Claude's own API; all state lives in `.planning/` in your repo."

**Exit:** README opens with the pitch, CHANGELOG exists, compatibility documented, contribution/security paths visible, privacy statement explicit.

**Shipped 2026-05-24 via M4.5.E3** with audience reframe (self + peers). See M4.5.E3-REQUIREMENTS.md § 2026-05-24 revision (decisions D-E3-10 / D-E3-11 / D-E3-12 / D-E3-1-amend) and M4.5.E3-PLAN.md for the revised 2-slice scope. CONTRIBUTING.md + issue templates + docs/compatibility.md sub-doc deferred — see FUTURE-IDEAS.md entry "E3 contribution scaffolding — deferred" for re-promotion triggers.

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

### M4.5.E8 — `/sig:doctor` install-state diagnostician + ownership reframe ✅ SHIPPED 2026-05-30

Scoped 2026-05-24. **Shipped 2026-05-30** as part of the v0.1.3 candidate bundle (joins E7 + E3 + E9 in CHANGELOG `[0.1.3]` — still Unreleased pending an M4.5 close-out version cut). Sequenced before E5 launch as planned. Full retro at `.planning/M4.5.E8-RETROSPECTIVE.md`; AC #13 dogfood at `docs/install-verification.md` § R6.

**Outcome summary:** 3 slices, 41 tasks, 31 atomic commits, tests 535 → 608+ (+73 vs +38 forecast). 12 decisions locked (D-E8-1 through D-E8-12 — 6 DISCUSS + 6 PLAN). 3 REQUIREMENTS↔reality conflicts surfaced at PLAN and reconciled (FR6 endpoint `/releases/latest` → `/tags`; FR9 timing — 2 of 3 issues already filed upstream, cross-linked + 1 new P3 filed at #63624; `installed_plugins.json` per-scope-array shape). 1 PLAN deviation documented (helper-script split deferred; inline `node -e` kept with well-formedness gate). 13/13 ACs satisfied (AC #13 partial — execution-mechanism end-to-end on Mac Studio; destructive rm-rf leg deferred per legitimate user choice during dogfood).

**Original scope, captured below for posterity** — note that PLAN reframed the `--upgrade` flag to `--reinstall` (D-E8-5) and the version-source endpoint from `/releases/latest` to `/tags` (D-E8-7):

**Why a new Epic rather than slotting into E1.** E1 owns marketplace install + agent registration + fresh-machine verification — making install *work* the first time. E8 owns the *upgrade and recovery path* when install state goes wrong, plus the *ownership framing* of the troubleshooting story (most of which is Anthropic's plugin host, not Signal). Different domain, different lifecycle: E1 fires on day-one install; E8 fires every time a user upgrades, hits a P-state bug, or wonders if they're on the latest version. Stretching E1 to absorb upgrade-state management would dilute its identity. E7 set the precedent of carving out a focused install-UX Epic when the surface area earned its own scope; E8 extends that pattern to the upgrade lifecycle.

**Problem statement.** Current upgrade story for a stranger who installed Signal v0.1.0 in April 2026 and wants v0.1.3 today:

1. Read 280-line `docs/install-troubleshooting.md`.
2. Identify which of 5 P-states they're in (P1 stale `gitCommitSha`, P2 no Uninstall verb, P3 Disabled-state survives, pre-rename `signal@signal` cache orphan, SSH multi-identity).
3. Execute a 4-step canonical clean reinstall sequence — possibly preceded by a manual edit of `~/.claude/settings.json` and/or `rm -rf` on a cache directory.
4. Re-run `/plugin install` and hope.
5. If still broken, repeat from (2).

That is not a plugin upgrade story. That is a hostage situation.

**Honest ownership accounting** (gates the reframe in S3):

| Failure mode | Owner | Signal can fix? |
|---|---|---|
| P1 — `gitCommitSha` short-circuit | Claude Code plugin host | No — only diagnose + work around |
| P2 — no Uninstall verb in `/plugin` UI | Claude Code plugin host | No — only document alternate path |
| P3 — Disabled state survives reinstall | Claude Code plugin host | No — only diagnose + remediate |
| Pre-rename `signal@signal` cache orphan | Half Signal (the rename) / half Claude Code (cache GC) | Partial — detect and remediate; historical only |
| SSH multi-identity | Environmental | Documentation only |

3 of 5 are upstream bugs. The troubleshooting doc reads as Signal's failure because it lives in Signal's repo; that framing is wrong and stranger-hostile.

**Scope:**

- **`/sig:doctor` command (S1 — diagnose-only).** Reads `~/.claude/settings.json`, `~/.claude/plugins/installed_plugins.json`, and `~/.claude/plugins/cache/<marketplace>/` directory structure. Detects all 5 documented P-states. Prints findings with copy-paste-ready remediation commands per state, OR "Signal v0.1.X installed and healthy — no action needed." Read-only; no mutations. Exit code 0 if healthy, 1 if any P-state detected (so it can be scripted in CI or pre-commit hooks).
- **`/sig:doctor --upgrade` (S2 — guided upgrade flow).** Single command that performs the canonical clean reinstall sequence regardless of which P-state(s) the user is in. Prompts for confirmation before each mutating action (`rm -rf` cache dir, `settings.json` edit, `/plugin uninstall`, `/plugin install`). Idempotent — re-running on a clean install reports "already at latest" and exits.
- **`/sig:doctor --fix` (S2 — auto-remediation, per-finding).** For each detected P-state, ask "remediate this one? [y/N]" and execute the per-state fix. More surgical than `--upgrade`; useful when only one P-state is present.
- **Auto-version-check in `/sig:status` (S3).** `/sig:status` reads installed version from cache, compares to latest GitHub release tag, and prepends `⚠ Signal vX.Y.Z installed; vA.B.C available. Run /sig:doctor --upgrade.` to the briefing when stale. Does not block — surfaces drift the same way E6's STATE.md staleness check does. Cached for 24h to avoid GitHub API hits on every `/sig:status` call.
- **Troubleshooting doc reframe (S3).** First sentence of `docs/install-troubleshooting.md` names ownership explicitly: *"Most install-state failures documented here are Claude Code plugin-host bugs, not Signal bugs. We document them because strangers should not have to debug Anthropic's plugin host alone. Run `/sig:doctor` first — it will tell you which workaround applies and execute it for you."* Per-section ownership tags added (`**Owner: Claude Code plugin host**` / `**Owner: Signal (historical — pre-rename)**`). Reduces doc length by routing readers to `/sig:doctor` instead of asking them to triage 5 symptom sections by hand.
- **Upstream issue filings (S3, optional — defer if upstream pace would block ship).** File 3 GitHub issues against `anthropics/claude-code` for P1/P2/P3 using Signal's existing repro docs as the bug-report substrate. Cross-link from `docs/install-troubleshooting.md`. If/when upstream lands fixes, the corresponding `/sig:doctor` checks can be retired.

**Three-slice plan:**

- **S1 — `/sig:doctor` diagnose-only command.** `commands/doctor.md` + `tools/lib/doctor.js`. Detection logic per P-state, output formatting, no mutations. Validator wiring (`REQUIRED_COMMANDS += commands/doctor.md`), README mention, CLAUDE.md command-count bump (14 → 15). Tests: per-P-state fixture under `tests/fixtures/doctor-states/` (synthetic `~/.claude/` trees representing each state), unit tests for each detector, output-formatting tests. One ship event.
- **S2 — `--upgrade` + `--fix` mutating flags.** Add remediation execution per P-state, confirmation prompts, idempotency guarantee. Tests cover the dry-run path (default) AND the execute path against fixture filesystems (no real `~/.claude/` mutation in tests). One ship event.
- **S3 — `/sig:status` version-check + doc reframe + (optional) upstream filings.** Extend `tools/lib/status.js` with version-staleness detection (GitHub releases API + 24h cache). Reframe `docs/install-troubleshooting.md` with ownership tags + `/sig:doctor`-first routing. File 3 upstream issues if scope permits. CHANGELOG `[0.1.3]` E8 block. Epic close. One ship event.

**Acceptance criteria (high level — refined in PLAN):**

1. `/sig:doctor` runs on a healthy install and reports "Signal vX.Y.Z installed and healthy — no action needed."
2. `/sig:doctor` runs on each of the 5 documented P-states (via fixture or real reproduction) and reports the correct finding with the correct remediation command.
3. `/sig:doctor --upgrade` executes a clean reinstall regardless of starting P-state; re-running on a now-healthy install is a no-op.
4. `/sig:doctor --fix` remediates per-finding with explicit per-action confirmation; declining a prompt skips that fix and continues.
5. `/sig:status` prepends a staleness warning when installed version is older than the latest GitHub release tag.
6. `docs/install-troubleshooting.md` opens with the ownership statement and routes readers to `/sig:doctor` before any per-symptom triage.
7. Tests cover detection of all 5 P-states + the healthy-install case; existing 384 tests stay green.
8. The Epic dogfoods itself: at least one upgrade flow (e.g., the Biz machine or laptop test environment) is executed via `/sig:doctor --upgrade` end-to-end before SHIP.

**Exit:** All 3 slices shipped; dogfood criterion (#8) demonstrated; `docs/install-troubleshooting.md` reframed; (optional) 3 upstream issues filed against `anthropics/claude-code`. Stranger onboarding story for v0.1.3 collapses to: *install once, then on upgrade run `/sig:doctor --upgrade` — one command, deterministic, regardless of P-state.*

**Estimated effort:** 2–3 focused days. Detection logic is mechanical (read JSON files + dir listings + compare strings). The risk is in the `--upgrade` flow execution model — invoking `/plugin uninstall` and `/plugin install` from inside Claude Code requires either shelling out or instructing the user to run them. The first design decision in DISCUSS will be: does `/sig:doctor` execute the remediation, or does it generate a script the user runs? Lean toward generating a runnable shell script the first time, then upgrading to direct execution once the path is proven.

**Not in scope (for E8 specifically):**

- Marketplace migration (publishing to the official Claude Code marketplace vs. GitHub-hosted `sig@signal`). That's an E5 launch concern.
- Telemetry or auto-update background processes — Signal's privacy claim (E3 D-E3-1) explicitly rules these out.
- Diagnosis of `.planning/` corruption or in-project state issues — that's `/sig:checkpoint`'s domain (E6). `/sig:doctor` is strictly about install/upgrade state in `~/.claude/`.
- The TLS/auth side of GitHub releases API access — assume `gh` CLI or `curl` works; punt on auth-required fetch.

**Anti-rationalization to lock in early:**

- *"Just expand the troubleshooting doc with better diagrams."* — No. The doc is the symptom of the problem, not the solution. A stranger debugging install state is already failing the "5-minute install" promise.
- *"Wait for Anthropic to fix the plugin host."* — Indefinite timeline; Signal cannot ship its launch on an upstream dependency. File the issues AND ship `/sig:doctor` so we're not blocked.
- *"Auto-remediate without confirmation prompts to make it one command."* — No. Mutations to `~/.claude/` affect every plugin the user has installed. Explicit confirmation per mutating action is non-negotiable. `--upgrade` can chain prompts but must not skip them.
- *"Make `/sig:doctor` part of `/sig:status`."* — No. `/sig:status`'s one-screen contract is load-bearing (per E6 work). Doctor's detection logic is more expensive (filesystem reads + JSON parses + version-check); bolting it onto `/sig:status` either slows status down or fragments the contract. Separate command.

**Resolve before SHIP:**

- DISCUSS gate: confirm S2's execution model (script generation vs. direct execution) before PLAN.
- PLAN gate: confirm that fixture-based detection tests are sufficient (vs. requiring real `~/.claude/` state in a sandbox).
- Pre-SHIP: dogfood `/sig:doctor --upgrade` end-to-end on at least one machine other than Mac Studio.

---

### M4.5.E9 — Retro Foundations (SHIP enforcement + RETROSPECTIVES.md index)

**Status:** ✓ shipped 2026-05-26 (released in v0.1.3 on 2026-05-31). 19/19 tasks. 24 atomic commits + pushes (`b6c478a..dbbc252`).

**Motivation.** Per-Epic retrospectives were structurally optional in Signal up to M4.5.E8 — soft signals that survived only if conversation context did. The motivating failure mode: a session shipped an Epic, the context cleared before `/sig:ship` was invoked, the retro was never written, and the lesson disappeared. Each shipped Epic compounded the loss. E9 fails closed: SHIP refuses to mark an Epic as complete until a tier-appropriate `RETROSPECTIVE.md` exists and passes a content validator. Three layers (command-internal + PreToolUse + SessionStart-resume hooks) defend against the three known bypass paths.

**Decisions (full rationale in `DECISIONS.md` 2026-05-25 entry "M4.5.E9 decisions locked"):**

- **D-E9-1 Scope = split.** Workstreams 1+2 (enforcement + index) ship as M4.5.E9. Wiki restructure + doc-runtime + migration tooling deferred to M5.E1 with its own DISCUSS.
- **D-E9-2 Slice shape = two slices.** S1 (12 tasks, high risk) = enforcement + template + stub backfill + E9's own dogfooded retro. S2 (7 tasks, low risk) = index + meta-retro + resume integration.
- **D-E9-3 Enforcement = hard block, no bypass.** No `--no-retro` flag, no env-var override, no extra-args trick.
- **D-E9-4 Tier scope = all tiers.** SKETCH/FEATURE/SPIKE/FULL all required; template ceremony scales per tier.
- **D-E9-5 Granularity = per-Epic** + optional milestone-close meta-retro (manual trigger).
- **D-E9-6 File location = flat convention** (`.planning/M{N}.E{X}-RETROSPECTIVE.md`; index at `.planning/RETROSPECTIVES.md`).
- **D-E9-7 Backfill = stubs with `[FILL IN]` markers** for already-shipped Epics; surfaces gap honestly without fabricating false memories.
- **D-E9-8 Enforcement mechanism = layered.** Command-internal `commands/ship.md` §0.5 + PreToolUse(Edit|Write) hook + SessionStart(resume) hook. Surfaced at PLAN-time research because the motivating failure (context cleared before SHIP) is structurally orthogonal to SHIP-phase enforcement.

**Slices:**

- **S1 — SHIP enforcement + tier-aware template + stub backfill (✓ shipped 2026-05-26).** 12 tasks. New files: `references/retrospective-template.md`, `tools/lib/retrospective.js`, `tools/backfill-retros.js`, `hooks/check-state-write.js`, `hooks/warn-dirty-execute.js`. 5 backfilled stub retros for already-shipped M4.5 Epics (E1, E2, E3, E6, E7) + E9's own substantive dogfood retro from S1.t12 as the integration test. DRY-RUN GATE at S1.t10 caught 2 real bugs (`git log --grep` subject-vs-body false positive; relative-path `../.planning/X.md` vs sibling `X.md`) that would have shipped otherwise.
- **S2 — RETROSPECTIVES.md index + meta-retro + resume integration (✓ shipped 2026-05-26).** 7 tasks. New file: `tools/lib/retro-index.js`. Hand-curated hooks merge with auto-structural rendering. `/sig:resume` briefing adds a `Retros:  N/M complete` line. Manual milestone meta-retro mechanism via `--milestone-meta` flag (per A6 / FR6 downgrade from auto-detection).

**Outcomes:**

- Tests 397 → 535 (+138; +34.7% surface in one Epic).
- 6 retrospective files now live in `.planning/`.
- `commands/ship.md` gains 4 new sections (§0.5 FR1 + §5 programmatic state-write + §6 index regen + §7 manual meta-retro). State-write parity with `verify.md`/`review.md` closed a longstanding gap surfaced in RESEARCH § 1.1.
- 1 known limitation: cross-runtime hook surface (Cursor lacks `PreToolUse` for file writes; gets command-internal only). Documented in PLAN.

**PLAN deviations surfaced + resolved in-flight:**

1. **Byte-threshold formula vs. AC.** PLAN spec said `template_floor + 150B × section_count`; PLAN AC said "one sentence per section passes." Incompatible. Resolved with 60B coefficient (AC is binding). Logged in `M4.5.E9-PROGRESS.md` + `tools/lib/retrospective.js` inline comment.
2. **Hook scripts bash vs. Node.** PLAN spec called for `.sh` wrappers; shipped as direct `.js` Node CLIs because bash availability is platform-dependent (Windows lacks bash natively) and the wrapper added no testability.
3. **S1.t6 scope-by-discovery.** RESEARCH § 1.1 surfaced that `commands/ship.md` had a state-write gap relative to `verify.md`/`review.md` (prose "Update STATE.md" rather than programmatic). Fix bundled into S1.t6 per PLAN § 1.5's "PASS-WITH-NOTE" scope-discipline callout.

**Items surfaced for FUTURE-IDEAS triage (see entries dated 2026-05-26):**

- "Spec-internal consistency" as a new PLAN-validation axis.
- Dry-run gate as a standard PLAN pattern for any Epic that writes to existing user state.
- Hook output format reference doc.

**Known follow-on (post-SHIP, user-validated):**

- SessionStart-resume hook manual smoke test in a real session. The unit tests cover the JS logic; the hook-firing handshake is not yet end-to-end verified. PreToolUse smoke confirmed during EXECUTE (exit 2 + stderr block).

**Cross-references:**
- `.planning/M4.5.E9-{REQUIREMENTS,RESEARCH,PLAN,VALIDATION,PROGRESS,VERIFICATION,REVIEW,RETROSPECTIVE}.md`
- `.planning/DECISIONS.md` 2026-05-25 entry (D-E9-1 through D-E9-8)
- `.planning/RETROSPECTIVES.md` (index)

---

### M4.5.E10 — Resume trust & capture integrity (v0.1.5)

Added 2026-07-04 via backlog-review ratification (`BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 1 + DECISIONS 2026-07-04, BR-7). One theme: **the briefing and the capture pipe must be trustworthy before external testers onboard.** Every item verified still open in source on 2026-07-04; all are small (≤ half-day) with no M5 dependencies.

- **`/sig:resume` Epic-prefix artifact resolution** — resolver tries `{state.current_epic}-{ARTIFACT}.md` first (pattern 0), falling through to the 3 legacy patterns. Today every mid-Epic resume misses the plan briefing (P2). FUTURE-IDEAS entry of same name has the full scope + test sketch (~30 LOC + test).
- **Origin-drift detection** — `isStaleVsOrigin(baseDir)` in `tools/lib/state.js`; wire into `/sig:resume` + `/sig:status` + `/sig:checkpoint`. Surface a banner, never block. (The 2026-05-19 incident: ~90 min duplicate planning.)
- **STATE.md auto-update Option A** — append the frontmatter-refresh step to the 5 non-EXECUTE phase commands (`discuss`/`plan`/`verify`/`review`/`ship`), same shape as the executor's step 6. Ratified BR-3; bundled with origin-drift (shared failure mode + fixtures). Options B/C stay on the watchlist.
- **Capture-pipe guards** — (a) drain dangling-fence warning in `tools/lib/drain.js` (unclosed fence at EOF currently hides every entry below it — REVIEW finding S4); (b) FUTURE-IDEAS footer-position guard in `tools/lib/add.js` (assert-and-repair, forward-fix options 1 + 2 from the footer-drift entry).
- **Schema-drift diagnostic (upgrade seam)** — detect when an in-flight project's `.planning/STATE.md schema_version` is behind the installed plugin's expected `SCHEMA_VERSION`, and point at the migration path. E8 covers install states; this covers the upgrade seam testers on a v0.1.x cadence will hit. **Surfaces in `/sig:status` + `/sig:resume`, not `/sig:doctor`** (PLAN decision AD2/SD2, 2026-07-05): `/sig:doctor` is macOS-gated + `~/.claude`-install-scoped per E8's charter, so it would hide the warning from the Linux/WSL testers who need it; schema drift is a platform-agnostic project-state concern and belongs with the E6/E8 project-state banners. `/sig:doctor` is untouched.
- **SessionStart-resume hook smoke test + `references/hooks-api.md`** — verify the E9 hook handshake end-to-end in a real session; document the per-event stdin/stdout/exit-code contract Signal uses.

**Exit:** all six items shipped + tested, validator green, released as v0.1.5 before the first external tester onboards.

---

## Exit Criteria for Milestone 4.5

All 10 Epics shipped (E1–E10; E1 S3–S5 remain shelved per D-E3-12). At least 3 non-Signal users have run `/sig:init` through `/sig:ship` on real projects. Friction logs from those runs reviewed; resulting fixes either shipped or promoted to FUTURE-IDEAS / M5. README opens with a pitch a stranger can parse in 60 seconds. Install path verified on at least one fresh non-author machine. Upgrade path collapses to one deterministic command via `/sig:doctor --upgrade` (E8) regardless of starting install state.

## Notes

- **`/sig:add` (E2) likely lands first** despite being listed second. It's small, self-contained, and immediately useful for capturing the rest of M4.5's emergent work. F2 (E1) is technically harder but doesn't block other Epics from starting in parallel.
- **E5 (external testers) cannot finish until E1–E4 land** — strangers shouldn't be the ones discovering install-path bugs or README opacity.
- **No new architectural surface.** M4.5 explicitly does *not* add phase commands, new tier values, or change PROFILE.md schema. Anything that would do those things belongs in M5 or a new FUTURE-IDEAS entry.
- **Versioning discipline starts with this milestone.** Pre-M4.5, `signal → sig` shipped without a written deprecation policy. From M4.5.E1 onward, breaking changes follow the policy.
- **Numbering choice (4.5 vs. promoting to M5):** Decimal preserves M5's identity as "v2 architectural ports." If M4.5 grows beyond 5 Epics (and especially beyond release-hardening into new feature work), reconsider whether it should be renamed M5 with the current M5 becoming M6. Don't make that call until at least 3 Epics ship and the scope is concrete.

---

*Created 2026-05-13 in response to release-hardening / stranger-adoption gap surfaced during M4.t19 follow-up conversation. Expect rewrite as Epics ship and external feedback rolls in.*
