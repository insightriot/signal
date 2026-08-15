/**
 * tests/phase-log-gap.test.js — B87: a phase ran and the ledger doesn't say so.
 *
 * M5.E9 closed `B41` by putting `transitionPhase` INSIDE each phase command,
 * which does nothing for a run that never invokes them. Signal-on-Signal is
 * exactly that run, and so is any Epic driven by hand — which is how most of
 * this repo's own Epics execute. Caught live at M5.E19 VERIFY.
 *
 * The check DETECTS and never repairs, deliberately: the log is append-only
 * with no dedupe (`D-M5E9-5`), and writing an entry the flow never produced is
 * `B48`'s lesson. These tests pin that it stays detect-only.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { runDriftChecks } from '../plugin/tools/lib/state-drift.js';

const state = ({ phase = 'VERIFY', epic = 'M1.E1', completed = [] }) =>
  `---
schema_version: 1
phase: ${phase}
current_epic: ${epic}
current_wave: null
current_tasks: []
completed_phases:
${completed.length ? completed.map((c) => `  - ${c}`).join('\n') : '  []'}
blockers: []
last_completed_task: null
last_updated_commit: 0000000
last_updated: 2026-01-01T00:00:00.000Z
---
# State
`;

const gap = (r) => r.results.find((c) => c.id === 'phase-log-gap');

describe('B87 — phase-log-gap', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-gap-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('FIRES when EXECUTE produced an artifact but left no ledger entry', async () => {
    // The exact shape found in Signal at M5.E19: PROGRESS on disk, EXECUTE absent.
    await writeFile(
      join(dir, '.planning', 'STATE.md'),
      state({ phase: 'VERIFY', completed: ['DISCUSS (2026-01-01)', 'PLAN (2026-01-02)'] })
    );
    await writeFile(join(dir, '.planning', 'M1.E1-PROGRESS.md'), '# progress\n');

    const c = gap(await runDriftChecks(dir));
    expect(c.findings.length).toBe(1);
    expect(c.findings[0].message).toMatch(/EXECUTE left no entry/);
    expect(c.findings[0].message).toMatch(/M1\.E1-PROGRESS\.md/);
    // It must explain WHY, or the reader cannot tell a bug from their own workflow.
    expect(c.findings[0].message).toMatch(/driven by hand/);
  });

  it('is SILENT when the phase is properly logged', async () => {
    await writeFile(
      join(dir, '.planning', 'STATE.md'),
      state({ phase: 'VERIFY', completed: ['PLAN (2026-01-02)', 'EXECUTE (2026-01-03)'] })
    );
    await writeFile(join(dir, '.planning', 'M1.E1-PROGRESS.md'), '# progress\n');
    expect(gap(await runDriftChecks(dir)).findings).toEqual([]);
  });

  it('does NOT flag the current phase — it has not been left yet', async () => {
    // Sitting in EXECUTE with a PROGRESS file is normal, not a gap. Flagging it
    // would make the check fire during every single execution.
    await writeFile(
      join(dir, '.planning', 'STATE.md'),
      state({ phase: 'EXECUTE', completed: ['PLAN (2026-01-02)'] })
    );
    await writeFile(join(dir, '.planning', 'M1.E1-PROGRESS.md'), '# progress\n');
    expect(gap(await runDriftChecks(dir)).findings).toEqual([]);
  });

  it('does not invent a gap when the artifact is absent', async () => {
    // No PROGRESS on disk means no evidence EXECUTE ran. Absence of proof is
    // not proof of a skipped record.
    await writeFile(
      join(dir, '.planning', 'STATE.md'),
      state({ phase: 'VERIFY', completed: ['PLAN (2026-01-02)'] })
    );
    expect(gap(await runDriftChecks(dir)).findings).toEqual([]);
  });

  it('declares itself BLIND on a non-strict unit id rather than guessing', async () => {
    await writeFile(
      join(dir, '.planning', 'STATE.md'),
      state({ phase: 'VERIFY', epic: 'PHASE11', completed: [] })
    );
    const c = gap(await runDriftChecks(dir));
    expect(c.findings).toEqual([]);
    expect(String(c.reason ?? '')).toMatch(/not a strict Epic ID/);
  });

  it('REPAIRS NOTHING — the log is append-only (B48, D-M5E9-5)', async () => {
    await writeFile(
      join(dir, '.planning', 'STATE.md'),
      state({ phase: 'VERIFY', completed: ['PLAN (2026-01-02)'] })
    );
    await writeFile(join(dir, '.planning', 'M1.E1-PROGRESS.md'), '# progress\n');
    const before = await readdir(join(dir, '.planning'));
    const { readFile } = await import('node:fs/promises');
    const stateBefore = await readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');

    await runDriftChecks(dir);

    expect((await readdir(join(dir, '.planning'))).sort()).toEqual(before.sort());
    expect(await readFile(join(dir, '.planning', 'STATE.md'), 'utf-8')).toBe(stateBefore);
  });
});
