// B75 — the observed-ask record and the phase-close check that reads it.
//
// The assertions that matter here are the negative ones. It is easy to write a
// check that reports "clean" and never fires; the tests that keep this honest
// are the ones pinning that an absent record reads as `cannot-check` (never
// `clean`), and that the check does NOT claim to count asks.

import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  ASK_RECORD_BASENAME,
  EVIDENCE_DIR,
  askRecordPath,
  checkPhaseAsks,
  phaseBeingLeft,
  readAsks,
  recordAsk,
} from '../plugin/tools/lib/ask-record.js';

let base;

function state(completed) {
  const entries = completed.map((p) => `  - ${p}`).join('\n');
  return `---\nschema_version: 1\nphase: PLAN\ncurrent_epic: M6.E3\ncompleted_phases:\n${entries}\n---\n# Project State\n`;
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'sig-ask-'));
  mkdirSync(join(base, '.planning'), { recursive: true });
});

afterEach(() => {
  rmSync(base, { recursive: true, force: true });
});

describe('the record', () => {
  it('lives outside .planning/, because .planning/ is tracked project memory', () => {
    // Standing policy is that `.planning/` is never gitignored — it is the
    // project's memory. This record is per-machine session evidence, so it must
    // not force an exception inside that directory.
    expect(EVIDENCE_DIR).toBe('.signal');
    expect(askRecordPath(base)).toBe(join(base, '.signal', ASK_RECORD_BASENAME));
    expect(askRecordPath(base)).not.toContain('.planning');
  });

  it('is gitignored by the repo that ships it', () => {
    const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf-8');
    expect(ignore.split('\n').map((l) => l.trim())).toContain(`${EVIDENCE_DIR}/`);
  });

  it('appends one line per ask, creating the directory on first write', () => {
    expect(recordAsk({ baseDir: base, phase: 'PLAN', epic: 'M6.E3', at: 'T1' })).toBe(true);
    expect(recordAsk({ baseDir: base, phase: 'PLAN', epic: 'M6.E3', at: 'T2' })).toBe(true);
    const { exists, entries } = readAsks(base);
    expect(exists).toBe(true);
    expect(entries).toEqual([
      { at: 'T1', phase: 'PLAN', epic: 'M6.E3' },
      { at: 'T2', phase: 'PLAN', epic: 'M6.E3' },
    ]);
  });

  it('skips a torn line rather than throwing the whole read away', () => {
    recordAsk({ baseDir: base, phase: 'PLAN', epic: null, at: 'T1' });
    writeFileSync(askRecordPath(base), readFileSync(askRecordPath(base), 'utf-8') + '{"at":\n');
    const { entries } = readAsks(base);
    expect(entries).toHaveLength(1);
  });

  it('reports a missing file as absent, not as an empty record', () => {
    expect(readAsks(base)).toEqual({ exists: false, entries: [] });
  });
});

describe('detecting the phase being left', () => {
  it('reads a single appended entry as the phase closing', () => {
    expect(
      phaseBeingLeft({
        currentContent: state(['DISCUSS (2026-08-19)']),
        proposedContent: state(['DISCUSS (2026-08-19)', 'PLAN (2026-08-22)']),
      })
    ).toBe('PLAN');
  });

  it('is not a transition when nothing was appended', () => {
    const s = state(['DISCUSS (2026-08-19)']);
    expect(phaseBeingLeft({ currentContent: s, proposedContent: s })).toBeNull();
  });

  it('is not a transition when earlier history was rewritten', () => {
    expect(
      phaseBeingLeft({
        currentContent: state(['DISCUSS (2026-08-19)']),
        proposedContent: state(['VERIFY (2026-08-01)', 'PLAN (2026-08-22)']),
      })
    ).toBeNull();
  });

  it('is not a transition on a bulk backfill of several entries', () => {
    expect(
      phaseBeingLeft({
        currentContent: state(['DISCUSS (2026-08-19)']),
        proposedContent: state(['DISCUSS (2026-08-19)', 'PLAN (2026-08-22)', 'EXECUTE (2026-08-22)']),
      })
    ).toBeNull();
  });
});

describe('the check', () => {
  const closing = {
    currentContent: state(['DISCUSS (2026-08-19)']),
    proposedContent: state(['DISCUSS (2026-08-19)', 'PLAN (2026-08-22)']),
  };

  it('says nothing when the dial was never set to ask-as-you-go', () => {
    const r = checkPhaseAsks({ ...closing, baseDir: base, confirmInPhase: false });
    expect(r.status).toBe('not-applicable');
  });

  it('says nothing when the write is not a phase transition', () => {
    const s = state(['DISCUSS (2026-08-19)']);
    const r = checkPhaseAsks({
      currentContent: s,
      proposedContent: s,
      baseDir: base,
      confirmInPhase: true,
    });
    expect(r.status).toBe('not-applicable');
  });

  it('reports CANNOT-CHECK — never clean — when no record file exists', () => {
    // The distinction this whole module turns on. An absent record means the
    // hook has never run here, which is not evidence that nobody was asked.
    const r = checkPhaseAsks({ ...closing, baseDir: base, confirmInPhase: true });
    expect(r.status).toBe('cannot-check');
    expect(r.status).not.toBe('clean');
    expect(r.phase).toBe('PLAN');
    expect(r.reason).toMatch(/not the same as/i);
  });

  it('warns when the record exists but holds nothing for this phase', () => {
    recordAsk({ baseDir: base, phase: 'DISCUSS', epic: 'M6.E3', at: 'T1' });
    const r = checkPhaseAsks({ ...closing, baseDir: base, confirmInPhase: true });
    expect(r.status).toBe('warn');
    expect(r.phase).toBe('PLAN');
  });

  it('is clean when at least one ask was observed in this phase', () => {
    recordAsk({ baseDir: base, phase: 'PLAN', epic: 'M6.E3', at: 'T1' });
    const r = checkPhaseAsks({ ...closing, baseDir: base, confirmInPhase: true });
    expect(r.status).toBe('clean');
  });

  it('is clean on ONE ask even where several were owed — and says so', () => {
    // Not a gap to fix later by tightening this function. `confirm_in_phase`
    // means a countable number in only two of six phases (execute.md's wave
    // boundaries, ship.md's checklist); in discuss.md it is one per gray area
    // found as you go, and in plan/verify/review.md "every step" is undefined.
    // A count comparison here would be fabricated for four of six phases.
    recordAsk({ baseDir: base, phase: 'PLAN', epic: 'M6.E3', at: 'T1' });
    const r = checkPhaseAsks({ ...closing, baseDir: base, confirmInPhase: true });
    expect(r.status).toBe('clean');

    const warned = checkPhaseAsks({
      ...closing,
      baseDir: base,
      confirmInPhase: true,
      asks: { exists: true, entries: [] },
    });
    expect(warned.reason).toMatch(/asked once where several were owed/i);
  });

  it('states in the warning that nothing was blocked', () => {
    // Brett chose warn-over-block on 2026-08-22. The message must not read like
    // a refusal, and the closure note for B75 must say "checked", not "enforced".
    const r = checkPhaseAsks({
      ...closing,
      baseDir: base,
      confirmInPhase: true,
      asks: { exists: true, entries: [] },
    });
    expect(r.reason).toMatch(/report, not a refusal/i);
  });
});
