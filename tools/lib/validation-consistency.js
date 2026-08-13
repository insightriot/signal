// FR2 — a VALIDATION artifact checked against itself (M5.E10 S2.t2).
//
// The field defect was a single file contradicting itself that nothing read:
// its completeness dimension assigned four acceptance criteria to slices, its
// Nyquist map carried no row for any of them, and the coverage line underneath
// reported "0 gaps" against a denominator that quietly excluded them.
//
// Nothing external is consulted. Both halves of the comparison are in the file,
// which is what makes this checkable at all — and what made it invisible: the
// two sections are 80 lines apart and nobody re-derives one from the other.
//
// TABLE ROWS ONLY. A sentence *about* a requirement, sitting inside a compared
// section, is indistinguishable from a row *covering* it — found while building
// this Epic's own sandbox fixture, where an explanatory line made its
// requirement look mapped. Prose inside the sections is deliberately not read.
//
// THREE OUTCOMES (NFR4). Real artifacts key their maps in at least three
// different ways: fully-qualified ids, prefix-once shorthand (`AC-16.6` then
// `16.7`), and slice ids (`S1.1`) that are a different namespace entirely.
// Where the two sections cannot be compared in the same namespace, the answer
// is `cannot-evaluate` WITH THE REASON — guessing an alignment would invent
// contradictions, and inventing a contradiction in a claim-integrity check is
// the defect it exists to catch.

import { extractRequirementIds, dropGroupLabels, canonicalId } from './requirement-ids.js';

/** @enum {string} */
export const CONSISTENCY = Object.freeze({
  CONSISTENT: 'consistent',
  INCONSISTENT: 'inconsistent',
  CANNOT_EVALUATE: 'cannot-evaluate',
});

const COMPLETENESS_RE = /completeness/i;
const NYQUIST_RE = /nyquist/i;

/** Markdown table rows within `text`, minus separator rows. */
function tableRows(text) {
  return text
    .split('\n')
    .filter((l) => l.trim().startsWith('|') && !/^\s*\|[\s:|-]+\|\s*$/.test(l));
}

/**
 * The body of the completeness dimension, whichever of the two shapes it takes:
 * its own `## … Completeness …` section, or one row of an 8-dimension table
 * whose Dimension cell reads "Completeness".
 */
