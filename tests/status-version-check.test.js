// Tests for /sig:status version-check — M4.5.E8.S3.
// FR6 + D-E8-7 (use /tags, not /releases/latest).
// All API access is mocked via fetchFn injection — tests NEVER touch the
// live GitHub API (RESEARCH § 7 Risk 3 mitigation).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  fetchLatestTag,
  readVersionCache,
  writeVersionCache,
  fetchLatestVersionCached,
  compareVersions,
  computeStalenessRecommendation,
} from '../tools/lib/doctor.js';

import { readStalenessWarning, formatStalenessWarning } from '../tools/lib/status.js';

// ---- fetchLatestTag ----

describe('fetchLatestTag (D-E8-7 — /tags endpoint, name field, strip leading v)', () => {
  it('returns the first array element name on happy 200 path', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { name: 'v0.1.2', commit: { sha: 'abc' } },
        { name: 'v0.1.1', commit: { sha: 'def' } },
      ],
    });
    const result = await fetchLatestTag({ fetchFn });
    expect(result).toBe('v0.1.2');
    expect(fetchFn).toHaveBeenCalledWith(
      'https://api.github.com/repos/InsightRiot/signal/tags',
      expect.any(Object)
    );
  });

  it('returns null on HTTP 404 (no tags / repo not found)', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    expect(await fetchLatestTag({ fetchFn })).toBeNull();
  });

  it('returns null on empty array response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    expect(await fetchLatestTag({ fetchFn })).toBeNull();
  });

  it('returns null on malformed JSON response', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new SyntaxError('Unexpected token in JSON');
      },
    });
    expect(await fetchLatestTag({ fetchFn })).toBeNull();
  });

  it('returns null on network error / timeout', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('AbortError'));
    expect(await fetchLatestTag({ fetchFn })).toBeNull();
  });
});

// ---- 24h cache helpers ----

describe('readVersionCache / writeVersionCache', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sig-version-cache-'));
    await mkdir(join(tempDir, '.claude'), { recursive: true });
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns null when cache file does not exist (miss)', async () => {
    expect(await readVersionCache({ homeDir: tempDir })).toBeNull();
  });

  it('round-trips a cache write: write then read returns the same data', async () => {
    await writeVersionCache({ homeDir: tempDir, data: { name: 'v0.1.2' } });
    const cached = await readVersionCache({ homeDir: tempDir });
    expect(cached).toMatchObject({ data: { name: 'v0.1.2' } });
    expect(cached.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO timestamp
  });

  it('returns null when cache file is corrupt JSON (invalid → miss)', async () => {
    await writeFile(join(tempDir, '.claude', '.sig-version-cache.json'), '{not json');
    expect(await readVersionCache({ homeDir: tempDir })).toBeNull();
  });
});

// ---- fetchLatestVersionCached (composes cache + fetch + TTL) ----

describe('fetchLatestVersionCached', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sig-vfetch-cached-'));
    await mkdir(join(tempDir, '.claude'), { recursive: true });
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('on cache miss, hits the network and writes the cache', async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ name: 'v0.1.2' }],
    });
    const result = await fetchLatestVersionCached({ homeDir: tempDir, fetchFn });
    expect(result).toBe('v0.1.2');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(existsSync(join(tempDir, '.claude', '.sig-version-cache.json'))).toBe(true);
  });

  it('within 24h TTL, returns cached value WITHOUT calling fetch', async () => {
    // Seed cache 1h ago.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await writeFile(
      join(tempDir, '.claude', '.sig-version-cache.json'),
      JSON.stringify({ fetched_at: oneHourAgo, data: { name: 'v0.1.2' } })
    );
    const fetchFn = vi.fn();
    const result = await fetchLatestVersionCached({ homeDir: tempDir, fetchFn });
    expect(result).toBe('v0.1.2');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('after TTL expires, refetches and updates cache', async () => {
    // Seed cache 25h ago.
    const ttlExpired = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await writeFile(
      join(tempDir, '.claude', '.sig-version-cache.json'),
      JSON.stringify({ fetched_at: ttlExpired, data: { name: 'v0.1.1' } })
    );
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ name: 'v0.1.2' }],
    });
    const result = await fetchLatestVersionCached({ homeDir: tempDir, fetchFn });
    expect(result).toBe('v0.1.2');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

// ---- compareVersions (RESEARCH § 4 table) ----

describe('compareVersions (hand-rolled 3-part numeric, NOT semver dep)', () => {
  it.each([
    ['0.1.2', 'v0.1.10', 'stale'],   // 1.10 > 1.2 numerically
    ['0.1.2', 'v0.1.2', 'current'],
    ['0.1.10', 'v0.1.2', 'newer'],   // installed ahead
    ['v0.1.2', 'v0.1.2', 'current'], // leading v on installed too
    ['0.1.3-rc1', 'v0.1.3', 'current'], // pre-release suffix ignored
    ['0.1.3', 'v0.1.2', 'newer'],    // v0.1.3 unreleased case (installed newer than tag)
  ])('compareVersions(%s, %s) → %s', (installed, latest, expected) => {
    expect(compareVersions(installed, latest)).toBe(expected);
  });
});

