// M6.E15 fix loop 3 — the migration proposes closes, the person confirms
// (D-M6E15-25; AC4.1–AC4.3 as amended at REVIEW pass 3).
//
// An entry whose wording and evidence pass D-M6E15-24 is a PROPOSED close:
// open, flagged `looks-finished`, its wording and evidence in the dry run. Only
// `confirmCloses: true` (the person's one yes) closes exactly that list.
//
// Fixtures are invented text; no project is named (tests/private-name-guard).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

import { planListsToRecords, runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { listRecords } from '../plugin/tools/lib/work-records.js';

const DATES = {
  'BUGS.md': { first: '2026-01-05', last: '2026-03-09' },
  'BACKLOG.md': { first: '2026-01-06', last: '2026-03-08' },
  'ISSUES-INBOX.md': { first: '2026-01-07', last: '2026-01-07' },
  'OPEN-QUESTIONS.md': { first: '2026-01-08', last: '2026-02-16' },
};
const HASH = 'e41d30e9b7c2a1f0e41d30e9b7c2a1f0e41d30e9';
const EVIDENCE = { source: 'git', commits: [HASH], prs: new Map([[157, HASH]]), epics: new Map(), origin: null };
const plan = (texts, opts = {}) => planListsToRecords(texts, { key: 'LF', dates: DATES, evidence: EVIDENCE, ...opts });
const status = (r) => ({ created: 'N', triaged: 'T', closed: 'C' }[r.record.events.at(-1).type]);
const closedEvent = (r) => r.record.events.find((e) => e.type === 'closed');
const BUGS = ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|',
  '| B1 | fixed | P2 | Rows vanish — PR #157. |',
  '| B2 | open | P2 | Totals wrong — PR #157. |',
  '| B3 | fixed | P2 | Header lost — no reference. |',
  ''].join('\n');

describe('AC4.1 — the planner never closes on its own (D-M6E15-25)', () => {
  it('by default a passing entry is open, flagged looks-finished, and listed as a proposed close', () => {
    const p = plan({ 'BUGS.md': BUGS });
    expect(p.errors).toEqual([]);
    const [b1, b2, b3] = p.records;
    expect(status(b1)).toBe('T');
    expect(closedEvent(b1)).toBeUndefined();
    expect(b1.flagged).toBe('looks-finished');
    expect(b1.record.migration_note).toMatch(/fixed/);
    expect(b1.record.migration_note).toMatch(/PR #157 → e41d30e/);
    expect(b1.record.migration_note).toMatch(/not confirmed/);
    expect(p.proposedCloses).toEqual([{
      id: 'LF-1', legacyId: 'B1', title: b1.record.title, reason: 'fixed', wording: 'fixed',
      evidence: ['PR #157 → e41d30e'], proof: 'fixed; PR #157 → e41d30e',
    }]);
    expect(p.manifest.items[0]).toMatchObject({ status: 'T', flag: 'looks-finished' });
    expect(b2.flagged).not.toBe('looks-finished');
    expect(b3.flagged).toBe('no-evidence');
    expect(p.manifest.files['BUGS.md'].closed).toBe(0);
  });

  it('confirmCloses: true closes exactly the proposed list, legacy, proof = wording + evidence, no flag', () => {
    const p = plan({ 'BUGS.md': BUGS }, { confirmCloses: true });
    const [b1, b2, b3] = p.records;
    expect(status(b1)).toBe('C');
    expect(closedEvent(b1)).toMatchObject({ reason: 'fixed', legacy: true, proof: 'fixed; PR #157 → e41d30e' });
    expect(b1.flagged).toBeNull();
    expect(b1.record.migration_note).toBeUndefined();
    expect(status(b2)).toBe('T');
    expect(status(b3)).toBe('T');
    expect(p.proposedCloses.map((x) => x.id)).toEqual(['LF-1']);
    expect(p.manifest.files['BUGS.md'].closed).toBe(1);
  });
});

const git = (cwd, args, env = {}) => String(execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env } }));
const at = (day) => ({ GIT_AUTHOR_DATE: `${day}T12:00:00Z`, GIT_COMMITTER_DATE: `${day}T12:00:00Z` });
const STATE = '---\nschema_version: 1\ndocs_layout_version: 3\nphase: PLAN\ncurrent_epic: null\ncurrent_tasks: []\n'
  + 'completed_phases: []\nblockers: []\n---\n# Project State\n\nbody\n';

