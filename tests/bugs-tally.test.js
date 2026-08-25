/**
 * tests/bugs-tally.test.js — the tally must be derived, not asserted (`B77`).
 *
 * The guard that matters is the last describe block: it runs against the REAL
 * `.planning/BUGS.md` and fails when the published tally disagrees with the
 * file's contents. Everything above it is the unit coverage that makes that
 * guard trustworthy.
 *
 * PROOF-OF-FAIL is explicit here rather than claimed. `historical fixtures`
 * reproduces the two real wrong tallies this repo published — 2026-08-08's
 * `28 confirmed · 60 fixed` against `26 · 62`, and 2026-08-03's `0
 * needs-triage` against a file holding four captures — and asserts the
 * comparison catches both. A guard that has never been shown to go red is
 * `B39`'s shape, and this file exists because of `B39`'s shape.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  deriveBugCounts,
  readPublishedTally,
  compareBugTally,
  parseStatusCell,
  formatTallySegment,
} from '../plugin/tools/lib/bugs-tally.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUGS_PATH = join(__dirname, '..', '.planning', 'BUGS.md');

describe('parseStatusCell — normalise before counting', () => {
  it('reads a plain backticked status', () => {
    expect(parseStatusCell(' `confirmed` ')).toBe('confirmed');
  });

  it('reads a status carrying a parenthetical — the B49 case', () => {
    // An exact-cell grep read 47 fixed where the truth was 48, because one row
    // reads `fixed` (v0.1.13). The footer named this fix in its own words:
    // normalise the cell, do not add a second pattern.
    expect(parseStatusCell(' `fixed` (v0.1.13) ')).toBe('fixed');
  });

  it('reads a bolded status', () => {
    expect(parseStatusCell(' **fixed** ')).toBe('fixed');
  });

  it('returns null for an unknown cell rather than guessing', () => {
    expect(parseStatusCell(' `resolved` ')).toBeNull();
    expect(parseStatusCell('')).toBeNull();
    expect(parseStatusCell(undefined)).toBeNull();
  });
});

describe('deriveBugCounts — both formats, or it is not a count', () => {
  it('counts table rows by status', () => {
    const md = [
      '| B1 | `confirmed` | P2 | text |',
      '| B2 | `fixed` | P3 | text |',
      '| B3 | `fixed` (v0.1.13) | P3 | text |',
      '| B4 | `dismissed` | P3 | text |',
    ].join('\n');
    const d = deriveBugCounts(md);
    expect(d.confirmed).toBe(1);
    expect(d.fixed).toBe(2);
    expect(d.dismissed).toBe(1);
    expect(d.tableRows).toBe(4);
  });

  it('counts heading-captures — the format the 2026-08-03 tally could not see', () => {
    const md = [
      '| B1 | `confirmed` | P2 | text |',
      '',
      '## Some captured bug',
      '',
      '**Status:** needs-triage',
      '',
      'body',
    ].join('\n');
    const d = deriveBugCounts(md);
    expect(d.capturedUntriaged).toBe(1);
    expect(d.tableRows).toBe(1);
    expect(d.total).toBe(2);
  });

  it('ignores rows and status lines inside a code fence', () => {
    const md = [
      '| B1 | `confirmed` | P2 | real |',
      '```',
      '| B99 | `fixed` | P1 | a sample in a docblock |',
      '**Status:** needs-triage',
      '```',
    ].join('\n');
    const d = deriveBugCounts(md);
    expect(d.tableRows).toBe(1);
    expect(d.fixed).toBe(0);
    expect(d.capturedUntriaged).toBe(0);
  });

  it('reports an unreadable status cell instead of dropping the row', () => {
    const md = '| B7 | `mystery` | P2 | text |';
    const d = deriveBugCounts(md);
    expect(d.tableRows).toBe(1);
    expect(d.unreadable).toEqual([{ id: 'B7', cell: '`mystery`' }]);
  });
});

describe('readPublishedTally', () => {
  it('parses every cell, bold or plain', () => {
    const md = [
      '| B1 | `confirmed` | P2 | text |',
      '',
      '*0 needs-triage · **2 captured-untriaged** · 26 confirmed · 2 dismissed · 63 fixed (**93 total**). Last updated: 2026-08-09 — narrative.*',
    ].join('\n');
    const t = readPublishedTally(md);
    expect(t).toMatchObject({
      needsTriage: 0,
      capturedUntriaged: 2,
      confirmed: 26,
      dismissed: 2,
      fixed: 63,
      total: 93,
    });
  });

  it('returns null when there is no tally at all', () => {
    expect(readPublishedTally('| B1 | `confirmed` | P2 | t |')).toBeNull();
  });
});

describe('compareBugTally — historical fixtures (proof-of-fail)', () => {
  it('catches 2026-08-08: two cells wrong, total right because they offset', () => {
    // The real failure. B87 and B90 flipped confirmed -> fixed; the tally's own
    // narrative announced both flips and the cells were not re-derived. The
    // total stayed correct, which is precisely why checking one cell is not a
    // re-derivation.
    const rows = [
      ...Array.from({ length: 26 }, (_, i) => `| B${i + 1} | \`confirmed\` | P2 | t |`),
      ...Array.from({ length: 62 }, (_, i) => `| B${i + 100} | \`fixed\` | P3 | t |`),
      ...Array.from({ length: 2 }, (_, i) => `| B${i + 300} | \`dismissed\` | P3 | t |`),
    ];
    const captures = ['## cap one', '**Status:** needs-triage', '## cap two', '**Status:** needs-triage'];
    const md = [
      ...rows,
      ...captures,
      '',
      '*0 needs-triage · **2 captured-untriaged** · 28 confirmed · 2 dismissed · 60 fixed (**92 total**). Last updated: 2026-08-08.*',
    ].join('\n');

    const r = compareBugTally(md);
    expect(r.ok).toBe(false);
    expect(r.mismatches).toEqual([
      { cell: 'confirmed', published: 28, derived: 26 },
      { cell: 'fixed', published: 60, derived: 62 },
    ]);
    // The offsetting total is the trap, pinned:
    expect(r.published.total).toBe(92);
    expect(r.derived.total).toBe(92);
  });

  it('catches 2026-08-03: "0 needs-triage" against a file holding captures', () => {
    const md = [
      '| B1 | `confirmed` | P2 | t |',
      '## cap', '**Status:** needs-triage',
      '## cap', '**Status:** needs-triage',
      '',
      '*0 needs-triage · **0 captured-untriaged** · 1 confirmed · 0 dismissed · 0 fixed (**1 total**). Last updated: 2026-08-03.*',
    ].join('\n');
    const r = compareBugTally(md);
    expect(r.ok).toBe(false);
    expect(r.mismatches.map((m) => m.cell)).toContain('captured-untriaged');
    expect(r.mismatches.map((m) => m.cell)).toContain('total');
  });

  it('a missing tally is NOT clean — silence must not read as pass', () => {
    const r = compareBugTally('| B1 | `confirmed` | P2 | t |');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no-tally');
  });

  it('passes when published and derived agree', () => {
    const md = [
      '| B1 | `confirmed` | P2 | t |',
      '| B2 | `fixed` | P3 | t |',
      '',
      '*0 needs-triage · **0 captured-untriaged** · 1 confirmed · 0 dismissed · 1 fixed (**2 total**). Last updated: 2026-08-09.*',
    ].join('\n');
    expect(compareBugTally(md).ok).toBe(true);
  });
});

describe('formatTallySegment', () => {
  it('renders the leading segment in the file\'s own shape', () => {
    const d = deriveBugCounts([
      '| B1 | `confirmed` | P2 | t |',
      '| B2 | `fixed` | P3 | t |',
    ].join('\n'));
    expect(formatTallySegment(d)).toBe(
      '0 needs-triage · **0 captured-untriaged** · 1 confirmed · 0 dismissed · 1 fixed (**2 total**)'
    );
  });
});

// ---------------------------------------------------------------------------
// The guard. Everything above makes this line trustworthy; this is the line
// that does the work.
// ---------------------------------------------------------------------------
describe('the live .planning/BUGS.md tally', () => {
  it('publishes what the file actually contains', () => {
    // Fail-open on absence: a consumer project running Signal's suite has no
    // .planning/BUGS.md, and a missing file is not a wrong tally.
    if (!existsSync(BUGS_PATH)) return;

    const result = compareBugTally(readFileSync(BUGS_PATH, 'utf-8'));

    const detail = result.mismatches
      .map((m) => `  ${m.cell}: published ${m.published}, file holds ${m.derived}`)
      .join('\n');

    expect(
      result.ok,
      result.reason === 'no-tally'
        ? 'BUGS.md has no tally line — add one; a missing count is not a clean count.'
        : `BUGS.md's tally disagrees with its own contents:\n${detail}\n` +
            `  Re-derive it — do not increment. Correct segment:\n` +
            `  ${formatTallySegment(result.derived)}`
    ).toBe(true);
  });
});

/**
 * The table's own shape. A row with more cells than the header has the overflow
 * DROPPED at render time, so content disappears for a reader while every count
 * derived from the file stays correct — nothing in the suite noticed when the
 * `B109` row shipped a stray pipe and a whole restated paragraph went invisible.
 *
 * Whole-population over the real file (`B104`'s shape): a new row with the wrong
 * column count fails the suite rather than rendering short.
 */
