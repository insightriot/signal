// tools/lib/retro-index.js — RETROSPECTIVES.md index helpers (M4.5.E9.S2.t1).
//
// Enumerate retro files via path-agnostic glob (per A3 — generalizes for the
// M5.E1 wiki restructure that may relocate retros into a subdirectory) and
// classify each as stub-vs-complete by [FILL IN] marker presence.

import { readFile, stat } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join, relative, basename } from 'node:path';

import { atomicWrite } from './atomic-write.js';
import { withStateLock } from './state.js';

/**
 * Is this retro a stub (un-filled)? Heuristic: a `[FILL IN` marker at the
 * start of a line (after optional whitespace) signals an unfilled section.
 * Line-anchored to avoid false positives when the user references
 * `[FILL IN]` inline as part of normal prose (e.g., describing how stubs
 * work) — the actual template markers always sit on their own line.
 *
 * @param {string} content
 * @returns {boolean}
 */
export function isStubRetro(content) {
  if (!content || content.length === 0) return false;
  // Multiline: ^ matches line start. \s* tolerates indentation (e.g., in
  // nested lists). Inline references like `\`[FILL IN]\` markers` won't
  // match because they're preceded by backticks or other characters.
  return /^\s*\[FILL IN/im.test(content);
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

// ---- Hybrid render (S2.t2) ----

/**
 * Parse hand-written hook text per Epic ID from an existing
 * `RETROSPECTIVES.md`. Returns a `{epicId → hook}` map.
 *
 * Recognized line shape (loose):
 *   `- [M4.5.E9](M4.5.E9-RETROSPECTIVE.md) — *complete* — hook text here.`
 *   `- [M4.5.E9 — title](path) — *stub* — hook text here.`
 *
 * The hook is everything after the third em-dash (or the third standalone
 * `--`-style separator). Robust to slight variation; falls back to
 * empty/missing when shape doesn't match.
 *
 * Multi-line hooks supported via 2-space-indent continuation lines.
 *
 * @param {string|null|undefined} content
 * @returns {Record<string, string>}
 */
export function parseExistingHooks(content) {
  if (!content) return {};
  const map = {};
  const lines = content.split('\n');
  let currentEpic = null;
  for (const line of lines) {
    // Recognize list lines with an [EpicId](path) and " — " separators.
    const itemMatch = line.match(/^- \[(M\d+(?:\.\d+)*\.E\d+)[^\]]*\]\([^)]+\)\s+—\s+\*[^*]+\*\s+—\s+(.*)$/);
    if (itemMatch) {
      currentEpic = itemMatch[1];
      map[currentEpic] = itemMatch[2];
      continue;
    }
    // Continuation line: leading whitespace, no leading `- `.
    if (currentEpic && /^\s+\S/.test(line) && !line.startsWith('- ')) {
      map[currentEpic] += '\n' + line;
      continue;
    }
    // Anything else closes the running entry.
    currentEpic = null;
  }
  return map;
}

const PLACEHOLDER_HOOK = '_(hook pending)_';

/**
 * Render the `RETROSPECTIVES.md` content from an enumerated retro list,
 * preserving any hand-written hooks from a previous version of the index.
 *
 * @param {Array<{epicId: string, path: string, isStub: boolean, lastModified: Date}>} retros
 * @param {Record<string, string>} existingHooks — map from epicId → hook text
 * @returns {string}
 */
export function renderIndex(retros, existingHooks) {
  const hooks = existingHooks ?? {};
  const header = '# Signal — Retrospectives Index';
  const preamble =
    '> Per-Epic retrospectives, indexed for fast scan. Status flag (*stub* / *complete*) is auto-derived from the presence of `[FILL IN]` markers in the retro file. Hook lines (after the second em-dash) are hand-curated — they survive regeneration by Epic ID.';

  if (retros.length === 0) {
    return `${header}\n\n${preamble}\n\n_(no retros yet — the first one lands when the next Epic closes)_\n`;
  }

  // Reverse-chronological by lastModified (newest first).
  const sorted = [...retros].sort(
    (a, b) => b.lastModified.getTime() - a.lastModified.getTime(),
  );

  const lines = [];
  for (const r of sorted) {
    const filename = r.path.split('/').pop();
    const status = r.isStub ? '*stub*' : '*complete*';
    const hook = hooks[r.epicId] ?? PLACEHOLDER_HOOK;
    lines.push(`- [${r.epicId}](${filename}) — ${status} — ${hook}`);
  }

  return `${header}\n\n${preamble}\n\n${lines.join('\n')}\n`;
}

