import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PLUGIN = join(ROOT, 'plugin');
const VENDORED = join(PLUGIN, 'node_modules', 'yaml');

/**
 * FR3 — the plugin carries its one dependency instead of installing it.
 *
 * `D-M6E1-7` supersedes `D-M6E1-3`: `yaml` is committed at
 * `plugin/node_modules/yaml/` rather than declared in a manifest.
 *
 * The decision turned on a measurement `M6.E1-RESEARCH.md` §4 got backwards.
 * It described a failed install as costing a tail of commands. Computed
 * transitively, 28 of 51 `tools/lib` modules reach `yaml` and **17 of 20
 * commands break without it** — `archive`, `sweep`, `index` and
 * `migrate-memory` among them, none of which touch `profile.js`/`state.js`.
 * Only `doctor`, `escalate` and `update` survive. A failed dependency install
 * "never blocks the plugin", so that outcome would have arrived silently, at
 * import, on a restricted network.
 *
 * These tests pin the mechanism that removes it: no manifest in the plugin
 * root means Claude Code's automatic dependency install is never triggered,
 * and the bare specifier still resolves because the package is already there.
 */

describe('FR3 — the install trigger is absent from the plugin root', () => {
  // AC3.1 (rewritten under D-M6E1-7). The automatic install fires on a
  // package.json + lockfile pair in the plugin root and "can't be turned off;
  // no setting or environment variable disables it." Absence is the off switch.
  it('has no package.json in the plugin root', () => {
    expect(existsSync(join(PLUGIN, 'package.json'))).toBe(false);
  });

  it('has no lockfile in the plugin root', () => {
    for (const lock of ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml']) {
      expect(existsSync(join(PLUGIN, lock))).toBe(false);
    }
  });
});

describe('FR3 — the vendored dependency', () => {
  it('ships exactly one package under plugin/node_modules', () => {
    const entries = readdirSync(join(PLUGIN, 'node_modules')).filter((e) => !e.startsWith('.'));
    expect(entries).toEqual(['yaml']);
  });

  // AC3.2 (rewritten). The 47 MB this Epic exists to remove was dev tooling.
  it('carries no dev tooling', () => {
    const entries = readdirSync(join(PLUGIN, 'node_modules'));
    for (const banned of ['vitest', 'eslint', 'esbuild']) {
      expect(entries).not.toContain(banned);
    }
  });

  // AC3.3 (rewritten). D-M6E1-3's stated cost was two manifests that can
  // drift. Vendoring replaces that with one copy that can go stale against
  // the root declaration, so the pin moves rather than disappearing.
  it('is pinned to the exact version the root lockfile resolves', () => {
    const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf-8'));
    const locked = lock.packages['node_modules/yaml'];
    const vendored = JSON.parse(readFileSync(join(VENDORED, 'package.json'), 'utf-8'));

    expect(locked).toBeTruthy();
    expect(vendored.version).toBe(locked.version);
  });

  // A dependency of its own would need an install to resolve, which is the
  // whole thing being removed. yaml has none; this fails if that changes.
  it('has no dependencies of its own', () => {
    const vendored = JSON.parse(readFileSync(join(VENDORED, 'package.json'), 'utf-8'));
    expect(vendored.dependencies ?? {}).toEqual({});
  });

  // REVIEW finding. AC3.7 called this copy "provable", and it was only
  // provable by diffing against your own npm install — which requires already
  // trusting that install. LICENSES.md now records the tarball's SHA-256 and
  // the exact commands. This pins the half a test can check offline: that the
  // recorded version and the vendored version are the same number. A stale
  // provenance block claiming an older version is the drift that would make
  // the recorded checksum a lie.
  it('the recorded provenance names the version actually vendored', () => {
    const licenses = readFileSync(join(ROOT, 'LICENSES.md'), 'utf-8');
    const vendored = JSON.parse(readFileSync(join(VENDORED, 'package.json'), 'utf-8'));

    // Scoped to the provenance section, NOT the whole file. The first version
    // of this test asserted `yaml@{version}` appeared anywhere in LICENSES.md
    // and PASSED a mutation that changed the `npm pack` line to 2.8.2 — the
    // "Package: yaml@2.8.3" heading two paragraphs up satisfied it. A token
    // matched in the wrong place is not evidence about the right one, which is
    // the same defect M5.E10's denominator work exists for.
    const start = licenses.indexOf('### Provenance');
    expect(start, 'LICENSES.md must carry a Provenance section').toBeGreaterThan(-1);
    const block = licenses.slice(start, licenses.indexOf('\n## ', start) + 1 || undefined);

    expect(block, 'a checksum a third party can re-derive').toMatch(/[a-f0-9]{64}/);

    // EVERY version the block names must be the vendored one — not "at least
    // one of them". The block states the version twice (the table row and the
    // re-verify instruction), and a `toContain` was satisfied by the second
    // while the first said 2.8.2. Two mutations were needed to find that:
    // the first one "passed" and the passing was the finding.
    const named = [...block.matchAll(/npm pack yaml@([\d.]+)/g)].map((m) => m[1]);
    expect(named.length, 'the block must state the command it was obtained by').toBeGreaterThan(0);
    expect(
      [...new Set(named)],
      `the provenance block names ${[...new Set(named)].join(' and ')}; the vendored copy is ${vendored.version}`
    ).toEqual([vendored.version]);
  });

  // ISC attribution has to travel with the copy.
  it('carries its LICENSE', () => {
    expect(existsSync(join(VENDORED, 'LICENSE'))).toBe(true);
    const vendored = JSON.parse(readFileSync(join(VENDORED, 'package.json'), 'utf-8'));
    expect(vendored.license).toBe('ISC');
  });

  // The copy is faithful, not trimmed: every path its own exports map claims
  // under the conditions Node takes must exist. A pruned copy whose manifest
  // points at absent files is the shape this repo calls a false green.
  it('resolves every file its exports map promises', () => {
    const vendored = JSON.parse(readFileSync(join(VENDORED, 'package.json'), 'utf-8'));
    const claimed = [];
    const walk = (node) => {
      if (typeof node === 'string') claimed.push(node);
      else if (node && typeof node === 'object') Object.values(node).forEach(walk);
    };
    walk(vendored.exports ?? {});

    expect(claimed.length).toBeGreaterThan(0);
    for (const rel of claimed) {
      expect(existsSync(join(VENDORED, rel)), `${rel} is promised by exports but absent`).toBe(true);
    }
  });
});

describe('FR3 — the importers are untouched', () => {
  // This is what distinguishes the chosen option from vendoring into
  // plugin/vendor/ with a rewritten import. Command files and docs cite
  // these modules by path; the import line still naming the package is what
  // keeps those citations describing what actually runs (D-M6E1-3's own
  // reason for rejecting the esbuild bundle).
  it('imports yaml by bare specifier at both sites', () => {
    for (const site of ['profile.js', 'state.js']) {
      const src = readFileSync(join(PLUGIN, 'tools', 'lib', site), 'utf-8');
      expect(src).toMatch(/from ['"]yaml['"]/);
    }
  });

  // The functional proof. Everything above is about files on disk; this is
  // the behaviour they exist to produce.
  it('resolves the bare specifier to the vendored copy from the import sites', () => {
    const require = createRequire(join(PLUGIN, 'tools', 'lib', 'profile.js'));
    const resolved = require.resolve('yaml');
    expect(resolved.startsWith(VENDORED)).toBe(true);
  });
});
