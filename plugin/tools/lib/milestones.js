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

// Epic artifact filenames are `{EpicID}-{ARTIFACT}.md`; capture the milestone
// id and the epic number so we can find the highest E{N} already used under a
// milestone. `MILESTONE-4.5.md` etc. don't match (no digit right after `M`).
const EPIC_ARTIFACT_RE = /^M(\d+(?:\.\d+)?)\.E(\d+)-/;

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

/**
 * Derive the next Epic ID under a milestone (M4.5.E11.S1.t7 — the "commands
 * assign IDs" half of FR1). Scans `.planning/` for existing
 * `M{milestone}.E{N}-*.md` artifacts and returns `M{milestone}.E{maxN+1}`
 * (or `...E1` when none exist). The milestone comes from `opts.milestone`
 * when given, otherwise from the milestone portion of STATE.md's current_epic.
 * Returns `null` when there is no milestone context to derive under (no
 * `milestone` arg AND no strict `current_epic`) — the caller must then supply
 * an explicit `--milestone` or pass a literal Epic ID to `--epic`.
 *
 * @param {string} baseDir
 * @param {{milestone?: string}} [opts]
 * @returns {Promise<string|null>} next strict Epic ID, or null.
 */
export async function deriveNextEpicId(baseDir, { milestone } = {}) {
  let ms = milestone ?? null;
  if (ms == null) {
    const state = await readState(baseDir);
    const epic = state?.current_epic;
    if (typeof epic === 'string') {
      const m = epic.match(CURRENT_EPIC_RE);
      if (m) ms = m[1];
    }
  }
  if (ms == null) return null;

  let entries;
  try {
    entries = await readdir(join(baseDir, PLANNING_DIR));
  } catch {
    entries = [];
  }
  let maxN = 0;
  for (const f of entries) {
    const m = f.match(EPIC_ARTIFACT_RE);
    if (m && m[1] === ms) {
      const n = parseInt(m[2], 10);
      if (n > maxN) maxN = n;
    }
  }
  return `M${ms}.E${maxN + 1}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Epic-status rows — ONE reader for the two published formats (`M6.E7` t2.5).
//
// This repo has shipped TWO mutually-blind parsers of the same table, and the
// consequence was measured rather than guessed:
//
//   - `findEpicStatusRow` (private, `retrospective.js`) matches the bare-E form
//     `| **E1** | … |` and returns null on `` | `M6.E1` | … | ``.
//   - `EPIC_ROW` (private, `published-facts.js`) matches the full-ID form and
//     returns nothing on the bare-E form.
//
// `MILESTONE-4.5.md` and `MILESTONE-5.md` publish the first; `MILESTONE-6.md`
// publishes the second. So `D-E9-5`'s "a maintained row wins" has been inert
// across five Epic ships, because the reader behind it could not see Milestone 6's
// rows at all. Filed as a bug; this is the shared reader that makes a fix
// possible.
//
// ⚠ RE-POINTING THE TWO EXISTING CALL SITES IS DELIBERATELY NOT DONE HERE.
// `findEpicStatusRow` feeds `isEpicCloseShip`, so re-pointing it makes `D-E9-5`'s
// override live again across Milestone 6 and CHANGES WHEN THE SHIP RETRO GATE
// FIRES. That is a real behaviour change and does not belong inside an advisory
// Epic as a side effect. The export lands here; the re-point gets its own row and
// its own test.
// ─────────────────────────────────────────────────────────────────────────────

// Cell one, past the decoration real rows carry (backticks, bold, whitespace):
// either a full `M{n}.E{n}` id or a bare `E{n}`, then whatever title follows.
// The decoration run is BOUNDED for the same reason `backlog.js`'s is — two
// adjacent unbounded star-runs backtrack quadratically on a non-matching line,
// and this runs over every line of every milestone file.
const EPIC_STATUS_ROW_RE =
  /^\|[\s`*_]{0,10}(?:(M\d+(?:\.\d+)*)\.)?E(\d+)\b([^|]*)\|([^|]*)\|/;

/**
 * Every Epic-status row in a milestone file body, in document order.
 *
 * Covers both published formats. `id` is the full Epic ID: taken from the row
 * when the row spells it out, otherwise composed from `opts.milestone`. When the
 * row is bare-E AND no milestone is supplied, `id` is **null** rather than
 * guessed — a wrong Epic ID in an advisory citation is worse than an absent one.
 *
 * @param {string} content — a MILESTONE-{n}.md body
 * @param {{milestone?: string}} [opts] — milestone id (`"5"`, `"4.5"`) for bare-E rows
 * @returns {Array<{id: string|null, milestone: string|null, epicNumber: number,
 *   title: string, status: string, line: number, raw: string}>}
 */
export function parseEpicStatusRows(content, { milestone } = {}) {
  const out = [];
  let inFence = false;

  String(content)
    .split('\n')
    .forEach((line, i) => {
      const t = line.trimStart();
      if (t.startsWith('```') || t.startsWith('~~~')) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;

      const m = line.match(EPIC_STATUS_ROW_RE);
      if (!m) return;

      const [, rowMilestone, epicNum, cellOneTail, statusCell] = m;
      const ms = rowMilestone ?? (milestone ? `M${milestone}` : null);
      out.push({
        id: ms ? `${ms}.E${epicNum}` : null,
        milestone: ms,
        epicNumber: Number(epicNum),
        title: `E${epicNum}${cellOneTail}`.replace(/[\s`*_]+$/, '').trim(),
        status: statusCell.trim(),
        line: i + 1,
        raw: line,
      });
    });

  return out;
}
