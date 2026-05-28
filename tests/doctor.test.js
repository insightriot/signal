// Tests for /sig:doctor — M4.5.E8.
// S1.t2 (RED) — detector unit tests against in-memory state objects.
// See .planning/M4.5.E8-PLAN.md § S1 + .planning/M4.5.E8-RESEARCH.md § 3.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  detectP1StaleGitCommitSha,
  detectP2OrphanCacheEntry,
  detectP3OrphanEnabledFlag,
  detectP4PreRenameSlug,
  detectP5SshMultiIdentity,
  runAllDetectors,
  readInstallState,
  checkDoctorEnvironment,
  DoctorDetectionError,
  DoctorEnvironmentError,
} from '../tools/lib/doctor.js';

// ---- detectP1 ----

describe('detectP1StaleGitCommitSha', () => {
  it('detects when cached plugin.json version is older than manifest version', () => {
    const manifest = {
      plugins: {
        'sig@signal': [{
          installPath: '/Users/x/.claude/plugins/cache/signal/sig/0.1.2',
          version: '0.1.2',
          gitCommitSha: 'abc123',
          scope: 'user',
        }],
      },
    };
    const fsImpl = {
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ version: '0.1.0' }),
    };
    const result = detectP1StaleGitCommitSha(manifest, fsImpl);
    expect(result.detected).toBe(true);
    expect(result.code).toBe('P1');
    expect(result.recommendation).toBe('--reinstall');
    expect(result.evidence).toMatchObject({
      manifestVer: '0.1.2',
      cachedVer: '0.1.0',
      sha: 'abc123',
    });
  });

  it('Signal-scoped narrowing — non-Signal stale entries are ignored (D-E8-11)', () => {
    const manifest = {
      plugins: {
        'other@somemarket': [{
          installPath: '/Users/x/.claude/plugins/cache/somemarket/other/1.0.0',
          version: '1.0.0',
          gitCommitSha: 'xyz',
        }],
      },
    };
    const fsImpl = {
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ version: '0.9.0' }), // would be stale if checked
    };
    const result = detectP1StaleGitCommitSha(manifest, fsImpl);
    expect(result.detected).toBe(false);
    expect(result.code).toBe('P1');
  });
});

// ---- detectP2 ----

describe('detectP2OrphanCacheEntry', () => {
  it('detects orphan version dirs under signal/sig/ not referenced by manifest', () => {
    const manifest = {
      plugins: {
        'sig@signal': [{
          installPath: '/Users/x/.claude/plugins/cache/signal/sig/0.1.2',
          version: '0.1.2',
        }],
      },
    };
    const fsImpl = {
      existsSync: (p) => p === '/Users/x/.claude/plugins/cache/signal/sig',
      readdirSync: () => ['0.1.0', '0.1.1', '0.1.2'],
    };
    const result = detectP2OrphanCacheEntry(manifest, fsImpl, '/Users/x');
    expect(result.detected).toBe(true);
    expect(result.code).toBe('P2');
    expect(result.recommendation).toBe('--fix');
    expect(result.evidence).toEqual(expect.arrayContaining([
      expect.stringContaining('0.1.0'),
      expect.stringContaining('0.1.1'),
    ]));
    expect(result.evidence).not.toEqual(expect.arrayContaining([
      expect.stringContaining('0.1.2'), // current install — NOT orphan
    ]));
  });

  it('Signal-scoped narrowing — orphans under non-signal marketplaces are ignored (D-E8-11)', () => {
    const manifest = {
      plugins: {
        'other@somemarket': [{
          installPath: '/Users/x/.claude/plugins/cache/somemarket/other/1.0.0',
          version: '1.0.0',
        }],
      },
    };
    // Cache layout: only somemarket/other exists; no signal/ at all.
    const fsImpl = {
      existsSync: (p) => false, // no signal/ tree
      readdirSync: () => [],
    };
    const result = detectP2OrphanCacheEntry(manifest, fsImpl, '/Users/x');
    expect(result.detected).toBe(false);
  });
});

// ---- detectP3 ----

