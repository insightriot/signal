// M6.E16 VERIFY loops 1 and 2 — a project with the work store on and NO
// `work/units/`, against `v0.1.50` (AC6.4 as amended, `D-M6E16-20`).
// See .planning/M6.E16-VALIDATION.md row AC6.4.
//
// AC6.4 says what is identical to `v0.1.50` for such a project, and what
// differs, BY KIND. This file holds both halves:
//
//   - the catch-all: every answer captured below, with ONLY the kinds of
//     difference AC6.4 names taken out, equals `v0.1.50`'s. A difference of
//     any other kind, in any function the capture calls, fails there;
//   - each named kind, pinned as it stands today.
//
// WHAT IS CAPTURED. `tests/helpers/units-off-parity.js` builds four fixed
// projects and captures 72 answers about them (70 library calls, and 2
// listings of the files on disk): the edit hook on a path of
// each kind; the item schema, the item readers and the item writers with an
// Epic ID, a name that is not one, and a name over 100 characters; the item
// readers over a record placed on disk by hand; the closure readers; the
// archive plan, report, apply and the files it moved; the migration's dry run.
// Loop 1's capture asked five functions, and loop 2 found five differences in
// functions it did not ask.
//
// WHERE `V0150` CAME FROM (`tests/fixtures/units-off-parity/v0.1.50.json`).
// The helper takes the library folder as its argument. It was run once
// against a checkout of `main` at a2f59eda (2026-10-12) — `v0.1.50` plus 11
// fix-lane commits, none touching `plugin/tools/lib/`
// (`git diff v0.1.50 a2f59eda -- plugin/tools/lib` is empty) — and its output
// written to that file:
//
//   git worktree add --detach "$TMP/main-wt" origin/main
//   ln -s "$PWD/node_modules" "$TMP/main-wt/node_modules"
//   node probe.mjs "$PWD/tests/helpers/units-off-parity.js" "$TMP/main-wt/plugin/tools/lib" \
//     > tests/fixtures/units-off-parity/v0.1.50.json
//       # probe.mjs: imports the helper named first (THIS checkout's), calls
//       # captureUnitsOff(<the folder named second>) and prints it as JSON
//   git worktree remove --force "$TMP/main-wt" && git worktree prune
//
// Do not regenerate that file from today's code: it would then move with the
// code, which is the one thing it must not do.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { captureUnitsOff, LONG_EPIC, NOT_EPICS } from './helpers/units-off-parity.js';

const LIB = fileURLToPath(new URL('../plugin/tools/lib', import.meta.url));
const V0150 = JSON.parse(readFileSync(new URL('./fixtures/units-off-parity/v0.1.50.json', import.meta.url), 'utf-8'));

const EPIC_RULE = '^M\\d+(\\.\\d+)*\\.E\\d+$';

// Every `message` key, at any depth, removed.
function withoutMessages(value) {
  if (Array.isArray(value)) return value.map(withoutMessages);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'message').map(([k, v]) => [k, withoutMessages(v)]));
}

// A capture with the differences AC6.4 names — and no other — taken out. One
// line per clause of the criterion; what is left must be `v0.1.50`'s, key for
// key. Each thing removed here is pinned, as it stands today, further down.
const withoutTheNamedKinds = (capture) => {
  const out = structuredClone(capture);

  // (a) what this Epic adds
  delete out['hook.unitRecord']; // the edit hook guards `work/units/` paths, folder or not (AC2.2)
  delete out['migrate.dryRun']; // the dry run on a store-on project proposes unit records (AC9.2)…
  delete out['migrate.applyWithoutHash']; // …so its apply is refused for the missing hash, not for the store being there
  delete out.senseArchiveTree.held; // a new key, empty without unit records
  delete out['archive.report'].settled; // a new key, empty without unit records
  delete out['archive.report'].counts.settled; // a new key, 0 without unit records

  // (b) the unit-name rule
  for (const name of NOT_EPICS) delete out[`validate.notEpic.${name}`]; // the item schema accepts any safe unit name
  for (const key of Object.keys(out)) {
    if (key === 'validate.long' || key.startsWith('long.')) delete out[key]; // a name over 100 characters is refused everywhere
  }

  // (c) wording
  delete out.gapSentence; // the one false sentence, corrected in t10.3
  return withoutMessages(out); // the text of a refusal or a finding; its code, ID and path stay
};

