// Tests for /sig:doctor — M4.5.E8.
// S1.t2 (RED) — detector unit tests against in-memory state objects.
// See .planning/M4.5.E8-PLAN.md § S1 + .planning/M4.5.E8-RESEARCH.md § 3.

import { describe, it, expect } from 'vitest';

import {
  detectP1StaleGitCommitSha,
  detectP2OrphanCacheEntry,
  detectP3OrphanEnabledFlag,
  detectP4PreRenameSlug,
  detectP5SshMultiIdentity,
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
