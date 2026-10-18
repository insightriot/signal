/**
 * review-rounds — the check a REVIEW report's fix rounds must pass before a
 * verdict is declared (M6.E17 S4, `D-M6E17-2`, AC2.3).
 *
 * WHY. *"Fixes to fixes get their own fresh reader"* found the worst defect in
 * M6.E14 and paid off four Epics running, and it was never a step. M6.E16's
 * REVIEW recorded its fresh reads by hand, in a different shape each round,
 * and nothing read them. `review.md` § 4.6 now makes every round of fixes
 * carry two lines, and this is what reads them:
 *
 *   ### Fix round N
 *   **Fresh read:** <base>..<head> — Critical N, Important N — stop: yes|no
 *   **Parent run:** <the summary line `parent-run.js` printed>   (or: gap — <why>)
 *
 * THE STOP RULE. A chain of rounds ends when a fresh read of a round finds
 * 0 Critical and 0 Important (`stop: yes`), or at the loop ceiling, whichever
 * comes first. So `stop: yes` is exactly "0 and 0", and a PASS or
 * PASS-WITH-FIXES needs the LAST round to be `stop: yes` — a chain that ended
 * at the ceiling with findings open is a FAIL, and the Loop Back asks a person.
 *
 * The verdict is passed in rather than read from the report: real reports run
 * to several passes with the verdict in prose, and the command declaring the
 * verdict already knows it.
 *
 * THE FLOOR (M6.E17 VERIFY D2). A report alone cannot show a round that was
 * never written down. Every REVIEW FAIL loop-back is followed by one round of
 * fixes, so `phase_passes` from STATE sets a floor: a PASS or PASS-WITH-FIXES
 * needs at least one round per recorded REVIEW FAIL. A pass record that does
 * not read refuses, the same rule as the loop ceiling's (D-M6E17-6).
 *
 * TIGHTENED AT M6.E17 REVIEW PASS 1. The record must be passed for a PASS or
 * PASS-WITH-FIXES (left out, the floor was silently off: I6). A
 * PASS-WITH-FIXES needs one round more than the FAILs, for its own fixes (I5).
 * A round inside a code fence is a quoted template, not a round (S2). And a
 * pass, a `## Pass N` section, holds at most DEFAULT_LOOP_CEILING rounds: the
 * ceiling counts passes, so nothing else bounded a chain inside one (I4).
 *
 * TIGHTENED AT M6.E17 REVIEW PASS 2. A pass section is tied to the record: the
 * report holds exactly one `## Pass N` section per recorded REVIEW pass plus
 * the one being written, so a typed heading cannot open a fresh bound of three
 * rounds. Neither check on the report's structure refuses FAIL, since a FAIL
 * is what they ask for. And after a recorded FAIL, the rounds must be in THIS pass: a
 * round from an earlier pass does not read the loop-back fixes.
 *
 * TIGHTENED AT M6.E17 REVIEW PASS 3. The section count always applies: a report
 * with no `## Pass N` heading, or headings in another shape, no longer turns it
 * off (P3-I3), and a round above the first heading belongs to no pass. A
 * PASS-WITH-FIXES needs a round in its own pass, not anywhere in the report
 * (P3-I4). And a linear project keeps one report for every run: a linear SHIP
 * appends `## Run ended — <date>` (state.js), and only what follows the last
 * such line is this run (P3-I5). Typing that line by hand would hide earlier
 * passes from the check; like any line of the report, it is trusted as written.
 */

import { DEFAULT_LOOP_CEILING, PASS_ENTRY_RE, PASS_VERDICTS } from './loop-ceiling.js';
import { PARENT_RUN_SUMMARY_RE } from './parent-run.js';

