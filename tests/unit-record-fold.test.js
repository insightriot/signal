// M6.E16.S2.t2.2 — the unit fold (AC1.2, AC4.5, AC5.1).
// See .planning/M6.E16-VALIDATION.md rows AC1.2, AC4.5 and AC5.1.
//
// The matrix below is written out by hand from the task's table. It is NOT
// generated from the module's own table: a matrix derived from the code under
// test would prove nothing.
//
//   status: open | closing | closed, folded from the events
//   held:   a flag beside the status, set by `held` and cleared by `released`
//
// The first event is `opened`, or a `closed` with reason `legacy` or `dropped`
// (a unit the migration records as already over: it has no open event to copy).

import { describe, it, expect } from 'vitest';

import { UNIT_KIND, foldUnit } from '../plugin/tools/lib/unit-record.js';
import { WorkStoreError } from '../plugin/tools/lib/work-errors.js';

const { checkEvents, validateRecord } = UNIT_KIND;

const AT = '2026-10-11T10:00:00.000Z';
const LATER = '2026-10-12T09:30:00.000Z';
const SHA = '0123abc';
const OTHER_SHA = 'fedcba9';
const by = 'claude';

const E = {
  opened: { type: 'opened', at: AT, by },
  close_requested: { type: 'close_requested', at: AT, by, proof: SHA },
  closed_shipped: { type: 'closed', at: LATER, by, reason: 'shipped', proof: SHA, pr: '#301', release: 'v0.1.51' },
  closed_dropped: { type: 'closed', at: LATER, by, reason: 'dropped', words: 'the work moved elsewhere' },
  closed_legacy: { type: 'closed', at: '2026-08-01', by: 'migration', reason: 'legacy' },
  reopened: { type: 'reopened', at: AT, by: 'brett', reason: 'not finished after all' },
  held: { type: 'held', at: AT, by: 'brett', reason: 'its files are still read daily' },
  released: { type: 'released', at: AT, by: 'brett' },
  edited: { type: 'edited', at: AT, by, changes: { title: { from: null, to: 'A unit' } } },
};

// A prefix that reaches each status legally, not held.
const PREFIX = {
  open: [E.opened],
  closing: [E.opened, E.close_requested],
  closed: [E.opened, E.closed_dropped],
};
const STATES = ['open', 'closing', 'closed'];

function rec(events, over = {}) {
  return { id: 'M6.E16', title: 'A unit', events, ...over };
}

// x = illegal. Hand-written.
const x = null;
const MATRIX = {
  //                  open       closing    closed
  opened:          [x,         x,         x],
  close_requested: ['closing', x,         x],
  closed_shipped:  [x,         'closed',  x],
  closed_dropped:  ['closed',  'closed',  x],
  closed_legacy:   ['closed',  'closed',  x],
  reopened:        [x,         'open',    'open'],
  held:            ['open',    'closing', 'closed'],
  edited:          ['open',    'closing', 'closed'],
};

describe('unit fold — the status matrix (AC1.2)', () => {
  for (const [name, row] of Object.entries(MATRIX)) {
    STATES.forEach((from, i) => {
      const expected = row[i];
      const record = rec([...PREFIX[from], E[name]]);
      if (expected === x) {
        it(`${name} from ${from} is illegal: SCHEMA from the fold, one error from checkEvents`, () => {
          expect(validateRecord(record)).toEqual([]);
          let caught;
          try {
            foldUnit(record);
          } catch (err) {
            caught = err;
          }
          expect(caught).toBeInstanceOf(WorkStoreError);
          expect(caught.code).toBe('SCHEMA');
          expect(caught.message).toMatch(/^M6\.E16: cannot derive /);
          const errors = checkEvents(record);
          expect(errors).toHaveLength(1);
          expect(errors[0].index).toBe(PREFIX[from].length);
        });
      } else {
        it(`${name} from ${from} → ${expected}`, () => {
          expect(foldUnit(record).status).toBe(expected);
          expect(checkEvents(record)).toEqual([]);
        });
      }
    });
  }

  it('the matrix covers every event type but released, which the hold matrix covers', () => {
    const covered = new Set(Object.keys(MATRIX).map((k) => k.replace(/^closed_.*/, 'closed')));
    expect([...covered].sort()).toEqual(UNIT_KIND.eventTypes.filter((t) => t !== 'released').sort());
  });
});

