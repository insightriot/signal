// REVIEW pass 1, I1 — the generator must never overwrite a hand-kept list.
//
// With `.planning/work/WORK.md` present, every mutation regenerates the four
// lists. On a project whose lists are still hand-kept (WORK.md created by
// hand instead of by the migration), that regeneration used to replace them
// wholesale — reproduced: `BUGS.md` → 0 total.
//
// M6.E13 t7.4: on a v2 store. The v1 `newItem` that refused before writing
// the item was retired; what remains is `regenerateViews`' preflight (every
// target checked before any write) and the `assertNoHandKeptLists` guard that
// `closeEpic` and the archive-tree apply run before anything moves.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { closeEpic } from '../plugin/tools/lib/work-ops.js';
import { GENERATED_MARKER } from '../plugin/tools/lib/work-marker.js';
import { newItem, nextIdV2 } from '../plugin/tools/lib/work-records.js';
import { WORK_LOCK_REL } from '../plugin/tools/lib/work-store.js';
import { regenerateViews } from '../plugin/tools/lib/work-views.js';
import { WorkStoreError } from '../plugin/tools/lib/work-errors.js';

let dir;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sig-hand-kept-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(dir, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}
const read = (rel) => readFile(join(dir, rel), 'utf-8');
const HAND_BUGS = '# Bugs\n\n| ID | Status | Pri | Summary |\n|---|---|---|---|\n| B1 | `confirmed` | P1 | a real bug |\n';

async function caught(p) {
  try {
    await p;
  } catch (e) {
    return e;
  }
  return null;
}

const V2 = '---\nkey: SIG\nschema_version: 2\n---\n';
const noGit = { execFn: () => { throw new Error('no git'); } };

describe('a hand-kept list with the store switched on by hand', () => {
  it('closeEpic refuses with CONFIG before moving anything, and BUGS.md is untouched', async () => {
    await put('.planning/BUGS.md', HAND_BUGS);
    await put('.planning/work/WORK.md', V2);
    await put('.planning/work/epics/M6.E99/M6.E99-PLAN.md', '# plan\n');
    const err = await caught(closeEpic(dir, 'M6.E99', { by: 'b' }, noGit));
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('CONFIG');
    expect(err.message).toContain('.planning/BUGS.md');
    // An already-migrated project cannot re-run the migration (WORK.md
    // exists); its way back is git (advisor note on I1).
    expect(err.message).toMatch(/already migrated[^.]*restore[^.]*git/);
    expect(await read('.planning/BUGS.md')).toBe(HAND_BUGS);
    expect(existsSync(join(dir, '.planning/work/epics/M6.E99/M6.E99-PLAN.md'))).toBe(true);
    expect(existsSync(join(dir, '.planning/archive'))).toBe(false);
    expect(existsSync(join(dir, WORK_LOCK_REL))).toBe(false); // lock released
  });

  it('regenerateViews checks every target before writing any: a hand-kept BACKLOG.md stops BUGS.md being created', async () => {
    await put('.planning/BACKLOG.md', '# Backlog\n\n### a hand-kept row\n');
    await put('.planning/work/WORK.md', V2);
    const err = await caught(regenerateViews(dir));
    expect(err?.code).toBe('CONFIG');
    expect(err.message).toContain('.planning/BACKLOG.md');
    expect(existsSync(join(dir, '.planning/BUGS.md'))).toBe(false);
    expect(await read('.planning/BACKLOG.md')).toBe('# Backlog\n\n### a hand-kept row\n');
  });

  it('a hand-kept work/EPICS.md is refused too', async () => {
    await put('.planning/work/EPICS.md', '# my notes\n');
    await put('.planning/work/WORK.md', V2);
    expect((await caught(regenerateViews(dir)))?.code).toBe('CONFIG');
    expect(await read('.planning/work/EPICS.md')).toBe('# my notes\n');
  });

  it('missing lists are fine, and a generated list is regenerated as before', async () => {
    await put('.planning/work/WORK.md', V2);
    await put('.planning/BUGS.md', `${GENERATED_MARKER}\n# Bugs\n\nstale\n`);
    await newItem(dir, { title: 'x', by: 'b', at: '2026-09-29T00:00:00.000Z' }, noGit);
    expect((await read('.planning/BUGS.md')).split('\n')[0]).toBe(GENERATED_MARKER);
    expect(await read('.planning/BUGS.md')).not.toContain('stale');
    expect(await read('.planning/ISSUES-INBOX.md')).toContain('SIG-1');
  });
});

describe('the store-off message points at the migration, not at a hand-made WORK.md', () => {
  it('nextIdV2 and newItem say the store is off and name the migration', async () => {
    await mkdir(join(dir, '.planning'), { recursive: true });
    for (const err of [await caught(Promise.resolve().then(() => nextIdV2(dir))), await caught(newItem(dir, { by: 'b' }))]) {
      expect(err?.code).toBe('CONFIG');
      expect(err.message).toMatch(/store is off/);
      expect(err.message).toContain('/sig:docs-migrate');
      expect(err.message).not.toMatch(/Create it with/);
    }
  });
});
