# Architectural Decisions Log

Append-only. When a decision is reversed, *add* a new entry noting the reversal with the reason — don't edit the old one. This is history, not state.

---

## 2026-04-22 — v1 = 6-phase MVP, v2 = 10-phase architecture

**Decision:** v1 ships the 6-phase MVP currently speced in `PROJECT.md` (`calibrate → discuss → plan → execute → verify → review → ship` + `escalate`). v2 expands to the 10-phase architecture from `analysis/SIGNAL-INTEGRATION-RUNDOWN.md` (adds ideate / validate / strategize upstream + compound downstream).

**Rationale:** The rundown explicitly flagged this as an open question. Shipping v1 narrow, learning from real use, then expanding is lower-risk than trying to build 10 phases with 9 source-repo ports in one push.

**Implication:** Tranche 4 (v2 integrations) is gated on Tranche 3 completing AND v1 having real users.

---

## 2026-04-22 — Attribution restructured into four tiers

**Decision:** All 9 source repos are attributed across `PROJECT.md`, `CLAUDE.md`, `LICENSES.md`, and the plugin manifests. Tiers: **Ported (v1)** = GSD, Agent Skills. **Planned (v2)** = gstack, pm-skills, superpowers, compound-engineering. **Pattern source** = planning-with-files, oh-my-claudecode. **Reference** = GSD Skill Creator.

**Rationale:** Original framing ("two frameworks") understated intellectual debt and would have caused attribution gaps as v2 ports land.

**Implication:** Full MIT (or other) license texts for v2-planned repos are added to `LICENSES.md` *when code is actually ported*, not speculatively — but the "Planned Integrations" section exists now so intent is public.

---

## 2026-04-22 — Build Signal with lightweight `.planning/`, not GSD

**Decision:** Manage Signal's own build with a hand-rolled `.planning/` directory (STATE, TRANCHE-{n}, DECISIONS, OPEN-QUESTIONS, CONTEXT). Do not install GSD for this.

**Rationale:** GSD would be overkill for a markdown-heavy build, create meta-confusion (whose `.planning/` is canonical?), and impose the exact over-engineering Signal is designed to prevent. Lightweight structure captures 90% of GSD's disciplines (planning, state, decisions log, atomic commits) at ~5% of the overhead.

**Implication:** Once `/sig:calibrate`, `/sig:discuss`, `/sig:plan` work (late Tranche 2 / early Tranche 3), switch to dogfooding Signal on itself — that's where real validation happens.

---

## 2026-04-22 — Rebrand deferred to Tranche 1

**Decision:** Manifest `name` fields still say `skills-gsd`. Rename to `signal` happens in Tranche 1 alongside scope-lock and PROFILE.md-schema work, not as part of attribution cleanup.

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
- `/sig:calibrate` (Tranche 2) writes this schema literally.
- Every downstream command reads it via a `readProfile()` helper (to be written in Tranche 2).
- Schema version = 1. Bumps on any breaking change. Readers should fail closed on unknown versions.

---

## 2026-04-22 — `.planning/` is always tracked in git, never ignored

**Decision:** `.planning/` is committed to version control in this repo, and Signal must ensure it is also committed in any user project where Signal is used. `.planning/` was previously in this repo's `.gitignore`; that line has been removed.

**Rationale:** `.planning/` is the project's institutional memory — state, decisions log, context, open questions, plans, verification reports. If a collaborator clones a repo without `.planning/`, they lose all accumulated project knowledge. That defeats the entire purpose of the file-based state convention. The instinct that "state directories should be ignored" does not apply here — `.planning/` is deliverable documentation that keeps a project coherent across contributors, sessions, and time.

**Implication:**
- Signal's `/sig:new-project` (and any command that writes to `.planning/`) must check the user's `.gitignore` and warn or auto-correct if `.planning/` is being ignored. Added as a task in `TRANCHE-2.md`.
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
- Tranche 2 Step 3's preamble pass also retrofits any non-conforming question patterns in the 6 phase commands.
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
- v1: PLAN gains 2 skills (3 total), EXECUTE gains 2 skills (5 total), SHIP gains 1 skill (5 total). Token-cost impact will be measured in Tranche 2 Step 7.
- v2: PREPARE phase is logged as a candidate in `FUTURE-IDEAS.md` with three trigger conditions for promotion (token-budget signal, user-language signal, skill-binding signal).
- The orphan-skill OPEN-QUESTIONS entry is resolved and removed.

---

## 2026-04-26 — Dogfood approach: worktree + cherry-pick for Signal-on-Signal builds

**Decision:** When using Signal to build Signal itself (the dogfood pattern committed for Tranche 3 Task 1), follow this process:

