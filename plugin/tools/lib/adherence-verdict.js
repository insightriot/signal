// tools/lib/adherence-verdict.js — the control arm's verdict logic (M5.E8, FR2 + FR3).
//
// The harness's whole claim to being a MEASUREMENT rather than an observation
// rests on this file. A trace observed after running a command proves nothing on
// its own: the agent might do that thing anyway. Only the DIFFERENCE between a
// run with the instruction and a run without it says the instruction caused
// anything.
//
// Four verdicts, and three of them are not "pass":
//
//   OBEYED         trace present with the instruction, absent without it.
//   INERT          trace present in BOTH arms. The instruction caused nothing.
//                  A FINDING, not a failure, and never retried until it passes
//                  (NFR4). This Epic pre-declared it as the acceptable worst
//                  case for its own first canary.
//   ABSENT         trace in neither arm. Nothing happened; the instruction was
//                  not followed and the fixture may not even have reached it.
//   INDETERMINATE  anything unclean: a split vote, a failed or timed-out run, or
//                  a backwards result. An honest "we do not know".
//
// And one refusal, which outranks all four: if the mutation was not PROVEN to
// reach the agent, no verdict is emitted at all. Without that, a seam failure
// makes both arms identical and reports INERT — a plumbing bug wearing the
// costume of a legitimate finding, passing through the one guardrail meant to
// catch surprises. Same discipline as AC1.4: never emit a result-shaped output
// when you did not measure.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CANARY_REGISTRY_PATH = 'references/adherence-canaries.json';

export const VERDICT = Object.freeze({
  OBEYED: 'obeyed',
  INERT: 'inert',
  ABSENT: 'absent',
  INDETERMINATE: 'indeterminate',
});

/**
 * Load the canary registry. Every entry declares its trace before any run
 * (AC3.3); the registry is the auditable file AC3.1 asks for.
 */
export function loadCanaryRegistry(rootDir) {
  const reg = JSON.parse(readFileSync(join(rootDir, CANARY_REGISTRY_PATH), 'utf-8'));
  assertRegistryShape(reg);
  return reg;
}

/**
 * AC1.1 — every canary declares an isolation scope and a list of deletion sites.
 *
 * This throws rather than defaulting, and the difference is the whole Epic. The
 * previous schema carried ONE anchor, so a canary whose instruction was stated in
 * five files still produced a one-file mutation — and the arm that was supposed to
 * lack the instruction contained it four more times (`B55`). A shape that silently
 * falls back to one-file behavior reproduces exactly that, so an under-specified
 * canary is refused at load: no run, rather than a run whose verdict is void.
 */
export function assertRegistryShape(registry) {
  for (const c of registry?.canaries ?? []) {
    const id = c.id ?? '(unnamed canary)';
    if (c.isolation !== 'directive') {
      throw new Error(
        `${id}: canary must declare isolation: "directive" — got ${JSON.stringify(c.isolation)}. ` +
        'An undeclared scope is an unmeasurable one; see D-M5E15-1.'
      );
    }
    if (!Array.isArray(c.deletions) || c.deletions.length === 0) {
      throw new Error(
        `${id}: canary must declare a non-empty deletions[] naming every site that ORDERS ` +
        'the instruction. A single-anchor canary is the shape that produced `B55`.'
      );
    }
    for (const entry of c.deletions) {
      if (!entry?.file) {
        throw new Error(`${id}: every deletions[] entry must name a file.`);
      }
      const hasSection = typeof entry.section === 'string';
      const hasLine = typeof entry.line === 'string';
      if (!hasSection && !hasLine) {
        throw new Error(
          `${id}: deletions[] entry for ${entry.file} declares neither "section" nor "line". ` +
          'Deleting nothing from a declared site leaves the instruction in the control arm.'
        );
      }
      if (hasSection && hasLine) {
        throw new Error(
          `${id}: deletions[] entry for ${entry.file} declares BOTH "section" and "line". ` +
          'Which one the control arm removes must not be ambiguous.'
        );
      }
    }

    // The residue token the leak walk greps for. Checked here because the walk
    // hands it straight to String.includes: an absent token becomes the literal
    // "undefined", which occurs throughout a JavaScript corpus, so the run
    // refuses while naming a token that was never declared. Fail-closed, but the
    // operator is given a nonsense cause for a measurement that cost money.
    // An empty string is worse — it matches every line of every file.
    if (typeof c.trace?.functionName !== 'string' || c.trace.functionName.length === 0) {
      throw new Error(
        `${id}: canary must declare trace.functionName — the residue token the leak ` +
        'check greps for. Without it the control arm cannot be verified at all.'
      );
    }
  }
  return registry;
}

