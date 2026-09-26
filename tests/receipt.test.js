import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ReceiptError,
  makeReceipt,
  refusableFindings,
  renderReceipt,
} from '../plugin/tools/lib/receipt.js';
import { defineCheck, runDriftChecks, HEAL, STATUS, APPLICABILITY } from '../plugin/tools/lib/state-drift.js';

/**
 * M6.E3 FR1 — the receipt contract (`D-M6E3-1`): a finding may block ONLY when
 * it carries a receipt a person can check in seconds — the claim and the thing
 * contradicting it, side by side. And a finding judged by a model never blocks
 * in this Epic, receipt or not (`D-M6E3-8`, `AC9.4`).
 */

const CLAIM = { file: '.planning/STATE.md', line: 23, excerpt: '**Nothing is in flight.**' };
const EVIDENCE = { source: '.planning/STATE.md frontmatter', line: 5, excerpt: 'current_epic: M6.E8' };

describe('makeReceipt — the bare verdict is rejected at construction (AC1.5)', () => {
  it('builds a receipt from both sides (AC1.2)', () => {
    const r = makeReceipt({ claim: CLAIM, evidence: EVIDENCE });
    expect(r.claim).toEqual(CLAIM);
    expect(r.evidence).toEqual(EVIDENCE);
    expect(Object.isFrozen(r)).toBe(true);
  });

  it('accepts a commit sha in place of an evidence line', () => {
    const r = makeReceipt({ claim: CLAIM, evidence: { source: 'git', sha: 'abc1234', excerpt: 'fix(B102): …' } });
    expect(r.evidence.sha).toBe('abc1234');
  });

  it.each([
    ['no evidence side', { claim: CLAIM }],
    ['no claim side', { evidence: EVIDENCE }],
    ['claim without an excerpt', { claim: { ...CLAIM, excerpt: '' }, evidence: EVIDENCE }],
    ['evidence without an excerpt', { claim: CLAIM, evidence: { ...EVIDENCE, excerpt: '   ' } }],
    ['claim without a line', { claim: { file: CLAIM.file, excerpt: CLAIM.excerpt }, evidence: EVIDENCE }],
    ['evidence with neither line nor sha', { claim: CLAIM, evidence: { source: 'x', excerpt: 'y' } }],
    ['a bare verdict string', 'this claim is unsupported'],
  ])('throws on %s', (_label, input) => {
    expect(() => makeReceipt(input)).toThrow(ReceiptError);
  });
});

describe('renderReceipt — adjudicable without opening either file (AC1.3)', () => {
  it('renders in at most 15 lines, each excerpt on one line', () => {
    const long = 'x'.repeat(500) + '\nsecond line\nthird';
    const r = makeReceipt({ claim: { ...CLAIM, excerpt: long }, evidence: { ...EVIDENCE, excerpt: long } });
    const out = renderReceipt(r);
    expect(out.split('\n').length).toBeLessThanOrEqual(15);
    expect(out).not.toContain('second line');
    expect(out).toContain('.planning/STATE.md:23');
  });
});

function fakeReport(findings) {
  return { results: [{ id: 'x', healCategory: 3, status: 'findings', reason: null, findings }], summary: {} };
}

describe('refusableFindings — the ONLY input any refusal may use (AC1.1, AC1.4, AC9.4)', () => {
  const receipt = makeReceipt({ claim: CLAIM, evidence: EVIDENCE });

  it('passes a code finding that carries a receipt', () => {
    const f = { check: 'x', message: 'm', receipt };
    expect(refusableFindings(fakeReport([f]))).toEqual([f]);
  });

  it('drops a finding with receipt: null (report-only)', () => {
    expect(refusableFindings(fakeReport([{ check: 'x', message: 'm', receipt: null }]))).toEqual([]);
  });

  it('drops a model-judged finding EVEN WITH a receipt', () => {
    const f = { check: 'x', message: 'm', receipt, judgedBy: { model: 'jev-1.13.0', confidence: 0.99 } };
    expect(refusableFindings(fakeReport([f]))).toEqual([]);
  });

  it('drops a finding whose receipt was never constructed (a plain object is not a receipt)', () => {
    const f = { check: 'x', message: 'm', receipt: { claim: CLAIM, evidence: EVIDENCE } };
    expect(refusableFindings(fakeReport([f]))).toEqual([]);
  });

  it('returns [] for a null or malformed report — fail-open never manufactures a refusal', () => {
    expect(refusableFindings(null)).toEqual([]);
    expect(refusableFindings({})).toEqual([]);
  });
});

describe('runDriftChecks carries receipts through, and refuses to carry a malformed one', () => {
  async function tree() {
    const dir = await mkdtemp(join(tmpdir(), 'sig-receipt-'));
    await mkdir(join(dir, '.planning'));
    await writeFile(join(dir, '.planning/STATE.md'), '---\nschema_version: 1\nphase: PLAN\n---\n# State\n');
    return dir;
  }

  it('passes receipt and judgedBy through to the finding', async () => {
    const dir = await tree();
    try {
      const receipt = makeReceipt({ claim: CLAIM, evidence: EVIDENCE });
      const check = defineCheck({
        id: 'fixture-receipt', healCategory: HEAL.NEEDS_A_PERSON,
        applicability: () => APPLICABILITY.EVAL,
        run: () => [{ message: 'm', file: CLAIM.file, receipt, judgedBy: { model: 'jev-1.13.0', confidence: 0.9 } }],
      });
      const report = await runDriftChecks(dir, [check]);
      const [f] = report.results[0].findings;
      expect(f.receipt).toBe(receipt);
      expect(f.judgedBy).toEqual({ model: 'jev-1.13.0', confidence: 0.9 });
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('a check returning a hand-rolled receipt object becomes cannot-evaluate, not a finding', async () => {
    const dir = await tree();
    try {
      const check = defineCheck({
        id: 'fixture-bad-receipt', healCategory: HEAL.NEEDS_A_PERSON,
        applicability: () => APPLICABILITY.EVAL,
        run: () => [{ message: 'm', receipt: { claim: CLAIM } }],
      });
      const report = await runDriftChecks(dir, [check]);
      expect(report.results[0].status).toBe(STATUS.CANNOT_EVALUATE);
      expect(report.results[0].reason).toMatch(/receipt/);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });

  it('existing checks are unchanged: a finding without the fields carries neither', async () => {
    const dir = await tree();
    try {
      const check = defineCheck({
        id: 'fixture-plain', healCategory: HEAL.NEEDS_A_PERSON,
        applicability: () => APPLICABILITY.EVAL, run: () => [{ message: 'm' }],
      });
      const [f] = (await runDriftChecks(dir, [check])).results[0].findings;
      expect('receipt' in f).toBe(false);
      expect('judgedBy' in f).toBe(false);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
