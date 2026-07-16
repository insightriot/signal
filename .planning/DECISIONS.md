# Architectural Decisions Log

Append-only. When a decision is reversed, *add* a new entry noting the reversal with the reason — don't edit the old one. This is history, not state.

---

## 2026-04-22 — v1 = 6-phase MVP, v2 = 10-phase architecture

**Decision:** v1 ships the 6-phase MVP currently speced in `PROJECT.md` (`calibrate → discuss → plan → execute → verify → review → ship` + `escalate`). v2 expands to the 10-phase architecture from `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` (adds ideate / validate / strategize upstream + compound downstream).

**Rationale:** The rundown explicitly flagged this as an open question. Shipping v1 narrow, learning from real use, then expanding is lower-risk than trying to build 10 phases with 9 source-repo ports in one push.

**Implication:** Milestone 4 (v2 integrations) is gated on Milestone 3 completing AND v1 having real users.

---

## 2026-04-22 — Attribution restructured into four tiers

**Decision:** All 9 source repos are attributed across `PROJECT.md`, `CLAUDE.md`, `LICENSES.md`, and the plugin manifests. Tiers: **Ported (v1)** = GSD, Agent Skills. **Planned (v2)** = gstack, pm-skills, superpowers, compound-engineering. **Pattern source** = planning-with-files, oh-my-claudecode. **Reference** = GSD Skill Creator.

**Rationale:** Original framing ("two frameworks") understated intellectual debt and would have caused attribution gaps as v2 ports land.

**Implication:** Full MIT (or other) license texts for v2-planned repos are added to `LICENSES.md` *when code is actually ported*, not speculatively — but the "Planned Integrations" section exists now so intent is public.

---

## 2026-04-22 — Build Signal with lightweight `.planning/`, not GSD

**Decision:** Manage Signal's own build with a hand-rolled `.planning/` directory (STATE, MILESTONE-{n}, DECISIONS, OPEN-QUESTIONS, CONTEXT). Do not install GSD for this.

**Rationale:** GSD would be overkill for a markdown-heavy build, create meta-confusion (whose `.planning/` is canonical?), and impose the exact over-engineering Signal is designed to prevent. Lightweight structure captures 90% of GSD's disciplines (planning, state, decisions log, atomic commits) at ~5% of the overhead.

**Implication:** Once `/sig:calibrate`, `/sig:discuss`, `/sig:plan` work (late Milestone 2 / early Milestone 3), switch to dogfooding Signal on itself — that's where real validation happens.

---

## 2026-04-22 — Rebrand deferred to Milestone 1

**Decision:** Manifest `name` fields still say `skills-gsd`. Rename to `signal` happens in Milestone 1 alongside scope-lock and PROFILE.md-schema work, not as part of attribution cleanup.

**Rationale:** Keep the attribution pass scoped to attribution, not mix in branding changes. One thing at a time.

---

## 2026-04-22 — GitHub repo renamed `dev-skills-gsd` → `signal`

**Decision:** Renamed the GitHub repository from `InsightRiot/dev-skills-gsd` to `InsightRiot/signal`. Updated the local `git remote set-url origin` and all URL fields in `plugin.json` (homepage + repository), `marketplace.json` (plugins[0].source.repo), and `package.json` (repository.url).

**Rationale:** Matches the `name` field already set to `signal` in all manifests. Matches the `/sig:` command prefix convention. Cleaner canonical name than the original `dev-skills-gsd` legacy. GitHub preserves a 301 redirect from the old URL, so existing clones continue to work.

**Account context:** Performed on the `brettvt-insightriot` GitHub account (gh CLI alias: `insightriot`) — **not** `brettvtcrowe`, which is Brett's day-job account and strictly separate from InsightRiot work. See the memory file `github-account-boundary.md` for the durable rule.

**Implication:** Resolves the open question logged in OPEN-QUESTIONS.md. If market-facing branding shifts to "SignalOS," a follow-up rename to `signalos` is trivially available (GitHub preserves all historical redirects).

---

## 2026-04-22 — PROFILE.md schema locked (v1)

**Decision:** PROFILE.md uses YAML frontmatter + markdown body format. Frontmatter contains five top-level fields: `tier`, `schema_version`, `calibration` (5 sub-fields), `phases_skipped` (array), `rigor_overrides` (10 sub-fields), `metadata` (3 sub-fields including `escalation_history`). Ten rigor override keys: `tdd_required`, `security_audit`, `performance_pass`, `simplification_pass`, `nyquist_enforcement`, `plan_validation_dims`, `research_parallelism`, `gate_strictness`, `context_rot_reread`, `review_depth`. Tiers: `SKETCH | FEATURE | SPIKE | FULL`.

Full spec: `references/profile-schema.md`. Tier-to-defaults mapping: `references/tier-definitions.md`.

**Rationale:**
- YAML frontmatter + markdown body follows GSD/Agent Skills convention; machine-parseable and human-readable in one file.
- All 10 override keys always written (not inherited by reference) so escalations and manual edits stay explicit.
- Enums preferred over booleans where a three-way distinction exists (e.g., `security_audit: none | basic | full`).
- `escalation_history` is an array in `metadata` so the decision trail survives across escalations.
- Started with 4 tiers (not 3 or 5): 3 misses SPIKE's exploratory shape; 5 adds cognitive load without a clear third-axis. Revisit after real-project calibration (tracked in OPEN-QUESTIONS.md).

**Implication:**
- `/sig:calibrate` (Milestone 2) writes this schema literally.
- Every downstream command reads it via a `readProfile()` helper (to be written in Milestone 2).
- Schema version = 1. Bumps on any breaking change. Readers should fail closed on unknown versions.

---

## 2026-04-22 — `.planning/` is always tracked in git, never ignored

**Decision:** `.planning/` is committed to version control in this repo, and Signal must ensure it is also committed in any user project where Signal is used. `.planning/` was previously in this repo's `.gitignore`; that line has been removed.

**Rationale:** `.planning/` is the project's institutional memory — state, decisions log, context, open questions, plans, verification reports. If a collaborator clones a repo without `.planning/`, they lose all accumulated project knowledge. That defeats the entire purpose of the file-based state convention. The instinct that "state directories should be ignored" does not apply here — `.planning/` is deliverable documentation that keeps a project coherent across contributors, sessions, and time.

**Implication:**
- Signal's `/sig:new-project` (and any command that writes to `.planning/`) must check the user's `.gitignore` and warn or auto-correct if `.planning/` is being ignored. Added as a task in `MILESTONE-2.md`.
- Signal's README and documentation must explicitly instruct users to commit `.planning/`, not ignore it.
- Any template `.gitignore` Signal ships or recommends must not include `.planning/`.

---

## 2026-04-25 — Agent count finalized at 22 (was speced as 24)

**Decision:** Signal ships with **22 agents** (19 GSD + 3 Agent Skills specialists), not 24. PROJECT.md and CLAUDE.md updated.

**Audit findings:**
- 22 agent definitions on disk (the OPEN-QUESTIONS.md note of "17" was stale).
- PROJECT.md claimed 24 but contained two errors:
  1. **Security Auditor was double-counted** — listed under both 3.3 (GSD verification, 7 agents) and 3.4 (Agent Skills specialists, 3 agents). On disk it lives in `agents/specialists/`, so it's correctly an Agent Skills specialist; 3.3 should be 6 GSD verifiers (not 7). Real claimed count was 23, not 24.
  2. **Doc Writer and Doc Verifier never written** — listed under 3.5 supporting agents but absent from disk.

**Decision: drop Doc Writer + Doc Verifier from the spec rather than write them.**

**Rationale.** Documentation responsibilities are already covered by the `documentation-and-adrs` SHIP-phase skill, which loads when SHIP runs. Spawning separate agents for documentation duplicates the skill's role and adds agent-spawn overhead for work that fits the skill pattern (instructions Claude follows in-context). Compound-engineering uses the same skill-not-agent pattern for docs, validating the choice. The skill catches doc-related needs (READMEs, ADRs, CHANGELOGs) at the right moment in the workflow without a separate agent.

**Implication:**
- PROJECT.md Gate 2 criterion "All 24 agents... functional" → "All 22 agents... functional".
- PROJECT.md section 3.0 goal updated; 3.3 and 3.5 corrected; Security Auditor noted to live in 3.4 only.
- CLAUDE.md "24 agents" → "22 agents".
- OPEN-QUESTIONS.md "Agent count" entry resolved and removed.

---

## 2026-04-25 — Token-cost concern resolved; PREPARE-phase token-budget trigger not firing

**Decision:** PROJECT.md's "Token budget is the highest risk" concern is resolved with measurement data. No phase comes close to the 40K threshold (~20% of 200K context).

**Measured (via `tools/measure-phase-costs.js`):**

| Phase | Skills | Tokens | % of 200K | Verdict |
|---|---|---|---|---|
| discuss | 2 | 3,881 | 1.9% | ok |
| plan | 3 | 6,537 | 3.3% | ok |
| execute | 5 | 12,761 | 6.4% | ok (largest) |
| verify | 2 | 3,616 | 1.8% | ok |
| review | 4 | 10,435 | 5.2% | ok |
| ship | 5 | 12,234 | 6.1% | ok |

**Rationale.** The original concern was that REVIEW would blow the budget loading 4 skills simultaneously. The measurement shows REVIEW at 5.2% — about a quarter of the alarm threshold. EXECUTE is the heaviest (5 skills, 6.4%) but still well within. Skills are smaller than feared; the 200K context window is larger than the original concern accounted for.

**Implication for the PREPARE-phase candidate (FUTURE-IDEAS.md):**
- One of the three PREPARE-phase promotion triggers was: "If `/sig:plan` ends up loading 5+ skills and the token budget blows."
- PLAN currently loads 3 skills at 6,537 tokens. **Trigger is provisionally NOT firing.** Even doubling the skill count would still fit well within budget.
- The other two PREPARE triggers (repeated user-language friction at the seam, two+ new skills landing homeless) remain active.

**Loader bug surfaced and fixed:** `estimatePhaseSkillCost` previously assumed 1:1 phase → directory mapping; cross-bound skills (e.g., `api-and-interface-design` lives in `skills/build/` but is bound to `plan`) reported 0 tokens. New `findSkillPath` helper in `context-monitor.js` searches across all skill phase directories. Tests added.

**Implication for chunking:**
- No chunking required for v1. The on-demand loader pattern from Agent Skills holds at current scale.
- If real-project usage shows any phase approaching 40K (e.g., REVIEW with adds + larger SKILL.md content over time), revisit.

---

## 2026-04-25 — Question patterns: three shapes, strongly-recommended-with-justification

**Decision:** Signal commands ask user-facing questions in exactly three shapes, codified in `references/question-patterns.md`:

1. **Strict enum** — schema-validated values; no "other" accepted (e.g., `/sig:calibrate`'s 5 diagnostic questions).
2. **3-options-plus-other** — the default for tradeoff questions; always 3 named options + free-text fallback + an explicit recommendation.
3. **Open-ended** — reserved for clarifying genuinely unknown intent at workflow openings (`/sig:new-project`'s opening, `/sig:escalate`'s "what's changed?").

The convention is **strongly recommended with explicit justification required for exceptions.** Strict enums are mandatory where schema requires a fixed value (correctness constraint). 3+other is the default for non-enum tradeoff questions. Open-ended is the rare case, justified in a command-markdown comment.

**Rationale.** Without a shared convention, phase commands drift into open-ended questions that slow users down and let Claude improvise inconsistently. Mandatory enforcement would fail real edge cases (the first "what are you building?" question doesn't fit 3+other; mid-question clarifications don't either). Loose suggestion would let drift creep back in. The middle path: default to the convention, document the exception in-line.

**Implication:**
- Milestone 2 Step 3's preamble pass also retrofits any non-conforming question patterns in the 6 phase commands.
- `references/question-patterns.md` is the authoritative source. Future command authors must reference it.
- Anti-rationalization tables in commands include question-pattern-specific entries (e.g., "I'll skip the recommendation since the user is in a hurry" → no, the recommendation is one word; the user can override in one word).
- The Socratic / guided-question UX OPEN-QUESTION is resolved and removed.

---

## 2026-04-25 — Orphan skills bound to existing phases (interim; PREPARE phase deferred to v2)

**Decision:** The four skills on disk that had no phase binding (`api-and-interface-design`, `frontend-ui-engineering`, `source-driven-development`, `deprecation-and-migration`) are bound to existing v1 phases as follows:

- `api-and-interface-design` → `plan` (designing endpoints, module boundaries, component contracts is a planning activity)
- `deprecation-and-migration` → `plan` (deprecation planning) + `ship` (cleanup at ship time)
- `frontend-ui-engineering` → `execute`
- `source-driven-development` → `execute`

The 5th unbound skill, `using-agent-skills`, is meta — correctly not phase-bound; loaded by user/system, not phase commands.

**Rationale:** During the audit, an ODI (Outcome-Driven Innovation) Universal Job Map parallel surfaced — Signal's 6 phases collapse ODI's *Locate* (research) and *Prepare* (set up scaffolding, fetch docs, verify framework patterns) into PLAN's tail. Two of the four orphans (especially `source-driven-development`, partially `api-and-interface-design`) are *prep* skills with no clean home in v1's phase decomposition. The theoretically clean fix is a new PREPARE phase between PLAN and EXECUTE; the practical v1 fix is to accept the imprecision and bind to existing phases.

**Implication:**
- v1: PLAN gains 2 skills (3 total), EXECUTE gains 2 skills (5 total), SHIP gains 1 skill (5 total). Token-cost impact will be measured in Milestone 2 Step 7.
- v2: PREPARE phase is logged as a candidate in `FUTURE-IDEAS.md` with three trigger conditions for promotion (token-budget signal, user-language signal, skill-binding signal).
- The orphan-skill OPEN-QUESTIONS entry is resolved and removed.

---

## 2026-04-26 — Dogfood approach: worktree + cherry-pick for Signal-on-Signal builds

**Decision:** When using Signal to build Signal itself (the dogfood pattern committed for Milestone 3 Task 1), follow this process:

1. Create a git worktree (`EnterWorktree` or `git worktree add`) from main HEAD on a fresh branch.
2. In the worktree, rename hand-rolled colliding files: `.planning/CONTEXT.md` → `.planning/BUILD-CONTEXT.md` and `.planning/STATE.md` → `.planning/BUILD-STATE.md`. Commit the rename as a worktree-only setup commit.
3. Run the Signal flow (`/sig:calibrate` → `/sig:discuss` → `/sig:plan` → `/sig:execute` → `/sig:verify` → `/sig:review` → `/sig:ship`) inside the worktree. The Signal-managed `PROFILE.md`, `CONTEXT.md`, `REQUIREMENTS.md`, `1-PLAN.md`, `1-RESEARCH.md`, `1-VALIDATION.md`, `1-PROGRESS.md`, `1-VERIFICATION.md`, `1-REVIEW.md`, and `1-SHIP.md` (a useful improvisation) write into `.planning/` cleanly.
4. After SHIP, cherry-pick or `git checkout` the **substantive files only** back to main (the new command file, helpers, tests, validator update, and PROJECT.md changes — not the `.planning/` dogfood artifacts).
5. Capture friction findings in main's `OPEN-QUESTIONS.md` and `DECISIONS.md`.
6. Keep the worktree branch around as a record (Action: `keep`, not `remove`).

**Rationale:** The Signal-build's hand-rolled `.planning/` (with its milestone-based meta-state) and Signal-managed `.planning/` (PROFILE / CONTEXT / STATE / `{phase}-*.md`) want the same filenames for some artifacts. A worktree isolates them so the dogfood is a true picture of Signal's behavior on a "real" project rather than a collision-noise mess.

**Implication:**
- Future dogfood passes (e.g., for `/sig:resume` if it ever needs an end-to-end pass; for v2 phase additions; for any Signal-on-Signal feature work) follow this protocol.
- `/sig:resume` itself was hand-rolled (not dogfooded) by design — using `/sig:resume` to build `/sig:resume` is a chicken-and-egg loop. The dogfood protocol does NOT apply when the feature being built is itself the resumption tool.
- Friction findings from the first dogfood (Signal-on-Signal for `/sig:status`) are now in `OPEN-QUESTIONS.md`: 5 issues, all small/triage-able, none gating ship.

---

## 2026-04-26 — `{phase}-` artifact prefix uses numeric form (`1-{ARTIFACT}.md`) in v1

**Decision:** Where commands write `{phase}-PLAN.md` / `{phase}-RESEARCH.md` / `{phase}-VALIDATION.md` / `{phase}-PROGRESS.md` / `{phase}-VERIFICATION.md` / `{phase}-REVIEW.md`, the `{phase}` substitution is the **numeric phase index starting at 1** (i.e., `1-PLAN.md`, `1-VERIFICATION.md`, etc).

This matches GSD's pattern (where multi-phase project work was first-class) and fits Signal v1's "one project = one linear flow" model — there's only ever phase `1` in v1, but the naming leaves room for v2 multi-feature lifecycle (where phase `2`, `3`, etc. become real).

**Rationale:** The OPEN-QUESTIONS.md `{phase}-` naming question was tied to two paths: numeric (GSD-style; `1-`) or simplified-no-prefix (just `PLAN.md`). Dogfood signal: numeric reads more naturally and doesn't break when the literal-substitution form would produce `PLAN-PLAN.md` (which is awkward). It also signposts the multi-feature future — users who eventually have `1-PLAN.md` and `2-PLAN.md` immediately understand the system.

**Implication:**
- Phase commands keep the `{phase}-` placeholder text in the markdown for now; users (and Claude reading them) substitute `1-` in v1.
- `/sig:resume`'s artifact-resolution probes try `1-{ARTIFACT}.md` first (per the locked convention), then `{ARTIFACT}.md` (the simplified form, still tolerated), then `{PHASE_NAME}-{ARTIFACT}.md` (defensive fallback).
- v2 multi-feature lifecycle work (if it lands) makes the numeric prefix load-bearing.
- The OPEN-QUESTIONS entry on `{phase}-` naming can be marked resolved once future runs confirm the `1-` convention sticks.

---

## 2026-04-26 — M3 Task 5 triage: workflow refinements from dogfood evidence

**Decision:** Five small workflow refinements applied to command markdown + references, all driven by FULL-tier and SKETCH-tier dogfood findings. None changes the 6-phase flow or the PROFILE.md schema; each codifies what the dogfood actually did or surfaces a subtle precedence rule that wasn't explicit before.

**The five refinements:**

1. **REVIEW gains a `PASS-WITH-FIXES` verdict** (in addition to PASS / FAIL). For Important issues whose total fix is < 50 LOC and tests stay green, the fix lands in REVIEW itself rather than ceremonially looping back to EXECUTE. FAIL is reserved for Critical issues, > 50 LOC fixes, or fixes that need re-planning. **Source:** M3 Task 2 dogfood — the URL shortener's REVIEW found 2 small Important issues (Content-Length pre-check, unhandled-error logging) that were silly to wrap in a full EXECUTE phase.

2. **Strict Nyquist accepts two evidence forms** (either is sufficient): per-test red→green git evidence, OR explicit attestation in `{phase}-VERIFICATION.md` that the test was written before the implementation. The atomic-commit-per-slice pattern from EXECUTE naturally supports the attestation form. **Source:** M3 Task 2 dogfood — TDD discipline was real but not preserved as per-test red→green commits.

3. **PLAN gains an Environment-check tail step (Step 6).** Confirms the dev runtime matches research's assumed runtime *before* EXECUTE rather than at first `npm install`. Cheap; surfaces drift at the right phase boundary. **Source:** M3 Task 2 dogfood — research assumed `better-sqlite3@11`/Node 22; dev machine on Node 25 needed `@12+`.

4. **DISCUSS gains a tier-aware NFR prompt** before generating REQUIREMENTS.md. FULL prompts for healthcheck / graceful shutdown / structured logging / security headers / rate limiting; FEATURE prompts a lighter set; SPIKE/SKETCH skip. Catches operational hygiene that less-experienced users would miss. **Source:** M3 Task 2 dogfood — F6 (`/healthz`), N1d, N3a/b/c added because Claude is experienced; a real user might not surface them.

5. **SKETCH 8-artifact floor codified** in `references/tier-definitions.md`. SKETCH still produces 8 `.planning/` files; that's deliberate (the project's memory is load-bearing even at the lowest tier), not a defect. No TRIVIAL tier in v1. **Source:** M3 Task 3 dogfood — the CSV-to-JSON one-shot demonstrated the floor; recommendation is to accept it (the contrast vs FEATURE/FULL is already 10–24x, pushing lower trades documentation value for marginal savings).

**Plus three minor clarifications** (not architectural — listed for completeness):
- `review.md` precedence note: `review_depth` is the master switch over `security_audit` / `performance_pass` / `simplification_pass`.
- `calibrate.md` rigor table footnote: `research_parallelism: 4` (FULL) is calibrated for novel domains; for known domains, downward-overriding to 2 saves ~30K tokens with no quality loss.
- `execute.md`: `1-PROGRESS.md` is implicit-optional for single-task plans.

