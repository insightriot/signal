// tools/lib/sweep.js — the read-only /sig:sweep check library (M5.E6 FR1/FR2).
//
// A set of deterministic, OFFLINE, READ-ONLY checks that /sig:sweep runs over the
// INVOKING project (`process.cwd()`, never hard-coded Signal paths) to surface doc
// rot. Each check returns findings shaped `{check, severity, file, message}` with
// severity ∈ 'structural' (the things the test-suite guard hard-fails on) |
// 'advisory' (nudges — bloat, stale inbox). Nothing here writes.
//
// The portable checks live here (meaningful in any Signal-managed repo). The
// stale-inbox check deliberately lives in THIS module, not doc-hygiene.js, so the
// standing guard's meta-test (which forbids inbox-name tokens in doc-hygiene.js
// source) stays green (AD3).

import { readFile } from 'node:fs/promises';
import { statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  enumeratePlanningDocs,
  parseExistingAnnotations,
  renderPlanningIndex,
  isForeignIndexFormat,
} from './planning-index.js';
import { resolveInboxPath } from './inbox-path.js';
import { listDrainCandidatesWithRecovery } from './drain.js';
import { listCommands } from './roster.js';
import {
  parseFrontmatter,
  StateSchemaError,
  readState,
  partitionCompletedPhases,
  PHASES,
} from './state.js';
import {
  checkInternalLinks,
  checkFillInStubs,
  checkRosterCounts,
  checkVersionConsistency,
} from './doc-hygiene.js';
import { enumerateRetros, parseExistingHooks, renderIndex } from './retro-index.js';
import { runDriftChecks, renderDriftReport, STATE_DRIFT_CHECKS } from './state-drift.js';
import { backlogDischargeStatus, BACKLOG_DISCHARGE } from './backlog.js';

const PLANNING_DIR = '.planning';

const mkFinding = (check, severity, file, message) => ({ check, severity, file, message });

// Stable finding order for deterministic reports (mirrors doc-hygiene.js's
// findingCmp): by check, then file, then message.
const findingCmp = (a, b) =>
  a.check.localeCompare(b.check) || a.file.localeCompare(b.file) || a.message.localeCompare(b.message);

/**
 * `.planning/INDEX.md` freshness (portable, AC2.1). Composes the EXPECTED index
 * via the pure `enumeratePlanningDocs` → `parseExistingAnnotations(on-disk)` →
 * `renderPlanningIndex` path and diffs it against the on-disk INDEX.md — it NEVER
 * calls the writing Core (`regeneratePlanningIndexCore` atomic-writes on drift),
 * so a sweep run stays read-only (AC1.5).
 *
 * Gating (AD5, stranger-repo noise suppression): drift is STRUCTURAL only for a
 * Signal-managed INDEX (one the round-trip parser can read — `isForeignIndexFormat`
 * stands in for AD5's "carries the autogen marker" condition, since the marker
 * const is not exported). A foreign/hand-written INDEX, an absent INDEX, or an
 * empty INDEX → ADVISORY, never structural.
 *
 * @param {string} baseDir — project root (where `.planning/` lives)
 * @returns {Promise<Array<{check: string, severity: string, file: string, message: string}>>}
 */
export async function checkIndexFreshness(baseDir) {
  const rel = PLANNING_DIR + '/INDEX.md';
  const indexPath = join(baseDir, PLANNING_DIR, 'INDEX.md');

  let existing = null;
  try {
    existing = await readFile(indexPath, 'utf-8');
  } catch {
    existing = null; // absent
  }

  // Absent or empty → advisory (nothing to diff; a fresh repo just hasn't run
  // /sig:index yet). Empty is treated like absent per AD5's "absent → advisory".
  if (existing === null || existing.trim() === '') {
    return [mkFinding('index-freshness', 'advisory', rel, 'no INDEX.md present — run /sig:index to generate it')];
  }

  // Foreign / hand-written → advisory (regenerating would clobber curated content;
  // not this repo's managed index).
  if (isForeignIndexFormat(existing)) {
    return [
      mkFinding('index-freshness', 'advisory', rel, 'INDEX.md is a foreign/hand-written format — not auto-managed'),
    ];
  }

  // Managed index: compose the expected content (pure) and diff.
  const docs = await enumeratePlanningDocs(baseDir);
  const annotations = parseExistingAnnotations(existing);
  const expected = renderPlanningIndex(docs, annotations);

  if (expected !== existing) {
    return [mkFinding('index-freshness', 'structural', rel, 'INDEX.md is stale — regenerate with /sig:index')];
  }
  return [];
}

