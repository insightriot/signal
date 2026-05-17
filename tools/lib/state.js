import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { atomicWrite } from './atomic-write.js';
import {
  acquireLock as fileAcquireLock,
} from './file-lock.js';

const PLANNING_DIR = '.planning';

const PHASES = ['CALIBRATE', 'DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP'];

// --- Schema layer (M4.5.E6.S1.t3 onward) ---
//
// STATE.md is moving to YAML frontmatter + freeform body. The pure helpers
// below are the substrate for S1.t4 (upgradeStateFile, legacy → schema_v1
// migration) and S1.t5 (readState rewrite with strict three-way detection).

/**
 * Raised when STATE.md content fails schema validation — malformed YAML,
 * unsupported schema_version, missing schema_version on frontmatter, etc.
 */
export class StateSchemaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StateSchemaError';
  }
}

/**
 * Raised when a STATE.md mutation cannot complete — lock contention,
 * pre-mutation precondition failure (no STATE.md, wrong schema), etc.
 * D9 tier-aware callers dispatch on this type.
 */
export class StateWriteError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StateWriteError';
  }
}

const STATE_LOCK_PATH_REL = '.planning/.state.lock';
const STATE_LOCK_TTL_MS = 5_000;

// Anchored regex: opening `---\n`, captured YAML block (non-greedy), closing
// `---\n?`, captured body. `\r?\n` keeps CRLF-checked-out files working on
// macOS/Linux. The trailing `\n?` makes the post-fence newline optional so
// files without a final newline still parse.
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Parse a STATE.md-shaped string into its frontmatter data + body. Returns
 * `{data: null, body: raw}` when no frontmatter is present (legacy STATE.md);
 * the caller decides whether that means "trigger upgrade" or "treat as-is".
 *
 * @param {string} raw
 * @returns {{data: object | null, body: string}}
 */
export function parseFrontmatter(raw) {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { data: null, body: raw };
  }
  const [, yamlBlock, body] = match;
  let data;
  try {
    data = parseYaml(yamlBlock, { schema: 'core' });
  } catch (err) {
    throw new StateSchemaError(`STATE.md frontmatter YAML is malformed: ${err.message}`);
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    const got = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;
    throw new StateSchemaError(
      `STATE.md frontmatter must be a YAML mapping; got ${got}.`
    );
  }
  return { data, body };
}

/**
 * Render a frontmatter object + body back into the canonical STATE.md shape.
 * Round-trips through `parseFrontmatter` losslessly for well-formed inputs.
 *
 * @param {object} data
 * @param {string} body
 * @returns {string}
 */
export function stringifyFrontmatter(data, body) {
  const yamlBlock = stringifyYaml(data).trimEnd();
  return `---\n${yamlBlock}\n---\n${body}`;
}

const SCHEMA_VERSION = 1;

// Best-effort fetch of the current git HEAD sha. Returns null when git is
// unavailable, the cwd isn't a repo, or HEAD is otherwise unreadable —
// matches the D6 graceful-degradation posture for git-dependent helpers.
function getCurrentGitCommit(baseDir) {
  try {
    const out = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: baseDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(out).trim() || null;
  } catch {
    return null;
  }
}

