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
