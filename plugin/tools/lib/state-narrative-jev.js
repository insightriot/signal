// tools/lib/state-narrative-jev.js — M6.E3 t1.5: does a STATE.md paragraph
// contradict the project's facts? Judged by TypeSafe's Jev.
//
// The class this Epic was chartered for: STATE.md's narrative went stale for
// days while its frontmatter was right, and the shipped token check
// (`narrative-phase-contradicts-frontmatter`) returned clean — on the spike's
// measured file it found 0 of the 4 contradictions; Jev found all 4
// (analysis/TYPESAFE-JEV-ASSESSMENT.md §6, set 3).
//
// How it works, and what each part is for:
//
//   - Code splits the body into paragraphs (with FILE lines) and builds a
//     closed list of text facts (state-facts.js). Jev never searches.
//   - One pick-one question per paragraph — supports / contradicts /
//     says_nothing — asked with the spike's wording VERBATIM, so the shipped
//     check is comparable with what was measured. One paragraph per request:
//     Jev's `state` is shared by every question in a request, and the spike
//     measured one paragraph per request (RESEARCH Finding 1).
//   - A "contradicts" becomes a finding with a RECEIPT — the paragraph, and the
//     fact it most plausibly contradicts — plus `judgedBy`. The receipt is what
//     makes the advice checkable in seconds; `judgedBy` is what keeps it from
//     ever refusing anything (`D-M6E3-8`, `refusableFindings`).
//   - Bounded (NFR6): a paragraph cap, bounded concurrency, a per-request
//     timeout and a total budget. Whatever was not asked is reported as
//     unchecked with its reason — "checked 12 of 20" must never read as clean.
//
// NOT in ALL_DRIFT_CHECKS: that registry is what /sig:docs-sweep runs, and
// docs-sweep makes no network call (`D-M6E3-9`). Callers that may reach the
// network pass MODEL_JUDGED_CHECKS explicitly.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { defineCheck, HEAL, APPLICABILITY } from './state-drift.js';
import { makeReceipt } from './receipt.js';
import { splitParagraphs, buildFactList } from './state-facts.js';
import { askChoice, JEV_DEFAULT_TIMEOUT_MS } from './jev.js';

export const CHECK_ID = 'state-narrative-jev';

// Verbatim from analysis/jev-spike/labels-and-results.json (set: narrative).
// A test pins it; change it and the published measurement no longer applies.
export const NARRATIVE_QUESTION = Object.freeze({
  type: 'choice',
  instructions:
    "How does this paragraph's claim about the project's CURRENT state (what is in flight, what phase, what version) relate to the facts? Paragraphs that describe past events or quote old wording as history make no claim about the current state.",
  criteria: {
    supports: 'The paragraph asserts the current state and agrees with the facts.',
    contradicts: 'The paragraph asserts the current state and disagrees with the facts.',
    says_nothing: 'The paragraph makes no claim about the current state (history, reasoning, quotes of old wording, pointers).',
  },
});

export const JEV_CHECK_DEFAULTS = Object.freeze({
  maxParagraphs: 60,
  concurrency: 8,
  requestTimeoutMs: JEV_DEFAULT_TIMEOUT_MS,
  budgetMs: 8000,
});

const HEADING_ONLY = /^#{1,6}\s[^\n]*$/;

// Which fact a contradicting paragraph is most plausibly about. Jev answers
// "contradicts" without saying which fact; the receipt needs one side of
// evidence, so pick by the paragraph's own words, most specific first.
const FACT_CUES = [
  ['version', /\bv?\d+\.\d+\.\d+\b|\bversion\b|plugin\.json/i],
  ['phase', /\bphase\b/i],
  ['in_flight', /in[- ]flight|\bparked\b|being built|nothing is/i],
  ['current_epic', /\bM\d+(?:\.\d+)?\.E\d+\b/],
];

function evidenceFor(text, facts, sources) {
  const key =
    FACT_CUES.find(([k, re]) => facts[k] !== undefined && re.test(text))?.[0] ??
    ['in_flight', 'phase', 'current_epic'].find((k) => facts[k] !== undefined);
  if (!key) return null;
  const label = key === 'in_flight' ? 'in flight' : key;
  return { source: sources[key].source, line: sources[key].line, excerpt: `${label}: ${facts[key]}` };
}

/**
 * Build the check. Every dependency is injectable so tests use recorded answers
 * and a fake clock; the defaults are the real client and the real clock.
 */
