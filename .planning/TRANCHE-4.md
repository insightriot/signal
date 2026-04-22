# Tranche 4 — Rundown v2 Integrations

**Goal:** Expand Signal from 6-phase v1 to the 10-phase architecture from `analysis/SIGNAL-INTEGRATION-RUNDOWN.md`.

**Estimated effort:** Multi-week. Attempt one sub-tranche at a time, ship, observe, iterate.

**Blocked by:** Tranche 3 complete + v1 shipping to actual users for at least a few weeks. Without usage signal, v2 additions are speculative.

**Note:** This file is directional, not prescriptive. Expect significant rewrite once v1 usage data rolls in and priorities clarify. Sub-tranches may be re-ordered based on user pain points, not the order listed here.

---

## Sub-tranches (one at a time, in no particular order until feedback shapes it)

### 4a. Upstream phases — IDEATE / VALIDATE / STRATEGIZE

From pm-skills + gstack + oh-my-claudecode.
- [ ] Port `/discover` workflow from pm-skills → split into `/sig:ideate` + `/sig:validate`
- [ ] Port `/strategy` workflow from pm-skills → `/sig:strategize`
- [ ] Port assumption-mapping (Impact × Risk) and Opportunity Solution Trees from pm-skills
- [ ] Port `/office-hours` reframing from gstack → integrate into `/sig:ideate`
- [ ] Port `deep-interview` with 20% ambiguity gate from oh-my-claudecode → integrate into `/sig:spec` (possibly renamed from `/sig:discuss`)
- [ ] Update tier-gating: these phases skip entirely in SKETCH, may skip in FEATURE

### 4b. COMPOUND phase (memory layer)

From compound-engineering + gstack.
- [ ] Port `/sig:compound` from compound-engineering's Compound phase
- [ ] Port `learnings-researcher` + `session-historian` agents
- [ ] Port `/retro` + `/learn` from gstack (weekly reflection + JSONL learning log)
- [ ] Integrate with `.planning/` so learnings carry forward between projects

### 4c. Security upgrade

- [ ] Replace Agent Skills' `security-and-hardening` skill with gstack's 15-phase `/cso` audit
- [ ] Verify full license attribution in `LICENSES.md`
- [ ] Update `/sig:review` to reference the new skill

### 4d. TDD & gate upgrades

From superpowers.
- [ ] Replace Agent Skills' TDD with superpowers' harder version (deletes pre-test code)
- [ ] Port `<HARD-GATE>` tag mechanism as an enforcement module that actually blocks progression
- [ ] Port `systematic-debugging` 4-phase skill
- [ ] Adopt superpowers' anti-rationalization table format across all existing phase gates

### 4e. Context discipline hooks

From planning-with-files.
- [ ] Graft the 2-Action Rule into the executor agent
- [ ] Add hook-driven `PROFILE.md` re-read on `PostToolUse` to prevent drift
- [ ] Implement findings-quarantine pattern for untrusted external data (web fetch, API responses)

### 4f. Multi-runtime adapters

- [ ] Cursor adapter layer
- [ ] Codex adapter layer
- [ ] Study superpowers' cross-platform session-start hook as reference

---

## Exit Criteria

When the 10-phase architecture from `SIGNAL-INTEGRATION-RUNDOWN.md` is functional end-to-end on real projects.

## Notes

- **v2 must not break v1 for existing users.** Every change feature-flagged or opt-in until proven.
- **Attribution discipline:** each port adds the source repo's full license text to `LICENSES.md` per the "Planned Integrations (v2)" section. Move entries from "Planned" to "Ported" tier when work lands.
- **Re-evaluate priority.** Don't assume sub-tranches ship in 4a→4f order. Order should follow real user pain points from v1 usage.