// One capture of today's code, for every case below.
const now = await captureUnitsOff(LIB);

const refusedKeys = (capture) => Object.keys(capture).filter((k) => capture[k]?.refused === true);

describe('store on, no work/units/: with only the kinds of difference AC6.4 names taken out, everything equals v0.1.50', () => {
  it('the capture takes the same 72 answers today as it took against v0.1.50', () => {
    expect(now.calls).toBe(72);
    expect(V0150.calls).toBe(72);
    expect(Object.keys(now)).toEqual(Object.keys(V0150));
  });

  it('the catch-all — a difference of any kind AC6.4 does not name, in any of the 72 answers, fails here', () => {
    expect(withoutTheNamedKinds(now)).toEqual(withoutTheNamedKinds(V0150));
  });

  it('every closure answer equals v0.1.50\'s', () => {
    expect(now.closures).toEqual([['M9.E1', 'closed'], ['M9.E2', 'open'], ['M9.E9', 'open']]);
    for (const key of ['closures', 'isEpicDone.M9.E1', 'isEpicDone.M9.E2', 'isEpicDone.M9.E9', 'isEpicArchived.M9.E3', 'isEpicArchived.M9.E2',
      'closeEpicCheck.M9.E2', 'migrateClosedUnits', 'nextEpicId', 'driftChecks', 'listClosing']) {
      expect(now[key], key).toEqual(V0150[key]);
    }
  });

  it('the archive plan, its refusals, every file move and the printed report equal v0.1.50\'s', () => {
    expect(now['archive.report'].plan).toEqual(V0150['archive.report'].plan);
    expect(now['archive.report'].refusals).toEqual(V0150['archive.report'].refusals);
    expect(now['archive.report'].moves).toEqual(V0150['archive.report'].moves);
    expect(now.senseArchiveTree.moves).toEqual(V0150.senseArchiveTree.moves);
    expect(now['archive.printed']).toEqual(V0150['archive.printed']);
    expect(now['archive.apply']).toEqual(V0150['archive.apply']);
    expect(now['a.treeAfterApply']).toEqual(V0150['a.treeAfterApply']);
    // …and the migration calls moved and wrote nothing, on either.
    expect(now['a.treeAfterMigrateCalls']).toEqual(V0150['a.treeAfterMigrateCalls']);
  });

  it('every item write and read of a record v0.1.50 accepted equals v0.1.50\'s', () => {
    for (const key of ['validate.epic', 'a.list', 'a.check', 'queue.epic', 'start.epic', 'reopen.inEpic', 'a.listAfterWrites',
      'a.checkAfterWrites', 'sweep']) {
      expect(now[key], key).toEqual(V0150[key]);
    }
    expect(now['queue.epic']).toEqual({ status: 'Q', epic: 'M9.E2' });
    expect(now['a.check']).toEqual([]);
  });

  it('every refusal v0.1.50 gave, for a call v0.1.50 had, is given today with the same code', () => {
    // The migration's two calls are clause (a): v0.1.50 had no units-only run to refuse or allow.
    const gave = refusedKeys(V0150).filter((k) => !k.startsWith('migrate.'));
    expect(gave.length).toBeGreaterThanOrEqual(20);
    for (const key of gave) {
      expect(now[key]?.refused, key).toBe(true);
      expect(now[key].code, key).toBe(V0150[key].code);
    }
    // A name that could leave the folder, a missing name and a name that is not text: refused as they were.
    expect(now['queue.leavesFolder'].code).toBe('SCHEMA');
    expect(now['queue.missing'].code).toBe('SCHEMA');
    expect(now['queue.notText'].code).toBe('SCHEMA');
    expect(now['validate.leavesFolder']).toBe(false);
    // An archived Epic: refused as it was, by the folder.
    expect(now['queue.archivedEpic'].code).toBe('CONFLICT');
    expect(now['start.archivedEpic'].code).toBe('CONFLICT');
    expect(now['reopen.inArchivedEpic'].code).toBe('CONFLICT');
  });

  it('the edit hook blocks an item record and a view, and allows a body and a planning document, as on v0.1.50', () => {
    for (const key of ['hook.itemRecord', 'hook.itemBody', 'hook.view', 'hook.epicsView', 'hook.planningDoc']) {
      expect(now[key].block, key).toBe(V0150[key].block);
    }
    expect(now['hook.itemRecord'].block).toBe(true);
    expect(now['hook.view'].block).toBe(true);
    expect(now['hook.itemBody'].block).toBe(false);
  });
});

