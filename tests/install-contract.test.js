import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

  it('plugins[0].source.source === "url" (not "github" shorthand)', async () => {
    const raw = await readFile(join(ROOT, '.claude-plugin/marketplace.json'), 'utf-8');
    marketplace = JSON.parse(raw);
    expect(marketplace.plugins[0].source.source).toBe('url');
  });

  it('plugins[0].source.url is HTTPS GitHub URL ending in .git', async () => {
    const raw = await readFile(join(ROOT, '.claude-plugin/marketplace.json'), 'utf-8');
    marketplace = JSON.parse(raw);
    expect(marketplace.plugins[0].source.url).toMatch(
      /^https:\/\/github\.com\/[^/]+\/[^/]+\.git$/
    );
  });

  it('plugins[0].source.sha is 40-char hex string', async () => {
    const raw = await readFile(join(ROOT, '.claude-plugin/marketplace.json'), 'utf-8');
    marketplace = JSON.parse(raw);
    expect(marketplace.plugins[0].source.sha).toMatch(/^[a-f0-9]{40}$/);
  });

  it('plugins[0].source.ref matches v<plugin.json.version>', async () => {
    const mRaw = await readFile(join(ROOT, '.claude-plugin/marketplace.json'), 'utf-8');
    marketplace = JSON.parse(mRaw);
    const pRaw = await readFile(join(ROOT, '.claude-plugin/plugin.json'), 'utf-8');
    plugin = JSON.parse(pRaw);
    expect(marketplace.plugins[0].source.ref).toBe(`v${plugin.version}`);
  });
});

describe('plugin.json — version field contract', () => {
  it('version is semver-shaped (MAJOR.MINOR.PATCH)', async () => {
    const raw = await readFile(join(ROOT, '.claude-plugin/plugin.json'), 'utf-8');
    const plugin = JSON.parse(raw);
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('version is at least 0.1.1 (the E1 release)', async () => {
    const raw = await readFile(join(ROOT, '.claude-plugin/plugin.json'), 'utf-8');
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
