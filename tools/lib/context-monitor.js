import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Context monitoring for agent sessions.
 *
 * Tracks approximate context usage and emits warnings at configurable thresholds.
 * GSD pattern: warn at 35% remaining, critical at 25% remaining.
 */

const DEFAULT_THRESHOLDS = {
  warn: 0.35,     // 35% remaining
  critical: 0.25, // 25% remaining
};

/**
 * Estimate token count from text content.
 * Rough heuristic: ~4 characters per token for English markdown.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Check context budget status.
 * @param {number} usedTokens - Tokens consumed so far
 * @param {number} maxTokens - Context window size
 * @param {{warn: number, critical: number}} thresholds - Warning thresholds (fraction remaining)
 * @returns {{status: 'ok' | 'warn' | 'critical', remaining: number, percentRemaining: number}}
 */
export function checkContextBudget(usedTokens, maxTokens, thresholds = DEFAULT_THRESHOLDS) {
  const remaining = maxTokens - usedTokens;
  const percentRemaining = remaining / maxTokens;

  let status = 'ok';
  if (percentRemaining <= thresholds.critical) {
    status = 'critical';
  } else if (percentRemaining <= thresholds.warn) {
    status = 'warn';
  }

  return {
    status,
    remaining,
    percentRemaining: Math.round(percentRemaining * 100),
  };
}

/**
 * Estimate the token cost of loading skills for a given phase.
 * @param {string} pluginRoot - Path to the plugin root
 * @param {string} phase - The phase name (e.g., 'review')
 * @param {Object} phaseBindings - Mapping of phase → skill names
 * @returns {Promise<{totalTokens: number, skills: Array<{name: string, tokens: number}>}>}
 */
export async function estimatePhaseSkillCost(pluginRoot, phase, phaseBindings) {
  const skillNames = phaseBindings[phase] || [];
  const skills = [];
  let totalTokens = 0;

  for (const skillName of skillNames) {
    const skillPath = join(pluginRoot, 'skills', getPhaseDir(phase), skillName, 'SKILL.md');

    if (existsSync(skillPath)) {
      const content = await readFile(skillPath, 'utf-8');
      const tokens = estimateTokens(content);
      skills.push({ name: skillName, tokens });
      totalTokens += tokens;
    } else {
      skills.push({ name: skillName, tokens: 0 });
    }
  }

  return { totalTokens, skills };
}

/**
 * Map phase name to skill directory name.
 * @param {string} phase
 * @returns {string}
 */
function getPhaseDir(phase) {
  const mapping = {
    discuss: 'define',
    plan: 'plan',
    execute: 'build',
    verify: 'verify',
    review: 'review',
    ship: 'ship',
  };
  return mapping[phase.toLowerCase()] || phase.toLowerCase();
}

export { DEFAULT_THRESHOLDS };
