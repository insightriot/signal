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
import { join } from 'node:path';

import {
  enumeratePlanningDocs,
  parseExistingAnnotations,
  renderPlanningIndex,
  isForeignIndexFormat,
} from './planning-index.js';

const PLANNING_DIR = '.planning';

const mkFinding = (check, severity, file, message) => ({ check, severity, file, message });

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
