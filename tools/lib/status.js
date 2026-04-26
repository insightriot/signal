import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PHASES } from './state.js';

// Map: phase name -> the command that runs THAT phase.
// (Used after walking forward to the next non-skipped phase.)
const PHASE_TO_COMMAND = {
  CALIBRATE: '/sig:calibrate',
  DISCUSS: '/sig:discuss',
  PLAN: '/sig:plan',
  EXECUTE: '/sig:execute',
  VERIFY: '/sig:verify',
  REVIEW: '/sig:review',
  SHIP: '/sig:ship',
};

/**
 * Compute the recommended next action for the user, walking forward over phases
 * listed in `phasesSkipped`. Returns either '/sig:{cmd}' or 'done'.
 *
 * @param {string} currentPhase - One of the PHASES values.
 * @param {string[]} phasesSkipped - Phases the current tier skips.
 * @returns {string} '/sig:{cmd}' for the next non-skipped phase, or 'done'.
 */
export function nextActionForPhase(currentPhase, phasesSkipped = []) {
  if (!PHASES.includes(currentPhase)) {
    throw new Error(
      `nextActionForPhase: unknown currentPhase "${currentPhase}". Must be one of: ${PHASES.join(', ')}.`
    );
  }

  const skipped = new Set(phasesSkipped);
  const idx = PHASES.indexOf(currentPhase);

  for (let i = idx + 1; i < PHASES.length; i += 1) {
    const candidate = PHASES[i];
    if (!skipped.has(candidate)) {
      return PHASE_TO_COMMAND[candidate] ?? 'done';
    }
  }

  return 'done';
}

/**
 * Did `nextActionForPhase` walk past any skipped phases to reach 'done'?
 * Used by /sig:status to decide between two 'done' messages.
 *
 * @param {string} currentPhase
 * @param {string[]} phasesSkipped
 * @returns {boolean} true if any phase between currentPhase and end was skipped.
 */
export function reachedDoneViaSkip(currentPhase, phasesSkipped = []) {
  if (!PHASES.includes(currentPhase)) return false;
  const skipped = new Set(phasesSkipped);
  const idx = PHASES.indexOf(currentPhase);
  for (let i = idx + 1; i < PHASES.length; i += 1) {
    if (!skipped.has(PHASES[i])) return false;
  }
  return idx + 1 < PHASES.length;
}

/**
 * Extract top-N level-2 (## ) headings from an OPEN-QUESTIONS.md file content.
 * Truncates each to maxLen characters (with ellipsis appended on truncation).
 *
 * @param {string} content - Raw file content.
 * @param {number} limit - Max number of headings to return (default 3).
 * @param {number} maxLen - Max characters per heading (default 80).
 * @returns {string[]} Truncated headings.
 */
export function extractTopOpenQuestions(content, limit = 3, maxLen = 80) {
  if (typeof content !== 'string') return [];
  const headings = [];
  const re = /^## (.+)$/gm;
  let match;
  while ((match = re.exec(content)) !== null) {
    let heading = match[1].trim();
    if (heading.length > maxLen) {
      heading = heading.slice(0, maxLen - 1).trimEnd() + '…';
    }
    headings.push(heading);
    if (headings.length >= limit) break;
  }
  return headings;
}

/**
 * Count total level-2 headings in an OPEN-QUESTIONS.md content.
 *
 * @param {string} content
 * @returns {number}
 */
export function countOpenQuestions(content) {
  if (typeof content !== 'string') return 0;
  const matches = content.match(/^## /gm);
  return matches ? matches.length : 0;
}

/**
 * Read .planning/OPEN-QUESTIONS.md if present and return {count, top}. Returns
 * null if the file is absent, so callers can omit the section entirely.
 *
 * @param {string} baseDir - Project root.
 * @returns {Promise<{count: number, top: string[]} | null>}
 */
export async function readOpenQuestions(baseDir) {
  const path = join(baseDir, '.planning', 'OPEN-QUESTIONS.md');
  if (!existsSync(path)) return null;
  const content = await readFile(path, 'utf-8');
  return {
    count: countOpenQuestions(content),
    top: extractTopOpenQuestions(content, 3, 80),
  };
}

/**
 * Format an escalation-history entry for the tier-display line.
 *
 * Uses the FIRST valid entry — the origin tier and date the escalation history
 * began. The status report shows the most-recent escalation in a separate
 * "Last escalation: ..." line; this helper handles the "where the project
 * started" view.
 *
 * @param {object[]} history - escalation_history array from PROFILE.md metadata.
 * @returns {string|null} ' (escalated from {from_tier} on {YYYY-MM-DD})' or null.
 */
export function formatEscalationSummary(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  const valid = history.filter(
    (e) => e && typeof e.from_tier === 'string' && typeof e.timestamp === 'string'
  );
  if (valid.length === 0) return null;
  const first = valid[0];
  const dateOnly = (first.timestamp.match(/^\d{4}-\d{2}-\d{2}/) || [first.timestamp])[0];
  return ` (escalated from ${first.from_tier} on ${dateOnly})`;
}
