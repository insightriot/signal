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
  runAppendLogEvict,
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