describe('unit fold — the first event', () => {
  it('opened → open, nothing else set', () => {
    expect(foldUnit(rec([E.opened]))).toEqual({ status: 'open', held: false, hold_reason: null, close: null, closing_proof: null });
  });

  it('a first event closed as legacy or dropped → closed (a unit recorded as already over)', () => {
    expect(foldUnit(rec([E.closed_legacy]))).toMatchObject({ status: 'closed', close: { reason: 'legacy' } });
    expect(foldUnit(rec([E.closed_dropped]))).toMatchObject({ status: 'closed', close: { reason: 'dropped' } });
    expect(checkEvents(rec([E.closed_legacy]))).toEqual([]);
  });

  it('a first event closed as shipped is illegal: a shipped close confirms a request', () => {
    expect(() => foldUnit(rec([E.closed_shipped]))).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
    expect(checkEvents(rec([E.closed_shipped]))).toHaveLength(1);
  });

  for (const first of ['close_requested', 'reopened', 'held', 'released', 'edited']) {
    it(`${first} first is illegal, reported once however many events follow`, () => {
      const record = rec([E[first], E.held, E.released]);
      expect(() => foldUnit(record)).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
      const errors = checkEvents(record);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatchObject({ index: 0 });
      expect(errors[0].message).toMatch(/first event must be opened, or a closed with reason legacy or dropped/);
    });
  }

  it('no events, or events that is not a list: SCHEMA, not a crash', () => {
    for (const record of [rec([]), { id: 'M6.E16' }, { id: 'M6.E16', events: 'opened' }, null]) {
      expect(() => foldUnit(record)).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
    }
  });

  it('a born-closed unit can be reopened, and then closed through a request', () => {
    const record = rec([E.closed_legacy, E.reopened, E.close_requested, E.closed_shipped]);
    expect(foldUnit(record)).toMatchObject({ status: 'closed', close: { reason: 'shipped', proof: SHA } });
  });
});

describe('unit fold — closing and closed', () => {
  it('closing carries the requested proof; nothing is closed yet', () => {
    expect(foldUnit(rec(PREFIX.closing))).toEqual({ status: 'closing', held: false, hold_reason: null, close: null, closing_proof: SHA });
  });

  it('a shipped close with the request\'s proof closes, and the close is what the event says', () => {
    expect(foldUnit(rec([...PREFIX.closing, E.closed_shipped]))).toEqual({
      status: 'closed',
      held: false,
      hold_reason: null,
      close: { reason: 'shipped', at: LATER, by, proof: SHA, pr: '#301', release: 'v0.1.51' },
      closing_proof: null,
    });
  });

  it('a shipped close with a different proof is illegal, and the message names both', () => {
    const record = rec([...PREFIX.closing, { ...E.closed_shipped, proof: OTHER_SHA }]);
    expect(() => foldUnit(record)).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
    const [error] = checkEvents(record);
    expect(error.index).toBe(2);
    expect(error.message).toContain(SHA);
    expect(error.message).toContain(OTHER_SHA);
  });

  it('a shipped close with no request outstanding is refused for that, not for its proof', () => {
    expect(checkEvents(rec([E.opened, E.closed_shipped]))).toEqual([{ index: 1, message: 'events[1]: closed is not legal from open' }]);
    expect(checkEvents(rec([E.opened, E.closed_dropped, E.closed_shipped]))).toEqual([{ index: 2, message: 'events[2]: closed is not legal from closed' }]);
  });

  it('a shipped close confirms the LATEST request: an earlier request\'s proof does not do', () => {
    const second = { ...E.close_requested, proof: OTHER_SHA };
    const history = [E.opened, E.close_requested, E.reopened, second];
    expect(checkEvents(rec([...history, E.closed_shipped]))).toHaveLength(1);
    expect(foldUnit(rec([...history, { ...E.closed_shipped, proof: OTHER_SHA }])).close.proof).toBe(OTHER_SHA);
  });

  it('a dropped close keeps its words; a legacy close keeps what it carries and no more', () => {
    expect(foldUnit(rec([E.opened, E.closed_dropped])).close).toEqual({ reason: 'dropped', at: LATER, by, words: 'the work moved elsewhere' });
    expect(foldUnit(rec([E.closed_legacy])).close).toEqual({ reason: 'legacy', at: '2026-08-01', by: 'migration' });
  });

  it('a dropped or legacy close from closing discards the request', () => {
    expect(foldUnit(rec([...PREFIX.closing, E.closed_dropped]))).toMatchObject({ status: 'closed', closing_proof: null });
  });

  it('reopened from closed and from closing → open, with the close and the request gone (AC4.5)', () => {
    for (const from of ['closing', 'closed']) {
      expect(foldUnit(rec([...PREFIX[from], E.reopened]))).toEqual({
        status: 'open', held: false, hold_reason: null, close: null, closing_proof: null,
      });
    }
  });

  it('after a reopen the old request cannot be confirmed', () => {
    expect(checkEvents(rec([...PREFIX.closing, E.reopened, E.closed_shipped]))).toHaveLength(1);
  });

  it('closed twice is illegal', () => {
    expect(checkEvents(rec([E.opened, E.closed_dropped, E.closed_legacy]))).toHaveLength(1);
  });
});

