// confirmCloses guards a UNIT's proof itself, not only through the schema
// (M6.E16 REVIEW pass 1, T-S4; AC4.2). See .planning/M6.E16-VALIDATION.md row
// "T-S4". The mirror of tests/work-records-confirm-bypass.test.js, which does
// this for an item.
//
// The unit schema already rejects a close request whose proof is not a commit
// hash, so such a record is broken and never read. This file removes that
// layer — the unit kind's `parseRecord` is replaced with one that validates
// nothing — to prove that a unit record which got past it (a future schema
// bug, a hand edit that slipped by) still never puts its proof in front of
// git as an option.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../plugin/tools/lib/unit-record.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, UNIT_KIND: { ...real.UNIT_KIND, parseRecord: (text) => ({ record: JSON.parse(text), errors: [] }) } };
});

const records = await import('../plugin/tools/lib/work-records.js');
const units = await import('../plugin/tools/lib/unit-records.js');

const AT = '2026-10-04T10:00:00.000Z';
const by = 'claude';
const REL = '.planning/work/units/M7.E3.json';

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-unit-confirm-bypass-'));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

describe('a unit\'s proof that bypassed the schema', () => {
  it('the layer really is off: a unit whose proof is not a hash lists as closing, not as broken', async () => {
    await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
    await put(REL, `${JSON.stringify({ id: 'M7.E3', events: [{ type: 'opened', at: AT, by }, { type: 'close_requested', at: AT, by, proof: '--all' }] }, null, 2)}\n`);
    const listed = units.listUnits(base);
    expect(listed.broken).toEqual([]);
    expect(listed.units.map((u) => [u.id, u.status, u.closing_proof])).toEqual([['M7.E3', 'closing', '--all']]);
  });

  for (const proof of ['--all', '-p', 'HEAD', 'main', '0123abc --all', 'ABCDEF0', '0123abc^{tree}', '', 7, null]) {
    it(`${JSON.stringify(proof)} stays closing, and git never sees it`, async () => {
      await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
      const text = `${JSON.stringify({ id: 'M7.E3', events: [{ type: 'opened', at: AT, by }, { type: 'close_requested', at: AT, by, proof }] }, null, 2)}\n`;
      await put(REL, text);
      const calls = [];
      const execFn = (cmd, args) => {
        calls.push(args);
        if (args.includes('--is-inside-work-tree')) return 'true\n';
        if (args[0] === 'remote') return 'origin\n';
        if (args.includes('origin/HEAD')) return 'origin/main\n';
        return '';
      };
      const out = await records.confirmCloses(base, { now: AT, execFn });
      expect(out.units.confirmed).toEqual([]);
      expect(out.units.stillClosing).toEqual([{ id: 'M7.E3', reason: 'invalid-proof' }]);
      // Proofs are checked before git is asked anything, so an invalid one costs no git call at all.
      expect(calls).toEqual([]);
      expect(await readFile(join(base, REL), 'utf-8')).toBe(text);
      // The read-only probe (`reportCloses`' source) says the same, and asks git nothing either.
      const probe = records.probeCloses(base, { now: AT, execFn });
      expect(probe.units.confirmable).toEqual([]);
      expect(probe.units.stillClosing).toEqual([{ id: 'M7.E3', reason: 'invalid-proof' }]);
      expect(calls).toEqual([]);
    });
  }
});
