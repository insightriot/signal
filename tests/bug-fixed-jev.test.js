import { describe, it, expect, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  makeBugFixedJevCheck,
  releasedSectionsFor,
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

describe('releasedSectionsFor — the unit Jev reads, and the unit the receipt cites', () => {
  it('returns each released section naming the id, heading verbatim, file lines, never [Unreleased]', () => {
    expect(releasedSectionsFor(CHANGELOG, 'B102')).toEqual({
      sections: [{ heading: '## [0.1.27] — 2026-08-18', start: 7, from: 7, to: 10, windowed: false,
        text: '## [0.1.27] — 2026-08-18\n\n**`B102`, fix lane. A P1 against the advice.**\nCorrected the migration text.' }],
      omitted: 0,
    });
    expect(releasedSectionsFor(CHANGELOG, 'B200').sections).toEqual([]);
    expect(releasedSectionsFor(CHANGELOG, 'B75').sections).toMatchObject([{ start: 12, from: 12, to: 16 }]);
  });

  it('matches the id as a whole token (B10 does not match B102)', () => {
    expect(releasedSectionsFor(CHANGELOG, 'B10').sections).toEqual([]);
  });

  // REVIEW: a section chosen BECAUSE it names the id was cut at its first
  // maxChars characters, and could go out without the id (B56 did).
  it('a long section is cut to a window AROUND the id, and says which lines were sent', () => {
    const filler = (n) => Array.from({ length: n }, (_, i) => `filler line ${i} with some words in it`);
    const log = ['## [0.2.0] — x', ...filler(60), 'Fixed B9 at last.', ...filler(60)].join('\n');
    const { sections } = releasedSectionsFor(log, 'B9', { maxChars: 400 });
    expect(sections).toHaveLength(1);
    const [sec] = sections;
    expect(sec.windowed).toBe(true);
    expect(sec.text).toContain('Fixed B9 at last.');
    expect(sec.text.startsWith('## [0.2.0] — x\n…\n')).toBe(true);
    expect(sec.text.length).toBeLessThanOrEqual(400);
    expect(sec.from).toBeLessThan(62);
    expect(sec.to).toBeGreaterThan(62); // line 62 is the id's line
    // …and the cited lines ARE the lines sent — exactly, not just around the id.
    expect(log.split('\n').slice(sec.from - 1, sec.to).join('\n')).toBe(sec.text.split('\n').slice(2).join('\n'));
  });

  it('sends at most maxSections sections — the newest, in file order — and counts the rest', () => {
    const log = [1, 2, 3, 4, 5].map((v) => `## [0.${6 - v}.0]\n\nB5 mentioned.`).join('\n\n');
    const { sections, omitted } = releasedSectionsFor(log, 'B5', { maxSections: 3 });
    expect(sections.map((x) => x.heading)).toEqual(['## [0.5.0]', '## [0.4.0]', '## [0.3.0]']);
    expect(omitted).toBe(2);
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
      // The claim quotes the row VERBATIM from its line — an off-by-one would
      // cite the neighbouring row (REVIEW: the excerpt was never checked).
      expect(f.receipt.claim).toEqual({ file: '.planning/BUGS.md', line: 6, excerpt: BUGS.split('\n')[5] });
      expect(f.receipt.claim.excerpt).toMatch(/^\| B102 \|/);
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

  it('is declared model-judged, and the result says so — AC9.4 by construction', async () => {
    const dir = await project();
    try {
      const [row] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask: fakeAsk({ B102: 0.99 }), key: 'k' })])).results;
      expect(row.judged).toBe('model');
    } finally { await cleanup(dir); }
  });

  it('flags at exactly the threshold (0.5), not below it', async () => {
    const dir = await project();
    try {
      const [at] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask: fakeAsk({ B102: 0.5 }), key: 'k' })])).results;
      expect(at.findings).toHaveLength(1);
      const [below] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask: fakeAsk({ B102: 0.49 }), key: 'k' })])).results;
      expect(below.findings).toHaveLength(0);
    } finally { await cleanup(dir); }
  });

  // REVIEW: `## v0.3.0` headings yielded zero questions and "checked 0 of 0" —
  // clean. A file this check cannot read is not clean.
  it('a CHANGELOG with no `## [version]` headings → cannot-evaluate, not clean', async () => {
    const dir = await project(BUGS, '# Changelog\n\n## v0.3.0 — 2026-09-01\n\n- B102 fixed.\n');
    try {
      const ask = vi.fn();
      const [row] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask, key: 'k' })])).results;
      expect(row.status).toBe(STATUS.CANNOT_EVALUATE);
      expect(row.reason).toMatch(/no `## \[version\]` release headings/);
      expect(ask).not.toHaveBeenCalled();
    } finally { await cleanup(dir); }
  });

  it('a BUGS.md symlinked outside the project is not read (security, REVIEW)', async () => {
    const dir = await project();
    const outside = await mkdtemp(join(tmpdir(), 'sig-outside-'));
    try {
      await writeFile(join(outside, 'secret'), '| B1 | `confirmed` | P1 | secret |\n');
      await rm(join(dir, '.planning/BUGS.md'));
      await symlink(join(outside, 'secret'), join(dir, '.planning/BUGS.md'));
      const ask = vi.fn();
      const [row] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask, key: 'k' })])).results;
      expect(row.status).toBe(STATUS.CANNOT_EVALUATE);
      expect(row.reason).toMatch(/outside the project/);
      expect(ask).not.toHaveBeenCalled();
    } finally { await cleanup(dir); await cleanup(outside); }
  });

  it('bounded: over the cap → unchecked over-cap; past the budget → unchecked budget; each request gets min(timeout, remaining)', async () => {
    const dir = await project();
    try {
      const capped = fakeAsk({});
      const [c] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask: capped, key: 'k', maxBugs: 1 })])).results;
      expect(capped).toHaveBeenCalledTimes(1);
      expect(c.coverage).toMatchObject({ checked: 1, total: 2, unchecked: [expect.objectContaining({ reason: 'over-cap' })] });

      let t = 0;
      const seen = [];
      const slow = vi.fn(async ({ timeoutMs }) => { seen.push(timeoutMs); t += 25000; return { ok: true, noul: 0.05, model: 'm' }; });
      const [b] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask: slow, key: 'k', now: () => t, budgetMs: 30000, requestTimeoutMs: 20000, concurrency: 1 })])).results;
      expect(seen).toEqual([20000, 5000]); // 2nd request: 30 000 − 25 000 left, under the 20 000 per-request cap
      expect(b.coverage.checked).toBe(2);

      t = 0;
      const [bb] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask: slow, key: 'k', now: () => t, budgetMs: 20000, concurrency: 1 })])).results;
      expect(bb.coverage.unchecked).toEqual([expect.objectContaining({ reason: 'budget' })]);
    } finally { await cleanup(dir); }
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

