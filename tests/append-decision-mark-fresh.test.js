// Tests for touchDecisionTimestamp + markFresh
// (M4.5.E6.S1.t10; renamed from appendDecision in S6.t4 per REVIEW IMPORTANT-3).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  touchDecisionTimestamp,
  markFresh,
  readState,
  isStateStale,
  StateSchemaError,
} from '../tools/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, 'fixtures', 'state');

async function setupSchemaV1Fixture(tempDir) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await copyFile(
    join(FIXTURE_ROOT, 'schema-v1', '.planning', 'STATE.md'),
    join(tempDir, '.planning', 'STATE.md')
  );
}

describe('touchDecisionTimestamp', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-decision-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('updates last_decision_at with the supplied timestamp', async () => {
    await setupSchemaV1Fixture(tempDir);
    await touchDecisionTimestamp(tempDir, { at: '2026-05-17T20:00:00.000Z' });
    const state = await readState(tempDir);
    expect(state.last_decision_at).toBe('2026-05-17T20:00:00.000Z');
  });

  it('defaults `at` to now() when omitted', async () => {
    await setupSchemaV1Fixture(tempDir);
    const before = Date.now();
    await touchDecisionTimestamp(tempDir);
    const after = Date.now();
    const state = await readState(tempDir);
    const recorded = new Date(state.last_decision_at).getTime();
    expect(recorded).toBeGreaterThanOrEqual(before);
    expect(recorded).toBeLessThanOrEqual(after);
  });
});

describe('markFresh', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-fresh-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('updates last_updated and last_updated_commit when both supplied', async () => {
    await setupSchemaV1Fixture(tempDir);
    await markFresh(tempDir, {
      at: '2026-05-17T20:00:00.000Z',
      commit: 'sha-explicit',
    });
    const state = await readState(tempDir);
    expect(state.last_updated).toBe('2026-05-17T20:00:00.000Z');
    expect(state.last_updated_commit).toBe('sha-explicit');
  });

  it('resolves the commit via `git rev-parse HEAD` when not supplied', async () => {
    await setupSchemaV1Fixture(tempDir);
    const execSpy = vi.fn(() => Buffer.from('resolved-sha-abc123\n'));
    await markFresh(tempDir, { execFn: execSpy });
    expect(execSpy).toHaveBeenCalledTimes(1);
    const [cmd, args] = execSpy.mock.calls[0];
    expect(cmd).toBe('git');
    expect(args).toEqual(['rev-parse', 'HEAD']);
    const state = await readState(tempDir);
    expect(state.last_updated_commit).toBe('resolved-sha-abc123');
  });

  it('leaves last_updated_commit unchanged when git fails and no commit supplied', async () => {
    await setupSchemaV1Fixture(tempDir);
    // Schema-v1 fixture has last_updated_commit: abc123def456 baked in.
    const execFn = () => {
      throw new Error('git: not a repo');
    };
    await markFresh(tempDir, { execFn });
    const state = await readState(tempDir);
    expect(state.last_updated_commit).toBe('abc123def456');
  });
});

// FR3: DISCUSS + PLAN now end with a markFresh step (added to discuss.md /
// plan.md this task). markFresh + isStateStale are E6 helpers, so these lock
// the end-to-end contracts the new command-prose wiring depends on rather
// than driving fresh implementation.
describe('markFresh — FR3 wiring contracts (M4.5.E10.S1.t5)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-fr3-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // AC3.4: after a phase calls markFresh, the local staleness check reads
  // fresh — the whole point of adding the step to DISCUSS/PLAN.
  it('AC3.4: markFresh flips isStateStale from stale to fresh', async () => {
    await setupSchemaV1Fixture(tempDir); // last_updated_commit: abc123def456

    // Pre: HEAD moved past the stored sha and state-affecting commits exist.
    const staleExec = (cmd, args) => {
      if (args[0] === 'rev-parse') return Buffer.from('newhead999\n');
      if (args[0] === 'log') return Buffer.from('newhead999 planning: phase work\n');
      return Buffer.from('');
    };
    const pre = await isStateStale(tempDir, { execFn: staleExec });
    expect(pre.stale).toBe(true);

    // The phase-close markFresh advances last_updated_commit to HEAD.
    await markFresh(tempDir, { execFn: () => Buffer.from('newhead999\n') });
    expect((await readState(tempDir)).last_updated_commit).toBe('newhead999');

    // Post: HEAD === last_updated_commit -> hash short-circuit -> fresh,
    // without even reaching git log.
    const freshExec = vi.fn((cmd, args) => {
      if (args[0] === 'rev-parse') return Buffer.from('newhead999\n');
      throw new Error('git log must not run once STATE is fresh');
    });
    const post = await isStateStale(tempDir, { execFn: freshExec });
    expect(post).toEqual({ stale: false, commitCount: 0, commits: [] });
  });

  // AC3.3: markFresh throws StateSchemaError on a schema-mismatched STATE.md
  // (readStateForMutation fails closed on an unknown version). This is WHY
  // the discuss.md/plan.md step must wrap markFresh in a catch-ALL (schema +
  // write + lock), not just a git/lock guard.
  it('AC3.3: markFresh throws StateSchemaError on an ahead-schema STATE.md (wrapper must catch)', async () => {
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    await writeFile(
      join(tempDir, '.planning', 'STATE.md'),
      '---\nschema_version: 999\nphase: PLAN\n---\n# body\n',
      'utf-8'
    );
    await expect(markFresh(tempDir)).rejects.toThrow(StateSchemaError);
  });
});
