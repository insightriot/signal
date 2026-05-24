# Signal — Fresh-Session Context

Load this at the start of every work session. Short on purpose.

---

## Project

**Signal** (market-facing: *SignalOS*) — a Claude Code plugin that integrates patterns from the Claude Code plugin ecosystem with a project-complexity calibration router. Command prefix: `/sig:`.

## Scope (locked)

- **v1** = 6-phase MVP (`calibrate → discuss → plan → execute → verify → review → ship` + `escalate`). Currently being built.
- **v2** = 10-phase expansion (adds ideate/validate/strategize upstream + compound downstream). Follow-on, after v1 ships and validates.

See `DECISIONS.md` for full rationale.

## Attribution (locked)

9 source repos in 4 tiers:
- **Ported (v1):** GSD, Agent Skills.
- **Planned (v2):** gstack, pm-skills, superpowers, compound-engineering.
- **Pattern source:** planning-with-files, oh-my-claudecode.
- **Reference:** GSD Skill Creator.

See `LICENSES.md` for details.

## Build approach (locked)

Hand-rolled `.planning/` (this directory) drives the build. **No GSD install.** Once `/sig:calibrate`, `/sig:discuss`, `/sig:plan` are functional (late Milestone 2 / early Milestone 3), switch to dogfooding Signal on itself.

**`.planning/` is always tracked in git** — here and in every user project Signal touches. Never add it to `.gitignore`. It's the project's memory, not scratch state. See `DECISIONS.md` for the full principle.

## Current state

**MILESTONE 4 closed 2026-05-12 + v0.1.0 tagged.** 19 of 19 tasks shipped. Plugin marketplace-installable from `InsightRiot/signal`.

**MILESTONE 4.5 in flight.** Four Epics shipped (or part-shipped), three pending, one newly scaffolded:
- **E2.S1 (`/sig:add` hot path)** shipped 2026-05-14 — verbatim capture to `FUTURE-IDEAS.md` with scrub + lock + atomic write.
- **E1.S1 (marketplace install path)** shipped 2026-05-15 as **v0.1.1** — `marketplace.json` source-block fix + `CLAUDE_CODE_PLUGIN_PREFER_HTTPS` doc + semver validator.
- **E6 (resume reliability)** shipped 2026-05-18 as **v0.1.2** — YAML-frontmatter STATE.md (`schema_version: 1`) + auto-update protocol during EXECUTE + new `/sig:checkpoint` command + staleness banner + orphan UI in `/sig:resume`. 5 slices + S6 REVIEW loop-back (5 IMPORTANT findings resolved pre-publish).
- **E1.S2 Phase A (F2 verification)** shipped 2026-05-19 as commit `f38187a` — empirical confirmation on the maintainer biz machine (R1 row): all 25 Signal agents auto-register as `sig:<subdirectory>:<name>` (e.g., `sig:scanners:stack-scanner`) and spawn cleanly via `Task subagent_type`. Phase B (26-file flat restructure) permanently shelved. `commands/init.md:170` updated with the empirically-confirmed convention. `docs/install-verification.md` born with R1 entry.
- **E7 (synthesizer prose-quality + install-UX hardening)** scaffolded 2026-05-19 — surfaced during E1.S2 Phase A. Two findings: (1) `/sig:init` synthesizer character-eating bug (6+ confirmed instances in one run, e.g. `## Ierred goals & uncertainties`, `## ints`) — real quality blocker for strangers reading `/sig:init` output; (2) three install-UX papercuts (P1 stale gitCommitSha short-circuits install; P2 no uninstall verb in `/plugin` UI; P3 disable state survives uninstall+reinstall) requiring troubleshooting docs. See `MILESTONE-4.5.md` § E7 + `docs/install-verification.md` R1 for details.

