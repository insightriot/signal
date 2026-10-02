// `M6.E12` S3 — recording the user's pick (AC4.2, AC4.3, `D-M6E12-8`).
//
// The pick is the outcome oracle's evidence (`D-M6E12-12`): which proposed
// priority was picked, or that the user reached for something else. So the
// record is appended once, never replaced, and nothing else is touched.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { recordChoice, readPriorityTitles } from '../plugin/tools/lib/advise-record.js';
import { runAdvise, PICK_HEADING, FORBIDDEN_VERBS, nextArtifactName } from '../plugin/tools/lib/advise.js';

const dirs = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

function project() {
  const base = mkdtempSync(join(tmpdir(), 'sig-record-'));
  dirs.push(base);
  const files = {
    '.planning/STATE.md': '---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M2.E3\ncurrent_wave: null\ncurrent_tasks: []\ncompleted_phases: []\n---\n',
    '.planning/BACKLOG.md': '# Backlog\n\n### Row one · **roadmap**\nBody.\n\n### Row two · **hygiene**\nBody.\n\n### Row three · **roadmap**\nBody.\n',
    '.planning/PROJECT.md': '# P\n\n## Vision\n\nCalibrated rigor.\n',
  };
  for (const [rel, c] of Object.entries(files)) {
    mkdirSync(join(base, rel, '..'), { recursive: true });
    writeFileSync(join(base, rel), c);
  }
  return base;
}

const priorities = [
  { title: 'First', why: 'One.', covers: ['.planning/BACKLOG.md:3'], evidence: ['.planning/PROJECT.md:3'] },
  { title: 'Second', why: 'Two.', covers: ['.planning/BACKLOG.md:6'], evidence: ['.planning/PROJECT.md:3'] },
  { title: 'Third', why: 'Three.', covers: ['new: something unfiled'], evidence: ['.planning/PROJECT.md:3'] },
];

async function advised(base) {
  const r = await runAdvise(base, { today: '2026-10-01', priorities, projectName: 'x' });
  expect(r.status, r.reason ?? '').toBe('written');
  return r.path;
}