function completenessBody(text) {
  const heading = text.split(/^##+ /m).find((s) => COMPLETENESS_RE.test(s.split('\n')[0]));
  if (heading) return heading;
  const row = tableRows(text).find((l) => COMPLETENESS_RE.test(l.split('|')[2] ?? ''));
  return row ?? null;
}

/** The Nyquist map section body. */
function nyquistBody(text) {
  const section = text.split(/^##+ /m).find((s) => NYQUIST_RE.test(s.split('\n')[0]));
  return section ?? null;
}

/**
 * Expand `AC1.1–1.3` (en dash or hyphen) into its members. Only within one
 * group: a range spanning groups is not a shape any artifact here writes, and
 * inventing members across groups would fabricate requirements.
 */
function expandRanges(text) {
  // The tail of `AC1.1–1.3` is `1.3` — group AND sub, not a bare sub. Reading
  // it as a bare sub expands the range to a single member and leaves `.3`
  // dangling, which reads as a different requirement entirely.
  return text.replace(
    /\b((?:N?FR|AC)-?)(\d+)\.(\d+)\s*[–—-]\s*(?:\2\.)?(\d+)\b/g,
    (whole, family, group, from, to) => {
      const a = Number(from);
      const b = Number(to);
      if (!Number.isFinite(a) || !Number.isFinite(b) || b < a || b - a > 50) return whole;
      const out = [];
      for (let n = a; n <= b; n++) out.push(`${family}${group}.${n}`);
      return out.join(' ');
    }
  );
}

/**
 * Resolve prefix-once shorthand: a bare `16.7` becomes `AC-16.7` when the
 * document already declares ids in that group, and stays unresolved when the
 * group is unknown or claimed by more than one family.
 */
function resolveShorthand(text, knownByGroup) {
  return text.replace(/(^|[^\w.-])(\d+)\.(\d+)\b/g, (whole, lead, group, sub, offset, full) => {
    const families = knownByGroup.get(group);
    if (!families || families.size !== 1) return whole;

    // A WORD adjacent to the decimal means it is prose, not an id.
    //
    // Without this, every bare decimal became a requirement id: a Notes cell
    // reading `took 3.4 seconds` became `AC-3.4`, landed in `mappedNotAssigned`,
    // and the artifact was reported `inconsistent`. `verify.md` §1b orders this
    // call on every VERIFY run and treats the result as a FAIL to loop back on,
    // so the check MANUFACTURED a contradiction and blocked the phase on it —
    // this module's own stated defect, committed by the module.
    //
    // **The obvious fix was measured wrong and is not what shipped.** Restricting
    // resolution to a row's first cell — the shape a key-position id takes — was
    // written first and broke the field fixture immediately: `eval-project-C`
    // writes its dimension-2 assignments inside a NOTES cell
    // (`AC-16.6→S3, 16.7→S2/S3, … AC-16.1/16.2/16.4/16.5 are …`), so three of the
    // four expected findings disappeared. Shorthand lives wherever ids are
    // listed; what it never does is sit against a word.
    // Prose on BOTH sides, not either: measured against the fixture again. The
    // list `AC-16.1/16.2/16.4/16.5 are satisfied across S3–S5` ends with a
    // shorthand id followed by a word, so an either-side rule dropped `16.5`
    // and the fixture lost a fourth expected finding. An id-list separator on
    // one side is enough evidence; a word on both sides is prose.
    //
    // The residual case is stated rather than hidden: `version 1.2, then …`
    // resolves, because a comma follows. It needs a group that declares exactly
    // one sub-numbered family, which is what keeps it narrow.
    const before = full.slice(0, offset + lead.length).replace(/\s+$/, '');
    const after = full.slice(offset + whole.length).replace(/^\s+/, '');
    if (/[A-Za-z]$/.test(before) && /^[A-Za-z]/.test(after)) return whole;

    return `${lead}${[...families][0]}-${group}.${sub}`;
  });
}

/**
 * group number → the families that write SUB-NUMBERED ids in it.
 *
 * Sub-numbered only, and that is the whole subtlety. Signal writes `FR6` beside
 * `AC6.1`/`AC6.2`, so a group commonly has two families and a naive
 * "resolve only when unambiguous" rule refuses every shorthand in the corpus —
 * measured: it reported `AC1.5` and `AC6.1` as unmapped when both were mapped
 * in shorthand. A bare `6.1` cannot mean `FR6`; it can only mean a sub-numbered
 * id, and only ACs are sub-numbered in that group.
 */
function familiesByGroup(text) {
  const map = new Map();
  for (const id of extractRequirementIds(text)) {
    const m = /^(NFR|FR|AC)-?(\d+)\.\d+$/.exec(id);
    if (!m) continue;
    if (!map.has(m[2])) map.set(m[2], new Set());
    map.get(m[2]).add(m[1]);
  }
  return map;
}

/**
 * Requirement ids in a section's table rows, shorthand and ranges resolved,
 * group headings dropped.
 *
 * Dropping headings is what stops this check inventing contradictions. A
 * completeness dimension legitimately lists `FR1` beside its `AC1.x` criteria;
 * a Nyquist map maps the CRITERIA, because criteria are what tests cover. Read
 * literally, every FR in the file then looks like an unmapped requirement —
 * measured on Signal's own corpus, where it turned 4 clean artifacts into
 * "inconsistent" before this line existed.
 */
function idsInRows(body, knownByGroup) {
  const rows = tableRows(body).join('\n');
  return dropGroupLabels(
    extractRequirementIds(resolveShorthand(expandRanges(rows), knownByGroup))
  );
}

/** Ids the document struck out of the unit (AC1.7's rule, applied here too). */
function deferredIds(text) {
  const out = new Set();
  for (const m of text.matchAll(/~~([^~]+)~~/g)) {
    for (const id of extractRequirementIds(m[1])) out.add(id);
  }
  // The field artifact defers in prose rather than strike-through: a cell
  // naming an id beside the word DEFERRED is the same statement.
  //
  // Split on sentence ends, newlines and semicolons — NOT on every `.`, which
  // cuts `AC-16.3` in half and loses the very id the sentence is deferring.
  for (const line of text.split(/\n|;|(?<=[.!?])\s+/)) {
    if (!/\bDEFERRED\b/i.test(line)) continue;

    // A TABLE ROW is not one statement — it is several cells, and the marker
    // belongs to the cell it sits in. Read whole, a row like
    // `| AC3.1 | S1 | blocked on AC3.9, which is DEFERRED |` deferred BOTH ids,
    // silencing `AC3.1` from `assignedNotMapped` while it was genuinely
    // unmapped: a real contradiction relabelled as a deferral, and a false
    // NEGATIVE, which this module elsewhere calls the harder half to notice.
    if (/^\s*\|/.test(line)) {
      const cells = line.split('|').filter((c) => c.trim() !== '');
      const marked = cells.filter((c) => /\bDEFERRED\b/i.test(c));
      const withId = marked.flatMap((c) => extractRequirementIds(c));
      if (withId.length > 0) {
        // The marker names its own ids — take exactly those.
        for (const id of withId) out.add(id);
      } else {
        // The marker names none, so it is about the row itself — but only when
        // the row HAS one subject. `| AC-16.3 | — | DEFERRED out of Phase 11 |`
        // is the field shape and must keep working; a row citing two ids with a
        // bare DEFERRED is ambiguous, and guessing is what produced the bug.
        const rowIds = [...new Set(extractRequirementIds(line))];
        if (rowIds.length === 1) out.add(rowIds[0]);
      }
      continue;
    }
    for (const id of extractRequirementIds(line)) out.add(id);
  }
  return out;
}

/**
 * Check a VALIDATION artifact's completeness assignments against its own
 * Nyquist map. Never throws (NFR3).
 *
 * @param {string|null|undefined} text
 * @returns {{
 *   outcome: string,
 *   reason: string|null,
 *   assignedNotMapped: string[],
 *   mappedNotAssigned: string[],
 *   deferred: string[],
 * }}
 */
export function checkValidationConsistency(text) {
  const empty = { assignedNotMapped: [], mappedNotAssigned: [], deferred: [] };
  const cannot = (reason) => ({ ...empty, outcome: CONSISTENCY.CANNOT_EVALUATE, reason });

  if (typeof text !== 'string' || text.trim() === '') {
    return cannot('no VALIDATION artifact to read');
  }

  const completeness = completenessBody(text);
  if (!completeness) return cannot('no completeness dimension found in this artifact');

  const nyquist = nyquistBody(text);
  if (!nyquist) return cannot('no Nyquist map found in this artifact');

  const knownByGroup = familiesByGroup(text);
  const assigned = idsInRows(completeness, knownByGroup);
  const mapped = idsInRows(nyquist, knownByGroup);

  if (assigned.length === 0) {
    return cannot('the completeness dimension names no requirement ids this check can read');
  }
  if (mapped.length === 0) {
    return cannot(
      'the Nyquist map names no requirement ids this check can read — it may key rows by slice id, which is a different namespace'
    );
  }

  // No id in common: the two sections are almost certainly keyed in different
  // namespaces (one by requirement, one by slice), not contradicting on every
  // single row. Reporting a wall of findings there would be this check
  // inventing the defect it exists to catch.
  const mappedSet = new Set(mapped.map(canonicalId));
  if (!assigned.some((id) => mappedSet.has(canonicalId(id)))) {
    return cannot(
      'the completeness dimension and the Nyquist map share no requirement id — they appear to be keyed in different namespaces'
    );
  }

  const deferred = [...deferredIds(text)];
  const deferredSet = new Set(deferred.map(canonicalId));
  const assignedSet = new Set(assigned.map(canonicalId));
  const unDeferred = (id) => !deferredSet.has(canonicalId(id));

  const assignedNotMapped = assigned.filter((id) => !mappedSet.has(canonicalId(id)) && unDeferred(id));
  const mappedNotAssigned = mapped.filter((id) => !assignedSet.has(canonicalId(id)) && unDeferred(id));

  const disagrees = assignedNotMapped.length > 0 || mappedNotAssigned.length > 0;
  return {
    outcome: disagrees ? CONSISTENCY.INCONSISTENT : CONSISTENCY.CONSISTENT,
    reason: null,
    assignedNotMapped,
    mappedNotAssigned,
    deferred: deferred.filter((id) => !mappedSet.has(canonicalId(id))),
  };
}
