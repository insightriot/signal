// M6.E16 REVIEW r6 — who made a unit event (`by`) is short text, like `pr` and
// `release`: one line of at most 200 characters with no control or invisible
// character. It was held only to "not blank", so a record edited outside the
// writers could carry a `by` of any length, or one holding a line break, and
// read as valid. The writers already cut it to `UNIT_BY_MAX`
// (`unit-records.js` `who`).
//
// The schema file is the validator's rule (`UNIT_SCHEMA` is that file, read),
// so one change covers both; the last test reads Signal's own unit records
// against it, and writes nothing.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { UNIT_BY_MAX, UNIT_KIND, UNIT_SCHEMA } from '../plugin/tools/lib/unit-record.js';

const AT = '2026-10-11T10:00:00.000Z';
const { validateRecord, parseRecord } = UNIT_KIND;

// One event of each type, made by `by`, in an order the history allows.
const eventsBy = (by) => ({
  opened: [{ type: 'opened', at: AT, by }],
  close_requested: [{ type: 'opened', at: AT, by: 'claude' }, { type: 'close_requested', at: AT, by, proof: 'a'.repeat(40) }],
  closed: [{ type: 'closed', at: AT, by, reason: 'legacy' }],
  reopened: [{ type: 'closed', at: AT, by: 'claude', reason: 'legacy' }, { type: 'reopened', at: AT, by, reason: 'more to do' }],
  held: [{ type: 'opened', at: AT, by: 'claude' }, { type: 'held', at: AT, by, reason: 'waiting' }],
  released: [{ type: 'opened', at: AT, by: 'claude' }, { type: 'held', at: AT, by: 'claude', reason: 'waiting' }, { type: 'released', at: AT, by }],
  edited: [{ type: 'opened', at: AT, by: 'claude' }, { type: 'edited', at: AT, by, changes: { title: { from: null, to: 'A title' } } }],
});
const TYPES = Object.keys(eventsBy('x'));
const errorsFor = (type, by) => validateRecord({ id: 'M7.E1', events: eventsBy(by)[type] });

describe('a unit event\'s `by` is short text', () => {
  it('the schema names every event type this file tries', () => {
    expect(TYPES.sort()).toEqual(Object.keys(UNIT_SCHEMA.$defs).filter((k) => UNIT_SCHEMA.$defs[k].properties?.type?.const === k).sort());
  });

  it.each(TYPES)('%s: a name, and one at the limit, are valid', (type) => {
    expect(errorsFor(type, 'claude')).toEqual([]);
    expect(errorsFor(type, 'x'.repeat(UNIT_BY_MAX))).toEqual([]);
  });

  it.each(TYPES)('%s: one character over the limit is refused', (type) => {
    expect(errorsFor(type, 'x'.repeat(UNIT_BY_MAX + 1)).join('\n')).toMatch(/\.by\b/);
  });

  it.each(TYPES)('%s: a line break, an invisible character and a blank are refused', (type) => {
    for (const by of ['cla\nude', 'cla‮ude', 'cla​ude', '   ', '']) {
      expect(errorsFor(type, by).join('\n'), JSON.stringify(by)).toMatch(/\.by\b/);
    }
  });

  it('the schema file says so for every event, and keeps no rule nothing uses', () => {
    for (const type of TYPES) expect(UNIT_SCHEMA.$defs[type].properties.by).toEqual({ $ref: '#/$defs/short_text' });
    expect(JSON.stringify(UNIT_SCHEMA)).not.toContain('#/$defs/text');
    expect(UNIT_SCHEMA.$defs.text).toBeUndefined();
  });

  it('Signal\'s own unit records all still read as valid (read only)', () => {
    const dir = join(process.cwd(), '.planning', 'work', 'units');
    const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const { record, errors } = parseRecord(readFileSync(join(dir, f), 'utf-8'), { path: f });
      expect(errors).toEqual([]);
      expect(record.events.every((e) => typeof e.by === 'string')).toBe(true);
    }
  });
});
