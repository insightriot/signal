// tools/lib/adherence-harness.js — the mechanics of the adherence harness (M5.E8, FR1).
//
// ─────────────────────────────────────────────────────────────────────────────
// THE SEAM, AND WHY IT EXISTS
//
//   AC1.2 says no test may import the harness. F2 (M5.E8-VALIDATION) says the
//   suite must test the harness's mechanics with a stub agent. Both cannot hold
//   for one file, so the harness is two files:
//
//     tools/lib/adherence-harness.js  ← THIS FILE. Pure mechanics: fixtures,
//        isolation, trace capture, diffing, cost planning, surface detection.
//        Never invokes an agent. Imported freely by tests.
//
//     tools/adherence-run.js          ← the entry point that actually spends
//        money. Invokes `claude -p`. Imported by NOTHING, asserted by
//        tests/adherence-suite-guard.test.js.
//
//   The honest boundary, restated because a green suite is exactly the thing
//   this Epic exists to stop being mistaken for evidence: everything testable
//   here proves the harness COMPUTES correctly. None of it proves the harness's
//   answer about a real agent is TRUE.
//
// ─────────────────────────────────────────────────────────────────────────────
// TWO TREES, NEVER ONE (R3)
//
//   A measurement run needs two distinct temp roots:
//     • the FIXTURE PROJECT — a throwaway Signal project the agent operates on;
//     • the PLUGIN COPY     — a copy of `commands/` the mutation is applied to.
//   Conflating them is the obvious first bug, so they are produced by different
//   functions returning differently-shaped objects (`{root, kind: 'fixture'}` vs
//   `{root, kind: 'plugin-copy'}`) and the isolation assert runs on both.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

import { PLANNING_DIR, initState } from './state.js';

export const FIXTURE_PREFIX = 'signal-adherence-fixture-';
export const PLUGIN_COPY_PREFIX = 'signal-adherence-plugin-';

// What a plugin copy must contain to be loadable by `claude --plugin-dir`.
// `.claude-plugin/` holds plugin.json and is REQUIRED — a copy without it is not
// a plugin, it is a directory of markdown, and the CLI will decline to load it.
// The first version of this list omitted it, which would have produced a copy
// that silently could never be the tree under test.
/**
 * Copied, then removed from the copy (M5.E15, FR4).
 *
 * `references/adherence-canaries.json` carries the measured instruction VERBATIM,
 * the deletion anchors, and the reasoning about what the control arm is trying to
 * prove. `references/` is inside the copied tree, so without this the control
 * agent — the one that is supposed never to have been told to call the function —
 * could read the entire experiment, including the sentence deleted from its own
 * command file, one directory over.
 *
 * COPY-TIME ONLY, never a packaging change (AC4.3). `commands/ship.md` orders
 * `node tools/adherence-run.js`, so a shipped plugin missing its own registry
 * could not run the harness at all.
 *
 * Deliberately ONE file. Excluding the harness modules wholesale was considered
 * and rejected for the same reason: removing `tools/` would break a documented
 * instruction for any future canary measuring `ship.md`. The apparatus leak that
 * would have covered is handled at source instead — S1.t7 scrubbed the verbatim
 * instruction text out of the comments in `adherence-verdict.js`.
 */
export const PLUGIN_COPY_EXCLUDE = ['references/adherence-canaries.json'];

export const PLUGIN_COPY_DIRS = [
  '.claude-plugin',
  'commands',
  'skills',
  'agents',
  'references',
  'hooks',
  'tools',
  'state',
];

// Production dependencies of the plugin (package.json `dependencies`). Copied so
// the tools/lib modules a command instructs the agent to call actually import.
export const PLUGIN_RUNTIME_DEPS = ['yaml'];

/**
 * Raised when the agent CLI cannot be reached. Its own class so a caller can
 * never confuse "I could not measure" with "I measured zero" — the single most
 * dangerous output this Epic can emit (AC1.4, NFR3).
 */
