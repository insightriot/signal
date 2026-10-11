// The v2 work-item record — one JSON file per thing (M6.E13.S1).
//
// v2 is built beside v1 (`work-item.js`), not over it: this module has no
// import from any v1 work module, so nothing here reaches a Markdown list
// parser (PLAN Decision 12). It never touches disk except to read its own
// schema at load.
//
// Two copies of one fact in one file is how the v1 contradictions happened
// (`D-M6E13-4`), so a record stores neither its status nor its Epic: both are
// folded from the event list (PLAN Decisions 3 and 4). A stored `status` or
// `epic` is an unknown key, and unknown keys are errors.

import { readFileSync } from 'node:fs';

import { WorkStoreError } from './work-errors.js';

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

function isMapping(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function jsonType(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isFinite(v) ? 'number' : 'non-finite number';
  return typeof v;
}

const patternCache = new Map();
function compiled(pattern) {
  let re = patternCache.get(pattern);
  if (!re) {
    re = new RegExp(pattern, 'u');
    patternCache.set(pattern, re);
  }
  return re;
}

function join(path, key) {
  return path === '' ? key : `${path}.${key}`;
}

// Only called on a validated record, so every key is in `order`.
function ordered(obj, order) {
  const out = {};
  for (const key of order) if (Object.hasOwn(obj, key)) out[key] = obj[key];
  return out;
}

/**
 * Build the record machinery for one kind of record (M6.E16.S1): validate,
 * serialise, parse and fold, over the schema and the kind-specific pieces
 * passed in. Items are one kind (`ITEM_KIND`, below); nothing here knows them.
 *
 * `fold(record)` is the kind's one pass over the events. It returns at least
 * `{sequenceErrors, editErrors}`, each a list of `{index, message}`, plus
 * whatever the kind derives (an item: `status` and `epic`).
 *
 * @param {object} kind
 * @param {object} kind.schema — the record's JSON Schema, in the supported subset; each event type has a `$defs` entry of its name
 * @param {string} kind.schemaName — the schema's file name, for the message when the schema itself is broken
 * @param {string} kind.label — what a record is called in messages (an item: `work record`)
 * @param {string[]} kind.eventTypes
 * @param {(event: object, path: string, errors: string[]) => void} kind.eventRules — per-event rules the schema subset cannot express
 * @param {string[]} kind.recordOrder — the record's key order on disk
 * @param {string[]} kind.eventHead — the keys every event starts with, in order
 * @param {Record<string, string[]>} kind.eventFields — per event type, the keys after the head, in order
 * @param {string[]} kind.changeOrder — key order inside one entry of an event's `changes`
 * @param {(record: object) => {sequenceErrors: object[], editErrors: object[]}} kind.fold
 * @returns {{schema: object, eventTypes: string[], validateRecord: Function, serializeRecord: Function,
 *   parseRecord: Function, fold: Function, folded: Function, checkEvents: Function}}
 */
export function makeRecordKind({
  schema, schemaName, label, eventTypes, eventRules, recordOrder, eventHead, eventFields, changeOrder, fold,
}) {
  function resolveRef(ref) {
    const m = /^#\/\$defs\/([A-Za-z_]+)$/.exec(ref);
    const target = m && Object.hasOwn(schema.$defs, m[1]) ? schema.$defs[m[1]] : undefined;
    // A ref that does not resolve is a bug in the shipped schema, not in the
    // record — so it throws rather than becoming a record error.
    if (!target) throw new Error(`${schemaName}: unresolvable $ref ${ref}`);
    return target;
  }

  // Validate `value` against `node` (one node of the supported subset),
  // pushing every violation onto `errors`. A type mismatch stops that node: the
  // other keywords would only restate it.
  function check(node, value, path, errors) {
    if (node.$ref !== undefined) return check(resolveRef(node.$ref), value, path, errors);
    const where = path === '' ? 'record' : path;

    if (node.type !== undefined) {
      const allowed = Array.isArray(node.type) ? node.type : [node.type];
      if (!allowed.includes(jsonType(value))) {
        errors.push(`${where} must be of type ${allowed.join(' or ')}`);
        return;
      }
    }
    if (node.const !== undefined && value !== node.const) {
      errors.push(`${where} must be ${JSON.stringify(node.const)} (got ${JSON.stringify(value)})`);
    }
    if (node.enum !== undefined && !node.enum.includes(value)) {
      errors.push(`${where} must be one of ${node.enum.join('/')} (got ${JSON.stringify(value)})`);
    }
    if (node.pattern !== undefined && typeof value === 'string' && !compiled(node.pattern).test(value)) {
      errors.push(`${where} does not match ${node.pattern} (got ${JSON.stringify(value)})`);
    }
    if (isMapping(value)) {
      const props = node.properties ?? {};
      for (const key of node.required ?? []) {
        if (!Object.hasOwn(value, key)) errors.push(`${join(path, key)} is required`);
      }
      for (const key of Object.keys(value)) {
        if (Object.hasOwn(props, key)) check(props[key], value[key], join(path, key), errors);
        else if (node.additionalProperties === false) errors.push(`${join(path, key)} is not a known field`);
      }
    }
    if (Array.isArray(value) && node.items !== undefined) {
      value.forEach((item, i) => check(node.items, item, `${path}[${i}]`, errors));
    }
  }

  // The per-event rules that need no prior state. Sequence rules (what may
  // follow what) are `checkEvents`'s, not these.
  function checkEvent(event, path, errors) {
    if (!eventTypes.includes(event.type)) {
      errors.push(`${path}.type must be one of ${eventTypes.join('/')} (got ${JSON.stringify(event.type)})`);
      return;
    }
    check(schema.$defs[event.type], event, path, errors);
    eventRules(event, path, errors);
  }

  function validateRecord(record) {
    const errors = [];
    check(schema, record, '', errors);
    if (isMapping(record) && Array.isArray(record.events)) {
      record.events.forEach((event, i) => {
        if (isMapping(event)) checkEvent(event, `events[${i}]`, errors);
      });
    }
    return errors;
  }

  function orderedEvent(event) {
    const out = ordered(event, [...eventHead, ...eventFields[event.type]]);
    if (out.changes !== undefined) {
      const changes = ordered(out.changes, recordOrder);
      for (const field of Object.keys(changes)) changes[field] = ordered(changes[field], changeOrder);
      out.changes = changes;
    }
    return out;
  }

  function serializeRecord(record) {
    const errors = validateRecord(record);
    if (errors.length > 0) {
      throw new WorkStoreError('SCHEMA', `invalid ${label}: ${errors.join('; ')}`);
    }
    const out = ordered(record, recordOrder);
    out.events = record.events.map(orderedEvent);
    return `${JSON.stringify(out, null, 2)}\n`;
  }

  function parseRecord(text, opts = {}) {
    const where = opts.path ?? label;
    let record;
    try {
      record = JSON.parse(text);
    } catch (err) {
      return { record: null, errors: [`${where}: not valid JSON (${err.message})`] };
    }
    return { record, errors: validateRecord(record).map((e) => `${where}: ${e}`) };
  }

  // The fold's result, or a throw when the event sequence is illegal.
  function folded(record, what) {
    const result = fold(record);
    if (result.sequenceErrors.length > 0) {
      // An illegal history has no honest answer; guessing one would read a
      // broken record as, say, plausibly closed (Decision 1: nothing silently wrong).
      const id = isMapping(record) && typeof record.id === 'string' ? record.id : label;
      throw new WorkStoreError(
        'SCHEMA',
        `${id}: cannot derive ${what}: ${result.sequenceErrors.map((e) => e.message).join('; ')}`,
      );
    }
    return result;
  }

  function checkEvents(record) {
    const { sequenceErrors, editErrors } = fold(record);
    return [...sequenceErrors, ...editErrors].sort((a, b) => a.index - b.index);
  }

  return Object.freeze({ schema, eventTypes, validateRecord, serializeRecord, parseRecord, fold, folded, checkEvents });
}

/**
 * The shipped JSON Schema (`plugin/references/work-item.schema.json`). It is
 * the source of truth for the record's shape; `validateRecord` interprets it.
 *
 * The validator is hand-rolled because `plugin/` ships exactly one dependency
 * (Decision 7). It supports ONLY these keywords: `type`, `properties`,
 * `required`, `additionalProperties: false`, `enum`, `const`, `pattern`,
 * `items`, and `$ref` to `#/$defs/…`. `tests/work-record-schema.test.js` fails
 * if the schema uses anything else, because an unsupported keyword would be
 * silently ignored here.
 *
 * Rules the subset cannot express are written in code below and listed where
 * they live: event dispatch by `type` (there is no `oneOf`); `closed` proof
 * unless legacy or dup; `dup_of` if and only if `dup`; `changes` (on `edited`,
 * and on `triaged` when present) names at least one field.
 */
export const RECORD_SCHEMA = deepFreeze(
  JSON.parse(readFileSync(new URL('../../references/work-item.schema.json', import.meta.url), 'utf8')),
);

export const EVENT_TYPES = Object.freeze([
  'created',
  'triaged',
  'queued',
  'started',
  'close_requested',
  'closed',
  'reopened',
  'edited',
]);

// The item's per-event rules that the schema subset cannot express.
function itemEventRules(event, path, errors) {
  if (event.type === 'closed') {
    // PLAN Decision 3: a dup close's evidence is `dup_of`; proof is optional.
    if (event.proof === undefined && event.legacy !== true && event.reason !== 'dup') {
      errors.push(`${path}.proof is required unless legacy is true or reason is dup`);
    }
    if (event.reason === 'dup' && event.dup_of === undefined) {
      errors.push(`${path}.dup_of is required when reason is dup`);
    } else if (event.reason !== 'dup' && event.dup_of !== undefined) {
      errors.push(`${path}.dup_of is only allowed when reason is dup`);
    }
  }
  if (isMapping(event.changes) && Object.keys(event.changes).length === 0) {
    errors.push(`${path}.changes must name at least one field`);
  }
}

// Key order on disk (Decision 8). `JSON.stringify` writes keys in insertion
// order, so without these lists the bytes would depend on whichever code path
// built the object, and parse → serialise would not be byte-identical (AC1.2).
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
const EVENT_HEAD = ['type', 'at', 'by'];
const EVENT_FIELDS = {
  created: [],
  triaged: ['changes'],
  queued: ['epic'],
  started: ['epic'],
  close_requested: ['reason', 'proof'],
  closed: ['reason', 'proof', 'dup_of', 'legacy'],
  reopened: ['reason'],
  edited: ['changes'],
};
const CHANGE_ORDER = ['from', 'to'];

// The transition table (PLAN Decision 3). For each event, the derived states
// it may follow. Status is never stored; `closing` is its own derived value,
// never a letter. The item's `type` is never read here: the status letter `Q`
// and the item type `Q` are different things and are never compared.
const OPEN = ['N', 'T', 'Q', 'P'];
const LEGAL_FROM = {
  triaged: ['N', 'Q', 'P'],
  queued: ['T', 'Q', 'P'],
  started: ['T', 'Q'],
  close_requested: OPEN,
  reopened: ['C', 'closing'],
};

// One pass over the events. Returns the derived status and Epic, plus
// `sequenceErrors` (an event not legal where it stands; that event is skipped
// and folding continues from the last legal state, so every bad event is
// reported) and `editErrors` (a field whose current value is not the `to` of
// the last event that changed it: an `edited`, or a `triaged` carrying
// `changes`).
function fold(record) {
  const sequenceErrors = [];
  const events = record?.events;
  if (!Array.isArray(events) || events.length === 0) {
    sequenceErrors.push({ index: 0, message: 'a record needs at least one event, and the first must be created' });
    return { status: null, epic: null, sequenceErrors, editErrors: [] };
  }

  let status = null;
  let epic = null;
  let pendingProof = null; // the outstanding close request's commit
  const lastEdit = new Map(); // field -> {index, to, type: the event's type}
  // Field changes are about the record's fields, not its status, so they count
  // even from an event that is illegal where it stands (that is already a
  // sequence error).
  const noteChanges = (event, index) => {
    if (!isMapping(event.changes)) return;
    for (const [field, change] of Object.entries(event.changes)) {
      lastEdit.set(field, { index, to: isMapping(change) ? change.to : undefined, type: event.type });
    }
  };

  const refuse = (index, message) => sequenceErrors.push({ index, message });

  if (!isMapping(events[0]) || events[0].type !== 'created') {
    // Without a `created` there is no state to fold from; one error, not one per event.
    const got = isMapping(events[0]) ? events[0].type : events[0];
    refuse(0, `events[0]: the first event must be created (got ${JSON.stringify(got)})`);
    return { status: null, epic: null, sequenceErrors, editErrors: [] };
  }

  events.forEach((event, index) => {
    const type = isMapping(event) ? event.type : undefined;
    if (index === 0) {
      status = 'N';
      return;
    }
    const illegal = () => refuse(index, `events[${index}]: ${type} is not legal from ${status}`);
    if (type === 'triaged' || type === 'edited') noteChanges(event, index);

    switch (type) {
      case 'triaged':
      case 'queued':
      case 'started':
      case 'close_requested':
      case 'reopened':
        if (!LEGAL_FROM[type].includes(status)) return illegal();
        if (type === 'triaged') [status, epic] = ['T', null];
        else if (type === 'queued') [status, epic] = ['Q', event.epic];
        else if (type === 'started') [status, epic] = ['P', event.epic];
        else if (type === 'close_requested') [status, pendingProof] = ['closing', event.proof];
        else [status, epic, pendingProof] = ['T', null, null];
        return;
      case 'closed': {
        if (event.legacy === true) {
          // Migration only: any open or closing state, original reason kept.
          if (![...OPEN, 'closing'].includes(status)) return illegal();
        } else if (event.reason === 'fixed') {
          // `fixed` closes only by confirming a request, copying its proof.
          if (status !== 'closing') return illegal();
          if (event.proof !== pendingProof) {
            return refuse(
              index,
              `events[${index}]: a fixed close must confirm the outstanding request's proof ` +
                `(${JSON.stringify(pendingProof)}, got ${JSON.stringify(event.proof)})`,
            );
          }
        } else if (![...OPEN, 'closing'].includes(status)) {
          return illegal();
        }
        [status, pendingProof] = ['C', null];
        return;
      }
      case 'edited':
        return; // fields noted above; status and Epic unchanged
      default:
        // `created` again, or a type validateRecord would reject.
        return illegal();
    }
  });

  const editErrors = [];
  for (const [field, { index, to, type }] of lastEdit) {
    const current = Object.hasOwn(record, field) ? record[field] : null;
    if (current !== to) {
      editErrors.push({
        index,
        message:
          `events[${index}]: ${field} was last ${type} to ${JSON.stringify(to)} ` +
          `but the record holds ${JSON.stringify(current)}`,
      });
    }
  }
  return { status, epic, sequenceErrors, editErrors };
}

/**
 * The item kind: the machinery above over the item schema. Every export below
 * is this kind's, under the name it has always had.
 */
export const ITEM_KIND = makeRecordKind({
  schema: RECORD_SCHEMA,
  schemaName: 'work-item.schema.json',
  label: 'work record',
  eventTypes: EVENT_TYPES,
  eventRules: itemEventRules,
  recordOrder: RECORD_ORDER,
  eventHead: EVENT_HEAD,
  eventFields: EVENT_FIELDS,
  changeOrder: CHANGE_ORDER,
  fold,
});

/**
 * Validate a record against the shipped schema plus the per-event rules the
 * keyword subset cannot express. Returns EVERY violation, each with its path
 * (`events[3].proof is not a known field`), so one fix-and-rerun cycle is
 * enough. Never throws on bad content.
 *
 * Structure only: whether the events form a legal sequence is `checkEvents`.
 *
 * @param {unknown} record
 * @returns {string[]}
 */
export function validateRecord(record) {
  return ITEM_KIND.validateRecord(record);
}

/**
 * Render a record as its file's bytes: fixed key order, 2-space indent, one
 * trailing newline, non-ASCII written as is. Validates first and throws a
 * `WorkStoreError('SCHEMA')` listing every violation, so an invalid record,
 * or one with an unknown key, never reaches disk.
 *
 * @param {object} record
 * @returns {string}
 */
export function serializeRecord(record) {
  return ITEM_KIND.serializeRecord(record);
}

/**
 * Parse a record file. Never throws on bad content: malformed JSON yields
 * `{record: null, errors}`, and a record that parses but fails validation is
 * returned with its errors, so a store check can report every broken file
 * instead of stopping at the first.
 *
 * @param {string} text
 * @param {{path?: string}} [opts] — the file's path, used only in messages
 * @returns {{record: object|null, errors: string[]}}
 */
export function parseRecord(text, opts = {}) {
  return ITEM_KIND.parseRecord(text, opts);
}

/**
 * The record's status, folded from its events: `'N' | 'T' | 'Q' | 'P' | 'C'`
 * or `'closing'` (a fixed close requested, not yet confirmed). Throws a
 * `WorkStoreError('SCHEMA')` when the event sequence is illegal. An `edited`
 * inconsistency does not throw here: it says nothing about status, and
 * `checkEvents` reports it.
 *
 * @param {object} record — a record that passes `validateRecord`
 * @returns {'N'|'T'|'Q'|'P'|'C'|'closing'}
 */
export function deriveStatus(record) {
  return ITEM_KIND.folded(record, 'status').status;
}

/**
 * The Epic the record belongs to, folded from its events (Decision 4): set by
 * `queued`/`started`, cleared by `triaged`/`reopened`, kept by everything else.
 * `null` when it is in none. Throws like `deriveStatus` on an illegal sequence.
 *
 * @param {object} record
 * @returns {string|null}
 */
export function epicOf(record) {
  return ITEM_KIND.folded(record, 'Epic').epic;
}

/**
 * Every problem with the record's history, each as `{index, message}`: an
 * event not legal from the state before it (the transition table, PLAN
 * Decision 3), and every field whose current value is not the `to` of the
 * last event that changed it — an `edited` (Decision 2), or a `triaged`
 * carrying `changes` (a re-triage after an edit). `[]` when the history is
 * sound.
 *
 * Store-level rules are not here: whether `dup_of` exists, and refusing a
 * reopen when the item's Epic is archived.
 *
 * @param {object} record — a record that passes `validateRecord`
 * @returns {{index: number, message: string}[]}
 */
export function checkEvents(record) {
  return ITEM_KIND.checkEvents(record);
}
