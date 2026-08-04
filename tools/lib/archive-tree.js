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
import { realpathSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep, posix } from 'node:path';

import { PLANNING_DIR, EPIC_ID_STRICT_RE } from './state.js';
import { atomicWrite } from './atomic-write.js';
import { deriveEpicArchiveDir } from './evict.js';
import { enumerateRetros } from './retro-index.js';
import { INBOX_NEW, INBOX_LEGACY, LEDGER_NEW, LEDGER_LEGACY } from './inbox-path.js';

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
  'SHIP',
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
// M5.E18 S6 (NFR4) — what may become a directory name under `.planning/archive/`.
//
// Units are DERIVED from filenames (S1), so a `/` cannot occur in practice and
// the real corpus has no hostile name. That is luck of inventory, not safety:
// the derivation rule could widen, and a project could name a file anything. So
// the constraint is stated rather than assumed.
//
// First character must be alphanumeric — that alone blocks `.`, `..`, `.hidden`
// and `/abs`. The charset excludes `/` and `\`. `..` anywhere is rejected
// separately because `.` must remain legal INSIDE a name: `M4.5.E1` and `v0.1.6`
// are both real units.
const SAFE_UNIT_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Is this unit name safe to use as a path component under `.planning/archive/`?
 * @param {unknown} unit
 * @returns {boolean}
 */
export function isSafeUnitName(unit) {
  if (typeof unit !== 'string' || unit.length === 0 || unit.length > 100) return false;
  if (unit.includes('..')) return false;
  return SAFE_UNIT_RE.test(unit);
}

/**
 * Where a closed unit's scaffold archives to.
 *
 * A strict Epic ID keeps `deriveEpicArchiveDir`'s existing `{M}/E{n}` layout, so
 * nothing that archives today moves (AC6.1). Everything else gets a FLAT
 * per-unit directory — `PHASE10-S4` and `GATE-A` have no milestone to key on,
 * and inventing a hierarchy for them would be deriving structure from names that
 * carry none.
 *
 * Throws on a name that fails `isSafeUnitName`, so a caller that skips the
 * filter still cannot produce a path outside `.planning/archive/`.
 *
 * @param {string} unit
 * @returns {string} repo-relative POSIX directory
 */
export function deriveUnitArchiveDir(unit) {
  if (!isSafeUnitName(unit)) {
    throw new Error(
      `deriveUnitArchiveDir: unsafe unit name ${JSON.stringify(unit)} — ` +
        'a unit must start alphanumeric and contain no path separators or "..".'
    );
  }
  if (EPIC_ID_STRICT_RE.test(unit)) return toPosix(deriveEpicArchiveDir(unit));
  return `${PLANNING_DIR}/archive/${unit}`;
}

export function planArchiveMoves(closedUnitIds, planningRelFiles, opts = {}) {
  const suffixes = opts.scaffoldSuffixes ?? SCAFFOLD_SUFFIXES;
  // M5.E18 S6 / AC6.3. `archive/` is excluded from the move-planning input
  // EXPLICITLY, not incidentally. Today `from` is always a top-level path so an
  // archived file could never match it — but that is a property of how `from`
  // happens to be built, and NFR2's idempotency guarantee should not rest on a
  // coincidence one refactor away from being false. The full walk (including
  // archive/) is still what `senseArchiveTree` uses for LINK EDITS: archived
  // files' references do get rewritten, so the exclusion belongs here and only
  // here.
  const present = new Set(
    (planningRelFiles ?? []).map(toPosix).filter((f) => !isUnderArchive(f))
  );
  const moves = [];
  const moveMap = new Map();

  // NFR4: a unit name that could escape `.planning/archive/` is DROPPED, not
  // thrown on. Throwing would let one hostile name deny the whole plan; dropping
  // keeps every other unit archivable and is reported by the caller.
  const safe = [...new Set(closedUnitIds ?? [])].filter(isSafeUnitName);
  // Strict Epic IDs first, in their existing order, then everything else
  // lexically. AC6.1: a strict-only input must produce a byte-identical plan.
  const epics = safe.filter((id) => EPIC_ID_STRICT_RE.test(id)).sort(compareEpicIds);
  const others = safe.filter((id) => !EPIC_ID_STRICT_RE.test(id)).sort();

  for (const unit of [...epics, ...others]) {
    const archiveDir = toPosix(deriveUnitArchiveDir(unit));
    for (const suffix of suffixes) {
      const from = `${PLANNING_DIR}/${unit}-${suffix}.md`;
      if (!present.has(from)) continue;
      const to = `${archiveDir}/${unit}-${suffix}.md`;
      if (from === to) continue;
      moves.push({ from, to });
      moveMap.set(from, to);
    }
  }
  return { moves, moveMap };
}

