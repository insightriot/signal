// Tests for the v2 work-item record schema and validateRecord (M6.E13.S1.t1.1).
// See .planning/M6.E13-PLAN.md Decisions 2, 4, 7 and .planning/M6.E13-VALIDATION.md row AC1.6
// (plus the schema halves of AC1.3 / AC1.4 / AC1.5: no stored `status`, no stored `epic`).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { validateRecord, RECORD_SCHEMA } from '../plugin/tools/lib/work-record.js';
import { ITEM_ID_RE } from '../plugin/tools/lib/work-item.js';

const SCHEMA_PATH = join(process.cwd(), 'plugin', 'references', 'work-item.schema.json');

const AT = '2026-10-04T10:00:00.000Z';
const SHA = '0123abc';

// One record per event shape, every event structurally valid. Sequence
// legality is t1.3's concern, not this file's.
function record(events, over = {}) {
  return {
    id: 'SIG-42',
    type: 'BUG',
    title: 'A thing is broken',
    events: [{ type: 'created', at: AT, by: 'claude' }, ...events],
    ...over,
  };
}

const EVENT_SAMPLES = {
  triaged: { type: 'triaged', at: AT, by: 'claude' },
  queued: { type: 'queued', at: AT, by: 'claude', epic: 'M6.E13' },
  started: { type: 'started', at: AT, by: 'claude', epic: 'M6.E13' },
  close_requested: { type: 'close_requested', at: AT, by: 'claude', reason: 'fixed', proof: SHA },
  closed: { type: 'closed', at: AT, by: 'claude', reason: 'wontdo', proof: 'not worth it' },
  closed_dup: { type: 'closed', at: AT, by: 'claude', reason: 'dup', proof: 'same as 7', dup_of: 'SIG-7' },
  closed_legacy: { type: 'closed', at: '2026-08-01', by: 'migration', reason: 'fixed', legacy: true },
  reopened: { type: 'reopened', at: AT, by: 'brett', reason: 'came back' },
  edited: { type: 'edited', at: AT, by: 'claude', changes: { title: { from: 'old', to: 'A thing is broken' } } },
};

describe('validateRecord — valid records', () => {
  it('a minimal record (id, type, created) is valid', () => {
    expect(validateRecord(record([]))).toEqual([]);
  });

  it('every optional top-level field is accepted', () => {
    const r = record([], {
      theme: 'work-store',
      priority: 'P2',
      source: '/sig:item',
      source_ref: 'BUGS.md',
      legacy_id: 'B12',
      keep_because: 'still true',
      migration_note: 'moved',
    });
    expect(validateRecord(r)).toEqual([]);
  });

  it('a numeric priority is accepted', () => {
    expect(validateRecord(record([], { priority: 2 }))).toEqual([]);
  });

  for (const [name, ev] of Object.entries(EVENT_SAMPLES)) {
    it(`event shape ${name} validates`, () => {
      expect(validateRecord(record([ev]))).toEqual([]);
    });
  }

  it('a date-only `at` (148 live v1 values) and a datetime `at` both validate', () => {
    expect(validateRecord(record([{ type: 'triaged', at: '2026-08-01', by: 'x' }]))).toEqual([]);
    expect(validateRecord(record([{ type: 'triaged', at: '2026-08-01T00:00:00Z', by: 'x' }]))).toEqual([]);
  });
});

