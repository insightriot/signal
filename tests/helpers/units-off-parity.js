// Fixed projects with the work store on and NO `work/units/`, and what the
// library says about them (M6.E16 AC6.4, as amended at VERIFY loops 1 and 2,
// `D-M6E16-20`).
//
// Used twice: by `tests/unit-records-off-parity.test.js`, against today's
// code; and once by hand against a checkout of `main`, to get the answers that
// test expects (`tests/fixtures/units-off-parity/v0.1.50.json`; how, and at
// which commit, is written in the test's header). So it imports nothing from
// this repository at the top: the library folder is an argument, and it calls
// only functions `v0.1.50` had.
//
// Loop 1's capture asked five functions and so could see a difference only in
// those five. This one makes the calls loop 2's wider run made: the edit hook,
// the migration's dry run, the archive plan, the item readers over records
// placed on disk by hand, and the item writers with an Epic ID, a name that is
// not one, and a name over 100 characters — beside the closure readers.
//
// What is captured is a PROJECTION of each answer — the fields that say what
// was decided (a status, a code, a path, a list of names), not a whole return
// value: those carry Maps, hashes and temp paths. Projecting is not
// normalising; the test does that, and only for what AC6.4 names.
//
// Every name is invented. Nothing outside a temp folder is read or written.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const AT = '2026-10-11T10:00:00.000Z';
const by = 'claude';

/** A unit name longer than the 100 characters the unit-name rule allows, shaped like an Epic ID. */
export const LONG_EPIC = `M9.E${'1'.repeat(150)}`;
/** Safe unit names that are not Epic IDs: what the widened item schema accepts and `v0.1.50`'s refused. */
export const NOT_EPICS = ['phase-11', 'EXECUTE', 'LEAF-5', 'next', 'm9.e2'];

const STATE = [
  '---', 'schema_version: 1', 'phase: EXECUTE', 'current_epic: M9.E9', 'current_wave: null', 'current_tasks: []',
  'completed_phases: []', 'blockers: []', 'last_completed_task: null', '---', '', '# Project State', '',
].join('\n');
const PASS = (id) => `# ${id} verification\n\n**Verdict:** PASS\n`;
const RETRO = (id) => `# ${id} Retrospective\n\nOutcome: shipped 2026-09-01 (${id}).\nDecision D-${id.replace('.', '')}-1 locked. FR1 done. AC1 verified.\n`;
const MILESTONE = [
  '# Milestone 9', '', 'Written by hand.', '', '| Epic | Status | Summary |', '|---|---|---|',
  '| `M9.E1` | **shipped** — 2026-09-01 (PR #12) | Lantern index |',
  '| `M9.E2` | planned | Harbour sync |',
  '| `M9.E9` | **in flight** | The current one |', '', 'After the table.', '',
].join('\n');

const item = (id, events) => ({ id, type: 'FEAT', title: `title of ${id}`, events });
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };
const queued = (epic) => ({ type: 'queued', at: AT, by, epic });
const closed = { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'no longer wanted' };
// A record as a merge or a shell command would leave it: not through the library's own check.
const byHand = (record) => `${JSON.stringify(record, null, 2)}\n`;

function put(base, rel, content) {
  const p = join(base, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

// Every file under `.planning/`, by path — what a move changed.
function tree(base) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(relative(base, p).split('\\').join('/'));
    }
  };
  walk(join(base, '.planning'));
  return out.sort();
}

// A repository with one commit, and a bare copy of it as `origin` — the
// migration and the archive read git. Fixed names and dates; no hash is captured.
function gitRepo(base, originDir) {
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Leaf', GIT_AUTHOR_EMAIL: 'leaf@example.invalid', GIT_AUTHOR_DATE: AT,
    GIT_COMMITTER_NAME: 'Leaf', GIT_COMMITTER_EMAIL: 'leaf@example.invalid', GIT_COMMITTER_DATE: AT,
    GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null',
  };
  const git = (cwd, args) => execFileSync('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'ignore'] });
  git(base, ['init', '-q', '-b', 'main']);
  git(base, ['add', '-A']);
  git(base, ['commit', '-q', '-m', 'the fixture']);
  git(originDir, ['init', '-q', '--bare', '-b', 'main']);
  git(base, ['remote', 'add', 'origin', originDir]);
  git(base, ['push', '-q', 'origin', 'main']);
  git(base, ['fetch', '-q', 'origin']);
}

/**
 * @param {string} libDir — absolute path of a `plugin/tools/lib/` folder
 * @returns {Promise<{calls: number, [key: string]: unknown}>} the answers, one key per call (see the test for
 *   each), and `calls`: how many library calls were made
 */
