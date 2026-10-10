// M6.E15 REVIEW pass 4 — in-phase fixes and pins (FR4: AC4.1–AC4.3).
//
// Fixtures are invented text; no project is named (tests/private-name-guard).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { performance } from 'node:perf_hooks';

import { planListsToRecords, runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { segmentQuestions } from '../plugin/tools/lib/work-migrate.js';

const DATES = {
  'BUGS.md': { first: '2026-01-05', last: '2026-03-09' },
  'BACKLOG.md': { first: '2026-01-06', last: '2026-03-08' },
  'ISSUES-INBOX.md': { first: '2026-01-07', last: '2026-01-07' },
  'OPEN-QUESTIONS.md': { first: '2026-01-08', last: '2026-02-16' },
};
const HASH = 'e41d30e9b7c2a1f0e41d30e9b7c2a1f0e41d30e9';
const EVIDENCE = { source: 'git', commits: [HASH], prs: new Map([[12, HASH], [157, HASH]]), epics: new Map(), origin: { host: 'example.com', repo: 'acme/ledger' } };
const plan = (texts, opts = {}) => planListsToRecords(texts, { key: 'LF', dates: DATES, evidence: EVIDENCE, ...opts });
const firstItem = (p) => p.records.filter((x) => x.flagged !== 'non-item')[0];

const git = (cwd, args, env = {}) => String(execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env } }));
const at = (day) => ({ GIT_AUTHOR_DATE: `${day}T12:00:00Z`, GIT_COMMITTER_DATE: `${day}T12:00:00Z` });
const STATE = '---\nschema_version: 1\ndocs_layout_version: 3\nphase: PLAN\ncurrent_epic: null\ncurrent_tasks: []\n'
  + 'completed_phases: []\nblockers: []\n---\n# Project State\n\nbody\n';
const isHistoryLog = (args) => args[0] === 'log' && args.includes('--format=%H%x09%s');

function repo(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const base = join(root, 'leaf-notes');
  mkdirSync(join(base, '.planning'), { recursive: true });
  git(base, ['init', '-q', '-b', 'main']);
  git(base, ['config', 'user.email', 't@t.co']);
  git(base, ['config', 'user.name', 'T']);
  git(base, ['config', 'commit.gpgsign', 'false']);
  git(base, ['config', 'tag.gpgsign', 'false']);
  writeFileSync(join(base, '.planning', 'STATE.md'), STATE);
  return { root, base };
}

// ── AC4.3: the apply reads the history again under its lock ───────────────────
describe('AC4.3 — the look under the lock reads the history again (execFn seam)', () => {
  let root;
  let base;
  beforeEach(() => {
    ({ root, base } = repo('r4-lock-'));
    writeFileSync(join(base, '.planning', 'BUGS.md'), ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|',
      '| B1 | fixed | P2 | Rows vanish — PR #42. |', ''].join('\n'));
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Add the lists'], at('2026-01-05'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('a (#42) commit appearing only on the apply’s second history read → refused, nothing written', async () => {
    const dry = await runWorkStoreMigrate(base, { key: 'LN' });
    expect(dry.items[0].flag).toBe('no-evidence');
    let logs = 0;
    const execFn = (cmd, args, o) => {
      const out = execFileSync(cmd, args, o);
      if (cmd === 'git' && isHistoryLog(args) && ++logs === 2) return `${String(out)}${'a'.repeat(40)}\tKeep the rows (#42)\n`;
      return out;
    };
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LN', stamp: 'T1', expectedHash: dry.inputHash, confirmCloses: true, execFn });
    expect(logs).toBe(2);
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/changed since the dry run/);
    expect(git(base, ['status', '--porcelain']).trim()).toBe('');
    expect(git(base, ['tag', '-l']).trim()).toBe('');
  });
});

// ── segmentQuestions linearity, with many `##` groups ─────────────────────────
describe('segmentQuestions stays linear with a `##` group every 5 entries', () => {
  // A group per 5 entries makes a per-entry scan of the `##` headings (the
  // old groupOf) or a per-stretch filter of the split lines (the old tile())
  // cost entries²/5: at four times the entries, ~16×.
  const doc = (n) => ['# Open Questions', '', ...Array.from({ length: n }, (_, i) => (i % 5 === 0 ? `## Group ${i}\n\nIntro ${i}.\n\n### Q${i} — x?\n\nBody.\n` : `### Q${i} — x?\n\nBody.\n`)), ''].join('\n');
  const best = (text) => Math.min(...[0, 1, 2, 3, 4].map(() => {
    const t0 = performance.now();
    segmentQuestions(text);
    return performance.now() - t0;
  }));
  it('2000 → 8000 entries costs well under 8× (quadratic would be ~16×), groups still right', () => {
    const small = doc(2000);
    const large = doc(8000);
    best(small);
    const ratio = best(large) / best(small);
    const seg = segmentQuestions(large);
    expect(seg.rows).toHaveLength(8000);
    expect(seg.rows[7].groupHeading).toBe('Group 5');
    expect(seg.rows[7999].groupHeading).toBe('Group 7995');
    expect(seg.orphans.filter((o) => o.name.startsWith('section: '))).toHaveLength(1600);
    expect(ratio).toBeLessThan(8);
  });
});

// ── a question's own heading undoes a Resolved section ────────────────────────
describe('heading undo words (REVIEW pass 3 I-1), pinned', () => {
  const question = (group, heading, body) => ['# Open Questions', '', `## ${group}`, '', `### ${heading}`, '', body, ''].join('\n');
  it('"### Q5 — Still open" under a Resolved heading → not proposed, unclear', () => {
    const p = plan({ 'OPEN-QUESTIONS.md': question('Resolved in v2', 'Q5 — Still open', 'Settled in PR #157.') });
    expect(p.errors).toEqual([]);
    expect(firstItem(p).flagged).toBe('unclear');
    expect(p.proposedCloses).toEqual([]);
  });
  it('the same entry with a plain heading is proposed (the heading is what holds it open)', () => {
    const p = plan({ 'OPEN-QUESTIONS.md': question('Resolved in v2', 'Q5 — Which currency?', 'Settled in PR #157.') });
    expect(p.proposedCloses.map((c) => c.legacyId)).toEqual(['Q5']);
  });
});

// ── the entry's own old ID is never its evidence ──────────────────────────────
describe('own-ID rule, pinned: `PR #12` and a /pull/12 link inside row #12', () => {
  const backlog = (body) => ['# Backlog', '', '### #12 — Export to CSV · **roadmap** · small · **DONE**', body, ''].join('\n');
  for (const body of ['Landed in PR #12.', 'See [the change](https://example.com/acme/ledger/pull/12).']) {
    it(`"${body}" inside row #12 → not proposed, no-evidence`, () => {
      const p = plan({ 'BACKLOG.md': backlog(body) });
      expect(p.errors).toEqual([]);
      expect(firstItem(p).flagged).toBe('no-evidence');
      expect(p.proposedCloses).toEqual([]);
    });
  }
  it('the same reference to another row (#157) is evidence', () => {
    const p = plan({ 'BACKLOG.md': backlog('Landed in PR #157.') });
    expect(p.proposedCloses.map((c) => c.legacyId)).toEqual(['#12']);
  });
});
