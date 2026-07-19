// Pre-reorg layout banner for /sig:resume + /sig:status (M5.E2.S3.t2, FR7.2).
//
// The COMMAND-PATH counterpart to the SessionStart hook (S3.t1). Same nudge, but
// two things differ from the hook and are the whole point of this task:
//   1. IMPORT FREEDOM — /sig:resume and /sig:status are commands (not a fail-open-
//      at-import SessionStart hook), so the banner is built on the migrate engine's
//      real structural-sniff source (`senseProject`), which reads the FR7 stamp AND
//      detects every pending vector/move in one pass.
//   2. STRUCTURAL-SNIFF FALLBACK — the hook's `decideLayoutDrift` is stamp-first
//      only: a fenced-no-stamp file returns preReorg:true, which would FALSE-banner
//      a project that is already structurally conformant but simply never got
//      stamped. `decideLayoutBanner` layers the sniff on top: no stamp → banner only
//      when there is genuine pending reorg work.
//
// Load-bearing invariants (the RED-first matrix):
//   - post-reorg (stamp >= CURRENT)                    → SILENT (no banner);
//   - pre-reorg  (stamp < CURRENT, OR no stamp + real  → banner in resume AND status;
//                 within-STATE vector / v3 evict / archive move)
//   - unstamped BUT structurally conformant            → SILENT (the t2-vs-t1 thesis:
//                 the stamp-first hook would banner this; the command path must not);
//   - malformed stamp on a conformant file             → SILENT (fail-open, no false
//                 banner — a parse hiccup must never nag a clean project);
//   - CRLF post-reorg                                  → SILENT (Windows autocrlf).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Wrap the REAL senseProject in a counting spy (calls through — behavior is
// preserved for every other test) so the perf block can PROVE readLayoutBanner
// short-circuits on a stamped project and NEVER runs the full-corpus walk. A
// throwing spy would break the legitimate sniff-fallback tests; an `opts.sense`
// injection can't produce the RED (the pre-fix impl ignores the arg and calls the
// real senseProject regardless). A module spy on the real export is the only honest
// way to observe the unconditional call the fix removes.
vi.mock('../tools/lib/migrate-memory.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, senseProject: vi.fn(actual.senseProject) };
});

import {
  decideLayoutBanner,
  readLayoutBanner,
  LAYOUT_DRIFT_BANNER_COMMAND,
} from '../tools/lib/status.js';
import { renderResumeBriefing } from '../tools/lib/resume.js';
import { CURRENT_LAYOUT_VERSION, senseProject } from '../tools/lib/migrate-memory.js';
import { LAYOUT_VERSION } from '../tools/lib/layout-stamp.js';
// The S3.t1 hook decision — stamp-first ONLY. Imported here to PROVE, as a lasting
// regression guard, that it false-banners the unstamped-conformant case while the
// command path stays silent (the reason t2 exists on top of t1).
import { decideLayoutDrift } from '../hooks/warn-layout-drift.js';

// --- fixtures ---------------------------------------------------------------

const CONFORMANT_BODY = `# Project State
a small conformant body — well under the inlined-body threshold.
`;

// Post-reorg: stamped at CURRENT, structurally clean → must be SILENT.
const POST_REORG = `---
schema_version: 1
docs_layout_version: ${CURRENT_LAYOUT_VERSION}
phase: EXECUTE
current_epic: null
completed_phases:
  - DISCUSS (2026-07-16)
blockers: []
---
${CONFORMANT_BODY}`;

// Unstamped but structurally conformant → the t2 thesis case → must be SILENT.
// (The stamp-first hook decideLayoutDrift returns preReorg:true on this exact shape.)
const UNSTAMPED_CONFORMANT = `---
schema_version: 1
phase: EXECUTE
current_epic: null
completed_phases:
  - DISCUSS (2026-07-16)
blockers: []
---
${CONFORMANT_BODY}`;

// Pre-reorg with a REAL within-STATE vector: no stamp + a big inlined body (>8 KB,
// the vector-2 INLINED_BODY_THRESHOLD). "No stamp" alone is the conformant case —
// this fixture carries genuine drift → must BANNER.
const PRE_REORG_DRIFT = `---
schema_version: 1
phase: EXECUTE
current_epic: null
---
# Project State
${'x'.repeat(9 * 1024)}
`;

