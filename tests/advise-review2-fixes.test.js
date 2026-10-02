// `M6.E12` REVIEW pass 2 — one test per finding, written to FAIL before its fix.
//
// Pass 2 reviewed pass 1's fixes. Three of its ten Important findings were
// introduced BY those fixes, and most of the rest were holes they closed only
// for the route the first reviewer happened to try. So these tests pin classes,
// not instances: every source, every route, both directions of an equality.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runAdvise, prepareAdvise, nextArtifactName, renderArtifact, hasPick, quoteSafe, writeArtifact } from '../plugin/tools/lib/advise.js';
import { recordChoice } from '../plugin/tools/lib/advise-record.js';
import { validatePriorities } from '../plugin/tools/lib/advise-priorities.js';
import { gatherBigPicture, formatDigest, DIGEST_CAPS, TRIM_ORDER } from '../plugin/tools/lib/advise-digest.js';
import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

const STATE = (over = '') =>
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M2.E3\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\n${over}---\n`;
const BACKLOG = '# Backlog\n\n### Row one · **roadmap**\nBody.\n\n### R2 — Parked — watchlist *(not sprint material)*\nBody.\n\n### Row three · **roadmap**\nBody.\n';
const BUGS = '# Bugs\n\n| ID | Status | Pri | What |\n|---|---|---|---|\n| B1 | `confirmed` | P1 | **one** |\n| B12 | `confirmed` | P2 | **twelve** |\n';

function project(extra = {}) {
  const base = mkdtempSync(join(tmpdir(), 'sig-review2-'));
  dirs.push(base);
  const files = {
    '.planning/STATE.md': STATE(),
    '.planning/BACKLOG.md': BACKLOG,
    '.planning/BUGS.md': BUGS,
    '.planning/PROJECT.md': '# P\n\n## Vision\n\nCalibrated rigor.\n',
    '.planning/MILESTONE-2.md': '# Milestone 2 — reliability\n\nTheme.\n\n## Epic status\n\n| Epic | Status | Summary |\n|---|---|---|\n| `M2.E1` | **shipped** | First |\n',
    '.planning/OPEN-QUESTIONS.md': '# Q\n\n## Q1 — fail closed?\n',
    '.planning/ISSUES-INBOX.md': '# Inbox\n\n## one\n',
    '.planning/M2.E1-RETROSPECTIVE.md': '# R\n\n## What to feed back into Signal\n\nCheck the counts.\n',
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

describe('Important 1 — the digest offers only what the gate accepts, and a refusal says why', () => {
  it('prepareAdvise lists live rows only, and counts the dropped ones in the cut note', async () => {
    const { digest, digestText } = await prepareAdvise(project());
    expect(digest.entries.backlog.map((e) => e.line)).toEqual([3, 9]);
    expect(digestText).not.toContain('Parked');
    expect(digestText).toMatch(/1 backlog row\(s\) dropped .* not shown — they cannot be covered/);
  });

  it('a cover on a dropped row is refused NAMING the input that dropped it', async () => {
    const r = await runAdvise(project(), { today: '2026-10-02', priorities: P([{ covers: ['.planning/BACKLOG.md:6'] }]) });
    expect(r.reasons.join('\n')).toMatch(/BACKLOG\.md:6 is dropped from the appendix — self-declared: `Parked`/);
  });
});

describe('Important 2 — "still over the cap" only when it is', () => {
  it('a digest under the cap, with empty sources, carries no such line', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => `### Row ${i} · **roadmap** · ${'x'.repeat(110)}\nBody.\n`).join('\n');
    const base = project({ '.planning/BACKLOG.md': `# B\n\n${rows}`, '.planning/OPEN-QUESTIONS.md': '# Q\n', '.planning/ISSUES-INBOX.md': '# I\n' });
    const text = formatDigest(await gatherBigPicture(base));
    expect(text.length).toBeLessThanOrEqual(DIGEST_CAPS.total);
    expect(text).not.toMatch(/still over the cap/);
  });

  it('says so when every trimmable group is empty and it still does not fit', async () => {
    const corpus = await readCorpus(project());
    corpus.sources.otherBranches = {
      open: Array.from({ length: 400 }, (_, i) => ({ epic: `M9.E${i}`, phase: 'DISCUSS', branches: [`feat/${'b'.repeat(150)}${i}`] })),
      unclassified: [],
      unreadable: [],
    };
    const text = formatDigest(await gatherBigPicture(project(), { corpus }));
    expect(text).toMatch(/still over the cap after every trim/);
  });
});

