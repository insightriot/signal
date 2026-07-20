#!/usr/bin/env node

/**
 * Measure the token cost of loading each phase's bound skills.
 *
 * Run from the plugin root: `node tools/measure-phase-costs.js`
 *
 * Reports a table of phase -> skills -> tokens, plus a budget verdict.
 * Budget threshold: 40,000 tokens (~20% of a 200K context) per PROJECT.md
 * "Token budget is the highest risk" concern. Above the threshold means
 * the loader needs chunking or the phase needs decomposition.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { estimatePhaseSkillCost } from './lib/context-monitor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BUDGET_THRESHOLD = 40_000;
const CONTEXT_WINDOW = 200_000;

async function main() {
  const config = JSON.parse(await readFile(join(ROOT, 'state/config.json'), 'utf-8'));
  const bindings = config.skills.phase_bindings;
  const phases = Object.keys(bindings);

  const results = [];
  for (const phase of phases) {
    const result = await estimatePhaseSkillCost(ROOT, phase, bindings);
    results.push({ phase, ...result });
  }

  const maxPhaseLen = Math.max(...phases.map(p => p.length));

  console.log('\nPhase skill-load cost (tokens, ~4 chars/token heuristic)');
  console.log('='.repeat(70));
  console.log(
    `${'Phase'.padEnd(maxPhaseLen + 2)}  ${'Skills'.padEnd(7)}  ${'Total'.padStart(8)}  ${'% of 200K'.padStart(9)}  Verdict`
  );
  console.log('-'.repeat(70));

  for (const r of results) {
    const pct = ((r.totalTokens / CONTEXT_WINDOW) * 100).toFixed(1);
    const verdict = r.totalTokens === 0
      ? 'empty'
      : r.totalTokens > BUDGET_THRESHOLD
        ? 'OVER BUDGET'
        : r.totalTokens > BUDGET_THRESHOLD * 0.75
          ? 'near limit'
          : 'ok';
    console.log(
      `${r.phase.padEnd(maxPhaseLen + 2)}  ${String(r.skills.length).padStart(6)}   ${String(r.totalTokens).padStart(8)}  ${pct.padStart(8)}%  ${verdict}`
    );
  }

  console.log('\nPer-skill breakdown');
  console.log('='.repeat(70));
  for (const r of results) {
    if (r.skills.length === 0) continue;
    console.log(`\n[${r.phase}]`);
    const sorted = [...r.skills].sort((a, b) => b.tokens - a.tokens);
    for (const s of sorted) {
      const pct = ((s.tokens / r.totalTokens) * 100).toFixed(1);
      console.log(`  ${s.name.padEnd(35)} ${String(s.tokens).padStart(7)}  (${pct}% of phase)`);
    }
  }

  const overBudget = results.filter(r => r.totalTokens > BUDGET_THRESHOLD);
  console.log('\n' + '='.repeat(70));
  if (overBudget.length === 0) {
    console.log(`All phases within budget (${BUDGET_THRESHOLD} tokens).`);
  } else {
    console.log(`Over budget: ${overBudget.map(r => r.phase).join(', ')}.`);
    console.log('Chunking or phase decomposition required.');
  }

  console.log(`\nNote: this measures skill SKILL.md content only. Full phase context`);
  console.log(`also includes the command markdown, .planning/ artifacts, and runtime`);
  console.log(`conversation. The 40K threshold leaves substantial headroom for those.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