describe('unit fold — the hold is a flag beside the status (AC5.1)', () => {
  for (const from of STATES) {
    it(`held from ${from} sets the flag and its reason, and leaves the status`, () => {
      const f = foldUnit(rec([...PREFIX[from], E.held]));
      expect(f).toMatchObject({ status: from, held: true, hold_reason: 'its files are still read daily' });
    });

    it(`released from ${from} when held clears the flag and the reason`, () => {
      const f = foldUnit(rec([...PREFIX[from], E.held, E.released]));
      expect(f).toMatchObject({ status: from, held: false, hold_reason: null });
    });

    it(`released from ${from} when not held is illegal`, () => {
      const record = rec([...PREFIX[from], E.released]);
      expect(() => foldUnit(record)).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
      expect(checkEvents(record)).toEqual([expect.objectContaining({ index: PREFIX[from].length })]);
    });

    it(`held from ${from} when already held is illegal`, () => {
      const record = rec([...PREFIX[from], E.held, E.held]);
      expect(() => foldUnit(record)).toThrow(expect.objectContaining({ code: 'SCHEMA' }));
      expect(checkEvents(record)).toEqual([expect.objectContaining({ index: PREFIX[from].length + 1 })]);
    });
  }

  it('a hold survives every status change: request, close, reopen', () => {
    const history = [E.opened, E.held];
    for (const next of [E.close_requested, E.closed_shipped, E.reopened]) {
      history.push(next);
      expect(foldUnit(rec(history))).toMatchObject({ held: true, hold_reason: 'its files are still read daily' });
    }
    expect(foldUnit(rec(history)).status).toBe('open');
  });

  it('held, released, held again: the reason is the latest hold\'s', () => {
    const again = { ...E.held, reason: 'second reason' };
    expect(foldUnit(rec([E.opened, E.held, E.released, again])).hold_reason).toBe('second reason');
  });

  it('a hold changes nothing about what a status event may follow', () => {
    expect(checkEvents(rec([E.opened, E.held, E.close_requested, E.closed_shipped, E.released]))).toEqual([]);
    expect(checkEvents(rec([E.opened, E.held, E.closed_shipped]))).toHaveLength(1);
  });
});

describe('unit fold — every illegal event is reported, and folding goes on from the last legal state', () => {
  it('two bad events, two errors, in order', () => {
    const record = rec([E.opened, E.closed_shipped, E.close_requested, E.opened, E.closed_shipped]);
    expect(checkEvents(record).map((e) => e.index)).toEqual([1, 3]);
  });
});

describe('unit fold — edited keeps the record and its history agreeing', () => {
  it('an edit whose `to` is the field\'s value is sound; one that is not is an edit error, not a status error', () => {
    expect(checkEvents(rec([E.opened, E.edited]))).toEqual([]);
    const drifted = rec([E.opened, E.edited], { title: 'Changed by hand' });
    expect(foldUnit(drifted).status).toBe('open');
    expect(checkEvents(drifted)).toEqual([
      { index: 1, message: 'events[1]: title was last edited to "A unit" but the record holds "Changed by hand"' },
    ]);
  });

  it('an edit that removes a field (`to: null`) is sound when the field is gone', () => {
    const removed = { ...E.edited, changes: { summary: { from: 'old', to: null } } };
    expect(checkEvents(rec([E.opened, removed]))).toEqual([]);
    expect(checkEvents(rec([E.opened, removed], { summary: 'old' }))).toHaveLength(1);
  });
});
