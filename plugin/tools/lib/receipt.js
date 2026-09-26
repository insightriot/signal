// tools/lib/receipt.js — M6.E3 FR1: the receipt contract.
//
// A finding may stop anything ONLY when it carries a receipt a person can check
// in seconds: the claim, and the thing that contradicts it, side by side
// (`D-M6E3-1`). A bare verdict — "this claim is unsupported" — is report-only,
// always. The reason is a choice between two measured failure modes: a gate that
// blocks on judgment gets overridden by reflex, and a gate that only reports
// becomes one more advisory line nobody reads. A receipt makes a wrong stop cost
// a glance instead of an argument.
//
// Two rules are enforced HERE, by construction, rather than by convention in each
// caller:
//
//   1. A receipt is only something `makeReceipt` built. A plain object with the
//      right keys is not one — `refusableFindings` checks provenance, so a check
//      cannot hand-roll its way into a refusal (AC1.4, AC1.5).
//   2. A finding judged by a model (`judgedBy` set) never refuses in this Epic,
//      even with a receipt (`D-M6E3-8`, AC9.4). The receipt still renders — it is
//      what makes the advice checkable — it just does not block.
//
// `refusableFindings` is the ONLY function any refusal path may use.

export class ReceiptError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReceiptError';
  }
}

const BUILT = new WeakSet();

const hasText = (s) => typeof s === 'string' && s.trim() !== '';
const isLine = (n) => Number.isInteger(n) && n > 0;

/**
 * Build a receipt. Throws `ReceiptError` on anything short of both sides with a
 * verbatim excerpt each.
 *
 * @param {{
 *   claim: {file: string, line: number, excerpt: string},
 *   evidence: {source: string, line?: number, sha?: string, excerpt: string},
 * }} input
 * @returns {Readonly<object>}
 */
export function makeReceipt(input) {
  if (!input || typeof input !== 'object') {
    throw new ReceiptError('a receipt needs a claim and its evidence — a bare verdict is not one');
  }
  const { claim, evidence } = input;
  if (!claim || !hasText(claim.file) || !isLine(claim.line) || !hasText(claim.excerpt)) {
    throw new ReceiptError('receipt claim needs file, a 1-based line, and a verbatim excerpt');
  }
  if (!evidence || !hasText(evidence.source) || !hasText(evidence.excerpt)) {
    throw new ReceiptError('receipt evidence needs a source and a verbatim excerpt');
  }
  if (!isLine(evidence.line) && !hasText(evidence.sha)) {
    throw new ReceiptError('receipt evidence needs a line or a commit sha');
  }
  const receipt = Object.freeze({
    claim: Object.freeze({ file: claim.file, line: claim.line, excerpt: claim.excerpt }),
    evidence: Object.freeze({
      source: evidence.source,
      ...(isLine(evidence.line) ? { line: evidence.line } : {}),
      ...(hasText(evidence.sha) ? { sha: evidence.sha } : {}),
      excerpt: evidence.excerpt,
    }),
  });
  BUILT.add(receipt);
  return receipt;
}

/** True only for a receipt `makeReceipt` built. */
export function isReceipt(value) {
  return value !== null && typeof value === 'object' && BUILT.has(value);
}

/**
 * The findings a refusal may act on: a built receipt, and no model judgment.
 * Fail-open in the one safe direction — a null or malformed report yields [],
 * because a missing report must never manufacture a refusal.
 */
export function refusableFindings(report) {
  const results = Array.isArray(report?.results) ? report.results : [];
  const out = [];
  for (const r of results) {
    for (const f of Array.isArray(r?.findings) ? r.findings : []) {
      if (isReceipt(f.receipt) && !f.judgedBy) out.push(f);
    }
  }
  return out;
}

const EXCERPT_MAX = 110;

function oneLine(text) {
  const first = String(text).split('\n').find((l) => l.trim() !== '') ?? '';
  const flat = first.trim();
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX - 1)}…` : flat;
}

/** A receipt in at most 15 lines, each excerpt elided to one line (AC1.3). */
export function renderReceipt(receipt) {
  const { claim, evidence } = receipt;
  const where = evidence.line ? `${evidence.source}:${evidence.line}` : `${evidence.source} @ ${evidence.sha}`;
  return [
    `  claim     ${claim.file}:${claim.line}`,
    `            "${oneLine(claim.excerpt)}"`,
    `  evidence  ${where}`,
    `            "${oneLine(evidence.excerpt)}"`,
  ].join('\n');
}
