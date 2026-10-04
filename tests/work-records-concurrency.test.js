// M6.E13 REVIEW pass 1 suggestion — one real two-writer test of the `work` lock.
//
// The lock tests elsewhere park takers at seams; this one only starts several
// captures at once, through the public entry point, and checks what the store
// ends with. The lock fails fast (no waiting), so each capture either ran
// alone under the lock or was refused with LOCKED. Whatever the interleaving:
// every success has its own ID, every refusal is the lock's, and the store
// holds exactly the successes, each valid, with fresh views.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

import * as records from '../plugin/tools/lib/work-records.js';

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-records-concurrent-'));
  const p = join(base, '.planning/work/WORK.md');
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, '---\nkey: SIG\nschema_version: 2\n---\n', 'utf-8');
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('newItem × N at once (the work lock, for real)', () => {
  it('no duplicate IDs: each capture succeeds alone or is refused LOCKED; the store holds exactly the successes', async () => {
    const N = 6;
    const settled = await Promise.allSettled(
      Array.from({ length: N }, (_, i) => records.newItem(base, { type: 'FEAT', title: `capture ${i}`, by: 'claude' })),
    );
    const ok = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
    const refused = settled.filter((s) => s.status === 'rejected').map((s) => s.reason);

    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((e) => e.id)).size).toBe(ok.length);
    for (const err of refused) expect(err, String(err?.message)).toMatchObject({ code: 'LOCKED' });

    const { records: onDisk, broken } = records.listRecords(base);
    expect(broken).toEqual([]);
    expect(onDisk.map((r) => r.id).sort()).toEqual(ok.map((e) => e.id).sort());
    expect(onDisk.map((r) => r.record.title).sort()).toEqual(ok.map((e) => e.record.title).sort());
    expect(records.findDuplicateIds(base)).toEqual([]);
    expect(records.checkRecords(base)).toEqual([]);

    // REVIEW pass 2: the lock was released — a further capture succeeds.
    const after = await records.newItem(base, { type: 'FEAT', title: 'after', by: 'claude' });
    expect(ok.map((e) => e.id)).not.toContain(after.id);
    expect(records.listRecords(base).records).toHaveLength(ok.length + 1);
  });
});

// REVIEW pass 2: two OS processes, not one event loop — the lock file is the
// only thing between them. Each process starts at the same instant and tries
// several captures; every attempt succeeds or is refused LOCKED.
const LIB_URL = pathToFileURL(join(process.cwd(), 'plugin/tools/lib/work-records.js')).href;
const CHILD = `
const { newItem } = await import(process.env.LIB_URL);
const startAt = Number(process.env.START_AT);
while (Date.now() < startAt) { /* spin: start together */ }
const out = [];
for (let i = 0; i < 5; i++) {
  try {
    out.push({ id: (await newItem(process.env.BASE, { type: 'FEAT', title: process.env.TAG + ' ' + i, by: 'claude' })).id });
  } catch (err) {
    out.push({ code: err.code ?? 'THROW', message: err.message });
  }
}
process.stdout.write(JSON.stringify(out));
`;

function child(tag, startAt) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--input-type=module', '-e', CHILD], {
      env: { ...process.env, LIB_URL, BASE: base, TAG: tag, START_AT: String(startAt) },
    });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(`child ${tag} exited ${code}: ${err}`))));
  });
}

describe('newItem from two processes at once (the work lock across processes)', () => {
  it('no duplicate IDs; each attempt succeeds or is LOCKED; the store holds exactly the successes; a later write succeeds', async () => {
    const startAt = Date.now() + 1500; // both children are loaded by then
    const results = (await Promise.all([child('a', startAt), child('b', startAt)])).flat();
    const ok = results.filter((r) => r.id);
    for (const r of results.filter((x) => !x.id)) expect(r, r.message).toMatchObject({ code: 'LOCKED' });
    expect(ok.length).toBeGreaterThanOrEqual(1);
    expect(new Set(ok.map((r) => r.id)).size).toBe(ok.length);

    const { records: onDisk, broken } = records.listRecords(base);
    expect(broken).toEqual([]);
    expect(onDisk.map((r) => r.id).sort()).toEqual(ok.map((r) => r.id).sort());
    expect(records.findDuplicateIds(base)).toEqual([]);
    expect(records.checkRecords(base)).toEqual([]);

    const after = await records.newItem(base, { type: 'FEAT', title: 'after', by: 'claude' });
    expect(ok.map((r) => r.id)).not.toContain(after.id);
  }, 20000);
});