describe('validateRecord — rejections (AC1.6: unknown keys are errors)', () => {
  it('a non-object record is rejected', () => {
    expect(validateRecord(null)).not.toEqual([]);
    expect(validateRecord([])).not.toEqual([]);
  });

  it('an unknown top-level key is an error naming it', () => {
    const errs = validateRecord(record([], { dupOf: 'SIG-1' }));
    expect(errs).toEqual(['dupOf is not a known field']);
  });

  it('a stored `status` is rejected (AC1.3, D-M6E13-4)', () => {
    expect(validateRecord(record([], { status: 'T' }))).toEqual(['status is not a known field']);
  });

  it('a stored `epic` is rejected (AC1.5, Decision 4)', () => {
    expect(validateRecord(record([], { epic: 'M6.E13' }))).toEqual(['epic is not a known field']);
  });

  it('missing required fields are each reported', () => {
    const errs = validateRecord({});
    expect(errs).toEqual(expect.arrayContaining(['id is required', 'type is required', 'events is required']));
  });

  it('a bad id, type and title are all reported at once', () => {
    const errs = validateRecord(record([], { id: 'sig-01', type: 'BUGGY', title: 'two\nlines' }));
    expect(errs).toHaveLength(3);
    expect(errs.some((e) => e.startsWith('id '))).toBe(true);
    expect(errs.some((e) => e.startsWith('type '))).toBe(true);
    expect(errs.some((e) => e.startsWith('title '))).toBe(true);
  });

  it('an empty title is rejected', () => {
    expect(validateRecord(record([], { title: '  ' }))).toHaveLength(1);
  });

  it('a wrong JSON type is rejected', () => {
    expect(validateRecord(record([], { theme: 3 }))).toEqual(['theme must be of type string']);
    expect(validateRecord(record([], { priority: true }))).toHaveLength(1);
    expect(validateRecord({ ...record([]), events: {} })).toEqual(['events must be of type array']);
  });

  it('an event that is not an object is rejected with its path', () => {
    expect(validateRecord(record(['triaged']))).toEqual(['events[1] must be of type object']);
  });

  it('an unknown event type is rejected with its path', () => {
    const errs = validateRecord(record([{ type: 'moved', at: AT, by: 'x' }]));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/^events\[1\]\.type /);
  });

  it('an unknown key inside an event is an error with its path', () => {
    const errs = validateRecord(record([{ ...EVENT_SAMPLES.triaged, epic: 'M6.E13' }]));
    expect(errs).toEqual(['events[1].epic is not a known field']);
  });

  it('missing at/by on an event are reported', () => {
    const errs = validateRecord(record([{ type: 'triaged' }]));
    expect(errs).toEqual(['events[1].at is required', 'events[1].by is required']);
  });

  it('a malformed `at` is rejected', () => {
    expect(validateRecord(record([{ type: 'triaged', at: '4 Oct 2026', by: 'x' }]))).toHaveLength(1);
    expect(validateRecord(record([{ type: 'triaged', at: '2026-10-04T10:00:00', by: 'x' }]))).toHaveLength(1);
  });

  it('queued/started require an Epic ID', () => {
    expect(validateRecord(record([{ type: 'queued', at: AT, by: 'x' }]))).toEqual(['events[1].epic is required']);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.started, epic: 'next' }]))).toHaveLength(1);
  });

  it('close_requested needs reason fixed and a bare commit hash', () => {
    expect(validateRecord(record([{ ...EVENT_SAMPLES.close_requested, reason: 'wontdo' }]))).toHaveLength(1);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.close_requested, proof: '--all' }]))).toHaveLength(1);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.close_requested, proof: 'main' }]))).toHaveLength(1);
  });

  it('closed: reason enum enforced', () => {
    expect(validateRecord(record([{ ...EVENT_SAMPLES.closed, reason: 'done' }]))).toHaveLength(1);
  });

  it('closed: proof required unless legacy (AC1.4)', () => {
    const { proof: _p, ...noProof } = EVENT_SAMPLES.closed;
    expect(validateRecord(record([noProof]))).toEqual(['events[1].proof is required unless legacy is true']);
    expect(validateRecord(record([{ ...noProof, legacy: true }]))).toEqual([]);
  });

  it('closed: an empty proof is rejected', () => {
    expect(validateRecord(record([{ ...EVENT_SAMPLES.closed, proof: '   ' }]))).toHaveLength(1);
  });

  it('closed: legacy may only be true', () => {
    expect(validateRecord(record([{ ...EVENT_SAMPLES.closed, legacy: false }]))).toHaveLength(1);
  });

  it('closed: dup requires dup_of, and dup_of requires dup (AC1.4)', () => {
    const { dup_of: _d, ...dupNoTarget } = EVENT_SAMPLES.closed_dup;
    expect(validateRecord(record([dupNoTarget]))).toEqual(['events[1].dup_of is required when reason is dup']);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.closed, dup_of: 'SIG-7' }]))).toEqual([
      'events[1].dup_of is only allowed when reason is dup',
    ]);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.closed_dup, dup_of: 'seven' }]))).toHaveLength(1);
  });

  it('reopened requires a non-empty reason', () => {
    expect(validateRecord(record([{ type: 'reopened', at: AT, by: 'x' }]))).toEqual(['events[1].reason is required']);
  });

  it('edited: changes must be non-empty and name known, editable fields', () => {
    expect(validateRecord(record([{ ...EVENT_SAMPLES.edited, changes: {} }]))).toEqual([
      'events[1].changes must name at least one field',
    ]);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.edited, changes: { id: { from: 'SIG-1', to: 'SIG-2' } } }]))).toEqual([
      'events[1].changes.id is not a known field',
    ]);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.edited, changes: { status: { from: 'T', to: 'C' } } }]))).toEqual([
      'events[1].changes.status is not a known field',
    ]);
  });

  it('edited: each change needs from and to (null = unset)', () => {
    expect(validateRecord(record([{ ...EVENT_SAMPLES.edited, changes: { theme: { to: 'x' } } }]))).toEqual([
      'events[1].changes.theme.from is required',
    ]);
    expect(validateRecord(record([{ ...EVENT_SAMPLES.edited, changes: { theme: { from: null, to: 'x' } } }], { theme: 'x' }))).toEqual([]);
  });

  it('returns every error, not just the first', () => {
    const errs = validateRecord({
      id: 'x',
      type: 'y',
      status: 'T',
      events: [{ type: 'triaged', at: 'never', by: '', extra: 1 }],
    });
    expect(errs.length).toBeGreaterThanOrEqual(5);
  });
});