/**
 * Collapse one arm's per-run booleans into hits + spread.
 * AC2.3: a single run cannot show spread, so it is refused rather than reported.
 */
export function summarizeArm(runResults) {
  if (!Array.isArray(runResults) || runResults.length < 2) {
    throw new Error(
      `summarizeArm: need at least two runs, got ${runResults?.length ?? 0}. ` +
      'A single run per arm produces a verdict with no spread, and AC2.3 does not ' +
      'permit single-run verdicts.'
    );
  }
  const hits = runResults.filter(Boolean).length;
  return {
    runs: runResults.length,
    hits,
    rate: hits / runResults.length,
    unanimous: hits === 0 || hits === runResults.length,
  };
}

/**
 * The verdict function. FIXED IN ADVANCE — see `verdictRule` in the registry.
 *
 * Deliberately conservative: with a nondeterministic process, anything short of
 * a unanimous split is INDETERMINATE rather than rounded into a finding. A
 * 2-of-3 "obeyed" is not a result, and calling it one is how a measurement turns
 * into a story about itself.
 *
 * @param {{treatmentHits:number, controlHits:number, runsPerArm:number,
 *          failedRuns?:number, seamProven?:boolean}} input
 *   treatment = the arm WITH the instruction; control = the arm with it deleted.
 */
export function resolveVerdict({
  treatmentHits,
  controlHits,
  runsPerArm,
  failedRuns = 0,
  seamProven = true,
}) {
  if (!seamProven) {
    throw new Error(
      'Refusing to emit a verdict: the mutation-visibility precondition did not pass, ' +
      'so it is not established that the agent read the mutated command tree. Both arms ' +
      'would agree and the result would read as INERT — a plumbing failure disguised as ' +
      'a finding. Run `node tools/adherence-run.js --probe` first.'
    );
  }

  if (failedRuns > 0) return VERDICT.INDETERMINATE;

  const allTreatment = treatmentHits === runsPerArm;
  const noTreatment = treatmentHits === 0;
  const allControl = controlHits === runsPerArm;
  const noControl = controlHits === 0;

  if (allTreatment && noControl) return VERDICT.OBEYED;
  if (allTreatment && allControl) return VERDICT.INERT;
  if (noTreatment && noControl) return VERDICT.ABSENT;
  return VERDICT.INDETERMINATE;
}

/**
 * Delete a whole markdown section — the heading and everything under it, up to
 * the next heading of the same or higher level.
 *
 * WHY THIS EXISTS, and it is the most important comment in this file.
 *
 * The control arm originally deleted a single LINE. For the `B41` canary that
 * left behind the section heading and two further paragraphs that named the
 * measured function and explained precisely when and why to call it. The first
 * live control run produced the trace — and would have been recorded as INERT,
 * i.e. "M5.E9's fix does nothing".
 *
 * The heading and the function name are deliberately NOT quoted here (M5.E15
 * S1.t7). `tools/` is inside the copied tree the control agent reads, so an
 * apparatus comment restating the measured instruction is itself a leak — the
 * same class FR4 excludes the registry for, arriving through the machinery
 * instead of the data. The registry is the single home for the literal text.
 *
 * It was not inert. The instruction was still in the file. A one-line deletion is
 * not a control when the surrounding prose repeats the instruction, and Signal's
 * command files are written exactly that way: an instruction, then its rationale,
 * then its timing rule. The false verdict would have been indistinguishable from
 * a real finding — and the plan had pre-committed to accepting `inert` without
 * alarm, which is what would have carried it into the log.
 */
