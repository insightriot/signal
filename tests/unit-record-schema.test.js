// M6.E16.S2.t2.1 — the unit record's schema (AC1.1, AC1.2 schema half, AC5.1).
// See .planning/M6.E16-VALIDATION.md rows AC1.1 and AC5.1.
//
// A unit record says a unit exists and carries its close and its hold as
// events. It stores no status and no member list: either is an unknown key,
// and unknown keys are errors. The keyword-subset guard for this schema file is
// in tests/work-record-schema.test.js, beside the item schema's.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { UNIT_KIND, UNIT_SCHEMA, UNIT_EVENT_TYPES } from '../plugin/tools/lib/unit-record.js';
import { isSafeUnitName } from '../plugin/tools/lib/archive-tree.js';
import { RECORD_SCHEMA } from '../plugin/tools/lib/work-record.js';
import { WorkStoreError } from '../plugin/tools/lib/work-errors.js';

const SCHEMA_PATH = join(process.cwd(), 'plugin', 'references', 'work-unit.schema.json');
const { validateRecord, serializeRecord, parseRecord } = UNIT_KIND;

const AT = '2026-10-11T10:00:00.000Z';
const SHA = '0123abc';
const by = 'claude';

const opened = { type: 'opened', at: AT, by };
function record(events, over = {}) {
  return { id: 'M6.E16', events: [opened, ...events], ...over };
}

const EVENT_SAMPLES = {
  close_requested: { type: 'close_requested', at: AT, by, proof: SHA },
  closed_shipped: { type: 'closed', at: AT, by, reason: 'shipped', proof: SHA, pr: '#301', release: 'v0.1.51' },
  closed_dropped: { type: 'closed', at: AT, by, reason: 'dropped', words: 'the work moved to another Epic' },
  closed_legacy: { type: 'closed', at: '2026-08-01', by: 'migration', reason: 'legacy' },
  closed_legacy_full: { type: 'closed', at: '2026-08-01', by: 'migration', reason: 'legacy', pr: '#211', release: 'v0.1.19', words: 'as the milestone table said' },
  reopened: { type: 'reopened', at: AT, by: 'brett', reason: 'not finished after all' },
  held: { type: 'held', at: AT, by: 'brett', reason: 'its files are still read daily' },
  released: { type: 'released', at: AT, by: 'brett' },
  edited: { type: 'edited', at: AT, by, changes: { title: { from: null, to: 'Epics and units as records' } } },
};

describe('unit record — valid records (AC1.1)', () => {
  it('a minimal record (id, one opened event) is valid', () => {
    expect(validateRecord(record([]))).toEqual([]);
  });

  it('every optional top-level field is accepted', () => {
    const r = record([], {
      title: 'Epics and units as records',
      summary: 'A unit is one JSON record.',
      legacy_row: ['`M6.E1`', 'shipped 2026-08-20 (PR #201, v0.1.33)', 'The plugin folder'],
      migration_note: 'created at the cutover',
    });
    expect(validateRecord(r)).toEqual([]);
  });

  for (const [name, ev] of Object.entries(EVENT_SAMPLES)) {
    it(`event shape ${name} validates`, () => {
      expect(validateRecord(record([ev]))).toEqual([]);
    });
  }

  it('the event types are the seven the plan names', () => {
    expect([...UNIT_EVENT_TYPES]).toEqual(['opened', 'close_requested', 'closed', 'reopened', 'held', 'released', 'edited']);
  });

  it('a date-only `at` and a datetime `at` both validate', () => {
    expect(validateRecord(record([{ ...EVENT_SAMPLES.released, at: '2026-08-01' }]))).toEqual([]);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.released, at: '2026-08-01T00:00:00Z' }]))).toEqual([]);
  });

  for (const id of ['M6.E16', 'M4.5.E11', 'phase-11', 'v0.1.6', 'GATE-A', 'PHASE10-S4', 'SC1', 'a'.repeat(100)]) {
    it(`the id ${id.length > 20 ? `${id.length} characters long` : id} is accepted`, () => {
      expect(validateRecord(record([], { id }))).toEqual([]);
    });
  }
});

