// M6.E15 fix loop 2 — BUGS.md table shapes REVIEW pass 2 found lost.
//   I-B: a bug table with bare numeric IDs (`| 1 | fixed |`) became one
//        flagged blob (AC7.1) — each row is an item, the number its old ID.
//   I-C: a struck-through, linked or ticked ID cell (`~~B1~~`, `[B1](x.md)`,
//        `B1 ✅`) lost its ID and was left open (AC5.2) — the ID is read
//        through the decoration; the status cell and the strike still count.
// Fixtures are invented text; no project is named.

import { describe, it, expect } from 'vitest';
import { planListsToRecords } from '../plugin/tools/lib/work-migrate-lists.js';

const DATES = { 'BUGS.md': { first: '2026-01-05', last: '2026-03-09' } };
const HASH = 'e41d30e9b7c2a1f0e41d30e9b7c2a1f0e41d30e9';
const EVIDENCE = { commits: [HASH], prs: new Map([[7, HASH]]), epics: new Map() };
const plan = (text) => planListsToRecords({ 'BUGS.md': text }, { key: 'LF', dates: DATES, evidence: EVIDENCE });
const status = (r) => ({ created: 'N', triaged: 'T', closed: 'C' }[r.record.events.at(-1).type]);
const table = (...rows) => ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|', ...rows, ''].join('\n');

describe('I-B — bare numeric IDs: one item per row, the number kept as legacy_id (AC7.1)', () => {
  it('| 1 | fixed | … PR #7 | and | 2 | open | … | → two items, 1 closed and 2 open', () => {
    const p = plan(table('| 1 | fixed | P2 | Rows vanish — PR #7. |', '| 2 | open | P1 | Totals are wrong. |'));
    expect(p.errors).toEqual([]);
    expect(p.records.map((r) => r.flagged)).not.toContain('non-item');
    expect(p.records.map((r) => r.record.legacy_id)).toEqual(['1', '2']);
    expect(p.records.map((r) => r.record.title)).toEqual(['Rows vanish — PR #7.', 'Totals are wrong.']);
    expect(status(p.records[0])).toBe('C');
    expect(status(p.records[1])).toBe('T');
    expect(p.records[0].body.split('\n')[0]).toBe('Old ID: 1');
  });
});

describe('I-C — a decorated ID cell keeps its ID (AC5.2)', () => {
  it('[B1](notes/b1.md) → legacy_id B1; the status cell still decides', () => {
    const p = plan(table('| [B1](notes/b1.md) | fixed | P2 | Rows vanish — PR #7. |'));
    expect(p.errors).toEqual([]);
    expect(p.records).toHaveLength(1);
    expect(p.records[0].record.legacy_id).toBe('B1');
    expect(status(p.records[0])).toBe('C');
  });

  for (const cell of ['B1 ✅', 'B1 ✔️', 'B1 🎉']) {
    it(`"${cell}" → legacy_id B1`, () => {
      const p = plan(table(`| ${cell} | open | P2 | Rows vanish. |`));
      expect(p.records).toHaveLength(1);
      expect(p.records[0].record.legacy_id).toBe('B1');
      expect(p.records[0].flagged).not.toBe('id-unreadable');
    });
  }

  it('~~B1~~ with a finished status and a resolving reference → legacy_id B1, closed', () => {
    const p = plan(table('| ~~B1~~ | fixed | P2 | Rows vanish — PR #7. |'));
    expect(p.records).toHaveLength(1);
    expect(p.records[0].record.legacy_id).toBe('B1');
    expect(status(p.records[0])).toBe('C');
  });

  it('~~B1~~ is a strike marker like a struck heading: beside an open status → open, flagged conflict', () => {
    const p = plan(table('| ~~B1~~ | open | P2 | Rows vanish — PR #7. |'));
    expect(p.records[0].record.legacy_id).toBe('B1');
    expect(status(p.records[0])).toBe('T');
    expect(p.records[0].flagged).toBe('conflict');
  });

  it('~~B1~~ alone (empty status) still needs a resolving reference', () => {
    expect(status(plan(table('| ~~B1~~ |  | P2 | Rows vanish. |')).records[0])).toBe('T');
    expect(status(plan(table('| ~~B1~~ |  | P2 | Rows vanish — PR #7. |')).records[0])).toBe('C');
  });
});
