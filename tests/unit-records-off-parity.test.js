// M6.E16 VERIFY loop 1 — a project with the work store on and NO `work/units/`
// against `v0.1.50` (AC6.4 as amended at VERIFY, `D-M6E16-20`).
// See .planning/M6.E16-VALIDATION.md row AC6.4.
//
// AC6.4 says such a project gets the same answers, the same refusals and the
// same file moves as on `v0.1.50`, and names FOUR differences it accepts. This
// file pins both halves, so a fifth difference cannot arrive unnoticed:
//
//   1. `queueItem` with a unit name that is not an Epic ID is still refused
//      `SCHEMA`; the message's words changed.
//   2. `validateRecord` accepts an item event naming such a unit (`phase-11`);
//      on `v0.1.50` it returned one error. The requirements' Blast radius
//      declares this widening.
//   3. `buildArchiveReport` returns a new `settled` list and `counts.settled`,
//      both empty here; the printed report is the same text.
//   4. The sentence `/sig:docs-migrate`'s dry run prints for a closed unit it
//      does not move was reworded for every project: the old one was false
//      (t10.3, `SIG-289`).
//
// WHERE `V0150` CAME FROM. `tests/helpers/units-off-parity.js` builds one fixed
// project and asks the library about it; the library folder is its argument.
// It was run once against a checkout of `main` at a2f59eda (2026-10-12) —
// `v0.1.50` plus 11 fix-lane commits, none touching `plugin/tools/lib/`
// (`git diff v0.1.50 a2f59eda -- plugin/tools/lib` is empty) — and its output
// pasted below:
//
//   git worktree add --detach "$TMP/main-wt" origin/main
//   ln -s "$PWD/node_modules" "$TMP/main-wt/node_modules"
//   node probe.mjs "$TMP/main-wt/plugin/tools/lib"   # imports the helper from THIS checkout, calls
//                                                    # captureUnitsOff(argv[2]) and prints it as JSON
//   git worktree remove --force "$TMP/main-wt"
//
// Do not regenerate `V0150` from today's code: it would then move with the
// code, which is the one thing it must not do.

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';

import { captureUnitsOff } from './helpers/units-off-parity.js';

const LIB = fileURLToPath(new URL('../plugin/tools/lib', import.meta.url));

const EPIC_RULE = '^M\\d+(\\.\\d+)*\\.E\\d+$';

const V0150 = {
  queueNonEpic: {
    code: 'SCHEMA',
    message: `invalid work record: events[2].epic does not match ${EPIC_RULE} (got "phase-11")`,
  },
  queueNonEpicLeftItem: ['created', 'triaged'],
  queueEpic: null,
  validateNonEpic: [`events[2].epic does not match ${EPIC_RULE} (got "phase-11")`],
  validateBadName: true,
  closures: [['M9.E1', 'closed'], ['M9.E2', 'open'], ['M9.E9', 'open']],
  report: {
    plan: ['M9.E1'],
    moves: [
      ['.planning/M9.E1-PLAN.md', '.planning/archive/M9/E1/M9.E1-PLAN.md'],
      ['.planning/M9.E1-VERIFICATION.md', '.planning/archive/M9/E1/M9.E1-VERIFICATION.md'],
    ],
    refusals: ['M9.E2', 'M9.E9'],
    counts: { units: 3, archiving: 1, refused: 2, files: 2 },
  },
  printed: [
    '== Archive — dry run (nothing written) ==',
    '',
    'Would archive 2 file(s):',
    '  M9.E1  →  .planning/archive/M9/E1/  (2 files)',
    '      M9.E1-PLAN.md',
    '      M9.E1-VERIFICATION.md',
    '',
    'Not archived (2) — each was checked and declined:',
    '  M9.E2  [open]  M9.E2 has no terminal artifact — nothing claims it finished',
    '  M9.E9  [open]  M9.E9 is the current unit — mid-flight, not closed',
    '',
    'Ungrouped files: 6 (not part of any unit, never archived) —',
    '  BACKLOG.md, BUGS.md, ISSUES-INBOX.md, M9.E1-RETROSPECTIVE.md, OPEN-QUESTIONS.md, STATE.md',
    '  Retrospectives and project-level files stay in the root on purpose.',
    'Dropped: 0 — every derived unit was considered.',
    '',
    'Nothing was written. Re-run with --apply to move these files.',
  ],
  treeAfterApply: [
    '.planning/BACKLOG.md',
    '.planning/BUGS.md',
    '.planning/ISSUES-INBOX.md',
    '.planning/M9.E1-RETROSPECTIVE.md',
    '.planning/M9.E2-PLAN.md',
    '.planning/M9.E9-PLAN.md',
    '.planning/OPEN-QUESTIONS.md',
    '.planning/STATE.md',
    '.planning/archive/M9/E1/M9.E1-PLAN.md',
    '.planning/archive/M9/E1/M9.E1-VERIFICATION.md',
  ],
  gapSentence: [
    '  ↳ 1 unit(s) resolve as CLOSED, but this pass proposes no move for them.',
    '    Its closed-set comes from retrospectives; a unit closed by a passing verdict',
    '    with no retrospective is not reachable here. This is a gap, not a clean bill.',
  ],
};

