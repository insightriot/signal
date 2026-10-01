// REVIEW pass 3 — the store-on backlog discharge ignored what `closeItems`
// returned. `closeItems` answers `{aborted: 'sensitive-data-pending'}` without
// closing anything, and `dischargeInStore` still reported `written: true` —
// a SHIP would record discharges that never happened. The discharge passes
// `acknowledgeSensitive: true` today, so this path is reached only if that
// changes; the mock stands in for it.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('../plugin/tools/lib/work-ops.js', async (importOriginal) => ({
  ...(await importOriginal()),
  closeItems: async () => ({ aborted: 'sensitive-data-pending', sensitiveHits: [{ kind: 'test' }] }),
}));

const { dischargeBacklogRows } = await import('../plugin/tools/lib/backlog.js');
const { getItem } = await import('../plugin/tools/lib/work-ops.js');

let root;
async function put(rel, text) {
  const abs = join(root, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text, 'utf-8');
}
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'sig-discharge-aborted-'));
  await put('.planning/work/WORK.md', '---\nkey: SIG\n---\n# Work store\n');
  await put('.planning/work/backlog/SIG-1.md',
    '---\nid: SIG-1\ntype: FEAT\nstatus: T\ntitle: the widget\ncreated:\n  at: 2026-09-01T00:00:00.000Z\n  by: b\n---\nbody\n');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('dischargeBacklogRows (store on) — an aborted close is not a write', () => {
  it('closeItems aborts → written: false, the abort passed through, the item still open', async () => {
    const r = await dischargeBacklogRows(root, { rows: ['widget'], by: 'M9.E9' });
    expect(r.written).toBe(false);
    expect(r).toMatchObject({ aborted: 'sensitive-data-pending', sensitiveHits: [{ kind: 'test' }] });
    expect(getItem(root, 'SIG-1').item.status).toBe('T');
  });
});
