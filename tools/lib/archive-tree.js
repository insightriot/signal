// tools/lib/archive-tree.js — parameterized archive-tree mover (M5.E2.S2.t3).
//
// Generalizes the one-off prototype `tools/archive-migrate.mjs` into a module the
// migrate engine consumes. The prototype was HARDCODED to the 2026-06-05 M4.5
// restructure (literal `['E1','E2',…]` Epic arrays, a `M4.5.${e}-${t}.md` filename
// template, LF-only line handling, plain `writeFile`, and a two-pass link→prose
// rewrite whose correctness relied on pass ORDERING). This module removes every
// one of those:
//   - archive moves are COMPUTED from signals (closed-Epic IDs from the retros,
//     the milestone derived from the Epic ID via deriveEpicArchiveDir) — no
//     project literals, so it works unchanged on M6.E1 / M2.E3 / any Epic;
//   - every write goes through `atomicWrite` (never bare writeFile/fs.writeFile);
//   - link targets are recomputed with `path.posix` — POSIX `/` on every platform
//     (Windows link targets never carry a backslash);
//   - line handling is whole-text (`\r?\n`-tolerant) — a CRLF file round-trips
//     byte-for-byte;
//   - link + prose-path rewrites are merged into ONE keyed replacement set applied
//     in a single longest-match-first scan (lesson 4): the emitted text is never
//     re-scanned, so the link pass and the prose pass can neither collide nor
//     double-rewrite regardless of ordering.
//
// LOCK COMPOSITION (§9): this module is LOCK-FREE. It never acquires
// `withStateLock` and never calls the self-locking `evictEpicNarrative`. The
// caller (the S2.t5 full-corpus brain, running under applyMigrate's ONE coarse
// `.state.lock`) owns the lock; a second acquisition here would re-enter the
// non-reentrant lock (the §9 hazard). All moves/rewrites use lock-free primitives.
//
// INDEX descope (§10): this module NEVER writes `.planning/INDEX.md`. If moves
// leave INDEX references stale, that is surfaced by the migrate's existing
// dry-run `index-refresh` flag — the hand-curated INDEX is not auto-rewritten.
//
// SCOPE FLOOR: only inline `](path)` markdown links are rewritten here.
// Reference-style `[label]: path` and HTML `<a href>` links are OUTSIDE this pass
// (see `detectUnhandledLinkForms` — the seam S2.t4 fills with a detect-and-warn
// floor). t3 leaves those forms BYTE-UNCHANGED; it does not silently drop them.

import { readFile, mkdir, rm, readdir } from 'node:fs/promises';
import { join, dirname, resolve, relative, sep, posix } from 'node:path';

import { PLANNING_DIR, EPIC_ID_STRICT_RE } from './state.js';
import { atomicWrite } from './atomic-write.js';
import { deriveEpicArchiveDir } from './evict.js';
import { enumerateRetros } from './retro-index.js';

// The scaffold doc-types that archive with a closed Epic. A project-AGNOSTIC
// domain constant (the doc-runtime scaffold set) — NOT a project literal like a
// milestone or an Epic array. RETROSPECTIVE is deliberately absent: retros stay in
// root as the warm traceability spine (the retro-index machinery globs their flat
// prefixed names). Overridable via `opts.scaffoldSuffixes`.
export const SCAFFOLD_SUFFIXES = Object.freeze([
  'REQUIREMENTS',
  'RESEARCH',
  'PLAN',
  'PROGRESS',
  'VERIFICATION',
  'VALIDATION',
  'REVIEW',
]);