/**
 * The FIXED v2→v3 inbox rename moveMap (FR6): `FUTURE-IDEAS.md`→`ISSUES-INBOX.md`
 * and the archive ledger `FUTURE-IDEAS-LEDGER.md`→`ISSUES-INBOX-LEDGER.md`. Each
 * entry is EXISTENCE-gated — planned only when the source is present AND the dest
 * is NOT (so a half-migrated repo with both names never clobbers the new file, and
 * an already-renamed repo plans nothing → idempotent). Keys/values are repo-root-
 * relative POSIX so they merge directly into `senseArchiveTree`'s moveMap. Pure
 * (single `existsSync` probe per name).
 *
 * @param {string} baseDir
 * @returns {Map<string,string>}  from→to (existence-gated)
 */
export function senseV3Rename(baseDir) {
  const moveMap = new Map();
  const plan = (from, to) => {
    if (existsSync(join(baseDir, from)) && !existsSync(join(baseDir, to))) moveMap.set(from, to);
  };
  plan(INBOX_LEGACY, INBOX_NEW);
  plan(LEDGER_LEGACY, LEDGER_NEW);
  return moveMap;
}

// A repo-root-relative POSIX path that lives under `.planning/archive/`.
const isUnderArchive = (repoRel) => toPosix(repoRel).startsWith(`${PLANNING_DIR}/archive/`);

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
    // B28 (D-M5E6-4): NEVER rewrite an absolute-path target. `scanDanglingLinks`
    // resolves it with `resolve()` (which RESETS on an absolute path), so an
    // absolute link's resolved target is INVARIANT under a move; rerooting it with
    // `posix.join()` (which concatenates it under the linker dir) mangles it and
    // makes the before/after abs-key diverge → a pre-existing absolute dangle is
    // misread as migrate-introduced (fail-safe false-abort). Left byte-identical.
    if (targetPath.startsWith('/')) continue;
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

// realpath the deepest EXISTING component of `p` (the full path may not exist yet).
// Walk up until realpathSync resolves; at the fs root it must resolve, else
// propagate. Portable "nearest existing ancestor" — realpathSync throws ENOENT on
// a missing path on every platform.
function realpathNearestExisting(p) {
  let cur = resolve(p);
  for (;;) {
    try {
      return realpathSync(cur);
    } catch (e) {
      const parent = dirname(cur);
      if (parent === cur) throw e; // reached fs root; nothing resolved — propagate
      cur = parent;
    }
  }
}

// Path confinement (mirrors evict.js / relocateFaithful). The LEXICAL guard's
// trailing sep defeats the `.planning-evil/` sibling-prefix bug but does NOT follow
// symlinks. The ADDITIVE symlink-aware re-assert (REVIEW security MEDIUM) resolves
// symlinks and re-checks REAL containment two ways, realpath'ing BOTH sides so a
// legit base-path symlink (macOS /var → /private/var) never false-refuses:
//   (1) .planning/ itself must not be a symlink escaping the repo;
//   (2) the dest DIRECTORY's nearest existing ancestor must resolve inside real
//       .planning/ — catches a checked-in directory symlink under .planning/
//       (e.g. archive → out-of-tree). Anchored on dirname(destAbs), NEVER the leaf
//       (atomicWrite renames over the leaf, never following it — a leaf-file
//       symlink is already safe). Fail closed: a throw here rides the caller's
//       rollback wrap.
function assertInsidePlanning(baseDir, destAbs) {
  const planningRoot = resolve(baseDir, PLANNING_DIR);
  if (!resolve(destAbs).startsWith(planningRoot + sep)) {
    throw new Error(`archive-tree: dest ${destAbs} escapes ${PLANNING_DIR}/`);
  }
  const realBase = realpathSync(baseDir);
  const realRoot = realpathSync(planningRoot); // .planning/ exists on a real apply
  if (realRoot !== realBase && !realRoot.startsWith(realBase + sep)) {
    throw new Error(
      `archive-tree: ${PLANNING_DIR}/ resolves outside the repo (real ${realRoot}) — refusing a symlinked planning root`
    );
  }
  const realDir = realpathNearestExisting(dirname(destAbs));
  if (realDir !== realRoot && !realDir.startsWith(realRoot + sep)) {
    throw new Error(
      `archive-tree: dest ${destAbs} escapes ${PLANNING_DIR}/ via a directory symlink (real dir ${realDir})`
    );
  }
}

