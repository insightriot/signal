#!/usr/bin/env node
// SessionStart stale-binding warning (B52). A Node hook — NOT bash, so it runs
// identically on Windows. Modeled on warn-layout-drift.js: dependency-light
// import, fail-open main, direct-invocation guard.
//
// It warns when the plugin copy THIS process resolved is not the copy the
// install record names — the state a session enters by staying alive across a
// plugin auto-update, where every config file on disk is correct and the
// running code is still two releases old.
//
// WHAT THIS HOOK CAN AND CANNOT SEE. Claude Code resolves the plugin path once,
// at session start, so this hook necessarily runs BEFORE any mid-session
// auto-update — the 78-second race that opened B52 would still be silent here.
// SessionStart catches the case it can: a session starting on a cache that is
// already behind the record (the 2026-08-03 sighting), and any re-fire on
// `/clear` (which is how the 2026-08-02 sighting surfaced). The mid-session
// case is covered on the COMMAND path instead — `/sig:status` and `/sig:resume`
// re-read both files at the moment of use, which is the only moment that can
// observe an update that landed after binding. Both surfaces share this lib;
// neither is sufficient alone.
//
// It also ships inside the cache copy it is checking, so it cannot fire until a
// session binds to a version that HAS it. Inherent to shipping a check inside
// the thing being checked, not a defect — stated so nobody tests it wrong.

import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { readBindingDrift, formatBindingDriftBanner } from '../tools/lib/plugin-binding.js';

function main() {
  try {
    // No boundRoot argument: plugin-binding.js derives it from its OWN resolved
    // path, and that module was loaded out of the same tree as this hook — so
    // the answer is the copy actually executing, which is the whole question.
    const banner = formatBindingDriftBanner(readBindingDrift({ homeDir: homedir() }));
    if (banner) {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'SessionStart',
            additionalContext: banner,
          },
        }) + '\n'
      );
    }
  } catch {
    // Cardinal rule: never crash a session start. Any escape → silent exit 0.
  }
  process.exit(0);
}

// Run only when invoked directly, never when imported by the test suite.
// realpath-compare so a `..`-laden argv or a symlink still matches (or, on any
// error, degrades to "not main" — the safe direction).
let isDirect = false;
try {
  isDirect =
    Array.isArray(process.argv) &&
    !!process.argv[1] &&
    realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch {
  isDirect = false;
}
if (isDirect) main();
