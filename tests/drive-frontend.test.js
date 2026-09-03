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
  resolveStartPhase,
  CANONICAL_PHASES,
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

describe('resolveStartPhase — where the chosen work starts', () => {
  // Found on the second real run (2026-09-03): the front end picked the work,
  // then steps 1-3 read `state.phase` and found `EXPLORING`. describeNextAction
  // returned recognized:false and there was no command to run AT ANY attention
  // level. Choosing the work and not placing it leaves the same dead end.
  const RESUME = { source: 'STATE.md (open Epic)' };
  const NEW = { source: 'BACKLOG.md' };

  it('resumes an open Epic at its recorded phase, writing nothing', () => {
    const r = resolveStartPhase({ phase: 'EXECUTE' }, RESUME);
    expect(r).toMatchObject({ phase: 'EXECUTE', changed: false, blocked: false });
  });

  it('starts NEW work at DISCUSS even when the recorded phase is valid', () => {
    // The recorded phase belongs to whatever ran last. Inheriting it is how fresh
    // work ends up resuming someone else's position.
    const r = resolveStartPhase({ phase: 'REVIEW' }, NEW);
    expect(r.phase).toBe('DISCUSS');
    expect(r.changed).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('places new work at DISCUSS when the recorded phase is not a phase at all', () => {
    const r = resolveStartPhase({ phase: 'EXPLORING' }, NEW);
    expect(r.phase).toBe('DISCUSS');
    expect(r.blocked).toBe(false);
    expect(r.why).toMatch(/EXPLORING/);
  });

  it('BLOCKS an open Epic whose recorded phase is unreadable, rather than restarting it', () => {
    // The one case data cannot settle: the Epic is mid-flight and the record of how
    // far it got is unreadable, so a silent restart at DISCUSS could discard
    // completed phases. It names the value and stops.
    const r = resolveStartPhase({ phase: 'EXPLORING' }, RESUME);
    expect(r.blocked).toBe(true);
    expect(r.why).toMatch(/EXPLORING/);
    expect(r.why).toMatch(/may discard completed phases/);
  });

  it('handles a missing phase without throwing', () => {
    expect(resolveStartPhase(null, NEW).phase).toBe('DISCUSS');
    expect(resolveStartPhase({}, NEW).blocked).toBe(false);
    expect(resolveStartPhase({ phase: null }, RESUME).blocked).toBe(true);
  });

  it('every phase it proposes is one the flow actually has', () => {
    for (const candidate of [RESUME, NEW, null]) {
      for (const phase of ['EXPLORING', 'EXECUTE', null, '']) {
        expect(CANONICAL_PHASES).toContain(resolveStartPhase({ phase }, candidate).phase);
      }
    }
  });
});

describe('CANONICAL_PHASES is the shared list, not a copy', () => {
  // Caught in review on PR #230. The first version duplicated the literal and
  // called state.js's list "private" — it is exported, and describeNextAction
  // validates against it. Two independent arrays drift the moment a phase is
  // renamed, and the two disagreeing about which phases are valid reintroduces
  // the `recognized: false` dead end this whole change exists to remove.
  it('is the same binding state.js exports, so the two cannot disagree', async () => {
    const state = await import('../plugin/tools/lib/state.js');
    expect(CANONICAL_PHASES).toBe(state.PHASES);
  });
});
