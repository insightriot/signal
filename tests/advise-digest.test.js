// `M6.E12` S1 — the big-picture digest `/sig:advise` hands the agent.
//
// The digest is reading material for a judgment, so what these pin is the part
// code owns: every reference resolves, every source is accounted for, nothing is
// silently absent, and the whole thing stays inside its budget.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { gatherBigPicture, formatDigest, DIGEST_SOURCES, DIGEST_CAPS, TRIM_ORDER } from '../plugin/tools/lib/advise-digest.js';

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

const STATE = (epic = 'M2.E3', phase = 'PLAN') =>
  `---\nschema_version: 1\nphase: ${phase}\ncurrent_epic: ${epic}\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\n---\n\n# State\n`;

function project(files = {}) {
  const base = mkdtempSync(join(tmpdir(), 'sig-digest-'));
  dirs.push(base);
  const all = {
    '.planning/STATE.md': STATE(),
    '.planning/PROJECT.md': '# P\n\n## Vision\n\nShip calibrated rigor to small teams.\n\n## Other\n',
    '.planning/MILESTONE-2.md':
      '# Milestone 2 — reliability\n\nMake every check tell the truth.\n\n## Epic status\n\n| Epic | Status | Summary |\n|---|---|---|\n| `M2.E1` | **shipped** | First |\n| `M2.E3` | in flight | Third |\n',
    '.planning/BUGS.md':
      '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | `confirmed` | P2 | **two** |\n| B2 | `confirmed` | P1 | **one** |\n| B3 | `fixed` | P1 | **gone** |\n',
    '.planning/BACKLOG.md': '# Backlog\n\n### B10 — a row · **roadmap** · small\nFiled 2026-09-01.\n\n### Another row · **hygiene**\nBody.\n',
    '.planning/M2.E1-RETROSPECTIVE.md':
      '# Retro\n\n## What surprised us\n\nx\n\n## What to feed back into Signal\n\nCheck the counts.\n\n## What we\'d do differently\n\nRun it first.\n',
    '.planning/OPEN-QUESTIONS.md': '# Questions\n\n## Q1 — should it fail closed?\n\n## ~~Q2 — answered~~\n',
    '.planning/ISSUES-INBOX.md': '# Inbox\n\n## one\n\n## two\n',
    ...files,
  };
  for (const [rel, content] of Object.entries(all)) {
    if (content === null) continue;
    const p = join(base, rel);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, content);
  }
  return base;
}

