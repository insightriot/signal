// M5.E3.S5 — FR5 append-log eviction (evict-with-anchors).
//
// The risky, migrate-shaped piece: relocate closed-milestone DECISIONS.md
// date-sections VERBATIM (byte-identical) to archive/M{n}/DECISIONS.md behind a
// dated pointer, with every `D-…` anchor preserved (resolvable via S2's map).
// Built RED-first, task by task:
//   t1 — parseDecisionSections + selectEvictableSections (date-cutoff classify)
//   t2 — senseAppendLogEvict: verbatim relocate plan + dated pointer + marker
//   t3 — anchor-resolvability gate (fail-closed to detect-only if <100%)
//   t4 — runAppendLogEvict: standalone end-to-end on a fixture repo
//   t5 — compatibility: checkpoint appends untouched; full-file read (no ceiling)

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ROOT } from '../tools/lib/roster.js';
import {
  parseDecisionSections,
  selectEvictableSections,
  senseAppendLogEvict,
  applyAppendLogEvict,
  runAppendLogEvict,
  createSnapshotter,
} from '../tools/lib/migrate-memory.js';

const FIXTURE = join(ROOT, 'tests', 'fixtures', 'decisions-evict', 'DECISIONS.md');
const BOUNDARY = '2026-03-01'; // fixture's synthetic current-milestone open date
const RUN_DATE = '2026-03-10'; // the evict run date (≥ boundary → pointer stays live)
// The fixture's synthetic milestone router: Jan → M1, Feb → M2.
const milestoneOf = (d) => (d < '2026-02-01' ? 'M1' : 'M2');

async function loadFixture() {
  return readFile(FIXTURE, 'utf-8');
}

// Stand up a temp project with `.planning/DECISIONS.md` = the fixture.
async function makeRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'evict-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'DECISIONS.md'), await loadFixture(), 'utf-8');
  return dir;
}
const decisionsPath = (dir) => join(dir, '.planning', 'DECISIONS.md');
const archivePath = (dir, ms) => join(dir, '.planning', 'archive', ms, 'DECISIONS.md');

describe('t1 — parseDecisionSections', () => {
  it('round-trips byte-exact: preamble + Σ section.raw === input', async () => {
    const text = await loadFixture();
    const { preamble, sections } = parseDecisionSections(text);
    expect(preamble + sections.map((s) => s.raw).join('')).toBe(text);
  });

  it('parses ISO dates from `## YYYY-MM-DD` headings and marks undatable as null', async () => {
    const text = await loadFixture();
    const { sections } = parseDecisionSections(text);
    const dates = sections.map((s) => s.date);
    expect(dates).toEqual(['2026-01-10', '2026-01-20', '2026-02-05', null, '2026-03-05']);
  });

  it('captures each section verbatim starting at its `## ` heading', async () => {
    const text = await loadFixture();
    const { sections } = parseDecisionSections(text);
    expect(sections[0].raw.startsWith('## 2026-01-10 — Alpha')).toBe(true);
    // The section body carries its own content verbatim.
    expect(sections[0].raw).toContain('Establish the alpha baseline (D-A-1)');
    // The undatable section is present and datable-null.
    expect(sections[3].raw.startsWith('## Undatable rolling note')).toBe(true);
  });

  it('handles a preamble-only file (no `## ` sections) with an empty section list', () => {
    const text = '# Log\n\nJust a preamble, no dated sections.\n';
    const { preamble, sections } = parseDecisionSections(text);
    expect(sections).toEqual([]);
    expect(preamble).toBe(text);
  });
});

describe('t1 — selectEvictableSections (date cutoff, strict <)', () => {
  it('selects strictly-before-boundary datable sections; keeps on/after and undatable live', async () => {
    const text = await loadFixture();
    const { sections } = parseDecisionSections(text);
    const { evict, live } = selectEvictableSections(sections, BOUNDARY);
    expect(evict.map((s) => s.date)).toEqual(['2026-01-10', '2026-01-20', '2026-02-05']);
    // on/after the boundary stays live; the undatable heading stays live.
    expect(live.map((s) => s.date)).toEqual([null, '2026-03-05']);
  });

  it('treats a section dated exactly on the boundary as live (strict <)', () => {
    const onBoundary = '# Log\n\n---\n\n## 2026-03-01 — On the boundary\n\nStays live.\n';
    const { sections } = parseDecisionSections(onBoundary);
    const { evict, live } = selectEvictableSections(sections, BOUNDARY);
    expect(evict).toEqual([]);
    expect(live).toHaveLength(1);
  });
});

