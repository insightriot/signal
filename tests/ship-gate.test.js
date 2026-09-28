import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runShipContentGate, formatShipContentGate, GATE, SHIP_JEV_BUDGET_MS } from '../plugin/tools/lib/ship-gate.js';
import { JEV_CHECK_DEFAULTS } from '../plugin/tools/lib/state-narrative-jev.js';
import { makeReceipt } from '../plugin/tools/lib/receipt.js';
import { defineCheck, HEAL, APPLICABILITY } from '../plugin/tools/lib/state-drift.js';

/**
 * M6.E3 FR5 — the first time the SHIP gate refuses on what a document SAYS.
 *
 * Every halt ship.md could produce before this was a precondition failure; this
 * gate has a bad record (`B36`: three Epics silently inert), so it is proven here
 * against FIXTURES before any real check can hand it a finding to refuse on.
 */

const receipt = () => makeReceipt({
  claim: { file: '.planning/BUGS.md', line: 40, excerpt: '| B102 | `confirmed` |' },
  evidence: { source: 'CHANGELOG.md', line: 12, excerpt: '`B102`, fix lane. A P1…' },
});

const check = (id, findings) => defineCheck({
  id, healCategory: HEAL.NEEDS_A_PERSON,
  applicability: () => APPLICABILITY.EVAL, run: () => findings,
});

async function tree() {
  const dir = await mkdtemp(join(tmpdir(), 'sig-shipgate-'));
  await mkdir(join(dir, '.planning'));
  await writeFile(join(dir, '.planning/STATE.md'), '---\nschema_version: 1\nphase: SHIP\n---\n# State\n');
  return dir;
}

