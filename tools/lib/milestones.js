// Milestone resolution helpers (M4.5.E2.S2.t2).
//
// Pure-Node helpers for the `--milestone` capture destination (S2.t5).
// `currentMilestone` derives the target milestone filename from STATE.md's
// `current_epic` (the source of truth — no file-scan heuristics, per
// RESEARCH § 1 #20 and Decision 7). `listMilestones` enumerates the
// MILESTONE-*.md files decimal-aware so `4.5` sorts between `4` and `5`.
//
// No new runtime deps — node:fs/promises + node:path only.

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { readState } from './state.js';

const PLANNING_DIR = '.planning';

// `current_epic` shape is `M{milestone}.E{epic}` where milestone may carry a
// single decimal (e.g. M4.5.E2). Capture only the milestone number.
const CURRENT_EPIC_RE = /^M(\d+(?:\.\d+)?)\.E\d+/;

// Milestone filenames are `MILESTONE-{n}.md` with an optional decimal id.
const MILESTONE_FILE_RE = /^MILESTONE-(\d+(?:\.\d+)?)\.md$/;

/**
 * Resolve the milestone file that `--milestone` (no N) targets, derived from
 * STATE.md's `current_epic`. Returns the bare `MILESTONE-{n}.md` filename
 * (callers join it onto `.planning/`), or `null` when there is no current
 * milestone to resolve.
 *
 * Does NOT check that the file exists — existence-checking is S2.t5's job
 * (FR2.4). This returns the NAME; the caller decides what to do if it's
 * absent.
 *
 * @param {string} baseDir - Project root.
 * @returns {Promise<string|null>} `MILESTONE-{n}.md` or null.
 */
export async function currentMilestone(baseDir) {
  const state = await readState(baseDir);
  const epic = state?.current_epic;
  if (!epic || typeof epic !== 'string') return null;
  const match = epic.match(CURRENT_EPIC_RE);
  if (!match) return null;
  return `MILESTONE-${match[1]}.md`;
}

/**
 * List the milestone files under `.planning/`, decimal-aware sorted ascending
 * by numeric value of the milestone id. Returns `[]` when `.planning/` is
 * absent or contains no milestone files (never throws).
 *
 * `id` is the milestone number exactly as it appears in the filename (the
 * string `"4"`, `"4.5"`, `"5"`); `file` is the filename. `parseFloat` is used
 * only for the sort comparator — the returned `id` stays a string.
 *
 * @param {string} baseDir - Project root.
 * @returns {Promise<Array<{id: string, file: string}>>}
 */
export async function listMilestones(baseDir) {
  let entries;
  try {
    entries = await readdir(join(baseDir, PLANNING_DIR));
  } catch {
    // .planning/ absent (or unreadable) — no milestones to list.
    return [];
  }
  return entries
    .map((file) => {
      const match = file.match(MILESTONE_FILE_RE);
      return match ? { id: match[1], file } : null;
    })
    .filter(Boolean)
    .sort((a, b) => parseFloat(a.id) - parseFloat(b.id));
}
