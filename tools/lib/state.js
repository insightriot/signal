import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const PLANNING_DIR = '.planning';

const PHASES = ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP'];

/**
 * Initialize the .planning/ directory for a new project.
 * @param {string} baseDir - The project root directory
 * @returns {Promise<string>} Path to the created .planning/ directory
 */
export async function initState(baseDir) {
  const planningDir = join(baseDir, PLANNING_DIR);

  if (!existsSync(planningDir)) {
    await mkdir(planningDir, { recursive: true });
  }

  const now = new Date().toISOString().split('T')[0];
  const stateContent = `# Project State

## Current Phase
DISCUSS

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
    throw new Error('No project state found. Run /hybrid-new-project first.');
  }

  const now = new Date().toISOString().split('T')[0];
  const completed = state.phase
    ? [...state.completedPhases, `${state.phase} (${now})`]
    : state.completedPhases;

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
