#!/usr/bin/env node

/**
 * Compute and publish the FR5 coverage ceiling (M5.E8.S1).
 *
 * Run from the plugin root: `node tools/adherence-ceiling.js [--check]`
 *
 * Classifies every directive line in `commands/*.md` as trace-measurable or not,
 * then writes the result into `.planning/ADHERENCE-LOG.md` between the ceiling
 * markers. Content below the runs marker is never touched.
 *
 * Deterministic and offline: no agent call, no network, no credentials. That is
 * what lets the ceiling ship ahead of the harness — and why it is the half of
 * this Epic that cannot rot.
 *
 * EXIT
 *   0 — ceiling written (or already current)
 *   1 — --check was passed and the published ceiling is stale
 */

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { classifyCommandCorpus } from '../plugin/tools/lib/directive-classifier.js';
import { ADHERENCE_LOG, writeCeiling } from '../plugin/tools/lib/adherence-log.js';
import { PLANNING_DIR } from '../plugin/tools/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
// M6.E1: plugin content lives under plugin/; ROOT stays the repo root.
const PLUGIN = join(ROOT, 'plugin');

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf-8',
    }).trim();
  } catch {
    return 'unknown';
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const check = process.argv.includes('--check');
  const corpus = classifyCommandCorpus(ROOT);
  const { directives, measurable, unmeasurable, libCall, artifactWrite } = corpus.counts;
  const pct = ((measurable / directives) * 100).toFixed(1);

  if (check) {
    const path = join(ROOT, PLANNING_DIR, ADHERENCE_LOG);
    const existing = await readFile(path, 'utf-8').catch(() => '');
    // Compare on the counts, not the whole block: the date and commit move on
    // every run and would make --check permanently red.
    const stale = !existing.includes(`| Directive lines | **${directives}** |`)
      || !existing.includes(`| **Trace-measurable (either)** | **${measurable}** |`);
    if (stale) {
      console.error(
        `ADHERENCE-LOG.md ceiling is stale — corpus now reports ${measurable}/${directives}.\n` +
        'Run: node tools/adherence-ceiling.js'
      );
      process.exit(1);
    }
    console.log(`Ceiling current: ${measurable}/${directives} (${pct}%).`);
    return;
  }

  const { path, changed } = await writeCeiling(ROOT, corpus, {
    computedAt: today(),
    commit: currentCommit(),
  });

  console.log('\nSignal command-corpus coverage ceiling');
  console.log('='.repeat(52));
  console.log(`Directive lines            ${String(directives).padStart(5)}`);
  console.log(`  naming a tools/lib call  ${String(libCall).padStart(5)}`);
  console.log(`  writing a named artifact ${String(artifactWrite).padStart(5)}`);
  console.log('-'.repeat(52));
  console.log(`Trace-measurable           ${String(measurable).padStart(5)}  ${pct}%`);
  console.log(`No observable trace        ${String(unmeasurable).padStart(5)}  ${((unmeasurable / directives) * 100).toFixed(1)}%`);
  console.log('='.repeat(52));
  console.log(`\nThe ${unmeasurable} untraceable directives are unmeasured, NOT passing.`);
  console.log(`${changed ? 'Wrote' : 'Already current:'} ${path}\n`);
}

main().catch(err => {
  console.error(err?.stack || String(err));
  process.exit(2);
});
