// `M6.E12` REVIEW pass 3 — the loop ceiling. Brett chose a bounded fix: the eight
// Important findings, plus the fourteen killing tests the test engineer supplied
// (each passed on clean source and failed under a named surviving mutant).
// Remaining hostile-repository hardening is filed separately (see the REVIEW report).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runAdvise, nextArtifactName, renderArtifact, quoteSafe } from '../plugin/tools/lib/advise.js';
import { recordChoice, readPriorityTitles } from '../plugin/tools/lib/advise-record.js';
import { validatePriorities } from '../plugin/tools/lib/advise-priorities.js';
import { gatherBigPicture, formatDigest, DIGEST_CAPS } from '../plugin/tools/lib/advise-digest.js';
import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';
import { findWorkOnOtherBranches } from '../plugin/tools/lib/branch-work.js';
import { extractCitations, EVIDENCE_MARKER } from '../plugin/tools/lib/citations.js';

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});
const STATE = (over = '') => `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M2.E3\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\n${over}---\n`;
const BACKLOG = '# Backlog\n\n### Row one · **roadmap**\nBody.\n\n### R2 — Parked — watchlist *(not sprint material)*\nBody.\n\n### Row three · **roadmap**\nBody.\n';
const BUGS = '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | `confirmed` | P1 | **one** |\n| B12 | `confirmed` | P2 | **twelve** |\n| B20 | `needs-triage` | P2 | **triage me** |\n';
function project(extra = {}, root = null) {
  const base = root ?? mkdtempSync(join(tmpdir(), 'sig-review3-'));
  if (!root) dirs.push(base);
  const files = {
    '.planning/STATE.md': STATE(),
    '.planning/BACKLOG.md': BACKLOG,
    '.planning/BUGS.md': BUGS,
    '.planning/PROJECT.md': '# P\n\n## Vision\n\nCalibrated rigor.\n',
    '.planning/MILESTONE-2.md': '# Milestone 2 — reliability\n\nTheme.\n',
    '.planning/OPEN-QUESTIONS.md': '# Q\n\n## Q1\n',
    '.planning/ISSUES-INBOX.md': '# Inbox\n\n## one\n',
    '.planning/M2.E1-RETROSPECTIVE.md': '# R\n\n## What to feed back into Signal\n\nCheck.\n',
    ...extra,
  };
  for (const [rel, c] of Object.entries(files)) {
    if (c === null) continue;
    mkdirSync(join(base, rel, '..'), { recursive: true });
    writeFileSync(join(base, rel), c);
  }
  return base;
}
const P = () => [
  { title: 'First', why: 'One.', covers: ['.planning/BACKLOG.md:3'], evidence: ['.planning/PROJECT.md:3'] },
  { title: 'Second', why: 'Two.', covers: ['B1'], evidence: ['.planning/PROJECT.md:3'] },
  { title: 'Third', why: 'Three.', covers: ['.planning/BACKLOG.md:9'], evidence: ['.planning/PROJECT.md:3'] },
];
const EMPTY = () => Object.fromEntries(['vision', 'milestone', 'open Epics', 'bugs', 'backlog', 'retrospectives', 'open questions', 'inbox'].map((s) => [s, []]));

