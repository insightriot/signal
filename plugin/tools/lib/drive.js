/**
 * The loop driver — the thing that runs the flow so a person does not have to sit
 * at every gate.
 *
 * Built from Signal's loop-engineering audit (a repository document, not shipped with
 * the plugin), which measured the problem before proposing anything: a FULL-tier Epic costs **48–86 synchronous human
 * touchpoints**, and almost all of that ceremony existed only in command prose,
 * enforced by nothing This module does not add ceremony. It decides what
 * happens next, and — crucially — what still has to stop for a person.
 *
 * Three pieces already existed and are reused rather than reinvented:
 *   - `describeNextAction` (B70, v0.1.17) — the "what's next" primitive, hardened
 *     against every phase value found across 12 real projects.
 *   - sweep's halt protocol — needs-a-person vs clears-itself.
 *   - `attentionFor` — how much of your time this is allowed to cost.
 */

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { attentionFor, CALIBRATION_ENUMS } from './profile.js';
import { LOOP_BOUNDED_PHASES } from './loop-ceiling.js';
import { atomicWrite } from './atomic-write.js';
import { parseBacklogRows } from './backlog.js';
import { readState, partitionCompletedPhases, PHASES } from './state.js';

export const QUEUE_REL = '.planning/DECISION-QUEUE.md';

/**
 * Gates that stop the loop NO MATTER WHAT the attention setting says.
 *
 * These are not an oversight and they are not tunable. Each was made
 * tier-independent by a specific decision, and an autonomy layer that quietly
 * overrode them would be re-litigating those decisions by omission — which is
 * exactly how `ship.md` came to carry a self-exemption that survived thirteen
 * releases. Sourced from that audit's inventory of tier-independent gates.
 */
export const FLOORS = Object.freeze([
  {
    id: 'ship-pr',
    at: 'SHIP',
    why: 'A pull request is how the change reaches main, and merge is delivery. `D-M5E17-5`; `ship.md` has no direct-to-main exemption.',
  },
  {
    id: 'ship-retro',
    at: 'SHIP',
    why: 'The Epic-close retrospective gate is explicitly "no bypass" — no flag, no env var, no extra-args trick (`D-E9-3`).',
  },
  {
    id: 'plan-drain-preview',
    at: 'PLAN',
    why: 'A drain write mutates the idea database; the diff is previewed and accepted before any write (`plan.md` R1 hard gate).',
  },
  {
    id: 'plan-drain-destructive',
    at: 'PLAN',
    why: 'delete/merge remove text and confirm per entry regardless of gate_strictness (`plan.md` R5 sub-gate).',
  },
  {
    id: 'resume-orphans',
    at: 'RESUME',
    why: 'Orphan detection is interactive by design (`D12`); the prompt IS the recovery mechanism.',
  },
]);

export function floorsFor(phase) {
  return FLOORS.filter((f) => f.at === phase);
}

/**
 * Can the loop take this step without a person?
 *
 * Fail-closed on every axis. An unreadable profile, an unknown phase, or a missing
 * attention setting yields `false` — a missing setting must never be the reason
 * something ran unattended. This is the opposite of the `B39` fail-open posture
 * used for *reporting*, and deliberately so: a detector that cannot look should
 * say so and continue; an actor that cannot tell should stop.
 */