1. Create a git worktree (`EnterWorktree` or `git worktree add`) from main HEAD on a fresh branch.
2. In the worktree, rename hand-rolled colliding files: `.planning/CONTEXT.md` → `.planning/BUILD-CONTEXT.md` and `.planning/STATE.md` → `.planning/BUILD-STATE.md`. Commit the rename as a worktree-only setup commit.
3. Run the Signal flow (`/sig:calibrate` → `/sig:discuss` → `/sig:plan` → `/sig:execute` → `/sig:verify` → `/sig:review` → `/sig:ship`) inside the worktree. The Signal-managed `PROFILE.md`, `CONTEXT.md`, `REQUIREMENTS.md`, `1-PLAN.md`, `1-RESEARCH.md`, `1-VALIDATION.md`, `1-PROGRESS.md`, `1-VERIFICATION.md`, `1-REVIEW.md`, and `1-SHIP.md` (a useful improvisation) write into `.planning/` cleanly.
4. After SHIP, cherry-pick or `git checkout` the **substantive files only** back to main (the new command file, helpers, tests, validator update, and PROJECT.md changes — not the `.planning/` dogfood artifacts).
5. Capture friction findings in main's `OPEN-QUESTIONS.md` and `DECISIONS.md`.
6. Keep the worktree branch around as a record (Action: `keep`, not `remove`).

**Rationale:** The Signal-build's hand-rolled `.planning/` (with its tranche-based meta-state) and Signal-managed `.planning/` (PROFILE / CONTEXT / STATE / `{phase}-*.md`) want the same filenames for some artifacts. A worktree isolates them so the dogfood is a true picture of Signal's behavior on a "real" project rather than a collision-noise mess.

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

## 2026-04-26 — T3 Task 5 triage: workflow refinements from dogfood evidence

**Decision:** Five small workflow refinements applied to command markdown + references, all driven by FULL-tier and SKETCH-tier dogfood findings. None changes the 6-phase flow or the PROFILE.md schema; each codifies what the dogfood actually did or surfaces a subtle precedence rule that wasn't explicit before.

**The five refinements:**

1. **REVIEW gains a `PASS-WITH-FIXES` verdict** (in addition to PASS / FAIL). For Important issues whose total fix is < 50 LOC and tests stay green, the fix lands in REVIEW itself rather than ceremonially looping back to EXECUTE. FAIL is reserved for Critical issues, > 50 LOC fixes, or fixes that need re-planning. **Source:** T3 Task 2 dogfood — the URL shortener's REVIEW found 2 small Important issues (Content-Length pre-check, unhandled-error logging) that were silly to wrap in a full EXECUTE phase.

2. **Strict Nyquist accepts two evidence forms** (either is sufficient): per-test red→green git evidence, OR explicit attestation in `{phase}-VERIFICATION.md` that the test was written before the implementation. The atomic-commit-per-slice pattern from EXECUTE naturally supports the attestation form. **Source:** T3 Task 2 dogfood — TDD discipline was real but not preserved as per-test red→green commits.

3. **PLAN gains an Environment-check tail step (Step 6).** Confirms the dev runtime matches research's assumed runtime *before* EXECUTE rather than at first `npm install`. Cheap; surfaces drift at the right phase boundary. **Source:** T3 Task 2 dogfood — research assumed `better-sqlite3@11`/Node 22; dev machine on Node 25 needed `@12+`.

4. **DISCUSS gains a tier-aware NFR prompt** before generating REQUIREMENTS.md. FULL prompts for healthcheck / graceful shutdown / structured logging / security headers / rate limiting; FEATURE prompts a lighter set; SPIKE/SKETCH skip. Catches operational hygiene that less-experienced users would miss. **Source:** T3 Task 2 dogfood — F6 (`/healthz`), N1d, N3a/b/c added because Claude is experienced; a real user might not surface them.

5. **SKETCH 8-artifact floor codified** in `references/tier-definitions.md`. SKETCH still produces 8 `.planning/` files; that's deliberate (the project's memory is load-bearing even at the lowest tier), not a defect. No TRIVIAL tier in v1. **Source:** T3 Task 3 dogfood — the CSV-to-JSON one-shot demonstrated the floor; recommendation is to accept it (the contrast vs FEATURE/FULL is already 10–24x, pushing lower trades documentation value for marginal savings).

**Plus three minor clarifications** (not architectural — listed for completeness):
- `review.md` precedence note: `review_depth` is the master switch over `security_audit` / `performance_pass` / `simplification_pass`.
- `calibrate.md` rigor table footnote: `research_parallelism: 4` (FULL) is calibrated for novel domains; for known domains, downward-overriding to 2 saves ~30K tokens with no quality loss.
- `execute.md`: `1-PROGRESS.md` is implicit-optional for single-task plans.

