// SessionStart layout-drift nudge hook — unit matrix (M5.E2.S3.t1, FR7.2).
//
// Two harnesses in one file:
//   1. SPAWN — `node hooks/warn-layout-drift.js` with cwd pointed at a planted
//      fixture tree. This is the only place the actual PROCESS contract Claude
//      Code depends on (SessionStart JSON on stdout, exit 0) is proven end-to-end.
//   2. IMPORT — the pure core (readCappedPrefix / readLayoutStampFromPrefix /
//      decideLayoutDrift) exercised directly, plus the FM8 capped-read proof and
//      the "never disagree with the engine" version guard.
//
// The load-bearing invariants:
//   - pre-reorg (no stamp / stamp < CURRENT)  → banner in additionalContext;
//   - post-reorg (stamp == CURRENT)           → silent;
//   - absent / malformed(no-fence) / non-.planning cwd → exit 0, no banner;
//   - invalid-YAML frontmatter (proof-of-fail) → exit 0 (a naive yaml.parse with
//     no try/catch CRASHES here — that is the RED the fail-open guard fixes);
//   - FM8: on a large STATE.md the hook reads only a capped prefix, never the
//     whole body (proven non-flakily by readCappedPrefix returning exactly the
//     cap and completing on a file far larger than the cap).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  readCappedPrefix,
  readLayoutStampFromPrefix,
  decideLayoutDrift,
  STAMP_SCAN_BYTES,
  HOOK_LAYOUT_VERSION,
  LAYOUT_DRIFT_BANNER,
} from '../hooks/warn-layout-drift.js';
import { CURRENT_LAYOUT_VERSION } from '../tools/lib/migrate-memory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve `..` so the spawned argv[1] matches the hook's own import.meta.url
// under the main-guard (the guard realpath-compares both).
const HOOK = resolve(__dirname, '..', 'hooks', 'warn-layout-drift.js');

// --- fixtures ---------------------------------------------------------------

const PRE_REORG_NO_STAMP = `---
schema_version: 1
phase: EXECUTE
current_epic: null
completed_phases:
  - DISCUSS (2026-07-16)
blockers: []
---
# Project State
body
`;

const PRE_REORG_STAMP_1 = `---
schema_version: 1
docs_layout_version: 1
phase: EXECUTE
current_epic: null
---
body
`;

// A STATE.md stamped AT the current layout version → fully migrated → silent by
// contract. Tracks CURRENT_LAYOUT_VERSION so a future bump doesn't re-break it.
const POST_REORG_STAMP_CURRENT = `---
schema_version: 1
docs_layout_version: ${CURRENT_LAYOUT_VERSION}
phase: EXECUTE
current_epic: null
---
body
`;

// A now-STALE v2 stamp. After the S6a.t4 arming (CURRENT 2→3) a stamp-2 project sits
// BELOW CURRENT → pre-reorg → it banners. Retained (a) as a known-integer fixture for
// the stamp reader and (b) to prove the arming in the hook path (decideLayoutDrift).
const STALE_STAMP_2 = `---
schema_version: 1
docs_layout_version: 2
phase: EXECUTE
current_epic: null
---
body
`;

// A valid opening + closing fence but INVALID YAML inside (unterminated flow
// sequence). A naive `yaml.parse` with no try/catch throws on this — the RED.
const INVALID_YAML_FRONTMATTER = `---
schema_version: 1
blockers: [oops
---
body
`;

// No frontmatter fence at all → "malformed" per the existing hooks' definition
// (check-state-write bails when the ---...--- fence pair is absent). Must be silent.
const NO_FENCE_GARBAGE = `this is not a frontmatter block
just some free text, no fences here
`;

// A large post-reorg STATE.md: small stamped frontmatter + a big inlined body.
const BIG_BODY = 'x'.repeat(200 * 1024);
const LARGE_POST_REORG =
  `---\nschema_version: 1\ndocs_layout_version: ${CURRENT_LAYOUT_VERSION}\nphase: EXECUTE\n---\n` + BIG_BODY;
// A large pre-reorg STATE.md: small unstamped frontmatter + a big inlined body
// (the E1-by-hand vector-2 shape). Proves the capped read still banners a huge file.
const LARGE_PRE_REORG =
  `---\nschema_version: 1\nphase: EXECUTE\ncurrent_epic: null\n---\n` + BIG_BODY;

// CRLF variants (Windows autocrlf). The stamp read is `\r?\n`-tolerant by
// construction; these prove it (CRLF has bitten this hook family before —
// check-state-write's REVIEW).
const POST_REORG_CRLF = POST_REORG_STAMP_CURRENT.replace(/\n/g, '\r\n');
const PRE_REORG_CRLF = PRE_REORG_NO_STAMP.replace(/\n/g, '\r\n');

