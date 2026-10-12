// M6.E16 VERIFY loops 1, 2 and 3 — a project with NO `work/units/`, against
// `v0.1.50` (AC6.4 as amended, `D-M6E16-20`).
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
// WHAT IS CAPTURED. `tests/helpers/units-off-parity.js` builds eight fixed
// projects and captures 94 answers about them (80 library calls, 6 listings
// of the files on disk, 3 `git status` listings and 5 readings of a `WORK.md`
// the library wrote): the edit hook on a path of
// each kind; the item schema, the item readers and the item writers with an
// Epic ID, a name that is not one, and a name over 100 characters; the item
// readers over a record placed on disk by hand; the closure readers; the
// archive plan, report, apply and the files it moved; the migration's dry run
// on a project already on the store; the first-time migration's dry run and
// apply on three projects with no store (one with `archive/epics/<ID>/`); a
// v1 store made into a v2 one; and the migrate command's flags.
// Loop 1's capture asked five functions, and loop 2 found five differences in
// functions it did not ask. Loop 2's 72 answers could not see the calls that
// turn a store on, where loop 3 found four more; the last 22 are those.
//
// MESSAGES. A message `v0.1.50` worded the same way is compared word for word.
// One worded differently is taken out of the catch-all (kind c), and a case
// below checks that every number, item ID, Epic ID, path and quoted name in
// `v0.1.50`'s words is still in today's. Which calls may be worded differently
// is a list (`REWORDED`), so a changed message anywhere else fails the catch-all.
//
// WHERE `V0150` CAME FROM (`tests/fixtures/units-off-parity/v0.1.50.json`).
// The helper takes the library folder as its argument. It was run
// against a checkout of `main` at a2f59eda (2026-10-12) — `v0.1.50` plus 11
// fix-lane commits, none touching `plugin/tools/lib/`
// (`git diff v0.1.50 a2f59eda -- plugin/tools/lib` is empty) — and its output
// written to that file. That was done at loop 2, and again after loop 3 at the
// same commit, when the helper grew: the 72 answers the file already held came
// out unchanged and 22 were added.
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

// Every place the two captures both hold a `message`, at any depth: where it
// is, `v0.1.50`'s words and today's.
function messagePairs(was, is, path = '', found = []) {
  if (was === null || is === null || typeof was !== 'object' || typeof is !== 'object') return found;
  for (const [k, v] of Object.entries(was)) {
    if (!(k in is)) continue;
    if (k === 'message' && typeof v === 'string' && typeof is[k] === 'string') found.push({ at: path, was: v, is: is[k] });
    else messagePairs(v, is[k], `${path}/${k}`, found);
  }
  return found;
}

// A `message` key removed ONLY where the other capture words it differently.
// One the two captures word the same way stays, and is compared as it is.
function withoutRewordedMessages(value, other) {
  if (value === null || typeof value !== 'object' || other === null || typeof other !== 'object') return value;
  if (Array.isArray(value)) return value.map((v, i) => withoutRewordedMessages(v, other[i]));
  return Object.fromEntries(Object.entries(value)
    .filter(([k, v]) => !(k === 'message' && typeof v === 'string' && typeof other[k] === 'string' && other[k] !== v))
    .map(([k, v]) => [k, withoutRewordedMessages(v, other[k])]));
}

// The calls whose refusal or finding is worded differently today (kind c): a
// writer given a name that is not an Epic ID, and every reader or writer that
// meets the record placed by hand. A message of any other call is not taken out.
const REWORDED = /^(queue\.notEpic\.|queue\.leavesFolder$|start\.notEpic\.|byHand\.notEpic\.)/;