**Plus implementation-level fixes** (`tools/lib/state.js`):
- `initState` default phase changed from `DISCUSS` to `CALIBRATE` (matches `/sig:new-project`'s expected sequence) and now accepts an explicit `initialPhase` parameter.
- `transitionPhase` dedupes `completedPhases` by phase name (recovery scenarios were producing duplicates).
- Test count: 93 → 96.

**Rationale.** Triage criterion: each fix had to be small, doc-or-config-only, and traced to a concrete dogfood observation. Larger architectural changes (slash-command testing harness, TRIVIAL tier, domain-novelty-aware research_parallelism) are deferred — they're worth doing only with more user signal than two dogfood passes provide.

**Implication.** OPEN-QUESTIONS.md goes from 20 active items to 2: tier-count validation (waits for real-user data) and slash-command testing harness (MILESTONE-4 candidate). Milestone 3 is now exit-criteria-clean for v1 ship-readiness.

---

## 2026-04-26 — Roadmap reorder: brownfield onboarding promoted to MILESTONE-4

**Decision:** `/sig:init` (brownfield onboarding for existing codebases that aren't yet using Signal) becomes MILESTONE-4. The previous MILESTONE-4 (v2 ports per `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`) moves to MILESTONE-5. The file `MILESTONE-4.md` is now the `/sig:init` plan; the prior content was renamed via `git mv` to `MILESTONE-5.md`, with sub-tranches renumbered `4a-f` → `5a-f` and the blocking criterion updated. *(Sub-tranche letters were later renamed to Epic IDs `M5.E1`–`M5.E6` in M4.t18, 2026-05-12.)*

**Rationale.** Three user journeys exist for Signal: greenfield (`/sig:new-project`), existing-Signal-project (`/sig:status` + `/sig:resume`), and brownfield (existing codebase, no Signal yet). The first two have clean v1 entry points; the third does not — the current path is `/sig:new-project` + `/sig:calibrate` Scenario A + `/sig:discuss --assumptions`, which is friction-rich and easy to skip steps.

Brownfield is almost certainly the most common real-world adoption path. Greenfield Signal projects are rare; most users have existing code they want to bring discipline to. Without a dedicated entry point, the first thing prospective users see when adopting Signal is a friction-rich path that requires reverse-engineering Signal's mental model — which kills adoption.

This is a **v1-completing feature, not a v2-expanding one.** v2 ports add new capabilities; brownfield-onboarding is closing a hole in v1's user-facing surface area. Treating it as MILESTONE-4 (rather than buried in `FUTURE-IDEAS.md` as a v1.5 candidate) reflects that priority.

**Implication:**
- v0.1.0 ships v1 narrow as planned (current Milestones 1–3).
- MILESTONE-4 begins next, on a fresh context per the session-flow plan.
- MILESTONE-5 (the previous MILESTONE-4) remains gated on real-user signal and now also waits on MILESTONE-4 completion. The v2-ports scope itself is unchanged; only its position in the queue moved.
- No license / attribution changes — `/sig:init` is Signal's own design, not a port.

**Implementing session should:** read the new `MILESTONE-4.md` (which is detailed enough to pick up cold), and follow the "How to start a session for MILESTONE-4" appendix at the bottom of that file.

---

## 2026-04-26 — `/sig:init` scanner count fixed at 4 (no tier-aware reduction)

**Decision:** `/sig:init` always spawns all 4 scanner agents (stack / structure / activity / quality) in parallel. The MILESTONE-4 spec mentioned a possible tier-aware reduction (SKETCH = 2 scanners), but Wave 2 implementation locked the count at 4.

**Rationale.** Two reasons made the tier-aware path moot:

1. **Calibration happens *after* the scan.** `/sig:init` writes LANDSCAPE.md before PROFILE.md exists. There's no tier to gate on — the scan must complete before tiering becomes possible. The only way to make scanner count tier-aware would be to *guess* a tier from the scan itself (MILESTONE-4 design decision #5, "codebase-novelty signal feeding calibration"), and that guess only matters in retrospect — by the time a guess could fire, the scan is already done.
2. **Brownfield projects rarely calibrate to SKETCH.** SKETCH is for throwaway / hours-horizon work. A codebase old enough to brownfield-init has reversibility and horizon characteristics that almost always push it to FEATURE or higher. Optimizing scanner count for the rare SKETCH brownfield case would be premature optimization.

The token cost of 4 vs 2 scanners is real but bounded — each scanner output caps near 200-300 lines of structured markdown. Total scan-to-LANDSCAPE budget is comfortable within the ~12K-token EXECUTE-phase ceiling Signal already operates within.

**Implication:**
- MILESTONE-4 design decision #1 ("scanner agents vs in-command logic") is also resolved by this lock — the decision was framed as a SKETCH-optimization tradeoff (embedded logic is cheaper than agent fan-out at SKETCH); since SKETCH brownfield is rare, the agent-fan-out cost is the right default.
- Future profiling may surface a real cost issue at FULL on huge monorepos. If so, the right response is *parallelism throttling within the scanners* (e.g., "stack scanner samples 1000 files instead of all"), not reducing scanner count.

---

## 2026-04-26 — M4.t15 dogfood: scanner-spawn fallback path locked; agent-registration mechanism flagged

**Decision:** `/sig:init` Step 2 now documents a two-path agent spawn: (1) primary path uses `subagent_type: {name}-scanner` via the Task tool — works post-marketplace-install if Signal's plugin agents register namespaced; (2) fallback path uses `subagent_type: general-purpose` with the agent's full markdown definition embedded in the prompt — works in dev mode and as a guaranteed escape hatch. The init.md command instructs Claude to detect `Agent type '{name}' not found` and switch paths automatically.

**Why this matters.** M4.t15 dogfood (`/sig:init` on Signal itself) revealed: the Task tool in dev mode does NOT see Signal's `agents/scanners/*-scanner.md` even though they're auto-discovered as command-list entries. Available agents in dev sessions are harness defaults + agents from properly-installed-via-marketplace plugins (the visible `gsd-*` agents from a separate gsd plugin install). This blocks the named-subagent path entirely until Signal itself is marketplace-installed.

**Three open unknowns flagged for later validation:**
1. **Does marketplace install register Signal's agents?** Unknown until we publish to marketplace and test. Parallel: `gsd-*` agents do appear, so the mechanism exists — but Signal's agent-frontmatter format may need to differ from what we shipped.
2. **What namespacing convention applies post-install?** The `gsd-*` prefix suggests installed plugins get prefixed agent names. If so, init.md Step 2's `subagent_type: stack-scanner` references will need to become `subagent_type: signal-stack-scanner` (or whatever prefix Claude Code assigns).
3. **Is the auto-fallback-detection robust?** The "if Task tool returns 'Agent type ... not found', switch to general-purpose" pattern needs to handle both error message wording variations and silent failures.

**Implication for shipping:**
- The fallback path makes `/sig:init` immediately usable in dev mode and after marketplace install regardless of namespacing — removes the blocker.
- Before publishing to the marketplace, run a fresh-install test to verify whether named subagents resolve and what the prefix is. If they do resolve, update the init.md table to reference the resolved names; if they don't, the fallback path becomes the permanent path.
- The synthesis pipeline (Steps 3+4 of init.md) is unaffected by this — it consumes scanner outputs regardless of how the scanners were spawned.

**Other M4.t15 dogfood findings** (not architecturally meaningful but worth noting): structure-scanner exclude list was missing `.dogfood/` and `.claude/worktrees/` (added); activity-scanner health rules didn't distinguish "young+active" from "established+active" (rule 5 threshold loosened to `<50 commits + <60 days` plus tiebreaker note for rule 4 with age <90 days); structure-scanner co-located test detection had a false positive for files inside dedicated test directories (corrected). Full runlog: `.dogfood/M4-INIT-DOGFOOD/RUNLOG.md`.

**Validation outcome:** the synthesis pipeline (LANDSCAPE.md template + baseline PROJECT.md template) works as designed. Generated artifacts on Signal-itself were genuinely useful — the LANDSCAPE.md correctly identified Signal as a "planning-driven Claude Code plugin in mid-shipping its first release" with high-confidence inference + 4 sharp open questions for the user. PROJECT.md baseline forced abstaining from forward-looking fields (Success Criteria, Done When, Scope-out) via `[FILL IN]` markers, which is the design intent.

---

## 2026-05-12 — Vocabulary lock: Milestone / Epic / Phase / Wave / Task; ID is persistent identity

**Decision:** Lock Signal's work-unit vocabulary as **Milestone** (M1, M2, …) → **Epic** (M5.E1, M5.E2, …; optional mid-layer) → **Task** (M4.t17, M5.E3.t2; lowercase `t`). Phase and Wave keep their meanings (workflow stage; parallel-execution batch within a phase). The previously-shipped term *Tranche* is retired and replaced with Milestone. Full vocabulary table lives in `PROJECT.md` § Vocabulary.

**Persistence rule (the load-bearing part):** the **ID is persistent identity, never changes.** Once assigned, a task's ID is its address forever — across renames, re-orderings, escalations, and milestone reshuffles. Phase and Wave are *metadata* on the work unit, not part of its address.

**Trigger.** 2026-05-12 conversation. User asked "where the fuck did Tranche come from?" Investigation traced it to a single commit (`236aecc`, 2026-04-22) that scaffolded `.planning/` with hand-rolled file names and picked "Tranche" with no principled grounding. None of the 9 upstream inspiration repos in `.upstream/` use `Tranche`; GSD (Signal's primary upstream) uses `Milestone`. The term is a finance import (loan tranches, bond tranches), fancy-sounding but opaque to anyone outside finance — fails the "could a new contributor guess what this means" test.

**Why ship before v0.1.0.** Once `Tranche` lands in a tagged release, removing it gets harder (release-note hits, PR references). Better to never have a published Signal that uses the dumb word.

**Rationale per term:**
- *Milestone* aligns Signal with GSD's vocabulary; downstream-of-upstream divergence has a cost (cognitive switching when reading both ecosystems' docs) and no benefit here.
- *Epic* names the structure Signal already invented as awkward "sub-tranches" (M5 had 5a–5f). Borrowed from common product-management vocabulary; intuitive without explanation.
- *Phase* is reserved for the 6-phase workflow only (`calibrate → discuss → plan → execute → verify → review → ship`), so the word stays unambiguous. GSD overloads Phase to mean both a workflow stage AND a numbered work unit; Signal's separation is cleaner and was deliberately preserved in this refactor.
- *Wave* is unchanged from GSD — a parallel-execution batch within a single phase.
- *Task* uses lowercase `t` in IDs (`M4.t17`, not `M4.T17`) so the three nested levels (M / E / t) are visually distinct at a glance.

**Implication.**
- All `.planning/TRANCHE-*.md` files renamed to `MILESTONE-*.md` (5 renames via `git mv`, history preserved).
- All prose references to `Tranche`/`tranche` replaced with `Milestone`/`milestone`. T-prefix IDs (`T4.17`) replaced with M-prefix IDs (`M4.t17`). Approximately 17 `.md` files touched.
- M5's prior sub-tranches (`5a`–`5f`) renumbered to `M5.E1`–`M5.E6`.
- `.upstream/` and `CHANGELOG` are excluded — frozen historical references stay frozen. Commit-message references also unchanged.
- Migration prompt for downstream user projects (Signal-managed repos with old `.planning/TRANCHE-*.md`) published at `docs/migration-vocab-v0.1.0.md`.
- v0.1.0 ship is now gated only on F2 (marketplace-install plugin-agent registration); the vocabulary blocker is closed.

---

## 2026-05-16 — M4.5.E6 design decisions (resume reliability)

**Decision (D1) — `STATE.md` schema = YAML frontmatter + markdown body + `schema_version`.**
Structured fields move into a `---` frontmatter block at the top of `STATE.md`; narrative markdown stays below for humans. Helpers in `tools/lib/state.js` parse via `js-yaml` (new dependency), not regex.

**Why this shape over hybrid-markdown or pure-sections:** parse-or-throw is the load-bearing property. Malformed state must fail loudly at read time, not be silently mis-read into a partial picture that `/sig:resume` then presents as truth. PROFILE.md already uses YAML frontmatter (`schema_version: 1`), so this is consistency, not novelty. Atomic shape — `current_task` is one structured object that can't have id-but-no-commit drift. Pure markdown sections were ruled out specifically because partial-update is invisible (writer crashes between section 4 and 5, file looks valid but is internally inconsistent — exactly the failure mode this Epic exists to eliminate).

**Schema (locked at PLAN time, refinable):**
```yaml
schema_version: 1
phase: EXECUTE                         # one of CALIBRATE/DISCUSS/PLAN/EXECUTE/VERIFY/REVIEW/SHIP
current_epic: M4.5.E6                  # null if no epic-level structure (greenfield)
current_wave: 3                        # null outside EXECUTE
current_task:                          # null if no task in flight
  id: S3.t2
  commit: a1b2c3d                      # null if task started but no commit yet
  status: in_progress                  # in_progress | done | blocked
  started_at: 2026-05-16T14:22:00Z
completed_phases:
  - {phase: CALIBRATE, at: 2026-05-14}
blockers: []                           # list of {text, raised_at, resolved_at?}
last_decision_at: 2026-05-16T13:10:00Z # timestamp of last appendDecision() call
last_updated: 2026-05-16T14:22:00Z
```

**Implication:** `js-yaml` added to `dependencies` (S1). All readers in `tools/lib/state.js` + `tools/lib/status.js` + any other STATE.md consumer updated in S1. Backwards-compatible reader: pre-S1 STATE.md (Signal's own included) detected by missing `schema_version`, auto-upgraded on first write with the existing freeform body preserved as the markdown-body section.

---

**Decision (D2) — `/sig:checkpoint` UX = two-mode with rename: default quick, `--context` for deep capture.**
Default `/sig:checkpoint` silently refreshes STATE.md from git (no prompts). `/sig:checkpoint --context` adds two prompts: "any decisions to lock?" → CONTEXT.md, "any new open questions?" → OPEN-QUESTIONS.md.

**Flag name `--context` (not `--interactive`):** semantically resonant — "add more context" right before "context clear." The flag literally describes its purpose; the user invokes it as the deliberate pre-context-clear ritual.

**Mitigations to prevent the `--context`-forgotten failure mode** (the legitimate risk of this two-mode split): three baked-in disambiguators so user can't silently under-capture without seeing the gap:
1. **Quick-mode output always ends with a visible banner:** `💡 About to clear context? Run with --context to also capture decisions + open questions.`
2. **README leads the `/sig:checkpoint` section with:** "use `--context` before any context clear."
3. **`/sig:resume`'s staleness check (S4) is the safety net:** if user forgot `--context` and meanwhile decisions accumulated, the staleness warning surfaces it on next resume.

**Why this split over always-prompt:** the user's intent is two distinct jobs — quick checkpoints for *during-work* state ratcheting (run frequently between tasks, friction would cause drop-off) vs. deliberate *pre-context-clear* deep capture. Always-prompt conflates them; the mitigations above prevent the worst-case silent miss without forcing chatty defaults.

---

**Decision (D3) — STATE.md refresh cadence during EXECUTE = per-task.**
Executor agent calls `setCurrentTask({epic, wave, task, status: in_progress})` at the start of its 6-step process and `clearCurrentTask({commit, status: done})` after its atomic commit. STATE.md is written twice per task (start + end), not per-commit.

**Known recoverable gap:** mid-TDD context-clears (between the red test-commit and the green implementation-commit of a single task) won't have STATE.md update for the intermediate commit. `/sig:resume` shows "task X in_progress, started at TIME"; user must read `git log` to see the intermediate commit landed. Recoverable, low frequency, acceptable cost.

**Why not per-commit:** would require wrapping git commit or installing post-commit hooks — adds significant implementation complexity for the rare mid-TDD case. Why not per-wave-boundary: that IS the current behavior (functionally) and is exactly what the user is finding inadequate; mid-wave context-clears are the *common* case for long-running EXECUTE.

---

**Decision (D4) — Migration policy = auto-extend on first write + one-time notice.**
Existing `.planning/STATE.md` files (including Signal-on-Signal's own freeform STATE.md) are detected at first-write time by the absence of `schema_version` in YAML frontmatter (or absence of frontmatter entirely). On detection, the writer:
1. Reads the existing file as freeform markdown body
2. Generates a minimal frontmatter block with `schema_version: 1`, `phase: <inferred from "## Current Phase" if present, else "EXECUTE">`, and timestamp
3. Writes the new file with frontmatter + the original body preserved verbatim
4. Prints a one-time notice: `📋 STATE.md upgraded to schema_version 1. Original content preserved below frontmatter. See DECISIONS.md 2026-05-16 for details.`

**Why not require explicit migration command:** silent upgrades are too easy to miss; explicit commands add friction for zero gain since there's nothing the user needs to decide. One-time notice is the right disambiguation.

---

**Decision (D5) — `markStale()` trigger = end-of-phase (VERIFY and REVIEW).**
`verify.md` and `review.md` call `markStale()` after writing their report — updates STATE.md `last_updated` to current timestamp. This is *separate* from D3's per-task EXECUTE updates; it ensures phase-completion is itself a state event.

---

**Decision (D6) — `/sig:resume` staleness-check scope = state-affecting `.planning/*` files only.**
Compare `STATE.md.last_updated` against `git log -1 --format=%ct --` for these paths only:
- `.planning/STATE.md`
- `.planning/CONTEXT.md`
- `.planning/*-PROGRESS.md`
- `.planning/*-PLAN.md`
- `.planning/*-VERIFICATION.md`
- `.planning/*-REVIEW.md`

**Excluded** (commits to these do not trigger staleness warning): `FUTURE-IDEAS.md`, `OPEN-QUESTIONS.md`, `DECISIONS.md`, `MILESTONE-*.md`, `PROJECT.md`, `LANDSCAPE.md`. These are knowledge-capture / spec / history files — touching them doesn't invalidate STATE.md's "where am I in the workflow" answer.

**Output when stale:** prepend to briefing: `⚠ STATE.md may be stale — N commit(s) to state-affecting files since last update. Run /sig:checkpoint to refresh.`

---

**Decision (D7) — Test approach = unit tests + fixture-based end-to-end (both).**
Per M4.5.E2 precedent (~40 tests). Per-helper unit tests for every new `tools/lib/state.js` function. Plus a fixture-based integration test simulating the end-to-end scenario: synthetic fixture project runs a fake EXECUTE wave, then "context-clears" (drops in-memory state, re-reads from disk), then validates that `/sig:resume`'s briefing renders the expected text. This is the test that proves criterion #8 (the dogfood criterion) before the manual dogfood runs.

---

**Decision (D8) — `/sig:checkpoint` auto-write policy = show-diff-and-confirm under `gate_strictness: strict`.**
When `/sig:checkpoint` detects state to update (per D3-derived git-log diff), it shows the proposed STATE.md changes as a diff and prompts user confirmation before writing — under `gate_strictness: strict` (FULL tier default). Under `light` it shows the diff but writes without confirmation. Under `off` it writes silently. The `--context` deep-capture prompts are not gated by this (they're always-prompted-or-skip when `--context` is set).

---

**Decision (D9) — Auto-protocol failure handling = tier-aware.**
If a state-update call (e.g., `setCurrentTask`) fails (disk full, permission error, lock contention):
- **FULL tier (`gate_strictness: strict`):** halt the task — state-update is a gating prerequisite. Task does not start until state can be recorded.
- **FEATURE tier (`gate_strictness: light`):** log warning, continue task. Best-effort.
- **SKETCH/SPIKE tier:** N/A (auto-protocol disabled per S5 tier-aware behavior).

**Rationale:** matches the existing `gate_strictness` semantics across the workflow — strict gates on quality-relevant failures; light surfaces but doesn't block.

---

**Implications across all 9 decisions:**

- **New runtime dependency:** `js-yaml` (S1). First non-test runtime dep Signal has added since v0.1.0 — versioning policy from E1 applies.
- **All STATE.md readers updated in S1:** `tools/lib/state.js`, `tools/lib/status.js`, anything in `commands/` that reads STATE.md (resume, status, escalate, init).
- **`/sig:checkpoint` is a new command:** `commands/checkpoint.md` + helpers in `tools/lib/state.js` + validator update (S2/S5).
- **`commands/checkpoint.md` is not tier-gated** — same class as `/sig:status`, `/sig:resume`, `/sig:add` (capture should always work).
- **The dogfood acceptance criterion (#8) becomes load-bearing:** E6 itself runs through EXECUTE under the new protocol. If `/sig:resume` after a real mid-E6 context-clear doesn't render an accurate briefing, that's the bug-find that proves the implementation isn't done.
- **Backwards compatibility is bounded:** any Signal-managed project that updates from < 0.1.x to E6's release gets STATE.md auto-upgraded on first write. Documented in CHANGELOG + migration note (analogous to `docs/migration-vocab-v0.1.0.md`).
- **DISCUSS-phase note on strict gate:** asked 3 of the 9 gray areas via `AskUserQuestion` (the genuinely-undecided UX/architecture trade-offs); locked the other 6 with judgment to honor user's velocity preference. All 6 self-locks are explicit and reviewable in this entry; user has flagged none for revision.

---

## 2026-05-17 — M4.5.E6 PLAN-phase research addendum (D1 amended + D10–D16 added)

`/sig:plan` Step 2 ran 4 parallel research agents (codebase, project/external, assumptions-analyzer, phase-researcher) per `research_parallelism: 4`. Outputs surfaced one research-settled correction to D1 and seven new D-candidates. After user review (D10 + D15 confirmed via `AskUserQuestion`; D11/D12/D14/D16 Claude-locked with rationale and user-approved):

### D1 — AMENDED (research correction, not re-litigation)

**Original D1 (2026-05-16):** STATE.md schema = YAML frontmatter via `js-yaml` (new runtime dependency).

**Amended D1 (2026-05-17):** STATE.md schema = YAML frontmatter via the existing `yaml` (eemeli) package — already in `package.json` as `yaml@^2.8.3`, already used by `tools/lib/profile.js`. **No new runtime dependency.**

**Why amended:** All 4 research agents independently flagged the existing `yaml` package. Original D1 reference to `js-yaml` was research-uninformed. The eemeli `yaml` library covers every D1 requirement (parse-or-throw, frontmatter round-tripping, comment preservation, schema validation) with fewer transitive deps, better security history (CVE-2013-4660 was js-yaml; CVE-2025-64718 was js-yaml prototype pollution; eemeli `yaml`'s only known issue CVE-2026-33532 is patched in 2.8.3 which Signal is already on).

**Implications:**
- The "first new runtime dep since v0.1.0" framing is removed. No versioning-policy ceremony needed.
- One YAML lib across the codebase — consistent error semantics between PROFILE.md and STATE.md parsing.
- Smaller install footprint (good for M4.5's stranger-adoption thesis).
- Hand-rolled frontmatter splitter (~20 lines) using existing `yaml` is right call over adding `gray-matter` (5 transitive deps).
- Use `{ schema: 'core' }` option on parse for strictest YAML-1.2 Core compliance (defensive, free).

### D10 — STATE.md tracks parallel tasks as a list (`current_tasks[]`)

Schema field `current_task: {...}` becomes `current_tasks: [...]`. Each parallel executor adds its own entry on `setCurrentTask`, removes on `clearCurrentTask`. Briefing renders the array — `In-flight (N tasks in Wave M): ...`.

**Why:** EXECUTE waves run tasks in parallel (per `commands/execute.md` § 2). A single-object schema silently lies during parallel execution. The original 9 decisions missed this; the assumptions audit caught it (A1.1, A10.4). Honest picture is load-bearing for unambiguous handover — the Epic's whole point.

**Helper API impact:** `setCurrentTask({...})` appends; `clearCurrentTask({task_id, commit})` removes by id; new helper `getCurrentTasks(baseDir)` returns the array. Renaming from D1's `current_task` is locked.

### D11 — Staleness check uses git commit hash, not wall-clock timestamp

Schema field `last_updated: <iso timestamp>` is augmented with `last_updated_commit: <sha>`. Staleness check becomes: `git rev-list <last_updated_commit>..HEAD -- <state-affecting-paths>` returns non-empty.

**Why:** Wall-clock vs git committer-date skew across machines (NTP drift, manual `git commit --date=`) causes false positives/negatives in D6's check. Hash comparison is clock-free. Editor auto-save can't bump it accidentally. Test fixtures are simpler (mock rev-list output instead of reconciling two time domains).

**Helper API impact:** `isStateStale(baseDir)` returns `{stale: boolean, commitCount: number, commits: [{sha, subject}]}`. Replaces the timestamp comparison originally implied by D6 — D6's scope (which files trigger) stays unchanged.

### D12 — Orphan `in_progress` detection in `/sig:resume` + `/sig:checkpoint`

If any `current_tasks[]` entry has `status: in_progress` AND `git log --since=entry.started_at -- .planning/` shows no commits referencing that task ID AND `now() - started_at > 30 minutes`, surface via `AskUserQuestion` strict-enum:
- `clear` — call `clearCurrentTask({task_id, status: aborted})` and proceed
- `keep` — leave entry; user knows the task is genuinely long-running

**Why:** The central failure mode the Epic exists to fix would otherwise be re-introduced by the fix itself. Without orphan detection, a crashed/timed-out executor leaves a permanent in-flight entry; `/sig:resume` faithfully reports it; user is stuck. The assumptions audit (A5.1) flagged this as the highest-risk implicit assumption — should have been in the original 9.

**Helper API impact:** `detectOrphans(baseDir)` returns `[{taskId, startedAt, ageMs}]`. Both `/sig:resume` and `/sig:checkpoint` call it as part of their normal flow.

### D13 — merged into D10

A1.1 and A10.4 from the assumptions audit both flagged the wave-parallel issue. Combined resolution lives in D10. D13 number reserved but unused.

### D14 — Strict three-way schema detection (no silent inference)

Reader logic in `state.js`:
1. **Frontmatter present + `schema_version: 1`** → parse normally
2. **Frontmatter present + `schema_version: <other>`** → throw `StateSchemaError: STATE.md was written by a newer Signal version. Upgrade Signal or roll back the file.`
3. **No frontmatter at all** → trigger D4 migration (auto-extend with one-time notice)
4. **Frontmatter present but no `schema_version`** → throw `StateSchemaError: STATE.md has YAML frontmatter but no schema_version. Refusing to auto-upgrade to avoid clobbering user-authored fields. Add 'schema_version: 1' manually if migration is intended.`

**Why:** Prevents silent downgrade when a future-version STATE.md is read by an older Signal install (the `gh` CLI anti-pattern flagged in project-researcher output). Prevents auto-migration from clobbering user-authored frontmatter that happens to lack schema_version. The assumptions audit (A4.1) named this as HIGH risk for silent corruption.

### D15 — Signal-on-Signal STATE.md uses the standard migration, gated by a dry-run review

D4's blanket migration policy applies to Signal's own `.planning/STATE.md` (no premature special case). **However, before S1 ships, the planner MUST:**

1. Copy `.planning/STATE.md` to `/tmp/sig-state-migration-dryrun.md`
2. Run the migration code against the copy
3. Capture the before/after diff in `M4.5.E6-RESEARCH.md` as an addendum
4. Human review: does the migrated file render useful info via `/sig:resume`?
5. If acceptable: ship normally
6. If unacceptable: escalate to D15-fallback (separate `.state.yaml` for structured data; STATE.md stays freeform narrative) before code lands

**Why:** Signal-on-Signal's STATE.md is freeform-narrative (270+ lines as of 2026-05-17), the most-likely-to-look-weird migration case. The assumptions audit (A6.1, A10.5) flagged this as HIGH risk for the dogfood criterion #8 — the very test of the Epic could fail on Signal's own data. Dry-run forces explicit verification on the most-uncertain case without locking a premature carve-out.

### D16 — `/sig:checkpoint --context` appends to BOTH CONTEXT.md and DECISIONS.md

`--context` mode prompts for decisions + open questions. The decision-capture path AMENDED:
- "Any decisions to lock?" → appends to `CONTEXT.md` § Locked Decisions (as before)
- **AND** appends a one-line entry to `DECISIONS.md`: `## YYYY-MM-DD — Checkpoint-captured: <verbatim user text>` (new in D16)
- "Any new open questions?" → appends to `OPEN-QUESTIONS.md` (unchanged)

**Why:** CONTEXT.md is the working-set view (curated, can be regenerated); DECISIONS.md is the immutable audit log (append-only). Decisions captured via `/sig:checkpoint --context` must land in both or the audit trail silently fragments — the assumptions audit (A9.1) flagged this as a MEDIUM-HIGH gap in D2. Same user input, two destinations.

---

**Combined implications across D1-amendment + D10–D16:**

- **Helpers (new):** `setCurrentTask`, `clearCurrentTask`, `getCurrentTasks`, `addBlocker`, `clearBlocker`, `appendDecision`, `markFresh` (renamed from `markStale` for clarity — the function refutes staleness by updating `last_updated`), `isStateStale`, `detectOrphans`, `upgradeStateFile`.
- **Error classes (new):** `StateSchemaError` (read-side: malformed YAML, schema_version unknown, or frontmatter-without-version), `StateWriteError` (write-side: ENOSPC, EACCES, lock contention).
- **Refactor (shared utilities):** Extract `atomicWrite` + `acquireLock`/`releaseLock` from `tools/lib/add.js` to new shared modules `tools/lib/atomic-write.js` and `tools/lib/file-lock.js`. add.js + new state.js helpers both import from the shared modules. No new dependencies — pure reorganization.
- **Refactor (testability):** Extract `commands/resume.md`'s briefing-rendering logic into `tools/lib/resume.js#renderResumeBriefing` so AC#7 + AC#8 (the end-to-end context-clear simulation) can be tested in code, not only manually.
- **Test count delta:** ~30-45 new tests (research's estimate of 25-35 + 6-10 for the new decisions). Matches M4.5.E2.S1's +40 precedent.
- **No new runtime dependencies.** D1's amendment removes the only one originally implied.
- **Schema field shape locked:**
  ```yaml
  ---
  schema_version: 1
  phase: EXECUTE
  current_epic: M4.5.E6
  current_wave: 3
  current_tasks:                # array per D10
    - id: S3.t1
      epic: M4.5.E6
      wave: 3
      commit: null
      status: in_progress
      started_at: 2026-05-17T09:22:00Z
  completed_phases:
    - {phase: CALIBRATE, at: 2026-05-14}
  blockers: []
  last_decision_at: 2026-05-17T13:10:00Z
  last_updated_commit: a1b2c3d   # per D11
  last_updated: 2026-05-17T14:22:00Z
  ---
  ```

---

## 2026-05-19 — F2 resolved: outcome (a)

**Decision:** `/sig:init` Step 2's agent-spawning question (F2) — open since v0.1.0 — is empirically resolved as **outcome (a)**: all 25 Signal agents auto-register post-marketplace-install via the naming convention `sig:<subdirectory>:<name>` (e.g., `sig:scanners:stack-scanner`). The Task tool spawns them via `subagent_type` without "Agent type not found" errors and without falling back to `general-purpose`. No agent restructure needed; the nested `agents/<category>/<name>.md` layout works as designed.

**Evidence:** R1 row of `docs/install-verification.md` (2026-05-19, maintainer business box, macOS, v0.1.2 marketplace install). `/agents` listed all 25 Signal agents under the namespaced convention; `/sig:init` on a fresh shallow clone of `expressjs/express` ran end-to-end with all 4 scanners spawning in parallel via named subagent_type, producing 4 substantive scan files + LANDSCAPE.md + baseline PROJECT.md + STATE.md.

**Rationale:** This was the headline open question gating confident promotion of v0.1.0+. M4.5.E1.S2's three-way decision tree (outcome a / b / c) anticipated up to 26 agent files needing flat-restructure if Claude Code's plugin loader couldn't see nested layouts. Empirically that worst case does not exist — the nested layout registers cleanly, the production path is named-subagent spawn, and the documented fallback path in `commands/init.md` Step 2 is now correctly characterized as dev-mode-only.

**Implication:**
- **M4.5.E1.S2 Phase B does NOT fire.** The 26-agent flat-restructure work (outcome c) is permanently shelved.
- **`commands/init.md`'s line 170 speculative paragraph is updated** in this same change to reflect F2's resolution (replaces "if marketplace install applies a `signal-` prefix..." with the confirmed `sig:<subdirectory>:<name>` convention).
- **M4.5.E1.S2 is shipped on Phase A alone.** S2 acceptance criteria #4–#5 (validator REQUIRED_AGENTS expansion, file moves) are now n/a per outcome.
- **Naming nuance worth noting for future reference:** the PLAN-time prediction was `sig:<name>` flat; actual is `sig:<subdirectory>:<name>` nested. The `subagent_type` table in `commands/init.md` Step 2 currently uses bare names (`stack-scanner`); Claude Code's plugin loader appears to resolve them. No change needed to the table for this run, but if a future Claude Code version requires fully-qualified `subagent_type` values, the table will need updating in lockstep.
- **Side-discoveries are routed to a new Epic M4.5.E7.** The R1 run surfaced a synthesizer character-eating bug in LANDSCAPE.md + PROJECT.md output and three install-path UX papercuts (stale `gitCommitSha`, no uninstall verb in `/plugin` UI, disable state survives uninstall). These are not F2-related and get their own dedicated work.

**Reference:** Full run log in `docs/install-verification.md` § R1. PLAN source: `.planning/archive/M4.5/E1/M4.5.E1-PLAN.md` Slice 2. Updated S2 status in `.planning/archive/M4.5/E1/M4.5.E1-PROGRESS.md`.

---

## 2026-05-21 — M4.5.E7 DISCUSS locks: synthesizer fix + troubleshooting docs strategy

**Context:** First DISCUSS run for M4.5.E7 (synthesizer prose-quality + install-UX hardening). PROFILE.md tier FULL; `gate_strictness: strict`. Four gray areas surfaced + locked via `AskUserQuestion`; all four resolved on the recommended option.

**D-E7-1 — Synthesizer fix sequence: tests-first, then iterate.**

Approach: write regression tests for all 6 documented bug patterns from R1's Express dogfood (`## Ierred goals & uncertainties`, `## ints`, `is | Top-level entry (224 bytes)`, `--checkt/ test/acceptance/`, the concatenated sentence boundary, the mid-sentence drop in PROJECT.md Notes) **before** investigating root cause. Tests pin the contract; fix surface (`tools/lib/landscape.js` regex/slicing OR the synthesizer-agent prompt-handoff OR both) is whatever makes the tests go green. Rationale: FULL tier's `tdd_required: true`; regression tests survive even if the fix path changes mid-investigation; locks the behavioral contract before guessing at root cause.

**D-E7-2 — Troubleshooting docs live at `docs/install-troubleshooting.md`.**

New dedicated page organized by symptom (P1 stale `gitCommitSha` short-circuit, P2 no uninstall verb in `/plugin` UI, P3 disable state survives uninstall+reinstall). Each entry: symptom → root cause (Claude Code-side behavior) → copy-paste resolution commands. Linked from README's existing Troubleshooting section. Rationale: strangers find install fixes by searching the symptom; matches MILESTONE-4.5.md § E7 spec recommendation; keeps README pitch-shaped (per E3's planned rewrite).

**D-E7-3 — Validator-side synthesizer sanity-check: deferred to FUTURE-IDEAS.**

The optional "garbled-output detector" item from the E7 scope is **not** included in this Epic. Rationale: once the 6 regression tests are green and the synthesizer rerun on `expressjs/express` produces clean output, a validator-side detector loses most of its marginal value. Logged as a FUTURE-IDEAS entry to revisit if quality regressions emerge later or if the synthesizer surface gains new failure modes. Keeps E7 sized to its stated 1–2 day estimate.

**D-E7-4 — E7 slices into 2 ship-events.**

- **S1 — Synthesizer fix.** Regression tests (6 documented patterns + likely sibling cases at heading/table/sentence/fenced-code boundaries) → root-cause investigation + fix → synthesizer rerun on `expressjs/express` produces clean output. Ships first; higher quality-blocker.
- **S2 — Install troubleshooting docs.** `docs/install-troubleshooting.md` written (P1/P2/P3 documented with workarounds) + README link added + CHANGELOG entry. Ships second; small, doc-only.

Rationale: two distinct findings (synthesizer ≠ install UX) → two slices keeps PRs small + independently reviewable; matches the slicing pattern Signal already used on E2/E6. Single-PR bundling was considered but rejected for FULL-tier (slice boundaries help future archaeology).

**Non-functional requirements (FULL-tier NFR checklist):** E7's surface is internal markdown generation (synthesizer) + static documentation files. **All five FULL NFR items (health probe, graceful shutdown, structured request logging, security headers, rate limiting) are N/A** — no service, no network surface, no exposed endpoint. Explicitly recorded so `/sig:plan` doesn't re-litigate.

**Implication for PLAN:**
- Two artifacts to produce in PLAN: `M4.5.E7-RESEARCH.md` (root-cause hypotheses, scanner-output → synthesizer pipeline mapping, fix-path tradeoffs) + `M4.5.E7-PLAN.md` (vertical slices, task breakdown, Nyquist test mapping).
- Expected test delta: 6 documented patterns × 1 regression test each = 6 minimum, plus 4–8 sibling-case tests = ~10–14 new tests. Total 366 → ~380.
- Validator changes: probably none (no new commands, no new agents). Confirm during PLAN.
- Docs changes for S2: new `docs/install-troubleshooting.md` + 2-line README addition + CHANGELOG entry under the patch-release header.

**Reference:** Acceptance criteria in `.planning/archive/M4.5/E7/M4.5.E7-REQUIREMENTS.md` (written during this DISCUSS). MILESTONE-4.5 § E7 retains the human-readable scope statement.

---

## 2026-05-24 — M4.5.E3 DISCUSS decisions locked (9 decisions)

**Context.** E3 — public-facing documentation rewrite — entered DISCUSS 2026-05-24 after E7 SHIP closed (`8723967`). The Epic was scoped 2026-05-13 against a README that read as internal architecture notes; the README has since evolved past that baseline (pitch + table + walkthrough + state-hygiene + brownfield + command-reference + heritage all live and working at 218 lines). E3 is therefore *additive* — fill the doc-surface gaps strangers expect (privacy, compatibility, governance) rather than re-architect what's already working. PROFILE.md tier: FULL; `gate_strictness: strict`.

**Verification.** Network-call audit run during DISCUSS (`grep -rEn "fetch\(|require\(['\"]https?['\"]\)|node-fetch|axios|got|http\.request|https\.request" tools/ skills/ agents/ commands/`) returned **zero hits**. The "no network calls beyond Claude's API" privacy claim is structurally verifiable, not aspirational. The audit script is itself an E3 deliverable (FR1 + AC3) so contributors can rerun it.

**D-E3-1 — Privacy as a doc pair: README section + PRIVACY.md.**

README gets a 6–10 line "Privacy & telemetry" section before "Command reference" — the elevator answer for skimmers. `PRIVACY.md` at repo root carries the full statement: headline claim, audit method (the grep commands + their reproducibility via `tools/audit-network-calls.sh`), what `.planning/` contains and doesn't, and a "what would change this" clause (any future telemetry requires major-version bump + opt-in flag + audit appendix update).

Rationale: Strangers reading the README want the 5-second answer. Auditors (or strangers with high-trust needs) want the reproducible method. The two-doc pair matches Keep-a-Changelog's pattern (README blurb + CHANGELOG.md detail).

**D-E3-2 — Compatibility as a doc pair: README table + docs/compatibility.md.**

README gets a "Requirements & compatibility" table (~12 lines, 4 rows: Node.js / Claude Code / OS / Git). `docs/compatibility.md` carries the full OS matrix mirroring `docs/install-verification.md`'s R-row convention. R1+ verified (macOS Mac Studio, 2026-05-23 from E7); R2 / R3 / R5 pre-stubbed as pending with their E1 slice owners.

Rationale: README answers "can I run this?" in 5 seconds. `docs/compatibility.md` is the surface E1 slices write their cross-platform verification rows to as they ship. Same pattern as `docs/install-verification.md`.

**D-E3-3 — Governance trio: CONTRIBUTING.md + SECURITY.md + 2 issue templates.**

CONTRIBUTING.md (~80–120 lines): filing bugs, PR flow, local dev (`git clone` / `npm install` / validator / 384 tests / `CLAUDE_PLUGIN_ROOT`), `.planning/` ground rule, code style (no enforced linter, match patterns, one dep), release-process pointer, inline 3-line CoC stanza.

SECURITY.md (~30–50 lines): supported versions (latest 0.1.x only), reporting (private email `brett@insightriot.com` or GitHub private vulnerability report), response posture (best-effort, ~72h ack, no SLA pre-1.0), disclosure (CHANGELOG entry), scope (plugin code; not Claude Code; not user project).

Issue templates: `.github/ISSUE_TEMPLATE/bug_report.md` + `feature_request.md` + `config.yml` (blank issues disabled; questions routed per D-E3-6).

Rationale: Strangers expect "if I find a bug, where does it go?" answered in three places (CONTRIBUTING, the issue chooser, SECURITY for the security carve-out). This is the standard MIT-OSS shape and signals "this project takes reports seriously" without ceremony.

**D-E3-4 — Three slices: S1 privacy → S2 compatibility → S3 governance.**

- **S1.** README privacy section + PRIVACY.md + `tools/audit-network-calls.sh`. One ship event.
- **S2.** README compatibility table + `docs/compatibility.md` + cross-link to install-verification.md. One ship event.
- **S3.** CONTRIBUTING.md + SECURITY.md + `.github/ISSUE_TEMPLATE/*` + CHANGELOG `[0.1.3]` E3 block + Epic close. One ship event.

Rationale: Matches Brett's 1-thing-per-slice cadence (E1/E2/E6/E7). Each slice is independently reviewable (privacy ≠ compatibility ≠ governance) and each ships its own CHANGELOG bullet. Bundling would force a single oversized PR review.

**D-E3-5 — Tag bump deferred; `[0.1.3]` stays Unreleased through E3.**

CHANGELOG `[0.1.3]` already carries the E7 block (Unreleased). E3 appends to the same heading. The actual `0.1.3` tag cuts after E5 launch or whenever Brett judges enough has accumulated. Avoids two tags in one week.

Rationale: Tags signal "user-visible release." Docs-only Epics don't usually warrant standalone tags; bundling with E7's synthesizer fix is honest.

**D-E3-6 — Issue chooser hides blank issues; questions route to Discussions or Question-shaped bug.**

`.github/ISSUE_TEMPLATE/config.yml` sets `blank_issues_enabled: false` and adds a `contact_links:` entry. If GitHub Discussions is enabled on the repo, it links there; if not, instructs openers to file a Question-shaped issue. The Discussions-enable check is an out-of-Claude action and is logged as OQ2 for S3 to branch on.

Rationale: Blank issues are a known noise vector. Forcing the chooser keeps inbound triage cheap. Discussions vs Question-issue is a per-repo config; deciding both branches in DISCUSS unblocks S3.

**D-E3-7 — No standalone CODE_OF_CONDUCT.md in E3.**

CONTRIBUTING.md includes a 3-line inline CoC stanza ("be kind, assume good faith, no harassment"). Separate CoC file revisited if/when external contributors materialize (E5 follow-on or later).

Rationale: A standalone CoC at solo-maintainer scale is more form than function — strangers read it as "this project pretends to be bigger than it is." Inline 3-line stanza in CONTRIBUTING is honest about scale and still discharges the "is this project welcoming?" question.

**D-E3-8 — Demo asset deferred to E5.**

E3 ships README pitch text + walkthrough only. The 30-second animated GIF / asciinema cast / screen recording originally listed in MILESTONE-4.5 § E3 moves to E5's scope (launch post needs a demo regardless).

Rationale: Producing a demo in E3 then re-producing for E5's launch post is waste. The demo's audience is launch-day readers; ship it with launch. README's pitch text + tier-comparison table + walkthrough already communicates Signal's value to a curious skimmer without a video.

**D-E3-9 — No architecture extraction in E3.**

"Command reference" + "Credits & Heritage" sections stay in README (218 lines total). No `docs/architecture.md` created in E3.

Rationale: A stranger evaluating Signal skims the top, scrolls to commands ("what does this actually do?"), scrolls to heritage ("who built this, what does it borrow?"). Splitting these across files adds a click-tax. 218 lines is not problematic for a substantive plugin's README. Re-evaluate after E5 if external feedback says the README scrolls too much.

**Non-functional requirements (FULL-tier NFR checklist):** E3 ships static documentation files. **All five FULL NFR items (health probe, graceful shutdown, structured request logging, security headers, rate limiting) are N/A** — no service, no runtime, no network surface. The privacy statement (FR1) is the nearest security-relevant NFR, and its acceptance is structural (zero network calls in the plugin's executable surface), verified by the audit script.

**Implication for PLAN:**
- Three slices, one artifact pair each. PLAN produces `M4.5.E3-RESEARCH.md` (light — most decisions already locked; research focus is OSS-doc-template best practices for CONTRIBUTING/SECURITY shape) + `M4.5.E3-PLAN.md` (S1/S2/S3 task breakdown with TDD-where-applicable) + `M4.5.E3-VALIDATION.md`.
- Test delta: zero new tests baseline (docs are static); +5 LOC if PLAN decides OQ1 (audit-script existence test) or OQ3 (cross-file consistency test) warrant inclusion.
- Validator changes: none expected.

**Reference:** Acceptance criteria in `.planning/archive/M4.5/E3/M4.5.E3-REQUIREMENTS.md` (written during this DISCUSS). MILESTONE-4.5 § E3 retains the human-readable scope statement.

---

## 2026-05-24 — M4.5.E8 DISCUSS decisions locked (6 decisions)

**Context.** E8 — `/sig:doctor` install-state diagnostician + ownership reframe — scoped 2026-05-24 after frustration that 3 of 5 install failure modes (P1/P2/P3) are upstream Claude Code plugin-host bugs, not Signal bugs, but the 280-line troubleshooting doc reads as Signal's shame. Sequenced before E5 launch in MILESTONE-4.5.md § E8 — launching without it ships the current install dance to strangers. PROFILE.md tier: FULL; `gate_strictness: strict`.

**State machine note.** This DISCUSS ran in parallel with M4.5.E3's in-flight state (E3 DISCUSS complete 2026-05-24; awaiting PLAN). STATE.md was not updated for E8; this entry + `M4.5.E8-REQUIREMENTS.md` are the durable capture. Executes after E3 closes. Captured-in-the-moment per user feedback (see memory `feedback_document-in-the-moment`) rather than waiting for E3's full ship cycle.

**D-E8-1 — Execution model: generate a runnable script (not direct execution).**

`/sig:doctor --fix` and `/sig:doctor --reinstall` write `~/.claude/sig-doctor.sh` containing the remediation sequence, print `Run: bash ~/.claude/sig-doctor.sh`, and exit. User reviews the script, runs it manually, then re-invokes `/sig:doctor` to verify the install is healthy.

Rationale: maximum auditability — user sees exactly what will mutate `~/.claude/` before it runs. Sidesteps the "can a slash command invoke `/plugin uninstall` from inside Claude Code" unknown (deferred to OQ3 for PLAN's research). Two-step flow is acceptable cost; the trust gain dwarfs the friction.

Rejected: direct execution with per-action prompts (technical unknown around invoking other slash commands from inside one); print-only mode (collapses `--fix` / `--reinstall` into the diagnose mode's output — no real feature distinction).

**D-E8-2 — OS support: macOS only first ship; Linux/WSL stub.**

Detection logic handles macOS paths (`/Users/$USER/.claude/`). Linux and WSL invocations print `/sig:doctor currently supports macOS only. Linux/WSL support is in flight (see docs/install-troubleshooting.md for the manual sequence).` and exit 0. Real Linux/WSL paths added in a follow-on slice when E1.S3 lands fresh-machine hardware verification.

Rationale: hardware reality — Mac Studio + biz machine + personal laptop are all macOS. `docs/install-troubleshooting.md` is already macOS-first. Blocking E8 ship on Linux/WSL hardware availability would push E8 past E5 launch, defeating the point.

Rejected: macOS + Linux day-one (requires Linux fixture tests + verification machine, bottlenecks on E1.S3 hardware); all three day-one (longest path, blocks ship).

**D-E8-3 — Script style: interactive `[y/N]` per mutating step.**

Generated `~/.claude/sig-doctor.sh` wraps each mutating action in `read -p "Execute: ... ? [y/N]"` prompts. User runs the script, sees each step, confirms or skips per-action. Declining a prompt skips that action and continues to the next.

Rationale: belt-and-suspenders. The script-generation flow already provides audit-at-generation-time; interactive prompts add audit-at-execution-time. User explicitly chose this against the recommendation (which was straight-through `set -euo pipefail`), citing that for `~/.claude/` mutations — which affect every Claude Code plugin the user has installed — redundant safeguards are worth the friction.

Rejected: straight-through with `set -e` (efficient but no execution-time confirmation; user pushed back on this even though it was recommended); commented-out copy-paste (collapses into a glorified copy-paste sheet — `docs/install-troubleshooting.md` already does that).

**D-E8-4 — Latest-version source: GitHub releases API, 24h cache.**

`/sig:status` and `/sig:doctor` query `https://api.github.com/repos/InsightRiot/signal/releases/latest`, use the `tag_name` field, cache the result 24h in `~/.claude/.sig-version-cache.json` (location not yet finalized — see OQ5). Tag-based comparison: warnings fire only when there's a tagged release the user could actually install.

Rationale: matches Signal's actual release model — tags are the user-visible release contract. Currently `[0.1.3]` is unreleased; users on v0.1.2 correctly see "up to date" until v0.1.3 cuts. Plugin.json-on-main-branch was rejected for generating constant "you're behind!" warnings during unreleased windows with no upgrade path to take (noise, not signal). marketplace.json was rejected for ref-pin/tag misalignment confusion.

**D-E8-5 — Flag naming: `--fix` + `--reinstall` (drop `--upgrade`).**

User reframe during DISCUSS: `--upgrade` conflates with `/plugin install`'s normal path. The hostage situation E8 solves is **broken-state recovery**, not version upgrade. Final flag set:

- `/sig:doctor --fix` — surgical remediation: addresses only the specific P-states doctor detected. Generated script contains only those commands.
- `/sig:doctor --reinstall` — full canonical clean reinstall: cache purge + settings.json edit + `/plugin uninstall` + `/plugin install` + `/reload-plugins`. Same script contents regardless of starting state; interactive prompts are the safeguard against unnecessary mutations on a healthy install.

`/sig:status`'s version-check recommendation table accounts for state-combination:

| Installed | Latest | P-states | Recommendation |
|---|---|---|---|
| stale | newer exists | none | `/plugin install sig@signal` (normal path) |
| stale | newer exists | yes | `/sig:doctor --reinstall` (clean + upgrade) |
| current | none | yes | `/sig:doctor --fix` (surgical) |
| current | none | none | (no warning) |

Rationale: user catch is sharp. `--upgrade` was the wrong word for what E8 does. `--reinstall` honestly names "broken-state recovery." Two flags earn their keep: `--fix` is low-risk and surgical; `--reinstall` is the headline feature that addresses the launch-readiness frustration.

Rejected: merge into `--upgrade` only ("what will this script do?" becomes "depends on doctor's findings" — harder to reason about pre-execution); `--fix` only with no `--reinstall` ("I just want latest" becomes multi-step manual — the failure mode E8 exists to eliminate).

**D-E8-6 — NFRs all N/A.**

All five FULL-tier NFR items confirmed N/A:

- Health/liveness probe — N/A (CLI command, not a service runtime)
- Graceful shutdown — N/A (command runs and exits; no long-running process)
- Structured request logging — N/A (output is user-facing diagnostic prose)
- Security headers — N/A (no web surface)
- Rate limiting — addressed structurally by the 24h on-disk cache on the GitHub releases API. The cache IS the rate-limiting mechanism.

Same NFR shape as E3 (docs Epic — also all-N/A). E8 is a CLI diagnostic command; ops-shaped concerns don't apply.

**Open questions deferred to PLAN's research phase** (full list in `M4.5.E8-REQUIREMENTS.md` § Open Questions):

- **OQ1:** canonical path Claude Code uses for plugin state — empirically verify on Mac Studio
- **OQ2:** does `api.github.com/.../releases/latest` work unauthenticated, or require `gh`?
- **OQ3:** can the generated script execute `/plugin uninstall` / `/plugin install` directly, or must those steps document themselves as user-runs-manually?
- **OQ4:** upstream filings timing — pre-S3 SHIP or in parallel? (lean: parallel, per `feedback_document-in-the-moment`)
- **OQ5:** cache file location

**Implication for PLAN:**

- Three slices, one ship event each:
  - S1 = diagnose-only command + fixture tests + validator wiring
  - S2 = `--fix` + `--reinstall` script generation + script-content lint tests
  - S3 = `/sig:status` version-check + 24h cache + `docs/install-troubleshooting.md` reframe + (optional) upstream filings + CHANGELOG `[0.1.3]` E8 block + Epic close
- Test delta: ~40-50 new tests baseline (384 → ~430)
- No new runtime dependencies expected
- Validator changes: `REQUIRED_COMMANDS += 'commands/doctor.md'`; CLAUDE.md 14 → 15 commands
- Dogfood gate (AC#13): real `--reinstall` end-to-end run on biz machine before SHIP

**Reference:** Full functional requirements + acceptance criteria + open questions in `.planning/archive/M4.5/E8/M4.5.E8-REQUIREMENTS.md` (written during this DISCUSS). MILESTONE-4.5 § E8 retains the human-readable scope statement.

---

## 2026-05-24 — M4.5.E3 audience reframe + E1.S3-S5 shelved (revision)

**Context.** Same-day revision to the M4.5.E3 DISCUSS entry above. After the initial 9-decision lock, the user clarified two things during the pre-PLAN red-flag review:

1. **Near-term audience is self + peers, not external contributors.** "I'm not overly concerned about contributors — I'm more concerned about stabilizing for use by myself and peers."
2. **Cross-platform testing paused until tester volunteers materialize.** "Cross-platform is great — but can be focused on Mac for now until I can find some folks who are willing to test on Linux and Windows down the line."

Both clarifications shrink E3's scope and shelf E1's remaining slices. The original lock is preserved verbatim above for archaeology; the revisions below supersede.

**D-E3-1 — UNCHANGED.** Privacy doc pair (README section + PRIVACY.md + `tools/audit-network-calls.sh`).

**D-E3-2 — REVISED.** Compatibility = **README mini-table only**, no `docs/compatibility.md` sub-doc. OS row reads "Verified on macOS; Linux/WSL untested." Rationale: the sub-doc was scaffolding for E1.S3-S5's R-row writes; with E1.S3-S5 shelved (see D-E3-12), the sub-doc has no near-term writes and would ship stale. Re-introduce when cross-platform testing resumes.

**D-E3-3 — REVISED (governance trio → slim SECURITY only).**

- **SECURITY.md** — kept (~25 lines). Security reports come from anyone using the plugin, peers included. Standard hygiene. **No Signal workflow vocabulary** per D-E3-10.
- **CONTRIBUTING.md** — **deferred**. Peer-scale doesn't need a formalized contribution flow. Logged to FUTURE-IDEAS. Trigger to revisit: external contributor opens a real PR.
- **`.github/ISSUE_TEMPLATE/*`** — **deferred**. Peers can email or open untemplated issues. Logged to FUTURE-IDEAS. Trigger to revisit: issue volume exceeds informal email channel (~5+ open issues from non-author contributors).
- **Inline CoC stanza** — dropped (lived inside CONTRIBUTING.md).

**D-E3-4 — REVISED.** **2 slices, not 3**:

- **S1 — Privacy.** README "Privacy & telemetry" section + PRIVACY.md + `tools/audit-network-calls.sh` + `docs/map/index.html` link in README workflow narrative.
- **S2 — Compatibility note + slim SECURITY + close.** README "Requirements & compatibility" mini-table + SECURITY.md + CHANGELOG `[0.1.3]` E3 block + MILESTONE-4.5.md § E3 closed + E1.S3-S5 shelved annotation + FUTURE-IDEAS entry for deferred contribution scaffolding.

**D-E3-5 — UNCHANGED.** Tag bump deferred; `[0.1.3]` Unreleased.

**D-E3-6 — MOOT.** Issue chooser config — no templates ship.

**D-E3-7 — MOOT.** CoC stanza — no CONTRIBUTING.md ships.

**D-E3-8 — UNCHANGED.** Demo asset deferred to E5.

**D-E3-9 — UNCHANGED.** No architecture extraction in E3.

**D-E3-10 — NEW: plain-language discipline graduated by audience.**

| Doc | Jargon stance |
|---|---|
| **README** | Tolerant — calibration/tier IS the value pitch; define inline on first use |
| **PRIVACY.md** | Minimal — plain audit prose; no workflow vocab in body |
| **SECURITY.md** | **Zero Signal workflow vocabulary** (no Tier / Phase / Slice / Wave / Epic / Milestone / `/sig:*` command references). Pure standard security-doc shape. Enforced by a small grep test as part of the cross-file consistency check (OQ3 resolution). |

Rationale: This direction is consistent with three other things landed today (the executor/planner/code-reviewer "Naming & plain language" sections, and the `/sig:orient` FUTURE-IDEAS entry calling out Signal's jargon-heavy stranger surface). E3's docs follow the same discipline.

**D-E3-11 — NEW: audience reframe (self + peers, not strangers).**

E3 ships for self + peers, not external contributors. Triggers to revisit deferred items:

- (a) External contributor opens a real PR → promotes CONTRIBUTING.md from deferred to active scope.
- (b) Issue volume exceeds informal email channel (~5+ open issues from non-author) → promotes issue templates.
- (c) Linux or WSL tester volunteers raise a hand → promotes `docs/compatibility.md` sub-doc AND unshelves the relevant E1.S{3,4,5} slice.

Implication for E5 launch: if E5 also pivots toward "quiet peer-only release" rather than "stranger-facing launch," its scope shrinks too (demo asset may not be needed; external-tester recruitment becomes opportunistic rather than blocking). **Not yet decided** — E5 scope re-evaluation happens when E3 + E8 are done, not now.

**D-E3-12 — NEW: E1.S3-S5 shelved pending tester volunteers.**

E1 Slices 3 (Linux x86_64 / R2 install verification), 4 (versioning policy `docs/versioning.md`), and 5 (Windows WSL / R5 install verification) **shelved**, not deleted. The work is still scoped in MILESTONE-4.5.md § E1; it's paused.

- S3 + S5 trigger: a volunteer on the relevant platform raises a hand.
- S4 (versioning policy) is platform-independent but was bundled with S3-S5 in MILESTONE-4.5.md § E1; carrying it under the same shelf because no near-term release tag is imminent anyway (see D-E3-5). Trigger: when `[0.1.3]` is about to cut, S4 ships immediately before to govern the call.

MILESTONE-4.5.md § E1 + § Status snapshot table both get an explicit "shelved 2026-05-24 — see D-E3-12" annotation as part of E3 S2's Epic-close task.

**Implication for PLAN:**

- 2 slices, smaller artifact set. M4.5.E3-RESEARCH.md is light (most decisions locked; research focus: slim-SECURITY shape best practices from comparable solo-maintainer MIT-licensed plugins).
- Test delta: 384 → ~387 (consistency check + optional audit-script wrapper + optional D-E3-10 jargon-lint).
- Validator changes: none expected.
- E1.S3-S5 shelving is a single block update in MILESTONE-4.5.md scoped to E3 S2's Epic-close task.

**Reference:** Revised acceptance criteria (AC1–AC12) + revised D-E3 list + revised open questions in `.planning/archive/M4.5/E3/M4.5.E3-REQUIREMENTS.md` § "2026-05-24 revision". MILESTONE-4.5.md § E3 + § E1 get the shelving + close annotations during E3 S2.

---

## 2026-05-24 — M4.5.E3 PLAN-gate decisions locked (4 new)

**Context.** PLAN phase completed 2026-05-24 for M4.5.E3. Research surfaced 3 deviations from DISCUSS scope; user (Brett) approved all + added 1 scope addition at the gate. Decisions locked before EXECUTE entry.

**D-E3-1-amend — Drop PRIVACY.md as a separate file.**

Original D-E3-1 specified a "privacy doc pair" (README section + PRIVACY.md). Research (domain + prior-art researchers) found 0 of 6 peer Claude Code plugins ship PRIVACY.md and the ecosystem norm for tools that send nothing is silence-as-no-telemetry (esbuild, Prettier, husky, Vitest all skip PRIVACY.md; Astro/Next ship it because they DO have telemetry). Shipping PRIVACY.md actively signals "maybe there's telemetry to worry about" — opposite of intent.

**Revised:** README "Privacy & telemetry" section (~6-8 lines) + `tools/audit-network-calls.js`. No PRIVACY.md. The README mini-section carries the affirmative claim; the script makes it verifiable.

**Impact:** AC2 dropped. AC1 absorbs audit-method content as a short paragraph. Removes ~1 file deliverable; reduces drift surface.

**D-E3-1-amend-b — Convert `tools/audit-network-calls.sh` → `.js`.**

Original D-E3-1 specified `.sh`. Codebase researcher found zero `.sh` precedent in `tools/` (all 15 existing files are Node ESM); risk researcher flagged shell-portability concerns (bash vs zsh, BSD vs GNU grep). Converting to Node ESM avoids the portability question entirely and inherits Signal's standard tool conventions.

**Revised:** `tools/audit-network-calls.js`. Shebang `#!/usr/bin/env node`; ESM imports; `__dirname` via `fileURLToPath(import.meta.url)`; exit 0/1 conventions.

**Impact:** AC3 unchanged in effect; file extension + implementation language change. README + CHANGELOG references update.

**D-E3-NEW-13 — Add `references/facts.md` as canonical source-of-truth.**

Surfaces from risk researcher: hard-coded fact strings across multiple docs is the maintenance time-bomb that hit STATE.md staleness earlier this session (test count 93+ in README vs 366 in CONTEXT.md vs 384 actual). Single source-of-truth file with a consistency test that reads from it eliminates the class.

**Locked:** New file `references/facts.md` with canonical strings for:
- Runtime: Node.js 22+; Claude Code 2.1.141+; OS = "Verified on macOS; Linux/WSL untested"
- Dependencies: runtime `yaml` (1 dep); dev `vitest`
- Test surface: current count (updated each Epic close)
- License + repo: MIT; `https://github.com/InsightRiot/signal`

Header note pins the file as authoritative: "Update HERE first; tests catch drift in referenced docs."

**Impact:** New file + new test pattern. Consistency test sources from `references/facts.md` rather than hard-coding. Pattern reusable for future drift-prone facts.

**D-E3-NEW-14 — Lock attribution prominently across documents as "Open Source Origins."**

**User request at PLAN gate 2026-05-24:** "I want to make sure attribution is locked in documents — so all of the repos that we've either borrowed from or taken inspiration from should be explicitly attributed — maybe with a head of 'Open Source Origins' — a note of appreciation. then list with gratitude the work all of those folks did that has inspired Signal."

**Locked:**

- **README rewrite:** existing `## Credits & Heritage` section becomes `## Open Source Origins`. New intro paragraph with gratitude framing (1-2 sentences, e.g., "Signal is the synthesis of patterns from many other people's work. The projects below shaped Signal's architecture directly — through code ported, ideas borrowed, or examples studied. Listed with thanks to their maintainers.").
- **Preserve 4-tier structural information** — Ported (v1) / Planned (v2) / Pattern source / Reference / Signal's own contribution. Subsection headings updated to warmer voice ("Directly ported (v1)" / "Inspiration for v2" / "Patterns borrowed (without full ports)" / "Bridge references" / "Signal's own contribution").
- **All 9 source repos retain GitHub URL links** + 1-line acknowledgments of what specifically was borrowed.
- **LICENSES.md cross-link preserved** — legal attribution is separate from gratitude attribution.

**Verification:** Consistency test 9 (added to `tests/cross-file-consistency.test.js` in S2.t2) asserts literal `## Open Source Origins` + presence of all 9 source-repo GitHub URLs. Voice quality validated by manual review at VERIFY.

**Impact:** +1 task in S2 (S2.t4); +1 acceptance criterion (AC13); +1 consistency test assertion (test 9). Net: ~20 LOC README rewrite + ~3 LOC test extension.

Per Brett's phrasing "in documents" (plural), the LICENSES.md file is left untouched as the legal-attribution surface (it already exists); README is the primary gratitude-attribution surface. If a future Epic wants to extend the gratitude framing to additional surfaces (e.g., a dedicated `ACKNOWLEDGMENTS.md`), that's a follow-on, not E3 scope.

**Implication for EXECUTE:**

S2 grows from 6 → 7 tasks. New sequence: t1 (facts.md) → t2 (consistency tests RED + test 9) → t3 (README compat + docs/map) → t4 (README Open Source Origins) → t5 (SECURITY.md) → t6 (MILESTONE + FUTURE-IDEAS) → t7 (CHANGELOG + E3 close). S2.t3 and S2.t4 are both README edits and can be ordered for efficient editing (recommended: t3 first, then t4).

PLAN artifacts authoritative for EXECUTE:
- `.planning/archive/M4.5/E3/M4.5.E3-PLAN.md` (task list + acceptance criteria)
- `.planning/archive/M4.5/E3/M4.5.E3-VALIDATION.md` (8-dim + Nyquist mapping)
- `.planning/archive/M4.5/E3/M4.5.E3-RESEARCH.md` (informational; surfaced decisions integrated above)

---

## 2026-05-24 — FUTURE-IDEAS drain: four-verb disposition protocol, folded into M4.5.E2.S5

**Decision:** Signal's drain mechanism for `FUTURE-IDEAS.md` is a **four-verb disposition protocol** — *promote / defer / merge / delete* — applied at the M4.5.E2.S5 planning-gate sweep. No new command. No new ceremony. S5's spec is sharpened to require a disposition per surfaced entry; disposition is recorded inline by editing the entry's `**Status:**` line and explained in the commit message.

**The four verbs:**
- **Promote** — entry becomes an Epic, Slice, or task in the current/upcoming planning round. Status updated to `Promoted YYYY-MM-DD → {epic-id}`; entry can stay in the file as historical context or be moved into the Epic's artifact.
- **Defer** — entry stays in `FUTURE-IDEAS.md` untouched in scope, but Status line is updated to `Deferred YYYY-MM-DD — re-evaluate at next planning gate` (or with a more specific re-evaluation trigger). The act of deferring is itself a decision; it's not the same as ignoring.
- **Merge** — entry is folded into another existing entry. Original is deleted with a one-line redirect (`→ merged into {other-entry-title} 2026-MM-DD`); the receiving entry absorbs whatever context the merged one carried.
- **Delete** — outdated / superseded / no longer relevant. Removed outright; the commit message carries the one-line reason. This is the only verb that loses data, so the bar is *evidence the entry no longer reflects reality*, not *I don't want to think about this right now* (that's defer).

**Trigger.** 2026-05-24 conversation. User reviewing 16 live `FUTURE-IDEAS.md` entries asked aloud *"at some point they all need to get into Epics — any process for that?"* Honest answer was no — Signal has a hardened input pipe (`/sig:add` shipped M4.5.E2.S1) and no output pipe. Three options on the table: (A) fold disposition protocol into S5's already-planned planning-gate review; (B) milestone-boundary sweep (requires new ceremony); (C) `/sig:groom` standalone command (requires new command surface). User picked A.

**Rationale.**
- **Smallest viable drain.** S5 is already on the M4.5 roadmap. Sharpening its scope from "review FUTURE-IDEAS" to "review + dispose" costs almost nothing — same step, same trigger, just a defined exit verb per entry.
- **No new command surface.** Options B and C both require new ceremonies or commands with the full overhead they carry (validator `REQUIRED_COMMANDS`, README mentions, `docs/map/index.html`, MCP/skill descriptions, plugin manifest, tests). Option A inherits S5's already-planned overhead.
- **Reversibility.** If A proves insufficient after 2–3 Epics of lived experience — entries decay between planning-gate sweeps, or a stranger reads the file and asks "which of these are real?" — options B and C are still on the table. The `FUTURE-IDEAS.md` entry "FUTURE-IDEAS drain process" carries the explicit follow-on trigger.
- **The four verbs were not invented for this decision.** They're the obvious dispositions any backlog grooming process names. Codifying them as Signal's vocabulary is cheap; not codifying them means each S5 sweep re-invents what "review" means.

**Trade-offs accepted.**
- Cadence is irregular — S5 fires per-Epic-planning, so triage cycles happen whenever a new Epic enters PLAN. Entries can sit weeks between sweeps. Acceptable given the alternative (full sweep ceremony or standalone command) costs more than the problem currently warrants.
- No staleness flag. An entry's age alone doesn't trigger anything; only a planning-gate sweep does. Risk: dormant-but-correct entries (e.g., `/sig:audit` logged 2026-05-09) can decay silently. Mitigation: the `Resolve by:` field in each FUTURE-IDEAS entry already names the trigger condition; sweep reviewers check it.
- No automated tooling. Disposition recording is manual prose editing. Acceptable at current scale (16 entries); revisit if file grows beyond ~30 entries or contributor count grows beyond 1.

**Implication.**
- `MILESTONE-4.5.md` M4.5.E2.S5 description updated to include the four-verb protocol + inline disposition-recording rule.
- `FUTURE-IDEAS.md` drain-process entry updated with a `**Decision (2026-05-24): Option A locked in.**` stamp and the resolved Triage hint.
- When S5 actually ships, `commands/plan.md` carries the four-verb protocol in its FUTURE-IDEAS-review step. No standalone reference doc — the spec lives inside the command's instructions where it's executed.
- Options B and C remain in the FUTURE-IDEAS entry as **deferred-not-killed** alternatives. Re-evaluate after 2–3 Epics of lived S5 experience, or sooner if external stranger adoption begins.

**Anti-rationalization (the alternatives we said no to, recorded here so future-us doesn't re-litigate):**
- *"Just build `/sig:groom` now."* — Premature. Solving for a problem (decay between planning-gate sweeps, stranger-hostility of an untriaged file) we haven't observed at scale. Bias toward least new surface.
- *"Add a status-field to every entry's frontmatter."* — Considered and rejected in the FUTURE-IDEAS entry. Bookkeeping load without solving cadence. Status fields go stale faster than the entries they describe.
- *"Set a time-based expiry."* — Lossy. Entries can be dormant-but-correct for months. Time-based decay punishes the wrong thing.
- *"Track in GitHub Issues / Linear instead."* — Breaks the in-workspace capture loop that `/sig:add` exists to preserve. Revisit only if Signal grows multi-contributor.

---

## 2026-05-25 — M4.5.E9 decisions locked (D-E9-1 through D-E9-8)

**Context.** M4.5.E9 (Retro Foundations) DISCUSS phase completed 2026-05-25 with 7 decisions locked. PLAN-phase research surfaced one ESCALATE-level gap (D-E9-8) and four AMEND-level issues that needed DISCUSS amendment before PLAN could lock; the layered-enforcement question was elevated to a decision and confirmed via `AskUserQuestion`. The four AMENDs are absorbed into PLAN task specs and are not standalone decisions; only D-E9-8 promoted to the decisions list.

These 8 decisions are promoted here from `M4.5.E9-REQUIREMENTS.md` § "Locked Decisions" + § "DISCUSS amendments from PLAN research" per the M4.5.E3 follow-up convention (CONTEXT.md 2026-05-25 "Recommended follow-ups" #1). REQUIREMENTS.md retains the table for at-a-glance reference with a header note pointing here for authoritative rationale.

### D-E9-1 — Scope = split

**Decision.** Workstreams 1 + 2 (SHIP enforcement + tier-aware template + stub backfill, plus `RETROSPECTIVES.md` index + cross-link conventions) ship as **M4.5.E9**. Workstreams 3 + 4 (wiki restructure of `.planning/`, doc-runtime / cross-link sanity tooling, migration tooling for existing projects) **deferred to M5.E1** with its own DISCUSS.

**Rationale.** Retro enforcement is the highest-leverage of the four workstreams — without it, retros stay structurally optional and disappear under context pressure (the failure mode that motivated the whole question). Shipping the small/incremental option starts saving learning immediately. The dogfooding lever for M5.E1 is preserved: M5.E1's DISCUSS opens with 1-3 Epics of lived retro experience already captured.

**Alternatives considered.**
- *All-in-one M5.E1 (wiki restructure + enforcement together)* — would lock the directory shape (`.planning/retrospectives/`) before dogfooding revealed whether it's the right shape; couples a learning-emitting decision to a learning-consuming decision.
- *Workstream 1 alone (defer the index to M5.E1 too)* — rejected; an index is the natural traversal surface for retros and is small (~7 tasks). Folding it in keeps the "find a retro" UX shipping at the same time as the "write a retro" UX.

**Reference.** `M4.5.E9-REQUIREMENTS.md` § "Locked Decisions" row D-E9-1; FUTURE-IDEAS.md § "Memory & Documentation Management as Signal-managed Runtime" (the four-workstream framing).

### D-E9-2 — Slice shape = two slices

**Decision.** **S1** ships SHIP enforcement + tier-aware template + stub backfill (12 tasks, ~40 tests, High risk). **S2** ships `RETROSPECTIVES.md` index + cross-link conventions + manual milestone meta-retro + `/sig:resume` retro-status surfacing (7 tasks, ~18 tests, Low risk).

**Rationale.** S2 is downstream of S1 by design — no retros means nothing to index. Sequential matches the dependency. S1 ships and is exercised on the very next Epic, producing a real retro to point S2's index at. Splitting also keeps each slice's PR / commit chain digestible.

**Alternatives considered.**
- *Single monolithic slice* — rejected; 19-task single PR is too large for review and bundles a high-risk new gate (S1) with a low-risk pure-additive feature (S2), making rollback granularity worse.
- *Three slices (enforce / backfill / index)* — rejected; the backfill is tightly coupled to enforcement (S1.t10 dry-run gate must precede enforcement ship), separating them would introduce a fragile cross-slice ordering rule.

**Reference.** `M4.5.E9-REQUIREMENTS.md` § "Locked Decisions" row D-E9-2; `M4.5.E9-PLAN.md` § "Slice overview".

### D-E9-3 — Enforcement = hard block, no bypass

**Decision.** SHIP refuses to write `phase: SHIP → completed_phases` until `RETROSPECTIVE.md` exists at the expected per-Epic path and passes a minimum-content sanity check. **No `--no-retro` flag. No override. No environment-variable escape hatch.**

**Rationale.** This is the anti-rationalization heart of the Epic — the FUTURE-IDEAS entry that motivated this work specifically named the failure mode as "soft signals get rationalized away under exactly the pressure they're meant to handle (context-clear, deadline, demo)." A hard block is the only mechanism that fails closed under that pressure. The whole motivation is the failure mode that bypasses soft signals; a softer gate would re-introduce it.

**Alternatives considered.**
- *Soft warning at SHIP time* — explicitly rejected as recreating the failure mode.
- *Hard block with `--no-retro` bypass for emergencies* — rejected; "emergencies" are exactly the context-pressure scenarios where the gate is meant to fire.
- *Hard block at REVIEW phase instead of SHIP* — rejected; REVIEW is earlier in the flow and the retro isn't writable yet (it summarizes ship outcomes); SHIP is the natural altitude.

**Reference.** `M4.5.E9-REQUIREMENTS.md` § "Locked Decisions" row D-E9-3; FUTURE-IDEAS.md § "Memory & Documentation Management" anti-rationalization framing.

### D-E9-4 — Tier scope = all tiers required, tier-aware template

**Decision.** The hard block fires for **all four tiers** (SKETCH, FEATURE, SPIKE, FULL). Template content **scales by tier**: SKETCH gets a 3-question stub; SPIKE gets an exploratory template focused on whether the spike resolved its question; FEATURE gets a medium template; FULL gets the full template (timeline, assumptions broken, surprises, anti-rationalization moment, links to artifacts).

**Rationale.** Preserves D-E9-3's universal "no exception" principle without burdening SKETCH throwaways with FULL-tier ceremony. Matches the pattern `gate_strictness` already uses — same enforcement, calibrated ceremony per project tier. Exempting SKETCH from retros would replicate the original failure mode in a smaller scope; calibrating the ceremony preserves the discipline.

**Alternatives considered.**
- *SKETCH-tier exemption (no retro required)* — rejected; D-E9-3's "no bypass" extends to tier-shaped bypasses.
- *Single universal template* — rejected; SKETCH ceremony budget can't absorb FULL-template heading count without producing performative noise.
- *Tier-specific ENFORCEMENT (e.g., warn at SKETCH, block at FULL)* — rejected; same reason as the SKETCH exemption.

**Reference.** `M4.5.E9-REQUIREMENTS.md` § "Locked Decisions" row D-E9-4; `M4.5.E9-RESEARCH.md` § 3.6 (per-tier section heading specifications).

### D-E9-5 — Granularity = per-Epic, with optional milestone-close meta-retro

**Decision.** One `RETROSPECTIVE.md` per **Epic**, written when SHIP closes the Epic (last unshipped slice). **Optional** milestone-close meta-retro synthesizes the Epic retros into a milestone-level reflection — no hard block, user-triggered.

**Rationale.** Epic is the existing SHIP-gate altitude; plugs into existing infrastructure cleanly without inventing new lifecycle hooks. Per-Slice was rejected as fatigue-inducing (slices ship weekly during active Epics; per-Slice retros decay to checkbox theater). Per-Milestone was rejected as too rare (months between captures loses fidelity — by the time the retro is written, the lessons have already drifted). Milestone meta-retro is value-add when it happens but should not gate; it operates on already-captured Epic retros, not the lived session.

**Alternatives considered.**
- *Per-Slice retros* — rejected; fatigue-inducing, decays to theater.
- *Per-Milestone only* — rejected; loses fidelity to the Epic-scale lessons.
- *Per-Slice optional + per-Epic required* — rejected; double bookkeeping, unclear cardinality semantics for the index.

**Reference.** `M4.5.E9-REQUIREMENTS.md` § "Locked Decisions" row D-E9-5; FR6 (milestone meta-retro, downgraded to manual per A6 in PLAN).

### D-E9-6 — File location = flat convention

**Decision.** Per-Epic retros live at **`.planning/M{milestone}.E{N}-RETROSPECTIVE.md`** (flat; matches existing artifact convention used by PLAN, REVIEW, PROGRESS, VERIFICATION, REQUIREMENTS, RESEARCH, VALIDATION). Index lives at **`.planning/RETROSPECTIVES.md`** (root of `.planning/`).

**Rationale.** Pre-staging the wiki shape (`.planning/retrospectives/M{milestone}.E{N}.md`) was rejected because workstream #3 (wiki restructure) is being deliberately interrogated in M5.E1's DISCUSS — pre-deciding the directory shape now would short-circuit that work. M5.E1's migration tool will handle relocation if the wiki restructure ships. Flat convention also means the existing artifact-discovery patterns (the `{N}-{ARTIFACT}.md` / `{ARTIFACT}.md` / `{PHASE}-{ARTIFACT}.md` resolution rule used by `/sig:resume`) extend with minimal churn.

**Alternatives considered.**
- *`.planning/retrospectives/M{milestone}.E{N}.md` subdirectory* — rejected; pre-decides M5.E1's wiki-shape question.
- *`.planning/retrospectives/{milestone}/E{N}.md` two-level* — rejected; same as above plus harder to glob.
- *Stick retros into existing artifact files (e.g., extend `M4.5.E9-REVIEW.md` with a retro section)* — rejected; mixes pre-ship review (defect-finding) with post-ship retro (learning capture); different audiences, different timing.

**Reference.** `M4.5.E9-REQUIREMENTS.md` § "Locked Decisions" row D-E9-6; FUTURE-IDEAS.md § "Memory & Documentation Management" workstream-3 framing (wiki restructure deferred).

### D-E9-7 — Backfill = stubs with `[FILL IN]` markers

**Decision.** For each already-shipped M4.5 Epic (E1 partial, E2 partial, E3, E6, E7 per CONTEXT.md as of 2026-05-25), M4.5.E9 generates a **stub `RETROSPECTIVE.md`** pre-populated with auto-extracted artifact links (PLAN, REVIEW, PROGRESS, VERIFICATION) + commit range + `[FILL IN]` markers in every reflection section. User fills in opportunistically. Stubs vs. complete status is surfaced in the index.

**Rationale.** Surfaces the gap honestly without inventing false memories. Forward-only (no backfill, retros start at M4.5.E9) would let the historical gap stay invisible — strangers reading the index would see five gap rows with no explanation and the project's learning history would appear to start mid-stream. Auto-synthesize from session transcripts or commit messages would be scope creep — that's migration-tool territory for M5.E1, not enforcement-mechanism territory for E9. The honest middle is a stub with auto-extractable structural fields filled and reflection fields explicitly marked `[FILL IN]`.

**Partial-Epic handling.** PLAN-level decision (deferred from DISCUSS): partial Epics (E1, E2) get a stub for the shipped-portion only with an explicit header note ("Epic incomplete as of backfill date; this retro covers shipped slices only. When remaining slices ship, append a continuation section."). Recommendation locked at PLAN gate.

**Alternatives considered.**
- *Forward-only (no backfill)* — rejected; obscures the historical learning gap.
- *Auto-synthesize stub content from commits / session transcripts* — rejected; scope creep into M5.E1 migration tooling; fabricated content is worse than honest `[FILL IN]` markers.
- *Manual backfill ceremony (user writes them from scratch)* — rejected; the auto-extractable structural fields (links, commit ranges, dates) are mechanical and worth pre-filling.

**Reference.** `M4.5.E9-REQUIREMENTS.md` § "Locked Decisions" row D-E9-7; FR4 § "Partial-Epic handling"; `M4.5.E9-PLAN.md` § S1.t9 partial-Epic header.

### D-E9-8 — Enforcement mechanism = layered (command-internal + PreToolUse hook + SessionStart-resume hook)

**Decision.** Three enforcement mechanisms, all shipping together in S1:

1. **Command-internal check in `commands/ship.md`** — primary enforcement; works across all runtimes including Cursor/Codex adapters. Reads `state.current_epic`, derives expected retro path, runs `validateRetroContent`, halts SHIP on failure.
2. **`PreToolUse(Edit|Write)` hook on `.planning/STATE.md`** — Claude Code (+ Codex compatible). Intercepts the exact bad write even if user manually edits STATE.md to skip `/sig:ship`. Bypass-resistant at the tool layer; user flags do not bypass it.
3. **`SessionStart(resume)` hook** — Claude Code (+ Codex compatible). Detects dirty-EXECUTE state from a prior session (current_epic set, phase: EXECUTE, missing retro for an Epic that should have shipped) and emits a high-visibility warning via `additionalContext` on the next session resume.

**Explicitly NOT included:** `Stop` hook. Superpowers issue #390 documented Stop hooks hanging indefinitely on slow operations, wedging the session. Also fires every turn, not session-end — creating false-positive risk during normal EXECUTE work.

**Rationale.** PLAN-phase research surfaced an ESCALATE-level gap: SHIP-phase enforcement is **structurally orthogonal to the motivating failure mode** (the context that motivated the Epic was *the conversation context cleared before `/sig:ship` was invoked* → a SHIP-phase check would never fire in that case). Anthropic's `PreSessionEnd` hook (which would close the gap natively) does not exist in Claude Code's public API. No single mechanism perfectly addresses the failure mode, so the answer is defense-in-depth: command-internal catches the normal path, `PreToolUse` catches the manual-STATE-write bypass, and `SessionStart-resume` catches the original motivating scenario (gap discovered on next session). Each mechanism handles a failure mode the others miss; together they degrade gracefully when any one is unavailable.

**Cross-runtime implication.** Cursor users get command-internal only (Cursor's hook API does not currently support `PreToolUse` on file writes). Codex gets the full layered stack. Documented as a known limitation in PLAN § "Risk mitigation".

**Alternatives considered.**
- *Command-internal only* — rejected; misses the manual-STATE-write bypass (user edits STATE.md directly, skipping `/sig:ship`) and the original motivating failure mode (context cleared before SHIP).
- *Hook-only (no command-internal)* — rejected; Cursor/Codex adapters lose enforcement entirely. Command-internal is the universal floor.
- *Add a `Stop` hook for session-end detection* — rejected; superpowers #390 (hanging) plus false-positive risk (Stop fires every turn).
- *Wait for `PreSessionEnd` hook to land in Claude Code* — rejected; indefinite blocker on a hypothetical API.

**Reference.** `M4.5.E9-REQUIREMENTS.md` § "DISCUSS amendments from PLAN research" → D-E9-8 entry (full ESCALATE finding + user confirmation context); `M4.5.E9-RESEARCH.md` § 5 (hook API surface verification); `M4.5.E9-PLAN.md` S1.t6 + S1.t7 task specs (mechanism implementations).

---

**Impact on EXECUTE.** All 8 decisions are pre-locked; no decision deferrals carry into the EXECUTE phase. AMEND-level issues (A2, A3, A4, A6, A8) are absorbed into PLAN task specs (S1.t6, S1.t5, S1.t8, S2.t6, PLAN-wide AC split respectively) and do not require separate DECISIONS.md promotion — they're encoded as implementation requirements, not architectural decisions. Deferred AMEND items (A5, A7, A9) are documented in REQUIREMENTS.md § "Deferred" with explicit revisit triggers.

---

## 2026-05-28 — M4.5.E8 PLAN decisions locked (D-E8-7 through D-E8-12)

PLAN-phase research (4 parallel agents — project / codebase / risk / phase) surfaced six new decisions that complement the 6 DISCUSS-era locks (D-E8-1 through D-E8-6, captured 2026-05-24). All six emerged from empirical findings or risk analysis, not from re-litigating DISCUSS scope.

### D-E8-7 — Version source = `/repos/.../tags`, NOT `/releases/latest`

**Decision.** FR6's GitHub API endpoint is `https://api.github.com/repos/InsightRiot/signal/tags`. The response is an array; the most recent tag is element `[0]`. The field name is `name` (not `tag_name`). Strip leading `v` before semver compare.

**Rationale.** Empirical: `curl -sS https://api.github.com/repos/InsightRiot/signal/releases/latest` returns HTTP 404 because Signal publishes git tags but has never cut a GitHub Release object. `/tags` works unauthenticated, returns HTTP 200 with the expected schema, and matches Signal's actual release contract.

**Alternatives considered.**
- *Make E8.S3 SHIP gate include creating a GitHub Release* — rejected; couples a diagnostician feature to a release-pipeline process change.
- *`gh` CLI fallback* — rejected; adds an external dependency, unauth API works fine.

**Reference.** `M4.5.E8-RESEARCH.md` § 1 + § 2; `M4.5.E8-PLAN.md` § "Conflicts with REQUIREMENTS" item 1.

### D-E8-8 — Generated script: `#!/usr/bin/env bash` + `set -u -o pipefail` (NOT `set -e`)

**Decision.** The script written by `/sig:doctor --fix` / `--reinstall` begins with `#!/usr/bin/env bash` and `set -u -o pipefail`. **`set -e` is deliberately omitted.**

**Rationale.** `set -e` interacts badly with conditional `[y/N]` branches — declining a prompt followed by a no-op should NOT abort the script. Each mutating step explicitly checks its own exit and continues regardless. macOS ships bash 3.2 at `/bin/bash`; `#!/usr/bin/env bash` picks up Homebrew bash 5 if installed (and Signal's `[[ ]]` test syntax requires bash, not sh).

**Alternatives considered.**
- *Full `set -euo pipefail`* — rejected; aborts on declined prompts. Trailing "partial completion" message handles the case better.
- *`/bin/bash` shebang* — rejected; macOS bash 3.2 lacks features Signal relies on.

**Reference.** `M4.5.E8-RESEARCH.md` § 4 "Shell script generation safety"; arslan.io idempotent-bash + Codurance safe-bash references.

### D-E8-9 — Upstream filings: cross-link 2 existing in S1; file new P3 alongside S1 ship

**Decision.** Of the 3 P-state upstream issues FR9 originally proposed filing, **2 already exist:**

- **P1** stale `gitCommitSha` = [anthropics/claude-code#56740](https://github.com/anthropics/claude-code/issues/56740) (open since 2026-05-06)
- **P2** no Uninstall verb = [anthropics/claude-code#62497](https://github.com/anthropics/claude-code/issues/62497) (open since 2026-05-26)

PLAN promotes cross-linking work into **S1** (lead each P-section in `docs/install-troubleshooting.md` with the canonical upstream issue URL + filing date). The **new P3 issue** (Disabled state survives uninstall+reinstall) is filed alongside S1 ship — no upstream match found.

**Rationale.** Filing duplicates embarrasses Signal in front of the launch audience (M4.5.E5). Per [[feedback_document-in-the-moment]], cross-link now while context is fresh; don't defer to S3 "optional" status.

**Alternatives considered.**
- *File all 3 as new* — rejected; duplicates harm credibility.
- *Skip upstream filing entirely* — rejected; new P3 issue is genuinely useful.
- *Defer cross-links to S3* — rejected; doc reads incomplete without them.

**Reference.** `M4.5.E8-RESEARCH.md` § 5 "Upstream filing best practice"; FR9 of `M4.5.E8-REQUIREMENTS.md`.

### D-E8-10 — Test isolation via `homeDir` parameter injection (NEVER `os.homedir()` direct)

**Decision.** Every function in `tools/lib/doctor.js` that touches `~/.claude/` paths takes `homeDir` as an injected parameter — never calls `os.homedir()` directly. Production code paths pass `os.homedir()` from `commands/doctor.md`; tests pass fixture tmpdir paths. Generated scripts substitute the resolved absolute `homeDir` at script-gen time — never emit literal `~/.claude/`.

**Rationale.** AC #3 fixture-comparison tests + AC #5 `--reinstall` content tests could execute destructive script content against the developer's real `~/.claude/` if isolation depends on developer vigilance. Encoding isolation in the code surface eliminates the failure mode. **This is the highest single risk in E8** per RESEARCH § 7 Risk 1.

**Alternatives considered.**
- *Test discipline — developers just be careful with paths* — rejected; one mistake destroys the dev environment.
- *`SIG_DOCTOR_HOME` env var* — kept as secondary fallback (documented in script comments) but parameter injection is primary; env vars are too easy to forget.

**Reference.** `M4.5.E8-RESEARCH.md` § 7 Risk 1; `M4.5.E8-PLAN.md` anti-rationalization table row 1; meta-test in S2.t12.

### D-E8-11 — Every detector MUST be Signal-scoped before emitting findings

**Decision.** All 5 detectors filter inputs by Signal-scoped patterns BEFORE emitting `{detected: true, ...}`:

- Detectors reading `installed_plugins.json` or `settings.json.enabledPlugins` filter by key prefix `sig@` or `signal@`.
- Detectors walking the cache filter by path pattern `signal/sig/` or `signal/signal/`.
- P5 (SSH multi-identity) is informational only — does not change `healthy: false`.

A fixture test asserts non-Signal plugin entries in `installed_plugins.json` (with simulated staleness) yield `healthy: true`.

**Rationale.** `installed_plugins.json` and `settings.json` are shared state files containing entries for every installed Claude Code plugin. A Signal detector that emits a P-state finding (and therefore a `--fix` script step) for a non-Signal plugin would propose `rm -rf` against another plugin's cache. That's a destructive cross-tenant bug.

**Alternatives considered.**
- *"The cache dir is plugin-scoped so it doesn't matter"* — rejected; `settings.json` and `installed_plugins.json` are NOT plugin-scoped.
- *Post-emit filtering (detect everything, drop non-Signal in aggregate)* — rejected; doubles complexity, leaks non-Signal evidence into intermediate code paths.

**Reference.** `M4.5.E8-RESEARCH.md` § 7 Risk 2; per-detector pseudocode in RESEARCH § 3.

### D-E8-12 — 3-level exit code: 0 healthy / 1 P-states detected / 2 doctor errored

**Decision.** `/sig:doctor` exits with one of three codes:

- `0` — healthy, no findings, no errors
- `1` — one or more P-states detected (broken install, actionable by user)
- `2` — doctor encountered an error (parse failure, unexpected state, malformed `settings.json` from concurrent `/plugin install` write) — install state is **unknown**, user should investigate

REQUIREMENTS FR2 originally locked binary 0/1; PLAN expands to 3-level so CI consumers can distinguish "broken install" from "broken doctor."

**Rationale.** A transient network error during version-check leaking exit `1` would fail a CI gate for the wrong reason. Concurrent `/plugin install` writes that leave `installed_plugins.json` mid-write produce JSON parse failures — those are not P-state findings, they're "state file mid-write; retry" conditions. Pre-commit hooks gate on `!= 0`; CI dashboards distinguish meanings.

**Alternatives considered.**
- *Binary 0/1 as REQUIREMENTS originally specified* — rejected; loses signal value.
- *Distinct codes per P-state (P1 → 11, P2 → 12, ...)* — rejected; overspecified, no consumer needs it, breaks the "any non-zero" convention.

**Reference.** `M4.5.E8-RESEARCH.md` § 7 Risk 10; FR2 of `M4.5.E8-REQUIREMENTS.md`.

---

**Impact on EXECUTE.** All 12 E8 decisions (D-E8-1 through D-E8-12) are pre-locked. No decision deferrals carry into EXECUTE. The 3 conflicts with REQUIREMENTS surfaced during PLAN are reconciled by the new decisions (D-E8-7 reconciles FR6 endpoint conflict; D-E8-9 reconciles FR9 timing conflict; the `installed_plugins.json` shape conflict requires no decision — detector signatures handle the array). EXECUTE proceeds against `M4.5.E8-PLAN.md` as written.

---

## 2026-05-30 — M4.5.E2 Slices 2–5 DISCUSS decisions locked (9)

**Context.** `/sig:add` S1 (hardened hot path) shipped 2026-05-14; S2–S5 were planned the same day in `M4.5.E2-PLAN.md`. That plan predates two later locks: the 2026-05-24 FUTURE-IDEAS drain decision (Option A, above) and this DISCUSS's capture-friction call. DISCUSS re-entered 2026-05-30 after M4.5.E8 shipped and `/sig:resume` proposed E2 as the next Epic. Tier FULL, `gate_strictness: strict`. Full detail + acceptance criteria in `M4.5.E2-REQUIREMENTS.md`. (S1's own 25 locked decisions live in `M4.5.E2-RESEARCH.md` § 1, referenced there by number — not re-numbered here.)

**The 9 decisions:**

1. **Build all four slices (S2 + S3 + S4 + S5).** Finish `/sig:add` before the E5 launch. (Considered: drop S2 flags, or drain-only. Rejected — the self+peers audience means power-user flags earn their keep.)
2. **Drain gate is ADVISORY, not blocking.** S5's `/sig:plan` step recommends a disposition per surfaced entry but lets the user skip and continue; skipped entries re-surface next run. Rules out a hard gate (even at FULL) that would tax every plan run.
3. **Disposition vocabulary = promote / defer / merge / delete, recorded inline** on the entry's `**Status:**` line + explained in the commit. Inherits the 2026-05-24 Option A lock; **replaces** the 2026-05-14 plan's `[include / defer / cull]`.
4. **Quoted capture is ALWAYS instant.** `/sig:add "text"` → FUTURE-IDEAS with zero routing prompts, even for text ending in `?` or starting `fix`/`bug`/`TODO`. Honors the "capture latency dies on confirmation" anti-rationalization. Rules out heuristic auto-reroute on the hot path.
5. **S3 heuristic hints are CUT; S3 = naked-invocation interview only.** No-args `/sig:add` → one plain question → files to FUTURE-IDEAS; empty answer aborts cleanly. The `suggestDestination` heuristic + 3+other reroute prompts from the 2026-05-14 plan's Slice 3 are dropped (consequence of Decision 4).
6. **Routing = explicit flags only (S2):** `--question` → OPEN-QUESTIONS; `--milestone [N]` → milestone file; `--file` → undocumented escape valve (refuses DECISIONS/STATE + paths outside `.planning/`); multi-flag → error before any write. (Unchanged from the 2026-05-14 plan.)
7. **`--milestone` writes to a `## Captured via /sig:add` holding section**, never into the structured plan body. No-N uses STATE.md `current_epic`'s milestone (clear error if none); `--milestone N` requires the file to exist (no auto-scaffold; 5th destination stays deferred).
8. **No per-slice version tags.** Supersedes the plan's "tag-per-slice." Each slice = atomic commit(s) + CHANGELOG `[0.1.3]` Unreleased entry, per the E7/E3/E9 convention; a release tag is a separate event at Epic/milestone close.
9. **DISCUSS output → Epic-prefixed files + this DECISIONS entry**, not the shared `CONTEXT.md` (the fresh-session briefing). Matches E8/E9 precedent.

**What this rules out (so PLAN doesn't re-litigate):** any LLM/heuristic input classification; a blocking drain; confirmation on the quoted hot path; numbered entry IDs; the 5th (scaffold) destination; per-slice tags.

**Cross-references:** `M4.5.E2-REQUIREMENTS.md` (this DISCUSS's full spec, FR1–FR8 + ACs); `M4.5.E2-PLAN.md` Slices 2–5 (superseded where it disagrees); `FUTURE-IDEAS.md` § "FUTURE-IDEAS drain process"; DECISIONS 2026-05-24 (Option A); `M4.5.E3-REQUIREMENTS.md` § D-E3-11 (audience reframe).

---

## 2026-06-01 — M4.5.E4 DISCUSS decisions locked (D-E4-1 through D-E4-9)

**Context.** E4 (worked example + comparison page) entered DISCUSS 2026-06-01 after E2 closed and v0.1.3 was cut, with no Epic in flight. `/sig:resume` proposed E4 as the next move; the project is already calibrated FULL (`gate_strictness: strict`). Four gray areas were gated individually under strict; five consequent locks follow from the gated four + the E4 spec (`MILESTONE-4.5.md` § E4). Full spec + acceptance criteria in `M4.5.E4-REQUIREMENTS.md`.

**The pivotal insight that shaped DISCUSS:** the spec's literal worked example is `/sig:init` (brownfield) — but `/sig:init` scans a repo and *hands off to `/sig:calibrate`*, so an init-only example stops exactly where the calibration router (the wedge `docs/vs.md` is meant to sell) begins. The example was therefore re-scoped to a full `calibrate → ship` run so the wedge is actually visible.

**The 9 decisions:**

1. **D-E4-1 — Worked example = full `calibrate → ship` flow on ONE project.** Not init-only (stops before the wedge), not a SKETCH/FULL contrast (biggest option; deferred). *(User-gated.)*
2. **D-E4-2 — Example source = reuse + refresh `.dogfood/url-shortener-fulltier/`** with a mandatory drift audit to current conventions (STATE `schema_version: 1` from E6; Milestone/Epic vocab from M4.t18). Escape hatch: regenerate fresh if the audit finds the artifacts unsalvageable. *(User-gated.)*
3. **D-E4-3 — Example form = runnable app + artifacts + guard.** Commit `src/`+`tests/`+`package.json` (no `node_modules`) + refreshed `.planning/` + README; add a guard test so the example can't silently rot. *(User-gated.)* **Carries Risk R1** — native-dependency (`better-sqlite3`) caveat that PLAN must settle.
4. **D-E4-4 — `docs/vs.md` = prose decision guide**, heritage-respectful, "when to reach for which," calibration router as the wedge, ~60–80 lines. Not a feature matrix. *(User-gated.)*
5. **D-E4-5 — Exactly ONE worked example in E4.** Additional examples (Python / Rust / dormant) deferred to future Epics / E5.
6. **D-E4-6 — Comparison set = 5** (GSD, superpowers, Agent Skills, planning-with-files, compound-engineering), per the spec. gstack / pm-skills / oh-my-claudecode named in passing only; depth lives in `analysis/REPO-ANALYSIS.md` (linked).
7. **D-E4-7 — No third-party source vendored.** Moot for this (Signal-authored) example; locked as principle for any future real-repo example.
8. **D-E4-8 — FULL runtime NFR checklist is N/A; doc-quality NFRs bind instead** (link integrity, currency guard, line budget, accuracy, test discipline). E4 owns no runtime service.
9. **D-E4-9 — DISCUSS output → `M4.5.E4-REQUIREMENTS.md` + this DECISIONS entry**, not the shared `CONTEXT.md`. Matches E2 § Decision 9 / E8 / E9.

**Open for PLAN (flagged, not deferred-silently):** R1 — the runnable example's `better-sqlite3` native dependency can break "clone and `npm test`" on a stranger's machine. PLAN chooses: (a) swap to a zero-native-dep store during refresh (recommended), (b) keep it + document build step/Node range, or (c) scope the guard to artifact-parsing and label "runnable" with caveats. See `M4.5.E4-REQUIREMENTS.md` § Risks R1 / A1 / A2.

**What this rules out (so PLAN doesn't re-litigate):** init-only example; multi-tier contrast in E4; a fresh-from-scratch run (unless the audit forces it); a feature-matrix `vs.md`; vendoring third-party source; more than one example this Epic.

**Cross-references:** `M4.5.E4-REQUIREMENTS.md` (full spec, FR1–FR8 + ACs + Risks); `MILESTONE-4.5.md` § E4 (Epic definition); `analysis/REPO-ANALYSIS.md` (vs.md raw material); `.dogfood/url-shortener-fulltier/` (example source, gitignored); STATE.md M3 Task 2 findings (R1 origin).



---

## 2026-06-03 — M4.5.E5 DISCUSS decisions locked (D-E5-1 through D-E5-10)

**Context:** Entering the last M4.5 Epic — external validation + launch. E5 is the release trigger (E4's `[Unreleased]` CHANGELOG ships here). Full spec in `M4.5.E5-REQUIREMENTS.md`. Four gray areas gated individually under FULL/strict; six consequent locks follow.

1. **D-E5-1 — Launch posture = quiet peer release.** GitHub release + share with a small circle of peers who double as testers; validation and release are one motion. Not a public push (HN/Reddit/X — too much blast radius for unvalidated install UX), not launch-deferred. Matches the E3 "self + peers" reframe + the CONTEXT.md pivot flag. *(User-gated.)*
2. **D-E5-2 — Validation scope = assets now, validate async.** E5 closes on Claude's deliverables; real peer `/sig:init → /sig:ship` runs + friction capture happen async and feed the v0.1.(N+1) backlog. Not block-on-real-feedback (leaves the Epic open on others' availability), not self-validation-only (too lean for an Epic named "external validation"). *(User-gated.)*
3. **D-E5-3 — Launch assets = full post draft + demo script.** Claude drafts the full ~600–800 word post (landscape → Signal synthesis + calibration wedge) → `docs/launch-post.md`, plus a turnkey demo recording storyboard. Brett edits, records, publishes. Not outline-only, not release-notes-only. The E3-deferred 30s demo is folded in as a *script* (Claude can't record). *(User-gated.)*
4. **D-E5-4 — Version bump = decide at E5 close, with a lightweight inline rubric.** E1's `docs/versioning.md` is shelved (D-E3-12), so E5 writes a minimal rubric; Brett makes the v0.1.x → v0.2.0 call at close. Because validation is async, the call is a judgment on cumulative surface since v0.1.0, not on tester input. Not pre-committed to 0.2.0 or 0.1.4. *(User-gated.)*
5. **D-E5-5 — E5 is the M4.5 release trigger.** E4's `[Unreleased]` block ships with whatever version E5 cuts; version header stamped at close (D-E5-4). Matches the E7/E3/E9/E8/E2 land-then-tag convention.
6. **D-E5-6 — Asset / human split is the Epic's spine.** EXECUTE delivers only Claude-producible assets (drafts, templates, rubric, scripts); the outward actions (recruit peers, record demo, publish, push tag) are out of EXECUTE and captured as a handoff checklist (FR7). This is what keeps E5 shippable under D-E5-2.
7. **D-E5-7 — FULL runtime NFR checklist N/A; doc-quality NFRs bind** (accuracy/no-over-claiming, privacy, link integrity, line budget, test discipline). E5 owns no runtime service. Mirrors D-E4-8.
8. **D-E5-8 — DISCUSS output → `M4.5.E5-REQUIREMENTS.md` + this entry**, not the shared `CONTEXT.md`. Matches E2 § Decision 9 / D-E4-9 / E8 / E9.
9. **D-E5-9 — Launch post leads with the original landscape analysis** (`analysis/REPO-ANALYSIS.md`) → Signal as synthesis + calibration wedge. The E4 `vs.md` accuracy traps apply (heritage-respectful, no over-claiming, no fabricated benchmarks/user counts).
10. **D-E5-10 — No new worked examples in E5.** D-E4-5's deferral of additional examples (Python/Rust/dormant) to "future Epics / E5" resolves to: **not E5** (a lean launch Epic). They stay deferred to a post-launch Epic / M5.

**What this rules out (so PLAN doesn't re-litigate):** a public/broad launch this Epic; blocking E5 on real human feedback; Claude attempting to recruit testers / record video / publish; pre-committing the version number; adding more worked examples; treating FR5 as license to unshelf all of E1 Slices 3–5.

**Two risks flagged for PLAN:** R1 — FR5 version-rubric location overlaps shelved E1 `docs/versioning.md` (scope it to the rubric only). R2 — distribution channels are "TBD" in the spec; the handoff must name concrete channels (GitHub release + direct peer share).

**Cross-references:** `M4.5.E5-REQUIREMENTS.md` (full spec, FR1–FR8 + NFRs + ACs + Risks); `MILESTONE-4.5.md` § E5 (Epic definition); `analysis/REPO-ANALYSIS.md` (launch-post raw material); `M4.5.E3-REQUIREMENTS.md` § D-E3-10/11 (audience reframe), § D-E3-12 (E1 shelving + tester trigger).

---

## 2026-07-04 — Backlog review ratified (BR-1 through BR-9)

**Context.** Full backlog pass over FUTURE-IDEAS.md (~30 live entries) + MILESTONE-5.md + OPEN-QUESTIONS.md + shelved items, written up as `.planning/BACKLOG-REVIEW-2026-07-04.md` (5 gap-fills, 8 sharpened entries, 8 sprint clusters + watchlist). Ratified interactively 2026-07-04. Dispositions applied inline to FUTURE-IDEAS.md per the Option A drain convention (DECISIONS 2026-05-24); committed work promoted to milestone files.

1. **BR-1 — `/sig:sweep` owns the periodic hygiene sweep (`--docs` / `--code`); `/sig:audit` keeps the engineering-readiness scorecard.** Resolves the name collision between the 2026-05-09 and 2026-06-04 FUTURE-IDEAS entries; `/sig:sweep --docs` absorbs workstream #4's `/sig:doc-review` (its scope is a subset).
2. **BR-2 — Default traversal artifact = hierarchical markdown intent layer; knowledge graph is opt-in later.** Aligns with the locked "plain markdown in git is load-bearing" anti-rationalization and avoids a Python dep against the <5-min install target. Flips only if relational queries prove needed on a real Epic. Decision spike (run `intent-layer` on a real repo) lives in the M5-opening audit. The graphify entry is now the single home of the traversal question.
3. **BR-3 — STATE.md auto-update: Option A** (frontmatter-refresh step appended to the 5 non-EXECUTE phase commands), **bundled with origin-drift detection (`isStaleVsOrigin`) as one slice** — shared failure mode (stale STATE → wrong resume briefing) + shared fixtures. Options B/C parked on the trigger watchlist.
4. **BR-4 — Audience-technicality dial lives at user level** (communication block in user-scoped config) **with per-project PROFILE.md override.** Commands read it via a shared output-shaping preamble + the plain-English mapping tables spec'd in the `/sig:orient` entry — built once, shared.
5. **BR-5 — Memory & Doc-Runtime entry corrected against shipped reality:** workstreams #1+#2 shipped as M4.5.E9 (v0.1.3); remaining scope = #3-active (live-doc wiki restructure) + #4 (doc-runtime), with the six archive-dogfood ⚠ lessons as design inputs.
6. **BR-6 — Trigger watchlist adopted** as a standing FUTURE-IDEAS entry that the `/sig:plan` drain surfaces at every planning gate; all trigger-parked items moved onto it (including the dated synthesizer trigger that would otherwise expire unobserved 2026-08-23).
7. **BR-7 — Sprint 1 (trust hardening → v0.1.5) = new Epic M4.5.E10** ("Resume trust & capture integrity"). Fits the release-hardening charter; ships before external testers onboard. Stanza + status row added to MILESTONE-4.5.md; exit criteria updated to E1–E10.
8. **BR-8 — M5 opens with the landscape re-audit + roadmap refresh** (confirms the "M5 opening move" FUTURE-IDEAS recommendation). MILESTONE-5.md carries the opening-move note; its E1–E6 order gets re-sequenced by the audit's output.
9. **BR-9 — Second dogfood project committed** as the usage-signal hedge for M5's gate (Sprint 0). Project selection deferred to kickoff; watchlist row escalates if not started by M5 PLAN.

**What this rules out (so later planning doesn't re-litigate):** a wholesale FUTURE-IDEAS rewrite (dispositions are inline, per Option A); building the graph before the markdown intent layer proves insufficient; per-project storage of the language dial; STATE Options B/C absent evidence Option A fails; treating the sprint clusters as locked Epic definitions (they're planning inputs — each still goes through its own DISCUSS/PLAN).

**Cross-references:** `BACKLOG-REVIEW-2026-07-04.md` (full review + sprint clusters); FUTURE-IDEAS entries stamped 2026-07-04 (7 promotions + 10 updates + watchlist); MILESTONE-4.5.md § E10; MILESTONE-5.md § Epics (opening-move note); DECISIONS 2026-05-24 (Option A drain convention this pass executed).

---

## 2026-07-04 — M4.5.E10 DISCUSS decisions locked (D-E10-1 … D-E10-11)

**Context.** `/sig:discuss M4.5.E10` — DISCUSS phase for the "Resume trust & capture integrity" Epic (v0.1.5), promoted from the same-day backlog review (BR-7). FULL/`gate_strictness: strict`: five product-altitude gray areas gated individually via `AskUserQuestion`; plumbing decided at product altitude. Full spec + acceptance criteria in `M4.5.E10-REQUIREMENTS.md`. One code-reality correction surfaced during scouting (D-E10-6). Each item verified still open in source 2026-07-04.

1. **D-E10-1 — Scope = the 6 listed items only, one v0.1.5.** Trigger-watchlist `/sig:plan` drain-step (backlog A1) stays a separate follow-on; no item trimmed. *(User-gated: "6 items only".)*
2. **D-E10-2 — Origin-drift = live `git fetch` on all three of `/sig:resume` / `/sig:status` / `/sig:checkpoint`**, fail-open (offline/no-remote/non-git → no-op), with a short fetch timeout so `/sig:status` stays fast. *(User-gated: "Fetch on all three" — over the recommended status-local-only; timeout is the mitigation.)*
3. **D-E10-3 — `/sig:doctor` upgrade-path = schema-drift focus.** In-flight `STATE.md schema_version` vs the plugin's `SCHEMA_VERSION`; version-staleness leg left to E8's `/sig:status` check. Forward-looking (no schema >1 exists yet). *(User-gated: "Schema-drift focus".)*
4. **D-E10-4 — Capture guards = recover + warn.** Drain parses past a dangling-open fence (hidden entries resurface) + warns; `/sig:add` repairs a stranded footer to EOF + announces; plus a validator/lint check for content-after-footer (footer forward-fix options 1+2). Never silently mutate capture content. *(User-gated: "Recover + warn".)*
5. **D-E10-5 — SessionStart smoke test = automated harness + documented manual leg.** Integration test asserts the stdout-JSON contract; `references/hooks-api.md` carries the real-session procedure Brett runs async (asset/human split, D-E5-6). *(User-gated: "Automated harness + documented manual leg".)*
6. **D-E10-6 — Item 3 (STATE auto-update Option A) shrinks to `discuss.md` + `plan.md` only.** Code-verified: `verify.md`/`review.md`/`ship.md` already call `markFresh`. **Corrects BR-3's "5 non-EXECUTE commands" claim** — the fix is a 2-command patch. *(Surfaced, not resolved silently.)*
7. **D-E10-7 — Item 1 resolver extracted as a pure helper** (`resolveArtifactPath`), pattern 0 = `{current_epic}-{ARTIFACT}.md` first, fires only when `current_epic` non-null; legacy patterns unchanged. Product-altitude plumbing.
8. **D-E10-8 — Origin-drift helper `isStaleVsOrigin(baseDir, {execFn})` in `tools/lib/state.js`**, sibling to `isStateStale`; default branch via `git rev-parse --abbrev-ref origin/HEAD` (fallback `main`); returns `{stale, aheadCount, commits, touchedPlanning}`. Product-altitude plumbing.
9. **D-E10-9 — DISCUSS output → `M4.5.E10-REQUIREMENTS.md` + this entry**, not the shared `CONTEXT.md` (matches E5 D-E5-8). Project `CONTEXT.md`/`STATE.md` prose refresh at E10 SHIP.
10. **D-E10-10 — FULL runtime NFR checklist N/A** (no service/HTTP surface); resilience + resource NFRs bind (fail-open, timeout-bounded fetch, backwards-compat, no new deps). Mirrors D-E5-7.
11. **D-E10-11 — No new runtime deps; 777-test baseline stays green; strict Nyquist** — every AC tested except the one human-only real-session smoke leg (documented attestation).

**What this rules out (so PLAN doesn't re-litigate):** patching all 5 non-EXECUTE commands for Option A (only 2 need it); re-implementing E8's version-staleness in `/sig:doctor` (schema leg only); a `/sig:status` that skips drift-detection (it fetches, bounded by timeout); silent self-heal of `FUTURE-IDEAS.md` (guards announce); folding the watchlist drain-step into E10; a `schema_version` bump (none — backwards-compat holds).

**Cross-references:** `M4.5.E10-REQUIREMENTS.md` (FRs + ACs + NFRs + assumptions); `MILESTONE-4.5.md` § E10; `FUTURE-IDEAS.md` entries (origin-drift 2026-05-19 · Epic-prefix artifact resolution · STATE auto-update protocol · Drain safety check · FUTURE-IDEAS footer drift · SessionStart smoke test · Hook output format reference doc); DECISIONS 2026-07-04 backlog-review entry (BR-3/BR-7 provenance).

---

## 2026-07-05 — Epic-native flow committed as the next Epic after M4.5.E10

**Context.** During E10 PLAN, research proved FR1's Epic-prefix resolver is inert for command-driven projects: **no command writes `current_epic`** (it initializes to `null` at `state.js:167,213` and is only ever read), and the phase commands write **phase-prefixed** artifacts (`{phase}-PLAN.md`), not Epic-prefixed. Root cause — Signal has **two unreconciled modes:**
- **Linear mode** (what the commands actually implement): one project = one `calibrate → ship` pass; artifacts named by phase; no Epic concept anywhere in the flow.
- **Epic mode** (what Signal-on-Signal runs *by hand*): many Milestones → Epics, each Epic runs its own `discuss → ship`, artifacts named `M4.5.E10-PLAN.md`, `current_epic` tracks the live one.

The Epic/Milestone/Slice/Task vocabulary was locked (M4.t18) as *planning language* but the commands were never wired to drive off it. Signal dogfoods Epic mode entirely by hand — `current_epic: M4.5.E10` was hand-typed into STATE.md during this session.

**Decision.** Build **"Epic-native flow"** as the next Epic after E10 (user-gated 2026-07-05, over cram-into-E10 / pause-and-design-now). Make Epic mode first-class: commands **create/track Epics**, assign Epic IDs, write **Epic-scoped artifacts**, populate `current_epic` automatically; **per-Epic calibration** (an Epic inside a FULL project can honestly be SKETCH) falls out naturally. Un-parks the "multi-feature project lifecycle" FUTURE-IDEAS entry with a concrete reason.

**Why not now / not in E10.** `current_epic` alone is inert without Epic-scoped artifact naming, which requires deciding the Epic-creation + ID convention for *every* project and migrating existing linear-mode projects — a real design pass, not a slice. E10 is orthogonal trust-hardening; **FR1 stays E10's forward-compatible read-half** (the write-half slots on top with zero rework). Its own DISCUSS defines the naming convention, Epic-creation UX, artifact-naming migration, and per-Epic calibration.

**Rules out:** cramming the write-half into E10 under a shipping clock; treating Epic-native as a "someday" FUTURE-IDEAS entry (it is committed as *next*). Milestone placement (M4.5.E11 vs an M5 Epic) is decided at its DISCUSS — it's architecture, likely M5-adjacent, but sequenced immediately after E10.

**Cross-references:** `M4.5.E10-RESEARCH.md` § SD1 (AD1); `FUTURE-IDEAS.md` "Multi-feature project lifecycle"; DECISIONS 2026-07-04 (BR-9 second-dogfood, which will exercise feature #2).

---

## 2026-07-13 — v0.1.6 doc-integrity guardrail DISCUSS decisions locked (D-v016-1 … D-v016-7)

**Context.** `/sig:discuss` on the "v0.1.6 doc-integrity guardrail" queued in `CONTEXT.md` (2026-07-13 doc-accuracy pass). FULL/`gate_strictness: strict`: two product-altitude gray areas gated via `AskUserQuestion`; plumbing decided at product altitude. Full spec + acceptance criteria in `v0.1.6-REQUIREMENTS.md`. Two code-reality corrections surfaced during scouting (D-v016-1 on footer-drift; the hook + BUGS.md already existing).

1. **D-v016-1 — Scope = 4 pieces, footer-drift is bookkeeping only.** (a) extend the STATE write-hook, (b) drain blockquote fix, (c) `/sig:add` title fix, (d) move 3 bug items → `BUGS.md`. **Correction:** footer-drift is *already fixed* (E10.S3 shipped `add.js` footer repair + lint on 2026-07-05) — it is not a fifth fix, only a move-to-BUGS-as-`fixed`. No "adjacent footer fix" folded in. *(Surfaced, not resolved silently.)*
2. **D-v016-2 — Hook posture = block malformed frontmatter at write; flag oversize at read.** Hard-block (PreToolUse exit 2) only when a `completed_phases`/`blockers` entry is clearly prose (a value in a YAML list field that violates the compact shape is *always* malformed, so blocking is safe); oversized STATE body → non-blocking banner at `/sig:resume`/`/sig:status`/`/sig:checkpoint`. *(User-gated: "Block malformed, flag size" — over warn-only and block-both.)* **Stake:** the hook is registered globally (`hooks/hooks.json`, `${CLAUDE_PLUGIN_ROOT}`, path-gated to any `.planning/STATE.md`), so extending it broadens its blast radius from "only during Signal's SHIP flow" to "every Edit/Write to any STATE.md in any repo where Signal is installed" — the block must be false-positive-safe for strangers.
3. **D-v016-3 — Packaging = lightweight v0.1.6 patch (no Epic ID), but the cross-project hook gets a specialist REVIEW pass.** Direct fixes + one CHANGELOG entry (E4-style lightweight close), not a full Epic + retro (E10-style) — *except* the hook, whose stranger-facing blast radius earns a REVIEW pass. *(User-gated: "v0.1.6 patch + hook REVIEW" — over Full Epic M4.5.E11 and Defer.)*
4. **D-v016-4 — Drain fix = option (a), tolerant detector.** Recognize a leading `> **Promoted|Deferred|Merged|Shipped|Deleted …**` blockquote as dispositioned; reject option (b) (re-stamp the convention to a `**Status:**` line) since it would force re-writing ~40 existing entries. Backward-compatible. *(Product-altitude plumbing.)*
5. **D-v016-5 — Size = detect + flag only; eviction is M5.** Threshold sits above Signal's own legitimate 62 KB file and below the 465 KB CMMC failure (exact value at PLAN; working assumption ~150 KB body). Signal's own STATE.md is the calibration specimen — the warn must not cry wolf on it. Actual eviction/remediation of a bloated file is the M5 redesign (root cause `upgradeStateFile` inlining legacy body at `state.js:177` + append-without-evict). *(Product-altitude.)*
6. **D-v016-6 — FULL runtime NFR checklist N/A** (no service/HTTP surface); binding NFRs = fail-open, backward-compat (no schema bump), no new deps, platform-agnostic banner, read-only size check. Mirrors D-E10-10 / D-E5-7.
7. **D-v016-7 — Tracked as `v0.1.6` in STATE `current_epic`; artifacts `v0.1.6-*.md`.** `v0.1.6` passes `EPIC_ID_RE` so the E10 `resolveArtifactPath` pattern-0 read-half finds `v0.1.6-PLAN.md` etc. on resume — no "artifact not found" papercut. *(Plumbing.)*

**What this rules out (so PLAN doesn't re-litigate):** a fifth footer-drift fix (already shipped); a write-time size *block* (read-time banner instead — a big file can be legit until M5 eviction); warn-only-never-block for the frontmatter-prose case (malformed YAML is always wrong → block); drain option (b); a `schema_version` bump (backward-compat holds); full-Epic ceremony/retro (lightweight patch, hook-only REVIEW); any STATE eviction (M5).

**Cross-references:** `v0.1.6-REQUIREMENTS.md` (FRs + ACs + NFRs + assumptions); `CONTEXT.md` (2026-07-13 queued-next block); `BUGS.md` (destination for the 3 moved entries); `FUTURE-IDEAS.md` entries "FUTURE-IDEAS footer drift" / "Drain disposition-detector misses blockquote promotions" / "/sig:add derived-title polish" (source of the 3 moves + FR3/FR4); `MILESTONE-5.md` § 82 (STATE eviction gate); DECISIONS 2026-07-04 (BR provenance).

---

## 2026-07-13 — Curator stays dormant here; native `/sig:index` is the successor, external Curator integration to be dropped

**Context.** Backfills a 2026-06-16 decision that was never logged here — a grep of `.planning/` on 2026-07-13 found **zero** curator references (not in DECISIONS.md, not in FUTURE-IDEAS.md); the stance lived only in an agent-memory file (`curator-dormant-on-signal-planning`). Curator (the external CLI, `github.com/insightriot/curator`) is referenced anywhere in the codebase only in `commands/ship.md` §8, as an *optional* doc-reconcile hook.

**Decision (backfill — made 2026-06-16).** Signal's own `.planning/` is **not** reconciled by external Curator — its `INDEX.md` is **hand-curated** (HOT/WARM/COLD tier legend + a gotcha one-liner per file). Leave the repo with no `.curator.yml` and no Curator post-commit hook; SHIP §8's Curator step is then a clean no-op here **by design**. Verified still true 2026-07-13 (no `.curator.yml`, no `.git/hooks/post-commit`, INDEX still in hand-curated format).

**Why (dormant).** `curator init` + `refresh` overwrote the hand-curated INDEX with a generic "safe to delete and regenerate" projection plus a ~200-line `ID → where it appears` table that is almost all false positives — Curator's auto-detected `id_patterns` (`[A-Z]{1,5}\d+`) collide Signal IDs like `A1`/`D1` across dozens of archived files (→ 249 bogus "integrity issues," a 262-insert/67-delete churn), and the post-commit hook it installs re-clobbers the index on every commit.

**Decision (new — 2026-07-13, user preference).** Direction is **Signal-native, external-Curator-free.** The future `/sig:index` (FUTURE-IDEAS Workstream 4 "Doc-runtime," strong M5 candidate) is the intended successor for Signal's own index maintenance, replacing the hand-curation. Once `/sig:index` ships, **deprecate/remove the optional Curator step in `ship.md` §8** so Signal carries no dependency on an external doc-reconcile CLI. Recorded now so M5 planning inherits the intent rather than re-litigating it.

**Rules out.** Running Curator against Signal's `.planning/` (regresses the INDEX); treating the external Curator integration as a permanent part of Signal-the-plugin; leaving the "go native" intent implicit (it is now recorded on both sides — see the paired FUTURE-IDEAS note).

**Cross-references.** `commands/ship.md` §8 (the optional integration being sunset); `FUTURE-IDEAS.md` § Workstream 4 `/sig:index` entry (paired directive, stamped 2026-07-13); `.planning/INDEX.md` (hand-curated; "structural rows will move to a future `/sig:index`"); agent-memory `curator-dormant-on-signal-planning`.

---

## 2026-07-15 — Compounding memory is per-repo; org-level learning is a user-run analysis on top (not a Signal primitive)

**Context.** Resolves the last of `REPO-ANALYSIS.md` Part 6's four strategic-decision points, flagged still-open in `analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` §3 ("Compounding substrate: per-project vs per-org — **decide before building the Compound phase, not during**"). `MILESTONE-5.md` E2 punted with "carry forward via `.planning/`," which never actually answered per-repo vs per-org. Decided by Brett 2026-07-15 during roadmap orientation (not during a build), which is exactly the "decide before building" the seed asked for.

**Decision.** The compounding/learning substrate is **per-repository**: each project's accumulated learnings live in that repo's own `.planning/` (retros, `RETROSPECTIVES.md`, whatever the future `/sig:compound` phase writes). Signal does **not** maintain a shared central/per-org learning store as a primitive. Org-wide or cross-repo learnings are an **opt-in analysis a user runs over multiple repos' `.planning/`** — a derived pass on top of the per-repo substrate, not a service Signal keeps in sync.

**Why.** Keeps each repo self-contained and portable (learnings travel with the code, no external store to provision, sync, or secure) and keeps Signal's blast radius inside the repo it's installed in — consistent with the whole `.planning/`-as-project-memory thesis. It doesn't foreclose org learning; it relocates it to a cheaper, opt-in layer (run your own analysis across repos when you want it) instead of paying central-store cost by default for every project.

**Consequences for M5.** The Compound phase (M5.E2 / backlog Sprint 4 "compounding replay") builds on repo-local `.planning/` memory — retro *replay* into the next Epic's DISCUSS/PLAN, cross-Epic pattern detection over that repo's `RETROSPECTIVES.md`. Any "org learnings" feature is explicitly out of the Compound-phase core; if it ever lands, it's a separate optional analysis tool, not a change to where learnings are stored. The M5 opening re-audit (BR-8) inherits this as settled input rather than re-opening it.

**Rules out.** A shared per-org learning store as a default/primitive; blocking or scoping the Compound phase on standing up central infrastructure; leaving the per-repo-vs-per-org question implicit for the re-audit to re-litigate.

**Cross-references.** `analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` §3 (the open question, now resolved — updated in place); `MILESTONE-5.md` E2 (COMPOUND phase — "carry forward via `.planning/`" now has a definite answer); `.planning/BACKLOG-REVIEW-2026-07-04.md` Sprint 4 (compounding replay); `REPO-ANALYSIS.md` Part 6 (strategic decision points).

---

## 2026-07-15 — M4.5.E11 (Epic-native flow) DISCUSS decisions locked (D-E11-1 … D-E11-3)

**Context.** `/sig:discuss` on the committed "Epic-native flow" Epic (DECISIONS 2026-07-05). FULL / `gate_strictness: strict`: two product-altitude decisions gated individually via `AskUserQuestion`; migration posture decided at product altitude (plumbing). Root problem, restated: Signal has two unreconciled modes — **linear** (what the commands implement: one `calibrate→ship` pass, phase-named artifacts, no Epic concept) and **Epic** (what Signal-on-Signal runs by hand: Milestones→Epics, each Epic runs its own `discuss→ship`, `M4.5.EN-*.md` artifacts, `current_epic` hand-typed). This Epic makes Epic mode first-class. **Bootstrap irony captured as evidence:** this very DISCUSS did the STATE transition + Epic ID assignment *by hand* — that friction is the requirements input.

1. **D-E11-1 — Scope = tight core.** Build: Epics first-class (commands create/track Epics, assign IDs, auto-populate `current_epic`, write Epic-scoped `{EpicID}-*.md` artifacts) + **per-Epic calibration** (an Epic inside a FULL project can honestly be SKETCH; falls out of Epic-scoping). **Parked (not cut):** the FUTURE-IDEAS "Multi-feature project lifecycle" layer — `features[]` block in STATE, per-feature `.planning/features/{slug}/` subdirs + PROFILE overrides, feature-aware status/resume. *(User-gated: "Tight core" over Broad multi-feature and Minimal plumbing.)* **Why parked:** that entry's own "resolve by" is "first real attempt to add feature #2 to a Signal-built project" (BR-9 second-dogfood) — designing the multi-feature model on a sample of one is premature. Tight core still un-parks the entry's *reason*; the broad layer waits for evidence.

2. **D-E11-2 — Placement = M4.5.E11.** Next Epic in the still-open release-hardening milestone, built now, immediately after E10, **before M5 opens**. *(User-gated: "M4.5.E11" over "M5.E0 — v2 foundation" and "Defer ID to PLAN".)* **Why here, not M5:** M4.5 is still in flight (its ≥3-tester criterion is open); the 2026-07-05 decision says "sequenced immediately after E10"; placing it in M5 would either violate M5's gate (v1 + weeks of usage) or jump ahead of M5's **locked** opening move — the landscape re-audit (BR-8). On-theme: the resume-papercut fix + per-Epic calibration *are* stranger-adoption readiness. **Defer-ID rejected** (advisor-flagged): a provisional label re-introduces the exact resume papercut this Epic exists to kill.

3. **D-E11-3 — Migration posture = additive / opt-in (product-altitude call, not gated).** Epic mode is **new and additive**; **linear mode keeps working untouched** — one project = one `calibrate→ship` pass with phase-named `{phase}-*.md` artifacts still resolves. Forced by reality: Signal now lives in stranger repos where the STATE hook fires, and FR1 (E10 `resolveArtifactPath` Epic-prefix resolver) was built as the **forward-compatible read-half** so the write-half "slots on with zero rework" (DECISIONS 2026-07-05). No migration of existing linear-mode projects; no `schema_version` bump anticipated (confirm at PLAN).

**Open for PLAN (design/plumbing — decided there with sensible defaults):** (a) **Epic-creation UX** — how a user opens/switches an Epic (candidates: a dedicated `/sig:epic <name>` meta-command; a flag on `/sig:discuss`/`/sig:new-project`; or auto-detect-and-offer when a phase command runs with no active Epic). *Surfaced to Brett for optional input at the DISCUSS gate; else PLAN decides.* (b) `current_epic` auto-population — which command writes it, when. (c) Per-Epic calibration mechanics — where the Epic-level tier lives (Epic-scoped PROFILE override vs a field) and how it composes with the project PROFILE (override for that Epic's phases; project PROFILE is the default). (d) Linear-vs-Epic mode detection signal. (e) Artifact naming — adopt the established `{EpicID}-*.md` convention.

**What this rules out (so PLAN doesn't re-litigate):** the broad multi-feature layer (parked, evidence-gated); placement in M5 (before its locked re-audit); a linear-mode migration or any mode that breaks existing `{phase}-*.md` projects; proceeding under a provisional Epic ID.

**Cross-references.** `M4.5.E11-REQUIREMENTS.md` (FRs + scope + NFRs + assumptions + PLAN-open items); DECISIONS 2026-07-05 (the commitment + two-modes root cause); `FUTURE-IDEAS.md` "Multi-feature project lifecycle" (parked broad layer + its "resolve by"); `MILESTONE-5.md` § opening move / BR-8 (the locked re-audit placement must not jump); `tools/lib/resume.js` (FR1 read-half + `EPIC_ID_RE`); `STATE.md` frontmatter (transitioned to DISCUSS / M4.5.E11 on 2026-07-15).

---

## 2026-07-15 — M4.5.E11 PLAN research decisions (D-E11-4, D-E11-5)

**Context.** 4-agent PLAN research (`M4.5.E11-RESEARCH.md`) surfaced two product/positioning gray areas beyond the DISCUSS set; both gated to Brett via `AskUserQuestion` under the "align with standard developer practice" principle he set. Research also settled a pile of plumbing (design A/B/C: `--epic` flag on discuss/new-project; `{EpicID}-PROFILE.md` whole-file shadowing; non-null `current_epic` as the sole atomic mode signal) and reconciled a close-semantics conflict (roll-on-open, never clear — clear-at-SHIP would strand SPIKE Epics that skip SHIP; done-signal = `{EpicID}-RETROSPECTIVE.md` existence, since Signal's STATE never moves SHIP into `completed_phases`).

4. **D-E11-4 — Epic-ID shape = M-shaped only.** `current_epic` always holds a strict Epic ID (`/^M\d+(\.\d+)*\.E\d+$/`, e.g. `M4.5.E12`); version numbers (`v0.1.6`) become **separate release tags**, decoupled from `current_epic`. *(User-gated on developer-best-practices grounds: work-tracking and versioning are separate axes in every standard toolchain — epics = work, SemVer tags = releases; a release bundles work, it is not a work-item ID. Putting `v0.1.6` in `current_epic` was the conflation that created the regex schism.)* **Consequences:** the write-half validates the ID against the strict regex at write time and shares ONE canonical strict regex across `state.js`/`retrospective.js`/`milestones.js` (fixes the schism); lightweight patches ship the normal way — a small SKETCH-tier Epic released as `vX.Y.Z`, or just commits + a release tag with no Epic (not every release is an epic). **Shrinks S1** (no regex-widening). Rules out widening the strict regexes to make version-strings first-class Epic IDs.

5. **D-E11-5 — Retro-gate coupling = warn, not block.** When an Epic-mode project reaches Epic-close SHIP with no `{EpicID}-RETROSPECTIVE.md`, the STATE-write hook emits a **non-blocking warning** (exit 0), never a block (exit 2). *(User-gated on hook/CI-best-practice grounds: hooks block on deterministic failures — failing tests, malformed data — and nudge on process/doc steps like retros; hard-blocking a stranger's release on a process step is a recognized anti-pattern that invites `--no-verify` bypass.)* Consistent with the posture already shipped in v0.1.6 (D-v016-2: block malformed frontmatter, *flag* everything else) and with the M4.5 stranger-adoption thesis. Rules out a hard exit-2 block; rules out `off` (the retro nudge is kept, just non-blocking). **Note:** the E9 retro-gate path is dormant today (no command writes `current_epic`); E11 makes it reachable in stranger repos, so S1 must ensure that path *warns* and the hook is throw-safe (fail-open) on any malformed `current_epic`.

**Cross-references.** `M4.5.E11-RESEARCH.md` (§ headline regex schism, § design A/B/C, § risk register R1/R2/R3, § decisions for the PLAN gate); `M4.5.E11-PLAN.md` (slice map); DECISIONS 2026-07-13 D-v016-2 (the block-malformed/flag-rest hook posture this extends); `tools/lib/retrospective.js` (`deriveRetroPath` strict regex = the canonical shape) + `tools/lib/milestones.js` (`CURRENT_EPIC_RE`) + `tools/lib/resume.js` (`EPIC_ID_RE`, the permissive read-half regex).

---

## 2026-07-15 — M5 opens: usage-signal gate cleared + eviction Epic goes first (BR-8 override)

**Context.** M4.5's last open done-when clause and M5's "Blocked by … real users" gate both hinged on outward usage signal. Brett confirmed 2026-07-15 he has onboarded **4 non-Signal users** with positive reception and sufficient input to proceed. As the maintainer he is the **source of truth** on what "bulletproof AI coding harness" means for Signal; external feedback folds in as it arrives, and no adoption barrier is treated as blocking further build.

**Decision 1 — the usage-signal gate is cleared.** M4.5 done-when clause (d) ("≥3 non-Signal users have completed this path with feedback merged") is **met**; M4.5 formally closes. M5's "Blocked by: … v1 shipping to actual users for at least a few weeks" (`MILESTONE-5.md`) is **lifted**. M5 is open.

**Decision 2 — M5's first *built* Epic is the STATE/FUTURE-IDEAS eviction work (`M5.E1`), overriding BR-8's re-audit-first ordering.** BR-8 (2026-07-04) locked M5's opening move as the landscape re-audit. Brett chose 2026-07-15 to build the file-bloat (eviction) fix first instead. The re-audit is **not dropped** — it follows, and remains the gate for the *speculative* v2 feature ports (upstream phases, compound loop, framework ports), which stay sequenced behind it.

**Rationale.** The eviction work is felt-pain (the 455 KB CMMC-dogfood STATE.md; Signal's own file on the same curve), already well-specced (`FUTURE-IDEAS.md` "STATE.md append-without-evict", HIGH PRIORITY), and — crucially — **independent of the re-audit**: it moves closed narrative into structure that already exists (`.planning/archive/` SUMMARY + a sibling `STATE-HISTORY.md`), so it needs no traversal/index decision. It therefore does not need usage signal and does not wait on Sprint 2. The re-audit's dependency binds only the *speculative* ports.

**Scope guardrail (the line that keeps this Epic re-audit-independent).** `M5.E1` is the eviction **mechanics only** — NOT the Sprint-3 "memory & doc-runtime flagship" (wiki restructure, `/sig:migrate-memory`, `/sig:sweep`, doc-runtime index/graph). That larger flagship keeps its hard dependency on the re-audit (`BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 3 cross-cluster note) and is deferred. Eviction stays safe only while it targets **existing** structure; the moment DISCUSS reaches for a *new* index/graph/destination it has crossed into the flagship and must defer.

**Already shipped (do not rebuild).** v0.1.6 shipped the **write-time prevention** half — the STATE-write hook hard-blocks prose in `completed_phases`/`blockers` (`hooks/check-state-write.js` → `checkStateFrontmatterShape`) plus a read-time size banner in `/sig:resume` (`readStateSize`, 150 KB). `M5.E1` builds the **eviction / remediation** half: evict-on-close in `/sig:ship` + `/sig:checkpoint`, the migration-side legacy-body relocation (`upgradeStateFile` → `STATE-HISTORY.md` + pointer), the normative body skeleton in `references/state-schema.md`, tier-aware size budgets, and FUTURE-IDEAS eviction of shipped/promoted entries. Exact scope-in/scope-out is the DISCUSS agenda.

**Cross-references.** `MILESTONE-5.md` (§ opening move / BR-8 override + § doc-lifecycle capture); `MILESTONE-4.5.md` (done-when clause (d)); `FUTURE-IDEAS.md` "STATE.md append-without-evict — closed-work narrative must leave the live file" (HIGH PRIORITY spec); `BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 3 (the deferred flagship); `analysis/SIGNAL-INTEGRATION-RUNDOWN-v2-SEED.md` (the re-audit's seed, still queued); DECISIONS 2026-07-04 (BR-8 origin) + 2026-07-15 (per-repo compounding); `hooks/check-state-write.js` + `tools/lib/state.js` `upgradeStateFile` (the eviction seams).

---

## 2026-07-16 — M5.E1 go-big: doc-runtime flagship (D-M5E1-1 … D-M5E1-6)

**Context.** M5.E1's DISCUSS opened scoped to eviction mechanics only (DECISIONS 2026-07-15). During DISCUSS Brett chose to **go big** — solve doc bloat across *all* docs now rather than later — and raised the migrate-command and upgrade-recognition requirements. As source of truth on Signal's "bulletproof" bar, he owns this scope call. These six decisions upgrade M5.E1 from eviction-only to the full doc-runtime flagship (Sprint 3). Full spec: `M5.E1-REQUIREMENTS.md` (FR1–FR7 + NFRs + assumptions).

1. **D-M5E1-1 — M5.E1 is the full doc-runtime flagship, not eviction-only.** Supersedes the narrow scope in DECISIONS 2026-07-15. In-scope: canonical doc-model, STATE.md eviction, FUTURE-IDEAS eviction, all-docs hygiene runtime, the living BACKLOG.md lifecycle, the auto-sensing migrate command, and the doc-layout stamp/banner. *Rationale:* doc bloat across all docs is high-value and compounding; Brett prefers to solve it structurally now. *Risk read:* medium, concentrated entirely in the migrate command (mitigated by D-M5E1-4); the rest is standard FULL-tier work. Not off the charts.

2. **D-M5E1-2 — Fold the re-audit's traversal decision in; don't wait on the re-audit.** The flagship's only real dependency on the M5 landscape re-audit was "don't design the index/graph twice." M5.E1 makes that canonical doc-model decision itself (FR1), grounded in Curator's blueprint, and records it so the later re-audit **inherits** it. The re-audit still gates the *speculative* v2 feature ports (upstream phases, compound loop, framework ports) — it no longer gates the doc-runtime.

3. **D-M5E1-3 — Borrow Curator's design, take no dependency on it.** Consistent with DECISIONS 2026-07-13 (Signal external-Curator-free; native `/sig:index` successor). Curator's model (read-first INDEX, distilled SUMMARY cards, shallow archive tree, reference/link-health, deterministic-engine-plus-judgment-subagents) is the blueprint; the installed `auditor`/`distiller` agents + `curator` skill are **raw material to study**, reimplemented Signal-native. This Epic's SHIP retires the optional Curator step in `ship.md` §8 once the native hygiene runtime (FR4) lands.

4. **D-M5E1-4 — The migrate/re-org command is dry-run-first, safety-first, built last, and is NOT `/sig:doctor`.** Auto-senses old-layout projects; dry-run by default (changes nothing); git-backed + rollback + move-never-delete + dangling-link verify; explicit confirm to apply; idempotent. It's the one high-risk surface; these constraints are what make go-big acceptable. `/sig:doctor` stays **install-only** (Brett's boundary) — doc hygiene is a different axis. Command name/placement (likely `/sig:migrate-memory`) settled in PLAN.

5. **D-M5E1-5 — Doc-layout designation lives in STATE.md frontmatter; the auto-check rides SessionStart + resume/status, not doctor.** A `docs_layout_version` integer — **its own axis**, distinct from `schema_version` (frontmatter format) and the plugin SemVer (same decoupling lesson as D-E11-4). Set by the migrate command on completion. A fail-open SessionStart Node hook (+ `/sig:resume` + `/sig:status`) banners pre-reorg-on-post-reorg-plugin; post-reorg is silent. **Splits backlog A4:** install/version drift stays doctor-adjacent; doc-layout/reorg state moves to the session-start + resume/status family.

6. **D-M5E1-6 — M5.E1 runs at FULL tier (no per-Epic downgrade).** It edits the state-management core every installed repo depends on and ships an auto-rewrite command; painful to reverse if wrong. FULL rigor (TDD, strict Nyquist, full REVIEW) is warranted; the Epic inherits the project PROFILE rather than calibrating a lighter Epic-scoped one.

**Cross-references.** `M5.E1-REQUIREMENTS.md` (FR1–FR7 + NFRs + assumptions + proposed slices); DECISIONS 2026-07-15 (the superseded narrow scope) + 2026-07-13 (external-Curator-free + native `/sig:index`) + 2026-07-04 BR-8 (re-audit placement, now folded) + D-E11-4 (the version-axis-decoupling lesson reused in D-M5E1-5); `FUTURE-IDEAS.md` "STATE.md append-without-evict" / "Memory & Documentation Management as Signal-managed Runtime" (workstreams #3/#4) / "Map drift-guard" / `/sig:migrate-memory` archive-dogfood lessons; `BACKLOG-REVIEW-2026-07-04.md` §4 Sprint 3 (A1 watchlist, A4 upgrade-diagnostics split); `hooks/session-start.sh` + `hooks/hooks.json` (FR7 host); the installed `auditor`/`distiller` agents + `curator` skill (FR1 raw material).

---

## 2026-07-16 — M5.E1 shipped (model + eviction mechanics); doc-runtime release batched with E2/E3

**Decision:** M5.E1 (Doc-runtime & memory hygiene) shipped a **bounded first slice** of the go-big flagship — the doc-runtime *model* (FR1) + STATE.md/FUTURE-IDEAS *eviction mechanics* (FR2, FR3) + dogfood — deferring **FR4/FR5 → M5.E2** (all-docs hygiene runtime + living `BACKLOG.md`) and **FR6/FR7 → M5.E3** (auto-sensing migrate command + doc-layout stamp). It **lands on `main` intentionally unreleased**: the marketplace release is **batched with the doc-runtime continuation** (cut when M5.E2/E3 land). plugin.json stays `0.1.7`; the CHANGELOG entry is `[Unreleased]`.

**Rationale:** the eviction mechanics are shippable, but the *user-facing* completeness of the doc-runtime depends on the **migrate command (FR6/E3)** that existing bloated projects need to actually reorganize — and **FR2b `evictEpicNarrative` is fixture-proven but never live-fired** (it no-ops at M5.E1's own close). Releasing a partial doc-runtime would read as "eviction shipped but I can't migrate my existing docs." Batching ships it as a coherent unit. (Brett's call, this session.)

**Also decided (bookkeeping):** the built **`M5.E1` = Doc-runtime** takes the early `M5.E` IDs; the pre-override speculative v2-port queue in `MILESTONE-5.md` (`### M5.E1–E6`) is **superseded and unsequenced** — the re-audit (BR-8) assigns its real IDs. `MILESTONE-5.md` now carries an Epic-status table (E1 shipped, E2/E3 = doc-runtime continuation) as the source of truth over the candidate headings.

**Carry-forwards (see `M5.E1-VERIFICATION.md` Part E + `M5.E1-REVIEW.md`):** FR2b never-live-fired (REVIEW hardened its path — 4 Important fixed — before it goes live); relocating an *already-migrated* inlined body has no shipped mechanism (E3/FR6); S5's `dogfood-orientation.test.js` declined by design (verified-once historical event). Release-hygiene bug B7 (`plugin.json` stuck at 0.1.6 through v0.1.7) fixed en route.
