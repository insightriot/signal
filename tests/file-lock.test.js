// Tests for tools/lib/file-lock.js — extracted from add.js in M4.5.E6.S1.t2.
// Sibling tests/add.test.js exercises the add.js wrapper that passes its own
// path/ttl/label; these are the canonical unit tests for the generic primitive.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { closeSync, existsSync, openSync, readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { hostname, tmpdir } from 'node:os';

import { acquireLock, releaseLock } from '../plugin/tools/lib/file-lock.js';

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

  // M6.E11 REVIEW I4: a lock that expired and was taken by someone else must
  // not be deleted by its original holder's release.
  it('acquireLock writes a holder token on line 3 and returns it', async () => {
    const lock = await acquireLock(lockPath);
    expect(typeof lock.token).toBe('string');
    expect(lock.token.length).toBeGreaterThan(8);
    expect((await readFile(lockPath, 'utf-8')).split('\n')[2]).toBe(lock.token);
    await lock.released();
  });

  it('with a token: removes the lock only while it still carries that token', async () => {
    const lock = await acquireLock(lockPath);
    await releaseLock(lockPath, lock.token);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('with a token: leaves a lock that another holder took after expiry', async () => {
    const lock = await acquireLock(lockPath);
    const thief = `4242\n${Date.now()}\nsomeone-else\n`;
    await writeFile(lockPath, thief, 'utf-8'); // expired, stolen, re-created
    await releaseLock(lockPath, lock.token);
    expect(await readFile(lockPath, 'utf-8')).toBe(thief);
    await lock.released(); // the thunk passes the token too
    expect(await readFile(lockPath, 'utf-8')).toBe(thief);
  });

  it('without a token: removes the lock whoever holds it (the old behaviour)', async () => {
    await acquireLock(lockPath);
    await writeFile(lockPath, `4242\n${Date.now()}\nsomeone-else\n`, 'utf-8');
    await releaseLock(lockPath);
    expect(existsSync(lockPath)).toBe(false);
  });
});

// M6.E11 REVIEW pass 2, P2-I1 / P2-I2: a lock that can never expire, and two
// takers of one stale lock.
describe('acquireLock — stale locks (REVIEW P2-I1, P2-I2)', () => {
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

  const tenYears = 10 * 365 * 24 * 3600 * 1000;

  it('a lock stamped far in the FUTURE is stale, not held forever (P2-I1)', async () => {
    await writeFile(lockPath, `99999\n${Date.now() + tenYears}\nfuture-token\n`, 'utf-8');
    const lock = await acquireLock(lockPath, { ttlMs: 120_000 });
    expect((await readFile(lockPath, 'utf-8')).split('\n')[2]).toBe(lock.token);
    await lock.released();
  });

  it('a lock a few seconds ahead (clock skew) is still held', async () => {
    await writeFile(lockPath, `99999\n${Date.now() + 5_000}\nskew\n`, 'utf-8');
    await expect(acquireLock(lockPath)).rejects.toThrow(/lock at/);
  });

  it('a fresh lock on THIS host whose pid is dead is stale', async () => {
    // A pid far above any real one: process.kill(pid, 0) → ESRCH.
    const dead = 2 ** 22 + 12345;
    await writeFile(lockPath, `${dead}\n${Date.now()}\ngone\n${hostname()}\n`, 'utf-8');
    const lock = await acquireLock(lockPath, { ttlMs: 120_000 });
    expect((await readFile(lockPath, 'utf-8')).split('\n')[2]).toBe(lock.token);
    await lock.released();
  });

  it('a fresh lock from ANOTHER host, or with no host line, is held whatever its pid', async () => {
    const dead = 2 ** 22 + 12345;
    await writeFile(lockPath, `${dead}\n${Date.now()}\nelsewhere\nsome-other-host\n`, 'utf-8');
    await expect(acquireLock(lockPath)).rejects.toThrow(/lock at/);
    await writeFile(lockPath, `${dead}\n${Date.now()}\n`, 'utf-8');
    await expect(acquireLock(lockPath)).rejects.toThrow(/lock at/);
  });

  it('a lock held by a live process on this host is held', async () => {
    await writeFile(lockPath, `${process.pid}\n${Date.now()}\nme\n${hostname()}\n`, 'utf-8');
    await expect(acquireLock(lockPath)).rejects.toThrow(/lock at/);
  });

  it('acquireLock records this host on line 4', async () => {
    const lock = await acquireLock(lockPath);
    expect((await readFile(lockPath, 'utf-8')).split('\n')[3]).toBe(hostname());
    await lock.released();
  });

  it('the refusal names the lock file and says when it is safe to delete', async () => {
    await acquireLock(lockPath);
    const err = await acquireLock(lockPath).catch((e) => e);
    expect(err.message).toContain(lockPath);
    expect(err.message).toMatch(/safe to delete/);
    expect(err.message).toMatch(/no Signal command is running/);
  });

  // Two takers judge the same lock stale. Before the fix each deleted it and
  // created its own, so both held the lock. The hook runs after the staleness
  // judgement and before the takeover — both takers are parked there, then
  // let go together.
  it('two takers of one stale lock: exactly one holds it (P2-I2)', async () => {
    await writeFile(lockPath, `99999\n${Date.now() - 600_000}\nold\n`, 'utf-8');
    let arrived = 0;
    let go;
    const gate = new Promise((r) => { go = r; });
    const hook = async () => {
      arrived += 1;
      if (arrived === 2) go();
      await gate;
    };
    const results = await Promise.allSettled([
      acquireLock(lockPath, { _beforeTakeover: hook }),
      acquireLock(lockPath, { _beforeTakeover: hook }),
    ]);
    const held = results.filter((r) => r.status === 'fulfilled');
    const refused = results.filter((r) => r.status === 'rejected');
    expect(arrived).toBe(2);
    expect(held).toHaveLength(1);
    expect(refused).toHaveLength(1);
    expect(refused[0].reason.message).toMatch(/Another `lock` is running/);
    expect((await readFile(lockPath, 'utf-8')).split('\n')[2]).toBe(held[0].value.token);
    expect((await readdir(join(tempDir, '.planning'))).filter((n) => n.includes('.stale-'))).toEqual([]);
  });

  it('a taker whose stale lock vanished mid-takeover retries once and takes the free lock', async () => {
    await writeFile(lockPath, `99999\n${Date.now() - 600_000}\nold\n`, 'utf-8');
    const lock = await acquireLock(lockPath, {
      _beforeTakeover: async () => { await rm(lockPath); }, // someone else cleared it
    });
    expect((await readFile(lockPath, 'utf-8')).split('\n')[2]).toBe(lock.token);
    await lock.released();
  });
});

