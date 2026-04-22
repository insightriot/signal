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

### 2. Declare all plugin parts in the manifest

Currently `plugin.json` only declares `commands`. Claude Code needs to know about the rest (or confirm it auto-discovers them).
- [ ] Check: does Claude Code auto-load `agents/`, `skills/`, `hooks/`, `references/` from plugin root? (See `OPEN-QUESTIONS.md`.)
- [ ] If auto-discovery: confirm working with `node tools/validate-plugin.js`.
- [ ] If explicit paths needed: add them to `plugin.json`.

### 3. Install dependencies & get tests green

- [ ] `npm install`
- [ ] `npm test` — verify the 2 existing test files pass (`state.test.js`, `context-monitor.test.js`)
- [ ] `node tools/validate-plugin.js` — verify validator still passes
- [ ] Fix anything broken before moving on.

### 4. Formalize v1 vs v2 scope in PROJECT.md

Vision paragraph now references v1/v2 (from the attribution cleanup), but there's no explicit "Scope & Roadmap" section. Tighten this so it's unambiguous.
- [ ] Add a short "Scope & Roadmap" section near the top of `PROJECT.md` explicitly stating: v1 scope, v2 scope, gating criteria (when does v2 work start).
- [ ] Remove or tighten the existing "Note on broader scope" at the bottom of the Workflow section — it now reads as redundant.
- [ ] Update `CLAUDE.md`'s "Forward-looking scope note" to reference the new section.

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