/**
 * Retro-index freshness (M5.E13 S4.t2, FR3.2) — the sibling of
 * `checkIndexFreshness`, for `RETROSPECTIVES.md`.
 *
 * `B36`'s third live sighting was at M5.E8's own ship: `RETROSPECTIVES.md` was
 * missing its M5.E8 row entirely, and nothing noticed. `regenerateIndexCore` is
 * already deterministic and compare-before-write, so the test is simply *"would
 * a regen write? then the index is stale."*
 *
 * **Composed read-only, never by calling the writer** (AC3.3, NFR2): this walks
 * the same pure `enumerateRetros → parseExistingHooks → renderIndex` path
 * `regenerateIndexCore` uses, and diffs. A check that repaired what it measured
 * could not be run from `/sig:sweep`, whose whole discipline is detect-and-report.
 *
 * Severity follows NFR3 — advisory paths fail open:
 *   - no retros at all      → **no finding** (a greenfield project stays quiet)
 *   - retros but no index   → **advisory** (nothing to diff; run the regen)
 *   - index differs         → **structural** (a real, mechanical drift)
 *
 * @param {string} baseDir — project root (where `.planning/` lives)
 * @returns {Promise<Array<{check: string, severity: string, file: string, message: string}>>}
 */
export async function checkRetroIndexFreshness(baseDir) {
  const rel = PLANNING_DIR + '/RETROSPECTIVES.md';
  const result = await retroIndexFreshness(baseDir);

  if (result.outcome === RETRO_FRESHNESS.STALE) {
    return [
      mkFinding(
        'retro-index-freshness',
        'structural',
        rel,
        'RETROSPECTIVES.md is stale — a regen would rewrite it (rows added, removed, or changed)'
      ),
    ];
  }
  if (result.outcome === RETRO_FRESHNESS.CANNOT_EVALUATE) {
    // A greenfield project genuinely has nothing to say, and saying it every
    // run is how a detector earns the mute that makes it useless. Every OTHER
    // un-evaluable reason is reported: an unreadable project and a missing
    // index both used to render as silence, indistinguishable from "checked
    // and clean" — `B39`'s shape (M5.E10 AC7.2).
    if (result.reason === REASON_GREENFIELD) return [];
    return [mkFinding('retro-index-freshness', 'advisory', rel, result.reason)];
  }
  return [];
}

/** @enum {string} */
export const RETRO_FRESHNESS = Object.freeze({
  FRESH: 'fresh',
  STALE: 'stale',
  CANNOT_EVALUATE: 'cannot-evaluate',
});

const REASON_GREENFIELD =
  'no retrospectives on disk yet — nothing to compare (the first lands at the next Epic close)';

/**
 * Retro-index freshness as a THREE-outcome record (M5.E10 FR7 / AC7.2).
 *
 * The finding-shaped wrapper above predates this and stays the `/sig:sweep`
 * surface; this is the half that distinguishes **"checked and clean"** from
 * **"could not check"**. Before it, four different situations all returned an
 * empty finding list — index matches, no retros exist, the project is
 * unreadable — and a reader could not tell which. Three of those are not clean
 * results; they are absences of a result.
 *
 * @param {string} baseDir — project root (where `.planning/` lives)
 * @returns {Promise<{outcome: string, reason: string|null, retroCount: number}>}
 */
export async function retroIndexFreshness(baseDir) {
  const indexPath = join(baseDir, PLANNING_DIR, 'RETROSPECTIVES.md');
  const cannot = (reason, retroCount = 0) => ({
    outcome: RETRO_FRESHNESS.CANNOT_EVALUATE,
    reason,
    retroCount,
  });

  let retros;
  try {
    retros = await enumerateRetros(baseDir);
  } catch {
    return cannot('the retrospectives on disk could not be read — freshness was not checked');
  }
  if (!retros || retros.length === 0) return cannot(REASON_GREENFIELD);

  let existing = null;
  try {
    existing = await readFile(indexPath, 'utf-8');
  } catch {
    existing = null;
  }
  if (existing === null || existing.trim() === '') {
    return cannot(
      `${retros.length} retrospective(s) present but no RETROSPECTIVES.md index — regenerate it`,
      retros.length
    );
  }

  const expected = renderIndex(retros, parseExistingHooks(existing));
  return {
    outcome: expected === existing ? RETRO_FRESHNESS.FRESH : RETRO_FRESHNESS.STALE,
    reason: null,
    retroCount: retros.length,
  };
}

