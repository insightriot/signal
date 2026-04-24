import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  readProfile,
  isPhaseEnabled,
  applyRigorOverrides,
  ProfileSchemaError,
} from '../tools/lib/profile.js';
import { PHASES } from '../tools/lib/state.js';

const FULL_PROFILE = `---
tier: FULL
schema_version: 1

calibration:
  scope: subsystem
  stakes: catastrophic
  novelty: rare
  reversibility: painful
  horizon: years

phases_skipped: []

rigor_overrides:
  tdd_required: true
  security_audit: full
  performance_pass: true
  simplification_pass: true
  nyquist_enforcement: strict
  plan_validation_dims: all
  research_parallelism: 4
  gate_strictness: strict
  context_rot_reread: true
  review_depth: full

metadata:
  created_at: 2026-04-22T14:23:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary

Auth subsystem rebuild.
`;

const SKETCH_PROFILE = `---
tier: SKETCH
schema_version: 1

calibration:
  scope: throwaway
  stakes: none
  novelty: familiar
  reversibility: trivial
  horizon: hours

phases_skipped:
  - REVIEW

rigor_overrides:
  tdd_required: false
  security_audit: none
  performance_pass: false
  simplification_pass: false
  nyquist_enforcement: off
  plan_validation_dims: none
  research_parallelism: 0
  gate_strictness: off
  context_rot_reread: false
  review_depth: none

metadata:
  created_at: 2026-04-22T14:30:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary

One-shot static page.
`;

const SPIKE_PROFILE = `---
tier: SPIKE
schema_version: 1

calibration:
  scope: feature
  stakes: minor
  novelty: first-for-org
  reversibility: moderate
  horizon: days

phases_skipped:
  - REVIEW
  - SHIP

rigor_overrides:
  tdd_required: false
  security_audit: none
  performance_pass: false
  simplification_pass: false
  nyquist_enforcement: off
  plan_validation_dims: none
  research_parallelism: 2
  gate_strictness: light
  context_rot_reread: false
  review_depth: none

metadata:
  created_at: 2026-04-22T15:00:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary

Library shootout.
`;

const FEATURE_PROFILE_WITH_HISTORY = `---
tier: FEATURE
schema_version: 1

calibration:
  scope: feature
  stakes: minor
  novelty: familiar
  reversibility: moderate
  horizon: months

phases_skipped: []

rigor_overrides:
  tdd_required: true
  security_audit: basic
  performance_pass: true
  simplification_pass: true
  nyquist_enforcement: basic
  plan_validation_dims: core
  research_parallelism: 2
  gate_strictness: light
  context_rot_reread: true
  review_depth: quality-only

metadata:
  created_at: 2026-04-20T09:00:00Z
  created_by: sig:calibrate
  escalation_history:
    - from_tier: SKETCH
      to_tier: FEATURE
      timestamp: 2026-04-21T11:00:00Z
      reason: "scope grew — added auth"
      backfill_warnings:
        - "REVIEW skipped earlier"
---

# Calibration Summary

Escalated from SKETCH.
`;

async function writeProfile(baseDir, content) {
  const planningDir = join(baseDir, '.planning');
  await mkdir(planningDir, { recursive: true });
  await writeFile(join(planningDir, 'PROFILE.md'), content, 'utf-8');
}

describe('PHASES array', () => {
  it('includes CALIBRATE as the first phase', () => {
    expect(PHASES[0]).toBe('CALIBRATE');
  });

  it('contains all seven Signal phases', () => {
    expect(PHASES).toEqual(['CALIBRATE', 'DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP']);
  });
});