describe('store on, no work/units/: (a) what this Epic adds', () => {
  it('the edit hook blocks a write to work/units/*.json though the folder does not exist; v0.1.50 allowed it (AC2.2)', () => {
    expect(V0150['hook.unitRecord']).toEqual({ block: false });
    expect(now['hook.unitRecord'].block).toBe(true);
    expect(now['hook.unitRecord'].message).toMatch(/unit record/);
    // Another file in that folder is not a record, and is not blocked.
    expect(now['hook.unitsFolderNote']).toEqual(V0150['hook.unitsFolderNote']);
    expect(now['hook.unitsFolderNote'].block).toBe(false);
  });

  it('the migration\'s dry run on a store-on project proposes unit records; v0.1.50 refused "already on the store" (AC9.2)', () => {
    expect(V0150['migrate.dryRun']).toMatchObject({ applied: false, refused: true, dryRun: false });
    expect(V0150['migrate.dryRun'].message).toMatch(/already on the store/);
    expect(now['migrate.dryRun']).toEqual({
      applied: false, refused: false, dryRun: true, unitsOnly: true, units: ['M9.E1', 'M9.E2', 'M9.E3', 'M9.E9'],
    });
    // Its apply without the dry run's hash is refused on both, and writes nothing on both.
    expect(V0150['migrate.applyWithoutHash']).toMatchObject({ applied: false, refused: true });
    expect(now['migrate.applyWithoutHash']).toMatchObject({ applied: false, refused: true });
    expect(now['migrate.applyWithoutHash'].message).toMatch(/expectedHash/);
  });

  it('return values gain keys that are empty without unit records: settled, counts.settled, held', () => {
    expect(V0150['archive.report']).not.toHaveProperty('settled');
    expect(now['archive.report'].settled).toEqual([]);
    expect(now['archive.report'].counts).toEqual({ ...V0150['archive.report'].counts, settled: 0 });
    expect(V0150.senseArchiveTree).not.toHaveProperty('held');
    expect(now.senseArchiveTree.held).toEqual([]);
  });
});

