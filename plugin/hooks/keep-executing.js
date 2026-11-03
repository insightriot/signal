#!/usr/bin/env node
// Stop hook: during EXECUTE, an agent that stops while plan tasks are still to build is sent back to
// them (Step 2 of the course correction, loop piece 5). It fires for the session only: the executor
// agent's stop is a separate event (SubagentStop), so a task's agent still returns to the session.
//
// It pushes (exit 2, the next instruction on stderr) only when all of these hold:
// - the phase is EXECUTE, the tier is not SKETCH, and attention is `checkpointed` or `unattended`
//   (at `attended` the user confirms each wave, so a stop is a check-in);
// - the plan's tasks are readable and some are not marked done in the progress file or
//   `last_completed_task`, and the last task was not closed `aborted`;
// - the last test run did not fail (a failing suite is a check-in; no run yet is not);
// - something was built since its last push (a new commit, or a task marked done): an agent that
//   stops again without progress is let go, so it can stop to ask the user;
// - it has pushed fewer times than attention allows since the user last wrote:
//   `checkpointed` 5, `unattended` 20.
// Anything it cannot read lets the stop happen: a wrongful push sends an agent into work it
// should not do.

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { gitEnv } from '../tools/lib/git-env.js';
import { planWaves } from '../tools/lib/plan-waves.js';
import { attentionFor, readEffectiveProfile } from '../tools/lib/profile.js';
import { artifactName, resolveArtifactPath } from '../tools/lib/resume.js';
import { readState } from '../tools/lib/state.js';
import { checkTestRun } from '../tools/lib/test-run.js';
import { findProjectRoot, statePhase } from './project-root.js';

const PUSH_LIMIT = { checkpointed: 5, unattended: 20 };
const EXECUTE_MD = join(dirname(fileURLToPath(import.meta.url)), '..', 'commands', 'execute.md');
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const say = (text) => process.stdout.write(JSON.stringify({ systemMessage: text }) + '\n');

async function main() {
  let event;
  try {
    event = JSON.parse(readFileSync(0, 'utf-8'));
  } catch {
    return 0;
  }
  if (event?.hook_event_name !== 'Stop' || typeof event.session_id !== 'string') return 0;
  const cwd = typeof event.cwd === 'string' && isAbsolute(event.cwd) ? event.cwd : process.cwd();
  const found = findProjectRoot(cwd);
  if (!found || statePhase(found.state) !== 'EXECUTE') return 0;
  const { root } = found;
  const planningDir = join(root, '.planning');

  const state = await readState(root);
  if (!state || state.phase !== 'EXECUTE') return 0;
  const currentEpic = state.current_epic ?? null;
  const profile = await readEffectiveProfile(root, { currentEpic });
  const attention = attentionFor(profile);
  const limit = PUSH_LIMIT[attention];
  if (!limit || profile.tier === 'SKETCH') return 0;
  if (state.last_completed_task?.status === 'aborted') return 0;

  const planPath = resolveArtifactPath(planningDir, 'PLAN', { currentEpic, phase: 'PLAN' });
  if (!planPath) return 0;
  const waves = planWaves(readFileSync(planPath, 'utf8'));
  if (!waves.ok) return 0;
  const tasks = waves.waves.flatMap((w) => w.tasks.map((t) => t.id));

  let progress = '';
  try {
    progress = readFileSync(join(planningDir, artifactName('PROGRESS', { currentEpic, planningDir })), 'utf8');
  } catch {
    // No progress file yet: nothing marked done there.
  }
  const done = (id) =>
    (state.last_completed_task?.id === id && state.last_completed_task?.status === 'done') ||
    new RegExp(String.raw`^\s*[-*]\s+\[[xX]\]\s+[\x60*_]*${escapeRe(id)}(?![\w.])`, 'm').test(progress);
  const remaining = tasks.filter((id) => !done(id));
  if (remaining.length === 0) return 0;

  const run = checkTestRun(root);
  if (run.record && !run.record.passed) return 0;

  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, env: gitEnv(root), encoding: 'utf8' });
  if (head.status !== 0) return 0;
  const mark = `${head.stdout.trim()} ${remaining.join(',')}`;
  const guardPath = join(tmpdir(), `signal-keep-executing-${createHash('sha256').update(`${event.session_id}\0${root}`).digest('hex').slice(0, 16)}.json`);
  let guard = {};
  try {
    guard = JSON.parse(readFileSync(guardPath, 'utf8'));
  } catch {
    // First stop in this session.
  }
  // A new message from the user is a check-in: the count starts again.
  const pushes = guard.promptId === event.prompt_id ? guard.pushes ?? 0 : 0;
  const left = `${remaining.length} of ${tasks.length} plan tasks are still to build (next: ${remaining[0]})`;
  if (pushes > 0 && guard.mark === mark) {
    say(`Signal: ${left}. Nothing was built since Signal last sent the agent back, so it stops here. Run /sig:execute to go on.`);
    return 0;
  }
  if (pushes >= limit) {
    say(`Signal: ${left}. The agent was sent back ${pushes} times, the limit at \`${attention}\`, so it stops here to check in. Run /sig:execute to go on.`);
    return 0;
  }
  writeFileSync(guardPath, JSON.stringify({ promptId: event.prompt_id, pushes: pushes + 1, mark }));
  process.stderr.write(
    `Signal: EXECUTE is not finished: ${left}. Build ${remaining[0]} as step 5 of ${EXECUTE_MD} says, then the rest in wave order, then Finish (step 8).` +
      (run.record ? '' : ' No test run is recorded yet: the task runs test-run.js before it commits.') +
      ` If you stopped because only the user can decide something, or a task cannot be finished (close it \`aborted\`), say so in one line and stop: Signal does not send you back again until a task is built.\n`,
  );
  return 2;
}

main().then(
  (code) => process.exit(code),
  () => process.exit(0),
);
