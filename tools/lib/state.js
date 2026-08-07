import { readFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

import { atomicWrite } from './atomic-write.js';
import { LAYOUT_VERSION } from './layout-stamp.js';
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

const MIGRATION_RELOCATE_NOTICE_TEMPLATE =
  '<!-- Original pre-schema_v1 STATE.md content was relocated to .planning/{file} on {date} (M5.E1 FR2a). The YAML frontmatter above is the authoritative machine-readable state. -->';

/**
 * Auto-upgrade a legacy (freeform / no-frontmatter) STATE.md into the
 * schema_version-1 shape. Idempotent: re-running on an already-upgraded file
 * is a no-op. The original legacy narrative is RELOCATED verbatim to a sibling
 * `.planning/STATE-HISTORY.md` (not inlined into the new body — FR2a, bloat
 * vector 2); the new STATE.md body becomes a short pointer to it so the live
 * file stays lean.
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
  // Relocate the full legacy content to a sibling STATE-HISTORY.md FIRST, then
  // rewrite STATE.md to a pointer. History-first ordering means a crash between
  // the two writes leaves STATE.md still legacy (the idempotency guard re-runs
  // cleanly on the next attempt) rather than a pointer with no history behind it.
  // Don't clobber a pre-existing STATE-HISTORY.md (a hand-created one on a
  // still-legacy STATE.md): fall back to a dated sibling so no file is lost.
  let historyName = 'STATE-HISTORY.md';
  if (existsSync(join(baseDir, PLANNING_DIR, historyName))) {
    historyName = `STATE-HISTORY-${today}.md`;
  }
  const historyPath = join(baseDir, PLANNING_DIR, historyName);
  await atomicWrite(historyPath, raw);

  const notice = MIGRATION_RELOCATE_NOTICE_TEMPLATE
    .replace('{date}', today)
    .replace('{file}', historyName);
  const body =
    `${notice}\n\n` +
    '# Project State\n\n' +
    'Legacy narrative from before the schema_version-1 migration lives in ' +
    `[${historyName}](${historyName}).\n`;
  await atomicWrite(statePath, stringifyFrontmatter(newFrontmatter, body));

  process.stderr.write(
    `Signal: STATE.md upgraded to schema_version ${SCHEMA_VERSION}. ` +
      `Original content relocated to .planning/${historyName}.\n`
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
    // Born-on-v3 (FR6 / AC6.3): a fresh project stamps the CURRENT doc-runtime
    // layout so it self-reports v3 from birth — the layout-drift banner stays
    // silent and it never presents as an un-migrated older-layout project. Kept
    // as the 2nd key so it serializes right after schema_version (the same slot
    // spliceDocsLayoutVersion targets). LAYOUT_VERSION mirrors the engine's
    // CURRENT_LAYOUT_VERSION (assertion-tested), imported from the dependency-light
    // layout-stamp.js to stay cycle-free.
    docs_layout_version: LAYOUT_VERSION,
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
  // Live-above-the-fold body skeleton (FR2c). Headings match the normative
  // template in references/state-schema.md § Body skeleton verbatim — closed-unit
  // narrative is evicted to archive on close (FR2b), leaving a pointer under
  // "Closed work" instead of accreting in the body.
  const body = [
    '# Project State',
    '',
    '## Resume pointer',
    '',
    'Next action a fresh session should take. Keep it to one line.',
    '',
    '## In-flight',
    '',
    'Active Epic / wave / task narrative — the human companion to the frontmatter current_tasks and current_wave.',
    '',
    '## Blockers',
    '',
    'Human-readable notes on active blockers. The frontmatter blockers[] array is authoritative.',
    '',
    '## Pending ops',
    '',
    'Queued operational items — archive moves, migrations, deferred bookkeeping.',
    '',
    '## Closed work',
    '',
    'One-line pointers to evicted closed-unit narrative under archive/<milestone>/<epic>/. Grows by pointers, never re-inlined narrative.',
    '',
  ].join('\n');
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

// A well-formed `completed_phases` entry: a known phase name + an ISO date.
// Anything else is NOT a phase and must never be keyed on (B45).
const COMPLETED_ENTRY_RE = new RegExp(
  `^(${PHASES.join('|')}) \\(\\d{4}-\\d{2}-\\d{2}\\)$`
);

/**
 * Split `completed_phases` into well-formed entries and malformed ones (B45).
 *
 * Before M5.E9 nothing validated existing entries — only the `nextPhase`
 * ARGUMENT was checked — and the dedupe keyed on `entry.split(' ')[0]`. So a
 * stray prose line keyed on its first whitespace token and became a phantom
 * phase that survived every future write. The live instance was
 * `"**▶ Active: Slice SEC1"`, keying on `**▶`.
 *
 * Pure and total: never throws, never mutates its input.
 *
 * @param {unknown} entries
 * @returns {{valid: string[], malformed: string[]}}
 */
export function partitionCompletedPhases(entries) {
  const valid = [];
  const malformed = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (typeof entry === 'string' && COMPLETED_ENTRY_RE.test(entry.trim())) {
      valid.push(entry.trim());
    } else if (entry !== null && entry !== undefined && String(entry).trim() !== '') {
      malformed.push(String(entry));
    }
  }
  return { valid, malformed };
}

