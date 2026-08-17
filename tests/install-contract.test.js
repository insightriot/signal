import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

/**
 * Install-contract tests — guard against the class of break that bit
 * stranger installs in M4.5.E1 (source-block shorthand resolving to SSH).
 *
 * These tests read the actual repo state, not fixtures. They are the
 * canary for marketplace.json drift.
 */

const marketplaceRaw = JSON.parse(
  readFileSync(join(ROOT, '.claude-plugin/marketplace.json'), 'utf-8')
);

describe('marketplace.json — source block contract', () => {
  let marketplace;
  let plugin;

  it('parses as valid JSON', async () => {
    const raw = await readFile(join(ROOT, '.claude-plugin/marketplace.json'), 'utf-8');
    marketplace = JSON.parse(raw);
    expect(marketplace).toBeTruthy();
  });

  it('has plugins array with at least one entry', async () => {
    const raw = await readFile(join(ROOT, '.claude-plugin/marketplace.json'), 'utf-8');
    marketplace = JSON.parse(raw);
    expect(Array.isArray(marketplace.plugins)).toBe(true);
    expect(marketplace.plugins.length).toBeGreaterThanOrEqual(1);
  });

  it('plugins[0].name === "sig"', async () => {
    const raw = await readFile(join(ROOT, '.claude-plugin/marketplace.json'), 'utf-8');
    marketplace = JSON.parse(raw);
    expect(marketplace.plugins[0].name).toBe('sig');
  });

  it('REGRESSION: the old pinned form fails this guard', () => {
    const fragile = { source: 'url', url: 'https://github.com/InsightRiot/signal.git', ref: 'v0.1.15', sha: '8d20193bad21bc74f9b9639ae77e26718c831aaf' };
    // Proof the guard has teeth: the exact shape that shipped B58 is rejected.
    expect(typeof fragile).not.toBe('string');
    expect(/[a-f0-9]{40}/.test(JSON.stringify(fragile))).toBe(true);
  });

  it('plugins[0].source is the RELATIVE form — no pinned ref or sha to drift (B58)', () => {
    // The plugin IS this repo, so `.` is the whole address. This deletes the
    // bug class rather than guarding it: with no second place to record which
    // commit ships, there is no way for two places to disagree.
    //
    // What this replaced: `{source:'url', url, ref, sha}`. The ref advanced
    // every release, the sha did not, and Claude Code resolves the SHA -- so
    // every install from v0.1.14 to v0.1.15 silently delivered v0.1.13. The
    // old tests here checked the sha's SHAPE and the ref's VALUE and never
    // compared them, which is why eight releases passed clean.
    //
    // Same form as every other marketplace in the wild (prose, cloudflare,
    // openai-codex, anthropics/claude-code all use a relative source).
    expect(
      typeof marketplaceRaw.plugins[0].source,
      'source must be the relative string form; the url+ref+sha form reintroduces B58'
    ).toBe('string');
    // `.` → `./plugin` at M6.E1 S4: the plugin is now a subdirectory of this
    // repo rather than the whole of it. Still the relative STRING form, which
    // is the half B58 turns on — only the path changed.
    expect(marketplaceRaw.plugins[0].source).toBe('./plugin');
  });

  it('carries NO hand-maintained commit pin anywhere (the drift had one home)', () => {
    const asText = JSON.stringify(marketplaceRaw);
    expect(/[a-f0-9]{40}/.test(asText), 'a 40-char sha reappeared in marketplace.json').toBe(false);
    expect(asText).not.toMatch(/"ref"\s*:/);
  });
});

// ---------------------------------------------------------------------------
// FR4 — two catalogs, deliberately different (D-M6E1-4).
//
// The root catalog is fetched by cloning this repo, so its source is a
// relative path. The published catalog is fetched as a bare URL — nothing is
// cloned, so a relative path has nothing to be relative TO, and it must name
// the repo and the subdirectory outright via `git-subdir`.
//
// They therefore CANNOT be byte-equal, and a test demanding they were would
// break one of the two fetch paths. What is pinned instead is the invariant:
// same plugin, and neither one pinned to a commit.
// ---------------------------------------------------------------------------

