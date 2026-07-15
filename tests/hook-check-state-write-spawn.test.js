// PreToolUse(Edit|Write) spawn harness for hooks/check-state-write.js
// (v0.1.6 REVIEW, Suggestion 3). hook-state-write.test.js exercises the two
// predicate HELPERS in isolation; this drives the actual PROCESS end-to-end so
// the composition (`shape` short-circuits, then `retro`) and the Edit
// reconstruction ($-faithful) are pinned — a future edit that inverted the
// order or dropped the function-replacer would turn this red.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, '..', 'hooks', 'check-state-write.js');

// Spawn the hook with a PreToolUse event on stdin. Returns { status, stderr }.
// spawnSync captures stderr on ANY exit code — needed since the retro path now
// warns on exit 0 (D-E11-5), not just blocks on exit 2.
function runHook(event) {
  const r = spawnSync('node', [HOOK], { encoding: 'utf-8', input: JSON.stringify(event) });
  return { status: r.status, stderr: (r.stderr ?? '').toString() };
}

const CLEAN = `---
schema_version: 1
phase: EXECUTE
current_epic: null
current_wave: null
current_tasks: []
completed_phases:
  - DISCUSS (2026-07-13)
blockers: []
---
body
`;

describe('check-state-write.js spawn — composition + reconstruction', () => {
  let dir, statePath;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-hook-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
    statePath = join(dir, '.planning', 'STATE.md');
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('allows a Write of clean frontmatter (exit 0)', () => {
    const { status } = runHook({
      tool_name: 'Write',
      tool_input: { file_path: statePath, content: CLEAN },
    });
    expect(status).toBe(0);
  });

  it('FR1: blocks a Write with prose in completed_phases (exit 2)', () => {
    const prose = `---
schema_version: 1
phase: EXECUTE
current_epic: null
completed_phases:
  - "**Active: a long multi-line narrative that keeps
    rambling across physical lines and never belongs here"
blockers: []
---
body
`;
    const { status, stderr } = runHook({
      tool_name: 'Write',
      tool_input: { file_path: statePath, content: prose },
    });
    expect(status).toBe(2);
    expect(stderr).toMatch(/completed_phases/);
  });

  it('D-E11-5: SHIP-close without a retro now WARNS on the hook path (exit 0 + stderr)', () => {
    const shipNoRetro = `---
schema_version: 1
phase: SHIP
current_epic: M4.5.E3
completed_phases:
  - SHIP (2026-05-26)
blockers: []
---
body
`;
    const { status, stderr } = runHook({
      tool_name: 'Write',
      tool_input: { file_path: statePath, content: shipNoRetro },
    });
    // Two-tier split (B2): the HOOK path warns (non-blocking); the hard retro
    // contract lives in /sig:ship §0.5, not here.
    expect(status).toBe(0);
    expect(stderr).toMatch(/retro/i);
    expect(stderr).toMatch(/warning/i);
  });

  it('R2: SHIP-close with a malformed current_epic fails open (exit 0, no crash)', () => {
    // current_epic "v0.1.6" makes deriveRetroPath throw; the hook must fail
    // open (exit 0), never crash a normal write.
    const shipBadEpic = `---
schema_version: 1
phase: SHIP
current_epic: v0.1.6
completed_phases:
  - SHIP (2026-07-15)
blockers: []
---
body
`;
    const { status } = runHook({
      tool_name: 'Write',
      tool_input: { file_path: statePath, content: shipBadEpic },
    });
    expect(status).toBe(0);
  });

  it('$-faithful Edit reconstruction: a new_string with `$\\`` stays clean (exit 0)', async () => {
    // Plant a file with a PLACEHOLDER inside a completed_phases entry.
    await writeFile(
      statePath,
      `---
schema_version: 1
phase: EXECUTE
current_epic: null
completed_phases:
  - PLACEHOLDER
blockers: []
---
body
`,
    );
    // new_string contains $\` — String.replace would expand it to "everything
    // before the match" (the whole frontmatter prefix, with newlines), turning
    // the entry multi-line → a spurious BLOCK. The function-replacer inserts it
    // literally → a short single-line entry → ALLOW.
    const { status } = runHook({
      tool_name: 'Edit',
      tool_input: {
        file_path: statePath,
        old_string: 'PLACEHOLDER',
        new_string: 'PLAN (2026-07-13) $` tail',
        replace_all: false,
      },
    });
    expect(status).toBe(0);
  });

  it('fails open on a non-STATE.md path (exit 0)', () => {
    const { status } = runHook({
      tool_name: 'Write',
      tool_input: { file_path: join(dir, 'README.md'), content: 'anything' },
    });
    expect(status).toBe(0);
  });
});
