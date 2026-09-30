// File-based mutex helper — extracted from add.js (M4.5.E6.S1.t2).
//
// Atomic create via O_EXCL — if the lock file exists and is fresh (< ttlMs),
// reject. Stale locks are taken over so a crashed prior run can't permanently
// wedge callers; what counts as stale, and how two takers of one stale lock
// are kept from both holding it, is on `acquireLock` (M6.E11 REVIEW P2-I1/I2).
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
import { closeSync, linkSync, openSync, readFileSync, renameSync, unlinkSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

const DEFAULT_TTL_MS = 5_000;

// How far in the future a lock's timestamp may be before it is judged stale
// (M6.E11 REVIEW P2-I1). A little ahead is clock skew between two machines
// sharing a folder; a lot ahead can only be a broken clock or a hand-written
// file, and without this bound such a lock is "fresh" until that date.
export const FUTURE_SKEW_MS = 60_000;

// Line 1 pid, line 2 timestamp (ms), line 3 holder token, line 4 hostname.
// Locks written before line 4 existed (and planted test locks) have no host;
// for them the pid is never checked, because it cannot be known to be ours.
function parseLock(text) {
  const [pid, ts, token, host] = String(text).split('\n');
  return { pid: Number(pid), ts: Number(ts), token, host };
}

// A pid on this machine is alive unless the kernel says there is no such
// process. EPERM means it exists and belongs to someone else — alive.
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code !== 'ESRCH';
  }
}

// Why the lock in `text` may be taken over, or null while it is held.
function staleReason(text, ttlMs, now) {
  const { pid, ts, host } = parseLock(text);
  if (!Number.isFinite(ts)) return 'unreadable';
  if (ts - now > FUTURE_SKEW_MS) return 'stamped in the future';
  if (now - ts >= ttlMs) return 'expired';
  if (host === hostname() && Number.isInteger(pid) && pid > 0 && !pidAlive(pid)) return 'its process is gone';
  return null;
}

function heldError(label, lockPath, text, ttlSec) {
  const pid = String(text).split('\n')[0] || 'unknown';
  return new Error(
    `Another \`${label}\` is running (lock at ${lockPath} held by pid ${pid}; retry in <${ttlSec}s). `
      + `If no Signal command is running, the lock is left over from one that stopped and it is safe to delete ${lockPath}.`
  );
}

function readOrNull(path) {
  try {
    return readFileSync(path, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Take the lock at `lockPath`: create it with O_EXCL, or take over a stale one.
 *
 * Stale (REVIEW P2-I1): older than `ttlMs`, stamped more than
 * `FUTURE_SKEW_MS` in the future, unreadable, or — when it names this host —
 * held by a pid that no longer exists.
 *
 * Takeover (REVIEW P2-I2) never deletes the lock path and re-creates it: two
 * takers who both judged the same lock stale would both delete and both
 * create, and both hold the lock. Instead each RENAMES the lock to a name of
 * its own. Only one rename can move the stale file; the taker that moved it
 * checks it moved exactly the text it judged stale, then creates the new
 * lock with O_EXCL. A taker whose rename finds nothing retries once; a taker
 * whose rename moved a lock someone else had just created puts it back (a
 * link, which never overwrites) and is refused.
 *
 * @param {string} lockPath
 * @param {{ttlMs?: number, label?: string, _beforeTakeover?: () => Promise<void>}} [opts]
 *   `_beforeTakeover` is a test seam, awaited after a lock is judged stale
 *   and before the takeover — it is how a test parks two takers there.
 * @returns {Promise<{path: string, token: string, released: () => Promise<void>}>}
 */
export async function acquireLock(lockPath, opts = {}) {
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const label = opts.label ?? 'lock';
  const ttlSec = Math.ceil(ttlMs / 1000);
  const beforeTakeover = typeof opts._beforeTakeover === 'function' ? opts._beforeTakeover : null;

  // Defensive: ensure the parent dir exists. Callers should have validated,
  // but a missing parent makes the lock un-creatable; mkdir keeps the
  // permission/IO surface to the caller-visible failure modes.
  await mkdir(dirname(lockPath), { recursive: true });

  for (let attempt = 0; attempt < 2; attempt++) {
    const created = createLock(lockPath);
    if (created) return created;

    const existing = readOrNull(lockPath);
    if (existing === null) continue; // released between the create and the read
    if (staleReason(existing, ttlMs, Date.now()) === null) {
      throw heldError(label, lockPath, existing, ttlSec);
    }
    if (beforeTakeover) await beforeTakeover();

    const aside = `${lockPath}.stale-${process.pid}-${randomBytes(6).toString('hex')}`;
    try {
      renameSync(lockPath, aside);
    } catch (err) {
      if (err.code === 'ENOENT') continue; // another taker moved it first
      throw err;
    }
    try {
      const moved = readOrNull(aside);
      if (moved !== existing) {
        // Not the lock this call judged stale: another taker replaced it in
        // between. Put it back — `link` refuses to overwrite, so a lock made
        // since is never replaced — and give way.
        try {
          linkSync(aside, lockPath);
        } catch (err) {
          if (err.code !== 'EEXIST') throw err;
        }
        throw heldError(label, lockPath, moved ?? '', ttlSec);
      }
      const mine = createLock(lockPath);
      if (mine) return mine;
      // A taker on its retry created the lock in the gap between this rename
      // and this create. It holds the lock; this call gives way.
      throw heldError(label, lockPath, readOrNull(lockPath) ?? '', ttlSec);
    } finally {
      try {
        unlinkSync(aside);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
    }
  }
  const current = readOrNull(lockPath) ?? '';
  throw new Error(
    `Another \`${label}\` is running (lock created concurrently at ${lockPath}; retry shortly). `
      + `If no Signal command is running, it is safe to delete ${lockPath}.${
        current ? ` Lock contents: ${current.trim()}` : ''
      }`
  );
}

// Create the lock with O_EXCL and write its four lines. Null when a lock is
// already there; any other failure is thrown with its errno code.
function createLock(lockPath) {
  let fd;
  try {
    fd = openSync(lockPath, 'wx');
  } catch (err) {
    if (err.code === 'EEXIST') return null;
    throw err;
  }
  const token = randomBytes(12).toString('hex');
  try {
    writeSync(fd, `${process.pid}\n${Date.now()}\n${token}\n${hostname()}\n`);
  } finally {
    closeSync(fd);
  }
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
