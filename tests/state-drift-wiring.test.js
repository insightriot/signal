import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runSweep, renderSweepReport } from '../plugin/tools/lib/sweep.js';
import { renderResumeBriefing } from '../plugin/tools/lib/resume.js';
import { HEAL, STATUS } from '../plugin/tools/lib/state-drift.js';

/**
 * M5.E16 S4 — reachability.
 *
 * FR1.2: a STATE contradiction is not a dead link, so it does not go in the same
 * bucket. FR3 / D-M5E16-2: the findings also surface at `/sig:resume`, because
 * the live incident happened THERE — but only category 3, and only as one line,
 * because the briefing is capped at 50 lines and a briefing that buries its own
 * signal is the problem restated.
 */

const STATE = (over = {}, body = '# Project State\n\nM5.E16 is in PLAN.\n') => {
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
  const head = Object.entries(fm).map(([k, v]) => `${k}: ${v === null ? 'null' : v}`).join('\n');
  return `---\n${head}\n---\n${body}`;
};

async function makeProject(files = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sig-s4-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, '.planning', name), content);
  }
  return dir;
}

describe('M5.E16 S4.t1 — STATE findings get their own group in the sweep report', () => {
  it('a STATE contradiction is not filed under structural or advisory', async () => {
    const dir = await makeProject({
      'STATE.md': STATE({ current_epic: 'M5.E17' }, '# Project State\n\nNext: M5.E15, M5.E16.\n'),
    });
    try {
      const report = await runSweep(dir);
      expect(report.stateDrift).toBeTruthy();

      const hit = report.stateDrift.results.find((r) => r.id === 'body-omits-current-epic');
      expect(hit.status).toBe(STATUS.FINDINGS);

      // It must NOT have leaked into the flat findings list, which is what the
      // structural/advisory groups render from.
      expect(report.findings.some((f) => f.check === 'body-omits-current-epic')).toBe(false);

      const out = renderSweepReport(report);
      expect(out).toMatch(/## STATE vs\. world/);
      expect(out).toMatch(/M5\.E17/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('renders the cannot-evaluate group, distinctly from clean', async () => {
    // STATE.md with frontmatter but no schema_version — readState throws.
    const dir = await makeProject({ 'STATE.md': '---\nphase: EXECUTE\n---\n# s\n' });
    try {
      const out = renderSweepReport(await runSweep(dir));
      expect(out).toMatch(/cannot evaluate/i);
      expect(out).toMatch(/NOT the same as clean/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a healthy project shows the group with nothing in it, not a missing group', async () => {
    const dir = await makeProject({ 'STATE.md': STATE() });
    try {
      const out = renderSweepReport(await runSweep(dir));
      expect(out).toMatch(/## STATE vs\. world/);
      expect(out).toMatch(/needs you \(0\)/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('M5.E16 S4.t2 — determinism (AC1.3)', () => {
  it('two sweeps over unchanged input render byte-identically', async () => {
    const dir = await makeProject({
      'STATE.md': STATE({ current_epic: 'PHASE12' }, '# Project State\n\nM5.E15 next.\n'),
      'M5.E17-PLAN.md': '# plan',
    });
    try {
      const a = renderSweepReport(await runSweep(dir));
      const b = renderSweepReport(await runSweep(dir));
      expect(a).toBe(b);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('the sweep is still read-only with the drift checks wired in (NFR2)', async () => {
    const dir = await makeProject({ 'STATE.md': STATE(), 'PROFILE.md': 'not even a profile' });
    try {
      const { readFile } = await import('node:fs/promises');
      const before = await readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');
      await runSweep(dir);
      expect(await readFile(join(dir, '.planning', 'STATE.md'), 'utf-8')).toBe(before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('M5.E16 S4.t3 — /sig:resume surfaces category 3 only, as one line (D-M5E16-2)', () => {
  const base = {
    cwd: '/tmp/p',
    state: { phase: 'PLAN', current_epic: 'M5.E16', completed_phases: [], current_tasks: [], blockers: [] },
    profile: { tier: 'FEATURE', phases_skipped: [] },
    visionText: 'A thing.',
    nextAction: 'Run /sig:execute',
  };

  it('renders one line for category-3 findings, with a count and a pointer', () => {
    const out = renderResumeBriefing({
      ...base,
      stateDriftResult: {
        summary: { needsAPerson: 2, cannotEvaluate: 0 },
        results: [],
      },
    });
    const hits = out.split('\n').filter((l) => /STATE-vs-world/i.test(l));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatch(/2/);
    expect(hits[0]).toMatch(/sig:sweep/);
  });

  it('says nothing at all when there is nothing a person must act on', () => {
    const out = renderResumeBriefing({
      ...base,
      stateDriftResult: { summary: { needsAPerson: 0, cannotEvaluate: 0 }, results: [] },
    });
    expect(out).not.toMatch(/STATE-vs-world/i);
  });

  it('does NOT surface self-clearing findings — a briefing is no place for reassurance', () => {
    // Category 1 clears itself. Putting it in a 50-line briefing spends the
    // budget on something the user does not need to act on, which is how a
    // detector earns the mute that makes it useless.
    const out = renderResumeBriefing({
      ...base,
      stateDriftResult: {
        summary: { needsAPerson: 0, cannotEvaluate: 0, selfClearing: 3 },
        results: [],
      },
    });
    expect(out).not.toMatch(/STATE-vs-world/i);
  });

  it('mentions cannot-evaluate separately — silence about blindness is the whole bug', () => {
    const out = renderResumeBriefing({
      ...base,
      stateDriftResult: { summary: { needsAPerson: 0, cannotEvaluate: 3 }, results: [] },
    });
    expect(out).toMatch(/could not be checked|cannot evaluate/i);
  });

  it('keeps the briefing inside its 50-line cap', () => {
    const out = renderResumeBriefing({
      ...base,
      lockedDecisions: ['a', 'b', 'c', 'd', 'e'],
      openQuestions: ['q1', 'q2', 'q3'],
      stateDriftResult: { summary: { needsAPerson: 4, cannotEvaluate: 2 }, results: [] },
    });
    expect(out.split('\n').length).toBeLessThanOrEqual(50);
  });

  it('is absent entirely when no drift result is passed — fail-open', () => {
    const out = renderResumeBriefing(base);
    expect(out).not.toMatch(/STATE-vs-world/i);
  });
});

describe('M5.E16 S4 — the summary the resume line reads is produced by the runner', () => {
  it('runDriftChecks reports needsAPerson and selfClearing counts', async () => {
    const dir = await makeProject({
      'STATE.md': STATE({ current_epic: 'PHASE12' }),
    });
    try {
      const report = await runSweep(dir);
      expect(report.stateDrift.summary).toHaveProperty('needsAPerson');
      expect(report.stateDrift.summary).toHaveProperty('selfClearing');
      // "PHASE12" is a category-3 finding — it must count toward needsAPerson.
      expect(report.stateDrift.summary.needsAPerson).toBeGreaterThan(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a self-clearing finding never counts as needing a person', async () => {
    const { runDriftChecks, defineCheck, APPLICABILITY } = await import('../plugin/tools/lib/state-drift.js');
    const dir = await makeProject({ 'STATE.md': STATE() });
    try {
      const selfHeal = defineCheck({
        id: 'fixture-self',
        healCategory: HEAL.SELF_HEALING,
        healMechanism: 'the next STATE write',
        applicability: () => APPLICABILITY.EVAL,
        run: () => [{ message: 'clears itself' }],
      });
      const { summary } = await runDriftChecks(dir, [selfHeal]);
      expect(summary.needsAPerson).toBe(0);
      expect(summary.selfClearing).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