describe('unit record — rejections (AC1.1: an extra key or a stored status is refused)', () => {
  it('a non-object record is rejected', () => {
    expect(validateRecord(null)).not.toEqual([]);
    expect(validateRecord([])).not.toEqual([]);
  });

  it('an unknown top-level key is an error naming it', () => {
    expect(validateRecord(record([], { owner: 'brett' }))).toEqual(['owner is not a known field']);
  });

  it('a stored `status` is rejected (AC1.2)', () => {
    expect(validateRecord(record([], { status: 'closed' }))).toEqual(['status is not a known field']);
  });

  it('a stored `held` or member list is rejected: both are derived', () => {
    expect(validateRecord(record([], { held: true }))).toEqual(['held is not a known field']);
    expect(validateRecord(record([], { items: ['SIG-1'] }))).toEqual(['items is not a known field']);
    expect(validateRecord(record([], { members: ['SIG-1'] }))).toEqual(['members is not a known field']);
  });

  it('an item record field is not a unit record field', () => {
    expect(validateRecord(record([], { type: 'FEAT' }))).toEqual(['type is not a known field']);
  });

  it('missing required fields are each reported', () => {
    expect(validateRecord({})).toEqual(['id is required', 'events is required']);
  });

  for (const [name, id] of Object.entries({
    'two dots': 'a..b',
    'a separator': 'a/b',
    'a backslash': 'a\\b',
    'a leading dot': '.hidden',
    '101 characters': 'a'.repeat(101),
    'the empty string': '',
    'a space': 'phase 11',
    'a newline': 'M6.E16\n',
    'a zero-width space': 'M6.E​16',
  })) {
    it(`an id with ${name} is rejected`, () => {
      const errs = validateRecord(record([], { id }));
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatch(/^id /);
    });
  }

  it('a title of two lines, an empty title and a blank summary are rejected', () => {
    expect(validateRecord(record([], { title: 'two\nlines' }))).toHaveLength(1);
    expect(validateRecord(record([], { title: '  ' }))).toHaveLength(1);
    expect(validateRecord(record([], { summary: ' ' }))).toHaveLength(1);
  });

  it('legacy_row is a list of strings, nothing else', () => {
    expect(validateRecord(record([], { legacy_row: 'one cell' }))).toEqual(['legacy_row must be of type array']);
    expect(validateRecord(record([], { legacy_row: ['a', 3] }))).toEqual(['legacy_row[1] must be of type string']);
  });

  it('an unknown event type is rejected with its path — an item event is not a unit event', () => {
    for (const type of ['created', 'triaged', 'queued', 'started', 'archived']) {
      const errs = validateRecord(record([{ type, at: AT, by }]));
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatch(/^events\[1\]\.type /);
    }
  });

  it('an unknown key inside an event is an error with its path', () => {
    expect(validateRecord(record([{ ...EVENT_SAMPLES.released, reason: 'done with it' }]))).toEqual(['events[1].reason is not a known field']);
    expect(validateRecord(record([{ ...opened, epic: 'M6.E16' }]))).toEqual(['events[1].epic is not a known field']);
  });

  it('missing at/by on an event are reported', () => {
    expect(validateRecord(record([{ type: 'released' }]))).toEqual(['events[1].at is required', 'events[1].by is required']);
  });

  it('close_requested needs a bare commit hash', () => {
    expect(validateRecord(record([{ type: 'close_requested', at: AT, by }]))).toEqual(['events[1].proof is required']);
    for (const proof of ['--all', 'main', 'ABCDEF1', '0123ab', 'HEAD~1']) {
      expect(validateRecord(record([{ ...EVENT_SAMPLES.close_requested, proof }])), proof).toHaveLength(1);
    }
  });

  // t4.0: what /sig:ship knows when it asks, carried to the confirm.
  it('close_requested may carry pr and release as text, and nothing else', () => {
    expect(validateRecord(record([{ ...EVENT_SAMPLES.close_requested, pr: '#301', release: 'v0.1.51' }]))).toEqual([]);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.close_requested, pr: ' ' }]))).toHaveLength(1);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.close_requested, release: 51 }]))).toHaveLength(1);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.close_requested, words: 'no' }]))).toHaveLength(1);
  });

  it('closed: the reason is shipped, dropped or legacy', () => {
    for (const reason of ['fixed', 'wontdo', 'done', 'parked']) {
      expect(validateRecord(record([{ ...EVENT_SAMPLES.closed_legacy, reason }])), reason).toHaveLength(1);
    }
    expect(validateRecord(record([{ type: 'closed', at: AT, by }]))).toEqual(['events[1].reason is required']);
  });

  it('closed shipped: a proof is required, and it is a commit hash', () => {
    const noProof = { ...EVENT_SAMPLES.closed_shipped };
    delete noProof.proof;
    expect(validateRecord(record([noProof]))).toEqual(['events[1].proof is required when reason is shipped']);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.closed_shipped, proof: 'merged' }]))).toHaveLength(1);
  });

  it('closed dropped: words are required and not blank', () => {
    const noWords = { ...EVENT_SAMPLES.closed_dropped };
    delete noWords.words;
    expect(validateRecord(record([noWords]))).toEqual(['events[1].words is required when reason is dropped']);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.closed_dropped, words: '   ' }]))).toHaveLength(1);
  });

  it('closed legacy: needs neither proof nor words, and may carry words', () => {
    expect(validateRecord(record([EVENT_SAMPLES.closed_legacy]))).toEqual([]);
    expect(validateRecord(record([EVENT_SAMPLES.closed_legacy_full]))).toEqual([]);
  });

  it('closed: the item-only keys dup_of and legacy are not unit keys', () => {
    expect(validateRecord(record([{ ...EVENT_SAMPLES.closed_legacy, legacy: true }]))).toEqual(['events[1].legacy is not a known field']);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.closed_legacy, dup_of: 'SIG-7' }]))).toEqual(['events[1].dup_of is not a known field']);
  });

  it('reopened and held each require a non-empty reason (AC5.1)', () => {
    expect(validateRecord(record([{ type: 'reopened', at: AT, by }]))).toEqual(['events[1].reason is required']);
    expect(validateRecord(record([{ type: 'held', at: AT, by }]))).toEqual(['events[1].reason is required']);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.held, reason: ' ' }]))).toHaveLength(1);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.reopened, reason: '' }]))).toHaveLength(1);
  });

  it('edited: changes must be non-empty and name an editable field', () => {
    expect(validateRecord(record([{ ...EVENT_SAMPLES.edited, changes: {} }]))).toEqual(['events[1].changes must name at least one field']);
    for (const field of ['id', 'status', 'held', 'legacy_row', 'events']) {
      expect(validateRecord(record([{ ...EVENT_SAMPLES.edited, changes: { [field]: { from: null, to: 'x' } } }]))).toEqual([
        `events[1].changes.${field} is not a known field`,
      ]);
    }
    expect(validateRecord(record([{ ...EVENT_SAMPLES.edited, changes: { summary: { to: 'x' } } }]))).toEqual([
      'events[1].changes.summary.from is required',
    ]);
  });

  it('returns every error, not just the first', () => {
    const errs = validateRecord({ id: 'a/b', status: 'open', events: [{ type: 'held', at: 'never', by: '', extra: 1 }] });
    expect(errs.length).toBeGreaterThanOrEqual(5);
  });
});

