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
  context_rot_reread: { type: 'boolean' },
  review_depth: { type: 'enum', values: ['none', 'quality-only', 'full'] },
};

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

function ensureObject(value, fieldName) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProfileSchemaError(`${fieldName} must be an object.`);
  }
}

function ensureArray(value, fieldName) {
  if (!Array.isArray(value)) {
    throw new ProfileSchemaError(`${fieldName} must be an array.`);
  }
}

function validateCalibration(calibration) {
  ensureObject(calibration, 'calibration');
  for (const [field, validValues] of Object.entries(CALIBRATION_ENUMS)) {
    const actual = calibration[field];
    if (actual === undefined) {
      throw new ProfileSchemaError(`calibration.${field} is required.`);
    }
    if (!validValues.includes(actual)) {
      throw new ProfileSchemaError(
        `calibration.${field} must be one of [${validValues.join(', ')}], got "${actual}".`
      );
    }
  }
}

function validatePhasesSkipped(phasesSkipped) {
  ensureArray(phasesSkipped, 'phases_skipped');
  for (const phase of phasesSkipped) {
    if (typeof phase !== 'string') {
      throw new ProfileSchemaError(`phases_skipped entries must be strings, got ${typeof phase}.`);
    }
    if (NEVER_SKIPPED_PHASES.includes(phase)) {
      throw new ProfileSchemaError(`phases_skipped must not contain "${phase}" — that phase is never skipped.`);
    }
    if (!SKIPPABLE_PHASES.includes(phase)) {
      throw new ProfileSchemaError(
        `phases_skipped contains invalid phase "${phase}". Valid: [${SKIPPABLE_PHASES.join(', ')}].`
      );
    }
  }
}

function validateRigorOverrides(overrides) {
  ensureObject(overrides, 'rigor_overrides');
  for (const [key, schema] of Object.entries(RIGOR_OVERRIDE_SCHEMA)) {
    if (!(key in overrides)) {
      throw new ProfileSchemaError(`rigor_overrides.${key} is required.`);
    }
    const value = overrides[key];
    if (schema.type === 'boolean' && typeof value !== 'boolean') {
      throw new ProfileSchemaError(`rigor_overrides.${key} must be a boolean, got ${typeof value}.`);
    }
    if (schema.type === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
      throw new ProfileSchemaError(`rigor_overrides.${key} must be an integer, got ${typeof value}.`);
    }
    if (schema.type === 'enum' && !schema.values.includes(value)) {
      throw new ProfileSchemaError(
        `rigor_overrides.${key} must be one of [${schema.values.join(', ')}], got "${value}".`
      );
    }
  }
}

function validateMetadata(metadata) {
  ensureObject(metadata, 'metadata');
  if (typeof metadata.created_at !== 'string' || !ISO_8601_RE.test(metadata.created_at)) {
    throw new ProfileSchemaError(
      `metadata.created_at must be an ISO-8601 timestamp string, got "${metadata.created_at}".`
    );
  }
  if (typeof metadata.created_by !== 'string' || metadata.created_by.length === 0) {
    throw new ProfileSchemaError('metadata.created_by must be a non-empty string.');
  }
  ensureArray(metadata.escalation_history, 'metadata.escalation_history');
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

  if (!TIERS.includes(parsed.tier)) {
    throw new ProfileSchemaError(
      `tier must be one of [${TIERS.join(', ')}], got "${parsed.tier}".`
    );
  }

  if (parsed.schema_version !== 1) {
    throw new ProfileSchemaError(
      `schema_version must be 1, got ${JSON.stringify(parsed.schema_version)}.`
    );
  }

  validateCalibration(parsed.calibration);
  validatePhasesSkipped(parsed.phases_skipped);
  validateRigorOverrides(parsed.rigor_overrides);
  validateMetadata(parsed.metadata);

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

  switch (overrides.gate_strictness) {
    case 'off':
      merged.workflow.auto_advance = true;
      merged.gates.confirm_discuss = false;
      merged.gates.confirm_plan = false;
      merged.gates.confirm_execute = false;
      merged.gates.confirm_verify = false;
      merged.gates.confirm_review = false;
      merged.gates.confirm_ship = false;
      merged.gates.anti_rationalization = false;
      break;
    case 'light':
      merged.workflow.auto_advance = false;
      merged.gates.confirm_discuss = true;
      merged.gates.confirm_plan = true;
      merged.gates.confirm_execute = true;
      merged.gates.confirm_verify = true;
      merged.gates.confirm_review = true;
      merged.gates.confirm_ship = true;
      merged.gates.anti_rationalization = false;
      break;
    case 'strict':
      merged.workflow.auto_advance = false;
      merged.gates.confirm_discuss = true;
      merged.gates.confirm_plan = true;
      merged.gates.confirm_execute = true;
      merged.gates.confirm_verify = true;
      merged.gates.confirm_review = true;
      merged.gates.confirm_ship = true;
      merged.gates.anti_rationalization = true;
      break;
  }

  return merged;
}

export { ProfileSchemaError, PROFILE_FILE };
