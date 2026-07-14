// PreToolUse(Edit|Write) spawn harness for hooks/check-state-write.js
// (v0.1.6 REVIEW, Suggestion 3). hook-state-write.test.js exercises the two
// predicate HELPERS in isolation; this drives the actual PROCESS end-to-end so
// the composition (`shape` short-circuits, then `retro`) and the Edit
// reconstruction ($-faithful) are pinned — a future edit that inverted the
// order or dropped the function-replacer would turn this red.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, '..', 'hooks', 'check-state-write.js');

// Spawn the hook with a PreToolUse event on stdin. Returns { status, stderr }.
// execFileSync throws on non-zero exit → capture err.status/err.stderr.
function runHook(event) {
  try {
    execFileSync('node', [HOOK], { encoding: 'utf-8', input: JSON.stringify(event) });
    return { status: 0, stderr: '' };
  } catch (err) {
    return { status: err.status, stderr: (err.stderr ?? '').toString() };
  }
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

  it('E9 composition preserved: SHIP-close without a retro still blocks (exit 2)', () => {
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
    expect(status).toBe(2);
    expect(stderr).toMatch(/retro/i);
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