describe('detectP3OrphanEnabledFlag', () => {
  it('detects sig@signal in enabledPlugins without matching installed entry', () => {
    const settings = {
      enabledPlugins: {
        'sig@signal': false, // disabled state lingering after uninstall
      },
    };
    const manifest = { plugins: {} }; // no Signal install
    const result = detectP3OrphanEnabledFlag(settings, manifest);
    expect(result.detected).toBe(true);
    expect(result.code).toBe('P3');
    expect(result.recommendation).toBe('--fix');
    expect(result.evidence).toContain('sig@signal');
  });

  it('Signal-scoped narrowing — non-Signal orphan enabled flags are ignored (D-E8-11)', () => {
    const settings = {
      enabledPlugins: {
        'other@somemarket': true, // would be orphan if checked
      },
    };
    const manifest = { plugins: {} };
    const result = detectP3OrphanEnabledFlag(settings, manifest);
    expect(result.detected).toBe(false);
  });
});

// ---- detectP4 ----

describe('detectP4PreRenameSlug', () => {
  it('detects signal@signal pre-rename slug anywhere (cache + manifest + settings)', () => {
    const manifest = {
      plugins: {
        'signal@signal': [{ installPath: '/foo', version: '0.1.0' }],
      },
    };
    const settings = {
      enabledPlugins: { 'signal@signal': true },
    };
    const fsImpl = {
      existsSync: (p) => p.includes('/.claude/plugins/cache/signal/signal'),
    };
    const result = detectP4PreRenameSlug(manifest, settings, fsImpl, '/Users/x');
    expect(result.detected).toBe(true);
    expect(result.code).toBe('P4');
    expect(result.recommendation).toBe('--fix');
    expect(result.evidence.length).toBeGreaterThan(0);
  });
});

// ---- detectP5 ----

describe('detectP5SshMultiIdentity', () => {
  it('detects multi-identity Host github.com-* without default Host github.com (info-only)', () => {
    const sshConfig = [
      'Host github.com-personal',
      '  HostName github.com',
      '  IdentityFile ~/.ssh/id_personal',
      '',
      'Host github.com-work',
      '  HostName github.com',
      '  IdentityFile ~/.ssh/id_work',
    ].join('\n');
    const fsImpl = {
      existsSync: () => true,
      readFileSync: () => sshConfig,
    };
    const result = detectP5SshMultiIdentity(fsImpl, '/Users/x');
    expect(result.detected).toBe(true);
    expect(result.code).toBe('P5');
    expect(result.recommendation).toBe('info-only');
  });
});

// ---- runAllDetectors aggregate ----

describe('runAllDetectors', () => {
  // Helpers for building healthy baseline state.
  const HEALTHY_FS = {
    existsSync: () => false, // no cache/, no .ssh/config → all detectors return clean
    readdirSync: () => [],
    readFileSync: () => '',
  };
  const HEALTHY_STATE = {
    manifest: { plugins: {} },
    settings: { enabledPlugins: {} },
    fsImpl: HEALTHY_FS,
    homeDir: '/Users/x',
  };

  it('returns healthy:true, empty findings, null recommendation when nothing detected', () => {
    const result = runAllDetectors(HEALTHY_STATE);
    expect(result.healthy).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.aggregate_recommendation).toBeNull();
  });

  it('returns --fix when only P3 detected (single P-state, surgical)', () => {
    const state = {
      ...HEALTHY_STATE,
      settings: { enabledPlugins: { 'sig@signal': false } },
      manifest: { plugins: {} },
    };
    const result = runAllDetectors(state);
    expect(result.healthy).toBe(false);
    expect(result.findings.map((f) => f.code)).toEqual(['P3']);
    expect(result.aggregate_recommendation).toBe('--fix');
  });

  it('returns --reinstall when P1 detected, even alongside other lower-severity findings', () => {
    const state = {
      ...HEALTHY_STATE,
      manifest: {
        plugins: {
          'sig@signal': [{
            installPath: '/Users/x/.claude/plugins/cache/signal/sig/0.1.2',
            version: '0.1.2',
            gitCommitSha: 'abc',
          }],
        },
      },
      settings: { enabledPlugins: { 'sig@old@signal': true } }, // would be P3
      fsImpl: {
        existsSync: () => true, // cache dir present
        readdirSync: () => ['0.1.2'], // matches manifest — no P2
        readFileSync: () => JSON.stringify({ version: '0.1.0' }), // stale → P1
      },
    };
    const result = runAllDetectors(state);
    expect(result.healthy).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain('P1');
    expect(result.aggregate_recommendation).toBe('--reinstall');
  });

  it('keeps healthy:true when only P5 (info-only) fires', () => {
    const state = {
      ...HEALTHY_STATE,
      fsImpl: {
        existsSync: (p) => p.endsWith('/.ssh/config'),
        readdirSync: () => [],
        readFileSync: () => 'Host github.com-personal\n  HostName github.com\n',
      },
    };
    const result = runAllDetectors(state);
    expect(result.healthy).toBe(true);
    expect(result.findings.map((f) => f.code)).toEqual(['P5']);
    expect(result.aggregate_recommendation).toBeNull();
  });
});

