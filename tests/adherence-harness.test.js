import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readFileSync, readdirSync, rmSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  assertIsolatedFixture,
  createFixtureProject,
  createPluginCopy,
  captureTrace,
  diffTraces,
  resolveAgentSurface,
  planCost,
  CliUnavailableError,
  PROBE_COMMAND,
  PLUGIN_RUNTIME_DEPS,
  probeArtifactName,
  probeCommandBody,
  probeSucceeded,
  writeProbeCommand,
} from '../tools/lib/adherence-harness.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * FR1 — the harness skeleton (M5.E8.S2).
 *
 * Pinned at RED commit time before tools/lib/adherence-harness.js exists.
 *
 * THE SEAM THIS FILE DEPENDS ON, stated because AC1.2 and F2 pull against each
 * other: the harness is split in two on purpose.
 *
 *   tools/lib/adherence-harness.js — pure mechanics. Imported and tested here.
 *   tools/adherence-run.js         — the agent-invoking entry point. NEVER
 *                                    imported by any test (asserted in
 *                                    tests/adherence-suite-guard.test.js).
 *
 * WHAT THIS FILE PROVES: the mechanics compute correctly against a stub.
 * WHAT IT CANNOT PROVE: that the harness's answer about a REAL agent is true.
 * Per M5.E8-VALIDATION F2, a stub-driven green suite is not evidence of measured
 * adherence, and nothing here should ever be read as if it were.
 */

