// /sig:resume briefing renderer (M4.5.E6.S4.t1).
//
// Pure rendering helper. The command markdown handles I/O — reads STATE.md
// + PROFILE.md + LANDSCAPE.md, resolves the vision fallback, runs
// isStateStale, queries CONTEXT.md for locked decisions, etc. — and passes
// the resolved data here.
//
// Keeping this pure means we can unit-test the briefing format against
// fixtures without staging real files (or, when staging matters, point at
// tests/fixtures/resume/{in-flight, stale, orphan}/.planning/).

import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import {
  detectOrphans,
  clearCurrentTask,
  formatSchemaDriftBanner,
  formatStateSizeBanner,
  EPIC_ID_STRICT_RE,
} from './state.js';

const PHASES = ['CALIBRATE', 'DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP'];

// current_epic is user-editable YAML — a value like `../../etc/x` would let
// pattern-0 escape .planning/. Accept only a filename-safe token (mirrors the
// Epic-ID shape used across retrospective.js / backfill-retros.js); anything
// else falls through to the legacy patterns.
const EPIC_ID_RE = /^[A-Za-z0-9._-]+$/;

/**
 * Resolve a phase artifact's path within `.planning/`, trying, in precedence:
 *   0. `${currentEpic}-${artifact}.md`  — Epic-prefixed; only when currentEpic
 *      is a sanitized, path-confined token (Signal-on-Signal / hand-managed).
 *   1. `${N}-${artifact}.md` for N in 1..9  — numeric/GSD prefix (ascending N).
 *   2. `${artifact}.md`  — no-prefix simplified form.
 *   3. `${phase}-${artifact}.md`  — literal-substitution form (e.g. PLAN-PLAN).
 *
 * Returns the first existing candidate as an absolute path, or `null`.
 *
 * The Epic-prefixed pattern is the FR1 addition: `/sig:resume` couldn't find
 * `M4.5.E10-PLAN.md` because none of the legacy patterns match an Epic-prefixed
 * name. Guarded two ways (mirror add.js's assertSafeFilePath): the token regex
 * AND a path-confinement check, so a crafted current_epic can't escape.
 *
 * @param {string} planningDir  — absolute path to the project's `.planning/`
 * @param {string} artifact     — artifact base name, e.g. 'PLAN', 'REQUIREMENTS'
 * @param {{currentEpic?: string|null, phase?: string|null, existsFn?: (p: string) => boolean}} [opts]
 * @returns {string | null}
 */
export function resolveArtifactPath(planningDir, artifact, opts = {}) {
  const { currentEpic = null, phase = null, existsFn = existsSync } = opts;
  const planningRoot = resolve(planningDir);

  const candidates = [];
  if (typeof currentEpic === 'string' && currentEpic && EPIC_ID_RE.test(currentEpic)) {
    candidates.push(`${currentEpic}-${artifact}.md`); // pattern 0
  }
  for (let n = 1; n <= 9; n++) {
    candidates.push(`${n}-${artifact}.md`); // pattern 1 (ascending N tie-break)
  }
  candidates.push(`${artifact}.md`); // pattern 2
  if (typeof phase === 'string' && phase) {
    candidates.push(`${phase}-${artifact}.md`); // pattern 3
  }

  for (const name of candidates) {
    const full = resolve(planningRoot, name);
    // Defense-in-depth path-confinement: the resolved candidate must stay
    // inside planningRoot (the trailing `sep` defeats the sibling-prefix bug,
    // e.g. `.planning-evil/`). The regex already blocks separators, but keep
    // both guards — same posture as add.js's assertSafeFilePath.
    if (!full.startsWith(planningRoot + sep)) continue;
    if (existsFn(full)) return full;
  }
  return null;
}

// Artifact kinds whose LINEAR-mode name is NOT the numeric `1-` prefix.
// REQUIREMENTS (a DISCUSS artifact) is written UNPREFIXED as `REQUIREMENTS.md`
// by discuss.md — matching that exactly is FR4 byte-identity (an Epic prefix or
// a `1-` prefix here would fork every existing linear project that already has
// a `REQUIREMENTS.md`), not cosmetics.
const LINEAR_UNPREFIXED = new Set(['REQUIREMENTS']);

