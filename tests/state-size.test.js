// FR2 (v0.1.6): read-time STATE.md size banner. Detect + flag only — eviction
// of an already-bloated file is M5. Tests use controlled-size fixtures, NEVER
// the live .planning/STATE.md (whose size crosses the threshold as the project
// grows — a live-file assertion would start failing on its own).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  detectStateSize,
  readStateSize,
  formatStateSizeBanner,
  resolveStateSizeThreshold,
  STATE_SIZE_WARN_BYTES,
} from '../tools/lib/state.js';
import {
  readStateSizeForTier,
  readStateSizeBannerForTier,
} from '../tools/lib/status.js';

const KB = 1024;

// A fully-valid PROFILE.md at `tier` (readProfile validates every section, but
// does NOT cross-check calibration/rigor against the tier — so one valid body
// serves all four tiers with only the `tier:` line swapped).
function profileYaml(tier) {
  return `---
tier: ${tier}
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
  created_at: 2026-07-16T00:00:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary

Tier-threshold test fixture.
`;
}

describe('detectStateSize (FR2, pure)', () => {
  it('AC2.3 returns null under the threshold', () => {
    expect(detectStateSize(50 * KB, 150 * KB)).toBeNull();
  });

  it('AC2.2 returns null for Signal-sized (~62 KB) under the 150 KB default', () => {
    expect(detectStateSize(62 * KB)).toBeNull();
    expect(STATE_SIZE_WARN_BYTES).toBe(150 * KB);
  });

  it('AC2.1 returns a finding over the threshold, pointing at eviction remediation', () => {
    const f = detectStateSize(200 * KB, 150 * KB);
    expect(f).not.toBeNull();
    expect(f.bytes).toBe(200 * KB);
    // M5.E1.S2.t3: message now points at the /sig:checkpoint|/sig:ship eviction
    // path (built in this Epic) rather than "eviction is planned for M5".
    expect(f.message).toMatch(/checkpoint/i);
  });

  it('is exclusive at the boundary (exactly at threshold → null)', () => {
    expect(detectStateSize(150 * KB, 150 * KB)).toBeNull();
  });
});

describe('readStateSize + formatStateSizeBanner (FR2, read-only)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-size-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const bigState = '---\nschema_version: 1\n---\n' + 'x'.repeat(200 * KB);

  it('AC2.4 returns null when no STATE.md exists', () => {
    expect(readStateSize(dir)).toBeNull();
  });

  it('AC2.3 returns null for a small STATE.md', async () => {
    await writeFile(join(dir, '.planning', 'STATE.md'), '---\nschema_version: 1\n---\nbody\n');
    expect(readStateSize(dir)).toBeNull();
  });

  it('AC2.1 returns a finding for an over-budget STATE.md', async () => {
    await writeFile(join(dir, '.planning', 'STATE.md'), bigState);
    const f = readStateSize(dir);
    expect(f).not.toBeNull();
    expect(formatStateSizeBanner(f)).toMatch(/STATE\.md/);
  });

  it('AC2.4 is read-only — no mtime change', async () => {
    const p = join(dir, '.planning', 'STATE.md');
    await writeFile(p, bigState);
    const before = (await stat(p)).mtimeMs;
    readStateSize(dir);
    const after = (await stat(p)).mtimeMs;
    expect(after).toBe(before);
  });

  it('formatStateSizeBanner returns null for a null finding', () => {
    expect(formatStateSizeBanner(null)).toBeNull();
  });
});

describe('resolveStateSizeThreshold (FR2d, pure)', () => {
  it('maps each tier to its threshold', () => {
    expect(resolveStateSizeThreshold('SKETCH')).toBe(75 * KB);
    expect(resolveStateSizeThreshold('FEATURE')).toBe(150 * KB);
    expect(resolveStateSizeThreshold('SPIKE')).toBe(150 * KB);
    expect(resolveStateSizeThreshold('FULL')).toBe(300 * KB);
  });

  it('falls back to the flat 150 KB default for unknown / undefined tier', () => {
    expect(resolveStateSizeThreshold('NOPE')).toBe(STATE_SIZE_WARN_BYTES);
    expect(resolveStateSizeThreshold(undefined)).toBe(STATE_SIZE_WARN_BYTES);
    expect(resolveStateSizeThreshold(null)).toBe(STATE_SIZE_WARN_BYTES);
    expect(STATE_SIZE_WARN_BYTES).toBe(150 * KB);
  });
});

describe('readStateSizeForTier + readStateSizeBannerForTier (FR2d, async command layer)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-tier-size-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  // ~200 KB STATE.md: over FEATURE (150) + SKETCH (75), under FULL (300).
  const bigState = '---\nschema_version: 1\n---\n' + 'x'.repeat(200 * KB);

  async function stage(tier, stateContent = bigState) {
    await writeFile(join(dir, '.planning', 'STATE.md'), stateContent);
    if (tier) {
      await writeFile(join(dir, '.planning', 'PROFILE.md'), profileYaml(tier));
    }
  }

  it('FULL (300 KB) → a ~200 KB STATE.md is under budget → silent', async () => {
    await stage('FULL');
    expect(await readStateSizeForTier(dir)).toBeNull();
    expect(await readStateSizeBannerForTier(dir)).toBeNull();
  });

  it('FEATURE (150 KB) → a ~200 KB STATE.md is over budget → fires', async () => {
    await stage('FEATURE');
    const f = await readStateSizeForTier(dir);
    expect(f).not.toBeNull();
    expect(f.threshold).toBe(150 * KB);
    expect(await readStateSizeBannerForTier(dir)).toMatch(/STATE\.md/);
  });

  it('SPIKE (150 KB) → same threshold as FEATURE → fires at ~200 KB', async () => {
    await stage('SPIKE');
    const f = await readStateSizeForTier(dir);
    expect(f).not.toBeNull();
    expect(f.threshold).toBe(150 * KB);
  });

  it('SKETCH (75 KB) → a ~200 KB STATE.md is well over budget → fires', async () => {
    await stage('SKETCH');
    const f = await readStateSizeForTier(dir);
    expect(f).not.toBeNull();
    expect(f.threshold).toBe(75 * KB);
  });

  it('no PROFILE.md → flat 150 KB fallback (fail-open) → fires at ~200 KB', async () => {
    await stage(null); // STATE.md only, no PROFILE.md
    const f = await readStateSizeForTier(dir);
    expect(f).not.toBeNull();
    expect(f.threshold).toBe(STATE_SIZE_WARN_BYTES);
  });

  it('malformed PROFILE.md → flat 150 KB fallback (never throws)', async () => {
    await writeFile(join(dir, '.planning', 'STATE.md'), bigState);
    await writeFile(join(dir, '.planning', 'PROFILE.md'), 'not: [valid yaml');
    const f = await readStateSizeForTier(dir);
    expect(f).not.toBeNull();
    expect(f.threshold).toBe(STATE_SIZE_WARN_BYTES);
  });

  it('missing STATE.md → null regardless of tier', async () => {
    await writeFile(join(dir, '.planning', 'PROFILE.md'), profileYaml('FULL'));
    expect(await readStateSizeForTier(dir)).toBeNull();
  });
});
