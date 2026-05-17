// Tests for the STATE.md schema layer in tools/lib/state.js.
// S1.t3: parseFrontmatter / stringifyFrontmatter / StateSchemaError
// S1.t4: upgradeStateFile (+ legacy fixture)
// S1.t5: readState with strict three-way detection (D14)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  parseFrontmatter,
  stringifyFrontmatter,
  StateSchemaError,
  upgradeStateFile,
  readState,
} from '../tools/lib/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(__dirname, 'fixtures', 'state');

async function setupLegacyFixture(tempDir) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await copyFile(
    join(FIXTURE_ROOT, 'legacy', '.planning', 'STATE.md'),
    join(tempDir, '.planning', 'STATE.md')
  );
}

async function setupSchemaV1Fixture(tempDir) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await copyFile(
    join(FIXTURE_ROOT, 'schema-v1', '.planning', 'STATE.md'),
    join(tempDir, '.planning', 'STATE.md')
  );
}

async function writeInlineState(tempDir, content) {
  await mkdir(join(tempDir, '.planning'), { recursive: true });
  await writeFile(join(tempDir, '.planning', 'STATE.md'), content, 'utf-8');
}

describe('parseFrontmatter', () => {
  it('parses a well-formed frontmatter + body', () => {
    const raw = '---\nschema_version: 1\nphase: EXECUTE\n---\nfreeform body here\n';
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({ schema_version: 1, phase: 'EXECUTE' });
    expect(body).toBe('freeform body here\n');
  });

  it('tolerates CRLF line endings', () => {
    const raw = '---\r\nschema_version: 1\r\nphase: PLAN\r\n---\r\nbody\r\n';
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({ schema_version: 1, phase: 'PLAN' });
    expect(body).toContain('body');
  });

  it('tolerates a missing trailing newline after the closing fence', () => {
    const raw = '---\nschema_version: 1\n---\nbody';
    const { data, body } = parseFrontmatter(raw);
    expect(data).toEqual({ schema_version: 1 });
    expect(body).toBe('body');
  });

  it('returns {data: null, body: raw} when no frontmatter is present', () => {
    const raw = '# Just a freeform markdown file\n\nNothing structured here.\n';
    const result = parseFrontmatter(raw);
    expect(result.data).toBeNull();
    expect(result.body).toBe(raw);
  });

  it('throws StateSchemaError when YAML inside the fence is malformed', () => {
    const raw = '---\nphase: [unterminated\n---\nbody\n';
    expect(() => parseFrontmatter(raw)).toThrow(StateSchemaError);
  });

  it('throws StateSchemaError when YAML is non-mapping (e.g., a list)', () => {
    const raw = '---\n- one\n- two\n---\nbody\n';
    expect(() => parseFrontmatter(raw)).toThrow(StateSchemaError);
  });

  it('throws StateSchemaError when YAML is non-mapping (e.g., empty/null)', () => {
    const raw = '---\n\n---\nbody\n';
    expect(() => parseFrontmatter(raw)).toThrow(StateSchemaError);
  });
});

describe('stringifyFrontmatter', () => {
  it('round-trips losslessly through parseFrontmatter', () => {
    const data = {
      schema_version: 1,
      phase: 'EXECUTE',
      completed_phases: ['CALIBRATE', 'DISCUSS', 'PLAN'],
      current_tasks: [{ id: 'M4.5.E6.S1.t3', startedAt: '2026-05-17T16:00:00Z' }],
    };
    const body = '# Notes\n\nFreeform narrative below the frontmatter.\n';
    const round = parseFrontmatter(stringifyFrontmatter(data, body));
    expect(round.data).toEqual(data);
    expect(round.body).toBe(body);
  });

  it('handles an empty body cleanly', () => {
    const out = stringifyFrontmatter({ schema_version: 1 }, '');
    expect(out).toMatch(/^---\nschema_version: 1\n---\n$/);
    const round = parseFrontmatter(out);
    expect(round.data).toEqual({ schema_version: 1 });
    expect(round.body).toBe('');
  });

  it('handles a single-key data object', () => {
    const out = stringifyFrontmatter({ phase: 'PLAN' }, 'body');
    const round = parseFrontmatter(out);
    expect(round.data).toEqual({ phase: 'PLAN' });
    expect(round.body).toBe('body');
  });
});

