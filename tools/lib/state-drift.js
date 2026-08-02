// tools/lib/state-drift.js — M5.E16: what `.planning/` asserts vs. what is on
// disk and in git.
//
// READ-ONLY, OFFLINE, DETERMINISTIC. Nothing here writes (NFR2 / D-M5E16-1):
// `/sig:sweep` is detect-and-report, and FR4's "Signal runs it" was resolved in
// NFR2's favour — healing happens at the phase transition (FR5) and behind an
// explicit `/sig:sweep --heal`, never as a side effect of looking.
//
// ── Why the harness exists before any check does ──────────────────────────────
//
// The PLAN-time probe measured every candidate check against 13 real .planning/
// trees. Checks (a) and (b) — the two aimed at the incident that opened this
// Epic — can evaluate 2 of them. Signal's own shape (hand-maintained, Epic-mode,
// schema_version 1) is the MINORITY shape: 4 of 12 readable projects are in Epic
// mode, 7 of 12 have a canonical `phase`, and `readState` THROWS on one outright.
//
// A detector that returns nothing on the other 11 reads as "clean" when it never
// looked. That is `B39`'s shape (an instruction nothing executed) and `B54`'s (a
// guard that was wrong precisely because nothing called it) — and shipping it
// inside the Epic written to catch that class would be the fourth recurrence.
//
// So the contract here is that FOUR outcomes stay distinguishable, forever:
//
//   findings        — something is actually wrong
//   clean           — the check ran and found nothing
//   not-applicable  — the check correctly does not apply to this project shape
//   cannot-evaluate — the check could not look, and says why   <- the dangerous one
//
// `clean` and `cannot-evaluate` collapsing into one another is the bug this
// module is built to make impossible.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { readState } from './state.js';

const PLANNING_DIR = '.planning';

/**
 * The three heal paths (FR4.1). A check MUST declare exactly one; there is no
 * default bucket (FR4.2).
 *
 *   1 SELF_HEALING     normal use clears it. Report as reassurance, never as a
 *                      defect demanding action.
 *   2 COMMAND_HEALABLE a safe deterministic regeneration exists and Signal runs
 *                      it. **Currently empty** — see D-M5E16-1: after resolving
 *                      FR4 against NFR2, sweep never runs anything itself.
 *   3 NEEDS_A_PERSON   two documents disagree and only the user knows which is
 *                      right. The only category permitted to interrupt.
 */
export const HEAL = Object.freeze({
  SELF_HEALING: 1,
  COMMAND_HEALABLE: 2,
  NEEDS_A_PERSON: 3,
});

const HEAL_VALUES = Object.freeze(Object.values(HEAL));

/** Whether a check can produce a verdict for this project. */
export const APPLICABILITY = Object.freeze({
  EVAL: 'EVAL',
  NA: 'NA',
  BLIND: 'BLIND',
});

export const STATUS = Object.freeze({
  FINDINGS: 'findings',
  CLEAN: 'clean',
  NOT_APPLICABLE: 'not-applicable',
  CANNOT_EVALUATE: 'cannot-evaluate',
});

export class DriftCheckError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DriftCheckError';
  }
}

/**
 * Validate and freeze a check definition.
 *
 * The validation is deliberately strict at *definition* time rather than at run
 * time: FR4.2 says a check that cannot state its category does not ship, and a
 * constructor that throws is the only version of that rule which cannot be
 * skipped by a reviewer having a busy day.
 *
 * `healMechanism` is required for categories 1 and 2 because those categories
 * make a PROMISE to the user — "this clears on its own", "Signal fixed it". A
 * promise whose mechanism cannot be named is unfalsifiable, and an unfalsifiable
 * reassurance is worse than a finding: it is the muted-detector failure wearing
 * a friendly face. This requirement is the direct product of check (d) being
 * declared category 2 at PLAN while no slice healed anything.
 *
 * @param {{
 *   id: string,
 *   healCategory: 1|2|3,
 *   applicability: (ctx: object) => string | {status: string, reason?: string},
 *   run: (ctx: object) => Array<{message: string, file?: string}>,
 *   healMechanism?: string,
 *   describe?: string,
 * }} def
 * @returns {Readonly<object>}
 */
