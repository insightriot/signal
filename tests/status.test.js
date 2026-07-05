import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  nextActionForPhase,
  reachedDoneViaSkip,
  extractTopOpenQuestions,
  countOpenQuestions,
  readOpenQuestions,
  formatEscalationSummary,
  readLandscapeMeta,
  readSchemaDriftBanner,
} from '../tools/lib/status.js';
import { readProfile, ProfileSchemaError } from '../tools/lib/profile.js';

describe('readSchemaDriftBanner (S4.t2, FR5)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-status-drift-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns null when STATE.md is at the current schema', async () => {
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    await writeFile(
      join(tempDir, '.planning', 'STATE.md'),
      '---\nschema_version: 1\nphase: EXECUTE\n---\n# body\n',
      'utf-8'
    );
    expect(await readSchemaDriftBanner(tempDir)).toBeNull();
  });

  it('returns null when there is no STATE.md', async () => {
    expect(await readSchemaDriftBanner(tempDir)).toBeNull();
  });

  it('returns a formatted banner string when the schema is ahead', async () => {
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    await writeFile(
      join(tempDir, '.planning', 'STATE.md'),
      '---\nschema_version: 999\nphase: EXECUTE\n---\n# body\n',
      'utf-8'
    );
    const banner = await readSchemaDriftBanner(tempDir);
    expect(banner).toMatch(/⚠/);
    expect(banner).toMatch(/schema drift/i);
  });
});
import { readState } from '../tools/lib/state.js';

