// The segmenters on corpus project 1's list shapes (M6.E15 S2, AC3.1, AC3.4, AC7.1).
// See .planning/M6.E15-PLAN.md § S2 and .planning/M6.E15-VALIDATION.md.
//
// The fixtures under `fixtures/work-migrate-corpus1/` reproduce every shape in
// M6.E15-RESEARCH.md §1 with invented text — an invented product, invented
// code names, invented unit IDs (`M9.*`), invented links under example.com.
// The corpus project is never named (`references/eval-corpus.md`).
//
// What these tests pin is the CUTTING only: which text is an item, which is a
// named non-item region, and what each row carries for the planner (S3) to
// read. Statuses and closes are S3's.
//
// RED (t2.1): `it.fails` marks an expectation the segmenters do not meet yet,
// so the suite stays green and the failure is recorded mechanically; each task
// that makes one true flips it to `it`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  segmentBugs,
  segmentBacklog,
  segmentInbox,
  segmentQuestions,
} from '../plugin/tools/lib/work-migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures', 'work-migrate-corpus1');
const fixture = (name) => readFileSync(join(FIX, name), 'utf-8');

// Every line of a source belongs to exactly one region, and joining the
// regions in order gives the file back byte-for-byte. (Same check as
// work-migrate.test.js, which is not edited by this slice.)
function assertPartition(text, seg) {
  const regions = [
    ...seg.rows.map((r) => ({ ...r, kind: 'row' })),
    ...seg.orphans.map((r) => ({ ...r, kind: 'orphan' })),
    ...seg.gaps.map((r) => ({ ...r, kind: 'gap' })),
    ...(seg.watchlist ? [{ ...seg.watchlist, kind: 'watchlist' }] : []),
  ].sort((a, b) => a.line - b.line);
  const total = text.split('\n').length;
  let next = 1;
  for (const r of regions) {
    expect(r.line, `region at ${r.line} starts where the previous ended`).toBe(next);
    expect(r.endLine).toBeGreaterThanOrEqual(r.line);
    next = r.endLine + 1;
  }
  expect(next - 1).toBe(total);
  expect(regions.map((r) => r.text).join('\n')).toBe(text);
  for (const g of seg.gaps) {
    for (const l of g.text.split('\n')) expect(['', '---']).toContain(l.trim());
  }
}

