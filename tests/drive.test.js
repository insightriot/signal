import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  FLOORS,
  floorsFor,
  canProceedUnattended,
  formatQueuedDecision,
  queueDecision,
  readQueue,
} from '../plugin/tools/lib/drive.js';

const profile = (rigor = {}) => ({
  tier: 'FULL',
  rigor_overrides: { gate_strictness: 'strict', ...rigor },
});

describe('drive — floors that hold regardless of attention', () => {
  it('every floor names WHY it is a floor', () => {
    expect(FLOORS.length).toBeGreaterThan(0);
    for (const f of FLOORS) {
      expect(f.id).toBeTruthy();
      expect(f.why, `floor ${f.id} must justify itself`).toMatch(/.{20,}/);
    }
  });

  it('is frozen — floors are not tunable at runtime', () => {
    expect(Object.isFrozen(FLOORS)).toBe(true);
  });

  // The whole risk of an autonomy layer: that it quietly overrides decisions
  // somebody made deliberately. SHIP must stop even fully unattended.
  it('SHIP stops even at unattended', () => {
    const r = canProceedUnattended('SHIP', profile({ attention: 'unattended' }));
    expect(r.proceed).toBe(false);
    expect(r.reason).toBe('floor');
    expect(r.floors.map((f) => f.id)).toContain('ship-pr');
  });

  it('PLAN stops even at unattended (drain writes are previewed)', () => {
    const r = canProceedUnattended('PLAN', profile({ attention: 'unattended' }));
    expect(r.proceed).toBe(false);
    expect(r.floors.map((f) => f.id)).toContain('plan-drain-preview');
  });

  it('a floorless phase proceeds at unattended', () => {
    const r = canProceedUnattended('EXECUTE', profile({ attention: 'unattended' }));
    expect(r.proceed).toBe(true);
  });

  it('attended never proceeds, even with no floor', () => {
    expect(canProceedUnattended('EXECUTE', profile({ attention: 'attended' })).proceed).toBe(false);
  });

  it('checkpointed stops at the phase boundary, naming it as such', () => {
    const r = canProceedUnattended('EXECUTE', profile({ attention: 'checkpointed' }));
    expect(r.proceed).toBe(false);
    expect(r.reason).toBe('phase-boundary');
  });

  // Fail CLOSED. A detector that cannot look should say so; an actor that cannot
  // tell should stop. Opposite posture to B39, on purpose.
  it('an unreadable profile never proceeds unattended', () => {
    expect(canProceedUnattended('EXECUTE', null).proceed).toBe(false);
    expect(canProceedUnattended('EXECUTE', {}).proceed).toBe(false);
    expect(canProceedUnattended('EXECUTE', { rigor_overrides: {} }).proceed).toBe(false);
  });

  it('floorsFor is exhaustive for the phases that declare floors', () => {
    expect(floorsFor('SHIP').length).toBe(2);
    expect(floorsFor('VERIFY').length).toBe(0);
  });
});

describe('drive — the decision queue', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-drive-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('a queued decision carries its recommendation', () => {
    const out = formatQueuedDecision({
      id: 'Q1', phase: 'DISCUSS', question: 'Which store?',
      recommendation: 'Postgres', why: 'reversible', date: '2026-08-20',
    });
    expect(out).toContain('Q1 — Which store?');
    expect(out).toContain('Postgres');
    expect(out).toContain('_(unanswered)_');
  });

  // Signal already mandates a recommendation on every gray-area ask. A queued
  // decision without one is a caller bug and must not render as "no opinion".
  it('a missing recommendation is called out, not rendered blank', () => {
    const out = formatQueuedDecision({ id: 'Q2', question: 'Which store?' });
    expect(out).toMatch(/defect in whatever queued this/);
  });

  it('refuses to format a decision with no question', () => {
    expect(() => formatQueuedDecision({ id: 'Q3' })).toThrow();
  });

  it('queues, re-reads, and counts unanswered', async () => {
    await queueDecision(dir, { id: 'Q1', phase: 'PLAN', question: 'A?', recommendation: 'x', date: '2026-08-20' });
    await queueDecision(dir, { id: 'Q2', phase: 'PLAN', question: 'B?', recommendation: 'y', date: '2026-08-20' });
    const q = await readQueue(dir);
    expect(q.entries.map((e) => e.id)).toEqual(['Q1', 'Q2']);
    expect(q.unanswered).toBe(2);
  });

  it('an answered entry stops counting as unanswered', async () => {
    await queueDecision(dir, { id: 'Q1', phase: 'PLAN', question: 'A?', recommendation: 'x', date: '2026-08-20' });
    const q0 = await readQueue(dir);
    const body = (await readFile(q0.path, 'utf-8')).replace('_(unanswered)_', 'Postgres, per the rec.');
    await writeFile(q0.path, body);
    const q1 = await readQueue(dir);
    expect(q1.unanswered).toBe(0);
    expect(q1.entries[0].answered).toBe(true);
  });

  it('an absent queue reads clean rather than throwing', async () => {
    const q = await readQueue(dir);
    expect(q.entries).toEqual([]);
    expect(q.unanswered).toBe(0);
  });
});
