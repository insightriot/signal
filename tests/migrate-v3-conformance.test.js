// M5.E3.S6a.t3 — isV3Conformant (the v3 stamp gate) + stamp relocation.
//
// The stamp is what silences the layout-drift banner, so it must fire ONLY when the
// project is FULLY v3 on disk — not merely when the STATE text is vector-clean. A
// STATE-text-only predicate would pass a text-only test while shipping the
// self-silencing-banner bug (stamped v3 with FUTURE-IDEAS.md still present), so
// isV3Conformant reads the FILESYSTEM and these fixtures PLANT real files. Built
// RED-first: isV3Conformant does not exist before this task.

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  isV3Conformant,
  senseState,
  applyMigrate,
  CURRENT_LAYOUT_VERSION,
} from '../tools/lib/migrate-memory.js';
import { LAYOUT_VERSION } from '../tools/lib/layout-stamp.js';
import { readLayoutBanner, decideLayoutBanner, LAYOUT_DRIFT_BANNER_COMMAND } from '../tools/lib/status.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });

// A conformant STATE.md (no V1/V2 vectors) — stamp value is irrelevant to
// conformance (conformant = vectors.length === 0).
const STATE_CLEAN =
  `---\nschema_version: 1\ndocs_layout_version: 2\nphase: EXECUTE\ncurrent_epic: M5.E3\n` +
  `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-18)\nblockers: []\n---\n` +
  `# Project State\n\nlive pointer\n`;
// A V2-dirty STATE (body > 8 KB → vector-2 candidate → NOT conformant).
const STATE_BLOATED =
  `---\nschema_version: 1\ndocs_layout_version: 2\nphase: EXECUTE\ncurrent_epic: M5.E3\n` +
  `current_tasks: []\ncompleted_phases: []\nblockers: []\n---\n# Project State\n\n${'x'.repeat(9000)}\n`;

// DECISIONS.md whose sole closed section is already evicted (a dated pointer only) —
// senseAppendLogEvict finds nothing before the boundary → evict-done.
const DECISIONS_EVICTED =
  '# Decisions\n\nlog.\n\n---\n\n<!-- append-log-evicted: M1 -->\n' +
  '## 2026-03-10 — Closed-milestone decisions relocated (M1)\n\nSee the archive.\n';
// DECISIONS.md with a routable pre-boundary section still live (evict PENDING).
const DECISIONS_PENDING =
  '# Decisions\n\nlog.\n\n---\n\n## 2026-01-10 — Closed M1 decision\n\n**Decision:** Alpha (D-A-1).\n';

const EV_OPTS = { boundaryDate: '2026-03-01', milestoneOf: () => 'M1' };

async function plant({ state = STATE_CLEAN, futureIdeas = false, backlog = true, decisions = null } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'v3-conf-'));
  const p = join(dir, '.planning');
  await mkdir(p, { recursive: true });
  await writeFile(join(p, 'STATE.md'), state, 'utf-8');
  if (futureIdeas) await writeFile(join(p, 'FUTURE-IDEAS.md'), '# Future Ideas\n', 'utf-8');
  if (backlog) await writeFile(join(p, 'BACKLOG.md'), '# Backlog\n', 'utf-8');
  if (decisions) await writeFile(join(p, 'DECISIONS.md'), decisions, 'utf-8');
  return dir;
}

describe('t3 — isV3Conformant (filesystem-aware, both directions)', () => {
  const dirs = [];
  const track = (d) => { dirs.push(d); return d; };
  afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });

  it('FALSE when FUTURE-IDEAS.md is still on disk (vector-clean STATE) — banner stays', async () => {
    // The exact self-silencing-banner case: STATE text is clean, but the inbox was
    // never renamed → not v3 → must NOT be stamped.
    const dir = track(await plant({ futureIdeas: true, backlog: true }));
    expect(await isV3Conformant(dir, STATE_CLEAN)).toBe(false);
  });

  it('TRUE when fully file-migrated (inbox renamed, BACKLOG present, evict done) — silent', async () => {
    const dir = track(await plant({ futureIdeas: false, backlog: true, decisions: DECISIONS_EVICTED }));
    expect(await isV3Conformant(dir, STATE_CLEAN, EV_OPTS)).toBe(true);
  });

  it('FALSE when BACKLOG.md is missing', async () => {
    const dir = track(await plant({ futureIdeas: false, backlog: false }));
    expect(await isV3Conformant(dir, STATE_CLEAN)).toBe(false);
  });

  it('FALSE when a routable closed-milestone DECISIONS section is still pending', async () => {
    const dir = track(await plant({ futureIdeas: false, backlog: true, decisions: DECISIONS_PENDING }));
    expect(await isV3Conformant(dir, STATE_CLEAN, EV_OPTS)).toBe(false);
  });

  it('FALSE when the STATE within-doc vectors are dirty (body over threshold)', async () => {
    const dir = track(await plant({ state: STATE_BLOATED, futureIdeas: false, backlog: true }));
    expect(await isV3Conformant(dir, STATE_BLOATED)).toBe(false);
  });
});

