// Did the PR reviewer actually review? From 2026-09-25 to 2026-10-05 every
// reviewer run stopped after 2 turns (~$0.10) and passed — a green tick and an
// empty thread list that looked exactly like a clean review. These pin that such
// a run is flagged, and that a run SHIP could not read never reads as reviewed.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

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

// M6.E18 R1 (I7): a fake `gh pr view` answers only the fields `--json` asked for, as the real one
// does. One that answered every field kept the suite green with `commits` dropped from the real call.
function prView(a, full) {
  const fields = a[a.indexOf('--json') + 1].split(',');
  return JSON.stringify(Object.fromEntries(fields.filter((f) => f in full).map((f) => [f, full[f]])));
}
const fileList = (paths) => paths.map((path) => ({ path, additions: 1, deletions: 0 }));

function gh({ additions = 900, deletions = 100, runs, log, fail } = {}) {
  return (cmd, a) => {
    if (fail && a[0] === fail) throw new Error('HTTP 502');
    if (a[0] === 'pr') {
      return prView(a, { additions, deletions, headRefOid: 'abc123', commits: [{ oid: 'abc123' }], files: fileList(['a.js']), changedFiles: 1 });
    }
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

// M6.E18 S3 (SIG-348, SIG-285): the upstream review command stops at its step 1 once Claude has
// commented, so every push after a PR's first one ends in a short "stop" run. Reading only the
// newest run made a re-push after a real review read as hollow (SIG-285), and nothing said which
// commit was last reviewed. These read every run on the head commit and name the last reviewed one.

const outcomeLine = (outcome, sha, turns, cost, job = 'review') =>
  `claude-review\tRecord review outcome\t2026-10-20T00:13:38Z REVIEW_OUTCOME=${outcome} head=${sha} job=${job} turns=${turns} cost=${cost}`;

// #304's shape: a real review on the first commit, then step-1 stops on every later one.
function ghPr({ commits, runs, logs, additions = 6000, deletions = 861, head = commits.at(-1), files = ['plugin/x.js'], changedFiles = files.length, apiFiles }) {
  return (cmd, a) => {
    if (a[0] === 'pr') {
      return prView(a, { additions, deletions, headRefOid: head, commits: commits.map((oid) => ({ oid })), files: fileList(files), changedFiles });
    }
    if (a[0] === 'api' && apiFiles) return apiFiles.join('\n');
    if (a[0] === 'run' && a[1] === 'list') {
      const sha = a[a.indexOf('--commit') + 1];
      return JSON.stringify(runs[sha] ?? []);
    }
    if (a[0] === 'run' && a[1] === 'view') return logs[a[2]] ?? '';
    throw new Error(`unexpected gh ${a.join(' ')}`);
  };
}
const ok = (id) => ({ databaseId: id, status: 'completed', conclusion: 'success' });
const first = 'e92032de00000000000000000000000000000000';
const later = ['cc8db82a0000000000000000000000000000000a', 'b249b68d0000000000000000000000000000000b', 'd66100c80000000000000000000000000000000c'];
const pr304 = (headLog, extraHeadRuns = [], over = {}) => ghPr({
  commits: [first, ...later],
  ...over,
  runs: {
    [first]: [ok(1)],
    [later[0]]: [ok(2)],
    [later[1]]: [ok(3)],
    [later[2]]: [ok(4), ...extraHeadRuns],
  },
  logs: {
    1: outcomeLine('reviewed', first, 9, 1.44),
    2: outcomeLine('stopped-step-1', later[0], 3, 0.109),
    3: outcomeLine('stopped-step-1', later[1], 4, 0.115),
    4: headLog ?? outcomeLine('stopped-step-1', later[2], 3, 0.111),
    5: outcomeLine('reviewed', later[2], 14, 1.62, 'review-head'),
    ...over.logs,
  },
});
const pr304Shape = (over) => pr304(undefined, [], over);

describe('every run on the head commit, and the last reviewed commit (M6.E18)', () => {
  it("reads #304's head as stopped at step 1, not hollow, and names the last reviewed commit", () => {
    const r = readReviewerEffort({ ...args, execFn: pr304() });
    expect(r).toMatchObject({ status: 'stopped', lastReviewed: first, commitsAfter: 3, readyToMerge: false });
  });

  it('a review-head run on the head commit makes it reviewed, beside the step-1 stop', () => {
    const r = readReviewerEffort({ ...args, execFn: pr304(undefined, [ok(5)]) });
    expect(r).toMatchObject({ status: 'reviewed', turns: 14, costUsd: 1.62, readyToMerge: true, lastReviewed: later[2], commitsAfter: 0 });
  });

  it('a reviewed outcome that did a stop\'s worth of work is still hollow', () => {
    const r = readReviewerEffort({ ...args, execFn: pr304(outcomeLine('reviewed', later[2], 3, 0.12)) });
    expect(r).toMatchObject({ status: 'hollow', readyToMerge: false, lastReviewed: first });
  });

  it('no-result (the workflow-validation skip) is cannot-check, never reviewed', () => {
    const r = readReviewerEffort({ ...args, execFn: pr304(outcomeLine('no-result', later[2], '', '')) });
    expect(r).toMatchObject({ status: 'cannot-check', readyToMerge: false });
    expect(r.reason).toMatch(/no result/);
  });

  it('a log from before the outcome line falls back to turns and cost, and says so', () => {
    const r = readReviewerEffort({ ...args, execFn: pr304(logWith(35, 1.99)) });
    expect(r).toMatchObject({ status: 'reviewed', readyToMerge: true, fromOutcomeLine: false });
    expect(readReviewerEffort({ ...args, execFn: pr304() }).fromOutcomeLine).toBe(true);
  });

  it('pre-outcome-line history still finds the last real review (#304 as it was logged)', () => {
    const r = readReviewerEffort({
      ...args,
      execFn: ghPr({
        commits: [first, ...later],
        runs: { [first]: [ok(1)], [later[0]]: [ok(2)], [later[1]]: [ok(3)], [later[2]]: [ok(4)] },
        logs: { 1: logWith(9, 1.44), 2: logWith(3, 0.109), 3: logWith(4, 0.115), 4: logWith(3, 0.111) },
      }),
    });
    expect(r).toMatchObject({ status: 'hollow', lastReviewed: first, commitsAfter: 3, readyToMerge: false });
  });

  it('lists every run on the head commit, not only the newest', () => {
    const calls = [];
    const fake = pr304(undefined, [ok(5)]);
    readReviewerEffort({ ...args, execFn: (c, a, o) => { calls.push(a); return fake(c, a, o); } });
    const list = calls.find((a) => a[0] === 'run' && a[1] === 'list');
    expect(list[list.indexOf('--limit') + 1]).not.toBe('1');
  });

  it('a run still going on the head commit, with no review yet, is cannot-check', () => {
    const r = readReviewerEffort({ ...args, execFn: pr304(undefined, [{ databaseId: 9, status: 'in_progress', conclusion: null }]) });
    expect(r).toMatchObject({ status: 'cannot-check', readyToMerge: false });
    expect(r.reason).toMatch(/in_progress/);
  });
});

describe('the readout names what is owed (AC1.4)', () => {
  it('a stopped head names the last reviewed commit, the count after it, and the label', () => {
    const out = formatReviewerEffort(readReviewerEffort({ ...args, execFn: pr304() }));
    expect(out).toMatch(/did not review the head commit d66100c8/);
    expect(out).toMatch(/already commented/);
    expect(out).toMatch(/last real review: e92032de, 3 commits before the head/);
    expect(out).toMatch(/Not ready to merge/);
    expect(out).toMatch(/`review-head` label/);
    expect(out).toMatch(/remove it and add it again/);
  });

  it('no reviewed commit at all says so', () => {
    const out = formatReviewerEffort(readReviewerEffort({
      ...args,
      execFn: ghPr({ commits: [first], runs: { [first]: [ok(2)] }, logs: { 2: outcomeLine('stopped-step-1', first, 2, 0.1) } }),
    }));
    expect(out).toMatch(/no commit on this PR has had a real review/);
  });

  // S4: commitsAfter is the PR's commit count when none was reviewed.
  it('no reviewed commit at all: commitsAfter is the PR\'s commit count', () => {
    const r = readReviewerEffort({
      ...args,
      execFn: ghPr({
        commits: [first, ...later],
        runs: { [first]: [ok(1)], [later[0]]: [ok(2)], [later[1]]: [ok(3)], [later[2]]: [ok(4)] },
        logs: {
          1: outcomeLine('stopped-step-1', first, 2, 0.1),
          2: outcomeLine('stopped-step-1', later[0], 2, 0.1),
          3: outcomeLine('stopped-step-1', later[1], 2, 0.1),
          4: outcomeLine('stopped-step-1', later[2], 2, 0.1),
        },
      }),
    });
    expect(r).toMatchObject({ status: 'stopped', lastReviewed: null, commitsAfter: 4 });
  });

  // S4: the walk is made only over a commit list that ends at the head it was asked about.
  it('a commit list that does not end at the head: lastReviewed and commitsAfter are null', () => {
    const r = readReviewerEffort({ ...args, execFn: pr304Shape({ head: later[2], commits: [first, later[0], later[1]] }) });
    expect(r).toMatchObject({ status: 'stopped', lastReviewed: null, commitsAfter: null });
    expect(formatReviewerEffort(r)).toMatch(/which commit was last reviewed could not be read/);
  });

  it('cannot-check is not ready to merge either', () => {
    const out = formatReviewerEffort(readReviewerEffort({ ...args, execFn: pr304(outcomeLine('no-result', later[2], '', '')) }));
    expect(out).toMatch(/COULD NOT CHECK/);
    expect(out).toMatch(/Not ready to merge/);
  });
});

describe('ship.md acts on readyToMerge (AC1.4)', () => {
  const ship = readFileSync(new URL('../plugin/commands/ship.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const line = ship.slice(ship.indexOf('**Reviewer effort'), ship.indexOf('- **CI:**')).replace(/\s+/g, ' ');

  it('no longer says the check only reports', () => {
    expect(line).not.toMatch(/Reports; does not refuse/);
  });

  it('withholds "ready to merge" unless the head commit was reviewed, and names the label', () => {
    expect(line).toMatch(/Do not call the pull request ready to merge unless `result\.readyToMerge` is true/);
    expect(line).toMatch(/`review-head` label/);
  });
});

// ── M6.E18 REVIEW pass 1, fix round 1 ─────────────────────────────────────────

const failed = (id, conclusion = 'failure') => ({ databaseId: id, status: 'completed', conclusion });
const calledRuns = (fake) => {
  const calls = [];
  return { calls, execFn: (c, a, o) => { calls.push(a); return fake(c, a, o); } };
};
const WORKFLOW = '.github/workflows/claude-code-review.yml';

describe('a PR that edits the reviewer workflow is not read (I5)', () => {
  it('reads cannot-check, says why, and reads no runs', () => {
    const { calls, execFn } = calledRuns(pr304(undefined, [ok(5)], { files: ['plugin/x.js', WORKFLOW] }));
    const r = readReviewerEffort({ ...args, execFn });
    expect(r).toMatchObject({ status: 'cannot-check', readyToMerge: false, lastReviewed: null, commitsAfter: null });
    expect(r.reason).toMatch(/edits the reviewer's own workflow/);
    expect(r.reason).toMatch(/cannot be trusted/);
    expect(calls.filter((a) => a[0] === 'run')).toEqual([]);
    expect(formatReviewerEffort(r)).not.toMatch(/review-head/);
  });

  it('asks gh for the changed files', () => {
    const { calls, execFn } = calledRuns(pr304());
    readReviewerEffort({ ...args, execFn });
    const view = calls.find((a) => a[0] === 'pr');
    expect(view[view.indexOf('--json') + 1].split(',')).toEqual(expect.arrayContaining(['files', 'changedFiles', 'commits', 'headRefOid']));
  });

  // Measured 2026-10-20: `gh pr view --json files` returns at most 100 files (#280: 100 of 1006).
  it('a PR with more files than gh pr view lists is read in full, and the workflow found there', () => {
    const shown = Array.from({ length: 100 }, (_, i) => `f${i}.js`);
    const r = readReviewerEffort({ ...args, execFn: pr304(undefined, [ok(5)], { files: shown, changedFiles: 101, apiFiles: [...shown, WORKFLOW] }) });
    expect(r.status).toBe('cannot-check');
    expect(r.reason).toMatch(/edits the reviewer's own workflow/);
  });

  it('a full list that comes back short is cannot-check, never read as clean', () => {
    const shown = Array.from({ length: 100 }, (_, i) => `f${i}.js`);
    const r = readReviewerEffort({ ...args, execFn: pr304(undefined, [ok(5)], { files: shown, changedFiles: 101, apiFiles: shown }) });
    expect(r.status).toBe('cannot-check');
    expect(r.reason).toMatch(/could not list every changed file \(100 of 101\)/);
  });

  it('a full list without the workflow reads the runs as usual', () => {
    const shown = Array.from({ length: 100 }, (_, i) => `f${i}.js`);
    const r = readReviewerEffort({ ...args, execFn: pr304(undefined, [ok(5)], { files: shown, changedFiles: 101, apiFiles: [...shown, 'f100.js'] }) });
    expect(r).toMatchObject({ status: 'reviewed', readyToMerge: true });
  });
});

describe('the outcome line is read per line, exactly (I6)', () => {
  // Measured: the old pattern took 0.6 s at 16 KB, 5 s at 32 KB, 41 s at 64 KB on one line. This
  // line is ~38 KB; the test's own timeout is the bound (no timer is read here: see
  // tests/timing-budget-guard.test.js), and parsing it per line takes well under a millisecond.
  it('a long line of repeated outcome fragments parses quickly and is not an outcome', () => {
    const junk = `claude-review\tRun Claude Code Review\t2026-10-20T00:13:38Z ${'REVIEW_OUTCOME=reviewed turns=1 '.repeat(1200)}`;
    const r = readReviewerEffort({ ...args, execFn: pr304(`${junk}\n${outcomeLine('stopped-step-1', later[2], 3, 0.111)}`) });
    expect(r).toMatchObject({ status: 'stopped', fromOutcomeLine: true });
  }, 2000);

  it('a 1 MB line with no outcome falls back to turns and cost', () => {
    const big = `x\ty\tz ${'REVIEW_OUTCOME='.repeat(70000)}`;
    const r = readReviewerEffort({ ...args, execFn: pr304(`${big}\n${logWith(35, 1.99)}`) });
    expect(r).toMatchObject({ status: 'reviewed', fromOutcomeLine: false });
  }, 2000);

  it('an outcome line naming another commit is not this commit\'s outcome', () => {
    // A "reviewed" line from another commit's run, listed beside the head's step-1 stop, does not win.
    const r = readReviewerEffort({ ...args, execFn: pr304(undefined, [ok(5)], { logs: { 5: outcomeLine('reviewed', first, 20, 1.5, 'review-head') } }) });
    expect(r).toMatchObject({ status: 'stopped', readyToMerge: false });
    // The head's only run named the wrong commit; on its own it is cannot-check.
    const alone = readReviewerEffort({
      ...args,
      execFn: ghPr({ commits: [later[2]], runs: { [later[2]]: [ok(4)] }, logs: { 4: outcomeLine('reviewed', first, 20, 1.5) } }),
    });
    expect(alone.status).toBe('cannot-check');
    expect(alone.reason).toMatch(/names commit e92032de, not d66100c8/);
  });

  it('a line with text after the cost is not an outcome line', () => {
    const r = readReviewerEffort({ ...args, execFn: pr304(`${outcomeLine('reviewed', later[2], 20, 1.5)} turns=40 cost=3`) });
    expect(r.status).toBe('cannot-check');
    expect(r.reason).toMatch(/no turn count/);
  });

  it('reads a CRLF log, and the last valid line wins', () => {
    const log = [outcomeLine('stopped-step-1', later[2], 3, 0.1), outcomeLine('reviewed', later[2], 20, 1.5)].join('\r\n');
    expect(readReviewerEffort({ ...args, execFn: pr304(`${log}\r\n`) })).toMatchObject({ status: 'reviewed', turns: 20 });
  });
});

describe('a failed review-head run is surfaced, not outranked by a stop (S1)', () => {
  it('a failed requested head review reads as that, beside the step-1 stop', () => {
    const r = readReviewerEffort({
      ...args,
      execFn: pr304(undefined, [failed(5)], { logs: { 5: outcomeLine('no-result', later[2], '', '', 'review-head') } }),
    });
    expect(r).toMatchObject({ status: 'cannot-check', readyToMerge: false });
    expect(r.reason).toMatch(/requested head review .*ran and did not succeed.*"failure"/);
    expect(formatReviewerEffort(r)).toMatch(/`review-head` label/);
  });

  it('a failed push run beside a stop still reads stopped', () => {
    const r = readReviewerEffort({
      ...args,
      execFn: pr304(undefined, [failed(5)], { logs: { 5: outcomeLine('no-result', later[2], '', '', 'review') } }),
    });
    expect(r.status).toBe('stopped');
  });
});

describe('the review-head advice only where it can help (S2)', () => {
  it('shown for stopped, hollow, and a run that left no result', () => {
    for (const fake of [pr304(), pr304(outcomeLine('reviewed', later[2], 3, 0.12)), pr304(outcomeLine('no-result', later[2], '', ''))]) {
      expect(formatReviewerEffort(readReviewerEffort({ ...args, execFn: fake }))).toMatch(/`review-head` label/);
    }
  });

  it('not shown with no PR, with GitHub unreachable, or while a run is still going', () => {
    for (const input of [
      { owner: 'o', repo: 'r', pr: null, execFn: gh() },
      { ...args, execFn: gh({ fail: 'pr' }) },
      { ...args, execFn: pr304(undefined, [{ databaseId: 9, status: 'in_progress', conclusion: null }]) },
    ]) {
      const out = formatReviewerEffort(readReviewerEffort(input));
      expect(out).toMatch(/Not ready to merge/);
      expect(out).not.toMatch(/review-head/);
    }
  });
});

describe('the commit walk stops at a gap and not at a skipped push (I10)', () => {
  const walk = (middleRuns) => readReviewerEffort({
    ...args,
    execFn: ghPr({
      commits: [first, ...later],
      runs: { [first]: [ok(1)], [later[0]]: [ok(2)], ...(middleRuns === undefined ? {} : { [later[1]]: middleRuns }), [later[2]]: [ok(4)] },
      logs: {
        1: outcomeLine('reviewed', first, 9, 1.44),
        2: outcomeLine('stopped-step-1', later[0], 3, 0.109),
        4: outcomeLine('stopped-step-1', later[2], 3, 0.111),
      },
    }),
  });

  it('a middle commit whose only run was cancelled ends the walk', () => {
    expect(walk([failed(3, 'cancelled')])).toMatchObject({ status: 'stopped', lastReviewed: null, commitsAfter: null });
  });

  it('a middle commit whose only run is still going ends the walk', () => {
    expect(walk([{ databaseId: 3, status: 'in_progress', conclusion: null }])).toMatchObject({ lastReviewed: null, commitsAfter: null });
  });

  // REVIEW fix round 1's fresh read: a label other than review-head starts a run whose jobs all
  // skip. On a middle commit that is no run, not a gap.
  it('a middle commit whose only run was skipped (another label) does not end the walk', () => {
    expect(walk([failed(3, 'skipped')])).toMatchObject({ status: 'stopped', lastReviewed: first, commitsAfter: 3 });
  });

  it('a middle commit with no run at all (a skip-ci push) does not end the walk', () => {
    expect(walk(undefined)).toMatchObject({ status: 'stopped', lastReviewed: first, commitsAfter: 3 });
  });
});

describe('ship.md: the review-head label goes on after SHIP\'s last push (I11)', () => {
  const ship = readFileSync(new URL('../plugin/commands/ship.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const line = ship.slice(ship.indexOf('**Reviewer effort'), ship.indexOf('- **CI:**')).replace(/\s+/g, ' ');
  const s9 = ship.slice(ship.indexOf('## 8. Make the SHIP commit'), ship.indexOf('## 9. Hand off')).replace(/\s+/g, ' ');

  it('the Reviewer-effort line says to add the label only after the final push and check after that run', () => {
    expect(line).toMatch(/only after SHIP's final push/);
    expect(line).toMatch(/after that run completes/);
  });

  it('§ 9 says its commits move the head, so the label comes after them', () => {
    expect(s9).toMatch(/`review-head` label/);
    expect(s9).toMatch(/only after SHIP's final push/);
  });
});
