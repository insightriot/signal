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

import {
  detectOrphans,
  clearCurrentTask,
} from './state.js';

const PHASES = ['CALIBRATE', 'DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW', 'SHIP'];

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
    nextAction = '',
    retroSummary = null,
  } = params;

  const lines = [];

  if (isStaleResult?.stale) {
    lines.push(
      `⚠ STATE.md is ${isStaleResult.commitCount} commit${
        isStaleResult.commitCount === 1 ? '' : 's'
      } behind work history.`
    );
    lines.push(`   Run /sig:checkpoint to refresh, or continue with potentially stale info.`);
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
