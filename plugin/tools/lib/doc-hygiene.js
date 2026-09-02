// tools/lib/doc-hygiene.js — the all-docs structural hygiene guard (M5.E3.S3 / FR4).
//
// A deterministic, OFFLINE set of read-only checks that turn structural doc
// drift into a red test. Runs in Signal's own suite (tests/docs-hygiene.test.js),
// never as a cross-project runtime hook — so the checks may target Signal's own
// canonical declaration sites by name.
//
// NON-NEGOTIABLE (AC4.3): no check touches the network. There is deliberately NO
// external-URL validation anywhere in this file — a meta-test greps this source
// for network tokens and fails if any appear. Scheme-prefixed link targets are
// SKIPPED, never resolved.
//
// Read-only (AC4.4): every function reads and asserts; none writes.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';

import { roster, ROOT } from './roster.js';
import { isStubRetro } from './retro-index.js';
import { resolveInboxPath } from './inbox-path.js';
import { buildDecisionIdMap, resolveDecisionIdIn } from './planning-index.js';

// Inline `](target)` links only (reference-style / HTML links are out of scope,
// matching the migrate dangling-gate).
const INLINE_LINK_RE = /\]\(([^)]+)\)/g;
/** A bare `path/to/doc.md` inside backticks — a reference nothing can verify. */
const BARE_PATH_MENTION_RE = /`([A-Za-z0-9._/-]+\.md)`/g;

// Per-file scan cap — mirrors migrate-memory.js's FILE_SCAN_CEILING so a
// pathological huge file can never hang a check. Legit docs are a few KB.
const FILE_SCAN_CEILING = 1024 * 1024;

