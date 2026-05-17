// Tests for tools/lib/atomic-write.js — extracted from add.js in M4.5.E6.S1.t1.
// Sibling tests/add.test.js exercises the same function via add.js's re-export;
// these are the canonical unit tests for the standalone module.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { atomicWrite } from '../tools/lib/atomic-write.js';

describe('atomicWrite — happy path', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-atomic-write-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes content to the target path', async () => {
    const target = join(tempDir, 'out.md');
    await atomicWrite(target, 'hello world');
    expect(await readFile(target, 'utf-8')).toBe('hello world');
  });

  it('does not leave a .tmp- file behind on success', async () => {
    const target = join(tempDir, 'out.md');
    await atomicWrite(target, 'hello');
    const files = await readdir(tempDir);
    expect(files.filter((f) => f.includes('.tmp-'))).toHaveLength(0);
  });

  it('is idempotent on re-call — second write replaces content', async () => {
    const target = join(tempDir, 'out.md');
    await atomicWrite(target, 'first');
    await atomicWrite(target, 'second');
    expect(await readFile(target, 'utf-8')).toBe('second');
  });
});

describe('atomicWrite — atomic-fail invariant', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-atomic-write-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('leaves destination unchanged if rename throws non-EXDEV error', async () => {
    const target = join(tempDir, 'out.md');
    await writeFile(target, 'ORIGINAL', 'utf-8');
    const renameFn = async () => {
      throw new Error('simulated rename failure');
    };
    await expect(atomicWrite(target, 'NEW', { renameFn })).rejects.toThrow(/simulated rename/);
    expect(await readFile(target, 'utf-8')).toBe('ORIGINAL');
  });

  it('cleans up tmp file when rename fails (no leak)', async () => {
    const target = join(tempDir, 'out.md');
    await writeFile(target, 'ORIGINAL', 'utf-8');
    const renameFn = async () => {
      throw new Error('simulated rename failure');
    };
    await expect(atomicWrite(target, 'NEW', { renameFn })).rejects.toThrow();
    const files = await readdir(tempDir);
    expect(files.filter((f) => f.includes('.tmp-'))).toHaveLength(0);
  });
});

describe('atomicWrite — EXDEV fallback (cross-filesystem rename)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-atomic-write-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('falls back to copy+unlink when rename throws EXDEV', async () => {
    const target = join(tempDir, 'out.md');
    const renameFn = async () => {
      const err = new Error('cross-device link');
      err.code = 'EXDEV';
      throw err;
    };
    await atomicWrite(target, 'NEW', { renameFn });
    expect(await readFile(target, 'utf-8')).toBe('NEW');
  });

  it('does not leave tmp file after EXDEV fallback', async () => {
    const target = join(tempDir, 'out.md');
    const renameFn = async () => {
      const err = new Error('cross-device link');
      err.code = 'EXDEV';
      throw err;
    };
    await atomicWrite(target, 'NEW', { renameFn });
    const files = await readdir(tempDir);
    expect(files.filter((f) => f.includes('.tmp-'))).toHaveLength(0);
  });
});
