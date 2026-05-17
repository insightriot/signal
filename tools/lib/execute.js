// Orchestrator-level state wrapper for EXECUTE (M4.5.E6.S3).
//
// The executor agent's 6-step process doesn't directly mutate STATE.md.
// commands/execute.md drives each task through `dispatchTaskWithState`,
// which:
//   1. Clears orphan in-progress tasks (other than the next task) so a
//      crashed prior dispatch doesn't permanently wedge current_tasks[].
//   2. Records the task as in_progress before the agent runs.
//   3. Records done / aborted after the agent returns / throws.
//
// D9 tier-aware failure handling: SKETCH skips the protocol entirely;
// FULL/strict halts on setCurrentTask failure; FEATURE/light logs and
// continues so a state-write blip doesn't block work.

import {
  setCurrentTask,
  clearCurrentTask,
  getCurrentTasks,
} from './state.js';

/**
 * Clear in-progress tasks that aren't the one about to dispatch. Used
 * before setCurrentTask to recover from a prior crashed dispatch that
 * left current_tasks[] populated.
 *
 * @param {string} baseDir
 * @param {string} nextTaskId
 */
export async function clearOrphansBeforeDispatch(baseDir, nextTaskId) {
  const tasks = await getCurrentTasks(baseDir);
  const orphans = tasks.filter(
    (t) =>
      t.id !== nextTaskId && (t.status ?? 'in_progress') === 'in_progress'
  );
  for (const o of orphans) {
    process.stderr.write(
      `Signal: clearing orphan task "${o.id}" (in_progress; superseded by dispatch of "${nextTaskId}").\n`
    );
    await clearCurrentTask(baseDir, { id: o.id, status: 'aborted' });
  }
}

/**
 * Wrap a task dispatch with the auto-state-protocol. Designed for
 * commands/execute.md to call once per task in the wave.
 *
 * `task.dispatch` is an injectable async function — production wires
 * the Task tool here; tests stub it. Whatever it returns is the wrapper's
 * return value (with `commit` extracted onto the clearCurrentTask record
 * when present).
 *
 * @param {string} baseDir
 * @param {{id: string, epic?: string, wave?: number, dispatch: () => Promise<any>}} task
 * @param {{tier: string, rigor_overrides?: {gate_strictness?: string}}} profile
 * @returns {Promise<any>} whatever task.dispatch resolves to
 */
export async function dispatchTaskWithState(baseDir, task, profile) {
  // SKETCH tier opts out entirely — STATE.md updates only via manual
  // /sig:checkpoint per the SKETCH preamble in commands/execute.md.
  if (profile?.tier === 'SKETCH') {
    return await task.dispatch();
  }

  await clearOrphansBeforeDispatch(baseDir, task.id);

  const strictness = profile?.rigor_overrides?.gate_strictness;
  try {
    await setCurrentTask(baseDir, {
      id: task.id,
      epic: task.epic ?? null,
      wave: task.wave ?? null,
    });
  } catch (err) {
    if (strictness === 'strict') {
      throw err;
    }
    process.stderr.write(
      `Signal: setCurrentTask failed (${err.message}); continuing without state-tracking for this task.\n`
    );
    // Skip the clearCurrentTask round-trip too — there's nothing to clear.
    return await task.dispatch();
  }

  try {
    const result = await task.dispatch();
    await clearCurrentTask(baseDir, {
      id: task.id,
      status: 'done',
      commit: result?.commit ?? null,
    });
    return result;
  } catch (err) {
    await clearCurrentTask(baseDir, { id: task.id, status: 'aborted' });
    throw err;
  }
}
