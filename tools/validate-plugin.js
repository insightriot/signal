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
];

const REQUIRED_COMMANDS = [
  '.claude/commands/hybrid-new-project.md',
  '.claude/commands/hybrid-discuss.md',
  '.claude/commands/hybrid-plan.md',
  '.claude/commands/hybrid-execute.md',
  '.claude/commands/hybrid-verify.md',
  '.claude/commands/hybrid-review.md',
  '.claude/commands/hybrid-ship.md',
];

const REQUIRED_DIRS = [
  'agents/researchers',
  'agents/executors',
  'agents/verifiers',
  'agents/specialists',
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
    if (!pluginJson.commands) errors.push('plugin.json missing "commands"');
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
