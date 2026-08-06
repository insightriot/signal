// Stale plugin-cache binding detection (B52).
//
// Claude Code resolves a plugin's install path ONCE at session start and holds
// it for the life of the PROCESS. A session alive across a plugin auto-update
// therefore keeps running the version it started with, while every config file
// on disk correctly records the new one. Three live sightings in six days
// (2026-07-28, 08-02, 08-03), each found by a human noticing a version string
// in passing:
//
//   - 07-28: `setCurrentEpic` ran 0.1.11's `state.js`, which predates the
//     archive-before-reset step — M5.E8's six-phase ledger was discarded with
//     no error, no warning, and no record.
//   - 08-02: the session loaded 0.1.13's `discuss.md`, which still carries the
//     exact instruction `B51` deleted. A stale cache does not merely fail to
//     deliver a fix; it re-issues the instruction the fix removed.
//   - 08-03: 0.1.16 bound while 0.1.17 was installed. No damage here only
//     because Signal's own `phase` is canonical — the same binding on any of
//     the 5-of-12 projects with a non-canonical phase loses the whole briefing.
//
// The measured remedy is a full CLI process restart. A `/clear` is NOT enough:
// a clear ran 2026-08-02 at 12:50 inside a process alive since Jul 28 and the
// binding survived it. That is observed, not reasoned — and it is why the
// banner says "restart the process" rather than "restart the session", which
// is ambiguous between exactly those two things.
//
// DEPENDENCY-LIGHT ON PURPOSE. This module imports only `node:fs`/`node:path`
// /`node:url`, because `hooks/warn-stale-plugin-binding.js` imports it at
// session start and an import-time throw in a SessionStart hook fires BEFORE
// any fail-open guard can catch it. Same discipline as `layout-stamp.js`. It
// deliberately does NOT reuse `doctor.js`'s `readInstallState` (which pulls the
// detector graph and throws `DoctorDetectionError` on malformed JSON, the
// opposite of what a hook needs); the manifest read here is a dozen lines and
// its shape is pinned against doctor.js by a test.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Manifest key for the Signal plugin — must match doctor.js's lookup. */
export const PLUGIN_MANIFEST_KEY = 'sig@signal';

/**
 * The plugin tree THIS module is executing from.
 *
 * Derived from `import.meta.url`, not `CLAUDE_PLUGIN_ROOT`: the env var states
 * where the plugin is *supposed* to be, and B52 is precisely the case where
 * that disagrees with what actually loaded. A module's own resolved path is the
 * only self-evidencing answer to "which copy is running?".
 *
 * `<root>/tools/lib/plugin-binding.js` → up three.
 *
 * @returns {string|null}
 */
export function boundPluginRoot() {
  try {
    return dirname(dirname(dirname(realpathSync(fileURLToPath(import.meta.url)))));
  } catch {
    return null;
  }
}

/** Read a JSON file, returning null on any failure (missing, unreadable, malformed). */
function readJsonOrNull(path, fsImpl) {
  try {
    const read = fsImpl?.readFileSync ?? readFileSync;
    return JSON.parse(read(path, 'utf8'));
  } catch {
    return null;
  }
}

/** `.claude-plugin/plugin.json` → `.version`, or null. */
export function readPluginVersionAt(root, fsImpl) {
  if (typeof root !== 'string' || root === '') return null;
  const j = readJsonOrNull(join(root, '.claude-plugin', 'plugin.json'), fsImpl);
  const v = j?.version;
  return typeof v === 'string' && v !== '' ? v : null;
}

/**
 * Is `root` inside the plugin cache tree (`<home>/.claude/plugins/cache/`)?
 *
 * This is the false-positive gate, and it is the difference between a banner
 * that means something and one that fires on every dev session. A local /
 * checkout install is a legitimate binding whose version has no reason to match
 * the marketplace's install record — Signal-on-Signal would otherwise banner
 * itself the moment `cut-release.js` bumps `plugin.json` on a branch.
 *
 * Compared as a path PREFIX with a trailing separator, so `…/cache-sideways/`
 * cannot pass as `…/cache/`.
 *
 * @param {string|null} root
 * @param {string} homeDir
 * @returns {boolean}
 */
export function isCacheInstall(root, homeDir) {
  if (typeof root !== 'string' || root === '') return false;
  if (typeof homeDir !== 'string' || homeDir === '') return false;
  const cacheRoot = join(homeDir, '.claude', 'plugins', 'cache');
  const r = resolve(root);
  return r === cacheRoot || r.startsWith(cacheRoot + sep);
}

