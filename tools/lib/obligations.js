// Open-obligation tracking (`M5.E14` first slice).
//
// ── The bug this exists to end ───────────────────────────────────────────────
//
// `PROFILE.md`'s `backfill_warnings` is an append-only list of things a project
// still owes ("REVIEW was skipped earlier — run /sig:review on prior commits").
// It has no way to record that one was DONE. The schema makes the true state
// unrepresentable, so a discharged obligation reads as open forever.
//
// That is not theoretical. From `CLAIM-INTEGRITY-ANALYSIS.md`, specimen #4 —
// the purest of the five: a Phase-8 security backfill was discharged by Phase
// 10's REVIEW and ticked in four places. Phase 11's VERIFY reported it "still
// owed" as a structural inference from this array; `/sig:review` escalated that
// to a bolded warning; STATE.md then absorbed the warning as fact. The claim
// gained confidence at every hop and never once gained evidence. One grep of
// `PHASE10-REVIEW.md` would have refuted it at any of them.
//
// ── Why a NAMED SOURCE, when there is currently one source ──────────────────
//
// The tracker decision is deferred, not declined (`D-M5E14-1`): obligation
// status is expected to move to GitHub Issues, where "closed" is an event with
// an actor and a timestamp rather than a string an agent rewrites wholesale.
//
// So the gate asks `readOpenObligations` — "is anything still open?" — and the
// answer is assembled from registered RESOLVERS. Adding the tracker later means
// registering a second resolver, not rewriting the gate or its callers. The
// registry has exactly one real entry today and NO placeholder for the tracker:
// a declared-but-unimplemented source is the "unreached mechanism" defect this
// repo named in `17e445c`, and shipping one inside this slice would be another
// instance of it.
//
// ── Reporting, never halting (Brett's call, 2026-08-08) ─────────────────────
//
// Deliberately the opposite of `branch-guard.js`, which halts. The branch gate
// asks "did you follow the process?", which has one right answer. This asks "is
// there outstanding work?", where "yes, and I am shipping anyway" is frequently
// correct. A gate that blocks on a judgement call trains people to route around
// it, and a routed-around gate is worse than a loud report.

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { atomicWrite } from './atomic-write.js';

const PLANNING_DIR = '.planning';

/**
 * Outcomes, kept distinguishable — same contract as `state-drift.js` and
 * `branch-guard.js`. `cannot-determine` must never render as `ok`+empty (`B39`).
 */
export const OBLIGATION_READ = Object.freeze({
  OK: 'ok',
  NOT_APPLICABLE: 'not-applicable',
  CANNOT_DETERMINE: 'cannot-determine',
});

/** The one source that exists today. Named so a second can join it. */
export const SOURCE_PROFILE_BACKFILL = 'profile:backfill_warnings';

/**
 * Normalize one `backfill_warnings` entry.
 *
 * The array historically held plain strings and still may — every profile
 * written before this slice does. A string is an OPEN obligation; the object
 * form is the same warning able to carry its own discharge. Widening rather
 * than replacing keeps every existing PROFILE.md readable with no migration,
 * which matters because a migration that has to run before the fix works is a
 * second thing that can silently not happen.
 *
 * @returns {{text: string, discharged: boolean, dischargedBy: string|null, dischargedAt: string|null, malformed: boolean}}
 */
export function normalizeObligation(entry) {
  if (typeof entry === 'string') {
    return { text: entry, discharged: false, dischargedBy: null, dischargedAt: null, malformed: false };
  }
  if (entry && typeof entry === 'object' && typeof entry.warning === 'string') {
    return {
      text: entry.warning,
      // Only literal `true` discharges. A truthy string like "no" must not.
      discharged: entry.discharged === true,
      dischargedBy: typeof entry.discharged_by === 'string' ? entry.discharged_by : null,
      dischargedAt: typeof entry.discharged_at === 'string' ? entry.discharged_at : null,
      malformed: false,
    };
  }
  return {
    text: typeof entry === 'string' ? entry : JSON.stringify(entry),
    discharged: false,
    dischargedBy: null,
    dischargedAt: null,
    malformed: true,
  };
}

/**
 * Every obligation recorded in a PROFILE.md's escalation history.
 *
 * Reads the file directly rather than through `readProfile`, which THROWS on a
 * malformed or ahead-schema profile. This feeds a report at ship time: a
 * profile it cannot parse must produce `cannot-determine`, not an exception and
 * not silence.
 *
 * @returns {Promise<{source: string, status: string, obligations: Array, reason: string|null}>}
 */
