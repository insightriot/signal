// Tests for deriveStatus / epicOf / checkEvents (M6.E13.S1.t1.3).
// See .planning/M6.E13-PLAN.md Decision 3 (the transition table), Decision 2 (`edited`,
// D-M6E13-19), Decision 4 (Epic derived) and .planning/M6.E13-VALIDATION.md rows AC1.3–AC1.5.
//
// The matrix below is written out by hand from the PLAN's table. It is NOT generated from
// the module's own table: a matrix derived from the code under test would prove nothing.

import { describe, it, expect } from 'vitest';

import { deriveStatus, epicOf, checkEvents, validateRecord } from '../plugin/tools/lib/work-record.js';
import { WorkStoreError } from '../plugin/tools/lib/work-errors.js';

const AT = '2026-10-04T10:00:00.000Z';
const SHA = '0123abc';
const by = 'claude';

const E = {
  created: { type: 'created', at: AT, by },
  triaged: { type: 'triaged', at: AT, by },
  queued: { type: 'queued', at: AT, by, epic: 'M6.E13' },
  started: { type: 'started', at: AT, by, epic: 'M6.E13' },
  close_requested: { type: 'close_requested', at: AT, by, reason: 'fixed', proof: SHA },
  closed_confirm: { type: 'closed', at: AT, by, reason: 'fixed', proof: SHA },
  closed_stale: { type: 'closed', at: AT, by, reason: 'stale', proof: 'gone' },
  closed_wontdo: { type: 'closed', at: AT, by, reason: 'wontdo', proof: 'not worth it' },
  closed_rejected: { type: 'closed', at: AT, by, reason: 'rejected', proof: 'checked, false' },
  closed_dup: { type: 'closed', at: AT, by, reason: 'dup', proof: 'same', dup_of: 'SIG-7' },
  closed_legacy: { type: 'closed', at: '2026-08-01', by: 'migration', reason: 'fixed', proof: 'DONE', legacy: true },
  reopened: { type: 'reopened', at: AT, by: 'brett', reason: 'came back' },
  edited: { type: 'edited', at: AT, by, changes: { theme: { from: null, to: 'x' } } },
};

// A prefix that reaches each state legally.
const PREFIX = {
  N: [E.created],
  T: [E.created, E.triaged],
  Q: [E.created, E.triaged, E.queued],
  P: [E.created, E.triaged, E.started],
  closing: [E.created, E.close_requested],
  C: [E.created, E.closed_wontdo],
};

function rec(events, over = {}) {
  // Item type Q on purpose: the status letter Q and the item type Q must never be compared.
  return { id: 'SIG-42', type: 'Q', title: 'A thing', theme: 'x', events, ...over };
}

// x = illegal. Hand-written from PLAN Decision 3.
const x = null;
const MATRIX = {
  //                  N          T          Q          P          closing    C
  created:         [x,         x,         x,         x,         x,         x],
  triaged:         ['T',       x,         'T',       'T',       x,         x],
  queued:          [x,         'Q',       'Q',       'Q',       x,         x],
  started:         [x,         'P',       'P',       x,         x,         x],
  close_requested: ['closing', 'closing', 'closing', 'closing', x,         x],
  closed_confirm:  [x,         x,         x,         x,         'C',       x],
  closed_stale:    ['C',       'C',       'C',       'C',       'C',       x],
  closed_wontdo:   ['C',       'C',       'C',       'C',       'C',       x],
  closed_rejected: ['C',       'C',       'C',       'C',       'C',       x],
  closed_dup:      ['C',       'C',       'C',       'C',       'C',       x],
  closed_legacy:   ['C',       'C',       'C',       'C',       'C',       x],
  reopened:        [x,         x,         x,         x,         'T',       'T'],
  edited:          ['N',       'T',       'Q',       'P',       'closing', 'C'],
};
const STATES = ['N', 'T', 'Q', 'P', 'closing', 'C'];

describe('every prefix reaches its state', () => {
  for (const s of STATES) {
    it(`prefix for ${s}`, () => {
      const r = rec(PREFIX[s]);
      expect(validateRecord(r)).toEqual([]);
      expect(checkEvents(r)).toEqual([]);
      expect(deriveStatus(r)).toBe(s);
    });
  }
});

describe('transition matrix (AC1.3): every (state, event) pair', () => {
  for (const [event, row] of Object.entries(MATRIX)) {
    STATES.forEach((from, col) => {
      const to = row[col];
      const events = [...PREFIX[from], E[event]];
      const index = events.length - 1;
      if (to === null) {
        it(`${event} from ${from} is illegal, reported at index ${index}`, () => {
          const r = rec(events);
          const errs = checkEvents(r);
          expect(errs).toHaveLength(1);
          expect(errs[0].index).toBe(index);
          expect(typeof errs[0].message).toBe('string');
          expect(() => deriveStatus(r)).toThrow(WorkStoreError);
        });
      } else {
        it(`${event} from ${from} → ${to}`, () => {
          const r = rec(events);
          expect(validateRecord(r)).toEqual([]);
          expect(checkEvents(r)).toEqual([]);
          expect(deriveStatus(r)).toBe(to);
        });
      }
    });
  }
});

