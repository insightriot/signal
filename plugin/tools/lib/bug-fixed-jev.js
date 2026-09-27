// tools/lib/bug-fixed-jev.js — M6.E3 t3.1 (`D-M6E3-15`): a `confirmed`
// BUGS.md row that a released changelog entry may say was fixed, judged by Jev.
//
// Why a model and not a rule: `t3.2` measured every token rule on this
// repository's own history and none can tell a fix from a mention — changelog
// lines that lead with a bug id are as often "B56 filed" or "B81 remains open",
// and fix commits name bugs they file or explicitly leave open
// (M6.E3-RESEARCH.md, wave-4 addendum). Deciding whether a sentence says a bug
// was fixed means reading it. In the spike (assessment §6 set 1) Jev put the one
// real fix, `B102`, at 0.51–0.53 and all twelve non-fixes at ≤ 0.07.
//
// Advisory, like every Jev finding (`D-M6E3-8`): a "yes" becomes a finding with
// a receipt — the BUGS.md row, and the changelog paragraph — plus `judgedBy`,
// which keeps it out of `refusableFindings`. The code rule
// `bug-status-vs-changelog` is unchanged and still runs offline in docs-sweep.
//
// Not in ALL_DRIFT_CHECKS (docs-sweep makes no network call). SHIP runs it.

import { readFileConfined } from './path-confine.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { defineCheck, HEAL, APPLICABILITY } from './state-drift.js';
import { makeReceipt } from './receipt.js';
import { walkBugEntries } from './bugs-tally.js';
import { askNoul, resolveJevKey, noJevKeyReason, confidenceWords, JEV_DEFAULT_TIMEOUT_MS } from './jev.js';

export const CHECK_ID = 'bug-fixed-jev';

const RELEASED_HEADING = /^##\s*\[(?!Unreleased\b)[^\]]+\]/;
const ANY_H2 = /^##\s/;

/**
 * The spike's yes/no question (analysis/jev-spike/labels-and-results.json, set
 * bug-fixed), with the id substituted. A test pins the wording.
 */
export function bugFixedQuestion(id) {
  return {
    type: 'noul',
    instructions: `Bug ${id} is recorded as still open. Does any of this released changelog text say that ${id} itself was fixed, closed, or resolved?`,
    criteria: {
      true: `The text states that ${id} was fixed, closed, resolved, or shipped as a fix.`,
      false: `The text only cites ${id}, relates to it, filed it, uses it as evidence or a measurement, or says it remains open.`,
    },
  };
}

/**
 * The RELEASED sections of CHANGELOG.md that name `id` as a whole token — the
 * unit Jev is asked about, and the unit the receipt cites. One walker for both,
 * so what the message says was read is exactly what was sent.
 *
 * Measured 2026-09-27 on fc4b8b1: shown only B102's one-line headline ("`B102`,
 * fix lane. A P1 against…"), which never says "fixed", Jev put the real fix at
 * 0.29 and MISSED it; shown the release section, 0.76, with every non-fix
 * ≤ 0.06. The unit of text sent decides whether this works.
 *
 * Bounded (REVIEW): at most `maxSections` sections (the first in the file — the
 * newest under Keep a Changelog's newest-first order; an oldest-first file gets
 * its oldest),
 * and a section over `maxChars` is cut to its heading plus a WINDOW around the
 * id's first mention — never to its first `maxChars` characters, which can drop
 * the id the section was chosen for. Each section says which file lines were
 * sent (`from`–`to`, plus the heading line when windowed).
 *
 * @returns {{sections: Array<{heading: string, start: number, from: number, to: number, windowed: boolean, text: string}>, omitted: number}}
 */
