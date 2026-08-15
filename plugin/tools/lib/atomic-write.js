// Atomic write primitive — extracted from add.js (M4.5.E6.S1.t1).
//
// Write content to a sibling .tmp- file, then rename onto the target. On POSIX,
// rename is atomic — readers either see the old file or the new one, never a
// half-written state. Cross-filesystem boundaries trigger EXDEV; fall back to
// copy + unlink (less safe but functional).
//
// `renameFn` is injectable so tests can simulate EXDEV or arbitrary failure
// without staging real cross-device mounts.

import { writeFile, rename, unlink, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * @param {string} targetPath
 * @param {string} content
 * @param {{renameFn?: typeof rename}} [opts]
 */
export async function atomicWrite(targetPath, content, opts = {}) {
  const renameFn = opts.renameFn ?? rename;
  const dir = targetPath.replace(/\/[^/]+$/, '') || '.';
  const tmpName = `.tmp-${randomBytes(6).toString('hex')}-${Date.now()}`;
  const tmpPath = join(dir, tmpName);
  await writeFile(tmpPath, content, 'utf-8');
  try {
    await renameFn(tmpPath, targetPath);
  } catch (err) {
    if (err && err.code === 'EXDEV') {
      // Cross-filesystem rename failure — fall back to copy + unlink.
      await copyFile(tmpPath, targetPath);
      await unlink(tmpPath);
      return;
    }
    // Clean up tmp file on other failures so we don't leak.
    try {
      await unlink(tmpPath);
    } catch {
      // Best-effort cleanup; swallow.
    }
    throw err;
  }
}
