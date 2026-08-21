import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { PLANNING_DIR, EPIC_ID_STRICT_RE } from './state.js';

const PROFILE_FILE = 'PROFILE.md';

const TIERS = ['SKETCH', 'FEATURE', 'SPIKE', 'FULL'];

const CALIBRATION_ENUMS = {
  scope: ['throwaway', 'feature', 'subsystem', 'product'],
  stakes: ['none', 'minor', 'major', 'catastrophic'],
  novelty: ['familiar', 'rare', 'first-for-org', 'first-in-industry'],
  reversibility: ['trivial', 'moderate', 'painful', 'irreversible'],
  horizon: ['hours', 'days', 'months', 'years'],
};

const SKIPPABLE_PHASES = ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP'];
const NEVER_SKIPPED_PHASES = ['CALIBRATE'];

const RIGOR_OVERRIDE_SCHEMA = {
  tdd_required: { type: 'boolean' },
  security_audit: { type: 'enum', values: ['none', 'basic', 'full'] },
  performance_pass: { type: 'boolean' },
  simplification_pass: { type: 'boolean' },
  nyquist_enforcement: { type: 'enum', values: ['off', 'basic', 'strict'] },
  plan_validation_dims: { type: 'enum', values: ['none', 'core', 'all'] },
  research_parallelism: { type: 'integer' },
  gate_strictness: { type: 'enum', values: ['off', 'light', 'strict'] },
  // The ATTENTION axis, split out from gate_strictness (LOOP-ENGINEERING-ANALYSIS 3.2.1/3.2.2).
  // gate_strictness answers "how rigorous"; attention answers "how much of your time".
  // Welding them meant the only way to get SKETCH-level attention was SKETCH-level rigor.
  // OPTIONAL: absent means derive from gate_strictness, so every existing PROFILE.md keeps
  // its exact current behaviour (see attentionFor).
  attention: { type: 'enum', values: ['attended', 'checkpointed', 'unattended'], optional: true },
  context_rot_reread: { type: 'boolean' },
  review_depth: { type: 'enum', values: ['none', 'quality-only', 'full'] },
};

export const ATTENTION_LEVELS = ['attended', 'checkpointed', 'unattended'];

// gate_strictness -> attention, for every profile written before the axis existed.
// This mapping is chosen so a profile with no `attention` produces byte-identical
// gate config to what it produces today (see applyRigorOverrides): `off` already
// meant auto-advance, and `light`/`strict` already differed by exactly one boolean
// (`anti_rationalization`) — measured, not assumed. LOOP-ENGINEERING-ANALYSIS 3.2.2.
const ATTENTION_FROM_GATE_STRICTNESS = {
  off: 'unattended',
  light: 'checkpointed',
  strict: 'attended',
};

/**
 * The attention level in force for a profile.
 *
 * Attention answers "how much of your time does this cost", where gate_strictness
 * answers "how rigorous is this". They were one dial, which meant the only way to
 * buy less of your attention was to buy less rigor. Splitting them is the point:
 * FULL rigor, unattended, is now expressible.
 *
 * Fail-open by design — an unreadable or absent profile yields the most cautious
 * answer ('attended'), never an autonomous one. A missing setting must never be
 * the reason something ran without asking.
 */
export function attentionFor(profile) {
  const overrides = profile?.rigor_overrides;
  if (!overrides || typeof overrides !== 'object') return 'attended';
  if (ATTENTION_LEVELS.includes(overrides.attention)) return overrides.attention;
  return ATTENTION_FROM_GATE_STRICTNESS[overrides.gate_strictness] ?? 'attended';
}

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

class ProfileSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProfileSchemaError';
  }
}

function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    throw new ProfileSchemaError('PROFILE.md is missing YAML frontmatter (no `---` delimiters).');
  }
  return match[1];
}

// Every validator below reports through a `fail` sink instead of throwing
// directly, so ONE implementation serves two modes:
//
//   fail = THROW (default)  →  first error throws — the behaviour every caller
//                              has always had, byte-identical messages.
//   fail = arr.push         →  ALL errors accumulate — what `collectProfileIssues`
//                              needs.
//
// The second mode exists because of `B59` (M5.E16): `M5.E16-PROFILE.md` carried
// TWO out-of-enum values, validation short-circuited on the first, and a fix
// driven by the error message alone would have repaired one of two and left the
// file still unloadable. A sink was chosen over a second validator because two
// implementations of one rule is itself a defect this project has shipped before
// (M5.E13 REVIEW).
const THROW = (message) => {
  throw new ProfileSchemaError(message);
};