export function defineCheck(def) {
  if (!def || typeof def !== 'object') {
    throw new DriftCheckError('defineCheck requires a definition object.');
  }
  const { id, healCategory, applicability, run, healMechanism, describe } = def;

  if (typeof id !== 'string' || id.length === 0) {
    throw new DriftCheckError('A drift check requires a non-empty string id.');
  }
  if (!HEAL_VALUES.includes(healCategory)) {
    throw new DriftCheckError(
      `Check "${id}" must declare a heal category — one of ` +
        `[${HEAL_VALUES.join(', ')}], got ${JSON.stringify(healCategory)}. ` +
        'There is no default bucket (FR4.2).'
    );
  }
  if (typeof applicability !== 'function') {
    throw new DriftCheckError(
      `Check "${id}" must declare an applicability function — it is what keeps ` +
        '"could not look" from rendering as "clean".'
    );
  }
  if (typeof run !== 'function') {
    throw new DriftCheckError(`Check "${id}" must declare a run function.`);
  }
  if (healCategory !== HEAL.NEEDS_A_PERSON && !healMechanism) {
    throw new DriftCheckError(
      `Check "${id}" declares heal category ${healCategory}, which promises the ` +
        'user the finding gets cleared — so it must name the healMechanism that ' +
        'clears it. An unnameable promise cannot be tested, and an untested ' +
        'reassurance is worse than a finding.'
    );
  }

  return Object.freeze({
    id,
    healCategory,
    applicability,
    run,
    healMechanism: healMechanism ?? null,
    describe: describe ?? null,
  });
}

/**
 * Build the shared context every check reads, so checks do not each re-read the
 * same files (NFR3 — a slow sweep is a sweep nobody runs).
 *
 * Fail-closed into a REPORTED result, never an exception and never silence:
 * `readState` throws `StateSchemaError` on a real project in the corpus
 * (`affiliate-mojo` — "has frontmatter but no schema_version key"), and a crash
 * there would take the whole sweep down while a silent skip would report that
 * project as clean.
 *
 * @param {string} baseDir
 * @returns {Promise<{ok: true, ctx: object} | {ok: false, reason: string}>}
 */
export async function buildDriftContext(baseDir) {
  const planningDir = join(baseDir, PLANNING_DIR);

  let state;
  try {
    state = await readState(baseDir);
  } catch (err) {
    return { ok: false, reason: `STATE.md could not be read — ${err.message}` };
  }
  if (state === null) {
    return { ok: false, reason: `no ${PLANNING_DIR}/STATE.md — nothing to compare against` };
  }

  let files = [];
  try {
    files = (await readdir(planningDir)).sort();
  } catch (err) {
    return { ok: false, reason: `${PLANNING_DIR}/ could not be listed — ${err.message}` };
  }

  return { ok: true, ctx: Object.freeze({ baseDir, planningDir, state, files }) };
}

function normalizeApplicability(raw) {
  if (typeof raw === 'string') return { status: raw, reason: null };
  if (raw && typeof raw === 'object') {
    return { status: raw.status, reason: raw.reason ?? null };
  }
  return { status: undefined, reason: null };
}

const findingCmp = (a, b) =>
  a.check.localeCompare(b.check) ||
  String(a.file ?? '').localeCompare(String(b.file ?? '')) ||
  a.message.localeCompare(b.message);

/**
 * Run a set of checks against one project.
 *
 * Every check is wrapped: an applicability function or a run function that
 * throws produces `cannot-evaluate` with the error message, never a crash and
 * never a silent pass.
 *
 * @param {string} baseDir
 * @param {Array<object>} checks
 * @returns {Promise<{results: Array<object>, summary: object}>}
 */
export async function runDriftChecks(baseDir, checks = STATE_DRIFT_CHECKS) {
  const built = await buildDriftContext(baseDir);
  const results = [];

  for (const check of checks) {
    if (!built.ok) {
      results.push({
        id: check.id,
        healCategory: check.healCategory,
        status: STATUS.CANNOT_EVALUATE,
        reason: built.reason,
        findings: [],
      });
      continue;
    }

    let applicability;
    try {
      applicability = normalizeApplicability(check.applicability(built.ctx));
    } catch (err) {
      results.push({
        id: check.id,
        healCategory: check.healCategory,
        status: STATUS.CANNOT_EVALUATE,
        reason: `applicability threw — ${err.message}`,
        findings: [],
      });
      continue;
    }

    if (applicability.status === APPLICABILITY.NA) {
      results.push({
        id: check.id,
        healCategory: check.healCategory,
        status: STATUS.NOT_APPLICABLE,
        reason: applicability.reason,
        findings: [],
      });
      continue;
    }

    if (applicability.status === APPLICABILITY.BLIND) {
      results.push({
        id: check.id,
        healCategory: check.healCategory,
        status: STATUS.CANNOT_EVALUATE,
        reason: applicability.reason ?? 'the check could not evaluate this project shape',
        findings: [],
      });
      continue;
    }

    if (applicability.status !== APPLICABILITY.EVAL) {
      results.push({
        id: check.id,
        healCategory: check.healCategory,
        status: STATUS.CANNOT_EVALUATE,
        reason:
          `applicability returned ${JSON.stringify(applicability.status)}, which is not one of ` +
          `[${Object.values(APPLICABILITY).join(', ')}]`,
        findings: [],
      });
      continue;
    }

    let raw;
    try {
      raw = (await check.run(built.ctx)) ?? [];
    } catch (err) {
      results.push({
        id: check.id,
        healCategory: check.healCategory,
        status: STATUS.CANNOT_EVALUATE,
        reason: `the check threw — ${err.message}`,
        findings: [],
      });
      continue;
    }

    const findings = raw
      .map((f) => ({
        check: check.id,
        healCategory: check.healCategory,
        healMechanism: check.healMechanism,
        file: f.file ?? null,
        message: f.message,
      }))
      .sort(findingCmp);

    results.push({
      id: check.id,
      healCategory: check.healCategory,
      status: findings.length ? STATUS.FINDINGS : STATUS.CLEAN,
      reason: null,
      findings,
    });
  }

  results.sort((a, b) => a.id.localeCompare(b.id));

  const summary = {
    total: results.length,
    withFindings: results.filter((r) => r.status === STATUS.FINDINGS).length,
    clean: results.filter((r) => r.status === STATUS.CLEAN).length,
    notApplicable: results.filter((r) => r.status === STATUS.NOT_APPLICABLE).length,
    cannotEvaluate: results.filter((r) => r.status === STATUS.CANNOT_EVALUATE).length,
  };

  return { results, summary };
}