function inferPhase(rawContent) {
  // Anchor on a line that starts with "## Current Phase"; take the first
  // non-empty line after it as the phase. Default to EXECUTE when missing —
  // pre-S1 STATE.md files were almost always written mid-EXECUTE.
  const match = rawContent.match(/^## Current Phase\s*\n+([^\n]+)/m);
  return match ? match[1].trim() : 'EXECUTE';
}

function inferCompletedPhases(rawContent) {
  // Find the section start; bail when missing.
  const startMatch = rawContent.match(/^## Completed Phases\s*\n/m);
  if (!startMatch) return [];
  const afterHeading = rawContent.slice(startMatch.index + startMatch[0].length);
  // Cut at the next `## ` heading start, or run to end-of-input.
  const nextHeading = afterHeading.match(/\n## /);
  const body = (nextHeading
    ? afterHeading.slice(0, nextHeading.index)
    : afterHeading
  ).trim();
  if (body === '' || body === '(none)') return [];
  return body
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

const MIGRATION_NOTICE_TEMPLATE =
  '<!-- Original STATE.md content preserved verbatim from pre-schema_v1 migration on {date}. The YAML frontmatter above is the authoritative machine-readable state; everything below is human-readable history. -->';

/**
 * Auto-upgrade a legacy (freeform / no-frontmatter) STATE.md into the
 * schema_version-1 shape. Idempotent: re-running on an already-upgraded file
 * is a no-op. Preserves original content verbatim under an HTML comment
 * marker so the human-readable narrative remains accessible after migration.
 *
 * @param {string} baseDir
 * @returns {Promise<{upgraded: boolean, schemaVersion?: number, reason?: string}>}
 */
export async function upgradeStateFile(baseDir) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  if (!existsSync(statePath)) {
    return { upgraded: false, reason: 'no-state-file' };
  }
  const raw = await readFile(statePath, 'utf-8');
  const { data } = parseFrontmatter(raw);
  if (data !== null) {
    return { upgraded: false, reason: 'already-frontmatter' };
  }

  const today = new Date().toISOString().split('T')[0];
  const newFrontmatter = {
    schema_version: SCHEMA_VERSION,
    phase: inferPhase(raw),
    current_epic: null,
    current_wave: null,
    current_tasks: [],
    completed_phases: inferCompletedPhases(raw),
    blockers: [],
    last_decision_at: null,
    last_updated_commit: getCurrentGitCommit(baseDir),
    last_updated: new Date().toISOString(),
  };
  const notice = MIGRATION_NOTICE_TEMPLATE.replace('{date}', today);
  const body = `${notice}\n\n${raw}`;
  await atomicWrite(statePath, stringifyFrontmatter(newFrontmatter, body));

  process.stderr.write(
    `Signal: STATE.md upgraded to schema_version ${SCHEMA_VERSION}. ` +
      `Original content preserved verbatim below frontmatter.\n`
  );
  return { upgraded: true, schemaVersion: SCHEMA_VERSION };
}

/**
 * Initialize the .planning/ directory for a new project.
 * @param {string} baseDir - The project root directory
 * @param {string} [initialPhase='CALIBRATE'] - Phase to write into STATE.md.
 *   Default `CALIBRATE` matches `/sig:new-project`'s expected sequence
 *   (Phase 0 runs first). Pass `DISCUSS` if calling from a post-calibrate path.
 * @returns {Promise<string>} Path to the created .planning/ directory
 */
export async function initState(baseDir, initialPhase = 'CALIBRATE') {
  if (!PHASES.includes(initialPhase)) {
    throw new Error(`Invalid initial phase: ${initialPhase}. Must be one of: ${PHASES.join(', ')}`);
  }

  const planningDir = join(baseDir, PLANNING_DIR);

  if (!existsSync(planningDir)) {
    await mkdir(planningDir, { recursive: true });
  }

  const now = new Date().toISOString().split('T')[0];
  const stateContent = `# Project State

## Current Phase
${initialPhase}

## Completed Phases
(none)

## Blockers
(none)

## Last Updated
${now}
`;

  await writeFile(join(planningDir, 'STATE.md'), stateContent, 'utf-8');
  return planningDir;
}

/**
 * Read the current project state. Three-way schema detection per D14:
 *
 * 1. No frontmatter → legacy parse path; returns camelCase fields with
 *    `_schema: 'legacy'` sentinel. Downstream mutating helpers see this
 *    and call `upgradeStateFile` on the next write.
 * 2. Frontmatter + `schema_version: 1` → return parsed data, exposing
 *    both the native snake_case fields and back-compat camelCase aliases.
 *    `_schema: 1`.
 * 3. Frontmatter + unknown `schema_version` (e.g., 999, written by a
 *    newer Signal) → throws StateSchemaError. Fail closed.
 * 4. Frontmatter present but no `schema_version` key → throws
 *    StateSchemaError. Refuses to auto-upgrade; the user must either
 *    remove the frontmatter (to let migration run) or hand-edit
 *    `schema_version: 1` in.
 *
 * Pre-existing contract preserved: file absent → returns `null`.
 *
 * @param {string} baseDir
 * @returns {Promise<object | null>}
 */
export async function readState(baseDir) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  if (!existsSync(statePath)) return null;

  const content = await readFile(statePath, 'utf-8');
  const { data } = parseFrontmatter(content);

  if (data === null) {
    // Case 3 in D14: no frontmatter → legacy path + sentinel.
    return { ...legacyParse(content), _schema: 'legacy' };
  }
  if (!('schema_version' in data)) {
    // Case 4 in D14: structured front but no version key. Refuse to guess.
    throw new StateSchemaError(
      `STATE.md has frontmatter but no schema_version key. Refusing to auto-upgrade — either remove the frontmatter to let Signal migrate the file, or add \`schema_version: 1\` manually.`
    );
  }
  if (data.schema_version !== SCHEMA_VERSION) {
    // Case 2 in D14: unknown version → fail closed.
    throw new StateSchemaError(
      `STATE.md was written by a newer Signal version (schema_version ${data.schema_version}); this Signal supports schema_version ${SCHEMA_VERSION}. Upgrade Signal or hand-edit the frontmatter.`
    );
  }
  // Case 1 in D14: parse normally. Expose snake_case fields plus camelCase
  // aliases for code written against the pre-schema legacy shape.
  return {
    ...data,
    _schema: SCHEMA_VERSION,
    completedPhases: data.completed_phases ?? [],
    lastUpdated: data.last_updated ?? null,
  };
}

// Legacy parser — extracted so readState can route the no-frontmatter case
// through the same logic as the pre-S1 implementation. `inferCompletedPhases`
// is shared with upgradeStateFile so the two paths can't disagree about
// what counts as a completed phase.
function legacyParse(content) {
  const phaseMatch = content.match(/^## Current Phase\s*\n+([^\n]+)/m);
  const phase = phaseMatch ? phaseMatch[1].trim() : null;
  const completedPhases = inferCompletedPhases(content);
  const updatedMatch = content.match(/^## Last Updated\s*\n+([^\n]+)/m);
  const lastUpdated = updatedMatch ? updatedMatch[1].trim() : null;
  return { phase, completedPhases, lastUpdated };
}

/**
 * Transition to the next phase.
 * @param {string} baseDir - The project root directory
 * @param {string} nextPhase - The phase to transition to
 * @returns {Promise<void>}
 */
export async function transitionPhase(baseDir, nextPhase) {
  if (!PHASES.includes(nextPhase)) {
    throw new Error(`Invalid phase: ${nextPhase}. Must be one of: ${PHASES.join(', ')}`);
  }

  const state = await readState(baseDir);
  if (!state) {
    throw new Error('No project state found. Run /sig:new-project first.');
  }

  const now = new Date().toISOString().split('T')[0];
  // Dedupe by phase name; keep the latest (timestamp) entry per phase. Recovery
  // scenarios (manual STATE.md edits, re-run transitions) otherwise append duplicates.
  const phaseNameOf = (entry) => entry.split(' ')[0];
  const seen = state.phase
    ? [...state.completedPhases, `${state.phase} (${now})`]
    : state.completedPhases;
  const completed = Array.from(
    new Map(seen.map((entry) => [phaseNameOf(entry), entry])).values()
  );

  const completedSection = completed.length > 0
    ? completed.map(p => `- ${p}`).join('\n')
    : '(none)';

  const stateContent = `# Project State

## Current Phase
${nextPhase}

## Completed Phases
${completedSection}

## Blockers
(none)

## Last Updated
${now}
`;

  await writeFile(join(baseDir, PLANNING_DIR, 'STATE.md'), stateContent, 'utf-8');
}

/**
 * Check if the required artifacts exist for a phase transition.
 * @param {string} baseDir - The project root directory
 * @param {string} targetPhase - The phase to transition to
 * @returns {Promise<{ready: boolean, missing: string[]}>}
 */
export async function checkGateArtifacts(baseDir, targetPhase) {
  const planningDir = join(baseDir, PLANNING_DIR);
  const missing = [];

  const requirements = {
    PLAN: ['PROJECT.md', 'CONTEXT.md', 'REQUIREMENTS.md'],
    EXECUTE: [],  // Dynamically checked based on phase number
    VERIFY: [],
    REVIEW: [],
    SHIP: [],
  };

  const required = requirements[targetPhase] || [];

  for (const file of required) {
    if (!existsSync(join(planningDir, file))) {
      missing.push(file);
    }
  }

  return { ready: missing.length === 0, missing };
}

export { PHASES, PLANNING_DIR };

// --- current_tasks helpers (M4.5.E6.S1.t6, D10) ---
//
// All mutating helpers go through `withStateLock` (5s TTL on
// `.planning/.state.lock`) and call `readStateForMutation` so a legacy
// STATE.md is auto-upgraded before any write touches disk.

async function withStateLock(baseDir, fn) {
  let lock;
  try {
    lock = await fileAcquireLock(join(baseDir, STATE_LOCK_PATH_REL), {
      ttlMs: STATE_LOCK_TTL_MS,
      label: 'state write',
    });
  } catch (err) {
    throw new StateWriteError(`Could not acquire STATE.md lock: ${err.message}`);
  }
  try {
    return await fn();
  } finally {
    await lock.released();
  }
}

async function readStateForMutation(baseDir) {
  const initial = await readState(baseDir);
  if (initial?._schema === 'legacy') {
    await upgradeStateFile(baseDir);
    return await readState(baseDir);
  }
  return initial;
}

// Strip read-side ergonomics before round-tripping back to disk: `_schema`
// is a runtime sentinel, and `completedPhases`/`lastUpdated` are back-compat
// camelCase aliases of the same underlying fields.
function stripStateMeta(state) {
  const out = { ...state };
  delete out._schema;
  delete out.completedPhases;
  delete out.lastUpdated;
  return out;
}

async function writeStateFrontmatter(baseDir, data) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  const raw = await readFile(statePath, 'utf-8');
  const { body } = parseFrontmatter(raw);
  await atomicWrite(statePath, stringifyFrontmatter(data, body ?? ''));
}

/**
 * Append a task to `current_tasks[]`. Idempotent — re-calling with an `id`
 * already present is a no-op. Triggers `upgradeStateFile` first when called
 * on a legacy STATE.md.
 *
 * @param {string} baseDir
 * @param {{id: string, epic?: string|null, wave?: number|null, status?: string, startedAt?: string}} opts
 */
export async function setCurrentTask(baseDir, opts) {
  if (!opts || !opts.id) {
    throw new StateWriteError('setCurrentTask requires an `id`.');
  }
  return withStateLock(baseDir, async () => {
    const state = await readStateForMutation(baseDir);
    if (!state || state._schema !== SCHEMA_VERSION) {
      throw new StateWriteError(
        'STATE.md must be at schema_version 1 before tasks can be set. Run /sig:new-project or /sig:init first.'
      );
    }
    const current = state.current_tasks ?? [];
    if (current.some((t) => t.id === opts.id)) {
      return; // idempotent
    }
    const entry = {
      id: opts.id,
      epic: opts.epic ?? null,
      wave: opts.wave ?? null,
      status: opts.status ?? 'in_progress',
      startedAt: opts.startedAt ?? new Date().toISOString(),
    };
    const payload = stripStateMeta(state);
    payload.current_tasks = [...current, entry];
    payload.last_updated = new Date().toISOString();
    await writeStateFrontmatter(baseDir, payload);
  });
}

/**
 * Remove a task from `current_tasks[]` by id and record completion metadata.
 * Returns `{cleared: false}` + a stderr warning when the id isn't present
 * (no throw — recovery scenarios are common at orphan-clear time).
 *
 * @param {string} baseDir
 * @param {{id: string, commit?: string|null, status?: string, completedAt?: string}} opts
 * @returns {Promise<{cleared: boolean}>}
 */
export async function clearCurrentTask(baseDir, opts) {
  if (!opts || !opts.id) {
    throw new StateWriteError('clearCurrentTask requires an `id`.');
  }
  return withStateLock(baseDir, async () => {
    const state = await readStateForMutation(baseDir);
    if (!state || state._schema !== SCHEMA_VERSION) {
      throw new StateWriteError(
        'STATE.md must be at schema_version 1 before tasks can be cleared.'
      );
    }
    const current = state.current_tasks ?? [];
    const idx = current.findIndex((t) => t.id === opts.id);
    if (idx < 0) {
      process.stderr.write(
        `Signal: clearCurrentTask called with id "${opts.id}" not in current_tasks — no-op.\n`
      );
      return { cleared: false };
    }
    const completedAt = opts.completedAt ?? new Date().toISOString();
    const payload = stripStateMeta(state);
    payload.current_tasks = current.filter((_, i) => i !== idx);
    payload.last_decision_at = completedAt;
    if (opts.commit) {
      payload.last_updated_commit = opts.commit;
    }
    payload.last_completed_task = {
      id: opts.id,
      status: opts.status ?? 'done',
      commit: opts.commit ?? null,
      completedAt,
    };
    payload.last_updated = new Date().toISOString();
    await writeStateFrontmatter(baseDir, payload);
    return { cleared: true };
  });
}

/**
 * Read-only access to the current_tasks[] array. Returns [] for missing
 * STATE.md, legacy STATE.md (no current_tasks concept yet), or empty array.
 *
 * @param {string} baseDir
 * @returns {Promise<Array<object>>}
 */
export async function getCurrentTasks(baseDir) {
  const state = await readState(baseDir);
  if (!state) return [];
  return state.current_tasks ?? [];
}

const DEFAULT_ORPHAN_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Identify in-flight tasks that exceed `thresholdMs` of wall-clock age and
 * whose ids do NOT appear in any recent commit subject — the heuristic for
 * "task started, process likely died before clearCurrentTask ran." Used by
 * `/sig:resume` orphan-prompt UI (S4) and `/sig:execute` pre-dispatch
 * recovery (S3).
 *
 * `execFn` is injectable so tests can stub the git shell-out. D6 graceful
 * degradation: if git fails (not installed, not a repo, etc.), returns []
 * with a stderr warning rather than producing false-positive orphans.
 *
 * @param {string} baseDir
 * @param {{thresholdMs?: number, execFn?: typeof execFileSync}} [opts]
 * @returns {Promise<Array<{id: string, startedAt: string, ageMs: number}>>}
 */
export async function detectOrphans(baseDir, opts = {}) {
  const thresholdMs = opts.thresholdMs ?? DEFAULT_ORPHAN_THRESHOLD_MS;
  const execFn = opts.execFn ?? execFileSync;

  const tasks = await getCurrentTasks(baseDir);
  if (tasks.length === 0) return [];

  const now = Date.now();
  const candidates = tasks
    .filter((t) => (t.status ?? 'in_progress') === 'in_progress')
    .map((t) => ({
      id: t.id,
      startedAt: t.startedAt,
      ageMs: now - new Date(t.startedAt).getTime(),
    }))
    .filter((t) => t.ageMs > thresholdMs);

  if (candidates.length === 0) return [];

  // Query git for commit subjects affecting .planning/ since the oldest
  // candidate started. If any subject references a candidate's id, that
  // candidate is not orphaned — the work landed but clearCurrentTask
  // didn't (probably the executor crashed mid-write).
  const oldestStartMs = Math.min(
    ...candidates.map((c) => new Date(c.startedAt).getTime())
  );
  const sinceIso = new Date(oldestStartMs).toISOString();
  let subjects;
  try {
    const out = execFn(
      'git',
      ['log', '--since', sinceIso, '--pretty=format:%s', '--', '.planning/'],
      { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    subjects = String(out).split('\n').filter(Boolean);
  } catch (err) {
    process.stderr.write(
      `Signal: detectOrphans could not query git (${err.message}); assuming no orphans.\n`
    );
    return [];
  }

  return candidates.filter(
    (c) => !subjects.some((s) => s.includes(c.id))
  );
}

// D6 — paths whose commits indicate STATE.md is stale relative to the
// surrounding work. Decision-log / future-ideas / milestone-plan files are
// deliberately EXCLUDED: editing those is metadata curation, not the kind
// of "ground state has moved" event that needs a /sig:checkpoint refresh.
const STATE_AFFECTING_PATHS = [
  ':(glob).planning/STATE.md',
  ':(glob).planning/CONTEXT.md',
  ':(glob).planning/*-PROGRESS.md',
  ':(glob).planning/*-PLAN.md',
  ':(glob).planning/*-VERIFICATION.md',
  ':(glob).planning/*-REVIEW.md',
];
const STALE_SKIP_GRACE_MS = 60_000;

/**
 * D11 staleness check: did any state-affecting file get committed since the
 * commit recorded as `last_updated_commit`? Returns commit count + subjects
 * so callers (resume.md S4 banner, checkpoint.md S2 diff) can render useful
 * UI rather than a bare boolean.
 *
 * Skips the git call entirely when `last_updated` is within 60s of now —
 * resume immediately after a write can't be stale.
 *
 * D6 graceful degradation: git failure → `{stale: false}` + stderr warning.
 *
 * @param {string} baseDir
 * @param {{execFn?: typeof execFileSync}} [opts]
 * @returns {Promise<{stale: boolean, commitCount: number, commits: Array<{sha, subject}>}>}
 */
export async function isStateStale(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const empty = { stale: false, commitCount: 0, commits: [] };

  const state = await readState(baseDir);
  if (!state) return empty;
  const lastCommit = state.last_updated_commit;
  if (!lastCommit) return empty; // no baseline — can't measure

  // Grace window: very recent writes can't be stale relative to themselves.
  const lastUpdatedMs = state.last_updated
    ? new Date(state.last_updated).getTime()
    : 0;
  if (Number.isFinite(lastUpdatedMs) && Date.now() - lastUpdatedMs < STALE_SKIP_GRACE_MS) {
    return empty;
  }

  try {
    const out = execFn(
      'git',
      [
        'log',
        '--pretty=format:%H %s',
        `${lastCommit}..HEAD`,
        '--',
        ...STATE_AFFECTING_PATHS,
      ],
      { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const lines = String(out).split('\n').filter(Boolean);
    const commits = lines.map((line) => {
      const idx = line.indexOf(' ');
      return idx === -1
        ? { sha: line, subject: '' }
        : { sha: line.slice(0, idx), subject: line.slice(idx + 1) };
    });
    return { stale: commits.length > 0, commitCount: commits.length, commits };
  } catch (err) {
    process.stderr.write(
      `Signal: isStateStale could not query git (${err.message}); assuming fresh.\n`
    );
    return empty;
  }
}
