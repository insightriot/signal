// M6.E15 fix loop 2 — C1 (REVIEW pass 1 C1, pass 2 C1 residue), D-M6E15-24.
// AC4.1 / AC4.2 as amended: a migrated entry closes only when (a) its status
// wording passes the allowed-continuation grammar AND (b) at least one
// reference in the entry resolves in the repository being migrated — a commit
// that exists, a PR number found in a commit subject, or an Epic ID with a
// retrospective under `.planning/`. Anything else is open, flagged, with a
// migration_note saying what was found and not found.
//
// Fixtures are invented text; no project is named (tests/private-name-guard).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { finishedLead } from '../plugin/tools/lib/work-migrate.js';
import { buildEvidenceIndex, planListsToRecords, runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures', 'work-migrate-corpus1');

const DATES = {
  'BUGS.md': { first: '2026-01-05', last: '2026-03-09' },
  'BACKLOG.md': { first: '2026-01-06', last: '2026-03-08' },
  'ISSUES-INBOX.md': { first: '2026-01-07', last: '2026-01-07' },
  'OPEN-QUESTIONS.md': { first: '2026-01-08', last: '2026-02-16' },
};
const HASH = 'e41d30e9b7c2a1f0e41d30e9b7c2a1f0e41d30e9';
const EVIDENCE = {
  commits: [HASH],
  prs: new Map([[157, HASH]]),
  epics: new Map([['M2.10.E2', '.planning/archive/M2.10.E2-RETROSPECTIVE.md']]),
  origin: { host: 'example.com', repo: 'acme/ledger' },
};
// confirmCloses: true is the person's yes to the proposed closes (D-M6E15-25):
// these tests pin what a CONFIRMED close carries. That nothing closes without
// it is pinned in tests/work-migrate-propose.test.js.
const plan = (texts, opts = {}) => planListsToRecords(texts, { key: 'LF', dates: DATES, evidence: EVIDENCE, confirmCloses: true, ...opts });
const one = (file, text, opts) => {
  const p = plan({ [file]: text }, opts);
  expect(p.errors).toEqual([]);
  const e = p.records.filter((r) => r.flagged !== 'non-item');
  expect(e).toHaveLength(1);
  return e[0];
};
const status = (r) => ({ created: 'N', triaged: 'T', closed: 'C' }[r.record.events.at(-1).type]);
const closedEvent = (r) => r.record.events.find((e) => e.type === 'closed');
const bugEntry = (s, body = 'What happens. Fixed by PR #157.') => ['# Bugs', '', '## The exporter drops a row', '', `**Status:** ${s}`, '', body, '', '---', ''].join('\n');
const bugTable = (cell, summary) => ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|', `| B3 | ${cell} | P2 | ${summary} |`, ''].join('\n');
const backlogRow = (heading, body = 'Body text.') => ['# Backlog', '', `### ${heading}`, body, ''].join('\n');
const grouped = (group, entryStatus = null) => ['# Open Questions', '', `## ${group}`, '', '### Q7 — Which currency?', '',
  ...(entryStatus ? [`**Status:** ${entryStatus}`, ''] : []), 'Settled in PR #157.', ''].join('\n');

// ── (a) the wording ─────────────────────────────────────────────────────────

// Every phrase REVIEW pass 1 (C1) and pass 2 (C1 residue) named, and the
// spec's own list of continuations that are not allowed.
const REVIEW_PHRASES = [
  // pass 1
  'Not yet fixed — waiting on upstream',
  'To be done in v3',
  'blocked until auth is done',
  'Open until upstream is fixed',
  'Resolved during v2.6 — but not closed',
  // pass 2
  'RESOLVED (reverted)',
  'Closed — reopened',
  'Done — reverted',
  'Fixed, then reverted',
  'Fixed in theory',
  'Done-ish',
  'Fixed?',
  'Resolved: no',
  'Answered: TBD',
  'closed: wrong, still broken',
  // the spec's other continuations
  'Fixed but only on desktop',
  'Fixed yet flaky',
  'Fixed — not on Windows',
  'Done — TBD',
  'Fixed — wrong branch',
];

describe('C1 (a) — the allowed-continuation grammar (D-M6E15-24)', () => {
  const PASS = [
    ['fixed', 'fixed'],
    ['Fixed.', 'fixed'],
    ['done', 'fixed'],
    ['Resolved', 'fixed'],
    ['ANSWERED', 'fixed'],
    ['Closed', 'fixed'],
    ['SHIPPED', 'fixed'],
    ['Fully resolved.', 'fixed'],
    ['fixed 2026-02-04', 'fixed'],
    ['closed on 2026-03-02', 'fixed'],
    ['fixed in M9.E2', 'fixed'],
    ['Resolved in PR #12', 'fixed'],
    ['Done in v2', 'fixed'],
    ['DONE — M9.E1, 2026-03-08', 'fixed'],
    ['fixed in M9.E2 (S4) — PR #157.', 'fixed'],
    ['Closed — superseded', 'stale'],
    ['not-a-bug (closed 2026-03-02)', 'rejected'],
    ["won't-fix — M9.E2", 'wontdo'],
    ['wontfix', 'wontdo'],
    ['superseded', 'stale'],
  ];
  for (const [text, reason] of PASS) {
    it(`"${text}" → ${reason}`, () => {
      const c = finishedLead(text);
      expect(c.unclear).toBe(false);
      expect([...c.reasons]).toEqual([reason]);
    });
  }

  const UNCLEAR = [
    ...REVIEW_PHRASES,
    'Resolved at REVIEW. The worker now logs and rethrows.',
    'Resolved during v4.1 (kept for reference)',
    'Resolved questions we reopened',
    'superseded by #20',
    'SHIPPED v2.1',
    'Fixed 3 of 5',
    'Fixed. Then reverted.',
    'Fixed: see below',
    // Free text after a note start reads unclear since REVIEW pass 3 (C1,
    // D-M6E15-25) — these passed under D-M6E15-24 and are flipped on purpose.
    // Nothing closes unseen any more, so an over-flag costs a person's look.
    'fixed 2026-02-04 — rows are kept now.',
    'shipped - in the March build',
    'fixed in M9.E2 (S4) — empty slots are passed over.',
    'Closed. Nothing to do.',
    'fixed in M9.E2 (S4) — the Try again button re-runs the open.',
    'not-a-bug (closed 2026-03-02) — works as designed.',
    "won't-fix — the old exporter is going away.",
  ];
  for (const text of UNCLEAR) {
    it(`"${text}" → unclear`, () => {
      const c = finishedLead(text);
      expect(c.unclear).toBe(true);
      expect(c.reasons.size).toBe(0);
    });
  }

  for (const text of ['Half are fixed', 'needs-triage', 'confirmed', 'Done when: the CSV downloads.', 'Definition of done: tests pass']) {
    it(`"${text}" → not a marker`, () => {
      const c = finishedLead(text);
      expect(c.unclear).toBe(false);
      expect(c.reasons.size).toBe(0);
    });
  }

  it('every Status line and group heading in the corpus fixture is classified (one rule)', () => {
    const lines = ['BUGS.md', 'OPEN-QUESTIONS.md'].flatMap((f) => readFileSync(join(FIX, f), 'utf-8').split('\n'));
    const statuses = lines.filter((l) => l.startsWith('**Status:**')).map((l) => l.replace('**Status:**', '').trim());
    const groups = lines.filter((l) => l.startsWith('## ')).map((l) => l.slice(3).trim());
    const verdict = (t) => {
      const c = finishedLead(t);
      return c.unclear ? 'unclear' : c.reasons.size ? [...c.reasons].join(',') : 'none';
    };
    // Since REVIEW pass 3 (C1) a sentence or a note of words after the finish
    // word reads unclear: the four Status lines that carry one flipped.
    expect(Object.fromEntries([...statuses, ...groups].map((t) => [t.slice(0, 41), verdict(t)]))).toEqual({
      'not-a-bug (closed 2026-03-02 during M9.E1': 'unclear',
      'fixed in M9.E2 (S4) — empty slots are now': 'unclear',
      'needs-triage': 'none',
      'scoped into M9.E3 (FR-02), 2026-03-09': 'none',
      'Fully resolved. Logged as Issue #12 on 20': 'unclear',
      'Resolved. The warning came from a check t': 'unclear',
      'Resolved at REVIEW. The worker now logs a': 'unclear',
      // BUGS.md's `##` entry headings
      'Meal snapshot load uses the strict check ': 'none',
      'Suggest-a-swap rejects meal plans with an': 'none',
      'Recipe import keeps unknown top-level key': 'none',
      'Pantry banner "Retry" reloads the list, n': 'none',
      'Older clients overwrite a row written by ': 'none',
      // OPEN-QUESTIONS.md's group headings
      'Currently blocking': 'none',
      'Resolved during v4.1 (kept for reference)': 'unclear',
      'Last Updated': 'none',
    });
  });
});

describe('C1 (a) — every review phrase leaves its entry open and flagged, even with a resolving reference', () => {
  for (const s of REVIEW_PHRASES) {
    it(`a Status line "${s}" → open, flagged unclear`, () => {
      const r = one('BUGS.md', bugEntry(s));
      expect(status(r)).toBe('T');
      expect(closedEvent(r)).toBeUndefined();
      expect(r.flagged).toBe('unclear');
      expect(r.record.migration_note).toMatch(/does not read as plainly finished/);
    });
    it(`a bug table cell "${s}" → open, flagged unclear`, () => {
      const r = one('BUGS.md', bugTable(s, '**A defect** — see PR #157.'));
      expect(status(r)).toBe('T');
      expect(r.flagged).toBe('unclear');
    });
    it(`a backlog bold lead "**${s}**" → open, flagged unclear`, () => {
      const r = one('BACKLOG.md', backlogRow('#40 — Export to CSV · **roadmap** · small', `**${s}** in PR #157.`));
      expect(status(r)).toBe('T');
      expect(r.flagged).toBe('unclear');
    });
    it(`a backlog heading annotation "· **${s}**" → open, flagged unclear`, () => {
      const r = one('BACKLOG.md', backlogRow(`#41 — Export to PDF · **roadmap** · small · **${s}**`, 'Landed in PR #157.'));
      expect(status(r)).toBe('T');
      expect(r.flagged).toBe('unclear');
    });
  }

  for (const s of ['Fixed — reopened', 'RESOLVED (reverted)', 'Fixed?']) {
    it(`a struck heading followed by "${s}" → open, flagged unclear`, () => {
      const r = one('BACKLOG.md', backlogRow(`~~#42 — Old idea · **roadmap** · small~~ ${s}`, 'PR #157.'));
      expect(status(r)).toBe('T');
      expect(r.flagged).toBe('unclear');
    });
  }

  for (const group of ['Resolved questions we reopened', 'Not yet resolved', 'Resolved during v2.6 — but not closed', 'Resolved: no', 'Closed?']) {
    it(`a question under "## ${group}" → open, flagged unclear`, () => {
      const r = one('OPEN-QUESTIONS.md', grouped(group));
      expect(status(r)).toBe('T');
      expect(closedEvent(r)).toBeUndefined();
      expect(r.flagged).toBe('unclear');
    });
  }

  for (const line of ['**Done when:** the CSV downloads. PR #157.', '**Definition of done:** tests pass. PR #157.']) {
    it(`"${line}" never counts → open, no-marker`, () => {
      const r = one('BACKLOG.md', backlogRow('#43 — Export · **roadmap** · small', line));
      expect(status(r)).toBe('T');
      expect(r.flagged).toBe('no-marker');
    });
  }
});

// ── (b) the evidence ────────────────────────────────────────────────────────

describe('C1 (b) — a finished entry closes only on a reference that resolves (AC4.1)', () => {
  const kinds = [
    ['a commit hash (7 hex)', 'Landed in e41d30e.', 'commit e41d30e'],
    ['a commit hash (40 hex)', `Landed in ${HASH}.`, 'commit e41d30e'],
    ['a PR number (#N)', 'Landed in #157.', 'PR #157 → e41d30e'],
    ['a PR number (PR #N)', 'Landed in PR #157.', 'PR #157 → e41d30e'],
    // A full link to this repository's origin (REVIEW pass 3 I-2).
    ['a /pull/N link', 'See [the change](https://example.com/acme/ledger/pull/157).', 'PR #157 → e41d30e'],
    ['an Epic ID with a retrospective', 'Shipped with M2.10.E2.', 'M2.10.E2 → .planning/archive/M2.10.E2-RETROSPECTIVE.md'],
  ];
  for (const [name, body, evidence] of kinds) {
    it(`${name} → closed, the proof naming the wording and the evidence`, () => {
      // A full 40-hex hash is also the scrubber's `hex-blob-40`: a person has read it.
      const r = one('BUGS.md', bugEntry('fixed', body), body.includes(HASH) ? { acknowledgeSensitive: true } : undefined);
      expect(status(r)).toBe('C');
      expect(r.flagged).toBeNull();
      expect(closedEvent(r)).toMatchObject({ reason: 'fixed', legacy: true, proof: `fixed; ${evidence}` });
    });
  }

  const words = [
    ['fixed', 'fixed'], ['done', 'fixed'], ['resolved', 'fixed'], ['closed', 'fixed'], ['answered', 'fixed'], ['shipped', 'fixed'],
    ['not-a-bug', 'rejected'], ["won't-fix", 'wontdo'], ['superseded', 'stale'],
  ];
  for (const [word, reason] of words) {
    it(`"${word}" with a resolving reference → closed ${reason}`, () => {
      const r = one('BUGS.md', bugEntry(word, 'See PR #157.'));
      expect(status(r)).toBe('C');
      expect(closedEvent(r).reason).toBe(reason);
    });
  }

  it('the spec example: **DONE — M2.10.E2, 2026-10-08** with PR #157 in the body → both in the proof, the marker date kept', () => {
    const r = one('BACKLOG.md', backlogRow('#12 — Export · **roadmap** · small · **DONE — M2.10.E2, 2026-10-08**', 'Merged as PR #157.'),
      { dates: { 'BACKLOG.md': { first: '2026-01-06', last: '2026-11-01' } } });
    expect(closedEvent(r)).toMatchObject({ reason: 'fixed', at: '2026-10-08', proof: 'DONE — M2.10.E2, 2026-10-08; M2.10.E2 → .planning/archive/M2.10.E2-RETROSPECTIVE.md; PR #157 → e41d30e' });
  });

  it('a bare `fixed` table cell with the PR link in the summary closes (the reference is anywhere in the entry)', () => {
    const r = one('BUGS.md', bugTable('`fixed`', '**Rows vanish** — [PR #157](https://example.com/acme/pull/157).'));
    expect(status(r)).toBe('C');
    expect(closedEvent(r).proof).toBe('`fixed`; PR #157 → e41d30e');
  });

  it('wording says fixed, no reference at all → open, flagged no-evidence, the note says nothing was cited', () => {
    const r = one('BUGS.md', bugEntry('fixed', 'Works now.'));
    expect(status(r)).toBe('T');
    expect(r.flagged).toBe('no-evidence');
    expect(r.record.migration_note).toMatch(/wording says “fixed”.*cites no commit, pull request or Epic/);
  });

  it('a cited PR not in history → open, the note naming it', () => {
    const r = one('BUGS.md', bugEntry('fixed', 'Merged as PR #40.'));
    expect(status(r)).toBe('T');
    expect(r.flagged).toBe('no-evidence');
    expect(r.record.migration_note).toMatch(/wording says “fixed”; cited PR #40 not found in this repository's history/);
  });

  it('a missing commit and a missing Epic → open, the note naming both', () => {
    const r = one('BUGS.md', bugEntry('fixed', 'Landed in abc1234 for M9.E9.'));
    expect(r.flagged).toBe('no-evidence');
    expect(r.record.migration_note).toMatch(/commit abc1234 not found in this repository's history/);
    expect(r.record.migration_note).toMatch(/Epic M9\.E9 has no retrospective under \.planning\//);
  });

  it('the entry’s own old ID is never its evidence (#157 — Export … · DONE)', () => {
    const r = one('BACKLOG.md', backlogRow('#157 — Export · **roadmap** · small · **DONE**', 'Body.'));
    expect(status(r)).toBe('T');
    expect(r.flagged).toBe('no-evidence');
  });

  it('`Issue #N` is an issue, not a PR', () => {
    const r = one('BUGS.md', bugEntry('fixed', 'Reported as Issue #157.'));
    expect(r.flagged).toBe('no-evidence');
  });

  it('no evidence index given → every reference is unresolved (fail closed), the note saying no history was checked', () => {
    const r = one('BUGS.md', bugEntry('fixed', 'Merged as PR #157.'), { evidence: undefined });
    expect(status(r)).toBe('T');
    expect(r.flagged).toBe('no-evidence');
    expect(r.record.migration_note).toMatch(/no repository history/);
  });

  it('a struck heading alone still needs a resolving reference', () => {
    expect(status(one('BACKLOG.md', backlogRow('~~#13 — Export to PDF · **roadmap** · small~~', 'Body.')))).toBe('T');
    const r = one('BACKLOG.md', backlogRow('~~#13 — Export to PDF · **roadmap** · small~~', 'PR #157.'));
    expect(status(r)).toBe('C');
    expect(closedEvent(r).proof).toBe('~~#13 — Export to PDF · **roadmap** · small~~; PR #157 → e41d30e');
  });

  it('a grouped question closes under a heading that passes the grammar, with evidence in the entry', () => {
    const r = one('OPEN-QUESTIONS.md', grouped('Resolved in v2'));
    expect(status(r)).toBe('C');
    expect(closedEvent(r).proof).toBe('Resolved in v2; PR #157 → e41d30e');
  });

  it('a proof carries no control characters and is bounded', () => {
    // Long wording that passes the grammar (references only), control
    // characters inside a link's URL.
    const r = one('BUGS.md', bugEntry(`fixed — ${'v1 '.repeat(200)}[PR #157](x\u0007\u009b)`, 'PR #157.'));
    const { proof } = closedEvent(r);
    expect(proof.length).toBeLessThanOrEqual(400);
    // eslint-disable-next-line no-control-regex
    expect(proof).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
    expect(proof).toMatch(/PR #157 → e41d30e$/);
  });
});

// ── Integration: a real repository ──────────────────────────────────────────

const git = (cwd, args, env = {}) => String(execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env } }));
const at = (day) => ({ GIT_AUTHOR_DATE: `${day}T12:00:00Z`, GIT_COMMITTER_DATE: `${day}T12:00:00Z` });
const STATE = '---\nschema_version: 1\ndocs_layout_version: 3\nphase: PLAN\ncurrent_epic: null\ncurrent_tasks: []\n'
  + 'completed_phases: []\nblockers: []\n---\n# Project State\n\nbody\n';

describe('C1 (b) — integration: the index is built from this repository’s git and retrospectives', () => {
  let root;
  let base;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'evidence-'));
    base = join(root, 'leaf-notes');
    mkdirSync(join(base, '.planning', 'archive'), { recursive: true });
    git(base, ['init', '-q', '-b', 'main']);
    git(base, ['config', 'user.email', 't@t.co']);
    git(base, ['config', 'user.name', 'T']);
    git(base, ['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(base, '.planning', 'STATE.md'), STATE);
    writeFileSync(join(base, '.planning', 'archive', 'M3.E1-RETROSPECTIVE.md'), '# Retro\n');
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Add the exporter (#7)'], at('2026-01-05'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('exactly the entries whose reference resolves close; the dry run says closes were checked against history', async () => {
    const head = git(base, ['rev-parse', 'HEAD']).trim();
    const bugs = [
      '# Bugs', '',
      '| ID | Status | Pri | What |', '|---|---|---|---|',
      '| B1 | fixed | P2 | Rows vanish — PR #7. |',
      '| B2 | fixed | P2 | Rows vanish twice — PR #8. |',
      `| B3 | fixed | P2 | Totals wrong — landed in ${head.slice(0, 9)}. |`,
      '| B4 | fixed | P2 | Totals wrong twice — landed in 0badc0de. |',
      '| B5 | fixed | P2 | Header lost — shipped with M3.E1. |',
      '| B6 | fixed | P2 | Footer lost — shipped with M3.E2. |',
      '',
    ].join('\n');
    writeFileSync(join(base, '.planning', 'BUGS.md'), bugs);
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'bugs'], at('2026-01-06'));

    const idx = buildEvidenceIndex(base);
    expect(idx.prs.has(7)).toBe(true);
    expect(idx.epics.has('M3.E1')).toBe(true);

    const r = await runWorkStoreMigrate(base, { apply: false, key: 'LN' });
    expect(r.refused).toBeUndefined();
    const byOld = Object.fromEntries(r.items.map((it) => [it.legacy_id, it]));
    // Every entry is open in a dry run; the ones that resolve are PROPOSED
    // closes (D-M6E15-25).
    expect(Object.fromEntries(Object.entries(byOld).map(([k, it]) => [k, it.flag]))).toEqual({
      B1: 'looks-finished', B2: 'no-evidence', B3: 'looks-finished', B4: 'no-evidence', B5: 'looks-finished', B6: 'no-evidence',
    });
    for (const it of r.items) expect(it.status, it.legacy_id).toBe('T');
    expect(r.proposedCloses.map((c) => c.legacyId)).toEqual(['B1', 'B3', 'B5']);
    expect(r.report).toMatch(/checked against this repository's history/);
  });

  it('no list text reaches git: one fixed-argument git log per index build', () => {
    writeFileSync(join(base, '.planning', 'BUGS.md'), '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | fixed | P2 | `--output=/tmp/x` $(touch y) PR #7 |\n');
    const calls = [];
    const execFn = (cmd, args, o) => {
      calls.push([cmd, ...args]);
      return execFileSync(cmd, args, o);
    };
    buildEvidenceIndex(base, { execFn });
    // Two fixed-argument reads: the history, and the origin a /pull/N link
    // must point at (REVIEW pass 3 I-2).
    expect(calls).toEqual([['git', 'log', 'HEAD', '--format=%H%x09%s'], ['git', 'remote', 'get-url', 'origin']]);
  });
});

