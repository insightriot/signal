// Atomic write primitive — extracted from add.js (M4.5.E6.S1.t1).
//
// Write content to a sibling .tmp- file, then rename onto the target. On POSIX,
// rename is atomic — readers either see the old file or the new one, never a
// half-written state. Cross-filesystem boundaries trigger EXDEV; fall back to
// copy + unlink (less safe but functional).
//
// `renameFn` is injectable so tests can simulate EXDEV or arbitrary failure
// without staging real cross-device mounts.
//
// The generated-file guard (M6.E11, D-M6E11-25/-28): a target whose first line
// is the work store's GENERATED_MARKER is refused unless `{generated: true}` —
// which only the generator passes. Such a file is rebuilt from item files, so
// any other write into it would vanish at the next regeneration. The check
// runs before the temp file is written, so a refusal leaves nothing behind. A
// store-off project never carries the marker, so its writes are unchanged.

import { writeFile, rename, unlink, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { WorkStoreError } from './work-errors.js';
import { isGeneratedFile } from './work-marker.js';

/**
 * @param {string} targetPath
 * @param {string} content
 * @param {{renameFn?: typeof rename, generated?: boolean}} [opts]
 *   `generated: true` — the caller is the generator (or restores the
 *   generator's own bytes) and may overwrite a marked file.
 * @throws {WorkStoreError} GENERATED when the target is a generated file
 */
export async function atomicWrite(targetPath, content, opts = {}) {
  if (opts.generated !== true && isGeneratedFile(targetPath)) {
    throw new WorkStoreError('GENERATED', `${targetPath} is generated from the work store's item files — `
      + 'a write here would be lost at the next regeneration. Change the item files under .planning/work/ '
      + 'instead, with /sig:item (new, move, close, triage).');
  }
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