describe('store on, no work/units/: (b) the unit-name rule', () => {
  it('the item schema accepts an event naming any safe unit name; v0.1.50\'s accepted an Epic ID only', () => {
    for (const name of NOT_EPICS) {
      expect(V0150[`validate.notEpic.${name}`], name).toBe(false);
      expect(now[`validate.notEpic.${name}`], name).toBe(true);
    }
  });

  it('the writers still refuse each such name SCHEMA, and nothing is written', () => {
    for (const name of NOT_EPICS) {
      for (const verb of ['queue', 'start']) {
        const key = `${verb}.notEpic.${name}`;
        expect(V0150[key].code, key).toBe('SCHEMA');
        expect(now[key], key).toMatchObject({ refused: true, code: 'SCHEMA' });
        expect(now[key].message, key).toContain(`epic does not match ${EPIC_RULE} (got "${name}")`);
      }
    }
    // What the store holds after all of them is what v0.1.50's held: LEAF-1 and LEAF-4 were never queued or started.
    expect(now['a.listAfterWrites']).toEqual(V0150['a.listAfterWrites']);
    expect(now['a.listAfterWrites'].records.filter(([id]) => id === 'LEAF-1' || id === 'LEAF-4')).toEqual([['LEAF-1', 'T', null], ['LEAF-4', 'T', null]]);
  });

  it('the readers still refuse a record placed by hand that names one (v2.1): the same codes, IDs and paths as v0.1.50, with nothing taken out but the words', () => {
    const keys = Object.keys(V0150).filter((k) => k.startsWith('byHand.notEpic.'));
    expect(keys).toHaveLength(7);
    for (const key of keys) expect(withoutMessages(now[key]), key).toEqual(withoutMessages(V0150[key]));
    expect(now['byHand.notEpic.list'].broken.map((b) => [b.id, b.code])).toEqual([['LEAF-2', 'invalid']]);
    expect(now['byHand.notEpic.list'].records.map(([id]) => id)).toEqual(['LEAF-1', 'LEAF-3']);
    expect(now['byHand.notEpic.check'].map((f) => [f.code, f.id])).toEqual([['invalid', 'LEAF-2'], ['view-stale', null]]);
    expect(now['byHand.notEpic.get']).toMatchObject({ refused: true, code: 'SCHEMA' });
    // The words: v0.1.50's, then why.
    const was = V0150['byHand.notEpic.get'].message;
    expect(now['byHand.notEpic.get'].message.startsWith(was)).toBe(true);
    expect(now['byHand.notEpic.get'].message).toMatch(/no unit records/);
    expect(now['byHand.notEpic.list'].broken[0].message.startsWith(V0150['byHand.notEpic.list'].broken[0].message)).toBe(true);
  });

  it('a name over 100 characters is refused everywhere; v0.1.50 accepted one shaped like an Epic ID', () => {
    expect(LONG_EPIC.length).toBeGreaterThan(100);
    expect(V0150['validate.long']).toBe(true);
    expect(V0150['long.queue']).toEqual({ status: 'Q', epic: LONG_EPIC });
    expect(V0150['long.start']).toEqual({ status: 'P', epic: LONG_EPIC });
    expect(V0150['long.byHand.get']).toEqual({ status: 'C', epic: LONG_EPIC });

    expect(now['validate.long']).toBe(false);
    expect(now['long.queue']).toMatchObject({ refused: true, code: 'SCHEMA' });
    expect(now['long.start']).toMatchObject({ refused: true, code: 'SCHEMA' });
    expect(now['long.byHand.list'].broken.map((b) => [b.id, b.code])).toEqual([['LEAF-9', 'invalid']]);
    expect(now['long.byHand.list'].records).toEqual([['LEAF-1', 'T', null], ['LEAF-2', 'T', null], ['LEAF-3', 'Q', 'M9.E2']]);
    expect(now['long.byHand.check'].map((f) => [f.code, f.id])).toEqual([['invalid', 'LEAF-9'], ['view-stale', null]]);
    expect(now['long.byHand.get']).toMatchObject({ refused: true, code: 'SCHEMA' });
    expect(now['long.byHand.reopen']).toMatchObject({ refused: true, code: 'SCHEMA' });
  });
});

describe('store on, no work/units/: (c) wording', () => {
  it('a refusal\'s words may differ where its code does not: queueItem with a name that is not an Epic ID', () => {
    const was = V0150['queue.notEpic.phase-11'];
    const is = now['queue.notEpic.phase-11'];
    expect(is.code).toBe(was.code);
    expect(was.message).toBe(`invalid work record: events[2].epic does not match ${EPIC_RULE} (got "phase-11")`);
    expect(is.message).toBe(`invalid work record: LEAF-1: epic does not match ${EPIC_RULE} (got "phase-11") — nothing was queued.`);
  });

  it('the migrate dry run\'s sentence for a closed unit it does not move is the corrected one, and the rest of that report is v0.1.50\'s', () => {
    expect(V0150.gapSentence).toEqual([
      '  ↳ 1 unit(s) resolve as CLOSED, but this pass proposes no move for them.',
      '    Its closed-set comes from retrospectives; a unit closed by a passing verdict',
      '    with no retrospective is not reachable here. This is a gap, not a clean bill.',
    ]);
    expect(now.gapSentence).toEqual([
      '  ↳ 1 unit(s) resolve as CLOSED, but this pass proposes no move for them.',
      '    A unit is closed by a passing verdict here, and held back when its retrospective',
      '    still holds placeholders.',
      '    Check each one\'s retrospective. This is a gap, not a clean bill.',
    ]);
    expect(now.gapSentence.join('\n')).not.toMatch(/comes from retrospectives|unit record/);
    expect(now['b.dryRunWithoutTheSentence']).toEqual(V0150['b.dryRunWithoutTheSentence']);
    expect(now['b.dryRunWithoutTheSentence']).toContain('<the sentence>');
  });
});