// --- helpers ----------------------------------------------------------------

// Spawn the hook process with cwd = fixture. Returns { status, stdout, stderr }.
// spawnSync captures output on ANY exit code (needed to prove the crash-free
// contract even when a naive impl would exit non-zero).
function runHook(cwd) {
  const r = spawnSync('node', [HOOK], {
    cwd,
    encoding: 'utf-8',
    input: JSON.stringify({
      hook_event_name: 'SessionStart',
      source: 'startup',
      cwd,
    }),
  });
  return {
    status: r.status,
    stdout: (r.stdout ?? '').toString(),
    stderr: (r.stderr ?? '').toString(),
  };
}

async function plant(dir, { state } = {}) {
  const planning = join(dir, '.planning');
  await mkdir(planning, { recursive: true });
  if (state !== undefined) {
    await writeFile(join(planning, 'STATE.md'), state, 'utf-8');
  }
  return join(planning, 'STATE.md');
}

// --- SPAWN matrix -----------------------------------------------------------

describe('warn-layout-drift.js hook (spawn harness)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-layout-hook-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('pre-reorg (no stamp) → banner in SessionStart additionalContext, exit 0', async () => {
    const dir = join(tempDir, 'pre');
    await plant(dir, { state: PRE_REORG_NO_STAMP });
    const { status, stdout } = runHook(dir);
    expect(status).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(payload.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(payload.hookSpecificOutput.additionalContext).toMatch(/migrate-memory/);
    expect(payload.hookSpecificOutput.additionalContext).toMatch(/advisory/i);
  });

  it('pre-reorg (stamp=1, below CURRENT) → banner, exit 0', async () => {
    const dir = join(tempDir, 'pre1');
    await plant(dir, { state: PRE_REORG_STAMP_1 });
    const { status, stdout } = runHook(dir);
    expect(status).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(payload.hookSpecificOutput.additionalContext).toMatch(/migrate-memory/);
  });

  it('post-reorg (stamp == CURRENT) → silent, exit 0', async () => {
    const dir = join(tempDir, 'post');
    await plant(dir, { state: POST_REORG_STAMP_CURRENT });
    const { status, stdout } = runHook(dir);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe('');
  });

  it('absent STATE.md (.planning/ exists, no STATE) → silent, exit 0', async () => {
    const dir = join(tempDir, 'absent');
    await plant(dir, {}); // creates .planning/ but no STATE.md
    const { status, stdout } = runHook(dir);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe('');
  });

  it('cwd with no .planning/ → silent, exit 0', async () => {
    const dir = join(tempDir, 'noplanning');
    await mkdir(dir, { recursive: true });
    const { status, stdout } = runHook(dir);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe('');
  });

  it('malformed (no frontmatter fence) → silent, exit 0, no banner', async () => {
    const dir = join(tempDir, 'nofence');
    await plant(dir, { state: NO_FENCE_GARBAGE });
    const { status, stdout } = runHook(dir);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe('');
  });

  // PROOF-OF-FAIL: a throw-on-malformed reader (naive `yaml.parse`, no try/catch)
  // CRASHES on this fixture → non-zero exit. The fail-open guard makes it exit 0.
  //
  // DELIBERATE, DOCUMENTED TRADE-OFF: a fenced-but-corrupt-value STATE.md is a real
  // pre-reorg file with a broken value, so it EMITS the advisory banner (not silence).
  // "Malformed → no banner" is defined STRUCTURALLY (no `---` fence, see the no-fence
  // case above) — NOT by YAML validity. Parsing to detect corruption would throw on a
  // 529 KB frontmatter-bloat file whose closing fence is past the cap, silencing the
  // exact nextpass case the Epic exists to nag. Regex-scan is the only design that both
  // banners nextpass AND never crashes; the cost is a banner on a corrupt value, which
  // is harmless (advisory) and correct (that file needs migrating too).
  it('invalid-YAML frontmatter → exit 0, no crash, advisory banner (regex reader never parses)', async () => {
    const dir = join(tempDir, 'badyaml');
    await plant(dir, { state: INVALID_YAML_FRONTMATTER });
    const { status, stdout, stderr } = runHook(dir);
    expect(status).toBe(0);
    // A thrown, uncaught error prints a V8 stack ("    at ...") to stderr.
    expect(stderr).not.toMatch(/^\s+at\s/m);
    // Fence present + no stamp → banner (the documented trade-off above).
    const payload = JSON.parse(stdout.trim());
    expect(payload.hookSpecificOutput.additionalContext).toMatch(/migrate-memory/);
  });

  it('CRLF post-reorg (stamp == CURRENT) → silent, exit 0', async () => {
    const dir = join(tempDir, 'crlf-post');
    await plant(dir, { state: POST_REORG_CRLF });
    const { status, stdout } = runHook(dir);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe('');
  });

  it('CRLF pre-reorg (no stamp) → banner, exit 0', async () => {
    const dir = join(tempDir, 'crlf-pre');
    await plant(dir, { state: PRE_REORG_CRLF });
    const { status, stdout } = runHook(dir);
    expect(status).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(payload.hookSpecificOutput.additionalContext).toMatch(/migrate-memory/);
  });

  it('FM8: large post-reorg STATE.md → silent, exit 0 (reads only the capped prefix)', async () => {
    const dir = join(tempDir, 'bigpost');
    const statePath = await plant(dir, { state: LARGE_POST_REORG });
    expect(statSync(statePath).size).toBeGreaterThan(STAMP_SCAN_BYTES);
    const { status, stdout } = runHook(dir);
    expect(status).toBe(0);
    expect(stdout.trim()).toBe('');
  });

  it('FM8: large pre-reorg STATE.md (big inlined body, no stamp) → banner, exit 0', async () => {
    const dir = join(tempDir, 'bigpre');
    await plant(dir, { state: LARGE_PRE_REORG });
    const { status, stdout } = runHook(dir);
    expect(status).toBe(0);
    const payload = JSON.parse(stdout.trim());
    expect(payload.hookSpecificOutput.additionalContext).toMatch(/migrate-memory/);
  });
});