// Shared writer for both phase-recording paths. `leaving` is the phase to
// record complete (null records nothing — a post-Epic-roll `phase: null` has
// no completed phase to append). Returns the quarantine report so callers can
// SURFACE it: a state write that silently drops entries is the bug this Epic
// exists to fix (NFR1).
async function recordPhase(baseDir, { leaving, nextPhase }) {
  const state = await readStateForMutation(baseDir);
  if (!state) {
    throw new Error('No project state found. Run /sig:new-project first.');
  }
  const today = new Date().toISOString().split('T')[0];
  const prior = state.completed_phases ?? state.completedPhases ?? [];
  const { valid, malformed } = partitionCompletedPhases(prior);

  // RELOCATE, NEVER DELETE (NFR2). A quarantined entry leaves the live list, so
  // it must land somewhere first — dropping it would be a smaller version of
  // the exact bug this Epic exists to fix. Archived BEFORE the write below; if
  // the archive throws, the write does not happen.
  if (malformed.length > 0) {
    await archivePhaseLog(
      baseDir,
      malformed,
      '.planning/STATE-HISTORY.md',
      `quarantined entries (${today})`
    );
  }

  // APPEND-ONLY. No dedupe (B44, D-M5E9-5): `completed_phases` is a LOG, and a
  // re-transition through a phase genuinely did happen twice. The old Map
  // collapsed the list to one entry per phase NAME, destroying every prior
  // unit's history the first time any project past its first unit called this.
  const completed = leaving ? [...valid, `${leaving} (${today})`] : [...valid];

  const payload = stripStateMeta(state);
  if (nextPhase) payload.phase = nextPhase;
  payload.completed_phases = completed;
  payload.last_updated = new Date().toISOString();
  await writeStateFrontmatter(baseDir, payload);
  return { quarantined: malformed };
}

/**
 * Transition to the next phase. Appends the phase being **LEFT** (with a date)
 * to `completed_phases` — that is the phase which is actually complete; the
 * list must never contain a phase still in flight, or `resume.js`'s progress
 * count and `isEpicCloseByState`'s coverage test both read an unfinished phase
 * as done.
 *
 * Append-only: no dedupe (B44). Malformed entries are quarantined out and
 * returned rather than keyed on (B45).
 *
 * Auto-upgrades a legacy STATE.md on first call (via readStateForMutation).
 *
 * @param {string} baseDir
 * @param {string} nextPhase
 * @returns {Promise<{quarantined: string[]}>}
 */
// --- FR1.2 / `B48`: a phase with no artifact is not recordable ---------------
//
// `B48`: `execute.md`'s phase-entry instruction was UNCONDITIONAL, and an agent
// correctly REFUSED it — obeying would have recorded `phase: EXECUTE` for a
// project that halted at its preconditions with nothing to execute. Rewording
// the instruction alone (FR1.1) leaves the code still able to write that false
// record, so D-M5E13-4 fixes both halves.
//
// The artifact each phase must have produced to be recordable as COMPLETE.
const PHASE_ARTIFACT = {
  DISCUSS: 'REQUIREMENTS',
  PLAN: 'PLAN',
  EXECUTE: 'PROGRESS',
  VERIFY: 'VERIFICATION',
  REVIEW: 'REVIEW',
};

