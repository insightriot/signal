// M5.E2.S1.t7c — pre-apply dangling-link baseline + dry-run three-tier render.
//
// FR6.3 "before AND after": a dangling link that ALREADY existed before the
// migrate must not be attributed to it (else a stranger's pre-broken repo can
// never be migrated). Only NEW dangles the migrate introduces abort+rollback.
// Proof-of-fail: a pre-existing dangle attributed to the migrate → apply aborts →
// the test (which expects success) fails.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  scanDanglingLinks,
  computeDanglingDelta,
  partitionDangling,
  applyMigrate,
  renderDryRun,
  runMigrate,
} from '../tools/lib/migrate-memory.js';
import { computeLinkEdits } from '../tools/lib/archive-tree.js';

const git = (cwd, args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
const HUGE = 'meaningful narrative words across a sentence here. '.repeat(220);
const STATE =
  `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M5.E2\ncurrent_tasks: []\n` +
  `completed_phases:\n  - "DISCUSS (2026-07-01) — ${HUGE}"\nblockers: []\n---\n# Project State\n\nlive\n`;

async function setup(dir, { danglingDoc = false } = {}) {
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'STATE.md'), STATE, 'utf-8');
  if (danglingDoc) {
    // A PRE-EXISTING dangling link, unrelated to the migrate.
    await writeFile(join(dir, '.planning', 'NOTES.md'), 'see [gone](MISSING.md) and [ok](STATE.md)\n', 'utf-8');
  }
  git(dir, ['init', '-q', '-b', 'main']);
  git(dir, ['config', 'user.email', 't@t.co']);
  git(dir, ['config', 'user.name', 'T']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-q', '-m', 'init']);
}

describe('M5.E2.S1.t7c scanDanglingLinks + computeDanglingDelta', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-dang-'));
    await setup(dir, { danglingDoc: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('detects a dangling .md link, ignores a valid one', async () => {
    const dangles = await scanDanglingLinks(dir);
    expect(dangles.some((d) => d.target === 'MISSING.md')).toBe(true);
    expect(dangles.some((d) => d.target === 'STATE.md')).toBe(false); // STATE.md exists
  });

  it('computeDanglingDelta returns only NEW dangles (baseline subtracted, keyed on resolved abs-target)', () => {
    // AC1.5 (B24): each dangle now carries `abs` — the resolved repo-root-relative
    // POSIX target computeDanglingDelta keys on (the ONE quantity the append-log
    // evict's block-move + link-reroot holds invariant). file/link/target stay for
    // display; the delta is computed off `abs`.
    const before = [{ file: '.planning/A.md', link: 'x.md', target: 'x.md', abs: '.planning/x.md' }];
    const after = [
      { file: '.planning/A.md', link: 'x.md', target: 'x.md', abs: '.planning/x.md' }, // pre-existing
      { file: '.planning/B.md', link: 'y.md', target: 'y.md', abs: '.planning/y.md' }, // NEW
    ];
    const delta = computeDanglingDelta(before, after);
    expect(delta).toHaveLength(1);
    expect(delta[0].target).toBe('y.md');
  });

  it('computeDanglingDelta re-keys on abs so a relocated+re-rooted pre-existing dangle is subtracted (B24)', () => {
    // The pre-existing dangle lived in .planning/DECISIONS.md as `./ghost.md`; the evict
    // moved the closed block to archive/M1 and re-rooted the link to `../../ghost.md`.
    // BOTH file and link text mutate — the old `file\0link` key could not subtract it
    // (the B24 over-abort). Its RESOLVED target `.planning/ghost.md` is invariant, so
    // keying on `abs` subtracts it → no NEW dangle attributed to the migrate.
    const before = [
      { file: '.planning/DECISIONS.md', link: './ghost.md', target: './ghost.md', abs: '.planning/ghost.md' },
    ];
    const after = [
      { file: '.planning/archive/M1/DECISIONS.md', link: '../../ghost.md', target: '../../ghost.md', abs: '.planning/ghost.md' },
    ];
    expect(computeDanglingDelta(before, after)).toHaveLength(0);
  });

  it('computeDanglingDelta uses COUNT/MULTISET semantics — a 2nd dangle to an already-missing target is still NEW (AC1.4)', () => {
    // One PRE-EXISTING dangle to X (relocated+re-rooted by the evict — file/link mutate,
    // abs invariant), PLUS a migrate-INTRODUCED second reference dangling to the SAME X.
    // Multiset: subtract at most as many post-apply dangles as the baseline HELD for X
    // (here 1) → the extra reference is attributed → returned. A plain Set would collapse
    // both to one key and drop BOTH → the introduced one silently slips (the masking bug
    // this AC exists to catch). The old file\0link key over-counts instead (returns 2).
    const before = [
      { file: '.planning/DECISIONS.md', link: './ghost.md', target: './ghost.md', abs: '.planning/ghost.md' },
    ];
    const after = [
      { file: '.planning/archive/M1/DECISIONS.md', link: '../../ghost.md', target: '../../ghost.md', abs: '.planning/ghost.md' },
      { file: '.planning/NOTES.md', link: './ghost.md', target: './ghost.md', abs: '.planning/ghost.md' },
    ];
    const delta = computeDanglingDelta(before, after);
    expect(delta).toHaveLength(1);
    expect(delta[0].file).toBe('.planning/NOTES.md');
  });
});

describe('M5.E2.S1.t7c applyMigrate dangling attribution', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-dang2-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('a PRE-EXISTING dangle is NOT attributed to the migrate (apply succeeds)', async () => {
    await setup(dir, { danglingDoc: true }); // NOTES.md → MISSING.md dangles before we touch anything
    const r = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17' });
    expect(r.applied).toBe(true); // the pre-existing dangle did not block the migrate
  });

  it('a NEW dangle the migrate introduces → abort + rollback', async () => {
    await setup(dir);
    // Injected scanner: clean baseline, then a new dangle post-apply.
    let calls = 0;
    const scanDangling = async () => {
      calls += 1;
      return calls === 1 ? [] : [{ file: '.planning/STATE.md', link: 'GONE.md', target: 'GONE.md' }];
    };
    await expect(
      applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-17', scanDangling }),
    ).rejects.toThrow(/dangling/i);
  });
});