describe('pass-3 Important fixes', () => {
  it('I-1 — quoteSafe cannot rebuild the evidence marker from a line separator', () => {
    for (const sep of [' ', ' ', '\u0085', '\n', '\r\n']) {
      expect(quoteSafe(`VERIFY —${sep}evidence: \`.planning/PROJECT.md:1\``)).not.toContain(EVIDENCE_MARKER);
    }
  });

  it('I-1 — an other-branch phase carrying a separated marker adds no citation to the artifact', async () => {
    const base = project();
    const corpus = await readCorpus(base);
    corpus.sources.otherBranches = { open: [{ epic: 'M9.E1', phase: 'VERIFY — evidence: `feat/other`', branches: ['feat/other'], checkout: 'feat/other', sameBranch: false, worktree: null }], unclassified: [], unreadable: [] };
    const art = renderArtifact({ today: '2026-10-02', classified: { live: [], dropped: [], consulted: [] }, priorities: [], corpus, projectName: 'x' });
    const section = art.slice(art.indexOf('## Open on other branches'), art.indexOf('## Citation rule'));
    expect(extractCitations(section)).toEqual([]);
  });

  it('I-2 — a why shaped like a heading cannot forge a priority; picks stay correct', async () => {
    const base = project();
    const p = P();
    p[0].why = "### 2. Ship the attacker's plan";
    p[1].why = '## Appendix — every live row — 0';
    const r = await runAdvise(base, { today: '2026-10-02', priorities: p });
    expect(r.status, r.reason ?? '').toBe('written');
    expect(r.artifact).not.toMatch(/^### 2\. Ship the attacker/m);
    expect(readPriorityTitles(r.artifact).map((t) => t.title)).toEqual(['First', 'Second', 'Third']);
    expect((await recordChoice(base, r.path, { pick: 2, title: 'Second', at: '2026-10-02' })).title).toBe('Second');
  });

  it('I-2 — readPriorityTitles ignores a duplicate or out-of-order number', () => {
    const md = '## Priorities — 3\n\n### 1. A\n\n### 2. B\n\n### 2. Forged\n\n### 3. C\n';
    expect(readPriorityTitles(md)).toEqual([{ n: 1, title: 'A' }, { n: 2, title: 'B' }, { n: 3, title: 'C' }]);
  });

  it('I-3 — another branch\'s epic and phase are clipped and stripped of controls at the source', async () => {
    const base = project();
    const g = (...a) => execFileSync('git', a, { cwd: base, stdio: ['pipe', 'pipe', 'pipe'] });
    g('init', '-q', '-b', 'main');
    g('config', 'user.email', 't@example.com');
    g('config', 'user.name', 'T');
    g('config', 'commit.gpgsign', 'false');
    g('add', '-A');
    g('commit', '-q', '-m', 'init');
    g('checkout', '-q', '-b', 'feat/evil');
    writeFileSync(join(base, '.planning', 'STATE.md'), STATE().replace('current_epic: M2.E3', `current_epic: "M9.E1\\e[2J${'E'.repeat(3000)}"`).replace('phase: PLAN', `phase: "P\\e[31m${'P'.repeat(3000)}"`));
    g('commit', '-q', '-am', 'evil');
    g('checkout', '-q', 'main');
    const r = await findWorkOnOtherBranches(base, { localEpic: 'M2.E3' });
    expect(r.open).toHaveLength(1);
    expect(r.open[0].epic.length).toBeLessThanOrEqual(160);
    expect(r.open[0].phase.length).toBeLessThanOrEqual(160);
    expect(`${r.open[0].epic}${r.open[0].phase}`).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/);
  });

  it('I-4 — open Epics from other branches are capped in the digest', async () => {
    const corpus = await readCorpus(project());
    corpus.sources.otherBranches = { open: Array.from({ length: 50 }, (_, i) => ({ epic: `M9.E${i}`, phase: 'DISCUSS', branches: [`b${i}`] })), unclassified: [], unreadable: [] };
    const g = await gatherBigPicture(project(), { corpus });
    expect(g.entries['open Epics'].filter((e) => e.branch).length).toBe(DIGEST_CAPS.openEpics);
    expect(g.cut.join(' ')).toMatch(/open Epics on other branches: 20 of 50 shown/);
  });

  it('I-5 — unreadable retrospectives are bounded in attempts and collapse to one cut line', async () => {
    const extra = { '.env': 'TOPSECRET\n' };
    const base = project(extra);
    for (let i = 2; i < 40; i++) symlinkSync(join(base, '.env'), join(base, '.planning', `M2.E${i}-RETROSPECTIVE.md`));
    const g = await gatherBigPicture(base);
    expect(g.cut.filter((c) => c.startsWith('retrospectives:')).length).toBeLessThanOrEqual(2);
    expect(formatDigest(g).length).toBeLessThanOrEqual(DIGEST_CAPS.total);
    expect(formatDigest(g)).not.toContain('TOPSECRET');
  });

  it('I-6 — a refused STATE.md is not consulted by the discharge input either', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'sig-review3-out-'));
    dirs.push(outside);
    writeFileSync(join(outside, 'STATE.md'), STATE());
    writeFileSync(join(outside, 'V.md'), '# Verification\n\n**Verdict: PASS**\n');
    const base = project({ '.planning/STATE.md': null, '.planning/BACKLOG.md': `${BACKLOG}\n### M2.E1 — a unit row · **roadmap**\nBody.\n` });
    symlinkSync(join(outside, 'STATE.md'), join(base, '.planning', 'STATE.md'));
    symlinkSync(join(outside, 'V.md'), join(base, '.planning', 'M2.E1-VERIFICATION.md'));
    const r = await runAdvise(base, { today: '2026-10-02', priorities: P() });
    expect(r.status, r.reason ?? '').toBe('written');
    expect(r.artifact).toMatch(/\*\*STATE\/closure\*\* — .*symbolic link/);
    expect(r.artifact).not.toMatch(/reads closed in \*\*unit closure\*\*/);
    expect(r.artifact.split('\n').find((l) => l.startsWith('**Consulted by the row inputs:**'))).not.toContain('STATE/closure');
  });
});