export function applySectionDeletion(source, headingLine) {
  const lines = source.split('\n');
  const start = lines.findIndex(l => l.trim() === headingLine.trim());
  if (start === -1) {
    throw new Error(
      `applySectionDeletion: section not found — no line equals ${JSON.stringify(headingLine)}. ` +
      'Deleting nothing would leave both arms identical, which reads as INERT.'
    );
  }
  const level = (lines[start].match(/^#+/) ?? ['#'])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) { end = i; break; }
  }
  lines.splice(start, end - start);
  return lines.join('\n');
}

/**
 * Did one run produce the canary's declared trace?
 *
 * The field name comes from the registry and was declared before any run
 * (AC3.3). An unknown field throws rather than returning false — a typo'd trace
 * name that quietly reported "no trace" in both arms would read as INERT.
 */
export function traceHit(diff, field) {
  switch (field) {
    case 'phaseChanged':
      return diff.phaseChanged !== null && diff.phaseChanged !== undefined;
    case 'completedPhasesGrew':
      return Boolean(diff.completedPhasesGrew);
    case 'filesAdded':
      return (diff.filesAdded?.length ?? 0) > 0;
    case 'filesChanged':
      return (diff.filesChanged?.length ?? 0) > 0;
    case 'commitsAdded':
      return (diff.commitsAdded ?? 0) > 0;
    default:
      throw new Error(
        `traceHit: unknown trace field ${JSON.stringify(field)}. A trace name the harness ` +
        'cannot evaluate would report "no trace" in both arms, which reads as INERT.'
      );
  }
}

/**
 * AC2.4 — apply the control-arm deletion to a COPY of a command file.
 *
 * Both failure modes throw rather than degrade, because both would silently
 * produce two identical arms, and two identical arms read as INERT:
 *   - target absent  → nothing deleted, no control at all;
 *   - target repeated → ambiguous deletion is not a controlled change.
 */
export function applyDeletion(source, targetLine) {
  const lines = source.split('\n');
  const matches = lines
    .map((line, i) => (line.includes(targetLine) ? i : -1))
    .filter(i => i !== -1);

  if (matches.length === 0) {
    throw new Error(
      `applyDeletion: target line not found — no match for ${JSON.stringify(targetLine)}. ` +
      'Deleting nothing would leave both arms identical, which reads as INERT.'
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `applyDeletion: target matched more than once (${matches.length}x) — ` +
      'an ambiguous deletion is not a controlled change.'
    );
  }

  lines.splice(matches[0], 1);
  return lines.join('\n');
}

/**
 * AC1.4 — apply every deletion entry that targets one file.
 *
 * The dispatcher, and `applyDeletion`'s first live caller. Until M5.E15 the line
 * path was the false branch of a ternary whose condition was always true, so it
 * shipped exercised only by unit tests. `ship.md` is the first real entry to use
 * it, because its section also orders `completePhase` (see AC1.5).
 *
 * Both primitives already throw on an absent anchor and on an ambiguous line
 * match; this routes per entry so a five-site canary gets five enforced
 * deletions rather than one and four silent skips.
 */
export function applyDeletions(source, entries) {
  let out = source;
  for (const entry of entries) {
    out = typeof entry.section === 'string'
      ? applySectionDeletion(out, entry.section)
      : applyDeletion(out, entry.line);
  }
  return out;
}

// A backticked call in Signal's command copy: `fn(` or `await fn(`. The absence
// of \s* before "(" is deliberate — `REVIEW (YYYY-MM-DD)` is a date annotation,
// not an ordered call, and matching it would flag every section that mentions one.
const ORDERED_CALL = /`(?:await\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\(/g;

/**
 * AC1.5 — a section anchor must cover the measured instruction and nothing else
 * that is itself an order.
 *
 * `applySectionDeletion` deletes to the next same-or-higher heading. That makes a
 * section anchor safe only when the whole span belongs to the one instruction.
 * Point it at a heading that also orders a different call and the control arm
 * differs from the treatment arm in more than the thing being measured — the
 * verdict is then about the section, not the instruction.
 *
 * This is over-deletion, and it invalidates a run exactly as under-deletion does.
 * The live example is a ship step that orders the measured call AND a second,
 * unrelated one; that site is therefore declared by line. The four command
 * sections that order the measured call and nothing else are declared by section.
 *
 * Neither the headings nor the function names are quoted here, for the reason
 * given on `applySectionDeletion` above: this file ships inside the copied tree.
 */
export function assertSectionAnchorIsDiscrete(source, headingLine, residueToken) {
  const lines = source.split('\n');
  const start = lines.findIndex(l => l.trim() === headingLine.trim());
  if (start === -1) {
    throw new Error(
      `assertSectionAnchorIsDiscrete: section not found — no line equals ${JSON.stringify(headingLine)}.`
    );
  }
  const level = (lines[start].match(/^#+/) ?? ['#'])[0].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) { end = i; break; }
  }

  const foreign = new Set();
  for (const line of lines.slice(start, end)) {
    let m;
    ORDERED_CALL.lastIndex = 0;
    while ((m = ORDERED_CALL.exec(line))) {
      if (m[1] !== residueToken) foreign.add(m[1]);
    }
  }
  if (foreign.size > 0) {
    throw new Error(
      `Section ${JSON.stringify(headingLine)} is not a discrete anchor for ${residueToken}: ` +
      `its span also orders ${[...foreign].join(', ')}. Deleting it would remove instructions ` +
      'the experiment is not measuring — declare this site by line instead.'
    );
  }
}
