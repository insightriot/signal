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
// D-E8-12: doctor exits 0 healthy / 1 P-states detected / 2 doctor errored.
//          DoctorDetectionError + DoctorEnvironmentError signal exit-2 cases.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicWrite } from './atomic-write.js';

/**
 * Thrown when doctor cannot read the install state — usually a parse failure
 * from a concurrent `/plugin install` mid-write. Caller maps this to exit 2
 * with a friendly "(state file mid-write; retry)" message.
 */
export class DoctorDetectionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'DoctorDetectionError';
    if (cause) this.cause = cause;
  }
}

/**
 * Thrown when doctor's host environment doesn't match expectations
 * (non-macOS platform, no ~/.claude/ directory). Caller prints the polite
 * stub and exits 0.
 */
export class DoctorEnvironmentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DoctorEnvironmentError';
  }
}

const DEFAULT_FS_IMPL = { existsSync, readFileSync, readdirSync };

/**
 * Positive-allowlist environment check (D-E8-2; RESEARCH § 4 risk #5).
 * Throws DoctorEnvironmentError if the host doesn't match the macOS-first-ship
 * profile. Caller catches and prints the polite stub.
 *
 * Three guards (all must pass):
 *   1. platform === 'darwin'
 *   2. homeDir starts with '/Users/' (catches WSL-on-darwin and Linux-with-mounted-Users edges)
 *   3. <homeDir>/.claude directory exists (catches "Claude Code not installed")
 *
 * @param {{platform:string, homeDir:string, fsImpl?:object}} opts
 */
export function checkDoctorEnvironment({ platform, homeDir, fsImpl = DEFAULT_FS_IMPL }) {
  if (platform !== 'darwin') {
    throw new DoctorEnvironmentError(
      `Detected platform: ${platform}. /sig:doctor currently supports macOS only. ` +
        `Linux/WSL support is in flight (see docs/install-troubleshooting.md for the manual sequence).`
    );
  }
  if (!homeDir || !homeDir.startsWith('/Users/')) {
    throw new DoctorEnvironmentError(
      `Detected homeDir: ${homeDir}. /sig:doctor requires a macOS-shaped home directory under /Users/.`
    );
  }
  if (!fsImpl.existsSync(join(homeDir, '.claude'))) {
    throw new DoctorEnvironmentError(
      `No ~/.claude directory at ${join(homeDir, '.claude')} — is Claude Code installed?`
    );
  }
}

/**
 * Read manifest + settings into a state object suitable for runAllDetectors.
 *
 * Reads:
 *   <homeDir>/.claude/plugins/installed_plugins.json
 *   <homeDir>/.claude/settings.json
 *
 * Missing files return empty defaults (fresh install). Malformed JSON throws
 * DoctorDetectionError — caller exits 2.
 *
 * @param {{homeDir:string, fsImpl?:object}} opts
 * @returns {{manifest:object, settings:object, fsImpl:object, homeDir:string}}
 */
export function readInstallState({ homeDir, fsImpl = DEFAULT_FS_IMPL } = {}) {
  if (!homeDir) {
    throw new DoctorEnvironmentError('readInstallState requires homeDir');
  }

  const manifestPath = join(homeDir, '.claude', 'plugins', 'installed_plugins.json');
  const settingsPath = join(homeDir, '.claude', 'settings.json');

  const manifest = fsImpl.existsSync(manifestPath)
    ? parseStateFile(fsImpl, manifestPath, 'installed_plugins.json')
    : { plugins: {} };

  const settings = fsImpl.existsSync(settingsPath)
    ? parseStateFile(fsImpl, settingsPath, 'settings.json')
    : { enabledPlugins: {} };

  return { manifest, settings, fsImpl, homeDir };
}

function parseStateFile(fsImpl, path, label) {
  let raw;
  try {
    raw = fsImpl.readFileSync(path, 'utf8');
  } catch (err) {
    throw new DoctorDetectionError(`Could not read ${label} at ${path}`, err);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new DoctorDetectionError(
      `${label} is not valid JSON (file may be mid-write from a concurrent /plugin install; retry)`,
      err
    );
  }
}

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

// ===== S2 — Script generation =====
//
// Generated scripts are USER-REVIEWED before execution (D-E8-1).
// D-E8-8 — shebang #!/usr/bin/env bash + `set -u -o pipefail` (NOT `set -e`).
// FR5 — every mutating step gated on `read -p "Execute: ... [y/N]"`.
// D-E8-10 — paths in the script body are absolute (resolved from homeDir).