describe('Status helpers', () => {
  describe('nextActionForPhase', () => {
    const cases = [
      ['CALIBRATE', [], '/sig:discuss'],
      ['DISCUSS', [], '/sig:plan'],
      ['PLAN', [], '/sig:execute'],
      ['EXECUTE', [], '/sig:verify'],
      ['VERIFY', [], '/sig:review'],
      ['REVIEW', [], '/sig:ship'],
      ['SHIP', [], 'done'],
      // SKETCH skips REVIEW
      ['VERIFY', ['REVIEW'], '/sig:ship'],
      // SPIKE skips REVIEW + SHIP
      ['VERIFY', ['REVIEW', 'SHIP'], 'done'],
      ['EXECUTE', ['REVIEW', 'SHIP'], '/sig:verify'],
      // Defensive: skipping a middle phase that no real tier skips
      ['DISCUSS', ['PLAN'], '/sig:execute'],
      ['PLAN', ['EXECUTE'], '/sig:verify'],
    ];

    for (const [phase, skipped, expected] of cases) {
      it(`(${phase}, [${skipped.join(',')}]) -> ${expected}`, () => {
        expect(nextActionForPhase(phase, skipped)).toBe(expected);
      });
    }

    it('throws on unknown currentPhase', () => {
      expect(() => nextActionForPhase('NONSENSE', [])).toThrow(/unknown currentPhase/);
    });

    it('defaults phasesSkipped to empty array', () => {
      expect(nextActionForPhase('PLAN')).toBe('/sig:execute');
    });
  });

  describe('reachedDoneViaSkip', () => {
    it('false when SHIP normally', () => {
      expect(reachedDoneViaSkip('SHIP', [])).toBe(false);
    });
    it('true when SPIKE skips REVIEW + SHIP from VERIFY', () => {
      expect(reachedDoneViaSkip('VERIFY', ['REVIEW', 'SHIP'])).toBe(true);
    });
    it('false when only one phase left and not skipped', () => {
      expect(reachedDoneViaSkip('REVIEW', [])).toBe(false);
    });
    it('false on unknown phase', () => {
      expect(reachedDoneViaSkip('NONSENSE', [])).toBe(false);
    });
  });

  describe('extractTopOpenQuestions', () => {
    it('returns empty array on non-string input', () => {
      expect(extractTopOpenQuestions(null)).toEqual([]);
      expect(extractTopOpenQuestions(undefined)).toEqual([]);
      expect(extractTopOpenQuestions(42)).toEqual([]);
    });

    it('extracts level-2 headings up to limit', () => {
      const content = `# Top
## First
body
## Second
body
## Third
body
## Fourth
body
`;
      expect(extractTopOpenQuestions(content, 3, 80)).toEqual(['First', 'Second', 'Third']);
    });

    it('truncates long headings to maxLen with ellipsis', () => {
      const longHeading = 'A'.repeat(100);
      const content = `## ${longHeading}\n`;
      const out = extractTopOpenQuestions(content, 3, 80);
      expect(out).toHaveLength(1);
      expect(out[0].length).toBe(80);
      expect(out[0].endsWith('…')).toBe(true);
    });

    it('returns empty array when no level-2 headings present', () => {
      expect(extractTopOpenQuestions('# Only level-1\nNo questions here')).toEqual([]);
    });

    it('ignores level-3+ headings', () => {
      const content = `## Real Q\n### Sub-heading\n## Second Q\n#### Deeper\n`;
      expect(extractTopOpenQuestions(content)).toEqual(['Real Q', 'Second Q']);
    });
  });

  describe('countOpenQuestions', () => {
    it('counts level-2 headings only', () => {
      const content = `# Top\n## A\n## B\n### C\n## D\n`;
      expect(countOpenQuestions(content)).toBe(3);
    });
    it('returns 0 on empty / non-string', () => {
      expect(countOpenQuestions('')).toBe(0);
      expect(countOpenQuestions(null)).toBe(0);
    });
  });

  describe('formatEscalationSummary', () => {
    it('returns null on empty / non-array', () => {
      expect(formatEscalationSummary([])).toBeNull();
      expect(formatEscalationSummary(null)).toBeNull();
      expect(formatEscalationSummary(undefined)).toBeNull();
    });

    it('formats first valid entry as " (escalated from X on YYYY-MM-DD)"', () => {
      const history = [
        { from_tier: 'SKETCH', to_tier: 'FEATURE', timestamp: '2026-04-23T10:15:00Z', reason: 'x' },
      ];
      expect(formatEscalationSummary(history)).toBe(' (escalated from SKETCH on 2026-04-23)');
    });

    it('skips entries missing required fields', () => {
      const history = [
        { from_tier: null, timestamp: '2026-04-23T10:15:00Z' },
        { from_tier: 'FEATURE', to_tier: 'FULL', timestamp: '2026-04-25T00:00:00Z' },
      ];
      expect(formatEscalationSummary(history)).toBe(' (escalated from FEATURE on 2026-04-25)');
    });

    it('returns null when no valid entries', () => {
      const history = [{ from_tier: null }, { timestamp: 'oops' }];
      expect(formatEscalationSummary(history)).toBeNull();
    });
  });

  describe('readLandscapeMeta', () => {
    let baseDir;

    beforeEach(async () => {
      baseDir = await mkdtemp(join(tmpdir(), 'signal-landscape-meta-'));
      await mkdir(join(baseDir, '.planning'), { recursive: true });
    });

    afterEach(async () => {
      await rm(baseDir, { recursive: true, force: true });
    });

    it('returns null when LANDSCAPE.md is absent', async () => {
      expect(await readLandscapeMeta(baseDir)).toBeNull();
    });

    it('extracts capturedOn date from "## Last Updated" section', async () => {
      const content = '# Landscape\n\nbody\n\n## Last Updated\n\n2026-04-26\n';
      await writeFile(join(baseDir, '.planning', 'LANDSCAPE.md'), content);
      expect(await readLandscapeMeta(baseDir)).toEqual({ capturedOn: '2026-04-26' });
    });

    it('returns capturedOn:null when LANDSCAPE.md exists but Last Updated is unparseable', async () => {
      const content = '# Landscape\n\n## Last Updated\n\n(unknown)\n';
      await writeFile(join(baseDir, '.planning', 'LANDSCAPE.md'), content);
      expect(await readLandscapeMeta(baseDir)).toEqual({ capturedOn: null });
    });

    it('returns capturedOn:null when Last Updated section is missing', async () => {
      const content = '# Landscape\n\nNo last-updated section.\n';
      await writeFile(join(baseDir, '.planning', 'LANDSCAPE.md'), content);
      expect(await readLandscapeMeta(baseDir)).toEqual({ capturedOn: null });
    });

    it('extracts the first ISO date when Last Updated has extra commentary', async () => {
      const content = '# Landscape\n\n## Last Updated\n\n2026-04-26 (re-scanned after dependency update)\n';
      await writeFile(join(baseDir, '.planning', 'LANDSCAPE.md'), content);
      expect(await readLandscapeMeta(baseDir)).toEqual({ capturedOn: '2026-04-26' });
    });
  });
});

