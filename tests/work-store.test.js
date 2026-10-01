// Tests for the work store's opt-in switch (M6.E11.S1.t1.2, FR-1).
// See .planning/M6.E11-VALIDATION.md rows AC-1.1 and AC-1.3.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  WORK_DIR,
  WORK_FILE,
  STORE_KEY_RE,
  FOLDERS,
  isStoreOn,
} from '../plugin/tools/lib/work-store.js';
import { WorkStoreError } from '../plugin/tools/lib/work-item.js';

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-work-store-'));
  await mkdir(join(base, '.planning'), { recursive: true });
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function plantWorkMd(content) {
  await mkdir(join(base, '.planning', 'work'), { recursive: true });
  await writeFile(join(base, '.planning', 'work', 'WORK.md'), content, 'utf-8');
}

function expectConfigError(fn, pattern) {
  let err;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(WorkStoreError);
  expect(err.code).toBe('CONFIG');
  expect(err.message).toMatch(/\.planning\/work\/WORK\.md/);
  expect(err.message).toMatch(/key: SIG/); // the fix, spelled out
  if (pattern) expect(err.message).toMatch(pattern);
}

describe('constants', () => {
  it('names the store layout', () => {
    expect(WORK_DIR).toBe('work');
    expect(WORK_FILE).toBe('WORK.md');
    expect(FOLDERS).toEqual({ inbox: 'inbox', backlog: 'backlog', epics: 'epics', done: 'done' });
  });
  it.each(['SIG', 'AB', 'A1B2C3D4E5'])('key %s is valid', (k) => expect(STORE_KEY_RE.test(k)).toBe(true));
  it.each(['S', 'sig', '1SIG', 'ABCDEFGHIJK', 'SI-G'])('key %s is invalid', (k) =>
    expect(STORE_KEY_RE.test(k)).toBe(false)
  );
});

describe('isStoreOn — AC-1.1: on iff WORK.md has a valid key', () => {
  it('no .planning/work at all → off', () => {
    expect(isStoreOn(base)).toEqual({ on: false });
  });

  it('a work/ folder without WORK.md → off', async () => {
    await mkdir(join(base, '.planning', 'work', 'inbox'), { recursive: true });
    expect(isStoreOn(base)).toEqual({ on: false });
  });

  it('WORK.md with a valid key → on, with the key', async () => {
    await plantWorkMd('---\nkey: SIG\nschema_version: 1\n---\n# Work store\n');
    expect(isStoreOn(base)).toEqual({ on: true, key: 'SIG' });
  });
});

describe('isStoreOn — AC-1.3: a broken WORK.md fails loudly, never falls back', () => {
  it('missing key', async () => {
    await plantWorkMd('---\nschema_version: 1\n---\n');
    expectConfigError(() => isStoreOn(base), /no `key`|missing/i);
  });

  it('lowercase key', async () => {
    await plantWorkMd('---\nkey: sig\n---\n');
    expectConfigError(() => isStoreOn(base), /sig/);
  });

  it('numeric key (YAML core schema reads it as a number)', async () => {
    await plantWorkMd('---\nkey: 123\n---\n');
    expectConfigError(() => isStoreOn(base), /123/);
  });

  it('no frontmatter at all', async () => {
    await plantWorkMd('# just a heading\n');
    expectConfigError(() => isStoreOn(base), /frontmatter/);
  });

  it('malformed YAML', async () => {
    await plantWorkMd('---\nkey: [SIG\n---\n');
    expectConfigError(() => isStoreOn(base));
  });

  it('empty file', async () => {
    await plantWorkMd('');
    expectConfigError(() => isStoreOn(base));
  });
});