describe('readProfile', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-profile-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it('parses a FULL-tier profile', async () => {
    await writeProfile(tempDir, FULL_PROFILE);
    const profile = await readProfile(tempDir);
    expect(profile.tier).toBe('FULL');
    expect(profile.schema_version).toBe(1);
    expect(profile.calibration.scope).toBe('subsystem');
    expect(profile.calibration.stakes).toBe('catastrophic');
    expect(profile.phases_skipped).toEqual([]);
    expect(profile.rigor_overrides.tdd_required).toBe(true);
    expect(profile.rigor_overrides.security_audit).toBe('full');
    expect(profile.rigor_overrides.research_parallelism).toBe(4);
    expect(profile.metadata.created_at).toBe('2026-04-22T14:23:00Z');
    expect(profile.metadata.escalation_history).toEqual([]);
  });

  it('parses a SKETCH-tier profile with REVIEW skipped', async () => {
    await writeProfile(tempDir, SKETCH_PROFILE);
    const profile = await readProfile(tempDir);
    expect(profile.tier).toBe('SKETCH');
    expect(profile.phases_skipped).toEqual(['REVIEW']);
    expect(profile.rigor_overrides.nyquist_enforcement).toBe('off');
    expect(profile.rigor_overrides.research_parallelism).toBe(0);
  });

  it('parses a SPIKE-tier profile with REVIEW and SHIP skipped', async () => {
    await writeProfile(tempDir, SPIKE_PROFILE);
    const profile = await readProfile(tempDir);
    expect(profile.tier).toBe('SPIKE');
    expect(profile.phases_skipped).toEqual(['REVIEW', 'SHIP']);
  });

  it('parses escalation_history entries', async () => {
    await writeProfile(tempDir, FEATURE_PROFILE_WITH_HISTORY);
    const profile = await readProfile(tempDir);
    expect(profile.metadata.escalation_history).toHaveLength(1);
    const entry = profile.metadata.escalation_history[0];
    expect(entry.from_tier).toBe('SKETCH');
    expect(entry.to_tier).toBe('FEATURE');
    expect(entry.reason).toBe('scope grew — added auth');
    expect(entry.backfill_warnings).toEqual(['REVIEW skipped earlier']);
  });

  it('throws when PROFILE.md is missing', async () => {
    await expect(readProfile(tempDir)).rejects.toThrow(ProfileSchemaError);
    await expect(readProfile(tempDir)).rejects.toThrow(/PROFILE\.md not found/);
  });

  it('throws when frontmatter delimiters are missing', async () => {
    await writeProfile(tempDir, '# No frontmatter here\n');
    await expect(readProfile(tempDir)).rejects.toThrow(/missing YAML frontmatter/);
  });

  it('throws on invalid tier value', async () => {
    const bad = FULL_PROFILE.replace('tier: FULL', 'tier: HUGE');
    await writeProfile(tempDir, bad);
    await expect(readProfile(tempDir)).rejects.toThrow(/tier must be one of/);
  });

  it('throws on wrong schema_version', async () => {
    const bad = FULL_PROFILE.replace('schema_version: 1', 'schema_version: 2');
    await writeProfile(tempDir, bad);
    await expect(readProfile(tempDir)).rejects.toThrow(/schema_version must be 1/);
  });

  it('throws on invalid calibration enum value', async () => {
    const bad = FULL_PROFILE.replace('scope: subsystem', 'scope: enormous');
    await writeProfile(tempDir, bad);
    await expect(readProfile(tempDir)).rejects.toThrow(/calibration\.scope/);
  });

  it('throws on missing rigor_overrides key', async () => {
    const bad = FULL_PROFILE.replace('  tdd_required: true\n', '');
    await writeProfile(tempDir, bad);
    await expect(readProfile(tempDir)).rejects.toThrow(/rigor_overrides\.tdd_required is required/);
  });

  it('throws on wrong rigor_override type', async () => {
    const bad = FULL_PROFILE.replace('research_parallelism: 4', 'research_parallelism: many');
    await writeProfile(tempDir, bad);
    await expect(readProfile(tempDir)).rejects.toThrow(/rigor_overrides\.research_parallelism/);
  });

  it('throws on invalid rigor_override enum value', async () => {
    const bad = FULL_PROFILE.replace('security_audit: full', 'security_audit: paranoid');
    await writeProfile(tempDir, bad);
    await expect(readProfile(tempDir)).rejects.toThrow(/rigor_overrides\.security_audit/);
  });

  it('throws when phases_skipped contains CALIBRATE', async () => {
    const bad = FULL_PROFILE.replace('phases_skipped: []', 'phases_skipped: [CALIBRATE]');
    await writeProfile(tempDir, bad);
    await expect(readProfile(tempDir)).rejects.toThrow(/never skipped/);
  });

  it('throws when phases_skipped contains an unknown phase', async () => {
    const bad = FULL_PROFILE.replace('phases_skipped: []', 'phases_skipped: [BIKESHED]');
    await writeProfile(tempDir, bad);
    await expect(readProfile(tempDir)).rejects.toThrow(/invalid phase/);
  });

  it('throws on malformed ISO timestamp in metadata', async () => {
    const bad = FULL_PROFILE.replace(
      'created_at: 2026-04-22T14:23:00Z',
      'created_at: yesterday'
    );
    await writeProfile(tempDir, bad);
    await expect(readProfile(tempDir)).rejects.toThrow(/metadata\.created_at/);
  });
});

describe('isPhaseEnabled', () => {
  const sketchProfile = { phases_skipped: ['REVIEW'] };
  const spikeProfile = { phases_skipped: ['REVIEW', 'SHIP'] };
  const fullProfile = { phases_skipped: [] };

  it('returns true for CALIBRATE regardless of profile', () => {
    expect(isPhaseEnabled(sketchProfile, 'CALIBRATE')).toBe(true);
    expect(isPhaseEnabled(fullProfile, 'CALIBRATE')).toBe(true);
  });

  it('returns false for phases listed in phases_skipped', () => {
    expect(isPhaseEnabled(sketchProfile, 'REVIEW')).toBe(false);
    expect(isPhaseEnabled(spikeProfile, 'SHIP')).toBe(false);
  });

  it('returns true for phases not in phases_skipped', () => {
    expect(isPhaseEnabled(sketchProfile, 'PLAN')).toBe(true);
    expect(isPhaseEnabled(sketchProfile, 'EXECUTE')).toBe(true);
    expect(isPhaseEnabled(fullProfile, 'REVIEW')).toBe(true);
  });

  it('throws when profile is missing or malformed', () => {
    expect(() => isPhaseEnabled(null, 'PLAN')).toThrow(ProfileSchemaError);
    expect(() => isPhaseEnabled({}, 'PLAN')).toThrow(ProfileSchemaError);
  });
});

