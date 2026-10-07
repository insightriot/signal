// SIG-280 items (1)–(5), M6.E14 S7: the residue of M6.E13 REVIEW pass 2.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

import * as records from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { checkWorkStore, confirmClosesInSweep } from '../plugin/tools/lib/sweep.js';

const AT = '2026-10-07T10:00:00.000Z';
const by = 'claude';
const created = { type: 'created', at: AT, by };
const triaged = { type: 'triaged', at: AT, by };
const noGit = () => {
  throw new Error('not a repo');
};

let base;
async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-store-residue-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
  await put(records.recordPath('SIG-1'), serializeRecord({ id: 'SIG-1', type: 'BUG', title: 'ok', events: [created, triaged] }));
  await put(records.recordPath('SIG-2'), '<<<<<<< HEAD\n{ "id": "SIG-2" }\n=======\n{ "id": "SIG-2", "x": 1 }\n>>>>>>> other\n');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('a broken record: the remedy (AC5.1) and the read-only path (AC5.2)', () => {
  it('the refusal names git checkout --ours/--theirs for a conflicted record', async () => {
    const err = await records.confirmCloses(base, { execFn: noGit }).catch((e) => e);
    expect(err.code).toBe('SCHEMA');
    expect(err.message).toMatch(/git checkout --ours <path>/);
    expect(err.message).toMatch(/--theirs <path>/);
    expect(err.message).toMatch(/nothing was written/i);
  });

  it('probeCloses (read-only, /sig:resume) makes no claim about writing', () => {
    let err;
    try {
      records.probeCloses(base, { execFn: noGit });
    } catch (e) {
      err = e;
    }
    expect(err?.code).toBe('SCHEMA');
    expect(err.message).toMatch(/SIG-2/);
    expect(err.message).not.toMatch(/written/i);
  });

  it('ship.md §6.8 names --ours/--theirs and says plain checkout needs a good HEAD copy', () => {
    const ship = readFileSync('plugin/commands/ship.md', 'utf-8');
    const line = ship.split('\n').find((l) => l.startsWith('6. **`SCHEMA` → HALT.**'));
    expect(line).toMatch(/git checkout --ours <path>/);
    expect(line).toMatch(/--theirs <path>/);
    expect(line).toMatch(/HEAD/);
  });
});

describe('docs-sweep.md names the same remedy (AC5.1, VERIFY loop 1)', () => {
  it('names --ours/--theirs and says plain checkout needs a good HEAD copy', () => {
    const sweep = readFileSync('plugin/commands/docs-sweep.md', 'utf-8');
    const at = sweep.indexOf('except a broken record');
    expect(at).toBeGreaterThan(-1);
    const sentence = sweep.slice(at, at + 400);
    expect(sentence).toMatch(/git checkout --ours <path>/);
    expect(sentence).toMatch(/--theirs <path>/);
    expect(sentence).toMatch(/HEAD/);
  });
});

describe('the sweep reports a broken record once (AC5.3)', () => {
  it('checkWorkStore names it; the closes check does not repeat it', async () => {
    const store = checkWorkStore(base);
    expect(store.filter((f) => /SIG-2/.test(f.message) || /SIG-2/.test(f.file))).not.toEqual([]);
    const closes = await confirmClosesInSweep(base, { execFn: noGit });
    expect(closes.filter((f) => /SIG-2/.test(f.message))).toEqual([]);
  });
});

describe('confirmCloses documents NOT_FOUND (AC5.4)', () => {
  it('its @throws lists NOT_FOUND', () => {
    const src = readFileSync('plugin/tools/lib/work-records.js', 'utf-8');
    const at = src.indexOf('export async function confirmCloses(');
    const doc = src.slice(src.lastIndexOf('/**', at), at);
    expect(doc).toMatch(/@throws[^\n]*NOT_FOUND/);
  });
});

describe('VERIFY loop 1 — what a refusal tells you to do', () => {
  it('a write refused over a broken record names the git remedy, and does not say "afterwards"', async () => {
    const err = await records.newItem(base, { title: 'x', by, at: AT }, { execFn: noGit }).catch((e) => e);
    expect(err.code).toBe('SCHEMA');
    expect(err.message).toMatch(/^nothing was written/);
    expect(err.message).toMatch(/git checkout --ours <path>/);
    expect(err.message).not.toMatch(/afterwards/);
  });

  it('confirm-time output says what to do about an ambiguous proof (SIG-276)', async () => {
    const { formatConfirmClosesLine } = await import('../plugin/tools/lib/close-confirm.js');
    const line = formatConfirmClosesLine({ confirmed: [], stillClosing: [{ id: 'SIG-1', reason: 'ambiguous-proof' }], stale: [] });
    expect(line).toMatch(/SIG-1: ambiguous-proof/);
    expect(line).toMatch(/longer hash/);
    expect(formatConfirmClosesLine({ confirmed: [], stillClosing: [{ id: 'SIG-1', reason: 'unknown-commit' }], stale: [] }))
      .not.toMatch(/longer hash/);
  });
});