async function withTree(fn) {
  const dir = await tree();
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

describe('runShipContentGate', () => {
  it('REFUSES on a code finding with a receipt (AC5.1) and names the clearing edit (AC5.2)', () =>
    withTree(async (dir) => {
      const r = await runShipContentGate(dir, {
        modelChecks: [],
        checks: [check('stale-bug', [{ message: 'B102 reads open', receipt: receipt(), fix: 'Set B102 to `fixed` (v0.1.27).' }])],
      });
      expect(r.status).toBe(GATE.REFUSE);
      expect(r.refusals).toHaveLength(1);
      const text = formatShipContentGate(r);
      expect(text).toContain('.planning/BUGS.md:40');
      expect(text).toContain('Set B102 to `fixed` (v0.1.27).');
      expect(text).toContain('--accept-stale stale-bug');
    }));

  it('a finding WITHOUT a receipt never refuses — it is advice (AC5.3)', () =>
    withTree(async (dir) => {
      const r = await runShipContentGate(dir, { modelChecks: [], checks: [check('bare', [{ message: 'looks stale' }])] });
      expect(r.status).toBe(GATE.PASS);
      expect(r.advice).toHaveLength(1);
      expect(formatShipContentGate(r)).toMatch(/advice/i);
    }));

  it('a model-judged finding with a receipt never refuses — it is advice (AC9.4)', () =>
    withTree(async (dir) => {
      const r = await runShipContentGate(dir, {
        modelChecks: [],
        checks: [check('jev', [{ message: 'm', receipt: receipt(), judgedBy: { model: 'jev-1.13.0', confidence: 0.99 } }])],
      });
      expect(r.status).toBe(GATE.PASS);
      expect(r.advice).toHaveLength(1);
    }));

  it('--accept-stale <check-id> continues, and the override is RECORDED (AC5.4)', () =>
    withTree(async (dir) => {
      const r = await runShipContentGate(dir, {
        modelChecks: [],
        checks: [check('stale-bug', [{ message: 'B102 reads open', receipt: receipt() }])],
        acceptStale: ['stale-bug'],
      });
      expect(r.status).toBe(GATE.OVERRIDDEN);
      expect(r.overridden).toHaveLength(1);
      expect(r.record).toMatch(/--accept-stale stale-bug/);
      expect(r.record).toContain('.planning/BUGS.md:40');
    }));

  it('overriding one check does not wave through another', () =>
    withTree(async (dir) => {
      const r = await runShipContentGate(dir, {
        modelChecks: [],
        checks: [
          check('a', [{ message: 'x', receipt: receipt() }]),
          check('b', [{ message: 'y', receipt: receipt() }]),
        ],
        acceptStale: ['a'],
      });
      expect(r.status).toBe(GATE.REFUSE);
      expect(r.refusals.map((f) => f.check)).toEqual(['b']);
    }));

  it('no findings at all → PASS, and says what it checked', () =>
    withTree(async (dir) => {
      const r = await runShipContentGate(dir, { modelChecks: [], checks: [check('quiet', [])] });
      expect(r.status).toBe(GATE.PASS);
      expect(formatShipContentGate(r)).toMatch(/checked 1/);
    }));

  it('a runner failure is UNVERIFIED, never a clean-looking pass and never a refusal (NFR2)', () =>
    withTree(async (dir) => {
      const r = await runShipContentGate(dir, {
        modelChecks: [],
        checks: [],
        runner: async () => { throw new Error('boom'); },
      });
      expect(r.status).toBe(GATE.UNVERIFIED);
      expect(formatShipContentGate(r)).toMatch(/could not run.*boom/i);
    }));

  it('checks that could not evaluate are reported, not counted as clean', () =>
    withTree(async (dir) => {
      const blind = defineCheck({
        id: 'blind', healCategory: HEAL.NEEDS_A_PERSON,
        applicability: () => ({ status: APPLICABILITY.BLIND, reason: 'no BUGS.md' }), run: () => [],
      });
      const r = await runShipContentGate(dir, { modelChecks: [], checks: [blind] });
      expect(formatShipContentGate(r)).toMatch(/could not evaluate.*blind.*no BUGS\.md/is);
    }));
});

describe('Jev findings in the SHIP report (t2.2 — AC10.2, AC9.4)', () => {
  it('lists a Jev finding as advice with its receipt, confidence, model and coverage — and does not refuse', () =>
    withTree(async (dir) => {
      const jev = defineCheck({
        id: 'state-narrative-jev', healCategory: HEAL.NEEDS_A_PERSON,
        applicability: () => APPLICABILITY.EVAL,
        run: () => ({
          findings: [{ message: 'Jev reads STATE.md:71 as contradicting the facts', receipt: receipt(), judgedBy: { model: 'jev-1.13.0', confidence: 0.99 } }],
          coverage: { checked: 18, total: 20, unchecked: [{ line: 90, reason: 'budget' }, { line: 95, reason: 'budget' }], model: 'jev-1.13.0' },
        }),
      });
      const r = await runShipContentGate(dir, { checks: [], modelChecks: [jev] });
      expect(r.status).toBe(GATE.PASS);
      const text = formatShipContentGate(r);
      expect(text).toMatch(/Advice — does not block \(1\)/);
      expect(text).toContain('judged by jev-1.13.0: likely, confidence 0.99');
      expect(text).toContain('.planning/BUGS.md:40');
      expect(text).toMatch(/state-narrative-jev: checked 18 of 20; 2 not checked \(budget\) — jev-1.13.0; results can vary/);
    }));

  it('no key → the report says the Jev check did not run, and why', () =>
    withTree(async (dir) => {
      const prev = process.env.TYPESAFE_API_KEY;
      delete process.env.TYPESAFE_API_KEY;
      try {
        const r = await runShipContentGate(dir, { checks: [] });
        expect(r.status).toBe(GATE.PASS);
        expect(formatShipContentGate(r)).toMatch(/state-narrative-jev: the Jev check did not run — TYPESAFE_API_KEY is not set/);
        // Neither check RAN, so neither is counted as checked (REVIEW: it said "checked 2").
        expect(r.checked).toBe(0);
        expect(formatShipContentGate(r)).toContain('✓ Content gate: checked 0, nothing refusable.');
      } finally {
        if (prev !== undefined) process.env.TYPESAFE_API_KEY = prev;
      }
    }));

  // AC8.2 for the SECOND Jev check: the no-key line was asserted for the
  // STATE.md check only (VERIFY finding).
  it('no key → bug-fixed-jev also says it did not run, when there is a BUGS.md and a CHANGELOG to read', () =>
    withTree(async (dir) => {
      await writeFile(join(dir, '.planning/BUGS.md'), '| B1 | `confirmed` | P2 | x |\n');
      await writeFile(join(dir, 'CHANGELOG.md'), '# Changelog\n\n## [0.1.0]\n\n- B1 fixed.\n');
      const prev = process.env.TYPESAFE_API_KEY;
      delete process.env.TYPESAFE_API_KEY;
      try {
        const r = await runShipContentGate(dir, { checks: [] });
        expect(r.status).toBe(GATE.PASS);
        expect(formatShipContentGate(r)).toMatch(/bug-fixed-jev: the Jev check did not run — TYPESAFE_API_KEY is not set/);
      } finally {
        if (prev !== undefined) process.env.TYPESAFE_API_KEY = prev;
      }
    }));

  it('a sampling check that asked nothing (all past the budget) is not counted as checked; unread sections are listed', () =>
    withTree(async (dir) => {
      const jev = defineCheck({
        id: 'bug-fixed-jev', healCategory: HEAL.NEEDS_A_PERSON, judged: 'model',
        applicability: () => APPLICABILITY.EVAL,
        run: () => ({ findings: [], coverage: { checked: 0, total: 4, unchecked: [], model: null, sectionsNotRead: ['B75 (4)'] } }),
      });
      const r = await runShipContentGate(dir, { checks: [], modelChecks: [jev] });
      expect(r.checked).toBe(0);
      expect(formatShipContentGate(r)).toContain('older changelog sections not read: B75 (4)');
    }));

  it('names the facts the STATE.md check could not use (AC9.1, NFR4)', () =>
    withTree(async (dir) => {
      const jev = defineCheck({
        id: 'state-narrative-jev', healCategory: HEAL.NEEDS_A_PERSON,
        applicability: () => APPLICABILITY.EVAL,
        run: () => ({ findings: [], coverage: { checked: 3, total: 3, unchecked: [], model: 'jev-1.13.0', factsUnavailable: ['current_epic (linear mode)', 'blockers (left out on purpose: they carry dates, which Jev reads as text)'] } }),
      });
      const text = formatShipContentGate(await runShipContentGate(dir, { checks: [], modelChecks: [jev] }));
      expect(text).toContain('facts not used: current_epic (linear mode); blockers (left out on purpose');
    }));
});

describe('the budgets (NFR3) — SHIP is the expensive path, /sig:resume the cheap one', () => {
  it('SHIP gives the Jev STATE.md check 30 s: a paragraph at +20 s is asked, one at +40 s is not', () =>
    withTree(async (dir) => {
      await writeFile(join(dir, '.planning/STATE.md'), '---\nschema_version: 1\nphase: SHIP\n---\nOne.\n\nTwo.\n\nThree.\n');
      let t = 0;
      const ask = async () => { t += 20000; return { ok: true, choice: 'says_nothing', confidence: 0.9, model: 'jev-1.13.0' }; };
      const r = await runShipContentGate(dir, { checks: [], jev: { ask, now: () => t, key: 'k', concurrency: 1 } });
      const c = r.coverage.find((x) => x.id === 'state-narrative-jev');
      expect(SHIP_JEV_BUDGET_MS).toBe(30000);
      expect(c).toMatchObject({ checked: 2, total: 3, unchecked: [{ line: 9, reason: 'budget' }] });
    }));

  it('/sig:resume runs it with 8 s — the default, and what resume.md passes', async () => {
    expect(JEV_CHECK_DEFAULTS.budgetMs).toBe(8000);
    const resumeMd = await readFile(join(import.meta.dirname, '../plugin/commands/resume.md'), 'utf8');
    expect(resumeMd).toContain('modelJudgedChecks({ budgetMs: 8000 })');
  });
});
