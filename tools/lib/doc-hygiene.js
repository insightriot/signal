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
import { join, dirname, resolve, relative } from 'node:path';

import { roster, ROOT } from './roster.js';
import { isStubRetro } from './retro-index.js';

export { ROOT };

// Inline `](target)` links only (reference-style / HTML links are out of scope,
// matching the migrate dangling-gate).
const INLINE_LINK_RE = /\]\(([^)]+)\)/g;

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
const WALK_IGNORE = new Set(['.claude', 'node_modules', 'examples', 'archive', '.git', '.planning']);

const toPosix = (p) => p.split('\\').join('/');
const mkFinding = (check, severity, file, message) => ({ check, severity, file, message });
const findingCmp = (a, b) =>
  a.check.localeCompare(b.check) || a.file.localeCompare(b.file) || a.message.localeCompare(b.message);

function walkDocs(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (WALK_IGNORE.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkDocs(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

/**
 * The public doc surface: README.md + CLAUDE.md + every `.md` under docs/ and
 * analysis/. Deliberately NOT `.planning/` — its own migrate dangling-gate covers
 * it, and its research/plan docs legitimately quote link syntax like `](path.md)`
 * that a standing HARD guard would false-fail. Sorted, deterministic.
 *
 * @param {string} [baseDir=ROOT]
 * @returns {string[]} absolute paths, sorted
 */
export function listDocFiles(baseDir = ROOT) {
  const out = [];
  for (const top of ['README.md', 'CLAUDE.md']) {
    const p = join(baseDir, top);
    if (existsSync(p)) out.push(p);
  }
  for (const dir of ['docs', 'analysis']) {
    walkDocs(join(baseDir, dir), out);
  }
  return out.sort();
}

/**
 * Internal link-health over the public doc surface. A dead internal `.md` link
 * (file-existence) is HARD; an unresolvable `#anchor` on an existing file is SOFT
 * (slug resolution is best-effort to avoid false HARD-fails). External /
 * scheme-prefixed targets are skipped.
 *
 * @param {string} [baseDir=ROOT]
 * @returns {Array<{check: string, severity: string, file: string, message: string}>}
 */
export function checkInternalLinks(baseDir = ROOT) {
  const findings = [];
  for (const f of listDocFiles(baseDir)) {
    let text;
    try {
      text = readFileSync(f, 'utf-8');
    } catch {
      continue;
    }
    if (text.length > FILE_SCAN_CEILING) text = text.slice(0, FILE_SCAN_CEILING);
    const rel = toPosix(relative(baseDir, f));
    for (const m of text.matchAll(INLINE_LINK_RE)) {
      const raw = m[1].trim();
      if (isExternalTarget(raw)) continue;
      const firstTok = raw.split(/\s+/)[0]; // drop an optional "title"
      const [pathPart, anchor] = splitAnchor(firstTok);
      if (!pathPart.endsWith('.md')) continue;
      const abs = resolve(dirname(f), pathPart);
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
  { file: 'docs/map/index.html', kind: 'commands', re: /Command library[^\d\n]*(\d+) commands/ },
  { file: 'docs/map/index.html', kind: 'agents', re: /Agent roster[^\d\n]*(\d+) agents/ },
  { file: 'docs/map/index.html', kind: 'skills', re: /Skill library[^\d\n]*(\d+) skills/ },
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
  const counts = roster(baseDir).counts;
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
  const j = readJsonSafe(join(baseDir, '.claude-plugin', 'plugin.json'));
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
 * Version-consistency (HARD, B7 class): plugin.json version === marketplace ref
 * === latest real CHANGELOG heading (skipping `[Unreleased]`), all normalized by
 * stripping a leading `v`. Drift between any two turns the suite red.
 *
 * @param {string} [baseDir=ROOT]
 * @returns {Array<{check: string, severity: string, file: string, message: string}>}
 */
export function checkVersionConsistency(baseDir = ROOT) {
  const found = [];
  const plugin = readPluginVersion(baseDir);
  const market = readMarketplaceRef(baseDir);
  const changelog = readLatestChangelogVersion(baseDir);
  if (plugin != null) found.push(['.claude-plugin/plugin.json', stripV(plugin)]);
  if (market != null) found.push(['.claude-plugin/marketplace.json', stripV(market)]);
  if (changelog != null) found.push(['CHANGELOG.md', stripV(changelog)]);

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

/** README.md + top-level docs/*.md, minus templates / retros / milestone docs. */
function fillInScope(baseDir) {
  const rels = [];
  if (existsSync(join(baseDir, 'README.md'))) rels.push('README.md');
  let entries;
  try {
    entries = readdirSync(join(baseDir, 'docs'), { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const e of entries) {
    if (e.isFile() && e.name.endsWith('.md')) rels.push(`docs/${e.name}`);
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
 * @param {string} [baseDir=ROOT]
 * @returns {Array<{check: string, severity: string, file: string, message: string}>}
 */
export function checkFillInStubs(baseDir = ROOT) {
  const findings = [];
  for (const rel of fillInScope(baseDir)) {
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