describe('AC4.1 — end to end: the dry run shows the proposals; the apply closes them only on yes', () => {
  let root;
  let base;
  const write = (rel, text) => {
    mkdirSync(dirname(join(base, rel)), { recursive: true });
    writeFileSync(join(base, rel), text);
  };
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'propose-'));
    base = join(root, 'leaf-notes');
    mkdirSync(base, { recursive: true });
    git(base, ['init', '-q', '-b', 'main']);
    git(base, ['config', 'user.email', 't@t.co']);
    git(base, ['config', 'user.name', 'T']);
    git(base, ['config', 'commit.gpgsign', 'false']);
    git(base, ['config', 'tag.gpgsign', 'false']);
    write('.planning/STATE.md', STATE);
    write('.planning/BUGS.md', BUGS.replaceAll('#157', '#7'));
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Add the exporter (#7)'], at('2026-01-05'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('the dry run lists each proposed close with its new ID, old ID, title, wording and evidence', async () => {
    const dry = await runWorkStoreMigrate(base, { key: 'LN' });
    expect(dry.proposedCloses.map((x) => x.legacyId)).toEqual(['B1']);
    expect(dry.report).toContain('Proposed closes (1) — confirm to close them; anything not confirmed stays open, flagged looks-finished');
    const line = dry.report.split('\n').find((l) => l.includes('LN-1') && l.includes('PR #7 → '));
    expect(line).toBeDefined();
    expect(line).toContain('B1');
    expect(line).toContain('Rows vanish');
    expect(line).toContain('fixed');
    expect(dry.items.find((i) => i.legacy_id === 'B1')).toMatchObject({ status: 'T', flag: 'looks-finished' });
  });

  it('apply without confirmCloses → B1 stays open (the report says the proposal was not confirmed)', async () => {
    const dry = await runWorkStoreMigrate(base, { key: 'LN' });
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LN', stamp: 'T1', expectedHash: dry.inputHash });
    expect(r.applied).toBe(true);
    expect(r.report).toMatch(/1 proposed close was not confirmed/);
    const b1 = listRecords(base).records.find((x) => x.record.legacy_id === 'B1');
    expect(b1.record.events.at(-1).type).toBe('triaged');
  });

  it('apply with confirmCloses after an unchanged dry run → succeeds and closes exactly the proposals', async () => {
    const dry = await runWorkStoreMigrate(base, { key: 'LN' });
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LN', stamp: 'T1', expectedHash: dry.inputHash, confirmCloses: true });
    expect(r.refused).toBeUndefined();
    expect(r.applied).toBe(true);
    expect(r.report).toMatch(/Closed 1 proposed close/);
    const recs = listRecords(base).records;
    const closed = recs.filter((x) => x.record.events.at(-1).type === 'closed').map((x) => x.record.legacy_id);
    expect(closed).toEqual(['B1']);
  });
});