function validateCalibration(calibration, fail = THROW) {
  if (calibration === null || typeof calibration !== 'object' || Array.isArray(calibration)) {
    fail('calibration must be an object.');
    return;
  }
  for (const [field, validValues] of Object.entries(CALIBRATION_ENUMS)) {
    const actual = calibration[field];
    if (actual === undefined) {
      fail(`calibration.${field} is required.`);
      continue;
    }
    if (!validValues.includes(actual)) {
      fail(`calibration.${field} must be one of [${validValues.join(', ')}], got "${actual}".`);
    }
  }
}

function validatePhasesSkipped(phasesSkipped, fail = THROW) {
  if (!Array.isArray(phasesSkipped)) {
    fail('phases_skipped must be an array.');
    return;
  }
  for (const phase of phasesSkipped) {
    if (typeof phase !== 'string') {
      fail(`phases_skipped entries must be strings, got ${typeof phase}.`);
      continue;
    }
    if (NEVER_SKIPPED_PHASES.includes(phase)) {
      fail(`phases_skipped must not contain "${phase}" — that phase is never skipped.`);
      continue;
    }
    if (!SKIPPABLE_PHASES.includes(phase)) {
      fail(`phases_skipped contains invalid phase "${phase}". Valid: [${SKIPPABLE_PHASES.join(', ')}].`);
    }
  }
}

function validateRigorOverrides(overrides, fail = THROW) {
  if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
    fail('rigor_overrides must be an object.');
    return;
  }
  for (const [key, schema] of Object.entries(RIGOR_OVERRIDE_SCHEMA)) {
    if (!(key in overrides)) {
      // An optional key may be absent; absence is not a schema violation. Without
      // this branch, adding ANY new override field would make every PROFILE.md on
      // disk throw — `B59`'s failure (a profile that cannot be read silently runs
      // the whole phase at the wrong tier) reached by addition instead of by typo.
      if (!schema.optional) fail(`rigor_overrides.${key} is required.`);
      continue;
    }
    const value = overrides[key];
    if (schema.type === 'boolean' && typeof value !== 'boolean') {
      fail(`rigor_overrides.${key} must be a boolean, got ${typeof value}.`);
    }
    if (schema.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
      fail(`rigor_overrides.${key} must be an integer, got ${typeof value}.`);
    }
    if (schema.type === 'enum' && !schema.values.includes(value)) {
      fail(`rigor_overrides.${key} must be one of [${schema.values.join(', ')}], got "${value}".`);
    }
  }
}

function validateMetadata(metadata, fail = THROW) {
  if (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata)) {
    fail('metadata must be an object.');
    return;
  }
  if (typeof metadata.created_at !== 'string' || !ISO_8601_RE.test(metadata.created_at)) {
    fail(`metadata.created_at must be an ISO-8601 timestamp string, got "${metadata.created_at}".`);
  }
  if (typeof metadata.created_by !== 'string' || metadata.created_by.length === 0) {
    fail('metadata.created_by must be a non-empty string.');
  }
  if (!Array.isArray(metadata.escalation_history)) {
    fail('metadata.escalation_history must be an array.');
  }
}

/**
 * Every schema violation in a parsed PROFILE frontmatter, in the same order the
 * throwing path would surface them one at a time.
 *
 * `readProfileFromPath` throws `issues[0]`, so the two paths cannot drift: the
 * thrown message is by construction the first element of this list.
 *
 * @param {object} parsed — parsed YAML frontmatter
 * @returns {string[]} — empty when the profile is valid
 */
export function collectProfileIssues(parsed) {
  const issues = [];
  const fail = (message) => issues.push(message);

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return ['PROFILE.md frontmatter must be a YAML mapping.'];
  }
  if (!TIERS.includes(parsed.tier)) {
    fail(`tier must be one of [${TIERS.join(', ')}], got "${parsed.tier}".`);
  }
  if (parsed.schema_version !== 1) {
    fail(`schema_version must be 1, got ${JSON.stringify(parsed.schema_version)}.`);
  }
  validateCalibration(parsed.calibration, fail);
  validatePhasesSkipped(parsed.phases_skipped, fail);
  validateRigorOverrides(parsed.rigor_overrides, fail);
  validateMetadata(parsed.metadata, fail);
  return issues;
}

/**
 * Read one PROFILE.md and return every reason it will not load — without
 * throwing. Used by the M5.E16 `profile-parses` drift check, which must report
 * ALL bad fields: `B59`'s file had two, and fixing only the one named by the
 * error message leaves the profile unloadable.
 *
 * @param {string} profilePath — absolute path to a PROFILE.md
 * @returns {Promise<{path: string, ok: boolean, issues: string[]}>}
 */
