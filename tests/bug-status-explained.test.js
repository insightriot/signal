// SIG-362 — a fixed bug whose status explains the fix is proposed for close.
//
// Found on the test project: 8 of 9 fixed bugs read "**Status:** fixed in
// <Epic> (<requirement>), [PR #N](…): <what changed>". The finished-wording
// rule allows nothing but references after the finish word, so all 8 stayed
// open and the generated bug list showed them as confirmed — less accurate than
// the hand-kept list it replaced.
//
// The rule for a bug's status (a `**Status:**` line or a bug-table status
// cell): the clause before the first `:`, ` — ` or sentence end is a finish
// word and references only, citing a PR, Epic or commit; what follows may
// explain the fix in words, unless it says the fix was undone or partial. An
// `Earlier:` sentence is history and is not read. Every other list keeps the
// strict rule. Evidence and the person's yes still decide the close.

import { describe, it, expect } from 'vitest';

import { planListsToRecords } from '../plugin/tools/lib/work-migrate-lists.js';

const DATES = { 'BUGS.md': { first: '2026-01-05', last: '2026-03-09' }, 'BACKLOG.md': { first: '2026-01-06', last: '2026-03-08' } };
const HASH = 'e41d30e9b7c2a1f0e41d30e9b7c2a1f0e41d30e9';
const EVIDENCE = {
  commits: [HASH],
  prs: new Map([[157, HASH]]),
  epics: new Map([['M2.10.E2', '.planning/archive/M2.10.E2-RETROSPECTIVE.md']]),
  origin: { host: 'example.com', repo: 'acme/ledger' },
};
const LINK = '[PR #157](https://example.com/acme/ledger/pull/157)';

const one = (file, text, opts = {}) => {
  const p = planListsToRecords({ [file]: text }, { key: 'LF', dates: DATES, evidence: EVIDENCE, ...opts });
  expect(p.errors).toEqual([]);
  const e = p.records.filter((r) => r.flagged !== 'non-item');
  expect(e).toHaveLength(1);
  return { record: e[0], proposed: p.proposedCloses };
};
const bugEntry = (s) => ['# Bugs', '', '## The exporter drops a row', '', `**Status:** ${s}`, '', 'What happens.', '', '---', ''].join('\n');
const bugTable = (cell) => ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|', `| B3 | ${cell} | P2 | A defect |`, ''].join('\n');
const backlogRow = (lead) => ['# Backlog', '', '### #40 — Export to CSV · **roadmap** · small', `**${lead}** in PR #157: the export runs.`, ''].join('\n');

// The shapes the test project writes, with this file's IDs.
const PROPOSED = [
  `fixed in M2.10.E2 (FR-01, AC-01.6), ${LINK}: the snapshot read uses the shared rule and returns the payload. Earlier: reopened 2026-10-09, scoped into M2.10.E2 (FR-01).`,
  `fixed in M2.10.E2 (S4) — a failed open now gets its own banner whose Try again re-runs the open. ${LINK}.`,
  `fixed in M2.10.E2, ${LINK}.`,
  `fixed in M2.10.E2, ${LINK}:`,
  `fixed in M2.10.E2 (FR-02), ${LINK}: opening from the cache holds the save until the saved version is checked (including Revise, Revert and Import).`,
  `fixed in M2.10.E2 (FR-06, S5), ${LINK}: a per-device record decides which copy wins. Found by review; pre-existing, not caused by M2.10.E2.`,
  'Resolved in PR #157: snapshots are no longer strict-valid at write time.',
  `fixed in M2.10.E2, ${LINK}: reads use the shared rule. Earlier status: not-a-bug (closed 2026-01-04 during M2.10.E2 DISCUSS) — snapshots were written after a strict check. Dropped from M2.10.E2.`,
];

const STAY_UNCLEAR = [
  'fixed in PR #157 — but then reverted in #170',
  'fixed in PR #157: reopened 2026-03-01 after a crash',
  'fixed in PR #157 — rolled back the next day',
  'fixed in PR #157: not fixed on the old exporter',
  'fixed in PR #157 — still fails on Safari',
  'fixed in PR #157 — only on desktop',
  'fixed in PR #157 — not on Windows',
  'fixed in PR #157: works now. Earlier: confirmed. Now: regressed again.',
  'Fixed — not on Windows',
  'Resolved: no',
  'Done — TBD',
  'fixed in theory: PR #157',
  'Fixed, then reverted in PR #157',
  'fixed in PR #157: not-a-bug after all',
];

describe('SIG-362 — a bug status that explains the fix', () => {
  for (const s of PROPOSED) {
    it(`Status line is proposed for close: "${s.slice(0, 60)}…"`, () => {
      const { record, proposed } = one('BUGS.md', bugEntry(s));
      expect(record.flagged).toBe('looks-finished');
      expect(proposed).toHaveLength(1);
      expect(proposed[0].reason).toBe('fixed');
    });
  }

  it('a confirmed close records the status wording and the evidence', () => {
    const { record } = one('BUGS.md', bugEntry(PROPOSED[0]), { confirmCloses: true });
    const closed = record.record.events.find((e) => e.type === 'closed');
    expect(closed).toBeDefined();
    expect(closed.proof).toMatch(/PR #157/);
  });

  it('a bug-table status cell follows the same rule', () => {
    expect(one('BUGS.md', bugTable('fixed in PR #157: rows are kept now')).record.flagged).toBe('looks-finished');
    expect(one('BUGS.md', bugTable('fixed in PR #157 — reverted')).record.flagged).toBe('unclear');
  });

  for (const s of STAY_UNCLEAR) {
    it(`stays open, flagged unclear: "${s}"`, () => {
      const { record, proposed } = one('BUGS.md', bugEntry(s));
      expect(record.flagged).toBe('unclear');
      expect(proposed).toEqual([]);
    });
  }

  it('without evidence for the reference it is not proposed', () => {
    const { record, proposed } = one('BUGS.md', bugEntry('fixed in PR #999: the export runs.'));
    expect(record.flagged).toBe('no-evidence');
    expect(proposed).toEqual([]);
  });

  it('other lists keep the strict rule: a backlog bold lead with an explanation stays unclear', () => {
    expect(one('BACKLOG.md', backlogRow('Done')).record.flagged).toBe('unclear');
  });
});
