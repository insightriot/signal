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
// Same suffix, with an Epic-ID capture (drives the ledger keyspace).
const RETRO_EPIC_RE = /^(M\d+(?:\.\d+)*\.E\d+)-RETROSPECTIVE\.md$/;

// The placeholder emitted for a doc/Epic with no curated note. Parsed back as
// "no annotation" so a re-render re-emits it — keeping the parse↔render fixpoint.
const PLACEHOLDER_NOTE = '_(note pending)_';

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

// ---- annotation parse (t3) --------------------------------------------------

/**
 * Parse hand-curated notes out of an existing `INDEX.md`, generalizing
 * `retro-index.js:parseExistingHooks` to the generator's TWO keyspaces plus the
 * tier legend:
 *
 *   - `byPath`  — `{ '<key>': '<note>' }` from the tier-table rows (Live / Cold).
 *                 The key is the row's link target (path relative to `.planning/`,
 *                 e.g. `DECISIONS.md` or `archive/M4.5/E1/M4.5.E1-PLAN.md`).
 *   - `byEpic`  — `{ '<EpicId>': '<note>' }` from the Epic-ledger rows.
 *   - `legend`  — the `**Tier legend:**` block text (through the next `---`),
 *                 or `null` when absent.
 *
 * Keyspaces are section-scoped (tracked by heading) so a Cold row for
 * `M5.E1-RETROSPECTIVE.md` (whose key starts with an Epic ID) can never be
 * mis-attributed to the Epic ledger. A note equal to the placeholder is treated
 * as "no annotation" (not stored) — that is what keeps the fixpoint stable.
 * Continuation lines (indented, no leading `- `) append to the running note.
 *
 * @param {string|null|undefined} content
 * @returns {{byPath: Record<string,string>, byEpic: Record<string,string>, legend: string|null}}
 */
export function parseExistingAnnotations(content) {
  const out = { byPath: {}, byEpic: {}, legend: null };
  if (!content) return out;

  const lines = content.split('\n');
  // section ∈ 'legend' | 'paths' | 'ledger' | null
  let section = null;
  let legendLines = null; // array while capturing, else null
  let running = null; // { space: 'paths'|'ledger', key } for continuation lines

  const flushLegend = () => {
    if (legendLines) {
      // Trim trailing blank lines from the captured block.
      while (legendLines.length && legendLines[legendLines.length - 1].trim() === '') {
        legendLines.pop();
      }
      out.legend = legendLines.join('\n');
      legendLines = null;
    }
  };

  for (const line of lines) {
    // --- legend capture ---
    if (legendLines) {
      if (/^-{3,}\s*$/.test(line)) {
        flushLegend();
        section = null;
        continue;
      }
      legendLines.push(line);
      continue;
    }
    if (/^\*\*Tier legend:\*\*\s*$/.test(line)) {
      legendLines = [];
      running = null;
      continue;
    }

    // --- section headings ---
    if (/^#{1,6}\s/.test(line)) {
      running = null;
      if (/Epic ledger/i.test(line)) section = 'ledger';
      else if (/\bLive\b|\bCold\b/i.test(line)) section = 'paths';
      else section = null;
      continue;
    }

    // --- rows in the path keyspace ---
    if (section === 'paths') {
      const m = line.match(/^- \[([^\]]+)\]\(([^)]+)\)\s+—\s+`[^`]*`\s+—\s+(.*)$/);
      if (m) {
        const key = m[2];
        const note = m[3];
        running = null;
        if (note !== PLACEHOLDER_NOTE) {
          out.byPath[key] = note;
          running = { space: 'paths', key };
        }
        continue;
      }
    }

    // --- rows in the Epic-ID keyspace ---
    if (section === 'ledger') {
      const m = line.match(/^- \[(M\d+(?:\.\d+)*\.E\d+)\]\([^)]+\)\s+—\s+(.*)$/);
      if (m) {
        const epicId = m[1];
        const note = m[2];
        running = null;
        if (note !== PLACEHOLDER_NOTE) {
          out.byEpic[epicId] = note;
          running = { space: 'ledger', key: epicId };
        }
        continue;
      }
    }

    // --- continuation line (indented, not a new list item) ---
    if (running && /^\s+\S/.test(line) && !line.startsWith('- ')) {
      const bag = running.space === 'paths' ? out.byPath : out.byEpic;
      bag[running.key] += '\n' + line;
      continue;
    }

    // Anything else closes the running note.
    running = null;
  }

  flushLegend();
  return out;
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
