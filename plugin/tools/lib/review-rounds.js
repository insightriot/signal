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
 *
 * M6.E18 S4 (FR4, `SIG-335`, `SIG-344`): THE COMMITS A ROUND NAMES ARE CHECKED.
 * Until now the check read that a round's lines were there, not what they
 * said. Given git (`opts.git`, or `opts.cwd` to run it there under `gitEnv`):
 * - a round's **Parent run:** commit and its fresh read's base and head must
 *   resolve to commits, and the parent run must be on the base: the base is
 *   the HEAD the fixer started from, which is what parent-run.js runs on
 *   (AC4.1). A round whose parent run is a stated gap has no commit to compare;
 * - a round's base is the previous round's head, in the order the rounds are
 *   written in this run, across `## Pass N` sections: the read that found
 *   the issues ended there, a loop-back round's included (AC4.2);
 * - the commits after the newest `## Pass N, at <sha>` heading that no round's
 *   range covers are returned as `uncovered`. Reported, not refused: a fix
 *   made with no round is for review.md's step to name (AC4.4). A report with
 *   no such heading (older reports) reports nothing.
 * With no git — neither option given, an older git (`gitUnusableReason`), or a
 * folder git cannot read — nothing above is checked, and each round, and the
 * pass's commit, is a stated gap: never a refusal, never a pass.
 *
 * A heading inside an HTML comment is not read either, as one in a fence is
 * not (AC4.3). An unclosed `<!--`, like an unclosed fence, hides nothing.
 */

import { execFileSync } from 'node:child_process';

import { gitEnv, gitUnusableReason } from './git-env.js';
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
// A fenced block, or a closed HTML comment. One pattern, so whichever opens
// first wins: a "<!--" inside a fence is quoted, and so is a fence inside a comment.
// A comment opens only at the start of a line, as a fence does: a "<!--" quoted
// in a sentence hid every round up to a later "-->" (REVIEW pass 1, I4).
const HIDDEN_RE = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$|^[ \t]*<!--[\s\S]*?-->/gm;
// A pass section's heading is "## Pass N" alone, "## Pass N — <date>, at <sha>",
// or "## Pass N, at <sha>": a heading such as "## Pass 1's suggestions" is a
// section about a pass, not one.
const PASS_HEADING_RE = /^## Pass (\d+)(?:[ \t]+[—–-][ \t].*|,[ \t]+at[ \t].*)?[ \t]*$/gm;
// The commit a pass heading names: "…, at <sha>", backticked or not.
const PASS_AT_RE = /,[ \t]+at[ \t]+`?([^\s`]+)`?[ \t]*$/;
// Appended by a linear SHIP (state.js): everything above it is an earlier run.
const RUN_ENDED_RE = /^## Run ended\b.*$/gm;
// A commit a round or a pass names is written as its sha: a revision
// expression (HEAD~2, :/text, a tag) names a different commit as the
// repository moves (REVIEW pass 1, S6).
const SHA_RE = /^[0-9a-f]{7,40}$/;
// Report text in a reason or a gap: every control or format character escaped,
// so a terminal shows it rather than acting on it (S6). `shown` also quotes it.
const esc = (s) => String(s).replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, (c) => `\\u{${c.codePointAt(0).toString(16)}}`);
const shown = (s) => esc(JSON.stringify(String(s)));

/** Blank out fenced blocks and HTML comments, keeping every offset, so a quoted or hidden round is not read. */
const unfence = (content) => content.replace(HIDDEN_RE, (m) => m.replace(/[^\n]/g, ' '));

function defaultGit(cwd, args) {
  return execFileSync('git', args, { cwd, env: gitEnv(cwd), encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const gitWhy = (err) => String(err?.stderr || err?.message || err).trim().split('\n')[0];

/**
 * The git questions the check asks, or why it cannot ask them. `resolve` gives
 * a full commit sha or null; `after(a, b)` the commits in `a..b`. A folder git
 * cannot read at all is found by the first question and reported as `why`.
 */
function gitReader({ cwd, git }) {
  if (!git && !cwd) return { why: 'no git was given to the check (pass cwd: baseDir)' };
  const run = git ?? defaultGit;
  if (run === defaultGit && gitUnusableReason() !== null) return { why: gitUnusableReason() };
  try {
    run(cwd, ['rev-parse', '--git-dir']);
  } catch (err) {
    return { why: `git could not read the repository: ${gitWhy(err)}` };
  }
  const memo = new Map();
  const resolve = (ref) => {
    if (!memo.has(ref)) {
      let sha = null;
      try {
        sha = String(run(cwd, ['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`])).trim() || null;
      } catch {
        // not a commit: null
      }
      memo.set(ref, sha);
    }
    return memo.get(ref);
  };
  const after = (a, b) =>
    String(run(cwd, ['rev-list', '--end-of-options', `${a}..${b}`])).split('\n').map((l) => l.trim()).filter(Boolean);
  return { resolve, after };
}

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
 * @param {{phasePasses?: string[], cwd?: string, git?: (cwd: string, args: string[]) => string}} [opts]
 *   `phasePasses`: `phase_passes` from STATE.md. `cwd`: the project folder, where git is run (under
 *   `gitEnv`); `git`: a stand-in for it, for tests. Neither given → the commits are a stated gap.
 * @returns {{ok: boolean, verdict: string, reasons: string[], gaps: string[], uncovered: string[],
 *   rounds: Array<{n: number, range: string|null, critical: number|null, important: number|null,
 *   stop: boolean|null, parentRun: string|null}>}}
 */
