// The migration plan over Signal's own pre-store lists (M6.E11.S2 t2.4).
// See .planning/M6.E11-PLAN.md § S2 and .planning/M6.E11-VALIDATION.md rows AC-9.4, AC-9.5.
//
//   archived originals → planMigration (dry run) → every source byte in
//   exactly one row or one named region; counts reconcile
//
// M6.E13 t7.4: the round trip's second half — the plan written out as v1
// item files in a temp store, the v1 `generateAll` over them, and each
// shipped reader over the generated file (AC-7.2) — was retired with the v1
// store and its generator. The v2 views are checked against their readers by
// the work-views tests.
//
// ⚠ READ-ONLY ON `.planning/`: the test asserts `git status --porcelain
// .planning/` is unchanged afterwards.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planMigration, segmentBugs, segmentBacklog, segmentInbox, segmentQuestions, SOURCES } from '../plugin/tools/lib/work-migrate.js';
import { rewriteRelativeLinks } from '../plugin/tools/lib/work-links.js';
import { archived, preStoreBase, removePreStoreBase } from './helpers/pre-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TODAY = '2026-09-29';

// M6.E11 t7.2: the four live files are generated now. The round trip starts from
// the hand-written originals, which the migration archived verbatim.
const live = (f) => archived(f);

function planningSnapshot() {
  return execFileSync('git', ['status', '--porcelain', '.planning/'], { cwd: ROOT, encoding: 'utf-8' });
}

let before;
let base;
let plan;

beforeAll(() => {
  before = planningSnapshot();
  base = preStoreBase();
  plan = planMigration(base, { key: 'SIG', today: TODAY });
}, 60_000);

afterAll(() => {
  removePreStoreBase(base);
  expect(planningSnapshot()).toEqual(before);
});

describe('AC-9.4 — lossless: every source byte is in exactly one row or one named region', () => {
  it('each item body, links rewritten back, is its source row verbatim', () => {
    for (const { item, body, dir, sourceRef } of plan.items) {
      const lines = live(sourceRef.file).split('\n');
      expect(sourceRef.text, item.id).toBe(lines.slice(sourceRef.line - 1, sourceRef.endLine).join('\n'));
      expect(rewriteRelativeLinks(body, dir, ''), item.id).toBe(sourceRef.text);
    }
    expect(rewriteRelativeLinks(plan.watchlist.text, plan.watchlist.dir, '')).toBe(plan.watchlist.sourceRef.text);
  });

  it.each(SOURCES)('%s: rows (from item bodies) + named orphans + separator gaps rebuild the file exactly', (file) => {
    const text = live(file);
    const regions = [
      ...plan.items
        .filter((i) => i.sourceRef.file === file)
        .map((i) => ({ line: i.sourceRef.line, endLine: i.sourceRef.endLine, text: rewriteRelativeLinks(i.body, i.dir, '') })),
      ...plan.orphans.filter((o) => o.source === file),
      ...plan.gaps.filter((g) => g.source === file),
      ...(file === 'ISSUES-INBOX.md'
        ? [{ ...plan.watchlist.sourceRef, text: rewriteRelativeLinks(plan.watchlist.text, plan.watchlist.dir, '') }]
        : []),
    ].sort((a, b) => a.line - b.line);
    let next = 1;
    for (const r of regions) {
      expect(r.line, `${file}: region at ${r.line}`).toBe(next);
      next = r.endLine + 1;
    }
    expect(next - 1).toBe(text.split('\n').length);
    expect(regions.map((r) => r.text).join('\n')).toBe(text);
    for (const g of plan.gaps.filter((x) => x.source === file)) {
      for (const l of g.text.split('\n')) expect(['', '---']).toContain(l.trim());
    }
  });

  it('names every orphan region', () => {
    expect(plan.orphans.map((o) => `${o.source} ${o.name.replace(/(section intro: ).*/, '$1…').replace(/(: \S+ \S+).*/, '$1')}`)).toEqual([
      'BUGS.md preamble',
      'BUGS.md between rows: M5.E4 close-out',
      'BUGS.md footer (tally)',
      'BACKLOG.md preamble',
      ...Array(11).fill('BACKLOG.md section intro: …'),
      'BACKLOG.md stale footer',
      'BACKLOG.md footer',
      'ISSUES-INBOX.md preamble',
      'OPEN-QUESTIONS.md preamble',
      'OPEN-QUESTIONS.md note: (The M4.5.E5',
    ]);
  });
});

describe('AC-9.5 — counts reconcile, from this run', () => {
  it('items created = the sum of the per-source counts, which equal the segmenters', () => {
    const segCounts = {
      'BUGS.md': segmentBugs(live('BUGS.md')).rows.length,
      'BACKLOG.md': segmentBacklog(live('BACKLOG.md')).rows.length,
      'ISSUES-INBOX.md': segmentInbox(live('ISSUES-INBOX.md')).rows.length,
      'OPEN-QUESTIONS.md': segmentQuestions(live('OPEN-QUESTIONS.md')).rows.length,
    };
    expect(plan.counts.bySource).toEqual(segCounts);
    const sum = Object.values(segCounts).reduce((a, b) => a + b, 0);
    expect(plan.items).toHaveLength(sum);
    expect(plan.counts.total).toBe(sum);
    expect(Object.values(plan.counts.byStatus).reduce((a, b) => a + b, 0)).toBe(sum);
  });
});
