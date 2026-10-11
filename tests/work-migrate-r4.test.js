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
  // cost entries²/5. Measured over a 16× size step so the two shapes are far
  // apart: linear is ~16×, quadratic ~256×. Measured: this code ~19–20×, the
  // pre-fix code 195×. A 4× step (8× limit) failed on CI at 8.25 from timing
  // noise alone.
  const doc = (n) => ['# Open Questions', '', ...Array.from({ length: n }, (_, i) => (i % 5 === 0 ? `## Group ${i}\n\nIntro ${i}.\n\n### Q${i} — x?\n\nBody.\n` : `### Q${i} — x?\n\nBody.\n`)), ''].join('\n');
  const best = (text) => Math.min(...[0, 1, 2, 3, 4].map(() => {
    const t0 = performance.now();
    segmentQuestions(text);
    return performance.now() - t0;
  }));
  it('2000 → 32 000 entries costs well under 64× (linear ~16×, quadratic ~256×), groups still right', () => {
    const small = doc(2000);
    const large = doc(32000);
    best(small);
    const ratio = best(large) / best(small);
    const seg = segmentQuestions(large);
    expect(seg.rows).toHaveLength(32000);
    expect(seg.rows[7].groupHeading).toBe('Group 5');
    expect(seg.rows[31999].groupHeading).toBe('Group 31995');
    expect(seg.orphans.filter((o) => o.name.startsWith('section: '))).toHaveLength(6400);
    expect(ratio).toBeLessThan(64);
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

// ── F1, F2: the evidence is the DEFAULT branch's history (AC4.1) ──────────────
describe('evidence reads the default branch, with a fixed `--` (REVIEW pass 4)', () => {
  let root;
  let base;
  beforeEach(() => {
    ({ root, base } = repo('r4-branch-'));
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Start (#1)'], at('2026-01-05'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('a committed file named HEAD does not make the history read ambiguous (no main/master/origin: HEAD is read)', async () => {
    git(base, ['branch', '-m', 'main', 'trunk']);
    writeFileSync(join(base, 'HEAD'), 'not a ref\n');
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Add a file named HEAD (#2)'], at('2026-01-06'));
    const { buildEvidenceIndex } = await import('../plugin/tools/lib/work-migrate-lists.js');
    const idx = buildEvidenceIndex(base);
    expect(idx.source).toBe('git');
    expect(idx.ref).toBe('HEAD');
    expect([...idx.prs.keys()].sort()).toEqual([1, 2]);
  });

  it('on an unmerged feature branch, with main present: a commit only on the feature branch is not evidence', async () => {
    git(base, ['checkout', '-q', '-b', 'feature']);
    git(base, ['commit', '-q', '--allow-empty', '-m', 'Feature work (#9)'], at('2026-01-06'));
    const featureHash = git(base, ['rev-parse', 'HEAD']).trim();
    const { buildEvidenceIndex } = await import('../plugin/tools/lib/work-migrate-lists.js');
    const idx = buildEvidenceIndex(base);
    expect(idx.prs.has(1)).toBe(true);
    expect(idx.prs.has(9)).toBe(false);
    expect(idx.commits).not.toContain(featureHash);
    const dry = await runWorkStoreMigrate(base, { key: 'LN' });
    expect(dry.report).toMatch(/the default branch, main \(/);
  });

  it('origin/HEAD wins when it resolves: a local commit not on it is not evidence, and the report names it', async () => {
    const first = git(base, ['rev-parse', 'HEAD']).trim();
    git(base, ['update-ref', 'refs/remotes/origin/main', first]);
    git(base, ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main']);
    git(base, ['commit', '-q', '--allow-empty', '-m', 'Not pushed (#5)'], at('2026-01-06'));
    const { buildEvidenceIndex } = await import('../plugin/tools/lib/work-migrate-lists.js');
    const idx = buildEvidenceIndex(base);
    expect(idx.prs.has(1)).toBe(true);
    expect(idx.prs.has(5)).toBe(false);
    const dry = await runWorkStoreMigrate(base, { key: 'LN' });
    expect(dry.report).toMatch(/the default branch, origin\/HEAD \(/);
  });

  it('master when there is no main and no origin/HEAD', async () => {
    git(base, ['branch', '-m', 'main', 'master']);
    git(base, ['checkout', '-q', '-b', 'feature']);
    git(base, ['commit', '-q', '--allow-empty', '-m', 'Feature work (#9)'], at('2026-01-06'));
    const { buildEvidenceIndex } = await import('../plugin/tools/lib/work-migrate-lists.js');
    const idx = buildEvidenceIndex(base);
    expect(idx.prs.has(1)).toBe(true);
    expect(idx.prs.has(9)).toBe(false);
  });
});

// ── F3: the token covers each list's dates, and each proposal's evidence ──────
describe('AC4.3 — the token covers the dates and every proposal’s evidence (REVIEW pass 4)', () => {
  let root;
  let base;
  beforeEach(() => {
    ({ root, base } = repo('r4-hash-'));
    writeFileSync(join(base, '.planning', 'BUGS.md'), ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|',
      '| B1 | fixed | P2 | Rows vanish — PR #7. |', ''].join('\n'));
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Add the exporter (#7)'], at('2026-01-05'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const halves = (h) => h.split(':');

  it('only a list’s dates move → the inputs half moves', async () => {
    const plain = await runWorkStoreMigrate(base, { key: 'LN' });
    const execFn = (cmd, args, o) => (cmd === 'git' && args.includes('--follow') ? '2026-02-01\n2026-01-05\n' : execFileSync(cmd, args, o));
    const moved = await runWorkStoreMigrate(base, { key: 'LN', execFn });
    expect(moved.dates['BUGS.md'].last).toBe('2026-02-01');
    expect(moved.items).toEqual(plain.items);
    expect(moved.proposedCloses).toEqual(plain.proposedCloses);
    expect(halves(moved.inputHash)[0]).not.toBe(halves(plain.inputHash)[0]);
  });

  it('only a proposal’s evidence moves (same items, statuses, flags) → the outcome half moves, the apply refuses', async () => {
    const plain = await runWorkStoreMigrate(base, { key: 'LN' });
    expect(plain.proposedCloses).toHaveLength(1);
    const other = 'b'.repeat(40);
    const execFn = (cmd, args, o) => {
      const out = String(execFileSync(cmd, args, { ...o, encoding: 'utf8' }));
      return cmd === 'git' && isHistoryLog(args) ? out.replace(/^[0-9a-f]{40}(?=\tAdd the exporter)/m, other) : out;
    };
    const moved = await runWorkStoreMigrate(base, { key: 'LN', execFn });
    expect(moved.items).toEqual(plain.items);
    expect(moved.proposedCloses[0].evidence).toEqual(['PR #7 → bbbbbbb']);
    expect(halves(moved.inputHash)[0]).toBe(halves(plain.inputHash)[0]);
    expect(halves(moved.inputHash)[1]).not.toBe(halves(plain.inputHash)[1]);
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LN', stamp: 'T1', expectedHash: plain.inputHash, confirmCloses: true, execFn });
    expect(r.refused).toBe(true);
    expect(git(base, ['status', '--porcelain']).trim()).toBe('');
  });
});

// ── F4: only a literal `true` applies or confirms ─────────────────────────────
describe('only a literal true applies or confirms (REVIEW pass 4)', async () => {
  const { listRecords } = await import('../plugin/tools/lib/work-records.js');
  let root;
  let base;
  beforeEach(() => {
    ({ root, base } = repo('r4-true-'));
    writeFileSync(join(base, '.planning', 'BUGS.md'), ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|',
      '| B1 | fixed | P2 | Rows vanish — PR #7. |', '| B2 | open | P2 | Totals wrong. |', ''].join('\n'));
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Add the exporter (#7)'], at('2026-01-05'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  for (const apply of ['yes', 1]) {
    it(`apply: ${JSON.stringify(apply)} is a dry run — nothing written`, async () => {
      const dry = await runWorkStoreMigrate(base, { key: 'LN' });
      const r = await runWorkStoreMigrate(base, { apply, key: 'LN', stamp: 'T1', expectedHash: dry.inputHash, confirmCloses: true });
      expect(r.applied).toBe(false);
      expect(r.dryRun).toBe(true);
      expect(git(base, ['status', '--porcelain']).trim()).toBe('');
    });
  }
  for (const confirmCloses of ['yes', 1]) {
    it(`confirmCloses: ${JSON.stringify(confirmCloses)} does not confirm — nothing closed, closesConfirmed 0`, async () => {
      const dry = await runWorkStoreMigrate(base, { key: 'LN' });
      const r = await runWorkStoreMigrate(base, { apply: true, key: 'LN', stamp: 'T1', expectedHash: dry.inputHash, confirmCloses });
      expect(r.applied).toBe(true);
      expect(r.closesConfirmed).toBe(0);
      expect(r.report).toMatch(/1 proposed close was not confirmed/);
      expect(listRecords(base).records.filter((x) => x.record.events.some((e) => e.type === 'closed'))).toEqual([]);
    });
  }
  it('confirmCloses: true → closesConfirmed counts the closed events written among the proposals', async () => {
    const dry = await runWorkStoreMigrate(base, { key: 'LN' });
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LN', stamp: 'T1', expectedHash: dry.inputHash, confirmCloses: true });
    expect(r.closesConfirmed).toBe(1);
    expect(r.report).toMatch(/Closed 1 proposed close,/);
    expect(listRecords(base).records.filter((x) => x.record.events.some((e) => e.type === 'closed')).map((x) => x.record.legacy_id)).toEqual(['B1']);
  });
});

// ── F5: printable strips every control and format character ───────────────────
describe('printable: Cc, Cf (tag characters too) and variation selectors (REVIEW pass 4)', () => {
  let root;
  let base;
  const HIDDEN = '\u{E0001}\u{E0041}\u{E0042}\u{E007F}️\u{E0100}\u{E01EF}­⁯';
  beforeEach(() => {
    ({ root, base } = repo('r4-printable-'));
    writeFileSync(join(base, '.planning', 'BUGS.md'), ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|',
      `| B1 | fixed | P2 | Rows${HIDDEN} vanish — PR #7. |`, `| B2 | open${HIDDEN} | P2 | Totals${HIDDEN} wrong. |`, ''].join('\n'));
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Add the exporter (#7)'], at('2026-01-05'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('no Unicode tag character or variation selector reaches the dry-run report', async () => {
    const dry = await runWorkStoreMigrate(base, { key: 'LN' });
    expect(dry.report).toMatch(/Rows vanish/);
    expect(dry.report).toMatch(/Totals wrong/);
    expect(dry.report).not.toMatch(/[\u{E0000}-\u{E007F}︀-️\u{E0100}-\u{E01EF}­⁯]/u);
  });
});

// ── F6: at most three pieces of evidence shown; every note bounded and printable ──
describe('caps: three pieces of evidence shown, the hash keeps them all (REVIEW pass 4)', () => {
  let root;
  let base;
  beforeEach(() => {
    ({ root, base } = repo('r4-caps-'));
    writeFileSync(join(base, '.planning', 'BUGS.md'), ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|',
      '| B1 | fixed | P2 | Rows vanish — PR #1, PR #2, PR #3, PR #4, PR #5. |', ''].join('\n'));
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Batch (#1) (#2) (#3) (#4) (#5)'], at('2026-01-05'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('the proposal line and proposedCloses[].evidence show three, then "… and N more"', async () => {
    const dry = await runWorkStoreMigrate(base, { key: 'LN' });
    const [c] = dry.proposedCloses;
    expect(c.evidence).toHaveLength(4);
    expect(c.evidence.slice(0, 3).map((e) => e.split(' →')[0])).toEqual(['PR #1', 'PR #2', 'PR #3']);
    expect(c.evidence[3]).toBe('… and 2 more');
    const line = dry.report.split('\n').find((l) => l.includes('LN-1') && l.includes('evidence'));
    expect(line).toMatch(/PR #3 → [0-9a-f]{7}; … and 2 more$/);
    expect(line.split('; evidence ')[1]).not.toMatch(/PR #4/);
  });

  it('the hash keeps the full list: only the fifth piece moving moves the outcome half', async () => {
    const plain = await runWorkStoreMigrate(base, { key: 'LN' });
    const execFn = (cmd, args, o) => {
      const out = String(execFileSync(cmd, args, { ...o, encoding: 'utf8' }));
      return cmd === 'git' && isHistoryLog(args) ? `${'b'.repeat(40)}\tElsewhere (#5)\n${out}` : out;
    };
    const moved = await runWorkStoreMigrate(base, { key: 'LN', execFn });
    expect(moved.items).toEqual(plain.items);
    expect(moved.proposedCloses).toEqual(plain.proposedCloses);
    expect(moved.inputHash.split(':')[1]).not.toBe(plain.inputHash.split(':')[1]);
  });
});

describe('every migration_note is bounded and printable, whatever the branch (REVIEW pass 4)', () => {
  const HOSTILE = `\u001b[31m‮${'x '.repeat(200000)}`;
  const bugs = (idCell, status) => ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|', `| ${idCell} | ${status} | P2 | Rows vanish. |`, ''].join('\n');
  const cases = {
    'status-unmapped': { 'BUGS.md': bugs('B1', `open ${HOSTILE}`) },
    conflict: { 'BUGS.md': bugs('~~B1~~', `open ${HOSTILE}`) },
    'finished-word-unmapped': { 'BACKLOG.md': `# Backlog\n\n### #12 — Export · **ABANDONED ${HOSTILE}**\nBody.\n` },
    unclear: { 'BUGS.md': bugs('B1', `fixed but ${HOSTILE}`) },
  };
  for (const [flag, texts] of Object.entries(cases)) {
    it(`${flag}: a 400 KB status with ESC and RLO → a short note with neither`, () => {
      expect(Object.values(texts)[0].length).toBeGreaterThan(400000);
      const p = planListsToRecords(texts, { key: 'LF', dates: DATES, evidence: EVIDENCE, acknowledgeSensitive: true });
      expect(p.errors).toEqual([]);
      const r = firstItem(p);
      expect(r.flagged).toBe(flag);
      expect(r.record.migration_note.length).toBeLessThanOrEqual(2000);
      expect(r.record.migration_note).not.toMatch(/[\u001b‮]/);
    });
  }
});

// ── F7: the no-free-text tail allows reference SHAPES, not any token with a digit ──
describe('finished wording: references are explicit shapes (REVIEW pass 4)', async () => {
  const { finishedLead } = await import('../plugin/tools/lib/work-migrate.js');
  const unclear = ['Fixed — crashes-on-win10', 'Fixed in PR #12 — fails-on-iOS17', 'Done — needs-QA-v2', 'Fixed in v2 — then-broke-in-v3',
    'Fixed — crash/win10', 'Fixed — crashes_on_win10', 'Resolved — on hold2', 'Fixed in prod2', 'Fixed — iOS17-only',
    'Fixed — 2x-slower PR #1', 'Fixed — https://x.y/needs-QA PR #1', 'Fixed — https://github.com/o/r/pull/1/needs-more-work'];
  const plain = ['DONE — M2.10.E2, 2026-10-08', '**Done** in M2.10.E2 (S5) — [PR #157](https://github.com/o/r/pull/157).', 'fixed in PR #12',
    'Fixed in v2.1', 'Closed — not a bug', 'Closed — won\'t fix', 'Fixed — https://github.com/o/r/pull/157', 'Fixed in e41d30e.',
    'Fixed — BUG-7, SIG-12', 'Fixed in v2.', 'Fixed in pr #12', 'Fixed in Pull Request #12', 'Fixed IN PR #12'];
  it.each(unclear)('"%s" → unclear', (text) => {
    expect(finishedLead(text).unclear).toBe(true);
  });
  it.each(plain)('"%s" → a finished marker', (text) => {
    const c = finishedLead(text);
    expect(c.unclear).toBe(false);
    expect(c.reasons.size).toBeGreaterThan(0);
  });
});
