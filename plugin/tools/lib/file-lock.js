// File-based mutex helper — extracted from add.js (M4.5.E6.S1.t2).
//
// Atomic create via O_EXCL — if the lock file exists and is fresh (< ttlMs),
// reject. Stale locks (>= ttlMs) are overwritten so a crashed prior run can't
// permanently wedge callers.
//
// state.js consumers default to ttlMs: 5_000 (millisecond-shape writes);
// /sig:add overrides to 30_000 because its sensitive-data prompt can sit
// open waiting for user input.
//
// Ownership (M6.E11 REVIEW I4): the lock file's third line is a random token,
// returned from `acquireLock`. `releaseLock(path, token)` removes the file only
// while it still carries that token, so a holder whose lock expired and was
// taken by someone else does not delete the new holder's lock. Without a
// token, `releaseLock` removes the file whoever holds it — the old behaviour,
// kept for callers that pass none. The check reads then unlinks, so a steal
// landing between the two is not caught; the window is microseconds, against
// a TTL of seconds.

import { readFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync, openSync, closeSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const DEFAULT_TTL_MS = 5_000;

/**
 * @param {string} lockPath
 * @param {{ttlMs?: number, label?: string}} [opts]
 * @returns {Promise<{path: string, token: string, released: () => Promise<void>}>}
 */
export async function acquireLock(lockPath, opts = {}) {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const label = opts.label ?? 'lock';
  const ttlSec = Math.ceil(ttlMs / 1000);

  // Defensive: ensure the parent dir exists. Callers should have validated,
  // but a missing parent makes the lock un-creatable; mkdir keeps the
  // permission/IO surface to the caller-visible failure modes.
  await mkdir(dirname(lockPath), { recursive: true });

  if (existsSync(lockPath)) {
    const existing = await readFile(lockPath, 'utf-8').catch(() => '');
    const [, tsLine] = existing.split('\n');
    const ts = Number(tsLine);
    if (Number.isFinite(ts) && Date.now() - ts < ttlMs) {
      throw new Error(
        `Another \`${label}\` is running (lock at ${lockPath} held by pid ${
          existing.split('\n')[0] || 'unknown'
        }; retry in <${ttlSec}s).`
      );
    }
    // Stale — unlink so the upcoming O_EXCL create succeeds.
    try {
      await unlink(lockPath);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  // Atomic create (O_EXCL). If two processes race here, the second openSync
  // call throws EEXIST, which we re-raise as a user-facing error.
  let fd;
  try {
    fd = openSync(lockPath, 'wx');
  } catch (err) {
    if (err.code === 'EEXIST') {
      const existing = await readFile(lockPath, 'utf-8').catch(() => '');
      throw new Error(
        `Another \`${label}\` is running (lock created concurrently at ${lockPath}; retry shortly).${
          existing ? ` Lock contents: ${existing.trim()}` : ''
        }`
      );
    }
    throw err;
  }
  const token = randomBytes(12).toString('hex');
  writeSync(fd, `${process.pid}\n${Date.now()}\n${token}\n`);
  closeSync(fd);

  return {
    path: lockPath,
    token,
    released: () => releaseLock(lockPath, token),
  };
}

/**
 * Release the lock file. Idempotent — silently succeeds if already absent.
 * With `token`, the file is removed only while its third line is that token;
 * a lock someone else now holds is left alone.
 * @param {string} lockPath
 * @param {string} [token] — the `token` `acquireLock` returned
 */
export async function releaseLock(lockPath, token) {
  if (token !== undefined) {
    const current = await readFile(lockPath, 'utf-8').catch((err) => {
      if (err.code === 'ENOENT') return null;
      throw err;
    });
    if (current === null || current.split('\n')[2] !== token) return;
  }
  try {
    await unlink(lockPath);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}
