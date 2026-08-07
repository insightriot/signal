// tools/lib/archive-command.js — the data + rendering behind `/sig:archive` (M5.E19).
//
// WHY THIS EXISTS, given `/sig:migrate-memory` already archives (D-M5E19-6).
// Archiving was never unwired — it was only ever reachable through a command
// about document LAYOUT, whose dry-run interleaves a reorganization plan with an
// archive plan. This module answers the archiving question on its own.
//
// WHAT S1 FOUND, and what this module exists to fix. Run against
// `examples/sandbox/`, the existing helpers reported the two units that WOULD
// move and the one that could not be evaluated — and said nothing at all about
// the three that were considered and REFUSED. A reader could not distinguish
// "examined and declined" from "never looked at", which is `B39`'s shape in the
// reporting layer. The sharpest case is the stub-retro veto: `resolveClosures`
// reports the unit CLOSED and the archive gate refuses it one layer later, and
// today that refusal is silent — the most surprising thing the command does.
//
// `explainArchiveOutcome` is not wrong; its consumer asks "why is this count
// what it is?", not "what did you decide about each unit?". This module owes the
// second answer, so it reports EVERY unit exactly once.
//
// SEPARATION: `buildArchiveReport` reads and decides nothing about presentation;
// `renderArchiveReport` presents and decides nothing about content. A renderer
// that re-derives is how a second implementation of one rule is born — `B82`,
// one week earlier, in a neighbouring module.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { PLANNING_DIR } from './state.js';
import { senseArchiveTree, applyArchiveTree } from './archive-tree.js';
import { resolveClosures, CLOSURE } from './closure.js';
import { deriveUnits } from './work-units.js';

/**
 * Everything `/sig:archive` needs to decide and to say, in one read.
 *
 * Read-only. Never throws for a project-shaped reason — an unreadable STATE.md
 * or an unlistable `.planning/` is a REPORTED refusal, not an exception, because
 * a command that dies cannot tell you why it archived nothing.
 *
 * @param {string} baseDir
 * @returns {Promise<{
 *   plan: Array<{unit: string, dir: string, files: string[]}>,
 *   moves: Array<{from: string, to: string}>,
 *   refusals: Array<{unit: string, status: string, reason: string}>,
 *   ungrouped: string[],
 *   dropped: Array<{unit: string, reason: string}>,
 *   stateReadable: boolean,
 *   reason: string|null,
 *   counts: {units: number, archiving: number, refused: number, files: number},
 * }>}
 */
export async function buildArchiveReport(baseDir) {
  const empty = {
    plan: [], moves: [], refusals: [], ungrouped: [], dropped: [],
    stateReadable: false, reason: null,
    counts: { units: 0, archiving: 0, refused: 0, files: 0 },
  };

  let names;
  try {
    names = (await readdir(join(baseDir, PLANNING_DIR))).filter((f) => f.endsWith('.md'));
  } catch (err) {
    return { ...empty, reason: `${PLANNING_DIR}/ could not be listed — ${err.message}` };
  }

  const closures = await resolveClosures(baseDir);
  const sense = await senseArchiveTree(baseDir);
  const { ungrouped } = deriveUnits(names);

  // AN UNREADABLE STATE.md REFUSES EVERYTHING — and this guard is load-bearing,
  // not defensive. Found by this module's own test (AC-S2.5), which is the only
  // reason it is here.
  //
  // `resolveClosures` correctly degrades every unit to `cannotDetermine` when it
  // cannot read STATE.md. `senseArchiveTree` does NOT: its retro-derived half
  // needs no STATE at all, so it happily reports a unit closed on the strength
  // of a retrospective file. Composing the two naively takes the PLAN from the
  // source that cannot see the danger and the REFUSALS from the source that can
  // — so a project with no STATE.md would have been handed a plan to archive
  // work that might be the current unit.
  //
  // That is the exact failure the retired tool shipped: proposing to archive
  // live work because nothing checked whether it was finished. Without STATE.md
  // there is no way to know which unit is current, and a current unit must never
  // be archived, so the honest answer is to refuse the whole run and say why.
  if (!closures.stateReadable) {
    return {
      plan: [],
      moves: [],
      refusals: closures.units.map((u) => ({
        unit: u.unit,
        status: u.status,
        reason: u.reason,
      })),
      ungrouped,
      dropped: sense.dropped ?? [],
      stateReadable: false,
      reason: closures.reason,
      counts: { units: closures.units.length, archiving: 0, refused: closures.units.length, files: 0 },
    };
  }

  // Group the flat move list by unit. Keyed on the destination directory, which
  // `planArchiveMoves` derived — NOT re-derived from the unit name here, which
  // would be a second implementation of the same mapping.
  const byUnit = new Map();
  for (const unit of sense.closedUnits ?? []) byUnit.set(unit, { unit, dir: null, files: [] });
  for (const m of sense.moves) {
    const file = m.from.slice(m.from.lastIndexOf('/') + 1);
    const dir = m.to.slice(0, m.to.lastIndexOf('/'));
    // Find the owning unit by asking which closed unit's plan contains this file.
    for (const [unit, rec] of byUnit) {
      if (m.to.startsWith(`${dir}/`) && dirOwns(dir, unit)) {
        rec.dir = dir;
        rec.files.push(file);
        break;
      }
    }
  }
  const plan = [...byUnit.values()].filter((r) => r.files.length > 0);
  plan.forEach((r) => r.files.sort());
  plan.sort((a, b) => a.unit.localeCompare(b.unit));

  const archiving = new Set(plan.map((r) => r.unit));

  // EVERY unit the resolver knows about that is not archiving is a refusal with
  // its reason. This is the S1 finding: previously only `cannotDetermine` was
  // surfaced, so open and stub-vetoed units vanished from the output entirely.
  const refusals = [];
  for (const u of closures.units) {
    if (archiving.has(u.unit)) continue;
    refusals.push({
      unit: u.unit,
      status: u.status,
      // A closed-by-verdict unit that is NOT archiving was vetoed downstream —
      // today that means a stub retrospective (`B64`). Naming the veto is the
      // point: without it the most surprising refusal is the least explained.
      reason:
        u.status === CLOSURE.CLOSED
          ? `${u.reason} — but it is NOT archiving: its retrospective is a stub ` +
            '(a file existing is not the unit being finished)'
          : u.reason,
    });
  }
  refusals.sort((a, b) => a.unit.localeCompare(b.unit));

  return {
    plan,
    moves: sense.moves,
    refusals,
    ungrouped,
    dropped: sense.dropped ?? [],
    stateReadable: closures.stateReadable,
    reason: closures.reason,
    counts: {
      units: closures.units.length,
      archiving: plan.length,
      refused: refusals.length,
      files: sense.moves.length,
    },
  };
}

