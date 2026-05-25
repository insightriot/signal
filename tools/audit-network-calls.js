#!/usr/bin/env node

/**
 * Privacy-posture audit — greps Signal's source for any code that
 * could initiate a network call. The mechanism behind README's
 * "no network calls beyond Claude's API" claim.
 *
 * SCOPE (default, when invoked with no arguments)
 *   Include:  tools/  skills/  agents/  commands/   (recursive)
 *   Files:    *.js, *.json
 *   Exclude:  node_modules/  tests/  .planning/  analysis/  *.md
 *             audit-network-calls.js itself
 *
 * SCOPE (when invoked with a directory argument)
 *   Scans the given directory recursively, applying only the file-type
 *   filter (*.js, *.json) and self-exclusion. Default-exclude paths are
 *   NOT honored — the explicit argument is treated as a deliberate
 *   override (used by tests/audit-network-calls.test.js to feed a
 *   seeded fixture under tests/).
 *
 * COVERAGE
 *   Covers Signal's own source. Does NOT scan transitive npm
 *   dependencies — those are upstream responsibilities. The audit's
 *   scope is documented in README's Privacy & telemetry section.
 *
 * EXIT
 *   0 — no patterns matched
 *   1 — at least one pattern matched (per-hit lines printed to stdout)
 *   2 — usage error (explicit argument is not a directory or doesn't exist;
 *       per-error message printed to stderr)
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SELF = fileURLToPath(import.meta.url);

const DEFAULT_INCLUDE = ['tools', 'skills', 'agents', 'commands'];
const DEFAULT_EXCLUDE_DIRS = new Set(['node_modules', 'tests', '.planning', 'analysis']);
const INCLUDE_EXTS = new Set(['.js', '.json']);

// "got" is intentionally absent from the bare-word pattern: it's a
// hyper-common English word ("got X", "we got Y") that produces
// pervasive false positives in error-message strings. The require/
// import patterns below still catch the `got` module being loaded —
// the actual entry point for any network call using it.
const PATTERNS = [
  /\bfetch\s*\(/,
  /\b(axios|node-fetch)\b/,
  /\bhttps?\.request\b/,
  /require\s*\(['"`](https?|node-fetch|axios|got)/,
  /import\s+.+\s+from\s+['"](https?|node-fetch|axios|got)/,
  /child_process[^)]*?(curl|wget)/,
];

function walk(dir, applyDefaultExcludes, hits) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (applyDefaultExcludes && DEFAULT_EXCLUDE_DIRS.has(entry.name)) continue;
      walk(full, applyDefaultExcludes, hits);
    } else if (entry.isFile()) {
      if (full === SELF) continue;
      if (!INCLUDE_EXTS.has(extname(entry.name))) continue;
      scan(full, hits);
    }
  }
}

function scan(file, hits) {
  let content;
  try {
    content = readFileSync(file, 'utf-8');
  } catch {
    return;
  }
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of PATTERNS) {
      if (pattern.test(lines[i])) {
        hits.push({ file, line: i + 1, match: pattern.source });
        break;
      }
    }
  }
}

function main() {
  const args = process.argv.slice(2);
  const hits = [];

  if (args.length === 0) {
    for (const subdir of DEFAULT_INCLUDE) {
      const dir = join(ROOT, subdir);
      if (existsSync(dir)) walk(dir, true, hits);
    }
  } else {
    const target = args[0];
    if (!existsSync(target)) {
      console.error('audit-network-calls: directory not found: ' + target);
      process.exit(2);
    }
    const st = statSync(target);
    if (!st.isDirectory()) {
      console.error('audit-network-calls: not a directory: ' + target);
      process.exit(2);
    }
    walk(target, false, hits);
  }

  if (hits.length === 0) {
    process.exit(0);
  }

  for (const hit of hits) {
    const rel = relative(ROOT, hit.file);
    console.log('✗ found network call: ' + rel + ':' + hit.line);
  }
  process.exit(1);
}

main();
