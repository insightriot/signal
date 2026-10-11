// The unit record — one JSON file per Epic or unit (M6.E16.S2).
//
// A unit is an Epic (`M6.E16`) or a project's own unit name (`phase-11`,
// `GATE-A`, `v0.1.6`). Its record says the unit exists and carries its close
// and its hold as events. It is the second record kind built by
// `makeRecordKind` (`work-record.js`); items are the first.
//
// A record stores neither its status nor its members. Status and the hold are
// folded from the event list here; which items belong to a unit is folded from
// the ITEMS' events (`epicOf`, `work-record.js`), so storing it on the unit
// would be a second copy of one fact. A stored `status`, `held` or member list
// is an unknown key, and unknown keys are errors.
//
// This module never touches disk except to read its own schema at load.

import { readFileSync } from 'node:fs';

import { makeRecordKind } from './work-record.js';

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

/**
 * The shipped JSON Schema (`plugin/references/work-unit.schema.json`), in the
 * keyword subset `makeRecordKind`'s validator supports
 * (`tests/work-record-schema.test.js` fails on any other keyword).
 *
 * Rules the subset cannot express are in `unitEventRules` below: a `shipped`
 * close needs `proof`; a `dropped` close needs `words`; `changes` names at
 * least one field. The ID pattern restates `isSafeUnitName`
 * (`archive-tree.js`), which a JSON file cannot import;
 * `tests/unit-record-schema.test.js` pins the two to the same answers.
 */
export const UNIT_SCHEMA = deepFreeze(
  JSON.parse(readFileSync(new URL('../../references/work-unit.schema.json', import.meta.url), 'utf8')),
);

export const UNIT_EVENT_TYPES = Object.freeze([
  'opened',
  'close_requested',
  'closed',
  'reopened',
  'held',
  'released',
  'edited',
]);

// The reasons a unit may be recorded as closed without a close request.
// `shipped` is not one: it closes only by confirming a request.
const DIRECT_CLOSE = ['dropped', 'legacy'];

function unitEventRules(event, path, errors) {
  if (event.type === 'closed') {
    if (event.reason === 'shipped' && event.proof === undefined) {
      errors.push(`${path}.proof is required when reason is shipped`);
    }
    if (event.reason === 'dropped' && event.words === undefined) {
      errors.push(`${path}.words is required when reason is dropped`);
    }
  }
  if (isMapping(event.changes) && Object.keys(event.changes).length === 0) {
    errors.push(`${path}.changes must name at least one field`);
  }
}

// Key order on disk, as for items: without these lists the bytes would depend
// on whichever code path built the object.
const RECORD_ORDER = ['id', 'title', 'summary', 'legacy_row', 'migration_note', 'events'];
const EVENT_HEAD = ['type', 'at', 'by'];
const EVENT_FIELDS = {
  opened: [],
  close_requested: ['proof'],
  closed: ['reason', 'proof', 'pr', 'release', 'words'],
  reopened: ['reason'],
  held: ['reason'],
  released: [],
  edited: ['changes'],
};
const CHANGE_ORDER = ['from', 'to'];
const CLOSE_KEYS = ['reason', 'at', 'by', 'proof', 'pr', 'release', 'words'];

// What a `closed` event says, as the fold returns it: the keys it carries, no others.
function closeOf(event) {
  const out = {};
  for (const key of CLOSE_KEYS) if (event[key] !== undefined) out[key] = event[key];
  return out;
}

const FIRST_EVENT = 'the first event must be opened, or a closed with reason legacy or dropped';