export function canProceedUnattended(phase, profile, { hasFloor = null, loopStatus } = {}) {
  const attention = attentionFor(profile);
  const floors = hasFloor ?? floorsFor(phase).length > 0;

  if (floors) {
    return { proceed: false, reason: 'floor', attention, floors: floorsFor(phase) };
  }

  // THE LOOP CEILING, CHECKED BEFORE ATTENTION (`B76`).
  //
  // A ceiling is not a preference the attention dial can turn off. `unattended`
  // buys freedom from being ASKED; it does not buy an unbounded loop, and
  // `review.md`'s FAIL path returning straight to EXECUTE is precisely how one
  // arises. So this sits above the attention branches, next to the floors, and
  // is reached on every call rather than only on the unattended path.
  //
  // FAIL CLOSED ON NOT KNOWING. For a phase that loops, a caller that supplies
  // no `loopStatus` — or one derived from state this could not read — gets a
  // refusal, not a pass. That is this file's stated posture: a detector that
  // cannot look should say so and continue; an actor that cannot tell should
  // stop. `loop-unknown` is kept distinct from `loop-ceiling` so the halt says
  // which of the two happened instead of implying a count it never had.
  if (LOOP_BOUNDED_PHASES.includes(phase)) {
    if (!loopStatus) {
      return { proceed: false, reason: 'loop-unknown', attention, floors: [] };
    }
    if (loopStatus.atCeiling) {
      return { proceed: false, reason: 'loop-ceiling', attention, floors: [], loopStatus };
    }
  }
  if (attention === 'attended') {
    return { proceed: false, reason: 'attended', attention, floors: [] };
  }
  if (attention === 'checkpointed') {
    // Checkpointed confirms at phase boundaries and runs free inside a phase.
    return { proceed: false, reason: 'phase-boundary', attention, floors: [] };
  }
  return { proceed: true, reason: 'unattended', attention, floors: [] };
}

/** One queued decision, rendered for a human to answer later. */
export function formatQueuedDecision({ id, phase, question, recommendation, why, date }) {
  if (!id || !question) {
    throw new Error('formatQueuedDecision requires an id and a question.');
  }
  const lines = [
    `## ${id} — ${question}`,
    '',
    `**Phase:** ${phase ?? 'unknown'} · **Queued:** ${date ?? 'unknown'}`,
    '',
    `**Recommendation:** ${recommendation ?? '(none offered)'}`,
  ];
  // Every gray-area question in Signal already carries a recommendation — hiding it
  // is "failing to use the model's signal" (`references/question-patterns.md`). So a
  // queued decision without one is a bug in the caller, and says so out loud rather
  // than rendering a blank that reads like "no opinion".
  if (!recommendation) {
    lines.push('', '⚠ No recommendation was supplied. That is a defect in whatever queued this.');
  }
  if (why) lines.push('', `**Why it was queued rather than asked:** ${why}`);
  lines.push('', '**Answer:** _(unanswered)_', '');
  return lines.join('\n');
}

const QUEUE_HEADER = `# Decision queue

Decisions the loop reached, did **not** guess at, and parked for a person.

An entry here means the run continued past a question rather than blocking on it.
Nothing in this file has been acted on. Answer an entry by replacing the
placeholder on its **Answer** line; the loop reads answers on its next pass.

(That placeholder is deliberately not quoted here: it is the exact token the
parser keys on, and a header containing it would make the file's own preamble
look like an unanswered entry to anything scanning loosely.)

⚠ **A long queue is a signal, not a backlog.** If entries accumulate faster than
they are answered, the attention setting is wrong for this project — that is the
measurement this file exists to produce.

---
`;

export async function queueDecision(baseDir, decision) {
  const path = join(baseDir, QUEUE_REL);
  const entry = formatQueuedDecision(decision);
  const current = existsSync(path) ? await readFile(path, 'utf-8') : QUEUE_HEADER;
  const next = `${current.replace(/\s*$/, '')}\n\n${entry}`;
  await atomicWrite(path, next);
  return { path, id: decision.id };
}