/**
 * Phases that are legitimately artifact-less, ENUMERATED rather than assumed
 * absent (AC1.3). Exported so the exemption can be READ, not inferred from
 * behaviour — an unwritten exemption is how a guard quietly stops guarding.
 *
 *  - **CALIBRATE** — its output is `PROFILE.md`, which is not one of the
 *    Epic-scoped artifact kinds and is not named by `artifactName`.
 *  - **EXECUTE** — `PROGRESS` is **documented optional** (`commands/execute.md`
 *    § "Optional for single-task plans": *"typical at SKETCH tier … the commit
 *    log substitutes for it. Skip without ceremony"*). Caught at M5.E13 REVIEW:
 *    without this exemption a SKETCH project **could not ship at all**, because
 *    `/sig:ship`'s transition leaves EXECUTE and no PROGRESS exists. That is
 *    `B42`'s exact shape — a gate refusing a supported mode — reintroduced by
 *    the Epic that exists to stop unconditional rules.
 *
 *    **This costs nothing that `B48` needed.** `B48`'s case is `/sig:execute`
 *    against a project with no PLAN artifact: that transition *leaves PLAN*, so
 *    it is `PLAN`'s artifact the guard checks, and it is still refused. The
 *    exemption only relaxes the *leaving EXECUTE* check, which is a different
 *    event (the ship), on an artifact the docs already call optional.
 *  - **SHIP** — terminal, and its artifact is optional *by design*:
 *    `/sig:resume`'s artifact table reads "`{phase}-SHIP.md` (if present) **or**
 *    pre-ship checklist from STATE.md". This is the collision that decided the
 *    guard's placement: `completePhase` exists to record SHIP and also routes
 *    through `recordPhase`, so putting the check one level down would refuse
 *    the normal ship on most projects.
 *
 * @type {Set<string>}
 */
export const PHASE_ARTIFACT_EXEMPT = new Set(['CALIBRATE', 'EXECUTE', 'SHIP']);

/**
 * Throw if `leaving` produced no artifact. Resolution goes through
 * `resolveArtifactPath` — the seam S1 corrected, so an existing-but-stale
 * Epic-prefixed file can no longer satisfy the check for a project whose
 * commands write a different name (`B53`).
 *
 * Dynamic import: `resume.js` imports from this module, so a static import back
 * would be a cycle. Duplicating the resolution here instead is the "two
 * implementations of one rule" shape `B53` itself was — not worth repeating.
 */
async function assertLeavingArtifactExists(baseDir, leaving, state) {
  if (!leaving || PHASE_ARTIFACT_EXEMPT.has(leaving)) return;
  const artifact = PHASE_ARTIFACT[leaving];
  if (!artifact) return; // unknown phase → nothing declared, nothing to enforce
  const { resolveArtifactPath } = await import('./resume.js');
  const planningDir = join(baseDir, PLANNING_DIR);
  const found = resolveArtifactPath(planningDir, artifact, {
    currentEpic: state.current_epic ?? null,
    phase: leaving,
  });
  if (found) return;
  throw new Error(
    `Refusing to record ${leaving} as complete: no ${artifact} artifact found in ` +
      `${PLANNING_DIR}/. A phase that produced nothing is not a phase that finished — ` +
      `recording it would put a false entry in completed_phases (B48). ` +
      `Write the ${artifact} artifact, or fix the precondition that halted ${leaving}, ` +
      `then re-run. Exempt phases: ${[...PHASE_ARTIFACT_EXEMPT].join(', ')}.`
  );
}

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
    const leaving = state.phase ?? null;
    // Refuse BEFORE any write, so a rejected transition leaves STATE.md
    // byte-identical rather than half-applied.
    await assertLeavingArtifactExists(baseDir, leaving, state);
    const result = await recordPhase(baseDir, { leaving, nextPhase });
    const index = await refreshPlanningIndexAfterTransition(baseDir);
    return index ? { ...result, index } : result;
  });
}

