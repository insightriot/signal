import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * On-demand skill loader.
 *
 * Loads Agent Skills quality skill files per phase. Skills are markdown files
 * with YAML frontmatter — they get injected into the agent's context as-is.
 * No summarization or chunking needed (confirmed: worst-case REVIEW phase
 * is ~12,700 tokens, well within budget).
 */

/**
 * Load all skills bound to a given phase.
 * @param {string} pluginRoot - Path to the plugin root
 * @param {string} phase - Phase name (e.g., 'review', 'discuss')
 * @param {Object} config - Plugin config with skills.phase_bindings
 * @returns {Promise<Array<{name: string, content: string}>>}
 */
export async function loadPhaseSkills(pluginRoot, phase, config) {
  const bindings = config?.skills?.phase_bindings || {};
  const skillNames = bindings[phase.toLowerCase()] || [];
  const loaded = [];

  const phaseDir = getSkillPhaseDir(phase);

  for (const skillName of skillNames) {
    const skillPath = join(pluginRoot, 'skills', phaseDir, skillName, 'SKILL.md');

    if (existsSync(skillPath)) {
      const content = await readFile(skillPath, 'utf-8');
      loaded.push({ name: skillName, content });
    }
  }

  return loaded;
}

/**
 * Load a single skill by name, searching across all phase directories.
 * @param {string} pluginRoot - Path to the plugin root
 * @param {string} skillName - The skill name (e.g., 'security-and-hardening')
 * @returns {Promise<{name: string, content: string} | null>}
 */
export async function loadSkill(pluginRoot, skillName) {
  const phaseDirs = ['define', 'plan', 'build', 'verify', 'review', 'ship', 'meta'];

  for (const dir of phaseDirs) {
    const skillPath = join(pluginRoot, 'skills', dir, skillName, 'SKILL.md');
    if (existsSync(skillPath)) {
      const content = await readFile(skillPath, 'utf-8');
      return { name: skillName, content };
    }
  }

  return null;
}

/**
 * Map phase name to skill directory.
 */
function getSkillPhaseDir(phase) {
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