describe('Important 3 — no planning source may be a symlink, even to a file inside the project', () => {
  const sources = [
    ['vision', '.planning/PROJECT.md'],
    ['milestone', '.planning/MILESTONE-2.md'],
    ['open questions', '.planning/OPEN-QUESTIONS.md'],
    ['inbox', '.planning/ISSUES-INBOX.md'],
  ];
  for (const [source, rel] of sources) {
    it(`${source}: a link to ../.env is refused and the secret never reaches the digest`, async () => {
      const base = project({ [rel]: null, '.env': 'TYPESAFE_API_KEY=TOPSECRET123\n' });
      symlinkSync(join(base, '.env'), join(base, rel));
      const { digest, digestText } = await prepareAdvise(base);
      expect(digestText).not.toContain('TOPSECRET123');
      expect(digest.cannotCheck.find((c) => c.source === source)?.reason).toMatch(/symbolic link/);
    });
  }

  it('retrospectives: a linked retro is skipped by name; the real one is still read', async () => {
    const base = project({ '.env': 'TOPSECRET123\n' });
    symlinkSync(join(base, '.env'), join(base, '.planning', 'M2.E2-RETROSPECTIVE.md'));
    const g = await gatherBigPicture(base);
    expect(g.checked).toContain('retrospectives');
    expect(formatDigest(g)).not.toContain('TOPSECRET123');
    expect(g.cut.join(' ')).toMatch(/M2\.E2-RETROSPECTIVE\.md not read — .*symbolic link/);
  });

  for (const rel of ['.planning/BACKLOG.md', '.planning/BUGS.md']) {
    it(`corpus ${rel}: a link inside the project is refused`, async () => {
      const base = project({ [rel]: null, '.env': '### TOPSECRET123\n| B9 | `confirmed` | P1 | **TOPSECRET123** |\n' });
      symlinkSync(join(base, '.env'), join(base, rel));
      const corpus = await readCorpus(base);
      expect(corpus.cannotCheck.find((c) => c.source === rel.split('/')[1]).reason).toMatch(/symbolic link/);
    });
  }

  it('a planning source that is a FIFO-like non-file (a directory) is refused, not read', async () => {
    const base = project({ '.planning/OPEN-QUESTIONS.md': null });
    mkdirSync(join(base, '.planning', 'OPEN-QUESTIONS.md'));
    const g = await gatherBigPicture(base);
    expect(g.cannotCheck.find((c) => c.source === 'open questions').reason).toMatch(/not a regular file/);
  });
});

describe('Important 4 — every digest entry and reason is clipped', () => {
  it('a 100 KB phase on another branch cannot blow the cap or empty the backlog', async () => {
    const corpus = await readCorpus(project());
    corpus.sources.otherBranches = { open: [{ epic: 'M9.E1', phase: 'P'.repeat(100000), branches: ['feat/evil'] }], unclassified: [], unreadable: [] };
    const g = await gatherBigPicture(project(), { corpus });
    const text = formatDigest(g);
    expect(text.length).toBeLessThanOrEqual(DIGEST_CAPS.total);
    expect(g.entries.backlog.length).toBeGreaterThan(0);
    expect(text).toContain('Row one');
  });

  it('a 200 KB cannot-check reason is clipped', () => {
    const text = formatDigest({ entries: Object.fromEntries(['vision', 'milestone', 'open Epics', 'bugs', 'backlog', 'retrospectives', 'open questions', 'inbox'].map((s) => [s, []])), checked: [], cannotCheck: [{ source: 'vision', reason: 'r'.repeat(200000) }], cut: [] });
    expect(text.length).toBeLessThanOrEqual(DIGEST_CAPS.total);
  });

  it('a long local phase is clipped too', async () => {
    const g = await gatherBigPicture(project({ '.planning/STATE.md': STATE().replace('phase: PLAN', `phase: ${'Q'.repeat(5000)}`) }));
    expect(g.entries['open Epics'][0].text.length).toBeLessThanOrEqual(DIGEST_CAPS.row);
  });
});

