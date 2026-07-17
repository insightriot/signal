// M5.E2.S1.t5 — vector-2: relocate a big inlined STATE body → STATE-HISTORY.md.
//
// The E1-by-hand case (STATE.md 64.5 KB → 1 KB): a schema_v1 STATE.md whose
// body is a big inlined historical narrative. Relocate that body BYTE-IDENTICAL
// to STATE-HISTORY.md and leave a one-line pointer, preserving the frontmatter
// VERBATIM (no serializer round-trip). History-first ordering (model:
// upgradeStateFile:189-216) makes a crash between the two writes re-run cleanly.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { relocateInlinedBody } from '../tools/lib/migrate-memory.js';

const BIG_BODY =
  '# Project State\n\n' +
  'A long inlined historical narrative that should live in STATE-HISTORY. '.repeat(40) +
  '\n\n## Old milestone log\n\nlots of accreted detail here\n';
const FRONTMATTER =
  `---\n` +
  `schema_version: 1\n` +
  `phase: PLAN\n` +
  `current_epic: M5.E2\n` +
  `current_tasks: []\n` +
  `completed_phases: []\n` +
  `blockers: []\n` +
  `---\n`;
const STATE_INLINED = FRONTMATTER + BIG_BODY;

async function writeState(baseDir, content) {
  await mkdir(join(baseDir, '.planning'), { recursive: true });
  await writeFile(join(baseDir, '.planning', 'STATE.md'), content, 'utf-8');
}
const read = (baseDir, name = 'STATE.md') =>
  readFile(join(baseDir, '.planning', name), 'utf-8');

describe('M5.E2.S1.t5 relocateInlinedBody', () => {
  let baseDir;
  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'signal-v2-'));
    await writeState(baseDir, STATE_INLINED);
  });
  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('dry-run writes nothing but reports the target + byte count', async () => {
    const before = await read(baseDir);
    const r = await relocateInlinedBody(baseDir, { apply: false });
    expect(await read(baseDir)).toBe(before); // untouched
    expect(r.applied).toBe(false);
    expect(r.historyName).toBe('STATE-HISTORY.md');
    expect(r.bytes).toBe(BIG_BODY.length);
    expect(existsSync(join(baseDir, '.planning', 'STATE-HISTORY.md'))).toBe(false);
  });

  it('apply relocates the body BYTE-IDENTICAL to STATE-HISTORY.md + leaves a pointer', async () => {
    const r = await relocateInlinedBody(baseDir, { apply: true, dateStr: '2026-07-17' });
    expect(r.relocated).toBe(true);
    // STATE-HISTORY.md is byte-identical to the original body.
    expect(await read(baseDir, 'STATE-HISTORY.md')).toBe(BIG_BODY);
    // STATE.md body is now a short pointer.
    const after = await read(baseDir);
    expect(after).toContain('[STATE-HISTORY.md](STATE-HISTORY.md)');
    expect(after.length).toBeLessThan(STATE_INLINED.length);
  });

  it('preserves the frontmatter VERBATIM (no serializer round-trip)', async () => {
    await relocateInlinedBody(baseDir, { apply: true, dateStr: '2026-07-17' });
    const after = await read(baseDir);
    expect(after.startsWith(FRONTMATTER)).toBe(true);
  });

  it('is idempotent — a second apply is a no-op (relocated marker present)', async () => {
    await relocateInlinedBody(baseDir, { apply: true, dateStr: '2026-07-17' });
    const mid = await read(baseDir);
    const r2 = await relocateInlinedBody(baseDir, { apply: true, dateStr: '2026-07-17' });
    expect(r2.relocated).toBe(false);
    expect(await read(baseDir)).toBe(mid);
  });

  it('clobber-guard — a DIFFERENT existing STATE-HISTORY.md is not overwritten (dated sibling)', async () => {
    await writeFile(
      join(baseDir, '.planning', 'STATE-HISTORY.md'),
      'a hand-created history that must survive\n',
      'utf-8',
    );
    await relocateInlinedBody(baseDir, { apply: true, dateStr: '2026-07-17' });
    // Original history untouched…
    expect(await read(baseDir, 'STATE-HISTORY.md')).toBe(
      'a hand-created history that must survive\n',
    );
    // …and the relocated body landed in a dated sibling.
    expect(await read(baseDir, 'STATE-HISTORY-2026-07-17.md')).toBe(BIG_BODY);
    const after = await read(baseDir);
    expect(after).toContain('[STATE-HISTORY-2026-07-17.md](STATE-HISTORY-2026-07-17.md)');
  });

  it('crash re-run — an IDENTICAL existing STATE-HISTORY.md is reused (no dated dup)', async () => {
    // Simulate a crash AFTER the history write but BEFORE the STATE.md pointer
    // write: STATE-HISTORY.md already holds exactly this body.
    await writeFile(join(baseDir, '.planning', 'STATE-HISTORY.md'), BIG_BODY, 'utf-8');
    const r = await relocateInlinedBody(baseDir, { apply: true, dateStr: '2026-07-17' });
    expect(r.relocated).toBe(true);
    // No dated duplicate created — the identical history was reused.
    const files = await readdir(join(baseDir, '.planning'));
    expect(files.filter((f) => /^STATE-HISTORY/.test(f))).toEqual(['STATE-HISTORY.md']);
    // STATE.md was completed to the pointer.
    expect(await read(baseDir)).toContain('[STATE-HISTORY.md](STATE-HISTORY.md)');
  });
});
