// M5.E2.S1.t1 — /sig:migrate-memory command shell: arg parse + dry-run default.
//
// FR6.1: dry-run is the default; --apply is required to write. The load-bearing
// AC (proof-of-fail): a no-arg (dry-run) run must touch NOTHING on disk — an
// impl that writes during a dry-run flips an mtime / adds a file and fails.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { parseMigrateArgs, runMigrate } from '../tools/lib/migrate-memory.js';

// Recursive snapshot: path → mtimeMs, so any write (new file OR rewrite of an
// existing one) shows up as a diff.
async function snapshot(dir) {
  const out = {};
  async function walk(d) {
    for (const ent of await readdir(d, { withFileTypes: true })) {
      const p = join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else out[p] = (await stat(p)).mtimeMs;
    }
  }
  await walk(dir);
  return out;
}

describe('M5.E2.S1.t1 parseMigrateArgs', () => {
  it('defaults to dry-run (apply:false, force:false)', () => {
    expect(parseMigrateArgs([])).toEqual({ apply: false, force: false });
  });
  it('--apply sets apply:true', () => {
    expect(parseMigrateArgs(['--apply'])).toEqual({ apply: true, force: false });
  });
  it('--force sets force:true', () => {
    expect(parseMigrateArgs(['--force'])).toEqual({ apply: false, force: true });
  });
  it('--apply --force sets both', () => {
    expect(parseMigrateArgs(['--apply', '--force'])).toEqual({ apply: true, force: true });
  });
  it('ignores unknown flags (no throw)', () => {
    expect(parseMigrateArgs(['--bogus'])).toEqual({ apply: false, force: false });
  });
  it('tolerates non-array input (fail-open to dry-run)', () => {
    expect(parseMigrateArgs(undefined)).toEqual({ apply: false, force: false });
  });
});

describe('M5.E2.S1.t1 runMigrate dry-run writes nothing (FR6.1)', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-migrate-cli-'));
    await mkdir(join(baseDir, '.planning'), { recursive: true });
    await writeFile(
      join(baseDir, '.planning', 'STATE.md'),
      '---\nschema_version: 1\nphase: PLAN\ncurrent_epic: null\ncurrent_tasks: []\ncompleted_phases: []\nblockers: []\n---\n# Project State\n\nbody\n',
      'utf-8',
    );
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('no-arg (dry-run) run touches no .planning/ file and returns a plan', async () => {
    const before = await snapshot(join(baseDir, '.planning'));
    const r = await runMigrate(baseDir); // no opts → dry-run
    const after = await snapshot(join(baseDir, '.planning'));
    expect(after).toEqual(before); // proof-of-fail: any dry-run write flips this
    expect(r.applied).toBe(false);
    expect(r.plan).toBeTruthy();
  });

  it('does not create the .planning/.migrate scratch dir on a no-op dry-run', async () => {
    await runMigrate(baseDir);
    const entries = await readdir(join(baseDir, '.planning'));
    expect(entries).not.toContain('.migrate');
  });

  it('accepts an injectable sense fn (forward-compat with the S1.t6 auto-sense)', async () => {
    const stubPlan = { vectors: ['vector-1'], flags: [], moves: [] };
    const r = await runMigrate(baseDir, { sense: async () => stubPlan });
    expect(r.plan).toEqual(stubPlan);
    expect(r.applied).toBe(false);
  });
});