describe('M5.E2.S1.t7c renderDryRun (three-tier)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-render-'));
    await setup(dir, { danglingDoc: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('renders counts, mechanical moves, and the faithfulness diff + flags pre-existing dangles', async () => {
    const out = await renderDryRun(dir);
    // Tier 1 — counts.
    expect(out).toMatch(/vector-1/);
    expect(out).toMatch(/vector-2/);
    // Tier 3 — the faithfulness diff shows the prose that will move.
    expect(out).toMatch(/meaningful narrative words/);
    // Pre-existing dangles are surfaced SEPARATELY (the migrate isn't blamed).
    expect(out).toMatch(/pre-existing dangling/i);
    expect(out).toMatch(/MISSING\.md/);
    // Nothing was written by the dry-run.
    const dry = await runMigrate(dir, { apply: false });
    expect(dry.applied).toBe(false);
  });
});

// M5.E5.T1 — B24: a PRE-EXISTING dangle inside an EVICTED closed-milestone block
// must NOT be attributed to the migrate (inverts the old M5.E4 B23(a) assertion).
//
// The append-log evict re-roots the inline `](*.md)` links inside each evicted
// DECISIONS block (rerootEvictPlan) so they resolve from the block's NEW archive
// home. That reroot recomputes each link's relative path to the SAME absolute
// target, so a link that RESOLVED before the move still resolves after — the reroot
// is resolution-PRESERVING and can never, on its own, turn a resolving link into a
// dangle (Assumption 1, D1 — this block confirms it end-to-end).
//
// The B24 bug: when a strictly-closed DECISIONS block carries a PRE-EXISTING broken
// `](*.md)` link (ghost.md missing before the migrate touched anything), the evict
// moves the block to archive/M1/ AND re-roots the still-broken link. The OLD
// computeDanglingDelta keyed on `file\0link`, so a NEW file + NEW link text could not
// be subtracted against the pre-apply baseline → the pre-existing dangle was misread
// as migrate-INTRODUCED → enforceNoDangling aborted + rolled back byte-identical.
// A stranger whose closed DECISIONS history carried ANY broken `](*.md)` link was
// blocked from migrating. renderDryRun disagreed (it correctly listed the same link
// as "pre-existing, NOT caused by this migrate") — a dry-run/apply divergence.
//
// The fix (D1): re-key computeDanglingDelta on the RESOLVED repo-root-relative POSIX
// target (`.planning/ghost.md`), the one quantity the move+reroot holds invariant,
// with multiset/count semantics. The pre-existing dangle is now subtracted → the
// migrate SUCCEEDS: the closed block relocates, the live DECISIONS.md shortens, and
// the still-broken (still-pre-existing) link rides along, re-rooted, un-blamed.
describe('M5.E5.T1 — B24: a PRE-EXISTING dangle inside an EVICTED closed-milestone block is not attributed to the migrate', () => {
  // A v3-pending STATE (docs_layout_version below CURRENT → needsV3) so the append-log
  // evict fires under applyMigrate.
  const V3_STATE =
    `---\nschema_version: 1\ndocs_layout_version: 1\nphase: EXECUTE\ncurrent_epic: M5.E3\n` +
    `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-18)\nblockers: []\n---\n` +
    `# Project State\n\nlive pointer\n`;
  // One strictly-closed M1 section (evicts) whose inline link points at a GENUINELY
  // missing file (ghost.md is never created) — a PRE-EXISTING dangle — + one current
  // section that stays live. The closed section carries realistic narrative bulk (real
  // closed milestones are large — that is why they evict) so the live file genuinely
  // SHORTENS once the block is relocated behind a dated pointer.
  const CLOSED_BODY = 'Detailed rationale narrative for the closed milestone decision. '.repeat(40);
  const V3_DECISIONS =
    '# Decisions\n\nProject decision log.\n\n---\n\n' +
    '## 2026-01-10 — Closed M1 decision\n\n' +
    `**Decision:** Alpha baseline (D-A-1). See [the M1 plan](./ghost.md) for detail. ${CLOSED_BODY}\n\n---\n\n` +
    '## 2026-03-05 — Current decision\n\n**Decision:** Current work (D-C-1).\n';
  const EVICT_OPTS = { stamp: 'T1', dateStr: '2026-03-10', boundaryDate: '2026-03-01', milestoneOf: () => 'M1' };

  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-b24-'));
    const planning = join(dir, '.planning');
    await mkdir(planning, { recursive: true });
    await writeFile(join(planning, 'STATE.md'), V3_STATE, 'utf-8');
    await writeFile(join(planning, 'DECISIONS.md'), V3_DECISIONS, 'utf-8');
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.email', 't@t.co']);
    git(dir, ['config', 'user.name', 'T']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('AC1.1 — the migrate SUCCEEDS: the closed block relocates + re-roots the pre-existing dangle, live DECISIONS shortens', async () => {
    const decisionsPath = join(dir, '.planning', 'DECISIONS.md');
    const before = await readFile(decisionsPath, 'utf-8');
    // The dangle is REAL and PRE-EXISTING: ghost.md is genuinely absent BEFORE the
    // migrate, and NO stubbed scanDangling / resolveId is passed — the live
    // scanDanglingLinks gate runs unmocked.
    expect(existsSync(join(dir, '.planning', 'ghost.md'))).toBe(false);

    const r = await applyMigrate(dir, EVICT_OPTS);

    // B24 fix: the pre-existing dangle survives the block-move + link-reroot (its
    // resolved repo-root-relative target is invariant) → NOT attributed → no abort.
    expect(r.applied).toBe(true);

    // The strictly-closed M1 block relocated to its archive home, carrying the
    // re-rooted (still-broken, still-pre-existing) link — resolution-preserved.
    const archivePath = join(dir, '.planning', 'archive', 'M1', 'DECISIONS.md');
    expect(existsSync(archivePath)).toBe(true);
    expect(await readFile(archivePath, 'utf-8')).toContain('](../../ghost.md)');

    // The live DECISIONS.md shortened (the closed section evicted; a dated pointer
    // remains): the evicted decision body left the live file, the current section stayed.
    const after = await readFile(decisionsPath, 'utf-8');
    expect(after.length).toBeLessThan(before.length);
    expect(after).not.toContain('Alpha baseline (D-A-1)');
    expect(after).toContain('Current work (D-C-1)');

    // ghost.md is STILL missing — the migrate neither created nor "fixed" the
    // pre-existing dangle; it simply did not blame the migrate for it.
    expect(existsSync(join(dir, '.planning', 'ghost.md'))).toBe(false);
  });

  it('AC1.2 — dry-run/apply parity: a link renderDryRun calls "pre-existing dangling" does NOT abort apply', async () => {
    // renderDryRun surfaces the closed-block dangle SEPARATELY as pre-existing (not
    // migrate-caused). Post-fix, apply must AGREE — no abort on that same link.
    const out = await renderDryRun(dir, EVICT_OPTS);
    expect(out).toMatch(/pre-existing dangling/i);
    expect(out).toContain('ghost.md');

    const r = await applyMigrate(dir, EVICT_OPTS);
    expect(r.applied).toBe(true);
  });
});

// M5.E6.T11 — B27 (AC4.1): the FR6 rename orphans an ARCHIVE doc's inline link to a
// renamed target — RECLASSIFIED flag-not-abort (D-M5E6-4). This INVERTS the former
// "B24 AC1.3 gate-not-weakened" assertion this block carried: the exact shape that
// used to be the migrate-introduced-abort witness is now the B27 flag case.
//
// Construction: a v3-pending repo where an ARCHIVE doc carries an inline link
// `](../../FUTURE-IDEAS.md)` that RESOLVES before the migrate. The FR6 inbox rename
// (FUTURE-IDEAS.md → ISSUES-INBOX.md) fires; archive-doc referrer rewrites use the
// scaffold-only moveMap (the rename is R7-excluded for PROSE flat-paths), so this
// INLINE link is NOT rewritten → after the rename its resolved target
// `.planning/FUTURE-IDEAS.md` is gone. Pre-B27 the gate aborted (the target was ABSENT
// from the baseline, so the dangle looked migrate-introduced). Per R7, an archived
// doc's historical reference to a renamed target is a fact of the past, not a live
// link to repair → migrate now FLAGS it and completes. (The gate STILL bites a genuine
// non-exempt dangle — T13's residual-abort discriminator is the counterweight.)
describe('M5.E6.T11 — B27 (AC4.1): the FR6 rename orphans a resolving archive link → FLAGGED, migrate succeeds', () => {
  const V3_STATE =
    `---\nschema_version: 1\ndocs_layout_version: 1\nphase: EXECUTE\ncurrent_epic: M5.E3\n` +
    `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-18)\nblockers: []\n---\n` +
    `# Project State\n\nlive pointer\n`;

  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-b24-introduced-'));
    const planning = join(dir, '.planning');
    await mkdir(join(planning, 'archive', 'M0'), { recursive: true });
    await writeFile(join(planning, 'STATE.md'), V3_STATE, 'utf-8');
    // FUTURE-IDEAS.md exists (ISSUES-INBOX.md does not) → the FR6 rename fires.
    await writeFile(join(planning, 'FUTURE-IDEAS.md'), '# Ideas\n\nsome ideas\n', 'utf-8');
    // An archive doc with an INLINE markdown link to FUTURE-IDEAS.md — resolves pre-apply.
    await writeFile(
      join(planning, 'archive', 'M0', 'OLD-NOTE.md'),
      'historical: see [the inbox](../../FUTURE-IDEAS.md) for the backlog.\n',
      'utf-8',
    );
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.email', 't@t.co']);
    git(dir, ['config', 'user.name', 'T']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('the archive-inline link to an FR6-renamed target is FLAGGED (R7-historical), migrate SUCCEEDS', async () => {
    const notePath = join(dir, '.planning', 'archive', 'M0', 'OLD-NOTE.md');
    const noteBefore = await readFile(notePath, 'utf-8');
    // The link RESOLVES pre-apply — so its resolved target is ABSENT from the baseline.
    expect(existsSync(join(dir, '.planning', 'FUTURE-IDEAS.md'))).toBe(true);

    // B27 (D-M5E6-4): no abort — the archive-inline link to a renamed target is
    // R7-historical, flagged not aborted. (The warning SURFACING is asserted in T12.)
    const r = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-21' });
    expect(r.applied).toBe(true);

    // The rename LANDED (not rolled back): the new inbox exists, the legacy name is gone.
    expect(existsSync(join(dir, '.planning', 'ISSUES-INBOX.md'))).toBe(true);
    expect(existsSync(join(dir, '.planning', 'FUTURE-IDEAS.md'))).toBe(false);
    // R7: the archived doc's historical reference is left byte-identical (never rewritten).
    expect(await readFile(notePath, 'utf-8')).toBe(noteBefore);
  });
});

// M5.E6.T11 — B27 (AC4.1/AC4.5): partitionDangling routes an archive-doc inline dangle
// whose resolved target ∈ archiveExemptFroms (the FR6 renameFroms) to FLAGS, never the
// abort set. The tightness pair proves the exemption is a TIGHT `AND`, not a blanket
// relaxation: widening it to an `OR` (dropping either conjunct) would make (a) or (b)
// flag instead of abort, which these asserts catch BY CONSTRUCTION.
describe('M5.E6.T11 — B27 partitionDangling exemption is tight (AND, not a blanket relaxation)', () => {
  const EXEMPT = new Set(['.planning/FUTURE-IDEAS.md']);
  const dangle = (abs, file = '.planning/archive/M0/OLD.md') => ({
    file, link: '../../x.md', target: '../../x.md', abs,
  });

  it('AC4.1 (unit): archive-under AND target ∈ renameFroms → FLAG (kind archive-renamed-link)', () => {
    const after = [dangle('.planning/FUTURE-IDEAS.md')];
    const { aborting, flags } = partitionDangling({ after, archiveExemptFroms: EXEMPT });
    expect(aborting).toHaveLength(0);
    expect(flags).toHaveLength(1);
    expect(flags[0].kind).toBe('archive-renamed-link');
  });

  it('tightness (a): archive-under BUT target ∉ renameFroms → still ABORTS', () => {
    // isUnderArchive holds; the renameFroms conjunct does NOT → not exempt.
    const after = [dangle('.planning/GONE.md')];
    const { aborting, flags } = partitionDangling({ after, archiveExemptFroms: EXEMPT });
    expect(aborting).toHaveLength(1);
    expect(flags).toHaveLength(0);
  });

  it('tightness (b): target ∈ renameFroms BUT NOT archive-under → still ABORTS', () => {
    // The renameFroms conjunct holds; isUnderArchive does NOT → not exempt.
    const after = [dangle('.planning/FUTURE-IDEAS.md', '.planning/LIVE.md')];
    const { aborting, flags } = partitionDangling({ after, archiveExemptFroms: EXEMPT });
    expect(aborting).toHaveLength(1);
    expect(flags).toHaveLength(0);
  });
});

// M5.E6.T12 — B27 flag SURFACING (AC4.4). The B27 link resolves BEFORE the rename, so
// it is NOT a pre-existing dangle — it gets its OWN distinct dry-run line ("Archive
// links to FR6-renamed targets"), never the "Pre-existing dangling links" section. And
// applyMigrate captures enforceNoDangling's returned `{flags}` (previously dropped) into
// `result.warnings`. ONE shared predicate (isArchiveRenamedLink) feeds partitionDangling,
// the dry-run scan, and the apply filter, so the preview and the apply warning agree.
describe('M5.E6.T12 — B27 flag surfaces distinctly in dry-run + apply warnings (AC4.4)', () => {
  const V3_STATE =
    `---\nschema_version: 1\ndocs_layout_version: 1\nphase: EXECUTE\ncurrent_epic: M5.E3\n` +
    `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-18)\nblockers: []\n---\n` +
    `# Project State\n\nlive pointer\n`;

  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-t12-b27-'));
    const planning = join(dir, '.planning');
    await mkdir(join(planning, 'archive', 'M0'), { recursive: true });
    await writeFile(join(planning, 'STATE.md'), V3_STATE, 'utf-8');
    // FUTURE-IDEAS.md exists (ISSUES-INBOX.md does not) → the FR6 rename fires.
    await writeFile(join(planning, 'FUTURE-IDEAS.md'), '# Ideas\n\nsome ideas\n', 'utf-8');
    // An archive doc whose INLINE link resolves to FUTURE-IDEAS.md pre-rename (B27).
    await writeFile(
      join(planning, 'archive', 'M0', 'OLD-NOTE.md'),
      'historical: see [the inbox](../../FUTURE-IDEAS.md) for the backlog.\n',
      'utf-8',
    );
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.email', 't@t.co']);
    git(dir, ['config', 'user.name', 'T']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('renderDryRun shows a DISTINCT "Archive links to FR6-renamed targets" line, not pre-existing-dangling', async () => {
    const out = await renderDryRun(dir);
    // The distinct B27 line (AC4.4) with the count + the archive referrer.
    expect(out).toMatch(/Archive links to FR6-renamed targets \(1\)/);
    expect(out).toContain('.planning/archive/M0/OLD-NOTE.md');
    // NOT double-counted as a pre-existing dangle — the link RESOLVES pre-rename.
    expect(out).toMatch(/Pre-existing dangling links \(0\)/);
  });

  it('applyMigrate surfaces the B27 flag in result.warnings, consistent with the dry-run line', async () => {
    // Read-only dry-run FIRST (no mutation), then apply — the two must agree.
    const dry = await renderDryRun(dir);
    const r = await applyMigrate(dir, { stamp: 'T1', dateStr: '2026-07-21' });
    expect(r.applied).toBe(true);

    const warn = (r.warnings ?? []).find((w) => /Archive links to FR6-renamed targets/.test(String(w)));
    expect(warn, 'apply must surface the B27 flag as a warning').toBeDefined();
    // Consistency: the SAME archive referrer appears in both the dry-run line and the warning.
    expect(String(warn)).toContain('.planning/archive/M0/OLD-NOTE.md');
    expect(dry).toContain('.planning/archive/M0/OLD-NOTE.md');
  });
});

// M5.E6.T10 — B28 (AC4.2): an absolute-path `](/abs/foo.md)` `.md` link is a
// PRE-EXISTING dangle that migrate must NOT rewrite. The bug: `computeLinkEdits`
// treats an absolute target with `posix.join()` (which concatenates it under the
// linker dir) while `scanDanglingLinks` resolves it with `resolve()` (which RESETS
// on an absolute path). When the linker MOVES, the reroot mangles `](/x.md)` into a
// relative path, so the resolved before/after target diverges → the pre-existing
// dangle is misread as migrate-INTRODUCED → a fail-safe false-abort (same class as
// B27). Fix: `computeLinkEdits` skips absolute-path targets — they are left
// byte-identical, so their resolved target is invariant and the gate subtracts them.
describe('M5.E6.T10 — B28: computeLinkEdits leaves an absolute-path link byte-identical', () => {
  it('AC4.2 (unit): produces NO edit for an absolute `](/x.md)` link even when the linker moves', () => {
    // The linker MOVES (fNew !== f) — the condition under which the old code rewrote
    // even an absolute target. RED: current code emits `](/x.md)` → `](../../x.md)`.
    const moveMap = new Map([['.planning/OLD.md', '.planning/archive/M1/OLD.md']]);
    const edits = computeLinkEdits('.planning/OLD.md', 'see [x](/x.md) here\n', moveMap);
    expect(edits).toHaveLength(0);
  });

  it('AC4.2 (unit control): a RELATIVE `.md` link IS still rewritten when the linker moves', () => {
    // The skip is surgical to absolute targets — relative links still reroot. Passes
    // before AND after the fix (a guard against over-skipping).
    const moveMap = new Map([['.planning/DIR/OLD.md', '.planning/archive/M1/OLD.md']]);
    const edits = computeLinkEdits('.planning/DIR/OLD.md', 'see [s](./sib.md) here\n', moveMap);
    expect(edits).toHaveLength(1);
    expect(edits[0].from).toBe('](./sib.md)');
  });
});

// M5.E6.T10 — B28 (AC4.2) end-to-end: an absolute-path pre-existing dangle inside an
// EVICTED closed-milestone DECISIONS block migrates successfully and the evicted
// block is byte-identical (the absolute link is NOT rewritten). Mirrors the B24
// relative-link e2e (above) but with the absolute shape B24's abs-key fix did not
// cover. RED against `main`: the reroot mangles `](/…​.md)` → the abs-key diverges →
// false-abort. The append-log evict re-roots links via `rerootEvictPlan` →
// `computeLinkEdits`, so the T10 fix reaches this path.
describe('M5.E6.T10 — B28 (AC4.2): an absolute-path dangle in an evicted closed block migrates + byte-identical', () => {
  const ABS = '/nonexistent-signal-t10-abs.md';
  const V3_STATE =
    `---\nschema_version: 1\ndocs_layout_version: 1\nphase: EXECUTE\ncurrent_epic: M5.E3\n` +
    `current_tasks: []\ncompleted_phases:\n  - PLAN (2026-07-18)\nblockers: []\n---\n` +
    `# Project State\n\nlive pointer\n`;
  const CLOSED_BODY = 'Detailed rationale narrative for the closed milestone decision. '.repeat(40);
  const V3_DECISIONS =
    '# Decisions\n\nProject decision log.\n\n---\n\n' +
    '## 2026-01-10 — Closed M1 decision\n\n' +
    `**Decision:** Alpha baseline (D-A-1). See [the spec](${ABS}) for detail. ${CLOSED_BODY}\n\n---\n\n` +
    '## 2026-03-05 — Current decision\n\n**Decision:** Current work (D-C-1).\n';
  const EVICT_OPTS = { stamp: 'T1', dateStr: '2026-03-10', boundaryDate: '2026-03-01', milestoneOf: () => 'M1' };

  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-t10-abs-'));
    const planning = join(dir, '.planning');
    await mkdir(planning, { recursive: true });
    await writeFile(join(planning, 'STATE.md'), V3_STATE, 'utf-8');
    await writeFile(join(planning, 'DECISIONS.md'), V3_DECISIONS, 'utf-8');
    git(dir, ['init', '-q', '-b', 'main']);
    git(dir, ['config', 'user.email', 't@t.co']);
    git(dir, ['config', 'user.name', 'T']);
    git(dir, ['config', 'commit.gpgsign', 'false']);
    git(dir, ['add', '-A']);
    git(dir, ['commit', '-q', '-m', 'init']);
  });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('the migrate SUCCEEDS and the evicted block keeps the absolute link byte-identical', async () => {
    const decisionsPath = join(dir, '.planning', 'DECISIONS.md');
    const before = await readFile(decisionsPath, 'utf-8');
    // The absolute link resolves to a filesystem-root path that genuinely does not exist.
    expect(existsSync(ABS)).toBe(false);

    const r = await applyMigrate(dir, EVICT_OPTS);

    // B28 fix: the absolute-path dangle survives the block-move UN-rewritten (its
    // resolved target is invariant under `resolve()`) → subtracted → no false abort.
    expect(r.applied).toBe(true);

    // The closed block relocated carrying the absolute link BYTE-IDENTICAL (not
    // rewritten to a `../../…` relative form — that mangling was the bug).
    const archivePath = join(dir, '.planning', 'archive', 'M1', 'DECISIONS.md');
    expect(existsSync(archivePath)).toBe(true);
    const archived = await readFile(archivePath, 'utf-8');
    expect(archived).toContain(`](${ABS})`);
    expect(archived).not.toContain('](../../nonexistent-signal-t10-abs.md)');

    // The live DECISIONS.md shortened (closed section evicted; current section stays).
    const after = await readFile(decisionsPath, 'utf-8');
    expect(after.length).toBeLessThan(before.length);
    expect(after).not.toContain('Alpha baseline (D-A-1)');
    expect(after).toContain('Current work (D-C-1)');
  });
});

describe('M5.E4 — B15: the blocking dangling gate scans the FULL file (no 1 MB truncation)', () => {
  it('finds a dangling .md link PAST the 1 MB scan cap (RED under the old slice)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'b15-scan-'));
    const p = join(dir, '.planning');
    await mkdir(p, { recursive: true });
    // >1 MB of filler, THEN a dangling .md link past the old 1 MB truncation point.
    const filler = 'x'.repeat(1024 * 1024 + 100);
    await writeFile(
      join(p, 'BIG.md'),
      `${filler}\n\nA [dangling](does-not-exist-past-cap.md) link.\n`,
      'utf-8',
    );
    const dangling = await scanDanglingLinks(dir);
    // RED with the 1 MB slice: the link past the cap was never scanned → missed.
    expect(dangling.some((d) => /does-not-exist-past-cap\.md/.test(d.target))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });
});
