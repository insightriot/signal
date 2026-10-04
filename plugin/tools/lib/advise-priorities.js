// The priorities contract — `M6.E12` S1 (`D-M6E12-6`).
//
// The agent running `/sig:advise` reads the digest and proposes 3–5 big-picture
// priorities. This module is the line between that judgment and the artifact:
// nothing a model wrote reaches the advisory unless it passes here first.
//
// ⚠ MODEL OUTPUT IS UNTRUSTED INPUT TO A RENDERER. A `why` carrying the evidence
// marker could forge a citation; a newline could forge document structure;
// an evidence token like `../../etc/passwd:1` could point the gate outside the
// repository. So: evidence is resolved by `verifyCitations` — the SAME resolver
// the run boundary uses, path confinement included — rather than by a second
// copy of its rules, and free text is refused here when it carries the marker
// (the renderer `quoteSafe`s it as well; two independent guards, on purpose).
//
// ⚠ IT RETURNS EVERY REASON, not the first (AC2.5). A model asked to fix a
// proposal one refusal at a time takes as many round trips as there are faults.

import { cite, rowKey } from './advise.js';
import { verifyCitations, EVIDENCE_MARKER } from './citations.js';
import { isBugId } from './legacy-lists.js';
import { ITEM_ID_RE } from './work-item.js';
import { listRecords } from './work-records.js';

export const PRIORITY_COUNT = Object.freeze({ min: 3, max: 5 });
export const WHY_MAX_SENTENCES = 3;
export const TITLE_MAX = 120;
/** Per-priority ceiling on `evidence`: model output is untrusted, and each token is a file read. */
export const PER_PRIORITY_MAX = 20;
/** Per-priority ceiling on `covers` — lookups, not reads, so wider (REVIEW pass 2: 20 refused a real grouping). */
export const COVERS_MAX = 50;
export const WHY_MAX = 600;
/** Characters that break a line for a reader or a multiline regex: CR, LF, NEL, LS, PS. */
const LINE_BREAK_RE = /[\r\n\u0085\u2028\u2029]/;

const ROW_REF_RE = /^(.+):(\d+)$/;
const NEW_RE = /^new:\s*/i;

/**
 * Why a work-store ID is not a cover, read from the store itself (AC3.3, AC7.3):
 * unknown, unreadable, closed, *closing*, a question, or still in the inbox. Only
 * called for an ID that is neither a live row nor an open bug in the corpus.
 */
function storeRefusal(lookup, id) {
  const index = lookup();
  if (index === null) return 'which the work store could not be read to resolve';
  const hit = index.get(id);
  if (!hit) return 'which is not an item in the work store';
  if (hit.broken) return 'whose record could not be read';
  if (hit.status === 'C') return 'which is closed';
  if (hit.status === 'closing') return 'which is closing — a fixed close waiting for its commit, so it counts as done';
  if (hit.type === 'Q') return 'which is an open question, not a backlog row or a bug';
  if (hit.status === 'N') return 'which is in the inbox and not yet triaged';
  return 'which is not a live backlog row or open bug in this corpus';
}

/** Sentences in `text`: terminal punctuation followed by space or end. */
export function countSentences(text) {
  const t = String(text ?? '').trim();
  if (!t) return 0;
  const ends = t.match(/[.!?](?=\s|$)/g);
  return ends ? ends.length : 1;
}

/**
 * Validate a proposal against the corpus it was made from.
 *
 * `covers` entries are a live backlog row, written as its citation
 * (`.planning/BACKLOG.md:42`), an open bug's id (`B254`) — both resolve to a line
 * in this corpus and are cited — or unfiled work, `new: <description>`, which has
 * no line and is labelled as such.
 *
 * ⚠ WITH THE WORK STORE ON (M6.E13 t4.2b, AC3.3) a row or bug is covered by its
 * item ID (`SIG-12`), resolved against the store: an unknown, closed or *closing*
 * item is refused, and so is the `BACKLOG.md:LINE` form — that file is a view of
 * the store. Store on is read from the corpus (`corpus.work`), so one run decides
 * it once. No list parser runs on that path.
 *
 * @param {string} baseDir
 * @param {unknown} priorities — parsed JSON from the agent
 * @param {object} corpus — the `readCorpus` result the digest was built from
 * @returns {Promise<{ok: boolean, reasons: string[], priorities: Array<{title: string, why: string,
 *   covers: Array<{kind: 'row'|'bug'|'new', id: string|null, label: string, path: string|null, line: number|null}>,
 *   evidence: string[], dependsOn: number[]}>}>}
 */
