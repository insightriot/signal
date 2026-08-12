// FR4 — corrections retracted at the granularity people search at (M5.E10 S5.t1).
//
// The rule this enforces is not "a correction exists somewhere in the file".
// It is: **every line that still asserts the retracted claim must correct
// itself, read alone.**
//
// WHY THE LINE IS THE UNIT. `grep -rn` prints one line. A reader greps for a
// claim, sees a hit, and takes it at face value — a correction three lines below
// is invisible to that reading, and grep-shaped reading is exactly how the field
// defect propagated from VERIFY into REVIEW: the second document restated the
// first document's claim, having only seen the line.
//
// THE RESOLUTION OF THE TWO RULES THAT LOOK OPPOSED (AC4.3). Signal's records
// are amend-never-rewrite: history is not deleted. And a corpus grep for a
// retracted claim must come back clean. Both hold if the matching line is
// **self-correcting rather than absent**:
//
//     ~~still owed~~ **[RETRACTED — see amendment below]**
//
// The claim stays on the record. The line no longer asserts it.
//
// NOT A PROSE READER. It tests for a retraction MARKER on the line, which is a
// deterministic, offline, mechanical thing. It cannot tell whether the
// surrounding sentence is honest — nothing here can — and the messages say so
// rather than implying a semantic guarantee.

/** Markers that make a line self-correcting. Matched case-insensitively. */
const RETRACTION_MARKERS = [
  /~~[^~]+~~/, // struck through
  /\bRETRACTED\b/i,
  /\bSUPERSEDED\b/i,
  /\bNO LONGER (?:TRUE|HOLDS|APPLIES|ACCURATE)\b/i,
  /\bTHIS (?:CLAIM|LINE|STATEMENT) IS (?:FALSE|WRONG)\b/i,
  /\bCORRECTED\b/i,
  // "That rule is wrong and is not what ships." — the form a real retraction in
  // this repo took, and one the first version of this list did not recognise.
  /\b(?:IS|WAS|ARE|WERE) WRONG\b/i,
  /\[FALSE\]/i,
];

// A LIMIT, STATED RATHER THAN DISCOVERED LATER: prose wraps, and this check
// reads lines. A claim split across two wrapped lines matches neither of them.
//
// That is coherent with the threat model rather than a hole in it — the reading
// being defended against is `grep -rn`, which is equally blind to a phrase that
// spans a line break, so a claim in that shape is not one a reader finds by
// searching. It IS a hole in any use of this check as a general corpus audit,
// and it was found the honest way: this module's first test against a real
// retraction in `DECISIONS.md` passed while matching NOTHING — clean and
// blind rendering identically, which is the defect this Epic exists to kill,
// inside its own test.

/** @enum {string} */
export const CORRECTION = Object.freeze({
  CLEAN: 'clean',
  UNCORRECTED: 'uncorrected',
  CANNOT_EVALUATE: 'cannot-evaluate',
});

/**
 * Does this line correct itself?
 * @param {string} line
 * @returns {boolean}
 */
export function lineSelfCorrects(line) {
  return RETRACTION_MARKERS.some((re) => re.test(line));
}

/**
 * Check a corpus for uncorrected assertions of a retracted claim.
 *
 * @param {{
 *   claim: string|RegExp,
 *   files: Array<{path: string, content: string}>,
 * }} input
 * @returns {{
 *   outcome: string,
 *   reason: string|null,
 *   uncorrected: Array<{path: string, line: number, text: string}>,
 *   corrected: Array<{path: string, line: number}>,
 * }}
 */
export function checkCorrectionProtocol(input) {
  const empty = { uncorrected: [], corrected: [] };
  const cannot = (reason) => ({ ...empty, outcome: CORRECTION.CANNOT_EVALUATE, reason });

  const claim = input?.claim;
  const files = input?.files;

  if (claim == null || (typeof claim !== 'string' && !(claim instanceof RegExp))) {
    return cannot('no claim given to search for');
  }
  if (typeof claim === 'string' && claim.trim() === '') {
    return cannot('the claim to search for is empty — every line would match');
  }
  if (!Array.isArray(files) || files.length === 0) {
    return cannot('no files to search — the corpus was not readable, which is not the same as clean');
  }

  const matcher =
    claim instanceof RegExp
      ? new RegExp(claim.source, claim.flags.replace('g', ''))
      : { test: (line) => line.toLowerCase().includes(claim.toLowerCase()) };

  const uncorrected = [];
  const corrected = [];

  for (const file of files) {
    if (!file || typeof file.content !== 'string') continue;
    const lines = file.content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (!matcher.test(text)) continue;
      const record = { path: file.path, line: i + 1 };
      if (lineSelfCorrects(text)) corrected.push(record);
      else uncorrected.push({ ...record, text: text.trim().slice(0, 160) });
    }
  }

  return {
    outcome: uncorrected.length > 0 ? CORRECTION.UNCORRECTED : CORRECTION.CLEAN,
    reason: null,
    uncorrected,
    corrected,
  };
}

/**
 * Whether an `uncorrected` result blocks the SHIP gate (AC4.4, `D-M5E10-3`).
 *
 * Blocks at FULL, advisory below — the same shape as every other tier-gated
 * gate in Signal. A `cannot-evaluate` never blocks at any tier: refusing to
 * ship because a check could not look is a different failure, and a worse one.
 *
 * @param {{outcome: string}} result
 * @param {string} tier
 * @returns {{blocks: boolean, severity: 'blocking'|'advisory'|'none'}}
 */
export function correctionGateSeverity(result, tier) {
  if (result?.outcome !== CORRECTION.UNCORRECTED) {
    return { blocks: false, severity: result?.outcome === CORRECTION.CANNOT_EVALUATE ? 'advisory' : 'none' };
  }
  const blocks = tier === 'FULL';
  return { blocks, severity: blocks ? 'blocking' : 'advisory' };
}
