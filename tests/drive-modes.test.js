import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canProceedUnattended,
  resolveFloors,
  floorsFor,
  FLOORS,
  FLOOR_CONDITIONS,
  CANONICAL_PHASES,
} from '../plugin/tools/lib/drive.js';

const REPO = join(import.meta.dirname, '..');
const LOOP_OK = { atCeiling: false, count: 1, ceiling: 3 };
const profile = (attention) => ({ tier: 'FULL', rigor_overrides: { attention } });

let drainable;
let emptyInbox;

beforeAll(() => {
  drainable = mkdtempSync(join(tmpdir(), 'sig-drain-'));
  mkdirSync(join(drainable, '.planning'), { recursive: true });
  writeFileSync(
    join(drainable, '.planning', 'ISSUES-INBOX.md'),
    '# Inbox\n\n## An undrained idea\n\n**Status:** Logged 2026-09-10 via `/sig:add`.\n\nBody.\n\n---\n'
  );
  emptyInbox = mkdtempSync(join(tmpdir(), 'sig-empty-'));
  mkdirSync(join(emptyInbox, '.planning'), { recursive: true });
  writeFileSync(join(emptyInbox, '.planning', 'ISSUES-INBOX.md'), '# Inbox\n\nNothing here.\n');
});

afterAll(() => {
  for (const d of [drainable, emptyInbox]) rmSync(d, { recursive: true, force: true });
});

// The trace, as an assertion (FR8). Nothing checked whether `proceed` was ever
// TRUE, which is how a loop that could not take a single step shipped and stayed
// shipped. On this repository's own PROFILE.md (`attention: checkpointed`) every
// phase returned stop.
describe('M6.E10 FR8 — the loop can actually advance', () => {
  const traceFor = async (attention, baseDir) => {
    const out = {};
    for (const phase of CANONICAL_PHASES) {
      const { live } = await resolveFloors(phase, baseDir);
      const r = canProceedUnattended(phase, profile(attention), {
        hasFloor: live.length > 0,
        loopStatus: LOOP_OK,
      });
      out[phase] = r.proceed ? 'GO' : r.reason;
    }
    return out;
  };

  it('`checkpointed` advances every phase except SHIP — it used to stop at ALL of them', async () => {
    const t = await traceFor('checkpointed', emptyInbox);
    expect(t.DISCUSS).toBe('GO');
    expect(t.PLAN).toBe('GO');
    expect(t.EXECUTE).toBe('GO');
    expect(t.VERIFY).toBe('GO');
    expect(t.REVIEW).toBe('GO');
    expect(t.SHIP).toBe('floor');
  });

  it('`unattended` advances every phase except SHIP', async () => {
    const t = await traceFor('unattended', emptyInbox);
    expect(Object.entries(t).filter(([, v]) => v !== 'GO')).toEqual([['SHIP', 'floor']]);
  });

  it('`attended` stops everywhere — the mode that means "step me through it"', async () => {
    const t = await traceFor('attended', emptyInbox);
    expect(Object.values(t).every((v) => v !== 'GO')).toBe(true);
  });

  it('at least one mode reaches REVIEW without stopping — the assertion that was missing', async () => {
    const t = await traceFor('checkpointed', emptyInbox);
    const upToReview = CANONICAL_PHASES.slice(
      CANONICAL_PHASES.indexOf('DISCUSS'),
      CANONICAL_PHASES.indexOf('SHIP')
    );
    expect(upToReview.filter((p) => t[p] !== 'GO')).toEqual([]);
  });
});

describe('M6.E10 FR1 — a floor fires on its condition, not on the phase name', () => {
  it('PLAN drain floors are LIVE when the inbox holds drainable entries', async () => {
    const { live, dormant } = await resolveFloors('PLAN', drainable);
    expect(live.map((f) => f.id).sort()).toEqual(['plan-drain-destructive', 'plan-drain-preview']);
    expect(dormant).toEqual([]);
  });

  it('PLAN drain floors are DORMANT when the inbox has nothing to drain', async () => {
    const { live, dormant } = await resolveFloors('PLAN', emptyInbox);
    expect(live).toEqual([]);
    expect(dormant.map((f) => f.id).sort()).toEqual(['plan-drain-destructive', 'plan-drain-preview']);
  });

  it('PLAN drain floors are DORMANT when there is no inbox file at all', async () => {
    const { live } = await resolveFloors('PLAN', join(tmpdir(), 'sig-no-such-project-xyz'));
    expect(live).toEqual([]);
  });

  it('reads the inbox under baseDir, not under the process cwd', async () => {
    // The bug this pins: resolveInboxPath returns a REPO-RELATIVE path, so an
    // unjoined existsSync read whatever inbox sat under the working directory.
    // Vitest runs with cwd = the Signal repo, so a broken read silently answers
    // from THIS repo's inbox instead of the fixture's.
    //
    // ⚠ Deliberately does NOT assert anything about Signal's own inbox. An
    // earlier version asserted `resolveFloors('PLAN', REPO).live === []`, which
    // is a claim about live project state — the next `/sig:add` that leaves one
    // undrained entry would turn it red for a reason unrelated to this code.
    // The fixtures carry the whole assertion instead.
    const fromDrainable = await resolveFloors('PLAN', drainable);
    const fromEmpty = await resolveFloors('PLAN', emptyInbox);
    expect(fromDrainable.live.length).toBeGreaterThan(0);
    expect(fromEmpty.live).toEqual([]);
  });
});