describe('releasedSectionsFor — window edge cases (REVIEW pass 2)', () => {
  const filler = (n) => Array.from({ length: n }, (_, i) => `filler line ${i} with some words in it`);

  it('an id only in the heading does not throw, and the heading (with the id) is sent', () => {
    const log = ['## [0.2.0] — B9 hotfix', ...filler(200)].join('\n');
    const { sections } = releasedSectionsFor(log, 'B9', { maxChars: 400 });
    expect(sections).toHaveLength(1);
    expect(sections[0].text).toContain('B9');
  });

  it('a single line longer than the budget is cut around the id, so the id is always sent', () => {
    const log = ['## [0.2.0]', 'x'.repeat(5000) + ' Fixed B9.', ...filler(3)].join('\n');
    const { sections } = releasedSectionsFor(log, 'B9', { maxChars: 4000 });
    expect(sections[0].text).toContain('Fixed B9.');
    expect(sections[0].text.length).toBeLessThanOrEqual(4000);
  });
});

describe('older sections not read are reported in coverage, flagged or not (B39, REVIEW pass 2)', () => {
  it('a bug named in 5 sections, Jev says "not fixed": coverage still lists it', async () => {
    const log = '# Changelog\n\n' + [1, 2, 3, 4, 5].map((v) => `## [0.${6 - v}.0]\n\nB102 mentioned.`).join('\n\n') + '\n';
    const dir = await project(BUGS, log);
    try {
      const [row] = (await runDriftChecks(dir, [makeBugFixedJevCheck({ ask: fakeAsk({ B102: 0.05 }), key: 'k' })])).results;
      expect(row.findings).toHaveLength(0);
      expect(row.coverage.sectionsNotRead).toEqual(['B102 (2)']);
    } finally { await cleanup(dir); }
  });
});
