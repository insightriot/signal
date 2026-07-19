# Architectural Decisions Log

Append-only. When a decision is reversed, *add* a new entry noting the reversal — don't edit the old one. This is history, not state.

---

## 2026-01-10 — Alpha bootstrapping decision

**Decision:** Establish the alpha baseline (D-A-1) as the first load-bearing choice of the project.

**Rationale:** Something has to be first, and the alpha baseline pins the conventions every later decision inherits — directory shape, naming, and the append-only log discipline itself.

**Implication:** All subsequent milestone-one work layers on top of this baseline; reversing it would invalidate the early scaffolding wholesale.

---

## 2026-01-20 — Beta layering decision

**Decision:** Layer beta on alpha (D-A-2). See [the M1 plan](archive/M1/M1.E1-PLAN.md) for the full sequencing.

**Rationale:** Beta needs alpha's baseline in place before it can extend it, so the two decisions are strictly ordered within milestone one.

**Implication:** The beta layer is the last milestone-one decision; after it, milestone two opens with a clean slate.

---

## 2026-02-05 — Gamma cross-cut decision

**Decision:** Cross-cut gamma across the stack (D-B-1, D-B-2), touching both the alpha baseline and the beta layer.

**Rationale:** Gamma is a milestone-two concern that spans everything below it; it earns two anchors because it records two distinct sub-choices made the same day.

**Implication:** Touches everything — any later change to alpha or beta must re-check gamma's assumptions.

---

## Undatable rolling note

**Decision:** This heading has no ISO date, so it must never evict — an undatable section always stays in the live log regardless of the boundary.

---

## 2026-03-05 — Delta current-milestone decision

**Decision:** Delta is current-milestone work (D-C-1); it stays live because its date is on/after the eviction boundary.
