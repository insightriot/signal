// M6.E15 REVIEW pass 1, fix batch A — the planner and the BUGS segmenter.
// See .planning/M6.E15-REVIEW.md (C1, I4, S1, S2, S3, the legacy_id
// hygiene suggestion). Fixtures are invented text; no project is named.
//
// C1 (AC4.2): an entry closes only when its marker LEADS with a finish word.
// A finish word later in the phrase, or any negation / futurity qualifier in
// it, never closes the entry. The per-marker AC4.1 cases in
// work-migrate-lists-plan.test.js define what DOES close; these define what
// must not.

import { describe, it, expect } from 'vitest';
import { planListsToRecords } from '../plugin/tools/lib/work-migrate-lists.js';

const DATES = {
  'BUGS.md': { first: '2026-01-05', last: '2026-03-09' },
  'BACKLOG.md': { first: '2026-01-06', last: '2026-03-08' },
  'ISSUES-INBOX.md': { first: '2026-01-07', last: '2026-01-07' },
  'OPEN-QUESTIONS.md': { first: '2026-01-08', last: '2026-02-16' },
};
// PR #7 resolves (D-M6E15-24: a close needs a reference that does); every
// fixture here cites it, so what these tests vary is the wording.
const HASH = 'e41d30e9b7c2a1f0e41d30e9b7c2a1f0e41d30e9';
const EVIDENCE = { commits: [HASH], prs: new Map([[7, HASH]]), epics: new Map() };
// confirmCloses: true is the person's yes to the proposed closes (D-M6E15-25):
// these tests pin what a CONFIRMED close carries. That nothing closes without
// it is pinned in tests/work-migrate-propose.test.js.
const plan = (texts, opts = {}) => planListsToRecords(texts, { key: 'LF', dates: DATES, evidence: EVIDENCE, confirmCloses: true, ...opts });
const entries = (p) => p.records.filter((r) => r.flagged !== 'non-item');
const one = (file, text) => {
  const p = plan({ [file]: text });
  expect(p.errors).toEqual([]);
  const e = entries(p);
  expect(e).toHaveLength(1);
  return e[0];
};
const status = (r) => ({ created: 'N', triaged: 'T', closed: 'C' }[r.record.events.at(-1).type]);
const closedEvent = (r) => r.record.events.find((e) => e.type === 'closed');

const bugEntry = (s) => ['# Bugs', '', '## The exporter drops a row', '', `**Status:** ${s}`, '', 'What happens. PR #7.', '', '---', ''].join('\n');
const backlogRow = (heading, body) => ['# Backlog', '', `### ${heading}`, body, ''].join('\n');
const grouped = (group) => ['# Open Questions', '', `## ${group}`, '', '### Q7 — Which currency?', '', 'Some text, PR #7.', ''].join('\n');

describe('C1 — an open entry is never closed by inference (AC4.2)', () => {
  const unclearStatus = [
    'Not yet fixed — waiting on upstream',
    'Open until upstream is fixed',
    'To be done in v3',
    'blocked until auth is done',
  ];
  for (const s of unclearStatus) {
    it(`a Status line "${s}" → open, flagged unclear`, () => {
      const r = one('BUGS.md', bugEntry(s));
      expect(status(r)).toBe('T');
      expect(closedEvent(r)).toBeUndefined();
      expect(r.flagged).toBe('unclear');
    });
  }

  for (const line of ['**Done when:** the CSV downloads.', '**Definition of done:** tests pass']) {
    it(`a backlog body line "${line}" is never a marker → open, no-marker`, () => {
      const r = one('BACKLOG.md', backlogRow('#40 — Export to CSV · **roadmap** · small', line));
      expect(status(r)).toBe('T');
      expect(closedEvent(r)).toBeUndefined();
      expect(r.flagged).toBe('no-marker');
    });
  }

  for (const group of ['Not yet resolved', 'To be resolved before launch', 'Resolved during v2.6 — but not closed']) {
    it(`a question under "## ${group}" → open, flagged unclear`, () => {
      const r = one('OPEN-QUESTIONS.md', grouped(group));
      expect(status(r)).toBe('T');
      expect(closedEvent(r)).toBeUndefined();
      expect(r.flagged).toBe('unclear');
    });
  }

  it('a finish word that does not lead the phrase is not a marker ("Half are fixed")', () => {
    const r = one('BUGS.md', bugEntry('Half are fixed'));
    expect(status(r)).toBe('T');
    expect(r.flagged).toBe('status-unmapped');
  });
});

describe('S1 — a close date comes only from a date beside the finish marker (D-M6E15-19)', () => {
  // The pass-1 wording ("fixed — regression from the 2025-11-01 release")
  // reads unclear since REVIEW pass 3 (C1: a note of words); the property —
  // a date not beside the finish word is not the close date — is pinned with
  // references between them instead.
  it('"fixed — M9.E1 PR #7 2025-11-01" → the file’s last date, not 2025-11-01', () => {
    const r = one('BUGS.md', bugEntry('fixed — M9.E1 PR #7 2025-11-01'));
    expect(status(r)).toBe('C');
    expect(closedEvent(r).at).toBe(DATES['BUGS.md'].last);
    expect(r.record.events[0].at).toBe(DATES['BUGS.md'].first);
  });

  it('"fixed 2026-02-04 — PR #7." and "DONE — M9.E1, 2026-02-08" keep their dates', () => {
    expect(closedEvent(one('BUGS.md', bugEntry('fixed 2026-02-04 — PR #7.'))).at).toBe('2026-02-04');
    expect(closedEvent(one('BACKLOG.md', backlogRow('#12 — Export · **roadmap** · small · **DONE — M9.E1, 2026-02-08**', 'Body, PR #7.'))).at).toBe('2026-02-08');
  });
});