// A capture with exactly the four accepted differences taken out. What is
// left must be `v0.1.50`'s, key for key.
const withoutTheFour = (capture) => {
  const out = structuredClone(capture);
  delete out.queueNonEpic.message; // 1
  delete out.validateNonEpic; // 2
  delete out.report.settled; // 3
  delete out.report.counts.settled; // 3
  delete out.gapSentence; // 4
  return out;
};

describe('store on, no work/units/: the same answers, refusals and moves as v0.1.50 (AC6.4)', async () => {
  const now = await captureUnitsOff(LIB);

  it('the closure answers equal v0.1.50\'s', () => {
    expect(now.closures).toEqual([['M9.E1', 'closed'], ['M9.E2', 'open'], ['M9.E9', 'open']]);
  });

  it('the archive plan, its refusals and every file move equal v0.1.50\'s', () => {
    expect(now.report.plan).toEqual(V0150.report.plan);
    expect(now.report.refusals).toEqual(V0150.report.refusals);
    expect(now.report.moves).toEqual(V0150.report.moves);
    expect(now.treeAfterApply).toEqual(V0150.treeAfterApply);
  });

  it('an Epic ID is still accepted by queueItem, and a name that could leave the folder is still not a valid record', () => {
    expect(now.queueEpic).toBeNull();
    expect(now.validateBadName).toBe(true);
  });

  it('with the four named differences taken out, everything captured equals v0.1.50 — a fifth difference fails here', () => {
    expect(withoutTheFour(now)).toEqual(withoutTheFour(V0150));
  });
});

describe('store on, no work/units/: the four differences from v0.1.50 that AC6.4 accepts, each exactly as named', async () => {
  const now = await captureUnitsOff(LIB);

  it('1 — queueItem with a unit name that is not an Epic ID: refused SCHEMA as on v0.1.50, nothing written, new words', () => {
    expect(now.queueNonEpic.code).toBe(V0150.queueNonEpic.code);
    expect(now.queueNonEpic.code).toBe('SCHEMA');
    expect(now.queueNonEpicLeftItem).toEqual(['created', 'triaged']);
    expect(now.queueNonEpic.message).toBe(`invalid work record: LEAF-1: epic does not match ${EPIC_RULE} (got "phase-11") — nothing was queued.`);
    expect(now.queueNonEpic.message).not.toBe(V0150.queueNonEpic.message);
  });

  it('2 — validateRecord accepts an item event naming phase-11; v0.1.50 returned one error', () => {
    expect(V0150.validateNonEpic).toHaveLength(1);
    expect(now.validateNonEpic).toEqual([]);
  });

  it('3 — buildArchiveReport has a settled list and count, both empty; the printed report is v0.1.50\'s text', () => {
    expect(V0150.report).not.toHaveProperty('settled');
    expect(now.report.settled).toEqual([]);
    expect(now.report.counts).toEqual({ ...V0150.report.counts, settled: 0 });
    expect(now.printed).toEqual(V0150.printed);
  });

  it('4 — the migrate dry run\'s sentence for a closed unit it does not move is the corrected one, not v0.1.50\'s', () => {
    expect(now.gapSentence).toEqual([
      '  ↳ 1 unit(s) resolve as CLOSED, but this pass proposes no move for them.',
      '    A unit is closed by a passing verdict here, and held back when its retrospective',
      '    still holds placeholders.',
      '    Check each one\'s retrospective. This is a gap, not a clean bill.',
    ]);
    expect(now.gapSentence).not.toEqual(V0150.gapSentence);
    expect(now.gapSentence.join('\n')).not.toMatch(/comes from retrospectives|unit record/);
  });
});
