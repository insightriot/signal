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
 * Skill phase directories — where SKILL.md files live on disk.
 * A skill can be bound to a different phase than the directory it lives in
 * (e.g., `deprecation-and-migration` lives in `skills/ship/` but is bound
 * to both `plan` and `ship` phases). The loader searches across all of
 * these to find the file.
 */
const SKILL_PHASE_DIRS = ['define', 'plan', 'build', 'verify', 'review', 'ship', 'meta'];

/**
 * Find the on-disk path to a skill's SKILL.md, regardless of which phase
 * it's bound to. Returns null if not found.
 * @param {string} pluginRoot
 * @param {string} skillName
 * @returns {string | null}
 */
export function findSkillPath(pluginRoot, skillName) {
  for (const dir of SKILL_PHASE_DIRS) {
    const candidate = join(pluginRoot, 'skills', dir, skillName, 'SKILL.md');
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/**
 * Estimate the token cost of loading skills for a given phase.
 * Searches across all skill phase directories so that cross-bound skills
 * (e.g., a `build/`-resident skill bound to `plan`) are found correctly.
 *
 * @param {string} pluginRoot - Path to the plugin root
 * @param {string} phase - The phase name (e.g., 'review')
 * @param {Object} phaseBindings - Mapping of phase → skill names
 * @returns {Promise<{totalTokens: number, skills: Array<{name: string, tokens: number, found: boolean}>}>}
 */
export async function estimatePhaseSkillCost(pluginRoot, phase, phaseBindings) {
  const skillNames = phaseBindings[phase] || [];
  const skills = [];
  let totalTokens = 0;

  for (const skillName of skillNames) {
    const skillPath = findSkillPath(pluginRoot, skillName);

    if (skillPath) {
      const content = await readFile(skillPath, 'utf-8');
      const tokens = estimateTokens(content);
      skills.push({ name: skillName, tokens, found: true });
      totalTokens += tokens;
    } else {
      skills.push({ name: skillName, tokens: 0, found: false });
    }
  }

  return { totalTokens, skills };
}

export { DEFAULT_THRESHOLDS };
