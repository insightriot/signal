// v1 work item → v2 record (M6.E13.S1.t1.4a).
//
// PURE: text in, `{record, body, manifest}` out. No disk, no git. The migration
// script (`work-migrate-v2.js`, S7) does the reading and writing, and the t1.5
// run uses this over every live item into a scratch directory. A v2 read of a
// v1 store also goes through here (PLAN Decision 1), so whatever this cannot
// map is reported in the manifest — never guessed.
//
// v1 is read through `parseItem` (read-only import); nothing in v1 is changed.

import { itemNumber, parseItem } from './work-item.js';
import { rewriteRelativeLinks } from './work-links.js';
import { validateRecord, checkEvents } from './work-record.js';

// Record fields carried as they are (Decision 8's order is the serialiser's job).
const CARRIED = ['id', 'type', 'title', 'theme', 'priority', 'source', 'source_ref', 'legacy_id', 'keep_because', 'migration_note'];
// v1 fields that become events and are not stored on the record.
const DROPPED = ['status', 'created', 'close', 'history'];

// Who wrote an event the v1 file did not record but the fold needs
// (`triaged` before a T/Q/P, `created` without a v1 created record).
export const SYNTH_BY = 'migration (v2)';

// The v1 migration's own marker for the never-re-checked closes (D-M6E13-14).
const LEGACY_PROOF = 'legacy — not re-verified';

// D-M6E13-20 (Brett): closed `fixed` with no commit in the proof; migrate as
// legacy closes with reason and proof text kept. Named, not inferred — any
// other `fixed` close without a commit is unmapped.
export const NO_COMMIT_LEGACY_IDS = Object.freeze(['SIG-123', 'SIG-142', 'SIG-161']);

// A commit token is the word `commit` followed by 7–64 lowercase hex. A bare
// hex run without the word is not one: a test count or a hash-looking word
// would otherwise become a "proof" (Decision 11).
const COMMIT_RE = /\bcommit\s+([0-9a-f]{7,64})\b/g;
const AT_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/;
const EPIC_ID_RE = /^M\d+(\.\d+)*\.E\d+$/;

// Where a v1 item may sit, and the statuses each folder allows (D-M6E11-8:
// folder and status agree in v1, so a disagreement is an error, not a choice).
function placeOf(relPath) {
  const parts = relPath.split('/');
  const dir = parts.slice(0, -1);
  if (dir.length === 2 && dir[0] === 'work' && dir[1] === 'inbox') return { statuses: ['N'], epic: null };
  if (dir.length === 2 && dir[0] === 'work' && dir[1] === 'backlog') return { statuses: ['T'], epic: null };
  if (dir.length === 3 && dir[0] === 'work' && dir[1] === 'done' && /^\d{4}-\d{2}$/.test(dir[2])) {
    return { statuses: ['C'], epic: null };
  }
  if (dir.length === 3 && dir[0] === 'work' && dir[1] === 'epics') return { statuses: ['Q', 'P', 'C'], epic: dir[2] };
  if (dir.length === 3 && dir[0] === 'archive' && dir[1] === 'epics') return { statuses: ['C'], epic: dir[2] };
  return null;
}

/**
 * The folder a v2 item's body lives in, relative to `.planning/`:
 * `work/items/NN`, NN = floor(n / 1000) as two digits (`SIG-5` → `work/items/00`).
 *
 * @param {string} id
 * @returns {string}
 */
export function bodyDirFor(id) {
  return `work/items/${String(Math.floor(itemNumber(id) / 1000)).padStart(2, '0')}`;
}

