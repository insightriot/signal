import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  HEAL,
  STATUS,
  runDriftChecks,
  checkEpicWithoutRetro,
  checkBaselineCommitOffHistory,
  checkProfilesParse,
} from '../tools/lib/state-drift.js';
import { markFresh } from '../tools/lib/state.js';

/**
 * M5.E16 S2 — the three checks that work everywhere.
 *
 * (c), (d) and (g) were sequenced first because the PLAN-time probe measured
 * them as fully general — (c) and (g) evaluate 12/12 real projects, (d)
 * evaluates 8/8 — and each already had a LIVE true positive to test against,
 * rather than only a fixture:
 *
 *   (c) M5.E17 shipped with no retrospective, in this repo
 *   (d) cm-mentor-coach's baseline commit is reachable from no ref at all
 *   (g) B59 — Signal's own Epic profile carried two out-of-enum values
 *
 * `nyquist_enforcement: strict` means each check needs BOTH fixtures: red on
 * real drift, silent on a clean project. Precision is the deliverable.
 */

const STATE = (over = {}) => {
  const fm = {
    schema_version: 1,
    phase: 'PLAN',
    current_epic: 'M5.E16',
    current_wave: null,
    current_tasks: '[]',
    completed_phases: '[]',
    blockers: '[]',
    last_completed_task: null,
    last_updated_commit: "'abc1234'",
    last_updated: '2026-08-02T00:00:00.000Z',
    ...over,
  };
  const body = Object.entries(fm).map(([k, v]) => `${k}: ${v === null ? 'null' : v}`).join('\n');
  return `---\n${body}\n---\n# Project State\n\nM5.E16 is in PLAN.\n`;
};

const VALID_PROFILE = `---
tier: FEATURE
schema_version: 1

calibration:
  scope: feature
  stakes: minor
  novelty: familiar
  reversibility: trivial
  horizon: years

phases_skipped: []

rigor_overrides:
  tdd_required: true
  security_audit: none
  performance_pass: false
  simplification_pass: true
  nyquist_enforcement: strict
  plan_validation_dims: core
  research_parallelism: 0
  gate_strictness: light
  context_rot_reread: false
  review_depth: quality-only

metadata:
  created_at: 2026-08-01T00:00:00Z
  created_by: hand
  escalation_history: []
---
`;

// B59's exact shape: TWO out-of-enum values. `moderate` is valid for
// `reversibility` but not `stakes`; `easy` is valid nowhere.
const B59_PROFILE = VALID_PROFILE
  .replace('stakes: minor', 'stakes: moderate')
  .replace('reversibility: trivial', 'reversibility: easy');

async function makeProject(files = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sig-s2-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, '.planning', name), content);
  }
  return dir;
}

const git = (dir, ...args) =>
  execFileSync('git', args, {
    cwd: dir,
    encoding: 'utf-8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@e', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@e' },
  }).trim();

async function statusOf(dir, check) {
  const { results } = await runDriftChecks(dir, [check]);
  return results[0];
}

// ───────────────────────────── (c) ─────────────────────────────

