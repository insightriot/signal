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