/**
 * Regenerate `.planning/INDEX.md` as part of a phase transition (M5.E16 FR5).
 *
 * **Why here and not in the command files.** `regeneratePlanningIndex` was
 * called from `/sig:ship` §8 and `/sig:index`, and nowhere else — so the docs
 * map was accurate at exactly the moment an Epic *finished*, and drifted through
 * the entire span of work, which is when someone is actually re-orienting from
 * it. All four projects surveyed on 2026-08-01 had a stale, missing or foreign
 * `INDEX.md`, and `CLAUDE.md` tells every reader to *"read it first."*
 *
 * Putting the call in ten command files instead would be `B60`'s shape — an
 * instruction stated in some files and silent in others — and this repo has been
 * bitten twice by rules that lived only as prose (`B7`→`B58`, `B39`). Here it
 * cannot be forgotten.
 *
 * **Three constraints, all load-bearing:**
 *
 * 1. Calls the **lock-free Core**. `regeneratePlanningIndex` self-locks on the
 *    same `.state.lock` this function already holds; calling it would deadlock.
 *    Same discipline `/sig:migrate-memory` follows with `evictEpicNarrative`.
 * 2. **Dynamic import.** `planning-index.js` imports `withStateLock` from this
 *    module, so a static import back would be a cycle.
 * 3. **Never throws.** The phase record is load-bearing; the docs map is not. A
 *    docs problem must not become a state-corruption problem.
 *
 * Compare-before-write means an unchanged doc set produces no write, no diff and
 * no mtime churn — which is what makes running this on every transition free.
 *
 * @param {string} baseDir
 * @returns {Promise<{written: boolean}|null>} null if regeneration was impossible
 */
async function refreshPlanningIndexAfterTransition(baseDir) {
  try {
    const { regeneratePlanningIndexCore } = await import('./planning-index.js');
    return await regeneratePlanningIndexCore(baseDir);
  } catch {
    return null;
  }
}

// --- FR5: the phase log's trim rule (D-M5E9-6, D-M5E9-7) ---------------------
//
// A log that never trims trades silent deletion for silent growth — the same
// failure wearing the other mask. So the live list holds ONE RUN, and finished
// runs relocate (never delete) to an append-log.
//
// This is not optional hygiene. `resume.js:272` renders `{completed}/{total}
// phases done` off the raw array length, and `isEpicCloseByState` tests the
// array with `.some()`. BOTH silently assume the list is one run's worth — the
// invariant the old dedupe was accidentally enforcing and no writer ever
// stated. Remove the dedupe without this and a real project reads "53/7 phases
// done" and its Epic-close detector fires off a PRIOR run's entries.

const PHASE_LOG_MARKER = 'phase-log:archived';

// Mirrors deriveUnitArchiveDir (archive-tree.js:136), which in turn keeps
// deriveEpicArchiveDir's (evict.js:243) layout for strict IDs. Duplicated
// deliberately: both of those modules import from state.js, so importing either
// back would be a cycle. The duplication is guarded by a parity test rather
// than left to drift — a second, silently diverging implementation of a path
// rule is the "regex schism" shape that state.js:100-108 records as already
// burning Signal once.
//
// B52 half 2 widened this from Epic-only to unit-wide. It previously returned
// null for anything but a strict `M{N}.E{N}`, and the sole caller read that
// null as "skip the archive" and reset anyway — so a project whose
// `current_epic` is a real-but-non-strict value like `PHASE11` (measured live
// in traction-engine, B53) lost its phase ledger with no stale cache involved
// at all. M5.E18 already settled where those units archive to: strict IDs keep
// `{M}/E{n}`, everything else gets a flat per-unit directory, because
// `PHASE10-S4` has no milestone to key on and inventing one derives structure
// from a name that carries none. Null now means only "no safe destination
// exists", which the caller refuses to proceed past.
const SAFE_UNIT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function unitArchiveDirFor(unit) {
  const s = String(unit);
  const m = s.match(/^(M\d+(?:\.\d+)*)\.E(\d+)$/);
  if (m) return `.planning/archive/${m[1]}/E${m[2]}`;
  if (s.length === 0 || s.length > 100 || s.includes('..')) return null;
  return SAFE_UNIT_NAME_RE.test(s) ? `.planning/archive/${s}` : null;
}