export async function readProfileIssues(profilePath) {
  if (!existsSync(profilePath)) {
    return { path: profilePath, ok: false, issues: ['file does not exist'] };
  }
  let raw;
  try {
    raw = await readFile(profilePath, 'utf-8');
  } catch (err) {
    return { path: profilePath, ok: false, issues: [`unreadable — ${err.message}`] };
  }

  let frontmatter;
  try {
    frontmatter = extractFrontmatter(raw);
  } catch (err) {
    return { path: profilePath, ok: false, issues: [err.message] };
  }

  let parsed;
  try {
    parsed = parseYaml(frontmatter);
  } catch (err) {
    return { path: profilePath, ok: false, issues: [`frontmatter is not valid YAML: ${err.message}`] };
  }

  const issues = collectProfileIssues(parsed);
  return { path: profilePath, ok: issues.length === 0, issues };
}

/**
 * Read and validate .planning/PROFILE.md.
 * @param {string} baseDir - The project root directory
 * @returns {Promise<{
 *   tier: string,
 *   schema_version: number,
 *   calibration: Record<string,string>,
 *   phases_skipped: string[],
 *   rigor_overrides: Record<string, boolean|string|number>,
 *   metadata: { created_at: string, created_by: string, escalation_history: object[] }
 * }>}
 * @throws {ProfileSchemaError} on any schema violation, including missing file.
 */
export async function readProfile(baseDir) {
  const profilePath = join(baseDir, PLANNING_DIR, PROFILE_FILE);
  return readProfileFromPath(profilePath);
}

/**
 * Read and validate a PROFILE.md at an explicit path. `readProfile` is the
 * project-scoped `.planning/PROFILE.md` case; `readEffectiveProfile` uses this
 * directly for an Epic-scoped `{EpicID}-PROFILE.md`. Same validation, same
 * `ProfileSchemaError` on any violation (including a missing file — the error
 * message names the actual path so command halt copy stays byte-identical).
 *
 * @param {string} profilePath - absolute path to a PROFILE.md
 * @returns {Promise<object>} the validated profile (same shape as readProfile)
 * @throws {ProfileSchemaError}
 */
