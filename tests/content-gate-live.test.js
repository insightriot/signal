import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runShipContentGate, formatShipContentGate, GATE } from '../plugin/tools/lib/ship-gate.js';

/**
 * M6.E3 AC5.5 — the content gate fires in the FIX lane as well as the Epic lane.
 *
 * The fix lane never runs /sig:ship: it is a branch, a PR and a green suite. And
 * the fix lane is exactly where stale "still open" rows are produced (`B85`,
 * `B102`, `B103`, `B104` all shipped there — `D-M6E3-5`). So the suite itself runs
 * the gate against this repository, in either lane.
 *
 * ⚠ TODAY THIS CANNOT GO RED ON A REFUSAL. No shipped check emits a refusable
 * receipt — the only two that build receipts are model-judged, and those never
 * refuse (`t3.2` found no code rule precise enough; ship.md §6.7 says the same).
 * This test holds the place for the day a code check does; until then it proves
 * only that the gate runs and is not UNVERIFIED. Said here so nobody reads the
 * green as a guard. (REVIEW finding: the header used to claim CI refuses.)
 *
 * The override is this list. Adding a check id here IS `--accept-stale` for the
 * CI path — and because it is a line in a diff, it is recorded by construction.
 */
const ACCEPT_STALE = [];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('content gate — live, on this repository (both lanes)', () => {
  it('no receipt-backed stale record stands', async () => {
    // modelChecks: [] — no test calls the network (AC8.7), even on a machine
    // with TYPESAFE_API_KEY set. The Jev check is advice and never refuses anyway.
    const r = await runShipContentGate(ROOT, { acceptStale: ACCEPT_STALE, modelChecks: [] });
    expect(r.status, formatShipContentGate(r)).not.toBe(GATE.REFUSE);
    expect(r.status, formatShipContentGate(r)).not.toBe(GATE.UNVERIFIED);
  });
});

describe('ship.md runs the gate on EVERY ship, not only at Epic close (AC5.5)', () => {
  const ship = readFileSync(join(ROOT, 'plugin/commands/ship.md'), 'utf8');

  it('has the content-gate step, naming runShipContentGate', () => {
    expect(ship).toMatch(/^### 6\.7 .*content gate/im);
    expect(ship).toContain('runShipContentGate(');
  });

  it('the step is not scoped to Epic-close SHIPs', () => {
    const heading = ship.split('\n').find((l) => /^### 6\.7 /.test(l));
    expect(heading).not.toMatch(/Epic-close/i);
  });
});