// ── a folded <details> block is not the live row's text (fix loop 2, executor's leftover) ──
// segmentBacklog folds a `<details>` block into the row above it. Its words
// and its references belong to the folded entry, so they must neither close
// the live row nor give it evidence.
describe('a folded <details> block never closes the row above it', () => {
  const folded = (liveBody, foldBody) => ['# Backlog', '', '### #12 — Export the ledger as CSV · **roadmap**', liveBody, '',
    '<details><summary>#11 — Older export work</summary>', '', foldBody, '', '</details>', ''].join('\n');

  it('passing wording on the live row, a resolving PR only inside the fold → open', () => {
    const p = plan({ 'BACKLOG.md': folded('**Done** — shipped to users.', '**Done** in M2.10.E2 — [PR #157](x).') });
    const live = p.records.find((r) => r.record.title.includes('Export the ledger'));
    expect(status(live)).not.toBe('C');
    expect(live.flagged).toBeTruthy();
  });

  it('no wording on the live row, finished wording and evidence only inside the fold → open', () => {
    const p = plan({ 'BACKLOG.md': folded('Not started.', '**Done** in M2.10.E2 — [PR #157](x).') });
    const live = p.records.find((r) => r.record.title.includes('Export the ledger'));
    expect(status(live)).not.toBe('C');
  });

  it('the live row still closes on its own wording and evidence, fold or not', () => {
    const p = plan({ 'BACKLOG.md': folded('**Done** in M2.10.E2 — [PR #157](x).', 'Notes only.') });
    const live = p.records.find((r) => r.record.title.includes('Export the ledger'));
    expect(status(live)).toBe('C');
  });
});