describe('t3 — senseState is NOT widened (banner-path blast radius)', () => {
  it('remains a pure single-arg text predicate', () => {
    // isV3Conformant is a SEPARATE function; senseState stays (stateText) only —
    // widening it to take baseDir would blast the fail-open banner hook + status.js.
    expect(senseState.length).toBe(1);
    expect(senseState(STATE_CLEAN).conformant).toBe(true);
  });
});

// M5.E3.S6a.t4 — arming: bump CURRENT_LAYOUT_VERSION + its layout-stamp mirror 2→3.
// The bump is what ARMS the whole v3 chain: a v2-stamped project (stamp 2) now
// satisfies `2 < 3` → needsV3 → banners on resume/status/SessionStart. Built RED-first
// (with the constant still 2, `2 < 2` is false → a stamp-2 project does NOT banner and
// the value pins fail). The banner is the fail-open, non-blocking advisory nudge — it
// must never crash /sig:resume or /sig:status.
//
// A STATE.md stamped at CURRENT (the fully-migrated v3 project) — silent by contract.
const STATE_V3 =
  `---\nschema_version: 1\ndocs_layout_version: ${CURRENT_LAYOUT_VERSION}\nphase: EXECUTE\ncurrent_epic: M5.E3\n` +
  `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-18)\nblockers: []\n---\n` +
  `# Project State\n\nlive pointer\n`;

describe('t4 — arming: v2 banners under v3 (constant bumped 2→3)', () => {
  const dirs = [];
  const track = (d) => { dirs.push(d); return d; };
  afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });

  it('CURRENT_LAYOUT_VERSION and its layout-stamp mirror are BOTH 3 (arming pin — AC6.1)', () => {
    // The literal pin is the point HERE (unlike the codebase's symbolic style
    // elsewhere): AC6.1 states `CURRENT_LAYOUT_VERSION === 3`, and this is the one
    // test whose purpose is to pin the arming version. A future v4 bump updates it
    // deliberately. The relative mirror-sync assertion lives in migrate-layout-banner.
    expect(CURRENT_LAYOUT_VERSION).toBe(3);
    expect(LAYOUT_VERSION).toBe(3);
  });

  it('decideLayoutBanner({stamp: 2}) is TRUE once armed — a literal v2 stamp is behind CURRENT', () => {
    // Pure decision: stamp 2 < CURRENT 3 → banner. RED while the constant is still 2
    // (2 < 2 is false). This is the exact arming behavior (Signal's own stamp-2 repo).
    expect(decideLayoutBanner({ stamp: 2 })).toBe(true);
  });

  it('a docs_layout_version: 2 project banners on resume/status — fail-open, non-blocking', async () => {
    const dir = track(await plant({ state: STATE_CLEAN, backlog: true }));
    const banner = await readLayoutBanner(dir);
    // Advisory nudge present (not null) — the disk-aware banner path fired…
    expect(banner).not.toBeNull();
    expect(banner).toBe(LAYOUT_DRIFT_BANNER_COMMAND);
    // …and it is the non-blocking advisory copy (never a hard error).
    expect(banner).toMatch(/advisory; nothing is blocked/i);
  });

  it('a docs_layout_version: 3 (CURRENT) project is SILENT', async () => {
    const dir = track(await plant({ state: STATE_V3, backlog: true }));
    expect(await readLayoutBanner(dir)).toBeNull();
  });
});

describe('t3 — stamp relocated to the tail (fires on v3-conformance)', () => {
  let dir;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('a full clean v2→v3 migrate stamps STATE to CURRENT via the tail gate', async () => {
    dir = await mkdtemp(join(tmpdir(), 'v3-stamp-'));
    const p = join(dir, '.planning');
    await mkdir(join(p, 'archive', 'M1'), { recursive: true });
    // stamp 1 → needsV3; FUTURE-IDEAS present (renames) + closed DECISIONS (evicts).
    await writeFile(join(p, 'STATE.md'),
      `---\nschema_version: 1\ndocs_layout_version: 1\nphase: EXECUTE\ncurrent_epic: M5.E3\n` +
      `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-18)\nblockers: []\n---\n# Project State\n\nlive pointer\n`,
      'utf-8');
    await writeFile(join(p, 'FUTURE-IDEAS.md'), '# Future Ideas\n\n## idea\n\nbody\n', 'utf-8');
    await writeFile(join(p, 'DECISIONS.md'),
      '# Decisions\n\nlog.\n\n---\n\n## 2026-01-10 — Closed M1 decision\n\n**Decision:** Alpha (D-A-1).\n',
      'utf-8');
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.email', 't@t.co']);
    git(dir, ['config', 'user.name', 'T']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);

    const res = await applyMigrate(dir, {
      stamp: 'T1', dateStr: '2026-03-10', boundaryDate: '2026-03-01', milestoneOf: () => 'M1',
    });
    expect(res.applied).toBe(true);
    // The relocated tail stamp fired on full v3-conformance.
    expect(res.stampedTo).toBe(CURRENT_LAYOUT_VERSION);
    const finalState = await readFile(join(p, 'STATE.md'), 'utf-8');
    expect(finalState).toContain(`docs_layout_version: ${CURRENT_LAYOUT_VERSION}`);
    // The migrate is genuinely v3-conformant now (independent verify).
    expect(await isV3Conformant(dir, finalState, { boundaryDate: '2026-03-01', milestoneOf: () => 'M1' })).toBe(true);
  });
});