describe('AC4.3 — the dry run’s hash covers what the person saw (D-M6E15-25)', () => {
  let root;
  let base;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'propose-hash-'));
    base = join(root, 'leaf-notes');
    mkdirSync(join(base, '.planning'), { recursive: true });
    git(base, ['init', '-q', '-b', 'main']);
    git(base, ['config', 'user.email', 't@t.co']);
    git(base, ['config', 'user.name', 'T']);
    git(base, ['config', 'commit.gpgsign', 'false']);
    git(base, ['config', 'tag.gpgsign', 'false']);
    writeFileSync(join(base, '.planning', 'STATE.md'), STATE);
    writeFileSync(join(base, '.planning', 'BUGS.md'), ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|',
      '| B1 | fixed | P2 | Rows vanish — PR #42. |', ''].join('\n'));
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Add the lists'], at('2026-01-05'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('the pass-3 repro: a commit adding (#42) between the dry run and the apply, on a clean tree → refused, nothing written', async () => {
    const dry = await runWorkStoreMigrate(base, { key: 'LN' });
    expect(dry.items[0].flag).toBe('no-evidence');
    expect(dry.proposedCloses).toEqual([]);
    writeFileSync(join(base, 'README.md'), 'x\n');
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Keep the rows (#42)'], at('2026-01-06'));
    expect(git(base, ['status', '--porcelain']).trim()).toBe('');

    for (const confirmCloses of [false, true]) {
      const r = await runWorkStoreMigrate(base, { apply: true, key: 'LN', stamp: 'T1', expectedHash: dry.inputHash, confirmCloses });
      expect(r.refused).toBe(true);
      expect(r.reason).toMatch(/changed since the dry run/);
      expect(r.reason).toMatch(/history|proposed close/);
      expect(r.reason).not.toMatch(/STATE\.md or a list/);
    }
    expect(git(base, ['status', '--porcelain']).trim()).toBe('');
    expect(git(base, ['tag', '-l']).trim()).toBe('');
  });

  it('the token moves when only the outcome moves (same lists, same STATE.md)', async () => {
    const h0 = (await runWorkStoreMigrate(base, { key: 'LN' })).inputHash;
    git(base, ['commit', '-q', '--allow-empty', '-m', 'Keep the rows (#42)'], at('2026-01-06'));
    const h1 = (await runWorkStoreMigrate(base, { key: 'LN' })).inputHash;
    expect(h1).not.toBe(h0);
  });

  it('a list edit is still named as a list change', async () => {
    const dry = await runWorkStoreMigrate(base, { key: 'LN' });
    writeFileSync(join(base, '.planning', 'BUGS.md'), `${['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|',
      '| B1 | fixed | P2 | Rows vanish — PR #42. |', ''].join('\n')}\n`);
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'edit'], at('2026-01-06'));
    const r = await runWorkStoreMigrate(base, { apply: true, key: 'LN', stamp: 'T1', expectedHash: dry.inputHash });
    expect(r.refused).toBe(true);
    expect(r.reason).toMatch(/STATE\.md or a list .* changed since the dry run/);
  });
});

describe('evidence comes from the default branch only (D-M6E15-25)', () => {
  let root;
  let base;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'propose-head-'));
    base = join(root, 'leaf-notes');
    mkdirSync(join(base, '.planning'), { recursive: true });
    git(base, ['init', '-q', '-b', 'main']);
    git(base, ['config', 'user.email', 't@t.co']);
    git(base, ['config', 'user.name', 'T']);
    git(base, ['config', 'commit.gpgsign', 'false']);
    writeFileSync(join(base, '.planning', 'STATE.md'), STATE);
    git(base, ['add', '-A']);
    git(base, ['commit', '-q', '-m', 'Start (#1)'], at('2026-01-05'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('a commit on an unmerged side branch is not evidence; the checked-out branch’s is', async () => {
    git(base, ['checkout', '-q', '-b', 'side']);
    git(base, ['commit', '-q', '--allow-empty', '-m', 'Unmerged work (#9)'], at('2026-01-06'));
    const sideHash = git(base, ['rev-parse', 'HEAD']).trim();
    git(base, ['checkout', '-q', 'main']);
    const { buildEvidenceIndex } = await import('../plugin/tools/lib/work-migrate-lists.js');
    const idx = buildEvidenceIndex(base);
    expect(idx.prs.has(1)).toBe(true);
    expect(idx.prs.has(9)).toBe(false);
    expect(idx.commits).not.toContain(sideHash);
  });
});