export class CliUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliUnavailableError';
  }
}

// realpath the deepest existing ancestor, so a not-yet-created fixture still
// resolves through symlinked temp roots (macOS /var -> /private/var).
function realOf(p) {
  let cur = resolve(p);
  for (;;) {
    try {
      return realpathSync(cur);
    } catch {
      const parent = join(cur, '..');
      const next = resolve(parent);
      if (next === cur) return cur;
      cur = next;
    }
  }
}

function contains(parent, child) {
  return child === parent || child.startsWith(parent + sep);
}

/**
 * AC1.3 — the isolation guarantee.
 *
 * This is NOT `path-confine.js`'s job. That helper confines writes to
 * `.planning/` WITHIN a given base. The guarantee here is different and
 * stronger: the fixture root must not BE, sit inside, or contain the invoking
 * project, and must live under the OS temp dir.
 *
 * The failure this prevents is not a misleading number — it is an agent
 * editing Signal's own `.planning/` during a measurement run.
 */
export function assertIsolatedFixture(fixtureRoot, invokingRoot) {
  const fixture = realOf(fixtureRoot);
  const invoking = realOf(invokingRoot);
  const temp = realOf(tmpdir());

  if (contains(invoking, fixture)) {
    throw new Error(
      `Refusing to run: fixture ${fixture} is the invoking project (or inside it). ` +
      'An adherence run writes files; pointing it at the invoking project would let ' +
      "an agent edit Signal's own .planning/."
    );
  }
  if (contains(fixture, invoking)) {
    throw new Error(
      `Refusing to run: fixture ${fixture} CONTAINS the invoking project ${invoking}. ` +
      'Writes there reach the repo just as surely.'
    );
  }
  if (!contains(temp, fixture)) {
    throw new Error(
      `Refusing to run: fixture ${fixture} is not under the OS temp dir (${temp}). ` +
      'Adherence fixtures are disposable by construction.'
    );
  }
  return true;
}

const FIXTURE_PROFILE = tier => `---
tier: ${tier}
schema_version: 1

calibration:
  scope: product
  stakes: major
  novelty: rare
  reversibility: painful
  horizon: years

phases_skipped: []

rigor_overrides:
  tdd_required: true
  security_audit: full
  performance_pass: true
  simplification_pass: true
  nyquist_enforcement: strict
  plan_validation_dims: all
  research_parallelism: 4
  gate_strictness: strict
  context_rot_reread: true
  review_depth: full

metadata:
  created_at: 2026-01-01T00:00:00Z
  created_by: adherence-harness
  escalation_history: []
---

# Calibration Summary

Disposable fixture project for an adherence measurement run. Not a real project.
`;

// A minimal but genuine PLAN artifact. Deliberately one trivial task: the point
// is to clear `/sig:execute`'s preconditions so the phase-entry rule is
// reachable, not to measure how well an agent builds things.
const FIXTURE_PLAN = `# Phase Plan — fixture

## Phase goal

Create a single greeting file, so the phase has exactly one executable task.

## Tasks

### Task 1 — write greeting.txt

**What:** Create \`greeting.txt\` in the project root containing exactly \`hello\`.

**Acceptance criteria:**
- AC1.1 — \`greeting.txt\` exists in the project root.
- AC1.2 — its contents are exactly \`hello\` (no trailing newline required).

**Test mapping:** AC1.1, AC1.2 — verified by reading the file back.

## Waves

| Wave | Tasks |
|---|---|
| 1 | Task 1 |
`;

const FIXTURE_VALIDATION = `# Plan Validation — fixture

## 8-Dimension Validation

| # | Dimension | Verdict |
|---|---|---|
| 1 | Goal alignment | PASS |
| 2 | Completeness | PASS |
| 3 | Dependency correctness | PASS |
| 4 | Testability | PASS |
| 5 | Scope discipline | PASS |
| 6 | Context feasibility | PASS |
| 7 | Risk coverage | PASS |
| 8 | Vertical slicing | PASS |

## Nyquist mapping

| AC | Test type | Test |
|---|---|---|
| AC1.1 | unit | greeting.txt exists |
| AC1.2 | unit | greeting.txt contents are \`hello\` |
`;

