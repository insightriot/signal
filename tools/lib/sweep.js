// tools/lib/sweep.js — the read-only /sig:sweep check library (M5.E6 FR1/FR2).
//
// A set of deterministic, OFFLINE, READ-ONLY checks that /sig:sweep runs over the
// INVOKING project (`process.cwd()`, never hard-coded Signal paths) to surface doc
// rot. Each check returns findings shaped `{check, severity, file, message}` with
// severity ∈ 'structural' (the things the test-suite guard hard-fails on) |
// 'advisory' (nudges — bloat, stale inbox). Nothing here writes.
//
// The portable checks live here (meaningful in any Signal-managed repo). The
// stale-inbox check deliberately lives in THIS module, not doc-hygiene.js, so the
// standing guard's meta-test (which forbids inbox-name tokens in doc-hygiene.js
// source) stays green (AD3).

import { readFile } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join } from 'node:path';

import {
  enumeratePlanningDocs,
  parseExistingAnnotations,
  renderPlanningIndex,
  isForeignIndexFormat,
} from './planning-index.js';
import { resolveInboxPath } from './inbox-path.js';
import { listDrainCandidatesWithRecovery } from './drain.js';
import { listCommands } from './roster.js';
import { parseFrontmatter, StateSchemaError } from './state.js';

const PLANNING_DIR = '.planning';

const mkFinding = (check, severity, file, message) => ({ check, severity, file, message });

// Stable finding order for deterministic reports (mirrors doc-hygiene.js's
// findingCmp): by check, then file, then message.
const findingCmp = (a, b) =>
  a.check.localeCompare(b.check) || a.file.localeCompare(b.file) || a.message.localeCompare(b.message);

/**
 * `.planning/INDEX.md` freshness (portable, AC2.1). Composes the EXPECTED index
 * via the pure `enumeratePlanningDocs` → `parseExistingAnnotations(on-disk)` →
 * `renderPlanningIndex` path and diffs it against the on-disk INDEX.md — it NEVER
 * calls the writing Core (`regeneratePlanningIndexCore` atomic-writes on drift),
 * so a sweep run stays read-only (AC1.5).
 *
 * Gating (AD5, stranger-repo noise suppression): drift is STRUCTURAL only for a
 * Signal-managed INDEX (one the round-trip parser can read — `isForeignIndexFormat`
 * stands in for AD5's "carries the autogen marker" condition, since the marker
 * const is not exported). A foreign/hand-written INDEX, an absent INDEX, or an
 * empty INDEX → ADVISORY, never structural.
 *
 * @param {string} baseDir — project root (where `.planning/` lives)
 * @returns {Promise<Array<{check: string, severity: string, file: string, message: string}>>}
 */
export async function checkIndexFreshness(baseDir) {
  const rel = PLANNING_DIR + '/INDEX.md';
  const indexPath = join(baseDir, PLANNING_DIR, 'INDEX.md');

  let existing = null;
  try {
    existing = await readFile(indexPath, 'utf-8');
  } catch {
    existing = null; // absent
  }

  // Absent or empty → advisory (nothing to diff; a fresh repo just hasn't run
  // /sig:index yet). Empty is treated like absent per AD5's "absent → advisory".
  if (existing === null || existing.trim() === '') {
    return [mkFinding('index-freshness', 'advisory', rel, 'no INDEX.md present — run /sig:index to generate it')];
  }

  // Foreign / hand-written → advisory (regenerating would clobber curated content;
  // not this repo's managed index).
  if (isForeignIndexFormat(existing)) {
    return [
      mkFinding('index-freshness', 'advisory', rel, 'INDEX.md is a foreign/hand-written format — not auto-managed'),
    ];
  }

  // Managed index: compose the expected content (pure) and diff.
  const docs = await enumeratePlanningDocs(baseDir);
  const annotations = parseExistingAnnotations(existing);
  const expected = renderPlanningIndex(docs, annotations);

  if (expected !== existing) {
    return [mkFinding('index-freshness', 'structural', rel, 'INDEX.md is stale — regenerate with /sig:index')];
  }
  return [];
}