describe('I-1 — evidence is the entry’s own text; a child question’s own heading is read (REVIEW pass 3)', () => {
  const question = (group, heading, body) => ['# Open Questions', '', `## ${group}`, '', `### ${heading}`, '', body, ''].join('\n');
  const only = (text) => {
    const p = plan({ 'OPEN-QUESTIONS.md': text });
    expect(p.errors).toEqual([]);
    return { r: p.records.filter((x) => x.flagged !== 'non-item')[0], p };
  };

  it('a reference in the grouping heading is not evidence for a child that cites none → open, no-evidence', () => {
    const { r, p } = only(question('Resolved in PR #157', 'Q7 — Which currency?', 'We went with the euro.'));
    expect(status(r)).toBe('T');
    expect(r.flagged).toBe('no-evidence');
    expect(p.proposedCloses).toEqual([]);
  });

  it('the child’s own reference still counts', () => {
    const { r, p } = only(question('Resolved in v2', 'Q7 — Which currency?', 'Settled in PR #157.'));
    expect(r.flagged).toBe('looks-finished');
    expect(p.proposedCloses.map((c) => c.legacyId)).toEqual(['Q7']);
  });

  it('the pass-3 repro: "### R2 — Reopened: still blocking" under a Resolved heading → open, unclear', () => {
    const { r, p } = only(question('Resolved in v2', 'R2 — Reopened: still blocking', 'Settled in PR #157.'));
    expect(status(r)).toBe('T');
    expect(r.flagged).toBe('unclear');
    expect(r.record.migration_note).toContain('Reopened: still blocking');
    expect(p.proposedCloses).toEqual([]);
  });

  for (const h of ['Q8 — Re-opened after the v3 report', 'Q9 — Regressed in v3', 'Q10 — Not resolved yet', 'Q11 — Rolled-back export', 'Q12 — Still pending']) {
    it(`"### ${h}" under a Resolved heading → unclear`, () => {
      expect(only(question('Resolved in v2', h, 'Settled in PR #157.')).r.flagged).toBe('unclear');
    });
  }
});

describe('I-2 — what counts as a pull request (REVIEW pass 3)', () => {
  const ORIGIN = { host: 'example.com', repo: 'acme/ledger' };
  const ev = { ...EVIDENCE, prs: new Map([[99, HASH], [157, HASH], [12, HASH]]), origin: ORIGIN };
  const flagOf = (file, text, evidence = ev) => {
    const p = plan({ [file]: text }, { evidence });
    expect(p.errors).toEqual([]);
    return p.records.filter((x) => x.flagged !== 'non-item')[0].flagged;
  };
  const backlog = (body) => ['# Backlog', '', '### #12 — Export to CSV · **roadmap** · small · **DONE**', body, '',
    '### #13 — Export to PDF · **roadmap**', 'Body.', ''].join('\n');
  const bug = (summary) => ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|', `| B1 | fixed | P2 | ${summary} |`, ''].join('\n');

  it('in a list whose IDs are #N, a bare #N is a cross-reference, not a PR', () => {
    expect(flagOf('BACKLOG.md', backlog('Split from #99.'))).toBe('no-evidence');
  });
  for (const body of ['Landed in PR #99.', 'Landed as pull request #99.', 'See [the change](https://example.com/acme/ledger/pull/99).']) {
    it(`in a #N list, "${body}" counts`, () => {
      expect(flagOf('BACKLOG.md', backlog(body))).toBe('looks-finished');
    });
  }
  it('in a list whose IDs are not #N, a bare #N still counts', () => {
    expect(flagOf('BUGS.md', bug('Rows vanish — #157.'))).toBe('looks-finished');
  });
  it('a /pull/N link to another repository or host does not count', () => {
    expect(flagOf('BUGS.md', bug('Rows vanish — [fix](https://example.com/other/repo/pull/157).'))).toBe('no-evidence');
    expect(flagOf('BUGS.md', bug('Rows vanish — [fix](https://elsewhere.org/acme/ledger/pull/157).'))).toBe('no-evidence');
  });
  it('a /pull/N link to this repository’s origin counts (case and .git ignored)', () => {
    expect(flagOf('BUGS.md', bug('Rows vanish — [fix](https://Example.com/Acme/Ledger/pull/157).'))).toBe('looks-finished');
  });
  it('with no origin, no /pull/N link counts', () => {
    expect(flagOf('BUGS.md', bug('Rows vanish — [fix](https://example.com/acme/ledger/pull/157).'), { ...ev, origin: null })).toBe('no-evidence');
  });
  for (const summary of ['Rows vanish — issue: #157.', 'Rows vanish — Issues #12, #157.', 'Rows vanish — issues #12 and #157.']) {
    it(`"${summary}" names issues, never PRs`, () => {
      expect(flagOf('BUGS.md', bug(summary))).toBe('no-evidence');
    });
  }
});

