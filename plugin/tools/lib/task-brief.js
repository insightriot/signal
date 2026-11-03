// The brief EXECUTE hands a fresh executor agent for one task (Step 2 of the course correction).
//
// The task's text is copied from the plan verbatim; the Epic's other files are named by path, not
// pasted, so the agent reads only what it needs. Built by code so every task gets the same brief.
//
//   node task-brief.js <task id> --start <commit> [--json]     (run in the project's directory)

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { planWaves } from './plan-waves.js';
import { readState } from './state.js';
import { readEffectiveProfile } from './profile.js';
import { resolveArtifactPath } from './resume.js';

const TEST_RUN = join(dirname(fileURLToPath(import.meta.url)), 'test-run.js');
const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'skills', 'build');
const SKILLS = ['incremental-implementation', 'test-driven-development', 'context-engineering', 'source-driven-development'];

/** The heading and text of a group heading (`S1` above `S1.t1`), up to its first sub-heading. */
function groupText(content, id) {
  const lines = content.split('\n');
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const start = lines.findIndex((l) => new RegExp(`^#{2,4}\\s+[\`*_]{0,3}${esc}(?=[\\s\`*_:—–-]|$)`).test(l));
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && /^#{2,4}\s/.test(l));
  return lines.slice(start, end < 0 ? undefined : end).join('\n').trim();
}

/**
 * @param {string} baseDir — the project's directory
 * @param {{taskId: string, start: string}} opts
 * @returns {Promise<{ok: true, brief: string, task: object, files: object} | {ok: false, problem: string}>}
 */
export async function buildTaskBrief(baseDir, { taskId, start }) {
  if (!taskId) return { ok: false, problem: 'No task ID given.' };
  if (!start) return { ok: false, problem: 'No start commit given (--start <commit>).' };
  const planningDir = join(baseDir, '.planning');
  const state = await readState(baseDir);
  const currentEpic = state?.current_epic ?? null;
  const rel = (p) => (p ? relative(baseDir, p) : null);

  const planPath = resolveArtifactPath(planningDir, 'PLAN', { currentEpic, phase: 'PLAN' });
  if (!planPath) return { ok: false, problem: 'No plan found for the current Epic.' };
  const content = readFileSync(planPath, 'utf8');
  const waves = planWaves(content);
  if (!waves.ok) return { ok: false, problem: `The plan cannot be split into waves; run plan-waves.js first.` };
  let task = null;
  for (const w of waves.waves) {
    const t = w.tasks.find((x) => x.id === taskId);
    if (t) task = { ...t, wave: w.wave };
  }
  if (!task) return { ok: false, problem: `${taskId} is not a task in the plan.` };

  const profile = await readEffectiveProfile(baseDir);
  const rigor = profile?.rigor_overrides ?? {};
  const tdd = rigor.tdd_required !== false;
  const files = {
    plan: rel(planPath),
    requirements: rel(resolveArtifactPath(planningDir, 'REQUIREMENTS', { currentEpic, phase: 'DISCUSS' })),
    validation: rigor.nyquist_enforcement === 'off' ? null : rel(resolveArtifactPath(planningDir, 'VALIDATION', { currentEpic, phase: 'PLAN' })),
    research: rel(resolveArtifactPath(planningDir, 'RESEARCH', { currentEpic, phase: 'PLAN' })),
  };

  const groups = [];
  const parts = task.id.split('.');
  for (let i = 1; i < parts.length; i++) {
    const g = groupText(content, parts.slice(0, i).join('.'));
    if (g) groups.push(g);
  }

  const read = [
    files.requirements && `- Requirements, for the decisions this task must respect: \`${files.requirements}\``,
    files.validation && `- The test map, for the tests mapped to ${task.id}: \`${files.validation}\``,
    files.research && `- Research, only the section this task names, if it names one: \`${files.research}\``,
    `- The whole plan, only if this brief leaves something unclear: \`${files.plan}\``,
  ].filter(Boolean);

  const brief = [
    `You are building one task, ${task.id}, of Epic ${currentEpic ?? '(none)'}, in ${baseDir}.`,
    `It starts from commit ${start}. ${task.dependsOn.length ? `Tasks it depends on are already built: ${task.dependsOn.join(', ')}.` : 'It depends on no other task.'}`,
    '',
    '## The task, from the plan',
    '',
    ...(groups.length ? [...groups.map((g) => `${g}\n`), ''] : []),
    `### ${task.heading}`,
    task.body.trim(),
    '',
    '## Read',
    '',
    ...read,
    '',
    '## Do',
    '',
    `Read and apply these skills first: ${SKILLS.map((n) => '`' + join(SKILLS_DIR, n, 'SKILL.md') + '`').join(', ')}; and ` +
      '`' + join(SKILLS_DIR, 'frontend-ui-engineering', 'SKILL.md') + '` if the task touches a user interface.',
    '',
    tdd
      ? '1. Write the tests first and run them: they must fail before the code exists.'
      : '1. Write tests for the acceptance criteria (tests first is not required for this project).',
    '2. Write the least code that makes them pass.',
    `3. Run the whole test suite with \`node "${TEST_RUN}"\`. It must pass: a commit is refused until it has, on the files as they are.`,
    '4. Make exactly one commit, staging only this task\'s files.',
    '',
    'Do not write anything under `.planning/`: the session that sent you records progress. `test-run.js` keeps its record there; leave it out of your commit.',
    'If the task is unclear, the plan is wrong, or you cannot finish, stop without committing and say why.',
    '',
    '## Report back',
    '',
    '- The commit SHA, or "no commit" and why.',
    '- What you built, in two or three lines.',
    '- The test command you ran and its result.',
    '- Anything in the plan that was wrong or unclear, and any choice you made that the plan did not.',
  ].join('\n');

  return { ok: true, brief, task, files };
}

function isMain() {
  try {
    return Boolean(process.argv[1]) && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return false;
  }
}
if (isMain()) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--start');
  const start = at >= 0 ? args[at + 1] : null;
  const taskId = args.find((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1));
  const r = await buildTaskBrief(process.cwd(), { taskId, start });
  if (args.includes('--json')) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
  else process.stdout.write((r.ok ? r.brief : r.problem) + '\n');
  process.exitCode = r.ok ? 0 : 1;
}