// AC1.6: the validator is hand-rolled over a declared keyword subset (Decision 7).
// If the schema uses a keyword outside it, the validator would silently ignore
// that keyword — so the schema file is walked and any other keyword fails here.
describe('schema guard — only the supported keyword subset', () => {
  const SUPPORTED = new Set([
    'type',
    'properties',
    'required',
    'additionalProperties',
    'enum',
    'const',
    'pattern',
    'items',
    '$ref',
  ]);
  // Root-only declarations: `$schema` names the draft, `$defs` holds the
  // definitions `$ref` points at. Neither validates anything.
  const ROOT_ONLY = new Set(['$schema', '$defs']);

  function walk(node, path, out, isRoot) {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) {
      out.push(`${path} is not a schema object`);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const here = `${path}/${key}`;
      if (isRoot && ROOT_ONLY.has(key)) {
        if (key === '$defs') {
          // Keys under $defs are definition NAMES, not keywords.
          for (const [name, sub] of Object.entries(value)) walk(sub, `${here}/${name}`, out, false);
        }
        continue;
      }
      if (!SUPPORTED.has(key)) {
        out.push(`${here} uses unsupported keyword ${key}`);
        continue;
      }
      if (key === 'properties') {
        // Keys under properties are property NAMES (`type`, `id`…), not keywords.
        for (const [name, sub] of Object.entries(value)) walk(sub, `${here}/${name}`, out, false);
      } else if (key === 'items') {
        walk(value, here, out, false);
      } else if (key === 'additionalProperties' && value !== false) {
        out.push(`${here} supports only false`);
      } else if (key === '$ref' && !/^#\/\$defs\/[A-Za-z_]+$/.test(value)) {
        out.push(`${here} must point at #/$defs/…`);
      }
    }
  }

  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

  it('the shipped schema uses only supported keywords', () => {
    const out = [];
    walk(schema, '#', out, true);
    expect(out).toEqual([]);
  });

  it('the guard itself fires on an unsupported keyword (oneOf, minLength, nested)', () => {
    const out = [];
    walk({ type: 'object', oneOf: [], properties: { a: { type: 'string', minLength: 1 } } }, '#', out, true);
    expect(out).toEqual(['#/oneOf uses unsupported keyword oneOf', '#/properties/a/minLength uses unsupported keyword minLength']);
  });

  it('a property NAMED like a keyword is not mistaken for one', () => {
    const out = [];
    walk({ properties: { oneOf: { type: 'string' } } }, '#', out, true);
    expect(out).toEqual([]);
  });

  it('every $ref resolves to a $defs entry', () => {
    const refs = [...JSON.stringify(schema).matchAll(/"\$ref":"#\/\$defs\/([A-Za-z_]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const name of refs) expect(schema.$defs).toHaveProperty(name);
  });

  it('there is one $defs entry per event type, and the module uses the shipped file', () => {
    for (const t of ['created', 'triaged', 'queued', 'started', 'close_requested', 'closed', 'reopened', 'edited']) {
      expect(schema.$defs).toHaveProperty(t);
      expect(schema.$defs[t].properties.type).toEqual({ const: t });
    }
    expect(RECORD_SCHEMA).toEqual(schema);
  });

  it('the schema item-ID pattern is v1 ITEM_ID_RE (no drift before S7)', () => {
    expect(schema.$defs.item_id.pattern).toBe(ITEM_ID_RE.source);
  });
});