describe('sequence rules beyond the matrix', () => {
  it('the first event must be created', () => {
    expect(checkEvents(rec([E.triaged]))).toEqual([{ index: 0, message: expect.stringMatching(/created/) }]);
    expect(checkEvents(rec([E.edited]))).toHaveLength(1);
  });

  it('an empty event list is an error', () => {
    expect(checkEvents(rec([]))).toHaveLength(1);
    expect(() => deriveStatus(rec([]))).toThrow(WorkStoreError);
  });

  it('a confirm must copy the outstanding request\'s proof', () => {
    const r = rec([E.created, E.close_requested, { ...E.closed_confirm, proof: 'fffffff' }]);
    expect(checkEvents(r).map((e) => e.index)).toEqual([2]);
  });

  it('after an illegal event, folding continues from the last legal state', () => {
    const r = rec([E.created, E.started, E.triaged, E.queued]);
    expect(checkEvents(r).map((e) => e.index)).toEqual([1]);
  });

  it('every illegal event is reported, not just the first', () => {
    const r = rec([E.created, E.started, E.reopened, E.created]);
    expect(checkEvents(r).map((e) => e.index)).toEqual([1, 2, 3]);
  });

  it('a long legal history folds: request, wontdo-close from closing, reopen, re-close via confirm', () => {
    const r = rec([
      E.created,
      E.triaged,
      E.queued,
      E.started,
      E.close_requested,
      E.reopened,
      E.started,
      E.close_requested,
      E.closed_confirm,
      E.reopened,
      E.closed_dup,
    ]);
    expect(checkEvents(r)).toEqual([]);
    expect(deriveStatus(r)).toBe('C');
  });

  it('item type Q does not affect status', () => {
    for (const type of ['NEW', 'BUG', 'FEAT', 'CHORE', 'Q']) {
      expect(deriveStatus(rec(PREFIX.T, { type }))).toBe('T');
      expect(deriveStatus(rec(PREFIX.Q, { type }))).toBe('Q');
    }
  });
});

describe('epicOf (AC1.5, Decision 4)', () => {
  it('no Epic until queued or started', () => {
    expect(epicOf(rec(PREFIX.N))).toBeNull();
    expect(epicOf(rec(PREFIX.T))).toBeNull();
  });

  it('queued and started set it; the latest wins', () => {
    expect(epicOf(rec(PREFIX.Q))).toBe('M6.E13');
    expect(epicOf(rec(PREFIX.P))).toBe('M6.E13');
    expect(epicOf(rec([...PREFIX.Q, { ...E.started, epic: 'M6.E14' }]))).toBe('M6.E14');
  });

  it('triaged and reopened clear it', () => {
    expect(epicOf(rec([...PREFIX.Q, E.triaged]))).toBeNull();
    expect(epicOf(rec([...PREFIX.P, E.close_requested, E.reopened]))).toBeNull();
  });

  it('close_requested, closed and edited keep it', () => {
    expect(epicOf(rec([...PREFIX.P, E.close_requested]))).toBe('M6.E13');
    expect(epicOf(rec([...PREFIX.P, E.close_requested, E.closed_confirm]))).toBe('M6.E13');
    expect(epicOf(rec([...PREFIX.Q, E.closed_legacy]))).toBe('M6.E13');
    expect(epicOf(rec([...PREFIX.Q, E.edited]))).toBe('M6.E13');
  });

  it('throws on an illegal sequence rather than guessing', () => {
    expect(() => epicOf(rec([E.created, E.started]))).toThrow(WorkStoreError);
  });
});

describe('edited consistency (Decision 2, D-M6E13-19)', () => {
  const edit = (changes) => ({ type: 'edited', at: AT, by, changes });

  it('the current value must equal the last `to`', () => {
    const r = rec([E.created, edit({ title: { from: 'A', to: 'B' } })], { title: 'A' });
    expect(checkEvents(r)).toEqual([{ index: 1, message: expect.stringMatching(/title/) }]);
  });

  it('only the last edit of a field counts, reported at its index', () => {
    const ok = rec([E.created, edit({ title: { from: 'A', to: 'B' } }), edit({ title: { from: 'B', to: 'C' } })], {
      title: 'C',
    });
    expect(checkEvents(ok)).toEqual([]);
    const bad = rec([E.created, edit({ title: { from: 'A', to: 'C' } }), edit({ title: { from: 'C', to: 'B' } })], {
      title: 'C',
    });
    expect(checkEvents(bad).map((e) => e.index)).toEqual([2]);
  });

  it('`to: null` means the field is unset', () => {
    const r = rec([E.created, edit({ theme: { from: 'x', to: null } })]);
    expect(checkEvents(r)).toHaveLength(1);
    const { theme: _t, ...noTheme } = r;
    expect(checkEvents(noTheme)).toEqual([]);
  });

  it('numbers compare by value; a field with no edit needs no history', () => {
    const r = rec([E.created, edit({ priority: { from: null, to: 2 } })], { priority: 2 });
    expect(checkEvents(r)).toEqual([]);
  });

  it('an edit inconsistency does not change status (deriveStatus still answers)', () => {
    const r = rec([E.created, edit({ title: { from: 'A', to: 'B' } })], { title: 'A' });
    expect(deriveStatus(r)).toBe('N');
  });
});

describe('a history that does not start with created', () => {
  it('is one error at index 0, not one per event', () => {
    expect(checkEvents(rec([E.triaged, E.created, E.queued]))).toEqual([{ index: 0, message: expect.any(String) }]);
  });
});
