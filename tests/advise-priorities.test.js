// `M6.E12` S1 — the priorities contract (`D-M6E12-6`, AC2.1–AC2.3, AC2.5).
//
// The proposal is a model's judgment; this is the line it must pass before any of
// it reaches the advisory. Every refusal is table-tested, and every test asserts
// the reason NAMES the fault — a refusal that does not say what to fix costs a
// round trip per fault.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { validatePriorities, countSentences, PRIORITY_COUNT } from '../plugin/tools/lib/advise-priorities.js';
import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

async function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'sig-priorities-'));
  dirs.push(base);
  const files = {
    '.planning/STATE.md': '---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M2.E3\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\n---\n',
    '.planning/BACKLOG.md': '# Backlog\n\n### Row one · **roadmap**\nBody.\n\n### Row two · **hygiene**\nBody.\n\n### Row three · **roadmap**\nBody.\n',
    '.planning/BUGS.md': '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | `confirmed` | P1 | **open one** |\n| B2 | `fixed` | P1 | **gone** |\n',
    '.planning/PROJECT.md': '# P\n\n## Vision\n\nCalibrated rigor.\n',
  };
  for (const [rel, c] of Object.entries(files)) {
    mkdirSync(join(base, rel, '..'), { recursive: true });
    writeFileSync(join(base, rel), c);
  }
  return { base, corpus: await readCorpus(base) };
}

const good = () => [
  { title: 'Make the archive trustworthy', why: 'It splits slices. Users lose files.', covers: ['B1'], evidence: ['.planning/BUGS.md:5'] },
  { title: 'Finish the queue', why: 'The first row blocks the rest.', covers: ['.planning/BACKLOG.md:3'], evidence: ['.planning/BACKLOG.md:3', '.planning/PROJECT.md:3'] },
  { title: 'Hygiene', why: 'Small and cheap.', covers: ['.planning/BACKLOG.md:6', '.planning/BACKLOG.md:9'], evidence: ['.planning/PROJECT.md'] },
];

describe('validatePriorities — a valid proposal', () => {
  it('passes, and resolves each covered thing to its line and label', async () => {
    const { base, corpus } = await fixture();
    const r = await validatePriorities(base, good(), corpus);
    expect(r.reasons).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.priorities[0].covers[0]).toMatchObject({ kind: 'bug', id: 'B1', path: '.planning/BUGS.md', line: 5 });
    expect(r.priorities[1].covers[0]).toMatchObject({ kind: 'row', path: '.planning/BACKLOG.md', line: 3 });
  });
});

describe('validatePriorities — every refusal names its fault (AC2.1–AC2.3)', () => {
  const cases = [
    ['too few (AC2.1)', (p) => p.slice(0, 2), /2 priorities proposed — propose between 3 and 5/],
    ['too many (AC2.1)', (p) => [...p, ...p].slice(0, 6).map((x, i) => ({ ...x, covers: [`.planning/BACKLOG.md:${[3, 6, 9][i % 3]}`] })), /6 priorities proposed/],
    ['not an array', () => ({ title: 'x' }), /must be a JSON array/],
    ['empty title (AC2.2)', (p) => (p[0].title = '', p), /priority 1: title is missing/],
    ['long title', (p) => (p[0].title = 'x'.repeat(200), p), /priority 1: title is 200 characters/],
    ['four-sentence why (AC2.2)', (p) => (p[1].why = 'One. Two. Three. Four.', p), /priority 2: why runs 4 sentences/],
    ['marker in why', (p) => (p[0].why = 'Look — evidence: `x`', p), /priority 1: why contains the evidence marker/],
    ['newline in title', (p) => (p[0].title = 'a\nb', p), /priority 1: title must be one line/],
    ['no covers (AC2.2)', (p) => (p[2].covers = [], p), /priority 3: covers must list/],
    ['covers a fixed bug (AC2.3)', (p) => (p[0].covers = ['B2'], p), /priority 1: covers B2, which is not an open bug/],
    ['covers a line that is not a live row (AC2.3)', (p) => (p[1].covers = ['.planning/BACKLOG.md:4'], p), /priority 2: covers \.planning\/BACKLOG\.md:4, which is not the line of a live backlog row/],
    ['covers junk', (p) => (p[1].covers = ['the queue'], p), /neither a backlog row citation nor a bug id/],
    ['one row under two priorities', (p) => (p[2].covers = ['.planning/BACKLOG.md:3'], p), /already covered by priority 2/],
    ['no evidence (AC2.2)', (p) => (p[0].evidence = [], p), /priority 1: evidence must list/],
    ['evidence that does not exist (AC2.3)', (p) => (p[0].evidence = ['nope/missing.md:1'], p), /priority 1: evidence nope\/missing\.md:1 does not resolve — does not exist/],
    ['evidence past the end of the file (AC2.3)', (p) => (p[0].evidence = ['.planning/PROJECT.md:999'], p), /priority 1: evidence \.planning\/PROJECT\.md:999 does not resolve/],
    ['evidence outside the repository', (p) => (p[0].evidence = ['../../etc/passwd:1'], p), /priority 1: evidence \.\.\/\.\.\/etc\/passwd:1 does not resolve/],
    ['evidence with spaces', (p) => (p[0].evidence = ['a b:1'], p), /not a single "path:line" token/],
  ];
  for (const [name, mutate, expected] of cases) {
    it(name, async () => {
      const { base, corpus } = await fixture();
      const r = await validatePriorities(base, mutate(good()), corpus);
      expect(r.ok).toBe(false);
      expect(r.reasons.join('\n')).toMatch(expected);
    });
  }

  it('returns EVERY reason, not just the first (AC2.5)', async () => {
    const { base, corpus } = await fixture();
    const p = good();
    p[0].title = '';
    p[1].evidence = ['nope.md:1'];
    p[2].covers = ['B99'];
    const r = await validatePriorities(base, p, corpus);
    expect(r.reasons.length).toBeGreaterThanOrEqual(3);
    expect(r.reasons.some((x) => x.startsWith('priority 1'))).toBe(true);
    expect(r.reasons.some((x) => x.startsWith('priority 2'))).toBe(true);
    expect(r.reasons.some((x) => x.startsWith('priority 3'))).toBe(true);
  });
});

