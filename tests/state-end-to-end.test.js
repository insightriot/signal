// End-to-end integration test (M4.5.E6.S5.t1) — proves AC#2 + AC#7:
//
//   AC#2: After context clear mid-EXECUTE, /sig:resume renders accurate briefing.
//   AC#7: Existing 225 tests green; new tests cover all helpers + end-to-end.
//
// Sequence mirrors the real EXECUTE-then-context-clear lifecycle:
//   1. setCurrentTask t1
//   2. clearCurrentTask t1 with commit hash (work completed)
//   3. setCurrentTask t2 (still in flight)
//   4. **Drop in-memory state.** Re-readState from disk — simulates the
//      next process starting cold after a context clear.
//   5. renderResumeBriefing on the re-read state.
//   6. Assert briefing surfaces: last completed task ID, last commit hash,
//      in-flight task ID. That's exactly what /sig:resume must produce for
//      a user who just compacted mid-EXECUTE.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtemp,
  rm,
  mkdir,
  cp,
} from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  setCurrentTask,
  clearCurrentTask,
  readState,
} from '../tools/lib/state.js';
import { renderResumeBriefing } from '../tools/lib/resume.js';
import { readProfile } from '../tools/lib/profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, 'fixtures', 'end-to-end');

async function setupEndToEndFixture(tempDir) {
  // Clone the entire .planning/ directory verbatim into tempDir.
  await cp(join(FIX, '.planning'), join(tempDir, '.planning'), { recursive: true });
}

describe('end-to-end: context-clear mid-EXECUTE → /sig:resume', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-e2e-test-'));
    await setupEndToEndFixture(tempDir);
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('briefing after context-clear renders last-completed + in-flight + commit', async () => {
    // ===== Phase 1: live execution =====
    // Wave starts. Dispatch t1.
    await setCurrentTask(tempDir, {
      id: 'M4.5.E6.S1.t1',
      epic: 'M4.5.E6',
      wave: 1,
    });

    // t1 completes; orchestrator clears it with the commit hash.
    await clearCurrentTask(tempDir, {
      id: 'M4.5.E6.S1.t1',
      status: 'done',
      commit: 'abc123def456ship',
    });

    // Dispatch t2. Mid-task: now in_progress in current_tasks[].
    await setCurrentTask(tempDir, {
      id: 'M4.5.E6.S1.t2',
      epic: 'M4.5.E6',
      wave: 1,
    });

    // ===== Phase 2: simulated context-clear =====
    // Drop in-memory state by performing fresh disk reads. Mirrors what
    // happens when Claude Code compacts or the user clears + reopens:
    // the next session reads STATE.md from scratch.
    const profile = await readProfile(tempDir);
    const reReadState = await readState(tempDir);

    // ===== Phase 3: render the resume briefing =====
    const briefing = renderResumeBriefing({
      cwd: tempDir,
      state: reReadState,
      profile,
      visionText: 'Calibrated AI coding workflow.',
      lockedDecisions: [
        'E6 uses YAML frontmatter STATE.md per D14',
        'markFresh renamed from markStale per phase-researcher',
      ],
      nextAction: 'Continue with /sig:execute on the in-flight task.',
    });

    // ===== Phase 4: assertions =====
    // AC#2 requires the briefing to surface the three things a user
    // returning from a context clear needs to re-orient:
    //   (a) last completed task ID
    //   (b) last commit hash
    //   (c) in-flight task ID

    // (a) Last completed task ID
    expect(briefing).toContain('M4.5.E6.S1.t1');
    expect(briefing).toContain('(done)');

    // (b) Last commit hash (short sha rendering)
    expect(briefing).toContain('abc123de'); // first 8 chars of 'abc123def456ship'

    // (c) In-flight task ID
    expect(briefing).toContain('— In-flight (1) —');
    expect(briefing).toContain('M4.5.E6.S1.t2');

    // Sanity: phase counter reflects the fixture's 3 completed phases.
    expect(briefing).toContain('(3/7 phases done)');

    // Sanity: locked decisions surfaced from CONTEXT.md.
    expect(briefing).toContain('E6 uses YAML frontmatter STATE.md per D14');
  });

  it('after context-clear, re-readState exposes both schema-v1 fields and back-compat aliases', async () => {
    await setCurrentTask(tempDir, { id: 'T1' });
    await clearCurrentTask(tempDir, {
      id: 'T1',
      status: 'done',
      commit: 'live-sha',
    });
    await setCurrentTask(tempDir, { id: 'T2' });

    // Simulate context-clear.
    const state = await readState(tempDir);

    // schema-v1 native (snake_case)
    expect(state.schema_version).toBe(1);
    expect(state.phase).toBe('EXECUTE');
    expect(state.current_tasks).toHaveLength(1);
    expect(state.current_tasks[0].id).toBe('T2');
    expect(state.last_completed_task).toMatchObject({
      id: 'T1',
      status: 'done',
      commit: 'live-sha',
    });

    // back-compat (camelCase) aliases — readers written against the
    // legacy shape keep working through the migration.
    expect(state.completedPhases).toEqual(state.completed_phases);
    expect(state.lastUpdated).toBe(state.last_updated);
    expect(state._schema).toBe(1);
  });
});
