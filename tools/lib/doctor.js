// /sig:doctor — Claude Code plugin install-state diagnostician.
//
// Pure detectors operate on in-memory state objects (manifest = parsed
// installed_plugins.json, settings = parsed settings.json). IO orchestrators
// (readInstallState, runDoctor) accept injectable {homeDir, fsImpl?, fetchFn?}
// for testability. See .planning/M4.5.E8-PLAN.md § "S1 Task Breakdown".
//
// Detector return shape: { detected, evidence, recommendation, code }
//   detected:       boolean
//   evidence:       object | string | string[]
//   recommendation: '--fix' | '--reinstall' | 'info-only' | null
//   code:           'P1' | 'P2' | 'P3' | 'P4' | 'P5'
//
// D-E8-10: every function taking ~/.claude/ paths accepts `homeDir` injected.
//          NEVER call os.homedir() directly from pure detectors.
// D-E8-11: every detector MUST be Signal-scoped before emitting findings.

import { join } from 'node:path';

/**
 * P1 — manifest entry exists, cache dir exists, but cached plugin.json version
 *      doesn't match manifest version (Claude Code short-circuited the install).
 *
 * @param {object} manifest - parsed installed_plugins.json
 * @param {{existsSync: (p:string)=>boolean, readFileSync: (p:string,enc:string)=>string}} fsImpl
 * @returns {{detected:boolean, evidence?:any, recommendation?:string, code:'P1'}}
 */
export function detectP1StaleGitCommitSha(manifest, fsImpl) {
  const entry = manifest?.plugins?.['sig@signal']?.[0];
  if (!entry) return { detected: false, code: 'P1' };

  const cacheDir = entry.installPath;
  if (!cacheDir || !fsImpl.existsSync(cacheDir)) {
    return {
      detected: true,
      code: 'P1',
      evidence: 'cache dir missing entirely',
      recommendation: '--reinstall',
    };
  }

  const pluginJsonPath = join(cacheDir, '.claude-plugin', 'plugin.json');
  let cachedPluginJson;
  try {
    cachedPluginJson = JSON.parse(fsImpl.readFileSync(pluginJsonPath, 'utf8'));
  } catch {
    // Cache dir exists but plugin.json unreadable — treat as stale.
    return {
      detected: true,
      code: 'P1',
      evidence: `cache plugin.json unreadable at ${pluginJsonPath}`,
      recommendation: '--reinstall',
    };
  }

  if (cachedPluginJson.version !== entry.version) {
    return {
      detected: true,
      code: 'P1',
      evidence: {
        manifestVer: entry.version,
        cachedVer: cachedPluginJson.version,
        sha: entry.gitCommitSha,
      },
      recommendation: '--reinstall',
    };
  }

  return { detected: false, code: 'P1' };
}

/**
 * P2 — cache version directories under signal/sig/ not referenced by any
 *      installed_plugins.json entry (Disable left filesystem behind).
 *
 * @param {object} manifest
 * @param {{existsSync: (p:string)=>boolean, readdirSync: (p:string)=>string[]}} fsImpl
 * @param {string} homeDir
 * @returns {{detected:boolean, evidence?:string[], recommendation?:string, code:'P2'}}
 */
export function detectP2OrphanCacheEntry(manifest, fsImpl, homeDir) {
  const cacheBase = join(homeDir, '.claude', 'plugins', 'cache', 'signal', 'sig');
  if (!fsImpl.existsSync(cacheBase)) {
    return { detected: false, code: 'P2' };
  }

  // D-E8-11 narrowing: only Signal-scoped manifest entries count.
  const manifestPaths = new Set(
    Object.entries(manifest?.plugins || {})
      .filter(([key]) => key === 'sig@signal' || key === 'signal@signal')
      .flatMap(([, entries]) => (entries || []).map((e) => e.installPath))
  );

  const verDirs = fsImpl.readdirSync(cacheBase) || [];
  const orphans = verDirs
    .map((v) => join(cacheBase, v))
    .filter((p) => !manifestPaths.has(p));

  return orphans.length
    ? { detected: true, code: 'P2', evidence: orphans, recommendation: '--fix' }
    : { detected: false, code: 'P2' };
}

/**
 * P3 — settings.json `enabledPlugins` entry without matching installed plugin.
 *      Captures the "Disabled state survives uninstall + reinstall" upstream bug.
 *
 * @param {object} settings - parsed settings.json
 * @param {object} manifest - parsed installed_plugins.json
 * @returns {{detected:boolean, evidence?:string[], recommendation?:string, code:'P3'}}
 */