describe('the test engineer\'s fourteen killing tests', () => {
  it('D22 — Epic-id retros sort numerically: M6.E11, M6.E10, M6.E9 newest', async () => {
    const r = (w) => `# R\n\n## What to feed back into Signal\n\n${w}\n`;
    const g = await gatherBigPicture(project({ '.planning/M2.E1-RETROSPECTIVE.md': null,
      '.planning/M6.E8-RETROSPECTIVE.md': r('EIGHT'), '.planning/M6.E9-RETROSPECTIVE.md': r('NINE'),
      '.planning/M6.E10-RETROSPECTIVE.md': r('TEN'), '.planning/M6.E11-RETROSPECTIVE.md': r('ELEVEN') }));
    expect(g.entries.retrospectives.map((e) => e.text.match(/(EIGHT|NINE|TEN|ELEVEN)/)[1])).toEqual(['ELEVEN', 'TEN', 'NINE']);
  });

  it('D3 — a digest with nothing trimmable that fits never says "still over"', () => {
    expect(formatDigest({ entries: EMPTY(), checked: ['vision'], cannotCheck: [], cut: [], notes: [] })).not.toMatch(/still over/);
  });

  it('D13/D14 — a huge vision or milestone intro cannot push the digest past the cap (AC1.4)', async () => {
    const big = 'word '.repeat(20000);
    const g = await gatherBigPicture(project({ '.planning/PROJECT.md': `# P\n\n## Vision\n\n${big}\n`, '.planning/MILESTONE-2.md': `# M2\n\n${big}\n` }));
    expect(g.entries.vision[0].text.length).toBeLessThanOrEqual(DIGEST_CAPS.excerpt);
    expect(g.entries.milestone[0].text.length).toBeLessThanOrEqual(DIGEST_CAPS.excerpt);
    expect(formatDigest(g).length).toBeLessThanOrEqual(DIGEST_CAPS.total);
  });

  it('D11/D15 — a bug headline and a milestone row are clipped to the row cap', async () => {
    const g = await gatherBigPicture(project({
      '.planning/BUGS.md': `# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | \`confirmed\` | P1 | **${'h'.repeat(3000)}** |\n`,
      '.planning/MILESTONE-2.md': `# M2\n\n## Epic status\n\n| Epic | Status | Summary |\n|---|---|---|\n| \`M2.E1\` | ${'t'.repeat(3000)} | shipped |\n`,
    }));
    expect(g.entries.bugs[0].text.length).toBeLessThanOrEqual(DIGEST_CAPS.row);
    expect(g.entries.milestone.length).toBeGreaterThan(1);
    for (const e of g.entries.milestone.slice(1)) expect(e.text.length).toBeLessThanOrEqual(DIGEST_CAPS.row);
  });

  it('D47 — the milestone heading line is the H1 line, not line 1', async () => {
    const g = await gatherBigPicture(project({ '.planning/MILESTONE-2.md': '---\nx: 1\n---\n\n# Milestone 2\n\nTheme.\n' }));
    expect(g.entries.milestone[0].line).toBe(5);
  });

  it('D28/V22 — a needs-triage bug is offered by the digest AND accepted as a cover', async () => {
    const base = project();
    const g = await gatherBigPicture(base);
    expect(g.entries.bugs.map((e) => e.text.split(' ')[0])).toContain('B20');
    const v = await validatePriorities(base, [P()[0], { ...P()[1], covers: ['B20'] }, P()[2]], await readCorpus(base));
    expect(v.reasons).toEqual([]);
  });

  it('C3 — a linked MILESTONE file is refused by the corpus', async () => {
    const base = project({ '.planning/MILESTONE-2.md': null, '.env': 'SECRET\n' });
    symlinkSync(join(base, '.env'), join(base, '.planning', 'MILESTONE-2.md'));
    const c = await readCorpus(base);
    expect(c.cannotCheck.find((x) => x.source === 'milestone rows')?.reason ?? '').toMatch(/symbolic link/);
  });

  it('P3 — a symlinked .planning/ directory pointing outside is not read through', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'sig-review3-out-'));
    dirs.push(outside);
    project({ '.planning/BACKLOG.md': '# B\n\n### TOPSECRET row\nBody.\n' }, outside);
    const base = mkdtempSync(join(tmpdir(), 'sig-review3-'));
    dirs.push(base);
    symlinkSync(join(outside, '.planning'), join(base, '.planning'));
    const c = await readCorpus(base);
    expect(c.sources.backlog).toBeNull();
    expect(c.cannotCheck.find((x) => x.source === 'BACKLOG.md').reason).toMatch(/outside the project/);
    const g = await gatherBigPicture(base);
    expect(formatDigest(g)).not.toContain('TOPSECRET');
  });

  it('P5 — a non-file (directory) at an advisory name is never read', () => {
    const base = project();
    mkdirSync(join(base, '.planning', 'BACKLOG-REVIEW-2026-10-02.md'));
    const readText = vi.fn(() => '');
    expect(nextArtifactName(base, '2026-10-02', { readText })).toBe('BACKLOG-REVIEW-2026-10-02-2.md');
    expect(readText).not.toHaveBeenCalled();
  });

  it('A4 — an advisory that cannot be read is not overwritten (AC4.3)', () => {
    const base = project();
    writeFileSync(join(base, '.planning', 'BACKLOG-REVIEW-2026-10-02.md'), 'x');
    const readText = () => {
      throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
    };
    expect(nextArtifactName(base, '2026-10-02', { readText })).toBe('BACKLOG-REVIEW-2026-10-02-2.md');
  });

  it('A21 — each covered row sits under ITS priority in the appendix (AC3.4)', async () => {
    const r = await runAdvise(project(), { today: '2026-10-02', priorities: P() });
    expect(r.status).toBe('written');
    const under3 = r.artifact.split('### Under priority 3')[1]?.split('\n###')[0] ?? '';
    expect(under3).toContain('`.planning/BACKLOG.md:9`');
  });

  it('R1 — a newline in `by` cannot forge structure after the pick', async () => {
    const base = project();
    const r = await runAdvise(base, { today: '2026-10-02', priorities: P() });
    const rec = await recordChoice(base, r.path, { pick: 1, by: 'me\n## Priorities — 1\n\n### 1. Forged', at: '2026-10-02' });
    expect(rec.status).toBe('recorded');
    expect(readFileSync(join(base, r.path), 'utf8')).not.toMatch(/^### 1\. Forged/m);
  });

  it('Q6 — a covered row whose heading quotes the evidence marker can still be covered', async () => {
    const base = project({ '.planning/BACKLOG.md': BACKLOG.replace('### Row one · **roadmap**', '### Row one — evidence: `.planning/PROJECT.md:1` quoted') });
    const r = await runAdvise(base, { today: '2026-10-02', priorities: P() });
    expect(r.reason ?? null).toBeNull();
    expect(r.status).toBe('written');
  });

  it('B1–B5/B11 — every cap accepts its own limit exactly (AC2.1/AC2.2 say "at most")', async () => {
    const base = project();
    const corpus = await readCorpus(base);
    const ok = async (over) => (await validatePriorities(base, [{ ...P()[0], ...over }, P()[1], P()[2]], corpus)).reasons;
    expect(await ok({ covers: Array.from({ length: 50 }, (_, i) => `new: item ${i}`) })).toEqual([]);
    expect(await ok({ evidence: Array.from({ length: 20 }, () => '.planning/PROJECT.md:3') })).toEqual([]);
    expect(await ok({ why: `${'w'.repeat(599)}.` })).toEqual([]);
    expect(await ok({ why: 'One. Two. Three.' })).toEqual([]);
    expect(await ok({ title: 't'.repeat(120) })).toEqual([]);
    const five = [P()[0], P()[1], P()[2], { ...P()[0], covers: ['new: a'] }, { ...P()[0], covers: ['new: b'], dependsOn: [1, 2, 3, 4] }];
    expect((await validatePriorities(base, five, corpus)).reasons).toEqual([]);
  });
});