// ---- readInstallState IO orchestrator ----

describe('readInstallState', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sig-doctor-readstate-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeFixtureFile(relPath, content) {
    const fullPath = join(tempDir, relPath);
    await mkdir(join(fullPath, '..'), { recursive: true });
    await writeFile(fullPath, content);
  }

  it('reads manifest + settings into a state object suitable for runAllDetectors', async () => {
    await writeFixtureFile(
      '.claude/plugins/installed_plugins.json',
      JSON.stringify({
        version: 2,
        plugins: { 'sig@signal': [{ installPath: '/foo', version: '0.1.2' }] },
      })
    );
    await writeFixtureFile(
      '.claude/settings.json',
      JSON.stringify({ enabledPlugins: { 'sig@signal': true } })
    );

    const state = readInstallState({ homeDir: tempDir });
    expect(state.homeDir).toBe(tempDir);
    expect(state.manifest.plugins['sig@signal'][0].version).toBe('0.1.2');
    expect(state.settings.enabledPlugins['sig@signal']).toBe(true);
    expect(state.fsImpl).toBeDefined();
  });

  it('returns empty-default manifest + settings when files are missing', () => {
    // No files created in tempDir; both reads should return defaults.
    const state = readInstallState({ homeDir: tempDir });
    expect(state.manifest).toEqual({ plugins: {} });
    expect(state.settings).toEqual({ enabledPlugins: {} });
  });

  it('throws DoctorDetectionError on malformed installed_plugins.json (concurrent /plugin install write)', async () => {
    await writeFixtureFile('.claude/plugins/installed_plugins.json', '{ malformed json'); // truncated mid-write
    expect(() => readInstallState({ homeDir: tempDir })).toThrow(DoctorDetectionError);
  });

  it('throws DoctorDetectionError on malformed settings.json', async () => {
    await writeFixtureFile(
      '.claude/plugins/installed_plugins.json',
      JSON.stringify({ plugins: {} })
    );
    await writeFixtureFile('.claude/settings.json', 'not-json-at-all');
    expect(() => readInstallState({ homeDir: tempDir })).toThrow(DoctorDetectionError);
  });
});

// ---- End-to-end fixture-based integration ----
// Per M4.5.E8-PLAN.md § S1.t6: 6 fixture scenarios exercising the full
// readInstallState → runAllDetectors pipeline against real filesystem state.

