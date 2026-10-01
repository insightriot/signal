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

import { cite } from './advise.js';
import { verifyCitations, EVIDENCE_MARKER } from './citations.js';

export const PRIORITY_COUNT = Object.freeze({ min: 3, max: 5 });
export const WHY_MAX_SENTENCES = 3;
export const TITLE_MAX = 120;

const BUG_ID_RE = /^B\d+$/;
const ROW_REF_RE = /^(.+):(\d+)$/;

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
 * `covers` entries are either a live backlog row, written as its citation
 * (`.planning/BACKLOG.md:42`), or an open bug's id (`B254`). Both resolve to a
 * line in this corpus, which is what lets every covered thing be cited.
 *
 * @param {string} baseDir
 * @param {unknown} priorities — parsed JSON from the agent
 * @param {object} corpus — the `readCorpus` result the digest was built from
 * @returns {Promise<{ok: boolean, reasons: string[], priorities: Array<{title: string, why: string,
 *   covers: Array<{kind: 'row'|'bug', id: string|null, label: string, path: string, line: number}>,
 *   evidence: string[]}>}>}
 */
export async function validatePriorities(baseDir, priorities, corpus) {
  const reasons = [];
  const out = [];

  if (!Array.isArray(priorities)) {
    return { ok: false, reasons: ['the proposal must be a JSON array of priorities'], priorities: [] };
  }
  if (priorities.length < PRIORITY_COUNT.min || priorities.length > PRIORITY_COUNT.max) {
    reasons.push(`${priorities.length} priorities proposed — propose between ${PRIORITY_COUNT.min} and ${PRIORITY_COUNT.max}`);
  }

  const rows = corpus?.sources?.backlog?.rows ?? [];
  const rowByRef = new Map(rows.map((r) => [`${r.path}:${r.line}`, r]));
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
      return;
    }
    const title = typeof p.title === 'string' ? p.title.trim() : '';
    const why = typeof p.why === 'string' ? p.why.trim() : '';
    if (!title) reasons.push(`${n}: title is missing or empty`);
    else if (title.length > TITLE_MAX) reasons.push(`${n}: title is ${title.length} characters — keep it under ${TITLE_MAX}`);
    if (!why) reasons.push(`${n}: why is missing or empty`);
    else if (countSentences(why) > WHY_MAX_SENTENCES) reasons.push(`${n}: why runs ${countSentences(why)} sentences — at most ${WHY_MAX_SENTENCES}`);
    for (const [field, text] of [['title', title], ['why', why]]) {
      if (text.includes(EVIDENCE_MARKER)) reasons.push(`${n}: ${field} contains the evidence marker "${EVIDENCE_MARKER}" — put citations in evidence`);
      if (/[\r\n]/.test(text)) reasons.push(`${n}: ${field} must be one line`);
    }

    const covers = [];
    if (!Array.isArray(p.covers) || p.covers.length === 0) {
      reasons.push(`${n}: covers must list at least one backlog row (".planning/BACKLOG.md:LINE") or open bug id ("B12")`);
    } else {
      for (const raw of p.covers) {
        const c = typeof raw === 'string' ? raw.trim() : '';
        if (BUG_ID_RE.test(c)) {
          const bug = openBugs.get(c);
          if (!bug) reasons.push(`${n}: covers ${c}, which is not an open bug in ${corpus?.sources?.bugs?.path ?? 'BUGS.md'}`);
          else covers.push({ kind: 'bug', id: c, label: bug.headline.replace(/\*\*/g, ''), path: bug.path, line: bug.line });
        } else if (ROW_REF_RE.test(c)) {
          const row = rowByRef.get(c);
          if (!row) reasons.push(`${n}: covers ${c}, which is not the line of a live backlog row`);
          else covers.push({ kind: 'row', id: row.leadingId ?? null, label: row.text, path: row.path, line: row.line });
        } else {
          reasons.push(`${n}: covers entry ${JSON.stringify(raw)} is neither a backlog row citation nor a bug id`);
        }
      }
      for (const c of covers) {
        const key = `${c.path}:${c.line}`;
        if (coveredBy.has(key) && coveredBy.get(key) !== i) {
          reasons.push(`${n}: ${c.id ?? key} is already covered by priority ${coveredBy.get(key) + 1} — each row sits under one priority`);
        }
        coveredBy.set(key, i);
      }
    }

    const evidence = [];
    if (!Array.isArray(p.evidence) || p.evidence.length === 0) {
      reasons.push(`${n}: evidence must list at least one "path:line" citation`);
    } else {
      for (const raw of p.evidence) {
        const e = typeof raw === 'string' ? raw.trim() : '';
        if (!e || /[`\s,]/.test(e) || e.includes(EVIDENCE_MARKER)) {
          reasons.push(`${n}: evidence entry ${JSON.stringify(raw)} is not a single "path:line" token`);
          continue;
        }
        evidence.push(e);
        allEvidence.push({ n, e });
      }
    }
    out.push({ title, why, covers, evidence });
  });

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
