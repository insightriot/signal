// The `/sig:drive` front end — pick the work, then ask what the run needs.
//
// WHY THIS EXISTS. `/sig:drive` was run end-to-end for the first time on
// 2026-09-03 against a real project. It read the attention dial, read the queue,
// computed a correct verdict — and had no way to choose what to work on, no
// confirmation that it should run alone, and no pass that asks what it needs
// before starting. It began at whatever phase STATE.md happened to name.
//
// That is a stepper with an autopilot flag. These cover the three missing pieces.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  proposeEpicCandidates,
  collectPreflight,
  formatPreflight,
} from '../plugin/tools/lib/drive.js';

const FRONTMATTER = (over = {}) => {
  const f = {
    schema_version: 1,
    phase: 'DISCUSS',
    current_epic: 'null',
    current_wave: 'null',
    current_tasks: '[]',
    blockers: '[]',
    ...over,
  };
  const lines = Object.entries(f).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join('\n')}\ncompleted_phases:${f.__cp ?? ' []'}\n---\n# Project State\n\nbody\n`;
};

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'signal-drive-fe-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const writeState = (content) => writeFile(join(dir, '.planning', 'STATE.md'), content, 'utf-8');
const writePlanning = (name, content) =>
  writeFile(join(dir, '.planning', name), content, 'utf-8');

describe('proposeEpicCandidates — it proposes, it never picks', () => {
  it('puts an already-open Epic first: resume beats starting something new', async () => {
    await writeState(
      `---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: M9.E1\ncurrent_tasks: []\n` +
        `completed_phases:\n  - DISCUSS (2026-09-01)\n  - PLAN (2026-09-01)\nblockers: []\n---\n# S\n`,
    );
    await writePlanning('BACKLOG.md', '# Backlog\n\n## M9.E2 — something else\n\nbody\n');

    const { candidates } = await proposeEpicCandidates(dir);

    expect(candidates[0].id).toBe('M9.E1');
    expect(candidates[0].source).toContain('STATE.md');
    expect(candidates[0].why).toMatch(/finish it before starting new work/);
    // The backlog row is still offered — proposing is not the same as deciding.
    expect(candidates.map((c) => c.id)).toContain('M9.E2');
  });

  it('does not propose an Epic that already shipped', async () => {
    await writeState(
      `---\nschema_version: 1\nphase: SHIP\ncurrent_epic: M9.E1\ncurrent_tasks: []\n` +
        `completed_phases:\n  - DISCUSS (2026-09-01)\n  - SHIP (2026-09-02)\nblockers: []\n---\n# S\n`,
    );
    const { candidates } = await proposeEpicCandidates(dir);
    expect(candidates.find((c) => c.source.includes('STATE.md'))).toBeUndefined();
  });

  it('sees rows nested at #### — "no candidates" must mean no work, not an unseen depth', async () => {
    await writeState(FRONTMATTER());
    await writePlanning(
      'BACKLOG.md',
      '# Backlog\n\n## Promoted\n\n### Sprint one\n\n#### M9.E7 — a row nested under its section\n\nbody\n',
    );

    const { candidates } = await proposeEpicCandidates(dir);

    // RED before the maxDepth widening: parseBacklogRows matched `^(#{2,3})\s`
    // and Signal's own promoted rows sit at ####, so this returned zero.
    expect(candidates.map((c) => c.id)).toContain('M9.E7');
  });

  it('skips rows already struck as done', async () => {
    await writeState(FRONTMATTER());
    await writePlanning(
      'BACKLOG.md',
      '# Backlog\n\n## ~~M9.E3 — shipped~~ · **DONE — v0.1.9, 2026-08-01**\n\nb\n\n## M9.E4 — open\n\nb\n',
    );
    const { candidates } = await proposeEpicCandidates(dir);
    expect(candidates.map((c) => c.id)).toEqual(['M9.E4']);
  });

  it('ranks work rows above prose sections — and keeps the sections rather than filtering them', async () => {
    await writeState(FRONTMATTER());
    await writePlanning(
      'BACKLOG.md',
      '# Backlog\n\n' +
        '## Since the snapshot — what shipped (reconciliation, 2026-07-19)\n\nprose\n\n' +
        '## A real row · **roadmap** · medium · **filed 2026-09-01**\n\nbody\n\n' +
        '## M9.E9 — an identified unit of work\n\nbody\n',
    );

    const { candidates } = await proposeEpicCandidates(dir);
    const titles = candidates.map((c) => c.title);

    // The identified row outranks the tagged row, which outranks the prose section.
    expect(titles[0]).toMatch(/M9\.E9/);
    expect(titles[1]).toMatch(/A real row/);
    // RANKED, NOT FILTERED: the reconciliation heading is still offered, last.
    // A convention-based guess may cost a position; it must never delete a row.
    expect(titles.some((t) => /Since the snapshot/.test(t))).toBe(true);
    expect(titles.indexOf(titles.find((t) => /Since the snapshot/.test(t)))).toBe(titles.length - 1);
  });

  it('a missing BACKLOG is reported as could-not-check, never as an empty queue', async () => {
    await writeState(FRONTMATTER());
    const { candidates, cannotCheck } = await proposeEpicCandidates(dir);
    expect(candidates).toEqual([]);
    expect(cannotCheck.map((c) => c.source)).toContain('BACKLOG.md');
  });
});

