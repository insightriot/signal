// FR2 (v0.1.6): read-time STATE.md size banner. Detect + flag only — eviction
// of an already-bloated file is M5. Tests use controlled-size fixtures, NEVER
// the live .planning/STATE.md (whose size crosses the threshold as the project
// grows — a live-file assertion would start failing on its own).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  detectStateSize,
  readStateSize,
  formatStateSizeBanner,
  STATE_SIZE_WARN_BYTES,
} from '../tools/lib/state.js';

const KB = 1024;

describe('detectStateSize (FR2, pure)', () => {
  it('AC2.3 returns null under the threshold', () => {
    expect(detectStateSize(50 * KB, 150 * KB)).toBeNull();
  });

  it('AC2.2 returns null for Signal-sized (~62 KB) under the 150 KB default', () => {
    expect(detectStateSize(62 * KB)).toBeNull();
    expect(STATE_SIZE_WARN_BYTES).toBe(150 * KB);
  });

  it('AC2.1 returns a finding over the threshold, pointing at M5 eviction', () => {
    const f = detectStateSize(200 * KB, 150 * KB);
    expect(f).not.toBeNull();
    expect(f.bytes).toBe(200 * KB);
    expect(f.message).toMatch(/M5/);
  });

  it('is exclusive at the boundary (exactly at threshold → null)', () => {
    expect(detectStateSize(150 * KB, 150 * KB)).toBeNull();
  });
});

describe('readStateSize + formatStateSizeBanner (FR2, read-only)', () => {
  let dir;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sig-size-'));
    await mkdir(join(dir, '.planning'), { recursive: true });
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const bigState = '---\nschema_version: 1\n---\n' + 'x'.repeat(200 * KB);

  it('AC2.4 returns null when no STATE.md exists', () => {
    expect(readStateSize(dir)).toBeNull();
  });

  it('AC2.3 returns null for a small STATE.md', async () => {
    await writeFile(join(dir, '.planning', 'STATE.md'), '---\nschema_version: 1\n---\nbody\n');
    expect(readStateSize(dir)).toBeNull();
  });

  it('AC2.1 returns a finding for an over-budget STATE.md', async () => {
    await writeFile(join(dir, '.planning', 'STATE.md'), bigState);
    const f = readStateSize(dir);
    expect(f).not.toBeNull();
    expect(formatStateSizeBanner(f)).toMatch(/STATE\.md/);
  });

  it('AC2.4 is read-only — no mtime change', async () => {
    const p = join(dir, '.planning', 'STATE.md');
    await writeFile(p, bigState);
    const before = (await stat(p)).mtimeMs;
    readStateSize(dir);
    const after = (await stat(p)).mtimeMs;
    expect(after).toBe(before);
  });

  it('formatStateSizeBanner returns null for a null finding', () => {
    expect(formatStateSizeBanner(null)).toBeNull();
  });
});
