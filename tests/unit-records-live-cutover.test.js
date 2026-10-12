// M6.E16 VERIFY loop 1 — this repository's own unit records, after the
// cutover (AC8.1, AC8.4). See .planning/M6.E16-VALIDATION.md rows AC8.1, AC8.4.
//
// Read-only, and live: it reads `.planning/work/units/` and the snapshot S0
// took of the milestone tables before any reader changed — a copy of
// `.planning/M6.E16-BASELINE.json` kept as a fixture
// (`tests/fixtures/unit-baseline/`, REVIEW pass 1, T-S6), so that planning
// file can be archived without breaking this test. Nothing here counts the units or says
// which one is open — both move as the repository does. What it pins is what
// the two criteria say about the units that were over before unit records
// existed:
//
//   AC8.1 — every Epic the baseline's tables call shipped has a record closed
//           as `legacy` that carries that row's cells as recorded text;
//   AC8.4 — the four Epic IDs that never ran are closed as `dropped`, with
//           words; `v0.1.6` is closed as `legacy`; and a dropped ID is not
//           handed out again as the next Epic ID.
//
// "Shipped" is the baseline tool's own rule (`tools/unit-baseline.mjs`): the
// row's status cell contains the word, in any case.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getUnit, listUnits } from '../plugin/tools/lib/unit-records.js';
import { deriveNextEpicId } from '../plugin/tools/lib/milestones.js';

const REPO = fileURLToPath(new URL('..', import.meta.url));

const baseline = JSON.parse(readFileSync(join(REPO, 'tests/fixtures/unit-baseline/M6.E16-BASELINE.json'), 'utf-8'));
const SHIPPED_RE = /shipped/i;
const shippedRows = baseline.units.filter((u) => u.milestone_row && SHIPPED_RE.test(u.milestone_row.cells[1]));
const NEVER_RAN = ['M5.E11', 'M5.E12', 'M5.E14', 'M5.E20'];

// The first close a record holds, or null. What these criteria pin is how a
// unit that was over before unit records was RECORDED — not what it reads
// today: reopening one later is allowed, and must not fail this file
// (REVIEW pass 1, T-S7).
const firstClose = (unit) => unit.record.events?.find((e) => e.type === 'closed') ?? null;

// A unit as the record reads, or what stopped it being read.
const read = (id) => {
  try {
    return getUnit(REPO, id);
  } catch (err) {
    return { id, status: `not readable (${err.code})`, close: null, record: {} };
  }
};

describe('AC8.1 — every Epic that shipped before unit records is closed as legacy, carrying its old row', () => {
  it('the baseline names shipped rows, as many as it counted', () => {
    expect(shippedRows.length).toBeGreaterThan(0);
    expect(shippedRows.length).toBe(baseline.counts.shipped_rows);
  });

  it('each shipped row has a record whose first close is a legacy close', () => {
    const wrong = shippedRows
      .map((row) => read(row.id))
      .filter((u) => firstClose(u)?.reason !== 'legacy')
      .map((u) => `${u.id}: ${u.status}; first close ${firstClose(u)?.reason ?? 'none'}`);
    expect(wrong).toEqual([]);
  });

  it('each of those records keeps the old row, cell for cell as the baseline has it', () => {
    for (const row of shippedRows) {
      expect(read(row.id).record.legacy_row, `${row.id}: legacy_row`).toEqual(row.milestone_row.cells);
    }
  });

  it('v0.1.6, a unit that is not an Epic ID, was first closed as legacy', () => {
    expect(firstClose(read('v0.1.6'))).toMatchObject({ reason: 'legacy' });
  });

  it('no unit record is broken', () => {
    expect(listUnits(REPO).broken).toEqual([]);
  });
});

describe('AC8.4 — the Epic IDs that never ran are closed as dropped, and are not handed out again', () => {
  for (const id of NEVER_RAN) {
    it(`${id} was first closed as dropped, with a sentence`, () => {
      const close = firstClose(read(id));
      expect(close).toMatchObject({ reason: 'dropped' });
      expect(close.words).toMatch(/\p{L}{2,}/u);
    });
  }

  // Milestone 5 is closed, so nothing will open `M5.E21` and the literal stays true.
  it('the next Epic ID under milestone 5 is M5.E21: past every dropped one, and no existing unit', async () => {
    const next = await deriveNextEpicId(REPO, { milestone: '5' });
    expect(next).toBe('M5.E21');
    const highestDropped = Math.max(...NEVER_RAN.map((id) => Number(id.split('.E')[1])));
    expect(Number(next.split('.E')[1])).toBeGreaterThan(highestDropped);
    expect(listUnits(REPO).units.map((u) => u.id)).not.toContain(next);
  });
});
