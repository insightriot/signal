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
import { dirname, join } from 'node:path';

import { readState } from './state.js';
import { listUnits, unitRecordsOn } from './unit-records.js';
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
 * The project's unit records, for a closure reader (M6.E16 S6) — or null when
 * the project has none (`unitRecordsOn` is false: there is no `work/units/`
 * folder), which is when a reader does what it did before unit records.
 *
 * Never throws. One record that does not read is in `broken` under its ID with
 * the reason, and stops no other: a broken record has no honest answer, so a
 * reader must neither call its unit closed nor go back to the unit's files.
 *
 * **A folder that cannot be trusted is not "none"** (REVIEW pass 1, C-I4,
 * `D-M6E16-22`). When `work/units/` is there and is a link or a file, or it
 * cannot be listed, the result is not null: it has no record and carries the
 * fault in `problem`. Then NO unit has an honest answer — which units have a
 * record, which are closed and which are held are all unknown — so a reader
 * calls none closed, moves nothing, and does not go back to any unit's files.
 * `problem` is absent whenever the folder read.
 *
 * @param {string} baseDir
 * @returns {{byId: Map<string, {id: string, status: 'open'|'closing'|'closed', held: boolean,
 *   hold_reason: string|null, close: object|null, closing_proof: string|null}>,
 *   broken: Map<string, string>, problem?: string} | null}
 */
export function readUnitRecords(baseDir) {
  const unread = (problem) => ({ byId: new Map(), broken: new Map(), problem });
  let listed;
  try {
    if (!unitRecordsOn(baseDir)) return null;
    listed = listUnits(baseDir);
  } catch (err) {
    // The folder cannot be trusted, or failed between the two reads: an error, never "no unit records".
    return unread(err?.message ?? String(err));
  }
  return {
    byId: new Map(listed.units.map((u) => [u.id, u])),
    broken: new Map(listed.broken.filter((b) => b.id !== null).map((b) => [b.id, b.error])),
  };
}

// A unit's closure from its record (M6.E16 t6.1, `D-M6E16-2`). Closed when the
// record is closed — a held unit IS closed; the hold only stops its files
// moving, and the answer says so. Open when the record is open or *closing*: a
// close that is requested and not confirmed is not a close.
function closureFromRecord(unit, record) {
  if (record.status !== 'closed') {
    return {
      unit,
      status: CLOSURE.OPEN,
      reason: record.status === 'closing'
        ? `${unit}'s unit record is closing — its close is requested (${record.closing_proof}) and not yet confirmed`
        : `${unit}'s unit record is open`,
      evidence: null,
      source: 'record',
    };
  }
  const out = {
    unit,
    status: CLOSURE.CLOSED,
    reason: `${unit}'s unit record is closed (${record.close?.reason ?? 'closed'})`,
    evidence: null,
    source: 'record',
  };
  if (record.held) {
    out.reason += `, and held — ${record.hold_reason}`;
    out.held = true;
    out.hold_reason = record.hold_reason;
  }
  return out;
}

/**
 * Resolve one unit's closure — from its record when the project has unit
 * records and this unit has one, otherwise from its files.
 *
 * With a record (M6.E16 t6.1) the answer carries `source: 'record'`, and
 * `held: true` with `hold_reason` when the closed unit is held. A record that
 * does not read is `cannotDetermine` (`source: 'record'`), never read from the
 * unit's files; so is every unit when the `units/` folder itself cannot be
 * trusted (`readUnitRecords`' `problem`). Clause 1 below still comes first, with one exception: a
 * current unit whose own record reads closed is `closed`, with `current: true` — the record decides,
 * and the flag tells a caller that moves files to leave this unit's in place while it is current.
 * A unit with no record takes clauses 3 and 4.
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
 * @param {ReturnType<typeof readUnitRecords>} [args.unitRecords]  the project's unit records, when the
 *   caller has read them; read here (from the folder `planningDir` sits in) when not passed
 * @returns {Promise<{unit: string, status: string, reason: string, evidence: string|null,
 *   source?: 'record', held?: true, hold_reason?: string, current?: true}>}
 */
export async function resolveUnitClosure(args) {
  const { unit, files, currentUnitId, planningDir } = args;
  const readFileFn = args.readFileFn ?? ((p) => readFile(p, 'utf-8'));

  // With unit records, the unit's record decides when it has one (see above).
  const unitRecords = args.unitRecords === undefined ? readUnitRecords(dirname(planningDir)) : args.unitRecords;

  // 1. Not-current. Compared against the RAW field (S2 / D-M5E18-4): two real
  // projects carry a non-strict unit name there, and a strict-gated read would
  // return null and silently never fire this clause.
  //
  // One exception: the current unit's own record reads closed. Then the record
  // decides, as it does for every other reader — the answer is `closed`,
  // marked `current: true`, and whoever moves files leaves this unit's where
  // they are until another unit is current.
  const isCurrent = currentUnitId !== null && unit === currentUnitId;
  if (isCurrent) {
    const own = unitRecords !== null && typeof unitRecords.problem !== 'string' && !unitRecords.broken.has(unit)
      ? unitRecords.byId.get(unit) : undefined;
    if (own?.status !== 'closed') {
      return {
        unit,
        status: CLOSURE.OPEN,
        reason: `${unit} is the current unit — mid-flight, not closed`,
        evidence: null,
      };
    }
  }

  if (unitRecords !== null) {
    // The folder itself cannot be trusted: whether this unit has a record is
    // not known, so its files are not asked either.
    if (typeof unitRecords.problem === 'string') {
      return {
        unit,
        status: CLOSURE.CANNOT_DETERMINE,
        reason: `whether ${unit} has a unit record is not known — ${unitRecords.problem}`,
        evidence: null,
        source: 'record',
      };
    }
    if (unitRecords.broken.has(unit)) {
      return {
        unit,
        status: CLOSURE.CANNOT_DETERMINE,
        reason: `${unit}'s unit record could not be read — ${unitRecords.broken.get(unit)}`,
        evidence: null,
        source: 'record',
      };
    }
    const record = unitRecords.byId.get(unit);
    if (record !== undefined) {
      const out = closureFromRecord(unit, record);
      if (isCurrent) {
        out.current = true;
        out.reason += '; it is still the current unit, so its files stay until the next Epic opens';
      }
      return out;
    }
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

  // With unit records (M6.E16 t6.1) every unit that has a record is listed,
  // with or without a file left in `.planning/`: a unit whose files are all
  // archived had no entry here, so a shipped Epic was never seen.
  const unitRecords = readUnitRecords(baseDir);
  if (unitRecords !== null) {
    for (const id of [...unitRecords.byId.keys(), ...unitRecords.broken.keys()]) {
      if (!units.has(id)) units.set(id, []);
    }
  }

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
        unitRecords,
      })
    );
  }

  const counts = { closed: 0, open: 0, cannotDetermine: 0 };
  for (const r of results) counts[r.status] += 1;

  return { units: results, counts, stateReadable, reason: stateReason };
}