/**
 * Decide binding drift from already-read facts. Pure — no IO, never throws.
 *
 * The trigger is the VERSION; the paths are the evidence the banner prints,
 * because in all three sightings what a human needed was both paths side by
 * side. Every not-drift outcome carries a distinct `reason` so a caller (or a
 * test) can tell "checked, matched" from "could not check" — a detector that
 * reports the same silence for both is the `B39` shape this repo keeps
 * re-learning.
 *
 * @param {{boundRoot:string|null, boundVersion:string|null,
 *          recordedRoot:string|null, recordedVersion:string|null,
 *          homeDir:string}} facts
 * @returns {{drift:boolean, reason:string, boundRoot:string|null,
 *            boundVersion:string|null, recordedRoot:string|null,
 *            recordedVersion:string|null}}
 */
export function decideBindingDrift(facts = {}) {
  const {
    boundRoot = null,
    boundVersion = null,
    recordedRoot = null,
    recordedVersion = null,
    homeDir = '',
  } = facts;
  const base = { boundRoot, boundVersion, recordedRoot, recordedVersion };

  if (!boundRoot) return { ...base, drift: false, reason: 'bound-root-unknown' };
  if (!isCacheInstall(boundRoot, homeDir)) {
    return { ...base, drift: false, reason: 'not-a-cache-install' };
  }
  if (!recordedVersion) return { ...base, drift: false, reason: 'no-install-record' };
  if (!boundVersion) return { ...base, drift: false, reason: 'bound-version-unknown' };
  if (boundVersion === recordedVersion) return { ...base, drift: false, reason: 'match' };
  return { ...base, drift: true, reason: 'version-mismatch' };
}

/**
 * Read both sides off disk and decide. Fail-open: ANY failure returns a
 * not-drift result rather than throwing, because both callers (a SessionStart
 * hook and two read-only briefings) must never break on this check.
 *
 * @param {{homeDir:string, boundRoot?:string|null, fsImpl?:object}} opts
 * @returns {{drift:boolean, reason:string, boundRoot:string|null,
 *            boundVersion:string|null, recordedRoot:string|null,
 *            recordedVersion:string|null}}
 */
export function readBindingDrift(opts = {}) {
  try {
    const { homeDir, fsImpl } = opts;
    const boundRoot = opts.boundRoot !== undefined ? opts.boundRoot : boundPluginRoot();

    const manifestPath = join(homeDir ?? '', '.claude', 'plugins', 'installed_plugins.json');
    const exists = fsImpl?.existsSync ?? existsSync;
    const manifest = exists(manifestPath) ? readJsonOrNull(manifestPath, fsImpl) : null;
    const entry = manifest?.plugins?.[PLUGIN_MANIFEST_KEY]?.[0] ?? null;

    const recordedRoot = typeof entry?.installPath === 'string' ? entry.installPath : null;
    // Prefer the cache copy's own manifest over the record's `version` field:
    // the record states intent, the file states fact, and P1 in doctor.js is
    // precisely the case where those two disagree. Fall back to the record when
    // the cache manifest is unreadable.
    const recordedVersion =
      readPluginVersionAt(recordedRoot, fsImpl) ??
      (typeof entry?.version === 'string' ? entry.version : null);

    return decideBindingDrift({
      boundRoot,
      boundVersion: readPluginVersionAt(boundRoot, fsImpl),
      recordedRoot,
      recordedVersion,
      homeDir: homeDir ?? '',
    });
  } catch {
    return {
      drift: false,
      reason: 'read-failed',
      boundRoot: null,
      boundVersion: null,
      recordedRoot: null,
      recordedVersion: null,
    };
  }
}

/**
 * Render the banner, or null when there's no drift.
 *
 * Says what is wrong, what it costs, and the ONE action that fixes it. The
 * `/clear` sentence is not padding: SessionStart re-fires on a clear, so a user
 * who clears will see this banner a second time and — without that line —
 * conclude the warning is broken rather than that their remedy was.
 *
 * @param {{drift:boolean, boundVersion?:string, recordedVersion?:string,
 *          boundRoot?:string, recordedRoot?:string}|null} result
 * @returns {string|null}
 */
export function formatBindingDriftBanner(result) {
  if (!result?.drift) return null;
  return [
    `⚠ Signal is running RETIRED code: this process is bound to v${result.boundVersion}, ` +
      `but v${result.recordedVersion} is installed.`,
    '   Every /sig: command and tool in this session loads from the old copy — a fixed bug can',
    '   reappear, and state writes can run code paths a later release removed (B52 cost M5.E8 its',
    '   phase ledger this way).',
    '   Fix: RESTART THE CLI PROCESS. A /clear is not enough — the binding survives it (measured).',
    `   Bound:     ${result.boundRoot}`,
    `   Installed: ${result.recordedRoot}`,
  ].join('\n');
}

/**
 * Command-path convenience: the banner string, or null. Fail-open end to end.
 *
 * @param {{homeDir:string, boundRoot?:string|null, fsImpl?:object}} opts
 * @returns {string|null}
 */
export function readBindingBanner(opts = {}) {
  try {
    return formatBindingDriftBanner(readBindingDrift(opts));
  } catch {
    return null;
  }
}
