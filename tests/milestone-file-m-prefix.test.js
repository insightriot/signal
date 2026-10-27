// SIG-363 — a milestone file named `MILESTONE-M7.md` is the same milestone as
// `MILESTONE-7.md`.
//
// Found on the test project, which names its files `MILESTONE-M3.0.md`. The
// work-store migration looked for `MILESTONE-3.0.md` only: it said "is not
// there: no Epic table is written", and it read no Epic rows from those files
// as evidence that a unit shipped. Each case here runs the same project twice,
// once per spelling, and expects the same answer.
//
// Temp folders, real git; every name is invented.

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

import { runWorkStoreMigrate } from '../plugin/tools/lib/work-migrate-lists.js';
import { milestoneFileRel } from '../plugin/tools/lib/unit-record.js';
import { MILESTONE, cleanupUnitsStores, commitAll, read, unitsStore } from './helpers/units-store-fixture.js';

afterEach(cleanupUnitsStores);

const PREFIXED = '.planning/MILESTONE-M7.md';

async function project({ prefixed, markers = false }) {
  const base = await unitsStore({ repo: false, markers });
  if (prefixed) renameSync(join(base, MILESTONE), join(base, PREFIXED));
  return base;
}

// The parts of a dry run that depend on the milestone file. A citation names
// the file on disk, so the prefixed name is made the plain one before comparing.
const shape = (dry) => JSON.parse(JSON.stringify({
  units: dry.units,
  proposedUnitCloses: dry.proposedUnitCloses,
  report: Array.isArray(dry.report) ? dry.report.join('\n') : String(dry.report),
}).replaceAll('MILESTONE-M7.md', 'MILESTONE-7.md'));

describe('SIG-363 — MILESTONE-M<n>.md is read like MILESTONE-<n>.md', () => {
  it('milestoneFileRel names the file on disk, and the plain spelling when neither is there', async () => {
    const plain = await project({ prefixed: false });
    const prefixed = await project({ prefixed: true });
    expect(milestoneFileRel(plain, '7')).toBe('.planning/MILESTONE-7.md');
    expect(milestoneFileRel(prefixed, '7')).toBe(PREFIXED);
    expect(milestoneFileRel(prefixed, '8')).toBe('.planning/MILESTONE-8.md');
  });

  for (const markers of [false, true]) {
    it(`the dry run gives the same answer for either spelling (markers: ${markers})`, async () => {
      const a = shape(await runWorkStoreMigrate(await project({ prefixed: false, markers }), { key: 'LEAF' }));
      const b = shape(await runWorkStoreMigrate(await project({ prefixed: true, markers }), { key: 'LEAF' }));
      expect(b.report).not.toMatch(/is not there \(or is not a regular file\): no Epic table is written/);
      expect(b).toEqual(a);
    });
  }

  it('the apply writes the Epic table into MILESTONE-M7.md and creates no MILESTONE-7.md', async () => {
    const base = await unitsStore({ repo: true, markers: true });
    renameSync(join(base, MILESTONE), join(base, PREFIXED));
    commitAll(base, 'rename');
    const dry = await runWorkStoreMigrate(base, { apply: false });
    const out = await runWorkStoreMigrate(base, { apply: true, expectedHash: dry.inputHash, stamp: 'T1', at: '2026-10-12', confirmUnitCloses: true });
    expect(out.applied).toBe(true);
    expect(existsSync(join(base, MILESTONE))).toBe(false);
    expect(read(base, PREFIXED)).toContain('| `M7.E9` | **in flight** | The current one |');
  }, 60_000);
});