const publishedRaw = existsSync(join(ROOT, 'docs/map/install/marketplace.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'docs/map/install/marketplace.json'), 'utf-8'))
  : null;

describe('published catalog — the URL-hosted fetch path', () => {
  it('exists at docs/map/install/marketplace.json', () => {
    expect(publishedRaw, 'the published catalog is what removes the 19 MB marketplace clone').toBeTruthy();
  });

  it('AC4.2 — plugins[0].source is the git-subdir object form naming this repo and the subdirectory', () => {
    const source = publishedRaw.plugins[0].source;
    expect(typeof source, 'a URL marketplace downloads only this file; a relative path has nothing to resolve against').toBe('object');
    expect(source.source).toBe('git-subdir');
    expect(source.url).toMatch(/^https:\/\/github\.com\/.+\.git$/);
    expect(source.path).toBe('plugin');
  });

  it('AC4.2 — carries no ref and no sha, so users still track main (D-M5E17-4)', () => {
    // Absence must not read as compliance: JSON.stringify(null) is "null",
    // which contains no sha and no ref and would pass every assertion below.
    // A missing catalog is a failure here, not a clean sheet.
    expect(publishedRaw, 'no published catalog to check — this is a FAIL, not a pass').toBeTruthy();
    const asText = JSON.stringify(publishedRaw);
    expect(/[a-f0-9]{40}/.test(asText), 'a 40-char sha appeared in the published catalog').toBe(false);
    expect(asText).not.toMatch(/"ref"\s*:/);
    expect(asText).not.toMatch(/"sha"\s*:/);
    expect(asText).not.toMatch(/"commit"\s*:/);
  });
});

describe('AC4.3 — the invariant between the two catalogs, not their equality', () => {
  it('both name the same plugin', () => {
    expect(publishedRaw.plugins).toHaveLength(marketplaceRaw.plugins.length);
    expect(publishedRaw.plugins[0].name).toBe(marketplaceRaw.plugins[0].name);
    expect(publishedRaw.name).toBe(marketplaceRaw.name);
  });

  it('neither carries a pin — the property that must survive in BOTH places', () => {
    expect(publishedRaw, 'no published catalog to check — this is a FAIL, not a pass').toBeTruthy();
    for (const [label, catalog] of [['root', marketplaceRaw], ['published', publishedRaw]]) {
      const asText = JSON.stringify(catalog);
      expect(/[a-f0-9]{40}/.test(asText), `${label} catalog gained a sha`).toBe(false);
      expect(asText, `${label} catalog gained a ref`).not.toMatch(/"ref"\s*:/);
    }
  });

  it('they are NOT byte-equal, and that is the point', () => {
    // Stated as an assertion rather than a comment: if someone later
    // "fixes" the difference by copying one over the other, one of the two
    // fetch paths stops working and this is where they find out.
    expect(JSON.stringify(publishedRaw.plugins[0].source))
      .not.toBe(JSON.stringify(marketplaceRaw.plugins[0].source));
  });
});

describe('plugin.json — version field contract', () => {
  it('version is semver-shaped (MAJOR.MINOR.PATCH)', async () => {
    const raw = await readFile(join(ROOT, 'plugin', '.claude-plugin/plugin.json'), 'utf-8');
    const plugin = JSON.parse(raw);
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('version is at least 0.1.1 (the E1 release)', async () => {
    const raw = await readFile(join(ROOT, 'plugin', '.claude-plugin/plugin.json'), 'utf-8');
    const plugin = JSON.parse(raw);
    const [major, minor, patch] = plugin.version.split('.').map(Number);
    const isAtLeast = major > 0 || minor > 1 || (minor === 1 && patch >= 1);
    expect(isAtLeast).toBe(true);
  });
});

describe('CHANGELOG.md — release history', () => {
  it('exists at repo root', () => {
    expect(existsSync(join(ROOT, 'CHANGELOG.md'))).toBe(true);
  });

  it('contains ## [0.1.1] heading', async () => {
    const content = await readFile(join(ROOT, 'CHANGELOG.md'), 'utf-8');
    expect(content).toMatch(/^##\s+\[0\.1\.1\]/m);
  });

  it('contains ## [0.1.0] heading', async () => {
    const content = await readFile(join(ROOT, 'CHANGELOG.md'), 'utf-8');
    expect(content).toMatch(/^##\s+\[0\.1\.0\]/m);
  });
});

// ---------------------------------------------------------------------------
// B58 — closed by DELETION, not by a guard.
//
// The bug: marketplace.json read `ref: "v0.1.15"` with `sha: "8d20193..."`,
// and 8d20193 was v0.1.13's release commit. Claude Code resolves the SHA, so
// every install from v0.1.14 onward silently delivered v0.1.13. Two releases
// were undeliverable and the suite stayed green for all of it, because the
// old tests checked the sha's SHAPE and the ref's VALUE and never compared
// them to each other.
//
// The first fix (2026-08-01) corrected the sha and added a test resolving the
// ref through git. That guarded the problem. The second fix REMOVED it: the
// source is now the relative `.` form, so there is no second place to record
// which commit ships and therefore no way for two places to disagree.
//
// The two assertions above are what remain -- they exist to stop anyone
// reintroducing the pinned form. A guard against the fragile SHAPE, not
// against a stale VALUE.
// ---------------------------------------------------------------------------
