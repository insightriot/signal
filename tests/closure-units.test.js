// M6.E16 t6.1 — `resolveClosures`, `resolveUnitClosure` and `isEpicDone` on a
// project with unit records.
//
// With unit records a unit that has a record is closed when its record is
// closed (a held unit IS closed: the hold only stops its files moving), and
// open when its record is open or *closing*. The answer carries
// `source: 'record'`. A unit with no record is read from its files, as before.
// A unit with a record and no file in `.planning/` is listed too: the old
// resolver saw only units that still had a top-level file.

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';

import { resolveClosures, resolveUnitClosure, CLOSURE } from '../plugin/tools/lib/closure.js';
import { isEpicDone } from '../plugin/tools/lib/retrospective.js';
import {
  cleanupUnitProjects, contradiction, HOLD_REASON, PASS, plant, plantBroken, put, retroFor, state, tempProject, unitsOn,
} from './helpers/unit-fixture.js';

afterEach(cleanupUnitProjects);

const byUnit = (res) => Object.fromEntries(res.units.map((u) => [u.unit, u]));

describe('resolveClosures with unit records (t6.1)', () => {
  it('follows the record where the files say the opposite', async () => {
    const off = byUnit(await resolveClosures(contradiction()));
    expect(off['M7.E1'].status).toBe(CLOSURE.CLOSED);
    expect(off['M7.E2'].status).toBe(CLOSURE.OPEN);

    const on = byUnit(await resolveClosures(contradiction({ units: true })));
    expect(on['M7.E1']).toMatchObject({ status: CLOSURE.OPEN, source: 'record' });
    expect(on['M7.E2']).toMatchObject({ status: CLOSURE.CLOSED, source: 'record' });
    expect(on['M7.E3']).toMatchObject({ status: CLOSURE.CLOSED, source: 'record' }); // dropped is closed
  });

  it('without unit records no answer carries a source, a hold or a record reason', async () => {
    const res = await resolveClosures(contradiction());
    for (const u of res.units) expect(Object.keys(u).sort()).toEqual(['evidence', 'reason', 'status', 'unit']);
    expect(res.units.map((u) => u.unit)).toEqual(['M7.E1', 'M7.E2', 'M7.E3']);
  });

  it('lists a unit that has a record and no file in .planning/', async () => {
    const base = tempProject();
    put(base, '.planning/STATE.md', state());
    unitsOn(base);
    plant(base, 'M7.E5', 'legacy');
    plant(base, 'phase-11', 'open');
    const res = await resolveClosures(base);
    expect(byUnit(res)).toMatchObject({
      'M7.E5': { status: CLOSURE.CLOSED, source: 'record' },
      'phase-11': { status: CLOSURE.OPEN, source: 'record' },
    });
    expect(res.counts).toEqual({ closed: 1, open: 1, cannotDetermine: 0 });
  });

  it('a held unit is closed, and says it is held and why', async () => {
    const base = contradiction();
    unitsOn(base);
    plant(base, 'M7.E2', 'held');
    const u = byUnit(await resolveClosures(base))['M7.E2'];
    expect(u).toMatchObject({ status: CLOSURE.CLOSED, source: 'record', held: true, hold_reason: HOLD_REASON });
  });

  it('a closing unit is open: a requested close is not a close', async () => {
    const base = contradiction();
    unitsOn(base);
    plant(base, 'M7.E1', 'closing');
    const u = byUnit(await resolveClosures(base))['M7.E1'];
    expect(u).toMatchObject({ status: CLOSURE.OPEN, source: 'record' });
    expect(u.reason).toMatch(/requested/);
    expect(u.held).toBeUndefined();
  });

  it('a unit with no record is read from its files, with the others read from records', async () => {
    const base = contradiction();
    unitsOn(base);
    plant(base, 'M7.E2', 'closed');
    const on = byUnit(await resolveClosures(base));
    expect(on['M7.E1'].status).toBe(CLOSURE.CLOSED); // its PASS verdict, as before
    expect(on['M7.E1'].source).toBeUndefined();
    expect(on['M7.E3'].status).toBe(CLOSURE.OPEN);
    expect(on['M7.E2'].source).toBe('record');
  });

  it('the current unit is open whatever its record says', async () => {
    const on = byUnit(await resolveClosures(contradiction({ units: true })));
    expect(on['M7.E9'].status).toBe(CLOSURE.OPEN);
    expect(on['M7.E9'].reason).toMatch(/current unit/);
  });

  it('a record that does not read is cannotDetermine for that unit only, and never read from its files', async () => {
    const base = contradiction();
    unitsOn(base);
    plantBroken(base, 'M7.E1'); // its files say closed
    plant(base, 'M7.E2', 'closed');
    const on = byUnit(await resolveClosures(base));
    expect(on['M7.E1']).toMatchObject({ status: CLOSURE.CANNOT_DETERMINE, source: 'record' });
    expect(on['M7.E1'].reason).toMatch(/unit record/);
    expect(on['M7.E2'].status).toBe(CLOSURE.CLOSED);
  });

  it('STATE.md unreadable: every unit is cannotDetermine, record or not, as before', async () => {
    const base = contradiction({ units: true });
    put(base, '.planning/STATE.md', '---\nphase: EXECUTE\n---\n');
    const res = await resolveClosures(base);
    expect(res.stateReadable).toBe(false);
    expect(res.counts.closed).toBe(0);
    expect(res.units.map((u) => u.unit)).toContain('M7.E4');
  });

  it('a units/ folder the library refuses reads as no unit records', async () => {
    const base = contradiction();
    put(base, '.planning/work/units', 'not a folder');
    const res = byUnit(await resolveClosures(base));
    expect(res['M7.E1'].status).toBe(CLOSURE.CLOSED);
  });
});

