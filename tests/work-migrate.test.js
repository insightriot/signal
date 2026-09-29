// Tests for the migration segmenters and mapping (M6.E11.S2 t2.1, t2.2).
// See .planning/M6.E11-PLAN.md § S2 and .planning/M6.E11-VALIDATION.md rows AC-9.1, AC-9.2, AC-9.5.
//
// ⚠ READ-ONLY ON THE LIVE FILES. Every test that reads `.planning/` asserts
// afterwards that `git status --porcelain .planning/` and the four files'
// mtimes are unchanged. S2 is a dry run by design (PLAN "What this Epic does
// for the first time"): if the segmenter breaks, it breaks here, not against
// 248 records.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  segmentBugs,
  segmentBacklog,
  segmentInbox,
  segmentQuestions,
} from '../plugin/tools/lib/work-migrate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const FIX = join(__dirname, 'fixtures', 'work-migrate');
const LIVE = ['BUGS.md', 'BACKLOG.md', 'ISSUES-INBOX.md', 'OPEN-QUESTIONS.md'];

const fixture = (name) => readFileSync(join(FIX, name), 'utf-8');

// Every line of a source belongs to exactly one region, and joining the
// regions in order gives the file back byte-for-byte.
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

describe('segmentBugs — hazard fixture cut from the live file', () => {
  const text = fixture('BUGS.md');
  const seg = segmentBugs(text);
  const byId = (id) => seg.rows.find((r) => r.id === id);

  it('finds every table row in file order, not id order', () => {
    const ids = seg.rows.filter((r) => r.kind === 'table').map((r) => r.id);
    expect(ids).toEqual(['B1', 'B51', 'B52', 'B53', 'B63', 'B72', 'B71', 'B87', 'B88', 'B99', 'B97', 'B98', 'B96']);
  });

  it('B52 continues past a blank line to the line that closes the row', () => {
    const b52 = byId('B52');
    expect(b52.endLine - b52.line).toBe(2);
    expect(b52.text.split('\n')[2]).toMatch(/^ {2}\*\*⚠ Related hazard/);
    expect(b52.text.trimEnd().endsWith('|')).toBe(true);
    expect(b52.summary).toContain('Related hazard');
  });

  it('B99 continues over numbered paragraphs to its closing pipe', () => {
    const b99 = byId('B99');
    expect(b99.endLine - b99.line).toBe(14);
    expect(b99.summary).toMatch(/Bottom line/);
  });

  it('a `|` inside a code span never truncates the summary (B63, B72, B88, B96)', () => {
    for (const id of ['B63', 'B72', 'B88', 'B96']) {
      const row = byId(id);
      // The summary is everything after the FOURTH pipe (id, status, pri
      // cells) up to the row's LAST pipe — computed here by position, not by
      // split, so the expectation cannot share the defect.
      let at = -1;
      for (let k = 0; k < 4; k++) at = row.text.indexOf('|', at + 1);
      const expected = row.text.slice(at + 1, row.text.lastIndexOf('|')).trim();
      expect(row.summary).toBe(expected);
      expect(row.text.split('|').length).toBeGreaterThan(6); // really does carry extra pipes
    }
    expect(byId('B96').summary).toContain('(?:^|\\n)');
    expect(byId('B88').summary).toContain("git branch --show-current|rev-parse");
  });

  it('reads status and priority cells, bold stripped by the mapping not here', () => {
    expect(byId('B52').statusRaw).toBe('`fixed` (v0.1.20)');
    expect(byId('B52').priority).toBe('**P1**');
    expect(byId('B1').priority).toBe('—');
  });

  it('un-numbered `##` entries become rows with their status line and stop at `---`', () => {
    const entries = seg.rows.filter((r) => r.kind === 'entry');
    expect(entries.map((e) => e.statusRaw)).toEqual([
      'resolved-not-a-defect',
      'needs-triage',
      'withdrawn (duplicate)',
      'needs-triage',
    ]);
    for (const e of entries) {
      expect(e.text.startsWith('## ')).toBe(true);
      expect(e.text.split('\n').at(-1).trim()).not.toBe('---');
    }
  });

  it('text between rows is a NAMED orphan, not absorbed into a row', () => {
    const names = seg.orphans.map((o) => o.name);
    expect(names[0]).toBe('preamble');
    expect(names.some((n) => /M5\.E4 close-out/.test(n))).toBe(true);
    expect(names.at(-1)).toBe('footer (tally)');
  });

  it('partitions the file exactly', () => {
    assertPartition(text, seg);
  });

  it('refuses a row that never closes rather than swallowing the next row', () => {
    const broken = '| B1 | `fixed` | P3 | starts here\nno closing pipe\n| B2 | `fixed` | P3 | next |\n';
    expect(() => segmentBugs(broken)).toThrow(/B1.*never closes/);
  });
});

