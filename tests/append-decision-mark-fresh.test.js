// Tests for appendDecision + markFresh (M4.5.E6.S1.t10).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  appendDecision,
  markFresh,
  readState,
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

describe('appendDecision', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-decision-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('updates last_decision_at with the supplied timestamp', async () => {
    await setupSchemaV1Fixture(tempDir);
    await appendDecision(tempDir, { at: '2026-05-17T20:00:00.000Z' });
    const state = await readState(tempDir);
    expect(state.last_decision_at).toBe('2026-05-17T20:00:00.000Z');
  });

  it('defaults `at` to now() when omitted', async () => {
    await setupSchemaV1Fixture(tempDir);
    const before = Date.now();
    await appendDecision(tempDir);
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
