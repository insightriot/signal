import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NARRATIVE_QUESTION,
  makeStateNarrativeJevCheck,
  MODEL_JUDGED_CHECKS,
} from '../plugin/tools/lib/state-narrative-jev.js';
import { splitParagraphs } from '../plugin/tools/lib/state-facts.js';
import { runDriftChecks, STATUS } from '../plugin/tools/lib/state-drift.js';
import { ALL_DRIFT_CHECKS } from '../plugin/tools/lib/published-facts.js';
import { refusableFindings, isReceipt } from '../plugin/tools/lib/receipt.js';
import { JEV_REASON } from '../plugin/tools/lib/jev.js';

/**
 * M6.E3 t1.5 — the Jev STATE.md check, driven by the spike's RECORDED answers
 * (analysis/jev-spike/labels-and-results.json, run 1) over the exact STATE.md
 * the spike measured (3518c11). No test touches the network (AC8.7).
 *
 * This is a plumbing test, not the measurement: the recorded answers were given
 * against the spike's facts, not the derived ones. The measurement is t1.7.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = readFileSync(join(ROOT, 'tests/fixtures/jev/STATE-3518c11.md'), 'utf8');
const SPIKE = JSON.parse(readFileSync(join(ROOT, 'analysis/jev-spike/labels-and-results.json'), 'utf8'));
const NARR = SPIKE.cases.filter((c) => c.set === 'narrative');
const PARAS = splitParagraphs(FIXTURE);

const recorded = new Map(NARR.map((c) => [PARAS[Number(c.id.replace('para ', '')) - 1].text, c.run1]));

/** A fake `askChoice` answering from the spike's run-1 record. */
function recordedAsk() {
  return vi.fn(async ({ state }) => {
    const r = recorded.get(state.paragraph);
    if (!r) return { ok: true, choice: 'says_nothing', confidence: 1, probabilities: { says_nothing: 1 }, model: 'jev-1.13.0' };
    return { ok: true, ...r, model: 'jev-1.13.0' };
  });
}

async function project(stateRaw = FIXTURE) {
  const dir = await mkdtemp(join(tmpdir(), 'sig-jevcheck-'));
  await mkdir(join(dir, '.planning'));
  await mkdir(join(dir, '.claude-plugin'));
  await writeFile(join(dir, '.planning/STATE.md'), stateRaw);
  await writeFile(join(dir, '.claude-plugin/plugin.json'), '{\n  "version": "0.1.40"\n}\n');
  return dir;
}
const cleanup = (dir) => rm(dir, { recursive: true, force: true });

describe('the question is the spike\'s, verbatim (comparability with the measurement)', () => {
  it('matches the stored narrative question', () => {
    expect(NARRATIVE_QUESTION).toEqual(NARR[0].question);
  });
});

