// The backlog reader, fixed before step 5's migration reads other projects'
// backlogs with it: `B121` (CRLF), `B122` (`<details>` mentions), `B127`
// (lower-case done-word in a live marker), `B135` (`####` rows invisible to the
// discharge writer). Each test uses the input the bug was measured with.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { parseBacklogRows, dischargeBacklogRows } from '../plugin/tools/lib/backlog.js';
import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';

const dirs = [];
function project(backlog) {
  const base = mkdtempSync(join(tmpdir(), 'sig-backlog-reader-'));
  dirs.push(base);
  mkdirSync(join(base, '.planning'));
  writeFileSync(join(base, '.planning', 'BACKLOG.md'), backlog);
  return base;
}
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

const LF = ['# Backlog', '', '## Sprint', '', '### First row', '', 'Body one.', '', '### Second row', '', 'Body two.', '', '*Last updated: 2026-10-01*', ''].join('\n');
const CRLF = LF.replace(/\n/g, '\r\n');

describe('B121 — a CRLF BACKLOG.md', () => {
  it('parses the same rows as the LF file', () => {
    const lf = parseBacklogRows(LF, { maxDepth: 4 });
    const crlf = parseBacklogRows(CRLF, { maxDepth: 4 });
    expect(lf.map((r) => r.text)).toEqual(['First row', 'Second row']);
    expect(crlf.map((r) => [r.text, r.line])).toEqual(lf.map((r) => [r.text, r.line]));
  });

  it('discharges a row and writes the file back as CRLF throughout', async () => {
    const base = project(CRLF);
    const r = await dischargeBacklogRows(base, { rows: ['Second row'], by: 'v0.1.46', at: '2026-10-03', today: '2026-10-03' });
    expect(r.results[0].status).toBe('discharged');
    const out = readFileSync(join(base, '.planning', 'BACKLOG.md'), 'utf-8');
    expect(out).toContain('### ~~Second row~~ · **DONE — v0.1.46, 2026-10-03**\r\n');
    expect(out).toContain('*Last updated: 2026-10-03*');
    expect(/(^|[^\r])\n/.test(out)).toBe(false);
  });

  it('advise reads the CRLF backlog rows with bodies free of carriage returns', async () => {
    const c = await readCorpus(project(CRLF));
    expect(c.sources.backlog.rows.map((r) => r.text)).toEqual(['First row', 'Second row']);
    expect(c.sources.backlog.rows[0].body).toBe('Body one.');
  });

  it('advise reports cannot-check, not an empty queue, for headings it reads as zero rows', async () => {
    const c = await readCorpus(project('# Backlog\n\n##### Too deep for the reader\n\nBody.\n'));
    expect(c.sources.backlog).toBeNull();
    expect(c.cannotCheck.find((x) => x.source === 'BACKLOG.md').reason).toMatch(/no rows this reader recognises/);
  });

  it('a title and prose alone is still an empty queue, not a failure', async () => {
    const c = await readCorpus(project('# Backlog\n\nNothing live here yet.\n'));
    expect(c.sources.backlog.rows).toEqual([]);
    expect(c.checked).toContain('BACKLOG.md');
  });
});

describe('B122 — a MENTION of <details> is not a block', () => {
  const tail = ['', '### Row after the mention', '', 'Body.', ''].join('\n');

  it('a fenced <details> leaves the next row live', () => {
    const rows = parseBacklogRows(['### Row with a fence', '', '```', '<details>', '```', tail].join('\n'), { maxDepth: 4 });
    expect(rows.map((r) => [r.text, r.inDetails])).toEqual([
      ['Row with a fence', false],
      ['Row after the mention', false],
    ]);
  });

  it('an inline `<details>` code span leaves the next row live', () => {
    const rows = parseBacklogRows(['### Row that says `<details>` in prose', tail].join('\n'), { maxDepth: 4 });
    expect(rows.every((r) => !r.inDetails)).toBe(true);
  });

  it('a real <details> block still folds the heading inside it', () => {
    const rows = parseBacklogRows(
      ['### ~~Done row~~ · **DONE — v0.1.1**', '', '<details>', '', '### Original entry', '', '</details>', tail].join('\n'),
      { maxDepth: 4 },
    );
    expect(rows.find((r) => r.text === 'Original entry').inDetails).toBe(true);
    expect(rows.find((r) => r.text === 'Row after the mention').inDetails).toBe(false);
  });
});

describe('B127 — a lower-case done-word inside a live marker', () => {
  it('the M6.E3 in-flight marker reads as live', () => {
    const [row] = parseBacklogRows('### `M6.E3` · **IN FLIGHT — EXECUTE done 2026-09-27, VERIFY next**\n', { maxDepth: 4 });
    expect(row.discharged).toBe(false);
  });

  it('an upper-case marker still reads as discharged', () => {
    const [row] = parseBacklogRows('### `M6.E3` · **DONE — v0.1.42, 2026-09-27**\n', { maxDepth: 4 });
    expect(row.discharged).toBe(true);
    expect(row.dischargedBy).toBe('v0.1.42');
  });
});

describe('B135 — the discharge writer sees #### rows', () => {
  const NESTED = [
    '# Backlog', '', '## Sprint', '',
    '### Twelve promoted from the inbox drain', '',
    '#### Nested row one', '', 'Body.', '',
    '#### Nested row two', '', 'Body.', '',
    '*Last updated: 2026-10-01*', '',
  ].join('\n');

  it('discharges a #### row by name', async () => {
    const base = project(NESTED);
    const r = await dischargeBacklogRows(base, { rows: ['Nested row two'], by: 'M6.E4', at: '2026-08-24', today: '2026-10-03' });
    expect(r.results[0].status).toBe('discharged');
    expect(readFileSync(join(base, '.planning', 'BACKLOG.md'), 'utf-8')).toContain('#### ~~Nested row two~~ · **DONE — M6.E4, 2026-08-24**');
  });

  it('the ### section header above them is a container, not a row it can strike', async () => {
    const base = project(NESTED);
    const r = await dischargeBacklogRows(base, { rows: ['Twelve promoted'], by: 'M6.E4' });
    expect(r.results[0].status).toBe('not-found');
  });
});
