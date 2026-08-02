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

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { readState, PHASES, EPIC_ID_STRICT_RE } from './state.js';
import { readProfileIssues } from './profile.js';

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

  // The raw file, so a check can compare the frontmatter against the PROSE.
  // That comparison is the whole reason this Epic exists: at the originating
  // incident the frontmatter was RIGHT and the body was stale, and the two
  // halves of one file disagreed for three commits and a release.
  let stateBody = '';
  try {
    const raw = await readFile(join(planningDir, 'STATE.md'), 'utf-8');
    const fm = raw.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
    stateBody = fm ? raw.slice(fm[0].length) : raw;
  } catch {
    stateBody = '';
  }

  return { ok: true, ctx: Object.freeze({ baseDir, planningDir, state, files, stateBody }) };
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

// ─────────────────────────────── the checks ───────────────────────────────
//
// Ordered as the plan sequences them: the three that work on every project
// shape first (c, d, g — 12/12, 8/8 and 12/12 applicable), then the Epic-mode
// three (h, a, b) which the corpus can only exercise on 2 of 13.

const EPIC_ID_IN_FILENAME = /^(M\d+(?:\.\d+)?\.E\d+)-(PLAN|PROGRESS|VERIFICATION|REVIEW)\.md$/;

/**
 * (c) An Epic was worked and never retrospected.
 *
 * Keyed off artifacts on disk, NOT off `completed_phases` containing `SHIP` as
 * FR1.1 originally specified. The requirement's version does not fire on the one
 * live instance available to it: this repo's `completed_phases` is `[]` while
 * `M5.E17` sits shipped with no retrospective. A criterion that stays silent on
 * its own motivating case was written from the shape of the work rather than
 * from the artifact.
 *
 * "Worked" deliberately means a PLAN/PROGRESS/VERIFICATION/REVIEW artifact, not
 * a REQUIREMENTS one: an Epic can be scoped and parked, and firing on that would
 * manufacture a chore for every idea anyone ever wrote down — FR2's failure mode.
 */
export const checkEpicWithoutRetro = defineCheck({
  id: 'epic-without-retro',
  describe: 'an Epic with phase artifacts on disk and no retrospective',
  healCategory: HEAL.NEEDS_A_PERSON,
  applicability: () => APPLICABILITY.EVAL,
  run: ({ files, state }) => {
    const worked = new Set();
    for (const f of files) {
      const m = f.match(EPIC_ID_IN_FILENAME);
      if (m) worked.add(m[1]);
    }
    const findings = [];
    for (const epic of [...worked].sort()) {
      if (epic === state.current_epic) continue; // mid-flight, not abandoned
      if (files.includes(`${epic}-RETROSPECTIVE.md`)) continue;
      findings.push({
        file: `${PLANNING_DIR}/${epic}-RETROSPECTIVE.md`,
        message:
          `${epic} has phase artifacts on disk but no retrospective — it was either ` +
          'finished without one, or abandoned. Only you know which.',
      });
    }
    return findings;
  },
});

/**
 * (d) `last_updated_commit` points at a commit that is not in this history.
 *
 * NARROWED to the not-an-ancestor case only. "N commits behind" is already
 * `isStateStale`'s job, and two findings for one condition is its own kind of
 * noise (the requirements' open question 2).
 *
 * Category 1 — self-healing. The next STATE write re-stamps the field, and that
 * promise is EXERCISED in the tests rather than asserted: a fixture whose
 * baseline is off-history goes clean after a `markFresh`.
 *
 * The heal mechanism is worded tier-independently on purpose. At
 * FEATURE/SPIKE/FULL the next write is a phase-close `markFresh`; at SKETCH four
 * command files skip `markFresh`, so it is a manual `/sig:checkpoint`. A promise
 * of "heals on next phase command" would be false at SKETCH — `B42`'s shape.
 */
export const checkBaselineCommitOffHistory = defineCheck({
  id: 'baseline-commit-off-history',
  describe: 'STATE.md\'s last_updated_commit is not an ancestor of HEAD',
  healCategory: HEAL.SELF_HEALING,
  healMechanism: 'the next STATE write — a phase-close markFresh, or /sig:checkpoint at SKETCH',
  applicability: ({ baseDir, state }) => {
    const commit = state.last_updated_commit;
    if (!commit || !/^[0-9a-f]{7,40}$/.test(String(commit))) {
      return { status: APPLICABILITY.NA, reason: 'no usable last_updated_commit to check' };
    }
    if (!existsSync(join(baseDir, '.git'))) {
      return { status: APPLICABILITY.NA, reason: 'not a git repository' };
    }
    return APPLICABILITY.EVAL;
  },
  run: ({ baseDir, state }) => {
    const commit = String(state.last_updated_commit);
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
        cwd: baseDir,
        stdio: 'ignore',
      });
      return [];
    } catch {
      // Distinguish "commit is gone" from "commit exists but is off-history" —
      // they read very differently to someone deciding whether work was lost.
      let known = false;
      try {
        execFileSync('git', ['cat-file', '-e', `${commit}^{commit}`], { cwd: baseDir, stdio: 'ignore' });
        known = true;
      } catch {
        known = false;
      }
      return [{
        file: `${PLANNING_DIR}/STATE.md`,
        message:
          `last_updated_commit ${commit} is not an ancestor of HEAD — ` +
          (known
            ? 'the commit exists but no branch reaches it (a reset or a rewritten branch), '
            : 'the commit is not in this repository at all, ') +
          'so every staleness comparison against it is meaningless.',
      }];
    }
  },
});