/**
 * Produce the canonical file name a phase command should WRITE for `artifact`
 * — the FR2 write-half (M4.5.E11.S2.t1), symmetric to `resolveArtifactPath`'s
 * read. Whatever this emits, `resolveArtifactPath` (with the same opts) resolves
 * back.
 *
 *   - Epic mode (strict `currentEpic`): `{EpicID}-{artifact}.md` for ALL kinds.
 *     This matches every Epic artifact Signal-on-Signal writes on disk
 *     (e.g. `M4.5.E11-REQUIREMENTS.md`) and, for RETROSPECTIVE, is
 *     byte-identical to `deriveRetroPath`'s basename — retro naming has one
 *     owner in Epic mode.
 *   - Linear mode (null / absent / non-strict `currentEpic`): the numeric
 *     `1-{artifact}.md`, EXCEPT REQUIREMENTS → unprefixed `REQUIREMENTS.md`.
 *
 * Uses the STRICT Epic-ID shape (D-E11-4): a non-strict value like `v0.1.6`
 * degrades to linear naming rather than emitting `v0.1.6-PLAN.md` — fail-open,
 * consistent with `detectMode`.
 *
 * RETROSPECTIVE's LINEAR name is intentionally NOT part of this contract: in
 * linear mode the retro is milestone-scoped and written by ship via
 * `deriveRetroPath`, not through a phase command's `artifactName` call.
 *
 * @param {string} artifact — artifact base name, e.g. 'PLAN', 'REQUIREMENTS'
 * @param {{currentEpic?: string|null, phase?: string|null}} [opts]
 * @returns {string} the file name (no directory) to write under `.planning/`
 */
export function artifactName(artifact, opts = {}) {
  const { currentEpic = null } = opts;
  if (typeof currentEpic === 'string' && EPIC_ID_STRICT_RE.test(currentEpic)) {
    return `${currentEpic}-${artifact}.md`;
  }
  if (LINEAR_UNPREFIXED.has(artifact)) return `${artifact}.md`;
  return `1-${artifact}.md`;
}

function shortSha(sha) {
  if (!sha) return null;
  return String(sha).slice(0, 8);
}