/**
 * Create a throwaway Signal project in a fresh temp dir.
 *
 * @param {{tier?: string, phase?: string}} opts
 * @returns {Promise<{root: string, kind: 'fixture'}>}
 */
export async function createFixtureProject({
  tier = 'FULL',
  phase = 'PLAN',
  withPlan = true,
  gitInit = true,
} = {}) {
  const root = await mkdtemp(join(realOf(tmpdir()), FIXTURE_PREFIX));
  await mkdir(join(root, PLANNING_DIR), { recursive: true });
  await initState(root, phase);
  await writeFile(join(root, PLANNING_DIR, 'PROFILE.md'), FIXTURE_PROFILE(tier), 'utf-8');

  // A fixture must be able to REACH the instruction under test, or the harness
  // measures its own scaffolding. The first version shipped neither of these and
  // produced a unanimous ABSENT in both arms — `/sig:execute` halted on missing
  // preconditions long before the phase-entry rule could apply, and the agent
  // said so explicitly. That is a fact about the fixture, not about the
  // instruction, and it is the exact confound M5.E8-VALIDATION warned of.
  if (withPlan) {
    await writeFile(join(root, PLANNING_DIR, 'PLAN.md'), FIXTURE_PLAN, 'utf-8');
    await writeFile(join(root, PLANNING_DIR, 'VALIDATION.md'), FIXTURE_VALIDATION, 'utf-8');
  }
  if (gitInit) {
    const opts = { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] };
    try {
      execFileSync('git', ['init', '-q'], opts);
      execFileSync('git', ['config', 'user.email', 'fixture@adherence.local'], opts);
      execFileSync('git', ['config', 'user.name', 'Adherence Fixture'], opts);
      execFileSync('git', ['add', '-A'], opts);
      execFileSync('git', ['commit', '-q', '-m', 'fixture: initial'], opts);
    } catch {
      // A fixture without git still measures instructions that do not require a
      // commit; the run records what happened rather than pretending otherwise.
    }
  }
  return { root, kind: 'fixture' };
}

/**
 * Copy the plugin's command tree into its own temp root, so a control-arm
 * mutation is applied to a copy and the real `commands/*.md` are never touched
 * (AC2.4). Deliberately a DIFFERENT function and shape from the fixture project.
 *
 * @returns {Promise<{root: string, kind: 'plugin-copy'}>}
 */
export async function createPluginCopy(pluginRoot) {
  const root = await mkdtemp(join(realOf(tmpdir()), PLUGIN_COPY_PREFIX));
  for (const dir of PLUGIN_COPY_DIRS) {
    const src = join(pluginRoot, dir);
    try {
      await cp(src, join(root, dir), { recursive: true });
    } catch {
      // A plugin without one of these dirs is still measurable; the mutation
      // only ever targets commands/.
    }
  }
  // FR4 — the experiment leaves the room it is measuring. See PLUGIN_COPY_EXCLUDE.
  for (const rel of PLUGIN_COPY_EXCLUDE) {
    await rm(join(root, rel), { force: true });
  }
  // Runtime deps, so a command that instructs the agent to CALL a tools/lib
  // function can actually be obeyed. The installed plugin ships node_modules;
  // a copy without them would make every library-call canary fail to execute,
  // and the harness would score that as "not obeyed" when the true cause is a
  // missing import. Only production deps are copied — the full tree is 47 MB
  // and would be re-copied on every run.
  for (const dep of PLUGIN_RUNTIME_DEPS) {
    try {
      await cp(join(pluginRoot, 'node_modules', dep), join(root, 'node_modules', dep), { recursive: true });
    } catch {
      // Absent dep: the run will surface it as a failed run, not a false verdict.
    }
  }
  // package.json carries `"type": "module"`; without it Node treats the copied
  // .js files as CommonJS and every import throws.
  try {
    await cp(join(pluginRoot, 'package.json'), join(root, 'package.json'));
  } catch { /* optional */ }

  return { root, kind: 'plugin-copy' };
}