async function buildDoctorFixture(homeDir, scenario) {
  const claudeDir = join(homeDir, '.claude');
  const pluginsDir = join(claudeDir, 'plugins');
  const cacheRoot = join(pluginsDir, 'cache', 'signal');
  await mkdir(claudeDir, { recursive: true });
  await mkdir(pluginsDir, { recursive: true });

  async function writeCachePluginJson(slug, version) {
    const versionDir = join(cacheRoot, slug, version);
    await mkdir(join(versionDir, '.claude-plugin'), { recursive: true });
    await writeFile(
      join(versionDir, '.claude-plugin', 'plugin.json'),
      JSON.stringify({ name: slug, version }, null, 2)
    );
    return versionDir;
  }
  async function writeManifest(plugins) {
    await writeFile(
      join(pluginsDir, 'installed_plugins.json'),
      JSON.stringify({ version: 2, plugins }, null, 2)
    );
  }
  async function writeSettings(settings) {
    await writeFile(join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2));
  }

  switch (scenario) {
    case 'healthy': {
      const installPath = await writeCachePluginJson('sig', '0.1.2');
      await writeManifest({
        'sig@signal': [{ scope: 'user', installPath, version: '0.1.2', gitCommitSha: 'abc' }],
      });
      await writeSettings({ enabledPlugins: { 'sig@signal': true } });
      return;
    }
    case 'p1-stale-sha': {
      // Manifest says 0.1.2, but the cached plugin.json reports 0.1.0 (the short-circuit bug).
      const versionDir = join(cacheRoot, 'sig', '0.1.2');
      await mkdir(join(versionDir, '.claude-plugin'), { recursive: true });
      await writeFile(
        join(versionDir, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'sig', version: '0.1.0' }, null, 2) // stale
      );
      await writeManifest({
        'sig@signal': [{ scope: 'user', installPath: versionDir, version: '0.1.2', gitCommitSha: 'abc' }],
      });
      await writeSettings({ enabledPlugins: { 'sig@signal': true } });
      return;
    }
    case 'p2-orphan-cache': {
      // Three version dirs in cache; manifest only points at 0.1.2.
      await writeCachePluginJson('sig', '0.1.0');
      await writeCachePluginJson('sig', '0.1.1');
      const installPath = await writeCachePluginJson('sig', '0.1.2');
      await writeManifest({
        'sig@signal': [{ scope: 'user', installPath, version: '0.1.2', gitCommitSha: 'abc' }],
      });
      await writeSettings({ enabledPlugins: { 'sig@signal': true } });
      return;
    }
    case 'p3-disabled-orphan': {
      // settings.enabledPlugins still has sig@signal: false but manifest has no plugin.
      await writeManifest({}); // no Signal install at all
      await writeSettings({ enabledPlugins: { 'sig@signal': false } });
      return;
    }
    case 'p4-pre-rename': {
      // Pre-rename cache dir present alongside healthy current install.
      const installPath = await writeCachePluginJson('sig', '0.1.2');
      await writeCachePluginJson('signal', '0.1.0'); // the pre-rename orphan
      await writeManifest({
        'sig@signal': [{ scope: 'user', installPath, version: '0.1.2', gitCommitSha: 'abc' }],
      });
      await writeSettings({ enabledPlugins: { 'sig@signal': true } });
      return;
    }
    case 'combined-p1-p3': {
      // P1 (stale cache) + P3 (orphan enabled flag for a previously-uninstalled plugin).
      const versionDir = join(cacheRoot, 'sig', '0.1.2');
      await mkdir(join(versionDir, '.claude-plugin'), { recursive: true });
      await writeFile(
        join(versionDir, '.claude-plugin', 'plugin.json'),
        JSON.stringify({ name: 'sig', version: '0.1.0' }, null, 2) // stale → P1
      );
      await writeManifest({
        'sig@signal': [{ scope: 'user', installPath: versionDir, version: '0.1.2', gitCommitSha: 'abc' }],
      });
      await writeSettings({
        enabledPlugins: {
          'sig@signal': true,
          'sig@otherplugin': true, // orphan enabled flag → P3
        },
      });
      return;
    }
    default:
      throw new Error(`unknown fixture scenario: ${scenario}`);
  }
}