/**
 * Render a drift result deterministically.
 *
 * Section order is load-bearing, not cosmetic. "Needs you" comes first because
 * it is the only category permitted to interrupt; the self-clearing group comes
 * next as reassurance; `cannot evaluate` comes last but is NEVER folded into
 * "clean" — that separation is the whole point of the module.
 *
 * The category-1/2 heading is deliberately tier-independent. "Clears the next
 * time Signal writes STATE here" is true whether the project's next STATE write
 * comes from a phase-close `markFresh` (FEATURE/SPIKE/FULL) or from a manual
 * `/sig:checkpoint` (SKETCH, where four command files skip `markFresh`). A
 * heading that promised "heals on next phase command" would be false at SKETCH.
 *
 * PURE — no I/O. Two renders of equal input are byte-identical (AC1.3).
 *
 * @param {{results: Array, summary: object}} report
 * @returns {string}
 */
export function renderDriftReport(report) {
  const { results, summary } = report;
  const lines = ['## STATE vs. world', ''];

  const needsYou = results
    .filter((r) => r.status === STATUS.FINDINGS && r.healCategory === HEAL.NEEDS_A_PERSON)
    .flatMap((r) => r.findings);
  const selfClearing = results
    .filter((r) => r.status === STATUS.FINDINGS && r.healCategory !== HEAL.NEEDS_A_PERSON)
    .flatMap((r) => r.findings);
  const cannotEvaluate = results.filter((r) => r.status === STATUS.CANNOT_EVALUATE);

  lines.push(`⚠ needs you (${needsYou.length})`);
  if (needsYou.length === 0) lines.push('  none');
  for (const f of needsYou) {
    lines.push(`  - [${f.check}] ${f.file ? `${f.file} — ` : ''}${f.message}`);
  }
  lines.push('');

  lines.push(`↺ clears the next time Signal writes STATE here (${selfClearing.length})`);
  if (selfClearing.length === 0) lines.push('  none');
  for (const f of selfClearing) {
    const via = f.healMechanism ? ` (via ${f.healMechanism})` : '';
    lines.push(`  - [${f.check}] ${f.file ? `${f.file} — ` : ''}${f.message}${via}`);
  }
  lines.push('');

  lines.push(`✓ checked, clean (${summary.clean})`);
  lines.push(`— not applicable to this project (${summary.notApplicable})`);
  lines.push('');

  lines.push(`— cannot evaluate (${cannotEvaluate.length})`);
  if (cannotEvaluate.length === 0) {
    lines.push('  none');
  } else {
    lines.push('  these checks could not look. This is NOT the same as clean:');
    for (const r of cannotEvaluate) {
      lines.push(`  - [${r.id}] ${r.reason}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * The shipped registry.
 *
 * EMPTY AT S1 BY CONSTRUCTION — this slice ships the harness, and S2/S3 register
 * the six checks (c, d, g, then h, a, b). The emptiness is asserted rather than
 * assumed: `tests/state-drift-harness.test.js` pins that the category-2 bucket
 * holds nothing, so the day someone registers a "Signal runs it" check without
 * `/sig:sweep --heal` existing to run it, the suite fails instead of the user
 * receiving a promise nothing keeps.
 */
export const STATE_DRIFT_CHECKS = Object.freeze([]);
