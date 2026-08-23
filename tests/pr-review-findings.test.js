// Unresolved PR review findings, surfaced before a merge.
//
// The load-bearing assertions are the two that stop this becoming another
// unread mechanism: that `cannot-check` never renders as clean, and that an
// OUTDATED thread is never silently treated as handled. Both are the shape that
// let four real findings get merged over in the first place.

import { describe, expect, it } from 'vitest';

import {
  formatPrReviewFindings,
  readPrReviewFindings,
} from '../plugin/tools/lib/pr-review-findings.js';

const thread = (over = {}) => ({
  isResolved: false,
  isOutdated: false,
  comments: {
    nodes: [
      {
        path: 'plugin/tools/lib/environment.js',
        line: 96,
        originalLine: 96,
        author: { login: 'claude' },
        body: '**Bug:** CRLF-terminated lines silently bypass the guard.\n\nmore detail',
      },
    ],
  },
  ...over,
});

const execWith = (nodes) => () =>
  JSON.stringify({
    data: { repository: { pullRequest: { reviewThreads: { nodes } } } },
  });

const args = { owner: 'insightriot', repo: 'signal', pr: 197 };

describe('reading the threads', () => {
  it('reports an unresolved, current thread as needing a person', () => {
    const r = readPrReviewFindings({ ...args, execFn: execWith([thread()]) });
    expect(r.status).toBe('findings');
    expect(r.open).toHaveLength(1);
    expect(r.open[0]).toMatchObject({ path: 'plugin/tools/lib/environment.js', line: 96, author: 'claude' });
    expect(r.open[0].excerpt).toBe('Bug: CRLF-terminated lines silently bypass the guard.');
  });

  it('keeps underscores, so a code identifier survives the excerpt', () => {
    // Stripping `_` as markdown emphasis rendered ASSIGNMENT_RE as ASSIGNMENTRE
    // — the name of the thing the finding is about, turned into a string that
    // appears nowhere in the codebase, inside a readout meant to be actionable.
    const t = thread();
    t.comments.nodes[0].body = '**Bug:** `ASSIGNMENT_RE` misses several markdown forms.';
    const r = readPrReviewFindings({ ...args, execFn: execWith([t]) });
    expect(r.open[0].excerpt).toContain('ASSIGNMENT_RE');
  });

  it('does not count a resolved thread', () => {
    const r = readPrReviewFindings({ ...args, execFn: execWith([thread({ isResolved: true })]) });
    expect(r.status).toBe('clean');
    expect(r.resolved).toBe(1);
  });

  it('reports clean when there are no threads at all', () => {
    expect(readPrReviewFindings({ ...args, execFn: execWith([]) }).status).toBe('clean');
  });
});

describe('cannot-check is a value, never a silent pass', () => {
  it('says so when gh fails', () => {
    const r = readPrReviewFindings({
      ...args,
      execFn: () => {
        throw new Error('gh: command not found');
      },
    });
    expect(r.status).toBe('cannot-check');
    expect(r.status).not.toBe('clean');
    expect(r.reason).toMatch(/were NOT checked/);
  });

  it('says so when there is no PR for the branch', () => {
    const r = readPrReviewFindings({ owner: 'o', repo: 'r', pr: null, execFn: () => '{}' });
    expect(r.status).toBe('cannot-check');
  });

  it('says so on an unparseable response rather than assuming clean', () => {
    const r = readPrReviewFindings({ ...args, execFn: () => 'not json' });
    expect(r.status).toBe('cannot-check');
  });

  it('renders as an explicit warning that distinguishes itself from "none"', () => {
    const out = formatPrReviewFindings({
      status: 'cannot-check',
      open: [],
      outdated: 0,
      resolved: 0,
      reason: 'no network',
    });
    expect(out).toMatch(/COULD NOT CHECK/);
    expect(out).toMatch(/This is not "no findings"/);
  });
});

describe('outdated is not addressed', () => {
  it('counts an unresolved-but-outdated thread separately rather than dropping it', () => {
    const r = readPrReviewFindings({ ...args, execFn: execWith([thread({ isOutdated: true })]) });
    expect(r.status).toBe('clean'); // not blocking...
    expect(r.outdated).toBe(1); // ...but not invisible either
  });

  it('names the outdated count in the readout, with the reason it matters', () => {
    // Measured on this repo: after fixing all three findings on #197, all three
    // threads were still unresolved and one was already outdated. A push marks
    // threads outdated whether or not anything was fixed.
    const out = formatPrReviewFindings({ status: 'clean', open: [], outdated: 1, resolved: 0, reason: null });
    expect(out).toMatch(/OUTDATED/);
    expect(out).toMatch(/Outdated ≠ addressed/);
  });
});

describe('the readout', () => {
  it('lists each finding with file, line and headline', () => {
    const r = readPrReviewFindings({ ...args, execFn: execWith([thread(), thread()]) });
    const out = formatPrReviewFindings(r);
    expect(out).toMatch(/2 unresolved review findings/);
    expect(out).toMatch(/environment\.js:96 \(claude\)/);
  });

  it('cites the measured hit rate, so the reader knows these are usually real', () => {
    const out = formatPrReviewFindings(readPrReviewFindings({ ...args, execFn: execWith([thread()]) }));
    expect(out).toMatch(/7 of 7/);
  });

  it('offers the honest second option — reply saying why not, then resolve', () => {
    // A checklist item that can only be satisfied by agreeing with the reviewer
    // is one people learn to tick without reading. Same failure the outcome
    // oracle's escape hatch exists to avoid.
    const out = formatPrReviewFindings(readPrReviewFindings({ ...args, execFn: execWith([thread()]) }));
    expect(out).toMatch(/reply on the thread saying why not/);
  });

  it('says nothing surprising when everything is clean', () => {
    const out = formatPrReviewFindings({ status: 'clean', open: [], outdated: 0, resolved: 3, reason: null });
    expect(out).toMatch(/none unresolved/);
  });
});