const LINK_RE = /\]\(([^)]+)\)/g;
const isExternal = (t) => /^(https?:|mailto:|#)/.test(t);

/** Normalize a path to POSIX separators (`\` → `/`) — the cross-platform guard. */
export function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

// Numeric-segment Epic-ID sort (M5.E2 < M5.E10) — deterministic move order.
function compareEpicIds(a, b) {
  const na = a.match(/\d+/g)?.map(Number) ?? [];
  const nb = b.match(/\d+/g)?.map(Number) ?? [];
  for (let i = 0; i < Math.max(na.length, nb.length); i++) {
    const d = (na[i] ?? 0) - (nb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * Compute the archive-tree file moves from SIGNALS — no project literals. For each
 * CLOSED Epic (its ID comes from a retro; the caller passes `closedEpicIds`), each
 * scaffold doc `.planning/{epicId}-{suffix}.md` that exists on disk moves under the
 * milestone DERIVED from the Epic ID (`deriveEpicArchiveDir` → `.planning/archive/
 * <milestone>/E<n>/`), keeping the full Epic-ID-prefixed filename. Works unchanged
 * on M6.E1 / M2.E3 / any Epic — no `['E1',…]` array, no `M4.5.…` template.
 * RETROSPECTIVE is never in `scaffoldSuffixes`, so retros are never moved.
 *
 * @param {string[]} closedEpicIds  strict Epic IDs (M{n}[.{n}]*.E{n}) known closed
 * @param {string[]} planningRelFiles  repo-root-relative POSIX paths under .planning/
 * @param {{scaffoldSuffixes?: string[]}} [opts]
 * @returns {{moves: Array<{from,to}>, moveMap: Map<string,string>}}
 */
export function planArchiveMoves(closedEpicIds, planningRelFiles, opts = {}) {
  const suffixes = opts.scaffoldSuffixes ?? SCAFFOLD_SUFFIXES;
  const present = new Set((planningRelFiles ?? []).map(toPosix));
  const moves = [];
  const moveMap = new Map();
  const epics = [...new Set(closedEpicIds ?? [])]
    .filter((id) => EPIC_ID_STRICT_RE.test(id))
    .sort(compareEpicIds);
  for (const epicId of epics) {
    const archiveDir = toPosix(deriveEpicArchiveDir(epicId)); // .planning/archive/<m>/E<n>
    for (const suffix of suffixes) {
      const from = `${PLANNING_DIR}/${epicId}-${suffix}.md`;
      if (!present.has(from)) continue;
      const to = `${archiveDir}/${epicId}-${suffix}.md`;
      if (from === to) continue;
      moves.push({ from, to });
      moveMap.set(from, to);
    }
  }
  return { moves, moveMap };
}

/**
 * Compute the inline-link rewrites for one file, keyed to the move map. Each
 * `](target)` whose target (or whose linker) moved is recomputed relative to the
 * linker's NEW dir and the target's NEW path, in POSIX space (no backslash on any
 * platform). Anchors (`#heading`) and link titles are preserved verbatim. The
 * edit key includes the `](` … `)` delimiters so it is matched as a whole unit —
 * a bare prose path can never match INSIDE a rewritten link (the collision guard).
 * Reference-style/HTML link forms are not `](path)` and are never touched here.
 *
 * @param {string} fileRepoRel  repo-root-relative path of the linker (POSIX or native)
 * @param {string} text
 * @param {Map<string,string>} moveMap  original→new (repo-root-relative POSIX)
 * @returns {Array<{from: string, to: string}>}
 */
export function computeLinkEdits(fileRepoRel, text, moveMap) {
  const f = toPosix(fileRepoRel);
  const fNew = moveMap.get(f) ?? f;
  const edits = [];
  for (const m of String(text).matchAll(LINK_RE)) {
    const raw = m[1];
    if (isExternal(raw)) continue;
    const [pathPart, ...titleParts] = raw.trim().split(/\s+/);
    const [targetPath, anchor = ''] = pathPart.split(/(#.*)/);
    if (!targetPath.endsWith('.md')) continue;
    // Resolve the target two ways (linker-relative OR repo-root-relative) and pick
    // whichever names a moved file — mirrors the prototype's dual candidate set.
    const cand1 = posix.normalize(posix.join(posix.dirname(f), targetPath));
    const cand2 = posix.normalize(targetPath);
    const absTarget = moveMap.has(cand1) ? cand1 : moveMap.has(cand2) ? cand2 : cand1;
    const tNew = moveMap.get(absTarget) ?? absTarget;
    if (fNew === f && tNew === absTarget) continue; // neither the linker nor the target moved
    let rel = posix.relative(posix.dirname(fNew), tNew);
    if (!rel.startsWith('.')) rel = `./${rel}`;
    const to = rel + anchor + (titleParts.length ? ` ${titleParts.join(' ')}` : '');
    if (raw !== to) edits.push({ from: `](${raw})`, to: `](${to})` });
  }
  return edits;
}

/**
 * The shared prose-path rewrites: every moved file's bare repo-root-relative
 * `.planning/<old>` location-assertion → its `.planning/archive/…/<new>` home.
 * (moveMap keys/values are already the repo-root-relative POSIX paths.)
 *
 * @param {Map<string,string>} moveMap
 * @returns {Array<{from: string, to: string}>}
 */
export function computeProseEdits(moveMap) {
  return [...moveMap].map(([from, to]) => ({ from, to }));
}

/**
 * Apply a keyed replacement set in a SINGLE left-to-right, longest-match-first
 * scan. The emitted `to` text is appended to the output and NEVER re-scanned, so
 * a replacement can never cascade into a later one and a bare-path key can never
 * match inside an already-emitted (delimited) link edit. This is what makes the
 * link pass + prose pass ordering-independent (lesson 4).
 *
 * @param {string} text
 * @param {Array<{from: string, to: string}>} replacements
 * @returns {string}
 */
export function applyKeyedReplacements(text, replacements) {
  const src = String(text);
  // Dedupe identical `from` keys (same link twice), then longest-first.
  const byFrom = new Map();
  for (const r of replacements ?? []) {
    if (r && r.from && !byFrom.has(r.from)) byFrom.set(r.from, r);
  }
  const reps = [...byFrom.values()].sort((a, b) => b.from.length - a.from.length);
  if (reps.length === 0) return src;

  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    let matched = false;
    for (const r of reps) {
      if (src.startsWith(r.from, i)) {
        out += r.to;
        i += r.from.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += src[i];
      i += 1;
    }
  }
  return out;
}

/**
 * SEAM for S2.t4 (detect-and-warn floor). Reference-style `[label]: path` and
 * HTML `<a href>` links are OUTSIDE the inline `](path)` rewriter — this task does
 * NOT rewrite them (and leaves them byte-unchanged), but it must not silently drop
 * them either. This detector returns their occurrences so S2.t4 can surface them
 * in the dry-run (and, per its AC, make the inline+anchor set a blocking abort).
 * t3 only EXPORTS the seam; it does not yet wire it into the dry-run/blocking.
 *
 * @param {string} text
 * @returns {Array<{form: 'reference'|'html', target: string}>}
 */
export function detectUnhandledLinkForms(text) {
  const out = [];
  const s = String(text);
  const refRe = /^[ \t]*\[[^\]]+\]:[ \t]*(\S+)/gm;
  const htmlRe = /<a\s[^>]*href\s*=\s*["']([^"']+)["']/gi;
  for (const m of s.matchAll(refRe)) out.push({ form: 'reference', target: m[1] });
  for (const m of s.matchAll(htmlRe)) out.push({ form: 'html', target: m[1] });
  return out;
}

// Recursively collect `.planning/**/*.md` as repo-root-relative POSIX paths,
// skipping the `.migrate` scratch dir.
async function walkPlanningMd(baseDir) {
  const out = [];
  const planningDir = join(baseDir, PLANNING_DIR);
  const walk = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== '.migrate') await walk(p);
      } else if (e.name.endsWith('.md')) {
        out.push(toPosix(relative(baseDir, p)));
      }
    }
  };
  await walk(planningDir);
  return out;
}

// Defense-in-depth path confinement (mirrors evict.js / relocateFaithful): the
// trailing sep defeats the `.planning-evil/` sibling-prefix bug.
function assertInsidePlanning(baseDir, destAbs) {
  const planningRoot = resolve(baseDir, PLANNING_DIR);
  if (!resolve(destAbs).startsWith(planningRoot + sep)) {
    throw new Error(`archive-tree: dest ${destAbs} escapes ${PLANNING_DIR}/`);
  }
}

/**
 * Sense the archive-tree plan for a project (READ-ONLY, no lock). Closed-Epic IDs
 * come from the retros (a `*-RETROSPECTIVE.md` = the Epic is closed); the moves +
 * per-file keyed rewrites are computed against the PRE-move layout.
 *
 * @param {string} baseDir
 * @param {{scaffoldSuffixes?: string[]}} [opts]
 * @returns {Promise<{moves: Array, moveMap: Map, closedEpicIds: string[], files: string[], editsByFile: Map<string, Array>}>}
 */
export async function senseArchiveTree(baseDir, opts = {}) {
  const retros = await enumerateRetros(baseDir);
  const closedEpicIds = retros.map((r) => r.epicId);
  const files = await walkPlanningMd(baseDir);
  const { moves, moveMap } = planArchiveMoves(closedEpicIds, files, opts);

  const proseEdits = computeProseEdits(moveMap);
  const editsByFile = new Map();
  for (const f of files) {
    let text;
    try {
      text = await readFile(join(baseDir, f), 'utf-8');
    } catch {
      continue;
    }
    const merged = [...computeLinkEdits(f, text, moveMap), ...proseEdits];
    editsByFile.set(f, merged);
  }
  return { moves, moveMap, closedEpicIds, files, editsByFile };
}

/**
 * Execute (or dry-run) the archive-tree move + keyed link/prose rewrite. LOCK-FREE
 * (§9): the caller owns the coarse lock; this never self-locks. Ordering (§2 / B8):
 * MOVE each file first with a byte-identical read-back assert (content preserved
 * before anything is rewritten), remove the source, THEN rewrite links/prose at the
 * files' NEW locations. Dry-run by default (writes nothing).
 *
 * @param {string} baseDir
 * @param {{apply?: boolean, scaffoldSuffixes?: string[]}} [opts]
 * @returns {Promise<{applied: boolean, moves: Array, moveMap: Map, rewrittenFiles: number}>}
 */
export async function applyArchiveTree(baseDir, opts = {}) {
  const apply = opts.apply ?? false;
  const { moves, moveMap, files, editsByFile } = await senseArchiveTree(baseDir, opts);

  if (!apply) {
    const editCount = [...editsByFile.values()].reduce(
      (acc, edits) => acc + edits.length,
      0,
    );
    return { applied: false, moves, moveMap, plannedEdits: editCount };
  }

  // 1. MOVE first — byte-identical relocate + read-back assert, then drop source.
  for (const { from, to } of moves) {
    const srcAbs = join(baseDir, from);
    const destAbs = join(baseDir, to);
    assertInsidePlanning(baseDir, destAbs);
    const content = await readFile(srcAbs, 'utf-8');
    await mkdir(dirname(destAbs), { recursive: true });
    await atomicWrite(destAbs, content);
    const landed = await readFile(destAbs, 'utf-8'); // "grew by exactly source" proof
    if (landed !== content) {
      throw new Error(`archive-tree: ${to} is not byte-identical to its source ${from}`);
    }
    await rm(srcAbs);
  }

  // 2. REWRITE — apply each file's merged keyed edits at its NEW location.
  // §10: NEVER auto-write the hand-curated INDEX.md. If a move left an INDEX link
  // stale, that is surfaced by the migrate's dry-run `index-refresh` flag — the
  // human refreshes it. (INDEX is never a scaffold doc, so moves already skip it;
  // this guard keeps the link/prose REWRITE from touching it either.)
  const indexRel = `${PLANNING_DIR}/INDEX.md`;
  let rewrittenFiles = 0;
  for (const f of files) {
    const curRel = moveMap.get(f) ?? f;
    if (curRel === indexRel) continue; // §10 — leave INDEX.md untouched
    const curAbs = join(baseDir, curRel);
    let text;
    try {
      text = await readFile(curAbs, 'utf-8');
    } catch {
      continue;
    }
    const next = applyKeyedReplacements(text, editsByFile.get(f) ?? []);
    if (next !== text) {
      await atomicWrite(curAbs, next);
      rewrittenFiles += 1;
    }
  }

  return { applied: true, moves, moveMap, rewrittenFiles };
}