/**
 * Stale-inbox nudge (portable, advisory — AC2.2). Counts the undrained entries in
 * the capture inbox (resolved by `resolveInboxPath` so a legacy or v3 repo both
 * work — no inbox-name literal here) using the same `listDrainCandidatesWithRecovery`
 * count `/sig:plan` surfaces, and reports "consider draining" when N > 0. Never
 * structural; a missing inbox (or zero undrained entries) yields no finding.
 *
 * @param {string} baseDir — project root (where `.planning/` lives)
 * @returns {Promise<Array<{check: string, severity: string, file: string, message: string}>>}
 */
export async function checkStaleInbox(baseDir) {
  const inboxRel = resolveInboxPath(baseDir);
  let content;
  try {
    content = await readFile(join(baseDir, inboxRel), 'utf-8');
  } catch {
    return []; // no inbox → nothing to nudge
  }
  const n = listDrainCandidatesWithRecovery(content).candidates.length;
  if (n > 0) {
    return [
      mkFinding('stale-inbox', 'advisory', inboxRel, `inbox has ${n} undrained ${n === 1 ? 'entry' : 'entries'} — consider draining`),
    ];
  }
  return [];
}

// CLAUDE.md bloat threshold (AD6). A COARSE advisory nudge — NOT the STATE size
// threshold (STATE accretes history; CLAUDE.md loads every turn, so it must stay
// lean). PLAN-set default; revisitable in VERIFY if dogfooding shows noise.
export const CLAUDE_MD_BLOAT_BYTES = 40 * 1024;

/**
 * CLAUDE.md bloat nudge (portable, advisory — AC2.3). A CLAUDE.md whose size
 * exceeds `CLAUDE_MD_BLOAT_BYTES` yields an advisory; under the threshold (or a
 * missing file — a stranger repo may have none) yields no finding. Coarse and
 * size-only; never structural, never throws.
 *
 * @param {string} baseDir — project root
 * @returns {Array<{check: string, severity: string, file: string, message: string}>}
 */
export function checkClaudeMdBloat(baseDir) {
  let size;
  try {
    size = statSync(join(baseDir, 'CLAUDE.md')).size;
  } catch {
    return []; // no CLAUDE.md → nothing to nudge
  }
  if (size > CLAUDE_MD_BLOAT_BYTES) {
    return [
      mkFinding('claude-md-bloat', 'advisory', 'CLAUDE.md', `CLAUDE.md is ${size} bytes (over the ${CLAUDE_MD_BLOAT_BYTES}-byte nudge threshold) — consider de-bloating`),
    ];
  }
  return [];
}

/**
 * Command-frontmatter freshness (Signal-only, structural — AC2.4). Every
 * `commands/*.md` must carry YAML frontmatter with a present, non-empty
 * `description`. Enumerates the roster via `listCommands`, parses each file's
 * frontmatter with the shared `parseFrontmatter`, and flags:
 *   - no frontmatter at all (`data === null`);
 *   - a missing/empty `description`;
 *   - malformed frontmatter YAML — `parseFrontmatter` throws `StateSchemaError`
 *     (invalid YAML OR a non-mapping frontmatter); it is CAUGHT and emitted as a
 *     finding so a single broken command never crashes the whole sweep.
 *
 * Signal-only: `runSweep` runs this only under the plugin.json gate (a stranger
 * repo has no command roster). A missing `commands/` dir yields no finding.
 *
 * @param {string} baseDir — project root (where `commands/` lives)
 * @returns {Promise<Array<{check: string, severity: string, file: string, message: string}>>}
 */
export async function checkCommandFrontmatter(baseDir) {
  const findings = [];
  for (const rel of listCommands(baseDir)) {
    let raw;
    try {
      raw = await readFile(join(baseDir, rel), 'utf-8');
    } catch {
      continue; // listed but unreadable (race) — not our failure mode
    }
    let data;
    try {
      ({ data } = parseFrontmatter(raw));
    } catch (err) {
      if (err instanceof StateSchemaError) {
        // Stable message (no embedded parser detail) so two runs are byte-identical.
        findings.push(mkFinding('command-frontmatter', 'structural', rel, 'malformed frontmatter (invalid YAML)'));
        continue;
      }
      throw err;
    }
    if (data === null) {
      findings.push(mkFinding('command-frontmatter', 'structural', rel, 'missing frontmatter'));
      continue;
    }
    const desc = data.description;
    if (desc === undefined || desc === null || String(desc).trim() === '') {
      findings.push(mkFinding('command-frontmatter', 'structural', rel, 'frontmatter description is missing or empty'));
    }
  }
  return findings.sort(findingCmp);
}
