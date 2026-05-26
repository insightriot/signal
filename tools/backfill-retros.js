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

import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

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
    '--format=%H %s',
    `--grep=${pattern}`,
    '--extended-regexp',
  ]);

  const lines = stdout.split('\n').filter((l) => l.length > 0);
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

// ----- CLI -----
// The CLI surface lands in S1.t9 (stub generation). S1.t8 ships the library
// only; running this file directly is a no-op pending the stub-gen logic.
//
// Detect direct invocation; future S1.t9 main() goes here.
if (import.meta.url === `file://${process.argv[1]}`) {
  console.error(
    'backfill-retros.js: CLI not yet implemented (S1.t9 lands stub generation). Library exports only.',
  );
  process.exit(1);
}