**Plus implementation-level fixes** (`tools/lib/state.js`):
- `initState` default phase changed from `DISCUSS` to `CALIBRATE` (matches `/sig:new-project`'s expected sequence) and now accepts an explicit `initialPhase` parameter.
- `transitionPhase` dedupes `completedPhases` by phase name (recovery scenarios were producing duplicates).
- Test count: 93 → 96.

**Rationale.** Triage criterion: each fix had to be small, doc-or-config-only, and traced to a concrete dogfood observation. Larger architectural changes (slash-command testing harness, TRIVIAL tier, domain-novelty-aware research_parallelism) are deferred — they're worth doing only with more user signal than two dogfood passes provide.

**Implication.** OPEN-QUESTIONS.md goes from 20 active items to 2: tier-count validation (waits for real-user data) and slash-command testing harness (TRANCHE-4 candidate). Tranche 3 is now exit-criteria-clean for v1 ship-readiness.

---

## 2026-04-26 — Roadmap reorder: brownfield onboarding promoted to TRANCHE-4

**Decision:** `/sig:init` (brownfield onboarding for existing codebases that aren't yet using Signal) becomes TRANCHE-4. The previous TRANCHE-4 (v2 ports per `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`) moves to TRANCHE-5. The file `TRANCHE-4.md` is now the `/sig:init` plan; the prior content was renamed via `git mv` to `TRANCHE-5.md`, with sub-tranches renumbered `4a-f` → `5a-f` and the blocking criterion updated.

**Rationale.** Three user journeys exist for Signal: greenfield (`/sig:new-project`), existing-Signal-project (`/sig:status` + `/sig:resume`), and brownfield (existing codebase, no Signal yet). The first two have clean v1 entry points; the third does not — the current path is `/sig:new-project` + `/sig:calibrate` Scenario A + `/sig:discuss --assumptions`, which is friction-rich and easy to skip steps.

Brownfield is almost certainly the most common real-world adoption path. Greenfield Signal projects are rare; most users have existing code they want to bring discipline to. Without a dedicated entry point, the first thing prospective users see when adopting Signal is a friction-rich path that requires reverse-engineering Signal's mental model — which kills adoption.

This is a **v1-completing feature, not a v2-expanding one.** v2 ports add new capabilities; brownfield-onboarding is closing a hole in v1's user-facing surface area. Treating it as TRANCHE-4 (rather than buried in `FUTURE-IDEAS.md` as a v1.5 candidate) reflects that priority.

**Implication:**
- v0.1.0 ships v1 narrow as planned (current Tranches 1–3).
- TRANCHE-4 begins next, on a fresh context per the session-flow plan.
- TRANCHE-5 (the previous TRANCHE-4) remains gated on real-user signal and now also waits on TRANCHE-4 completion. The v2-ports scope itself is unchanged; only its position in the queue moved.
- No license / attribution changes — `/sig:init` is Signal's own design, not a port.

**Implementing session should:** read the new `TRANCHE-4.md` (which is detailed enough to pick up cold), and follow the "How to start a session for TRANCHE-4" appendix at the bottom of that file.

---

## 2026-04-26 — `/sig:init` scanner count fixed at 4 (no tier-aware reduction)

**Decision:** `/sig:init` always spawns all 4 scanner agents (stack / structure / activity / quality) in parallel. The TRANCHE-4 spec mentioned a possible tier-aware reduction (SKETCH = 2 scanners), but Wave 2 implementation locked the count at 4.

**Rationale.** Two reasons made the tier-aware path moot:

1. **Calibration happens *after* the scan.** `/sig:init` writes LANDSCAPE.md before PROFILE.md exists. There's no tier to gate on — the scan must complete before tiering becomes possible. The only way to make scanner count tier-aware would be to *guess* a tier from the scan itself (TRANCHE-4 design decision #5, "codebase-novelty signal feeding calibration"), and that guess only matters in retrospect — by the time a guess could fire, the scan is already done.
2. **Brownfield projects rarely calibrate to SKETCH.** SKETCH is for throwaway / hours-horizon work. A codebase old enough to brownfield-init has reversibility and horizon characteristics that almost always push it to FEATURE or higher. Optimizing scanner count for the rare SKETCH brownfield case would be premature optimization.

The token cost of 4 vs 2 scanners is real but bounded — each scanner output caps near 200-300 lines of structured markdown. Total scan-to-LANDSCAPE budget is comfortable within the ~12K-token EXECUTE-phase ceiling Signal already operates within.

**Implication:**
- TRANCHE-4 design decision #1 ("scanner agents vs in-command logic") is also resolved by this lock — the decision was framed as a SKETCH-optimization tradeoff (embedded logic is cheaper than agent fan-out at SKETCH); since SKETCH brownfield is rare, the agent-fan-out cost is the right default.
- Future profiling may surface a real cost issue at FULL on huge monorepos. If so, the right response is *parallelism throttling within the scanners* (e.g., "stack scanner samples 1000 files instead of all"), not reducing scanner count.

---
