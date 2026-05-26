// Tests for renderResumeBriefing + handleOrphansAtResume (M4.5.E6.S4.t1-t3).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  renderResumeBriefing,
  handleOrphansAtResume,
} from '../tools/lib/resume.js';
import { readState, setCurrentTask, stringifyFrontmatter } from '../tools/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX_ROOT = join(__dirname, 'fixtures', 'resume');
const STATE_FIX_ROOT = join(__dirname, 'fixtures', 'state');

const FULL_PROFILE = {
  tier: 'FULL',
  rigor_overrides: { gate_strictness: 'strict' },
  phases_skipped: [],
};

async function loadFixtureState(name, tempDir) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await copyFile(
    join(FIX_ROOT, name, '.planning', 'STATE.md'),
    join(tempDir, '.planning', 'STATE.md')
  );
  return readState(tempDir);
}

describe('renderResumeBriefing — base rendering', () => {
  it('renders the standard header (project / tier / phase)', () => {
    const out = renderResumeBriefing({
      cwd: '/home/user/proj',
      profile: FULL_PROFILE,
      state: {
        phase: 'EXECUTE',
        completed_phases: ['CALIBRATE (1)', 'DISCUSS (2)', 'PLAN (3)'],
        current_tasks: [],
      },
    });
    expect(out).toContain('== Project Briefing ==');
    expect(out).toContain('Project: /home/user/proj');
    expect(out).toContain('Tier:    FULL');
    expect(out).toContain('Phase:   EXECUTE');
    expect(out).toContain('(3/7 phases done)');
  });

  it('renders a vision line when visionText is supplied', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: FULL_PROFILE,
      state: { phase: 'PLAN', completed_phases: [], current_tasks: [] },
      visionText: 'Calibrated AI coding workflow for solo devs.',
    });
    expect(out).toContain('— Vision —');
    expect(out).toContain('Calibrated AI coding workflow for solo devs.');
  });

  it('skips the Vision section when visionText is empty', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: FULL_PROFILE,
      state: { phase: 'PLAN', completed_phases: [], current_tasks: [] },
    });
    expect(out).not.toContain('— Vision —');
  });

  it('honors phases_skipped in the phase count (skipping REVIEW)', () => {
    const skProfile = { ...FULL_PROFILE, phases_skipped: ['REVIEW'] };
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: skProfile,
      state: { phase: 'PLAN', completed_phases: [], current_tasks: [] },
    });
    // 7 phases - 1 skipped = 6
    expect(out).toContain('(0/6 phases done)');
  });
});

describe('renderResumeBriefing — E6 additions (in-flight, last completed, blockers)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-briefing-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('renders an "In-flight" line for a single current_task', async () => {
    const state = await loadFixtureState('in-flight', tempDir);
    const out = renderResumeBriefing({
      cwd: tempDir,
      profile: FULL_PROFILE,
      state,
    });
    expect(out).toContain('— In-flight (1) —');
    expect(out).toContain('M4.5.E6.S4.t3');
  });

  it('renders multiple current_tasks comma-separated (wave parallelism)', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: FULL_PROFILE,
      state: {
        phase: 'EXECUTE',
        completed_phases: [],
        current_tasks: [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
      },
    });
    expect(out).toContain('— In-flight (3) —');
    expect(out).toContain('A, B, C');
  });

  it('renders "Last completed" with short commit sha', async () => {
    const state = await loadFixtureState('in-flight', tempDir);
    const out = renderResumeBriefing({
      cwd: tempDir,
      profile: FULL_PROFILE,
      state,
    });
    expect(out).toContain('— Last completed —');
    expect(out).toContain('M4.5.E6.S4.t2 (done)');
    expect(out).toContain('sha-prio'); // first 8 chars of 'sha-prior-002'
  });

  it('renders blockers with text + id + age', async () => {
    const state = await loadFixtureState('orphan', tempDir);
    const out = renderResumeBriefing({
      cwd: tempDir,
      profile: FULL_PROFILE,
      state,
    });
    expect(out).toContain('— Blockers (1) —');
    expect(out).toContain('Marketplace install hangs on first run');
    expect(out).toContain('blk-abcd');
    expect(out).toMatch(/raised \d+[mhd] ago/);
  });
});

describe('renderResumeBriefing — locked decisions + open questions', () => {
  it('renders first-5 locked decisions and notes how many more exist', () => {
    const decisions = Array.from({ length: 8 }, (_, i) => `Decision #${i + 1}`);
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: FULL_PROFILE,
      state: { phase: 'EXECUTE', completed_phases: [], current_tasks: [] },
      lockedDecisions: decisions,
    });
    expect(out).toContain('1. Decision #1');
    expect(out).toContain('5. Decision #5');
    expect(out).not.toContain('6. Decision #6');
    expect(out).toContain('...and 3 more');
  });

  it('omits "...and N more" when ≤5 decisions exist', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: FULL_PROFILE,
      state: { phase: 'EXECUTE', completed_phases: [], current_tasks: [] },
      lockedDecisions: ['Only one'],
    });
    expect(out).toContain('1. Only one');
    expect(out).not.toMatch(/and \d+ more/);
  });

  it('renders first-3 open questions when supplied', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: FULL_PROFILE,
      state: { phase: 'EXECUTE', completed_phases: [], current_tasks: [] },
      openQuestions: ['Q1', 'Q2', 'Q3', 'Q4'],
    });
    expect(out).toContain('— Open questions (4) —');
    expect(out).toContain('Q1');
    expect(out).toContain('Q3');
    expect(out).not.toContain('Q4');
  });
});