describe('gatherBigPicture — AC1.1–AC1.3', () => {
  it('reads all eight sources from a full project, and every reference resolves to a real line (AC1.1)', async () => {
    const base = project();
    const g = await gatherBigPicture(base);
    expect(g.cannotCheck).toEqual([]);
    expect(g.checked.sort()).toEqual([...DIGEST_SOURCES].sort());
    for (const source of DIGEST_SOURCES) {
      for (const e of g.entries[source]) {
        if (!e.path) continue; // other-branch Epics carry a branch, not a file
        const lines = readFileSync(join(base, e.path), 'utf8').split('\n');
        expect(e.line, `${source} ${e.path}:${e.line}`).toBeGreaterThanOrEqual(1);
        expect(e.line).toBeLessThanOrEqual(lines.length);
      }
    }
  });

  it('puts the highest-priority open bug first and leaves fixed bugs out', async () => {
    const g = await gatherBigPicture(project());
    expect(g.entries.bugs.map((e) => e.text.split(' ')[0])).toEqual(['B2', 'B1']);
  });

  it('reads only the forward-looking retrospective sections, skipping stubs', async () => {
    const g = await gatherBigPicture(project({ '.planning/M2.E2-RETROSPECTIVE.md': '# R\n\n## What to feed back into Signal\n\n[FILL IN]\n' }));
    expect(g.entries.retrospectives).toHaveLength(2);
    expect(g.entries.retrospectives.every((e) => e.path.endsWith('M2.E1-RETROSPECTIVE.md'))).toBe(true);
  });

  it('lists open questions and leaves struck ones out', async () => {
    const g = await gatherBigPicture(project());
    expect(g.entries['open questions'].map((e) => e.text)).toEqual(['Q1 — should it fail closed?']);
  });

  it('takes the milestone named by current_epic, not merely the highest-numbered file', async () => {
    const g = await gatherBigPicture(project({ '.planning/MILESTONE-9.md': '# Milestone 9\n\nFuture.\n' }));
    expect(g.entries.milestone[0].path).toBe('.planning/MILESTONE-2.md');
  });

  it('each source absent in turn → cannot-check with an absent reason; the invariant holds (AC1.2)', async () => {
    const removals = {
      vision: '.planning/PROJECT.md',
      milestone: '.planning/MILESTONE-2.md',
      bugs: '.planning/BUGS.md',
      backlog: '.planning/BACKLOG.md',
      retrospectives: '.planning/M2.E1-RETROSPECTIVE.md',
      'open questions': '.planning/OPEN-QUESTIONS.md',
      inbox: '.planning/ISSUES-INBOX.md',
    };
    for (const [source, rel] of Object.entries(removals)) {
      const g = await gatherBigPicture(project({ [rel]: null }));
      const miss = g.cannotCheck.find((c) => c.source === source);
      expect(miss, source).toBeTruthy();
      expect(miss.reason).toMatch(/not present|no |none/i);
      expect(g.checked.length + g.cannotCheck.length).toBe(DIGEST_SOURCES.length);
      expect(new Set([...g.checked, ...g.cannotCheck.map((c) => c.source)]).size).toBe(DIGEST_SOURCES.length);
    }
  });

  it('an unreadable source gets a DIFFERENT reason from an absent one (AC1.2)', async () => {
    const base = project({ '.planning/OPEN-QUESTIONS.md': null });
    mkdirSync(join(base, '.planning', 'OPEN-QUESTIONS.md')); // a directory where a file should be
    const g = await gatherBigPicture(base);
    expect(g.cannotCheck.find((c) => c.source === 'open questions').reason).toMatch(/could not be read/);
  });

  it('a directory with nothing in it → every file source cannot-check, no throw (AC1.3)', async () => {
    const base = mkdtempSync(join(tmpdir(), 'sig-digest-empty-'));
    dirs.push(base);
    const g = await gatherBigPicture(base);
    expect(g.checked.length + g.cannotCheck.length).toBe(DIGEST_SOURCES.length);
    expect(g.cannotCheck.length).toBeGreaterThanOrEqual(DIGEST_SOURCES.length - 1);
    expect(formatDigest(g)).toMatch(/## Could not read/);
  });

  // M6.E13 t4.2a: the count comes from the records whose status is N (through
  // `listRecords`), not from the files in `work/inbox/`. The store-on twins —
  // v1 and v2, under the parser flag — are in `advise-store-on.test.js`.
  it('with the work store on, the inbox count is the records in status N', async () => {
    const item = (id, status) => `---\nid: ${id}\ntype: NEW\nstatus: ${status}\ncreated:\n  at: 2026-09-01T00:00:00.000Z\n  by: b\n---\nbody\n`;
    const base = project({
      '.planning/work/WORK.md': '---\nkey: SIG\n---\n',
      '.planning/work/inbox/SIG-1.md': item('SIG-1', 'N'),
      '.planning/work/inbox/SIG-2.md': item('SIG-2', 'N'),
      '.planning/work/backlog/SIG-3.md': item('SIG-3', 'T'),
    });
    const g = await gatherBigPicture(base);
    expect(g.entries.inbox[0].text).toMatch(/^2 item\(s\) in the inbox/);
  });
});

describe('formatDigest — AC1.4 and the citation boundary', () => {
  it('stays within the total cap and SAYS what it cut', async () => {
    const rows = Array.from({ length: 400 }, (_, i) => `### Row ${i} · **roadmap** · ${'x'.repeat(150)}\nBody.\n`).join('\n');
    const g = await gatherBigPicture(project({ '.planning/BACKLOG.md': `# Backlog\n\n${rows}` }));
    const text = formatDigest(g);
    const beforeCut = text.split('## Cut to fit')[0];
    expect(beforeCut.length).toBeLessThanOrEqual(DIGEST_CAPS.total);
    expect(text).toMatch(/backlog: \d+ of 400 shown/);
  });

  it('trims retrospectives, then low-priority bugs, BEFORE the backlog — the first real run showed 11 of 55 rows', async () => {
    const retro = (n) => `# R\n\n## What to feed back into Signal\n\n${'r'.repeat(900)}\n\n## What we'd do differently\n\n${'d'.repeat(900)}\n`;
    const bugs = Array.from({ length: 150 }, (_, i) => `| B${i + 10} | \`confirmed\` | P3 | **${'b'.repeat(140)}** |`).join('\n');
    const rows = Array.from({ length: 60 }, (_, i) => `### Row ${i} · **roadmap** · ${'x'.repeat(120)}\nBody.\n`).join('\n');
    const g = await gatherBigPicture(project({
      '.planning/M2.E1-RETROSPECTIVE.md': retro(1),
      '.planning/M2.E2-RETROSPECTIVE.md': retro(2),
      '.planning/M2.E3-RETROSPECTIVE.md': retro(3),
      '.planning/BUGS.md': `# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | \`confirmed\` | P1 | **top** |\n${bugs}\n`,
      '.planning/BACKLOG.md': `# Backlog\n\n${rows}`,
    }));
    const text = formatDigest(g);
    expect(text).not.toMatch(/backlog: \d+ of/); // every row shown
    expect(text).toMatch(/low-priority bugs: \d+ of 150 shown/);
    expect(text).toContain('B1 P1'); // high-priority bugs are never trimmed
  });

  it('clips each row to its cap', async () => {
    const g = await gatherBigPicture(project({ '.planning/BACKLOG.md': `# B\n\n### ${'y'.repeat(500)}\nBody.\n` }));
    expect(g.entries.backlog[0].text.length).toBeLessThanOrEqual(DIGEST_CAPS.row);
  });

  it('never emits the evidence marker — digest references are plain path:line, not claims', async () => {
    const text = formatDigest(await gatherBigPicture(project()));
    expect(text).not.toContain('— evidence:');
    expect(text).toContain('(.planning/BACKLOG.md:3)');
  });

  it('lists what could not be read BEFORE anything that was', async () => {
    const text = formatDigest(await gatherBigPicture(project({ '.planning/PROJECT.md': null })));
    expect(text.indexOf('## Could not read')).toBeLessThan(text.indexOf('## milestone'));
  });
});

describe('TRIM_ORDER', () => {
  it('gives the backlog way after retrospectives, low-priority bugs and questions', () => {
    const at = (g) => TRIM_ORDER.indexOf(g);
    for (const g of ['retrospectives', 'low-priority bugs', 'open questions']) expect(at(g)).toBeLessThan(at('backlog'));
  });
  it('every group the digest can grow without limit is trimmable (REVIEW pass 1)', () => {
    for (const g of ['backlog', 'high-priority bugs', 'low-priority bugs', 'milestone rows', 'retrospectives', 'open questions']) {
      expect(TRIM_ORDER).toContain(g);
    }
  });
});

describe('on this repository', () => {
  it('reads every source and every file reference resolves', async () => {
    const base = process.cwd();
    const g = await gatherBigPicture(base);
    expect(g.cannotCheck).toEqual([]);
    for (const source of DIGEST_SOURCES) {
      for (const e of g.entries[source]) {
        if (!e.path) continue;
        expect(existsSync(join(base, e.path)), e.path).toBe(true);
        if (e.line === null) continue; // a work-store item: cited by its record file, which has no line (M6.E13)
        expect(e.line).toBeLessThanOrEqual(readFileSync(join(base, e.path), 'utf8').split('\n').length);
      }
    }
  });
});