// Malformed stamp (non-numeric value) on an otherwise-conformant file. The stamp
// read degrades to null (no \\d+ match) → structural sniff → clean → must be SILENT.
const MALFORMED_STAMP = `---
schema_version: 1
docs_layout_version: not-a-number
phase: EXECUTE
current_epic: null
completed_phases:
  - DISCUSS (2026-07-16)
blockers: []
---
${CONFORMANT_BODY}`;

// CRLF post-reorg (Windows autocrlf) — senseState is \\r?\\n-tolerant; prove it.
const POST_REORG_CRLF = POST_REORG.replace(/\n/g, '\r\n');

// --- synthetic sensed objects (pure decideLayoutBanner unit target) ---------

// The stamp-null banner decision keys off `v3Conformant` (senseProject's filesystem-
// aware v3 conformance) + `archive.moves` (un-archived closed scaffolds — which
// v3Conformant does not cover). A fully-v3-structured project is the silent default.
const sensed = (over = {}) => ({
  stamp: null,
  v3Conformant: true,
  archive: { moves: [] },
  flags: [],
  ...over,
});

// --- helpers ----------------------------------------------------------------

// Plant a project whose STATE.md is `state`. A BACKLOG.md is planted too so the
// project is actually v3-conformant on disk (post-S6b, the banner's structural sniff
// checks the FR6 file lifecycle: inbox renamed + BACKLOG present). Without it, a
// clean-STATE unstamped fixture is structurally PRE-v3 (missing BACKLOG) and correctly
// banners — so the "must stay silent" fixtures below are silent for the RIGHT reason
// (genuinely on the v3 layout), not by an accident of the old vector-only definition.
async function plant(dir, state) {
  const planning = join(dir, '.planning');
  await mkdir(planning, { recursive: true });
  await writeFile(join(planning, 'STATE.md'), state, 'utf-8');
  await writeFile(join(planning, 'BACKLOG.md'), '# Backlog\n', 'utf-8');
  return dir;
}

// A minimal-but-valid renderResumeBriefing params bag; layoutBanner is the axis.
const briefingParams = (layoutBanner) => ({
  cwd: '/tmp/proj',
  state: { phase: 'EXECUTE', completed_phases: [] },
  profile: { tier: 'FULL' },
  layoutBanner,
});

// ============================================================================
// 1. PURE decideLayoutBanner — the stamp-first + structural-sniff decision
// ============================================================================

describe('decideLayoutBanner — stamp-first', () => {
  it('post-reorg (stamp == CURRENT) → silent (false)', () => {
    expect(decideLayoutBanner(sensed({ stamp: CURRENT_LAYOUT_VERSION }))).toBe(false);
  });

  it('ahead stamp (stamp > CURRENT) → silent (false) — cannot predate the layout', () => {
    expect(decideLayoutBanner(sensed({ stamp: CURRENT_LAYOUT_VERSION + 1 }))).toBe(false);
  });

  it('old stamp (stamp < CURRENT) → banner (true), even on a clean structure', () => {
    expect(
      decideLayoutBanner(sensed({ stamp: CURRENT_LAYOUT_VERSION - 1, conformant: true }))
    ).toBe(true);
  });
});

describe('decideLayoutBanner — structural sniff (no/unparseable stamp)', () => {
  it('unstamped + structurally conformant → silent (false) — the t2 thesis', () => {
    expect(decideLayoutBanner(sensed({ stamp: null }))).toBe(false);
  });

  it('unstamped + within-STATE vector (not v3-conformant) → banner (true)', () => {
    // A within-STATE V1/V2 vector makes the project NOT v3-conformant on disk.
    expect(decideLayoutBanner(sensed({ stamp: null, v3Conformant: false }))).toBe(true);
  });

  it('unstamped + a pending v3 evict (not v3-conformant) → banner (true)', () => {
    // A pending closed-Epic evict is folded into v3Conformant (senseVector3).
    expect(decideLayoutBanner(sensed({ stamp: null, v3Conformant: false }))).toBe(true);
  });

  it('unstamped + a pending archive move ONLY → banner (true)', () => {
    expect(
      decideLayoutBanner(sensed({ stamp: null, archive: { moves: ['a→b'] } }))
    ).toBe(true);
  });

  it('unstamped + flags ONLY (soft-long / milestone-bloat) → silent (false)', () => {
    // Flags are advisory, not vectors/moves — a flags-only project must stay silent.
    expect(
      decideLayoutBanner(sensed({ stamp: null, flags: [{ kind: 'milestone-bloat' }] }))
    ).toBe(false);
  });
});

