// The work item — one file per thing (M6.E11.S1.t1.1, FR-2).
//
// Every bug, backlog row, inbox capture and open question becomes one Markdown
// file, `{KEY}-{n}.md`, with YAML frontmatter and the capture's words verbatim
// as the body (`D-M6E11-6`, `D-M6E11-7`). This module is the schema and nothing
// else: parse, validate, stringify, render the label. It never touches disk —
// `work-store.js` is the only writer of item files.
//
// `epic` and `sprint` are deliberately NOT fields. They are derived from the
// folder an item sits in (`D-M6E11-7`), and storing them would recreate the
// problem this Epic exists to remove: the same fact written in two places,
// free to disagree. A stored `epic:` is therefore a schema error, not a
// tolerated extra.

import {
  parseFrontmatter,
  stringifyFrontmatter,
  StateSchemaError,
} from './state.js';

// The one ID shape. Everything that recognises an item ID — filenames, lookups,
// `dup_of`, duplicate detection — uses this, so no two modules can disagree on
// what an ID is (the `EPIC_ID_STRICT_RE` lesson, `M4.5.E11.S1.t1`). The key is
// 2–10 characters starting with a letter; the number has no leading zero, so
// `SIG-7` and `SIG-07` cannot both exist as different spellings of one item.
export const ITEM_ID_RE = /^[A-Z][A-Z0-9]{1,9}-[1-9]\d*$/;

export const ITEM_TYPES = Object.freeze(['NEW', 'BUG', 'FEAT', 'CHORE', 'Q']);
export const ITEM_STATUSES = Object.freeze(['N', 'T', 'Q', 'P', 'C']);
// `wontdo` and `rejected` are different on purpose (`D-M6E11-16`): `rejected`
// means checked and false, `wontdo` means true but not worth doing.
export const CLOSE_REASONS = Object.freeze(['fixed', 'stale', 'wontdo', 'dup', 'rejected']);

// The error class lives in a leaf module so `atomic-write.js` can throw it
// without an import cycle; re-exported here so every existing import holds.
export { WORK_STORE_ERROR_CODES, WorkStoreError } from './work-errors.js';

// Canonical key order for the written file. `yaml` emits keys in insertion
// order, so without this the bytes on disk would depend on whichever code path
// built the object — and the generator's "second run byte-identical" check
// (AC-7.1) would inherit that instability.
const FIELD_ORDER = [
  'id',
  'type',
  'status',
  'title',
  'theme',
  'priority',
  'source',
  'source_ref',
  'created',
  'close',
  'legacy_id',
  'keep_because',
  'migration_note',
];
const CREATED_ORDER = ['at', 'by'];
const CLOSE_ORDER = ['reason', 'by', 'at', 'proof', 'dup_of'];

const DERIVED_FIELDS = new Set(['epic', 'sprint']);
const OPTIONAL_STRING_FIELDS = ['theme', 'source', 'source_ref', 'legacy_id', 'keep_because', 'migration_note'];

