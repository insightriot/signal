import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runShipContentGate, formatShipContentGate, GATE } from '../plugin/tools/lib/ship-gate.js';
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
      const r = await runShipContentGate(dir, { checks: [check('bare', [{ message: 'looks stale' }])] });
      expect(r.status).toBe(GATE.PASS);
      expect(r.advice).toHaveLength(1);
      expect(formatShipContentGate(r)).toMatch(/advice/i);
    }));

  it('a model-judged finding with a receipt never refuses — it is advice (AC9.4)', () =>
    withTree(async (dir) => {
      const r = await runShipContentGate(dir, {
        checks: [check('jev', [{ message: 'm', receipt: receipt(), judgedBy: { model: 'jev-1.13.0', confidence: 0.99 } }])],
      });
      expect(r.status).toBe(GATE.PASS);
      expect(r.advice).toHaveLength(1);
    }));

  it('--accept-stale <check-id> continues, and the override is RECORDED (AC5.4)', () =>
    withTree(async (dir) => {
      const r = await runShipContentGate(dir, {
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
      const r = await runShipContentGate(dir, { checks: [check('quiet', [])] });
      expect(r.status).toBe(GATE.PASS);
      expect(formatShipContentGate(r)).toMatch(/checked 1/);
    }));

  it('a runner failure is UNVERIFIED, never a clean-looking pass and never a refusal (NFR2)', () =>
    withTree(async (dir) => {
      const r = await runShipContentGate(dir, {
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
      const r = await runShipContentGate(dir, { checks: [blind] });
      expect(formatShipContentGate(r)).toMatch(/could not evaluate.*blind.*no BUGS\.md/is);
    }));
});
