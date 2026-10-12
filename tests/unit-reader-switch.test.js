// M6.E16 t6.5 — AC6.1's denominator, as a test: every reader that SWITCHES to
// the unit records, by module and export name, and for each one the same check
// — the same project files, once with no `work/units/` and once with records
// that CONTRADICT the files — showing the answer follows the files without
// unit records and the record with them.
//
// The table is kept by hand, from the plan's reader list (the rows marked
// "switches", slices S3 to S6). It is not read from a planning document: a test
// must not depend on one. Adding a switched reader means adding a row here.
//
// Each row is one of:
//   - `run` — the two-fixture check runs here. `run({units})` builds its own
//     project and returns what the reader said; `off` and `on` are the answers
//     without and with unit records. Every reader switched in S6.
//   - `coveredBy` — the reader was switched in S3, S4 or S5 and that slice's
//     test file has cases for it with and without unit records. The row names
//     the file; this test checks only that the file is still there, still names
//     the reader and still builds unit records — it does not re-run it.
//   - `via` — the name is not an export (or takes its closed set as an
//     argument), so it is exercised through the export named.
//
// The fixture (`helpers/unit-fixture.js` `contradiction`): the files say M7.E1
// is closed and M7.E2 and M7.E3 are open; the records say M7.E1 is open and
// M7.E2 and M7.E3 are closed.
//
// The last block is AC6.2: with an OPEN record, each of the four things that
// used to mean closed, alone, makes no switched reader call the unit closed.

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveClosures, resolveUnitClosure } from '../plugin/tools/lib/closure.js';
import { isEpicDone } from '../plugin/tools/lib/retrospective.js';
import { senseArchiveTree } from '../plugin/tools/lib/archive-tree.js';
import { buildArchiveReport, applyArchive } from '../plugin/tools/lib/archive-command.js';
import { evictEpicNarrative } from '../plugin/tools/lib/evict.js';
import { resolveMigrateClosedUnits, senseVector3 } from '../plugin/tools/lib/migrate-memory.js';
import { backlogDischargeStatus, storeDischargeStatus } from '../plugin/tools/lib/backlog.js';
import { runDriftChecks, checkEpicWithoutRetro } from '../plugin/tools/lib/state-drift.js';
import { proposeEpicCandidates } from '../plugin/tools/lib/drive.js';
import { findWorkOnOtherBranches } from '../plugin/tools/lib/branch-work.js';
import { readCorpus } from '../plugin/tools/lib/advise-corpus.js';
import { deriveUnits } from '../plugin/tools/lib/work-units.js';
import {
  alone, ALONE, branchRepo, cleanupUnitProjects, contradiction, plant, put, retroFor, state, tempProject, unitsOn,
} from './helpers/unit-fixture.js';

const REPO = fileURLToPath(new URL('..', import.meta.url));
const LIB = join(REPO, 'plugin/tools/lib');

afterEach(cleanupUnitProjects);

const TWO = ['M7.E1', 'M7.E2'];
const FILES_SAY = ['M7.E1']; // closed, of TWO, by the files
const RECORDS_SAY = ['M7.E2']; // closed, of TWO, by the records
const only = (ids) => TWO.filter((id) => ids.includes(id));
const rootFiles = (base, unit) => readdirSync(join(base, '.planning')).filter((f) => f.startsWith(`${unit}-`));
const stateOf = (base) => readFileSync(join(base, '.planning/STATE.md'), 'utf-8');

// Does each reader call a unit closed? One function per reader, used by the
// table below and by the AC6.2 block. `base` is a fresh project each time.
const CLOSED = {
  resolveClosures: async (base) => (await resolveClosures(base)).units.filter((u) => u.status === 'closed').map((u) => u.unit),
  resolveUnitClosure: async (base) => {
    const out = [];
    for (const unit of TWO) {
      const r = await resolveUnitClosure({ unit, files: rootFiles(base, unit), currentUnitId: 'M7.E9', planningDir: join(base, '.planning') });
      if (r.status === 'closed') out.push(unit);
    }
    return out;
  },
  isEpicDone: async (base) => TWO.filter((id) => isEpicDone(base, id).status === 'done'),
  senseArchiveTree: async (base) => (await senseArchiveTree(base)).closedUnits,
  buildArchiveReport: async (base) => (await buildArchiveReport(base)).plan.map((p) => p.unit),
  applyArchive: async (base) => {
    await applyArchive(base);
    return TWO.filter((id) => !existsSync(join(base, `.planning/${id}-PLAN.md`)));
  },
  // Closed here means "got past the closed check": evicted, or stopped only for want of a card.
  evictEpicNarrative: async (base) => {
    const out = [];
    for (const id of TWO) if ((await evictEpicNarrative(base, id)).reason !== 'not-closed') out.push(id);
    return out;
  },
  resolveMigrateClosedUnits: async (base) => (await resolveMigrateClosedUnits(base)).closedUnits,
  senseVector3: async (base) => (await senseVector3(base, stateOf(base))).evicts.map((e) => e.epicId),
  storeDischargeStatus: async (base) => (await storeDischargeStatus(base)).stale.map((s) => s.epic),
  readCorpus: async (base) => (await readCorpus(base)).sources.closure.units.filter((u) => u.status === 'closed').map((u) => u.unit),
};

