// SessionStart(resume) hook spawn harness (M4.5.E10.S5.t1, FR6, AD9).
//
// hook-state-write.test.js exercises the *helpers* (detectDirtyExecute); this
// exercises the actual PROCESS — `node hooks/warn-dirty-execute.js` — end to
// end, which is the only place the stdout/exit-code contract Claude Code
// depends on is proven in CI.
//
// AD9: the hook is cwd-driven (baseDir = process.cwd()); the stdin payload is
// decorative (the hook ignores it). We pipe a minimal, realistic SessionStart
// payload for fidelity, but the lever is the spawn `cwd`, pointed at a planted
// fixture tree. The one leg this can't cover — that Claude Code actually fires
// the `resume` matcher and spawns with cwd = project root — is the manual
// real-session procedure documented in references/hooks-api.md (S5.t2, AC6.4).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, '..', 'hooks', 'warn-dirty-execute.js');

// STATE.md mid-EXECUTE for an Epic (E3) that the milestone shows shipped.
const STATE_EXECUTE_E3 = `---
schema_version: 1
phase: EXECUTE
current_epic: M4.5.E3
current_wave: S1
current_tasks: []
completed_phases:
  - DISCUSS (2026-05-24)
  - PLAN (2026-05-24)
blockers: []
last_decision_at: 2026-05-24T00:00:00.000Z
---
# body
`;

// Milestone rows: E3 shipped (close-able), E9 still open.
const MILESTONE_E3_CLOSED = `# Milestone 4.5

| **E3 — docs rewrite** | **✓ shipped 2026-05-24** | |
| **E9 — Retro Foundations** | DISCUSS + PLAN done | |
`;

async function plant(dir, { withRetro }) {
  const planning = join(dir, '.planning');
  await mkdir(planning, { recursive: true });
  await writeFile(join(planning, 'STATE.md'), STATE_EXECUTE_E3, 'utf-8');
  await writeFile(join(planning, 'MILESTONE-4.5.md'), MILESTONE_E3_CLOSED, 'utf-8');
  if (withRetro) {
    await writeFile(
      join(planning, 'M4.5.E3-RETROSPECTIVE.md'),
      '# M4.5.E3 Retrospective\n',
      'utf-8'
    );
  }
}

// Spawn the hook process with cwd = fixture. Returns { stdout, status }.
// execFileSync throws on a non-zero exit; both dirty + clean must exit 0.
function runHook(cwd) {
  const stdout = execFileSync('node', [HOOK], {
    cwd,
    encoding: 'utf-8',
    // Decorative per AD9 — the hook ignores stdin. Piped for fidelity/doc.
    input: JSON.stringify({
      session_id: 'test-e10',
      transcript_path: '/dev/null',
      cwd,
      hook_event_name: 'SessionStart',
      source: 'resume',
    }),
  });
  return stdout;
}

describe('warn-dirty-execute.js hook (spawn harness)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-hook-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('AC6.1: dirty EXECUTE cwd → SessionStart JSON contract on stdout, exit 0', async () => {
    const dir = join(tempDir, 'dirty');
    await plant(dir, { withRetro: false });
    const stdout = runHook(dir); // throws if exit != 0
    const payload = JSON.parse(stdout.trim());
    expect(payload.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(typeof payload.hookSpecificOutput.additionalContext).toBe('string');
    expect(payload.hookSpecificOutput.additionalContext.length).toBeGreaterThan(0);
    expect(payload.hookSpecificOutput.additionalContext).toMatch(/M4\.5\.E3/);
  });

  it('AC6.2: clean cwd (retro present) → empty stdout, exit 0, no injection', async () => {
    const dir = join(tempDir, 'clean');
    await plant(dir, { withRetro: true });
    const stdout = runHook(dir);
    expect(stdout.trim()).toBe('');
  });

  it('AC6.2: cwd with no .planning/ → empty stdout, exit 0', async () => {
    const dir = join(tempDir, 'empty');
    await mkdir(dir, { recursive: true });
    const stdout = runHook(dir);
    expect(stdout.trim()).toBe('');
  });
});