export function checkFixRounds(content, verdict, { phasePasses, cwd, git } = {}) {
  if (!PASS_VERDICTS.includes(verdict)) {
    throw new Error(`checkFixRounds: ${JSON.stringify(verdict)} is not a verdict (expected one of ${PASS_VERDICTS.join(', ')}).`);
  }
  const reasons = [];
  const gaps = [];
  const rounds = [];

  const whole = unfence(String(content ?? ''));
  const runEnded = [...whole.matchAll(RUN_ENDED_RE)].pop();
  const text = runEnded ? whole.slice(runEnded.index + runEnded[0].length) : whole;
  const passes = [...text.matchAll(PASS_HEADING_RE)].map((m) => ({ n: m[1], at: m.index, sha: PASS_AT_RE.exec(m[0])?.[1] ?? null }));
  const perPass = new Map();
  const commits = []; // per round with a range: {label, at, base, head, parentSha} — checked below, once git is asked
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
        const [base, head] = m[1].split('..');
        commits.push({ label, at, base, head, parentSha: null });
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
        if (commits.at(-1)?.at === at) commits.at(-1).parentSha = pm[1];
        if (pm[2] !== pm[3] || Number(pm[3]) === 0 || Number(pm[6] ?? 0) > 0 || Number(pm[7] ?? 0) > 0) gaps.push(`${label}: ${esc(summary)}`);
      } else if (GAP_RE.test(parent)) {
        gaps.push(`${label}: ${esc(parent)}`);
      } else {
        reasons.push(`${label}: the **Parent run:** line is neither parent-run.js's summary line nor a stated "gap — <why>".`);
      }
    }
    rounds.push(round);
  }

  const uncovered = [];
  // S6: a commit is named by its sha. Syntax only, so it holds with no git too.
  const notSha = (what, ref) => `${what} ${shown(ref)} is not a commit id: write the commit's sha (7 to 40 lowercase hex characters), not a revision expression.`;
  for (const c of commits) {
    for (const [what, ref] of [["the fresh read's base", c.base], ["the fresh read's head", c.head], ["the parent run's commit", c.parentSha]]) {
      if (ref !== null && !SHA_RE.test(ref)) {
        reasons.push(`${c.label}: ${notSha(what, ref)}`);
        c.notSha = true;
      }
    }
  }
  let newest = passes.filter((p) => p.sha).pop();
  if (newest && !SHA_RE.test(newest.sha)) {
    reasons.push(`Pass ${newest.n}: ${notSha('the commit its heading names', newest.sha)}`);
    newest = null;
  }
  if (commits.length > 0 || newest) {
    const reader = gitReader({ cwd, git });
    if (reader.why) {
      for (const c of commits) gaps.push(`${c.label}: its commits were not checked — ${reader.why}.`);
      if (newest) gaps.push(`Pass ${newest.n}, at ${esc(newest.sha)}: the commits after it were not checked — ${reader.why}.`);
    } else {
      checkCommits(commits, reader, reasons);
      if (newest) {
        const from = reader.resolve(newest.sha);
        let since = null;
        try {
          since = from ? reader.after(from, 'HEAD') : null;
        } catch {
          // git could not list them: a gap, below
        }
        if (since === null) {
          gaps.push(`Pass ${newest.n}, at ${esc(newest.sha)}: the commits after it were not checked — ${from ? 'git could not list them' : 'it does not resolve to a commit'}.`);
        } else {
          const covered = new Set();
          for (const c of commits.filter((x) => x.at > newest.at && x.baseSha && x.headSha)) {
            try {
              for (const sha of reader.after(c.baseSha, c.headSha)) covered.add(sha);
            } catch {
              // a range git cannot list covers nothing
            }
          }
          uncovered.push(...since.filter((sha) => !covered.has(sha)).reverse());
        }
      }
    }
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
  return { ok: reasons.length === 0, verdict, reasons, gaps, uncovered, rounds };
}

/**
 * AC4.1 / AC4.2: each round's base, head and parent-run commit resolve, the
 * parent run is on the base, and each round starts at the previous one's head.
 * Writes `baseSha` / `headSha` onto each entry for the coverage read.
 */
function checkCommits(commits, reader, reasons) {
  let previous = null;
  for (const c of commits) {
    if (c.notSha) {
      previous = c; // refused above; nothing to resolve, and no head to chain from
      continue;
    }
    c.baseSha = reader.resolve(c.base);
    c.headSha = reader.resolve(c.head);
    for (const [what, ref, sha] of [['base', c.base, c.baseSha], ['head', c.head, c.headSha]]) {
      if (!sha) reasons.push(`${c.label}: the fresh read's ${what} ${shown(ref)} does not resolve to a commit.`);
    }
    if (c.parentSha !== null) {
      const parent = reader.resolve(c.parentSha);
      if (!parent) {
        reasons.push(`${c.label}: the parent run's commit ${shown(c.parentSha)} does not resolve to a commit.`);
      } else if (c.baseSha && parent !== c.baseSha) {
        reasons.push(
          `${c.label}: the parent run is on ${shown(c.parentSha)} (${parent}) but the fresh read starts at ${shown(c.base)} (${c.baseSha}). The parent run's base is the commit the fixes started from, which is the range's base (fixer-brief.md).`
        );
      }
    }
    if (previous?.headSha && c.baseSha && c.baseSha !== previous.headSha) {
      reasons.push(
        `${c.label}: the fresh read starts at ${shown(c.base)} (${c.baseSha}) but ${previous.label} ended at ${shown(previous.head)} (${previous.headSha}). A later round's base is the previous round's head (review.md § 4.6).`
      );
    }
    previous = c;
  }
}