/**
 * Backlog rows asserting `pending` about finished work (portable, advisory —
 * M5.E10 FR9 / AC9.4, `B94`).
 *
 * The finding-shaped surface over `backlogDischargeStatus`. Severity is advisory
 * in every case, including a confirmed stale row: whether a row should close is
 * a judgment (work can legitimately outlive the unit that named it), and a
 * structural finding on a judgment is how a check earns the mute that makes it
 * useless.
 *
 * The silent case is deliberate and narrow — a project with **no BACKLOG.md at
 * all**, which is 8 of the 12 local projects. Nudging them every run about a
 * document they have chosen not to keep is noise. Every OTHER un-evaluable
 * reason reports, because "could not check" rendering as silence is `B39`'s
 * shape and the reason `S4.t1` exists three slices above this one.
 *
 * @param {string} baseDir — project root (where `.planning/` lives)
 * @returns {Promise<Array<{check: string, severity: string, file: string, message: string}>>}
 */
export async function checkBacklogDischarge(baseDir) {
  const rel = PLANNING_DIR + '/BACKLOG.md';
  let result;
  try {
    result = await backlogDischargeStatus(baseDir);
  } catch (err) {
    return [mkFinding('backlog-discharge', 'advisory', rel, `the backlog could not be checked — ${err.message}`)];
  }

  if (result.outcome === BACKLOG_DISCHARGE.STALE) {
    const named = result.stale
      .map((s) => `${s.id} (line ${s.line}: "${s.heading.slice(0, 60)}")`)
      .join('; ');
    return [
      mkFinding(
        'backlog-discharge',
        'advisory',
        rel,
        `${result.stale.length} row(s) read as pending while the work they name is recorded closed — ${named}. ` +
          `Discharge them at ship, or mark the heading "STILL OPEN" and say why.`
      ),
    ];
  }
  if (result.outcome === BACKLOG_DISCHARGE.CANNOT_EVALUATE) {
    if (result.reason.startsWith('no BACKLOG.md')) return [];
    return [mkFinding('backlog-discharge', 'advisory', rel, result.reason)];
  }
  return [];
}

/**
 * Stale-inbox nudge (portable, advisory — AC2.2). Counts the undrained entries in
 * the capture inbox (resolved by `resolveInboxPath` so a legacy or v3 repo both
 * work — no inbox-name literal here) using the same `listDrainCandidatesWithRecovery`
 * count `/sig:plan` surfaces, and reports "consider draining" when N > 0. Never
 * structural; a missing inbox (or zero undrained entries) yields no finding.
 *
 * @param {string} baseDir — project root (where `.planning/` lives)
 * @returns {Promise<Array<{check: string, severity: string, file: string, message: string}>>}
 */
export async function checkStaleInbox(baseDir) {
  const inboxRel = resolveInboxPath(baseDir);
  let content;
  try {
    content = await readFile(join(baseDir, inboxRel), 'utf-8');
  } catch {
    return []; // no inbox → nothing to nudge
  }
  const n = listDrainCandidatesWithRecovery(content).candidates.length;
  if (n > 0) {
    return [
      mkFinding('stale-inbox', 'advisory', inboxRel, `inbox has ${n} undrained ${n === 1 ? 'entry' : 'entries'} — consider draining`),
    ];
  }
  return [];
}

// CLAUDE.md bloat threshold (AD6). A COARSE advisory nudge — NOT the STATE size
// threshold (STATE accretes history; CLAUDE.md loads every turn, so it must stay
// lean). PLAN-set default; revisitable in VERIFY if dogfooding shows noise.
export const CLAUDE_MD_BLOAT_BYTES = 40 * 1024;

