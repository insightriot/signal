import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  HEAL,
  STATUS,
  runDriftChecks,
  checkEpicIdNotStrict,
  checkPhaseBehindArtifacts,
  checkBodyOmitsCurrentEpic,
} from '../plugin/tools/lib/state-drift.js';

/**
 * M5.E16 S3 — the Epic-mode three.
 *
 * These are the checks aimed at the incident that opened the Epic, and the
 * PLAN-time probe measured that they can evaluate 2 of 13 real projects. That
 * number is why (h) ships FIRST: the 2 projects where (h) fires are exactly the
 * 2 where (a) and (b) go blind, so (h) is the check that reports WHY the others
 * cannot see. Without it the silence is doubled; with it, the silence is itself
 * a finding.
 *
 * Evidence quality differs sharply between them, and the tests say so:
 *   (h) two live true positives — eval-project-I "M1", eval-project-C "PHASE12"
 *   (b) red on three real historical commits, green on the one that fixed it
 *   (a) FIXTURE ONLY — zero live hits. The fixture is the sole evidence it works.
 */

const HEADER = (over = {}) => {
  const fm = {
    schema_version: 1,
    phase: 'PLAN',
    current_epic: 'M5.E16',
    current_wave: null,
    current_tasks: '[]',
    completed_phases: '[]',
    blockers: '[]',
    last_completed_task: null,
    last_updated_commit: 'abc1234',
    last_updated: '2026-08-02T00:00:00.000Z',
    ...over,
  };
  return Object.entries(fm).map(([k, v]) => `${k}: ${v === null ? 'null' : v}`).join('\n');
};

const STATE = (over = {}, body = '# Project State\n\nM5.E16 is in PLAN.\n') =>
  `---\n${HEADER(over)}\n---\n${body}`;

async function makeProject(files = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sig-s3-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, '.planning', name), content);
  }
  return dir;
}

async function statusOf(dir, check) {
  const { results } = await runDriftChecks(dir, [check]);
  return results[0];
}

// ───────────────────────────── (h) ─────────────────────────────

