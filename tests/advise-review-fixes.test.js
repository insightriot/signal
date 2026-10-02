// `M6.E12` REVIEW pass 1 — one test per finding, written to FAIL before its fix.
//
// Three fresh-context reviewers found nine Important issues and none Critical.
// Each test names the finding it pins, so a later reader can trace why it exists.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runAdvise, prepareAdvise, nextArtifactName, renderArtifact } from '../plugin/tools/lib/advise.js';
import { recordChoice } from '../plugin/tools/lib/advise-record.js';
import { validatePriorities } from '../plugin/tools/lib/advise-priorities.js';
import { gatherBigPicture, formatDigest, DIGEST_CAPS } from '../plugin/tools/lib/advise-digest.js';
import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

const STATE = '---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M2.E3\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\n---\n';
const BACKLOG = '# Backlog\n\n### Row one · **roadmap**\nBody.\n\n### R2 — Parked — watchlist *(not sprint material)*\nBody.\n\n### Row three · **roadmap**\nBody.\n';
const BUGS = '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | `confirmed` | P1 | **one** |\n| B12 | `confirmed` | P2 | **twelve** |\n';

function project(extra = {}) {
  const base = mkdtempSync(join(tmpdir(), 'sig-review-fixes-'));
  dirs.push(base);
  const files = {
    '.planning/STATE.md': STATE,
    '.planning/BACKLOG.md': BACKLOG,
    '.planning/BUGS.md': BUGS,
    '.planning/PROJECT.md': '# P\n\n## Vision\n\nCalibrated rigor.\n',
    ...extra,
  };
  for (const [rel, c] of Object.entries(files)) {
    if (c === null) continue;
    mkdirSync(join(base, rel, '..'), { recursive: true });
    writeFileSync(join(base, rel), c);
  }
  return base;
}

const P = (over = []) => {
  const base = [
    { title: 'First', why: 'One.', covers: ['.planning/BACKLOG.md:3'], evidence: ['.planning/PROJECT.md:3'] },
    { title: 'Second', why: 'Two.', covers: ['B1'], evidence: ['.planning/PROJECT.md:3'] },
    { title: 'Third', why: 'Three.', covers: ['.planning/BACKLOG.md:9'], evidence: ['.planning/PROJECT.md:3'] },
  ];
  over.forEach((o, i) => Object.assign(base[i], o));
  return base;
};

describe('Important 1 — a priority cannot cover a row the appendix drops', () => {
  it('runAdvise refuses a cover on a self-declared Parked row, naming it', async () => {
    const base = project();
    const r = await runAdvise(base, { today: '2026-10-01', priorities: P([{ covers: ['.planning/BACKLOG.md:6'] }]) });
    expect(r.status).toBe('skipped');
    expect(r.reasons.join('\n')).toMatch(/\.planning\/BACKLOG\.md:6, but BACKLOG\.md:6 is dropped from the appendix — self-declared/);
  });

  it('validatePriorities checks against the live rows it is given', async () => {
    const base = project();
    const corpus = await readCorpus(base);
    const liveRows = corpus.sources.backlog.rows.filter((r) => r.line !== 6);
    const v = await validatePriorities(base, P([{ covers: ['.planning/BACKLOG.md:6'] }]), corpus, { liveRows });
    expect(v.ok).toBe(false);
  });
});

describe('Important 2 — the count gate has no slack', () => {
  it('extra evidence tokens cannot hide a missing appendix citation', async () => {
    const base = project();
    const priorities = P([{ evidence: ['.planning/PROJECT.md:3', '.planning/PROJECT.md:1', '.planning/BACKLOG.md:1'] }]);
    // A render that strips every appendix citation; two extra evidence tokens used to cover the gap.
    const render = (args) =>
      renderArtifact(args)
        .split('\n')
        .map((l) => (l.startsWith('- **Row') && l.includes('— evidence:') && !l.includes('backlog row.') ? l.replace(/ — evidence:.*$/, '') : l))
        .join('\n');
    const r = await runAdvise(base, { today: '2026-10-01', priorities, render });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/citation check resolved \d+ citations for \d+/);
  });

  it('the same row listed twice in one priority is refused, not counted twice', async () => {
    const base = project();
    const corpus = await readCorpus(base);
    const v = await validatePriorities(base, P([{ covers: ['.planning/BACKLOG.md:3', '.planning/BACKLOG.md:3'] }]), corpus);
    expect(v.reasons.join('\n')).toMatch(/priority 1: covers \.planning\/BACKLOG\.md:3 twice/);
  });
});