/**
 * CLAUDE.md bloat nudge (portable, advisory — AC2.3). A CLAUDE.md whose size
 * exceeds `CLAUDE_MD_BLOAT_BYTES` yields an advisory; under the threshold (or a
 * missing file — a stranger repo may have none) yields no finding. Coarse and
 * size-only; never structural, never throws.
 *
 * @param {string} baseDir — project root
 * @returns {Array<{check: string, severity: string, file: string, message: string}>}
 */
export function checkClaudeMdBloat(baseDir) {
  let size;
  try {
    size = statSync(join(baseDir, 'CLAUDE.md')).size;
  } catch {
    return []; // no CLAUDE.md → nothing to nudge
  }
  if (size > CLAUDE_MD_BLOAT_BYTES) {
    return [
      mkFinding('claude-md-bloat', 'advisory', 'CLAUDE.md', `CLAUDE.md is ${size} bytes (over the ${CLAUDE_MD_BLOAT_BYTES}-byte nudge threshold) — consider de-bloating`),
    ];
  }
  return [];
}

/**
 * Command-frontmatter freshness (Signal-only, structural — AC2.4). Every
 * `commands/*.md` must carry YAML frontmatter with a present, non-empty
 * `description`. Enumerates the roster via `listCommands`, parses each file's
 * frontmatter with the shared `parseFrontmatter`, and flags:
 *   - no frontmatter at all (`data === null`);
 *   - a missing/empty `description`;
 *   - malformed frontmatter YAML — `parseFrontmatter` throws `StateSchemaError`
 *     (invalid YAML OR a non-mapping frontmatter); it is CAUGHT and emitted as a
 *     finding so a single broken command never crashes the whole sweep.
 *
 * Signal-only: `runSweep` runs this only under the plugin.json gate (a stranger
 * repo has no command roster). A missing `commands/` dir yields no finding.
 *
 * @param {string} baseDir — project root (where `commands/` lives)
 * @returns {Promise<Array<{check: string, severity: string, file: string, message: string}>>}
 */
export async function checkCommandFrontmatter(baseDir) {
  const findings = [];
  for (const rel of listCommands(baseDir)) {
    let raw;
    try {
      raw = await readFile(join(baseDir, rel), 'utf-8');
    } catch {
      continue; // listed but unreadable (race) — not our failure mode
    }
    let data;
    try {
      ({ data } = parseFrontmatter(raw));
    } catch (err) {
      if (err instanceof StateSchemaError) {
        // Stable message (no embedded parser detail) so two runs are byte-identical.
        findings.push(mkFinding('command-frontmatter', 'structural', rel, 'malformed frontmatter (invalid YAML)'));
        continue;
      }
      throw err;
    }
    if (data === null) {
      findings.push(mkFinding('command-frontmatter', 'structural', rel, 'missing frontmatter'));
      continue;
    }
    const desc = data.description;
    if (desc === undefined || desc === null || String(desc).trim() === '') {
      findings.push(mkFinding('command-frontmatter', 'structural', rel, 'frontmatter description is missing or empty'));
    }
  }
  return findings.sort(findingCmp);
}

// --- orchestrator -------------------------------------------------------------

// Sweep's widened scan scope (FR1): repo docs (README/CLAUDE + docs/, analysis/)
// PLUS `.planning/`. `archive/` stays exempt because it is in doc-hygiene's
// default WALK_IGNORE (AC1.2) — the walk never descends into it. `stripCode`
// keeps code-quoted `](path.md)` samples in `.planning/` research/plan docs from
// being mis-flagged as live links.
const SWEEP_LINK_SCOPE = { topFiles: ['README.md', 'CLAUDE.md'], dirs: ['docs', 'analysis', '.planning'], stripCode: true };
const SWEEP_FILLIN_SCOPE = { topFiles: ['README.md'], dirs: ['docs', '.planning'] };

// The Signal-only checks, named in report order. Run only under the plugin.json
// gate; their names are surfaced in the report whether they ran or were skipped.
const SIGNAL_ONLY_CHECKS = ['roster-counts', 'version-consistency', 'command-frontmatter'];

// doc-hygiene.js findings speak `hard`/`soft`; sweep's report speaks
// `structural`/`advisory` (AC1.6: hard-fail-class → structural, nudge → advisory).
// The sweep-native checks already emit the target vocabulary, so this is a no-op
// for them.
const SEVERITY_MAP = { hard: 'structural', soft: 'advisory' };
const normalizeSeverity = (f) => (SEVERITY_MAP[f.severity] ? { ...f, severity: SEVERITY_MAP[f.severity] } : f);