describe('resolveUnitClosure with unit records (t6.1)', () => {
  const ask = (base, unit, files) => resolveUnitClosure({ unit, files, currentUnitId: 'M7.E9', planningDir: join(base, '.planning') });

  it('asks the record first, and the files when there is none', async () => {
    const off = contradiction();
    expect((await ask(off, 'M7.E1', ['M7.E1-PLAN.md', 'M7.E1-VERIFICATION.md'])).status).toBe(CLOSURE.CLOSED);
    const on = contradiction({ units: true });
    expect(await ask(on, 'M7.E1', ['M7.E1-PLAN.md', 'M7.E1-VERIFICATION.md'])).toMatchObject({ status: CLOSURE.OPEN, source: 'record' });
    expect(await ask(on, 'M7.E2', ['M7.E2-PLAN.md'])).toMatchObject({ status: CLOSURE.CLOSED, source: 'record' });
  });
});

describe('AC6.2 — with an open record, nothing on disk closes the unit (resolveClosures)', () => {
  // One unit, its record open, and ONE thing that used to mean closed.
  const cases = {
    'a filled retrospective': (b) => put(b, '.planning/M7.E1-RETROSPECTIVE.md', retroFor('M7.E1')),
    'a PASS verdict': (b) => put(b, '.planning/M7.E1-VERIFICATION.md', PASS('M7.E1')),
    'a "shipped" milestone row': (b) => put(b, '.planning/MILESTONE-7.md', '# Milestone 7\n\n| Epic | Status |\n|---|---|\n| `M7.E1` | ✅ shipped 2026-09-01 |\n'),
    'a VERIFICATION under archive/': (b) => put(b, '.planning/archive/M7/E1/M7.E1-VERIFICATION.md', PASS('M7.E1')),
  };
  for (const [what, write] of Object.entries(cases)) {
    it(`${what} alone`, async () => {
      const base = tempProject();
      put(base, '.planning/STATE.md', state());
      put(base, '.planning/M7.E1-PLAN.md', '# plan\n');
      write(base);
      unitsOn(base);
      plant(base, 'M7.E1', 'open');
      expect(byUnit(await resolveClosures(base))['M7.E1']).toMatchObject({ status: CLOSURE.OPEN, source: 'record' });
      expect(isEpicDone(base, 'M7.E1').status).toBe('not-done');
    });
  }
});

describe('isEpicDone with unit records (t6.1)', () => {
  it('follows the record where the retrospective says the opposite', () => {
    const off = contradiction();
    expect(isEpicDone(off, 'M7.E1').status).toBe('done');
    expect(isEpicDone(off, 'M7.E2').status).toBe('not-done');
    const on = contradiction({ units: true });
    expect(isEpicDone(on, 'M7.E1').status).toBe('not-done');
    expect(isEpicDone(on, 'M7.E2').status).toBe('done');
    expect(isEpicDone(on, 'M7.E2').reason).toMatch(/unit record/);
  });

  it('held is done; closing is not-done', () => {
    const base = contradiction();
    unitsOn(base);
    plant(base, 'M7.E1', 'held');
    plant(base, 'M7.E2', 'closing');
    expect(isEpicDone(base, 'M7.E1').status).toBe('done');
    expect(isEpicDone(base, 'M7.E2').status).toBe('not-done');
  });

  it('no record: the retrospective decides, with its three answers', () => {
    const base = contradiction();
    unitsOn(base);
    put(base, '.planning/M7.E3-RETROSPECTIVE.md', '# Retro\n\n[FILL IN]\n');
    expect(isEpicDone(base, 'M7.E1')).toEqual({ status: 'done', reason: 'M7.E1 has a complete retrospective' });
    expect(isEpicDone(base, 'M7.E2')).toEqual({ status: 'not-done', reason: 'M7.E2 has no retrospective on disk' });
    expect(isEpicDone(base, 'M7.E3').reason).toMatch(/stub/);
    expect(isEpicDone(base, 'phase-11').status).toBe('cannot-evaluate');
  });

  it('a unit that is not an Epic ID is answered from its record', () => {
    const base = contradiction();
    unitsOn(base);
    plant(base, 'phase-11', 'legacy');
    expect(isEpicDone(base, 'phase-11').status).toBe('done');
  });

  it('a record that does not read is cannot-evaluate, and never throws', () => {
    const base = contradiction();
    unitsOn(base);
    plantBroken(base, 'M7.E1');
    const out = isEpicDone(base, 'M7.E1');
    expect(out.status).toBe('cannot-evaluate');
    expect(out.reason).toMatch(/unit record/);
  });
});