export function makeStateNarrativeJevCheck(opts = {}) {
  const cfg = { ...JEV_CHECK_DEFAULTS, ...opts };
  const ask = opts.ask ?? askChoice;
  const now = opts.now ?? Date.now;
  const keyNow = () => opts.key ?? process.env.TYPESAFE_API_KEY ?? '';

  return defineCheck({
    id: CHECK_ID,
    healCategory: HEAL.NEEDS_A_PERSON,
    describe:
      'Asks TypeSafe\'s Jev whether each STATE.md paragraph contradicts the facts code derives (phase, current Epic, in-flight work, version). Advisory — never refuses. Results can vary between runs.',
    applicability: () =>
      keyNow().trim()
        ? APPLICABILITY.EVAL
        : { status: APPLICABILITY.BLIND, reason: 'the Jev check did not run — TYPESAFE_API_KEY is not set' },

    async run(ctx) {
      const raw = await readFile(join(ctx.planningDir, 'STATE.md'), 'utf8');
      const { facts, sources, unavailable } = await buildFactList(ctx.baseDir, ctx.state);
      const candidates = splitParagraphs(raw).filter((p) => !HEADING_ONLY.test(p.text));
      const asked = candidates.slice(0, cfg.maxParagraphs);
      const unchecked = candidates.slice(cfg.maxParagraphs).map((p) => ({ line: p.line, reason: 'over-cap' }));

      const deadline = now() + cfg.budgetMs;
      const answers = new Array(asked.length).fill(null);
      let next = 0;
      async function worker() {
        for (;;) {
          const i = next++;
          if (i >= asked.length) return;
          const remaining = deadline - now();
          if (remaining <= 0) {
            unchecked.push({ line: asked[i].line, reason: 'budget' });
            continue;
          }
          const r = await ask({
            state: { paragraph: asked[i].text, facts },
            question: NARRATIVE_QUESTION,
            key: keyNow(),
            timeoutMs: Math.min(cfg.requestTimeoutMs, remaining),
          });
          if (r.ok) answers[i] = r;
          else unchecked.push({ line: asked[i].line, reason: r.reason });
        }
      }
      await Promise.all(Array.from({ length: Math.max(1, Math.min(cfg.concurrency, asked.length)) }, worker));

      const answered = answers.filter(Boolean).length;
      const failures = unchecked.filter((u) => u.reason !== 'over-cap' && u.reason !== 'budget');
      if (asked.length > 0 && answered === 0 && failures.length > 0) {
        throw new Error(`the Jev check did not run — ${failures[0].reason}`);
      }

      const model = answers.find(Boolean)?.model ?? null;
      const findings = [];
      answers.forEach((a, i) => {
        if (!a || a.choice !== 'contradicts') return;
        const evidence = evidenceFor(asked[i].text, facts, sources);
        if (!evidence) {
          // No fact to pair it with (a STATE.md with no phase at all): a
          // contradiction nobody can check is not a finding — but it must not
          // vanish either, or "checked" over-counts what was actually judged.
          unchecked.push({ line: asked[i].line, reason: 'no-evidence' });
          return;
        }
        findings.push({
          file: '.planning/STATE.md',
          message:
            `Jev (${a.model}, confidence ${a.confidence}) reads STATE.md:${asked[i].line} as contradicting the current facts — ` +
            'a judgment, not a proof; results can vary between runs.',
          receipt: makeReceipt({
            claim: { file: '.planning/STATE.md', line: asked[i].line, excerpt: asked[i].text },
            evidence,
          }),
          judgedBy: { model: a.model, confidence: a.confidence },
        });
      });

      unchecked.sort((a, b) => a.line - b.line);
      const checked = answered - unchecked.filter((u) => u.reason === 'no-evidence').length;
      return {
        findings,
        coverage: { checked, total: candidates.length, unchecked, model, factsUnavailable: unavailable },
      };
    },
  });
}

export const checkStateNarrativeJev = makeStateNarrativeJevCheck();

/** Checks that call a model. Passed explicitly by /sig:resume and SHIP only. */
export const MODEL_JUDGED_CHECKS = Object.freeze([checkStateNarrativeJev]);

/** The same registry with per-surface bounds (resume 8 s, SHIP 30 s). */
export function modelJudgedChecks(opts = {}) {
  return Object.freeze([makeStateNarrativeJevCheck(opts)]);
}