describe('segmentBacklog — hazard fixture', () => {
  const text = fixture('BACKLOG.md');
  const seg = segmentBacklog(text);

  it('uses parseBacklogRows at depth 4 and carries its discharge verdict', () => {
    const b52 = seg.rows.find((r) => /B52/.test(r.heading));
    expect(b52.discharged).toBe(true);
    expect(seg.rows.some((r) => r.heading.startsWith('Jev key and receipt') && !r.discharged)).toBe(true);
    // `####` rows are rows at depth 4.
    expect(seg.rows.some((r) => r.depth === 4)).toBe(true);
  });

  it('folds each <details> block into the row above; its headings are not rows', () => {
    const b52 = seg.rows.find((r) => /B52/.test(r.heading));
    expect(b52.text).toContain('<details>');
    expect(b52.text).toContain('### `B52` — the session binds to a stale plugin cache · **fix lane**');
    expect(b52.text).toContain('</details>');
    expect(seg.rows.filter((r) => /Signal is branch-blind/.test(r.heading))).toHaveLength(1);
  });

  it('struck siblings are two rows (the parser sees two)', () => {
    const twins = seg.rows.filter((r) => r.heading.includes('Cross-references become links'));
    expect(twins.map((t) => t.discharged)).toEqual([true, false]);
  });

  it('section intros, the preamble and the footer are named orphans', () => {
    const names = seg.orphans.map((o) => o.name);
    expect(names[0]).toBe('preamble');
    expect(names).toContain('section intro: Next work — the agreed sequence *(Brett, 2026-08-06, after v0.1.19 shipped)*');
    expect(names.at(-1)).toBe('footer');
    expect(seg.orphans.at(-1).text).toMatch(/\*Last updated: 2026-09-27\*/);
  });

  it('partitions the file exactly', () => {
    assertPartition(text, seg);
  });
});

describe('segmentInbox — fixture', () => {
  const text = fixture('ISSUES-INBOX.md');
  const seg = segmentInbox(text);

  it('returns the captures as rows and the standing watchlist separately', () => {
    expect(seg.rows).toHaveLength(5);
    expect(seg.rows.every((r) => /Deferred/.test(r.statusLine ?? '') || /Logged/.test(r.statusLine ?? ''))).toBe(true);
    expect(seg.watchlist.text).toMatch(/^## Trigger watchlist/);
    expect(seg.watchlist.text).toContain('<!-- standing -->');
    expect(seg.orphans.map((o) => o.name)).toEqual(['preamble']);
  });

  it('partitions the file exactly', () => {
    assertPartition(text, seg);
  });
});

describe('segmentQuestions — fixture', () => {
  const text = fixture('OPEN-QUESTIONS.md');
  const seg = segmentQuestions(text);

  it('finds 11 entries, 2 answered (struck + ANSWERED)', () => {
    expect(seg.rows).toHaveLength(11);
    expect(seg.rows.filter((r) => r.answered).map((r) => r.line)).toEqual([9, 143]);
  });

  it('the italic note after a `---` belongs to no entry', () => {
    expect(seg.orphans.map((o) => o.name)).toEqual(['preamble', expect.stringMatching(/^note: \(The M4\.5\.E5 re-entry/)]);
  });

  it('partitions the file exactly', () => {
    assertPartition(text, seg);
  });
});

// ── The live files, read-only ────────────────────────────────────────────────

function planningSnapshot() {
  const status = execFileSync('git', ['status', '--porcelain', '.planning/'], { cwd: ROOT, encoding: 'utf-8' });
  const mtimes = LIVE.map((f) => statSync(join(ROOT, '.planning', f)).mtimeMs);
  return { status, mtimes };
}

describe('segmenters over the live files (read-only)', () => {
  let before;
  beforeAll(() => {
    before = planningSnapshot();
  });
  afterAll(() => {
    expect(planningSnapshot()).toEqual(before);
  });

  const live = (f) => readFileSync(join(ROOT, '.planning', f), 'utf-8');

  it('BUGS.md: 127 table rows + 13 un-numbered entries = 140, and the named orphans', () => {
    const text = live('BUGS.md');
    const seg = segmentBugs(text);
    expect(seg.rows.filter((r) => r.kind === 'table')).toHaveLength(127);
    expect(seg.rows.filter((r) => r.kind === 'entry')).toHaveLength(13);
    expect(seg.orphans.map((o) => o.name)).toEqual([
      'preamble',
      expect.stringMatching(/^between rows: M5\.E4 close-out/),
      'footer (tally)',
    ]);
    assertPartition(text, seg);
  });

  it('BACKLOG.md: 92 rows (94 headings at depth 4, minus 2 inside <details>)', () => {
    const text = live('BACKLOG.md');
    const seg = segmentBacklog(text);
    expect(seg.rows).toHaveLength(92);
    const names = seg.orphans.map((o) => o.name);
    expect(names[0]).toBe('preamble');
    expect(names.at(-1)).toBe('footer');
    // Between them: one intro per container heading, and one old footer that
    // rows were later appended below (it belongs to neither neighbour).
    expect(names.filter((n) => n.startsWith('section intro: '))).toHaveLength(11);
    expect(names.slice(1, -1).filter((n) => !n.startsWith('section intro: '))).toEqual(['stale footer']);
    assertPartition(text, seg);
  });

  it('ISSUES-INBOX.md: 5 captures + the standing watchlist', () => {
    const text = live('ISSUES-INBOX.md');
    const seg = segmentInbox(text);
    expect(seg.rows).toHaveLength(5);
    expect(seg.watchlist).not.toBeNull();
    expect(seg.orphans.map((o) => o.name)).toEqual(['preamble']);
    assertPartition(text, seg);
  });

  it('OPEN-QUESTIONS.md: 11 entries, 2 answered', () => {
    const text = live('OPEN-QUESTIONS.md');
    const seg = segmentQuestions(text);
    expect(seg.rows).toHaveLength(11);
    expect(seg.rows.filter((r) => r.answered)).toHaveLength(2);
    expect(seg.orphans.map((o) => o.name)).toEqual(['preamble', expect.stringMatching(/^note: /)]);
    assertPartition(text, seg);
  });
});