describe('Status — branch routing fixtures', () => {
  let fixtureDir;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), 'signal-status-'));
    await mkdir(join(fixtureDir, '.planning'), { recursive: true });
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true });
  });

  it('Branch A (no PROFILE.md): readProfile throws "not found"', async () => {
    await expect(readProfile(fixtureDir)).rejects.toThrow(/not found/i);
  });

  it('Branch B (PROFILE.md only): readProfile succeeds, readState returns null', async () => {
    await writeFile(
      join(fixtureDir, '.planning', 'PROFILE.md'),
      `---
tier: FEATURE
schema_version: 1

calibration:
  scope: feature
  stakes: minor
  novelty: familiar
  reversibility: trivial
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
  created_at: 2026-04-26T02:00:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary
test
`
    );
    const profile = await readProfile(fixtureDir);
    expect(profile.tier).toBe('FEATURE');
    expect(await readState(fixtureDir)).toBeNull();
  });

  it('Branch C (full): readProfile + readState both succeed', async () => {
    await writeFile(
      join(fixtureDir, '.planning', 'PROFILE.md'),
      `---
tier: FEATURE
schema_version: 1

calibration:
  scope: feature
  stakes: minor
  novelty: familiar
  reversibility: trivial
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
  created_at: 2026-04-26T02:00:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary
test
`
    );
    await writeFile(
      join(fixtureDir, '.planning', 'STATE.md'),
      `# Project State

## Current Phase
PLAN

## Completed Phases
- CALIBRATE (2026-04-25)
- DISCUSS (2026-04-25)

## Blockers
(none)

## Last Updated
2026-04-25
`
    );
    const profile = await readProfile(fixtureDir);
    const state = await readState(fixtureDir);
    expect(profile.tier).toBe('FEATURE');
    expect(state.phase).toBe('PLAN');
  });

  it('readOpenQuestions returns null when file absent', async () => {
    expect(await readOpenQuestions(fixtureDir)).toBeNull();
  });

  it('readOpenQuestions returns count + truncated top headings', async () => {
    await writeFile(
      join(fixtureDir, '.planning', 'OPEN-QUESTIONS.md'),
      `# Open Questions

## First question

body

## Second question

body

## Third question

body

## Fourth question

body
`
    );
    const oq = await readOpenQuestions(fixtureDir);
    expect(oq).not.toBeNull();
    expect(oq.count).toBe(4);
    expect(oq.top).toEqual(['First question', 'Second question', 'Third question']);
  });
});

