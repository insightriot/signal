// tools/lib/closure.js — M5.E18 S4 (FR2). Closure has THREE outcomes.
//
// `closed` requires all three of: a terminal artifact · not the current unit ·
// a passing, READABLE verdict. Anything else that is not clearly `open` is
// `cannotDetermine` — a value in the returned structure, not a rendering
// decision (AC2.1), so a caller can count three statuses without re-reading a
// single file.
//
// Why the third status exists at all. Every archive path Signal has shipped
// answered a two-way question — closed or not — and a two-way answer forces
// every ambiguity into one of the two buckets. Measured on the real corpus at
// S3: **30 terminal artifacts, 9 of them (30%) carry no verdict this code will
// read**. Under a boolean those 9 become whichever side the implementer
// defaulted to, silently. `eval-project-E`'s VERIFICATION is the case that
// settles it — its body says `**All 22 acceptance criteria pass.**`, a
// lowercase `pass` inside prose that a body scan cannot distinguish from
// "Only 3 of 22 criteria pass." Reading it would produce a CONFIDENT WRONG
// ANSWER. It goes to `cannotDetermine`, where FR4 reports it as needing a
// person.
//
// The ordering of the clauses is load-bearing and is documented at each step.
//
// ---- On read failures, this module deliberately disagrees with its neighbours.
//
// Three places now read a retro/artifact and must decide what an EACCES means.
// They do NOT answer the same way, and that is intentional — do not "fix" one
// to match the others:
//
//   detectDirtyExecute      unreadable -> stay silent   (don't ACCUSE)
//   checkEpicWithoutRetro   unreadable -> treat present (don't ACCUSE)
//   resolveUnitClosure      unreadable -> cannotDetermine (SURFACE it)
//
// The first two are accusations aimed at a person — "you never wrote this" —
// and a permissions error is not evidence for that claim, so they fall silent.
// Closure is a decision aimed at a FILE: `closed` authorises archiving. Staying
// quiet there would let a unit be archived because we failed to read the thing
// that would have said not to. Never close what you could not read.
//
// Same failure, opposite postures, because the cost of being wrong points in
// opposite directions.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readState } from './state.js';
import { deriveUnits, currentUnit } from './work-units.js';
import { parseVerdict, rankTerminalArtifacts } from './verdict.js';

const PLANNING_DIR = '.planning';

/**
 * The three outcomes. `cannotDetermine` is deliberately camelCase to match the
 * requirement's own vocabulary (FR2 / AC2.1) rather than being renamed here.
 */
export const CLOSURE = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'open',
  CANNOT_DETERMINE: 'cannotDetermine',
});

/**
 * The suffix of a terminal artifact, used to group same-authority files.
 * `rankTerminalArtifacts` already orders them; this recovers the rank key so
 * conflicting verdicts are only compared WITHIN one authority level.
 */
function terminalSuffix(filename) {
  const m = filename.match(/-([A-Z0-9]+)\.md$/);
  return m ? m[1] : null;
}

/**
 * Resolve one unit's closure from its files.
 *
 * Clause order (each is a decision, not an accident):
 *
 *  1. **Current unit → `open`.** Checked first and without reading anything.
 *     A unit being actively worked cannot be closed no matter what its
 *     artifacts say — `eval-project-I`'s `M1` has a VERIFICATION and IS the
 *     current unit (AC2.4), and this clause is the whole not-current gate.
 *  2. **STATE unreadable → `cannotDetermine`.** Handled by the caller, which
 *     cannot evaluate clause 1 at all in that case. Never `closed`: closing a
 *     unit *because* we failed to read what is current is the exact shape this
 *     Epic exists to remove.
 *  3. **No terminal artifact → `open`.** Nothing claims this unit finished, so
 *     it is not ambiguous — it is unfinished. This is the "clearly open" half
 *     of FR2's fallback.
 *  4. **Terminal artifact present** — read the highest authority level that
 *     yields any readable verdict.
 *       - verdicts at that level disagree → `cannotDetermine` (AC2.10)
 *       - `fail` → `open` (AC2.5) — a real answer, and the answer is "not done"
 *       - `pass` → `closed`
 *       - nothing readable at any level → `cannotDetermine` (AC2.2′)
 *     A read error on any one artifact makes THIS unit `cannotDetermine` and
 *     leaves every other unit unaffected (AC2.11).
 *
 * @param {object} args
 * @param {string} args.unit
 * @param {string[]} args.files          bare filenames belonging to the unit
 * @param {string|null} args.currentUnitId
 * @param {string} args.planningDir      absolute path
 * @param {(p: string) => Promise<string>} [args.readFileFn]  DI for testing
 * @returns {Promise<{unit: string, status: string, reason: string, evidence: string|null}>}
 */