// ============================================================================
// 2. Disk-aware readLayoutBanner — the shared sensing both commands call
// ============================================================================

describe('readLayoutBanner (disk-aware, fail-open)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-layout-banner-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('post-reorg (stamp=CURRENT) → null (silent)', async () => {
    const dir = await plant(join(tempDir, 'post'), POST_REORG);
    expect(await readLayoutBanner(dir)).toBeNull();
  });

  it('pre-reorg (no stamp + big inlined body) → banner string', async () => {
    const dir = await plant(join(tempDir, 'pre'), PRE_REORG_DRIFT);
    const banner = await readLayoutBanner(dir);
    expect(banner).toBe(LAYOUT_DRIFT_BANNER_COMMAND);
    expect(banner).toMatch(/\/sig:migrate-memory/);
  });

  it('unstamped-but-conformant → null (no false banner — the t2 thesis)', async () => {
    const dir = await plant(join(tempDir, 'clean'), UNSTAMPED_CONFORMANT);
    expect(await readLayoutBanner(dir)).toBeNull();
  });

  it('malformed stamp on a conformant file → null (fail-open, no false banner)', async () => {
    const dir = await plant(join(tempDir, 'malformed'), MALFORMED_STAMP);
    expect(await readLayoutBanner(dir)).toBeNull();
  });

  it('CRLF post-reorg → null (silent; senseState is \\r?\\n-tolerant)', async () => {
    const dir = await plant(join(tempDir, 'crlf'), POST_REORG_CRLF);
    expect(await readLayoutBanner(dir)).toBeNull();
  });

  it('no .planning/ at all → null (fail-open, never throws)', async () => {
    const dir = join(tempDir, 'empty');
    await mkdir(dir, { recursive: true });
    expect(await readLayoutBanner(dir)).toBeNull();
  });

  // The t2-vs-t1 thesis, as a lasting regression guard: the S3.t1 stamp-first hook
  // WOULD false-banner the unstamped-conformant file (preReorg:true), while the
  // command path — with its structural sniff — stays silent (null).
  it('contrast: stamp-first hook banners unstamped-conformant; command path does not', async () => {
    expect(decideLayoutDrift(UNSTAMPED_CONFORMANT).preReorg).toBe(true);
    const dir = await plant(join(tempDir, 'contrast'), UNSTAMPED_CONFORMANT);
    expect(await readLayoutBanner(dir)).toBeNull();
  });
});

// ============================================================================
// 2b. PERF short-circuit — a stamped project must NOT trigger the full-corpus walk
// ============================================================================
//
// The REVIEW finding this task fixes: readLayoutBanner called senseProject
// UNCONDITIONALLY on every /sig:status AND /sig:resume — a full `.planning/**/*.md`
// corpus walk + an uncapped STATE.md read, heaviest on exactly the bloated projects
// the Epic targets (and a mild DoS floor on an adversarial `.planning/`). The fix
// does a cheap capped-prefix stamp read first; an integer stamp decides the banner
// purely (stamp < CURRENT → banner, else silent) and returns WITHOUT senseProject.
// Only an absent/unparseable stamp falls back to the structural sniff.
//
// A LARGE stamped body makes the cost concrete; the assertion is on the senseProject
// call count (the wrapped-real spy), which is what the short-circuit removes.