const created = [];
function scratch(prefix = 'sig-test-') {
  const d = mkdtempSync(join(tmpdir(), prefix));
  created.push(d);
  return d;
}
afterEach(() => {
  while (created.length) {
    try { rmSync(created.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

describe('isolation — the guarantee that can destroy work, not merely mislead (AC1.3)', () => {
  it('accepts a fixture under the OS temp dir', () => {
    const fixture = scratch();
    expect(() => assertIsolatedFixture(fixture, ROOT)).not.toThrow();
  });

  it('REFUSES the invoking project itself', () => {
    expect(() => assertIsolatedFixture(ROOT, ROOT)).toThrow(/invoking project/i);
  });

  it('REFUSES a path inside the invoking project — including .planning/', () => {
    expect(() => assertIsolatedFixture(join(ROOT, '.planning'), ROOT)).toThrow(/invoking project/i);
    expect(() => assertIsolatedFixture(join(ROOT, 'tools', 'lib'), ROOT)).toThrow(/invoking project/i);
  });

  it('REFUSES a fixture that is not under the OS temp dir', () => {
    expect(() => assertIsolatedFixture('/', ROOT)).toThrow(/temp/i);
  });

  it('REFUSES a fixture that would CONTAIN the invoking project', () => {
    // The pathological inverse: a "fixture" root high enough that the real repo
    // sits inside it. Writes there reach the repo just as surely.
    expect(() => assertIsolatedFixture(dirname(ROOT), ROOT)).toThrow();
  });
});

describe('fixture and plugin copy are two different trees (R3)', () => {
  it('creates a scratch project with .planning/ STATE + PROFILE', async () => {
    const fixture = await createFixtureProject({ tier: 'FULL' });
    created.push(fixture.root);
    expect(existsSync(join(fixture.root, '.planning', 'STATE.md'))).toBe(true);
    expect(existsSync(join(fixture.root, '.planning', 'PROFILE.md'))).toBe(true);
    expect(() => assertIsolatedFixture(fixture.root, ROOT)).not.toThrow();
  });

  it('copies the command tree to a SEPARATE root from the fixture project', async () => {
    const fixture = await createFixtureProject({ tier: 'FULL' });
    created.push(fixture.root);
    const plugin = await createPluginCopy(ROOT);
    created.push(plugin.root);

    expect(plugin.root).not.toBe(fixture.root);
    expect(plugin.root.startsWith(fixture.root)).toBe(false);
    expect(fixture.root.startsWith(plugin.root)).toBe(false);
    expect(existsSync(join(plugin.root, 'commands', 'execute.md'))).toBe(true);
  });

  it('the plugin copy is a copy — mutating it leaves the real commands/ untouched (AC2.4)', async () => {
    const plugin = await createPluginCopy(ROOT);
    created.push(plugin.root);
    const realBefore = readFileSync(join(ROOT, 'commands', 'execute.md'), 'utf-8');
    writeFileSync(join(plugin.root, 'commands', 'execute.md'), 'MUTATED');
    expect(readFileSync(join(ROOT, 'commands', 'execute.md'), 'utf-8')).toBe(realBefore);
  });
});

describe('the plugin copy can actually execute what a canary measures', () => {
  it('PLUGIN_RUNTIME_DEPS matches package.json dependencies', () => {
    // Hand-maintained lists drift. If a new production dependency is added and
    // not copied, the plugin copy cannot import the tools/lib module a canary
    // instructs the agent to call — and the harness scores that as "not obeyed"
    // when the true cause is a missing package.
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
    expect([...PLUGIN_RUNTIME_DEPS].sort()).toEqual(Object.keys(pkg.dependencies ?? {}).sort());
  });

  it('copies the manifest, package.json and runtime deps', async () => {
    const plugin = await createPluginCopy(ROOT);
    created.push(plugin.root);
    expect(existsSync(join(plugin.root, '.claude-plugin', 'plugin.json'))).toBe(true);
    expect(existsSync(join(plugin.root, 'package.json'))).toBe(true);
    for (const dep of PLUGIN_RUNTIME_DEPS) {
      expect(existsSync(join(plugin.root, 'node_modules', dep)), `missing dep ${dep}`).toBe(true);
    }
  });
});

describe('trace capture (AC1.1)', () => {
  it('captures STATE fields, planning files, and commits', async () => {
    const fixture = await createFixtureProject({ tier: 'FULL' });
    created.push(fixture.root);
    const trace = await captureTrace(fixture.root);
    expect(trace.state).toBeTruthy();
    expect(trace.state.phase).toBeTruthy();
    expect(Array.isArray(trace.state.completed_phases)).toBe(true);
    expect(trace.files['STATE.md']).toBeTruthy();
  });

  it('diffTraces reports a phase advance and a grown completed_phases — B41 canary shape', async () => {
    const before = {
      state: { phase: 'PLAN', completed_phases: ['DISCUSS'], current_epic: null },
      files: { 'STATE.md': 'aaa' },
      commits: [],
    };
    const after = {
      state: { phase: 'EXECUTE', completed_phases: ['DISCUSS', 'PLAN'], current_epic: null },
      files: { 'STATE.md': 'bbb' },
      commits: [],
    };
    const d = diffTraces(before, after);
    expect(d.phaseChanged).toEqual({ from: 'PLAN', to: 'EXECUTE' });
    expect(d.completedPhasesGrew).toBe(true);
    expect(d.filesChanged).toContain('STATE.md');
  });

  it('diffTraces reports no change when nothing moved', () => {
    const t = { state: { phase: 'PLAN', completed_phases: ['DISCUSS'] }, files: { 'STATE.md': 'a' }, commits: [] };
    const d = diffTraces(t, t);
    expect(d.phaseChanged).toBeNull();
    expect(d.completedPhasesGrew).toBe(false);
    expect(d.filesChanged).toEqual([]);
  });
});

describe('agent surface — absence must be LOUD, never a zero verdict (AC1.4, NFR3)', () => {
  it('records CLI version + model when the CLI is present', () => {
    const surface = resolveAgentSurface({
      exec: (cmd, args) => {
        if (args.includes('--version')) return '2.1.220 (Claude Code)\n';
        throw new Error(`unexpected: ${cmd} ${args.join(' ')}`);
      },
      model: 'claude-opus-5',
    });
    expect(surface.cliVersion).toContain('2.1.220');
    expect(surface.model).toBe('claude-opus-5');
  });

  it('THROWS CliUnavailableError when the CLI is missing — never returns a runnable surface', () => {
    expect(() =>
      resolveAgentSurface({
        exec: () => { const e = new Error('spawn claude ENOENT'); e.code = 'ENOENT'; throw e; },
        model: 'claude-opus-5',
      })
    ).toThrow(CliUnavailableError);
  });

  it('the failure names the reason — a maintainer must not read it as "0 obeyed"', () => {
    let caught;
    try {
      resolveAgentSurface({
        exec: () => { const e = new Error('spawn claude ENOENT'); e.code = 'ENOENT'; throw e; },
        model: 'claude-opus-5',
      });
    } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(CliUnavailableError);
    expect(caught.message).toMatch(/claude/i);
    expect(caught.message).toMatch(/not a measurement|no measurement|cannot measure/i);
  });
});

describe('mutation-visibility precondition — the probe (S3 gate)', () => {
  it('the probe command carries a unique token and instructs exactly one write', () => {
    const body = probeCommandBody('tok-1234');
    expect(body).toContain('tok-1234');
    expect(body).toContain(probeArtifactName('tok-1234'));
    expect(body).toMatch(/^---\nname: sig:/);
  });

  it('discovery mode writes a NEW command; precedence mode OVERWRITES an existing one', async () => {
    const plugin = await createPluginCopy(ROOT);
    created.push(plugin.root);

    const disc = await writeProbeCommand(plugin.root, 'tok-a', { mode: 'discovery' });
    expect(disc.commandName).toBe(PROBE_COMMAND);

    const prec = await writeProbeCommand(plugin.root, 'tok-b', { mode: 'precedence', existingCommand: 'status' });
    expect(prec.commandName).toBe('status');
    // It must genuinely replace a command that already exists, or it proves nothing
    // about shadowing the installed plugin.
    expect(readFileSync(prec.path, 'utf-8')).toContain('tok-b');
  });

  it('probeSucceeded reports only on the exact token artifact', async () => {
    const fixture = await createFixtureProject({ tier: 'FULL' });
    created.push(fixture.root);
    expect(probeSucceeded(fixture.root, 'tok-missing')).toBe(false);
    writeFileSync(join(fixture.root, probeArtifactName('tok-present')), 'tok-present');
    expect(probeSucceeded(fixture.root, 'tok-present')).toBe(true);
    expect(probeSucceeded(fixture.root, 'tok-other')).toBe(false);
  });
});

describe('cost preview precedes any spend (NFR2)', () => {
  it('reports the exact invocation count for the planned run', () => {
    const plan = planCost({ instructions: 1, runsPerArm: 3 });
    expect(plan.arms).toBe(2);
    expect(plan.totalInvocations).toBe(6);
  });

  it('scales with the canary set — the number research used to cut 5 to 1', () => {
    expect(planCost({ instructions: 5, runsPerArm: 3 }).totalInvocations).toBe(30);
  });

  it('refuses a single-run plan — AC2.3 forbids single-run verdicts', () => {
    expect(() => planCost({ instructions: 1, runsPerArm: 1 })).toThrow(/spread|single/i);
  });
});
