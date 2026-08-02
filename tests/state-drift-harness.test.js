import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  HEAL,
  APPLICABILITY,
  defineCheck,
  buildDriftContext,
  runDriftChecks,
  renderDriftReport,
  STATE_DRIFT_CHECKS,
} from '../tools/lib/state-drift.js';

/**
 * M5.E16 S1 — the harness, wave 1.
 *
 * The Epic's own research measured that checks (a) and (b) can evaluate 2 of 13
 * real projects. A detector that silently returns nothing on the other 11 reads
 * as "clean" when it never looked — `B39`'s shape (an instruction nothing
 * executed) and `B54`'s (a guard that was wrong because nothing called it).
 *
 * So the harness has to make four outcomes distinguishable BEFORE any check
 * exists: checked-clean, needs-a-person, self-clearing, and cannot-evaluate.
 * These tests are written RED first, against fixture checks rather than real
 * ones, because the contract is the deliverable of this slice.
 */

async function makeProject(files = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sig-drift-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(dir, '.planning', name), content);
  }
  return dir;
}

const HEALTHY_STATE = `---
schema_version: 1
phase: PLAN
current_epic: M5.E16
current_wave: null
current_tasks: []
completed_phases: []
blockers: []
last_completed_task: null
last_updated_commit: abc1234
last_updated: 2026-08-02T00:00:00.000Z
---
# Project State

M5.E16 is in PLAN.
`;

// STATE.md with frontmatter but no schema_version — `readState` THROWS on this
// shape. `affiliate-mojo` is the live instance found by the PLAN-time probe.
const UNREADABLE_STATE = `---
phase: EXECUTE
current_epic: M5.E16
---
# Project State
`;

describe('M5.E16 S1.t1 — the check registry refuses an under-declared check', () => {
  const ok = { id: 'x', healCategory: HEAL.NEEDS_A_PERSON, applicability: () => APPLICABILITY.EVAL, run: () => [] };

  it('accepts a fully declared check', () => {
    expect(() => defineCheck(ok)).not.toThrow();
  });

  it('refuses a check with no heal category — FR4.2, there is no default bucket', () => {
    const { healCategory, ...noCategory } = ok;
    expect(() => defineCheck(noCategory)).toThrow(/heal category/i);
  });

  it('refuses a heal category outside 1..3', () => {
    expect(() => defineCheck({ ...ok, healCategory: 4 })).toThrow(/heal category/i);
  });

  it('refuses a check with no applicability function', () => {
    const { applicability, ...noApplicability } = ok;
    expect(() => defineCheck(noApplicability)).toThrow(/applicability/i);
  });

  it('refuses a check with no run function', () => {
    const { run, ...noRun } = ok;
    expect(() => defineCheck(noRun)).toThrow(/run/i);
  });

  it('refuses a self-healing check that cannot name what heals it', () => {
    // A category-1 check promises the finding clears on its own. If it cannot
    // say what does the clearing, the promise is unfalsifiable — and an
    // unfalsifiable reassurance is worse than a finding.
    expect(() =>
      defineCheck({ ...ok, healCategory: HEAL.SELF_HEALING })
    ).toThrow(/healMechanism/i);
    expect(() =>
      defineCheck({ ...ok, healCategory: HEAL.SELF_HEALING, healMechanism: 'markFresh at phase close' })
    ).not.toThrow();
  });

  it('refuses a command-healable check that cannot name the command', () => {
    expect(() =>
      defineCheck({ ...ok, healCategory: HEAL.COMMAND_HEALABLE })
    ).toThrow(/healMechanism/i);
  });
});

