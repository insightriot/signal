#!/usr/bin/env node

// tools/backfill-retros.js — M4.5.E9.S1.t8 (and S1.t9 stub-gen extension).
//
// One-shot CLI that backfills `RETROSPECTIVE.md` stubs for already-shipped
// Epics. S1.t8 lands the Epic-enumeration + commit-range scan; S1.t9 will
// add stub-write logic on top.
//
// Design constraints:
//   - Pure parsers (parseEpicStatuses, parseCommitLog) are filesystem-free
//     and git-free for unit testability.
//   - I/O wrappers (enumerateEpics, commitRangeForEpic) accept dependency
//     injection so tests can stub git without setting up fixture repos.
//   - Commit-range scan uses --grep against the established commit-message
//     convention (e.g., `M4.5.E3 DISCUSS: ...`, `M4.5.E3.S2.t7: SHIP ...`).
//     Path-filter fallback was on the table per PLAN but isn't needed yet;
//     adding when an Epic actually fails the convention test.

import { readFile, access } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

import {
  parseSections,
  getRequiredSections,
  deriveRetroPath,
  loadTemplate,
} from './lib/retrospective.js';
import { atomicWrite } from './lib/atomic-write.js';

// ----- Epic enumeration -----

/**
 * Parse a MILESTONE-{N}.md status-snapshot table into per-Epic records.
 *
 * @param {string} milestoneContent — full file contents
 * @param {object} opts
 * @param {string} opts.milestonePrefix — e.g., "M4.5" (used to namespace IDs)
 * @param {string|null} [opts.currentEpicId] — exclude this Epic (it's in-flight)
 * @returns {Array<{epicId: string, num: number, status: string, shipped: true, partial: boolean}>}
 */
export function parseEpicStatuses(milestoneContent, opts) {
  if (!opts || !opts.milestonePrefix) {
    throw new Error(
      'parseEpicStatuses: milestonePrefix is required (e.g., "M4.5")',
    );
  }
  const { milestonePrefix, currentEpicId = null } = opts;

  const lines = milestoneContent.split('\n');
  const epics = [];

  for (const line of lines) {
    // Table rows lead with `| ` and (after optional `**`) carry `E{N} — ...`
    // in column 1. Column 2 is the status string. Column 3+ are notes.
    const match = line.match(
      /^\|\s*\*{0,2}(E(\d+))\b[^|]*\|([^|]+)\|/,
    );
    if (!match) continue;

    const epicId = `${milestonePrefix}.${match[1]}`;
    if (currentEpicId && epicId === currentEpicId) continue;

    const num = parseInt(match[2], 10);
    const statusRaw = match[3].trim();

    // "shipped" must appear somewhere — full-shipped Epics show "✓ shipped",
    // partial Epics show "S1 shipped" / "Phase A shipped" etc.
    const shipped = /\bshipped\b/i.test(statusRaw);
    if (!shipped) continue;

    // Partial if any slice / portion is still pending or shelved.
    const partial = /\b(pending|shelved)\b/i.test(statusRaw);

    epics.push({ epicId, num, status: statusRaw, shipped: true, partial });
  }

  return epics;
}

/**
 * Read MILESTONE-{N}.md from disk and parse Epic statuses.
 * Filename derives from prefix: "M4.5" → "MILESTONE-4.5.md".
 *
 * @param {string} baseDir
 * @param {string} milestonePrefix
 * @param {string|null} currentEpicId
 */
export async function enumerateEpics(baseDir, milestonePrefix, currentEpicId) {
  const milestoneNum = milestonePrefix.replace(/^M/, '');
  const milestonePath = join(
    baseDir,
    '.planning',
    `MILESTONE-${milestoneNum}.md`,
  );
  const content = await readFile(milestonePath, 'utf-8');
  return parseEpicStatuses(content, { milestonePrefix, currentEpicId });
}

// ----- Commit-range scan -----

/**
 * Find the first + last commit whose subject line begins with the Epic ID.
 *
 * @param {string} epicId — e.g., "M4.5.E3"
 * @param {{runGit?: (args: string[]) => string}} [opts]
 * @returns {{first: string|null, last: string|null, count: number, missing: boolean}}
 */