describe('BUGS.md table shape', () => {
  /**
   * A row with MORE cells than the header has the overflow DROPPED at render,
   * so content vanishes for a reader while every count derived from the file
   * stays correct — nothing noticed when the `B109` row shipped a stray pipe
   * and a restated paragraph went invisible.
   *
   * PINNED AS AN EXACT SET, not a threshold. Four rows were already overflowing
   * when this guard was written — all four from unescaped pipes inside code
   * spans (`'done'|'not-done'`, `(?:^|\n)`), which GFM treats as delimiters
   * even inside backticks. They are frozen records of fixed bugs and rewriting
   * them was out of scope for the change that added this guard, so they are
   * NAMED rather than silently tolerated. A fifth fails the suite; fixing one
   * also fails, which is how the list shrinks instead of ossifying.
   */
  const KNOWN_OVERFLOW = ['B63', 'B72', 'B88', 'B96'];

  const cellCount = (line) => line.replace(/\\\|/g, '\u0000').split('|').length;

  it('has no overflowing row beyond the four already known', () => {
    const src = readFileSync(join(ROOT, '.planning/BUGS.md'), 'utf8');
    const lines = src.split('\n');
    const header = lines.find((l) => /^\| ID \| Status \| Pri \| Summary \|/.test(l));
    expect(header).toBeTruthy();
    const want = cellCount(header);

    const rows = lines.filter((l) => /^\| B\d+ \|/.test(l));
    expect(rows.length).toBeGreaterThan(50); // the population is real, not empty

    const overflowing = rows
      .filter((r) => cellCount(r) > want)
      .map((r) => r.match(/^\| (B\d+)/)[1])
      .sort();

    expect(overflowing).toEqual([...KNOWN_OVERFLOW].sort());
  });

  it('the four known ones are code-span pipes, not stray delimiters', () => {
    // Recorded so the next reader knows what fixing them means: escape the
    // pipes inside the backticks, do not restructure the row.
    const src = readFileSync(join(ROOT, '.planning/BUGS.md'), 'utf8');
    for (const id of KNOWN_OVERFLOW) {
      const row = src.split('\n').find((l) => l.startsWith(`| ${id} |`));
      expect(row, `${id} row present`).toBeTruthy();
      expect(row).toMatch(/`/); // the overflow lives inside a code span
    }
  });
});