describe('renderResumeBriefing — staleness banner (S4.t2)', () => {
  it('prepends a banner when isStaleResult.stale is true', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: FULL_PROFILE,
      state: { phase: 'EXECUTE', completed_phases: [], current_tasks: [] },
      isStaleResult: { stale: true, commitCount: 7 },
    });
    expect(out.startsWith('⚠')).toBe(true);
    expect(out).toMatch(/7 commits behind/);
    expect(out).toMatch(/\/sig:checkpoint/);
  });

  it('uses singular "commit" when commitCount === 1', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: FULL_PROFILE,
      state: { phase: 'EXECUTE', completed_phases: [], current_tasks: [] },
      isStaleResult: { stale: true, commitCount: 1 },
    });
    expect(out).toMatch(/1 commit behind/);
    expect(out).not.toMatch(/1 commits/);
  });

  it('omits the banner entirely when isStaleResult.stale is false', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: FULL_PROFILE,
      state: { phase: 'EXECUTE', completed_phases: [], current_tasks: [] },
      isStaleResult: { stale: false, commitCount: 0 },
    });
    expect(out).not.toContain('⚠');
    expect(out.startsWith('== Project Briefing ==')).toBe(true);
  });
});

describe('renderResumeBriefing — brownfield/landscape line', () => {
  it('renders the Landscape line when landscapeCapturedOn is supplied', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: FULL_PROFILE,
      state: { phase: 'EXECUTE', completed_phases: [], current_tasks: [] },
      landscapeCapturedOn: '2026-04-26',
    });
    expect(out).toContain('Landscape: captured 2026-04-26 (brownfield init)');
  });

  it('omits the Landscape line when not supplied (greenfield)', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: FULL_PROFILE,
      state: { phase: 'EXECUTE', completed_phases: [], current_tasks: [] },
    });
    expect(out).not.toContain('Landscape:');
  });
});

describe('renderResumeBriefing — retro completeness line (M4.5.E9.S2.t7)', () => {
  const baseProfile = { tier: 'FULL', phases_skipped: [] };
  const baseState = { phase: 'EXECUTE', completed_phases: [], current_tasks: [] };

  it('renders "N/M complete (X stubs)" when retros exist with stubs', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: baseProfile,
      state: baseState,
      retroSummary: { total: 6, complete: 1, stub: 5 },
    });
    expect(out).toMatch(/Retros:\s+1\/6 complete \(5 stubs awaiting backfill\)/);
  });

  it('renders "N/M complete" with no suffix when all retros complete', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: baseProfile,
      state: baseState,
      retroSummary: { total: 3, complete: 3, stub: 0 },
    });
    expect(out).toMatch(/Retros:\s+3\/3 complete$/m);
  });

  it("renders 0/0 with helpful prose when no retros exist", () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: baseProfile,
      state: baseState,
      retroSummary: { total: 0, complete: 0, stub: 0 },
    });
    expect(out).toMatch(/Retros:\s+0\/0/);
    expect(out).toMatch(/no retros yet/i);
  });

  it("omits the Retros line entirely when retroSummary is null (backwards compat)", () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: baseProfile,
      state: baseState,
    });
    expect(out).not.toMatch(/Retros:/);
  });

  it('singularizes "stub" when exactly one stub remains', () => {
    const out = renderResumeBriefing({
      cwd: '/p',
      profile: baseProfile,
      state: baseState,
      retroSummary: { total: 5, complete: 4, stub: 1 },
    });
    expect(out).toMatch(/Retros:\s+4\/5 complete \(1 stub awaiting backfill\)/);
  });
});

describe('handleOrphansAtResume (S4.t3)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-resume-orphans-test-'));
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    // Plant schema-v1 STATE.md for state-write calls.
    await copyFile(
      join(STATE_FIX_ROOT, 'schema-v1', '.planning', 'STATE.md'),
      join(tempDir, '.planning', 'STATE.md')
    );
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  function gitOutput(...lines) {
    return Buffer.from(lines.join('\n'));
  }

  it('returns action: "none" when no orphans found', async () => {
    const promptSpy = vi.fn();
    const result = await handleOrphansAtResume(tempDir, {
      execFn: () => gitOutput(),
      prompt: promptSpy,
    });
    expect(result.action).toBe('none');
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('aborts orphans when prompt returns "clear"', async () => {
    const oldStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await setCurrentTask(tempDir, { id: 'T-OLD', startedAt: oldStart });
    const result = await handleOrphansAtResume(tempDir, {
      execFn: () => gitOutput(),
      prompt: async () => 'clear',
    });
    expect(result.action).toBe('cleared');
    const state = await readState(tempDir);
    expect(state.current_tasks).toEqual([]);
    expect(state.last_completed_task).toMatchObject({
      id: 'T-OLD',
      status: 'aborted',
    });
  });

  it('leaves orphans intact when prompt returns "keep"', async () => {
    const oldStart = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await setCurrentTask(tempDir, { id: 'T-OLD', startedAt: oldStart });
    const result = await handleOrphansAtResume(tempDir, {
      execFn: () => gitOutput(),
      prompt: async () => 'keep',
    });
    expect(result.action).toBe('kept');
    const state = await readState(tempDir);
    expect(state.current_tasks.map((t) => t.id)).toEqual(['T-OLD']);
  });
});