describe('collectPreflight — what the run needs BEFORE it starts', () => {
  it('surfaces an unanswered parked decision', async () => {
    await writeState(FRONTMATTER());
    await writePlanning(
      'DECISION-QUEUE.md',
      '# Decision queue\n\n---\n\n## Q1 — Which storage backend?\n\n**Answer:** _(unanswered)_\n',
    );
    const r = await collectPreflight(dir, { epic: 'M9.E1' });
    expect(r.blocking.some((b) => b.question === 'Which storage backend?')).toBe(true);
  });

  it('surfaces a recorded blocker', async () => {
    await writeState(
      `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M9.E1\ncurrent_tasks: []\n` +
        `completed_phases: []\nblockers:\n  - id: BL1\n    text: needs an API key\n---\n# S\n`,
    );
    const r = await collectPreflight(dir, { epic: 'M9.E1' });
    expect(r.blocking.some((b) => b.question.includes('needs an API key'))).toBe(true);
  });

  it('surfaces open questions naming this Epic and ignores ones that do not', async () => {
    await writeState(FRONTMATTER());
    await writePlanning(
      'OPEN-QUESTIONS.md',
      '# Open\n\n## Should M9.E1 use a queue?\n\nbody\n\n## Unrelated project question\n\nbody\n' +
        '## ~~Answered thing about M9.E1~~\n\nbody\n',
    );
    const r = await collectPreflight(dir, { epic: 'M9.E1' });
    const qs = r.blocking.map((b) => b.question);
    expect(qs).toContain('Should M9.E1 use a queue?');
    expect(qs).not.toContain('Unrelated project question');
    // Struck heading = answered; it must not be re-asked.
    expect(qs.some((q) => q.includes('Answered thing'))).toBe(false);
  });

  it('surfaces unfilled markers in the Epic requirements', async () => {
    await writeState(FRONTMATTER());
    await writePlanning('M9.E1-REQUIREMENTS.md', '# Req\n\nFR1: [FILL IN — the retry policy]\n');
    const r = await collectPreflight(dir, { epic: 'M9.E1' });
    expect(r.blocking.some((b) => /unfilled marker/.test(b.question))).toBe(true);
  });

  it('a source it could not read lands in cannotCheck and NOT in an empty blocking list', async () => {
    await writeState(FRONTMATTER());
    // No REQUIREMENTS file for the named Epic: the spec cannot be checked for gaps.
    const r = await collectPreflight(dir, { epic: 'M9.E1' });

    expect(r.blocking).toEqual([]);
    expect(r.cannotCheck.map((c) => c.source)).toContain('REQUIREMENTS unfilled markers');

    // The rendering must not let "could not look" read as "nothing found".
    const text = formatPreflight(r);
    expect(text).toMatch(/COULD NOT BE CHECKED/);
    expect(text).toMatch(/this is not "nothing found"/);
  });

  it('says plainly when it checked and found nothing', async () => {
    await writeState(FRONTMATTER());
    await writePlanning('M9.E1-REQUIREMENTS.md', '# Req\n\nFR1: a complete requirement.\n');
    const r = await collectPreflight(dir, { epic: 'M9.E1' });
    expect(r.blocking).toEqual([]);
    expect(formatPreflight(r)).toMatch(/^Nothing blocking — checked \d+ source\(s\)\./m);
  });
});