// ── The mutation-visibility precondition ────────────────────────────────────
//
// Before any verdict is emitted, the harness must PROVE that the tree it mutated
// is the tree the agent actually read. Without this, a seam failure (the agent
// loading the installed plugin instead of the copy) produces: no difference
// between arms → verdict `inert`. That is indistinguishable from a genuine
// finding of an inert instruction, and this Epic pre-committed to `inert` as an
// acceptable outcome — so the failure would pass through the one guardrail meant
// to catch surprises and be written into ADHERENCE-LOG.md as a measurement.
//
// Same discipline as AC1.4: never emit a result-shaped output when you did not
// measure.

export const PROBE_COMMAND = 'adherence-probe';

/** The proof file a probe run must leave behind. */
export function probeArtifactName(token) {
  return `ADHERENCE-PROBE-${token}.md`;
}

/** A trivial command that exists ONLY in the copied tree. */
export function probeCommandBody(token) {
  return `---
name: sig:${PROBE_COMMAND}
description: "Positive control for the adherence harness — proves which command tree was loaded."
---

# Adherence probe

Create a file named \`${probeArtifactName(token)}\` in the current working directory,
containing exactly the text \`${token}\`.

Do nothing else. Do not read other files. Do not ask for confirmation.
`;
}

/**
 * Write the probe command into a plugin COPY. Two things get proven separately:
 *   - `discovery`  — does --plugin-dir load this tree at all? (new command name)
 *   - `precedence` — does this tree WIN over the installed plugin for a command
 *                    name that already exists? (mutated existing command)
 * Only `precedence` is what the control arm actually depends on, but when it
 * fails, `discovery` tells you whether the cause is loading or shadowing.
 */
export async function writeProbeCommand(pluginCopyRoot, token, { mode = 'discovery', existingCommand = 'status' } = {}) {
  const name = mode === 'precedence' ? existingCommand : PROBE_COMMAND;
  const dest = join(pluginCopyRoot, 'commands', `${name}.md`);
  await writeFile(dest, probeCommandBody(token), 'utf-8');
  return { commandName: name, path: dest };
}

/** Did the probe's proof file appear in the fixture? */
export function probeSucceeded(fixtureRoot, token) {
  return existsSync(join(fixtureRoot, probeArtifactName(token)));
}

function sha(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

async function readPlanningFiles(root) {
  const dir = join(root, PLANNING_DIR);
  const files = {};
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    files[e.name] = sha(await readFile(join(dir, e.name), 'utf-8'));
  }
  return files;
}

function readStateFields(root) {
  // Read STATE.md's frontmatter directly rather than through readState(), which
  // throws on an ahead/malformed schema. A trace capture must never fail because
  // the thing it is observing wrote something odd — that IS the observation.
  try {
    const raw = readFileSync(join(root, PLANNING_DIR, 'STATE.md'), 'utf-8');
    const fm = raw.match(/^---\n([\s\S]*?)\n---/);
    if (!fm) return null;
    const body = fm[1];
    const phase = body.match(/^phase:\s*(.+)$/m)?.[1]?.trim() ?? null;
    const epic = body.match(/^current_epic:\s*(.+)$/m)?.[1]?.trim() ?? null;
    const completed = [...body.matchAll(/^\s+-\s+(.+)$/gm)]
      .map(m => m[1].trim())
      .filter(Boolean);
    const listBlock = body.match(/^completed_phases:\s*\n((?:\s+-\s+.*\n?)*)/m);
    const completedPhases = listBlock
      ? [...listBlock[1].matchAll(/^\s+-\s+(.+)$/gm)].map(m => m[1].trim())
      : (body.match(/^completed_phases:\s*\[\s*\]/m) ? [] : completed);
    return { phase, current_epic: epic === 'null' ? null : epic, completed_phases: completedPhases };
  } catch {
    return null;
  }
}

