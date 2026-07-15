import { readFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
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

// Canonical strict Epic-ID validator (M4.5.E11.S1.t1). `current_epic` is
// M-shaped only — `M{N}[.{N}]*.E{N}` (D-E11-4); version strings like `v0.1.6`
// are release tags, NOT Epic IDs. This is the SINGLE source of truth for the
// shape: `retrospective.js` `deriveRetroPath` imports it (killing the regex
// schism where a permissive read-half accepted IDs the strict retro/milestone
// code then threw on). `milestones.js` keeps its own *capturing* CURRENT_EPIC_RE
// for extracting the milestone number — this one only *validates*. Depth-3
// (M4.5.6.E1) is permitted by the shape but the writer (deriveNextEpicId) only
// ever emits depth-2, which currentMilestone can parse.
const EPIC_ID_STRICT_RE = /^M\d+(\.\d+)*\.E\d+$/;

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
 * Initialize the .planning/ directory for a new project. Writes a fresh
 * schema_version-1 STATE.md with sensible defaults — empty current_tasks,
 * empty completed_phases, no blockers.
 *
 * Idempotent: re-calling overwrites with the same fresh shape (safe under
 * the /sig:new-project re-run path).
 *
 * @param {string} baseDir
 * @param {string} [initialPhase='CALIBRATE'] — `/sig:new-project` runs
 *   Phase 0 first; pass `DISCUSS` (or later) from post-calibrate paths.
 * @returns {Promise<string>} planning dir path
 */
export async function initState(baseDir, initialPhase = 'CALIBRATE') {
  if (!PHASES.includes(initialPhase)) {
    throw new Error(
      `Invalid initial phase: ${initialPhase}. Must be one of: ${PHASES.join(', ')}`
    );
  }
  const planningDir = join(baseDir, PLANNING_DIR);
  if (!existsSync(planningDir)) {
    await mkdir(planningDir, { recursive: true });
  }
  const data = {
    schema_version: SCHEMA_VERSION,
    phase: initialPhase,
    current_epic: null,
    current_wave: null,
    current_tasks: [],
    completed_phases: [],
    blockers: [],
    last_decision_at: null,
    last_updated_commit: null,
    last_updated: new Date().toISOString(),
  };
  const body =
    '# Project State\n\nManaged by Signal. The YAML frontmatter above is the authoritative machine-readable state; this body is freeform human-readable narrative.\n';
  await atomicWrite(
    join(planningDir, 'STATE.md'),
    stringifyFrontmatter(data, body)
  );
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
 * Transition to the next phase. Appends the prior phase (with date suffix)
 * to `completed_phases`, dedupes by phase name (most-recent wins so recovery
 * re-transitions don't accumulate duplicates), and writes through the
 * frontmatter serializer + atomic-write + state lock.
 *
 * Auto-upgrades a legacy STATE.md on first call (via readStateForMutation).
 *
 * @param {string} baseDir
 * @param {string} nextPhase
 */
export async function transitionPhase(baseDir, nextPhase) {
  if (!PHASES.includes(nextPhase)) {
    throw new Error(
      `Invalid phase: ${nextPhase}. Must be one of: ${PHASES.join(', ')}`
    );
  }
  return withStateLock(baseDir, async () => {
    const state = await readStateForMutation(baseDir);
    if (!state) {
      throw new Error('No project state found. Run /sig:new-project first.');
    }
    const today = new Date().toISOString().split('T')[0];
    const phaseNameOf = (entry) => entry.split(' ')[0];
    const priorCompleted = state.completed_phases ?? state.completedPhases ?? [];
    const seen = state.phase
      ? [...priorCompleted, `${state.phase} (${today})`]
      : priorCompleted;
    const completed = Array.from(
      new Map(seen.map((entry) => [phaseNameOf(entry), entry])).values()
    );
    const payload = stripStateMeta(state);
    payload.phase = nextPhase;
    payload.completed_phases = completed;
    payload.last_updated = new Date().toISOString();
    await writeStateFrontmatter(baseDir, payload);
  });
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

export { PHASES, PLANNING_DIR, SCHEMA_VERSION, EPIC_ID_STRICT_RE };

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
 * Set (open/roll) the active Epic — the FR1 `current_epic` write-half
 * (M4.5.E11.S1.t2). Validates `epicId` against the canonical strict shape
 * BEFORE touching disk. When the Epic actually changes (open or roll), it
 * atomically resets the coupled in-flight fields `current_wave: null` +
 * `current_tasks: []` under the same lock, so a new Epic never inherits the
 * previous one's wave/tasks (this also covers the abandon case — opening the
 * next Epic clears the abandoned one's in-flight state). Idempotent: setting
 * the already-active id is a no-op that leaves coupled fields untouched (R8 —
 * safe against Signal's own hand-bootstrapped `current_epic`).
 *
 * No `clearCurrentEpic` counterpart exists: the locked "roll-on-open, never
 * clear to null" semantics (D-E11-4) give it no caller (YAGNI).
 *
 * @param {string} baseDir
 * @param {string} epicId — strict `M{N}[.{N}]*.E{N}`
 */
export async function setCurrentEpic(baseDir, epicId) {
  if (typeof epicId !== 'string' || !EPIC_ID_STRICT_RE.test(epicId)) {
    throw new StateWriteError(
      `setCurrentEpic: invalid Epic ID ${JSON.stringify(epicId)} (expected M{N}[.{N}]*.E{N}).`
    );
  }
  return withStateLock(baseDir, async () => {
    const state = await readStateForMutation(baseDir);
    if (!state || state._schema !== SCHEMA_VERSION) {
      throw new StateWriteError(
        'STATE.md must be at schema_version 1 before an Epic can be set. Run /sig:new-project or /sig:init first.'
      );
    }
    if (state.current_epic === epicId) {
      return; // idempotent — no roll, coupled fields preserved
    }
    const payload = stripStateMeta(state);
    payload.current_epic = epicId;
    payload.current_wave = null; // roll resets coupled in-flight state...
    payload.current_tasks = []; // ...atomically, under the same lock
    payload.last_updated = new Date().toISOString();
    await writeStateFrontmatter(baseDir, payload);
  });
}

/**
 * Detect Epic mode vs linear mode from a STATE object (M4.5.E11.S1.t3, FR4).
 * The sole signal is `current_epic`: a non-empty, strict-shaped value → 'epic';
 * null / absent / empty / whitespace / malformed / version-string → 'linear'.
 * Pure and fail-open — never throws (a hand-edited garbage `current_epic`
 * degrades to linear rather than crashing a read path). Linear is the
 * byte-identical default (a version string like `v0.1.6` is NOT Epic mode,
 * per D-E11-4).
 *
 * @param {object|null|undefined} state — a readState() result
 * @returns {'epic'|'linear'}
 */
export function detectMode(state) {
  const epic = state?.current_epic;
  if (typeof epic !== 'string' || epic.trim() === '') return 'linear';
  return EPIC_ID_STRICT_RE.test(epic) ? 'epic' : 'linear';
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

// A stored commit token (`last_updated_commit`) is user-editable YAML that
// gets glued into a git revision range (`${stored}..${tracking}`). It must
// start with an alphanumeric (so it can never be parsed by git as an option,
// e.g. a crafted `--output=…`) and contain only ref-safe characters. Anything
// else → the caller fails open. Defense-in-depth (M4.5.E10 REVIEW Sec-2): the
// `execFileSync` args-array already blocks shell injection; this blocks
// git-option injection from a hostile `.planning/STATE.md`.
const COMMIT_TOKEN_RE = /^[0-9A-Za-z][0-9A-Za-z._/-]*$/;

/**
 * D11 staleness check: did any state-affecting file get committed since the
 * commit recorded as `last_updated_commit`? Returns commit count + subjects
 * so callers (resume.md S4 banner, checkpoint.md S2 diff) can render useful
 * UI rather than a bare boolean.
 *
 * Hash short-circuit (S6.t3 — REVIEW IMPORTANT-4): if `last_updated_commit`
 * equals HEAD, no git log call is needed — there can be no commits between
 * a commit and itself. The earlier implementation used a 60s wall-clock
 * grace window, which D11 explicitly rejected for clock-skew reasons.
 * /sig:checkpoint passes `bypassGrace: true` so explicit "tell me what
 * changed" requests always query git (and skip the rev-parse too).
 *
 * D6 graceful degradation: git failure → `{stale: false}` + stderr warning.
 *
 * @param {string} baseDir
 * @param {{execFn?: typeof execFileSync, bypassGrace?: boolean}} [opts]
 * @returns {Promise<{stale: boolean, commitCount: number, commits: Array<{sha, subject}>}>}
 */
export async function isStateStale(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const empty = { stale: false, commitCount: 0, commits: [] };

  // Fail open on a schema-drifted / malformed STATE.md — readState throws
  // StateSchemaError on an ahead/unknown/missing schema_version, and this feeds
  // /sig:resume + /sig:checkpoint, which must degrade (and still render the
  // schema-drift banner) rather than crash (M4.5.E10 REVIEW F1).
  let state;
  try {
    state = await readState(baseDir);
  } catch {
    return empty;
  }
  if (!state) return empty;
  const lastCommit = state.last_updated_commit;
  if (!lastCommit) return empty; // no baseline — can't measure
  if (!COMMIT_TOKEN_RE.test(lastCommit)) return empty; // Sec-2: reject option-like tokens

  // Hash short-circuit: HEAD === last_updated_commit means no new commits
  // can exist in the rev range. Same optimization intent as the old
  // wall-clock grace, no clock dependency.
  if (!opts.bypassGrace) {
    const head = resolveHeadCommit(baseDir, execFn);
    if (head && head === lastCommit) return empty;
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

// --- origin-drift check (M4.5.E10.S1.t2, FR2) ---

// Bounded, non-interactive fetch env (AD7). The load-bearing anti-hang
// detail: kill terminal/credential/SSH prompts so a remote that would
// otherwise block on auth can't wedge a /sig:resume|status|checkpoint run.
const ORIGIN_FETCH_TIMEOUT_MS = 2000;
const ORIGIN_FETCH_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
  GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oConnectTimeout=2',
};

/**
 * Detect whether the remote default branch is ahead of the commit recorded
 * in STATE.md (`last_updated_commit`) — i.e. someone (or another machine)
 * pushed work the local STATE.md doesn't reflect. Distinct from
 * `isStateStale` (which compares against local HEAD); this reaches the
 * network via a hardened, bounded `git fetch`.
 *
 * **Fail-open by construction.** Every failure mode — non-git dir, no
 * remote, offline, fetch timeout/auth-hang, unset `origin/HEAD`, diverged
 * or force-pushed history, null baseline, **a schema-drifted/malformed
 * STATE.md** (readState throws), or an option-like `last_updated_commit` —
 * resolves to `{stale:false}` and never throws. The fetch writes `.git/`
 * (FETCH_HEAD, remote refs), NOT `.planning/`, so callers that advertise a
 * read-only `.planning/` contract (`/sig:status`) still hold.
 *
 * @param {string} baseDir
 * @param {{execFn?: typeof execFileSync}} [opts]
 * @returns {Promise<{stale: boolean, aheadCount: number, commits: Array<{sha, subject}>, touchedPlanning: boolean}>}
 */
export async function isStaleVsOrigin(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  const notStale = { stale: false, aheadCount: 0, commits: [], touchedPlanning: false };

  // Fail open on a schema-drifted / malformed STATE.md — readState throws
  // StateSchemaError on an ahead/unknown/missing schema_version (exactly the
  // inputs the schema-drift banner exists to surface). The origin check must
  // degrade to "not stale", not crash the command (M4.5.E10 REVIEW F1 — both
  // agents; the docstring's never-throws contract has to hold here too).
  let state;
  try {
    state = await readState(baseDir);
  } catch {
    return notStale;
  }
  if (!state) return notStale;
  const stored = state.last_updated_commit;
  if (!stored) return notStale; // no baseline — can't measure
  if (!COMMIT_TOKEN_RE.test(stored)) return notStale; // Sec-2: reject option-like tokens

  // 1. Resolve the remote default branch. Unset origin/HEAD prints the
  //    literal "origin/HEAD" and exits 128; both the throw and the literal
  //    fall back to `main` (AC2.5).
  let branch = 'main';
  try {
    const ref = String(
      execFn('git', ['rev-parse', '--abbrev-ref', 'origin/HEAD'], {
        cwd: baseDir,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    ).trim();
    if (ref && ref !== 'origin/HEAD') {
      branch = ref.startsWith('origin/') ? ref.slice('origin/'.length) : ref;
    }
  } catch {
    branch = 'main';
  }
  const tracking = `origin/${branch}`;

  // 2. Bounded, non-interactive fetch of just that branch. Any throw
  //    (offline / no-remote / timeout / auth-hang) → fail open.
  try {
    execFn(
      'git',
      [
        '-c', 'credential.helper=',
        '-c', 'core.askPass=',
        'fetch', '--no-tags', '--quiet', '--no-recurse-submodules',
        'origin', branch,
      ],
      {
        cwd: baseDir,
        timeout: ORIGIN_FETCH_TIMEOUT_MS,
        killSignal: 'SIGKILL',
        stdio: ['ignore', 'ignore', 'ignore'],
        env: { ...process.env, ...ORIGIN_FETCH_ENV },
      }
    );
  } catch {
    return notStale;
  }

  // 3. How many commits is the remote branch ahead of the stored sha? A
  //    missing sha or diverged history → `fatal: bad revision` (exit 128)
  //    → catch → fail open.
  let aheadCount;
  try {
    aheadCount = parseInt(
      String(
        execFn('git', ['rev-list', '--count', `${stored}..${tracking}`], {
          cwd: baseDir,
          stdio: ['ignore', 'pipe', 'ignore'],
        })
      ).trim(),
      10
    );
  } catch {
    return notStale;
  }
  if (!Number.isFinite(aheadCount) || aheadCount <= 0) return notStale;

  // 4. Commit subjects for the banner. A throw here degrades to an empty
  //    list but keeps the (already-known) count.
  let commits = [];
  try {
    const out = execFn(
      'git',
      ['log', '--pretty=format:%H %s', `${stored}..${tracking}`],
      { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    commits = String(out)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(' ');
        return idx === -1
          ? { sha: line, subject: '' }
          : { sha: line.slice(0, idx), subject: line.slice(idx + 1) };
      });
  } catch {
    commits = [];
  }

  // 5. Did any of those ahead commits touch .planning/? Drives the banner's
  //    "your project memory moved" highlight (AC2.3).
  let touchedPlanning = false;
  try {
    touchedPlanning =
      parseInt(
        String(
          execFn(
            'git',
            ['rev-list', '--count', `${stored}..${tracking}`, '--', '.planning/'],
            { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'] }
          )
        ).trim(),
        10
      ) > 0;
  } catch {
    touchedPlanning = false;
  }

  return { stale: true, aheadCount, commits, touchedPlanning };
}

// --- schema-drift detection (M4.5.E10.S4.t1, FR5) ---

const SCHEMA_DRIFT_MIGRATION_HINT =
  'See references/state-schema.md + docs/migration-state-schema-v0.1.x.md; ' +
  'Signal auto-migrates a legacy/older STATE.md on the next state write.';

/**
 * Pure schema-drift compare. Given a raw `schema_version` value (a number, or
 * null/undefined for a legacy/missing version) and the expected version,
 * returns a finding or `null`. No I/O. AD6: this stays OFF `readState`, which
 * throws indistinguishably for both the ahead (>expected) and missing-key
 * cases — so AC5.3's "report rather than crash" needs a bare numeric compare.
 *
 * @param {number|null|undefined} rawSchemaVersion
 * @param {number} [expected=SCHEMA_VERSION]
 * @returns {{status: 'behind'|'ahead', found: number|null, expected: number, message: string} | null}
 */
export function detectSchemaDrift(rawSchemaVersion, expected = SCHEMA_VERSION) {
  if (rawSchemaVersion === expected) return null;
  if (typeof rawSchemaVersion === 'number' && Number.isFinite(rawSchemaVersion)) {
    if (rawSchemaVersion > expected) {
      return {
        status: 'ahead',
        found: rawSchemaVersion,
        expected,
        message:
          `STATE.md was written by a newer Signal (schema_version ${rawSchemaVersion}; ` +
          `this Signal supports ${expected}). Upgrade Signal, or hand-edit the frontmatter — ` +
          `reading it fails closed to avoid acting on state this version doesn't understand.`,
      };
    }
    return {
      status: 'behind',
      found: rawSchemaVersion,
      expected,
      message:
        `STATE.md is schema_version ${rawSchemaVersion}; this Signal expects ${expected}. ` +
        SCHEMA_DRIFT_MIGRATION_HINT,
    };
  }
  // null / undefined / non-number — legacy (pre-frontmatter) or missing key.
  return {
    status: 'behind',
    found: null,
    expected,
    message:
      'STATE.md predates the schema_version frontmatter (or is missing it). ' +
      SCHEMA_DRIFT_MIGRATION_HINT,
  };
}

/**
 * Read-only schema-drift check for a project's STATE.md (FR5). Uses
 * `parseFrontmatter` (narrow — throws only on malformed YAML or non-mapping
 * frontmatter), NOT `readState` (which fails closed on ahead/missing schema).
 * Returns a finding or `null`:
 *   - no STATE.md              → null (AC5.4)
 *   - unreadable file / YAML   → {status:'unreadable', …} (no crash, AC5.3-spirit)
 *   - legacy (no frontmatter)  → {status:'behind', …}
 *   - else                     → detectSchemaDrift(data.schema_version)
 *
 * @param {string} baseDir
 * @returns {Promise<{status: string, found: number|null, expected: number, message: string} | null>}
 */
export async function readSchemaDrift(baseDir) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  if (!existsSync(statePath)) return null;
  // Fold the readFile into the try too (M4.5.E10 REVIEW F3): a delete-after-
  // existsSync race or a permission error must degrade to 'unreadable', not
  // crash the /sig:status | /sig:resume caller this whole function serves.
  let data;
  try {
    const raw = await readFile(statePath, 'utf-8');
    ({ data } = parseFrontmatter(raw));
  } catch (err) {
    return {
      status: 'unreadable',
      found: null,
      expected: SCHEMA_VERSION,
      message: `STATE.md is unreadable (${err.message}). Fix the file / its frontmatter, or re-run /sig:calibrate --re-calibrate.`,
    };
  }
  // Legacy no-frontmatter → behind (auto-migrates on next write); else compare.
  return detectSchemaDrift(data === null ? null : data.schema_version);
}

/**
 * Format a schema-drift finding into a two-line banner (or null when there's
 * no drift). Shared by /sig:resume (via renderResumeBriefing) and /sig:status
 * so both surface the identical, platform-agnostic warning (AD2).
 *
 * @param {{status: string, message: string} | null} finding
 * @returns {string | null}
 */
export function formatSchemaDriftBanner(finding) {
  if (!finding) return null;
  // An unreadable/malformed file isn't strictly "schema drift" (REVIEW F5).
  const label =
    finding.status === 'unreadable'
      ? 'STATE.md unreadable'
      : `STATE.md schema drift (${finding.status})`;
  return `⚠ ${label}.\n   ${finding.message}`;
}

// --- FR2 (v0.1.6): read-time STATE.md size banner ---
//
// Detect + FLAG only. Actual eviction/remediation of an already-bloated file is
// the M5 redesign (root cause: upgradeStateFile inlining the legacy body +
// append-without-evict). This is the coarse "the file is getting big" signal;
// FR1's write-hook catches the specific frontmatter-prose pathology at write.
//
// Whole-file size (statSync .size): simplest, read-only (no mtime change), and
// it catches frontmatter bloat too (the cmmc pollution lives INSIDE the
// frontmatter). Threshold sits above Signal's own legitimate ~62 KB file and
// well below the 465 KB cmmc failure — so it stays quiet until eviction is
// genuinely due, at which point M5 is the fix.
const STATE_SIZE_WARN_BYTES = 150 * 1024;

/**
 * Pure size compare. Returns a finding when `bytes` EXCEEDS `threshold`, else
 * null (exclusive at the boundary). No I/O.
 *
 * @param {number} bytes
 * @param {number} [threshold=STATE_SIZE_WARN_BYTES]
 * @returns {{bytes: number, threshold: number, message: string} | null}
 */
function detectStateSize(bytes, threshold = STATE_SIZE_WARN_BYTES) {
  if (!Number.isFinite(bytes) || bytes <= threshold) return null;
  const kb = Math.round(bytes / 1024);
  const budgetKb = Math.round(threshold / 1024);
  return {
    bytes,
    threshold,
    message:
      `STATE.md is ${kb} KB (over the ${budgetKb} KB budget) — closed-work history ` +
      `is accumulating. Automated eviction is planned for M5; for now, move ` +
      `closed-slice narrative into an archive/RETROSPECTIVES pointer to trim it.`,
  };
}

/**
 * Read-only size check for a project's STATE.md (FR2). Whole-file `statSync`;
 * NEVER throws (missing file or stat error → null → no banner). Read-only, so
 * the `/sig:status` read-only-`.planning/` contract holds (no mtime change).
 *
 * @param {string} baseDir
 * @returns {{bytes: number, threshold: number, message: string} | null}
 */
function readStateSize(baseDir) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  if (!existsSync(statePath)) return null;
  let bytes;
  try {
    bytes = statSync(statePath).size;
  } catch {
    return null; // unreadable → no banner
  }
  return detectStateSize(bytes);
}

/**
 * Format a size finding into a two-line advisory banner (or null when under
 * budget). Shared by /sig:resume, /sig:status, /sig:checkpoint so all three
 * surface the identical warning. Advisory only — never blocks.
 *
 * @param {{message: string} | null} finding
 * @returns {string | null}
 */
function formatStateSizeBanner(finding) {
  if (!finding) return null;
  return `⚠ STATE.md is large.\n   ${finding.message}`;
}

export {
  STATE_SIZE_WARN_BYTES,
  detectStateSize,
  readStateSize,
  formatStateSizeBanner,
};

// --- blockers helpers (M4.5.E6.S1.t9) ---

/**
 * Append a blocker to `blockers[]`. Generates a 4-char-hex id (`blk-XXXX`)
 * — short enough to type-reference but unique-enough for a project's
 * blocker count.
 *
 * @param {string} baseDir
 * @param {{text: string, raisedAt?: string}} opts
 * @returns {Promise<{id: string}>}
 */
export async function addBlocker(baseDir, opts = {}) {
  const text = String(opts.text ?? '').trim();
  if (!text) {
    throw new StateWriteError('addBlocker requires non-empty `text`.');
  }
  return withStateLock(baseDir, async () => {
    const state = await readStateForMutation(baseDir);
    if (!state || state._schema !== SCHEMA_VERSION) {
      throw new StateWriteError(
        'STATE.md must be at schema_version 1 before blockers can be added.'
      );
    }
    const id = `blk-${randomBytes(2).toString('hex')}`;
    const entry = {
      id,
      text,
      raisedAt: opts.raisedAt ?? new Date().toISOString(),
    };
    const payload = stripStateMeta(state);
    payload.blockers = [...(state.blockers ?? []), entry];
    payload.last_updated = new Date().toISOString();
    await writeStateFrontmatter(baseDir, payload);
    return { id };
  });
}

/**
 * Remove a blocker by `id` or `text` (first text match wins). No-match
 * returns `{cleared: false}` without throwing — recovery scenarios.
 *
 * @param {string} baseDir
 * @param {{id?: string, text?: string, resolvedAt?: string}} opts
 * @returns {Promise<{cleared: boolean, id?: string}>}
 */
export async function clearBlocker(baseDir, opts = {}) {
  if (!opts.id && !opts.text) {
    throw new StateWriteError('clearBlocker requires `id` or `text`.');
  }
  return withStateLock(baseDir, async () => {
    const state = await readStateForMutation(baseDir);
    if (!state || state._schema !== SCHEMA_VERSION) {
      throw new StateWriteError(
        'STATE.md must be at schema_version 1 before blockers can be cleared.'
      );
    }
    const blockers = state.blockers ?? [];
    const idx = opts.id
      ? blockers.findIndex((b) => b.id === opts.id)
      : blockers.findIndex((b) => b.text === opts.text);
    if (idx < 0) {
      return { cleared: false };
    }
    const matched = blockers[idx];
    const payload = stripStateMeta(state);
    payload.blockers = blockers.filter((_, i) => i !== idx);
    payload.last_updated = new Date().toISOString();
    await writeStateFrontmatter(baseDir, payload);
    return { cleared: true, id: matched.id };
  });
}

// --- touchDecisionTimestamp / markFresh (M4.5.E6.S1.t10) ---
// `touchDecisionTimestamp` was renamed from `appendDecision` in S6.t4
// (REVIEW IMPORTANT-3): the old name implied an append-to-list operation
// matching addBlocker/clearBlocker, but there is no decisions[] field —
// this only refreshes the last_decision_at scalar.

/**
 * Touch `last_decision_at`. Used at phase boundaries and `/sig:checkpoint`
 * to record "a decision-shaped event happened at this timestamp" without
 * mutating any other field.
 *
 * @param {string} baseDir
 * @param {{at?: string}} [opts]
 */
export async function touchDecisionTimestamp(baseDir, opts = {}) {
  return withStateLock(baseDir, async () => {
    const state = await readStateForMutation(baseDir);
    if (!state || state._schema !== SCHEMA_VERSION) {
      throw new StateWriteError(
        'STATE.md must be at schema_version 1 before decisions can be appended.'
      );
    }
    const payload = stripStateMeta(state);
    payload.last_decision_at = opts.at ?? new Date().toISOString();
    payload.last_updated = new Date().toISOString();
    await writeStateFrontmatter(baseDir, payload);
  });
}

// Resolve current HEAD via injectable execFn — mirrors detectOrphans /
// isStateStale's pattern so tests don't need a real git repo.
function resolveHeadCommit(baseDir, execFn) {
  try {
    const out = execFn('git', ['rev-parse', 'HEAD'], {
      cwd: baseDir,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(out).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Refresh `last_updated` and `last_updated_commit`. When `commit` is not
 * supplied, resolves HEAD via `git rev-parse HEAD`. Renamed from the
 * MILESTONE-4.5 spec's colloquial `markStale` — semantically the function
 * REFUTES staleness (D5 amendment per phase-researcher).
 *
 * Called at the end of each phase (verify.md, review.md in S4) and on
 * task completion (clearCurrentTask handles its own write; this is for
 * cross-cutting refreshes).
 *
 * @param {string} baseDir
 * @param {{at?: string, commit?: string, execFn?: typeof execFileSync}} [opts]
 */
export async function markFresh(baseDir, opts = {}) {
  const execFn = opts.execFn ?? execFileSync;
  return withStateLock(baseDir, async () => {
    const state = await readStateForMutation(baseDir);
    if (!state || state._schema !== SCHEMA_VERSION) {
      throw new StateWriteError(
        'STATE.md must be at schema_version 1 before markFresh can run.'
      );
    }
    const payload = stripStateMeta(state);
    payload.last_updated = opts.at ?? new Date().toISOString();
    const commit = opts.commit ?? resolveHeadCommit(baseDir, execFn);
    if (commit) {
      payload.last_updated_commit = commit;
    }
    await writeStateFrontmatter(baseDir, payload);
  });
}