/**
 * Relocate a finished run's phase entries into an append-log, verbatim.
 *
 * Relocate-never-delete (NFR2): the caller only clears the live list after this
 * resolves. Returns the count so callers can SURFACE it (NFR1).
 *
 * @param {string} baseDir
 * @param {string[]} entries
 * @param {string} targetRel — repo-relative destination
 * @param {string} label — what this run was, for the section heading
 * @returns {Promise<{archived: number, target: string}>}
 */
async function archivePhaseLog(baseDir, entries, targetRel, label) {
  if (!entries || entries.length === 0) return { archived: 0, target: targetRel };
  const abs = join(baseDir, targetRel);
  await mkdir(dirname(abs), { recursive: true });
  const today = new Date().toISOString().split('T')[0];
  const section = [
    '',
    `## Phase log — ${label} (archived ${today}) <!-- ${PHASE_LOG_MARKER} -->`,
    '',
    ...entries.map((e) => `- ${e}`),
    '',
  ].join('\n');
  let existing = '';
  try {
    existing = await readFile(abs, 'utf-8');
  } catch (err) {
    if (!err || err.code !== 'ENOENT') throw err;
    existing = `# Phase log archive\n\nFinished runs relocated out of \`STATE.md\` by Signal (M5.E9 FR5). Append-only; nothing here is ever rewritten.\n`;
  }
  await atomicWrite(abs, `${existing.replace(/\s*$/, '')}\n${section}`);
  return { archived: entries.length, target: targetRel };
}

/**
 * Record a phase complete WITHOUT transitioning away from it (M5.E9 FR2, B43).
 *
 * `transitionPhase` can only record a phase you leave, and **SHIP is terminal**
 * — nothing transitions out of it — so no `SHIP` completion could ever be
 * written, in any mode, while `ship.md:96` claimed since v0.1.3 that it was.
 * `retrospective.js`'s Epic-close detector even documents the symptom in a
 * comment: *"NOT a `- SHIP` entry (Signal never writes one)"*.
 *
 * Idempotent for the same phase + same day, so a re-invoked `/sig:ship` does
 * not double-record.
 *
 * @param {string} baseDir
 * @param {string} phase
 * @returns {Promise<{quarantined: string[], recorded: boolean}>}
 */
export async function completePhase(baseDir, phase) {
  if (!PHASES.includes(phase)) {
    throw new Error(
      `Invalid phase: ${phase}. Must be one of: ${PHASES.join(', ')}`
    );
  }
  return withStateLock(baseDir, async () => {
    const state = await readStateForMutation(baseDir);
    if (!state) {
      throw new Error('No project state found. Run /sig:new-project first.');
    }
    const today = new Date().toISOString().split('T')[0];
    const prior = state.completed_phases ?? state.completedPhases ?? [];
    if (prior.includes(`${phase} (${today})`)) {
      return { quarantined: [], recorded: false, trimmed: 0 }; // idempotent same-day re-run
    }
    // Second idempotence guard, and it is NOT redundant: the linear trim below
    // EMPTIES the live list, which erases the evidence the first guard reads.
    // Without this, a re-invoked `/sig:ship` re-records SHIP into the freshly
    // emptied list and archives a second, near-empty run. Caught by the AC5.5
    // test, which is the one that made this failure mode visible at all.
    //
    // `phase: SHIP` + an empty live list is unambiguous: the run was closed and
    // relocated. (A hand-edited STATE with that exact shape and no prior ship
    // would no-op here — accepted, and preferable to double-archiving.)
    if (phase === state.phase && prior.length === 0 && detectMode(state) === 'linear') {
      return { quarantined: [], recorded: false, trimmed: 0 };
    }
    const res = await recordPhase(baseDir, { leaving: phase, nextPhase: null });

    // FR5 linear trim (D-M5E9-6). A linear project's only close event is SHIP,
    // so that is where the finished run leaves the live list. Ordered AFTER the
    // SHIP record so the archived run contains its own SHIP (AC2.2).
    //
    // In the SEAM, not in ship.md's prose (AC5.3): a guarantee that lives in a
    // command file is exactly the B41 failure mode — four commands have already
    // demonstrated they simply do not run what their file says.
    let trimmed = 0;
    if (phase === 'SHIP' && detectMode(state) === 'linear') {
      const after = await readStateForMutation(baseDir);
      const run = after?.completed_phases ?? [];
      if (run.length > 0) {
        const label = `linear run ending ${today}`;
        const { archived } = await archivePhaseLog(
          baseDir,
          run,
          '.planning/STATE-HISTORY.md',
          label
        );
        // Relocate-never-delete: the live list is cleared only after the
        // archive write resolves, and only for exactly what was archived.
        if (archived === run.length) {
          const payload = stripStateMeta(after);
          payload.completed_phases = [];
          payload.last_updated = new Date().toISOString();
          await writeStateFrontmatter(baseDir, payload);
          trimmed = archived;
        }
      }
    }
    return { ...res, recorded: true, trimmed };
  });
}

