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
} from '../tools/lib/migrate-memory.js';

const FIXTURE = join(ROOT, 'tests', 'fixtures', 'decisions-evict', 'DECISIONS.md');
const BOUNDARY = '2026-03-01'; // fixture's synthetic current-milestone open date

async function loadFixture() {
  return readFile(FIXTURE, 'utf-8');
}

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
    expect(sections[0].raw).toContain('Establish the alpha baseline (D-A-1).');
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
