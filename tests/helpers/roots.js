// M6.E1 — the two roots, named once.
//
// Before this Epic there was one root and every path in the tree resolved
// against it. Now there are two, and the distinction is load-bearing:
//
//   PLUGIN_ROOT  what a user's install contains — commands/, agents/, skills/,
//                references/, hooks/, state/, tools/lib/, .claude-plugin/plugin.json
//   REPO_ROOT    everything else — tests/, .planning/, docs/, analysis/,
//                examples/, tools/*.js maintainer scripts, marketplace.json
//
// The confusing part, and the reason this file exists rather than 20 local
// fixes: several suites hold path strings that MIX the two in one array. The
// adherence apparatus list is the clearest case — `tools/lib/adherence-log.js`
// ships and `tools/adherence-run.js` does not, and they sit two lines apart.
// Resolving those by prefix is a rule; resolving them by hand is 20 chances to
// get it wrong once.
//
// `resolveSignalPath` deliberately takes the path AS WRITTEN in the artifact
// (a canary registry entry, an apparatus list) so those artifacts stay
// plugin-relative and readable, which is how they are also written inside the
// plugin itself.

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PLUGIN_ROOT = join(REPO_ROOT, 'plugin');

/**
 * Path prefixes that live inside the plugin payload. `tools/lib/` is listed
 * before any bare `tools/` handling on purpose: `tools/lib/x.js` ships and
 * `tools/x.js` does not, so prefix order is the whole correctness argument.
 */
export const PAYLOAD_PREFIXES = Object.freeze([
  'commands/',
  'agents/',
  'skills/',
  'references/',
  'hooks/',
  'state/',
  'tools/lib/',
  '.claude-plugin/plugin.json',
]);

/** True when `rel` (as written) names something inside the plugin payload. */
export function isPayloadPath(rel) {
  return PAYLOAD_PREFIXES.some((p) => rel === p || rel.startsWith(p));
}

/**
 * Resolve a path written the way Signal's own artifacts write it — relative to
 * whichever root actually holds it.
 *
 * @param {string} rel e.g. 'commands/execute.md' or 'tools/adherence-run.js'
 * @returns {string} absolute path
 */
export function resolveSignalPath(rel) {
  return join(isPayloadPath(rel) ? PLUGIN_ROOT : REPO_ROOT, rel);
}
