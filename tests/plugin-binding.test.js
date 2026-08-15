// Stale plugin-cache binding detection (B52).
//
// Two halves under test:
//   1. the pure decision + the disk read (`tools/lib/plugin-binding.js`);
//   2. the SessionStart hook's contract, proven by SPAWNING it — the same
//      discipline as migrate-layout-hook.test.js, because "exits 0 and prints
//      nothing" is a claim about a process, not about a function.
//
// The fail-open matrix is tested as thoroughly as the happy path on purpose:
// this code runs at session start in every repo that has Signal installed, so
// its most important property is that it cannot break anything.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  decideBindingDrift,
  formatBindingDriftBanner,
  isCacheInstall,
  readBindingDrift,
  readBindingBanner,
  readPluginVersionAt,
  boundPluginRoot,
  PLUGIN_MANIFEST_KEY,
} from '../plugin/tools/lib/plugin-binding.js';
import { renderResumeBriefing } from '../plugin/tools/lib/resume.js';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const HOOK = join(REPO, 'plugin', 'hooks', 'warn-stale-plugin-binding.js');

// --- fixture builders -------------------------------------------------------

/** Write a plugin tree at `root` carrying `.claude-plugin/plugin.json` @ version. */
async function plantPluginTree(root, version) {
  await mkdir(join(root, '.claude-plugin'), { recursive: true });
  await writeFile(
    join(root, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'sig', version }),
    'utf-8'
  );
  return root;
}

/** Write `<home>/.claude/plugins/installed_plugins.json` naming `installPath`. */
async function plantManifest(home, { installPath, version, raw } = {}) {
  const dir = join(home, '.claude', 'plugins');
  await mkdir(dir, { recursive: true });
  const body =
    raw !== undefined
      ? raw
      : JSON.stringify({
          plugins: {
            [PLUGIN_MANIFEST_KEY]: [{ scope: 'user', installPath, version }],
          },
        });
  await writeFile(join(dir, 'installed_plugins.json'), body, 'utf-8');
}

/**
 * Build the whole real-world shape: a cache tree per version, a manifest
 * pointing at `installedVersion`, and a bound root of `boundVersion`.
 */
async function plantWorld(home, { boundVersion, installedVersion }) {
  const cache = join(home, '.claude', 'plugins', 'cache', 'signal', 'sig');
  const boundRoot = await plantPluginTree(join(cache, boundVersion), boundVersion);
  const installPath = await plantPluginTree(join(cache, installedVersion), installedVersion);
  await plantManifest(home, { installPath, version: installedVersion });
  return { boundRoot, installPath };
}