describe('unit record — on disk', () => {
  it('serialises in a fixed key order whatever order the object was built in, with one trailing newline', () => {
    const scrambled = {
      events: [{ by, at: AT, type: 'opened' }, { words: 'moved', reason: 'dropped', by, at: AT, type: 'closed' }],
      migration_note: 'n',
      legacy_row: ['a', 'b'],
      summary: 's',
      title: 't',
      id: 'GATE-A',
    };
    const text = serializeRecord(scrambled);
    expect(text.endsWith('}\n')).toBe(true);
    const parsed = JSON.parse(text);
    expect(Object.keys(parsed)).toEqual(['id', 'title', 'summary', 'legacy_row', 'migration_note', 'events']);
    expect(Object.keys(parsed.events[1])).toEqual(['type', 'at', 'by', 'reason', 'words']);
    expect(parsed.legacy_row).toEqual(['a', 'b']);
  });

  it('parse → serialise is byte-identical', () => {
    const text = serializeRecord(record([EVENT_SAMPLES.held, EVENT_SAMPLES.close_requested, EVENT_SAMPLES.closed_shipped], { title: 't' }));
    expect(serializeRecord(parseRecord(text).record)).toBe(text);
  });

  it('an invalid record never serialises: SCHEMA, naming the record a unit record', () => {
    let caught;
    try {
      serializeRecord(record([], { status: 'open' }));
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(WorkStoreError);
    expect(caught.code).toBe('SCHEMA');
    expect(caught.message).toBe('invalid unit record: status is not a known field');
  });

  it('malformed JSON is reported, not thrown', () => {
    expect(parseRecord('{', { path: 'x.json' })).toMatchObject({ record: null, errors: [expect.stringMatching(/^x\.json: not valid JSON/)] });
  });
});

describe('unit schema — the shipped file', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

  it('the module uses the shipped file, and it has one $defs entry per event type', () => {
    expect(UNIT_SCHEMA).toEqual(schema);
    for (const t of UNIT_EVENT_TYPES) {
      expect(schema.$defs).toHaveProperty(t);
      expect(schema.$defs[t].properties.type).toEqual({ const: t });
      expect(schema.$defs[t].additionalProperties).toBe(false);
    }
  });

  it('a commit hash and a timestamp mean what they mean on an item (same patterns)', () => {
    expect(schema.$defs.commit).toEqual(RECORD_SCHEMA.$defs.commit);
    expect(schema.$defs.at).toEqual(RECORD_SCHEMA.$defs.at);
    expect(schema.$defs.change).toEqual(RECORD_SCHEMA.$defs.change);
  });

  // The schema cannot import `isSafeUnitName`, so its pattern is a second
  // statement of one rule. This pins the two to the same answers.
  it('the id pattern agrees with isSafeUnitName on every sample', () => {
    const re = new RegExp(schema.$defs.unit_id.pattern, 'u');
    const samples = [
      'M6.E16', 'M4.5.E11', 'phase-11', 'v0.1.6', 'GATE-A', 'PHASE10-S4', 'SC1', 'M1', '0', 'a_b', 'a.b', 'a-',
      'a'.repeat(100), 'a'.repeat(101), 'a'.repeat(10_000), '', '.', '..', 'a..b', 'a...b', '.a', '-a', '_a', 'a/b', 'a\\b',
      'a b', 'a\n', '\na', 'a\nb', 'a​b', 'a‮b', 'é', 'a\0b', 'a:b', 'a*', '~a', 'a.', 'a..',
    ];
    for (const s of samples) expect(re.test(s), JSON.stringify(s.slice(0, 30))).toBe(isSafeUnitName(s));
  });
});