/**
 * (g) A PROFILE.md the code cannot read.
 *
 * The highest-precision check on the board: a file either parses or it throws,
 * so there is no threshold and nothing for FR2.2 to kill.
 *
 * Reports EVERY bad field, not just the first. Validation short-circuits, so a
 * fix driven by the error message alone repairs one of two — which is exactly
 * what `B59` presented as: `stakes: moderate` masked `reversibility: easy`, and
 * the profile would still not have loaded after "the" fix.
 */
export const checkProfilesParse = defineCheck({
  id: 'profile-parses',
  describe: 'every PROFILE.md in the project loads with the loader that reads it',
  healCategory: HEAL.NEEDS_A_PERSON,
  applicability: ({ files }) =>
    files.some((f) => f.endsWith('PROFILE.md'))
      ? APPLICABILITY.EVAL
      : { status: APPLICABILITY.NA, reason: 'project has no PROFILE.md — uncalibrated, not drifted' },
  run: async ({ planningDir, files }) => {
    const findings = [];
    for (const file of files.filter((f) => f.endsWith('PROFILE.md'))) {
      const { ok, issues } = await readProfileIssues(join(planningDir, file));
      if (ok) continue;
      for (const issue of issues) {
        findings.push({ file: `${PLANNING_DIR}/${file}`, message: issue });
      }
    }
    return findings;
  },
});

// ─────────────────────── the Epic-mode three (S3) ───────────────────────
//
// These can evaluate 2 of 13 real projects. That is not a reason to skip them —
// it is the reason the `cannot-evaluate` bucket exists, and (h) ships first
// because it is what turns their blindness into a reported result.

/** Every Epic ID mentioned anywhere in a body of prose. */
const EPIC_ID_ANYWHERE = /\bM\d+(?:\.\d+)?\.E\d+\b/g;

const epicIsSet = (state) =>
  state.current_epic !== null &&
  state.current_epic !== undefined &&
  String(state.current_epic).length > 0;

const LINEAR_MODE_NA = {
  status: APPLICABILITY.NA,
  reason: 'linear mode — no current_epic to check against',
};

/**
 * (h) `current_epic` is set to something no resolver accepts.
 *
 * NOT IN THE REQUIREMENTS — this check exists because the corpus was measured.
 * `agent-tools-sync` carries `"M1"` and `traction-engine` carries `"PHASE12"`;
 * both fail `EPIC_ID_STRICT_RE`, so `readEffectiveProfile`, `artifactName` and
 * `resolveArtifactPath` all fail open to LINEAR mode while the project believes
 * it is running Epics. That is `B53`'s class — fixed as a Signal-side bug in
 * v0.1.14 and now observed live on half the Epic-mode corpus.
 *
 * It ships FIRST of the Epic-mode three because the two projects where it fires
 * are exactly the two where (a) and (b) go blind. It is the check that reports
 * why the other checks cannot see.
 */
export const checkEpicIdNotStrict = defineCheck({
  id: 'epic-id-not-strict',
  describe: 'current_epic is set but is not an Epic ID any resolver will accept',
  healCategory: HEAL.NEEDS_A_PERSON,
  applicability: ({ state }) => (epicIsSet(state) ? APPLICABILITY.EVAL : LINEAR_MODE_NA),
  run: ({ state }) => {
    const raw = String(state.current_epic);
    if (EPIC_ID_STRICT_RE.test(raw)) return [];
    return [{
      file: `${PLANNING_DIR}/STATE.md`,
      message:
        `current_epic is "${raw}", which is not an Epic ID (expected e.g. M5.E16). ` +
        'Signal resolves artifacts and the effective PROFILE in LINEAR mode for this ' +
        'project, while STATE says an Epic is active — so Epic-scoped artifacts and ' +
        'per-Epic profiles are being written or read under the wrong names.',
    }];
  },
});

/**
 * (a) `phase` names an earlier phase than the artifacts on disk.
 *
 * FIXTURE-ONLY EVIDENCE. This check fired zero times across all 13 real
 * projects, and a live corpus cannot distinguish "precise" from "inert" — so
 * the red fixture is the only thing establishing that it works. Recorded in the
 * plan and repeated here rather than left for VERIFY to rediscover.
 */
