import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PHASES,
  readSchemaDrift,
  formatSchemaDriftBanner,
  readStateSize,
  readStateSizeWithThreshold,
  resolveStateSizeThreshold,
  STATE_SIZE_WARN_BYTES,
  formatStateSizeBanner,
  EPIC_ID_STRICT_RE,
} from './state.js';
import { readProfile } from './profile.js';
import { extractSection } from './landscape.js';
import { senseProject, CURRENT_LAYOUT_VERSION } from './migrate-memory.js';
import { readCappedPrefix, readLayoutStampFromPrefix } from './layout-stamp.js';
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
 * Fail-open companion to `nextActionForPhase` (`B70`).
 *
 * `nextActionForPhase` throws on a phase outside `PHASES`, and in `resume.md`
 * the call sits inside `renderResumeBriefing`'s argument list — so a project
 * whose `phase` drifted off the canonical seven loses the ENTIRE briefing, not
 * just its next-action line. Measured: 5 of 12 real projects, every one of them
 * hand-maintained. `eval-project-C` holds a multi-paragraph prose blob there.
 *
 * This never throws. `nextActionForPhase` keeps its strict contract — callers
 * that want the guard still get it; the two read-only meta commands use this.
 * (`reachedDoneViaSkip` below already fails open the same way.)
 *
 * @param {string} currentPhase - canonical phase, or anything at all
 * @param {string[]} phasesSkipped - phases the current tier skips
 * @returns {{recognized: boolean, action: string|null, rawPhase: string, valid: string[]}}
 */
export function describeNextAction(currentPhase, phasesSkipped = []) {
  const valid = [...PHASES];
  if (typeof currentPhase !== 'string' || !PHASES.includes(currentPhase)) {
    return {
      recognized: false,
      action: null,
      rawPhase: typeof currentPhase === 'string' ? currentPhase : String(currentPhase),
      valid,
    };
  }
  return {
    recognized: true,
    action: nextActionForPhase(currentPhase, phasesSkipped),
    rawPhase: currentPhase,
    valid,
  };
}

/** Longest raw-phase excerpt echoed back before eliding (`B70`). */
const RAW_PHASE_EXCERPT_MAX = 60;

/**
 * Render the "Work remaining" copy from `describeNextAction` output (`B70`).
 *
 * Recognized phase → the plain command, byte-identical to what callers passed
 * before this existed. Unrecognized → say so, echo what STATE actually holds
 * (collapsed to ONE short line, because the briefing is capped at 50 lines and
 * the real-world value is five paragraphs), and name the seven valid values so
 * the reader can fix it.
 *
 * Rendering nothing was rejected (D-M5E18-5): a field that drifted by accident
 * would look identical to one set deliberately — `B39`'s shape.
 *
 * @param {{recognized: boolean, action: string|null, rawPhase: string, valid: string[]}} desc
 * @returns {string}
 */