describe('M5.E16 S3.t1 — (h) current_epic is set but no resolver accepts it', () => {
  it('RED: fires on eval-project-C\'s real value, "PHASE12"', async () => {
    const dir = await makeProject({ 'STATE.md': STATE({ current_epic: 'PHASE12' }) });
    try {
      const r = await statusOf(dir, checkEpicIdNotStrict);
      expect(r.status).toBe(STATUS.FINDINGS);
      expect(r.findings[0].message).toMatch(/PHASE12/);
      expect(r.findings[0].message).toMatch(/linear/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('RED: fires on eval-project-I\'s real value, "M1" — a milestone, not an Epic', async () => {
    const dir = await makeProject({ 'STATE.md': STATE({ current_epic: 'M1' }) });
    try {
      expect((await statusOf(dir, checkEpicIdNotStrict)).status).toBe(STATUS.FINDINGS);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('GREEN: silent on a strict Epic ID', async () => {
    const dir = await makeProject({ 'STATE.md': STATE({ current_epic: 'M5.E16' }) });
    try {
      expect((await statusOf(dir, checkEpicIdNotStrict)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('not-applicable in linear mode — a null current_epic is a valid shape, not drift', async () => {
    const dir = await makeProject({ 'STATE.md': STATE({ current_epic: null }) });
    try {
      expect((await statusOf(dir, checkEpicIdNotStrict)).status).toBe(STATUS.NOT_APPLICABLE);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ───────────────────────────── (a) ─────────────────────────────

describe('M5.E16 S3.t2 — (a) phase says one thing, the artifacts say a later one', () => {
  it('RED: phase is PLAN while a VERIFICATION artifact exists for the current Epic', async () => {
    const dir = await makeProject({
      'STATE.md': STATE({ phase: 'PLAN', current_epic: 'M5.E16' }),
      'M5.E16-PLAN.md': '# plan',
      'M5.E16-VERIFICATION.md': '# verification',
    });
    try {
      const r = await statusOf(dir, checkPhaseBehindArtifacts);
      expect(r.status).toBe(STATUS.FINDINGS);
      expect(r.findings[0].message).toMatch(/VERIFICATION/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('GREEN: silent when the artifacts stop at the current phase', async () => {
    const dir = await makeProject({
      'STATE.md': STATE({ phase: 'PLAN', current_epic: 'M5.E16' }),
      'M5.E16-REQUIREMENTS.md': '# reqs',
      'M5.E16-PLAN.md': '# plan',
    });
    try {
      expect((await statusOf(dir, checkPhaseBehindArtifacts)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('GREEN: an EARLIER phase artifact is normal — the Epic passed through it', async () => {
    const dir = await makeProject({
      'STATE.md': STATE({ phase: 'REVIEW', current_epic: 'M5.E16' }),
      'M5.E16-PLAN.md': '# plan',
      'M5.E16-VERIFICATION.md': '# verification',
    });
    try {
      expect((await statusOf(dir, checkPhaseBehindArtifacts)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('BLIND, not clean, when phase is prose — this is 5 of 12 real projects', async () => {
    const dir = await makeProject({
      'STATE.md': STATE({ phase: '**PHASE 12 — Exposure-Free Pipeline', current_epic: 'M5.E16' }),
      'M5.E16-VERIFICATION.md': '# verification',
    });
    try {
      const r = await statusOf(dir, checkPhaseBehindArtifacts);
      expect(r.status).toBe(STATUS.CANNOT_EVALUATE);
      expect(r.reason).toMatch(/phase/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('BLIND when current_epic is not a strict ID — (h) is what explains this one', async () => {
    const dir = await makeProject({
      'STATE.md': STATE({ phase: 'PLAN', current_epic: 'PHASE12' }),
    });
    try {
      expect((await statusOf(dir, checkPhaseBehindArtifacts)).status).toBe(STATUS.CANNOT_EVALUATE);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ───────────────────────────── (b) ─────────────────────────────

describe('M5.E16 S3.t3 — (b) the body never mentions the Epic the frontmatter names', () => {
  it('RED: fires when the body names other Epics but not the current one', async () => {
    const dir = await makeProject({
      'STATE.md': STATE(
        { current_epic: 'M5.E17' },
        '# Project State\n\nNext candidates: M5.E15, M5.E16, M5.E10.\n'
      ),
    });
    try {
      const r = await statusOf(dir, checkBodyOmitsCurrentEpic);
      expect(r.status).toBe(STATUS.FINDINGS);
      expect(r.findings[0].message).toMatch(/M5\.E17/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('GREEN: silent when the body names the current Epic', async () => {
    const dir = await makeProject({
      'STATE.md': STATE(
        { current_epic: 'M5.E17' },
        '# Project State\n\nM5.E17 is in PLAN. Next: M5.E15, M5.E16.\n'
      ),
    });
    try {
      expect((await statusOf(dir, checkBodyOmitsCurrentEpic)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('GREEN: a body naming NO Epic at all is a young STATE, not drift', async () => {
    // THE NARROWING, and it is structural rather than a threshold: (b) requires
    // at least one OTHER Epic to be named. FR2.2 forbids tuning a check into
    // silence with a knob; this adds a precondition instead, and the history
    // regression below proves it does not cost the real signal.
    const dir = await makeProject({
      'STATE.md': STATE({ current_epic: 'M5.E17' }, '# Project State\n\nJust started.\n'),
    });
    try {
      expect((await statusOf(dir, checkBodyOmitsCurrentEpic)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('not-applicable in linear mode', async () => {
    const dir = await makeProject({
      'STATE.md': STATE({ current_epic: null }, '# Project State\n\nM5.E15 next.\n'),
    });
    try {
      expect((await statusOf(dir, checkBodyOmitsCurrentEpic)).status).toBe(STATUS.NOT_APPLICABLE);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

// ──────────────── (b) against this repo's real history ────────────────

describe('M5.E16 S3.t3 — (b) regression-pinned to the drift that opened this Epic', () => {
  // The originating incident is IN THIS REPO'S HISTORY: frontmatter read
  // current_epic: M5.E17 while the body listed M5.E15 / M5.E16 / M5.E10 and
  // never named M5.E17. It survived three commits and a release.
  //
  // This is stronger evidence than a fixture — it is the actual file, in the
  // actual state, on the actual dates. If the narrowing is ever loosened or
  // tightened in a way that loses the real signal, this fails.
  const REPO = join(import.meta.dirname, '..');
  const DRIFTED = ['4421105', '137b9ca', '8acd1d2'];
  const REPAIRED = '18741a8';

  // THROWS rather than skips when the history is unreachable.
  //
  // The first draft of this helper returned null on a git failure so a shallow
  // clone would not break the suite — which would have let these four tests pass
  // by never running, in the Epic about detectors that look like coverage and
  // are not. `B58` settled the principle: a guard protecting something real must
  // never pass by being unable to run. CI clones with `fetch-depth: 0`
  // deliberately (see .github/workflows/test.yml), so an unreachable commit here
  // is a real regression — either the history was rewritten or the clone config
  // changed, and both are worth a red suite.
  const stateAt = (sha) => {
    try {
      return execFileSync('git', ['show', `${sha}:.planning/STATE.md`], {
        cwd: REPO, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (err) {
      throw new Error(
        `Cannot read .planning/STATE.md at ${sha}. This regression pins check (b) against ` +
        'the real drift that opened M5.E16, so it must not pass by being unable to run. ' +
        'If the history was rewritten, re-pin the shas; if this is a shallow clone, the ' +
        `workflow's fetch-depth: 0 has regressed. (${err.message})`
      );
    }
  };

  for (const sha of DRIFTED) {
    it(`RED at ${sha} — the real drift, as it was committed`, async () => {
      const dir = await makeProject({ 'STATE.md': stateAt(sha) });
      try {
        const r = await statusOf(dir, checkBodyOmitsCurrentEpic);
        expect(r.status).toBe(STATUS.FINDINGS);
        expect(r.findings[0].message).toMatch(/M5\.E17/);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }

  it(`GREEN at ${REPAIRED} — the commit that repaired it`, async () => {
    const dir = await makeProject({ 'STATE.md': stateAt(REPAIRED) });
    try {
      expect((await statusOf(dir, checkBodyOmitsCurrentEpic)).status).toBe(STATUS.CLEAN);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('M5.E16 S3 — all three interrupt, none of them reassures', () => {
  it('every Epic-mode check needs a person', () => {
    for (const c of [checkEpicIdNotStrict, checkPhaseBehindArtifacts, checkBodyOmitsCurrentEpic]) {
      expect(c.healCategory, c.id).toBe(HEAL.NEEDS_A_PERSON);
    }
  });
});