export async function resolveUnitClosure(args) {
  const { unit, files, currentUnitId, planningDir } = args;
  const readFileFn = args.readFileFn ?? ((p) => readFile(p, 'utf-8'));

  // 1. Not-current. Compared against the RAW field (S2 / D-M5E18-4): two real
  // projects carry a non-strict unit name there, and a strict-gated read would
  // return null and silently never fire this clause.
  if (currentUnitId !== null && unit === currentUnitId) {
    return {
      unit,
      status: CLOSURE.OPEN,
      reason: `${unit} is the current unit — mid-flight, not closed`,
      evidence: null,
    };
  }

  // 3. No terminal artifact at all.
  const ranked = rankTerminalArtifacts(files);
  if (ranked.length === 0) {
    return {
      unit,
      status: CLOSURE.OPEN,
      reason: `${unit} has no terminal artifact — nothing claims it finished`,
      evidence: null,
    };
  }

  // 4. Walk authority levels in rank order. `rankTerminalArtifacts` already
  // sorted them; group by suffix so a disagreement is only ever detected
  // between artifacts of EQUAL authority. A VERIFICATION outranking a SHIP is
  // resolution, not conflict — that distinction is why S3 built the ranking.
  const levels = [];
  for (const file of ranked) {
    const suffix = terminalSuffix(file);
    const last = levels[levels.length - 1];
    if (last && last.suffix === suffix) last.files.push(file);
    else levels.push({ suffix, files: [file] });
  }

  for (const level of levels) {
    const readable = [];
    for (const file of level.files) {
      let content;
      try {
        content = await readFileFn(join(planningDir, file));
      } catch (err) {
        // AC2.11 — scoped to this unit. The run continues; every other unit is
        // reported. An unreadable file is not evidence of closure.
        return {
          unit,
          status: CLOSURE.CANNOT_DETERMINE,
          reason: `${file} could not be read — ${err.message}`,
          evidence: null,
        };
      }
      const v = parseVerdict(content);
      if (v.status !== 'unreadable') readable.push({ file, ...v });
    }

    if (readable.length === 0) continue; // try the next authority level down

    // AC2.10 — a unit folded from a split pair can contribute two artifacts of
    // the SAME authority. If they disagree there is no answer to give, and
    // picking one would be a guess dressed as a result. The in-rule fallback.
    const distinct = new Set(readable.map((r) => r.status));
    if (distinct.size > 1) {
      return {
        unit,
        status: CLOSURE.CANNOT_DETERMINE,
        reason:
          `${unit} has conflicting ${level.suffix} verdicts — ` +
          readable.map((r) => `${r.file}: ${r.status}`).join(', '),
        evidence: readable.map((r) => r.evidence).filter(Boolean).join(' | '),
      };
    }

    const [{ status, evidence, file }] = readable;
    if (status === 'fail') {
      return {
        unit,
        status: CLOSURE.OPEN,
        reason: `${file} records a FAIL — the unit is not closed`,
        evidence,
      };
    }
    return {
      unit,
      status: CLOSURE.CLOSED,
      reason: `${file} records a PASS, and ${unit} is not the current unit`,
      evidence,
    };
  }

  // AC2.2′ — terminal artifacts exist but not one of them states a value we
  // will read. Never `closed` (it was never claimed), never `open` (something
  // does claim to be terminal). Fixtures: eval-project-C/PHASE8-SHIP.md,
  // eval-project-L/T25-VERIFICATION.md.
  return {
    unit,
    status: CLOSURE.CANNOT_DETERMINE,
    reason:
      `${unit} has ${ranked.length} terminal artifact(s) but none states a readable ` +
      `verdict (${ranked.join(', ')})`,
    evidence: null,
  };
}

/**
 * Resolve closure for every unit in a project.
 *
 * Always completes. A failure that scopes to one unit stays there; a failure
 * that scopes to the whole project (STATE.md) makes every unit
 * `cannotDetermine` rather than dropping units or throwing — silence about
 * blindness is the defect M5.E16 shipped a whole Epic to remove.
 *
 * @param {string} baseDir
 * @param {{files?: string[], readFileFn?: Function, suffixes?: readonly string[]}} [opts]
 * @returns {Promise<{units: Array, counts: {closed:number, open:number, cannotDetermine:number}, stateReadable: boolean, reason: string|null}>}
 */
export async function resolveClosures(baseDir, opts = {}) {
  const planningDir = join(baseDir, PLANNING_DIR);

  // AC2.11 — a throwing `readState` is a LIVE path, not a defensive one:
  // `eval-project-B` throws on one of the 12 real projects. Without the current
  // unit we cannot evaluate the not-current clause for ANY unit, so nothing is
  // closed and every unit says why. Reporting them as `open` would be a guess;
  // dropping them would be the silence this Epic exists to stop.
  let state = null;
  let stateReadable = true;
  let stateReason = null;
  try {
    state = await readState(baseDir);
  } catch (err) {
    stateReadable = false;
    stateReason = `STATE.md could not be read — ${err.message}`;
  }
  if (state === null && stateReadable) {
    stateReadable = false;
    stateReason = `no ${PLANNING_DIR}/STATE.md — the current unit is unknown`;
  }

  let files = opts.files;
  if (!files) {
    try {
      const { readdir } = await import('node:fs/promises');
      files = (await readdir(planningDir)).sort();
    } catch (err) {
      return {
        units: [],
        counts: { closed: 0, open: 0, cannotDetermine: 0 },
        stateReadable,
        reason: `${PLANNING_DIR}/ could not be listed — ${err.message}`,
      };
    }
  }

  const { units } = deriveUnits(files, opts.suffixes ? { suffixes: opts.suffixes } : {});
  const currentUnitId = stateReadable ? currentUnit(state) : null;

  const results = [];
  for (const [unit, unitFiles] of [...units.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!stateReadable) {
      results.push({
        unit,
        status: CLOSURE.CANNOT_DETERMINE,
        reason: stateReason,
        evidence: null,
      });
      continue;
    }
    results.push(
      await resolveUnitClosure({
        unit,
        files: unitFiles,
        currentUnitId,
        planningDir,
        readFileFn: opts.readFileFn,
      })
    );
  }

  const counts = { closed: 0, open: 0, cannotDetermine: 0 };
  for (const r of results) counts[r.status] += 1;

  return { units: results, counts, stateReadable, reason: stateReason };
}