describe('M6.E10 FR2 — SHIP is unconditional and must stay that way', () => {
  it('both SHIP floors are LIVE, and resolveFloors never even reads baseDir for them', async () => {
    // `always: true` short-circuits before any condition runs, so these calls
    // are identical by construction — including with baseDir undefined, which is
    // the point: no project state can make a SHIP floor dormant.
    for (const dir of [drainable, emptyInbox, REPO, undefined]) {
      const { live, dormant, cannotCheck } = await resolveFloors('SHIP', dir);
      expect(live.map((f) => f.id).sort()).toEqual(['ship-pr', 'ship-retro']);
      expect(dormant).toEqual([]);
      expect(cannotCheck).toEqual([]);
    }
  });

  it('SHIP floors are marked `always` in the table, so no condition can be wired to them', () => {
    for (const f of floorsFor('SHIP')) expect(f.always).toBe(true);
  });

  it('an `always` floor is NOT falsifiable by a caller passing hasFloor:false', () => {
    // The invariant, not the composition. `hasFloor` is nullish-coalesced, so an
    // explicit `false` REPLACES the static fallback — and `always` was read only
    // inside resolveFloors, which this function never calls. A caller passing
    // false at SHIP proceeded past the PR and no-bypass-retro floors: the two
    // gates FR2 exists to protect, defeated by the parameter FR1 introduced.
    // The old FR2 test derived hasFloor from resolveFloors first, so it asserted
    // the happy path and never this. Found by the fresh-context security auditor.
    for (const att of ['attended', 'checkpointed', 'unattended']) {
      const r = canProceedUnattended('SHIP', profile(att), {
        hasFloor: false,
        loopStatus: LOOP_OK,
      });
      expect(r.proceed, `attention=${att}`).toBe(false);
      expect(r.reason).toBe('floor');
    }
  });

  it('a phase with no `always` floor still honours hasFloor:false', () => {
    // The other direction — the hardening must not re-freeze every phase.
    const r = canProceedUnattended('PLAN', profile('unattended'), {
      hasFloor: false,
      loopStatus: LOOP_OK,
    });
    expect(r.proceed).toBe(true);
  });

  it('an unknown phase fails CLOSED', () => {
    // Used to be covered by accident: checkpointed stopped on everything, so a
    // junk phase stopped too. Widening it removed that cover, and readState does
    // not validate the value it reads — `EXPLORING` has been seen in the wild.
    for (const phase of ['BANANA', '', 'ship', null]) {
      const r = canProceedUnattended(phase, profile('unattended'), { loopStatus: LOOP_OK });
      expect(r.proceed, `phase=${phase}`).toBe(false);
      expect(r.reason).toBe('unknown-phase');
    }
  });

  it('a condition returning a falsy NON-boolean fails closed, not dormant', async () => {
    const { cannotCheck, live } = await resolveFloors('PLAN', emptyInbox, {
      conditions: {
        'plan-drain-preview': () => undefined,
        'plan-drain-destructive': () => false,
      },
    });
    expect(live.map((f) => f.id)).toEqual(['plan-drain-preview']);
    expect(cannotCheck[0].reason).toMatch(/not a boolean/);
  });

  it('the floor condition uses the SAME drain parser /sig:plan uses', async () => {
    // ⚠ THIS TEST WAS VACUOUS ON ITS FIRST WRITING and the proof caught it. The
    // original fixture put a live entry ABOVE the unclosed fence too, so both
    // parsers returned a non-zero count and `live.length > 0` held either way —
    // reverting to the bare parser produced ZERO red.
    //
    // The fixture has to make the bare parser return exactly 0: the only live
    // entry sits BELOW a dangling fence. Measured on this fixture — bare: 0,
    // withRecovery: 1. `/sig:plan` § 1b calls the recovery form, so a driver
    // using the bare one declares both drain floors dormant and advances into a
    // PLAN whose drain has real work to preview and confirm-delete.
    const d = mkdtempSync(join(tmpdir(), 'sig-fence-'));
    mkdirSync(join(d, '.planning'), { recursive: true });
    writeFileSync(
      join(d, '.planning', 'ISSUES-INBOX.md'),
      '# Inbox\n\n```js\nunclosed fence\n\n## The only live idea, below the fence\n\n**Status:** Logged 2026-09-10.\n\nBody.\n'
    );
    const { live } = await resolveFloors('PLAN', d);
    expect(live.map((f) => f.id).sort()).toEqual(['plan-drain-destructive', 'plan-drain-preview']);
    rmSync(d, { recursive: true, force: true });
  });

  it('no mode can proceed at SHIP', async () => {
    const { live } = await resolveFloors('SHIP', REPO);
    for (const att of ['attended', 'checkpointed', 'unattended']) {
      const r = canProceedUnattended('SHIP', profile(att), {
        hasFloor: live.length > 0,
        loopStatus: LOOP_OK,
      });
      expect(r.proceed).toBe(false);
      expect(r.reason).toBe('floor');
    }
  });
});