export function formatNextActionCopy(desc) {
  if (!desc || typeof desc !== 'object') return '';
  if (desc.recognized) return `Next phase: ${desc.action}`;

  const collapsed = String(desc.rawPhase ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const excerpt =
    collapsed.length > RAW_PHASE_EXCERPT_MAX
      ? `${collapsed.slice(0, RAW_PHASE_EXCERPT_MAX)}…`
      : collapsed;

  return [
    `Next phase: unknown — STATE.md's \`phase\` is not a phase Signal recognizes.`,
    `   STATE.md holds: "${excerpt || '(empty)'}"`,
    `   Valid values: ${desc.valid.join(', ')}.`,
  ].join('\n');
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
 * Render the tier-line body for status/resume, making a per-Epic calibration
 * override VISIBLE (M4.5.E11.S3.t3, FR3). When an Epic is active (strict
 * `currentEpic`) and its effective tier differs from the project default, the
 * shadowing is surfaced — never silent — so a "Tier: SKETCH" line can't be
 * mistaken for the whole project being SKETCH:
 *
 *   SKETCH (Epic M4.5.E11 override; project default FULL)
 *
 * Otherwise (linear mode, no override, non-strict `currentEpic`, matching
 * tiers, or no project context) it returns the bare effective tier — the
 * pre-E11 behaviour, byte-identical.
 *
 * @param {{effectiveTier: string, projectTier?: string|null, currentEpic?: string|null}} opts
 * @returns {string} the tier value to print after "Tier:    "
 */
export function formatTierLine({ effectiveTier, projectTier = null, currentEpic = null } = {}) {
  const epicActive = typeof currentEpic === 'string' && EPIC_ID_STRICT_RE.test(currentEpic);
  if (epicActive && projectTier && projectTier !== effectiveTier) {
    return `${effectiveTier} (Epic ${currentEpic} override; project default ${projectTier})`;
  }
  return effectiveTier;
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
// Superseded as a command call site by `readStateSizeBannerForTier` (M5.E1 FR2d);
// all three commands (status/resume/checkpoint) now use the tier-aware variant.
// Retained as tested public API (flat-threshold), not wired into any command doc.
export function readStateSizeBanner(baseDir) {
  return formatStateSizeBanner(readStateSize(baseDir));
}

/**
 * Tier-aware STATE.md size finding (FR2d, M5.E1.S2). Resolves the project tier
 * from PROFILE.md, maps it to the tier's size threshold, and runs the sync
 * read-only size check against it. This is the async command layer: the profile
 * read lives HERE (not in state.js) because profile.js already imports from
 * state.js — reading the profile from state.js would create an import cycle.
 *
 * Read-only and fail-open — NEVER throws. No/invalid/malformed PROFILE.md →
 * the flat STATE_SIZE_WARN_BYTES default.
 *
 * @param {string} baseDir
 * @returns {Promise<{bytes: number, threshold: number, message: string} | null>}
 */
export async function readStateSizeForTier(baseDir) {
  let threshold = STATE_SIZE_WARN_BYTES;
  try {
    const profile = await readProfile(baseDir);
    threshold = resolveStateSizeThreshold(profile?.tier);
  } catch {
    /* no/invalid PROFILE → flat default (fail-open) */
  }
  return readStateSizeWithThreshold(baseDir, threshold);
}

/**
 * Tier-aware STATE.md size banner (FR2d, M5.E1.S2) — a string or null when the
 * file is under the tier's budget / absent. Read-only, fail-open, never blocks.
 * The tier-aware counterpart to `readStateSizeBanner`.
 *
 * @param {string} baseDir
 * @returns {Promise<string | null>}
 */
export async function readStateSizeBannerForTier(baseDir) {
  return formatStateSizeBanner(await readStateSizeForTier(baseDir));
}

// --- pre-reorg layout-drift banner (M5.E2.S3.t2, FR7.2) — command-path half ----
//
// The COMMAND counterpart to the SessionStart hook (S3.t1). TWO-TIER read (M5.E2
// REVIEW — perf/DoS fix): a CHEAP capped-prefix stamp read first, the migrate
// engine's full structural sniff (`senseProject`) only as the fallback.
//   - CHEAP STAMP SHORT-CIRCUIT — the common already-migrated case. readLayoutBanner
//     runs on every /sig:status AND /sig:resume; calling senseProject UNCONDITIONALLY
//     meant a full `.planning/**/*.md` corpus walk + an uncapped STATE.md read on the
//     two most-run commands — heaviest on exactly the bloated projects this Epic
//     targets, and a mild DoS floor on an adversarial `.planning/`. So readLayoutBanner
//     first reads the SAME 64 KB capped prefix the hook uses (`readCappedPrefix` +
//     `readLayoutStampFromPrefix`, now shared from the dependency-light
//     tools/lib/layout-stamp.js — NOT reached in from hooks/). An integer stamp decides
//     the banner PURELY (stamp < CURRENT → banner, else silent) and returns WITHOUT
//     ever walking the corpus. decideLayoutBanner's integer-stamp branch is reused
//     verbatim, so the short-circuit decision is byte-identical to the old path.
//   - STRUCTURAL-SNIFF FALLBACK — the hook's `decideLayoutDrift` is stamp-first ONLY:
//     a fenced-no-stamp file returns preReorg:true, which would FALSE-banner a project
//     that is already structurally conformant but simply never got stamped. So when the
//     stamp is ABSENT/unparseable, readLayoutBanner falls through to senseProject: no
//     stamp → banner ONLY when there is genuine pending reorg work. The
//     `HOOK_LAYOUT_VERSION === CURRENT_LAYOUT_VERSION` sync assertion stays live in the
//     untouched hook test (and layout-stamp's `LAYOUT_VERSION` is asserted too).
//
// Named DISTINCTLY from the hook's `LAYOUT_DRIFT_BANNER` (the banner TEXT is deliberately
// not shared — sharing it would mean this command path reaching into hooks/, whereas the
// cheap stamp primitives are shared the RIGHT way, via tools/lib/layout-stamp.js). The two
// texts differ by design: the hook adds "then --apply … to the current model", this
// command-path copy is the shorter FR7.2-quoted nudge.
export const LAYOUT_DRIFT_BANNER_COMMAND =
  "Signal: this project's `.planning/` predates the current docs layout — run " +
  '`/sig:docs-migrate` (dry-run first) to reorganize. This is advisory; nothing is blocked.';

/**
 * PURE layout-drift decision. Stamp-first, then structural sniff:
 *   - a stamp AT/AHEAD of CURRENT_LAYOUT_VERSION cannot predate the layout → silent;
 *   - a stamp BELOW CURRENT is unambiguously pre-reorg → banner;
 *   - no / unparseable stamp → banner ONLY when the structure shows genuine pending
 *     reorg work: NOT fully v3-conformant on disk (`v3Conformant` folds in the within-
 *     STATE V1/V2/V3 vectors AND the FR6 file lifecycle — inbox renamed, BACKLOG
 *     present, closed-milestone evict done), OR an un-archived closed scaffold
 *     (`archive.moves`, which v3Conformant does not cover). A fully-v3-structured
 *     unstamped project stays SILENT (the t2-vs-t1 thesis — the stamp-first hook would
 *     false-banner it; and per S6b we don't nag a project that is already on the v3
 *     layout just because it lacks the stamp). `flags` are advisory (soft-long /
 *     milestone-bloat / index-refresh), NOT vectors/moves, so a flags-only project
 *     also stays silent. Deliberately does NOT use `senseProject.noop` (it folds in
 *     `stamped`, which would re-banner every conformant-unstamped project).
 *
 * @param {{stamp: number|null, v3Conformant?: boolean, archive?: {moves?: any[]}}} sensed
 *   — senseProject output (an integer-stamp `{stamp}` short-circuit object also works).
 * @returns {boolean} true ⇒ show the pre-reorg banner.
 */
export function decideLayoutBanner(sensed) {
  const stamp = sensed?.stamp ?? null;
  if (Number.isInteger(stamp)) {
    // Stamped: at/ahead of CURRENT can't predate the layout → silent; older → banner.
    return stamp < CURRENT_LAYOUT_VERSION;
  }
  const structurallyClean =
    sensed?.v3Conformant === true &&
    (sensed?.archive?.moves?.length ?? 0) === 0;
  return !structurallyClean;
}

/**
 * Disk-aware pre-reorg layout banner (FR7.2) — a string or null when the project's
 * `.planning/` is post-reorg / structurally conformant / absent. TWO-TIER for perf
 * (M5.E2 REVIEW): a cheap capped-prefix stamp read first (an integer stamp decides
 * the banner purely and returns WITHOUT the full-corpus `senseProject` walk); only an
 * absent/unparseable stamp falls through to the structural sniff. Read-only and
 * FAIL-OPEN: ANY error (unreadable STATE.md, a parse hiccup in the structural sniff,
 * no `.planning/` at all) degrades to `null` — advisory-only, it MUST NOT break
 * `/sig:status` or `/sig:resume`. Shared by both commands so they show the identical
 * banner (mirrors readSchemaDriftBanner / readStateSizeBannerForTier).
 *
 * @param {string} baseDir
 * @returns {Promise<string | null>}
 */
export async function readLayoutBanner(baseDir) {
  try {
    // Cheap capped-prefix stamp read FIRST (M5.E2 REVIEW). An integer stamp decides
    // the banner purely — the common already-migrated case returns here WITHOUT the
    // full-corpus senseProject walk. decideLayoutBanner({ stamp }) reuses its exact
    // integer-stamp branch (stamp < CURRENT → banner), so the decision is identical.
    const statePath = join(baseDir, '.planning', 'STATE.md');
    if (existsSync(statePath)) {
      const prefix = readCappedPrefix(statePath);
      // Only trust a stamp inside REAL frontmatter (a `^---` opening fence) — the same
      // precondition senseState/splitFrontmatter enforce. This keeps the short-circuit
      // decision identical to the senseProject path for every well-formed file: a stray
      // `docs_layout_version:` line in a non-frontmatter doc falls through to the sniff,
      // exactly as the old unconditional-senseProject path did.
      if (/^---\r?\n/.test(prefix)) {
        const stamp = readLayoutStampFromPrefix(prefix);
        if (Number.isInteger(stamp)) {
          return decideLayoutBanner({ stamp }) ? LAYOUT_DRIFT_BANNER_COMMAND : null;
        }
      }
    }
    // No STATE.md, or an absent/unparseable stamp → the structural-sniff fallback
    // (catches unstamped-but-drifted projects). Unchanged behavior.
    const sensed = await senseProject(baseDir);
    return decideLayoutBanner(sensed) ? LAYOUT_DRIFT_BANNER_COMMAND : null;
  } catch {
    return null; // advisory + fail-open — never break the command
  }
}

// --- tier advisory (B90) ---------------------------------------------------

/**
 * Say, where the user actually is, that rigor can be dialled DOWN per unit.
 *
 * `B90`: Signal has had per-unit tiering, `/sig:escalate`'s de-escalation branch
 * (`escalate.md:87`) and `phases_skipped` for releases — and every surface that
 * introduces them says the dial only turns UP. The command is named *escalate*;
 * `CLAUDE.md` said *"promotes"* and *"upgrades … if scope grows"*. Measured
 * across the local corpus on 2026-08-08: **7 of 12 projects run FULL and exactly
 * 1 of 12 has ever written a per-unit PROFILE.** A real user paid seven-phase
 * FULL ceremony on a two-hour UI fix and concluded Signal has no opinion about
 * types of work.
 *
 * A DOC FIX ALONE WOULD REPEAT THE DEFECT. `UNREACHED-MECHANISM-ANALYSIS.md`'s
 * whole argument is that Signal's habitual answer to *"the rule wasn't followed"*
 * is to write the rule more carefully, and `B75` measured that ceiling
 * (`gate_strictness` light vs strict differ by one boolean; the rest is prose).
 * So this is a check that fires at the moment of use, not a paragraph.
 *
 * Deliberately advisory and NOT a gate: the right tier is a judgment call, and a
 * project legitimately at FULL for everything must not be nagged into lying. It
 * states the situation and the two ways out, once.
 *
 * Read-only, offline, fail-open (any error → `null`).
 *
 * @param {string} baseDir
 * @returns {Promise<string|null>}
 */
export async function readTierAdvisory(baseDir) {
  try {
    const profile = await readProfile(baseDir);
    if (profile?.tier !== 'FULL') return null; // only FULL pays every phase

    const planningDir = join(baseDir, '.planning');
    let names = [];
    try {
      const { readdir } = await import('node:fs/promises');
      names = await readdir(planningDir);
    } catch {
      return null;
    }
    // Any per-unit PROFILE at all means the dial has been found. Say nothing.
    if (names.some((n) => /^.+-PROFILE\.md$/.test(n))) return null;

    return [
      'ℹ This project is FULL tier, and every unit of work is paying all seven phases.',
      '   FULL is a CEILING, not a floor — it was calibrated for the riskiest work here,',
      '   not for every slice. A small, reversible change can run lighter:',
      '     • per unit:  write {UnitID}-PROFILE.md at FEATURE or SKETCH before DISCUSS',
      '     • mid-flight: /sig:escalate also goes DOWN (de-escalation), despite the name',
      '   SKETCH drops REVIEW entirely; SPIKE drops REVIEW and SHIP.',
    ].join('\n');
  } catch {
    return null;
  }
}

/**
 * Say, where a person actually looks, how many queued decisions are unanswered.
 *
 * `B113`'s neighbour, and the third instance of one shape in one area. The
 * decision queue (`drive.js` — `queueDecision`, `readQueue`) has existed since
 * `v0.1.31` and its only callers are `tests/drive.test.js`. `drive.md` reports
 * the queue at the start of a run, which is the one moment a person is already
 * looking at the loop; nothing reports it at the moments a person is *orienting*
 * (`/sig:status`, `/sig:resume`), which is where an accumulating queue would
 * actually be noticed.
 *
 * That matters because of what the queue measures. Its own header says it: a
 * queue growing faster than it is drained means the attention setting is wrong
 * for this project. That is a signal about the operator's configuration, not a
 * backlog — and a signal nothing renders is not a signal.
 *
 * Deliberately ADVISORY, never a gate. An unanswered queue is not an error; it
 * is a fact about a run that already completed. Blocking on it would punish the
 * exact workflow the queue exists to enable.
 *
 * ⚠ Since `M6.E6` the write half has a caller: `/sig:drive` routes a mid-run
 * gray-area decision and parks what it may not adopt. So `all answered` now
 * means what it says.
 *
 * Read-only, offline, fail-open (any error → `null`).
 *
 * @param {string} baseDir
 * @returns {Promise<string|null>}
 */
export async function readQueueAdvisory(baseDir) {
  try {
    const { readQueue } = await import('./drive.js');
    const { entries, unanswered } = await readQueue(baseDir);
    // No file and no entries: the queue has never been used here. Silence is
    // correct — this must not read as "0 of 0 answered", which implies a run.
    if (!entries.length) return null;
    if (unanswered === 0) {
      return `ℹ Decision queue: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}, all answered.`;
    }
    return [
      `⚠ Decision queue: ${unanswered} unanswered of ${entries.length}.`,
      '   These are decisions a run reached, did not guess at, and parked for you.',
      '   Nothing in them has been acted on. Answer them in .planning/DECISION-QUEUE.md.',
      '   A queue growing faster than you drain it means the attention setting is',
      '   wrong for this project — that is the measurement it exists to produce.',
    ].join('\n');
  } catch {
    return null;
  }
}
