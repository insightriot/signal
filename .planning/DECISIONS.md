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

**Reference:** Full run log in `docs/install-verification.md` § R1. PLAN source: `.planning/M4.5.E1-PLAN.md` Slice 2. Updated S2 status in `.planning/M4.5.E1-PROGRESS.md`.

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

**Reference:** Acceptance criteria in `.planning/M4.5.E7-REQUIREMENTS.md` (written during this DISCUSS). MILESTONE-4.5 § E7 retains the human-readable scope statement.

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

**Reference:** Acceptance criteria in `.planning/M4.5.E3-REQUIREMENTS.md` (written during this DISCUSS). MILESTONE-4.5 § E3 retains the human-readable scope statement.

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

**Reference:** Full functional requirements + acceptance criteria + open questions in `.planning/M4.5.E8-REQUIREMENTS.md` (written during this DISCUSS). MILESTONE-4.5 § E8 retains the human-readable scope statement.

---