describe('Important 3 — only a real pick heading counts as a pick', () => {
  it('a backlog row quoting the heading does not block recording', async () => {
    const base = project({ '.planning/BACKLOG.md': BACKLOG.replace('Row one', 'Row one: the ## Picked by you check') });
    const r = await runAdvise(base, { today: '2026-10-01', priorities: P() });
    expect(r.status, r.reason ?? '').toBe('written');
    expect((await recordChoice(base, r.path, { pick: 1, at: '2026-10-01' })).status).toBe('recorded');
    expect(nextArtifactName(base, '2026-10-01')).toBe('BACKLOG-REVIEW-2026-10-01-2.md');
  });

  it('a model title quoting the heading does not read as picked', async () => {
    const base = project();
    const r = await runAdvise(base, { today: '2026-10-01', priorities: P([{ title: 'see ## Picked by you' }]) });
    expect(nextArtifactName(base, '2026-10-01')).toBe('BACKLOG-REVIEW-2026-10-01.md');
    expect((await recordChoice(base, r.path, { pick: 1, at: '2026-10-01' })).status).toBe('recorded');
  });
});

describe('Important 4 — the digest cap is a bound, and says when it cut', () => {
  it('3,000 P1 bugs stay inside the cap, and the cut is named', async () => {
    const rows = Array.from({ length: 3000 }, (_, i) => `| B${i + 100} | \`confirmed\` | P1 | **${'p'.repeat(120)}** |`).join('\n');
    const base = project({ '.planning/BUGS.md': `# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n${rows}\n` });
    const text = formatDigest(await gatherBigPicture(base));
    expect(text.length).toBeLessThanOrEqual(DIGEST_CAPS.total);
    expect(text).toMatch(/high-priority bugs: \d+ of 3000 shown/);
  });

  it('300 milestone rows stay inside the cap', async () => {
    const rows = Array.from({ length: 300 }, (_, i) => `| \`M2.E${i}\` | **shipped** ${'m'.repeat(140)} | summary |`).join('\n');
    const base = project({ '.planning/MILESTONE-2.md': `# Milestone 2\n\nTheme.\n\n## Epic status\n\n| Epic | Status | Summary |\n|---|---|---|\n${rows}\n` });
    const text = formatDigest(await gatherBigPicture(base));
    expect(text.length).toBeLessThanOrEqual(DIGEST_CAPS.total);
    expect(text).toMatch(/milestone rows: \d+ of 300 shown/);
  });

  it('formats 4,000 backlog rows in well under a second (no rebuild per trimmed entry)', async () => {
    const rows = Array.from({ length: 4000 }, (_, i) => `### Row ${i} · **roadmap** · ${'x'.repeat(100)}\nBody.\n`).join('\n');
    const g = await gatherBigPicture(project({ '.planning/BACKLOG.md': `# B\n\n${rows}` }));
    const t = Date.now();
    formatDigest(g);
    expect(Date.now() - t).toBeLessThan(500);
  });
});