describe('BUGS.md — table rows of any ID, and `##` entries with or without a status line', () => {
  const text = fixture('BUGS.md');

  it('does not throw (AC3.4)', () => {
    expect(() => segmentBugs(text)).not.toThrow();
  });

  it('every table row is an item: a B-number, a non-B ID, and no ID (AC7.1)', () => {
    const rows = segmentBugs(text).rows.filter((r) => r.kind === 'table');
    expect(rows.map((r) => [r.line, r.id, r.n])).toEqual([
      [5, 'B1', 1],
      [6, 'BUG-7', null],
      [7, null, null],
    ]);
    expect(rows.map((r) => r.statusRaw)).toEqual(['`fixed`', '`needs-triage`', '`confirmed`']);
    expect(rows[0].summary).toContain('(was tracker #41)');
    expect(rows[2].summary).toMatch(/^\*\*Shopping list export/);
  });

  it('every `##` is an entry, status text carried as written, null where there is none', () => {
    const entries = segmentBugs(text).rows.filter((r) => r.kind === 'entry');
    expect(entries.map((r) => [r.line, r.endLine])).toEqual([
      [9, 13],
      [17, 21],
      [25, 29],
      [33, 37],
      [41, 43],
    ]);
    expect(entries.map((r) => r.statusRaw)).toEqual([
      expect.stringMatching(/^not-a-bug \(closed 2026-03-02/),
      expect.stringMatching(/^fixed in M9\.E2 \(S4\)/),
      'needs-triage',
      'scoped into M9.E3 (FR-02), 2026-03-09',
      null,
    ]);
    expect(entries[4].heading).toBe('Older clients overwrite a row written by a newer deploy');
  });

  it('the header and separator are the only non-item text (named preamble)', () => {
    const seg = segmentBugs(text);
    expect(seg.orphans.map((o) => [o.name, o.line, o.endLine])).toEqual([['preamble', 1, 4]]);
  });

  it('rows + orphans + gaps tile the file byte for byte', () => {
    assertPartition(text, segmentBugs(text));
  });
});

describe('BACKLOG.md — old IDs and cleaned titles', () => {
  const text = fixture('BACKLOG.md');
  const seg = segmentBacklog(text);

  it('finds every row, struck or not, tagged or not', () => {
    expect(seg.rows.map((r) => r.line)).toEqual([7, 11, 17, 22, 27, 34, 38, 42, 45]);
  });

  it.fails('a leading `#N` is the old ID; no ID, and a unit ID leading a title, give none', () => {
    expect(seg.rows.map((r) => r.legacyId)).toEqual(['#99', '#96', '#89', '#73', '#82', '#58', null, null, null]);
    // `leadingId` (read by the existing planner and the backlog checks) is unchanged.
    expect(seg.rows[8].leadingId).toBe('M9.E2');
  });

  it.fails('the title drops strike-through, the tag/size tail and the DONE tail; the raw heading stays', () => {
    expect(seg.rows.map((r) => r.title)).toEqual([
      '#99 — Strategic: Lanternfly as a shared kitchen platform — household API + per-plan history',
      '#96 — Future: implement leftovers tracking (documented, not in code)',
      "#89 — New Plan dialog: offer 'Import file' as a third start",
      '#73 — First screen after sign-in is a plain grey wait',
      "#82 — No narrow-screen layout and no 'desktop only' notice",
      '#58 — Fix 4 effect-ordering lint warnings in the planner',
      'Planner does not enforce the length cap on notes',
      'Pantry toggle jumps between the top and bottom of the rail',
      'M9.E2 REVIEW follow-ups',
    ]);
    const struck = seg.rows[2];
    expect(struck.heading).toBe(
      "~~#89 — New Plan dialog: offer 'Import file' as a third start · **roadmap** · small~~ · **DONE — M9.E2, 2026-03-08**"
    );
    expect(struck.text.split('\n')[0]).toBe(`### ${struck.heading}`);
  });

  it('section intros and the footer are named regions, not items', () => {
    expect(seg.orphans.map((o) => o.name)).toEqual([
      'preamble',
      'section intro: Product direction',
      'section intro: Planner polish (v4.2 remainder)',
      'section intro: Code health & ops',
      'footer',
    ]);
  });

  it('rows + orphans + gaps tile the file byte for byte', () => {
    assertPartition(text, seg);
  });
});

describe('ISSUES-INBOX.md — a title and a preamble only', () => {
  const text = fixture('ISSUES-INBOX.md');

  it('no items; the text is the named preamble', () => {
    const seg = segmentInbox(text);
    expect(seg.rows).toEqual([]);
    expect(seg.orphans.map((o) => o.name)).toEqual(['preamble']);
    assertPartition(text, seg);
  });
});

describe('OPEN-QUESTIONS.md — `##` groupings over `###` items', () => {
  const text = fixture('OPEN-QUESTIONS.md');

  it('the `###` entries are the items, with their old IDs (AC3.1)', () => {
    const seg = segmentQuestions(text);
    expect(seg.rows.map((r) => [r.line, r.endLine, r.legacyId])).toEqual([
      [17, 19, 'R3'],
      [21, 23, 'Issue #45'],
      [25, 27, 'NFR-04'],
    ]);
    expect(seg.rows[0].heading).toBe('R3 — Missing delete policy on `pantry_events`');
  });

  it("each item records its grouping heading and that heading's finished word", () => {
    const seg = segmentQuestions(text);
    for (const r of seg.rows) {
      expect(r.groupHeading).toBe('Resolved during v4.1 (kept for reference)');
      expect(r.groupWord).toBe('resolved');
    }
  });

  it('every `##` is a named non-item region, its text kept', () => {
    const seg = segmentQuestions(text);
    expect(seg.orphans.map((o) => [o.name, o.line, o.endLine])).toEqual([
      ['preamble', 1, 3],
      ['section: Currently blocking', 7, 11],
      ['section: Resolved during v4.1 (kept for reference)', 15, 15],
      ['section: Last Updated', 31, 32],
    ]);
  });

  it('rows + orphans + gaps tile the file byte for byte', () => {
    assertPartition(text, segmentQuestions(text));
  });
});