/**
 * Sense the archive-tree plan for a project (READ-ONLY, no lock). Closed-Epic IDs
 * come from the retros (a `*-RETROSPECTIVE.md` = the Epic is closed); the moves +
 * per-file keyed rewrites are computed against the PRE-move layout.
 *
 * With `opts.v3Rename`, the FR6 inbox/ledger rename (`senseV3Rename`) folds into
 * the move set. R7: the rename's referrer rewrite EXCLUDES files under
 * `.planning/archive/` — an archived doc's historical `.planning/FUTURE-IDEAS.md`
 * reference is a fact of the past, not a live link to repair — so archive files
 * are keyed against the SCAFFOLD-only moveMap (the closed-Epic moves still rewrite
 * them, as before). `renameFroms` is surfaced so the migrate's residual-flat-path
 * scan can apply the same archive exemption.
 *
 * @param {string} baseDir
 * @param {{scaffoldSuffixes?: string[], v3Rename?: boolean}} [opts]
 * @returns {Promise<{moves: Array, moveMap: Map, closedEpicIds: string[], files: string[], editsByFile: Map<string, Array>, renameFroms: Set<string>}>}
 */
export async function senseArchiveTree(baseDir, opts = {}) {
  const retros = await enumerateRetros(baseDir);
  // M5.E18 S5.t1 (`B64`): a STUB retro is not closure. `enumerateRetros` has
  // always reported `isStub`; this call discarded it, so a card that is still
  // all `[FILL IN]` archived a live Epic. Against Signal's own tree that is 4
  // of 23 retros — M4.5.E1, M4.5.E3, M4.5.E6, M4.5.E7 (AC5.2).
  const closedEpicIds = retros.filter((r) => !r.isStub).map((r) => r.epicId);

  // M5.E18 S6. `opts.closedUnits` lets a caller supply the closed set directly —
  // including NON-Epic units, which the retro-derived path cannot express (8 of
  // 12 real projects have no strict Epic IDs at all). Default is unchanged:
  // absent the option, the closed set is exactly the non-stub retros, so every
  // existing caller plans exactly the moves it planned before (AC6.1).
  //
  // Deliberately an explicit input rather than a call into `resolveClosures`:
  // S4's resolver answers a STRICTER question (terminal artifact + not-current +
  // a passing readable verdict), and wiring it in here would silently change
  // which EPICS archive — an Epic with a complete retro but a FAIL verdict would
  // stop archiving. That is a behaviour change AC6.1 forbids in this slice, and
  // it belongs to S7 where the four-status reporting can show what moved and why.
  const closedUnits = opts.closedUnits ?? closedEpicIds;

  const files = await walkPlanningMd(baseDir);
  const { moves, moveMap } = planArchiveMoves(closedUnits, files, opts);

  // Fold in the FR6 rename (existence-gated). renameFroms marks the entries the
  // archive-exclusion (R7) applies to; the scaffold-only moveMap drives archive
  // files so their historical flat-path references are left byte-unchanged.
  const renameFroms = new Set();
  if (opts.v3Rename) {
    for (const [from, to] of senseV3Rename(baseDir)) {
      if (moveMap.has(from)) continue; // never let the rename shadow a scaffold move
      moves.push({ from, to });
      moveMap.set(from, to);
      renameFroms.add(from);
    }
  }
  const scaffoldMoveMap = renameFroms.size
    ? new Map([...moveMap].filter(([from]) => !renameFroms.has(from)))
    : moveMap;

  const proseEdits = computeProseEdits(moveMap);
  const scaffoldProseEdits = renameFroms.size ? computeProseEdits(scaffoldMoveMap) : proseEdits;
  const editsByFile = new Map();
  for (const f of files) {
    let text;
    try {
      text = await readFile(join(baseDir, f), 'utf-8');
    } catch {
      continue;
    }
    // Archive files: scaffold-only edits (rename refs stay, R7). Others: full merge.
    const useMap = isUnderArchive(f) ? scaffoldMoveMap : moveMap;
    const useProse = isUnderArchive(f) ? scaffoldProseEdits : proseEdits;
    const merged = [...computeLinkEdits(f, text, useMap), ...useProse];
    editsByFile.set(f, merged);
  }
  return { moves, moveMap, closedEpicIds, files, editsByFile, renameFroms };
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