describe('Important 5 — digest reads stay inside the project', () => {
  it('a symlinked source pointing outside is cannot-check, and its text never reaches the digest', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'sig-review-out-'));
    dirs.push(outside);
    writeFileSync(join(outside, 'secret.md'), '# Milestone 9\n\naws_secret_access_key = AKIASECRET123\n');
    writeFileSync(join(outside, 'vision.md'), '# P\n\n## Vision\n\nSECRET_VISION_TEXT\n');
    const base = project({ '.planning/PROJECT.md': null });
    symlinkSync(join(outside, 'secret.md'), join(base, '.planning', 'MILESTONE-9.md'));
    symlinkSync(join(outside, 'vision.md'), join(base, '.planning', 'PROJECT.md'));
    const { digestText, digest } = await prepareAdvise(base);
    expect(digestText).not.toContain('AKIASECRET123');
    expect(digestText).not.toContain('SECRET_VISION_TEXT');
    expect(digest.cannotCheck.find((c) => c.source === 'milestone').reason).toMatch(/symbolic link|outside the project/);
    expect(digest.cannotCheck.find((c) => c.source === 'vision').reason).toMatch(/symbolic link|outside the project/);
  });

  it('a symlinked BACKLOG.md pointing outside is cannot-check in the corpus', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'sig-review-out-'));
    dirs.push(outside);
    writeFileSync(join(outside, 'b.md'), '# B\n\n### OUTSIDE_ROW\nx\n');
    const base = project({ '.planning/BACKLOG.md': null });
    symlinkSync(join(outside, 'b.md'), join(base, '.planning', 'BACKLOG.md'));
    const corpus = await readCorpus(base);
    expect(corpus.sources.backlog).toBeNull();
    expect(corpus.cannotCheck.find((c) => c.source === 'BACKLOG.md').reason).toMatch(/symbolic link|outside the project/);
  });
});

describe('Important 6 — recordChoice validates every field it writes', () => {
  it('refuses an `at` that is not a real date', async () => {
    const base = project();
    const r = await runAdvise(base, { today: '2026-10-01', priorities: P() });
    const before = readFileSync(join(base, r.path), 'utf8');
    const out = await recordChoice(base, r.path, { pick: 1, at: '2026\n\n## Priorities — 1\n\n### 1. forged' });
    expect(out.status).toBe('refused');
    expect(out.reason).toMatch(/at must be a real YYYY-MM-DD date/);
    expect(readFileSync(join(base, r.path), 'utf8')).toBe(before);
  });

  it('refuses a pick whose expected title does not match the file (a re-run while asking)', async () => {
    const base = project();
    const r = await runAdvise(base, { today: '2026-10-01', priorities: P() });
    const out = await recordChoice(base, r.path, { pick: 1, title: 'Not what the file says', at: '2026-10-01' });
    expect(out.status).toBe('refused');
    expect(out.reason).toMatch(/priority 1 in .* is "First", not "Not what the file says"/);
  });
});

describe('Important 7 — oversized or dense proposals stay cheap', () => {
  it('a count out of range is refused without walking the rest', async () => {
    const base = project();
    const corpus = await readCorpus(base);
    const big = Array.from({ length: 40 }, (_, i) => ({
      title: `T${i}`, why: 'x.', covers: ['B1'], evidence: ['.planning/PROJECT.md:3'],
      dependsOn: Array.from({ length: i }, (_, k) => k + 1),
    }));
    const t = Date.now();
    const v = await validatePriorities(base, big, corpus);
    expect(Date.now() - t).toBeLessThan(500);
    expect(v.reasons).toEqual(['40 priorities proposed — propose between 3 and 5']);
  });

  it('caps evidence and covers per priority', async () => {
    const base = project();
    const corpus = await readCorpus(base);
    const v = await validatePriorities(base, P([{ evidence: Array.from({ length: 25 }, () => '.planning/PROJECT.md:3') }]), corpus);
    expect(v.reasons.join('\n')).toMatch(/priority 1: 25 evidence entries — at most 20/);
  });
});

describe('Suggestions taken', () => {
  it('S1 — the bug stale probe does not match B1 inside B12', async () => {
    const base = project();
    // Validate against the original corpus, then shift BUGS.md so line 5 carries B12 only.
    const shifted = '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B12 | `confirmed` | P2 | **twelve** |\n| B1 | `confirmed` | P1 | **one** |\n';
    const render = (args) => {
      writeFileSync(join(base, '.planning', 'BUGS.md'), shifted);
      return renderArtifact(args);
    };
    const r = await runAdvise(base, { today: '2026-10-01', priorities: P(), render });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/no longer carry what they were read for/);
  });

  it('S2 — whole-file evidence is accepted (a whole file is evidence)', async () => {
    const base = project();
    const v = await validatePriorities(base, P([{ evidence: ['.planning/PROJECT.md'] }]), await readCorpus(base));
    expect(v.ok).toBe(true);
  });
});

