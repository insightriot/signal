// M6.E15 REVIEW pass 1, fix batch A — the planner and the BUGS segmenter.
// See .planning/M6.E15-REVIEW.md (C1, I4, S1, S2, S3, the legacy_id
// hygiene suggestion). Fixtures are invented text; no project is named.
//
// The BUGS.md side: old IDs on `##` headings (S2), which tables are bug
// tables (S3), what an ID cell may carry (legacy_id hygiene), and linear time
// on a hostile file (I4).

import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

import { segmentBugs } from '../plugin/tools/lib/work-migrate.js';
import { planListsToRecords, runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';

const DATES = {
  'BUGS.md': { first: '2026-01-05', last: '2026-03-09' },
  'BACKLOG.md': { first: '2026-01-06', last: '2026-03-08' },
  'ISSUES-INBOX.md': { first: '2026-01-07', last: '2026-01-07' },
  'OPEN-QUESTIONS.md': { first: '2026-01-08', last: '2026-02-16' },
};
const plan = (texts, opts = {}) => planListsToRecords(texts, { key: 'LF', dates: DATES, ...opts });
const entries = (p) => p.records.filter((r) => r.flagged !== 'non-item');
const one = (file, text) => {
  const p = plan({ [file]: text });
  expect(p.errors).toEqual([]);
  const e = entries(p);
  expect(e).toHaveLength(1);
  return e[0];
};
const status = (r) => ({ created: 'N', triaged: 'T', closed: 'C' }[r.record.events.at(-1).type]);


describe('S2 — an old ID leading a BUGS `##` heading is kept (AC5.2)', () => {
  it('`## BUG-7 — crash on save` → legacy_id BUG-7, title without it, Old ID line first', () => {
    const r = one('BUGS.md', ['# Bugs', '', '## BUG-7 — crash on save', '', '**Status:** needs-triage', ''].join('\n'));
    expect(r.record.legacy_id).toBe('BUG-7');
    expect(r.record.title).toBe('crash on save');
    expect(r.body.split('\n')[0]).toBe('Old ID: BUG-7');
  });

  it('in BUGS.md a leading `B{n}` names the entry itself: `## B12 — crash` → legacy_id B12', () => {
    const r = one('BUGS.md', ['# Bugs', '', '## B12 — crash on load', '', '**Status:** needs-triage', ''].join('\n'));
    expect(r.record.legacy_id).toBe('B12');
    expect(r.record.title).toBe('crash on load');
  });
});

// The legend sits outside any `##` (a `##` heading in BUGS.md is an entry,
// and its text is that entry's body).
const legendBugs = [
  '# Bugs', '',
  'Legend:', '',
  '| Word | Meaning | Note |', '|---|---|---|',
  '| fixed | Done | — |',
  '| open | Not started | — |',
  '',
  '| ID | Status | Pri | What |', '|---|---|---|---|',
  '| B1 | `fixed` | P2 | **The exporter drops a row** — fixed. |',
  '| BUG-7 | `needs-triage` | P3 | **Wrong unit after a locale switch** |',
  '',
].join('\n');

describe('S3 — only the bug table’s rows are bugs; a legend table is non-item text (AC3.4, AC6.3)', () => {
  it('the legend’s rows are not table rows of the segmentation, and the file still tiles', () => {
    const seg = segmentBugs(legendBugs);
    const table = seg.rows.filter((r) => r.kind === 'table');
    expect(table.map((r) => r.id)).toEqual(['B1', 'BUG-7']);
    const pieces = [...seg.rows, ...seg.orphans, ...seg.gaps].sort((a, b) => a.line - b.line);
    expect(pieces.map((x) => x.text).join('\n')).toBe(legendBugs);
  });

  it('planned: no BUG item carries the legend; its rows land in the file’s one non-item record', () => {
    const p = plan({ 'BUGS.md': legendBugs });
    expect(p.errors).toEqual([]);
    const bugs = p.records.filter((r) => r.record.type === 'BUG');
    expect(bugs.map((r) => r.record.legacy_id ?? null)).toEqual(['B1', 'BUG-7']);
    expect(bugs.filter((r) => /\| fixed \| Done \|/.test(r.body))).toEqual([]);
    const nonItem = p.records.filter((r) => r.flagged === 'non-item');
    expect(nonItem).toHaveLength(1);
    expect(nonItem[0].body).toContain('| fixed | Done | — |');
    expect(nonItem[0].body).toContain('| open | Not started | — |');
  });
});

// C0 controls and DEL, built from code points so the source holds none.
const CONTROL_RE = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}]`);

describe('legacy_id hygiene — from the cell’s first line, a short single line, else flagged with none', () => {
  const ESC = '\u001b';
  const text = [
    '# Bugs', '',
    '| ID | Status | Pri | What |', '|---|---|---|---|',
    '| B1 | `fixed` | P2 | **The exporter drops a row** |',
    `| X${ESC}[31m9`,
    `still the cell ${ESC}[0m | open | P2 | **A row split over lines** ${ESC}]0;title${ESC}\\ |`,
    '',
  ].join('\n');

  it('the multi-line row is an item with no legacy_id, flagged', () => {
    const p = plan({ 'BUGS.md': text });
    expect(p.errors).toEqual([]);
    const rows = entries(p);
    expect(rows.map((r) => r.record.legacy_id ?? null)).toEqual(['B1', null]);
    expect(rows[1].flagged).toBe('id-unreadable');
    expect(status(rows[1])).toBe('T');
    for (const it of p.manifest.items) expect(it.legacy_id ?? '').not.toMatch(CONTROL_RE);
  });

  it('the dry-run report carries no control characters', async () => {
    const root = mkdtempSync(join(tmpdir(), 'signal-wml-r1-'));
    try {
      const base = join(root, 'leaf-notes');
      const write = (rel, t) => {
        mkdirSync(dirname(join(base, rel)), { recursive: true });
        writeFileSync(join(base, rel), t);
      };
      mkdirSync(base, { recursive: true });
      const git = (args, env = {}) => execFileSync('git', args, { cwd: base, stdio: 'ignore', env: { ...process.env, ...env } });
      git(['init', '-q', '-b', 'main']);
      git(['config', 'user.email', 't@t.co']);
      git(['config', 'user.name', 'T']);
      git(['config', 'commit.gpgsign', 'false']);
      write('.planning/STATE.md', '---\nschema_version: 1\ndocs_layout_version: 3\nphase: PLAN\ncurrent_epic: null\ncurrent_tasks: []\n'
        + 'completed_phases: []\nblockers: []\n---\n# Project State\n\nbody\n');
      write('.planning/BUGS.md', text);
      git(['add', '-A']);
      git(['commit', '-q', '-m', 'c'], { GIT_AUTHOR_DATE: '2026-02-20T12:00:00Z', GIT_COMMITTER_DATE: '2026-02-20T12:00:00Z' });
      const r = await runWorkStoreMigrate(base, { key: 'LF' });
      expect(r.refused).toBeUndefined();
      expect(r.report.replace(/\n/g, '')).not.toMatch(CONTROL_RE);
      expect(r.report).toContain('[flagged: id-unreadable]');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('I4 — a hostile BUGS.md segments in linear time', () => {
  it('8000 unclosed `| X1 | open | P1` rows segment in under 2 s, one row each', () => {
    const text = ['# Bugs', '', '| ID | Status | Pri | What |', '|---|---|---|---|', ...Array.from({ length: 8000 }, () => '| X1 | open | P1'), ''].join('\n');
    const t0 = performance.now();
    const seg = segmentBugs(text);
    const ms = performance.now() - t0;
    expect(seg.rows.filter((r) => r.kind === 'table')).toHaveLength(8000);
    expect(ms).toBeLessThan(2000);
  }, 600_000);
});