describe('Status — read-only behavior', () => {
  let fixtureDir;

  beforeEach(async () => {
    fixtureDir = await mkdtemp(join(tmpdir(), 'signal-status-readonly-'));
    await mkdir(join(fixtureDir, '.planning'), { recursive: true });
  });

  afterEach(async () => {
    await rm(fixtureDir, { recursive: true });
  });

  it('does not modify any .planning/* file when helpers run', async () => {
    const profilePath = join(fixtureDir, '.planning', 'PROFILE.md');
    const statePath = join(fixtureDir, '.planning', 'STATE.md');
    const oqPath = join(fixtureDir, '.planning', 'OPEN-QUESTIONS.md');

    await writeFile(
      profilePath,
      `---
tier: SKETCH
schema_version: 1

calibration:
  scope: throwaway
  stakes: none
  novelty: familiar
  reversibility: trivial
  horizon: hours

phases_skipped: [REVIEW]

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
  created_at: 2026-04-25T00:00:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Calibration Summary
test
`
    );
    await writeFile(
      statePath,
      `# Project State

## Current Phase
EXECUTE

## Completed Phases
- CALIBRATE (2026-04-25)
- DISCUSS (2026-04-25)
- PLAN (2026-04-25)

## Blockers
(none)

## Last Updated
2026-04-25
`
    );
    await writeFile(oqPath, '# Open Questions\n\n## A question\n');
    const landscapePath = join(fixtureDir, '.planning', 'LANDSCAPE.md');
    await writeFile(
      landscapePath,
      '# Landscape\n\n## What this project is\n\nA test fixture.\n\n## Last Updated\n\n2026-04-26\n'
    );

    const before = await Promise.all([
      stat(profilePath).then((s) => s.mtimeMs),
      stat(statePath).then((s) => s.mtimeMs),
      stat(oqPath).then((s) => s.mtimeMs),
      stat(landscapePath).then((s) => s.mtimeMs),
    ]);

    // Run all the helpers /sig:status will call
    const profile = await readProfile(fixtureDir);
    const state = await readState(fixtureDir);
    const oq = await readOpenQuestions(fixtureDir);
    const landscape = await readLandscapeMeta(fixtureDir);
    nextActionForPhase(state.phase, profile.phases_skipped);
    formatEscalationSummary(profile.metadata.escalation_history);

    const after = await Promise.all([
      stat(profilePath).then((s) => s.mtimeMs),
      stat(statePath).then((s) => s.mtimeMs),
      stat(oqPath).then((s) => s.mtimeMs),
      stat(landscapePath).then((s) => s.mtimeMs),
    ]);

    expect(after).toEqual(before);
    expect(oq.count).toBe(1);
    expect(landscape).toEqual({ capturedOn: '2026-04-26' });
  });
});

describe('status.md — static contract', () => {
  const statusMdPath = new URL('../commands/status.md', import.meta.url);

  it('file exists', () => {
    expect(existsSync(statusMdPath)).toBe(true);
  });

  it('has front-matter with name: sig:status', async () => {
    const content = await readFile(statusMdPath, 'utf-8');
    // Front-matter is delimited by --- on its own line; name field within it.
    expect(content).toMatch(/^---\r?\n(?:[^\n]*\r?\n)*?name:\s*sig:status\b/);
  });

  it('declares no skill loading (no "## Skill Loading" heading)', async () => {
    const content = await readFile(statusMdPath, 'utf-8');
    // The phase-command convention uses a "## Skill Loading" heading.
    // Disclaimers about NOT loading skills are fine.
    expect(content).not.toMatch(/^##\s+Skill Loading/im);
  });

  it('declares no tier-gating preamble (FR5: meta command, not phase)', async () => {
    const content = await readFile(statusMdPath, 'utf-8');
    // Phase commands open with "## 0. Tier-gating preamble". Meta commands
    // skip this. We check for the heading specifically — disclaimers in prose
    // about NOT having one are allowed.
    expect(content).not.toMatch(/^##\s+0\.\s+Tier-gating preamble/im);
  });

  it('does not spawn agents (no Agent invocation directives)', async () => {
    const content = await readFile(statusMdPath, 'utf-8');
    // Phase commands say things like "Spawn up to 4 research agents in parallel".
    // We catch that imperative pattern but allow disclaimers.
    expect(content).not.toMatch(/^Spawn (up to )?\d+|^Spawn (\w+ ){0,3}agents? in parallel/im);
    expect(content).not.toMatch(/research(er)? agents? in parallel/i);
  });
});
