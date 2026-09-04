// M6.E6 S1 — the decision router.
//
// The whole routing policy as one pure function, so it is provable without
// invoking a command. Two axes, OR-composed: a decision queues if it is
// product-altitude OR irreversible, and is adopted only when it is BOTH
// plumbing AND reversible.
//
// The composition is the design. Reversibility alone misses the case that
// matters most in practice — a product decision that is perfectly reversible
// (picking a default tier: trivial to revert, and exactly the call a person
// wants to make).

import { describe, it, expect } from 'vitest';

import {
  routeDecision,
  ROUTE_REVERSIBILITY,
  ROUTE_ALTITUDE,
} from '../plugin/tools/lib/drive.js';

describe('routeDecision — plumbing + reversible is the ONLY adopt case', () => {
  it('AC1.1 — plumbing + trivial/moderate adopts', () => {
    for (const reversibility of ['trivial', 'moderate']) {
      const r = routeDecision({ altitude: 'plumbing', reversibility });
      expect(r.route).toBe('adopt');
      expect(r.missing).toEqual([]);
    }
  });

  it('AC1.2 — plumbing + painful/irreversible queues', () => {
    for (const reversibility of ['painful', 'irreversible']) {
      const r = routeDecision({ altitude: 'plumbing', reversibility });
      expect(r.route).toBe('queue');
      expect(r.why).toMatch(new RegExp(`undoing it is ${reversibility}`));
    }
  });

  it('AC1.3 — product + trivial QUEUES: the case reversibility alone misses', () => {
    // The whole argument for the altitude axis. A perfectly reversible product
    // call — a default tier, a command name — is still a person's to make, and a
    // reversibility-only router would adopt it silently.
    const r = routeDecision({ altitude: 'product', reversibility: 'trivial' });
    expect(r.route).toBe('queue');
    expect(r.why).toMatch(/product-altitude call, which is yours to make/);
    // It queued on altitude ALONE — nothing was missing and it is reversible.
    expect(r.missing).toEqual([]);
    expect(r.why).not.toMatch(/undoing it is/);
  });

  it('every product-altitude decision queues, at every reversibility', () => {
    for (const reversibility of ROUTE_REVERSIBILITY) {
      expect(routeDecision({ altitude: 'product', reversibility }).route).toBe('queue');
    }
  });
});

describe('routeDecision — fail closed on not knowing (D-M6E6-4)', () => {
  it('AC1.4 — no tags at all queues, and names BOTH absent axes', () => {
    const r = routeDecision({});
    expect(r.route).toBe('queue');
    expect(r.missing.sort()).toEqual(['altitude', 'reversibility']);
    expect(r.why).toMatch(/neither axis was tagged/);
  });

  it('AC1.5 — one tag present, one absent queues and names only the absent one', () => {
    const noRev = routeDecision({ altitude: 'plumbing' });
    expect(noRev.route).toBe('queue');
    expect(noRev.missing).toEqual(['reversibility']);
    expect(noRev.why).toMatch(/reversibility was not tagged/);

    const noAlt = routeDecision({ reversibility: 'trivial' });
    expect(noAlt.route).toBe('queue');
    expect(noAlt.missing).toEqual(['altitude']);
    expect(noAlt.why).toMatch(/altitude was not tagged/);
  });

  it('AC1.6 — an unrecognised value queues and never throws', () => {
    const junk = [null, undefined, 42, {}, [], 'sort-of', '', true, NaN, () => {}];
    for (const value of junk) {
      for (const shape of [{ altitude: value, reversibility: 'trivial' },
                           { altitude: 'plumbing', reversibility: value },
                           { altitude: value, reversibility: value }]) {
        const r = routeDecision(shape);
        expect(r.route).toBe('queue');
        expect(r.missing.length).toBeGreaterThan(0);
      }
    }
    // Called with nothing at all — the shape a caller that forgot produces.
    expect(routeDecision().route).toBe('queue');
    expect(routeDecision(undefined).route).toBe('queue');
  });

  it('AC1.7 — why names the deciding axis, and both when both would queue it', () => {
    const both = routeDecision({ altitude: 'product', reversibility: 'irreversible' });
    expect(both.why).toMatch(/product-altitude call/);
    expect(both.why).toMatch(/undoing it is irreversible/);
    // A reader told only half of why their question is parked has been told a
    // half-truth about what to fix.
    expect(both.why).toMatch(/, and /);
  });
});

describe('routeDecision — vocabulary is shared, not copied', () => {
  it('AC1.8 — reversibility IS calibration"s binding, not an equal copy', async () => {
    const profile = await import('../plugin/tools/lib/profile.js');
    // Identity, not equality. A value-equality assertion passes over two copies
    // that agree today, which is precisely the drift being prevented (#230).
    expect(ROUTE_REVERSIBILITY).toBe(profile.CALIBRATION_ENUMS.reversibility);
  });

  it('altitude is binary — a scale would invite a judgement call at every ask', () => {
    expect([...ROUTE_ALTITUDE].sort()).toEqual(['plumbing', 'product']);
  });

  it('every reversibility term routes to something, so a new term cannot be silently ignored', () => {
    for (const reversibility of ROUTE_REVERSIBILITY) {
      const r = routeDecision({ altitude: 'plumbing', reversibility });
      expect(['adopt', 'queue']).toContain(r.route);
      expect(r.missing).toEqual([]); // it was recognised
    }
  });
});
