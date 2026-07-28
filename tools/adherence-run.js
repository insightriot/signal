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
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  probeSucceeded,
  resolveAgentSurface,
  writeProbeCommand,
} from './lib/adherence-harness.js';
import {
  CANARY_REGISTRY_PATH,
  applyDeletion,
  applySectionDeletion,
  loadCanaryRegistry,
  resolveVerdict,
  summarizeArm,
  traceHit,
} from './lib/adherence-verdict.js';
import { ADHERENCE_LOG, appendRunRecord } from './lib/adherence-log.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Pinned explicitly, not read from an env var that is usually unset. A run
// record with `model: null` is not reproducible, and AC4.3 would fail quietly.
const MODEL = process.env.ADHERENCE_MODEL ?? 'claude-opus-5';

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

function parseArgs(argv) {
  const args = { command: null, canary: null, allCanaries: false, runs: 3, dryRun: false, yes: false, keep: false, probe: false, transcripts: null, arm: null, combine: null, skipProbe: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--canary') args.canary = argv[++i];
    else if (a === '--all-canaries') args.allCanaries = true;
    else if (a === '--command') args.command = argv[++i];
    else if (a === '--runs') args.runs = Number(argv[++i]);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--yes' || a === '-y') args.yes = true;
    else if (a === '--keep') args.keep = true;
    else if (a === '--probe') args.probe = true;
    else if (a === '--transcripts') args.transcripts = argv[++i];
    else if (a === '--arm') args.arm = argv[++i];
    else if (a === '--combine') args.combine = argv[++i];
    else if (a === '--skip-probe') args.skipProbe = true;
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
// A canary whose command does real work needs room to finish. The first live
// re-run timed out every treatment arm at 300s — AFTER the trace had already
// fired — which the verdict rule (correctly, as written) counts as a failed run
// and forces to INDETERMINATE. Raising the timeout is an INSTRUMENT setting, not
// a threshold: the verdict rule in the registry is untouched. Changing that rule
// after seeing results is the rationalization the pre-declared threshold exists
// to prevent; changing how long the instrument waits is not.
const DEFAULT_RUN_TIMEOUT_MS = 900_000;

function invokeAgent({ fixtureRoot, pluginRoot, prompt, allowedTools = ['Write'], timeoutMs = DEFAULT_RUN_TIMEOUT_MS }) {
  // Tool access is granted narrowly and explicitly. The probe needs only Write;
  // widening this is a deliberate act, not a default, even though the fixture is
  // an asserted-isolated temp dir.
  const result = spawnSync(
    'claude',
    ['--plugin-dir', pluginRoot, '--allowedTools', ...allowedTools, '-p', prompt],
    {
      cwd: fixtureRoot,
      encoding: 'utf-8',
      timeout: timeoutMs,
      env: { ...process.env, ADHERENCE_MODEL: MODEL },
    }
  );
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

/**
 * The positive control. Proves the tree we mutate is the tree the agent reads.
 * Two agent calls, run before the control arm is trusted for anything.
 */
async function probeSeam({ quiet = false } = {}) {
  const results = {};
  for (const mode of ['discovery', 'precedence']) {
    const token = `${mode}-${randomBytes(4).toString('hex')}`;
    const fixture = await createFixtureProject({ tier: 'FULL', phase: 'PLAN' });
    const plugin = await createPluginCopy(ROOT);
    assertIsolatedFixture(fixture.root, ROOT);
    assertIsolatedFixture(plugin.root, ROOT);

    const { commandName } = await writeProbeCommand(plugin.root, token, { mode });
    const res = invokeAgent({
      fixtureRoot: fixture.root,
      pluginRoot: plugin.root,
      prompt: `/sig:${commandName}`,
    });
    const ok = probeSucceeded(fixture.root, token);
    results[mode] = ok;

    if (!quiet) {
      console.log(`${mode.padEnd(11)} /sig:${commandName.padEnd(18)} ${ok ? 'PASS' : 'FAIL'}  (exit ${res.status}${res.timedOut ? ', TIMED OUT' : ''})`);
      if (!ok) {
        const detail = (res.stderr || res.stdout || '').trim().split('\n').slice(0, 3).join('\n    ');
        if (detail) console.log(`    ${detail.slice(0, 400)}`);
      }
    }
    await rm(fixture.root, { recursive: true, force: true });
    await rm(plugin.root, { recursive: true, force: true });
  }

  return Boolean(results.precedence);
}

/** `--probe` mode: run the seam probe on its own and report it. */
async function runProbe() {
  let surface;
  try {
    surface = resolveAgentSurface({ exec: execFileSync, model: MODEL });
  } catch (err) {
    if (err instanceof CliUnavailableError) {
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  console.log('\nAdherence seam probe — 2 agent calls');
  console.log('='.repeat(60));
  console.log(`Surface: claude ${surface.cliVersion} · ${surface.model}\n`);

  const ok = await probeSeam({ quiet: false });

  console.log('='.repeat(60));
  if (ok) {
    console.log('SEAM OK — the copied tree wins over the installed plugin. The control');
    console.log('arm can be trusted to be measuring the mutated command.');
  } else {
    console.log('SEAM BROKEN — the mutation would not reach the agent. Both arms would');
    console.log('agree and the harness would report INERT, which is indistinguishable');
    console.log('from a real finding. No verdict may be emitted on this seam.');
  }
  console.log('='.repeat(60) + '\n');
  process.exit(ok ? 0 : 1);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.probe) return runProbe();
  if (args.combine) return combineArms(args);
  if (args.arm) return runSingleArm(args);
  if (args.canary || args.allCanaries) return runCanary(args);
  if (!args.command) {
    console.error(
      'Usage:\n' +
      '  node tools/adherence-run.js --probe                     # prove the seam (2 calls)\n' +
      '  node tools/adherence-run.js --canary <id> [--runs N]    # the two-arm measurement\n' +
      '  node tools/adherence-run.js --command <name> [--runs N] # single-arm observation\n' +
      '  ... --dry-run --yes --keep'
    );
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
    surface = resolveAgentSurface({ exec: execFileSync, model: MODEL });
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
    'This is an OBSERVATION, not a verdict. Use --canary <id> for the two-arm\n' +
    'measurement: a trace seen here could be caused by the instruction or by the\n' +
    'agent doing it anyway, and those are opposite findings.'
  );
  console.log('='.repeat(52) + '\n');

  if (!args.keep) {
    await rm(fixture.root, { recursive: true, force: true });
    await rm(plugin.root, { recursive: true, force: true });
  } else {
    console.log(`Kept: ${fixture.root}\n      ${plugin.root}\n`);
  }
}

/** One arm: N runs, each on a fresh fixture, returning per-run trace booleans. */
async function runArm({ canary, arm, runs, allowedTools, transcriptDir }) {
  const results = [];
  let failedRuns = 0;

  for (let i = 1; i <= runs; i++) {
    const fixture = await createFixtureProject({ tier: 'FULL', phase: 'PLAN' });
    const plugin = await createPluginCopy(ROOT);
    assertIsolatedFixture(fixture.root, ROOT);
    assertIsolatedFixture(plugin.root, ROOT);

    // The control arm deletes the instruction — from the COPY only (AC2.4).
    if (arm === 'control') {
      const target = join(plugin.root, 'commands', `${canary.command}.md`);
      const src = readFileSync(target, 'utf-8');
      const mutated = canary.deleteSection
        ? applySectionDeletion(src, canary.deleteSection)
        : applyDeletion(src, canary.deleteLine);

      // Belt and braces: the control arm must not still contain the instruction.
      // A one-line deletion once left the surrounding rationale intact and the
      // resulting trace would have been recorded as INERT.
      const residue = canary.trace.functionName;
      if (residue && mutated.includes(residue)) {
        throw new Error(
          `Control arm is not a control: commands/${canary.command}.md still mentions ` +
          `${residue} after the mutation. Any verdict from this run would be void.`
        );
      }
      writeFileSync(target, mutated, 'utf-8');
    }

    const before = await captureTrace(fixture.root);
    const res = invokeAgent({
      fixtureRoot: fixture.root,
      pluginRoot: plugin.root,
      prompt: `/sig:${canary.command}`,
      allowedTools,
    });
    const after = await captureTrace(fixture.root);
    const diff = diffTraces(before, after);

    const failed = res.status !== 0 || res.timedOut;
    if (failed) failedRuns++;
    const hit = traceHit(diff, canary.trace.field);
    results.push(hit);

    // Retain the transcript for EVERY run, not only failures. `absent` is the
    // verdict that most needs a reason — a run can exit 0, produce no trace, and
    // the only evidence of WHY is what the agent said. The first version of this
    // logged output on non-zero exit only, which meant a clean 0/3 arrived with a
    // verdict and no way to explain it.
    if (transcriptDir) {
      mkdirSync(transcriptDir, { recursive: true });
      writeFileSync(
        join(transcriptDir, `${canary.id}-${arm}-${i}.txt`),
        `exit=${res.status} timedOut=${res.timedOut} traceHit=${hit}\n` +
        `diff=${JSON.stringify(diff, null, 2)}\n\n--- stdout ---\n${res.stdout}\n--- stderr ---\n${res.stderr}\n`,
        'utf-8'
      );
    }

    console.log(
      `  ${arm.padEnd(9)} run ${i}/${runs}  trace=${hit ? 'YES' : 'no '}  exit=${res.status}${res.timedOut ? ' TIMEOUT' : ''}`
    );
    if (failed && (res.stderr || res.stdout)) {
      console.log(`      ${(res.stderr || res.stdout).trim().split('\n')[0].slice(0, 140)}`);
    }

    await rm(fixture.root, { recursive: true, force: true });
    await rm(plugin.root, { recursive: true, force: true });
  }

  return { results, failedRuns };
}

/**
 * Run ONE arm and persist its result, so a long measurement survives being
 * interrupted. Methodologically equivalent to running both in one process: every
 * run already builds a fresh fixture and a fresh plugin copy, so there is no
 * within-process coupling between arms. The sidecar records the commit and
 * surface, and `--combine` REFUSES to pair arms that disagree on either — which
 * is the property that makes splitting safe rather than convenient.
 */
async function runSingleArm(args) {
  const registry = loadCanaryRegistry(ROOT);
  const canary = registry.canaries.find(c => c.id === args.canary) ?? registry.canaries[0];
  const transcriptDir = args.transcripts;
  if (!transcriptDir) {
    console.error('--arm requires --transcripts <dir> (the arm result is persisted there).');
    process.exit(2);
  }

  let surface;
  try {
    surface = resolveAgentSurface({ exec: execFileSync, model: MODEL });
  } catch (err) {
    if (err instanceof CliUnavailableError) { console.error(`\n${err.message}\n`); process.exit(1); }
    throw err;
  }

  const seamProven = args.skipProbe ? null : await probeSeam({ quiet: true });
  if (seamProven === false) {
    console.error('Seam probe FAILED — refusing to run an arm whose mutation may not reach the agent.');
    process.exit(1);
  }

  console.log(`\nArm: ${args.arm} · ${canary.id} · ${args.runs} runs · claude ${surface.cliVersion} · ${surface.model}`);
  console.log(`Seam probe    ${seamProven === null ? 'SKIPPED (--skip-probe)' : 'PASS'}\n`);

  const { results, failedRuns } = await runArm({
    canary, arm: args.arm, runs: args.runs, allowedTools: ['Write', 'Edit', 'Read', 'Bash'], transcriptDir,
  });
  const summary = summarizeArm(results);

  mkdirSync(transcriptDir, { recursive: true });
  writeFileSync(
    join(transcriptDir, `${canary.id}-${args.arm}-results.json`),
    JSON.stringify({
      canary: canary.id, arm: args.arm, results, failedRuns, summary,
      commit: currentCommit(), surface, runsPerArm: args.runs, seamProven,
    }, null, 2),
    'utf-8'
  );
  console.log(`\n${args.arm}: ${summary.hits}/${summary.runs} ${summary.unanimous ? 'unanimous' : 'SPLIT'} · ${failedRuns} failed`);
}

/** Combine two persisted arms into a verdict. */
async function combineArms(args) {
  const dir = args.combine;
  const registry = loadCanaryRegistry(ROOT);
  const canary = registry.canaries.find(c => c.id === args.canary) ?? registry.canaries[0];

  const read = arm => JSON.parse(readFileSync(join(dir, `${canary.id}-${arm}-results.json`), 'utf-8'));
  let treatment, control;
  try {
    treatment = read('treatment');
    control = read('control');
  } catch (err) {
    console.error(`Missing arm result in ${dir}: ${err.message}`);
    process.exit(2);
  }

  // A verdict is only meaningful if both arms were measured on the same surface
  // and the same source. Refuse rather than silently compare across versions.
  if (treatment.commit !== control.commit) {
    console.error(`Refusing to combine: arms ran at different commits (${treatment.commit} vs ${control.commit}).`);
    process.exit(1);
  }
  if (treatment.surface.cliVersion !== control.surface.cliVersion || treatment.surface.model !== control.surface.model) {
    console.error('Refusing to combine: arms ran on different agent surfaces.');
    process.exit(1);
  }
  if (treatment.runsPerArm !== control.runsPerArm) {
    console.error('Refusing to combine: arms used different run counts.');
    process.exit(1);
  }

  // Strictly true on BOTH arms. `--skip-probe` records null, and null must not
  // launder into "proven" — that would reopen the exact hole the precondition
  // exists to close.
  const seamProven = treatment.seamProven === true && control.seamProven === true;
  const verdict = resolveVerdict({
    treatmentHits: treatment.summary.hits,
    controlHits: control.summary.hits,
    runsPerArm: treatment.runsPerArm,
    failedRuns: treatment.failedRuns + control.failedRuns,
    seamProven,
  });

  console.log('\n' + '='.repeat(60));
  console.log(`as-written (treatment)  ${treatment.summary.hits}/${treatment.summary.runs}  ${treatment.summary.unanimous ? 'unanimous' : 'SPLIT'}`);
  console.log(`deleted    (control)    ${control.summary.hits}/${control.summary.runs}  ${control.summary.unanimous ? 'unanimous' : 'SPLIT'}`);
  console.log(`VERDICT                 ${verdict.toUpperCase()}`);
  console.log('='.repeat(60));
  console.log(VERDICT_NOTE[verdict]);

  await appendRunRecord(ROOT, {
    canary: canary.id, command: canary.command, trace: canary.trace.field, verdict,
    treatment: treatment.summary, control: control.summary,
    failedRuns: treatment.failedRuns + control.failedRuns,
    seamProven, surface: treatment.surface, runsPerArm: treatment.runsPerArm,
  }, { commit: treatment.commit });
  console.log(`\nAppended to .planning/${ADHERENCE_LOG}\n`);
}

/** The two-arm measurement (FR2). */
async function runCanary(args) {
  const registry = loadCanaryRegistry(ROOT);
  const canary = args.canary
    ? registry.canaries.find(c => c.id === args.canary)
    : registry.canaries[0];
  if (!canary) {
    console.error(`No canary ${JSON.stringify(args.canary)} in ${CANARY_REGISTRY_PATH}.`);
    process.exit(2);
  }

  const cost = planCost({ instructions: 1, runsPerArm: args.runs });
  console.log('\nAdherence measurement');
  console.log('='.repeat(60));
  console.log(`Canary        ${canary.id}`);
  console.log(`Instruction   ${canary.instruction}`);
  console.log(`Command       /sig:${canary.command}`);
  console.log(`Trace         ${canary.trace.field} — declared ${canary.declaredAt}`);
  console.log(`Runs per arm  ${cost.runsPerArm}   Arms: ${cost.arms}`);
  console.log(`Agent calls   ${cost.totalInvocations} measurement + 2 seam probe = ${cost.totalInvocations + 2}`);
  console.log('='.repeat(60));

  if (args.dryRun) return;

  let surface;
  try {
    surface = resolveAgentSurface({ exec: execFileSync, model: MODEL });
  } catch (err) {
    if (err instanceof CliUnavailableError) {
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
  console.log(`Surface       claude ${surface.cliVersion} · ${surface.model}\n`);

  if (!args.yes && !(await confirm(`Spend ${cost.totalInvocations + 2} agent call(s)?`))) {
    console.log('Aborted before spending.');
    return;
  }

  // PRECONDITION — prove the mutation reaches the agent before measuring anything.
  const seamProven = await probeSeam({ quiet: true });
  console.log(`Seam probe    ${seamProven ? 'PASS — the copied tree is the one read' : 'FAIL'}\n`);

  const ALLOWED = ['Write', 'Edit', 'Read', 'Bash'];
  const transcriptDir = args.transcripts ?? null;
  if (transcriptDir) console.log(`Transcripts   ${transcriptDir}\n`);
  const treatment = await runArm({ canary, arm: 'treatment', runs: args.runs, allowedTools: ALLOWED, transcriptDir });
  const control = await runArm({ canary, arm: 'control', runs: args.runs, allowedTools: ALLOWED, transcriptDir });

  const t = summarizeArm(treatment.results);
  const c = summarizeArm(control.results);

  let verdict;
  try {
    verdict = resolveVerdict({
      treatmentHits: t.hits,
      controlHits: c.hits,
      runsPerArm: args.runs,
      failedRuns: treatment.failedRuns + control.failedRuns,
      seamProven,
    });
  } catch (err) {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`as-written (treatment)  ${t.hits}/${t.runs}  ${t.unanimous ? 'unanimous' : 'SPLIT'}`);
  console.log(`deleted    (control)    ${c.hits}/${c.runs}  ${c.unanimous ? 'unanimous' : 'SPLIT'}`);
  console.log(`VERDICT                 ${verdict.toUpperCase()}`);
  console.log('='.repeat(60));
  console.log(VERDICT_NOTE[verdict]);
  console.log('');

  const record = {
    canary: canary.id,
    command: canary.command,
    trace: canary.trace.field,
    verdict,
    treatment: t,
    control: c,
    failedRuns: treatment.failedRuns + control.failedRuns,
    seamProven,
    surface: { cliVersion: surface.cliVersion, model: surface.model },
    runsPerArm: args.runs,
  };
  await appendRunRecord(ROOT, record, { commit: currentCommit() });
  console.log(`Appended to .planning/${ADHERENCE_LOG}\n`);
}

const VERDICT_NOTE = {
  obeyed: 'The trace appears only with the instruction present. The instruction changed\nwhat the agent did.',
  inert:
    'The trace appears WITH AND WITHOUT the instruction. The instruction caused\n' +
    'nothing — the agent did it anyway. This is a finding, not a failure, and it is\n' +
    'not to be retried until it passes (NFR4).',
  absent:
    'The trace appeared in neither arm. The instruction was not followed, and the\n' +
    'fixture may not have reached the point where it applies. Check the run output\n' +
    'before reading this as a result about the instruction.',
  indeterminate:
    'Not a clean split, or a run failed. This is an honest "we do not know" — it is\n' +
    'recorded as such rather than rounded into a finding.',
};

main().catch(err => {
  console.error(err?.stack || String(err));
  process.exit(2);
});
