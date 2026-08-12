// FR1 — the deterministic requirement-coverage diff (M5.E10 S2.t1).
//
// Every requirement ID declared in a REQUIREMENTS artifact must appear in the
// matching VERIFICATION artifact. Absent is RED, not a warning, and the absent
// ones are NAMED: the field defect this Epic exists to kill was a completeness
// claim written from the shape of the work, and a bare count is exactly that
// claim wearing a number.
//
// THREE OUTCOMES, ALWAYS (NFR4). `covered` / `missing` / `cannot-evaluate`.
// "Could not look" must never render as "checked and clean" — `B39`'s shape,
// and `M5.E16`'s hardest-won lesson.
//
// THE DENOMINATOR IS DERIVED, NOT ASSUMED (AC1.6, `D-M5E10-6`). A REQUIREMENTS
// artifact is often project-scoped — every unit's requirements in one file —
// while VERIFICATION is unit-scoped. Diffing those naively reports every other
// unit's requirements as missing: a red wall derived from the shape of the
// files rather than from the unit under verification, which is this Epic's own
// defect class.
//
// So the scope comes from ID-GROUP CORRESPONDENCE: the denominator is the union
// of the requirement groups the VERIFICATION artifact itself cites. Cite
// `AC-16.8`, and all of `AC-16.*` is in scope. **No prose is read, so no prose
// can be misread** — the rule this replaced scoped by sections naming the unit,
// and was measured wrong within the hour of being written: a *different* unit's
// section that merely mentioned this one would have contributed 70+ foreign ids.
//
// ITS BLIND SPOT, STATED RATHER THAN DISCOVERED LATER: a group the VERIFICATION
// cites NOTHING from is invisible to the diff — a wholly-omitted requirement
// group reads as out-of-scope. That is why `unattributableGroups` is on the
// record and reported by count, never passed over.

import { extractRequirementIds, groupOf, dropGroupLabels } from './requirement-ids.js';

/** @enum {string} */
export const COVERAGE = Object.freeze({
  COVERED: 'covered',
  MISSING: 'missing',
  CANNOT_EVALUATE: 'cannot-evaluate',
});

/** A `~~struck~~` id the document has taken out of the unit (AC1.7). */
function deferredIds(text) {
  const out = new Set();
  for (const m of text.matchAll(/~~([^~]+)~~/g)) {
    for (const id of extractRequirementIds(m[1])) out.add(id);
  }
  return out;
}

/**
 * Diff a REQUIREMENTS artifact against its VERIFICATION artifact.
 *
 * Never throws: every unreadable, absent or unparseable input resolves to
 * `cannot-evaluate` with a reason, because this feeds read-only surfaces (NFR3).
 *
 * @param {{requirementsText?: string|null, verificationText?: string|null}} input
 * @returns {{
 *   outcome: string,
 *   reason: string|null,
 *   missing: string[],
 *   deferred: string[],
 *   covered: string[],
 *   denominator: string[],
 *   unattributableGroups: string[],
 *   basis: {scoped: boolean, groups: string[]},
 * }}
 */
export function diffRequirementCoverage(input) {
  const empty = {
    missing: [],
    deferred: [],
    covered: [],
    denominator: [],
    unattributableGroups: [],
    basis: { scoped: false, groups: [] },
  };
  const cannot = (reason) => ({ ...empty, outcome: COVERAGE.CANNOT_EVALUATE, reason });

  const requirementsText = input?.requirementsText;
  const verificationText = input?.verificationText;

  if (typeof requirementsText !== 'string' || requirementsText.trim() === '') {
    return cannot('no REQUIREMENTS artifact to read');
  }
  if (typeof verificationText !== 'string' || verificationText.trim() === '') {
    return cannot('no VERIFICATION artifact to read');
  }

  const declared = dropGroupLabels(extractRequirementIds(requirementsText));
  if (declared.length === 0) {
    return cannot('the REQUIREMENTS artifact declares no requirement ids this check can read');
  }

  const verified = extractRequirementIds(verificationText);
  if (verified.length === 0) {
    return cannot('the VERIFICATION artifact cites no requirement ids to scope the diff against');
  }

  // --- the denominator ------------------------------------------------------
  const declaredGroups = [...new Set(declared.map(groupOf))];
  const citedGroups = [...new Set(verified.map(groupOf))].filter((g) => declaredGroups.includes(g));

  // One group in the whole file: nothing to scope: the file IS the unit.
  const scoped = declaredGroups.length > citedGroups.length && citedGroups.length > 0;
  const inScope = scoped ? citedGroups : declaredGroups;

  if (inScope.length === 0) {
    return cannot(
      'the VERIFICATION artifact cites no requirement group that appears in REQUIREMENTS'
    );
  }

  const denominator = declared.filter((id) => inScope.includes(groupOf(id)));
  const unattributableGroups = declaredGroups.filter((g) => !inScope.includes(g)).sort();

  // --- the diff -------------------------------------------------------------
  const deferredDeclared = deferredIds(requirementsText);
  const verifiedSet = new Set(verified);

  const covered = denominator.filter((id) => verifiedSet.has(id));
  const unverified = denominator.filter((id) => !verifiedSet.has(id));
  // A deferred requirement that WAS verified is covered, not deferred: the
  // document deferring it does not un-verify the evidence.
  const deferred = unverified.filter((id) => deferredDeclared.has(id));
  const missing = unverified.filter((id) => !deferredDeclared.has(id));

  return {
    outcome: missing.length > 0 ? COVERAGE.MISSING : COVERAGE.COVERED,
    reason: null,
    missing,
    deferred,
    covered,
    denominator,
    unattributableGroups,
    basis: { scoped, groups: [...inScope].sort() },
  };
}
