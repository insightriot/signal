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

function notImplemented(name) {
  throw new Error(`${name} not implemented (M4.5.E8.S1.t3 GREEN pending)`);
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
  notImplemented('detectP1StaleGitCommitSha');
}

/**
 * P2 — cache directory present without matching installed_plugins.json entry.
 *
 * @param {object} manifest
 * @param {{existsSync: (p:string)=>boolean, readdirSync: (p:string)=>string[]}} fsImpl
 * @param {string} homeDir
 * @returns {{detected:boolean, evidence?:string[], recommendation?:string, code:'P2'}}
 */
export function detectP2OrphanCacheEntry(manifest, fsImpl, homeDir) {
  notImplemented('detectP2OrphanCacheEntry');
}

/**
 * P3 — settings.json `enabledPlugins` entry without matching installed plugin.
 *
 * @param {object} settings - parsed settings.json
 * @param {object} manifest - parsed installed_plugins.json
 * @returns {{detected:boolean, evidence?:string[], recommendation?:string, code:'P3'}}
 */
export function detectP3OrphanEnabledFlag(settings, manifest) {
  notImplemented('detectP3OrphanEnabledFlag');
}

/**
 * P4 — pre-rename `signal@signal` slug present anywhere (cache, manifest, settings).
 *
 * @param {object} manifest
 * @param {object} settings
 * @param {{existsSync: (p:string)=>boolean}} fsImpl
 * @param {string} homeDir
 * @returns {{detected:boolean, evidence?:string[], recommendation?:string, code:'P4'}}
 */
export function detectP4PreRenameSlug(manifest, settings, fsImpl, homeDir) {
  notImplemented('detectP4PreRenameSlug');
}

/**
 * P5 — SSH multi-identity config detected (informational only — does NOT
 *      change healthy:false on its own; see D-E8-11 P5 carve-out).
 *
 * @param {{existsSync: (p:string)=>boolean, readFileSync: (p:string,enc:string)=>string}} fsImpl
 * @param {string} homeDir
 * @returns {{detected:boolean, evidence?:string, recommendation?:'info-only', code:'P5'}}
 */
export function detectP5SshMultiIdentity(fsImpl, homeDir) {
  notImplemented('detectP5SshMultiIdentity');
}