describe('readLayoutBanner — capped-stamp short-circuit (perf / DoS floor)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-layout-perf-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // A big stamped-at-CURRENT STATE.md: tiny stamped frontmatter + a large body.
  const bigStamped = (stamp) =>
    `---\nschema_version: 1\ndocs_layout_version: ${stamp}\nphase: EXECUTE\n---\n` +
    'x'.repeat(600 * 1024);

  it('stamped == CURRENT + large body → silent, WITHOUT the full-corpus walk', async () => {
    const dir = await plant(join(tempDir, 'bigpost'), bigStamped(CURRENT_LAYOUT_VERSION));
    senseProject.mockClear();
    const banner = await readLayoutBanner(dir);
    expect(banner).toBeNull(); // stamp == CURRENT → correct answer is silent
    expect(senseProject).not.toHaveBeenCalled(); // RED pre-fix: called unconditionally
  });

  it('stamped < CURRENT + large body → banner, WITHOUT the full-corpus walk', async () => {
    const dir = await plant(join(tempDir, 'bigold'), bigStamped(CURRENT_LAYOUT_VERSION - 1));
    senseProject.mockClear();
    const banner = await readLayoutBanner(dir);
    expect(banner).toBe(LAYOUT_DRIFT_BANNER_COMMAND); // old stamp → banner
    expect(senseProject).not.toHaveBeenCalled(); // decided purely from the stamp
  });

  it('unstamped-but-conformant → senseProject IS consulted (the sniff fallback)', async () => {
    const dir = await plant(join(tempDir, 'unstamped'), UNSTAMPED_CONFORMANT);
    senseProject.mockClear();
    const banner = await readLayoutBanner(dir);
    expect(banner).toBeNull(); // conformant → silent, but only the sniff knows that
    expect(senseProject).toHaveBeenCalledTimes(1); // no stamp → falls through
  });

  it('malformed stamp → falls back to the sniff (no integer to short-circuit on)', async () => {
    const dir = await plant(join(tempDir, 'malformed'), MALFORMED_STAMP);
    senseProject.mockClear();
    const banner = await readLayoutBanner(dir);
    expect(banner).toBeNull();
    expect(senseProject).toHaveBeenCalledTimes(1);
  });

  // Parity gate: a stray `docs_layout_version:` line WITHOUT a frontmatter opening
  // fence must NOT short-circuit — the short-circuit only trusts a stamp inside real
  // frontmatter (senseState/splitFrontmatter's own precondition). It falls through to
  // the sniff, which sees no frontmatter → conformant → silent, exactly as the old
  // unconditional-senseProject path did. (Without the `^---` gate this false-banners.)
  it('stamp line without a frontmatter fence → falls through to the sniff (silent)', async () => {
    const noFence = `docs_layout_version: 1\njust free text, no frontmatter fence here\n`;
    const dir = await plant(join(tempDir, 'nofence-stamp'), noFence);
    senseProject.mockClear();
    const banner = await readLayoutBanner(dir);
    expect(banner).toBeNull();
    expect(senseProject).toHaveBeenCalledTimes(1);
  });

  it('LAYOUT_VERSION (layout-stamp.js) never disagrees with the engine', () => {
    expect(LAYOUT_VERSION).toBe(CURRENT_LAYOUT_VERSION);
  });
});

// ============================================================================
// 3. renderResumeBriefing wiring — the /sig:resume render surface
// ============================================================================

describe('renderResumeBriefing — layout banner (advisory tier)', () => {
  it('renders the layout banner when a string is passed', () => {
    const out = renderResumeBriefing(briefingParams(LAYOUT_DRIFT_BANNER_COMMAND));
    expect(out).toContain(LAYOUT_DRIFT_BANNER_COMMAND);
    // Advisory tier: it sits ABOVE the body header, never inside the briefing body.
    expect(out.indexOf(LAYOUT_DRIFT_BANNER_COMMAND)).toBeLessThan(out.indexOf('== Project Briefing =='));
  });

  it('omits the layout banner when null (post-reorg / conformant)', () => {
    const out = renderResumeBriefing(briefingParams(null));
    expect(out).not.toContain('predates the current docs layout');
  });

  it('places the layout banner BELOW a schema-drift banner (advisory < trust signal)', () => {
    const out = renderResumeBriefing({
      ...briefingParams(LAYOUT_DRIFT_BANNER_COMMAND),
      schemaDriftResult: { status: 'behind', message: 'STATE.md schema drift (behind).' },
    });
    const schemaIdx = out.indexOf('schema drift');
    const layoutIdx = out.indexOf(LAYOUT_DRIFT_BANNER_COMMAND);
    expect(schemaIdx).toBeGreaterThanOrEqual(0);
    expect(layoutIdx).toBeGreaterThan(schemaIdx);
  });
});
