#!/usr/bin/env node

/**
 * Validates the plugin structure — ensures all expected directories,
 * files, and conventions are in place.
 */

import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..');

// Legacy vocabulary that must never reappear: "Tranche" was renamed to
// "Milestone" in M4.t18. Guards against drift back into the canonical
// Milestone / Epic / Slice / Task addressing. Scanned per line (mirroring
// tests/helpers/template-lint.js#findJargonHits) so errors carry line numbers.
const BANNED_VOCABULARY = [{ term: 'tranche', re: /tranche/i }];
const VOCABULARY_LINTED_FILES = ['commands/add.md', 'tools/lib/add.js'];

/**
 * Scan the vocabulary-linted files for banned legacy terms and push one error
 * per hit (with file:line) into `errors`. Returns the number of hits found.
 *
 * @param {string[]} errors - accumulator the caller flips hasError from
 * @param {string} baseDir - directory the relative file paths resolve against
 * @param {string[]} files - relative paths to scan
 * @returns {number} number of banned-term hits
 */
export function checkBannedVocabulary(errors, baseDir = ROOT, files = VOCABULARY_LINTED_FILES) {
  let hits = 0;
  for (const rel of files) {
    const p = join(baseDir, rel);
    if (!existsSync(p)) continue;
    const lines = readFileSync(p, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      for (const { term, re } of BANNED_VOCABULARY) {
        if (re.test(lines[i])) {
          errors.push(`Banned vocabulary "${term}" in ${rel}:${i + 1} — use canonical Milestone/Epic/Slice/Task vocabulary (M4.t18 lock).`);
          hits++;
        }
      }
    }
  }
  return hits;
}

const REQUIRED_FILES = [
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'hooks/hooks.json',
  'state/config.json',
  'references/anti-rationalization.md',
  'references/phase-gates.md',
  'references/profile-schema.md',
  'references/tier-definitions.md',
  'docs/vs.md',
  'docs/launch-post.md',
];

const REQUIRED_COMMANDS = [
  'commands/new-project.md',
  'commands/init.md',
  'commands/calibrate.md',
  'commands/discuss.md',
  'commands/plan.md',
  'commands/execute.md',
  'commands/verify.md',
  'commands/review.md',
  'commands/ship.md',
  'commands/escalate.md',
  'commands/status.md',
  'commands/resume.md',
  'commands/add.md',
  'commands/checkpoint.md',
  'commands/doctor.md',
];

const REQUIRED_AGENTS = [
  'agents/scanners/stack-scanner.md',
  'agents/scanners/structure-scanner.md',
  'agents/scanners/activity-scanner.md',
  'agents/scanners/quality-scanner.md',
];

const REQUIRED_DIRS = [
  'agents/researchers',
  'agents/executors',
  'agents/verifiers',
  'agents/specialists',
  'agents/scanners',
  'skills/define',
  'skills/plan',
  'skills/build',
  'skills/verify',
  'skills/review',
  'skills/ship',
  'tools/lib',
];

async function validate() {
  const errors = [];
  const warnings = [];

  // Check required files
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(ROOT, file))) {
      errors.push(`Missing required file: ${file}`);
    }
  }

  // Check commands
  for (const cmd of REQUIRED_COMMANDS) {
    if (!existsSync(join(ROOT, cmd))) {
      errors.push(`Missing command: ${cmd}`);
    }
  }

  // Check agents
  for (const agent of REQUIRED_AGENTS) {
    if (!existsSync(join(ROOT, agent))) {
      errors.push(`Missing agent: ${agent}`);
    }
  }

  // Check directories
  for (const dir of REQUIRED_DIRS) {
    if (!existsSync(join(ROOT, dir))) {
      warnings.push(`Missing directory: ${dir}`);
    }
  }

  // Validate plugin.json
  try {
    const pluginJson = JSON.parse(await readFile(join(ROOT, '.claude-plugin/plugin.json'), 'utf-8'));
    if (!pluginJson.name) errors.push('plugin.json missing "name"');
    if (!pluginJson.version) errors.push('plugin.json missing "version"');
    // No "commands" field check — Claude Code auto-discovers commands from
    // <plugin-root>/commands/ at install time. The slash-command namespace
    // derives from plugin.json's "name" field.
    if (pluginJson.name !== 'sig') {
      errors.push(`plugin.json "name" must be "sig" (drives /sig:* slash-command namespace), got "${pluginJson.name}"`);
    }
    if (pluginJson.version && !/^\d+\.\d+\.\d+$/.test(pluginJson.version)) {
      errors.push(`plugin.json "version" must be semver-shaped (MAJOR.MINOR.PATCH), got "${pluginJson.version}"`);
    }
  } catch {
    errors.push('plugin.json is invalid JSON');
  }

  // Validate config.json
  try {
    const config = JSON.parse(await readFile(join(ROOT, 'state/config.json'), 'utf-8'));
    if (!config.skills?.phase_bindings) errors.push('config.json missing skills.phase_bindings');
    if (!config.gates) errors.push('config.json missing gates');
    if (!config.context) errors.push('config.json missing context thresholds');
  } catch {
    errors.push('state/config.json is invalid JSON');
  }

  // Check for banned legacy vocabulary in the user-facing /sig:add surface.
  checkBannedVocabulary(errors);

  // Report
  if (errors.length === 0 && warnings.length === 0) {
    console.log('Plugin validation passed.');
    return true;
  }

  if (warnings.length > 0) {
    console.log(`\nWarnings (${warnings.length}):`);
    warnings.forEach(w => console.log(`  ⚠ ${w}`));
  }

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    errors.forEach(e => console.log(`  ✗ ${e}`));
    process.exit(1);
  }

  return errors.length === 0;
}

// Auto-run only when invoked directly (e.g. `node tools/validate-plugin.js`),
// not when imported by tests for the exported helpers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  validate();
}