export function detectP3OrphanEnabledFlag(settings, manifest) {
  const enabled = settings?.enabledPlugins || {};
  const installed = manifest?.plugins || {};
  const orphans = [];

  // D-E8-11 narrowing: only sig@/signal@ keys.
  for (const key of Object.keys(enabled)) {
    if ((key.startsWith('sig@') || key.startsWith('signal@')) && !installed[key]) {
      orphans.push(key);
    }
  }

  return orphans.length
    ? { detected: true, code: 'P3', evidence: orphans, recommendation: '--fix' }
    : { detected: false, code: 'P3' };
}

/**
 * P4 — pre-rename `signal@signal` slug present anywhere (cache, manifest, settings).
 *      Detection is inherently Signal-scoped (literal slug match).
 *
 * @param {object} manifest
 * @param {object} settings
 * @param {{existsSync: (p:string)=>boolean}} fsImpl
 * @param {string} homeDir
 * @returns {{detected:boolean, evidence?:string[], recommendation?:string, code:'P4'}}
 */
export function detectP4PreRenameSlug(manifest, settings, fsImpl, homeDir) {
  const hits = [];

  const preRenameCacheDir = join(homeDir, '.claude', 'plugins', 'cache', 'signal', 'signal');
  if (fsImpl.existsSync(preRenameCacheDir)) {
    hits.push(`cache:${preRenameCacheDir}`);
  }

  if (manifest?.plugins?.['signal@signal']) {
    hits.push('manifest:installed_plugins.json signal@signal entry');
  }

  if (settings?.enabledPlugins?.['signal@signal'] !== undefined) {
    hits.push('settings:enabledPlugins.signal@signal');
  }

  return hits.length
    ? { detected: true, code: 'P4', evidence: hits, recommendation: '--fix' }
    : { detected: false, code: 'P4' };
}

/**
 * Aggregate the 5 detectors into a single doctor verdict.
 *
 * Severity / recommendation rules (per M4.5.E8-RESEARCH.md § 3):
 *   - Any P1 → '--reinstall' (highest severity)
 *   - P2/P3/P4 only (no P1) → '--fix'
 *   - P5 is informational — fires as a finding but does NOT change healthy
 *   - No consequential findings → healthy:true, recommendation:null
 *
 * @param {{manifest:object, settings:object, fsImpl:object, homeDir:string}} state
 * @returns {{healthy:boolean, findings:object[], aggregate_recommendation:string|null}}
 */
export function runAllDetectors({ manifest, settings, fsImpl, homeDir }) {
  const findings = [];

  const detectors = [
    detectP1StaleGitCommitSha(manifest, fsImpl),
    detectP2OrphanCacheEntry(manifest, fsImpl, homeDir),
    detectP3OrphanEnabledFlag(settings, manifest),
    detectP4PreRenameSlug(manifest, settings, fsImpl, homeDir),
    detectP5SshMultiIdentity(fsImpl, homeDir),
  ];
  for (const d of detectors) {
    if (d.detected) findings.push(d);
  }

  // P5 is info-only; doesn't change healthy.
  const consequential = findings.filter((f) => f.recommendation !== 'info-only');
  const healthy = consequential.length === 0;

  let aggregate_recommendation = null;
  if (consequential.some((f) => f.recommendation === '--reinstall')) {
    aggregate_recommendation = '--reinstall';
  } else if (consequential.some((f) => f.recommendation === '--fix')) {
    aggregate_recommendation = '--fix';
  }

  return { healthy, findings, aggregate_recommendation };
}

/**
 * P5 — SSH multi-identity config detected. Informational only — does NOT
 *      change healthy:false on its own (per D-E8-11 P5 carve-out).
 *
 * @param {{existsSync: (p:string)=>boolean, readFileSync: (p:string,enc:string)=>string}} fsImpl
 * @param {string} homeDir
 * @returns {{detected:boolean, evidence?:string, recommendation?:'info-only', code:'P5'}}
 */
export function detectP5SshMultiIdentity(fsImpl, homeDir) {
  const sshConfigPath = join(homeDir, '.ssh', 'config');
  if (!fsImpl.existsSync(sshConfigPath)) {
    return { detected: false, code: 'P5' };
  }

  const content = fsImpl.readFileSync(sshConfigPath, 'utf8');
  const hasMultiHost = /^Host\s+github\.com-/m.test(content);
  const hasDefaultHost = /^Host\s+github\.com\s*$/m.test(content);

  if (hasMultiHost && !hasDefaultHost) {
    return {
      detected: true,
      code: 'P5',
      evidence: 'multi-identity Host github.com-* without default Host github.com',
      recommendation: 'info-only',
    };
  }

  return { detected: false, code: 'P5' };
}