export function commitRangeForEpic(epicId, opts = {}) {
  const runGit = opts.runGit ?? defaultRunGit;

  // Escape dots so `M4.5.E1` doesn't accidentally match `M4X5XE1` (any char).
  const escaped = epicId.replace(/\./g, '\\.');
  const pattern = `^${escaped}`;

  const stdout = runGit([
    'log',
    '--reverse',
    '--format=%h %s',
    `--grep=${pattern}`,
    '--extended-regexp',
  ]);

  // --grep matches the full commit message, so subject-line filtering is
  // needed: a commit whose body mentions e.g. "M4.5.E2 precedent" but whose
  // subject starts with "M4.5.E7" would otherwise be wrongly attributed.
  // Surfaced in M4.5.E9 dry-run against real history (755dabe matched the
  // E2 grep via its body, not subject).
  const subjectRe = new RegExp(`^[0-9a-f]+ ${escaped}(?:[\\s\\.:]|$)`);
  const lines = stdout
    .split('\n')
    .filter((l) => l.length > 0)
    .filter((l) => subjectRe.test(l));
  if (lines.length === 0) {
    return { first: null, last: null, count: 0, missing: true };
  }

  const first = lines[0].split(' ')[0];
  const last = lines[lines.length - 1].split(' ')[0];
  return { first, last, count: lines.length, missing: false };
}

function defaultRunGit(args) {
  // Shell out via execSync. Args are individually shell-escaped.
  const shellArgs = args
    .map((a) => `'${String(a).replace(/'/g, "'\\''")}'`)
    .join(' ');
  return execSync(`git ${shellArgs}`, { encoding: 'utf-8' });
}

// ----- Artifact enumeration -----

// The artifact set Signal Epics conventionally produce. Order matters: the
// stub's Links section lists them in this order, matching reader expectations.
const ARTIFACT_KINDS = [
  { label: 'Requirements', suffix: 'REQUIREMENTS' },
  { label: 'Research', suffix: 'RESEARCH' },
  { label: 'Plan', suffix: 'PLAN' },
  { label: 'Validation', suffix: 'VALIDATION' },
  { label: 'Progress', suffix: 'PROGRESS' },
  { label: 'Verification', suffix: 'VERIFICATION' },
  { label: 'Review', suffix: 'REVIEW' },
];

/**
 * Discover which standard Epic artifacts exist on disk for a given Epic ID.
 *
 * @param {string} baseDir
 * @param {string} epicId — e.g., "M4.5.E3"
 * @returns {Promise<Array<{label: string, path: string}>>}
 */
export async function enumerateEpicArtifacts(baseDir, epicId) {
  const found = [];
  for (const kind of ARTIFACT_KINDS) {
    const path = `.planning/${epicId}-${kind.suffix}.md`;
    try {
      await access(join(baseDir, path));
      found.push({ label: kind.label, path });
    } catch {
      // skip
    }
  }
  return found;
}

// ----- Stub composition -----

/**
 * Render the stub `RETROSPECTIVE.md` body for an Epic. Uses the FULL-tier
 * template (per D-E9-7: all backfilled Epics use FULL since the project
 * itself is FULL tier).
 *
 * The Links section is pre-populated with auto-extracted artifact paths +
 * commit range. All other sections retain their `[FILL IN]` markers.
 *
 * A title heading + generation stamp + (optional) partial-Epic warning
 * precede the template content.
 *
 * @param {string} epicId
 * @param {object} opts
 * @param {string} opts.baseDir
 * @param {boolean} opts.partial
 * @param {string} opts.today — ISO date string (YYYY-MM-DD)
 * @param {Array<{label: string, path: string}>} opts.artifactPaths
 * @param {{first: string|null, last: string|null, count: number, missing: boolean} | null} opts.commitRange
 * @returns {Promise<string>}
 */