describe('M5.E16 S1.t2 — an unreadable STATE.md reports, it does not crash or go silent', () => {
  it('readState throwing yields cannot-evaluate for every check, with a reason', async () => {
    const dir = await makeProject({ 'STATE.md': UNREADABLE_STATE });
    try {
      const check = defineCheck({
        id: 'fixture-eval',
        healCategory: HEAL.NEEDS_A_PERSON,
        applicability: () => APPLICABILITY.EVAL,
        run: () => [{ message: 'should never run' }],
      });
      const result = await runDriftChecks(dir, [check]);
      const row = result.results.find((r) => r.id === 'fixture-eval');
      expect(row.status).toBe('cannot-evaluate');
      expect(row.reason).toMatch(/schema_version/);
      expect(row.findings).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a check that throws mid-run is reported as cannot-evaluate, not swallowed', async () => {
    const dir = await makeProject({ 'STATE.md': HEALTHY_STATE });
    try {
      const boom = defineCheck({
        id: 'fixture-throws',
        healCategory: HEAL.NEEDS_A_PERSON,
        applicability: () => APPLICABILITY.EVAL,
        run: () => { throw new Error('detector exploded'); },
      });
      const result = await runDriftChecks(dir, [boom]);
      const row = result.results.find((r) => r.id === 'fixture-throws');
      expect(row.status).toBe('cannot-evaluate');
      expect(row.reason).toMatch(/detector exploded/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a missing STATE.md is cannot-evaluate too — absence is not cleanliness', async () => {
    const dir = await makeProject({});
    try {
      const check = defineCheck({
        id: 'fixture-eval',
        healCategory: HEAL.NEEDS_A_PERSON,
        applicability: () => APPLICABILITY.EVAL,
        run: () => [],
      });
      const result = await runDriftChecks(dir, [check]);
      expect(result.results[0].status).toBe('cannot-evaluate');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('M5.E16 S1.t3 — checked-clean and could-not-check must not render alike', () => {
  const cleanCheck = defineCheck({
    id: 'fixture-clean',
    healCategory: HEAL.NEEDS_A_PERSON,
    applicability: () => APPLICABILITY.EVAL,
    run: () => [],
  });
  const blindCheck = defineCheck({
    id: 'fixture-blind',
    healCategory: HEAL.NEEDS_A_PERSON,
    applicability: () => ({ status: APPLICABILITY.BLIND, reason: 'phase is prose, not a phase name' }),
    run: () => [],
  });
  const naCheck = defineCheck({
    id: 'fixture-na',
    healCategory: HEAL.NEEDS_A_PERSON,
    applicability: () => APPLICABILITY.NA,
    run: () => [],
  });

  it('a blind check does not count as clean, and says why', async () => {
    const dir = await makeProject({ 'STATE.md': HEALTHY_STATE });
    try {
      const result = await runDriftChecks(dir, [cleanCheck, blindCheck]);
      const byId = Object.fromEntries(result.results.map((r) => [r.id, r]));
      expect(byId['fixture-clean'].status).toBe('clean');
      expect(byId['fixture-blind'].status).toBe('cannot-evaluate');

      const out = renderDriftReport(result);
      // The load-bearing assertion of this slice: the two must be visibly
      // different. If the renderer ever collapses them, this fails.
      expect(out).toMatch(/checked, clean/i);
      expect(out).toMatch(/cannot evaluate/i);
      expect(out).toContain('phase is prose, not a phase name');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a not-applicable check is neither clean nor blind', async () => {
    const dir = await makeProject({ 'STATE.md': HEALTHY_STATE });
    try {
      const result = await runDriftChecks(dir, [naCheck]);
      expect(result.results[0].status).toBe('not-applicable');
      expect(result.summary).toMatchObject({ clean: 0, notApplicable: 1, cannotEvaluate: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('category 3 renders as needing a person; category 1 renders as self-clearing', async () => {
    const dir = await makeProject({ 'STATE.md': HEALTHY_STATE });
    try {
      const person = defineCheck({
        id: 'fixture-person',
        healCategory: HEAL.NEEDS_A_PERSON,
        applicability: () => APPLICABILITY.EVAL,
        run: () => [{ message: 'two documents disagree' }],
      });
      const selfHeal = defineCheck({
        id: 'fixture-selfheal',
        healCategory: HEAL.SELF_HEALING,
        healMechanism: 'the next STATE write',
        applicability: () => APPLICABILITY.EVAL,
        run: () => [{ message: 'baseline commit is off-history' }],
      });
      const out = renderDriftReport(await runDriftChecks(dir, [person, selfHeal]));

      expect(out).toMatch(/needs you/i);
      expect(out).toMatch(/clears the next time Signal writes STATE here/i);
      // The reassurance must never be filed under the heading that interrupts.
      const needsYouBlock = out.split(/clears the next time/i)[0];
      expect(needsYouBlock).toContain('two documents disagree');
      expect(needsYouBlock).not.toContain('baseline commit is off-history');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('renders deterministically — two runs are byte-identical (AC1.3)', async () => {
    const dir = await makeProject({ 'STATE.md': HEALTHY_STATE });
    try {
      const a = renderDriftReport(await runDriftChecks(dir, [cleanCheck, blindCheck, naCheck]));
      const b = renderDriftReport(await runDriftChecks(dir, [cleanCheck, blindCheck, naCheck]));
      expect(a).toBe(b);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('writes nothing — /sig:sweep is detect-and-report (NFR2, D-M5E16-1)', async () => {
    const dir = await makeProject({ 'STATE.md': HEALTHY_STATE });
    try {
      const { readFile } = await import('node:fs/promises');
      const before = await readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');
      await runDriftChecks(dir, [cleanCheck, blindCheck, naCheck]);
      const after = await readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');
      expect(after).toBe(before);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('M5.E16 S1.t5 — every declared heal category has an implementation', () => {
  // The validation walk asked "is a category declared?" and passed a check that
  // declared category 2 while nothing healed it. The question that catches it is
  // "does its promise come true?" — this is that question, as a test.

  it('every registered check names the mechanism that clears it', () => {
    for (const check of STATE_DRIFT_CHECKS) {
      if (check.healCategory === HEAL.NEEDS_A_PERSON) continue;
      expect(check.healMechanism, `${check.id} declares category ${check.healCategory}`)
        .toBeTruthy();
    }
  });

  it('the category-2 bucket is empty, and that is the recorded state (D-M5E16-1)', () => {
    // After resolving FR4 against NFR2, sweep never runs a heal itself. Every
    // shipped check is category 1 or 3. This assertion is deliberately written
    // to FAIL the day a category-2 check is registered without `/sig:sweep
    // --heal` existing to run it.
    const commandHealable = STATE_DRIFT_CHECKS.filter((c) => c.healCategory === HEAL.COMMAND_HEALABLE);
    expect(commandHealable).toEqual([]);
  });

  it('every registered check has a unique id', () => {
    const ids = STATE_DRIFT_CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('M5.E16 S1 — every check lands in exactly one bucket, always', () => {
  // Without this, a check that returns early from `runDriftChecks` — an
  // unhandled applicability shape, a future `continue` — vanishes from every
  // bucket and the report still looks perfectly coherent. A detector silently
  // dropping out of its own summary is the exact failure this Epic exists to
  // prevent, reproduced in the reporter. So the buckets must SUM.
  const cases = [
    ['a healthy project', HEALTHY_STATE],
    ['a project whose STATE cannot be read', UNREADABLE_STATE],
  ];

  for (const [label, state] of cases) {
    it(`the four buckets sum to the number of checks run — ${label}`, async () => {
      const dir = await makeProject({ 'STATE.md': state });
      try {
        const { results, summary } = await runDriftChecks(dir, STATE_DRIFT_CHECKS);
        expect(results).toHaveLength(STATE_DRIFT_CHECKS.length);
        expect(summary.total).toBe(STATE_DRIFT_CHECKS.length);
        expect(
          summary.withFindings + summary.clean + summary.notApplicable + summary.cannotEvaluate
        ).toBe(summary.total);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }

  it('an applicability function returning nonsense is bucketed, not dropped', async () => {
    const dir = await makeProject({ 'STATE.md': HEALTHY_STATE });
    try {
      const nonsense = defineCheck({
        id: 'fixture-nonsense',
        healCategory: HEAL.NEEDS_A_PERSON,
        applicability: () => 'MAYBE',
        run: () => [],
      });
      const { results, summary } = await runDriftChecks(dir, [nonsense]);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('cannot-evaluate');
      expect(
        summary.withFindings + summary.clean + summary.notApplicable + summary.cannotEvaluate
      ).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('holds on this repo, where five checks are genuinely evaluable', async () => {
    const { results, summary } = await runDriftChecks(join(import.meta.dirname, '..'), STATE_DRIFT_CHECKS);
    expect(results).toHaveLength(STATE_DRIFT_CHECKS.length);
    expect(
      summary.withFindings + summary.clean + summary.notApplicable + summary.cannotEvaluate
    ).toBe(STATE_DRIFT_CHECKS.length);
  });
});

describe('M5.E16 S1.t4 — the probe runs', () => {
  // A measuring script nobody executes is this Epic's own subject matter: `B39`
  // was an instruction nothing performed, and the numbers in M5.E16-PLAN.md rest
  // on this probe. Pin that it executes, so the claim stays re-derivable.
  it('executes against a real project directory and reports its shape', async () => {
    const { execFileSync } = await import('node:child_process');
    const dir = await makeProject({ 'STATE.md': HEALTHY_STATE });
    try {
      const out = execFileSync(
        process.execPath,
        ['tools/state-drift-probe.mjs', dir],
        { cwd: join(import.meta.dirname, '..'), encoding: 'utf-8' }
      );
      expect(out).toMatch(/1 project\(s\) with \.planning\/STATE\.md/);
      expect(out).toMatch(/readable STATE\.md/);
      expect(out).toContain('M5.E16');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reports an unreadable STATE.md rather than crashing on it', async () => {
    const { execFileSync } = await import('node:child_process');
    const dir = await makeProject({ 'STATE.md': UNREADABLE_STATE });
    try {
      const out = execFileSync(
        process.execPath,
        ['tools/state-drift-probe.mjs', dir],
        { cwd: join(import.meta.dirname, '..'), encoding: 'utf-8' }
      );
      expect(out).toMatch(/unreadable/);
      expect(out).toMatch(/readable STATE\.md \.+ 0\/1/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