// What a message says that is not wording: every number, every item ID, every
// Epic ID, every path and every name it quotes as given, as many times as it says each.
const said = (message) => [
  ...(message.match(/\(got "[^"]*"\)/g) ?? []),
  ...(message.match(/\d+/g) ?? []),
  ...(message.match(/\b[A-Z][A-Z0-9]*-\d+\b/g) ?? []),
  ...(message.match(/\bM\d+(?:\.\d+)?\.E\d+\b/g) ?? []),
  ...(message.match(/(?:<project>|\.planning|\.\.|[\w.-]+)(?:\/[\w.<>-]+)+/g) ?? []),
];
const times = (list, token) => list.filter((t) => t === token).length;

// The first-time dry run's report without what it says about unit records: two
// sections before its last sentence, and one clause of that sentence.
const UNITS_CLAUSE = /, creates \.planning\/work\/units\/ with \d+ unit records?(?: \([^)]*\))?(?=, regenerates )/;
function withoutUnitSections(report) {
  const i = report.findIndex((l) => l.startsWith('Unit records — '));
  const lines = i === -1 ? report : [...report.slice(0, i), report.at(-1)];
  return lines.map((l) => l.replace(UNITS_CLAUSE, ''));
}
const aboutUnits = (line) => /^Wrote \d+ unit records? under |^\d+ proposed legacy closes? /.test(line);
const inUnitsFolder = (line) => line.includes('.planning/work/units/');
const foldersLine = (line) => line.startsWith('- `units/`') || line.startsWith('- `epics/<EpicID>/`');
const NO_STORE = ['linear', 'epics', 'archivedEpic'];

// A capture with the differences AC6.4 names — and no other — taken out. One
// line per clause of the criterion; what is left must be `v0.1.50`'s, key for
// key. Each thing removed here is pinned, as it stands today, further down.
const withoutKindsAAndB = (capture) => {
  const out = structuredClone(capture);

  // (a) what this Epic adds
  delete out['hook.unitRecord']; // the edit hook guards `work/units/` paths, folder or not (AC2.2)
  delete out['migrate.dryRun']; // the dry run on a store-on project proposes unit records (AC9.2)…
  delete out['migrate.applyWithoutHash']; // …so its apply is refused for the missing hash, not for the store being there
  delete out.senseArchiveTree.held; // a new key, empty without unit records
  delete out['archive.report'].settled; // a new key, empty without unit records
  delete out['archive.report'].counts.settled; // a new key, 0 without unit records
  for (const name of NO_STORE) {
    const dry = out[`firstTime.${name}.dryRun`];
    delete dry.units; // the first-time migration's dry run proposes unit records… (AC9.1)
    delete dry.proposedUnitCloses; // …and legacy closes for them
    dry.report = withoutUnitSections(dry.report); // …and says so in its report
  }
  for (const key of ['apply', 'treeAfterApply', 'gitStatusAfterApply', 'workMd']) {
    delete out[`firstTime.archivedEpic.${key}`]; // that apply no longer fails its own check where there is `archive/epics/<ID>/`
  }
  for (const name of ['linear', 'epics']) {
    const applied = out[`firstTime.${name}.apply`];
    delete applied.units; // its apply creates `work/units/` (AC9.1): how many records…
    delete applied.unitClosesConfirmed; // …how many of them closed…
    applied.report = applied.report.filter((l) => !aboutUnits(l)); // …the two lines of its report that say so…
    out[`firstTime.${name}.treeAfterApply`] = out[`firstTime.${name}.treeAfterApply`].filter((l) => !inUnitsFolder(l)); // …the files…
    out[`firstTime.${name}.gitStatusAfterApply`] = out[`firstTime.${name}.gitStatusAfterApply`].filter((l) => !inUnitsFolder(l)); // …and that they are staged
  }
  for (const key of ['firstTime.linear.workMd', 'firstTime.epics.workMd', 'v1ToV2.dryRun.workMd', 'v1ToV2.apply.workMd']) {
    out[key] = out[key].filter((l) => !foldersLine(l)); // the `WORK.md` body a migration writes names `units/`, and words its `epics/` line to match
  }
  delete out['args.also'].also; // the migrate command reads `--also`

  // (b) the unit-name rule
  for (const name of NOT_EPICS) delete out[`validate.notEpic.${name}`]; // the item schema accepts any safe unit name
  for (const key of Object.keys(out)) {
    if (key === 'validate.long' || key.startsWith('long.')) delete out[key]; // a name over 100 characters is refused everywhere
  }
  return out;
};
const withoutTheNamedKinds = (capture, other) => {
  const out = withoutKindsAAndB(capture);

  // (c) wording
  delete out.gapSentence; // the one false sentence, corrected in t10.3
  for (const key of Object.keys(out)) {
    if (REWORDED.test(key)) out[key] = withoutRewordedMessages(out[key], other[key]); // the text of a refusal or a finding, where it is worded differently; its code, ID and path stay
  }
  return out;
};

// One capture of today's code, for every case below.
const now = await captureUnitsOff(LIB);

const refusedKeys = (capture) => Object.keys(capture).filter((k) => capture[k]?.refused === true);

describe('no work/units/: with only the kinds of difference AC6.4 names taken out, everything equals v0.1.50', () => {
  it('the capture takes the same 94 answers today as it took against v0.1.50', () => {
    expect(now.calls).toBe(94);
    expect(V0150.calls).toBe(94);
    expect(Object.keys(now)).toEqual(Object.keys(V0150));
  });

  it('the catch-all — a difference of any kind AC6.4 does not name, in any of the 94 answers, fails here', () => {
    expect(withoutTheNamedKinds(now, V0150)).toEqual(withoutTheNamedKinds(V0150, now));
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
    // So is the first-time apply beside `archive/epics/<ID>/`: v0.1.50 failed its own check there, and wrote no WORK.md to read.
    const gave = refusedKeys(V0150).filter((k) => !k.startsWith('migrate.') && !k.startsWith('firstTime.archivedEpic.'));
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

  it('a v1 store made into a v2 one: the same manifest, the same files and no work/units/, built aside and applied', () => {
    for (const key of ['v1ToV2.dryRun', 'v1ToV2.apply', 'v1ToV2.treeAfterApply']) expect(now[key], key).toEqual(V0150[key]);
    expect(now['v1ToV2.apply']).toMatchObject({ mode: 'apply', errors: [], summary: { v1Files: 3, records: 3, errors: 0 } });
    expect(now['v1ToV2.treeAfterApply'].filter(inUnitsFolder)).toEqual([]);
    // The flags v0.1.50 read are read as they were.
    expect(now['args.workStore']).toEqual({ apply: true, force: false, workStore: true, key: 'LEAF' });
    expect(now['args.workStore']).toEqual(V0150['args.workStore']);
  });

  it('a message v0.1.50 worded the same way is compared word for word, its numbers and IDs with it', () => {
    const kept = messagePairs(withoutTheNamedKinds(V0150, now), withoutTheNamedKinds(now, V0150));
    expect(kept.map((m) => m.at)).toEqual([
      '/hook.itemRecord', '/hook.view', '/hook.epicsView', '/queue.archivedEpic', '/queue.notText', '/queue.missing',
      '/start.archivedEpic', '/reopen.inArchivedEpic', '/closeEpicCheck.M9.E2',
    ]);
    for (const m of kept) expect(m.is, m.at).toBe(m.was);
    // An archived Epic's refusal names the item, the Epic and its folder.
    expect(now['queue.archivedEpic'].message).toBe('LEAF-1: Epic M9.E3 is archived (.planning/archive/epics/M9.E3/) — nothing was queued. An archived Epic is finished; pick a live one.');
    // One that carries a count and two item IDs: the refusal to close an Epic with open items in it.
    expect(now['closeEpicCheck.M9.E2'].message).toBe(V0150['closeEpicCheck.M9.E2'].message);
    expect(now['closeEpicCheck.M9.E2'].message).toMatch(/^M9\.E2 has 2 open items in it — /);
    expect(now['closeEpicCheck.M9.E2'].message).toMatch(/LEAF-2 \(status Q\)[^]*LEAF-3 \(status P\)/);
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

describe('no store, or a v1 store: (a) what this Epic adds to the migrations that turn a store on', () => {
  it('the first-time dry run proposes unit records and legacy closes; v0.1.50\'s named no unit (AC9.1)', () => {
    for (const name of NO_STORE) {
      expect(V0150[`firstTime.${name}.dryRun`], name).toMatchObject({ refused: false, dryRun: true, units: null, proposedUnitCloses: null });
      expect(V0150[`firstTime.${name}.dryRun`].report.join('\n'), name).not.toMatch(/unit record|legacy close/);
    }
    expect(now['firstTime.linear.dryRun'].units).toEqual([['phase-11', 'legacy-close'], ['phase-12', 'open']]);
    expect(now['firstTime.linear.dryRun'].proposedUnitCloses).toEqual(['phase-11']);
    expect(now['firstTime.epics.dryRun'].units).toEqual([['M9.E1', 'legacy-close'], ['M9.E2', 'open'], ['M9.E9', 'open']]);
    expect(now['firstTime.archivedEpic.dryRun'].units).toEqual([['M9.E1', 'legacy-close'], ['M9.E2', 'open'], ['M9.E3', 'open'], ['M9.E9', 'open']]);
    for (const name of ['epics', 'archivedEpic']) expect(now[`firstTime.${name}.dryRun`].proposedUnitCloses, name).toEqual(['M9.E1']);

    // The report is v0.1.50's, line for line, with two sections added before its last sentence and one clause added to that sentence.
    const was = V0150['firstTime.linear.dryRun'].report;
    const is = now['firstTime.linear.dryRun'].report;
    expect(is.slice(0, was.length - 1)).toEqual(was.slice(0, -1));
    expect(is.slice(was.length - 1, -1)).toEqual([
      'Unit records — one record per Epic or unit this project names (2 named):',
      '  phase-11  proposed: closed (legacy)  — its retrospective is complete (.planning/phase-11-RETROSPECTIVE.md); today\'s closure check reads it closed (phase-11-VERIFICATION.md records a PASS, and phase-11 is not the current unit)',
      '  phase-12  open  — today\'s closure check reads it open (phase-12 has no terminal artifact — nothing claims it finished)',
      '',
      'Proposed legacy closes (1) — confirm to record these units as closed; if you say no, each is created open, with a note saying it looked finished. Unit, the evidence:',
      '  phase-11  — its retrospective is complete (.planning/phase-11-RETROSPECTIVE.md); today\'s closure check reads it closed (phase-11-VERIFICATION.md records a PASS, and phase-11 is not the current unit)',
      '',
    ]);
    expect(is.at(-1)).toContain(', creates .planning/work/units/ with 2 unit records (1 of them closed as legacy only if you confirm that list; otherwise open), regenerates ');
    expect(is.at(-1).replace(UNITS_CLAUSE, '')).toBe(was.at(-1));
  });

  it('the first-time apply creates work/units/, so a project migrated on this version has unit records on; v0.1.50\'s made no such folder (AC9.1)', () => {
    const records = { linear: ['phase-11', 'phase-12'], epics: ['M9.E1', 'M9.E2', 'M9.E9'] };
    for (const [name, units] of Object.entries(records)) {
      const was = V0150[`firstTime.${name}.apply`];
      const is = now[`firstTime.${name}.apply`];
      expect(was, name).toMatchObject({ applied: true, units: null, unitClosesConfirmed: null });
      // Everything else the apply answered is v0.1.50's: the item records, the closes confirmed, the views, the tag, the undo line.
      expect({ ...is, units: null, unitClosesConfirmed: null, report: is.report.filter((l) => !aboutUnits(l)) }, name).toEqual(was);
      expect(is, name).toMatchObject({ units: units.length, unitClosesConfirmed: 0 });
      expect(is.report.filter(aboutUnits), name).toEqual([
        `Wrote ${units.length} unit records under .planning/work/units/ — unit records are on.`,
        '1 proposed legacy close was not confirmed: each unit was created open, with a note saying it looked finished.',
      ]);
      const made = ['.planning/work/units/.keep', ...units.map((u) => `.planning/work/units/${u}.json`)];
      expect(V0150[`firstTime.${name}.treeAfterApply`].filter(inUnitsFolder), name).toEqual([]);
      expect(now[`firstTime.${name}.treeAfterApply`].filter(inUnitsFolder), name).toEqual(made);
      expect(now[`firstTime.${name}.gitStatusAfterApply`].filter(inUnitsFolder), name).toEqual(made.map((f) => `A  ${f}`));
    }
  });

  it('the first-time apply beside archive/epics/<ID>/ goes through; v0.1.50\'s failed its own check there and wrote nothing', () => {
    expect(V0150['firstTime.archivedEpic.apply']).toEqual({
      refused: true,
      code: 'SCHEMA',
      message: 'the migrated store did not verify:\n  checkRecords view-stale: .planning/work/EPICS.md: differs from a regeneration of the records — edited by hand, or not regenerated',
    });
    expect(V0150['firstTime.archivedEpic.gitStatusAfterApply']).toEqual([]);
    expect(V0150['firstTime.archivedEpic.treeAfterApply'].filter((f) => f.startsWith('.planning/work/'))).toEqual([]);
    expect(V0150['firstTime.archivedEpic.workMd']).toMatchObject({ refused: true, code: 'ENOENT' });

    // Today it does what the same project without that folder does — on v0.1.50 too — and makes a record for the archived Epic.
    const is = now['firstTime.archivedEpic.apply'];
    expect(is).toMatchObject({ applied: true, records: 2, flagged: 1, closesConfirmed: 1, units: 4, unitClosesConfirmed: 0 });
    expect({ ...is, units: null, unitClosesConfirmed: null, report: is.report.filter((l) => !aboutUnits(l)) }).toEqual(V0150['firstTime.epics.apply']);
    expect(now['firstTime.archivedEpic.treeAfterApply']).toEqual([
      ...now['firstTime.epics.treeAfterApply'], '.planning/archive/epics/M9.E3/README.md', '.planning/work/units/M9.E3.json',
    ].sort());
    expect(now['firstTime.archivedEpic.workMd']).toEqual(now['firstTime.epics.workMd']);
  });

  it('the WORK.md body a migration writes names units/, and words its epics/ line to match; the rest of the file is v0.1.50\'s', () => {
    const WAS = '- `epics/<EpicID>/` — an Epic\'s documents; its items are the records whose events name the Epic';
    const EPICS = '- `epics/<EpicID>/` — an Epic\'s documents, when a folder was made for it by hand; an Epic\'s items are the records whose events name it, folder or not';
    const STATUS = 'A unit\'s status is derived from its own events too: open, *closing*, closed — and a closed unit can be held';
    const by = {
      // the first-time migration: its apply has just made the folder
      'firstTime.linear.workMd': `- \`units/\` — one record per Epic or unit, \`<ID>.json\`. ${STATUS}`,
      'firstTime.epics.workMd': `- \`units/\` — one record per Epic or unit, \`<ID>.json\`. ${STATUS}`,
      // a v1 store made into a v2 one: it makes no such folder
      'v1ToV2.dryRun.workMd': `- \`units/\` — one record per Epic or unit, \`<ID>.json\`, when the project has unit records (this folder existing is what turns them on). ${STATUS}`,
      'v1ToV2.apply.workMd': `- \`units/\` — one record per Epic or unit, \`<ID>.json\`, when the project has unit records (this folder existing is what turns them on). ${STATUS}`,
    };
    for (const [key, units] of Object.entries(by)) {
      expect(V0150[key].filter(foldersLine), key).toEqual([WAS]);
      expect(now[key].filter(foldersLine), key).toEqual([units, EPICS]);
      expect(now[key].filter((l) => !foldersLine(l)), key).toEqual(V0150[key].filter((l) => !foldersLine(l)));
    }
  });

  it('the migrate command reads --also; v0.1.50 passed over it', () => {
    expect(V0150['args.also']).toEqual({ apply: false, force: false, workStore: true });
    expect(now['args.also']).toEqual({
      apply: false, force: false, workStore: true, also: [{ id: 'M9.E4', reason: 'dropped', words: 'never started' }],
    });
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

  it('a message worded differently still says every number, item ID, Epic ID, path and quoted name v0.1.50\'s said', () => {
    // After (a) and (b) are taken out, so that what is left differs by wording alone.
    const reworded = messagePairs(withoutKindsAAndB(V0150), withoutKindsAAndB(now)).filter((m) => m.is !== m.was);
    // 11 refusals by a writer given a name that is not an Epic ID, and 8 messages about the record placed by hand.
    expect(reworded.map((m) => m.at.split('/')[1].split('.')[0]).sort()).toEqual([...Array(8).fill('byHand'), ...Array(6).fill('queue'), ...Array(5).fill('start')]);
    for (const m of reworded) {
      expect(m.at.slice(1), m.at).toMatch(REWORDED);
      // v0.1.50 named the refused event by its place in the record (`events[2]`); a writer today names the item
      // instead. That index is the one thing of this kind dropped, so it is taken out of what v0.1.50 said — for the writers only.
      const was = /^\/(queue|start)\./.test(m.at) ? m.was.replace(/events\[\d+\]\./, '') : m.was;
      const [then, today] = [said(was), said(m.is)];
      expect(then.length, m.at).toBeGreaterThan(0);
      for (const token of new Set(then)) expect(times(today, token), `${m.at}: "${token}"`).toBeGreaterThanOrEqual(times(then, token));
      if (was !== m.was) expect(m.is, m.at).toMatch(/: LEAF-\d+: epic does not match /);
    }
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