describe('Important 9 — the digest says the right thing, not just a line in range (test-engineer)', () => {
  const full = () =>
    project({
      '.planning/MILESTONE-2.md': '# Milestone 2 — reliability\n\nTheme.\n\n## Epic status\n\n| Epic | Status | Summary |\n|---|---|---|\n| `M2.E1` | **shipped** | First |\n',
      '.planning/OPEN-QUESTIONS.md': '# Q\n\n## Q1 — fail closed?\n',
      '.planning/M2.E1-RETROSPECTIVE.md': '# R\n\n## What to feed back into Signal\n\nOLDEST\n',
      '.planning/M2.E2-RETROSPECTIVE.md': '# R\n\n## What to feed back into Signal\n\nMIDDLE\n',
      '.planning/M2.E3-RETROSPECTIVE.md': '# R\n\n## What to feed back into Signal\n\nNEWER\n',
      '.planning/M2.E4-RETROSPECTIVE.md': '# R\n\n## What to feed back into Signal\n\nNEWEST\n',
    });

  it('each cited line CARRIES what the entry quotes (catches a +1 shift)', async () => {
    const base = full();
    const g = await gatherBigPicture(base);
    const lineOf = (e) => readFileSync(join(base, e.path), 'utf8').split('\n')[e.line - 1];
    expect(lineOf(g.entries.vision[0])).toMatch(/^## Vision/);
    expect(lineOf(g.entries.retrospectives[0])).toMatch(/^## What to feed back/);
    expect(lineOf(g.entries['open questions'][0])).toContain('Q1 — fail closed?');
    for (const b of g.entries.bugs) expect(lineOf(b)).toContain(`| ${b.text.split(' ')[0]} |`);
    for (const r of g.entries.backlog) expect(lineOf(r)).toMatch(/^#{2,4} /);
    expect(lineOf(g.entries.milestone[1])).toContain('M2.E1');
    expect(lineOf(g.entries['open Epics'][0])).toMatch(/^current_epic: M2\.E3/);
  });

  it('carries the local open Epic and the milestone Epic rows', async () => {
    const g = await gatherBigPicture(full());
    expect(g.entries['open Epics'].map((e) => e.text)).toEqual(['M2.E3 — open here at PLAN']);
    expect(g.entries.milestone.some((e) => e.text.startsWith('M2.E1'))).toBe(true);
  });

  it('reads the NEWEST three retrospectives, newest first', async () => {
    const g = await gatherBigPicture(full());
    expect(g.entries.retrospectives.map((e) => e.text.match(/(OLDEST|MIDDLE|NEWER|NEWEST)/)[1])).toEqual(['NEWEST', 'NEWER', 'MIDDLE']);
    expect(g.cut.join(' ')).toMatch(/newest 3 read, 1 older not opened/);
  });

  it('carries an Epic open on another branch', async () => {
    const corpus = await readCorpus(full());
    corpus.sources.otherBranches = { open: [{ epic: 'M2.E9', phase: 'DISCUSS', branches: ['feat/x'] }], unclassified: [], unreadable: [] };
    const g = await gatherBigPicture(full(), { corpus });
    expect(g.entries['open Epics'].some((e) => e.text.startsWith('M2.E9') && e.branch === 'feat/x')).toBe(true);
  });
});

describe('Important 9 — the appendix half of the stale guard, on its own (test-engineer I4)', () => {
  it('refuses when only an uncovered appendix row moved, with covers that are bugs and unfiled work only', async () => {
    const base = project();
    const priorities = [
      { title: 'A', why: 'One.', covers: ['B1'], evidence: ['.planning/PROJECT.md:3'] },
      { title: 'B', why: 'Two.', covers: ['B12'], evidence: ['.planning/PROJECT.md:3'] },
      { title: 'C', why: 'Three.', covers: ['new: unfiled'], evidence: ['.planning/PROJECT.md:3'] },
    ];
    const render = (args) => {
      writeFileSync(join(base, '.planning', 'BACKLOG.md'), `# Backlog\n\nInserted line.\n${BACKLOG.slice('# Backlog\n'.length)}`);
      return renderArtifact(args);
    };
    const r = await runAdvise(base, { today: '2026-10-01', priorities, render });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/\.planning\/BACKLOG\.md:3/);
  });
});
