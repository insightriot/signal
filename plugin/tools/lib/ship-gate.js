// tools/lib/ship-gate.js — M6.E3 FR5: the SHIP gate refuses on what a document SAYS.
//
// Before this, every halt ship.md could produce was a precondition failure (no
// PROFILE, no retrospective, the default branch). None was a finding about a
// document's content. This is the first, and it is deliberately narrow: it
// refuses ONLY on `refusableFindings` — a finding with a receipt `makeReceipt`
// built, and no model judgment (`D-M6E3-1`, `D-M6E3-8`). Everything else the
// checks report is listed as advice.
//
// Four outcomes, kept distinct (the `B39` rule — silence must not read as pass):
//
//   pass        — the checks ran; nothing refusable
//   refuse      — at least one receipt-backed finding not overridden
//   overridden  — every refusable finding was accepted by name, and that is recorded
//   unverified  — the checks could not run at all; never a pass, never a refusal
//
// The override is per CHECK, by name (`--accept-stale <check-id>`), so accepting
// one stale record cannot wave through a different one (AC5.4).

import { runDriftChecks, STATUS } from './state-drift.js';
import { ALL_DRIFT_CHECKS } from './published-facts.js';
import { refusableFindings, renderReceipt } from './receipt.js';
import { modelJudgedChecks } from './state-narrative-jev.js';

// SHIP is where the expensive path runs (NFR3): 30 s for the Jev check, against
// /sig:resume's 8 s. Its findings are advice here too — `judgedBy` keeps every
// one of them out of `refusableFindings`.
export const SHIP_JEV_BUDGET_MS = 30000;

export const GATE = Object.freeze({
  PASS: 'pass',
  REFUSE: 'refuse',
  OVERRIDDEN: 'overridden',
  UNVERIFIED: 'unverified',
});

/**
 * @param {string} baseDir
 * @param {{
 *   checks?: ReadonlyArray<object>,
 *   modelChecks?: ReadonlyArray<object>,
 *   acceptStale?: string[],
 *   runner?: (baseDir: string, checks: ReadonlyArray<object>) => Promise<object>,
 * }} [opts]
 */
export async function runShipContentGate(baseDir, opts = {}) {
  const checks = [...(opts.checks ?? ALL_DRIFT_CHECKS), ...(opts.modelChecks ?? modelJudgedChecks({ budgetMs: SHIP_JEV_BUDGET_MS }))];
  const accepted = new Set(opts.acceptStale ?? []);
  const runner = opts.runner ?? runDriftChecks;

  let report;
  try {
    report = await runner(baseDir, checks);
  } catch (err) {
    return { status: GATE.UNVERIFIED, reason: err.message, refusals: [], overridden: [], advice: [], blind: [], coverage: [], checked: 0, record: null };
  }

  const refusable = new Set(refusableFindings(report));
  const refusals = [];
  const overridden = [];
  const advice = [];
  for (const r of report.results ?? []) {
    for (const f of r.findings ?? []) {
      if (!refusable.has(f)) advice.push(f);
      else if (accepted.has(f.check)) overridden.push(f);
      else refusals.push(f);
    }
  }
  const blind = (report.results ?? [])
    .filter((r) => r.status === STATUS.CANNOT_EVALUATE)
    .map((r) => ({ id: r.id, reason: r.reason }));

  const coverage = (report.results ?? [])
    .filter((r) => r.coverage)
    .map((r) => ({ id: r.id, ...r.coverage }));

  const status = refusals.length ? GATE.REFUSE : overridden.length ? GATE.OVERRIDDEN : GATE.PASS;
  const record = overridden.length
    ? overridden
        .map((f) => `- \`--accept-stale ${f.check}\` — shipped past: ${f.receipt.claim.file}:${f.receipt.claim.line} — ${f.message}`)
        .join('\n')
    : null;

  return { status, reason: null, refusals, overridden, advice, blind, coverage, checked: (report.results ?? []).length, record };
}

function clearingEdit(f) {
  return f.fix ?? `Correct ${f.receipt.claim.file}:${f.receipt.claim.line} so it agrees with the evidence.`;
}

/** Human-readable gate output for ship.md to print verbatim. */
export function formatShipContentGate(result) {
  if (result.status === GATE.UNVERIFIED) {
    return `⚠ Content gate could not run: ${result.reason}. Nothing was checked — this is not a pass.`;
  }
  const lines = [];
  if (result.status === GATE.REFUSE) {
    lines.push(`✗ SHIP refused — ${result.refusals.length} record(s) contradicted by evidence:`);
    for (const f of result.refusals) {
      lines.push('', `  [${f.check}] ${f.message}`, renderReceipt(f.receipt));
      lines.push(`  fix:      ${clearingEdit(f)}`);
      lines.push(`  or ship past it on purpose: --accept-stale ${f.check}`);
    }
  } else if (result.status === GATE.OVERRIDDEN) {
    lines.push(`⚠ Content gate overridden for ${result.overridden.length} record(s) — recorded in the SHIP artifact:`);
    lines.push(result.record);
  } else {
    lines.push(`✓ Content gate: checked ${result.checked}, nothing refusable.`);
  }
  if (result.advice.length) {
    lines.push('', `Advice — does not block (${result.advice.length}):`);
    for (const f of result.advice) {
      const who = f.judgedBy ? ` (judged by ${f.judgedBy.model}, confidence ${f.judgedBy.confidence})` : '';
      lines.push(`  - [${f.check}] ${f.message}${who}`);
      if (f.receipt) lines.push(renderReceipt(f.receipt));
    }
  }
  for (const c of result.coverage ?? []) {
    const skipped = c.unchecked?.length ? `; ${c.unchecked.length} not checked (${[...new Set(c.unchecked.map((u) => u.reason))].join(', ')})` : '';
    lines.push('', `${c.id}: checked ${c.checked} of ${c.total}${skipped}${c.model ? ` — ${c.model}; results can vary between runs` : ''}.`);
  }
  if (result.blind.length) {
    lines.push('', `Could not evaluate (${result.blind.length}) — not counted as clean:`);
    for (const b of result.blind) lines.push(`  - ${b.id}: ${b.reason}`);
  }
  return lines.join('\n');
}