export const checkPhaseBehindArtifacts = defineCheck({
  id: 'phase-behind-artifacts',
  describe: 'an artifact exists for a phase later than the one STATE names',
  healCategory: HEAL.NEEDS_A_PERSON,
  applicability: ({ state }) => {
    if (!epicIsSet(state)) return LINEAR_MODE_NA;
    if (!EPIC_ID_STRICT_RE.test(String(state.current_epic))) {
      return {
        status: APPLICABILITY.BLIND,
        reason:
          `current_epic "${state.current_epic}" is not a strict Epic ID, so no artifact ` +
          'name can be derived — see the epic-id-not-strict finding',
      };
    }
    if (!PHASES.includes(state.phase)) {
      return {
        status: APPLICABILITY.BLIND,
        reason: `phase is ${JSON.stringify(String(state.phase).slice(0, 40))}, not a phase name`,
      };
    }
    return APPLICABILITY.EVAL;
  },
  run: ({ state, files }) => {
    const epic = String(state.current_epic);
    const order = PHASES.filter((p) => p !== 'CALIBRATE');
    const at = order.indexOf(state.phase);
    if (at === -1) return [];

    const artifactFor = {
      PLAN: 'PLAN',
      EXECUTE: 'PROGRESS',
      VERIFY: 'VERIFICATION',
      REVIEW: 'REVIEW',
      SHIP: 'RETROSPECTIVE',
    };

    for (const later of order.slice(at + 1)) {
      const suffix = artifactFor[later];
      if (suffix && files.includes(`${epic}-${suffix}.md`)) {
        return [{
          file: `${PLANNING_DIR}/${epic}-${suffix}.md`,
          message:
            `STATE says phase ${state.phase}, but ${epic}-${suffix}.md exists — that is a ` +
            `${later}-phase artifact. Either the phase advanced without being recorded, or ` +
            'the artifact is left over from an earlier run.',
        }];
      }
    }
    return [];
  },
});

/**
 * (b) The body never mentions the Epic the frontmatter names.
 *
 * THE ORIGINATING INCIDENT. Frontmatter read `current_epic: M5.E17` while the
 * body's "Next candidates" list named M5.E15 / M5.E16 / M5.E10 and omitted
 * M5.E17 entirely. `/sig:resume` read both halves and flagged neither. The data
 * moved, the prose did not, and it survived three commits and a release.
 *
 * NARROWED STRUCTURALLY, NOT BY A THRESHOLD: it fires only when the body names
 * at least one OTHER Epic ID. A body naming no Epic at all is a young or
 * skeletal STATE, not drift. FR2.2 forbids tuning a check into silence with a
 * knob, so this adds a precondition instead — and the history regression in
 * `tests/state-drift-checks-epic.test.js` proves the narrowing does not cost the
 * real signal: red at 4421105 / 137b9ca / 8acd1d2, green at 18741a8.
 */
export const checkBodyOmitsCurrentEpic = defineCheck({
  id: 'body-omits-current-epic',
  describe: 'STATE.md\'s prose never mentions the Epic its own frontmatter names',
  healCategory: HEAL.NEEDS_A_PERSON,
  applicability: ({ state }) => {
    if (!epicIsSet(state)) return LINEAR_MODE_NA;
    if (!EPIC_ID_STRICT_RE.test(String(state.current_epic))) {
      return {
        status: APPLICABILITY.BLIND,
        reason:
          `current_epic "${state.current_epic}" is not a strict Epic ID, so there is no ID ` +
          'to look for in the prose — see the epic-id-not-strict finding',
      };
    }
    return APPLICABILITY.EVAL;
  },
  run: ({ state, stateBody }) => {
    const epic = String(state.current_epic);
    const mentioned = new Set(stateBody.match(EPIC_ID_ANYWHERE) ?? []);
    if (mentioned.has(epic)) return [];
    if (mentioned.size === 0) return []; // young STATE, not drift — the narrowing

    const others = [...mentioned].sort();
    return [{
      file: `${PLANNING_DIR}/STATE.md`,
      message:
        `frontmatter says current_epic: ${epic}, but the body never mentions ${epic} — ` +
        `it names ${others.slice(0, 4).join(', ')}${others.length > 4 ? ', …' : ''}. ` +
        'The frontmatter advanced and the prose did not; anyone orienting from the ' +
        'narrative is reading about different work than the one in flight.',
    }];
  },
});

/**
 * The shipped registry.
 *
 * S2 registers the three general checks. S3 adds the Epic-mode three (h, a, b).
 *
 * The category-2 bucket stays empty, and that emptiness is ASSERTED rather than
 * assumed (`tests/state-drift-harness.test.js`): after D-M5E16-1 resolved FR4
 * against NFR2, sweep never runs a heal itself, so the day a "Signal runs it"
 * check is registered without `/sig:sweep --heal` existing to run it, the suite
 * fails instead of a user receiving a promise nothing keeps.
 */
export const STATE_DRIFT_CHECKS = Object.freeze([
  checkEpicWithoutRetro,
  checkBaselineCommitOffHistory,
  checkProfilesParse,
  checkEpicIdNotStrict,
  checkPhaseBehindArtifacts,
  checkBodyOmitsCurrentEpic,
]);
