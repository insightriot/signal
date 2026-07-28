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
import { cp, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync, realpathSync } from 'node:fs';
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

/**
 * Create a throwaway Signal project in a fresh temp dir.
 *
 * @param {{tier?: string, phase?: string}} opts
 * @returns {Promise<{root: string, kind: 'fixture'}>}
 */
export async function createFixtureProject({ tier = 'FULL', phase = 'PLAN' } = {}) {
  const root = await mkdtemp(join(realOf(tmpdir()), FIXTURE_PREFIX));
  await mkdir(join(root, PLANNING_DIR), { recursive: true });
  await initState(root, phase);
  await writeFile(join(root, PLANNING_DIR, 'PROFILE.md'), FIXTURE_PROFILE(tier), 'utf-8');
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
  return { root, kind: 'plugin-copy' };
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