describe('end-to-end: readInstallState + runAllDetectors against fixture trees', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sig-doctor-fixture-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('healthy fixture → healthy:true, no findings, no recommendation', async () => {
    await buildDoctorFixture(tempDir, 'healthy');
    const result = runAllDetectors(readInstallState({ homeDir: tempDir }));
    expect(result.healthy).toBe(true);
    expect(result.findings).toEqual([]);
    expect(result.aggregate_recommendation).toBeNull();
  });

  it('p1-stale-sha fixture → P1 detected, --reinstall recommended', async () => {
    await buildDoctorFixture(tempDir, 'p1-stale-sha');
    const result = runAllDetectors(readInstallState({ homeDir: tempDir }));
    expect(result.healthy).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain('P1');
    expect(result.aggregate_recommendation).toBe('--reinstall');
  });

  it('p2-orphan-cache fixture → P2 detected on 0.1.0 + 0.1.1, 0.1.2 not flagged, --fix', async () => {
    await buildDoctorFixture(tempDir, 'p2-orphan-cache');
    const result = runAllDetectors(readInstallState({ homeDir: tempDir }));
    expect(result.healthy).toBe(false);
    const p2 = result.findings.find((f) => f.code === 'P2');
    expect(p2).toBeDefined();
    expect(p2.evidence.some((p) => p.endsWith('/0.1.0'))).toBe(true);
    expect(p2.evidence.some((p) => p.endsWith('/0.1.1'))).toBe(true);
    expect(p2.evidence.some((p) => p.endsWith('/0.1.2'))).toBe(false);
    expect(result.aggregate_recommendation).toBe('--fix');
  });

  it('p3-disabled-orphan fixture → P3 detected, --fix recommended', async () => {
    await buildDoctorFixture(tempDir, 'p3-disabled-orphan');
    const result = runAllDetectors(readInstallState({ homeDir: tempDir }));
    expect(result.healthy).toBe(false);
    const p3 = result.findings.find((f) => f.code === 'P3');
    expect(p3).toBeDefined();
    expect(p3.evidence).toContain('sig@signal');
    expect(result.aggregate_recommendation).toBe('--fix');
  });

  it('p4-pre-rename fixture → P4 detected on cache:signal/signal/, --fix', async () => {
    await buildDoctorFixture(tempDir, 'p4-pre-rename');
    const result = runAllDetectors(readInstallState({ homeDir: tempDir }));
    expect(result.healthy).toBe(false);
    const p4 = result.findings.find((f) => f.code === 'P4');
    expect(p4).toBeDefined();
    expect(p4.evidence.some((e) => e.includes('cache:'))).toBe(true);
    expect(result.aggregate_recommendation).toBe('--fix');
  });

  it('combined-p1-p3 fixture → both detected, --reinstall (P1 dominates)', async () => {
    await buildDoctorFixture(tempDir, 'combined-p1-p3');
    const result = runAllDetectors(readInstallState({ homeDir: tempDir }));
    expect(result.healthy).toBe(false);
    const codes = result.findings.map((f) => f.code);
    expect(codes).toContain('P1');
    expect(codes).toContain('P3');
    expect(result.aggregate_recommendation).toBe('--reinstall');
  });
});

// ---- Platform gating (D-E8-2: macOS-only first ship; positive allowlist) ----

describe('checkDoctorEnvironment', () => {
  const okFs = { existsSync: () => true };

  it('throws DoctorEnvironmentError on Linux with platform name in message', () => {
    let thrown;
    try {
      checkDoctorEnvironment({ platform: 'linux', homeDir: '/home/user', fsImpl: okFs });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(DoctorEnvironmentError);
    expect(thrown.message).toMatch(/linux/);
    expect(thrown.message).toMatch(/macOS only/);
  });

  it('throws DoctorEnvironmentError on win32', () => {
    expect(() =>
      checkDoctorEnvironment({ platform: 'win32', homeDir: 'C:\\Users\\x', fsImpl: okFs })
    ).toThrow(DoctorEnvironmentError);
  });

  it('throws DoctorEnvironmentError on darwin with non-/Users homeDir (Linux-paths edge)', () => {
    expect(() =>
      checkDoctorEnvironment({ platform: 'darwin', homeDir: '/home/user', fsImpl: okFs })
    ).toThrow(DoctorEnvironmentError);
  });

  it('does not throw on darwin + /Users/ homeDir + present ~/.claude/', () => {
    expect(() =>
      checkDoctorEnvironment({ platform: 'darwin', homeDir: '/Users/x', fsImpl: okFs })
    ).not.toThrow();
  });
});