export function releasedSectionsFor(changelog, id, { maxChars = 6000, maxSections = 3 } = {}) {
  const re = new RegExp(`(^|[^A-Za-z0-9])${id}(?![0-9])`);
  const lines = String(changelog).split(/\r?\n/);
  const found = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    let end = cur.end;
    while (end > cur.start && lines[end - 1].trim() === '') end--;
    const body = lines.slice(cur.start - 1, end);
    if (re.test(body.join('\n'))) found.push({ start: cur.start, end, body });
    cur = null;
  };
  lines.forEach((l, i) => {
    if (ANY_H2.test(l)) {
      close();
      if (RELEASED_HEADING.test(l)) cur = { start: i + 1, end: i + 1 };
    } else if (cur) {
      cur.end = i + 1;
    }
  });
  close();

  const sections = found.slice(0, maxSections).map(({ start, end, body }) => {
    const full = body.join('\n');
    if (full.length <= maxChars) return { heading: body[0], start, from: start, to: end, windowed: false, text: full };
    // The id may be only in the heading (`## [0.2.0] — B9 hotfix`): window from
    // the first body line then (it used to be index −1 and throw, REVIEW).
    const k = Math.max(1, body.findIndex((l, i) => i > 0 && re.test(l)));
    const budget = Math.max(0, maxChars - body[0].length - 3);
    // A line longer than the whole budget is cut AROUND the id, so the id is
    // always in what is sent (the final slice used to drop it, REVIEW).
    const m = re.exec(body[k]);
    if (body[k].length > budget) {
      const at = m ? Math.max(0, m.index - Math.floor(budget / 2)) : 0;
      body[k] = body[k].slice(at, at + budget);
    }
    let lo = k;
    let hi = k;
    let size = body[k].length;
    for (let grew = true; grew; ) {
      grew = false;
      if (hi + 1 < body.length && size + body[hi + 1].length + 1 <= budget) { hi++; size += body[hi].length + 1; grew = true; }
      if (lo - 1 > 0 && size + body[lo - 1].length + 1 <= budget) { lo--; size += body[lo].length + 1; grew = true; }
    }
    const text = `${body[0]}\n…\n${body.slice(lo, hi + 1).join('\n')}`;
    return { heading: body[0], start, from: start + lo, to: start + hi, windowed: true, text };
  });
  return { sections, omitted: Math.max(0, found.length - maxSections) };
}

/** True when CHANGELOG.md has at least one release heading this check can read. */
export function hasReleasedHeading(changelog) {
  return String(changelog).split(/\r?\n/).some((l) => RELEASED_HEADING.test(l));
}

export const BUG_JEV_DEFAULTS = Object.freeze({
  maxBugs: 40,
  concurrency: 8,
  requestTimeoutMs: JEV_DEFAULT_TIMEOUT_MS,
  budgetMs: 30000,
  threshold: 0.5,
  maxSectionChars: 6000,
  maxSections: 3,
});

