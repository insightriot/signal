// Observed in-phase asks — the record, and the check that reads it (B75).
//
// WHAT THIS IS FOR. `attention: attended` sets `gates.confirm_in_phase`, which
// every phase command's preamble describes as "confirm at every step inside the
// phase". Until now that boolean was written by `applyRigorOverrides` and read
// by NOTHING (B75, re-triaged 2026-08-21: "the new boolean has ZERO consumers").
// The dial was documented end to end and observed nowhere.
//
// WHY A RECORD AND NOT A SELF-REPORT. Settled empirically 2026-08-22, not by
// reading docs: a `PostToolUse` hook with matcher `AskUserQuestion` DOES fire
// (see OPEN-QUESTIONS.md, "Is `AskUserQuestion` hookable?"). So the question can
// be observed as it happens rather than attested to afterwards. A self-recorded
// ledger catches a command that forgets; an observed one also catches a claim
// with no matching event.
//
// ⚠ WHAT IT CANNOT SEE — and every caller must say so rather than imply more.
// The hook observes THAT a question was asked and which phase was current. It
// cannot observe that the RIGHT question was asked. Worse, "the right number" is
// not even defined uniformly: measured across the six command preambles,
// `confirm_in_phase` means "one ask per gray-area decision" in discuss.md,
// "every wave boundary" in execute.md (countable — waves are a list), "every
// checklist step" in ship.md (countable — the checklist is written down), and
// the undefined "every step inside the phase" in plan.md, verify.md and
// review.md. So a count comparison is only possible in two of six phases, and
// this module deliberately does NOT attempt one. It answers exactly one
// question: was the user asked ANYTHING during this phase? That catches total
// omission — the ceremony quietly not happening — and nothing finer.
//
// WARN, NEVER BLOCK (Brett, 2026-08-22). Asked directly whether a phase closing
// with zero observed asks should be refused or reported, the answer was report.
// That keeps `check-state-write.js`'s two-tier posture intact (integrity blocks,
// process warns — D-E11-5) at the cost of being a nudge rather than a gate. The
// honest consequence, which BUGS.md and the docs must carry: `B75` closes as
// CHECKED AND REPORTED, not ENFORCED. Nothing fails if a command skips an ask.

import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Directory holding machine-local session evidence, relative to a project root.
 *
 * Deliberately NOT under `.planning/`. That directory is project MEMORY and is
 * tracked by standing policy ("never gitignore `.planning/`"); this file is
 * per-machine, per-session evidence with no cross-clone meaning — the check
 * reads it in the same session that wrote it. Putting it in `.planning/` would
 * force a choice between tracking high-churn noise and carving a gitignore
 * exception inside a directory that must not have one.
 */
export const EVIDENCE_DIR = '.signal';
export const ASK_RECORD_BASENAME = 'asks.jsonl';

/** Absolute path to a project's ask record. */
export function askRecordPath(baseDir) {
  return join(baseDir, EVIDENCE_DIR, ASK_RECORD_BASENAME);
}

/**
 * Append one observed ask.
 *
 * Never throws: this runs inside a `PostToolUse` hook, where an exception would
 * surface as a broken tool call in a stranger's repo for no benefit. A dropped
 * record degrades to `cannot-check` downstream, which is the honest outcome.
 *
 * @param {{baseDir: string, phase: string|null, epic: string|null, at?: string}} opts
 * @returns {boolean} true if a line was written
 */