export async function readProfileObligations(baseDir, opts = {}) {
  const rel = opts.profileFile ?? 'PROFILE.md';
  const path = join(baseDir, PLANNING_DIR, rel);
  const out = (status, extra = {}) => ({
    source: SOURCE_PROFILE_BACKFILL,
    status,
    obligations: [],
    reason: null,
    ...extra,
  });

  if (!existsSync(path)) {
    return out(OBLIGATION_READ.NOT_APPLICABLE, { reason: `${rel} not present` });
  }

  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    return out(OBLIGATION_READ.CANNOT_DETERMINE, { reason: `could not read ${rel}: ${err.message}` });
  }

  let history;
  try {
    history = parseEscalationHistory(raw);
  } catch (err) {
    return out(OBLIGATION_READ.CANNOT_DETERMINE, {
      reason: `could not parse escalation_history in ${rel}: ${err.message}`,
    });
  }
  if (history === null) {
    // No escalation history at all is a real, common, correct state — a project
    // that never escalated owes nothing. Distinct from a history that failed to
    // parse, which is the case immediately above.
    return out(OBLIGATION_READ.NOT_APPLICABLE, { reason: 'no escalation history' });
  }

  const obligations = [];
  history.forEach((entry, entryIndex) => {
    entry.warnings.forEach((w, warningIndex) => {
      obligations.push({
        ...normalizeObligation(w),
        source: SOURCE_PROFILE_BACKFILL,
        profileFile: rel,
        entryIndex,
        warningIndex,
      });
    });
  });

  return out(OBLIGATION_READ.OK, { obligations });
}

/**
 * Minimal, tolerant reader for the `backfill_warnings` blocks inside a
 * PROFILE.md frontmatter's `escalation_history`.
 *
 * Hand-rolled rather than pulled through a YAML dependency because this file is
 * read at ship time in every project and the repo has no YAML dependency to
 * reach for — `profile.js` parses the same frontmatter by hand for the same
 * reason. It understands exactly the two shapes the schema documents.
 *
 * @returns {Array<{warnings: Array}>|null} null when there is no history block.
 */
export function parseEscalationHistory(content) {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const lines = fmMatch[1].split('\n');

  const start = lines.findIndex((l) => /^\s{0,4}escalation_history:/.test(l));
  if (start === -1) return null;
  if (/escalation_history:\s*\[\s*\]\s*$/.test(lines[start])) return [];

  const entries = [];
  let current = null;
  let inWarnings = false;
  let warningsIndent = -1;

  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    const baseIndent = lines[start].length - lines[start].trimStart().length;
    // Dedent back to or past `escalation_history:` ends the block.
    if (indent <= baseIndent && !/^\s*-/.test(line)) break;

    const item = line.match(/^(\s*)-\s+(.*)$/);
    if (item && !inWarnings) {
      current = { warnings: [] };
      entries.push(current);
      inWarnings = false;
      continue;
    }
    if (/^\s*backfill_warnings:\s*\[\s*\]\s*$/.test(line)) {
      inWarnings = false;
      continue;
    }
    if (/^\s*backfill_warnings:\s*$/.test(line)) {
      inWarnings = true;
      warningsIndent = indent;
      if (!current) {
        current = { warnings: [] };
        entries.push(current);
      }
      continue;
    }
    if (inWarnings) {
      if (indent <= warningsIndent && !/^\s*-/.test(line)) {
        inWarnings = false;
        i--; // reprocess this line outside the warnings block
        continue;
      }
      const w = line.match(/^\s*-\s+(.*)$/);
      if (w) {
        current.warnings.push(parseWarningScalarOrObject(w[1], lines, i));
        continue;
      }
      // A continuation key belonging to the previous object-form warning.
      const kv = line.match(/^\s*(discharged|discharged_by|discharged_at|warning):\s*(.*)$/);
      if (kv && current.warnings.length > 0) {
        const last = current.warnings[current.warnings.length - 1];
        if (typeof last === 'object') applyWarningKey(last, kv[1], kv[2]);
        continue;
      }
      if (indent <= warningsIndent) inWarnings = false;
    }
  }
  return entries;
}