// ---- Regen orchestration (S2.t3) ----

/**
 * One-shot: enumerate retros, parse existing index hooks, render new
 * content, atomic-write IF different. Idempotent — second call with no
 * changes is a no-op (returns `written: false`).
 *
 * Used by:
 *   - commands/ship.md post-FR1 step (regen on every Epic-close SHIP)
 *   - S2.t4 initial generation (one-shot at Epic close)
 *
 * @param {string} baseDir
 * @param {{_afterRead?: Function}} [opts] — `_afterRead` is the FR5 read-enclosure test
 *   seam (B25/M5.E5.T3): awaited once after the version-establishing read of the file
 *   under test (RETROSPECTIVES.md), before the write. Defaults to undefined (no-op);
 *   mirrors atomic-write.js#renameFn.
 * @returns {Promise<{written: boolean, path: string, retroCount?: number, reason?: string}>}
 */
async function regenerateIndexCore(baseDir, opts = {}) {
  const { _afterRead } = opts;
  const indexPath = join(baseDir, '.planning', 'RETROSPECTIVES.md');

  const retros = await enumerateRetros(baseDir);

  let existing = '';
  try {
    existing = await readFile(indexPath, 'utf-8');
  } catch {
    // No existing index — that's fine; we'll write the first one.
  }
  if (_afterRead) await _afterRead();

  const hooks = parseExistingHooks(existing);
  const content = renderIndex(retros, hooks);

  if (content === existing) {
    return { written: false, path: indexPath, reason: 'unchanged' };
  }

  await atomicWrite(indexPath, content);
  return { written: true, path: indexPath, retroCount: retros.length };
}

/**
 * FR5 (M5.E4): self-locking wrapper around `regenerateIndexCore`. Acquires the coarse
 * `.planning/.state.lock` for the whole read→render→write RMW so a concurrent state
 * writer can't lost-update RETROSPECTIVES.md. The exported name is unchanged, so
 * commands/ship.md needs no edit.
 *
 * @param {string} baseDir
 * @param {{_afterRead?: Function}} [opts] — forwarded verbatim to the Core (test seam).
 * @returns {Promise<{written: boolean, path: string, retroCount?: number, reason?: string}>}
 */
export async function regenerateIndex(baseDir, opts = {}) {
  return withStateLock(baseDir, () => regenerateIndexCore(baseDir, opts));
}

// ---- Milestone meta-retro (S2.t6 / FR6 A6 downgrade) ----

/**
 * Compose a milestone-level meta-retro stub. Synthesizes per-Epic retros
 * into a milestone-scoped reflection — auto-extractable fields filled,
 * reflection sections marked [FILL IN] for opportunistic completion.
 *
 * Per A6, this is a manual-trigger artifact only — no auto-detection of
 * milestone close, no hard block. The user invokes `/sig:ship --milestone-meta`
 * (or the equivalent command surface) when they want the synthesis layer.
 *
 * @param {string} milestoneId — e.g., "M4.5" or "M4"
 * @param {Array<{epicId: string, path: string, isStub: boolean}>} retros — filtered to this milestone
 * @param {string} today — ISO date string (YYYY-MM-DD)
 * @returns {string}
 */
