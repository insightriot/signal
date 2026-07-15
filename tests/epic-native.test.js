// Tests for M4.5.E11 (Epic-native flow). See .planning/M4.5.E11-PLAN.md.
//
// Grouped by slice/task. Each task's describe block is added RED-first.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

import {
  EPIC_ID_STRICT_RE,
  detectMode,
  initState,
  readState,
  setCurrentEpic,
  setCurrentTask,
  StateWriteError,
} from '../tools/lib/state.js';
import { deriveRetroPath, isEpicDone } from '../tools/lib/retrospective.js';
import { currentMilestone, deriveNextEpicId } from '../tools/lib/milestones.js';
import { resolveArtifactPath, artifactName } from '../tools/lib/resume.js';
import { readProfile, readEffectiveProfile, ProfileSchemaError } from '../tools/lib/profile.js';
import { formatTierLine } from '../tools/lib/status.js';
import { renderResumeBriefing } from '../tools/lib/resume.js';

// Write a COMPLETE schema_v1 STATE.md (all fields) so readStateForMutation
// accepts it — used where we need a non-null current_wave to prove the roll
// reset (initState only ever produces current_wave: null).
async function writeFullState(baseDir, { epic = null, wave = null, tasks = [] } = {}) {
  await mkdir(join(baseDir, '.planning'), { recursive: true });
  const fm =
    `---\n` +
    `schema_version: 1\n` +
    `phase: EXECUTE\n` +
    `current_epic: ${epic === null ? 'null' : epic}\n` +
    `current_wave: ${wave === null ? 'null' : wave}\n` +
    `current_tasks: ${JSON.stringify(tasks)}\n` +
    `completed_phases:\n  - DISCUSS (2026-07-15)\n` +
    `blockers: []\n` +
    `---\n# State\n\nbody\n`;
  await writeFile(join(baseDir, '.planning', 'STATE.md'), fm, 'utf-8');
}

// Reuse the milestones.test.js fixture shape: a schema_version-1 STATE.md with
// the given current_epic value.
async function writeState(baseDir, { epic } = {}) {
  await mkdir(join(baseDir, '.planning'), { recursive: true });
  const epicLine =
    epic === undefined
      ? ''
      : epic === null
        ? 'current_epic: null\n'
        : `current_epic: ${epic}\n`;
  const frontmatter =
    `---\n` +
    `schema_version: 1\n` +
    `phase: EXECUTE\n` +
    epicLine +
    `current_tasks: []\n` +
    `completed_phases: []\n` +
    `blockers: []\n` +
    `---\n` +
    `# Project State\n\nbody\n`;
  await writeFile(join(baseDir, '.planning', 'STATE.md'), frontmatter, 'utf-8');
}

// ---- S1.t1 — canonical strict Epic-ID validation regex (shared) ----
describe('S1.t1 EPIC_ID_STRICT_RE (canonical strict Epic-ID validator)', () => {
  const accepts = ['M4.E1', 'M4.5.E1', 'M4.5.E11', 'M5.E1', 'M5.E12', 'M10.E1'];
  const rejects = [
    'v0.1.6', // version string — the schism case
    '', // empty
    'E9', // bare epic
    'M4.5', // milestone, no epic
    'M4.5.E', // no epic number
    'M4.5.E1x', // trailing junk
    '../x', // path traversal
    'm4.5.e1', // lowercase
    'M4.5.E1 ', // trailing space
  ];

  for (const id of accepts) {
    it(`accepts ${JSON.stringify(id)}`, () => {
      expect(EPIC_ID_STRICT_RE.test(id)).toBe(true);
    });
  }
  for (const id of rejects) {
    it(`rejects ${JSON.stringify(id)}`, () => {
      expect(EPIC_ID_STRICT_RE.test(id)).toBe(false);
    });
  }

  it('is the same shape deriveRetroPath enforces (shared, not duplicated)', () => {
    // deriveRetroPath must accept exactly what EPIC_ID_STRICT_RE accepts.
    expect(deriveRetroPath('M4.5.E11')).toBe('.planning/M4.5.E11-RETROSPECTIVE.md');
    expect(() => deriveRetroPath('v0.1.6')).toThrow(/malformed/);
    expect(() => deriveRetroPath('E9')).toThrow(/malformed/);
  });
});