function unquote(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function applyWarningKey(obj, key, rawValue) {
  const value = unquote(rawValue);
  if (key === 'discharged') obj.discharged = value === 'true';
  else if (key === 'warning') obj.warning = value;
  else obj[key] = value;
}

function parseWarningScalarOrObject(firstToken, lines, index) {
  const kv = firstToken.match(/^(warning|discharged|discharged_by|discharged_at):\s*(.*)$/);
  if (!kv) return unquote(firstToken); // legacy plain string
  const obj = {};
  applyWarningKey(obj, kv[1], kv[2]);
  void lines;
  void index;
  return obj;
}

/** Resolvers consulted by `readOpenObligations`, in order. */
const RESOLVERS = [readProfileObligations];

/**
 * The gate's single question: is anything still open?
 *
 * @returns {Promise<{open: Array, discharged: Array, sources: Array, blind: Array}>}
 *   `blind` lists sources that could not be read — never folded into `open`
 *   being empty, which is the whole point.
 */
export async function readOpenObligations(baseDir, opts = {}) {
  const sources = [];
  const open = [];
  const discharged = [];
  const blind = [];

  for (const resolve of opts.resolvers ?? RESOLVERS) {
    let result;
    try {
      result = await resolve(baseDir, opts);
    } catch (err) {
      blind.push({ source: 'unknown', reason: err.message });
      continue;
    }
    sources.push({ source: result.source, status: result.status, reason: result.reason });
    if (result.status === OBLIGATION_READ.CANNOT_DETERMINE) {
      blind.push({ source: result.source, reason: result.reason });
      continue;
    }
    for (const o of result.obligations) (o.discharged ? discharged : open).push(o);
  }

  return { open, discharged, sources, blind };
}

/**
 * The SHIP-time report. Reports; never halts.
 *
 * @returns {string}
 */
export function formatObligationReport(result) {
  const lines = [];

  if (result.open.length === 0 && result.blind.length === 0) {
    lines.push(
      result.discharged.length > 0
        ? `Open obligations: none (${result.discharged.length} discharged).`
        : 'Open obligations: none.'
    );
    return lines.join('\n');
  }

  if (result.open.length > 0) {
    lines.push(`Open obligations (${result.open.length}) — reported, not blocking:`);
    for (const o of result.open) lines.push(`  · ${o.text}  [${o.source}]`);
  }
  if (result.discharged.length > 0) {
    lines.push(`Discharged (${result.discharged.length}) — not owed:`);
    for (const o of result.discharged) {
      const by = o.dischargedBy ? ` by ${o.dischargedBy}` : '';
      const at = o.dischargedAt ? ` on ${o.dischargedAt}` : '';
      lines.push(`  · ${o.text}${by}${at}`);
    }
  }
  for (const b of result.blind) {
    // Never "none" — a source that could not be read has not reported zero.
    lines.push(`⚠ Could not check ${b.source}: ${b.reason}. Obligations there are UNKNOWN, not none.`);
  }
  return lines.join('\n');
}

/**
 * Mark one obligation discharged, in place.
 *
 * Rewrites the matching `- <text>` line as the object form. Kept surgical — a
 * whole-file YAML round-trip would reformat a hand-maintained PROFILE.md, and
 * `escalation_history` is append-only history nobody should be reflowing.
 *
 * @returns {Promise<{ok: boolean, reason: string|null}>}
 */
export async function dischargeObligation(baseDir, opts) {
  const { text, by, at, profileFile = 'PROFILE.md' } = opts;
  const path = join(baseDir, PLANNING_DIR, profileFile);
  if (!existsSync(path)) return { ok: false, reason: `${profileFile} not present` };

  const content = await readFile(path, 'utf8');
  const lines = content.split('\n');
  const idx = lines.findIndex((l) => {
    const m = l.match(/^(\s*)-\s+(.*)$/);
    return m && unquote(m[2]) === text;
  });
  if (idx === -1) return { ok: false, reason: `no open obligation matching ${JSON.stringify(text)}` };

  const indent = lines[idx].match(/^(\s*)-/)[1];
  const inner = `${indent}  `;
  const replacement = [
    `${indent}- warning: "${text.replace(/"/g, '\\"')}"`,
    `${inner}discharged: true`,
    `${inner}discharged_by: "${by ?? 'unspecified'}"`,
  ];
  if (at) replacement.push(`${inner}discharged_at: "${at}"`);

  lines.splice(idx, 1, ...replacement);
  await atomicWrite(path, lines.join('\n'));
  return { ok: true, reason: null };
}
