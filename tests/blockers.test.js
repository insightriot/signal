// Tests for addBlocker / clearBlocker (M4.5.E6.S1.t9).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  addBlocker,
  clearBlocker,
  readState,
  StateWriteError,
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

describe('addBlocker', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-blockers-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('generates a short id and appends an entry to blockers[]', async () => {
    await setupSchemaV1Fixture(tempDir);
    const result = await addBlocker(tempDir, { text: 'F2 marketplace agent registration unresolved' });
    expect(result.id).toMatch(/^blk-[0-9a-f]{4}$/);
    const state = await readState(tempDir);
    expect(state.blockers).toHaveLength(1);
    expect(state.blockers[0]).toMatchObject({
      id: result.id,
      text: 'F2 marketplace agent registration unresolved',
    });
    expect(state.blockers[0].raisedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('rejects empty text', async () => {
    await setupSchemaV1Fixture(tempDir);
    await expect(addBlocker(tempDir, { text: '' })).rejects.toThrow(StateWriteError);
  });

  it('rejects whitespace-only text', async () => {
    await setupSchemaV1Fixture(tempDir);
    await expect(addBlocker(tempDir, { text: '   \n\t  ' })).rejects.toThrow(StateWriteError);
  });

  it('preserves prior blockers across calls', async () => {
    await setupSchemaV1Fixture(tempDir);
    await addBlocker(tempDir, { text: 'one' });
    await addBlocker(tempDir, { text: 'two' });
    const state = await readState(tempDir);
    expect(state.blockers.map((b) => b.text)).toEqual(['one', 'two']);
  });
});

describe('clearBlocker', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-blockers-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('removes a blocker by id', async () => {
    await setupSchemaV1Fixture(tempDir);
    const { id } = await addBlocker(tempDir, { text: 'to remove' });
    await addBlocker(tempDir, { text: 'to keep' });
    const result = await clearBlocker(tempDir, { id });
    expect(result.cleared).toBe(true);
    const state = await readState(tempDir);
    expect(state.blockers.map((b) => b.text)).toEqual(['to keep']);
  });

  it('removes a blocker by exact text match (first occurrence)', async () => {
    await setupSchemaV1Fixture(tempDir);
    await addBlocker(tempDir, { text: 'duplicate' });
    await addBlocker(tempDir, { text: 'unique' });
    await addBlocker(tempDir, { text: 'duplicate' });
    const result = await clearBlocker(tempDir, { text: 'duplicate' });
    expect(result.cleared).toBe(true);
    const state = await readState(tempDir);
    // Only the first 'duplicate' is removed; the second instance survives.
    expect(state.blockers.map((b) => b.text)).toEqual(['unique', 'duplicate']);
  });

  it('returns {cleared: false} when no match (no throw)', async () => {
    await setupSchemaV1Fixture(tempDir);
    await addBlocker(tempDir, { text: 'exists' });
    const result = await clearBlocker(tempDir, { id: 'blk-9999' });
    expect(result.cleared).toBe(false);
    const state = await readState(tempDir);
    expect(state.blockers).toHaveLength(1); // unchanged
  });

  it('rejects when neither id nor text is supplied', async () => {
    await setupSchemaV1Fixture(tempDir);
    await expect(clearBlocker(tempDir, {})).rejects.toThrow(StateWriteError);
  });
});
