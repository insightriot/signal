// M5.E9 FR5 — the phase log's trim rule, both modes (D-M5E9-6, D-M5E9-7).
//
// A log that never trims trades silent deletion for silent growth. These tests
// pin the trim itself AND the two invariants that make it load-bearing rather
// than hygiene: `resume.js` counts the live list against a /7 denominator, and
// `isEpicCloseByState` tests it with `.some()`. Both assume one run's worth.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  readState,
  completePhase,
  setCurrentEpic,
  transitionPhase,
} from '../tools/lib/state.js';
import { deriveEpicArchiveDir } from '../tools/lib/evict.js';
import { isEpicCloseByState } from '../tools/lib/retrospective.js';
import { checkPhaseLog } from '../tools/lib/sweep.js';
import { seedPhaseArtifacts } from './helpers/phase-artifacts.js';

function ledger(runs, startDay = 10) {
  const phases = ['DISCUSS', 'PLAN', 'EXECUTE', 'VERIFY', 'REVIEW'];
  const out = [];
  for (let r = 0; r < runs; r++) {
    const day = String(startDay + r).padStart(2, '0');
    for (const p of phases) out.push(`${p} (2026-05-${day})`);
  }
  return out;
}

function stateFile({ epic = null, phase = 'SHIP', completed = [] }) {
  return [
    '---',
    'schema_version: 1',
    'docs_layout_version: 3',
    `phase: ${phase}`,
    `current_epic: ${epic === null ? 'null' : epic}`,
    'current_wave: null',
    'current_tasks: []',
    completed.length
      ? `completed_phases:\n${completed.map((e) => `  - ${JSON.stringify(e)}`).join('\n')}`
      : 'completed_phases: []',
    'blockers: []',
    'last_completed_task: null',
    '---',
    '',
    '# State',
    '',
  ].join('\n');
}

describe('FR5 — phase-log trim', () => {
  let base;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'sig-trim-'));
    await mkdir(join(base, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  describe('linear mode — trims at ship (AC5.1)', () => {
    it('relocates the finished run to STATE-HISTORY.md and restarts the live list', async () => {
      const run = ledger(3);
      await writeFile(join(base, '.planning', 'STATE.md'), stateFile({ completed: run }));

      const res = await completePhase(base, 'SHIP');

      // AC5.4 zero-loss: everything out is everything in — plus the SHIP that
      // completePhase just recorded, which must be inside the archived run.
      expect(res.trimmed).toBe(run.length + 1);
      const history = await readFile(join(base, '.planning', 'STATE-HISTORY.md'), 'utf-8');
      for (const entry of run) expect(history).toContain(entry);
      expect(history).toMatch(/- SHIP \(\d{4}-\d{2}-\d{2}\)/);

      // The live list restarts — this is what keeps resume's /7 honest.
      const after = await readState(base);
      expect(after.completed_phases).toEqual([]);
    });

    it('keeps the live list bounded across many runs (the resume.js /7 invariant)', async () => {
      await writeFile(join(base, '.planning', 'STATE.md'), stateFile({ completed: ledger(1) }));
      await completePhase(base, 'SHIP');
      await writeFile(
        join(base, '.planning', 'STATE.md'),
        stateFile({ completed: ledger(1, 20) })
      );
      await completePhase(base, 'SHIP');

      const after = await readState(base);
      // Never grows past one run — the invariant resume.js and
      // isEpicCloseByState both silently depend on, now actually enforced.
      expect(after.completed_phases.length).toBeLessThanOrEqual(7);

      // Nothing was lost: both runs are in the archive.
      const history = await readFile(join(base, '.planning', 'STATE-HISTORY.md'), 'utf-8');
      expect(history).toContain('DISCUSS (2026-05-10)');
      expect(history).toContain('DISCUSS (2026-05-20)');
    });

    it('is idempotent — a re-invoked ship does not re-archive or duplicate (AC5.5)', async () => {
      await writeFile(join(base, '.planning', 'STATE.md'), stateFile({ completed: ledger(1) }));
      await completePhase(base, 'SHIP');
      const firstPass = await readFile(join(base, '.planning', 'STATE-HISTORY.md'), 'utf-8');

      const again = await completePhase(base, 'SHIP');
      expect(again.recorded).toBe(false);
      const secondPass = await readFile(join(base, '.planning', 'STATE-HISTORY.md'), 'utf-8');
      expect(secondPass).toBe(firstPass);
    });

    it('does not trim in Epic mode — that is the roll\'s job, not ship\'s', async () => {
      await writeFile(
        join(base, '.planning', 'STATE.md'),
        stateFile({ epic: 'M5.E9', completed: ledger(1) })
      );
      const res = await completePhase(base, 'SHIP');
      expect(res.trimmed).toBe(0);
      expect(existsSync(join(base, '.planning', 'STATE-HISTORY.md'))).toBe(false);
    });
  });

  describe('Epic mode — archives before reset (AC5.2)', () => {
    it('writes the closing Epic\'s log to its archive, then resets', async () => {
      const run = ledger(1);
      await writeFile(
        join(base, '.planning', 'STATE.md'),
        stateFile({ epic: 'M5.E8', completed: run })
      );

      const res = await setCurrentEpic(base, 'M5.E9');
      expect(res.archivedPhaseLog).toBe(run.length);

      const target = join(base, deriveEpicArchiveDir('M5.E8'), 'STATE-NARRATIVE.md');
      const archived = await readFile(target, 'utf-8');
      for (const entry of run) expect(archived).toContain(entry);
      expect(archived).toContain('Epic M5.E8');

      const after = await readState(base);
      expect(after.current_epic).toBe('M5.E9');
      expect(after.completed_phases).toEqual([]); // B9's reset, still intact
    });

    it('creates the archive directory when the closing Epic never shipped', async () => {
      await writeFile(
        join(base, '.planning', 'STATE.md'),
        stateFile({ epic: 'M5.E8', completed: ledger(1) })
      );
      expect(existsSync(join(base, '.planning', 'archive'))).toBe(false);
      await setCurrentEpic(base, 'M5.E9');
      expect(existsSync(join(base, deriveEpicArchiveDir('M5.E8')))).toBe(true);
    });

    it('does not archive on an idempotent same-Epic call', async () => {
      await writeFile(
        join(base, '.planning', 'STATE.md'),
        stateFile({ epic: 'M5.E9', completed: ledger(1) })
      );
      const res = await setCurrentEpic(base, 'M5.E9');
      expect(res).toBeUndefined(); // early return, no roll
      expect(existsSync(join(base, '.planning', 'archive'))).toBe(false);
    });
  });

  describe('the invariant the trim protects (R2)', () => {
    it('does not let a prior run satisfy the current run\'s Epic-close coverage', async () => {
      // Without the trim, a PREVIOUS run's REVIEW entry satisfies
      // isEpicCloseByState's `.some()` coverage test and the retro gate fires
      // at the wrong moment. With the live list scoped to one run, a fresh
      // Epic mid-flight is correctly NOT an Epic close.
      await writeFile(
        join(base, '.planning', 'STATE.md'),
        stateFile({ epic: 'M5.E8', phase: 'DISCUSS', completed: ledger(2) })
      );
      await setCurrentEpic(base, 'M5.E9');
      await transitionPhase(base, 'PLAN');
      const state = await readState(base);
      expect(isEpicCloseByState(state, { tier: 'FULL', phases_skipped: [] })).toBe(false);
    });
  });

  describe('drift guard', () => {
    it('state.js\'s archive path agrees with evict.js\'s deriveEpicArchiveDir', async () => {
      // state.js duplicates this path rule because importing evict.js would be
      // a cycle. The duplication is allowed ONLY because this test fails the
      // moment the two diverge — a silently diverging second implementation of
      // a path rule is the schism state.js:100-108 records as already burning
      // Signal once.
      for (const epic of ['M5.E1', 'M4.5.E10', 'M12.E3']) {
        await rm(base, { recursive: true, force: true });
        await mkdir(join(base, '.planning'), { recursive: true });
        await writeFile(
          join(base, '.planning', 'STATE.md'),
          stateFile({ epic, completed: ledger(1) })
        );
        await setCurrentEpic(base, 'M99.E99');
        expect(
          existsSync(join(base, deriveEpicArchiveDir(epic), 'STATE-NARRATIVE.md'))
        ).toBe(true);
      }
    });
  });
});

