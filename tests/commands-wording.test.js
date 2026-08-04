// tests/commands-wording.test.js — M5.E13 S2.t4/t5 (FR1.1, FR1.4).
//
// Two prose invariants that no test held before, and whose absence is why
// `B48` and `B51` both shipped:
//
//   AC1.1 — the four middle phase commands state the phase-entry transition in
//           ONE shared wording, conditional on preconditions passing.
//   AC1.5 — no command instructs a phase transition that the NEXT command also
//           performs.
//
// Prose is agent-executed, so it is exactly as load-bearing as code and gets
// exactly as much pinning. M5.E8 established the technique on ADHERENCE-LOG.md.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CMD = join(ROOT, 'commands');
const MIDDLE = ['plan', 'execute', 'verify', 'review'];
const read = (f) => readFileSync(join(CMD, `${f}.md`), 'utf-8');

describe('M5.E13 S2.t4 — the phase-entry instruction is conditional and shared (AC1.1)', () => {
  const CONDITION = '**Call this only if every precondition above passed.**';

  it('all four middle commands carry the conditional clause', () => {
    for (const f of MIDDLE) expect(read(f), f).toContain(CONDITION);
  });

  it('the old UNCONDITIONAL phrasing is gone from every command', () => {
    // The exact string B48 was filed against.
    for (const f of MIDDLE) {
      expect(read(f), f).not.toMatch(/\*\*Before any Workflow step\*\*, call `await transitionPhase/);
    }
  });

  it('the four wordings are IDENTICAL apart from the phase name — drift is caught, not trusted', () => {
    // A single shared wording was the requirement (FR1.1) precisely so the four
    // cannot diverge. Normalising the phase token is what makes them comparable.
    const normalised = MIDDLE.map((f) => {
      const src = read(f);
      const start = src.indexOf(CONDITION);
      expect(start, `${f}: conditional clause missing`).toBeGreaterThan(-1);
      const end = src.indexOf('\n## ', start);
      return src
        .slice(start, end === -1 ? undefined : end)
        .replace(/\b(PLAN|EXECUTE|VERIFY|REVIEW)\b/g, '{PHASE}');
    });
    for (const n of normalised.slice(1)) expect(n).toBe(normalised[0]);
  });

  it('each command still names its OWN phase in the call (normalisation did not hide a copy-paste bug)', () => {
    for (const f of MIDDLE) {
      const phase = f.toUpperCase();
      expect(read(f), f).toContain(`transitionPhase(baseDir, '${phase}')`);
    }
  });
});

describe('M5.E13 S2.t5 — no command sets a phase the next command also sets (AC1.5, B51)', () => {
  it('discuss.md no longer instructs the DISCUSS close to set phase: PLAN', () => {
    const src = read('discuss');
    // B51: the stale block was doubly wrong — the pre-M5.E9 convention (the
    // OUTGOING command advanced the phase) AND the pre-schema_version:1 file
    // format (## Current Phase headings, which parseFrontmatter cannot read).
    // Line-anchored: an actual markdown HEADING, not a backticked mention of
    // one. The prose that replaced the block necessarily names it, and a naive
    // substring match flags the explanation as the defect.
    expect(src).not.toMatch(/^##\s*Current Phase\s*$/m);
    expect(src).not.toMatch(/^##\s*Completed Phases\s*$/m);
  });

  it('AUDIT (recorded either way — "nothing to change" is a result, not a skip)', () => {
    // calibrate.md: describes the CALIBRATE->DISCUSS handoff, a transition no
    // other command claims. Checked 2026-07-29: no collision, nothing changed.
    expect(read('calibrate')).toContain('transitionPhase');
    // ship.md: already-corrected prose (M5.E9/B43). SHIP is terminal, so
    // nothing transitions out of it and no next command can double-record.
    expect(read('ship')).toContain('transitionPhase');
    // The audit's finding is asserted, so a future edit that introduces a
    // double-set in either file fails here rather than being rediscovered.
    for (const f of ['calibrate', 'ship', 'discuss']) {
      expect(read(f), `${f}: pre-schema_v1 phase-heading block reintroduced`).not.toMatch(
        /^##\s*Completed Phases\s*$/m
      );
    }
  });

  it('no OTHER command file carries the stale pre-schema_v1 phase-set block either', () => {
    const stale = readdirSync(CMD)
      .filter((f) => f.endsWith('.md'))
      .filter((f) => /^##\s*Completed Phases\s*$/m.test(readFileSync(join(CMD, f), 'utf-8')));
    expect(stale).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// M5.E17 — instructions that contradict other instructions (FR1, FR2, FR3).
//
// Same technique as M5.E13 above, aimed at three new pairs. The Epic exists
// because nothing compares one instruction against another, so two documents
// can give an agent conflicting orders indefinitely and only a live run
// reveals it. Each block below pins one such pair.
//
// AC corrections (M5.E17-PLAN.md § "AC corrections"): the REQUIREMENTS wrote
// AC2.1 and AC3.1 in forms that a NO-OP satisfies — review.md's three Critical
// statements already agreed with each other (the disagreement was with
// practice), and a command that states NO ordering passes "does not instruct
// markFresh before the commit" while carrying the same defect. Both are
// executed here in their corrected forms, AC2.1' and AC3.1'.
// ---------------------------------------------------------------------------

/** Markdown emphasis must be stripped before matching prose. plan.md:173 reads
 *  "Run it **after** the commit", so a naive /after\s+the\s+commit/ false-REDs
 *  the two files that are already CORRECT — and a test that fails on correct
 *  input gets "fixed" by weakening it. Found by running the assertion at PLAN. */
const denorm = (s) => s.replace(/\*\*|__|\*|_/g, '');

describe("M5.E17 S2 — every markFresh call site states its ordering (AC3.1', FR3)", () => {
  // A file "instructs a markFresh call" iff it uses CALL syntax (open paren).
  // A bare mention is not a call site: execute.md names `markFresh` only in its
  // "Why this exists" prose paragraph, describing the M5.E9 bug.
  const CALL_RE = /markFresh\(/;
  // Explicit, reasoned exclusion — NOT a regex tuned until it happens to miss.
  // /sig:checkpoint IS the manual refresh command; markFresh against HEAD is
  // its purpose, not a phase-close stamp, so "after the commit" does not apply.
  const EXEMPT = new Set(['checkpoint.md']);

  const callSites = readdirSync(CMD)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => CALL_RE.test(readFileSync(join(CMD, f), 'utf-8')))
    .filter((f) => !EXEMPT.has(f));

  it('enumerates call sites dynamically (a NEW command that calls markFresh is caught)', () => {
    // Not asserted against a hardcoded list — the predicate does the work, so a
    // future command is covered without anyone remembering to add it here.
    expect(callSites.length).toBeGreaterThanOrEqual(5);
    expect(callSites).toContain('ship.md');
    // The predicate must exclude the prose-only mention.
    expect(callSites, 'execute.md names markFresh in prose, not as a call').not.toContain(
      'execute.md'
    );
  });

  it.each(['discuss.md', 'plan.md', 'review.md', 'ship.md', 'verify.md'])(
    '%s states that markFresh runs AFTER the commit it stamps',
    (file) => {
      const text = denorm(readFileSync(join(CMD, file), 'utf-8'));
      expect(
        /after\s+the\s+commit/i.test(text),
        `${file}: markFresh call site states no ordering. Silence is the defect — ` +
          `the agent picks, and ship.md picked wrong on 2026-07-30 (FR3).`
      ).toBe(true);
    }
  );

  it('ship.md instructs an actual commit — four steps stage into one nothing creates', () => {
    const ship = readFileSync(join(CMD, 'ship.md'), 'utf-8');
    // §5.5, §6, §6.5 and §8 each say "stage ... into the SHIP commit".
    const stagingSteps = ship.match(/into the SHIP commit/gi) ?? [];
    expect(stagingSteps.length).toBeGreaterThanOrEqual(3);
    // ... so a step must exist that MAKES it. Without this, markFresh cannot
    // run "after the commit" no matter where it sits.
    expect(
      /###\s*\d+(\.\d+)?\.?\s+Create the SHIP commit/i.test(ship),
      'ship.md stages into "the SHIP commit" but never instructs making it'
    ).toBe(true);
  });

  it('AUDIT — markFresh ordering across all call sites (recorded either way, AC3.2)', () => {
    // Checked 2026-07-31. Result at PLAN: 2 explicit / 2 silent / 1 wrong.
    //   plan.md:173, discuss.md:168 — explicit and correct, wording reused below
    //   verify.md:84, review.md:137 — SILENT (no ordering stated)
    //   ship.md:100                 — WRONG (§5.3, ahead of four staging steps)
    //   execute.md:50               — not a call site (prose mention)
    //   checkpoint.md:57            — different contract, exempt above
    // FR3.2 named three siblings to check; the sweep found five call sites.
    // "Checked, nothing to change" is a result, not a skip (M5.E13 AC1.5).
    const wording = 'after the commit';
    for (const f of ['plan', 'discuss']) {
      expect(denorm(read(f)), `${f}: the reference wording regressed`).toContain(wording);
    }
    // B55 NOTE: making all four match byte-for-byte puts four copies of this
    // instruction in the corpus, which the adherence canary's per-file control
    // arm cannot isolate. Drift is the worse failure so this is deliberate —
    // but any future canary on THIS instruction inherits B55 and is untrusted
    // until M5.E15 fixes the control arm corpus-wide.
    expect(true).toBe(true);
  });
});

describe("M5.E17 S3 — review.md's three Critical statements express one rule (AC2.1', FR2)", () => {
  // D-M5E17-1: a Critical DISCOVERED AND CLOSED inside REVIEW, under the
  // conditions already written for Important, is PASS-WITH-FIXES. A Critical
  // failing any one of those, or not fixed in-phase, stays FAIL.
  //
  // This comment used to enumerate THREE conditions while review.md stated
  // four — B78 counted this block as the rule's fifth disagreeing voice, and
  // the count is deliberately not restated here now. D-M5E18-6 settles the set
  // at five and the block below pins it; naming a number in two places is the
  // defect being fixed.
  //
  // As-written AC2.1 asked only that the table and the guidance paragraph agree
  // WITH EACH OTHER. They already did — all three said Critical => FAIL — so
  // that test passes today with zero edits. What disagreed was PRACTICE: M5.E9
  // and M5.E13 both shipped PASS-WITH-FIXES with an in-phase Critical. This
  // pins all three against the RATIFIED RULE instead.
  const review = () => readFileSync(join(CMD, 'review.md'), 'utf-8');

  it('the verdict-table FAIL row no longer reads "Any Critical"', () => {
    const row = review().match(/^\|\s*FAIL\s*\|.*$/m)?.[0];
    expect(row, 'FAIL row not found in review.md').toBeTruthy();
    expect(
      /any\s+critical/i.test(denorm(row)),
      'FAIL row still says "Any Critical" — contradicts D-M5E17-1'
    ).toBe(false);
    // It must still FAIL a Critical that was NOT fixed in-phase.
    expect(denorm(row).toLowerCase()).toContain('critical');
  });

  it('the PASS-WITH-FIXES checklist bullet admits an in-phase Critical', () => {
    const bullet = review().match(/^-\s*\[\s*\]\s*PASS-WITH-FIXES.*$/m)?.[0];
    expect(bullet, 'PASS-WITH-FIXES checklist bullet not found').toBeTruthy();
    expect(
      denorm(bullet).toLowerCase(),
      'checklist bullet still says Important-only'
    ).toContain('critical');
  });

  it('the PASS-WITH-FIXES guidance paragraph admits an in-phase Critical', () => {
    const para = review().match(/\*\*PASS-WITH-FIXES guidance\.\*\*[\s\S]*?\n\n/)?.[0];
    expect(para, 'PASS-WITH-FIXES guidance paragraph not found').toBeTruthy();
    expect(
      denorm(para).toLowerCase(),
      'guidance paragraph still scopes the rule to Important only'
    ).toContain('critical');
  });

  it('the conditions stay CONJUNCTIVE — "small diff" alone must not qualify', () => {
    // The recorded counter-argument to D-M5E17-1: "Critical" exists to force a
    // harder stop, and "the diff was small" is how a Critical gets under-fixed.
    const para = review().match(/\*\*PASS-WITH-FIXES guidance\.\*\*[\s\S]*?\n\n/)?.[0] ?? '';
    const text = denorm(para).toLowerCase();
    expect(text).toContain('50 loc');
    expect(text, 'the tests-green condition dropped out').toMatch(/tests?\s+(still\s+)?pass|green/);
    expect(text, 'the no-design-impact condition dropped out').toMatch(/design|architect/);
  });

  it('DECISIONS.md records D-M5E17-1 with its rationale (AC2.2)', () => {
    const decisions = readFileSync(join(ROOT, '.planning/DECISIONS.md'), 'utf-8');
    expect(decisions).toContain('D-M5E17-1');
    // The counter-argument is part of the decision, not decoration — a rule
    // about how Signal judges its own work records why it might be wrong.
    expect(decisions.toLowerCase()).toContain('conjunctive');
  });
});

describe('B78 — review.md states the PASS-WITH-FIXES rule ONCE (D-M5E18-6)', () => {
  // review.md stated this rule in four places and no two agreed, and the test
  // block above was a fifth voice. Three disagreements, each pinned here:
  //   (1) the condition SET — the paragraph declared four, then named further
  //       disqualifiers that were in neither the four nor the table;
  //   (2) the OPERATOR — <= 50 / < 50 / > 50 across three statements, so a fix
  //       of exactly 50 lines fell through both table rows and had no verdict;
  //   (3) the DENOMINATOR — "50 LOC" of what was never stated, and under every
  //       reading tests inflated the count, so the reviewer who wrote a
  //       regression test landed nearer FAIL than the one who did not.
  //
  // These assert the statements against EACH OTHER, not against a remembered
  // rule. That is the only shape that catches the next drift.
  const review = () => readFileSync(join(CMD, 'review.md'), 'utf-8');
  const para = () =>
    denorm(review().match(/\*\*PASS-WITH-FIXES guidance\.\*\*[\s\S]*?\n\n/)?.[0] ?? '');
  const row = (verdict) =>
    denorm(review().match(new RegExp(`^\\|\\s*${verdict}\\s*\\|.*$`, 'm'))?.[0] ?? '');

  it('the guidance paragraph is one unbroken paragraph (the capture above depends on it)', () => {
    // Guard for the regex every assertion in this block and the last one runs
    // through: break the paragraph into a list and `para` silently shrinks to
    // the intro sentence, turning real pins vacuous instead of red.
    expect(para().length, 'guidance paragraph not found or truncated').toBeGreaterThan(400);
  });

  it('paragraph and table agree on the OPERATOR — no strict "< 50" survives', () => {
    expect(para(), 'paragraph uses a strict operator').not.toMatch(/<\s*50/);
    expect(row('PASS-WITH-FIXES'), 'PASS-WITH-FIXES row uses a strict operator').not.toMatch(/<\s*50/);
    expect(para(), 'paragraph lost the <= 50 cap').toMatch(/≤\s*50/);
    expect(row('PASS-WITH-FIXES'), 'PASS-WITH-FIXES row lost the <= 50 cap').toMatch(/≤\s*50/);
  });

  it('a fix of EXACTLY 50 lines has a verdict — the rows must not leave a gap', () => {
    // The concrete failure: paragraph said <= 50, PASS row said < 50, FAIL row
    // said > 50. Exactly 50 matched the paragraph and neither row.
    expect(row('PASS-WITH-FIXES')).toMatch(/≤\s*50/); // 50 admitted here
    expect(row('FAIL')).toMatch(/>\s*50/); // and excluded only above 50
  });

  it('the cap states its DENOMINATOR everywhere it states the number', () => {
    for (const [where, text] of [
      ['paragraph', para()],
      ['PASS-WITH-FIXES row', row('PASS-WITH-FIXES')],
      ['FAIL row', row('FAIL')],
    ]) {
      expect(text.toLowerCase(), `${where} states 50 LOC without saying of what`).toMatch(
        /non-test source/
      );
    }
  });

  it('needing new coverage is an OBLIGATION, not a disqualifier (Brett, 2026-08-04)', () => {
    const text = para().toLowerCase();
    // The old rule bounced a fix back to EXECUTE for needing a test, which
    // penalised the reviewer who wrote one. It now requires the coverage.
    expect(text, 'still bounces a fix back for needing new tests').not.toMatch(
      /require new tests should fail/
    );
    expect(text, 'the new-coverage obligation is missing').toMatch(/new coverage/);
  });

  it('the new tests a fix carries do NOT count against its own cap', () => {
    // Without this the obligation above fights the cap: writing the required
    // regression test would push the fix over 50 and into FAIL.
    expect(para().toLowerCase(), 'the cap does not exempt the required coverage').toMatch(
      /(do(es)? not count|excluded from|never count)/
    );
  });

  it('no statement in review.md hardcodes a condition COUNT that can drift', () => {
    // Both ":125" and the D-M5E17-1 rationale paragraph said "four conditions"
    // while the trailing sentence smuggled in more. A count written in two
    // places is what drifted; the set is enumerated instead.
    expect(denorm(review()).toLowerCase(), 'a stale condition count survives').not.toMatch(
      /\b(one|two|three|four|five|six|seven)\s+conditions\b/
    );
  });

  it('DECISIONS.md records D-M5E18-6 without rewriting D-M5E17-1 in place', () => {
    const decisions = readFileSync(join(ROOT, '.planning/DECISIONS.md'), 'utf-8');
    expect(decisions).toContain('D-M5E18-6');
    // PROJECT.md makes IDs permanent addresses: a refinement supersedes by new
    // dated entry. D-M5E17-1 must still be readable where it was written.
    expect(decisions).toContain('D-M5E17-1');
    expect(decisions.toLowerCase()).toMatch(/non-test source/);
  });
});

describe('M5.E17 S4 — plan.md schedules what the Epic does for the FIRST TIME (FR1)', () => {
  // "Shipped but never run" is the best defect predictor Signal has: B54 (first
  // read of that file), B39's two fired triggers (first walk of the watchlist),
  // B42/B53 (first outside contact), B48 (first read of a transcript), B55
  // (first real use of the harness). Nothing scheduled the running.
  const plan = () => read('plan');

  it('carries the first-use instruction (AC1.1)', () => {
    expect(plan().toLowerCase()).toMatch(/for the first time/);
  });

  it('is specific about the FIRST WAVE, not merely "early" or "consider" (AC1.1)', () => {
    // The whole value is the scheduling. "Consider first-use" is advice; "put
    // it in wave 1" is an instruction.
    expect(denorm(plan()).toLowerCase()).toContain('first wave');
  });

  it('names a worked example so a reader knows what counts (AC1.2)', () => {
    const text = denorm(plan());
    expect(text).toMatch(/worked example/i);
    // The example must distinguish a NEW thing from a FIRST-RUN thing — the
    // distinction the instruction turns on.
    expect(text.toLowerCase()).toMatch(/never (been )?run|real purpose|not previously/);
  });
});

// ---------------------------------------------------------------------------
// M5.E17 follow-up — ship.md's body must not contradict its own Exit Criteria.
//
// The fourth instruction pair in this one file, and the one that let Signal
// exempt itself from the discipline it exists to enforce.
//
// §3 instructs "Create a pull request" and the Exit Criteria require "PR
// created with description, test plan" and "User approves PR for merge".
// §5 read: "required even if no PR was created (e.g., direct-to-main shipping
// for the Signal-on-Signal flow)".
//
// Written 2026-05-26. THIRTEEN releases shipped under it (v0.1.3 -> v0.1.15)
// and exactly ONE pull request existed across that span -- so both exit boxes
// were checked from the fact of having shipped rather than from an artifact.
// Nothing was ever going to catch it: the file defining the rule was the file
// granting the exception.
// ---------------------------------------------------------------------------
describe('M5.E17 follow-up — ship.md grants itself no PR exemption (D-M5E17-5)', () => {
  const ship = () => read('ship');

  it('the Exit Criteria still require a PR and an approval', () => {
    const exit = ship().slice(ship().indexOf('### Exit Criteria'));
    expect(exit).toMatch(/PR created/i);
    expect(exit).toMatch(/approves PR for merge/i);
  });

  it('no LIVE instruction says the PR is optional', () => {
    // The removal note necessarily quotes the old wording, so a naive
    // substring match flags the explanation as the defect — exactly the trap
    // B51's test documents ("the prose that replaced the block necessarily
    // names it"). Quoted spans are stripped first: a live instruction is never
    // inside quotation marks, so this separates the rule from its history
    // without hard-coding either.
    const stripQuoted = (s) => s.replace(/"[^"\n]*"/g, '');
    const text = stripQuoted(denorm(ship()));
    expect(
      /required even if no PR was created/i.test(text),
      'ship.md reinstated the direct-to-main exemption that contradicts its Exit Criteria'
    ).toBe(false);
  });

  it('REGRESSION: the guard still catches the exemption as a LIVE instruction', () => {
    // Proof it has teeth. The unquoted sentence — how it actually appeared in
    // ship.md from 2026-05-26 through v0.1.15 — must trip the same check.
    const stripQuoted = (s) => s.replace(/"[^"\n]*"/g, '');
    const asItShipped =
      'This step is now required even if no PR was created (e.g., direct-to-main ' +
      'shipping for the Signal-on-Signal flow) so STATE.md never lags behind.';
    expect(/required even if no PR was created/i.test(stripQuoted(asItShipped))).toBe(true);
  });

  it('the removal is recorded, not silently dropped (AC1.5 convention)', () => {
    expect(ship()).toMatch(/No direct-to-main exemption/i);
    expect(ship()).toContain('D-M5E17-5');
  });

  it('DECISIONS.md carries D-M5E17-5 with the two-lane rule', () => {
    const d = readFileSync(join(ROOT, '.planning/DECISIONS.md'), 'utf-8');
    expect(d).toContain('D-M5E17-5');
    // PR discipline is constant; Epic ceremony is what varies.
    expect(d).toMatch(/Fix lane/i);
    expect(d).toMatch(/Epic lane/i);
  });
});
