import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  applyRigorOverrides,
  attentionFor,
  ATTENTION_LEVELS,
} from '../plugin/tools/lib/profile.js';

const baseProfile = (overrides = {}) => ({
  tier: 'FULL',
  schema_version: 1,
  phases_skipped: [],
  rigor_overrides: {
    tdd_required: true,
    security_audit: 'full',
    performance_pass: true,
    simplification_pass: true,
    nyquist_enforcement: 'strict',
    plan_validation_dims: 'all',
    research_parallelism: 4,
    gate_strictness: 'strict',
    context_rot_reread: true,
    review_depth: 'full',
    ...overrides,
  },
});

describe('attention axis — the dial split out from gate_strictness', () => {
  it('exposes exactly three levels', () => {
    expect(ATTENTION_LEVELS).toEqual(['attended', 'checkpointed', 'unattended']);
  });

  // BACK-COMPAT IS THE WHOLE RISK. Every PROFILE.md on disk predates this field.
  // A profile with no `attention` must behave EXACTLY as it does today, which is
  // why attention is derived from gate_strictness rather than defaulted to a constant.
  describe('back-compat: absent attention derives from gate_strictness', () => {
    it.each([
      ['strict', 'attended'],
      ['light', 'checkpointed'],
      ['off', 'unattended'],
    ])('gate_strictness %s -> %s', (gate, expected) => {
      expect(attentionFor(baseProfile({ gate_strictness: gate }))).toBe(expected);
    });
  });

  it('an explicit attention wins over the derived one', () => {
    const p = baseProfile({ gate_strictness: 'strict', attention: 'unattended' });
    expect(attentionFor(p)).toBe('unattended');
  });

  // The point of the split: FULL rigor with low attention must be reachable.
  it('unattended does NOT lower rigor — anti_rationalization survives', () => {
    const merged = applyRigorOverrides(
      {},
      baseProfile({ gate_strictness: 'strict', attention: 'unattended' })
    );
    expect(merged.gates.anti_rationalization).toBe(true);
    expect(merged.workflow.auto_advance).toBe(true);
    expect(merged.gates.confirm_plan).toBe(false);
  });

  // The phase-end confirm gates, derived from the merged config rather than
  // hand-listed, so a future confirm_<phase> gate cannot slip past these tests.
  const PHASE_END = /^confirm_(discuss|plan|execute|verify|review)$/;
  const phaseEndGates = (gates) => Object.keys(gates).filter((k) => PHASE_END.test(k));

  it('attended keeps every confirm gate up', () => {
    const merged = applyRigorOverrides(
      {},
      baseProfile({ gate_strictness: 'strict', attention: 'attended' })
    );
    expect(merged.workflow.auto_advance).toBe(false);
    const gates = phaseEndGates(merged.gates);
    expect(gates).toHaveLength(5);
    for (const g of gates) expect(merged.gates[g], g).toBe(true);
    expect(merged.gates.confirm_ship).toBe(true);
    expect(merged.gates.confirm_in_phase).toBe(true);
  });

  // SIG-275. This test used to be titled "checkpointed confirms at phase
  // boundaries" — the defect, written as the contract. drive.md says checkpointed
  // "advances every phase", so every phase ending in "Accept ... and continue?"
  // meant /sig:drive asked MORE at checkpointed, not less. Only SHIP keeps its
  // confirm, and SHIP's real gate is the floor in FLOORS (drive.js), not this flag.
  it('checkpointed sets no phase-end confirm except SHIP, and nothing in-phase', () => {
    const merged = applyRigorOverrides(
      {},
      baseProfile({ gate_strictness: 'strict', attention: 'checkpointed' })
    );
    const gates = phaseEndGates(merged.gates);
    expect(gates).toHaveLength(5);
    for (const g of gates) expect(merged.gates[g], g).toBe(false);
    expect(merged.gates.confirm_ship).toBe(true);
    expect(merged.gates.confirm_in_phase).toBe(false);
    expect(merged.workflow.auto_advance).toBe(false);
  });

  it('unattended sets no confirm gate; SHIP is held by its floor, not by confirm_ship', () => {
    // Recorded as current behaviour, unchanged by SIG-275. ship.md's PR approval
    // box is unconditional and names no gate (attention-wiring.test.js).
    const merged = applyRigorOverrides(
      {},
      baseProfile({ gate_strictness: 'strict', attention: 'unattended' })
    );
    for (const g of phaseEndGates(merged.gates)) expect(merged.gates[g], g).toBe(false);
    expect(merged.gates.confirm_ship).toBe(false);
  });

  it('records the resolved attention on the merged config', () => {
    const merged = applyRigorOverrides({}, baseProfile({ attention: 'checkpointed' }));
    expect(merged.workflow.attention).toBe('checkpointed');
  });

  // B59: an out-of-enum value made readEffectiveProfile throw and a whole DISCUSS
  // ran at the wrong tier. An optional field must not be able to do that by ABSENCE.
  // Renamed 2026-09-08: Signal's own PROFILE.md now SETS `attention: checkpointed`,
  // so this no longer exercises absence — the `back-compat` block above does that
  // with fixtures. What it still checks is that the shipped profile loads and
  // resolves to a real level, which is the half that mattered for `B59`.
  it('the shipped PROFILE.md parses and resolves to a real attention level', async () => {
    const { readProfile } = await import('../plugin/tools/lib/profile.js');
    const p = await readProfile(process.cwd());
    expect(p.tier).toBeTruthy();
    expect(ATTENTION_LEVELS).toContain(attentionFor(p));
  });
});
