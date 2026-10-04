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
 * unless legacy; `dup_of` if and only if `dup`; `edited` names at least one field.
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

function resolveRef(ref) {
  const m = /^#\/\$defs\/([A-Za-z_]+)$/.exec(ref);
  const target = m && Object.hasOwn(RECORD_SCHEMA.$defs, m[1]) ? RECORD_SCHEMA.$defs[m[1]] : undefined;
  // A ref that does not resolve is a bug in the shipped schema, not in the
  // record — so it throws rather than becoming a record error.
  if (!target) throw new Error(`work-item.schema.json: unresolvable $ref ${ref}`);
  return target;
}

function join(path, key) {
  return path === '' ? key : `${path}.${key}`;
}

// Validate `value` against `schema` (one node of the supported subset),
// pushing every violation onto `errors`. A type mismatch stops that node: the
// other keywords would only restate it.
function check(schema, value, path, errors) {
  if (schema.$ref !== undefined) return check(resolveRef(schema.$ref), value, path, errors);
  const where = path === '' ? 'record' : path;

  if (schema.type !== undefined) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!allowed.includes(jsonType(value))) {
      errors.push(`${where} must be of type ${allowed.join(' or ')}`);
      return;
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${where} must be ${JSON.stringify(schema.const)} (got ${JSON.stringify(value)})`);
  }
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${where} must be one of ${schema.enum.join('/')} (got ${JSON.stringify(value)})`);
  }
  if (schema.pattern !== undefined && typeof value === 'string' && !compiled(schema.pattern).test(value)) {
    errors.push(`${where} does not match ${schema.pattern} (got ${JSON.stringify(value)})`);
  }
  if (isMapping(value)) {
    const props = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) errors.push(`${join(path, key)} is required`);
    }
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(props, key)) check(props[key], value[key], join(path, key), errors);
      else if (schema.additionalProperties === false) errors.push(`${join(path, key)} is not a known field`);
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    value.forEach((item, i) => check(schema.items, item, `${path}[${i}]`, errors));
  }
}

// The per-event rules that need no prior state. Sequence rules (what may
// follow what) are `checkEvents`'s, not these.
function checkEvent(event, path, errors) {
  if (!EVENT_TYPES.includes(event.type)) {
    errors.push(`${path}.type must be one of ${EVENT_TYPES.join('/')} (got ${JSON.stringify(event.type)})`);
    return;
  }
  check(RECORD_SCHEMA.$defs[event.type], event, path, errors);

  if (event.type === 'closed') {
    if (event.proof === undefined && event.legacy !== true) {
      errors.push(`${path}.proof is required unless legacy is true`);
    }
    if (event.reason === 'dup' && event.dup_of === undefined) {
      errors.push(`${path}.dup_of is required when reason is dup`);
    } else if (event.reason !== 'dup' && event.dup_of !== undefined) {
      errors.push(`${path}.dup_of is only allowed when reason is dup`);
    }
  }
  if (event.type === 'edited' && isMapping(event.changes) && Object.keys(event.changes).length === 0) {
    errors.push(`${path}.changes must name at least one field`);
  }
}

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
  const errors = [];
  check(RECORD_SCHEMA, record, '', errors);
  if (isMapping(record) && Array.isArray(record.events)) {
    record.events.forEach((event, i) => {
      if (isMapping(event)) checkEvent(event, `events[${i}]`, errors);
    });
  }
  return errors;
}