// ---- S1.t1 — writer-shape IDs round-trip through currentMilestone ----
describe('S1.t1 writer-shape (depth-2) Epic IDs parse in currentMilestone', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e11-t1-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  // Every depth-2 ID the writer can emit must resolve to a milestone (no null).
  const roundTrip = [
    ['M4.5.E12', 'MILESTONE-4.5.md'],
    ['M5.E1', 'MILESTONE-5.md'],
    ['M4.E8', 'MILESTONE-4.md'],
  ];
  for (const [epic, expected] of roundTrip) {
    it(`${epic} -> ${expected} (writer→currentMilestone round-trip)`, async () => {
      expect(EPIC_ID_STRICT_RE.test(epic)).toBe(true); // it's a legal writer ID
      await writeState(baseDir, { epic });
      expect(await currentMilestone(baseDir)).toBe(expected);
    });
  }
});

// ---- S1.t2 — setCurrentEpic (the current_epic write-half) ----
describe('S1.t2 setCurrentEpic', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e11-t2-'));
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('writes a valid strict Epic ID to current_epic', async () => {
    await initState(baseDir, 'EXECUTE');
    await setCurrentEpic(baseDir, 'M4.5.E11');
    const state = await readState(baseDir);
    expect(state.current_epic).toBe('M4.5.E11');
  });

  it.each(['v0.1.6', '', 'foo', 'M4.5', 'E9', '../x'])(
    'rejects invalid id %j BEFORE touching disk (STATE unchanged)',
    async (bad) => {
      await initState(baseDir, 'EXECUTE'); // current_epic starts null
      await expect(setCurrentEpic(baseDir, bad)).rejects.toBeInstanceOf(StateWriteError);
      const state = await readState(baseDir);
      expect(state.current_epic).toBeNull();
    },
  );

  it('rolling to a new Epic resets coupled current_wave + current_tasks', async () => {
    await writeFullState(baseDir, {
      epic: 'M4.5.E11',
      wave: 'M4.5.E11.S1',
      tasks: [{ id: 'M4.5.E11.S1.t9', epic: 'M4.5.E11', wave: null, status: 'in_progress', startedAt: '2026-07-15T00:00:00.000Z' }],
    });
    await setCurrentEpic(baseDir, 'M4.5.E12'); // roll
    const state = await readState(baseDir);
    expect(state.current_epic).toBe('M4.5.E12');
    expect(state.current_wave).toBeNull();
    expect(state.current_tasks).toEqual([]);
  });

  it('is idempotent — re-setting the SAME id is a no-op (coupled fields preserved)', async () => {
    await writeFullState(baseDir, {
      epic: 'M4.5.E11',
      wave: 'M4.5.E11.S1',
      tasks: [{ id: 'M4.5.E11.S1.t9', epic: 'M4.5.E11', wave: null, status: 'in_progress', startedAt: '2026-07-15T00:00:00.000Z' }],
    });
    await setCurrentEpic(baseDir, 'M4.5.E11'); // same id
    const state = await readState(baseDir);
    expect(state.current_epic).toBe('M4.5.E11');
    expect(state.current_wave).toBe('M4.5.E11.S1'); // NOT reset
    expect(state.current_tasks).toHaveLength(1); // NOT reset
  });

  it('preserves other frontmatter (phase, completed_phases, blockers)', async () => {
    await initState(baseDir, 'EXECUTE');
    await setCurrentEpic(baseDir, 'M4.5.E11');
    const state = await readState(baseDir);
    expect(state.phase).toBe('EXECUTE');
    expect(Array.isArray(state.completedPhases ?? state.completed_phases)).toBe(true);
    expect(state.blockers).toEqual([]);
  });
});