describe('StateSchemaError', () => {
  it('is a named subclass of Error', () => {
    const err = new StateSchemaError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(StateSchemaError);
    expect(err.name).toBe('StateSchemaError');
    expect(err.message).toBe('boom');
  });
});

describe('upgradeStateFile (S1.t4)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-upgrade-state-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('returns {upgraded: false} when STATE.md does not exist', async () => {
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    const result = await upgradeStateFile(tempDir);
    expect(result.upgraded).toBe(false);
    expect(result.reason).toBe('no-state-file');
  });

  it('upgrades a legacy STATE.md to schema_version 1 frontmatter', async () => {
    await setupLegacyFixture(tempDir);
    const result = await upgradeStateFile(tempDir);
    expect(result.upgraded).toBe(true);
    expect(result.schemaVersion).toBe(1);

    const content = await readFile(join(tempDir, '.planning', 'STATE.md'), 'utf-8');
    const { data, body } = parseFrontmatter(content);
    expect(data.schema_version).toBe(1);
    expect(data.phase).toBe('EXECUTE');
    expect(data.completed_phases).toEqual([
      'CALIBRATE (2026-05-01)',
      'DISCUSS (2026-05-08)',
      'PLAN (2026-05-15)',
    ]);
    expect(data.current_tasks).toEqual([]);
    expect(data.blockers).toEqual([]);
    // last_updated_commit may be a real sha (running inside the Signal repo)
    // or null if shell-out failed; both shapes are acceptable.
    expect(['string', 'object']).toContain(typeof data.last_updated_commit);
    expect(body.length).toBeGreaterThan(0); // body preserved; tighter test below
  });

  it('preserves original body verbatim beneath an HTML comment marker', async () => {
    await setupLegacyFixture(tempDir);
    const original = await readFile(
      join(FIXTURE_ROOT, 'legacy', '.planning', 'STATE.md'),
      'utf-8'
    );
    await upgradeStateFile(tempDir);
    const content = await readFile(join(tempDir, '.planning', 'STATE.md'), 'utf-8');
    const { body } = parseFrontmatter(content);
    // HTML comment marker introduces the preserved-content block
    expect(body).toMatch(/<!--[\s\S]*preserved verbatim[\s\S]*-->/);
    // Every line of the original file appears in the migrated body
    for (const line of original.split('\n')) {
      if (line.trim()) expect(body).toContain(line);
    }
  });

  it('is idempotent — re-calling on an already-upgraded file is a no-op', async () => {
    await setupLegacyFixture(tempDir);
    const r1 = await upgradeStateFile(tempDir);
    expect(r1.upgraded).toBe(true);
    const after1 = await readFile(join(tempDir, '.planning', 'STATE.md'), 'utf-8');

    const r2 = await upgradeStateFile(tempDir);
    expect(r2.upgraded).toBe(false);
    expect(r2.reason).toBe('already-frontmatter');
    const after2 = await readFile(join(tempDir, '.planning', 'STATE.md'), 'utf-8');
    expect(after2).toBe(after1);
  });

  it('writes a one-time notice to stderr on upgrade', async () => {
    await setupLegacyFixture(tempDir);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      await upgradeStateFile(tempDir);
      const calls = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(calls).toContain('STATE.md');
      expect(calls).toMatch(/schema_version[^\n]*1/);
    } finally {
      stderrSpy.mockRestore();
    }
  });

  it('defaults phase to EXECUTE when "## Current Phase" is absent', async () => {
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    await writeFile(
      join(tempDir, '.planning', 'STATE.md'),
      '# Project State\n\nNo phase heading anywhere.\n',
      'utf-8'
    );
    await upgradeStateFile(tempDir);
    const content = await readFile(join(tempDir, '.planning', 'STATE.md'), 'utf-8');
    const { data } = parseFrontmatter(content);
    expect(data.phase).toBe('EXECUTE');
  });

  it('parses an empty Completed Phases section as []', async () => {
    await mkdir(join(tempDir, '.planning'), { recursive: true });
    await writeFile(
      join(tempDir, '.planning', 'STATE.md'),
      '# Project State\n\n## Current Phase\nDISCUSS\n\n## Completed Phases\n(none)\n',
      'utf-8'
    );
    await upgradeStateFile(tempDir);
    const content = await readFile(join(tempDir, '.planning', 'STATE.md'), 'utf-8');
    const { data } = parseFrontmatter(content);
    expect(data.phase).toBe('DISCUSS');
    expect(data.completed_phases).toEqual([]);
  });
});

