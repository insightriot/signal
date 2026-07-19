// tools/lib/planning-index.js — the auto-generated `/sig:index` generator
// (M5.E3.S2 / FR3).
//
// Retires hand-curation of `.planning/INDEX.md`. The generator walks the corpus,
// classifies each doc mechanically, re-attaches hand-curated annotations by key
// (the same survive-by-ID pattern `retro-index.js` uses for RETROSPECTIVES.md),
// and render-then-compares before writing so a no-op run is a true no-op.
//
// It is the load-bearing traversal layer for FR5 (append-log eviction): a
// thorough index makes archived DECISIONS blocks findable, so closed content can
// move to archives without being lost. The programmatic D-ID → home map lives
// alongside (t5) — that is what FR5 consumes at eviction time.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { classifyDocGrowthPolicy } from './migrate-memory.js';

const PLANNING_DIR = '.planning';

// A retrospective doc — the traceability-spine per-Epic files. Reuse the exact
// suffix anchor `retro-index.js` uses: `RETROSPECTIVES.md` (the append-log INDEX
// of retros) must NOT match, only `*-RETROSPECTIVE.md`.
const RETROSPECTIVE_RE = /-RETROSPECTIVE\.md$/;

/**
 * Walk `.planning/` (recursively, incl. `archive/`) and return one mechanical
 * record per `.md` doc, sorted by path ascending. Deterministic — sorted by the
 * unique path, never by mtime. Records:
 *
 *   {
 *     path: '.planning/DECISIONS.md',  // POSIX-relative to baseDir
 *     tier: 'COLD' | 'LIVE',           // COLD = under archive/ OR *-RETROSPECTIVE.md
 *     growthPolicy: 'append-log'|'spine'|'milestone'|'other',
 *     bytes: 42,                        // content length (deterministic)
 *   }
 *
 * @param {string} baseDir  project root (where `.planning/` lives)
 * @returns {Promise<Array<{path: string, tier: 'COLD'|'LIVE', growthPolicy: string, bytes: number}>>}
 */
export async function enumeratePlanningDocs(baseDir) {
  const planningDir = join(baseDir, PLANNING_DIR);
  const files = await walkMarkdown(planningDir);

  const records = [];
  for (const full of files) {
    const rel = full.slice(baseDir.length + 1).split('\\').join('/');
    const name = rel.split('/').pop();
    let bytes = 0;
    try {
      const content = await readFile(full, 'utf-8');
      bytes = content.length;
    } catch {
      // Vanished between walk and read — skip it.
      continue;
    }
    const isCold = rel.includes('/archive/') || RETROSPECTIVE_RE.test(name);
    records.push({
      path: rel,
      tier: isCold ? 'COLD' : 'LIVE',
      growthPolicy: classifyDocGrowthPolicy(name),
      bytes,
    });
  }

  records.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return records;
}

// ---- internals ----

/**
 * Recursively collect `*.md` file paths under `dir`. Missing dir → `[]`.
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function walkMarkdown(dir) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return results;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkMarkdown(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}
