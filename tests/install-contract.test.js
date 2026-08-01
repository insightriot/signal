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

// ---------------------------------------------------------------------------
// B58 — the pinned sha must RESOLVE to the ref tag, not merely look like a sha.
//
// Found 2026-08-01 by the user running `/plugin` -> update and being told
// "sig is already at the latest version (0.1.13)" -- two releases after
// v0.1.14 shipped and twenty minutes after v0.1.15 did.
//
// marketplace.json read `ref: "v0.1.15"` with `sha: "8d20193..."`, and
// 8d20193 is v0.1.13's release commit. Claude Code resolves the SHA, so the
// ref was decorative: every install since v0.1.14 silently delivered v0.1.13.
//
// The two assertions above are why it survived. One checks the sha's SHAPE
// (40 hex chars -- a stale sha passes). The other checks the REF against
// plugin.json (correct, and not the field being resolved). Neither compares
// the two fields to each other, so `ref` advanced every release while `sha`
// sat still and the suite stayed green. B7 noted this exact drift at v0.1.7
// as "secondary drift (needs a look, not the test cause)" and it was never
// closed -- the note was the guard.
// ---------------------------------------------------------------------------
describe('B58 — marketplace sha resolves to the ref tag', () => {
  it('source.sha is the commit that source.ref points at', async () => {
    const { execFileSync } = await import('node:child_process');
    const raw = await readFile(join(ROOT, '.claude-plugin/marketplace.json'), 'utf-8');
    const { ref, sha } = JSON.parse(raw).plugins[0].source;

    let resolved;
    try {
      resolved = execFileSync('git', ['rev-list', '-n1', ref], {
        cwd: ROOT,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      // Deliberately a FAILURE, not a silent skip. This guard protects the
      // release from never reaching a user; a checkout that cannot verify it
      // must say so loudly. CI uses fetch-depth: 0, so tags are present there.
      throw new Error(
        `cannot resolve tag ${ref} — run \`git fetch --tags\` and re-run. ` +
          `This check must never pass by being unable to run (B58).`
      );
    }

    expect(
      sha,
      `marketplace.json pins sha ${sha.slice(0, 7)} but ${ref} is ${resolved.slice(0, 7)}. ` +
        `Claude Code resolves the SHA, so users would receive the wrong release. ` +
        `Bump the sha whenever you bump the ref.`
    ).toBe(resolved);
  });
});