describe('readState — three-way schema detection (S1.t5)', () => {
  let tempDir;
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'signal-readstate-test-'));
  });
  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  // D14 Case 0 (pre-existing contract): file absent → null.
  it('returns null when STATE.md does not exist', async () => {
    expect(await readState(tempDir)).toBeNull();
  });

  // D14 Case 1: frontmatter + schema_version: 1 → returns parsed data.
  it('parses a schema_version: 1 file and exposes both snake_case and camelCase fields', async () => {
    await setupSchemaV1Fixture(tempDir);
    const state = await readState(tempDir);
    expect(state).not.toBeNull();
    expect(state._schema).toBe(1);
    expect(state.schema_version).toBe(1);
    expect(state.phase).toBe('EXECUTE');
    expect(state.current_epic).toBe('M4.5.E6');
    expect(state.completed_phases).toEqual([
      'CALIBRATE (2026-05-01)',
      'DISCUSS (2026-05-08)',
      'PLAN (2026-05-15)',
    ]);
    // Back-compat aliases for code written against the legacy shape.
    expect(state.completedPhases).toEqual(state.completed_phases);
    expect(state.lastUpdated).toBe(state.last_updated);
  });

  // D14 Case 2: newer schema_version → fail closed.
  it('throws StateSchemaError when schema_version is unknown (newer)', async () => {
    await writeInlineState(
      tempDir,
      '---\nschema_version: 999\nphase: EXECUTE\n---\nbody\n'
    );
    await expect(readState(tempDir)).rejects.toThrow(StateSchemaError);
    await expect(readState(tempDir)).rejects.toThrow(/newer Signal version/);
  });

  // D14 Case 3: no frontmatter → legacy parse + _schema sentinel.
  it('returns _schema: "legacy" + legacy-parsed fields when frontmatter is absent', async () => {
    await setupLegacyFixture(tempDir);
    const state = await readState(tempDir);
    expect(state._schema).toBe('legacy');
    expect(state.phase).toBe('EXECUTE');
    expect(state.completedPhases).toEqual([
      'CALIBRATE (2026-05-01)',
      'DISCUSS (2026-05-08)',
      'PLAN (2026-05-15)',
    ]);
    expect(state.lastUpdated).toBe('2026-05-16');
  });

  // D14 Case 4: frontmatter present but no schema_version → refuse to auto-upgrade.
  it('throws StateSchemaError when frontmatter exists but schema_version is missing', async () => {
    await writeInlineState(
      tempDir,
      '---\nphase: EXECUTE\ncompleted_phases: []\n---\nbody\n'
    );
    await expect(readState(tempDir)).rejects.toThrow(StateSchemaError);
    await expect(readState(tempDir)).rejects.toThrow(/schema_version/);
    await expect(readState(tempDir)).rejects.toThrow(/refusing to auto-upgrade/i);
  });
});