export { PHASES, PLANNING_DIR, SCHEMA_VERSION, EPIC_ID_STRICT_RE, withStateLock };

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
    // FR5 Epic half (D-M5E9-7): ARCHIVE BEFORE RESET. B9's fix has zeroed
    // completed_phases on every roll since M5.E2 — and Epic-close eviction
    // operates on the STATE *body* (evict.js:296), never the frontmatter, so
    // the phase list was deleted with no copy kept anywhere. Under log
    // semantics that is unarchived history loss: the same defect this Epic
    // exists to fix, in the mode that currently looks healthy.
    //
    // Runs BEFORE the reset below, inside the same lock. If the archive write
    // fails it throws and the roll does not happen — losing the roll is
    // recoverable, losing the history is not.
    let archivedOut = 0;
    const closingEpic = state.current_epic;
    const closingLog = state.completed_phases ?? state.completedPhases ?? [];
    if (closingLog.length > 0) {
      // Three destinations, because there were three ways to reach the reset
      // below with an unarchived log and only one of them was covered (B52
      // half 2):
      //
      //   (a) closingEpic set + safe name → its own archive dir. The original
      //       path; unchanged for every strict Epic ID, so nothing that
      //       archives today moves.
      //   (b) closingEpic null/empty → `.planning/STATE-HISTORY.md`. A linear
      //       project opening its FIRST Epic never entered the old `if` at all,
      //       so its whole shipped history was zeroed silently. That file is
      //       already where completePhase's linear trim sends the identical
      //       shape, so this is the established destination, not a new one.
      //   (c) no safe destination → nothing is written, and the guard below
      //       refuses the roll.
      const dir = closingEpic ? unitArchiveDirFor(closingEpic) : null;
      const target = dir ? `${dir}/STATE-NARRATIVE.md` : (closingEpic ? null : '.planning/STATE-HISTORY.md');
      if (target) {
        const label = closingEpic
          ? `Epic ${closingEpic}`
          : `linear run ending ${new Date().toISOString().split('T')[0]}`;
        const { archived } = await archivePhaseLog(baseDir, closingLog, target, label);
        archivedOut = archived;
      }
    }

    // RELOCATE-NEVER-DELETE, ENFORCED (B52 half 2). The reset below is
    // unconditional, so until now "archive first" was a step that could be
    // skipped rather than an invariant that held: every branch that failed to
    // produce a destination fell through to the same zeroing write, with no
    // error, no warning, and no record. That is exactly how M5.E8's six-phase
    // DISCUSS→SHIP run was discarded — recoverable then only because
    // `.planning/` is tracked in git.
    //
    // The stale-cache warning makes the CAUSE visible; this makes the DAMAGE
    // loud regardless of which version is running, which is the half that would
    // have saved that ledger. Placed ABOVE the payload build so the throw
    // happens before any write — STATE.md is left byte-identical on disk.
    //
    // Losing the roll is recoverable. Losing the history is not.
    if (closingLog.length > 0 && archivedOut !== closingLog.length) {
      throw new StateWriteError(
        `setCurrentEpic: refusing to roll ${closingEpic ? `${closingEpic} → ` : ''}${epicId} — ` +
          `it would clear ${closingLog.length} completed-phase ${
            closingLog.length === 1 ? 'entry' : 'entries'
          } that were not archived (${archivedOut} archived). ` +
          (closingEpic
            ? `"${closingEpic}" has no safe archive destination; rename it to a strict Epic ID (M{N}.E{N}) or to a plain name with no path separators.`
            : 'Copy completed_phases somewhere durable, then clear it by hand before rolling.')
      );
    }

    const payload = stripStateMeta(state);
    payload.current_epic = epicId;
    payload.current_wave = null; // roll resets coupled in-flight state...
    payload.current_tasks = []; // ...atomically, under the same lock
    // B9 (M5.E2.S1.t0): phase, completed_phases, and last_completed_task are
    // PER-EPIC — a roll to a new Epic must not inherit the previous Epic's phase
    // progression (the bug: a fresh Epic reported as still at the old Epic's
    // SHIP with the old Epic's completed phases). phase: null is the valid
    // "no phase yet" state /sig:resume already handles; the caller
    // (discuss/new-project) sets the real phase immediately after the roll —
    // transitionPhase(...) records a clean per-Epic completed_phases because it
    // skips a null prior phase. blockers are NOT reset: a blocker can span Epics.
    payload.phase = null;
    payload.completed_phases = [];
    payload.last_completed_task = null;
    payload.last_updated = new Date().toISOString();
    await writeStateFrontmatter(baseDir, payload);
    return { archivedPhaseLog: archivedOut }; // surfaced, never silent (NFR1)
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

