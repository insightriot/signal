# Tranche 3 — Ready for Real-Project Testing

**Goal:** Prove Signal actually holds up end-to-end.

**Estimated effort:** 3–4 days focused.

**Done when:** Signal can be handed to another developer with a README and work without the author present.

**Blocked by:** Tranche 2 complete.

**Note:** Task list will shift based on what Tranche 2 self-testing surfaces.

---

## Tasks

### 1. Dogfood — build a small feature in Signal's own repo *using* Signal

Pick something real and small. Candidates (see `OPEN-QUESTIONS.md`):
- Add a `/sig:help` command
- Add a `/sig:status` command that summarizes `.planning/` state
- Write a missing reference checklist
- Implement the `readProfile()` helper if deferred from Tranche 2

Process:
- [ ] Choose the target feature (lock it in `DECISIONS.md`)
- [ ] Transition `.planning/` from hand-rolled to Signal-managed (or run both side-by-side for the first pass)
- [ ] Run `/sig:calibrate` (choose FULL) → full 6-phase flow
- [ ] Take notes on every friction point — these go in OPEN-QUESTIONS.md and drive improvements

### 2. FULL-tier pass on a throwaway sample project

- [ ] Pick something small but real (e.g., "build a URL shortener in Node" or "static-site generator from Markdown files")
- [ ] Run complete flow from `/sig:new-project` through `/sig:ship`
- [ ] Verify every phase fired, every skill loaded, every gate gated
- [ ] Record timing and token usage per phase

### 3. SKETCH-tier pass — the critical validation

If calibration doesn't visibly skip phases and drop rigor in SKETCH mode, the whole value prop is broken. This is the single most important test in the build.
- [ ] Pick a throwaway (e.g., "static marketing homepage" or "one-shot script")
- [ ] Run `/sig:calibrate`, answer to produce SKETCH tier
- [ ] Verify: VERIFY and REVIEW phases skipped
- [ ] Verify: TDD off in EXECUTE
- [ ] Verify: no security audit, no nyquist mapping
- [ ] Verify: the output still ships and works — lower rigor ≠ broken output

### 4. Write README quickstart

Claim: installable in under 5 minutes.
- [ ] Install instructions (plugin registration, `npm install`, environment checks)
- [ ] First-project walkthrough (`/sig:new-project` → `/sig:calibrate` → brief explainer of each phase, with expected outputs)
- [ ] Command reference (one paragraph per command)
- [ ] Credits & Heritage section (the 9 source repos with links and roles — Tier-style like LICENSES.md)
- [ ] Time a cold install from the README on a fresh machine and verify <5 min

### 5. Triage Tranche 2 outstanding issues

- [ ] Review OPEN-QUESTIONS.md and session notes from Tranche 2
- [ ] Categorize each: fix now / fix in Tranche 4 / accept-and-document
- [ ] Resolve the "fix now" ones

---

## Exit Criteria

- [ ] Dogfood feature shipped via Signal's own commands (not hand-rolled)
- [ ] FULL-tier pass succeeded end-to-end on a throwaway project
- [ ] SKETCH-tier pass succeeded *and* visibly lower-rigor — with measurable difference from the FULL pass
- [ ] README gets a new user from zero to running in <5 min
- [ ] Validator, tests, and all CI checks pass

## What this unlocks

v1 is shippable. Can hand to external testers. Tranche 4 (v2 ports from the rundown) becomes legitimate to start — but only after v1 has real users for a few weeks, since v2 decisions should be shaped by real usage signal.
