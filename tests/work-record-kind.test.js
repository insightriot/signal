// M6.E16.S1.t1.1 — the record machinery takes a second record type.
// See .planning/M6.E16-PLAN.md § S1.
//
// `work-record.js` was bound to the item schema at module load. `makeRecordKind`
// builds the same machinery (validate, serialise, parse, fold) for any schema.
// Two things are pinned here:
//
// (a) a second kind, with its own toy schema, event types and fold, validates
//     and folds on its own — nothing of the item schema reaches it;
// (b) the item kind, now built through the factory, answers exactly as the
//     module did before the factory existed. The expected strings below were
//     captured from the module at b2acec6, the commit before this one.

import { describe, it, expect } from 'vitest';

import {
  makeRecordKind,
  ITEM_KIND,
  RECORD_SCHEMA,
  EVENT_TYPES,
  validateRecord,
  serializeRecord,
  parseRecord,
  checkEvents,
  deriveStatus,
  epicOf,
} from '../plugin/tools/lib/work-record.js';
import { WorkStoreError } from '../plugin/tools/lib/work-errors.js';

const AT = '2026-10-04T10:00:00.000Z';
const by = 'claude';

// ── (a) A toy second kind ───────────────────────────────────────────────────

const TOY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'events'],
  properties: {
    id: { $ref: '#/$defs/toy_id' },
    name: { type: 'string' },
    events: { type: 'array', items: { type: 'object' } },
  },
  $defs: {
    toy_id: { type: 'string', pattern: '^TOY-[1-9]\\d*$' },
    opened: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'at', 'by'],
      properties: { type: { const: 'opened' }, at: { type: 'string' }, by: { type: 'string' } },
    },
    shut: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'at', 'by', 'why'],
      properties: { type: { const: 'shut' }, at: { type: 'string' }, by: { type: 'string' }, why: { type: 'string' } },
    },
  },
};

// open → shut, once. Returns the shape the factory asks of a fold.
function toyFold(record) {
  const sequenceErrors = [];
  let status = null;
  (record?.events ?? []).forEach((event, index) => {
    if (index === 0 && event.type === 'opened') status = 'open';
    else if (event.type === 'shut' && status === 'open') status = 'shut';
    else sequenceErrors.push({ index, message: `events[${index}]: ${event.type} is not legal from ${status}` });
  });
  return { status, sequenceErrors, editErrors: [] };
}

const toyKind = () => makeRecordKind({
  schema: TOY_SCHEMA,
  schemaName: 'toy.schema.json',
  label: 'toy record',
  eventTypes: ['opened', 'shut'],
  eventRules: (event, path, errors) => {
    if (event.type === 'shut' && event.why === '') errors.push(`${path}.why must say why`);
  },
  recordOrder: ['id', 'name', 'events'],
  eventHead: ['type', 'at', 'by'],
  eventFields: { opened: [], shut: ['why'] },
  changeOrder: ['from', 'to'],
  fold: toyFold,
});

const opened = { type: 'opened', at: AT, by };
const shut = { type: 'shut', at: AT, by, why: 'done' };