describe('unfiled work — "new:" covers', () => {
  it('is accepted, labelled, and carries no line', async () => {
    const { base, corpus } = await fixture();
    const p = good();
    p[0].covers = ['new: move other projects onto the work store', 'B1'];
    const r = await validatePriorities(base, p, corpus);
    expect(r.ok).toBe(true);
    expect(r.priorities[0].covers[0]).toEqual({ kind: 'new', id: null, label: 'move other projects onto the work store', path: null, line: null });
  });
  it('an empty description is refused', async () => {
    const { base, corpus } = await fixture();
    const p = good();
    p[0].covers = ['new:'];
    const r = await validatePriorities(base, p, corpus);
    expect(r.reasons.join('\n')).toMatch(/needs a description/);
  });
});

describe('dependsOn — added at VERIFY from the first real ask', () => {
  it('is optional, and normalises to a list of priority numbers', async () => {
    const { base, corpus } = await fixture();
    const p = good();
    p[2].dependsOn = [1, 1];
    const r = await validatePriorities(base, p, corpus);
    expect(r.ok).toBe(true);
    expect(r.priorities.map((x) => x.dependsOn)).toEqual([[], [], [1]]);
  });
  const bad = [
    ['not a list', (p) => (p[0].dependsOn = 2, p), /priority 1: dependsOn must be a list/],
    ['out of range', (p) => (p[0].dependsOn = [4], p), /priority 1: dependsOn 4 is not a priority number \(1–3\)/],
    ['itself', (p) => (p[1].dependsOn = [2], p), /priority 2: cannot depend on itself/],
    ['a cycle', (p) => (p[0].dependsOn = [2], p[1].dependsOn = [3], p[2].dependsOn = [1], p), /dependsOn forms a cycle: priority 1 → priority 2 → priority 3 → priority 1/],
  ];
  for (const [name, mutate, expected] of bad) {
    it(`refuses ${name}`, async () => {
      const { base, corpus } = await fixture();
      const r = await validatePriorities(base, mutate(good()), corpus);
      expect(r.ok).toBe(false);
      expect(r.reasons.join('\n')).toMatch(expected);
    });
  }
});

describe('countSentences', () => {
  it('counts terminal punctuation, and an unpunctuated line as one', () => {
    expect(countSentences('One. Two! Three?')).toBe(3);
    expect(countSentences('No full stop')).toBe(1);
    expect(countSentences('Version 0.1.44 shipped.')).toBe(1);
    expect(countSentences('')).toBe(0);
  });
  it('the count bounds match the decision', () => {
    expect(PRIORITY_COUNT).toEqual({ min: 3, max: 5 });
  });
});