// A link target is "external" (not a repo-relative file) when it carries a URI
// scheme (`scheme:...`) or is a bare in-page anchor (`#...`). Scheme-prefixed
// targets are skipped — never resolved or verified (AC4.3). The scheme test is
// written as a generic `\w+:` pattern to avoid spelling any network scheme here.
const SCHEME_OR_ANCHOR_RE = /^([a-zA-Z][\w+.-]*:|#)/;
const isExternalTarget = (t) => SCHEME_OR_ANCHOR_RE.test(t);

// Directories the doc walk never descends into. `.claude/` holds the
// dogfood-status duplicate plugin tree (a 2nd plugin.json + commands/ + agents/)
// that would double-count the roster / false-fail version-consistency; the rest
// are vendored / generated / historical and out of the standing guard's scope.
// `.migrate` joins `archive` for the same reason (B57): it holds the pre-reorg
// snapshot /sig:docs-migrate takes before relocating anything, so its links
// point at pre-migration paths BY DESIGN. Walking it reports a frozen backup as
// broken live docs — 11 of eval-project-A's 12 structural findings, 92% noise, which
// is how a checker gets muted.
const WALK_IGNORE = new Set([
  '.claude',
  'node_modules',
  'examples',
  'archive',
  '.migrate',
  '.git',
  '.planning',
]);

const toPosix = (p) => p.split('\\').join('/');
const mkFinding = (check, severity, file, message) => ({ check, severity, file, message });
const findingCmp = (a, b) =>
  a.check.localeCompare(b.check) || a.file.localeCompare(b.file) || a.message.localeCompare(b.message);

function walkDocs(dir, out, walkIgnore = WALK_IGNORE) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (walkIgnore.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkDocs(p, out, walkIgnore);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

// Remove fenced code blocks and inline code spans so a `](path.md)` written as a
// code *sample* (research/plan docs legitimately quote link syntax) is never
// mistaken for a live link. Line-based fence tracking mirrors drain.js's
// `isFenceMarker`; the caller applies it AFTER the B15 cap-truncation so a
// pathological doc is bounded first. Line count is preserved (fenced/marker
// lines blank out) — only the link-scan surface changes.
function stripCodeSpans(text) {
  const out = [];
  let inFence = false;
  for (const line of text.split('\n')) {
    const t = line.trimStart();
    if (t.startsWith('```') || t.startsWith('~~~')) {
      inFence = !inFence;
      out.push(''); // the fence marker line itself is not a link surface
      continue;
    }
    if (inFence) {
      out.push(''); // fenced content: a code sample, never a live link
      continue;
    }
    // Inline code spans on a prose line: `](x.md)` inside backticks is a sample.
    out.push(line.replace(/`[^`]*`/g, ''));
  }
  return out.join('\n');
}

/**
 * The public doc surface: README.md + CLAUDE.md + every `.md` under docs/ and
 * analysis/. Deliberately NOT `.planning/` — its own migrate dangling-gate covers
 * it, and its research/plan docs legitimately quote link syntax like `](path.md)`
 * that a standing HARD guard would false-fail. Sorted, deterministic.
 *
 * Scope is parameterized (M5.E6 FR1) so `/sig:docs-sweep` can widen the walk to
 * `.planning/` (still exempting `archive/` via `walkIgnore`) WITHOUT changing the
 * standing test-suite guard — every opt defaults to today's behavior.
 *
 * @param {string} [baseDir=ROOT]
 * @param {object} [opts]
 * @param {string[]} [opts.topFiles=['README.md','CLAUDE.md']] repo-root `.md` files to include
 * @param {string[]} [opts.dirs=['docs','analysis']] dirs to walk (recursively)
 * @param {Set<string>} [opts.walkIgnore=WALK_IGNORE] dir names never descended into
 * @returns {string[]} absolute paths, sorted
 */
export function listDocFiles(baseDir = ROOT, opts = {}) {
  const { topFiles = ['README.md', 'CLAUDE.md'], dirs = ['docs', 'analysis'], walkIgnore = WALK_IGNORE } = opts;
  const out = [];
  for (const top of topFiles) {
    const p = join(baseDir, top);
    if (existsSync(p)) out.push(p);
  }
  for (const dir of dirs) {
    walkDocs(join(baseDir, dir), out, walkIgnore);
  }
  return out.sort();
}

/**
 * Internal link-health over the public doc surface. A dead internal `.md` link
 * (file-existence) is HARD; an unresolvable `#anchor` on an existing file is SOFT
 * (slug resolution is best-effort to avoid false HARD-fails). External /
 * scheme-prefixed targets are skipped.
 *
 * Scope + `stripCode` are parameterized (M5.E6 FR1/FR2): `/sig:docs-sweep` passes a
 * widened scope and `stripCode: true` so code-quoted `](path.md)` samples in
 * `.planning/` research/plan docs are not mis-flagged. Both default to today's
 * behavior, so the standing guard is unchanged.
 *
 * @param {string} [baseDir=ROOT]
 * @param {object} [opts] scope opts forwarded to listDocFiles, plus:
 * @param {boolean} [opts.stripCode=false] strip fenced/inline code before scanning
 * @returns {Array<{check: string, severity: string, file: string, message: string}>}
 */
export function checkInternalLinks(baseDir = ROOT, opts = {}) {
  const { stripCode = false } = opts;
  const findings = [];
  const root = resolve(baseDir);
  for (const f of listDocFiles(baseDir, opts)) {
    let text;
    try {
      text = readFileSync(f, 'utf-8');
    } catch {
      continue;
    }
    const rel = toPosix(relative(baseDir, f));
    // B15: flag when a doc exceeds the scan cap — a silent truncation would hide
    // any link past the cap, so the coverage gap must never pass unremarked.
    if (text.length > FILE_SCAN_CEILING) {
      findings.push(
        mkFinding('internal-links', 'soft', rel, `exceeds ${FILE_SCAN_CEILING}B scan cap — link check truncated`),
      );
      text = text.slice(0, FILE_SCAN_CEILING);
    }
    // Applied AFTER the cap so the strip operates on bounded text (FR2).
    if (stripCode) text = stripCodeSpans(text);
    for (const m of text.matchAll(INLINE_LINK_RE)) {
      const raw = m[1].trim();
      if (isExternalTarget(raw)) continue;
      const firstTok = raw.split(/\s+/)[0]; // drop an optional "title"
      const [pathPart, anchor] = splitAnchor(firstTok);
      if (!pathPart.endsWith('.md')) continue;
      const abs = resolve(dirname(f), pathPart);
      // B22: bound the resolved target to repo root BEFORE any disk touch — a
      // `](../../../x.md)` must never existsSync/readFile outside the walk root.
      if (abs !== root && !(abs + sep).startsWith(root + sep)) {
        findings.push(
          mkFinding('internal-links', 'hard', rel, `internal link escapes repo root -> ${pathPart}`),
        );
        continue;
      }
      if (!existsSync(abs)) {
        findings.push(mkFinding('internal-links', 'hard', rel, `dead internal link -> ${pathPart}`));
      } else if (anchor && !anchorResolves(abs, anchor)) {
        // File resolves; the #slug does not. SOFT — slug resolution is
        // best-effort (GitHub's exact rules vary), so this never HARD-fails.
        findings.push(
          mkFinding('internal-links', 'soft', rel, `unresolvable anchor -> ${pathPart}#${anchor}`),
        );
      }
    }
  }
  return findings.sort(findingCmp);
}

// Canonical roster-count declaration sites. Each entry pins ONE prose count-claim
// to its file with a NARROW pattern, so the check never scrapes an incidental
// number. The CLAUDE.md patterns require a `#` code-comment prefix (with the
// count on the same line — `[ \t]*`, never a newline), which excludes the
// historical narrative in the Current-State paragraph: its "15 slash commands" is
// a legitimate v0.1.3-era snapshot, not a live count. README is deliberately
// absent — its "19 agents" / "21 skills" describe the UPSTREAM GSD / Agent Skills
// projects, not Signal's roster.
const ROSTER_SITES = [
  { file: 'CLAUDE.md', kind: 'commands', re: /#[ \t]*(\d+) slash commands/ },
  { file: 'CLAUDE.md', kind: 'agents', re: /#[ \t]*(\d+) agents/ },
  { file: 'CLAUDE.md', kind: 'skills', re: /#[ \t]*(\d+) (?:quality )?skills/ },
  // The three `docs/map/index.html` sites were REMOVED 2026-08-03, superseded by
  // `tests/map-roster-reconcile.test.js`. This removal is deliberate and had to
  // be explicit: those headings now render their count from the JS arrays
  // (`renderRosterCount`), so the source HTML holds no digits and the patterns
  // stopped matching. Per this check's own contract three lines below — "a site
  // whose pattern is absent is simply not checked" — leaving them here would
  // have left three guards that look alive and verify nothing, which is exactly
  // `B39`/`B54`'s shape.
  //
  // This is strictly STRONGER, not weaker. `analysis/CLAIM-INTEGRITY-ANALYSIS.md`
  // counts checkRosterCounts as one of only two claim-vs-reality checks in all
  // of Signal, so the trade matters: the old check compared ONE NUMBER to the
  // roster and never looked at the list beneath it — which is how `B32` survived
  // with a heading of 19 over an array of 17. The reconcile test compares the
  // full SET OF NAMES in both directions, and the number is no longer an
  // independent claim that can drift at all.
];

/**
 * Roster/count-drift: every canonical count-claim must match roster.js. HARD —
 * adding an agent/command/skill without updating a declaration site turns the
 * suite red (AC4.1, AC4.5). A site whose pattern is absent is simply not checked
 * (drift, not absence, is the target).
 *
 * @param {string} [baseDir=ROOT]
 * @returns {Array<{check: string, severity: string, file: string, message: string}>}
 */
export function checkRosterCounts(baseDir = ROOT) {
  // M6.E1 — two roots. The count sites (README.md, CLAUDE.md, docs/map) live at
  // the REPOSITORY root; the things being counted (commands/, agents/, skills/)
  // live in the PAYLOAD. Before the move those were one directory and this
  // function could use `baseDir` for both. Passing the repo root to `roster()`
  // now returns 0 of everything and reports every site as a mismatch — a
  // check that fails loudly rather than silently, which is the only reason
  // this was cheap to find.
  const payloadRoot = existsSync(join(baseDir, 'plugin', 'commands'))
    ? join(baseDir, 'plugin')
    : baseDir;
  const counts = roster(payloadRoot).counts;
  const findings = [];
  for (const site of ROSTER_SITES) {
    let text;
    try {
      text = readFileSync(join(baseDir, site.file), 'utf-8');
    } catch {
      continue;
    }
    const m = text.match(site.re);
    if (!m) continue;
    const claimed = Number(m[1]);
    const actual = counts[site.kind];
    if (claimed !== actual) {
      findings.push(
        mkFinding('roster-counts', 'hard', site.file, `claims ${claimed} ${site.kind}, roster has ${actual}`),
      );
    }
  }
  return findings.sort(findingCmp);
}

// --- version-consistency (B7 class) ------------------------------------------

const stripV = (s) => String(s).replace(/^v/, '');

function readJsonSafe(abs) {
  try {
    return JSON.parse(readFileSync(abs, 'utf-8'));
  } catch {
    return null;
  }
}

/** plugin.json `.version` (or null). */
function readPluginVersion(baseDir) {
  // M6.E1: the manifest moved into the payload. The path is hardcoded here
  // rather than taken from the VERSION_SOURCES entry's `file`, so repointing
  // that entry alone left this reader returning null — the "listed but not
  // reachable" shape AC4.2 was written to catch, caught by AC4.2.
  const j = readJsonSafe(join(baseDir, 'plugin', '.claude-plugin', 'plugin.json'));
  return j && typeof j.version === 'string' ? j.version : null;
}

/** marketplace.json's Signal plugin `source.ref` (or null). */
function readMarketplaceRef(baseDir) {
  const j = readJsonSafe(join(baseDir, '.claude-plugin', 'marketplace.json'));
  const plugins = j && Array.isArray(j.plugins) ? j.plugins : [];
  const entry = plugins.find((p) => p && p.source && typeof p.source.ref === 'string');
  return entry ? entry.source.ref : null;
}

/**
 * The latest REAL CHANGELOG version heading — the first `## [X.Y.Z]` heading,
 * which naturally SKIPS `## [Unreleased]` (not a semver). So a batched-unreleased
 * repo (doc-runtime under `[Unreleased]`, top real heading = the shipped version)
 * reads the shipped version, and the check stays green now AND post-release.
 */
function readLatestChangelogVersion(baseDir) {
  let text;
  try {
    text = readFileSync(join(baseDir, 'CHANGELOG.md'), 'utf-8');
  } catch {
    return null;
  }
  const m = text.match(/^##\s+\[(\d+\.\d+\.\d+)\]/m);
  return m ? m[1] : null;
}

/**
 * The `docs/map/index.html` header stamp (or null).
 *
 * The map is Signal's public-facing page and is entirely hand-authored —
 * nothing regenerates it — so its version claim drifted to v0.1.9 while the
 * plugin shipped v0.1.17. Adding it here makes the stamp fail CI the moment it
 * disagrees with `plugin.json`, which is the only thing that has ever kept a
 * hand-maintained number honest in this repo.
 *
 * The stamp deliberately carries NO date and does not say "generated": both
 * would be further unpinned claims, and the second was simply false.
 *
 * NOTE: a null return means this source is SKIPPED by checkVersionConsistency,
 * so deleting the stamp would disable the check rather than fail it.
 * `tests/map-roster-reconcile.test.js` asserts the stamp exists, which is the
 * half this reader cannot cover on its own.
 */
function readMapVersion(baseDir) {
  let text;
  try {
    text = readFileSync(join(baseDir, 'docs', 'map', 'index.html'), 'utf-8');
  } catch {
    return null;
  }
  const m = text.match(/Map\s+&middot;\s+v(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

/**
 * Version-consistency (HARD, B7 class): plugin.json version === marketplace ref
 * === latest real CHANGELOG heading (skipping `[Unreleased]`), all normalized by
 * stripping a leading `v`. Drift between any two turns the suite red.
 *
 * @param {string} [baseDir=ROOT]
 * @returns {Array<{check: string, severity: string, file: string, message: string}>}
 */
function readPackageVersion(baseDir) {
  const j = readJsonSafe(join(baseDir, 'package.json'));
  return j && typeof j.version === 'string' ? j.version : null;
}

/**
 * Every file that states the plugin's version — the ONE place the covered set
 * is enumerated (M5.E13 S4.t3, AC4.2).
 *
 * `B49` was: `package.json` and the plugin manifest disagreed on the version,
 * and the suite stayed green because this check simply did not look at
 * `package.json`. The set used to live as three reader functions plus three
 * `push` lines, so adding a fourth file was a rediscovery rather than an edit.
 * **Add a row here and the checker covers it.**
 *
 * ORDER IS LOAD-BEARING: `found[0]` becomes the comparison baseline, so the
 * first readable entry is what everything else is compared against. That is
 * why `plugin.json` — the plugin's own manifest — is first.
 *
 * @type {Array<{file: string, read: (baseDir: string) => string|null}>}
 */
export const VERSION_SOURCES = [
  // M6.E1: the manifest moved into the payload; the repo-root path it used
  // to have now holds only marketplace.json.
  { file: 'plugin/.claude-plugin/plugin.json', read: readPluginVersion },
  { file: '.claude-plugin/marketplace.json', read: readMarketplaceRef },
  { file: 'CHANGELOG.md', read: readLatestChangelogVersion },
  { file: 'package.json', read: readPackageVersion },
  { file: 'docs/map/index.html', read: readMapVersion },
];

export function checkVersionConsistency(baseDir = ROOT) {
  const found = [];
  for (const { file, read } of VERSION_SOURCES) {
    const v = read(baseDir);
    if (v != null) found.push([file, stripV(v)]);
  }

  const findings = [];
  if (found.length < 2) return findings; // nothing to cross-check
  const [refFile, refVer] = found[0];
  for (const [file, ver] of found.slice(1)) {
    if (ver !== refVer) {
      findings.push(
        mkFinding('version-consistency', 'hard', file, `version ${ver} != ${refVer} (${refFile})`),
      );
    }
  }
  return findings.sort(findingCmp);
}

// --- [FILL IN] stubs (narrow allowlist) --------------------------------------

// A named template exclusion: docs/tester-brief.md is a copy-and-fill
// friction-log handed to first testers — its `[FILL IN — …]` markers ARE the
// design, not an unfilled stub. This is the "minus templates" carve-out.
const FILL_IN_TEMPLATE_EXCLUDE = new Set(['docs/tester-brief.md']);

// Stub/meta retros and milestone docs legitimately carry `[FILL IN]` placeholders
// for opportunistic completion — excluded by filename shape.
const FILL_IN_NAME_EXCLUDE = /-RETROSPECTIVE\.md$|^MILESTONE-|-template\.md$/;

/**
 * README.md + top-level <dir>/*.md (each dir non-recursively), minus templates /
 * retros / milestone docs. Scope is parameterized (M5.E6 FR1) so `/sig:docs-sweep` can
 * widen it; both opts default to today's behavior.
 *
 * @param {string} baseDir
 * @param {object} [opts]
 * @param {string[]} [opts.topFiles=['README.md']] repo-root files to include
 * @param {string[]} [opts.dirs=['docs']] dirs whose top-level *.md are included
 */
function fillInScope(baseDir, opts = {}) {
  const { topFiles = ['README.md'], dirs = ['docs'] } = opts;
  const rels = [];
  for (const top of topFiles) {
    if (existsSync(join(baseDir, top))) rels.push(top);
  }
  for (const dir of dirs) {
    let entries;
    try {
      entries = readdirSync(join(baseDir, dir), { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.md')) rels.push(`${dir}/${e.name}`);
    }
  }
  return rels
    .filter((rel) => !FILL_IN_TEMPLATE_EXCLUDE.has(rel) && !FILL_IN_NAME_EXCLUDE.test(rel.split('/').pop()))
    .sort();
}

/**
 * Unfilled `[FILL IN]` markers in shipped (non-template) docs. HARD (AC4.2).
 * Line-anchored via `isStubRetro` — inline mentions inside prose (e.g. text that
 * describes how the markers work) don't match.
 *
 * Scope is parameterized (M5.E6 FR1) — forwarded to fillInScope; defaults today's.
 *
 * @param {string} [baseDir=ROOT]
 * @param {object} [opts] scope opts forwarded to fillInScope
 * @returns {Array<{check: string, severity: string, file: string, message: string}>}
 */
export function checkFillInStubs(baseDir = ROOT, opts = {}) {
  const findings = [];
  for (const rel of fillInScope(baseDir, opts)) {
    let text;
    try {
      text = readFileSync(join(baseDir, rel), 'utf-8');
    } catch {
      continue;
    }
    if (isStubRetro(text)) {
      findings.push(
        mkFinding('fill-in-stubs', 'hard', rel, 'unfilled [FILL IN] marker in a shipped (non-template) doc'),
      );
    }
  }
  return findings.sort(findingCmp);
}

// --- aggregation + read-set --------------------------------------------------

/**
 * Run every hygiene check and split findings by severity. HARD findings fail the
 * suite; SOFT findings are reported (warned) but never block.
 *
 * @param {string} [baseDir=ROOT]
 * @returns {{findings: Array, hard: Array, soft: Array}}
 */
export function runDocHygiene(baseDir = ROOT) {
  const findings = [
    ...checkInternalLinks(baseDir),
    ...checkRosterCounts(baseDir),
    ...checkVersionConsistency(baseDir),
    ...checkFillInStubs(baseDir),
  ].sort(findingCmp);
  return {
    findings,
    hard: findings.filter((f) => f.severity === 'hard'),
    soft: findings.filter((f) => f.severity === 'soft'),
  };
}

/**
 * Every file the guard reads: the doc surface plus the roster/version sources.
 * The read-only assertion (AC4.4) hashes this set before/after a run to prove the
 * guard never writes.
 *
 * @param {string} [baseDir=ROOT]
 * @returns {string[]} absolute paths, sorted
 */
export function hygieneReadSet(baseDir = ROOT) {
  const set = new Set(listDocFiles(baseDir));
  const extras = [
    join(baseDir, 'docs', 'map', 'index.html'),
    join(baseDir, '.claude-plugin', 'plugin.json'),
    join(baseDir, '.claude-plugin', 'marketplace.json'),
    join(baseDir, 'CHANGELOG.md'),
  ];
  for (const p of extras) if (existsSync(p)) set.add(p);
  return [...set].sort();
}

/** Split a link token into its path part and `#anchor` (anchor may be ''). */
function splitAnchor(tok) {
  const i = tok.indexOf('#');
  return i === -1 ? [tok, ''] : [tok.slice(0, i), tok.slice(i + 1)];
}

/** GitHub-style heading slug (lowercase, punctuation dropped, spaces -> `-`). */
function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

/** Does `#anchor` resolve to a heading slug in the (existing) target file? */
function anchorResolves(absTarget, anchor) {
  let text;
  try {
    text = readFileSync(absTarget, 'utf-8');
  } catch {
    return true; // unreadable -> don't emit a spurious SOFT finding
  }
  if (text.length > FILE_SCAN_CEILING) text = text.slice(0, FILE_SCAN_CEILING);
  const want = anchor.toLowerCase();
  for (const m of text.matchAll(/^#{1,6}\s+(.*)$/gm)) {
    if (slugify(m[1]) === want) return true;
  }
  // Also honor explicit `<a name>` / `id=` anchors so hand-authored targets pass.
  return text.includes(`name="${anchor}"`) || text.includes(`id="${anchor}"`);
}

/**
 * Documents nothing links to.
 *
 * `checkInternalLinks` walks links OUTBOUND — does this target exist? This is the
 * inbound direction: is anything pointing HERE? A document nothing references is
 * either dead weight or a broken hand-off, and until now nothing said which.
 *
 * ADVISORY, and deliberately rung 2 of the ladder (`CLAUDE.md` > House rules).
 * "Nothing links to this" is a strong hint and a weak proof: a corpus can
 * legitimately hold a document reached by name, by convention, or by a person who
 * simply knows it is there. Failing on that would be a check firing on correct
 * behaviour, which is how checks get ignored.
 *
 * ENTRY POINTS ARE EXCLUDED BY NAME, NOT BY GUESS. A file a tool opens by name —
 * `README.md`, `STATE.md`, an Epic's `-PLAN.md` — has no reason to be linked and is
 * not an orphan. That list is the honest weak point of this check and is stated
 * rather than hidden: widen it and the check goes quiet, narrow it and it cries wolf.
 *
 * ⚠ TRUNCATION IS REPORTED, NOT SWALLOWED (`B39`, `B15`'s precedent above). A file
 * over the scan cap has its tail unread, so an inbound link living in that tail is
 * invisible and its target would look orphaned. When any file is truncated this
 * emits a `could-not-fully-check` finding, because a clean orphan list computed
 * from a partial read is the exact shape of a false all-clear.
 *
 * @param {string} [baseDir=ROOT]
 * @param {object} [opts] scope opts forwarded to listDocFiles, plus:
 * @param {boolean} [opts.stripCode=false] strip fenced/inline code before scanning
 * @param {string[]} [opts.entryPoints] basenames/relative paths never counted as orphans
 * @returns {Array<{check: string, severity: string, file: string, message: string}>}
 */
export function checkOrphanDocs(baseDir = ROOT, opts = {}) {
  const { stripCode = false, entryPoints = ORPHAN_ENTRY_POINTS } = opts;
  const findings = [];
  const files = listDocFiles(baseDir, opts);
  if (files.length === 0) return findings;

  const rels = files.map((f) => toPosix(relative(baseDir, f)));
  const linked = new Set();
  /** rel path -> count of bare `path/to/doc.md` mentions in backticks. */
  const mentioned = new Map();
  let truncated = 0;

  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, 'utf-8');
    } catch {
      // Unreadable is a coverage gap, not an absence of links.
      truncated++;
      continue;
    }
    if (text.length > FILE_SCAN_CEILING) {
      truncated++;
      text = text.slice(0, FILE_SCAN_CEILING);
    }
    // Bare-path mentions live INSIDE backticks, and stripCode removes exactly
    // those — so they are collected from the unstripped text, before the strip.
    for (const m of text.matchAll(BARE_PATH_MENTION_RE)) {
      const abs = toPosix(relative(baseDir, resolve(baseDir, toPosix(m[1]))));
      mentioned.set(abs, (mentioned.get(abs) ?? 0) + 1);
    }
    if (stripCode) text = stripCodeSpans(text);
    const fromDir = dirname(f);
    for (const m of text.matchAll(INLINE_LINK_RE)) {
      const raw = m[1].trim();
      if (isExternalTarget(raw)) continue;
      const [pathPart] = splitAnchor(raw.split(/\s+/)[0]);
      if (!pathPart.endsWith('.md')) continue;
      // Resolve relative to the LINKING file, which is what a markdown reader does.
      linked.add(toPosix(relative(baseDir, resolve(fromDir, pathPart))));
    }
  }

  // The capture inbox is an entry point, but its FILENAME varies by project (a v3
  // repo and a legacy one disagree), so it is resolved rather than hardcoded — the
  // same reason `docs-hygiene.test.js` asserts this module names neither spelling.
  let inboxBase = null;
  try {
    inboxBase = resolveInboxPath(baseDir)?.split('/').pop() ?? null;
  } catch {
    inboxBase = null;
  }
  const isEntryPoint = (rel) => {
    const base = rel.slice(rel.lastIndexOf('/') + 1);
    if (inboxBase && base === inboxBase) return true;
    return entryPoints.some((e) => e === rel || e === base || (e instanceof RegExp && e.test(base)));
  };

  for (const rel of rels) {
    if (linked.has(rel) || isEntryPoint(rel)) continue;
    const bare = mentioned.get(rel) ?? 0;
    findings.push(
      bare > 0
        ? mkFinding(
            'orphan-doc',
            'soft',
            rel,
            `referenced ${bare} time(s) as a bare path in backticks and linked from nowhere — ` +
              `nothing can verify those references, and they break silently when the file moves`,
          )
        : mkFinding(
            'orphan-doc',
            'soft',
            rel,
            'nothing links to or mentions this document — dead weight, or a broken hand-off',
          ),
    );
  }

  if (truncated > 0) {
    findings.push(
      mkFinding(
        'orphan-doc',
        'soft',
        '(scope)',
        `${truncated} file(s) were truncated or unreadable — inbound links in the unread tail are invisible, ` +
          `so this orphan list is INCOMPLETE and a clean result here does not mean checked`,
      ),
    );
  }
  return findings;
}

/**
 * Documents reached by name rather than by link. Not orphans.
 *
 * Regexes cover the per-unit artifact families a phase command opens by
 * convention (`{Unit}-PLAN.md` and friends) — enumerating them would mean editing
 * this list every Epic.
 */
export const ORPHAN_ENTRY_POINTS = Object.freeze([
  'README.md',
  'CLAUDE.md',
  'AGENTS.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'LICENSE.md',
  'STATE.md',
  'STATE-HISTORY.md',
  'PROFILE.md',
  'PROJECT.md',
  'CONTEXT.md',
  'INDEX.md',
  'BACKLOG.md',
  'BUGS.md',
  'DECISIONS.md',
  'OPEN-QUESTIONS.md',
  'RETROSPECTIVES.md',
  'ADHERENCE-LOG.md',
  'LANDSCAPE.md',
  'ENVIRONMENT.md',
  'REQUIREMENTS.md',
  /-(PLAN|PROGRESS|VERIFICATION|VALIDATION|REVIEW|RESEARCH|REQUIREMENTS|RETROSPECTIVE|PROFILE)(-\d+)?\.md$/,
  /^MILESTONE-.+\.md$/,
]);

/**
 * Cited identifiers that resolve to nothing.
 *
 * `B112` was named as *filed* in six places across five documents for three days
 * while absent from `BUGS.md` — `M6.E2`'s published-facts class, committed in the
 * same span as the checks for it. Every one of those citations was a bare token,
 * so nothing could verify it.
 *
 * WHY THIS AND NOT A LINK CONVENTION. The filed proposal was to rewrite `B112`-style
 * references as markdown links so the existing dead-link walk would catch them
 * (`analysis/DEEPSEEK-HARNESS-ASSESSMENT.md` §2.2). Resolving the id directly is
 * strictly better and much cheaper: it needs **no backfill** across a hundred-plus
 * files, it works on prose already written, and it verifies the **referent** rather
 * than the syntax — a link can be well-formed and point at a heading that says
 * nothing about the id. The convention is still worth having for file paths; it is
 * not the right mechanism for identifiers.
 *
 * ADVISORY. A dangling id is usually a typo or a withdrawn record, and occasionally
 * a document deliberately naming an id that does not exist — see `exemptIds`.
 *
 * Portable: a project with no `BUGS.md` / `DECISIONS.md` yields no findings rather
 * than flagging every id it cannot resolve.
 *
 * @param {string} [baseDir=ROOT]
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.exemptIds] id -> reason it is deliberately dangling
 * @returns {Array<{check: string, severity: string, file: string, message: string}>}
 */
export async function checkDanglingReferences(baseDir = ROOT, opts = {}) {
  const { exemptIds = DANGLING_REF_EXEMPTIONS } = opts;
  const findings = [];
  const planning = join(baseDir, '.planning');
  if (!existsSync(planning)) return findings;

  const bugsPath = join(planning, 'BUGS.md');
  const decisionsPath = join(planning, 'DECISIONS.md');
  const hasBugs = existsSync(bugsPath);
  const hasDecisions = existsSync(decisionsPath);
  if (!hasBugs && !hasDecisions) return findings;

  const read = (p) => {
    try {
      return readFileSync(p, 'utf-8');
    } catch {
      return null;
    }
  };

  // DEFINED SETS. A definition is a table row or a bolded/heading definition line —
  // the same two shapes the corpus actually uses. A mere mention never defines.
  const definedBugs = new Set();
  if (hasBugs) {
    const c = read(bugsPath) ?? '';
    for (const m of c.matchAll(/^\|\s*(B\d{1,4})\s*\|/gm)) definedBugs.add(m[1]);
    for (const m of c.matchAll(/^#{2,6}\s+.*?\b(B\d{1,4})\b/gm)) definedBugs.add(m[1]);
  }
  // D-IDS RESOLVE THROUGH THE REAL RESOLVER, NOT A SECOND IMPLEMENTATION.
  //
  // The first version of this check scanned `.planning/DECISIONS.md` directly and
  // reported 31 dangling ids where 2 exist. Closed-milestone decision sections are
  // EVICTED to the archive by `/sig:docs-migrate`, so 29 perfectly good ids —
  // `D-E3-*`, `D-E8-*`, `D-E9-*` — resolve to an archived home this module knew
  // nothing about. That is `B82`'s shape exactly: a second implementation of
  // "where does this live" cannot express the first's knowledge, and it fails in
  // the direction that looks like a finding.
  let decisionMap = null;
  if (hasDecisions) {
    try {
      decisionMap = await buildDecisionIdMap(baseDir);
    } catch {
      decisionMap = null; // unresolvable map -> skip D-ids rather than flag them all
    }
  }

  // A corpus with no definitions at all cannot distinguish "dangling" from "this
  // project does not use ids", so it says nothing rather than flagging everything.
  if (definedBugs.size === 0 && decisionMap === null) return findings;

  const cited = new Map(); // id -> Set(rel file)
  for (const name of readdirSync(planning)) {
    if (!name.endsWith('.md')) continue;
    const rel = `.planning/${name}`;
    const text = read(join(planning, name));
    if (text === null) continue;
    const scan = (re) => {
      for (const m of text.matchAll(re)) {
        const id = m[0];
        if (!cited.has(id)) cited.set(id, new Set());
        cited.get(id).add(rel);
      }
    };
    if (definedBugs.size > 0) scan(/\bB\d{1,4}\b/g);
    if (decisionMap !== null) scan(/\bD-[A-Za-z0-9]+-\d+\b/g);
  }

  for (const [id, where] of [...cited].sort((a, b) => a[0].localeCompare(b[0]))) {
    const isBug = id.startsWith('B');
    const defined = isBug
      ? definedBugs.has(id)
      : (await resolveDecisionIdIn(baseDir, decisionMap, id)) !== null;
    if (defined) continue;
    if (Object.hasOwn(exemptIds, id)) continue;
    const home = isBug ? 'BUGS.md' : 'DECISIONS.md';
    const files = [...where].sort();
    findings.push(
      mkFinding(
        'dangling-reference',
        'soft',
        files[0],
        `${id} is cited in ${files.length} file(s) but ${home} never defines it — ` +
          `a typo, a withdrawn record that still needs a tombstone, or a reference to something ` +
          `that was never filed (${files.slice(0, 4).join(', ')}${files.length > 4 ? ', …' : ''})`,
      ),
    );
  }
  return findings;
}

/**
 * Ids deliberately cited while not existing. Each needs a reason, because an
 * unexplained entry here is indistinguishable from a defect somebody muted.
 */
export const DANGLING_REF_EXEMPTIONS = Object.freeze({
  'D-BR0826-2': 'Cited only inside the correction note that records it never existed (M6.E5-PROFILE.md). Naming it is the point of the sentence.',
});
