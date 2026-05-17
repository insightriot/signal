import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const PLANNING_DIR = '.planning';

const PHASES = ['CALIBRATE', 'DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP'];

// --- Schema layer (M4.5.E6.S1.t3 onward) ---
//
// STATE.md is moving to YAML frontmatter + freeform body. The pure helpers
// below are the substrate for S1.t4 (upgradeStateFile, legacy → schema_v1
// migration) and S1.t5 (readState rewrite with strict three-way detection).

/**
 * Raised when STATE.md content fails schema validation — malformed YAML,
 * unsupported schema_version, missing schema_version on frontmatter, etc.
 */
export class StateSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StateSchemaError';
  }
}

// Anchored regex: opening `---\n`, captured YAML block (non-greedy), closing
// `---\n?`, captured body. `\r?\n` keeps CRLF-checked-out files working on
// macOS/Linux. The trailing `\n?` makes the post-fence newline optional so
// files without a final newline still parse.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a STATE.md-shaped string into its frontmatter data + body. Returns
 * `{data: null, body: raw}` when no frontmatter is present (legacy STATE.md);
 * the caller decides whether that means "trigger upgrade" or "treat as-is".
 *
 * @param {string} raw
 * @returns {{data: object | null, body: string}}
 */
export function parseFrontmatter(raw) {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { data: null, body: raw };
  }
  const [, yamlBlock, body] = match;
  let data;
  try {
    data = parseYaml(yamlBlock, { schema: 'core' });
  } catch (err) {
    throw new StateSchemaError(`STATE.md frontmatter YAML is malformed: ${err.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    const got = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    throw new StateSchemaError(
      `STATE.md frontmatter must be a YAML mapping; got ${got}.`
    );
  }
  return { data, body };
}

/**
 * Render a frontmatter object + body back into the canonical STATE.md shape.
 * Round-trips through `parseFrontmatter` losslessly for well-formed inputs.
 *
 * @param {object} data
 * @param {string} body
 * @returns {string}
 */
export function stringifyFrontmatter(data, body) {
  const yamlBlock = stringifyYaml(data).trimEnd();
  return `---\n${yamlBlock}\n---\n${body}`;
}

/**
 * Initialize the .planning/ directory for a new project.
 * @param {string} baseDir - The project root directory
 * @param {string} [initialPhase='CALIBRATE'] - Phase to write into STATE.md.
 *   Default `CALIBRATE` matches `/sig:new-project`'s expected sequence
 *   (Phase 0 runs first). Pass `DISCUSS` if calling from a post-calibrate path.
 * @returns {Promise<string>} Path to the created .planning/ directory
 */
export async function initState(baseDir, initialPhase = 'CALIBRATE') {
  if (!PHASES.includes(initialPhase)) {
    throw new Error(`Invalid initial phase: ${initialPhase}. Must be one of: ${PHASES.join(', ')}`);
  }

  const planningDir = join(baseDir, PLANNING_DIR);

  if (!existsSync(planningDir)) {
    await mkdir(planningDir, { recursive: true });
  }

  const now = new Date().toISOString().split('T')[0];
  const stateContent = `# Project State

## Current Phase
${initialPhase}

## Completed Phases
(none)

## Blockers
(none)

## Last Updated
${now}
`;

  await writeFile(join(planningDir, 'STATE.md'), stateContent, 'utf-8');
  return planningDir;
}

/**
 * Read the current project state.
 * @param {string} baseDir - The project root directory
 * @returns {Promise<{phase: string, completedPhases: string[], lastUpdated: string} | null>}
 */
export async function readState(baseDir) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');

  if (!existsSync(statePath)) {
    return null;
  }

  const content = await readFile(statePath, 'utf-8');

  const phaseMatch = content.match(/## Current Phase\n(.+)/);
  const phase = phaseMatch ? phaseMatch[1].trim() : null;

  const completedMatch = content.match(/## Completed Phases\n([\s\S]*?)(?=\n## |\n*$)/);
  const completedRaw = completedMatch ? completedMatch[1].trim() : '';
  const completedPhases = completedRaw === '(none)'
    ? []
    : completedRaw.split('\n').map(line => line.replace(/^- /, '').trim()).filter(Boolean);

  const updatedMatch = content.match(/## Last Updated\n(.+)/);
  const lastUpdated = updatedMatch ? updatedMatch[1].trim() : null;

  return { phase, completedPhases, lastUpdated };
}

/**
 * Transition to the next phase.
 * @param {string} baseDir - The project root directory
 * @param {string} nextPhase - The phase to transition to
 * @returns {Promise<void>}
 */
export async function transitionPhase(baseDir, nextPhase) {
  if (!PHASES.includes(nextPhase)) {
    throw new Error(`Invalid phase: ${nextPhase}. Must be one of: ${PHASES.join(', ')}`);
  }

  const state = await readState(baseDir);
  if (!state) {
    throw new Error('No project state found. Run /sig:new-project first.');
  }

  const now = new Date().toISOString().split('T')[0];
  // Dedupe by phase name; keep the latest (timestamp) entry per phase. Recovery
  // scenarios (manual STATE.md edits, re-run transitions) otherwise append duplicates.
  const phaseNameOf = (entry) => entry.split(' ')[0];
  const seen = state.phase
    ? [...state.completedPhases, `${state.phase} (${now})`]
    : state.completedPhases;
  const completed = Array.from(
    new Map(seen.map((entry) => [phaseNameOf(entry), entry])).values()
  );

  const completedSection = completed.length > 0
    ? completed.map(p => `- ${p}`).join('\n')
    : '(none)';

  const stateContent = `# Project State

## Current Phase
${nextPhase}

## Completed Phases
${completedSection}

## Blockers
(none)

## Last Updated
${now}
`;

  await writeFile(join(baseDir, PLANNING_DIR, 'STATE.md'), stateContent, 'utf-8');
}

/**
 * Check if the required artifacts exist for a phase transition.
 * @param {string} baseDir - The project root directory
 * @param {string} targetPhase - The phase to transition to
 * @returns {Promise<{ready: boolean, missing: string[]}>}
 */
export async function checkGateArtifacts(baseDir, targetPhase) {
  const planningDir = join(baseDir, PLANNING_DIR);
  const missing = [];

  const requirements = {
    PLAN: ['PROJECT.md', 'CONTEXT.md', 'REQUIREMENTS.md'],
    EXECUTE: [],  // Dynamically checked based on phase number
    VERIFY: [],
    REVIEW: [],
    SHIP: [],
  };

  const required = requirements[targetPhase] || [];

  for (const file of required) {
    if (!existsSync(join(planningDir, file))) {
      missing.push(file);
    }
  }

  return { ready: missing.length === 0, missing };
}

export { PHASES, PLANNING_DIR };