describe('M6.E10 — resolveFloors fails CLOSED (branches, not shape)', () => {
  // ⚠ THESE REPLACE A COVERAGE LIE. The first version of this block never called
  // resolveFloors — it iterated FLOORS and compared ids against a hand-typed
  // literal. The fresh-context test-engineer proved it: flipping BOTH fail-closed
  // branches to fail-OPEN (dormant, no cannotCheck) left the whole suite green,
  // so the behaviour `drive.md` advertises to users had zero coverage. The fix
  // was to make the branches reachable — `conditions` is injectable — rather
  // than to assert harder about a shape.

  it('a condition that THROWS yields a LIVE floor and names itself in cannotCheck', async () => {
    const boom = {
      'plan-drain-preview': () => {
        throw new Error('inbox unreadable');
      },
      'plan-drain-destructive': () => {
        throw new Error('inbox unreadable');
      },
    };
    const { live, dormant, cannotCheck } = await resolveFloors('PLAN', emptyInbox, {
      conditions: boom,
    });
    expect(live.map((f) => f.id).sort()).toEqual(['plan-drain-destructive', 'plan-drain-preview']);
    expect(dormant).toEqual([]);
    expect(cannotCheck.map((c) => c.reason)).toEqual(['inbox unreadable', 'inbox unreadable']);
  });

  it('a floor nobody classified yields a LIVE floor and says it could not tell', async () => {
    const { live, dormant, cannotCheck } = await resolveFloors('PLAN', emptyInbox, {
      conditions: {},
    });
    expect(live.map((f) => f.id).sort()).toEqual(['plan-drain-destructive', 'plan-drain-preview']);
    expect(dormant).toEqual([]);
    expect(cannotCheck).toHaveLength(2);
    for (const c of cannotCheck) expect(c.reason).toMatch(/no condition defined/);
  });

  it('an async condition that rejects also fails closed', async () => {
    const { live, cannotCheck } = await resolveFloors('PLAN', emptyInbox, {
      conditions: {
        'plan-drain-preview': async () => Promise.reject(new Error('timeout')),
        'plan-drain-destructive': async () => false,
      },
    });
    expect(live.map((f) => f.id)).toEqual(['plan-drain-preview']);
    expect(cannotCheck).toEqual([{ id: 'plan-drain-preview', reason: 'timeout' }]);
  });

  it('the shape guard reads the REAL condition table, not a copy of it', () => {
    // A hand-typed list of ids passes happily after someone deletes an entry
    // from FLOOR_CONDITIONS — a guard drifting from the thing it guards.
    for (const f of FLOORS) {
      expect(f.always === true || Object.hasOwn(FLOOR_CONDITIONS, f.id)).toBe(true);
    }
  });

  it('every floor carries a `why` a halt can print', () => {
    for (const f of FLOORS) expect(typeof f.why === 'string' && f.why.length > 20).toBe(true);
  });
});

describe('M6.E10 — a halt names the floors that are actually live', () => {
  it('prints the live floors, not every floor at the phase', async () => {
    const live = [floorsFor('PLAN')[0]];
    const r = canProceedUnattended('PLAN', profile('unattended'), {
      hasFloor: true,
      liveFloors: live,
      loopStatus: LOOP_OK,
    });
    expect(r.proceed).toBe(false);
    expect(r.floors.map((f) => f.id)).toEqual([live[0].id]);
  });

  it('falls back to every floor at the phase when the caller resolved none', () => {
    const r = canProceedUnattended('PLAN', profile('unattended'), {
      hasFloor: true,
      loopStatus: LOOP_OK,
    });
    expect(r.floors.map((f) => f.id).sort()).toEqual([
      'plan-drain-destructive',
      'plan-drain-preview',
    ]);
  });
});