/**
 * The full read-only sweep (FR1). Composes the portable check set (dead-links +
 * `[FILL IN]` over the widened `.planning/`-inclusive scope, index-freshness,
 * stale-inbox, CLAUDE.md-bloat — meaningful in any repo) and, gated on the
 * plugin manifest at its canonical `.claude-plugin/plugin.json` path, the
 * Signal-only set (roster, version, command-frontmatter). When the manifest is
 * absent the Signal-only checks are skipped and the fact is recorded on the
 * result so the report can STATE the skip (AC1.3), never silently drop it.
 *
 * Writes nothing (AC1.5): index-freshness uses the pure compose-and-diff path,
 * every other check only reads. Deterministic + offline (AC2.6 / NFR1).
 *
 * @param {string} [baseDir=process.cwd()] — the INVOKING project root
 * @returns {Promise<{findings: Array, signalOnly: {ran: boolean, checks: string[]}}>}
 */
/**
 * Phase-log health (M5.E9 FR7, AC7.1/AC7.4). Read-only, like every sweep check.
 *
 * Two findings, and they are deliberately NOT the same severity, because one is
 * fixable and the other is not:
 *
 *   - MALFORMED entries → **structural**, and it names the repair command.
 *     A stray line in `completed_phases` keys on its first whitespace token and
 *     becomes a permanent phantom phase (`B45`). This is repairable.
 *
 *   - a TRUNCATED-looking history → **advisory**, and it says plainly that
 *     **no repair exists** (AC7.4). Entries destroyed by the pre-M5.E9 dedupe
 *     are gone from the file; nothing can reconstruct them. Pointing at a fix
 *     that cannot deliver would be a reassuring lie, which is worse than
 *     silence — the user would believe the history came back.
 *
 * @param {string} baseDir
 * @returns {Promise<Array<{check:string,severity:string,file:string,message:string}>>}
 */
export async function checkPhaseLog(baseDir) {
  const rel = '.planning/STATE.md';
  let state;
  try {
    state = await readState(baseDir);
  } catch {
    return []; // unparseable STATE is another check's problem; never throw here
  }
  if (!state) return [];

  const entries = state.completed_phases ?? state.completedPhases ?? [];
  const { valid, malformed } = partitionCompletedPhases(entries);
  const out = [];

  if (malformed.length > 0) {
    const first = String(malformed[0]).slice(0, 60);
    out.push(
      mkFinding(
        'phase-log',
        'structural',
        rel,
        `completed_phases has ${malformed.length} malformed ${malformed.length === 1 ? 'entry' : 'entries'} ` +
          `(first: "${first}") — before v0.1.12 these became permanent phantom phases. ` +
          `They are now quarantined automatically on the next phase transition: relocated verbatim to ` +
          `.planning/STATE-HISTORY.md, never deleted. To clear them now, run /sig:migrate-memory ` +
          `(dry-run first) for prose-sized entries, or simply run the next phase command.`
      )
    );
  }

  // A live list longer than one run means the trim never ran — the growth half
  // of the same problem. One run is at most the seven phases.
  if (valid.length > PHASES.length) {
    out.push(
      mkFinding(
        'phase-log',
        'advisory',
        rel,
        `completed_phases holds ${valid.length} entries — more than one run (max ${PHASES.length}). ` +
          `It should trim at ship (linear) or on an Epic roll. Recommended: run /sig:migrate-memory.`
      )
    );
  }

  // NO TRUNCATION CHECK — deliberately, and this is the second attempt.
  //
  // The first implementation flagged "one entry per phase name" as the
  // fingerprint of the pre-v0.1.12 collapse. REVIEW proved it fires on EVERY
  // HEALTHY PROJECT: one entry per phase name is exactly what a normal
  // single run looks like. A mid-run project at VERIFY holding
  // [DISCUSS, PLAN, EXECUTE] tripped it. Signal's own repo escaped only
  // because it happens to have a STATE-HISTORY.md.
  //
  // Telling a healthy user their history was destroyed is worse than saying
  // nothing: it is alarming, unactionable, and false. It is the mirror image
  // of the reassuring lie AC7.4 forbids — a frightening one.
  //
  // The deeper point: a past collapse is NOT DETECTABLE from the file. The
  // evidence was destroyed by the very bug being detected, and a collapsed
  // list is byte-indistinguishable from a healthy single run. No heuristic
  // fixes that; a better heuristic would just fail less obviously.
  //
  // The disclosure moved to where a one-time fact belongs — the v0.1.12
  // release notes — instead of a per-run alarm that cries wolf forever.

  return out;
}