const closedOfTwo = (name, opts = {}) => async ({ units }) => {
  const base = contradiction({ units, store: opts.store === true });
  opts.prepare?.(base);
  return only(await CLOSED[name](base));
};

// A live BACKLOG.md row for each unit, on a project with no work store: the
// file check, which reads unit closure through the unexported `readUnitClosure`.
const BACKLOG = '# Backlog\n\n### M7.E1 — lantern index leftovers\n\nBody.\n\n### M7.E2 — harbour sync leftovers\n\nBody.\n';

const READERS = [
  // ── S6 ────────────────────────────────────────────────────────────────────
  { module: 'closure.js', name: 'resolveClosures', run: closedOfTwo('resolveClosures'), off: FILES_SAY, on: RECORDS_SAY },
  { module: 'closure.js', name: 'resolveUnitClosure', run: closedOfTwo('resolveUnitClosure'), off: FILES_SAY, on: RECORDS_SAY },
  { module: 'retrospective.js', name: 'isEpicDone', run: closedOfTwo('isEpicDone'), off: FILES_SAY, on: RECORDS_SAY },
  { module: 'archive-tree.js', name: 'senseArchiveTree', run: closedOfTwo('senseArchiveTree'), off: FILES_SAY, on: RECORDS_SAY },
  { module: 'archive-command.js', name: 'buildArchiveReport', run: closedOfTwo('buildArchiveReport'), off: FILES_SAY, on: RECORDS_SAY },
  { module: 'archive-command.js', name: 'applyArchive', run: closedOfTwo('applyArchive'), off: FILES_SAY, on: RECORDS_SAY },
  { module: 'evict.js', name: 'evictEpicNarrative', run: closedOfTwo('evictEpicNarrative'), off: FILES_SAY, on: RECORDS_SAY },
  { module: 'migrate-memory.js', name: 'resolveMigrateClosedUnits', run: closedOfTwo('resolveMigrateClosedUnits'), off: FILES_SAY, on: RECORDS_SAY },
  {
    module: 'migrate-memory.js',
    name: 'senseVector3',
    // M7.E2 gets a retrospective so there is a card to evict against; with no verdict its files still say open.
    run: closedOfTwo('senseVector3', { prepare: (b) => put(b, '.planning/M7.E2-RETROSPECTIVE.md', retroFor('M7.E2')) }),
    off: FILES_SAY,
    on: RECORDS_SAY,
  },
  { module: 'migrate-memory.js', name: 'planVector3', via: 'senseVector3', why: 'pure: it is handed the closed Epics\' cards, and senseVector3 chooses them' },
  { module: 'backlog.js', name: 'storeDischargeStatus', run: closedOfTwo('storeDischargeStatus', { store: true }), off: FILES_SAY, on: RECORDS_SAY },
  {
    module: 'backlog.js',
    name: 'readUnitClosure',
    via: 'backlogDischargeStatus',
    why: 'not exported; the file check (work store off) reads unit closure through it',
    run: async ({ units }) => {
      const base = contradiction({ units });
      put(base, '.planning/BACKLOG.md', BACKLOG);
      return only((await backlogDischargeStatus(base)).stale.map((s) => s.id));
    },
    off: FILES_SAY,
    on: RECORDS_SAY,
  },
  {
    module: 'state-drift.js',
    name: 'checkEpicWithoutRetro',
    // Not a closed question: which units it checks. Files: M7.E2 and M7.E3 were worked. Records: M7.E3 was
    // dropped, and M7.E4 has a record and no file.
    run: async ({ units }) => {
      const { results } = await runDriftChecks(contradiction({ units }), [checkEpicWithoutRetro]);
      return (results[0].findings ?? []).map((f) => f.message.match(/^(\S+)/)[1]).sort();
    },
    off: ['M7.E2', 'M7.E3'],
    on: ['M7.E2', 'M7.E4'],
  },
  {
    module: 'drive.js',
    name: 'proposeEpicCandidates',
    // The current Epic, M7.E9: STATE.md records no SHIP (open); its record is closed.
    run: async ({ units }) => (await proposeEpicCandidates(contradiction({ units }))).candidates.filter((c) => c.source === 'STATE.md (open Epic)').map((c) => c.id),
    off: ['M7.E9'],
    on: [],
  },
  {
    module: 'branch-work.js',
    name: 'findWorkOnOtherBranches',
    // M7.E1 is open on another branch; HEAD carries its retrospective (finished here); its record here is open.
    run: async ({ units }) => {
      const base = branchRepo({ retro: true });
      if (units) {
        unitsOn(base);
        plant(base, 'M7.E1', 'open');
      }
      return (await findWorkOnOtherBranches(base, { localEpic: 'M7.E9' })).open.map((o) => o.epic);
    },
    off: [],
    on: ['M7.E1'],
  },
  { module: 'advise-corpus.js', name: 'readCorpus', run: closedOfTwo('readCorpus'), off: FILES_SAY, on: RECORDS_SAY },

  // ── S3, S4, S5 — switched earlier; each slice's test runs the reader both ways ──
  { module: 'milestones.js', name: 'deriveNextEpicId', coveredBy: 'epic-native.test.js' },
  { module: 'work-records.js', name: 'queueItem', coveredBy: 'work-records-epic.test.js' },
  { module: 'work-records.js', name: 'startItem', coveredBy: 'work-records-epic.test.js' },
  { module: 'work-records.js', name: 'reopenItem', coveredBy: 'work-records-epic.test.js' },
  { module: 'work-records.js', name: 'refuseUnavailableEpic', via: 'queueItem', why: 'not exported (the plan calls it refuseArchivedEpic); queueItem and startItem call it' },
  { module: 'work-records.js', name: 'isEpicArchived', coveredBy: 'work-records-epic.test.js', why: 'its callers switched: it is not asked on a project with unit records' },
  { module: 'work-ops.js', name: 'closeEpic', coveredBy: 'work-epic-close-units.test.js' },
  { module: 'retrospective.js', name: 'detectDirtyExecute', coveredBy: 'ship-epic-close-units.test.js' },
  { module: 'retrospective.js', name: 'shipFR1Check', coveredBy: 'ship-epic-close-units.test.js' },
  { module: 'work-migrate-lists.js', name: 'buildEvidenceIndex', coveredBy: 'work-migrate-evidence-units.test.js' },
  { module: 'work-views.js', name: 'regenerateViews', coveredBy: 'work-views-units.test.js' },
  { module: 'work-views.js', name: 'renderEpics', via: 'regenerateViews', why: 'not exported; regenerateViews renders EPICS.md with it' },
  { module: 'work-views.js', name: 'readEpicFolders', via: 'regenerateViews', why: 'not exported; called only on a project with no unit records' },
  { module: 'published-facts.js', name: 'checkMilestoneStatusVsState', coveredBy: 'published-facts-units.test.js' },
  { module: 'advise-digest.js', name: 'gatherBigPicture', coveredBy: 'advise-units.test.js' },
];

