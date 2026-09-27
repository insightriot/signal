import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  makeBugFixedJevCheck,
  releasedParagraphsNaming,
  releasedSectionsNaming,
  releasedSectionSpans,
  bugFixedQuestion,
} from '../plugin/tools/lib/bug-fixed-jev.js';
import { runDriftChecks, STATUS } from '../plugin/tools/lib/state-drift.js';
import { ALL_DRIFT_CHECKS } from '../plugin/tools/lib/published-facts.js';
import { refusableFindings, isReceipt } from '../plugin/tools/lib/receipt.js';
import { JEV_REASON } from '../plugin/tools/lib/jev.js';

/**
 * M6.E3 t3.1 (D-M6E3-15) — a `confirmed` BUGS.md row that a released changelog
 * entry may say was fixed, judged by Jev. Advisory: its findings carry a
 * receipt and never refuse. No test touches the network.
 */

const BUGS = [
  '# Bugs',
  '',
  '| ID | Status | Pri | Summary |',
  '|---|---|---|---|',
  '| B75 | `confirmed` | P2 | **the dial is prose.** |',       // line 5
  '| B102 | `confirmed` | P1 | **migration advice wrong.** |',  // line 6
  '| B200 | `confirmed` | P3 | **never mentioned.** |',         // line 7
  '| B90 | `fixed` | P2 | **already fixed.** |',                // line 8
].join('\n');

const CHANGELOG = [
  '# Changelog',                                     // 1
  '',                                                // 2
  '## [Unreleased]',                                 // 3
  '',                                                // 4
  '- B200 is being worked on.',                      // 5
  '',                                                // 6
  '## [0.1.27] — 2026-08-18',                        // 7
  '',                                                // 8
  '**`B102`, fix lane. A P1 against the advice.**',  // 9
  'Corrected the migration text.',                   // 10
  '',                                                // 11
  '## [0.1.24] — 2026-08-09',                        // 12
  '',                                                // 13
  'Measured with `B75` as evidence; `B75` stays open.', // 14
  '',                                                // 15
  '- `B90` fixed.',                                  // 16
].join('\n');

async function project(bugs = BUGS, changelog = CHANGELOG) {
  const dir = await mkdtemp(join(tmpdir(), 'sig-bugjev-'));
  await mkdir(join(dir, '.planning'));
  await writeFile(join(dir, '.planning/STATE.md'), '---\nschema_version: 1\nphase: EXECUTE\n---\nbody\n');
  if (bugs !== null) await writeFile(join(dir, '.planning/BUGS.md'), bugs);
  if (changelog !== null) await writeFile(join(dir, 'CHANGELOG.md'), changelog);
  return dir;
}
const cleanup = (dir) => rm(dir, { recursive: true, force: true });

const fakeAsk = (byId) => vi.fn(async ({ question }) => {
  const id = question.instructions.match(/Bug (B\d+)/)[1];
  return { ok: true, noul: byId[id] ?? 0.05, model: 'jev-1.13.0' };
});

describe('releasedParagraphsNaming', () => {
  it('returns released-section paragraphs naming the id, with file lines; never [Unreleased]', () => {
    expect(releasedParagraphsNaming(CHANGELOG, 'B102')).toEqual([
      { line: 9, text: '**`B102`, fix lane. A P1 against the advice.**\nCorrected the migration text.' },
    ]);
    expect(releasedParagraphsNaming(CHANGELOG, 'B200')).toEqual([]);
  });

  it('matches the id as a whole token (B10 does not match B102)', () => {
    expect(releasedParagraphsNaming(CHANGELOG, 'B10')).toEqual([]);
  });
});

describe('the question is the spike\'s, with the id substituted', () => {
  it('matches the stored wording for B33', () => {
    const q = bugFixedQuestion('B33');
    expect(q.type).toBe('noul');
    expect(q.instructions).toBe('Bug B33 is recorded as still open. Does any of this released changelog text say that B33 itself was fixed, closed, or resolved?');
    expect(q.criteria.false).toMatch(/says it remains open/);
  });
});

