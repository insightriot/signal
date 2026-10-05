// Tests for serializeRecord / parseRecord (M6.E13.S1.t1.2).
// See .planning/M6.E13-PLAN.md Decision 8 and .planning/M6.E13-VALIDATION.md row AC1.2.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

import { serializeRecord, parseRecord } from '../plugin/tools/lib/work-record.js';
import { WorkStoreError } from '../plugin/tools/lib/work-errors.js';

const AT = '2026-10-04T10:00:00.000Z';

// Every top-level field and every event shape, keys deliberately scrambled.
function scrambled() {
  return {
    events: [
      { by: 'claude', at: AT, type: 'created' },
      { at: AT, type: 'triaged', by: 'claude' },
      { epic: 'M6.E13', by: 'claude', type: 'queued', at: AT },
      { type: 'started', epic: 'M6.E13', at: AT, by: 'claude' },
      { proof: '0123abc', reason: 'fixed', type: 'close_requested', by: 'claude', at: AT },
      { legacy: true, dup_of: 'SIG-7', proof: 'same', reason: 'dup', by: 'x', at: AT, type: 'closed' },
      { reason: 'again', type: 'reopened', at: AT, by: 'brett' },
      {
        changes: { title: { to: 'Café — 日本', from: 'old' }, priority: { to: 'P1', from: null } },
        by: 'claude',
        at: AT,
        type: 'edited',
      },
    ],
    migration_note: 'note',
    keep_because: 'kept',
    legacy_id: 'B9',
    source_ref: 'BUGS.md',
    source: '/sig:item',
    priority: 'P1',
    theme: 'work-store',
    title: 'Café — 日本',
    type: 'BUG',
    id: 'SIG-42',
  };
}

const RECORD_ORDER = [
  'id',
  'type',
  'title',
  'theme',
  'priority',
  'source',
  'source_ref',
  'legacy_id',
  'keep_because',
  'migration_note',
  'events',
];

describe('serializeRecord — fixed key order (Decision 8)', () => {
  const text = serializeRecord(scrambled());
  const back = JSON.parse(text);

  it('top-level keys follow the record order', () => {
    expect(Object.keys(back)).toEqual(RECORD_ORDER);
  });

  it('each event is type, at, by, then its own fields in a fixed list', () => {
    expect(back.events.map((e) => Object.keys(e))).toEqual([
      ['type', 'at', 'by'],
      ['type', 'at', 'by'],
      ['type', 'at', 'by', 'epic'],
      ['type', 'at', 'by', 'epic'],
      ['type', 'at', 'by', 'reason', 'proof'],
      ['type', 'at', 'by', 'reason', 'proof', 'dup_of', 'legacy'],
      ['type', 'at', 'by', 'reason'],
      ['type', 'at', 'by', 'changes'],
    ]);
  });

  it('edited changes follow the record order, each change is from then to', () => {
    expect(Object.keys(back.events[7].changes)).toEqual(['title', 'priority']);
    expect(Object.keys(back.events[7].changes.title)).toEqual(['from', 'to']);
  });

  it('a triaged event carrying changes: changes last, in the record order (t1.3 fix)', () => {
    const r = {
      id: 'SIG-9',
      type: 'BUG',
      title: 'x',
      priority: 2,
      events: [
        { type: 'created', at: AT, by: 'c' },
        { changes: { priority: { to: 2, from: null }, type: { to: 'BUG', from: 'NEW' } }, by: 'c', at: AT, type: 'triaged' },
      ],
    };
    const ev = JSON.parse(serializeRecord(r)).events[1];
    expect(Object.keys(ev)).toEqual(['type', 'at', 'by', 'changes']);
    expect(Object.keys(ev.changes)).toEqual(['type', 'priority']);
    expect(Object.keys(ev.changes.type)).toEqual(['from', 'to']);
  });

  it('2-space indent and exactly one trailing newline', () => {
    expect(text.split('\n')[1]).toBe('  "id": "SIG-42",');
    expect(text.endsWith('}\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });

  it('non-ASCII is written as is, not escaped', () => {
    expect(text).toContain('"title": "Café — 日本"');
    expect(text).not.toMatch(/\\u[0-9a-fA-F]{4}/);
  });

  it('the same record built in any key order serialises to the same bytes', () => {
    const r = scrambled();
    const reversed = Object.fromEntries(Object.entries(r).reverse());
    expect(serializeRecord(reversed)).toBe(text);
  });
});

describe('serializeRecord — validates before writing', () => {
  it('an unknown key throws a SCHEMA error naming it', () => {
    const r = { ...scrambled(), status: 'T' };
    expect(() => serializeRecord(r)).toThrow(WorkStoreError);
    try {
      serializeRecord(r);
    } catch (err) {
      expect(err.code).toBe('SCHEMA');
      expect(err.message).toMatch(/status is not a known field/);
    }
  });

  it('an unknown key inside an event throws', () => {
    const r = scrambled();
    r.events[1].note = 'x';
    expect(() => serializeRecord(r)).toThrow(/events\[1\]\.note is not a known field/);
  });

  it('an invalid value throws', () => {
    expect(() => serializeRecord({ ...scrambled(), id: 'nope' })).toThrow(WorkStoreError);
  });
});

describe('parseRecord', () => {
  it('parse → serialise is byte-identical (AC1.2)', () => {
    const text = serializeRecord(scrambled());
    const { record, errors } = parseRecord(text);
    expect(errors).toEqual([]);
    expect(serializeRecord(record)).toBe(text);
  });

  it('a minimal record round-trips byte-identically', () => {
    const text = serializeRecord({ id: 'SIG-1', type: 'Q', events: [{ type: 'created', at: '2026-08-01', by: 'm' }] });
    expect(text).toBe(
      '{\n  "id": "SIG-1",\n  "type": "Q",\n  "events": [\n    {\n      "type": "created",\n      "at": "2026-08-01",\n      "by": "m"\n    }\n  ]\n}\n',
    );
    expect(serializeRecord(parseRecord(text).record)).toBe(text);
  });

  it('an unknown key is reported, with the file path when given', () => {
    const text = JSON.stringify({ ...JSON.parse(serializeRecord(scrambled())), epic: 'M6.E13' });
    const { record, errors } = parseRecord(text, { path: 'items/00/SIG-42.json' });
    expect(record).not.toBeNull();
    expect(errors).toEqual(['items/00/SIG-42.json: epic is not a known field']);
  });

  it('malformed JSON is reported, never thrown', () => {
    const { record, errors } = parseRecord('{"id": ', { path: 'x.json' });
    expect(record).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^x\.json: not valid JSON/);
  });
});

describe('.gitattributes', () => {
  it('records are checked out with LF line endings', () => {
    const out = execFileSync('git', ['check-attr', 'text', 'eol', '--', '.planning/work/items/00/SIG-1.json'], {
      encoding: 'utf8',
    });
    expect(out).toContain('eol: lf');
    expect(out).toContain('text: set');
  });
});