describe('makeRecordKind — a second kind works on its own (M6.E16 t1.1)', () => {
  it('validates against its own schema and its own event types', () => {
    const kind = toyKind();
    expect(kind.validateRecord({ id: 'TOY-1', name: 'n', events: [opened, shut] })).toEqual([]);
    expect(kind.validateRecord({ id: 'TOY-1', title: 't', events: [opened] })).toEqual(['title is not a known field']);
    expect(kind.validateRecord({ id: 'SIG-1', events: [opened] })).toEqual([
      'id does not match ^TOY-[1-9]\\d*$ (got "SIG-1")',
    ]);
    expect(kind.validateRecord({ id: 'TOY-1', events: [{ type: 'created', at: AT, by }] })).toEqual([
      'events[0].type must be one of opened/shut (got "created")',
    ]);
    expect(kind.validateRecord({ id: 'TOY-1', events: [opened, { type: 'shut', at: AT, by }] })).toEqual([
      'events[1].why is required',
    ]);
  });

  it('runs its own per-event rules', () => {
    expect(toyKind().validateRecord({ id: 'TOY-1', events: [opened, { ...shut, why: '' }] })).toEqual([
      'events[1].why must say why',
    ]);
  });

  it('serialises in its own key order, and refuses an invalid record under its own label', () => {
    const kind = toyKind();
    const text = kind.serializeRecord({ events: [{ why: 'done', by, at: AT, type: 'shut' }], name: 'n', id: 'TOY-1' });
    expect(text).toBe(`${JSON.stringify({ id: 'TOY-1', name: 'n', events: [{ type: 'shut', at: AT, by, why: 'done' }] }, null, 2)}\n`);
    expect(kind.parseRecord(text)).toEqual({ record: JSON.parse(text), errors: [] });
    let err;
    try {
      kind.serializeRecord({ id: 'TOY-1', status: 'open', events: [opened] });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('SCHEMA');
    expect(err.message).toBe('invalid toy record: status is not a known field');
    expect(kind.parseRecord('{nope').errors[0]).toMatch(/^toy record: not valid JSON/);
  });

  it('folds with its own fold: checkEvents reports, folded throws on an illegal history', () => {
    const kind = toyKind();
    expect(kind.fold({ id: 'TOY-1', events: [opened, shut] }).status).toBe('shut');
    expect(kind.checkEvents({ id: 'TOY-1', events: [opened, shut] })).toEqual([]);
    expect(kind.folded({ id: 'TOY-1', events: [opened] }, 'status').status).toBe('open');
    const twice = { id: 'TOY-1', events: [opened, shut, shut] };
    expect(kind.checkEvents(twice)).toEqual([{ index: 2, message: 'events[2]: shut is not legal from shut' }]);
    let err;
    try {
      kind.folded(twice, 'status');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(WorkStoreError);
    expect(err.code).toBe('SCHEMA');
    expect(err.message).toBe('TOY-1: cannot derive status: events[2]: shut is not legal from shut');
  });

  it('an unresolvable $ref is a bug in ITS schema, and is named as that', () => {
    const kind = makeRecordKind({
      schema: { type: 'object', properties: { id: { $ref: '#/$defs/missing' } }, $defs: {} },
      schemaName: 'toy.schema.json',
      label: 'toy record',
      eventTypes: [],
      eventRules: () => {},
      recordOrder: ['id'],
      eventHead: [],
      eventFields: {},
      changeOrder: [],
      fold: toyFold,
    });
    expect(() => kind.validateRecord({ id: 'x' })).toThrow('toy.schema.json: unresolvable $ref #/$defs/missing');
  });

  it('the two kinds do not share a schema: each refuses the other\'s record', () => {
    const item = { id: 'SIG-1', type: 'BUG', title: 't', events: [{ type: 'created', at: AT, by }] };
    const toy = { id: 'TOY-1', events: [opened] };
    expect(toyKind().validateRecord(toy)).toEqual([]);
    expect(validateRecord(item)).toEqual([]);
    expect(toyKind().validateRecord(item).length).toBeGreaterThan(0);
    expect(validateRecord(toy).length).toBeGreaterThan(0);
  });
});

// ── (b) The item kind, through the factory, is the module as it was ─────────

const c = { type: 'created', at: AT, by };
const item = (events, extra = {}) => ({ id: 'SIG-1', type: 'BUG', title: 't', ...extra, events });
const ITEM_TYPES = 'created/triaged/queued/started/close_requested/closed/reopened/edited';

// Each row: a record, and what the module answered for it at b2acec6.
const CASES = {
  good: {
    record: item([c, { type: 'triaged', at: AT, by }, { type: 'queued', at: AT, by, epic: 'M6.E13' }]),
    validate: [],
    check: [],
    status: 'Q',
    epic: 'M6.E13',
  },
  'a stored status': {
    record: item([c], { status: 'T' }),
    validate: ['status is not a known field'],
    check: [],
    status: 'N',
    epic: null,
  },
  'a lowercase id': {
    record: { ...item([c]), id: 'sig-1' },
    validate: ['id does not match ^[A-Z][A-Z0-9]{1,9}-[1-9]\\d*$ (got "sig-1")'],
    check: [],
    status: 'N',
    epic: null,
  },
  'an unknown event type': {
    record: item([c, { type: 'shipped', at: AT, by }]),
    validate: [`events[1].type must be one of ${ITEM_TYPES} (got "shipped")`],
    check: [{ index: 1, message: 'events[1]: shipped is not legal from N' }],
    deriveThrows: 'SIG-1: cannot derive status: events[1]: shipped is not legal from N',
  },
  'a close with no proof': {
    record: item([c, { type: 'closed', at: AT, by, reason: 'wontdo' }]),
    validate: ['events[1].proof is required unless legacy is true or reason is dup'],
    check: [],
    status: 'C',
    epic: null,
  },
  'a dup close with no dup_of': {
    record: item([c, { type: 'closed', at: AT, by, reason: 'dup' }]),
    validate: ['events[1].dup_of is required when reason is dup'],
    check: [],
    status: 'C',
    epic: null,
  },
  'an edit naming no field': {
    record: item([c, { type: 'edited', at: AT, by, changes: {} }]),
    validate: ['events[1].changes must name at least one field'],
    check: [],
    status: 'N',
    epic: null,
  },
  'started straight from new': {
    record: item([c, { type: 'started', at: AT, by, epic: 'M6.E13' }]),
    validate: [],
    check: [{ index: 1, message: 'events[1]: started is not legal from N' }],
    deriveThrows: 'SIG-1: cannot derive status: events[1]: started is not legal from N',
  },
  'an edit the record does not hold': {
    record: item([c, { type: 'edited', at: AT, by, changes: { title: { from: 't', to: 'u' } } }]),
    validate: [],
    check: [{ index: 1, message: 'events[1]: title was last edited to "u" but the record holds "t"' }],
    status: 'N',
    epic: null,
  },
  'not an object': {
    record: 7,
    validate: ['record must be of type object'],
    check: [{ index: 0, message: 'a record needs at least one event, and the first must be created' }],
    deriveThrows: 'work record: cannot derive status: a record needs at least one event, and the first must be created',
  },
};

describe('the item kind, built through the factory, answers as the module did (M6.E16 t1.1)', () => {
  it('the item kind holds the module\'s own schema and event types', () => {
    expect(ITEM_KIND.schema).toBe(RECORD_SCHEMA);
    expect(ITEM_KIND.eventTypes).toBe(EVENT_TYPES);
  });

  for (const [name, want] of Object.entries(CASES)) {
    it(name, () => {
      expect(validateRecord(want.record)).toEqual(want.validate);
      expect(ITEM_KIND.validateRecord(want.record)).toEqual(want.validate);
      expect(checkEvents(want.record)).toEqual(want.check);
      expect(ITEM_KIND.checkEvents(want.record)).toEqual(want.check);
      if (want.deriveThrows) {
        expect(() => deriveStatus(want.record)).toThrow(want.deriveThrows);
        expect(() => epicOf(want.record)).toThrow(want.deriveThrows.replace('derive status', 'derive Epic'));
      } else {
        expect(deriveStatus(want.record)).toBe(want.status);
        expect(epicOf(want.record)).toBe(want.epic);
      }
      if (want.validate.length > 0) {
        expect(() => serializeRecord(want.record)).toThrow(`invalid work record: ${want.validate.join('; ')}`);
      }
    });
  }

  it('serialises in the item key order whatever order the object was built in', () => {
    const scrambled = {
      events: [{ epic: 'M6.E13', by, at: AT, type: 'queued' }],
      priority: 2,
      title: 't',
      type: 'BUG',
      id: 'SIG-1',
    };
    expect(serializeRecord({ ...scrambled, events: [c, { changes: { title: { to: 't', from: 'o' }, type: { to: 'BUG', from: 'NEW' } }, by, at: AT, type: 'edited' }] })).toBe(
      `${JSON.stringify({
        id: 'SIG-1',
        type: 'BUG',
        title: 't',
        priority: 2,
        events: [c, { type: 'edited', at: AT, by, changes: { type: { from: 'NEW', to: 'BUG' }, title: { from: 'o', to: 't' } } }],
      }, null, 2)}\n`,
    );
  });

  it('parseRecord names the path, and never throws on bad content', () => {
    expect(parseRecord('{nope', { path: 'x.json' }).errors[0]).toMatch(/^x\.json: not valid JSON \(/);
    expect(parseRecord('{nope').errors[0]).toMatch(/^work record: not valid JSON \(/);
    expect(parseRecord('{"id":"sig-1","type":"BUG","events":[]}', { path: 'x.json' }).errors).toEqual([
      'x.json: id does not match ^[A-Z][A-Z0-9]{1,9}-[1-9]\\d*$ (got "sig-1")',
    ]);
  });
});