export function composeMilestoneMetaRetro(milestoneId, retros, today) {
  const header = `# ${milestoneId} Meta-Retrospective`;
  const stamp =
    `> _Generated ${today} from the per-Epic retros below. This is a synthesis-only stub — fill in opportunistically when the milestone is reflected on as a whole._`;

  let referenced;
  if (retros.length === 0) {
    referenced =
      '_(no per-Epic retros under this milestone yet — the meta-retro will populate as Epics close)_';
  } else {
    const lines = retros.map((r) => {
      const filename = r.path.split('/').pop();
      const status = r.isStub ? '*stub*' : '*complete*';
      return `- [${r.epicId}](${filename}) — ${status}`;
    });
    referenced = lines.join('\n');
  }

  return [
    header,
    '',
    stamp,
    '',
    '## Epic retros referenced',
    '',
    referenced,
    '',
    '## Synthesis',
    '',
    '[FILL IN — synthesize the patterns that recurred across the Epics above. What was learned at the milestone scale that no single Epic could teach?]',
    '',
    '## Compound learnings',
    '',
    '[FILL IN — what about Signal itself (the workflow, the tier system, the artifact set) shifted because of this milestone? What feeds back into the calibration or the phase gates?]',
    '',
    '## Forward-looking',
    '',
    `[FILL IN — what should the next milestone change based on ${milestoneId}'s experience? Concrete process / scope / sequencing changes.]`,
    '',
    '## Links',
    '',
    `- Per-Epic retros: see entries above`,
    `- Index: [\`RETROSPECTIVES.md\`](RETROSPECTIVES.md)`,
    '',
  ].join('\n');
}

/**
 * Filter enumerated retros to only those under a given milestone prefix.
 * E.g., milestoneId="M4.5" keeps only M4.5.E* entries; milestoneId="M4"
 * matches the M4 plain-milestone shape.
 *
 * @param {Array<{epicId: string}>} retros
 * @param {string} milestoneId
 * @returns {Array}
 */
function filterRetrosForMilestone(retros, milestoneId) {
  const prefix = milestoneId + '.E';
  return retros.filter((r) => r.epicId.startsWith(prefix));
}

/**
 * Manual trigger entrypoint: enumerate retros, filter to the milestone,
 * compose the meta-retro stub, atomic-write to .planning/{milestoneId}-RETROSPECTIVE.md.
 *
 * @param {string} baseDir
 * @param {string} milestoneId — e.g., "M4.5"
 * @param {{today?: string, force?: boolean, _afterRead?: Function}} [opts] — `_afterRead`
 *   is the FR5 read-enclosure test seam (B25/M5.E5.T3): awaited once after the
 *   version-establishing read of the file under test, before the write. Defaults to
 *   undefined (no-op); mirrors atomic-write.js#renameFn.
 * @returns {Promise<{written: boolean, path: string, retroCount: number, reason?: string}>}
 */
async function generateMilestoneMetaRetroCore(baseDir, milestoneId, opts = {}) {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  const force = opts.force ?? false;

  const path = join(baseDir, '.planning', `${milestoneId}-RETROSPECTIVE.md`);

  // Idempotency: refuse to overwrite an existing file unless --force.
  let existing = null;
  try {
    existing = await readFile(path, 'utf-8');
  } catch {
    // File doesn't exist — proceed to write.
  }
  if (existing !== null && !force) {
    return {
      written: false,
      path,
      retroCount: 0,
      reason: 'file exists (pass force: true to regenerate)',
    };
  }
  if (opts._afterRead) await opts._afterRead();

  const allRetros = await enumerateRetros(baseDir);
  const milestoneRetros = filterRetrosForMilestone(allRetros, milestoneId);
  const content = composeMilestoneMetaRetro(milestoneId, milestoneRetros, today);
  await atomicWrite(path, content);
  return {
    written: true,
    path,
    retroCount: milestoneRetros.length,
  };
}

/**
 * FR5 (M5.E4): self-locking wrapper around `generateMilestoneMetaRetroCore`. Acquires
 * the coarse `.planning/.state.lock` for the read (idempotency probe + enumerate) →
 * write RMW so a concurrent state writer can't lost-update the meta-retro. The exported
 * name is unchanged, so commands/ship.md needs no edit.
 *
 * @param {string} baseDir
 * @param {string} milestoneId — e.g. "M4.5"
 * @param {{today?: string, force?: boolean}} [opts]
 * @returns {Promise<{written: boolean, path: string, retroCount: number, reason?: string}>}
 */
export async function generateMilestoneMetaRetro(baseDir, milestoneId, opts = {}) {
  return withStateLock(baseDir, () => generateMilestoneMetaRetroCore(baseDir, milestoneId, opts));
}
