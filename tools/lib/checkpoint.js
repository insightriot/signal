// /sig:checkpoint — manual state-refresh helpers (M4.5.E6.S2).
//
// Quick mode (default): diff git log since last_updated_commit against
// STATE.md's recorded state, render the diff, write under strict gate.
// --context mode (D16): additionally prompt for decisions + open questions
// and dual-write them to CONTEXT.md (§Locked Decisions) AND DECISIONS.md.

import { readState, isStateStale } from './state.js';

// Vocabulary task-ID regex (per Signal's ID-is-identity convention): matches
// `M4`, `M4.5`, `M4.5.E6`, `M4.5.E6.S1`, `M4.5.E6.S1.t6`, with an optional
// `.gate` suffix for explicit gate commits. Anchored at line start + colon
// so it only catches commit subjects shaped like `M…: <description>`.
const TASK_ID_RE = /^((?:M\d+(?:\.\d+)?)(?:\.E\d+)?(?:\.S\d+)?(?:\.t\d+)?(?:\.gate)?):/;

function extractTaskId(subject) {
  const m = subject.match(TASK_ID_RE);
  return m ? m[1] : null;
}

/**
 * Parse `$ARGUMENTS` for `/sig:checkpoint`. Only the `--context` flag is
 * recognized in Slice 2; everything else surfaces as `unknownFlags` so the
 * command file can render a warning rather than silently dropping input.
 *
 * @param {string|undefined} argsString
 * @returns {{contextMode: boolean, unknownFlags: string[]}}
 */
export function parseCheckpointArgs(argsString) {
  const tokens = String(argsString ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let contextMode = false;
  const unknownFlags = [];
  for (const t of tokens) {
    if (t === '--context') {
      contextMode = true;
    } else {
      unknownFlags.push(t);
    }
  }
  return { contextMode, unknownFlags };
}

/**
 * Read-only inspection of "what would STATE.md become if we accepted the
 * commit log as ground truth?" Pairs the current STATE.md against commits
 * since `last_updated_commit`, proposes a fresh state, and packages both
 * for `renderStateDiff` (S2.t3) to consume.
 *
 * Rules applied to the proposed state:
 * - In-flight tasks whose IDs appear in any commit subject get dropped
 *   from `current_tasks[]` (work landed; clearCurrentTask just didn't run).
 * - `last_updated` advances to now; `last_updated_commit` is left to the
 *   caller (`markFresh` typically resolves HEAD at write time).
 *
 * `execFn` is injectable so tests stub git output.
 *
 * @param {string} baseDir
 * @param {{execFn?: typeof import('node:child_process').execFileSync}} [opts]
 * @returns {Promise<{
 *   current: object,
 *   proposed: object,
 *   diff: {
 *     commitsBehind: number,
 *     commits: Array<{sha: string, subject: string}>,
 *     taskIdsInCommits: string[],
 *   },
 * }>}
 */
export async function detectStateChanges(baseDir, opts = {}) {
  const current = await readState(baseDir);
  if (!current) {
    return {
      current: null,
      proposed: null,
      diff: { commitsBehind: 0, commits: [], taskIdsInCommits: [] },
    };
  }
  // bypassGrace: true — /sig:checkpoint is the user explicitly asking
  // "what changed?"; suppressing via the 60s grace window would hide
  // commits that landed seconds after a STATE.md write.
  const stale = await isStateStale(baseDir, { ...opts, bypassGrace: true });
  const taskIds = stale.commits
    .map((c) => extractTaskId(c.subject))
    .filter((id) => id !== null);

  // Build the speculative state.
  const proposed = { ...current };
  delete proposed._schema;
  delete proposed.completedPhases;
  delete proposed.lastUpdated;
  const taskIdSet = new Set(taskIds);
  if (Array.isArray(proposed.current_tasks)) {
    proposed.current_tasks = proposed.current_tasks.filter(
      (t) => !taskIdSet.has(t.id)
    );
  }
  proposed.last_updated = new Date().toISOString();

  return {
    current,
    proposed,
    diff: {
      commitsBehind: stale.commitCount,
      commits: stale.commits,
      taskIdsInCommits: taskIds,
    },
  };
}
