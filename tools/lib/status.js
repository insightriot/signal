import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PHASES,
  readSchemaDrift,
  formatSchemaDriftBanner,
  readStateSize,
  formatStateSizeBanner,
} from './state.js';
import { extractSection } from './landscape.js';
import {
  readInstallState,
  runAllDetectors,
  fetchLatestVersionCached,
  computeStalenessRecommendation,
} from './doctor.js';

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

/**
 * Read .planning/LANDSCAPE.md if present and return summary metadata.
 * Returns null if the file is absent (callers omit the section). When present,
 * returns the captured-on date parsed from the trailing "## Last Updated"
 * section; null `capturedOn` means the file exists but the date is missing or
 * unparseable.
 *
 * @param {string} baseDir - Project root.
 * @returns {Promise<{capturedOn: string|null} | null>}
 */
export async function readLandscapeMeta(baseDir) {
  const path = join(baseDir, '.planning', 'LANDSCAPE.md');
  if (!existsSync(path)) return null;
  const content = await readFile(path, 'utf-8');
  const lastUpdatedSection = extractSection(content, 'Last Updated');
  const dateMatch = lastUpdatedSection && lastUpdatedSection.match(/(\d{4}-\d{2}-\d{2})/);
  return { capturedOn: dateMatch ? dateMatch[1] : null };
}

/**
 * Compose the staleness banner for `/sig:status` (M4.5.E8.S3 FR6).
 *
 * Reads install state, runs detectors, fetches the latest tag from GitHub
 * (24h cache), and renders a one-line warning per the FR6 matrix. Returns
 * `null` to skip the banner entirely (e.g., no Signal install, healthy +
 * current version, or API unreachable).
 *
 * Wraps every code path in try/catch — the version check is advisory; a
 * failure here MUST NOT break `/sig:status`.
 *
 * @param {{homeDir?:string, fetchFn?:Function, fsImpl?:object, now?:()=>number}} opts
 * @returns {Promise<string|null>}
 */
export async function readStalenessWarning(opts = {}) {
  try {
    const { homeDir } = opts;
    if (!homeDir) return null;

    const state = readInstallState({ homeDir, fsImpl: opts.fsImpl });
    const entry = state.manifest?.plugins?.['sig@signal']?.[0];
    if (!entry || !entry.installPath) return null; // no Signal install

    // Read the installed version from cache plugin.json.
    let installedVersion;
    try {
      const pluginJsonPath = join(entry.installPath, '.claude-plugin', 'plugin.json');
      const fsRead = opts.fsImpl?.readFileSync || readFileSync;
      installedVersion = JSON.parse(fsRead(pluginJsonPath, 'utf8')).version;
    } catch {
      return null; // unreadable plugin.json — can't compute staleness
    }

    const findings = runAllDetectors(state);
    const latest = await fetchLatestVersionCached({
      homeDir,
      fetchFn: opts.fetchFn,
      now: opts.now,
    });

    const recommendation = computeStalenessRecommendation({
      installed: installedVersion,
      latest,
      pStatesDetected: !findings.healthy,
    });
    if (!recommendation) return null;

    return formatStalenessWarning({
      installed: installedVersion,
      latest,
      recommendation,
    });
  } catch {
    // Advisory only — never break /sig:status.
    return null;
  }
}

/**
 * Render the staleness banner as a one-line string. Pure function;
 * separated so callers can compose differently if needed.
 *
 * @param {{installed:string, latest:string|null, recommendation:string}} opts
 * @returns {string}
 */
export function formatStalenessWarning({ installed, latest, recommendation }) {
  const latestText = latest ? ` Latest tag: ${latest}.` : '';
  return `[!] Signal v${installed} installed.${latestText} ${recommendation}`;
}

/**
 * Read a project's STATE.md schema-drift banner for /sig:status (FR5, S4.t2),
 * or null when there's no drift / no STATE.md. Read-only; wraps state.js's
 * readSchemaDrift + the shared formatter so /sig:status and /sig:resume show
 * the identical, platform-agnostic warning (AD2 — not gated behind /sig:doctor).
 *
 * @param {string} baseDir
 * @returns {Promise<string | null>}
 */
export async function readSchemaDriftBanner(baseDir) {
  return formatSchemaDriftBanner(await readSchemaDrift(baseDir));
}

/**
 * Advisory STATE.md size banner (FR2, v0.1.6) — a string or null when the file
 * is under budget / absent. Read-only; wraps state.js's readStateSize + the
 * shared formatter so /sig:status, /sig:resume and /sig:checkpoint show the
 * identical warning. Never blocks.
 *
 * @param {string} baseDir
 * @returns {string | null}
 */
export function readStateSizeBanner(baseDir) {
  return formatStateSizeBanner(readStateSize(baseDir));
}