// ---- S1.t3 — detectMode (the sole mode signal, fail-open to linear) ----
describe('S1.t3 detectMode', () => {
  it('returns epic for a strict-shaped current_epic', () => {
    expect(detectMode({ current_epic: 'M4.5.E11' })).toBe('epic');
    expect(detectMode({ current_epic: 'M5.E1' })).toBe('epic');
  });

  it.each([
    ['null current_epic', { current_epic: null }],
    ['absent current_epic', {}],
    ['empty string', { current_epic: '' }],
    ['whitespace', { current_epic: '   ' }],
    ['version string (not an Epic ID)', { current_epic: 'v0.1.6' }],
    ['garbage', { current_epic: 'garbage' }],
    ['padded id', { current_epic: 'M4.5.E11 ' }],
    ['null state', null],
    ['undefined state', undefined],
  ])('returns linear for %s (fail-open, never throws)', (_label, state) => {
    expect(detectMode(state)).toBe('linear');
  });
});

// ---- S1.t7 — deriveNextEpicId (assign the next E{N} under a milestone) ----
describe('S1.t7 deriveNextEpicId', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e11-t7-'));
    await mkdir(join(baseDir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  async function touch(...names) {
    for (const n of names) await writeFile(join(baseDir, '.planning', n), 'x', 'utf-8');
  }

  it('derives the next E{N} under the current_epic milestone', async () => {
    await writeState(baseDir, { epic: 'M4.5.E11' });
    await touch('M4.5.E10-PLAN.md', 'M4.5.E11-PLAN.md', 'M4.5.E11-RESEARCH.md');
    expect(await deriveNextEpicId(baseDir)).toBe('M4.5.E12');
  });

  it('returns E1 for a milestone with no existing Epics (explicit milestone)', async () => {
    await writeState(baseDir, { epic: 'M4.5.E11' });
    expect(await deriveNextEpicId(baseDir, { milestone: '5' })).toBe('M5.E1');
  });

  it('ignores MILESTONE-*.md and other-milestone artifacts', async () => {
    await writeState(baseDir, { epic: 'M4.5.E1' });
    await touch('MILESTONE-4.5.md', 'M4.E9-PLAN.md', 'M5.E3-PLAN.md', 'M4.5.E2-PLAN.md');
    expect(await deriveNextEpicId(baseDir)).toBe('M4.5.E3'); // max under 4.5 is E2
  });

  it('returns null when there is no milestone context (no current_epic, no milestone arg)', async () => {
    await writeState(baseDir, { epic: null });
    expect(await deriveNextEpicId(baseDir)).toBeNull();
  });

  it('every derived ID is a legal strict Epic ID', async () => {
    await writeState(baseDir, { epic: 'M4.5.E11' });
    await touch('M4.5.E11-PLAN.md');
    const next = await deriveNextEpicId(baseDir);
    expect(EPIC_ID_STRICT_RE.test(next)).toBe(true);
  });
});

// ---- S1.t5 — isEpicDone (done-signal = retro file exists, NOT phase=SHIP) ----
describe('S1.t5 isEpicDone', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e11-t5-'));
    await mkdir(join(baseDir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('is true when {EpicID}-RETROSPECTIVE.md exists', async () => {
    await writeFile(join(baseDir, '.planning', 'M4.5.E11-RETROSPECTIVE.md'), '# retro', 'utf-8');
    expect(isEpicDone(baseDir, 'M4.5.E11')).toBe(true);
  });

  it('is false when no retro file exists (in/past SHIP is not done)', async () => {
    await writeFile(join(baseDir, '.planning', 'M4.5.E11-PLAN.md'), 'x', 'utf-8');
    expect(isEpicDone(baseDir, 'M4.5.E11')).toBe(false);
  });

  it.each(['v0.1.6', '', 'garbage', null, undefined])(
    'is false (no throw) for non-Epic-shaped id %j',
    (bad) => {
      expect(isEpicDone(baseDir, bad)).toBe(false);
    },
  );
});

// ---- S1.t6 — linear-mode back-compat net (byte-identity anchor) ----
describe('S1.t6 linear-mode golden fixture', () => {
  const linearBase = join(__dirname, 'fixtures', 'epic-native', 'linear');
  const linearPlanning = join(linearBase, '.planning');

  it('the fixture is genuinely linear mode (detectMode → linear)', async () => {
    const state = await readState(linearBase);
    expect(state.current_epic).toBeNull();
    expect(detectMode(state)).toBe('linear');
  });

  it('resolves phase-named 1-PLAN.md in linear mode (no Epic prefix)', () => {
    const p = resolveArtifactPath(linearPlanning, 'PLAN', { currentEpic: null, phase: 'PLAN' });
    expect(p).toMatch(/1-PLAN\.md$/);
  });
});

// ---- S2.t1 — artifactName (the FR2 write-half; symmetric to resolveArtifactPath) ----
describe('S2.t1 artifactName', () => {
  // The 8 Epic-scoped artifact kinds (FR2).
  const KINDS = [
    'RESEARCH',
    'REQUIREMENTS',
    'PLAN',
    'VALIDATION',
    'VERIFICATION',
    'REVIEW',
    'PROGRESS',
    'RETROSPECTIVE',
  ];
  // Phase-command-owned kinds (artifactName is their write path). RETROSPECTIVE
  // is excluded from the linear contract — ship owns it via deriveRetroPath /
  // milestone scoping, not artifactName.
  const PHASE_OWNED_LINEAR = ['RESEARCH', 'PLAN', 'VALIDATION', 'VERIFICATION', 'REVIEW', 'PROGRESS'];

  describe('epic mode → {EpicID}-{artifact}.md (all 8 kinds)', () => {
    for (const k of KINDS) {
      it(`${k} → M4.5.E99-${k}.md`, () => {
        expect(artifactName(k, { currentEpic: 'M4.5.E99' })).toBe(`M4.5.E99-${k}.md`);
      });
    }
    it('RETROSPECTIVE agrees with deriveRetroPath (single source of truth, no divergence)', () => {
      // basename of deriveRetroPath must equal artifactName — pins the invariant
      // the advisor flagged: retro naming has ONE owner in Epic mode.
      const full = deriveRetroPath('M4.5.E99'); // .planning/M4.5.E99-RETROSPECTIVE.md
      expect(`.planning/${artifactName('RETROSPECTIVE', { currentEpic: 'M4.5.E99' })}`).toBe(full);
    });
  });

  describe('linear mode', () => {
    it('REQUIREMENTS is unprefixed — REQUIREMENTS.md (matches discuss.md write path, FR4 byte-identity)', () => {
      expect(artifactName('REQUIREMENTS', { currentEpic: null })).toBe('REQUIREMENTS.md');
    });
    for (const k of PHASE_OWNED_LINEAR) {
      it(`${k} → 1-${k}.md (numeric prefix)`, () => {
        expect(artifactName(k, { currentEpic: null })).toBe(`1-${k}.md`);
      });
    }
  });

  describe('fail-open: non-strict currentEpic falls back to linear naming (never Epic-names garbage)', () => {
    for (const bad of ['v0.1.6', '', '   ', '../x', 'garbage', 'M4.5', undefined]) {
      it(`${JSON.stringify(bad)} → 1-PLAN.md`, () => {
        expect(artifactName('PLAN', { currentEpic: bad })).toBe('1-PLAN.md');
      });
    }
    it('no opts at all → linear', () => {
      expect(artifactName('PLAN')).toBe('1-PLAN.md');
    });
  });

  describe('write→read round-trip (artifactName output resolves via resolveArtifactPath)', () => {
    let baseDir;
    let planning;
    beforeEach(async () => {
      baseDir = await mkdtemp(join(tmpdir(), 'signal-e11-s2t1-'));
      planning = join(baseDir, '.planning');
      await mkdir(planning, { recursive: true });
    });
    afterEach(async () => {
      await rm(baseDir, { recursive: true, force: true });
    });

    it('epic mode: every one of the 8 kinds round-trips', async () => {
      const epic = 'M4.5.E99';
      for (const k of KINDS) {
        const name = artifactName(k, { currentEpic: epic });
        await writeFile(join(planning, name), 'x', 'utf-8');
        const resolved = resolveArtifactPath(planning, k, { currentEpic: epic, phase: k });
        expect(resolved).toBe(join(planning, name));
      }
    });

    it('linear mode: REQUIREMENTS + the 6 phase-owned kinds round-trip', async () => {
      for (const k of ['REQUIREMENTS', ...PHASE_OWNED_LINEAR]) {
        const name = artifactName(k, { currentEpic: null });
        await writeFile(join(planning, name), 'x', 'utf-8');
        const resolved = resolveArtifactPath(planning, k, { currentEpic: null, phase: k });
        expect(resolved).toBe(join(planning, name));
      }
    });
  });
});

// ---- S3.t1 — readEffectiveProfile (Epic PROFILE shadows project PROFILE) ----
const PROJECT_FULL_PROFILE = `---
tier: FULL
schema_version: 1

calibration:
  scope: product
  stakes: major
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
  created_at: 2026-07-15T00:00:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Project profile
`;

const EPIC_SKETCH_PROFILE = `---
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
  created_at: 2026-07-15T01:00:00Z
  created_by: sig:calibrate
  escalation_history: []
---

# Epic profile (this Epic is honestly a SKETCH inside a FULL project)
`;

describe('S3.t1 readEffectiveProfile', () => {
  let baseDir;
  let planning;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e11-s3t1-'));
    planning = join(baseDir, '.planning');
    await mkdir(planning, { recursive: true });
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  const writeProject = () => writeFile(join(planning, 'PROFILE.md'), PROJECT_FULL_PROFILE, 'utf-8');
  const writeEpic = (id, body = EPIC_SKETCH_PROFILE) =>
    writeFile(join(planning, `${id}-PROFILE.md`), body, 'utf-8');

  it('no currentEpic → project PROFILE (byte-identical to readProfile, R7 golden)', async () => {
    await writeProject();
    const eff = await readEffectiveProfile(baseDir, {});
    const proj = await readProfile(baseDir);
    expect(eff).toEqual(proj);
    expect(eff.tier).toBe('FULL');
  });

  it('valid currentEpic + Epic PROFILE exists → Epic PROFILE shadows project', async () => {
    await writeProject();
    await writeEpic('M4.5.E99');
    const eff = await readEffectiveProfile(baseDir, { currentEpic: 'M4.5.E99' });
    expect(eff.tier).toBe('SKETCH'); // Epic wins
    // ...and the project PROFILE is untouched / still readable as FULL.
    expect((await readProfile(baseDir)).tier).toBe('FULL');
  });

  it('valid currentEpic + NO Epic PROFILE → falls back to project PROFILE', async () => {
    await writeProject(); // no M4.5.E99-PROFILE.md written
    const eff = await readEffectiveProfile(baseDir, { currentEpic: 'M4.5.E99' });
    expect(eff.tier).toBe('FULL');
  });

  it.each(['v0.1.6', '', '   ', 'garbage', 'M4.5'])(
    'fail-open: non-strict currentEpic %j SKIPS the Epic probe → project PROFILE (never throws on the STATE value)',
    async (bad) => {
      await writeProject();
      const eff = await readEffectiveProfile(baseDir, { currentEpic: bad });
      expect(eff.tier).toBe('FULL');
    },
  );

  it('malformed Epic PROFILE *content* (file exists) → ProfileSchemaError (distinct from a missing file)', async () => {
    await writeProject();
    await writeEpic('M4.5.E99', '---\ntier: NONSENSE\nschema_version: 1\n---\n');
    await expect(readEffectiveProfile(baseDir, { currentEpic: 'M4.5.E99' })).rejects.toBeInstanceOf(
      ProfileSchemaError,
    );
  });

  it('neither Epic nor project PROFILE exists → ProfileSchemaError (byte-identical not-found halt)', async () => {
    // No PROFILE.md at all; the command halt message must stay unchanged.
    await expect(readEffectiveProfile(baseDir, { currentEpic: 'M4.5.E99' })).rejects.toBeInstanceOf(
      ProfileSchemaError,
    );
    // fall-through path is readProfile(baseDir) — same error a linear command sees.
    await expect(readEffectiveProfile(baseDir, {})).rejects.toThrow(/not found/i);
  });
});

// ---- S2.t3 — Epic-mode golden fixture (the {EpicID}-PLAN.md resolve anchor) ----
describe('S2.t3 Epic-mode golden fixture', () => {
  const epicBase = join(__dirname, 'fixtures', 'epic-native', 'epic');
  const epicPlanning = join(epicBase, '.planning');

  it('the fixture is genuinely Epic mode (detectMode → epic)', async () => {
    const state = await readState(epicBase);
    expect(state.current_epic).toBe('M4.5.E99');
    expect(detectMode(state)).toBe('epic');
  });

  it('resolves the Epic-scoped M4.5.E99-PLAN.md (pattern 0), NOT null — no "artifact not found"', () => {
    const p = resolveArtifactPath(epicPlanning, 'PLAN', { currentEpic: 'M4.5.E99', phase: 'PLAN' });
    expect(p).not.toBeNull(); // the FR1 papercut this Epic fixes
    expect(p).toMatch(/M4\.5\.E99-PLAN\.md$/);
  });

  it('write→read symmetry against a real fixture: artifactName names exactly what the resolver finds', () => {
    const name = artifactName('PLAN', { currentEpic: 'M4.5.E99' });
    const resolved = resolveArtifactPath(epicPlanning, 'PLAN', { currentEpic: 'M4.5.E99', phase: 'PLAN' });
    expect(resolved).toBe(join(epicPlanning, name));
  });
});

// ---- S3.t3 — effective-tier provenance (shadowing is never silent) ----
describe('S3.t3 formatTierLine', () => {
  it('Epic override with a DIFFERENT tier → shows provenance', () => {
    expect(
      formatTierLine({ effectiveTier: 'SKETCH', projectTier: 'FULL', currentEpic: 'M4.5.E11' }),
    ).toBe('SKETCH (Epic M4.5.E11 override; project default FULL)');
  });

  it('no active Epic → bare tier (linear, unchanged)', () => {
    expect(formatTierLine({ effectiveTier: 'FULL', projectTier: 'FULL', currentEpic: null })).toBe(
      'FULL',
    );
  });

  it('Epic active but SAME tier → bare tier (no override noise)', () => {
    expect(
      formatTierLine({ effectiveTier: 'FULL', projectTier: 'FULL', currentEpic: 'M4.5.E11' }),
    ).toBe('FULL');
  });

  it.each(['v0.1.6', '', '   ', 'garbage'])(
    'non-strict currentEpic %j → bare tier (no phantom override)',
    (bad) => {
      expect(formatTierLine({ effectiveTier: 'SKETCH', projectTier: 'FULL', currentEpic: bad })).toBe(
        'SKETCH',
      );
    },
  );

  it('no projectTier context → bare effective tier', () => {
    expect(formatTierLine({ effectiveTier: 'SKETCH', currentEpic: 'M4.5.E11' })).toBe('SKETCH');
  });
});

describe('S3.t3 renderResumeBriefing surfaces the override in the Tier line', () => {
  const state = {
    phase: 'EXECUTE',
    current_epic: 'M4.5.E11',
    completed_phases: ['DISCUSS', 'PLAN'],
  };

  it('Epic-override briefing shows the provenance', () => {
    const out = renderResumeBriefing({
      cwd: '/tmp/proj',
      state,
      profile: { tier: 'SKETCH' }, // effective (Epic) profile
      projectTier: 'FULL', // project default
    });
    expect(out).toContain('Tier:    SKETCH (Epic M4.5.E11 override; project default FULL)');
  });

  it('linear briefing (no projectTier / no Epic) shows the bare tier — back-compat', () => {
    const out = renderResumeBriefing({
      cwd: '/tmp/proj',
      state: { phase: 'EXECUTE', current_epic: null, completed_phases: [] },
      profile: { tier: 'FULL' },
    });
    expect(out).toContain('Tier:    FULL');
    expect(out).not.toContain('override');
  });
});

// ---- S4.t2 — end-to-end bootstrap: mode + name + profile-precedence vs disk ----
// The bootstrap-as-evidence AC (S4.t1) proven mechanically: open an Epic through
// the real write-half (setCurrentEpic — zero hand-edited STATE), then drive the
// whole read side (detectMode → readEffectiveProfile → artifactName ↔
// resolveArtifactPath → formatTierLine) against a real .planning/ on disk.
describe('S4.t2 end-to-end Epic-native chain (against disk)', () => {
  let baseDir;
  let planning;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-e11-s4t2-'));
    planning = join(baseDir, '.planning');
    await mkdir(planning, { recursive: true });
    // Project calibrated FULL; the Epic honestly a SKETCH.
    await writeFile(join(planning, 'PROFILE.md'), PROJECT_FULL_PROFILE, 'utf-8');
    await writeFile(join(planning, 'M4.5.E77-PROFILE.md'), EPIC_SKETCH_PROFILE, 'utf-8');
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('opens the Epic via the write-half, then the full read chain agrees', async () => {
    // 1. Open the Epic with the real write-half — no hand-edited STATE.
    await initState(baseDir, 'EXECUTE');
    await setCurrentEpic(baseDir, 'M4.5.E77');
    const state = await readState(baseDir);
    expect(state.current_epic).toBe('M4.5.E77');

    // 2. Mode detection off the persisted STATE.
    expect(detectMode(state)).toBe('epic');

    // 3. Per-Epic calibration: the Epic PROFILE shadows the project PROFILE.
    const effective = await readEffectiveProfile(baseDir, { currentEpic: state.current_epic });
    const project = await readProfile(baseDir);
    expect(effective.tier).toBe('SKETCH');
    expect(project.tier).toBe('FULL'); // untouched

    // 4. Provenance is surfaced, never silent.
    expect(
      formatTierLine({
        effectiveTier: effective.tier,
        projectTier: project.tier,
        currentEpic: state.current_epic,
      }),
    ).toBe('SKETCH (Epic M4.5.E77 override; project default FULL)');

    // 5. Write→read round-trip for every phase artifact this Epic would produce,
    //    against real files: artifactName names it, resolveArtifactPath finds it.
    for (const kind of ['RESEARCH', 'REQUIREMENTS', 'PLAN', 'VALIDATION', 'VERIFICATION', 'REVIEW', 'PROGRESS']) {
      const name = artifactName(kind, { currentEpic: state.current_epic });
      expect(name).toBe(`M4.5.E77-${kind}.md`);
      await writeFile(join(planning, name), `# ${kind}`, 'utf-8');
      const resolved = resolveArtifactPath(planning, kind, {
        currentEpic: state.current_epic,
        phase: kind,
      });
      expect(resolved).toBe(join(planning, name));
    }
  });

  it('rolling to the next Epic re-points the whole chain (no stale carry-over)', async () => {
    await initState(baseDir, 'EXECUTE');
    await setCurrentEpic(baseDir, 'M4.5.E77');
    await setCurrentEpic(baseDir, 'M4.5.E78'); // roll — no Epic PROFILE for E78
    const state = await readState(baseDir);
    expect(state.current_epic).toBe('M4.5.E78');
    // No M4.5.E78-PROFILE.md → falls back to the project tier (FULL).
    const effective = await readEffectiveProfile(baseDir, { currentEpic: state.current_epic });
    expect(effective.tier).toBe('FULL');
    // Artifact naming follows the new Epic.
    expect(artifactName('PLAN', { currentEpic: state.current_epic })).toBe('M4.5.E78-PLAN.md');
  });
});