// B6/FR4 (M5.E5.T4) — the true "bookkeeping" subset of STATE_AFFECTING_PATHS:
// curated orientation files that do NOT represent ground-state movement.
// STATE.md is markFresh's own "+1" (it records last_updated_commit = HEAD, then
// the caller commits that STATE write, so HEAD sits one STATE-only commit ahead
// of the recorded baseline); CONTEXT.md is likewise curated bookkeeping (D4).
// Deliberately SMALLER than STATE_AFFECTING_PATHS: a committed-but-unrolled
// *-PLAN/*-PROGRESS/*-VERIFICATION/*-REVIEW.md is real work worth a nudge, so it
// stays OUT of this set and is not swallowed by Walk 2's suppression.
const BOOKKEEPING_PATHS = [
  ':(glob).planning/STATE.md',
  ':(glob).planning/CONTEXT.md',
];

// The exclude form of BOOKKEEPING_PATHS. Paired with a leading `.` pathspec,
// `git log <range> -- . <excludes>` lists commits that touch anything OUTSIDE
// the bookkeeping set — i.e. genuine work (including a phase artifact never
// rolled into STATE). Used to suppress the pure-bookkeeping "+1" while still
// nudging on unrolled work.
const BOOKKEEPING_EXCLUDES = BOOKKEEPING_PATHS.map((p) =>
  p.replace(':(glob)', ':(glob,exclude)')
);

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
    if (commits.length === 0) return empty; // no state-affecting commits (D6 scope)

    // B6/FR4 (M5.E5.T4): suppress the pure-bookkeeping "+1" without swallowing
    // unrolled phase artifacts. Only treat the range as stale when at least one
    // commit touches a file OUTSIDE BOOKKEEPING_PATHS (STATE.md/CONTEXT.md) —
    // i.e. genuine work STATE.md doesn't reflect, which now includes a committed
    // *-PLAN/*-PROGRESS/*-VERIFICATION/*-REVIEW that never reached STATE. If every
    // commit touches only bookkeeping paths, it's curation, not drift. Keyed on
    // file identity, not commit count, so a STATE refresh split across two
    // commits still reads fresh.
    const workOut = execFn(
      'git',
      [
        'log',
        '--pretty=format:%H',
        `${lastCommit}..HEAD`,
        '--',
        '.',
        ...BOOKKEEPING_EXCLUDES,
      ],
      { cwd: baseDir, stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const genuineWork = String(workOut).split('\n').filter(Boolean).length;
    if (genuineWork === 0) return empty;

    return { stale: true, commitCount: commits.length, commits };
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

  // 3. How many commits is the remote branch ahead of local HEAD? B6/FR4: this
  //    is measured HEAD..tracking, NOT stored..tracking. `stored`
  //    (last_updated_commit) lags HEAD by exactly the bookkeeping STATE-write
  //    commit, so a stored-based range counts that local "+1" as origin drift
  //    even when HEAD == origin. Measuring from HEAD reports the genuine push
  //    count. A missing sha or diverged history → `fatal: bad revision`
  //    (exit 128) → catch → fail open.
  let aheadCount;
  try {
    aheadCount = parseInt(
      String(
        execFn('git', ['rev-list', '--count', `HEAD..${tracking}`], {
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
  //    list but keeps the (already-known) count. Same HEAD..tracking range as
  //    the count for a coherent pull list (B6/FR4).
  let commits = [];
  try {
    const out = execFn(
      'git',
      ['log', '--pretty=format:%H %s', `HEAD..${tracking}`],
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
  //    "your project memory moved" highlight (AC2.3). Same HEAD..tracking range
  //    as the count/list for a coherent result (B6/FR4).
  let touchedPlanning = false;
  try {
    touchedPlanning =
      parseInt(
        String(
          execFn(
            'git',
            ['rev-list', '--count', `HEAD..${tracking}`, '--', '.planning/'],
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

// FR2d — tier-aware size thresholds. A SKETCH project is throwaway and should
// stay tiny; a FULL project is long-lived and legitimately carries more
// closed-work history before eviction is due. The async PROFILE read that
// resolves the tier lives in the command layer (tools/lib/status.js) — keeping
// this module sync/pure and free of a profile.js import (which would cycle,
// since profile.js already imports from state.js).
const TIER_SIZE_THRESHOLDS = {
  SKETCH: 75 * 1024, // throwaway — stays tiny
  FEATURE: 150 * 1024,
  SPIKE: 150 * 1024,
  FULL: 300 * 1024, // long-lived — more closed-work history before eviction is due
};

/**
 * Resolve a project tier to its STATE.md size threshold. Unknown / undefined
 * tier → the flat STATE_SIZE_WARN_BYTES default (fail-open).
 *
 * @param {string|null|undefined} tier
 * @returns {number}
 */
function resolveStateSizeThreshold(tier) {
  return TIER_SIZE_THRESHOLDS[tier] ?? STATE_SIZE_WARN_BYTES;
}

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
      `is accumulating. Run /sig:checkpoint or /sig:ship to evict closed-Epic ` +
      `narrative to archive (M5.E1 FR2b), or move closed-slice narrative into an ` +
      `archive/RETROSPECTIVES pointer to trim it.`,
  };
}

/**
 * Read-only size check for a project's STATE.md against an explicit threshold
 * (FR2d). Whole-file `statSync`; NEVER throws (missing file or stat error →
 * null → no banner). Read-only, so the `/sig:status` read-only-`.planning/`
 * contract holds (no mtime change). The tier-aware command-layer wrapper
 * (status.js `readStateSizeForTier`) resolves the threshold from PROFILE and
 * passes it here; sync callers get the flat default.
 *
 * @param {string} baseDir
 * @param {number} [threshold=STATE_SIZE_WARN_BYTES]
 * @returns {{bytes: number, threshold: number, message: string} | null}
 */
function readStateSizeWithThreshold(baseDir, threshold = STATE_SIZE_WARN_BYTES) {
  const statePath = join(baseDir, PLANNING_DIR, 'STATE.md');
  if (!existsSync(statePath)) return null;
  let bytes;
  try {
    bytes = statSync(statePath).size;
  } catch {
    return null; // unreadable → no banner
  }
  return detectStateSize(bytes, threshold);
}

/**
 * Read-only size check for a project's STATE.md at the flat default threshold
 * (FR2). Thin wrapper over `readStateSizeWithThreshold` so the existing sync
 * callers/tests keep their 150 KB behavior unchanged.
 *
 * @param {string} baseDir
 * @returns {{bytes: number, threshold: number, message: string} | null}
 */
function readStateSize(baseDir) {
  return readStateSizeWithThreshold(baseDir, STATE_SIZE_WARN_BYTES);
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
  TIER_SIZE_THRESHOLDS,
  resolveStateSizeThreshold,
  detectStateSize,
  readStateSize,
  readStateSizeWithThreshold,
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