describe('applyRigorOverrides', () => {
  const baseConfig = {
    mode: 'interactive',
    workflow: {
      research: true,
      nyquist_validation: true,
      security_enforcement: true,
      security_asvs_level: 1,
      review_phase: true,
      auto_advance: false,
    },
    parallelization: { enabled: true, max_concurrent_agents: 3 },
    gates: {
      confirm_discuss: true,
      confirm_plan: true,
      confirm_execute: true,
      confirm_verify: true,
      confirm_review: true,
      confirm_ship: true,
      anti_rationalization: true,
    },
  };

  const sketchOverrides = {
    rigor_overrides: {
      tdd_required: false,
      security_audit: 'none',
      performance_pass: false,
      simplification_pass: false,
      nyquist_enforcement: 'off',
      plan_validation_dims: 'none',
      research_parallelism: 0,
      gate_strictness: 'off',
      context_rot_reread: false,
      review_depth: 'none',
    },
  };

  const fullOverrides = {
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
    },
  };

  const featureOverrides = {
    rigor_overrides: {
      tdd_required: true,
      security_audit: 'basic',
      performance_pass: true,
      simplification_pass: true,
      nyquist_enforcement: 'basic',
      plan_validation_dims: 'core',
      research_parallelism: 2,
      gate_strictness: 'light',
      context_rot_reread: true,
      review_depth: 'quality-only',
    },
  };

  it('does not mutate the input config', () => {
    const before = JSON.parse(JSON.stringify(baseConfig));
    applyRigorOverrides(baseConfig, fullOverrides);
    expect(baseConfig).toEqual(before);
  });

  it('attaches rigor_overrides to the merged config', () => {
    const merged = applyRigorOverrides(baseConfig, fullOverrides);
    expect(merged.rigor_overrides).toEqual(fullOverrides.rigor_overrides);
  });

  it('SKETCH overrides relax legacy keys', () => {
    const merged = applyRigorOverrides(baseConfig, sketchOverrides);
    expect(merged.workflow.nyquist_validation).toBe(false);
    expect(merged.workflow.security_enforcement).toBe(false);
    expect(merged.workflow.review_phase).toBe(false);
    expect(merged.workflow.research).toBe(false);
    expect(merged.workflow.auto_advance).toBe(true);
    expect(merged.gates.confirm_plan).toBe(false);
    expect(merged.gates.anti_rationalization).toBe(false);
  });

  it('FULL overrides tighten legacy keys', () => {
    const merged = applyRigorOverrides(baseConfig, fullOverrides);
    expect(merged.workflow.nyquist_validation).toBe(true);
    expect(merged.workflow.security_enforcement).toBe(true);
    expect(merged.workflow.security_asvs_level).toBe(2);
    expect(merged.workflow.review_phase).toBe(true);
    expect(merged.workflow.research).toBe(true);
    expect(merged.parallelization.max_concurrent_agents).toBe(4);
    expect(merged.workflow.auto_advance).toBe(false);
    expect(merged.gates.confirm_ship).toBe(true);
    expect(merged.gates.anti_rationalization).toBe(true);
  });

  it('FEATURE overrides set ASVS level 1 and light gates', () => {
    const merged = applyRigorOverrides(baseConfig, featureOverrides);
    expect(merged.workflow.security_enforcement).toBe(true);
    expect(merged.workflow.security_asvs_level).toBe(1);
    expect(merged.parallelization.max_concurrent_agents).toBe(2);
    expect(merged.gates.confirm_plan).toBe(true);
    expect(merged.gates.anti_rationalization).toBe(false);
  });

  it('throws on missing config or profile', () => {
    expect(() => applyRigorOverrides(null, fullOverrides)).toThrow(ProfileSchemaError);
    expect(() => applyRigorOverrides(baseConfig, null)).toThrow(ProfileSchemaError);
    expect(() => applyRigorOverrides(baseConfig, {})).toThrow(ProfileSchemaError);
  });

  it('creates workflow/gates/parallelization sections if absent', () => {
    const merged = applyRigorOverrides({ mode: 'interactive' }, fullOverrides);
    expect(merged.workflow).toBeDefined();
    expect(merged.gates).toBeDefined();
    expect(merged.parallelization).toBeDefined();
  });
});
