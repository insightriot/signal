#!/usr/bin/env node

/**
 * The adherence harness entry point (M5.E8, FR1).
 *
 * ── THIS FILE SPENDS MONEY ───────────────────────────────────────────────────
 * It invokes the `claude` CLI against a scratch fixture. It is deliberately OUT
 * of the test suite (AC1.2, D-M5E8-1): `npm test` stays deterministic, offline
 * and free. tests/adherence-suite-guard.test.js asserts no test imports or
 * spawns it. All logic that CAN be tested lives in tools/lib/adherence-harness.js
 * and is tested there against a stub.
 *
 * Run from the plugin root:
 *   node tools/adherence-run.js --command execute --runs 3
 *   node tools/adherence-run.js --command execute --dry-run   # cost preview only
 *
 * WHAT THIS DOES TODAY (S2 — the skeleton): runs one command once per run against
 * an isolated fixture and reports the observed trace diff. The control arm — the
 * delete-the-instruction comparison that turns a trace into a VERDICT — is S3.
 * Until it lands, this reports observations, NOT adherence verdicts, and says so
 * in its own output.
 *
 * EXIT
 *   0 — run completed (or dry-run printed)
 *   1 — refused: no agent surface, or isolation assertion failed
 *   2 — unexpected error
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CliUnavailableError,
  assertIsolatedFixture,
  captureTrace,
  createFixtureProject,
  createPluginCopy,
  diffTraces,
  planCost,
  resolveAgentSurface,
} from './lib/adherence-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

function parseArgs(argv) {
  const args = { command: null, runs: 3, dryRun: false, yes: false, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--command') args.command = argv[++i];
    else if (a === '--runs') args.runs = Number(argv[++i]);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--keep') args.keep = true;
  }
  return args;
}

async function confirm(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Invoke the agent headlessly against the fixture, loading the COPIED plugin
 * tree so the command file under test is the mutated one (R3, AC2.4).
 *
 * The seam is `--plugin-dir`, a real CLI flag ("load a plugin from a directory
 * for this session only"), NOT the `CLAUDE_PLUGIN_ROOT` env var this file first
 * used. That variable is referenced *inside* command files for skill paths; it
 * is not evidence the CLI resolves WHICH command file to load from it. Those are
 * different mechanisms, and the difference matters enormously: if the override
 * does not redirect resolution, both arms load the same unmutated command, both
 * produce the trace, and the harness reports INERT — a plumbing failure wearing
 * the exact costume of this Epic's pre-declared "desired worst case".
 *
 * Whether --plugin-dir actually wins over the installed `sig` plugin is NOT yet
 * established. That is what the positive control (`--probe`) exists to settle,
 * and no verdict may be emitted until it passes.
 */
function invokeAgent({ fixtureRoot, pluginRoot, prompt, timeoutMs = 300_000 }) {
  const result = spawnSync('claude', ['--plugin-dir', pluginRoot, '-p', prompt], {
    cwd: fixtureRoot,
    encoding: 'utf-8',
    timeout: timeoutMs,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command) {
    console.error('Usage: node tools/adherence-run.js --command <name> [--runs N] [--dry-run] [--yes]');
    process.exit(2);
  }

  // NFR2 — cost before spend, always, including on a dry run.
  const cost = planCost({ instructions: 1, runsPerArm: args.runs });
  console.log('\nPlanned adherence run');
  console.log('='.repeat(52));
  console.log(`Command under test   /sig:${args.command}`);
  console.log(`Runs per arm         ${cost.runsPerArm}`);
  console.log(`Arms                 ${cost.arms} (as-written · instruction-deleted)`);
  console.log(`Total agent calls    ${cost.totalInvocations}`);
  console.log('='.repeat(52));
  console.log(
    'NOTE (S2): the control arm is not implemented yet, so this run reports\n' +
    'OBSERVATIONS, not adherence verdicts. A trace seen here has not been\n' +
    'compared against an instruction-deleted run and therefore says nothing\n' +
    'about whether the instruction caused it.\n'
  );

  if (args.dryRun) return;

  // AC1.4 — resolve the surface, or abort loudly. Before any fixture is built,
  // so an unreachable CLI costs nothing and can never look like a result.
  let surface;
  try {
    surface = resolveAgentSurface({
      exec: execFileSync,
      model: process.env.ANTHROPIC_MODEL ?? null,
    });
  } catch (err) {
    if (err instanceof CliUnavailableError) {
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  console.log(`Agent surface        claude ${surface.cliVersion}${surface.model ? ` · ${surface.model}` : ''}\n`);

  if (!args.yes && !(await confirm(`Spend ${cost.totalInvocations} agent call(s)?`))) {
    console.log('Aborted before spending.');
    return;
  }

  const fixture = await createFixtureProject({ tier: 'FULL', phase: 'PLAN' });
  const plugin = await createPluginCopy(ROOT);

  // AC1.3 — both trees, checked. An adherence run writes files; this is the
  // assertion that keeps it away from the repo it is measuring.
  try {
    assertIsolatedFixture(fixture.root, ROOT);
    assertIsolatedFixture(plugin.root, ROOT);
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }

  console.log(`Fixture project      ${fixture.root}`);
  console.log(`Plugin copy          ${plugin.root}\n`);

  const observations = [];
  for (let i = 1; i <= args.runs; i++) {
    const before = await captureTrace(fixture.root);
    const res = invokeAgent({
      fixtureRoot: fixture.root,
      pluginRoot: plugin.root,
      prompt: `/sig:${args.command}`,
    });
    const after = await captureTrace(fixture.root);
    const diff = diffTraces(before, after);
    observations.push({ run: i, exit: res.status, timedOut: res.timedOut, diff });

    console.log(`Run ${i}/${args.runs}  exit=${res.status}${res.timedOut ? ' TIMED OUT' : ''}`);
    console.log(`  phase        ${diff.phaseChanged ? `${diff.phaseChanged.from} → ${diff.phaseChanged.to}` : '(unchanged)'}`);
    console.log(`  completed[]  ${diff.completedPhasesGrew ? 'grew' : '(unchanged)'}`);
    console.log(`  files        +${diff.filesAdded.length} ~${diff.filesChanged.length}`);
    if (res.status !== 0 && res.stderr) {
      console.log(`  stderr       ${res.stderr.trim().split('\n')[0].slice(0, 120)}`);
    }
  }

  const withPhaseChange = observations.filter(o => o.diff.phaseChanged).length;
  console.log('\n' + '='.repeat(52));
  console.log(`Observed a phase advance in ${withPhaseChange}/${args.runs} run(s).`);
  console.log(
    'This is an OBSERVATION, not a verdict. Without the instruction-deleted\n' +
    'control arm (S3), a trace present here could be caused by the instruction\n' +
    'or by the agent doing it anyway — and those are opposite findings.'
  );
  console.log('='.repeat(52) + '\n');

  if (!args.keep) {
    await rm(fixture.root, { recursive: true, force: true });
    await rm(plugin.root, { recursive: true, force: true });
  } else {
    console.log(`Kept: ${fixture.root}\n      ${plugin.root}\n`);
  }
}

main().catch(err => {
  console.error(err?.stack || String(err));
  process.exit(2);
});