const ROUND_HEADING_RE = /^(#{2,4}) Fix round (\d+)\b.*$/gm;
const DASH = '\\s+[—–-]\\s+';
const FRESH_READ_RE = new RegExp(
  `^\\*\\*Fresh read:\\*\\*\\s+\`?(\\S+?\\.\\.\\S+?)\`?${DASH}Critical (\\d+), Important (\\d+)${DASH}stop: (yes|no)\\s*$`
);
const FRESH_LINE_RE = /^\*\*Fresh read:\*\*.*$/m;
const PARENT_LINE_RE = /^\*\*Parent run:\*\*\s*(.*)$/m;
const GAP_RE = /^gap\b\s*[—–:-]\s*\S/i;
const FENCE_RE = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm;
// A pass section's heading is "## Pass N" alone or "## Pass N — <date>, at <sha>":
// a heading such as "## Pass 1's suggestions" is a section about a pass, not one.
const PASS_HEADING_RE = /^## Pass (\d+)(?:[ \t]+[—–-][ \t].*)?[ \t]*$/gm;
// Appended by a linear SHIP (state.js): everything above it is an earlier run.
const RUN_ENDED_RE = /^## Run ended\b.*$/gm;

/** Blank out fenced blocks, keeping every offset, so a quoted template is not read as a round. */
const unfence = (content) => content.replace(FENCE_RE, (m) => m.replace(/[^\n]/g, ' '));

/** The `## Pass N` headings after the last `## Run ended` line — this run's — with offsets into `content`. */
export function currentRunPasses(content) {
  const whole = unfence(String(content ?? ''));
  const runEnded = [...whole.matchAll(RUN_ENDED_RE)].pop();
  const start = runEnded ? runEnded.index + runEnded[0].length : 0;
  return [...whole.slice(start).matchAll(PASS_HEADING_RE)].map((m) => ({ n: m[1], at: start + m.index }));
}

/** The body of each `Fix round N` section, up to the next heading of the same or a higher level. */
function sections(content) {
  return [...content.matchAll(ROUND_HEADING_RE)].map((m) => {
    const rest = content.slice(m.index + m[0].length);
    const end = rest.search(new RegExp(`^#{1,${m[1].length}} `, 'm'));
    return { n: Number(m[2]), at: m.index, body: end < 0 ? rest : rest.slice(0, end) };
  });
}

/**
 * Check a REVIEW report's fix rounds against the verdict about to be declared.
 *
 * @param {string} content — the REVIEW report
 * @param {'PASS'|'PASS-WITH-FIXES'|'FAIL'} verdict
 * @param {{phasePasses?: string[]}} [opts] — `phase_passes` from STATE.md
 * @returns {{ok: boolean, reasons: string[], gaps: string[],
 *   rounds: Array<{n: number, range: string|null, critical: number|null, important: number|null,
 *   stop: boolean|null, parentRun: string|null}>}}
 */
export function checkFixRounds(content, verdict, { phasePasses } = {}) {
  if (!PASS_VERDICTS.includes(verdict)) {
    throw new Error(`checkFixRounds: ${JSON.stringify(verdict)} is not a verdict (expected one of ${PASS_VERDICTS.join(', ')}).`);
  }
  const reasons = [];
  const gaps = [];
  const rounds = [];

  const whole = unfence(String(content ?? ''));
  const runEnded = [...whole.matchAll(RUN_ENDED_RE)].pop();
  const text = runEnded ? whole.slice(runEnded.index + runEnded[0].length) : whole;
  const passes = [...text.matchAll(PASS_HEADING_RE)].map((m) => ({ n: m[1], at: m.index }));
  const perPass = new Map();
  for (const { n, at, body } of sections(text)) {
    const pass = passes.filter((p) => p.at < at).pop();
    perPass.set(pass, (perPass.get(pass) ?? 0) + 1);
    const label = `Fix round ${n}`;
    if (!pass && passes.length > 0 && verdict !== 'FAIL') {
      reasons.push(`${label} is above the first "## Pass" heading, so it belongs to no pass (review.md § 5).`);
    }
    const round = { n, range: null, critical: null, important: null, stop: null, parentRun: null };

    const freshLine = body.match(FRESH_LINE_RE)?.[0];
    if (!freshLine) {
      reasons.push(`${label} has no **Fresh read:** line — every round of fixes is read fresh (review.md § 4.6).`);
    } else {
      const m = FRESH_READ_RE.exec(freshLine.trim());
      if (!m) {
        reasons.push(`${label}: the **Fresh read:** line does not read as "<base>..<head> — Critical N, Important N — stop: yes|no".`);
      } else {
        Object.assign(round, { range: m[1], critical: Number(m[2]), important: Number(m[3]), stop: m[4] === 'yes' });
        const clean = round.critical === 0 && round.important === 0;
        if (round.stop !== clean) {
          reasons.push(
            `${label}: stop: ${m[4]} with Critical ${round.critical}, Important ${round.important} — the chain stops exactly when a read finds 0 Critical and 0 Important.`
          );
        }
      }
    }

    const parent = body.match(PARENT_LINE_RE)?.[1]?.trim();
    if (!parent) {
      reasons.push(`${label} has no **Parent run:** line — paste parent-run.js's summary, or state the gap (fixer-brief.md).`);
    } else {
      round.parentRun = parent;
      const summary = parent.replace(/^`|`$/g, '');
      const pm = PARENT_RUN_SUMMARY_RE.exec(summary);
      if (pm) {
        if (pm[2] !== pm[3] || Number(pm[3]) === 0 || Number(pm[6] ?? 0) > 0 || Number(pm[7] ?? 0) > 0) gaps.push(`${label}: ${summary}`);
      } else if (GAP_RE.test(parent)) {
        gaps.push(`${label}: ${parent}`);
      } else {
        reasons.push(`${label}: the **Parent run:** line is neither parent-run.js's summary line nor a stated "gap — <why>".`);
      }
    }
    rounds.push(round);
  }

  for (const [pass, count] of perPass) {
    if (count > DEFAULT_LOOP_CEILING && verdict !== 'FAIL') {
      reasons.push(
        `${pass ? `Pass ${pass.n}` : 'the report'} has ${count} fix rounds; a pass holds at most ${DEFAULT_LOOP_CEILING} (the loop ceiling). At the last unclean read, declare FAIL and take the Loop Back.`
      );
    }
  }
  // The rounds of the pass being declared: its own section's, or all of them when the report has no section.
  const current = passes.length > 0 ? perPass.get(passes[passes.length - 1]) ?? 0 : rounds.length;
  const entries = Array.isArray(phasePasses) ? phasePasses : null;
  const parsed = entries?.map((e) => (typeof e === 'string' ? PASS_ENTRY_RE.exec(e) : null));
  const readable = parsed && parsed.every(Boolean);
  if (phasePasses === undefined && verdict !== 'FAIL') {
    reasons.push('no phasePasses given: pass phase_passes from STATE.md (or [] when none is recorded), so the recorded REVIEW FAILs can be counted.');
  } else if (!readable && verdict !== 'FAIL') {
    reasons.push('phase_passes in STATE.md does not read, so the recorded REVIEW FAILs cannot be counted. Fix the record; it is never read as none.');
  } else if (readable) {
    const review = parsed.filter((m) => m[1] === 'REVIEW');
    // Like the per-pass bound, never held against FAIL: the Loop Back asks a person.
    if (verdict !== 'FAIL' && passes.length !== review.length + 1) {
      reasons.push(
        `the report has ${passes.length} "## Pass N" section(s) and STATE records ${review.length} REVIEW pass(es): this is pass ${review.length + 1}, one section per pass, appended (review.md § 5).` +
          (passes.length > review.length + 1
            ? ` If the extra sections are an earlier run's, its "## Run ended" line is missing: call markRunEnded(baseDir, { keep: ${review.length + 1} }) from tools/lib/state.js.`
            : '')
      );
    }
    const fails = review.filter((m) => m[2] === 'FAIL').length;
    const own = verdict === 'PASS-WITH-FIXES' ? 1 : 0;
    if (verdict !== 'FAIL' && fails > 0 && rounds.length < fails + own) {
      reasons.push(
        `${fails} REVIEW FAIL pass(es) recorded and ${rounds.length} fix round(s) in the report — the fixes after each FAIL are a round, read fresh${own ? ', and a PASS-WITH-FIXES needs one more for its own fixes' : ''} (review.md § 4.6).`
      );
    }
    if (verdict !== 'FAIL' && review.at(-1)?.[2] === 'FAIL' && current < 1 + own) {
      reasons.push(
        `the last recorded REVIEW pass is a FAIL and this pass has ${current} fix round(s): the loop-back fixes are a round of this pass, read fresh${own ? ', plus one for its own fixes' : ''} (review.md § 4.6).`
      );
    }
  }
  if (verdict === 'PASS-WITH-FIXES' && current === 0) {
    reasons.push('PASS-WITH-FIXES with no fix round in this pass — fixes made in REVIEW are recorded as rounds of the pass, each read fresh.');
  }
  if (verdict !== 'FAIL' && rounds.length > 0 && rounds[rounds.length - 1].stop === false) {
    reasons.push(
      `${verdict} but the last fix round reads stop: no — its fresh read found issues. Fix them as a new round, or declare FAIL and take the Loop Back.`
    );
  }
  return { ok: reasons.length === 0, reasons, gaps, rounds };
}