function formatAge(iso) {
  if (!iso) return 'unknown';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Render a /sig:resume re-orientation briefing. Pure function — no I/O.
 *
 * @param {object} params
 * @param {string} params.cwd
 * @param {object} params.state  - readState() output
 * @param {object} params.profile  - PROFILE.md parsed
 * @param {string} [params.visionText]  - already-resolved Vision (caller
 *   applies the LANDSCAPE fallback rule)
 * @param {string|null} [params.landscapeCapturedOn]
 * @param {string[]} [params.lockedDecisions] - first-5 used; remainder summarized
 * @param {string[]} [params.openQuestions] - first-3 used
 * @param {{stale: boolean, commitCount: number}} [params.isStaleResult]
 * @param {{stale: boolean, aheadCount: number, touchedPlanning: boolean}} [params.originDriftResult]
 *   - isStaleVsOrigin() output; renders a distinct banner from isStaleResult
 * @param {{status: string, message: string} | null} [params.schemaDriftResult]
 *   - readSchemaDrift() output; renders a schema-drift banner above all others
 * @param {string} [params.nextAction]  - "Work remaining" copy
 * @returns {string}
 */
export function renderResumeBriefing(params = {}) {
  const {
    cwd = '<unknown>',
    state,
    profile = {},
    visionText = '',
    landscapeCapturedOn = null,
    lockedDecisions = [],
    openQuestions = [],
    isStaleResult = null,
    originDriftResult = null,
    schemaDriftResult = null,
    stateSizeResult = null,
    nextAction = '',
    retroSummary = null,
  } = params;

  const lines = [];

  // Schema drift is the most fundamental trust signal — if STATE.md's schema is
  // wrong, every field the briefing reads below could be misparsed. Surfaced
  // first, above the staleness banners (AD2: platform-agnostic, non-blocking).
  const schemaBanner = formatSchemaDriftBanner(schemaDriftResult);
  if (schemaBanner) {
    lines.push(...schemaBanner.split('\n'));
    lines.push('');
  }

  if (isStaleResult?.stale) {
    lines.push(
      `⚠ STATE.md is ${isStaleResult.commitCount} commit${
        isStaleResult.commitCount === 1 ? '' : 's'
      } behind work history.`
    );
    lines.push(`   Run /sig:checkpoint to refresh, or continue with potentially stale info.`);
    lines.push('');
  }

  // Origin-drift is a distinct trust signal from local staleness (D-E10-8):
  // the remote moved, not just the local working tree. Kept as its own banner
  // so both can fire — a machine that pushed .planning/ changes is exactly the
  // case where "which of my STATE.md files is authoritative?" bites.
  if (originDriftResult?.stale) {
    const n = originDriftResult.aheadCount;
    lines.push(
      `⚠ origin is ${n} commit${n === 1 ? '' : 's'} ahead of your STATE.md baseline — someone pushed work you don't have.`
    );
    if (originDriftResult.touchedPlanning) {
      lines.push(`   Includes .planning/ changes — git pull before continuing so project memory doesn't fork.`);
    } else {
      lines.push(`   Run git pull to sync, or continue (this was a read-only check).`);
    }
    lines.push('');
  }

  // Size is the lowest-priority (advisory) banner — it doesn't cast doubt on
  // the briefing's correctness the way schema/staleness/origin drift do, so it
  // renders last, just above the body.
  const sizeBanner = formatStateSizeBanner(stateSizeResult);
  if (sizeBanner) {
    lines.push(...sizeBanner.split('\n'));
    lines.push('');
  }

  lines.push('== Project Briefing ==');
  lines.push('');
  lines.push(`Project: ${cwd}`);
  const tier = profile?.tier ?? '<uncalibrated>';
  lines.push(`Tier:    ${tier}`);
  if (state) {
    const completed = (state.completed_phases ?? state.completedPhases ?? []).length;
    const skipped = (profile?.phases_skipped ?? []).length;
    const total = PHASES.length - skipped;
    lines.push(`Phase:   ${state.phase}  (${completed}/${total} phases done)`);
  } else {
    lines.push(`Phase:   <not started>`);
  }
  if (landscapeCapturedOn) {
    lines.push(`Landscape: captured ${landscapeCapturedOn} (brownfield init)`);
  }
  if (retroSummary) {
    const { total, complete, stub } = retroSummary;
    if (total === 0) {
      lines.push(`Retros:  0/0 (no retros yet — the first one lands at the next Epic close)`);
    } else {
      const stubSuffix = stub > 0 ? ` (${stub} stub${stub === 1 ? '' : 's'} awaiting backfill)` : '';
      lines.push(`Retros:  ${complete}/${total} complete${stubSuffix}`);
    }
  }

  if (visionText) {
    lines.push('');
    lines.push('— Vision —');
    lines.push(visionText);
  }

  if (state?.current_tasks && state.current_tasks.length > 0) {
    lines.push('');
    lines.push(`— In-flight (${state.current_tasks.length}) —`);
    lines.push(state.current_tasks.map((t) => t.id).join(', '));
  }

  if (state?.last_completed_task) {
    const lc = state.last_completed_task;
    lines.push('');
    lines.push('— Last completed —');
    const sha = shortSha(lc.commit) ?? '(no commit)';
    lines.push(`${lc.id} (${lc.status}) at ${sha}`);
  }

  if (state?.blockers && state.blockers.length > 0) {
    lines.push('');
    lines.push(`— Blockers (${state.blockers.length}) —`);
    for (const b of state.blockers) {
      lines.push(`${b.text} (${b.id}, raised ${formatAge(b.raisedAt)})`);
    }
  }

  if (lockedDecisions.length > 0) {
    lines.push('');
    lines.push('— Decisions locked (DISCUSS) —');
    const first = lockedDecisions.slice(0, 5);
    first.forEach((d, i) => lines.push(`${i + 1}. ${d}`));
    if (lockedDecisions.length > 5) {
      lines.push(`...and ${lockedDecisions.length - 5} more`);
    }
  }

  if (openQuestions.length > 0) {
    lines.push('');
    lines.push(`— Open questions (${openQuestions.length}) —`);
    for (const q of openQuestions.slice(0, 3)) {
      lines.push(q);
    }
  }

  if (nextAction) {
    lines.push('');
    lines.push('— Work remaining —');
    lines.push(nextAction);
  }

  return lines.join('\n');
}

/**
 * Orphan-handling step for /sig:resume. Identical contract to
 * /sig:checkpoint's handleCheckpointOrphans (S2.t7) — kept as a separate
 * function because the resume.md flow surfaces the prompt at a different
 * point in the UI (before briefing render, not after refresh apply).
 *
 * @param {string} baseDir
 * @param {{prompt?: (orphans: Array) => Promise<'clear' | 'keep'>, thresholdMs?: number, execFn?: Function}} [opts]
 * @returns {Promise<{orphans: Array, action: 'none' | 'cleared' | 'kept' | 'pending'}>}
 */
export async function handleOrphansAtResume(baseDir, opts = {}) {
  const orphans = await detectOrphans(baseDir, opts);
  if (orphans.length === 0) return { orphans: [], action: 'none' };
  if (!opts.prompt) return { orphans, action: 'pending' };
  const choice = await opts.prompt(orphans);
  if (choice === 'clear') {
    for (const o of orphans) {
      await clearCurrentTask(baseDir, { id: o.id, status: 'aborted' });
    }
    return { orphans, action: 'cleared' };
  }
  return { orphans, action: 'kept' };
}