describe('B52 — stale plugin-cache binding', () => {
  let home;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'sig-binding-'));
  });
  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  // --- the firing rule ------------------------------------------------------

  describe('decideBindingDrift (pure)', () => {
    const cacheRootFor = (h) => join(h, '.claude', 'plugins', 'cache', 'signal', 'sig', '0.1.17');

    it('fires when the bound cache version differs from the recorded one', () => {
      const r = decideBindingDrift({
        boundRoot: cacheRootFor('/h'),
        boundVersion: '0.1.17',
        recordedRoot: '/h/.claude/plugins/cache/signal/sig/0.1.19',
        recordedVersion: '0.1.19',
        homeDir: '/h',
      });
      expect(r.drift).toBe(true);
      expect(r.reason).toBe('version-mismatch');
    });

    it('is silent when bound and recorded agree', () => {
      const r = decideBindingDrift({
        boundRoot: cacheRootFor('/h'),
        boundVersion: '0.1.17',
        recordedRoot: cacheRootFor('/h'),
        recordedVersion: '0.1.17',
        homeDir: '/h',
      });
      expect(r.drift).toBe(false);
      expect(r.reason).toBe('match');
    });

    // THE false-positive gate. Without it, Signal-on-Signal banners itself on
    // every session from the moment cut-release.js bumps plugin.json on a
    // branch — a warning that fires when nothing is wrong is one nobody reads.
    it('is silent for a local/dev checkout outside the plugin cache', () => {
      const r = decideBindingDrift({
        boundRoot: '/Users/x/dev/signal',
        boundVersion: '0.1.20',
        recordedRoot: '/h/.claude/plugins/cache/signal/sig/0.1.19',
        recordedVersion: '0.1.19',
        homeDir: '/h',
      });
      expect(r.drift).toBe(false);
      expect(r.reason).toBe('not-a-cache-install');
    });

    // Each not-drift outcome must be distinguishable: "checked and matched" is
    // not "could not check". Reporting one silence for both is the B39 shape.
    it('names WHY it stayed silent, distinctly, in every not-drift case', () => {
      const reasons = [
        decideBindingDrift({ homeDir: '/h' }).reason,
        decideBindingDrift({ boundRoot: '/h/.claude/plugins/cache/s', homeDir: '/h' }).reason,
        decideBindingDrift({
          boundRoot: '/h/.claude/plugins/cache/s',
          recordedVersion: '0.1.19',
          homeDir: '/h',
        }).reason,
      ];
      expect(reasons).toEqual(['bound-root-unknown', 'no-install-record', 'bound-version-unknown']);
      expect(new Set(reasons).size).toBe(3);
    });
  });

  describe('isCacheInstall', () => {
    // REGRESSION, and it must be explicit rather than incidental. The emit test
    // below happens to exercise this because macOS temp dirs are symlinked
    // (/var → /private/var), which is precisely the "clean by luck, not by
    // construction" this repo keeps having to name. Here the symlink is
    // deliberate, so the guarantee survives a platform where tmp is not linked.
    //
    // What breaks without it: boundPluginRoot() realpaths (it must — it answers
    // "which file is really executing?"), so comparing it against a raw
    // join(homeDir, …) compares resolved to unresolved. Any symlink in HOME and
    // the gate returns false, the banner never renders, and nothing says so.
    it('sees through a symlinked HOME — otherwise the banner silently never fires', async () => {
      const real = join(home, 'real-home');
      const cacheDir = join(real, '.claude', 'plugins', 'cache', 'signal', 'sig', '0.1.17');
      await mkdir(cacheDir, { recursive: true });

      const linked = join(home, 'linked-home');
      const { symlink } = await import('node:fs/promises');
      await symlink(real, linked);

      // Bound root given via the REAL path (as realpathSync would return it),
      // HOME given via the symlink — the shape of a linked home directory.
      expect(isCacheInstall(cacheDir, linked)).toBe(true);
    });

    it('accepts the cache tree and rejects a sibling with a shared prefix', () => {
      expect(isCacheInstall('/h/.claude/plugins/cache/signal/sig/0.1.19', '/h')).toBe(true);
      // `cache-sideways` must not pass as `cache` — prefix match with separator.
      expect(isCacheInstall('/h/.claude/plugins/cache-sideways/x', '/h')).toBe(false);
      expect(isCacheInstall('/somewhere/else', '/h')).toBe(false);
      expect(isCacheInstall(null, '/h')).toBe(false);
      expect(isCacheInstall('/h/.claude/plugins/cache/x', '')).toBe(false);
    });
  });

  // --- disk reads -----------------------------------------------------------

  describe('readBindingDrift (disk)', () => {
    it('detects a real stale binding end to end', async () => {
      const { boundRoot, installPath } = await plantWorld(home, {
        boundVersion: '0.1.17',
        installedVersion: '0.1.19',
      });
      const r = readBindingDrift({ homeDir: home, boundRoot });
      expect(r.drift).toBe(true);
      expect(r.boundVersion).toBe('0.1.17');
      expect(r.recordedVersion).toBe('0.1.19');
      expect(r.recordedRoot).toBe(installPath);
    });

    it('is silent when the session is bound to the installed version', async () => {
      const cache = join(home, '.claude', 'plugins', 'cache', 'signal', 'sig', '0.1.19');
      await plantPluginTree(cache, '0.1.19');
      await plantManifest(home, { installPath: cache, version: '0.1.19' });
      expect(readBindingDrift({ homeDir: home, boundRoot: cache }).drift).toBe(false);
    });

    // The cache copy's own manifest is FACT; the record's `version` field is
    // INTENT. doctor.js's P1 detector exists because those two can disagree.
    it('prefers the cache plugin.json version over the manifest version field', async () => {
      const cache = join(home, '.claude', 'plugins', 'cache', 'signal', 'sig', '0.1.19');
      await plantPluginTree(cache, '0.1.19');
      const bound = await plantPluginTree(
        join(home, '.claude', 'plugins', 'cache', 'signal', 'sig', '0.1.17'),
        '0.1.17'
      );
      // Manifest CLAIMS 0.1.11 while the cache tree it points at holds 0.1.19.
      await plantManifest(home, { installPath: cache, version: '0.1.11' });
      const r = readBindingDrift({ homeDir: home, boundRoot: bound });
      expect(r.recordedVersion).toBe('0.1.19');
    });

    it('falls back to the manifest version when the cache manifest is unreadable', async () => {
      const bound = await plantPluginTree(
        join(home, '.claude', 'plugins', 'cache', 'signal', 'sig', '0.1.17'),
        '0.1.17'
      );
      await plantManifest(home, {
        installPath: join(home, '.claude', 'plugins', 'cache', 'signal', 'sig', '0.1.19'),
        version: '0.1.19',
      });
      const r = readBindingDrift({ homeDir: home, boundRoot: bound });
      expect(r.drift).toBe(true);
      expect(r.recordedVersion).toBe('0.1.19');
    });

    // FAIL-OPEN MATRIX. Every one of these degrades to a silent not-drift
    // result. None may throw.
    it.each([
      ['no manifest at all', async () => {}],
      [
        'malformed manifest JSON',
        async (h) => plantManifest(h, { raw: '{ this is not json' }),
      ],
      ['manifest with no signal entry', async (h) => plantManifest(h, { raw: '{"plugins":{}}' })],
      [
        'manifest entry with no installPath',
        async (h) =>
          plantManifest(h, {
            raw: JSON.stringify({ plugins: { [PLUGIN_MANIFEST_KEY]: [{ scope: 'user' }] } }),
          }),
      ],
    ])('fail-open: %s → silent, no throw', async (_label, setup) => {
      const bound = await plantPluginTree(
        join(home, '.claude', 'plugins', 'cache', 'signal', 'sig', '0.1.17'),
        '0.1.17'
      );
      await setup(home);
      let r;
      expect(() => {
        r = readBindingDrift({ homeDir: home, boundRoot: bound });
      }).not.toThrow();
      expect(r.drift).toBe(false);
    });

    it('fail-open: bound root has no readable plugin.json → silent', async () => {
      const bound = join(home, '.claude', 'plugins', 'cache', 'signal', 'sig', '0.1.17');
      await mkdir(bound, { recursive: true }); // no .claude-plugin/
      await plantManifest(home, { installPath: '/x/0.1.19', version: '0.1.19' });
      const r = readBindingDrift({ homeDir: home, boundRoot: bound });
      expect(r.drift).toBe(false);
      expect(r.reason).toBe('bound-version-unknown');
    });

    it('fail-open: garbage homeDir → silent, no throw', () => {
      expect(() => readBindingDrift({ homeDir: undefined })).not.toThrow();
      expect(readBindingDrift({ homeDir: undefined }).drift).toBe(false);
    });

    it('readPluginVersionAt returns null rather than throwing on junk input', () => {
      expect(readPluginVersionAt(null)).toBe(null);
      expect(readPluginVersionAt('')).toBe(null);
      expect(readPluginVersionAt('/definitely/not/here')).toBe(null);
    });
  });

  // --- the banner -----------------------------------------------------------

  describe('formatBindingDriftBanner', () => {
    it('returns null when there is no drift', () => {
      expect(formatBindingDriftBanner(null)).toBe(null);
      expect(formatBindingDriftBanner({ drift: false })).toBe(null);
    });

    it('names both versions, both paths, and the ONE action that fixes it', () => {
      const b = formatBindingDriftBanner({
        drift: true,
        boundVersion: '0.1.17',
        recordedVersion: '0.1.19',
        boundRoot: '/h/cache/0.1.17',
        recordedRoot: '/h/cache/0.1.19',
      });
      expect(b).toContain('0.1.17');
      expect(b).toContain('0.1.19');
      expect(b).toContain('/h/cache/0.1.17');
      expect(b).toContain('/h/cache/0.1.19');
      expect(b).toContain('RESTART THE CLI PROCESS');
    });

    // Not decoration. SessionStart RE-FIRES on /clear, so a user who clears
    // sees this banner a second time; without this sentence they conclude the
    // warning is broken rather than that their remedy was. The distinction was
    // measured (2026-08-02: a clear at 12:50 inside a process alive since
    // Jul 28 kept its binding), so the copy must not soften back to the
    // ambiguous "restart the session".
    it('says explicitly that a /clear is not sufficient', () => {
      const b = formatBindingDriftBanner({
        drift: true,
        boundVersion: '0.1.17',
        recordedVersion: '0.1.19',
        boundRoot: '/a',
        recordedRoot: '/b',
      });
      expect(b).toMatch(/\/clear is not enough/i);
      expect(b).not.toMatch(/restart the session/i);
    });

    it('readBindingBanner returns a string on drift and null otherwise', async () => {
      const { boundRoot } = await plantWorld(home, {
        boundVersion: '0.1.17',
        installedVersion: '0.1.19',
      });
      expect(typeof readBindingBanner({ homeDir: home, boundRoot })).toBe('string');
      expect(readBindingBanner({ homeDir: home, boundRoot: '/tmp/not-cache' })).toBe(null);
    });
  });

  // --- self-evidencing bound root ------------------------------------------

  describe('boundPluginRoot', () => {
    // The env var says where the plugin is SUPPOSED to be; B52 is exactly the
    // case where that disagrees with what loaded. Only the module's own
    // resolved path answers "which copy is running?".
    it('resolves to the tree this module was loaded from, not CLAUDE_PLUGIN_ROOT', async () => {
      const prev = process.env.CLAUDE_PLUGIN_ROOT;
      process.env.CLAUDE_PLUGIN_ROOT = '/somewhere/else/entirely';
      try {
        // M6.E1: the payload moved to plugin/, so this module's own path is
        // <repo>/plugin/tools/lib/plugin-binding.js and up-three is the PLUGIN
        // root. That is the value B52 wants — "which plugin copy am I?" — and
        // it was only ever equal to REPO by coincidence of layout.
        expect(boundPluginRoot()).toBe(join(REPO, 'plugin'));
      } finally {
        if (prev === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
        else process.env.CLAUDE_PLUGIN_ROOT = prev;
      }
    });

    it('points at a tree that really carries the plugin manifest', async () => {
      const v = JSON.parse(
        await readFile(join(boundPluginRoot(), '.claude-plugin', 'plugin.json'), 'utf-8')
      ).version;
      expect(typeof v).toBe('string');
    });
  });

  // --- the manifest key is shared, not guessed ------------------------------

  it('uses the same installed_plugins.json key doctor.js looks up', async () => {
    const doctorSrc = await readFile(join(REPO, 'plugin', 'tools', 'lib', 'doctor.js'), 'utf-8');
    expect(doctorSrc).toContain(`'${PLUGIN_MANIFEST_KEY}'`);
  });

  // --- the briefing's banner order -----------------------------------------

  describe('renderResumeBriefing places the binding banner above all others', () => {
    // The ordering is currently asserted in a code comment, in resume.md and
    // in status.md — and NOTHING fails if it moves. It is load-bearing, not
    // cosmetic: a schema banner says one field below may be misparsed, while a
    // stale binding says the code that read every field, the schema check
    // included, is a release the maintainer already retired. It cannot render
    // beneath the checks it casts doubt on.
    const render = () =>
      renderResumeBriefing({
        cwd: '/x',
        state: { phase: 'SHIP', completed_phases: [], current_tasks: [], blockers: [] },
        profile: { tier: 'FULL', phases_skipped: [] },
        bindingBanner: '⚠ BINDING BANNER MARKER',
        schemaDriftResult: { status: 'behind', message: 'schema is behind' },
        isStaleResult: { stale: true, commitCount: 3 },
        nextAction: 'Next phase: done',
      });

    it('renders above the schema-drift and staleness banners', () => {
      const lines = render().split('\n');
      const at = (needle) => lines.findIndex((l) => l.includes(needle));
      const binding = at('BINDING BANNER MARKER');
      expect(binding).toBeGreaterThanOrEqual(0);
      expect(binding).toBeLessThan(at('schema'));
      expect(binding).toBeLessThan(at('STATE.md is 3 commit'));
      expect(binding).toBeLessThan(at('== Project Briefing =='));
    });

    it('omits the block entirely when there is no drift', () => {
      const out = renderResumeBriefing({
        cwd: '/x',
        state: { phase: 'SHIP', completed_phases: [], current_tasks: [], blockers: [] },
        profile: { tier: 'FULL', phases_skipped: [] },
        bindingBanner: null,
        nextAction: 'Next phase: done',
      });
      expect(out).not.toContain('RETIRED code');
      expect(out.startsWith('== Project Briefing ==')).toBe(true);
    });
  });

  // --- the hook, as a process ----------------------------------------------

  describe('warn-stale-plugin-binding.js hook (spawn harness)', () => {
    function runHook(cwd, env = {}) {
      const r = spawnSync('node', [HOOK], {
        cwd,
        encoding: 'utf-8',
        env: { ...process.env, ...env },
        input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd }),
      });
      return { status: r.status, stdout: (r.stdout ?? '').toString(), stderr: (r.stderr ?? '').toString() };
    }

    // THE LOUD CASE. Every other spawn assertion here proves the hook stays
    // quiet; without this one, a hook that could never emit at all would pass
    // the whole matrix — which is B83's shape (an assertion that cannot fail)
    // sitting in the release that exists to fix that class.
    //
    // The files are COPIED, never symlinked: boundPluginRoot() calls
    // realpathSync, so a symlink resolves back to the repo and the test
    // degrades to `not-a-cache-install` — passing for the wrong reason.
    it('EMITS a SessionStart banner when bound to a stale cache', async () => {
      const cache = join(home, '.claude', 'plugins', 'cache', 'signal', 'sig');
      const bound = join(cache, '0.1.17');

      await plantPluginTree(bound, '0.1.17');
      await mkdir(join(bound, 'hooks'), { recursive: true });
      await mkdir(join(bound, 'tools', 'lib'), { recursive: true });
      await writeFile(join(bound, 'hooks', 'warn-stale-plugin-binding.js'), await readFile(HOOK, 'utf-8'));
      await writeFile(
        join(bound, 'tools', 'lib', 'plugin-binding.js'),
        await readFile(join(REPO, 'plugin', 'tools', 'lib', 'plugin-binding.js'), 'utf-8')
      );

      const installed = await plantPluginTree(join(cache, '0.1.19'), '0.1.19');
      await plantManifest(home, { installPath: installed, version: '0.1.19' });

      const r = spawnSync('node', [join(bound, 'hooks', 'warn-stale-plugin-binding.js')], {
        cwd: home,
        encoding: 'utf-8',
        env: { ...process.env, HOME: home },
        input: JSON.stringify({ hook_event_name: 'SessionStart', source: 'startup', cwd: home }),
      });

      expect(r.status).toBe(0);
      const payload = JSON.parse(r.stdout);
      expect(payload.hookSpecificOutput.hookEventName).toBe('SessionStart');
      const ctx = payload.hookSpecificOutput.additionalContext;
      expect(ctx).toContain('RESTART THE CLI PROCESS');
      expect(ctx).toContain('0.1.17');
      expect(ctx).toContain('0.1.19');
    });

    // Running from the repo checkout, the hook's own tree is NOT under the
    // plugin cache — so the dev case is silent, which is the state every
    // Signal-on-Signal session is in.
    it('is silent and exits 0 when run from a dev checkout', () => {
      const r = runHook(home, { HOME: home });
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('');
    });

    it('exits 0 even with a HOME that does not exist', () => {
      const r = runHook(home, { HOME: join(home, 'nope', 'nope') });
      expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe('');
    });

    it('never writes to stderr', () => {
      expect(runHook(home, { HOME: home }).stderr.trim()).toBe('');
    });
  });
});