const BASH_HEADER = (mode) =>
  [
    '#!/usr/bin/env bash',
    'set -u -o pipefail',
    '',
    `# Generated by /sig:doctor ${mode} — review each [y/N] step before answering yes.`,
    '# Declining a step skips it; the script continues to the next.',
    '',
    'if ! command -v claude >/dev/null 2>&1; then',
    '  echo "ERROR: \'claude\' CLI not on PATH. Open Claude Code, ensure binary linked."',
    '  exit 1',
    'fi',
    '',
    '# Surface Claude Code version so a too-old runtime is visible before any',
    "# 'claude plugin' subcommand fails (need 2.1.150+ per docs/install-troubleshooting.md).",
    'echo "Detected Claude Code: $(claude --version 2>&1 | head -1)"',
    'echo "(This script needs 2.1.150+ for \'claude plugin\' subcommands.)"',
    'echo ""',
    '',
  ].join('\n');

const BASH_FOOTER = [
  '',
  'echo ""',
  'echo "Script complete. Final step requires Claude Code:"',
  'echo "  1. Inside Claude Code, run: /reload-plugins"',
  'echo "  2. Then: /sig:doctor   (to verify install state)"',
  '',
].join('\n');

function bashStep(label, command) {
  // Escape any quotes in the label so the read -p prompt stays well-formed.
  const safeLabel = label.replace(/"/g, '\\"');
  return [
    `# ─── ${label} ───`,
    `read -p "Execute: ${safeLabel} ? [y/N] " ans`,
    'if [[ "$ans" == "y" ]]; then',
    `  ${command}`,
    '  echo "  [done]"',
    'else',
    '  echo "  [skipped]"',
    'fi',
    '',
  ].join('\n');
}

// Inline `node -e` to delete a key from settings.enabledPlugins atomically.
// Length intentionally > 80 chars — helper-script split deferred to S2.t4
// review point; tradeoff documented in M4.5.E8-PLAN.md.
function nodeRemoveEnabledPlugin(settingsPath, key) {
  const escapedKey = key.replace(/'/g, "\\'");
  return (
    `node -e "const fs=require('fs');const p='${settingsPath}';` +
    `const j=JSON.parse(fs.readFileSync(p,'utf8'));` +
    `if(j.enabledPlugins){delete j.enabledPlugins['${escapedKey}'];}` +
    `const t=p+'.tmp';fs.writeFileSync(t,JSON.stringify(j,null,2));fs.renameSync(t,p);"`
  );
}

function settingsPath(homeDir) {
  return join(homeDir, '.claude', 'settings.json');
}

/**
 * Build a surgical remediation script for the specific findings detected.
 * Only emits steps for the P-states that fired — never a full reinstall.
 *
 * @param {Array<{code:string, evidence:any, recommendation:string}>} findings
 * @param {{homeDir:string}} opts
 * @returns {string} bash script body
 */
export function buildFixScript(findings, { homeDir }) {
  // No-op on healthy installs — caller skips writing the script entirely.
  if (!findings || findings.length === 0) return null;

  const steps = [];
  for (const f of findings) {
    switch (f.code) {
      case 'P2':
        for (const orphanPath of f.evidence) {
          steps.push(
            bashStep(`rm -rf orphan cache dir ${orphanPath}`, `rm -rf "${orphanPath}"`)
          );
        }
        break;
      case 'P3':
        for (const orphanKey of f.evidence) {
          steps.push(
            bashStep(
              `remove enabledPlugins[\\"${orphanKey}\\"] from settings.json`,
              nodeRemoveEnabledPlugin(settingsPath(homeDir), orphanKey)
            )
          );
        }
        break;
      case 'P4':
        // P4 evidence is heterogeneous (cache paths + manifest/settings markers).
        for (const hit of f.evidence) {
          if (hit.startsWith('cache:')) {
            const p = hit.slice('cache:'.length);
            steps.push(bashStep(`rm -rf pre-rename cache ${p}`, `rm -rf "${p}"`));
          } else if (hit.startsWith('settings:')) {
            steps.push(
              bashStep(
                'remove enabledPlugins[\\"signal@signal\\"] from settings.json',
                nodeRemoveEnabledPlugin(settingsPath(homeDir), 'signal@signal')
              )
            );
          }
          // 'manifest:' hits are Claude-Code-managed; clearing requires the CLI uninstall path
          // (out of --fix scope; recommend --reinstall in that case).
        }
        break;
      case 'P1':
        // P1 isn't surgical — it requires a clean reinstall. Note it but don't
        // generate a destructive step here.
        steps.push(
          [
            '# ─── P1 detected — requires --reinstall, not --fix ───',
            'echo "[!] P1 (stale gitCommitSha) detected. Re-run with /sig:doctor --reinstall."',
            '',
          ].join('\n')
        );
        break;
      case 'P5':
        // Informational only.
        steps.push(
          [
            '# ─── P5 — SSH multi-identity (informational only) ───',
            'echo "[i] If marketplace operations fail with SSH auth errors, try:"',
            'echo "    export CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1"',
            '',
          ].join('\n')
        );
        break;
      default:
        break;
    }
  }
  return BASH_HEADER('--fix') + steps.join('') + BASH_FOOTER;
}

/**
 * Build the full canonical clean-reinstall script. Body is state-independent
 * (same content whether the install is healthy or broken); per-step `[y/N]`
 * prompts are the safeguard against running steps that don't apply.
 *
 * @param {{homeDir:string}} opts
 * @returns {string} bash script body
 */
export function buildReinstallScript({ homeDir }) {
  const cacheRoot = join(homeDir, '.claude', 'plugins', 'cache', 'signal');
  const preRenameCache = join(cacheRoot, 'signal');
  const sigCache = join(cacheRoot, 'sig');

  const steps = [
    bashStep('claude plugin uninstall sig --scope user -y', 'claude plugin uninstall sig --scope user -y'),
    bashStep(`rm -rf ${sigCache}/`, `rm -rf "${sigCache}/"`),
    bashStep(`rm -rf pre-rename cache ${preRenameCache}/ (if present)`, `rm -rf "${preRenameCache}/"`),
    bashStep(
      'clear sig@signal + signal@signal from enabledPlugins in settings.json',
      // Combined two-key removal via inline node -e (same 80-char carve-out).
      `node -e "const fs=require('fs');const p='${settingsPath(homeDir)}';` +
        `const j=JSON.parse(fs.readFileSync(p,'utf8'));` +
        `if(j.enabledPlugins){delete j.enabledPlugins['sig@signal'];delete j.enabledPlugins['signal@signal'];}` +
        `const t=p+'.tmp';fs.writeFileSync(t,JSON.stringify(j,null,2));fs.renameSync(t,p);"`
    ),
    bashStep('claude plugin install sig@signal --scope user', 'claude plugin install sig@signal --scope user'),
  ];

  return BASH_HEADER('--reinstall') + steps.join('') + BASH_FOOTER;
}

/**
 * Atomic write of a generated script to disk. Delegates to atomic-write so
 * tests can simulate failures and re-use the same temp-file + rename pattern.
 *
 * @param {string} scriptPath
 * @param {string} content
 */
export async function writeDoctorScript(scriptPath, content) {
  await atomicWrite(scriptPath, content);
}

// ===== S3 — Version check (FR6) =====
//
// D-E8-7: source is /repos/InsightRiot/signal/tags (NOT /releases/latest, which
// 404s — Signal publishes git tags, not GitHub Releases). Field is `name`, not
// `tag_name`. Strip leading `v` before compare.

const TAGS_URL = 'https://api.github.com/repos/InsightRiot/signal/tags';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

function versionCachePath(homeDir) {
  return join(homeDir, '.claude', '.sig-version-cache.json');
}

/**
 * Fetch the most-recent tag name from GitHub. Returns null on any failure
 * mode (offline, 404, empty array, malformed JSON, timeout) — `/sig:status`
 * silently skips the staleness banner when this returns null.
 *
 * @param {{fetchFn?:Function}} opts
 * @returns {Promise<string|null>} e.g. "v0.1.2"
 */
export async function fetchLatestTag({ fetchFn = fetch } = {}) {
  try {
    const res = await fetchFn(TAGS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const tags = await res.json();
    if (!Array.isArray(tags) || tags.length === 0) return null;
    const firstName = tags[0]?.name;
    return typeof firstName === 'string' ? firstName : null;
  } catch {
    return null;
  }
}

/**
 * Read the 24h on-disk cache at ~/.claude/.sig-version-cache.json. Returns null
 * on miss / parse-fail / shape-fail (invalid → miss per RESEARCH § 2).
 *
 * @param {{homeDir:string}} opts
 * @returns {Promise<{fetched_at:string, data:object}|null>}
 */
export async function readVersionCache({ homeDir }) {
  const cachePath = versionCachePath(homeDir);
  if (!existsSync(cachePath)) return null;
  try {
    const raw = await readFile(cachePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.fetched_at !== 'string' || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Atomic write of the version cache. Stamps `fetched_at` to now.
 *
 * @param {{homeDir:string, data:object}} opts
 */
export async function writeVersionCache({ homeDir, data }) {
  const cachePath = versionCachePath(homeDir);
  const payload = { fetched_at: new Date().toISOString(), data };
  await atomicWrite(cachePath, JSON.stringify(payload, null, 2));
}

/**
 * Compose cache + fetch + TTL check. Returns the latest tag name (cached or
 * freshly fetched) or null if the API is unreachable.
 *
 * Within 24h of last fetch → cached value, no network call.
 * Cache stale or missing → fetch fresh + write cache.
 *
 * @param {{homeDir:string, fetchFn?:Function, now?:()=>number}} opts
 * @returns {Promise<string|null>}
 */
export async function fetchLatestVersionCached({ homeDir, fetchFn = fetch, now = Date.now } = {}) {
  const cached = await readVersionCache({ homeDir });
  if (cached) {
    const age = now() - Date.parse(cached.fetched_at);
    if (age < CACHE_TTL_MS && cached.data && typeof cached.data.name === 'string') {
      return cached.data.name;
    }
  }
  const fresh = await fetchLatestTag({ fetchFn });
  if (fresh) {
    await writeVersionCache({ homeDir, data: { name: fresh } });
    return fresh;
  }
  return null;
}

/**
 * Hand-rolled 3-part numeric version compare. Strips leading `v`, ignores
 * pre-release suffixes (anything after `-`).
 *
 * @param {string} installed
 * @param {string} latest
 * @returns {'stale'|'current'|'newer'}
 */
export function compareVersions(installed, latest) {
  const parse = (v) =>
    String(v)
      .replace(/^v/, '')
      .split('-')[0] // strip pre-release suffix
      .split('.')
      .map((n) => parseInt(n, 10) || 0);

  const a = parse(installed);
  const b = parse(latest);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const ai = a[i] || 0;
    const bi = b[i] || 0;
    if (ai < bi) return 'stale';
    if (ai > bi) return 'newer';
  }
  return 'current';
}

/**
 * Map the (installed × latest × P-states) tuple to a recommendation string,
 * per the FR6 matrix. Returns null when no banner should be shown.
 *
 * @param {{installed:string, latest:string|null, pStatesDetected:boolean}} opts
 * @returns {string|null}
 */
export function computeStalenessRecommendation({ installed, latest, pStatesDetected }) {
  // Latest unknown → silent skip (API failed or no tags exist).
  if (!latest) return null;

  const cmp = compareVersions(installed, latest);

  if (cmp === 'stale') {
    return pStatesDetected
      ? 'Run /sig:doctor --reinstall (clean install + upgrade).'
      : 'Run /plugin install sig@signal to upgrade.';
  }
  if (cmp === 'current') {
    return pStatesDetected
      ? 'Run /sig:doctor --fix to remediate the detected install-state issues.'
      : null;
  }
  // installed > latest (e.g., running a dev build ahead of any tag) — silent.
  return null;
}

/**
 * Abort script generation if the marketplace cache contains case-mismatched
 * sibling directories (e.g., both `signal/` and `Signal/`). On case-sensitive
 * filesystems this is ambiguous — we can't safely target either without risk
 * of hitting the wrong one. On the default case-insensitive macOS APFS volume
 * this can't happen, but external volumes + WSL bind-mounts can produce it.
 *
 * @param {{homeDir:string, fsImpl?:object}} opts
 * @throws {DoctorDetectionError} on case clash
 */
export function checkCacheCasingClash({ homeDir, fsImpl = DEFAULT_FS_IMPL }) {
  const cacheRoot = join(homeDir, '.claude', 'plugins', 'cache');
  if (!fsImpl.existsSync(cacheRoot)) return;

  const entries = fsImpl.readdirSync(cacheRoot) || [];
  const seenByLower = new Map();
  for (const entry of entries) {
    const lower = entry.toLowerCase();
    const prior = seenByLower.get(lower);
    if (prior && prior !== entry) {
      throw new DoctorDetectionError(
        `Cache contains case-mismatched marketplace siblings: '${prior}' and '${entry}'. ` +
          `Cannot safely target either from the generated script. ` +
          `Resolve manually (rm or rename one) before re-running /sig:doctor.`
      );
    }
    seenByLower.set(lower, entry);
  }
}