export async function validatePriorities(baseDir, priorities, corpus, { liveRows = null, droppedRows = [] } = {}) {
  const reasons = [];
  const out = [];

  if (!Array.isArray(priorities)) {
    return { ok: false, reasons: ['the proposal must be a JSON array of priorities'], priorities: [] };
  }
  if (priorities.length < PRIORITY_COUNT.min || priorities.length > PRIORITY_COUNT.max) {
    // Returned at once: everything below scales with the proposal's size, and a
    // proposal of the wrong size is refused whatever else is in it (REVIEW pass 1:
    // 40 priorities with dense `dependsOn` hung the cycle walk).
    return {
      ok: false,
      reasons: [`${priorities.length} priorities proposed — propose between ${PRIORITY_COUNT.min} and ${PRIORITY_COUNT.max}`],
      priorities: [],
    };
  }

  // Covers are checked against the rows that will appear as LIVE in the appendix.
  // `runAdvise` passes `classifyRows(...).live`; without it, a covered row the
  // appendix drops as Parked or folded rendered under a priority AND under
  // Dropped (REVIEW pass 1).
  const rows = liveRows ?? corpus?.sources?.backlog?.rows ?? [];
  const storeOn = Boolean(corpus?.work);
  // Read only when a store-on ID needs a refusal reason: `id -> {status, type}` or
  // `{broken}`, or null when the store cannot be read.
  let storeIndex;
  const lookup = () => {
    if (storeIndex !== undefined) return storeIndex;
    try {
      const { records, broken } = listRecords(baseDir);
      storeIndex = new Map([
        ...broken.filter((b) => b.id).map((b) => [b.id, { broken: true }]),
        ...records.map((r) => [r.id, { status: r.status, type: r.record.type }]),
      ]);
    } catch {
      storeIndex = null;
    }
    return storeIndex;
  };
  // Why each dropped row was dropped, so a refusal can say it (REVIEW pass 2: the
  // agent was told "not live" for a row the digest had offered, with no reason).
  const dropReason = new Map(droppedRows.map((d) => [rowKey(d), d.why]));
  const rowByRef = new Map(rows.map((r) => [rowKey(r), r]));
  const openBugs = new Map(
    (corpus?.sources?.bugs?.entries ?? [])
      .filter((e) => e.status === 'confirmed' || e.status === 'needs-triage')
      .map((e) => [e.id, e])
  );
  const coveredBy = new Map();
  const allEvidence = [];

  priorities.forEach((p, i) => {
    const n = `priority ${i + 1}`;
    if (p === null || typeof p !== 'object' || Array.isArray(p)) {
      reasons.push(`${n}: must be an object with title, why, covers and evidence`);
      out.push({ title: '', why: '', covers: [], evidence: [], dependsOn: [] }); // keeps indices aligned
      return;
    }
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    const why = typeof p.why === 'string' ? p.why.trim() : '';
    if (!title) reasons.push(`${n}: title is missing or empty`);
    else if (title.length > TITLE_MAX) reasons.push(`${n}: title is ${title.length} characters — keep it under ${TITLE_MAX}`);
    if (!why) reasons.push(`${n}: why is missing or empty`);
    else if (why.length > WHY_MAX) reasons.push(`${n}: why is ${why.length} characters — keep it under ${WHY_MAX}`);
    else if (countSentences(why) > WHY_MAX_SENTENCES) reasons.push(`${n}: why runs ${countSentences(why)} sentences — at most ${WHY_MAX_SENTENCES}`);
    for (const [field, text] of [['title', title], ['why', why]]) {
      if (text.includes(EVIDENCE_MARKER)) reasons.push(`${n}: ${field} contains the evidence marker "${EVIDENCE_MARKER}" — put citations in evidence`);
      // Every line-breaking character, not only CR/LF: U+2028 broke a multiline
      // regex's `^`/`$` and forged the pick heading (REVIEW pass 2).
      if (LINE_BREAK_RE.test(text)) reasons.push(`${n}: ${field} must be one line`);
    }

    const covers = [];
    if (!Array.isArray(p.covers) || p.covers.length === 0) {
      reasons.push(
        storeOn
          ? `${n}: covers must list at least one work item ID (a live backlog row or open bug, e.g. "SIG-12") or unfiled work ("new: …")`
          : `${n}: covers must list at least one backlog row (".planning/BACKLOG.md:LINE"), open bug id ("B12"), or unfiled work ("new: …")`
      );
    } else if (p.covers.length > COVERS_MAX) {
      reasons.push(`${n}: ${p.covers.length} covers entries — at most ${COVERS_MAX}`);
    } else {
      for (const raw of p.covers) {
        const c = typeof raw === 'string' ? raw.trim() : '';
        if (NEW_RE.test(c)) {
          // Work the corpus does not hold yet. A big-picture priority often names
          // something nobody has filed — measured on the first real run: the most
          // obvious priority (moving other projects onto the work store) was not a
          // row anywhere. It is allowed, labelled unfiled, and carries no citation.
          const label = c.replace(NEW_RE, '').trim();
          if (!label) reasons.push(`${n}: a "new:" covers entry needs a description`);
          else if (label.includes(EVIDENCE_MARKER) || LINE_BREAK_RE.test(label)) reasons.push(`${n}: "new:" entry must be one line without the evidence marker`);
          else covers.push({ kind: 'new', id: null, label, path: null, line: null });
        } else if (storeOn) {
          // Store on: an item ID, resolved against the store. Nothing here calls a
          // list parser — `isBugId` is one, so this branch comes before it.
          const row = ITEM_ID_RE.test(c) ? rowByRef.get(c) : undefined;
          const bug = ITEM_ID_RE.test(c) ? openBugs.get(c) : undefined;
          if (row) covers.push({ kind: 'row', id: row.id, label: row.text, path: row.path, line: null });
          else if (bug) covers.push({ kind: 'bug', id: c, label: bug.headline, path: bug.path, line: null });
          else if (ITEM_ID_RE.test(c) && dropReason.has(c)) reasons.push(`${n}: covers ${c}, but it is dropped from the appendix — ${dropReason.get(c)}`);
          else if (ITEM_ID_RE.test(c)) reasons.push(`${n}: covers ${c}, ${storeRefusal(lookup, c)}`);
          else if (ROW_REF_RE.test(c)) {
            reasons.push(`${n}: covers ${c} — with the work store on, a backlog row or bug is covered by its item ID (e.g. "SIG-12"), not by a line in a view`);
          } else {
            reasons.push(`${n}: covers entry ${JSON.stringify(raw)} is neither a work item ID (e.g. "SIG-12") nor unfiled work ("new: …")`);
          }
        } else if (isBugId(c)) {
          const bug = openBugs.get(c);
          if (!bug) reasons.push(`${n}: covers ${c}, which is not an open bug in ${corpus?.sources?.bugs?.path ?? 'BUGS.md'}`);
          else covers.push({ kind: 'bug', id: c, label: bug.headline.replace(/\*\*/g, ''), path: bug.path, line: bug.line });
        } else if (ROW_REF_RE.test(c)) {
          const row = rowByRef.get(c);
          if (!row && dropReason.has(c)) reasons.push(`${n}: covers ${c}, but ${c.split('/').pop()} is dropped from the appendix — ${dropReason.get(c)}`);
          else if (!row) reasons.push(`${n}: covers ${c}, which is not the line of a live backlog row`);
          else covers.push({ kind: 'row', id: row.leadingId ?? null, label: row.text, path: row.path, line: row.line });
        } else {
          reasons.push(`${n}: covers entry ${JSON.stringify(raw)} is neither a backlog row citation nor a bug id`);
        }
      }
      const seenHere = new Set();
      for (const c of covers) {
        if (c.kind === 'new') continue;
        const key = rowKey(c);
        if (seenHere.has(key)) {
          reasons.push(`${n}: covers ${c.kind === 'bug' ? c.id : key} twice`);
        } else if (coveredBy.has(key) && coveredBy.get(key) !== i) {
          reasons.push(`${n}: ${c.id ?? key} is already covered by priority ${coveredBy.get(key) + 1} — each row sits under one priority`);
        }
        seenHere.add(key);
        coveredBy.set(key, i);
      }
    }

    const evidence = [];
    if (!Array.isArray(p.evidence) || p.evidence.length === 0) {
      reasons.push(`${n}: evidence must list at least one "path:line" citation`);
    } else if (p.evidence.length > PER_PRIORITY_MAX) {
      reasons.push(`${n}: ${p.evidence.length} evidence entries — at most ${PER_PRIORITY_MAX}`);
    } else {
      for (const raw of p.evidence) {
        const e = typeof raw === 'string' ? raw.trim() : '';
        if (!e || /[`\s,]/.test(e) || e.includes(EVIDENCE_MARKER)) {
          reasons.push(`${n}: evidence entry ${JSON.stringify(raw)} is not a single "path" or "path:line" token`);
          continue;
        }
        evidence.push(e);
        allEvidence.push({ n, e });
      }
    }
    // `dependsOn` (optional): the priorities this one should come after, by number.
    // Added at VERIFY, from the first real ask: the user asked whether any priority
    // was a precondition of another, and one was (step 5 moves backlogs with the
    // reader that two of the bugs break) — but the contract had nowhere to say so,
    // so the dependency was left to whoever happened to notice.
    const dependsOn = [];
    if (p.dependsOn !== undefined) {
      if (!Array.isArray(p.dependsOn)) {
        reasons.push(`${n}: dependsOn must be a list of priority numbers`);
      } else if (p.dependsOn.length > PRIORITY_COUNT.max - 1) {
        // One reason, not one per entry: 2,000,000 entries produced 2,000,003 reasons (REVIEW pass 2).
        reasons.push(`${n}: dependsOn lists ${p.dependsOn.length} entries — at most ${PRIORITY_COUNT.max - 1}`);
      } else {
        for (const d of p.dependsOn) {
          if (!Number.isInteger(d) || d < 1 || d > priorities.length) reasons.push(`${n}: dependsOn ${JSON.stringify(d)} is not a priority number (1–${priorities.length})`);
          else if (d === i + 1) reasons.push(`${n}: cannot depend on itself`);
          else if (!dependsOn.includes(d)) dependsOn.push(d);
        }
      }
    }
    out.push({ title, why, covers, evidence, dependsOn });
  });

  // A cycle in dependsOn has no order to work in. Refused, naming the cycle.
  // Three-colour DFS: each priority is finished once, so the walk is linear in the
  // edges (the first version re-walked every path and doubled per priority).
  const state = new Array(out.length).fill(0); // 0 unseen, 1 on the stack, 2 done
  const stack = [];
  const dfs = (i) => {
    state[i] = 1;
    stack.push(i);
    for (const d of out[i].dependsOn) {
      const j = d - 1;
      if (state[j] === 1) return [...stack.slice(stack.indexOf(j)), j];
      if (state[j] === 0) {
        const found = dfs(j);
        if (found) return found;
      }
    }
    stack.pop();
    state[i] = 2;
    return null;
  };
  for (let i = 0; i < out.length; i++) {
    if (state[i] !== 0) continue;
    const cycle = dfs(i);
    if (cycle) {
      reasons.push(`dependsOn forms a cycle: ${cycle.map((x) => `priority ${x + 1}`).join(' → ')}`);
      break;
    }
  }

  // Resolve every evidence token through the gate's own resolver, one call per
  // token so an unresolved result names exactly which priority it came from.
  // A proposal carries a handful of tokens, so the cost is a few file reads.
  for (const { n, e } of allEvidence) {
    const v = await verifyCitations(baseDir, `x ${cite(e)}`);
    if (v.resolved.length !== 1) {
      const why = v.unresolved[0]?.reason ?? 'not a citation the advisory grammar reads (path or path:line)';
      reasons.push(`${n}: evidence ${e} does not resolve — ${why}`);
    }
  }

  return { ok: reasons.length === 0, reasons, priorities: out };
}