export function makeBugFixedJevCheck(opts = {}) {
  const cfg = { ...BUG_JEV_DEFAULTS, ...opts };
  const ask = opts.ask ?? askNoul;
  const now = opts.now ?? Date.now;
  const keyNow = (ctx) => opts.key ?? resolveJevKey(ctx.baseDir);
  const bugsFile = (ctx) => join(ctx.planningDir, 'BUGS.md');

  return defineCheck({
    id: CHECK_ID,
    healCategory: HEAL.NEEDS_A_PERSON,
    judged: 'model',
    describe:
      'Asks TypeSafe\'s Jev, for each `confirmed` BUGS.md row a released CHANGELOG section mentions, whether that text says the bug was fixed. ' +
      'Advisory — never refuses; results can vary between runs. No token rule could make this call (M6.E3 t3.2). ' +
      'Measured 2026-09-27 (jev-1.13.0) at fc4b8b1 on the 13 `confirmed` rows a released section names (of the 28-row corpus behind the published bug-status figures): 1 flag, 1 real (B102; recorded p 0.76 and 0.69), every non-fix ≤ 0.06 — one positive, not a general rate. No run output is stored. ' +
      'The receipt cites the release section Jev read (heading + line range), not a sentence: the judgment is per section. ' +
      'Since REVIEW at most 3 sections per bug are sent, each cut to a window around the id; the measurement sent every section whole (B75: 7), so for multi-section bugs the number describes a slightly different input.',
    applicability: (ctx) => {
      if (!existsSync(bugsFile(ctx))) return { status: APPLICABILITY.NA, reason: 'this project has no .planning/BUGS.md' };
      if (!existsSync(join(ctx.baseDir, 'CHANGELOG.md'))) {
        return { status: APPLICABILITY.BLIND, reason: 'there is no CHANGELOG.md to read' };
      }
      if (!keyNow(ctx).trim()) {
        return { status: APPLICABILITY.BLIND, reason: noJevKeyReason(ctx.baseDir) };
      }
      return APPLICABILITY.EVAL;
    },

    async run(ctx) {
      const bugs = readFileConfined(ctx.baseDir, '.planning/BUGS.md');
      const changelog = readFileConfined(ctx.baseDir, 'CHANGELOG.md');
      // A CHANGELOG whose releases are not `## [x.y.z]` (e.g. `## v0.3.0`) would
      // yield zero candidates and read as "checked 0 of 0" — clean. It is not
      // clean; this check cannot read that file (NFR4, `B39`). Found at REVIEW.
      if (!hasReleasedHeading(changelog)) {
        throw new Error('CHANGELOG.md has no `## [version]` release headings this check can read');
      }
      const key = keyNow(ctx); // once per run, not once per bug
      const candidates = walkBugEntries(bugs)
        .filter((e) => e.kind === 'row' && e.status === 'confirmed')
        .map((e) => ({
          ...e,
          ...releasedSectionsFor(changelog, e.id, { maxChars: cfg.maxSectionChars, maxSections: cfg.maxSections }),
        }))
        .filter((e) => e.sections.length);
      const bugLines = bugs.split(/\r?\n/);

      const asked = candidates.slice(0, cfg.maxBugs);
      const unchecked = candidates.slice(cfg.maxBugs).map((e) => ({ id: e.id, reason: 'over-cap' }));
      const answers = new Array(asked.length).fill(null);
      const deadline = now() + cfg.budgetMs;
      let next = 0;
      async function worker() {
        for (;;) {
          const i = next++;
          if (i >= asked.length) return;
          const remaining = deadline - now();
          if (remaining <= 0) {
            unchecked.push({ id: asked[i].id, reason: 'budget' });
            continue;
          }
          const r = await ask({
            state: asked[i].sections.map((sec) => sec.text).join('\n\n'),
            question: bugFixedQuestion(asked[i].id),
            key,
            timeoutMs: Math.min(cfg.requestTimeoutMs, remaining),
          });
          if (r.ok) answers[i] = r;
          else unchecked.push({ id: asked[i].id, reason: r.reason });
        }
      }
      await Promise.all(Array.from({ length: Math.max(1, Math.min(cfg.concurrency, asked.length)) }, worker));

      const answered = answers.filter(Boolean).length;
      const failures = unchecked.filter((u) => u.reason !== 'over-cap' && u.reason !== 'budget');
      if (asked.length > 0 && answered === 0 && failures.length > 0) {
        throw new Error(`the Jev check did not run — ${failures[0].reason}`);
      }

      const findings = [];
      answers.forEach((a, i) => {
        if (!a || a.noul < cfg.threshold) return;
        const bug = asked[i];
        // Cite what was JUDGED: Jev read whole release sections, so the receipt
        // quotes the first section's heading verbatim and the message names
        // every range read. It used to cite the paragraph naming the id — for
        // B102 its headline, which never says "fixed" (the section does, in a
        // line no word list finds: "All three surfaces now prescribe…"). A
        // reader deciding from that receipt would dismiss the one true
        // positive. Found at VERIFY; M6.E7's shape — the line is in the file
        // and does not carry the claim.
        const [first] = bug.sections;
        const ranges =
          bug.sections
            .map((sec) => (sec.windowed ? `CHANGELOG.md:${sec.start} + ${sec.from}–${sec.to}` : `CHANGELOG.md:${sec.from}–${sec.to}`))
            .join(', ') + (bug.omitted ? `; ${bug.omitted} older section(s) not read` : '');
        findings.push({
          file: '.planning/BUGS.md',
          message:
            `${bug.id} reads \`confirmed\`, and Jev (${a.model}, ${confidenceWords(a.noul)}, p=${a.noul}) reads ` +
            `the released section(s) naming it (${ranges}) as saying it was fixed — a whole-section judgment, so no single line is cited; ` +
            'a judgment, not a proof; results can vary between runs.',
          fix: `If it shipped, set ${bug.id}'s status to \`fixed\` and name the release.`,
          receipt: makeReceipt({
            claim: { file: '.planning/BUGS.md', line: bug.line, excerpt: bugLines[bug.line - 1] ?? `| ${bug.id} | \`confirmed\` |` },
            evidence: { source: 'CHANGELOG.md', line: first.start, excerpt: first.heading },
          }),
          judgedBy: { model: a.model, confidence: a.noul },
        });
      });

      return {
        findings,
        coverage: {
          checked: answered, total: candidates.length, unchecked, model: answers.find(Boolean)?.model ?? null,
          // Older sections not sent, per bug — reported whether or not Jev said
          // "fixed", or a partial read reads as a full one (`B39`, REVIEW).
          sectionsNotRead: asked.filter((b) => b.omitted).map((b) => `${b.id} (${b.omitted})`),
        },
      };
    },
  });
}
