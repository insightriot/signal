# Tranche 1 — Unblock the Build

**Goal:** Get the repo to a consistent starting state so new work doesn't fight old scaffolding.

**Estimated effort:** 1–2 days focused.

**Done when:** `/sig:calibrate` can be built against a coherent foundation — no name mismatches, no missing contracts, no un-run tests.

---

## Tasks

### 1. Rebrand manifests from `skills-gsd` → `signal` ✅

- [x] `.claude-plugin/plugin.json` — `name` field
- [x] `.claude-plugin/marketplace.json` — `name` field + `plugins[0].name` field
- [x] `package.json` — `name` field
- [x] `tests/state.test.js` — temp-dir prefix `'skills-gsd-test-'` → `'signal-test-'`
- [ ] Repo URLs (`InsightRiot/dev-skills-gsd`) — **deferred, pending Brett decision** on whether to rename the GitHub repo. See OPEN-QUESTIONS.md. Changing URLs before the GitHub repo is renamed would break installs/clones.
- [x] Grep confirmed: no remaining `skills-gsd` or `dev-skills-gsd` references outside repo URLs and `package-lock.json` (which regenerates on `npm install`).

### 2. Declare all plugin parts in the manifest ✅ (no-op)

**Resolved via claude-code-guide research (2026-04-22):** Claude Code auto-discovers `agents/`, `skills/` (with nested subdirectories and on-demand loading), and `hooks/hooks.json` from plugin root. No manifest changes needed. `references/` is not a framework convention — it's just files the commands read directly.

Source: https://code.claude.com/docs/en/plugins.md and https://code.claude.com/docs/en/plugins-reference.md

- [x] Confirmed auto-discovery for agents, skills, hooks
- [x] Confirmed `references/` is ad-hoc (commands read by path)
- [x] `plugin.json` needs only `name`, `description`, `version` + optional metadata — all present

### 3. Install dependencies & get tests green ✅

- [x] `npm install` — 135 packages added, 0 vulnerabilities, `package-lock.json` regenerated with `"name": "signal"`.
- [x] `npm test` — 19 tests passed (state.test.js: 11, context-monitor.test.js: 8).
- [x] `node tools/validate-plugin.js` — passed.

### 4. Formalize v1 vs v2 scope in PROJECT.md ✅

- [x] Added "Scope & Roadmap" section between Vision and Problem Statement in `PROJECT.md`. Explicit v1 scope (6-phase), v2 scope (10-phase), and two gating criteria: v1 must ship end-to-end AND have real users.
- [x] Collapsed the redundant "Note on broader scope" at the bottom of the Workflow section to a pointer.
- [x] Updated `CLAUDE.md`'s "Forward-looking scope note" to point at the new PROJECT.md section.

### 5. Define the `PROFILE.md` schema

Every downstream command reads this. Nothing in Tranche 2 can start until it's specified.
- [ ] Create `references/profile-schema.md` — YAML schema for PROFILE.md:
  - Tier enum: `SKETCH | FEATURE | SPIKE | FULL`
  - `phases_enabled` / `phases_skipped` (array of phase names)
  - `rigor_overrides` (map with typed keys: `tdd_required`, `security_audit`, `nyquist_tests`, `review_depth`, others TBD — see OPEN-QUESTIONS.md)
  - Metadata: `created_at`, `calibrated_by`, `escalation_history` (for `/sig:escalate`)
- [ ] Create `references/tier-definitions.md` — what each tier means, what it skips, what rigor defaults apply, and the Stakes × Novelty 2×2 mapping logic.
- [ ] Write at least 2 example PROFILE.md files — one SKETCH, one FULL — to sanity-check the schema before committing.

### 6. Commit the pre-Tranche + Tranche 1 work

- [ ] Logical atomic commits (not one monster):
  - Attribution cleanup (done — needs commit)
  - `.planning/` scaffold (done — needs commit)
  - Manifest rebrand
  - Dependencies installed
  - Scope formalization
  - PROFILE.md schema + tier definitions
- [ ] Each commit message explains the "why," not just the "what."

---

## Exit Criteria

- [ ] All manifest files say `signal`, not `skills-gsd`.
- [ ] `npm install` clean, `npm test` passes, validator passes.
- [ ] `PROJECT.md` has an unambiguous "Scope & Roadmap" section.
- [ ] `references/profile-schema.md` + `references/tier-definitions.md` exist, are internally consistent, and validated against example PROFILE.md files.
- [ ] All commits pushed.

## What this unlocks

Tranche 2 can build `/sig:calibrate` against a real PROFILE.md schema. Rebranding no longer a distraction. Test infra is live so future work has a feedback loop.
