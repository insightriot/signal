// /sig:checkpoint — manual state-refresh helpers (M4.5.E6.S2).
//
// Quick mode (default): diff git log since last_updated_commit against
// STATE.md's recorded state, render the diff, write under strict gate.
// --context mode (D16): additionally prompt for decisions + open questions
// and dual-write them to CONTEXT.md (§Locked Decisions) AND DECISIONS.md.

/**
 * Parse `$ARGUMENTS` for `/sig:checkpoint`. Only the `--context` flag is
 * recognized in Slice 2; everything else surfaces as `unknownFlags` so the
 * command file can render a warning rather than silently dropping input.
 *
 * @param {string|undefined} argsString
 * @returns {{contextMode: boolean, unknownFlags: string[]}}
 */
export function parseCheckpointArgs(argsString) {
  const tokens = String(argsString ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  let contextMode = false;
  const unknownFlags = [];
  for (const t of tokens) {
    if (t === '--context') {
      contextMode = true;
    } else {
      unknownFlags.push(t);
    }
  }
  return { contextMode, unknownFlags };
}