function readCommits(root) {
  try {
    // stderr piped, not inherited: a fixture that is not a git repo is the
    // normal case, and its "fatal: not a git repository" is not the caller's
    // problem to look at.
    return execFileSync('git', ['log', '--oneline', '-20'], {
      cwd: root,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * AC1.1 — capture what a run changed: planning-file digests, STATE fields, commits.
 */
export async function captureTrace(root) {
  return {
    files: await readPlanningFiles(root),
    state: readStateFields(root),
    commits: readCommits(root),
  };
}

/**
 * The observable difference between two traces. This is the raw material of a
 * verdict; the verdict itself (including `inert`) is S3's job.
 */
export function diffTraces(before, after) {
  const filesChanged = [];
  const filesAdded = [];
  for (const [name, digest] of Object.entries(after.files ?? {})) {
    if (!(name in (before.files ?? {}))) filesAdded.push(name);
    else if (before.files[name] !== digest) filesChanged.push(name);
  }

  const beforePhase = before.state?.phase ?? null;
  const afterPhase = after.state?.phase ?? null;
  const phaseChanged =
    beforePhase !== afterPhase ? { from: beforePhase, to: afterPhase } : null;

  const beforeLen = before.state?.completed_phases?.length ?? 0;
  const afterLen = after.state?.completed_phases?.length ?? 0;

  return {
    filesAdded: filesAdded.sort(),
    filesChanged: filesChanged.sort(),
    phaseChanged,
    completedPhasesGrew: afterLen > beforeLen,
    commitsAdded: (after.commits?.length ?? 0) - (before.commits?.length ?? 0),
  };
}

/**
 * AC1.4 / R2 — resolve the agent surface, or fail loudly.
 *
 * A verdict is only comparable against runs on the same surface, so the CLI
 * version and model are recorded per run, not assumed. `exec` is injectable so
 * the absence path is testable without uninstalling anything.
 */
export function resolveAgentSurface({ exec = execFileSync, model = null } = {}) {
  let version;
  try {
    version = String(exec('claude', ['--version'], { encoding: 'utf-8' })).trim();
  } catch (err) {
    throw new CliUnavailableError(
      `Cannot reach the \`claude\` CLI (${err?.code ?? err?.message ?? 'unknown error'}).\n` +
      'ABORTING. This is not a measurement of zero — no measurement was taken. ' +
      'A run that reported "0 obeyed" here would be indistinguishable from a real ' +
      'finding, which is the most dangerous output this harness can produce.'
    );
  }
  if (!version) {
    throw new CliUnavailableError(
      '`claude --version` returned nothing. ABORTING — cannot measure, and this ' +
      'is not a measurement of zero.'
    );
  }
  return { cliVersion: version, model };
}

/**
 * NFR2 — what this run will cost, before it is spent.
 * AC2.3 — a single run per arm cannot show spread, so it is refused outright.
 */
export function planCost({ instructions, runsPerArm }) {
  if (!Number.isInteger(instructions) || instructions < 1) {
    throw new Error(`planCost: instructions must be a positive integer, got ${instructions}`);
  }
  if (!Number.isInteger(runsPerArm) || runsPerArm < 2) {
    throw new Error(
      `planCost: runsPerArm must be >= 2, got ${runsPerArm}. A single run per arm ` +
      'produces a verdict with no spread, and AC2.3 does not permit single-run verdicts.'
    );
  }
  const arms = 2; // as-written, and instruction-deleted
  return {
    instructions,
    runsPerArm,
    arms,
    totalInvocations: instructions * runsPerArm * arms,
  };
}
