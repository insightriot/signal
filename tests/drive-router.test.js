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

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  routeDecision,
  ROUTE_REVERSIBILITY,
  ROUTE_ALTITUDE,
  queueDecision,
  readQueue,
  formatAnsweredForward,
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

// ── S2/S3: the wiring ────────────────────────────────────────────────────────

describe('queueDecision + formatQueuedDecision carry the routing (S2)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-queue-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('AC2.1 — an entry carries altitude, reversibility, route reason and recommendation', async () => {
    await queueDecision(dir, {
      id: 'Q1', phase: 'PLAN', question: 'Which cache?', recommendation: 'Redis',
      altitude: 'product', reversibility: 'trivial', date: '2026-09-04',
    });
    const content = await readFile(join(dir, '.planning', 'DECISION-QUEUE.md'), 'utf-8');
    expect(content).toMatch(/\*\*Altitude:\*\* product/);
    expect(content).toMatch(/\*\*Reversibility:\*\* trivial/);
    expect(content).toMatch(/\*\*Recommendation:\*\* Redis/);
    expect(content).toMatch(/product-altitude call, which is yours to make/);
  });

  it('AC2.2 — the missing-recommendation defect notice survives the new fields', async () => {
    await queueDecision(dir, {
      id: 'Q2', phase: 'PLAN', question: 'No rec?',
      altitude: 'plumbing', reversibility: 'painful', date: '2026-09-04',
    });
    const content = await readFile(join(dir, '.planning', 'DECISION-QUEUE.md'), 'utf-8');
    expect(content).toMatch(/No recommendation was supplied\. That is a defect/);
  });

  it('AC2.3 — the entry states which axis queued it, in the router"s words', async () => {
    await queueDecision(dir, {
      id: 'Q3', phase: 'VERIFY', question: 'Drop the column?', recommendation: 'no',
      altitude: 'plumbing', reversibility: 'irreversible', date: '2026-09-04',
    });
    const content = await readFile(join(dir, '.planning', 'DECISION-QUEUE.md'), 'utf-8');
    const expected = routeDecision({ altitude: 'plumbing', reversibility: 'irreversible' }).why;
    expect(content).toContain(expected);
  });

  it('an UNTAGGED axis renders as `untagged`, never omitted', async () => {
    // A missing row would look like a decision nobody had to tag, and the
    // fail-closed default exists precisely because that is the case worth seeing.
    await queueDecision(dir, {
      id: 'Q4', phase: 'PLAN', question: 'Untagged?', recommendation: 'x',
      altitude: 'plumbing', date: '2026-09-04',
    });
    const content = await readFile(join(dir, '.planning', 'DECISION-QUEUE.md'), 'utf-8');
    expect(content).toMatch(/\*\*Reversibility:\*\* untagged/);
    expect(content).toMatch(/reversibility was not tagged/);
  });

  it('AC2.4 — readQueue round-trips an entry written with the new fields', async () => {
    await queueDecision(dir, {
      id: 'Q5', phase: 'PLAN', question: 'Round trip?', recommendation: 'yes',
      altitude: 'product', reversibility: 'moderate', date: '2026-09-04',
    });
    const queue = await readQueue(dir);
    expect(queue.entries).toHaveLength(1);
    expect(queue.entries[0]).toMatchObject({ id: 'Q5', question: 'Round trip?', answered: false });
    expect(queue.unanswered).toBe(1);
  });
});

describe('formatAnsweredForward — surfaced, never applied (S3)', () => {
  it('AC3.1 — reports answered entries separately', () => {
    const out = formatAnsweredForward({
      entries: [
        { id: 'Q1', question: 'Which cache?', answered: true },
        { id: 'Q2', question: 'Still open?', answered: false },
      ],
    });
    expect(out).toMatch(/1 decision\(s\) you answered/);
    expect(out).toMatch(/Q1 — Which cache\?/);
    expect(out).not.toMatch(/Q2/);
  });

  it('AC3.2 — an all-answered queue renders the set, not silence', () => {
    const out = formatAnsweredForward({
      entries: [{ id: 'Q1', question: 'Done?', answered: true }],
    });
    expect(out).toBeTruthy();
    expect(out).toMatch(/Q1/);
  });

  it('AC3.4 — a never-used queue renders nothing, not "0 of 0"', () => {
    // 0-of-0 implies a run happened. Silence is the honest render.
    expect(formatAnsweredForward({ entries: [] })).toBeNull();
    expect(formatAnsweredForward({})).toBeNull();
    expect(formatAnsweredForward(null)).toBeNull();
  });

  it('says the answers are not applied automatically', () => {
    const out = formatAnsweredForward({ entries: [{ id: 'Q1', question: 'x', answered: true }] });
    expect(out).toMatch(/not applied automatically/);
  });
});

describe('AC3.3 — the stale "read half only" caveat is gone everywhere', () => {
  it('no shipped file still claims nothing writes to the queue', async () => {
    // Read the tree directly rather than shelling to grep: grep exits 1 when it
    // finds nothing, which is THE PASSING CASE here, so execFileSync throws on
    // success. A check whose green path is an exception is a check that reports
    // the opposite of what it means.
    const { readdir, readFile: rf } = await import('node:fs/promises');
    const offenders = [];
    const walk = async (path) => {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const full = join(path, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (/\.(md|js|json)$/.test(entry.name)) {
          if ((await rf(full, 'utf-8')).includes('read half only')) offenders.push(full);
        }
      }
    };
    await walk('plugin');
    expect(offenders).toEqual([]);
  }, 20000);
});

describe('AC2.6 — queueing never fires at `attended`, and it is a CHECK', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'signal-q26-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const parked = {
    id: 'Q1', phase: 'PLAN', question: 'Default on or off?', recommendation: 'off',
    altitude: 'product', reversibility: 'trivial', date: '2026-09-04',
  };

  it('refuses at attended and writes NO file', async () => {
    // A rule that lives only in drive.md's prose is B75 — this repository's named
    // defect — added by an Epic about reaching unreached mechanisms. So it fails
    // where the situation is.
    const r = await queueDecision(dir, parked, { attention: 'attended' });
    expect(r).toMatchObject({ queued: false, refused: true });
    expect(r.reason).toMatch(/ask this question instead/);
    expect(existsSync(join(dir, '.planning', 'DECISION-QUEUE.md'))).toBe(false);
  });

  it('queues at unattended and checkpointed — what the dial buys', async () => {
    for (const attention of ['unattended', 'checkpointed', undefined]) {
      const d = await mkdtemp(join(tmpdir(), 'signal-q26b-'));
      await mkdir(join(d, '.planning'), { recursive: true });
      const r = await queueDecision(d, parked, { attention });
      expect(r.queued, `attention=${attention}`).toBe(true);
      expect(existsSync(join(d, '.planning', 'DECISION-QUEUE.md'))).toBe(true);
      await rm(d, { recursive: true, force: true });
    }
  });

  it('refuses to file a decision the router would ADOPT', async () => {
    // Without this, a caller that routes to adopt and queues anyway writes an
    // entry reading "Adopted: …" sitting unanswered forever — a decision nobody
    // has to make, indistinguishable from one that is waiting.
    const r = await queueDecision(
      dir, { ...parked, altitude: 'plumbing' }, { attention: 'unattended' },
    );
    expect(r).toMatchObject({ queued: false, refused: true });
    expect(r.reason).toMatch(/Adopt it and continue/);
    expect(existsSync(join(dir, '.planning', 'DECISION-QUEUE.md'))).toBe(false);
  });
});
