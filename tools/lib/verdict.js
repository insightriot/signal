/**
 * Reading a unit's verdict — honestly (M5.E18 FR2).
 *
 * PLAN research measured every terminal artifact on the 12-project corpus:
 * **11 of 31 (35%) carry no parseable verdict.** `unreadable` is therefore the
 * majority path, not a defensive branch, and FR4's four-status reporting is
 * what keeps that from reading as "nothing to archive".
 *
 * THE RULE: a verdict is a VALUE, and only a value.
 *
 *   1. Headings are skipped. Six corpus files write `## Verdict` (or `## 5.
 *      Verdict`, `## VERIFY phase verdict`) with the outcome somewhere in the
 *      body below.
 *   2. `Verdict` must open the line, modulo markdown decoration. This is what
 *      rejects `**Nyquist verdict: STRICT-clean.**` — a COVERAGE verdict, not an
 *      outcome. A first-match parser reads `STRICT-clean` as the unit's result.
 *   3. The outcome token must be UPPERCASE `PASS` / `FAIL`. Prose is not a
 *      value.
 *   4. First value wins. Stated, not accidental — `M1-VERIFICATION.md` carries
 *      one at line 5 and a restatement at line 83.
 *
 * WHY NOT READ THE BODY UNDER A HEADING. Measured: 3 of the 6 heading-style
 * files do have a value in the body. But `agent-builder`'s reads **"All 22
 * acceptance criteria pass."** — a lowercase `pass` inside prose, which a body
 * scan cannot distinguish from **"Only 3 of 22 criteria pass."** It would
 * produce a confident wrong answer, which is the exact defect class this Epic
 * exists to end. Those three units go to `cannotDetermine`, where a person can
 * look — and FR4 reports them as needing one, rather than silently as clean.
 */

/** Terminal artifacts, most authoritative first (AC2.8). */
const TERMINAL_RANK = Object.freeze(['VERIFICATION', 'SHIP']);

// Every occurrence of the bare word `verdict`, wherever it sits on the line.
const VERDICT_WORD = /verdict\b/gi;

// Markdown decoration to strip when deciding what precedes a `verdict`.
const DECORATION = /[\s>*_`~#-]+$/;

/**
 * Is this `verdict` occurrence QUALIFIED by a preceding word?
 *
 * `**Nyquist verdict: STRICT-clean.**` is a coverage verdict, not an outcome —
 * a first-match parser reads `STRICT-clean` as the unit's result. But
 * `**Tier:** FULL / strict · **Verdict:** ✅ **PASS**` is a real verdict that
 * simply is not line-initial, and `## Verdict: **PASS-WITH-A-DOCUMENTED-GAP**`
 * is a real verdict inside a heading. Both are Signal's own format.
 *
 * So position on the line is the wrong test; what matters is whether a WORD
 * immediately precedes it. Strip markdown decoration from the text before the
 * match: if what remains ends in a word character, the verdict is qualified.
 */
function isQualified(before) {
  const stripped = before.replace(DECORATION, '');
  return /\w$/.test(stripped);
}

// Uppercase only. `PASS-WITH-FIXES` counts as a pass: M5.E9 and M5.E13 both
// shipped under it (D-M5E17-1), so it is a real outcome, not a hedge.
const OUTCOME = /\b(PASS|FAIL)\b/;

/**
 * Read the verdict out of a terminal artifact's content.
 *
 * Never throws and never guesses: anything it cannot read as an explicit value
 * is `unreadable`, which the closure resolver turns into `cannotDetermine`.
 *
 * @param {string|null|undefined} content
 * @returns {{status: 'pass'|'fail'|'unreadable', evidence: string|null}}
 */
export function parseVerdict(content) {
  if (typeof content !== 'string' || content === '') {
    return { status: 'unreadable', evidence: null };
  }
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (line === '') continue;

    // An unqualified `verdict` must appear on the line...
    VERDICT_WORD.lastIndex = 0;
    let unqualified = false;
    for (let m = VERDICT_WORD.exec(line); m; m = VERDICT_WORD.exec(line)) {
      if (!isQualified(line.slice(0, m.index))) { unqualified = true; break; }
    }
    if (!unqualified) continue;

    // ...AND the outcome must be on that SAME line. This is what keeps a bare
    // `## Verdict` heading unreadable while `## Verdict: **PASS**` is read: the
    // heading defers its value to the body, and the body is prose we refuse to
    // guess at (see the module docblock).
    const outcome = line.match(OUTCOME);
    if (!outcome) continue;

    return {
      status: outcome[1] === 'PASS' ? 'pass' : 'fail',
      evidence: line,
    };
  }
  return { status: 'unreadable', evidence: null };
}

/**
 * Order a unit's files by verdict authority, dropping non-terminal ones.
 *
 * FR2(a) accepted *"a `VERIFICATION` **or** `SHIP` artifact"* without ranking
 * them — and `traction-engine`'s `PHASE8` has BOTH, one carrying `Verdict: PASS`
 * and one carrying no verdict at all. Unranked, `PHASE8` resolved `closed` or
 * `cannotDetermine` purely by directory walk order. `VERIFICATION` wins because
 * it is where the criteria are actually checked; `SHIP` records that a release
 * happened, which is a weaker claim about correctness.
 *
 * @param {string[]} files  bare filenames belonging to one unit
 * @returns {string[]} terminal artifacts, most authoritative first
 */
export function rankTerminalArtifacts(files) {
  const ranked = [];
  for (const suffix of TERMINAL_RANK) {
    const matches = (files ?? [])
      .filter((f) => typeof f === 'string' && f.endsWith(`-${suffix}.md`))
      .sort();
    ranked.push(...matches);
  }
  return ranked;
}