// REVIEW pass 3 — a lock that is being written, and a live holder past its TTL.
describe('acquireLock — empty locks and live holders (REVIEW pass 3)', () => {
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

  // A has created the lock with O_EXCL and not yet written its lines. Before
  // the fix B read the empty file as "unreadable", took it over, and both held.
  it('an empty lock just created by another holder is HELD', async () => {
    const fd = openSync(lockPath, 'wx');
    try {
      await expect(acquireLock(lockPath)).rejects.toThrow(/lock at/);
      expect(readFileSync(lockPath, 'utf-8')).toBe('');
    } finally {
      closeSync(fd);
    }
  });

  it('an unparseable lock is held while fresh, stale once its mtime is past the TTL', async () => {
    await writeFile(lockPath, 'garbage', 'utf-8');
    await expect(acquireLock(lockPath)).rejects.toThrow(/lock at/);
    const old = (Date.now() - 60_000) / 1000;
    utimesSync(lockPath, old, old);
    const lock = await acquireLock(lockPath);
    expect((await readFile(lockPath, 'utf-8')).split('\n')[2]).toBe(lock.token);
    await lock.released();
  });

  it('a live holder on this host past its TTL is still held', async () => {
    await writeFile(lockPath, `${process.pid}\n${Date.now() - 10_000}\nme\n${hostname()}\n`, 'utf-8');
    await expect(acquireLock(lockPath, { ttlMs: 5_000 })).rejects.toThrow(/lock at/);
  });

  it('…up to 10× the TTL: past that it is stale, so a reused pid cannot wedge the lock', async () => {
    await writeFile(lockPath, `${process.pid}\n${Date.now() - 51_000}\nme\n${hostname()}\n`, 'utf-8');
    const lock = await acquireLock(lockPath, { ttlMs: 5_000 });
    expect((await readFile(lockPath, 'utf-8')).split('\n')[2]).toBe(lock.token);
    await lock.released();
  });

  // pid 1 exists and belongs to root: process.kill(1, 0) throws EPERM, which
  // means alive. Past the TTL but inside 10×, so only a live-pid answer holds it.
  it.skipIf(process.getuid?.() === 0)('pid 1 on this host (EPERM) counts as alive → held past its TTL', async () => {
    await writeFile(lockPath, `1\n${Date.now() - 10_000}\ninit\n${hostname()}\n`, 'utf-8');
    await expect(acquireLock(lockPath, { ttlMs: 5_000 })).rejects.toThrow(/lock at/);
  });
});

// M6.E14 S6 (SIG-251, SIG-252).
describe('acquireLock — the held message and a vanished stat', () => {
  let tempDir;
  let lockPath;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'sig-lock-m6e14-'));
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    lockPath = join(tempDir, '.planning', '.test.lock');
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('AC7.1: held by a live pid on this host, the message states the real wait — 10 × ttl', async () => {
    await writeFile(lockPath, `${process.pid}\n${Date.now()}\nme\n${hostname()}\n`, 'utf-8');
    await expect(acquireLock(lockPath, { ttlMs: 5_000 })).rejects.toThrow(/usually free within seconds — at most 50s while that process is alive/);
  });

  it('AC7.1: held by a pid on another host, the message keeps ttl', async () => {
    await writeFile(lockPath, `${process.pid}\n${Date.now()}\nthem\nsome-other-host\n`, 'utf-8');
    await expect(acquireLock(lockPath, { ttlMs: 5_000 })).rejects.toThrow(/retry in <5s/);
  });

  it('AC7.2: a lock whose stat vanishes after it was read is not taken over', async () => {
    // An empty lock: created, not yet written. Its mtime is what keeps it held.
    // Depends on the `_stat` seam: old code ignores it and stats the real file,
    // so the route is asserted, not only the outcome (M6.E14 REVIEW).
    await writeFile(lockPath, '', 'utf-8');
    let stats = 0;
    const err = await acquireLock(lockPath, { ttlMs: 5_000, _stat: () => { stats += 1; return undefined; } }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toMatch(/lock created concurrently/);
    expect(stats).toBe(2);
    expect(readFileSync(lockPath, 'utf-8')).toBe('');
  });
});
