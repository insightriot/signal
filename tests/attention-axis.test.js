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

  it('attended keeps every confirm gate up', () => {
    const merged = applyRigorOverrides(
      {},
      baseProfile({ gate_strictness: 'strict', attention: 'attended' })
    );
    expect(merged.workflow.auto_advance).toBe(false);
    expect(merged.gates.confirm_plan).toBe(true);
    expect(merged.gates.confirm_ship).toBe(true);
  });

  it('checkpointed confirms at phase boundaries but not in-phase', () => {
    const merged = applyRigorOverrides(
      {},
      baseProfile({ gate_strictness: 'strict', attention: 'checkpointed' })
    );
    expect(merged.gates.confirm_ship).toBe(true);
    expect(merged.gates.confirm_in_phase).toBe(false);
  });

  it('records the resolved attention on the merged config', () => {
    const merged = applyRigorOverrides({}, baseProfile({ attention: 'checkpointed' }));
    expect(merged.workflow.attention).toBe('checkpointed');
  });

  // B59: an out-of-enum value made readEffectiveProfile throw and a whole DISCUSS
  // ran at the wrong tier. An optional field must not be able to do that by ABSENCE.
  it('every shipped PROFILE.md still parses with no attention field', async () => {
    const { readProfile } = await import('../plugin/tools/lib/profile.js');
    const p = await readProfile(process.cwd());
    expect(p.tier).toBeTruthy();
    expect(ATTENTION_LEVELS).toContain(attentionFor(p));
  });
});