- **14 slash commands shipped**: `/sig:new-project`, `/sig:init`, `/sig:calibrate`, `/sig:discuss`, `/sig:plan`, `/sig:execute`, `/sig:verify`, `/sig:review`, `/sig:ship`, `/sig:escalate`, `/sig:status`, `/sig:resume`, `/sig:add`, `/sig:checkpoint`.
- **26 agent files**: 22 from M1-M3 + 4 brownfield scanners (stack / structure / activity / quality) under `agents/scanners/`.
- **21 skill files** (unchanged since M3).
- **13 tool libs**: `state.js` (rewritten in E6.S1 for YAML frontmatter), `context-monitor.js`, `profile.js`, `status.js`, `landscape.js`, `walkthrough.js`, `skill-loader.js`, `add.js`, plus E6 additions: `atomic-write.js` + `file-lock.js` (extracted from `add.js`), `checkpoint.js`, `execute.js`, `resume.js`.
- **Conventions locked**: question-patterns (strict enum / 3+other / open-ended); PROFILE.md schema + tier-to-defaults + escalation_history; ID-is-identity vocabulary rule (Milestone / Epic / Phase / Wave / Task with M4.5.E6.S1.t1 style addressing); `.planning/` always tracked in git; STATE.md uses YAML frontmatter (`schema_version: 1`) with auto-migration on first write.
- **Validator** requires `calibrate.md` + `escalate.md` + `init.md` + `add.md` + `checkpoint.md` + `profile-schema.md` + `tier-definitions.md` + the 4 scanner agents.
- **384 tests passing** as of E7 ship (v0.1.3 candidate, untagged); validator green. (Test count history: 209 v0.1.0 → 225 v0.1.1 → 366 v0.1.2 → 384 post-E7.)
- **F2 — RESOLVED 2026-05-19 as outcome (a).** All 25 Signal agents auto-register post-marketplace-install as `sig:<subdirectory>:<name>`; nested layout works as designed. No restructure. See `DECISIONS.md` 2026-05-19 entry + `docs/install-verification.md` § R1.
- **Resume reliability — solved as of v0.1.2 BUT one gap surfaced 2026-05-19.** `/sig:resume` reads YAML frontmatter and surfaces in-flight tasks + staleness + orphans + open questions + next action. Gap: it does NOT fetch origin to detect work that shipped from another machine but didn't update STATE.md. On 2026-05-19, this caused ~90 min of duplicate planning when a biz-machine session shipped E1.S2 Phase A (commit `f38187a`) without updating STATE.md, and a parallel dev-machine `/sig:resume` re-planned the same Epic. Enhancement candidate logged in `FUTURE-IDEAS.md` (origin-drift detection at session start). Workflow lesson: keep Signal-the-codebase work on one canonical machine; use other machines as test environments only.

## Active work

**MILESTONE 4.5 underway** — Release Hardening / Stranger-Adoption Readiness; 6 original Epics + E7 = 7 total. Status: **E1.S1 + E1.S2 Phase A + E2.S1 + E6 full + E7 full = 5 ship-events** done; E1.S3–S5 + E2.S2–S5 + E3 (in-flight) + E4 + E5 pending.

**Active Epic: M4.5.E3** (PLAN complete 2026-05-24). Public-facing documentation rewrite, **scope-shrunk to self + peers audience** (per audience-reframe revision earlier same day). DISCUSS + PLAN both shipped on 2026-05-24.

**Final E3 shape (post PLAN gate, commit `59cbfdd`):** 2 slices, 9 tasks total.

- **S1 privacy posture** (3 tasks): RED `tests/audit-network-calls.test.js` → GREEN `tools/audit-network-calls.js` (Node ESM, not `.sh` per D-E3-1-amend-b) → README "Privacy & telemetry" section + CHANGELOG. **No PRIVACY.md** (per D-E3-1-amend — 0 of 6 peer plugins ship one; ecosystem norm is silence-as-no-telemetry).
- **S2 compat + Open Source Origins + slim SECURITY + close** (7 tasks): `references/facts.md` canonical fact source (per D-E3-NEW-13) → RED consistency tests + jargon-lint helper → README compat section + docs/map link → **README rewrite `## Credits & Heritage` → `## Open Source Origins`** with gratitude framing (per D-E3-NEW-14) → `SECURITY.md` (standard shape, zero Signal jargon) → MILESTONE annotations + FUTURE-IDEAS deferred-contribution entry → CHANGELOG + E3 close.

**Decisions locked total:** 12 DISCUSS + 3 revision (D-E3-10/11/12) + 4 PLAN-gate (D-E3-1-amend, D-E3-1-amend-b, D-E3-NEW-13, D-E3-NEW-14) = **19**. Authoritative scope: `.planning/M4.5.E3-PLAN.md`. CONTRIBUTING.md + issue templates + `docs/compatibility.md` **deferred** with explicit revisit triggers (D-E3-11).

**Test forecast:** 384 → ~396 (+12 across `tests/audit-network-calls.test.js` + `tests/cross-file-consistency.test.js`).

**Next:** `/sig:execute` on S1.t1 (write RED tests for the audit-network-calls script).

**Remaining M4.5 after E3 closes** (recommended order):