const source = (module) => readFileSync(join(LIB, module), 'utf-8');
const isExported = (module, name) => new RegExp(`^export (?:async )?(?:function|const) ${name}\\b`, 'm').test(source(module));
const isDeclared = (module, name) => new RegExp(`^(?:export )?(?:async )?(?:function|const) ${name}\\b`, 'm').test(source(module));

describe('AC6.1 — every switched reader is in the table, exists, and has a check', () => {
  it('no reader is listed twice', () => {
    const keys = READERS.map((r) => `${r.module} ${r.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  for (const r of READERS) {
    it(`${r.module} ${r.name} exists${r.via ? ` (through ${r.via})` : ''}`, () => {
      expect(existsSync(join(LIB, r.module)), `${r.module} is gone`).toBe(true);
      if (r.via) {
        // Named in the plan, but not something a caller can import: it must still be declared, and the
        // export it is reached through must exist and have its own row or its own check here.
        expect(isDeclared(r.module, r.name), `${r.name} is no longer declared in ${r.module}`).toBe(true);
        expect(typeof r.why).toBe('string');
        expect(isExported(r.module, r.via), `${r.via} is no longer exported from ${r.module}`).toBe(true);
        expect(Boolean(r.run) || READERS.some((o) => o.module === r.module && o.name === r.via && (o.run || o.coveredBy))).toBe(true);
      } else {
        expect(isExported(r.module, r.name), `${r.name} is no longer exported from ${r.module}`).toBe(true);
        expect(Boolean(r.run) || typeof r.coveredBy === 'string', 'a row needs a check: run, coveredBy or via').toBe(true);
      }
    });
  }

  for (const r of READERS.filter((x) => x.coveredBy)) {
    it(`${r.module} ${r.name} — its earlier test (${r.coveredBy}) is there, names it, and runs on unit records`, () => {
      const path = join(REPO, 'tests', r.coveredBy);
      expect(existsSync(path), `tests/${r.coveredBy} is gone`).toBe(true);
      const text = readFileSync(path, 'utf-8');
      expect(text).toMatch(new RegExp(`\\b${r.name}\\b`));
      expect(text).toMatch(/work\/units|'work', 'units'|ensureUnitsDir|unitsOn|plant\(/);
    });
  }
});

describe('AC6.1 — each reader follows the files without unit records and the record with them', () => {
  for (const r of READERS.filter((x) => x.run)) {
    it(`${r.module} ${r.via ?? r.name}${r.via ? ` (for ${r.name})` : ''}`, async () => {
      expect(r.on, 'the record must contradict the files, or the check shows nothing').not.toEqual(r.off);
      expect((await r.run({ units: false })).sort(), 'without unit records: the files').toEqual(r.off);
      expect((await r.run({ units: true })).sort(), 'with unit records: the record').toEqual(r.on);
    }, 60_000); // the branch-work row builds two git repositories (REVIEW pass 1, T-S8)
  }
});

// The plan's list has one reader whose verdict is neither column outright: `deriveUnits` STAYS (it groups
// file names), and "which units exist" switches in its callers, which have rows above (`senseArchiveTree`,
// `buildArchiveReport`, `resolveClosures`, `checkEpicWithoutRetro`). Added at VERIFY, loop 1: until then
// no row or check here named it.
describe('AC6.1 — deriveUnits stays: it groups file names and reads no unit record', () => {
  const unitsOf = (base) => {
    const names = readdirSync(join(base, '.planning')).filter((f) => f.endsWith('.md'));
    return [...deriveUnits(names).units.keys()].sort();
  };

  it('work-units.js deriveUnits exists and imports no unit-record module', () => {
    expect(isExported('work-units.js', 'deriveUnits')).toBe(true);
    expect(source('work-units.js')).not.toMatch(/from '\.\/unit-records?\.js'/);
  });

  it('the same answer without unit records and with records that contradict the files', () => {
    // The records add M7.E4 and M7.E9, which have no file: a reader of the records would list them.
    expect(unitsOf(contradiction({ units: false }))).toEqual(['M7.E1', 'M7.E2', 'M7.E3']);
    expect(unitsOf(contradiction({ units: true }))).toEqual(['M7.E1', 'M7.E2', 'M7.E3']);
  });
});

describe('AC6.2 — with an open record, no switched reader calls the unit closed', () => {
  for (const what of Object.keys(ALONE)) {
    for (const [name, closed] of Object.entries(CLOSED)) {
      it(`${what} alone — ${name}`, async () => {
        const base = alone(what, { store: name === 'storeDischargeStatus' });
        expect(await closed(base)).not.toContain('M7.E1');
      });
    }
    it(`${what} alone — findWorkOnOtherBranches still offers the Epic`, async () => {
      const base = branchRepo({ retro: false });
      ALONE[what](base);
      unitsOn(base);
      plant(base, 'M7.E1', 'open');
      expect((await findWorkOnOtherBranches(base, { localEpic: 'M7.E9' })).open.map((o) => o.epic)).toEqual(['M7.E1']);
    });
  }

  // Pins AC6.2 as amended at REVIEW pass 1 (T-I2, `D-M6E16-23`): with unit
  // records present, a unit that HAS a record is decided by its record alone;
  // a unit with NO record is still judged from its files — and the sweep
  // reports it (`checkUnitsWithoutRecord`, tests/work-migrate-units-add.test.js).
  it('AC6.2 as amended — a unit with no record is still judged from its files: a filled retrospective and a PASS verdict close it for these readers', async () => {
    const base = tempProject();
    put(base, '.planning/STATE.md', state());
    put(base, '.planning/M7.E1-PLAN.md', '# plan\n');
    ALONE['a filled retrospective'](base);
    ALONE['a PASS verdict'](base);
    unitsOn(base); // unit records on, and none for M7.E1
    expect(await CLOSED.resolveClosures(base)).toEqual(['M7.E1']);
    expect(await CLOSED.senseArchiveTree(base)).toEqual(['M7.E1']);
    expect(await CLOSED.isEpicDone(base)).toEqual(['M7.E1']);
  });
});