export async function composeStub(epicId, opts) {
  const { baseDir, partial, today, artifactPaths, commitRange } = opts;

  const template = await loadTemplate('FULL', baseDir);
  const { headings, sectionsByHeading } = parseSections(template);

  // Override the Links section body with auto-populated content. The retro
  // file lives at .planning/{epicId}-RETROSPECTIVE.md per D-E9-6 (flat
  // convention), so sibling artifacts are referenced as bare filenames.
  // The `.planning/`-prefixed path is preserved as the human-readable link
  // text so readers see the canonical address even though the link itself
  // is the sibling resolution.
  const linksLines = [];
  for (const a of artifactPaths) {
    const filename = a.path.replace(/^\.planning\//, '');
    linksLines.push(`- ${a.label}: [\`${a.path}\`](${filename})`);
  }
  if (commitRange && !commitRange.missing) {
    linksLines.push(
      `- Commit range: \`${commitRange.first}..${commitRange.last}\` (${commitRange.count} commits)`,
    );
  }
  if (linksLines.length === 0) {
    linksLines.push('[FILL IN — no auto-extractable artifact links found]');
  }
  const newBodies = {
    ...sectionsByHeading,
    '## Links': '\n' + linksLines.join('\n') + '\n',
  };

  // Reassemble: heading + blank line + body. parseSections strips the
  // heading's trailing newline (split('\n') drops it), so we re-insert one
  // here to preserve the canonical heading-then-blank-line spacing.
  const sectionsMd = headings
    .map((h) => `${h}\n${newBodies[h]}`)
    .join('\n');

  const header = formatStubHeader(epicId, today, partial);
  return `${header}\n\n${sectionsMd}`;
}

function formatStubHeader(epicId, today, partial) {
  const title = `# ${epicId} Retrospective`;
  const stamp =
    `> _Stub generated ${today} by M4.5.E9 backfill. Fill in opportunistically — index in \`RETROSPECTIVES.md\` surfaces stub-vs-complete status._`;
  if (!partial) return `${title}\n\n${stamp}`;
  const partialNote =
    `> **Epic incomplete as of backfill date ${today}.** This retro covers shipped slices only. When remaining slices ship, either extend this retro with a continuation section or close it and open a follow-on.`;
  return `${title}\n\n${stamp}\n\n${partialNote}`;
}

// ----- Backfill orchestration + idempotency -----

/**
 * Heuristic for AC13: is this retro file edited beyond the initial stub?
 * Returns true when the file looks like it has substantive user content.
 *
 * Heuristic (per PLAN S1.t9 spec):
 *   - File size > 2× a fresh FULL-template stub (~3000B baseline) — substantial content added
 *   - OR `[FILL IN]` count is below the FULL template's marker count (some markers replaced)
 *
 * Conservative: false-positives (treating a stub as "edited" and skipping)
 * are OK; false-negatives (overwriting a user's real retro) are catastrophic.
 *
 * @param {string} content
 * @param {string} freshStubReference
 * @returns {boolean}
 */
function looksEdited(content, freshStubReference) {
  const fillInCount = (s) => (s.match(/\[FILL IN/g) ?? []).length;
  const currentFills = fillInCount(content);
  const baselineFills = fillInCount(freshStubReference);
  if (currentFills < baselineFills) return true;
  const sizeRatio = content.length / Math.max(freshStubReference.length, 1);
  return sizeRatio > 2.0;
}

/**
 * Enumerate + generate + write stubs for every shipped Epic in a milestone.
 *
 * @param {string} baseDir
 * @param {string} milestonePrefix — e.g., "M4.5"
 * @param {object} opts
 * @param {string|null} opts.currentEpicId
 * @param {string} opts.today — ISO date string
 * @param {(args: string[]) => string} [opts.runGit]
 * @param {boolean} [opts.dryRun] — if true, return planned writes without touching disk
 * @param {boolean} [opts.force] — if true, regenerate stubs over existing files unless looksEdited
 * @returns {Promise<Array<{epicId: string, path: string, status: 'written'|'skipped'|'planned'|'error', reason?: string, content?: string}>>}
 */
export async function backfillMilestone(baseDir, milestonePrefix, opts) {
  const {
    currentEpicId,
    today,
    runGit,
    dryRun = false,
    force = false,
  } = opts ?? {};

  const epics = await enumerateEpics(baseDir, milestonePrefix, currentEpicId);
  const results = [];

  for (const epic of epics) {
    const retroPath = deriveRetroPath(epic.epicId);
    const fullPath = join(baseDir, retroPath);

    // Build the stub content.
    const artifactPaths = await enumerateEpicArtifacts(baseDir, epic.epicId);
    const commitRange = commitRangeForEpic(epic.epicId, { runGit });
    const stubContent = await composeStub(epic.epicId, {
      baseDir,
      partial: epic.partial,
      today,
      artifactPaths,
      commitRange,
    });

    // Idempotency + AC13 check.
    let existing = null;
    try {
      existing = await readFile(fullPath, 'utf-8');
    } catch {
      // File doesn't exist — proceed to write.
    }

    if (existing !== null) {
      if (!force) {
        results.push({
          epicId: epic.epicId,
          path: retroPath,
          status: 'skipped',
          reason: 'file exists (re-run is a no-op)',
        });
        continue;
      }
      // force=true: still skip if user-edited content detected.
      if (looksEdited(existing, stubContent)) {
        results.push({
          epicId: epic.epicId,
          path: retroPath,
          status: 'skipped',
          reason: 'file appears edited (user content detected; --force respected)',
        });
        continue;
      }
    }

    if (dryRun) {
      results.push({
        epicId: epic.epicId,
        path: retroPath,
        status: 'planned',
        content: stubContent,
      });
      continue;
    }

    try {
      await atomicWrite(fullPath, stubContent);
      results.push({
        epicId: epic.epicId,
        path: retroPath,
        status: 'written',
      });
    } catch (err) {
      results.push({
        epicId: epic.epicId,
        path: retroPath,
        status: 'error',
        reason: err.message,
      });
    }
  }

  return results;
}

// ----- CLI -----

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

async function main(argv) {
  const args = argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  // Default milestone prefix is M4.5 (E9's backfill scope); future
  // invocations can pass --milestone Mx.y to override.
  let milestonePrefix = 'M4.5';
  const idx = args.indexOf('--milestone');
  if (idx >= 0 && args[idx + 1]) milestonePrefix = args[idx + 1];

  // Read STATE.md current_epic to exclude the in-flight Epic.
  let currentEpicId = null;
  try {
    const stateContent = await readFile('.planning/STATE.md', 'utf-8');
    const m = stateContent.match(/^current_epic:\s*(\S+)$/m);
    if (m && m[1] !== 'null') currentEpicId = m[1];
  } catch {
    // No STATE.md — treat as null current_epic.
  }

  const results = await backfillMilestone('.', milestonePrefix, {
    currentEpicId,
    today: isoToday(),
    dryRun,
    force,
  });

  if (dryRun) {
    console.log(
      `# Dry-run backfill report — ${milestonePrefix} as of ${isoToday()}\n`,
    );
    console.log(`Planned writes: ${results.length}\n`);
    for (const r of results) {
      console.log(`## ${r.epicId} → ${r.path}\n`);
      console.log('```markdown');
      console.log(r.content?.slice(0, 1500) ?? '(no content)');
      console.log('```\n');
    }
  } else {
    let written = 0;
    let skipped = 0;
    let errored = 0;
    for (const r of results) {
      const tag =
        r.status === 'written' ? '✓ WROTE'
        : r.status === 'skipped' ? '· skipped'
        : '✗ ERROR';
      console.log(
        `${tag.padEnd(10)} ${r.epicId}${r.reason ? ` (${r.reason})` : ''}`,
      );
      if (r.status === 'written') written++;
      else if (r.status === 'skipped') skipped++;
      else errored++;
    }
    console.log(
      `\nSummary: ${written} written, ${skipped} skipped, ${errored} errored.`,
    );
    if (errored > 0) process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv).catch((err) => {
    console.error('backfill-retros: fatal', err);
    process.exit(1);
  });
}
