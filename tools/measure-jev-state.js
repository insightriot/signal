#!/usr/bin/env node
/**
 * M6.E3 t1.7 (AC9.6) — measure the shipped Jev STATE.md check against the
 * spike's labelled paragraphs, using the fact list CODE derives (not the
 * spike's hand-written facts).
 *
 * Replays tests/fixtures/jev/STATE-3518c11.md — the exact file the spike
 * measured — through the real check (state-narrative-jev.js → jev.js), and
 * prints, per labelled paragraph: the label, Jev's choice and confidence. Then
 * recall on the labelled contradictions and false alarms on the rest.
 *
 * Maintainer tooling, not a command. It has NO network code of its own: the
 * only call is the audited `plugin/tools/lib/jev.js#askChoice` (`D-M6E3-13`).
 * Needs TYPESAFE_API_KEY (environment, or this repository's .env). Costs well
 * under a cent per run.
 *
 *   node tools/measure-jev-state.js
 *
 * Results are NOT reproducible run to run (no seed; the spike saw 2 of 94
 * decisions flip) — publish them with the date and the model, never pinned to
 * a commit as if they were.
 */

import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { makeStateNarrativeJevCheck } from '../plugin/tools/lib/state-narrative-jev.js';
import { splitParagraphs, buildFactList } from '../plugin/tools/lib/state-facts.js';
import { runDriftChecks } from '../plugin/tools/lib/state-drift.js';
import { readState } from '../plugin/tools/lib/state.js';
import { resolveJevKey } from '../plugin/tools/lib/jev.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPIKE_COMMIT = '3518c11';

async function main() {
  const key = resolveJevKey(ROOT);
  if (!key) {
    console.error('measure-jev-state: TYPESAFE_API_KEY is not set (environment or .env) — nothing measured.');
    process.exit(2);
  }

  const stateRaw = await readFile(join(ROOT, 'tests/fixtures/jev/STATE-3518c11.md'), 'utf8');
  const pluginJson = execFileSync('git', ['show', `${SPIKE_COMMIT}:plugin/.claude-plugin/plugin.json`], { cwd: ROOT, encoding: 'utf8' });
  const spike = JSON.parse(await readFile(join(ROOT, 'analysis/jev-spike/labels-and-results.json'), 'utf8'));
  const labelled = spike.cases.filter((c) => c.set === 'narrative');

  const dir = await mkdtemp(join(tmpdir(), 'sig-measure-jev-'));
  try {
    await mkdir(join(dir, '.planning'));
    await mkdir(join(dir, 'plugin/.claude-plugin'), { recursive: true });
    await writeFile(join(dir, '.planning/STATE.md'), stateRaw);
    await writeFile(join(dir, 'plugin/.claude-plugin/plugin.json'), pluginJson);

    const paras = splitParagraphs(stateRaw);
    const { facts, unavailable } = await buildFactList(dir, await readState(dir));

    // Record every answer, not only contradictions, so the label comparison is complete.
    const answers = new Map();
    const { askChoice } = await import('../plugin/tools/lib/jev.js');
    const ask = async (args) => {
      const r = await askChoice(args);
      answers.set(args.state.paragraph, r);
      return r;
    };
    // A generous budget: this is a measurement, not a briefing.
    const report = await runDriftChecks(dir, [makeStateNarrativeJevCheck({ ask, key, budgetMs: 120000, concurrency: 4 })]);
    const row = report.results[0];

    const cases = labelled.map((c) => {
      const n = Number(c.id.replace('para ', ''));
      const p = paras[n - 1];
      const a = answers.get(p.text);
      return {
        id: c.id, line: p.line, label: c.label,
        choice: a?.ok ? a.choice : null, confidence: a?.ok ? a.confidence : null,
        error: a && !a.ok ? a.reason : a ? null : 'not asked',
        spikeRun1: c.run1.choice,
      };
    });

    const positives = cases.filter((c) => c.label === 'contradicts');
    const negatives = cases.filter((c) => c.label !== 'contradicts' && c.label !== 'ambiguous');
    const summary = {
      date: new Date().toISOString().slice(0, 10),
      model: row.coverage?.model ?? null,
      facts, factsUnavailable: unavailable,
      status: row.status, reason: row.reason ?? null,
      coverage: row.coverage ? { checked: row.coverage.checked, total: row.coverage.total, unchecked: row.coverage.unchecked.length } : null,
      recall: `${positives.filter((c) => c.choice === 'contradicts').length} of ${positives.length}`,
      falseAlarms: `${negatives.filter((c) => c.choice === 'contradicts').length} of ${negatives.length}`,
      ambiguous: cases.filter((c) => c.label === 'ambiguous').map((c) => ({ id: c.id, choice: c.choice, confidence: c.confidence })),
    };

    console.log(`Jev STATE.md check — measured ${summary.date}, model ${summary.model}`);
    console.log(`facts: ${JSON.stringify(facts)}`);
    if (unavailable.length) console.log(`facts unavailable: ${unavailable.join('; ')}`);
    console.log(`status: ${summary.status}${summary.reason ? ` (${summary.reason})` : ''}; coverage: ${JSON.stringify(summary.coverage)}`);
    const answered = cases.filter((c) => c.choice !== null).length;
    if (answered < cases.length) console.log(`⚠ only ${answered} of ${cases.length} labelled paragraphs were answered — the figures below cover those alone.`);
    if (answered === 0) {
      console.log('NOT MEASURED — no paragraph was answered.');
    } else {
      console.log(`recall on labelled contradictions: ${summary.recall}`);
      console.log(`false alarms on labelled non-contradictions: ${summary.falseAlarms}`);
    }
    console.log('');
    for (const c of cases) {
      const mark = c.label === 'contradicts' ? (c.choice === 'contradicts' ? 'HIT ' : 'MISS') : c.choice === 'contradicts' && c.label !== 'ambiguous' ? 'FA  ' : '    ';
      console.log(`${mark} ${c.id.padEnd(8)} L${String(c.line).padEnd(4)} label=${c.label.padEnd(13)} jev=${String(c.choice).padEnd(13)} conf=${c.confidence ?? '-'}${c.error ? `  (${c.error})` : ''}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`measure-jev-state: ${err.message}`);
  process.exit(1);
});
