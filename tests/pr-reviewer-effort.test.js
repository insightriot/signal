// Did the PR reviewer actually review? From 2026-09-25 to 2026-10-05 every
// reviewer run stopped after 2 turns (~$0.10) and passed — a green tick and an
// empty thread list that looked exactly like a clean review. These pin that such
// a run is flagged, and that a run SHIP could not read never reads as reviewed.

import { describe, expect, it } from 'vitest';

import {
  formatReviewerEffort,
  readReviewerEffort,
} from '../plugin/tools/lib/pr-review-findings.js';

const args = { owner: 'insightriot', repo: 'signal', pr: 280 };

const logWith = (turns, cost) =>
  [
    'claude-review\tUNKNOWN STEP\t2026-10-04T22:29:06Z   "type": "result",',
    `claude-review\tUNKNOWN STEP\t2026-10-04T22:29:06Z   "num_turns": ${turns},`,
    `claude-review\tUNKNOWN STEP\t2026-10-04T22:29:06Z   "total_cost_usd": ${cost},`,
  ].join('\n');

function gh({ additions = 900, deletions = 100, runs, log, fail } = {}) {
  return (cmd, a) => {
    if (fail && a[0] === fail) throw new Error('HTTP 502');
    if (a[0] === 'pr') return JSON.stringify({ additions, deletions, headRefOid: 'abc123' });
    if (a[0] === 'run' && a[1] === 'list') {
      return JSON.stringify(runs ?? [{ databaseId: 7, status: 'completed', conclusion: 'success' }]);
    }
    if (a[0] === 'run' && a[1] === 'view') return log ?? logWith(35, 1.99);
    throw new Error(`unexpected gh ${a.join(' ')}`);
  };
}

describe('reading the reviewer run', () => {
  it('flags the measured hollow run: 2 turns, $0.10, on a 1000-line change', () => {
    const r = readReviewerEffort({ ...args, execFn: gh({ log: logWith(2, 0.100719) }) });
    expect(r).toMatchObject({ status: 'hollow', turns: 2, costUsd: 0.100719, changedLines: 1000 });
  });

  it('passes the measured real review: 35 turns, $2.00', () => {
    const r = readReviewerEffort({ ...args, execFn: gh() });
    expect(r.status).toBe('reviewed');
  });

  it('passes a real review whose agents did the work: 9 turns, $0.85 (#289)', () => {
    // Sub-agent turns are not counted in num_turns, so a full review can show few turns.
    expect(readReviewerEffort({ ...args, execFn: gh({ log: logWith(9, 0.85) }) }).status).toBe('reviewed');
  });

  it('flags the hollow run after #283: 5 turns, $0.16 (#284)', () => {
    expect(readReviewerEffort({ ...args, execFn: gh({ log: logWith(5, 0.16) }) }).status).toBe('hollow');
    expect(readReviewerEffort({ ...args, execFn: gh({ log: logWith(5, 0.9) }) }).status).toBe('hollow');
  });

  it('flags many cheap turns as well as few expensive ones', () => {
    expect(readReviewerEffort({ ...args, execFn: gh({ log: logWith(20, 0.12) }) }).status).toBe('hollow');
    expect(readReviewerEffort({ ...args, execFn: gh({ log: logWith(3, 1.5) }) }).status).toBe('hollow');
  });

  it('does not flag a short run on a small change', () => {
    const r = readReviewerEffort({ ...args, execFn: gh({ additions: 3, deletions: 1, log: logWith(2, 0.1) }) });
    expect(r.status).toBe('small-change');
  });

  it('reads the LAST result in the log, not an earlier one', () => {
    const log = `${logWith(2, 0.1)}\n${logWith(35, 2)}`;
    expect(readReviewerEffort({ ...args, execFn: gh({ log }) }).status).toBe('reviewed');
  });
});

describe('cannot-check is never a review', () => {
  const cases = [
    ['no PR', { owner: 'o', repo: 'r', pr: null, execFn: gh() }, /no pull request/],
    ['no reviewer run', { ...args, execFn: gh({ runs: [] }) }, /no reviewer run/],
    ['run in progress', { ...args, execFn: gh({ runs: [{ databaseId: 7, status: 'in_progress', conclusion: null }] }) }, /still in_progress/],
    ['run skipped', { ...args, execFn: gh({ runs: [{ databaseId: 7, status: 'completed', conclusion: 'skipped' }] }) }, /"skipped"/],
    // The reviewer action refuses a PR that edits its own workflow and leaves no result line.
    ['log with no result', { ...args, execFn: gh({ log: 'Action refused: workflow file changed' }) }, /no turn count/],
    ['GitHub unreachable', { ...args, execFn: gh({ fail: 'pr' }) }, /could not read the PR/],
  ];
  for (const [name, input, reason] of cases) {
    it(name, () => {
      const r = readReviewerEffort(input);
      expect(r.status).toBe('cannot-check');
      expect(r.reason).toMatch(reason);
      expect(formatReviewerEffort(r)).toMatch(/COULD NOT CHECK/);
    });
  }
});

describe('the readout', () => {
  it('says plainly that a hollow run\'s "no findings" means nothing', () => {
    const out = formatReviewerEffort(readReviewerEffort({ ...args, execFn: gh({ log: logWith(2, 0.1) }) }));
    expect(out).toMatch(/ran but did NOT review: 2 turns, \$0\.10 on 1000 changed lines/);
    expect(out).toMatch(/means nothing/);
  });

  it('shows the numbers on a real review', () => {
    const out = formatReviewerEffort(readReviewerEffort({ ...args, execFn: gh() }));
    expect(out).toMatch(/^✓ PR reviewer: ran a full review \(35 turns, \$1\.99/);
  });
});
