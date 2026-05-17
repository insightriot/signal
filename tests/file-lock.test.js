// Tests for tools/lib/file-lock.js — extracted from add.js in M4.5.E6.S1.t2.
// Sibling tests/add.test.js exercises the add.js wrapper that passes its own
// path/ttl/label; these are the canonical unit tests for the generic primitive.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { acquireLock, releaseLock } from '../tools/lib/file-lock.js';

describe('acquireLock', () => {
  let tempDir;
  let lockPath;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-file-lock-test-'));
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    lockPath = join(tempDir, '.planning', '.test.lock');
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates the lock file at the given path', async () => {
    await acquireLock(lockPath);
    expect(existsSync(lockPath)).toBe(true);
  });

  it('returns a released() thunk that unlinks the lock', async () => {
    const lock = await acquireLock(lockPath);
    expect(existsSync(lockPath)).toBe(true);
    await lock.released();
    expect(existsSync(lockPath)).toBe(false);
  });

  it('rejects a second acquire while the first is held (fresh lock, default ttl)', async () => {
    await acquireLock(lockPath);
    await expect(acquireLock(lockPath)).rejects.toThrow(/lock at/);
  });

  it('treats a lock older than ttlMs as stale and overwrites it', async () => {
    // Plant a stale lock 60s in the past — exceeds default 5s TTL.
    await writeFile(lockPath, `99999\n${Date.now() - 60_000}\n`, 'utf-8');
    const lock = await acquireLock(lockPath);
    expect(existsSync(lockPath)).toBe(true);
    await lock.released();
  });

  it('honors a custom ttlMs (longer than default)', async () => {
    // Plant a lock 10s in the past. With default 5s TTL it would be stale;
    // with 30s TTL it is still fresh.
    await writeFile(lockPath, `99999\n${Date.now() - 10_000}\n`, 'utf-8');
    await expect(
      acquireLock(lockPath, { ttlMs: 30_000 })
    ).rejects.toThrow(/lock at/);
  });

  it('includes the label option in the conflict error message', async () => {
    await acquireLock(lockPath, { label: '/sig:foo' });
    await expect(
      acquireLock(lockPath, { label: '/sig:foo' })
    ).rejects.toThrow(/Another `\/sig:foo` is running/);
  });

  it('creates the parent directory if missing', async () => {
    const deepLockPath = join(tempDir, 'fresh', 'parent', 'dir', '.lock');
    const lock = await acquireLock(deepLockPath);
    expect(existsSync(deepLockPath)).toBe(true);
    await lock.released();
  });
});

describe('releaseLock', () => {
  let tempDir;
  let lockPath;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-file-lock-test-'));
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    lockPath = join(tempDir, '.planning', '.test.lock');
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('removes the lock file when it exists', async () => {
    await writeFile(lockPath, 'pid\nts\n', 'utf-8');
    await releaseLock(lockPath);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('is a no-op when the lock file does not exist', async () => {
    expect(existsSync(lockPath)).toBe(false);
    await expect(releaseLock(lockPath)).resolves.toBeUndefined();
  });
});