function isMapping(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

function checkMapping(errors, name, value, allowed, required) {
  if (!isMapping(value)) {
    errors.push(`${name} must be a mapping`);
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(`${name}.${key} is not a known field`);
  }
  for (const key of required) {
    if (!isNonEmptyString(value[key])) errors.push(`${name}.${key} is required`);
  }
  return true;
}

/**
 * Validate an item's frontmatter. Returns EVERY violation (AC-2.4) — a file
 * with three problems reports three, so one fix-and-rerun cycle is enough.
 *
 * Only `id`, `type` and `status` are required: a fresh capture has no title
 * until triage proposes one (AC-5.3). Every other field is optional but
 * type-checked when present. Unknown keys are rejected so a typo such as
 * `dupOf` for `dup_of` fails here instead of being silently ignored.
 *
 * @param {object} item
 * @returns {string[]}
 */
export function validateItem(item) {
  if (!isMapping(item)) return ['item frontmatter must be a mapping'];
  const errors = [];

  for (const key of Object.keys(item)) {
    if (DERIVED_FIELDS.has(key)) {
      errors.push(`${key} is derived from the item's folder and must not be stored`);
    } else if (!FIELD_ORDER.includes(key)) {
      errors.push(`${key} is not a known field`);
    }
  }

  if (typeof item.id !== 'string' || !ITEM_ID_RE.test(item.id)) {
    errors.push(`id must look like SIG-412 (got ${JSON.stringify(item.id)})`);
  }
  if (!ITEM_TYPES.includes(item.type)) {
    errors.push(`type must be one of ${ITEM_TYPES.join('/')} (got ${JSON.stringify(item.type)})`);
  }
  if (!ITEM_STATUSES.includes(item.status)) {
    errors.push(`status must be one of ${ITEM_STATUSES.join('/')} (got ${JSON.stringify(item.status)})`);
  }

  if (item.title !== undefined && !isNonEmptyString(item.title)) {
    errors.push('title must be a non-empty string');
  }
  for (const key of OPTIONAL_STRING_FIELDS) {
    if (item[key] !== undefined && typeof item[key] !== 'string') {
      errors.push(`${key} must be a string`);
    }
  }
  // Priority's scale is not decided yet (no decision fixes one), so it takes
  // a number or a word and nothing else.
  if (item.priority !== undefined && typeof item.priority !== 'number' && typeof item.priority !== 'string') {
    errors.push('priority must be a number or a string');
  }

  if (item.created !== undefined) {
    checkMapping(errors, 'created', item.created, CREATED_ORDER, CREATED_ORDER);
  }

  // Status and close agree both ways: a closed item says why, by whom and
  // when; an open item carries no close record left over from a reopen.
  if (item.status === 'C' && item.close === undefined) {
    errors.push('status C requires a close record (reason, by, at)');
  }
  if (item.close !== undefined) {
    if (ITEM_STATUSES.includes(item.status) && item.status !== 'C') {
      errors.push(`close is only allowed on status C (status is ${item.status})`);
    }
    if (checkMapping(errors, 'close', item.close, CLOSE_ORDER, ['by', 'at'])) {
      const { reason, proof, dup_of: dupOf } = item.close;
      if (!CLOSE_REASONS.includes(reason)) {
        errors.push(`close.reason must be one of ${CLOSE_REASONS.join('/')} (got ${JSON.stringify(reason)})`);
      }
      if (proof !== undefined && typeof proof !== 'string') errors.push('close.proof must be a string');
      if (reason === 'dup') {
        if (dupOf === undefined) {
          errors.push('close.dup_of is required when close.reason is dup');
        } else if (typeof dupOf !== 'string' || !ITEM_ID_RE.test(dupOf)) {
          errors.push(`close.dup_of must be an item ID like SIG-100 (got ${JSON.stringify(dupOf)})`);
        }
      } else if (dupOf !== undefined) {
        errors.push('close.dup_of is only allowed when close.reason is dup');
      }
    }
  }

  return errors;
}

/**
 * Parse an item file. Never throws on bad content: a malformed file yields
 * `{item: null, errors: [...]}` so a consistency pass can report every broken
 * file instead of stopping at the first.
 *
 * `parseFrontmatter` is shared with STATE.md and words its errors for
 * STATE.md; those are re-worded here so a message names the item file.
 *
 * @param {string} text
 * @param {{path?: string}} [opts] — the file's path, used only in messages
 * @returns {{item: object|null, body: string, errors: string[]}}
 */
export function parseItem(text, opts = {}) {
  const where = opts.path ?? 'item file';
  let parsed;
  try {
    parsed = parseFrontmatter(text);
  } catch (err) {
    if (!(err instanceof StateSchemaError)) throw err;
    const detail = err.message.replace(/^STATE\.md frontmatter\s*/, '');
    return { item: null, body: text, errors: [`${where}: frontmatter ${detail}`] };
  }
  // No fence at all: parseFrontmatter returns data null rather than throwing
  // (legacy STATE.md needs that). For an item it is simply not an item.
  if (parsed.data === null) {
    return { item: null, body: text, errors: [`${where}: no YAML frontmatter (expected a --- block first)`] };
  }
  const errors = validateItem(parsed.data).map((e) => `${where}: ${e}`);
  return { item: parsed.data, body: parsed.body, errors };
}

function ordered(obj, order) {
  const out = {};
  for (const key of order) if (obj[key] !== undefined) out[key] = obj[key];
  // Unknown keys are kept, after the known ones: stringify is not the place to
  // lose data; validateItem is the place to object to it.
  for (const key of Object.keys(obj)) if (!(key in out) && obj[key] !== undefined) out[key] = obj[key];
  return out;
}

/**
 * Render an item file. The body is written exactly as given; `parseItem`
 * returns it byte-for-byte (AC-2.1).
 *
 * @param {object} item
 * @param {string} body
 * @returns {string}
 */
export function stringifyItem(item, body) {
  const data = ordered(item, FIELD_ORDER);
  if (isMapping(data.created)) data.created = ordered(data.created, CREATED_ORDER);
  if (isMapping(data.close)) data.close = ordered(data.close, CLOSE_ORDER);
  return stringifyFrontmatter(data, body);
}

/**
 * The label shown to people: `SIG-412-BUG-T`. Rendered, never stored and never
 * used for lookup — only the front (`SIG-412`) identifies an item (AC-2.3).
 *
 * @param {{id: string, type: string, status: string}} item
 * @returns {string}
 */
export function renderLabel(item) {
  return `${item.id}-${item.type}-${item.status}`;
}