describe('Important 5 — no line-separator character can forge the pick heading', () => {
  for (const sep of [' ', ' ', '\u0085']) {
    it(`U+${sep.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} in a title is refused, and hasPick ignores it`, async () => {
      const base = project();
      const corpus = await readCorpus(base);
      const v = await validatePriorities(base, P([{ title: `Fix it${sep}## Picked by you` }]), corpus);
      expect(v.reasons.join('\n')).toMatch(/priority 1: title must be one line/);
      expect(hasPick(`# x\n\n### 1. Fix it${sep}## Picked by you\n`)).toBe(false);
      expect(quoteSafe(`a${sep}b`)).toBe('a b');
    });
  }

  it('hasPick reads only a whole line, tolerating CRLF and trailing spaces', () => {
    expect(hasPick('x\n## Picked by you\n')).toBe(true);
    expect(hasPick('x\r\n## Picked by you\r\n')).toBe(true);
    expect(hasPick('x\n## Picked by you   \n')).toBe(true);
    expect(hasPick('x\n- **row about ## Picked by you**\n')).toBe(false);
  });
});

describe('Important 6 — STATE.md is not read through a symlink by this flow', () => {
  it('a linked STATE.md is cannot-check in the corpus and in the digest, and its text never appears', async () => {
    const outside = mkdtempSync(join(tmpdir(), 'sig-review2-out-'));
    dirs.push(outside);
    writeFileSync(join(outside, 'STATE.md'), STATE().replace('phase: PLAN', 'phase: TOPSECRET_9f3a'));
    const base = project({ '.planning/STATE.md': null });
    symlinkSync(join(outside, 'STATE.md'), join(base, '.planning', 'STATE.md'));
    const { corpus, digest, digestText } = await prepareAdvise(base);
    expect(corpus.cannotCheck.find((c) => c.source === 'STATE/closure').reason).toMatch(/symbolic link/);
    expect(digest.cannotCheck.find((c) => c.source === 'open Epics')?.reason ?? '').toMatch(/symbolic link/);
    expect(digestText).not.toContain('TOPSECRET_9f3a');
  });
});

describe('Important 7 — a non-regular file at an advisory name is never read', () => {
  it('nextArtifactName skips a symlinked advisory name instead of reading it', () => {
    const base = project();
    symlinkSync('/dev/zero', join(base, '.planning', 'BACKLOG-REVIEW-2026-10-02.md'));
    expect(nextArtifactName(base, '2026-10-02')).toBe('BACKLOG-REVIEW-2026-10-02-2.md');
  });

  it('writeArtifact refuses to replace a symlink', async () => {
    const base = project();
    symlinkSync('/dev/zero', join(base, '.planning', 'BACKLOG-REVIEW-2026-10-02.md'));
    const r = await writeArtifact(base, { name: 'BACKLOG-REVIEW-2026-10-02.md', content: 'x' });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/symbolic link/);
  });
});

describe('Important 8 — retrospectives named by other conventions sort as numbers', () => {
  it('phase-8 … phase-11 → the newest three are 11, 10, 9', async () => {
    const retro = (word) => `# R\n\n## What to feed back into Signal\n\n${word}\n`;
    const base = project({
      '.planning/M2.E1-RETROSPECTIVE.md': null,
      '.planning/phase-8-RETROSPECTIVE.md': retro('EIGHT'),
      '.planning/phase-9-RETROSPECTIVE.md': retro('NINE'),
      '.planning/phase-10-RETROSPECTIVE.md': retro('TEN'),
      '.planning/phase-11-RETROSPECTIVE.md': retro('ELEVEN'),
    });
    const g = await gatherBigPicture(base);
    expect(g.entries.retrospectives.map((e) => e.text.match(/(EIGHT|NINE|TEN|ELEVEN)/)[1])).toEqual(['ELEVEN', 'TEN', 'NINE']);
  });
});

describe('Important 9 — the gate is exact in BOTH directions', () => {
  it('one citation too many is refused, not only one too few', async () => {
    const base = project();
    const render = (args) => `${renderArtifact(args)}\n- extra claim — evidence: \`.planning/PROJECT.md:1\`\n`;
    const r = await runAdvise(base, { today: '2026-10-02', priorities: P(), render });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/citation check resolved \d+ citations for \d+ claim/);
  });
});