// --- IMPORT: pure core + FM8 capped-read proof + version guard --------------

describe('warn-layout-drift.js pure core', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-layout-core-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('HOOK_LAYOUT_VERSION never disagrees with the engine CURRENT_LAYOUT_VERSION', () => {
    expect(HOOK_LAYOUT_VERSION).toBe(CURRENT_LAYOUT_VERSION);
  });

  it('LAYOUT_DRIFT_BANNER names the migrate command and marks itself advisory', () => {
    expect(LAYOUT_DRIFT_BANNER).toMatch(/\/sig:migrate-memory/);
    expect(LAYOUT_DRIFT_BANNER).toMatch(/advisory/i);
  });

  it('readLayoutStampFromPrefix reads the stamp from the frontmatter region', () => {
    expect(readLayoutStampFromPrefix(STALE_STAMP_2)).toBe(2);
    expect(readLayoutStampFromPrefix(PRE_REORG_STAMP_1)).toBe(1);
    expect(readLayoutStampFromPrefix(PRE_REORG_NO_STAMP)).toBe(null);
  });

  it('decideLayoutDrift: post-reorg (stamp == CURRENT) → not pre-reorg', () => {
    expect(decideLayoutDrift(POST_REORG_STAMP_CURRENT).preReorg).toBe(false);
  });

  it('decideLayoutDrift: no stamp / old stamp → pre-reorg', () => {
    expect(decideLayoutDrift(PRE_REORG_NO_STAMP).preReorg).toBe(true);
    expect(decideLayoutDrift(PRE_REORG_STAMP_1).preReorg).toBe(true);
    // Armed by S6a.t4: a stamp-2 project is now below CURRENT (3) → pre-reorg. This
    // is the SessionStart self-banner Signal's own stamp-2 repo now shows (plan Rec 2).
    expect(decideLayoutDrift(STALE_STAMP_2).preReorg).toBe(true);
  });

  it('decideLayoutDrift: no frontmatter fence → NOT pre-reorg (silent)', () => {
    const d = decideLayoutDrift(NO_FENCE_GARBAGE);
    expect(d.hasFrontmatter).toBe(false);
    expect(d.preReorg).toBe(false);
  });

  it('FM8: readCappedPrefix reads exactly the cap on a file larger than the cap', async () => {
    const statePath = await plant(tempDir, { state: LARGE_POST_REORG });
    expect(STAMP_SCAN_BYTES).toBeLessThan(statSync(statePath).size);
    const prefix = readCappedPrefix(statePath, STAMP_SCAN_BYTES);
    // All-ASCII fixture → 1 byte == 1 char; the read is capped, never the whole body.
    expect(prefix.length).toBe(STAMP_SCAN_BYTES);
    // And the capped prefix still carries the stamp (it lives at the top).
    expect(readLayoutStampFromPrefix(prefix)).toBe(CURRENT_LAYOUT_VERSION);
  });

  it('readCappedPrefix returns the whole file when it is smaller than the cap', async () => {
    const statePath = await plant(tempDir, { state: POST_REORG_STAMP_CURRENT });
    const prefix = readCappedPrefix(statePath, STAMP_SCAN_BYTES);
    expect(prefix).toBe(POST_REORG_STAMP_CURRENT);
  });
});