describe('checkStateNarrativeJev over the spike STATE.md (recorded answers)', () => {
  it('every recorded "contradicts" becomes a finding with a receipt at the right FILE line (AC9.2, AC9.3)', async () => {
    const dir = await project();
    try {
      const ask = recordedAsk();
      const check = makeStateNarrativeJevCheck({ ask, key: 'k' });
      const report = await runDriftChecks(dir, [check]);
      const row = report.results[0];
      expect(row.status).toBe(STATUS.FINDINGS);
      const lines = row.findings.map((f) => f.receipt.claim.line).sort((a, b) => a - b);
      const expected = NARR.filter((c) => c.run1.choice === 'contradicts')
        .map((c) => PARAS[Number(c.id.replace('para ', '')) - 1].line).sort((a, b) => a - b);
      expect(lines).toEqual(expected);
      // the four labelled contradictions are among them: paras 14, 15, 18, 23
      for (const n of [14, 15, 18, 23]) expect(lines).toContain(PARAS[n - 1].line);
      // quoted history stays quiet: paras 29 and 31
      for (const n of [29, 31]) expect(lines).not.toContain(PARAS[n - 1].line);
      for (const f of row.findings) {
        expect(isReceipt(f.receipt)).toBe(true);
        expect(f.receipt.claim.file).toBe('.planning/STATE.md');
        expect(f.judgedBy.model).toBe('jev-1.13.0');
        expect(typeof f.judgedBy.confidence).toBe('number');
        expect(f.message).toMatch(/can vary between runs/); // AC9.7
      }
    } finally { await cleanup(dir); }
  });

  it('the receipt cites the claim verbatim, as it appears on that line of the file', async () => {
    const dir = await project();
    try {
      const report = await runDriftChecks(dir, [makeStateNarrativeJevCheck({ ask: recordedAsk(), key: 'k' })]);
      const fileLines = (await readFile(join(dir, '.planning/STATE.md'), 'utf8')).split('\n');
      for (const f of report.results[0].findings) {
        const firstLine = f.receipt.claim.excerpt.split('\n')[0];
        expect(fileLines[f.receipt.claim.line - 1]).toBe(firstLine);
      }
    } finally { await cleanup(dir); }
  });

  it('the version paragraph is paired with the version fact, cited at its manifest line', async () => {
    const dir = await project();
    try {
      const report = await runDriftChecks(dir, [makeStateNarrativeJevCheck({ ask: recordedAsk(), key: 'k' })]);
      const f = report.results[0].findings.find((x) => x.receipt.claim.line === PARAS[17].line);
      expect(f.receipt.evidence).toMatchObject({ source: '.claude-plugin/plugin.json', line: 2, excerpt: 'version: 0.1.40' });
    } finally { await cleanup(dir); }
  });

  it('skips heading-only paragraphs and reports coverage (checked N of M)', async () => {
    const dir = await project();
    try {
      const ask = recordedAsk();
      const report = await runDriftChecks(dir, [makeStateNarrativeJevCheck({ ask, key: 'k' })]);
      const cov = report.results[0].coverage;
      const headingOnly = PARAS.filter((p) => /^#{1,6}\s/.test(p.text) && !p.text.includes('\n')).length;
      expect(cov.total).toBe(PARAS.length - headingOnly);
      expect(cov.checked).toBe(cov.total);
      expect(ask).toHaveBeenCalledTimes(cov.total);
      expect(cov.unchecked).toEqual([]);
      expect(cov.model).toBe('jev-1.13.0');
    } finally { await cleanup(dir); }
  });

  it('sends each request {paragraph, facts} and never a date or a count in the facts (AC9.5)', async () => {
    const dir = await project();
    try {
      const ask = recordedAsk();
      await runDriftChecks(dir, [makeStateNarrativeJevCheck({ ask, key: 'k' })]);
      const { state, question } = ask.mock.calls[0][0];
      expect(Object.keys(state).sort()).toEqual(['facts', 'paragraph']);
      expect(question).toEqual(NARRATIVE_QUESTION);
      expect(JSON.stringify(state.facts)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    } finally { await cleanup(dir); }
  });
});

describe('bounds (NFR6) — a partial run says it is partial', () => {
  it('stops at the paragraph cap and lists the rest as unchecked', async () => {
    const dir = await project();
    try {
      const report = await runDriftChecks(dir, [makeStateNarrativeJevCheck({ ask: recordedAsk(), key: 'k', maxParagraphs: 5 })]);
      const cov = report.results[0].coverage;
      expect(cov.checked).toBe(5);
      expect(cov.unchecked.length).toBe(cov.total - 5);
      expect(cov.unchecked.every((u) => u.reason === 'over-cap')).toBe(true);
    } finally { await cleanup(dir); }
  });

  it('stops at the time budget and lists the rest as unchecked', async () => {
    const dir = await project();
    try {
      let t = 0;
      const now = () => t;
      const ask = vi.fn(async () => { t += 1000; return { ok: true, choice: 'says_nothing', confidence: 1, probabilities: {}, model: 'm' }; });
      const report = await runDriftChecks(dir, [makeStateNarrativeJevCheck({ ask, key: 'k', budgetMs: 3000, concurrency: 1, now })]);
      const cov = report.results[0].coverage;
      expect(cov.checked).toBe(3);
      expect(cov.unchecked.some((u) => u.reason === 'budget')).toBe(true);
    } finally { await cleanup(dir); }
  });

  it('a request that fails is unchecked with its reason — not silently skipped', async () => {
    const dir = await project('---\nschema_version: 1\nphase: SHIP\ncurrent_epic: M6.E8\n---\none\n\ntwo\n');
    try {
      const ask = vi.fn()
        .mockResolvedValueOnce({ ok: false, reason: JEV_REASON.RATE_LIMITED })
        .mockResolvedValueOnce({ ok: true, choice: 'says_nothing', confidence: 1, probabilities: {}, model: 'm' });
      const report = await runDriftChecks(dir, [makeStateNarrativeJevCheck({ ask, key: 'k', concurrency: 1 })]);
      const cov = report.results[0].coverage;
      expect(cov.checked).toBe(1);
      expect(cov.unchecked).toEqual([expect.objectContaining({ reason: JEV_REASON.RATE_LIMITED })]);
    } finally { await cleanup(dir); }
  });
});

describe('did not run — and says why (AC8.2)', () => {
  it('no key → cannot-evaluate, naming TYPESAFE_API_KEY, and no call', async () => {
    const dir = await project();
    try {
      const ask = vi.fn();
      const report = await runDriftChecks(dir, [makeStateNarrativeJevCheck({ ask, key: '' })]);
      expect(ask).not.toHaveBeenCalled();
      expect(report.results[0].status).toBe(STATUS.CANNOT_EVALUATE);
      expect(report.results[0].reason).toMatch(/TYPESAFE_API_KEY/);
    } finally { await cleanup(dir); }
  });

  it('every request failing → cannot-evaluate with the reason, never clean', async () => {
    const dir = await project();
    try {
      const ask = vi.fn().mockResolvedValue({ ok: false, reason: JEV_REASON.UNAUTHORIZED });
      const report = await runDriftChecks(dir, [makeStateNarrativeJevCheck({ ask, key: 'k' })]);
      expect(report.results[0].status).toBe(STATUS.CANNOT_EVALUATE);
      expect(report.results[0].reason).toMatch(/unauthorized/);
    } finally { await cleanup(dir); }
  });
});

describe('it can never refuse, and never reaches docs-sweep (AC9.4, AC10.3)', () => {
  it('no finding from this check survives refusableFindings', async () => {
    const dir = await project();
    try {
      const report = await runDriftChecks(dir, [makeStateNarrativeJevCheck({ ask: recordedAsk(), key: 'k' })]);
      expect(report.results[0].findings.length).toBeGreaterThan(0);
      expect(refusableFindings(report)).toEqual([]);
    } finally { await cleanup(dir); }
  });

  it('is in MODEL_JUDGED_CHECKS and NOT in ALL_DRIFT_CHECKS', () => {
    const ids = new Set(ALL_DRIFT_CHECKS.map((c) => c.id));
    for (const c of MODEL_JUDGED_CHECKS) expect(ids.has(c.id)).toBe(false);
    expect(MODEL_JUDGED_CHECKS.map((c) => c.id)).toEqual(['state-narrative-jev']);
  });
});