describe('parseOrigin', () => {
  it('reads the common remote shapes', async () => {
    const { parseOrigin } = await import('../plugin/tools/lib/work-migrate-lists.js');
    const want = { host: 'example.com', repo: 'acme/ledger' };
    for (const u of ['git@example.com:acme/ledger.git', 'ssh://git@example.com:22/acme/ledger', 'https://example.com/acme/ledger.git',
      'https://user@example.com/Acme/Ledger', 'https://example.com/acme/ledger/']) {
      expect(parseOrigin(u), u).toEqual(want);
    }
    expect(parseOrigin('/some/local/path')).toBeNull();
    expect(parseOrigin('')).toBeNull();
  });
});

describe('I-3 — no readable history: no evidence at all, retrospectives included (REVIEW pass 3)', () => {
  let root;
  let base;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'propose-nogit-'));
    base = join(root, 'leaf-notes');
    mkdirSync(join(base, '.planning', 'archive'), { recursive: true });
    writeFileSync(join(base, '.planning', 'STATE.md'), STATE);
    // A retrospective the entry cites: if the walk still ran, B1 would be proposed.
    writeFileSync(join(base, '.planning', 'archive', 'M3.E1-RETROSPECTIVE.md'), '# Retro\n');
    writeFileSync(join(base, '.planning', 'BUGS.md'), ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|',
      '| B1 | fixed | P2 | Header lost — shipped with M3.E1. |', ''].join('\n'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const expectNothingProposed = (dry) => {
    expect(dry.refused).toBeUndefined();
    expect(dry.proposedCloses).toEqual([]);
    for (const it of dry.items) {
      expect(it.status, it.id).toBe('T');
      expect(it.flag, it.id).toBe('no-evidence');
    }
    expect(dry.report).toMatch(/could not read this repository's history, so nothing can be proposed for closing/);
    expect(dry.report).not.toMatch(/Proposed closes/);
  };

  it('not a git checkout', async () => {
    expectNothingProposed(await runWorkStoreMigrate(base, { key: 'LN' }));
  });

  it('a repository with no commits', async () => {
    git(base, ['init', '-q', '-b', 'main']);
    expectNothingProposed(await runWorkStoreMigrate(base, { key: 'LN' }));
  });

  it('git failing', async () => {
    const execFn = (cmd, args, o) => {
      if (cmd === 'git' && args[0] === 'log' && args[1] === 'HEAD') throw new Error('boom');
      return execFileSync(cmd, args, o);
    };
    expectNothingProposed(await runWorkStoreMigrate(base, { key: 'LN', execFn }));
  });

  it('the index is empty — no retrospective is read — and the entry’s note says the history could not be read', async () => {
    const { buildEvidenceIndex } = await import('../plugin/tools/lib/work-migrate-lists.js');
    const idx = buildEvidenceIndex(base);
    expect(idx.source).toBe('none');
    expect(idx.epics.size).toBe(0);
    const p = planListsToRecords({ 'BUGS.md': ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|',
      '| B1 | fixed | P2 | Header lost — shipped with M3.E1. |', ''].join('\n') }, { key: 'LN', dates: DATES, evidence: idx });
    expect(p.records[0].record.migration_note).toMatch(/could not read this repository's history/);
  });
});

