// tools/lib/retro-index.js — RETROSPECTIVES.md index helpers (M4.5.E9.S2.t1).
//
// Enumerate retro files via path-agnostic glob (per A3 — generalizes for the
// M5.E1 wiki restructure that may relocate retros into a subdirectory) and
// classify each as stub-vs-complete by [FILL IN] marker presence.

import { readFile, stat } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';

/**
 * Is this retro a stub (un-filled)? Heuristic: any `[FILL IN` substring in
 * the content signals an unfilled section. Conservative: false-positives
 * (marking a real retro as stub because the user kept the literal text in
 * a quoted example) are mild — the index just shows "stub" status, which
 * the user can override by editing the marker.
 *
 * @param {string} content
 * @returns {boolean}
 */
export function isStubRetro(content) {
  if (!content || content.length === 0) return false;
  return /\[FILL IN/i.test(content);
}

/**
 * Walk `.planning/` (recursively) and return one record per `*-RETROSPECTIVE.md`
 * file, sorted by Epic ID ascending. Records:
 *
 *   {
 *     epicId: 'M4.5.E1',              // parsed from filename
 *     path: '.planning/M4.5.E1-RETROSPECTIVE.md',
 *     isStub: true,                   // per isStubRetro
 *     lastModified: Date,             // file mtime
 *   }
 *
 * @param {string} baseDir
 * @returns {Promise<Array<{epicId: string, path: string, isStub: boolean, lastModified: Date}>>}
 */
export async function enumerateRetros(baseDir) {
  const planningDir = join(baseDir, '.planning');

  let files;
  try {
    files = await walkForRetros(planningDir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }

  const records = [];
  for (const fullPath of files) {
    const name = basename(fullPath);
    const epicId = parseEpicIdFromFilename(name);
    if (!epicId) continue;
    let content = '';
    let mtime = new Date(0);
    try {
      content = await readFile(fullPath, 'utf-8');
      const st = await stat(fullPath);
      mtime = st.mtime;
    } catch {
      continue;
    }
    records.push({
      epicId,
      path: relative(baseDir, fullPath),
      isStub: isStubRetro(content),
      lastModified: mtime,
    });
  }

  // Sort by Epic ID ascending (M{n}.{n}.E{n} ordering).
  records.sort((a, b) => epicIdCompare(a.epicId, b.epicId));
  return records;
}

// ---- internals ----

async function walkForRetros(dir) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return results;
    throw err;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkForRetros(fullPath);
      results.push(...nested);
    } else if (entry.isFile() && /-RETROSPECTIVE\.md$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function parseEpicIdFromFilename(filename) {
  // Match M{n}(.{n})*.E{n} prefix, stop at -RETROSPECTIVE.md.
  const m = filename.match(/^(M\d+(?:\.\d+)*\.E\d+)-RETROSPECTIVE\.md$/);
  return m ? m[1] : null;
}

function epicIdCompare(a, b) {
  // Compare segment-by-segment numerically. e.g., M4.5.E1 < M4.5.E2 < M4.5.E10.
  const numsA = a.match(/\d+/g)?.map(Number) ?? [];
  const numsB = b.match(/\d+/g)?.map(Number) ?? [];
  const len = Math.max(numsA.length, numsB.length);
  for (let i = 0; i < len; i++) {
    const da = numsA[i] ?? 0;
    const db = numsB[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}