describe('t2 — senseAppendLogEvict (verbatim relocate plan)', () => {
  it('plans per-milestone eviction, tagging each evicted D-… to its archive home', async () => {
    const original = await loadFixture();
    const plan = senseAppendLogEvict(original, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    expect(plan.noop).toBe(false);
    expect(plan.evicts.map((e) => e.milestone)).toEqual(['M1', 'M2']);
    const homes = Object.fromEntries(plan.evictedIds.map((e) => [e.id, e.archiveRel]));
    expect(homes['D-A-1']).toBe('.planning/archive/M1/DECISIONS.md');
    expect(homes['D-A-2']).toBe('.planning/archive/M1/DECISIONS.md');
    expect(homes['D-B-1']).toBe('.planning/archive/M2/DECISIONS.md');
    expect(homes['D-B-2']).toBe('.planning/archive/M2/DECISIONS.md');
    // The live current-milestone anchor (D-C-1) is NOT in the evicted set.
    expect(homes['D-C-1']).toBeUndefined();
  });

  it('a conformant DECISIONS.md (nothing before the boundary) plans a no-op', () => {
    const clean = '# Log\n\n---\n\n## 2026-03-05 — current\n\nAll current (D-C-1).\n';
    const plan = senseAppendLogEvict(clean, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    expect(plan.noop).toBe(true);
    expect(plan.liveText).toBe(clean);
  });
});

describe('t2 — runAppendLogEvict (relocate + dated pointer)', () => {
  let dir;
  beforeEach(async () => { dir = await makeRepo(); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('relocates each block BYTE-identical vs the ORIGINAL section bytes', async () => {
    const original = await loadFixture();
    const res = await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    expect(res.applied).toBe(true);

    // Assert against the ORIGINAL parsed section raws (not conserves' tautology).
    const { sections } = parseDecisionSections(original);
    const rawByDate = Object.fromEntries(sections.map((s) => [s.date, s.raw]));

    const m1 = await readFile(archivePath(dir, 'M1'), 'utf-8');
    expect(m1).toContain(rawByDate['2026-01-10']);
    expect(m1).toContain(rawByDate['2026-01-20']);
    const m2 = await readFile(archivePath(dir, 'M2'), 'utf-8');
    expect(m2).toContain(rawByDate['2026-02-05']);
    // M2's archive must NOT carry M1's blocks (per-milestone routing).
    expect(m2).not.toContain(rawByDate['2026-01-10']);
  });

  it('leaves a dated pointer + byte-stable marker; the live file shrinks; move-never-delete', async () => {
    const original = await loadFixture();
    await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    const live = await readFile(decisionsPath(dir), 'utf-8');

    expect(live.length).toBeLessThan(original.length); // shrank
    expect(live).toContain('<!-- append-log-evicted: M1 -->');
    expect(live).toContain('<!-- append-log-evicted: M2 -->');
    expect(live).toContain(`## ${RUN_DATE} — Closed-milestone decisions relocated (M1)`);
    // Evicted content is GONE from the live file …
    expect(live).not.toContain('Establish the alpha baseline');
    expect(live).not.toContain('Cross-cut gamma across the stack');
    // … but the current-milestone + undatable sections stay live (nothing deleted).
    expect(live).toContain('Delta is current-milestone work (D-C-1)');
    expect(live).toContain('Undatable rolling note');
    // Move-never-delete: the evicted content survives in the archive.
    const m1 = await readFile(archivePath(dir, 'M1'), 'utf-8');
    expect(m1).toContain('Establish the alpha baseline');
  });

  it('the pointer body carries ZERO D-… tokens (else the live map would win the tie)', async () => {
    await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    const live = await readFile(decisionsPath(dir), 'utf-8');
    // Slice out the appended pointer region (everything after the last live section).
    const pointerRegion = live.slice(live.indexOf('<!-- append-log-evicted:'));
    expect(pointerRegion).not.toMatch(/\bD-[A-Za-z0-9]+-\d+\b/);
  });

  it('is idempotent — a second run is a no-op (AC5.5)', async () => {
    await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    const liveAfter1 = await readFile(decisionsPath(dir), 'utf-8');
    const m1After1 = await readFile(archivePath(dir, 'M1'), 'utf-8');

    const res2 = await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    expect(res2.noop).toBe(true);
    expect(await readFile(decisionsPath(dir), 'utf-8')).toBe(liveAfter1);
    expect(await readFile(archivePath(dir, 'M1'), 'utf-8')).toBe(m1After1);
  });
});

// Build a temp repo with a custom DECISIONS.md body (for the gate edge cases).
async function makeRepoWith(content) {
  const dir = await mkdtemp(join(tmpdir(), 'evict-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'DECISIONS.md'), content, 'utf-8');
  return dir;
}

describe('t3 — anchor-resolvability gate (fail-closed to detect-only)', () => {
  let dir;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it('every evicted D-… resolves to ITS archive home post-regen (real resolver)', async () => {
    dir = await makeRepo();
    const res = await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    expect(res.applied).toBe(true);
    expect(res.detectOnly).toBeFalsy();
    // Post-regen the D-ID map (rebuilt fresh from disk) resolves each evicted anchor
    // to the SPECIFIC archive file it landed in — not merely "somewhere".
    const { resolveDecisionId } = await import('../tools/lib/planning-index.js');
    expect(await resolveDecisionId(dir, 'D-A-1')).toBe('.planning/archive/M1/DECISIONS.md');
    expect(await resolveDecisionId(dir, 'D-B-2')).toBe('.planning/archive/M2/DECISIONS.md');
  });

  it('refuses (detect-only) when an evicted ID would NOT resolve to the archive — DECISIONS.md untouched', async () => {
    dir = await makeRepo();
    const original = await readFile(decisionsPath(dir), 'utf-8');
    // A deliberately broken map: force D-A-1 to resolve to the live file.
    const brokenResolve = async (baseDir, id) => {
      if (id === 'D-A-1') return '.planning/DECISIONS.md';
      const { resolveDecisionId } = await import('../tools/lib/planning-index.js');
      return resolveDecisionId(baseDir, id);
    };
    const res = await runAppendLogEvict(dir, {
      boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE, resolveId: brokenResolve,
    });
    expect(res.detectOnly).toBe(true);
    expect(res.applied).toBeFalsy();
    expect(res.misses.map((m) => m.id)).toContain('D-A-1');
    // Mutates nothing: DECISIONS.md bytes are exactly the original (rolled back).
    expect(await readFile(decisionsPath(dir), 'utf-8')).toBe(original);
    // The newly-created archive file was removed by the surgical rollback.
    expect(existsSync(archivePath(dir, 'M1'))).toBe(false);
  });

  it('realistic split prefix (evicted num inside the retained live range) → detect-only', async () => {
    // D-A-5 evicts to M1; the live section retains D-A-3 + D-A-9, so prefix A
    // spans [3,9] in the live file. resolveDecisionId prefers the live home on a
    // tie, so the evicted D-A-5 resolves to LIVE → the gate fail-closes.
    const split = [
      '# Log', '', 'Preamble.', '', '---', '',
      '## 2026-01-10 — Closed, shares prefix A', '',
      '**Decision:** Evicted milestone-one decision carrying D-A-5.', '', '---', '',
      '## 2026-03-05 — Live, prefix A spans the boundary', '',
      '**Decision:** Current-milestone work carrying D-A-3 and D-A-9.', '',
    ].join('\n');
    dir = await makeRepoWith(split);
    const res = await runAppendLogEvict(dir, {
      boundaryDate: BOUNDARY, milestoneOf: () => 'M1', dateStr: RUN_DATE,
    });
    expect(res.detectOnly).toBe(true);
    expect(res.applied).toBeFalsy();
    expect(await readFile(decisionsPath(dir), 'utf-8')).toBe(split);
  });
});

describe('t4 — standalone end-to-end (NOT wired into applyMigrate)', () => {
  let dir;
  beforeEach(async () => { dir = await makeRepo(); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  const indexPath = (d) => join(d, '.planning', 'INDEX.md');

  it('runs the full parse→cut→relocate→regen-index→anchor-check pipeline green', async () => {
    const res = await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    expect(res.applied).toBe(true);
    expect(res.detectOnly).toBeFalsy();
    // relocate: per-milestone archives exist.
    expect(existsSync(archivePath(dir, 'M1'))).toBe(true);
    expect(existsSync(archivePath(dir, 'M2'))).toBe(true);
    // regen-index: INDEX.md is refreshed and lists the new archive DECISIONS files.
    const index = await readFile(indexPath(dir), 'utf-8');
    expect(index).toContain('archive/M1/DECISIONS.md');
    expect(index).toContain('archive/M2/DECISIONS.md');
    // anchor-check passed: evicted IDs resolve to their archive home (independent verify).
    const { resolveDecisionId } = await import('../tools/lib/planning-index.js');
    expect(await resolveDecisionId(dir, 'D-A-1')).toBe('.planning/archive/M1/DECISIONS.md');
    expect(await resolveDecisionId(dir, 'D-B-1')).toBe('.planning/archive/M2/DECISIONS.md');
  });

  it('operates directly on DECISIONS.md — no STATE.md / applyMigrate involved', async () => {
    // The fixture repo has NO STATE.md; applyMigrate would refuse (no frontmatter),
    // proving this entry is genuinely standalone, not a thin applyMigrate wrapper.
    expect(existsSync(join(dir, '.planning', 'STATE.md'))).toBe(false);
    const res = await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    expect(res.applied).toBe(true);
  });

  it('idempotent re-run is a no-op (AC5.5) — every file byte-unchanged', async () => {
    await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    const after1 = {
      live: await readFile(decisionsPath(dir), 'utf-8'),
      m1: await readFile(archivePath(dir, 'M1'), 'utf-8'),
      m2: await readFile(archivePath(dir, 'M2'), 'utf-8'),
      index: await readFile(indexPath(dir), 'utf-8'),
    };
    const res2 = await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    expect(res2.noop).toBe(true);
    expect(await readFile(decisionsPath(dir), 'utf-8')).toBe(after1.live);
    expect(await readFile(archivePath(dir, 'M1'), 'utf-8')).toBe(after1.m1);
    expect(await readFile(archivePath(dir, 'M2'), 'utf-8')).toBe(after1.m2);
    expect(await readFile(indexPath(dir), 'utf-8')).toBe(after1.index);
  });

  it('dry-run reports the plan and writes nothing', async () => {
    const before = await readFile(decisionsPath(dir), 'utf-8');
    const res = await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE, dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(res.applied).toBeFalsy();
    expect(res.evicts.map((e) => e.milestone)).toEqual(['M1', 'M2']);
    expect(await readFile(decisionsPath(dir), 'utf-8')).toBe(before);
    expect(existsSync(archivePath(dir, 'M1'))).toBe(false);
    expect(existsSync(indexPath(dir))).toBe(false);
  });
});

describe('t5 — compatibility (checkpoint appends + full-file read)', () => {
  let dir;
  beforeEach(async () => { dir = await makeRepo(); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('a checkpoint-authored current-date section stays LIVE (AC5.4)', async () => {
    // /sig:checkpoint --context appends `## <today> — Checkpoint-captured: …` to
    // the LIVE DECISIONS.md. Today is always ≥ the current-milestone open date, so
    // the append must survive the evict (eviction only moves closed-milestone blocks).
    const { captureCheckpointContext } = await import('../tools/lib/checkpoint.js');
    await captureCheckpointContext(dir, { decisions: ['A fresh current decision (D-C-9)'] });

    await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });

    const live = await readFile(decisionsPath(dir), 'utf-8');
    expect(live).toContain('Checkpoint-captured: A fresh current decision (D-C-9)');
    // …and the closed-milestone blocks are gone (the evict still did its job).
    expect(live).not.toContain('Establish the alpha baseline');
  });

  it('parses every section of a >1 MB DECISIONS.md — nothing dropped past FILE_SCAN_CEILING', () => {
    const pad = 'X'.repeat(1024 * 1024 + 500); // pushes the 2nd heading past 1 MB
    const big = [
      '# Log', '', 'Preamble.', '', '---', '',
      '## 2026-01-05 — Early closed decision (D-Z-1)', '',
      `**Decision:** ${pad}`, '', '---', '',
      '## 2026-02-15 — Late closed decision past the 1 MB mark (D-Z-2)', '',
      '**Decision:** A section that lives beyond FILE_SCAN_CEILING.', '',
    ].join('\n');
    const { sections } = parseDecisionSections(big);
    expect(sections).toHaveLength(2);
    expect(sections[1].heading).toContain('Late closed decision past the 1 MB mark');
  });

  it('evicts a section located BEYOND the 1 MB mark (runner reads the whole file)', async () => {
    const pad = 'X'.repeat(1024 * 1024 + 500);
    const big = [
      '# Log', '', 'Preamble.', '', '---', '',
      '## 2026-01-05 — Early closed decision (D-Z-1)', '',
      `**Decision:** ${pad}`, '', '---', '',
      '## 2026-02-15 — Late closed decision past the 1 MB mark (D-Z-2)', '',
      '**Decision:** A section that lives beyond FILE_SCAN_CEILING.', '',
    ].join('\n');
    dir = await makeRepoWith(big);
    const res = await runAppendLogEvict(dir, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    expect(res.applied).toBe(true);
    // The late (past-1 MB) section was found + relocated — not silently dropped.
    const m2 = await readFile(archivePath(dir, 'M2'), 'utf-8');
    expect(m2).toContain('Late closed decision past the 1 MB mark');
    expect(m2).toContain('beyond FILE_SCAN_CEILING');
  });
});

describe('applyAppendLogEvict — the composable seam S6a wires under applyMigrate', () => {
  let dir;
  beforeEach(async () => { dir = await makeRepo(); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('applies against an INJECTED snapshotter (S6a supplies applyMigrate\'s shared one)', async () => {
    const plan = senseAppendLogEvict(await loadFixture(), { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    // A spy snapshotter proves the injected snap/rollback are the ones used.
    const snapped = [];
    const inner = createSnapshotter(join(dir, '.planning'));
    const snap = async (rel) => { snapped.push(rel); await inner.snap(rel); };
    const res = await applyAppendLogEvict(dir, plan, { snap, rollback: inner.rollback });
    expect(res.applied).toBe(true);
    expect(res.detectOnly).toBe(false);
    // The injected snap saw DECISIONS.md + both archives (the whole touched set).
    expect(snapped).toContain('DECISIONS.md');
    expect(snapped).toContain('archive/M1/DECISIONS.md');
    expect(existsSync(archivePath(dir, 'M1'))).toBe(true);
    // The step does NOT regen INDEX.md (S6a's tail regen owns that).
    expect(existsSync(join(dir, '.planning', 'INDEX.md'))).toBe(false);
  });

  it('a gate miss fires the INJECTED rollback (detect-only) — DECISIONS.md restored', async () => {
    const original = await readFile(decisionsPath(dir), 'utf-8');
    const plan = senseAppendLogEvict(original, { boundaryDate: BOUNDARY, milestoneOf, dateStr: RUN_DATE });
    let rolledBack = false;
    const inner = createSnapshotter(join(dir, '.planning'));
    const rollback = async () => { rolledBack = true; await inner.rollback(); };
    const res = await applyAppendLogEvict(dir, plan, {
      snap: inner.snap,
      rollback,
      resolveId: async () => '.planning/DECISIONS.md', // force every anchor to miss
    });
    expect(res.detectOnly).toBe(true);
    expect(rolledBack).toBe(true);
    expect(await readFile(decisionsPath(dir), 'utf-8')).toBe(original);
    expect(existsSync(archivePath(dir, 'M1'))).toBe(false);
  });
});
