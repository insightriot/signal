import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { transitionPhase } from '../plugin/tools/lib/state.js';

/**
 * M5.E16 S5 (FR5) — `INDEX.md` regenerates at every phase transition.
 *
 * The problem: `regeneratePlanningIndex` was called by `/sig:ship` §8 and
 * `/sig:index`, and nowhere else. So the documentation map was correct at
 * exactly the moment an Epic FINISHED, and drifted through the whole span of
 * work — which is when someone is actually re-orienting from it. All four
 * projects surveyed on 2026-08-01 had a stale, missing, or foreign INDEX.md,
 * and `CLAUDE.md` tells every reader to "read it first."
 *
 * Hooking it to `transitionPhase` rather than to each phase command's text is
 * deliberate: an instruction repeated in ten command files is `B60`'s shape —
 * stated in some, silent in others — and this project has been bitten twice by
 * rules that existed only as prose (`B7`→`B58`, `B39`).
 */

const STATE = (phase = 'DISCUSS') => `---
schema_version: 1
docs_layout_version: 3
phase: ${phase}
current_epic: M5.E16
current_wave: null
current_tasks: []
completed_phases: []
blockers: []
last_completed_task: null
last_updated_commit: abc1234
last_updated: 2026-08-02T00:00:00.000Z
---
# Project State

M5.E16 is in ${phase}.
`;

async function makeProject(extra = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sig-s5-'));
  await mkdir(join(dir, '.planning'), { recursive: true });
  await writeFile(join(dir, '.planning', 'STATE.md'), STATE());
  // Leaving DISCUSS requires a REQUIREMENTS artifact — `transitionPhase` refuses
  // to record a phase that produced nothing (`B48`). The fixture has to be a
  // project that could legitimately transition, not just one with a STATE file.
  await writeFile(join(dir, '.planning', 'M5.E16-REQUIREMENTS.md'), '# reqs\n');
  await writeFile(join(dir, '.planning', 'M5.E16-PLAN.md'), '# plan\n');
  for (const [name, content] of Object.entries(extra)) {
    await writeFile(join(dir, '.planning', name), content);
  }
  return dir;
}

describe('M5.E16 S5.t1 — the index regenerates on a phase transition (AC5.1)', () => {
  it('writes INDEX.md when the project has none', async () => {
    const dir = await makeProject();
    try {
      expect(existsSync(join(dir, '.planning', 'INDEX.md'))).toBe(false);
      await transitionPhase(dir, 'PLAN');
      expect(existsSync(join(dir, '.planning', 'INDEX.md'))).toBe(true);
      const index = await readFile(join(dir, '.planning', 'INDEX.md'), 'utf-8');
      expect(index).toMatch(/M5\.E16-PLAN\.md/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('refreshes a stale INDEX.md — the whole point is mid-Epic freshness', async () => {
    const dir = await makeProject();
    try {
      await transitionPhase(dir, 'PLAN');
      // A new doc lands mid-Epic, the way they actually do.
      await writeFile(join(dir, '.planning', 'M5.E16-VERIFICATION.md'), '# verification\n');
      const before = await readFile(join(dir, '.planning', 'INDEX.md'), 'utf-8');
      expect(before).not.toMatch(/VERIFICATION/);

      await transitionPhase(dir, 'EXECUTE');

      const after = await readFile(join(dir, '.planning', 'INDEX.md'), 'utf-8');
      expect(after).toMatch(/M5\.E16-VERIFICATION\.md/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('still records the phase — the index write is a side effect, not the job', async () => {
    const dir = await makeProject();
    try {
      await transitionPhase(dir, 'PLAN');
      const state = await readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');
      expect(state).toMatch(/phase: PLAN/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('a failing index regeneration never breaks the transition', async () => {
    // The phase record is load-bearing; the docs map is not. If INDEX.md cannot
    // be written, the transition must still happen — otherwise a docs problem
    // becomes a state-corruption problem, which is a strictly worse trade.
    const dir = await makeProject();
    try {
      // Make INDEX.md a DIRECTORY so any write to that path fails.
      await mkdir(join(dir, '.planning', 'INDEX.md'), { recursive: true });
      await expect(transitionPhase(dir, 'PLAN')).resolves.toBeTruthy();
      const state = await readFile(join(dir, '.planning', 'STATE.md'), 'utf-8');
      expect(state).toMatch(/phase: PLAN/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('M5.E16 S5.t2 — an unchanged doc set still writes nothing (AC5.2)', () => {
  it('a second transition over the same docs leaves INDEX.md byte-identical and untouched', async () => {
    // This is the guarantee that makes the added frequency free: compare-before-write
    // means no diff, no git noise, no mtime churn.
    const dir = await makeProject();
    try {
      await transitionPhase(dir, 'PLAN');
      const indexPath = join(dir, '.planning', 'INDEX.md');
      const first = await readFile(indexPath, 'utf-8');
      const firstMtime = (await stat(indexPath)).mtimeMs;

      await new Promise((r) => setTimeout(r, 10));
      await transitionPhase(dir, 'EXECUTE');

      expect(await readFile(indexPath, 'utf-8')).toBe(first);
      expect((await stat(indexPath)).mtimeMs).toBe(firstMtime);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('M5.E16 S5.t3 — no hook gains write capability (AC5.3)', () => {
  it('every hook is warn-only — none writes to the filesystem', async () => {
    // FR5 rejected regenerating on SESSION START, even though it would be
    // fresher, because no Signal hook writes anything today and a hook that
    // edits files before the user has asked for anything crosses a trust line
    // the design holds deliberately. That line is asserted here, not assumed.
    const hooksDir = join(import.meta.dirname, '..', 'plugin', 'hooks');
    const files = (await readdir(hooksDir)).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);

    const WRITE_CALLS = /\b(writeFile|writeFileSync|appendFile|appendFileSync|atomicWrite|mkdirSync|rmSync|unlinkSync|renameSync)\s*\(/;
    for (const file of files) {
      const src = await readFile(join(hooksDir, file), 'utf-8');
      expect(WRITE_CALLS.test(src), `${file} must stay warn-only`).toBe(false);
    }
  });

  it('no hook imports the index regenerator', async () => {
    const hooksDir = join(import.meta.dirname, '..', 'plugin', 'hooks');
    const files = (await readdir(hooksDir)).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      const src = await readFile(join(hooksDir, file), 'utf-8');
      expect(src, `${file}`).not.toMatch(/regeneratePlanningIndex/);
    }
  });
});