async function readProfileFromPath(profilePath) {
  if (!existsSync(profilePath)) {
    throw new ProfileSchemaError(
      `PROFILE.md not found at ${profilePath}. Run /sig:calibrate first.`
    );
  }

  const raw = await readFile(profilePath, 'utf-8');
  const frontmatter = extractFrontmatter(raw);

  let parsed;
  try {
    parsed = parseYaml(frontmatter);
  } catch (err) {
    throw new ProfileSchemaError(`PROFILE.md frontmatter is not valid YAML: ${err.message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ProfileSchemaError('PROFILE.md frontmatter must be a YAML mapping.');
  }

  // Throw the FIRST issue. Routing through `collectProfileIssues` rather than
  // re-checking inline is what keeps the throwing path and the collecting path
  // from drifting — the thrown message is, by construction, `issues[0]`.
  const issues = collectProfileIssues(parsed);
  if (issues.length > 0) {
    throw new ProfileSchemaError(issues[0]);
  }

  return {
    tier: parsed.tier,
    schema_version: parsed.schema_version,
    calibration: { ...parsed.calibration },
    phases_skipped: [...parsed.phases_skipped],
    rigor_overrides: { ...parsed.rigor_overrides },
    metadata: {
      created_at: parsed.metadata.created_at,
      created_by: parsed.metadata.created_by,
      escalation_history: [...parsed.metadata.escalation_history],
    },
  };
}

/**
 * Read the profile that governs the phases of the currently-active Epic
 * (M4.5.E11.S3.t1, FR3 — per-Epic calibration). An Epic can carry its own tier
 * that overrides the project PROFILE **for its phases only**, via a whole-file
 * shadow at `.planning/{EpicID}-PROFILE.md` (no merge — a PROFILE is complete,
 * not by-reference).
 *
 * Composition:
 *   - `currentEpic` is a strict Epic ID AND `{EpicID}-PROFILE.md` exists → that
 *     Epic PROFILE (validated; malformed *content* throws ProfileSchemaError).
 *   - otherwise → the project `.planning/PROFILE.md` (byte-identical to
 *     readProfile — the linear/no-override path).
 *
 * Fail-open on the STATE value: a null / absent / non-strict `currentEpic`
 * (garbage, a version string like `v0.1.6`, a bare milestone) SKIPS the Epic
 * probe and falls back to the project PROFILE — it never throws on the
 * `current_epic` itself. This is the invariant the six phase commands' gate-read
 * retrofit (S3.t4) depends on: a hand-edited STATE must degrade to the project
 * tier, not crash the command's first action. (Distinct from a *malformed Epic
 * PROFILE file* that does exist — that throws, same as any bad PROFILE.) When
 * neither PROFILE exists, the project-path read throws the same "not found"
 * ProfileSchemaError a linear command already surfaces, so halt copy is
 * unchanged.
 *
 * @param {string} baseDir
 * @param {{currentEpic?: string|null}} [opts]
 * @returns {Promise<object>} the effective profile (same shape as readProfile)
 * @throws {ProfileSchemaError}
 */
export async function readEffectiveProfile(baseDir, opts = {}) {
  const { currentEpic = null } = opts;
  if (typeof currentEpic === 'string' && EPIC_ID_STRICT_RE.test(currentEpic)) {
    const epicPath = join(baseDir, PLANNING_DIR, `${currentEpic}-${PROFILE_FILE}`);
    if (existsSync(epicPath)) {
      return readProfileFromPath(epicPath);
    }
  }
  return readProfile(baseDir);
}

/**
 * Whether the given phase is enabled under the current profile.
 * CALIBRATE is always enabled (it's how you got here). Any phase listed in
 * profile.phases_skipped is disabled.
 *
 * @param {{phases_skipped: string[]}} profile
 * @param {string} phaseName
 * @returns {boolean}
 */
export function isPhaseEnabled(profile, phaseName) {
  if (!profile || !Array.isArray(profile.phases_skipped)) {
    throw new ProfileSchemaError('isPhaseEnabled requires a profile with phases_skipped.');
  }
  if (NEVER_SKIPPED_PHASES.includes(phaseName)) {
    return true;
  }
  return !profile.phases_skipped.includes(phaseName);
}

/**
 * Apply a profile's rigor_overrides to a config object. Returns a new config
 * with `rigor_overrides` attached and the obvious legacy-key correspondences
 * mapped through. Does not mutate the input config.
 *
 * The canonical Signal toggles live at `result.rigor_overrides`. Legacy GSD
 * keys under `workflow`, `gates`, and `parallelization` are derived from them
 * for tools that still read those.
 *
 * @param {object} config - The base config (e.g., from state/config.json)
 * @param {{rigor_overrides: object}} profile
 * @returns {object} A new merged config.
 */
export function applyRigorOverrides(config, profile) {
  if (!config || typeof config !== 'object') {
    throw new ProfileSchemaError('applyRigorOverrides requires a config object.');
  }
  if (!profile || typeof profile.rigor_overrides !== 'object') {
    throw new ProfileSchemaError('applyRigorOverrides requires a profile with rigor_overrides.');
  }

  const overrides = profile.rigor_overrides;
  const merged = structuredClone(config);

  merged.rigor_overrides = { ...overrides };

  merged.workflow = merged.workflow ?? {};
  merged.gates = merged.gates ?? {};
  merged.parallelization = merged.parallelization ?? {};

  merged.workflow.nyquist_validation = overrides.nyquist_enforcement !== 'off';

  if (overrides.security_audit === 'none') {
    merged.workflow.security_enforcement = false;
  } else {
    merged.workflow.security_enforcement = true;
    merged.workflow.security_asvs_level = overrides.security_audit === 'full' ? 2 : 1;
  }

  merged.workflow.review_phase = overrides.review_depth !== 'none';

  merged.workflow.research = overrides.research_parallelism > 0;
  if (overrides.research_parallelism > 0) {
    merged.parallelization.max_concurrent_agents = overrides.research_parallelism;
  }

  // RIGOR: gate_strictness keeps exactly one job, which is the only one it ever
  // had in code — whether the anti-rationalization check runs.
  merged.gates.anti_rationalization = overrides.gate_strictness === 'strict';

  // ATTENTION: how many times this asks you something.
  const attention = attentionFor(profile);
  merged.workflow.attention = attention;

  const confirmsPhases = attention !== 'unattended';
  merged.workflow.auto_advance = attention === 'unattended';
  merged.gates.confirm_discuss = confirmsPhases;
  merged.gates.confirm_plan = confirmsPhases;
  merged.gates.confirm_execute = confirmsPhases;
  merged.gates.confirm_verify = confirmsPhases;
  merged.gates.confirm_review = confirmsPhases;
  merged.gates.confirm_ship = confirmsPhases;

  // The new gate, and the reason `checkpointed` is not just a rename of `light`:
  // it confirms at PHASE BOUNDARIES and not at every step inside a phase. That
  // in-phase ceremony is where the ~48-86 touchpoints per FULL Epic actually live,
  // and until now it existed only in command prose, enforced by nothing.
  merged.gates.confirm_in_phase = attention === 'attended';

  return merged;
}

export { ProfileSchemaError, PROFILE_FILE };