describe('FR4 — quarantined entries are relocated, not deleted (NFR2, AC4.2)', () => {
  let base;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'sig-quar-'));
    await mkdir(join(base, '.planning'), { recursive: true });
    await seedPhaseArtifacts(base);
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('archives a malformed entry verbatim before dropping it from the live list', async () => {
    await writeFile(
      join(base, '.planning', 'STATE.md'),
      stateFile({ phase: 'PLAN', completed: ['**▶ Active: Slice SEC1', ...ledger(1)] })
    );

    const res = await transitionPhase(base, 'EXECUTE');
    expect(res.quarantined).toContain('**▶ Active: Slice SEC1');

    // The point of NFR2: it LEFT the live list, so it must have LANDED somewhere.
    // Returning it to the caller is not enough — a caller that ignores the value
    // would silently destroy it, which is a smaller copy of the bug being fixed.
    const history = await readFile(join(base, '.planning', 'STATE-HISTORY.md'), 'utf-8');
    expect(history).toContain('**▶ Active: Slice SEC1');
    expect(history).toContain('quarantined entries');

    const after = await readState(base);
    expect(after.completed_phases).not.toContain('**▶ Active: Slice SEC1');
    expect(after.completed_phases).toContain('DISCUSS (2026-05-10)'); // real entries untouched
  });
});

describe('REVIEW C1 — sweep must not alarm a healthy project', () => {
  let base;
  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'sig-sweepfp-'));
    await mkdir(join(base, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('reports nothing for a normal mid-run project (no false "history destroyed")', async () => {
    // The shape that broke the first implementation: one entry per phase name,
    // which is simply what a healthy single run looks like. It was read as the
    // fingerprint of a past collapse and told the user their history was gone.
    await writeFile(
      join(base, '.planning', 'STATE.md'),
      stateFile({
        epic: 'M5.E9',
        phase: 'VERIFY',
        completed: ['DISCUSS (2026-07-27)', 'PLAN (2026-07-27)', 'EXECUTE (2026-07-27)'],
      })
    );
    expect(await checkPhaseLog(base)).toEqual([]);
  });

  it('still reports a genuinely malformed entry (the check is not simply disabled)', async () => {
    await writeFile(
      join(base, '.planning', 'STATE.md'),
      stateFile({ phase: 'PLAN', completed: ['**▶ Active: Slice SEC1', 'PLAN (2026-07-27)'] })
    );
    const findings = await checkPhaseLog(base);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('structural');
  });

  it('still reports a live list longer than one run', async () => {
    await writeFile(
      join(base, '.planning', 'STATE.md'),
      stateFile({ phase: 'PLAN', completed: ledger(3) })
    );
    const findings = await checkPhaseLog(base);
    expect(findings.some((f) => f.severity === 'advisory' && /more than one run/.test(f.message))).toBe(true);
  });
});
