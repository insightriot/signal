// M6.E15 fix loop 2 — three of REVIEW pass 2's suggestions, each a few lines:
//   - C1 controls and bidi overrides/isolates never reach a record title (the
//     dry-run report reads titles; `printable` covers the report itself);
//   - `markerDates` reads a date written after a PR reference in the marker
//     ("Resolved (PR #23, 2026-02-16)");
//   - an impossible calendar date ("2026-02-30") never becomes `closed.at`.
// Fixtures are invented text; no project is named.

import { describe, it, expect } from 'vitest';
import { markerDates } from '../plugin/tools/lib/work-migrate.js';
import { planListsToRecords } from '../plugin/tools/lib/work-migrate-lists.js';

const DATES = { 'BUGS.md': { first: '2026-01-05', last: '2026-03-09' }, 'BACKLOG.md': { first: '2026-01-06', last: '2026-03-08' } };
const HASH = 'e41d30e9b7c2a1f0e41d30e9b7c2a1f0e41d30e9';
const EVIDENCE = { commits: [HASH], prs: new Map([[7, HASH], [23, HASH]]), epics: new Map() };
// confirmCloses: true is the person's yes to the proposed closes (D-M6E15-25):
// these tests pin what a CONFIRMED close carries. That nothing closes without
// it is pinned in tests/work-migrate-propose.test.js.
const plan = (texts) => planListsToRecords(texts, { key: 'LF', dates: DATES, evidence: EVIDENCE, confirmCloses: true });
const bugEntry = (heading, s) => ['# Bugs', '', `## ${heading}`, '', `**Status:** ${s}`, '', 'PR #7.', '', '---', ''].join('\n');

describe('titles carry no control or bidi characters', () => {
  it('C0, C1, RLO and an isolate are stripped from a record title', () => {
    const p = plan({ 'BUGS.md': bugEntry('Rows\u0007 vanish\u009b ‮evil‬ ⁦x⁩', 'needs-triage') });
    expect(p.errors).toEqual([]);
    // eslint-disable-next-line no-control-regex
    expect(p.records[0].record.title).not.toMatch(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/);
    expect(p.records[0].record.title).toBe('Rows vanish evil x');
  });
});

describe('markerDates reads a date after a PR reference', () => {
  it('"Resolved (PR #23, 2026-02-16)" → 2026-02-16', () => {
    expect(markerDates('Resolved (PR #23, 2026-02-16)')).toEqual(['2026-02-16']);
    expect(markerDates('fixed in #23 — 2026-02-17')).toEqual(['2026-02-17']);
  });

  it('the close is at that date', () => {
    const p = plan({ 'BUGS.md': bugEntry('Rows vanish', 'Resolved (PR #23, 2026-02-16)') });
    expect(p.records[0].record.events.at(-1)).toMatchObject({ type: 'closed', at: '2026-02-16' });
  });
});

describe('an impossible calendar date never becomes closed.at', () => {
  it('"fixed 2026-02-30" → the file’s last date', () => {
    const p = plan({ 'BUGS.md': bugEntry('Rows vanish', 'fixed 2026-02-30') });
    expect(p.errors).toEqual([]);
    expect(p.records[0].record.events.at(-1)).toMatchObject({ type: 'closed', at: DATES['BUGS.md'].last });
  });
});
