// The inbox status line (M6.E11 REVIEW I8).
//
// This file tested the v1 generator (`work-generate.js` `generateFiles`,
// `generateAll`, M6.E11.S2 t2.3, AC-7.1); M6.E13 t7.4 retired it with the v1
// store — the views are rendered from records by `work-views.js`, tested in
// work-views*.test.js. What stays is the one-formatter/one-parser pin, with
// its last case on the v2 views.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { recordPath } from '../plugin/tools/lib/work-records.js';
import { serializeRecord } from '../plugin/tools/lib/work-record.js';
import { regenerateToMemory } from '../plugin/tools/lib/work-views.js';

// REVIEW I8: the generator writes the inbox status line and backlog.js's
// promote reads it back to find the item. Two hand-kept copies of one format
// let a one-sided edit make promote silently capture a twin; one formatter
// and one parser, in the leaf module both already import, cannot drift.
describe('the inbox status line — one formatter, one parser (REVIEW I8)', () => {
  it('round-trips every ID shape, with and without the key', async () => {
    const { formatInboxStatusLine } = await import('../plugin/tools/lib/work-marker.js');
    // The parser moved to legacy-lists.js (M6.E13 t4.1); work-marker.js no longer re-exports it.
    const { parseInboxStatusLine } = await import('../plugin/tools/lib/legacy-lists.js');
    for (const id of ['SIG-1', 'SIG-412', 'AB-9', 'A1-10', 'ABCDEFGHIJ-123456']) {
      const line = formatInboxStatusLine({ id, status: 'N' });
      const key = id.slice(0, id.lastIndexOf('-'));
      expect(parseInboxStatusLine(line)).toBe(id);
      expect(parseInboxStatusLine(line, key)).toBe(id);
      expect(parseInboxStatusLine(`${line}\r`, key)).toBe(id);
      expect(parseInboxStatusLine(`${line}  `, key)).toBe(id);
      expect(parseInboxStatusLine(line, key === 'SIG' ? 'XY' : 'SIG')).toBeNull();
    }
  });

  it('reads nothing that is not the line', async () => {
    const { parseInboxStatusLine } = await import('../plugin/tools/lib/legacy-lists.js');
    for (const line of ['', '**Status:** untriaged (N) · SIG-0', '**Status:** untriaged (N) · sig-1',
      '**Status:** open · SIG-1', 'x **Status:** untriaged (N) · SIG-1', '**Status:** untriaged (N) · SIG-1 extra']) {
      expect(parseInboxStatusLine(line, 'SIG')).toBeNull();
    }
  });

  it('the generated inbox carries exactly the formatter\'s line for each N capture', async () => {
    const { formatInboxStatusLine } = await import('../plugin/tools/lib/work-marker.js');
    const dir = mkdtempSync(join(tmpdir(), 'sig-status-line-'));
    try {
      const put = (rel, text) => {
        mkdirSync(dirname(join(dir, rel)), { recursive: true });
        writeFileSync(join(dir, rel), text, 'utf-8');
      };
      put('.planning/work/WORK.md', '---\nkey: SIG\nschema_version: 2\n---\n');
      const created = { type: 'created', at: '2026-09-01T00:00:00.000Z', by: 'b' };
      for (const [id, type] of [['SIG-1', 'NEW'], ['SIG-2', 'NEW'], ['SIG-3', 'BUG']]) {
        put(recordPath(id), serializeRecord({ id, type, title: `t ${id}`, events: [created] }));
      }
      const inbox = regenerateToMemory(dir)['.planning/ISSUES-INBOX.md'].split('\n');
      for (const id of ['SIG-1', 'SIG-2']) expect(inbox).toContain(formatInboxStatusLine({ id, status: 'N' }));
      expect(inbox).not.toContain(formatInboxStatusLine({ id: 'SIG-3', status: 'N' }));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