export async function runSweep(baseDir = process.cwd()) {
  const raw = [];

  // Portable checks — run in any repo.
  raw.push(...checkInternalLinks(baseDir, SWEEP_LINK_SCOPE));
  raw.push(...checkFillInStubs(baseDir, SWEEP_FILLIN_SCOPE));
  raw.push(...(await checkIndexFreshness(baseDir)));
  raw.push(...(await checkRetroIndexFreshness(baseDir)));
  raw.push(...(await checkStaleInbox(baseDir)));
  raw.push(...(await checkBacklogDischarge(baseDir)));
  raw.push(...checkClaudeMdBloat(baseDir));
  raw.push(...(await checkPhaseLog(baseDir)));

  // Signal-only checks — gated on the plugin manifest (the roster/version/command
  // checks are meaningless in a stranger repo). Canonical path only, never repo
  // root: a stray root plugin.json in an unrelated project must not trip the gate.
  const ran = existsSync(join(baseDir, '.claude-plugin', 'plugin.json'));
  if (ran) {
    raw.push(...checkRosterCounts(baseDir));
    raw.push(...checkVersionConsistency(baseDir));
    raw.push(...(await checkCommandFrontmatter(baseDir)));
  }

  const findings = raw.map(normalizeSeverity).sort(findingCmp);

  // M5.E16 — what `.planning/` ASSERTS vs. what is on disk and in git.
  //
  // Deliberately NOT merged into `findings` (FR1.2). A STATE contradiction is a
  // different kind of wrong from a dead link: it carries a heal category, it can
  // be *unevaluable* rather than merely absent, and folding it into the
  // structural/advisory buckets would lose both distinctions. Its own group also
  // means "could not check" has somewhere to live that "clean" does not.
  const stateDrift = await runDriftChecks(baseDir, STATE_DRIFT_CHECKS);

  return { findings, stateDrift, signalOnly: { ran, checks: SIGNAL_ONLY_CHECKS } };
}

/**
 * Render a sweep result (or a bare findings array) into a deterministic,
 * human-readable report. PURE — no I/O. Groups findings by severity (structural
 * then advisory), each group sorted by `findingCmp` (already applied by
 * `runSweep`), and — when given the full result object — states whether the
 * Signal-only checks ran or were skipped (AC1.3). Two renders of equal input are
 * byte-identical (AC2.6).
 *
 * @param {{findings: Array, signalOnly?: {ran: boolean, checks: string[]}} | Array} report
 * @returns {string}
 */
export function renderSweepReport(report) {
  const findings = Array.isArray(report) ? report : report.findings;
  const signalOnly = Array.isArray(report) ? null : report.signalOnly;
  const stateDrift = Array.isArray(report) ? null : report.stateDrift;

  const structural = findings.filter((f) => f.severity === 'structural');
  const advisory = findings.filter((f) => f.severity === 'advisory');

  const lines = ['# /sig:sweep — doc-hygiene report', ''];
  lines.push(...renderGroup('Structural', structural), '');
  lines.push(...renderGroup('Advisory', advisory));
  if (stateDrift) {
    lines.push('', renderDriftReport(stateDrift).trimEnd());
  }
  if (signalOnly) {
    lines.push('', '## Signal-only checks');
    lines.push(
      signalOnly.ran
        ? `ran: ${signalOnly.checks.join(', ')}`
        : `skipped (not a plugin repo): ${signalOnly.checks.join(', ')}`,
    );
  }
  return lines.join('\n') + '\n';
}

function renderGroup(title, group) {
  const out = [`## ${title} (${group.length})`];
  if (group.length === 0) {
    out.push('none');
  } else {
    for (const f of group) out.push(`- [${f.check}] ${f.file} — ${f.message}`);
  }
  return out;
}