export async function captureUnitsOff(libDir) {
  const lib = (name) => import(pathToFileURL(join(libDir, name)).href);
  const records = await lib('work-records.js');
  const { serializeRecord, validateRecord } = await lib('work-record.js');
  const { regenerateViews } = await lib('work-views.js');
  const { checkWorkWrite } = await lib('work-write-guard.js');
  const { resolveClosures } = await lib('closure.js');
  const { isEpicDone } = await lib('retrospective.js');
  const { deriveNextEpicId } = await lib('milestones.js');
  const { runDriftChecks } = await lib('state-drift.js');
  const { checkWorkStore } = await lib('sweep.js');
  const { senseArchiveTree } = await lib('archive-tree.js');
  const { runWorkStoreMigrate } = await lib('work-migrate-lists.js');
  const { buildArchiveReport, renderArchiveReport, applyArchive } = await lib('archive-command.js');
  const { renderDryRun, resolveMigrateClosedUnits } = await lib('migrate-memory.js');

  const temp = (name) => realpathSync(mkdtempSync(join(tmpdir(), `sig-units-off-${name}-`)));
  // A: the clean store — three units read from their files, a milestone table,
  //    an archived Epic folder, real git with a bare `origin`.
  //      M9.E1 — PLAN, a PASS verdict, a filled retrospective: closed, and it moves
  //      M9.E2 — PLAN only: open
  //      M9.E3 — archived (`archive/epics/M9.E3/`)
  //      M9.E9 — the current Epic: open
  const a = temp('a');
  const origin = temp('origin');
  // B: the one shape that reaches the reworded sentence — a PASS verdict and a
  //    retrospective still holding a placeholder. No store.
  const b = temp('b');
  // C: a store holding a record placed by hand that names `phase-11`.
  const c = temp('c');
  // D: a store for the name over 100 characters — asked of the writers, then
  //    placed by hand and asked of the readers.
  const d = temp('d');
  const dirs = [a, origin, b, c, d];

  // No temp path in a captured message.
  const scrub = (text) => dirs.reduce((t, dir) => t.split(dir).join('<project>'), String(text));

  const out = {};
  let calls = 0;
  // One library call: its projected answer, or — when it throws — the refusal's code and message.
  const call = async (key, fn, project = (x) => x) => {
    calls += 1;
    try {
      out[key] = project(await fn());
    } catch (err) {
      out[key] = { refused: true, code: err.code ?? null, message: scrub(err.message) };
    }
  };
  const entry = (e) => ({ status: e.status, epic: e.epic });
  const listed = (l) => ({
    records: l.records.map((r) => [r.id, r.status, r.epic]),
    broken: l.broken.map((x) => ({ id: x.id, path: x.path, code: x.code ?? null, message: scrub(x.error) })),
  });
  const findings = (list) => list.map((f) => ({ code: f.code, id: f.id ?? null, path: f.path ?? null, message: scrub(f.message) }));
  const advisories = (list) => list.map((f) => ({ check: f.check, severity: f.severity, file: f.file, message: scrub(f.message) }));
  const store = (base, items) => {
    put(base, '.planning/STATE.md', STATE);
    put(base, '.planning/work/WORK.md', '---\nkey: LEAF\nschema_version: 2\n---\n');
    for (const record of items) put(base, records.recordPath(record.id), serializeRecord(record));
  };

  try {
    // ── A ──────────────────────────────────────────────────────────────────
    store(a, [
      ...[1, 2, 3, 4, 5, 6].map((n) => item(`LEAF-${n}`, [created, triaged])),
      item('LEAF-7', [created, triaged, queued('M9.E2'), closed]),
      item('LEAF-8', [created, triaged, queued('M9.E3'), closed]),
    ]);
    put(a, '.planning/MILESTONE-9.md', MILESTONE);
    put(a, '.planning/M9.E1-PLAN.md', '# M9.E1 plan\n');
    put(a, '.planning/M9.E1-VERIFICATION.md', PASS('M9.E1'));
    put(a, '.planning/M9.E1-RETROSPECTIVE.md', RETRO('M9.E1'));
    put(a, '.planning/M9.E2-PLAN.md', '# M9.E2 plan\n');
    put(a, '.planning/M9.E9-PLAN.md', '# M9.E9 plan\n');
    put(a, '.planning/archive/epics/M9.E3/README.md', '# M9.E3\n');
    await regenerateViews(a);
    gitRepo(a, origin);

    // The edit hook, on a path of each kind.
    const hook = (rel) => () => checkWorkWrite({ filePath: join(a, rel), cwd: a, tool: 'Write', input: { file_path: join(a, rel), content: 'x' } });
    const blocked = (r) => ({ block: r.block, ...(r.reason === undefined ? {} : { message: scrub(r.reason) }) });
    await call('hook.itemRecord', hook(records.recordPath('LEAF-1')), blocked);
    await call('hook.itemBody', hook(records.recordPath('LEAF-1').replace(/\.json$/, '.md')), blocked);
    await call('hook.view', hook('.planning/BUGS.md'), blocked);
    await call('hook.epicsView', hook('.planning/work/EPICS.md'), blocked);
    await call('hook.planningDoc', hook('.planning/M9.E2-PLAN.md'), blocked);
    await call('hook.unitRecord', hook('.planning/work/units/M9.E1.json'), blocked);
    await call('hook.unitsFolderNote', hook('.planning/work/units/NOTES.md'), blocked);

    // The schema's own answer for an item event naming each kind of unit.
    const valid = (epic) => () => validateRecord(item('LEAF-90', [created, triaged, queued(epic)])).length === 0;
    await call('validate.epic', valid('M9.E2'));
    for (const name of NOT_EPICS) await call(`validate.notEpic.${name}`, valid(name));
    await call('validate.leavesFolder', valid('../x'));
    await call('validate.long', valid(LONG_EPIC));

    // The item readers, on the clean store.
    await call('a.list', () => records.listRecords(a), listed);
    await call('a.check', () => records.checkRecords(a), findings);

    // The item writers, by the kind of name they are given.
    const queue = (id, epic) => () => records.queueItem(a, id, { epic, by, at: AT });
    const start = (id, epic) => () => records.startItem(a, id, { epic, by, at: AT });
    await call('queue.epic', queue('LEAF-2', 'M9.E2'), entry);
    for (const name of NOT_EPICS) await call(`queue.notEpic.${name}`, queue('LEAF-1', name), entry);
    await call('queue.leavesFolder', queue('LEAF-1', '../x'), entry);
    await call('queue.archivedEpic', queue('LEAF-1', 'M9.E3'), entry);
    await call('queue.notText', queue('LEAF-1', 7), entry);
    await call('queue.missing', queue('LEAF-1', undefined), entry);
    await call('start.epic', start('LEAF-3', 'M9.E2'), entry);
    for (const name of NOT_EPICS) await call(`start.notEpic.${name}`, start('LEAF-4', name), entry);
    await call('start.archivedEpic', start('LEAF-4', 'M9.E3'), entry);
    await call('reopen.inEpic', () => records.reopenItem(a, 'LEAF-7', { reason: 'it came back', by, at: AT }), entry);
    await call('reopen.inArchivedEpic', () => records.reopenItem(a, 'LEAF-8', { reason: 'it came back', by, at: AT }), entry);
    await call('a.listAfterWrites', () => records.listRecords(a), listed);
    await call('a.checkAfterWrites', () => records.checkRecords(a), findings);

    // The closure readers.
    await call('closures', () => resolveClosures(a), (r) => r.units.map((u) => [u.unit, u.status]).sort());
    for (const id of ['M9.E1', 'M9.E2', 'M9.E9']) await call(`isEpicDone.${id}`, () => isEpicDone(a, id), (r) => r.status);
    await call('isEpicArchived.M9.E3', () => records.isEpicArchived(a, 'M9.E3'));
    await call('isEpicArchived.M9.E2', () => records.isEpicArchived(a, 'M9.E2'));
    await call('closeEpicCheck.M9.E2', () => records.closeEpicCheck(a, 'M9.E2'), (r) => ({ ok: r.ok, open: (r.open ?? []).map((o) => o.id ?? o) }));
    await call('migrateClosedUnits', () => resolveMigrateClosedUnits(a), (r) => [...(r.closedUnits ?? r)].sort());
    await call('nextEpicId', () => deriveNextEpicId(a, { milestone: '9' }), (r) => (typeof r === 'string' ? r : r?.id ?? r));
    await call('driftChecks', () => runDriftChecks(a), (r) => r.results.map((c) => [c.id, c.status, c.findings.length]));
    await call('sweep', () => checkWorkStore(a), advisories);
    await call('listClosing', () => records.listClosing(a), (r) => ({ closing: r.closing.map((x) => x.id), broken: r.broken.map((x) => x.id) }));

    // The archive plan, and the migration on a project already on the store.
    const names = (list) => (list ?? []).map((x) => (typeof x === 'string' ? x : x.unit ?? x.id)).sort();
    await call('senseArchiveTree', () => senseArchiveTree(a), (r) => ({
      moves: r.moves.map((m) => [m.from, m.to]).sort(),
      closedEpicIds: [...r.closedEpicIds].sort(),
      closedUnits: [...r.closedUnits].sort(),
      dropped: names(r.dropped),
      held: r.held,
    }));
    const migrated = (r) => ({
      applied: r.applied, refused: r.refused === true, dryRun: r.dryRun === true, unitsOnly: r.unitsOnly === true,
      units: r.units === undefined ? null : names(r.units),
      ...(r.reason === undefined ? {} : { message: scrub(r.reason) }),
    });
    await call('migrate.dryRun', () => runWorkStoreMigrate(a, { stamp: 'fixed-stamp' }), migrated);
    await call('migrate.applyWithoutHash', () => runWorkStoreMigrate(a, { apply: true, stamp: 'fixed-stamp' }), migrated);
    await call('a.treeAfterMigrateCalls', () => tree(a));

    let report = null;
    await call('archive.report', async () => {
      report = await buildArchiveReport(a);
      return report;
    }, (r) => ({
      plan: r.plan.map((p) => p.unit),
      moves: r.moves.map((m) => [m.from, m.to]).sort(),
      refusals: r.refusals.map((x) => x.unit).sort(),
      counts: r.counts,
      settled: r.settled,
    }));
    await call('archive.printed', () => renderArchiveReport(report));
    await call('archive.apply', () => applyArchive(a), (r) => ({ applied: r?.applied ?? null, moved: (r?.moved ?? r?.moves ?? []).length }));
    await call('a.treeAfterApply', () => tree(a).filter((f) => !f.startsWith('.planning/work/')));

    // ── B: the sentence the migrate dry run prints for a closed unit it does not move
    put(b, '.planning/STATE.md', STATE);
    put(b, '.planning/M9.E1-PLAN.md', '# M9.E1 plan\n');
    put(b, '.planning/M9.E1-VERIFICATION.md', PASS('M9.E1'));
    put(b, '.planning/M9.E1-RETROSPECTIVE.md', '# retro\n\n[FILL IN]\n');
    let dryRun = [];
    await call('b.dryRunWithoutTheSentence', async () => {
      dryRun = scrub(await renderDryRun(b)).split('\n');
      return dryRun;
    }, (lines) => {
      const i = lines.findIndex((l) => l.includes('resolve as CLOSED'));
      if (i === -1) return lines;
      const end = lines.findIndex((l, n) => n > i && l.includes('This is a gap'));
      out.gapSentence = lines.slice(i, end + 1);
      return [...lines.slice(0, i), '<the sentence>', ...lines.slice(end + 1)];
    });

    // ── C: a record placed by hand that names a unit which is not an Epic ID
    store(c, [item('LEAF-1', [created, triaged]), item('LEAF-3', [created, triaged, queued('M9.E2')])]);
    await regenerateViews(c);
    put(c, records.recordPath('LEAF-2'), byHand(item('LEAF-2', [created, triaged, queued('phase-11'), closed])));
    await call('byHand.notEpic.list', () => records.listRecords(c), listed);
    await call('byHand.notEpic.check', () => records.checkRecords(c), findings);
    await call('byHand.notEpic.get', () => records.getRecord(c, 'LEAF-2'), entry);
    await call('byHand.notEpic.getAnother', () => records.getRecord(c, 'LEAF-3'), entry);
    await call('byHand.notEpic.reopen', () => records.reopenItem(c, 'LEAF-2', { reason: 'it came back', by, at: AT }), entry);
    await call('byHand.notEpic.queueAnother', () => records.queueItem(c, 'LEAF-1', { epic: 'M9.E2', by, at: AT }), entry);
    await call('byHand.notEpic.sweep', () => checkWorkStore(c), advisories);

    // ── D: a name over 100 characters
    store(d, [item('LEAF-1', [created, triaged]), item('LEAF-2', [created, triaged]), item('LEAF-3', [created, triaged, queued('M9.E2')])]);
    await regenerateViews(d);
    await call('long.queue', () => records.queueItem(d, 'LEAF-1', { epic: LONG_EPIC, by, at: AT }), entry);
    await call('long.start', () => records.startItem(d, 'LEAF-2', { epic: LONG_EPIC, by, at: AT }), entry);
    put(d, records.recordPath('LEAF-9'), byHand(item('LEAF-9', [created, triaged, queued(LONG_EPIC), closed])));
    await call('long.byHand.list', () => records.listRecords(d), listed);
    await call('long.byHand.check', () => records.checkRecords(d), findings);
    await call('long.byHand.get', () => records.getRecord(d, 'LEAF-9'), entry);
    await call('long.byHand.reopen', () => records.reopenItem(d, 'LEAF-9', { reason: 'it came back', by, at: AT }), entry);

    out.calls = calls;
    return out;
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  }
}