export async function readQueue(baseDir) {
  const path = join(baseDir, QUEUE_REL);
  if (!existsSync(path)) return { path, entries: [], unanswered: 0 };
  const content = await readFile(path, 'utf-8');
  const entries = [];
  const re = /^## (\S+) — (.+)$/gm;
  let m;
  while ((m = re.exec(content)) !== null) {
    const start = m.index;
    const nextIdx = content.indexOf('\n## ', start + 1);
    const block = content.slice(start, nextIdx === -1 ? undefined : nextIdx);
    entries.push({
      id: m[1],
      question: m[2],
      answered: !block.includes('_(unanswered)_'),
    });
  }
  return { path, entries, unanswered: entries.filter((e) => !e.answered).length };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE FRONT END: what to work on, and what the run needs from you before it starts.
//
// Everything above this line decides whether the loop may take ONE MORE STEP.
// That is a stepper with an autopilot flag, and it is not what "drive the project"
// means. Driving is: pick the work, confirm it, ask everything blocking UP FRONT,
// then run. The first three of those did not exist — `/sig:drive` began at
// whatever phase STATE.md happened to name and never asked what it needed.
//
// Found by running it (2026-09-03) rather than by reading it, on the first
// end-to-end attempt against a real project.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * What this run could work on, best first. It PROPOSES; it never picks.
 *
 * WHY PROPOSE-AND-CONFIRM RATHER THAN AUTO-SELECT — the measurement said no to a
 * different mechanism. `LOOP-GOAL-DIRECTION.md` measured the best honest rule over
 * real BACKLOG rows at 77% precision / ~37% recall and recommended NOT building
 * automatic Epic selection. That verdict is about SILENT selection, where a wrong
 * pick becomes work nobody asked for. A ranked proposal behind an explicit "run
 * this one?" gate is a different mechanism: the person closes the recall gap by
 * naming something the list missed, and closes the precision gap by declining.
 * So the analysis is honoured, not ignored — what it forbade is the auto-pick.
 *
 * Resume beats start: an Epic already open with phases still to run is the work
 * in progress, and proposing a new one ahead of it is how two Epics end up half done.
 *
 * @param {string} baseDir
 * @returns {Promise<{candidates: Array<{id: string|null, title: string, source: string,
 *   line: number|null, why: string}>, cannotCheck: Array<{source: string, reason: string}>}>}
 */
/**
 * How much a backlog heading looks like a unit of WORK rather than a section of prose.
 *
 * Signals, most reliable first: a leading unit id (`M6.E4`, `B113`) is what the
 * repo's own vocabulary uses to name work; a `·`-delimited metadata tail is the
 * shape a groomed row carries (`· **roadmap** · medium · **filed 2026-09-01**`);
 * and a heading that reads as a dated reconciliation or a "what shipped" summary
 * is a record, not a task.
 *
 * This is a SORT KEY, never a filter. Every one of these signals is a convention
 * rather than a guarantee, and a wrong guess must cost a position in a list, not
 * a row's existence.
 */
function rankBacklogRow(row) {
  let rank = 0;
  // An explicit unit id outweighs EVERY convention signal combined (max 4 below),
  // deliberately: `M6.E4` / `B113` is the repo's own vocabulary for a defined unit
  // of work, where a tag only says a groomed row exists and still needs scoping.
  if (row.leadingId) rank += 5;
  if (/·/.test(row.text)) rank += 2;
  if (/\*\*(roadmap|hygiene|product call|verification)\*\*/i.test(row.text)) rank += 2;
  if (/\b(reconciliation|what shipped|since the snapshot|residual|closed by)\b/i.test(row.text)) rank -= 4;
  if (/\(\d{4}-\d{2}-\d{2}\)/.test(row.text)) rank -= 1;
  if (row.depth === 2) rank -= 1; // `##` is usually a section; rows sit deeper
  return rank;
}

export async function proposeEpicCandidates(baseDir) {
  const candidates = [];
  const cannotCheck = [];

  let state = null;
  try {
    state = await readState(baseDir);
  } catch (err) {
    cannotCheck.push({ source: 'STATE.md', reason: err.message });
  }

  if (state?.current_epic) {
    const { valid } = partitionCompletedPhases(state.completed_phases ?? []);
    const shipped = valid.some((e) => e.startsWith('SHIP '));
    if (!shipped) {
      candidates.push({
        id: state.current_epic,
        title: state.current_epic,
        source: 'STATE.md (open Epic)',
        line: null,
        why: `already open at ${state.phase ?? 'an unrecorded phase'} — finish it before starting new work`,
      });
    }
  }

  const backlogPath = join(baseDir, '.planning', 'BACKLOG.md');
  if (!existsSync(backlogPath)) {
    cannotCheck.push({ source: 'BACKLOG.md', reason: 'no file — nothing to pick from' });
  } else {
    try {
      const content = await readFile(backlogPath, 'utf-8');
      // maxDepth 4: this repository's own promoted rows sit at `####`, and a
      // depth-3 read returns zero of them. "No candidates" must mean no work,
      // never "the reader could not see that far down" (`B94`).
      const rows = parseBacklogRows(content, { maxDepth: 4 });
      const fromBacklog = [];
      for (const row of rows) {
        if (row.inDetails || row.discharged) continue;
        if (candidates.some((c) => c.id && c.id === row.leadingId)) continue;
        fromBacklog.push({
          id: row.leadingId,
          title: row.text,
          source: 'BACKLOG.md',
          line: row.line,
          why: 'open row in the groomed queue',
          rank: rankBacklogRow(row),
        });
      }
      // RANK, DO NOT FILTER. A live BACKLOG carries work rows and prose section
      // headings side by side, and no rule tells them apart reliably across
      // projects — Signal's own file is the minority shape, and filtering to fit
      // it is `B82`'s mistake (a rule written against one corpus that silently
      // drops real rows everywhere else). So a heading that does not look like a
      // work row sinks; it never disappears, and the total is reported.
      fromBacklog.sort((a, b) => b.rank - a.rank || a.line - b.line);
      candidates.push(...fromBacklog);
    } catch (err) {
      cannotCheck.push({ source: 'BACKLOG.md', reason: err.message });
    }
  }

  return { candidates, cannotCheck };
}

/** Sources the pre-flight pass consults. Named so a report can say what it looked at. */
export const PREFLIGHT_SOURCES = Object.freeze([
  'DECISION-QUEUE.md',
  'STATE.md blockers',
  'OPEN-QUESTIONS.md',
  'REQUIREMENTS unfilled markers',
]);

/**
 * Everything a person has to answer BEFORE the run starts.
 *
 * THIS IS THE PIECE THAT MAKES THE DIAL WORTH HAVING. A FULL-tier Epic was
 * measured at 48–86 synchronous touchpoints; `attention` decides whether the loop
 * PAUSES at them, and answers nothing about what the run will need. Asking those
 * questions up front, once, as a batch is what converts "stops constantly" into
 * "asked me once, then ran" — which is the behaviour, not the setting, that people
 * mean by driving.
 *
 * FAIL LOUD ON NOT LOOKING. A source that could not be read lands in `cannotCheck`
 * and NEVER in an empty `blocking` list. This module's stated posture is that an
 * actor which cannot tell should stop, and the alternative here is a run that
 * starts blind while reporting "nothing needed" — `B39`'s shape, at the moment it
 * costs the most.
 *
 * @param {string} baseDir
 * @param {{epic?: string|null}} [opts]
 * @returns {Promise<{blocking: Array<{source: string, question: string, detail: string|null}>,
 *   cannotCheck: Array<{source: string, reason: string}>, checked: string[]}>}
 */
export async function collectPreflight(baseDir, { epic = null } = {}) {
  const blocking = [];
  const cannotCheck = [];
  const checked = [];

  // 1. The decision queue — questions a PREVIOUS run parked. Answering them is
  //    the whole point of the file, and starting a new run over an unanswered
  //    queue is how the queue becomes a backlog nobody drains.
  try {
    const queue = await readQueue(baseDir);
    checked.push('DECISION-QUEUE.md');
    for (const entry of queue.entries) {
      if (entry.answered) continue;
      blocking.push({
        source: 'DECISION-QUEUE.md',
        question: entry.question,
        detail: `parked as ${entry.id} by an earlier run`,
      });
    }
  } catch (err) {
    cannotCheck.push({ source: 'DECISION-QUEUE.md', reason: err.message });
  }

  // 2. STATE blockers — recorded by a human as the thing stopping progress.
  try {
    const state = await readState(baseDir);
    checked.push('STATE.md blockers');
    for (const b of state?.blockers ?? []) {
      const text = typeof b === 'string' ? b : (b?.text ?? JSON.stringify(b));
      blocking.push({
        source: 'STATE.md',
        question: `Blocker still recorded: ${text}`,
        detail: typeof b === 'object' && b?.id ? `id ${b.id}` : null,
      });
    }
  } catch (err) {
    cannotCheck.push({ source: 'STATE.md blockers', reason: err.message });
  }

  // 3. Open questions naming this Epic. Scoped to the Epic ON PURPOSE — a project's
  //    standing questions are not this run's blockers, and hauling all of them into
  //    the batch is how a useful gate becomes one people click through.
  const oqPath = join(baseDir, '.planning', 'OPEN-QUESTIONS.md');
  if (!existsSync(oqPath)) {
    checked.push('OPEN-QUESTIONS.md (absent)');
  } else {
    try {
      const content = await readFile(oqPath, 'utf-8');
      checked.push('OPEN-QUESTIONS.md');
      if (epic) {
        for (const line of content.split('\n')) {
          const m = line.match(/^##\s+(.*)$/);
          if (!m) continue;
          const heading = m[1].trim();
          if (/^~~/.test(heading)) continue; // struck = answered
          if (!heading.includes(epic)) continue;
          blocking.push({
            source: 'OPEN-QUESTIONS.md',
            question: heading.length > 160 ? `${heading.slice(0, 157)}…` : heading,
            detail: `names ${epic}`,
          });
        }
      }
    } catch (err) {
      cannotCheck.push({ source: 'OPEN-QUESTIONS.md', reason: err.message });
    }
  }

  // 4. Unfilled markers in the Epic's own requirements — a run cannot build to a
  //    spec that still says [FILL IN], and discovering that mid-EXECUTE is the
  //    interruption this pass exists to move to the front.
  if (epic) {
    const reqPath = join(baseDir, '.planning', `${epic}-REQUIREMENTS.md`);
    if (!existsSync(reqPath)) {
      cannotCheck.push({
        source: 'REQUIREMENTS unfilled markers',
        reason: `no ${epic}-REQUIREMENTS.md on disk — the spec cannot be checked for gaps`,
      });
    } else {
      try {
        const content = await readFile(reqPath, 'utf-8');
        checked.push(`${epic}-REQUIREMENTS.md`);
        const markers = content.match(/\[(?:FILL IN|INFERRED)[^\]]*\]/g) ?? [];
        if (markers.length > 0) {
          blocking.push({
            source: `${epic}-REQUIREMENTS.md`,
            question: `${markers.length} unfilled marker(s) in the requirements — fill or confirm before building`,
            detail: markers.slice(0, 3).join(', '),
          });
        }
      } catch (err) {
        cannotCheck.push({ source: 'REQUIREMENTS unfilled markers', reason: err.message });
      }
    }
  } else {
    cannotCheck.push({
      source: 'REQUIREMENTS unfilled markers',
      reason: 'no Epic selected — nothing to check the spec of',
    });
  }

  return { blocking, cannotCheck, checked };
}

/**
 * The pre-flight result as a person reads it.
 *
 * "Could not check" gets its OWN line and is never folded into the clean case:
 * silence about blindness is the failure this whole pass is built against.
 */
export function formatPreflight({ blocking, cannotCheck, checked }) {
  const lines = [];
  if (blocking.length === 0) {
    lines.push(`Nothing blocking — checked ${checked.length} source(s).`);
  } else {
    lines.push(`${blocking.length} thing(s) needed before this run can go:`);
    blocking.forEach((b, i) => {
      lines.push(`  ${i + 1}. [${b.source}] ${b.question}`);
      if (b.detail) lines.push(`     ${b.detail}`);
    });
  }
  if (cannotCheck.length > 0) {
    lines.push('');
    lines.push(`⚠ ${cannotCheck.length} source(s) COULD NOT BE CHECKED — this is not "nothing found":`);
    for (const c of cannotCheck) lines.push(`  · ${c.source} — ${c.reason}`);
  }
  return lines.join('\n');
}

/**
 * The seven canonical phases, in flow order — `state.js`'s exported list, aliased.
 *
 * NOT a copy, deliberately. A second array would drift the moment a phase is
 * renamed or added, and `describeNextAction` validates against `PHASES`: the two
 * disagreeing about which phases are valid reintroduces the `recognized: false`
 * dead end this function exists to remove, one layer down. Caught in review after
 * the first version duplicated the literal and called the original private.
 */
export const CANONICAL_PHASES = PHASES;

/**
 * Where the chosen work STARTS.
 *
 * THE GAP THIS CLOSES, found on the second real run (2026-09-03). The front end
 * picks the work; steps 1–3 then read `state.phase` to decide what to run. Those
 * two were never connected, so a run that had just chosen something still keyed on
 * whatever phase STATE.md happened to hold — and where that value was not one of
 * the seven (`EXPLORING`, in the wild), `describeNextAction` returned
 * `recognized: false` and there was **no command to run at any attention level**.
 * Choosing the work and never saying where it starts leaves the same dead end the
 * front end was built to remove, one step later.
 *
 * It PROPOSES a phase and a reason. It does not write: the caller confirms and the
 * ordinary phase-transition write records it, so a stale phase is corrected
 * deliberately rather than silently overwritten by a command run to make progress.
 *
 * @param {object|null} state
 * @param {{source?: string}|null} candidate — the chosen work, from proposeEpicCandidates
 * @returns {{phase: string, why: string, changed: boolean, blocked: boolean}}
 */
export function resolveStartPhase(state, candidate) {
  const recorded = typeof state?.phase === 'string' ? state.phase.trim() : null;
  const recognized = recorded !== null && CANONICAL_PHASES.includes(recorded);
  const resuming = Boolean(candidate?.source?.includes('STATE.md'));

  if (resuming && recognized) {
    return {
      phase: recorded,
      why: `resuming work already at ${recorded}`,
      changed: false,
      blocked: false,
    };
  }

  if (resuming && !recognized) {
    // The one case that cannot be resolved from data. The Epic is mid-flight and
    // the record of where it got to is unreadable, so proposing a restart at
    // DISCUSS could silently discard finished phases. Say what is wrong, name the
    // value, and stop — this is `B70`'s shape and it needs a person.
    return {
      phase: 'DISCUSS',
      why:
        `STATE.md records phase "${recorded ?? '(none)'}", which is not one of ` +
        `${CANONICAL_PHASES.join(', ')}. This Epic is open, so the loop cannot tell how far ` +
        'it got — restarting at DISCUSS may discard completed phases. Set a real phase first.',
      changed: true,
      blocked: true,
    };
  }

  // Newly chosen work starts at the beginning of the flow, whatever the file says.
  // The recorded phase belongs to whatever ran last, and inheriting it is exactly
  // how a fresh unit of work ends up "resuming" someone else's position.
  return {
    phase: 'DISCUSS',
    why: recognized
      ? `new work — starts at DISCUSS (the recorded ${recorded} belongs to the previous unit)`
      : `new work — starts at DISCUSS (STATE.md's "${recorded ?? '(none)'}" is not a phase)`,
    changed: recorded !== 'DISCUSS',
    blocked: false,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// THE ROUTER: may this decision be taken without a person, or must it be parked?
//
// The rule is not invented here. `LOOP-ENGINEERING-ANALYSIS.md` states it as
// already existing in two established pieces, and this makes both executable:
//
//   Altitude     — plumbing / tooling / test-mechanics auto-resolve with sensible
//                  defaults; product / scope / positioning decisions queue. This is
//                  the standing "gate at product altitude" norm, made machine-readable.
//   Reversibility — calibration's own per-project vocabulary, applied per DECISION:
//                  trivial / moderate may be adopted; painful / irreversible queue.
//
// OR-COMPOSED, and the composition is the design. A decision queues if it is
// product-altitude OR irreversible; it is adopted only when it is BOTH plumbing
// AND reversible. Reversibility alone misses the case that matters most in
// practice — a product decision that is perfectly reversible, like picking a
// default tier for a new command: trivial to revert, and exactly the call a
// person wants to make.
// ─────────────────────────────────────────────────────────────────────────────

/** Reversibility terms — calibration's list, imported. Never a second copy (`#230`). */
export const ROUTE_REVERSIBILITY = CALIBRATION_ENUMS.reversibility;

/**
 * Altitude terms.
 *
 * Defined here because no existing vocabulary carries them: the norm has always
 * been prose (`discuss.md` cites it by name; it is a standing session instruction)
 * and this Epic is what makes it machine-readable. Two values, deliberately — a
 * scale would invite a judgement call at every ask, and the norm is binary: is
 * this mine to decide, or yours?
 */
export const ROUTE_ALTITUDE = Object.freeze(['plumbing', 'product']);

const ADOPTABLE_REVERSIBILITY = Object.freeze(['trivial', 'moderate']);

/**
 * Route one decision: adopt it, or park it for a person.
 *
 * FAIL CLOSED ON NOT KNOWING (`D-M6E6-4`). An absent or unrecognised value routes
 * to `queue`, never to `adopt`. The asymmetry decides it: a forgotten tag under
 * this rule costs one queue entry to answer, and under the alternative costs an
 * IRREVERSIBLE DECISION MADE SILENTLY — precisely the failure the rule exists to
 * prevent, arriving through an omission rather than a decision. It is also this
 * module's stated posture applied to a new axis: a detector that cannot look
 * should say so and continue; an actor that cannot tell should stop.
 *
 * Total: never throws, whatever it is handed.
 *
 * @param {{reversibility?: unknown, altitude?: unknown}} [decision]
 * @returns {{route: 'adopt'|'queue', why: string, missing: string[]}}
 */
export function routeDecision({ reversibility, altitude } = {}) {
  const missing = [];
  const knownReversibility = ROUTE_REVERSIBILITY.includes(reversibility);
  const knownAltitude = ROUTE_ALTITUDE.includes(altitude);
  if (!knownReversibility) missing.push('reversibility');
  if (!knownAltitude) missing.push('altitude');

  if (missing.length > 0) {
    // Name what is missing rather than only that something is: a queue entry
    // saying "untagged" tells the reader nothing about what to fix at the caller.
    const which = missing.length === 2 ? 'neither axis was tagged' : `${missing[0]} was not tagged`;
    return {
      route: 'queue',
      why: `Queued because ${which}, and an untagged decision is never adopted (\`D-M6E6-4\`).`,
      missing,
    };
  }

  const reversibleEnough = ADOPTABLE_REVERSIBILITY.includes(reversibility);
  const isPlumbing = altitude === 'plumbing';

  if (isPlumbing && reversibleEnough) {
    return {
      route: 'adopt',
      why: `Adopted: a ${altitude} decision that is ${reversibility} to undo.`,
      missing,
    };
  }

  // Name the deciding axis — and both when both would have queued it, so the
  // reader is not told a half-truth about why their question is sitting there.
  const reasons = [];
  if (!isPlumbing) reasons.push('it is a product-altitude call, which is yours to make');
  if (!reversibleEnough) reasons.push(`undoing it is ${reversibility}`);
  return {
    route: 'queue',
    why: `Queued because ${reasons.join(', and ')}.`,
    missing,
  };
}