describe('C1 (pass 3) — after the finish word only a date, `in <ref>`, a reference or a slice tag may follow', async () => {
  const { finishedLead } = await import('../plugin/tools/lib/work-migrate.js');
  // REVIEW pass 3's probe phrases (code-reviewer, security-auditor, test-engineer)
  // and the brief's own list.
  const UNCLEAR = [
    'Fixed — regressed in v3',
    'Done — needs QA',
    'Fixed in PR #12 — doesn\'t work on Windows',
    'Fixed (regressed in v3)',
    'Closed — cannot reproduce',
    'Closed — duplicate',
    'Resolved — open again since M9.E1',
    'Fixed in staging',
    'Fixed in prod only',
    'Fixed — re-opened',
    'Fixed — rolled-back',
    'Fixed — un-fixed by M9.E2',
    'Done — isn\'t shipped',
    'Fixed. Regressed in v3.',
    'Closed. Nothing to do.',
    'Fixed — rows are kept now.',
    'not-a-bug (closed 2026-03-02) — works as designed.',
    'Fixed — see [the change](https://example.com/acme/ledger/pull/12)',
    'Fixed — [the change](https://example.com/acme/ledger/pull/12)',
    'Fixed in M9.E2 — but only the CSV path',
  ];
  for (const t of UNCLEAR) {
    it(`"${t}" → unclear`, () => {
      const c = finishedLead(t);
      expect(c.unclear).toBe(true);
      expect(c.reasons.size).toBe(0);
    });
  }
  const PROPOSABLE = [
    ['DONE — M2.10.E2, 2026-10-08', 'fixed'],
    ['Done in M2.10.E2 (S5) — [PR #157](https://example.com/acme/ledger/pull/157).', 'fixed'],
    ['fixed in PR #12', 'fixed'],
    ['`fixed`', 'fixed'],
    ['Fixed.', 'fixed'],
    ['fixed 2026-02-04', 'fixed'],
    ['Closed — superseded', 'stale'],
    ['not-a-bug (closed 2026-03-02)', 'rejected'],
    ['Fixed — PR #12, e41d30e', 'fixed'],
    ['Resolved in v2 (S4)', 'fixed'],
  ];
  for (const [t, reason] of PROPOSABLE) {
    it(`"${t}" → ${reason}`, () => {
      const c = finishedLead(t);
      expect(c.unclear).toBe(false);
      expect([...c.reasons]).toEqual([reason]);
    });
  }
});