export function recordAsk({ baseDir, phase, epic, at }) {
  const line =
    JSON.stringify({
      at: at ?? new Date().toISOString(),
      phase: phase ?? null,
      epic: epic ?? null,
    }) + '\n';
  const target = askRecordPath(baseDir);
  try {
    mkdirSync(dirname(target), { recursive: true });
    appendFileSync(target, line, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the ask record.
 *
 * @returns {{exists: boolean, entries: Array<{at: string, phase: string|null, epic: string|null}>}}
 *   `exists: false` is NOT the same as an empty record — see `checkPhaseAsks`.
 */
export function readAsks(baseDir) {
  let raw;
  try {
    raw = readFileSync(askRecordPath(baseDir), 'utf-8');
  } catch {
    return { exists: false, entries: [] };
  }
  const entries = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') entries.push(parsed);
    } catch {
      // A torn or hand-edited line is skipped, not fatal. Two hooks appending
      // concurrently can interleave; losing one record costs a false warn,
      // while throwing here would cost the whole check.
    }
  }
  return { exists: true, entries };
}

/** Phase names as they appear in `completed_phases`, e.g. `DISCUSS (2026-08-19)`. */
function phaseNamesOf(content) {
  const block = content.match(/^completed_phases:\s*\n((?:[ \t]+-[ \t]+.*\n?)*)/m);
  if (!block) return [];
  return block[1]
    .split('\n')
    .map((l) => l.replace(/^[ \t]*-[ \t]*/, '').trim())
    .filter(Boolean)
    .map((entry) => entry.split(/[\s(]/)[0]);
}

/**
 * Which phase, if any, is being LEFT by a proposed STATE.md write.
 *
 * `completed_phases` is append-only and records the phase being left (`B44`),
 * so a new trailing entry IS the phase transition. Comparing against the
 * on-disk content — rather than trusting `phase` — means an edit that rewrites
 * unrelated prose does not read as a transition.
 *
 * @returns {string|null} the phase name being left, or null if this write is
 *   not a phase transition (including a write that appends more than one entry,
 *   which is a bulk backfill rather than a phase closing).
 */
export function phaseBeingLeft({ proposedContent, currentContent }) {
  const before = phaseNamesOf(currentContent ?? '');
  const after = phaseNamesOf(proposedContent ?? '');
  if (after.length !== before.length + 1) return null;
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] !== after[i]) return null; // rewritten history, not an append
  }
  return after[after.length - 1] ?? null;
}

/**
 * Was the user asked anything during the phase now being closed?
 *
 * Three outcomes, and the third is the point. A check that renders nothing when
 * it could not look reads as "clean" — the shape `B39` is filed for, and the
 * distinction `/sig:docs-sweep` already draws between "checked and clean" and "could
 * not check". An absent record file means this hook has never run in this
 * project (fresh clone, plugin not loaded, hook removed); it does NOT mean zero
 * questions were asked.
 *
 * @param {{
 *   proposedContent: string,
 *   currentContent: string,
 *   baseDir: string,
 *   confirmInPhase: boolean,
 *   asks?: {exists: boolean, entries: Array<object>},
 * }} opts
 * @returns {{status: 'not-applicable'|'clean'|'warn'|'cannot-check', phase: string|null, reason: string|null}}
 */
export function checkPhaseAsks({
  proposedContent,
  currentContent,
  baseDir,
  confirmInPhase,
  asks,
}) {
  const phase = phaseBeingLeft({ proposedContent, currentContent });
  if (!phase) return { status: 'not-applicable', phase: null, reason: null };
  if (!confirmInPhase) {
    // The dial is not set to "ask me as you go" — nothing was promised, so
    // there is nothing to observe against.
    return { status: 'not-applicable', phase, reason: null };
  }

  const record = asks ?? readAsks(baseDir);
  if (!record.exists) {
    return {
      status: 'cannot-check',
      phase,
      reason:
        `${phase} is closing with attention: attended, but no ask record exists ` +
        `at ${EVIDENCE_DIR}/${ASK_RECORD_BASENAME} — so this could not be checked. ` +
        `That is not the same as "you were never asked": the record is written by a ` +
        `PostToolUse hook, which has never run here. Restart the CLI if Signal was ` +
        `just installed or updated.`,
    };
  }

  const matched = record.entries.filter((e) => e && e.phase === phase);
  if (matched.length > 0) {
    return { status: 'clean', phase, reason: null };
  }

  return {
    status: 'warn',
    phase,
    reason:
      `${phase} is closing with attention: attended — which every phase command ` +
      `describes as confirming with you as the phase runs — but no question to you ` +
      `was observed during it. Either the confirmations were skipped, or the dial is ` +
      `set higher than the work needed. This is a report, not a refusal: nothing was ` +
      `blocked. Note it only detects a phase where you were asked NOTHING; being asked ` +
      `once where several were owed looks identical to this check.`,
  };
}