1. **M4.5.E8** — `/sig:doctor` install-state diagnostician + ownership reframe (scoped + DISCUSS'd 2026-05-24, commit `ddc89fc` + `09d0be4`). 3 slices: S1 diagnose-only, S2 mutating flags, S3 status version-check + troubleshooting reframe. Sequenced before E5 launch.
2. **M4.5.E2 Slices 2–5** — `/sig:add` force-route flags + cold-path interview + hardening + `/sig:plan` close-the-loop.
3. **M4.5.E4** — worked example + comparison page (`docs/vs.md`).
4. **M4.5.E5** — external validation + launch (owns the demo asset deferred from E3). **Scope re-evaluation pending** — if launch pivots toward "quiet peer-only release," E5 shrinks too.

**Shelved (not deleted) pending tester volunteers** (per D-E3-12):

- **M4.5.E1 Slices 3–5** — Linux + WSL install matrix R2/R3/R5 + versioning policy doc + validator hardening. The work is still scoped in MILESTONE-4.5.md § E1; paused until Linux/WSL volunteers raise a hand. Trigger to unshelf: a tester on the relevant platform commits to running `/sig:init` → verifying agent registration.

**To start the next Epic after E3:** run `/sig:resume` first (auto-orientation briefing — reads PROFILE.md + STATE.md frontmatter + open questions + next-action), then `/sig:discuss` once you've picked a scope.

**Multi-machine note:** as of 2026-05-19, Signal-the-codebase work happens on the **Mac Studio** (this machine). Biz machine + personal laptop are test environments for `/plugin install` verification. Don't run parallel `/sig:*` workflow commands on multiple machines — git race conditions create duplicate work. If laptop needs Signal v0.1.2 + the f38187a commands/init.md fix, follow `/plugin uninstall sig@signal` → `/plugin install sig@signal` → `/reload-plugins` (per `docs/install-verification.md` § R1 P1 workaround).

## Key files

- `.planning/PROJECT.md` — the full v1 spec
- `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` — the v2 vision
- `CLAUDE.md` — project instructions
- `.planning/MILESTONE-{1,2,3,4,4.5,5}.md` — scoped work plans (MILESTONE-4 = `/sig:init` brownfield onboarding, ✓ closed 2026-05-12 + v0.1.0 tagged; **MILESTONE-4.5 = release-hardening / stranger-adoption readiness, scaffolded 2026-05-13** — 6 Epics, 3 shipped (E1.S1, E2.S1, E6 full → v0.1.1 + v0.1.2); MILESTONE-5 = v2 ports, gated on usage data)
- `.planning/DECISIONS.md` — append-only architecture decisions
- `.planning/OPEN-QUESTIONS.md` — unresolved design questions (v1-scoped)
- `.planning/FUTURE-IDEAS.md` — post-v1 architectural evolutions of Signal's own mechanisms (distinct from MILESTONE-5's rundown-v2 integrations)
- `.planning/STATE.md` — what milestone we're in, active, blocked

**Authoritative references (in `references/`):**
- `profile-schema.md` — PROFILE.md format + validation rules
- `tier-definitions.md` — 4-tier definitions + tier-to-defaults table + escalation paths + brownfield calibration patterns (added in M4.t16)
- `question-patterns.md` — three question shapes (strict enum / 3+other / open-ended) — **especially relevant for M4.t8**
- `anti-rationalization.md` — anti-rationalization patterns

**Tooling (in `tools/`):**
- `lib/state.js` — `initState`, `readState`, `transitionPhase`, `checkGateArtifacts`, `PHASES`
- `lib/profile.js` — `readProfile`, `isPhaseEnabled`, `applyRigorOverrides`, `ProfileSchemaError`
- `lib/landscape.js` — `readScan`, `readAllScans`, `extractSection`, `extractField` (consumed by `/sig:init` Step 3 synthesis)
- `lib/walkthrough.js` — `countMarkers`, `appendNote` (consumed by `/sig:init` Step 5 walkthrough)
- `lib/status.js` — `nextActionForPhase`, `readOpenQuestions`, `formatEscalationSummary`, `reachedDoneViaSkip`, `readLandscapeMeta`
- `lib/context-monitor.js` — `estimateTokens`, `checkContextBudget`, `findSkillPath`, `estimatePhaseSkillCost`
- `lib/skill-loader.js` — skill resolution
- `validate-plugin.js` — `npm run validate`
- `measure-phase-costs.js` — token-cost measurement (`node tools/measure-phase-costs.js`)

## How to start a session

1. Run `/sig:resume`. It reads PROFILE.md + STATE.md frontmatter and prints a single-screen re-orientation briefing (vision, tier, phase, in-flight tasks, last completed task, blockers, open questions, next action). This replaces the manual "read CONTEXT.md + STATE.md + MILESTONE-*.md" ritual.
2. If `/sig:resume` reports `Next: done` (current Epic shipped), pick the next Epic from `MILESTONE-4.5.md` § "Epics" and run `/sig:discuss` to enter DISCUSS on the new scope.
3. If staleness is reported (STATE.md behind work history), run `/sig:checkpoint` first. Run `/sig:checkpoint --context` before any planned context clear so the next session's resume is genuinely useful.
4. For deeper context (full vision, design decisions, milestone breakdown), open the files in this order: `CONTEXT.md` (this file) → `MILESTONE-4.5.md` → `DECISIONS.md`.

**Specifically for the next session:** M4.5.E6 shipped 2026-05-18 (v0.1.2). Phase is `SHIP` / done. The recommended next Epic is **M4.5.E1.S2** (F2 verification on biz machine) — smallest unit of forward motion, unblocks confident marketplace promotion. Alternatives are listed in § Active work above.

---

*Last updated: 2026-05-18 (M4.5.E6 shipped as v0.1.2: YAML-frontmatter STATE.md + auto-update protocol + `/sig:checkpoint` + staleness-aware `/sig:resume`; tests 225 → 366; 14 commands; the 280-line manual POST-CONTEXT-CLEAR protocol previously at the top of STATE.md is now obsolete — `/sig:resume` drives re-entry.)*
