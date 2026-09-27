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

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { defineCheck, HEAL, APPLICABILITY } from './state-drift.js';
import { makeReceipt } from './receipt.js';
import { walkBugEntries } from './bugs-tally.js';
import { askNoul, resolveJevKey, confidenceWords, JEV_DEFAULT_TIMEOUT_MS } from './jev.js';

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
 * Paragraphs inside RELEASED sections of CHANGELOG.md that name `id` as a whole
 * token. `line` is the paragraph's first line in the file (1-based).
 */
export function releasedParagraphsNaming(changelog, id) {
  const re = new RegExp(`(^|[^A-Za-z0-9])${id}(?![0-9])`);
  const lines = String(changelog).split(/\r?\n/);
  const out = [];
  let released = false;
  let buf = [];
  let start = 0;
  const flush = () => {
    if (buf.length && released) {
      const text = buf.join('\n');
      if (re.test(text)) out.push({ line: start + 1, text });
    }
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (ANY_H2.test(l)) {
      flush();
      released = RELEASED_HEADING.test(l);
      continue;
    }
    if (l.trim() === '') {
      flush();
      continue;
    }
    if (!buf.length) start = i;
    buf.push(l);
  }
  flush();
  return out;
}

/**
 * Whole RELEASED sections (heading + body) that name `id`, each capped at
 * `maxChars`. This — not the single paragraph naming the id — is what Jev is
 * asked about. Measured 2026-09-27 on fc4b8b1: shown only its one-line headline
 * ("`B102`, fix lane. A P1 against…"), which never says "fixed", Jev put the real
 * fix at 0.29 and MISSED it; shown the release section, 0.76, with every
 * non-fix ≤ 0.06. The unit of text sent decides whether this works.
 */
export function releasedSectionsNaming(changelog, id, maxChars = 6000) {
  const re = new RegExp(`(^|[^A-Za-z0-9])${id}(?![0-9])`);
  const out = [];
  let cur = null;
  for (const l of String(changelog).split(/\r?\n/)) {
    if (ANY_H2.test(l)) {
      if (cur) out.push(cur);
      cur = RELEASED_HEADING.test(l) ? [l] : null;
    } else if (cur) {
      cur.push(l);
    }
  }
  if (cur) out.push(cur);
  return out
    .map((ls) => ls.join('\n').trim())
    .filter((t) => re.test(t))
    .map((t) => t.slice(0, maxChars));
}

/**
 * Where each released section naming `id` sits in the file: its heading line
 * (1-based, verbatim) and last non-blank line. The receipt cites THIS — the
 * unit Jev judged — never a paragraph inside it (see `run`).
 */
export function releasedSectionSpans(changelog, id) {
  const re = new RegExp(`(^|[^A-Za-z0-9])${id}(?![0-9])`);
  const lines = String(changelog).split(/\r?\n/);
  const spans = [];
  let cur = null;
  const close = () => {
    if (!cur) return;
    let end = cur.end;
    while (end > cur.start && lines[end - 1].trim() === '') end--;
    if (re.test(lines.slice(cur.start - 1, end).join('\n'))) spans.push({ start: cur.start, end, heading: lines[cur.start - 1] });
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
  return spans;
}

export const BUG_JEV_DEFAULTS = Object.freeze({
  maxBugs: 40,
  concurrency: 8,
  requestTimeoutMs: JEV_DEFAULT_TIMEOUT_MS,
  budgetMs: 30000,
  threshold: 0.5,
  maxSectionChars: 6000,
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
    describe:
      'Asks TypeSafe\'s Jev, for each `confirmed` BUGS.md row a released CHANGELOG section mentions, whether that text says the bug was fixed. ' +
      'Advisory — never refuses; results can vary between runs. No token rule could make this call (M6.E3 t3.2). ' +
      'Measured 2026-09-27 (jev-1.13.0) at fc4b8b1 on the 13 `confirmed` rows a released section names (of the 28-row corpus behind the published bug-status figures): 1 flag, 1 real (B102; recorded p 0.76 and 0.69), every non-fix ≤ 0.06 — one positive, not a general rate. No run output is stored. ' +
      'The receipt cites the release section Jev read (heading + line range), not a sentence: the judgment is per section.',
    applicability: (ctx) => {
      if (!existsSync(bugsFile(ctx))) return { status: APPLICABILITY.NA, reason: 'this project has no .planning/BUGS.md' };
      if (!existsSync(join(ctx.baseDir, 'CHANGELOG.md'))) {
        return { status: APPLICABILITY.BLIND, reason: 'there is no CHANGELOG.md to read' };
      }
      if (!keyNow(ctx).trim()) {
        return { status: APPLICABILITY.BLIND, reason: 'the Jev check did not run — TYPESAFE_API_KEY is not set (environment or .env)' };
      }
      return APPLICABILITY.EVAL;
    },

    async run(ctx) {
      const bugs = await readFile(bugsFile(ctx), 'utf8');
      const changelog = await readFile(join(ctx.baseDir, 'CHANGELOG.md'), 'utf8');
      const candidates = walkBugEntries(bugs)
        .filter((e) => e.kind === 'row' && e.status === 'confirmed')
        .map((e) => ({
          ...e,
          paragraphs: releasedParagraphsNaming(changelog, e.id),
          sections: releasedSectionsNaming(changelog, e.id, cfg.maxSectionChars),
          spans: releasedSectionSpans(changelog, e.id),
        }))
        .filter((e) => e.paragraphs.length);
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
            state: asked[i].sections.join('\n\n'),
            question: bugFixedQuestion(asked[i].id),
            key: keyNow(ctx),
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
        const [first] = bug.spans;
        const ranges = bug.spans.map((sp) => `CHANGELOG.md:${sp.start}–${sp.end}`).join(', ');
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
        coverage: { checked: answered, total: candidates.length, unchecked, model: answers.find(Boolean)?.model ?? null },
      };
    },
  });
}