/** Does `dir` belong to `unit`? Epic dirs are `archive/M5/E1`, flat ones `archive/UNIT`. */
function dirOwns(dir, unit) {
  const last = dir.slice(dir.lastIndexOf('/') + 1);
  if (last === unit) return true; // flat per-unit directory
  // Epic form: `.planning/archive/M1/E1` for unit `M1.E1`
  const parts = dir.split('/');
  if (parts.length < 2) return false;
  const guess = `${parts[parts.length - 2]}.${last}`;
  return guess === unit;
}

/**
 * Present the report. Decides nothing; every fact comes from `buildArchiveReport`.
 *
 * The load-bearing property is that **checked-and-clean never renders the same as
 * could-not-check**. An empty plan has three distinct causes and the reader must
 * be able to tell them apart, or a detector that never looked reads as one that
 * found nothing (`B39`, and the whole of M5.E16).
 *
 * @param {object} report
 * @param {{apply?: boolean}} [opts]
 * @returns {string[]} lines
 */
export function renderArchiveReport(report, opts = {}) {
  const applied = opts.apply === true;
  const L = [];
  const { plan, refusals, ungrouped, dropped, stateReadable, reason, counts } = report;

  L.push(applied ? '== Archive — applied ==' : '== Archive — dry run (nothing written) ==', '');

  if (!stateReadable) {
    L.push(
      `⚠ Could not evaluate anything: ${reason || 'STATE.md could not be read.'}`,
      '  Nothing is proposed because nothing could be CHECKED — a refusal, not a clean',
      '  result. Without STATE.md there is no way to tell which unit is current, and a',
      '  current unit must never be archived.',
      ''
    );
    return L;
  }

  if (plan.length === 0) {
    // FR6.1 — say WHICH kind of nothing this is.
    if (counts.units === 0) {
      L.push('No units found in .planning/ — there is nothing here to archive.', '');
    } else {
      L.push(
        `Nothing to archive: all ${counts.units} unit(s) were checked and none is finished.`,
        '(This is a clean result, not a failed check — see the refusals below.)',
        ''
      );
    }
  } else {
    L.push(applied ? `Archived ${counts.files} file(s):` : `Would archive ${counts.files} file(s):`);
    for (const u of plan) {
      L.push(`  ${u.unit}  →  ${u.dir}/  (${u.files.length} file${u.files.length === 1 ? '' : 's'})`);
      for (const f of u.files) L.push(`      ${f}`);
    }
    L.push('');
  }

  if (refusals.length > 0) {
    L.push(`Not archived (${refusals.length}) — each was checked and declined:`);
    for (const r of refusals) L.push(`  ${r.unit}  [${r.status}]  ${r.reason}`);
    L.push('');
  }

  // FR5 — unconditional, including at zero, AND labelled. S1 found that the
  // sandbox's ungrouped set is PROFILE/STATE plus the two retrospectives, all
  // correct: `SCAFFOLD_SUFFIXES` excludes RETROSPECTIVE by design. A bare count
  // would read as a defect.
  if (ungrouped.length === 0) {
    L.push('Ungrouped files: 0 — every .md in .planning/ belongs to a unit.');
  } else {
    L.push(
      `Ungrouped files: ${ungrouped.length} (not part of any unit, never archived) —`,
      `  ${ungrouped.join(', ')}`,
      '  Retrospectives and project-level files stay in the root on purpose.'
    );
  }

  if (dropped.length > 0) {
    L.push('', `Dropped (${dropped.length}) — unsafe unit name, cannot be a directory:`);
    for (const d of dropped) L.push(`  ${d.unit} — ${d.reason}`);
  } else {
    L.push('Dropped: 0 — every derived unit was considered.');
  }

  if (!applied && plan.length > 0) {
    L.push('', 'Nothing was written. Re-run with --apply to move these files.');
  }
  return L;
}

/**
 * Perform the archive. Thin by design — `applyArchiveTree` already does the
 * move + byte-identical read-back assert + referrer rewrite.
 *
 * NOTE (`AC-S5.3`): this is `applyArchiveTree`'s SECOND caller ever. Its first
 * and only caller until now was `/sig:migrate-memory`'s apply path, which holds
 * one coarse lock and passes `v3Rename` from its own sense. Here there is no
 * migration in flight, so `v3Rename` is false and no lock is held — the module
 * is documented lock-free, and this exercises that claim for the first time.
 *
 * @param {string} baseDir
 * @returns {Promise<{applied: boolean, moves: Array, rewrittenFiles: number}>}
 */
export async function applyArchive(baseDir) {
  const res = await applyArchiveTree(baseDir, { apply: true, v3Rename: false });
  return { applied: true, moves: res.moves, rewrittenFiles: res.rewrittenFiles };
}