describe('I-5 — the routes REVIEW pass 3 found untested', () => {
  it('a reference needs a digit: "in staging", "— QA", "in vNext" are words, not references', async () => {
    const { finishedLead } = await import('../plugin/tools/lib/work-migrate.js');
    for (const t of ['Fixed in staging', 'Fixed — QA', 'Done in vNext', 'Fixed (S)', 'Resolved — PR']) {
      expect(finishedLead(t).unclear, t).toBe(true);
    }
    for (const t of ['Fixed in v2', 'Fixed — QA2', 'Fixed (S5)', 'Resolved — PR #3']) {
      expect(finishedLead(t).unclear, t).toBe(false);
    }
  });

  it('a `Merge pull request #N from owner/branch` subject resolves PR #N', async () => {
    const { buildEvidenceIndex } = await import('../plugin/tools/lib/work-migrate-lists.js');
    const root = mkdtempSync(join(tmpdir(), 'propose-merge-'));
    try {
      const base = join(root, 'leaf-notes');
      mkdirSync(join(base, '.planning'), { recursive: true });
      git(base, ['init', '-q', '-b', 'main']);
      git(base, ['config', 'user.email', 't@t.co']);
      git(base, ['config', 'user.name', 'T']);
      git(base, ['config', 'commit.gpgsign', 'false']);
      writeFileSync(join(base, '.planning', 'STATE.md'), STATE);
      git(base, ['add', '-A']);
      git(base, ['commit', '-q', '-m', 'Merge pull request #12 from acme/rows-fix'], at('2026-01-05'));
      const hash = git(base, ['rev-parse', 'HEAD']).trim();
      const idx = buildEvidenceIndex(base);
      expect(idx.prs.get(12)).toBe(hash);
      const p = plan({ 'BUGS.md': ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|', '| B1 | fixed | P2 | Rows vanish — PR #12. |', ''].join('\n') },
        { evidence: idx });
      expect(p.proposedCloses[0].evidence).toEqual([`PR #12 → ${hash.slice(0, 7)}`]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('REVIEW pass 3 suggestions', () => {
  const bug = (summary) => ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|', `| B1 | fixed | P2 | ${summary} |`, ''].join('\n');

  it('a retrospective path in the proof is printable, and the whole proof is capped at 400', () => {
    const path = `.planning/archive/${'deep/'.repeat(100)}\u202e\u0007M3.E1-RETROSPECTIVE.md`;
    const ev = { ...EVIDENCE, epics: new Map([['M3.E1', path]]) };
    const p = plan({ 'BUGS.md': bug('Header lost — shipped with M3.E1.') }, { evidence: ev, confirmCloses: true });
    const { proof } = closedEvent(p.records[0]);
    expect(proof.length).toBeLessThanOrEqual(400);
    // eslint-disable-next-line no-control-regex
    expect(proof).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/);
    for (const e of p.proposedCloses[0].evidence) {
      // eslint-disable-next-line no-control-regex
      expect(e).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e]/);
    }
  });

  it('a migration_note names at most a few missing references, then "… and N more"', () => {
    const refs = Array.from({ length: 500 }, (_, i) => `PR #${1000 + i}`).join(', ');
    const p = plan({ 'BUGS.md': bug(`Rows vanish — ${refs}.`) });
    const note = p.records[0].record.migration_note;
    expect(p.records[0].flagged).toBe('no-evidence');
    expect(note).toMatch(/and 49\d more/);
    expect(note.length).toBeLessThan(2000);
  });

  it('printable also drops LRM/RLM/ALM, line and paragraph separators, and zero-width characters', () => {
    const p = plan({ 'BUGS.md': bug('Rows\u200e vanish\u200f\u061c\u2028\u2029\u200b\u200c\u200d\ufeff\u2060 — PR #157.') });
    // A RegExp from a string: a line separator inside a regex literal breaks the parse.
    expect(p.records[0].record.title).not.toMatch(new RegExp('[\\u200b-\\u200f\\u061c\\u2028\\u2029\\ufeff\\u2060]'));
    expect(p.records[0].record.title).toMatch(/^Rows vanish/);
  });
});

describe('segmentQuestions is linear in the number of `###` entries (REVIEW pass 3 suggestion)', async () => {
  const { segmentQuestions } = await import('../plugin/tools/lib/work-migrate.js');
  const { performance } = await import('node:perf_hooks');
  const doc = (n) => ['# Open Questions', '', ...Array.from({ length: n }, (_, i) => (i % 50 === 0 ? `## Group ${i}\n\n### Q${i} — x?\n\nBody.\n` : `### Q${i} — x?\n\nBody.\n`)), ''].join('\n');
  const best = (text) => Math.min(...[0, 1, 2, 3, 4].map(() => {
    const t0 = performance.now();
    segmentQuestions(text);
    return performance.now() - t0;
  }));
  // Four times the entries: linear ~4×, quadratic ~16×; the line at 8× leaves
  // room for a busy machine.
  it('4000 → 16 000 entries costs well under 8× (quadratic would be ~16×), groups still right', () => {
    const small = doc(4000);
    const large = doc(16000);
    best(small);
    const ratio = best(large) / best(small);
    const rows = segmentQuestions(large).rows;
    expect(rows).toHaveLength(16000);
    expect(rows[51].groupHeading).toBe('Group 50');
    expect(rows[49].groupHeading).toBe('Group 0');
    expect(ratio).toBeLessThan(8);
  });
});
