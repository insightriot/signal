// REVIEW pass 1, I1 — the generator must never overwrite a hand-kept list.
//
// With `.planning/work/WORK.md` present, every mutation regenerates the four
// lists. On a project whose lists are still hand-kept (WORK.md created by
// hand instead of by the migration), that regeneration used to replace them
// wholesale — reproduced: `BUGS.md` → 0 total. The guard refuses BEFORE the
// item is written, so nothing half-happens.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import { newItem, WORK_LOCK_REL } from '../plugin/tools/lib/work-ops.js';
import { generateAll, GENERATED_MARKER } from '../plugin/tools/lib/work-generate.js';
import { nextId } from '../plugin/tools/lib/work-store.js';
import { WorkStoreError } from '../plugin/tools/lib/work-item.js';

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

describe('a hand-kept list with the store switched on by hand', () => {
  it('newItem refuses with CONFIG before writing the item, and BUGS.md is untouched', async () => {
    await put('.planning/BUGS.md', HAND_BUGS);
    await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n');
    const err = await caught(newItem(dir, { title: 'x', by: 'b', at: '2026-09-29T00:00:00.000Z' }));
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('CONFIG');
    expect(err.message).toContain('.planning/BUGS.md');
    expect(err.message).toContain('node tools/work-migrate.mjs');
    expect(await read('.planning/BUGS.md')).toBe(HAND_BUGS);
    expect(existsSync(join(dir, '.planning/work/inbox'))).toBe(false); // no item
    expect(existsSync(join(dir, '.planning/ISSUES-INBOX.md'))).toBe(false); // no list either
    expect(existsSync(join(dir, WORK_LOCK_REL))).toBe(false); // lock released
  });

  it('generateAll checks every target before writing any: a hand-kept BACKLOG.md stops BUGS.md being created', async () => {
    await put('.planning/BACKLOG.md', '# Backlog\n\n### a hand-kept row\n');
    await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n');
    const err = await caught(generateAll(dir));
    expect(err?.code).toBe('CONFIG');
    expect(err.message).toContain('.planning/BACKLOG.md');
    expect(existsSync(join(dir, '.planning/BUGS.md'))).toBe(false);
    expect(await read('.planning/BACKLOG.md')).toBe('# Backlog\n\n### a hand-kept row\n');
  });

  it('a hand-kept work/EPICS.md is refused too', async () => {
    await put('.planning/work/EPICS.md', '# my notes\n');
    await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n');
    expect((await caught(generateAll(dir)))?.code).toBe('CONFIG');
    expect(await read('.planning/work/EPICS.md')).toBe('# my notes\n');
  });

  it('missing lists are fine, and a generated list is regenerated as before', async () => {
    await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n');
    await put('.planning/BUGS.md', `${GENERATED_MARKER}\n# Bugs\n\nstale\n`);
    await newItem(dir, { title: 'x', by: 'b', at: '2026-09-29T00:00:00.000Z' });
    expect((await read('.planning/BUGS.md')).split('\n')[0]).toBe(GENERATED_MARKER);
    expect(await read('.planning/BUGS.md')).not.toContain('stale');
    expect(await read('.planning/ISSUES-INBOX.md')).toContain('SIG-1');
  });
});

describe('the store-off message points at the migration, not at a hand-made WORK.md', () => {
  it('nextId and newItem say the store is off and name the migration', async () => {
    await mkdir(join(dir, '.planning'), { recursive: true });
    for (const err of [await caught(Promise.resolve().then(() => nextId(dir))), await caught(newItem(dir, { by: 'b' }))]) {
      expect(err?.code).toBe('CONFIG');
      expect(err.message).toMatch(/store is off/);
      expect(err.message).toContain('node tools/work-migrate.mjs');
      expect(err.message).toContain('/sig:docs-migrate');
      expect(err.message).not.toMatch(/Create it with/);
    }
  });
});
