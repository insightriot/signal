import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canProceedUnattended,
  resolveFloors,
  floorsFor,
  FLOORS,
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
    // Vitest runs with cwd = the Signal repo, whose inbox has no drain
    // candidates — so the drainable fixture reported "dormant" and the proof
    // silently passed against the wrong file.
    const fromFixture = await resolveFloors('PLAN', drainable);
    const fromRepo = await resolveFloors('PLAN', REPO);
    expect(fromFixture.live.length).toBeGreaterThan(0);
    expect(fromRepo.live).toEqual([]);
  });
});

describe('M6.E10 FR2 — SHIP is unconditional and must stay that way', () => {
  it('both SHIP floors are LIVE regardless of project state', async () => {
    for (const dir of [drainable, emptyInbox, REPO, join(tmpdir(), 'sig-nothing-here')]) {
      const { live, dormant, cannotCheck } = await resolveFloors('SHIP', dir);
      expect(live.map((f) => f.id).sort()).toEqual(['ship-pr', 'ship-retro']);
      expect(dormant).toEqual([]);
      expect(cannotCheck).toEqual([]);
    }
  });

  it('SHIP floors are marked `always` in the table, so no condition can be wired to them', () => {
    for (const f of floorsFor('SHIP')) expect(f.always).toBe(true);
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

describe('M6.E10 — resolveFloors fails closed', () => {
  it('a floor with neither `always` nor a condition is treated as LIVE and reported', () => {
    // Guards the shape rather than mutating the frozen table: every floor must
    // be classifiable, or resolveFloors will keep it live and say it could not
    // tell. An unclassified floor must never silently become dormant.
    for (const f of FLOORS) {
      const classified = f.always === true || ['plan-drain-preview', 'plan-drain-destructive'].includes(f.id);
      expect(classified).toBe(true);
    }
  });

  it('every floor carries a `why` a halt can print', () => {
    for (const f of FLOORS) expect(typeof f.why === 'string' && f.why.length > 20).toBe(true);
  });
});