// One pass over the events. The transition table:
//
//   first event      opened → open
//                    closed (legacy | dropped) → closed
//                      (a unit recorded as already over — every Epic that
//                       shipped before unit records existed, and the ones
//                       that never ran. It has no open event to copy, and
//                       writing one would invent a date.)
//   close_requested  from open                     → closing (its proof kept)
//   closed shipped   from closing, the same proof  → closed
//   closed dropped   from open or closing          → closed
//   closed legacy    from open or closing          → closed
//   reopened         from closed or closing        → open
//   held             when not held, any status     → held (the status unchanged)
//   released         when held, any status         → not held
//   edited           any status                    → unchanged
//
// The hold is a flag beside the status, not a status: it survives a close and
// a reopen. `opened` is legal only as the first event.
//
// Returns `sequenceErrors` (an event not legal where it stands; it is skipped
// and folding continues from the last legal state, so every bad event is
// reported) and `editErrors` (a field whose current value is not the `to` of
// the last `edited` that changed it), as `makeRecordKind` asks of a fold.
function fold(record) {
  const sequenceErrors = [];
  const refuse = (index, message) => sequenceErrors.push({ index, message });
  const nothing = () => ({
    status: null, held: false, hold_reason: null, close: null, closing_proof: null, sequenceErrors, editErrors: [],
  });

  const events = record?.events;
  if (!Array.isArray(events) || events.length === 0) {
    refuse(0, `a unit record needs at least one event: ${FIRST_EVENT}`);
    return nothing();
  }
  const first = events[0];
  const bornClosed = isMapping(first) && first.type === 'closed' && DIRECT_CLOSE.includes(first.reason);
  if (!isMapping(first) || (first.type !== 'opened' && !bornClosed)) {
    // With no legal first event there is no state to fold from; one error, not one per event.
    const got = isMapping(first) ? (first.type === 'closed' ? `closed ${first.reason}` : first.type) : first;
    refuse(0, `events[0]: ${FIRST_EVENT} (got ${JSON.stringify(got)})`);
    return nothing();
  }

  let status = bornClosed ? 'closed' : 'open';
  let close = bornClosed ? closeOf(first) : null;
  let pendingProof = null; // the outstanding close request's commit
  let held = false;
  let holdReason = null;
  const lastEdit = new Map(); // field -> {index, to}

  events.forEach((event, index) => {
    if (index === 0) return;
    const type = isMapping(event) ? event.type : undefined;
    const illegal = () => refuse(index, `events[${index}]: ${type} is not legal from ${status}`);

    switch (type) {
      case 'close_requested':
        if (status !== 'open') return illegal();
        [status, pendingProof] = ['closing', event.proof];
        return;
      case 'closed':
        if (event.reason === 'shipped') {
          // `shipped` closes only by confirming a request, copying its proof.
          if (status !== 'closing') return illegal();
          if (event.proof !== pendingProof) {
            return refuse(
              index,
              `events[${index}]: a shipped close must confirm the outstanding request's proof `
                + `(${JSON.stringify(pendingProof)}, got ${JSON.stringify(event.proof)})`,
            );
          }
        } else if (status !== 'open' && status !== 'closing') {
          return illegal();
        }
        [status, close, pendingProof] = ['closed', closeOf(event), null];
        return;
      case 'reopened':
        if (status !== 'closed' && status !== 'closing') return illegal();
        [status, close, pendingProof] = ['open', null, null];
        return;
      case 'held':
        if (held) return refuse(index, `events[${index}]: held is not legal: the unit is already held`);
        [held, holdReason] = [true, event.reason];
        return;
      case 'released':
        if (!held) return refuse(index, `events[${index}]: released is not legal: the unit is not held`);
        [held, holdReason] = [false, null];
        return;
      case 'edited':
        if (isMapping(event.changes)) {
          for (const [field, change] of Object.entries(event.changes)) {
            lastEdit.set(field, { index, to: isMapping(change) ? change.to : undefined });
          }
        }
        return; // status and hold unchanged
      default:
        // `opened` again, or a type validateRecord would reject.
        return illegal();
    }
  });

  const editErrors = [];
  for (const [field, { index, to }] of lastEdit) {
    const current = Object.hasOwn(record, field) ? record[field] : null;
    if (current !== to) {
      editErrors.push({
        index,
        message:
          `events[${index}]: ${field} was last edited to ${JSON.stringify(to)} `
          + `but the record holds ${JSON.stringify(current)}`,
      });
    }
  }
  return { status, held, hold_reason: holdReason, close, closing_proof: pendingProof, sequenceErrors, editErrors };
}

/**
 * The unit kind: `makeRecordKind`'s machinery (validate, serialise, parse,
 * check the history) over the unit schema.
 */
export const UNIT_KIND = makeRecordKind({
  schema: UNIT_SCHEMA,
  schemaName: 'work-unit.schema.json',
  label: 'unit record',
  eventTypes: UNIT_EVENT_TYPES,
  eventRules: unitEventRules,
  recordOrder: RECORD_ORDER,
  eventHead: EVENT_HEAD,
  eventFields: EVENT_FIELDS,
  changeOrder: CHANGE_ORDER,
  fold,
});

/**
 * A unit's state, folded from its events. Throws a `WorkStoreError('SCHEMA')`
 * when the event sequence is illegal: a broken history has no honest answer.
 * An `edited` inconsistency does not throw here (it says nothing about
 * status); `UNIT_KIND.checkEvents` reports it.
 *
 * @param {object} record — a record that passes `UNIT_KIND.validateRecord`
 * @returns {{status: 'open'|'closing'|'closed', held: boolean, hold_reason: string|null,
 *   close: null|{reason: 'shipped'|'dropped'|'legacy', at: string, by: string, proof?: string, pr?: string, release?: string, words?: string},
 *   closing_proof: string|null}}
 *   `close` when closed; `closing_proof` (the requested commit) when closing;
 *   `hold_reason` when held
 */
export function foldUnit(record) {
  const { status, held, hold_reason, close, closing_proof } = UNIT_KIND.folded(record, 'status');
  return { status, held, hold_reason, close, closing_proof };
}
