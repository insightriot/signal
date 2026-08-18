/**
 * tests/add-bugs-footer.test.js — M6.E2 S2.
 *
 * `captureToBugs` inserted with `insertAtEnd` on the documented belief that
 * `BUGS.md` has "no footer to rewrite". It does have one — the italic tally
 * line — so every capture landed physically BELOW the file's own summary and
 * nothing re-derived the count.
 *
 * The inbox helpers do NOT transfer. `FUTURE_IDEAS_FOOTER_RE` requires a line
 * beginning `*Last updated:` with no interior asterisk; BUGS.md's footer begins
 * with the tally and carries bold spans. The anchor comes from
 * `readPublishedTally().lineNumber` instead.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { captureToBugs } from '../plugin/tools/lib/add.js';
import { compareBugTally, readPublishedTally } from '../plugin/tools/lib/bugs-tally.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const TALLY = (t) =>
  `*0 needs-triage · **${t.cap ?? 0} captured-untriaged** · ${t.confirmed} confirmed · 0 dismissed · ${t.fixed} fixed (**${t.total} total**). Last updated: 2026-08-01.*`;

const WITH_TALLY = [
  '# Bugs',
  '',
  '| ID | Status | Pri | Summary |',
  '|---|---|---|---|',
  '| B1 | `confirmed` | P2 | a defect |',
  '| B2 | `fixed` | P3 | another |',
  '',
  TALLY({ confirmed: 1, fixed: 1, total: 2 }),
  '',
].join('\n');

const NO_TALLY = ['# Bugs', '', '| ID | Status | Pri | Summary |', '|---|---|---|---|', '| B1 | `confirmed` | P2 | a |', ''].join('\n');

let dir;
const opts = (body) => ({
  body,
  today: '2026-08-18',
  title: 'A captured defect',
  sensitivePrompt: async () => 'keep',
  bodyLengthPrompt: async () => 'keep',
});

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'm6e2-add-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const write = (c) => writeFile(join(dir, '.planning', 'BUGS.md'), c);
const read = () => readFile(join(dir, '.planning', 'BUGS.md'), 'utf8');

describe('AC1.1 — the capture lands above the tally, not below it', () => {
  it('inserts above the published tally line', async () => {
    await write(WITH_TALLY);
    await captureToBugs(dir, opts('the body of the capture'));
    const after = await read();
    const lines = after.split('\n');
    const entryIdx = lines.findIndex((l) => l.startsWith('## A captured defect'));
    const tallyIdx = readPublishedTally(after).lineNumber - 1;
    expect(entryIdx).toBeGreaterThan(-1);
    expect(entryIdx).toBeLessThan(tallyIdx);
  });

  it('leaves the tally as the last content line of the file', async () => {
    await write(WITH_TALLY);
    await captureToBugs(dir, opts('body'));
    const after = await read();
    const lines = after.split('\n');
    let last = lines.length - 1;
    while (last >= 0 && lines[last].trim() === '') last--;
    expect(lines[last]).toBe(readPublishedTally(after).line);
  });
});

describe('AC1.2 — the tally is re-derived from the file, never incremented', () => {
  it('the file agrees with itself after a capture — asserted through the check', async () => {
    await write(WITH_TALLY);
    await captureToBugs(dir, opts('body'));
    expect(compareBugTally(await read()).ok).toBe(true);
  });

  it('a wrong published tally is CORRECTED by the capture, not carried forward', async () => {
    // Published says 9 confirmed; the file holds 1. A capture must publish the
    // derived value, so incrementing would land on 10 and stay wrong.
    await write(WITH_TALLY.replace(TALLY({ confirmed: 1, fixed: 1, total: 2 }), TALLY({ confirmed: 9, fixed: 1, total: 10 })));
    await captureToBugs(dir, opts('body'));
    const after = await read();
    expect(compareBugTally(after).ok).toBe(true);
    expect(readPublishedTally(after).confirmed).toBe(1);
  });

  it('the captured entry itself is counted — captured-untriaged goes up by one', async () => {
    await write(WITH_TALLY);
    const before = readPublishedTally(WITH_TALLY).capturedUntriaged;
    await captureToBugs(dir, opts('body'));
    expect(readPublishedTally(await read()).capturedUntriaged).toBe(before + 1);
  });

  // The tally line is `*<counts>. Last updated: <date> — <narrative>*`. The
  // counts are derived; the date and narrative are the AUTHOR'S. Stamping the
  // date on an automated capture would make the line claim a freshness its
  // prose does not have — a new instance of the class this Epic is about.
  it("leaves the author's date and narrative untouched — only the counts move", async () => {
    const withNarrative = WITH_TALLY.replace(
      'Last updated: 2026-08-01.*',
      'Last updated: 2026-08-01 — B2 FIXED; the reasoning is in the entry.*'
    );
    await write(withNarrative);
    await captureToBugs(dir, opts('body'));
    const line = readPublishedTally(await read()).line;
    expect(line).toContain('Last updated: 2026-08-01');
    expect(line).toContain('B2 FIXED; the reasoning is in the entry.');
    expect(line).not.toContain('2026-08-18');
  });
});

describe('AC1.3 — a BUGS.md with no tally keeps the old behaviour', () => {
  it('appends at end of file and adds no tally', async () => {
    await write(NO_TALLY);
    await captureToBugs(dir, opts('body'));
    const after = await read();
    expect(readPublishedTally(after)).toBeNull();
    const lines = after.split('\n');
    let last = lines.length - 1;
    while (last >= 0 && lines[last].trim() === '') last--;
    expect(after).toContain('## A captured defect');
    expect(lines.slice(0, last + 1).join('\n')).toMatch(/## A captured defect[\s\S]*$/);
  });
});

describe('AC1.4 — entries already stranded below the tally are reported', () => {
  const STRANDED = WITH_TALLY + '\n## An older stranded capture\n\n**Status:** needs-triage\n\nbody\n\n---\n';

  it('reports repaired:true when content sat below the tally', async () => {
    await write(STRANDED);
    const res = await captureToBugs(dir, opts('body'));
    expect(res.repaired).toBe(true);
  });

  it('does not lose the stranded entry', async () => {
    await write(STRANDED);
    await captureToBugs(dir, opts('body'));
    expect(await read()).toContain('## An older stranded capture');
  });

  it('reports repaired:false on a well-formed file', async () => {
    await write(WITH_TALLY);
    const res = await captureToBugs(dir, opts('body'));
    expect(res.repaired).toBe(false);
  });
});

describe('AC1.5 — the command file no longer states the wrong belief', () => {
  it('add.md does not claim BUGS.md has no footer to rewrite', () => {
    const md = readFileSync(join(ROOT, 'plugin/commands/add.md'), 'utf8');
    expect(md).not.toMatch(/BUGS[^.]*\.md[^\n]*no footer to rewrite/i);
    expect(md).not.toMatch(/no footer to rewrite[^\n]*BUGS/i);
  });

  it('add.md says the tally is re-derived on capture', () => {
    const md = readFileSync(join(ROOT, 'plugin/commands/add.md'), 'utf8');
    expect(md).toMatch(/re-derive|rederive/i);
  });
});

describe('REVIEW fix — rewriteBugTally must not silently no-op', () => {
  // readPublishedTally accepts an unbolded `(9 total)`. The first version of
  // rewriteBugTally spliced only the bolded marker, so on such a file the
  // replace did nothing, the count stayed wrong, and the capture reported
  // success — a silent no-op inside the fix for silently wrong counts.
  const UNBOLDED = [
    '| ID | Status | Pri | S |',
    '|---|---|---|---|',
    '| B1 | `fixed` | P1 | x |',
    '',
    '*0 needs-triage · 0 captured-untriaged · 0 confirmed · 0 dismissed · 9 fixed (9 total). Last updated: 2026-01-01.*',
    '',
  ].join('\n');

  it('rewrites a tally whose total marker is not bolded', async () => {
    const { rewriteBugTally } = await import('../plugin/tools/lib/add.js');
    const after = rewriteBugTally(UNBOLDED);
    expect(after).not.toBe(UNBOLDED);
    expect(compareBugTally(after).ok).toBe(true);
  });

  it('a capture into an unbolded-tally file leaves the file self-consistent', async () => {
    await write(UNBOLDED);
    await captureToBugs(dir, opts('body'));
    expect(compareBugTally(await read()).ok).toBe(true);
  });
});

describe('REVIEW probe — the drifted reconstruction and fenced samples', () => {
  // readPublishedTally is fence-aware; insertBugsEntry's strandedBelow scan and
  // its slice-reconstruction are NOT. Raised at REVIEW as a suspected second
  // defect of the same shape as the no-op above. Probed rather than assumed:
  // the path is clean, and this pins it so it stays that way.
  const WITH_FENCED_SAMPLE = [
    '| ID | Status | Pri | S |',
    '|---|---|---|---|',
    '| B1 | `fixed` | P1 | x |',
    '',
    '*0 needs-triage · **0 captured-untriaged** · 0 confirmed · 0 dismissed · 1 fixed (**1 total**). Last updated: 2026-01-01.*',
    '',
    '## A doc note',
    '',
    '```',
    '*0 needs-triage · **0 captured-untriaged** · 0 confirmed · 0 dismissed · 9 fixed (**9 total**). Last updated: sample.*',
    '```',
    '',
  ].join('\n');

  it('does not eat a fenced tally-shaped sample when absorbing stranded content', async () => {
    await write(WITH_FENCED_SAMPLE);
    await captureToBugs(dir, opts('body'));
    const after = await read();
    expect(after).toContain('Last updated: sample.');
    expect((after.match(/```/g) || []).length % 2).toBe(0);
    expect(compareBugTally(after).ok).toBe(true);
  });
});
