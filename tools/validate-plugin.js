#!/usr/bin/env node

/**
 * Validates the plugin structure — ensures all expected directories,
 * files, and conventions are in place.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const REQUIRED_FILES = [
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  'hooks/hooks.json',
  'state/config.json',
  'references/anti-rationalization.md',
  'references/phase-gates.md',
  'references/profile-schema.md',
  'references/tier-definitions.md',
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

validate();