describe('makeBugFixedJevCheck', () => {
  it('asks only about confirmed rows a released section names, and flags a yes ≥ 0.5 with a receipt', async () => {
    const dir = await project();
    try {
      const ask = fakeAsk({ B102: 0.53, B75: 0.05 });
      const report = await runDriftChecks(dir, [makeBugFixedJevCheck({ ask, key: 'k' })]);
      const row = report.results[0];
      // B200: only in [Unreleased]; B90: not confirmed → neither asked
      expect(ask).toHaveBeenCalledTimes(2);
      expect(row.findings).toHaveLength(1);
      const [f] = row.findings;
      expect(isReceipt(f.receipt)).toBe(true);
      expect(f.receipt.claim).toMatchObject({ file: '.planning/BUGS.md', line: 6 });
      // The receipt cites what Jev JUDGED — the release section — verbatim at
      // its heading, and the message names the range read (VERIFY finding:
      // it used to cite the headline, which never says "fixed").
      expect(f.receipt.evidence).toEqual({ source: 'CHANGELOG.md', line: 7, excerpt: '## [0.1.27] — 2026-08-18' });
      expect(f.message).toContain('CHANGELOG.md:7–10');
      expect(f.judgedBy).toEqual({ model: 'jev-1.13.0', confidence: 0.53 });
      expect(f.message).toMatch(/B102/);
      expect(f.message).toMatch(/can vary/);
      expect(row.coverage).toMatchObject({ checked: 2, total: 2, unchecked: [] });
    } finally { await cleanup(dir); }
  });

  it('sends the whole released SECTION naming the id — a headline alone is not enough (measured)', async () => {
    const dir = await project();
    try {
      const ask = fakeAsk({});
      await runDriftChecks(dir, [makeBugFixedJevCheck({ ask, key: 'k' })]);
      const b102 = ask.mock.calls.find(([a]) => a.question.instructions.includes('B102'))[0];
      expect(b102.state).toBe('## [0.1.27] — 2026-08-18\n\n**`B102`, fix lane. A P1 against the advice.**\nCorrected the migration text.');
      const b75 = ask.mock.calls.find(([a]) => a.question.instructions.includes('B75'))[0];
      expect(b75.state).toContain('## [0.1.24]');
      expect(b75.state).toContain('`B75` stays open.');
    } finally { await cleanup(dir); }
  });

  it('releasedSectionSpans gives each released section naming the id, heading verbatim, trailing blanks trimmed', () => {
    expect(releasedSectionSpans(CHANGELOG, 'B102')).toEqual([{ start: 7, end: 10, heading: '## [0.1.27] — 2026-08-18' }]);
    expect(releasedSectionSpans(CHANGELOG, 'B200')).toEqual([]);
    expect(releasedSectionSpans(CHANGELOG, 'B75')).toEqual([{ start: 12, end: 16, heading: '## [0.1.24] — 2026-08-09' }]);
  });

  it('releasedSectionsNaming caps each section', () => {
    expect(releasedSectionsNaming(CHANGELOG, 'B102', 20)).toEqual(['## [0.1.27] — 2026-0']);
  });

  it('never refuses, and is not in ALL_DRIFT_CHECKS (docs-sweep stays offline)', async () => {
    const dir = await project();
    try {
      const report = await runDriftChecks(dir, [makeBugFixedJevCheck({ ask: fakeAsk({ B102: 0.99 }), key: 'k' })]);
      expect(report.results[0].findings).toHaveLength(1);
      expect(refusableFindings(report)).toEqual([]);
      expect(ALL_DRIFT_CHECKS.map((c) => c.id)).not.toContain('bug-fixed-jev');
    } finally { await cleanup(dir); }
  });

  it('no key → cannot-evaluate, naming the key; no BUGS.md → not applicable; no CHANGELOG → cannot-evaluate', async () => {
    const a = await project();
    const b = await project(null);
    const c = await project(BUGS, null);
    try {
      const ask = vi.fn();
      const [ra] = (await runDriftChecks(a, [makeBugFixedJevCheck({ ask, key: '' })])).results;
      expect(ra.status).toBe(STATUS.CANNOT_EVALUATE);
      expect(ra.reason).toMatch(/TYPESAFE_API_KEY/);
      const [rb] = (await runDriftChecks(b, [makeBugFixedJevCheck({ ask, key: 'k' })])).results;
      expect(rb.status).toBe(STATUS.NOT_APPLICABLE);
      const [rc] = (await runDriftChecks(c, [makeBugFixedJevCheck({ ask, key: 'k' })])).results;
      expect(rc.status).toBe(STATUS.CANNOT_EVALUATE);
      expect(ask).not.toHaveBeenCalled();
    } finally { await Promise.all([a, b, c].map(cleanup)); }
  });

  it('every request failing → cannot-evaluate with the reason; some failing → unchecked with reason', async () => {
    const dir = await project();
    try {
      const all = vi.fn().mockResolvedValue({ ok: false, reason: JEV_REASON.UNAUTHORIZED });
      const [r1] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask: all, key: 'k' })])).results;
      expect(r1.status).toBe(STATUS.CANNOT_EVALUATE);
      expect(r1.reason).toMatch(/unauthorized/);

      const some = vi.fn()
        .mockResolvedValueOnce({ ok: false, reason: JEV_REASON.RATE_LIMITED })
        .mockResolvedValue({ ok: true, noul: 0.05, model: 'm' });
      const [r2] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask: some, key: 'k', concurrency: 1 })])).results;
      expect(r2.coverage.checked).toBe(1);
      expect(r2.coverage.unchecked).toEqual([expect.objectContaining({ reason: JEV_REASON.RATE_LIMITED })]);
    } finally { await cleanup(dir); }
  });
});
