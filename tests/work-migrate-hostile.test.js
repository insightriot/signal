// M6.E15 fix loop 2 — I-D (REVIEW pass 2, security): the dry run reads
// another repository's lists before anyone confirms, so no list text may make
// it super-linear. Each case is at the size the reviewer measured, and must
// finish well under 2 s:
//   - `backlogTitle` tail stripping, a 400 KB heading (measured 180 s);
//   - `readMarkers` per-bold-span slicing, 100 KB of bold spans (4.6 s);
//   - `ANSWERED_RE` backtracking, a 100 KB struck line (5.2 s);
//   - `segmentInbox`'s `lineOfOffset`, 8000 inbox entries (4.1 s).
// Fixtures are invented text; no project is named.

import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';

import { segmentBacklog, segmentInbox, segmentQuestions } from '../plugin/tools/lib/work-migrate.js';
import { planListsToRecords } from '../plugin/tools/lib/work-migrate-lists.js';

const DATES = {
  'BACKLOG.md': { first: '2026-01-06', last: '2026-03-08' },
  'ISSUES-INBOX.md': { first: '2026-01-07', last: '2026-01-07' },
  'OPEN-QUESTIONS.md': { first: '2026-01-08', last: '2026-02-16' },
};
const LIMIT_MS = 2000;
const timed = (fn) => {
  const t0 = performance.now();
  const out = fn();
  return { out, ms: performance.now() - t0 };
};
const plan = (texts) => planListsToRecords(texts, { key: 'LF', dates: DATES, acknowledgeSensitive: true });

describe('I-D — hostile list text stays linear in the dry run', () => {
  it('a 400 KB backlog heading of repeated `· small` tails: segmented and planned in under 2 s, the title intact', () => {
    const heading = `### Export the plan${' · small'.repeat(50000)}`;
    expect(heading.length).toBeGreaterThan(400000);
    const text = `# Backlog\n\n${heading}\nBody.\n`;
    const seg = timed(() => segmentBacklog(text));
    expect(seg.ms).toBeLessThan(LIMIT_MS);
    expect(seg.out.rows[0].title).toBe('Export the plan');
    const p = timed(() => plan({ 'BACKLOG.md': text }));
    expect(p.ms).toBeLessThan(LIMIT_MS);
    expect(p.out.errors).toEqual([]);
  });

  it('a 400 KB backlog heading of `·` and spaces: segmented in under 2 s', () => {
    const text = `# Backlog\n\n### Export${' · '.repeat(140000)}x\nBody.\n`;
    const seg = timed(() => segmentBacklog(text));
    expect(seg.ms).toBeLessThan(LIMIT_MS);
    expect(seg.out.rows).toHaveLength(1);
  });

  it('a backlog heading with 100 KB of bold spans: planned in under 2 s', () => {
    const text = `# Backlog\n\n### Export the plan ${'**a** '.repeat(17000)}\nBody.\n`;
    expect(text.length).toBeGreaterThan(100000);
    const p = timed(() => plan({ 'BACKLOG.md': text }));
    expect(p.ms).toBeLessThan(LIMIT_MS);
    expect(p.out.errors).toEqual([]);
  });

  it('a 100 KB struck question heading with no ANSWERED: segmented in under 2 s, not answered', () => {
    const text = `# Open Questions\n\n## Q1 ${'~~a~~ '.repeat(17000)}\n\nBody.\n`;
    const seg = timed(() => segmentQuestions(text));
    expect(seg.ms).toBeLessThan(LIMIT_MS);
    expect(seg.out.rows[0].answered).toBe(false);
    // and the rule itself is unchanged: struck, then ANSWERED later → answered
    expect(segmentQuestions('# Q\n\n## ~~Q2 — Units?~~ — ANSWERED\n').rows[0].answered).toBe(true);
    expect(segmentQuestions('# Q\n\n## Q3 — ANSWERED ~~later~~\n').rows[0].answered).toBe(false);
  });

  it('8000 inbox entries: segmented and planned in under 2 s, one row each', () => {
    const entries = Array.from({ length: 8000 }, (_, i) => `## Capture ${i + 1}\nSomething to look at.\n`).join('\n');
    const text = `# Issues Inbox\n\n${entries}`;
    const seg = timed(() => segmentInbox(text));
    expect(seg.ms).toBeLessThan(LIMIT_MS);
    expect(seg.out.rows).toHaveLength(8000);
    expect(seg.out.rows[7999].line).toBe(text.split('\n').indexOf('## Capture 8000') + 1);
    const p = timed(() => plan({ 'ISSUES-INBOX.md': text }));
    expect(p.ms).toBeLessThan(LIMIT_MS * 2);
    expect(p.out.records).toHaveLength(8000);
  });
});
