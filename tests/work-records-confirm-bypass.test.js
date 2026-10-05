// confirmCloses guards the proof itself, not only through the schema
// (M6.E13.S2.t2.6, AC7.2). See .planning/M6.E13-VALIDATION.md row AC7.2.
//
// The schema already rejects a close request whose proof is not a commit hash,
// so such a record is broken and never read. This file removes that layer —
// `parseRecord` is replaced with one that validates nothing — to prove that a
// record which got past it (a future schema bug, a hand edit that slipped by)
// still never puts its proof in front of git as an option.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../plugin/tools/lib/work-record.js', async (importOriginal) => {
  const real = await importOriginal();
  return { ...real, parseRecord: (text) => ({ record: JSON.parse(text), errors: [] }) };
});

const records = await import('../plugin/tools/lib/work-records.js');

const AT = '2026-10-04T10:00:00.000Z';
const by = 'claude';

let base;
beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'sig-confirm-bypass-'));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function put(rel, content) {
  const p = join(base, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, content, 'utf-8');
}

describe('a proof that bypassed the schema', () => {
  for (const proof of ['--all', '-p', 'HEAD', 'main', '0123abc --all', 'ABCDEF0', '0123abc^{tree}']) {
    it(`${JSON.stringify(proof)} stays closing, and git never sees it`, async () => {
      await put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
      const record = {
        id: 'SIG-1',
        type: 'BUG',
        title: 't',
        events: [{ type: 'created', at: AT, by }, { type: 'close_requested', at: AT, by, reason: 'fixed', proof }],
      };
      await put(records.recordPath('SIG-1'), `${JSON.stringify(record, null, 2)}\n`);
      const calls = [];
      const execFn = (cmd, args) => {
        calls.push(args);
        if (args.includes('--is-inside-work-tree')) return 'true\n';
        if (args[0] === 'remote') return 'origin\n';
        if (args.includes('origin/HEAD')) return 'origin/main\n';
        return '';
      };
      const out = await records.confirmCloses(base, { now: AT, execFn });
      expect(out.confirmed).toEqual([]);
      expect(out.stillClosing).toEqual([{ id: 'SIG-1', reason: 'invalid-proof' }]);
      // Proofs are checked before git is asked anything, so an invalid one costs no git call at all.
      expect(calls).toEqual([]);
    });
  }
});