// ---- computeStalenessRecommendation (FR6 matrix) ----

describe('computeStalenessRecommendation (FR6 4-row matrix)', () => {
  it('stale + no P-states → recommend /plugin install', () => {
    const r = computeStalenessRecommendation({ installed: '0.1.2', latest: 'v0.1.3', pStatesDetected: false });
    expect(r).toMatch(/plugin install/);
  });

  it('stale + P-states → recommend /sig:doctor --reinstall', () => {
    const r = computeStalenessRecommendation({ installed: '0.1.2', latest: 'v0.1.3', pStatesDetected: true });
    expect(r).toMatch(/--reinstall/);
  });

  it('current + P-states → recommend /sig:doctor --fix', () => {
    const r = computeStalenessRecommendation({ installed: '0.1.3', latest: 'v0.1.3', pStatesDetected: true });
    expect(r).toMatch(/--fix/);
  });

  it('current + no P-states → null (no warning shown)', () => {
    const r = computeStalenessRecommendation({ installed: '0.1.3', latest: 'v0.1.3', pStatesDetected: false });
    expect(r).toBeNull();
  });

  it('latest unknown (API failed / no tags) → null (silent skip)', () => {
    const r = computeStalenessRecommendation({ installed: '0.1.3', latest: null, pStatesDetected: false });
    expect(r).toBeNull();
  });
});

// ---- readStalenessWarning orchestrator (S3.t9) ----

describe('readStalenessWarning (advisory; never throws)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sig-stale-warn-'));
    await mkdir(join(tempDir, '.claude', 'plugins'), { recursive: true });
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function seedHealthyInstall(version) {
    const versionDir = join(tempDir, '.claude', 'plugins', 'cache', 'signal', 'sig', version);
    await mkdir(join(versionDir, '.claude-plugin'), { recursive: true });
    await writeFile(
      join(versionDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: 'sig', version })
    );
    await writeFile(
      join(tempDir, '.claude', 'plugins', 'installed_plugins.json'),
      JSON.stringify({
        version: 2,
        plugins: {
          'sig@signal': [{
            scope: 'user',
            installPath: versionDir,
            version,
            gitCommitSha: 'abc',
          }],
        },
      })
    );
    await writeFile(
      join(tempDir, '.claude', 'settings.json'),
      JSON.stringify({ enabledPlugins: { 'sig@signal': true } })
    );
  }

  it('returns null when no Signal install present', async () => {
    // tempDir has no installed_plugins.json at all
    const result = await readStalenessWarning({ homeDir: tempDir });
    expect(result).toBeNull();
  });

  it('returns null on healthy install at current version (no warning shown)', async () => {
    await seedHealthyInstall('0.1.2');
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ name: 'v0.1.2' }],
    });
    const result = await readStalenessWarning({ homeDir: tempDir, fetchFn });
    expect(result).toBeNull();
  });

  it('returns a banner when installed version is older than latest tag', async () => {
    await seedHealthyInstall('0.1.1');
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ name: 'v0.1.2' }],
    });
    const result = await readStalenessWarning({ homeDir: tempDir, fetchFn });
    expect(result).toMatch(/Signal v0\.1\.1 installed/);
    expect(result).toMatch(/v0\.1\.2/); // latest mentioned
    expect(result).toMatch(/plugin install/); // stale + no P-states → /plugin install
  });

  it('returns null (does not throw) when the API throws unexpectedly', async () => {
    await seedHealthyInstall('0.1.2');
    const fetchFn = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await readStalenessWarning({ homeDir: tempDir, fetchFn });
    // current installed but latest unknown → null (silent skip)
    expect(result).toBeNull();
  });
});

// ---- docs/install-troubleshooting.md reframe lint (S3.t11) ----

describe('install-troubleshooting.md ownership reframe (S3.t11)', () => {
  let docContent;
  beforeEach(async () => {
    docContent = await readFile(
      join(process.cwd(), 'docs/install-troubleshooting.md'),
      'utf8'
    );
  });

  it('opens with the FR8 ownership statement and /sig:doctor lead-in', () => {
    // Statement appears in the first 1KB so it lands above the fold.
    const head = docContent.slice(0, 1500);
    expect(head).toMatch(/Claude Code plugin-host bugs, not Signal bugs/);
    expect(head).toMatch(/Run `\/sig:doctor` first/);
  });

  it('each of the 5 symptom sections carries an explicit Owner tag', () => {
    // Symptom 1 (P1), 2 (P2), 3 (P3): Claude Code plugin host
    // Symptom 4: Signal (historical)
    // Symptom 5: Environmental
    expect(docContent).toMatch(/## Symptom 1[\s\S]*?\*\*Owner:\*\* Claude Code plugin host/);
    expect(docContent).toMatch(/## Symptom 2[\s\S]*?\*\*Owner:\*\* Claude Code plugin host/);
    expect(docContent).toMatch(/## Symptom 3[\s\S]*?\*\*Owner:\*\* Claude Code plugin host/);
    expect(docContent).toMatch(/## Symptom 4[\s\S]*?\*\*Owner:\*\* Signal/);
    expect(docContent).toMatch(/## Symptom 5[\s\S]*?\*\*Owner:\*\* Environmental/);
  });
});