// A pasted legacy BUGS.md row (D-M6E13-13): `| B62 | `confirmed` | P2 | text |`.
// ID cell, then a status cell (a backticked word, optionally followed by a
// note such as `(v0.1.20)`), then a priority cell (`P2`, `**P1**` or a dash),
// then the text — taken whole, never split on `|`, because pipes live inside
// its code spans. The trailing `|` is optional (SIG-52 and SIG-99 have none).
// Only a row whose ID is the item's own legacy_id is cleaned; any other row is
// a quotation and is left as it is.
const ROW_RE = /^\|\s*(B\d+)\s*\|\s*(`[a-z-]+`(?:\s*\([^)|]*\))?)\s*\|\s*(\*\*P\d\*\*|P\d|—|-)\s*\|\s?(.*?)(?:\s*\|)?\s*$/;

const isFence = (line) => /^\s*(```|~~~)/.test(line);

function cleanRows(body, legacyId, cellsRemoved) {
  let fence = false;
  return body
    .split('\n')
    .map((line, i) => {
      if (isFence(line)) {
        fence = !fence;
        return line;
      }
      const m = fence ? null : ROW_RE.exec(line);
      if (!m || m[1] !== legacyId) return line;
      cellsRemoved.push(
        { line: i + 1, cell: 'id', text: m[1] },
        { line: i + 1, cell: 'status', text: m[2] },
        { line: i + 1, cell: 'priority', text: m[3] },
      );
      return m[4];
    })
    .join('\n');
}

// `rewriteRelativeLinks` changes link targets only, so a changed line has the
// same `](…)` matches in the same order before and after; pairing by index
// lists exactly the targets that moved.
const TARGET_RE = /\]\(([^)]+)\)/g;
function listRewrites(before, after, linksRewritten) {
  const a = before.split('\n');
  const b = after.split('\n');
  a.forEach((line, i) => {
    if (line === b[i]) return;
    const from = [...line.matchAll(TARGET_RE)].map((m) => m[1]);
    const to = [...b[i].matchAll(TARGET_RE)].map((m) => m[1]);
    from.forEach((f, k) => {
      if (f !== to[k]) linksRewritten.push({ line: i + 1, from: f, to: to[k] });
    });
  });
}

function dirOf(relPath) {
  return relPath.split('/').slice(0, -1).join('/');
}

// One v1 close record (the current `close`, or a `history` entry) → events.
// Returns {events, form, note} or {error}.
function closeEvents(id, close, where) {
  const { reason, by, at } = close;
  const proof = typeof close.proof === 'string' ? close.proof.trim() : undefined;
  const head = { at, by };

  if (proof === LEGACY_PROOF) {
    const event = { type: 'closed', ...head, reason, legacy: true };
    if (reason === 'dup') event.dup_of = close.dup_of;
    return { events: [event], form: 'legacy' };
  }
  if (reason === 'fixed') {
    if (NO_COMMIT_LEGACY_IDS.includes(id)) {
      const event = { type: 'closed', ...head, reason, legacy: true };
      if (proof) event.proof = proof;
      return { events: [event], form: 'legacy-no-commit' };
    }
    const shas = [...new Set([...(proof ?? '').matchAll(COMMIT_RE)].map((m) => m[1]))];
    if (shas.length === 0) {
      return { error: `${where}: unmapped — a fixed close with no commit in its proof (${JSON.stringify(proof ?? null)})` };
    }
    if (shas.length > 1) {
      return { error: `${where}: unmapped — more than one commit in the proof (${shas.join(', ')})` };
    }
    const rest = proof
      .replace(COMMIT_RE, '')
      .replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, '')
      .trim();
    return {
      events: [{ type: 'close_requested', ...head, reason: 'fixed', proof: shas[0] }],
      form: 'close_requested',
      note: rest || undefined,
    };
  }
  if (reason === 'dup') {
    // AC1.4: proof on every close that is not legacy, dup included. Writing a
    // proof the v1 close did not have would be inventing one.
    if (!proof) return { error: `${where}: unmapped — a dup close (of ${close.dup_of}) with no proof text` };
    return { events: [{ type: 'closed', ...head, reason, proof, dup_of: close.dup_of }], form: 'dup' };
  }
  // rejected / wontdo / stale: a direct close needs its proof text.
  if (!proof) return { error: `${where}: a ${reason} close needs proof text, and this one has none` };
  return { events: [{ type: 'closed', ...head, reason, proof }], form: 'direct' };
}

function fail(manifest, body, ...errors) {
  manifest.errors.push(...errors);
  return { record: null, body, manifest };
}

/**
 * Convert one v1 item file to a v2 record.
 *
 * Events, in order:
 * - `created`: the v1 `created` at/by. Without one, the earliest date the
 *   frontmatter records (`close.at`, `history[].at`, `history[].reopened_at`)
 *   or `fallbackAt`, whichever is earliest, by `SYNTH_BY`. Dates in the body are
 *   NOT read: they are about what the text describes, not the item. No date at
 *   all → an error.
 * - every `history[]` entry: its close, then `reopened`.
 * - `triaged` (synthesized) when the item must be at T or later and no reopen
 *   already put it there: v1 status T/Q/P, or a closed item in an Epic folder.
 *   A closed item from `done/` gets none — `closed` is legal from N, and v1
 *   recorded no triage, so nothing is lost.
 * - `queued` (status Q or C) or `started` (P) with `epic` = the Epic folder,
 *   for an item under `work/epics/<E>/` or `archive/epics/<E>/`.
 * - the current close, if C (Decision 11, D-M6E13-14, D-M6E13-20).
 *
 * Synthesized events take the previous event's `at`, so the list stays in time
 * order. Every mapping is listed in the manifest; the result is checked with
 * `validateRecord` and `checkEvents`, and any failure is a manifest error with
 * `record: null` (and the body returned as read).
 *
 * Body (t1.4b): the item's own pasted legacy row loses its ID, status and
 * priority cells and keeps the rest as prose (D-M6E13-13); relative links are
 * rewritten from the v1 folder to `bodyDirFor(id)`. Each removed cell and each
 * rewritten link is listed in the manifest with its body line number.
 *
 * @param {{relPath: string, text: string, fallbackAt?: string}} input
 *   `relPath` is relative to `.planning/` (`work/backlog/SIG-5.md`).
 *   `fallbackAt` is a date the caller knows (e.g. the file's first commit).
 * @returns {{record: object|null, body: string, manifest: object}}
 */
export function convertV1Item({ relPath, text, fallbackAt }) {
  const manifest = {
    id: null,
    source: relPath,
    fieldsMapped: [],
    fieldsDropped: [],
    cellsRemoved: [],
    linksRewritten: [],
    closeForm: null,
    errors: [],
  };
  const { item, body, errors } = parseItem(text, { path: relPath });
  if (!item) return fail(manifest, body, ...errors);
  manifest.id = typeof item.id === 'string' ? item.id : null;
  if (errors.length > 0) return fail(manifest, body, ...errors);

  const fileName = relPath.split('/').at(-1);
  if (fileName !== `${item.id}.md`) {
    return fail(manifest, body, `${relPath}: file name ${fileName} is not the item ID ${item.id}`);
  }
  const place = placeOf(relPath);
  if (!place) return fail(manifest, body, `${relPath}: ${dirOf(relPath)} is not a v1 item folder`);
  if (!place.statuses.includes(item.status)) {
    return fail(manifest, body, `${relPath}: status ${item.status} does not belong in ${dirOf(relPath)}`);
  }
  if (place.epic !== null && !EPIC_ID_RE.test(place.epic)) {
    return fail(manifest, body, `${relPath}: Epic folder ${place.epic} is not an Epic ID`);
  }
  if (fallbackAt !== undefined && (typeof fallbackAt !== 'string' || !AT_RE.test(fallbackAt))) {
    return fail(manifest, body, `${relPath}: fallbackAt ${JSON.stringify(fallbackAt)} is not a date`);
  }

  const record = {};
  for (const key of CARRIED) {
    if (item[key] !== undefined) {
      record[key] = item[key];
      manifest.fieldsMapped.push({ from: key, to: key });
    }
  }
  manifest.fieldsDropped = DROPPED.filter((key) => item[key] !== undefined);

  const events = [];
  const push = (event, from, note) => {
    manifest.fieldsMapped.push({ from, to: `events[${events.length}]`, ...(note ? { note } : {}) });
    events.push(event);
  };
  const synth = (type, extra, from, note) =>
    push({ type, at: events.at(-1).at, by: SYNTH_BY, ...extra }, from, `${note} (synthesized)`);

  // created
  if (item.created !== undefined) {
    push({ type: 'created', at: item.created.at, by: item.created.by }, 'created');
  } else {
    const known = [];
    if (item.close) known.push(['close.at', item.close.at]);
    (item.history ?? []).forEach((h, i) => {
      known.push([`history[${i}].at`, h.at], [`history[${i}].reopened_at`, h.reopened_at]);
    });
    if (fallbackAt !== undefined) known.push(['fallbackAt', fallbackAt]);
    const dated = known.filter(([, at]) => typeof at === 'string' && AT_RE.test(at));
    if (dated.length === 0) {
      return fail(manifest, body, `${relPath}: no created date known (no v1 created record, no dated close or history, no fallbackAt)`);
    }
    const [from, at] = dated.reduce((a, b) => (b[1] < a[1] ? b : a));
    manifest.fieldsMapped.push({ from, to: 'events[0].at', note: 'no created record; earliest known date' });
    push({ type: 'created', at, by: SYNTH_BY }, from, 'no created record (synthesized)');
  }

  // reopen history
  const notes = [];
  for (const [i, h] of (item.history ?? []).entries()) {
    const where = `${relPath}: history[${i}]`;
    const mapped = closeEvents(item.id, h, where);
    if (mapped.error) return fail(manifest, body, mapped.error);
    for (const e of mapped.events) push(e, `history[${i}]`, mapped.form);
    if (mapped.note) notes.push(mapped.note);
    push({ type: 'reopened', at: h.reopened_at, by: h.reopened_by, reason: h.reopen_reason }, `history[${i}].reopened_*`);
  }

  // triaged / queued / started
  const needsT = ['T', 'Q', 'P'].includes(item.status) || place.epic !== null;
  if (needsT && !item.history) synth('triaged', {}, 'status', `status ${item.status} implies triage`);
  if (place.epic !== null) {
    const type = item.status === 'P' ? 'started' : 'queued';
    synth(type, { epic: place.epic }, 'folder', `in Epic folder ${place.epic}`);
  }

  // current close
  if (item.status === 'C') {
    const mapped = closeEvents(item.id, item.close, `${relPath}: close`);
    if (mapped.error) return fail(manifest, body, mapped.error);
    for (const e of mapped.events) push(e, 'close', mapped.form);
    if (mapped.note) notes.push(mapped.note);
    manifest.closeForm = mapped.form;
  }

  if (notes.length > 0) {
    record.migration_note = [record.migration_note, ...notes].filter(Boolean).join(' ');
    manifest.fieldsMapped.push({ from: 'close.proof (text beside the commit)', to: 'migration_note' });
  }
  record.events = events;

  const invalid = [...validateRecord(record), ...checkEvents(record).map((e) => e.message)];
  if (invalid.length > 0) return fail(manifest, body, ...invalid.map((e) => `${relPath}: ${e}`));

  // Body: clean the pasted row first, so links in its text are rewritten too.
  const cleaned = cleanRows(body, item.legacy_id, manifest.cellsRemoved);
  const moved = rewriteRelativeLinks(cleaned, dirOf(relPath), bodyDirFor(item.id));
  listRewrites(cleaned, moved, manifest.linksRewritten);
  return { record, body: moved, manifest };
}