describe('M5.E16 S2.t1 — (c) an Epic was worked and never retrospected', () => {
  it('RED: fires on an Epic with a PLAN and no retrospective', async () => {
    const dir = await makeProject({
      'STATE.md': STATE(),
      'M5.E17-PLAN.md': '# plan',
      'M5.E17-REQUIREMENTS.md': '# reqs',
      // The project must USE retrospectives for the check to apply at all —
      // otherwise it is a convention difference, not drift (C1 fix).
      'M5.E13-PLAN.md': '# plan',
      'M5.E13-RETROSPECTIVE.md': '# retro',
    });
    try {
      const r = await statusOf(dir, checkEpicWithoutRetro);
      expect(r.status).toBe(STATUS.FINDINGS);
      expect(r.findings[0].message).toMatch(/M5\.E17/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('GREEN: silent when the Epic has a retrospective', async () => {
    const dir = await makeProject({
      'STATE.md': STATE(),
      'M5.E17-PLAN.md': '# plan',
      'M5.E17-RETROSPECTIVE.md': '# retro',
    });
    try {
      expect((await statusOf(dir, checkEpicWithoutRetro)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('GREEN: the CURRENT Epic is mid-flight, not un-retrospected', async () => {
    const dir = await makeProject({
      'STATE.md': STATE(),
      'M5.E16-PLAN.md': '# plan',
      'M5.E13-PLAN.md': '# plan',
      'M5.E13-RETROSPECTIVE.md': '# retro',
    });
    try {
      expect((await statusOf(dir, checkEpicWithoutRetro)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('GREEN: requirements alone are not "worked" — an Epic can be opened and parked', async () => {
    // DISCUSS-only artifacts mean the Epic was scoped, not executed. Firing here
    // would manufacture a chore for every parked idea, which is FR2's failure.
    const dir = await makeProject({
      'STATE.md': STATE(),
      'M5.E14-REQUIREMENTS.md': '# reqs',
      'M5.E13-PLAN.md': '# plan',
      'M5.E13-RETROSPECTIVE.md': '# retro',
    });
    try {
      expect((await statusOf(dir, checkEpicWithoutRetro)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('needs a person — nobody else knows whether the Epic was finished or abandoned', () => {
    expect(checkEpicWithoutRetro.healCategory).toBe(HEAL.NEEDS_A_PERSON);
  });
});

describe('M5.E16 C1 (REVIEW) — (c) must not report clean on a project it cannot see', () => {
  // The Critical found at REVIEW. `checkEpicWithoutRetro` declared
  // `applicability: () => EVAL` unconditionally while keying detection to a
  // STRICT M{n}.E{n} filename. traction-engine names artifacts PHASE10-PLAN.md:
  // 19 phase artifacts, 0 retrospectives, and the check reported CLEAN.
  //
  // That is the collapse this module's own header says it exists to make
  // impossible. These fixtures use traction-engine's real naming.

  it('RED: a non-strict prefix with no retro anywhere is NOT reported clean', async () => {
    const dir = await makeProject({
      'STATE.md': STATE({ current_epic: 'PHASE12' }),
      'PHASE10-PLAN.md': '# plan',
      'PHASE10-REVIEW.md': '# review',
      'PHASE11-VERIFICATION.md': '# verification',
    });
    try {
      const r = await statusOf(dir, checkEpicWithoutRetro);
      expect(r.status).not.toBe(STATUS.CLEAN);
      expect(r.status).toBe(STATUS.NOT_APPLICABLE);
      expect(r.reason).toMatch(/retrospective/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a non-strict prefix IS seen once the project uses retrospectives at all', async () => {
    // The project has the convention; one unit is missing its retro. That is
    // real drift, and the prefix shape must not hide it.
    const dir = await makeProject({
      'STATE.md': STATE({ current_epic: 'PHASE12' }),
      'PHASE10-PLAN.md': '# plan',
      'PHASE10-RETROSPECTIVE.md': '# retro',
      'PHASE11-PLAN.md': '# plan',
    });
    try {
      const r = await statusOf(dir, checkEpicWithoutRetro);
      expect(r.status).toBe(STATUS.FINDINGS);
      expect(r.findings.map((f) => f.message).join()).toMatch(/PHASE11/);
      expect(r.findings.map((f) => f.message).join()).not.toMatch(/PHASE10/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a project with no retrospectives at all is not-applicable, never clean', async () => {
    // A project that does not use retrospectives has a DIFFERENT CONVENTION,
    // not drift. Flagging all 19 would be telling them their process is wrong.
    // This is a structural narrowing — a categorical property of the project —
    // not a threshold, which FR2.2 forbids.
    const dir = await makeProject({
      'STATE.md': STATE(),
      'M5.E17-PLAN.md': '# plan',
    });
    try {
      const r = await statusOf(dir, checkEpicWithoutRetro);
      expect(r.status).toBe(STATUS.NOT_APPLICABLE);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a phase-named prefix is not a unit of work — conversor has EXECUTE-PROGRESS.md', async () => {
    // `resolveArtifactPath` pattern 3 is the literal-substitution form
    // `{PHASE}-{ARTIFACT}.md`, so a linear-mode project legitimately has
    // EXECUTE-PROGRESS.md. Broadening the prefix for C1 made that read as an
    // un-retrospected unit named "EXECUTE". Found by RE-MEASURING the corpus
    // after the fix, not by reasoning about it.
    const dir = await makeProject({
      'STATE.md': STATE({ current_epic: null }),
      'EXECUTE-PROGRESS.md': '# progress',
      'PLAN-PLAN.md': '# plan',
      'M2.9.E1-PLAN.md': '# plan',
      'M2.9.E1-RETROSPECTIVE.md': '# retro',
    });
    try {
      const r = await statusOf(dir, checkEpicWithoutRetro);
      expect(r.status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('the real traction-engine is not-applicable, not clean', async () => {
    const dir = '/Users/macstudio/dev-biz/traction-engine';
    if (!existsSync(dir)) return; // corpus not on this machine
    const r = await statusOf(dir, checkEpicWithoutRetro);
    expect(r.status).not.toBe(STATUS.CLEAN);
  });
});

// ───────────────────────────── (d) ─────────────────────────────

describe('M5.E16 S2.t2 — (d) the STATE baseline commit is not in this history', () => {
  async function makeRepo(lastUpdatedCommit) {
    const dir = await mkdtemp(join(tmpdir(), 'sig-s2-git-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
    git(dir, 'init', '-q', '-b', 'main');
    await writeFile(join(dir, 'f.txt'), 'one');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'one');
    const head = git(dir, 'rev-parse', '--short', 'HEAD');
    await writeFile(join(dir, '.planning', 'STATE.md'), STATE({ last_updated_commit: `'${lastUpdatedCommit ?? head}'` }));
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'state');
    return dir;
  }

  it('RED: fires when the baseline is a real commit on no branch', async () => {
    const dir = await makeRepo();
    try {
      // Create a commit, then reset away from it — the object survives, but no
      // ref reaches it. This is cm-mentor-coach's exact situation.
      const base = git(dir, 'rev-parse', 'HEAD');
      await writeFile(join(dir, 'f.txt'), 'orphan');
      git(dir, 'add', '-A');
      git(dir, 'commit', '-q', '-m', 'orphan');
      const orphan = git(dir, 'rev-parse', '--short', 'HEAD');
      git(dir, 'reset', '-q', '--hard', base);
      // QUOTED. Unquoted, a numeric-looking short sha is type-coerced by the YAML
      // reader — `0012345` -> 12345, `1e23456` -> Infinity — which made this test
      // flake at ~1-in-10. Signal's own writer quotes these correctly; only this
      // hand-written fixture did not. (M5.E16 REVIEW loop.)
      await writeFile(join(dir, '.planning', 'STATE.md'), STATE({ last_updated_commit: `'${orphan}'` }));

      const r = await statusOf(dir, checkBaselineCommitOffHistory);
      expect(r.status).toBe(STATUS.FINDINGS);
      expect(r.findings[0].message).toMatch(new RegExp(orphan));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('GREEN: silent when the baseline is an ancestor of HEAD', async () => {
    const dir = await makeRepo();
    try {
      expect((await statusOf(dir, checkBaselineCommitOffHistory)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('not-applicable outside a git repo — absence of git is not drift', async () => {
    const dir = await makeProject({ 'STATE.md': STATE() });
    try {
      expect((await statusOf(dir, checkBaselineCommitOffHistory)).status).toBe(STATUS.NOT_APPLICABLE);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('THE PROMISE COMES TRUE: a markFresh clears the finding, unaided', async () => {
    // (d) is category 1 — it tells the user this clears itself. S1.t5 requires
    // that promise be exercised, not asserted. This is the exercise.
    const dir = await makeRepo();
    try {
      const base = git(dir, 'rev-parse', 'HEAD');
      await writeFile(join(dir, 'f.txt'), 'orphan');
      git(dir, 'add', '-A');
      git(dir, 'commit', '-q', '-m', 'orphan');
      const orphan = git(dir, 'rev-parse', '--short', 'HEAD');
      git(dir, 'reset', '-q', '--hard', base);
      // QUOTED. Unquoted, a numeric-looking short sha is type-coerced by the YAML
      // reader — `0012345` -> 12345, `1e23456` -> Infinity — which made this test
      // flake at ~1-in-10. Signal's own writer quotes these correctly; only this
      // hand-written fixture did not. (M5.E16 REVIEW loop.)
      await writeFile(join(dir, '.planning', 'STATE.md'), STATE({ last_updated_commit: `'${orphan}'` }));

      expect((await statusOf(dir, checkBaselineCommitOffHistory)).status).toBe(STATUS.FINDINGS);

      await markFresh(dir, { commit: git(dir, 'rev-parse', '--short', 'HEAD') });

      expect((await statusOf(dir, checkBaselineCommitOffHistory)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('is self-healing and names what heals it', () => {
    expect(checkBaselineCommitOffHistory.healCategory).toBe(HEAL.SELF_HEALING);
    expect(checkBaselineCommitOffHistory.healMechanism).toBeTruthy();
  });
});

// ───────────────────────────── (g) ─────────────────────────────

describe('M5.E16 S2.t3 — (g) a PROFILE.md the code cannot read', () => {
  it('RED: fires on B59\'s file and reports BOTH bad fields, not just the first', async () => {
    // Validation short-circuits. A fix driven by the error message alone repairs
    // one of two and leaves the profile still unloadable — which is precisely
    // what happened when B59 was found.
    const dir = await makeProject({ 'STATE.md': STATE(), 'M5.E16-PROFILE.md': B59_PROFILE });
    try {
      const r = await statusOf(dir, checkProfilesParse);
      expect(r.status).toBe(STATUS.FINDINGS);
      const text = r.findings.map((f) => f.message).join('\n');
      expect(text).toMatch(/stakes/);
      expect(text).toMatch(/reversibility/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('GREEN: silent on a project whose profiles all load', async () => {
    const dir = await makeProject({
      'STATE.md': STATE(),
      'PROFILE.md': VALID_PROFILE,
      'M5.E16-PROFILE.md': VALID_PROFILE,
    });
    try {
      expect((await statusOf(dir, checkProfilesParse)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('checks the project PROFILE too, not only Epic-scoped ones', async () => {
    const dir = await makeProject({ 'STATE.md': STATE(), 'PROFILE.md': B59_PROFILE });
    try {
      const r = await statusOf(dir, checkProfilesParse);
      expect(r.status).toBe(STATUS.FINDINGS);
      expect(r.findings.some((f) => f.file.endsWith('PROFILE.md'))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('not-applicable when the project has no PROFILE at all — uncalibrated is not drift', async () => {
    const dir = await makeProject({ 'STATE.md': STATE() });
    try {
      expect((await statusOf(dir, checkProfilesParse)).status).toBe(STATUS.NOT_APPLICABLE);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('needs a person — only the author knows whether they meant minor or major', () => {
    expect(checkProfilesParse.healCategory).toBe(HEAL.NEEDS_A_PERSON);
  });
});

// ─────────────────────── live corpus regression ───────────────────────

describe('M5.E16 S2 — the live true positives that motivated each check', () => {
  it('(c) still fires on this repo: M5.E17 was worked and has no retrospective', async () => {
    const repo = join(import.meta.dirname, '..');
    const r = await statusOf(repo, checkEpicWithoutRetro);
    // If someone writes M5.E17-RETROSPECTIVE.md this flips to CLEAN, which is
    // the correct outcome — the assertion is that the check RAN, not that the
    // repo stays broken.
    expect([STATUS.FINDINGS, STATUS.CLEAN]).toContain(r.status);
    if (r.status === STATUS.FINDINGS) {
      expect(r.findings.some((f) => f.message.includes('M5.E17'))).toBe(true);
    }
  });

  it('(g) is clean on this repo — B59 is fixed and stays fixed', async () => {
    const repo = join(import.meta.dirname, '..');
    expect((await statusOf(repo, checkProfilesParse)).status).toBe(STATUS.CLEAN);
  });
});