describe('Important 10 — gaps the pass-2 mutants found', () => {
  it('a shipped local Epic is not listed as open', async () => {
    const g = await gatherBigPicture(project({ '.planning/STATE.md': STATE().replace('completed_phases: []\n', 'completed_phases:\n  - SHIP (2026-10-01)\n') }));
    expect(g.entries['open Epics']).toEqual([]);
  });

  it('every cannot-check reason reaches the formatted digest', async () => {
    const g = await gatherBigPicture(project({ '.planning/OPEN-QUESTIONS.md': null, '.planning/ISSUES-INBOX.md': null }));
    const text = formatDigest(g);
    for (const c of g.cannotCheck) expect(text).toContain(`- **${c.source}** — ${c.reason}`);
  });

  it('TRIM_ORDER is exactly the decided order', () => {
    expect(TRIM_ORDER).toEqual(['retrospectives', 'low-priority bugs', 'open questions', 'backlog', 'high-priority bugs', 'milestone rows']);
  });

  it('the milestone heading cites its own line', async () => {
    const base = project();
    const g = await gatherBigPicture(base);
    const m = g.entries.milestone[0];
    expect(readFileSync(join(base, m.path), 'utf8').split('\n')[m.line - 1]).toMatch(/^# Milestone 2/);
  });

  it('retro sections and the question list are capped', async () => {
    const qs = Array.from({ length: 15 }, (_, i) => `## Q${i}\n`).join('\n');
    const g = await gatherBigPicture(project({
      '.planning/M2.E1-RETROSPECTIVE.md': `# R\n\n## What to feed back into Signal\n\n${'z'.repeat(5000)}\n`,
      '.planning/OPEN-QUESTIONS.md': `# Q\n\n${qs}`,
    }));
    expect(g.entries.retrospectives[0].text.length).toBeLessThanOrEqual(DIGEST_CAPS.retroSection);
    expect(g.entries['open questions']).toHaveLength(DIGEST_CAPS.questions);
    expect(g.cut.join(' ')).toMatch(/open questions: 10 of 15 shown/);
  });

  it('recordChoice records when the expected title matches', async () => {
    const base = project();
    const r = await runAdvise(base, { today: '2026-10-02', priorities: P() });
    expect((await recordChoice(base, r.path, { pick: 2, title: 'Second', at: '2026-10-02' })).status).toBe('recorded');
  });

  it('a dropped row that moved is caught by the stale guard', async () => {
    const base = project();
    const render = (args) => {
      // Change only the Parked (dropped) row's heading, in place — no other line moves.
      writeFileSync(join(base, '.planning', 'BACKLOG.md'), BACKLOG.replace('### R2 — Parked', '### XX — Parked'));
      return renderArtifact(args);
    };
    const r = await runAdvise(base, { today: '2026-10-02', priorities: [
      { title: 'A', why: 'One.', covers: ['B1'], evidence: ['.planning/PROJECT.md:3'] },
      { title: 'B', why: 'Two.', covers: ['B12'], evidence: ['.planning/PROJECT.md:3'] },
      { title: 'C', why: 'Three.', covers: ['new: x'], evidence: ['.planning/PROJECT.md:3'] },
    ], render });
    expect(r.status).toBe('skipped');
    expect(r.reason).toMatch(/BACKLOG\.md:6/);
  });

  it('covers allow a wide priority; evidence stays capped at 20', async () => {
    const base = project();
    const corpus = await readCorpus(base);
    const v = await validatePriorities(base, P([{ covers: Array.from({ length: 25 }, (_, i) => `new: item ${i}`) }]), corpus);
    expect(v.ok).toBe(true);
    const w = await validatePriorities(base, P([{ covers: Array.from({ length: 51 }, (_, i) => `new: item ${i}`) }]), corpus);
    expect(w.reasons.join('\n')).toMatch(/priority 1: 51 covers entries — at most 50/);
  });

  it('dependsOn and why are length-capped', async () => {
    const base = project();
    const corpus = await readCorpus(base);
    const v = await validatePriorities(base, P([{ dependsOn: Array.from({ length: 2000 }, () => 2), why: 'w'.repeat(700) + '.' }]), corpus);
    expect(v.reasons.join('\n')).toMatch(/priority 1: dependsOn lists 2000 entries — at most 4/);
    expect(v.reasons.join('\n')).toMatch(/priority 1: why is 701 characters — keep it under 600/);
    expect(v.reasons.length).toBeLessThan(10);
  });
});