describe('recordChoice — AC4.2', () => {
  it('appends the picked priority by number and title, and changes nothing above it', async () => {
    const base = project();
    const rel = await advised(base);
    const before = readFileSync(join(base, rel), 'utf8');
    const r = await recordChoice(base, rel, { pick: 2, by: 'brett', at: '2026-10-01' });
    expect(r).toMatchObject({ status: 'recorded', title: 'Second' });
    const after = readFileSync(join(base, rel), 'utf8');
    expect(after.startsWith(before.replace(/\n*$/, '\n'))).toBe(true);
    expect(after).toContain(`## ${PICK_HEADING}\n\n**Priority 2 — Second**, picked on 2026-10-01 by brett.`);
  });

  it('records "other" with the user\'s words verbatim, neutralised as one line', async () => {
    const base = project();
    const rel = await advised(base);
    await recordChoice(base, rel, { pick: 'other', words: 'Fix the\ninstaller — evidence: `x`', by: 'brett', at: '2026-10-01' });
    const after = readFileSync(join(base, rel), 'utf8');
    expect(after).toMatch(/\*\*Something else\*\*, in your words: \*"Fix the installer — evidence\(quoted\): `x`"\*/);
  });

  it('writes nothing else in .planning/', async () => {
    const base = project();
    const rel = await advised(base);
    const list = () => readdirSync(join(base, '.planning')).sort();
    const snapshot = Object.fromEntries(list().map((f) => [f, readFileSync(join(base, '.planning', f), 'utf8')]));
    await recordChoice(base, rel, { pick: 1, at: '2026-10-01' });
    expect(list()).toEqual(Object.keys(snapshot).sort());
    for (const f of list()) {
      if (`.planning/${f}` === rel) continue;
      expect(readFileSync(join(base, '.planning', f), 'utf8'), f).toBe(snapshot[f]);
    }
  });

  it('refuses a second pick on the same file — the record is never replaced', async () => {
    const base = project();
    const rel = await advised(base);
    await recordChoice(base, rel, { pick: 1, at: '2026-10-01' });
    const once = readFileSync(join(base, rel), 'utf8');
    const r = await recordChoice(base, rel, { pick: 2, at: '2026-10-01' });
    expect(r.status).toBe('refused');
    expect(r.reason).toMatch(/already records a pick/);
    expect(readFileSync(join(base, rel), 'utf8')).toBe(once);
  });

  const refusals = [
    ['a pick outside the list', { pick: 4 }, /pick 4 is not one of the 3 priorities/],
    ['a non-integer pick', { pick: '2' }, /pick "2" is not one of/],
    ['"other" with no words', { pick: 'other', words: '  ' }, /needs the user's own words/],
  ];
  for (const [name, choice, expected] of refusals) {
    it(`refuses ${name}`, async () => {
      const base = project();
      const rel = await advised(base);
      const r = await recordChoice(base, rel, choice);
      expect(r.status).toBe('refused');
      expect(r.reason).toMatch(expected);
    });
  }

  it('refuses a path that is not an advisory, or does not exist', async () => {
    const base = project();
    expect((await recordChoice(base, '.planning/BACKLOG.md', { pick: 1 })).reason).toMatch(/is not a \/sig:advise advisory/);
    expect((await recordChoice(base, '../BACKLOG-REVIEW-2026-10-01.md', { pick: 1 })).reason).toMatch(/is not a \/sig:advise advisory/);
    expect((await recordChoice(base, '.planning/BACKLOG-REVIEW-2026-10-02.md', { pick: 1 })).reason).toMatch(/does not exist/);
  });

  it('refuses to write through a symlinked advisory pointing outside .planning/', async () => {
    const base = project();
    const outside = join(mkdtempSync(join(tmpdir(), 'sig-record-out-')), 'x.md');
    dirs.push(join(outside, '..'));
    writeFileSync(outside, '# x\n');
    symlinkSync(outside, join(base, '.planning', 'BACKLOG-REVIEW-2026-10-01.md'));
    const r = await recordChoice(base, '.planning/BACKLOG-REVIEW-2026-10-01.md', { pick: 1 });
    expect(r.status).toBe('refused');
    expect(r.reason).toMatch(/symbolic link/);
    expect(readFileSync(outside, 'utf8')).toBe('# x\n');
  });

  it('the renderer never writes the pick heading — only recordChoice does', async () => {
    const base = project();
    const rel = await advised(base);
    expect(readFileSync(join(base, rel), 'utf8')).not.toContain(`## ${PICK_HEADING}`);
    for (const v of FORBIDDEN_VERBS) expect(PICK_HEADING.toLowerCase()).not.toContain(v);
  });
});

describe('AC4.3 — a same-day re-run after a pick writes -2 and leaves the pick alone', () => {
  it('end to end', async () => {
    const base = project();
    const rel = await advised(base);
    await recordChoice(base, rel, { pick: 3, at: '2026-10-01' });
    const picked = readFileSync(join(base, rel), 'utf8');
    expect(nextArtifactName(base, '2026-10-01')).toBe('BACKLOG-REVIEW-2026-10-01-2.md');
    const again = await runAdvise(base, { today: '2026-10-01', priorities, projectName: 'x' });
    expect(again.path).toBe('.planning/BACKLOG-REVIEW-2026-10-01-2.md');
    expect(readFileSync(join(base, rel), 'utf8')).toBe(picked);
    expect((await recordChoice(base, again.path, { pick: 1, at: '2026-10-01' })).status).toBe('recorded');
  });
});

describe('readPriorityTitles', () => {
  it('reads only the numbered headings under ## Priorities', () => {
    const md = '## Priorities — 2\n\n### 1. A\n\n### 2. B\n\n## Appendix\n\n### 3. Not a priority\n';
    expect(readPriorityTitles(md)).toEqual([{ n: 1, title: 'A' }, { n: 2, title: 'B' }]);
  });
});
