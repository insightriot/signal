// A fixed project with the work store on and NO `work/units/`, and what the
// library says about it (M6.E16 VERIFY loop 1, AC6.4 as amended, `D-M6E16-20`).
//
// Used twice: by `tests/unit-records-off-parity.test.js`, against today's
// code; and once by hand against a checkout of `main`, to get the literal
// answers that test expects (how, and at which commit, is written in the
// test's header). So it imports nothing from this repository at the top: the
// library folder is an argument, and it calls only functions `v0.1.50` had.
//
// Every name is invented. Nothing outside a temp folder is read or written.

import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const AT = '2026-10-11T10:00:00.000Z';
const by = 'claude';

const STATE = [
  '---', 'schema_version: 1', 'phase: EXECUTE', 'current_epic: M9.E9', 'current_wave: null', 'current_tasks: []',
  'completed_phases: []', 'blockers: []', 'last_completed_task: null', '---', '', '# Project State', '',
].join('\n');
const PASS = (id) => `# ${id} verification\n\n**Verdict:** PASS\n`;
const RETRO = (id) => `# ${id} Retrospective\n\nOutcome: shipped 2026-09-01 (${id}).\nDecision D-${id.replace('.', '')}-1 locked. FR1 done. AC1 verified.\n`;

const item = (id, events) => ({ id, type: 'FEAT', title: `title of ${id}`, events });
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };

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

const refusal = async (fn) => {
  try {
    await fn();
    return null;
  } catch (err) {
    return { code: err.code ?? null, message: String(err.message) };
  }
};

/**
 * @param {string} libDir — absolute path of a `plugin/tools/lib/` folder
 * @returns {Promise<object>} the answers; see the test for each field
 */
export async function captureUnitsOff(libDir) {
  const lib = (name) => import(pathToFileURL(join(libDir, name)).href);
  const records = await lib('work-records.js');
  const { serializeRecord, validateRecord } = await lib('work-record.js');
  const { resolveClosures } = await lib('closure.js');
  const { buildArchiveReport, renderArchiveReport, applyArchive } = await lib('archive-command.js');
  const { renderDryRun } = await lib('migrate-memory.js');

  // Project A: three units read from their files, and a store keyed LEAF.
  //   M9.E1 — PLAN, a PASS verdict, a filled retrospective: closed, and it moves
  //   M9.E2 — PLAN only: open
  //   M9.E9 — the current Epic: open
  const a = mkdtempSync(join(tmpdir(), 'sig-units-off-a-'));
  // Project B: the one shape that reaches the reworded sentence — a PASS
  // verdict and a retrospective still holding a placeholder.
  const b = mkdtempSync(join(tmpdir(), 'sig-units-off-b-'));
  try {
    put(a, '.planning/STATE.md', STATE);
    put(a, '.planning/work/WORK.md', '---\nkey: LEAF\nschema_version: 2\n---\n');
    put(a, records.recordPath('LEAF-1'), serializeRecord(item('LEAF-1', [created, triaged])));
    put(a, records.recordPath('LEAF-2'), serializeRecord(item('LEAF-2', [created, triaged])));
    put(a, '.planning/M9.E1-PLAN.md', '# M9.E1 plan\n');
    put(a, '.planning/M9.E1-VERIFICATION.md', PASS('M9.E1'));
    put(a, '.planning/M9.E1-RETROSPECTIVE.md', RETRO('M9.E1'));
    put(a, '.planning/M9.E2-PLAN.md', '# M9.E2 plan\n');
    put(a, '.planning/M9.E9-PLAN.md', '# M9.E9 plan\n');

    const out = {};
    // (1) an item queued for a unit name that is not an Epic ID
    out.queueNonEpic = await refusal(() => records.queueItem(a, 'LEAF-1', { epic: 'phase-11', by, at: AT }));
    out.queueNonEpicLeftItem = JSON.parse(readFileSync(join(a, records.recordPath('LEAF-1')), 'utf-8')).events.map((e) => e.type);
    // the control: an Epic ID is accepted, as it was
    out.queueEpic = await refusal(() => records.queueItem(a, 'LEAF-2', { epic: 'M9.E2', by, at: AT }));
    // (2) the schema's own answer for an item event naming such a unit
    out.validateNonEpic = validateRecord(item('LEAF-3', [created, triaged, { type: 'queued', at: AT, by, epic: 'phase-11' }]));
    out.validateBadName = validateRecord(item('LEAF-3', [created, triaged, { type: 'queued', at: AT, by, epic: '../x' }])).length > 0;

    // Closure answers, and (3) the archive report
    const closures = await resolveClosures(a);
    out.closures = closures.units.map((u) => [u.unit, u.status]).sort();
    const report = await buildArchiveReport(a);
    out.report = {
      plan: report.plan.map((p) => p.unit),
      moves: report.moves.map((m) => [m.from, m.to]).sort(),
      refusals: report.refusals.map((r) => r.unit).sort(),
      counts: report.counts,
      settled: report.settled,
    };
    out.printed = renderArchiveReport(report);
    await applyArchive(a);
    out.treeAfterApply = tree(a).filter((f) => !f.startsWith('.planning/work/'));

    // (4) the sentence the migrate dry run prints for a closed unit it does not move
    put(b, '.planning/STATE.md', STATE);
    put(b, '.planning/M9.E1-PLAN.md', '# M9.E1 plan\n');
    put(b, '.planning/M9.E1-VERIFICATION.md', PASS('M9.E1'));
    put(b, '.planning/M9.E1-RETROSPECTIVE.md', '# retro\n\n[FILL IN]\n');
    const lines = (await renderDryRun(b)).split('\n');
    const i = lines.findIndex((l) => l.includes('resolve as CLOSED'));
    out.gapSentence = i === -1 ? null : lines.slice(i, lines.findIndex((l, n) => n > i && l.includes('This is a gap')) + 1);
    return out;
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
}
